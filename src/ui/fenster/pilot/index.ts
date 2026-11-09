/**
 * Pilotenansicht (Entwurf „Pilot“, LeitWerk Arbeitsplatz 09.11.) – Vorlage, CSS und Logik aus dem Entwurf.
 * Die Daten und Aktionen kommen aus pilotView.ts (ansichtDaten / ansichtAktionen); nach jedem Zeichnen hängt
 * pilotView die Teile ein, die nicht aus der Vorlage kommen (Karte, Funk, Logo, Wetter-Inhalt).
 */
import vorlage from "./vorlage.html?raw";
import css from "./pilot.css?raw";
import "../../ws/kopfleiste.css";
import { entwurfEinbinden, type EntwurfFenster } from "../../entwurf/einbinden";
import { PilotLogik } from "./logik.js";

export type { PilotLogik };

export interface PilotApp {
  /** Stand für die Vorlage (bei jedem Zeichnen neu) */
  daten(): unknown;
  /** Aktionen (Status, Buchung, Schubladen …) */
  a: Record<string, (...x: never[]) => unknown>;
}

export function pilotAnsichtEinbinden(ziel: HTMLElement, app: PilotApp, nachZeichnen: (f: EntwurfFenster<PilotLogik>) => void): EntwurfFenster<PilotLogik> {
  const f = entwurfEinbinden(ziel, "pilot", vorlage, css, (p) => new PilotLogik(p), { app });
  const zeichnen = f.k._zeichnen;
  f.k._zeichnen = () => {
    zeichnen?.();
    try {
      nachZeichnen(f);
    } catch (e) {
      console.error("Pilotenansicht", e);
    }
  };
  f.zeichnen();
  return f;
}
