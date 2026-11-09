import { DCLogic } from "../../entwurf/dclogic";

type Akv = "ok" | "voll" | "zu";

/** Ein Krankenhaus, wie es das Fenster braucht (aus dem Spiel aufbereitet, siehe index.ts) */
export interface KhHaus {
  id: string;
  kurz: string;
  name: string;
  ort: string;
  land: string;
  /** nimmt Notfälle vom Rettungsdienst */
  rett: boolean;
  /** Plätze je Spalte: [frei, gesamt] · „zu“ · „offen“ · null (gibt es nicht) */
  P: Record<string, [number, number] | "zu" | "offen" | null>;
  /** Akutversorgung je Spalte: ein Zustand oder mehrere (Schockräume) · null */
  A: Record<string, Akv | Akv[] | null>;
  Pr: Record<string, string[]>;
  Pt: Record<string, string>;
  Ab: Record<string, string | undefined>;
  At: Record<string, string>;
  rad: "" | "ja" | "nein";
  radTitel: string;
}

export interface BelegZeile {
  a: string;
  bis: string;
  fz: string;
  grund: string;
}

export interface KhStatusApp {
  ansicht: "plaetze" | "akut";
  gemerkt: Record<string, unknown>;
  merken(p: Record<string, unknown>): void;
  haeuser(): KhHaus[];
  belegung(id: string, art: "p" | "a", k: string): BelegZeile[];
  oeffnen(id: string): void;
}

export declare class KHStatusLogik extends DCLogic {}
