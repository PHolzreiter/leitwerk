/**
 * Discord-Aktivität (Beta 74, Paul 22./23.11.2026): In Discord steht „Spielt LeitWerk“ – im Hauptmenü, in der Lobby
 * und im Spiel, mit ein paar Infos (Rolle, Funkgruppe, offene Einsätze, Spieltyp). Nie Einsatzinhalte (Adressen,
 * Namen, Codes): das Profil sehen alle Freunde und Server.
 *
 * Nur das Hauptfenster des Programms meldet. Alle 5 s wird der Zustand gebaut; geschickt wird nur bei einer Änderung
 * und höchstens alle 15 s (Discord begrenzt die Häufigkeit). Die Verbindung hält das Programm selbst (discord.rs).
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { sim } from "../sim/engine";
import { store } from "../data/store";
import { VORLAGEN, vorlageVon } from "../sim/stufenKurven";
import { mp } from "../net/mehrspieler";
import { pers, onPers } from "./ws/persoenlich";
import { istPilot } from "./pilot/modus";
import { hauptmenueBeitreten, hauptmenueOffen } from "./hauptmenue";
import { toast } from "./dom";
import { listen } from "@tauri-apps/api/event";
import { eigenerName, pilotStatus } from "./funkGeraet";

export interface DiscordAktivitaet {
  details: string | null;
  state: string | null;
  gross_text: string | null;
  klein: string | null;
  klein_text: string | null;
  start: number | null;
  runde: [number, number] | null;
  /** Knöpfe (nur für andere sichtbar): „Mitspielen“ → Beitreten-Seite des Mehrspieler-Servers */
  knoepfe: { text: string; link: string }[];
}

/** Beitreten-Seite (Knopf „Mitspielen“): öffnet leitwerk://beitreten/<Code> */
export const BEITRETEN_SEITE = "https://server.leitwerk.workers.dev/beitreten/";

/** Wie viele Spieler höchstens in einer Runde */
const MAX_SPIELER = 6;

/** Gerade an? (Einstellung „In Discord zeigen“, Standard an) */
export function discordAn(): boolean {
  return pers().discord !== false;
}
function mitDetails(): boolean {
  return pers().discordDetails !== false;
}

/** Zustand für die Anzeige (ohne Sim-Zugriff testbar) */
export interface DiscordLage {
  ort: "menue" | "lobby" | "spiel";
  pilot: boolean;
  details: boolean;
  /** Funkgruppe („RD-NOE-03“) bzw. Rufname des Hubschraubers */
  gruppe: string;
  rufname: string;
  pilotStatus: string;
  offen: number;
  spieltyp: string;
  pause: boolean;
  host: boolean;
  spieler: number;
  mehrspieler: boolean;
  start: number | null;
  /** führe ich gerade einen Notruf? */
  telefoniert: boolean;
  /** Raumcode und ob der Host „Auch über Discord“ erlaubt */
  code: string;
  beitrittDiscord: boolean;
}

/** Aktivität aus dem Zustand bauen – nur allgemeine Infos, keine Einsatzinhalte */
export function aktivitaetBauen(l: DiscordLage): DiscordAktivitaet {
  const runde: [number, number] | null = l.mehrspieler && l.spieler > 0 ? [Math.min(l.spieler, MAX_SPIELER), MAX_SPIELER] : null;
  // „Mitspielen“ nur, wenn der Host es erlaubt und noch Plätze frei sind (Beta 76)
  const knoepfe = l.mehrspieler && l.beitrittDiscord && /^\d{6}$/.test(l.code) && l.spieler < MAX_SPIELER ? [{ text: "Mitspielen", link: BEITRETEN_SEITE + l.code }] : [];
  const basis: DiscordAktivitaet = { details: null, state: null, gross_text: "LeitWerk – Leitstellensimulator", klein: null, klein_text: null, start: l.start, runde: null, knoepfe };
  if (l.ort === "menue") return { ...basis, details: "Im Hauptmenü" };
  if (l.ort === "lobby") return { ...basis, details: "In der Lobby", state: l.details ? (l.host ? "Wartet auf Mitspieler" : "Wartet auf den Start") : null, runde: l.details ? runde : null };
  if (!l.details) return { ...basis, details: "Im Spiel", runde: null };
  if (l.pilot)
    return {
      ...basis,
      details: `Pilot · ${l.rufname} · ${l.gruppe}`,
      state: l.pause ? "Pausiert" : l.pilotStatus,
      klein: "heli",
      klein_text: "Pilot",
      runde,
    };
  const einsaetze = l.offen === 0 ? "Keine offenen Einsätze" : l.offen === 1 ? "1 offener Einsatz" : `${l.offen} offene Einsätze`;
  return {
    ...basis,
    details: `Disponent · ${l.gruppe}`,
    state: l.pause ? "Pausiert" : l.telefoniert ? `Telefoniert · ${einsaetze}` : `${einsaetze} · ${l.spieltyp}`,
    klein: "rd",
    klein_text: "Disponent",
    runde,
  };
}

let spielStart: number | null = null;
/** seit wann im Hauptmenü bzw. in der Lobby (die Zeit zählt ab dort, nicht ab Programmstart) */
let menueSeit: number | null = null;

/** Zustand aus dem laufenden Spiel */
export function lageJetzt(): DiscordLage {
  const imMenue = hauptmenueOffen();
  const lobby = imMenue && (mp.aktiv || !!sim.state.lobby);
  const ort: DiscordLage["ort"] = lobby ? "lobby" : imMenue ? "menue" : "spiel";
  if (ort === "spiel") {
    spielStart ??= Date.now();
    menueSeit = null;
  } else {
    spielStart = null;
    menueSeit ??= Date.now();
  }
  const s = sim.state;
  return {
    ort,
    pilot: istPilot(),
    details: mitDetails(),
    gruppe: sim.sprechgruppeName(null),
    rufname: istPilot() ? eigenerName() : "",
    pilotStatus: istPilot() ? pilotStatus() : "",
    offen: s.einsaetze.filter((e) => !e.fremd && !e.gsKind && (e.zustand === "offen" || e.zustand === "laufend")).length,
    spieltyp: VORLAGEN[vorlageVon(sim.settings)].label,
    pause: ort === "spiel" && !s.laeuft,
    host: mp.status.rolle === "host",
    spieler: mp.spieler.length,
    mehrspieler: mp.aktiv,
    start: ort === "spiel" ? spielStart : menueSeit,
    telefoniert: ort === "spiel" && s.einsaetze.some((e) => e.anruf?.status === "aktiv" && (!mp.aktiv || e.anruf.angenommenVon?.pid === mp.ich.pid)),
    code: mp.aktiv ? (mp.status.code ?? "") : "",
    beitrittDiscord: !!store.settings.beitrittDiscord,
  };
}

let gesendet = "";
let gesendetUm = 0;
let warAn = false;
const ABSTAND = 15_000;

function hauptfenster(): boolean {
  const meta = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__?.metadata;
  return !meta?.currentWindow?.label || meta.currentWindow.label === "main";
}

async function schritt(sofort = false): Promise<void> {
  if (!discordAn()) {
    if (warAn) await invoke("discord_aus").catch(() => undefined);
    warAn = false;
    gesendet = "";
    return;
  }
  warAn = true;
  const a = aktivitaetBauen(lageJetzt());
  const json = JSON.stringify(a);
  if (json === gesendet) return;
  if (!sofort && Date.now() - gesendetUm < ABSTAND) return;
  gesendet = json;
  gesendetUm = Date.now();
  await invoke("discord_setzen", { aktivitaet: a }).catch(() => undefined);
}

/** Verbunden? (für die Einstellungsseite) */
export async function discordVerbunden(): Promise<boolean> {
  if (!inTauri()) return false;
  return invoke<boolean>("discord_status").catch(() => false);
}

/** Beitreten-Link empfangen (leitwerk://beitreten/<Code>, Beta 76) */
export function beitrittPerLink(code: string): void {
  if (!/^\d{6}$/.test(code)) return;
  if (mp.status.rolle === "client" && mp.status.code === code) return;
  const schoen = `${code.slice(0, 3)} ${code.slice(3)}`;
  if (mp.status.rolle === "host") {
    toast(`Beitreten zu ${schoen}: du bist gerade selbst Host – zuerst die Lobby schließen`, "error");
    return;
  }
  if (!hauptmenueBeitreten(code)) toast(`Beitreten zu ${schoen}: im Hauptmenü geht es dann gleich los (zuerst das laufende Spiel verlassen)`);
}

/** Beim Programmstart: nur im Programm (nicht im Browser) und nur im Hauptfenster */
export function discordStarten(): void {
  if (!inTauri() || !hauptfenster()) return;
  // Beitreten-Links: einer, der den Start ausgelöst hat, und alle späteren
  void listen<string>("beitritt-link", (e) => {
    void invoke("beitritt_link_holen").catch(() => undefined);
    beitrittPerLink(e.payload);
  });
  setTimeout(() => {
    void invoke<string | null>("beitritt_link_holen")
      .then((c) => c && beitrittPerLink(c))
      .catch(() => undefined);
  }, 2500);
  setTimeout(() => void schritt(true), 3000);
  setInterval(() => void schritt(), 5000);
  // Einstellung geändert: gleich umsetzen
  let vorher = `${discordAn()}${mitDetails()}`;
  onPers(() => {
    const jetzt = `${discordAn()}${mitDetails()}`;
    if (jetzt === vorher) return;
    vorher = jetzt;
    gesendet = "";
    void schritt(true);
  });
}
