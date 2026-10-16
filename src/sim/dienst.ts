/**
 * Dienstpläne der Fahrzeuge: Schichten mit Wochentagen, Beginn und Ende (auch Sonnenaufgang/-untergang).
 * Jede Schicht hat ein eigenes Team. Ohne Dienstplan ist ein Fahrzeug rund um die Uhr im Dienst
 * (zwei Teams: 07–19 und 19–07).
 */

/** Eine Schicht. tage: 1 = Montag … 7 = Sonntag (Tag, an dem die Schicht BEGINNT). von/bis: „HH:MM“, „SA“ (Sonnenaufgang) oder „SU“ (Sonnenuntergang). */
export interface Schicht {
  tage: number[];
  von: string;
  bis: string;
}

export const TAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const ALLE_TAGE = [1, 2, 3, 4, 5, 6, 7];
export const WERKTAGE = [1, 2, 3, 4, 5];

/** Standard ohne Dienstplan: rund um die Uhr, Schichtwechsel 07:00 und 19:00 */
const RUND_UM_DIE_UHR: Schicht[] = [
  { tage: ALLE_TAGE, von: "07:00", bis: "19:00" },
  { tage: ALLE_TAGE, von: "19:00", bis: "07:00" },
];

const TAG_MS = 86_400_000;

// ---------------------------------------------------------------- Sonnenaufgang/-untergang

/** Sonnenauf- und -untergang (Minuten nach Mitternacht, Ortszeit) – NOAA-Näherung, auf wenige Minuten genau */
export function sonnenZeiten(datum: Date, lat: number, lon: number): { auf: number; unter: number } {
  const start = Date.UTC(datum.getFullYear(), 0, 0);
  const tag = Math.floor((Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()) - start) / TAG_MS);
  const rad = Math.PI / 180;
  const g = ((2 * Math.PI) / 365) * (tag - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dekl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(dekl)) / (Math.cos(lat * rad) * Math.cos(dekl));
  const h = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
  // UTC-Minuten → Ortszeit (Sommerzeit des jeweiligen Tages)
  const offset = -new Date(datum.getFullYear(), datum.getMonth(), datum.getDate(), 12).getTimezoneOffset();
  const auf = 720 - 4 * (lon + h) - eqt + offset;
  const unter = 720 - 4 * (lon - h) - eqt + offset;
  return { auf: Math.round(auf), unter: Math.round(unter) };
}

function minutenVon(s: string, tag: Date, ort: { lat: number; lon: number }): number {
  if (s === "SA" || s === "SU") {
    const z = sonnenZeiten(tag, ort.lat, ort.lon);
    return s === "SA" ? z.auf : z.unter;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2]));
}

/** Mitternacht des Tages (Ortszeit) */
function tagBeginn(t: number): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

function wochentag(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface SchichtFenster {
  /** eindeutig je Schicht-Termin (Datum + Nummer) – ändert sich beim Schichtwechsel */
  key: string;
  start: number;
  ende: number;
}

/** Alle Schicht-Termine, die an diesem Tag beginnen */
function termineAm(plan: Schicht[], tag: Date, ort: { lat: number; lon: number }): SchichtFenster[] {
  const wt = wochentag(tag);
  const out: SchichtFenster[] = [];
  plan.forEach((s, i) => {
    if (!s.tage.includes(wt)) return;
    const basis = tag.getTime();
    const von = minutenVon(s.von, tag, ort);
    let bis = minutenVon(s.bis, tag, ort);
    if (bis <= von) bis += 24 * 60;
    // Sommerzeit-Umstellung: über Date rechnen
    const start = new Date(basis);
    start.setHours(0, von, 0, 0);
    const ende = new Date(basis);
    ende.setHours(0, bis, 0, 0);
    out.push({ key: `${ymd(tag)}#${i}`, start: start.getTime(), ende: ende.getTime() });
  });
  return out;
}

function planOderStandard(plan: Schicht[] | undefined | null): Schicht[] {
  return plan?.length ? plan : RUND_UM_DIE_UHR;
}

/** Laufende Schicht zum Zeitpunkt t (oder null = außer Dienst) */
export function aktuelleSchicht(plan: Schicht[] | undefined | null, t: number, ort: { lat: number; lon: number }): SchichtFenster | null {
  const p = planOderStandard(plan);
  const heute = tagBeginn(t);
  const gestern = tagBeginn(heute.getTime() - TAG_MS / 2);
  let beste: SchichtFenster | null = null;
  for (const tag of [gestern, heute]) {
    for (const w of termineAm(p, tag, ort)) {
      if (w.start <= t && t < w.ende && (!beste || w.start > beste.start)) beste = w;
    }
  }
  return beste;
}

/**
 * Echtes Dienstende: Ende der laufenden Schicht – schließt direkt eine weitere an (Schichtwechsel),
 * zählt deren Ende. null = kein Ende in Sicht (rund um die Uhr) oder außer Dienst.
 */
export function dienstEnde(plan: Schicht[] | undefined | null, t: number, ort: { lat: number; lon: number }): number | null {
  const p = planOderStandard(plan);
  const w = aktuelleSchicht(p, t, ort);
  if (!w) return null;
  let ende = w.ende;
  for (let n = 0; n < 12; n++) {
    const weiter = aktuelleSchicht(p, ende + 1000, ort);
    // anschließende Schicht (Beginn bis 1 Minute nach dem Ende)
    if (!weiter || weiter.start > ende + 60_000) return ende;
    ende = weiter.ende;
    if (ende - t > 3 * TAG_MS) return null;
  }
  return null;
}

/** Ist das Fahrzeug zum Zeitpunkt t im Dienst? */
export function imDienst(plan: Schicht[] | undefined | null, t: number, ort: { lat: number; lon: number }): boolean {
  return aktuelleSchicht(plan, t, ort) !== null;
}

/** Nächster Dienstbeginn ab t (für die Anzeige „außer Dienst bis …“), höchstens 8 Tage voraus */
export function naechsterBeginn(plan: Schicht[] | undefined | null, t: number, ort: { lat: number; lon: number }): number | null {
  const p = planOderStandard(plan);
  let beste: number | null = null;
  for (let d = 0; d < 8; d++) {
    const tag = tagBeginn(t + d * TAG_MS);
    for (const w of termineAm(p, tag, ort)) if (w.start > t && (beste === null || w.start < beste)) beste = w.start;
    if (beste !== null) return beste;
  }
  return beste;
}

// ---------------------------------------------------------------- Text ↔ Dienstplan

/** Wochentage als Text: [1..5] → „Mo–Fr“, [1,3,5] → „Mo, Mi, Fr“, alle → „täglich“ */
export function tageText(tage: number[]): string {
  const t = [...new Set(tage)].filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b);
  if (t.length === 7) return "täglich";
  if (!t.length) return "nie";
  const teile: string[] = [];
  let i = 0;
  while (i < t.length) {
    let j = i;
    while (j + 1 < t.length && t[j + 1] === t[j] + 1) j++;
    if (j - i >= 2) teile.push(`${TAG_KURZ[t[i] - 1]}–${TAG_KURZ[t[j] - 1]}`);
    else for (let k = i; k <= j; k++) teile.push(TAG_KURZ[t[k] - 1]);
    i = j + 1;
  }
  return teile.join(", ");
}

export function zeitText(s: string): string {
  return s === "SA" ? "Sonnenaufgang" : s === "SU" ? "Sonnenuntergang" : s;
}

/** Dienstplan als eine Zeile, z. B. „Mo–Fr 07:00–19:00; Sa 08:00–16:00“ (leer = rund um die Uhr) */
export function planText(plan: Schicht[] | undefined | null): string {
  if (!plan?.length) return "";
  return plan.map((s) => `${tageText(s.tage)} ${zeitText(s.von)}–${zeitText(s.bis)}`).join("; ");
}

export function planKurz(plan: Schicht[] | undefined | null): string {
  return plan?.length ? planText(plan) : "rund um die Uhr";
}

const TAG_NAMEN: Record<string, number> = {
  mo: 1, montag: 1, di: 2, dienstag: 2, mi: 3, mittwoch: 3, do: 4, donnerstag: 4, fr: 5, freitag: 5, sa: 6, samstag: 6, so: 7, sonntag: 7,
};

/** „Mo–Fr“, „Mo, Mi, Fr“, „Di–Do“, „Mo–Fr, So“, „Sa, So“, „täglich“, „24/7“, „Mo-So“ → Tage */
export function tageLesen(text: string): number[] | null {
  const t = text.trim().toLowerCase().replace(/[–—]/g, "-");
  if (!t || /^(24\/7|täglich|taeglich|immer|jeden tag|alle)$/.test(t)) return [...ALLE_TAGE];
  if (/^(werktags|wochentags|unter der woche)$/.test(t)) return [...WERKTAGE];
  const tage = new Set<number>();
  for (const teil of t.replace(/\s*-\s*/g, "-").replace(/\bund\b/g, ",").split(/[,;/+\s]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = teil.match(/^([a-zä]+)\.?\s*-\s*([a-zä]+)\.?$/);
    if (m) {
      const a = TAG_NAMEN[m[1]];
      const b = TAG_NAMEN[m[2]];
      if (!a || !b) return null;
      for (let d = a; ; d = (d % 7) + 1) {
        tage.add(d);
        if (d === b) break;
      }
      continue;
    }
    const d = TAG_NAMEN[teil.replace(/\.$/, "")];
    if (!d) return null;
    tage.add(d);
  }
  return tage.size ? [...tage].sort((a, b) => a - b) : null;
}

/** „07:00“, „7:00“, „7“, „Sonnenaufgang“, „SA“ → Zeit im Plan-Format */
export function zeitLesen(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (/^(sa|sonnenaufgang|sr|sunrise)$/.test(t)) return "SA";
  if (/^(su|sonnenuntergang|ss|sunset)$/.test(t)) return "SU";
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?(?:\s*uhr)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24 || min > 59) return null;
  return `${String(h === 24 ? 0 : h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Eine Schicht aus drei Feldern (Wochentage, Beginn, Ende); „24/7“ überall = null (rund um die Uhr) */
export function schichtAusFeldern(tage: string, beginn: string, ende: string): { schicht: Schicht | null; fehler?: string } {
  const b = beginn.trim();
  const e = ende.trim();
  if (/^24\/7$/i.test(b) || /^24\/7$/i.test(e) || (!b && !e)) return { schicht: null };
  const tg = tageLesen(tage);
  if (!tg) return { schicht: null, fehler: `Wochentage „${tage}“ verstehe ich nicht` };
  const von = zeitLesen(b);
  const bis = zeitLesen(e);
  if (!von) return { schicht: null, fehler: `Beginn „${beginn}“ verstehe ich nicht` };
  if (!bis) return { schicht: null, fehler: `Ende „${ende}“ verstehe ich nicht` };
  return { schicht: { tage: tg, von, bis } };
}

/** Dienstplan aus einer Zeile („Mo–Fr 07:00–19:00; Sa 08:00–16:00“, „24/7“, „rund um die Uhr“) */
export function planLesen(text: string): { plan: Schicht[]; fehler?: string } {
  const t = text.trim();
  if (!t || /^(24\/7|rund um die uhr|immer|24h)$/i.test(t)) return { plan: [] };
  const plan: Schicht[] = [];
  for (const teil of t.split(/;|\n/).map((x) => x.trim()).filter(Boolean)) {
    const m = teil.match(/^(.*?)\s*(\d{1,2}[:.]\d{2}|sonnenaufgang|sonnenuntergang)\s*[-–—]\s*(\d{1,2}[:.]\d{2}|sonnenaufgang|sonnenuntergang)$/i);
    if (!m) return { plan, fehler: `Schicht „${teil}“ verstehe ich nicht (Beispiel: „Mo–Fr 07:00–19:00“)` };
    const s = schichtAusFeldern(m[1] || "täglich", m[2], m[3]);
    if (s.fehler) return { plan, fehler: s.fehler };
    if (s.schicht) plan.push(s.schicht);
  }
  return { plan };
}

/** Schicht-Termine einer Woche (Montag 00:00 … Sonntag 24:00), inkl. Nacht vom Sonntag davor – für die Wochenübersicht */
export function wochenTermine(plan: Schicht[] | undefined | null, montag: Date, ort: { lat: number; lon: number }): (SchichtFenster & { nr: number })[] {
  const p = planOderStandard(plan);
  const out: (SchichtFenster & { nr: number })[] = [];
  for (let d = -1; d < 7; d++) {
    const tag = new Date(montag);
    tag.setDate(montag.getDate() + d);
    tag.setHours(0, 0, 0, 0);
    for (const w of termineAm(p, tag, ort)) out.push({ ...w, nr: Number(w.key.split("#")[1]) });
  }
  return out;
}

/** Montag 00:00 der Woche von t */
export function wochenBeginn(t: number): Date {
  const d = tagBeginn(t);
  d.setDate(d.getDate() - (wochentag(d) - 1));
  return d;
}

/** Fertige Rund-um-die-Uhr-Modelle (Schichtwechsel-Zeiten) */
export const MODELLE_24_7: { name: string; wechsel: string[] }[] = [
  { name: "07–19 + 19–07", wechsel: ["07:00", "19:00"] },
  { name: "06–18 + 18–06", wechsel: ["06:00", "18:00"] },
  { name: "05–13 + 13–21 + 21–05", wechsel: ["05:00", "13:00", "21:00"] },
];

/** Rund um die Uhr mit diesen Wechselzeiten (z. B. ["06:00","14:00","22:00"]) – täglich */
export function plan247(wechsel: string[]): Schicht[] {
  const w = [...new Set(wechsel)].sort();
  if (w.length < 2) return w.length === 1 ? [{ tage: [...ALLE_TAGE], von: w[0], bis: w[0] }] : [];
  return w.map((von, i) => ({ tage: [...ALLE_TAGE], von, bis: w[(i + 1) % w.length] }));
}

/** Uhrzeit hh:mm */
export function uhrzeit(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
