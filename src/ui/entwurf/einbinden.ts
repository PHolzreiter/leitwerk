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

/**
 * Container-Abfragen bei skalierter Oberfläche (WebView am Mac).
 *
 * WebKit wertet @container … (min-width: 820px) bei Seitenzoom mit gezoomten Pixeln aus: bei 67 %
 * sieht ein 1100 px breites Fenster für das CSS wie 740 px aus. Dann wählte das CSS die schmale
 * Ansicht, die Logik (props.breite) aber die breite – Spalten lagen übereinander, und die Fenster
 * zeigten nicht die Ansicht aus dem Entwurf. In Chromium tritt das nicht auf (Faktor 1).
 *
 * Abhilfe: Faktor messen (Probe mit einer Abfrage bei 1000 px wird verbreitert, bis sie greift)
 * und die Pixelwerte in allen Container-Abfragen damit umrechnen. Danach gelten die Grenzen aus
 * dem Entwurf wieder in echten CSS-Pixeln – gleich wie props.breite.
 */
function abfrageFaktor(): number {
  const test = (window as { __lwFaktor?: number }).__lwFaktor; // nur für Tests
  if (test) return test;
  const huelle = document.createElement("div");
  huelle.style.cssText = "position:fixed;left:-20000px;top:0;height:10px;visibility:hidden;pointer-events:none;container:lwprobe / inline-size";
  const kind = document.createElement("div");
  kind.className = "lw-probe-k";
  huelle.appendChild(kind);
  // Stil in der Probe selbst (nicht im <head>, sonst löst der Beobachter unten die Messung immer wieder aus)
  const st = document.createElement("style");
  st.dataset.lwProbe = "1";
  st.textContent = ".lw-probe-k{width:0;height:1px}@container lwprobe (min-width: 1000px){.lw-probe-k{width:7px}}";
  huelle.appendChild(st);
  document.body.appendChild(huelle);
  const greift = (w: number) => {
    huelle.style.width = `${w}px`;
    return kind.offsetWidth > 0;
  };
  let f = 1;
  try {
    if (!greift(1000) || greift(999)) {
      let lo = 100, hi = 20000;
      if (greift(lo)) hi = lo;
      else if (!greift(hi)) lo = hi;
      while (hi - lo > 1) {
        const m = Math.floor((lo + hi) / 2);
        if (greift(m)) hi = m;
        else lo = m;
      }
      f = 1000 / hi;
    }
  } finally {
    huelle.remove();
  }
  return Math.abs(f - 1) < 0.004 ? 1 : f;
}

/** ursprünglicher Text je umgeschriebener Regel */
const original = new WeakMap<CSSRule, string>();
let faktorJetzt = 1;

function regelnUmrechnen(liste: CSSRuleList, ziel: CSSStyleSheet | CSSGroupingRule, f: number): void {
  for (let i = 0; i < liste.length; i++) {
    const r = liste[i];
    if (typeof CSSContainerRule !== "undefined" && r instanceof CSSContainerRule) {
      const orig = original.get(r) ?? r.cssText;
      const k = orig.indexOf("{");
      const kopf = orig.slice(0, k);
      const neuKopf = f === 1 ? kopf : kopf.replace(/(\d+(?:\.\d+)?)px/g, (_, n: string) => `${Math.round(Number(n) * f * 100) / 100}px`);
      const text = neuKopf + orig.slice(k);
      if (text === r.cssText) continue;
      try {
        ziel.deleteRule(i);
        ziel.insertRule(text, i);
        original.set(ziel.cssRules[i], orig);
      } catch (e) {
        console.warn("Container-Abfrage umrechnen", e);
      }
    } else if (r instanceof CSSMediaRule || r instanceof CSSSupportsRule) {
      regelnUmrechnen(r.cssRules, r, f);
    }
  }
}

function allesUmrechnen(f: number): void {
  for (const sheet of Array.from(document.styleSheets)) {
    if ((sheet.ownerNode as HTMLElement | null)?.dataset?.lwProbe) continue;
    let regeln: CSSRuleList;
    try {
      regeln = sheet.cssRules;
    } catch {
      continue; // fremde Stylesheets (Schriften) – keine Abfragen
    }
    regelnUmrechnen(regeln, sheet, f);
  }
}

let geplant = 0;
/** Faktor neu messen und alle Container-Abfragen anpassen (nur wenn nötig) */
export function abfragenAnpassen(): void {
  if (geplant) return;
  geplant = requestAnimationFrame(() => {
    geplant = 0;
    const f = abfrageFaktor();
    // auch bei gleichem Faktor neu durchgehen: es können neue Stylesheets dazugekommen sein
    if (f === 1 && faktorJetzt === 1) return;
    faktorJetzt = f;
    allesUmrechnen(f);
  });
}
window.addEventListener("resize", abfragenAnpassen);
// neue Stylesheets (Fenster laden ihr CSS beim ersten Öffnen) – nur Stil-Elemente zählen
new MutationObserver((liste) => {
  if (liste.some((m) => Array.from(m.addedNodes).some((n) => n instanceof HTMLStyleElement || n instanceof HTMLLinkElement))) abfragenAnpassen();
}).observe(document.head, { childList: true });
abfragenAnpassen();

/** Breite/Höhe eines Fensters in CSS-Pixeln (wie in den Container-Abfragen nach dem Umrechnen) */
export function abfrageBreite(el: HTMLElement): number {
  return el.offsetWidth;
}
export function abfrageHoehe(el: HTMLElement): number {
  return el.offsetHeight;
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
  // Größe so, wie die Container-Abfragen im CSS sie sehen (sonst passt bei Skalierung die Spaltenwahl nicht zum CSS)
  const k = bauen({ ...props, breite: abfrageBreite(ziel) || 800, hoehe: abfrageHoehe(ziel) || 600, thema: thema() });
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
    const b = abfrageBreite(ziel), h = abfrageHoehe(ziel);
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
