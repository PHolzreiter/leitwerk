/** Kartenpakete und Programm-Updates (nur im Programm, nicht im reinen Browser). */
import { Channel, invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

export interface PackFile {
  name: string;
  size: number;
  sha256: string;
}

export interface Pack {
  id: string;
  name: string;
  beschreibung: string;
  version: string;
  pflicht: boolean;
  files: PackFile[];
}

export interface InstalledPack {
  version: string;
  files: string[];
}

export interface PacksLocal {
  installed: Record<string, InstalledPack>;
  dir: string;
}

export interface Progress {
  done: number;
  total: number;
}

export const GRUNDPAKET = "grund";

export function packSize(p: Pack): number {
  return p.files.reduce((s, f) => s + f.size, 0);
}

export function formatBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1).replace(".", ",")} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.max(1, Math.round(b / 1e3))} kB`;
}

export async function packsLocal(): Promise<PacksLocal> {
  if (!inTauri()) return { installed: { [GRUNDPAKET]: { version: "browser", files: [] } }, dir: "Browser" };
  return invoke<PacksLocal>("packs_local");
}

export async function packsManifest(): Promise<Pack[]> {
  if (!inTauri()) throw new Error("Kartenpakete gibt es nur im Programm");
  return (await invoke<{ packs: Pack[] }>("packs_manifest")).packs;
}

export async function installPack(id: string, onProgress: (p: Progress) => void): Promise<void> {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  await invoke("pack_install", { id, onProgress: ch });
}

export async function removePack(id: string): Promise<void> {
  await invoke("pack_remove", { id });
}

export interface UpdateInfo {
  version: string;
  current: string;
  notes: string | null;
}

export async function appVersion(): Promise<string> {
  if (!inTauri()) return "Browser";
  return invoke<string>("app_version");
}

export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (!inTauri()) return null;
  return invoke<UpdateInfo | null>("update_check");
}

/** Installiert das zuvor gefundene Update; das Programm startet danach neu. */
export async function installUpdate(onProgress: (p: Progress) => void): Promise<void> {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  await invoke("update_install", { onProgress: ch });
}

/** Benachrichtigt die Karte, wenn sich installierte Pakete geändert haben. */
const listeners = new Set<() => void>();
export function onPacksChanged(fn: () => void): void {
  listeners.add(fn);
}
export function packsChanged(): void {
  for (const fn of listeners) fn();
}
