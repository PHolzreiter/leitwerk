/**
 * Orte im Funk (Paul 15.11.2026): Am Funk fallen immer einfache Begriffe („Mautern“, „Sportplatz Mautern“, „Dienststelle
 * Langenlois“) – im System steht dahinter ein genauer Punkt. Hier: Ort und Merkmal zu einer Position (Standort, Treffpunkt)
 * und umgekehrt der Punkt zu einem gesagten Ort (Verlegen, Abziehen „Richtung Rohrendorf“) bzw. das gesagte Krankenhaus.
 */
import { store } from "../data/store";
import type { Hospital, Poi, Station } from "../data/model";
import { alleOrte } from "../data/orte";
import { distanceM, type LatLon } from "./geo";

/** Ortsname, wie man ihn am Funk sagt: „Krems an der Donau“ → „Krems“, „St. Pölten (Harland)“ → „St. Pölten“ */
export function kurzOrt(name: string): string {
  return name
    .replace(/\s*\(.*\)\s*$/, "")
    .replace(/\s+(an der|am|an den|im|in der|bei|ob der|ob|unter der|auf der)\s+.*$/i, "")
    .replace(/\s*-\s*.*$/, (m) => (/^\s*-\s*(stadt|land|markt|dorf)\b/i.test(m) ? "" : m))
    .trim();
}

/** Merkmale, die man am Funk als Treffpunkt bzw. „auf Höhe …“ nennt */
const MERKMAL_TYP = /^(sportplatz|supermarkt|einkaufszentrum|bahnhof|baumarkt|lagerhaus|freibad|sporthalle|baumarkt,lagerhaus)$/;

/** Kurzer Name eines Merkmals ohne den langen Ortsnamen („Sportplatz Mautern an der Donau“ → „Sportplatz Mautern“) */
function merkmalName(p: Poi): string {
  const ort = p.ort ?? "";
  let n = (p.name ?? "").trim();
  if (ort && n.includes(ort)) n = n.replace(ort, kurzOrt(ort));
  return n.replace(/\s+/g, " ").trim();
}

/** Nächster Ort (aus allen bekannten Stellen mit Ortsangabe) innerhalb von max Metern */
export function naechsterOrt(p: LatLon, max = 4000): { ort: string; d: number } | null {
  let best: { ort: string; d: number } | null = null;
  for (const o of alleOrte()) {
    if (!o.ort) continue;
    const d = distanceM(p, o);
    if (d < max && (!best || d < best.d)) best = { ort: kurzOrt(o.ort), d };
  }
  return best;
}

/** Nächstes Merkmal (Sportplatz, Supermarkt, Bahnhof …) innerhalb von max Metern */
export function naechstesMerkmal(p: LatLon, max = 300): { name: string; d: number; poi: Poi } | null {
  let best: { name: string; d: number; poi: Poi } | null = null;
  for (const poi of store.list("pois") as Poi[]) {
    if (!MERKMAL_TYP.test(poi.typ ?? "")) continue;
    const d = distanceM(p, poi);
    if (d < max && (!best || d < best.d)) best = { name: merkmalName(poi), d, poi };
  }
  return best;
}

/** Treffpunkt am Funk: „beim Sportplatz Mautern“, „in Mautern“ bzw. „bei Mautern“ (der genaue Punkt bleibt im System) */
export function treffpunktWort(p: LatLon): string {
  const m = naechstesMerkmal(p, 350);
  if (m) return `beim ${m.name}`;
  const o = naechsterOrt(p, 6000);
  if (!o) return "am Weg";
  return o.d < 900 ? `in ${o.ort}` : `bei ${o.ort}`;
}

/** Standort am Funk: „in Mautern auf Höhe Sportplatz“, „bei Gföhl“; unterwegs mit Richtung („Richtung Krems“) */
export function standortText(p: LatLon, richtung?: string | null): string {
  const o = naechsterOrt(p, 6000);
  const m = naechstesMerkmal(p, 300);
  let s = o ? (o.d < 900 ? `in ${o.ort}` : `bei ${o.ort}`) : "unterwegs";
  if (m) {
    const kurz = o ? m.name.replace(new RegExp(`\\s+${o.ort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "") : m.name;
    s += ` auf Höhe ${kurz}`;
  }
  if (richtung && (!o || kurzOrt(richtung) !== o.ort)) s += `, Richtung ${kurzOrt(richtung)}`;
  return s;
}

/** Text für Vergleiche: klein, „Sankt“ → „st.“, ohne Satzzeichen */
export function norm(t: string): string {
  return ` ${t
    .toLowerCase()
    .replace(/\bsankt\b/g, "st.")
    .replace(/\bst\s+/g, "st. ")
    .replace(/[„“"'!?,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

let ortListe: { quelle: unknown; namen: { name: string; kurz: string; lat: number; lon: number; n: number }[] } | null = null;
/** Alle Ortsnamen mit ihrem Mittelpunkt (Mittel der bekannten Stellen im Ort) */
function orteMitMitte(): { name: string; kurz: string; lat: number; lon: number; n: number }[] {
  const alle = alleOrte();
  if (ortListe && ortListe.quelle === alle) return ortListe.namen;
  const m = new Map<string, { name: string; kurz: string; lat: number; lon: number; n: number }>();
  for (const o of alle) {
    if (!o.ort) continue;
    const x = m.get(o.ort) ?? { name: o.ort, kurz: kurzOrt(o.ort), lat: 0, lon: 0, n: 0 };
    x.lat += o.lat;
    x.lon += o.lon;
    x.n++;
    m.set(o.ort, x);
  }
  const namen = [...m.values()].map((x) => ({ ...x, lat: x.lat / x.n, lon: x.lon / x.n }));
  ortListe = { quelle: alle, namen };
  return namen;
}

/** Ort, der in einem Text genannt wird (längster Treffer; bei gleichen Kurznamen der nächste zu nahe) */
export function ortImText(text: string, nahe?: LatLon): { name: string; kurz: string; lat: number; lon: number } | null {
  const t = norm(text);
  let best: { name: string; kurz: string; lat: number; lon: number; l: number; d: number } | null = null;
  for (const o of orteMitMitte()) {
    for (const k of [o.name, o.kurz]) {
      if (k.length < 3) continue;
      const nk = norm(k).trim();
      if (!t.includes(` ${nk} `) && !t.includes(` ${nk}.`)) continue;
      const d = nahe ? distanceM(nahe, o) : 0;
      if (!best || nk.length > best.l || (nk.length === best.l && d < best.d)) best = { name: o.name, kurz: o.kurz, lat: o.lat, lon: o.lon, l: nk.length, d };
    }
  }
  return best ? { name: best.name, kurz: best.kurz, lat: best.lat, lon: best.lon } : null;
}

/**
 * Ziel einer Verlegung bzw. Fahrtrichtung aus dem Gesagten: „Dienststelle Langenlois“, „Rohrendorf zum Sportplatz“,
 * „nach Gföhl“. Rettungsdienst-Dienststelle geht vor, dann ein Merkmal im genannten Ort, sonst der Ort selbst.
 */
export function zielImText(text: string, nahe?: LatLon): (LatLon & { label: string; funk: string; wohin: string; station?: string }) | null {
  const t = norm(text);
  const ort = ortImText(text, nahe);
  // eigene Dienststelle eines anderen Ortes („Dienststelle Langenlois“, „Wache Gföhl“, „Ortsstelle …“)
  if (/\b(dienststelle|wache|ortsstelle|bezirksstelle|stützpunkt)\b/.test(t)) {
    const rd = (store.list("stations") as Station[]).filter((s) => /rettungsdienst|notarzt/i.test(s.typ));
    const passend = rd.filter((s) => (ort && (s.ort === ort.name || norm(s.name).includes(norm(ort.kurz).trim()))) || (!ort && t.includes(norm(kurzOrt(s.ort)).trim())));
    const st = passend.sort((a, b) => (nahe ? distanceM(nahe, a) - distanceM(nahe, b) : 0))[0];
    if (st) return { lat: st.lat, lon: st.lon, label: st.name, funk: `Dienststelle ${kurzOrt(st.ort)}`, wohin: `auf die Dienststelle ${kurzOrt(st.ort)}`, station: st.id };
  }
  if (!ort) return null;
  // Merkmal im Ort („zum Sportplatz“, „beim Billa“, „zum Bahnhof“)
  const pois = (store.list("pois") as Poi[]).filter((p) => p.ort === ort.name);
  let poi: Poi | undefined;
  for (const p of pois) {
    const typWort = (p.typ ?? "").split(",")[0];
    const nameOhneOrt = norm(p.name.replace(p.ort, "")).trim();
    const nurOrt = nameOhneOrt === norm(ort.kurz).trim() || nameOhneOrt === norm(ort.name).trim();
    if ((typWort.length > 3 && t.includes(` ${typWort}`)) || (nameOhneOrt.length > 3 && !nurOrt && t.includes(` ${nameOhneOrt} `))) {
      poi = p;
      break;
    }
  }
  if (poi) return { lat: poi.lat, lon: poi.lon, label: `${poi.name}, ${poi.ort}`, funk: merkmalName(poi), wohin: `nach ${ort.kurz}, ${merkmalName(poi).replace(new RegExp(`\\s+${ort.kurz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "")}` };
  return { lat: ort.lat, lon: ort.lon, label: ort.name, funk: ort.kurz, wohin: `nach ${ort.kurz}` };
}

/** Krankenhaus, das im Text genannt wird („ins LK St. Pölten“, „Universitätsklinikum Krems“, „nach Tulln ins Klinikum“) */
export function khImText(text: string): Hospital | null {
  const t = norm(text);
  const khWort = /\b(kh|krankenhaus|klinik\w*|spital|uk|lk|ins|nach)\b/.test(t);
  let best: { h: Hospital; s: number } | null = null;
  for (const h of store.list("hospitals") as Hospital[]) {
    let s = 0;
    const kurz = norm(h.kurzname || "").trim();
    const name = norm(h.name || "").trim();
    if (kurz.length >= 4 && t.includes(` ${kurz} `)) s = 200 + kurz.length;
    else if (name.length >= 6 && t.includes(` ${name} `)) s = 150 + name.length;
    else if (khWort && h.ort) {
      const o = norm(kurzOrt(h.ort)).trim();
      if (o.length >= 3 && t.includes(` ${o} `)) s = 50 + o.length;
    }
    if (!s) continue;
    // Primärversorgung/Ambulatorium nur, wenn ausdrücklich genannt
    if (/primärversorgung|pvz|ambulatorium|ordination/i.test(h.name) && s < 150) s -= 40;
    if (!best || s > best.s) best = { h, s };
  }
  return best?.h ?? null;
}
