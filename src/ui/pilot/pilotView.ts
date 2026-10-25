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
import { spielen } from "../sounds";
import { istDunkel } from "../ws/persoenlich";
import { pilotModusSetzen } from "./modus";
import { AKTIONEN, belegung, type PilotAktion } from "./tasten";
import { eingabeStarten, eingabeStoppen, tastenDialog } from "./eingabe";
import { handyAktionen, handyDialog, handyStand } from "./handy";
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
  patient: `<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>`,
  chat: `<path d="M4 5h16v11H9l-5 4z"/>`,
  folgen: `<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>`,
  wolke: `<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z"/>`,
  sim: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 12l3-3 2 2 5-5"/>`,
  plan: `<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>`,
  zeit: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
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

function einsatzVon(fz: SimFahrzeug | undefined): Einsatz | undefined {
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
function letzterHeli(): string | null {
  try {
    return localStorage.getItem(LETZTER);
  } catch {
    return null;
  }
}
function merkeHeli(id: string): void {
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
  const ziel = e && ["alarmWache", "alarmFunk", "alarmiert", "zumBO"].includes(fz.status) ? "bo" : e?.kh && fz.status === "zumZO" ? "zo" : "heim";
  void befehl(sim.call("pilotFliegen", fz.id, ziel));
}

export function pilotAktion(a: PilotAktion): void {
  const def = AKTIONEN.find((x) => x.id === a);
  if (def?.status) pilotStatusDruecken(def.status);
  else if (a === "fliegen") pilotFliegenNaechstes();
}

// ------------------------------------------------------------------ Beitritt

/** Startseite: „Als Pilot beitreten“ – Name und Code, dann Hubschrauber wählen */
export function pilotBeitrittOeffnen(nachBeitritt?: () => void): void {
  const body = el("div", { class: "plt-beitritt" });
  body.innerHTML = `
    <p>Du fliegst einen Notarzthubschrauber selbst – mit Flugsimulator oder im Übungsflug. Die Leitstelle disponiert dich ganz normal.</p>
    <label>Dein Name<input class="plt-in-name" maxlength="30" placeholder="z. B. Paul"></label>
    <label>Code des Spiels<input class="plt-in-code" inputmode="numeric" maxlength="6" placeholder="6 Ziffern"></label>
    <p class="plt-leise">Den Code bekommst du vom Host (Multiplayer-Lobby auf seiner Startseite).</p>`;
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
          merkeHeli(fz.id);
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
        <button class="plt-b" data-act="wetter" title="Wetter für den Flugsimulator">${ico("wolke")}<span>Wetter</span></button>
        <button class="plt-b" data-act="handy" title="Handy als Statusgerät">${ico("handy")}<span>Handy</span></button>
        <button class="plt-b" data-act="tasten" title="Tasten und Joystick belegen">${ico("tasten")}<span>Tasten</span></button>
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
        <div class="plt-karte-titel">${ico("sim")}Flugsimulator</div>
        <div class="plt-sim"></div>
        <div class="plt-karte-titel">Übungsflug <span class="plt-leise">ohne Flugsimulator</span></div>
        <div class="plt-flug"></div>
      </section>
      <section class="plt-mitte">
        <div class="plt-map"></div>
        <div class="plt-map-knoepfe">
          <button class="plt-b klein an" data-act="folgen" title="Karte folgt dem Hubschrauber">${ico("folgen")}<span>Folgen</span></button>
        </div>
        <div class="plt-map-hinweis" hidden>Auf die Karte klicken: dorthin fliegen · Esc bricht ab</div>
      </section>
      <section class="plt-rechts">
        <div class="plt-einsatz"></div>
        <div class="plt-patient"></div>
        <div class="plt-plan"></div>
        <div class="plt-chat">
          <div class="plt-karte-titel">${ico("chat")}Chat mit der Leitstelle <span class="plt-leise">bis der Sprechfunk kommt</span></div>
          <div class="plt-chat-liste"></div>
          <form class="plt-chat-form"><input class="plt-chat-in" maxlength="500" placeholder="Nachricht an alle …"><button class="plt-b klein primaer">Senden</button></form>
        </div>
      </section>
    </main>`;
  document.body.appendChild(root);
  sig.clear();
  letzterEinsatz = meinFz()?.einsatzId ?? null;

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root!.querySelector(s) as T;
  $('[data-act="tasten"]').addEventListener("click", () => tastenDialog());
  $('[data-act="handy"]').addEventListener("click", () => handyDialog());
  $('[data-act="wetter"]').addEventListener("click", () => wetterDialog());
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
    if (fz) {
      try {
        await sim.call("pilotAbgeben", fz.id);
      } catch (e) {
        return fehler(e);
      }
    }
    hubschrauberWahl();
  });
  $('[data-act="verlassen"]').addEventListener("click", () => void pilotVerlassen());
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
      if (mp.status.rolle === "aus" && root) {
        pilotSchliessen();
        void import("../startseite").then((m) => m.startseiteZeigen());
        return;
      }
      zeichneAlles();
    }),
  );
  const takt = window.setInterval(() => zeichneAlles(), 1000);
  aus.push(() => window.clearInterval(takt));
  eingabeStarten(pilotAktion);
  handyAktionen(pilotAktion);
  flugsimAnbinden(meinFz, () => zeichneAlles());
  if (vorgabe().auto) void flugsimVerbinden();
  if (location.search.includes("debug")) Object.assign(window, { __pilot: { datenEmpfangen, flugsim } });
  aus.push(() => eingabeStoppen());
  zeichneAlles();
  // noch kein Hubschrauber: wählen (sobald der Stand vom Host da ist)
  if (!meinFz()) {
    const warte = () => {
      if (!root) return;
      if (Object.keys(sim.state.fahrzeuge).length && mp.status.hostDa) hubschrauberWahl();
      else window.setTimeout(warte, 400);
    };
    warte();
  }
}

/** Spiel verlassen: Hubschrauber an den Computer zurück, Verbindung trennen, zurück zur Startseite */
export async function pilotVerlassen(): Promise<void> {
  const fz = meinFz();
  if (fz) await befehl(sim.call("pilotAbgeben", fz.id));
  pilotSchliessen();
  mp.verlassen();
  const { startseiteZeigen } = await import("../startseite");
  startseiteZeigen();
}

export function pilotSchliessen(): void {
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
  chat();
  karteAktualisieren(fz, e);
  handyStand(fz, e);
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
  const verb = !mp.status.verbunden ? `<span class="plt-pill warn">verbinde …</span>` : !mp.status.hostDa ? `<span class="plt-pill warn">Host nicht da</span>` : `<span class="plt-pill ok">verbunden</span>`;
  const hind = fz ? sim.flugHindernis(fz) : null;
  teil(".plt-info", `${uhrzeit(sim.state.zeit)}|${w.lage}|${verb}|${hind}|${sim.state.tempo}`, (b) => {
    b.innerHTML = `<span title="Spielzeit">${uhrzeit(sim.state.zeit)}${sim.state.tempo !== 1 ? ` <em>×${sim.state.tempo}</em>` : ""}</span><span>${esc(WETTER_LABEL[w.lage as keyof typeof WETTER_LABEL] ?? String(w.lage))}${hind ? ` · <span class="plt-warn">${esc(hind)}</span>` : ""}</span>${verb}`;
  });
}

function warten(fz: SimFahrzeug | undefined): void {
  const box = root!.querySelector<HTMLElement>(".plt-warte")!;
  const text = !mp.status.verbunden
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
  const neu = fz?.einsatzId ?? null;
  if (neu && neu !== letzterEinsatz && fz && ["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status)) {
    alarmOffen = true;
    spielen("funkDringend");
    window.setTimeout(() => spielen("funkDringend"), 900);
    window.setTimeout(() => spielen("funkDringend"), 1800);
  }
  letzterEinsatz = neu;
  if (!fz || !e || !["alarmWache", "alarmFunk", "alarmiert"].includes(fz.status)) alarmOffen = false;
  box.hidden = !alarmOffen || !e;
  if (box.hidden || !e) return;
  const key = `${e.id}|${e.code}|${e.adresse?.label}`;
  if (box.dataset.k === key) return;
  box.dataset.k = key;
  box.innerHTML = `<div class="plt-alarm-titel">ALARM</div>
    <div class="plt-alarm-text"><b>${esc(stichwort(e))}</b><span>${esc(e.adresse?.label ?? "Adresse folgt")}</span></div>
    <div class="plt-alarm-hinweis">Status <kbd>2</kbd> = Einsatz übernommen</div>`;
}

function statusKnoepfe(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const b = belegung();
  const key = `${fz?.status}|${!!e}|${fz?.pilot?.plan?.art}|${!!e?.kh}|${JSON.stringify(b.taste)}`;
  teil(".plt-status", key, (box) => {
    for (const a of AKTIONEN.filter((x) => x.status)) {
      const st = sim.statusDef(a.status!);
      const aktiv = fz?.status === a.status;
      const btn = el("button", { class: `plt-st${aktiv ? " aktiv" : ""}`, style: `--f:${st.farbe}` });
      btn.innerHTML = `<span class="plt-st-num">${esc(st.nummer)}</span><span class="plt-st-name">${esc(st.name)}</span><kbd>${esc(tastenNameKurz(b.taste[a.id]))}</kbd>`;
      btn.disabled = !fz;
      btn.addEventListener("click", () => pilotStatusDruecken(a.status!));
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

/** Koordinaten und Flugplan für Einsatzort und Zielkrankenhaus */
function navigation(fz: SimFahrzeug, e: Einsatz, kh: Hospital | undefined): string {
  const zeile = (titel: string, lat: number, lon: number, name: string, zusatz = "") => `<div class="plt-nav">
      <div class="plt-nav-text"><b>${esc(titel)}</b><span>${esc(koordText(lat, lon))}</span>${zusatz}</div>
      <div class="plt-nav-knoepfe"><button class="plt-b klein" data-kopie="${lat.toFixed(6)}, ${lon.toFixed(6)}" title="Koordinaten kopieren">Kopieren</button><button class="plt-b klein" data-pln="${lat},${lon}" data-name="${esc(name)}" title="Flugplan für MSFS speichern">${ico("plan")}.pln</button></div>
    </div>`;
  let html = "";
  if (e.adresse && ["alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO"].includes(fz.status)) html += zeile("Einsatzort", e.adresse.lat, e.adresse.lon, "Einsatzort");
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
  const key = `${flugsim.zustand}|${flugsim.text}|${frisch}|${d && frisch ? [Math.round(d.hoehe / 50), Math.round(d.agl / 20), Math.round(d.kurs / 5), Math.round(d.kts), d.am_boden].join(",") : ""}|${p?.zeitOk}|${sim.state.tempo}|${bremse}|${daheim}|${!!fz}`;
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
  const key = `${fz?.id}|${!!e?.adresse}|${!!e?.kh}|${fz?.pilot?.flugZiel}|${f ? Math.ceil(rest / 30) : -1}|${ausSim}`;
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
    knopf("ziel", "Zum Einsatzort", "bo", !!e?.adresse);
    knopf("kh", "Zum Zielkrankenhaus", "zo", !!e?.kh);
    knopf("haus", "Zum Stützpunkt", "heim");
    const p = el("button", { class: "plt-b voll" });
    p.innerHTML = `${ico("punkt")}<span>Punkt auf der Karte …</span>`;
    p.addEventListener("click", () => {
      punktWaehlen = true;
      root!.querySelector<HTMLElement>(".plt-map-hinweis")!.hidden = false;
    });
    box.appendChild(p);
    box.insertAdjacentHTML("beforeend", `<p class="plt-leise plt-klein">Gerade Linie mit Reisegeschwindigkeit (${sim.settings.nahGeschwindigkeit} km/h).</p>`);
  });
}

function einsatzKarte(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const mitFz = e ? e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && x.einsatzId === e.id) : [];
  const key = e ? `${e.id}|${e.code}|${e.adresse?.label}|${e.infoRtw}|${e.zusatz}|${e.kh?.hospitalId}|${mitFz.map((x) => x.id + x.status).join(",")}|${Math.round(fz ? distanceM(fz, e.adresse ?? fz) / 500 : 0)}|${fz ? Math.round(sim.pilotAnkunft(fz)?.min ?? -1) : ""}` : "-";
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
      `<div class="plt-einsatz-kopf"><span class="plt-nr">${esc(e.nummer)}</span>${c ? `<span class="plt-stufe">${esc(c.stufe)}</span>` : ""}</div>
      <div class="plt-stichwort">${esc(stichwort(e))}</div>
      <div class="plt-zeile">${ico("punkt")}<span>${esc(e.adresse?.label ?? "Adresse folgt")}${e.zusatz ? `<small>${esc(e.zusatz)}</small>` : ""}</span></div>
      ${km !== null ? `<div class="plt-zeile">${ico("flug")}<span>${km.toFixed(1).replace(".", ",")} km · ca. ${minuten((km * 1000) / (sim.settings.nahGeschwindigkeit / 3.6))} Flug${ank ? `<small>Ankunft ${esc(ank.ziel)} in ca. ${minuten(ank.min * 60)}</small>` : ""}</span></div>` : ""}
      ${e.infoRtw ? `<div class="plt-info-rtw">${esc(e.infoRtw)}</div>` : ""}
      ${kh ? `<div class="plt-zeile">${ico("kh")}<span>Ziel: <b>${esc(kh.kurzname || kh.name)}</b>${khLandung(kh) ? "" : ` <span class="plt-warn">kein Landeplatz</span>`}</span></div>` : ""}
      ${navigation(fz, e, kh)}
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
    const pat = l?.patienten ?? [];
    const verdacht = e.wahr.verdacht ? buchungName(e.wahr.verdacht) : "";
    let html = "";
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
  if (p.art === "transport") {
    const h = store.get("hospitals", p.hospitalId);
    return `Transport mit dem NAH ins ${h?.kurzname || h?.name || "Krankenhaus"}`;
  }
  if (p.art === "uebergabe") return p.naMit ? "Übergabe an RTW – Notarzt fährt mit" : "Übergabe an RTW";
  return p.grund === "revers" ? "Kein Transport – Revers" : p.grund === "tot" ? "Patient verstorben" : "Kein Transport";
}

let planSeite: "transport" | "uebergabe" | "kein" = "transport";
let khSuche = "";

function plan(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  const da = !!fz && !!e && fz.status === "amBO";
  const p = fz?.pilot?.plan ?? null;
  const rtw = !!e && e.fahrzeuge.some((id) => { const x = sim.state.fahrzeuge[id]; return !!x && x.einsatzId === e.id && sim.transportfaehig(x); });
  const key = da && e ? `${e.id}|${JSON.stringify(p)}|${planSeite}|${rtw}|${khSuche}|${e.wahr.verdacht}|${Math.round(sim.state.zeit / 60000)}` : p && e ? `fest|${JSON.stringify(p)}|${fz?.status}` : "-";
  teil(".plt-plan", key, (box) => {
    if (!fz || !e) return;
    if (!da) {
      if (p) box.innerHTML = `<div class="plt-karte-titel">Entscheidung</div><div class="plt-plan-fest">${esc(planText(p))}</div>`;
      return;
    }
    box.insertAdjacentHTML("beforeend", `<div class="plt-karte-titel">Was passiert mit dem Patienten?</div>`);
    if (p) box.insertAdjacentHTML("beforeend", `<div class="plt-plan-fest">${esc(planText(p))}<small>Ändern geht, solange ihr am Berufungsort seid. Dann Status 4 (Transport) oder 6 (frei).</small></div>`);
    const reiter = el("div", { class: "plt-reiter" });
    for (const [id, t] of [["transport", "Wir transportieren"], ["uebergabe", "Übergabe an RTW"], ["kein", "Kein Transport"]] as const) {
      const b = el("button", { class: planSeite === id ? "an" : "" }, t);
      b.addEventListener("click", () => {
        planSeite = id;
        plan(fz, e);
      });
      reiter.appendChild(b);
    }
    box.appendChild(reiter);
    const setzen = (pl: PilotPlan) => void befehl(sim.call("pilotPlan", fz.id, pl));
    if (planSeite === "transport") {
      const such = el("input", { class: "plt-kh-suche", placeholder: "Krankenhaus suchen …", value: khSuche }) as HTMLInputElement;
      such.addEventListener("input", () => {
        khSuche = such.value;
        const pos = such.selectionStart;
        plan(fz, e);
        const neu = root?.querySelector<HTMLInputElement>(".plt-kh-suche");
        neu?.focus();
        if (neu && pos !== null) neu.setSelectionRange(pos, pos);
      });
      box.appendChild(such);
      const liste = el("div", { class: "plt-kh-liste" });
      for (const k of khListe(fz, e)) {
        const gewaehlt = p?.art === "transport" && p.hospitalId === k.h.id;
        const b = el("button", { class: `plt-kh${gewaehlt ? " an" : ""}` });
        const flugMin = (k.km * 1000) / (sim.settings.nahGeschwindigkeit / 3.6);
        b.innerHTML = `<span class="plt-kh-name"><b>${esc(k.h.kurzname || k.h.name)}</b><small>${esc(k.h.name)}</small></span>
          <span class="plt-kh-tags">${k.eignung ? `<span class="plt-tag ${k.eignung}">${k.eignung === "passend" ? "passend" : k.eignung === "ausweich" ? "Ausweich" : "Rückfall"}</span>` : ""}${k.zu ? `<span class="plt-tag warn">zu</span>` : ""}${k.voll ? `<span class="plt-tag warn">voll</span>` : ""}${khLandung(k.h) ? `<span class="plt-tag">Landeplatz</span>` : `<span class="plt-tag warn">kein Landeplatz</span>`}</span>
          <span class="plt-kh-km">${k.km.toFixed(0)} km<small>${minuten(flugMin)}</small></span>`;
        b.addEventListener("click", () => setzen({ art: "transport", hospitalId: k.h.id }));
        liste.appendChild(b);
      }
      box.appendChild(liste);
      box.insertAdjacentHTML("beforeend", `<p class="plt-leise plt-klein">Jedes Ziel wird genehmigt. „passend“ = passt zum Verdacht.</p>`);
    } else if (planSeite === "uebergabe") {
      if (!rtw) box.insertAdjacentHTML("beforeend", `<div class="plt-leer">Noch kein RTW im Einsatz – bitte bei der Leitstelle anfordern (Chat).</div>`);
      for (const [naMit, t, u] of [[false, "Übergabe an RTW", "Notarzt bleibt beim NAH"], [true, "Übergabe – Notarzt fährt im RTW mit", "NAH fliegt leer zum Zielkrankenhaus nach"]] as const) {
        const b = el("button", { class: `plt-wahl-k${p?.art === "uebergabe" && p.naMit === naMit ? " an" : ""}` });
        b.innerHTML = `<b>${t}</b><small>${u}</small>`;
        b.disabled = !rtw;
        b.addEventListener("click", () => setzen({ art: "uebergabe", naMit }));
        box.appendChild(b);
      }
    } else {
      for (const [grund, t, u] of [["kein", "Patient bleibt vor Ort", "kein Transport nötig"], ["revers", "Transportverweigerung", "Revers unterschrieben"], ["tot", "Patient verstorben", "Tod durch den Notarzt festgestellt"]] as const) {
        const b = el("button", { class: `plt-wahl-k${p?.art === "kein" && p.grund === grund ? " an" : ""}` });
        b.innerHTML = `<b>${t}</b><small>${u}</small>`;
        b.addEventListener("click", () => setzen({ art: "kein", grund }));
        box.appendChild(b);
      }
    }
  });
}

/** Krankenhäuser für die Zielwahl: passende zuerst, dann nach Entfernung; mit Suche alle */
function khListe(fz: SimFahrzeug, e: Einsatz): { h: Hospital; eignung: string | null; km: number; zu: boolean; voll: boolean }[] {
  const q = khSuche.trim().toLowerCase();
  const p0 = e.wahr.lage?.patienten[0];
  const kind = (p0?.alter ?? e.wahr.patientAlter ?? 99) < 15;
  const vorschlag = sim.khFuer(fz, e.wahr.verdacht ?? null, sim.patientRot(e), kind, false);
  const bekannt = new Set(vorschlag.map((v) => v.h.id));
  const alle = [
    ...vorschlag.map((v) => ({ h: v.h, eignung: v.eignung as string | null, km: v.km, zu: v.zu, voll: v.voll })),
    ...store
      .list("hospitals")
      .filter((h) => !bekannt.has(h.id))
      .map((h) => ({ h, eignung: null as string | null, km: distanceM(fz, h) / 1000, zu: false, voll: false })),
  ];
  if (q) return alle.filter((x) => `${x.h.name} ${x.h.kurzname ?? ""} ${x.h.ort ?? ""}`.toLowerCase().includes(q)).sort((a, b) => a.km - b.km).slice(0, 25);
  return alle.slice(0, 10);
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
      map.addSource("plt-ziele", { type: "geojson", data: leer() });
      map.addSource("plt-heli", { type: "geojson", data: leer() });
      map.addLayer({ id: "plt-linie", type: "line", source: "plt-linie", paint: { "line-color": "#2f7cf6", "line-width": 3, "line-dasharray": [2, 1.5], "line-opacity": 0.8 } });
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
      if (!punktWaehlen) return;
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
  if (kh) ziele.push(punkt(kh.lat, kh.lon, { name: kh.kurzname || kh.name, farbe: "#1e88e5" }));
  if (fz) ziele.push(punkt(fz.heim.lat, fz.heim.lon, { name: "Stützpunkt", farbe: "#2e9d4a" }));
  const zk = JSON.stringify(ziele.map((z) => z.geometry));
  if (zk !== letzteZiele) {
    letzteZiele = zk;
    quelle("plt-ziele")?.setData({ type: "FeatureCollection", features: ziele });
  }
  const f = fz?.fahrt;
  const ende = f?.coords[f.coords.length - 1];
  quelle("plt-linie")?.setData(fz && ende ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[fz.lon, fz.lat], ende] }, properties: {} }] } : leer());
  karteFolgen(false);
}

function karteFolgen(sofort: boolean): void {
  const fz = meinFz();
  const map = karte?.map;
  if (!fz || !map || !folgen) return;
  const c = map.getCenter();
  if (!sofort && Math.abs(c.lat - fz.lat) < 1e-5 && Math.abs(c.lng - fz.lon) < 1e-5) return;
  if (sofort) map.jumpTo({ center: [fz.lon, fz.lat], zoom: Math.max(map.getZoom(), 10) });
  else map.easeTo({ center: [fz.lon, fz.lat], duration: 900 });
}
