/**
 * Piloten-Interface (Spieler-NAH): Ein Mitspieler tritt mit dem Code bei, übernimmt einen Hubschrauber und
 * sieht statt der Leitstelle nur seine eigene Ansicht – Alarmierung, Status, Karte, Patientenblatt am
 * Berufungsort, Entscheidung (Transport / Übergabe / kein Transport) und Übungsflug ohne Flugsimulator.
 * Die Simulation läuft beim Host; alles hier geht als Befehl an ihn (sim.call).
 *
 * Aussehen nach dem Entwurf „Pilot“ (LeitWerk Arbeitsplatz, 09.11.): Vorlage, CSS und Logik liegen in
 * src/ui/fenster/pilot; hier entstehen die Daten (ansichtDaten) und Aktionen dazu.
 */
import "./pilot.css";
import type maplibregl from "maplibre-gl";
import { store } from "../../data/store";
import { buchungName } from "../../data/klinik";
import { ALTERSGRUPPEN, altersgruppeVon, DRINGLICHKEITEN, dringlichkeitFuer, symptom, symptomAusDiagnose, symptomSuche, zuweisungId, zuweisungLesen, type Altersgruppe, type Dringlichkeit, type Symptom } from "../../data/zuweisung";
import { khLandung, type Hospital } from "../../data/model";
import { mp, meinName } from "../../net/mehrspieler";
import { findCode } from "../../sim/codes";
import { ktCode } from "../../sim/ktCodes";
import { antwortLabel, fragenImAblauf, type Frage } from "../../abfrage/schema";
import { fliegt, sim, type Einsatz, type PilotPlan, type SimFahrzeug } from "../../sim/engine";
import { distanceM } from "../../sim/geo";
import type { StatusKey } from "../../sim/settings";
import { availableMaps, createMap, type MapHandle } from "../../map";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import { logoMarke } from "../logo";
import { einstellungenSeite, spielmenue } from "../spielmenue/oeffnen";
import { stufeFarbe } from "../panels/teile";
import { istDunkel } from "../ws/persoenlich";
import { pilotModusSetzen } from "./modus";
import { AKTIONEN, belegung, type PilotAktion } from "./tasten";
import { eingabeStarten, eingabeStoppen, handyHalten, tastenDialog } from "./eingabe";
import { gruppenName } from "../funkGeraet";
import { funkEmpfang, funkGruppenSetzen, funkGruppenWahl, funkSendeZustand, funkTon, funkUnterbrochen, onFunkEmpfang, onFunkGruppen, onFunkSenden, sprechGruppe, sprechGruppeWeiter, sprechStart, sprechStopp } from "../sprechfunk";
import { MODELLE, mikrofone, mikroTesten, modellLaden, setzeSprache, sprachPrefs, sprachStatus } from "../sprache";
import { inTauri } from "../../platform";
import { ALARM_AUFNAHMEN, ALARM_STANDARD, ALARM_VORLAGEN, alarmPrefs, alarmPrefsSetzen, alarmStarten, alarmStoppen, alarmtonHinzufuegen, eigeneAlarmtoene, probeLaeuft, probeSpielen, probeStoppen, type AlarmArt } from "./alarmToene";
import { dateiLoeschen } from "../sounds";
import { ablageZeigen } from "../../net/ablage";
import { flugEingeschraenkt, flugverbot, lageVon, type WetterLage } from "../../sim/weather";
import { einrichtungAuto, einrichtungBeobachten, einrichtungDialog, einrichtungOffen } from "./einrichtung";
import { efbStarten, handyAktionen, handyBuchung, handyDialog, handyLaeuft, handyStand, handyStandBauen } from "./handy";
import { carlsStand, hpg, hpgAktualisieren, hpgCarlsTest, hpgEinrichten, hpgMissionFuer, hpgStarten, hpgTestNachricht } from "./hpg";
import { letzterCarls } from "./eingabe";
import { carlsAn, carlsUmschalten, communityWaehlen, gtn, gtnAn, gtnBereitlegen, gtnSuchen, gtnUmschalten } from "./flugsim";
import { datenEmpfangen, datenFrisch, dllWaehlen, flugplanSpeichern, flugsim, flugsimAnbinden, flugsimBeenden, flugsimTrennen, flugsimVerbinden, koordText, vorgabe, wetterDialog, msfsWetter, msfsWetterStand, wetterUebergang, xpAbgleich, xplaneFlugplanBereitlegen, xpPlugin, xpPluginDa, xpZeitUmschalten } from "./flugsim";
import { IC, wetterHtml, wetterKurz, wetterSchluessel, type WetterReiter } from "../ws/kopfleisteInhalt";
import { mb, onUpdate, updateImHintergrund, updateInfo, updateStand, updateStandZuruecksetzen } from "../updateDienst";
import { bilderWaehlen, fehlerBerichtSpeichern, fehlerTicketSenden } from "../fehlerMelden";
import { jetztSichern } from "../../net/spielstand";
import type { EntwurfFenster } from "../entwurf/einbinden";
import { pilotAnsichtEinbinden, type PilotApp, type PilotLogik } from "../fenster/pilot";
import { funkEinbinden, type FunkFenster } from "../fenster/funk";

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
  // Überstellung: zum aktuellen Halt (Abholort bzw. Ziel)
  const kt = !e ? sim.pilotKt(fz) : null;
  if (kt) return void befehl(sim.call("pilotFliegen", fz.id, kt.art === "ab" ? "bo" : "zo"));
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


function statusHaltAnzeigen(_s: StatusKey | null): void {
  fenster?.zeichnen();
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

// ------------------------------------------------------------------ Ansicht (Entwurf „Pilot“, src/ui/fenster/pilot)

let root: HTMLElement | null = null;
let fenster: EntwurfFenster<PilotLogik> | null = null;
let karte: MapHandle | null = null;
/** Teile, die nicht aus der Vorlage kommen und nach jedem Zeichnen an ihren Platz gehängt werden */
let kartenEl: HTMLElement | null = null;
let funkEl: HTMLElement | null = null;
let grossEl: HTMLElement | null = null;
let folgen = true;
let punktWaehlen = false;
let letzterEinsatz: string | null = null;
let alarmOffen = false;
let aus: (() => void)[] = [];
let wetterReiter: WetterReiter = "aktuell";
let wetterStand = "";
let geplant = 0;

export function pilotAktiv(): boolean {
  return !!root;
}

/** neu zeichnen – gebündelt (die Simulation meldet sich oft mehrmals hintereinander) */
function planen(): void {
  if (geplant || !root) return;
  geplant = requestAnimationFrame(() => {
    geplant = 0;
    zeichneAlles();
  });
}

/** Piloten-Interface öffnen (nach dem Beitritt) */
export function pilotOeffnen(): void {
  if (root) return;
  pilotModusSetzen(true);
  root = el("div", { class: "plt-ew" });
  document.body.appendChild(root);
  letzterEinsatz = meinFz()?.einsatzId ?? null;
  kartenEl = el("div", { class: "pv-map" });
  funkEl = funkPlatzBauen();
  fenster = pilotAnsichtEinbinden(root, { daten: () => ansichtDaten(), a: ansichtAktionen() as unknown as PilotApp["a"] }, nachZeichnen);
  // Karte groß: als Fenster über allem
  grossEl = el("div", { class: "ap pv-gross", hidden: "" });
  grossEl.innerHTML = `<div class="pv-gross-box"><div class="pv-gross-kopf"><b>Karte</b><button type="button" class="kn sm" data-act="karte-zu" title="Schließen (Esc)">Schließen</button></div><div class="pv-gross-platz"></div></div>`;
  grossEl.addEventListener("click", (ev) => {
    if (ev.target === grossEl || (ev.target as HTMLElement).closest("[data-act=karte-zu]")) karteGross(false);
  });
  root.appendChild(grossEl);
  // Wetter-Schublade: Reiter Aktuell / Prognose / Warnungen
  root.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-wreiter]");
    if (!b) return;
    wetterReiter = b.dataset.wreiter as WetterReiter;
    wetterStand = "";
    nachZeichnen();
  });
  // außerhalb einer offenen Schublade klicken: zu
  const draussen = (ev: MouseEvent) => {
    const k = fenster?.k;
    if (!k || !k.offen()) return;
    const t = ev.target as HTMLElement;
    if (t.closest?.(".pv-anker.reiter") || t.closest?.(".toast")) return;
    k.schubladeZu();
  };
  document.addEventListener("mousedown", draussen, true);
  aus.push(() => document.removeEventListener("mousedown", draussen, true));
  const esc = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (document.querySelector(".dlg-overlay:not([style*='none'])")) return;
    if (punktWaehlen) {
      punktWaehlen = false;
      planen();
    } else if (fenster?.k.offen()) fenster.k.schubladeZu();
    else if (karteIstGross()) karteGross(false);
  };
  document.addEventListener("keydown", esc);
  aus.push(() => document.removeEventListener("keydown", esc));
  aus.push(onFunkEmpfang(() => planen()));
  aus.push(onFunkSenden(() => planen()));
  aus.push(onFunkGruppen(() => planen()));
  aus.push(onUpdate(() => planen()));
  void karteStarten(kartenEl);
  aus.push(sim.onChange(() => planen()));
  aus.push(
    mp.onChange(() => {
      // Spiel verlassen (z. B. Fehler beim Beitritt): zurück zur Startseite
      if (mp.status.rolle === "aus" && root && !sim.pilotTest) {
        pilotSchliessen();
        void import("../hauptmenue").then((m) => m.hauptmenueZeigen(undefined, { splash: false }));
        return;
      }
      planen();
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
  // Einrichtung (EFB-App, X-Plane-Plugin, H145, EC135) prüfen und aktuell halten
  void einrichtungAuto();
  aus.push(einrichtungBeobachten(() => zeichneAlles()));
  flugsimAnbinden(meinFz, () => planen());
  if (vorgabe().auto) void flugsimVerbinden();
  void gtnSuchen();
  void hpgStarten({
    status: (s) => pilotStatusDruecken(s),
    plan: (p) => {
      const f = meinFz();
      if (f) void befehl(sim.call("pilotPlan", f.id, p));
    },
    geaendert: () => planen(),
  });
  if (location.search.includes("debug"))
    Object.assign(window, {
      __pilot: {
        datenEmpfangen,
        flugsim,
        hpgMissionFuer,
        hpgTestNachricht,
        hpgCarlsTest,
        daten: () => ansichtDaten(),
        // Handy im Test: Stand wie für das Handy, Befehle wie vom Handy
        handy: () => {
          const f = meinFz();
          const e = einsatzVon(f);
          return handyStandBauen(f, e, funkPlatzAktualisieren(f, e), () => handyMehr(f, e));
        },
        handyBefehl: (b: string) => (b.startsWith("bu:") || b.startsWith("gr:") || b.startsWith("ka:") ? handyBuchen(b) : pilotAktion(b as PilotAktion, true)),
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
      } else window.setTimeout(warte, 400);
    };
    warte();
  }
}

/** Nach jedem Zeichnen: Karte, Funk, Logo und Wetter-Inhalt an ihren Platz (die Vorlage kennt sie nicht) */
function nachZeichnen(): void {
  if (!root) return;
  const logo = root.querySelector<HTMLElement>(".pv-logo");
  if (logo && !logo.firstChild) logo.innerHTML = logoMarke(28);
  const kp = root.querySelector<HTMLElement>(".pv-kartenplatz");
  if (kp && kartenEl && !karteIstGross() && kartenEl.parentElement !== kp) {
    kp.appendChild(kartenEl);
    window.setTimeout(() => karte?.map.resize(), 30);
  }
  const fp = root.querySelector<HTMLElement>(".pv-funk");
  if (fp && funkEl && funkEl.parentElement !== fp) fp.appendChild(funkEl);
  // Wetter: dasselbe Fenster wie in der Kopfleiste (Inhalt aus kopfleisteInhalt.ts)
  const wp = root.querySelector<HTMLElement>(".pv-wxpop");
  if (wp) {
    const k = `${wetterReiter}|${wetterSchluessel()}`;
    if (!wp.firstChild || wp.dataset.k !== k || k !== wetterStand) {
      const neu = !wp.firstChild;
      const roll = wp.querySelector<HTMLElement>(".kl-winh")?.scrollTop ?? 0;
      wetterStand = k;
      wp.dataset.k = k;
      if (!neu) wp.classList.add("steht");
      wp.innerHTML = wetterHtml(wetterReiter, sim.funkgruppe ? String(sim.funkgruppe().id).replace(/^NÖ-/, "RD-NOE-") : "RD-NOE-03").replace('class="segs kl-wsegs"', 'class="segs gleit kl-wsegs"');
      const w = wp.querySelector<HTMLElement>(".kl-winh");
      if (w) w.scrollTop = roll;
    }
  }
}

/** Karte groß (als Fenster über allem) bzw. zurück an ihren Platz rechts */
function karteIstGross(): boolean {
  return !!grossEl && !grossEl.hidden;
}
function karteGross(gross: boolean): void {
  if (!root || !grossEl || !kartenEl) return;
  grossEl.hidden = !gross;
  const ziel = gross ? grossEl.querySelector<HTMLElement>(".pv-gross-platz") : root.querySelector<HTMLElement>(".pv-kartenplatz");
  if (ziel && kartenEl.parentElement !== ziel) ziel.appendChild(kartenEl);
  if (!gross && punktWaehlen) punktWaehlen = false;
  planen();
  window.setTimeout(() => {
    karte?.map.resize();
    karteFolgen(true);
  }, 30);
}


/** Einstellungen des Piloten: Funk, Tasten, Handy, Flugsimulator */
export function einstellungenDialog(): void {
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
  // Wetter zum Ausprobieren (Übernahme in MSFS/X-Plane testen)
  const wx = el("div", { class: "plt-test-wetter" });
  const jetzt = lageVon(sim.state.wetter.lage);
  wx.innerHTML = `<p class="plt-leise" style="margin:14px 0 6px"><b>Wetter für den Test</b> – LeitWerk stellt es im Flugsimulator ein (Einstellung „Wie LeitWerk“).</p>`;
  const reihe = el("div", { class: "plt-reiter" });
  reihe.style.flexWrap = "wrap";
  for (const [l, t] of [["klar", "Klar"], ["leicht_bewoelkt", "Bewölkt"], ["bedeckt", "Bedeckt"], ["regen", "Regen"], ["starkregen", "Starkregen"], ["nebel", "Nebel"], ["hochnebel", "Hochnebel"], ["gewitter", "Gewitter"], ["schnee", "Schnee"]] as [WetterLage, string][]) {
    const b = el("button", { class: l === jetzt ? "an" : "", type: "button" });
    b.textContent = t;
    b.addEventListener("click", () => {
      try {
        sim.pilotTestWetter(l);
        reihe.querySelectorAll("button").forEach((x) => x.classList.toggle("an", x === b));
        toast(`Testwetter: ${t} – der Flugsimulator zieht in einigen Sekunden nach`);
      } catch (e) {
        fehler(e);
      }
    });
    reihe.appendChild(b);
  }
  wx.appendChild(reihe);
  // Wie schnell der Simulator zum neuen Wetter wechselt (Spielminuten – läuft mit dem Zeitraffer)
  wx.insertAdjacentHTML("beforeend", `<p class="plt-leise" style="margin:10px 0 6px"><b>Wechsel</b> – wie schnell das neue Wetter im Flugsimulator aufzieht (in Spielzeit, im Zeitraffer schneller)</p>`);
  const ueb = el("div", { class: "plt-reiter" });
  for (const [m, t] of [[0, "Sofort"], [2, "Schnell (2 min)"], [10, "Realistisch (10 min)"]] as [number, string][]) {
    const b = el("button", { class: wetterUebergang.min === m ? "an" : "", type: "button" });
    b.textContent = t;
    b.addEventListener("click", () => {
      wetterUebergang.min = m;
      ueb.querySelectorAll("button").forEach((x) => x.classList.toggle("an", x === b));
    });
    ueb.appendChild(b);
  }
  wx.appendChild(ueb);
  wx.insertAdjacentHTML("beforeend", `<p class="plt-leise" style="margin:10px 0 6px"><b>Wolken beim Wechsel</b> – ein- und ausblenden über …</p>`);
  const wo = el("div", { class: "plt-reiter zwei" });
  for (const [m, t] of [["bedeckung", "Bedeckung"], ["dichte", "Dichte"]] as ["bedeckung" | "dichte", string][]) {
    const b = el("button", { class: wetterUebergang.wolken === m ? "an" : "", type: "button" });
    b.textContent = t;
    b.addEventListener("click", () => {
      wetterUebergang.wolken = m;
      wo.querySelectorAll("button").forEach((x) => x.classList.toggle("an", x === b));
    });
    wo.appendChild(b);
  }
  wx.appendChild(wo);
  body.appendChild(wx);
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
  if (geplant) cancelAnimationFrame(geplant);
  geplant = 0;
  fenster?.entfernen();
  fenster = null;
  karte?.map.remove();
  karte = null;
  kartenEl = null;
  funkFenster?.entfernen();
  funkFenster = null;
  funkEl = null;
  grossEl = null;
  root?.remove();
  root = null;
  pilotModusSetzen(false);
}

// ------------------------------------------------------------------ Zeichnen

/** Was sonst bei jedem Takt passiert (Töne, Handy, GTN, Tablet, Karte) – dann die Ansicht neu zeichnen */
function zeichneAlles(): void {
  if (!root) return;
  const fz = meinFz();
  if (!fz) letztenWiederNehmen();
  vorlaufPruefen(fz);
  const e = einsatzVon(fz);
  alarmPruefen(fz, e);
  gsAbrufPruefen(fz, e);
  const fk = funkPlatzAktualisieren(fz, e);
  karteAktualisieren(fz, e);
  handyStand(fz, e, fk, () => handyMehr(fz, e));
  gtnZiel(fz, e);
  hpgAktualisieren(fz, e);
  fenster?.zeichnen();
}

/** Neuer Einsatz: Melder bis quittiert (Status 9 oder 2), höchstens 1 Minute */
function alarmPruefen(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  if (imVorlauf(fz)) return;
  // Überstellung (KT/SEK) zählt wie ein Einsatz: eigener Schlüssel je Fahrt
  const ktFahrt = fz && !fz.einsatzId && fz.kt?.aktiv ? `kt:${(fz.kt.fahrten[0] ?? []).join(",")}` : null;
  if (ktFahrt && ktFahrt !== letzterEinsatz && fz && ["alarmWache", "alarmFunk"].includes(fz.status)) {
    alarmOffen = true;
    alarmStarten("alarm", () => {
      const f = meinFz();
      return !!root && !!f && !f.einsatzId && !!f.kt?.aktiv && ["alarmWache", "alarmFunk"].includes(f.status);
    });
  }
  if (ktFahrt) {
    letzterEinsatz = ktFahrt;
    if (!["alarmWache", "alarmFunk"].includes(fz!.status)) alarmOffen = false;
    return;
  }
  const neu = fz?.einsatzId ?? null;
  if (neu && neu !== letzterEinsatz && fz && ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status)) {
    alarmOffen = true;
    alarmStarten("alarm", () => {
      const f = meinFz();
      return !!root && !!f && f.einsatzId === neu && ["alarmWache", "alarmFunk"].includes(f.status);
    });
  }
  letzterEinsatz = neu;
  if (!fz || !e || !["alarmWache", "alarmFunk"].includes(fz.status)) alarmOffen = false;
}

let letzterGsHinweis: string | null = null;
/** Abruf aus dem Bereitstellungsraum: eigener Ton, bis abgehoben (Status 2) – höchstens 1 Minute */
function gsAbrufPruefen(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const gsH = fz && e ? sim.pilotGsHinweis(fz) : null;
  if (gsH?.abruf && gsH.text !== letzterGsHinweis && fz) {
    alarmStarten("abruf", () => {
      const f = meinFz();
      return !!root && !!f && f.phase === "wartetBR" && !!sim.pilotGsHinweis(f)?.abruf && f.status !== "zumBO";
    });
  }
  letzterGsHinweis = gsH?.text ?? null;
}

// ---- Hilfen für die Ansicht

/** Statusfarben wie im Entwurf (fenster.css: --s1 … --s9) */
const ST_FARBE: Record<string, string> = { "1": "#CDEFA0", "6": "#CDEFA0", A: "#F3EF7A", F: "#F3EF7A", "9": "#DCC23A", "2": "#F7D98C", "3": "#EBB36B", "4": "#ECD8ED", "5": "#D7AEE2", "7": "#DCDDE1", "8": "#FFFFFF", "0": "#E6E7EA" };
const stFarbe = (nummer: string) => ST_FARBE[nummer] ?? "#E6E7EA";
const ST_KURZ: Partial<Record<StatusKey, string>> = { alarmiert: "Quittieren", freiWache: "Frei Wache", zumBO: "Zum BO", amBO: "Am BO", zumZO: "Zum ZO", amZO: "Am ZO", freiFunk: "Frei Funk", bereitschaft: "Bereit" };
const ST_LANG: Partial<Record<StatusKey, string>> = { alarmiert: "Quittieren", freiWache: "Frei auf Wache", zumBO: "Zum Berufungsort", amBO: "Am Berufungsort", zumZO: "Zum Zielort", amZO: "Am Zielort", freiFunk: "Frei über Funk", bereitschaft: "Bereitschaft" };
const SICHT_FARBE: Record<string, [string, string]> = { rot: ["#E5484D", "#fff"], gelb: ["#F5A524", "#15181c"], gruen: ["#4CC38A", "#15181c"], tot: ["#6B7385", "#fff"] };
const ALARM_ST = ["alarmWache", "alarmFunk", "alarmiert"];
const mmss = (sek: number) => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, "0")}`;
const km1 = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", ",")} km`);
const flugSek = (m: number) => m / (sim.settings.nahGeschwindigkeit / 3.6);
const gsGruppe = (e: Einsatz | undefined) => gruppenName(sim.kanalVon(e)) || "RD-NOE-09";

/** Zusatzinfo der Leitstelle im Kurzformat: „34m B? A+ // Freitext“ */
function zusatzInfo(e: Einsatz): { b: string; t: string } {
  const info = (e.infoRtw ?? "").trim();
  if (!info) return { b: "", t: "" };
  const i = info.indexOf("//");
  if (i >= 0) return { b: info.slice(0, i).trim(), t: info.slice(i + 2).trim() };
  if (e.infoAuto && info === e.infoAuto) return { b: info, t: "" };
  return { b: "", t: info };
}

/** Großeinsatz, zu dem der Hubschrauber gehört (auch als zugeteilter Patient) */
function gsVon(e: Einsatz | undefined): Einsatz | undefined {
  if (!e) return undefined;
  if (e.gsKind) return sim.einsatz(e.gsKind.parent) ?? undefined;
  return e.gs && !e.gs.aufgehoben ? e : undefined;
}

/** Ablauf des Großeinsatzes (2. Alarmierung in den Bereitstellungsraum): 0 Alarm … 6 Frei; -1 = kein solcher Ablauf */
function gsSchritt(fz: SimFahrzeug, e: Einsatz | undefined): number {
  const p = gsVon(e);
  if (!p?.gs) return -1;
  const gs = p.gs;
  const imBr = gs.ziel[fz.id] === "br" || !!fz.gsAmBr || fz.phase === "wartetBR" || (gs.brAlarm ?? []).includes(fz.id);
  if (!imBr) return -1;
  if (e?.gsKind) return fz.status === "amBO" ? 4 : fz.status === "zumZO" || fz.status === "amZO" ? 5 : fz.status === "freiFunk" ? 6 : 4;
  if (ALARM_ST.includes(fz.status)) return 0;
  const abruf = !!sim.pilotGsHinweis(fz)?.abruf || (!!fz.gsAmBr && fz.phase === "vorOrt");
  if (abruf) return 3;
  if (fz.status === "zumBO") return 1;
  return 2;
}

/** Phase im normalen Ablauf: 0 Bereitschaft · 1 Alarm · 2 Anflug · 3 Am Einsatzort · 4 Transport · 5 Am KH · 6 Frei */
function phaseVon(fz: SimFahrzeug | undefined, e: Einsatz | undefined): number {
  if (!fz) return 0;
  const s = fz.status;
  if (ALARM_ST.includes(s) && e) return 1;
  if (s === "zumBO") return 2;
  if (s === "amBO") return 3;
  if (s === "zumZO") return 4;
  if (s === "amZO") return 5;
  if (s === "freiFunk") return 6;
  return 0;
}

function verbindung(): { t: string; l: string; gelb: boolean } {
  if (sim.pilotTest) return { t: "Testmodus", l: "\u00a0· ohne Leitstelle", gelb: true };
  if (!mp.status.verbunden) return { t: "verbinde …", l: "", gelb: true };
  if (!mp.status.hostDa) return { t: "Host nicht da", l: "", gelb: true };
  const host = mp.spieler.find((s) => s.host);
  const ich = mp.spieler.find((s) => s.pid === mp.ich.pid);
  return { t: "verbunden", l: `${host ? `\u00a0· Host ${host.name}` : ""}${typeof ich?.ping === "number" ? `\u00a0· ${Math.round(ich.ping)} ms` : ""}`, gelb: false };
}

function warteText(fz: SimFahrzeug | undefined): string {
  return sim.pilotTest
    ? !fz
      ? "Testmodus – noch kein Hubschrauber gewählt: Logo › Hubschrauber wechseln."
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
            ? "Noch kein Hubschrauber gewählt – Logo › Hubschrauber wechseln."
            : fz.pilot?.offlineSeit
              ? "Verbindung unterbrochen – nach einer Minute fliegt der Computer weiter."
              : "";
}

/** NAH-Fluglage jetzt (wie in der Kopfleiste: Wetter aus = keine Einschränkung) */
function flugJetzt(): "ok" | "gelb" | "rot" {
  const j = sim.wetterPrognose(1)[0];
  if (!sim.settings.wetterAktiv || !j) return "ok";
  return flugverbot(j.lage, j.wind) ? "rot" : flugEingeschraenkt(j.lage, j.wind) ? "gelb" : "ok";
}

const SIM_TEXT: Record<string, string> = { aus: "nicht verbunden", keineDll: "SimConnect fehlt", wartet: "wartet", verbunden: "verbunden", getrennt: "getrennt", fehler: "Fehler" };
const PUNKT = { ok: "#4CC38A", warn: "#F5A524", aus: "#9AA3B5", fehl: "#E5484D" };

interface Knopf {
  t: string;
  klick: () => void;
  prim?: boolean;
  an?: boolean;
  aus?: boolean;
}

/** Cockpit: MSFS, H145-Tablet, H145-Funkgerät, GTN750, Handy – je Zeile aufklappbar */
function cockpitDaten(fz: SimFahrzeug | undefined): Record<string, unknown>[] {
  const d = flugsim.daten;
  const frisch = datenFrisch();
  const z = flugsim.zustand;
  const out: Record<string, unknown>[] = [];
  const ew = einrichtungOffen();
  out.push({
    k: "einrichtung",
    t: "Einrichtung",
    z: !ew.geprueft ? "prüfe …" : ew.laeuft ? "läuft …" : ew.offen ? `${ew.offen} offen` : "alles eingerichtet",
    f: !ew.geprueft || ew.laeuft ? PUNKT.aus : ew.offen ? PUNKT.warn : PUNKT.ok,
    d: !ew.geprueft
      ? "LeitWerk sieht nach, was in MSFS und X-Plane eingebaut ist …"
      : ew.offen
        ? `${ew.offen} ${ew.offen === 1 ? "Punkt ist" : "Punkte sind"} noch offen (EFB-App, Plugin, H145, EC135 …) – „Einrichten …“ zeigt was und baut es mit einem Klick ein.`
        : `EFB-App, X-Plane-Plugin und gewählte Hubschrauber sind auf dem Stand dieser Version.${ew.neustart ? " Manches wirkt erst nach dem nächsten Start des Simulators." : ""}`,
    knoepfe: [{ t: "Einrichten …", prim: ew.offen > 0, klick: () => einrichtungDialog() }],
  });
  const msfsKn: Knopf[] = [];
  const xp = flugsim.quelle === "xplane";
  if (z === "aus" || z === "fehler" || z === "keineDll" || z === "getrennt") msfsKn.push({ t: "Mit Flugsimulator verbinden", prim: true, klick: () => void flugsimVerbinden() });
  if (!xp && (flugsim.ms.zustand === "keineDll" || flugsim.ms.zustand === "fehler") && !/Windows/.test(flugsim.ms.text)) msfsKn.push({ t: "SimConnect.dll wählen (MSFS) …", klick: () => void dllWaehlen() });
  if (z === "verbunden" || z === "wartet") msfsKn.push({ t: "Trennen", klick: () => void flugsimTrennen() });
  out.push({
    k: "msfs",
    t: xp ? "X-Plane" : flugsim.quelle === "msfs" ? "MSFS" : "Flugsimulator",
    z: z === "verbunden" && !frisch ? "keine Flugdaten" : (SIM_TEXT[z] ?? z),
    f: z === "verbunden" ? (frisch ? PUNKT.ok : PUNKT.warn) : z === "wartet" ? PUNKT.warn : z === "aus" ? PUNKT.aus : PUNKT.fehl,
    d:
      z === "verbunden" && frisch
        ? `${xp ? `${flugsim.xp.text || "X-Plane verbunden"}` : "MSFS (SimConnect) verbunden"} · Position geht 1× pro Sekunde an die Leitstelle.`
        : z === "verbunden"
          ? "Keine Flugdaten – bist du im Flug (nicht im Menü)?"
          : flugsim.text || (z === "aus" ? "Nicht verbunden – LeitWerk sucht MSFS und X-Plane 12. Ohne Flugsimulator geht der Übungsflug." : ""),
    hinw:
      flugsim.xp.zustand === "fehler"
        ? "X-Plane 12 ab Version 12.1.1; in X-Plane darf unter Einstellungen „Disable Incoming Traffic“ nicht eingeschaltet sein."
        : !xp && (flugsim.ms.zustand === "keineDll" || flugsim.ms.zustand === "fehler") && !/Windows/.test(flugsim.ms.text)
        ? "Die Datei kommt mit dem kostenlosen MSFS-SDK (Entwicklermodus › Help › SDK Installer), danach liegt sie unter C:\\MSFS 2024 SDK\\SimConnect SDK\\lib\\SimConnect.dll."
        : "",
    werte:
      d && frisch
        ? {
            hoehe: `${Math.round(d.hoehe).toLocaleString("de-AT")} ft`,
            agl: d.am_boden ? "am Boden" : `${Math.round(d.agl).toLocaleString("de-AT")} ft`,
            kurs: `${String(Math.round(((d.kurs % 360) + 360) % 360)).padStart(3, "0")}°`,
            kt: `${Math.round(d.kts)} kt`,
          }
        : null,
    knoepfe: msfsKn,
  });
  // MSFS-Zubehör (HPG H145, GTN750) gibt es in X-Plane nicht – dafür Uhrzeit, Wetter, Flugplan und Tasten
  if (xp) {
    const zeitAn = vorgabe().xpZeit !== false;
    const wetterLw = (vorgabe().wetter ?? "leitwerk") === "leitwerk";
    out.push({
      k: "xpabgleich",
      t: "X-Plane: Uhrzeit, Wetter, Flugplan",
      z: xpAbgleich.fehler ? "Fehler" : "läuft",
      f: xpAbgleich.fehler ? PUNKT.fehl : PUNKT.ok,
      d: [
        zeitAn ? xpAbgleich.zeitText || "Uhrzeit wird von LeitWerk übernommen." : "Uhrzeit stellst du in X-Plane selbst ein.",
        wetterLw ? xpAbgleich.wetterText || "Wetter wird von LeitWerk übernommen." : "Wetter stellst du in X-Plane selbst ein.",
        xpAbgleich.fmsFehler || (xpAbgleich.fms ? `Flugplan ${xpAbgleich.fms} liegt in X-Plane (Output/FMS plans) – im GPS/FMS laden.` : "Flugplan „Leitwerk“ kommt bei jedem neuen Einsatz und Zielort nach X-Plane (Output/FMS plans) und ins GTN – immer derselbe Name, der alte wird überschrieben."),
        xpAbgleich.gfp,
        xpAbgleich.fehler,
      ]
        .filter(Boolean)
        .join(" "),
      hinw: "Status geben: im Tablet-Plugin, über X-Plane-Tasten „LeitWerk: Status …“, mit den Zifferntasten (globale Tasten, Einstellungen › Tasten) oder auf der Handy-Seite.",
      knoepfe: [
        { t: zeitAn ? "Uhrzeit: von LeitWerk" : "Uhrzeit: selbst", an: zeitAn, klick: () => xpZeitUmschalten(!zeitAn) },
        { t: "Wetter …", klick: () => wetterDialog() },
      ],
    });
    // Tablet in X-Plane: eigenes Plugin (Fenster, auch in VR)
    const pl = xpPlugin.stand;
    const pm = xpPluginDa() ? xpPlugin.meldung : null;
    out.push({
      k: "xptablet",
      t: "X-Plane: Tablet (Plugin)",
      z: pm ? (pm.vr ? "in VR" : "läuft") : pl?.aktuell ? (pl.neustart ? "neu starten" : "eingebaut") : "fehlt",
      f: pm ? PUNKT.ok : pl?.aktuell ? PUNKT.warn : PUNKT.aus,
      d: pm
        ? `Plugin ${pm.version} läuft${pm.vr ? " in VR" : ""} – Tablet ${pm.sichtbar ? "offen" : "zu"}. In X-Plane: Plugins › LeitWerk › Tablet zeigen.` +
          (pm.cockpit.length ? ` Im Cockpit: ${pm.cockpit.map((c) => ({ mfd: "MFD", tablet: "Klapp-Tablet", tetra: "Funkgerät" })[c] ?? c).join(", ")}.` : "") +
          (pm.wetter ? ` Wetter setzt das Plugin (sanft)${pm.wetterStand && pm.wetterStand !== "-" ? `: ${pm.wetterStand}` : ""}.` : pm.version >= "0.2" ? " Wetter über das Plugin erst ab X-Plane 12.3." : "")
        : pl?.aktuell
          ? pl.neustart
            ? "Plugin erneuert – wirkt nach dem nächsten Start von X-Plane."
            : "Plugin ist eingebaut, meldet sich aber nicht – wurde X-Plane danach neu gestartet?"
          : pl && !pl.mitgeliefert
            ? "In dieser Version ist das Plugin nicht dabei."
            : pl?.fehler || "Plugin nicht eingebaut – „Einbauen“ legt es in X-Plane 12/Resources/plugins/LeitWerk.",
      hinw: "Tasten: in X-Plane unter Einstellungen › Joystick bzw. Tastatur nach „LeitWerk“ suchen – Status 1–9, Sprechtaste (halten), Tablet zeigen, Zielort buchen, Navigation. Das geht auch, wenn X-Plane vorne ist.",
      knoepfe: pm ? [] : [{ t: "Einrichtung …", klick: () => einrichtungDialog() }],
    });
    return out.concat(cockpitRest(fz).filter((x) => x.k === "handy"));
  }
  if (flugsim.quelle === "msfs" || flugsim.ms.zustand === "verbunden") {
    const zeitAn = vorgabe().xpZeit !== false;
    out.push({
      k: "msfswetter",
      t: "MSFS: Wetter und Uhrzeit (Test)",
      z: msfsWetterStand.text ? "Rückmeldung" : "wartet",
      f: /fehl|nicht|kein/i.test(msfsWetterStand.text) ? PUNKT.fehl : msfsWetterStand.text ? PUNKT.ok : PUNKT.aus,
      d: msfsWetterStand.text || "Die LeitWerk-App im EFB-Tablet stellt Wetter und Uhrzeit von LeitWerk in MSFS ein (Test) – noch keine Rückmeldung von der App.",
      knoepfe: [
        { t: zeitAn ? "Uhrzeit: von LeitWerk" : "Uhrzeit: selbst", an: zeitAn, klick: () => xpZeitUmschalten(!zeitAn) },
        { t: "Wetter …", klick: () => wetterDialog() },
      ],
    });
  }
  return out.concat(cockpitRest(fz));
}

function cockpitRest(fz: SimFahrzeug | undefined): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (hpg.geprueft && (hpg.paket || hpg.zustand === "verbunden")) {
    const v = hpg.zustand === "verbunden";
    out.push({
      k: "tablet",
      t: "H145-Tablet",
      z: v ? "verbunden" : hpg.zustand === "fehler" ? "Fehler" : "wartet",
      f: v ? PUNKT.ok : hpg.zustand === "fehler" ? PUNKT.fehl : PUNKT.warn,
      d: v ? "Mission „LeitWerk Leitstelle“ läuft · Einsatz, Patient und Krankenhauswahl auch am Tablet." : hpg.mission ? "Im Tablet: Missions › Library › „LeitWerk Leitstelle“ wählen (nach dem Einrichten einmal REFRESH)." : hpg.text || "Einmal einrichten, dann im Tablet die Mission wählen.",
      knoepfe: !hpg.mission ? [{ t: "Einrichtung …", klick: () => einrichtungDialog() }] : !v ? [{ t: "Missions-Index neu bauen", klick: () => void hpgEinrichten() }] : [],
    });
  }
  // HPG H145: CARLS-Funkgerät (Status-Tasten) – läuft über die Mission „LeitWerk Leitstelle“ im Tablet (v0.115.0)
  if (hpg.paket || hpg.zustand === "verbunden") {
    const an = carlsAn();
    const ok = hpg.zustand === "verbunden";
    out.push({
      k: "carls",
      t: "H145-Funkgerät",
      z: !an ? "aus" : ok ? "verbunden" : "wartet",
      f: !an ? PUNKT.aus : ok ? PUNKT.ok : PUNKT.warn,
      d: !an
        ? "Die Status-Tasten am Funkgerät sind aus."
        : ok
          ? `Ziffer kurz drücken: nach 1 s geht der Status raus (roter Hörer = abbrechen, ◄ ► = Sprechgruppe). Im Display: Status, wer funkt, Sprechgruppe${letzterCarls ? ` · zuletzt: ${letzterCarls}` : ""}.`
          : "Im Tablet der H145: Missions → LeitWerk Leitstelle starten – dann zeigt das Funkgerät Status und Einsatz.",
      knoepfe: [{ t: an ? "Ausschalten" : "Einschalten", klick: () => carlsUmschalten(!an) }],
    });
  }
  if (gtn.geprueft) {
    out.push(
      gtn.paket
        ? {
            k: "gtn",
            t: "GTN750",
            z: !gtnAn() ? "aus" : gtn.fehler ? "Fehler" : gtn.ziel ? "Flugplan bereit" : "bereit",
            f: !gtnAn() ? PUNKT.aus : gtn.fehler ? PUNKT.fehl : PUNKT.ok,
            d: gtn.fehler ? gtn.fehler : gtn.ziel ? "Im GTN: Flight Plan › Menu › Import. Wegpunkte LWBO (Einsatzort), LWKH (Krankenhaus), LWBAS (Stützpunkt)." : "Bei Alarm und nach der Zielwahl liegt der Flugplan im GTN bereit.",
            knoepfe: [{ t: gtnAn() ? "Automatisch: an" : "Automatisch: aus", an: gtnAn(), klick: () => gtnUmschalten(!gtnAn()) }],
          }
        : {
            k: "gtn",
            t: "GTN750",
            z: "nicht gefunden",
            f: PUNKT.aus,
            d: `PMS50 GTN750 nicht gefunden${gtn.community ? "" : " (Community-Ordner unbekannt)"}.`,
            knoepfe: [{ t: "Community-Ordner wählen …", klick: () => void communityWaehlen() }],
          },
    );
  }
  const h = handyLaeuft();
  out.push({
    k: "handy",
    t: "Handy",
    z: h ? "bereit" : "nicht gekoppelt",
    f: h ? PUNKT.ok : PUNKT.aus,
    d: h ? "Handy als Statusgerät ist bereit – QR-Code noch einmal zeigen über „Koppeln …“." : "Handy als Statusgerät: QR-Code scannen (gleiches WLAN).",
    knoepfe: [{ t: "Koppeln …", klick: () => handyDialog() }],
  });
  void fz;
  return out;
}

/** Was die Ansicht zeigt – alles aus dem Spiel (Hubschrauber, Status, Einsatz, Großeinsatz, Patient, Buchung) */
function ansichtDaten(): Record<string, unknown> {
  const fz = meinFz();
  const e = einsatzVon(fz);
  const t = sim.state.zeit;
  const st = fz ? sim.statusDef(fz.status) : null;
  const stN = st ? (st.nummer === "F" ? "A" : st.nummer) : "–";
  const gi = fz ? gsSchritt(fz, e) : -1;
  const G = gi >= 0;
  const pi = phaseVon(fz, e);
  const gsE = gsVon(e);
  const gs = gsE?.gs ?? null;
  const belegung0 = belegung();
  const c = e ? findCode((gsE ?? e).code ?? undefined) : undefined;
  const kh = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const ziel = fz ? sim.pilotBo(fz) : null;
  const rtw = fz && e && !e.gsKind ? sim.nahRtwPartner(fz, e) : undefined;
  const frisch = datenFrisch();
  const p = fz?.pilot ?? null;
  const daheim = !!fz && distanceM(fz, fz.heim) < 300;

  // ---- Kopf
  const wk = wetterKurz();
  const j = sim.wetterPrognose(1)[0];
  const flug = flugJetzt();
  const bremse = sim.zeitBremse();
  const tempo = sim.state.tempo;
  const ichFliege = !!fz && sim.inDerLuft(fz);
  const zr =
    tempo > 1 && bremse
      ? { a: "Zeitraffer gebremst auf\u00a0", x: "1×", b: ichFliege ? "\u00a0(du fliegst)" : `\u00a0(${bremse})`, c: "\u00a0(gebremst)", gelb: true, tip: `Zeitraffer der Leitstelle ×${tempo} – gebremst auf 1×: ${bremse}` }
      : { a: "Zeitraffer\u00a0", x: `${tempo}×`, b: "", c: "", gelb: false, tip: "Zeitraffer der Leitstelle" };

  // ---- Status-Tasten
  const stl = AKTIONEN.filter((a) => a.status).map((a) => {
    const d = sim.statusDef(a.status!);
    const aktiv = fz?.status === a.status;
    return {
      key: a.status!,
      n: d.nummer,
      t: ST_LANG[a.status!] ?? d.name,
      kurz: ST_KURZ[a.status!] ?? d.name,
      k: tastenNameKurz(belegung0.taste[a.id]),
      f: stFarbe(d.nummer),
      aktiv,
      halten: statusHalt?.s === a.status,
      leise: a.status === "alarmiert" && !(fz && ["alarmWache", "alarmFunk"].includes(fz.status)),
      aus: !fz,
    };
  });

  // ---- Phasenleiste
  const phasen = G
    ? { titel: ["Alarm", "Anflug BR", "Im Bereitstellungsraum", "Abruf", "Patient", "Transport", "Frei"], kurz: ["Alarm", "Anflug", "Im BR", "Abruf", "Patient", "Transport", "Frei"], i: gi }
    : { titel: ["Bereitschaft", "Alarm", "Anflug", "Am Einsatzort", "Transport", "Am Krankenhaus", "Frei"], kurz: ["Bereit", "Alarm", "Anflug", "Am Ort", "Transport", "Am KH", "Frei"], i: pi };

  // ---- Entfernung und Flugzeit
  const zielPos = e ? (ziel ?? e.adresse) : null;
  const mZiel = fz && zielPos ? distanceM(fz, zielPos) : 0;
  const ank = fz ? sim.pilotAnkunft(fz) : null;
  const landung = kh ? (khLandung(kh) ?? kh) : null;

  // ---- Alarm
  const zi = e ? zusatzInfo(e) : { b: "", t: "" };
  const gruppeGs = gsGruppe(e);
  let alarm: Record<string, string> | null =
    alarmOffen && e && fz
      ? G && gs
        ? {
            t: `${gs.stufe ? `GS ${gs.stufe}` : "Großeinsatz"} · Großeinsatz – ${stichwort(gsE!)}`,
            s: `In den Bereitstellungsraum: ${gs.br?.label ?? "wird noch festgelegt"}${ziel ? ` · ${km1(mZiel)} · ca. ${minuten(flugSek(mZiel))} Flug` : ""} · Sprechgruppe ${gruppeGs}`,
            ziB: zi.b,
            ziT: zi.t,
          }
        : {
            t: `${e.code ? `${e.code} · ` : ""}${stichwort(e)}`,
            s: `${e.adresse?.label ?? "Adresse folgt"}${zielPos ? ` · ${km1(mZiel)} · ca. ${minuten(flugSek(mZiel))} Flug` : ""}${rtw ? ` · mit ${rtw.funkrufname}` : ""}`,
            ziB: zi.b,
            ziT: zi.t,
          }
      : null;

  // ---- Nächster Schritt
  const quittiert = fz?.status === "alarmiert";
  const gtnBereit = gtn.paket && gtnAn() && !!gtn.ziel;
  const etaFlug = ank ? mmss(ank.min * 60) : "";
  const plan = p?.plan ?? null;
  const khName = kh ? kh.kurzname || kh.name : "";
  let next: Record<string, string> = { t: "Kein Hubschrauber", d: "Wähle deinen Hubschrauber: Logo › Hubschrauber wechseln." };
  if (fz && G) {
    const brName = gs?.br?.label ?? "Bereitstellungsraum";
    const hinweis = sim.pilotGsHinweis(fz);
    const fussRest = fz.gsFussBis ? Math.max(0, (fz.gsFussBis - t) / 1000) : 0;
    next = [
      quittiert
        ? { t: "Abheben – Ziel ist der Bereitstellungsraum", d: `Nicht direkt zum Unfallort fliegen.${gtnBereit ? " Der Flugplan zum BR liegt im GTN750 bereit." : ""}`, eta: `${minuten(flugSek(mZiel))}`, etaT: "Flug zum BR" }
        : { t: "Alarm quittieren (9)", d: "Großeinsatz, 2. Alarmierung: Du fliegst in den Bereitstellungsraum, nicht zum Unfallort.", eta: `${minuten(flugSek(mZiel))}`, etaT: "Flug zum BR" },
      { t: "Landen im Bereitstellungsraum – dann Status 3", d: `${brName}. Funk ab jetzt in der Sprechgruppe ${gruppeGs}.`, eta: fz.fahrt || ichFliege ? mmss(flugSek(mZiel)) : "", etaT: "bis zur Landung" },
      { t: "Im Bereitstellungsraum auf den Abruf warten", d: "Die Einsatzleitung ruft dich über Funk ab. Nicht selbst zum Einsatzort gehen." },
      fz.gsFussBis
        ? { t: "Abruf – Team geht zu Fuß zum Einsatzort", d: "Der Hubschrauber bleibt im Bereitstellungsraum stehen. Bei der Einsatzleitung melden, dort wird euch ein Patient zugeteilt.", eta: mmss(fussRest), etaT: "Fußweg" }
        : { t: fz.gsAmBr ? "Bei der Einsatzleitung – Patient wird zugeteilt" : "Abruf durch die Einsatzleitung", d: hinweis?.text ?? "Die Einsatzleitung teilt euch einen Patienten zu." },
      { t: `Patient ${e?.gsKind ? `P-${String(e.gsKind.nr).padStart(2, "0")}` : ""} versorgen, dann entscheiden und buchen`.replace("  ", " "), d: `Status 4 erst, wenn der Patient im Hubschrauber ist.${gs?.voraviso.length ? " Die Einsatzleitung hat ein Voraviso an die Krankenhäuser geschickt." : ""}` },
      { t: "Landung am Krankenhaus – dann Status 5", d: khName ? `Ziel ${khName}${kh && khLandung(kh) ? "" : " – kein eigener Landeplatz"}.` : "Ziel siehe Buchung.", eta: etaFlug, etaT: "bis zur Landung" },
      { t: "Rückflug zum Stützpunkt – dort Status 1", d: "Du bist frei über Funk und kannst unterwegs wieder alarmiert werden.", eta: etaFlug, etaT: `bis ${fz.stationName}` },
    ][gi] as Record<string, string>;
  } else if (fz) {
    next = [
      { t: "Bereitschaft am Stützpunkt", d: "Warte auf die Alarmierung durch die Leitstelle. Der Melder klingelt, sobald ein Einsatz kommt." },
      quittiert
        ? { t: "Abheben – dann Status 2", d: gtnBereit ? "Der Flugplan zum Einsatzort liegt im GTN750 bereit." : "Koordinaten unten kopieren oder als .pln laden.", eta: minuten(flugSek(mZiel)), etaT: "Flug zum Einsatzort" }
        : { t: "Alarm quittieren (9)", d: "Der Melder läuft, bis du 9 oder 2 drückst. Danach abheben und Status 2.", eta: minuten(flugSek(mZiel)), etaT: "Flug zum Einsatzort" },
      { t: "Landen am Einsatzort – dann Status 3", d: rtw ? `${rtw.funkrufname} ${rtw.status === "amBO" ? "ist schon am Einsatzort" : "ist auf dem Weg"}.` : gsE ? (sim.pilotGsHinweis(fz)?.text ?? "") : "Kein bodengebundenes Rettungsmittel im Einsatz.", eta: etaFlug, etaT: "bis zur Landung" },
      !plan
        ? { t: "Entscheiden: Was passiert mit dem Patienten?", d: e?.gs && !e.gs.aufgehoben ? "Die Einsatzleitung teilt dir einen Patienten zu." : "Wähle unten Transport und Krankenhaus. Danach Status 4 (Transport) oder 6 (frei)." }
        : plan.art === "transport"
          ? { t: `Transport – dann Status 4`, d: `Patient an Bord? Dann abheben und Status 4 – Ziel ${khName || "laut Buchung"}.` }
          : plan.art === "uebergabe"
            ? { t: "Übergabe an den RTW – dann frei (6)", d: plan.naMit ? "Der Notarzt fährt im RTW mit, ihr fliegt leer nach – Status 4, wenn ihr abhebt." : "Der RTW transportiert allein – danach frei über Funk (6)." }
            : { t: "Kein Transport – frei über Funk (6)", d: "Dann zurück zum Stützpunkt." },
      { t: "Landung am Krankenhaus – dann Status 5", d: khName ? `Ziel ${khName}${kh && khLandung(kh) ? "" : " – kein eigener Landeplatz, Landung am Haus"}.` : "Ziel siehe Buchung.", eta: etaFlug, etaT: "bis zur Landung" },
      { t: "Übergabe – dann frei über Funk (6)", d: "Nach der Übergabe meldest du dich frei und fliegst zurück zum Stützpunkt." },
      { t: "Rückflug zum Stützpunkt – dort Status 1", d: "Du bist frei über Funk und kannst unterwegs wieder alarmiert werden.", eta: etaFlug, etaT: `bis ${fz.stationName}` },
    ][pi] as Record<string, string>;
  }

  // ---- Einsatz
  let ein: Record<string, unknown> | null = null;
  let fl: Record<string, string> | null = null;
  const fzs: Record<string, string>[] = [];
  const nav: Record<string, unknown>[] = [];
  if (fz && e) {
    const basis = gsE ?? e;
    const stufe = gs ? `Großeinsatz${gs.stufe ? ` ${gs.stufe}` : ""}` : (c?.stufe ?? "");
    ein = {
      nr: `${e.gsKind ? `Patient P-${String(e.gsKind.nr).padStart(2, "0")} · ` : ""}Nr. ${basis.nummer}${basis.protokoll[0] ? ` · seit ${uhrzeit(basis.protokoll[0].zeit)}` : ""}`,
      stufe,
      sf: gs ? "#6E1A1A" : c ? stufeFarbe(c.stufe) : "#6b7280",
      code: basis.code ?? "Code folgt",
      sw: stichwort(basis),
      zi: !!(zi.b || zi.t),
      ziB: zi.b,
      ziS: zi.b && zi.t ? " // " : "",
      ziT: zi.t,
      adr: G && gs?.br && gi <= 2 ? `BR: ${gs.br.label} · Einsatzort ${basis.adresse?.label ?? ""}` : (basis.adresse?.label ?? "Adresse folgt"),
      zusatz: e.zusatz ?? "",
      gsText: !G && gsE ? (sim.pilotGsHinweis(fz)?.text ?? "") : "",
    };
    if (G && gi >= 2 && gs?.br && basis.adresse) {
      const weg = distanceM(gs.br, basis.adresse);
      fl = { km: km1(weg), t: "BR → Einsatzort zu Fuß" };
    } else if (fz.status === "zumZO" && landung) fl = { km: km1(distanceM(fz, landung)), t: `ca. ${minuten(flugSek(distanceM(fz, landung)))} zum ${khName}` };
    else if (zielPos && mZiel > 150) fl = { km: km1(mZiel), t: G ? `ca. ${minuten(flugSek(mZiel))} zum BR` : `ca. ${minuten(flugSek(mZiel))} Flug` };
    // beteiligte Fahrzeuge (im Großeinsatz: du, Einsatzleitung, Leitung im BR und einige weitere)
    const alle = (gsE ?? e).fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && (x.einsatzId === (gsE ?? e).id || x.id === fz.id || (!!e.gsKind && x.einsatzId === e.id)));
    if (!alle.includes(fz)) alle.unshift(fz);
    const sortiert = gs ? [fz, ...alle.filter((x) => x.id === gs.el), ...alle.filter((x) => x.id === gs.brBel), ...alle.filter((x) => x !== fz && x.id !== gs.el && x.id !== gs.brBel).slice(0, 4)] : [fz, ...alle.filter((x) => x !== fz)];
    for (const x of [...new Set(sortiert)]) {
      const d = sim.statusDef(x.status);
      fzs.push({ s: d.nummer, f: stFarbe(d.nummer), t: `${x === fz ? x.kurzname || x.funkrufname : x.funkrufname}${x === fz ? " (du)" : gs && x.id === gs.el ? " (EL)" : gs && x.id === gs.brBel ? " (BR)" : ""}`, tip: d.name });
    }
    // Koordinaten: Bereitstellungsraum/Einsatzort und Landeplatz am Krankenhaus
    const zeile = (titel: string, lat: number, lon: number, name: string, zus = "") =>
      nav.push({ t: titel, k: koordText(lat, lon), kc: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, z: zus, kopie: () => void navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`).then(() => fenster?.k.toast("Koordinaten kopiert")), pln: () => void flugplanSpeichern(fz, { lat, lon, name }).then(() => fenster?.k.toast("Flugplan gespeichert – im MSFS auf der Weltkarte unter „Laden“ öffnen"), fehler) });
    if (ziel && ["alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO"].includes(fz.status)) zeile(ziel.label, ziel.lat, ziel.lon, ziel.label);
    if (kh) {
      const l = khLandung(kh);
      if (l) zeile(`Landeplatz ${khName}`, l.lat, l.lon, khName, kh.landeplatz && kh.landeplatz !== "kein" ? "" : "am Haus (kein eigener Landeplatz hinterlegt)");
    }
  }

  // ---- Großeinsatz: Bereitstellungsraum, Abruf, Zuteilung
  let gsD: Record<string, unknown> | null = null;
  if (fz && G && gs && gsE) {
    const w = gsE.wahr.gs;
    const pat = (w?.patienten ?? []).filter((x) => gs.gezeigt.includes(x.nr));
    const n = (s: string) => pat.filter((x) => x.sichtung === s).length;
    const lebend = pat.filter((x) => x.sichtung !== "tot");
    const kindVon = (nr: number) => (gs.kinder[nr] ? sim.einsatz(gs.kinder[nr]) : undefined);
    const weg = lebend.filter((x) => {
      const k = kindVon(x.nr);
      return !!k && (k.zustand === "abgeschlossen" || k.fahrzeuge.some((id) => ["zumZO", "amZO"].includes(sim.state.fahrzeuge[id]?.status ?? "")));
    }).length;
    const gezeigt = gs.phase !== "alarm" && gs.phase !== "sicht";
    const kraefte = gsE.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x);
    const imBr = kraefte.filter((x) => x.phase === "wartetBR" && !x.gsFussBis && x.einsatzId === gsE.id);
    const abgerufen = kraefte.filter((x) => (x.gsFussBis || x.gsAmBr || (x.einsatzId !== gsE.id && gs.ziel[x.id] === "bo")) && (gs.brAlarm ?? []).includes(x.id));
    const anfahrt = kraefte.filter((x) => gs.ziel[x.id] === "br" && x.phase !== "wartetBR" && x.einsatzId === gsE.id);
    const liste = [
      ...abgerufen.map((x) => ({ nr: "–", t: `${x.funkrufname}${x === fz ? " (du)" : ""}`, z: "abgerufen", c: x === fz ? "du weg" : "weg" })),
      ...imBr.map((x, i) => ({ nr: String(i + 1), t: `${x.funkrufname}${x === fz ? " (du)" : ""}`, z: x === fz ? "wartet – du" : "wartet", c: x === fz ? "du" : "" })),
      ...anfahrt.slice(0, 4).map((x) => ({ nr: "", t: `${x.funkrufname}${x === fz ? " (du)" : ""}`, z: x.fahrt ? `Anfahrt · ca. ${minuten(Math.max(0, x.fahrt.start / 1000 + x.fahrt.dauer - t / 1000))}` : "Anfahrt", c: x === fz ? "du" : "" })),
      ...(anfahrt.length > 4 ? [{ nr: "", t: `und ${anfahrt.length - 4} weitere`, z: "Anfahrt", c: "weg" }] : []),
    ].map((r, d) => ({ ...r, d, cls: "pv-brz" + (r.c ? ` ${r.c}` : "") }));
    const el2 = gs.el ? sim.state.fahrzeuge[gs.el] : undefined;
    const brl = gs.brBel ? sim.state.fahrzeuge[gs.brBel] : undefined;
    const fussPct = (() => {
      if (!fz.gsFussBis) return 0;
      const wegM = gs.br && gsE.adresse ? distanceM(gs.br, gsE.adresse) * 1.25 : 500;
      const dauer = Math.max(60, wegM / 2.6) * 1000;
      return Math.max(2, Math.min(100, Math.round(((t - (fz.gsFussBis - dauer)) / dauer) * 100)));
    })();
    const kind = e?.gsKind ? (w?.patienten ?? []).find((x) => x.nr === e.gsKind!.nr) : undefined;
    const SN: Record<string, string> = { rot: "rot", gelb: "gelb", gruen: "grün", tot: "tot" };
    gsD = {
      br: gi >= 2,
      gruppe: gruppeGs,
      abruf: gi === 3 ? { t: sim.pilotGsHinweis(fz)?.text ?? "Abruf durch die Einsatzleitung.", pct: fussPct ? String(fussPct) : "" } : null,
      zug: e?.gsKind ? { p: `P-${String(e.gsKind.nr).padStart(2, "0")}`, f: SICHT_FARBE[kind?.sichtung ?? "rot"][0], t: `Zugeteilt von der Einsatzleitung${kind ? ` · Sichtung ${SN[kind.sichtung]}` : ""}${kind?.muster ? ` · ${kind.muster}` : ""}` } : null,
      zahlen: gezeigt
        ? [
            { f: "#E5484D", n: String(n("rot")), t: "rot" },
            { f: "#F5A524", n: String(n("gelb")), t: "gelb" },
            { f: "#4CC38A", n: String(n("gruen")), t: "grün" },
            { f: "#6B7385", n: String(n("tot")), t: "tot" },
            { f: "#3B8BFF", n: `${weg}/${lebend.length}`, t: "abtransportiert" },
          ]
        : null,
      det: gi <= 3,
      werte: [
        { l: "Bereitstellungsraum", v: gs.br?.label ?? "wird noch festgelegt" },
        ...(gs.br && gsE.adresse ? [{ l: "Zum Einsatzort", v: `${km1(distanceM(gs.br, gsE.adresse))} · zu Fuß ca. ${minuten(Math.max(60, (distanceM(gs.br, gsE.adresse) * 1.25) / 2.6))}` }] : []),
        { l: "Einsatzleitung", v: el2 ? `${el2.funkrufname}${gs.bel ? " · BEL" : ""}` : "noch keine" },
        { l: "Leitung im BR", v: brl ? brl.funkrufname : "–" },
      ],
      liste: liste.length ? liste : null,
    };
  }

  // ---- Patient
  let patZu = "";
  const pats: Record<string, unknown>[] = [];
  let patVerlauf: { z: string; t: string }[] = [];
  if (fz && e) {
    const am = ["amBO", "zumZO", "amZO"].includes(fz.status);
    if (G && !e.gsKind) patZu = "Der Patient wird euch von der Einsatzleitung zugeteilt.";
    else if (!am) patZu = `Was der Patient hat, siehst du am Einsatzort (Status 3).${e.meldung?.text ? ` Meldung: „${e.meldung.text}“` : ""}`;
    else if (e.gs && !e.gs.aufgehoben) patZu = "Großeinsatz – die Einsatzleitung teilt dir einen Patienten zu.";
    else {
      const l = e.wahr.lage;
      const verdacht = e.wahr.verdacht ? buchungName(e.wahr.verdacht) : "";
      const BW: Record<string, string> = { ja: "wach", getruebt: "eingetrübt", nein: "bewusstlos" };
      const AT: Record<string, string> = { normal: "normal", abnorm: "auffällig", agonal: "Schnappatmung", keine: "keine Atmung" };
      const kind = e.gsKind && gsE ? (gsE.wahr.gs?.patienten ?? []).find((x) => x.nr === e.gsKind!.nr) : undefined;
      const liste = (l?.patienten ?? []).length ? (l?.patienten ?? []) : kind ? [{ alter: kind.alter, geschlecht: kind.geschlecht, sichtung: kind.sichtung === "tot" ? "rot" : kind.sichtung, bw: kind.bw ?? "ja", at: kind.at ?? "normal" }] : [];
      for (const x of liste) {
        const sicht = kind?.sichtung ?? x.sichtung;
        const [sf, sc] = SICHT_FARBE[sicht] ?? SICHT_FARBE.gelb;
        const wer = `${x.alter < 14 ? "Kind" : x.geschlecht === "w" ? "Frau" : "Mann"}, ${kind ? "ca. " : ""}${x.alter} J.`;
        pats.push({
          s: sicht === "gruen" ? "grün" : sicht,
          sf,
          sc,
          t: `${kind ? `P-${String(kind.nr).padStart(2, "0")} · ` : ""}${wer}${verdacht ? ` · Verdacht: ${verdacht}` : kind ? ` · ${kind.muster}` : ""}`,
          l: kind ? `${e.meldung.text}` : l?.fall?.kern ? `Lagebild: ${l.fall.kern}` : "",
          // für das Tablet einzeln (Patienten-Reiter)
          nr: kind ? `P-${String(kind.nr).padStart(2, "0")}` : "",
          wer: `${x.alter < 14 ? "Kind" : x.geschlecht === "w" ? "Frau" : "Mann"}, ${kind ? "ca. " : ""}${x.alter} Jahre`,
          vd: verdacht || kind?.muster || "",
          lage: kind ? "" : (l?.fall?.kern ?? ""),
          vit: [
            { k: "Bewusstsein", w: BW[x.bw] ?? x.bw, g: x.bw === "ja" ? 0 : x.bw === "getruebt" ? 1 : 2 },
            { k: "Atmung", w: AT[x.at] ?? x.at, g: x.at === "normal" ? 0 : x.at === "abnorm" ? 1 : 2 },
          ],
          bit: !!l?.bit,
          rolle: kind?.rolle ?? "",
          muster: kind?.muster ?? "",
          fw: !!kind?.fw && (gsE?.gs?.erreichbar[kind.nr] ?? 0) > sim.state.zeit,
          versorgt: kind ? (sim.pilotGsHinweis(fz)?.text ?? "").replace(/^.*?\. (?=Patient wird|Versorgt)/, "") : "",
          fakt: kind ? [] : wahreFakten(e),
          v: [
            { t: `Bewusstsein: ${BW[x.bw] ?? x.bw}`, c: x.bw === "ja" ? "" : "w" },
            { t: `Atmung: ${AT[x.at] ?? x.at}`, c: x.at === "normal" ? "" : "w" },
            ...(l?.bit ? [{ t: "sehr schwer (ca. 150 kg+) – Transport braucht BIT", c: "w" }] : []),
          ],
        });
      }
      if (!pats.length) patZu = findCode(e.code ?? undefined)?.beschreibung ?? "Keine weiteren Angaben.";
      patVerlauf = (l?.verlauf ?? []).slice(-3).map((v) => ({ z: uhrzeit(v.zeit), t: v.text }));
    }
  }

  // ---- Entscheidung und Krankenhaus
  const ent = fz && e ? entscheidungDaten(fz, e) : null;
  const planT = plan && e && fz ? `${planText(plan)}${fz.status === "amBO" ? (plan.art === "transport" || (plan.art === "uebergabe" && plan.naMit) ? " · danach Status 4" : " · danach Status 6") : ""}` : "";

  // ---- Einsatzverlauf (neueste oben); die Notrufabfrage zum Aufklappen
  const prot = e?.protokoll ?? [];
  const ab = prot.length > 60 ? prot.length - 60 : 0;
  let verlauf = prot
    .slice(ab)
    .map((x, i) => {
      const m = /^\*\*\* (.+?): [^*]*\*\*\*\n?([\s\S]*)$/.exec(x.text);
      if (m) {
        const zeilen = m[2].split("\n").filter(Boolean);
        return { z: uhrzeit(x.zeit), key: `${e!.id}-${ab + i}`, abf: zeilen.map((tt, d) => ({ t: tt, d })), abfN: zeilen.length, abfArt: m[1], t: "", von: "" };
      }
      return { z: uhrzeit(x.zeit), t: x.text, von: x.von ?? "", abf: null };
    })
    .reverse();
  if (!verlauf.length) verlauf.push({ z: "–", t: "Noch keine Ereignisse – sobald ein Einsatz vorliegt, stehen sie hier.", von: "", abf: null });

  // ---- Übungsflug ohne Flugsimulator
  const f = fz?.fahrt;
  const rest = f ? Math.max(0, f.start / 1000 + f.dauer - t / 1000) : 0;
  const ueb = frisch
    ? { text: "Aus – die Position kommt aus dem Flugsimulator.", flug: null, knoepfe: [] }
    : {
        text: `Ohne Simulator fliegt der Hubschrauber hier eine gerade Linie mit ${sim.settings.nahGeschwindigkeit} km/h.`,
        flug: f && fz ? { ziel: fz.pilot?.flugZiel ?? "Flug", rest: minuten(rest) } : null,
        knoepfe: fz
          ? [
              ...(f ? [{ t: "Anhalten", klick: () => void befehl(sim.call("pilotFliegen", fz.id, null)) }] : []),
              { t: ziel?.br ? "Zum Bereitstellungsraum" : "Zum Einsatzort", aus: !ziel, klick: () => void befehl(sim.call("pilotFliegen", fz.id, "bo")) },
              { t: "Zum Zielkrankenhaus", aus: !e?.kh, klick: () => void befehl(sim.call("pilotFliegen", fz.id, "zo")) },
              { t: "Zum Stützpunkt", klick: () => void befehl(sim.call("pilotFliegen", fz.id, "heim")) },
              {
                t: "Punkt auf der Karte …",
                klick: () => {
                  punktWaehlen = true;
                  karteGross(true);
                },
              },
            ]
          : [],
      };
  // Zeitraffer: mit Flugsimulator nur am Boden, und weg vom Stützpunkt nur mit Zustimmung
  let zeitraffer = tempo > 1 ? `Leitstelle: Zeitraffer ×${tempo}${bremse ? ` – gebremst auf 1× (${bremse})` : ""}.` : "Leitstelle: kein Zeitraffer.";
  let zeitKnopf: Record<string, unknown> | null = null;
  if (fz && p && frisch) {
    const d = flugsim.daten;
    if (d && !d.am_boden) zeitraffer = "Zeitraffer aus, solange du fliegst.";
    else if (daheim) zeitraffer = "Am Stützpunkt: Zeitraffer erlaubt.";
    else zeitKnopf = { t: p.zeitOk ? "Zeitraffer erlaubt – sperren" : "Zeitraffer erlauben", an: !!p.zeitOk, klick: () => void befehl(sim.call("pilotZeit", fz.id, !p.zeitOk)) };
  } else if (fz && !frisch) zeitraffer = `Übungsflug: der Zeitraffer läuft mit. ${zeitraffer}`;

  // ---- Update (wie in der Kopfleiste, mit Hinweis für den Piloten)
  const u = updateInfo();
  let upd: Record<string, unknown> | null = null;
  if (u) {
    const s = updateStand();
    const lad = s?.phase === "laedt";
    const fertig = s?.phase === "fertig";
    const fehl = s?.phase === "fehler";
    const pct = s && s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
    const neu = (u.notes ?? "")
      .split(/\n+/)
      .map((x) => x.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    const heliName = fz ? fz.kurzname || fz.funkrufname : "Dein Hubschrauber";
    upd = {
      da: true,
      knopf: lad ? `Lädt … ${pct} %` : fertig ? "Startet neu …" : fehl ? "Update fehlgeschlagen" : `Update ${u.version}`,
      tip: lad ? `Update ${u.version} wird geladen – du fliegst weiter` : `Neue LeitWerk-Version ${u.version}`,
      titel: lad ? "Update wird geladen" : fertig ? "Update ist installiert" : fehl ? "Update fehlgeschlagen" : `Update ${u.version} verfügbar`,
      unter: `Du spielst ${u.current} · neu ist ${u.version}`,
      hatNeu: neu.length > 0,
      neu: neu.map((x) => ({ t: x })),
      istLaedt: lad,
      pct,
      ladT: s && s.total > 0 ? `Update wird geladen · ${mb(s.done)} von ${mb(s.total)} MB · du spielst weiter` : "Verbinde …",
      info: fertig
        ? "LeitWerk startet jetzt neu und ist danach auf der neuen Version."
        : lad
          ? "Du kannst weiterspielen. Sobald das Update geladen ist, startet LeitWerk von selbst neu."
          : fehl
            ? `Das Update konnte nicht geladen werden: ${s?.fehler ?? "unbekannter Fehler"}`
            : "LeitWerk lädt die neue Version im Hintergrund, du spielst weiter. Danach wird sie installiert und LeitWerk startet von selbst neu.",
      infoCls: `kl-uinfo kl-z${fehl ? " rot" : ""}`,
      mp: mp.status.rolle !== "aus" && !fertig,
      mpT: `Beim Neustart ist ${heliName} kurz ohne Pilot – die Leitstelle übernimmt ihn, bis du wieder beitrittst. Der Host braucht dieselbe Version.`,
      knoepfe: !fertig,
      spaeter: fehl || lad ? "Schließen" : "Später",
      spaeterAktion: fehl ? () => updateStandZuruecksetzen() : null,
      ok: fehl ? "Nochmal versuchen" : lad ? "Lädt …" : "Laden und neu starten",
      okCls: `kn sm prim${lad ? " aus" : ""}`,
      okAktion: lad ? null : () => void updateImHintergrund(sim.pilotTest ? () => jetztSichern() : undefined),
    };
  }

  // ---- Überstellung (KT/SEK) statt Notfalleinsatz
  const kt = fz && !e ? sim.pilotKt(fz) : null;
  if (fz && kt) {
    const k = kt.k;
    const d = k.d;
    const c = ktCode(d.code)?.name ?? "";
    const zeit = d.zeitVorgabe === "termin" && d.termin ? `Termin ${uhrzeit(d.termin)}` : d.abholung ? `Abholung ${uhrzeit(d.abholung)}` : d.sofort ? "sofort" : "";
    const weg = distanceM(fz, kt.ziel);
    const vonN = d.von?.label ?? "Abholort";
    const nachN = d.nach?.label ?? "Ziel";
    if (alarmOffen) alarm = { t: `${d.code ? `${d.code} · ` : ""}Überstellung ${k.nummer}`, s: `${vonN} → ${nachN} · ${km1(weg)} · ca. ${minuten(flugSek(weg))} Flug`, ziB: "", ziT: "" };
    const quitt = fz.status === "alarmiert";
    const eta = ank ? mmss(ank.min * 60) : "";
    next =
      ALARM_ST.includes(fz.status)
        ? quitt
          ? { t: "Abheben – dann Status 2", d: `Ziel ist der Abholort: ${vonN}.`, eta: minuten(flugSek(weg)), etaT: "Flug zum Abholort" }
          : { t: "Alarm quittieren (9)", d: "Überstellung – der Melder läuft, bis du 9 oder 2 drückst.", eta: minuten(flugSek(weg)), etaT: "Flug zum Abholort" }
        : fz.status === "zumBO"
          ? { t: "Landen am Abholort – dann Status 3", d: vonN, eta, etaT: "bis zur Landung" }
          : fz.status === "amBO"
            ? { t: "Patient übernehmen – dann Status 4", d: `Patient an Bord? Dann abheben und Status 4 – Ziel ${nachN}.` }
            : fz.status === "zumZO"
              ? { t: "Landen am Ziel – dann Status 5", d: nachN, eta, etaT: "bis zur Landung" }
              : { t: "Übergabe – dann frei über Funk (6)", d: "Nach der Übergabe meldest du dich frei und fliegst zurück zum Stützpunkt." };
    phasen.i = ALARM_ST.includes(fz.status) ? 1 : phaseVon(fz, undefined);
    ein = {
      nr: `Überstellung ${k.nummer}${zeit ? ` · ${zeit}` : ""}`,
      stufe: d.sofort ? "Sekundär · sofort" : "Sekundär",
      sf: d.sofort ? "#B4232A" : "#2F6FB5",
      code: d.code ?? "Code folgt",
      sw: c || d.grund || "Überstellung",
      zi: false,
      ziB: "",
      ziS: "",
      ziT: "",
      adr: `${vonN} → ${nachN}`,
      zusatz: [d.patient.name, d.patient.alter !== null && d.patient.alter !== undefined ? `${d.patient.alter} J.` : "", d.grund, d.patient.info].filter(Boolean).join(" · "),
      gsText: kt.alle.length > 1 ? `Mehrfachtransport: ${kt.alle.length} Patienten` : "",
    };
    fl = weg > 150 ? { km: km1(weg), t: `ca. ${minuten(flugSek(weg))} ${kt.art === "ab" ? "zum Abholort" : "zum Ziel"}` } : null;
    fzs.push({ s: sim.statusDef(fz.status).nummer, f: stFarbe(sim.statusDef(fz.status).nummer), t: `${fz.kurzname || fz.funkrufname} (du)`, tip: sim.statusDef(fz.status).name });
    const zeile = (titel: string, o: { lat: number; lon: number }, name: string) =>
      nav.push({ t: titel, k: koordText(o.lat, o.lon), kc: `${o.lat.toFixed(6)}, ${o.lon.toFixed(6)}`, z: "", kopie: () => void navigator.clipboard?.writeText(`${o.lat.toFixed(6)}, ${o.lon.toFixed(6)}`).then(() => fenster?.k.toast("Koordinaten kopiert")), pln: () => void flugplanSpeichern(fz, { lat: o.lat, lon: o.lon, name }).then(() => fenster?.k.toast("Flugplan gespeichert – im MSFS auf der Weltkarte unter „Laden“ öffnen"), fehler) });
    zeile(kt.art === "ab" ? "Abholort" : "Ziel", kt.ziel, kt.ziel.label);
    if (kt.art === "ab" && d.nach) {
      const h = d.nach.khId ? store.get("hospitals", d.nach.khId) : undefined;
      const l = h ? (khLandung(h) ?? h) : d.nach;
      zeile("Ziel", l, nachN);
    }
    verlauf = k.protokoll
      .slice(-40)
      .map((x) => ({ z: uhrzeit(x.zeit), t: x.text, von: x.von ?? "", abf: null }))
      .reverse() as typeof verlauf;
    patZu = `${d.patient.name || "Patient"}${d.lage ? ` · ${d.lage}` : ""}${d.sek?.beatmet ? " · beatmet" : ""}${d.sek?.instabil ? " · instabil" : ""}${d.sek?.arzt ? " · mit Notarzt" : ""}${d.infektion ? " · Infektion" : ""}`;
  }

  return {
    heli: fz ? { name: fz.kurzname || fz.funkrufname, zeile: `${fz.funkrufname} · ${fz.stationName}` } : { name: "Kein Hubschrauber", zeile: "Logo › Hubschrauber wechseln" },
    st: { n: stN, t: st ? (ST_LANG[st.key] && st.key !== "alarmiert" ? ST_LANG[st.key] : st.name) : "–", f: stFarbe(stN), tip: st ? `Status ${st.nummer} · ${st.name}` : "" },
    uhr: new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    wx: { ic: wk.symbol, lang: `${wk.kurz} ${wk.grad} · Böen ${j?.boeen ?? 0} km/h`, grad: wk.grad, flug },
    zr,
    verb: verbindung(),
    upd,
    fehlerIn: [
      ["Programm", "Version, Fenstergröße, Pilotenansicht"],
      ["Flugsimulator", "Verbindung MSFS, H145-Tablet und -Funkgerät, letzte Position"],
      ["Letzte Meldungen und Fehler", "die letzten Einträge aus dem Protokoll"],
      ["Protokoll dieser Sitzung", "Log-Datei: Funk, Einsätze, Warnungen"],
      ["Einsatz und Status", "dein Hubschrauber, Status, Patient, Buchung"],
      ["Einstellungen", "ohne KI-Schlüssel und Zugangsdaten"],
    ].map(([tt, z]) => ({ t: tt, z })),
    spiel: [
      { ic: IC.zahnrad, t: "Einstellungen", i: "Funk, Tasten, Handy, Alarmtöne, Flugsimulator", klick: () => einstellungenSeite("pilot") },
      { ic: "M4 8h13l-3-3M20 16H7l3 3", t: "Hubschrauber wechseln", i: "Einen anderen Hubschrauber übernehmen", klick: () => void wechseln() },
      ...(sim.pilotTest ? [{ ic: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10", t: "Testmenü", i: "Einsatz oder Großeinsatz an dich senden", klick: () => testMenue() }] : []),
      { ic: IC.tuer, t: "Zum Hauptmenü", i: fz ? `${fz.kurzname || fz.funkrufname} geht zurück an die Leitstelle` : "Spiel verlassen", gefahr: true, klick: () => void pilotVerlassen() },
    ],
    warte: warteText(fz),
    alarm,
    gs: G ? gsD : null,
    phasen,
    stl,
    cockpit: cockpitDaten(fz),
    ueb,
    zeitraffer,
    zeitKnopf,
    test: sim.pilotTest,
    next,
    ein,
    fl,
    fzs,
    nav,
    patZu,
    pats,
    patVerlauf,
    ent,
    planT,
    verlauf,
    folgen,
    punktWaehlen,
  };
}

/** „Was passiert mit dem Patienten?“ und die Buchung in vier Schritten (Altersgruppe · Symptom · Dringlichkeit · Vorschlag) */
function entscheidungDaten(fz: SimFahrzeug, e: Einsatz): Record<string, unknown> | null {
  // Großeinsatz ohne zugeteilten Patienten: noch nichts zu entscheiden
  if (fz.status !== "amBO" || (e.gs && !e.gs.aufgehoben)) return null;
  const p = fz.pilot?.plan ?? null;
  zwVorbelegen(e, p);
  const rtw = e.fahrzeuge.some((id) => {
    const x = sim.state.fahrzeuge[id];
    return !!x && x.einsatzId === e.id && sim.transportfaehig(x);
  });
  const setzen = (pl: PilotPlan) => void befehl(sim.call("pilotPlan", fz.id, pl));
  const neu = () => planen();
  const grund = zw.sym ? zuweisungId(zw.sym.id, zw.dring, zw.alter) : "";
  const gebuchtId = p && p.art !== "kein" ? p.hospitalId : undefined;
  const ALT: Record<Altersgruppe, [string, string]> = { kleinkind: ["Kleinkind", "unter 1 Jahr"], kind: ["Kind", "1 – 17"], erwachsener: ["Erwachsener", "18 +"] };
  const DR: Record<number, [string, string]> = { 10: ["stabil", "Notaufnahme"], 20: ["dringend", "rasch versorgen"], 30: ["Schockraum", "Intensiv"] };
  const rtwFehlt = planSeite !== "nah" && planSeite !== "kein" && !rtw;
  // Symptom: Suche oder Vorschläge aus dem Lagebild
  const q = zw.q.trim();
  const vorschlaege: Symptom[] = [];
  const v = e.verdacht ?? e.wahr.verdacht ?? "";
  if (v) {
    const z = zuweisungLesen(v);
    const s = z?.s ?? (v.startsWith("bu_") ? symptom(symptomAusDiagnose(v)) : undefined);
    if (s) vorschlaege.push(s);
  }
  const treffer = q ? symptomSuche(q, 8) : vorschlaege;
  const waehleSym = (s: Symptom) => {
    zw.sym = s;
    zw.q = "";
    zw.dring = dringlichkeitFuer(s, zw.dring);
    zw.schritt = 3;
    neu();
  };
  // Krankenhäuser: passende, die jetzt aufnehmen; „Andere Häuser“: Namenssuche über alle
  const khs: Record<string, unknown>[] = [];
  for (const k of khListe(fz, e, grund)) {
    const fm = k.km * 1000;
    khs.push({
      id: k.h.id,
      n: k.h.kurzname || k.h.name,
      km: `${k.km.toFixed(0)} km`,
      min: planSeite === "nah" ? ` · ${minuten(flugSek(fm))} Flug` : "",
      merk: [
        ...(k.eignung ? [{ t: k.eignung === "passend" ? "passend" : k.eignung === "ausweich" ? "Ausweich" : "Rückfall", c: k.eignung === "passend" ? "ok" : "gelb" }] : []),
        ...(planSeite === "nah" ? [khLandung(k.h) ? { t: "Landeplatz", c: "" } : { t: "kein Landeplatz", c: "gelb" }] : []),
        ...((sim.einsatz((gsVon(e) ?? e).id)?.gs?.voraviso ?? []).includes(k.h.id) ? [{ t: "Voraviso", c: "ok" }] : []),
      ],
      frei: k.voll ? "voll" : k.frei || "",
      freiCls: k.voll ? "pill rot" : k.frei ? (/^0\//.test(k.frei) ? "pill gelb" : "pill ok") : "",
    });
  }
  if (zw.mehr && khSuche.trim()) {
    const qq = khSuche.trim().toLowerCase();
    for (const h of store
      .list("hospitals")
      .filter((h) => `${h.name} ${h.kurzname ?? ""} ${h.ort ?? ""}`.toLowerCase().includes(qq) && !khs.some((x) => x.id === h.id))
      .map((h) => ({ h, km: distanceM(fz, h) / 1000 }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8))
      khs.push({ id: h.h.id, n: h.h.kurzname || h.h.name, km: `${h.km.toFixed(0)} km`, min: planSeite === "nah" ? ` · ${minuten(flugSek(h.km * 1000))} Flug` : "", merk: [{ t: "von Hand gewählt", c: "" }], frei: "", freiCls: "" });
  }
  const KT = ["Altersgruppe", "Symptom", "Dringlichkeit", "Vorschlag"];
  const KF = ["Wie alt ist der Patient?", "Was hat der Patient?", "Wie dringend?", "Passende Krankenhäuser"];
  const KW = [ALT[zw.alter][0], zw.sym?.name ?? "–", zw.dring === 30 ? "Schockraum / Intensiv" : DR[zw.dring][0], ""];
  const schritt = Math.min(4, Math.max(1, zw.schritt));
  return {
    fuer: e.id,
    wahl: SEITEN.map((s) => ({ id: s.id, t: s.titel, d: s.text, on: planSeite === s.id, klick: () => ((planSeite = s.id), neu()) })),
    keinWahl:
      planSeite === "kein"
        ? (
            [
              ["kein", "Bleibt vor Ort", "kein Transport nötig"],
              ["revers", "Revers", "Transport verweigert"],
              ["tot", "Verstorben", "Tod durch den Notarzt festgestellt"],
            ] as const
          ).map(([g, tt, s]) => ({ id: g, t: tt, s, on: p?.art === "kein" && p.grund === g, klick: () => setzen({ art: "kein", grund: g }) }))
        : null,
    rtwFehlt,
    // Übergabe an den RTW: der RTW kann selbst buchen (Tablet: „Übergeben – RTW bucht selbst“ oder „Selbst buchen“)
    rtwWahl: (planSeite === "rtw" || planSeite === "naMit") && !rtwFehlt ? { on: p?.art === "uebergabe" && !p.hospitalId && !!p.naMit === (planSeite === "naMit") } : null,
    buchen: planSeite !== "kein" && !rtwFehlt,
    gebuchtId: gebuchtId ?? "",
    gebuchtT: gebuchtId && e.kh?.hospitalId === gebuchtId ? uhrzeit(e.kh.zeit) : "",
    schritte: [0, 1, 2, 3].map((i) => ({
      nr: String(i + 1),
      titel: KT[i],
      frage: KF[i],
      wert: KW[i],
      fertig: i + 1 < schritt,
      aktiv: i + 1 === schritt,
      offen: i + 1 > schritt,
      istAlter: i === 0,
      istSymptom: i === 1,
      istDringlich: i === 2,
      istVorschlag: i === 3,
      klick: () => ((zw.schritt = i + 1), neu()),
    })),
    altW: ALTERSGRUPPEN.map((a) => ({ id: a.id, t: ALT[a.id][0], s: ALT[a.id][1], on: zw.alter === a.id, klick: () => ((zw.alter = a.id), (zw.schritt = zw.sym ? 3 : 2), neu()) })),
    drW: DRINGLICHKEITEN.map((d) => ({ id: d.id, t: DR[d.id][0], s: DR[d.id][1], on: zw.dring === d.id, aus: !!zw.sym && !zw.sym.dringlichkeiten.includes(d.id), klick: () => ((zw.dring = d.id), (zw.schritt = 4), neu()) })),
    symQ: zw.q,
    symHinweis: q ? (treffer.length ? "" : "Kein Symptom gefunden.") : treffer.length ? "Aus dem Lagebild:" : "Symptom eintippen – Treffer erscheinen hier.",
    symW: treffer.map((s) => ({ id: s.id, t: s.name, kat: s.kategorie, klick: () => waehleSym(s) })),
    khLeer: !grund ? "Erst das Symptom wählen – dann kommen die passenden Häuser, die jetzt aufnehmen." : !khs.length ? "Kein passendes Haus nimmt gerade auf – „Andere Häuser“ durchsuchen." : "",
    khs,
    andereAuf: zw.mehr,
    andereQ: khSuche,
  };
}

/** Aktionen der Ansicht (Knöpfe der Vorlage) */
function ansichtAktionen(): Record<string, (...x: never[]) => unknown> {
  // Logo öffnet das Spielmenü (Modus Pilot: Weiterfliegen, Hubschrauber wechseln, Einstellungen, Zum Hauptmenü)
  const spielmenueAuf = () => spielmenue();
  const buchen = (hId: string) => {
    const fz = meinFz();
    if (!fz) return;
    const grund = zw.sym ? zuweisungId(zw.sym.id, zw.dring, zw.alter) : "";
    void befehl(sim.call("pilotPlan", fz.id, planSeite === "nah" ? { art: "transport", hospitalId: hId, grund: grund || undefined } : { art: "uebergabe", naMit: planSeite === "naMit", hospitalId: hId, grund: grund || undefined }));
  };
  return {
    spielmenue: spielmenueAuf,
    statusAn: (s: StatusKey) => statusHaltenStart(s),
    statusAb: (s: StatusKey) => statusHaltenEnde(s),
    sofortStatus: (s: StatusKey) => {
      funkTon("statusGesendet");
      pilotStatusDruecken(s);
    },
    // dieselben Einstellungen wie im Spielmenü (Seite „Pilot & Flugsimulator“ mit den Alarmtönen)
    einstellungen: () => einstellungenSeite("pilot"),
    testMenue: () => testMenue(),
    folgen: () => {
      folgen = !folgen;
      if (folgen) karteFolgen(true);
      planen();
    },
    gross: () => karteGross(!karteIstGross()),
    symSuche: (q: string) => {
      zw.q = q.slice(0, 60);
      planen();
    },
    andereSuche: (q: string) => {
      khSuche = q;
      planen();
    },
    andereUmschalten: () => {
      zw.mehr = !zw.mehr;
      planen();
    },
    khBuchen: (id: string) => buchen(id),
    /** Fehlerbericht als Ticket: Nummer oder Fehlertext */
    fehlerSenden: async (text: string, bilder: { name: string; inhalt: string }[]): Promise<{ nr?: number; fehler?: string }> => {
      try {
        return await fehlerTicketSenden(text, { zusatz: pilotBericht(), bilder });
      } catch (err) {
        return { fehler: String((err as Error)?.message ?? err) };
      }
    },
    bilderWaehlen: () => bilderWaehlen(),
    fehlerSpeichern: async (text: string): Promise<string | null> => {
      try {
        const pfad = await fehlerBerichtSpeichern(`${text}\n\n${pilotBericht()}`);
        return pfad ? (pfad.split(/[\\/]/).pop() ?? pfad) : null;
      } catch (err) {
        fehler(err);
        return null;
      }
    },
  } as unknown as Record<string, (...x: never[]) => unknown>;
}

/** Zusatz im Fehlerbericht: Flugsimulator und eigener Einsatz */
function pilotBericht(): string {
  const fz = meinFz();
  const e = einsatzVon(fz);
  const d = flugsim.daten;
  return [
    "## Pilot",
    "",
    `- Hubschrauber: ${fz ? `${fz.funkrufname} (${fz.kurzname || fz.funkrufname}), Status ${sim.statusDef(fz.status).nummer} ${sim.statusDef(fz.status).name}, Phase ${fz.phase}` : "keiner"}`,
    `- Einsatz: ${e ? `${e.nummer} ${e.code ?? ""} · ${stichwort(e)}${e.gsKind ? ` · Großeinsatz-Patient ${e.gsKind.nr}` : ""}` : "keiner"}`,
    `- Plan: ${planText(fz?.pilot?.plan) || "–"}`,
    `- Flugsimulator (${flugsim.quelle ?? "–"}): ${flugsim.zustand}${flugsim.text ? ` (${flugsim.text})` : ""}${d && datenFrisch() ? ` · ${Math.round(d.hoehe)} ft, ${Math.round(d.kts)} kt, ${d.am_boden ? "am Boden" : "in der Luft"}` : ""}`,
    `- H145-Tablet: ${hpg.zustand}${hpg.mission ? " · Mission eingerichtet" : ""} · Funkgerät: ${carlsAn() ? (hpg.zustand === "verbunden" ? "verbunden" : "wartet") : "aus"}`,
    `- GTN750: ${gtn.paket ? (gtnAn() ? "an" : "aus") : "nicht gefunden"}${gtn.fehler ? ` (${gtn.fehler})` : ""}`,
    `- Position: ${fz ? `${fz.lat.toFixed(5)}, ${fz.lon.toFixed(5)}` : "–"}`,
    "",
  ].join("\n");
}

/** „Hubschrauber wechseln“: abgeben, dann wählen */
async function wechseln(): Promise<void> {
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
  // Überstellung: Abholort bzw. Ziel
  const kt = fz && !e ? sim.pilotKt(fz) : null;
  if (fz && kt) {
    const z = { lat: kt.ziel.lat, lon: kt.ziel.lon, name: kt.ziel.label, art: kt.art === "ab" ? ("bo" as const) : ("kh" as const) };
    gtnBereitlegen(fz, z, kt.art === "ab" ? { bo: z } : { kh: z });
    xplaneFlugplanBereitlegen(fz, z);
    return;
  }
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
  xplaneFlugplanBereitlegen(fz, ziel);
}

function planText(p: PilotPlan | null | undefined): string {
  if (!p) return "";
  const kh = (id?: string) => {
    const h = id ? store.get("hospitals", id) : undefined;
    return h ? ` ins ${h.kurzname || h.name}` : "";
  };
  const grund = (g?: string) => (g ? ` (${buchungName(g)})` : "");
  if (p.art === "transport") return `NAH transportiert${kh(p.hospitalId)}${grund(p.grund)}`;
  if (p.art === "uebergabe") return `${p.naMit ? `NA fährt im RTW mit${kh(p.hospitalId)}, NAH fliegt leer nach` : `RTW fährt allein${kh(p.hospitalId)}`}${p.hospitalId ? grund(p.grund) : " – RTW bucht selbst"}`;
  return p.grund === "revers" ? "Kein Transport – Revers" : p.grund === "tot" ? "Patient verstorben" : "Kein Transport";
}

/** Auswahl am Berufungsort: wer transportiert (danach die Buchung wie in der Leitstelle) */
type PlanSeite = "nah" | "rtw" | "naMit" | "kein";
let planSeite: PlanSeite = "nah";
let khSuche = "";
/** Buchung wie in der Leitstelle: Stichwort → Alter → Dringlichkeit → Vorschläge */
/** Schritt im Assistenten: 1 Altersgruppe · 2 Symptom · 3 Dringlichkeit · 4 Vorschlag (wie in der Einsatzmaske) */
const zw: { fuer: string; sym?: Symptom; alter: Altersgruppe; dring: Dringlichkeit; q: string; mehr: boolean; schritt: number } = { fuer: "", alter: "erwachsener", dring: 20, q: "", mehr: false, schritt: 1 };
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
  // Symptom schon bekannt (Verdacht, Buchung): gleich bei den Vorschlägen beginnen
  zw.schritt = zw.sym ? 4 : 1;
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
    neu: handyNeu(fz, e),
  };
}

/**
 * Stand fürs neue Handy-Design (Entwurf „Handy“): dieselben Daten wie in der Pilotenansicht – Funktionen fallen beim
 * Übertragen (JSON) weg, die IDs bleiben für die Befehle („bu:…“, „gr:…“). Die alten Felder bleiben für die EFB-App.
 */
function handyNeu(fz: SimFahrzeug | undefined, e: Einsatz | undefined): Record<string, unknown> {
  const D = ansichtDaten() as Record<string, unknown> & { stl: { key: StatusKey }[] };
  const gr = sprechGruppe();
  const aktion = (k: StatusKey) => AKTIONEN.find((a) => a.status === k)?.id ?? "";
  return {
    st: D.st,
    uhr: new Date(sim.state.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }),
    gruppe: gruppenName(gr) || "RD-NOE-03",
    gruppeT: gr ? "Sprechgruppe Großeinsatz" : "Sprechgruppe",
    gruppeWechsel: true,
    // Wetter und Uhrzeit von LeitWerk für MSFS (setzt die EFB-App) und X-Plane (setzt das Plugin)
    wx: msfsWetter(),
    // TETRA-Funkgerät im X-Plane-Cockpit (Plugin): dieselbe Anzeige wie das CARLS
    tetra: fz ? carlsStand(fz) : null,
    keys: D.stl.map((x) => ({ ...x, aktion: aktion(x.key) })),
    alarm: D.alarm,
    ein: D.ein,
    fl: D.fl,
    fzs: D.fzs,
    nav: D.nav,
    gs: D.gs,
    patZu: D.patZu,
    pats: D.pats,
    ent: D.ent,
    planT: D.planT,
    abrufPunkt: !!(D.gs as { abruf?: unknown } | null)?.abruf,
    tab: tabletDaten(fz, e, D),
    amOrtText: fz && e && fz.status !== "amBO" ? (e.gs && !e.gs.aufgehoben ? "Buchen geht, sobald euch die Einsatzleitung einen Patienten zugeteilt hat." : "Buchen geht am Einsatzort (Status 3).") : fz && e && e.gs && !e.gs.aufgehoben ? "Buchen geht, sobald euch die Einsatzleitung einen Patienten zugeteilt hat." : "",
  };
}

/** Zeilenfarben der Fahrzeuge wie in den Listen der Leitstelle (ganze Zeile in Statusfarbe, Schrift dunkel) */
const ZEILE_FARBE: Record<string, string> = { "1": "#CDEFA0", "6": "#CDEFA0", A: "#F3EF7A", F: "#F3EF7A", "9": "#DCC23A", "2": "#F7D98C", "3": "#EBB36B", "4": "#ECD8ED", "5": "#D7AEE2", "7": "#DCDDE1", "8": "#FFFFFF", "0": "#E6E7EA" };
/** Karte im Tablet: alle Fahrzeuge zeigen (Umschalter in der Navigation, „ka:alle:1“) */
let tabletKarteAlle = false;

/** Peilung in Grad (0 = Norden) */
function peilung(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** Beantwortete Fragen der Notrufabfrage (Frage + Antwort, in der Reihenfolge der Abfrage) */
/**
 * Was der Notarzt vor Ort sieht: die wahren Antworten zur Notrufabfrage (nicht die des Anrufers).
 * Ohne Bewusstsein/Atmung, Alter, Geschlecht und Anzahl (stehen schon oben).
 */
function wahreFakten(e: Einsatz): { k: string; w: string; c: string }[] {
  const w = e.wahr.abfrage;
  const schema = store.schema;
  if (!w || !schema) return [];
  const a = { ...w.antworten, ...(w.roh ?? {}) };
  const OHNE = new Set(["bw", "at", "alter", "geschlecht", "anzahl_patienten"]);
  const fragen = new Map<string, Frage>();
  for (const { frage } of fragenImAblauf(schema, w.kapitel, w.antworten)) fragen.set(frage.id, frage);
  const out: { k: string; w: string; c: string }[] = [];
  for (const [id, f] of fragen) {
    if (OHNE.has(id) || f.typ === "kapitelwahl" || f.typ === "text") continue;
    const v = a[id];
    if (v === undefined || v === null || v === "" || v === "unbekannt") continue;
    out.push({ k: f.text, w: antwortLabel(f, v as string), c: "" });
  }
  return out.slice(0, 12);
}

function abfrageFragen(e: Einsatz): { f: string; a: string }[] {
  const a = e.abfrageStand;
  const schema = store.schema;
  if (!a || !schema) {
    // ohne Abfrage-Stand: die Sätze aus dem Protokoll
    const block = [...e.protokoll].reverse().find((x) => /^\*\*\* /.test(x.text));
    return block ? block.text.split("\n").slice(1).filter(Boolean).map((x) => ({ f: "", a: x.replace(/^\d+\./, "") })) : [];
  }
  const fragen = new Map<string, Frage>();
  for (const f of schema.globale_fragen.phase_3_was_ist_passiert ?? []) fragen.set(f.id, f);
  if (a.kapitel) for (const { frage } of fragenImAblauf(schema, a.kapitel, a.antworten)) fragen.set(frage.id, frage);
  const out: { f: string; a: string }[] = [];
  for (const [id, f] of fragen) {
    const w = a.antworten[id];
    if (w === undefined || w === null || w === "") continue;
    out.push({ f: f.text, a: antwortLabel(f, w as string) });
  }
  return out;
}

/**
 * Stand für die Einsatz-App im Tablet (EFB von MSFS und H145-Tablet, Seite efb.html): Kopf, Alarm, Einsatz,
 * Karte mit Route und Fahrzeugen, alarmierte Fahrzeuge, Abfrage, Patient. Entwurf „Einsatz-Interface“ (Paul 10.11.2026).
 */
function tabletDaten(fz: SimFahrzeug | undefined, e: Einsatz | undefined, D: Record<string, unknown>): Record<string, unknown> {
  const t = sim.state.zeit;
  const uhr = new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  if (!fz) return { uhr, heli: "Kein Hubschrauber", unter: "im Piloten-Interface wählen", ein: null };
  const st = sim.statusDef(fz.status);
  const kopf = { uhr, heli: fz.kurzname || fz.funkrufname, st: { n: st.nummer, t: st.name, f: ZEILE_FARBE[st.nummer] ?? st.farbe } };
  if (!e) {
    const kt = sim.pilotKt(fz);
    if (!kt) return { ...kopf, unter: `${fz.funkrufname} · ${fz.stationName}`, ein: null };
    // Überstellung (KT/SEK): Einsatz-Seite mit Abholort und Ziel, ohne Buchen
    const k = kt.k;
    const d = k.d;
    const De = (D.ein ?? {}) as Record<string, string>;
    const m = distanceM(fz, kt.ziel);
    const ank = sim.pilotAnkunft(fz);
    const kurs = flugsim.daten && datenFrisch() ? flugsim.daten.kurs : null;
    const zielPunkt = fz.status === "amBO" || fz.status === "amZO" ? null : { lat: kt.ziel.lat, lon: kt.ziel.lon, t: kt.ziel.label, kh: kt.art === "an" };
    const alarmOffen = ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status);
    const ja = (b?: boolean) => (b ? "ja" : "");
    const abf = [
      { f: "Patient", a: [d.patient.name, d.patient.alter !== null && d.patient.alter !== undefined ? `${d.patient.alter} Jahre` : ""].filter(Boolean).join(", ") },
      { f: "Grund", a: d.grund },
      { f: "Abholort", a: d.von?.label ?? "" },
      { f: "Ziel", a: d.nach?.label ?? "" },
      { f: "Zeit", a: d.zeitVorgabe === "termin" && d.termin ? `Termin ${uhrzeit(d.termin)}` : d.abholung ? `Abholung ${uhrzeit(d.abholung)}` : d.sofort ? "sofort" : "" },
      { f: "Lage", a: d.lage ?? "" },
      { f: "Notarzt", a: ja(d.sek?.arzt) },
      { f: "Beatmet", a: ja(d.sek?.beatmet) },
      { f: "Instabil", a: ja(d.sek?.instabil) },
      { f: "Infektion", a: ja(d.infektion) },
      { f: "Sauerstoff", a: ja(d.sauerstoff) },
      { f: "Hinweis", a: d.patient.info },
    ].filter((x) => x.a);
    return {
      ...kopf,
      unter: `Überstellung ${k.nummer}`,
      alarm: alarmOffen ? { zeit: uhrzeit(k.protokoll.filter((x) => /alarmiert/.test(x.text)).pop()?.zeit ?? t), quitt: fz.status === "alarmiert" } : null,
      ein: { nr: k.nummer, stufe: De.stufe ?? "Sekundär", sf: De.sf ?? "#2F6FB5", code: d.code ?? "Code folgt", sw: De.sw ?? "Überstellung", zi: d.grund ?? "", adr: `${d.von?.label ?? "Abholort"} → ${d.nach?.label ?? "Ziel"}`, zusatz: De.zusatz ?? "", gs: De.gsText ?? "" },
      fz: [{ s: st.nummer, f: ZEILE_FARBE[st.nummer] ?? "#E6E7EA", funk: st.nummer === "6", ruf: fz.kurzname || fz.funkrufname, typ: `${fz.rmTyp} · du`, txt: st.name, eta: ank ? minuten(ank.min * 60) : "", ich: true }],
      abf,
      gs: null,
      karte: {
        ich: { lat: +fz.lat.toFixed(5), lon: +fz.lon.toFixed(5), kurs: kurs === null ? null : Math.round(kurs), f: ZEILE_FARBE[st.nummer] ?? "#DCC23A" },
        ziel: zielPunkt,
        fz: [],
        alle: tabletKarteAlle,
        nav: zielPunkt && m > 150 ? { kurs: String(Math.round(peilung(fz, zielPunkt))).padStart(3, "0"), km: km1(m), min: minuten(flugSek(m)), an: ank ? new Date(t + ank.min * 60000).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "" } : null,
        text: fz.status === "amBO" ? "am Abholort" : fz.status === "amZO" ? "am Ziel" : "",
      },
      buchenDa: false,
      buchenText: "Überstellung – das Ziel steht fest, kein Buchen nötig.",
      plan: "",
      pat: null,
      patZu: String(D.patZu ?? ""),
    };
  }
  const c = findCode(e.code ?? undefined);
  const zi = zusatzInfo(e);
  const gsE = gsVon(e);
  const gs = gsE?.gs ?? null;
  const ein = {
    nr: e.nummer,
    stufe: gs ? `Großeinsatz${gs.stufe ? ` ${gs.stufe}` : ""}` : (c?.stufe ?? ""),
    sf: gs ? "#6E1A1A" : c ? stufeFarbe(c.stufe) : "#6b7280",
    code: (gsE ?? e).code ?? "Code folgt",
    sw: stichwort(gsE ?? e),
    zi: zi.b && zi.t ? `${zi.b} // ${zi.t}` : zi.b || zi.t,
    adr: (gsE ?? e).adresse?.label ?? "Adresse folgt",
    zusatz: e.zusatz ?? "",
    gs: (D.ein as { gsText?: string } | null)?.gsText ?? "",
  };
  // alarmierte Fahrzeuge, nach Eintreffzeit
  const basis = gsE ?? e;
  const alle = basis.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && (x.einsatzId === basis.id || x.id === fz.id || (!!e.gsKind && x.einsatzId === e.id)));
  if (!alle.includes(fz)) alle.unshift(fz);
  const restSek = (x: SimFahrzeug): number => {
    if (x === fz) {
      const a = sim.pilotAnkunft(fz);
      return a ? a.min * 60 : x.status === "amBO" ? 0 : 9e9;
    }
    if (x.status === "amBO" || x.status === "amZO") return 0;
    return x.fahrt ? Math.max(0, x.fahrt.start / 1000 + x.fahrt.dauer - t / 1000) : 9e9;
  };
  const fzl = [...new Set(alle)]
    .map((x) => {
      const d = sim.statusDef(x.status);
      const r = restSek(x);
      return {
        s: d.nummer,
        f: ZEILE_FARBE[d.nummer] ?? "#E6E7EA",
        funk: d.nummer === "F" || d.nummer === "6",
        ruf: x === fz ? x.kurzname || x.funkrufname : x.funkrufname,
        typ: `${x.rmTyp}${x === fz ? " · du" : ""}`,
        txt: `${d.name}${x.stationName && x !== fz ? ` · ${x.stationName}` : ""}`,
        eta: r > 0 && r < 9e8 ? minuten(r) : "",
        ich: x === fz,
        r,
      };
    })
    .sort((a, b) => a.r - b.r)
    .slice(0, gs ? 8 : 20);
  // Karte: eigener Hubschrauber, Ziel, Fahrzeuge (eigener Einsatz + andere NAH; auf Wunsch alle)
  const ziel = sim.pilotBo(fz);
  const kh = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const landung = kh ? khLandung(kh) : null;
  const zielPunkt = fz.status === "zumZO" && landung ? { lat: landung.lat, lon: landung.lon, t: kh!.kurzname || kh!.name, kh: true } : ziel && ["alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO"].includes(fz.status) ? { lat: ziel.lat, lon: ziel.lon, t: ziel.label, kh: false } : null;
  const kurs = flugsim.daten && datenFrisch() ? flugsim.daten.kurs : null;
  const fahrzeuge = Object.values(sim.state.fahrzeuge)
    .filter((x) => x.id !== fz.id && Number.isFinite(x.lat))
    .filter((x) => alle.includes(x) || x.rmTyp === "NAH" || (tabletKarteAlle && !["freiWache", "abgemeldet"].includes(x.status)))
    .slice(0, 400)
    .map((x) => {
      const d = sim.statusDef(x.status);
      return { lat: +x.lat.toFixed(5), lon: +x.lon.toFixed(5), ruf: x.funkrufname, s: d.nummer, f: ZEILE_FARBE[d.nummer] ?? "#E6E7EA", nah: x.rmTyp === "NAH", ein: alle.includes(x) };
    });
  const m = zielPunkt ? distanceM(fz, zielPunkt) : 0;
  const ank = sim.pilotAnkunft(fz);
  const karte = {
    ich: { lat: +fz.lat.toFixed(5), lon: +fz.lon.toFixed(5), kurs: kurs === null ? null : Math.round(kurs), f: ZEILE_FARBE[st.nummer] ?? "#DCC23A" },
    ziel: zielPunkt,
    fz: fahrzeuge,
    alle: tabletKarteAlle,
    nav: zielPunkt && m > 150 ? { kurs: String(Math.round(peilung(fz, zielPunkt))).padStart(3, "0"), km: km1(m), min: minuten(flugSek(m)), an: ank ? new Date(t + ank.min * 60000).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "" } : null,
    text: fz.status === "amBO" ? "am Einsatzort" : fz.status === "amZO" ? "am Krankenhaus" : "",
  };
  const alarmOffen = ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status);
  const buchung = handyBuchungStand(fz, e);
  // Großeinsatz: Auftrag, Schritt, Eckdaten, Lage (Zahlen), Bereitstellungsraum, Lagemeldungen
  let gsT: Record<string, unknown> | null = null;
  if (gsE && gs) {
    const gd = (D.gs ?? null) as { zahlen?: unknown; liste?: { nr: string; t: string; z: string; c: string }[] | null; abruf?: { pct: string } | null } | null;
    const gi = gsSchritt(fz, e);
    const hinweis = sim.pilotGsHinweis(fz);
    const schritt = e.gsKind ? 4 : gi < 0 ? (fz.status === "amBO" ? 3 : 0) : gi === 0 ? 0 : gi <= 2 ? 1 : fz.gsAmBr && fz.phase === "vorOrt" ? 3 : 2;
    const w = gsE.wahr.gs;
    const pat = (w?.patienten ?? []).filter((x) => gs.gezeigt.includes(x.nr));
    const n = (x: string) => String(pat.filter((p) => p.sichtung === x).length);
    const lebend = pat.filter((x) => x.sichtung !== "tot");
    const weg = lebend.filter((x) => {
      const k = gs.kinder[x.nr] ? sim.einsatz(gs.kinder[x.nr]) : undefined;
      return !!k && (k.zustand === "abgeschlossen" || k.fahrzeuge.some((id) => ["zumZO", "amZO"].includes(sim.state.fahrzeuge[id]?.status ?? "")));
    }).length;
    const el2 = gs.el ? sim.state.fahrzeuge[gs.el] : undefined;
    const brl = gs.brBel ? sim.state.fahrzeuge[gs.brBel] : undefined;
    gsT = {
      schritt,
      gruppe: gsGruppe(e),
      auftrag: hinweis?.text ?? "Großeinsatz – zum Einsatzort.",
      abruf: hinweis?.abruf ? { pct: gd?.abruf?.pct ?? "" } : null,
      werte: [
        ...(gs.ziel[fz.id] === "br" || gs.br ? [{ l: "Bereitstellungsraum", v: gs.br?.label ?? "wird noch festgelegt" }] : []),
        ...(gs.br && gsE.adresse ? [{ l: "Zum Einsatzort", v: `${km1(distanceM(gs.br, gsE.adresse))} · zu Fuß ca. ${minuten(Math.max(60, (distanceM(gs.br, gsE.adresse) * 1.25) / 2.6))}` }] : []),
        { l: "Einsatzleitung", v: el2 ? `${el2.funkrufname}${gs.bel ? " · BEL" : ""}${el2.id === fz.id ? " (du)" : ""}` : "noch keine" },
        ...(brl ? [{ l: "Leitung im BR", v: brl.funkrufname }] : []),
        { l: "Sprechgruppe", v: gsGruppe(e) },
      ],
      zahlen:
        gs.phase !== "alarm" && gs.phase !== "sicht"
          ? [
              { f: "#E5484D", n: n("rot"), t: "rot" },
              { f: "#F5A524", n: n("gelb"), t: "gelb" },
              { f: "#4CC38A", n: n("gruen"), t: "grün" },
              { f: "#6B7385", n: n("tot"), t: "tot" },
              { f: "#3B8BFF", n: `${weg}/${lebend.length}`, t: "abtransp." },
            ]
          : null,
      liste: gd?.liste ? gd.liste.map((r) => ({ nr: r.nr, t: r.t, z: r.z, c: String(r.c ?? "").includes("du") ? "du" : String(r.c ?? "").includes("weg") ? "weg" : "" })) : null,
      meld: gs.meldungen
        .filter((m) => m.art === "lage" || m.art === "sicht")
        .slice(-4)
        .map((m) => ({ z: uhrzeit(m.zeit), t: `${m.von}: ${m.text}` })),
    };
  }
  return {
    ...kopf,
    unter: `Einsatz ${e.nummer}`,
    alarm: alarmOffen ? { zeit: uhrzeit(e.protokoll.find((x) => /alarm/i.test(x.text))?.zeit ?? t), quitt: fz.status === "alarmiert" } : null,
    ein,
    fz: fzl.map(({ r: _r, ...x }) => x),
    abf: gsT ? [] : abfrageFragen(e),
    gs: gsT,
    karte,
    buchenDa: !!buchung.da,
    buchenText: buchung.da ? "" : String(buchung.text ?? ""),
    plan: D.planT ?? "",
    pat: buchung.da
      ? {
          liste: D.pats,
          verlauf: D.patVerlauf,
          meldung: e.meldung?.text ?? "",
          verdacht: e.wahr.verdacht ? buchungName(e.wahr.verdacht) : "",
          ziel: kh ? kh.kurzname || kh.name : "",
        }
      : null,
    patZu: buchung.da ? "" : String(D.patZu ?? ""),
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

/** Befehl vom Handy: „bu:schritt:2“, „gr:1“, „bu:seite:nah“, „bu:q:Text“, „bu:sym:id“, „bu:symweg“, „bu:alter:kind“, „bu:dring:30“, „bu:kh:id“, „bu:kein:revers“ */
function handyBuchen(b: string): void {
  // Sprechgruppe wechseln (Pfeile am Handy): „gr:1“ / „gr:-1“
  if (b.startsWith("gr:")) {
    sprechGruppeWeiter(b === "gr:-1" ? -1 : 1);
    return zeichneAlles();
  }
  // Tablet-Karte: alle Fahrzeuge an/aus („ka:alle:1“ / „ka:alle:0“)
  if (b.startsWith("ka:alle:")) {
    tabletKarteAlle = b === "ka:alle:1";
    return zeichneAlles();
  }
  const fz = meinFz();
  const e = einsatzVon(fz);
  if (!fz || !e || fz.status !== "amBO") return;
  zwVorbelegen(e, fz.pilot?.plan ?? null);
  const [, art, ...rest] = b.split(":");
  const wert = rest.join(":");
  const setzen = (pl: PilotPlan) => void befehl(sim.call("pilotPlan", fz.id, pl));
  if (art === "seite" && SEITEN.some((x) => x.id === wert)) planSeite = wert as PlanSeite;
  else if (art === "q") zw.q = wert.slice(0, 60);
  else if (art === "schritt" && /^[1-4]$/.test(wert)) zw.schritt = Number(wert);
  else if (art === "sym") {
    const x = symptom(wert);
    if (x) {
      zw.sym = x;
      zw.q = "";
      zw.dring = dringlichkeitFuer(x, zw.dring);
      zw.schritt = 3;
    }
  } else if (art === "symweg") {
    zw.sym = undefined;
    zw.schritt = 2;
  } else if (art === "alter" && ALTERSGRUPPEN.some((a) => a.id === wert)) {
    zw.alter = wert as Altersgruppe;
    zw.schritt = zw.sym ? 3 : 2;
  } else if (art === "dring" && DRINGLICHKEITEN.some((d) => String(d.id) === wert)) {
    zw.dring = Number(wert) as Dringlichkeit;
    zw.schritt = 4;
  }
  else if (art === "kein" && ["kein", "revers", "tot"].includes(wert)) setzen({ art: "kein", grund: wert as "kein" | "revers" | "tot" });
  else if (art === "rtwbucht" && (planSeite === "rtw" || planSeite === "naMit")) setzen({ art: "uebergabe", naMit: planSeite === "naMit" });
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
//
// Rechts unter der Karte (Vorlage: <div class="pv-funk">) hängt das Funk-Fenster des Disponenten mit rolle „pilot“
// (src/ui/fenster/funk: Funkgerät, Sprechtaste Leertaste, Funkregeln für den Piloten, Chat als Reiter).
// funkPlatzAktualisieren() gibt ihm den eigenen Status und die Sprechgruppe und liefert den Stand fürs Handy.

let funkFenster: FunkFenster | null = null;
let funkProps = "";

function funkPlatzBauen(): HTMLElement {
  const box = el("div", { class: "pvf-ew" });
  funkFenster = funkEinbinden(box, { rolle: "pilot", mitKopf: true });
  funkProps = "";
  return box;
}

/** Status und Sprechgruppe ans Funk-Fenster; gibt den Stand fürs Handy zurück (Sprechtaste, wer spricht) */
function funkPlatzAktualisieren(fz: SimFahrzeug | undefined, e: Einsatz | undefined): { knoepfe: { aktion: string; name: string }[]; kanal: string; sendet: boolean } {
  const ich = funkSendeZustand();
  const hoert = funkEmpfang();
  const sendet = sim.state.funkSendet;
  const gruppe = sprechGruppe();
  const belegt = sim.funkKanalBelegt(gruppe);
  const weg = funkUnterbrochen();
  const kanal = !ich && weg
    ? `Funk unterbrochen – ${weg}`
    : ich?.art === "sendet"
      ? `Du sprichst in ${gruppenName(gruppe) || "RD-NOE-03"} …`
      : ich?.art === "wartet"
        ? ich.belegt
          ? "Warten … nach dem Ende-Ton bist du dran"
          : "Kanal wird geprüft …"
        : hoert
          ? `${hoert.von === "LEO" ? `LEO (${hoert.wer})` : `${hoert.von} (${hoert.wer})`} spricht`
          : sendet
            ? `${sendet.von === "LEO" ? `LEO (${sendet.name})` : `${sendet.von} (${sendet.name})`} spricht`
            : belegt
              ? `Funk belegt – ${belegt.funkname} ↔ ${belegt.an?.funkname ?? "LEO"}`
              : "Funk frei";
  const knoepfe = fz ? [{ aktion: "funk", name: "Funk" }] : [];
  if (funkFenster) {
    const st = fz ? sim.statusDef(fz.status) : null;
    const status = st ? `${st.nummer} ${st.name}` : undefined;
    const gr = (gruppenName(sim.kanalVon(e)) || "RD-NOE-03").replace(/^RD-NOE-/, "");
    const k = `${status}|${gr}`;
    if (k !== funkProps) {
      funkProps = k;
      funkFenster.props({ status, gruppe: gr });
    }
  }
  return { knoepfe, kanal, sendet: ich?.art === "sendet" };
}

/** Funk-Einstellungen: Mikrofon, Spracherkennung, Lautstärken, Mithören */
function funkDialog(): void {
  const p = sprachPrefs();
  const body = el("div", { class: "plt-funkdlg" });
  body.innerHTML = `
    <label>Mikrofon<select class="plt-f-mikro"><option value="">Standard-Mikrofon</option></select></label>
    <div class="plt-f-testzeile"><button type="button" class="btn plt-f-test">Mikrofon testen</button> <span class="plt-leise plt-klein plt-f-testerg">Klicken und 4 Sekunden sprechen</span></div>
    <div class="plt-f-modell"></div>
    <label class="plt-check"><input type="checkbox" class="plt-f-klang" ${p.klangfilter ? "checked" : ""}> Funk-Klang (blechern, kurzes Rauschen beim Loslassen)</label>
    <label>Funkempfang Mitspieler (echte Disponenten und Piloten)<input type="range" min="0" max="150" step="5" class="plt-f-laut" value="${p.funkLaut}"></label>
    <label>Funkempfang KI (Fahrzeuge des Computers)<input type="range" min="0" max="150" step="5" class="plt-f-lautki" value="${p.funkLautKi ?? 100}"></label>
    <label>Funksenden (wie laut du bei den anderen ankommst)<input type="range" min="0" max="200" step="5" class="plt-f-sende" value="${p.funkSendeLaut ?? 100}"></label>
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
  const testKnopf = body.querySelector<HTMLButtonElement>(".plt-f-test")!;
  const testErg = body.querySelector<HTMLElement>(".plt-f-testerg")!;
  testKnopf.addEventListener("click", () => {
    testKnopf.disabled = true;
    testErg.textContent = "Aufnahme läuft – jetzt sprechen …";
    void mikroTesten()
      .then((t) => (testErg.textContent = t))
      .catch((e) => (testErg.textContent = `⚠ ${String((e as Error)?.message ?? e)}`))
      .finally(() => (testKnopf.disabled = false));
  });
  an(".plt-f-klang", (x) => setzeSprache({ klangfilter: x.checked }));
  an(".plt-f-laut", (x) => setzeSprache({ funkLaut: Number(x.value) }));
  an(".plt-f-lautki", (x) => setzeSprache({ funkLautKi: Number(x.value) }));
  an(".plt-f-sende", (x) => setzeSprache({ funkSendeLaut: Number(x.value) }));
  an(".plt-f-vorlesen", (x) => setzeSprache({ funkVorlesen: x.checked }));
  an(".plt-f-mit", (x) => setzeSprache({ mithoeren: x.checked }));
  an(".plt-f-mitlaut", (x) => setzeSprache({ mithoerenLaut: Number(x.value) }));
  openDialog({ title: "Sprechfunk", body, actions: [{ label: "Fertig", kind: "primary" }] });
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
      map.addSource("plt-fuss", { type: "geojson", data: leer() });
      map.addSource("plt-ziele", { type: "geojson", data: leer() });
      map.addSource("plt-heli", { type: "geojson", data: leer() });
      // Hubschrauber als Pfeil (einfarbig, Farbe = Status)
      map.addImage("plt-pfeil", pfeilBild(), { sdf: true, pixelRatio: 2 });
      // Route: nächster Abschnitt gestrichelt, der jetzige Abschnitt durchgezogen (wie im Entwurf)
      map.addLayer({ id: "plt-route", type: "line", source: "plt-route", layout: { "line-cap": "round" }, paint: { "line-color": "#6AA6FF", "line-width": 2.5, "line-dasharray": [2, 2], "line-opacity": 0.9 } });
      map.addLayer({ id: "plt-linie", type: "line", source: "plt-linie", layout: { "line-cap": "round" }, paint: { "line-color": "#3B8BFF", "line-width": 4, "line-opacity": 0.95 } });
      // Großeinsatz: Fußweg vom Bereitstellungsraum zum Einsatzort
      map.addLayer({ id: "plt-fuss", type: "line", source: "plt-fuss", layout: { "line-cap": "round" }, paint: { "line-color": "#F5A524", "line-width": 3.5, "line-dasharray": [0.6, 2] } });
      map.addLayer({
        id: "plt-ziele",
        type: "circle",
        source: "plt-ziele",
        paint: { "circle-radius": 8, "circle-color": ["get", "farbe"], "circle-stroke-color": "#111216", "circle-stroke-width": 2 },
      });
      map.addLayer({
        id: "plt-ziele-text",
        type: "symbol",
        source: "plt-ziele",
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [1, 0], "text-anchor": "left" },
        paint: { "text-color": istDunkel() ? "#C4CAD6" : "#3A4150", "text-halo-color": istDunkel() ? "#111216" : "#ffffff", "text-halo-width": 1.4 },
      });
      map.addLayer({ id: "plt-heli-hof", type: "circle", source: "plt-heli", paint: { "circle-radius": 17, "circle-color": ["get", "farbe"], "circle-opacity": 0.25 } });
      map.addLayer({
        id: "plt-heli",
        type: "symbol",
        source: "plt-heli",
        layout: { "icon-image": "plt-pfeil", "icon-rotate": ["get", "kurs"], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true },
        paint: { "icon-color": ["get", "farbe"], "icon-halo-color": "#111216", "icon-halo-width": 1.5 },
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
      planen();
      const fz = meinFz();
      if (fz) void befehl(sim.call("pilotFliegen", fz.id, { lat: ev.lngLat.lat, lon: ev.lngLat.lng, label: "Punkt auf der Karte" }));
    });
    map.on("dragstart", () => {
      if (!folgen) return;
      folgen = false;
      planen();
    });
  } catch (e) {
    console.warn("Pilotenkarte", e);
  }
}

/** Pfeil für den Hubschrauber (weiß, wird über icon-color in der Statusfarbe gezeichnet) */
function pfeilBild(): ImageData {
  const n = 44;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.translate(n / 2, n / 2);
  g.scale(n / 30, n / 30);
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(7, 8);
  g.lineTo(0, 4);
  g.lineTo(-7, 8);
  g.closePath();
  g.fillStyle = "#fff";
  g.fill();
  return g.getImageData(0, 0, n, n);
}

/** Kurs des Hubschraubers: aus dem Flugsimulator, sonst Richtung zum nächsten Ziel */
let letzterKurs = 0;
function kursVon(fz: SimFahrzeug): number {
  const d = flugsim.daten;
  if (d && datenFrisch()) return (letzterKurs = Math.round(d.kurs));
  const r = routePunkte[1];
  if (r && (Math.abs(r[0] - fz.lon) > 1e-4 || Math.abs(r[1] - fz.lat) > 1e-4)) {
    const y = Math.sin(((r[0] - fz.lon) * Math.PI) / 180) * Math.cos((r[1] * Math.PI) / 180);
    const x = Math.cos((fz.lat * Math.PI) / 180) * Math.sin((r[1] * Math.PI) / 180) - Math.sin((fz.lat * Math.PI) / 180) * Math.cos((r[1] * Math.PI) / 180) * Math.cos(((r[0] - fz.lon) * Math.PI) / 180);
    letzterKurs = Math.round((Math.atan2(y, x) * 180) / Math.PI);
  }
  return letzterKurs;
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
  quelle("plt-heli")?.setData({ type: "FeatureCollection", features: fz ? [punkt(fz.lat, fz.lon, { farbe: st ? ST_FARBE[st.nummer] ?? "#3B8BFF" : "#3B8BFF", kurs: kursVon(fz) })] : [] });
  const kh = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const ziele: GeoJSON.Feature[] = [];
  // Großeinsatz: Bereitstellungsraum (gelb) und Fußweg zum Einsatzort
  const gsE = gsVon(e);
  const ort = gsE?.adresse ?? e?.adresse;
  if (ort) ziele.push(punkt(ort.lat, ort.lon, { name: gsE ? (gsE.adresse?.label ?? "Einsatzort") : "Einsatzort", farbe: "#E5484D" }));
  const br = gsE?.gs?.br && gsE.gs.phase !== "ende" ? gsE.gs.br : null;
  if (br) ziele.push(punkt(br.lat, br.lon, { name: "Bereitstellungsraum", farbe: "#F5A524" }));
  const fuss = !!br && !!ort && !!fz && (!!fz.gsFussBis || !!fz.gsAmBr);
  quelle("plt-fuss")?.setData(fuss && br && ort ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[br.lon, br.lat], [ort.lon, ort.lat]] }, properties: {} }] } : leer());
  if (kh) ziele.push(punkt(kh.lat, kh.lon, { name: kh.kurzname || kh.name, farbe: "#3B8BFF" }));
  // Überstellung: Abholort (rot) und Ziel (blau)
  const kt = fz && !e ? sim.pilotKt(fz) : null;
  if (kt) {
    const d = kt.k.d;
    if (d.von && kt.art === "ab") ziele.push(punkt(kt.ziel.lat, kt.ziel.lon, { name: d.von.label ?? "Abholort", farbe: "#E5484D" }));
    const n = kt.art === "an" ? kt.ziel : d.nach;
    if (n) ziele.push(punkt(n.lat, n.lon, { name: d.nach?.label ?? "Ziel", farbe: "#3B8BFF" }));
  }
  if (fz) ziele.push(punkt(fz.heim.lat, fz.heim.lon, { name: "Stützpunkt", farbe: "#4CC38A" }));
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
  const kt = !e ? sim.pilotKt(fz) : null;
  if (kt) {
    const nah2 = (a: [number, number] | undefined, b: [number, number]) => !!a && Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
    const z: [number, number] = [kt.ziel.lon, kt.ziel.lat];
    if (!nah2(out[out.length - 1], z) && fz.status !== "amBO" && fz.status !== "amZO") out.push(z);
    if (kt.art === "ab" && kt.k.d.nach) out.push([kt.k.d.nach.lon, kt.k.d.nach.lat]);
    return out;
  }
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
    map.fitBounds(bb, { padding: { top: pad + 44, bottom: pad + 50, left: pad + 10, right: pad + 10 }, maxZoom: 11.5, duration: sofort ? 0 : 900 });
    return;
  }
  letzterAusschnitt = "";
  const c = map.getCenter();
  if (!sofort && Math.abs(c.lat - fz.lat) < 1e-5 && Math.abs(c.lng - fz.lon) < 1e-5) return;
  if (sofort) map.jumpTo({ center: [fz.lon, fz.lat], zoom: Math.max(map.getZoom(), 10) });
  else map.easeTo({ center: [fz.lon, fz.lat], duration: 900 });
}
