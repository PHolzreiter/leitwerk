/**
 * Wie schwer ist ein Code? (0 = harmlos … 1 = lebensbedrohlich) – für Codesysteme, deren Kategorien
 * nichts über die Dringlichkeit verraten („Stufe A“, „P2“, „Gruppe 3“).
 *
 * Quellen, in dieser Reihenfolge:
 *  1. „stufen“ im Codesystem (Muster + Reihenfolge der Dringlichkeitsstufen)
 *  2. sprechende Kategorie-Namen („Prio 1 – Notarzt“, „rot“, „Krankentransport“)
 *  3. der Aufbau: Abfrageschemas prüfen von oben nach unten – die ersten Regeln eines Kapitels
 *     sind die dringendsten, die letzte (ohne Bedingung) die harmloseste; Kreislaufstillstand ganz oben.
 * Daraus folgt auch, welche Antwort einer Frage zu schwereren Codes führt (für umgedrehte Fragen).
 */
import type { Bedingung, Schema } from "./schema";
import { stufeRaten, type StufeDef } from "../sim/settings";

function stufeVon(code: string, s: Schema): string {
  const st = s.stufen;
  if (!st?.muster) return "";
  try {
    return code.match(new RegExp(st.muster))?.[1] ?? "";
  } catch {
    return "";
  }
}

/** Schwere einer erkannten Einsatzstufe */
function nameSchwere(d: StufeDef): number {
  if (!d.rettungsmittel) return 0;
  if (d.kategorie === "kritisch") return d.notarzt === "schnellster" ? 1 : 0.9;
  if (d.kategorie === "dringend") return 0.6;
  return /^KTW/.test(d.rettungsmittel) ? 0.15 : 0.35;
}

/** Codes einer Regel (direkt, über Zuordnung nach Antwort, über die Auflösung) */
function codesDerRegel(r: { code?: string; code_nach_antwort?: { zuordnung: Record<string, string> } }, aufl?: Record<string, Record<string, string>>): string[] {
  const det = [r.code, ...Object.values(r.code_nach_antwort?.zuordnung ?? {})].filter((c): c is string => !!c);
  return det.flatMap((d) => [d, ...Object.values(aufl?.[d] ?? {})]);
}

export interface Schwere {
  /** Code → 0…1 */
  code: Map<string, number>;
  /** Kategorie → 0…1 (Durchschnitt ihrer Codes) */
  kategorie: Map<string, number>;
  /** Kategorie → Einsatzstufe (nur für Kategorien, die am Namen nicht erkennbar sind) */
  stufen: Record<string, StufeDef>;
}

const cache = new WeakMap<Schema, Schwere>();

export function schwereVon(s: Schema): Schwere {
  const c = cache.get(s);
  if (c) return c;
  // 3. Aufbau: Position der Regel im Kapitel
  const pos = new Map<string, number[]>();
  const dazu = (code: string, p: number) => {
    const l = pos.get(code) ?? [];
    l.push(p);
    pos.set(code, l);
  };
  for (const K of Object.values(s.kapitel ?? {})) {
    const n = K.regeln?.length ?? 0;
    (K.regeln ?? []).forEach((r, i) => {
      const p = n > 1 ? 1 - i / (n - 1) : 0.5;
      for (const code of codesDerRegel(r, K.aufloesung)) dazu(code, p);
    });
    if (K.kreislaufstillstand?.code) dazu(K.kreislaufstillstand.code, 1);
  }
  const mittel = (l: number[] | undefined) => (l?.length ? l.reduce((a, b) => a + b, 0) / l.length : 0.5);
  const codes = Object.keys(s.codes ?? {});
  const kat = (code: string) => s.codes[code]?.kategorie ?? "";
  // Kategorien: Name erkennbar?
  const kategorien = [...new Set(codes.map(kat).filter(Boolean))];
  const geraten = new Map(kategorien.map((k) => [k, stufeRaten(k)] as const));
  // Rang der Kategorie aus dem Aufbau (Durchschnitt der Positionen ihrer Codes)
  const katPos = new Map<string, number>();
  for (const k of kategorien) katPos.set(k, mittel(codes.filter((c) => kat(c) === k).flatMap((c) => pos.get(c) ?? [])));
  const sortiert = [...kategorien].sort((a, b) => katPos.get(a)! - katPos.get(b)!);
  const katRang = new Map(sortiert.map((k, i) => [k, sortiert.length > 1 ? i / (sortiert.length - 1) : 0.5] as const));
  const reihenfolge = s.stufen?.reihenfolge ?? [];
  const code = new Map<string, number>();
  for (const c of codes) {
    const p = mittel(pos.get(c));
    const st = reihenfolge.length > 1 ? reihenfolge.indexOf(stufeVon(c, s)) : -1;
    const g = geraten.get(kat(c));
    let v: number;
    if (st >= 0) v = 0.8 * (st / (reihenfolge.length - 1)) + 0.2 * p;
    else if (g) v = 0.8 * nameSchwere(g) + 0.2 * p;
    else v = 0.7 * (katRang.get(kat(c)) ?? 0.5) + 0.3 * p;
    code.set(c, v);
  }
  const kategorie = new Map<string, number>();
  for (const k of kategorien) kategorie.set(k, mittel(codes.filter((c) => kat(c) === k).map((c) => code.get(c)!)));
  // Einsatzstufen für Kategorien ohne sprechenden Namen: nach der Schwere einordnen
  const stufen: Record<string, StufeDef> = {};
  const vorlage = (k: string): StufeDef => ({ stufe: k, rettungsmittel: "RTW>RTW-C>KTW", nfsErforderlich: false, notarzt: "nein", sondersignal: true, kategorie: "dringend", transportProzent: 70 });
  for (const k of kategorien) {
    if (geraten.get(k)) continue;
    const v = kategorie.get(k)!;
    const r = katRang.get(k)!;
    const viele = kategorien.length >= 4;
    if (v >= 0.75 || (viele && r >= 0.99)) stufen[k] = { ...vorlage(k), rettungsmittel: "RTW-C>RTW>KTW", notarzt: "nef", kategorie: "kritisch", transportProzent: 85 };
    else if (v >= 0.45) stufen[k] = { ...vorlage(k), kategorie: "dringend", transportProzent: 75 };
    else if (v >= 0.2 || !viele) stufen[k] = { ...vorlage(k), rettungsmittel: "RTW>KTW>RTW-C", sondersignal: false, kategorie: "stabil", transportProzent: 70 };
    else stufen[k] = { ...vorlage(k), rettungsmittel: "KTW>RTW>RTW-C", sondersignal: false, kategorie: "stabil", transportProzent: 65 };
  }
  const erg = { code, kategorie, stufen };
  cache.set(s, erg);
  return erg;
}

/**
 * Bedingungen, die allein über den Code entscheiden: (Frage, Werte). Teile eines „all“ zählen nicht –
 * dort kommt die Schwere meist von der anderen Bedingung („bewusstlos UND atmet normal“).
 */
function atome(b: Bedingung | null | undefined, out: { q: string; in: string[] }[] = []): { q: string; in: string[] }[] {
  if (!b) return out;
  if ("all" in b) {
    if (b.all.length === 1) atome(b.all[0], out);
  } else if ("any" in b) b.any.forEach((x) => atome(x, out));
  else if ("q" in b && b.in) out.push({ q: b.q, in: b.in });
  return out;
}

export interface WertSchwere {
  /** Frage → Wert → Schwere der Codes, zu denen dieser Wert führt */
  wert: Map<string, Map<string, number>>;
  /** Frage → Schwere der Standard-Codes der Kapitel, in denen sie vorkommt (wenn kein Wert eine Regel hat) */
  basis: Map<string, number>;
}

const wcache = new WeakMap<Schema, WertSchwere>();

/** Zu welchen (wie schweren) Codes führt jede Antwort? */
export function wertSchwere(s: Schema): WertSchwere {
  const c = wcache.get(s);
  if (c) return c;
  const sw = schwereVon(s).code;
  const roh = new Map<string, Map<string, number[]>>();
  const basisRoh = new Map<string, number[]>();
  for (const K of Object.values(s.kapitel ?? {})) {
    const regeln = K.regeln ?? [];
    const std = regeln.filter((r) => !r.wenn).flatMap((r) => codesDerRegel(r, K.aufloesung)).map((x) => sw.get(x) ?? 0.5);
    for (const r of regeln) {
      const cs = codesDerRegel(r, K.aufloesung).map((x) => sw.get(x)).filter((x): x is number => x !== undefined);
      if (!cs.length) continue;
      const v = Math.max(...cs);
      for (const a of atome(r.wenn)) {
        const m = roh.get(a.q) ?? new Map<string, number[]>();
        for (const w of a.in) {
          const l = m.get(w) ?? [];
          l.push(v);
          m.set(w, l);
        }
        roh.set(a.q, m);
      }
    }
    for (const f of K.fragen ?? []) {
      const l = basisRoh.get(f.id) ?? [];
      l.push(...std);
      basisRoh.set(f.id, l);
    }
  }
  const mittel = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;
  const wert = new Map<string, Map<string, number>>();
  for (const [q, m] of roh) wert.set(q, new Map([...m].map(([w, l]) => [w, mittel(l)] as const)));
  const basis = new Map<string, number>();
  for (const [q, l] of basisRoh) if (l.length) basis.set(q, mittel(l));
  // Fragen der Primärabfrage (für alle Kapitel): Basis = alle Standard-Codes
  const alleStd = [...basisRoh.values()].flat();
  if (alleStd.length) for (const q of roh.keys()) if (!basis.has(q)) basis.set(q, mittel(alleStd));
  const erg = { wert, basis };
  wcache.set(s, erg);
  return erg;
}

/** Schwere einer Antwort (oder die Basis, wenn sie in keiner Regel steht); undefined = Frage in keiner Regel */
export function antwortSchwere(ws: WertSchwere, q: string, w: string): number | undefined {
  const m = ws.wert.get(q);
  if (!m) return undefined;
  return m.get(w) ?? ws.basis.get(q);
}

const rcache = new WeakMap<Schema, Map<string, Map<string, number>>>();

/**
 * Richtung einer Antwort: macht sie den Fall schlimmer? Regeln werden von oben nach unten geprüft –
 * trifft eine Bedingung zu, gilt ihr Code, sonst geht es mit den Regeln darunter weiter. Positiv =
 * der Code dieser Antwort ist schwerer als das, was ohne sie herauskäme.
 */
export function richtung(s: Schema): Map<string, Map<string, number>> {
  const c = rcache.get(s);
  if (c) return c;
  const sw = schwereVon(s).code;
  const roh = new Map<string, Map<string, number[]>>();
  for (const K of Object.values(s.kapitel ?? {})) {
    const regeln = K.regeln ?? [];
    const sev = regeln.map((r) => {
      const cs = codesDerRegel(r, K.aufloesung).map((x) => sw.get(x)).filter((x): x is number => x !== undefined);
      return cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : undefined;
    });
    regeln.forEach((r, i) => {
      const v = sev[i];
      if (v === undefined) return;
      const danach = sev.slice(i + 1).filter((x): x is number => x !== undefined);
      if (!danach.length) return;
      const d = v - danach.reduce((a, b) => a + b, 0) / danach.length;
      for (const a of atome(r.wenn)) {
        const m = roh.get(a.q) ?? new Map<string, number[]>();
        for (const w of a.in) {
          const l = m.get(w) ?? [];
          l.push(d);
          m.set(w, l);
        }
        roh.set(a.q, m);
      }
    });
  }
  const out = new Map<string, Map<string, number>>();
  for (const [q, m] of roh) out.set(q, new Map([...m].map(([w, l]) => [w, l.reduce((a, b) => a + b, 0) / l.length] as const)));
  rcache.set(s, out);
  return out;
}

/** Macht „ja“ den Fall eher schlimmer (> 0) oder harmloser (< 0) als „nein“? undefined = keine Regel dazu */
export function jaRichtung(r: Map<string, Map<string, number>>, q: string, ja: string, nein: string): number | undefined {
  const m = r.get(q);
  if (!m || (!m.has(ja) && !m.has(nein))) return undefined;
  return (m.get(ja) ?? 0) - (m.get(nein) ?? 0);
}
