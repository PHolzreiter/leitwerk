/**
 * Dienstplan lesbar: Wochenübersicht (Mo–So, je eine 24-Stunden-Leiste, jedes Team in einer eigenen Farbe)
 * und ein Hover-Fenster für Fahrzeuge (Elemente mit data-dienstfz="<Fahrzeug-ID>").
 */
import { store } from "../data/store";
import type { Vehicle } from "../data/model";
import { TAG_KURZ, planKurz, tageText, wochenBeginn, wochenTermine, zeitText, type Schicht } from "../sim/dienst";
import { sim } from "../sim/engine";
import { esc } from "./dom";

const FARBEN = ["#3b82f6", "#f59e0b", "#10b981", "#a855f7", "#ef4444", "#14b8a6", "#ec4899", "#84cc16"];

/** Farbe des Teams (Schicht-Nummer im Plan) */
export function teamFarbe(nr: number): string {
  return FARBEN[nr % FARBEN.length];
}

const NOE = { lat: 48.2, lon: 15.6 };

/** Wochenübersicht als HTML. bezug: ein Zeitpunkt in der gewünschten Woche (für Sonnenauf-/-untergang). */
export function wocheHtml(plan: Schicht[] | undefined | null, ort: { lat: number; lon: number } = NOE, bezug = sim.state.zeit || Date.now(), jetzt?: number): string {
  const montag = wochenBeginn(bezug);
  const termine = wochenTermine(plan, montag, ort);
  const teams = plan?.length ? plan : [
    { tage: [1, 2, 3, 4, 5, 6, 7], von: "07:00", bis: "19:00" },
    { tage: [1, 2, 3, 4, 5, 6, 7], von: "19:00", bis: "07:00" },
  ];
  const zeilen: string[] = [];
  for (let d = 0; d < 7; d++) {
    const a = new Date(montag);
    a.setDate(montag.getDate() + d);
    const b = new Date(a);
    b.setDate(a.getDate() + 1);
    const t0 = a.getTime();
    const len = b.getTime() - t0;
    const teile: string[] = [];
    for (const w of termine) {
      const s = Math.max(w.start, t0);
      const e = Math.min(w.ende, b.getTime());
      if (e <= s) continue;
      const l = ((s - t0) / len) * 100;
      const br = ((e - s) / len) * 100;
      const hh = (x: number) => new Date(x).toTimeString().slice(0, 5);
      teile.push(`<span class="dw-seg" style="left:${l.toFixed(2)}%;width:${br.toFixed(2)}%;background:${teamFarbe(w.nr)}" title="Team ${w.nr + 1}: ${hh(w.start)}–${hh(w.ende)}"></span>`);
    }
    let marke = "";
    if (jetzt !== undefined && jetzt >= t0 && jetzt < b.getTime()) marke = `<span class="dw-jetzt" style="left:${(((jetzt - t0) / len) * 100).toFixed(2)}%" title="jetzt"></span>`;
    zeilen.push(`<div class="dw-zeile"><span class="dw-tag">${TAG_KURZ[d]}</span><span class="dw-leiste">${teile.join("")}${marke}</span></div>`);
  }
  const skala = `<div class="dw-zeile dw-skala"><span class="dw-tag"></span><span class="dw-leiste">${[0, 6, 12, 18, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${h}</span>`).join("")}</span></div>`;
  const legende = teams
    .map((s, i) => `<span class="dw-team"><span class="dw-farbe" style="background:${teamFarbe(i)}"></span>Team ${i + 1}: ${esc(tageText(s.tage))} ${esc(zeitText(s.von))}–${esc(zeitText(s.bis))}</span>`)
    .join("");
  return `<div class="dw">${zeilen.join("")}${skala}<div class="dw-legende">${plan?.length ? "" : `<span class="dw-team muted">rund um die Uhr (Standard)</span>`}${legende}</div></div>`;
}

/** Wochenübersicht eines Fahrzeugs (aus den Daten) */
export function fahrzeugWocheHtml(id: string): string {
  const v = store.get("vehicles", id) as Vehicle | undefined;
  const fz = sim.state.fahrzeuge[id];
  if (!v && !fz) return "";
  const name = v ? `${v.funkrufname}${v.kurzname ? ` · ${v.kurzname}` : ""}` : fz.funkrufname;
  if (v?.ersatzFuer || fz?.ersatzFuer) {
    return `<div class="dw-titel"><b>${esc(name)}</b></div><div class="muted">Ersatz-NEF für ${esc(v?.ersatzFuer ?? fz.ersatzFuer ?? "")}: im Dienst nur, wenn der Hubschrauber im Dienst ist, aber nicht fliegen kann (Wetter, Nacht).</div>`;
  }
  const st = v ? store.get("stations", v.dienststelleId) : undefined;
  const ort = fz?.heim ?? (st ? { lat: (st as { lat: number }).lat, lon: (st as { lon: number }).lon } : NOE);
  const plan = v?.dienstplan ?? sim.dienstplanVon(id);
  return `<div class="dw-titel"><b>${esc(name)}</b> <span class="muted">Dienstplan: ${esc(planKurz(plan))}</span></div>${wocheHtml(plan, ort, sim.state.zeit, sim.state.zeit)}`;
}

let tip: HTMLElement | null = null;
let timer: number | undefined;
let aktiv: string | null = null;

function weg(): void {
  clearTimeout(timer);
  aktiv = null;
  tip?.remove();
  tip = null;
}

/** Hover über Elementen mit data-dienstfz zeigt nach kurzer Zeit die Wochenübersicht */
export function dienstHoverEinrichten(): void {
  document.addEventListener("mouseover", (e) => {
    const z = (e.target as Element | null)?.closest?.("[data-dienstfz]") as HTMLElement | null;
    const id = z?.dataset.dienstfz ?? null;
    // gleiches Fahrzeug (auch nach Neuzeichnen der Liste): nichts tun
    if (id === aktiv) return;
    weg();
    if (!id) return;
    aktiv = id;
    const x = (e as MouseEvent).clientX;
    const y = (e as MouseEvent).clientY;
    timer = window.setTimeout(() => {
      const html = fahrzeugWocheHtml(id);
      if (!html || aktiv !== id) return;
      tip = document.createElement("div");
      tip.className = "dw-tip";
      tip.innerHTML = html;
      document.body.appendChild(tip);
      const r = tip.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - r.width - 8))}px`;
      tip.style.top = `${y + 18 + r.height > innerHeight ? Math.max(8, y - r.height - 10) : y + 18}px`;
    }, 450);
  });
  document.addEventListener("mousedown", weg, true);
  document.addEventListener("scroll", weg, true);
}
