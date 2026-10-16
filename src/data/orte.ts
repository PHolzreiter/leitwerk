/**
 * Orte mit Kategorien: POIs, Krankenhäuser und Dienststellen zählen alle als „Orte“.
 * Die Kategorie bestimmt, was ein Ort im Spiel bewirkt (Transportziel, Fahrzeuge, passende Notfälle …).
 * Ein POI kann mehrere Kategorien haben (im Feld „typ“, mit Komma getrennt).
 */
import type { OrtArt } from "../abfrage/szenario";
import type { Hospital, Poi, Station } from "./model";
import { store } from "./store";

export interface OrtKategorie {
  key: string;
  label: string;
  /** was die Kategorie bewirkt (Hilfetext) */
  wirkung: string;
  /** passende Einsatzorte in den Fallgeschichten */
  ortArt?: OrtArt;
  /** erkannte Schreibweisen im Typ-Feld */
  muster: RegExp;
  /** nur über die eigene Liste (Krankenhäuser, Dienststellen) – nicht für POIs wählbar */
  liste?: "hospitals" | "stations";
}

export const ORT_KATEGORIEN: OrtKategorie[] = [
  { key: "krankenhaus", label: "Krankenhaus", wirkung: "wird von Rettungsmitteln angefahren (Transportziel)", muster: /krankenhaus|klinik|spital|\bkh\b|klinikum/i, liste: "hospitals" },
  { key: "rd", label: "RD-Dienststelle", wirkung: "dort sind Rettungsmittel stationiert", muster: /^rd|rettungsdienst|rettungswache|bezirksstelle|ortsstelle/i, liste: "stations" },
  { key: "na", label: "Notarzt-/Luftrettungsstützpunkt", wirkung: "Stützpunkt für NEF oder Hubschrauber", muster: /notarzt|nef-st|luftrettung|christophorus/i, liste: "stations" },
  { key: "feuerwehr", label: "Feuerwehr", wirkung: "Feuerwehrhaus (eigene Fahrzeuge folgen später)", muster: /feuerwehr|\bff\b|\bbf\b/i },
  { key: "polizei", label: "Polizei", wirkung: "Polizeiinspektion (eigene Fahrzeuge folgen später)", muster: /polizei|\bpi\b/i },
  { key: "wasserrettung", label: "Wasserrettung", wirkung: "Wasserrettung (eigene Fahrzeuge folgen später)", muster: /wasserrettung/i },
  { key: "bergrettung", label: "Bergrettung", wirkung: "Bergrettung (eigene Fahrzeuge folgen später)", muster: /bergrettung/i },
  { key: "kindergarten", label: "Kindergarten", wirkung: "Notfälle mit Kleinkindern", ortArt: "schule", muster: /kindergarten|kinderkrippe|krabbelstube|\bkiga\b/i },
  { key: "schule", label: "Schule", wirkung: "Notfälle mit Kindern und Jugendlichen", ortArt: "schule", muster: /schule|gymnasium|\bhak\b|\bhtl\b|\bbg\b|\bnms\b|\bvs\b/i },
  { key: "pflegeheim", label: "Pflegeheim", wirkung: "Stürze, Anrufe vom Pflegepersonal", ortArt: "pflegeheim", muster: /pflege|senioren|altenheim|\bpbz\b|heim\b/i },
  { key: "bahnhof", label: "Bahnhof", wirkung: "Notfälle am Bahnhof", ortArt: "bahnhof", muster: /bahnhof|\bbhf\b|haltestelle/i },
  { key: "einkauf", label: "Einkauf / Geschäft", wirkung: "Notfälle im Geschäft", ortArt: "geschaeft", muster: /einkauf|geschäft|geschaeft|markt|supermarkt|shop|baumarkt|center/i },
  { key: "sport", label: "Sportplatz / Halle", wirkung: "Sportunfälle", ortArt: "sport", muster: /sport|fußball|fussball|stadion|turnhalle|fitness|tennis/i },
  { key: "bad", label: "Bad / Badeplatz", wirkung: "Bade- und Wasserunfälle", ortArt: "wasser", muster: /\bbad\b|freibad|hallenbad|badeplatz|badesee|therme/i },
  { key: "lokal", label: "Lokal / Gastronomie", wirkung: "Notfälle im Lokal, Intoxikationen", ortArt: "lokal", muster: /lokal|gasthaus|restaurant|\bbar\b|café|cafe|heuriger|disco|gastro/i },
  { key: "arztpraxis", label: "Arztpraxis", wirkung: "Anrufe aus der Ordination", ortArt: "arzt", muster: /arzt|ordination|praxis|\bordi\b/i },
  { key: "arbeit", label: "Betrieb / Arbeitsplatz", wirkung: "Arbeitsunfälle", ortArt: "arbeit", muster: /betrieb|firma|werk\b|fabrik|industrie|lager/i },
  { key: "freizeit", label: "Freizeit", wirkung: "Freizeitunfälle", ortArt: "freizeit", muster: /freizeit|spielplatz|park\b|kino|museum|veranstaltung/i },
  { key: "landeplatz", label: "Hubschrauber-Landeplatz", wirkung: "Landemöglichkeit für Hubschrauber", muster: /lande|heli|hubschrauber/i },
  { key: "sonstiges", label: "Sonstiges", wirkung: "nur als Ort auf der Karte", muster: /^$/ },
];

export const POI_KATEGORIEN = ORT_KATEGORIEN.filter((k) => !k.liste);

const NACH_KEY = new Map(ORT_KATEGORIEN.map((k) => [k.key, k]));

export function kategorieLabel(key: string): string {
  return NACH_KEY.get(key)?.label ?? key;
}

/** Kategorien eines POI aus seinem Typ-Feld („Schule, Sport“ → ["schule","sport"]); Unbekanntes → „sonstiges“ */
export function poiKategorien(p: Pick<Poi, "typ" | "name">): string[] {
  const teile = (p.typ ?? "")
    .split(/[,;/|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const t of teile) {
    const k = ORT_KATEGORIEN.find((x) => x.key === t.toLowerCase() || x.label.toLowerCase() === t.toLowerCase()) ?? POI_KATEGORIEN.find((x) => x.muster.test(t));
    out.add(k && !k.liste ? k.key : "sonstiges");
  }
  if (!out.size) {
    // kein Typ: aus dem Namen raten
    const k = POI_KATEGORIEN.find((x) => x.key !== "sonstiges" && x.muster.test(p.name ?? ""));
    out.add(k?.key ?? "sonstiges");
  }
  if (out.size > 1) out.delete("sonstiges");
  return [...out];
}

/** Kategorien als Typ-Text zum Speichern */
export function kategorienText(keys: string[], eigen = ""): string {
  const l = keys.filter((k) => k !== "sonstiges").map(kategorieLabel);
  if (eigen.trim()) l.push(eigen.trim());
  return l.join(", ");
}

export function stationKategorien(s: Pick<Station, "typ" | "name">): string[] {
  const t = `${s.typ}`.toLowerCase();
  if (/luftrettung|notarzt/.test(t)) return ["na"];
  if (/feuerwehr/.test(t)) return ["feuerwehr"];
  if (/polizei/.test(t)) return ["polizei"];
  if (/wasserrettung/.test(t)) return ["wasserrettung"];
  if (/bergrettung/.test(t)) return ["bergrettung"];
  if (/rettungsdienst/.test(t)) return ["rd"];
  return ["sonstiges"];
}

export interface Ort {
  kind: "pois" | "hospitals" | "stations";
  id: string;
  name: string;
  ort: string;
  lat: number;
  lon: number;
  kategorien: string[];
}

/** Alle Orte: POIs, Krankenhäuser und Dienststellen */
export function alleOrte(): Ort[] {
  return [
    ...store.list("pois").map((p: Poi): Ort => ({ kind: "pois", id: p.id, name: p.name, ort: p.ort, lat: p.lat, lon: p.lon, kategorien: poiKategorien(p) })),
    ...store.list("hospitals").map((h: Hospital): Ort => ({ kind: "hospitals", id: h.id, name: h.name, ort: h.ort, lat: h.lat, lon: h.lon, kategorien: ["krankenhaus"] })),
    ...store.list("stations").map((s: Station): Ort => ({ kind: "stations", id: s.id, name: s.name, ort: s.ort, lat: s.lat, lon: s.lon, kategorien: stationKategorien(s) })),
  ];
}

/** Orte einer Kategorie */
export function orteMit(key: string): Ort[] {
  return alleOrte().filter((o) => o.kategorien.includes(key));
}

/** Passende POI-Kategorien für einen Einsatzort der Fallgeschichten (Kleinkind → Kindergarten) */
export function kategorienFuerOrtArt(art: OrtArt, alter?: number | null): string[] {
  const k = POI_KATEGORIEN.filter((x) => x.ortArt === art).map((x) => x.key);
  if (art === "schule" && typeof alter === "number") return alter < 6 ? ["kindergarten"] : alter <= 19 ? ["schule"] : k;
  return k;
}
