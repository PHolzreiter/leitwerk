/**
 * Sprache: Anrufer und Funk vorlesen (Stimmen des Betriebssystems) und
 * Spracheingabe (Taste halten, sprechen, loslassen → Text im Eingabefeld).
 * Erkannt wird lokal mit Whisper im Programm; im Browser (Entwicklung) mit der Erkennung des Browsers.
 */
import { funkTextGlaetten, zahlenAlsZiffern } from "../sim/funkErkennung";
import { invoke, Channel } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { el, toast } from "./dom";
import { onPers, pers, setzePers } from "./ws/persoenlich";
import { FunkKodierer } from "./funkCodec";

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
  /** Ausgabegerät für die Stimmen im Funk (Piper/Supertonic), leer = wie die Stimmen am Telefon */
  geraetFunk: string;
  /** Mikrofon für den Funk, leer = wie das Mikrofon fürs Telefon */
  mikroFunk: string;
  /** Funktaste (gedrückt halten): spricht in die am Funkgerät gewählte Sprechgruppe */
  funkTaste: string;
  /** eigene Funktasten je Sprechgruppe (leer = keine): normale Gruppe, RD-NOE-09, RD-NOE-10 */
  funkTasteNormal: string;
  funkTaste09: string;
  funkTaste10: string;
  /** Sprechfunk: Funk-Klang (blechern, kurzes Rauschen beim Loslassen) */
  klangfilter: boolean;
  /** Lautstärke des Sprechfunks (Stimmen der Mitspieler) 0–100 */
  funkLaut: number;
  /** Pilot: übrigen Funkverkehr (Fahrzeuge ↔ Leitstelle) mithören */
  mithoeren: boolean;
  /** Pilot: Lautstärke des mitgehörten Funkverkehrs 0–100 (Anteil der normalen Lautstärke) */
  mithoerenLaut: number;
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
  geraetFunk: "",
  mikroFunk: "",
  funkTaste: "F4",
  funkTasteNormal: "",
  funkTaste09: "",
  funkTaste10: "",
  klangfilter: true,
  funkLaut: 90,
  mithoeren: true,
  mithoerenLaut: 50,
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

/** Dauer der letzten Spracherkennung in ms (Test „Schnelles Gespräch“) */
export let erkennZeit = 0;

export const MODELLE: { name: string; label: string; mb: number }[] = [
  { name: "ggml-base.bin", label: "Schnell – einfache Erkennung", mb: 148 },
  { name: "ggml-small.bin", label: "Mittel – gute Erkennung", mb: 488 },
  { name: "ggml-large-v3-turbo-q5_0.bin", label: "Beste Erkennung (empfohlen)", mb: 574 },
  { name: "parakeet-tdt-0.6b-v3", label: "Neu (Test): Parakeet – sehr schnell, auch ohne Grafikkarte", mb: 640 },
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
  if (!code) return "–";
  const fest = TASTEN.find(([c]) => c === code)?.[1];
  if (fest) return fest;
  const m = code.match(/^Key([A-Z])$/) ?? code.match(/^Digit(\d)$/);
  if (m) return m[1];
  const np = code.match(/^Numpad(.+)$/);
  if (np) return `Num ${({ Add: "+", Subtract: "−", Multiply: "×", Divide: "÷", Decimal: ",", Enter: "Enter" } as Record<string, string>)[np[1]] ?? np[1]}`;
  const namen: Record<string, string> = {
    Space: "Leertaste", Tab: "Tab", CapsLock: "Feststelltaste", ShiftLeft: "linke ⇧", ShiftRight: "rechte ⇧",
    ControlLeft: istMac ? "linke ⌃ Control" : "linke Strg", AltLeft: istMac ? "linke ⌥ Wahltaste" : "Alt", MetaLeft: istMac ? "linke ⌘" : "Windows", MetaRight: istMac ? "rechte ⌘" : "rechte Windows",
    Insert: "Einfg", Delete: "Entf", Home: "Pos1", End: "Ende", PageUp: "Bild ↑", PageDown: "Bild ↓", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Minus: "ß", Equal: "´", BracketLeft: "Ü", BracketRight: "+", Semicolon: "Ö", Quote: "Ä", Backslash: "#", Comma: ",", Period: ".", Slash: "-", IntlBackslash: "<", Pause: "Pause", ScrollLock: "Rollen", ContextMenu: "Menü",
  };
  return namen[code] ?? code;
}

/** Tasten, die man nicht belegen kann (Esc bricht ab, Enter/Rücktaste braucht man zum Schreiben) */
const NICHT_BELEGBAR = new Set(["Escape", "Enter", "Backspace"]);

/**
 * Feld für eine frei wählbare Taste: draufklicken → „Taste drücken …“ → die nächste Taste wird übernommen.
 * Esc bricht ab; mit leer = true gibt es ein ✕ zum Entfernen (für zusätzliche Tasten).
 */
export function tastenFeld(wert: () => string, setzen: (code: string) => string | null, opt: { leer?: boolean } = {}): HTMLElement {
  const box = document.createElement("span");
  box.className = "taste-feld";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn small taste-feld-b";
  const zeigen = () => (b.textContent = wert() ? tastenName(wert()) : "keine");
  zeigen();
  let warte = false;
  b.addEventListener("click", () => {
    if (warte) return;
    warte = true;
    tastenBelegung.aktiv = true;
    b.textContent = "Taste drücken …";
    b.classList.add("wartet");
    const fertig = () => {
      warte = false;
      setTimeout(() => (tastenBelegung.aktiv = false), 0);
      b.classList.remove("wartet");
      window.removeEventListener("keydown", taste, true);
      window.removeEventListener("mousedown", weg, true);
      zeigen();
    };
    const taste = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (ev.code === "Escape" || NICHT_BELEGBAR.has(ev.code)) {
        if (ev.code !== "Escape") toast(`${ev.code === "Enter" ? "Enter" : "Die Rücktaste"} braucht man zum Schreiben – bitte eine andere Taste`, "error");
        return fertig();
      }
      const fehler = setzen(ev.code);
      if (fehler) toast(fehler, "error");
      fertig();
    };
    const weg = (ev: MouseEvent) => {
      if (ev.target !== b) fertig();
    };
    window.addEventListener("keydown", taste, true);
    window.addEventListener("mousedown", weg, true);
  });
  box.appendChild(b);
  if (opt.leer) {
    const x = document.createElement("button");
    x.type = "button";
    x.className = "btn small taste-feld-x";
    x.title = "Taste entfernen";
    x.textContent = "✕";
    x.addEventListener("click", () => {
      setzen("");
      zeigen();
    });
    box.appendChild(x);
  }
  return box;
}
/** gerade wird eine Taste belegt: Sprech- und Funktaste reagieren dann nicht */
export const tastenBelegung = { aktiv: false };

// ------------------------------------------------------------ Vorlesen

const synth: SpeechSynthesis | undefined = typeof window !== "undefined" ? window.speechSynthesis : undefined;
let stimmenCache: SpeechSynthesisVoice[] = [];
const stimmenHoerer = new Set<() => void>();

function stimmenLaden(melden = true): void {
  if (!synth) return;
  stimmenCache = synth.getVoices().filter((v) => /^de\b|^de[-_]/i.test(v.lang));
  // nur bei echten Änderungen (voiceschanged) melden – sonst Endlosschleife, wenn es keine deutschen Stimmen gibt
  if (melden) for (const f of stimmenHoerer) f();
}
synth?.addEventListener?.("voiceschanged", () => stimmenLaden());
stimmenLaden();

/** Name ohne Qualitätszusatz: „Anna (Premium)“ → „anna“ */
function grundName(v: SpeechSynthesisVoice): string {
  return v.name.replace(/\(.*?\)/g, "").replace(/microsoft|google|online|natural|desktop|-.*$/gi, "").trim().toLowerCase();
}

export function deutscheStimmen(): SpeechSynthesisVoice[] {
  if (!stimmenCache.length) stimmenLaden(false);
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
  let pitch = 0.84 + hash(schluessel + "p") * 0.32;
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
    // Telefonnummern Ziffer für Ziffer: „0664 123456“ → „0 6 6 4 1 2 3 …“
    .replace(/(\+43|\b0)[\d /-]{5,}\d/g, (m) => `${m.startsWith("+") ? "plus " : ""}${m.replace(/\D/g, "").split("").join(" ")}`)
    // Funkrufnamen mit Pause: „69/902“ → „69, 902“; „75/001“ → „75, 1“ (Nullen stumm)
    .replace(/\b(\d{2,3})\/0*(\d+)\b/g, "$1, $2")
    // Postleitzahl vor dem Ort: „3481 Fels“ → „34, 81 Fels“
    .replace(/\b([1-9]\d)(\d{2})(?=\s+(?!(?:Jänner|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Uhr|Euro|Meter|Kilometer|Stück|Patienten|Personen)\b)[A-ZÄÖÜ][a-zäöüß])/g, (_m, a: string, b: string) => (b === "00" ? `${a} hundert` : `${a}, ${b}`))
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

const EMOTION_SPRECHER: Record<string, string> = {
  ruhig: "neutral",
  gefasst: "neutral",
  aufgeregt: "surprised",
  panisch: "surprised",
  sehr_panisch: "surprised",
  extrem_panisch: "surprised",
  // besondere Arten (gehen vor)
  wuetend: "angry",
  ungeduldig: "angry",
  betrunken: "drunk",
  geschockt: "sleepy",
  verwirrt: "sleepy",
  beschaemt: "whisper",
  dramatisch: "surprised",
};

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
/**
 * ton = Tonhöhe (1 = unverändert): schneller/langsamer abspielen verschiebt die Tonhöhe,
 * das Sprechtempo wird beim Erzeugen ausgeglichen – so klingt dieselbe Stimme höher oder tiefer.
 */
function piperSagen(text: string, v: { name: string; sid: number }, rate: number, laut = 1, ton = 1, fertig?: () => void, geraet?: string): void {
  const p = sprachPrefs();
  imProgrammSagen(invoke<ArrayBuffer>("stimme_erzeugen", { name: v.name, text, sid: v.sid, tempo: Math.max(0.5, Math.min(2, (rate * (p.tempo / 100)) / ton)) }), laut, ton, fertig, geraet);
}

function supertonicSagen(text: string, stimme: string, rate: number, laut = 1, ton = 1, fertig?: () => void, geraet?: string): void {
  const p = sprachPrefs();
  imProgrammSagen(invoke<ArrayBuffer>("supertonic_erzeugen", { stimme, text, tempo: Math.max(0.5, Math.min(2, (rate * (p.tempo / 100)) / ton)) }), laut, ton, fertig, geraet);
}

/** erzeugtes Audio (4 Byte Rate + f32) der Reihe nach auf dem gewählten Gerät abspielen */
function imProgrammSagen(audio: Promise<ArrayBuffer>, laut = 1, ton = 1, fertig?: () => void, geraet?: string): void {
  const p = sprachPrefs();
  const gen = generation;
  const id = `stimme-${++zaehler}`;
  spricht++;
  kette = kette
    .then(async () => {
      if (gen !== generation) return;
      const buf = await audio;
      if (gen !== generation) return;
      const rate = Math.round(new DataView(buf).getUint32(0, true) * ton);
      await invoke("ton_spielen", new Uint8Array(buf.slice(4)), {
        headers: { "x-rate": String(rate), "x-geraet": encodeURIComponent(geraet ?? p.geraetStimmen), "x-laut": String(Math.max(0, (p.laut / 100) * laut)), "x-id": id },
      });
    })
    .catch((e) => console.warn("Piper", e))
    .finally(() => {
      spricht = Math.max(0, spricht - 1);
      fertig?.();
    });
}

function sagen(text: string, g: "w" | "m", schluessel: string, rate: number, emotion?: string, laut = 1, danach?: () => void, geraet?: string): void {
  const t = sprechText(text);
  if (!t) return danach?.();
  const p = sprachPrefs();
  // jede Person eine eigene Tonhöhe (± 10 %), damit gleiche Grundstimmen verschieden klingen
  const ton = 0.9 + hash(`${schluessel}|ton`) * 0.2;
  if (p.stimmeArt === "supertonic" && inTauri() && supertonicDa) {
    supertonicSagen(t, supertonicFuer(g, schluessel), rate, laut, ton, danach, geraet);
    return;
  }
  if ((p.stimmeArt === "piper" || p.stimmeArt === "supertonic") && inTauri()) {
    const v = piperFuer(g, schluessel, emotion);
    if (v) {
      piperSagen(t, v, rate, laut, ton, danach, geraet);
      return;
    }
  }
  if (!synth) return danach?.();
  const u = new SpeechSynthesisUtterance(t);
  const { voice, pitch } = stimmeFuer(g, schluessel);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "de-AT";
  u.pitch = pitch;
  u.rate = Math.max(0.5, Math.min(2, rate * (p.tempo / 100)));
  u.volume = Math.max(0, Math.min(1, (p.laut / 100) * laut));
  spricht++;
  const fertig = () => {
    spricht = Math.max(0, spricht - 1);
    danach?.();
  };
  u.onend = fertig;
  u.onerror = fertig;
  synth.speak(u);
}

/** Alles Vorlesen sofort beenden (Auflegen, Sprechtaste gedrückt) */
export const verstummHoerer = new Set<() => void>();
export function verstummen(): void {
  for (const f of verstummHoerer) f();
  spricht = 0;
  generation++;
  synth?.cancel();
  if (inTauri()) void invoke("ton_stopp", { id: "stimme-*" }).catch(() => undefined);
}

const EMOTION_TEMPO: Record<string, number> = { ruhig: 0.95, gefasst: 1, aufgeregt: 1.1, panisch: 1.2, sehr_panisch: 1.28, extrem_panisch: 1.35 };
/** besondere Arten verändern das Tempo zusätzlich */
const ART_TEMPO: Record<string, number> = { geschockt: 0.85, betrunken: 0.85, verwirrt: 0.88, weinend: 0.92, beschaemt: 0.95, ungeduldig: 1.08, wuetend: 1.05, dramatisch: 1.05 };

/** Anrufer spricht (nur beim Gesprächsführer) */
export function anruferSagt(text: string, a: { geschlecht?: "m" | "w"; emotion?: string; stimmungArt?: string; name?: string; sprache?: string } | null | undefined, id: string): void {
  const p = sprachPrefs();
  if (!p.vorlesen || aufnahmeLaeuft) return;
  // jeder Anrufer redet von Haus aus etwas schneller oder langsamer
  let rate = (EMOTION_TEMPO[a?.emotion ?? "gefasst"] ?? 1) * (ART_TEMPO[a?.stimmungArt ?? ""] ?? 1) * (0.92 + hash(`${id}|${a?.name ?? ""}|eigen`) * 0.16);
  if (a?.sprache === "gebrochen") rate *= 0.9;
  sagen(text, a?.geschlecht ?? (hash(id) < 0.5 ? "w" : "m"), `${id}|${a?.name ?? ""}`, rate, a?.stimmungArt && EMOTION_SPRECHER[a.stimmungArt] ? a.stimmungArt : a?.emotion);
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

/** Fahrzeug spricht am Funk (laut = Anteil der normalen Lautstärke) */
export function funkSagt(funkname: string, text: string, laut = 1, melden?: { beginn?: () => void; ende?: () => void }): void {
  const p = sprachPrefs();
  if (!p.funkVorlesen || aufnahmeLaeuft || aufnahmeSperre.funk || laut <= 0) return;
  melden?.beginn?.();
  // Töne des Funkgeräts davor und danach
  const ton = funkTonHaken.ton;
  let fertig = false;
  const ende = () => {
    if (fertig) return;
    fertig = true;
    const nach = ton?.("ende", laut) ?? 0;
    if (melden?.ende) setTimeout(melden.ende, nach);
  };
  const los = () => {
    // jedes Fahrzeug spricht etwas anders schnell (sonst klingen alle gleich)
    sagen(funkAussprache(text), hash(funkname) < 0.3 ? "w" : "m", funkname, 0.98 + hash(`${funkname}|tempo`) * 0.2, undefined, laut, ende, sprachPrefs().geraetFunk || undefined);
    // falls die Stimme kein Ende meldet
    setTimeout(ende, 2500 + text.split(/\s+/).length * 600);
  };
  const vorlauf = ton?.("beginn", laut) ?? 0;
  if (vorlauf > 0) setTimeout(los, vorlauf);
  else los();
}

/** Ortsnamen im erkannten Text richtigstellen (ui/ortNamen.ts, gesetzt in main.ts) */
export const ortHaken: { glaetten: null | ((t: string) => string) } = { glaetten: null };

/** Töne des Funkgeräts (ui/sprechfunk.ts setzt das): gibt zurück, wie lange der Ton dauert (ms) */
export const funkTonHaken: { ton: null | ((art: "beginn" | "ende", laut: number) => number) } = { ton: null };

const ZAHL_MAL: Record<string, string> = { "1": "einmal", "2": "zweimal", "3": "dreimal", "4": "viermal", "5": "fünfmal", "6": "sechsmal", "7": "siebenmal", "8": "achtmal", "9": "neunmal", "10": "zehnmal" };

/** Am Funk geschrieben wie üblich („Pat.“, „St. Pölten“), vorgelesen ausgesprochen („Patient“, „Sankt Pölten“) */
export function funkAussprache(t: string): string {
  return t
    .replace(/\b(\d+)\s?[x×]\s?(?=[A-ZÄÖÜa-zäöü])/g, (_m, n: string) => `${ZAHL_MAL[n] ?? `${n} mal`} `)
    // Funkrufnamen wie gesprochen: „75/001“ → „75 1“
    .replace(/\b(\d{2,3})\/0*(\d+)\b/g, "$1 $2")
    .replace(/\bPat\.?(?=\s|,|$)/g, "Patient")
    .replace(/\bPatin\b/g, "Patientin")
    .replace(/\bSt\.\s?(?=[A-ZÄÖÜ])/g, "Sankt ")
    .replace(/\bKH\b/g, "Krankenhaus")
    .replace(/\bNA\b/g, "Notarzt")
    .replace(/\bNEF\b/g, "Neff")
    .replace(/\bca\.\s?/g, "circa ")
    .replace(/\bC\s?(\d+)\b/g, "C $1")
    .replace(/\bLK\b/g, "Landesklinikum")
    .replace(/\bUK\b/g, "Universitätsklinikum")
    .replace(/\bZNA\b/g, "Notaufnahme")
    .replace(/\bV\.\s?a\.\s?/gi, "Verdacht auf ")
    .replace(/\bz\.\s?B\.\s?/g, "zum Beispiel ");
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

type VorleseGespraech = { id: number; fzId: string; funkname: string; an?: { fzId: string } | null; sprueche: { von: string; text: string; stimme?: boolean }[]; fuehrer: { pid: string } | null };

/**
 * Funk: neue Sprüche vorlesen. laut(g, spruch) sagt, wie laut (0 = gar nicht, 1 = normal).
 * Von Menschen gesprochene Sprüche (live übertragen) werden nie noch einmal vorgelesen.
 */
export function funkVorlesenStarten(sim: { state: { funkGespraeche?: VorleseGespraech[] }; onChange(fn: () => void): () => void }, laut: (g: VorleseGespraech, s: { von: string; text: string }) => number): void {
  const gesehen = new Map<number, number>();
  for (const g of sim.state.funkGespraeche ?? []) gesehen.set(g.id, g.sprueche.length);
  sim.onChange(() => {
    for (const g of sim.state.funkGespraeche ?? []) {
      const n = gesehen.get(g.id) ?? 0;
      if (g.sprueche.length > n) {
        gesehen.set(g.id, g.sprueche.length);
        g.sprueche.slice(n).forEach((s, k) => {
          if (s.stimme) return;
          const l = laut(g, s);
          const h = funkVorleseHaken.nimm;
          // Cloud-Stimme (spricht selbst oder kommt von einem Mitspieler)? Sonst hier vorlesen
          // wer das Gespräch führt, meldet, wann die Stimme fertig ist (dann ist der Kanal gleich frei)
          const melden = { beginn: () => funkVorleseHaken.beginn?.(g), ende: () => funkVorleseHaken.fertig?.(g) };
          if (h) void h(g, n + k, s).then((ok) => !ok && l > 0 && funkSagt(s.von, s.text, l, melden));
          else if (l > 0) funkSagt(s.von, s.text, l, melden);
        });
      }
    }
  });
}

/** Funk mit Cloud-Stimmen (ui/funkStimmen.ts): true = dieser Spruch wird schon mit Stimme übertragen */
export const funkVorleseHaken: {
  nimm: null | ((g: VorleseGespraech, i: number, s: { von: string; text: string }) => Promise<boolean>);
  beginn?: (g: VorleseGespraech) => void;
  fertig?: (g: VorleseGespraech) => void;
} = { nimm: null };
/** Funk mitschreiben über die Cloud statt der Erkennung hier (ui/funkStimmen.ts) */
export const funkHoerHaken: { strom: null | (() => { stueck(b64: string): void; ende(): Promise<string>; abbrechen(): void } | null) } = { strom: null };

// ------------------------------------------------------------ Spracheingabe

export interface SprachZiel {
  input: HTMLInputElement;
  /** kleinere Zahl = wichtiger (Notruf vor KT vor Funk) */
  rang: number;
  /** darf man hier gerade sprechen? */
  aktiv(): boolean;
  /** erkannten Text abschicken (gesprochen = kam aus der Spracheingabe) */
  senden(gesprochen?: boolean): void;
  /** Funk-Eingabe: die Sprache geht im Mehrspieler zusätzlich live an alle (Sprechfunk) */
  funk?: boolean;
  /** Fachbegriffe, Orte, Funkrufnamen – hilft der Erkennung */
  hinweis?(): string;
  /** Text nachbearbeiten (z. B. „57 001“ → „57/001“) */
  nachher?(t: string): string;
  /** Cloud-Anrufer: die Sprache geht direkt (16 kHz, Base64) an die Cloud statt an die Erkennung hier */
  live?(): LiveStrom | null;
}

export interface LiveStrom {
  stueck(b64: string): void;
  ende(): Promise<void>;
  abbrechen(): void;
}

let liveJetzt: LiveStrom | null = null;
let hoerJetzt: { ende(): Promise<string> } | null = null;

/** 16 kHz, 16 Bit, Base64 → Float-Samples */
function pcm16AusB64(b64: string): Float32Array {
  const t = atob(b64);
  const n = Math.floor(t.length / 2);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = t.charCodeAt(2 * i) | (t.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    f[i] = v / 32768;
  }
  return f;
}

/** Freisprechen (ui/freisprechen.ts): läuft eine Daueraufnahme? Die Sprechtaste unterbricht sie kurz (z. B. für den Funk) */
export const dauerAufnahme: { laeuft: () => boolean; pause: () => Promise<void>; weiter: () => void } = { laeuft: () => false, pause: async () => undefined, weiter: () => undefined };
let dauerPausiert = false;
let liveWeb: { ctx: AudioContext; q: MediaStreamAudioSourceNode; p: ScriptProcessorNode } | null = null;

/** Float-Samples → 16 kHz, 16 Bit, Base64 (Browser-Weg) */
export function pcm16b64(d: Float32Array, rate: number): string {
  const x = auf16k(d, rate);
  const u = new Uint8Array(x.length * 2);
  const v = new DataView(u.buffer);
  for (let i = 0; i < x.length; i++) v.setInt16(i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

const ziele = new Set<SprachZiel>();

/** Sprechfunk (ui/sprechfunk.ts): sperrt die Spracheingabe, solange gefunkt wird; schickt Funk-Eingaben live mit */
export const aufnahmeSperre = { funk: false };
export const funkHaken: { start: null | (() => ((b64: string) => void) | null); ende: null | (() => void) } = { start: null, ende: null };
let funkStueck: ((b64: string) => void) | null = null;
let funkKod: FunkKodierer | null = null;

/** Läuft gerade eine Spracheingabe (Notruf, KT, Funk)? */
export function aufnahmeLaeuftJetzt(): boolean {
  return aufnahmeLaeuft;
}

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
  if (!p.eingabe || aufnahmeLaeuft || aufnahmeSperre.funk) return;
  if (!z) {
    toast("Gerade gibt es kein Gespräch, in das du sprechen kannst.", "error");
    return;
  }
  if (dauerAufnahme.laeuft()) {
    // Freisprechen im Notruf: dort braucht es keine Taste
    if (z.live) {
      toast("Freisprechen ist an – einfach reden, ohne Taste.");
      return;
    }
    dauerPausiert = true;
    await dauerAufnahme.pause();
  }
  aufnahmeLaeuft = true;
  zielJetzt = z;
  aktuellerKnopf = knopf ?? null;
  knopf?.classList.add("an");
  verstummen();
  anzeigeZeigen(`Sprich jetzt … (loslassen zum Beenden)`, "hoert");
  // Cloud-Anrufer: die Stimme geht direkt an die Cloud
  liveJetzt = z.live?.() ?? null;
  // Funk mit Cloud-Mitschrift: die Stimme geht an die Cloud (und im Mehrspieler live an alle)
  if (!liveJetzt && z.funk) {
    const m = funkHoerHaken.strom?.() ?? null;
    if (m) {
      hoerJetzt = m;
      funkStueck = programmWeg() ? (funkHaken.start?.() ?? null) : null;
      funkKod = funkStueck ? new FunkKodierer(16000, funkStueck) : null;
      liveJetzt = {
        stueck: (b64) => {
          m.stueck(b64);
          if (funkKod) funkKod.daten(pcm16AusB64(b64));
        },
        ende: async () => undefined,
        abbrechen: () => m.abbrechen(),
      };
    }
  }
  if (liveJetzt) {
    anzeigeZeigen("Sprich jetzt … der Anrufer hört direkt zu (loslassen zum Beenden)", "hoert");
    const ls = liveJetzt;
    try {
      if (inTauri()) {
        const kanal = new Channel<string>();
        kanal.onmessage = (b64) => ls.stueck(b64);
        nativStart = invoke<void>("live_aufnahme_start", { mikro: p.mikro || null, kanal });
        await nativStart;
        pegelTimer = setInterval(() => {
          void invoke<number>("sprache_pegel").then((v) => {
            if (pegel) pegel.style.width = `${Math.min(100, Math.round(v * 400))}%`;
          });
        }, 100);
      } else {
        const st = await mikroOeffnen();
        const c = new AudioContext();
        const q = c.createMediaStreamSource(st);
        const pr = c.createScriptProcessor(4096, 1, 1);
        pr.onaudioprocess = (ev) => ls.stueck(pcm16b64(ev.inputBuffer.getChannelData(0), c.sampleRate));
        q.connect(pr);
        pr.connect(c.destination);
        liveWeb = { ctx: c, q, p: pr };
      }
    } catch (e) {
      nativStart = null;
      liveJetzt = null;
      hoerJetzt = null;
      funkStueckEnde();
      ls.abbrechen();
      aufnahmeLaeuft = false;
      anzeigeWeg();
      knopf?.classList.remove("an");
      toast(`Mikrofon nicht verfügbar: ${(e as Error).message ?? e}`, "error");
    }
    return;
  }
  // Funk im Mehrspieler: die Stimme geht live an alle (wie beim Sprechfunk mit Piloten)
  funkStueck = z.funk && programmWeg() ? (funkHaken.start?.() ?? null) : null;
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
    let funk: Channel<string> | null = null;
    if (funkStueck) {
      const f = funkStueck;
      funk = new Channel<string>();
      funk.onmessage = (b64) => f(b64);
    }
    nativStart = funk ? invoke<void>("funk_aufnahme_start", { mikro: p.mikroFunk || p.mikro || null, funk }) : invoke<void>("sprache_aufnahme_start", { mikro: p.mikro || null });
    try {
      await nativStart;
      // Sprachmodell schon während des Sprechens in den Speicher holen
      if (p.modell) void invoke("sprache_vorladen", { name: p.modell }).catch(() => undefined);
    } catch (e) {
      nativStart = null;
      aufnahmeLaeuft = false;
      funkStueckEnde();
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
    funkKod = funkStueck ? new FunkKodierer(ctx.sampleRate, funkStueck) : null;
    proz.onaudioprocess = (ev) => {
      const d = ev.inputBuffer.getChannelData(0);
      stuecke.push(new Float32Array(d));
      funkKod?.daten(d);
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
    funkStueckEnde();
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

/** Live-Funk der Spracheingabe beenden */
function funkStueckEnde(): void {
  if (!funkStueck) return;
  funkKod?.ende();
  funkKod = null;
  funkStueck = null;
  funkHaken.ende?.();
}

async function stopp(): Promise<void> {
  try {
    await stoppInnen();
  } finally {
    if (dauerPausiert && !aufnahmeLaeuft) {
      dauerPausiert = false;
      dauerAufnahme.weiter();
    }
  }
}

async function stoppInnen(): Promise<void> {
  if (!aufnahmeLaeuft) return;
  aufnahmeLaeuft = false;
  // nach der Aufnahme (inkl. Nachlauf) den Live-Funk schließen
  const funkZu = () => setTimeout(funkStueckEnde, 80);
  aktuellerKnopf?.classList.remove("an");
  const z = zielJetzt;
  zielJetzt = null;
  if (liveJetzt) {
    const ls = liveJetzt;
    liveJetzt = null;
    try {
      if (pegelTimer) clearInterval(pegelTimer);
      pegelTimer = null;
      if (nativStart) {
        const st = nativStart;
        nativStart = null;
        await st;
        // beendet die Aufnahme (mit kurzem Nachlauf); die letzten Stücke kommen noch über den Kanal
        await invoke("sprache_aufnahme_stopp", { modell: "", hinweis: "" });
        await new Promise((r) => setTimeout(r, 60));
      } else if (liveWeb) {
        await new Promise((r) => setTimeout(r, 250));
        liveWeb.q.disconnect();
        liveWeb.p.disconnect();
        void liveWeb.ctx.close();
        liveWeb = null;
      }
    } catch (e) {
      console.warn("Live-Aufnahme", e);
    }
    anzeigeWeg();
    if (!hoerJetzt) {
      await ls.ende();
      return;
    }
    // Funk: Mitschrift aus der Cloud, dann wie erkannter Text
    const m = hoerJetzt;
    hoerJetzt = null;
    funkZu();
    anzeigeZeigen("Erkenne …", "denkt");
    const t = await m.ende();
    anzeigeWeg();
    return textFertig(z, t);
  }
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
      const t0 = performance.now();
      const r = await invoke<{ text: string; sekunden: number; pegel: number }>("sprache_aufnahme_stopp", { modell: p.modell, hinweis: z?.hinweis?.() ?? "" }).finally(funkZu);
      erkennZeit = Math.round(performance.now() - t0);
      console.info(`[Erkennzeit] ${p.modell}: ${erkennZeit} ms für ${r.sekunden.toFixed(1)} s Sprache`);
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
      funkZu();
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
    funkStueckEnde();
    anzeigeWeg();
    toast(String((e as Error).message ?? e), "error");
    return;
  }
  anzeigeWeg();
  textFertig(z, text);
}

/** erkannten Text ins Eingabefeld (und ggf. abschicken) */
function textFertig(z: SprachZiel | null, roh: string): void {
  // Zahlen immer als Ziffern („eins“ → „1“), Ortsnamen richtigstellen
  let text = zahlenAlsZiffern(roh.replace(/\s+/g, " ").trim());
  text = ortHaken.glaetten?.(text) ?? text;
  if (!text || FANTASIE.test(text)) {
    toast("Nichts verstanden – bitte nochmal.", "error");
    return;
  }
  if (z?.nachher) text = z.nachher(text);
  if (!z || !z.input.isConnected) return;
  const vorher = z.input.value.trim();
  z.input.value = vorher ? `${vorher} ${text}` : text;
  if (sprachPrefs().autoSenden && z.aktiv()) z.senden(true);
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
    if (tastenBelegung.aktiv || !p.eingabe || ev.code !== p.taste) return;
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
 * Funkrufnamen aus gesprochenem Text: „75 1“, „751“, „75 Strich 1“ → „75/001“, „Neff Krems“ → „NEF Krems“, Zahlwörter als Ziffern.
 * bevorzugt = Fahrzeuge, die gerade funken (bei ähnlich klingenden Nummern sind die gemeint).
 */
export function funkNamenGlaetten(t: string, namen?: string[], bevorzugt?: string[]): string {
  return funkTextGlaetten(t, namen, bevorzugt);
}

// ------------------------------------------------------------ Sicherung: Mikrofon nicht offen lassen
//
// Das Programm nimmt nur auf, solange eine Sprechtaste gehalten wird (bzw. beim Freisprechen während des Anrufs).
// Bleibt eine Aufnahme trotzdem offen (z. B. weil ein Anruf auf ungewöhnliche Art endete), schließt sie diese Sicherung –
// sonst zeigt macOS dauerhaft das orange Mikrofon-Zeichen.
if (inTauri()) {
  let verdacht = 0;
  setInterval(() => {
    if (aufnahmeLaeuft || aufnahmeSperre.funk || dauerAufnahme.laeuft()) {
      verdacht = 0;
      return;
    }
    void invoke<boolean>("sprache_aufnahme_laeuft")
      .then((laeuft) => {
        if (!laeuft) return void (verdacht = 0);
        // zweimal hintereinander offen, obwohl niemand spricht: schließen
        if (++verdacht < 2) return;
        verdacht = 0;
        console.warn("Mikrofon war noch offen, obwohl niemand spricht – geschlossen");
        void invoke("sprache_aufnahme_abbrechen").catch(() => undefined);
      })
      .catch(() => undefined);
  }, 2500);
}
