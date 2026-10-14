/** Zugriff auf Routing und Adressen (im Programm über Rust, im Browser mit einfachem Ersatz). */
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../platform";
import { store } from "../data/store";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Route {
  /** [lon, lat] */
  coords: [number, number][];
  /** kumulierte Sekunden ohne Sondersignal */
  times: number[];
  duration: number;
  distance: number;
}

export interface AddressHit {
  label: string;
  street: string;
  number: string;
  postcode: string;
  city: string;
  lat: number;
  lon: number;
  place: boolean;
}

export interface GeoStatus {
  roads: string;
  roads_nodes: number;
  addresses: string;
  address_count: number;
  /** geladene Bundesländer (Kürzel; „alt“ = altes Gesamtnetz) */
  regionen?: string[];
  regionen_aus?: string[];
}

/** Bundesländer mit eigenem Straßenpaket */
export const REGIONEN: Record<string, string> = { noe: "Niederösterreich", wien: "Wien", bgld: "Burgenland", ooe: "Oberösterreich", stmk: "Steiermark" };

let regionenCache: string[] = [];
/** zuletzt gemeldete geladene Bundesländer (für den Mehrspieler-Abgleich) */
export function aktiveRegionen(): string[] {
  return regionenCache;
}

/** Bundesland ein- oder ausschalten */
export async function regionSetzen(id: string, aktiv: boolean): Promise<void> {
  if (!inTauri()) return;
  await invoke("region_setzen", { id, aktiv });
}

/** Liegen die Punkte im geladenen Straßennetz? (im Browser: immer) */
export async function erreichbar(punkte: LatLon[]): Promise<boolean[]> {
  if (!inTauri() || !punkte.length) return punkte.map(() => true);
  return invoke<boolean[]>("erreichbar", { punkte: punkte.map((p) => [p.lat, p.lon]) });
}

export function distanceM(a: LatLon, b: LatLon): number {
  const r = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Ersatz im Browser: gerade Linie mit 45 km/h. */
function straightRoute(from: LatLon, to: LatLon, speedKmh = 45): Route {
  const d = distanceM(from, to) * 1.3;
  const t = d / (speedKmh / 3.6);
  return { coords: [[from.lon, from.lat], [to.lon, to.lat]], times: [0, t], duration: t, distance: d };
}

/** Luftlinien-Route (für Hubschrauber). */
export function flightRoute(from: LatLon, to: LatLon, speedKmh: number): Route {
  const d = distanceM(from, to);
  const t = d / (speedKmh / 3.6);
  return { coords: [[from.lon, from.lat], [to.lon, to.lat]], times: [0, t], duration: t, distance: d };
}

export async function geoStatus(): Promise<GeoStatus> {
  if (!inTauri()) return { roads: "Browser-Ersatz", roads_nodes: 0, addresses: "Browser-Ersatz", address_count: 0, regionen: [] };
  const g = await invoke<GeoStatus>("geo_status");
  regionenCache = g.regionen ?? [];
  return g;
}

export async function route(from: LatLon, to: LatLon): Promise<Route> {
  if (!inTauri()) return straightRoute(from, to);
  try {
    return await invoke<Route>("route", { from: [from.lat, from.lon], to: [to.lat, to.lon] });
  } catch (e) {
    console.warn("Routing fehlgeschlagen, gerade Linie verwendet:", e);
    return straightRoute(from, to);
  }
}

/** Fahrzeiten in Sekunden (ohne Sondersignal) von vielen Punkten zu einem Ziel. */
export async function travelTimes(to: LatLon, sources: LatLon[]): Promise<(number | null)[]> {
  if (sources.length === 0) return [];
  if (!inTauri()) return sources.map((s) => straightRoute(s, to).duration);
  try {
    return await invoke<(number | null)[]>("travel_times", {
      to: [to.lat, to.lon],
      sources: sources.map((s) => [s.lat, s.lon]),
    });
  } catch (e) {
    console.warn("Fahrzeiten nicht verfügbar:", e);
    return sources.map((s) => straightRoute(s, to).duration);
  }
}

export async function searchAddress(query: string, limit = 12): Promise<AddressHit[]> {
  if (query.trim().length < 2) return [];
  if (!inTauri()) return browserSearch(query, limit);
  return invoke<AddressHit[]>("address_search", { query, limit });
}

export async function randomAddresses(bbox: [number, number, number, number], count: number): Promise<AddressHit[]> {
  const seed = Math.floor(Math.random() * 2 ** 31) * 2 + 1;
  if (!inTauri()) {
    return Array.from({ length: count }, (_, i) => {
      const lon = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
      const lat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
      return { label: `Testgasse ${i + 1}, Testort`, street: "Testgasse", number: String(i + 1), postcode: "3500", city: "Testort", lat, lon, place: false };
    });
  }
  return invoke<AddressHit[]>("address_random", { bbox, count, seed });
}

/** Im Browser (Entwicklung): Suche über Namen von Dienststellen und Krankenhäusern. */
function browserSearch(query: string, limit: number): AddressHit[] {
  const q = query.toLowerCase();
  const pts = [...store.list("stations"), ...store.list("hospitals")];
  return pts
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, limit)
    .map((p) => ({ label: p.name, street: p.name, number: "", postcode: "", city: "", lat: p.lat, lon: p.lon, place: false }));
}
