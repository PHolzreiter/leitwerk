/**
 * Bewegung für die Darstellung: Position, Fahrtrichtung und Flughöhe zu einem beliebigen
 * Zeitpunkt (aus der Fahrt berechnet, damit 3D-Modelle flüssig fahren – auch im Multiplayer).
 */
import type { SimFahrzeug } from "./engine";

const FLUGHOEHE = 300;
const STEIGEN_S = 45;

function segment(fz: SimFahrzeug, t: number): { i: number; k: number; el: number } | null {
  const f = fz.fahrt;
  if (!f || f.coords.length < 2) return null;
  const el = Math.max(0, (t - f.start) / 1000);
  let i = 1;
  while (i < f.times.length - 1 && f.times[i] < el) i++;
  const t0 = f.times[i - 1];
  const t1 = f.times[i] ?? t0;
  const k = t1 > t0 ? Math.min(1, Math.max(0, (el - t0) / (t1 - t0))) : 1;
  return { i, k, el };
}

/** Position [lon, lat] zum Zeitpunkt t */
export function positionBei(fz: SimFahrzeug, t: number): [number, number] {
  const s = segment(fz, t);
  if (!s) return [fz.lon, fz.lat];
  const f = fz.fahrt!;
  if (s.el >= f.dauer) return f.coords[f.coords.length - 1];
  const a = f.coords[s.i - 1];
  const b = f.coords[s.i];
  return [a[0] + (b[0] - a[0]) * s.k, a[1] + (b[1] - a[1]) * s.k];
}

/** Fahrtrichtung in Grad (0 = Norden, im Uhrzeigersinn) oder null ohne Fahrt */
export function richtungBei(fz: SimFahrzeug, t: number): number | null {
  const s = segment(fz, t);
  if (!s) return null;
  const f = fz.fahrt!;
  const a = f.coords[s.i - 1];
  const b = f.coords[s.i];
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return null;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Flughöhe des Hubschraubers über Grund in Metern (0 = am Boden) */
export function flughoehe(fz: SimFahrzeug, t: number): number {
  if (fz.kategorie !== "NAH") return 0;
  const f = fz.fahrt;
  if (!f) return 0;
  const el = (t - f.start) / 1000;
  if (el <= 0 || el >= f.dauer) return 0;
  const steigen = Math.min(1, el / STEIGEN_S) * FLUGHOEHE;
  if (f.kreisAb !== undefined && f.landungAb !== undefined && el >= f.kreisAb) {
    // über dem Einsatzort kreisen: langsam tiefer, dann Landeanflug
    if (el < f.landungAb) {
      const k = (el - f.kreisAb) / Math.max(1, f.landungAb - f.kreisAb);
      return Math.min(steigen, FLUGHOEHE - k * (FLUGHOEHE - 120));
    }
    return Math.min(steigen, 120 * ((f.dauer - el) / Math.max(1, f.dauer - f.landungAb)));
  }
  const sinken = ((f.dauer - el) / STEIGEN_S) * FLUGHOEHE;
  return Math.max(0, Math.min(steigen, sinken, FLUGHOEHE));
}

/** Läuft der Rotor? (beim Ausrücken, in der Luft) */
export function rotorLaeuft(fz: SimFahrzeug, t: number): boolean {
  if (fz.kategorie !== "NAH") return false;
  return fz.phase === "ausruecken" || flughoehe(fz, t) > 0 || fz.phase === "routing";
}
