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

/** Kreislaufstillstand: bewusstlos und atmet nicht (Schnappatmung ist „ineffektive Atmung“, kein Stillstand) */
export function istKreislaufstillstand(a: Antworten): boolean {
  return a.bw === "nein" && a.at === "keine";
}

/** Eigener Stillstand-/Ineffektiv-Code eines Kapitels (z. B. 6E1, 17D2, 23D1) – dann kein allgemeiner 9er */
const EIGENER_KS = /Kreislaufstillstand|Atemstillstand|Ineffektive Atmung|Agonale/i;

function ersterRegelCode(K: Kapitel, a: Antworten): string | null {
  for (const r of K.regeln) {
    if (!pruefe(r.wenn, a)) continue;
    if (r.code) return r.code;
    if (r.wechsel_zu_kapitel) return null;
    const m = r.code_nach_antwort;
    if (m) {
      const key = m.frage ? String(a[m.frage]) : (m.fragen ?? []).map((f) => String(a[f])).join("|");
      if (key in m.zuordnung) return m.zuordnung[key];
    }
  }
  return null;
}

/**
 * Ergänzungen zum importierten Schema (das Schema selbst bleibt unverändert):
 * Kapitel 9 fragt, ob der Zusammenbruch beobachtet wurde – 9D… nicht beobachtet (aufgefunden),
 * 9E1 beobachtet und atmet nicht, 9E2 beobachtet, Atmung unsicher/nicht prüfbar. 9E3–9E5 (Erhängen, Strangulation, Ersticken) unabhängig davon.
 */
const ergaenzt = new WeakMap<Schema, Schema>();
export function ergaenzeSchema(s: Schema): Schema {
  const fertig = ergaenzt.get(s);
  if (fertig) return fertig;
  const p: Schema = structuredClone(s);
  const K = p.kapitel["9"];
  if (K && !K.fragen.some((f) => f.id === "beobachtet")) {
    const i = K.fragen.findIndex((f) => f.id === "ursache_9");
    K.fragen.splice(i < 0 ? K.fragen.length : i + 1, 0, {
      id: "beobachtet",
      text: "Haben Sie oder jemand anderer gesehen, wie der Patient zusammengebrochen ist?",
      typ: "single",
      optionen: [
        { wert: "ja", label: "Ja – Zusammenbruch beobachtet" },
        { wert: "nein", label: "Nein – so aufgefunden" },
        { wert: "unbekannt", label: "Unbekannt" },
      ],
      anzeigen_wenn: { all: [{ q: "tod", in: ["nein"] }, { not: { q: "ursache_9", in: ["erhaengen", "strangulation", "ersticken"] } }] },
    });
    const istAtemRegel = (r: Regel) => ["RD-9E1", "RD-9E2", "RD-9D1"].includes(r.code ?? "") && !!r.wenn && "q" in r.wenn && r.wenn.q === "at";
    const pos = K.regeln.findIndex(istAtemRegel);
    if (pos >= 0) {
      K.regeln = K.regeln.filter((r) => !istAtemRegel(r));
      K.regeln.splice(
        pos,
        0,
        { code: "RD-9D1", wenn: { all: [{ q: "beobachtet", in: ["nein"] }, { q: "at", in: ["keine", "agonal", "unbekannt"] }] } },
        { code: "RD-9E1", wenn: { q: "at", in: ["keine"] } },
        { code: "RD-9E2", wenn: { q: "at", in: ["agonal", "unbekannt"] } },
        { code: "RD-9D1", wenn: { q: "at", in: ["abnorm"] } },
      );
    }
  }
  ergaenzt.set(s, p);
  return p;
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
      const eigen = ersterRegelCode(K, a);
      if (ks.code) {
        det = ks.code;
        ksSchnell = true;
      } else if (eigen && EIGENER_KS.test(schema.codes[eigen]?.name ?? "")) {
        // Kapitel hat einen eigenen Stillstand-Code (z. B. 6E1 Atembeschwerden) – über die Regeln
      } else if (ks.wechsel_zu_kapitel) wechsel = { ziel: ks.wechsel_zu_kapitel, vorbelegung: ks.vorbelegung };
    } else if (K.primaerabfrage && ks?.code && a.bw === "nein" && a.at === "agonal" && /Ineffektive Atmung/i.test(schema.codes[ks.code]?.name ?? "")) {
      // Schnappatmung: Kapitel-Code für ineffektive Atmung (z. B. 15E1, 34D3)
      det = ks.code;
      ksSchnell = true;
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
    const name = schema.codes[code]?.name ?? "";
    const reanimation =
      (istKreislaufstillstand(a) && (EIGENER_KS.test(name) || ksSchnell || kap === "9") && !/Tote Person|Tod/.test(name)) ||
      code === "RD-9E2";
    // Bewusstlos: Codes ohne eigene Bewusstlos-Variante werden zum Bewusstlosigkeits-Code (Kapitel 31) nach der Atmung
    const bl = reanimation ? null : bewusstlosCode(schema, kap, code, a);
    if (bl) return { kapitel: "31", pfad, determinante: bl, code: bl, reanimation, antworten: a };
    return { kapitel: kap, pfad, determinante: det, code, reanimation, antworten: a };
  }
  return null;
}

/** Bewusstloser Patient: 31D1 (agonal/ineffektiv), 31D2 (abnorm), 31D3 (effektiv), 31D4 (unklar) – außer der Code kennt Bewusstlosigkeit schon */
function bewusstlosCode(schema: Schema, kap: string, code: string, a: Antworten): string | null {
  if (a.bw !== "nein" || kap === "31" || kap === "9") return null;
  const name = schema.codes[code]?.name ?? "";
  // eigene Bewusstlos-Variante (z. B. Vergiftung-Bewusstlos, Sturz-Bewusstlos) bzw. eigener Stillstand-/Ineffektiv-Code bleibt;
  // „Bewusstseinstrübung“ ist für getrübte Patienten
  if (/bewusstlos|Ineffektive Atmung|Agonale/i.test(name)) return null;
  // Stillstand-Codes nur, wenn wirklich keine Atmung – Schnappatmung ist kein Stillstand
  if (/Kreislaufstillstand|Atemstillstand/i.test(name) && a.at === "keine") return null;
  const pre = code.match(/^([A-Z]+)-/)?.[1] ?? "RD";
  // Schnappatmung = ineffektiv (D1), Atemnot/erschwert = abnorm (D2), normal = effektiv (D3)
  const nr = a.at === "agonal" || a.at === "keine" ? "D1" : a.at === "abnorm" ? "D2" : a.at === "normal" ? "D3" : "D4";
  const ziel = `${pre}-31${nr}`;
  return schema.codes[ziel] ? ziel : null;
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

/**
 * Zufällig gezogene Antworten widerspruchsfrei machen (jede Frage wird einzeln gewürfelt –
 * ohne diese Regeln gäbe es z. B. „keine Verletzten“ und gleichzeitig „starke Blutung“).
 */
export function stimmigMachen(kap: string, a: Antworten): void {
  const setze = (id: string, v: Wert) => {
    if (a[id] !== undefined) a[id] = v;
  };
  const ja = (id: string) => a[id] === "ja";
  // Anzahl der Betroffenen: Primärabfrage und Kapitelfrage gleich
  if (a.anzahl !== undefined && a.anzahl_patienten !== undefined) a.anzahl = a.anzahl_patienten;
  if (kap === "29" || kap === "30" || kap === "17") {
    const schwer = ja("blutung_stark") || ja("eingeklemmt") || (a.bw !== undefined && a.bw !== "ja") || (a.at !== undefined && a.at !== "normal");
    if (schwer) setze("verletzte", "ja");
    if (a.verletzte === "nein_sicher" || a.verletzte === "nein_unsicher") {
      setze("blutung_stark", "nein");
      setze("eingeklemmt", "nein");
      setze("anrufer_selbst", "nein");
    }
    if (ja("gering")) {
      setze("hohe_geschw", "nein");
      setze("eingeklemmt", "nein");
      setze("grossunfall", "nein");
      setze("gefahrgut", "nein");
    }
    if (ja("hohe_geschw")) setze("gering", "nein");
    if (ja("gefahrgut")) setze("andere_gefahren", "ja");
    if (a.grossunfall !== undefined && a.grossunfall !== "nein") {
      setze("gering", "nein");
      setze("anzahl_patienten", "n");
      setze("anzahl", "n");
    }
    // Anrufer selbst (leicht) verletzt und ein weiterer Patient → mehrere Betroffene
    if (ja("anrufer_selbst")) {
      setze("anzahl_patienten", "n");
      setze("anzahl", "n");
      setze("verletzte", "ja");
    }
  }
}

/** Ein zufälliger, in sich stimmiger Fall in einem Kapitel: Antworten + daraus folgender Code */
export function fallZiehen(
  schema: Schema,
  kap: string,
  rnd: () => number = Math.random,
  pUnbekannt = 0.04,
  /** feste Antworten aus einer Fallgeschichte (werden nicht gewürfelt und nicht überschrieben) */
  fest: Antworten = {},
): { antworten: Antworten; ergebnis: Ergebnis } | null {
  const K = schema.kapitel[kap];
  if (!K) return null;
  const a: Antworten = { ...fest };
  const alter = typeof fest.alter === "number" ? fest.alter : zufallsAlter(rnd);
  const stimmig = () => {
    stimmigMachen(kap, a);
    for (const [k, v] of Object.entries(fest)) a[k] = v;
  };
  if (K.primaerabfrage) {
    for (const f of schema.globale_fragen.phase_4_primaerabfrage ?? []) {
      if (a[f.id] !== undefined) continue;
      if (f.id === "anzahl_patienten") a[f.id] = rnd() < 0.92 ? "1" : "n";
      else if (f.id === "bw") a.bw = rnd() < 0.72 ? "ja" : rnd() < 0.6 ? "getruebt" : rnd() < 0.85 ? "nein" : "unbekannt";
      else if (f.id === "at") a.at = a.bw === "nein" ? zufall(["normal", "abnorm", "agonal", "keine"], rnd) : rnd() < 0.75 ? "normal" : rnd() < 0.9 ? "abnorm" : "unbekannt";
      else a[f.id] = zufallsAntwort(f, rnd, alter, pUnbekannt);
    }
  }
  // Fragen (inkl. Kapitelwechsel) beantworten, bis keine neuen mehr auftauchen
  for (let runde = 0; runde < 5; runde++) {
    stimmig();
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
  stimmig();
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

/** Alle Fragen des Schemas nach ID (für Klartexte). Mit Kapitel: dessen Fragen haben Vorrang (gleiche ID, andere Optionen) */
export function frageIndex(schema: Schema, kapitel?: string): Map<string, Frage> {
  const m = new Map<string, Frage>();
  if (kapitel) for (const f of schema.kapitel[kapitel]?.fragen ?? []) m.set(f.id, f);
  for (const liste of Object.values(schema.globale_fragen)) for (const f of liste) if (!m.has(f.id)) m.set(f.id, f);
  for (const k of Object.values(schema.kapitel)) for (const f of k.fragen) if (!m.has(f.id)) m.set(f.id, f);
  return m;
}
