/** Datenmodell einer Leitstelle (Stammdaten). */

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
}

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
  abteilungen: Record<HospitalFlag, boolean>;
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
  pois: "POIs",
  templates: "Einsatzvorlagen",
  codes: "Einsatzcodes",
};

export const KIND_SINGULAR: Record<Kind, string> = {
  stations: "Dienststelle",
  vehicles: "Fahrzeug",
  hospitals: "Krankenhaus",
  pois: "POI",
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
  return { version: 3, standardAktiv: true, ausgeblendet: [], eigene: emptyRecords() };
}
