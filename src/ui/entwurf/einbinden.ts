/**
 * Ein Fenster aus dem Entwurf ins Spiel einbinden.
 *
 * Vorlage (HTML mit {{…}}, <sc-for>, <sc-if>) + CSS + Logik (Klasse mit renderVals, aus dem Entwurf übernommen)
 * werden in ein Wurzel-Element gezeichnet. Wie auf der Entwurfsfläche bekommt die Logik die Größe des Fensters
 * (props.breite / props.hoehe, laufend per ResizeObserver) und das Farbschema (props.thema „dunkel“/„hell“).
 * Echte Daten und Aktionen gibt der Aufrufer als props.app mit (statt der Beispiele im Entwurf).
 */
import "./fenster.css";
import { ansicht } from "./laufzeit";
import type { DCLogic } from "./dclogic";

const stile = new Set<string>();

/** CSS einer Vorlage einmal ins Dokument */
export function stilEinmal(name: string, css: string): void {
  if (stile.has(name)) return;
  stile.add(name);
  const s = document.createElement("style");
  s.dataset.entwurf = name;
  s.textContent = css;
  document.head.appendChild(s);
}

export interface EntwurfFenster<K extends DCLogic> {
  k: K;
  wurzel: HTMLElement;
  /** neu zeichnen (z. B. wenn sich Spieldaten geändert haben) */
  zeichnen(): void;
  /** Props ändern (werden mit den bisherigen gemischt) und neu zeichnen */
  props(p: Record<string, unknown>): void;
  entfernen(): void;
}

function thema(): "dunkel" | "hell" {
  return document.documentElement.dataset.theme === "dunkel" ? "dunkel" : "hell";
}

/**
 * @param ziel   Element des Fensters (wird geleert)
 * @param name   Name für das CSS (einmal je Vorlage)
 * @param vorlage HTML der Vorlage (Inhalt von <x-dc> ohne <helmet>)
 * @param css    CSS der Vorlage (Inhalt von <style>)
 * @param bauen  erzeugt die Logik mit den Start-Props
 */
export function entwurfEinbinden<K extends DCLogic>(
  ziel: HTMLElement,
  name: string,
  vorlage: string,
  css: string,
  bauen: (props: Record<string, unknown>) => K,
  props: Record<string, unknown> = {},
): EntwurfFenster<K> {
  stilEinmal(name, css);
  ziel.replaceChildren();
  const wurzel = document.createElement("div");
  wurzel.className = "ap ew-fenster";
  ziel.appendChild(wurzel);
  const r0 = ziel.getBoundingClientRect();
  const k = bauen({ ...props, breite: Math.round(r0.width) || 800, hoehe: Math.round(r0.height) || 600, thema: thema() });
  const a = ansicht(vorlage, wurzel);
  let weg = false;
  k._zeichnen = () => {
    if (weg) return;
    try {
      a.zeichnen(k.renderVals());
    } catch (e) {
      console.error(`Fenster „${name}“`, e);
    }
  };
  const groesse = new ResizeObserver(() => {
    const r = ziel.getBoundingClientRect();
    const b = Math.round(r.width), h = Math.round(r.height);
    if (!b || !h || (b === k.props.breite && h === k.props.hoehe)) return;
    k.props = { ...k.props, breite: b, hoehe: h };
    k._zeichnen?.();
  });
  groesse.observe(ziel);
  const themaBeobachter = new MutationObserver(() => {
    const t = thema();
    if (t !== k.props.thema) {
      k.props = { ...k.props, thema: t };
      k._zeichnen?.();
    }
  });
  themaBeobachter.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  k._zeichnen();
  k.componentDidMount();
  return {
    k,
    wurzel,
    zeichnen: () => k._zeichnen?.(),
    props: (p) => {
      k.props = { ...k.props, ...p };
      k._zeichnen?.();
    },
    entfernen: () => {
      weg = true;
      groesse.disconnect();
      themaBeobachter.disconnect();
      try {
        k.componentWillUnmount();
      } catch {
        /* egal */
      }
      wurzel.remove();
    },
  };
}
