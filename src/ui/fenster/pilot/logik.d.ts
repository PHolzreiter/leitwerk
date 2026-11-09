import { DCLogic } from "../../entwurf/dclogic";

/** Pilotenansicht – Logik aus dem Entwurf (siehe logik.js) */
export declare class PilotLogik extends DCLogic {
  /** offene Schublade (Wetter, Update, Fehler, Spiel) schließen */
  schubladeZu(): void;
  /** ist eine Schublade offen? */
  offen(): boolean;
  /** kurze Meldung unten in der Ansicht */
  toast(t: string): void;
}
