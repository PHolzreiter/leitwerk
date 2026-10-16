/**
 * Einsatzcodes: kommen aus der eigenen, importierten Liste (Reiter Daten → Einsatzcodes).
 * LeitWerk liefert selbst keine Codeliste mit.
 */
import { store } from "../data/store";
import { normKey } from "../data/schema";

export interface Einsatzcode {
  code: string;
  /** Nummer des Kapitels (aus „10 - Brustschmerz“), 0 wenn keine Nummer */
  gruppe: number;
  gruppenname: string;
  beschreibung: string;
  /** Einsatzstufe (Kategorie), z. B. „ALS rot“ */
  stufe: string;
}

let cache: Einsatzcode[] | null = null;
let byCode: Map<string, Einsatzcode> | null = null;
store.onChange(() => {
  cache = null;
  byCode = null;
});

function kapitelTeile(k: string): [number, string] {
  const m = k.match(/^\s*(\d+)\s*[-–:.]?\s*(.*)$/);
  if (m) return [Number(m[1]), m[2].trim() || k.trim()];
  const n = k.match(/^\s*\S+\s*[-–]\s*(.+)$/);
  return [0, (n ? n[1] : k).trim()];
}

export function allCodes(): Einsatzcode[] {
  if (cache) return cache;
  cache = store.list("codes").map((c) => {
    const [gruppe, gruppenname] = kapitelTeile(c.kapitel);
    return { code: c.code, gruppe, gruppenname, beschreibung: c.name, stufe: c.kategorie };
  });
  byCode = new Map(cache.map((c) => [c.code, c]));
  return cache;
}

export function hasCodes(): boolean {
  return allCodes().length > 0;
}

/** Alle Kategorien (Stufen), die in der Codeliste vorkommen. */
export function codeKategorien(): string[] {
  return [...new Set(allCodes().map((c) => c.stufe).filter(Boolean))];
}

export function findCode(code: string | undefined): Einsatzcode | undefined {
  if (!code) return undefined;
  allCodes();
  return byCode!.get(code);
}

/** Suche in Code und Beschreibung; mehrere Wörter müssen alle vorkommen. */
export function searchCodes(query: string, limit = 30): Einsatzcode[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => normKey(w))
    .filter(Boolean);
  if (words.length === 0) return [];
  const out: Einsatzcode[] = [];
  for (const c of allCodes()) {
    const hay = normKey(`${c.code} ${c.gruppenname} ${c.beschreibung}`);
    if (words.every((w) => hay.includes(w))) {
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}

