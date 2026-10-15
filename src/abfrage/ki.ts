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

export interface ModellInfo {
  name: string;
  stufe: "leicht" | "standard" | "mittel" | "stark";
  label: string;
  /** Download-Größe in GB */
  gb: number;
  /** empfohlener Arbeitsspeicher in GB */
  ram: number;
  info: string;
}

/** Auswahl nach Rechner-Stärke; jeder Spieler wählt für sich */
export const MODELLE: ModellInfo[] = [
  { name: "qwen3:4b", stufe: "leicht", label: "Qwen3 4B", gb: 2.6, ram: 8, info: "für ältere oder schwächere Rechner – schnell, aber einfachere Gespräche" },
  { name: "gemma3:4b", stufe: "leicht", label: "Gemma 3 4B", gb: 3.3, ram: 8, info: "klein und schnell, gutes Deutsch für die Größe" },
  { name: "qwen3:8b", stufe: "standard", label: "Qwen3 8B", gb: 5.2, ram: 12, info: "bisheriger Standard" },
  { name: "qwen3:14b", stufe: "mittel", label: "Qwen3 14B", gb: 9.3, ram: 16, info: "deutlich natürlichere Gespräche, wiederholt sich seltener" },
  { name: "gemma3:12b", stufe: "mittel", label: "Gemma 3 12B", gb: 8.1, ram: 16, info: "sehr gutes Deutsch, etwas langsamer" },
  { name: "qwen3:32b", stufe: "stark", label: "Qwen3 32B", gb: 20, ram: 32, info: "für starke Rechner (z. B. Mac mit viel Speicher) – am menschlichsten" },
  { name: "gemma3:27b", stufe: "stark", label: "Gemma 3 27B", gb: 17, ram: 32, info: "für starke Rechner – sehr gutes Deutsch" },
];

export const STUFE_LABEL: Record<ModellInfo["stufe"], string> = { leicht: "Leicht", standard: "Standard", mittel: "Mittel", stark: "Stark" };

/** Arbeitsspeicher des Rechners in GB (0 = unbekannt) */
export async function rechnerRam(): Promise<number> {
  if (!inTauri()) return 0;
  return invoke<number>("rechner_ram").catch(() => 0);
}

/** Empfohlene Stufe für diesen Rechner */
export function empfohleneStufe(ram: number): ModellInfo["stufe"] | null {
  if (!ram) return null;
  if (ram >= 32) return "stark";
  if (ram >= 16) return "mittel";
  if (ram >= 12) return "standard";
  return "leicht";
}

export async function kiModellLoeschen(name: string): Promise<void> {
  await invoke("ki_modell_loeschen", { name });
  await kiStatus();
}

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
export function satzEnde(t: string): string {
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
