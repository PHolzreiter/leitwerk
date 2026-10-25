/**
 * Flughafen Wien-Schwechat (Vorgaben Paul, 25.10.2026):
 * - Gelände = Flughafengrenze aus OpenStreetMap (aeroway=aerodrome, way 75732093, vereinfacht auf ~25 m)
 * - RTW und NAW der Flughafenambulanz fahren nur zu Einsätzen am Gelände
 * - Fahrzeuge von außen (KTW, RTW, NEF …) halten an der Einfahrt 1 Minute (Sicherheitskontrolle) – hinein und hinaus;
 *   Hubschrauber landen direkt
 * - Ziele: Health Center (kann es allein versorgen, offen) → Medical Center (nicht kritisch, wird von dort überstellt)
 *   → kritisch direkt in die passende Klinik
 */
import type { LatLon, Route } from "./geo";

/** Dienststelle der Flughafenambulanz (RTW 77/898, NAW 77/899) */
export const FLUGHAFEN_WACHE = "btf-flughafen-wien";
/** Medical Center im Terminal 1 (rund um die Uhr) */
export const MEDICAL_CENTER = "kh116";
/** Health Center (Ärztezentrum Office Park 3, Öffnungszeiten) */
export const HEALTH_CENTER = "kh115";
/** Sicherheitskontrolle an der Einfahrt (Sekunden) */
export const KONTROLLE_SEK = 60;

/** [lon, lat] – Flughafengrenze (OpenStreetMap, © OpenStreetMap-Mitwirkende, ODbL) */
const RING: [number, number][] = [
  [16.52046, 48.12643], [16.52731, 48.12419], [16.52725, 48.12144], [16.53094, 48.12067], [16.53706, 48.11869], [16.53844, 48.11881],
  [16.54193, 48.11768], [16.54299, 48.1178], [16.54882, 48.11563], [16.56538, 48.11051], [16.56643, 48.10897], [16.57703, 48.10563],
  [16.57842, 48.10231], [16.57683, 48.09904], [16.57931, 48.09819], [16.58312, 48.09338], [16.5856, 48.08723], [16.58848, 48.0857],
  [16.59161, 48.07801], [16.59797, 48.08232], [16.59005, 48.10126], [16.59276, 48.1042], [16.59191, 48.10651], [16.5908, 48.1088],
  [16.58654, 48.10958], [16.57918, 48.12744], [16.57395, 48.12779], [16.57081, 48.12757], [16.57219, 48.12556], [16.57038, 48.12424],
  [16.56909, 48.12466], [16.56966, 48.12536], [16.56894, 48.12559], [16.56833, 48.12491], [16.56597, 48.12658], [16.56537, 48.12619],
  [16.56783, 48.1242], [16.56711, 48.12323], [16.56796, 48.12275], [16.56752, 48.12253], [16.56788, 48.12213], [16.56623, 48.12054],
  [16.56424, 48.1203], [16.56161, 48.12212], [16.56067, 48.12153], [16.55967, 48.12258], [16.55834, 48.12296], [16.55255, 48.1236],
  [16.55232, 48.1233], [16.54757, 48.12546], [16.54696, 48.12522], [16.54159, 48.12713], [16.54101, 48.12422], [16.53807, 48.12502],
  [16.54041, 48.12926], [16.53914, 48.12935], [16.53941, 48.13063], [16.53786, 48.13115], [16.53673, 48.13012], [16.53603, 48.1304],
  [16.53675, 48.12995], [16.53644, 48.12939], [16.5351, 48.12948], [16.53417, 48.12636], [16.53067, 48.12736], [16.52926, 48.12541],
  [16.52751, 48.12531], [16.52066, 48.12754], [16.52046, 48.12643],
];
const BBOX = [16.5204, 48.078, 16.598, 48.1312];

/** Liegt der Punkt am Flughafengelände? */
export function amFlughafen(p: LatLon | null | undefined): boolean {
  if (!p || typeof p.lat !== "number") return false;
  const { lat, lon } = p;
  if (lon < BBOX[0] || lon > BBOX[2] || lat < BBOX[1] || lat > BBOX[3]) return false;
  let drin = false;
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [xi, yi] = RING[i];
    const [xj, yj] = RING[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}

/** Fahrzeug der Flughafenambulanz (fährt nur am Gelände) */
export function istFlughafenFz(fz: { stationId?: string }): boolean {
  return fz.stationId === FLUGHAFEN_WACHE;
}

/** Krankenhaus-Einträge am Flughafen (Medical Center nur für Patienten vom Gelände) */
export function istFlughafenZiel(id: string): boolean {
  return id === MEDICAL_CENTER || id === HEALTH_CENTER;
}

/**
 * Sicherheitskontrolle: An jeder Stelle, an der die Route die Flughafengrenze kreuzt (hinein oder hinaus),
 * steht das Fahrzeug eine Minute. times sind kumulierte Sekunden; zurück kommt die Route mit Halt.
 */
export function mitKontrolle(r: Route): { route: Route; halte: number } {
  const coords: [number, number][] = [];
  const times: number[] = [];
  let plus = 0;
  let halte = 0;
  let vorher: boolean | null = null;
  for (let i = 0; i < r.coords.length; i++) {
    const [lon, lat] = r.coords[i];
    const drin = amFlughafen({ lat, lon });
    if (vorher !== null && drin !== vorher) {
      // Einfahrt: Schnittpunkt der Strecke mit der Grenze (Halbierung), dort eine Minute Halt
      const [lon0, lat0] = r.coords[i - 1];
      let a = 0;
      let b = 1;
      for (let k = 0; k < 14; k++) {
        const m = (a + b) / 2;
        if (amFlughafen({ lat: lat0 + (lat - lat0) * m, lon: lon0 + (lon - lon0) * m }) === vorher) a = m;
        else b = m;
      }
      const q: [number, number] = [lon0 + (lon - lon0) * a, lat0 + (lat - lat0) * a];
      const tq = r.times[i - 1] + (r.times[i] - r.times[i - 1]) * a + plus;
      coords.push(q, q);
      times.push(tq, tq + KONTROLLE_SEK);
      plus += KONTROLLE_SEK;
      halte++;
    }
    coords.push([lon, lat]);
    times.push(r.times[i] + plus);
    vorher = drin;
  }
  return { route: { ...r, coords, times, duration: r.duration + plus }, halte };
}

/** Wie oft kreuzt die Strecke von a nach b die Flughafengrenze (für Schätzungen: 0, 1) */
export function kontrolleSek(von: LatLon, nach: LatLon): number {
  return amFlughafen(von) !== amFlughafen(nach) ? KONTROLLE_SEK : 0;
}
