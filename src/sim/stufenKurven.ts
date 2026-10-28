/**
 * Notrufaufkommen je Versorgungsstufe und Stunde (Telemedizin … ALS rot, Großunfall).
 * Standard: Jahreszahlen 2025 für ganz NÖ, über den Tag nach einer typischen Tageskurve verteilt
 * (schwere Stufen gleichmäßiger über den Tag, leichte stärker tagsüber).
 * Im Spiel gilt der Anteil der gespielten Funkgruppe (aus den Notarzteinsätzen je Stützpunkt 2025).
 */

export interface StufeInfo {
  name: string;
  /** Einsätze 2025, ganz NÖ */
  n: number;
  farbe: string;
  /** wie stark die Tageskurve durchschlägt (1 = wie die Grundkurve, < 1 flacher) */
  k: number;
}

export const STUFEN_INFO: StufeInfo[] = [
  { name: "Telemedizin", n: 28562, farbe: "#2563eb", k: 1.3 },
  { name: "Akuttransport grün", n: 24807, farbe: "#3a9c8f", k: 1.4 },
  { name: "BLS grün", n: 3428, farbe: "#7cbf5e", k: 1.1 },
  { name: "ALS grün", n: 48815, farbe: "#2f8a52", k: 1.0 },
  { name: "BLS gelb", n: 54651, farbe: "#d9a400", k: 1.0 },
  { name: "ALS gelb", n: 36291, farbe: "#9a7206", k: 0.95 },
  { name: "BLS/ALS aufwertbar", n: 25634, farbe: "#7d64cc", k: 1.0 },
  { name: "BLS rot", n: 41395, farbe: "#e06469", k: 0.9 },
  { name: "ALS orange", n: 19935, farbe: "#e2761b", k: 0.85 },
  { name: "ALS rot", n: 1999, farbe: "#a61b1b", k: 0.6 },
  { name: "Großunfall", n: 5, farbe: "#475569", k: 0.5 },
];

/** Grundkurve: Anteil je Stunde (0–23 Uhr) */
const TAG = [0.028, 0.022, 0.019, 0.017, 0.017, 0.02, 0.028, 0.038, 0.05, 0.058, 0.061, 0.061, 0.057, 0.054, 0.052, 0.05, 0.05, 0.05, 0.049, 0.046, 0.043, 0.04, 0.036, 0.032];

/** Anteil der Funkgruppen am Aufkommen in NÖ (Notarzteinsätze je Stützpunkt 2025, den Funkgruppen zugeordnet) */
export const FUNKGRUPPE_ANTEIL: Record<string, number> = {
  "NÖ-01": 0.249,
  "NÖ-02": 0.102,
  "NÖ-03": 0.152,
  "NÖ-04": 0.165,
  "NÖ-05": 0.193,
  "NÖ-06": 0.139,
};

/** Standardkurve einer Stufe: Einsätze je Stunde, ganz NÖ */
export function standardKurve(name: string): number[] {
  const s = STUFEN_INFO.find((x) => x.name === name);
  if (!s) return new Array(24).fill(0);
  const w = TAG.map((x) => Math.pow(x, s.k));
  const summe = w.reduce((a, b) => a + b, 0);
  const proTag = s.n / 365;
  return w.map((x) => Math.round(((proTag * x) / summe) * 100000) / 100000);
}

/** Kurven aller Stufen (eigene aus den Einstellungen, sonst Standard) – ganz NÖ, Einsätze je Stunde */
export function stufenKurven(eigene?: Record<string, number[]> | null): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const s of STUFEN_INFO) {
    const e = eigene?.[s.name];
    out[s.name] = e && e.length === 24 ? e.map((v) => Math.max(0, Number(v) || 0)) : standardKurve(s.name);
  }
  return out;
}

/** Anteile der Stufen in % (aus den Tagessummen) */
export function stufenAnteile(kurven: Record<string, number[]>): Record<string, number> {
  const summen = Object.fromEntries(Object.entries(kurven).map(([k, a]) => [k, a.reduce((x, y) => x + y, 0)]));
  const ges = Object.values(summen).reduce((x, y) => x + y, 0) || 1;
  return Object.fromEntries(Object.entries(summen).map(([k, s]) => [k, (s / ges) * 100]));
}
