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
export async function saveTextFile(defaultName: string, content: string): Promise<string | null> {
  if (!inTauri()) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
    return defaultName;
  }
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: "CSV-Datei", extensions: ["csv"] }],
  });
  if (!path) return null;
  await invoke("write_text_file", { path, content });
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
function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}
