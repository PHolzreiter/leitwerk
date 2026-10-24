/**
 * Spielstände im Ordner „Dokumente/LeitWerk/Spielstände“ (im Programm) –
 * im reinen Browser (Entwicklung, Tests) ersatzweise in der Browser-Datenbank.
 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri, pickTextFile } from "../platform";

export interface SpielstandInfo {
  name?: string;
  gespeichert?: number;
  simZeit?: number;
  funkgruppe?: string;
  einsaetze?: number;
  offen?: number;
  wetter?: string;
  spieler?: string[];
  version?: string;
}

export interface SpielstandDatei {
  datei: string;
  groesse: number;
  geaendert: number;
  info: SpielstandInfo | null;
}

// ------------------------------------------------------------------ Kopf lesen

/** Das Objekt nach "info": aus dem Anfang der Datei herauslösen (ohne die ganze Datei zu lesen) */
export function infoAusKopf(kopf: string): SpielstandInfo | null {
  const i = kopf.indexOf('"info":');
  if (i < 0 || i > 200) return null;
  let j = kopf.indexOf("{", i);
  if (j < 0) return null;
  const start = j;
  let tiefe = 0;
  let inText = false;
  for (; j < kopf.length; j++) {
    const c = kopf[j];
    if (inText) {
      if (c === "\\") j++;
      else if (c === '"') inText = false;
    } else if (c === '"') inText = true;
    else if (c === "{") tiefe++;
    else if (c === "}" && --tiefe === 0) {
      try {
        return JSON.parse(kopf.slice(start, j + 1)) as SpielstandInfo;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ Browser-Ersatz (IndexedDB)

const DB = "leitwerk-spielstaende";
function db(): Promise<IDBDatabase> {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("dateien");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function idb<T>(modus: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fehler) => {
    const r = f(d.transaction("dateien", modus).objectStore("dateien"));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
interface IdbEintrag {
  json: string;
  geaendert: number;
}
function sauber(name: string): string {
  let s = name.trim().replace(/\.leitwerk$/i, "").replace(/[/\\:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+|\.+$/g, "").trim();
  if (!s) s = "Spielstand";
  return `${s.slice(0, 80)}.leitwerk`;
}
async function freiIdb(name: string): Promise<string> {
  const vorhanden = new Set((await idb("readonly", (s) => s.getAllKeys())) as string[]);
  if (!vorhanden.has(name)) return name;
  const stamm = name.replace(/\.leitwerk$/, "");
  for (let i = 2; ; i++) if (!vorhanden.has(`${stamm} (${i}).leitwerk`)) return `${stamm} (${i}).leitwerk`;
}

// ------------------------------------------------------------------ Öffentlich

export async function ordnerPfad(): Promise<string> {
  if (!inTauri()) return "Browser-Speicher (im Programm: Dokumente/LeitWerk/Spielstände)";
  return invoke<string>("spielstaende_ordner");
}

export async function liste(): Promise<SpielstandDatei[]> {
  let roh: { datei: string; groesse: number; geaendert: number; kopf: string }[];
  if (inTauri()) roh = await invoke("spielstaende_liste");
  else {
    const keys = (await idb("readonly", (s) => s.getAllKeys())) as string[];
    roh = [];
    for (const k of keys) {
      const e = (await idb("readonly", (s) => s.get(k))) as IdbEintrag;
      roh.push({ datei: k, groesse: e.json.length, geaendert: e.geaendert, kopf: e.json.slice(0, 16_000) });
    }
  }
  return roh
    .map((r) => ({ datei: r.datei, groesse: r.groesse, geaendert: r.geaendert, info: infoAusKopf(r.kopf) }))
    .sort((a, b) => (b.info?.gespeichert ?? b.geaendert) - (a.info?.gespeichert ?? a.geaendert));
}

export async function lesen(datei: string): Promise<string> {
  if (inTauri()) return invoke<string>("spielstand_lesen", { datei });
  const e = (await idb("readonly", (s) => s.get(datei))) as IdbEintrag | undefined;
  if (!e) throw new Error("Spielstand nicht gefunden");
  return e.json;
}

/** Schreibt und gibt den tatsächlichen Dateinamen zurück */
export async function schreiben(name: string, json: string, ersetzen = false): Promise<string> {
  if (inTauri()) return invoke<string>("spielstand_schreiben", { name, json, ersetzen });
  const n = ersetzen ? sauber(name) : await freiIdb(sauber(name));
  await idb("readwrite", (s) => s.put({ json, geaendert: Date.now() } satisfies IdbEintrag, n));
  return n;
}

export async function umbenennen(datei: string, name: string): Promise<string> {
  if (inTauri()) return invoke<string>("spielstand_umbenennen", { datei, name });
  const n = sauber(name);
  if (n === datei) return n;
  const ziel = await freiIdb(n);
  const e = (await idb("readonly", (s) => s.get(datei))) as IdbEintrag;
  await idb("readwrite", (s) => s.put(e, ziel));
  await idb("readwrite", (s) => s.delete(datei));
  return ziel;
}

export async function loeschen(datei: string): Promise<void> {
  if (inTauri()) return invoke("spielstand_loeschen", { datei });
  await idb("readwrite", (s) => s.delete(datei));
}

/** Dateiauswahl öffnen und die gewählten Spielstände in den Ordner kopieren. Gibt die neuen Dateinamen zurück. */
export async function importieren(): Promise<{ ok: string[]; fehler: string[] }> {
  const ok: string[] = [];
  const fehler: string[] = [];
  if (inTauri()) {
    const wahl = await open({ multiple: true, directory: false, filters: [{ name: "LeitWerk-Spielstand", extensions: ["leitwerk", "json"] }] });
    const pfade = wahl == null ? [] : Array.isArray(wahl) ? wahl : [wahl];
    for (const p of pfade) {
      try {
        ok.push(await invoke<string>("spielstand_importieren", { pfad: p }));
      } catch (e) {
        fehler.push(String((e as Error)?.message ?? e));
      }
    }
    return { ok, fehler };
  }
  const f = await pickTextFile(".leitwerk,.json");
  if (!f) return { ok, fehler };
  if (!f.text.slice(0, 500).includes("leitwerk-spielstand")) fehler.push(`${f.name} ist kein LeitWerk-Spielstand`);
  else ok.push(await schreiben(f.name.replace(/\.(json|leitwerk)$/i, ""), f.text));
  return { ok, fehler };
}

export async function ordnerZeigen(): Promise<void> {
  if (inTauri()) await invoke("spielstaende_zeigen");
}
