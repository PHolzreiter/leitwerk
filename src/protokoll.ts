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
