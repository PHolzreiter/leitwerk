import { DCLogic } from "../../entwurf/dclogic";

/** Ein Fahrzeug, wie es das Fenster braucht (aus dem Spiel aufbereitet, siehe index.ts) */
export interface FzZeile {
  id: string;
  ruf: string;
  typ: string;
  wache: string;
  /** Status (Schlüssel im Spiel) */
  key: string;
  /** Kürzel für die Zeilenfarbe (Klasse s1, s6, sa …) */
  s: string;
  /** Statusziffer/-buchstabe zur Anzeige */
  nr: string;
  stx: string;
  funk: boolean;
  /** eigene Statusfarbe aus den Einstellungen (CSS), sonst leer */
  stil: string;
  crew: string[];
  auf: [string, string] | null;
  eta: string;
  etaMin: number | null;
  von: string;
  nach: string;
  codes: { c: string; text: string }[];
  fremd: boolean;
  aussen: boolean;
  aktiv: boolean;
  gKey: string;
  gName: string;
  rtw: boolean;
  ktw: boolean;
  nef: boolean;
  nah: boolean;
  sek: boolean;
  el: boolean;
  marken: { t: string; titel: string; cls: string; fz: string }[];
  suche: string;
}

export interface LogZeile {
  zeit: string;
  id: string;
  ruf: string;
  von: string;
  nach: string;
  text: string;
  einsatz: boolean;
  fremd: boolean;
  suche: string;
}

export interface StatusAnzeige {
  nr: string;
  name: string;
  farbe: string;
  funk: boolean;
}

export interface FahrzeugeApp {
  ansicht: "alle" | "aktive" | "log";
  gemerkt: Record<string, unknown>;
  merken(p: Record<string, unknown>): void;
  fahrzeuge(): FzZeile[];
  log(): LogZeile[];
  status: Record<string, StatusAnzeige>;
  menueStatus: string[];
  bereichName(): string;
  bereichGeaendert?(): void;
  klick(id: string): void;
  folgen(id: string): void;
  logKlick(id: string): void;
  setzeStatus(id: string, key: string): void;
  weitere(id: string): { t: string; klick: () => void }[];
}

export declare class FahrzeugeLogik extends DCLogic {}
