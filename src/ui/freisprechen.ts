/**
 * Cloud-Anrufer am Telefon: Freisprechen (das Mikrofon läuft während des Anrufs, Gemini erkennt selbst,
 * wann du fertig bist), Geräusche vom Notfallort und Vorab-Verbindung beim Klingeln (solo).
 */
import { Channel, invoke } from "@tauri-apps/api/core";
import { liveFreisprechen, liveVorwaermen } from "../abfrage/gespraech";
import { liveAktiv, livePrefs, prefsHoerer } from "../abfrage/liveKi";
import { inTauri } from "../platform";
import { sim, type Einsatz } from "../sim/engine";
import { el, toast } from "./dom";
import { istGespraechsfuehrer } from "./panels/notrufAbfrage";
import { aufnahmeIds, dauerAufnahme, pcm16b64, sprachPrefs } from "./sprache";

// ---------------------------------------------------------------- Freisprechen

let laeuftFuer: string | null = null;
/** Nummer der Aufnahme im Programm */
let aufnahmeId: number | null = null;
let pausiert = false;
let startet = false;
let web: { ctx: AudioContext; q: MediaStreamAudioSourceNode; p: ScriptProcessorNode; s: MediaStream } | null = null;
let anzeige: HTMLElement | null = null;

function anzeigen(an: boolean): void {
  if (an && !anzeige) {
    anzeige = el("div", { class: "sprech-anzeige hoert freisprech-anzeige" });
    anzeige.append(el("span", { class: "sprech-icon" }, "🎙"), el("span", {}, "Freisprechen – der Anrufer hört dich"));
    anzeige.style.bottom = "auto";
    anzeige.style.top = "56px";
    document.body.appendChild(anzeige);
  }
  if (anzeige) anzeige.hidden = !an;
}

async function starten(e: Einsatz): Promise<void> {
  const senden = liveFreisprechen(e);
  if (!senden) return;
  startet = true;
  laeuftFuer = e.id;
  try {
    if (inTauri()) {
      const kanal = new Channel<string>();
      kanal.onmessage = (b64) => senden(b64);
      aufnahmeId = (await invoke<number>("live_aufnahme_start", { mikro: sprachPrefs().mikro || null, kanal })) ?? null;
      if (aufnahmeId !== null) aufnahmeIds.add(aufnahmeId);
    } else {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const ctx = new AudioContext();
      const q = ctx.createMediaStreamSource(s);
      const p = ctx.createScriptProcessor(4096, 1, 1);
      p.onaudioprocess = (ev) => senden(pcm16b64(ev.inputBuffer.getChannelData(0), ctx.sampleRate));
      q.connect(p);
      p.connect(ctx.destination);
      web = { ctx, q, p, s };
    }
    anzeigen(true);
  } catch (err) {
    laeuftFuer = null;
    toast(`Freisprechen: Mikrofon nicht verfügbar – ${(err as Error).message ?? err}`, "error");
  } finally {
    startet = false;
  }
}

async function beenden(): Promise<void> {
  if (!laeuftFuer) return;
  laeuftFuer = null;
  anzeigen(false);
  if (web) {
    web.q.disconnect();
    web.p.disconnect();
    web.s.getTracks().forEach((t) => t.stop());
    void web.ctx.close();
    web = null;
  } else if (inTauri()) {
    const id = aufnahmeId;
    aufnahmeId = null;
    await invoke("sprache_aufnahme_stopp", { modell: "", hinweis: "", id }).catch(() => undefined);
    if (id !== null) aufnahmeIds.delete(id);
  }
}

dauerAufnahme.laeuft = () => !!laeuftFuer;
dauerAufnahme.pause = async () => {
  pausiert = true;
  await beenden();
};
dauerAufnahme.weiter = () => {
  pausiert = false;
  pruefen();
};

function meinAktiverAnruf(): Einsatz | undefined {
  return sim.state.einsaetze.find((x) => x.anruf?.status === "aktiv" && istGespraechsfuehrer(x));
}

// ---------------------------------------------------------------- Geräusche vom Notfallort

let klang: { ctx: AudioContext; id: string; stopp: () => void } | null = null;

function rauschen(ctx: AudioContext): AudioBufferSourceNode {
  const b = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const q = ctx.createBufferSource();
  q.buffer = b;
  q.loop = true;
  return q;
}

function klangStarten(e: Einsatz): void {
  const ort = String(e.wahr.abfrage?.szenario?.ortArt ?? "wohnung");
  const ctx = new AudioContext();
  const laut = Math.max(0, sprachPrefs().laut / 100);
  // alles klingt durchs Telefon
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 300;
  const tp = ctx.createBiquadFilter();
  tp.type = "lowpass";
  tp.frequency.value = 3400;
  const ges = ctx.createGain();
  ges.gain.value = laut;
  hp.connect(tp).connect(ges).connect(ctx.destination);
  const q = rauschen(ctx);
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  const timer: ReturnType<typeof setInterval>[] = [];
  const lfo = (hz: number, tiefe: number, basis: number) => {
    const o = ctx.createOscillator();
    o.frequency.value = hz;
    const og = ctx.createGain();
    og.gain.value = tiefe;
    o.connect(og).connect(g.gain);
    g.gain.value = basis;
    o.start();
  };
  if (/strasse|straße|autobahn|kreuzung|parkplatz|tankstelle/.test(ort)) {
    // Verkehr: tiefes Rauschen, Autos fahren vorbei
    f.type = "lowpass";
    f.frequency.value = 500;
    lfo(0.07, 0.035, 0.05);
  } else if (/lokal|gasthaus|restaurant|verkauf|geschaeft|geschäft|arbeit|buero|büro|schule|bahnhof|halle|oeffentlich|öffentlich|markt/.test(ort)) {
    // Stimmengewirr
    f.type = "bandpass";
    f.frequency.value = 700;
    f.Q.value = 0.9;
    g.gain.value = 0.03;
    timer.push(setInterval(() => g.gain.setTargetAtTime(0.015 + Math.random() * 0.035, ctx.currentTime, 0.08), 260));
  } else if (/wald|park|berg|feld|wiese|garten|see|fluss|draussen|draußen|landwirtschaft/.test(ort)) {
    // Wind
    f.type = "lowpass";
    f.frequency.value = 900;
    lfo(0.13, 0.025, 0.035);
  } else {
    // Wohnung: leises Raumrauschen
    f.type = "lowpass";
    f.frequency.value = 250;
    g.gain.value = 0.012;
  }
  q.connect(f).connect(g).connect(hp);
  q.start();
  klang = {
    ctx,
    id: e.id,
    stopp: () => {
      timer.forEach(clearInterval);
      void ctx.close().catch(() => undefined);
    },
  };
}

function klangStoppen(): void {
  klang?.stopp();
  klang = null;
}

// ---------------------------------------------------------------- Prüfen bei jeder Änderung

function pruefen(): void {
  const p = livePrefs();
  const cloud = liveAktiv();
  const e = cloud ? meinAktiverAnruf() : undefined;
  // Freisprechen
  const soll = cloud && p.freisprechen && !!e && !pausiert;
  if (soll && laeuftFuer !== e!.id && !startet) {
    void (async () => {
      await beenden();
      await starten(e!);
    })();
  } else if (!soll && laeuftFuer && !startet) void beenden();
  // Geräusche
  const klangSoll = cloud && p.klang && !!e && sprachPrefs().vorlesen;
  if (klangSoll && klang?.id !== e!.id) {
    klangStoppen();
    try {
      klangStarten(e!);
    } catch (err) {
      console.warn("Hintergrund", err);
    }
  } else if (!klangSoll && klang) klangStoppen();
  // Solo: beim Klingeln schon verbinden
  if (cloud && sim.mode === "solo") for (const x of sim.state.einsaetze) if (x.anruf?.status === "klingelt" && x.wahr.abfrage) liveVorwaermen(x);
}

let angemeldet = false;
export function freisprechenStarten(): void {
  if (angemeldet) return;
  angemeldet = true;
  sim.onChange(() => pruefen());
  prefsHoerer.add(() => pruefen());
}
