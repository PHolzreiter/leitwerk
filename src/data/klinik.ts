/**
 * Klinik-Zuweisung in drei Ebenen:
 *   1. Einrichtungen (Stationen, Intensiv, Ambulanzen, Funktionsbereiche, Zentren) – pro Krankenhaus angehakt
 *   2. Akut-Abteilungen – automatisch aus den Einrichtungen abgeleitet, pro Haus abschaltbar
 *   3. Buchungen (Verdachtsdiagnosen des Rettungsdienstes) – verlangen Akut-Abteilungen
 * Logik der Listen: ODER über die Alternativen, UND innerhalb einer Alternative.
 */
import daten from "./klinik.json";
import type { Hospital } from "./model";
import { belegt, offen, platzFuer, plaetze, ressourcenFuer, type BelegungMap, type Ressource } from "../sim/khStatus";
import { istZuweisung, zuweisungBuchung, zuweisungLesen, type ZuweisungBuchung } from "./zuweisung";

export type EinrichtungTyp = "station" | "intensiv" | "ambulanz" | "funktionsbereich" | "zentrum";
export interface Einrichtung {
  id: string;
  typ: EinrichtungTyp;
  name: string;
}
export interface AkutAbteilung {
  id: string;
  name: string;
  voraussetzung: string[][];
}
export interface Buchung {
  id: string;
  kategorie: string;
  name: string;
  optionen: string[][];
  /** zeitkritisch: immer das passende Haus, auch bei stabilem Patienten */
  zeitkritisch: boolean;
  /** nicht zeitkritisch und nicht rot: darf auch auf jede Notaufnahme (intern) bzw. Unfallchirurgie (trauma) */
  ausweich: "intern" | "trauma" | null;
}

export const EINRICHTUNGEN = daten.ebene1_einrichtungen as Einrichtung[];
export const AKUT = daten.ebene2_akut_abteilungen as AkutAbteilung[];
export const BUCHUNGEN = daten.ebene3_buchungen as Buchung[];
const AUSWEICH = daten.ausweich as Record<"intern" | "trauma", string[][]>;
const RUECKFALL = daten.rueckfall as Record<string, string[][]>;

export const EINRICHTUNG_TYP_LABEL: Record<EinrichtungTyp, string> = {
  station: "Stationen",
  intensiv: "Intensiv & Überwachung",
  ambulanz: "Ambulanzen",
  funktionsbereich: "Funktionsbereiche",
  zentrum: "Zentren",
};

const E1 = new Map(EINRICHTUNGEN.map((e) => [e.id, e]));
const E2 = new Map(AKUT.map((a) => [a.id, a]));
const E3 = new Map(BUCHUNGEN.map((b) => [b.id, b]));
// Reanimation mit ROSC: das Cardiac Arrest Center passt nur, wenn sein Herzkatheter gerade offen ist
for (const b of BUCHUNGEN) if (b.id === "bu_reanimation_mit_rosc") b.optionen = b.optionen.map((alt) => (alt.includes("ak_herzkatheter") ? alt : [...alt, "ak_herzkatheter"]));

export function einrichtung(id: string): Einrichtung | undefined {
  return E1.get(id);
}
export function akutAbteilung(id: string): AkutAbteilung | undefined {
  return E2.get(id);
}
export function buchung(id: string | null | undefined): Buchung | undefined {
  if (!id) return undefined;
  return istZuweisung(id) ? zuweisungBuchung(id) : E3.get(id);
}
export function buchungName(id: string | null | undefined): string {
  return buchung(id)?.name ?? (id || "");
}

const erfuellt = (haben: Set<string>, alternativen: string[][]) => alternativen.some((alt) => alt.every((x) => haben.has(x)));

const cache = new WeakMap<Hospital, Set<string>>();
/** Akut-Abteilungen eines Hauses (abgeleitet, ohne die abgeschalteten) */
export function akutVon(h: Hospital): Set<string> {
  const c = cache.get(h);
  if (c) return c;
  const haben = new Set(h.einrichtungen?.length ? h.einrichtungen : einrichtungenAusAlt(h.abteilungen as Record<string, boolean> | undefined, h.bereiche));
  const aus = new Set(h.akutAus ?? []);
  let out = new Set(AKUT.filter((a) => !aus.has(a.id) && erfuellt(haben, a.voraussetzung)).map((a) => a.id));
  // ohne Notaufnahme/Unfall: nur, was die Rettung direkt anfährt oder eine eigene Tür hat (Kreißsaal, Psychiatrie, Kinder)
  if (out.size && !["amb_notaufnahme", "amb_unfall", "fb_schockraum"].some((x) => haben.has(x))) {
    out = new Set([...out].filter((id) => DIREKT.has(id) || tueren(h, id).length > 0));
  }
  cache.set(h, out);
  return out;
}

/** Akut-Abteilungen, die sich aus Einrichtungen ergeben würden (auch abgeschaltete) – für den Editor */
export function akutMoeglich(einrichtungen: string[]): AkutAbteilung[] {
  const haben = new Set(einrichtungen);
  return AKUT.filter((a) => erfuellt(haben, a.voraussetzung));
}

/** Diese Akut-Abteilungen erreicht die Rettung direkt (eigene Zeiten in den Einrichtungen), ohne Notaufnahme */
const DIREKT = new Set(["ak_primaerversorgung", "ak_primaerversorgung_unfall", "ak_herzkatheter", "ak_stroke_unit", "ak_thrombektomie", "ak_schockraum", "ak_druckkammer", "ak_cardiac_arrest_center", "ak_kreisssaal", "ak_angiographie", "ak_ct", "ak_mrt", "ak_dialyse"]);
const TRAUMA_AK = new Set(["ak_unfallchirurgie", "ak_chirurgische_intensiv", "ak_neurochirurgie", "ak_plastische_chirurgie", "ak_thoraxchirurgie", "ak_wirbelsaeulenchirurgie", "ak_mkg", "ak_verbrennungszentrum", "ak_allgemeinchirurgie", "ak_gefaesschirurgie"]);
const KINDER_AK = new Set(["ak_kinder_jugendheilkunde", "ak_kinder_intensiv", "ak_neonatologie", "ak_kinderchirurgie"]);
const PSYCH_AK = new Set(["ak_psychiatrie", "ak_kinder_jugend_psychiatrie", "ak_sucht_entzug"]);

/** Über welche Tür kommt die Rettung zu dieser Akut-Abteilung? (eine offene reicht) */
function tueren(h: Hospital, ak: string): string[] {
  const e = new Set(h.einrichtungen ?? []);
  const na = e.has("amb_notaufnahme") ? ["amb_notaufnahme"] : [];
  const unfall = ["amb_unfall", "fb_schockraum"].filter((x) => e.has(x));
  let t: string[];
  if (TRAUMA_AK.has(ak)) t = [...unfall, ...na];
  else if (KINDER_AK.has(ak)) t = [...["amb_kindernotaufnahme"].filter((x) => e.has(x)), ...na];
  else if (PSYCH_AK.has(ak)) t = [...["amb_psychiatrie_krise"].filter((x) => e.has(x)), ...na];
  else if (ak === "ak_gynaekologie") t = [...["fb_kreisssaal"].filter((x) => e.has(x)), ...na];
  else t = na.length ? na : unfall;
  return t;
}

/** Akut-Abteilungen, die zum Zeitpunkt t aufnehmen (Öffnungszeiten, Aufnahmerad, offene Notaufnahme) */
export function akutJetzt(h: Hospital, t: number): Set<string> {
  const alle = akutVon(h);
  const out = new Set<string>();
  for (const id of alle) {
    const a = E2.get(id)!;
    if (!a.voraussetzung.some((alt) => alt.every((x) => offen(h, x, t)))) continue;
    if (!DIREKT.has(id)) {
      const tue = tueren(h, id);
      // Haus ohne eigene Notfall-Tür: nicht zusätzlich einschränken
      if (tue.length && !tue.some((x) => offen(h, x, t))) continue;
    }
    out.add(id);
  }
  return out;
}

export type Eignung = "passend" | "ausweich" | "rueckfall" | null;

/** Hat das Haus einen Schockraum dieser Art? (kombinierter zählt für beide; ohne Platzangabe gilt er als kombiniert) */
export function schockraumArt(h: Hospital, art: "trauma" | "intern"): boolean {
  if (!(h.einrichtungen ?? []).includes("fb_schockraum")) return false;
  const p = h.plaetze ?? {};
  const t = p.schockraum_trauma ?? 0;
  const i = p.schockraum_intern ?? 0;
  const k = p.schockraum ?? 0;
  if (!t && !i) return true;
  return k > 0 || (art === "trauma" ? t > 0 : i > 0);
}

/** Eigene Einstellung des Hauses zu dieser Zuweisung: true = nimmt auf, false = nimmt nicht auf, null = nach Abteilungen */
export function zuweisungSchalter(h: Hospital, b: Buchung | undefined): boolean | null {
  if (!b || !istZuweisung(b.id)) return null;
  const z = zuweisungLesen(b.id);
  if (!z) return null;
  const keys = [`${z.s.id}:${z.d}`, z.s.id];
  if (keys.some((k) => h.zuweisungAus?.includes(k))) return false;
  if (keys.some((k) => h.zuweisungAn?.includes(k))) return true;
  return null;
}

/** Eine Notfall-Tür des Hauses ist offen (für eingeschaltete Zuweisungen ohne passende Abteilung) */
function tuerOffen(h: Hospital, t: number | undefined): boolean {
  const e = (h.einrichtungen ?? []).filter((x) => ["amb_notaufnahme", "amb_unfall", "amb_kindernotaufnahme", "fb_schockraum", "amb_pvz"].includes(x));
  if (!e.length) return true;
  return t === undefined || e.some((x) => offen(h, x, t));
}

function eignungMit(ak: Set<string>, b: Buchung | undefined, rot: boolean, h?: Hospital, t?: number): Eignung {
  if (!b) return ak.has("ak_notaufnahme") ? "passend" : null;
  if (h) {
    const sw = zuweisungSchalter(h, b);
    if (sw === false) return null;
    if (sw === true) return tuerOffen(h, t) ? "passend" : null;
    const zb = b as ZuweisungBuchung;
    if (zb.schock && !schockraumArt(h, zb.schock)) return null;
  }
  if (erfuellt(ak, b.optionen)) return "passend";
  const ak2 = (b as ZuweisungBuchung).ausweichKind;
  if (ak2 && erfuellt(ak, ak2)) return "ausweich";
  if (!b.zeitkritisch && !rot && b.ausweich && erfuellt(ak, AUSWEICH[b.ausweich])) return "ausweich";
  return null;
}

/**
 * Passt das Haus zur Buchung?
 * passend = eine Option erfüllt; ausweich = nicht zeitkritisch, Patient nicht rot, Notaufnahme/Unfallchirurgie;
 * sonst null (Rückfall entscheidet der Aufrufer).
 */
export function eignung(h: Hospital, b: Buchung | undefined, rot: boolean): Eignung {
  return eignungMit(akutVon(h), b, rot, h);
}

/** Eignung mit schon berechneten offenen Akut-Abteilungen (für Prüfungen über viele Zeitpunkte) */
export function eignungJetzt(h: Hospital, b: Buchung | undefined, rot: boolean, jetzt: Set<string>, t: number): Eignung {
  return eignungMit(jetzt, b, rot, h, t);
}

/** Erste erfüllte Option (0 = bevorzugt) oder -1 */
export function optionIndex(h: Hospital, b: Buchung): number {
  if (zuweisungSchalter(h, b) === true) return 0;
  const ak = akutVon(h);
  return b.optionen.findIndex((o) => o.every((x) => ak.has(x)));
}

export interface KhVorschlag {
  h: Hospital;
  eignung: Exclude<Eignung, null>;
  km: number;
  /** passt grundsätzlich, ist aber gerade zu (Öffnungszeit, Aufnahmerad) */
  zu: boolean;
  /** offen, aber alle Plätze belegt */
  voll: boolean;
  /** Platz, den der Patient belegen würde */
  platz: Ressource | null;
  frei: number;
  gesamt: number;
}

/** Wie weit ein passendes Haus höchstens entfernt sein darf, bevor der Rückfall greift (Luftlinie) */
export const ERREICHBAR_KM = 100;

export interface VorschlagOpt {
  t: number;
  belegung?: BelegungMap;
  kind?: boolean;
}

/**
 * Vorschläge zu einer Buchung: zuerst passende (bevorzugte Option vor weiteren), dann Ausweich-Häuser,
 * jeweils nach Entfernung; mit Angabe, ob das Haus gerade zu oder voll ist. Ohne erreichbares Haus:
 * Rückfall (Schockraum/Unfall bei Trauma, sonst Notaufnahme).
 */
/** Primärversorgungszentrum (keine Notaufnahme, kein Bettenhaus) */
export function istPvz(h: Hospital): boolean {
  const e = h.einrichtungen ?? [];
  return e.includes("amb_pvz") && !e.includes("amb_notaufnahme");
}

export function khVorschlaege(alle: Hospital[], b: Buchung | undefined, rot: boolean, km: (h: Hospital) => number, opt?: VorschlagOpt): KhVorschlag[] {
  const t = opt?.t;
  const info = (h: Hospital, e: Exclude<Eignung, null>, k: number): KhVorschlag => {
    let zu = false;
    let platz: Ressource | null = null;
    let frei = 0;
    let gesamt = 0;
    let voll = false;
    if (t !== undefined) {
      const jetzt = akutJetzt(h, t);
      zu = e === "rueckfall" ? false : eignungMit(jetzt, b, rot, h, t) === null;
      const p = platzFuer(h, opt?.belegung, ressourcenFuer(b?.id, e, !!opt?.kind || !!(b as ZuweisungBuchung | undefined)?.kind), t);
      if (p) {
        platz = p.r;
        gesamt = plaetze(h, p.r);
        frei = Math.max(0, gesamt - belegt(opt?.belegung, h.id, p.r, t));
        voll = !p.frei;
      }
    }
    return { h, eignung: e, km: k, zu, voll, platz, frei, gesamt };
  };
  const mit = alle.map((h) => ({ h, km: km(h), e: eignung(h, b, rot), o: b ? Math.max(0, optionIndex(h, b)) : 0 }));
  // bevorzugte Option zuerst – eine weitere Option nur, wenn sie deutlich (15 km je Stufe) näher ist
  const passend = mit.filter((x) => x.e === "passend" && x.km <= ERREICHBAR_KM).sort((a, c) => a.km + a.o * 15 - (c.km + c.o * 15));
  const ausweich = mit.filter((x) => x.e === "ausweich" && x.km <= ERREICHBAR_KM).sort((a, c) => a.km - c.km);
  const out: KhVorschlag[] = [...passend.map((x) => info(x.h, "passend", x.km)), ...ausweich.map((x) => info(x.h, "ausweich", x.km))];
  // Hausarzt-Fälle: PVZ und Krankenhaus gleichwertig – das nächste gewinnt
  if (b && (b.optionen.every((alt) => alt.every((a) => a.startsWith("ak_primaerversorgung"))) || (b as ZuweisungBuchung).pvz)) out.sort((a, c) => a.km - c.km);
  // Rückfall, wenn kein passendes Haus offen ist
  if (out.some((v) => !v.zu)) return out;
  const rf = RUECKFALL[b?.kategorie === "Trauma" ? "Trauma" : "sonst"] ?? RUECKFALL.sonst;
  for (const alt of rf) {
    const ak = (h: Hospital) => (t !== undefined ? akutJetzt(h, t) : akutVon(h));
    const r = mit.filter((x) => alt.every((a) => ak(x.h).has(a)) && !out.some((v) => v.h === x.h)).sort((a, c) => a.km - c.km);
    if (r.length) return [...out, ...r.map((x) => info(x.h, "rueckfall", x.km))];
  }
  return out;
}

/** Orte außerhalb Niederösterreichs (Wien, Burgenland, Oberösterreich, Steiermark) – für „NÖ zuerst“ */
const NICHT_NOE = /^(Wien|Eisenstadt|Oberwart|Kittsee|Güssing|Oberpullendorf|Frauenkirchen|Linz|Steyr|Freistadt|Wels|Grieskirchen|Kirchdorf|Vöcklabruck|Gmunden|Bad Ischl|Braunau|Schärding|Ried im Innkreis|Rohrbach|Sierning|Graz|Gratwein|Voitsberg|Kalwang|Leoben|Bruck an der Mur|Mürzzuschlag|Rottenmann|Bad Aussee|Schladming|Judenburg|Knittelfeld|Stolzalpe|Weiz|Feldbach|Fürstenfeld|Hartberg|Deutschlandsberg|Wagna|Bad Radkersburg|Vorau)\b/;

/** Liegt das Krankenhaus in Niederösterreich? */
export function inNoe(h: Hospital): boolean {
  return !NICHT_NOE.test(h.ort ?? "");
}

/**
 * Rettungseinsätze: zuerst nach NÖ – ein Haus in Wien oder einem anderen Bundesland nur, wenn in NÖ kein passendes Haus
 * offen ist und Platz hat (Vorgabe Paul, 28.10.2026)
 */
export function noeZuerst(v: KhVorschlag[]): KhVorschlag[] {
  const ok = (x: KhVorschlag) => x.eignung === "passend" && !x.zu && !x.voll;
  if (!v.some((x) => ok(x) && inNoe(x.h))) return v;
  return [...v.filter((x) => ok(x) && inNoe(x.h)), ...v.filter((x) => !(ok(x) && inNoe(x.h)))];
}

/** Ziel für die Besatzung: erstes Haus, das offen ist und einen freien Platz hat (sonst offen, sonst irgendeins) */
export function bestesKh(v: KhVorschlag[]): KhVorschlag | undefined {
  return v.find((x) => !x.zu && !x.voll) ?? v.find((x) => !x.zu) ?? v[0];
}

// ------------------------------------------------------------------ alte Daten (Häkchen und Bereichskürzel)

/** Alte Abteilungs-Häkchen → Einrichtungen (für ältere eigene Daten und CSV-Dateien) */
const ALT_FLAGS: Record<string, string[]> = {
  notfallambulanz: ["amb_notaufnahme"],
  schockraum: ["fb_schockraum", "fb_ct"],
  unfallambulanz: ["amb_unfall", "st_orthopaedie_traumatologie"],
  kinderambulanz: ["st_kinder_jugendheilkunde", "amb_kindernotaufnahme"],
  intensiv_anaesthesie: ["its_interdisziplinaer"],
  neurologie: ["st_neurologie", "its_stroke_unit", "fb_ct"],
  kinderintensiv: ["its_picu"],
  neonatologie: ["its_nicu"],
  hno: ["st_hno"],
  urologie: ["st_urologie"],
  gyn_geburtshilfe: ["st_gynaekologie", "st_geburtshilfe", "fb_kreisssaal"],
};

/** Bereichskürzel der Krankentransporte → Einrichtungen (eine davon reicht) */
export const BEREICH_EINRICHTUNG: Record<string, string[]> = {
  INT: ["st_innere_medizin"],
  KAR: ["st_kardiologie"],
  GAS: ["st_gastroenterologie"],
  PUL: ["st_pulmologie"],
  NEP: ["st_nephrologie"],
  ONK: ["st_onkologie"],
  CHI: ["st_allgemeinchirurgie"],
  ORT: ["st_orthopaedie_traumatologie"],
  NEU: ["st_neurologie"],
  NCH: ["st_neurochirurgie"],
  URO: ["st_urologie"],
  GYN: ["st_gynaekologie", "st_geburtshilfe"],
  KIN: ["st_kinder_jugendheilkunde"],
  HNO: ["st_hno"],
  AUG: ["st_augenheilkunde"],
  DER: ["st_dermatologie"],
  PSY: ["st_psychiatrie"],
  GER: ["st_agr"],
  PAL: ["st_palliativstation"],
  ITS: ["its_interdisziplinaer", "its_internistisch", "its_chirurgisch", "its_ccu"],
  NEO: ["its_nicu"],
  PIC: ["its_picu"],
  HCH: ["st_herzchirurgie"],
  VER: ["z_verbrennungszentrum", "its_verbrennung"],
  ZNA: ["amb_notaufnahme"],
  UNF: ["amb_unfall"],
  DIA: ["fb_dialyse"],
  STR: ["fb_strahlentherapie", "st_strahlentherapie"],
  CHE: ["amb_onko_tagesklinik"],
  RAD: ["fb_ct", "fb_mrt"],
  NUK: ["fb_nuklearmedizin"],
  HKL: ["fb_herzkatheter"],
  THR: ["fb_angiographie"],
  END: ["fb_endoskopie"],
  PHY: ["fb_physiotherapie", "st_physikalische_medizin"],
  WUN: ["amb_wunde"],
  SCH: ["amb_schmerz"],
};

/** Einrichtungen aus alten Häkchen und Bereichskürzeln */
export function einrichtungenAusAlt(flags: Record<string, boolean> | undefined, bereiche: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const [f, ids] of Object.entries(ALT_FLAGS)) if (flags?.[f]) ids.forEach((i) => out.add(i));
  for (const b of bereiche ?? []) {
    const ids = BEREICH_EINRICHTUNG[b];
    if (ids) out.add(ids[0]);
    if (b === "THR") out.add("its_stroke_unit");
  }
  return EINRICHTUNGEN.map((e) => e.id).filter((id) => out.has(id));
}

/** Einrichtungen in der Reihenfolge der Liste, unbekannte IDs weg */
export function einrichtungenOrdnen(ids: Iterable<string>): string[] {
  const s = new Set(ids);
  return EINRICHTUNGEN.map((e) => e.id).filter((id) => s.has(id));
}
