/**
 * Einsatzstellen: mögliche Notfallorte, die NICHT auf der Karte stehen – Strecken und Flächen als viele Punkte
 * (Autobahn alle 500 m mit Kilometer und Richtung, Landstraßen, Wald, Berg, Ufer, Felder …) und unauffällige
 * Punkte (Bahnübergänge, Brücken, Kellergassen, Hochstände …).
 *
 * Leistung: Die Datei (data/default/einsatzstellen.csv, © OpenStreetMap-Mitwirkende) wird erst beim ersten Bedarf
 * geladen und einmal zerlegt; je Funkgruppe gibt es einen Zwischenspeicher, damit der Generator nicht jedes Mal
 * Zehntausende Punkte prüft.
 */
import stellenUrl from "../../data/default/einsatzstellen.csv?url";
import { inFunkgruppe, type Funkgruppe } from "../sim/funkgruppen";
import { kategorieLabel, type Ort } from "./orte";

export interface Einsatzstelle {
  typ: string;
  lat: number;
  lon: number;
  /** Straße (A1, B37), Wald, Berg, Fluss … */
  name: string;
  /** nächster Ort */
  ort: string;
  /** Autobahn: „km|Richtung“; Landstraße: „zwischen A und B“; Berg: Höhe; Feldweg: „Forststraße“ */
  info: string;
}

let alle: Einsatzstelle[] | null = null;
let laden: Promise<Einsatzstelle[]> | null = null;

/** Einmal laden (danach sofort da) */
export function stellenLaden(): Promise<Einsatzstelle[]> {
  if (alle) return Promise.resolve(alle);
  laden ??= (async () => {
    try {
      const r = await fetch(stellenUrl);
      alle = r.ok ? zerlegen(await r.text()) : [];
    } catch (e) {
      console.warn("Einsatzstellen nicht geladen:", e);
      alle = [];
    }
    return alle;
  })();
  return laden;
}

/** Schon geladen? (sonst leere Liste – der Generator lädt vorher) */
export function stellen(): Einsatzstelle[] {
  return alle ?? [];
}

export function zerlegen(text: string): Einsatzstelle[] {
  const out: Einsatzstelle[] = [];
  const zeilen = text.replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (!z) continue;
    const t = z.split(";");
    const lat = Number(t[1]);
    const lon = Number(t[2]);
    if (!t[0] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({ typ: t[0], lat, lon, name: t[3] ?? "", ort: t[4] ?? "", info: t.slice(5).join(";") });
  }
  return out;
}

const jeGruppe = new Map<string, Ort[]>();
/** Einsatzstellen einer Funkgruppe als „Orte“ (zwischengespeichert) */
export function stellenInGruppe(g: Funkgruppe): Ort[] {
  if (!alle) return [];
  const c = jeGruppe.get(g.id);
  if (c) return c;
  const o: Ort[] = alle
    .filter((s) => inFunkgruppe(g, s.lat, s.lon))
    .map((s, i) => ({ kind: "stellen" as const, id: `st-${g.id}-${i}`, name: s.name, ort: s.ort, lat: s.lat, lon: s.lon, kategorien: [s.typ], stelle: s }));
  jeGruppe.set(g.id, o);
  return o;
}

/** Autobahn-Angaben aus „km|Richtung“ */
export function autobahnInfo(s: Pick<Einsatzstelle, "info">): { km: number | null; richtung: string } {
  const [km, richtung] = s.info.split("|");
  const n = Number((km ?? "").replace(",", "."));
  return { km: km && Number.isFinite(n) ? n : null, richtung: (richtung ?? "").trim() };
}

const kmText = (km: number) => km.toFixed(1).replace(".", ",").replace(/,0$/, "");

/**
 * So beschreibt der Anrufer die Stelle (er kennt keine Hausnummer): „auf der A1 bei Kilometer 85,4 Richtung Wien“,
 * „auf der B37 zwischen Lengenfeld und Gföhl“, „im Dunkelsteinerwald bei Mauer“.
 */
export function stelleBeschreibung(s: Einsatzstelle): string {
  const bei = s.ort ? ` bei ${s.ort}` : "";
  switch (s.typ) {
    case "autobahn": {
      const a = autobahnInfo(s);
      return `auf der ${s.name || "Autobahn"}${a.km !== null ? ` bei Kilometer ${kmText(a.km)}` : bei}${a.richtung ? ` Richtung ${a.richtung}` : ""}`;
    }
    case "landstrasse":
      return `auf der ${s.name || "Landstraße"} ${s.info ? s.info : `außerhalb von ${s.ort}`}`.trim();
    case "feldweg":
      return `auf einem ${/forst/i.test(s.info) ? "Forstweg im Wald" : "Feldweg"}${bei}`;
    case "radweg": {
      const n = s.name.replace(/\s*\((Niederösterreich|NÖ)\)/i, "").trim();
      return !n ? `am Radweg${bei}` : /radweg|radroute/i.test(n) ? `am ${n}${bei}` : `auf dem Radweg „${n}“${bei}`;
    }
    case "wald":
      return s.name && !/^wald$/i.test(s.name) ? `im ${s.name}${bei}` : `im Wald${bei}`;
    case "berg":
      return s.name ? `am ${s.name}${s.ort ? ` oberhalb von ${s.ort}` : ""}` : `am Berg${bei}`;
    case "ufer":
      return s.name ? `am Ufer (${s.name})${bei}` : `am Ufer${bei}`;
    case "weinberg":
      return `in den Weingärten${bei}`;
    case "feld":
      return `auf einem Feld${bei}`;
    case "hochstand":
      return `bei einem Hochstand${bei}`;
    case "kletterfels":
    case "klettersteig":
      return `${s.typ === "klettersteig" ? "im Klettersteig" : "beim Kletterfelsen"}${s.name ? ` ${s.name}` : ""}${bei}`;
    case "windrad":
      return `bei einem Windrad${s.name ? ` (${s.name})` : ""}${bei}`;
    case "kellergasse":
      return `${s.name || "in der Kellergasse"}${bei}`;
    default:
      return `${kategorieLabel(s.typ)}${s.name ? ` ${s.name}` : ""}${bei}`;
  }
}

/**
 * Suche nach Straßen-Angaben: „A1 85“, „A 1 km 85,4“, „S5 Krems“, „B37 Lengenfeld“. Liefert passende Stellen
 * (Autobahn: der Kilometer in beiden Richtungen; Landstraße: die Stellen dieser Straße beim genannten Ort).
 */
export async function stellenSuchen(q: string, limit = 6): Promise<{ label: string; lat: number; lon: number }[]> {
  const m = q.trim().match(/^([ABSL])\s?(\d{1,4})\b\s*(?:km\s*)?(.*)$/i);
  if (!m) return [];
  const ref = `${m[1].toUpperCase()}${m[2]}`;
  const rest = m[3].trim();
  const l = await stellenLaden();
  const strasse = l.filter((s) => (s.typ === "autobahn" || s.typ === "landstrasse") && s.name.replace(/\s/g, "").toUpperCase() === ref);
  if (!strasse.length) return [];
  const km = Number(rest.replace(",", "."));
  if (rest && Number.isFinite(km)) {
    // je Richtung die Stelle mit dem nächsten Kilometer
    const jeRichtung = new Map<string, { s: Einsatzstelle; d: number }>();
    for (const s of strasse) {
      const a = autobahnInfo(s);
      if (a.km === null) continue;
      const d = Math.abs(a.km - km);
      const x = jeRichtung.get(a.richtung);
      if (!x || d < x.d) jeRichtung.set(a.richtung, { s, d });
    }
    return [...jeRichtung.values()]
      .filter((x) => x.d <= 2)
      .slice(0, limit)
      .map(({ s }) => ({ label: stelleBeschreibung(s).replace(/^auf der /, ""), lat: s.lat, lon: s.lon }));
  }
  const wort = rest.toLowerCase();
  const passend = wort ? strasse.filter((s) => s.ort.toLowerCase().includes(wort) || s.info.toLowerCase().includes(wort)) : strasse;
  // je Ort nur eine Stelle
  const gesehen = new Set<string>();
  const out: { label: string; lat: number; lon: number }[] = [];
  for (const s of passend) {
    const key = `${s.ort}|${autobahnInfo(s).richtung}`;
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    out.push({ label: stelleBeschreibung(s).replace(/^auf der /, ""), lat: s.lat, lon: s.lon });
    if (out.length >= limit) break;
  }
  return out;
}
