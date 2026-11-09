/** Logik der Einsatzliste (reines JavaScript aus dem Entwurf, siehe logik.js) */
import { DCLogic } from "../../entwurf/dclogic";

export type ListenLage = "anruf" | "dispo" | "vorgemerkt" | "zumbo" | "ambo" | "zumzo" | "amzo" | "erledigt";

export interface ListenFahrzeug {
  id: string;
  /** Funkrufname */
  r: string;
  /** Typ zur Anzeige */
  typ: string;
  /** Rettungsmitteltyp (für die Reihenfolge NAH, NEF, … RTW, KTW) */
  rm: string;
  /** Statusziffer (1–9, A, F, 0) */
  s: string;
  /** Ort (gekürzt) */
  zu: string;
}

export interface ListenMarke {
  t: string;
  cls: string;
  titel: string;
  wer: boolean;
  ini: string;
  /** dringend: zählt für „nur zu tun“ und den roten Punkt am ⓘ */
  dringend: boolean;
}

export interface ListenEintrag {
  id: string;
  quelle: "einsatz" | "kt";
  art: "rd" | "kt" | "sek";
  nr: string;
  nrVoll: string;
  ein: string;
  lage: ListenLage;
  neu: boolean;
  code: string;
  farbe: string;
  stufe: string;
  sw: string;
  zi: string;
  bo: string;
  boGem: boolean;
  zo: string;
  fz: ListenFahrzeug[];
  mk: ListenMarke[];
  rang: number;
  /** etwas zu tun (Nachforderung, KH-Anfrage, Adresse prüfen …) */
  tun: boolean;
  fremd: boolean;
  gs: boolean;
  /** Suchtext (klein) */
  such: string;
}

export interface ListenApp {
  gemerkt: Record<string, unknown>;
  merken(p: Record<string, unknown>): void;
  daten(): ListenEintrag[];
  keineDaten(): boolean;
  auswahlId(): string | null;
  oeffnen(e: ListenEintrag): void;
  karte(e: ListenEintrag): void;
  neu(art: "kt" | "sek"): void;
  test(art: string, filter?: string): void;
  host(): boolean;
}

export declare const LAGE_T: Record<ListenLage, string>;
export declare const LAGE_L: Record<ListenLage, string>;

export declare class EinsatzlisteLogik extends DCLogic {
  constructor(props?: Record<string, unknown>);
}
