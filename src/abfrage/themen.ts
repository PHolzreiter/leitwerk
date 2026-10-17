/**
 * Themen = neutrale Hauptbeschwerden („Sturz“, „Atemnot“ …), unabhängig vom geladenen Codesystem.
 * Fallgeschichten, Anrufer, Lage und Partnerorganisationen fragen nach dem Thema, nicht nach einer Kapitelnummer.
 *
 * Ein Codesystem ordnet seine Kapitel den Themen zu (Feld „thema“ im Kapitel). Hat es keine Zuordnung,
 * gilt die Nummerierung im AMPDS-Stil (Kapitel 17 = Sturz usw.) – so laufen ältere Abfrageschemas weiter.
 */
import type { Antworten, Schema } from "./schema";

export interface Thema {
  id: string;
  label: string;
  /** Kapitelnummer in Schemas im AMPDS-Stil (ohne eigene Zuordnung) */
  nr: string;
}

export const THEMEN: Thema[] = [
  { id: "bauch", label: "Bauchschmerzen", nr: "1" },
  { id: "allergie", label: "Allergische Reaktion", nr: "2" },
  { id: "tierbiss", label: "Tierbiss / Tierangriff", nr: "3" },
  { id: "gewalt", label: "Gewalt / Überfall", nr: "4" },
  { id: "ruecken", label: "Rückenschmerzen", nr: "5" },
  { id: "atemnot", label: "Atemnot", nr: "6" },
  { id: "brand", label: "Verbrennung / Brand / Explosion", nr: "7" },
  { id: "gefahrstoff", label: "Gas / Rauch / Gefahrstoff", nr: "8" },
  { id: "stillstand", label: "Kreislaufstillstand / leblose Person", nr: "9" },
  { id: "brustschmerz", label: "Brustschmerz", nr: "10" },
  { id: "ersticken", label: "Verschlucken / Ersticken", nr: "11" },
  { id: "krampf", label: "Krampfanfall", nr: "12" },
  { id: "zucker", label: "Blutzucker", nr: "13" },
  { id: "wasser", label: "Ertrinken / Wasserunfall", nr: "14" },
  { id: "strom", label: "Stromunfall", nr: "15" },
  { id: "auge", label: "Augenverletzung / -problem", nr: "16" },
  { id: "sturz", label: "Sturz", nr: "17" },
  { id: "kopfschmerz", label: "Kopfschmerzen", nr: "18" },
  { id: "herz", label: "Herzrhythmus / Herzprobleme", nr: "19" },
  { id: "hitze_kaelte", label: "Hitze / Kälte", nr: "20" },
  { id: "blutung", label: "Blutung", nr: "21" },
  { id: "eingeklemmt", label: "Eingeklemmt / eingeschlossen", nr: "22" },
  { id: "vergiftung", label: "Vergiftung / Überdosis", nr: "23" },
  { id: "schwangerschaft", label: "Schwangerschaft / Geburt", nr: "24" },
  { id: "psych", label: "Psychische Krise", nr: "25" },
  { id: "krank", label: "Kranke Person", nr: "26" },
  { id: "stich_schuss", label: "Stich- / Schussverletzung", nr: "27" },
  { id: "schlaganfall", label: "Schlaganfall", nr: "28" },
  { id: "verkehrsunfall", label: "Verkehrsunfall", nr: "29" },
  { id: "verletzung", label: "Verletzung", nr: "30" },
  { id: "bewusstlos", label: "Bewusstlos / Kollaps", nr: "31" },
  { id: "unklar", label: "Unklare Lage", nr: "32" },
  { id: "anforderung_arzt", label: "Anforderung Arzt / Pflege", nr: "33" },
  { id: "ecall", label: "Automatische Unfallmeldung", nr: "34" },
  { id: "infekt", label: "Infekt / Fieber", nr: "36" },
  { id: "anforderung_polizei", label: "Anforderung Polizei", nr: "38" },
  { id: "anforderung_ls", label: "Anforderung andere Leitstelle", nr: "42" },
  { id: "alpin", label: "Alpinunfall", nr: "ALP" },
];

const NACH_NR = new Map(THEMEN.map((t) => [t.nr, t.id]));
const NACH_ID = new Map(THEMEN.map((t) => [t.id, t]));

let aktiv: Schema | null = null;
let annotiert = false;
const cache = new Map<string, string>();

/** Aktuelles Codesystem (setzt der Datenspeicher) */
export function themenSchema(s: Schema | null): void {
  if (s === aktiv) return;
  aktiv = s;
  cache.clear();
  annotiert = !!s && Object.values(s.kapitel).some((k) => !!k.thema);
}

/** Thema eines Kapitels im aktuellen (oder angegebenen) Codesystem; "" = unbekannt */
export function thema(kap: string | null | undefined, schema?: Schema | null): string {
  if (!kap) return "";
  const s = schema ?? aktiv;
  if (schema && schema !== aktiv) {
    const K = schema.kapitel[kap];
    if (K?.thema) return K.thema;
    return Object.values(schema.kapitel).some((k) => k.thema) ? "" : (NACH_NR.get(kap) ?? "");
  }
  const c = cache.get(kap);
  if (c !== undefined) return c;
  const K = s?.kapitel[kap];
  const t = K?.thema ? K.thema : annotiert ? "" : (NACH_NR.get(kap) ?? "");
  cache.set(kap, t);
  return t;
}

/** Ist das Kapitel eines dieser Themen? */
export function ist(kap: string | null | undefined, ...themen: string[]): boolean {
  const t = thema(kap);
  return !!t && themen.includes(t);
}

/** Kapitel des aktuellen (oder angegebenen) Codesystems zu einem Thema */
export function kapitelZuThema(t: string, schema?: Schema | null): string | null {
  const s = schema ?? aktiv;
  if (!s) return NACH_ID.get(t)?.nr ?? null;
  for (const [k, K] of Object.entries(s.kapitel)) if (K.thema === t) return k;
  const hatThemen = Object.values(s.kapitel).some((k) => k.thema);
  if (hatThemen) return null;
  const nr = NACH_ID.get(t)?.nr;
  return nr && s.kapitel[nr] ? nr : null;
}

export function themaLabel(t: string): string {
  return NACH_ID.get(t)?.label ?? t;
}

// ------------------------------------------------------------------ Merkmale (neutrale Antworten)
/*
 * Fallgeschichten setzen Merkmale mit neutralen IDs (z. B. hoehe = "boden", bw = "nein").
 * Ein Codesystem, dessen Fragen dieselben IDs und Werte benutzen, braucht nichts weiter.
 * Weichen sie ab, ordnet eine Frage ihr Merkmal zu: "merkmal": "hoehe", und eine Antwortoption
 * ihren Merkmal-Wert: "merkmal_wert": "boden".
 */
function zuordnungen(schema: Schema): { frage: string; merkmal: string; werte: Map<string, string> }[] {
  const out: { frage: string; merkmal: string; werte: Map<string, string> }[] = [];
  const fragen = [...Object.values(schema.globale_fragen ?? {}).flat(), ...Object.values(schema.kapitel).flatMap((k) => k.fragen ?? [])];
  for (const f of fragen) {
    const m = (f as { merkmal?: string }).merkmal;
    const werte = new Map<string, string>();
    for (const o of f.optionen ?? []) {
      const mw = (o as { merkmal_wert?: string }).merkmal_wert;
      if (mw) werte.set(o.wert, mw);
    }
    if ((m && m !== f.id) || werte.size) out.push({ frage: f.id, merkmal: m ?? f.id, werte });
  }
  return out;
}

/** Merkmale einer Fallgeschichte → Antworten des Codesystems */
export function merkmaleInSchema(schema: Schema, fest: Antworten): Antworten {
  const z = zuordnungen(schema);
  if (!z.length) return fest;
  const out: Antworten = { ...fest };
  for (const { frage, merkmal, werte } of z) {
    if (!(merkmal in fest)) continue;
    const v = fest[merkmal];
    if (merkmal !== frage) delete out[merkmal];
    const opt = [...werte.entries()].find(([, mw]) => mw === String(v));
    out[frage] = opt ? opt[0] : v;
  }
  return out;
}

/** Antworten des Codesystems → Merkmale (für Fallgeschichte und Anrufer) */
export function merkmaleAusSchema(schema: Schema, a: Antworten): Antworten {
  const z = zuordnungen(schema);
  if (!z.length) return a;
  const out: Antworten = { ...a };
  for (const { frage, merkmal, werte } of z) {
    if (!(frage in a)) continue;
    const v = a[frage];
    out[merkmal] = werte.get(String(v)) ?? v;
  }
  return out;
}

/** Merkmal einer Schemafrage (eigene ID, wenn das Schema keine Zuordnung hat) */
export function merkmalVonFrage(schema: Schema, frageId: string): string {
  return zuordnungen(schema).find((z) => z.frage === frageId)?.merkmal ?? frageId;
}
