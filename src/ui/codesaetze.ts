/**
 * Eigene Codesätze – ab v0.76 getrennt für Notrufe (RD) und für Krankentransporte/Überstellungen (KT/SEK):
 *  - RD:     Abfrageschema/RD/<Name>.json (Abfrage) und/oder Codelisten/RD/<Name>.csv (Codes)
 *  - KT/SEK: Abfrageschema/Krankentransport_Sekundärtransporte/<Name>.json (Fragen der KT-Hotline)
 *            und/oder Codelisten/Krankentransport_Sekundärtransporte/<Name>.json (Codes mit Bedingungen)
 * Gleicher Name = ein Satz. Beide Bereiche sind einzeln wählbar; das eingebaute LeitWerk-System ist immer wählbar.
 * Im Multiplayer gilt, was der Host gewählt hat.
 */
import { istSchema, type Schema } from "../abfrage/schema";
import { pruefeCodesystem } from "../abfrage/codesystem";
import { importCsv } from "../data/schema";
import { parseCsv, toCsv } from "../data/csv";
import type { Einsatzcode } from "../data/model";
import { store } from "../data/store";
import { standardCodesystem } from "../data/standard";
import { ablageLesen, ablageListe, ablageLoeschen, ablageName, ablageSpeichern, type AblageOrdner } from "../net/ablage";
import { decodeText } from "../platform";
import { KT_BED_KEYS, KT_BEDINGUNGEN, pruefeKtSatz, type KtAbfrageFrage, type KtBedKey, type KtCodeBed, type KtCodeDef } from "../sim/ktBedingungen";
import { standardKtAbfrage } from "../sim/ktCodes";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { ktEditorOeffnen } from "./ktCodeEditor";

export const RECHTLICHER_HINWEIS =
  "Aus rechtlichen Gründen können wir die echten Einsatzcodes und Abfrageschemas leider nicht mitliefern. LeitWerk bringt deshalb ein eigenes Codesystem mit, das sich ähnlich spielt. Du kannst aber jederzeit deine eigene Codeliste und dein eigenes Abfrageschema einbauen.";

export type Bereich = "rd" | "kt";

export const ORDNER: Record<Bereich, { abfrage: AblageOrdner; codes: AblageOrdner; codesEndung: RegExp }> = {
  rd: { abfrage: "Abfrageschema/RD", codes: "Codelisten/RD", codesEndung: /\.(csv|txt)$/i },
  kt: { abfrage: "Abfrageschema/Krankentransport_Sekundärtransporte", codes: "Codelisten/Krankentransport_Sekundärtransporte", codesEndung: /\.json$/i },
};

export interface CodeSatz {
  bereich: Bereich;
  name: string;
  /** Dateiname im Abfrage-Ordner */
  schema?: string;
  /** Dateiname im Codes-Ordner */
  codes?: string;
  /** im Editor als Entwurf gespeichert (noch nicht spielbar) */
  entwurf?: boolean;
  geaendert: number;
}

const LS_AKTIV = "lw.codesatz";
const basis = (datei: string) => datei.replace(/\.(json|csv|txt)$/i, "");

export function aktivMerken(name: string | null): void {
  try {
    if (name) localStorage.setItem(LS_AKTIV, name);
    else localStorage.removeItem(LS_AKTIV);
  } catch {
    /* egal */
  }
}

/** Name des aktiven eigenen RD-Satzes (null = eingebautes LeitWerk-Codesystem) */
export function aktiverSatz(): string | null {
  const eigen = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard");
  if (!eigen) return null;
  try {
    return localStorage.getItem(LS_AKTIV) ?? (store.schemaRoh?.name || "Eigener Satz");
  } catch {
    return store.schemaRoh?.name || "Eigener Satz";
  }
}

/** Name des aktiven eigenen KT-/SEK-Satzes (null = eingebaut) */
export function aktiverKtSatz(): string | null {
  const k = store.ktSatzRoh;
  return k ? k.name || "Eigener Satz" : null;
}

const aktivIn = (b: Bereich) => (b === "rd" ? aktiverSatz() : aktiverKtSatz());

/** Alle gespeicherten Sätze eines Bereichs */
export async function satzListe(bereich: Bereich = "rd"): Promise<CodeSatz[]> {
  const o = ORDNER[bereich];
  const m = new Map<string, CodeSatz>();
  const nimm = (name: string, t: number) => {
    const s = m.get(name.toLowerCase()) ?? { bereich, name, geaendert: 0 };
    s.geaendert = Math.max(s.geaendert, t);
    m.set(name.toLowerCase(), s);
    return s;
  };
  for (const d of await ablageListe(o.abfrage).catch(() => [])) if (/\.json$/i.test(d.datei)) nimm(basis(d.datei), d.geaendert).schema = d.datei;
  for (const d of await ablageListe(o.codes).catch(() => [])) if (o.codesEndung.test(d.datei)) nimm(basis(d.datei), d.geaendert).codes = d.datei;
  // Entwürfe erkennen
  for (const s of m.values()) {
    for (const [ordner, datei] of [
      [o.abfrage, s.schema],
      [bereich === "kt" ? o.codes : null, s.codes],
    ] as const) {
      if (!ordner || !datei) continue;
      try {
        if ((JSON.parse(await ablageLesen(ordner, datei)) as { entwurf?: boolean }).entwurf) s.entwurf = true;
      } catch {
        /* egal */
      }
    }
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Zurück zum eingebauten System (RD bzw. KT/SEK) */
export function eingebautAktivieren(bereich: Bereich = "rd"): void {
  if (bereich === "kt") {
    store.setKtSatz(null);
    lsSetzen(lsTeil("ktCodes"), null);
    lsSetzen(lsTeil("ktAbfrage"), null);
    return;
  }
  lsSetzen(lsTeil("rdCodes"), null);
  lsSetzen(lsTeil("rdAbfrage"), null);
  store.setSchema(null);
  store.removeMany("codes", store.list("codes").filter((c) => c.herkunft !== "standard").map((c) => c.id));
  aktivMerken(null);
}

/** Codeliste (CSV) lesen; Fehlertext oder Codes */
export function codesLesen(text: string, datei: string) {
  const r = importCsv("codes", text, { stations: [], existing: [], herkunft: "import", herkunftDetail: datei });
  if (!r.records.length) return { fehler: `${datei}: keine Codes erkannt (nötig ist die Spalte „Code“, dazu Name, Kategorie, Kapitel)` };
  return { codes: r.records, fehlerZeilen: r.fehler.length };
}

/** RD-Abfrageschema lesen (ein KT-Teil darin zählt nicht – KT/SEK ist eigener Bereich) */
export function rdSchemaLesen(text: string, datei: string): Schema {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  if (!istSchema(roh)) throw new Error(`${datei} ist kein gültiges Abfrageschema (es fehlen „kapitel“, „globale_fragen“ oder „codes“)`);
  const s = roh as Schema & { kt?: unknown };
  delete s.kt;
  return s;
}

/** KT-/SEK-Codes (JSON: { codes: [...] } oder eine Liste; ab Beta 69 auch CSV – siehe ktCodesCsvLesen) */
export function ktCodesLesen(text: string, datei: string): KtCodeDef[] {
  if (/\.(csv|txt)$/i.test(datei) || !/^\s*[[{]/.test(text.replace(/^﻿/, ""))) return ktCodesCsvLesen(text, datei);
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  const l = Array.isArray(roh) ? roh : (roh as { codes?: unknown })?.codes;
  if (!Array.isArray(l) || !l.length || !l.every((c) => c && typeof (c as KtCodeDef).code === "string" && typeof (c as KtCodeDef).bed === "object"))
    throw new Error(`${datei}: keine KT-/SEK-Codes erkannt (nötig: „codes“ mit „code“, „name“ und „bed“ – so, wie der Editor speichert)`);
  return l as KtCodeDef[];
}

/** KT-Abfrage (JSON: { abfrage: [...] } oder eine Liste) */
export function ktAbfrageLesen(text: string, datei: string): KtAbfrageFrage[] {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  const l = Array.isArray(roh) ? roh : (roh as { abfrage?: unknown })?.abfrage;
  if (!Array.isArray(l) || !l.length || !l.every((f) => f && typeof (f as KtAbfrageFrage).text === "string" && typeof (f as KtAbfrageFrage).id === "string"))
    throw new Error(`${datei}: keine Fragen erkannt (nötig: „abfrage“ mit „id“ und „text“ je Frage)`);
  return l as KtAbfrageFrage[];
}

// ------------------------------------------------------------------ KT-/SEK-Codes als CSV (Beta 69)

/** Spalten der KT-CSV: Code, Name, Kapitel, dann je Bedingung eine Spalte (leer = beliebig) */
export const KT_CSV_KOPF = ["Code", "Name", "Kapitel", ...KT_BED_KEYS.map((k) => KT_BEDINGUNGEN[k].label)];

const kNorm = (s: string) => s.toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");

/** Wert einer Bedingung aus der CSV: Schlüssel („zum_kh“) oder Text („zum Krankenhaus / Arzt“); leer/„beliebig“/„*“ = nicht festgelegt */
function bedWert(k: KtBedKey, roh: string, wo: string): string | undefined {
  const v = roh.trim();
  if (!v || v === "*" || /^(beliebig|egal\s*\(beliebig\)|-)$/i.test(v)) return undefined;
  const werte = KT_BEDINGUNGEN[k].werte as Record<string, string>;
  const n = kNorm(v);
  for (const [key, label] of Object.entries(werte)) if (kNorm(key) === n || kNorm(label) === n) return key;
  throw new Error(`${wo}: „${v}“ ist kein Wert für ${KT_BEDINGUNGEN[k].label} (möglich: ${Object.values(werte).join(", ")})`);
}

/**
 * KT-/SEK-Codes aus einer CSV (Spalten wie die Vorlage: Code; Name; Kapitel; Fahrt; Therapie; Lage; …).
 * Eine Zeile ohne Bedingungen, deren Code es eingebaut gibt, bekommt dessen Bedingungen.
 */
export function ktCodesCsvLesen(text: string, datei: string): KtCodeDef[] {
  const zeilen = parseCsv(text).filter((z) => z.some((x) => x.trim()) && !z[0]?.trim().startsWith("#"));
  if (zeilen.length < 2) throw new Error(`${datei}: keine KT-/SEK-Codes erkannt (Kopfzeile und mindestens ein Code nötig – siehe Vorlage)`);
  const kopf = zeilen[0].map((x) => kNorm(x));
  const spalte = (namen: string[]) => kopf.findIndex((k) => namen.some((n) => kNorm(n) === k));
  const iCode = spalte(["code"]);
  if (iCode < 0) throw new Error(`${datei}: Spalte „Code“ fehlt (Kopfzeile wie in der Vorlage)`);
  const iName = spalte(["name", "bezeichnung"]);
  const iKap = spalte(["kapitel", "gruppe"]);
  const iBed = KT_BED_KEYS.map((k) => [k, spalte([k, KT_BEDINGUNGEN[k].label])] as const).filter(([, i]) => i >= 0);
  const eingebaut = new Map(eingebauteKtCodes().map((c) => [c.code.toUpperCase(), c]));
  const out: KtCodeDef[] = [];
  zeilen.slice(1).forEach((z, n) => {
    const code = (z[iCode] ?? "").trim();
    if (!code) return;
    const wo = `${datei}, Zeile ${n + 2} (${code})`;
    const bed: KtCodeBed = {};
    for (const [k, i] of iBed) {
      const v = bedWert(k, z[i] ?? "", wo);
      if (v !== undefined) (bed as Record<string, string>)[k] = v;
    }
    const std = eingebaut.get(code.toUpperCase());
    const name = (iName >= 0 ? z[iName] : "")?.trim() || std?.name || code;
    const kapitel = (iKap >= 0 ? z[iKap] : "")?.trim() || std?.kapitel || "";
    out.push({ code, name, ...(kapitel ? { kapitel } : {}), bed: Object.keys(bed).length ? bed : { ...(std?.bed ?? {}) } });
  });
  if (!out.length) throw new Error(`${datei}: keine KT-/SEK-Codes erkannt (Spalte „Code“ ist leer)`);
  return out;
}

/** Vorlage für KT-/SEK-Codes: die eingebauten Codes mit allen Bedingungen (Werte als Text) */
export function ktCodesVorlage(codes: KtCodeDef[] = eingebauteKtCodes()): string {
  return toCsv(
    KT_CSV_KOPF,
    codes.map((c) => [c.code, c.name, c.kapitel ?? "", ...KT_BED_KEYS.map((k) => (c.bed[k] ? ((KT_BEDINGUNGEN[k].werte as Record<string, string>)[c.bed[k]!] ?? c.bed[k]!) : ""))]),
  );
}

/** Vorlage für die Notruf-Codeliste: die eingebauten Codes */
export function rdCodesVorlage(): string {
  const s = standardCodesystem();
  return toCsv(["Code", "Name", "Kategorie", "Kapitel"], Object.entries(s.codes).map(([code, x]) => [code, x.name, x.kategorie, x.kapitel]));
}

// ------------------------------------------------------------------ Teile: Codes und Abfrage getrennt wählbar (Beta 69)

export type Teil = "rdCodes" | "rdAbfrage" | "ktCodes" | "ktAbfrage";

export const TEILE: Record<Teil, { bereich: Bereich; art: "codes" | "abfrage"; ordner: AblageOrdner; endung: RegExp; titel: string }> = {
  rdCodes: { bereich: "rd", art: "codes", ordner: ORDNER.rd.codes, endung: /\.(csv|txt)$/i, titel: "Notruf-Codes" },
  rdAbfrage: { bereich: "rd", art: "abfrage", ordner: ORDNER.rd.abfrage, endung: /\.json$/i, titel: "Notruf-Abfrage" },
  ktCodes: { bereich: "kt", art: "codes", ordner: ORDNER.kt.codes, endung: /\.json$/i, titel: "KT/SEK-Codes" },
  ktAbfrage: { bereich: "kt", art: "abfrage", ordner: ORDNER.kt.abfrage, endung: /\.json$/i, titel: "KT-Abfrage" },
};

export interface TeilDatei {
  datei: string;
  name: string;
  geaendert: number;
  entwurf?: boolean;
}

const lsTeil = (t: Teil) => `lw.aktiv.${t}`;
function lsLesen(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSetzen(k: string, v: string | null): void {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* egal */
  }
}

/** Dateien eines Teils (Entwürfe aus dem KT-Editor markiert) */
export async function teilListe(t: Teil): Promise<TeilDatei[]> {
  const d = TEILE[t];
  const l = (await ablageListe(d.ordner).catch(() => [])).filter((x) => d.endung.test(x.datei));
  const out: TeilDatei[] = [];
  for (const x of l) {
    const e: TeilDatei = { datei: x.datei, name: basis(x.datei), geaendert: x.geaendert };
    if (d.bereich === "kt") {
      try {
        if ((JSON.parse(await ablageLesen(d.ordner, x.datei)) as { entwurf?: boolean }).entwurf) e.entwurf = true;
      } catch {
        /* egal */
      }
    }
    out.push(e);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Aktive Datei eines Teils (null = eingebaut) */
export function aktivDatei(t: Teil): string | null {
  if (t === "rdAbfrage") {
    if (store.schemaIstStandard) return null;
    const alt = lsLesen(LS_AKTIV);
    return lsLesen(lsTeil(t)) ?? (alt ? `${alt}.json` : null) ?? (store.schemaRoh?.name ? `${store.schemaRoh.name}.json` : "Eigenes Abfrageschema");
  }
  if (t === "rdCodes") {
    const c = store.list("codes").find((x) => x.herkunft !== "standard" && /\.(csv|txt)$/i.test(x.herkunftDetail ?? ""));
    return c ? c.herkunftDetail! : null;
  }
  const k = store.ktSatzRoh;
  const teil = t === "ktCodes" ? k?.codes : k?.abfrage;
  if (!k || !Array.isArray(teil) || !teil.length) return null;
  return lsLesen(lsTeil(t)) ?? `${k.name || "Eigener Satz"}.json`;
}

/** Abfrageschema übernehmen (Codes daraus in die Codeliste, neue Einsatzstufen ergänzen); Rückgabe: Anzahl neuer Stufen */
export function schemaAnwenden(schema: Schema, dateiname: string): number {
  const vorhanden = new Map(store.list("codes").map((x) => [x.code.toUpperCase(), x.id]));
  const liste: Einsatzcode[] = Object.entries(schema.codes ?? {}).map(([code, x]) => ({
    id: vorhanden.get(code.toUpperCase()) ?? code,
    code,
    name: x.name,
    kategorie: x.kategorie,
    kapitel: x.kapitel,
    hinweis: "",
    herkunft: "import",
    herkunftDetail: dateiname,
  }));
  store.setSchema(schema);
  if (liste.length) store.upsert("codes", liste);
  const neu = (schema.einsatzstufen ?? []).filter((x) => x?.stufe && !store.settings.stufen.some((st) => st.stufe === x.stufe));
  if (neu.length) {
    const set = structuredClone(store.settings);
    for (const x of neu)
      set.stufen.push({
        stufe: x.stufe,
        rettungsmittel: x.rettungsmittel ?? "",
        nfsErforderlich: !!x.nfs_erforderlich,
        notarzt: x.notarzt === "nef" || x.notarzt === "schnellster" ? x.notarzt : "nein",
        sondersignal: !!x.sondersignal,
        kategorie: x.kategorie === "kritisch" || x.kategorie === "dringend" || x.kategorie === "stabil" ? x.kategorie : x.notarzt === "nef" || x.notarzt === "schnellster" ? "kritisch" : x.sondersignal ? "dringend" : "stabil",
        transportProzent: Math.max(0, Math.min(100, Number(x.transport_prozent ?? 70))),
      });
    store.setSettings(set);
  }
  return neu.length;
}

/** RD neu zusammensetzen: erst eingebaut, dann Abfrageschema, dann Codeliste (die Codeliste gewinnt bei Name und Kategorie) */
function rdAnwenden(schema: { datei: string; schema: Schema } | null, codes: { datei: string; liste: Einsatzcode[] } | null): number {
  eingebautAktivieren("rd");
  const stufen = schema ? schemaAnwenden(schema.schema, schema.datei) : 0;
  if (codes) {
    const vorhanden = new Map(store.list("codes").map((x) => [x.code.toUpperCase(), x.id]));
    store.upsert("codes", codes.liste.map((x) => ({ ...x, id: vorhanden.get(x.code.toUpperCase()) ?? x.id, herkunft: "import", herkunftDetail: codes.datei })));
  }
  lsSetzen(lsTeil("rdAbfrage"), schema?.datei ?? null);
  lsSetzen(lsTeil("rdCodes"), codes?.datei ?? null);
  aktivMerken(schema ? basis(schema.datei) : codes ? basis(codes.datei) : null);
  return stufen;
}

/** KT/SEK neu zusammensetzen (fehlt ein Teil, gilt der eingebaute); prüft den Satz */
function ktAnwenden(codes: { datei: string; liste: KtCodeDef[] } | null, abfrage: { datei: string; liste: KtAbfrageFrage[] } | null): void {
  if (!codes && !abfrage) {
    store.setKtSatz(null);
    lsSetzen(lsTeil("ktCodes"), null);
    lsSetzen(lsTeil("ktAbfrage"), null);
    return;
  }
  const r = pruefeKtSatz({ codes: codes?.liste ?? eingebauteKtCodes(), abfrage: abfrage?.liste }, standardKtAbfrage());
  if (r.fehler.length) throw new Error(`Passt so nicht zusammen (${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"}: ${r.fehler[0]}) – im KT-Code-Editor bearbeiten`);
  const namen = [...new Set([codes ? basis(codes.datei) : "", abfrage ? basis(abfrage.datei) : ""].filter(Boolean))];
  store.setKtSatz({ name: namen.join(" + "), ...(codes ? { codes: codes.liste } : {}), ...(abfrage ? { abfrage: abfrage.liste } : {}) });
  lsSetzen(lsTeil("ktCodes"), codes?.datei ?? null);
  lsSetzen(lsTeil("ktAbfrage"), abfrage?.datei ?? null);
}

async function entwurfPruefen(t: Teil, datei: string, text: string): Promise<void> {
  if (TEILE[t].bereich !== "kt") return;
  try {
    if ((JSON.parse(text) as { entwurf?: boolean }).entwurf) throw new Error(`„${basis(datei)}“ ist ein Entwurf – erst im KT-Code-Editor fertigstellen`);
  } catch (e) {
    if (String((e as Error).message).includes("Entwurf")) throw e;
  }
}

/**
 * Einen Teil umschalten (datei = null: eingebaut). Der andere Teil desselben Bereichs bleibt, wie er ist.
 * Rückgabe: Text für die Rückmeldung.
 */
export async function teilAktivieren(t: Teil, datei: string | null): Promise<string> {
  const d = TEILE[t];
  const text = datei ? await ablageLesen(d.ordner, datei) : null;
  if (datei && text !== null) await entwurfPruefen(t, datei, text);
  if (d.bereich === "rd") {
    // der andere Teil aus dem Speicher (nicht neu aus der Datei)
    const abD = t === "rdAbfrage" ? datei : aktivDatei("rdAbfrage");
    const coD = t === "rdCodes" ? datei : aktivDatei("rdCodes");
    let schema: { datei: string; schema: Schema } | null = null;
    if (abD) schema = { datei: abD, schema: t === "rdAbfrage" ? rdSchemaLesen(text!, abD) : structuredClone(store.schemaRoh!) };
    let codes: { datei: string; liste: Einsatzcode[] } | null = null;
    if (coD) {
      if (t === "rdCodes") {
        const r = codesLesen(text!, coD);
        if ("fehler" in r) throw new Error(r.fehler);
        codes = { datei: coD, liste: r.codes! };
      } else codes = { datei: coD, liste: store.list("codes").filter((x) => x.herkunftDetail === coD).map((x) => ({ ...x })) };
    }
    const stufen = rdAnwenden(schema?.schema ? schema : null, codes);
    const was = t === "rdAbfrage" ? (abD ? `Abfrageschema „${basis(abD)}“ aktiv` : "Eingebaute Abfrage aktiv") : coD ? `Codeliste „${basis(coD)}“ aktiv · ${codes!.liste.length} Codes` : "Eingebaute Codes aktiv";
    return `${was}${stufen ? ` · ${stufen} neue Einsatzstufen` : ""}`;
  }
  const k = store.ktSatzRoh;
  const coD = t === "ktCodes" ? datei : aktivDatei("ktCodes");
  const abD = t === "ktAbfrage" ? datei : aktivDatei("ktAbfrage");
  const codes = coD ? { datei: coD, liste: t === "ktCodes" ? ktCodesLesen(text!, coD) : ((k?.codes ?? []) as KtCodeDef[]) } : null;
  const abfrage = abD ? { datei: abD, liste: t === "ktAbfrage" ? ktAbfrageLesen(text!, abD) : ((k?.abfrage ?? []) as KtAbfrageFrage[]) } : null;
  ktAnwenden(codes?.liste.length ? codes : null, abfrage?.liste.length ? abfrage : null);
  if (t === "ktCodes") return coD ? `KT/SEK-Codes „${basis(coD)}“ aktiv · ${codes!.liste.length} Codes` : "Eingebaute KT/SEK-Codes aktiv";
  return abD ? `KT-Abfrage „${basis(abD)}“ aktiv · ${abfrage!.liste.length} Fragen` : "Eingebaute KT-Abfrage aktiv";
}

/**
 * Datei für einen Teil hochladen: prüfen, in den Ordner speichern und aktivieren.
 * KT/SEK-Codes als CSV werden als JSON gespeichert; passen sie noch nicht (z. B. Bedingungen fehlen), als Entwurf.
 */
export async function teilHochladen(t: Teil, dateiname: string, text: string): Promise<string> {
  const d = TEILE[t];
  const name = ablageName(basis(dateiname));
  let inhalt = text;
  let ziel = dateiname;
  if (t === "rdCodes") {
    const r = codesLesen(text, dateiname);
    if ("fehler" in r) throw new Error(r.fehler);
    ziel = `${name}.csv`;
  } else if (t === "rdAbfrage") {
    const s = rdSchemaLesen(text, dateiname);
    const p = pruefeCodesystem(s);
    if (p.fehler.length) throw new Error(`${dateiname}: ${p.fehler[0]}${p.fehler.length > 1 ? ` (und ${p.fehler.length - 1} weitere Fehler)` : ""}`);
    inhalt = JSON.stringify(s);
    ziel = `${name}.json`;
  } else if (t === "ktCodes") {
    const liste = ktCodesLesen(text, dateiname);
    const k = store.ktSatzRoh;
    const r = pruefeKtSatz({ codes: liste, abfrage: (k?.abfrage as KtAbfrageFrage[] | undefined) ?? undefined }, standardKtAbfrage());
    ziel = `${name}.json`;
    if (r.fehler.length) {
      await ablageSpeichern(d.ordner, ziel, JSON.stringify({ entwurf: true, codes: liste }));
      return `Als Entwurf gespeichert (${liste.length} Codes) – ${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"}, z. B. ${r.fehler[0]} · im KT-Code-Editor fertigstellen`;
    }
    inhalt = JSON.stringify({ codes: liste });
  } else {
    inhalt = JSON.stringify({ abfrage: ktAbfrageLesen(text, dateiname) });
    ziel = `${name}.json`;
  }
  await ablageSpeichern(d.ordner, ziel, inhalt);
  return `Gespeichert in ${d.ordner} · ${await teilAktivieren(t, ziel)}`;
}

/** Datei eines Teils löschen (war sie aktiv: wieder eingebaut) */
export async function teilLoeschen(t: Teil, datei: string): Promise<string> {
  const istAktiv = aktivDatei(t) === datei;
  await ablageLoeschen(TEILE[t].ordner, datei);
  if (istAktiv) await teilAktivieren(t, null).catch(() => (TEILE[t].bereich === "kt" ? ktAnwenden(null, null) : eingebautAktivieren("rd")));
  return istAktiv ? "Gelöscht – wieder eingebaut" : "Gelöscht";
}

/** Gespeicherten Satz aktivieren (beide Teile gleichen Namens, z. B. nach dem Speichern im KT-Editor) */
export async function satzAktivieren(s: CodeSatz): Promise<void> {
  if (s.entwurf) throw new Error(`„${s.name}“ ist ein Entwurf – erst im Editor fertigstellen`);
  const o = ORDNER[s.bereich];
  if (s.bereich === "kt") {
    const codes = s.codes ? { datei: s.codes, liste: ktCodesLesen(await ablageLesen(o.codes, s.codes), s.codes) } : null;
    const abfrage = s.schema ? { datei: s.schema, liste: ktAbfrageLesen(await ablageLesen(o.abfrage, s.schema), s.schema) } : null;
    ktAnwenden(codes, abfrage);
    toast(`KT-/SEK-Satz „${s.name}“ aktiv${codes ? "" : " (nur Abfrage – die Codes bleiben die eingebauten)"}${abfrage ? "" : " (nur Codes – die Abfrage bleibt die eingebaute)"}`);
    return;
  }
  const schema = s.schema ? { datei: s.schema, schema: rdSchemaLesen(await ablageLesen(o.abfrage, s.schema), s.schema) } : null;
  let codes: { datei: string; liste: Einsatzcode[] } | null = null;
  if (s.codes) {
    const r = codesLesen(await ablageLesen(o.codes, s.codes), s.codes);
    if ("fehler" in r) throw new Error(r.fehler);
    codes = { datei: s.codes, liste: r.codes! };
  }
  rdAnwenden(schema, codes);
  toast(`RD-Satz „${s.name}“ aktiv${schema ? "" : " (nur Codeliste – die Abfrage bleibt die eingebaute)"}`);
}

/** Eingebaute KT-/SEK-Codes (für einen Satz, der nur die Abfrage mitbringt) */
export function eingebauteKtCodes(): KtCodeDef[] {
  return ((standardCodesystem() as { kt?: { codes?: KtCodeDef[] } }).kt?.codes ?? []) as KtCodeDef[];
}

/** Datei aus einem Datei-Feld lesen */
async function dateiText(inp: HTMLInputElement): Promise<{ name: string; text: string } | null> {
  const f = inp.files?.[0];
  if (!f) return null;
  return { name: f.name, text: decodeText(await f.arrayBuffer()) };
}

const TITEL: Record<Bereich, string> = { rd: "Notruf (RD)", kt: "Krankentransport & Überstellung (KT/SEK)" };

/** Fenster „Eigene Codes & Abfrage hinzufügen“ für einen Bereich */
export function satzHochladen(bereich: Bereich, fertig?: () => void): void {
  const o = ORDNER[bereich];
  const body = el("div", { class: "cs-hoch" });
  body.innerHTML = `<p class="muted small">Du kannst beides zusammen oder nur eines davon hochladen. Gespeichert wird in <b>Dokumente/LeitWerk</b> unter <b>${esc(o.codes)}</b> und <b>${esc(o.abfrage)}</b>; danach steht der Satz in der Liste zum Wechseln bereit.</p>`;
  const grid = el("div", { class: "form-grid" });
  const name = el("input", { type: "text", name: "satzname", placeholder: "z. B. Meine Leitstelle" }) as HTMLInputElement;
  const codes = el("input", { type: "file", name: "codeliste", accept: bereich === "rd" ? ".csv,.txt,text/csv,text/plain" : ".json,application/json" }) as HTMLInputElement;
  const schema = el("input", { type: "file", name: "abfrageschema", accept: ".json,application/json" }) as HTMLInputElement;
  const feld = (label: string, input: HTMLElement, hinweis: string) => {
    const w = el("label", { class: "fld wide" });
    w.append(el("span", { class: "fld-label" }, label), input, el("span", { class: "fld-hint" }, hinweis));
    return w;
  };
  grid.append(feld("Name des Satzes", name, "Unter diesem Namen findest du den Satz später wieder."));
  if (bereich === "rd")
    grid.append(
      feld("Codeliste (CSV)", codes, "Spalten: Code, Name, Kategorie (z. B. „ALS rot“), Kapitel."),
      feld("Abfrageschema (JSON)", schema, "Fragen und Regeln für die Notrufabfrage – enthält meist auch die Codes."),
    );
  else
    grid.append(
      feld("KT-/SEK-Codes (JSON)", codes, "Codes mit ihren Bedingungen – so, wie der Editor sie speichert."),
      feld("KT-Abfrage (JSON)", schema, "Fragen der KT-Hotline mit Art und dem, was sie klären."),
    );
  body.appendChild(grid);
  const vorschlag = (inp: HTMLInputElement) =>
    inp.addEventListener("change", () => {
      const f = inp.files?.[0];
      if (f && !name.value.trim()) name.value = basis(f.name);
    });
  vorschlag(schema);
  vorschlag(codes);

  openDialog({
    title: `Eigene Codes & Abfrage – ${TITEL[bereich]}`,
    body,
    wide: true,
    actions: [
      { label: "Abbrechen" },
      {
        label: "Speichern & verwenden",
        kind: "primary",
        onClick: async () => {
          const c = await dateiText(codes);
          const s = await dateiText(schema);
          if (!c && !s) {
            toast("Bitte Codes und/oder eine Abfrage wählen", "error");
            return false;
          }
          const n = ablageName(name.value.trim() || basis((s ?? c)!.name));
          let sText = s?.text;
          let cText = c?.text;
          try {
            if (bereich === "rd") {
              if (s) sText = JSON.stringify(rdSchemaLesen(s.text, s.name));
              if (c) {
                const r = codesLesen(c.text, c.name);
                if ("fehler" in r) throw new Error(r.fehler);
              }
            } else {
              if (c) cText = JSON.stringify({ codes: ktCodesLesen(c.text, c.name) });
              if (s) sText = JSON.stringify({ abfrage: ktAbfrageLesen(s.text, s.name) });
            }
          } catch (e) {
            toast(String((e as Error).message ?? e), "error");
            return false;
          }
          const vorhanden = (await satzListe(bereich)).find((x) => x.name.toLowerCase() === n.toLowerCase());
          if (vorhanden && !(await confirmDialog("Satz ersetzen?", `Es gibt schon einen Satz „${vorhanden.name}“. Die neuen Dateien ersetzen die alten.`, "Ersetzen"))) return false;
          try {
            if (sText) await ablageSpeichern(o.abfrage, `${n}.json`, sText);
            if (cText) await ablageSpeichern(o.codes, `${n}.${bereich === "rd" ? "csv" : "json"}`, cText);
            const satz = (await satzListe(bereich)).find((x) => x.name.toLowerCase() === n.toLowerCase());
            if (satz) await satzAktivieren(satz);
          } catch (e) {
            toast(String((e as Error).message ?? e), "error");
            fertig?.();
            return false;
          }
          fertig?.();
          return true;
        },
      },
    ],
  });
}

/** Fenster „Einsatzcodes & Abfrage“: Hinweis, je Bereich eingebaut + gespeicherte Sätze, Hochladen */
export function codesaetzeOeffnen(geaendert?: () => void): void {
  const body = el("div", { class: "cs-saetze" });
  const zeichnen = async () => {
    const listen = { rd: await satzListe("rd"), kt: await satzListe("kt") };
    body.innerHTML = `<div class="cs-rechtlich"><b>Hinweis</b><p>${esc(RECHTLICHER_HINWEIS)}</p></div>`;
    for (const bereich of ["rd", "kt"] as const) {
      const aktiv = aktivIn(bereich);
      const o = ORDNER[bereich];
      const abschnitt = el("div", { class: "cs-bereich", "data-bereich": bereich });
      abschnitt.appendChild(el("h4", { class: "cs-bereich-titel" }, TITEL[bereich]));
      const ul = el("div", { class: "cs-liste-saetze" });
      const zeile = (titel: string, info: string, istAktiv: boolean, knoepfe: HTMLElement[]) => {
        const z = el("div", { class: `cs-satz${istAktiv ? " aktiv" : ""}` });
        z.innerHTML = `<div class="cs-satz-text"><b>${esc(titel)}</b>${istAktiv ? ` <span class="cs-aktiv">aktiv</span>` : ""}<div class="muted small">${esc(info)}</div></div>`;
        const k = el("div", { class: "row-btns" });
        knoepfe.forEach((b) => k.appendChild(b));
        z.appendChild(k);
        ul.appendChild(z);
      };
      const std = el("button", { class: "btn small", "data-satz": "" }, "Verwenden");
      std.disabled = aktiv === null;
      std.addEventListener("click", () => {
        eingebautAktivieren(bereich);
        toast(`Eingebaut aktiv: ${TITEL[bereich]}`);
        geaendert?.();
        void zeichnen();
      });
      zeile(
        bereich === "rd" ? "LeitWerk-Codesystem (eingebaut)" : "LeitWerk-Transportcodes (eingebaut)",
        bereich === "rd" ? "Eigene Codes im gewohnten Aufbau (RD-…), mit Abfrage – immer verfügbar" : "Eigene Codes für Krankentransporte und Überstellungen (KT…, SEK-…), mit KT-Abfrage – immer verfügbar",
        aktiv === null,
        [std],
      );
      for (const s of listen[bereich]) {
        const istAktiv = aktiv?.toLowerCase() === s.name.toLowerCase();
        const nutzen = el("button", { class: "btn small", "data-satz": s.name }, "Verwenden");
        nutzen.disabled = istAktiv || !!s.entwurf;
        nutzen.addEventListener("click", async () => {
          try {
            await satzAktivieren(s);
          } catch (e) {
            toast(String((e as Error).message ?? e), "error");
          }
          geaendert?.();
          void zeichnen();
        });
        const weg = el("button", { class: "btn small danger-text" }, "Löschen");
        weg.addEventListener("click", async () => {
          if (!(await confirmDialog("Satz löschen", `„${s.name}“ (${TITEL[bereich]}) wird aus Dokumente/LeitWerk gelöscht.`, "Löschen", true))) return;
          if (s.schema) await ablageLoeschen(o.abfrage, s.schema).catch(() => undefined);
          if (s.codes) await ablageLoeschen(o.codes, s.codes).catch(() => undefined);
          if (istAktiv) eingebautAktivieren(bereich);
          geaendert?.();
          void zeichnen();
        });
        const teile =
          bereich === "rd"
            ? [s.codes ? "Codeliste" : "", s.schema ? "Abfrageschema" : ""].filter(Boolean).join(" + ")
            : [s.codes ? "Codes" : "", s.schema ? "Abfrage" : ""].filter(Boolean).join(" + ");
        const fehlt = s.schema ? (s.codes ? "" : bereich === "rd" ? "" : " – Codes bleiben die eingebauten") : " – Abfrage bleibt die eingebaute";
        const knoepfe = [nutzen];
        if (bereich === "kt") {
          const bearb = el("button", { class: "btn small", title: "Codes und Abfrage bearbeiten" }, "Bearbeiten");
          bearb.addEventListener("click", async () => {
            try {
              const codes = s.codes ? ktCodesLesen(await ablageLesen(o.codes, s.codes), s.codes) : undefined;
              const abfrage = s.schema ? ktAbfrageLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : undefined;
              ktEditorOeffnen({ satz: { codes: codes ?? eingebauteKtCodes(), abfrage }, name: s.name, fertig: () => (geaendert?.(), void zeichnen()) });
            } catch (e) {
              toast(String((e as Error).message ?? e), "error");
            }
          });
          knoepfe.push(bearb);
        }
        knoepfe.push(weg);
        zeile(s.name, `${s.entwurf ? "ENTWURF – noch nicht spielbar · " : ""}${teile}${fehlt}`, istAktiv, knoepfe);
      }
      abschnitt.appendChild(ul);
      const knoepfe = el("div", { class: "row-btns cs-neu" });
      const neu = el("button", { class: "btn primary", "data-satz-neu": bereich }, "+ Eigene Codes & Abfrage hinzufügen …");
      neu.addEventListener("click", () =>
        satzHochladen(bereich, () => {
          geaendert?.();
          void zeichnen();
        }),
      );
      knoepfe.appendChild(neu);
      if (bereich === "kt") {
        const kt = el("button", { class: "btn", "data-kt-editor": "" }, "Codes & Abfrage bearbeiten …");
        kt.title = "Eigene Codes für Krankentransporte und Überstellungen – als neuer Satz auf Basis des aktiven";
        kt.addEventListener("click", () => ktEditorOeffnen({ fertig: () => (geaendert?.(), void zeichnen()) }));
        knoepfe.appendChild(kt);
      }
      abschnitt.appendChild(knoepfe);
      body.appendChild(abschnitt);
    }
  };
  void zeichnen();
  openDialog({ title: "Einsatzcodes & Abfrage", body, wide: true, actions: [{ label: "Schließen" }] });
}

/**
 * Einmalig beim Start: v0.73 alte importierte Codes/Schemas entfernen; v0.76 gemischte Sätze entfernen –
 * ab jetzt RD und KT/SEK getrennt (die Dateien liegen dann in den Unterordnern).
 */
export async function codesEinmaligAufraeumen(): Promise<boolean> {
  if (store.codesGetrennt || store.inSession) return false;
  const hatte = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard") || !!store.ktSatzRoh;
  store.codesTrennen();
  aktivMerken(null);
  let dateien = 0;
  for (const ordner of ["Abfrageschema", "Codelisten"] as const) {
    for (const d of await ablageListe(ordner).catch(() => [])) {
      await ablageLoeschen(ordner, d.datei)
        .then(() => dateien++)
        .catch((e) => console.warn("Ablage löschen", e));
    }
  }
  if (hatte || dateien)
    toast("Neu: Codes für Notrufe (RD) und für Krankentransporte/Überstellungen (KT/SEK) sind jetzt getrennt. Eigene Sätze bitte unter Einstellungen → Einsatzcodes & Abfrage neu hinzufügen.");
  return true;
}
