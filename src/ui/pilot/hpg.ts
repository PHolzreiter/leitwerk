/**
 * Spieler-NAH mit der HPG H145: LeitWerk ist der „Mission Server“ des H145-Missionssystems (Rust: hpg.rs).
 * Je nach Lage des Einsatzes schickt LeitWerk eine Mission ans Tablet: Alarm mit „Quittieren“, Route
 * (Magenta-Linie, Peilzeiger, Schwebeanzeige), am Einsatzort Patient und Crew als Figuren, Patientenblatt
 * und Entscheidung (Transport/Übergabe/kein Transport). Knopfdrücke am Tablet kommen als remote_notify zurück.
 * Aufbau der Missionen nach der „H145 Mission System Documentation“ (API 0.1).
 *
 * CARLS-Funkgerät (Mittelkonsole): die Anzeige kommt aus der Mission („set_carls_radio“, LSK/RSK je 3 Texte,
 * Items = Zeilenpaare). Das Gerät setzt die Texte als HTML – LeitWerk legt deshalb ein eigenes Display über die
 * ganze Fläche (Status · wer funkt · Sprechgruppe, wie das Funkgerät im Spiel). Ein Tastendruck löst das
 * H-Ereignis MISSION_RADIO_CARLS_<Taste> aus (nur kurzes Drücken, kein Halten); die Mission fängt es mit
 * „events“ ab und schickt es als remote_notify „carls_<Taste>“ an LeitWerk. Ohne geladene Mission zeigt das
 * Gerät „Connect a mission to begin“.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buchungName } from "../../data/klinik";
import { khLandung, type Hospital } from "../../data/model";
import { store } from "../../data/store";
import { findCode } from "../../sim/codes";
import { sim, type Einsatz, type PilotPlan, type SimFahrzeug } from "../../sim/engine";
import { distanceM } from "../../sim/geo";
import type { StatusKey } from "../../sim/settings";
import { inTauri } from "../../platform";
import { toast } from "../dom";
import { esc } from "../dom";
import { eigenerName, geraetId, gruppenName, wenHoereIch } from "../funkGeraet";
import { funkSendeZustand, gruppeHoerbar, sprechGruppe, sprechGruppeWeiter } from "../sprechfunk";
import { carlsAktion, carlsEmpfangen, carlsLernt } from "./eingabe";
import { carlsAn, vorgabe } from "./flugsim";
import { AKTIONEN } from "./tasten";

type Befehl = Record<string, unknown>;
type Mission = Record<string, unknown>;

export const hpg = {
  zustand: "aus" as "aus" | "lauscht" | "verbunden" | "getrennt" | "fehler",
  text: "",
  paket: null as string | null,
  mission: null as string | null,
  geprueft: false,
};

interface Handlungen {
  status(s: StatusKey): void;
  plan(p: PilotPlan): void;
  geaendert(): void;
}
let handeln: Handlungen | null = null;
let gestartet = false;
let letzteMission = "";
/** Krankenhäuser, die zuletzt am Tablet zur Wahl standen (Index → ID) */
let khAuswahl: string[] = [];
/** Was zuletzt hätte geschickt werden sollen (für „hello“ nach einer Neuverbindung) */
let aktuell: { key: string; mission: Mission } | null = null;
/** Hubschrauber des Piloten (für die laufende CARLS-Anzeige) */
let aktuellFzId: string | null = null;

function senden(obj: unknown): void {
  if (!inTauri() || hpg.zustand !== "verbunden") return;
  void invoke("hpg_senden", { json: JSON.stringify(obj) }).catch((e) => console.warn("H145", e));
}

/** Missions-Server starten und auf die H145 hören (einmal) */
export async function hpgStarten(h: Handlungen): Promise<void> {
  handeln = h;
  if (!inTauri() || gestartet) return;
  gestartet = true;
  // CARLS-Display: wer funkt, ändert sich laufend
  window.setInterval(carlsTakt, 200);
  await listen<{ zustand: typeof hpg.zustand; text: string }>("hpg-status", (ev) => {
    hpg.zustand = ev.payload.zustand;
    hpg.text = ev.payload.text;
    handeln?.geaendert();
  });
  await listen<string>("hpg-nachricht", (ev) => nachricht(ev.payload));
  try {
    await invoke("hpg_starten");
  } catch (e) {
    hpg.zustand = "fehler";
    hpg.text = String((e as Error)?.message ?? e);
  }
  await hpgSuchen();
}

export async function hpgSuchen(community?: string | null): Promise<void> {
  if (!inTauri()) return;
  try {
    const o = await invoke<{ paket: string | null; mission: string | null }>("hpg_suchen", { community: community ?? vorgabe().community ?? null });
    hpg.paket = o.paket;
    hpg.mission = o.mission;
  } catch {
    /* egal */
  }
  hpg.geprueft = true;
  handeln?.geaendert();
}

/** Mission „LeitWerk Leitstelle“ in der H145 anlegen und den Missions-Index neu bauen */
export async function hpgEinrichten(community?: string | null): Promise<void> {
  if (!inTauri()) return;
  try {
    const o = await invoke<{ paket: string | null; mission: string | null }>("hpg_einrichten", { community: community ?? vorgabe().community ?? null, index: true });
    hpg.paket = o.paket;
    hpg.mission = o.mission;
    toast("H145: Mission „LeitWerk Leitstelle“ angelegt – im Tablet Missions → Library → REFRESH");
  } catch (e) {
    toast(String((e as Error)?.message ?? e), "error");
  }
  handeln?.geaendert();
}

function nachricht(text: string): void {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return;
  }
  if (m.control_msg === "hello") {
    // H145 hat sich (neu) verbunden: aktuellen Stand schicken
    letzteMission = "";
    if (aktuell) {
      senden({ load_mission: aktuell.mission });
      letzteMission = aktuell.key;
      anzeigeNachLaden();
    }
    return;
  }
  if (m.control_msg === "canceled_by_user") {
    hpg.text = "Andere Mission gewählt – LeitWerk ist am Tablet aus";
    handeln?.geaendert();
    return;
  }
  const tag = typeof m.remote_notify === "string" ? m.remote_notify : "";
  if (!tag || !handeln) return;
  if (tag === "quittieren") return handeln.status("alarmiert");
  if (tag.startsWith("carls_")) return carlsTaste(tag.slice(6));
  if (tag.startsWith("status_")) {
    const s = tag.slice(7) as StatusKey;
    return handeln.status(s);
  }
  const kh = /^plan_kh_(\d+)$/.exec(tag);
  if (kh) {
    const id = khAuswahl[Number(kh[1])];
    if (id) handeln.plan({ art: "transport", hospitalId: id });
    return;
  }
  if (tag === "plan_uebergabe_0" || tag === "plan_uebergabe_1") return handeln.plan({ art: "uebergabe", naMit: tag.endsWith("1") });
  const kein = /^plan_kein_(kein|revers|tot)$/.exec(tag);
  if (kein) return handeln.plan({ art: "kein", grund: kein[1] as "kein" | "revers" | "tot" });
}

// ------------------------------------------------------------------ Missionen bauen

const ALARM: StatusKey[] = ["alarmWache", "alarmFunk"];

function stichwort(e: Einsatz): string {
  const c = findCode(e.code ?? undefined);
  return c?.beschreibung ?? e.code ?? ((e.meldung?.text ?? "").split(/[.;]/)[0] || "Einsatz");
}

/** Text für das Tablet: einfache Zeichen, damit nichts verloren geht */
const t = (s: string) =>
  s
    .replace(/[–—]/g, "-").replace(/[„“”]/g, '"').replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "")
    .slice(0, 400);

function punktIcon(farbe: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="${farbe}" stroke="white" stroke-width="4"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Fußzeile des Tablets: die H145 kennt weder die rechte noch die linke Fußzeile („Command Failed – NotFound“,
 * getestet 30.10.2026) – Status und Einsatznummer stehen deshalb im Mission Briefing und in den Meldungen.
 * Am Anfang jeder Mission: das CARLS-Display (danach hält es carlsTakt() aktuell).
 */
function uiBefehle(fz: SimFahrzeug, _e: Einsatz | undefined): Befehl[] {
  return [{ set_carls_radio: carlsDaten(fz) }];
}

// ------------------------------------------------------------------ CARLS-Funkgerät

/** Tasten am CARLS: Ziffern, ◄ ► und roter Hörer gehen als remote_notify an LeitWerk */
function carlsEreignisse(): Record<string, unknown> {
  const ev: Record<string, unknown> = {};
  const tasten = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "LEFT", "RIGHT", "HANG"];
  for (const k of tasten) ev[`MISSION_RADIO_CARLS_${k}`] = { commands: [{ remote_notify: `carls_${k}`, params: [] }] };
  return ev;
}

/** Status vorgemerkt: geht nach 1 s raus (wie Halten am echten Gerät); andere Ziffer = ändern, roter Hörer = abbrechen */
let carlsVormerk: { n: number; status: StatusKey; timer: number } | null = null;
/** Pfeile neben der Gruppe nur beim Wechseln (bis zu diesem Zeitpunkt) */
let carlsPfeileBis = 0;
const PFEILE_MS = 3000;
const VORMERK_MS = 1000;
let letzteAnzeige = "";
let anzeigeAb = 0;

function carlsTaste(t: string): void {
  if (!carlsAn()) return;
  if (/^\d$/.test(t)) {
    const n = Number(t);
    if (carlsLernt()) return carlsEmpfangen(n);
    const a = carlsAktion(n);
    if (!a) return;
    const st = AKTIONEN.find((x) => x.id === a)?.status;
    if (!st) return carlsEmpfangen(n);
    if (carlsVormerk) window.clearTimeout(carlsVormerk.timer);
    carlsVormerk = {
      n,
      status: st,
      timer: window.setTimeout(() => {
        const v = carlsVormerk;
        carlsVormerk = null;
        if (!v) return;
        carlsEmpfangen(v.n);
        carlsTakt();
      }, VORMERK_MS),
    };
  } else if (t === "LEFT" || t === "RIGHT") {
    sprechGruppeWeiter(t === "LEFT" ? -1 : 1);
    carlsPfeileBis = Date.now() + PFEILE_MS;
    window.setTimeout(carlsTakt, PFEILE_MS + 50);
  } else if (t === "HANG" && carlsVormerk) {
    window.clearTimeout(carlsVormerk.timer);
    carlsVormerk = null;
  }
  carlsTakt();
}

/** Text fürs Display: HTML-sicher, Umlaute als Zeichen-Nummern (kommt sicher durchs Tablet) */
function h(s: string): string {
  return esc(s).replace(/[^\x20-\x7e]/g, (c) => `&#${c.codePointAt(0)};`).replace(/[{}$]/g, "");
}

function statusName(st: StatusKey): string {
  return st === "freiWache" ? "Frei auf Wache" : sim.statusDef(st).name;
}

/** Was das Display zeigen soll (ohne HTML) – auch für Tests. Inhalt wie das Funkgerät im Spiel (funkGeraet.ts). */
export function carlsStand(fz: SimFahrzeug): {
  status: string;
  /** Status vorgemerkt (wird nicht angezeigt – am Display bleibt der alte Status, bis der neue angekommen ist) */
  vorgemerkt: boolean;
  kopf: string;
  wer: string;
  popGruppe: string;
  art: "" | "aktiv" | "senden" | "warten";
  gruppe: string;
  pfeile: boolean;
  neben: string;
  uhr: string;
} {
  // Vorgabe Paul 10.11.: kein Blinken, keine Farbe – der alte Status bleibt, bis der neue angekommen ist
  const status = statusName(fz.status);
  const k = sprechGruppe();
  const name = gruppenName(k);
  const ich = funkSendeZustand();
  let kopf = "";
  let wer = "";
  let popGruppe = "";
  let art: "" | "aktiv" | "senden" | "warten" = "";
  if (ich?.art === "sendet") {
    kopf = "Senden";
    art = "senden";
    wer = `ID: ${geraetId(eigenerName())}`;
    popGruppe = name;
  } else if (ich?.art === "wartet") {
    kopf = "Warten ...";
    art = "warten";
    const w = wenHoereIch(k);
    wer = w ? `ID: ${geraetId(w)}` : "";
    popGruppe = "danach bist du dran";
  } else {
    const w = wenHoereIch(k);
    if (w) {
      kopf = "Gruppe aktiv";
      art = "aktiv";
      wer = `ID: ${geraetId(w)}`;
      popGruppe = name;
    }
  }
  const neben = sim
    .offeneGruppen()
    .filter((x) => x !== k && gruppeHoerbar(x))
    .map((x) => [x, wenHoereIch(x)] as const)
    .filter(([, w]) => !!w)
    .map(([x, w]) => `${gruppenName(x).slice(-2)}: ${w}`)
    .join(" / ");
  if (!kopf && neben) kopf = "Gruppe aktiv";
  const uhr = sim.state.zeit ? new Date(sim.state.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "";
  return { status, vorgemerkt: !!carlsVormerk, kopf, wer, popGruppe, art, gruppe: name, pfeile: Date.now() < carlsPfeileBis, neben, uhr };
}

/**
 * Eigenes Display über der ganzen CARLS-Fläche (470 × 348), nachgebaut wie das TETRA-Display des Funkgeräts im
 * Spiel (fenster/funk/funk.css „.fg-…“): hellblau, Kopfzeile mit Netz und Uhr, TETRA / BOS / Gruppe / Status,
 * rechts die Leiste „KWlist“ / „Optionen“ (auf Höhe der Seitentasten); spricht jemand, das Fenster
 * „Gruppe aktiv“ mit „ID: …“ und der Gruppe. Pfeile neben der Gruppe nur beim Wechseln.
 * Cockpit (Coherent, Fotos Paul 10.11.): Flexbox greift dort nicht verlässlich – alles absolut gesetzt (feste
 * Kästen, Text mittig über line-height); die Schrift ist dort schmaler und nicht fett.
 */
function carlsHtml(fz: SimFahrzeug): string {
  const d = carlsStand(fz);
  const box = (x: number, y: number, w: number, hh: number, gr: number, inhalt: string, extra = "") =>
    `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${hh}px;line-height:${hh}px;font-size:${gr}px;text-align:center;white-space:nowrap;overflow:hidden;${extra}">${inhalt}</div>`;
  const pfeil = (r: boolean) =>
    `<span style="display:inline-block;vertical-align:middle;width:0;height:0;border-top:12px solid transparent;border-bottom:12px solid transparent;${r ? "border-left" : "border-right"}:15px solid #2a5ea8;${r ? "margin-left" : "margin-right"}:14px"></span>`;
  const lampe = d.neben ? `<span style="display:inline-block;vertical-align:middle;width:14px;height:14px;border-radius:7px;margin-left:10px;background:#e08a00;animation:lwcl 1s ease-in-out infinite"></span>` : "";
  const B = 368; // Breite links neben der Leiste
  // Kopfzeile: Netz-Balken, Symbol, Uhr
  const balken = [30, 55, 80, 100]
    .map((p, i) => {
      const hh = Math.round(p * 0.22);
      return `<div style="position:absolute;left:${16 + i * 9}px;top:${32 - hh}px;width:6px;height:${hh}px;border-radius:1px;background:#2b9a3a"></div>`;
    })
    .join("");
  const sym = `<div style="position:absolute;left:58px;top:16px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid #c58a00"></div>`;
  const kopf =
    `<div style="position:absolute;left:0;top:0;width:${B}px;height:42px;border-bottom:1px solid rgba(40,70,120,.22);background:rgba(255,255,255,.25)"></div>` +
    balken +
    sym +
    box(B - 110, 0, 96, 42, 26, h(d.uhr), "text-align:right;color:#24364f");
  const stGr = d.status.length <= 14 ? 42 : d.status.length <= 17 ? 37 : 32;
  const gruppe = d.pfeile ? `${pfeil(false)}${h(d.gruppe)}${pfeil(true)}${lampe}` : `${h(d.gruppe)}${lampe}`;
  const aktiv = !!d.kopf;
  const popFarbe = d.art === "senden" ? "#c62828" : d.art === "warten" ? "#a86f00" : "#56657c";
  const popRand = d.art === "senden" ? "#c62828" : "#2d5aa0";
  const PW = 336;
  const pop = aktiv
    ? `<div style="position:absolute;left:14px;top:52px;width:${PW + 6}px;height:282px;border-radius:8px;background:rgba(10,25,50,.28)"></div>` +
      `<div style="position:absolute;left:10px;top:48px;width:${PW}px;height:278px;border-radius:8px;background:#f3f7fd;border:3px solid ${popRand};overflow:hidden">` +
      box(0, 0, PW, 58, 32, h(d.kopf), `background:${popFarbe};color:#fff;letter-spacing:1px`) +
      box(0, 84, PW, 70, 54, h(d.wer), "color:#0e1622") +
      box(0, 156, PW, 50, d.art === "warten" ? 28 : 38, h(d.popGruppe), "color:#24364f") +
      (d.art === "senden"
        ? `<div style="position:absolute;left:${Math.round(PW * 0.2)}px;top:222px;width:${Math.round(PW * 0.6)}px;height:10px;border-radius:5px;background:rgba(0,0,0,.12);overflow:hidden"><div style="height:10px;width:70%;background:#c62828;animation:lwcp .45s ease-in-out infinite alternate"></div></div>`
        : "") +
      (d.neben ? box(0, 232, PW, 40, 24, h(d.neben), "color:#7a5400") : "") +
      `</div>`
    : "";
  // Leiste rechts: Beschriftung auf Höhe der oberen und unteren Seitentaste
  const leiste =
    `<div style="position:absolute;left:${B}px;top:0;width:102px;height:348px;background:linear-gradient(180deg,rgba(128,160,208,.55) 0%,rgba(110,145,198,.6) 100%);border-left:1px solid rgba(40,70,120,.3);color:#16263f">` +
    `<div style="position:absolute;left:10px;top:174px;width:82px;height:1px;background:rgba(40,70,120,.25)"></div>` +
    (aktiv ? box(0, 34, 102, 46, 25, "Option") + box(0, 248, 102, 46, 25, "Ordner") : box(0, 34, 102, 46, 26, "KWlist") + box(0, 248, 102, 46, 23, "Optionen")) +
    `</div>`;
  return (
    `<style>@keyframes lwcl{50%{opacity:.4}}@keyframes lwcp{from{width:25%}to{width:85%}}</style>` +
    `<div style="position:absolute;left:-50px;top:0;width:470px;height:348px;background:linear-gradient(180deg,#d3e1f5 0%,#b6cbea 100%);color:#0f1724;font-family:Roboto,Arial,sans-serif;text-align:left;z-index:50;overflow:hidden">` +
    kopf +
    box(0, 54, B, 60, 46, "TETRA", "letter-spacing:2px") +
    box(0, 114, B, 56, 40, "BOS", "letter-spacing:2px;color:#24364f") +
    box(0, 180, B, 68, 46, gruppe, "font-weight:bold") +
    `<div style="position:absolute;left:40px;top:258px;width:${B - 80}px;height:1px;background:rgba(40,70,120,.22)"></div>` +
    box(8, 266, B - 16, 66, stGr, h(d.status)) +
    leiste +
    pop +
    `</div>`
  );
}

function carlsDaten(fz: SimFahrzeug): { LSK: string[]; RSK: string[]; Items: [string, string][] } {
  return { LSK: ["", "", ""], RSK: ["", "", ""], Items: [[carlsHtml(fz), ""], ["", ""], ["", ""]] };
}

/** nach einer neuen Mission: deren Display ist evtl. schon alt – kurz danach neu schicken */
function anzeigeNachLaden(): void {
  letzteAnzeige = "";
  anzeigeAb = Date.now() + 1500;
}

/** hält das Display aktuell (Status, wer funkt, Gruppe); schickt nur bei Änderungen */
function carlsTakt(): void {
  if (hpg.zustand !== "verbunden" || !aktuellFzId || Date.now() < anzeigeAb) return;
  const fz = sim.state.fahrzeuge[aktuellFzId];
  if (!fz) return;
  const d = carlsDaten(fz);
  const html = d.Items[0][0];
  if (html === letzteAnzeige) return;
  letzteAnzeige = html;
  senden({ exec_commands: [{ set_carls_radio: d }] });
}

function khVorschlaege(fz: SimFahrzeug, e: Einsatz): Hospital[] {
  const p0 = e.wahr.lage?.patienten[0];
  const kind = (p0?.alter ?? e.wahr.patientAlter ?? 99) < 15;
  const liste = sim.khFuer(fz, e.wahr.verdacht ?? null, sim.patientRot(e), kind, true, sim.cacVorrang(e));
  return liste.slice(0, 3).map((v) => v.h);
}

function patientText(e: Einsatz): string {
  const l = e.wahr.lage;
  const teile: string[] = [];
  if (l?.fall?.kern) teile.push(l.fall.kern);
  if (e.wahr.verdacht) teile.push(`Verdacht: ${buchungName(e.wahr.verdacht)}`);
  for (const p of l?.patienten ?? []) {
    const wer = p.alter < 14 ? "Kind" : p.geschlecht === "w" ? "Frau" : "Mann";
    teile.push(`${wer} ${p.alter} J., ${{ rot: "rot", gelb: "gelb", gruen: "gruen" }[p.sichtung]}, ${{ ja: "wach", getruebt: "eingetruebt", nein: "bewusstlos" }[p.bw]}`);
  }
  return t(teile.join(" - ") || stichwort(e));
}

function entscheidung(fz: SimFahrzeug, e: Einsatz): Befehl {
  const khs = khVorschlaege(fz, e);
  khAuswahl = khs.map((h) => h.id);
  const rtw = e.fahrzeuge.some((id) => {
    const x = sim.state.fahrzeuge[id];
    return !!x && x.einsatzId === e.id && sim.transportfaehig(x);
  });
  const khModal: Befehl = {
    set_modal: {
      title: "Zielkrankenhaus",
      text: t(`Verdacht: ${e.wahr.verdacht ? buchungName(e.wahr.verdacht) : "-"}. Andere Ziele im LeitWerk-Fenster.`),
      options: khs.map((h, i) => {
        const km = distanceM(fz, h) / 1000;
        return { text: t(`${h.kurzname || h.name} (${Math.round(km)} km)`), style: i === 0 ? "primary" : "", commands: [{ remote_notify: `plan_kh_${i}`, params: [] }] };
      }),
    },
  };
  const uebergabe: Befehl = {
    set_modal: {
      title: "Uebergabe an RTW",
      text: "Faehrt der Notarzt im RTW mit?",
      options: [
        { text: "Ohne Notarzt", style: "primary", commands: [{ remote_notify: "plan_uebergabe_0", params: [] }] },
        { text: "Notarzt faehrt mit", commands: [{ remote_notify: "plan_uebergabe_1", params: [] }] },
      ],
    },
  };
  const kein: Befehl = {
    set_modal: {
      title: "Kein Transport",
      text: "Grund",
      options: [
        { text: "Bleibt vor Ort", style: "primary", commands: [{ remote_notify: "plan_kein_kein", params: [] }] },
        { text: "Revers", commands: [{ remote_notify: "plan_kein_revers", params: [] }] },
        { text: "Verstorben", style: "Danger", commands: [{ remote_notify: "plan_kein_tot", params: [] }] },
      ],
    },
  };
  const optionen = [
    ...(khs.length ? [{ text: "Wir transportieren", style: "primary", commands: [khModal] }] : []),
    ...(rtw ? [{ text: "Uebergabe an RTW", commands: [uebergabe] }] : []),
    { text: "Kein Transport", commands: [kein] },
  ];
  return { wait_modal: { title: t("Patient"), text: patientText(e), options: optionen } };
}

/** Text für „Mission Briefing“ am Tablet: Einsatzdaten bzw. Bereitschaft */
function briefing(fz: SimFahrzeug, e: Einsatz | undefined): { text: string }[] {
  const heli = fz.kurzname || fz.funkrufname;
  const zeilen: string[] = [];
  if (!e) {
    zeilen.push(`${heli} (${fz.funkrufname}), Stuetzpunkt ${fz.stationName}.`, `Status: ${sim.statusDef(fz.status).nummer} ${sim.statusDef(fz.status).name}.`, "Die Alarmierung kommt von der Leitstelle in LeitWerk.");
  } else {
    const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
    zeilen.push(`Einsatz ${e.nummer} - ${stichwort(e)}`, `Einsatzort: ${e.adresse?.label ?? "folgt"}`);
    if (e.infoRtw) zeilen.push(`Info: ${e.infoRtw}`);
    if (h) zeilen.push(`Zielkrankenhaus: ${h.name}`);
    zeilen.push(`Status: ${sim.statusDef(fz.status).nummer} ${sim.statusDef(fz.status).name}`);
  }
  return zeilen.map((z) => ({ text: t(z) }));
}

/** Mission für die aktuelle Lage, mit Briefing */
function missionFuer(fz: SimFahrzeug, e: Einsatz | undefined): { key: string; mission: Mission } {
  const m = missionRoh(fz, e);
  return { key: m.key, mission: { ...m.mission, briefing: briefing(fz, e), events: carlsEreignisse() } };
}

function missionRoh(fz: SimFahrzeug, e: Einsatz | undefined): { key: string; mission: Mission } {
  const heli = t(fz.kurzname || fz.funkrufname);
  const basis = { aircraft: ["H145"], api_version: 0.1 };
  const st = fz.status;
  const plan = fz.pilot?.plan ?? null;
  const ui = uiBefehle(fz, e);
  const heim: [number, number] = [fz.heim.lat, fz.heim.lon];
  if (!e) {
    const daheim = distanceM(fz, fz.heim) < 300;
    return {
      key: `frei|${daheim}|${fz.status}`,
      mission: {
        ...basis,
        title: t(`LeitWerk - ${heli}`),
        locations: { base: heim },
        objectives: [
          {
            title: daheim ? "Einsatzbereit - warte auf Alarmierung" : "Einsatz beendet - Rueckflug zum Stuetzpunkt",
            commands: [...ui, ...(daheim ? [{ set_route: "base" }, { set_message: { text: "" } }] : [{ set_route: "base" }, { set_message: { text: t(`Rueckflug ${fz.stationName}`) } }]), { sleep: "forever" }],
          },
        ],
      },
    };
  }
  // Großeinsatz: das Ziel ist zuerst der Bereitstellungsraum (bis die Einsatzleitung abruft)
  const ziel = sim.pilotBo(fz);
  const bo: [number, number] = ziel ? [ziel.lat, ziel.lon] : e.adresse ? [e.adresse.lat, e.adresse.lon] : [e.wahr.lat, e.wahr.lon];
  const pat: [number, number] = [e.wahr.lat, e.wahr.lon];
  const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const hl = h ? (khLandung(h) ?? h) : null;
  const locations: Record<string, unknown> = { accident_site: bo, patient_site: pat, base: heim, ...(hl ? { hospital_helipad: [hl.lat, hl.lon] } : {}) };
  const sw = t(stichwort(e));
  const adr = t(ziel?.br ? "Bereitstellungsraum" : (e.adresse?.label ?? ""));
  const karte: Befehl[] = [
    { set_map: { add: { point: { location: "accident_site", id: "lw_bo", icon: punktIcon("#e53935") } } } },
    ...(hl ? [{ set_map: { add: { point: { location: "hospital_helipad", id: "lw_kh", icon: punktIcon("#1e88e5") } } } }] : []),
  ];
  const zumBo: Befehl[] = [
    { set_route: "accident_site" },
    { set_df: { location: "accident_site", freq: 123.45 } },
    { set_message: { text: t(`${sw} - ${adr}`) } },
    { wait_for: { location: "accident_site", var: "distance" }, lt: 0.6 },
    { set_hover_display: { range: 0.3, target: "accident_site" } },
    { sleep: "forever" },
  ];
  // Figuren am Einsatzort: Patient am Boden, beim Eintreffen die Crew daneben
  const objekte = { patient: { title: "Airbus H145 Injured Human", location: "patient_site" } };
  if (ALARM.includes(st)) {
    return {
      key: `alarm|${e.id}`,
      mission: {
        ...basis,
        title: t(`ALARM ${heli}`),
        locations,
        objects: objekte,
        objectives: [
          {
            title: t(`ALARM: ${sw}`),
            commands: [
              ...ui,
              ...karte,
              { set_route: "accident_site" },
              { wait_modal: { title: t(`ALARM - ${heli}`), text: t(`${sw}\n${adr}${e.infoRtw ? `\n${e.infoRtw}` : ""}`), options: [{ text: "Quittieren", style: "primary", commands: [{ remote_notify: "quittieren", params: [] }] }] } },
            ],
          },
          { title: t(`Zum Einsatzort: ${adr}`), commands: zumBo },
        ],
      },
    };
  }
  if (st === "alarmiert" || st === "zumBO") {
    return {
      key: `anflug|${e.id}|${bo.join(",")}`,
      mission: { ...basis, title: t(`${heli}: ${sw}`), locations, objects: objekte, objectives: [{ title: t(`Zum Einsatzort: ${adr}`), commands: [...ui, ...karte, ...zumBo] }] },
    };
  }
  const crew: Befehl[] = [
    { create_object: { name: "crew", title: "$TITLE Crew", fallback_title: "Airbus H145 ADAC Crew", location: { bearing: 70, dist: 0.004, object: "patient" } } },
    { set: { object: "crew", var: "VAR 1" }, value: 5 },
  ];
  // Großeinsatz ohne zugeteilten Patienten: warten im BR bzw. am Einsatzort, Abruf zum Einsatzort
  const gsHinweis = !e.gsKind && e.gs && !e.gs.aufgehoben ? sim.pilotGsHinweis(fz) : null;
  if (st === "amBO" && gsHinweis) {
    return {
      key: `gs|${e.id}|${bo.join(",")}|${gsHinweis.text}`,
      mission: {
        ...basis,
        title: t(`${heli}: ${sw}`),
        locations,
        objectives: [{ title: t(gsHinweis.text), commands: [...ui, ...karte, { set_route: "accident_site" }, ...(gsHinweis.abruf ? [{ set_df: { location: "accident_site", freq: 123.45 } }] : [{ set_hover_display: { range: 0 } }]), { set_message: { text: t(gsHinweis.text) } }, { sleep: "forever" }] }],
      },
    };
  }
  if (st === "amBO" && !plan) {
    return {
      key: `bo|${e.id}`,
      mission: {
        ...basis,
        title: t(`${heli}: ${sw}`),
        locations,
        objects: objekte,
        objectives: [{ title: "Am Einsatzort - Patient versorgen", commands: [...ui, ...karte, { set_route: "accident_site" }, { set_hover_display: { range: 0 } }, ...crew, { set_message: { text: patientText(e) } }, entscheidung(fz, e), { sleep: "forever" }] }],
      },
    };
  }
  if (st === "amBO" && plan) {
    const fliegt = (plan.art === "transport" || (plan.art === "uebergabe" && plan.naMit)) && !!hl;
    const text = plan.art === "transport" ? `Patient einladen, dann Status 4 - ${h?.kurzname || h?.name || ""}` : plan.art === "uebergabe" ? (plan.naMit ? "Notarzt faehrt im RTW mit - leer zum Zielkrankenhaus" : "Patient an RTW uebergeben - Status 6, wenn frei") : "Kein Transport - Status 6, wenn frei";
    const trage: Befehl[] = plan.art === "transport" ? [{ destroy_object: "patient" }, { set: { object: "crew", var: "VAR 1" }, value: 13 }] : [];
    return {
      key: `boplan|${e.id}|${JSON.stringify(plan)}|${e.kh?.hospitalId}`,
      mission: {
        ...basis,
        title: t(`${heli}: ${sw}`),
        locations,
        objects: objekte,
        objectives: [{ title: t(text), commands: [...ui, ...karte, ...crew, ...trage, ...(fliegt ? [{ set_route: "hospital_helipad" }, { set_df: { location: "hospital_helipad", freq: 123.45 } }] : []), { set_message: { text: t(text) } }, { sleep: "forever" }] }],
      },
    };
  }
  if (st === "zumZO" && hl) {
    return {
      key: `transport|${e.id}|${e.kh?.hospitalId}`,
      mission: {
        ...basis,
        title: t(`${heli}: ${h?.kurzname || h?.name}`),
        locations,
        objectives: [
          {
            title: t(`Zum Zielkrankenhaus: ${h?.kurzname || h?.name}`),
            commands: [
              ...ui,
              ...karte,
              { set_route: "hospital_helipad" },
              { set_df: { location: "hospital_helipad", freq: 123.45 } },
              { set_message: { text: t(`${h?.name ?? ""} - Landeplatz`) } },
              { wait_for: { location: "hospital_helipad", var: "distance" }, lt: 0.6 },
              { set_hover_display: { range: 0.3, target: "hospital_helipad" } },
              { sleep: "forever" },
            ],
          },
        ],
      },
    };
  }
  return {
    key: `sonst|${e.id}|${st}`,
    mission: { ...basis, title: t(`${heli}: ${sw}`), locations, objectives: [{ title: t(sim.statusDef(st).name), commands: [...ui, { set_hover_display: { range: 0 } }, { sleep: "forever" }] }] },
  };
}

/** Bei jeder Änderung: passende Mission schicken (nur wenn sich die Lage geändert hat), sonst nur die Fußzeile */
export function hpgAktualisieren(fz: SimFahrzeug | undefined, e: Einsatz | undefined): void {
  if (!fz) return;
  const { key, mission } = missionFuer(fz, e);
  const k = `${fz.id}|${key}`;
  aktuell = { key: k, mission };
  aktuellFzId = fz.id;
  if (k !== letzteMission) {
    letzteMission = k;
    senden({ load_mission: mission });
    anzeigeNachLaden();
    return;
  }
  carlsTakt();
}

/** Für Tests: eine Nachricht, wie sie von der H145 käme */
export function hpgTestNachricht(text: string): void {
  nachricht(text);
}

/** Für Tests: CARLS-Taste drücken bzw. was das Display zeigt */
export const hpgCarlsTest = {
  taste: (t: string) => carlsTaste(t),
  stand: (fz: SimFahrzeug) => carlsStand(fz),
  daten: (fz: SimFahrzeug) => carlsDaten(fz),
  html: (fz: SimFahrzeug) => carlsHtml(fz),
};

/** Für Tests: Mission zur aktuellen Lage */
export function hpgMissionFuer(fz: SimFahrzeug, e: Einsatz | undefined): Mission {
  return missionFuer(fz, e).mission;
}
