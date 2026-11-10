/**
 * Sprechfunk Mensch zu Mensch (Spieler-NAH ↔ Leitstelle, Pilot ↔ RTW):
 * - Sprechtaste halten → das Mikrofon geht in Stücken à 100 ms (8 kHz, μ-law) direkt über den Relay an alle
 *   Mitspieler und wird dort sofort abgespielt (kleiner Puffer, Funk-Klang). Alle im Spiel hören mit.
 * - Bevor gesendet wird, fragt das Programm beim Host, ob der Kanal frei ist (nichts wird unterbrochen);
 *   die Aufnahme läuft dabei schon, damit das erste Wort nicht fehlt.
 * - Nach dem Loslassen erkennt Whisper beim Sprecher den Text → steht im Funkfenster und im Einsatzprotokoll.
 */
import { funkSprechform } from "../sim/funkErkennung";
import { funkGlaetten, funkHinweis } from "./funkNamen";
import { invoke, Channel } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { mp } from "../net/mehrspieler";
import { sim, SPRECHGRUPPEN, type Sprechgruppe } from "../sim/engine";
import { toast } from "./dom";
import { FUNK_RATE, FunkKodierer, funkDekodieren } from "./funkCodec";
import { istPilot } from "./pilot/modus";
import { tonBeginn, tonEinsatzRein, tonEnde, tonStatusDruck, tonStatusGesendet } from "./funkToene";
import { aufnahmeLaeuftJetzt, aufnahmeSperre, funkHaken, funkHoerHaken, funkTonHaken, sprachPrefs, sprachStatus, sprachTest, tastenBelegung, verstummen } from "./sprache";

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
  /** Grundlautstärke (Einstellung) und Kopfdaten – damit die Lautstärke nachgeführt werden kann */
  basis: number;
  d: Record<string, unknown>;
}

const stroeme = new Map<string, Strom>();
const empfangHoerer = new Set<() => void>();

function empfangGeaendert(): void {
  for (const f of empfangHoerer) f();
}

/** Wer spricht gerade (Stimme kommt an)? */
export function funkEmpfang(gruppe?: Sprechgruppe): { von: string; wer: string } | null {
  let neu: Strom | null = null;
  for (const s of stroeme.values()) if ((gruppe === undefined || stromGruppe(s.d) === gruppe) && (!neu || s.letzte > neu.letzte)) neu = s;
  return neu ? { von: neu.von, wer: neu.wer } : null;
}

/** Sprechgruppe eines Stroms (Mitspieler schicken sie mit, KI-Stimmen über ihr Gespräch) */
function stromGruppe(d: Record<string, unknown>): Sprechgruppe {
  if (d.r === "gs" || d.r === "gs2") return d.r;
  if (typeof d.g === "number") return sim.state.funkGespraeche?.find((x) => x.id === d.g)?.kanal ?? null;
  return null;
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

/** Ton des Funkgeräts hier abspielen (eigene Sprechtaste, vorgelesene Funksprüche); laut 0 = nicht */
export function funkTon(art: "beginn" | "ende" | "statusDruck" | "statusGesendet" | "einsatzRein", laut = 1): number {
  if (laut <= 0) return 0;
  try {
    const c = audio();
    // „Einsatz rein“ ist schon eine Aufnahme vom Gerät: ohne Funkfilter
    let g: GainNode;
    if (art === "einsatzRein") {
      g = c.createGain();
      g.gain.value = Math.max(0, Math.min(1.5, sprachPrefs().funkLaut / 100));
      g.connect(c.destination);
    } else g = kette(c);
    g.gain.value *= laut;
    const bis = art === "beginn" ? tonBeginn(c, g) : art === "ende" ? tonEnde(c, g) : art === "statusDruck" ? tonStatusDruck(c, g) : art === "einsatzRein" ? tonEinsatzRein(c, g) : tonStatusGesendet(c, g);
    setTimeout(() => g.disconnect(), (bis - c.currentTime) * 1000 + 300);
    return Math.max(0, (bis - c.currentTime) * 1000);
  } catch {
    return 0;
  }
}

funkTonHaken.ton = (art, laut) => funkTon(art, laut);

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

/** angekündigte Funksprüche mit Cloud-Stimme (Gespräch:Spruch) → Zeit; die werden hier nicht vorgelesen */
const angekuendigt = new Map<string, number>();
export function funkAngekuendigt(gId: number, i: number): boolean {
  return angekuendigt.has(`${gId}:${i}`);
}

/** Lautstärke eines Stroms: KI-Fahrzeuge wie beim Vorlesen (eigene Gespräche laut, fremde gar nicht bzw. leise) */
function stromLaut(d: Record<string, unknown>, von: string): number {
  // Sprechgruppe stumm geschaltet (bzw. Pilot hört sie nicht)
  if (typeof d.g !== "number") {
    // Stimme eines Mitspielers: Disponent (LEO) oder Pilot – abschaltbar (nur der Ton)
    if (!d.ki && (von === "LEO" ? !wahl.echteDispos : !wahl.echtePiloten)) return 0;
    return gruppeLaut(d.r === "gs" || d.r === "gs2" ? d.r : null);
  }
  if (d.ki && !sprachPrefs().funkVorlesen) return 0;
  const g = sim.state.funkGespraeche?.find((x) => x.id === d.g);
  return g ? funkVorleseLaut(g, { von }) : 1;
}

function empfangen(pid: string, name: string, d: Record<string, unknown>): void {
  const sId = `${pid}:${String(d.s)}`;
  if (d.k === "v" && typeof d.g === "number") {
    angekuendigt.set(`${d.g}:${String(d.i)}`, Date.now());
    if (angekuendigt.size > 200) for (const k of [...angekuendigt.keys()].slice(0, 100)) angekuendigt.delete(k);
    return;
  }
  if (d.k === "a" && typeof d.b === "string") {
    const c = audio();
    let st = stroeme.get(sId);
    if (!st) {
      const eingang = kette(c);
      st = { von: String(d.v ?? name), wer: String(d.w ?? name), cursor: c.currentTime + PUFFER, letzte: Date.now(), eingang, basis: eingang.gain.value, d };
      st.eingang.gain.value = st.basis * stromLaut(d, st.von);
      // Beginn-Ton des Funkgeräts vor der Stimme
      st.cursor = tonBeginn(c, st.eingang, st.cursor);
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
      const bis = tonEnde(ctx, st.eingang, st.cursor + 0.05);
      const weg = st.eingang;
      setTimeout(() => weg.disconnect(), Math.max(0, (bis - ctx.currentTime) * 1000) + 500);
    }
    empfangGeaendert();
  }
}

mp.onFunk(empfangen);

/** Lautstärke laufender Ströme nachführen (eigene Sprechtaste, Telefon, Sprechgruppe gewechselt) */
function lautNeu(): void {
  for (const st of stroeme.values()) st.eingang.gain.value = st.basis * stromLaut(st.d, st.von);
}

// abgerissene Ströme (Verbindung weg) aufräumen
setInterval(() => {
  lautNeu();
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
  /** Mitschrift über Gemini (statt der Erkennung hier) */
  mitschrift?: { stueck(b64: string): void; ende(): Promise<string>; abbrechen(): void } | null;
  /** Sprechgruppe (null = normale Gruppe, „gs“/„gs2“ = Großeinsatz 09/10) */
  gruppe: Sprechgruppe | undefined;
  /** wartet, bis der laufende Funkspruch fertig ist */
  wartet: boolean;
}

let sendung: Sendung | null = null;
const sendHoerer = new Set<() => void>();
let modellDa: boolean | null = null;
let funkModelle: string[] = [];

/**
 * Modell für den Funk: Whisper kennt die Rufnamen aus dem Hinweis, Parakeet nicht (und erkennt Funk schlecht).
 * Ist Parakeet gewählt und ein Whisper-Modell da, nimmt der Funk Whisper – das beste vorhandene.
 */
function funkModell(da: string[]): string {
  const gewaehlt = sprachPrefs().modell;
  if (!/parakeet/i.test(gewaehlt) && da.includes(gewaehlt)) return gewaehlt;
  return ["ggml-large-v3-turbo-q5_0.bin", "ggml-small.bin", "ggml-base.bin"].find((m) => da.includes(m)) ?? (da.includes(gewaehlt) ? gewaehlt : "");
}
let modellHinweis = false;

function sendGeaendert(): void {
  lautNeu();
  for (const f of sendHoerer) f();
}

/** Eigener Sprechfunk: „wartet“ (Kanal belegt, nach dem Ende-Ton geht es los), „sendet“ oder null */
export function funkSendeZustand(): { art: "wartet" | "sendet"; ziel: FunkZiel; belegt: boolean } | null {
  if (!sendung || sendung.abgelehnt) return null;
  return { art: sendung.frei ? "sendet" : "wartet", ziel: sendung.ziel, belegt: sendung.wartet };
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

/** μ-law-Stück (8 kHz) → 16 kHz, 16 Bit, Base64 (für die Mitschrift) */
function auf16kB64(b64: string): string {
  const x = funkDekodieren(b64);
  const u = new Uint8Array(x.length * 4);
  const v = new DataView(u.buffer);
  for (let i = 0; i < x.length; i++) {
    const a = x[i];
    const b = i + 1 < x.length ? x[i + 1] : a;
    v.setInt16(i * 4, Math.round(a * 32767), true);
    v.setInt16(i * 4 + 2, Math.round(((a + b) / 2) * 32767), true);
  }
  let t = "";
  for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(t);
}

/** Pegel des eigenen Mikrofons (0–1, geglättet) und der lauteste Wert der laufenden Sendung */
let pegel = 0;
let pegelMax = 0;
export function funkPegel(): number {
  return pegel;
}

function stueck(s: Sendung, b64: string): void {
  if (s.abgelehnt) return;
  const x = funkDekodieren(b64);
  let q = 0;
  for (let i = 0; i < x.length; i++) q += x[i] * x[i];
  const rms = Math.sqrt(q / Math.max(1, x.length));
  pegel = Math.max(rms, pegel * 0.6);
  if (s.frei) pegelMax = Math.max(pegelMax, rms);
  s.mitschrift?.stueck(auf16kB64(b64));
  const d = { k: "a", s: s.id, n: s.n++, v: s.von, w: s.wer, r: s.gruppe ?? null, b: b64 };
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
  return funkHinweis(`Landeplatz, Einsatzort, Patient. ${piloten.map((f) => funkSprechform(sim.rufname(f))).join(", ")}${piloten.length ? ", " : ""}`);
}

let fensterMikro: { strom: MediaStream; geraet: string } | null = null;

/** Mikrofon im Fenster (bleibt offen, damit das nächste Drücken sofort aufnimmt) */
async function fensterMikrofon(): Promise<MediaStream> {
  const p = sprachPrefs();
  const mik = p.mikroFunk || p.mikro;
  if (fensterMikro && fensterMikro.geraet === mik && fensterMikro.strom.getAudioTracks().some((t) => t.readyState === "live")) return fensterMikro.strom;
  fensterMikro?.strom.getTracks().forEach((t) => t.stop());
  const strom = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: mik ? { exact: mik } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  fensterMikro = { strom, geraet: mik };
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
export async function sprechStart(ziel: FunkZiel = "leo", gruppe?: Sprechgruppe): Promise<void> {
  if (sendung) return;
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
    gruppe: gruppe === undefined ? sprechGruppe() : gruppe,
    wartet: false,
  };
  // Gemini schreibt mit (die Erkennung hier braucht dann kein Sprachmodell)
  s.mitschrift = funkHoerHaken.strom?.() ?? null;
  sendung = s;
  sendGeaendert();
  // Freigabe vom Host (Kanal frei?) – die Aufnahme startet gleichzeitig. Spricht gerade jemand:
  // warten, bis sein Ende-Ton kommt – dann der eigene Beginn-Ton und es geht los
  s.freigabe = sim
    .call("funkMensch", true, ziel, s.gruppe)
    .then(async (r) => {
      const a = r as { id: number | null; wartet: boolean } | null;
      if (s.abgelehnt || !a) return;
      s.gId = a.id;
      if (a.wartet) {
        s.wartet = true;
        sendGeaendert();
        const ich = sim.ich?.pid ?? mp.ich.pid;
        while (!s.abgelehnt && !s.los && sim.state.funkSendet?.pid !== ich) await new Promise((ok) => setTimeout(ok, 80));
        if (s.abgelehnt || s.los) return;
        s.gId = sim.state.funkSendet?.gId ?? s.gId;
        s.wartet = false;
      }
      // was vor der Freigabe ins Mikrofon kam, geht nicht hinaus
      s.warte = [];
      pegelMax = 0;
      funkTon("beginn");
      s.frei = true;
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
      await invoke("funk_aufnahme_start", { mikro: sprachPrefs().mikroFunk || sprachPrefs().mikro || null, funk: ch });
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
  s.mitschrift?.abbrechen();
  s.mitschrift = null;
  void aufnahmeBeenden(s, false);
  if (sendung === s) sendung = null;
  aufnahmeSperre.funk = false;
  sendGeaendert();
}

/** Aufnahme beenden; mitText: Text erkennen (sonst nur stoppen) */
async function aufnahmeBeenden(s: Sendung, mitText: boolean): Promise<string> {
  let text = "";
  const ms = s.mitschrift;
  s.mitschrift = null;
  if (ms && !mitText) ms.abbrechen();
  // Mitschrift über Gemini: die Aufnahme hier nur beenden
  if (ms && mitText) {
    try {
      if (s.nativ) await invoke("sprache_aufnahme_stopp", { modell: "", hinweis: "" });
      else if (s.browser) {
        const b = s.browser;
        s.browser = undefined;
        await new Promise((r) => setTimeout(r, 250));
        b.proz.disconnect();
        b.kod.ende();
        void b.ctx.close();
      }
    } catch (e) {
      console.warn("Sprechfunk", e);
    }
    text = await ms.ende();
    if (text.trim()) return text.replace(/\s+/g, " ").trim();
    return "";
  }
  try {
    if (s.nativ) {
      if (mitText) {
        const st = await sprachStatus().catch(() => ({ modelle: [] as string[] }));
        funkModelle = st.modelle;
        modellDa = st.modelle.includes(sprachPrefs().modell) || !!funkModell(st.modelle);
      }
      const r = await invoke<{ text: string; sekunden: number; pegel: number }>("sprache_aufnahme_stopp", { modell: mitText && modellDa ? funkModell(funkModelle) : "", hinweis: hinweis() });
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
  // losgelassen, während noch gewartet wurde: nichts gesendet
  if (!s.frei) {
    s.abgelehnt = true;
    s.mitschrift?.abbrechen();
    s.mitschrift = null;
    void aufnahmeBeenden(s, false);
    await sim.call("funkMensch", false).catch(() => undefined);
    if (sendung === s) sendung = null;
    aufnahmeSperre.funk = false;
    sendGeaendert();
    return;
  }
  funkTon("ende");
  pegel = 0;
  // fast nichts angekommen: Mikrofon zu leise oder falsches Gerät
  if (s.n > 8 && pegelMax < 0.015) toast("Dein Mikrofon ist sehr leise – bitte näher sprechen oder in den Einstellungen das richtige Mikrofon wählen", "error");
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
  if (text) {
    text = funkGlaetten(text);
    await sim.call("funkMenschText", s.gId, text, s.gruppe ?? null).catch((e) => toast(String((e as Error)?.message ?? e), "error"));
  } else if (s.n > 3) toast("Funkspruch nicht verstanden – bitte nochmal (oder tippen)", "error");
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

// ------------------------------------------------------------ Funksprüche der KI-Fahrzeuge mit Cloud-Stimme an alle

/** Funkspruch angekündigt: die anderen lesen ihn nicht selbst vor (die Stimme kommt gleich) */
export function kiFunkAnkuendigen(gId: number, i: number): void {
  angekuendigt.set(`${gId}:${i}`, Date.now());
  schicken({ k: "v", g: gId, i });
}

/**
 * Stimme eines KI-Fahrzeugs: geht wie Sprechfunk (8 kHz, μ-law) an alle und wird hier gleich mit Funk-Klang abgespielt.
 * Jeder Empfänger stellt die Lautstärke selbst ein (eigenes Gespräch laut, fremdes leise oder gar nicht).
 */
export function kiFunkStrom(meta: { von: string; gId: number }): { pcm(d: Int16Array, rate: number): void; ende(): number } {
  const id = `ki${zufall()}`;
  let n = 0;
  const ich = sim.ich?.pid ?? mp.ich.pid;
  let kod: FunkKodierer | null = null;
  const raus = (d: Record<string, unknown>) => {
    schicken(d);
    empfangen(ich, meta.von, d);
  };
  return {
    pcm(d, rate) {
      kod ??= new FunkKodierer(rate, (b64) => raus({ k: "a", s: id, n: n++, v: meta.von, w: meta.von, g: meta.gId, ki: 1, b: b64 }));
      const f = new Float32Array(d.length);
      for (let i = 0; i < d.length; i++) f[i] = d[i] / 32768;
      kod.daten(f);
    },
    /** gibt zurück, in wie vielen ms die Stimme hier fertig abgespielt ist (mit Ende-Ton) */
    ende() {
      kod?.ende();
      const st = stroeme.get(`${ich}:${id}`);
      const rest = st && ctx ? Math.max(0, (st.cursor - ctx.currentTime) * 1000) + 250 : 250;
      raus({ k: "e", s: id, n });
      return rest;
    },
  };
}

// ------------------------------------------------------------ Funktaste der Leitstelle

let tasteUnten: string | null = null;
/** welche Sprechgruppe eine Taste meint: Funktaste = die am Funkgerät gewählte, sonst die eigene Taste der Gruppe */
function tastenGruppe(code: string): Sprechgruppe | undefined | false {
  const p = sprachPrefs();
  if (code === p.funkTaste) return undefined;
  if (p.funkTasteNormal && code === p.funkTasteNormal) return null;
  if (p.funkTaste09 && code === p.funkTaste09) return "gs";
  if (p.funkTaste10 && code === p.funkTaste10) return "gs2";
  return false;
}
window.addEventListener(
  "keydown",
  (ev) => {
    if (istPilot() || tastenBelegung.aktiv) return;
    const gr = tastenGruppe(ev.code);
    if (gr === false) return;
    ev.preventDefault();
    if (ev.repeat || tasteUnten) return;
    // eigene Taste einer Gruppe, die es gerade nicht gibt (kein Großeinsatz): nichts tun
    if (gr !== undefined && !sim.offeneGruppen().includes(gr)) {
      toast(`${sim.sprechgruppeName(gr)} ist gerade nicht in Betrieb`, "error");
      return;
    }
    tasteUnten = ev.code;
    void sprechStart("leo", gr);
  },
  true,
);
window.addEventListener(
  "keyup",
  (ev) => {
    if (ev.code !== tasteUnten) return;
    ev.preventDefault();
    tasteUnten = null;
    void sprechStopp();
  },
  true,
);
window.addEventListener("blur", () => {
  if (tasteUnten) {
    tasteUnten = null;
    void sprechStopp();
  }
});

/** Knopf „gedrückt halten zum Sprechen“ */
export function sprechKnopfAnbinden(b: HTMLElement, ziel: () => FunkZiel = () => "leo", gruppe?: () => Sprechgruppe): void {
  b.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    b.setPointerCapture?.((ev as PointerEvent).pointerId);
    void sprechStart(ziel(), gruppe?.());
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
// ------------------------------------------------------------ Sprechgruppen: hören und sprechen

interface GruppenWahl {
  /** stumm geschaltete Gruppen (Text bleibt sichtbar, man hört nichts) */
  stumm: { normal?: boolean; gs?: boolean; gs2?: boolean };
  /** Leitstelle: in dieser Gruppe wird gesprochen (Steuerkreuz am Funkgerät) */
  senden: Sprechgruppe;
  /** Pilot: alle Gruppen hören (sonst nur die, zu der er alarmiert ist) */
  allesHoeren: boolean;
  /** Pilot: hier spricht er („auto“ = Gruppe seines Einsatzes) */
  pilotSenden: "auto" | "normal" | "gs" | "gs2";
  /** Lautstärke der Gruppen, in die man gerade nicht spricht (Mithören, %) */
  mithoerLaut: number;
  /** während eines Telefonats den Funk ganz stumm schalten (alt; gilt als „stumm“) */
  telefonStumm: boolean;
  /** Funk beim Telefonieren: normal, leiser oder stumm (Einstellungen › Mikrofon & Funk); fehlt = leiser */
  telefon?: "normal" | "leiser" | "stumm";
  /** Stimmen echter Mitspieler hören (der Text steht trotzdem im Verlauf) */
  echteDispos: boolean;
  echtePiloten: boolean;
}
let wahl: GruppenWahl = (() => {
  const std: GruppenWahl = { stumm: {}, senden: null, allesHoeren: false, pilotSenden: "auto", mithoerLaut: 50, telefonStumm: false, echteDispos: true, echtePiloten: true };
  try {
    const alt = localStorage.getItem("lw-gs-mithoeren") === "0";
    return { ...std, stumm: { gs: alt }, ...JSON.parse(localStorage.getItem("lw-funk-gruppen") ?? "{}") };
  } catch {
    return std;
  }
})();
const wahlHoerer = new Set<() => void>();
export function funkGruppenWahl(): GruppenWahl {
  return wahl;
}
export function funkGruppenSetzen(teil: Partial<GruppenWahl>): void {
  wahl = { ...wahl, ...teil, stumm: { ...wahl.stumm, ...(teil.stumm ?? {}) } };
  try {
    localStorage.setItem("lw-funk-gruppen", JSON.stringify(wahl));
  } catch {
    /* egal */
  }
  for (const f of wahlHoerer) f();
  lautNeu();
}
export function onFunkGruppen(fn: () => void): () => void {
  wahlHoerer.add(fn);
  return () => wahlHoerer.delete(fn);
}
const stummKey = (k: Sprechgruppe): "normal" | "gs" | "gs2" => (k === null ? "normal" : k);
/** gibt es gerade eine Großeinsatz-Gruppe? */
export function gsGruppeOffen(): boolean {
  return sim.offeneGruppen().length > 1;
}
/** Gruppe des Piloten (die seines Einsatzes) */
function pilotGruppe(): Sprechgruppe {
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  const e = heli?.einsatzId ? sim.einsatz(heli.einsatzId) : undefined;
  return sim.kanalVon(e);
}
/**
 * Gruppen am Funkgerät (Steuerkreuz): immer die eigene (Funkgruppe der Leitstelle) und die beiden
 * Großeinsatz-Gruppen RD-NOE-09 und -10 – auch ohne Großeinsatz (Vorgabe Paul 10.11.2026).
 */
export function waehlbareGruppen(): Sprechgruppe[] {
  return [...SPRECHGRUPPEN];
}
/** in welcher Gruppe die eigene Sprechtaste spricht */
export function sprechGruppe(): Sprechgruppe {
  const alle = waehlbareGruppen();
  if (istPilot()) {
    const k = wahl.pilotSenden === "auto" ? pilotGruppe() : wahl.pilotSenden === "normal" ? null : wahl.pilotSenden;
    return alle.includes(k) ? k : pilotGruppe();
  }
  return alle.includes(wahl.senden) ? wahl.senden : null;
}
/** Sprechgruppe am Funkgerät weiterschalten (Steuerkreuz links/rechts) */
export function sprechGruppeWeiter(richtung: 1 | -1): void {
  const alle = waehlbareGruppen();
  const i = Math.max(0, alle.indexOf(sprechGruppe()));
  const neu = alle[(i + richtung + alle.length) % alle.length];
  if (istPilot()) funkGruppenSetzen({ pilotSenden: neu === null ? "normal" : neu });
  else funkGruppenSetzen({ senden: neu });
}
/** hört man diese Gruppe überhaupt? */
export function gruppeHoerbar(kanal: Sprechgruppe | undefined): boolean {
  const k = kanal ?? null;
  if (istPilot()) return wahl.allesHoeren || k === pilotGruppe();
  return !wahl.stumm[stummKey(k)];
}
/**
 * Wie laut eine Gruppe gerade ist (0–1): die Sprechgruppe voll, die anderen leiser (Mithören);
 * während man selbst spricht die anderen kaum; beim Telefonieren auf Wunsch gar nicht.
 * dringend: ein dringender Ruf ist immer voll zu hören (außer stumm geschaltet).
 */
export function gruppeLaut(kanal: Sprechgruppe | undefined, dringend = false): number {
  const k = kanal ?? null;
  if (!gruppeHoerbar(k)) return 0;
  const ich = sim.ich?.pid ?? mp.ich.pid;
  const tel = telefonModus();
  const telefoniert = tel !== "normal" && sim.telefoniert(ich);
  if (telefoniert && tel === "stumm") return 0;
  if (dringend) return 1;
  // beim Telefonieren leiser (dringende Rufe bleiben voll)
  if (telefoniert) return Math.min(k === sprechGruppe() ? 0.35 : 0.15, gruppeLautOhneTelefon(k));
  const eigen = k === sprechGruppe();
  if (sendung?.frei) return eigen ? 0 : 0.15;
  return eigen ? 1 : Math.max(0, Math.min(1, wahl.mithoerLaut / 100));
}
/** Funk beim Telefonieren (alter Schalter „stumm“ zählt als stumm) */
export function telefonModus(): "normal" | "leiser" | "stumm" {
  return wahl.telefonStumm ? "stumm" : (wahl.telefon ?? "leiser");
}
function gruppeLautOhneTelefon(k: Sprechgruppe | null): number {
  const eigen = k === sprechGruppe();
  if (sendung?.frei) return eigen ? 0 : 0.15;
  return eigen ? 1 : Math.max(0, Math.min(1, wahl.mithoerLaut / 100));
}
/** alt: Häkchen „mithören“ im Reiter Großeinsatz */
export function gsMithoerenAn(): boolean {
  return !wahl.stumm.gs;
}
export function gsMithoerenSetzen(an: boolean): void {
  funkGruppenSetzen({ stumm: { gs: !an } });
}

/**
 * Wie laut ein Funkspruch vorgelesen wird (0 = gar nicht). Ein Kanal je Gruppe: jeder hört alles auf den Gruppen,
 * die er hört (die eigene Sprechgruppe laut, die anderen leiser). Pilot: was seinen Hubschrauber betrifft laut,
 * den Rest leiser. Gesprochenes von Menschen kommt ohnehin live (wird nicht vorgelesen).
 */
export function funkVorleseLaut(g: { fzId: string; an?: { fzId: string } | null; fuehrer: { pid: string } | null; kanal?: "gs" | "gs2" }, s: { von: string; text?: string }): number {
  const grund = gruppeLaut(g.kanal, /\bdringend\b/i.test(s.text ?? ""));
  if (grund <= 0) return 0;
  if (!istPilot()) return s.von === "LEO" ? 0 : grund;
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  if (heli && s.von === sim.rufname(heli)) return 0;
  if (heli && (g.fzId === heli.id || g.an?.fzId === heli.id)) return grund;
  const p = sprachPrefs();
  return p.mithoeren ? grund * Math.max(0, Math.min(1, p.mithoerenLaut / 100)) : 0;
}
