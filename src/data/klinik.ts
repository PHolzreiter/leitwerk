/**
 * Klinik-Zuweisung in drei Ebenen:
 *   1. Einrichtungen (Stationen, Intensiv, Ambulanzen, Funktionsbereiche, Zentren) – pro Krankenhaus angehakt
 *   2. Akut-Abteilungen – automatisch aus den Einrichtungen abgeleitet, pro Haus abschaltbar
 *   3. Buchungen (Verdachtsdiagnosen des Rettungsdienstes) – verlangen Akut-Abteilungen
 * Logik der Listen: ODER über die Alternativen, UND innerhalb einer Alternative.
 */
import daten from "./klinik.json";
import type { Hospital } from "./model";

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

export function einrichtung(id: string): Einrichtung | undefined {
  return E1.get(id);
}
export function akutAbteilung(id: string): AkutAbteilung | undefined {
  return E2.get(id);
}
export function buchung(id: string | null | undefined): Buchung | undefined {
  return id ? E3.get(id) : undefined;
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
  const out = new Set(AKUT.filter((a) => !aus.has(a.id) && erfuellt(haben, a.voraussetzung)).map((a) => a.id));
  cache.set(h, out);
  return out;
}

/** Akut-Abteilungen, die sich aus Einrichtungen ergeben würden (auch abgeschaltete) – für den Editor */
export function akutMoeglich(einrichtungen: string[]): AkutAbteilung[] {
  const haben = new Set(einrichtungen);
  return AKUT.filter((a) => erfuellt(haben, a.voraussetzung));
}

export type Eignung = "passend" | "ausweich" | "rueckfall" | null;

/**
 * Passt das Haus zur Buchung?
 * passend = eine Option erfüllt; ausweich = nicht zeitkritisch, Patient nicht rot, Notaufnahme/Unfallchirurgie;
 * sonst null (Rückfall entscheidet der Aufrufer).
 */
export function eignung(h: Hospital, b: Buchung | undefined, rot: boolean): Eignung {
  if (!b) return akutVon(h).has("ak_notaufnahme") ? "passend" : null;
  const ak = akutVon(h);
  if (erfuellt(ak, b.optionen)) return "passend";
  if (!b.zeitkritisch && !rot && b.ausweich && erfuellt(ak, AUSWEICH[b.ausweich])) return "ausweich";
  return null;
}

/** Erste erfüllte Option (0 = bevorzugt) oder -1 */
export function optionIndex(h: Hospital, b: Buchung): number {
  const ak = akutVon(h);
  return b.optionen.findIndex((o) => o.every((x) => ak.has(x)));
}

export interface KhVorschlag {
  h: Hospital;
  eignung: Exclude<Eignung, null>;
  km: number;
}

/** Wie weit ein passendes Haus höchstens entfernt sein darf, bevor der Rückfall greift (Luftlinie) */
export const ERREICHBAR_KM = 100;

/**
 * Vorschläge zu einer Buchung, nach Entfernung sortiert: zuerst passende (bevorzugte Option vor weiteren),
 * dann Ausweich-Häuser. Ohne erreichbares Haus: Rückfall (Schockraum/Unfall bei Trauma, sonst Notaufnahme).
 */
export function khVorschlaege(alle: Hospital[], b: Buchung | undefined, rot: boolean, km: (h: Hospital) => number): KhVorschlag[] {
  const mit = alle.map((h) => ({ h, km: km(h), e: eignung(h, b, rot), o: b ? Math.max(0, optionIndex(h, b)) : 0 }));
  // bevorzugte Option zuerst – eine weitere Option nur, wenn sie deutlich (15 km je Stufe) näher ist
  const passend = mit.filter((x) => x.e === "passend" && x.km <= ERREICHBAR_KM).sort((a, c) => a.km + a.o * 15 - (c.km + c.o * 15));
  const ausweich = mit.filter((x) => x.e === "ausweich" && x.km <= ERREICHBAR_KM).sort((a, c) => a.km - c.km);
  const out: KhVorschlag[] = [...passend.map((x) => ({ h: x.h, eignung: "passend" as const, km: x.km })), ...ausweich.map((x) => ({ h: x.h, eignung: "ausweich" as const, km: x.km }))];
  if (out.length) return out;
  const rf = RUECKFALL[b?.kategorie === "Trauma" ? "Trauma" : "sonst"] ?? RUECKFALL.sonst;
  for (const alt of rf) {
    const r = mit.filter((x) => alt.every((a) => akutVon(x.h).has(a))).sort((a, c) => a.km - c.km);
    if (r.length) return r.map((x) => ({ h: x.h, eignung: "rueckfall" as const, km: x.km }));
  }
  return [];
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
