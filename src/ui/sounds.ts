/**
 * Töne: mitgelieferte (Web Audio, ohne Dateien) und eigene Dateien (MP3/WAV, im Browser-Speicher IndexedDB).
 * Jedes Ereignis hat eine eigene Auswahl und Lautstärke (Einstellungen → Persönlich).
 */
import { pers } from "./ws/persoenlich";

export type SoundEreignis = "notruf" | "kt" | "funk" | "funkDringend" | "chat" | "warnung";

export const EREIGNIS_LABEL: Record<SoundEreignis, string> = {
  notruf: "Notruf klingelt",
  kt: "KT-Hotline klingelt",
  funk: "Fahrzeug ruft (Funk)",
  funkDringend: "Dringender Funkruf",
  chat: "Neue Chat-Nachricht",
  warnung: "Warnung (verpasster Anruf, Nachforderung …)",
};

/** Klingeltöne wiederholen sich, kurze Töne nicht */
export const IST_KLINGELTON: Record<SoundEreignis, boolean> = { notruf: true, kt: true, funk: false, funkDringend: false, chat: false, warnung: false };

/** Anforderungen an eigene Dateien */
export const DATEI_REGELN = {
  klingel: { maxSek: 10, maxBytes: 1_000_000 },
  kurz: { maxSek: 2, maxBytes: 300_000 },
  formate: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"],
};

interface Synth {
  name: string;
  freqs: number[];
  stoesse: number[];
  dauer: number;
  laut: number;
  welle?: OscillatorType;
}

/** mitgelieferte Töne */
export const VORLAGEN: Record<string, Synth> = {
  buero: { name: "Bürotelefon (2 Stöße)", freqs: [440, 480], stoesse: [0, 0.5], dauer: 0.38, laut: 0.12 },
  tief: { name: "Tief und lang", freqs: [350, 420], stoesse: [0], dauer: 0.9, laut: 0.09 },
  digital: { name: "Digital", freqs: [1046, 1318], stoesse: [0, 0.18, 0.36, 0.6, 0.78, 0.96], dauer: 0.12, laut: 0.06, welle: "triangle" },
  sanft: { name: "Sanft", freqs: [523, 659, 784], stoesse: [0, 0.6], dauer: 0.5, laut: 0.06 },
  gong: { name: "Gong", freqs: [392, 494, 587], stoesse: [0], dauer: 1.3, laut: 0.09 },
  alarm: { name: "Alarm", freqs: [880], stoesse: [0, 0.25, 0.5, 0.75], dauer: 0.18, laut: 0.06, welle: "square" },
  piep: { name: "Funk-Piep (2 Töne)", freqs: [1200], stoesse: [0], dauer: 0.12, laut: 0.04, welle: "square" },
  doppelpiep: { name: "Doppelpiep hoch", freqs: [1500], stoesse: [0, 0.16], dauer: 0.1, laut: 0.04, welle: "square" },
  klick: { name: "Kurzer Klick", freqs: [1800], stoesse: [0], dauer: 0.04, laut: 0.05, welle: "triangle" },
  pling: { name: "Pling", freqs: [1318, 1760], stoesse: [0], dauer: 0.35, laut: 0.06 },
  warnton: { name: "Warnton", freqs: [660, 520], stoesse: [0, 0.22], dauer: 0.2, laut: 0.07, welle: "sawtooth" },
};

/** Standard je Ereignis */
export const STANDARD_SOUND: Record<SoundEreignis, string> = {
  notruf: "vorlage:buero",
  kt: "vorlage:tief",
  funk: "vorlage:piep",
  funkDringend: "vorlage:doppelpiep",
  chat: "vorlage:pling",
  warnung: "vorlage:warnton",
};

const WIEDERHOLUNG: Record<SoundEreignis, number> = { notruf: 3000, kt: 4000, funk: 6000, funkDringend: 4000, chat: 0, warnung: 0 };

let ctx: AudioContext | null = null;
function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function synth(s: Synth, laut: number): void {
  try {
    const c = audio();
    const t0 = c.currentTime;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(c.destination);
    // Funk-Piep: zweiter, tieferer Ton (wie bisher)
    const folgen = s === VORLAGEN.piep ? [[0, 1200], [0.15, 900]] : null;
    const ziel = s.laut * laut;
    for (const start of folgen ? folgen.map((x) => x[0]) : s.stoesse) {
      const freqs = folgen ? [folgen.find((x) => x[0] === start)![1]] : s.freqs;
      for (const f of freqs) {
        const o = c.createOscillator();
        o.type = s.welle ?? "sine";
        o.frequency.value = f;
        o.connect(gain);
        o.start(t0 + start);
        o.stop(t0 + start + s.dauer);
      }
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(ziel, t0 + start + 0.015);
      gain.gain.setValueAtTime(ziel, t0 + start + Math.max(0.02, s.dauer - 0.04));
      gain.gain.linearRampToValueAtTime(0, t0 + start + s.dauer);
    }
  } catch {
    /* kein Ton möglich – egal */
  }
}

// ---------------------------------------------------------------- eigene Dateien (IndexedDB)

export interface EigeneDatei {
  id: string;
  name: string;
  typ: string;
  bytes: number;
  sek: number;
  daten: Blob;
}

const DB = "leitwerk-sounds";
function db(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("dateien", { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}

async function tx<T>(modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fehler) => {
    const r = fn(d.transaction("dateien", modus).objectStore("dateien"));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}

let dateiCache: EigeneDatei[] | null = null;
export async function eigeneDateien(): Promise<EigeneDatei[]> {
  try {
    dateiCache ??= await tx("readonly", (s) => s.getAll() as IDBRequest<EigeneDatei[]>);
  } catch {
    dateiCache = [];
  }
  return dateiCache;
}

/** Datei prüfen und speichern; wirft einen verständlichen Fehler, wenn sie nicht passt */
export async function dateiHinzufuegen(f: File, fuer: "klingel" | "kurz"): Promise<EigeneDatei> {
  const regel = DATEI_REGELN[fuer];
  const endung = f.name.toLowerCase().split(".").pop() ?? "";
  if (!["mp3", "wav"].includes(endung) && !DATEI_REGELN.formate.includes(f.type)) throw new Error(`Falsches Format (${endung || f.type}) – erlaubt sind MP3 und WAV`);
  if (f.size > regel.maxBytes) throw new Error(`Zu groß: ${(f.size / 1_000_000).toFixed(2)} MB – erlaubt sind höchstens ${(regel.maxBytes / 1_000_000).toFixed(1)} MB`);
  let sek = 0;
  try {
    const buf = await audio().decodeAudioData(await f.arrayBuffer());
    sek = buf.duration;
  } catch {
    throw new Error("Die Datei lässt sich nicht abspielen (beschädigt oder kein MP3/WAV)");
  }
  if (sek > regel.maxSek + 0.05) throw new Error(`Zu lang: ${sek.toFixed(1)} s – erlaubt sind ${regel.maxSek} s`);
  const d: EigeneDatei = { id: `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name: f.name, typ: f.type || `audio/${endung}`, bytes: f.size, sek, daten: f };
  await tx("readwrite", (s) => s.put(d));
  dateiCache = null;
  return d;
}

export async function dateiLoeschen(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  dateiCache = null;
  puffer.delete(id);
}

export async function dateiUmbenennen(id: string, name: string): Promise<void> {
  const d = (await eigeneDateien()).find((x) => x.id === id);
  if (!d) return;
  await tx("readwrite", (s) => s.put({ ...d, name }));
  dateiCache = null;
}

const puffer = new Map<string, AudioBuffer>();
async function dateiSpielen(id: string, laut: number): Promise<void> {
  try {
    let b = puffer.get(id);
    if (!b) {
      const d = (await eigeneDateien()).find((x) => x.id === id);
      if (!d) return;
      b = await audio().decodeAudioData(await d.daten.arrayBuffer());
      puffer.set(id, b);
    }
    const c = audio();
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = Math.min(1.5, laut * 0.8);
    src.buffer = b;
    src.connect(g);
    g.connect(c.destination);
    src.start();
  } catch {
    /* egal */
  }
}

// ---------------------------------------------------------------- abspielen

function einstellung(e: SoundEreignis): { quelle: string; laut: number } {
  const s = pers().sounds?.[e];
  return { quelle: s?.quelle ?? STANDARD_SOUND[e], laut: (s?.laut ?? 70) / 70 };
}

/** Ton für ein Ereignis einmal abspielen (auch zum Probehören) */
export function spielen(e: SoundEreignis, quelle?: string, lautProzent?: number): void {
  const s = einstellung(e);
  const q = quelle ?? s.quelle;
  const gesamt = Math.max(0, Math.min(1.6, pers().lautstaerke / 70));
  const laut = (lautProzent !== undefined ? lautProzent / 70 : s.laut) * gesamt;
  if (q === "aus" || laut <= 0) return;
  if (q.startsWith("datei:")) void dateiSpielen(q.slice(6), laut);
  else synth(VORLAGEN[q.replace(/^vorlage:/, "")] ?? VORLAGEN[STANDARD_SOUND[e].slice(8)], laut);
}

const timer = new Map<SoundEreignis, number>();
/** Wiederholender Ton an/aus (Klingeln, Funkruf) */
export function dauerton(e: SoundEreignis, an: boolean, verzoegerung = 0): void {
  const laeuft = timer.has(e);
  if (an && !laeuft) {
    const start = () => spielen(e);
    if (verzoegerung) window.setTimeout(start, verzoegerung);
    else start();
    timer.set(e, window.setInterval(start, WIEDERHOLUNG[e] || 5000));
  } else if (!an && laeuft) {
    window.clearInterval(timer.get(e));
    timer.delete(e);
  }
}

/** Chat- und Warnungstöne: auf neue Nachrichten im Zustand achten */
export function soundBeobachterStarten(sim: {
  state: { chat?: { von: string }[]; funk: { id: number; art: string; von: string }[] };
  onChange(fn: () => void): () => void;
}, ichName: () => string): void {
  let chatN = sim.state.chat?.length ?? 0;
  let letzteWarnung = Math.max(0, ...sim.state.funk.map((f) => f.id));
  let zuletzt = 0;
  sim.onChange(() => {
    const chat = sim.state.chat ?? [];
    if (chat.length > chatN) {
      const neu = chat.slice(chatN);
      if (neu.some((m) => m.von !== ichName())) spielen("chat");
    }
    chatN = chat.length;
    const w = sim.state.funk.filter((f) => f.art === "warnung" && f.id > letzteWarnung);
    if (w.length) {
      letzteWarnung = Math.max(...w.map((f) => f.id));
      const jetzt = Date.now();
      if (jetzt - zuletzt > 4000 && w.some((f) => f.von !== "Wetterdienst")) {
        zuletzt = jetzt;
        spielen("warnung");
      }
    }
  });
}
