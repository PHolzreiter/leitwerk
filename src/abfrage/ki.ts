/** Anbindung an Ollama (lokale KI) – Einstellungen gelten nur für diesen Rechner. */
import { Channel, invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform";

export interface KiStatus {
  installiert: boolean;
  laeuft: boolean;
  version: string | null;
  modelle: string[];
}

export interface KiFortschritt {
  text: string;
  done: number;
  total: number;
}

export const MODELLE: { name: string; label: string }[] = [
  { name: "qwen3:8b", label: "Qwen3 8B – Standard (ca. 5 GB, ab 16 GB RAM)" },
  { name: "gemma3:12b", label: "Gemma 3 12B – bessere Sprache, langsamer (ca. 8 GB, ab 32 GB RAM)" },
  { name: "gemma3:4b", label: "Gemma 3 4B – schnell, einfacher (ca. 3 GB)" },
  { name: "llama3.1:8b", label: "Llama 3.1 8B (ca. 5 GB)" },
];

const LS = "leitwerk.ki";
export interface KiPrefs {
  aktiv: boolean;
  modell: string;
  /** Ollama mit LeitWerk beenden */
  beenden: boolean;
  /** Klingelton bei Anrufen */
  klingelton: boolean;
}

export function kiPrefs(): KiPrefs {
  const d: KiPrefs = { aktiv: true, modell: "qwen3:8b", beenden: false, klingelton: true };
  try {
    return { ...d, ...(JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<KiPrefs>) };
  } catch {
    return d;
  }
}

export function setKiPrefs(p: Partial<KiPrefs>): void {
  try {
    localStorage.setItem(LS, JSON.stringify({ ...kiPrefs(), ...p }));
  } catch {
    /* egal */
  }
  if (inTauri() && p.beenden !== undefined) void invoke("ki_beim_beenden", { stoppen: p.beenden });
}

let letzterStatus: KiStatus | null = null;

export async function kiStatus(): Promise<KiStatus> {
  if (!inTauri()) return (letzterStatus = { installiert: false, laeuft: false, version: null, modelle: [] });
  const s = await invoke<KiStatus>("ki_status");
  letzterStatus = s;
  return s;
}

/** Ist die KI für Gespräche bereit (läuft, Modell da, eingeschaltet)? */
export function kiBereit(): boolean {
  const p = kiPrefs();
  return !!letzterStatus?.laeuft && p.aktiv && letzterStatus.modelle.some((m) => m === p.modell || m.startsWith(`${p.modell}`));
}

export async function kiStarten(): Promise<void> {
  await invoke("ki_starten");
  await kiStatus();
}

export async function kiBeenden(): Promise<void> {
  await invoke("ki_beenden");
  await kiStatus();
}

export async function kiInstallieren(onP: (p: KiFortschritt) => void): Promise<string> {
  const ch = new Channel<KiFortschritt>();
  ch.onmessage = onP;
  return invoke<string>("ki_installieren", { onProgress: ch });
}

export async function kiModellLaden(name: string, onP: (p: KiFortschritt) => void): Promise<void> {
  const ch = new Channel<KiFortschritt>();
  ch.onmessage = onP;
  await invoke("ki_modell_laden", { name, onProgress: ch });
  await kiStatus();
}

export interface KiNachricht {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Eine Antwort der KI; onToken bekommt den Text Stück für Stück */
export async function kiChat(messages: KiNachricht[], onToken?: (t: string) => void): Promise<string> {
  const ch = new Channel<string>();
  ch.onmessage = (t) => onToken?.(t);
  const text = await invoke<string>("ki_chat", { model: kiPrefs().modell, messages, onToken: ch });
  return satzEnde(bereinigen(text));
}

/** Denk-Abschnitte, Regieanweisungen und Anführungszeichen entfernen */
export function bereinigen(t: string): string {
  return t
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^\s*(Anrufer(in)?|Ich|Caller)\s*:\s*/i, "")
    .replace(/\*[^*]{1,80}\*/g, "")
    .replace(/\[Hinweis[^\]]*\]?/g, "")
    .replace(/^\s*Leitstelle:.*$/gm, "")
    .replace(/^["„“]+|["„“]+$/g, "")
    .trim();
}

/** Lange Antwort, die an der Längengrenze abgeschnitten wurde: beim letzten Satzende aufhören */
function satzEnde(t: string): string {
  if (t.length < 250 || /[.!?…]$/.test(t)) return t;
  const m = t.match(/^([\s\S]*[.!?…])\s/);
  return m ? m[1] : t;
}

/** Beim Programmstart: Einstellung übernehmen und Ollama bei Bedarf still starten */
export async function kiBeimStart(): Promise<void> {
  if (!inTauri()) return;
  const p = kiPrefs();
  await invoke("ki_beim_beenden", { stoppen: p.beenden });
  if (!p.aktiv) return;
  const s = await kiStatus();
  if (s.installiert && !s.laeuft) {
    try {
      await kiStarten();
    } catch (e) {
      console.warn("Ollama-Start", e);
    }
  }
}
