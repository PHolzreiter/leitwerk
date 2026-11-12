/**
 * Eigene Titelleiste (Paul 12.11.2026, statt Vollbild): Das Hauptfenster hat unter Windows keinen Rahmen des
 * Systems – Minimieren, Maximieren und Schließen sitzen rechts oben in der Kopfleiste, die Kopfleiste zieht das
 * Fenster (Doppelklick maximiert). Unter macOS bleiben die drei Ampelknöpfe des Systems, links in der Kopfleiste.
 */
import { inTauri } from "../platform";
import "./titelleiste.css";

type Art = "win" | "mac" | null;

/** Kopfleisten, an denen sich das Fenster ziehen lässt */
const KOPF = ".kl-leiste, .pv-kopf, .st2-kopf, .lw-titel-zug";
/** Darauf beginnt kein Ziehen */
const BEDIENBAR = "button, a, input, select, textarea, label, [role=button], [role=tab], [contenteditable], .kn, .seg, .segs, .kl-anker, .lw-titel";

function art(): Art {
  if (!inTauri()) return null;
  const meta = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__?.metadata;
  if (meta?.currentWindow?.label && meta.currentWindow.label !== "main") return null;
  const p = `${navigator.userAgent} ${navigator.platform}`;
  if (/Mac/i.test(p)) return "mac";
  if (/Win/i.test(p)) return "win";
  return null;
}

const SVG = (d: string) => `<svg viewBox="0 0 12 12" aria-hidden="true">${d}</svg>`;
const MIN = SVG('<path d="M1.5 6.5h9"/>');
const MAX = SVG('<rect x="1.5" y="1.5" width="9" height="9" rx="0.5"/>');
const ZURUECK = SVG('<rect x="1.5" y="3.5" width="7" height="7" rx="0.5"/><path d="M3.5 3.5V1.5h7v7h-2"/>');
const ZU = SVG('<path d="M1.5 1.5l9 9M10.5 1.5l-9 9"/>');

type Fenster = Awaited<ReturnType<typeof fensterHolen>>;
async function fensterHolen() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

let w: Fenster | null = null;

async function maxAnzeigen(knopf: HTMLButtonElement): Promise<void> {
  if (!w) return;
  const an = await w.isMaximized().catch(() => false);
  knopf.innerHTML = an ? ZURUECK : MAX;
  knopf.title = an ? "Verkleinern" : "Maximieren";
  knopf.setAttribute("aria-label", knopf.title);
}

/** Einmal beim Start: Knöpfe einsetzen, Ziehen einrichten */
export function titelleisteEinrichten(): void {
  const a = art();
  if (!a) return;
  document.documentElement.classList.add(`tl-${a}`);
  void fensterHolen()
    .then((f) => {
      w = f;
      if (a === "win") knoepfeBauen();
    })
    .catch((e) => console.warn("Titelleiste", e));

  // Ziehen an der Kopfleiste (bzw. am oberen Rand, wo keine Kopfleiste ist), Doppelklick maximiert
  const ziehbar = (e: MouseEvent): boolean => {
    const t = e.target as Element | null;
    if (!t || e.button !== 0 || t.closest(BEDIENBAR)) return false;
    return !!t.closest(KOPF) || e.clientY <= 32;
  };
  document.addEventListener("mousedown", (e) => {
    if (!w || !ziehbar(e) || e.detail > 1) return;
    void w.startDragging().catch(() => undefined);
  });
  document.addEventListener("dblclick", (e) => {
    if (!w || !ziehbar(e)) return;
    void w.toggleMaximize().catch(() => undefined);
  });
}

function knoepfeBauen(): void {
  if (!w || document.querySelector(".lw-titel")) return;
  const box = document.createElement("div");
  box.className = "lw-titel";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Fenster");
  const knopf = (cls: string, svg: string, titel: string, klick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `lw-titel-k ${cls}`;
    b.innerHTML = svg;
    b.title = titel;
    b.setAttribute("aria-label", titel);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      klick();
    });
    box.appendChild(b);
    return b;
  };
  knopf("min", MIN, "Minimieren", () => void w?.minimize());
  const max = knopf("max", MAX, "Maximieren", () => void w?.toggleMaximize().then(() => maxAnzeigen(max)));
  knopf("zu", ZU, "Schließen", () => void w?.close());
  document.body.appendChild(box);
  void maxAnzeigen(max);
  void w.onResized(() => void maxAnzeigen(max)).catch(() => undefined);
}
