/**
 * Vertrag zwischen der Hauptmenü-Komponente (komponente.js, Logik aus dem Design) und der App-Anbindung.
 * Die Komponente beschreibt Einstellungen als Zeilen (siehe settingsData() in komponente.js).
 * Werte werden in der Darstellung des Menüs gelesen/geschrieben (z. B. Auswahl-Text „Dunkel“, Zahl in %, Farbe „#rrggbb“).
 */

/** Knopf in einer Zeile. Genau eine Wirkung: sub (Unterseite), go (Sprung), tab, back, act (Aktion). */
export interface Knopf {
  l: string;
  sub?: string;
  go?: [string, string];
  tab?: string;
  back?: boolean;
  /** Rückfrage direkt unter der Zeile, bevor act/ok ausgeführt wird */
  cfm?: string;
  /** Rückmeldung als Chip nach dem Klick (ohne act: nur Anzeige) */
  ok?: string;
  /** Aktion. Rückgabe-Text erscheint als Chip; Fehler (throw) als Warn-Chip. */
  act?: () => void | string | Promise<void | string>;
  /** Für Dateien: öffnet die Dateiauswahl und ruft datei(f) */
  datei?: { accept: string; mehrere?: boolean; f: (dateien: File[]) => void | string | Promise<void | string> };
}

/** Zeile wie im Design (t = Typ). Nur die Felder, die die Anbindung erzeugt. */
export type Zeile = Record<string, unknown> & { t: string };

/** Bausteine aus settingsData() – werden an zeilen() übergeben, damit gleich aussehende Zeilen entstehen */
export interface Bausteine {
  H(label: string): Zeile;
  T(label: string, key: string, def: boolean, hint?: string, x?: object): Zeile;
  S(label: string, key: string, opts: string[], def: string, hint?: string, x?: object): Zeile;
  L(label: string, key: string, options: string[], def: string, hint?: string, x?: object): Zeile;
  R(label: string, key: string, min: number, max: number, step: number, def: number, fmt: (v: number) => string, hint?: string, reset?: number, x?: object): Zeile;
  N(label: string, key: string, def: number, unit: string, hint?: string, step?: number, x?: object): Zeile;
  K(label: string, key: string, def: string, hint?: string): Zeile;
  B(label: string, btns: (string | Knopf)[], hint?: string, x?: object): Zeile;
  I(label: string, value: string, hint?: string, dot?: string, x?: object): Zeile;
  C(label: string, key: string, color: string, hint?: string, tog?: [string, boolean]): Zeile;
  IT(label: string, hint: string, chip: string, dot: string, x?: { btns?: (string | Knopf)[]; tog?: [string, boolean] }): Zeile;
  F(label: string, key: string, ph: string, hint?: string, x?: { pw?: boolean; btns?: (string | Knopf)[] }): Zeile;
  TON(label: string, key: string, def: string): Zeile;
  /**
   * Tabelle. x.edit = Stift je Zeile → Bearbeiten-Unterseite; x.speichern(z, werte) mit z = Index in rows oder -1 (neu);
   * x.loeschen(z); werte = Texte je Spalte (+ extra). x.typen je Spalte: 'text' | 'tog' | 'num' | 'fix' | 'plan' | 'lage' | ['sel', [...]]
   */
  TAB(cols: string[], rows: string[][], x?: object): Zeile;
}

export const FARBEN = { ok: "#4CC38A", grau: "#9AA3B5", gelb: "#FFC72C", blau: "#3B8BFF", rot: "#E5484D" };

export interface EinstellungsBindung {
  /** Wert lesen (undefined = nicht gebunden → Menü-Zustand) */
  lesen(key: string): unknown;
  /** Wert schreiben (undefined = auf Standard zurück). true = übernommen */
  schreiben(key: string, wert: unknown): boolean;
  /** Auswahl-Liste für sel/ton-Zeilen (undefined = die im Design) */
  optionen(key: string): string[] | undefined;
  /** Tastenkürzel aufnehmen. Rückgabe: true = belegt (Taste gehört der Zeile) */
  taste(key: string, e: KeyboardEvent): boolean;
  /** Anzeige-Text einer Taste (undefined = Rohwert) */
  tasteText(key: string): string | undefined;
}

/** Zeilen einer Seite dynamisch aus der App (undefined = Zeilen aus dem Design). */
export type ZeilenQuelle = (seite: string, b: Bausteine) => Zeile[] | undefined;
