/** Tastenkürzel (einstellbar unter Einstellungen → Persönlich). */
import { pers, type KuerzelId } from "./persoenlich";

/** Taste als Text, z. B. „Ctrl+F“, „F1“, „Escape“, „Space“ */
export function tasteVon(e: KeyboardEvent): string {
  const teile: string[] = [];
  if (e.ctrlKey || e.metaKey) teile.push("Ctrl");
  if (e.altKey) teile.push("Alt");
  if (e.shiftKey) teile.push("Shift");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  if (["Control", "Meta", "Alt", "Shift"].includes(k)) return teile.join("+");
  teile.push(k);
  return teile.join("+");
}

/** Taste lesbar (Mac: ⌘ statt Strg) */
export function tasteText(t: string): string {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return t
    .replace("Ctrl", mac ? "⌘" : "Strg")
    .replace("Escape", "Esc")
    .replace("Space", "Leertaste")
    .replace("Shift", "⇧")
    .replace(/\+/g, " + ");
}

const aktionen = new Map<KuerzelId, () => boolean | void>();

/** Aktion für ein Kürzel festlegen (Rückgabe false = nicht zuständig, Taste normal weitergeben) */
export function kuerzelAktion(id: KuerzelId, fn: () => boolean | void): void {
  aktionen.set(id, fn);
}

let aufnahme: ((t: string) => void) | null = null;
/** Nächste Taste aufnehmen (für die Einstellungen) */
export function tasteAufnehmen(fn: (t: string) => void): void {
  aufnahme = fn;
}

function tippt(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function kuerzelStarten(): void {
  window.addEventListener("keydown", (e) => {
    if (aufnahme) {
      e.preventDefault();
      e.stopPropagation();
      const t = tasteVon(e);
      if (!t || ["Ctrl", "Alt", "Shift"].includes(t)) return;
      const fn = aufnahme;
      aufnahme = null;
      fn(t);
      return;
    }
    const t = tasteVon(e);
    const k = pers().kuerzel;
    for (const [id, taste] of Object.entries(k) as [KuerzelId, string][]) {
      if (!taste || taste !== t) continue;
      // Einfache Tasten (ohne Strg/F-Tasten) nicht, während man in ein Feld schreibt
      if (tippt(e) && !/^(Ctrl|Alt|F\d+)/.test(taste) && taste !== "Escape") return;
      // Esc in einem Feld: nur Feld verlassen
      if (taste === "Escape" && tippt(e)) return;
      // offene Dialoge, Menüs, Kamera-Folgen und Ort-Wählen haben Vorrang (vor allem bei Esc)
      if (document.querySelector(".dlg-overlay:not([style*='none']), .gross-overlay:not([hidden]), .lw-menu, .ctx-menu, .fz-folgt:not([hidden]), .pick-banner")) return;
      const fn = aktionen.get(id);
      if (!fn) return;
      const r = fn();
      if (r === false) return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }, true);
}
