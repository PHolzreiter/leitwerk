/**
 * Großeinsatz (ab NF5): eigener Reiter mit Bereitstellungsraum, Lagemeldung, Patientenliste (je Patient buchen),
 * Voraviso an die Krankenhäuser und den Kräften am Berufungsort und im Bereitstellungsraum.
 * Inhalt aus dem Entwurf: src/ui/fenster/grosseinsatz. Dazu geht beim Start der Funk auf (Sprechgruppe Großeinsatz).
 */
import { sim } from "../../sim/engine";
import { el } from "../dom";
import { grosseinsatzFenster } from "../fenster/grosseinsatz";
import { panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { IST_HAUPT } from "../ws/bus";

export { grosseinsaetze } from "../fenster/grosseinsatz";

function grosseinsatz(ctx: PanelKontext) {
  const root = el("div", { class: "pl gs-ew-panel" });
  let titel = "";
  let badge: boolean | null = null;
  const f = grosseinsatzFenster(root, {
    titel: (t) => {
      if (t !== titel) ctx.setzeTitel((titel = t));
    },
    badge: (an) => {
      if (an !== badge) ctx.setzeBadge((badge = an) ? "!" : null, "warn");
    },
  });
  let wartet = false;
  const aus = sim.onChange(() => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      f.zeichnen();
    }, 500);
  });
  return {
    el: root,
    dispose: () => {
      aus();
      f.entfernen();
    },
  };
}

registriere({ komponente: "grosseinsatz", titel: "Großeinsatz", info: "Großschadensfall: Bereitstellungsraum, Lagemeldung, Patienten buchen, Voraviso", bereich: "rechts", erstellen: grosseinsatz });

// Ein Großeinsatz beginnt: Reiter Großeinsatz und Funk gehen auf (einmal je Einsatz)
const geoeffnet = new Set<string>();
sim.onChange(() => {
  if (!IST_HAUPT) return;
  for (const e of sim.state.einsaetze) {
    if (!e.gs || e.gs.aufgehoben || e.gsKind || e.zustand === "abgeschlossen" || geoeffnet.has(e.id)) continue;
    geoeffnet.add(e.id);
    setTimeout(() => {
      // ein Funkgerät für alle Gruppen: die Großeinsatz-Gruppe kommt dort dazu
      panelZeigen("funk");
      panelZeigen("grosseinsatz");
    }, 50);
  }
});
