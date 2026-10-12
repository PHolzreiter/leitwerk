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

export interface Wetter {
  lage: WetterLage;
  /** Simulationszeit (ms), ab der sich das Wetter ändert */
  bis: number;
}

/** Lagen, bei denen kein Hubschrauber fliegt. */
export function flugverbot(lage: WetterLage): boolean {
  return lage === "nebel" || lage === "gewitter";
}

/** Nächste Wetterlage, abhängig von Monat und Tageszeit. */
export function nextWetter(now: number, current: WetterLage | null): Wetter {
  const d = new Date(now);
  const month = d.getMonth() + 1;
  const hour = d.getHours();
  const winter = month <= 2 || month === 12;
  const herbst = month >= 9 && month <= 11;
  const sommer = month >= 6 && month <= 8;
  const morgen = hour >= 4 && hour <= 10;

  const w: [WetterLage, number][] = [
    ["klar", 35],
    ["bewoelkt", 30],
    ["regen", sommer ? 10 : 14],
    ["nebel", (herbst || winter ? 14 : 3) * (morgen ? 2 : 0.6)],
    ["gewitter", sommer && hour >= 12 && hour <= 21 ? 8 : 0],
    ["schnee", winter ? 10 : 0],
  ];
  // Wetter bleibt eher, wie es ist
  if (current) {
    const e = w.find((x) => x[0] === current);
    if (e) e[1] *= 1.5;
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
  const dauerMin = 40 + Math.random() * 110;
  return { lage, bis: now + dauerMin * 60_000 };
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
