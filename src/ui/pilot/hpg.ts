/**
 * Spieler-NAH mit der HPG H145: LeitWerk ist der „Mission Server“ des H145-Missionssystems (Rust: hpg.rs).
 * Je nach Lage des Einsatzes schickt LeitWerk eine Mission ans Tablet: Alarm mit „Quittieren“, Route
 * (Magenta-Linie, Peilzeiger, Schwebeanzeige), am Einsatzort Patient und Crew als Figuren, Patientenblatt
 * und Entscheidung (Transport/Übergabe/kein Transport). Knopfdrücke am Tablet kommen als remote_notify zurück.
 * Aufbau der Missionen nach der „H145 Mission System Documentation“ (API 0.1).
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
import { vorgabe } from "./flugsim";

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
let letzterUi = "";
/** Krankenhäuser, die zuletzt am Tablet zur Wahl standen (Index → ID) */
let khAuswahl: string[] = [];
/** Was zuletzt hätte geschickt werden sollen (für „hello“ nach einer Neuverbindung) */
let aktuell: { key: string; mission: Mission; ui: Befehl[] } | null = null;

function senden(obj: unknown): void {
  if (!inTauri() || hpg.zustand !== "verbunden") return;
  void invoke("hpg_senden", { json: JSON.stringify(obj) }).catch((e) => console.warn("H145", e));
}

/** Missions-Server starten und auf die H145 hören (einmal) */
export async function hpgStarten(h: Handlungen): Promise<void> {
  handeln = h;
  if (!inTauri() || gestartet) return;
  gestartet = true;
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
    letzterUi = "";
    if (aktuell) {
      senden({ load_mission: aktuell.mission });
      letzteMission = aktuell.key;
      letzterUi = JSON.stringify(aktuell.ui);
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

function uiBefehle(fz: SimFahrzeug, e: Einsatz | undefined): Befehl[] {
  const st = sim.statusDef(fz.status);
  return [
    { set_ui: { footer_left_label: "Status", footer_left_value: t(`${st.nummer} ${st.name}`) } },
    { set_ui: { footer_right_label: e ? "Einsatz" : t(fz.kurzname || fz.funkrufname), footer_right_value: e ? t(e.nummer) : "einsatzbereit" } },
  ];
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

/** Mission für die aktuelle Lage (null = nichts Neues) */
function missionFuer(fz: SimFahrzeug, e: Einsatz | undefined): { key: string; mission: Mission } {
  const heli = t(fz.kurzname || fz.funkrufname);
  const basis = { aircraft: ["H145"], api_version: 0.1 };
  const st = fz.status;
  const plan = fz.pilot?.plan ?? null;
  const ui = uiBefehle(fz, e);
  const heim: [number, number] = [fz.heim.lat, fz.heim.lon];
  if (!e) {
    const daheim = distanceM(fz, fz.heim) < 300;
    return {
      key: `frei|${daheim}`,
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
  const bo: [number, number] = e.adresse ? [e.adresse.lat, e.adresse.lon] : [e.wahr.lat, e.wahr.lon];
  const pat: [number, number] = [e.wahr.lat, e.wahr.lon];
  const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  const hl = h ? (khLandung(h) ?? h) : null;
  const locations: Record<string, unknown> = { accident_site: bo, patient_site: pat, base: heim, ...(hl ? { hospital_helipad: [hl.lat, hl.lon] } : {}) };
  const sw = t(stichwort(e));
  const adr = t(e.adresse?.label ?? "");
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
  const ui = uiBefehle(fz, e);
  const k = `${fz.id}|${key}`;
  aktuell = { key: k, mission, ui };
  if (k !== letzteMission) {
    letzteMission = k;
    letzterUi = JSON.stringify(ui);
    senden({ load_mission: mission });
    return;
  }
  const u = JSON.stringify(ui);
  if (u !== letzterUi) {
    letzterUi = u;
    senden({ exec_commands: ui });
  }
}

/** Für Tests: eine Nachricht, wie sie von der H145 käme */
export function hpgTestNachricht(text: string): void {
  nachricht(text);
}

/** Für Tests: Mission zur aktuellen Lage */
export function hpgMissionFuer(fz: SimFahrzeug, e: Einsatz | undefined): Mission {
  return missionFuer(fz, e).mission;
}
