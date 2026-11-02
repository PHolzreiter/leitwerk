/**
 * Cloud-Anrufer (Test): Gemini Live von Google mit dem eigenen, kostenlosen Schlüssel des Spielers.
 * Die Leitstelle fragt wie bisher (Knopf, Tippen oder Spracheingabe); Gemini antwortet direkt mit Stimme.
 * Der Schlüssel liegt nur auf diesem Rechner (localStorage) und wird nur an Google geschickt.
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { sim, type Einsatz } from "../sim/engine";
import { aufnahmeLaeuftJetzt, sprachPrefs, verstummHoerer } from "../ui/sprache";

const LS = "leitwerk.gemini";
export const LIVE_MODELL = "gemini-3.8-live";
const URL_BASIS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export interface LivePrefs {
  /** Anrufer über Gemini Live statt der lokalen KI */
  an: boolean;
  schluessel: string;
}

export function livePrefs(): LivePrefs {
  const d: LivePrefs = { an: false, schluessel: "" };
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<LivePrefs>) };
  } catch {
    return d;
  }
}

export function setLivePrefs(p: Partial<LivePrefs>): void {
  try {
    localStorage.setItem(LS, JSON.stringify({ ...livePrefs(), ...p }));
  } catch {
    /* egal */
  }
  if (p.an === false || p.schluessel !== undefined) alleSchliessen();
}

/** Soll dieser Anruf über Gemini Live laufen? */
export function liveAktiv(): boolean {
  const p = livePrefs();
  return p.an && p.schluessel.trim().length > 10 && typeof WebSocket !== "undefined";
}

// Stimmen von Gemini (Frauen- und Männerstimmen)
const STIMMEN_W = ["Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Despina"];
const STIMMEN_M = ["Puck", "Charon", "Fenrir", "Orus", "Iapetus", "Umbriel"];
function stimmeFuer(g: "w" | "m" | undefined, id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = g === "m" ? STIMMEN_M : STIMMEN_W;
  return pool[h % pool.length];
}

interface Runde {
  text: string;
  /** Mitschrift dessen, was die Leitstelle gesagt hat (bei Sprache) */
  frage: string;
  /** von Google gemeldete Tokens dieser Runde */
  tokens?: number;
  /** Leitstelle hat gesprochen (Mitschrift kann etwas nach der Antwort kommen) */
  audio?: boolean;
  onText?: (t: string) => void;
  fertig: (text: string) => void;
  fehler: (e: Error) => void;
  ersterTon?: number;
  start: number;
}

/** Wiedergabe: Stücke sammeln und der Reihe nach abspielen (möglichst wenige Lücken) */
class Wiedergabe {
  private stuecke: Float32Array[] = [];
  private laeuft = false;
  private ende = false;
  private zaehler = 0;
  private ctx: AudioContext | null = null;
  private webZeit = 0;
  abgebrochen = false;
  constructor(private rate: number) {}

  dazu(pcm16: Int16Array, rate: number): void {
    if (this.abgebrochen) return;
    this.rate = rate;
    const f = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) f[i] = pcm16[i] / 32768;
    // ohne eigenes Ausgabegerät lückenlos über WebAudio, sonst über das gewählte Gerät
    if (!inTauri() || !sprachPrefs().geraetStimmen) {
      if (aufnahmeLaeuftJetzt()) return this.stopp();
      return this.web(f);
    }
    this.stuecke.push(f);
    if (!this.laeuft) void this.schleife();
  }

  fertig(): void {
    this.ende = true;
  }

  stopp(): void {
    this.abgebrochen = true;
    this.stuecke = [];
    if (inTauri()) void invoke("ton_stopp", { id: "stimme-live-*" }).catch(() => undefined);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private async schleife(): Promise<void> {
    this.laeuft = true;
    try {
      while (!this.abgebrochen) {
        // kurz sammeln, damit nicht jedes kleine Stück einzeln (mit Lücke) gespielt wird
        let n = this.stuecke.reduce((s, x) => s + x.length, 0);
        if (!n && this.ende) break;
        if (n < this.rate * 0.35 && !this.ende) {
          await new Promise((r) => setTimeout(r, 60));
          n = this.stuecke.reduce((s, x) => s + x.length, 0);
          if (n < this.rate * 0.35 && !this.ende) continue;
        }
        if (!n) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }
        const alle = new Float32Array(n);
        let o = 0;
        for (const s of this.stuecke) {
          alle.set(s, o);
          o += s.length;
        }
        this.stuecke = [];
        if (aufnahmeLaeuftJetzt()) {
          // die Leitstelle redet gerade: Anrufer verstummt
          this.stopp();
          break;
        }
        const p = sprachPrefs();
        await invoke("ton_spielen", new Uint8Array(alle.buffer), {
          headers: { "x-rate": String(this.rate), "x-geraet": encodeURIComponent(p.geraetStimmen), "x-laut": String(Math.max(0, p.laut / 100)), "x-id": `stimme-live-${++this.zaehler}` },
        }).catch((e) => console.warn("Live-Ton", e));
      }
    } finally {
      this.laeuft = false;
    }
  }

  /** im Browser: lückenlos über WebAudio */
  private web(f: Float32Array): void {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.rate });
      this.webZeit = this.ctx.currentTime + 0.05;
    }
    const b = this.ctx.createBuffer(1, f.length, this.rate);
    b.getChannelData(0).set(f);
    const q = this.ctx.createBufferSource();
    q.buffer = b;
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0, sprachPrefs().laut / 100);
    q.connect(g).connect(this.ctx.destination);
    const t = Math.max(this.webZeit, this.ctx.currentTime + 0.02);
    q.start(t);
    this.webZeit = t + b.duration;
  }
}

function b64ZuInt16(b64: string): Int16Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length - (s.length % 2));
  for (let i = 0; i < u.length; i++) u[i] = s.charCodeAt(i);
  return new Int16Array(u.buffer);
}

export interface LiveErgebnis {
  text: string;
  frage: string;
  ersterTon: number;
  fertig: number;
  tokens?: number;
}

class Sitzung {
  ws: WebSocket | null = null;
  bereit: Promise<void>;
  private bereitJa!: () => void;
  private bereitNein!: (e: Error) => void;
  runde: Runde | null = null;
  ton: Wiedergabe | null = null;
  /** Antwort fertig, wird aber evtl. noch gesprochen */
  ausklang: Wiedergabe | null = null;
  geschlossen = false;
  istBereit = false;
  private warteschlange: string[] = [];
  systemText: string;

  constructor(public id: string, system: string, stimme: string, verlauf: { von: string; text: string }[]) {
    this.systemText = system;
    this.bereit = new Promise((ja, nein) => {
      this.bereitJa = ja;
      this.bereitNein = nein;
    });
    const ws = new WebSocket(`${URL_BASIS}?key=${encodeURIComponent(livePrefs().schluessel.trim())}`);
    this.ws = ws;
    const zeit = setTimeout(() => this.bereitNein(new Error("Gemini antwortet nicht (Zeitüberschreitung)")), 12000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${LIVE_MODELL}`,
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: stimme } } } },
            systemInstruction: { parts: [{ text: `${system}\nDu sprichst Deutsch mit österreichischer Färbung, wie am Telefon. Du antwortest NUR als Anrufer – Hinweise in eckigen Klammern sind nur für dich und werden nie vorgelesen.\nDU HÖRST DIE LEITSTELLE AM TELEFON: Antworte wie ein Mensch am Telefon – meist ein kurzer Satz, keine Aufzählungen, nichts vorlesen. Deine Stimme passt zu deiner Stimmung (aufgeregt = schneller und höher, panisch = abgehackt, ruhig = gelassen). Hast du die Leitstelle akustisch nicht verstanden oder ergibt die Frage keinen Sinn, frag kurz nach („Wie bitte?“, „Was meinen Sie?“) statt zu raten. Fragt die Leitstelle etwas, das nicht in deinen Angaben steht, sagst du, dass du es nicht weißt.` }] },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            // Sprechtaste: wir sagen selbst, wann die Leitstelle zu reden beginnt und aufhört
            realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
          },
        }),
      );
    };
    ws.onmessage = async (ev) => {
      const roh = typeof ev.data === "string" ? ev.data : ev.data instanceof Blob ? await ev.data.text() : new TextDecoder().decode(ev.data as ArrayBuffer);
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(roh);
      } catch {
        return;
      }
      if (m.setupComplete) {
        clearTimeout(zeit);
        // bisheriges Gespräch nachreichen (z. B. nach einer neuen Verbindung)
        const turns = verlauf
          .filter((x) => x.von === "leitstelle" || x.von === "anrufer")
          .map((x) => ({ role: x.von === "anrufer" ? "model" : "user", parts: [{ text: x.von === "anrufer" ? x.text : `Leitstelle: ${x.text}` }] }));
        if (turns.length) ws.send(JSON.stringify({ clientContent: { turns, turnComplete: false } }));
        this.istBereit = true;
        for (const w of this.warteschlange) ws.send(w);
        this.warteschlange = [];
        this.bereitJa();
        return;
      }
      if (m.goAway) {
        // Verbindung läuft bald ab – nächste Frage baut neu auf
        this.geschlossen = true;
        return;
      }
      const nutzung = m.usageMetadata as { totalTokenCount?: number } | undefined;
      if (nutzung?.totalTokenCount && this.runde) this.runde.tokens = nutzung.totalTokenCount;
      const sc = m.serverContent as
        | { modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }; outputTranscription?: { text?: string }; inputTranscription?: { text?: string }; turnComplete?: boolean; interrupted?: boolean }
        | undefined;
      if (!sc || !this.runde) return;
      const r = this.runde;
      if (sc.inputTranscription?.text) r.frage += sc.inputTranscription.text;
      for (const p of sc.modelTurn?.parts ?? []) {
        if (!p.inlineData?.data) continue;
        const rate = Number(/rate=(\d+)/.exec(p.inlineData.mimeType ?? "")?.[1] ?? 24000);
        if (!r.ersterTon) r.ersterTon = Date.now() - r.start;
        if (sprachPrefs().vorlesen) {
          this.ton ??= new Wiedergabe(rate);
          this.ton.dazu(b64ZuInt16(p.inlineData.data), rate);
        }
      }
      if (sc.outputTranscription?.text) {
        r.text += sc.outputTranscription.text;
        r.onText?.(sc.outputTranscription.text);
      }
      if (sc.interrupted) this.ton?.stopp();
      if (sc.turnComplete) {
        this.ton?.fertig();
        this.ausklang = this.ton;
        this.ton = null;
        const abschluss = () => {
          if (this.runde === r) this.runde = null;
          r.fertig(r.text.replace(/\s+/g, " ").trim());
        };
        // die Mitschrift der Leitstelle kommt manchmal erst knapp nach der Antwort
        if (r.audio && !r.frage.trim()) setTimeout(abschluss, 600);
        else abschluss();
      }
    };
    ws.onerror = () => undefined;
    ws.onclose = (ev) => {
      clearTimeout(zeit);
      this.geschlossen = true;
      const grund = ev.reason ? `: ${ev.reason}` : "";
      const fehler = new Error(/api key|key not valid|permission|unauth/i.test(ev.reason) ? "Gemini-Schlüssel ungültig – bitte in den Einstellungen prüfen" : /quota|exhausted|rate/i.test(ev.reason) ? "Gratis-Kontingent von Gemini aufgebraucht – später nochmal oder lokale KI verwenden" : `Verbindung zu Gemini beendet (${ev.code}${grund})`);
      this.bereitNein(fehler);
      if (this.runde) {
        const r = this.runde;
        this.runde = null;
        if (r.text.trim()) r.fertig(r.text.trim());
        else r.fehler(fehler);
      }
    };
  }

  /** senden – vor dem Verbindungsaufbau kommt es in die Warteschlange */
  senden(o: unknown): void {
    const t = JSON.stringify(o);
    if (this.istBereit && this.ws?.readyState === WebSocket.OPEN) this.ws.send(t);
    else if (!this.geschlossen) this.warteschlange.push(t);
  }

  /** Leitstelle spricht (Sprechtaste): Ton geht direkt an Gemini; ende() schickt ab und wartet auf die Antwort */
  sprechen(onText?: (t: string) => void): { stueck(b64: string): void; ende(): Promise<LiveErgebnis> } {
    this.verstummen();
    let start = Date.now();
    let ja!: (r: LiveErgebnis) => void;
    let nein!: (e: Error) => void;
    const fertig = new Promise<LiveErgebnis>((a, b) => {
      ja = a;
      nein = b;
    });
    fertig.catch(() => undefined);
    const runde: Runde = {
      text: "",
      frage: "",
      onText,
      start,
      audio: true,
      fertig: (t) => ja({ text: t, frage: runde.frage.replace(/\s+/g, " ").trim(), ersterTon: runde.ersterTon ?? Date.now() - start, fertig: Date.now() - start, tokens: runde.tokens }),
      fehler: (e) => nein(e),
    };
    this.runde = runde;
    this.senden({ realtimeInput: { activityStart: {} } });
    return {
      stueck: (b64) => this.senden({ realtimeInput: { audio: { data: b64, mimeType: "audio/pcm;rate=16000" } } }),
      ende: async () => {
        start = Date.now();
        runde.start = start;
        this.senden({ realtimeInput: { activityEnd: {} } });
        setTimeout(() => {
          if (this.runde === runde) {
            this.runde = null;
            if (runde.text.trim()) runde.fertig(runde.text.trim());
            else nein(new Error("Gemini hat nicht geantwortet"));
          }
        }, 30000);
        await this.bereit;
        return fertig;
      },
    };
  }

  async frage(text: string, onText?: (t: string) => void): Promise<LiveErgebnis> {
    await this.bereit;
    if (this.geschlossen || !this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Gemini-Verbindung ist zu");
    this.verstummen();
    const start = Date.now();
    return new Promise((ja, nein) => {
      const runde: Runde = {
        text: "",
        frage: text,
        onText,
        start,
        fertig: (t) => ja({ text: t, frage: text, ersterTon: runde.ersterTon ?? Date.now() - start, fertig: Date.now() - start, tokens: runde.tokens }),
        fehler: nein,
      };
      this.runde = runde;
      this.ws!.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } }));
      // falls gar nichts zurückkommt
      setTimeout(() => {
        if (this.runde === runde) {
          this.runde = null;
          if (runde.text.trim()) runde.fertig(runde.text.trim());
          else nein(new Error("Gemini hat nicht geantwortet"));
        }
      }, 30000);
    });
  }

  verstummen(): void {
    this.ton?.stopp();
    this.ausklang?.stopp();
    this.ton = null;
    this.ausklang = null;
  }

  schliessen(): void {
    this.geschlossen = true;
    this.verstummen();
    try {
      this.ws?.close();
    } catch {
      /* egal */
    }
  }
}

const sitzungen = new Map<string, Sitzung>();

function alleSchliessen(): void {
  for (const s of sitzungen.values()) s.schliessen();
  sitzungen.clear();
}

/** Verbindung für einen Anruf (wird wiederverwendet; neu, wenn sie zu ist oder sich die Anweisung geändert hat) */
function sitzungFuer(e: Einsatz, system: string, geschlecht: "w" | "m" | undefined): Sitzung {
  const alt = sitzungen.get(e.id);
  if (alt && !alt.geschlossen && alt.systemText === system) return alt;
  alt?.schliessen();
  beobachten();
  const s = new Sitzung(e.id, system, stimmeFuer(geschlecht, e.id), e.anruf?.gespraech ?? []);
  sitzungen.set(e.id, s);
  return s;
}

/** Schon beim Abheben verbinden, damit die erste Antwort nicht auf den Aufbau wartet */
export function liveVorbereiten(e: Einsatz, system: string, geschlecht: "w" | "m" | undefined): void {
  if (!liveAktiv()) return;
  sitzungFuer(e, system, geschlecht).bereit.catch(() => undefined);
}

/** Frage an den Cloud-Anrufer; die Antwort wird gleich gesprochen, onText zeigt sie live an */
export async function liveFrage(e: Einsatz, system: string, geschlecht: "w" | "m" | undefined, text: string, onText?: (t: string) => void): Promise<LiveErgebnis> {
  let s = sitzungFuer(e, system, geschlecht);
  try {
    return await s.frage(text, onText);
  } catch (err) {
    // einmal neu verbinden (Verbindung abgelaufen o. Ä.), außer der Schlüssel ist falsch
    if (/Schlüssel|Kontingent/.test(String((err as Error).message))) throw err;
    s.schliessen();
    sitzungen.delete(e.id);
    s = sitzungFuer(e, system, geschlecht);
    return s.frage(text, onText);
  }
}

/** Leitstelle spricht direkt zu Gemini (Sprechtaste); null, wenn die Cloud gerade gesperrt ist */
export function liveSprechen(e: Einsatz, system: string, geschlecht: "w" | "m" | undefined, onText?: (t: string) => void): { stueck(b64: string): void; ende(): Promise<LiveErgebnis> } | null {
  if (!liveAktiv() || Date.now() < gesperrtBis) return null;
  return sitzungFuer(e, system, geschlecht).sprechen(onText);
}

/** nach einem Fehler eine Weile die eigene Spracherkennung verwenden */
let gesperrtBis = 0;
export function liveSperren(ms = 60000): void {
  gesperrtBis = Date.now() + ms;
}

/** Anrufer verstummt (z. B. Leitstelle redet dazwischen) */
export function liveVerstummen(id?: string): void {
  for (const [k, s] of sitzungen) if (!id || k === id) s.verstummen();
}

/** Verbindung kurz testen (Einstellungen) */
export async function liveTesten(): Promise<string> {
  const s = new Sitzung(`test-${Date.now()}`, "Du bist ein freundlicher Mensch am Telefon. Antworte sehr kurz auf Deutsch.", "Kore", []);
  try {
    const r = await s.frage("Sag bitte nur: Verbindung steht.");
    return `${r.text || "(ohne Text)"} – erster Ton nach ${(r.ersterTon / 1000).toFixed(1)} s`;
  } finally {
    setTimeout(() => s.schliessen(), 4000);
  }
}

// aufgelegt oder beendet: Verbindung schließen (erst bei der ersten Verbindung anmelden – beim Laden ist sim noch nicht da)
let beobachtet = false;
function beobachten(): void {
  if (beobachtet) return;
  beobachtet = true;
  // Sprechtaste gedrückt oder aufgelegt: Anrufer verstummt sofort
  verstummHoerer.add(() => liveVerstummen());
  sim.onChange(() => {
    for (const [id, s] of sitzungen) {
      const e = sim.state.einsaetze.find((x) => x.id === id);
      if (!e?.anruf || e.anruf.status !== "aktiv") {
        s.schliessen();
        sitzungen.delete(id);
      }
    }
  });
}
