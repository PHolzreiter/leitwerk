/**
 * Wettermodell: feine Wetterlagen mit realistischen Übergängen (immer nur zu benachbarten Lagen),
 * Wind, Temperatur nach Klima, Tages- und Jahreszeit, Prognose, Warnungen – und Tag/Nacht für die Flugrettung.
 * Alles ist so gebaut, dass alle Spieler dieselben Werte rechnen (Zufall je Tag ist fest).
 */

export type WetterLage =
  | "klar"
  | "heiter"
  | "leicht_bewoelkt"
  | "bewoelkt"
  | "bedeckt"
  | "dunst"
  | "nebel"
  | "hochnebel"
  | "niesel"
  | "leichter_regen"
  | "regen"
  | "starkregen"
  | "gewitter"
  | "hagel"
  | "unwetter"
  | "schneeregen"
  | "leichter_schnee"
  | "schnee"
  | "starker_schnee"
  | "eisregen";

type Art = "trocken" | "nebel" | "regen" | "gewitter" | "schnee" | "eis";

interface LageInfo {
  label: string;
  symbol: string;
  nacht?: string;
  art: Art;
  /** Bewölkung 0–1 */
  wolken: number;
  /** heftig (kommt bei „wechselhaft“ öfter) */
  heftig?: boolean;
  /** Wind (km/h, Mittel) */
  wind: number;
  sicht: number;
  feuchte: number;
  /** Regenwahrscheinlichkeit in der Stunde (%) */
  regen: number;
  /** kein Flugbetrieb */
  kein_flug?: boolean;
}

export const LAGE: Record<WetterLage, LageInfo> = {
  klar: { label: "Klar", symbol: "☀️", nacht: "🌙", art: "trocken", wolken: 0, wind: 8, sicht: 40, feuchte: 52, regen: 2 },
  heiter: { label: "Heiter", symbol: "🌤️", nacht: "🌙", art: "trocken", wolken: 0.2, wind: 9, sicht: 30, feuchte: 56, regen: 5 },
  leicht_bewoelkt: { label: "Leicht bewölkt", symbol: "⛅", nacht: "☁️", art: "trocken", wolken: 0.4, wind: 10, sicht: 25, feuchte: 60, regen: 10 },
  bewoelkt: { label: "Bewölkt", symbol: "🌥️", art: "trocken", wolken: 0.65, wind: 12, sicht: 18, feuchte: 66, regen: 20 },
  bedeckt: { label: "Bedeckt", symbol: "☁️", art: "trocken", wolken: 0.9, wind: 14, sicht: 12, feuchte: 74, regen: 35 },
  dunst: { label: "Dunst", symbol: "🌫️", art: "nebel", wolken: 0.3, wind: 5, sicht: 3, feuchte: 82, regen: 4 },
  nebel: { label: "Nebel", symbol: "🌫️", art: "nebel", wolken: 0.8, heftig: true, wind: 3, sicht: 0.15, feuchte: 98, regen: 5, kein_flug: true },
  hochnebel: { label: "Hochnebel", symbol: "🌫️", art: "nebel", wolken: 1, wind: 5, sicht: 2, feuchte: 92, regen: 10, kein_flug: true },
  niesel: { label: "Nieselregen", symbol: "🌦️", art: "regen", wolken: 0.95, wind: 12, sicht: 6, feuchte: 93, regen: 75 },
  leichter_regen: { label: "Leichter Regen", symbol: "🌦️", art: "regen", wolken: 0.95, wind: 15, sicht: 8, feuchte: 88, regen: 80 },
  regen: { label: "Regen", symbol: "🌧️", art: "regen", wolken: 1, wind: 20, sicht: 5, feuchte: 92, regen: 90 },
  starkregen: { label: "Starkregen", symbol: "🌧️", art: "regen", wolken: 1, heftig: true, wind: 28, sicht: 1.5, feuchte: 96, regen: 95 },
  gewitter: { label: "Gewitter", symbol: "⛈️", art: "gewitter", wolken: 1, heftig: true, wind: 30, sicht: 3, feuchte: 86, regen: 85, kein_flug: true },
  hagel: { label: "Gewitter mit Hagel", symbol: "⛈️", art: "gewitter", wolken: 1, heftig: true, wind: 38, sicht: 1, feuchte: 86, regen: 90, kein_flug: true },
  unwetter: { label: "Unwetter", symbol: "⛈️", art: "gewitter", wolken: 1, heftig: true, wind: 55, sicht: 0.8, feuchte: 92, regen: 95, kein_flug: true },
  schneeregen: { label: "Schneeregen", symbol: "🌨️", art: "schnee", wolken: 1, wind: 15, sicht: 3, feuchte: 92, regen: 80 },
  leichter_schnee: { label: "Leichter Schneefall", symbol: "🌨️", art: "schnee", wolken: 0.95, wind: 12, sicht: 4, feuchte: 88, regen: 75 },
  schnee: { label: "Schneefall", symbol: "❄️", art: "schnee", wolken: 1, wind: 18, sicht: 1.5, feuchte: 92, regen: 90 },
  starker_schnee: { label: "Starker Schneefall", symbol: "❄️", art: "schnee", wolken: 1, heftig: true, wind: 30, sicht: 0.5, feuchte: 95, regen: 95, kein_flug: true },
  eisregen: { label: "Gefrierender Regen", symbol: "🧊", art: "eis", wolken: 1, heftig: true, wind: 10, sicht: 3, feuchte: 96, regen: 85 },
};

export const WETTER_LABEL = Object.fromEntries(Object.entries(LAGE).map(([k, v]) => [k, v.label])) as Record<WetterLage, string>;
export const WETTER_SYMBOL = Object.fromEntries(Object.entries(LAGE).map(([k, v]) => [k, v.symbol])) as Record<WetterLage, string>;

/** ältere Spielstände: unbekannte Lage → passende neue */
export function lageVon(x: string | null | undefined): WetterLage {
  return x && x in LAGE ? (x as WetterLage) : "bewoelkt";
}

export function symbolFuer(lage: WetterLage, nacht: boolean): string {
  const i = LAGE[lageVon(lage)];
  return nacht && i.nacht ? i.nacht : i.symbol;
}

/** Benachbarte Lagen – das Wetter wechselt immer nur einen Schritt */
const NACHBAR: Record<WetterLage, WetterLage[]> = {
  klar: ["heiter", "dunst", "nebel"],
  heiter: ["klar", "leicht_bewoelkt", "dunst"],
  leicht_bewoelkt: ["heiter", "bewoelkt", "gewitter"],
  bewoelkt: ["leicht_bewoelkt", "bedeckt", "gewitter", "leichter_regen"],
  bedeckt: ["bewoelkt", "niesel", "leichter_regen", "hochnebel", "leichter_schnee", "schneeregen"],
  dunst: ["klar", "heiter", "nebel"],
  nebel: ["dunst", "hochnebel", "bedeckt"],
  hochnebel: ["nebel", "bedeckt", "dunst", "niesel", "leichter_schnee"],
  niesel: ["bedeckt", "leichter_regen", "eisregen"],
  leichter_regen: ["niesel", "bedeckt", "regen", "schneeregen"],
  regen: ["leichter_regen", "starkregen", "gewitter"],
  starkregen: ["regen", "gewitter", "unwetter"],
  gewitter: ["starkregen", "hagel", "unwetter", "regen", "bewoelkt"],
  hagel: ["gewitter", "starkregen"],
  unwetter: ["gewitter", "starkregen"],
  schneeregen: ["leichter_regen", "leichter_schnee", "bedeckt"],
  leichter_schnee: ["bedeckt", "schneeregen", "schnee", "hochnebel"],
  schnee: ["leichter_schnee", "starker_schnee"],
  starker_schnee: ["schnee"],
  eisregen: ["niesel", "bedeckt", "leichter_schnee"],
};

export type Jahreszeit = "fruehling" | "sommer" | "herbst" | "winter";
export type WetterModus = "fest" | "beständig" | "normal" | "wechselhaft" | "sehr wechselhaft";

export const JAHRESZEIT_LABEL: Record<Jahreszeit, string> = { fruehling: "Frühling", sommer: "Sommer", herbst: "Herbst", winter: "Winter" };

export interface WetterAbschnitt {
  lage: WetterLage;
  /** Simulationszeit (ms), ab der sich das Wetter ändert */
  bis: number;
  /** Wind (km/h, Mittel) und Richtung (Grad, woher) */
  wind?: number;
  richtung?: number;
}

export interface Wetter extends WetterAbschnitt {
  /** die nächsten Abschnitte (für die Prognose) */
  plan?: WetterAbschnitt[];
  /** vorherige Lage und seit wann die aktuelle gilt (Temperatur ändert sich weich) */
  vorher?: WetterLage | null;
  seit?: number;
}

export interface WetterOpt {
  /** 0 = fix … 100 = sehr wechselhaft */
  wechsel: number;
  /** "auto" = nach dem Spieldatum */
  jahreszeit: Jahreszeit | "auto";
  festLage: WetterLage;
  festTemp: number;
}

export const WETTER_STANDARD: WetterOpt = { wechsel: 50, jahreszeit: "auto", festLage: "klar", festTemp: 18 };

export function modusVon(wechsel: number): WetterModus {
  return wechsel <= 0 ? "fest" : wechsel < 30 ? "beständig" : wechsel < 65 ? "normal" : wechsel < 88 ? "wechselhaft" : "sehr wechselhaft";
}

/** Böen (km/h) */
export function boeenVon(lage: WetterLage, wind: number): number {
  const art = LAGE[lageVon(lage)].art;
  return Math.round(wind * (art === "gewitter" ? 2.1 : 1.6));
}

/** Kein Hubschrauber: Nebel, Hochnebel, Gewitter, Unwetter, starker Schneefall, Sturm (Böen ab 90 km/h). Glatteis spielt keine Rolle. */
export function flugverbot(lage: WetterLage, wind = 0): boolean {
  return !!LAGE[lageVon(lage)].kein_flug || boeenVon(lage, wind) >= 90;
}

/** Flugbetrieb eingeschränkt (stürmischer Wind) */
export function flugEingeschraenkt(lage: WetterLage, wind = 0): boolean {
  return !flugverbot(lage, wind) && boeenVon(lage, wind) >= 70;
}

export function windText(kmh: number): string {
  return kmh < 12 ? "schwach" : kmh < 25 ? "mäßig" : kmh < 40 ? "frisch" : kmh < 60 ? "stürmisch" : "Sturm";
}

export function richtungText(grad: number): string {
  return ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round((((grad % 360) + 360) % 360) / 45) % 8];
}

/** Mittlere Tiefst-/Höchstwerte in Niederösterreich je Monat (°C) */
const KLIMA: [number, number][] = [
  [-3, 2], [-2, 5], [1, 10], [5, 16], [10, 21], [13, 24], [15, 27], [15, 26], [11, 21], [6, 15], [2, 8], [-2, 3],
];
const MONAT_DER_JAHRESZEIT: Record<Jahreszeit, number> = { fruehling: 4, sommer: 7, herbst: 10, winter: 1 };

function klimaMonat(t: number, o: WetterOpt): number {
  return o.jahreszeit === "auto" ? new Date(t).getMonth() + 1 : MONAT_DER_JAHRESZEIT[o.jahreszeit];
}

export function jahreszeitVon(t: number, o: WetterOpt): Jahreszeit {
  if (o.jahreszeit !== "auto") return o.jahreszeit;
  const m = new Date(t).getMonth() + 1;
  return m <= 2 || m === 12 ? "winter" : m <= 5 ? "fruehling" : m <= 8 ? "sommer" : "herbst";
}

/** gleichbleibender Zufall 0–1 je Tag (alle Spieler rechnen dasselbe) */
function tagesZufall(t: number, salz: number): number {
  const d = new Date(t);
  const tag = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  let h = (tag * 2654435761 + salz * 97) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % 10_000) / 10_000;
}

/** Charakter eines Tages: wie bewölkt, wie nass, Sturm? (für Wetter und Tagesprognose) */
export function tagesTendenz(t: number, o: WetterOpt): { wolken: number; nass: number; sturm: boolean; abw: number } {
  const jz = jahreszeitVon(t, o);
  const basisWolken = { winter: 0.7, herbst: 0.6, fruehling: 0.5, sommer: 0.38 }[jz];
  const wolken = Math.min(1, Math.max(0, basisWolken + (tagesZufall(t, 7) - 0.5) * 0.9));
  const nass = Math.min(1, Math.max(0, wolken - 0.35 + (tagesZufall(t, 11) - 0.5) * 0.5));
  const extrem = Math.max(0.02, o.wechsel / 100);
  const sturm = tagesZufall(t, 13) < 0.035 * (0.5 + extrem * 1.5);
  const spanne = 2.5 + extrem * 3.5;
  const abw = (tagesZufall(t, 1) - 0.5) * 2 * spanne;
  return { wolken, nass, sturm, abw };
}

function lageOffset(lage: WetterLage, tagsueber: boolean): number {
  const i = LAGE[lageVon(lage)];
  // Wolken dämpfen: tagsüber kühler, nachts milder
  let o = tagsueber ? 1.2 - i.wolken * 3 : -2 + i.wolken * 2.5;
  if (i.art === "regen" || i.art === "schnee" || i.art === "eis") o -= 1;
  if (i.art === "gewitter") o -= 2;
  if (lage === "hochnebel") o -= 2;
  return o;
}

/** Temperatur (°C) zur Zeit t bei dieser Wetterlage (optional weicher Übergang von der vorigen Lage) */
export function temperatur(t: number, lage: WetterLage, o: WetterOpt, vorher?: { lage: WetterLage | null | undefined; seit: number | undefined }): number {
  if (o.wechsel <= 0) return o.festTemp;
  const [tmin, tmax] = KLIMA[klimaMonat(t, o) - 1];
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  const tag = (Math.cos((2 * Math.PI * (h - 15)) / 24) + 1) / 2; // 0 um 3 Uhr, 1 um 15 Uhr
  // Abweichung vom Mittel: heute und morgen, über den Tag gleitend
  const a0 = tagesTendenz(t, o).abw;
  const a1 = tagesTendenz(t + 86_400_000, o).abw;
  const abw = a0 + (a1 - a0) * (h / 24);
  const tagsueber = h > 8 && h < 19;
  let off = lageOffset(lage, tagsueber);
  if (vorher?.lage && vorher.seit !== undefined && vorher.lage !== lage) {
    const f = Math.min(1, Math.max(0, (t - vorher.seit) / (60 * 60_000)));
    off = lageOffset(vorher.lage, tagsueber) * (1 - f) + off * f;
  }
  let wert = tmin + (tmax - tmin) * tag + abw + off;
  const art = LAGE[lageVon(lage)].art;
  if (art === "schnee") wert = Math.min(wert, lage === "schneeregen" ? 2.5 : 0.8);
  if (lage === "eisregen") wert = Math.min(Math.max(wert, -4), 0);
  if (art === "regen" && lage !== "niesel") wert = Math.max(wert, 1);
  if (art === "gewitter") wert = Math.max(wert, 17);
  return Math.round(wert * 10) / 10;
}

/** Darf diese Lage bei dieser Temperatur/Uhrzeit/Jahreszeit vorkommen? */
function erlaubt(l: WetterLage, temp: number, stunde: number, jz: Jahreszeit): boolean {
  const art = LAGE[l].art;
  if (art === "schnee") return l === "schneeregen" ? temp > -1.5 && temp < 3.5 : temp < 1.5;
  if (l === "eisregen") return temp > -5 && temp < 0.8;
  if (art === "regen") return l === "niesel" ? temp > -0.5 : temp > 1;
  if (art === "gewitter") return temp >= 17 && stunde >= 11 && stunde <= 23 && jz !== "winter";
  if (l === "hochnebel") return jz === "herbst" || jz === "winter";
  return true;
}

function ersatzLage(temp: number): WetterLage {
  return temp < 1 ? "bedeckt" : "bewoelkt";
}

/** Nächste Wetterlage: nur Nachbarn, gewichtet nach Tag, Jahreszeit, Uhrzeit und „wie wechselhaft“ */
export function nextWetter(now: number, current: WetterLage | null, o: WetterOpt = WETTER_STANDARD, wind?: number, richtung?: number): WetterAbschnitt {
  if (o.wechsel <= 0) return { lage: o.festLage, bis: now + 60 * 60_000, wind: LAGE[lageVon(o.festLage)].wind, richtung: 270 };
  const d = new Date(now);
  const stunde = d.getHours();
  const jz = jahreszeitVon(now, o);
  const temp = temperatur(now, "bewoelkt", o);
  const tend = tagesTendenz(now, o);
  const v = Math.min(100, Math.max(1, o.wechsel)) / 100;
  const cur = current ? lageVon(current) : null;
  let kandidaten: WetterLage[] = cur ? [cur, ...NACHBAR[cur]] : (Object.keys(LAGE) as WetterLage[]);
  kandidaten = kandidaten.filter((l) => erlaubt(l, temp, stunde, jz));
  if (!kandidaten.length) kandidaten = [ersatzLage(temp)];
  const morgen = stunde >= 3 && stunde <= 10;
  const gew: [WetterLage, number][] = kandidaten.map((l) => {
    const i = LAGE[l];
    let w = 1;
    // passend zum Charakter des Tages
    w *= Math.exp(-((i.wolken - tend.wolken) ** 2) / 0.08);
    const nass = i.art === "regen" || i.art === "schnee" || i.art === "eis" || i.art === "gewitter";
    w *= nass ? 0.25 + tend.nass * 2 : 1.3 - tend.nass * 0.8;
    if (i.heftig) w *= 0.25 + v * 1.6;
    if (i.art === "nebel" && l !== "hochnebel") w *= (morgen ? 2 : 0.25) * (jz === "sommer" ? 0.35 : jz === "fruehling" ? 0.7 : 1);
    if (i.art === "gewitter") w *= stunde >= 13 && stunde <= 20 ? 1.4 : 0.4;
    if (l === "hagel" || l === "unwetter" || l === "eisregen") w *= 0.35;
    if (l === cur) w *= (4.5 - v * 3.8) * (i.heftig ? 0.45 : 1); // bleibt eher, je beständiger; Heftiges hält nicht lange
    return [l, Math.max(0.0001, w)];
  });
  const sum = gew.reduce((a, x) => a + x[1], 0);
  let r = Math.random() * sum;
  let lage: WetterLage = gew[0][0];
  for (const [l, w] of gew) {
    r -= w;
    if (r <= 0) {
      lage = l;
      break;
    }
  }
  // Dauer: beständig ~8 h, normal ~3 h, sehr wechselhaft ~1 h; Gewitter immer kürzer
  const basis = 480 * Math.pow(55 / 480, v);
  let dauer = basis * (0.6 + Math.random() * 0.8);
  if (LAGE[lage].art === "gewitter") dauer = Math.min(dauer, 25 + Math.random() * 45);
  else if (LAGE[lage].heftig) dauer = Math.min(dauer, 60 + Math.random() * 120);
  // Wind: zum Ziel der Lage gleitend, an Sturmtagen deutlich mehr
  const ziel = LAGE[lage].wind + (tend.sturm ? 38 : 0) + (Math.random() - 0.5) * 8;
  const neuWind = Math.max(1, Math.round((wind ?? ziel) * 0.45 + ziel * 0.55));
  const neuRichtung = Math.round((((richtung ?? 270) + (Math.random() - 0.5) * 70 + (270 - (richtung ?? 270)) * 0.15) % 360 + 360) % 360);
  return { lage, bis: now + dauer * 60_000, wind: neuWind, richtung: neuRichtung };
}

const HORIZONT = 13 * 3_600_000;

/** Plan für die nächsten Stunden auffüllen (für die Prognose) */
export function planAuffuellen(w: Wetter, o: WetterOpt): void {
  if (o.wechsel <= 0) {
    w.plan = [];
    return;
  }
  const plan = (w.plan ??= []);
  let letzte: WetterAbschnitt = plan.length ? plan[plan.length - 1] : w;
  while (letzte.bis < w.bis + HORIZONT) {
    const n = nextWetter(letzte.bis, letzte.lage, o, letzte.wind, letzte.richtung);
    plan.push(n);
    letzte = n;
  }
}

/** Zum nächsten Abschnitt wechseln, wenn der aktuelle vorbei ist. Gibt true zurück, wenn sich die Lage geändert hat. */
export function wetterFortschreiben(w: Wetter, t: number, o: WetterOpt): boolean {
  w.lage = lageVon(w.lage);
  const alt = w.lage;
  if (o.wechsel <= 0) {
    w.lage = o.festLage;
    w.bis = t + 60 * 60_000;
    w.wind = LAGE[o.festLage].wind;
    w.richtung ??= 270;
    w.plan = [];
    if (alt !== w.lage) {
      w.vorher = alt;
      w.seit = t;
    }
    return alt !== w.lage;
  }
  let schritte = 0;
  while (t >= w.bis && schritte++ < 50) {
    const n = w.plan?.shift() ?? nextWetter(w.bis, w.lage, o, w.wind, w.richtung);
    if (n.lage !== w.lage) {
      w.vorher = w.lage;
      w.seit = w.bis;
    }
    w.lage = lageVon(n.lage);
    w.bis = Math.max(n.bis, t + 60_000);
    w.wind = n.wind ?? w.wind;
    w.richtung = n.richtung ?? w.richtung;
  }
  // Temperatur erlaubt die Lage nicht mehr (z. B. Regen bei Frost): sanft zur Nachbarlage
  const jz = jahreszeitVon(t, o);
  const temp = temperatur(t, "bewoelkt", o);
  if (!erlaubt(w.lage, temp, new Date(t).getHours(), jz)) {
    const ers = NACHBAR[w.lage].find((l) => erlaubt(l, temp, new Date(t).getHours(), jz)) ?? ersatzLage(temp);
    w.vorher = w.lage;
    w.seit = t;
    w.lage = ers;
    w.plan = [];
  }
  if (!w.plan?.length || w.plan[w.plan.length - 1].bis < t + HORIZONT) planAuffuellen(w, o);
  return alt !== w.lage;
}

/** Neue Wetterlage sofort (zum Testen); der Plan wird neu gerechnet */
export function wetterSetzen(lage: WetterLage, t: number, o: WetterOpt, vorher?: Wetter): Wetter {
  const w: Wetter = { lage, bis: t + 90 * 60_000, wind: LAGE[lage].wind, richtung: vorher?.richtung ?? 270, plan: [], vorher: vorher?.lage ?? null, seit: t };
  planAuffuellen(w, o);
  return w;
}

/** fester Zufall je Stunde (für kleine Schwankungen von Wind, Feuchte, Druck) */
function stundenZufall(t: number, salz: number): number {
  const h = Math.floor(t / 3_600_000);
  let x = (h * 374761393 + salz * 668265263) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return (((x ^ (x >>> 16)) >>> 0) % 1000) / 1000;
}

export interface WetterWerte {
  zeit: number;
  lage: WetterLage;
  temp: number;
  gefuehlt: number;
  wind: number;
  boeen: number;
  richtung: number;
  feuchte: number;
  /** Sichtweite km */
  sicht: number;
  druck: number;
  /** Regenwahrscheinlichkeit % */
  regen: number;
  nacht: boolean;
}

/** alle Werte zu einer Zeit, aus Lage und Wind */
function werte(t: number, a: WetterAbschnitt, o: WetterOpt, vorher?: { lage: WetterLage | null | undefined; seit: number | undefined }, naechste?: WetterLage): WetterWerte {
  const lage = lageVon(a.lage);
  const i = LAGE[lage];
  const temp = temperatur(t, lage, o, vorher);
  const h = new Date(t).getHours();
  const nacht = h < 6 || h >= 20;
  const wind = Math.max(0, Math.round((a.wind ?? i.wind) * (0.85 + stundenZufall(t, 1) * 0.3)));
  const boeen = Math.max(wind, boeenVon(lage, wind));
  let feuchte = i.feuchte + (nacht ? 8 : 0) - (temp > 28 ? 12 : temp > 22 ? 6 : 0) + Math.round((stundenZufall(t, 2) - 0.5) * 6);
  feuchte = Math.min(100, Math.max(20, feuchte));
  const tend = tagesTendenz(t, o);
  const druck = Math.round(1016 + (1 - tend.nass) * 8 - i.wolken * 6 - (i.heftig ? 6 : 0) - (tend.sturm ? 8 : 0) + (stundenZufall(t, 3) - 0.5) * 3);
  let regen = i.regen;
  if (naechste && LAGE[naechste].regen > regen) regen = Math.round((regen + LAGE[naechste].regen) / 2);
  // gefühlte Temperatur: Windkühle bzw. Schwüle
  let gefuehlt = temp;
  if (temp <= 10 && wind > 5) gefuehlt = 13.12 + 0.6215 * temp - 11.37 * wind ** 0.16 + 0.3965 * temp * wind ** 0.16;
  else if (temp >= 26) gefuehlt = temp + (feuchte - 40) * 0.08;
  return { zeit: t, lage, temp, gefuehlt: Math.round(gefuehlt), wind, boeen, richtung: a.richtung ?? 270, feuchte, sicht: i.sicht, druck, regen, nacht };
}

/** Werte jetzt */
export function wetterJetzt(w: Wetter, t: number, o: WetterOpt): WetterWerte {
  if (o.wechsel <= 0) return werte(t, { lage: o.festLage, bis: t, wind: LAGE[o.festLage].wind }, o);
  return werte(t, w, o, { lage: w.vorher, seit: w.seit }, w.plan?.[0]?.lage);
}

export type PrognoseStunde = WetterWerte;

/** Stündliche Prognose ab jetzt (erster Eintrag = jetzt) */
export function prognose(w: Wetter, t: number, o: WetterOpt, stunden = 12): PrognoseStunde[] {
  const abschnitte: WetterAbschnitt[] = [{ lage: w.lage, bis: w.bis, wind: w.wind, richtung: w.richtung }, ...(w.plan ?? [])];
  const abschnittUm = (z: number) => {
    const i = abschnitte.findIndex((a) => z < a.bis);
    return i < 0 ? { a: abschnitte[abschnitte.length - 1], n: undefined } : { a: abschnitte[i], n: abschnitte[i + 1]?.lage };
  };
  const out: PrognoseStunde[] = [wetterJetzt(w, t, o)];
  const start = (Math.floor(t / 3_600_000) + 1) * 3_600_000;
  for (let k = 0; k < stunden; k++) {
    const z = start + k * 3_600_000;
    if (o.wechsel <= 0) out.push(werte(z, { lage: o.festLage, bis: z, wind: LAGE[o.festLage].wind }, o));
    else {
      const { a, n } = abschnittUm(z);
      out.push(werte(z, a, o, undefined, n));
    }
  }
  return out;
}

export interface TagesPrognose {
  tag: number;
  lage: WetterLage;
  min: number;
  max: number;
  regen: number;
  windMax: number;
}

/** Tagesprognose für die nächsten Tage (heute zuerst) – aus dem Charakter jedes Tages */
export function tagesPrognose(w: Wetter, t: number, o: WetterOpt, tage = 5): TagesPrognose[] {
  const out: TagesPrognose[] = [];
  const d0 = new Date(t);
  d0.setHours(12, 0, 0, 0);
  for (let i = 0; i < tage; i++) {
    const mittag = d0.getTime() + i * 86_400_000;
    if (o.wechsel <= 0) {
      out.push({ tag: mittag, lage: o.festLage, min: o.festTemp, max: o.festTemp, regen: LAGE[o.festLage].regen, windMax: LAGE[o.festLage].wind });
      continue;
    }
    const tend = tagesTendenz(mittag, o);
    const jz = jahreszeitVon(mittag, o);
    const tMittag = temperatur(mittag, "bewoelkt", o);
    // typische Lage des Tages
    let lage: WetterLage =
      tend.wolken < 0.2 ? "klar" : tend.wolken < 0.35 ? "heiter" : tend.wolken < 0.55 ? "leicht_bewoelkt" : tend.wolken < 0.75 ? "bewoelkt" : "bedeckt";
    if (tend.nass > 0.45) lage = tMittag < 1 ? "schnee" : tend.nass > 0.7 ? "regen" : "leichter_regen";
    if (tend.nass > 0.35 && jz === "sommer" && tMittag > 22) lage = "gewitter";
    if (jz !== "sommer" && tend.wolken > 0.85 && tend.nass < 0.3) lage = jz === "winter" || jz === "herbst" ? "hochnebel" : "bedeckt";
    // heute: was die stündliche Prognose zeigt, hat Vorrang
    if (i === 0) {
      const p = prognose(w, t, o, 12);
      const zaehl = new Map<WetterLage, number>();
      for (const x of p) zaehl.set(x.lage, (zaehl.get(x.lage) ?? 0) + 1);
      lage = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    const temps = Array.from({ length: 24 }, (_, h) => {
      const z = new Date(mittag);
      z.setHours(h, 0, 0, 0);
      return temperatur(z.getTime(), lage, o);
    });
    out.push({
      tag: mittag,
      lage,
      min: Math.round(Math.min(...temps)),
      max: Math.round(Math.max(...temps)),
      regen: Math.round(Math.min(95, Math.max(LAGE[lage].regen * 0.7, tend.nass * 100)) / 5) * 5,
      windMax: Math.round(LAGE[lage].wind * 1.6 + (tend.sturm ? 50 : 0)),
    });
  }
  return out;
}

export interface Warnung {
  art: string;
  stufe: "gelb" | "orange" | "rot";
  text: string;
  von: number;
  bis: number;
}

/** Wetterwarnungen für die nächsten 24 Stunden (aus der Prognose) */
export function warnungen(w: Wetter, t: number, o: WetterOpt): Warnung[] {
  const p = prognose(w, t, o, 24);
  const roh: { art: string; stufe: Warnung["stufe"]; text: string; zeit: number }[] = [];
  for (const x of p) {
    const l = x.lage;
    if (l === "unwetter") roh.push({ art: "Unwetter", stufe: "rot", text: "Unwetter mit Starkregen und Sturmböen", zeit: x.zeit });
    else if (l === "hagel") roh.push({ art: "Gewitter", stufe: "orange", text: "Gewitter mit Hagel", zeit: x.zeit });
    else if (l === "gewitter") roh.push({ art: "Gewitter", stufe: "gelb", text: "Gewitter", zeit: x.zeit });
    if (l === "starkregen") roh.push({ art: "Starkregen", stufe: "orange", text: "Starkregen", zeit: x.zeit });
    if (x.boeen >= 100) roh.push({ art: "Sturm", stufe: "rot", text: `Orkanartige Böen bis ${x.boeen} km/h`, zeit: x.zeit });
    else if (x.boeen >= 80) roh.push({ art: "Sturm", stufe: "orange", text: `Sturmböen bis ${x.boeen} km/h`, zeit: x.zeit });
    else if (x.boeen >= 60) roh.push({ art: "Wind", stufe: "gelb", text: `Windböen bis ${x.boeen} km/h`, zeit: x.zeit });
    if (l === "eisregen") roh.push({ art: "Glatteis", stufe: "rot", text: "Glatteis durch gefrierenden Regen", zeit: x.zeit });
    else if ((LAGE[l].art === "schnee" || LAGE[l].art === "regen") && x.temp < 1) roh.push({ art: "Glätte", stufe: "gelb", text: "Glätte durch Schnee/Nässe", zeit: x.zeit });
    if (l === "starker_schnee") roh.push({ art: "Schneefall", stufe: "orange", text: "Starker Schneefall", zeit: x.zeit });
    if (l === "nebel") roh.push({ art: "Nebel", stufe: "gelb", text: "Dichter Nebel, Sichtweite unter 200 m", zeit: x.zeit });
    if (x.temp >= 35) roh.push({ art: "Hitze", stufe: "orange", text: `Große Hitze bis ${Math.round(x.temp)} °C`, zeit: x.zeit });
    else if (x.temp >= 30) roh.push({ art: "Hitze", stufe: "gelb", text: `Hitze bis ${Math.round(x.temp)} °C`, zeit: x.zeit });
    if (x.temp <= -10) roh.push({ art: "Frost", stufe: "gelb", text: `Strenger Frost bis ${Math.round(x.temp)} °C`, zeit: x.zeit });
  }
  // gleiche Art zusammenfassen (höchste Stufe, Zeitraum)
  const rang = { gelb: 0, orange: 1, rot: 2 };
  const out = new Map<string, Warnung>();
  for (const r of roh) {
    const alt = out.get(r.art);
    if (!alt) out.set(r.art, { art: r.art, stufe: r.stufe, text: r.text, von: r.zeit, bis: r.zeit + 3_600_000 });
    else {
      alt.bis = Math.max(alt.bis, r.zeit + 3_600_000);
      if (rang[r.stufe] > rang[alt.stufe]) {
        alt.stufe = r.stufe;
        alt.text = r.text;
      }
    }
  }
  return [...out.values()].sort((a, b) => rang[b.stufe] - rang[a.stufe] || a.von - b.von);
}

/** Wettertext für jetzt („Es bleibt überwiegend trocken.“) */
export function wetterSatz(p: PrognoseStunde[]): string {
  const nass = p.slice(1, 7).filter((x) => x.regen >= 60);
  const jetztNass = p[0].regen >= 60;
  const gew = p.slice(0, 7).some((x) => LAGE[x.lage].art === "gewitter");
  if (gew) return "Gewittrig – Gewitter sind möglich.";
  if (jetztNass && nass.length >= 4) return "Der Niederschlag hält an.";
  if (jetztNass) return "Der Niederschlag lässt bald nach.";
  if (nass.length) return `Ab etwa ${new Date(nass[0].zeit).getHours()} Uhr ${LAGE[nass[0].lage].art === "schnee" ? "Schneefall" : "Regen"}.`;
  if (LAGE[p[0].lage].art === "nebel") return "Nebel, langsam besser.";
  return "Es bleibt überwiegend trocken.";
}

/** Fahrzeiten am Boden: Glatteis, Schnee, Starkregen, Nebel bremsen */
export function fahrFaktor(lage: WetterLage, temp: number): number {
  const l = lageVon(lage);
  if (l === "eisregen" || l === "starker_schnee") return 1.25;
  if (l === "schnee" || l === "unwetter") return 1.15;
  if ((l === "leichter_schnee" || l === "schneeregen") && temp < 1) return 1.08;
  if (l === "starkregen" || l === "nebel" || l === "hagel") return 1.1;
  return 1;
}

/** Gruppen für die Einsatz-Gewichtung und den 3D-Effekt */
export function lageArt(lage: WetterLage): Art {
  return LAGE[lageVon(lage)].art;
}

/** Sonnenauf- und -untergang (Stunden, lokale Zeit) für einen Ort – vereinfachte Formel, ±10 min. */
export function sunTimes(date: Date, lat: number, lon: number): { auf: number; unter: number } {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (day + 10));
  const latR = (lat * Math.PI) / 180;
  const declR = (decl * Math.PI) / 180;
  const cosH = (Math.cos((90.833 * Math.PI) / 180) - Math.sin(latR) * Math.sin(declR)) / (Math.cos(latR) * Math.cos(declR));
  const h = (Math.acos(Math.min(1, Math.max(-1, cosH))) * 180) / Math.PI / 15;
  const tzOffset = -date.getTimezoneOffset() / 60;
  const solarNoon = 12 - lon / 15 + tzOffset;
  return { auf: solarNoon - h, unter: solarNoon + h };
}

/** Ist es zur Simulationszeit am Ort dunkel (inkl. 30 min Dämmerung)? */
export function istNacht(now: number, lat: number, lon: number): boolean {
  const d = new Date(now);
  const t = d.getHours() + d.getMinutes() / 60;
  const { auf, unter } = sunTimes(d, lat, lon);
  return t < auf - 0.5 || t > unter + 0.5;
}
