/** Hinweis „Einsatzcodes importieren“, wenn noch keine Codeliste da ist. */
import { hasCodes } from "../sim/codes";
import { openDialog } from "./dialog";
import { el } from "./dom";
import { startImport } from "./importDialog";

/**
 * Gibt true zurück, wenn Codes vorhanden sind. Sonst erscheint ein Fenster mit
 * „Datei wählen …“; nach erfolgreichem Import wird onImported aufgerufen.
 */
export function ensureCodes(onImported?: () => void): boolean {
  if (hasCodes()) return true;
  const body = el("div", { class: "update-box" });
  body.innerHTML = `<p>Für die Simulation braucht LeitWerk eine Liste mit <b>Einsatzcodes</b>. Sie ist nicht im Programm enthalten,
    du importierst sie einmalig als CSV-Datei – oder du lädst gleich dein <b>Abfrageschema</b> (JSON-Datei),
    dann kommen Einsätze als Notruf, den du abfragst, und die Codes werden mit übernommen.</p>
    <p class="muted">Nötig ist die Spalte „Code“, dazu Name, Kategorie (z. B. „ALS rot“) und Kapitel.
    Später findest du die Liste unter <b>Daten → Einsatzcodes</b>, dort kannst du sie bearbeiten, ergänzen oder neu importieren.</p>`;
  openDialog({
    title: "Einsatzcodes importieren",
    body,
    actions: [
      { label: "Später" },
      {
        label: "Datei wählen …",
        kind: "primary",
        onClick: () => {
          void startImport("codes", () => {
            if (hasCodes()) onImported?.();
          });
        },
      },
    ],
  });
  return false;
}
