/**
 * Ablage in „Dokumente/LeitWerk“: alles, was man selbst dazugibt (Abfrageschema, Codelisten,
 * Daten, Fälle, Töne, Designs, Anordnungen), wird beim Import zusätzlich als Datei in einem
 * eigenen Ordner abgelegt – zum Sichern, Weitergeben und Wiederherstellen.
 * Im reinen Browser (Entwicklung, Tests) ersatzweise in der Browser-Datenbank.
 */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform";

export type AblageOrdner = "Abfrageschema" | "Codelisten" | "Daten" | "Fälle" | "Töne" | "Designs" | "Anordnungen";

export const ABLAGE_INFO: Record<AblageOrdner, string> = {
  Abfrageschema: "importierte Abfrageschemas (JSON)",
  Codelisten: "importierte Codelisten (CSV)",
  Daten: "importierte Fahrzeuge, Dienststellen, Krankenhäuser, Orte … (CSV)",
  Fälle: "importierte Fallpakete",
  Töne: "eigene Klingel- und Signaltöne",
  Designs: "Farb-Designs",
  Anordnungen: "Fenster-Anordnungen",
};

export interface AblageDatei {
  datei: string;
  groesse: number;
  geaendert: number;
}

// ---------------- Browser-Ersatz
const DB = "leitwerk-ablage";
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

/** Nur ein unproblematischer Dateiname */
export function ablageName(name: string, endung?: string): string {
  let n = (name.split(/[/\\]/).pop() ?? "").replace(/[:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim();
  if (!n) n = "Datei";
  if (endung && !n.toLowerCase().endsWith(`.${endung}`)) n = `${n.replace(/\.[a-z0-9]{1,5}$/i, "")}.${endung}`;
  return n.slice(0, 120);
}

/** Pfad von „Dokumente/LeitWerk“ (legt die Ordner an) */
export async function ablageBasis(): Promise<string> {
  if (!inTauri()) return "Browser-Speicher (im Programm: Dokumente/LeitWerk)";
  return invoke<string>("ablage_basis");
}

export async function ablageSpeichern(ordner: AblageOrdner, name: string, inhalt: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = typeof inhalt === "string" ? new TextEncoder().encode(inhalt) : inhalt instanceof Uint8Array ? inhalt : new Uint8Array(inhalt);
  const n = ablageName(name);
  if (inTauri()) return invoke<string>("ablage_schreiben", { ordner, name: n, daten: Array.from(bytes) });
  await idb("readwrite", (s) => s.put({ bytes, geaendert: Date.now() }, `${ordner}/${n}`));
  return n;
}

/** Wie ablageSpeichern, aber Fehler nur in der Konsole – der Import selbst soll daran nie scheitern */
export function ablageSichern(ordner: AblageOrdner, name: string, inhalt: string | Uint8Array | ArrayBuffer): void {
  void ablageSpeichern(ordner, name, inhalt).catch((e) => console.warn(`Ablage ${ordner}`, e));
}

export async function ablageListe(ordner: AblageOrdner): Promise<AblageDatei[]> {
  let l: AblageDatei[];
  if (inTauri()) l = await invoke<AblageDatei[]>("ablage_liste", { ordner });
  else {
    const keys = ((await idb("readonly", (s) => s.getAllKeys())) as string[]).filter((k) => k.startsWith(`${ordner}/`));
    l = [];
    for (const k of keys) {
      const e = (await idb("readonly", (s) => s.get(k))) as { bytes: Uint8Array; geaendert: number };
      l.push({ datei: k.slice(ordner.length + 1), groesse: e.bytes.length, geaendert: e.geaendert });
    }
  }
  return l.sort((a, b) => b.geaendert - a.geaendert);
}

export async function ablageLesen(ordner: AblageOrdner, name: string): Promise<string> {
  if (inTauri()) return invoke<string>("ablage_lesen", { ordner, name });
  const e = (await idb("readonly", (s) => s.get(`${ordner}/${name}`))) as { bytes: Uint8Array } | undefined;
  if (!e) throw new Error("Datei nicht gefunden");
  return new TextDecoder().decode(e.bytes);
}

export async function ablageZeigen(ordner?: AblageOrdner): Promise<void> {
  if (inTauri()) await invoke("ablage_zeigen", { ordner: ordner ?? null });
}
