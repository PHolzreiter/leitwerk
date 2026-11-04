/**
 * Cloud-Anrufer (Test): Gemini Live von Google mit dem eigenen, kostenlosen Schlüssel des Spielers.
 * Fragen kommen als Text (Knopf, Tippen), als Sprache mit der Sprechtaste oder – beim Freisprechen –
 * laufend vom Mikrofon. Gemini antwortet direkt mit Stimme; die Mitschrift kommt ins Gespräch.
 * Der Schlüssel liegt nur auf diesem Rechner (localStorage) und wird nur an Google geschickt.
 */
import { zahlenAlsZiffern } from "../sim/funkErkennung";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { aufnahmeLaeuftJetzt, sprachPrefs, verstummHoerer } from "../ui/sprache";
import { store } from "../data/store";

const LS = "leitwerk.gemini";
export const LIVE_MODELL = "gemini-3.8-live";
const URL_BASIS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export interface LivePrefs {
  /** Anrufer über Gemini Live statt der lokalen KI */
  an: boolean;
  schluessel: string;
  /** Schlüssel, der zuletzt erfolgreich getestet wurde (nur zum Vergleich: gekürzt) */
  geprueft?: string;
  /** schon einmal gefragt, wie Anrufer reden sollen (erster Start) */
  gewaehlt?: boolean;
  /** ohne Sprechtaste reden – Gemini erkennt selbst, wann du fertig bist */
  freisprechen: boolean;
  /** Anruferstimme klingt nach Telefon, dazu Geräusche vom Notfallort */
  klang: boolean;
  /** Test: Gemini versteht den Funk (kennt Fahrzeuge und Gespräch) statt der Spracherkennung hier */
  funkVersteher?: boolean;
}

export function livePrefs(): LivePrefs {
  const d: LivePrefs = { an: false, schluessel: "", freisprechen: false, klang: true };
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
  if (p.an === false || p.schluessel !== undefined || p.freisprechen !== undefined) alleSchliessen();
  for (const f of prefsHoerer) f();
}
export const prefsHoerer = new Set<() => void>();

/** Regel des Hosts im Mehrspieler (frei = jeder wählt selbst) */
export function kiRegel(): "frei" | "gemini" | "lokal" {
  return store.settings.kiRegel ?? "frei";
}

/** Welche Anrufer-KI gilt gerade für mich? (Regel des Hosts vor eigener Wahl) */
export function anrufKiModus(): "gemini" | "lokal" {
  const r = kiRegel();
  if (r !== "frei") return r;
  return livePrefs().an ? "gemini" : "lokal";
}

/** Ist ein Schlüssel eingetragen (und – soweit bekannt – geprüft)? */
export function schluesselDa(): boolean {
  return livePrefs().schluessel.trim().length > 10;
}
export function schluesselGeprueft(): boolean {
  const p = livePrefs();
  return schluesselDa() && p.geprueft === kurz(p.schluessel);
}
export function kurz(k: string): string {
  const t = k.trim();
  return `${t.slice(0, 4)}…${t.slice(-4)}:${t.length}`;
}

/** Soll dieser Anruf über Gemini Live laufen? */
export function liveAktiv(): boolean {
  return anrufKiModus() === "gemini" && schluesselDa() && typeof WebSocket !== "undefined" && Date.now() >= gesperrtBis;
}

/** nach einem Fehler eine Weile die lokale KI bzw. Erkennung verwenden */
let gesperrtBis = 0;
export function liveSperren(ms = 60000): void {
  gesperrtBis = Date.now() + ms;
}

// Stimmen von Gemini (Frauen- und Männerstimmen)
// alle 30 Stimmen, nach Geschlecht (laut Stimmenliste von Google)
const STIMMEN_W = ["Kore", "Aoede", "Leda", "Zephyr", "Callirrhoe", "Despina", "Autonoe", "Erinome", "Laomedeia", "Achernar", "Gacrux", "Pulcherrima", "Vindemiatrix", "Sulafat"];
const STIMMEN_M = ["Puck", "Charon", "Fenrir", "Orus", "Iapetus", "Umbriel", "Enceladus", "Algieba", "Algenib", "Rasalgethi", "Alnilam", "Schedar", "Achird", "Zubenelgenubi", "Sadachbia", "Sadaltager"];
function stimmeFuer(g: "w" | "m" | undefined, id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const pool = g === "m" ? STIMMEN_M : STIMMEN_W;
  return pool[h % pool.length];
}

export interface LiveErgebnis {
  /** was der Anrufer gesagt hat */
  text: string;
  /** was die Leitstelle gesagt hat (Text oder Mitschrift) */
  frage: string;
  ersterTon: number;
  fertig: number;
  tokens?: number;
  /** der Anrufer hat von sich aus gesprochen (Hinweis, Korrektur) */
  spontan?: boolean;
  /** die Leitstelle hat ihn unterbrochen */
  unterbrochen?: boolean;
}

interface Runde {
  text: string;
  frage: string;
  tokens?: number;
  /** Leitstelle hat gesprochen (Mitschrift kann etwas nach der Antwort kommen) */
  audio?: boolean;
  spontan?: boolean;
  unterbrochen?: boolean;
  /** ab hier nichts mehr abspielen/anzeigen (z. B. ein angehängter Haftungshinweis) */
  stumm?: boolean;
  onText?: (t: string) => void;
  fertig: (text: string) => void;
  fehler: (e: Error) => void;
  ersterTon?: number;
  start: number;
}

/** Telefonklang: Bandpass 300–3400 Hz (wie eine Telefonleitung) und ein leises Rauschen */
class Telefonfilter {
  private hp = { x1: 0, x2: 0, y1: 0, y2: 0 };
  private tp = { x1: 0, x2: 0, y1: 0, y2: 0 };
  private kh: number[];
  private kt: number[];
  constructor(rate: number) {
    const koeff = (f: number, hoch: boolean) => {
      const w = (2 * Math.PI * f) / rate;
      const a = Math.sin(w) / (2 * 0.707);
      const c = Math.cos(w);
      const b0 = hoch ? (1 + c) / 2 : (1 - c) / 2;
      const b1 = hoch ? -(1 + c) : 1 - c;
      const a0 = 1 + a;
      return [b0 / a0, b1 / a0, b0 / a0, (-2 * c) / a0, (1 - a) / a0];
    };
    this.kh = koeff(300, true);
    this.kt = koeff(Math.min(3400, rate / 2 - 100), false);
  }
  private stufe(x: number, z: { x1: number; x2: number; y1: number; y2: number }, k: number[]): number {
    const y = k[0] * x + k[1] * z.x1 + k[2] * z.x2 - k[3] * z.y1 - k[4] * z.y2;
    z.x2 = z.x1;
    z.x1 = x;
    z.y2 = z.y1;
    z.y1 = y;
    return y;
  }
  verarbeiten(f: Float32Array): Float32Array {
    for (let i = 0; i < f.length; i++) {
      const y = this.stufe(this.stufe(f[i], this.hp, this.kh), this.tp, this.kt);
      f[i] = Math.max(-1, Math.min(1, y * 1.15 + (Math.random() - 0.5) * 0.004));
    }
    return f;
  }
}

/** Wiedergabe: Stücke sammeln und der Reihe nach abspielen */
class Wiedergabe {
  private stuecke: Float32Array[] = [];
  private laeuft = false;
  private ende = false;
  private zaehler = 0;
  private ctx: AudioContext | null = null;
  private webZeit = 0;
  private filter: Telefonfilter | null;
  abgebrochen = false;
  constructor(private rate: number) {
    this.filter = livePrefs().klang ? new Telefonfilter(rate) : null;
  }

  dazu(pcm16: Int16Array, rate: number): void {
    if (this.abgebrochen) return;
    this.rate = rate;
    const f = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) f[i] = pcm16[i] / 32768;
    this.filter?.verarbeiten(f);
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

  /** WebAudio: lückenlos */
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

export interface SitzungOpt {
  id: string;
  system: string;
  geschlecht?: "w" | "m";
  verlauf: { von: string; text: string }[];
  /** Kennung des Anrufs (gleiche Einsatz-Kennung, anderer Anruf → neue Verbindung) */
  bezug?: string;
  /** läuft der Anruf noch? (sonst wird die Verbindung geschlossen) */
  aktiv: () => boolean;
  /** Freisprechen: Gemini erkennt selbst, wann die Leitstelle fertig ist */
  frei?: boolean;
  /** Antworten, die nicht auf eine Frage per Knopf/Taste kommen (Freisprechen, von sich aus) */
  ereignis?: (r: LiveErgebnis) => void;
  /** nichts abspielen und ohne die Regeln für Anrufer (z. B. nur Mitschrift vom Funk) */
  stumm?: boolean;
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
  /** Mitschrift beim Freisprechen, bis der Anrufer antwortet */
  private hoer = "";
  private hoerEnde = 0;

  constructor(public opt: SitzungOpt) {
    this.systemText = opt.system;
    this.bereit = new Promise((ja, nein) => {
      this.bereitJa = ja;
      this.bereitNein = nein;
    });
    this.bereit.catch(() => undefined);
    const ws = new WebSocket(`${URL_BASIS}?key=${encodeURIComponent(livePrefs().schluessel.trim())}`);
    this.ws = ws;
    const zeit = setTimeout(() => this.bereitNein(new Error("Gemini antwortet nicht (Zeitüberschreitung)")), 12000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${LIVE_MODELL}`,
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: stimmeFuer(opt.geschlecht, `${opt.id}|${opt.bezug ?? ""}`) } } } },
            systemInstruction: { parts: [{ text: opt.stumm ? opt.system : `${opt.system}\n${ZUSATZ}` }] },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
            // Sprechtaste: wir sagen selbst, wann die Leitstelle redet; Freisprechen: Gemini erkennt es selbst
            ...(opt.frei
              ? { realtimeInputConfig: { automaticActivityDetection: { disabled: false, endOfSpeechSensitivity: "END_SENSITIVITY_LOW", silenceDurationMs: 700 } } }
              : { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } }),
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
      this.empfangen(m, zeit);
    };
    ws.onerror = () => undefined;
    ws.onclose = (ev) => {
      clearTimeout(zeit);
      this.geschlossen = true;
      const grund = ev.reason ? `: ${ev.reason}` : "";
      const fehler = new Error(/api key|key not valid|permission|unauth/i.test(ev.reason) ? "Gemini-Schlüssel ungültig – bitte in den Einstellungen prüfen" : /quota|exhausted|rate/i.test(ev.reason) ? "Kontingent von Gemini gerade erschöpft – kurz warten oder lokale KI verwenden" : `Verbindung zu Gemini beendet (${ev.code}${grund})`);
      this.bereitNein(fehler);
      if (this.runde) {
        const r = this.runde;
        this.runde = null;
        if (r.text.trim()) r.fertig(r.text.trim());
        else r.fehler(fehler);
      }
    };
  }

  private empfangen(m: Record<string, unknown>, zeit: ReturnType<typeof setTimeout>): void {
    const ws = this.ws!;
    if (m.setupComplete) {
      clearTimeout(zeit);
      // bisheriges Gespräch nachreichen (z. B. nach einer neuen Verbindung)
      const turns = this.opt.verlauf
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
      // Verbindung läuft bald ab – die nächste Frage baut neu auf
      this.geschlossen = true;
      return;
    }
    const nutzung = m.usageMetadata as { totalTokenCount?: number } | undefined;
    if (nutzung?.totalTokenCount && this.runde) this.runde.tokens = nutzung.totalTokenCount;
    const sc = m.serverContent as
      | { modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }; outputTranscription?: { text?: string }; inputTranscription?: { text?: string }; turnComplete?: boolean; interrupted?: boolean }
      | undefined;
    if (!sc) return;
    if (sc.inputTranscription?.text) {
      if (this.runde) this.runde.frage += sc.inputTranscription.text;
      else {
        this.hoer += sc.inputTranscription.text;
        this.hoerEnde = Date.now();
      }
    }
    const spricht = (sc.modelTurn?.parts ?? []).some((p) => p.inlineData?.data) || !!sc.outputTranscription?.text;
    // Anrufer spricht, ohne dass eine Frage per Knopf/Taste offen ist: Freisprechen oder von sich aus
    if (spricht && !this.runde && this.opt.ereignis) {
      const frage = this.hoer;
      this.hoer = "";
      const start = this.hoerEnde || Date.now();
      const runde: Runde = {
        text: "",
        frage,
        start,
        audio: !!frage || !!this.opt.frei,
        spontan: !frage,
        fertig: (t) => this.opt.ereignis?.({ text: zahlenAlsZiffern(t), frage: zahlenAlsZiffern(runde.frage.replace(/\s+/g, " ").trim()), ersterTon: runde.ersterTon ?? 0, fertig: Date.now() - start, tokens: runde.tokens, spontan: runde.spontan && !runde.frage.trim(), unterbrochen: runde.unterbrochen }),
        fehler: () => undefined,
      };
      this.runde = runde;
    }
    const r = this.runde;
    if (!r) return;
    for (const p of sc.modelTurn?.parts ?? []) {
      if (!p.inlineData?.data) continue;
      const rate = Number(/rate=(\d+)/.exec(p.inlineData.mimeType ?? "")?.[1] ?? 24000);
      if (!r.ersterTon) r.ersterTon = Date.now() - r.start;
      if (sprachPrefs().vorlesen && !r.stumm && !this.opt.stumm) {
        this.ton ??= new Wiedergabe(rate);
        this.ton.dazu(b64ZuInt16(p.inlineData.data), rate);
      }
    }
    if (sc.outputTranscription?.text && !r.stumm) {
      r.text += sc.outputTranscription.text;
      // Haftungshinweis o. Ä. hängt das Modell manchmal an – sofort verstummen und abschneiden
      const k = KI_HINWEIS.exec(r.text);
      if (k) {
        r.stumm = true;
        r.text = r.text.slice(0, k.index).trim();
        this.ton?.stopp();
        this.ton = null;
      } else r.onText?.(sc.outputTranscription.text);
    }
    if (sc.interrupted) {
      // die Leitstelle redet dazwischen
      this.ton?.stopp();
      this.ton = null;
      r.unterbrochen = true;
    }
    if (sc.turnComplete || sc.interrupted) {
      this.ton?.fertig();
      this.ausklang = this.ton;
      this.ton = null;
      const abschluss = () => {
        if (this.runde === r) this.runde = null;
        const t = r.text.replace(/\s+/g, " ").trim();
        r.fertig(r.unterbrochen && t ? `${t.replace(/[.!?…]*$/, "")} …` : t);
      };
      // die Mitschrift der Leitstelle kommt manchmal erst knapp nach der Antwort
      if (r.audio && !r.frage.trim() && !this.opt.frei) setTimeout(abschluss, 600);
      else abschluss();
    }
  }

  /** senden – vor dem Verbindungsaufbau kommt es in die Warteschlange */
  senden(o: unknown): void {
    const t = JSON.stringify(o);
    if (this.istBereit && this.ws?.readyState === WebSocket.OPEN) this.ws.send(t);
    else if (!this.geschlossen) this.warteschlange.push(t);
  }

  /** Freisprechen: Ton laufend an Gemini */
  stueck(b64: string): void {
    this.senden({ realtimeInput: { audio: { data: b64, mimeType: "audio/pcm;rate=16000" } } });
  }

  /** Nur für den Anrufer: Hinweis (z. B. Lage geändert, Korrektur). sprechen = er soll gleich darauf reagieren */
  hinweis(text: string, sprechen: boolean): void {
    this.senden({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: sprechen } });
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
      fertig: (t) => ja({ text: zahlenAlsZiffern(t), frage: zahlenAlsZiffern(runde.frage.replace(/\s+/g, " ").trim()), ersterTon: runde.ersterTon ?? Date.now() - start, fertig: Date.now() - start, tokens: runde.tokens, unterbrochen: runde.unterbrochen }),
      fehler: (e) => nein(e),
    };
    this.runde = runde;
    this.senden({ realtimeInput: { activityStart: {} } });
    return {
      stueck: (b64) => this.stueck(b64),
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

  async frage(text: string, onText?: (t: string) => void, anzeige = text): Promise<LiveErgebnis> {
    await this.bereit;
    if (this.geschlossen || !this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error("Gemini-Verbindung ist zu");
    this.verstummen();
    const start = Date.now();
    return new Promise((ja, nein) => {
      const runde: Runde = {
        text: "",
        frage: anzeige,
        onText,
        start,
        fertig: (t) => ja({ text: zahlenAlsZiffern(t), frage: anzeige, ersterTon: runde.ersterTon ?? Date.now() - start, fertig: Date.now() - start, tokens: runde.tokens }),
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
      this.ws?.close(1000, "Anruf beendet");
    } catch {
      /* egal */
    }
  }
}

/** angehängte KI-Hinweise („Diese Information ersetzt keine ärztliche Beratung …“) – gehören nicht zum Anrufer */
export const KI_HINWEIS = /(bitte beachten Sie,? dass|dies (ist|stellt) keine (medizinische|ärztliche)|ersetzt keine|keine (medizinische|ärztliche) (beratung|diagnose)|(medizinische|ärztliche)n? (beratung|rat)|als (ki|sprachmodell)|ich bin (nur )?(eine ki|ein (sprachmodell|programm)))/i;

/** gilt für alle Cloud-Anrufer zusätzlich zur Anweisung des Falls */
const ZUSATZ = [
  "Du sprichst Deutsch mit österreichischer Färbung, wie am Telefon. Du antwortest NUR als Anrufer – Hinweise in eckigen Klammern sind nur für dich und werden nie vorgelesen.",
  "DU HÖRST DIE LEITSTELLE AM TELEFON: Antworte wie ein Mensch am Telefon – meist ein kurzer Satz, keine Aufzählungen, nichts vorlesen. Deine Stimme passt zu deiner Stimmung (aufgeregt = schneller und höher, panisch = abgehackt, ruhig = gelassen).",
  "Hast du die Leitstelle akustisch nicht verstanden oder ergibt die Frage keinen Sinn, frag kurz nach („Wie bitte?“, „Was meinen Sie?“) statt zu raten. Fragt die Leitstelle etwas, das nicht in deinen Angaben steht, sagst du, dass du es nicht weißt.",
  "Redet die Leitstelle dazwischen, hörst du sofort auf und gehst auf das Neue ein.",
  "Gibt dir die Leitstelle eine Anweisung, bestätigst du sie zuerst kurz und sagst, dass bzw. wie du es machst („Ja, mach ich …“) – erst danach darfst du etwas fragen.",
  "Deine Eigenheit (unter DEINE ART), das Reden mit anderen Leuten am Ort und Bitten wie „Bitte schnell!“ kommen höchstens einmal im ganzen Gespräch vor – nicht in jeder Antwort.",
  "Erfinde keine Personen, Namen, Orte oder Verletzungen, die nicht in deinen Angaben stehen. Steht dort, dass etwas NICHT so ist (z. B. „verbrannt hast du dich nicht“), sagst du das klar.",
  "Unsicher bist du höchstens bei dem, was du über den Patienten weißt – deine eigene Adresse und deinen Namen kennst du.",
  "Du bist ein Mensch am Telefon, keine KI: Sag nie etwas über medizinische Beratung, Diagnosen, Haftung oder dass du ein Programm bist, und gib keine Hinweise oder Warnungen am Ende dazu.",
].join("\n");

const sitzungen = new Map<string, Sitzung>();

function alleSchliessen(): void {
  for (const s of sitzungen.values()) s.schliessen();
  sitzungen.clear();
}

/** Verbindung für einen Anruf (wird wiederverwendet; neu, wenn sie zu ist oder Freisprechen umgeschaltet wurde) */
export function sitzungFuer(o: SitzungOpt): Sitzung {
  const alt = sitzungen.get(o.id);
  if (alt && !alt.geschlossen && !!alt.opt.frei === !!o.frei && alt.opt.bezug === o.bezug) {
    // Anweisung hat sich geändert (z. B. Maßnahme): Gemini bekommt nur den neuen Stand, die Verbindung bleibt
    if (alt.systemText !== o.system) alt.systemText = o.system;
    if (o.ereignis) alt.opt.ereignis = o.ereignis;
    return alt;
  }
  alt?.schliessen();
  beobachten();
  const s = new Sitzung(o);
  sitzungen.set(o.id, s);
  return s;
}

export function sitzungDa(id: string): Sitzung | null {
  const s = sitzungen.get(id);
  return s && !s.geschlossen ? s : null;
}

/** Frage an den Cloud-Anrufer; die Antwort wird gleich gesprochen, onText zeigt sie live an */
export async function liveFrage(o: SitzungOpt, text: string, onText?: (t: string) => void, anzeige = text): Promise<LiveErgebnis> {
  let s = sitzungFuer(o);
  try {
    return await s.frage(text, onText, anzeige);
  } catch (err) {
    // einmal neu verbinden (Verbindung abgelaufen o. Ä.), außer der Schlüssel ist falsch
    if (/Schlüssel|Kontingent/.test(String((err as Error).message))) throw err;
    s.schliessen();
    sitzungen.delete(o.id);
    s = sitzungFuer({ ...o, verlauf: o.verlauf });
    return s.frage(text, onText, anzeige);
  }
}

/** Leitstelle spricht mit der Sprechtaste direkt zu Gemini */
export function liveSprechen(o: SitzungOpt, onText?: (t: string) => void): { stueck(b64: string): void; ende(): Promise<LiveErgebnis> } | null {
  if (!liveAktiv()) return null;
  return sitzungFuer(o).sprechen(onText);
}

/** Anrufer verstummt (z. B. Leitstelle redet dazwischen) */
export function liveVerstummen(id?: string): void {
  for (const [k, s] of sitzungen) if (!id || k === id) s.verstummen();
}

/** Verbindung kurz testen (Einstellungen) */
export async function liveTesten(): Promise<string> {
  const s = new Sitzung({ id: `test-${Date.now()}`, system: "Du bist ein freundlicher Mensch am Telefon. Antworte sehr kurz auf Deutsch.", verlauf: [], aktiv: () => true });
  try {
    const r = await s.frage("Sag bitte nur: Verbindung steht.");
    setLivePrefs({ geprueft: kurz(livePrefs().schluessel) });
    return `${r.text || "(ohne Text)"} – erster Ton nach ${(r.ersterTon / 1000).toFixed(1)} s`;
  } finally {
    setTimeout(() => s.schliessen(), 4000);
  }
}

/** Anruf vorbei: Verbindungen schließen (regelmäßig und bei jeder Änderung) */
export function liveAufraeumen(): void {
  for (const [id, s] of sitzungen) {
    if (!s.opt.aktiv()) {
      s.schliessen();
      sitzungen.delete(id);
    }
  }
}

let beobachtet = false;
function beobachten(): void {
  if (beobachtet) return;
  beobachtet = true;
  // Sprechtaste gedrückt oder aufgelegt: Anrufer verstummt sofort
  verstummHoerer.add(() => liveVerstummen());
  setInterval(liveAufraeumen, 2000);
}

// ------------------------------------------------------------------ Funk: Stimmen der Fahrzeuge und Mitschrift

/** alle Stimmen von Gemini Live (im Gratis-Zugang alle verfügbar) */
export const FUNK_STIMMEN = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe",
  "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];

/**
 * Einen Funkspruch mit der Stimme des Fahrzeugs sprechen lassen: eigene, kurze Verbindung.
 * Der Ton kommt laufend über onTon; am Ende die Mitschrift. Fehler vor dem ersten Ton → Ablehnung (dann übernimmt der Ersatz).
 */
export function liveFunkSprechen(o: { stimme: string; system: string; text: string; onTon: (pcm: Int16Array, rate: number) => void; onStart?: () => void }): Promise<{ text: string; ersterTon: number; fertig: number }> {
  return new Promise((ja, nein) => {
    if (!liveAktiv()) return nein(new Error("Gemini ist nicht aktiv"));
    const ws = new WebSocket(`${URL_BASIS}?key=${encodeURIComponent(livePrefs().schluessel.trim())}`);
    const start = Date.now();
    let text = "";
    let erster = 0;
    let stumm = false;
    let fertig = false;
    const zu = (e?: Error) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(uhr);
      try {
        ws.close(1000, "Funkspruch fertig");
      } catch {
        /* egal */
      }
      if (e && !erster) nein(e);
      else ja({ text: text.replace(/[«»]/g, "").replace(/\s+/g, " ").trim(), ersterTon: erster, fertig: Date.now() - start });
    };
    const uhr = setTimeout(() => zu(new Error("Gemini antwortet nicht (Funk)")), 25000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${LIVE_MODELL}`,
            generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.stimme } } } },
            systemInstruction: { parts: [{ text: o.system }] },
            outputAudioTranscription: {},
          },
        }),
      );
    ws.onmessage = async (ev) => {
      const roh = typeof ev.data === "string" ? ev.data : ev.data instanceof Blob ? await ev.data.text() : new TextDecoder().decode(ev.data as ArrayBuffer);
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(roh);
      } catch {
        return;
      }
      if (m.setupComplete) {
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: o.text }] }], turnComplete: true } }));
        return;
      }
      const sc = m.serverContent as { modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }; outputTranscription?: { text?: string }; turnComplete?: boolean } | undefined;
      if (!sc) return;
      for (const p of sc.modelTurn?.parts ?? []) {
        if (!p.inlineData?.data || stumm) continue;
        if (!erster) {
          erster = Date.now() - start;
          o.onStart?.();
        }
        o.onTon(b64ZuInt16(p.inlineData.data), Number(/rate=(\d+)/.exec(p.inlineData.mimeType ?? "")?.[1] ?? 24000));
      }
      if (sc.outputTranscription?.text && !stumm) {
        text += sc.outputTranscription.text;
        const k = KI_HINWEIS.exec(text);
        if (k) {
          stumm = true;
          text = text.slice(0, k.index);
          return zu();
        }
      }
      if (sc.turnComplete) zu();
    };
    ws.onerror = () => undefined;
    ws.onclose = (ev) => zu(new Error(/api key|key not valid|permission|unauth/i.test(ev.reason) ? "Gemini-Schlüssel ungültig" : /quota|exhausted|rate/i.test(ev.reason) ? "Kontingent von Gemini gerade erschöpft" : `Verbindung zu Gemini beendet (${ev.code})`));
  });
}

/** Funk mitschreiben: die Sprache (16 kHz, Base64) geht an Gemini, ende() liefert den erkannten Text */
export function liveMitschrift(): { stueck(b64: string): void; ende(): Promise<string>; abbrechen(): void } | null {
  if (!liveAktiv()) return null;
  const s = new Sitzung({
    id: `funk-${Date.now()}`,
    system: "Du hörst den Funk einer Rettungsleitstelle in Österreich nur mit. Antworte immer nur mit dem einen Wort: ok.",
    verlauf: [],
    aktiv: () => true,
    stumm: true,
  });
  const sp = s.sprechen();
  return {
    stueck: (b64) => sp.stueck(b64),
    ende: async () => {
      try {
        const r = await Promise.race([sp.ende(), new Promise<never>((_, nein) => setTimeout(() => nein(new Error("Zeit")), 12000))]);
        return r.frage;
      } catch (e) {
        console.warn("Funk-Mitschrift", e);
        return "";
      } finally {
        setTimeout(() => s.schliessen(), 500);
      }
    },
    abbrechen: () => s.schliessen(),
  };
}

/**
 * Test: Gemini versteht den Funk der Leitstelle. Gemini bekommt die Fahrzeugliste und das laufende Gespräch
 * und gibt über eine Funktion den Wortlaut zurück (Rufnamen richtig geschrieben, Zahlen als Ziffern) – spricht nichts.
 * Audio: 16 kHz, 16 Bit, Base64.
 */
export function liveFunkVerstehen(k: { fahrzeuge: string[]; partner?: string; zuletzt?: string[]; orte?: string[] }): { stueck(b64: string): void; ende(): Promise<string>; abbrechen(): void } | null {
  if (!liveAktiv()) return null;
  const ws = new WebSocket(`${URL_BASIS}?key=${encodeURIComponent(livePrefs().schluessel.trim())}`);
  const system = [
    "Du bist die Spracherkennung am Funk einer Rettungsleitstelle in Niederösterreich (Rufname der Leitstelle: LEO).",
    "Du hörst EINEN Funkspruch der Leitstelle. Rufe danach IMMER die Funktion funkspruch auf – sprich NICHTS.",
    "text = der Funkspruch Wort für Wort auf Deutsch, nichts dazu, nichts weglassen; Rufnamen in der Schreibweise der Liste (gesprochen „75 1“ = 75/001, „Neff“ = NEF, „Christophorus 2“ = C2), Zahlen als Ziffern.",
    "ziel = Rufname aus der Liste, an den der Spruch geht, oder leer.",
    "Typische Funksprüche der Leitstelle: „… von LEO, kommen“, „Hier LEO, kommen“, „bitte gebt mir eine Lagemeldung, wenn ihr vor Ort seid“, „wie ist euer Status“, „was ist eure Eintreffzeit“, „Zielkrankenhaus …“, „Zusatzinfo …“, „Storno, rückt ein“, „Notarzt ist alarmiert“, „mitgehört“, „verstanden, Ende“. Die Leitstelle spricht Besatzungen mit „ihr“ an.",
    "Ist ein Wort undeutlich, nimm das, was am Funk Sinn ergibt (z. B. „vor Ort“ statt „Fort“, „LEO“ statt „liegen“) – erfinde aber nichts dazu.",
    k.orte?.length ? `Orte und Krankenhäuser in der Nähe: ${k.orte.slice(0, 150).join(", ")}.` : "",
    `Fahrzeuge: ${k.fahrzeuge.slice(0, 250).join(", ")}.`,
    k.partner ? `Laufendes Gespräch mit: ${k.partner}.${k.zuletzt?.length ? ` Zuletzt: ${k.zuletzt.join(" / ")}` : ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  let offen = false;
  const warte: string[] = [];
  let fertig: ((t: string) => void) | null = null;
  let ergebnis: string | null = null;
  const senden = (o: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));
  const schluss = (t: string) => {
    if (ergebnis !== null) return;
    ergebnis = t;
    fertig?.(t);
    try {
      ws.close(1000, "fertig");
    } catch {
      /* egal */
    }
  };
  ws.onopen = () =>
    senden({
      setup: {
        model: `models/${LIVE_MODELL}`,
        generationConfig: { responseModalities: ["AUDIO"] },
        systemInstruction: { parts: [{ text: system }] },
        tools: [{ functionDeclarations: [{ name: "funkspruch", description: "erkannter Funkspruch", parameters: { type: "OBJECT", properties: { text: { type: "STRING" }, ziel: { type: "STRING" } }, required: ["text"] } }] }],
        inputAudioTranscription: {},
        realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
      },
    });
  let mitschrift = "";
  ws.onmessage = async (ev) => {
    const roh = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(roh);
    } catch {
      return;
    }
    if (m.setupComplete) {
      offen = true;
      senden({ realtimeInput: { activityStart: {} } });
      for (const b of warte.splice(0)) senden({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b } } });
      return;
    }
    const sc = m.serverContent as { inputTranscription?: { text?: string }; turnComplete?: boolean } | undefined;
    if (sc?.inputTranscription?.text) mitschrift += sc.inputTranscription.text;
    const tc = m.toolCall as { functionCalls?: { name: string; args?: { text?: string } }[] } | undefined;
    const t = tc?.functionCalls?.find((f) => f.name === "funkspruch")?.args?.text;
    if (t) schluss(t.trim());
    else if (sc?.turnComplete) schluss(mitschrift.trim());
  };
  ws.onerror = () => schluss(mitschrift.trim());
  ws.onclose = () => schluss(mitschrift.trim());
  return {
    stueck(b64) {
      if (offen) senden({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b64 } } });
      else warte.push(b64);
    },
    ende() {
      return new Promise<string>((ja) => {
        if (ergebnis !== null) return ja(ergebnis);
        fertig = ja;
        const los = () => senden({ realtimeInput: { activityEnd: {} } });
        if (offen) los();
        else {
          const u = setInterval(() => {
            if (offen || ws.readyState > 1) {
              clearInterval(u);
              los();
            }
          }, 50);
        }
        setTimeout(() => schluss(mitschrift.trim()), 12000);
      });
    },
    abbrechen() {
      schluss("");
    },
  };
}
