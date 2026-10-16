/**
 * Spalten der CSV-Dateien, Erkennung fremder Spaltennamen und Umwandlung
 * zwischen CSV-Zeilen und Datensätzen.
 */
import { planLesen, planText, schichtAusFeldern, type Schicht } from "../sim/dienst";
import { parseCsv, toCsv } from "./csv";
import {
  HOSPITAL_FLAGS,
  BEREICHE,
  KIND_LABEL,
  VEHICLE_CATEGORIES,
  ACTIVE_CATEGORIES,
  type Einsatzcode,
  type Einsatzvorlage,
  type Hospital,
  type HospitalFlag,
  type Kind,
  type KindMap,
  type Origin,
  type Poi,
  type Station,
  type Vehicle,
  type VehicleCategory,
} from "./model";

/** Spalten in der Reihenfolge, in der LeitWerk sie schreibt. */
export const COLUMNS: Record<Kind, string[]> = {
  stations: ["id", "name", "organisation", "typ", "ort", "bezirk", "adresse", "breitengrad", "laengengrad", "hinweis"],
  vehicles: ["id", "funkrufname", "kurzname", "kategorie", "typ", "aufbau", "modell", "dienststelle", "aktiv", "nachtflug", "dienstplan", "ersatz_fuer", "hinweis"],
  hospitals: ["id", "name", "kurzname", "ort", "breitengrad", "laengengrad", ...HOSPITAL_FLAGS, "bereiche", "hinweis"],
  pois: ["id", "name", "typ", "ort", "breitengrad", "laengengrad", "hinweis"],
  templates: ["id", "code", "adresse", "breitengrad", "laengengrad", "meldung", "patient_alter", "transport", "hinweis"],
  codes: ["id", "code", "name", "kategorie", "kapitel", "hinweis"],
};

/** Pflichtspalten je Datenart. */
const REQUIRED: Record<Kind, string[]> = {
  stations: ["name", "breitengrad", "laengengrad"],
  vehicles: ["funkrufname", "dienststelle"],
  hospitals: ["name", "breitengrad", "laengengrad"],
  pois: ["name", "breitengrad", "laengengrad"],
  templates: ["code", "breitengrad", "laengengrad"],
  codes: ["code"],
};

/** Andere Schreibweisen von Spaltennamen, die beim Import erkannt werden. */
const ALIASES: Record<string, string[]> = {
  id: ["id", "poiid", "unitid", "nummer", "nr", "kennung"],
  name: ["name", "bezeichnung", "titel", "beschreibung", "stichwort"],
  organisation: ["organisation", "org", "betreiber", "traeger"],
  typ: ["typ", "art", "fahrzeugtyp", "kategorieoriginal"],
  ort: ["ort", "stadt", "gemeinde"],
  bezirk: ["bezirk"],
  adresse: ["adresse", "strasse", "anschrift"],
  breitengrad: ["breitengrad", "lat", "latitude", "breite", "y"],
  laengengrad: ["laengengrad", "lon", "lng", "longitude", "laenge", "x"],
  hinweis: ["hinweis", "bemerkung", "notiz", "kommentar"],
  funkrufname: ["funkrufname", "rufname", "funkname", "callsign"],
  kurzname: ["kurzname", "kurzbezeichnung"],
  kategorie: ["kategorie", "kategorien", "fahrzeugkategorie", "stufe", "einsatzstufe"],
  kapitel: ["kapitel", "gruppe", "gruppenname", "protokoll", "hauptgruppe"],
  dienststelle: ["dienststelle", "dienststelleid", "wache", "station", "standort"],
  dienststelle_name: ["dienststellename"],
  aktiv: ["aktiv", "einsatzbereit"],
  nachtflug: ["nachtflug", "nachtflugtauglich", "nvg"],
  dienstplan: ["dienstplan", "dienstzeit", "dienstzeiten", "schichten", "schichtplan"],
  wochentage: ["wochentage", "wochentag", "tage"],
  beginn: ["beginn", "dienstbeginn", "schichtbeginn", "start"],
  ende: ["ende", "dienstende", "schichtende"],
  aufbau: ["aufbau", "groesse"],
  modell: ["modell", "fahrzeugmodell"],
  ersatz_fuer: ["ersatzfuer", "ersatzfuerhubschrauber", "ersatznef"],
  code: ["code", "ampds", "einsatzcode", "ampdscode"],
  meldung: ["meldung", "meldebild", "text"],
  patient_alter: ["patientalter", "alter"],
  transport: ["transport"],
  notfallambulanz: ["notfallambulanz", "notaufnahme", "zna", "notfall"],
  schockraum: ["schockraum", "schock"],
  unfallambulanz: ["unfallambulanz", "unfall", "unfallchirurgie", "traumatologie"],
  kinderambulanz: ["kinderambulanz", "kinder", "paediatrie"],
  intensiv_anaesthesie: ["intensivanaesthesie", "intensiv", "anaesthesie", "intensivstation"],
  neurologie: ["neurologie", "neuro", "strokeunit"],
  kinderintensiv: ["kinderintensiv", "picu"],
  neonatologie: ["neonatologie", "neo", "nicu"],
  hno: ["hno"],
  urologie: ["urologie", "uro"],
  bereiche: ["bereiche", "stationen", "ambulanzen", "stationenambulanzen"],
  gyn_geburtshilfe: ["gyngeburtshilfe", "gyn", "geburtshilfe", "gynaekologie", "gynaekologieundgeburtshilfe"],
};

export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

export function normName(s: string): string {
  return (
    normKey(s.replace(/bezirkstelle/gi, "bezirksstelle").replace(/sankt/gi, "st").replace(/öatmc/gi, "öamtc"))
      // Luftrettung: „ÖAMTC Christophorus 2“ = „ÖAMTC Luftrettungszentrum Christophorus 2“,
      // „ÖAMTC Christophorus Luftrettungszentrum Ost“ = „ÖAMTC Luftrettungszentrum Ost“
      .replace(/luftrettungszentrum/g, "")
      .replace(/christophorusost$/, "ost")
  );
}

const ALIAS_LOOKUP = new Map<string, string>();
for (const [canon, list] of Object.entries(ALIASES)) {
  for (const a of list) if (!ALIAS_LOOKUP.has(a)) ALIAS_LOOKUP.set(a, canon);
}

/** Ordnet Kopfzeilen-Spalten den LeitWerk-Spalten zu. */
function mapHeader(header: string[]): (string | null)[] {
  return header.map((h) => ALIAS_LOOKUP.get(normKey(h)) ?? null);
}

/** Errät anhand der Kopfzeile, welche Datenart eine Datei enthält. */
export function detectKind(text: string): Kind | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;
  const cols = new Set(mapHeader(rows[0]).filter((c): c is string => c !== null));
  if (cols.has("funkrufname")) return "vehicles";
  if (cols.has("code") && !cols.has("breitengrad")) return "codes";
  if (cols.has("code") && cols.has("breitengrad")) return "templates";
  if (HOSPITAL_FLAGS.some((f) => cols.has(f))) return "hospitals";
  if (cols.has("name") && cols.has("breitengrad")) {
    const typIdx = mapHeader(rows[0]).indexOf("typ");
    if (cols.has("organisation") || cols.has("bezirk")) return "stations";
    // Typ-Werte wie „Organisation/Wache“ oder „Luftrettung“ sprechen für Dienststellen
    if (typIdx >= 0 && rows.slice(1, 30).some((r) => /wache|rettung|leitstelle|stützpunkt/i.test(r[typIdx] ?? ""))) {
      return "stations";
    }
    return "stations";
  }
  return null;
}

export interface Issue {
  zeile: number;
  meldung: string;
}

export interface ImportResult<K extends Kind> {
  kind: K;
  records: KindMap[K][];
  fehler: Issue[];
  warnungen: Issue[];
  zeilen: number;
  spaltenErkannt: string[];
  spaltenIgnoriert: string[];
}

export interface ImportContext {
  /** Bereits vorhandene Dienststellen (für die Zuordnung von Fahrzeugen) */
  stations: Station[];
  /** Vorhandene Datensätze derselben Art: gleiche Einträge werden zusammengeführt statt verdoppelt */
  existing?: { id: string; name?: string; funkrufname?: string; kurzname?: string; code?: string }[];
  herkunft: Origin;
  herkunftDetail?: string;
  /** KTW zufällig auf KTW/KTW-B verteilen (Standard: ja; nicht bei den mitgelieferten Daten) */
  zufallKtw?: boolean;
}

class RowError extends Error {}

function parseCoord(v: string, what: "Breitengrad" | "Längengrad"): number {
  const n = Number(v.trim().replace(",", "."));
  if (v.trim() === "" || !Number.isFinite(n)) throw new RowError(`${what} „${v}“ ist keine Zahl`);
  return n;
}

function checkCoords(lat: number, lon: number, warn: (m: string) => void): [number, number] {
  const latOk = (x: number) => x >= 44 && x <= 52;
  const lonOk = (x: number) => x >= 7 && x <= 21;
  if (!latOk(lat) && !lonOk(lon) && latOk(lon) && lonOk(lat)) {
    warn("Breiten- und Längengrad waren vertauscht und wurden getauscht");
    return [lon, lat];
  }
  if (!latOk(lat) || !lonOk(lon)) {
    throw new RowError(`Koordinate ${lat}, ${lon} liegt außerhalb des Kartengebiets (Österreich und Nachbarn)`);
  }
  return [lat, lon];
}

const TRUE_WORDS = new Set(["ja", "j", "yes", "y", "x", "1", "true", "wahr"]);
const FALSE_WORDS = new Set(["nein", "n", "no", "0", "false", "falsch", ""]);

function parseBool(v: string, what: string): boolean {
  const k = v.trim().toLowerCase();
  if (TRUE_WORDS.has(k)) return true;
  if (FALSE_WORDS.has(k)) return false;
  throw new RowError(`${what}: „${v}“ verstehe ich nicht (erlaubt: ja / nein)`);
}

/** Leitet die Fahrzeugkategorie aus dem Originaltyp ab. */
export function categoryFromType(typ: string, funkrufname = ""): VehicleCategory {
  const t = typ.trim().toUpperCase();
  if (/ACN/.test(funkrufname.toUpperCase())) return "Sonstige";
  if (t === "NAH" || t.startsWith("RTH") || t.startsWith("NAH")) return "NAH";
  if (t === "RTW" || t === "RTW-C") return "RTW";
  if (["PHYSICIAN", "NEF", "NAW", "NOTARZT"].includes(t)) return "NEF";
  if (t.startsWith("KTW")) return "KTW";
  if (t === "SKTW" || t === "SRTW" || t === "SNAW" || t === "BEL" || t === "BIT") return t;
  if (t === "ITH" || t === "AIR ICU-AMB" || t === "AIR ICU AMB") return "ITH";
  if (t === "EL ÖBB" || t === "EL OEBB" || t === "EL OBB") return "EL ÖBB";
  // AMB Type I/II: nicht verwendet
  return "Sonstige";
}

function parseCategory(
  v: string,
  typ: string,
  funk: string,
  warn: (m: string) => void,
  derived: Map<string, number>,
): VehicleCategory {
  const k = v.trim();
  if (k === "") {
    const c = categoryFromType(typ, funk);
    const key = `${typ.trim() || "–"} → ${c}`;
    derived.set(key, (derived.get(key) ?? 0) + 1);
    return c;
  }
  const hit = VEHICLE_CATEGORIES.find((c) => c.toLowerCase() === k.toLowerCase());
  if (hit) return hit;
  const fallback = categoryFromType(k, funk);
  warn(`Kategorie „${k}“ unbekannt, verwendet: ${fallback}`);
  return fallback;
}

function normalizeStationType(v: string): string {
  const t = v.trim();
  if (/luft/i.test(t)) return "Luftrettung";
  if (/organisation\s*\/\s*wache|^wache$|rettungsdienst/i.test(t) || t === "") return "Rettungsdienst";
  if (/notarzt/i.test(t)) return "Notarztstützpunkt";
  if (/leitstelle/i.test(t)) return "Leitstelle";
  return t;
}

function slug(s: string): string {
  return normKey(s).slice(0, 40) || "x";
}

/** Typ vereinheitlichen: „RTW C“, „RTWC“ → „RTW-C“; „KTW B“ → „KTW-B“ */
export function typNormal(typ: string): string {
  const t = typ.trim();
  const k = t.toUpperCase().replace(/\s+/g, "");
  if (k === "RTW-C" || k === "RTWC") return "RTW-C";
  if (k === "RTW") return "RTW";
  if (k === "KTW-B" || k === "KTWB") return "KTW-B";
  if (k === "KTW") return "KTW";
  return t;
}

/** fester Zufallswert 0–1 je Text (gleiches Ergebnis bei jedem Import) */
export function streuung(text: string): number {
  let h = 2166136261;
  for (const c of normKey(text)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

/** „Sprinter“, „T6 Hochdach“, „Passat“ … → Modell-Kürzel */
function modellLesen(v: string): string | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/sprinter/.test(t)) return "sprinter_kurz";
  if (/hochdach/.test(t)) return "t6hoch";
  if (/passat/.test(t)) return "passat";
  if (/t6|transporter|bus/.test(t)) return "t6";
  return ["t6hoch", "sprinter_kurz", "passat", "t6"].includes(t) ? t : null;
}

function aufbauLesen(v: string): "klein" | "gross" | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  if (/gro(ß|ss)|crafter|sprinter/.test(t)) return "gross";
  if (/klein|t6|hochdach|transporter/.test(t)) return "klein";
  return null;
}

/**
 * Regel: An einer Dienststelle gibt es nur EINEN RTW-C. Weitere „RTW-C“ derselben Dienststelle sind
 * große RTW (gleiches Fahrzeug, aber kein C). Der mit dem kleinsten Funkrufnamen bleibt RTW-C.
 */
export function einRtwCJeDienststelle(fz: Vehicle[]): number {
  const proSt = new Map<string, Vehicle[]>();
  for (const v of fz) if (v.typ === "RTW-C") proSt.set(v.dienststelleId, [...(proSt.get(v.dienststelleId) ?? []), v]);
  let n = 0;
  for (const liste of proSt.values()) {
    liste.sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de", { numeric: true }));
    for (const v of liste.slice(1)) {
      v.typ = "RTW";
      v.aufbau = "gross";
      n++;
    }
  }
  return n;
}

/** Beim Aktualisieren eines vorhandenen Fahrzeugs: was die Datei nicht enthält, bleibt wie es war */
function uebernimmVorhandenes(v: Vehicle, alt: Partial<Vehicle> | undefined, spalten: (string | null)[]): void {
  if (!alt) return;
  const hat = (c: string) => spalten.includes(c);
  // Hubschrauber: in der Datei „Christophorus 2“, bei uns „99/002“ mit Kurzname
  if (alt.funkrufname && alt.kurzname && normKey(alt.kurzname) === normKey(v.funkrufname) && normKey(alt.funkrufname) !== normKey(v.funkrufname)) {
    v.kurzname = v.funkrufname;
    v.funkrufname = alt.funkrufname;
  }
  if (!hat("kurzname") && alt.kurzname && !v.kurzname) v.kurzname = alt.kurzname;
  if (!hat("nachtflug") && alt.nachtflug !== undefined) v.nachtflug = alt.nachtflug;
  // aktiv/inaktiv bleibt – außer die Kategorie hat sich geändert (z. B. „AMB Type II“ → KTW)
  if (!hat("aktiv") && alt.aktiv !== undefined && alt.kategorie === v.kategorie) v.aktiv = alt.aktiv;
  if (!hat("hinweis") && alt.hinweis) v.hinweis = alt.hinweis;
  if (!hat("beginn") && !hat("ende") && !hat("dienstplan") && alt.dienstplan) v.dienstplan = alt.dienstplan;
  if (!hat("aufbau") && alt.aufbau && v.typ === alt.typ) v.aufbau = alt.aufbau;
  if (!hat("ersatz_fuer") && alt.ersatzFuer) v.ersatzFuer = alt.ersatzFuer;
}

/** Liest eine CSV-Datei als Datensätze der gewünschten Art. */
export function importCsv<K extends Kind>(kind: K, text: string, ctx: ImportContext): ImportResult<K> {
  const rows = parseCsv(text);
  const result: ImportResult<K> = {
    kind,
    records: [],
    fehler: [],
    warnungen: [],
    zeilen: Math.max(0, rows.length - 1),
    spaltenErkannt: [],
    spaltenIgnoriert: [],
  };
  if (rows.length === 0) {
    result.fehler.push({ zeile: 1, meldung: "Die Datei ist leer" });
    return result;
  }

  const header = rows[0];
  const mapped = mapHeader(header);
  mapped.forEach((c, i) => {
    if (c && COLUMNS[kind].concat(["dienststelle_name"], kind === "vehicles" ? ["wochentage", "beginn", "ende"] : []).includes(c)) result.spaltenErkannt.push(`${header[i]} → ${c}`);
    else result.spaltenIgnoriert.push(header[i]);
  });
  const missing = REQUIRED[kind].filter((c) => !mapped.includes(c));
  if (missing.length > 0) {
    result.fehler.push({
      zeile: 1,
      meldung: `Pflichtspalte(n) fehlen für ${KIND_LABEL[kind]}: ${missing.join(", ")}`,
    });
    return result;
  }

  const stationById = new Map(ctx.stations.map((s) => [s.id, s]));
  const stationByName = new Map(ctx.stations.map((s) => [normName(s.name), s]));
  const usedIds = new Set<string>();
  const derived = new Map<string, number>();
  type Keyed = { name?: string; funkrufname?: string; kurzname?: string; code?: string };
  const keysOf = (r: Keyed): string[] =>
    (kind === "vehicles"
      ? [normKey(r.funkrufname ?? ""), normKey(r.kurzname ?? "")]
      : kind === "codes"
        ? [normKey(r.code ?? "")]
        : [normName(r.name ?? "")]
    ).filter(
      (k) => k !== "",
    );
  const existingIds = new Set((ctx.existing ?? []).map((e) => e.id));
  const existingByKey = new Map<string, string>();
  for (const e of ctx.existing ?? []) for (const k of keysOf(e)) if (!existingByKey.has(k)) existingByKey.set(k, e.id);
  let merged = 0;
  const proFunk = new Map<string, Vehicle>();

  for (let r = 1; r < rows.length; r++) {
    const zeile = r + 1;
    const get = (col: string): string => {
      const idx = mapped.indexOf(col);
      return idx >= 0 ? (rows[r][idx] ?? "").trim() : "";
    };
    const warn = (m: string) => result.warnungen.push({ zeile, meldung: m });
    try {
      let id = get("id");
      const base = { hinweis: get("hinweis"), herkunft: ctx.herkunft, herkunftDetail: ctx.herkunftDetail };
      let record: KindMap[Kind];

      if (kind === "codes") {
        const code = get("code");
        if (!code) throw new RowError("Code fehlt");
        const kategorie = get("kategorie");
        if (!kategorie) warn(`${code}: keine Kategorie (Stufe) – wird ohne Fahrzeugvorschlag verwendet`);
        id = id || code;
        const c: Einsatzcode = { ...base, id, code, name: get("name"), kategorie, kapitel: get("kapitel") };
        record = c;
      } else if (kind === "vehicles") {
        const funk = get("funkrufname");
        if (!funk) throw new RowError("Funkrufname fehlt");
        // Schicht aus dieser Zeile (Spalten Wochentage/Beginn/Ende oder Dienstplan)
        let schichten: Schicht[] | undefined;
        if (mapped.includes("beginn") || mapped.includes("ende")) {
          const sch = schichtAusFeldern(get("wochentage"), get("beginn"), get("ende"));
          if (sch.fehler) warn(`${funk}: ${sch.fehler} – Schicht übersprungen`);
          schichten = sch.schicht ? [sch.schicht] : [];
        } else if (mapped.includes("dienstplan")) {
          const pl = planLesen(get("dienstplan"));
          if (pl.fehler) warn(`${funk}: ${pl.fehler}`);
          schichten = pl.plan;
        }
        // weitere Zeile desselben Fahrzeugs = weitere Schicht
        const frueher = proFunk.get(normKey(funk));
        if (frueher) {
          if (schichten?.length) (frueher.dienstplan ??= []).push(...schichten);
          continue;
        }
        const ref = get("dienststelle") || get("dienststelle_name");
        const st = stationById.get(ref) ?? stationByName.get(normName(ref));
        if (!st) {
          throw new RowError(`Dienststelle „${ref}“ nicht gefunden – zuerst die Dienststellen importieren`);
        }
        let typ = typNormal(get("typ"));
        // KTW: zufällig KTW oder KTW-B (Zivildienst, ohne Blaulicht) – fest je Funkrufname
        if ((typ === "KTW" || typ === "KTW-B") && ctx.zufallKtw !== false) typ = streuung(funk) < 0.3 ? "KTW" : "KTW-B";
        const kategorie = parseCategory(get("kategorie"), typ, funk, warn, derived);
        const aufbau = aufbauLesen(get("aufbau")) ?? (typ === "RTW-C" ? "gross" : typ === "RTW" ? "klein" : undefined);
        const aktivRaw = get("aktiv");
        const aktiv = aktivRaw === "" ? ACTIVE_CATEGORIES.includes(kategorie) : parseBool(aktivRaw, "aktiv");
        id = id || `fz-${slug(funk)}`;
        const v: Vehicle = {
          ...base,
          id,
          funkrufname: funk,
          kurzname: get("kurzname") === funk ? "" : get("kurzname"),
          kategorie,
          typ,
          dienststelleId: st.id,
          aktiv,
          nachtflug: get("nachtflug") === "" ? false : parseBool(get("nachtflug"), "nachtflug"),
          ...(aufbau ? { aufbau } : {}),
          ...(get("ersatz_fuer") ? { ersatzFuer: get("ersatz_fuer") } : {}),
          ...(modellLesen(get("modell")) ? { modell: modellLesen(get("modell"))! } : {}),
          ...(schichten !== undefined ? { dienstplan: schichten } : {}),
        };
        proFunk.set(normKey(funk), v);
        record = v;
      } else if (kind === "templates") {
        const code = get("code");
        if (!code) throw new RowError("Code fehlt");
        const [lat, lon] = checkCoords(
          parseCoord(get("breitengrad"), "Breitengrad"),
          parseCoord(get("laengengrad"), "Längengrad"),
          warn,
        );
        const alterRaw = get("patient_alter");
        const alter = alterRaw === "" ? null : Number(alterRaw);
        if (alter !== null && (!Number.isFinite(alter) || alter < 0 || alter > 120)) {
          throw new RowError(`Patientenalter „${alterRaw}“ ungültig`);
        }
        const tr = get("transport");
        id = id || `ev-${slug(code + get("adresse"))}`;
        const t: Einsatzvorlage = {
          ...base,
          id,
          code,
          adresse: get("adresse"),
          lat,
          lon,
          meldung: get("meldung"),
          patientAlter: alter,
          transport: tr === "" ? null : parseBool(tr, "transport"),
        };
        record = t;
      } else {
        const name = get("name");
        if (!name) throw new RowError("Name fehlt");
        const [lat, lon] = checkCoords(
          parseCoord(get("breitengrad"), "Breitengrad"),
          parseCoord(get("laengengrad"), "Längengrad"),
          warn,
        );
        if (kind === "stations") {
          id = id || `ds-${slug(name)}`;
          const s: Station = {
            ...base,
            id,
            name,
            organisation: get("organisation"),
            typ: normalizeStationType(get("typ")),
            ort: get("ort"),
            bezirk: get("bezirk"),
            adresse: get("adresse"),
            lat,
            lon,
          };
          record = s;
        } else if (kind === "hospitals") {
          id = id || `kh-${slug(name)}`;
          const abteilungen = {} as Record<HospitalFlag, boolean>;
          for (const f of HOSPITAL_FLAGS) {
            abteilungen[f] = mapped.includes(f) ? parseBool(get(f), f) : false;
          }
          const bereiche = get("bereiche")
            .split(/[,\s]+/)
            .map((x) => x.trim().toUpperCase())
            .filter((x) => x in BEREICHE);
          const h: Hospital = { ...base, id, name, kurzname: get("kurzname"), ort: get("ort"), lat, lon, abteilungen, bereiche };
          record = h;
        } else {
          id = id || `poi-${slug(name)}`;
          const p: Poi = { ...base, id, name, typ: [get("typ"), get("kategorie")].filter(Boolean).join(", "), ort: get("ort"), lat, lon };
          record = p;
        }
      }

      // Gleicher Eintrag schon vorhanden (z. B. in den Standarddaten)? Dann dessen ID übernehmen.
      if (!existingIds.has(record.id)) {
        const match = keysOf(record as Keyed)
          .map((k) => existingByKey.get(k))
          .find((m) => m !== undefined);
        if (match && !usedIds.has(match)) {
          record.id = match;
          merged++;
          if (kind === "vehicles") uebernimmVorhandenes(record as Vehicle, (ctx.existing ?? []).find((e) => e.id === match) as Partial<Vehicle> | undefined, mapped);
        }
      }
      if (usedIds.has(record.id)) {
        let n = 2;
        while (usedIds.has(`${record.id}-${n}`)) n++;
        warn(`ID „${record.id}“ doppelt in der Datei, verwendet: ${record.id}-${n}`);
        record.id = `${record.id}-${n}`;
      }
      usedIds.add(record.id);
      (result.records as KindMap[Kind][]).push(record);
    } catch (e) {
      if (e instanceof RowError) result.fehler.push({ zeile, meldung: e.message });
      else throw e;
    }
  }
  if (kind === "vehicles") {
    const n = einRtwCJeDienststelle(result.records as Vehicle[]);
    if (n) result.warnungen.unshift({ zeile: 0, meldung: `Je Dienststelle gibt es nur einen RTW-C – ${n} weitere RTW-C sind jetzt „RTW (Großraum)“` });
  }
  if (derived.size > 0) {
    const parts = [...derived.entries()].map(([k, n]) => `${k} (${n}×)`);
    result.warnungen.unshift({ zeile: 0, meldung: `Kategorie aus dem Fahrzeugtyp abgeleitet: ${parts.join(", ")}` });
  }
  if (merged > 0) {
    result.warnungen.unshift({
      zeile: 0,
      meldung: `${merged} Einträge gibt es schon (gleicher ${kind === "vehicles" ? "Funkrufname" : kind === "codes" ? "Code" : "Name"}) – sie werden aktualisiert statt doppelt angelegt`,
    });
  }
  return result;
}

function fmtCoord(n: number): string {
  return n.toFixed(6);
}

/** Wandelt Datensätze in CSV-Text (Format von LeitWerk). */
export function exportCsv<K extends Kind>(kind: K, records: KindMap[K][], stations: Station[] = []): string {
  const header = [...COLUMNS[kind]];
  if (kind === "vehicles") header.push("dienststelle_name");
  const stationName = new Map(stations.map((s) => [s.id, s.name]));
  const rows = (records as KindMap[Kind][]).map((rec) => {
    const v: Record<string, string> = { id: rec.id, hinweis: rec.hinweis };
    if (kind === "codes") {
      const c = rec as Einsatzcode;
      Object.assign(v, { code: c.code, name: c.name, kategorie: c.kategorie, kapitel: c.kapitel });
    } else if (kind === "vehicles") {
      const f = rec as Vehicle;
      Object.assign(v, {
        funkrufname: f.funkrufname,
        kurzname: f.kurzname,
        kategorie: f.kategorie,
        typ: f.typ,
        dienststelle: f.dienststelleId,
        aktiv: f.aktiv ? "ja" : "nein",
        nachtflug: f.nachtflug ? "ja" : "nein",
        aufbau: f.aufbau === "gross" ? "groß" : f.aufbau === "klein" ? "klein" : "",
        modell: f.modell ?? "",
        dienstplan: planText(f.dienstplan) || "24/7",
        ersatz_fuer: f.ersatzFuer ?? "",
        dienststelle_name: stationName.get(f.dienststelleId) ?? "",
      });
    } else if (kind === "templates") {
      const t = rec as Einsatzvorlage;
      Object.assign(v, {
        code: t.code,
        adresse: t.adresse,
        breitengrad: fmtCoord(t.lat),
        laengengrad: fmtCoord(t.lon),
        meldung: t.meldung,
        patient_alter: t.patientAlter === null ? "" : String(t.patientAlter),
        transport: t.transport === null ? "" : t.transport ? "ja" : "nein",
      });
    } else {
      const g = rec as Station | Hospital | Poi;
      Object.assign(v, { name: g.name, breitengrad: fmtCoord(g.lat), laengengrad: fmtCoord(g.lon) });
      if (kind === "stations") {
        const s = rec as Station;
        Object.assign(v, { organisation: s.organisation, typ: s.typ, ort: s.ort, bezirk: s.bezirk, adresse: s.adresse });
      } else if (kind === "hospitals") {
        const h = rec as Hospital;
        Object.assign(v, { kurzname: h.kurzname, ort: h.ort });
        for (const f of HOSPITAL_FLAGS) v[f] = h.abteilungen[f] ? "ja" : "nein";
        v.bereiche = (h.bereiche ?? []).join(", ");
      } else {
        const p = rec as Poi;
        Object.assign(v, { typ: p.typ, ort: p.ort });
      }
    }
    return header.map((c) => v[c] ?? "");
  });
  return toCsv(header, rows);
}
