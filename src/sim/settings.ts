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
  /** Einsätze pro Stunde je Kategorie */
  aufkommen: Record<Kategorie, number>;
  generatorAktiv: boolean;
  generatorQuelle: "zufall" | "vorlagen";
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
  nahGeschwindigkeit: number;
  nahStartzeitSek: number;
}

export function defaultSettings(): Settings {
  return {
    status: DEFAULT_STATUS.map((s) => ({ ...s })),
    stufen: defaultStufen(),
    aufkommen: { stabil: 2, dringend: 3, kritisch: 1 },
    generatorAktiv: true,
    generatorQuelle: "zufall",
    gebiet: GEBIETE[0],
    sondersignalFaktor: 0.8,
    toleranzMin: 10,
    verortungRadius: 250,
    falscheAdresseProzent: 15,
    wetterAktiv: true,
    nahGeschwindigkeit: 220,
    nahStartzeitSek: 180,
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
  return { ...d, ...saved, status, stufen, aufkommen: { ...d.aufkommen, ...(saved.aufkommen ?? {}) } };
}
