/**
 * Welche Abfrage-Ansicht dieser Platz zeigt: die neue (Notruf geführt, KT/SEK aufgeräumt)
 * oder die bisherige. Gilt nur für diesen Rechner (Browser-Speicher).
 */
export type AbfrageAnsicht = "neu" | "klassisch";

const LS = "lw.abfrageAnsicht";
const hoerer = new Set<() => void>();
let wert: AbfrageAnsicht | null = null;

export function abfrageAnsicht(): AbfrageAnsicht {
  if (wert) return wert;
  let v: string | null = null;
  try {
    v = localStorage.getItem(LS);
  } catch {
    v = null;
  }
  wert = v === "klassisch" ? "klassisch" : "neu";
  return wert;
}

export function setzeAbfrageAnsicht(v: AbfrageAnsicht): void {
  wert = v;
  try {
    localStorage.setItem(LS, v);
  } catch {
    /* ohne Speicher gilt es bis zum Neuladen */
  }
  hoerer.forEach((f) => f());
}

export function onAbfrageAnsicht(f: () => void): () => void {
  hoerer.add(f);
  return () => hoerer.delete(f);
}
