/**
 * Wie oft welches Thema (Kapitel) als Notruf kommt – Anteil in % aller Notrufe, je Spieltyp (Beta 73, Paul):
 * - Realistisch: wie in echt (echte Einsatzverteilung, Kapitel wie im Codesystem, mehrere hunderttausend Notrufe).
 *   Sonderwerte: eCall 0,5 %, Infekt 0,3 % (wird in echt meist unter „Kranke Person“ codiert).
 * - Standard: spannende Session (Spieler spielen höchstens etwa 2 Stunden am Stück) – die Spielmischung vor Beta 72,
 *   mehr Akutes (Brustschmerz, Atemnot, Schlaganfall, Verkehrsunfall, Kollaps), weniger Anforderungen durch Arzt/Pflege.
 * - Stressig: noch weniger Routine, deutlich mehr Kritisches und öfter Sonderanrufer.
 * „rufhilfe“ ist eine eigene Gruppe im Kapitel „Unklare Lage“ (Fall-Feld gruppe).
 * Ein Thema ohne Eintrag behält seinen natürlichen Anteil (Summe der Häufigkeiten seiner Fälle).
 */
import type { Vorlage } from "../sim/stufenKurven";

export const THEMA_ANTEIL_JE: Record<Vorlage, Record<string, number>> = {
  realistisch: {
    anforderung_arzt: 25.6,
    sturz: 10.0,
    krank: 9.8,
    rufhilfe: 7.5,
    bewusstlos: 6.1,
    verletzung: 5.8,
    atemnot: 5.0,
    bauch: 4.3,
    brustschmerz: 4.0,
    blutung: 3.0,
    psych: 2.1,
    verkehrsunfall: 2.0,
    schlaganfall: 1.9,
    ruecken: 1.8,
    herz: 1.6,
    krampf: 1.3,
    stillstand: 1.3,
    unklar: 1.2,
    kopfschmerz: 0.79,
    allergie: 0.62,
    schwangerschaft: 0.6,
    vergiftung: 0.57,
    anforderung_polizei: 0.53,
    ecall: 0.51,
    zucker: 0.4,
    anforderung_ls: 0.3,
    infekt: 0.3,
    auge: 0.24,
    gewalt: 0.24,
    ersticken: 0.16,
    alpin: 0.15,
    brand: 0.12,
    tierbiss: 0.1,
    hitze_kaelte: 0.08,
    stich_schuss: 0.06,
    gefahrstoff: 0.05,
    eingeklemmt: 0.05,
    strom: 0.05,
    wasser: 0.05,
  },
  standard: {
    sturz: 12.4,
    verletzung: 8.6,
    anforderung_arzt: 7.5,
    atemnot: 7.1,
    krank: 5.8,
    bewusstlos: 5.7,
    verkehrsunfall: 5.5,
    brustschmerz: 5.4,
    herz: 4.4,
    bauch: 3.2,
    rufhilfe: 2.8,
    anforderung_polizei: 2.7,
    blutung: 2.7,
    zucker: 2.6,
    schwangerschaft: 2.5,
    infekt: 2.1,
    vergiftung: 2.0,
    schlaganfall: 2.0,
    psych: 1.9,
    krampf: 1.5,
    ruecken: 1.2,
    stillstand: 1.2,
    tierbiss: 1.2,
    unklar: 1.1,
    auge: 1.1,
    brand: 1.1,
    gewalt: 0.98,
    ecall: 0.94,
    allergie: 0.7,
    kopfschmerz: 0.39,
    hitze_kaelte: 0.37,
    ersticken: 0.31,
    anforderung_ls: 0.28,
    eingeklemmt: 0.23,
    stich_schuss: 0.23,
    alpin: 0.14,
    strom: 0.12,
    gefahrstoff: 0.09,
    wasser: 0.09,
  },
  stressig: {
    sturz: 9.2,
    atemnot: 8.7,
    verletzung: 8.5,
    bewusstlos: 7.0,
    verkehrsunfall: 6.7,
    brustschmerz: 6.6,
    herz: 4.4,
    krank: 4.3,
    blutung: 4.3,
    anforderung_arzt: 3.7,
    bauch: 3.2,
    anforderung_polizei: 2.7,
    zucker: 2.6,
    schwangerschaft: 2.5,
    schlaganfall: 2.4,
    krampf: 2.4,
    infekt: 2.1,
    vergiftung: 2.0,
    ecall: 1.9,
    rufhilfe: 1.9,
    stillstand: 1.9,
    psych: 1.4,
    tierbiss: 1.2,
    unklar: 1.1,
    brand: 1.1,
    gewalt: 0.97,
    ruecken: 0.9,
    auge: 0.82,
    allergie: 0.7,
    anforderung_ls: 0.56,
    hitze_kaelte: 0.47,
    eingeklemmt: 0.37,
    stich_schuss: 0.37,
    ersticken: 0.31,
    kopfschmerz: 0.29,
    alpin: 0.23,
    strom: 0.12,
    gefahrstoff: 0.09,
    wasser: 0.09,
  },
};

/** Standard-Tabelle (ältere Aufrufe ohne Spieltyp) */
export const THEMA_ANTEIL = THEMA_ANTEIL_JE.standard;

/**
 * Ausgleich für den Fallkatalog: dort wird zuerst die Versorgungsstufe gezogen, dann der Fall – das verschiebt die
 * Themen (z. B. Anforderungen durch Ärzte liegen in seltener gezogenen Stufen). Gemessen mit vielen gezogenen Fällen
 * über den ganzen Tag je Spieltyp, damit das Ergebnis nahe an THEMA_ANTEIL_JE liegt.
 */
export const KORREKTUR_JE: Record<Vorlage, Record<string, number>> = {
  realistisch: {
    anforderung_arzt: 1.41,
    sturz: 1.06,
    krank: 0.93,
    bewusstlos: 1.32,
    verletzung: 0.77,
    atemnot: 0.84,
    bauch: 0.83,
    blutung: 0.72,
    verkehrsunfall: 1.27,
    schlaganfall: 0.8,
    ruecken: 0.82,
    herz: 0.64,
    krampf: 0.85,
    stillstand: 1.28,
    unklar: 0.7,
    kopfschmerz: 0.67,
    schwangerschaft: 0.59,
    vergiftung: 1.24,
    anforderung_polizei: 0.52,
    ecall: 1.28,
    zucker: 0.63,
  },
  standard: {
    sturz: 1.2,
    verletzung: 0.95,
    krank: 1.14,
    bewusstlos: 1.33,
    verkehrsunfall: 1.25,
    brustschmerz: 1.08,
    herz: 0.82,
    bauch: 0.91,
    rufhilfe: 0.72,
    anforderung_polizei: 0.77,
    zucker: 0.87,
    schwangerschaft: 0.71,
    infekt: 1.23,
    schlaganfall: 0.78,
    krampf: 0.68,
    ruecken: 1.26,
    stillstand: 0.9,
    tierbiss: 0.92,
    unklar: 0.7,
    auge: 0.66,
    brand: 1.2,
    gewalt: 1.19,
    ecall: 1.32,
    allergie: 1.91,
    kopfschmerz: 0.79,
  },
  stressig: {
    sturz: 1.07,
    bewusstlos: 1.27,
    verkehrsunfall: 1.18,
    herz: 0.82,
    krank: 1.31,
    blutung: 0.87,
    anforderung_arzt: 0.86,
    bauch: 0.85,
    anforderung_polizei: 0.76,
    zucker: 0.84,
    schwangerschaft: 0.73,
    schlaganfall: 1.09,
    krampf: 0.82,
    infekt: 1.49,
    vergiftung: 1.29,
    ecall: 1.3,
    rufhilfe: 0.68,
    stillstand: 0.8,
    psych: 1.13,
    tierbiss: 0.93,
    unklar: 0.78,
    brand: 1.3,
    gewalt: 1.09,
    ruecken: 1.27,
    auge: 0.71,
    allergie: 1.65,
    stich_schuss: 1.09,
    ersticken: 0.94,
  },
};

/** Gruppe eines Falls für die Verteilung */
export function gruppeVon(f: { thema: string; gruppe?: string }): string {
  return f.gruppe ?? f.thema;
}

/**
 * Faktor je Gruppe für die Fall-Häufigkeit: alle Fälle einer Gruppe zusammen bekommen den Anteil aus der Tabelle,
 * untereinander bleibt ihre Häufigkeit. Gerechnet über alle Fälle (nicht nur die, die gerade passen) –
 * so werden Sommer-/Winterfälle außerhalb der Saison nicht künstlich häufiger.
 */
export function themaFaktoren(faelle: { thema: string; gruppe?: string; haeufigkeit: number }[], vorlage: Vorlage = "standard"): (gruppe: string) => number {
  const ziel = THEMA_ANTEIL_JE[vorlage] ?? THEMA_ANTEIL;
  const korr = KORREKTUR_JE[vorlage] ?? {};
  const basis = new Map<string, number>();
  for (const f of faelle) basis.set(gruppeVon(f), (basis.get(gruppeVon(f)) ?? 0) + Math.max(0, f.haeufigkeit));
  let z = 0;
  let b = 0;
  for (const [t, w] of basis)
    if (ziel[t] !== undefined && w > 0) {
      z += ziel[t];
      b += w;
    }
  const normal = b > 0 ? z / b : 1;
  return (t) => {
    const w = basis.get(t) ?? 0;
    const a = ziel[t];
    return (a !== undefined && w > 0 ? a / w : normal) * (korr[t] ?? 1);
  };
}
