/**
 * Codes für Krankentransporte (KTA/KTR/KTx), Überstellungen (SEK-96) und Dienstfahrten (DF-99):
 * feste Liste, was ein Code verlangt (Fahrzeug, Arzt, Sondersignal) und Code-Vorschlag aus den Auftragsdaten.
 */
import { BEREICHE_AMBULANZ } from "../data/model";
import type { KtDaten } from "./kt";

export interface KtCode {
  code: string;
  name: string;
  kapitel: string;
  gruppe: "KT" | "SEK" | "DF";
}

export const KT_KAPITEL: Record<string, string> = {
  "90": "90 – Krankentransport / Einweisung",
  "93": "93 – Fahrt zur Therapie",
  "95": "95 – Heimtransport",
  "96": "96 – Überstellung",
  "99": "99 – Dienstfahrt",
};

const LAGE = ["gehfähig", "Tragstuhl", "liegend", "eigener Rollstuhl"];
const THERAPIE: [string, string][] = [
  ["M", "Chemotherapie"],
  ["S", "Strahlentherapie"],
  ["Y", "Dialyse"],
];

function ktCodes(p: "KTA" | "KTR" | "KTx"): KtCode[] {
  const l: KtCode[] = [];
  const add = (c: string, name: string) => l.push({ code: `${p}-${c}`, name, kapitel: KT_KAPITEL[c.slice(0, 2)], gruppe: "KT" });
  for (let i = 1; i <= 4; i++) add(`90K${i}`, `Krankentransport-${LAGE[i - 1]}`);
  for (let i = 1; i <= 4; i++) add(`90K${i}!`, `Einweisung-${i === 1 ? "gehend" : LAGE[i - 1]} SOFORT`);
  for (const [b, n] of THERAPIE) for (let i = 1; i <= 4; i++) add(`93${b}${i}`, `${n}-${LAGE[i - 1]}`);
  if (p === "KTx") add("95KyA", "Sofortiger Rücktransport durch selbes Team");
  for (let i = 1; i <= 4; i++) {
    add(`95K${i}`, `Stationärer Heimtransport-${LAGE[i - 1]}`);
    add(`95K${i}A`, `Ambulanter Heimtransport-${LAGE[i - 1]}`);
  }
  for (const [b, n] of THERAPIE) for (let i = 1; i <= 4; i++) add(`95${b}${i}`, `${n} Heimtransport-${LAGE[i - 1]}`);
  for (let i = 1; i <= 4; i++) add(`96K${i}`, `Überstellung-${LAGE[i - 1]}`);
  if (p === "KTx") {
    for (let i = 1; i <= 4; i++) add(`96K${i}!`, `Überstellung-${LAGE[i - 1]} SOFORT`);
    add("96K5", "Überstellung mit RTW und Arzt (beigestellt)");
  }
  return l;
}

const SEK: [string, string][] = [
  ["SEK-96K1", "Überstellung-gehfähig"],
  ["SEK-96K2", "Überstellung-Tragstuhl"],
  ["SEK-96K3", "Überstellung-liegend"],
  ["SEK-96K1!", "Überstellung-gehfähig SOFORT"],
  ["SEK-96K2!", "Überstellung-Tragstuhl SOFORT"],
  ["SEK-96K3!", "Überstellung-liegend SOFORT"],
  ["SEK-96K6-SRTW", "Überstellung mit SRTW"],
  ["SEK-96B6-SRTW", "Überstellung mit SRTW mit Sondersignal"],
  ["SEK-96D6", "Notarztbegleitete Überstellung"],
  ["SEK-96K6-SNAW", "Notarztbegleitete Überstellung mit SNAW"],
  ["SEK-96D6-SNAW", "Notarztbegleitete Überstellung mit SNAW"],
  ["SEK-96K7-ITH", "Notarztbegleitete Überstellung mit NAH/ITH"],
  ["SEK-96D7-ITH", "Notarztbegleitete Überstellung mit NAH/ITH"],
  ["SEK-96D8", "Inkubator-/Kinderüberstellung"],
  ["SEK-96K8-SNAW", "Inkubator-/Kinderüberstellung mit SNAW"],
  ["SEK-96D8-SNAW", "Inkubator-/Kinderüberstellung mit SNAW"],
  ["SEK-96K8-ITH", "Inkubator-/Kinderüberstellung mit NAH/ITH"],
  ["SEK-96D8-ITH", "Inkubator-/Kinderüberstellung mit NAH/ITH"],
  ["SEK-96K8-RTW", "Inkubator-/Kinderüberstellung mit RTW"],
];

export const KT_CODES: KtCode[] = [
  ...ktCodes("KTA"),
  ...ktCodes("KTR"),
  ...ktCodes("KTx"),
  ...SEK.map(([code, name]) => ({ code, name, kapitel: KT_KAPITEL["96"], gruppe: "SEK" as const })),
  { code: "DF-99K1", name: "Dienstfahrt", kapitel: KT_KAPITEL["99"], gruppe: "DF" },
  { code: "DF-99K2", name: "Dienstfahrt-Übung", kapitel: KT_KAPITEL["99"], gruppe: "DF" },
  { code: "DF-99K3", name: "Dienstfahrt-GSD", kapitel: KT_KAPITEL["99"], gruppe: "DF" },
];

const NACH_CODE = new Map(KT_CODES.map((c) => [c.code, c]));
export function ktCode(code: string | null | undefined): KtCode | undefined {
  return code ? NACH_CODE.get(code) : undefined;
}

// ---------------------------------------------------------------- Was ein Code verlangt

export type SFahrzeug = "SKTW" | "SRTW" | "SNAW" | "ITH" | "RTW";

export interface CodeInfo {
  gruppe: "KT" | "SEK" | "DF";
  /** SOFORT (!) */
  sofort: boolean;
  /** Fahrt mit Sondersignal (B, D) */
  sondersignal: boolean;
  /** Notarzt begleitet */
  arzt: boolean;
  /** Inkubator-/Kinderüberstellung */
  inkubator: boolean;
  /** Hubschrauber vorgesehen */
  flug: boolean;
  /** im Code festgelegtes Fahrzeug */
  fahrzeug: SFahrzeug | null;
}

export function codeInfo(code: string | null | undefined): CodeInfo {
  const leer: CodeInfo = { gruppe: "KT", sofort: false, sondersignal: false, arzt: false, inkubator: false, flug: false, fahrzeug: null };
  if (!code) return leer;
  if (code.startsWith("DF-")) return { ...leer, gruppe: "DF" };
  const m = code.match(/^SEK-96([KBD])(\d)(!?)(?:-(\w+))?$/);
  if (m) {
    const [, buchstabe, ziffer, ausruf, zusatz] = m;
    const z = Number(ziffer);
    const fahrzeug = (zusatz as SFahrzeug | undefined) ?? (z <= 3 ? "SKTW" : null);
    return {
      gruppe: "SEK",
      sofort: ausruf === "!" || buchstabe !== "K",
      sondersignal: buchstabe === "B" || buchstabe === "D",
      arzt: buchstabe === "D" || z === 7 || (z >= 6 && (zusatz === "SNAW" || zusatz === "ITH")) || (z === 8 && zusatz !== "RTW"),
      inkubator: z === 8,
      flug: zusatz === "ITH",
      fahrzeug,
    };
  }
  return { ...leer, sofort: code.endsWith("!") };
}

// ---------------------------------------------------------------- Vorschlag

const ZIFFER: Record<string, number> = { gehend: 1, sitzend: 2, liegend: 3, rollstuhl: 4 };

/** Überstellung: beide Orte sind Krankenhäuser (oder der Code sagt es) */
export function istUeberstellung(d: KtDaten): boolean {
  if (d.code?.startsWith("SEK-")) return true;
  if (d.code?.startsWith("DF-")) return false;
  return !!d.sek;
}

/**
 * Passender Code zu den Angaben. luftKm = Luftlinie Abholort–Ziel (für den Hubschrauber).
 * Gibt null zurück, wenn noch zu wenig bekannt ist.
 */
export function codeVorschlag(d: KtDaten, luftKm: number): string | null {
  if (d.code?.startsWith("DF-")) return d.code;
  if (!d.lage) return null;
  const n = ZIFFER[d.lage];
  if (istUeberstellung(d)) {
    const s = d.sek ?? { arzt: false, monitoring: false, beatmet: false, inkubator: false, instabil: false, zusage: "" };
    const arzt = s.arzt || s.beatmet;
    // Hubschrauber: weite Strecke und kein Patient, an dem während des Transports dauernd gearbeitet werden muss
    const flug = luftKm > 40 && !s.instabil;
    if (s.inkubator) {
      // stabiles Kind ohne Arzt: RTW (mit Inkubator vom Krankenhaus); sonst ITH oder SNAW
      if (!arzt) return "SEK-96K8-RTW";
      return d.sofort ? (flug ? "SEK-96D8-ITH" : "SEK-96D8") : flug ? "SEK-96K8-ITH" : "SEK-96K8-SNAW";
    }
    if (arzt) return d.sofort ? (flug ? "SEK-96D7-ITH" : "SEK-96D6") : flug ? "SEK-96K7-ITH" : "SEK-96K6-SNAW";
    if (s.monitoring) return d.sofort ? "SEK-96B6-SRTW" : "SEK-96K6-SRTW";
    // eigener Rollstuhl gibt es bei SEK nicht: Tragstuhl
    return `SEK-96K${n === 1 ? 1 : n === 3 ? 3 : 2}${d.sofort ? "!" : ""}`;
  }
  const p = d.art;
  const vonKh = !!d.von?.khId;
  const nachKh = !!d.nach?.khId;
  const therapie = (b: string | undefined) => (b === "DIA" ? "Y" : b === "STR" ? "S" : b === "CHE" ? "M" : null);
  if (!vonKh && nachKh) {
    const t = therapie(d.nach?.bereich);
    if (t) return `${p}-93${t}${n}`;
    return `${p}-90K${n}${d.sofort ? "!" : ""}`;
  }
  if (vonKh && !nachKh) {
    const t = therapie(d.von?.bereich);
    if (t) return `${p}-95${t}${n}`;
    const ambulant = !!d.von?.bereich && d.von.bereich in BEREICHE_AMBULANZ;
    return `${p}-95K${n}${ambulant ? "A" : ""}`;
  }
  if (vonKh && nachKh) return `SEK-96K${n === 1 ? 1 : n === 3 ? 3 : 2}${d.sofort ? "!" : ""}`;
  return `${p}-90K${n}${d.sofort ? "!" : ""}`;
}

/** Kurztext für Listen, z. B. „SEK-96D6 Notarztbegleitete Überstellung“ */
export function codeText(code: string | null | undefined): string {
  const c = ktCode(code);
  return c ? `${c.code} ${c.name}` : (code ?? "");
}
