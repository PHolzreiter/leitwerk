/**
 * Gemeinsame Auswahl über alle Fenster: welcher Einsatz bzw. Krankentransport gerade offen ist,
 * welches Fahrzeug markiert ist, und Wünsche an die Karte („zeig mir …“).
 */
import { bus } from "./bus";

export type AuswahlArt = "einsatz" | "kt";

export interface Auswahl {
  art: AuswahlArt | null;
  id: string | null;
}

export interface AuswahlOpts {
  /** Karte springt hin (Standard: ja) */
  karte?: boolean;
  /** passende Maske nach vorne holen (Standard: ja) */
  maske?: boolean;
}

type Hoerer = (a: Auswahl, opts: AuswahlOpts, hier: boolean) => void;

let aktuell: Auswahl = { art: null, id: null };
const hoerer = new Set<Hoerer>();

export function auswahl(): Auswahl {
  return aktuell;
}

function melden(a: Auswahl, opts: AuswahlOpts, hier: boolean): void {
  aktuell = a;
  for (const fn of hoerer) fn(a, opts, hier);
}

/** Einsatz oder Krankentransport auswählen (null = nichts) */
export function waehle(art: AuswahlArt | null, id: string | null, opts: AuswahlOpts = {}): void {
  const a = { art: id ? art : null, id };
  melden(a, opts, true);
  bus.senden({ t: "auswahl", a, opts });
}

export function onAuswahl(fn: Hoerer): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

// ---------------------------------------------------------------- Karte

export interface KartenWunsch {
  lat: number;
  lon: number;
  zoom?: number;
}

type KartenHoerer = (w: KartenWunsch) => void;
const kartenHoerer = new Set<KartenHoerer>();

/** Karte(n) zu einem Ort schicken – in allen Fenstern, die eine Karte zeigen */
export function karteZeigen(lat: number, lon: number, zoom?: number): void {
  const w = { lat, lon, zoom };
  for (const fn of kartenHoerer) fn(w);
  bus.senden({ t: "karteZeigen", w });
}

export function onKarteZeigen(fn: KartenHoerer): () => void {
  kartenHoerer.add(fn);
  return () => kartenHoerer.delete(fn);
}

/** Fahrzeug auf der Karte markieren (Popup mit Auftrag und Route) */
type FzHoerer = (id: string | null, folgen: boolean) => void;
const fzHoerer = new Set<FzHoerer>();
export function fahrzeugZeigen(id: string | null, folgen = false): void {
  for (const fn of fzHoerer) fn(id, folgen);
  bus.senden({ t: "fahrzeugZeigen", id, folgen });
}
export function onFahrzeugZeigen(fn: FzHoerer): () => void {
  fzHoerer.add(fn);
  return () => fzHoerer.delete(fn);
}

bus.empfangen((m) => {
  if (m.t === "auswahl") melden(m.a as Auswahl, (m.opts as AuswahlOpts) ?? {}, false);
  else if (m.t === "karteZeigen") for (const fn of kartenHoerer) fn(m.w as KartenWunsch);
  else if (m.t === "fahrzeugZeigen") for (const fn of fzHoerer) fn((m.id as string | null) ?? null, !!m.folgen);
});

// ---------------------------------------------------------------- Ort auf der Karte anklicken

type Waehler = (hinweis: string) => Promise<{ lat: number; lon: number } | null>;
const waehler: Waehler[] = [];

/** Die Karte dieses Programmfensters meldet sich zum Anklicken von Orten an */
export function setzeKartenWaehler(fn: Waehler): () => void {
  waehler.push(fn);
  return () => {
    const i = waehler.indexOf(fn);
    if (i >= 0) waehler.splice(i, 1);
  };
}

/** Ort auf der Karte anklicken lassen (Karte muss in diesem Programmfenster offen sein) */
export async function karteWaehlen(hinweis: string): Promise<{ lat: number; lon: number } | null> {
  const w = waehler[0];
  if (!w) {
    const { toast } = await import("../dom");
    toast("Dafür bitte die Karte in diesem Fenster öffnen (Fenster → Karte)", "error");
    return null;
  }
  return w(hinweis);
}

// ---------------------------------------------------------------- Funk

/** Fahrzeug über Funk rufen – im Funk-Fenster (wo auch immer es offen ist) */
type FunkHoerer = (fzId: string) => void;
const funkHoerer = new Set<FunkHoerer>();
export function funkRufen(fzId: string): void {
  if (funkHoerer.size) for (const fn of funkHoerer) fn(fzId);
  else bus.senden({ t: "funkRufen", fzId });
}
export function onFunkRufen(fn: FunkHoerer): () => void {
  funkHoerer.add(fn);
  return () => funkHoerer.delete(fn);
}
bus.empfangen((m) => {
  if (m.t === "funkRufen") for (const fn of funkHoerer) fn(String(m.fzId));
});
