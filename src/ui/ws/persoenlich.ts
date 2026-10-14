/**
 * Persönliche Einstellungen: gelten nur für diesen Spieler auf diesem Rechner
 * (Aussehen, Größe, Karte, Kurzbefehle, Töne, Anrufannahme …).
 * Was für alle im Spiel gilt (Aufkommen, Statusmodell …), kommt weiterhin vom Host.
 */
import { inTauri } from "../../platform";

export type Thema = "hell" | "dunkel" | "system";

export type KuerzelId = "annehmen" | "auflegen" | "halten" | "fahrzeugSuchen" | "neuerEinsatz" | "einsatzliste" | "karte" | "funk";

export const KUERZEL_LABEL: Record<KuerzelId, string> = {
  annehmen: "Anruf annehmen",
  auflegen: "Auflegen",
  halten: "Halten / zurückwechseln",
  fahrzeugSuchen: "Fahrzeug suchen",
  neuerEinsatz: "Neuer Einsatz (Test)",
  einsatzliste: "Einsatzliste zeigen",
  karte: "Karte zeigen",
  funk: "Funk zeigen",
};

export const KUERZEL_STANDARD: Record<KuerzelId, string> = {
  annehmen: "F1",
  auflegen: "Escape",
  halten: "F3",
  fahrzeugSuchen: "Ctrl+F",
  neuerEinsatz: "F5",
  einsatzliste: "Ctrl+1",
  karte: "Ctrl+2",
  funk: "Ctrl+3",
};

export interface Persoenlich {
  thema: Thema;
  /** Kartenstil: „auto“ folgt dem Thema, „hell“ bleibt immer hell */
  karte: "auto" | "hell";
  /** Größe der Oberfläche in Prozent */
  skalierung: number;
  /** Bewegungen und Übergänge */
  animationen: boolean;
  /** Ich nehme Notrufe an (Telefon/Abfrage gehen dann von selbst auf, Klingelton) */
  notrufe: boolean;
  /** Ich nehme die KT-Hotline an */
  ktHotline: boolean;
  /** Lautstärke 0–100 */
  lautstaerke: number;
  /** Funk-Piep, wenn ein Fahrzeug ruft */
  funkTon: boolean;
  kuerzel: Record<KuerzelId, string>;
  /** eigene Statusfarben (Schlüssel = Status) */
  statusFarben: Record<string, string>;
  /** Hinweise zum Arbeitsbereich schon gesehen */
  einfuehrung: boolean;
  /** Knopf „Gespräch exportieren“ anzeigen */
  exportKnopf: boolean;
}

const LS = "leitwerk.persoenlich";

export const STANDARD: Persoenlich = {
  thema: "system",
  karte: "auto",
  skalierung: 100,
  animationen: true,
  notrufe: true,
  ktHotline: true,
  lautstaerke: 70,
  funkTon: true,
  kuerzel: { ...KUERZEL_STANDARD },
  statusFarben: {},
  einfuehrung: false,
  exportKnopf: true,
};

function lesen(): Persoenlich {
  try {
    const p = JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<Persoenlich>;
    return { ...STANDARD, ...p, kuerzel: { ...KUERZEL_STANDARD, ...(p.kuerzel ?? {}) }, statusFarben: { ...(p.statusFarben ?? {}) } };
  } catch {
    return { ...STANDARD, kuerzel: { ...KUERZEL_STANDARD } };
  }
}

let aktuell = lesen();
const hoerer = new Set<(p: Persoenlich) => void>();

export function pers(): Persoenlich {
  return aktuell;
}

export function setzePers(patch: Partial<Persoenlich>): void {
  aktuell = { ...aktuell, ...patch };
  try {
    localStorage.setItem(LS, JSON.stringify(aktuell));
  } catch {
    /* ohne Speicher: gilt bis zum Neustart */
  }
  anwenden();
  for (const fn of hoerer) fn(aktuell);
}

export function onPers(fn: (p: Persoenlich) => void): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

// Änderung in einem anderen Fenster übernehmen
window.addEventListener("storage", (e) => {
  if (e.key !== LS) return;
  aktuell = lesen();
  anwenden();
  for (const fn of hoerer) fn(aktuell);
});

// ---------------------------------------------------------------- Aussehen

const dunkelMedia = window.matchMedia?.("(prefers-color-scheme: dark)");

/** Ist die Oberfläche gerade dunkel? */
export function istDunkel(): boolean {
  return aktuell.thema === "dunkel" || (aktuell.thema === "system" && !!dunkelMedia?.matches);
}

/** Soll die Karte dunkel sein? */
export function karteDunkel(): boolean {
  return aktuell.karte === "auto" && istDunkel();
}

const themaHoerer = new Set<() => void>();
/** Hell/Dunkel hat gewechselt (auch durch das System) */
export function onThema(fn: () => void): () => void {
  themaHoerer.add(fn);
  return () => themaHoerer.delete(fn);
}

let letzterZoom = 1;
/** Größe: im Programm über den Zoom des Fensters (wie Strg +), im Browser über CSS */
function zoomSetzen(z: number): void {
  if (z === letzterZoom) return;
  letzterZoom = z;
  if (inTauri()) {
    void import("@tauri-apps/api/webview")
      .then((w) => w.getCurrentWebview().setZoom(z))
      .catch((e) => console.warn("Zoom", e));
  } else {
    (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(z);
  }
}

let letztesThema = "";
export function anwenden(): void {
  const r = document.documentElement;
  const dunkel = istDunkel();
  r.dataset.theme = dunkel ? "dunkel" : "hell";
  r.style.colorScheme = dunkel ? "dark" : "light";
  zoomSetzen(aktuell.skalierung / 100);
  r.classList.toggle("ohne-animation", !aktuell.animationen);
  const key = `${dunkel}|${aktuell.karte}`;
  if (key !== letztesThema) {
    letztesThema = key;
    for (const fn of themaHoerer) fn();
  }
}
dunkelMedia?.addEventListener?.("change", () => anwenden());
