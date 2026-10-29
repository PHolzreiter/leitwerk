/**
 * Sprechfunk Mensch zu Mensch (Spieler-NAH ↔ Leitstelle, Pilot ↔ RTW):
 * - Sprechtaste halten → das Mikrofon geht in Stücken à 100 ms (8 kHz, μ-law) direkt über den Relay an alle
 *   Mitspieler und wird dort sofort abgespielt (kleiner Puffer, Funk-Klang). Alle im Spiel hören mit.
 * - Bevor gesendet wird, fragt das Programm beim Host, ob der Kanal frei ist (nichts wird unterbrochen);
 *   die Aufnahme läuft dabei schon, damit das erste Wort nicht fehlt.
 * - Nach dem Loslassen erkennt Whisper beim Sprecher den Text → steht im Funkfenster und im Einsatzprotokoll.
 */
import { invoke, Channel } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { mp } from "../net/mehrspieler";
import { sim } from "../sim/engine";
import { toast } from "./dom";
import { FUNK_RATE, FunkKodierer, funkDekodieren } from "./funkCodec";
import { istPilot } from "./pilot/modus";
import { aufnahmeLaeuftJetzt, aufnahmeSperre, funkHaken, funkNamenGlaetten, sprachPrefs, sprachStatus, sprachTest, verstummen } from "./sprache";

export type FunkZiel = "leo" | "rtw";

/** für Tests: wie viele Stücke gesendet und empfangen wurden */
export const funkStatistik = { gesendet: 0, empfangen: 0, stroeme: 0 };

// ------------------------------------------------------------ Wiedergabe

/** Puffer gegen Schwankungen im Netz (Sekunden) */
const PUFFER = 0.25;

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

// Manche Fenster spielen erst nach einer Bedienung ab: beim ersten Klick bzw. Tastendruck aufwecken
for (const ev of ["pointerdown", "keydown"]) {
  window.addEventListener(ev, () => void (ctx?.state === "suspended" && ctx.resume().catch(() => undefined)), { capture: true, passive: true });
}

interface Strom {
  von: string;
  wer: string;
  cursor: number;
  letzte: number;
  eingang: GainNode;
}

const stroeme = new Map<string, Strom>();
const empfangHoerer = new Set<() => void>();

function empfangGeaendert(): void {
  for (const f of empfangHoerer) f();
}

/** Wer spricht gerade (Stimme kommt an)? */
export function funkEmpfang(): { von: string; wer: string } | null {
  let neu: Strom | null = null;
  for (const s of stroeme.values()) if (!neu || s.letzte > neu.letzte) neu = s;
  return neu ? { von: neu.von, wer: neu.wer } : null;
}

export function onFunkEmpfang(fn: () => void): () => void {
  empfangHoerer.add(fn);
  return () => empfangHoerer.delete(fn);
}

/** Klangkette eines Stroms: Lautstärke → (Funk-Klang: Bandpass 300–3000 Hz, leicht übersteuert) → Ausgang */
function kette(c: AudioContext): GainNode {
  const p = sprachPrefs();
  const g = c.createGain();
  g.gain.value = Math.max(0, Math.min(1.5, p.funkLaut / 100));
  if (!p.klangfilter) {
    g.connect(c.destination);
    return g;
  }
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 300;
  const tp = c.createBiquadFilter();
  tp.type = "lowpass";
  tp.frequency.value = 3000;
  const ws = c.createWaveShaper();
  const kurve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * 2 - 1;
    kurve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
  }
  ws.curve = kurve;
  g.connect(hp).connect(tp).connect(ws).connect(c.destination);
  return g;
}

/** kurzes Rauschen beim Loslassen (nur mit Funk-Klang) */
function rauschen(c: AudioContext, ab: number): void {
  if (!sprachPrefs().klangfilter) return;
  const n = Math.round(0.12 * c.sampleRate);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.12 * (1 - i / n);
  const s = c.createBufferSource();
  s.buffer = b;
  const g = c.createGain();
  g.gain.value = Math.max(0, sprachPrefs().funkLaut / 100);
  s.connect(g).connect(c.destination);
  s.start(Math.max(ab, c.currentTime));
}

/** kurzer Doppelton: Kanal belegt */
function belegtTon(): void {
  try {
    const c = audio();
    for (const t of [0, 0.18]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = 520;
      g.gain.value = 0.08;
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + t);
      o.stop(c.currentTime + t + 0.1);
    }
  } catch {
    /* ohne Ton */
  }
}

function empfangen(pid: string, name: string, d: Record<string, unknown>): void {
  const sId = `${pid}:${String(d.s)}`;
  if (d.k === "a" && typeof d.b === "string") {
    const c = audio();
    let st = stroeme.get(sId);
    if (!st) {
      st = { von: String(d.v ?? name), wer: String(d.w ?? name), cursor: c.currentTime + PUFFER, letzte: Date.now(), eingang: kette(c) };
      stroeme.set(sId, st);
      funkStatistik.stroeme++;
      empfangGeaendert();
    }
    const samples = funkDekodieren(d.b);
    if (!samples.length) return;
    const buf = c.createBuffer(1, samples.length, FUNK_RATE);
    buf.copyToChannel(samples, 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(st.eingang);
    // Aussetzer im Netz: neu puffern statt zu stottern
    if (st.cursor < c.currentTime + 0.02) st.cursor = c.currentTime + 0.12;
    src.start(st.cursor);
    st.cursor += buf.duration;
    st.letzte = Date.now();
    funkStatistik.empfangen++;
  } else if (d.k === "e") {
    const st = stroeme.get(sId);
    if (!st) return;
    stroeme.delete(sId);
    if (ctx) {
      rauschen(ctx, st.cursor);
      const weg = st.eingang;
      setTimeout(() => weg.disconnect(), Math.max(0, (st.cursor - ctx.currentTime) * 1000) + 500);
    }
    empfangGeaendert();
  }
}

mp.onFunk(empfangen);

// abgerissene Ströme (Verbindung weg) aufräumen
setInterval(() => {
  let weg = false;
  for (const [k, s] of stroeme) {
    if (Date.now() - s.letzte > 1500 && (!ctx || s.cursor < ctx.currentTime)) {
      stroeme.delete(k);
      weg = true;
    }
  }
  if (weg) empfangGeaendert();
}, 500);

// ------------------------------------------------------------ Senden

interface Sendung {
  id: string;
  ziel: FunkZiel;
  von: string;
  wer: string;
  gId: number | null;
  frei: boolean;
  abgelehnt: boolean;
  los: boolean;
  n: number;
  warte: Record<string, unknown>[];
  freigabe: Promise<void>;
  /** Browser: Aufnahme im Fenster */
  browser?: { strom: MediaStream; ctx: AudioContext; proz: ScriptProcessorNode; kod: FunkKodierer; stuecke: Float32Array[] };
  nativ: boolean;
  uhr?: number;
  /** Mikrofon läuft */
  bereit: boolean;
  /** schon losgelassen, bevor das Mikrofon lief */
  frueh: boolean;
}

let sendung: Sendung | null = null;
const sendHoerer = new Set<() => void>();
let modellDa: boolean | null = null;
let modellHinweis = false;

function sendGeaendert(): void {
  for (const f of sendHoerer) f();
}

/** Eigener Sprechfunk: „wartet“ (Freigabe vom Host), „sendet“ oder null */
export function funkSendeZustand(): { art: "wartet" | "sendet"; ziel: FunkZiel } | null {
  if (!sendung || sendung.abgelehnt) return null;
  return { art: sendung.frei ? "sendet" : "wartet", ziel: sendung.ziel };
}

export function onFunkSenden(fn: () => void): () => void {
  sendHoerer.add(fn);
  return () => sendHoerer.delete(fn);
}

function zufall(): string {
  return Math.random().toString(36).slice(2, 8);
}

function schicken(d: Record<string, unknown>): void {
  if (mp.funkSenden(d)) funkStatistik.gesendet++;
}

function stueck(s: Sendung, b64: string): void {
  if (s.abgelehnt) return;
  const d = { k: "a", s: s.id, n: s.n++, v: s.von, w: s.wer, b: b64 };
  if (s.frei) schicken(d);
  else s.warte.push(d);
}

function eigenerRufname(): string {
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  return heli ? sim.rufname(heli) : "LEO";
}

/** Fachbegriffe und Rufnamen für die Spracherkennung */
function hinweis(): string {
  const piloten = Object.values(sim.state.fahrzeuge).filter((f) => f.pilot);
  const am = Object.values(sim.state.fahrzeuge).slice(0, 50);
  return `Hier LEO, kommen. Verstanden, Ende. Landeplatz, Einsatzort, Patient. ${[...piloten, ...am].map((f) => sim.rufname(f)).join(", ")}`;
}

let fensterMikro: { strom: MediaStream; geraet: string } | null = null;

/** Mikrofon im Fenster (bleibt offen, damit das nächste Drücken sofort aufnimmt) */
async function fensterMikrofon(): Promise<MediaStream> {
  const p = sprachPrefs();
  if (fensterMikro && fensterMikro.geraet === p.mikro && fensterMikro.strom.getAudioTracks().some((t) => t.readyState === "live")) return fensterMikro.strom;
  fensterMikro?.strom.getTracks().forEach((t) => t.stop());
  const strom = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: p.mikro ? { exact: p.mikro } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  fensterMikro = { strom, geraet: p.mikro };
  return strom;
}

async function browserAufnahme(s: Sendung): Promise<void> {
  const strom = await fensterMikrofon();
  const c = new AudioContext();
  const quelle = c.createMediaStreamSource(strom);
  const proz = c.createScriptProcessor(2048, 1, 1);
  const kod = new FunkKodierer(c.sampleRate, (b64) => stueck(s, b64));
  const stuecke: Float32Array[] = [];
  proz.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0);
    stuecke.push(new Float32Array(d));
    kod.daten(d);
  };
  quelle.connect(proz);
  proz.connect(c.destination);
  s.browser = { strom, ctx: c, proz, kod, stuecke };
}

/** auf 16 kHz (für die Spracherkennung) */
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

/**
 * Sprechtaste gedrückt. Pilot: ziel „leo“ (Leitstelle) oder „rtw“ (Bodenfahrzeug am Einsatz);
 * Leitstelle: immer „leo“ (spricht mit dem Piloten).
 */
export async function sprechStart(ziel: FunkZiel = "leo"): Promise<void> {
  if (sendung) return;
  if (!mp.aktiv) {
    toast("Sprechfunk gibt es nur im Mehrspieler", "error");
    return;
  }
  if (aufnahmeLaeuftJetzt()) return;
  aufnahmeSperre.funk = true;
  verstummen();
  const s: Sendung = {
    id: zufall(),
    ziel,
    von: eigenerRufname(),
    wer: sim.ich?.name ?? mp.ich.name,
    gId: null,
    frei: false,
    abgelehnt: false,
    los: false,
    n: 0,
    warte: [],
    freigabe: Promise.resolve(),
    nativ: inTauri() && !sprachTest.erkenner,
    bereit: false,
    frueh: false,
  };
  sendung = s;
  sendGeaendert();
  // Freigabe vom Host (Kanal frei?) – die Aufnahme startet gleichzeitig
  s.freigabe = sim
    .call("funkMensch", true, ziel)
    .then((id) => {
      if (s.abgelehnt) return;
      s.gId = id as number;
      s.frei = true;
      for (const d of s.warte) schicken(d);
      s.warte = [];
      sendGeaendert();
    })
    .catch((e) => {
      s.abgelehnt = true;
      s.warte = [];
      belegtTon();
      toast(String((e as Error)?.message ?? e), "error");
      // Mikrofon läuft schon: gleich wieder aus (sonst stoppt es nach dem Start)
      if (s.bereit) abgelehntAufraeumen(s);
    });
  try {
    if (s.nativ) {
      const ch = new Channel<string>();
      ch.onmessage = (b64) => stueck(s, b64);
      await invoke("funk_aufnahme_start", { mikro: sprachPrefs().mikro || null, funk: ch });
    } else await browserAufnahme(s);
  } catch (e) {
    s.abgelehnt = true;
    toast(`Mikrofon nicht verfügbar: ${String((e as Error)?.message ?? e)}`, "error");
    await s.freigabe;
    if (s.frei) void sim.call("funkMensch", false).catch(() => undefined);
    if (sendung === s) sendung = null;
    aufnahmeSperre.funk = false;
    sendGeaendert();
    return;
  }
  s.bereit = true;
  // inzwischen abgelehnt (Kanal belegt): Mikrofon gleich wieder aus
  if (s.abgelehnt) return abgelehntAufraeumen(s);
  // höchstens eine Minute am Stück
  s.uhr = window.setTimeout(() => sendung === s && void sprechStopp(), 60_000);
  // schon wieder losgelassen, während das Mikrofon startete?
  if (s.frueh) void sprechStopp();
}

/** Kanal war belegt: Mikrofon aus, nichts gesendet */
function abgelehntAufraeumen(s: Sendung): void {
  window.clearTimeout(s.uhr);
  void aufnahmeBeenden(s, false);
  if (sendung === s) sendung = null;
  aufnahmeSperre.funk = false;
  sendGeaendert();
}

/** Aufnahme beenden; mitText: Text erkennen (sonst nur stoppen) */
async function aufnahmeBeenden(s: Sendung, mitText: boolean): Promise<string> {
  let text = "";
  try {
    if (s.nativ) {
      if (mitText) {
        const st = await sprachStatus().catch(() => ({ modelle: [] as string[] }));
        modellDa = st.modelle.includes(sprachPrefs().modell);
      }
      const r = await invoke<{ text: string; sekunden: number; pegel: number }>("sprache_aufnahme_stopp", { modell: mitText && modellDa ? sprachPrefs().modell : "", hinweis: hinweis() });
      text = r.text;
      if (mitText && !modellDa && !modellHinweis) {
        modellHinweis = true;
        toast("Für den Text im Funkfenster das Sprachmodell laden (Funk-Einstellungen bzw. Einstellungen → Sprache)");
      }
    } else if (s.browser) {
      const b = s.browser;
      s.browser = undefined;
      await new Promise((r) => setTimeout(r, 250));
      b.proz.disconnect();
      b.kod.ende();
      const rate = b.ctx.sampleRate;
      void b.ctx.close();
      if (mitText && sprachTest.erkenner) {
        const laenge = b.stuecke.reduce((a, x) => a + x.length, 0);
        const alles = new Float32Array(laenge);
        let o = 0;
        for (const x of b.stuecke) {
          alles.set(x, o);
          o += x.length;
        }
        if (laenge / rate >= 0.3) text = await sprachTest.erkenner(auf16k(alles, rate), hinweis());
      }
    }
  } catch (e) {
    if (mitText) console.warn("Sprechfunk: Erkennung", e);
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Sprechtaste losgelassen */
export async function sprechStopp(): Promise<void> {
  const s = sendung;
  if (!s || s.los) return;
  if (!s.bereit && !s.abgelehnt) {
    s.frueh = true;
    return;
  }
  s.los = true;
  window.clearTimeout(s.uhr);
  if (s.abgelehnt) {
    if (sendung === s) sendung = null;
    aufnahmeSperre.funk = false;
    sendGeaendert();
    return;
  }
  const textP = aufnahmeBeenden(s, true);
  // Kanal nach dem Nachlauf (250 ms) frei geben – die Erkennung läuft danach weiter
  await Promise.race([textP.catch(() => ""), new Promise((r) => setTimeout(r, 450))]);
  await s.freigabe;
  if (s.frei) schicken({ k: "e", s: s.id, n: s.n });
  if (sendung === s) sendung = null;
  aufnahmeSperre.funk = false;
  sendGeaendert();
  if (!s.frei) return;
  await sim.call("funkMensch", false).catch(() => undefined);
  let text = await textP.catch(() => "");
  if (/^(untertitel|vielen dank( für)? (fürs )?zuschauen|copyright|\[?musik\]?|\*.*\*)/i.test(text)) text = "";
  if (text && s.gId !== null) {
    text = funkNamenGlaetten(text, Object.values(sim.state.fahrzeuge).map((f) => f.funkrufname));
    await sim.call("funkMenschText", s.gId, text).catch((e) => toast(String((e as Error)?.message ?? e), "error"));
  }
}

// ------------------------------------------------------------ Spracheingabe der Leitstelle beim KI-Funk live mitschicken

funkHaken.start = () => {
  if (!mp.aktiv) return null;
  const id = zufall();
  let n = 0;
  const wer = sim.ich?.name ?? mp.ich.name;
  funkHaken.ende = () => {
    schicken({ k: "e", s: id, n });
    funkHaken.ende = null;
  };
  return (b64: string) => schicken({ k: "a", s: id, n: n++, v: "LEO", w: wer, b: b64 });
};

// ------------------------------------------------------------ Funktaste der Leitstelle

let tasteUnten = false;
window.addEventListener(
  "keydown",
  (ev) => {
    if (istPilot() || ev.code !== sprachPrefs().funkTaste) return;
    if (!mp.aktiv) return;
    ev.preventDefault();
    if (ev.repeat || tasteUnten) return;
    tasteUnten = true;
    void sprechStart("leo");
  },
  true,
);
window.addEventListener(
  "keyup",
  (ev) => {
    if (ev.code !== sprachPrefs().funkTaste || !tasteUnten) return;
    ev.preventDefault();
    tasteUnten = false;
    void sprechStopp();
  },
  true,
);
window.addEventListener("blur", () => {
  if (tasteUnten) {
    tasteUnten = false;
    void sprechStopp();
  }
});

/** Knopf „gedrückt halten zum Sprechen“ */
export function sprechKnopfAnbinden(b: HTMLElement, ziel: () => FunkZiel = () => "leo"): void {
  b.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    b.setPointerCapture?.((ev as PointerEvent).pointerId);
    void sprechStart(ziel());
    // Loslassen auch merken, wenn der Knopf inzwischen neu gezeichnet wurde
    const los = () => {
      window.removeEventListener("pointerup", los, true);
      window.removeEventListener("pointercancel", los, true);
      void sprechStopp();
    };
    window.addEventListener("pointerup", los, true);
    window.addEventListener("pointercancel", los, true);
  });
}

// ------------------------------------------------------------ Vorlesen

/**
 * Wie laut ein Funkspruch vorgelesen wird (0 = gar nicht).
 * Leitstelle: wie bisher die Fahrzeuge in den eigenen Gesprächen.
 * Pilot: alles, was seinen Hubschrauber betrifft, normal; den übrigen Funkverkehr leiser (abschaltbar);
 * die Leitstelle nur, wenn sie getippt hat (Gesprochenes kommt ohnehin live).
 */
/** Sprechgruppe Großeinsatz mithören (Häkchen im Reiter „Funk Großeinsatz“) – eigene Gespräche hört man immer */
let gsMithoeren = (() => {
  try {
    return localStorage.getItem("lw-gs-mithoeren") !== "0";
  } catch {
    return true;
  }
})();
export function gsMithoerenAn(): boolean {
  return gsMithoeren;
}
export function gsMithoerenSetzen(an: boolean): void {
  gsMithoeren = an;
  try {
    localStorage.setItem("lw-gs-mithoeren", an ? "1" : "0");
  } catch {
    /* egal */
  }
}

export function funkVorleseLaut(g: { fzId: string; an?: { fzId: string } | null; fuehrer: { pid: string } | null; kanal?: "gs" }, s: { von: string }): number {
  const ich = sim.ich?.pid ?? mp.ich.pid;
  if (g.kanal === "gs" && !gsMithoeren && !(g.fuehrer && g.fuehrer.pid === ich)) return 0;
  if (!istPilot()) {
    if (s.von === "LEO") return 0;
    return !g.fuehrer || sim.mode === "solo" || g.fuehrer.pid === ich ? 1 : 0;
  }
  const heli = sim.pilotVon(ich);
  if (heli && s.von === sim.rufname(heli)) return 0;
  if (heli && (g.fzId === heli.id || g.an?.fzId === heli.id)) return 1;
  const p = sprachPrefs();
  return p.mithoeren ? Math.max(0, Math.min(1, p.mithoerenLaut / 100)) : 0;
}
