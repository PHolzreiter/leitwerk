/**
 * Treffpunkt für ein Rendezvous RTW – NEF (Regel Paul 12.11.2026): auf der Strecke des RTW ins Krankenhaus, an der
 * ersten Stelle, die das NEF (von seinem jetzigen Standort aus) nicht später erreicht als der RTW. Fährt der RTW in die
 * Gegenrichtung, holt ihn das NEF praktisch nie ein – dann gibt es kein Rendezvous (null). Ebenso, wenn sich beide erst
 * im letzten Fünftel der Fahrt (kurz vor dem Krankenhaus) treffen würden.
 */
import { distanceM, type LatLon } from "./geo";

/** Straße ≈ 1,35 × Luftlinie */
const UMWEG = 1.35;

export function rendezvousPunkt(coords: [number, number][], times: number[], nef: LatLon, nefKmh: number, spaetestens = 0.8): LatLon | null {
  if (coords.length < 2 || times.length !== coords.length) return null;
  const gesamt = times[times.length - 1];
  if (!(gesamt > 0)) return null;
  const v = nefKmh / 3.6;
  const nefZeit = (p: LatLon) => (distanceM(nef, p) * UMWEG) / v;
  // Strecke in kurze Stücke (≤ 10 s) teilen – grobe Routen haben nur wenige Punkte
  const punkte: { p: LatLon; t: number }[] = [];
  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      const dt = times[i] - times[i - 1];
      const n = Math.min(500, Math.floor(dt / 10));
      for (let j = 1; j < n; j++) {
        const k = j / n;
        punkte.push({ p: { lat: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * k, lon: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * k }, t: times[i - 1] + dt * k });
      }
    }
    punkte.push({ p: { lat: coords[i][1], lon: coords[i][0] }, t: times[i] });
  }
  let vorher: { p: LatLon; d: number; t: number } | null = null;
  for (const { p, t } of punkte) {
    if (t > gesamt * spaetestens) return null;
    const d = nefZeit(p) - t; // > 0: NEF kommt später als der RTW
    if (d <= 0) {
      if (!vorher || vorher.d <= 0) return p;
      // zwischen dem letzten und diesem Punkt: dort, wo beide gleich lange brauchen
      const k = vorher.d / (vorher.d - d);
      return { lat: vorher.p.lat + (p.lat - vorher.p.lat) * k, lon: vorher.p.lon + (p.lon - vorher.p.lon) * k };
    }
    vorher = { p, d, t };
  }
  return null;
}
