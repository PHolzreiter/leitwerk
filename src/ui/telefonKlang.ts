/**
 * Hintergrund am Telefon (Paul 27.11.2026, Beta 82): Leitung (Rauschen, Knistern, Aussetzer), Umgebung je Ort
 * (echte Aufnahmen in Schleife), Wetter (nur draußen) und einzelne Geräusche je Fall (Stöhnen, Husten, Hund …).
 * Geplant wird in abfrage/leitung.ts (`klangPlan`), hier wird gespielt – alles durch denselben Telefonfilter.
 * Die Aufnahmen liegen in public/klang (Liste: src/data/klang.json, Herkunft unter „Über LeitWerk“).
 */
import liste from "../data/klang.json";
import { ereignisAbstand, klangPlan, zufallAus, type KlangPlan, type KlangStufe } from "../abfrage/leitung";
import { livePrefs } from "../abfrage/liveKi";
import { sim, type Einsatz } from "../sim/engine";
import { sprachPrefs } from "./sprache";

export interface KlangDatei {
  datei: string;
  tag: string;
  art: "loop" | "ereignis";
  /** Grundlautstärke (0–1), damit alles zueinander passt */
  laut: number;
  urheber: string;
  lizenz: string;
  titel: string;
  quelle: string;
}

export const KLANG_DATEIEN = liste as KlangDatei[];

/** Einstellung: Hintergrundgeräusche aus/dezent/realistisch (Standard dezent) */
export function klangStufe(): KlangStufe {
  const p = livePrefs() as { hintergrund?: KlangStufe; klang?: boolean };
  if (p.klang === false) return "aus";
  return p.hintergrund ?? "dezent";
}

/** wie laut Umgebung und Ereignisse je Stufe sind (die Stimme bleibt gleich) */
const PEGEL: Record<KlangStufe, { umgebung: number; ereignis: number; leitung: number }> = {
  aus: { umgebung: 0, ereignis: 0, leitung: 0 },
  dezent: { umgebung: 0.22, ereignis: 0.3, leitung: 0.6 },
  realistisch: { umgebung: 0.42, ereignis: 0.55, leitung: 1 },
};

/** Lautstärke je Umgebung (relativ) – laute Orte lauter */
const TAG_LAUT: Record<string, number> = {
  raum: 0.5, uhr: 0.35, fernseher: 0.45, flur: 0.5, verkehr: 0.8, verkehr_land: 0.7, autobahn: 0.9, auto_innen: 0.7,
  menge: 0.7, geschirr: 0.6, maschinen: 0.8, baustelle: 0.8, kinder: 0.7, menge_draussen: 0.7, wind: 0.6, voegel: 0.5,
  wasser: 0.6, regen: 0.6, starkregen: 0.8, sturm: 0.8, regen_drinnen: 0.4, feuer: 0.7, warnblinker: 0.4,
};

const puffer = new Map<string, Promise<AudioBuffer | null>>();
function laden(ctx: AudioContext, datei: string): Promise<AudioBuffer | null> {
  let p = puffer.get(datei);
  if (!p) {
    p = fetch(`/klang/${datei}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    puffer.set(datei, p);
  }
  return p;
}

function rauschPuffer(ctx: AudioContext, sek = 4): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sek), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

interface Laufend {
  id: string;
  ctx: AudioContext;
  stopp: () => void;
  plan: KlangPlan;
}
let jetzt: Laufend | null = null;
/** zuletzt gespielte Ereignisse (für Tests) */
export const klangLog: string[] = [];
/** Beta 83: Wechsel der Geräusche während des Anrufs (für Tests) */
export const klangWechsel: string[] = [];

/** Hintergrund für diesen Anruf starten (läuft schon einer für einen anderen Anruf: der hört auf) */
export function telefonKlangStarten(e: Einsatz): void {
  const stufe = klangStufe();
  if (jetzt?.id === e.id) return;
  telefonKlangStoppen();
  if (stufe === "aus") return;
  const wetter = sim.state.wetter as { lage?: string; wind?: number } | undefined;
  const plan = klangPlan(e, wetter);
  const pegel = PEGEL[stufe];
  const ctx = new AudioContext();
  const timer: ReturnType<typeof setTimeout>[] = [];
  const quellen: AudioScheduledSourceNode[] = [];
  const rnd = zufallAus(plan.leitung.seed ^ 0x2545f491);
  const handy = plan.leitung.art === "handy";
  // ---- Telefonfilter (wie die Stimme)
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = handy ? 300 : 250;
  const tp = ctx.createBiquadFilter();
  tp.type = "lowpass";
  tp.frequency.value = handy ? 3400 : 2900;
  const zerr = ctx.createWaveShaper();
  if (handy) {
    const k = new Float32Array(1024);
    for (let i = 0; i < k.length; i++) {
      const x = (i / (k.length - 1)) * 2 - 1;
      k[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
    }
    zerr.curve = k;
  }
  // Aussetzer: Tor vor dem Ausgang
  const tor = ctx.createGain();
  const ges = ctx.createGain();
  ges.gain.value = Math.max(0, sprachPrefs().laut / 100);
  hp.connect(tp).connect(zerr).connect(tor).connect(ges).connect(ctx.destination);
  const eingang = hp;
  // ---- Leitungsrauschen: schwankt langsam, beim Handy dazu Knistern
  const rausch = ctx.createBufferSource();
  rausch.buffer = rauschPuffer(ctx);
  rausch.loop = true;
  const rf = ctx.createBiquadFilter();
  rf.type = "bandpass";
  rf.frequency.value = handy ? 1800 : 900;
  rf.Q.value = 0.5;
  const rg = ctx.createGain();
  rg.gain.value = 0.006 * pegel.leitung;
  rausch.connect(rf).connect(rg).connect(eingang);
  rausch.start();
  quellen.push(rausch);
  const schwanken = () => {
    rg.gain.setTargetAtTime((0.003 + rnd() * (handy ? 0.01 : 0.004)) * pegel.leitung, ctx.currentTime, 1.5);
    timer.push(setTimeout(schwanken, 1500 + rnd() * 2500));
  };
  schwanken();
  if (handy) {
    const knister = () => {
      // kurzes Knacksen/Knistern
      const n = ctx.createBufferSource();
      n.buffer = rauschPuffer(ctx, 0.08);
      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime((0.02 + rnd() * 0.04) * pegel.leitung, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + rnd() * 0.05);
      n.connect(g).connect(eingang);
      n.start(t);
      timer.push(setTimeout(knister, (2 + rnd() * 10) * 1000 * (0.4 + plan.leitung.netz)));
    };
    timer.push(setTimeout(knister, 1500));
    // Aussetzer (unabhängig von der Stimme, gleiche Häufigkeit)
    const q = plan.leitung.netz;
    const aussetzer = () => {
      const t = ctx.currentTime;
      const lang = rnd() < (1 - q) * 0.35;
      const d = lang ? 0.3 + rnd() * 0.5 : 0.04 + rnd() * 0.12;
      tor.gain.setTargetAtTime(0, t, 0.002);
      tor.gain.setTargetAtTime(1, t + d, 0.002);
      const p = 0.0012 + Math.pow(1 - q, 2) * 0.03;
      timer.push(setTimeout(aussetzer, Math.max(300, (-Math.log(1 - rnd()) / p) * 20)));
    };
    if (q < 0.999) timer.push(setTimeout(aussetzer, 2000));
  }
  // ---- Umgebung und Wetter: Aufnahmen in Schleife
  const wahl = (tag: string, art: "loop" | "ereignis") => {
    const l = KLANG_DATEIEN.filter((d) => d.tag === tag && d.art === art);
    return l.length ? l[Math.floor(rnd() * l.length)] : null;
  };
  const schleife = async (tag: string, laut: number) => {
    const d = wahl(tag, "loop");
    if (!d) return;
    const b = await laden(ctx, d.datei);
    if (!b || jetzt?.ctx !== ctx) return;
    const q = ctx.createBufferSource();
    q.buffer = b;
    q.loop = true;
    // MP3 hat am Anfang/Ende ein paar Millisekunden Polster – Schleife ohne Lücke
    if (b.duration > 1) {
      q.loopStart = 0.06;
      q.loopEnd = b.duration - 0.06;
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(laut * d.laut * (TAG_LAUT[tag] ?? 0.6), ctx.currentTime, 0.6);
    q.connect(g).connect(eingang);
    q.start(ctx.currentTime, rnd() * Math.max(0, b.duration - 1));
    quellen.push(q);
  };
  for (const tag of plan.umgebung) void schleife(tag, pegel.umgebung);
  for (const tag of plan.wetter) void schleife(tag, pegel.umgebung * 0.9);
  // ---- Ereignisse (Beta 83: folgen dem Zustand des Patienten und der Stimmung – der Plan wird laufend nachgezogen)
  let naechster: ReturnType<typeof setTimeout> | undefined;
  const planen = (ms: number) => {
    if (naechster) clearTimeout(naechster);
    naechster = setTimeout(() => void ereignis(), ms);
    timer.push(naechster);
  };
  const patientW = String(e.wahr.abfrage?.szenario?.patient?.geschlecht ?? e.wahr.abfrage?.antworten?.geschlecht ?? "") === "w";
  const ereignis = async () => {
    if (jetzt?.ctx !== ctx) return;
    const gesamt = plan.ereignisse.reduce((s, [, g]) => s + g, 0);
    let r = rnd() * gesamt;
    let tag = plan.ereignisse[0]?.[0];
    for (const [k, g] of plan.ereignisse) {
      r -= g;
      if (r <= 0) {
        tag = k;
        break;
      }
    }
    if (tag) {
      // Patientin: weibliche Stimme, wenn es eine gibt
      const t2 = patientW && KLANG_DATEIEN.some((d) => d.tag === `${tag}_w`) ? `${tag}_w` : tag;
      const d = wahl(t2, "ereignis") ?? wahl(t2, "loop");
      const b = d ? await laden(ctx, d.datei) : null;
      if (d && b && jetzt?.ctx === ctx) {
        const q = ctx.createBufferSource();
        q.buffer = b;
        const g = ctx.createGain();
        // weiter weg oder näher – und nicht immer gleich laut
        g.gain.value = pegel.ereignis * d.laut * (0.55 + rnd() * 0.45) * (0.8 + plan.aufregung * 0.4);
        q.connect(g).connect(eingang);
        q.start();
        klangLog.push(t2);
        if (klangLog.length > 50) klangLog.shift();
      }
    }
    planen(ereignisAbstand(stufe, plan.aufregung, rnd) * 1000);
  };
  planen((3 + rnd() * 6) * 1000);
  // Zustand beobachten: wird der Patient bewusstlos, hört das Stöhnen auf und es röchelt; regt sich der Anrufer auf, wird es dichter
  const zustand = (x: Einsatz) => {
    const ab = x.wahr.abfrage;
    return `${ab?.antworten?.bw ?? ""}|${ab?.antworten?.at ?? ""}|${ab?.stimmung?.stufe ?? ""}`;
  };
  let war = zustand(e);
  const beobachten = () => {
    if (jetzt?.ctx !== ctx) return;
    const x = sim.state.einsaetze.find((y) => y.id === e.id) ?? e;
    const z = zustand(x);
    if (z !== war) {
      war = z;
      const neu = klangPlan(x, wetter);
      const vorher = plan.ereignisse.map(([k]) => k).join(",");
      plan.ereignisse = neu.ereignisse;
      plan.aufregung = neu.aufregung;
      const nachher = plan.ereignisse.map(([k]) => k).join(",");
      if (nachher !== vorher) {
        klangWechsel.push(`${vorher || "–"} → ${nachher || "–"}`);
        // das Neue bald hören lassen
        planen((1.5 + rnd() * 2.5) * 1000);
      }
    }
    timer.push(setTimeout(beobachten, 1500));
  };
  timer.push(setTimeout(beobachten, 1500));
  jetzt = {
    id: e.id,
    ctx,
    plan,
    stopp: () => {
      timer.forEach(clearTimeout);
      for (const q of quellen) {
        try {
          q.stop();
        } catch {
          /* schon aus */
        }
      }
      void ctx.close().catch(() => undefined);
    },
  };
}

export function telefonKlangStoppen(): void {
  jetzt?.stopp();
  jetzt = null;
}

/** läuft gerade Hintergrund? (für Tests) */
export function telefonKlangJetzt(): { id: string; plan: KlangPlan } | null {
  return jetzt ? { id: jetzt.id, plan: jetzt.plan } : null;
}
