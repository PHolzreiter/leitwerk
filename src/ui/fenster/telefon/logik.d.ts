import { DCLogic } from "../../entwurf/dclogic";

/** Logik des Telefon-Fensters (aus dem Entwurf, reines JavaScript) */
export declare class TelefonLogik extends DCLogic {
  auflRefs: Map<string, { current: HTMLElement | null }>;
  _nVerp?: number;
}
