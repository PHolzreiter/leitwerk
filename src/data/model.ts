/** Datenmodell einer Leitstelle (Stammdaten). */
import { BEREICH_EINRICHTUNG, einrichtung, einrichtungenAusAlt } from "./klinik";
import type { Schicht } from "../sim/dienst";

/** Herkunft eines Datensatzes. */
export type Origin = "standard" | "import" | "manuell";

export const ORIGIN_LABEL: Record<Origin, string> = {
  standard: "Standard",
  import: "Import",
  manuell: "Manuell",
};

interface Base {
  id: string;
  hinweis: string;
  herkunft: Origin;
  /** z. B. Dateiname des Imports */
  herkunftDetail?: string;
}

export const STATION_TYPES = [
  "Rettungsdienst",
  "Notarztstützpunkt",
  "Luftrettung",
  "Feuerwehr",
  "Polizei",
  "Wasserrettung",
  "Bergrettung",
  "Leitstelle",
  "Sonstige",
] as const;

export interface Station extends Base {
  name: string;
  organisation: string;
  typ: string;
  ort: string;
  bezirk: string;
  adresse: string;
  lat: number;
  lon: number;
}

/** Fahrzeugkategorien. RTW umfasst RTW und RTW-C (Unterscheidung über den Typ). */
export const VEHICLE_CATEGORIES = ["RTW", "NEF", "NAH", "KTW", "SKTW", "SRTW", "SNAW", "BIT", "ITH", "BEL", "EL ÖBB", "Sonstige"] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];
export const ACTIVE_CATEGORIES: readonly VehicleCategory[] = ["RTW", "NEF", "NAH", "KTW", "SKTW", "SRTW", "SNAW", "BIT", "ITH", "BEL", "EL ÖBB"];
/** Sekundärfahrzeuge: nur vorgeschlagen, wenn kein passendes Primärfahrzeug verfügbar ist */
export const SEKUNDAER: readonly VehicleCategory[] = ["SKTW", "SRTW", "SNAW", "BIT", "ITH"];

export interface Vehicle extends Base {
  funkrufname: string;
  kurzname: string;
  kategorie: VehicleCategory;
  /** Originaltyp, z. B. „RTW-C“ oder „KTW-B“ */
  typ: string;
  dienststelleId: string;
  aktiv: boolean;
  /** nur für NAH: darf nachts fliegen */
  nachtflug: boolean;
  /** Dienstplan (leer = rund um die Uhr, Teams 07–19 und 19–07) */
  dienstplan?: Schicht[];
  /** Fahrzeuggröße: „gross“ = Großraum (VW Crafter), „klein“ = Hochdach (VW T6) */
  aufbau?: "klein" | "gross";
  /** Ersatz-NEF eines Hubschraubers (Funkrufname des NAH): nur angemeldet, wenn dieser nicht fliegen kann */
  ersatzFuer?: string;
  /** Fahrzeugmodell, wo es eine Wahl gibt (KTW: t6hoch/sprinter_kurz, BEL: passat/t6); leer = zufällig fest je Funkrufname */
  modell?: string;
}

/** Wählbare Fahrzeugmodelle je Kategorie (leer = zufällig) */
export const MODELL_WAHL: Partial<Record<VehicleCategory, [string, string][]>> = {
  KTW: [
    ["t6hoch", "VW T6 Hochdach"],
    ["sprinter_kurz", "Mercedes Sprinter (kurz, ohne Hochdach)"],
  ],
  BEL: [
    ["passat", "VW Passat"],
    ["t6", "VW T6 (ohne Hochdach)"],
  ],
};

/** Ausführungen je Kategorie (zweites Feld im Fahrzeug-Dialog); nicht aufgeführt = keine Wahl */
export const AUSFUEHRUNGEN: Partial<Record<VehicleCategory, { id: string; label: string; typ: string; aufbau?: "klein" | "gross"; kategorie?: VehicleCategory }[]>> = {
  BEL: [
    { id: "bel", label: "BEL (Bezirkseinsatzleiter)", typ: "BEL", kategorie: "BEL" },
    { id: "el_oebb", label: "EL ÖBB (VW Caddy)", typ: "EL ÖBB", kategorie: "EL ÖBB" },
  ],
  RTW: [
    { id: "rtw", label: "RTW (VW T6 Hochdach)", typ: "RTW", aufbau: "klein" },
    { id: "rtw_gross", label: "RTW groß (VW Crafter, kein C)", typ: "RTW", aufbau: "gross" },
    { id: "rtwc", label: "RTW-C (VW Crafter, Notfallsanitäter-Kompetenz)", typ: "RTW-C", aufbau: "gross" },
  ],
  KTW: [
    { id: "ktw", label: "KTW", typ: "KTW" },
    { id: "ktwb", label: "KTW-B (Zivildienst – ohne Blaulicht)", typ: "KTW-B" },
  ],
  NEF: [
    { id: "nef", label: "NEF (VW T6)", typ: "NEF" },
    { id: "nef_oeamtc", label: "NEF ÖAMTC (VW Tiguan)", typ: "NEF ÖAMTC" },
  ],
};

/** Fahrzeugtypen mit eigener Bedeutung in der Simulation (Typ-Feld) */
export const FAHRZEUG_TYPEN: { typ: string; kategorie: VehicleCategory; label: string }[] = [
  { typ: "RTW-C", kategorie: "RTW", label: "RTW-C (mit Notfallsanitäter-Kompetenz, Großraum)" },
  { typ: "RTW", kategorie: "RTW", label: "RTW" },
  { typ: "KTW", kategorie: "KTW", label: "KTW" },
  { typ: "KTW-B", kategorie: "KTW", label: "KTW-B (Zivildienst – ohne Blaulicht)" },
  { typ: "NEF", kategorie: "NEF", label: "NEF" },
  { typ: "NEF ÖAMTC", kategorie: "NEF", label: "NEF ÖAMTC (Ausweich-NEF am Hubschrauberstützpunkt)" },
  { typ: "NAH", kategorie: "NAH", label: "NAH (Notarzthubschrauber)" },
  { typ: "ITH", kategorie: "ITH", label: "ITH (Intensivtransport-Hubschrauber)" },
  { typ: "SKTW", kategorie: "SKTW", label: "SKTW" },
  { typ: "SRTW", kategorie: "SRTW", label: "SRTW" },
  { typ: "SNAW", kategorie: "SNAW", label: "SNAW" },
  { typ: "BIT", kategorie: "BIT", label: "BIT (Schwerlast)" },
  { typ: "BEL", kategorie: "BEL", label: "BEL (Bezirkseinsatzleiter)" },
  { typ: "EL ÖBB", kategorie: "EL ÖBB", label: "EL ÖBB" },
];

export const HOSPITAL_FLAGS = [
  "notfallambulanz",
  "schockraum",
  "unfallambulanz",
  "kinderambulanz",
  "intensiv_anaesthesie",
  "neurologie",
  "kinderintensiv",
  "neonatologie",
  "hno",
  "urologie",
  "gyn_geburtshilfe",
] as const;
export type HospitalFlag = (typeof HOSPITAL_FLAGS)[number];

export const HOSPITAL_FLAG_LABEL: Record<HospitalFlag, string> = {
  notfallambulanz: "Notfallambulanz",
  schockraum: "Schockraum",
  unfallambulanz: "Unfallambulanz",
  kinderambulanz: "Kinderambulanz",
  intensiv_anaesthesie: "Intensiv / Anästhesie",
  neurologie: "Neurologie",
  kinderintensiv: "Kinderintensiv",
  neonatologie: "Neonatologie",
  hno: "HNO",
  urologie: "Urologie",
  gyn_geburtshilfe: "Gyn. / Geburtshilfe",
};

export interface Hospital extends Base {
  name: string;
  kurzname: string;
  ort: string;
  lat: number;
  lon: number;
  /** Einrichtungen (Stationen, Intensiv, Ambulanzen, Funktionsbereiche, Zentren), IDs aus klinik.json */
  einrichtungen?: string[];
  /** abgeschaltete Akut-Abteilungen (Station vorhanden, aber keine Akutaufnahme) */
  akutAus?: string[];
  /** veraltet: frühere Abteilungs-Häkchen (nur noch zum Einlesen alter Daten) */
  abteilungen?: Partial<Record<HospitalFlag, boolean>>;
  /** veraltet: frühere Bereichskürzel (nur noch zum Einlesen alter Daten) */
  bereiche?: string[];
}

/** Stationen und Ambulanzen/Bereiche eines Krankenhauses (Kürzel → Name) */
export const BEREICHE_STATION: Record<string, string> = {
  INT: "Innere Medizin",
  KAR: "Kardiologie",
  GAS: "Gastroenterologie",
  PUL: "Pulmologie",
  NEP: "Nephrologie",
  ONK: "Onkologie/Hämatologie",
  CHI: "Chirurgie",
  ORT: "Orthopädie und Traumatologie",
  NEU: "Neurologie",
  NCH: "Neurochirurgie",
  URO: "Urologie",
  GYN: "Gynäkologie/Geburtshilfe",
  KIN: "Kinder- und Jugendheilkunde",
  HNO: "HNO",
  AUG: "Augen",
  DER: "Dermatologie",
  PSY: "Psychiatrie",
  GER: "Akutgeriatrie/Remobilisation",
  PAL: "Palliativ",
  ITS: "Intensivstation",
  NEO: "Neonatologie",
  PIC: "Kinderintensivstation",
  HCH: "Herzchirurgie",
  VER: "Verbrennungszentrum",
};
export const BEREICHE_AMBULANZ: Record<string, string> = {
  ZNA: "Zentrale Notaufnahme",
  UNF: "Unfallambulanz",
  DIA: "Dialyse",
  STR: "Strahlentherapie",
  CHE: "Onkologische Tagesklinik",
  RAD: "Radiologie (CT/MRT)",
  NUK: "Nuklearmedizin",
  HKL: "Herzkatheterlabor",
  THR: "Neurointervention (Thrombektomie)",
  END: "Endoskopie",
  PHY: "Physikalische Medizin",
  WUN: "Wundambulanz",
  SCH: "Schmerzambulanz",
};
export const BEREICHE: Record<string, string> = { ...BEREICHE_STATION, ...BEREICHE_AMBULANZ };

/**
 * Ziele für Krankentransporte: Bereichskürzel (für die Auftragsarten) aus den Einrichtungen,
 * dazu alle weiteren Stationen, Ambulanzen und Funktionsbereiche mit ihrer ID.
 */
export function bereicheVon(h: Hospital): string[] {
  const e = h.einrichtungen?.length ? h.einrichtungen : einrichtungenAusAlt(h.abteilungen, h.bereiche);
  const s = new Set(e);
  const out: string[] = [];
  const gedeckt = new Set<string>();
  for (const [k, ids] of Object.entries(BEREICH_EINRICHTUNG)) {
    const ok = k === "THR" ? s.has("fb_angiographie") && s.has("its_stroke_unit") : ids.some((i) => s.has(i));
    if (ok) {
      out.push(k);
      ids.forEach((i) => gedeckt.add(i));
    }
  }
  for (const id of e) {
    const x = einrichtung(id);
    if (x && !gedeckt.has(id) && x.typ !== "zentrum") out.push(id);
  }
  return out;
}

/** Name eines Bereichs (Kürzel oder Einrichtungs-ID) */
export function bereichName(k: string): string {
  return BEREICHE[k] ?? einrichtung(k)?.name ?? k;
}

export interface Poi extends Base {
  name: string;
  typ: string;
  ort: string;
  lat: number;
  lon: number;
}

/** Vorlage für einen Einsatz (statt zufällig erzeugter Einsätze). */
export interface Einsatzvorlage extends Base {
  code: string;
  adresse: string;
  lat: number;
  lon: number;
  /** Was der Anrufer meldet */
  meldung: string;
  /** leer = zufällig */
  patientAlter: number | null;
  /** leer = nach Wahrscheinlichkeit der Stufe */
  transport: boolean | null;
}

/** Einsatzcode (eigene, importierte Liste). Die Kategorie ist die Einsatzstufe, z. B. „ALS rot“. */
export interface Einsatzcode extends Base {
  code: string;
  name: string;
  kategorie: string;
  /** z. B. „10 - Brustschmerz“ (Nummer und Name des Kapitels) */
  kapitel: string;
}

export type Kind = "stations" | "vehicles" | "hospitals" | "pois" | "templates" | "codes";

export interface KindMap {
  stations: Station;
  vehicles: Vehicle;
  hospitals: Hospital;
  pois: Poi;
  templates: Einsatzvorlage;
  codes: Einsatzcode;
}

export const KINDS: Kind[] = ["stations", "vehicles", "hospitals", "pois", "templates", "codes"];

export const KIND_LABEL: Record<Kind, string> = {
  stations: "Dienststellen",
  vehicles: "Fahrzeuge",
  hospitals: "Krankenhäuser",
  pois: "Orte (POIs)",
  templates: "Einsatzvorlagen",
  codes: "Einsatzcodes",
};

export const KIND_SINGULAR: Record<Kind, string> = {
  stations: "Dienststelle",
  vehicles: "Fahrzeug",
  hospitals: "Krankenhaus",
  pois: "Ort (POI)",
  templates: "Einsatzvorlage",
  codes: "Einsatzcode",
};

/** Dateiname (ohne Endung) für Export, Vorlage und Beispiel. */
export const KIND_FILE: Record<Kind, string> = {
  stations: "dienststellen",
  vehicles: "fahrzeuge",
  hospitals: "krankenhaeuser",
  pois: "pois",
  templates: "einsatzvorlagen",
  codes: "einsatzcodes",
};

export type Records = { [K in Kind]: KindMap[K][] };

export function emptyRecords(): Records {
  return { stations: [], vehicles: [], hospitals: [], pois: [], templates: [], codes: [] };
}

/** Was gespeichert wird: nur eigene Daten, die Standarddaten kommen mit dem Programm. */
export interface Persisted {
  /** 1 = bis v0.3.0, 2 = ab v0.3.1 (KTW eingesetzt, AMB/Sekundär nicht), 3 = ab v0.9 (Sekundär + BEL eingesetzt) */
  version: number;
  standardAktiv: boolean;
  /** IDs von Standard-Datensätzen, die gelöscht (ausgeblendet) wurden */
  ausgeblendet: string[];
  eigene: Records;
  /** Simulations-Einstellungen (siehe sim/settings.ts) */
  einstellungen?: unknown;
  /** Importiertes Abfrageschema (Notrufabfrage), siehe abfrage/schema.ts */
  abfrageschema?: unknown;
}

export function emptyPersisted(): Persisted {
  return { version: 5, standardAktiv: true, ausgeblendet: [], eigene: emptyRecords() };
}
