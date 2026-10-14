/** Einfaches Wettermodell und Tag/Nacht für die Flugrettung. */

export type WetterLage = "klar" | "bewoelkt" | "regen" | "nebel" | "gewitter" | "schnee";

export const WETTER_LABEL: Record<WetterLage, string> = {
  klar: "Klar",
  bewoelkt: "Bewölkt",
  regen: "Regen",
  nebel: "Nebel",
  gewitter: "Gewitter",
  schnee: "Schneefall",
};

export const WETTER_SYMBOL: Record<WetterLage, string> = {
  klar: "☀",
  bewoelkt: "☁",
  regen: "🌧",
  nebel: "🌫",
  gewitter: "⛈",
  schnee: "❄",
};

export type Jahreszeit = "fruehling" | "sommer" | "herbst" | "winter";
export type WetterModus = "realistisch" | "wechselhaft" | "fest";

export const JAHRESZEIT_LABEL: Record<Jahreszeit, string> = { fruehling: "Frühling", sommer: "Sommer", herbst: "Herbst", winter: "Winter" };

export interface WetterAbschnitt {
  lage: WetterLage;
  /** Simulationszeit (ms), ab der sich das Wetter ändert */
  bis: number;
}

export interface Wetter extends WetterAbschnitt {
  /** die nächsten Abschnitte (für die Prognose) */
  plan?: WetterAbschnitt[];
}

export interface WetterOpt {
  modus: WetterModus;
  /** "auto" = nach dem Spieldatum */
  jahreszeit: Jahreszeit | "auto";
  festLage: WetterLage;
  festTemp: number;
}

export const WETTER_STANDARD: WetterOpt = { modus: "realistisch", jahreszeit: "auto", festLage: "klar", festTemp: 18 };

/** Lagen, bei denen kein Hubschrauber fliegt. */
export function flugverbot(lage: WetterLage): boolean {
  return lage === "nebel" || lage === "gewitter";
}

/** Mittlere Tiefst-/Höchstwerte in Niederösterreich je Monat (°C) */
const KLIMA: [number, number][] = [
  [-3, 2], [-2, 5], [1, 10], [5, 16], [10, 21], [13, 24], [15, 27], [15, 26], [11, 21], [6, 15], [2, 8], [-2, 3],
];
const MONAT_DER_JAHRESZEIT: Record<Jahreszeit, number> = { fruehling: 4, sommer: 7, herbst: 10, winter: 1 };

/** Monat (1–12) fürs Klima: echtes Spieldatum oder die gewählte Jahreszeit */
function klimaMonat(t: number, o: WetterOpt): number {
  return o.jahreszeit === "auto" ? new Date(t).getMonth() + 1 : MONAT_DER_JAHRESZEIT[o.jahreszeit];
}

export function jahreszeitVon(t: number, o: WetterOpt): Jahreszeit {
  if (o.jahreszeit !== "auto") return o.jahreszeit;
  const m = new Date(t).getMonth() + 1;
  return m <= 2 || m === 12 ? "winter" : m <= 5 ? "fruehling" : m <= 8 ? "sommer" : "herbst";
}

/** gleichbleibender Zufall je Tag (alle Spieler rechnen dasselbe) */
function tagesZufall(t: number, salz: number): number {
  const d = new Date(t);
  const tag = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
  let h = (tag * 2654435761 + salz * 97) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h % 10_000) / 10_000;
}

/** Temperatur (°C) zur Zeit t bei dieser Wetterlage */
export function temperatur(t: number, lage: WetterLage, o: WetterOpt): number {
  if (o.modus === "fest") return o.festTemp;
  const [tmin, tmax] = KLIMA[klimaMonat(t, o) - 1];
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  const tag = (Math.cos((2 * Math.PI * (h - 15)) / 24) + 1) / 2; // 0 um 3 Uhr, 1 um 15 Uhr
  const spanne = o.modus === "wechselhaft" ? 5.5 : 3.5;
  // Abweichung vom Mittel: heute und morgen, über den Tag gleitend
  const a0 = (tagesZufall(t, 1) - 0.5) * 2 * spanne;
  const a1 = (tagesZufall(t + 86_400_000, 1) - 0.5) * 2 * spanne;
  const abw = a0 + (a1 - a0) * (h / 24);
  const tagsueber = h > 8 && h < 19;
  const off: Record<WetterLage, number> = {
    klar: tagsueber ? 1 : -1.5,
    bewoelkt: tagsueber ? -1 : 0.5,
    regen: -2,
    nebel: -1,
    gewitter: -3,
    schnee: -1,
  };
  let wert = tmin + (tmax - tmin) * tag + abw + off[lage];
  if (lage === "schnee") wert = Math.min(wert, 1);
  if (lage === "regen") wert = Math.max(wert, 1);
  if (lage === "gewitter") wert = Math.max(wert, 17);
  return Math.round(wert * 10) / 10;
}

/** Nächste Wetterlage, abhängig von Jahreszeit, Tageszeit, Temperatur und Einstellung. */
export function nextWetter(now: number, current: WetterLage | null, o: WetterOpt = WETTER_STANDARD): WetterAbschnitt {
  if (o.modus === "fest") return { lage: o.festLage, bis: now + 60 * 60_000 };
  const hour = new Date(now).getHours();
  const jz = jahreszeitVon(now, o);
  const temp = temperatur(now, "bewoelkt", o);
  const morgen = hour >= 4 && hour <= 10;
  const wechselhaft = o.modus === "wechselhaft";
  const extrem = wechselhaft ? 2 : 1;
  const w: [WetterLage, number][] = [
    ["klar", jz === "sommer" ? 40 : 30],
    ["bewoelkt", 32],
    ["regen", temp > 0.5 ? (jz === "sommer" ? 10 : 14) * extrem : 0],
    ["nebel", (jz === "herbst" || jz === "winter" ? 14 : 3) * (morgen ? 2 : 0.5) * extrem],
    ["gewitter", temp >= 20 && hour >= 12 && hour <= 21 ? 8 * extrem : 0],
    ["schnee", temp <= 1.5 ? 14 * extrem : 0],
  ];
  if (current) {
    // Wetter bleibt eher, wie es ist; Regen und Gewitter kommen meist nach Wolken
    const e = w.find((x) => x[0] === current);
    if (e) e[1] *= wechselhaft ? 0.8 : 3;
    if (current === "klar" && !wechselhaft) for (const x of w) if (x[0] === "regen" || x[0] === "gewitter" || x[0] === "schnee") x[1] *= 0.35;
  }
  const total = w.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * total;
  let lage: WetterLage = "klar";
  for (const [l, p] of w) {
    r -= p;
    if (r <= 0) {
      lage = l;
      break;
    }
  }
  const [lo, hi] = lage === "gewitter" ? [30, 80] : wechselhaft ? [30, 90] : [90, 240];
  const dauerMin = lo + Math.random() * (hi - lo);
  return { lage, bis: now + dauerMin * 60_000 };
}

const HORIZONT = 9 * 3_600_000;

/** Plan für die nächsten Stunden auffüllen (für die Prognose) */
export function planAuffuellen(w: Wetter, o: WetterOpt): void {
  if (o.modus === "fest") {
    w.plan = [];
    return;
  }
  const plan = (w.plan ??= []);
  let ende = plan.length ? plan[plan.length - 1].bis : w.bis;
  let letzte = plan.length ? plan[plan.length - 1].lage : w.lage;
  while (ende < w.bis + HORIZONT) {
    const n = nextWetter(ende, letzte, o);
    plan.push(n);
    ende = n.bis;
    letzte = n.lage;
  }
}

/** Zum nächsten Abschnitt wechseln, wenn der aktuelle vorbei ist. Gibt true zurück, wenn sich die Lage geändert hat. */
export function wetterFortschreiben(w: Wetter, t: number, o: WetterOpt): boolean {
  const alt = w.lage;
  if (o.modus === "fest") {
    w.lage = o.festLage;
    w.bis = t + 60 * 60_000;
    w.plan = [];
    return alt !== w.lage;
  }
  let schritte = 0;
  while (t >= w.bis && schritte++ < 50) {
    const n = w.plan?.shift() ?? nextWetter(w.bis, w.lage, o);
    w.lage = n.lage;
    w.bis = Math.max(n.bis, t + 60_000);
  }
  if (!w.plan?.length || w.plan[w.plan.length - 1].bis < t + HORIZONT) planAuffuellen(w, o);
  return alt !== w.lage;
}

/** Neue Wetterlage sofort (zum Testen); der Plan wird neu gerechnet */
export function wetterSetzen(lage: WetterLage, t: number, o: WetterOpt): Wetter {
  const w: Wetter = { lage, bis: t + 90 * 60_000, plan: [] };
  planAuffuellen(w, o);
  return w;
}

export interface PrognoseStunde {
  zeit: number;
  lage: WetterLage;
  temp: number;
}

/** Stündliche Prognose ab jetzt */
export function prognose(w: Wetter, t: number, o: WetterOpt, stunden = 8): PrognoseStunde[] {
  const abschnitte: WetterAbschnitt[] = [{ lage: w.lage, bis: w.bis }, ...(w.plan ?? [])];
  const lageUm = (z: number) => (o.modus === "fest" ? o.festLage : (abschnitte.find((a) => z < a.bis) ?? abschnitte[abschnitte.length - 1]).lage);
  const out: PrognoseStunde[] = [{ zeit: t, lage: w.lage, temp: temperatur(t, w.lage, o) }];
  const start = (Math.floor(t / 3_600_000) + 1) * 3_600_000;
  for (let i = 0; i < stunden; i++) {
    const z = start + i * 3_600_000;
    const l = lageUm(z);
    out.push({ zeit: z, lage: l, temp: temperatur(z, l, o) });
  }
  return out;
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
