/**
 * Abfrageschema (Notrufabfrage): Datenmodell und Auswertung.
 *
 * Das Schema wird vom Spieler importiert (Daten → Einsatzcodes) und ist nicht Teil von
 * LeitWerk. Die Auswertung ist eine Übertragung der Referenz-Engine des Schemas:
 * Antworten in einem gemeinsamen Wörterbuch, Regeln von oben nach unten, Kapitelwechsel,
 * Suffix und Auflösung auf einen existierenden Code.
 */

import { ist, kapitelZuThema, thema } from "./themen";

export type Wert = string | number | null;
export type Antworten = Record<string, Wert>;

export interface Option {
  wert: string;
  label: string;
  /** Option nur anbieten, wenn … (z. B. „gehend“ bei der Pistenrettung nur ohne Dringlichkeit) */
  anzeigen_wenn?: Bedingung | null;
}

/** Optionen, die bei diesen Antworten angeboten werden */
export function optionenFuer(f: Frage, a: Antworten): Option[] {
  return (f.optionen ?? []).filter((o) => !o.anzeigen_wenn || pruefe(o.anzeigen_wenn, a));
}

export interface Frage {
  id: string;
  text: string;
  typ: "single" | "zahl" | "text" | "kapitelwahl";
  optionen?: Option[];
  hinweis?: string | null;
  anzeigen_wenn?: Bedingung | null;
  /** bei mehreren Betroffenen: Frage an die Gruppe („Ist jemand bewusstlos …?“) und passende Antworttexte */
  text_mehrere?: string;
  labels_mehrere?: Record<string, string>;
  /** wird immer gefragt, auch wenn der Code schon feststeht (wichtig für Besatzung, Partner, Eigenschutz) */
  immer?: boolean;
}

/** Werte von „Wie viele Personen sind betroffen?“, die mehrere Betroffene bedeuten („n“ = 2–5) */
export const MEHRERE_WERTE = ["n", "6-10", "11-30", "30+"];

/** Mehrere Betroffene laut Abfrage? */
export function mehrere(a: Antworten | null | undefined): boolean {
  const v = a?.anzahl_patienten;
  return typeof v === "string" && MEHRERE_WERTE.includes(v);
}

/** Großschaden-Stufe aus der Zahl der Betroffenen (6–10 = NF5, 11–30 = NF10, mehr = NF30) */
export function nfStufe(a: Antworten | null | undefined): "NF5" | "NF10" | "NF30" | null {
  const v = a?.anzahl_patienten;
  return v === "6-10" ? "NF5" : v === "11-30" ? "NF10" : v === "30+" ? "NF30" : null;
}

/** Frage so, wie sie gestellt wird (bei mehreren Betroffenen an die Gruppe) */
export function frageFuer(f: Frage, a: Antworten | null | undefined): Frage {
  if (!mehrere(a) || (!f.text_mehrere && !f.labels_mehrere)) return f;
  const l = f.labels_mehrere ?? {};
  return { ...f, text: f.text_mehrere ?? f.text, optionen: f.optionen?.map((o) => (l[o.wert] ? { ...o, label: l[o.wert] } : o)) };
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
  /** neutrales Thema (siehe themen.ts), z. B. „sturz“ – verbindet das Kapitel mit Fallgeschichten und Spiellogik */
  thema?: string;
  titel: string;
  stichworte: string[];
  primaerabfrage: boolean;
  kreislaufstillstand: { code?: string; wechsel_zu_kapitel?: string; vorbelegung?: Antworten; weiter_mit_fragen?: boolean } | null;
  fragen: Frage[];
  regeln: Regel[];
  suffix: { regeln: { wenn: Bedingung; suffix: string }[]; standard: string };
  /** vorberechnete Auflösung Determinante + Suffix → Code; fehlt sie, gilt Determinante+Suffix (wenn es den Code gibt) */
  aufloesung?: Record<string, Record<string, string>>;
  aufwertung?: Record<string, string>;
  zusatzkennungen?: Record<string, string[]>;
  polizei_kennung?: Record<string, string>;
  hinweis?: string | null;
}

export interface Schema {
  version: number;
  /** "leitwerk-codesystem": Codes und Abfrage in einer Datei */
  format?: string;
  /** Name des Codesystems (z. B. „Leitstelle – AMPDS“) */
  name?: string;
  beschreibung?: string;
  /** Anleitung für eine KI, die ein neues Codesystem erstellt (wird vom Spiel nicht ausgewertet) */
  anleitung_fuer_ki?: string | string[];
  /**
   * Dringlichkeitsstufen im Code: muster = regulärer Ausdruck mit einer Klammer für die Stufe,
   * reihenfolge = von niedrig nach hoch. Ohne Angabe: AMPDS-Art (RD-17D3 → D; O < A < B < C < D < E).
   */
  stufen?: { muster: string; reihenfolge: string[] };
  /**
   * Einsatzstufen (= „kategorie“ der Codes) mit Rettungsmitteln. Fehlt eine Stufe in den Einstellungen,
   * wird sie beim Laden angelegt (vorhandene Einstellungen bleiben).
   */
  einsatzstufen?: {
    stufe: string;
    rettungsmittel: string;
    nfs_erforderlich?: boolean;
    notarzt?: "nein" | "nef" | "schnellster";
    sondersignal?: boolean;
    kategorie?: "stabil" | "dringend" | "kritisch";
    transport_prozent?: number;
  }[];
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

export function sichtbareFragen(k: Kapitel, a: Antworten, schema?: Schema | null): Frage[] {
  const b = ableitenIn(schema, k.kapitel, { ...a });
  return k.fragen.filter((q) => pruefe(q.anzeigen_wenn, b));
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
  // Kapitel mit „Grund der Anforderung“ (Anforderung durch Arzt/Einrichtung): der gewählte Grund bestimmt
  // den Code. Bewusstsein/Atmung des Patienten zählen nur, wenn kein bestimmter Grund gewählt ist.
  for (const kap of Object.values(p.kapitel)) {
    if (!kap.fragen.some((f) => f.id === "grund")) continue;
    const zurueck: Regel[] = [];
    kap.regeln = kap.regeln.map((r) => {
      const w = r.wenn;
      if (!r.code || !w || !("any" in w)) return r;
      const grund = w.any.filter((b) => "q" in b && b.q === "grund");
      const sonst = w.any.filter((b) => !("q" in b && b.q === "grund"));
      if (!grund.length || !sonst.length) return r;
      zurueck.push({ code: r.code, wenn: sonst.length === 1 ? sonst[0] : { any: sonst } });
      return { ...r, wenn: grund.length === 1 ? grund[0] : { any: grund } };
    });
    if (zurueck.length) {
      // vor die Zuordnung nach Dringlichkeit/Transportart bzw. den Standardcode
      let pos = kap.regeln.findIndex((r) => r.code_nach_antwort || !r.wenn);
      if (pos < 0) pos = kap.regeln.length;
      kap.regeln.splice(pos, 0, ...zurueck);
    }
  }
  mehrereErgaenzen(p);
  ablaufVerbessern(p);
  sonderAnruferErgaenzen(p);
  arbeitsunfallErgaenzen(p);
  gesperrtErgaenzen(p);
  ergaenzt.set(s, p);
  return p;
}

// ------------------------------------------------------------------ Sonderanrufer (Beta 49)

/** Bedingung, die nie zutrifft (Frage wird nie gestellt, ihre Antwort kommt automatisch) */
const NIE: Bedingung = { q: "__nie", in: ["1"] };

/**
 * „Wer ruft an?“ – Sonderanrufer geben das Kapitel vor (Wert → Thema, vorbelegte Antworten, Grund für den Hinweis).
 * Das Kapitel wird automatisch gewählt; der Disponent kann es überstimmen.
 */
export const ANRUFER_KAPITEL: Record<string, { thema: string; vor?: Antworten; grund: string }> = {
  einrichtung: { thema: "anforderung_arzt", vor: { anforderer: "normal" }, grund: "Arzt, Pflege oder Einrichtung fordert an" },
  // die Hotline fordert immer für einen Patienten an (die Anzahl wird nicht gefragt)
  hotline: { thema: "anforderung_arzt", vor: { anforderer: "ecn", anzahl_patienten: "1" }, grund: "die Gesundheitshotline fordert an" },
  piste: { thema: "anforderung_arzt", vor: { anforderer: "schi" }, grund: "die Pistenrettung fordert an" },
  polizei: { thema: "anforderung_polizei", grund: "die Polizei fordert an" },
  ls: { thema: "anforderung_ls", vor: { von: "org" }, grund: "Feuerwehr, Berg- oder Wasserrettung fordert an" },
  system: { thema: "ecall", grund: "automatische Unfallmeldung" },
  // Rufhilfe (Beta 73): immer eine Person, die am Notrufgerät – es gibt keine Kapitel-Abfrage, immer 32B2
  rufhilfe: { thema: "unklar", vor: { anzahl_patienten: "1" }, grund: "Rufhilfe-Alarm" },
};

/** Rufhilfe (Beta 73): eigene Fragen nach „Wer ruft an?“ (Bewusstsein und Atmung kommen vorher aus der Primärabfrage) */
export const RUFHILFE_FRAGEN = ["rh_kontakt", "rh_safe_nr", "rh_safe_ort", "rh_was"] as const;

/** Code der Rufhilfe im Schema: 32B2 (Meldung durch Notrufsystem) – sonst ein passender B-Code des Kapitels „Unklare Lage“ */
export function rufhilfeCode(schema: Schema): string | null {
  const kap = kapitelZuThema("unklar", schema);
  if (!kap) return null;
  const im = Object.keys(schema.codes).filter((c) => kapitelVonCode(schema, c) === kap);
  return (
    im.find((c) => c === `RD-${kap}B2`) ??
    im.find((c) => /rufhilfe|notrufsystem|hausnotruf/i.test(schema.codes[c]?.name ?? "") && !/\s/.test(c)) ??
    im.find((c) => new RegExp(`^RD-${kap}B\\d+$`).test(c)) ??
    null
  );
}

/** Kapitel, das zum Anrufer gehört (null = normaler Anrufer) */
export function kapitelFuerAnrufer(schema: Schema, anrufer: Wert | undefined): { kapitel: string; vor: Antworten; grund: string } | null {
  const x = typeof anrufer === "string" ? ANRUFER_KAPITEL[anrufer] : undefined;
  if (!x) return null;
  const kap = kapitelZuThema(x.thema, schema);
  return kap && schema.kapitel[kap] ? { kapitel: kap, vor: x.vor ?? {}, grund: x.grund } : null;
}

/** „Was wird angefordert?“ der Gesundheitshotline → Grund, Dringlichkeit und Transportart */
const ECN_ANF: Record<string, Antworten> = {
  ohne: { grund: "transport", dringlichkeit: "ohne", transportart: "liegend" },
  sofort: { grund: "transport", dringlichkeit: "sofort", transportart: "liegend" },
  geraete: { grund: "transport", dringlichkeit: "geraete", transportart: "liegend" },
  na: { grund: "na" },
};

/**
 * Abgeleitete Antworten (werden nicht gefragt): Gesundheitshotline und Pistenrettung beantworten nur
 * „Was wird angefordert?“, Feuerwehr/Berg-/Wasserrettung ist immer „andere Organisation“.
 * Ändert a (eine Kopie übergeben).
 */
export function ableitenIn(schema: Schema | null | undefined, kap: string, a: Antworten): Antworten {
  const t = thema(kap, schema);
  const setze = (x: Antworten) => {
    for (const [k, v] of Object.entries(x)) if (a[k] === undefined || a[k] === null) a[k] = v;
  };
  if (t === "anforderung_arzt") {
    if (a.anforderer === "ecn" && typeof a.ecn_anf === "string" && ECN_ANF[a.ecn_anf]) setze(ECN_ANF[a.ecn_anf]);
    if (a.anforderer === "schi" && (a.schi_anf === "transport" || a.schi_anf === "na")) setze({ grund: a.schi_anf });
  }
  if (t === "anforderung_ls" && schema?.kapitel[kap]?.fragen.some((f) => f.id === "von" && f.optionen?.some((o) => o.wert === "org"))) setze({ von: "org" });
  // „Wie viele Patienten?“ (Verkehrsunfall) beantwortet schon die Primärabfrage (Beta 59)
  if (a.anzahl === undefined && a.anzahl_patienten !== undefined && a.anzahl_patienten !== null && a.anzahl_patienten !== "unbekannt" && schema?.kapitel[kap]?.fragen.some((f) => f.id === "anzahl" && f.optionen?.some((o) => o.wert === "1") && f.optionen?.some((o) => o.wert === "n")))
    a.anzahl = mehrere(a) ? "n" : "1";
  return a;
}

/** Werte von Optionen entfernen; Regeln, die nur über diese Werte erreichbar sind, fallen weg (Codes → gesperrt) */
function optionenWeg(K: Kapitel, frage: string, werte: string[], gesperrt: Set<string>): void {
  const f = K.fragen.find((x) => x.id === frage);
  if (!f?.optionen) return;
  f.optionen = f.optionen.filter((o) => !werte.includes(o.wert));
  K.regeln = K.regeln.filter((r) => {
    const w = r.wenn;
    const nur = !!w && "q" in w && w.q === frage && !!w.in && w.in.every((x) => werte.includes(x));
    if (nur && r.code) gesperrt.add(r.code);
    return !nur;
  });
}

function undBed(f: Frage, b: Bedingung): void {
  f.anzeigen_wenn = f.anzeigen_wenn ? { all: [f.anzeigen_wenn, b] } : b;
}

/** gesperrte Codes je Schema (kommen in keinem Fall vor, stehen in keiner Liste) */
const GESPERRT = new WeakMap<Schema, Set<string>>();
function gesperrtVon(p: Schema): Set<string> {
  let s = GESPERRT.get(p);
  if (!s) GESPERRT.set(p, (s = new Set()));
  return s;
}

function sonderAnruferErgaenzen(p: Schema): void {
  const gesperrt = gesperrtVon(p);
  const k33 = kapitelZuThema("anforderung_arzt", p);
  const K33 = k33 ? p.kapitel[k33] : undefined;
  const anf = K33?.fragen.find((f) => f.id === "anforderer");
  const hatEcn = !!anf?.optionen?.some((o) => o.wert === "ecn");
  const hatSchi = !!anf?.optionen?.some((o) => o.wert === "schi");
  // „Wer ruft an?“: Sonderanrufer direkt zur Wahl
  const wer = (p.globale_fragen.phase_3_was_ist_passiert ?? []).find((f) => f.id === "anrufer");
  if (wer?.optionen?.some((o) => o.wert === "einrichtung")) {
    const alt = new Map(wer.optionen.map((o) => [o.wert, o.label]));
    const o: Option[] = [];
    for (const w of ["1", "2", "3"]) if (alt.has(w)) o.push({ wert: w, label: alt.get(w)! });
    o.push({ wert: "einrichtung", label: alt.get("einrichtung") ?? "Arzt / Pflege / Einrichtung" });
    if (hatEcn) o.push({ wert: "hotline", label: "Gesundheitshotline" });
    if (hatSchi) o.push({ wert: "piste", label: "Pistenrettung" });
    if (alt.has("polizei")) o.push({ wert: "polizei", label: alt.get("polizei")! });
    if (alt.has("ls")) o.push({ wert: "ls", label: "Feuerwehr / Berg- / Wasserrettung" });
    if (alt.has("system")) o.push({ wert: "system", label: "Automatische Unfallmeldung (Auto / Uhr)" });
    if (rufhilfeCode(p)) o.push({ wert: "rufhilfe", label: "Rufhilfe (Notrufuhr / Hausnotruf)" });
    for (const x of wer.optionen) if (!o.some((y) => y.wert === x.wert) && !["ls", "system", "rufhilfe"].includes(x.wert)) o.push(x);
    wer.optionen = o;
  }
  // Kapitel 33: wer anfordert, ergibt sich aus „Wer ruft an?“; Telefonarzt und 141 gibt es nicht; nie ein Hubschrauber-Code
  if (K33 && anf) {
    anf.optionen = (anf.optionen ?? []).filter((o) => o.wert !== "telemed" && o.wert !== "141");
    anf.anzeigen_wenn = NIE;
    optionenWeg(K33, "grund", ["nah"], gesperrt);
    const sonder: Bedingung = { q: "anforderer", in: ["ecn", "schi"] };
    const grund = K33.fragen.find((f) => f.id === "grund");
    if (grund) undBed(grund, { not: sonder });
    const neu: Frage[] = [];
    if (hatEcn)
      neu.push(
        {
          id: "ecn_anf",
          text: "Was wird angefordert?",
          typ: "single",
          optionen: [
            { wert: "ohne", label: "Liegendtransport ohne Dringlichkeit" },
            { wert: "sofort", label: "Liegendtransport sofort" },
            { wert: "geraete", label: "Sofort, mit Geräten/Maßnahmen (Monitor, O2 …)" },
            { wert: "na", label: "Notarzt" },
          ],
          anzeigen_wenn: { q: "anforderer", in: ["ecn"] },
        },
        { id: "ecn_symptome", text: "Die gemeldeten Symptome sind:", typ: "text", anzeigen_wenn: { q: "anforderer", in: ["ecn"] } },
      );
    if (hatSchi)
      neu.push({
        id: "schi_anf",
        text: "Was wird angefordert?",
        typ: "single",
        optionen: [
          { wert: "transport", label: "Transport" },
          { wert: "na", label: "Notarzt" },
        ],
        anzeigen_wenn: { q: "anforderer", in: ["schi"] },
      });
    K33.fragen.splice(K33.fragen.indexOf(anf) + 1, 0, ...neu);
    for (const id of ["dringlichkeit", "transportart"]) {
      const f = K33.fragen.find((x) => x.id === id);
      if (f) undBed(f, { not: { q: "anforderer", in: ["ecn"] } });
    }
    // Pistenrettung: gehend nur ohne Dringlichkeit, kein eigener Rollstuhl
    const ta = K33.fragen.find((x) => x.id === "transportart");
    for (const o of ta?.optionen ?? []) {
      if (o.wert === "gehend") o.anzeigen_wenn = { any: [{ not: { q: "anforderer", in: ["schi"] } }, { q: "dringlichkeit", in: ["ohne"] }] };
      if (o.wert === "rollstuhl") o.anzeigen_wenn = { not: { q: "anforderer", in: ["schi"] } };
    }
    // Hotline/Pistenrettung: der Code kommt nur aus „Was wird angefordert?“ (Bewusstsein/Atmung ändern ihn nicht)
    const betrifft = (r: Regel) => {
      const s = JSON.stringify(r.wenn ?? null);
      return /"grund","in":\["(na|transport)"\]/.test(s) || !!r.code_nach_antwort?.fragen?.includes("dringlichkeit") || r.code_nach_antwort?.frage === "dringlichkeit";
    };
    const vorne = K33.regeln.filter(betrifft).map((r) => ({ ...r, wenn: { all: [sonder, r.wenn ?? { q: "grund", in: ["transport"] }] } as Bedingung }));
    K33.regeln = [...vorne, ...K33.regeln];
    if (K33.zusatzkennungen) for (const k of Object.keys(K33.zusatzkennungen)) delete K33.zusatzkennungen[k];
  }
  rufhilfeErgaenzen(p);
  // Kapitel 42: nur noch Feuerwehr, Berg- und Wasserrettung – RTW oder Notarzt
  const k42 = kapitelZuThema("anforderung_ls", p);
  const K42 = k42 ? p.kapitel[k42] : undefined;
  if (K42) {
    const von = K42.fragen.find((f) => f.id === "von");
    if (von?.optionen?.some((o) => o.wert === "org")) von.anzeigen_wenn = NIE;
    const mittel = K42.fragen.find((f) => f.id === "mittel");
    if (mittel?.optionen) {
      optionenWeg(K42, "mittel", ["ktw", "nah"], gesperrt);
      for (const o of mittel.optionen) o.label = o.wert === "rtw" ? "RTW" : o.wert === "na" ? "Notarzt" : o.label;
      // erreichbare Codes: alle anderen Regel-Codes des Kapitels fallen weg
      const erreicht = new Set<string>();
      for (const o of mittel.optionen) {
        const e = bestimmeCode(p, k42!, { mittel: o.wert, von: "org" });
        if (e) erreicht.add(e.determinante);
      }
      for (const r of K42.regeln) if (r.code && !erreicht.has(r.code)) gesperrt.add(r.code);
      for (const [det, l] of Object.entries(K42.zusatzkennungen ?? {})) if (!erreicht.has(det)) for (const c of l) gesperrt.add(c);
    }
  }
  // Zusatzkennungen, die sich jetzt aus dem Anrufer ergeben: „-Polizei“ automatisch, wenn die Polizei anruft
  for (const K of Object.values(p.kapitel)) {
    const z = K.zusatzkennungen;
    if (!z) continue;
    for (const [det, l] of Object.entries(z)) {
      const pol = l.find((c) => /-Polizei$/i.test(c));
      if (pol) (K.polizei_kennung ??= {})[det] ??= pol;
      z[det] = l.filter((c) => !/-(Polizei|NAH|TELEMED|141|LowCode|SCHI)$/i.test(c));
      if (!z[det].length) delete z[det];
    }
  }
  // eigene Frage „Polizei-Kennung setzen?“ (Kapitel 27): ergibt sich aus dem Anrufer
  for (const K of Object.values(p.kapitel)) for (const f of K.fragen) if (f.id === "polizei" && /kennung/i.test(f.text)) f.anzeigen_wenn = NIE;
  // nie ein eigener Hubschrauber-, Telefonarzt- oder 141-Code
  for (const c of Object.keys(p.codes)) if (/-(NAH|TELEMED|141)$/i.test(c)) gesperrt.add(c);
}

/**
 * Rufhilfe (Beta 73, Paul): Band mit Name, Alter, Adresse und Schlüsselsafe, dann Sprechverbindung (oder „…“).
 * Im Kapitel „Unklare Lage“ gibt es dafür nur: Sprechverbindung, Schlüsselsafe-Nummer und -Ort, „Was ist passiert?“
 * (Freitext). Der Code ist immer 32B2, ohne Aufwertung und ohne Zusatzkennung – der Disponent entscheidet selbst,
 * wen er schickt.
 */
function rufhilfeErgaenzen(p: Schema): void {
  const kap = kapitelZuThema("unklar", p);
  const K = kap ? p.kapitel[kap] : undefined;
  const code = rufhilfeCode(p);
  if (!K || !code || K.fragen.some((f) => f.id === "rh_kontakt")) return;
  const rh: Bedingung = { q: "anrufer", in: ["rufhilfe"] };
  for (const f of K.fragen) undBed(f, { not: rh });
  K.fragen.unshift(
    {
      id: "rh_kontakt",
      text: "Sprechverbindung: meldet sich die Person?",
      typ: "single",
      optionen: [
        { wert: "ja", label: "Ja, die Person spricht" },
        { wert: "nein", label: "Nein, keine Antwort" },
      ],
      anzeigen_wenn: rh,
    },
    { id: "rh_safe_nr", text: "Schlüsselsafe – Nummer", typ: "text", hinweis: "Steht in der Rufhilfe-Meldung", anzeigen_wenn: rh },
    { id: "rh_safe_ort", text: "Schlüsselsafe – wo?", typ: "text", hinweis: "Steht in der Rufhilfe-Meldung", anzeigen_wenn: rh },
    { id: "rh_was", text: "Was ist passiert?", typ: "text", hinweis: "Freitext – kommt auch in die Info an den RTW (nach Alter, Bewusstsein und Atmung)", anzeigen_wenn: rh },
  );
  // Code: immer 32B2 – vor allen anderen Regeln (auch kein Wechsel in ein anderes Kapitel, Paul 22.11.2026)
  K.regeln.unshift({ code, wenn: rh });
  if (K.zusatzkennungen) delete K.zusatzkennungen[code];
  if (K.suffix?.regeln) K.suffix.regeln = K.suffix.regeln.filter((r) => !JSON.stringify(r).includes('"rufhilfe"'));
}

/** Traumatische Kapitel: dort fragt man, ob es ein Arbeitsunfall ist (dann kommt die Polizei mit) */
export const ARBEITSUNFALL_THEMEN = ["sturz", "verletzung", "blutung", "eingeklemmt", "strom", "brand", "verkehrsunfall", "tierbiss", "wasser", "stich_schuss", "auge"];

function arbeitsunfallErgaenzen(p: Schema): void {
  for (const [nr, K] of Object.entries(p.kapitel)) {
    if (!ARBEITSUNFALL_THEMEN.includes(thema(nr, p)) || K.fragen.some((f) => f.id === "arbeitsunfall")) continue;
    K.fragen.push({
      id: "arbeitsunfall",
      text: "Handelt es sich um einen Arbeitsunfall?",
      typ: "single",
      optionen: [
        { wert: "ja", label: "Ja" },
        { wert: "nein", label: "Nein" },
      ],
      // ruft die Polizei an, ist sie schon da
      anzeigen_wenn: { not: { q: "anrufer", in: ["polizei"] } },
    });
  }
}

/** Codes, die „Weitergabe“ sind, kommen nicht vor – außer bei der automatischen Unfallmeldung (dafür kann der Disponent nichts) */
function gesperrtErgaenzen(p: Schema): void {
  const gesperrt = gesperrtVon(p);
  for (const [c, v] of Object.entries(p.codes)) {
    if (!/^weitergabe$/i.test(v.kategorie ?? "")) continue;
    const kap = kapitelVonCode(p, c);
    if (kap && thema(kap, p) === "ecall") continue;
    gesperrt.add(c);
  }
}

/** Kommt der Code im Spiel nicht vor? (Weitergabe, Hubschrauber-/Telefonarzt-Codes, weggefallene Anforderungen) */
export function codeGesperrt(schema: Schema | null | undefined, code: string | null | undefined): boolean {
  if (!schema || !code) return false;
  return GESPERRT.get(schema)?.has(code) ?? false;
}

/** Wann eine Frage bei bestätigt mehreren Verletzten wegfällt (je Thema: Bedingung und Fragen) */
const WEG_BEI_MEHREREN: { thema: string; wenn: Bedingung; frage: string; weg: string[] }[] = [
  { thema: "verkehrsunfall", wenn: { q: "anzahl", in: ["n"] }, frage: "anzahl", weg: ["anrufer_selbst", "gering"] },
  { thema: "brand", wenn: { q: "mehrere_verletzte", in: ["ja"] }, frage: "mehrere_verletzte", weg: ["sprachschw", "gesicht", "flaeche", "aelter6h", "nur_alarm"] },
  { thema: "gefahrstoff", wenn: { q: "mehrere_verletzte", in: ["ja"] }, frage: "mehrere_verletzte", weg: ["sprachschw"] },
  { thema: "strom", wenn: { q: "mehrere_verletzte", in: ["ja"] }, frage: "mehrere_verletzte", weg: ["sturz"] },
  { thema: "stich_schuss", wenn: { q: "mehrere_verletzte", in: ["ja"] }, frage: "mehrere_verletzte", weg: ["wunde", "anzahl_wunden", "blutung_stark", "aelter6h"] },
  { thema: "gewalt", wenn: { q: "mehrere_verletzte", in: ["ja"] }, frage: "mehrere_verletzte", weg: ["region", "blutung_stark", "fehlstellung", "aelter6h"] },
  { thema: "hitze_kaelte", wenn: { q: "mehrere_symptome", in: ["ja"] }, frage: "mehrere_symptome", weg: ["hautfarbe", "herz_vg"] },
];

/** Fragen an die Gruppe, wenn mehrere Personen betroffen sind */
const GRUPPE: Record<string, { text: string; labels?: Record<string, string> }> = {
  bw: { text: "Gibt es dort jemanden, der nicht bei vollem Bewusstsein ist?", labels: { ja: "Nein – alle sind wach und reagieren normal", getruebt: "Ja – jemand ist verwirrt / schläfrig", nein: "Ja – jemand ist bewusstlos", unbekannt: "Unbekannt" } },
  at: { text: "Gibt es dort jemanden, der nicht normal atmet?", labels: { normal: "Nein – alle atmen normal", abnorm: "Ja – jemand hat Atemnot / Atemgeräusche", agonal: "Ja – jemand atmet kaum / Schnappatmung", keine: "Ja – jemand atmet nicht", unbekannt: "Unbekannt" } },
  blutung_stark: { text: "Blutet jemand stark (läuft/spritzt, durchtränkt Tücher)?" },
  tot: { text: "Ist jemand offensichtlich und unzweifelhaft tot?" },
  schwer_verletzt: { text: "Ist jemand schwer verletzt?" },
  eingeklemmt: { text: "Ist jemand eingeklemmt?" },
  brennt_noch: { text: "Brennt jemand noch?" },
  sprachschw: { text: "Kann jemand nur einzelne Worte sprechen (Sprechpausen zum Atmen)?" },
  fehlstellung: { text: "Hat jemand eine Fehlstellung / einen offensichtlichen Bruch?" },
  noch_verbunden: { text: "Ist noch jemand mit der Stromquelle verbunden?" },
  hautfarbe: { text: "Ist bei jemandem die Hautfarbe verändert (grau, bläulich)? Nur blass zählt nicht." },
};

/**
 * Mehrere Betroffene: „Wie viele Personen sind betroffen?“ in Stufen (die Zahl bestimmt die Großschaden-Stufe),
 * ab zwei Betroffenen fallen Alter und Geschlecht weg und Fragen gehen an die Gruppe. Betroffen ist nicht verletzt:
 * erst wenn mehrere Verletzte bestätigt sind, fallen die danach unwichtigen Kapitelfragen weg (Fragen zu
 * „Person(en)“ – eingeschlossen, eingeklemmt – bleiben immer).
 */
function mehrereErgaenzen(p: Schema): void {
  const prim = p.globale_fragen.phase_4_primaerabfrage ?? [];
  const anz = prim.find((f) => f.id === "anzahl_patienten");
  if (!anz || anz.typ !== "single") return;
  const werte = (anz.optionen ?? []).map((o) => o.wert);
  if (!werte.includes("1") || !werte.includes("n")) return;
  anz.optionen = [
    { wert: "1", label: "Eine" },
    { wert: "n", label: "2–5" },
    { wert: "6-10", label: "6–10" },
    { wert: "11-30", label: "11–30" },
    { wert: "30+", label: "mehr als 30" },
    ...(werte.includes("unbekannt") ? [{ wert: "unbekannt", label: "Unbekannt" }] : []),
  ];
  const nichtMehrere: Bedingung = { not: { q: "anzahl_patienten", in: MEHRERE_WERTE } };
  const und = (f: Frage, b: Bedingung) => (f.anzeigen_wenn = f.anzeigen_wenn ? { all: [f.anzeigen_wenn, b] } : b);
  for (const f of prim) if (f.id === "alter" || f.id === "geschlecht") und(f, nichtMehrere);
  const gruppe = (f: Frage) => {
    const g = GRUPPE[f.id];
    if (!g || f.text_mehrere) return;
    f.text_mehrere = g.text;
    if (g.labels) f.labels_mehrere = g.labels;
  };
  for (const f of prim) gruppe(f);
  for (const K of Object.values(p.kapitel)) for (const f of K.fragen) gruppe(f);
  for (const r of WEG_BEI_MEHREREN) {
    const kap = kapitelZuThema(r.thema, p);
    const K = kap ? p.kapitel[kap] : undefined;
    if (!K) continue;
    const iFrage = K.fragen.findIndex((f) => f.id === r.frage);
    if (iFrage < 0) continue;
    const weg = K.fragen.filter((f) => r.weg.includes(f.id));
    if (!weg.length) continue;
    // die Frage nach mehreren Verletzten kommt vor die Fragen, die dann wegfallen
    const erste = Math.min(...weg.map((f) => K.fragen.indexOf(f)));
    if (iFrage > erste) {
      const mit = K.fragen.filter((f, i) => i >= iFrage && (f.id === r.frage || (r.frage === "anzahl" && f.id === "mehrere_rm")));
      K.fragen = K.fragen.filter((f) => !mit.includes(f));
      K.fragen.splice(erste, 0, ...mit);
    }
    for (const f of weg) und(f, { not: r.wenn });
  }
  // Verkehrsunfall: „Werden mehrere Rettungsmittel benötigt?“ erst, wenn mehrere Verletzte bestätigt sind
  const vu = kapitelZuThema("verkehrsunfall", p);
  const rm = vu ? p.kapitel[vu]?.fragen.find((f) => f.id === "mehrere_rm") : undefined;
  if (rm && rm.anzeigen_wenn && "q" in rm.anzeigen_wenn && rm.anzeigen_wenn.q === "anzahl") rm.anzeigen_wenn = { q: "anzahl", in: ["n"] };
}

// ------------------------------------------------------------------ Abfrage einengen (Beta 59)

/**
 * Fragen, die auch bei feststehendem Code gestellt werden: Partner (Feuerwehr, Polizei), Eigenschutz, Anleitung,
 * Tragehilfe, Liegedauer – sie ändern den Code nicht, aber den Einsatz.
 */
export const IMMER_FRAGEN = new Set([
  "eingeklemmt", "eingeschlossen", "gefahrgut", "andere_gefahren", "brennt_noch", "angriff_laeuft", "noch_verbunden", "strom_an",
  "taeter_vor_ort", "aggressiv", "gewalt", "gewalttaetig", "waffen", "selbstverbrennung", "tuer", "arbeitsunfall", "tod",
  "umstand", "schwer_pat", "sprachkontakt", "noch_gepfaehlt", "wo",
  // Schlaganfall-Test: wichtig für die Besatzung und die Stroke Unit, auch wenn der Code schon feststeht (Beta 61)
  "fast_gesicht", "fast_arm", "fast_sprache",
]);

/**
 * Ablauf der Kapitelfragen (Paul 15.11.2026): Folgefragen nur, wenn sie passen; doppelte Fragen zur Anzahl fallen weg.
 * Ändert nur, wann eine Frage kommt – Codes und Regeln bleiben gleich.
 */
function ablaufVerbessern(p: Schema): void {
  const und = (f: Frage | undefined, b: Bedingung) => {
    if (f) f.anzeigen_wenn = f.anzeigen_wenn ? { all: [f.anzeigen_wenn, b] } : b;
  };
  const frage = (K: Kapitel, id: string) => K.fragen.find((f) => f.id === id);
  const hinter = (K: Kapitel, id: string, nach: string) => {
    const f = frage(K, id);
    const i = K.fragen.findIndex((x) => x.id === nach);
    if (!f || i < 0) return;
    K.fragen = K.fragen.filter((x) => x !== f);
    K.fragen.splice(K.fragen.findIndex((x) => x.id === nach) + 1, 0, f);
  };
  // Mehrere Verletzte bzw. Anzahl der Patienten: bei einer betroffenen Person nicht noch einmal fragen
  const einer: Bedingung = { not: { q: "anzahl_patienten", in: ["1"] } };
  for (const K of Object.values(p.kapitel)) {
    und(frage(K, "mehrere_verletzte"), einer);
    const anz = frage(K, "anzahl");
    if (anz?.optionen?.some((o) => o.wert === "1") && anz.optionen.some((o) => o.wert === "n")) und(anz, { not: { q: "anzahl_patienten", in: ["1", ...MEHRERE_WERTE] } });
  }
  // Verbrennung/Brand: „nur Brandalarm?“ gleich nach der Ursache; „brennt noch“ und „eingeschlossen“ nur bei Feuer/Explosion
  const kb = kapitelZuThema("brand", p);
  const B = kb ? p.kapitel[kb] : undefined;
  const art = B ? frage(B, "art") : undefined;
  if (B && art?.optionen) {
    const feuer = art.optionen.map((o) => o.wert).filter((w) => /explosion|feuer|brand|detonation/i.test(w));
    if (feuer.length) {
      const istFeuer: Bedingung = { q: "art", in: feuer };
      und(frage(B, "brennt_noch"), istFeuer);
      und(frage(B, "eingeschlossen"), istFeuer);
      const na = frage(B, "nur_alarm");
      if (na) {
        und(na, istFeuer);
        hinter(B, "nur_alarm", "art");
        const keinAlarm: Bedingung = { not: { q: "nur_alarm", in: ["ja"] } };
        for (const id of ["brennt_noch", "mehrere_verletzte", "sprachschw", "gesicht", "flaeche", "aelter6h"]) und(frage(B, id), keinAlarm);
      }
    }
  }
  // Sturz: Verletzungsdetails nur, wenn der Patient verletzt ist
  const ks = kapitelZuThema("sturz", p);
  const S = ks ? p.kapitel[ks] : undefined;
  if (S && frage(S, "verletzt")) {
    hinter(S, "verletzt", "hoehe");
    for (const id of ["region", "blutung_stark", "fehlstellung"]) und(frage(S, id), { not: { q: "verletzt", in: ["nein"] } });
  }
  ablaufKapitel(p, und, frage, hinter);
  for (const K of Object.values(p.kapitel)) for (const f of K.fragen) if (IMMER_FRAGEN.has(f.id)) f.immer = true;
}

/** Fragen in eine Reihenfolge bringen – nur die genannten tauschen ihre Plätze, alle anderen bleiben, wo sie sind */
function ordnen(K: Kapitel, ids: string[]): void {
  const da = ids.filter((id) => K.fragen.some((f) => f.id === id));
  const plaetze = K.fragen.map((f, i) => (da.includes(f.id) ? i : -1)).filter((i) => i >= 0);
  const fragen = da.map((id) => K.fragen.find((f) => f.id === id)!);
  plaetze.forEach((pl, i) => (K.fragen[pl] = fragen[i]));
}

/** Werte einer Frage, die es im Schema gibt */
function werte(f: Frage | undefined, ...w: string[]): string[] {
  return w.filter((x) => f?.optionen?.some((o) => o.wert === x));
}

/** Bedingung in allen Fragen eines Kapitels ersetzen (z. B. „ubg = nein“ → „ubg nicht dringend/normal“) */
function bedingungErsetzen(K: Kapitel, alt: (c: Bedingung) => boolean, neu: () => Bedingung): void {
  const geh = (c: Bedingung): Bedingung => {
    if ("all" in c) return { all: c.all.map(geh) };
    if ("any" in c) return { any: c.any.map(geh) };
    if ("not" in c) return { not: geh(c.not) };
    return alt(c) ? neu() : c;
  };
  for (const f of K.fragen) if (f.anzeigen_wenn) f.anzeigen_wenn = geh(f.anzeigen_wenn);
}

/** Feinschliff je Kapitel (Paul 16.11.2026, Beta 61) – nur die Reihenfolge und wann eine Frage kommt */
function ablaufKapitel(
  p: Schema,
  und: (f: Frage | undefined, b: Bedingung) => void,
  frage: (K: Kapitel, id: string) => Frage | undefined,
  hinter: (K: Kapitel, id: string, nach: string) => void,
): void {
  const kap = (t: string) => {
    const k = kapitelZuThema(t, p);
    return k ? p.kapitel[k] : undefined;
  };
  // Psychiatrie: UBG nur, wenn die Polizei anruft; Eigenschutz gleich nach der Lage; Selbstverbrennung nur bei Suizid-Thema;
  // Krisenteam nur ohne akuten Notfall
  const P = kap("psych");
  if (P) {
    const ubg = frage(P, "ubg");
    const ubgJa = (ubg?.optionen ?? []).map((o) => String(o.wert)).filter((w) => w !== "nein");
    if (ubg && ubgJa.length) {
      bedingungErsetzen(P, (c) => "q" in c && c.q === "ubg" && "in" in c && Array.isArray(c.in) && c.in.length === 1 && c.in[0] === "nein", () => ({ not: { q: "ubg", in: ubgJa } }));
      const wer = (p.globale_fragen.phase_3_was_ist_passiert ?? []).find((f) => f.id === "anrufer");
      const andere = [...new Set([...(wer?.optionen ?? []).map((o) => String(o.wert)), "1", "2", "3", "einrichtung", "hotline", "piste", "ls", "system"])].filter((w) => w !== "polizei");
      und(ubg, { not: { q: "anrufer", in: andere } });
    }
    ordnen(P, ["lage", "ubg", "gewalt", "waffen", "substanzen", "verwirrt", "ploetzlich", "psych_vorerkrankung", "blutung", "selbstverbrennung", "krisenteam"]);
    const lage = frage(P, "lage");
    if (werte(lage, "kein_suizid").length) und(frage(P, "selbstverbrennung"), { not: { q: "lage", in: ["kein_suizid"] } });
    const kt = frage(P, "krisenteam");
    if (kt) {
      const akut: Bedingung[] = [{ not: { q: "bw", in: ["nein", "getruebt"] } }];
      const l = werte(lage, "gesprungen", "erhaengen");
      if (l.length) akut.push({ not: { q: "lage", in: l } });
      const b = werte(frage(P, "blutung"), "gefaehrlich", "stark");
      if (b.length) akut.push({ not: { q: "blutung", in: b } });
      und(kt, { all: akut });
    }
  }
  // Stich/Schuss: „offensichtlich tot?“ nur, wenn der Patient nicht wach ist
  const SS = kap("stich_schuss");
  if (SS) und(frage(SS, "tot"), { not: { q: "bw", in: ["ja", "getruebt"] } });
  // Verletzungen: hohe Energie (höchster Code nach dem Bewusstsein) gleich nach der Amputation
  const V = kap("verletzung");
  if (V && frage(V, "hohe_energie") && frage(V, "amputation")) hinter(V, "hohe_energie", "amputation");
  // Bauch und Rücken: graue Haut und Ohnmacht zuerst
  const BA = kap("bauch");
  if (BA) ordnen(BA, ["grau", "ohnmacht", "zerreiss", "aneurysma", "schmerzort"]);
  const RU = kap("ruecken");
  if (RU) ordnen(RU, ["ursache", "grau", "ohnmacht", "zerreiss", "aneurysma"]);
  // Krampfanfall: Epilepsie (nur niedrige Codes) nach den Risiken
  const KR = kap("krampf");
  if (KR) ordnen(KR, ["krampft", "fokal_ansprechbar", "atmung_geprueft", "schwanger", "diabetiker", "vg_schlaganfall", "vergiftung", "epilepsie", "atypisch"]);
  // Sturz: Ohnmacht vor „mehr als 6 Stunden her“
  const ST = kap("sturz");
  if (ST && frage(ST, "aelter6h") && frage(ST, "ohnmacht") && ST.fragen.findIndex((f) => f.id === "aelter6h") < ST.fragen.findIndex((f) => f.id === "ohnmacht")) hinter(ST, "aelter6h", "ohnmacht");
  // Kopfschmerz: Schlaganfall-Test nur bei einem Hinweis auf Schlaganfall
  const KS = kap("kopfschmerz");
  if (KS) {
    const hinweis = ["sprachstoerung", "taubheit", "laehmung", "verhalten", "ploetzlich_stark"].filter((id) => frage(KS, id));
    if (hinweis.length) for (const id of ["fast_gesicht", "fast_arm", "fast_sprache"]) und(frage(KS, id), { any: hinweis.map((h) => ({ q: h, in: ["ja", "unbekannt"] })) });
  }
  // Hitze/Kälte: „mehrere betroffen …“ nur bei mehreren Betroffenen
  const HK = kap("hitze_kaelte");
  if (HK) und(frage(HK, "mehrere_symptome"), { not: { q: "anzahl_patienten", in: ["1"] } });
  // Vergiftung: Eigenschutz gleich nach dem Hergang, Hautfarbe vor der VIZ-Frage, VIZ nur bei Versehen/unklar
  const VG = kap("vergiftung");
  if (VG) {
    ordnen(VG, ["absicht", "aggressiv", "waffen", "substanz", "hautfarbe", "viz"]);
    const w = werte(frage(VG, "absicht"), "versehentlich", "medikationsfehler", "unbekannt");
    if (w.length) und(frage(VG, "viz"), { q: "absicht", in: w });
  }
  // Schwangerschaft: zuerst die Situation; Woche und Zwillinge bleiben (für die Besatzung)
  const SW = kap("schwangerschaft");
  if (SW) {
    ordnen(SW, ["situation", "ssw", "mehrlinge"]);
    for (const id of ["ssw", "mehrlinge"]) {
      const f = frage(SW, id);
      if (f) f.immer = true;
    }
  }
  // Verkehrsunfall: eingeklemmt und Gefahren (Feuerwehr) früh
  const VU = kap("verkehrsunfall");
  if (VU) ordnen(VU, ["verletzte", "grossunfall", "eingeklemmt", "andere_gefahren", "gefahrgut", "mechanismus", "hohe_geschw", "blutung_stark"]);

  // ---- Beta 62 (Paul 16.11.2026: „alles überarbeiten“)
  // Ersticken: „Kann er sprechen, husten, atmen?“ zuerst (entscheidet fast immer, Anleitung sofort)
  const ER = kap("ersticken");
  if (ER) ordnen(ER, ["atemweg", "woran"]);
  // Allergie: zuerst „überhaupt Beschwerden?“; ohne Beschwerden keine Atemfragen; Sprechdyspnoe nur bei Atem-/Schluckbeschwerden
  const AL = kap("allergie");
  if (AL && frage(AL, "symptome")) {
    ordnen(AL, ["ursache", "symptome", "atem_schluck", "sprachschw", "vorgeschichte", "medikation"]);
    const ohne: Bedingung = { not: { q: "symptome", in: ["nein"] } };
    und(frage(AL, "atem_schluck"), ohne);
    und(frage(AL, "sprachschw"), ohne);
    und(frage(AL, "sprachschw"), { not: { q: "atem_schluck", in: ["nein"] } });
  }
  // Blutzucker: „gewalttätig?“ nur bei auffälligem Verhalten
  const BZ = kap("zucker");
  if (BZ && frage(BZ, "verhalten")) und(frage(BZ, "gewalttaetig"), { not: { q: "verhalten", in: ["nein"] } });
  // Gefahrstoff: zuerst „Hat jemand Beschwerden?“, der Stoff bleibt (Feuerwehr, Eigenschutz)
  const GS = kap("gefahrstoff");
  if (GS) {
    ordnen(GS, ["betroffene", "substanz"]);
    const f = frage(GS, "substanz");
    if (f) f.immer = true;
  }
  // Brustschmerz: Kokain nicht bei alten Menschen
  const BR = kap("brustschmerz");
  if (BR) und(frage(BR, "kokain"), { q: "alter", lt: 65 });
  // Bewusstlos: Bauchschmerzen nur bei Frauen im gebärfähigen Alter
  const BW = kap("bewusstlos");
  const bs = BW ? frage(BW, "bauchschmerz") : undefined;
  if (bs && !JSON.stringify(bs.anzeigen_wenn ?? {}).includes("alter")) und(bs, { all: [{ q: "alter", gte: 12 }, { q: "alter", lt: 51 }] });
  // Kranke Person: zuerst die Hauptbeschwerde (so fragt man im Gespräch); sie bleibt, auch wenn der Code feststeht
  const KP = kap("krank");
  if (KP) {
    ordnen(KP, ["hauptbeschwerde", "verwirrt", "sonderdiagnose"]);
    const f = frage(KP, "hauptbeschwerde");
    if (f) f.immer = true;
  }
}

const OFFEN = Symbol("offen");
type Drei = boolean | typeof OFFEN;

/** Bedingung mit noch offenen Fragen: true/false, wenn es nicht mehr auf sie ankommt, sonst OFFEN */
function pruefe3(c: Bedingung | null | undefined, a: Antworten, offen: Set<string>): Drei {
  if (!c) return true;
  if ("all" in c) {
    const r = c.all.map((x) => pruefe3(x, a, offen));
    return r.includes(false) ? false : r.includes(OFFEN) ? OFFEN : true;
  }
  if ("any" in c) {
    const r = c.any.map((x) => pruefe3(x, a, offen));
    return r.includes(true) ? true : r.includes(OFFEN) ? OFFEN : false;
  }
  if ("not" in c) {
    const r = pruefe3(c.not, a, offen);
    return r === OFFEN ? OFFEN : !r;
  }
  if ("abgeleitet" in c) return ["fast_gesicht", "fast_arm", "fast_sprache"].some((id) => offen.has(id)) ? OFFEN : pruefe(c, a);
  return offen.has(c.q) ? OFFEN : pruefe(c, a);
}

/** Steht der Code dieses Kapitels fest, egal wie die offenen Fragen beantwortet werden? */
function codeFest(schema: Schema, K: Kapitel, a: Antworten, offen: Set<string>): boolean {
  const ks = K.kreislaufstillstand;
  if (K.primaerabfrage && ks && (offen.has("bw") || offen.has("at"))) return false;
  if (K.primaerabfrage && ks?.code && istKreislaufstillstand(a)) return true;
  for (const r of K.regeln) {
    const w = pruefe3(r.wenn, a, offen);
    if (w === false) continue;
    if (w === OFFEN) return false;
    if (r.code || r.wechsel_zu_kapitel) return true;
    const m = r.code_nach_antwort;
    if (m) {
      const ids = m.frage ? [m.frage] : (m.fragen ?? []);
      if (ids.some((id) => offen.has(id))) return false;
      const key = m.frage ? String(a[m.frage]) : ids.map((f) => String(a[f])).join("|");
      if (key in m.zuordnung) return true;
    }
  }
  void schema;
  return true;
}

/** Fragen, die den Code nicht bestimmen, ihn aber trotzdem verändern (Zusatz-Buchstabe), samt ihren Voraussetzungen */
function nochNoetig(K: Kapitel): Set<string> {
  const out = new Set<string>();
  const sammle = (c: Bedingung | null | undefined) => {
    if (!c) return;
    if ("all" in c) c.all.forEach(sammle);
    else if ("any" in c) c.any.forEach(sammle);
    else if ("not" in c) sammle(c.not);
    else if ("abgeleitet" in c) ["fast_gesicht", "fast_arm", "fast_sprache"].forEach((x) => out.add(x));
    else out.add(c.q);
  };
  for (const r of K.suffix?.regeln ?? []) sammle(r.wenn);
  for (const f of K.fragen) if (f.immer) out.add(f.id);
  // Voraussetzungen (anzeigen_wenn) der nötigen Fragen
  for (let i = 0; i < 3; i++) for (const f of K.fragen) if (out.has(f.id)) sammle(f.anzeigen_wenn);
  return out;
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
  // „-Polizei“ nur, wenn die Polizei anruft – dann automatisch, wo es den Code gibt
  const polizei = !!extra.polizei || a.anrufer === "polizei";
  for (let tiefe = 0; tiefe < 6; tiefe++) {
    const K = schema.kapitel[kap];
    if (!K) return null;
    ableitenIn(schema, kap, a);
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
    if (extra.aufwertung && K.aufwertung?.[extra.aufwertung] && stufeRang(extra.aufwertung, schema) > stufeRang(stufeVonCode(det, schema), schema)) {
      det = K.aufwertung[extra.aufwertung];
    }
    const s = ksSchnell ? "" : suffixVon(K, a);
    const zeile = K.aufloesung?.[det];
    let code = zeile ? (zeile[s || "_"] ?? zeile["_"] ?? det) : s && schema.codes[det + s] ? det + s : det;
    if (polizei && K.polizei_kennung) {
      const pk = K.polizei_kennung;
      code = pk[det] ?? pk[stufeVonCode(det, schema)] ?? pk["*"] ?? code;
    }
    if (extra.zusatz && (K.zusatzkennungen?.[det] ?? []).includes(extra.zusatz)) code = extra.zusatz;
    const name = schema.codes[code]?.name ?? "";
    const reanimation =
      (istKreislaufstillstand(a) && (EIGENER_KS.test(name) || ksSchnell || thema(kap, schema) === "stillstand") && !/Tote Person|Tod/.test(name)) ||
      (code === "RD-9E2" && !istLeitWerkSystem(schema));
    // Bewusstlos: Codes ohne eigene Bewusstlos-Variante werden zum Bewusstlosigkeits-Code (Kapitel 31) nach der Atmung
    // (Rufhilfe bleibt immer 32B2 – Paul 22.11.2026)
    const bl = reanimation || a.anrufer === "rufhilfe" ? null : bewusstlosCode(schema, kap, code, a);
    if (bl) return { kapitel: kapitelZuThema("bewusstlos", schema) ?? "31", pfad, determinante: bl, code: bl, reanimation, antworten: a };
    return { kapitel: kap, pfad, determinante: det, code, reanimation, antworten: a };
  }
  return null;
}

/** Bewusstloser Patient: 31D1 (agonal/ineffektiv), 31D2 (abnorm), 31D3 (effektiv), 31D4 (unklar) – außer der Code kennt Bewusstlosigkeit schon */
function bewusstlosCode(schema: Schema, kap: string, code: string, a: Antworten): string | null {
  // Das eingebaute LeitWerk-Codesystem hat in jedem Kapitel eigene Codes für „reagiert nicht“
  if (istLeitWerkSystem(schema)) return null;
  const t = thema(kap, schema);
  if (a.bw !== "nein" || t === "bewusstlos" || t === "stillstand") return null;
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

/** Ist das das eingebaute LeitWerk-Codesystem (gleiches Code-Muster, aber eigene Bedeutungen)? */
export function istLeitWerkSystem(schema: Schema | null | undefined): boolean {
  return schema?.format === "leitwerk-codesystem" || schema?.name === "LeitWerk-Codesystem";
}

function suffixVon(K: Kapitel, a: Antworten): string {
  for (const r of K.suffix?.regeln ?? []) if (pruefe(r.wenn, a)) return r.suffix;
  return K.suffix?.standard ?? "";
}

/** Stufe eines Codes: Buchstabe nach der Kapitelnummer (RD-17D3 → D, ALP-46B1 → B) – oder nach dem Muster des Codesystems */
export function stufeVonCode(code: string, schema?: Schema | null): string {
  const st = schema?.stufen;
  if (st?.muster) {
    try {
      return code.match(new RegExp(st.muster))?.[1] ?? "";
    } catch {
      return "";
    }
  }
  const m = code.match(/^[A-Z]+-\d+([OABCDE])/);
  return m ? m[1] : "";
}

/** Rang einer Stufe (höher = dringlicher), -1 = unbekannt */
export function stufeRang(s: string, schema?: Schema | null): number {
  return (schema?.stufen?.reihenfolge ?? [..."OABCDE"]).indexOf(s);
}

/** Kapitel eines Codes laut Codeliste des Schemas („17 - Sturz“ → „17“) */
export function kapitelVonCode(schema: Schema, code: string): string | null {
  const k = schema.codes[code]?.kapitel ?? "";
  const m = k.match(/^\s*([A-Z]+|\d+)/);
  return m && schema.kapitel[m[1]] ? m[1] : null;
}

/** Fragen, die im Ablauf gestellt werden (Primärabfrage + Kapitelfragen inkl. Wechsel) */
export function fragenImAblauf(schema: Schema, kap: string, a: Antworten, opt: { alle?: boolean } = {}): { phase: string; frage: Frage }[] {
  const out: { phase: string; frage: Frage }[] = [];
  const K = schema.kapitel[kap];
  if (!K) return out;
  if (K.primaerabfrage) for (const f of schema.globale_fragen.phase_4_primaerabfrage ?? []) if (pruefe(f.anzeigen_wenn, a)) out.push({ phase: "Primärabfrage", frage: f });
  const erg = bestimmeCode(schema, kap, a);
  const pfad = erg?.pfad ?? [kap];
  const gesehen = new Set(out.map((x) => x.frage.id));
  const b = erg?.antworten ?? a;
  const beantwortet = (id: string) => a[id] !== undefined && a[id] !== null;
  for (const p of pfad) {
    const KK = schema.kapitel[p];
    if (!KK) continue;
    const sicht = sichtbareFragen(KK, b, schema);
    // Einengen (Beta 59): steht der Code fest, fallen die offenen Fragen weg, die ihn nicht mehr ändern
    let weg: Set<string> | null = null;
    if (!opt.alle) {
      const abg = ableitenIn(schema, p, { ...b });
      const offen = new Set<string>();
      for (const f of KK.fragen) if (abg[f.id] === undefined || abg[f.id] === null) offen.add(f.id);
      if (KK.primaerabfrage) for (const f of schema.globale_fragen.phase_4_primaerabfrage ?? []) if ((abg[f.id] === undefined || abg[f.id] === null) && pruefe(f.anzeigen_wenn, abg)) offen.add(f.id);
      if (codeFest(schema, KK, abg, offen)) {
        const noetig = nochNoetig(KK);
        weg = new Set(KK.fragen.filter((f) => !beantwortet(f.id) && !noetig.has(f.id)).map((f) => f.id));
      }
    }
    for (const f of sicht) {
      if (gesehen.has(f.id) || weg?.has(f.id)) continue;
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
function zufallsAntwort(f: Frage, rnd: () => number, alter: number, pUnbekannt: number, a: Antworten = {}): Wert {
  // Arbeitsunfall: nur, wenn es die Geschichte (der Ort) sagt
  if (f.id === "arbeitsunfall") return "nein";
  if (f.typ === "zahl") {
    if (rnd() < pUnbekannt) return "unbekannt";
    if (f.id === "alter") return alter;
    if (f.id === "ssw") return Math.floor(20 + rnd() * 23);
    return Math.floor(rnd() * 60);
  }
  if (f.typ !== "single" || !f.optionen?.length) return null;
  const alle = optionenFuer(f, a);
  const hatUnb = alle.some((o) => o.wert === "unbekannt");
  if (hatUnb && rnd() < pUnbekannt) return "unbekannt";
  const opts = alle.filter((o) => o.wert !== "unbekannt");
  if (!opts.length) return (alle[0] ?? f.optionen[0]).wert;
  const jaNein = opts.length === 2 && opts.some((o) => o.wert === "ja") && opts.some((o) => o.wert === "nein");
  // „nur Brandalarm“ ist selten (sonst fielen die Patientenfragen zu oft weg)
  if (jaNein && f.id === "nur_alarm") return rnd() < 0.06 ? "ja" : "nein";
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
  if (a.anzahl !== undefined && a.anzahl_patienten !== undefined) a.anzahl = mehrere(a) ? "n" : a.anzahl_patienten;
  // mehrere Verletzte gibt es nur bei mehreren Betroffenen (Beta 59: bei einer Person wird nicht mehr gefragt)
  if (ja("mehrere_verletzte") && a.anzahl_patienten === "1") a.anzahl_patienten = "n";
  // „nur Brandalarm ohne bekannte Verletzte“ passt nicht zu einem Patienten mit Beschwerden
  if (ja("nur_alarm") && (ja("brennt_noch") || ja("mehrere_verletzte") || (a.bw !== undefined && a.bw !== "ja" && a.bw !== "unbekannt") || (a.at !== undefined && a.at !== "normal" && a.at !== "unbekannt")))
    a.nur_alarm = "nein";
  // nicht verletzt (Sturz): keine Verletzungsdetails
  if (a.verletzt === "nein" && (ja("blutung_stark") || ja("fehlstellung"))) a.verletzt = "ja";
  if (ist(kap, "verkehrsunfall", "verletzung", "sturz")) {
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
      // fremdes Codesystem: nur Werte, die es dort als Antwort gibt
      if (f.typ === "single" && f.optionen?.length && !f.optionen.some((o) => o.wert === a[f.id])) a[f.id] = zufallsAntwort(f, rnd, alter, pUnbekannt);
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
      for (const f of sichtbareFragen(KK, a, schema)) {
        if (a[f.id] !== undefined) continue;
        a[f.id] = f.id === "alter" ? alter : zufallsAntwort(f, rnd, alter, pUnbekannt, a);
        neu = true;
      }
    }
    if (!neu) break;
  }
  if (a.alter === undefined) a.alter = alter;
  stimmig();
  // Antworten auf Fragen, die nach den übrigen Antworten gar nicht gestellt würden, fallen weg (Beta 59) – sonst
  // ergäbe die Wahrheit einen Code, den keine Abfrage erreicht (z. B. „nicht verletzt“, aber Kopfverletzung)
  for (let runde = 0; runde < 4; runde++) {
    let weg = false;
    for (const p of bestimmeCode(schema, kap, a)?.pfad ?? [kap]) {
      const KK = schema.kapitel[p];
      if (!KK) continue;
      const b = ableitenIn(schema, p, { ...a });
      for (const f of KK.fragen)
        if (a[f.id] !== undefined && fest[f.id] === undefined && f.anzeigen_wenn && !pruefe(f.anzeigen_wenn, b)) {
          delete a[f.id];
          weg = true;
        }
    }
    if (!weg) break;
  }
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
