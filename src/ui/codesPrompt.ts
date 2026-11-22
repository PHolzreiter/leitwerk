/** Hinweis, wenn keine Einsatzcodes da sind (kommt praktisch nicht vor – das eingebaute Codesystem ist immer da). */
import { hasCodes } from "../sim/codes";
import { openDialog } from "./dialog";
import { el } from "./dom";

/** Gibt true zurück, wenn Codes vorhanden sind. Sonst ein Hinweis, wo man die eigene Datei hochlädt. */
export function ensureCodes(onImported?: () => void): boolean {
  if (hasCodes()) return true;
  void onImported;
  const body = el("div", { class: "update-box" });
  body.innerHTML = `<p>Für die Simulation braucht LeitWerk <b>Einsatzcodes</b>. Das eingebaute LeitWerk-Codesystem ist abgeschaltet und keine eigene Datei aktiv.</p>
    <p class="muted">Unter <b>Einstellungen → Eigene Dateien → Notruf (RD)</b> wählst du oben „Eingebaut“ oder lädst deine Notruf-Datei hoch (eine Datei mit Abfrage und Codes).</p>`;
  openDialog({ title: "Keine Einsatzcodes", body, actions: [{ label: "OK", kind: "primary" }] });
  return false;
}
