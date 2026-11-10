/**
 * Piloten-Interface (Spieler-NAH): Ein Mitspieler tritt mit dem Code bei, übernimmt einen Hubschrauber und
 * sieht statt der Leitstelle nur seine eigene Ansicht – Alarmierung, Status, Karte, Patientenblatt am
 * Berufungsort, Entscheidung (Transport / Übergabe / kein Transport) und Übungsflug ohne Flugsimulator.
 * Die Simulation läuft beim Host; alles hier geht als Befehl an ihn (sim.call).
 */
import "./pilot.css";
import type maplibregl from "maplibre-gl";
import { store } from "../../data/store";
import { buchungName } from "../../data/klinik";
import { ALTERSGRUPPEN, altersgruppeVon, DRINGLICHKEITEN, dringlichkeitFuer, symptom, symptomAusDiagnose, symptomSuche, zuweisungId, zuweisungLesen, type Altersgruppe, type Dringlichkeit, type Symptom } from "../../data/zuweisung";
import { khLandung, type Hospital } from "../../data/model";
import { mp, meinName } from "../../net/mehrspieler";
import { findCode } from "../../sim/codes";
import { fliegt, sim, type Einsatz, type PilotPlan, type SimFahrzeug } from "../../sim/engine";
import { distanceM } from "../../sim/geo";
import type { StatusKey } from "../../sim/settings";
import { WETTER_LABEL } from "../../sim/weather";
import { availableMaps, createMap, type MapHandle } from "../../map";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import { logoMarke } from "../logo";
import { stufeFarbe } from "../panels/teile";
import { istDunkel } from "../ws/persoenlich";
import { pilotModusSetzen } from "./modus";
import { AKTIONEN, belegung, kuerzelName, tastenName, type PilotAktion } from "./tasten";
import { eingabeStarten, eingabeStoppen, handyHalten, tastenDialog } from "./eingabe";
import { funkGeraetErstellen, gruppenName } from "../funkGeraet";
import { funkEmpfang, funkGruppenSetzen, funkGruppenWahl, funkSendeZustand, funkTon, gruppeHoerbar, gsGruppeOffen, onFunkEmpfang, onFunkSenden, sprechGruppe, sprechKnopfAnbinden, sprechStart, sprechStopp } from "../sprechfunk";
import { MODELLE, mikrofone, modellLaden, setzeSprache, sprachPrefs, sprachStatus } from "../sprache";
import { inTauri } from "../../platform";
import mikroUrl from "../../assets/ptt-mikro.webp?url";
import { wetterOeffnen } from "../wetterView";
import { ALARM_AUFNAHMEN, ALARM_STANDARD, ALARM_VORLAGEN, alarmPrefs, alarmPrefsSetzen, alarmStarten, alarmStoppen, alarmtonHinzufuegen, eigeneAlarmtoene, probeLaeuft, probeSpielen, probeStoppen, type AlarmArt } from "./alarmToene";
import { dateiLoeschen } from "../sounds";
import { ablageZeigen } from "../../net/ablage";
import { flugEingeschraenkt, flugverbot, LAGE, richtungText, symbolFuer } from "../../sim/weather";
import { efbStarten, handyAktionen, handyBuchung, handyDialog, handyStand, handyStandBauen } from "./handy";
import { hpg, hpgAktualisieren, hpgEinrichten, hpgMissionFuer, hpgStarten, hpgTestNachricht } from "./hpg";
import { letzterCarls } from "./eingabe";
import { carlsAn, carlsUmschalten, communityWaehlen, gtn, gtnAn, gtnBereitlegen, gtnSuchen, gtnUmschalten } from "./flugsim";
import { datenEmpfangen, datenFrisch, dllWaehlen, flugplanSpeichern, flugsim, flugsimAnbinden, flugsimBeenden, flugsimTrennen, flugsimVerbinden, koordText, vorgabe, wetterDialog } from "./flugsim";

// ------------------------------------------------------------------ Hilfen

const I: Record<string, string> = {
  heli: `<path d="M3 6h18M12 6v3"/><path d="M6 13a6 4 0 0 1 6-4h3a4 4 0 0 1 4 4v1a2 2 0 0 1-2 2H9a3 3 0 0 1-3-3z"/><path d="M19 13l3-2M9 16l-1 3h9l-1-3"/>`,
  flug: `<path d="M2 16l20-6-20-6 4 6z"/>`,
  ziel: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>`,
  kh: `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>`,
  haus: `<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>`,
  stopp: `<rect x="6" y="6" width="12" height="12" rx="2"/>`,
  punkt: `<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>`,
  tasten: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`,
  handy: `<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>`,
  tausch: `<path d="M4 8h13l-3-3M20 16H7l3 3"/>`,
  tuer: `<path d="M14 4h5v16h-5"/><path d="M10 16l4-4-4-4M14 12H4"/>`,
  test: `<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/>`,
  patient: `<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>`,
  chat: `<path d="M4 5h16v11H9l-5 4z"/>`,
  folgen: `<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>`,
  wolke: `<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z"/>`,
  sim: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 12l3-3 2 2 5-5"/>`,
  plan: `<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>`,
  zeit: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  funk: `<rect x="6" y="8" width="12" height="14" rx="2"/><path d="M9 8l6-6M9 13h6M9 17h6"/>`,
  liste: `<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>`,
  gross: `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  haken: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>`,
  wind: `<path d="M12 19V5M6 11l6-6 6 6"/>`,
  zahnrad: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  glocke: `<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>`,
  mikro: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`,
};
const ico = (n: string, k = "") => `<svg class="plt-ico ${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] ?? ""}</svg>`;

const uhrzeit = (t: number) => new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
const minuten = (sek: number) => (sek < 60 ? "< 1 min" : `${Math.round(sek / 60)} min`);

/** Einsatzstichwort: Code der Leitstelle, sonst die Meldung */
function stichwort(e: Einsatz): string {
  const c = findCode(e.code ?? undefined);
  if (c) return c.beschreibung;
  if (e.code) return e.code;
  const m = (e.meldung?.text ?? "").split(/[.;]/)[0].trim();
  return m || "Einsatz (noch ohne Code)";
}

function meinFz(): SimFahrzeug | undefined {
  return sim.pilotVon(mp.ich.pid);
}

/**
 * Neuer Einsatz: zuerst nur der Ton „Einsatz rein“, 2–5 Sekunden später die eigentliche Alarmierung
 * (Einsatzdaten, Alarmbalken, Melder, Handy). So lange ist der Einsatz in der Ansicht noch nicht da.
 */
let vorlauf: { id: string; bis: number } | null = null;
let vorlaufGesehen: string | null = null;

function vorlaufPruefen(fz: SimFahrzeug | undefined): void {
  const id = fz?.einsatzId ?? null;
  if (id && id !== vorlaufGesehen && fz && ["alarmWache", "alarmFunk"].includes(fz.status)) {
    const ms = 2000 + Math.round(Math.random() * 3000);
    vorlauf = { id, bis: Date.now() + ms };
    funkTon("einsatzRein");
    window.setTimeout(() => zeichneAlles(), ms + 30);
  }
  vorlaufGesehen = id;
}

function imVorlauf(fz: SimFahrzeug | undefined): boolean {
  return !!vorlauf && !!fz && fz.einsatzId === vorlauf.id && Date.now() < vorlauf.bis;
}

function einsatzVon(fz: SimFahrzeug | undefined): Einsatz | undefined {
  if (imVorlauf(fz)) return undefined;
  return fz?.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
}

function fehler(e: unknown): void {
  toast(String((e as Error)?.message ?? e), "error");
}

async function befehl<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    const r = await p;
    if (typeof r === "string" && r) toast(r, "error");
    return r;
  } catch (e) {
    fehler(e);
    return undefined;
  }
}

const LETZTER = "leitwerk.pilot.letzterHeli";
export function letzterHeli(): string | null {
  try {
    return localStorage.getItem(LETZTER);
  } catch {
    return null;
  }
}
export function merkeHeli(id: string): void {
  try {
    localStorage.setItem(LETZTER, id);
  } catch {
    /* egal */
  }
}

// ------------------------------------------------------------------ Aktionen (auch für Tasten, Joystick, Handy)

/** Status drücken */
export function pilotStatusDruecken(s: StatusKey): void {
  const fz = meinFz();
  if (!fz) return;
  void befehl(sim.call("pilotStatus", fz.id, s));
}

/** Übungsflug zum nächsten sinnvollen Ziel – oder anhalten, wenn er schon fliegt */
export function pilotFliegenNaechstes(): void {
  const fz = meinFz();
  if (!fz) return;
  if (fz.fahrt) return void befehl(sim.call("pilotFliegen", fz.id, null));
  const e = einsatzVon(fz);
  // Großeinsatz: aus dem Bereitstellungsraum abgerufen → zum Einsatzort
  const abruf = !!e && fz.phase === "wartetBR" && !!sim.pilotGsHinweis(fz)?.abruf;
  const ziel = e && (["alarmWache", "alarmFunk", "alarmiert", "zumBO"].includes(fz.status) || abruf) ? "bo" : e?.kh && fz.status === "zumZO" ? "zo" : "heim";
  void befehl(sim.call("pilotFliegen", fz.id, ziel));
}

/** Status wie am Funkgerät: Drücken gibt einen kurzen Ton, nach ca. 2 s Halten geht er durch (düt-düt-düt-düt) */
const STATUS_HALTE_MS = 2000;
let statusHalt: { s: StatusKey; timer: number } | null = null;

function statusHaltenStart(s: StatusKey): void {
  if (!meinFz()) return;
  if (statusHalt) window.clearTimeout(statusHalt.timer);
  funkTon("statusDruck");
  const timer = window.setTimeout(() => {
    statusHalt = null;
    statusHaltAnzeigen(null);
    funkTon("statusGesendet");
    pilotStatusDruecken(s);
  }, STATUS_HALTE_MS);
  statusHalt = { s, timer };
  statusHaltAnzeigen(s);
}

/** losgelassen: vor der Zeit → nichts passiert (noch einmal drücken) */
function statusHaltenEnde(s?: StatusKey): void {
  if (!statusHalt || (s && statusHalt.s !== s)) return;
  window.clearTimeout(statusHalt.timer);
  statusHalt = null;
  statusHaltAnzeigen(null);
}

function statusHaltAnzeigen(s: StatusKey | null): void {
  root?.querySelectorAll<HTMLElement>(".plt-st").forEach((b) => b.classList.toggle("haelt", !!s && b.dataset.s === s));
}

export function pilotAktion(a: PilotAktion, sofort = false): void {
  const def = AKTIONEN.find((x) => x.id === a);
  if (def?.status) {
    if (sofort) {
      funkTon("statusGesendet");
      pilotStatusDruecken(def.status);
    } else statusHaltenStart(def.status);
  }
  else if (a === "fliegen") pilotFliegenNaechstes();
  else if (a === "funk") void sprechStart("leo");
  else if (a === "funkRtw") void sprechStart("leo");
}

/** Sprechtaste losgelassen */
export function pilotLoslassen(a: PilotAktion): void {
  const def = AKTIONEN.find((x) => x.id === a);
  if (def?.status) return statusHaltenEnde(def.status);
  if (a === "funk" || a === "funkRtw") void sprechStopp();
}

// ------------------------------------------------------------------ Beitritt

/** Startseite: „Als Pilot beitreten“ – Name und Code, dann Hubschrauber wählen */
export function pilotBeitrittOeffnen(nachBeitritt?: () => void): void {
  const body = el("div", { class: "plt-beitritt" });
  body.innerHTML = `
    <p>Du fliegst einen Notarzthubschrauber selbst – mit Flugsimulator oder im Übungsflug. Die Leitstelle disponiert dich ganz normal.</p>
    <label>Dein Name<input class="plt-in-name" maxlength="30" placeholder="z. B. Paul"></label>
    <label>Code des Spiels<input class="plt-in-code" inputmode="numeric" maxlength="6" placeholder="6 Ziffern"></label>
    <p class="plt-leise">Den Code bekommst du vom Host (Multiplayer-Lobby auf seiner Startseite).</p>
    <div class="plt-testmodus"><b>Testmodus (ohne Leitstelle)</b><span>Alles ausprobieren, ohne dass jemand disponiert: das Spiel läuft nur bei dir, Einsätze schickst du dir über das Testmenü selbst. Kein Code nötig.</span></div>`;
  const name = body.querySelector<HTMLInputElement>(".plt-in-name")!;
  const code = body.querySelector<HTMLInputElement>(".plt-in-code")!;
  name.value = meinName();
  code.value = mp.letztesSpiel().code ?? "";
  const d = openDialog({
    title: "Als Pilot beitreten",
    body,
    actions: [
      { label: "Abbrechen", kind: "plain" },
      {
        label: "Testmodus",
        kind: "plain",
        onClick: async () => {
          try {
            if (mp.status.rolle === "host") throw new Error("Du bist gerade Host eines Spiels – zuerst das Spiel beenden");
            if (mp.status.rolle === "client") mp.verlassen();
            if (name.value.trim()) mp.setName(name.value);
            // das eigentliche Spiel vorher sichern – der Testmodus beginnt ein eigenes
            const { jetztSichern } = await import("../../net/spielstand");
            await jetztSichern().catch(() => undefined);
            sim.pilotTestStarten({ pid: mp.ich.pid, name: mp.ich.name });
          } catch (e) {
            fehler(e);
            return false;
          }
          pilotOeffnen();
          nachBeitritt?.();
          return true;
        },
      },
      {
        label: "Beitreten",
        kind: "primary",
        onClick: async () => {
          if (!name.value.trim()) {
            toast("Bitte einen Namen eingeben", "error");
            return false;
          }
          try {
            if (mp.status.rolle === "host") throw new Error("Du bist gerade Host – als Pilot trittst du einem fremden Spiel bei");
            if (mp.status.rolle === "client" && mp.status.code !== code.value.replace(/\D/g, "")) mp.verlassen();
            if (mp.status.rolle !== "client") await mp.beitreten(code.value, name.value);
          } catch (e) {
            fehler(e);
            return false;
          }
          pilotOeffnen();
          nachBeitritt?.();
          return true;
        },
      },
    ],
  });
  setTimeout(() => (name.value ? code : name).focus(), 50);
  code.addEventListener("keydown", (e) => {
    if (e.key === "Enter") (d.root.querySelector(".dlg-foot .primary") as HTMLButtonElement | null)?.click();
  });
}

// ------------------------------------------------------------------ Hubschrauber wählen

let wahlDlg: { close(): void } | null = null;
/** „Wechseln“ gedrückt: dann nicht von selbst wieder den letzten nehmen */
let bewusstAbgegeben = false;
let wiederLaeuft = false;

/**
 * Kein Hubschrauber (neues Spiel im Testmodus, Wiedereinstieg nach Verbindungsverlust, Neustart): den zuletzt
 * geflogenen von selbst wieder übernehmen, wenn er frei ist. Gibt true zurück, wenn das versucht wird.
 */
function letztenWiederNehmen(): boolean {
  if (!root || meinFz() || bewusstAbgegeben || wiederLaeuft) return false;
  if (!Object.keys(sim.state.fahrzeuge).length || !(mp.status.hostDa || sim.pilotTest)) return false;
  const id = letzterHeli();
  const fz = id ? sim.state.fahrzeuge[id] : undefined;
  if (!fz || sim.pilotHindernis(fz, mp.ich.pid)) return false;
  wiederLaeuft = true;
  void sim
    .call("pilotUebernehmen", fz.id)
    .then(() => {
      sim.pilotTestGebiet(fz.id);
      wahlDlg?.close();
      wahlDlg = null;
      toast(`${fz.kurzname || fz.funkrufname} wieder übernommen – „Wechseln“ für einen anderen`);
      zeichneAlles();
    })
    .catch(() => undefined)
    .finally(() => (wiederLaeuft = false));
  return true;
}

function hubschrauberWahl(): void {
  const body = el("div", { class: "plt-wahl" });
  const zeichnen = () => {
    const ich = mp.ich.pid;
    const letzter = letzterHeli();
    const liste = Object.values(sim.state.fahrzeuge)
      .filter((x) => fliegt(x) && !x.ersatzFuer)
      .sort((a, b) => Number(!!sim.pilotHindernis(a, ich)) - Number(!!sim.pilotHindernis(b, ich)) || a.funkrufname.localeCompare(b.funkrufname));
    if (!liste.length) {
      body.innerHTML = `<p class="plt-leise">Noch keine Daten vom Host – einen Moment …</p>`;
      return;
    }
    body.innerHTML = `<p class="plt-leise">Wähle deinen Hubschrauber. Übernehmen kannst du jeden, der gerade im Dienst ist. Hubschrauber, die nur bei Tag fliegen, kannst du nachts zwar nehmen, aber nicht alarmiert bekommen.</p>`;
    const ul = el("div", { class: "plt-wahl-liste" });
    for (const fz of liste) {
      const grund = sim.pilotHindernis(fz, ich);
      const hind = sim.flugHindernis(fz);
      const st = sim.statusDef(fz.status);
      const b = el("button", { class: `plt-wahl-b${grund ? " aus" : ""}${fz.id === letzter ? " letzter" : ""}` });
      b.disabled = !!grund;
      b.innerHTML = `${ico("heli", "gross")}<span class="plt-wahl-name"><b>${esc(fz.kurzname || fz.funkrufname)}</b><small>${esc(fz.funkrufname)} · ${esc(fz.stationName)}</small></span>
        <span class="plt-wahl-st"><i style="background:${st.farbe}"></i>${esc(st.nummer)} ${esc(st.name)}</span>
        <span class="plt-wahl-info">${grund ? esc(grund) : hind ? `<span class="plt-warn">${esc(hind)}</span>` : fz.id === letzter ? "zuletzt geflogen" : fz.nachtflug ? "Tag und Nacht" : "nur Tagflug"}</span>`;
      b.addEventListener("click", async () => {
        try {
          await sim.call("pilotUebernehmen", fz.id);
          sim.pilotTestGebiet(fz.id);
          merkeHeli(fz.id);
          bewusstAbgegeben = false;
          dlg.close();
          zeichneAlles();
          // beim ersten Mal: Wetter im Flugsimulator wie LeitWerk oder selbst?
          if (!vorgabe().wetter) wetterDialog();
        } catch (e) {
          fehler(e);
        }
      });
      ul.appendChild(b);
    }
    body.appendChild(ul);
  };
  zeichnen();
  const aus = sim.onChange(() => {
    if (!body.isConnected) return aus();
    if (!body.querySelector(".plt-wahl-liste")) zeichnen();
  });
  const dlg = openDialog({ title: "Hubschrauber wählen", body, wide: true, actions: [{ label: "Später", kind: "plain" }] });
  wahlDlg = dlg;
}

// ------------------------------------------------------------------ Ansicht

let root: HTMLElement | null = null;
let karte: MapHandle | null = null;
let folgen = true;
let punktWaehlen = false;
let letzterEinsatz: string | null = null;
let alarmOffen = false;
let aus: (() => void)[] = [];
const sig = new Map<string, string>();

export function pilotAktiv(): boolean {
  return !!root;
}

/** Piloten-Interface öffnen (nach dem Beitritt) */
export function pilotOeffnen(): void {
  if (root) return;
  pilotModusSetzen(true);
  root = el("div", { class: `plt ${istDunkel() ? "dunkel" : "hell"}` });
  root.innerHTML = `
    <header class="plt-kopf">
      <div class="plt-marke">${logoMarke(30)}<span>Pilot</span></div>
      <div class="plt-heli"></div>
      <div class="plt-status-jetzt"></div>
      <div class="plt-info"></div>
      <div class="plt-knoepfe">
        <button class="plt-b test" data-act="test" title="Testmodus: Einsatz an dich senden"${sim.pilotTest ? "" : " hidden"}>${ico("test")}<span>Testmenü</span></button>
        <button class="plt-b" data-act="pilot-einst" title="Funk, Tasten, Handy, Flugsimulator">${ico("zahnrad")}<span>Einstellungen</span></button>
        <button class="plt-b" data-act="wechseln" title="Anderen Hubschrauber wählen">${ico("tausch")}<span>Wechseln</span></button>
        <button class="plt-b warn" data-act="verlassen" title="Spiel verlassen">${ico("tuer")}<span>Verlassen</span></button>
      </div>
    </header>
    <div class="plt-alarm" hidden></div>
    <div class="plt-warte" hidden></div>
    <main class="plt-haupt">
      <section class="plt-links">
        <div class="plt-karte-titel">Status</div>
        <div class="plt-status"></div>
        <details class="plt-klapp" data-k="sim" open><summary class="plt-karte-titel">${ico("sim")}Flugsimulator</summary><div class="plt-sim"></div></details>
        <details class="plt-klapp" data-k="flug" open><summary class="plt-karte-titel">${ico("flug")}Übungsflug <span class="plt-leise">ohne Flugsimulator</span></summary><div class="plt-flug"></div></details>
      </section>
      <div class="plt-griff" data-g="l" title="Breite ändern"></div>
      <section class="plt-mitte">
        <div class="plt-funk">
          <div class="plt-karte-titel">${ico("funk")}Sprechfunk
            <button class="plt-b klein plt-funk-vl" data-act="funk-verlauf" title="Die letzten Funksprüche">${ico("liste")}<span>Verlauf</span></button>
            <button class="plt-b klein plt-funk-einst" data-act="funk-einst" title="Mikrofon, Spracherkennung, Mithören">${ico("tasten")}<span>Einstellungen</span></button></div>
          <div class="plt-funk-reihe">
            <div class="plt-funk-geraet"></div>
            <div class="plt-funk-knoepfe"></div>
          </div>
          <div class="plt-funk-gruppen"></div>
          <div class="plt-funk-kanal" hidden></div>
        </div>
        <div class="plt-einsatz"></div>
        <div class="plt-patient"></div>
        <div class="plt-plan"></div>
        <div class="plt-ev">
          <div class="plt-karte-titel">${ico("liste")}Einsatzverlauf</div>
          <div class="plt-ev-liste"></div>
        </div>
      </section>
      <div class="plt-griff" data-g="r" title="Breite ändern"></div>
      <section class="plt-rechts">
        <div class="plt-kartebox">
          <div class="plt-karte-titel">${ico("plan")}Karte
            <button class="plt-b klein plt-karte-gross-b" data-act="karte-gross" title="Karte groß öffnen">${ico("gross")}<span>Groß</span></button></div>
          <div class="plt-kartenplatz">
            <div class="plt-kartewrap">
              <div class="plt-map"></div>
              <div class="plt-map-knoepfe">
                <button class="plt-b klein an" data-act="folgen" title="Karte folgt dem Hubschrauber">${ico("folgen")}<span>Folgen</span></button>
              </div>
              <div class="plt-map-hinweis" hidden>Auf die Karte klicken: dorthin fliegen · Esc bricht ab</div>
            </div>
          </div>
        </div>
        <div class="plt-wx" title="Wetter groß öffnen"></div>
        <div class="plt-chat">
          <div class="plt-karte-titel">${ico("chat")}Chat</div>
          <div class="plt-chat-liste"></div>
          <form class="plt-chat-form"><input class="plt-chat-in" maxlength="500" placeholder="Nachricht an alle …"><button class="plt-b klein primaer">Senden</button></form>
        </div>
      </section>
    </main>
    <div class="plt-karte-pop" hidden>
      <div class="plt-karte-pop-box">
        <div class="plt-funk-pop-kopf"><b>${ico("plan")}Karte</b><button class="plt-b klein" data-act="karte-zu" title="Schließen (Esc)">✕</button></div>
        <div class="plt-karte-pop-platz"></div>
      </div>
    </div>
    <div class="plt-funk-pop" hidden>
      <div class="plt-funk-pop-kopf"><b>${ico("funk")}Funkverlauf</b><button class="plt-b klein" data-act="funk-verlauf-zu" title="Schließen">✕</button></div>
      <div class="plt-funk-verlauf"></div>
    </div>`;
  document.body.appendChild(root);
  sig.clear();
  letzterEinsatz = meinFz()?.einsatzId ?? null;

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root!.querySelector(s) as T;
  $('[data-act="pilot-einst"]').addEventListener("click", () => einstellungenDialog());
  $('[data-act="funk-einst"]').addEventListener("click", () => funkDialog());
  // Funkverlauf als Fenster (schreiben kann der Pilot nicht – er spricht)
  const pop = $(".plt-funk-pop");
  $('[data-act="funk-verlauf"]').addEventListener("click", () => {
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      const v = $(".plt-funk-verlauf");
      v.scrollTop = v.scrollHeight;
    }
  });
  $('[data-act="funk-verlauf-zu"]').addEventListener("click", () => (pop.hidden = true));
  // Karte als großes Fenster; Wetter groß
  $('[data-act="karte-gross"]').addEventListener("click", () => karteGross(true));
  $('[data-act="karte-zu"]').addEventListener("click", () => karteGross(false));
  $(".plt-karte-pop").addEventListener("click", (ev) => {
    if (ev.target === ev.currentTarget) karteGross(false);
  });
  $(".plt-wx").addEventListener("click", () => wetterOeffnen());
  spaltenEinrichten($(".plt-haupt"));
  // auf-/zugeklappte Bereiche links merken
  root.querySelectorAll<HTMLDetailsElement>(".plt-klapp").forEach((d) => {
    try {
      if (localStorage.getItem(`leitwerk.pilot.zu.${d.dataset.k}`) === "1") d.open = false;
    } catch {
      /* egal */
    }
    d.addEventListener("toggle", () => {
      try {
        localStorage.setItem(`leitwerk.pilot.zu.${d.dataset.k}`, d.open ? "0" : "1");
      } catch {
        /* egal */
      }
    });
  });
  aus.push(onFunkEmpfang(() => zeichneAlles()));
  aus.push(onFunkSenden(() => zeichneAlles()));
  root.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-pln],[data-kopie]");
    const fz = meinFz();
    if (!b || !fz) return;
    if (b.dataset.kopie) {
      void navigator.clipboard?.writeText(b.dataset.kopie).then(() => toast("Koordinaten kopiert"));
      return;
    }
    const [lat, lon] = (b.dataset.pln ?? "").split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) void flugplanSpeichern(fz, { lat, lon, name: b.dataset.name ?? "Ziel" }).catch(fehler);
  });
  $('[data-act="wechseln"]').addEventListener("click", async () => {
    const fz = meinFz();
    // vor dem Abgeben: sonst nimmt die Ansicht ihn gleich wieder
    bewusstAbgegeben = true;
    if (fz) {
      try {
        await sim.call("pilotAbgeben", fz.id);
      } catch (e) {
        bewusstAbgegeben = false;
        return fehler(e);
      }
    }
    hubschrauberWahl();
  });
  $('[data-act="verlassen"]').addEventListener("click", () => void pilotVerlassen());
  $('[data-act="test"]').addEventListener("click", () => testMenue());
  $('[data-act="folgen"]').addEventListener("click", (ev) => {
    folgen = !folgen;
    (ev.currentTarget as HTMLElement).classList.toggle("an", folgen);
    if (folgen) karteFolgen(true);
  });
  $<HTMLFormElement>(".plt-chat-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const inp = $<HTMLInputElement>(".plt-chat-in");
    const t = inp.value.trim();
    if (!t) return;
    inp.value = "";
    void befehl(sim.call("chat", t));
  });
  const esc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !punktWaehlen && !$(".plt-karte-pop").hidden) karteGross(false);
    if (e.key === "Escape" && punktWaehlen) {
      punktWaehlen = false;
      $(".plt-map-hinweis").hidden = true;
    }
  };
  document.addEventListener("keydown", esc);
  aus.push(() => document.removeEventListener("keydown", esc));

  void karteStarten($(".plt-map"));
  aus.push(sim.onChange(() => zeichneAlles()));
  aus.push(
    mp.onChange(() => {
      // Spiel verlassen (z. B. Fehler beim Beitritt): zurück zur Startseite
      if (mp.status.rolle === "aus" && root && !sim.pilotTest) {
        pilotSchliessen();
        void import("../hauptmenue").then((m) => m.hauptmenueZeigen(undefined, { splash: false }));
        return;
      }
      zeichneAlles();
    }),
  );
  const takt = window.setInterval(() => zeichneAlles(), 1000);
  aus.push(() => window.clearInterval(takt));
  eingabeStarten(pilotAktion, pilotLoslassen);
  // Handy: Status gleich (eigenes Gerät, dort tippt man nur)
  handyAktionen((a) => pilotAktion(a, true), handyHalten);
  handyBuchung((b) => handyBuchen(b));
  // LeitWerk-App im EFB-Tablet (MSFS 2024): Server nur auf diesem Rechner
  void efbStarten();
  flugsimAnbinden(meinFz, () => zeichneAlles());
  if (vorgabe().auto) void flugsimVerbinden();
  void gtnSuchen();
  void hpgStarten({
    status: (s) => pilotStatusDruecken(s),
    plan: (p) => {
      const f = meinFz();
      if (f) void befehl(sim.call("pilotPlan", f.id, p));
    },
    geaendert: () => zeichneAlles(),
  });
  if (location.search.includes("debug"))
    Object.assign(window, {
      __pilot: {
        datenEmpfangen,
        flugsim,
        hpgMissionFuer,
        hpgTestNachricht,
        // Handy im Test: Stand wie für das Handy, Befehle wie vom Handy
        handy: () => {
          const f = meinFz();
          const e = einsatzVon(f);
          return handyStandBauen(f, e, funkTeil(f, e), () => handyMehr(f, e));
        },
        handyBefehl: (b: string) => (b.startsWith("bu:") ? handyBuchen(b) : pilotAktion(b as PilotAktion, true)),
      },
    });
  aus.push(() => eingabeStoppen());
  zeichneAlles();
  // noch kein Hubschrauber: wählen (sobald der Stand vom Host da ist)
  if (!meinFz()) {
    const warte = () => {
      if (!root) return;
      if (Object.keys(sim.state.fahrzeuge).length && (mp.status.hostDa || sim.pilotTest)) {
        if (!letztenWiederNehmen()) hubschrauberWahl();
      }
      else window.setTimeout(warte, 400);
    };
    warte();
  }
}

/** Karte groß (als Fenster über allem) bzw. zurück an ihren Platz rechts */
function karteIstGross(): boolean {
  return !!root && !root.querySelector<HTMLElement>(".plt-karte-pop")!.hidden;
}
function karteGross(gross: boolean): void {
  if (!root) return;
  const pop = root.querySelector<HTMLElement>(".plt-karte-pop")!;
  const wrap = root.querySelector<HTMLElement>(".plt-kartewrap")!;
  const ziel = root.querySelector<HTMLElement>(gross ? ".plt-karte-pop-platz" : ".plt-kartenplatz")!;
  if (wrap.parentElement !== ziel) ziel.appendChild(wrap);
  pop.hidden = !gross;
  if (!gross && punktWaehlen) {
    punktWaehlen = false;
    root.querySelector<HTMLElement>(".plt-map-hinweis")!.hidden = true;
  }
  window.setTimeout(() => {
    karte?.map.resize();
    karteFolgen(true);
  }, 30);
}

/** Spalten links, Mitte, rechts: Breite mit den Griffen dazwischen ändern (wird gemerkt) */
const SPALTEN = "leitwerk.pilot.spalten";
function spaltenEinrichten(haupt: HTMLElement): void {
  let w = { l: 260, r: 520 };
  try {
    w = { ...w, ...(JSON.parse(localStorage.getItem(SPALTEN) ?? "{}") as Partial<typeof w>) };
  } catch {
    /* Standard */
  }
  const setzen = () => {
    haupt.style.setProperty("--pl-l", `${w.l}px`);
    haupt.style.setProperty("--pl-r", `${w.r}px`);
  };
  setzen();
  haupt.querySelectorAll<HTMLElement>(".plt-griff").forEach((g) => {
    g.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      g.setPointerCapture(ev.pointerId);
      g.classList.add("zieht");
      const r = haupt.getBoundingClientRect();
      const bewegen = (e: PointerEvent) => {
        const gesamt = r.width;
        if (g.dataset.g === "l") w.l = Math.round(Math.min(Math.max(e.clientX - r.left, 190), Math.min(460, gesamt - w.r - 420)));
        else w.r = Math.round(Math.min(Math.max(r.right - e.clientX, 300), Math.min(900, gesamt - w.l - 420)));
        setzen();
        karte?.map.resize();
      };
      const los = () => {
        g.classList.remove("zieht");
        g.removeEventListener("pointermove", bewegen);
        g.removeEventListener("pointerup", los);
        g.removeEventListener("pointercancel", los);
        try {
          localStorage.setItem(SPALTEN, JSON.stringify(w));
        } catch {
          /* egal */
        }
      };
      g.addEventListener("pointermove", bewegen);
      g.addEventListener("pointerup", los);
      g.addEventListener("pointercancel", los);
    });
    // Doppelklick: Standardbreite
    g.addEventListener("dblclick", () => {
      w = { l: 260, r: 520 };
      setzen();
      karte?.map.resize();
      try {
        localStorage.removeItem(SPALTEN);
      } catch {
        /* egal */
      }
    });
  });
}

/** Einstellungen des Piloten: Funk, Tasten, Handy, Flugsimulator */
function einstellungenDialog(): void {
  const body = el("div", { class: "plt-einst" });
  const d = openDialog({ title: "Einstellungen", body, actions: [{ label: "Schließen" }] });
  const punkt = (icon: string, titel: string, text: string, f: () => void) => {
    const b = el("button", { class: "plt-einst-b", type: "button" });
    b.innerHTML = `${ico(icon, "gross")}<span><b>${titel}</b><small>${text}</small></span>`;
    b.addEventListener("click", () => {
      d.close();
      f();
    });
    body.appendChild(b);
  };
  punkt("funk", "Sprechfunk", "Mikrofon, Spracherkennung, Lautstärken, Mithören", () => funkDialog());
  punkt("tasten", "Tasten & Joystick", "Statustasten, Sprechtaste, globale Kürzel, Joystick, Cockpit-Funkgerät", () => tastenDialog());
  punkt("handy", "Handy als Statusgerät", "Status und Sprechtaste vom Handy (gleiches WLAN)", () => handyDialog());
  punkt("glocke", "Alarmtöne", "Ton für Alarmierung und Abruf, eigene Töne, Lautstärke", () => alarmDialog());
  punkt("wolke", "Wetter im Flugsimulator", "Wetter wie in LeitWerk oder selbst einstellen", () => wetterDialog());
}

/** Alarmtöne wählen: Alarmierung und Abruf, eigene Töne hochladen, Lautstärke */
function alarmDialog(): void {
  const body = el("div", { class: "plt-alarmdlg" });
  openDialog({ title: "Alarmtöne", body, wide: true, actions: [{ label: "Fertig", kind: "primary", onClick: () => (probeStoppen(), true) }] });
  // Probe läuft nur, solange der Dialog offen ist (egal wie er geschlossen wird)
  const wache = window.setInterval(() => {
    const stopKnopf = body.querySelector<HTMLButtonElement>("[data-act=stopp]");
    if (stopKnopf) stopKnopf.disabled = !probeLaeuft();
    if (!body.isConnected) {
      probeStoppen();
      window.clearInterval(wache);
    }
  }, 250);
  const anhoeren = (q: string) => probeSpielen(q);
  const zeichnen = async () => {
    const eigene = await eigeneAlarmtoene();
    const p = alarmPrefs();
    const optionen = (wahl: string) =>
      `<optgroup label="Aufnahmen">${Object.entries(ALARM_AUFNAHMEN).map(([id, v]) => `<option value="aufnahme:${id}"${wahl === `aufnahme:${id}` ? " selected" : ""}>${esc(v.name)}</option>`).join("")}</optgroup><optgroup label="Melder-Töne (erzeugt)">${Object.entries(ALARM_VORLAGEN).map(([id, v]) => `<option value="vorlage:${id}"${wahl === `vorlage:${id}` ? " selected" : ""}>${esc(v.name)}</option>`).join("")}</optgroup>${
        eigene.length ? `<optgroup label="Eigene Töne">${eigene.map((d) => `<option value="datei:${d.id}"${wahl === `datei:${d.id}` ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</optgroup>` : ""
      }`;
    body.innerHTML = `
      <div class="plt-alarm-zeile"><label>Alarmierung<select data-a="alarm">${optionen(p.alarm)}</select></label><button class="btn" data-p="alarm" type="button">▶ Probe</button></div>
      <div class="plt-alarm-zeile"><label>Abruf aus dem Bereitstellungsraum<select data-a="abruf">${optionen(p.abruf)}</select></label><button class="btn" data-p="abruf" type="button">▶ Probe</button></div>
      <label class="plt-alarm-laut">Lautstärke Alarm <input type="range" min="0" max="150" step="5" value="${p.laut}"><span>${p.laut} %</span></label>
      <div class="plt-alarm-zeile"><span class="plt-leise plt-klein">Die Probe spielt den Ton einmal.</span><button class="btn" data-act="stopp" type="button" disabled>■ Stopp</button></div>
      <p class="plt-leise plt-klein">Der Ton wiederholt sich, bis du quittierst (Status 9 oder 2) – höchstens 1 Minute.</p>
      <b>Eigene Töne</b>
      <div class="plt-alarm-eigene">${
        eigene.length
          ? eigene.map((d) => `<div class="plt-alarm-datei"><b>${esc(d.name)}</b><small>${d.sek.toFixed(1)} s · ${Math.round(d.bytes / 1000)} KB</small><button class="btn small" data-spielen="${d.id}" type="button">▶</button><button class="btn small danger-text" data-weg="${d.id}" type="button">Löschen</button></div>`).join("")
          : `<p class="plt-leise plt-klein">Noch keine eigenen Töne.</p>`
      }</div>
      <div class="plt-alarm-knoepfe"><button class="btn primary" data-act="hoch" type="button">Eigenen Ton hinzufügen …</button>${inTauri() ? `<button class="btn" data-act="ordner" type="button">Ordner öffnen</button>` : ""}<input type="file" accept=".mp3,.wav,.m4a,.aac,audio/*" hidden></div>
      <p class="plt-leise plt-klein">MP3, WAV oder M4A, bis 30 Sekunden und 5 MB. Eine Kopie liegt in „Dokumente/LeitWerk/Töne“.</p>`;
    body.querySelectorAll<HTMLSelectElement>("select[data-a]").forEach((sel) =>
      sel.addEventListener("change", () => {
        alarmPrefsSetzen({ [sel.dataset.a as AlarmArt]: sel.value });
        void anhoeren(sel.value);
      }),
    );
    body.querySelectorAll<HTMLButtonElement>("[data-p]").forEach((b) => b.addEventListener("click", () => void anhoeren(alarmPrefs()[b.dataset.p as AlarmArt])));
    body.querySelector<HTMLButtonElement>("[data-act=stopp]")?.addEventListener("click", () => probeStoppen());
    const r = body.querySelector<HTMLInputElement>('input[type="range"]')!;
    r.addEventListener("input", () => {
      alarmPrefsSetzen({ laut: Number(r.value) });
      r.nextElementSibling!.textContent = `${r.value} %`;
    });
    r.addEventListener("change", () => void anhoeren(alarmPrefs().alarm));
    body.querySelectorAll<HTMLButtonElement>("[data-spielen]").forEach((b) => b.addEventListener("click", () => void anhoeren(`datei:${b.dataset.spielen}`)));
    body.querySelectorAll<HTMLButtonElement>("[data-weg]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.weg!;
        await dateiLoeschen(id);
        const p2 = alarmPrefs();
        for (const a of ["alarm", "abruf"] as AlarmArt[]) if (p2[a] === `datei:${id}`) alarmPrefsSetzen({ [a]: ALARM_STANDARD[a] });
        void zeichnen();
      }),
    );
    const datei = body.querySelector<HTMLInputElement>('input[type="file"]')!;
    body.querySelector('[data-act="hoch"]')!.addEventListener("click", () => datei.click());
    body.querySelector('[data-act="ordner"]')?.addEventListener("click", () => void ablageZeigen("Töne").catch(fehler));
    datei.addEventListener("change", async () => {
      const f = datei.files?.[0];
      datei.value = "";
      if (!f) return;
      try {
        const d = await alarmtonHinzufuegen(f);
        toast(`„${d.name}“ gespeichert (${d.sek.toFixed(1)} s)`);
        void zeichnen();
      } catch (e) {
        fehler(e);
      }
    });
  };
  void zeichnen();
}

/** Testmodus: Einsatz an den eigenen Hubschrauber senden (ohne Leitstelle) */
function testMenue(): void {
  const fz = meinFz();
  const body = el("div", { class: "plt-testmenue" });
  body.innerHTML = `<p class="plt-leise">Testmodus – das Spiel läuft nur bei dir. Der Einsatz kommt wie vom Disponenten: Notfall in deinem Gebiet, Bodenfahrzeuge dazu, dein Hubschrauber wird alarmiert.</p>`;
  const knopf = (titel: string, text: string, art: "normal" | "gross") => {
    const b = el("button", { class: "plt-wahl-k" });
    b.innerHTML = `<b>${titel}</b><small>${text}</small>`;
    b.disabled = !fz || !!fz.einsatzId;
    b.addEventListener("click", async () => {
      if (!fz) return;
      b.disabled = true;
      try {
        const hinweise = await sim.call("pilotTestEinsatz", fz.id, art);
        for (const h of hinweise) toast(h, "error");
        d.close();
      } catch (e) {
        fehler(e);
        b.disabled = false;
      }
    });
    body.appendChild(b);
  };
  knopf("Einsatz senden", "ein Notfall in deinem Gebiet (Notarzt nötig), mit RTW", "normal");
  knopf("Großeinsatz senden", "Großschadensfall mit Bereitstellungsraum – du kommst als Notarztmittel in den BR (vorerst nur TETRA NÖ-03)", "gross");
  if (!fz) body.insertAdjacentHTML("beforeend", `<p class="plt-warn">Zuerst einen Hubschrauber wählen.</p>`);
  else if (fz.einsatzId) body.insertAdjacentHTML("beforeend", `<p class="plt-warn">Du bist noch im Einsatz – zuerst frei melden (Status 1 oder 6).</p>`);
  const d = openDialog({ title: "Testmenü", body, actions: [{ label: "Schließen" }] });
}

/** Spiel verlassen: Hubschrauber an den Computer zurück, Verbindung trennen, zurück zur Startseite */
export async function pilotVerlassen(): Promise<void> {
  const fz = meinFz();
  if (fz) await befehl(sim.call("pilotAbgeben", fz.id));
  pilotSchliessen();
  if (sim.pilotTest) sim.pilotTestBeenden();
  else mp.verlassen();
  const { hauptmenueZeigen } = await import("../hauptmenue");
  hauptmenueZeigen(undefined, { splash: false });
}

export function pilotSchliessen(): void {
  alarmStoppen();
  flugsimBeenden();
  for (const f of aus) f();
  aus = [];
  karte?.map.remove();
  karte = null;
  root?.remove();
  root = null;
  pilotModusSetzen(false);
}

// ------------------------------------------------------------------ Zeichnen

/** Teil nur neu bauen, wenn sich sein Inhalt geändert hat (Klicks und Eingaben gehen sonst verloren) */
function teil(sel: string, key: string, bauen: (box: HTMLElement) => void): void {
  if (!root) return;
  const box = root.querySelector<HTMLElement>(sel);
  if (!box || sig.get(sel) === key) return;
  sig.set(sel, key);
  box.innerHTML = "";
  bauen(box);
}

function zeichneAlles(): void {
  if (!root) return;
  const fz = meinFz();
  if (!fz) letztenWiederNehmen();
  vorlaufPruefen(fz);
  const e = einsatzVon(fz);
  kopf(fz);
  warten(fz);
  alarm(fz, e);
  statusKnoepfe(fz, e);
  simTeil(fz);
  flug(fz, e);
  einsatzKarte(fz, e);
  patient(fz, e);
  plan(fz, e);
  const fk = funkTeil(fz, e);
  einsatzVerlauf(e);
  chat();
  wetterTeil(fz);
  karteAktualisieren(fz, e);
  handyStand(fz, e, fk, () => handyMehr(fz, e));
  gtnZiel(fz, e);
  hpgAktualisieren(fz, e);
}

function kopf(fz: SimFahrzeug | undefined): void {
  const st = fz ? sim.statusDef(fz.status) : null;
  teil(".plt-heli", fz ? `${fz.id}|${fz.funkrufname}` : "-", (b) => {
    b.innerHTML = fz ? `${ico("heli", "gross")}<div><b>${esc(fz.kurzname || fz.funkrufname)}</b><small>${esc(fz.funkrufname)} · ${esc(fz.stationName)}</small></div>` : `<div><b>Kein Hubschrauber</b><small>Bitte wählen („Wechseln“)</small></div>`;
  });
  teil(".plt-status-jetzt", st ? `${st.key}|${st.farbe}` : "-", (b) => {
    if (!st) return;
    b.style.setProperty("--f", st.farbe);
    b.innerHTML = `<span class="plt-gross-num">${esc(st.nummer)}</span><span>${esc(st.name)}</span>`;
  });
  const w = sim.state.wetter;
  const verb = sim.pilotTest ? `<span class="plt-pill warn">Testmodus</span>` : !mp.status.verbunden ? `<span class="plt-pill warn">verbinde …</span>` : !mp.status.hostDa ? `<span class="plt-pill warn">Host nicht da</span>` : `<span class="plt-pill ok">verbunden</span>`;
  const hind = fz ? sim.flugHindernis(fz) : null;
  teil(".plt-info", `${uhrzeit(sim.state.zeit)}|${w.lage}|${verb}|${hind}|${sim.state.tempo}`, (b) => {
    b.innerHTML = `<span title="Spielzeit">${uhrzeit(sim.state.zeit)}${sim.state.tempo !== 1 ? ` <em>×${sim.state.tempo}</em>` : ""}</span><span>${esc(WETTER_LABEL[w.lage as keyof typeof WETTER_LABEL] ?? String(w.lage))}${hind ? ` · <span class="plt-warn">${esc(hind)}</span>` : ""}</span>${verb}`;
  });
}

function warten(fz: SimFahrzeug | undefined): void {
  const box = root!.querySelector<HTMLElement>(".plt-warte")!;
  const text = sim.pilotTest
    ? !fz
      ? "Testmodus – noch kein Hubschrauber gewählt: oben auf „Wechseln“."
      : ""
    : !mp.status.verbunden
    ? "Verbinde mit dem Spiel …"
    : !mp.status.hostDa
      ? mp.status.hostVerlassen
        ? "Der Host hat das Spiel beendet."
        : "Der Host ist gerade nicht verbunden – sobald er zurück ist, geht es weiter."
      : sim.state.lobby
        ? "Warte, bis der Host das Spiel startet. Du kannst deinen Hubschrauber schon wählen."
        : !fz
          ? "Noch kein Hubschrauber gewählt – oben auf „Wechseln“."
          : fz.pilot?.offlineSeit
            ? "Verbindung unterbrochen – nach einer Minute fliegt der Computer weiter."
            : "";
  box.hidden = !text;
  if (box.textContent !== text) box.textContent = text;
}

function alarm(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const box = root!.querySelector<HTMLElement>(".plt-alarm")!;
  if (imVorlauf(fz)) {
    box.hidden = true;
    return;
  }
  const neu = fz?.einsatzId ?? null;
  if (neu && neu !== letzterEinsatz && fz && ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status)) {
    alarmOffen = true;
    // Melder: wiederholt sich, bis quittiert (Status 9 oder 2), höchstens 1 Minute
    alarmStarten("alarm", () => {
      const f = meinFz();
      return !!root && !!f && f.einsatzId === neu && ["alarmWache", "alarmFunk"].includes(f.status);
    });
  }
  letzterEinsatz = neu;
  if (!fz || !e || !["alarmWache", "alarmFunk"].includes(fz.status)) alarmOffen = false;
  box.hidden = !alarmOffen || !e;
  if (box.hidden || !e) return;
  const key = `${e.id}|${e.code}|${e.adresse?.label}`;
  if (box.dataset.k === key) return;
  box.dataset.k = key;
  box.innerHTML = `<div class="plt-alarm-titel">ALARM</div>
    <div class="plt-alarm-text"><b>${e.code ? `<span class="plt-alarm-code">${esc(e.code)}</span>` : ""}${esc(stichwort(e))}</b><span>${esc(e.adresse?.label ?? "Adresse folgt")}</span></div>
    <div class="plt-alarm-hinweis"><kbd>9</kbd> Quittieren · <kbd>2</kbd> beim Abheben</div>`;
}

function statusKnoepfe(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const b = belegung();
  const key = `${fz?.status}|${!!e}|${fz?.pilot?.plan?.art}|${!!e?.kh}|${JSON.stringify(b.taste)}`;
  teil(".plt-status", key, (box) => {
    for (const a of AKTIONEN.filter((x) => x.status)) {
      const st = sim.statusDef(a.status!);
      const aktiv = fz?.status === a.status;
      const btn = el("button", { class: `plt-st${aktiv ? " aktiv" : ""}${statusHalt?.s === a.status ? " haelt" : ""}`, style: `--f:${st.farbe}`, "data-s": a.status!, type: "button", title: "gedrückt halten (ca. 2 Sekunden), bis der Status durchgeht" });
      btn.innerHTML = `<span class="plt-st-num">${esc(st.nummer)}</span><span class="plt-st-name">${esc(st.name)}</span><kbd>${esc(tastenNameKurz(b.taste[a.id]))}</kbd><i class="plt-st-balken"></i>`;
      btn.disabled = !fz;
      btn.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        btn.setPointerCapture?.(ev.pointerId);
        statusHaltenStart(a.status!);
      });
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) btn.addEventListener(t, () => statusHaltenEnde(a.status!));
      btn.addEventListener("contextmenu", (ev) => ev.preventDefault());
      box.appendChild(btn);
    }
    if (fz && ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status)) {
      const st = sim.statusDef(fz.status);
      box.insertAdjacentHTML("afterbegin", `<div class="plt-st-alarm" style="--f:${st.farbe}">${esc(st.nummer)} · ${esc(st.name)}</div>`);
    }
  });
}

function tastenNameKurz(code: string | undefined): string {
  if (!code) return "";
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `N${code.slice(6)}`;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  return code;
}

/** PMS50 GTN750: Flugplan zum aktuellen Ziel bereitlegen (Einsatzort, nach der Zielwahl das Krankenhaus) */
function gtnZiel(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  if (!fz || !e) return;
  const plan = fz.pilot?.plan;
  const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const l = h ? (khLandung(h) ?? h) : null;
  const kh = h && l ? { lat: l.lat, lon: l.lon, name: h.kurzname || h.name } : undefined;
  // Großeinsatz: zuerst der Bereitstellungsraum
  const z = sim.pilotBo(fz);
  const bo = z ? { lat: z.lat, lon: z.lon } : undefined;
  const abruf = fz.phase === "wartetBR" && !!sim.pilotGsHinweis(fz)?.abruf;
  const zumKh = !!kh && (fz.status === "zumZO" || (fz.status === "amBO" && !!plan && (plan.art === "transport" || (plan.art === "uebergabe" && plan.naMit))));
  const zumBo = !!bo && (["alarmWache", "alarmFunk", "alarmiert", "zumBO"].includes(fz.status) || (fz.status === "amBO" && !zumKh) || abruf);
  const ziel = zumKh && kh ? { ...kh, art: "kh" as const } : zumBo && bo ? { ...bo, name: z?.label ?? "Einsatzort", art: "bo" as const } : null;
  gtnBereitlegen(fz, ziel, { bo, kh });
}

/** Koordinaten und Flugplan für Einsatzort und Zielkrankenhaus */
function navigation(fz: SimFahrzeug, kh: Hospital | undefined): string {
  const zeile = (titel: string, lat: number, lon: number, name: string, zusatz = "") => `<div class="plt-nav">
      <div class="plt-nav-text"><b>${esc(titel)}</b><span>${esc(koordText(lat, lon))}</span>${zusatz}</div>
      <div class="plt-nav-knoepfe"><button class="plt-b klein" data-kopie="${lat.toFixed(6)}, ${lon.toFixed(6)}" title="Koordinaten kopieren">Kopieren</button><button class="plt-b klein" data-pln="${lat},${lon}" data-name="${esc(name)}" title="Flugplan für MSFS speichern">${ico("plan")}.pln</button></div>
    </div>`;
  let html = "";
  // Großeinsatz: Bereitstellungsraum (bis zum Abruf) statt Einsatzort
  const z = sim.pilotBo(fz);
  if (z && ["alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO"].includes(fz.status)) html += zeile(z.label, z.lat, z.lon, z.label);
  if (kh) {
    const l = khLandung(kh);
    if (l) html += zeile(`Landeplatz ${kh.kurzname || kh.name}`, l.lat, l.lon, kh.kurzname || kh.name, kh.landeplatz && kh.landeplatz !== "kein" ? "" : `<small class="plt-leise">am Haus (kein eigener Landeplatz hinterlegt)</small>`);
    else html += `<div class="plt-nav"><div class="plt-nav-text"><b>${esc(kh.kurzname || kh.name)}</b><span class="plt-warn">kein Hubschrauberlandeplatz</span></div></div>`;
  }
  return html ? `<div class="plt-navi">${html}</div>` : "";
}

const SIM_TEXT: Record<string, string> = { aus: "nicht verbunden", keineDll: "SimConnect fehlt", wartet: "wartet", verbunden: "verbunden", getrennt: "getrennt", fehler: "Fehler" };

function simTeil(fz: SimFahrzeug | undefined): void {
  const d = flugsim.daten;
  const frisch = datenFrisch();
  const p = fz?.pilot;
  const bremse = sim.zeitBremse();
  const daheim = !!fz && distanceM(fz, fz.heim) < 300;
  const key = `${flugsim.zustand}|${flugsim.text}|${frisch}|${d && frisch ? [Math.round(d.hoehe / 50), Math.round(d.agl / 20), Math.round(d.kurs / 5), Math.round(d.kts), d.am_boden].join(",") : ""}|${p?.zeitOk}|${sim.state.tempo}|${bremse}|${daheim}|${!!fz}|${gtn.paket}|${gtn.fehler}|${gtn.geprueft}|${gtnAn()}|${gtn.ziel}|${hpg.zustand}|${hpg.text}|${hpg.paket}|${hpg.mission}|${letzterCarls}|${JSON.stringify(flugsim.carls)}|${carlsAn()}`;
  teil(".plt-sim", key, (box) => {
    const z = flugsim.zustand;
    const klasse = z === "verbunden" ? (frisch ? "ok" : "warn") : z === "wartet" ? "warn" : z === "aus" ? "" : "fehl";
    box.insertAdjacentHTML("beforeend", `<div class="plt-sim-kopf"><span class="plt-pill ${klasse}">MSFS ${esc(SIM_TEXT[z] ?? z)}</span></div>`);
    if (flugsim.text && !(z === "verbunden" && frisch)) box.insertAdjacentHTML("beforeend", `<p class="plt-klein ${klasse === "fehl" ? "plt-warn" : "plt-leise"}">${esc(flugsim.text)}</p>`);
    if (z === "verbunden" && !frisch) box.insertAdjacentHTML("beforeend", `<p class="plt-klein plt-warn">Keine Flugdaten – bist du im Flug (nicht im Menü)?</p>`);
    if (d && frisch) {
      box.insertAdjacentHTML(
        "beforeend",
        `<div class="plt-sim-werte">
          <div><small>Höhe</small><b>${Math.round(d.hoehe).toLocaleString("de-AT")} ft</b></div>
          <div><small>über Grund</small><b>${d.am_boden ? "am Boden" : `${Math.round(d.agl).toLocaleString("de-AT")} ft`}</b></div>
          <div><small>Kurs</small><b>${String(Math.round(((d.kurs % 360) + 360) % 360)).padStart(3, "0")}°</b></div>
          <div><small>Geschw.</small><b>${Math.round(d.kts)} kt</b></div>
        </div>`,
      );
    }
    if (z === "aus" || z === "fehler" || z === "keineDll" || z === "getrennt") {
      const b = el("button", { class: "plt-b voll primaer" });
      b.innerHTML = `${ico("sim")}<span>Mit MSFS verbinden</span>`;
      b.addEventListener("click", () => void flugsimVerbinden());
      box.appendChild(b);
    }
    if (z === "keineDll" || z === "fehler") {
      const b = el("button", { class: "plt-b voll" });
      b.innerHTML = `<span>SimConnect.dll wählen …</span>`;
      b.addEventListener("click", () => void dllWaehlen());
      box.appendChild(b);
      box.insertAdjacentHTML("beforeend", `<p class="plt-leise plt-klein">Die Datei kommt mit dem kostenlosen MSFS-SDK: im Simulator den Entwicklermodus einschalten, oben im Menü „Help → SDK Installer“. Danach liegt sie unter <code>C:\MSFS 2024 SDK\SimConnect SDK\lib\SimConnect.dll</code> – LeitWerk findet sie dort von selbst.</p>`);
    }
    if (z === "verbunden" || z === "wartet") {
      const b = el("button", { class: "plt-b voll" }, "Trennen");
      b.addEventListener("click", () => void flugsimTrennen());
      box.appendChild(b);
    }
    // HPG H145: Tablet (Missions-App) und Funkgerät
    if (hpg.geprueft && (hpg.paket || hpg.zustand === "verbunden")) {
      const g = el("div", { class: "plt-gtn" });
      const klasse = hpg.zustand === "verbunden" ? "ok" : hpg.zustand === "fehler" ? "fehl" : "warn";
      g.innerHTML = `<div class="plt-sim-kopf"><span class="plt-pill ${klasse}">H145-Tablet ${hpg.zustand === "verbunden" ? "verbunden" : hpg.zustand === "fehler" ? "Fehler" : "wartet"}</span></div>
        <p class="plt-leise plt-klein">${esc(hpg.zustand === "verbunden" ? "Alarm, Route und Patient kommen aufs Tablet (Missions-App)." : hpg.mission ? "Im Tablet: Missions → Library → „LeitWerk Leitstelle“ wählen (nach dem Einrichten einmal REFRESH)." : hpg.text || "Einmal einrichten, dann im Tablet die Mission wählen.")}</p>`;
      if (!hpg.mission) {
        const b = el("button", { class: "plt-b klein" }, "H145 einrichten");
        b.addEventListener("click", () => void hpgEinrichten());
        g.appendChild(b);
      } else if (hpg.zustand !== "verbunden") {
        const b = el("button", { class: "plt-b klein" }, "Missions-Index neu bauen");
        b.title = "Falls „LeitWerk Leitstelle“ im Tablet fehlt";
        b.addEventListener("click", () => void hpgEinrichten());
        g.appendChild(b);
      }
      box.appendChild(g);
    }
    // HPG H145: CARLS-Funkgerät (Status-Tasten) – läuft über die Mission „LeitWerk Leitstelle“ im Tablet
    if (hpg.paket || hpg.zustand === "verbunden") {
      const g = el("div", { class: "plt-gtn" });
      const an = carlsAn();
      const ok = hpg.zustand === "verbunden";
      g.innerHTML = `<div class="plt-sim-kopf"><span class="plt-pill ${!an ? "" : ok ? "ok" : "warn"}">H145-Funkgerät ${!an ? "aus" : ok ? "verbunden" : "wartet"}</span></div>
        <label class="plt-check-klein"><input type="checkbox" ${an ? "checked" : ""}> CARLS-Funkgerät: Status-Tasten</label>
        <p class="plt-leise plt-klein">${!an ? "Die Status-Tasten am Funkgerät sind aus." : ok ? `Die Tasten 1–6 und 9 am Funkgerät setzen den Status; im Display stehen Status und Einsatz (mit ▲▼ blättern)${letzterCarls ? ` · zuletzt: ${letzterCarls}` : ""}.` : "Im Tablet der H145: Missions → LeitWerk Leitstelle starten – dann zeigt das Funkgerät Status und Einsatz."}</p>`;
      g.querySelector("input")!.addEventListener("change", (ev) => carlsUmschalten((ev.target as HTMLInputElement).checked));
      box.appendChild(g);
    }
    // PMS50 GTN750: Flugplan wird automatisch bereitgelegt
    if (gtn.geprueft) {
      const g = el("div", { class: "plt-gtn" });
      if (gtn.paket) {
        g.innerHTML = `<label class="plt-check-klein"><input type="checkbox" ${gtnAn() ? "checked" : ""}> GTN750: Flugplan automatisch bereitlegen</label>
          <p class="plt-leise plt-klein">${gtn.fehler ? `<span class="plt-warn">${esc(gtn.fehler)}</span>` : gtn.ziel ? `Bereit – im GTN: Flight Plan → Menu → Import. Wegpunkte LWBO, LWKH, LWBAS unter Waypoint Info → Import Waypoints.` : "Bei Alarm und nach der Zielwahl liegt der Flugplan im GTN bereit."}</p>`;
        g.querySelector("input")!.addEventListener("change", (ev) => gtnUmschalten((ev.target as HTMLInputElement).checked));
      } else {
        g.innerHTML = `<p class="plt-leise plt-klein">PMS50 GTN750 nicht gefunden${gtn.community ? "" : " (Community-Ordner unbekannt)"}.</p>`;
        const b = el("button", { class: "plt-b klein" }, "Community-Ordner wählen …");
        b.addEventListener("click", () => void communityWaehlen());
        g.appendChild(b);
      }
      box.appendChild(g);
    }
    // Zeitraffer: mit Flugsimulator nur am Boden, und weg vom Stützpunkt nur mit Zustimmung
    if (fz && p && frisch) {
      const zeile = el("div", { class: "plt-zeit" });
      if (d && !d.am_boden) zeile.innerHTML = `${ico("zeit")}<span>Zeitraffer aus, solange du fliegst</span>`;
      else if (daheim) zeile.innerHTML = `${ico("zeit")}<span>Am Stützpunkt: Zeitraffer erlaubt</span>`;
      else {
        const b = el("button", { class: `plt-b voll${p.zeitOk ? " an" : ""}` });
        b.innerHTML = `${ico("zeit")}<span>${p.zeitOk ? "Zeitraffer erlaubt – sperren" : "Zeitraffer erlauben"}</span>`;
        b.addEventListener("click", () => void befehl(sim.call("pilotZeit", fz.id, !p.zeitOk)));
        zeile.appendChild(b);
      }
      box.appendChild(zeile);
      if (sim.state.tempo > 1) box.insertAdjacentHTML("beforeend", `<p class="plt-leise plt-klein">Leitstelle: Zeitraffer ×${sim.state.tempo}${bremse ? ` – gebremst auf 1× (${esc(bremse)})` : ""}</p>`);
    }
  });
}

function flug(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const f = fz?.fahrt;
  const rest = f ? Math.max(0, f.start / 1000 + f.dauer - sim.state.zeit / 1000) : 0;
  const ausSim = datenFrisch();
  const zielBo = fz ? sim.pilotBo(fz) : null;
  const key = `${fz?.id}|${!!e?.adresse}|${!!e?.kh}|${fz?.pilot?.flugZiel}|${f ? Math.ceil(rest / 30) : -1}|${ausSim}|${zielBo?.label}|${zielBo?.lat}`;
  teil(".plt-flug", key, (box) => {
    if (!fz) return;
    if (ausSim) {
      box.innerHTML = `<p class="plt-leise plt-klein">Die Position kommt aus dem Flugsimulator – der Übungsflug ist aus.</p>`;
      return;
    }
    const knopf = (icon: string, text: string, ziel: "bo" | "zo" | "heim" | null, an = true) => {
      const b = el("button", { class: "plt-b voll" });
      b.innerHTML = `${ico(icon)}<span>${text}</span>`;
      b.disabled = !an;
      b.addEventListener("click", () => void befehl(sim.call("pilotFliegen", fz.id, ziel)));
      box.appendChild(b);
      return b;
    };
    if (f) {
      box.insertAdjacentHTML("beforeend", `<div class="plt-flug-jetzt">${ico("flug")}<div><b>${esc(fz.pilot?.flugZiel ?? "Flug")}</b><small>noch ${minuten(rest)}</small></div></div>`);
      knopf("stopp", "Anhalten", null);
    }
    const z = sim.pilotBo(fz);
    knopf("ziel", z?.br ? "Zum Bereitstellungsraum" : "Zum Einsatzort", "bo", !!z);
    knopf("kh", "Zum Zielkrankenhaus", "zo", !!e?.kh);
    knopf("haus", "Zum Stützpunkt", "heim");
    const p = el("button", { class: "plt-b voll" });
    p.innerHTML = `${ico("punkt")}<span>Punkt auf der Karte …</span>`;
    p.addEventListener("click", () => {
      punktWaehlen = true;
      root!.querySelector<HTMLElement>(".plt-map-hinweis")!.hidden = false;
      karteGross(true);
    });
    box.appendChild(p);
    box.insertAdjacentHTML("beforeend", `<p class="plt-leise plt-klein">Gerade Linie mit Reisegeschwindigkeit (${sim.settings.nahGeschwindigkeit} km/h).</p>`);
  });
}

let letzterGsHinweis: string | null = null;

function einsatzKarte(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const mitFz = e ? e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && x.einsatzId === e.id) : [];
  // Großeinsatz: was der Pilot gerade tun soll (BR, Abruf, Patient zugeteilt)
  const gsH = fz && e ? sim.pilotGsHinweis(fz) : null;
  if (gsH?.abruf && gsH.text !== letzterGsHinweis && fz) {
    // Abruf aus dem Bereitstellungsraum: eigener Ton, bis abgehoben (Status 2) – höchstens 1 Minute
    alarmStarten("abruf", () => {
      const f = meinFz();
      return !!root && !!f && f.phase === "wartetBR" && !!sim.pilotGsHinweis(f)?.abruf && f.status !== "zumBO";
    });
  }
  letzterGsHinweis = gsH?.text ?? null;
  const key = e ? `${e.id}|${e.code}|${e.adresse?.label}|${e.infoRtw}|${e.zusatz}|${e.kh?.hospitalId}|${mitFz.map((x) => x.id + x.status).join(",")}|${Math.round(fz ? distanceM(fz, e.adresse ?? fz) / 500 : 0)}|${fz ? Math.round(sim.pilotAnkunft(fz)?.min ?? -1) : ""}|${gsH?.text ?? ""}` : "-";
  teil(".plt-einsatz", key, (box) => {
    box.insertAdjacentHTML("beforeend", `<div class="plt-karte-titel">${ico("ziel")}Einsatz</div>`);
    if (!fz || !e) {
      box.insertAdjacentHTML("beforeend", `<div class="plt-leer">Kein Einsatz. Warte auf die Alarmierung durch die Leitstelle.</div>`);
      return;
    }
    const c = findCode(e.code ?? undefined);
    const km = e.adresse ? distanceM(fz, e.adresse) / 1000 : null;
    const ank = sim.pilotAnkunft(fz);
    const kh = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
    box.insertAdjacentHTML(
      "beforeend",
      `<div class="plt-einsatz-kopf"><span class="plt-nr">${esc(e.nummer)}</span>${e.code ? `<span class="plt-code">${esc(e.code)}</span>` : `<span class="plt-leise plt-klein">Code folgt</span>`}${c ? `<span class="plt-stufe" style="--stufe:${stufeFarbe(c.stufe)}">${esc(c.stufe)}</span>` : ""}</div>
      <div class="plt-stichwort">${esc(stichwort(e))}</div>
      ${gsH ? `<div class="plt-gs${gsH.abruf ? " abruf" : ""}">${esc(gsH.text)}</div>` : ""}
      <div class="plt-zeile">${ico("punkt")}<span>${esc(e.adresse?.label ?? "Adresse folgt")}${e.zusatz ? `<small>${esc(e.zusatz)}</small>` : ""}</span></div>
      ${km !== null ? `<div class="plt-zeile">${ico("flug")}<span>${km.toFixed(1).replace(".", ",")} km · ca. ${minuten((km * 1000) / (sim.settings.nahGeschwindigkeit / 3.6))} Flug${ank ? `<small>Ankunft ${esc(ank.ziel)} in ca. ${minuten(ank.min * 60)}</small>` : ""}</span></div>` : ""}
      ${e.infoRtw && !e.gsKind ? `<div class="plt-info-rtw">${esc(e.infoRtw)}</div>` : ""}
      ${kh ? `<div class="plt-zeile">${ico("kh")}<span>Ziel: <b>${esc(kh.kurzname || kh.name)}</b>${khLandung(kh) ? "" : ` <span class="plt-warn">kein Landeplatz</span>`}</span></div>` : ""}
      ${navigation(fz, kh)}
      <div class="plt-mit">${mitFz.map((x) => { const st = sim.statusDef(x.status); return `<span class="plt-mit-fz" title="${esc(st.name)}"><i style="background:${st.farbe}"></i>${esc(x.funkrufname)}${x === fz ? " (du)" : ""}</span>`; }).join("")}</div>`,
    );
  });
}

const BW: Record<string, string> = { ja: "wach", getruebt: "eingetrübt", nein: "bewusstlos" };
const AT: Record<string, string> = { normal: "normal", abnorm: "auffällig", agonal: "Schnappatmung", keine: "keine Atmung" };
const SICHT: Record<string, string> = { rot: "rot", gelb: "gelb", gruen: "grün" };

function patient(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const da = !!fz && !!e && ["amBO", "zumZO", "amZO"].includes(fz.status);
  const l = e?.wahr.lage;
  const key = da && e ? `${e.id}|${JSON.stringify(l?.patienten)}|${l?.fall?.kern}|${e.wahr.verdacht}|${l?.verlauf.length}` : `-${!!e}`;
  teil(".plt-patient", key, (box) => {
    if (!e) return;
    box.insertAdjacentHTML("beforeend", `<div class="plt-karte-titel">${ico("patient")}Patient</div>`);
    if (!da) {
      box.insertAdjacentHTML("beforeend", `<div class="plt-leer">Was der Patient hat, siehst du am Berufungsort (Status 3).${e.meldung?.text ? `<br><span class="plt-leise">Meldung: ${esc(e.meldung.text)}</span>` : ""}</div>`);
      return;
    }
    // Großeinsatz: ohne zugeteilten Patienten keine Patientendaten (die Einsatzleitung teilt zu)
    if (e.gs && !e.gs.aufgehoben) {
      box.insertAdjacentHTML("beforeend", `<div class="plt-leer">Großeinsatz – die Einsatzleitung teilt dir einen Patienten zu.</div>`);
      return;
    }
    const pat = l?.patienten ?? [];
    const verdacht = e.wahr.verdacht ? buchungName(e.wahr.verdacht) : "";
    let html = "";
    // Großeinsatz-Patient: Verletzungsmuster, wie es die Einsatzleitung gemeldet hat
    if (e.gsKind) html += `<div class="plt-lagebild">${esc(e.meldung.text)}</div>`;
    if (l?.fall?.kern) html += `<div class="plt-lagebild">${esc(l.fall.kern)}</div>`;
    if (verdacht) html += `<div class="plt-verdacht">Verdacht: <b>${esc(verdacht)}</b></div>`;
    for (const p of pat) {
      html += `<div class="plt-pat"><span class="plt-sicht ${p.sichtung}">${SICHT[p.sichtung]}</span>
        <b>${p.alter < 14 ? "Kind" : p.geschlecht === "w" ? "Frau" : "Mann"}, ${p.alter} J.</b>
        <span>Bewusstsein: ${BW[p.bw] ?? p.bw}</span><span>Atmung: ${AT[p.at] ?? p.at}</span></div>`;
    }
    if (!pat.length) html += `<div class="plt-leer">${esc(findCode(e.code ?? undefined)?.beschreibung ?? "Keine weiteren Angaben")}</div>`;
    if (l?.bit) html += `<div class="plt-warn">Patient sehr schwer (ca. 150 kg+) – Transport braucht BIT</div>`;
    const verlauf = (l?.verlauf ?? []).slice(-3);
    if (verlauf.length) html += `<div class="plt-verlauf">${verlauf.map((v) => `<div><span>${uhrzeit(v.zeit)}</span>${esc(v.text)}</div>`).join("")}</div>`;
    box.insertAdjacentHTML("beforeend", html);
  });
}

function planText(p: PilotPlan | null | undefined): string {
  if (!p) return "";
  const kh = (id?: string) => {
    const h = id ? store.get("hospitals", id) : undefined;
    return h ? ` ins ${h.kurzname || h.name}` : "";
  };
  const grund = (g?: string) => (g ? ` (${buchungName(g)})` : "");
  if (p.art === "transport") return `NAH transportiert${kh(p.hospitalId)}${grund(p.grund)}`;
  if (p.art === "uebergabe") return p.naMit ? `NA fährt im RTW mit${kh(p.hospitalId)}, NAH fliegt leer nach${grund(p.grund)}` : `RTW fährt allein${kh(p.hospitalId)}${grund(p.grund)}`;
  return p.grund === "revers" ? "Kein Transport – Revers" : p.grund === "tot" ? "Patient verstorben" : "Kein Transport";
}

/** Auswahl am Berufungsort: wer transportiert (danach die Buchung wie in der Leitstelle) */
type PlanSeite = "nah" | "rtw" | "naMit" | "kein";
let planSeite: PlanSeite = "nah";
let khSuche = "";
/** Buchung wie in der Leitstelle: Stichwort → Alter → Dringlichkeit → Vorschläge */
const zw: { fuer: string; sym?: Symptom; alter: Altersgruppe; dring: Dringlichkeit; q: string; mehr: boolean } = { fuer: "", alter: "erwachsener", dring: 20, q: "", mehr: false };
const SEITEN: { id: PlanSeite; titel: string; text: string }[] = [
  { id: "nah", titel: "NAH transportiert", text: "Patient fliegt mit uns" },
  { id: "rtw", titel: "RTW fährt allein", text: "Übergabe an den RTW, Notarzt bleibt beim NAH" },
  { id: "naMit", titel: "NA im RTW, NAH leer", text: "Notarzt fährt im RTW mit, wir fliegen leer ins selbe Spital" },
  { id: "kein", titel: "Kein Transport", text: "bleibt vor Ort, Revers oder verstorben" },
];
const FARBE_DRING: Record<"rot" | "gelb" | "gruen", Dringlichkeit> = { rot: 30, gelb: 20, gruen: 10 };

/** Buchungs-Auswahl für diesen Einsatz vorbelegen (Verdacht, Alter, Sichtung) */
function zwVorbelegen(e: Einsatz, pl: PilotPlan | null): void {
  if (zw.fuer === e.id) return;
  planSeite = !pl ? "nah" : pl.art === "transport" ? "nah" : pl.art === "uebergabe" ? (pl.naMit ? "naMit" : "rtw") : "kein";
  khSuche = "";
  const p0 = e.wahr.lage?.patienten[0];
  zw.fuer = e.id;
  zw.q = "";
  zw.mehr = false;
  zw.alter = altersgruppeVon(p0?.alter ?? e.wahr.patientAlter);
  zw.dring = FARBE_DRING[p0?.sichtung ?? "gelb"] ?? 20;
  zw.sym = undefined;
  const v = e.kh?.grund ?? e.verdacht ?? e.wahr.verdacht ?? "";
  const z = zuweisungLesen(v);
  if (z) {
    zw.sym = z.s;
    zw.alter = z.a;
    zw.dring = z.d;
  } else if (v.startsWith("bu_")) {
    zw.sym = symptom(symptomAusDiagnose(v));
    if (zw.sym) zw.dring = dringlichkeitFuer(zw.sym, zw.dring);
  }
}

function plan(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  // Großeinsatz ohne zugeteilten Patienten: noch nichts zu entscheiden
  const da = !!fz && !!e && fz.status === "amBO" && !(e.gs && !e.gs.aufgehoben);
  const p = fz?.pilot?.plan ?? null;
  const rtw = !!e && e.fahrzeuge.some((id) => { const x = sim.state.fahrzeuge[id]; return !!x && x.einsatzId === e.id && sim.transportfaehig(x); });
  if (da && e) zwVorbelegen(e, p);
  const belegt = Object.values(sim.state.khBelegung ?? {}).reduce((n, kh) => n + Object.values(kh).reduce((m, l) => m + (l?.length ?? 0), 0), 0);
  const key = da && e ? `${e.id}|${JSON.stringify(p)}|${planSeite}|${rtw}|${khSuche}|${zw.sym?.id}|${zw.alter}|${zw.dring}|${zw.q}|${zw.mehr}|${Math.round(sim.state.zeit / 60000)}|${belegt}` : p && e ? `fest|${JSON.stringify(p)}|${fz?.status}` : "-";
  teil(".plt-plan", key, (box) => {
    if (!fz || !e) return;
    if (!da) {
      if (p) box.innerHTML = `<div class="plt-karte-titel">Entscheidung</div><div class="plt-plan-fest">${esc(planText(p))}</div>`;
      return;
    }
    box.insertAdjacentHTML("beforeend", `<div class="plt-karte-titel">Was passiert mit dem Patienten?</div>`);
    if (p) box.insertAdjacentHTML("beforeend", `<div class="plt-plan-fest">${esc(planText(p))}<small>Ändern geht, solange ihr am Berufungsort seid. Dann Status 4 (Transport) oder 6 (frei).</small></div>`);
    // ① wer transportiert
    const wahl = el("div", { class: "plt-wahl4" });
    for (const s of SEITEN) {
      const b = el("button", { class: `plt-wahl-k${planSeite === s.id ? " an" : ""}` });
      b.innerHTML = `<b>${s.titel}</b><small>${s.text}</small>`;
      b.addEventListener("click", () => {
        planSeite = s.id;
        plan(fz, e);
      });
      wahl.appendChild(b);
    }
    box.appendChild(wahl);
    const setzen = (pl: PilotPlan) => void befehl(sim.call("pilotPlan", fz.id, pl));
    if (planSeite === "kein") {
      for (const [grund, t, u] of [["kein", "Patient bleibt vor Ort", "kein Transport nötig"], ["revers", "Transportverweigerung", "Revers unterschrieben"], ["tot", "Patient verstorben", "Tod durch den Notarzt festgestellt"]] as const) {
        const b = el("button", { class: `plt-wahl-k${p?.art === "kein" && p.grund === grund ? " an" : ""}` });
        b.innerHTML = `<b>${t}</b><small>${u}</small>`;
        b.addEventListener("click", () => setzen({ art: "kein", grund }));
        box.appendChild(b);
      }
      return;
    }
    if (planSeite !== "nah" && !rtw) {
      box.insertAdjacentHTML("beforeend", `<div class="plt-leer">Noch kein RTW im Einsatz – bitte bei der Leitstelle anfordern (Chat).</div>`);
      return;
    }
    // ② Buchung wie in der Leitstelle
    const bu = el("div", { class: "plt-buchung" });
    bu.insertAdjacentHTML("beforeend", `<div class="plt-schritt"><span>1</span>Stichwort</div>`);
    if (zw.sym) {
      const chip = el("div", { class: "plt-sym-chip" });
      chip.innerHTML = `<b>${esc(zw.sym.name)}</b><small>${esc(zw.sym.kategorie)}</small>`;
      const weg = el("button", { class: "plt-x", title: "anderes Stichwort" }, "✕");
      weg.addEventListener("click", () => {
        zw.sym = undefined;
        plan(fz, e);
        root?.querySelector<HTMLInputElement>(".plt-sym-suche")?.focus();
      });
      chip.appendChild(weg);
      bu.appendChild(chip);
    } else {
      const such = el("input", { class: "plt-sym-suche", placeholder: "Stichwort suchen (z. B. Polytrauma, Schlaganfall) …", value: zw.q }) as HTMLInputElement;
      such.addEventListener("input", () => {
        zw.q = such.value;
        const pos = such.selectionStart;
        plan(fz, e);
        const neu = root?.querySelector<HTMLInputElement>(".plt-sym-suche");
        neu?.focus();
        if (neu && pos !== null) neu.setSelectionRange(pos, pos);
      });
      bu.appendChild(such);
      const treffer = zw.q.trim() ? symptomSuche(zw.q.trim(), 8) : [];
      if (treffer.length) {
        const liste = el("div", { class: "plt-sym-liste" });
        for (const x of treffer) {
          const b = el("button", { class: "plt-sym" });
          b.innerHTML = `<b>${esc(x.name)}</b><small>${esc(x.kategorie)}</small>`;
          b.addEventListener("click", () => {
            zw.sym = x;
            zw.q = "";
            zw.dring = dringlichkeitFuer(x, zw.dring);
            plan(fz, e);
          });
          liste.appendChild(b);
        }
        bu.appendChild(liste);
      } else if (zw.q.trim()) bu.insertAdjacentHTML("beforeend", `<div class="plt-leise plt-klein">Kein Stichwort gefunden.</div>`);
    }
    bu.insertAdjacentHTML("beforeend", `<div class="plt-schritt"><span>2</span>Alter</div>`);
    const alt = el("div", { class: "plt-seg" });
    for (const a of ALTERSGRUPPEN) {
      const b = el("button", { class: zw.alter === a.id ? "an" : "", title: `${a.text} Jahre` }, a.name);
      b.addEventListener("click", () => {
        zw.alter = a.id;
        plan(fz, e);
      });
      alt.appendChild(b);
    }
    bu.appendChild(alt);
    bu.insertAdjacentHTML("beforeend", `<div class="plt-schritt"><span>3</span>Dringlichkeit</div>`);
    const dr = el("div", { class: "plt-seg" });
    for (const d of DRINGLICHKEITEN) {
      const b = el("button", { class: `d${d.id}${zw.dring === d.id ? " an" : ""}` }, d.name) as HTMLButtonElement;
      b.disabled = !!zw.sym && !zw.sym.dringlichkeiten.includes(d.id);
      b.addEventListener("click", () => {
        zw.dring = d.id;
        plan(fz, e);
      });
      dr.appendChild(b);
    }
    bu.appendChild(dr);
    bu.insertAdjacentHTML("beforeend", `<div class="plt-schritt"><span>4</span>Vorschläge</div>`);
    const grund = zw.sym ? zuweisungId(zw.sym.id, zw.dring, zw.alter) : "";
    const buchen = (hId: string) =>
      setzen(planSeite === "nah" ? { art: "transport", hospitalId: hId, grund: grund || undefined } : { art: "uebergabe", naMit: planSeite === "naMit", hospitalId: hId, grund: grund || undefined });
    const gewaehlt = p && p.art !== "kein" ? p.hospitalId : undefined;
    const liste = el("div", { class: "plt-kh-liste" });
    if (!grund) liste.insertAdjacentHTML("beforeend", `<div class="plt-leise plt-klein">Stichwort wählen – dann zeigt die Liste die passenden Häuser, die jetzt aufnehmen.</div>`);
    for (const k of khListe(fz, e, grund)) {
      const b = el("button", { class: `plt-kh${gewaehlt === k.h.id ? " an" : ""}` });
      const flugMin = (k.km * 1000) / (sim.settings.nahGeschwindigkeit / 3.6);
      b.innerHTML = `<span class="plt-kh-name"><b>${esc(k.h.kurzname || k.h.name)}</b><small>${esc(k.h.name)}</small></span>
          <span class="plt-kh-tags">${k.eignung ? `<span class="plt-tag ${k.eignung}">${k.eignung === "passend" ? "passend" : k.eignung === "ausweich" ? "Ausweich" : "Rückfall"}</span>` : ""}${k.zu ? `<span class="plt-tag warn">zu</span>` : ""}${k.voll ? `<span class="plt-tag warn">voll</span>` : k.frei ? `<span class="plt-tag">${esc(k.frei)}</span>` : ""}${planSeite === "nah" ? (khLandung(k.h) ? `<span class="plt-tag">Landeplatz</span>` : `<span class="plt-tag warn">kein Landeplatz</span>`) : ""}</span>
          <span class="plt-kh-km">${k.km.toFixed(0)} km<small>${planSeite === "nah" ? minuten(flugMin) : "Buchen"}</small></span>`;
      b.addEventListener("click", () => buchen(k.h.id));
      liste.appendChild(b);
    }
    bu.appendChild(liste);
    // anderes Haus: Namenssuche über alle
    const mehr = el("button", { class: "plt-link" }, zw.mehr ? "▾ anderes Krankenhaus" : "▸ anderes Krankenhaus suchen");
    mehr.addEventListener("click", () => {
      zw.mehr = !zw.mehr;
      plan(fz, e);
    });
    bu.appendChild(mehr);
    if (zw.mehr) {
      const such = el("input", { class: "plt-kh-suche", placeholder: "Krankenhaus suchen …", value: khSuche }) as HTMLInputElement;
      such.addEventListener("input", () => {
        khSuche = such.value;
        const pos = such.selectionStart;
        plan(fz, e);
        const neu = root?.querySelector<HTMLInputElement>(".plt-kh-suche");
        neu?.focus();
        if (neu && pos !== null) neu.setSelectionRange(pos, pos);
      });
      bu.appendChild(such);
      const q = khSuche.trim().toLowerCase();
      if (q) {
        const andere = el("div", { class: "plt-kh-liste" });
        for (const h of store.list("hospitals").filter((h) => `${h.name} ${h.kurzname ?? ""} ${h.ort ?? ""}`.toLowerCase().includes(q)).map((h) => ({ h, km: distanceM(fz, h) / 1000 })).sort((a, b) => a.km - b.km).slice(0, 12)) {
          const b = el("button", { class: `plt-kh${gewaehlt === h.h.id ? " an" : ""}` });
          b.innerHTML = `<span class="plt-kh-name"><b>${esc(h.h.kurzname || h.h.name)}</b><small>${esc(h.h.name)}</small></span><span class="plt-kh-tags"></span><span class="plt-kh-km">${h.km.toFixed(0)} km</span>`;
          b.addEventListener("click", () => buchen(h.h.id));
          andere.appendChild(b);
        }
        bu.appendChild(andere);
      }
    }
    bu.insertAdjacentHTML("beforeend", `<p class="plt-leise plt-klein">Die Buchung belegt einen Platz im Krankenhaus – wie in der Leitstelle.</p>`);
    box.appendChild(bu);
  });
}

// ------------------------------------------------------------------ Handy: Einsatz und Buchen

/** Was das Handy zusätzlich braucht: Display, Einsatz (Code, Abfrage) und Buchen (gleicher Stand wie am PC) */
function handyMehr(fz: SimFahrzeug | undefined, e: Einsatz | undefined): Record<string, unknown> {
  const c = e ? findCode(e.code ?? undefined) : undefined;
  const km = fz && e?.adresse ? distanceM(fz, e.adresse) / 1000 : null;
  const ank = fz ? sim.pilotAnkunft(fz) : null;
  const kh = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const mitFz = e ? e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && x.einsatzId === e.id) : [];
  // letzte Notrufabfrage aus dem Protokoll
  const block = e ? [...e.protokoll].reverse().find((x) => /^\*\*\* /.test(x.text)) : undefined;
  const abfrage = block ? block.text.split("\n").slice(1).filter(Boolean) : [];
  const z = fz ? sim.pilotBo(fz) : null;
  const einsatz2 = e && fz
    ? {
        nummer: e.nummer,
        code: e.code ?? "",
        stufe: c?.stufe ?? "",
        stufeFarbe: c ? stufeFarbe(c.stufe) : "",
        stichwort: stichwort(e),
        adresse: e.adresse?.label ?? "Adresse folgt",
        zusatz: e.zusatz ?? "",
        km: km !== null ? `${km.toFixed(1).replace(".", ",")} km · ca. ${minuten((km * 1000) / (sim.settings.nahGeschwindigkeit / 3.6))} Flug` : "",
        ankunft: ank ? `Ankunft ${ank.ziel} in ca. ${minuten(ank.min * 60)}` : "",
        info: (sim.pilotGsHinweis(fz)?.text ?? "") || (e.gsKind ? "" : (e.infoRtw ?? "")),
        ziel: kh ? kh.kurzname || kh.name : "",
        koord: z ? `${z.lat.toFixed(5)}, ${z.lon.toFixed(5)}` : "",
        mit: mitFz.map((x) => ({ name: x.funkrufname, farbe: sim.statusDef(x.status).farbe, du: x === fz })),
        abfrage,
        plan: planText(fz.pilot?.plan),
      }
    : null;
  return {
    gruppe: gruppenName(sprechGruppe()),
    einsatz2,
    buchung: fz && e ? handyBuchungStand(fz, e) : null,
  };
}

function handyBuchungStand(fz: SimFahrzeug, e: Einsatz): Record<string, unknown> {
  const da = fz.status === "amBO" && !(e.gs && !e.gs.aufgehoben);
  const p = fz.pilot?.plan ?? null;
  if (!da) return { da: false, plan: planText(p), text: e.gs && !e.gs.aufgehoben && fz.status === "amBO" ? "Großeinsatz – die Einsatzleitung teilt dir einen Patienten zu." : "Buchen geht am Berufungsort (Status 3)." };
  zwVorbelegen(e, p);
  const rtw = e.fahrzeuge.some((id) => { const x = sim.state.fahrzeuge[id]; return !!x && x.einsatzId === e.id && sim.transportfaehig(x); });
  const grund = zw.sym ? zuweisungId(zw.sym.id, zw.dring, zw.alter) : "";
  const gewaehlt = p && p.art !== "kein" ? p.hospitalId : undefined;
  return {
    da: true,
    plan: planText(p),
    seite: planSeite,
    seiten: SEITEN,
    rtw,
    kein: p?.art === "kein" ? p.grund ?? "kein" : "",
    sym: zw.sym ? { id: zw.sym.id, name: zw.sym.name, kat: zw.sym.kategorie } : null,
    q: zw.q,
    treffer: !zw.sym && zw.q.trim() ? symptomSuche(zw.q.trim(), 8).map((x) => ({ id: x.id, name: x.name, kat: x.kategorie })) : [],
    alter: zw.alter,
    alterListe: ALTERSGRUPPEN.map((a) => ({ id: a.id, name: a.name })),
    dring: zw.dring,
    dringListe: DRINGLICHKEITEN.map((d) => ({ id: d.id, name: d.name, aus: !!zw.sym && !zw.sym.dringlichkeiten.includes(d.id) })),
    kh: grund
      ? khListe(fz, e, grund).map((k) => ({
          id: k.h.id,
          name: k.h.kurzname || k.h.name,
          lang: k.h.name,
          km: `${k.km.toFixed(0)} km`,
          zeit: planSeite === "nah" ? minuten((k.km * 1000) / (sim.settings.nahGeschwindigkeit / 3.6)) : "",
          tags: [
            k.eignung ? (k.eignung === "passend" ? "passend" : k.eignung === "ausweich" ? "Ausweich" : "Rückfall") : "",
            k.voll ? "voll" : k.frei,
            planSeite === "nah" ? (khLandung(k.h) ? "Landeplatz" : "kein Landeplatz") : "",
          ].filter(Boolean),
          an: gewaehlt === k.h.id,
        }))
      : [],
  };
}

/** Befehl vom Handy: „bu:seite:nah“, „bu:q:Text“, „bu:sym:id“, „bu:symweg“, „bu:alter:kind“, „bu:dring:30“, „bu:kh:id“, „bu:kein:revers“ */
function handyBuchen(b: string): void {
  const fz = meinFz();
  const e = einsatzVon(fz);
  if (!fz || !e || fz.status !== "amBO") return;
  zwVorbelegen(e, fz.pilot?.plan ?? null);
  const [, art, ...rest] = b.split(":");
  const wert = rest.join(":");
  const setzen = (pl: PilotPlan) => void befehl(sim.call("pilotPlan", fz.id, pl));
  if (art === "seite" && SEITEN.some((x) => x.id === wert)) planSeite = wert as PlanSeite;
  else if (art === "q") zw.q = wert.slice(0, 60);
  else if (art === "sym") {
    const x = symptom(wert);
    if (x) {
      zw.sym = x;
      zw.q = "";
      zw.dring = dringlichkeitFuer(x, zw.dring);
    }
  } else if (art === "symweg") zw.sym = undefined;
  else if (art === "alter" && ALTERSGRUPPEN.some((a) => a.id === wert)) zw.alter = wert as Altersgruppe;
  else if (art === "dring" && DRINGLICHKEITEN.some((d) => String(d.id) === wert)) zw.dring = Number(wert) as Dringlichkeit;
  else if (art === "kein" && ["kein", "revers", "tot"].includes(wert)) setzen({ art: "kein", grund: wert as "kein" | "revers" | "tot" });
  else if (art === "kh" && store.get("hospitals", wert)) {
    const grund = zw.sym ? zuweisungId(zw.sym.id, zw.dring, zw.alter) : "";
    setzen(planSeite === "nah" ? { art: "transport", hospitalId: wert, grund: grund || undefined } : { art: "uebergabe", naMit: planSeite === "naMit", hospitalId: wert, grund: grund || undefined });
  }
  zeichneAlles();
}

/** Krankenhäuser für die Buchung: die nächsten passenden, die jetzt aufnehmen (wie in der Leitstelle) */
function khListe(fz: SimFahrzeug, e: Einsatz, grund: string): { h: Hospital; eignung: string | null; km: number; zu: boolean; voll: boolean; frei: string }[] {
  if (!grund) return [];
  const kind = zw.alter !== "erwachsener";
  const rot = zw.dring === 30;
  const pos = planSeite === "nah" ? fz : (e.adresse ?? fz);
  const v = sim.khFuer(pos, grund, rot, kind, false, sim.cacVorrang(e));
  return v
    .filter((x) => !x.zu)
    .slice(0, 5)
    .map((x) => ({ h: x.h, eignung: x.eignung as string | null, km: x.km, zu: x.zu, voll: x.voll, frei: x.gesamt ? `${x.frei}/${x.gesamt} frei` : "" }));
}

// ------------------------------------------------------------------ Sprechfunk

/** Kanal (wer spricht), Sprechtasten (gedrückt halten) und die letzten Funksprüche; gibt den Stand fürs Handy zurück */
let pilotGeraet: { el: HTMLElement; refresh(): void } | null = null;

function funkTeil(fz: SimFahrzeug | undefined, e: Einsatz | undefined): { knoepfe: { aktion: string; name: string }[]; kanal: string; sendet: boolean } {
  const ich = funkSendeZustand();
  const hoert = funkEmpfang();
  const sendet = sim.state.funkSendet;
  // Großeinsatz: der Pilot ist auf der Sprechgruppe des Großeinsatzes (bzw. der gewählten)
  const gruppe = sprechGruppe();
  const belegt = sim.funkKanalBelegt(gruppe);
  const kanal = ich?.art === "sendet"
    ? `Du sprichst${ich.ziel === "rtw" ? " (an den RTW)" : ""} …`
    : ich?.art === "wartet"
      ? ich.belegt
        ? "Warten … nach dem Ende-Ton bist du dran"
        : "Kanal wird geprüft …"
      : hoert
        ? `${hoert.von === "LEO" ? `Leitstelle (${hoert.wer})` : `${hoert.von} (${hoert.wer})`} spricht`
        : sendet
          ? `${sendet.von === "LEO" ? `Leitstelle (${sendet.name})` : `${sendet.von} (${sendet.name})`} spricht`
          : belegt
            ? `Funk belegt – ${belegt.funkname} ↔ ${belegt.an?.funkname ?? "LEO"}`
            : gruppe
              ? "Funk frei (Sprechgruppe Großeinsatz)"
              : "Funk frei";
  const klasse = ich?.art === "sendet" ? "sendet" : hoert || sendet ? "hoert" : belegt ? "belegt" : "frei";
  teil(".plt-funk-kanal", `${kanal}|${klasse}`, (b) => {
    b.className = `plt-funk-kanal ${klasse}`;
    b.innerHTML = `<span class="plt-funk-lampe"></span><span>${esc(kanal)}</span>`;
  });
  // das Funkgerät (wie im RTW): Display mit Gruppe und Status, Fenster „wer spricht“
  const geraetBox = root?.querySelector<HTMLElement>(".plt-funk-geraet");
  if (geraetBox && !geraetBox.firstChild) {
    pilotGeraet = funkGeraetErstellen();
    geraetBox.appendChild(pilotGeraet.el);
  }
  pilotGeraet?.refresh();
  // Sprechgruppen: primär die, zu der er alarmiert ist; „Alles hören“
  const w = funkGruppenWahl();
  const gsDa = gsGruppeOffen() || sim.kanalVon(e) === "gs";
  teil(".plt-funk-gruppen", JSON.stringify([w.allesHoeren, w.pilotSenden, gsDa, sim.kanalVon(e)]), (b) => {
    const eig = gruppenName(sim.kanalVon(e));
    b.innerHTML = `<label class="plt-schalter"><input type="checkbox" class="plt-f-alles" ${w.allesHoeren ? "checked" : ""}><span class="plt-schalter-bahn"><i></i></span><span>Alles hören <small class="plt-leise">(sonst nur ${esc(eig)})</small></span></label>${
      gsDa ? `<small class="plt-leise">Sprechgruppe wechseln: Steuerkreuz links/rechts am Funkgerät</small>` : ""
    }`;
    b.querySelector<HTMLInputElement>(".plt-f-alles")!.addEventListener("change", (ev) => funkGruppenSetzen({ allesHoeren: (ev.target as HTMLInputElement).checked }));
    const sel = b.querySelector<HTMLSelectElement>(".plt-f-senden");
    if (sel) {
      sel.value = w.pilotSenden;
      sel.addEventListener("change", () => funkGruppenSetzen({ pilotSenden: sel.value as "auto" | "normal" | "gs" }));
    }
  });
  const rtw = fz && e ? sim.nahRtwPartner(fz, e) : undefined;
  const bel = belegung();
  const hinweis = (a: PilotAktion) => [bel.taste[a] ? tastenName(bel.taste[a]) : "", bel.globalAn && bel.global[a] ? kuerzelName(bel.global[a]) : "", bel.joy[a] ? "Joystick" : ""].filter(Boolean).join(" · ");
  // EIN Funk, EIN Knopf: wen er meint, steht im Spruch („LEO von C2“, „75/001 von C2“)
  void rtw;
  const knoepfe = fz ? [{ aktion: "funk", name: "Funk" }] : [];
  teil(".plt-funk-knoepfe", `${knoepfe.map((k) => k.name).join("|")}|${hinweis("funk")}|${hinweis("funkRtw")}|${mp.aktiv}`, (b) => {
    if (!fz) {
      b.innerHTML = `<p class="plt-leise plt-klein">Erst einen Hubschrauber wählen.</p>`;
      return;
    }
    for (const k of knoepfe) {
      const a = k.aktion as PilotAktion;
      // Sprechtaste wie am echten Gerät
      // Sprechtaste als Handmikrofon; der Hinweis erscheint nur beim Darüberfahren (ohne zu drücken)
      const btn = el("button", { class: "plt-ptt plt-mikro", "data-ptt": a, type: "button", "aria-label": "Sprechtaste (gedrückt halten)" });
      btn.innerHTML = `<img src="${mikroUrl}" alt="" draggable="false">`;
      sprechKnopfAnbinden(btn, () => "leo");
      const info = el("div", { class: "plt-ptt-tipp" }, `Gedrückt halten zum Sprechen${hinweis(a) ? ` · ${hinweis(a)}` : ""} – „LEO von …“ für die Leitstelle, „75/001 von …“ für ein Fahrzeug`);
      b.append(btn, info);
    }
  });
  root?.querySelectorAll<HTMLElement>(".plt-ptt").forEach((x) => {
    x.classList.toggle("an", ich?.art === "sendet");
    x.classList.toggle("wartet", ich?.art === "wartet");
  });
  // die letzten Funksprüche (alle hören mit)
  const alle = (sim.state.funkGespraeche ?? []).filter((g) => gruppeHoerbar(g.kanal) || (!!fz && (g.fzId === fz.id || g.an?.fzId === fz.id))).slice(0, 20);
  const zeilen = alle
    .flatMap((g) => g.sprueche.map((x, i) => ({ ...x, g, t: x.echt ?? (g.echtSeit ?? 0) + i })))
    .sort((a, b) => a.t - b.t)
    .slice(-10);
  const mein = fz ? sim.rufname(fz) : "";
  teil(".plt-funk-verlauf", zeilen.map((z) => `${z.g.id}|${z.zeit}|${z.text}`).join(";"), (b) => {
    if (!zeilen.length) {
      b.innerHTML = `<p class="plt-leise plt-klein">Noch kein Funkverkehr. Sprechtaste halten und z. B. „LEO von ${esc(mein || "C2")}, kommen“.</p>`;
      return;
    }
    for (const z of zeilen) {
      const meins = !!fz && (z.g.fzId === fz.id || z.g.an?.fzId === fz.id);
      b.insertAdjacentHTML("beforeend", `<div class="plt-funk-z${meins ? " meins" : ""}${z.von === mein ? " ich" : ""}"><span>${esc(uhrzeit(z.zeit))} ${z.stimme ? "🎙 " : ""}<b>${esc(z.von)}</b></span>${esc(z.text)}</div>`);
    }
    b.scrollTop = b.scrollHeight;
  });
  return { knoepfe, kanal, sendet: ich?.art === "sendet" };
}

/** Funk-Einstellungen: Mikrofon, Spracherkennung, Lautstärken, Mithören */
function funkDialog(): void {
  const p = sprachPrefs();
  const body = el("div", { class: "plt-funkdlg" });
  body.innerHTML = `
    <label>Mikrofon<select class="plt-f-mikro"><option value="">Standard-Mikrofon</option></select></label>
    <div class="plt-f-modell"></div>
    <label class="plt-check"><input type="checkbox" class="plt-f-klang" ${p.klangfilter ? "checked" : ""}> Funk-Klang (blechern, kurzes Rauschen beim Loslassen)</label>
    <label>Lautstärke Sprechfunk (Stimmen der Mitspieler)<input type="range" min="0" max="100" step="5" class="plt-f-laut" value="${p.funkLaut}"></label>
    <label class="plt-check"><input type="checkbox" class="plt-f-vorlesen" ${p.funkVorlesen ? "checked" : ""}> Funk der Fahrzeuge vorlesen (Stimmen des Computers)</label>
    <label class="plt-check"><input type="checkbox" class="plt-f-mit" ${p.mithoeren ? "checked" : ""}> Übrigen Funkverkehr mithören (Fahrzeuge ↔ Leitstelle)</label>
    <label>Lautstärke mitgehörter Funk<input type="range" min="10" max="100" step="5" class="plt-f-mitlaut" value="${p.mithoerenLaut}"></label>
    <label class="plt-check"><input type="checkbox" class="plt-f-echtd" ${funkGruppenWahl().echteDispos ? "checked" : ""}> Echte Disponenten hören (aus: nur der Text im Verlauf)</label>
    <label class="plt-check"><input type="checkbox" class="plt-f-echtp" ${funkGruppenWahl().echtePiloten ? "checked" : ""}> Echte Piloten hören (aus: nur der Text im Verlauf)</label>
    <p class="plt-leise plt-klein">Was dich betrifft (Leitstelle an dich, Antworten des RTW), kommt immer in voller Lautstärke. Den Status drückst du weiter selbst – der Funk ändert ihn nicht.</p>`;
  const mikro = body.querySelector<HTMLSelectElement>(".plt-f-mikro")!;
  void mikrofone().then((ms) => {
    for (const m of ms) if (m.deviceId && m.deviceId !== "default") mikro.appendChild(el("option", { value: m.deviceId }, m.label || "Mikrofon"));
    mikro.value = sprachPrefs().mikro;
  });
  mikro.addEventListener("change", () => setzeSprache({ mikro: mikro.value }));
  const echtD = body.querySelector<HTMLInputElement>(".plt-f-echtd")!;
  const echtP = body.querySelector<HTMLInputElement>(".plt-f-echtp")!;
  echtD.addEventListener("change", () => funkGruppenSetzen({ echteDispos: echtD.checked }));
  echtP.addEventListener("change", () => funkGruppenSetzen({ echtePiloten: echtP.checked }));
  const modell = body.querySelector<HTMLElement>(".plt-f-modell")!;
  const modellZeigen = async () => {
    if (!inTauri()) {
      modell.innerHTML = `<p class="plt-leise plt-klein">Spracherkennung (Text im Funkfenster) gibt es nur im Programm.</p>`;
      return;
    }
    const st = await sprachStatus().catch(() => ({ modelle: [] as string[] }));
    const da = st.modelle.find((m) => MODELLE.some((x) => x.name === m));
    if (da) {
      if (!st.modelle.includes(sprachPrefs().modell)) setzeSprache({ modell: da });
      modell.innerHTML = `<p class="plt-klein"><span class="plt-pill ok">Spracherkennung bereit</span> – was du sagst, steht als Text im Funk der Leitstelle. Mit dem RTW funken geht nur damit.</p>`;
      return;
    }
    const m = MODELLE.find((x) => x.name === sprachPrefs().modell) ?? MODELLE[MODELLE.length - 1];
    modell.innerHTML = `<p class="plt-klein"><span class="plt-pill warn">Spracherkennung fehlt</span> Ohne sie hört die Leitstelle dich trotzdem – nur der Text im Funkfenster fehlt, und mit dem RTW funken geht nicht.</p>`;
    const b = el("button", { class: "plt-b klein primaer" }, `Sprachmodell laden (${m.mb} MB)`);
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await modellLaden(m.name, (d, t) => (b.textContent = t ? `Lädt … ${Math.round((d / t) * 100)} %` : `Lädt … ${Math.round(d / 1e6)} MB`));
        setzeSprache({ modell: m.name });
        toast("Spracherkennung ist bereit");
      } catch (err) {
        fehler(err);
      }
      void modellZeigen();
    });
    modell.appendChild(b);
  };
  void modellZeigen();
  const an = (sel: string, f: (x: HTMLInputElement) => void) => body.querySelector<HTMLInputElement>(sel)!.addEventListener("change", (ev) => f(ev.target as HTMLInputElement));
  an(".plt-f-klang", (x) => setzeSprache({ klangfilter: x.checked }));
  an(".plt-f-laut", (x) => setzeSprache({ funkLaut: Number(x.value) }));
  an(".plt-f-vorlesen", (x) => setzeSprache({ funkVorlesen: x.checked }));
  an(".plt-f-mit", (x) => setzeSprache({ mithoeren: x.checked }));
  an(".plt-f-mitlaut", (x) => setzeSprache({ mithoerenLaut: Number(x.value) }));
  openDialog({ title: "Sprechfunk", body, actions: [{ label: "Fertig", kind: "primary" }] });
}

/** Einsatzverlauf: was beim Einsatz passiert ist (neueste oben) */
function einsatzVerlauf(e: Einsatz | undefined): void {
  const p = e?.protokoll ?? [];
  const offen = new Set([...(root?.querySelectorAll<HTMLDetailsElement>(".plt-ev-abfrage[open]") ?? [])].map((d) => d.dataset.i));
  teil(".plt-ev-liste", e ? `${e.id}|${p.length}` : "-", (b) => {
    if (!e || !p.length) {
      b.innerHTML = `<div class="plt-ev-leer">${ico("liste", "riesig")}<b>Noch keine Ereignisse</b><span>Sobald ein Einsatz vorliegt, stehen hier alle Ereignisse dazu.</span></div>`;
      return;
    }
    const ab = p.length > 60 ? p.length - 60 : 0;
    b.innerHTML = p
      .slice(ab)
      .map((x, i) => {
        // Notrufabfrage des Hosts: „*** Erstaufnahme: … ***“ + Zeilen → zum Aufklappen
        const m = /^\*\*\* (.+?): [^*]*\*\*\*\n?([\s\S]*)$/.exec(x.text);
        if (m) {
          const zeilen = m[2].split("\n").filter(Boolean);
          const n = ab + i;
          return `<div class="plt-ev-z"><span>${esc(uhrzeit(x.zeit))}</span><details class="plt-ev-abfrage" data-i="${n}"${offen.has(String(n)) ? " open" : ""}><summary><b>Notrufabfrage</b> <small class="plt-leise">${esc(m[1])} · ${zeilen.length} Angaben</small></summary>${zeilen.map((z) => `<div>${esc(z)}</div>`).join("")}</details></div>`;
        }
        return `<div class="plt-ev-z"><span>${esc(uhrzeit(x.zeit))}</span><div>${esc(x.text)}${x.von ? ` <small class="plt-leise">· ${esc(x.von)}</small>` : ""}</div></div>`;
      })
      .reverse()
      .join("");
  });
}

/** Wetter für den Piloten: jetzt (Wind und Böen in Knoten, Sicht, QNH, Flugbetrieb), die nächsten Stunden und Hinweise */
function wetterTeil(fz: SimFahrzeug | undefined): void {
  const p = sim.wetterPrognose(6);
  const j = p[0];
  const kt = (kmh: number) => Math.round(kmh / 1.852);
  const sicht = (km: number) => (km >= 10 ? "> 10 km" : km >= 1 ? `${Math.round(km)} km` : `${Math.round(km * 1000)} m`);
  const flug = (x: (typeof p)[number]) => (flugverbot(x.lage, x.wind) ? "nein" : flugEingeschraenkt(x.lage, x.wind) ? "eingeschränkt" : "ja");
  const hinweise = [fz ? sim.flugHindernis(fz) : null, fz && !fz.nachtflug ? "Nur Tagflug" : null].filter((x): x is string => !!x);
  // Wetterwechsel in den nächsten Stunden, der das Fliegen ändert
  const wechsel = p.slice(1).find((x) => flug(x) !== flug(j));
  if (wechsel) hinweise.push(flug(wechsel) === "nein" ? `ab ca. ${uhrzeit(wechsel.zeit)} kein Flugwetter (${LAGE[wechsel.lage].label})` : flug(wechsel) === "ja" ? `ab ca. ${uhrzeit(wechsel.zeit)} wieder Flugwetter` : `ab ca. ${uhrzeit(wechsel.zeit)} eingeschränkt (${LAGE[wechsel.lage].label})`);
  const key = JSON.stringify([p.map((x) => [x.lage, Math.round(x.temp), x.wind, x.boeen, x.richtung, x.sicht, x.druck, x.regen, x.nacht, uhrzeit(x.zeit)]), hinweise]);
  teil(".plt-wx", key, (b) => {
    const f = flug(j);
    b.innerHTML = `<div class="plt-karte-titel">${ico("wolke")}Wetter &amp; Hinweise <span class="plt-leise">Klick: Prognose und Warnungen</span></div>
      <div class="plt-wx-oben">
        <div class="plt-wx-jetzt"><span class="plt-wx-sym">${symbolFuer(j.lage, j.nacht)}</span><div><b>${esc(LAGE[j.lage].label)}</b><span class="plt-wx-temp">${Math.round(j.temp)} °C</span><small class="plt-leise">gefühlt ${j.gefuehlt} °C</small></div></div>
        <div class="plt-wx-werte">
          <div><small>Wind</small><b><span class="plt-wind-pfeil" style="transform:rotate(${(j.richtung + 180) % 360}deg)">${ico("wind")}</span>${kt(j.wind)} kt</b><small>aus ${esc(richtungText(j.richtung))}</small></div>
          <div><small>Böen</small><b>${kt(j.boeen)} kt</b></div>
          <div><small>Sicht</small><b>${sicht(j.sicht)}</b></div>
          <div><small>Regen</small><b>${j.regen} %</b></div>
          <div><small>QNH</small><b>${j.druck} hPa</b></div>
          <div><small>Flugbetrieb</small><b class="plt-wx-flug ${f === "ja" ? "ok" : f === "nein" ? "rot" : "gelb"}">${f === "ja" ? "möglich" : f === "nein" ? "kein Flug" : "eingeschränkt"}</b></div>
        </div>
      </div>
      <div class="plt-wx-std">${p
        .slice(1)
        .map((x) => `<div class="${flug(x) === "nein" ? "rot" : flug(x) === "eingeschränkt" ? "gelb" : ""}"><small>${uhrzeit(x.zeit)}</small><span>${symbolFuer(x.lage, x.nacht)}</span><b>${Math.round(x.temp)}°</b><small>${kt(x.wind)} kt</small></div>`)
        .join("")}</div>
      <div class="plt-wx-hinweise">${hinweise.length ? hinweise.map((h) => `<div class="plt-warn">⚠ ${esc(h)}</div>`).join("") : `<div class="plt-wx-ok">${ico("haken")}Keine Hinweise</div>`}</div>`;
  });
}

function chat(): void {
  const c = sim.state.chat ?? [];
  const key = `${c.length}|${c[c.length - 1]?.zeit}`;
  teil(".plt-chat-liste", key, (box) => {
    for (const m of c.slice(-30)) box.insertAdjacentHTML("beforeend", `<div class="plt-chat-m${m.von === mp.ich.name ? " ich" : ""}"><span>${esc(m.von)}</span>${esc(m.text)}</div>`);
    box.scrollTop = box.scrollHeight;
  });
}

// ------------------------------------------------------------------ Karte

async function karteStarten(box: HTMLElement): Promise<void> {
  try {
    const liste = await availableMaps();
    if (!root) return;
    karte = createMap(box, liste, { dunkel: istDunkel() });
    const map = karte.map;
    map.on("load", () => {
      map.addSource("plt-linie", { type: "geojson", data: leer() });
      map.addSource("plt-route", { type: "geojson", data: leer() });
      map.addSource("plt-ziele", { type: "geojson", data: leer() });
      map.addSource("plt-heli", { type: "geojson", data: leer() });
      // Route: weitere Abschnitte (z. B. Einsatzort → Krankenhaus) gestrichelt, der jetzige Abschnitt durchgezogen
      map.addLayer({ id: "plt-route", type: "line", source: "plt-route", layout: { "line-cap": "round" }, paint: { "line-color": "#8aa4c8", "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.85 } });
      map.addLayer({ id: "plt-linie", type: "line", source: "plt-linie", layout: { "line-cap": "round" }, paint: { "line-color": "#2f7cf6", "line-width": 4, "line-opacity": 0.95 } });
      map.addLayer({
        id: "plt-ziele",
        type: "circle",
        source: "plt-ziele",
        paint: { "circle-radius": 9, "circle-color": ["get", "farbe"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "plt-ziele-text",
        type: "symbol",
        source: "plt-ziele",
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top" },
        paint: { "text-color": "#111827", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
      });
      map.addLayer({
        id: "plt-heli",
        type: "circle",
        source: "plt-heli",
        paint: { "circle-radius": 11, "circle-color": ["get", "farbe"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });
      map.addLayer({
        id: "plt-heli-text",
        type: "symbol",
        source: "plt-heli",
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 13, "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": true },
        paint: { "text-color": "#0b2a5b", "text-halo-color": "#ffffff", "text-halo-width": 1.8 },
      });
      karteFolgen(true);
      zeichneAlles();
    });
    map.on("click", (ev) => {
      if (!punktWaehlen) {
        if (!karteIstGross()) karteGross(true);
        return;
      }
      punktWaehlen = false;
      root?.querySelector<HTMLElement>(".plt-map-hinweis")?.setAttribute("hidden", "");
      const fz = meinFz();
      if (fz) void befehl(sim.call("pilotFliegen", fz.id, { lat: ev.lngLat.lat, lon: ev.lngLat.lng, label: "Punkt auf der Karte" }));
    });
    map.on("dragstart", () => {
      if (!folgen) return;
      folgen = false;
      root?.querySelector('[data-act="folgen"]')?.classList.remove("an");
    });
  } catch (e) {
    console.warn("Pilotenkarte", e);
  }
}

function leer(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function punkt(lat: number, lon: number, props: Record<string, unknown>): GeoJSON.Feature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props };
}

let letzteZiele = "";
function karteAktualisieren(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const map = karte?.map;
  if (!map || !map.getSource("plt-heli")) return;
  const quelle = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  const st = fz ? sim.statusDef(fz.status) : null;
  quelle("plt-heli")?.setData({ type: "FeatureCollection", features: fz ? [punkt(fz.lat, fz.lon, { name: fz.kurzname || fz.funkrufname, farbe: st?.farbe ?? "#2f7cf6" })] : [] });
  const kh = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const ziele: GeoJSON.Feature[] = [];
  if (e?.adresse) ziele.push(punkt(e.adresse.lat, e.adresse.lon, { name: "Einsatzort", farbe: "#e53935" }));
  // Großeinsatz: Bereitstellungsraum
  const gsE = e?.gsKind ? sim.einsatz(e.gsKind.parent) : e;
  if (gsE?.gs?.br && !gsE.gs.aufgehoben && gsE.gs.phase !== "ende") ziele.push(punkt(gsE.gs.br.lat, gsE.gs.br.lon, { name: "Bereitstellungsraum", farbe: "#6b7280" }));
  if (kh) ziele.push(punkt(kh.lat, kh.lon, { name: kh.kurzname || kh.name, farbe: "#1e88e5" }));
  if (fz) ziele.push(punkt(fz.heim.lat, fz.heim.lon, { name: "Stützpunkt", farbe: "#2e9d4a" }));
  const zk = JSON.stringify(ziele.map((z) => z.geometry));
  if (zk !== letzteZiele) {
    letzteZiele = zk;
    quelle("plt-ziele")?.setData({ type: "FeatureCollection", features: ziele });
  }
  const r = fz ? route(fz, e) : [];
  const linie = (pts: [number, number][]): GeoJSON.FeatureCollection =>
    pts.length >= 2 ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: {} }] } : leer();
  quelle("plt-linie")?.setData(fz && r.length ? linie([[fz.lon, fz.lat], r[0]]) : leer());
  quelle("plt-route")?.setData(linie(r));
  routePunkte = fz ? [[fz.lon, fz.lat], ...r] : [];
  karteFolgen(false);
  if (location.search.includes("debug")) {
    (window as unknown as { __pilotKarte: unknown }).__pilotKarte = () => {
      const b = map.getBounds();
      return { linie: r.length + (r.length ? 1 : 0), drin: routePunkte.every(([x, y]) => b.contains([x, y])) };
    };
  }
}

/** Route des Hubschraubers: nächstes Ziel, danach (gestrichelt) die weiteren – [lon, lat] */
function route(fz: SimFahrzeug, e: Einsatz | undefined): [number, number][] {
  const out: [number, number][] = [];
  const f = fz.fahrt;
  const ende = f?.coords[f.coords.length - 1] as [number, number] | undefined;
  if (ende) out.push([ende[0], ende[1]]);
  if (!e) return out;
  const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const l = h ? (khLandung(h) ?? h) : null;
  const kh: [number, number] | null = l ? [l.lon, l.lat] : null;
  const z = sim.pilotBo(fz);
  const vorBo = ["alarmWache", "alarmFunk", "alarmiert", "zumBO"].includes(fz.status) || (fz.phase === "wartetBR" && !!sim.pilotGsHinweis(fz)?.abruf);
  const nah = (a: [number, number] | undefined, b: [number, number]) => !!a && Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
  if (vorBo && z) {
    const bo: [number, number] = [z.lon, z.lat];
    if (!nah(out[out.length - 1], bo)) out.push(bo);
    if (kh) out.push(kh);
  } else if (kh && ["amBO", "zumZO"].includes(fz.status) && !nah(out[out.length - 1], kh)) out.push(kh);
  return out;
}

/** alle Punkte der Route (für den Ausschnitt der Karte) */
let routePunkte: [number, number][] = [];
let letzterAusschnitt = "";

function karteFolgen(sofort: boolean): void {
  const fz = meinFz();
  const map = karte?.map;
  if (!fz || !map || !folgen) return;
  // mit Ziel: so weit hinaus, dass Hubschrauber und Route ganz zu sehen sind
  if (routePunkte.length >= 2) {
    const lons = routePunkte.map((x) => x[0]);
    const lats = routePunkte.map((x) => x[1]);
    const bb: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    const key = bb.flat().map((x) => x.toFixed(2)).join(",") + `|${map.getContainer().clientWidth}x${map.getContainer().clientHeight}`;
    if (!sofort && key === letzterAusschnitt) return;
    letzterAusschnitt = key;
    const w = map.getContainer().clientWidth;
    const pad = Math.max(24, Math.min(70, Math.round(w / 10)));
    map.fitBounds(bb, { padding: { top: pad + 30, bottom: pad + 24, left: pad + 10, right: pad + 10 }, maxZoom: 11.5, duration: sofort ? 0 : 900 });
    return;
  }
  letzterAusschnitt = "";
  const c = map.getCenter();
  if (!sofort && Math.abs(c.lat - fz.lat) < 1e-5 && Math.abs(c.lng - fz.lon) < 1e-5) return;
  if (sofort) map.jumpTo({ center: [fz.lon, fz.lat], zoom: Math.max(map.getZoom(), 10) });
  else map.easeTo({ center: [fz.lon, fz.lat], duration: 900 });
}
