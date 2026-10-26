/** Zugriff auf Programmfunktionen (Tauri) mit Ersatz für den reinen Browser (Entwicklung). */
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

export const inTauri = (): boolean => "__TAURI_INTERNALS__" in window;

const LS_KEY = "leitwerk.leitstelle";

export async function loadStore(): Promise<string | null> {
  if (!inTauri()) {
    try {
      return localStorage.getItem(LS_KEY);
    } catch {
      return null;
    }
  }
  return invoke<string | null>("store_load");
}

export async function saveStore(json: string): Promise<void> {
  if (!inTauri()) {
    try {
      localStorage.setItem(LS_KEY, json);
    } catch {
      /* im Browser ohne Speicher einfach ignorieren */
    }
    return;
  }
  await invoke("store_save", { json });
}

export async function storeLocation(): Promise<string> {
  if (!inTauri()) return "Browser-Speicher";
  return invoke<string>("store_location");
}

/**
 * Speichert Text in eine Datei, deren Ort der Benutzer wählt.
 * Gibt den Pfad zurück oder null, wenn abgebrochen wurde.
 */
export async function saveTextFile(
  defaultName: string,
  content: string,
  filter: { name: string; extensions: string[] } = { name: "CSV-Datei", extensions: ["csv"] },
): Promise<string | null> {
  if (!inTauri()) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
    return defaultName;
  }
  const path = await save({
    defaultPath: defaultName,
    filters: [filter],
  });
  if (!path) return null;
  await invoke("write_text_file", { path, content });
  return path;
}

/** Einfaches ZIP ohne Kompression (nur im Browser; das Programm packt in Rust mit Kompression) */
export function zipOhneKompression(dateien: [string, string][]): Uint8Array {
  const crcTab = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTab[n] = c >>> 0;
  }
  const crc32 = (d: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of d) c = crcTab[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const enc = new TextEncoder();
  const teile: Uint8Array[] = [];
  const zentral: Uint8Array[] = [];
  let pos = 0;
  for (const [name, inhalt] of dateien) {
    const n = enc.encode(name);
    const d = enc.encode(inhalt);
    const crc = crc32(d);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true);
    kopf.setUint16(4, 20, true);
    kopf.setUint16(6, 0x0800, true); // UTF-8-Namen
    kopf.setUint32(14, crc, true);
    kopf.setUint32(18, d.length, true);
    kopf.setUint32(22, d.length, true);
    kopf.setUint16(26, n.length, true);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true);
    z.setUint16(4, 20, true);
    z.setUint16(6, 20, true);
    z.setUint16(8, 0x0800, true);
    z.setUint32(16, crc, true);
    z.setUint32(20, d.length, true);
    z.setUint32(24, d.length, true);
    z.setUint16(28, n.length, true);
    z.setUint32(42, pos, true);
    teile.push(new Uint8Array(kopf.buffer), n, d);
    zentral.push(new Uint8Array(z.buffer), n);
    pos += 30 + n.length + d.length;
  }
  const zLaenge = zentral.reduce((a, b) => a + b.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, dateien.length, true);
  ende.setUint16(10, dateien.length, true);
  ende.setUint32(12, zLaenge, true);
  ende.setUint32(16, pos, true);
  const alle = [...teile, ...zentral, new Uint8Array(ende.buffer)];
  const out = new Uint8Array(alle.reduce((a, b) => a + b.length, 0));
  let i = 0;
  for (const t of alle) {
    out.set(t, i);
    i += t.length;
  }
  return out;
}

/** Mehrere Textdateien als ZIP speichern (Ort wählt der Benutzer); null = abgebrochen */
export async function saveZipFile(defaultName: string, dateien: [string, string][]): Promise<string | null> {
  if (!inTauri()) {
    const blob = new Blob([zipOhneKompression(dateien) as BlobPart], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
    return defaultName;
  }
  const path = await save({ defaultPath: defaultName, filters: [{ name: "ZIP-Archiv", extensions: ["zip"] }] });
  if (!path) return null;
  await invoke("write_zip_file", { path, files: dateien });
  return path;
}

/** Lässt den Benutzer eine Textdatei auswählen und liefert Name und Inhalt. */
export function pickTextFile(accept = ".csv,.txt"): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      const buf = await file.arrayBuffer();
      resolve({ name: file.name, text: decodeText(buf) });
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });
    input.click();
  });
}

/** Erkennt UTF-8 bzw. Windows-1252 (ältere Excel-Exporte). */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

const AUTOSAVE_KEY = "leitwerk.autosave";

/** Automatische Sicherung des laufenden Spiels (eine Datei im Datenordner). */
export async function autosaveWrite(json: string): Promise<void> {
  if (!inTauri()) {
    try {
      localStorage.setItem(AUTOSAVE_KEY, json);
    } catch {
      /* zu groß oder kein Speicher */
    }
    return;
  }
  await invoke("autosave_write", { json });
}

export async function autosaveRead(): Promise<string | null> {
  if (!inTauri()) {
    try {
      return localStorage.getItem(AUTOSAVE_KEY);
    } catch {
      return null;
    }
  }
  return invoke<string | null>("autosave_read");
}
