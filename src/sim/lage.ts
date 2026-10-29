/**
 * „Die Lage lebt“: verborgener Zustand der Patienten eines Einsatzes und wie er sich
 * mit der Zeit verändert. Das Programm entscheidet, was passiert – Anrufer und
 * Besatzungen erzählen es nur.
 */
import { mehrere, type Antworten } from "../abfrage/schema";
import { ist, thema } from "../abfrage/themen";
import type { AnleitungTyp, FallVariante, NaBedarf } from "../abfrage/faelle";

export type Bewusstsein = "ja" | "getruebt" | "nein";
export type Atmung = "normal" | "abnorm" | "agonal" | "keine";
export type Sichtung = "rot" | "gelb" | "gruen";

export interface LagePatient {
  nr: number;
  geschlecht: "m" | "w";
  alter: number;
  bw: Bewusstsein;
  at: Atmung;
  sichtung: Sichtung;
}

export interface LageEreignis {
  um: number;
  art: "verschlechterung" | "besserung";
  patient: number;
  bw: Bewusstsein;
  at: Atmung;
  eingetreten: boolean;
  /** Fallkatalog: neue Sichtung, Lagebild, NA-Bedarf, Variante, Text des Anrufers */
  sichtung?: Sichtung;
  kern?: string;
  na?: NaBedarf;
  wechselZu?: string;
  text?: string;
  /** gehört zu dieser Variante (wechselt die Variante, entfällt es) */
  variante?: string;
  chance?: number;
  mitAnleitung?: { typ: AnleitungTyp; chance: number };
  chanceOhneNa?: number;
  nurMitNa?: boolean;
  /** nur, solange kein NA vor Ort ist (Verschlechterung ohne Notarzt) */
  nurOhneNa?: boolean;
  /** Ereignis ändert nichts am Patienten (z. B. Geburt erfolgt) */
  nurText?: boolean;
}

/** Fall aus dem Katalog: aktuelle Variante, Lagebild und Bedarf */
export interface LageFall {
  id: string;
  variante: string;
  kern: string;
  na: NaBedarf;
  /** Anleitungen am Telefon: Typ → Zeitpunkt */
  anleitungen: Partial<Record<AnleitungTyp, number>>;
  /** Verschlechterung ohne NA ist schon eingeplant */
  ohneNaGeplant?: boolean;
  /** Entscheidung: NA begleitet den Transport */
  naMit?: boolean;
}

export interface Lage {
  patienten: LagePatient[];
  /** So viele Betroffene glaubt der Anrufer */
  gemeldet: number;
  /** Anrufer irrt sich von Anfang an */
  irrtum: "keineRea" | "mehrPatienten" | null;
  ereignisse: LageEreignis[];
  /** erstes Fahrzeug vor Ort: ab jetzt kennt die Besatzung die ganze Lage */
  aufgedeckt: boolean;
  verlauf: { zeit: number; text: string }[];
  /** Patient zu schwer für die normale Trage (ca. 150 kg und mehr): BIT nötig */
  bit?: boolean;
  /** Einsatz aus dem Fallkatalog */
  fall?: LageFall;
}

export type Komplikationen = "ruhig" | "normal" | "fordernd";

const FAKTOR: Record<Komplikationen, number> = { ruhig: 0.3, normal: 1, fordernd: 2 };
const MIN = 60_000;

function zufall(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function istStillstand(p: { bw: string; at: string }): boolean {
  return p.at === "keine" || p.at === "agonal";
}

export function sichtungFuer(bw: Bewusstsein, at: Atmung, kritisch: boolean): Sichtung {
  if (bw === "nein" || at !== "normal") return "rot";
  if (bw === "getruebt") return kritisch ? "rot" : "gelb";
  return kritisch ? "gelb" : Math.random() < 0.5 ? "gelb" : "gruen";
}

/** Kapitel, bei denen es oft mehr Betroffene gibt, als gemeldet werden */
const MEHRERE = ["verkehrsunfall", "ecall", "brand", "gefahrstoff", "eingeklemmt", "alpin"];
/** Kapitel, bei denen sich der Zustand wieder bessern kann */
const BESSERUNG = ["krampf", "bewusstlos", "zucker", "psych", "krank"];

/**
 * Lage zu einem neuen Einsatz: Patient(en) aus den Antworten der „Wahrheit“ und
 * mögliche Veränderungen, je nach Einstellung „Komplikationen“.
 */
export function lageErzeugen(kapitel: string, a: Antworten, jetzt: number, kritisch: boolean, stufe: Komplikationen): Lage {
  const f = FAKTOR[stufe] ?? 1;
  const bw = (["ja", "getruebt", "nein"].includes(String(a.bw)) ? a.bw : "ja") as Bewusstsein;
  const at = (["normal", "abnorm", "agonal", "keine"].includes(String(a.at)) ? a.at : "normal") as Atmung;
  const geschlecht: "m" | "w" = a.geschlecht === "w" ? "w" : a.geschlecht === "m" ? "m" : Math.random() < 0.5 ? "w" : "m";
  const alter = typeof a.alter === "number" ? a.alter : Math.round(zufall(20, 85));
  const lage: Lage = {
    patienten: [{ nr: 1, geschlecht, alter, bw, at, sichtung: sichtungFuer(bw, at, kritisch) }],
    gemeldet: 1,
    irrtum: null,
    ereignisse: [],
    aufgedeckt: false,
    verlauf: [],
  };
  const p0 = lage.patienten[0];

  // Mehrere Betroffene (laut Anrufer)
  const n = mehrere(a) ? 2 + Math.floor(Math.random() * 3) : 1;
  lage.gemeldet = n;
  const weitere = (anzahl: number) => {
    for (let i = 0; i < anzahl; i++) {
      const schwer = Math.random() < 0.3;
      const pb: Bewusstsein = schwer ? (Math.random() < 0.5 ? "getruebt" : "nein") : "ja";
      const pa: Atmung = schwer && Math.random() < 0.5 ? "abnorm" : "normal";
      lage.patienten.push({
        nr: lage.patienten.length + 1,
        geschlecht: Math.random() < 0.5 ? "w" : "m",
        alter: Math.round(zufall(8, 80)),
        bw: pb,
        at: pa,
        sichtung: sichtungFuer(pb, pa, schwer),
      });
    }
  };
  weitere(n - 1);

  // Irrtum: Anrufer hält es für einen Kreislaufstillstand, ist es aber nicht
  if (istStillstand(p0) && Math.random() < 0.2 * f) {
    lage.irrtum = "keineRea";
    p0.bw = Math.random() < 0.5 ? "getruebt" : "nein";
    p0.at = "abnorm";
    p0.sichtung = "rot";
  } else if (MEHRERE.includes(thema(kapitel)) && Math.random() < 0.25 * f) {
    // Irrtum: mehr Betroffene als gemeldet
    lage.irrtum = "mehrPatienten";
    weitere(1 + Math.floor(Math.random() * 3));
  }

  // selten: Patient zu schwer für die normale Trage – BIT wird nachgefordert
  if (lage.patienten.length === 1 && p0.alter >= 25 && !istStillstand(p0) && Math.random() < 0.003 * Math.max(0.5, f)) lage.bit = true;

  // Verlauf: Verschlechterung bzw. Besserung im Lauf des Einsatzes
  if (!istStillstand(p0) && Math.random() < 0.1 * f) {
    const stillstand = Math.random() < (kritisch ? 0.4 : 0.15);
    const nbw: Bewusstsein = stillstand || p0.bw === "getruebt" ? "nein" : "getruebt";
    const nat: Atmung = stillstand ? (Math.random() < 0.5 ? "agonal" : "keine") : p0.at === "normal" ? "abnorm" : p0.at;
    lage.ereignisse.push({ um: jetzt + zufall(3, 14) * MIN, art: "verschlechterung", patient: 1, bw: nbw, at: nat, eingetreten: false });
  } else if (BESSERUNG.includes(thema(kapitel)) && p0.bw !== "ja" && !istStillstand(p0) && Math.random() < 0.25 * f) {
    lage.ereignisse.push({ um: jetzt + zufall(2, 8) * MIN, art: "besserung", patient: 1, bw: "ja", at: "normal", eingetreten: false });
  }
  return lage;
}

/** Lage aus einem Fall des Katalogs: Patient, Zeitleiste und Bedarf stehen im Fall */
export function lageAusFall(fallId: string, v: FallVariante, a: Antworten, jetzt: number): Lage {
  const gueltig = <T extends string>(x: unknown, l: readonly T[], d: T): T => (l.includes(x as T) ? (x as T) : d);
  const bw = gueltig(v.wahr?.bw ?? a.bw, ["ja", "getruebt", "nein"] as const, "ja");
  const at = gueltig(v.wahr?.at ?? a.at, ["normal", "abnorm", "agonal", "keine"] as const, "normal");
  const geschlecht: "m" | "w" = a.geschlecht === "w" ? "w" : a.geschlecht === "m" ? "m" : Math.random() < 0.5 ? "w" : "m";
  const alter = typeof a.alter === "number" ? a.alter : Math.round(zufall(20, 85));
  const lage: Lage = {
    patienten: [{ nr: 1, geschlecht, alter, bw, at, sichtung: v.sichtung }],
    gemeldet: 1,
    irrtum: null,
    ereignisse: [],
    aufgedeckt: false,
    verlauf: [],
    fall: { id: fallId, variante: v.id, kern: v.lage, na: v.na, anleitungen: {} },
  };
  ereignisseEinplanen(lage, v, jetzt);
  return lage;
}

/** Zeitleiste einer Variante einplanen (Minuten ab „start“) */
export function ereignisseEinplanen(l: Lage, v: FallVariante, start: number): void {
  const p0 = l.patienten[0];
  for (const ev of v.verlauf ?? []) {
    const nur = ev.bw === undefined && ev.at === undefined && ev.sichtung === undefined;
    l.ereignisse.push({
      um: start + zufall(ev.nachMin[0], ev.nachMin[1]) * MIN,
      art: ev.art ?? "besserung",
      patient: 1,
      bw: ev.bw ?? p0.bw,
      at: ev.at ?? p0.at,
      eingetreten: false,
      sichtung: ev.sichtung,
      kern: ev.lage,
      na: ev.na,
      wechselZu: ev.wechselZu,
      text: ev.text,
      variante: v.id,
      chance: ev.chance,
      mitAnleitung: ev.mitAnleitung,
      chanceOhneNa: ev.chanceOhneNa,
      nurMitNa: ev.nurMitNa,
      nurText: nur,
    });
  }
  l.ereignisse.sort((x, y) => x.um - y.um);
}

/** Kurztext eines Patienten, z. B. „Mann, ca. 71 J., benommen, atmet schwer (rot)“ */
export function patientText(p: LagePatient): string {
  const bw = { ja: "wach", getruebt: "benommen", nein: "bewusstlos" }[p.bw];
  const at = { normal: "atmet normal", abnorm: "atmet schwer", agonal: "Schnappatmung", keine: "atmet nicht" }[p.at];
  const wer = p.alter < 14 ? (p.geschlecht === "w" ? "Mädchen" : "Bub") : p.geschlecht === "w" ? "Frau" : "Mann";
  return `${wer}, ca. ${p.alter} J., ${bw}, ${at} (${p.sichtung === "gruen" ? "grün" : p.sichtung})`;
}

/** Lagemeldung der ersten Besatzung beim Eintreffen (nur wenn sie etwas Neues zu melden hat) */
export function lagemeldungBeimEintreffen(l: Lage, angenommenRea: boolean): string | null {
  const p0 = l.patienten[0];
  if (l.irrtum === "keineRea" || (angenommenRea && !istStillstand(p0))) {
    return `Keine Reanimation – Patient ${p0.bw === "ja" ? "wach" : p0.bw === "getruebt" ? "benommen" : "bewusstlos"}, atmet${p0.at === "abnorm" ? " schwer" : ""}.`;
  }
  if (!angenommenRea && istStillstand(p0)) return "Patient reanimationspflichtig, wir beginnen mit der Reanimation.";
  if (l.patienten.length > l.gemeldet) {
    const z = { rot: 0, gelb: 0, gruen: 0 };
    for (const p of l.patienten) z[p.sichtung]++;
    const teile = [z.rot && `${z.rot}× rot`, z.gelb && `${z.gelb}× gelb`, z.gruen && `${z.gruen}× grün`].filter(Boolean).join(", ");
    return `Lagemeldung: ${l.patienten.length} Betroffene statt ${l.gemeldet}, davon ${teile} – benötigen weitere Rettungsmittel.`;
  }
  return null;
}

/** Braucht dieser Patient einen Notarzt? */
export function naNoetig(p: { bw: string; at: string }): boolean {
  return istStillstand(p) || p.bw === "nein" || (p.bw === "getruebt" && p.at !== "normal");
}

/** Bedarf an Notärzten und transportfähigen Fahrzeugen für die ganze Lage */
export function bedarf(l: Lage): { na: number; transport: number } {
  const na = Math.min(3, l.patienten.filter(naNoetig).length);
  const rg = l.patienten.filter((p) => p.sichtung !== "gruen").length;
  const gruen = l.patienten.length - rg;
  return { na, transport: Math.max(1, rg + Math.ceil(gruen / 3)) };
}

/** Lagemeldung der Besatzung (Funkstil, ohne „Hier …“/„kommen“) */
export function lagemeldungText(l: Lage, kapitel: string, fehlt: { na: number; rtw: number; bit?: number }, naStorno: boolean): string {
  const teile: string[] = [];
  const p0 = l.patienten[0];
  if (l.patienten.length > 1) {
    const z = { rot: 0, gelb: 0, gruen: 0 };
    for (const p of l.patienten) z[p.sichtung]++;
    const s = [z.rot && `${z.rot}× rot`, z.gelb && `${z.gelb}× gelb`, z.gruen && `${z.gruen}× grün`].filter(Boolean).join(", ");
    teile.push(`${ist(kapitel, "verkehrsunfall", "ecall") ? "Verkehrsunfall, " : ""}${l.patienten.length} Betroffene, davon ${s}`);
  } else if (l.fall && !(istStillstand(p0) && !/Reanimation|verstorben|Kreislauf/i.test(l.fall.kern))) {
    const wer = p0.alter < 14 ? `Kind ${p0.alter} ${p0.alter === 1 ? "Jahr" : "Jahre"}` : `${p0.geschlecht === "w" ? "Frau" : "Mann"} ${p0.alter}`;
    teile.push(`${wer}, ${l.fall.kern}`);
  } else if (istStillstand(p0)) teile.push("Patient reanimationspflichtig, Reanimation läuft");
  else {
    const bw = { ja: "wach", getruebt: "eingetrübt", nein: "bewusstlos" }[p0.bw];
    const at = { normal: "Atmung suffizient", abnorm: "Atmung insuffizient", agonal: "Schnappatmung", keine: "keine Atmung" }[p0.at];
    teile.push(`${l.irrtum === "keineRea" ? "keine Reanimation, " : ""}Patient ${bw}, ${at}`);
  }
  if (fehlt.na > 0) teile.push(fehlt.na === 1 ? "benötigen Notarzt" : `benötigen ${fehlt.na} Notärzte`);
  if (fehlt.rtw > 0) teile.push(rtwBedarf(fehlt.rtw));
  if (fehlt.bit) teile.push(`Patient ca. ${150 + Math.round(Math.random() * 8) * 10} kg, mit unserer Trage nicht transportierbar, benötigen BIT`);
  if (naStorno) teile.push("Notarzt nicht erforderlich, kann storniert werden");
  return teile.join(", ");
}

/** Nachforderung von Transportmitteln in Funksprache („benötigen einen weiteren RTW“); selbst = meldendes Fahrzeug transportiert selbst */
export function rtwBedarf(n: number, selbstTransport = true): string {
  if (n === 1) return selbstTransport ? "benötigen einen weiteren RTW" : "benötigen einen RTW";
  return selbstTransport ? `benötigen ${n} weitere RTW` : `benötigen ${n} RTW`;
}
