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
import { WETTER_LABEL, lageVon } from "../sim/weather";
import * as ordner from "./spielstandOrdner";
import type { SpielstandInfo } from "./spielstandOrdner";

const FORMAT = "leitwerk-spielstand";

export interface Spielstand {
  format: typeof FORMAT;
  version: 1;
  /** kurze Infos für die Übersicht – steht vorne in der Datei */
  info?: SpielstandInfo;
  gespeichert: number;
  /** Simulationszeit beim Speichern */
  simZeit: number;
  state: SimState;
  store: Persisted;
  multiplayer: { code: string; spieler: string[] } | null;
}

function erstellen(name?: string): Spielstand {
  const st = sim.state;
  const jetzt = Date.now();
  return {
    format: FORMAT,
    version: 1,
    info: {
      name,
      gespeichert: jetzt,
      simZeit: st.zeit,
      funkgruppe: store.settings.funkgruppe ?? "NÖ-03",
      einsaetze: st.einsaetze.length,
      offen: st.einsaetze.filter((e) => e.zustand !== "abgeschlossen").length,
      wetter: st.wetter ? WETTER_LABEL[lageVon(st.wetter.lage)] : undefined,
      spieler: mp.aktiv ? mp.spieler.map((x) => x.name) : undefined,
      version: (document.getElementById("app-version")?.textContent ?? "").replace(/^v/, "") || undefined,
    },
    gespeichert: jetzt,
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

/** Vorschlag für den Namen: Funkgruppe und Spielzeit */
export function standardName(): string {
  const d = new Date(sim.state.zeit);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${store.settings.funkgruppe ?? "NÖ-03"} – ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}.${p(d.getMinutes())} Uhr`;
}

/** Im Spielstand-Ordner speichern; gibt den Dateinamen zurück */
export async function speichernAls(name: string, ersetzen = false): Promise<string> {
  const n = name.trim() || standardName();
  return ordner.schreiben(n, JSON.stringify(erstellen(n)), ersetzen);
}

/** Spielstand aus dem Ordner laden */
export async function ladenDatei(datei: string): Promise<Spielstand> {
  const d = pruefen(await ordner.lesen(datei));
  anwenden(d);
  return d;
}

/** Eine Datei aus dem Ordner woanders hin speichern (z. B. zum Weitergeben) */
export async function exportieren(datei: string): Promise<string | null> {
  return saveTextFile(datei, await ordner.lesen(datei), { name: "LeitWerk-Spielstand", extensions: ["leitwerk"] });
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

/** Sofort automatisch sichern (z. B. vor einem Update) */
export async function jetztSichern(): Promise<void> {
  if (sim.state.einsaetze.length === 0 || sim.pilotTest) return;
  await autosaveWrite(JSON.stringify(erstellen()));
}

let letzteSicherung = "";
/** Jede Minute sichern, solange es etwas zu sichern gibt */
export function autosaveStarten(): void {
  window.setInterval(() => {
    // Testmodus für Piloten: nichts sichern (sonst wäre das eigentliche Spiel überschrieben)
    if (sim.state.einsaetze.length === 0 || sim.pilotTest) return;
    const json = JSON.stringify(erstellen());
    // nur wenn sich etwas geändert hat (gespeichert-Zeit ausgenommen)
    const kern = json.replace(/"gespeichert":\d+,/, "");
    if (kern === letzteSicherung) return;
    letzteSicherung = kern;
    void autosaveWrite(json).catch((e) => console.warn("Automatische Sicherung", e));
  }, 60_000);
}
