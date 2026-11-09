/**
 * Fahrzeuge-Fenster aus dem Entwurf („Fahrzeuge.dc.html“): Alle Fahrzeuge · Aktive · Statusänderungen.
 * Die drei Ansichten sind im Spiel drei Reiter (dockview); jeder zeichnet dieselbe Vorlage mit seiner Ansicht.
 * Daten aus der Simulation, Aktionen wie bisher: Klick zeigt auf der Karte und öffnet den Auftrag,
 * Doppelklick: Kamera folgt, Rechtsklick: Status setzen (dazu Besetzung ändern, aus dem Einsatz freigeben).
 */
import { sim, type SimFahrzeug } from "../../../sim/engine";
import { findCode } from "../../../sim/codes";
import { ktCode } from "../../../sim/ktCodes";
import { REGELN } from "../../../sim/crew";
import type { StatusKey } from "../../../sim/settings";
import { funkgruppe, inFunkgruppe } from "../../../sim/funkgruppen";
import { store } from "../../../data/store";
import { toast } from "../../dom";
import { pers } from "../../ws/persoenlich";
import type { PanelKontext, PanelInstanz } from "../../ws/arbeitsplatz";
import { fahrzeugZeigen, karteZeigen, waehle } from "../../ws/auswahl";
import { besetzungDialog, fehlerZeigen, istFunkStatus } from "../../panels/teile";
import { entwurfEinbinden } from "../../entwurf/einbinden";
import { hoverMarkieren, markiert, onMarkiert } from "../../ws/markieren";
import vorlage from "./vorlage.html?raw";
import css from "./fahrzeuge.css?raw";
import { FahrzeugeLogik, type FahrzeugeApp, type FzZeile, type LogZeile, type StatusAnzeige } from "./logik.js";

// ---------------------------------------------------------------- Eigene Funkgruppe / alle

/** Wo gehört das Fahrzeug hin? „eigen“ = Dienststelle in der gespielten Funkgruppe (Hubschrauber immer),
 *  „aussen“ = von außen, aber gerade bei einem Einsatz in der eigenen Funkgruppe, sonst „fremd“ */
const heimCache = new Map<string, boolean>();
export function fzBereich(fz: SimFahrzeug): "eigen" | "aussen" | "fremd" {
  // Hubschrauber und ihr Ausweich-NEF am Stützpunkt immer
  if (fz.rmTyp === "NAH" || fz.rmTyp === "ITH" || fz.ersatzFuer) return "eigen";
  const g = funkgruppe(store.settings.funkgruppe);
  const k = `${g.id}|${fz.id}|${fz.heim.lat.toFixed(4)},${fz.heim.lon.toFixed(4)}`;
  let drin = heimCache.get(k);
  if (drin === undefined) {
    drin = inFunkgruppe(g, fz.heim.lat, fz.heim.lon);
    heimCache.set(k, drin);
  }
  if (drin) return "eigen";
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  const ort = e?.wahr ?? e?.bo ?? null;
  if (ort && typeof ort.lat === "number" && inFunkgruppe(g, ort.lat, ort.lon)) return "aussen";
  return "fremd";
}

/** „NÖ-03“ → „RD-NOE-03“ (Name der Funkgruppe wie am Funkgerät) */
function gruppenName(): string {
  return String(funkgruppe(store.settings.funkgruppe).id).replace(/^NÖ-/, "RD-NOE-");
}

/** aktiv = unterwegs oder beschäftigt; frei auf der Wache und abgemeldet (Status 0) zählen nicht */
export function fzAktiv(f: SimFahrzeug): boolean {
  return !!f.einsatzId || !!f.kt?.aktiv || (f.status !== "freiWache" && f.status !== "abgemeldet") || (f.status === "freiWache" && f.phase !== "frei");
}

// ---------------------------------------------------------------- Status

/** Kürzel der Zeilenfarbe (Klassen .s1, .s6, .sa … aus fenster.css; Nummern sind einstellbar, die Bedeutung nicht) */
const S_CODE: Record<StatusKey, string> = {
  freiWache: "1", freiFunk: "6", alarmWache: "a", alarmFunk: "f", alarmiert: "9", zumBO: "2",
  amBO: "3", zumZO: "4", amZO: "5", dienstfahrt: "7", bereitschaft: "8", abgemeldet: "0",
};
const ALLE_STATUS = Object.keys(S_CODE) as StatusKey[];
/** von Hand setzbar (wie bisher im Spiel), in der Reihenfolge der Nummern */
const MENUE_STATUS: StatusKey[] = ["freiWache", "freiFunk", "dienstfahrt", "bereitschaft", "abgemeldet"];

/** eigene Statusfarbe (Einstellungen › Farben › Eigene Statusfarben), sonst die Farbe des Entwurfs */
function farbe(k: StatusKey): string {
  return pers().statusFarben?.[k] || `var(--s${S_CODE[k]})`;
}
function statusAnzeige(): Record<string, StatusAnzeige> {
  const r: Record<string, StatusAnzeige> = {};
  for (const k of ALLE_STATUS) {
    const d = sim.statusDef(k);
    r[k] = { nr: d.nummer, name: d.name, farbe: farbe(k), funk: k === "freiFunk" || k === "alarmFunk" };
  }
  return r;
}

// ---------------------------------------------------------------- Orte, Gruppen

/** Ort der Dienststelle (ohne Organisationsnamen): Ort aus den Daten, sonst das Ende des Namens */
function wacheOrt(fz: SimFahrzeug): string {
  const s = store.get("stations", fz.stationId);
  if (s?.ort) return s.ort;
  const n = fz.stationName || s?.name || "";
  const m = n.match(/(?:Bezirksstelle|Ortsstelle|Krankentransport|Leitstelle|Standort|Niederösterreich|Dienststelle)\s+(.+)$/);
  return (m ? m[1] : n).trim();
}
const istHeli = (f: SimFahrzeug) => f.rmTyp === "NAH" || f.rmTyp === "ITH";
const SEK = ["SKTW", "SRTW", "SNAW", "BIT"];
function gruppeVon(f: SimFahrzeug): string {
  if (istHeli(f) || f.ersatzFuer) return "Hubschrauber";
  return f.funkrufname.includes("/") ? f.funkrufname.split("/")[0] : "Sonstige";
}
/** Gruppenname nach Bezirk aus den Spieldaten: Ort, an dem die meisten Fahrzeuge der Gruppe stehen */
let namenCache: { n: number; namen: Map<string, string> } | null = null;
function gruppenNamen(alle: SimFahrzeug[]): Map<string, string> {
  if (namenCache && namenCache.n === alle.length) return namenCache.namen;
  const orte = new Map<string, Map<string, number>>();
  const arten = new Map<string, Set<string>>();
  for (const f of alle) {
    const k = gruppeVon(f);
    const o = wacheOrt(f);
    const m = orte.get(k) ?? new Map<string, number>();
    if (o) m.set(o, (m.get(o) ?? 0) + 1);
    orte.set(k, m);
    const a = arten.get(k) ?? new Set<string>();
    a.add(SEK.includes(f.rmTyp) ? "sek" : f.rmTyp === "ACN" ? "acn" : "rd");
    arten.set(k, a);
  }
  const namen = new Map<string, string>();
  for (const [k, m] of orte) {
    if (k === "Hubschrauber" || k === "Sonstige") {
      namen.set(k, k);
      continue;
    }
    const haupt = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const a = arten.get(k)!;
    const art = a.size === 1 && a.has("sek") ? "Sekundärtransport" : a.size === 1 && a.has("acn") ? "Akutpflege (ACN)" : "Rettungsdienst";
    namen.set(k, art === "Akutpflege (ACN)" || !haupt ? art : `${art} ${haupt}`);
  }
  namenCache = { n: alle.length, namen };
  return namen;
}

/** letzter bekannter Standort je Fahrzeug (wo es zuletzt stand) – für „Letzter Standort“ während der Fahrt */
const zuletztGestanden = new Map<string, string>();

function khName(id: string | undefined): string {
  const h = id ? store.get("hospitals", id) : undefined;
  return h ? h.kurzname || h.name : "";
}
function ktHalt(fz: SimFahrzeug): string {
  const p = fz.kt;
  const h = p?.halte?.[p.halt];
  const k = h ? sim.ktAuftrag(h.kt) : undefined;
  if (!k || !h) return "";
  return (h.art === "ab" ? k.d.von?.label : k.d.nach?.label) ?? "";
}
/** Letzter Standort und Fahrtziel aus Phase und Auftrag */
function orte(fz: SimFahrzeug): { von: string; nach: string } {
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  const wache = `${istHeli(fz) ? "Stützpunkt" : "Wache"} ${wacheOrt(fz)}`.trim();
  const bo = e?.adresse?.label ?? "";
  const kh = khName(e?.kh?.hospitalId);
  let stand = "";
  let nach = "";
  const daheim = Math.abs(fz.lat - fz.heim.lat) < 0.003 && Math.abs(fz.lon - fz.heim.lon) < 0.004;
  switch (fz.phase) {
    case "frei":
      if (!fz.fahrt && daheim) stand = wache;
      break;
    case "ausruecken":
      stand = daheim ? wache : "";
      nach = bo;
      break;
    case "anfahrt":
    case "suche":
    case "rendezvous":
      nach = bo;
      break;
    case "vorOrt":
    case "treffpunkt":
      stand = bo;
      break;
    case "transport":
      nach = kh;
      break;
    case "warteKH":
    case "uebergabe":
      stand = kh;
      break;
    case "rueckfahrt":
      nach = wache;
      break;
    case "ktFahrt":
      nach = ktHalt(fz);
      break;
    case "ktHalt":
      stand = ktHalt(fz);
      break;
  }
  if (stand) zuletztGestanden.set(fz.id, stand);
  return { von: stand || zuletztGestanden.get(fz.id) || "", nach };
}

function eta(fz: SimFahrzeug): number | null {
  // Spieler-NAH: Ankunft aus der echten Geschwindigkeit (Flugsimulator) bzw. dem Übungsflug
  const a = fz.pilot ? sim.pilotAnkunft(fz) : null;
  if (a) return Math.max(1, Math.round(a.min));
  if (!fz.fahrt) return null;
  const rest = (fz.fahrt.start + fz.fahrt.dauer * 1000 - sim.state.zeit) / 60_000;
  return rest > 0 ? Math.max(1, Math.round(rest)) : null;
}

const hhmm = (x: number) => new Date(x).toTimeString().slice(0, 5);

/** kleine Marken nach der Funkkennung: Pilot, Dienst (Dienstende/Wechsel, Ersatz-NEF), KT vorgemerkt – außer Dienst zeigt schon der Status „abgemeldet“ */
function marken(fz: SimFahrzeug): FzZeile["marken"] {
  const l: FzZeile["marken"] = [];
  if (fz.pilot) l.push({ t: `✈ ${fz.pilot.name}`, titel: `Wird von ${fz.pilot.name} geflogen (Pilot)${fz.pilot.offlineSeit ? " – Verbindung unterbrochen" : ""}`, cls: "aussen", fz: "" });
  if (fz.ersatzFuer) l.push(fz.ausserDienst
    ? { t: "nur bei Flugverbot", titel: `Ersatz-NEF für ${fz.ersatzFuer}: wird angemeldet, wenn der Hubschrauber wegen des Wetters nicht fliegen kann`, cls: "aussen", fz: "" }
    : { t: `statt ${fz.ersatzFuer}`, titel: `Ersatz für ${fz.ersatzFuer} – der Hubschrauber kann gerade nicht fliegen`, cls: "aussen", fz: "" });
  else if (fz.wechselOffen) l.push({ t: fz.wechselOffen === "ende" ? "Dienstende – fährt heim" : "Wechsel ausständig", titel: fz.wechselOffen === "ende" ? "Dienstende vorbei – meldet sich ab, sobald das Fahrzeug auf der Dienststelle ist" : "Schichtwechsel fällig – das neue Team übernimmt auf der Dienststelle", cls: "aussen", fz: fz.id });
  if (fz.kt && !fz.kt.aktiv && fz.kt.fahrten.length) l.push({ t: `KT vorgemerkt${fz.kt.losUm ? ` ab ${hhmm(fz.kt.losUm)}` : ""}`, titel: "Für einen Krankentransport vorgemerkt – wird beim Alarmieren für einen Notfall gelöst", cls: "aussen", fz: "" });
  return l;
}

function zeile(fz: SimFahrzeug, namen: Map<string, string>, sa: Record<string, StatusAnzeige>): FzZeile {
  const key = fz.status;
  const bereich = fzBereich(fz);
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  const codes: FzZeile["codes"] = [];
  let auf: [string, string] | null = null;
  if (e) {
    const c = findCode(e.code ?? undefined);
    if (c) codes.push({ c: c.code, text: `${c.code} · ${c.beschreibung || c.gruppenname}` });
    auf = [e.nummer, `${c ? c.code + " " : ""}${e.adresse?.label ?? ""}`];
  } else if (fz.kt) {
    const ids = fz.kt.fahrten.flat();
    const k0 = ids.length ? sim.ktAuftrag(ids[0]) : undefined;
    for (const id of ids) {
      const k = sim.ktAuftrag(id);
      const code = k?.d.code;
      if (!code || codes.some((x) => x.c === code)) continue;
      const c = ktCode(code);
      codes.push({ c: code, text: `${code}${c ? ` · ${c.name}` : ""}` });
    }
    if (k0) auf = [k0.nummer, `${k0.d.von?.label ?? ""} → ${k0.d.nach?.label ?? ""}`];
  }
  const o = orte(fz);
  const min = eta(fz);
  const typ = fz.typ ?? fz.rmTyp;
  const wache = istHeli(fz) ? fz.kurzname || wacheOrt(fz) : wacheOrt(fz);
  const pf = pers().statusFarben?.[key];
  return {
    id: fz.id,
    eid: fz.einsatzId ?? "",
    ruf: fz.funkrufname,
    typ,
    wache,
    key,
    s: S_CODE[key],
    nr: sa[key].nr,
    stx: sa[key].name,
    funk: istFunkStatus(fz),
    stil: pf ? `background: ${pf};` : "",
    crew: fz.besetzung.length ? fz.besetzung.map((p) => p.quali) : ["–"],
    auf,
    eta: min === null ? "" : `${min} min`,
    etaMin: min,
    von: o.von,
    nach: o.nach,
    codes,
    fremd: bereich === "fremd",
    aussen: bereich === "aussen",
    aktiv: fzAktiv(fz),
    gKey: gruppeVon(fz),
    gName: namen.get(gruppeVon(fz)) ?? gruppeVon(fz),
    rtw: fz.rmTyp === "RTW" || fz.rmTyp === "RTW-C" || fz.rmTyp === "NAW",
    ktw: fz.rmTyp === "KTW",
    nef: fz.rmTyp === "NEF",
    nah: istHeli(fz),
    sek: SEK.includes(fz.rmTyp),
    el: fz.rmTyp === "BEL" || fz.rmTyp === "EL ÖBB",
    marken: marken(fz),
    suche: [fz.funkrufname, typ, fz.rmTyp, wache, fz.kurzname, fz.stationName, auf?.join(" ") ?? "", codes.map((c) => c.c).join(" ")].join(" ").toLowerCase(),
  };
}

function logZeilen(sa: Record<string, StatusAnzeige>): LogZeile[] {
  const log = sim.state.statusLog ?? [];
  const r: LogZeile[] = [];
  for (let i = log.length - 1; i >= 0 && r.length < 2000; i--) {
    const x = log[i];
    const lfz = sim.state.fahrzeuge[x.fzId];
    const text = [sa[x.nach]?.name, x.einsatz, x.grund].filter(Boolean).join(" · ");
    r.push({
      zeit: new Date(x.zeit).toTimeString().slice(0, 8),
      id: x.fzId,
      ruf: x.funkrufname,
      von: x.von,
      nach: x.nach,
      text,
      einsatz: !!x.einsatz,
      fremd: !!lfz && fzBereich(lfz) === "fremd",
      suche: `${x.funkrufname} ${sa[x.von]?.name} ${sa[x.nach]?.name} ${sa[x.nach]?.nr} ${x.einsatz ?? ""} ${x.grund ?? ""}`.toLowerCase(),
    });
  }
  return r;
}

// ---------------------------------------------------------------- Fenster

const TITEL = { alle: "Alle Fahrzeuge", aktive: "Aktive", log: "Statusänderungen" } as const;

export function fahrzeugeFenster(ctx: PanelKontext, ansicht: "alle" | "aktive" | "log", standardTitel: string): PanelInstanz {
  const root = document.createElement("div");
  root.style.height = "100%";
  // Reitertitel wie im Entwurf (das Fenster-Menü behält den langen Namen)
  const nr = ctx.panelId.match(/-(\d+)$/)?.[1];
  if (TITEL[ansicht] !== standardTitel) ctx.setzeTitel(nr ? `${TITEL[ansicht]} ${nr}` : TITEL[ansicht]);
  let veraltet = false;
  const app: FahrzeugeApp = {
    ansicht,
    gemerkt: ctx.params,
    merken: (p) => ctx.setzeParams(p),
    fahrzeuge: () => {
      const alle = Object.values(sim.state.fahrzeuge);
      const namen = gruppenNamen(alle);
      const sa = app.status;
      return alle.map((f) => zeile(f, namen, sa));
    },
    log: () => logZeilen(app.status),
    status: statusAnzeige(),
    menueStatus: MENUE_STATUS,
    bereichName: gruppenName,
    bereichGeaendert: () => badge(),
    klick: (id) => {
      const fz = sim.state.fahrzeuge[id];
      if (!fz) return;
      karteZeigen(fz.lat, fz.lon, 13.5);
      fahrzeugZeigen(fz.id);
      if (fz.einsatzId) waehle("einsatz", fz.einsatzId, { karte: false });
      else if (fz.kt?.fahrten[0]?.[0]) waehle("kt", fz.kt.fahrten[0][0], { karte: false });
    },
    folgen: (id) => fahrzeugZeigen(id, true),
    logKlick: (id) => fahrzeugZeigen(id, false),
    setzeStatus: (id, key) => {
      void sim
        .call("manualStatus", id, key as StatusKey)
        .then((err) => {
          if (typeof err === "string" && err) toast(err, "error");
        })
        .catch((x) => toast(String(x?.message ?? x), "error"));
    },
    weitere: (id) => {
      const fz = sim.state.fahrzeuge[id];
      if (!fz) return [];
      const l: { t: string; klick: () => void }[] = [];
      if (fz.besetzung.length || REGELN[fz.rmTyp]?.length) l.push({ t: "Besetzung ändern …", klick: () => besetzungDialog(sim.state.fahrzeuge[id] ?? fz) });
      if (fz.einsatzId) l.push({ t: "Aus dem Einsatz freigeben", klick: () => void fehlerZeigen(sim.call("entlasse", id)) });
      return l;
    },
  };
  const f = entwurfEinbinden(root, "fahrzeuge", vorlage, css, (p) => new FahrzeugeLogik(p), { app });
  // nach jedem Zeichnen (auch durch Filter, Sortieren …) die Markierung aus der Einsatzliste wieder setzen
  const zeichneEntwurf = f.k._zeichnen;
  f.k._zeichnen = () => {
    zeichneEntwurf?.();
    markierung(markiert("fahrzeug"));
  };

  /** Zahl am Reiter (Alle: sichtbare Fahrzeuge, Aktive: unterwegs) – auch wenn der Reiter nicht vorne ist */
  function badge(): void {
    if (ansicht === "log") return;
    const alle = !!f.k.state.bereichAlle;
    let n = 0;
    for (const fz of Object.values(sim.state.fahrzeuge)) {
      if (!alle && fzBereich(fz) === "fremd") continue;
      if (ansicht === "aktive" && !fzAktiv(fz)) continue;
      n++;
    }
    ctx.setzeBadge(n || null, "zahl");
  }
  function zeichnen(): void {
    badge();
    if (!ctx.sichtbar()) {
      veraltet = true;
      return;
    }
    veraltet = false;
    app.status = statusAnzeige();
    f.zeichnen();
  }
  /** Markieren beim Darüberfahren in der Einsatzliste: nur die Klasse der Zeile umschalten */
  function markierung(id: string | null): void {
    root.querySelectorAll(".fzz.mark").forEach((x) => x.classList.remove("mark"));
    if (id) root.querySelectorAll(`.fzz[data-fz="${CSS.escape(id)}"]`).forEach((x) => x.classList.add("mark"));
  }
  // im ersten Zeichnen war das Panel evtl. noch nicht im Dokument
  requestAnimationFrame(zeichnen);
  let wartet = false;
  const aus = [
    sim.onChange(() => {
      if (wartet) return;
      wartet = true;
      setTimeout(() => {
        wartet = false;
        zeichnen();
      }, 500);
    }),
    store.onChange(() => zeichnen()),
    onMarkiert("fahrzeug", markierung),
    // Darüberfahren über einen Code markiert den Einsatz in der Einsatzliste
    hoverMarkieren(root, "data-mkeinsatz", "einsatz"),
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
