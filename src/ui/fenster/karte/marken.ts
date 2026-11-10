/**
 * Eigene Kartenmarken des Kartenfensters (wie im Entwurf „Karte“ / „Kartenpunkte“) als DOM-Marken über MapLibre:
 * Wachen (Haus-Symbol, Name ab Zoom „Ort“), Flugrettung (rund gelb), Krankenhäuser (rotes „H“ mit Aufnahme-Ring),
 * Partner (Kürzel), Rettungszufahrt „P“, Landeplatz, Einsätze (Stecknadel in Stufenfarbe, KT blau mit „A“),
 * Zusammenfassung naher Einsätze beim Herauszoomen, Fahrzeuge (Punkt in Statusfarbe mit Spitze in Fahrtrichtung,
 * F/6 mit rotem Rand, blauer Blinkring bei Sondersignal, Rufname ab „Ort“ bzw. bei Auswahl), Hubschrauber in der Luft.
 * Frei auf der Wache stehende Fahrzeuge sind nicht auf der Karte.
 *
 * Nur was im Bildausschnitt liegt, wird als Marke angelegt (sonst wären es über tausend Elemente).
 */
import maplibregl from "maplibre-gl";
import type { Hospital, Station } from "../../../data/model";
import { store } from "../../../data/store";
import { anzeigeZeit, flughoehe, positionBei, richtungBei } from "../../../sim/bewegung";
import { findCode } from "../../../sim/codes";
import { fliegt, sim, type Einsatz, type SimFahrzeug } from "../../../sim/engine";
import type { KtAuftrag } from "../../../sim/kt";
import { istUeberstellung } from "../../../sim/ktCodes";
import { partnerArtVonTyp, PARTNER, type PartnerArt } from "../../../sim/partner";
import { offen, plaetze, belegt } from "../../../sim/khStatus";
import { nimmtRettung } from "../../khInfo";
import { stufeFarbe } from "../../panels/teile";
import { daheim } from "../../../mapLayers";

/** Zoomstufen wie im Entwurf: „Übersicht“ (Einsätze zusammengefasst), „Ort“ (Namen, POIs, Partner), „Straße“ */
export const ZOOM_ORT = 12;
export const ZOOM_STRASSE = 15;

// ---------------------------------------------------------------- Farben

/** Statusfarben des Entwurfs (gleich in Hell und Dunkel); eigene Statusfarben aus den Einstellungen gehen vor */
const STATUS_HEX: Record<string, string> = {
  freiWache: "#CDEFA0",
  freiFunk: "#CDEFA0",
  alarmWache: "#F3EF7A",
  alarmFunk: "#F3EF7A",
  alarmiert: "#DCC23A",
  zumBO: "#F7D98C",
  amBO: "#EBB36B",
  zumZO: "#ECD8ED",
  amZO: "#D7AEE2",
  dienstfahrt: "#DCDDE1",
  bereitschaft: "#C3E6E1",
  abgemeldet: "#E6E7EA",
};
export function statusHex(key: string): string {
  return STATUS_HEX[key] || "#E6E7EA";
}
/** Status mit roter Schrift bzw. rotem Rand (über Funk) */
export function ueberFunk(key: string): boolean {
  return key === "freiFunk" || key === "alarmFunk";
}

/** Stufenfarben des Entwurfs (ALS rot · ALS orange · BLS gelb …, KT blau) */
const STUFE_ENTWURF: Record<string, string> = { "#e53935": "#a61b1b", "#fb8c00": "#e2761b", "#fdd835": "#d4a106", "#7cb342": "#5a9a2e" };
export const KT_FARBE = "#3B8BFF";
export function stufeHex(stufe: string | undefined): string {
  const f = stufeFarbe(stufe);
  return STUFE_ENTWURF[f] ?? f;
}

/** Kurze Nummer wie im Entwurf: „261109-0001“ → „0001“, „KT-1109-003“ → „KT 003“ */
export function kurzNr(nummer: string, kt = false, sek = false): string {
  const n = nummer.split("-").pop() || nummer;
  return kt ? `${sek ? "SEK" : "KT"} ${n}` : n;
}

/** Krankenhaus: nimmt auf (grüner Ring) · abgemeldet (grau, rot gestrichelt) · keine Rettung (ohne Ring) */
export function khAufnahme(h: Hospital, t: number): { art: "auf" | "zu" | "ohne"; text: string } {
  if (!nimmtRettung(h)) return { art: "ohne", text: "nimmt keine Rettung" };
  const n = plaetze(h, "notaufnahme");
  if (n <= 0) return { art: "auf", text: "nimmt Rettung" };
  if (!offen(h, "amb_notaufnahme", t)) return { art: "zu", text: "Notaufnahme geschlossen" };
  const frei = n - belegt(sim.state.khBelegung, h.id, "notaufnahme", t);
  if (frei <= 0) return { art: "zu", text: `Notaufnahme voll (0 von ${n} frei)` };
  return { art: "auf", text: "Notaufnahme offen" };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------------------------------------------------------------- Bausteine (HTML wie im Entwurf)

const PIN_PFAD = "M15 39C15 39 2 23.5 2 14.5A13 13 0 0 1 28 14.5C28 23.5 15 39 15 39Z";
function pinHtml(farbe: string, buchst: string, _nr: string, code: string, gew: boolean): string {
  return `<div class="pinw${gew ? " gew" : ""}"><svg class="pin" viewBox="0 0 30 40" aria-hidden="true"><path d="${PIN_PFAD}" fill="${farbe}" stroke="#fff" stroke-width="1.6"></path><circle cx="15" cy="14.5" r="${buchst ? 7 : 4.5}" fill="#fff"></circle>${buchst ? `<text x="15" y="18.5" text-anchor="middle" font-size="11" font-weight="900" fill="${farbe}" font-family="Inter,sans-serif">${esc(buchst)}</text>` : ""}</svg>${code ? `<span class="etk">${esc(code)}</span>` : ""}</div>`;
}
const HUBSCHRAUBER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4 7h16M9 21h6M12 9a3 3 0 0 1 3 3v4H9v-4a3 3 0 0 1 3-3z" fill="none" stroke="#111216" stroke-width="2.2" stroke-linecap="round"></path></svg>`;
const tip = (t: string) => `<span class="tip">${esc(t)}</span>`;

/** Kürzel und Farbe der Partner (Vorlage: eigene Farbe + Kürzel) */
const PARTNER_MARKE: Record<PartnerArt, { cls: string; z: string }> = {
  fw: { cls: "fw", z: "FW" },
  pol: { cls: "pol", z: "POL" },
  wasser: { cls: "wr", z: "WR" },
  berg: { cls: "berg", z: PARTNER.berg.kurz.toUpperCase() },
  ki: { cls: "ki", z: PARTNER.ki.kurz.toUpperCase() },
};

// ---------------------------------------------------------------- Marken-Verwaltung

export type MarkenArt = "wache" | "partner" | "kh" | "zuf" | "lp" | "einsatz" | "kt" | "br" | "cluster" | "fz" | "gesetzt";

interface Item {
  key: string;
  art: MarkenArt;
  id: string;
  lng: number;
  lat: number;
  html: string;
  cls: string;
  anker: "center" | "bottom";
  z: number;
}
interface Eintrag {
  m: maplibregl.Marker;
  el: HTMLElement;
  html: string;
  cls: string;
  lng: number;
  lat: number;
  z: number;
}

export interface MarkenDeps {
  /** Ebenen „Dienststellen“, „Krankenhäuser“ */
  ebene(k: "wachen" | "kh"): boolean;
  /** gewählter Einsatz/KT (gemeinsame Auswahl) */
  auswahl(): { art: "einsatz" | "kt" | null; id: string | null };
  /** gewähltes Fahrzeug, gewählte Wache bzw. Krankenhaus (Info-Karte) */
  fahrzeug(): string | null;
  einrichtung(): { art: "wache" | "kh" | "partner"; id: string } | null;
  /** Fahrzeug wird als 3D-Modell gezeichnet */
  alsModell(fliegend: boolean): boolean;
  /** Suchtreffer / gesetzter Ort */
  gesetzt(): { lng: number; lat: number; text: string } | null;
  klick(art: MarkenArt, id: string, ev: MouseEvent): void;
  doppelklick(art: MarkenArt, id: string, ev: MouseEvent): void;
}

export interface Marken {
  /** alles neu (Daten, Auswahl, Ebenen geändert) */
  neu(): void;
  /** Mitglieder eines zusammengefassten Kreises */
  cluster(id: string): [number, number][];
  /** Fahrtziel-Text eines Fahrzeugs */
  dispose(): void;
}

/** Fahrtziel eines Fahrzeugs als Text */
export function fahrtziel(fz: SimFahrzeug): string {
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  if (e) {
    if (["zumZO", "amZO"].includes(fz.status) && e.zo) return e.zo.label;
    if (fz.phase === "bereitstellung" && e.br) return `Bereitstellungsraum ${e.br.label}`;
    return e.adresse?.label ?? e.bo?.label ?? "";
  }
  const ids = fz.kt?.aktiv ? (fz.kt.fahrten[0] ?? []) : [];
  const k = ids.length ? sim.ktAuftrag(ids[0]) : undefined;
  if (k) {
    const halt = fz.kt?.halte?.[fz.kt.halt];
    const ziel = halt ? sim.ktAuftrag(halt.kt) : k;
    return (halt?.art === "an" ? ziel?.d.nach?.label : ziel?.d.von?.label) ?? k.d.nach?.label ?? "";
  }
  if (fz.fahrt && fz.phase === "rueckfahrt") return fz.stationName ? `Wache ${fz.stationName.replace(/^Wache\s+/, "")}` : "Wache";
  return "";
}

/** Einsätze und Transporte, die eine Stecknadel bekommen */
export function sichtbareEinsaetze(): Einsatz[] {
  return sim.state.einsaetze.filter((e) => e.adresse && e.zustand !== "abgeschlossen" && !e.gsKind);
}
export function sichtbareKt(): KtAuftrag[] {
  return (sim.state.kt ?? []).filter((k) => k.d.von && !["erledigt", "storniert", "anBord", "aufnahme"].includes(k.status));
}

export function addMarken(map: maplibregl.Map, deps: MarkenDeps): Marken {
  const bestand = new Map<string, Eintrag>();
  const container = map.getContainer();
  let clusterMitglieder = new Map<string, [number, number][]>();

  // Zoomklassen für die Namen (Wachen ab „Ort“, Rufnamen ab „Ort“ bzw. bei Auswahl)
  const zoomKlassen = () => {
    const z = map.getZoom();
    container.classList.toggle("zort", z >= ZOOM_ORT);
    container.classList.toggle("zstr", z >= ZOOM_STRASSE);
  };

  // Klicks über ein gemeinsames Ereignis (Marken kommen und gehen)
  const ziel = (ev: Event) => (ev.target as HTMLElement | null)?.closest?.<HTMLElement>(".km[data-art]") ?? null;
  const onKlick = (ev: MouseEvent) => {
    const m = ziel(ev);
    if (!m) return;
    deps.klick(m.dataset.art as MarkenArt, m.dataset.id!, ev);
  };
  const onDbl = (ev: MouseEvent) => {
    const m = ziel(ev);
    if (!m) return;
    ev.stopPropagation();
    ev.preventDefault();
    deps.doppelklick(m.dataset.art as MarkenArt, m.dataset.id!, ev);
  };
  const cc = map.getCanvasContainer();
  cc.addEventListener("click", onKlick);
  cc.addEventListener("dblclick", onDbl, true);

  const imBild = () => {
    const b = map.getBounds();
    const dx = (b.getEast() - b.getWest()) * 0.35;
    const dy = (b.getNorth() - b.getSouth()) * 0.35;
    return (lng: number, lat: number) => lng >= b.getWest() - dx && lng <= b.getEast() + dx && lat >= b.getSouth() - dy && lat <= b.getNorth() + dy;
  };

  const abgleichen = (items: Item[]) => {
    const drin = imBild();
    const neu = new Set<string>();
    for (const it of items) {
      if (!drin(it.lng, it.lat)) continue;
      neu.add(it.key);
      const e = bestand.get(it.key);
      if (e) {
        if (e.lng !== it.lng || e.lat !== it.lat) {
          e.m.setLngLat([it.lng, it.lat]);
          e.lng = it.lng;
          e.lat = it.lat;
        }
        if (e.html !== it.html) {
          e.el.innerHTML = it.html;
          e.html = it.html;
        }
        if (e.cls !== it.cls) {
          for (const c of e.cls.split(" ").filter(Boolean)) e.el.classList.remove(c);
          for (const c of it.cls.split(" ").filter(Boolean)) e.el.classList.add(c);
          e.cls = it.cls;
        }
        if (e.z !== it.z) {
          e.el.style.zIndex = String(it.z);
          e.z = it.z;
        }
        continue;
      }
      const el = document.createElement("div");
      el.className = `km ${it.cls}`;
      el.dataset.art = it.art;
      el.dataset.id = it.id;
      el.innerHTML = it.html;
      el.style.zIndex = String(it.z);
      const m = new maplibregl.Marker({ element: el, anchor: it.anker }).setLngLat([it.lng, it.lat]).addTo(map);
      bestand.set(it.key, { m, el, html: it.html, cls: it.cls, lng: it.lng, lat: it.lat, z: it.z });
    }
    for (const [k, e] of bestand)
      if (!neu.has(k)) {
        e.m.remove();
        bestand.delete(k);
      }
  };

  // ---- Einrichtungen (aus den Stammdaten)
  const einrichtungen = (): Item[] => {
    const out: Item[] = [];
    const z = map.getZoom();
    const ort = z >= ZOOM_ORT;
    const sel = deps.einrichtung();
    const t = sim.state.zeit || Date.now();
    if (deps.ebene("wachen")) {
      for (const s of store.list("stations") as Station[]) {
        const pa = partnerArtVonTyp(s.typ);
        if (pa) {
          if (!ort) continue;
          const pm = PARTNER_MARKE[pa];
          const gew = sel?.art === "partner" && sel.id === s.id;
          out.push({ key: `p:${s.id}`, art: "partner", id: s.id, lng: s.lon, lat: s.lat, anker: "center", z: gew ? 8 : 1, cls: gew ? "gew" : "", html: `<div class="pd ${pm.cls}${gew ? " gewaehlt" : ""}"></div>${tip(`${pm.z} · ${s.name}`)}` });
          continue;
        }
        const heli = s.typ === "Luftrettung";
        const gew = sel?.art === "wache" && sel.id === s.id;
        const kurz = s.name;
        out.push({
          key: `w:${s.id}`,
          art: "wache",
          id: s.id,
          lng: s.lon,
          lat: s.lat,
          anker: "center",
          z: gew ? 8 : 2,
          cls: "",
          html: heli
            ? `<div class="poi hw${gew ? " gewaehlt" : ""}"><span class="wn">${esc(kurz)}</span></div>${tip(`${s.name} · Flugrettung`)}`
            : `<div class="poi wa${gew ? " gewaehlt" : ""}"><span class="wn">${esc(kurz)}</span></div>${tip(s.name)}`,
        });
      }
    }
    if (deps.ebene("kh")) {
      for (const h of store.list("hospitals") as Hospital[]) {
        const a = khAufnahme(h, t);
        const gew = sel?.art === "kh" && sel.id === h.id;
        out.push({ key: `h:${h.id}`, art: "kh", id: h.id, lng: h.lon, lat: h.lat, anker: "center", z: gew ? 8 : 3, cls: "", html: `<div class="poi khm k${a.art}${gew ? " gewaehlt" : ""}"><span class="wn">${esc(h.kurzname || h.name)}</span></div>${tip(`${h.kurzname || h.name} · ${a.text}`)}` });
        if (!ort) continue;
        if (h.zufahrt?.p) out.push({ key: `z:${h.id}`, art: "zuf", id: h.id, lng: h.zufahrt.p.lon, lat: h.zufahrt.p.lat, anker: "center", z: 2, cls: "", html: `<div class="poi zuf"></div>${tip(`Rettungszufahrt ${h.kurzname || h.name}`)}` });
        if (h.landeplatz && typeof h.landeplatz === "object") out.push({ key: `l:${h.id}`, art: "lp", id: h.id, lng: h.landeplatz.lon, lat: h.landeplatz.lat, anker: "center", z: 2, cls: "", html: `<div class="poi lp"></div>${tip(`Landeplatz ${h.kurzname || h.name}`)}` });
      }
    }
    return out;
  };

  // ---- Einsätze, Transporte, Bereitstellungsräume, Zusammenfassung
  const einsaetze = (): Item[] => {
    const out: Item[] = [];
    const a = deps.auswahl();
    type Pin = { key: string; art: "einsatz" | "kt"; id: string; lng: number; lat: number; farbe: string; gew: boolean; html: string; nr: string; titel: string };
    const pins: Pin[] = [];
    for (const e of sichtbareEinsaetze()) {
      const c = findCode(e.code ?? undefined);
      const farbe = e.fremd ? "#9aa0a6" : stufeHex(c?.stufe);
      const gew = a.art === "einsatz" && a.id === e.id;
      const nr = kurzNr(e.nummer);
      const t = `Einsatz ${nr}${c ? ` · ${c.beschreibung}` : ""}${e.adresse?.label ? ` · ${e.adresse.label}` : ""}${e.fremd ? ` · Nachbarzone ${e.fremd.zone}` : ""}`;
      pins.push({ key: `e:${e.id}`, art: "einsatz", id: e.id, lng: e.adresse!.lon, lat: e.adresse!.lat, farbe, gew, nr: `${nr} ${e.code ?? ""}`.trim(), html: pinHtml(farbe, "", nr, e.code || nr, gew), titel: t });
      // Bereitstellungsraum (bis die Polizei den Einsatzort freigibt / Großschaden) und Treffpunkt RTW – NEF
      const br = e.gs?.br && !e.gs.aufgehoben && e.gs.phase !== "ende" ? e.gs.br : e.br && !e.boSicher ? e.br : null;
      if (br) out.push({ key: `b:${e.id}`, art: "br", id: e.id, lng: br.lon, lat: br.lat, anker: "center", z: 3, cls: "", html: `<div class="pa br">BR</div>${tip(`Bereitstellungsraum ${nr}`)}` });
      const rv = e.rendezvous;
      if (rv && rv.status !== "fertig") out.push({ key: `t:${e.id}`, art: "br", id: e.id, lng: rv.punkt.lon, lat: rv.punkt.lat, anker: "center", z: 3, cls: "", html: `<div class="pa tp">TP</div>${tip(`Treffpunkt RTW – NEF ${nr}`)}` });
    }
    for (const k of sichtbareKt()) {
      const gew = a.art === "kt" && a.id === k.id;
      const sek = istUeberstellung(k.d);
      const nr = kurzNr(k.nummer, true, sek);
      const code = k.d.code ?? "";
      pins.push({ key: `k:${k.id}`, art: "kt", id: k.id, lng: k.d.von!.lon, lat: k.d.von!.lat, farbe: KT_FARBE, gew, nr: `${nr} ${code}`.trim(), html: pinHtml(KT_FARBE, "", nr, code || nr, gew), titel: `${sek ? "Überstellung" : "Transport"} ${nr} · Abholort ${k.d.von!.label}` });
    }
    // Weit herausgezoomt: nahe Einsätze als Kreis mit Anzahl (Ring in den Stufenfarben); der gewählte bleibt einzeln
    clusterMitglieder = new Map();
    const imKreis = new Set<string>();
    if (map.getZoom() < ZOOM_ORT) {
      const frei = pins.filter((p) => !p.gew);
      const pt = new Map(frei.map((p) => [p.key, map.project([p.lng, p.lat])]));
      for (const p of frei) {
        if (imKreis.has(p.key)) continue;
        const a0 = pt.get(p.key)!;
        const grp = frei.filter((o) => !imKreis.has(o.key) && Math.hypot(pt.get(o.key)!.x - a0.x, pt.get(o.key)!.y - a0.y) < 44);
        if (grp.length < 2) continue;
        grp.forEach((o) => imKreis.add(o.key));
        const n = grp.length;
        const ring = `conic-gradient(${grp.map((o, i) => `${o.farbe} ${Math.round((i / n) * 100)}% ${Math.round(((i + 1) / n) * 100)}%`).join(",")})`;
        const id = `c${clusterMitglieder.size}`;
        clusterMitglieder.set(id, grp.map((o) => [o.lng, o.lat]));
        const lng = grp.reduce((s, o) => s + o.lng, 0) / n;
        const lat = grp.reduce((s, o) => s + o.lat, 0) / n;
        const titel = `${n} Einsätze: ${grp.map((o) => o.nr).join(", ")} – Klick zoomt hinein`;
        out.push({ key: `c:${grp.map((o) => o.key).sort().join("|")}`, art: "cluster", id, lng, lat, anker: "center", z: 4, cls: "", html: `<div class="clu" style="background:${ring}" title="${esc(titel)}"><span>${n}</span></div>` });
      }
    }
    for (const p of pins) if (!imKreis.has(p.key)) out.push({ key: p.key, art: p.art, id: p.id, lng: p.lng, lat: p.lat, anker: "bottom", z: p.gew ? 9 : 4, cls: "pinm", html: p.html });
    const g = deps.gesetzt();
    if (g) out.push({ key: "gesetzt", art: "gesetzt", id: "gesetzt", lng: g.lng, lat: g.lat, anker: "bottom", z: 10, cls: "pinm", html: `<div class="pinw gew"><svg class="pin" viewBox="0 0 30 40" aria-hidden="true"><path d="${PIN_PFAD}" fill="#3B8BFF" stroke="#fff" stroke-width="2.5"></path><circle cx="15" cy="14.5" r="6" fill="#fff"></circle></svg><span class="etk">${esc(g.text)}</span></div>` });
    return out;
  };

  // ---- Fahrzeuge (nicht: frei auf der Wache)
  const richtung = new Map<string, number>();
  const fahrzeuge = (): Item[] => {
    const out: Item[] = [];
    const t = anzeigeZeit();
    const a = deps.auswahl();
    const selFz = deps.fahrzeug();
    const bearing = map.getBearing();
    for (const fz of Object.values(sim.state.fahrzeuge)) {
      if (daheim(fz)) continue;
      const [lng, lat] = fz.fahrt ? positionBei(fz, t) : [fz.lon, fz.lat];
      const r = richtungBei(fz, t);
      if (r !== null) richtung.set(fz.id, r);
      const faehrt = !!fz.fahrt && t < fz.fahrt.start + fz.fahrt.dauer * 1000;
      const luft = fliegt(fz) && flughoehe(fz, t) > 5;
      const gew = selFz === fz.id || (a.art === "einsatz" && !!a.id && fz.einsatzId === a.id) || (a.art === "kt" && !!a.id && !!fz.kt?.fahrten.some((f) => f.includes(a.id!)));
      const farbe = statusHex(fz.status);
      const st = sim.statusDef(fz.status);
      const zielT = fahrtziel(fz);
      const tipT = `${fz.funkrufname} · ${st.name}${fz.blaulicht && faehrt ? " · mit Sondersignal" : ""}${zielT ? ` · → ${zielT}` : ""}`;
      const modell = deps.alsModell(luft);
      const dreh = ((richtung.get(fz.id) ?? 0) - bearing + 360) % 360;
      const cls = `fzm${ueberFunk(fz.status) ? " funk" : ""}${fz.blaulicht && faehrt ? " sonder" : ""}${gew ? " gew" : ""}${modell ? " modell" : ""}`;
      const html = luft
        ? `<div class="${cls} hl"><span class="heli" style="background:${farbe};--r:${Math.round(dreh)}deg">${HUBSCHRAUBER}</span><span class="fzn">${esc(fz.funkrufname)}</span></div>${tip(tipT)}`
        : `<div class="${cls}"><span class="fzp" style="background:${farbe}">${faehrt ? `<i class="dir" style="--r:${Math.round(dreh)}deg"></i>` : ""}</span><span class="fzn">${esc(fz.funkrufname)}</span></div>${tip(tipT)}`;
      out.push({ key: `f:${fz.id}`, art: "fz", id: fz.id, lng, lat, anker: "center", z: gew ? 9 : 5, cls: "", html });
    }
    return out;
  };

  let stat: Item[] = [];
  let dyn: Item[] = [];
  const statNeu = () => (stat = einrichtungen());
  const dynNeu = () => (dyn = [...einsaetze(), ...fahrzeuge()]);
  const zeichnen = () => abgleichen([...stat, ...dyn]);
  const alles = () => {
    zoomKlassen();
    statNeu();
    dynNeu();
    zeichnen();
  };

  // nach Bewegen/Zoomen: Ausschnitt, Zusammenfassung, Namen
  let zoomVorher = map.getZoom();
  const nachBewegung = () => {
    zoomKlassen();
    const z = map.getZoom();
    const stufe = (x: number) => (x >= ZOOM_STRASSE ? 2 : x >= ZOOM_ORT ? 1 : 0);
    if (stufe(z) !== stufe(zoomVorher)) statNeu();
    zoomVorher = z;
    dynNeu();
    zeichnen();
  };
  map.on("moveend", nachBewegung);
  map.on("rotate", () => {
    dynNeu();
    zeichnen();
  });
  const ausStore = store.onChange(() => {
    statNeu();
    zeichnen();
  });
  let last = 0;
  let khLast = 0;
  const ausSim = sim.onChange(() => {
    const now = performance.now();
    if (now - last < 300) return;
    last = now;
    // Aufnahme-Ring der Krankenhäuser ändert sich selten
    if (now - khLast > 5000) {
      khLast = now;
      statNeu();
    }
    dynNeu();
    zeichnen();
  });
  // flüssige Bewegung der fahrenden Fahrzeuge (ca. 10× pro Sekunde)
  const glatt = window.setInterval(() => {
    if (!sim.state.laeuft || document.hidden) return;
    const t = anzeigeZeit();
    const faehrt = Object.values(sim.state.fahrzeuge).some((fz) => fz.fahrt && t < fz.fahrt.start + fz.fahrt.dauer * 1000 + 1500);
    if (!faehrt) return;
    dyn = [...dyn.filter((i) => i.art !== "fz"), ...fahrzeuge()];
    zeichnen();
  }, 100);

  map.once("remove", () => {
    window.clearInterval(glatt);
    ausSim();
    ausStore();
    cc.removeEventListener("click", onKlick);
    cc.removeEventListener("dblclick", onDbl, true);
  });
  alles();

  return {
    neu: alles,
    cluster: (id) => clusterMitglieder.get(id) ?? [],
    dispose: () => {
      for (const e of bestand.values()) e.m.remove();
      bestand.clear();
    },
  };
}
