/**
 * „Die Lage lebt“: verborgener Zustand der Patienten eines Einsatzes und wie er sich
 * mit der Zeit verändert. Das Programm entscheidet, was passiert – Anrufer und
 * Besatzungen erzählen es nur.
 */
import type { Antworten } from "../abfrage/schema";

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
const MEHRERE = ["29", "34", "7", "8", "22", "ALP"];
/** Kapitel, bei denen sich der Zustand wieder bessern kann */
const BESSERUNG = ["12", "31", "13", "25", "26"];

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
  const n = a.anzahl_patienten === "n" ? 2 + Math.floor(Math.random() * 3) : 1;
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
  } else if (MEHRERE.includes(kapitel) && Math.random() < 0.25 * f) {
    // Irrtum: mehr Betroffene als gemeldet
    lage.irrtum = "mehrPatienten";
    weitere(1 + Math.floor(Math.random() * 3));
  }

  // Verlauf: Verschlechterung bzw. Besserung im Lauf des Einsatzes
  if (!istStillstand(p0) && Math.random() < 0.1 * f) {
    const stillstand = Math.random() < (kritisch ? 0.4 : 0.15);
    const nbw: Bewusstsein = stillstand || p0.bw === "getruebt" ? "nein" : "getruebt";
    const nat: Atmung = stillstand ? (Math.random() < 0.5 ? "agonal" : "keine") : p0.at === "normal" ? "abnorm" : p0.at;
    lage.ereignisse.push({ um: jetzt + zufall(3, 14) * MIN, art: "verschlechterung", patient: 1, bw: nbw, at: nat, eingetreten: false });
  } else if (BESSERUNG.includes(kapitel) && p0.bw !== "ja" && !istStillstand(p0) && Math.random() < 0.25 * f) {
    lage.ereignisse.push({ um: jetzt + zufall(2, 8) * MIN, art: "besserung", patient: 1, bw: "ja", at: "normal", eingetreten: false });
  }
  return lage;
}

/** Kurztext eines Patienten, z. B. „Mann, ca. 71 J., benommen, atmet schwer (rot)“ */
export function patientText(p: LagePatient): string {
  const bw = { ja: "wach", getruebt: "benommen", nein: "bewusstlos" }[p.bw];
  const at = { normal: "atmet normal", abnorm: "atmet schwer", agonal: "Schnappatmung", keine: "atmet nicht" }[p.at];
  return `${p.geschlecht === "w" ? "Frau" : "Mann"}, ca. ${p.alter} J., ${bw}, ${at} (${p.sichtung === "gruen" ? "grün" : p.sichtung})`;
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
