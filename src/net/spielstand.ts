/**
 * Spielstände: das laufende Spiel (Simulation + Daten der Leitstelle) als Datei speichern
 * und wieder laden – allein oder im Multiplayer, von Host und Mitspielern gleichermaßen.
 * Dazu eine automatische Sicherung jede Minute.
 */
import type { Persisted } from "../data/model";
import { store } from "../data/store";
import { autosaveRead, autosaveWrite, pickTextFile, saveTextFile } from "../platform";
import { sim, type SimState } from "../sim/engine";
import { mp } from "./mehrspieler";

const FORMAT = "leitwerk-spielstand";

export interface Spielstand {
  format: typeof FORMAT;
  version: 1;
  gespeichert: number;
  /** Simulationszeit beim Speichern */
  simZeit: number;
  state: SimState;
  store: Persisted;
  multiplayer: { code: string; spieler: string[] } | null;
}

function erstellen(): Spielstand {
  return {
    format: FORMAT,
    version: 1,
    gespeichert: Date.now(),
    simZeit: sim.state.zeit,
    state: sim.state,
    store: store.snapshot(),
    multiplayer: mp.aktiv ? { code: mp.status.code, spieler: mp.spieler.map((s) => s.name) } : null,
  };
}

function dateiname(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `leitwerk-spielstand-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.leitwerk`;
}

/** Speichert den aktuellen Stand in eine Datei. Gibt den Pfad zurück (null = abgebrochen). */
export async function speichern(): Promise<string | null> {
  return saveTextFile(dateiname(), JSON.stringify(erstellen()), { name: "LeitWerk-Spielstand", extensions: ["leitwerk"] });
}

function pruefen(text: string): Spielstand {
  let d: Spielstand;
  try {
    d = JSON.parse(text) as Spielstand;
  } catch {
    throw new Error("Die Datei ist kein LeitWerk-Spielstand");
  }
  if (d.format !== FORMAT || !d.state || !d.store) throw new Error("Die Datei ist kein LeitWerk-Spielstand");
  return d;
}

function anwenden(d: Spielstand): void {
  if (mp.status.rolle === "client") throw new Error("Als Mitspieler kann kein Spielstand geladen werden – zuerst das Spiel verlassen");
  store.enterSession(d.store);
  sim.ladeZustand(d.state);
  if (mp.status.rolle === "host") mp.neuSynchronisieren();
}

/** Lässt eine Datei wählen und lädt den Spielstand. */
export async function laden(): Promise<Spielstand | null> {
  const f = await pickTextFile(".leitwerk,.json");
  if (!f) return null;
  const d = pruefen(f.text);
  anwenden(d);
  return d;
}

/** Infos zur letzten automatischen Sicherung */
export async function autosaveInfo(): Promise<{ gespeichert: number; einsaetze: number; code: string | null } | null> {
  try {
    const t = await autosaveRead();
    if (!t) return null;
    const d = pruefen(t);
    return { gespeichert: d.gespeichert, einsaetze: d.state.einsaetze.length, code: d.multiplayer?.code ?? null };
  } catch {
    return null;
  }
}

export async function autosaveLaden(): Promise<void> {
  const t = await autosaveRead();
  if (!t) throw new Error("Keine automatische Sicherung vorhanden");
  anwenden(pruefen(t));
}

/** Zurück zur eigenen Leitstelle (nach einem geladenen Spielstand). */
export function schliessen(): void {
  if (mp.aktiv) throw new Error("Bitte zuerst das Multiplayer-Spiel verlassen");
  store.leaveSession();
  sim.neu();
}

let letzteSicherung = "";
/** Jede Minute sichern, solange es etwas zu sichern gibt */
export function autosaveStarten(): void {
  window.setInterval(() => {
    if (sim.state.einsaetze.length === 0) return;
    const json = JSON.stringify(erstellen());
    // nur wenn sich etwas geändert hat (gespeichert-Zeit ausgenommen)
    const kern = json.replace(/"gespeichert":\d+,/, "");
    if (kern === letzteSicherung) return;
    letzteSicherung = kern;
    void autosaveWrite(json).catch((e) => console.warn("Automatische Sicherung", e));
  }, 60_000);
}
