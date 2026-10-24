/**
 * Updates: laufend im Hintergrund nachsehen (nur nachsehen, nichts laden).
 * Erst auf Klick wird geladen – mit eigener, großer Fortschrittsanzeige; danach startet LeitWerk neu.
 */
import { inTauri } from "../platform";
import { checkUpdate, installUpdate, type Progress, type UpdateInfo } from "../updates";
import { el, esc } from "./dom";
import { logoMarke } from "./logo";
import { istDunkel } from "./ws/persoenlich";

const PRUEF_TAKT = 15 * 60_000;

let info: UpdateInfo | null = null;
let laeuft = false;
const hoerer = new Set<() => void>();
let gestartet = false;

/** Testhilfe: so tun, als gäbe es ein Update (nur im Browser mit ?debug) */
let test: { info: UpdateInfo; install: (p: (x: Progress) => void) => Promise<void> } | null = null;

export function updateInfo(): UpdateInfo | null {
  return info;
}
export function updateLaeuft(): boolean {
  return laeuft;
}
export function onUpdate(fn: () => void): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}
function melden(): void {
  for (const f of hoerer) f();
}

async function pruefen(): Promise<void> {
  if (laeuft) return;
  try {
    const u = test ? test.info : inTauri() ? await checkUpdate() : null;
    const neu = u?.version !== info?.version;
    info = u;
    if (neu) melden();
  } catch (e) {
    console.warn("Update-Prüfung", e);
  }
}

/** Beim Programmstart: sofort und dann alle 15 Minuten nachsehen */
export function updateDienstStarten(): void {
  if (gestartet) return;
  gestartet = true;
  void pruefen();
  window.setInterval(() => void pruefen(), PRUEF_TAKT);
  // nach dem Aufwachen (Laptop zu/auf) gleich nachsehen
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void pruefen();
  });
}

export function updateTesten(version = "9.9.9", dauerMs = 6000, fehler = false): void {
  test = {
    info: { version, current: "0.0.0", notes: "Neue Startseite\nEchtes Wetter\nVieles mehr" },
    install: async (p) => {
      const total = 18_400_000;
      const schritte = 30;
      for (let i = 1; i <= schritte; i++) {
        await new Promise((r) => setTimeout(r, dauerMs / schritte));
        if (fehler && i === 12) throw new Error("Verbindung abgebrochen");
        p({ done: Math.round((total * i) / schritte), total });
      }
    },
  };
  void pruefen();
}

function mb(b: number): string {
  return (b / 1_048_576).toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Update laden und installieren – mit großer Anzeige. */
export function updateInstallieren(gefunden?: UpdateInfo): void {
  if (gefunden) info = gefunden;
  if (!info || laeuft) return;
  laeuft = true;
  melden();
  const u = info;
  const root = el("div", { class: `lw-upd lw-neu ${istDunkel() ? "dunkel" : "hell"}`, role: "dialog", "aria-label": "Update" });
  const R = 54;
  const UMFANG = 2 * Math.PI * R;
  root.innerHTML = `<div class="lw-upd-karte">
      <div class="lw-upd-logo">${logoMarke(56)}</div>
      <h2>LeitWerk wird aktualisiert</h2>
      <div class="lw-upd-versionen"><span>v${esc(u.current)}</span><i></i><b>v${esc(u.version)}</b></div>
      <div class="lw-upd-ring">
        <svg viewBox="0 0 128 128"><defs><linearGradient id="lw-upd-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#60c6ff"/></linearGradient></defs>
          <circle cx="64" cy="64" r="${R}" class="lw-upd-spur"/>
          <circle cx="64" cy="64" r="${R}" class="lw-upd-wert" stroke-dasharray="${UMFANG.toFixed(1)}" stroke-dashoffset="${UMFANG.toFixed(1)}"/></svg>
        <div class="lw-upd-prozent"><b>0</b><span>%</span></div>
      </div>
      <div class="lw-upd-detail">Verbinde …</div>
      <ol class="lw-upd-schritte"><li class="an">Herunterladen</li><li>Installieren</li><li>Neustart</li></ol>
      ${u.notes ? `<details class="lw-upd-neu"><summary>Was ist neu?</summary><div>${esc(u.notes).replace(/\n/g, "<br>")}</div></details>` : ""}
      <div class="lw-upd-knoepfe" hidden><button class="lw-upd-knopf leise" data-a="zu">Schließen</button><button class="lw-upd-knopf" data-a="nochmal">Nochmal versuchen</button></div>
      <p class="lw-upd-hinweis">Bitte LeitWerk nicht schließen. Deine Daten und Einstellungen bleiben erhalten.</p>
    </div>`;
  document.body.appendChild(root);
  const wert = root.querySelector<SVGCircleElement>(".lw-upd-wert")!;
  const prozent = root.querySelector<HTMLElement>(".lw-upd-prozent b")!;
  const detail = root.querySelector<HTMLElement>(".lw-upd-detail")!;
  const schritte = [...root.querySelectorAll<HTMLElement>(".lw-upd-schritte li")];
  const knoepfe = root.querySelector<HTMLElement>(".lw-upd-knoepfe")!;
  const schritt = (i: number) => schritte.forEach((li, k) => (li.className = k < i ? "fertig" : k === i ? "an" : ""));
  const setzen = (anteil: number) => {
    wert.style.strokeDashoffset = String(UMFANG * (1 - Math.max(0, Math.min(1, anteil))));
    prozent.textContent = String(Math.round(anteil * 100));
  };
  let start = 0;
  const fortschritt = (p: Progress) => {
    if (!start) start = performance.now();
    const s = (performance.now() - start) / 1000;
    const rate = s > 0.3 ? p.done / s : 0;
    if (p.total > 0) {
      setzen(p.done / p.total);
      const rest = rate > 0 ? Math.max(0, (p.total - p.done) / rate) : 0;
      detail.textContent = `${mb(p.done)} von ${mb(p.total)} MB${rate ? ` · ${mb(rate)} MB/s` : ""}${rate && rest >= 1 ? ` · noch ca. ${rest < 60 ? `${Math.ceil(rest)} s` : `${Math.ceil(rest / 60)} min`}` : ""}`;
      if (p.done >= p.total) {
        schritt(1);
        detail.textContent = "Wird installiert …";
        root.classList.add("installiert");
      }
    } else {
      root.classList.add("unbestimmt");
      detail.textContent = `${mb(p.done)} MB geladen …`;
    }
  };
  const los = async () => {
    root.classList.remove("fehler", "installiert", "unbestimmt");
    knoepfe.hidden = true;
    schritt(0);
    setzen(0);
    start = 0;
    detail.textContent = "Verbinde …";
    try {
      await (test ? test.install(fortschritt) : installUpdate(fortschritt));
      setzen(1);
      schritt(2);
      root.classList.add("installiert");
      detail.textContent = "Fertig – LeitWerk startet neu …";
      if (test) setTimeout(() => detail.setAttribute("data-fertig", "1"), 10);
    } catch (e) {
      root.classList.add("fehler");
      detail.textContent = `Update fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
      knoepfe.hidden = false;
    }
  };
  knoepfe.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
    if (a === "nochmal") void los();
    if (a === "zu") {
      root.classList.add("weg");
      setTimeout(() => root.remove(), 300);
      laeuft = false;
      melden();
    }
  });
  void los();
}
