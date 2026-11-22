/**
 * Wie oft welches Thema (Kapitel) als Notruf kommt – Anteil in % aller Notrufe (Beta 72).
 *
 * Referenz: echte Einsatzverteilung (Kapitel wie im Codesystem, mehrere hunderttausend Notrufe), nicht 1:1 übernommen: 70 % Realität, 30 % bisherige Spielmischung – seltene Notfälle
 * (Brand, Tierbiss …) bleiben dadurch etwas häufiger als in echt. Sonderfälle:
 * - unklar: in echt meist Rufhilfe/Notrufsysteme, die es als Fall noch nicht gibt – bleibt klein
 * - ecall: automatische Unfallmeldung ≈ 1 % (Ticket 15)
 * - infekt: wird in echt meist unter „Kranke Person“ codiert – klein
 *
 * Ein Thema ohne Eintrag behält seinen natürlichen Anteil (Summe der Häufigkeiten seiner Fälle).
 */
export const THEMA_ANTEIL: Record<string, number> = {
  anforderung_arzt: 20.2,
  sturz: 10.9,
  krank: 8.6,
  verletzung: 6.8,
  bewusstlos: 5.6,
  atemnot: 5.2,
  brustschmerz: 4.1,
  bauch: 4.0,
  blutung: 2.9,
  verkehrsunfall: 2.8,
  herz: 2.5,
  psych: 2.0,
  schlaganfall: 1.8,
  ruecken: 1.6,
  unklar: 1.5,
  krampf: 1.4,
  stillstand: 1.3,
  schwangerschaft: 1.2,
  anforderung_polizei: 1.2,
  zucker: 1.1,
  vergiftung: 1.0,
  infekt: 1.0,
  ecall: 0.8,
  kopfschmerz: 0.67,
  allergie: 0.65,
  auge: 0.52,
  gewalt: 0.48,
  tierbiss: 0.45,
  brand: 0.44,
  hitze_kaelte: 0.4,
  anforderung_ls: 0.3,
  ersticken: 0.21,
  alpin: 0.15,
  stich_schuss: 0.11,
  gefahrstoff: 0.1,
  wasser: 0.1,
  strom: 0.1,
  eingeklemmt: 0.1,
};

/**
 * Ausgleich für den Fallkatalog: dort wird zuerst die Versorgungsstufe gezogen, dann der Fall – das verschiebt die
 * Themen (z. B. Anforderungen durch Ärzte liegen in seltener gezogenen Stufen). Gemessen mit vielen gezogenen Fällen
 * über den ganzen Tag (Voreinstellung „Standard“), damit das Ergebnis nahe an THEMA_ANTEIL liegt.
 */
export const KORREKTUR: Record<string, number> = {
  anforderung_arzt: 1.75,
  sturz: 0.95,
  krank: 1.11,
  verletzung: 0.57,
  bewusstlos: 1.07,
  atemnot: 0.66,
  brustschmerz: 0.74,
  bauch: 0.69,
  blutung: 0.67,
  verkehrsunfall: 0.64,
  herz: 0.58,
  schlaganfall: 0.72,
  ruecken: 1.35,
  unklar: 0.71,
  krampf: 0.73,
  stillstand: 0.87,
  schwangerschaft: 0.4,
  anforderung_polizei: 0.46,
  zucker: 0.5,
  vergiftung: 0.8,
  infekt: 1.4,
  ecall: 1.23,
  kopfschmerz: 1.07,
  allergie: 1.53,
  auge: 0.44,
  gewalt: 0.92,
  tierbiss: 0.55,
  brand: 1.75,
};

/**
 * Faktor je Thema für die Fall-Häufigkeit: alle Fälle eines Themas zusammen bekommen den Anteil aus THEMA_ANTEIL,
 * untereinander bleibt ihre Häufigkeit. Gerechnet über alle Fälle (nicht nur die, die gerade passen) –
 * so werden Sommer-/Winterfälle außerhalb der Saison nicht künstlich häufiger.
 */
export function themaFaktoren(faelle: { thema: string; haeufigkeit: number }[]): (thema: string) => number {
  const basis = new Map<string, number>();
  for (const f of faelle) basis.set(f.thema, (basis.get(f.thema) ?? 0) + Math.max(0, f.haeufigkeit));
  let ziel = 0;
  let b = 0;
  for (const [t, w] of basis)
    if (THEMA_ANTEIL[t] !== undefined && w > 0) {
      ziel += THEMA_ANTEIL[t];
      b += w;
    }
  const normal = b > 0 ? ziel / b : 1;
  return (t) => {
    const w = basis.get(t) ?? 0;
    const a = THEMA_ANTEIL[t];
    return (a !== undefined && w > 0 ? a / w : normal) * (KORREKTUR[t] ?? 1);
  };
}
