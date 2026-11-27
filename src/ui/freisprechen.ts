/**
 * Cloud-Anrufer am Telefon: Freisprechen (das Mikrofon läuft während des Anrufs, Gemini erkennt selbst,
 * wann du fertig bist), Geräusche vom Notfallort und Vorab-Verbindung beim Klingeln (solo).
 */
import { klangStufe, telefonKlangJetzt, telefonKlangStarten, telefonKlangStoppen } from "./telefonKlang";
import { Channel, invoke } from "@tauri-apps/api/core";
import { liveFreisprechen, liveVorwaermen } from "../abfrage/gespraech";
import { anruferTon, liveAktiv, livePrefs, prefsHoerer } from "../abfrage/liveKi";
import { inTauri } from "../platform";
import { sim, type Einsatz } from "../sim/engine";
import { protokoll } from "../protokoll";
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

/**
 * Sprach-Tor vor Gemini: Geräusche (Tippen, Atmen, Rascheln, Rest der eigenen Stimme im Kopfhörer) gehen als Stille
 * hinaus, damit Gemini den Anrufer nicht unterbricht. Spricht der Anrufer gerade, muss die Stimme deutlich lauter sein
 * als das Grundrauschen und etwas länger dauern; der Anfang wird aus einem kurzen Puffer nachgereicht.
 */
export function sprachTor(senden: (b64: string) => void, jetzt: () => number = Date.now, anruferSpricht: () => boolean = () => jetzt() < anruferTon.bis + 300) {
  let boden = 0.004;
  let ueber = 0;
  let offenBis = 0;
  let durch = 0;
  let still = 0;
  const vorlauf: string[] = [];
  return {
    stueck(b64: string): void {
      const roh = atob(b64);
      const n = roh.length >> 1;
      if (!n) return;
      let q = 0;
      for (let i = 0; i < n; i++) {
        let v = roh.charCodeAt(2 * i) | (roh.charCodeAt(2 * i + 1) << 8);
        if (v >= 0x8000) v -= 0x10000;
        q += (v / 32768) ** 2;
      }
      const rms = Math.sqrt(q / n);
      const ms = (n / 16000) * 1000;
      // Grundrauschen: fällt schnell, steigt nur langsam (Sprache hebt es kaum)
      boden = rms < boden ? boden * 0.8 + rms * 0.2 : boden * 0.997 + rms * 0.003;
      const anrufer = anruferSpricht();
      const schwelle = anrufer ? Math.max(0.035, boden * 6) : Math.max(0.012, boden * 3);
      ueber = rms > schwelle ? Math.min(400, ueber + ms) : Math.max(0, ueber - ms);
      const t = jetzt();
      if (ueber >= (anrufer ? 250 : 150)) {
        if (t >= offenBis) for (const v of vorlauf.splice(0)) senden(v);
        offenBis = t + 700;
      }
      if (t < offenBis) {
        durch++;
        senden(b64);
        return;
      }
      still++;
      vorlauf.push(b64);
      if (vorlauf.length > 4) vorlauf.shift();
      // Stille (gleich lang) – Gemini merkt so das Ende der Rede
      senden(btoa("\0".repeat(n * 2)));
    },
    zahlen: () => ({ durch, still }),
  };
}

async function starten(e: Einsatz): Promise<void> {
  const roh = liveFreisprechen(e);
  if (!roh) return;
  const tor = sprachTor(roh);
  const senden = (b64: string) => tor.stueck(b64);
  torJetzt = tor;
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

let torJetzt: ReturnType<typeof sprachTor> | null = null;

async function beenden(): Promise<void> {
  if (!laeuftFuer) return;
  laeuftFuer = null;
  if (torJetzt) protokoll("freisprechen", { ende: true, ...torJetzt.zahlen() });
  torJetzt = null;
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
// Beta 82: Leitung, Umgebung und Ereignisse – siehe ui/telefonKlang.ts

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
  const klangSoll = cloud && p.klang !== false && !!e && sprachPrefs().vorlesen && klangStufe() !== "aus";
  const lauf = telefonKlangJetzt();
  if (klangSoll && lauf?.id !== e!.id) {
    try {
      telefonKlangStarten(e!);
    } catch (err) {
      console.warn("Hintergrund", err);
    }
  } else if (!klangSoll && lauf) telefonKlangStoppen();
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
