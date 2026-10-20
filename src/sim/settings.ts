/** Einstellungen der Simulation (im Reiter „Einstellungen“ änderbar, mit der Leitstelle gespeichert). */
import stufenCsv from "../../data/default/einsatzstufen.csv?raw";
import { parseCsv } from "../data/csv";

/** Bedeutung eines Status (fest); Nummer, Name und Farbe sind einstellbar. */
export type StatusKey =
  | "freiWache"
  | "zumBO"
  | "amBO"
  | "zumZO"
  | "amZO"
  | "freiFunk"
  | "dienstfahrt"
  | "bereitschaft"
  | "alarmWache"
  | "alarmFunk"
  | "alarmiert"
  | "abgemeldet";

export interface StatusDef {
  key: StatusKey;
  nummer: string;
  name: string;
  farbe: string;
  /** darf alarmiert werden */
  verfuegbar: boolean;
}

export const DEFAULT_STATUS: StatusDef[] = [
  { key: "freiWache", nummer: "1", name: "Frei Wache", farbe: "#2e9d4a", verfuegbar: true },
  { key: "zumBO", nummer: "2", name: "zum Berufungsort", farbe: "#f2b600", verfuegbar: false },
  { key: "amBO", nummer: "3", name: "am Berufungsort", farbe: "#e67e22", verfuegbar: false },
  { key: "zumZO", nummer: "4", name: "zum Zielort", farbe: "#1e88e5", verfuegbar: false },
  { key: "amZO", nummer: "5", name: "am Zielort", farbe: "#3949ab", verfuegbar: false },
  { key: "freiFunk", nummer: "6", name: "Frei Funk", farbe: "#7cc576", verfuegbar: true },
  { key: "dienstfahrt", nummer: "7", name: "Dienstfahrt", farbe: "#8d6e63", verfuegbar: true },
  { key: "bereitschaft", nummer: "8", name: "Bereitschaft", farbe: "#26a69a", verfuegbar: true },
  { key: "alarmWache", nummer: "A", name: "Alarmiert auf Wache", farbe: "#c62828", verfuegbar: false },
  { key: "alarmFunk", nummer: "F", name: "Alarmiert über Funk", farbe: "#f4511e", verfuegbar: false },
  { key: "alarmiert", nummer: "9", name: "Alarmiert und quittiert", farbe: "#e53935", verfuegbar: false },
  { key: "abgemeldet", nummer: "0", name: "Abgemeldet", farbe: "#6b7280", verfuegbar: false },
];

export type Kategorie = "stabil" | "dringend" | "kritisch";
export const KATEGORIEN: Kategorie[] = ["stabil", "dringend", "kritisch"];
export const KATEGORIE_LABEL: Record<Kategorie, string> = { stabil: "Stabil", dringend: "Dringend", kritisch: "Kritisch" };

export type NotarztRegel = "nein" | "nef" | "schnellster";
export const NOTARZT_LABEL: Record<NotarztRegel, string> = {
  nein: "nein",
  nef: "NEF bevorzugt",
  schnellster: "schnellstes (NEF/NAH)",
};

/** Zuordnung einer AMPDS-Stufe (z. B. „ALS rot“) zu Rettungsmitteln und Dringlichkeit. */
export interface StufeDef {
  stufe: string;
  /**
   * Rangfolge der Rettungsmittel, z. B. „KTW>RTW>RTW-C“; „/“ = gleichwertig („RTW/RTW-C“).
   * Leer = kein Fahrzeug (Weitergabe).
   */
  rettungsmittel: string;
  /** mindestens ein Notfallsanitäter auf dem Rettungsmittel, sonst NEF dazu */
  nfsErforderlich: boolean;
  notarzt: NotarztRegel;
  sondersignal: boolean;
  kategorie: Kategorie;
  transportProzent: number;
}

/** Rangfolge als Liste von Rängen: [["KTW"], ["RTW"], ["RTW-C"]] */
export function raenge(s: StufeDef): string[][] {
  return s.rettungsmittel
    .split(">")
    .map((r) => r.split("/").map((t) => t.trim().toUpperCase()).filter(Boolean))
    .filter((r) => r.length > 0);
}

function defaultStufen(): StufeDef[] {
  const rows = parseCsv(stufenCsv);
  const ja = (v: string | undefined) => (v ?? "").trim() === "ja";
  return rows.slice(1).map((r) => ({
    stufe: r[0],
    rettungsmittel: (r[1] ?? "").trim(),
    nfsErforderlich: ja(r[2]),
    notarzt: ((r[3] ?? "nein").trim() as NotarztRegel) || "nein",
    sondersignal: ja(r[4]),
    kategorie: ((r[5] ?? "").trim() as Kategorie) || "dringend",
    transportProzent: Number(r[6] ?? 70) || 0,
  }));
}

/**
 * Eine unbekannte Einsatzstufe (Kategorie eines fremden Codesystems) nach ihrem Namen einordnen:
 * „Prio 1 – Notarzt“, „rot“, „Reanimation“ → kritisch mit Notarzt; „mit Sondersignal“, „Prio 2“ → dringend;
 * „ohne Sondersignal“, „Prio 3“ → RTW ohne Eile; „Krankentransport“, „Prio 4“ → KTW; „Weitergabe“, „Beratung“.
 * null = am Namen nicht erkennbar.
 */
export function stufeRaten(stufe: string): StufeDef | null {
  const t = stufe.toLowerCase();
  const prio = t.match(/\b(?:prio(?:rit[aä]t)?|dringlichkeit(?:sstufe)?|stufe|p)\s*\.?\s*([0-9])\b/)?.[1];
  const d = (x: Partial<StufeDef>): StufeDef => ({ ...defaultStufeFuer(stufe), ...x });
  if (/weitergabe|weiterleitung|andere (stelle|leitstelle)|kein(e)? (rettungs|einsatz)/.test(t)) return d({ rettungsmittel: "", sondersignal: false, kategorie: "stabil", transportProzent: 0 });
  if (/telemed|beratung|telefonisch/.test(t)) return d({ rettungsmittel: "KTW>RTW>RTW-C", sondersignal: false, kategorie: "stabil", transportProzent: 30 });
  if (/reanimation|stillstand|\brea\b/.test(t)) return d({ rettungsmittel: "RTW-C>RTW>KTW", notarzt: "schnellster", kategorie: "kritisch", transportProzent: 70 });
  if (/notarzt|\bnef\b|\bna\b|lebensbedroh|\brot\b|\bechos?\b|\bdelta\b|h[oö]chste/.test(t) || prio === "1")
    return d({ rettungsmittel: "RTW-C>RTW>KTW", notarzt: "nef", kategorie: "kritisch", transportProzent: 85 });
  if (/krankentransport|\bktw\b|termin|\bblau\b|nicht dringend|ohne eile/.test(t) || (prio !== undefined && Number(prio) >= 4))
    return d({ rettungsmittel: "KTW>RTW>RTW-C", sondersignal: false, kategorie: "stabil", transportProzent: 65 });
  if (/ohne (sondersignal|blaulicht|signal)|gr[uü]n/.test(t) || prio === "3") return d({ rettungsmittel: "RTW>KTW>RTW-C", sondersignal: false, kategorie: "stabil", transportProzent: 70 });
  if (/sondersignal|blaulicht|dringend|orange|gelb/.test(t) || prio === "2") return d({ rettungsmittel: "RTW>RTW-C>KTW", kategorie: "dringend", transportProzent: 75 });
  return null;
}

/** Standardwerte für eine Stufe, die in den Einstellungen (noch) nicht vorkommt. */
export function defaultStufeFuer(stufe: string): StufeDef {
  return {
    stufe,
    rettungsmittel: "RTW>RTW-C>KTW",
    nfsErforderlich: false,
    notarzt: "nein",
    sondersignal: true,
    kategorie: "dringend",
    transportProzent: 70,
  };
}

export interface Gebiet {
  name: string;
  /** [min_lon, min_lat, max_lon, max_lat] */
  bbox: [number, number, number, number];
}

export const GEBIETE: Gebiet[] = [
  { name: "Krems an der Donau (Stadt und Land)", bbox: [15.32, 48.27, 15.82, 48.6] },
];

export interface Settings {
  status: StatusDef[];
  stufen: StufeDef[];
  /** Anteil der Kategorien an den Notfällen (relativ; früher: Einsätze pro Stunde) */
  aufkommen: Record<Kategorie, number>;
  /** Aufkommen je Stunde (0–23): Notfälle (rd) und Krankentransporte (kt) pro Stunde */
  stunden: { rd: number; kt: number; sek: number }[];
  /** Daueraufträge (Dialyse/Bestrahlung) je Krankenhaus mit Dialyse/Strahlentherapie im Gebiet */
  dauerDialyseJeKh: number;
  dauerStrahlJeKh: number;
  /** fixe Chemotherapie-Fahrten je Krankenhaus mit onkologischer Tagesklinik */
  dauerChemoJeKh: number;
  generatorAktiv: boolean;
  generatorQuelle: "zufall" | "vorlagen";
  /** Neue Einsätze kommen als Anruf mit Notrufabfrage (wenn ein Abfrageschema importiert ist) */
  anrufe: boolean;
  /** Work in Progress: Einsätze in Nachbarzonen, zu denen eigene Fahrzeuge fahren */
  fremdzoneAktiv?: boolean;
  /** solche Einsätze pro Stunde (ungefähr) */
  fremdzoneProStunde?: number;
  /** Krankenhäuser: zufällige Grundbelegung (andere Leitstellen, Selbstzuweiser) */
  khGrundAktiv?: boolean;
  /** Stärke der Grundbelegung (1 = normal, 0–2) */
  khGrundFaktor?: number;
  /** Wie oft sich Lagen verändern (Verschlechterung, Irrtum des Anrufers, mehr Betroffene) */
  komplikationen: "ruhig" | "normal" | "fordernd";
  /** Einsätze aus dem Fallkatalog: aus, gemischt (mit den bisherigen Fallgeschichten) oder nur Katalog */
  fallKatalog?: "aus" | "gemischt" | "nur";
  /** Transportverweigerung (Revers): aus, selten (halb so oft) oder normal */
  revers?: "aus" | "selten" | "normal";
  /** Rendezvous RTW–NEF, wenn das NEF noch mehr als 15 Minuten entfernt ist (Standard an) */
  rendezvous?: boolean;
  gebiet: Gebiet;
  /** Fahrzeit mit Sondersignal = Fahrzeit × Faktor */
  sondersignalFaktor: number;
  /** Minuten, die ein besser passendes Rettungsmittel länger brauchen darf */
  toleranzMin: number;
  /** Abstand in Metern, ab dem eine eingegebene Adresse als falsch verortet gilt */
  verortungRadius: number;
  /** Anteil der Anrufer, die eine falsche/ungenaue Adresse nennen (%) */
  falscheAdresseProzent: number;
  wetterAktiv: boolean;
  /** Funk: Besatzungen lassen manchmal etwas weg (BEL fast nie, KTW öfter) – man muss nachfragen */
  funkUnvollstaendig?: boolean;
  /** veraltet (bis 0.14): realistisch/wechselhaft/fest – ersetzt durch wetterWechsel */
  wetterModus?: "realistisch" | "wechselhaft" | "fest";
  /** Wetter: 0 = fix (festes Wetter) … 100 = sehr wechselhaft */
  wetterWechsel?: number;
  /** Jahreszeit fürs Wetter: auto = nach Spieldatum */
  jahreszeit?: "auto" | "fruehling" | "sommer" | "herbst" | "winter";
  wetterFestLage?: string;
  wetterFestTemp?: number;
  /** TETRA-Funkgruppe = Einsatzgebiet (z. B. „NÖ-03“) */
  funkgruppe?: string;
  /** Rückruf nur möglich, wenn die Rückrufnummer aufgenommen wurde */
  rueckrufNurMitNummer?: boolean;
  nahGeschwindigkeit: number;
  /** veraltet (bis v0.8), ersetzt durch ausrueck */
  nahStartzeitSek: number;
  /** Ausrückzeiten in Sekunden [min, max]; Tag = tagVon bis tagBis Uhr */
  ausrueck: {
    tagVon: number;
    tagBis: number;
    bodenTag: [number, number];
    bodenNacht: [number, number];
    nahTag: [number, number];
    nahNacht: [number, number];
    /** frei unterwegs (Status Funk): Sekunden bis zur Abfahrt */
    unterwegs: number;
    /** Bereitschaft: zusätzliche Minuten zur Ausrückzeit der Wache */
    bereitschaftPlusMin: number;
  };
}

/** Standard-Tagesverlauf: nachts wenig, Spitzen am Vormittag; Krankentransporte vor allem tagsüber */
export function defaultStunden(): Settings["stunden"] {
  const rd = [3, 2.5, 2, 2, 2, 2.5, 4, 5.5, 6.5, 7, 7, 7, 7, 6.5, 6.5, 6.5, 6.5, 6.5, 6, 5.5, 5, 4.5, 4, 3.5];
  const kt = [0.3, 0.2, 0.2, 0.2, 0.3, 0.8, 3, 5, 6, 6, 5.5, 5, 5, 4.5, 4, 3.5, 3, 2, 1.5, 1, 0.7, 0.5, 0.4, 0.3];
  // Überstellungen: geplante vor allem tagsüber (ca. 10 am Tag im Gebiet)
  const sek = [0.15, 0.1, 0.1, 0.1, 0.1, 0.15, 0.3, 0.6, 0.8, 0.9, 0.9, 0.8, 0.7, 0.8, 0.8, 0.7, 0.6, 0.5, 0.35, 0.3, 0.25, 0.2, 0.2, 0.15];
  return rd.map((r, i) => ({ rd: r, kt: kt[i], sek: sek[i] }));
}

export function defaultAusrueck(): Settings["ausrueck"] {
  return { tagVon: 5, tagBis: 22, bodenTag: [30, 120], bodenNacht: [120, 600], nahTag: [120, 300], nahNacht: [300, 600], unterwegs: 10, bereitschaftPlusMin: 5 };
}

export function defaultSettings(): Settings {
  return {
    status: DEFAULT_STATUS.map((s) => ({ ...s })),
    stufen: defaultStufen(),
    aufkommen: { stabil: 2, dringend: 3, kritisch: 1 },
    stunden: defaultStunden(),
    dauerDialyseJeKh: 6,
    dauerStrahlJeKh: 3,
    dauerChemoJeKh: 1,
    generatorAktiv: true,
    generatorQuelle: "zufall",
    anrufe: true,
    fremdzoneAktiv: false,
    fremdzoneProStunde: 1,
    khGrundAktiv: true,
    khGrundFaktor: 1,
    komplikationen: "normal",
    fallKatalog: "nur",
    revers: "normal",
    gebiet: GEBIETE[0],
    sondersignalFaktor: 0.8,
    toleranzMin: 10,
    verortungRadius: 250,
    falscheAdresseProzent: 15,
    wetterAktiv: true,
    rueckrufNurMitNummer: false,
    funkgruppe: "NÖ-03",
    wetterWechsel: 50,
    jahreszeit: "auto",
    wetterFestLage: "klar",
    wetterFestTemp: 18,
    nahGeschwindigkeit: 220,
    nahStartzeitSek: 180,
    ausrueck: defaultAusrueck(),
  };
}

/** Ergänzt gespeicherte (evtl. ältere) Einstellungen um fehlende Felder. */
export function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!saved) return d;
  const status = DEFAULT_STATUS.map((def) => ({ ...def, ...(saved.status?.find((s) => s.key === def.key) ?? {}) }));
  // Gespeicherte Stufen aus älteren Versionen (ohne Rangfolge) durch die neuen Standardwerte ersetzen
  const savedStufen = (saved.stufen ?? []).filter((s) => typeof (s as Partial<StufeDef>).rettungsmittel === "string");
  const stufen = d.stufen.map((def) => ({ ...def, ...(savedStufen.find((s) => s.stufe === def.stufe) ?? {}) }));
  for (const s of savedStufen) if (!stufen.some((x) => x.stufe === s.stufe)) stufen.push(s);
  return { ...d, ...saved, status, stufen, aufkommen: { ...d.aufkommen, ...(saved.aufkommen ?? {}) }, ausrueck: { ...d.ausrueck, ...(saved.ausrueck ?? {}) }, stunden: saved.stunden?.length === 24 ? saved.stunden.map((x, i) => ({ ...d.stunden[i], ...x })) : d.stunden };
}
