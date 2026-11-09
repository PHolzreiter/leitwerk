/**
 * Karte als Fenster (auch mehrfach, z. B. zweite Karte auf dem zweiten Bildschirm).
 * Aufbau und Bedienung nach dem Entwurf „Karte“: siehe ui/fenster/karte.
 */
import { type EditorDeps } from "../editForm";
import { karteFenster } from "../fenster/karte";
import { registriere } from "../ws/arbeitsplatz";
import { karteWaehlen } from "../ws/auswahl";

/** Editor-Abhängigkeiten (Ort auf der Karte wählen) – setzt das Hauptprogramm */
let editorDeps: EditorDeps = { pickOnMap: (h) => karteWaehlen(h) };
export function setzeEditorDeps(d: EditorDeps): void {
  editorDeps = d;
}

registriere({
  komponente: "karte",
  titel: "Karte",
  info: "Lagekarte mit Einsätzen und Fahrzeugen (auch mehrfach möglich)",
  bereich: "mitte",
  mehrfach: true,
  erstellen: (ctx) => karteFenster(ctx, () => editorDeps),
});
