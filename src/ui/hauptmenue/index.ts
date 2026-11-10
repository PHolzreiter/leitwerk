/**
 * Hauptmenü (ersetzt die Startseite und das Einstellungsfenster vor dem Spiel).
 * Logik und Vorlage stammen aus dem Design „LeitWerk Hauptmenü“; angebunden wird über anbindung.ts.
 */
import vorlageRoh from "./vorlage.html?raw";
import css from "./hauptmenue.css?raw";
import { mitSeiten, seitenCss } from "../einstellungen/vorlage";
import { Komponente } from "./komponente.js";
import { ansicht } from "./laufzeit";
import { anbindungBauen, type Anbindung } from "./anbindung";
import { pers } from "../ws/persoenlich";
import { vollbildStart } from "../startseite";

// Einstellungsseiten kommen aus einstellungen/ (gemeinsam mit dem Spielmenü)
const vorlage = mitSeiten(vorlageRoh);

let schonVollbild = false;
let offen: { wurzel: HTMLElement; stil: HTMLStyleElement; k: Komponente; app: Anbindung } | null = null;

export function hauptmenueOffen(): boolean {
  return !!offen;
}

/** Menü zeigen. fertig() läuft, wenn ein Spiel beginnt (Menü schließt sich dann selbst). */
export function hauptmenueZeigen(fertig?: () => void, opt: { splash?: boolean; seite?: string } = {}): void {
  if (offen) return;
  // Wie bisher die Startseite: im Programm Vollbild, beim Spielstart wieder die Fenstergröße von vorher
  // Vollbild nur beim ersten Öffnen (Programmstart). Danach bleibt das Fenster, wie es ist – Hauptmenü und Spiel
  // wechseln im selben Fenster (am Mac: im selben Space), ohne dass ein neues Vollbild-Fenster aufgeht.
  if (!schonVollbild) {
    schonVollbild = true;
    vollbildStart();
  }
  const stil = document.createElement("style");
  stil.dataset.hauptmenue = "";
  stil.textContent = css + "\n" + seitenCss;
  document.head.appendChild(stil);
  const wurzel = document.createElement("div");
  wurzel.className = "hm-wurzel";
  wurzel.style.cssText = "position:fixed;inset:0;z-index:5000;background:#111216;overflow:hidden";
  document.body.appendChild(wurzel);

  let k: Komponente;
  const app = anbindungBauen({
    neuZeichnen: () => k.setState({}),
    schliessen: () => hauptmenueSchliessen(true),
  });
  k = new Komponente(app, { intro: opt.splash !== false, motion: pers().animationen !== false, bild: true, update: "aktuell" });
  if (opt.seite === "einstellungen") k.state = { ...k.state, intro: "done", screen: "settings" };
  const a = ansicht(vorlage, wurzel);
  k._zeichnen = () => {
    try {
      a.zeichnen(k.renderVals());
    } catch (e) {
      console.error("Hauptmenü", e);
    }
  };
  offen = { wurzel, stil, k, app };
  k._zeichnen();
  k.componentDidMount();
  app.starten();
  fertigNach = fertig;
}

let fertigNach: (() => void) | undefined;

/** Menü schließen (beim Spielstart). */
export function hauptmenueSchliessen(spielBeginnt = false): void {
  if (!offen) return;
  const o = offen;
  offen = null;
  try {
    o.k.componentWillUnmount();
  } catch {
    /* egal */
  }
  o.app.beenden();
  // kein vollbildEnde(): das Spiel geht im selben Fenster auf
  o.wurzel.style.transition = "opacity .45s ease";
  o.wurzel.style.opacity = "0";
  setTimeout(() => {
    o.wurzel.remove();
    o.stil.remove();
  }, 470);
  if (spielBeginnt) {
    const f = fertigNach;
    fertigNach = undefined;
    f?.();
  }
}
