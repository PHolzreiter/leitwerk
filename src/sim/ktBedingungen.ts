/**
 * Krankentransport- und Überstellungs-Codes über Bedingungen (v0.74):
 * Die Bedeutung steckt in festen Bedingungen (Fahrt, Lage, Therapie, Zeit, Begleitung, Fahrzeug …).
 * Ein Code ist nur ein frei wählbarer Name mit diesen Bedingungen. Aus den Angaben eines Auftrags
 * werden die Bedingungen bestimmt, und es gilt der eine Code, dessen Bedingungen genau passen.
 * Eine Bedingung, die ein Code nicht festlegt, gilt für ihn als „beliebig“; passen mehrere Codes,
 * gilt der genaueste (die meisten festgelegten Bedingungen). Gibt es keinen oder zwei gleich genaue,
 * ist der Codesatz unvollständig bzw. widersprüchlich – das zeigt die Prüfung.
 */
import { BEREICHE_AMBULANZ } from "../data/model";
import { einrichtung } from "../data/klinik";
import type { KtArt, KtDaten, KtLage } from "./kt";

export const KT_BEDINGUNGEN = {
  org: { label: "Organisation", werte: { rk: "Rotes Kreuz", asb: "ASB", egal: "egal" } },
  fahrt: { label: "Fahrt", werte: { zum_kh: "zum Krankenhaus / Arzt", therapie: "zur Therapie", heim: "Heimtransport", ueberstellung: "Überstellung (Krankenhaus → Krankenhaus)" } },
  therapie: { label: "Therapie", werte: { keine: "keine", chemo: "Chemotherapie", strahlen: "Strahlentherapie", dialyse: "Dialyse" } },
  lage: { label: "Lage", werte: { gehend: "gehend", sitzend: "sitzend (Tragstuhl)", liegend: "liegend", rollstuhl: "eigener Rollstuhl" } },
  zeit: { label: "Zeit", werte: { geplant: "geplant", sofort: "SOFORT (ohne Blaulicht)" } },
  heim: { label: "Heimtransport", werte: { stationaer: "nach stationärem Aufenthalt", ambulant: "nach ambulanter Behandlung" } },
  begleitung: { label: "Begleitung", werte: { keine: "keine", monitoring: "Überwachung (Monitor)", notarzt: "Notarzt" } },
  fahrzeug: { label: "Fahrzeug", werte: { ktw: "KTW", sktw: "SKTW", srtw: "SRTW", snaw: "SNAW", rtw_na: "RTW mit Notarzt (Regelrettungsdienst)", ith: "NAH / ITH" } },
  sondersignal: { label: "Sondersignal", werte: { nein: "nein", ja: "ja" } },
  inkubator: { label: "Inkubator / Kind", werte: { nein: "nein", ja: "ja" } },
} as const;

export type KtBedKey = keyof typeof KT_BEDINGUNGEN;
export const KT_BED_KEYS = Object.keys(KT_BEDINGUNGEN) as KtBedKey[];
/** vollständige Bedingungen eines Auftrags */
export type KtBed = { [K in KtBedKey]: keyof (typeof KT_BEDINGUNGEN)[K]["werte"] & string };
/** Bedingungen eines Codes: fehlt eine, ist sie beliebig */
export type KtCodeBed = Partial<KtBed>;

export interface KtCodeDef {
  code: string;
  name: string;
  /** Überschrift in der Auswahl, z. B. „90 – Krankentransport“ */
  kapitel?: string;
  bed: KtCodeBed;
}

/** Frage der KT-Abfrage (id = Feld der Aufnahme, text frei) */
export interface KtAbfrageFrage {
  id: string;
  text: string;
  aktiv?: boolean;
}

export interface KtSatz {
  codes: KtCodeDef[];
  abfrage?: KtAbfrageFrage[];
}

/** Welche Bedingungen eine Frage der Aufnahme klärt */
export const FRAGE_KLAERT: Record<string, KtBedKey[]> = {
  art: ["org"],
  von: ["fahrt", "therapie", "heim"],
  nach: ["fahrt", "therapie", "heim"],
  lage: ["lage"],
  sofort: ["zeit"],
  arzt: ["begleitung", "fahrzeug", "sondersignal"],
  monitoring: ["begleitung", "fahrzeug", "sondersignal"],
  zustand: ["begleitung", "fahrzeug", "sondersignal", "inkubator"],
  inkubator: ["inkubator"],
  stabil: ["fahrzeug"],
};
/** Fragen, ohne die ein Auftrag im Spiel nicht funktioniert */
export const PFLICHT_FRAGEN = ["von", "nach", "lage"];

// ---------------------------------------------------------------- Bedingungen aus den Angaben

const ORG: Record<KtArt, KtBed["org"]> = { KTR: "rk", KTA: "asb", KTx: "egal" };

function therapieVon(bereich: string | undefined): KtBed["therapie"] | null {
  return bereich === "DIA" ? "dialyse" : bereich === "STR" ? "strahlen" : bereich === "CHE" ? "chemo" : null;
}

/** Eingaben, aus denen die Bedingungen folgen (auch für die Prüfung aller Möglichkeiten) */
interface Eingabe {
  art: KtArt;
  ueberstellung: boolean;
  fahrt: "zum_kh" | "therapie" | "heim";
  therapie: KtBed["therapie"];
  ambulant: boolean;
  lage: KtLage;
  sofort: boolean;
  arzt: boolean;
  monitoring: boolean;
  inkubator: boolean;
  flug: boolean;
}

function ausEingabe(e: Eingabe): KtBed {
  const zeit: KtBed["zeit"] = e.sofort ? "sofort" : "geplant";
  if (!e.ueberstellung) {
    return {
      org: ORG[e.art],
      fahrt: e.fahrt,
      therapie: e.fahrt === "zum_kh" ? "keine" : e.therapie,
      lage: e.lage,
      zeit,
      heim: e.fahrt === "heim" && e.therapie === "keine" && e.ambulant ? "ambulant" : "stationaer",
      begleitung: "keine",
      fahrzeug: "ktw",
      sondersignal: "nein",
      inkubator: "nein",
    };
  }
  // Überstellung: NAH/ITH nur bei SOFORT und weiter Strecke, geplant mit SNAW; Arzt bei SOFORT im Regelrettungsdienst
  const sek = { org: ORG[e.art], fahrt: "ueberstellung" as const, therapie: "keine" as const, heim: "stationaer" as const, zeit };
  const mitArzt = (ink: boolean): KtBed => ({
    ...sek,
    lage: e.lage === "rollstuhl" ? "sitzend" : e.lage,
    begleitung: "notarzt",
    fahrzeug: e.sofort ? (e.flug ? "ith" : "rtw_na") : "snaw",
    sondersignal: e.sofort ? "ja" : "nein",
    inkubator: ink ? "ja" : "nein",
  });
  if (e.inkubator) return mitArzt(true);
  if (e.arzt) return mitArzt(false);
  // eigener Rollstuhl gibt es bei Überstellungen nicht: Tragstuhl
  const lage: KtLage = e.lage === "rollstuhl" ? "sitzend" : e.lage;
  if (e.monitoring) return { ...sek, lage, begleitung: "monitoring", fahrzeug: "srtw", sondersignal: e.sofort ? "ja" : "nein", inkubator: "nein" };
  return { ...sek, lage, begleitung: "keine", fahrzeug: "sktw", sondersignal: "nein", inkubator: "nein" };
}

/** Überstellung: zwischen zwei Krankenhäusern bzw. mit Überstellungs-Angaben */
export function istUeberstellungDaten(d: KtDaten): boolean {
  return !!d.sek || (!!d.von?.khId && !!d.nach?.khId);
}

/** Bedingungen eines Auftrags (null, solange die Lage noch nicht bekannt ist). luftKm = Luftlinie Abholort–Ziel */
export function bedingungenAus(d: KtDaten, luftKm: number): KtBed | null {
  if (!d.lage) return null;
  const s = d.sek;
  const vonKh = !!d.von?.khId;
  const nachKh = !!d.nach?.khId;
  let fahrt: Eingabe["fahrt"] = "zum_kh";
  let therapie: KtBed["therapie"] = "keine";
  let ambulant = false;
  if (!vonKh && nachKh) {
    const t = therapieVon(d.nach?.bereich);
    if (t) {
      fahrt = "therapie";
      therapie = t;
    }
  } else if (vonKh && !nachKh) {
    fahrt = "heim";
    therapie = therapieVon(d.von?.bereich) ?? "keine";
    const b = d.von?.bereich;
    const typ = b ? einrichtung(b)?.typ : undefined;
    ambulant = !!b && (b in BEREICHE_AMBULANZ || typ === "ambulanz" || typ === "funktionsbereich");
  }
  return ausEingabe({
    art: d.art,
    ueberstellung: istUeberstellungDaten(d),
    fahrt,
    therapie,
    ambulant,
    lage: d.lage,
    sofort: d.sofort,
    arzt: !!(s?.arzt || s?.beatmet),
    monitoring: !!s?.monitoring,
    inkubator: !!s?.inkubator,
    // Hubschrauber: weite Strecke und kein Patient, an dem während des Transports dauernd gearbeitet werden muss
    flug: luftKm > 40 && !s?.instabil,
  });
}

/** Alle Bedingungen, die im Spiel vorkommen können (gefragt = Bedingungen, die die Abfrage klärt) */
export function moeglicheBedingungen(gefragt?: Set<KtBedKey>): KtBed[] {
  const f = (k: KtBedKey) => !gefragt || gefragt.has(k);
  const arten: KtArt[] = f("org") ? ["KTR", "KTA", "KTx"] : ["KTx"];
  const lagen: KtLage[] = ["gehend", "sitzend", "liegend", "rollstuhl"];
  const zeiten = f("zeit") ? [false, true] : [false];
  const out = new Map<string, KtBed>();
  const add = (e: Eingabe) => {
    const b = ausEingabe(e);
    out.set(JSON.stringify(b), b);
  };
  const basis = { ueberstellung: false, therapie: "keine" as KtBed["therapie"], ambulant: false, arzt: false, monitoring: false, inkubator: false, flug: false };
  const therapien: KtBed["therapie"][] = f("therapie") ? ["chemo", "strahlen", "dialyse"] : [];
  for (const art of arten)
    for (const lage of lagen)
      for (const sofort of zeiten) {
        add({ ...basis, art, lage, sofort, fahrt: "zum_kh" });
        for (const t of therapien) {
          add({ ...basis, art, lage, sofort, fahrt: "therapie", therapie: t });
          add({ ...basis, art, lage, sofort, fahrt: "heim", therapie: t });
        }
        add({ ...basis, art, lage, sofort, fahrt: "heim", ambulant: false });
        if (f("heim")) add({ ...basis, art, lage, sofort, fahrt: "heim", ambulant: true });
      }
  // Überstellungen (Organisation spielt keine Rolle)
  for (const lage of lagen)
    for (const sofort of zeiten) {
      const s = { ...basis, art: "KTx" as KtArt, ueberstellung: true, fahrt: "zum_kh" as const, lage, sofort };
      add(s);
      if (f("begleitung")) {
        add({ ...s, monitoring: true });
        for (const flug of f("fahrzeug") ? [false, true] : [false]) {
          add({ ...s, arzt: true, flug });
          if (f("inkubator")) add({ ...s, inkubator: true, flug });
        }
      }
    }
  return [...out.values()];
}

// ---------------------------------------------------------------- Code finden

export function passt(c: KtCodeDef, b: KtBed): boolean {
  for (const k of KT_BED_KEYS) {
    const v = c.bed[k];
    if (v !== undefined && v !== b[k]) return false;
  }
  return true;
}
const genauigkeit = (c: KtCodeDef) => KT_BED_KEYS.filter((k) => c.bed[k] !== undefined).length;

export type KtSuche = { code: KtCodeDef } | { fehler: "keiner" | "mehrdeutig"; kandidaten: KtCodeDef[] };

/** Den einen Code zu den Bedingungen suchen */
export function codeSuchen(codes: KtCodeDef[], b: KtBed): KtSuche {
  const p = codes.filter((c) => passt(c, b));
  if (!p.length) return { fehler: "keiner", kandidaten: [] };
  const g = Math.max(...p.map(genauigkeit));
  const beste = p.filter((c) => genauigkeit(c) === g);
  return beste.length === 1 ? { code: beste[0] } : { fehler: "mehrdeutig", kandidaten: beste };
}

/** Bedingungen als kurzer Text: „Überstellung · liegend · SOFORT“ */
export function bedText(b: KtCodeBed, nur?: KtBedKey[]): string {
  const keys = nur ?? KT_BED_KEYS;
  return keys
    .filter((k) => b[k] !== undefined)
    .filter((k) => !(k === "sondersignal" && b[k] === "nein") && !(k === "inkubator" && b[k] === "nein") && !(k === "therapie" && b[k] === "keine") && !(k === "begleitung" && b[k] === "keine"))
    .map((k) => (KT_BEDINGUNGEN[k].werte as Record<string, string>)[b[k] as string] ?? b[k])
    .join(" · ");
}

/**
 * Nur die Bedingungen, die für einen neuen Code wirklich zählen (der Rest folgt daraus bzw. ist beliebig):
 * Krankentransport ohne Fahrzeug/Begleitung, Zeit nur bei der Fahrt zum Krankenhaus, „stationär/ambulant“ nur beim Heimtransport;
 * Überstellung ohne Organisation und Therapie, Lage nur ohne Begleitung.
 */
export function kernBed(b: KtBed): KtCodeBed {
  if (b.fahrt !== "ueberstellung") {
    const k: KtCodeBed = { org: b.org, fahrt: b.fahrt, lage: b.lage };
    if (b.fahrt === "zum_kh") k.zeit = b.zeit;
    else k.therapie = b.therapie;
    if (b.fahrt === "heim" && b.therapie === "keine") k.heim = b.heim;
    return k;
  }
  const k: KtCodeBed = { fahrt: "ueberstellung", begleitung: b.begleitung, fahrzeug: b.fahrzeug, zeit: b.zeit, sondersignal: b.sondersignal, inkubator: b.inkubator };
  if (b.begleitung === "keine") k.lage = b.lage;
  return k;
}

// ---------------------------------------------------------------- Prüfung eines Satzes

export interface KtPruefung {
  fehler: string[];
  hinweise: string[];
  /** fehlende Codes (nur die zählenden Bedingungen, je eine Zeile in fehler – gleiche Reihenfolge) */
  fehlend: KtCodeBed[];
}

/** Welche Bedingungen klärt die (aktive) Abfrage? */
export function gefragteBedingungen(abfrage: KtAbfrageFrage[]): Set<KtBedKey> {
  const s = new Set<KtBedKey>();
  for (const f of abfrage) if (f.aktiv !== false) for (const k of FRAGE_KLAERT[f.id] ?? []) s.add(k);
  // Fahrzeug und Sondersignal folgen aus der Begleitung und der Strecke
  if (s.has("begleitung")) s.add("sondersignal");
  return s;
}

/** Ist der Codesatz vollständig und eindeutig, passt die Abfrage dazu? */
export function pruefeKtSatz(satz: KtSatz, standardAbfrage: KtAbfrageFrage[]): KtPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const codes = satz.codes;
  const abfrage = satz.abfrage?.length ? satz.abfrage : standardAbfrage;
  // Pflichtangaben
  const namen = new Map<string, number>();
  codes.forEach((c, i) => {
    if (!c.code.trim()) fehler.push(`Code Nr. ${i + 1}: ohne Namen`);
    else namen.set(c.code.trim().toUpperCase(), (namen.get(c.code.trim().toUpperCase()) ?? 0) + 1);
    if (!c.bed.fahrt) fehler.push(`${c.code || `Code Nr. ${i + 1}`}: Bedingung „Fahrt“ fehlt`);
    for (const k of KT_BED_KEYS) {
      const v = c.bed[k];
      if (v !== undefined && !(v in KT_BEDINGUNGEN[k].werte)) fehler.push(`${c.code}: unbekannter Wert „${v}“ bei ${KT_BEDINGUNGEN[k].label}`);
    }
  });
  for (const [n, z] of namen) if (z > 1) fehler.push(`Der Code ${n} kommt ${z}× vor`);
  // gleiche Bedingungen
  const gleich = new Map<string, string[]>();
  for (const c of codes) {
    const key = JSON.stringify(KT_BED_KEYS.map((k) => c.bed[k] ?? "*"));
    gleich.set(key, [...(gleich.get(key) ?? []), c.code]);
  }
  for (const l of gleich.values()) if (l.length > 1) fehler.push(`Gleiche Bedingungen: ${l.join(", ")} – nur einer davon kann gelten`);
  // Abfrage: Pflichtfragen
  for (const id of PFLICHT_FRAGEN) if (!abfrage.some((f) => f.id === id && f.aktiv !== false)) fehler.push(`Abfrage: die Frage „${id === "von" ? "Abholort" : id === "nach" ? "Ziel" : "Lage"}“ fehlt – ohne sie geht kein Transport`);
  // jede mögliche Kombination genau ein Code
  const gefragt = gefragteBedingungen(abfrage);
  const fehlendMap = new Map<string, KtCodeBed>();
  const mehrdeutig = new Set<string>();
  for (const b of moeglicheBedingungen(gefragt)) {
    const r = codeSuchen(codes, b);
    if ("fehler" in r) {
      if (r.fehler === "keiner") {
        const k = kernBed(b);
        fehlendMap.set(JSON.stringify(k), k);
      } else mehrdeutig.add(r.kandidaten.map((c) => c.code).join(", "));
    }
  }
  const fehlend = [...fehlendMap.values()];
  if (fehlend.length) {
    for (const b of fehlend.slice(0, 12)) fehler.push(`Kein Code für: ${bedText(b)}`);
    if (fehlend.length > 12) fehler.push(`… und ${fehlend.length - 12} weitere Kombinationen ohne Code`);
  }
  for (const m of mehrdeutig) fehler.push(`Nicht eindeutig: ${m} passen gleich gut`);
  // Unterscheidet ein Code nach etwas, das die Abfrage nicht fragt?
  const ungefragt = new Set<KtBedKey>();
  for (const c of codes) for (const k of KT_BED_KEYS) if (c.bed[k] !== undefined && !gefragt.has(k) && k !== "fahrzeug" && k !== "sondersignal") ungefragt.add(k);
  for (const k of ungefragt) hinweise.push(`Die Codes unterscheiden nach „${KT_BEDINGUNGEN[k].label}“, aber die Abfrage fragt das nicht – es gilt immer der Standardwert`);
  // Codes, die nie automatisch gewählt werden
  const erreichbar = new Set<string>();
  for (const b of moeglicheBedingungen(gefragt)) {
    const r = codeSuchen(codes, b);
    if ("code" in r) erreichbar.add(r.code.code);
  }
  const nie = codes.filter((c) => !erreichbar.has(c.code)).map((c) => c.code);
  if (nie.length) hinweise.push(`Nie automatisch gewählt (nur von Hand): ${nie.slice(0, 10).join(", ")}${nie.length > 10 ? " …" : ""}`);
  return { fehler, hinweise, fehlend };
}
