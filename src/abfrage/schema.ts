/**
 * Abfrageschema (Notrufabfrage): Datenmodell und Auswertung.
 *
 * Das Schema wird vom Spieler importiert (Daten → Einsatzcodes) und ist nicht Teil von
 * LeitWerk. Die Auswertung ist eine Übertragung der Referenz-Engine des Schemas:
 * Antworten in einem gemeinsamen Wörterbuch, Regeln von oben nach unten, Kapitelwechsel,
 * Suffix und Auflösung auf einen existierenden Code.
 */

export type Wert = string | number | null;
export type Antworten = Record<string, Wert>;

export interface Option {
  wert: string;
  label: string;
}

export interface Frage {
  id: string;
  text: string;
  typ: "single" | "zahl" | "text" | "kapitelwahl";
  optionen?: Option[];
  hinweis?: string | null;
  anzeigen_wenn?: Bedingung | null;
}

export type Bedingung =
  | { all: Bedingung[] }
  | { any: Bedingung[] }
  | { not: Bedingung }
  | { abgeleitet: string; in: string[] }
  | { q: string; in?: string[]; gte?: number; lt?: number; ist_unbekannt?: boolean; unbekannt_ist?: boolean };

export interface Regel {
  wenn?: Bedingung | null;
  code?: string;
  wechsel_zu_kapitel?: string;
  vorbelegung?: Antworten;
  code_nach_antwort?: { frage?: string; fragen?: string[]; zuordnung: Record<string, string> };
}

export interface Kapitel {
  kapitel: string;
  titel: string;
  stichworte: string[];
  primaerabfrage: boolean;
  kreislaufstillstand: { code?: string; wechsel_zu_kapitel?: string; vorbelegung?: Antworten; weiter_mit_fragen?: boolean } | null;
  fragen: Frage[];
  regeln: Regel[];
  suffix: { regeln: { wenn: Bedingung; suffix: string }[]; standard: string };
  aufloesung: Record<string, Record<string, string>>;
  aufwertung?: Record<string, string>;
  zusatzkennungen?: Record<string, string[]>;
  polizei_kennung?: Record<string, string>;
  hinweis?: string | null;
}

export interface Schema {
  version: number;
  beschreibung?: string;
  globale_fragen: Record<string, Frage[]>;
  kapitel: Record<string, Kapitel>;
  codes: Record<string, { name: string; kategorie: string; kapitel: string }>;
}

/** Prüft grob, ob ein importiertes Objekt ein Abfrageschema ist. */
export function istSchema(x: unknown): x is Schema {
  const s = x as Schema;
  return !!s && typeof s === "object" && !!s.kapitel && !!s.globale_fragen && typeof s.kapitel === "object";
}

// ------------------------------------------------------------------ Auswertung

export function fastErgebnis(a: Antworten): string {
  const vals = [a.fast_gesicht, a.fast_arm, a.fast_sprache];
  if (vals.some((v) => v !== "ja" && v !== "nein")) return "nicht";
  return ["keine", "unvollst", "stark", "eindeutig"][vals.filter((v) => v === "ja").length];
}

const unbekannt = (v: Wert | undefined) => v === null || v === undefined || v === "unbekannt";

export function pruefe(c: Bedingung | null | undefined, a: Antworten): boolean {
  if (!c) return true;
  if ("all" in c) return c.all.every((x) => pruefe(x, a));
  if ("any" in c) return c.any.some((x) => pruefe(x, a));
  if ("not" in c) return !pruefe(c.not, a);
  if ("abgeleitet" in c) return c.in.includes(fastErgebnis(a));
  const v = a[c.q];
  if (c.in) return v !== null && v !== undefined && c.in.includes(String(v));
  if (c.ist_unbekannt) return unbekannt(v);
  if (unbekannt(v)) return c.unbekannt_ist ?? true;
  const n = Number(v);
  if (c.gte !== undefined && !(n >= c.gte)) return false;
  if (c.lt !== undefined && !(n < c.lt)) return false;
  return true;
}

export function sichtbareFragen(k: Kapitel, a: Antworten): Frage[] {
  return k.fragen.filter((q) => pruefe(q.anzeigen_wenn, a));
}

export function istKreislaufstillstand(a: Antworten): boolean {
  return a.bw === "nein" && (a.at === "keine" || a.at === "agonal");
}

export interface Ergebnis {
  /** Kapitel, in dem der Code bestimmt wurde (nach evtl. Wechseln) */
  kapitel: string;
  /** Kapitelfolge, falls gewechselt wurde */
  pfad: string[];
  determinante: string;
  code: string;
  /** Kreislaufstillstand erkannt → Reanimation anleiten */
  reanimation: boolean;
  /** Antworten inkl. Vorbelegungen der Kapitelwechsel */
  antworten: Antworten;
}

/**
 * Bestimmt den Code. Fehlende Antworten zählen als null (vorläufiger Code während der Abfrage).
 * Optional: Aufwertung (Stufenbuchstabe), Zusatzkennung (fertiger Code), Polizei.
 */
export function bestimmeCode(
  schema: Schema,
  startKapitel: string,
  antworten: Antworten,
  extra: { aufwertung?: string | null; zusatz?: string | null; polizei?: boolean } = {},
): Ergebnis | null {
  let kap = startKapitel;
  const a: Antworten = { ...antworten };
  const pfad = [kap];
  for (let tiefe = 0; tiefe < 6; tiefe++) {
    const K = schema.kapitel[kap];
    if (!K) return null;
    let det: string | null = null;
    let ksSchnell = false;
    let wechsel: { ziel: string; vorbelegung?: Antworten } | null = null;
    const ks = K.kreislaufstillstand;
    if (K.primaerabfrage && ks && istKreislaufstillstand(a)) {
      if (ks.code) {
        det = ks.code;
        ksSchnell = true;
      } else if (ks.wechsel_zu_kapitel) wechsel = { ziel: ks.wechsel_zu_kapitel, vorbelegung: ks.vorbelegung };
    }
    if (!det && !wechsel) {
      for (const r of K.regeln) {
        if (!pruefe(r.wenn, a)) continue;
        if (r.code) {
          det = r.code;
          break;
        }
        if (r.wechsel_zu_kapitel) {
          wechsel = { ziel: r.wechsel_zu_kapitel, vorbelegung: r.vorbelegung };
          break;
        }
        const m = r.code_nach_antwort;
        if (m) {
          const key = m.frage ? String(a[m.frage]) : (m.fragen ?? []).map((f) => String(a[f])).join("|");
          if (key in m.zuordnung) {
            det = m.zuordnung[key];
            break;
          }
        }
      }
    }
    if (wechsel) {
      for (const [k, v] of Object.entries(wechsel.vorbelegung ?? {})) if (a[k] === undefined || a[k] === null) a[k] = v;
      kap = wechsel.ziel;
      pfad.push(kap);
      continue;
    }
    if (!det) return null;
    // Manuelle Aufwertung (nur auf eine höhere Stufe)
    if (extra.aufwertung && K.aufwertung?.[extra.aufwertung] && stufeRang(extra.aufwertung) > stufeRang(stufeVonCode(det))) {
      det = K.aufwertung[extra.aufwertung];
    }
    const s = ksSchnell ? "" : suffixVon(K, a);
    const zeile = K.aufloesung[det];
    let code = zeile ? (zeile[s || "_"] ?? zeile["_"] ?? det) : det;
    if (extra.polizei && K.polizei_kennung) {
      const pk = K.polizei_kennung;
      code = pk[det] ?? pk[stufeVonCode(det)] ?? pk["*"] ?? code;
    }
    if (extra.zusatz && (K.zusatzkennungen?.[det] ?? []).includes(extra.zusatz)) code = extra.zusatz;
    return { kapitel: kap, pfad, determinante: det, code, reanimation: istKreislaufstillstand(a) && (ksSchnell || kap === "9"), antworten: a };
  }
  return null;
}

function suffixVon(K: Kapitel, a: Antworten): string {
  for (const r of K.suffix?.regeln ?? []) if (pruefe(r.wenn, a)) return r.suffix;
  return K.suffix?.standard ?? "";
}

/** Stufe eines Codes: Buchstabe nach der Kapitelnummer (RD-17D3 → D, ALP-46B1 → B) */
export function stufeVonCode(code: string): string {
  const m = code.match(/^[A-Z]+-\d+([OABCDE])/);
  return m ? m[1] : "";
}

const STUFEN = "OABCDE";
function stufeRang(s: string): number {
  return STUFEN.indexOf(s);
}

/** Kapitel eines Codes laut Codeliste des Schemas („17 - Sturz“ → „17“) */
export function kapitelVonCode(schema: Schema, code: string): string | null {
  const k = schema.codes[code]?.kapitel ?? "";
  const m = k.match(/^\s*([A-Z]+|\d+)/);
  return m && schema.kapitel[m[1]] ? m[1] : null;
}

/** Fragen, die im Ablauf gestellt werden (Primärabfrage + Kapitelfragen inkl. Wechsel) */
export function fragenImAblauf(schema: Schema, kap: string, a: Antworten): { phase: string; frage: Frage }[] {
  const out: { phase: string; frage: Frage }[] = [];
  const K = schema.kapitel[kap];
  if (!K) return out;
  if (K.primaerabfrage) for (const f of schema.globale_fragen.phase_4_primaerabfrage ?? []) out.push({ phase: "Primärabfrage", frage: f });
  const erg = bestimmeCode(schema, kap, a);
  const pfad = erg?.pfad ?? [kap];
  const gesehen = new Set(out.map((x) => x.frage.id));
  for (const p of pfad) {
    const KK = schema.kapitel[p];
    if (!KK) continue;
    for (const f of sichtbareFragen(KK, erg?.antworten ?? a)) {
      if (gesehen.has(f.id)) continue;
      gesehen.add(f.id);
      out.push({ phase: `Kapitel ${p} – ${KK.titel}`, frage: f });
    }
  }
  return out;
}

// ------------------------------------------------------------------ „Wahrheit“ für den Anrufer

function zufall<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Zufällige Antwort; Ja/Nein-Fragen eher „nein“ (die meisten Notrufe sind nicht dramatisch) */
function zufallsAntwort(f: Frage, rnd: () => number, alter: number, pUnbekannt: number): Wert {
  if (f.typ === "zahl") {
    if (rnd() < pUnbekannt) return "unbekannt";
    if (f.id === "alter") return alter;
    if (f.id === "ssw") return Math.floor(20 + rnd() * 23);
    return Math.floor(rnd() * 60);
  }
  if (f.typ !== "single" || !f.optionen?.length) return null;
  const hatUnb = f.optionen.some((o) => o.wert === "unbekannt");
  if (hatUnb && rnd() < pUnbekannt) return "unbekannt";
  const opts = f.optionen.filter((o) => o.wert !== "unbekannt");
  if (!opts.length) return f.optionen[0].wert;
  const jaNein = opts.length === 2 && opts.some((o) => o.wert === "ja") && opts.some((o) => o.wert === "nein");
  if (jaNein) return rnd() < 0.68 ? "nein" : "ja";
  return zufall(opts, rnd).wert;
}

function zufallsAlter(rnd: () => number): number {
  const r = rnd();
  if (r < 0.08) return Math.floor(1 + rnd() * 13);
  if (r < 0.3) return Math.floor(14 + rnd() * 35);
  return Math.floor(50 + rnd() * 46);
}

/** Ein zufälliger, in sich stimmiger Fall in einem Kapitel: Antworten + daraus folgender Code */
export function fallZiehen(
  schema: Schema,
  kap: string,
  rnd: () => number = Math.random,
  pUnbekannt = 0.04,
): { antworten: Antworten; ergebnis: Ergebnis } | null {
  const K = schema.kapitel[kap];
  if (!K) return null;
  const a: Antworten = {};
  const alter = zufallsAlter(rnd);
  if (K.primaerabfrage) {
    for (const f of schema.globale_fragen.phase_4_primaerabfrage ?? []) {
      if (f.id === "anzahl_patienten") a[f.id] = rnd() < 0.92 ? "1" : "n";
      else if (f.id === "bw") a.bw = rnd() < 0.72 ? "ja" : rnd() < 0.6 ? "getruebt" : rnd() < 0.85 ? "nein" : "unbekannt";
      else if (f.id === "at") a.at = a.bw === "nein" ? zufall(["normal", "abnorm", "agonal", "keine"], rnd) : rnd() < 0.75 ? "normal" : rnd() < 0.9 ? "abnorm" : "unbekannt";
      else a[f.id] = zufallsAntwort(f, rnd, alter, pUnbekannt);
    }
  }
  // Fragen (inkl. Kapitelwechsel) beantworten, bis keine neuen mehr auftauchen
  for (let runde = 0; runde < 5; runde++) {
    const erg = bestimmeCode(schema, kap, a);
    for (const [k, v] of Object.entries(erg?.antworten ?? {})) if (a[k] === undefined) a[k] = v;
    let neu = false;
    for (const p of erg?.pfad ?? [kap]) {
      const KK = schema.kapitel[p];
      if (!KK) continue;
      for (const f of sichtbareFragen(KK, a)) {
        if (a[f.id] !== undefined) continue;
        a[f.id] = f.id === "alter" ? alter : zufallsAntwort(f, rnd, alter, pUnbekannt);
        neu = true;
      }
    }
    if (!neu) break;
  }
  if (a.alter === undefined) a.alter = alter;
  const ergebnis = bestimmeCode(schema, kap, a);
  return ergebnis ? { antworten: ergebnis.antworten, ergebnis } : null;
}

/**
 * Sucht Antworten, die genau zu einem Zielcode führen (z. B. für Einsatzvorlagen mit festem Code).
 * Nicht jeder Code ist erreichbar (z. B. reine Aufwertungscodes) – dann null.
 */
export function wahrheitFuer(schema: Schema, ziel: string, rnd: () => number = Math.random): Antworten | null {
  const kap = kapitelVonCode(schema, ziel);
  if (!kap) return null;
  for (let versuch = 0; versuch < 6000; versuch++) {
    const f = fallZiehen(schema, kap, rnd, versuch > 3000 ? 0.2 : 0.04);
    if (f?.ergebnis.code === ziel) return f.antworten;
  }
  return null;
}

/** Klartext einer Antwort (für den Anrufer und die Anzeige) */
export function antwortLabel(f: Frage, wert: Wert): string {
  if (wert === null || wert === undefined) return "–";
  if (f.typ === "zahl") return wert === "unbekannt" ? "unbekannt" : String(wert);
  return f.optionen?.find((o) => o.wert === String(wert))?.label ?? String(wert);
}

/** Alle Fragen des Schemas nach ID (für Klartexte) */
export function frageIndex(schema: Schema): Map<string, Frage> {
  const m = new Map<string, Frage>();
  for (const liste of Object.values(schema.globale_fragen)) for (const f of liste) m.set(f.id, f);
  for (const k of Object.values(schema.kapitel)) for (const f of k.fragen) if (!m.has(f.id)) m.set(f.id, f);
  return m;
}
