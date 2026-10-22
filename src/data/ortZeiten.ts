/**
 * Wann an einem Ort Einsätze und Krankentransporte entstehen. Fehlt ein Eintrag, geht es immer
 * (Wohnung, Straßen, Gelände). Feiertage zählen wie Sonntag.
 *
 * Schreibweise: „Mo-Fr 7-16; Sa 8-12“ – mehrere Zeiten mit „;“, Tage optional (ohne = täglich),
 * „Fr-Sa 22-5“ geht über Mitternacht (Freitag 22 Uhr bis Samstag 5 Uhr).
 */
import type { OrtArt } from "../abfrage/szenario";
import { kategorienFuerOrtArt } from "./orte";

export const ORT_ZEITEN: Record<string, { einsatz?: string; kt?: string }> = {
  // Pflege & Gesundheit
  pflegeheim: { kt: "Mo-Fr 7-16" },
  betreutes_wohnen: { kt: "Mo-Fr 7-16" },
  behinderteneinrichtung: { kt: "Mo-Fr 7-16" },
  reha: { kt: "Mo-Fr 8-15" },
  arztpraxis: { einsatz: "Mo-Fr 8-18", kt: "Mo-Fr 8-18" },
  primaerversorgung: { einsatz: "Mo-Fr 7-19; Sa 8-12", kt: "Mo-Fr 7-19; Sa 8-12" },
  // Kinder & Bildung
  kinderkrippe: { einsatz: "Mo-Fr 7-17" },
  kindergarten: { einsatz: "Mo-Fr 7-17" },
  volksschule: { einsatz: "Mo-Fr 7:30-16" },
  mittelschule: { einsatz: "Mo-Fr 7:30-16" },
  hoehere_schule: { einsatz: "Mo-Fr 7:30-16" },
  berufsschule: { einsatz: "Mo-Fr 7:30-16" },
  sonderschule: { einsatz: "Mo-Fr 7:30-16" },
  schule: { einsatz: "Mo-Fr 7:30-16" },
  hochschule: { einsatz: "Mo-Fr 8-20" },
  // Verkehr
  haltestelle: { einsatz: "5-24" },
  busbahnhof: { einsatz: "5-22" },
  // Einkauf
  supermarkt: { einsatz: "Mo-Sa 7-20" },
  einkauf: { einsatz: "Mo-Sa 7-20" },
  einkaufszentrum: { einsatz: "Mo-Sa 9-20" },
  baumarkt: { einsatz: "Mo-Sa 7:30-19" },
  // Arbeit & Betriebe
  industrie: { einsatz: "Mo-Fr 6-22" },
  arbeit: { einsatz: "Mo-Fr 6-22" },
  steinbruch: { einsatz: "Mo-Fr 6-18; Sa 7-12" },
  saegewerk: { einsatz: "Mo-Fr 6-18; Sa 7-12" },
  lagerhaus: { einsatz: "Mo-Fr 6-18; Sa 7-12" },
  kraftwerk: { einsatz: "Mo-Fr 7-16" },
  windrad: { einsatz: "Mo-Fr 7-16" },
  sendemast: { einsatz: "Mo-Fr 7-16" },
  biogasanlage: { einsatz: "Mo-Fr 7-16" },
  // Sport
  sportplatz: { einsatz: "8-22" },
  sporthalle: { einsatz: "8-22" },
  sport: { einsatz: "8-22" },
  fitnessstudio: { einsatz: "6-23" },
  reitanlage: { einsatz: "8-20" },
  tennis: { einsatz: "8-20" },
  golf: { einsatz: "8-20" },
  kletteranlage: { einsatz: "9-23" },
  skigebiet: { einsatz: "8:30-16:30" },
  eislaufplatz: { einsatz: "9-21" },
  motorsport: { einsatz: "Sa-So 9-18" },
  // Wasser
  freibad: { einsatz: "9-19" },
  bad: { einsatz: "9-19" },
  hallenbad: { einsatz: "7-21" },
  therme: { einsatz: "9-22" },
  // Freizeit & Gastronomie
  freizeitpark: { einsatz: "9-18" },
  tierpark: { einsatz: "9-18" },
  museum: { einsatz: "Di-So 10-17" },
  veranstaltung: { einsatz: "14-24" },
  disco: { einsatz: "Fr-Sa 22-5" },
  heuriger: { einsatz: "15-23" },
  ausflugsziel: { einsatz: "8-20" },
  // Gelände mit Zeiten
  kellergasse: { einsatz: "8-22" },
  hochstand: { einsatz: "5-9; 16-22" },
};

/** Orte ohne POI-Kategorie, die trotzdem Zeiten haben */
const ORTART_ZEITEN: Partial<Record<OrtArt, string>> = { baustelle: "Mo-Fr 6:30-17" };

interface Fenster {
  tage: number[]; // 1 = Mo … 7 = So
  von: number; // Stunden (7.5 = 7:30)
  bis: number;
}

const TAG: Record<string, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };
const cache = new Map<string, Fenster[]>();

/** „Mo-Fr 7:30-16; Sa 8-12“ → Zeitfenster */
export function zeitenLesen(text: string): Fenster[] {
  const c = cache.get(text);
  if (c) return c;
  const out: Fenster[] = [];
  for (const teil of text.split(";")) {
    const m = teil.trim().match(/^(?:([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?\s+)?(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/);
    if (!m) continue;
    const t0 = m[1] ? TAG[m[1].toLowerCase()] : 1;
    const t1 = m[2] ? TAG[m[2].toLowerCase()] : m[1] ? t0 : 7;
    if (!t0 || !t1) continue;
    const tage: number[] = [];
    for (let t = t0; ; t = (t % 7) + 1) {
      tage.push(t);
      if (t === t1) break;
    }
    out.push({ tage, von: Number(m[3]) + Number(m[4] ?? 0) / 60, bis: Number(m[5]) + Number(m[6] ?? 0) / 60 });
  }
  cache.set(text, out);
  return out;
}

/** Ostersonntag (Gauß/Meeus) */
function ostern(j: number): Date {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(j, monat - 1, tag);
}

const feiertagCache = new Map<number, Set<string>>();
/** Österreichischer gesetzlicher Feiertag? */
export function istFeiertag(d: Date): boolean {
  const j = d.getFullYear();
  let s = feiertagCache.get(j);
  if (!s) {
    s = new Set(["1-1", "1-6", "5-1", "8-15", "10-26", "11-1", "12-8", "12-25", "12-26"]);
    const o = ostern(j);
    for (const plus of [1, 39, 50, 60]) {
      const x = new Date(o.getFullYear(), o.getMonth(), o.getDate() + plus);
      s.add(`${x.getMonth() + 1}-${x.getDate()}`);
    }
    feiertagCache.set(j, s);
  }
  return s.has(`${d.getMonth() + 1}-${d.getDate()}`);
}

/** Wochentag 1 = Mo … 7 = So; Feiertag = 7 */
function wochentag(d: Date): number {
  if (istFeiertag(d)) return 7;
  return ((d.getDay() + 6) % 7) + 1;
}

/** Liegt der Zeitpunkt in den Zeiten? (leer = immer) */
export function offenUm(text: string | undefined, t: number): boolean {
  if (!text || /^immer$/i.test(text.trim())) return true;
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  const heute = wochentag(d);
  const gestern = wochentag(new Date(t - 86_400_000));
  for (const f of zeitenLesen(text)) {
    if (f.bis > f.von) {
      if (f.tage.includes(heute) && h >= f.von && h < f.bis) return true;
    } else {
      // über Mitternacht: Beginn heute oder Ende des gestrigen Fensters
      if (f.tage.includes(heute) && h >= f.von) return true;
      if (f.tage.includes(gestern) && h < f.bis) return true;
    }
  }
  return false;
}

/** Entstehen an einem Ort dieser Kategorie gerade Einsätze? */
export function katOffen(kat: string, t: number): boolean {
  return offenUm(ORT_ZEITEN[kat]?.einsatz, t);
}

/** Krankentransporte von/zu diesem Ort gerade möglich? (nur Orte mit KT-Zeiten) */
export function katKtOffen(kat: string, t: number): boolean {
  const z = ORT_ZEITEN[kat]?.kt;
  return !!z && offenUm(z, t);
}

/** Ist irgendein Ort dieser Art gerade offen? (für Einsatzorte ohne passenden POI im Gebiet) */
export function ortArtOffen(art: OrtArt, t: number): boolean {
  const eigene = ORTART_ZEITEN[art];
  if (eigene) return offenUm(eigene, t);
  const kats = kategorienFuerOrtArt(art);
  return !kats.length || kats.some((k) => katOffen(k, t));
}

/** Tag (7–19) oder Nacht (19–7)? */
export function istTagsueber(t: number): boolean {
  const h = new Date(t).getHours();
  return h >= 7 && h < 19;
}
