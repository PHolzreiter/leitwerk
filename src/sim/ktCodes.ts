/**
 * Codes für Krankentransporte und Überstellungen (ab v0.74 über Bedingungen, siehe ktBedingungen.ts):
 * Die Codes kommen aus dem aktiven Codesatz (Abschnitt „kt“ des Abfrageschemas) bzw. aus dem
 * eingebauten LeitWerk-Codesystem. Was ein Code verlangt (Fahrzeug, Arzt, Sondersignal), steht in
 * seinen Bedingungen – nicht mehr im Namen.
 */
import { store } from "../data/store";
import { standardCodesystem } from "../data/standard";
import type { Schema } from "../abfrage/schema";
import { KT_FRAGEN } from "../abfrage/ktGespraech";
import type { KtDaten } from "./kt";
import { bedingungenAus, codeSuchen, istUeberstellungDaten, klaertVon, type KtAbfrageFrage, type KtBed, type KtCodeDef, type KtSatz } from "./ktBedingungen";

export interface KtCode {
  code: string;
  name: string;
  kapitel: string;
  gruppe: "KT" | "SEK";
}

/** Die Abfrage der KT-Hotline, wie sie eingebaut ist */
export function standardKtAbfrage(): KtAbfrageFrage[] {
  return KT_FRAGEN.map((f) => ({ id: f.id, text: f.text, aktiv: true }));
}

let cacheVon: unknown;
let cache: { satz: KtSatz; codes: KtCode[]; nach: Map<string, KtCodeDef> } | null = null;

function satzVon(s: Schema | null | undefined): KtSatz | null {
  const kt = (s as { kt?: KtSatz } | null | undefined)?.kt;
  return kt && Array.isArray(kt.codes) && kt.codes.length ? kt : null;
}

/** Aktiver KT-/SEK-Satz (ab v0.76 eigener Satz, getrennt vom RD): eigene Codes und/oder eigene Abfrage, sonst eingebaut */
export function ktSatz(): KtSatz {
  aktualisieren();
  return cache!.satz;
}

function aktualisieren(): void {
  const roh = store.ktSatzRoh;
  if (cache && cacheVon === roh) return;
  cacheVon = roh;
  const std = satzVon(standardCodesystem()) ?? { codes: [] };
  const eigeneCodes = roh?.codes?.length ? (roh.codes as KtCodeDef[]) : null;
  const eigeneAbfrage = roh?.abfrage?.length ? (roh.abfrage as KtAbfrageFrage[]) : null;
  const satz: KtSatz = { codes: eigeneCodes ?? std.codes, abfrage: eigeneAbfrage ?? (eigeneCodes ? undefined : std.abfrage) };
  cache = {
    satz,
    codes: satz.codes.map((c) => ({ code: c.code, name: c.name, kapitel: c.kapitel ?? "", gruppe: c.bed.fahrt === "ueberstellung" ? "SEK" : "KT" })),
    nach: new Map(satz.codes.map((c) => [c.code, c])),
  };
}

/** Alle Codes des aktiven Satzes */
export function ktCodes(): KtCode[] {
  aktualisieren();
  return cache!.codes;
}

export function ktCodeDef(code: string | null | undefined): KtCodeDef | undefined {
  if (!code) return undefined;
  aktualisieren();
  return cache!.nach.get(code);
}

export function ktCode(code: string | null | undefined): KtCode | undefined {
  if (!code) return undefined;
  aktualisieren();
  return cache!.codes.find((c) => c.code === code);
}

/** Fragen der KT-Abfrage (aktiver Satz oder eingebaut), in ihrer Reihenfolge */
export function ktAbfrage(): KtAbfrageFrage[] {
  const a = ktSatz().abfrage;
  return a?.length ? a : standardKtAbfrage();
}

/** Text einer Frage der Abfrage (eigener Text des Codesatzes, sonst der eingebaute) */
export function ktFrageText(id: string): string | null {
  // erste aktive Frage, die dieses Feld klärt
  const f = ktAbfrage().find((x) => x.aktiv !== false && klaertVon(x).includes(id));
  if (f) return f.text;
  // Feld wird im Satz gar nicht gefragt: kein 🗨 (die neuen Angaben der Aufnahme fragt man trotzdem mit der eingebauten Frage)
  const neu = ["ktArt", "behandlung", "gehfaehig", "transportmittel", "auftrag", "kasse"].includes(id);
  return ktSatz().abfrage?.length && !neu ? null : (standardKtAbfrage().find((x) => x.id === id)?.text ?? null);
}

// ---------------------------------------------------------------- Was ein Code verlangt

export type SFahrzeug = "SKTW" | "SRTW" | "SNAW" | "ITH" | "RTW";

export interface CodeInfo {
  gruppe: "KT" | "SEK";
  /** SOFORT */
  sofort: boolean;
  /** Fahrt mit Sondersignal */
  sondersignal: boolean;
  /** Notarzt begleitet */
  arzt: boolean;
  /** Überwachung (Monitor), ohne Arzt */
  monitoring: boolean;
  /** Inkubator-/Kinderüberstellung */
  inkubator: boolean;
  /** Hubschrauber vorgesehen */
  flug: boolean;
  /** im Code festgelegtes Fahrzeug (RTW mit Notarzt aus dem Regelrettungsdienst: null) */
  fahrzeug: SFahrzeug | null;
}

const FZ: Record<string, SFahrzeug | null> = { sktw: "SKTW", srtw: "SRTW", snaw: "SNAW", ith: "ITH", rtw_na: null, ktw: null };

export function codeInfo(code: string | null | undefined): CodeInfo {
  const c = ktCodeDef(code);
  const b = c?.bed ?? {};
  const sek = b.fahrt === "ueberstellung";
  const fahrzeug = b.fahrzeug ? FZ[b.fahrzeug] : sek && b.begleitung !== "notarzt" && b.begleitung !== "monitoring" ? "SKTW" : null;
  return {
    gruppe: sek ? "SEK" : "KT",
    sofort: b.zeit === "sofort",
    sondersignal: b.sondersignal === "ja",
    arzt: b.begleitung === "notarzt",
    monitoring: b.begleitung === "monitoring",
    inkubator: b.inkubator === "ja",
    flug: b.fahrzeug === "ith",
    fahrzeug,
  };
}

// ---------------------------------------------------------------- Vorschlag

/** Überstellung: beide Orte sind Krankenhäuser (oder der Code sagt es) */
export function istUeberstellung(d: KtDaten): boolean {
  if (d.code && ktCodeDef(d.code)?.bed.fahrt === "ueberstellung") return true;
  return istUeberstellungDaten(d);
}

/** Bedingungen der Angaben (null, solange die Lage fehlt) */
export function ktBedingungen(d: KtDaten, luftKm: number): KtBed | null {
  return bedingungenAus(d, luftKm);
}

/**
 * Der eine Code, dessen Bedingungen zu den Angaben passen. luftKm = Luftlinie Abholort–Ziel (für den Hubschrauber).
 * null, wenn noch zu wenig bekannt ist oder im Codesatz kein (eindeutiger) Code hinterlegt ist.
 */
export function codeVorschlag(d: KtDaten, luftKm: number, fzTyp?: string | null): string | null {
  const b = bedingungenAus(d, luftKm, fzTyp);
  if (!b) return null;
  const r = codeSuchen(ktSatz().codes, b);
  return "code" in r ? r.code.code : null;
}

/** Warum es keinen Code gibt (für die Anzeige), sonst null */
export function codeFehlt(d: KtDaten, luftKm: number): { fehler: "keiner" | "mehrdeutig"; bed: KtBed; kandidaten: string[] } | null {
  const b = bedingungenAus(d, luftKm);
  if (!b) return null;
  const r = codeSuchen(ktSatz().codes, b);
  return "fehler" in r ? { fehler: r.fehler, bed: b, kandidaten: r.kandidaten.map((c) => c.code) } : null;
}

/** Kurztext für Listen, z. B. „SEK-96D6 Notarztbegleitete Überstellung“ */
export function codeText(code: string | null | undefined): string {
  const c = ktCode(code);
  return c ? `${c.code} ${c.name}` : (code ?? "");
}
