/**
 * Krankenhaus-Status: Öffnungszeiten (inkl. Aufnahmerad), Plätze der Akut-Bereiche und ihre Belegung.
 * Plätze: Schockraum (Trauma / internistisch / kombiniert), Herzkatheter, ECMO, Notaufnahme, Unfallambulanz,
 * Kindernotaufnahme, Kreißsaal, Druckkammer, Stroke Unit. Belegt werden sie vom Rettungsdienst und von einer
 * zufälligen Grundbelegung (andere Leitstellen, Selbstzuweiser) mit Tageskurve.
 */
import type { Hospital } from "../data/model";
import type { Schicht } from "./dienst";

export type Ressource =
  | "schockraum_trauma"
  | "schockraum_intern"
  | "schockraum"
  | "herzkatheter"
  | "ecmo"
  | "notaufnahme"
  | "unfall"
  | "kindernotaufnahme"
  | "kreisssaal"
  | "druckkammer"
  | "stroke_unit";

export interface RessourceDef {
  id: Ressource;
  name: string;
  kurz: string;
  /** Einrichtung, die das Haus dafür haben muss */
  einrichtung: string;
  /** Belegungsdauer in Minuten (von–bis) */
  dauer: [number, number];
  /** Anteil der Grundbelegung (1 = normal, 0.03 = sehr selten von selbst belegt) */
  grund: number;
}

export const RESSOURCEN: RessourceDef[] = [
  { id: "notaufnahme", name: "Notaufnahme", kurz: "NFA", einrichtung: "amb_notaufnahme", dauer: [120, 240], grund: 1 },
  { id: "unfall", name: "Unfallambulanz", kurz: "Unfall", einrichtung: "amb_unfall", dauer: [60, 180], grund: 1 },
  { id: "kindernotaufnahme", name: "Kindernotaufnahme", kurz: "Kinder", einrichtung: "amb_kindernotaufnahme", dauer: [60, 180], grund: 0.9 },
  { id: "schockraum", name: "Schockraum", kurz: "Schock", einrichtung: "fb_schockraum", dauer: [30, 60], grund: 0.04 },
  { id: "schockraum_trauma", name: "Schockraum Trauma", kurz: "Schock T", einrichtung: "fb_schockraum", dauer: [30, 60], grund: 0.04 },
  { id: "schockraum_intern", name: "Schockraum internistisch", kurz: "Schock I", einrichtung: "fb_schockraum", dauer: [30, 60], grund: 0.04 },
  { id: "herzkatheter", name: "Herzkatheter (PCI)", kurz: "PCI", einrichtung: "fb_herzkatheter", dauer: [60, 90], grund: 0.05 },
  { id: "ecmo", name: "ECMO / Cardiac Arrest", kurz: "ECMO", einrichtung: "z_cardiac_arrest_center", dauer: [720, 1440], grund: 0.02 },
  { id: "stroke_unit", name: "Stroke Unit (Akutaufnahme)", kurz: "Stroke", einrichtung: "its_stroke_unit", dauer: [30, 60], grund: 0.25 },
  { id: "kreisssaal", name: "Kreißsaal", kurz: "Kreißsaal", einrichtung: "fb_kreisssaal", dauer: [240, 480], grund: 0.6 },
  { id: "druckkammer", name: "Druckkammer", kurz: "HBO", einrichtung: "fb_druckkammer", dauer: [90, 150], grund: 0.03 },
];
export const RESSOURCE = new Map(RESSOURCEN.map((r) => [r.id, r]));

/** Einrichtungen mit Öffnungszeiten (der Rest ist immer offen, solange es ihn gibt) */
export const MIT_ZEITEN = ["amb_notaufnahme", "amb_unfall", "amb_kindernotaufnahme", "amb_psychiatrie_krise", "fb_herzkatheter", "fb_schockraum", "fb_kreisssaal", "fb_druckkammer", "its_stroke_unit", "fb_angiographie"];

const TAG_MS = 86_400_000;

function minuten(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Wochentag 1 (Mo) … 7 (So) */
function wochentag(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/** Liegt t in einem der Zeitfenster? (bis < von = über Mitternacht) */
export function inZeiten(plan: Schicht[], t: number): boolean {
  const d = new Date(t);
  const min = d.getHours() * 60 + d.getMinutes();
  const tag = wochentag(d);
  const gestern = tag === 1 ? 7 : tag - 1;
  for (const s of plan) {
    const von = minuten(s.von);
    const bis = s.bis === "24:00" ? 1440 : minuten(s.bis);
    if (bis > von) {
      if (s.tage.includes(tag) && min >= von && min < bis) return true;
    } else {
      // über Mitternacht: Abend des Tages oder Morgen des Folgetags
      if (s.tage.includes(tag) && min >= von) return true;
      if (s.tage.includes(gestern) && min < bis) return true;
    }
  }
  return false;
}

/**
 * Aufnahmerad (z. B. Linz): fester Zyklus, je Tag ein Buchstabe für das diensthabende Haus
 * (Dienst von „wechsel“ bis „wechsel“ am Folgetag). Je Einrichtung steht, an welchen Buchstaben-Tagen sie aufnimmt.
 */
export interface Aufnahmerad {
  gruppe: string;
  /** erster Tag des Zyklus (yyyy-mm-dd) */
  start: string;
  /** ein Buchstabe je Tag, z. B. "SBSKBBSK…" */
  zyklus: string;
  /** Uhrzeit des Wechsels, z. B. "07:00" */
  wechsel: string;
  /** Einrichtung → Buchstaben der Tage, an denen sie aufnimmt (nur diese sind vom Rad betroffen) */
  einrichtungen: Record<string, string>;
}

/** Buchstabe des diensthabenden Hauses zum Zeitpunkt t */
export function radTag(r: Aufnahmerad, t: number): string {
  const d = new Date(t - minuten(r.wechsel) * 60_000);
  const [y, m, dd] = r.start.split("-").map(Number);
  const start = Date.UTC(y, (m || 1) - 1, dd || 1);
  const heute = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = r.zyklus.length;
  if (!n) return "";
  const i = Math.round((heute - start) / TAG_MS);
  return r.zyklus[((i % n) + n) % n];
}

/** Ist heute Aufnahmetag (für eine Einrichtung, sonst für die Notaufnahme bzw. die erste genannte)? */
export function aufnahmetag(r: Aufnahmerad, t: number, einrichtung?: string): boolean {
  const ids = Object.keys(r.einrichtungen);
  const id = einrichtung ?? (ids.includes("amb_notaufnahme") ? "amb_notaufnahme" : ids[0]);
  const tage = id ? r.einrichtungen[id] : undefined;
  return tage === undefined ? true : tage.includes(radTag(r, t));
}

/** Ist die Einrichtung jetzt offen (für Akutaufnahmen)? */
export function offen(h: Hospital, einrichtung: string, t: number): boolean {
  if (!(h.einrichtungen ?? []).includes(einrichtung)) return false;
  const rad = h.aufnahmerad;
  if (rad && rad.einrichtungen[einrichtung] !== undefined && !aufnahmetag(rad, t, einrichtung)) return false;
  const z = h.zeiten?.[einrichtung];
  return z && z.length ? inZeiten(z, t) : true;
}

/** Zeitfenster als Text: „Mo–Fr 07:00–15:00“ */
export function zeitenText(plan: Schicht[] | undefined): string {
  if (!plan || !plan.length) return "rund um die Uhr";
  const TAG = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const tage = (l: number[]) => {
    const s = [...l].sort((a, b) => a - b);
    if (s.length === 7) return "täglich";
    const teile: string[] = [];
    let i = 0;
    while (i < s.length) {
      let j = i;
      while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
      teile.push(j > i + 1 ? `${TAG[s[i]]}–${TAG[s[j]]}` : j === i + 1 ? `${TAG[s[i]]}, ${TAG[s[j]]}` : TAG[s[i]]);
      i = j + 1;
    }
    return teile.join(", ");
  };
  if (plan.length === 1 && plan[0].tage.length === 7 && plan[0].von === "00:00" && (plan[0].bis === "24:00" || plan[0].bis === "00:00")) return "rund um die Uhr";
  return plan.map((s) => `${tage(s.tage)} ${s.von}–${s.bis}`).join(" · ");
}

// ------------------------------------------------------------------ Plätze

/** Plätze je Ressource (eigene Angabe des Hauses, sonst 0 = gibt es nicht) */
export function plaetze(h: Hospital, r: Ressource): number {
  const def = RESSOURCE.get(r)!;
  if (!(h.einrichtungen ?? []).includes(def.einrichtung)) return 0;
  return Math.max(0, h.plaetze?.[r] ?? 0);
}

export interface Belegung {
  bis: number;
  /** Einsatz-ID (Rettungsdienst) oder "" (Grundbelegung) */
  einsatz: string;
}
/** Belegung: khId → Ressource → Liste */
export type BelegungMap = Record<string, Partial<Record<Ressource, Belegung[]>>>;

export function belegt(b: BelegungMap | undefined, khId: string, r: Ressource, t: number): number {
  return (b?.[khId]?.[r] ?? []).filter((x) => x.bis > t).length;
}

/** Welche Ressource braucht der Patient in diesem Haus? (Reihenfolge: erste passende mit Plätzen) */
export function ressourcenFuer(buchung: string | undefined, eignung: "passend" | "ausweich" | "rueckfall", kind: boolean): Ressource[][] {
  const b = buchung ?? "";
  if (eignung === "ausweich" || eignung === "rueckfall") {
    if (/verletz|verbrennung|trauma|amputation|gesicht/.test(b)) return [["unfall"], ["notaufnahme"]];
    return kind ? [["kindernotaufnahme"], ["notaufnahme"]] : [["notaufnahme"]];
  }
  switch (b) {
    case "bu_stemi":
      return [["herzkatheter"]];
    case "bu_laufende_reanimation_ecpr":
      return [["ecmo"], ["schockraum_intern"], ["schockraum"]];
    case "bu_reanimation_mit_rosc":
    case "bu_aortendissektion":
    case "bu_rupturiertes_bauchaortenaneurysma":
    case "bu_lungenembolie":
    case "bu_sepsis":
      return [["schockraum_intern"], ["schockraum"], ["notaufnahme"]];
    case "bu_polytrauma":
    case "bu_schweres_sht":
    case "bu_schweres_thoraxtrauma":
    case "bu_abdominaltrauma":
    case "bu_wirbelsaeulenverletzung_mit_neurologisch":
    case "bu_amputationsverletzung":
    case "bu_schwere_verbrennung":
      return [["schockraum_trauma"], ["schockraum"], ["unfall"]];
    case "bu_schlaganfall":
    case "bu_schlaganfall_mit_v_a_grossen_gefaessvers":
    case "bu_intrakranielle_blutung":
      return [["stroke_unit"], ["notaufnahme"]];
    case "bu_co_vergiftung_tauchunfall":
      return [["druckkammer"]];
    case "bu_geburt_wehen":
    case "bu_fruehgeburt":
      return [["kreisssaal"]];
    case "bu_isolierte_extremitaetenverletzung":
    case "bu_leichte_verbrennung":
    case "bu_gesichtsschaedelverletzung":
      return [["unfall"], ["notaufnahme"]];
    case "bu_verletztes_kind":
      return [["unfall"], ["kindernotaufnahme"], ["notaufnahme"]];
    case "bu_internistischer_kindernotfall":
    case "bu_kritisch_krankes_kind":
    case "bu_kritisch_krankes_neugeborenes":
    case "bu_psychische_krise_kind_jugendlicher":
      return [["kindernotaufnahme"], ["notaufnahme"]];
    default:
      return [["notaufnahme"], ["unfall"]];
  }
}

/**
 * Freie Ressource für den Patienten im Haus: erste Alternative, die das Haus hat (Plätze > 0).
 * frei = mindestens ein Platz frei; null = das Haus führt keine dieser Ressourcen (dann zählt es nicht als „voll“).
 */
export function platzFuer(h: Hospital, b: BelegungMap | undefined, alternativen: Ressource[][], t: number): { r: Ressource; frei: boolean } | null {
  let erste: Ressource | null = null;
  for (const alt of alternativen) {
    for (const r of alt) {
      if (plaetze(h, r) <= 0) continue;
      erste ??= r;
      if (belegt(b, h.id, r, t) < plaetze(h, r)) return { r, frei: true };
    }
  }
  return erste ? { r: erste, frei: false } : null;
}

// ------------------------------------------------------------------ Grundbelegung

/** Auslastung über den Tag (Stunde 0–23): vormittags viel, nachts kaum */
const KURVE = [0.18, 0.14, 0.12, 0.1, 0.1, 0.14, 0.3, 0.55, 0.8, 0.95, 1, 1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.55, 0.45, 0.35, 0.28, 0.22];

export function tageskurve(t: number): number {
  const d = new Date(t);
  const h = d.getHours();
  const f = d.getMinutes() / 60;
  return KURVE[h] * (1 - f) + KURVE[(h + 1) % 24] * f;
}

/**
 * Grundbelegung fortschreiben (dt in Minuten): je Haus und Ressource kommen zufällig Patienten dazu,
 * so dass die Auslastung im Mittel bei faktor × Tageskurve × Anteil liegt (Grundwert 60 % der Plätze).
 */
export function grundbelegungTick(b: BelegungMap, haeuser: Hospital[], t: number, dtMin: number, faktor: number, rnd = Math.random): void {
  const k = tageskurve(t) * faktor;
  for (const h of haeuser) {
    for (const def of RESSOURCEN) {
      const n = plaetze(h, def.id);
      if (n <= 0) continue;
      const liste = ((b[h.id] ??= {})[def.id] ??= []);
      // abgelaufene entfernen
      for (let i = liste.length - 1; i >= 0; i--) if (liste[i].bis <= t) liste.splice(i, 1);
      if (!offen(h, def.einrichtung, t)) continue;
      const mittel = (def.dauer[0] + def.dauer[1]) / 2;
      const ziel = Math.min(n, n * 0.6 * k * def.grund);
      const grund = liste.filter((x) => !x.einsatz).length;
      if (grund >= ziel || liste.length >= n) continue;
      // Ankünfte so, dass sich im Mittel „ziel“ Plätze füllen
      const rate = ziel / mittel;
      if (rnd() < rate * dtMin) liste.push({ bis: t + (def.dauer[0] + rnd() * (def.dauer[1] - def.dauer[0])) * 60_000, einsatz: "" });
    }
  }
}
