/**
 * Laufendes Protokoll (Logfile) dieser Sitzung: jede Zeile ein JSON-Objekt mit Zeit und Art.
 * Im Programm geht es alle 2 Sekunden in eine Datei im Datenordner (protokoll/sitzung-….jsonl), im Browser bleibt
 * es im Speicher. „Fehler melden“ hängt das Protokoll an. Keine Schlüssel oder Passwörter hineinschreiben.
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

const MAX_RING = 5000;
const ring: string[] = [];
let puffer: string[] = [];
let pfad = "";
const stempel = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
})();

/** Ein Ereignis ins Protokoll (art z. B. „funk“, „sendung“, „erkannt“, „spieler“, „einsatz“, „log“) */
export function protokoll(art: string, daten: Record<string, unknown> = {}): void {
  let z: string;
  try {
    z = JSON.stringify({ t: new Date().toISOString(), art, ...daten }, (_k, v) => (typeof v === "string" && v.length > 1500 ? `${v.slice(0, 1500)}…` : v));
  } catch {
    z = JSON.stringify({ t: new Date().toISOString(), art, fehler: "nicht lesbar" });
  }
  ring.push(z);
  if (ring.length > MAX_RING) ring.splice(0, ring.length - MAX_RING);
  if (inTauri()) puffer.push(z);
}

/** die letzten Zeilen dieser Sitzung (aus dem Speicher) */
export function protokollZeilen(max = MAX_RING): string[] {
  return ring.slice(-max);
}

/** Pfad der Protokolldatei (leer im Browser bzw. vor dem ersten Schreiben) */
export function protokollPfad(): string {
  return pfad;
}

async function schreiben(): Promise<void> {
  if (!puffer.length) return;
  const zeilen = puffer.join("\n");
  puffer = [];
  try {
    pfad = (await invoke<string>("protokoll_schreiben", { stempel, zeilen })) || pfad;
  } catch {
    /* Protokoll ist nur eine Hilfe – ohne Datei läuft alles weiter */
  }
}

if (typeof window !== "undefined") {
  setInterval(() => void schreiben(), 2000);
  window.addEventListener("beforeunload", () => void schreiben());
}

/** Protokoll für den Fehlerbericht: aus der Datei (ganze Sitzung, gekürzt) bzw. aus dem Speicher */
export async function protokollFuerBericht(maxBytes = 3_000_000): Promise<string> {
  await schreiben();
  if (inTauri()) {
    try {
      const t = await invoke<string>("protokoll_lesen", { maxBytes });
      if (t) return t;
    } catch {
      /* dann aus dem Speicher */
    }
  }
  let n = 0;
  const out: string[] = [];
  for (let i = ring.length - 1; i >= 0 && n < maxBytes; i--) {
    out.push(ring[i]);
    n += ring[i].length + 1;
  }
  return out.reverse().join("\n");
}

// ------------------------------------------------------------------ Funk-Aufnahmen zum Nachhören

/** im Browser (Tests): die letzten Aufnahmen nur im Speicher */
const aufnahmenWeb: { name: string; text: string; ulaw: Uint8Array }[] = [];

/** Eigenen Funkspruch (μ-law-Stücke, Base64) mit erkanntem Text sichern – es bleiben die letzten 30 */
export function aufnahmeSichern(wer: string, stuecke: string[], text: string, sicherheit?: number): void {
  try {
    const teile = stuecke.map((b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    const ulaw = new Uint8Array(teile.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of teile) {
      ulaw.set(x, o);
      o += x.length;
    }
    const d = new Date();
    const zwei = (n: number) => String(n).padStart(2, "0");
    const name = `${d.getFullYear()}${zwei(d.getMonth() + 1)}${zwei(d.getDate())}-${zwei(d.getHours())}${zwei(d.getMinutes())}${zwei(d.getSeconds())}_${wer}`;
    const zeile = `${text}${sicherheit !== undefined ? `\n(Sicherheit ${Math.round(sicherheit * 100)} %)` : ""}`;
    protokoll("aufnahme", { name, sekunden: Math.round(ulaw.length / 800) / 10, text });
    if (!inTauri()) {
      aufnahmenWeb.push({ name, text: zeile, ulaw });
      if (aufnahmenWeb.length > 30) aufnahmenWeb.shift();
      return;
    }
    void invoke("protokoll_aufnahme", { name, ulaw: Array.from(ulaw), text: zeile }).catch(() => undefined);
  } catch {
    /* Nachhören ist nur eine Hilfe */
  }
}

/** Letzte Aufnahmen für den Fehlerbericht (Base64-WAV) */
export async function aufnahmenFuerBericht(max = 10): Promise<{ name: string; text: string; wavB64: string }[]> {
  const b64 = (u: Uint8Array) => {
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  if (!inTauri()) return aufnahmenWeb.slice(-max).map((a) => ({ name: a.name, text: a.text, wavB64: b64(a.ulaw) }));
  const l = await invoke<{ name: string; text: string; wav: number[] }[]>("protokoll_aufnahmen", { max });
  return l.map((a) => ({ name: a.name, text: a.text, wavB64: b64(Uint8Array.from(a.wav)) }));
}
