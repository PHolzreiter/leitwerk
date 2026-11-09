import { DCLogic } from "../../entwurf/dclogic";

export interface KarteTreffer {
  art: string;
  titel: string;
  zusatz: string;
  lat: number;
  lon: number;
  zoom: number;
  /** Einsatz, Transport oder Fahrzeug: wird gewählt */
  ziel?: { art: "einsatz" | "kt" | "fz" | "wache" | "kh"; id: string };
}

export interface KarteInfo {
  /** Bildschirmpunkt der Marke (Pixel im Fenster) */
  x: number;
  y: number;
  titel: string;
  unter: string;
  st?: string;
  stCls?: string;
  stStil?: string;
  zeilen: { l: string; w: string }[];
  knoepfe: { t: string; cls?: string; klick(): void }[];
}

export interface KarteSicht {
  dim: "2d" | "3d";
  basis: "karte" | "sat";
  gelaende: boolean;
  ebenen: Record<string, boolean>;
  entwickler: boolean;
  funkgruppe: string;
  treffer: KarteTreffer[];
  trefferFuer: string;
  info: KarteInfo | null;
  ctx: { x: number; y: number; lat: number; lon: number } | null;
  folgt: string | null;
  meldung: { text: string; knopf: boolean } | null;
  /** Ort auf der Karte wählen: Titel des Banners */
  waehlt: string | null;
  mass: { text: string; px: number };
  quelle: string;
  quelleTitel: string;
  drehung: number;
  toast?: string;
}

export interface KarteApp {
  sicht(): KarteSicht;
  suche(q: string): void;
  trefferWaehlen(t: KarteTreffer | null): void;
  setzeDim(d: "2d" | "3d"): void;
  setzeBasis(b: "karte" | "sat"): void;
  setzeEbene(k: string, an: boolean): void;
  zoom(richtung: 1 | -1): void;
  /** false = kein Einsatz gewählt */
  aufEinsatz(): boolean;
  norden(): void;
  infoZu(): void;
  ctxZu(): void;
  koordKopieren(): void;
  anlegen(art: "stations" | "hospitals" | "pois"): void;
  folgtAus(): void;
  meldungZu(): void;
  meldungAktion(): void;
  waehlZu(): void;
}

export declare class KarteLogik extends DCLogic {
  constructor(props?: Record<string, unknown>);
  zeige(text: string): void;
}
