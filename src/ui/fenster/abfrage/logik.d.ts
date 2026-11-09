import { DCLogic } from "../../entwurf/dclogic";

/** Logik des Abfrage-Fensters (aus dem Entwurf, reines JavaScript) */
export declare class AbfrageLogik extends DCLogic {
  msgsRef: { current: HTMLElement | null };
  fragRef: { current: HTMLElement | null };
  _halteFokus?: (sec: HTMLElement) => void;
}
