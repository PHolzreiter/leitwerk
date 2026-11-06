/**
 * Alarmtöne des Piloten: typische Melder-Töne (hier erzeugt, keine Aufnahmen) und eigene Dateien
 * (gespeichert im Programm und als Kopie in „Dokumente/LeitWerk/Töne“). Getrennt für die Alarmierung
 * und den Abruf aus dem Bereitstellungsraum. Der Ton wiederholt sich, bis quittiert ist (höchstens 1 Minute).
 */
import { ablageSichern } from "../../net/ablage";
import { dateiHinzufuegen, eigeneDateien, type EigeneDatei } from "../sounds";
import rdprio01 from "../../assets/alarm/rdprio01.mp3?url";
import rdprio01Weit from "../../assets/alarm/rdprio01_distant.mp3?url";
import fwprio01 from "../../assets/alarm/fwprio01.mp3?url";
import fwprio01Weit from "../../assets/alarm/fwprio01_distant.mp3?url";
import fwprio02 from "../../assets/alarm/fwprio02.mp3?url";
import fwprio02Weit from "../../assets/alarm/fwprio02_distant.mp3?url";
import martinhorn from "../../assets/alarm/martinhorn.mp3?url";
import martinhornWeit from "../../assets/alarm/martinhorn_distant.mp3?url";

/** Aufnahmen (von Paul): Melder RD/FW, Martinshorn – je nah und aus der Entfernung */
export const ALARM_AUFNAHMEN: Record<string, { name: string; url: string }> = {
  rdprio01: { name: "Melder RD Prio 1", url: rdprio01 },
  rdprio01_weit: { name: "Melder RD Prio 1 (entfernt)", url: rdprio01Weit },
  fwprio01: { name: "Melder FW Prio 1", url: fwprio01 },
  fwprio01_weit: { name: "Melder FW Prio 1 (entfernt)", url: fwprio01Weit },
  fwprio02: { name: "Melder FW Prio 2", url: fwprio02 },
  fwprio02_weit: { name: "Melder FW Prio 2 (entfernt)", url: fwprio02Weit },
  martinhorn: { name: "Martinshorn", url: martinhorn },
  martinhorn_weit: { name: "Martinshorn (entfernt)", url: martinhornWeit },
};

export type AlarmArt = "alarm" | "abruf";

/** Ton: Folge aus [Frequenz Hz (0 = Pause), Dauer s]; welle optional */
interface Vorlage {
  name: string;
  folge: [number, number][];
  welle?: OscillatorType;
  /** Abklingen wie ein Gong statt fester Lautstärke */
  gong?: boolean;
}

const wdh = (n: number, f: [number, number][]): [number, number][] => Array.from({ length: n }, () => f).flat();

export const ALARM_VORLAGEN: Record<string, Vorlage> = {
  fuenfton: {
    name: "Fünftonfolge mit Weckton",
    folge: [[1060, 0.07], [1160, 0.07], [1270, 0.07], [1400, 0.07], [1530, 0.07], [0, 0.5], [1060, 0.07], [1160, 0.07], [1270, 0.07], [1400, 0.07], [1530, 0.07], [0, 0.35], ...wdh(10, [[1240, 0.1], [1080, 0.1]])],
  },
  pager: { name: "Melder – steigende Tonfolge", folge: wdh(3, [[1600, 0.11], [0, 0.03], [1900, 0.11], [0, 0.03], [2200, 0.11], [0, 0.03], [2600, 0.16], [0, 0.35]]), welle: "square" },
  doppel: { name: "Melder – Doppelpiep", folge: wdh(4, [[2400, 0.14], [0, 0.09], [2400, 0.14], [0, 0.45]]), welle: "square" },
  triller: { name: "Melder – Trillerton", folge: wdh(16, [[1800, 0.05], [2300, 0.05]]).concat([[0, 0.3]], wdh(16, [[1800, 0.05], [2300, 0.05]])) },
  dauer: { name: "Melder – Dauerpiepen", folge: wdh(12, [[2800, 0.09], [0, 0.07]]), welle: "square" },
  melodie: { name: "Melder – Melodie", folge: [[1318, 0.15], [1568, 0.15], [2093, 0.15], [1568, 0.15], [2093, 0.3], [0, 0.4], [1318, 0.15], [1568, 0.15], [2093, 0.15], [1568, 0.15], [2093, 0.3]], welle: "triangle" },
  tetra: { name: "TETRA-Alarm (Funkgerät)", folge: wdh(6, [[900, 0.04], [0, 0.015], [900, 0.04], [0, 0.015], [900, 0.06], [0, 0.08], [1800, 0.09], [0, 0.25]]) },
  gong: { name: "Gong", folge: [[660, 0.9], [523, 1.3]], gong: true },
  dringend: { name: "Dringend (bisheriger Ton)", folge: wdh(3, [[880, 0.16], [0, 0.05], [660, 0.16], [0, 0.05], [880, 0.16], [0, 0.35]]), welle: "sawtooth" },
};

const STANDARD: Record<AlarmArt, string> = { alarm: "aufnahme:rdprio01", abruf: "vorlage:pager" };
export const ALARM_STANDARD = STANDARD;
const KEY = "leitwerk.pilot.alarmtoene";

export interface AlarmPrefs {
  alarm: string;
  abruf: string;
  /** 0–100 */
  laut: number;
}

export function alarmPrefs(): AlarmPrefs {
  try {
    return { alarm: STANDARD.alarm, abruf: STANDARD.abruf, laut: 80, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AlarmPrefs>) };
  } catch {
    return { alarm: STANDARD.alarm, abruf: STANDARD.abruf, laut: 80 };
  }
}

export function alarmPrefsSetzen(p: Partial<AlarmPrefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...alarmPrefs(), ...p }));
  } catch {
    /* egal */
  }
}

/** eigene Alarmtöne */
export async function eigeneAlarmtoene(): Promise<EigeneDatei[]> {
  return (await eigeneDateien()).filter((d) => d.art === "alarm");
}

/** eigene Datei hinzufügen (prüft Format, Länge, Größe) und als Kopie in „Dokumente/LeitWerk/Töne“ ablegen */
export async function alarmtonHinzufuegen(f: File): Promise<EigeneDatei> {
  const d = await dateiHinzufuegen(f, "alarm");
  ablageSichern("Töne", f.name, await f.arrayBuffer());
  return d;
}

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const puffer = new Map<string, AudioBuffer>();

/** Ton einmal abspielen; gibt Dauer (s) und Stopp zurück */
export async function alarmtonSpielen(quelle: string, lautProzent = alarmPrefs().laut): Promise<{ dauer: number; stopp(): void }> {
  const c = audio();
  const g = c.createGain();
  g.gain.value = Math.max(0, Math.min(1.5, lautProzent / 100));
  g.connect(c.destination);
  const quellen: AudioScheduledSourceNode[] = [];
  const stopp = () => {
    for (const q of quellen) {
      try {
        q.stop();
      } catch {
        /* schon aus */
      }
    }
    window.setTimeout(() => g.disconnect(), 100);
  };
  if (quelle.startsWith("aufnahme:")) {
    const a = ALARM_AUFNAHMEN[quelle.slice(9)];
    let b = a ? puffer.get(quelle) : undefined;
    if (a && !b) {
      try {
        b = await c.decodeAudioData(await (await fetch(a.url)).arrayBuffer());
        puffer.set(quelle, b);
      } catch {
        b = undefined;
      }
    }
    if (b) {
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(g);
      src.start();
      quellen.push(src);
      return { dauer: b.duration, stopp };
    }
    quelle = "vorlage:fuenfton";
  }
  if (quelle.startsWith("datei:")) {
    const id = quelle.slice(6);
    let b = puffer.get(id);
    if (!b) {
      const d = (await eigeneDateien()).find((x) => x.id === id);
      if (d) {
        b = await c.decodeAudioData(await d.daten.arrayBuffer());
        puffer.set(id, b);
      }
    }
    if (b) {
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(g);
      src.start();
      quellen.push(src);
      return { dauer: b.duration, stopp };
    }
    quelle = "vorlage:fuenfton";
  }
  const v = ALARM_VORLAGEN[quelle.replace(/^vorlage:/, "")] ?? ALARM_VORLAGEN.fuenfton;
  let t = c.currentTime + 0.03;
  for (const [hz, dauer] of v.folge) {
    if (hz > 0) {
      const o = c.createOscillator();
      const h = c.createGain();
      o.type = v.welle ?? "sine";
      o.frequency.value = hz;
      const spitze = v.welle === "square" || v.welle === "sawtooth" ? 0.09 : 0.2;
      h.gain.setValueAtTime(0, t);
      h.gain.linearRampToValueAtTime(spitze, t + 0.004);
      if (v.gong) h.gain.exponentialRampToValueAtTime(0.0005, t + dauer);
      else {
        h.gain.setValueAtTime(spitze, t + dauer - 0.004);
        h.gain.linearRampToValueAtTime(0, t + dauer);
      }
      o.connect(h).connect(g);
      o.start(t);
      o.stop(t + dauer + 0.02);
      quellen.push(o);
    }
    t += dauer;
  }
  return { dauer: t - c.currentTime, stopp };
}

// ---------------------------------------------------------------- wiederholen, bis quittiert

let laufend: { art: AlarmArt; stopp(): void } | null = null;
const MAX_MS = 60_000;

/** Alarmton wiederholen, solange weiter() true ist (höchstens 1 Minute) */
export function alarmStarten(art: AlarmArt, weiter: () => boolean): void {
  alarmStoppen();
  const start = Date.now();
  let aktuell: { stopp(): void } | null = null;
  let timer = 0;
  let aus = false;
  const runde = async () => {
    if (aus || !weiter() || Date.now() - start > MAX_MS) return alarmStoppen();
    const p = alarmPrefs();
    const r = await alarmtonSpielen(p[art], p.laut).catch(() => null);
    if (aus) return r?.stopp();
    aktuell = r;
    timer = window.setTimeout(() => void runde(), Math.max(1500, ((r?.dauer ?? 2) + 1.2) * 1000));
  };
  // zwischendurch prüfen: quittiert → sofort leise
  const pruefen = window.setInterval(() => {
    if (!weiter()) alarmStoppen();
  }, 300);
  laufend = {
    art,
    stopp: () => {
      aus = true;
      window.clearTimeout(timer);
      window.clearInterval(pruefen);
      aktuell?.stopp();
    },
  };
  void runde();
}

export function alarmStoppen(): void {
  laufend?.stopp();
  laufend = null;
  probeStoppen();
}

// ---------------------------------------------------------------- Probe im Einstellungsdialog

let probe: { stopp(): void } | null = null;
let probeNr = 0;

/** Ton einmal zur Probe – stoppt eine laufende Probe; gibt die Dauer (s) zurück */
export async function probeSpielen(quelle: string): Promise<number> {
  probeStoppen();
  const nr = ++probeNr;
  const r = await alarmtonSpielen(quelle).catch(() => null);
  if (!r) return 0;
  if (nr !== probeNr) {
    r.stopp();
    return 0;
  }
  probe = r;
  window.setTimeout(() => {
    if (probe === r) probe = null;
  }, r.dauer * 1000 + 200);
  return r.dauer;
}

export function probeStoppen(): void {
  probeNr++;
  probe?.stopp();
  probe = null;
}

export function probeLaeuft(): boolean {
  return !!probe;
}

export function alarmLaeuft(): AlarmArt | null {
  return laufend?.art ?? null;
}
