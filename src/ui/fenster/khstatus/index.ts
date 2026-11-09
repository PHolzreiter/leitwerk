/**
 * KH-Status-Fenster aus dem Entwurf („KHStatus.dc.html“): Reiter Plätze · Akutversorgung.
 * Im Spiel sind die beiden Reiter zwei Fenster von dockview („khstatus“, „akutversorgung“), die dieselbe Vorlage zeichnen.
 * Übersicht ohne Bezug zu einem Einsatz (keine Entfernung, kein Umkreis). Werte aus der Simulation (khInfo.ts),
 * Klick auf die Zeile: Krankenhaus-Übersicht, Klick auf eine belegte Zelle: wer belegt.
 */
import type { Hospital } from "../../../data/model";
import { store } from "../../../data/store";
import { sim } from "../../../sim/engine";
import { FUNKGRUPPEN, inFunkgruppe } from "../../../sim/funkgruppen";
import type { Ressource } from "../../../sim/khStatus";
import type { PanelKontext, PanelInstanz } from "../../ws/arbeitsplatz";
import { entwurfEinbinden } from "../../entwurf/einbinden";
import { AKV_SPALTEN, akvWert, belegungListe, belegungZeilen, khDetail, nimmtRettung, platzWert, radWert, SPALTEN } from "../../khInfo";
import vorlage from "./vorlage.html?raw";
import css from "./khstatus.css?raw";
import { KHStatusLogik, type KhHaus, type KhStatusApp, type BelegZeile } from "./logik.js";

function jetzt(): number {
  return sim.state.zeit || Date.now();
}

/**
 * Bundesland eines Hauses. Niederösterreich: liegt in einer der Funkgruppen (Gemeindegrenzen); sonst grob nach Lage
 * (die Krankenhausdaten haben kein Bundesland) – reicht für den Filter und die Anzeige.
 */
const landCache = new Map<string, string>();
function bundesland(h: Hospital): string {
  const k = `${h.id}|${h.lat}|${h.lon}`;
  const c = landCache.get(k);
  if (c) return c;
  let l: string;
  if (/^Wien\b/.test(h.ort)) l = "Wien";
  else if (FUNKGRUPPEN.some((g) => inFunkgruppe(g, h.lat, h.lon))) l = "Niederösterreich";
  else if (h.lat > 48.1 && h.lat < 48.33 && h.lon > 16.18 && h.lon < 16.58) l = "Wien";
  else if (h.lon >= 16.12 && h.lat < 48.15) l = "Burgenland";
  else if (h.lat >= 47.65 && h.lon < 15.0) l = "Oberösterreich";
  else l = "Steiermark";
  landCache.set(k, l);
  return l;
}

function haus(h: Hospital, t: number): KhHaus {
  const P: KhHaus["P"] = {};
  const Pr: Record<string, Ressource[]> = {};
  const Pt: Record<string, string> = {};
  for (const sp of SPALTEN) {
    const w = platzWert(h, sp, t);
    P[sp.k] = w.v;
    Pr[sp.k] = w.rs;
    if (w.titel && Array.isArray(w.v)) Pt[sp.k] = w.titel;
  }
  const A: KhHaus["A"] = {};
  const Ab: Record<string, Ressource | undefined> = {};
  const At: Record<string, string> = {};
  for (const s of AKV_SPALTEN) {
    const w = akvWert(h, s, t);
    A[s.k] = w ? (w.z.length > 1 ? w.z : w.z[0]) : null;
    Ab[s.k] = w?.belegt;
    if (w) At[s.k] = w.titel;
  }
  const r = radWert(h, t);
  return { id: h.id, kurz: h.kurzname || h.name, name: h.name, ort: h.ort, land: bundesland(h), rett: nimmtRettung(h), P, A, Pr, Pt, Ab, At, rad: r.rad, radTitel: r.titel };
}

const uhr = (ms: number) => new Date(ms).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });

/** Wer belegt die Plätze einer Zelle (Einsatz, Fahrzeuge, Buchungsgrund, frei ca.) */
function belegung(id: string, art: "p" | "a", k: string): BelegZeile[] {
  const h = store.get("hospitals", id);
  if (!h) return [];
  const t = jetzt();
  let rs: Ressource[] = [];
  if (art === "p") {
    const sp = SPALTEN.find((x) => x.k === k);
    rs = sp ? platzWert(h, sp, t).rs : [];
  } else {
    const s = AKV_SPALTEN.find((x) => x.k === k);
    const r = s ? akvWert(h, s, t)?.belegt : undefined;
    rs = r ? [r] : [];
  }
  const l = belegungZeilen(rs.flatMap((r) => belegungListe(h, r, t)).sort((a, b) => a.bis - b.bis));
  return l.map((x) => ({
    a: x.einsatz ? `Einsatz ${x.nummer}` : x.fremd ? "Fremdbuchung" : `${x.anzahl ?? 1}× privat`,
    bis: `frei ${x.anzahl && x.anzahl > 1 ? "ab " : ""}ca. ${uhr(x.bis)}`,
    fz: x.fahrzeuge.join(", "),
    grund: x.einsatz ? `Buchung: ${x.grund}` : x.fremd ? `anderer Bereich · ${x.grund}` : x.grund,
  }));
}

const TITEL = { plaetze: "Plätze", akut: "Akutversorgung" } as const;

export function khStatusFenster(ctx: PanelKontext, ansicht: "plaetze" | "akut"): PanelInstanz {
  const root = document.createElement("div");
  root.style.height = "100%";
  // Reitertitel wie im Entwurf (das Fenster-Menü behält „KH-Status“)
  if (ansicht === "plaetze") {
    const nr = ctx.panelId.match(/-(\d+)$/)?.[1];
    ctx.setzeTitel(nr ? `${TITEL[ansicht]} ${nr}` : TITEL[ansicht]);
  }
  let cache: { t: number; n: number; l: KhHaus[] } | null = null;
  const app: KhStatusApp = {
    ansicht,
    gemerkt: ctx.params,
    merken: (p) => ctx.setzeParams(p),
    haeuser: () => {
      const t = jetzt();
      const alle = store.list("hospitals");
      // innerhalb einer Spielminute wiederverwenden (Zeichnen beim Tippen, Ziehen …)
      if (cache && cache.n === alle.length && Math.abs(t - cache.t) < 60_000) return cache.l;
      cache = { t, n: alle.length, l: alle.map((h) => haus(h, t)) };
      return cache.l;
    },
    belegung,
    oeffnen: (id) => {
      const h = store.get("hospitals", id);
      if (h) khDetail(h);
    },
  };
  const f = entwurfEinbinden(root, "khstatus", vorlage, css, (p) => new KHStatusLogik(p), { app });
  let veraltet = false;
  const zeichnen = (neu = true) => {
    if (!ctx.sichtbar()) {
      veraltet = true;
      return;
    }
    veraltet = false;
    if (neu) cache = null;
    f.zeichnen();
  };
  requestAnimationFrame(() => zeichnen());
  let letzt = 0;
  const aus = [
    sim.onChange(() => {
      const now = performance.now();
      if (now - letzt < 2000) return;
      letzt = now;
      zeichnen();
    }),
    store.onChange(() => zeichnen()),
  ];
  return {
    el: root,
    dispose: () => {
      aus.forEach((x) => x());
      f.entfernen();
    },
    sichtbar: (an: boolean) => {
      if (an && veraltet) zeichnen();
    },
  };
}
