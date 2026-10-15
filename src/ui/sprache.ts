/**
 * Sprache: Anrufer und Funk vorlesen (Stimmen des Betriebssystems) und
 * Spracheingabe (Taste halten, sprechen, loslassen → Text im Eingabefeld).
 * Erkannt wird lokal mit Whisper im Programm; im Browser (Entwicklung) mit der Erkennung des Browsers.
 */
import { invoke, Channel } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { el, toast } from "./dom";
import { onPers, pers, setzePers } from "./ws/persoenlich";

// ------------------------------------------------------------ Einstellungen

export interface SprachPrefs {
  /** Anrufer vorlesen (Notruf und KT) */
  vorlesen: boolean;
  /** Funksprüche der Fahrzeuge vorlesen */
  funkVorlesen: boolean;
  /** Lautstärke 0–100 */
  laut: number;
  /** Sprechtempo 70–140 % */
  tempo: number;
  /** gewählte Stimmen (Name), leer = automatisch */
  stimmeW: string;
  stimmeM: string;
  /** Spracheingabe an */
  eingabe: boolean;
  /** Whisper-Modell (Dateiname) */
  modell: string;
  /** Taste zum Sprechen (KeyboardEvent.code) */
  taste: string;
  /** erkannten Text gleich abschicken */
  autoSenden: boolean;
  /** Mikrofon (deviceId), leer = Standard */
  mikro: string;
  /** womit vorgelesen wird: Stimmen des Betriebssystems, Piper oder Supertonic (beide im Programm) */
  stimmeArt: "system" | "piper" | "supertonic";
  /** Ausgabegerät für Stimmen (nur Piper), leer = wie das System */
  geraetStimmen: string;
}

const istMac = /Mac/i.test(navigator.platform || navigator.userAgent);

export const SPRACH_STANDARD: SprachPrefs = {
  vorlesen: true,
  funkVorlesen: true,
  laut: 80,
  tempo: 100,
  stimmeW: "",
  stimmeM: "",
  eingabe: true,
  modell: "ggml-large-v3-turbo-q5_0.bin",
  taste: istMac ? "AltRight" : "F2",
  autoSenden: true,
  mikro: "",
  stimmeArt: "system",
  geraetStimmen: "",
};

export function sprachPrefs(): SprachPrefs {
  return { ...SPRACH_STANDARD, ...(pers().sprache ?? {}) };
}

export function setzeSprache(p: Partial<SprachPrefs>): void {
  setzePers({ sprache: { ...sprachPrefs(), ...p } });
}

// Mikrofon-Knöpfe ein-/ausblenden, wenn die Einstellung wechselt
onPers(() => {
  const aus = !sprachPrefs().eingabe;
  document.querySelectorAll<HTMLElement>(".mikro-knopf").forEach((b) => (b.hidden = aus));
});

export const MODELLE: { name: string; label: string; mb: number }[] = [
  { name: "ggml-base.bin", label: "Schnell – einfache Erkennung", mb: 148 },
  { name: "ggml-small.bin", label: "Mittel – gute Erkennung", mb: 488 },
  { name: "ggml-large-v3-turbo-q5_0.bin", label: "Beste Erkennung (empfohlen)", mb: 574 },
];

export const TASTEN: [string, string][] = [
  ["AltRight", istMac ? "rechte ⌥ Wahltaste" : "AltGr"],
  ["ControlRight", istMac ? "rechte ⌃ Control" : "rechte Strg"],
  ["F2", "F2"],
  ["F4", "F4"],
  ["F6", "F6"],
  ["F7", "F7"],
  ["F8", "F8"],
  ["F9", "F9"],
  ["F10", "F10"],
  ["Backquote", "^ (links oben)"],
];

export function tastenName(code: string): string {
  return TASTEN.find(([c]) => c === code)?.[1] ?? code;
}

// ------------------------------------------------------------ Vorlesen

const synth: SpeechSynthesis | undefined = typeof window !== "undefined" ? window.speechSynthesis : undefined;
let stimmenCache: SpeechSynthesisVoice[] = [];
const stimmenHoerer = new Set<() => void>();

function stimmenLaden(): void {
  if (!synth) return;
  stimmenCache = synth.getVoices().filter((v) => /^de\b|^de[-_]/i.test(v.lang));
  for (const f of stimmenHoerer) f();
}
synth?.addEventListener?.("voiceschanged", stimmenLaden);
stimmenLaden();

/** Name ohne Qualitätszusatz: „Anna (Premium)“ → „anna“ */
function grundName(v: SpeechSynthesisVoice): string {
  return v.name.replace(/\(.*?\)/g, "").replace(/microsoft|google|online|natural|desktop|-.*$/gi, "").trim().toLowerCase();
}

export function deutscheStimmen(): SpeechSynthesisVoice[] {
  if (!stimmenCache.length) stimmenLaden();
  // Österreich zuerst, dann Premium/Neural; je Stimme nur die beste Qualität
  const gut = (v: SpeechSynthesisVoice) => (/AT/i.test(v.lang) ? 4 : 0) + (/premium|neural|natural|online/i.test(v.name) ? 3 : /enhanced|erweitert/i.test(v.name) ? 2 : 0);
  const beste = new Map<string, SpeechSynthesisVoice>();
  for (const v of [...stimmenCache].sort((a, b) => gut(b) - gut(a))) if (!beste.has(grundName(v))) beste.set(grundName(v), v);
  return [...beste.values()].sort((a, b) => gut(b) - gut(a) || a.name.localeCompare(b.name));
}

export function onStimmen(fn: () => void): () => void {
  stimmenHoerer.add(fn);
  return () => stimmenHoerer.delete(fn);
}

export function vorlesenMoeglich(): boolean {
  return !!synth;
}

const FRAUEN = /hedda|katja|anna|petra|helena|marlene|vicki|ingrid|sabina|helga|amala|katharina|elke|seraphina|louisa|gisela|tanja|klara|maja|ingrid|female|frau|weiblich/i;
const MAENNER = /stefan|markus|yannick|hans|viktor|conrad|killian|florian|jonas|bernd|christoph|kasper|ralf|klaus|male|mann|männlich|reed|eddy|grandpa/i;

export function geschlechtVon(v: SpeechSynthesisVoice): "w" | "m" | "?" {
  if (FRAUEN.test(v.name)) return "w";
  if (MAENNER.test(v.name)) return "m";
  return "?";
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function stimmeFuer(g: "w" | "m", schluessel: string): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const p = sprachPrefs();
  const alle = deutscheStimmen();
  const gewaehlt = alle.find((v) => v.name === (g === "w" ? p.stimmeW : p.stimmeM));
  const passend = alle.filter((v) => geschlechtVon(v) === g);
  // je Anrufer eine andere Stimme: zuerst passende (Mann/Frau), sonst irgendeine der installierten
  const pool = passend.length ? passend : alle;
  const voice = gewaehlt ?? (pool.length ? pool[Math.floor(hash(schluessel) * pool.length)] : null);
  // gleiche Stimme für Mann und Frau: Tonhöhe verschieben, damit man sie unterscheidet
  let pitch = 0.92 + hash(schluessel + "p") * 0.16;
  if (voice && geschlechtVon(voice) !== g) pitch += g === "w" ? 0.25 : -0.25;
  return { voice, pitch: Math.max(0.5, Math.min(1.6, pitch)) };
}

/** Text fürs Vorlesen säubern: Regieanweisungen in Klammern, Sternchen, Sonderzeichen */
export function sprechText(t: string): string {
  return t
    .replace(/\([^)]*\)/g, " ")
    .replace(/\*[^*]*\*/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[„“"»«]/g, "")
    // Funkrufnamen sprechen wie am Funk: „75/001“ → „75 1“ (Nullen stumm)
    .replace(/\b(\d{2,3})\/0*(\d+)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

let spricht = 0;
/** Wird gerade vorgelesen? */
export function liestVor(): boolean {
  return spricht > 0 || !!synth?.speaking;
}

// ---- Piper (im Programm): Stimmen, Sprecher und Wiedergabe

export interface PiperStimme {
  name: string;
  label: string;
  g: "w" | "m";
  mb: number;
  /** mehrere Sprecher/Emotionen im Modell */
  sprecher?: Record<string, number>;
}

export const PIPER_STIMMEN: PiperStimme[] = [
  { name: "de_DE-thorsten-medium", label: "Thorsten (Mann, beste Qualität)", g: "m", mb: 64 },
  { name: "de_DE-thorsten_emotional-medium", label: "Thorsten emotional (Mann, ruhig/aufgeregt/flüsternd …)", g: "m", mb: 77, sprecher: { amused: 0, angry: 1, disgusted: 2, drunk: 3, neutral: 4, sleepy: 5, surprised: 6, whisper: 7 } },
  { name: "de_DE-karlsson-low", label: "Karlsson (Mann)", g: "m", mb: 64 },
  { name: "de_DE-pavoque-low", label: "Pavoque (Mann)", g: "m", mb: 64 },
  { name: "de_DE-kerstin-low", label: "Kerstin (Frau)", g: "w", mb: 64 },
  { name: "de_DE-ramona-low", label: "Ramona (Frau)", g: "w", mb: 64 },
  { name: "de_DE-eva_k-x_low", label: "Eva (Frau, einfach)", g: "w", mb: 21 },
];

let piperDa: string[] = [];
/** installierte Piper-Stimmen neu einlesen */
export async function piperStatus(): Promise<string[]> {
  if (!inTauri()) return (piperDa = []);
  piperDa = (await invoke<{ stimmen: string[] }>("stimmen_status").catch(() => ({ stimmen: [] as string[] }))).stimmen;
  return piperDa;
}
if (inTauri()) void piperStatus();

export async function piperLaden(name: string, fortschritt: (done: number, total: number, entpacken: boolean) => void): Promise<void> {
  const ch = new Channel<{ done: number; total: number; entpacken: boolean }>();
  ch.onmessage = (m) => fortschritt(m.done, m.total, m.entpacken);
  await invoke("stimme_laden", { name, onProgress: ch });
  await piperStatus();
}

export async function piperLoeschen(name: string): Promise<void> {
  await invoke("stimme_loeschen", { name });
  await piperStatus();
}

/** Ausgabegeräte (Programm) */
export async function ausgabeGeraete(): Promise<string[]> {
  if (!inTauri()) return [];
  return invoke<string[]>("ton_geraete").catch(() => [] as string[]);
}

const EMOTION_SPRECHER: Record<string, string> = { ruhig: "neutral", gefasst: "neutral", aufgeregt: "surprised", panisch: "surprised" };

function piperFuer(g: "w" | "m", schluessel: string, emotion?: string): { name: string; sid: number } | null {
  const da = PIPER_STIMMEN.filter((v) => piperDa.includes(v.name));
  if (!da.length) return null;
  const passend = da.filter((v) => v.g === g);
  const pool = passend.length ? passend : da;
  const v = pool[Math.floor(hash(schluessel + "piper") * pool.length)];
  const sid = v.sprecher ? (v.sprecher[EMOTION_SPRECHER[emotion ?? ""] ?? "neutral"] ?? 0) : 0;
  return { name: v.name, sid };
}

let kette: Promise<void> = Promise.resolve();
let generation = 0;
let zaehler = 0;

// ---- Supertonic (im Programm): 10 Stimmen, 5 Frauen, 5 Männer

export const SUPERTONIC_STIMMEN: { name: string; g: "w" | "m" }[] = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"].map((n) => ({ name: n, g: n.startsWith("F") ? "w" : "m" }));

let supertonicDa = false;
export async function supertonicStatus(): Promise<boolean> {
  if (!inTauri()) return (supertonicDa = false);
  supertonicDa = (await invoke<{ geladen: boolean }>("supertonic_status").catch(() => ({ geladen: false }))).geladen;
  return supertonicDa;
}
if (inTauri()) void supertonicStatus();

export async function supertonicLaden(fortschritt: (text: string, done: number, total: number) => void): Promise<void> {
  const ch = new Channel<{ text: string; done: number; total: number }>();
  ch.onmessage = (m) => fortschritt(m.text, m.done, m.total);
  await invoke("supertonic_laden", { onProgress: ch });
  await supertonicStatus();
}

export async function supertonicLoeschen(): Promise<void> {
  await invoke("supertonic_loeschen");
  await supertonicStatus();
}

function supertonicFuer(g: "w" | "m", schluessel: string): string {
  const pool = SUPERTONIC_STIMMEN.filter((v) => v.g === g);
  return pool[Math.floor(hash(schluessel + "st") * pool.length)].name;
}

/** Satz mit Piper erzeugen und nacheinander abspielen (der nächste Satz wird schon erzeugt, während einer läuft) */
function piperSagen(text: string, v: { name: string; sid: number }, rate: number): void {
  const p = sprachPrefs();
  imProgrammSagen(invoke<ArrayBuffer>("stimme_erzeugen", { name: v.name, text, sid: v.sid, tempo: Math.max(0.5, Math.min(2, rate * (p.tempo / 100))) }));
}

function supertonicSagen(text: string, stimme: string, rate: number): void {
  const p = sprachPrefs();
  imProgrammSagen(invoke<ArrayBuffer>("supertonic_erzeugen", { stimme, text, tempo: Math.max(0.5, Math.min(2, rate * (p.tempo / 100))) }));
}

/** erzeugtes Audio (4 Byte Rate + f32) der Reihe nach auf dem gewählten Gerät abspielen */
function imProgrammSagen(audio: Promise<ArrayBuffer>): void {
  const p = sprachPrefs();
  const gen = generation;
  const id = `stimme-${++zaehler}`;
  spricht++;
  kette = kette
    .then(async () => {
      if (gen !== generation) return;
      const buf = await audio;
      if (gen !== generation) return;
      const rate = new DataView(buf).getUint32(0, true);
      await invoke("ton_spielen", new Uint8Array(buf.slice(4)), {
        headers: { "x-rate": String(rate), "x-geraet": encodeURIComponent(p.geraetStimmen), "x-laut": String(Math.max(0, p.laut / 100)), "x-id": id },
      });
    })
    .catch((e) => console.warn("Piper", e))
    .finally(() => (spricht = Math.max(0, spricht - 1)));
}

function sagen(text: string, g: "w" | "m", schluessel: string, rate: number, emotion?: string): void {
  const t = sprechText(text);
  if (!t) return;
  const p = sprachPrefs();
  if (p.stimmeArt === "supertonic" && inTauri() && supertonicDa) {
    supertonicSagen(t, supertonicFuer(g, schluessel), rate);
    return;
  }
  if ((p.stimmeArt === "piper" || p.stimmeArt === "supertonic") && inTauri()) {
    const v = piperFuer(g, schluessel, emotion);
    if (v) {
      piperSagen(t, v, rate);
      return;
    }
  }
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(t);
  const { voice, pitch } = stimmeFuer(g, schluessel);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "de-AT";
  u.pitch = pitch;
  u.rate = Math.max(0.5, Math.min(2, rate * (p.tempo / 100)));
  u.volume = Math.max(0, Math.min(1, p.laut / 100));
  spricht++;
  const fertig = () => (spricht = Math.max(0, spricht - 1));
  u.onend = fertig;
  u.onerror = fertig;
  synth.speak(u);
}

/** Alles Vorlesen sofort beenden (Auflegen, Sprechtaste gedrückt) */
export function verstummen(): void {
  spricht = 0;
  generation++;
  synth?.cancel();
  if (inTauri()) void invoke("ton_stopp", { id: "stimme-*" }).catch(() => undefined);
}

const EMOTION_TEMPO: Record<string, number> = { ruhig: 0.95, gefasst: 1, aufgeregt: 1.1, panisch: 1.2 };

/** Anrufer spricht (nur beim Gesprächsführer) */
export function anruferSagt(text: string, a: { geschlecht?: "m" | "w"; emotion?: string; name?: string; sprache?: string } | null | undefined, id: string): void {
  const p = sprachPrefs();
  if (!p.vorlesen || aufnahmeLaeuft) return;
  let rate = EMOTION_TEMPO[a?.emotion ?? "gefasst"] ?? 1;
  if (a?.sprache === "gebrochen") rate *= 0.9;
  sagen(text, a?.geschlecht ?? (hash(id) < 0.5 ? "w" : "m"), `${id}|${a?.name ?? ""}`, rate, a?.emotion);
}

/** Geschlecht aus Name/Rolle raten (KT-Anrufer haben nur Name und Rolle) */
export function geschlechtAusName(t: string): "w" | "m" | undefined {
  if (/\b(frau|schwester|pflegerin|ärztin|tochter|mutter|gattin|ehefrau|maria|anna|elisabeth|sabine|andrea|claudia|julia|lisa|sandra|karin|monika|theresa|sophie|katharina|birgit|ingrid|eva|petra|christina|barbara|susanne|martina|daniela|nicole|silvia|gabriele|renate|helga|brigitte)\b/i.test(t)) return "w";
  if (/\b(herr|pfleger|arzt|sohn|vater|gatte|ehemann|josef|johann|franz|michael|thomas|andreas|stefan|markus|lukas|florian|karl|gerhard|wolfgang|manfred|david|martin|peter|christian|alexander|robert|günther|helmut|walter)\b/i.test(t)) return "m";
  return undefined;
}

/**
 * Vorlesen, während die KI noch schreibt: jeder fertige Satz wird sofort gesprochen,
 * der Rest am Ende. Denk-Abschnitte (<think>) werden übersprungen.
 */
export function satzSprecher(sagen: (satz: string) => void): { token(t: string): void; ende(final: string): void } {
  let roh = "";
  let gesagt = 0;
  let sicht = "";
  const sichtbar = () => {
    let x = roh.replace(/<think>[\s\S]*?<\/think>/g, "");
    const offen = x.indexOf("<think>");
    if (offen >= 0) x = x.slice(0, offen);
    return x.replace(/^\s*(Anrufer(in)?|Ich|Caller)\s*:\s*/i, "");
  };
  return {
    token(t) {
      roh += t;
      sicht = sichtbar();
      for (;;) {
        const rest = sicht.slice(gesagt);
        const m = rest.match(/^[\s\S]*?[.!?…](?=\s)/);
        if (!m) break;
        if (m[0].trim()) sagen(m[0]);
        gesagt += m[0].length;
      }
    },
    ende(final) {
      if (!gesagt) {
        sagen(final);
        return;
      }
      const rest = sicht.slice(gesagt).trim();
      if (rest) sagen(rest);
    },
  };
}

/** Fahrzeug spricht am Funk */
export function funkSagt(funkname: string, text: string): void {
  const p = sprachPrefs();
  if (!p.funkVorlesen || aufnahmeLaeuft) return;
  sagen(text, hash(funkname) < 0.3 ? "w" : "m", funkname, 1.08);
}

/** Probehören in den Einstellungen */
export function probe(g: "w" | "m", piperName?: string, supertonic?: string): void {
  verstummen();
  if (supertonic) {
    supertonicSagen(g === "w" ? "Notruf? Bitte kommen Sie schnell, meine Mutter ist gestürzt und steht nicht mehr auf!" : "Hier 75 1, sind am Einsatzort eingetroffen, kommen.", supertonic, 1);
    return;
  }
  if (piperName) {
    piperSagen(g === "w" ? "Notruf? Bitte kommen Sie schnell, meine Mutter ist gestürzt und steht nicht mehr auf." : "Hier 75 1, sind am Einsatzort eingetroffen, kommen.", { name: piperName, sid: PIPER_STIMMEN.find((v) => v.name === piperName)?.sprecher?.neutral ?? 0 }, 1);
    return;
  }
  sagen(g === "w" ? "Notruf? Bitte kommen Sie schnell, meine Mutter ist gestürzt und steht nicht mehr auf." : "Hier 75 1, sind am Einsatzort eingetroffen, kommen.", g, `probe-${g}`, 1);
}

/** Funk: neue Sprüche der Fahrzeuge in meinen Gesprächen vorlesen */
export function funkVorlesenStarten(sim: {
  state: { funkGespraeche?: { id: number; funkname: string; sprueche: { von: string; text: string }[]; fuehrer: { pid: string } | null }[] };
  onChange(fn: () => void): () => void;
}, ichFuehre: (g: { fuehrer: { pid: string } | null }) => boolean): void {
  const gesehen = new Map<number, number>();
  for (const g of sim.state.funkGespraeche ?? []) gesehen.set(g.id, g.sprueche.length);
  sim.onChange(() => {
    for (const g of sim.state.funkGespraeche ?? []) {
      const n = gesehen.get(g.id) ?? 0;
      if (g.sprueche.length > n) {
        gesehen.set(g.id, g.sprueche.length);
        if (!ichFuehre(g)) continue;
        for (const s of g.sprueche.slice(n)) if (s.von !== "LEO") funkSagt(g.funkname, s.text);
      }
    }
  });
}

// ------------------------------------------------------------ Spracheingabe

export interface SprachZiel {
  input: HTMLInputElement;
  /** kleinere Zahl = wichtiger (Notruf vor KT vor Funk) */
  rang: number;
  /** darf man hier gerade sprechen? */
  aktiv(): boolean;
  /** erkannten Text abschicken */
  senden(): void;
  /** Fachbegriffe, Orte, Funkrufnamen – hilft der Erkennung */
  hinweis?(): string;
  /** Text nachbearbeiten (z. B. „57 001“ → „57/001“) */
  nachher?(t: string): string;
}

const ziele = new Set<SprachZiel>();

/** nur für Tests: eigene Erkennung statt Whisper (Aufnahme läuft wie im Programm) */
export const sprachTest: { erkenner: null | ((audio: Float32Array, hinweis: string) => Promise<string>) } = { erkenner: null };
const programmWeg = () => inTauri() || !!sprachTest.erkenner;
/** Programm nimmt selbst auf (das Fenster darf das Mikrofon auf dem Mac nicht öffnen) */
const nativ = () => inTauri() && !sprachTest.erkenner;
let nativStart: Promise<void> | null = null;
let pegelTimer: ReturnType<typeof setInterval> | null = null;
let aufnahmeLaeuft = false;

function sichtbar(x: HTMLElement): boolean {
  return x.isConnected && !!(x.offsetWidth || x.offsetHeight || x.getClientRects().length);
}

function bestesZiel(): SprachZiel | null {
  const fokus = document.activeElement;
  for (const z of ziele) if (z.input === fokus && z.input.isConnected && z.aktiv()) return z;
  const kandidaten = [...ziele].filter((z) => !z.input.disabled && sichtbar(z.input) && z.aktiv()).sort((a, b) => a.rang - b.rang);
  return kandidaten[0] ?? null;
}

/** Mikrofon-Knopf neben ein Eingabefeld setzen und als Sprechziel anmelden */
export function mikroAnbinden(z: SprachZiel): HTMLElement {
  ziele.add(z);
  const b = el("button", { type: "button", class: "btn small mikro-knopf", title: "" });
  b.textContent = "🎙";
  const titel = () => (b.title = `Gedrückt halten und sprechen (oder Taste ${tastenName(sprachPrefs().taste)} halten)`);
  titel();
  b.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    titel();
    void start(z, b);
  });
  const los = () => void stopp();
  b.addEventListener("pointerup", los);
  b.addEventListener("pointerleave", () => aufnahmeLaeuft && aktuellerKnopf === b && los());
  b.hidden = !sprachPrefs().eingabe;
  // alte, nicht mehr angezeigte Felder aufräumen
  if (ziele.size > 40) for (const x of ziele) if (!x.input.isConnected) ziele.delete(x);
  return b;
}

// Aufnahme
let strom: MediaStream | null = null;
let strMikro = "";
let ctx: AudioContext | null = null;
let quelle: MediaStreamAudioSourceNode | null = null;
let proz: ScriptProcessorNode | null = null;
let stuecke: Float32Array[] = [];
let zielJetzt: SprachZiel | null = null;
let aktuellerKnopf: HTMLElement | null = null;
let browserErk: { stop(): void; ergebnis: Promise<string> } | null = null;
let anzeige: HTMLElement | null = null;
let pegel: HTMLElement | null = null;

function anzeigeZeigen(text: string, art: "hoert" | "denkt"): void {
  if (!anzeige) {
    anzeige = el("div", { class: "sprech-anzeige" });
    document.body.appendChild(anzeige);
  }
  anzeige.className = `sprech-anzeige ${art}`;
  anzeige.innerHTML = "";
  anzeige.append(el("span", { class: "sprech-icon" }, art === "hoert" ? "🎙" : "✍"), el("span", {}, text));
  if (art === "hoert") {
    const bar = el("span", { class: "sprech-pegel" });
    pegel = el("i");
    bar.appendChild(pegel);
    anzeige.appendChild(bar);
  } else pegel = null;
  anzeige.hidden = false;
}

function anzeigeWeg(): void {
  if (anzeige) anzeige.hidden = true;
}

async function mikroOeffnen(): Promise<MediaStream> {
  const p = sprachPrefs();
  if (strom && strMikro === p.mikro && strom.getAudioTracks().some((t) => t.readyState === "live")) return strom;
  strom?.getTracks().forEach((t) => t.stop());
  strom = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: p.mikro ? { exact: p.mikro } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  strMikro = p.mikro;
  return strom;
}

/** Mikrofone (im Browser gibt es die Namen erst nach der ersten Freigabe) */
export async function mikrofone(): Promise<{ deviceId: string; label: string }[]> {
  if (inTauri()) {
    const namen = await invoke<string[]>("sprache_mikrofone").catch(() => [] as string[]);
    return namen.map((n) => ({ deviceId: n, label: n }));
  }
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  } catch {
    return [];
  }
}

type SR = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void };

function browserErkennung(): { stop(): void; ergebnis: Promise<string> } | null {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const C = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = "de-AT";
  r.interimResults = false;
  r.continuous = true;
  let text = "";
  const ergebnis = new Promise<string>((res, rej) => {
    r.onresult = (e) => {
      text = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ");
    };
    r.onerror = (e) => (e.error === "no-speech" || e.error === "aborted" ? res("") : rej(new Error(`Spracherkennung: ${e.error}`)));
    r.onend = () => res(text);
  });
  r.start();
  return { stop: () => r.stop(), ergebnis };
}

async function start(z: SprachZiel | null, knopf?: HTMLElement): Promise<void> {
  const p = sprachPrefs();
  if (!p.eingabe || aufnahmeLaeuft) return;
  if (!z) {
    toast("Gerade gibt es kein Gespräch, in das du sprechen kannst.", "error");
    return;
  }
  aufnahmeLaeuft = true;
  zielJetzt = z;
  aktuellerKnopf = knopf ?? null;
  knopf?.classList.add("an");
  verstummen();
  anzeigeZeigen(`Sprich jetzt … (loslassen zum Beenden)`, "hoert");
  if (!programmWeg()) {
    browserErk = browserErkennung();
    if (!browserErk) {
      aufnahmeLaeuft = false;
      anzeigeWeg();
      knopf?.classList.remove("an");
      toast("Spracheingabe gibt es nur im Programm (nicht in diesem Browser).", "error");
    }
    return;
  }
  if (nativ()) {
    nativStart = invoke<void>("sprache_aufnahme_start", { mikro: p.mikro || null });
    try {
      await nativStart;
    } catch (e) {
      nativStart = null;
      aufnahmeLaeuft = false;
      anzeigeWeg();
      knopf?.classList.remove("an");
      toast(`Mikrofon nicht verfügbar: ${(e as Error).message ?? e}`, "error");
      return;
    }
    pegelTimer = setInterval(() => {
      void invoke<number>("sprache_pegel").then((v) => {
        if (pegel) pegel.style.width = `${Math.min(100, Math.round(v * 400))}%`;
      });
    }, 100);
    return;
  }
  try {
    const s = await mikroOeffnen();
    if (!aufnahmeLaeuft) return; // schon wieder losgelassen
    ctx = new AudioContext();
    quelle = ctx.createMediaStreamSource(s);
    proz = ctx.createScriptProcessor(4096, 1, 1);
    stuecke = [];
    proz.onaudioprocess = (ev) => {
      const d = ev.inputBuffer.getChannelData(0);
      stuecke.push(new Float32Array(d));
      if (pegel) {
        let q = 0;
        for (let i = 0; i < d.length; i += 8) q += d[i] * d[i];
        const rms = Math.sqrt(q / (d.length / 8));
        pegel.style.width = `${Math.min(100, Math.round(rms * 400))}%`;
      }
    };
    quelle.connect(proz);
    proz.connect(ctx.destination);
  } catch (e) {
    aufnahmeLaeuft = false;
    anzeigeWeg();
    knopf?.classList.remove("an");
    toast(`Mikrofon nicht verfügbar: ${(e as Error).message ?? e}`, "error");
  }
}

/** auf 16 kHz umrechnen (lineare Interpolation) */
function auf16k(daten: Float32Array, rate: number): Float32Array {
  if (rate === 16000) return daten;
  const n = Math.floor((daten.length * 16000) / rate);
  const out = new Float32Array(n);
  const f = rate / 16000;
  for (let i = 0; i < n; i++) {
    const x = i * f;
    const a = Math.floor(x);
    const b = Math.min(daten.length - 1, a + 1);
    out[i] = daten[a] + (daten[b] - daten[a]) * (x - a);
  }
  return out;
}

/** typische Whisper-Erfindungen bei Stille */
const FANTASIE = /^(untertitel|vielen dank( für)? (fürs )?zuschauen|copyright|\[?musik\]?|\*.*\*|bis zum nächsten mal|tschüss\.?)/i;

async function stopp(): Promise<void> {
  if (!aufnahmeLaeuft) return;
  aufnahmeLaeuft = false;
  aktuellerKnopf?.classList.remove("an");
  const z = zielJetzt;
  zielJetzt = null;
  let text = "";
  try {
    if (nativStart) {
      const st = nativStart;
      nativStart = null;
      if (pegelTimer) clearInterval(pegelTimer);
      pegelTimer = null;
      await st;
      anzeigeZeigen("Erkenne …", "denkt");
      const p = sprachPrefs();
      const r = await invoke<{ text: string; sekunden: number; pegel: number }>("sprache_aufnahme_stopp", { modell: p.modell, hinweis: z?.hinweis?.() ?? "" });
      if (r.sekunden < 0.3) {
        anzeigeWeg();
        return;
      }
      if (r.pegel < 0.003) {
        anzeigeWeg();
        toast("Nichts gehört – ist das richtige Mikrofon gewählt?", "error");
        return;
      }
      text = r.text;
    } else if (browserErk) {
      anzeigeZeigen("Erkenne …", "denkt");
      const b = browserErk;
      browserErk = null;
      b.stop();
      text = await b.ergebnis;
    } else {
      // kurz nachlaufen lassen, damit das letzte Wort nicht abgeschnitten wird
      await new Promise((r) => setTimeout(r, 250));
      const rate = ctx?.sampleRate ?? 48000;
      quelle?.disconnect();
      proz?.disconnect();
      void ctx?.close();
      ctx = null;
      const laenge = stuecke.reduce((a, s) => a + s.length, 0);
      const alles = new Float32Array(laenge);
      let o = 0;
      for (const s of stuecke) {
        alles.set(s, o);
        o += s.length;
      }
      stuecke = [];
      let q = 0;
      for (let i = 0; i < alles.length; i++) q += alles[i] * alles[i];
      const rms = Math.sqrt(q / Math.max(1, alles.length));
      if (laenge / rate < 0.3) {
        anzeigeWeg();
        return;
      }
      if (rms < 0.004) {
        anzeigeWeg();
        toast("Nichts gehört – ist das richtige Mikrofon gewählt?", "error");
        return;
      }
      anzeigeZeigen("Erkenne …", "denkt");
      text = await (sprachTest.erkenner ?? erkennen)(auf16k(alles, rate), z?.hinweis?.() ?? "");
    }
  } catch (e) {
    anzeigeWeg();
    toast(String((e as Error).message ?? e), "error");
    return;
  }
  anzeigeWeg();
  text = text.replace(/\s+/g, " ").trim();
  if (!text || FANTASIE.test(text)) {
    toast("Nichts verstanden – bitte nochmal.", "error");
    return;
  }
  if (z?.nachher) text = z.nachher(text);
  if (!z || !z.input.isConnected) return;
  const vorher = z.input.value.trim();
  z.input.value = vorher ? `${vorher} ${text}` : text;
  if (sprachPrefs().autoSenden && z.aktiv()) z.senden();
  else z.input.focus();
}

/** Audio (16 kHz) an Whisper im Programm schicken */
export async function erkennen(audio: Float32Array, hinweis: string): Promise<string> {
  const p = sprachPrefs();
  return invoke<string>("sprache_erkennen", new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength), {
    headers: { "x-modell": p.modell, "x-hinweis": encodeURIComponent(hinweis.slice(0, 600)) },
  });
}

// Sprechtaste (gedrückt halten)
let tasteUnten = false;
window.addEventListener(
  "keydown",
  (ev) => {
    const p = sprachPrefs();
    if (!p.eingabe || ev.code !== p.taste) return;
    ev.preventDefault();
    if (ev.repeat || tasteUnten) return;
    tasteUnten = true;
    void start(bestesZiel());
  },
  true,
);
window.addEventListener(
  "keyup",
  (ev) => {
    if (ev.code !== sprachPrefs().taste || !tasteUnten) return;
    ev.preventDefault();
    tasteUnten = false;
    void stopp();
  },
  true,
);
window.addEventListener("blur", () => {
  if (tasteUnten) {
    tasteUnten = false;
    void stopp();
  }
});

// ------------------------------------------------------------ Modelle (Programm)

export interface SprachStatus {
  modelle: string[];
  ordner: string;
}

export async function sprachStatus(): Promise<SprachStatus> {
  if (!inTauri()) return { modelle: [], ordner: "" };
  return invoke<SprachStatus>("sprache_status");
}

export async function modellLaden(name: string, fortschritt: (done: number, total: number) => void): Promise<void> {
  const ch = new Channel<{ done: number; total: number }>();
  ch.onmessage = (m) => fortschritt(m.done, m.total);
  await invoke("sprache_modell_laden", { name, onProgress: ch });
}

export async function modellLoeschen(name: string): Promise<void> {
  await invoke("sprache_modell_loeschen", { name });
}

/** Test in den Einstellungen: Knopf halten, Ergebnis anzeigen */
export function testZiel(input: HTMLInputElement): SprachZiel {
  return { input, rang: 99, aktiv: () => true, senden: () => undefined, hinweis: () => "Notruf 144, Rettungsdienst." };
}

/**
 * Funkrufnamen aus gesprochenem Text: „75 1“, „75-001“, „75 Strich 1“ → „75/001“.
 * Mit Namensliste nur, wenn es das Fahrzeug gibt; ohne Liste nur dreistellige Nummern.
 */
export function funkNamenGlaetten(t: string, namen?: string[]): string {
  const set = namen ? new Set(namen.map((n) => n.toLowerCase())) : null;
  return t.replace(/\b(\d{2,3})(?:\s*(?:schrägstrich|strich|\/|-|–|,|\.)\s*|\s+)(\d{1,3})\b/gi, (ganz, a: string, b: string) => {
    const kand = `${a}/${b.padStart(3, "0")}`;
    if (set) return set.has(kand.toLowerCase()) ? kand : ganz;
    return b.length === 3 ? kand : ganz;
  });
}
