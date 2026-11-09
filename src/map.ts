import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FetchSource, PMTiles, Protocol, type RangeResponse, type Source } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./platform";

/**
 * Kartendateien (aus den Kartenpaketen), von grob nach fein. Die feineren liegen
 * in der Darstellung über den groben. „basis“ (Grundpaket) wird ausgelassen,
 * sobald „ring“ oder „core“ installiert ist, weil diese sie vollständig abdecken.
 */
const VECTOR_MAPS = ["overview", "basis", "ring", "core"] as const;
type VectorMap = (typeof VECTOR_MAPS)[number];

/** Gebiet, in dem man sich bewegen kann (Österreich und Nachbarn). */
const MAX_BOUNDS: maplibregl.LngLatBoundsLike = [
  [7.5, 44.8],
  [20.5, 51.2],
];

/** St. Pölten als Startpunkt. */
const START_CENTER: maplibregl.LngLatLike = [15.63, 48.2];

const ATTRIBUTION =
  '<a href="https://protomaps.com" target="_blank">Protomaps</a> © <a href="https://openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
const TERRAIN_ATTRIBUTION = "Höhendaten: Mapzen / AWS Terrain Tiles";

/** Satellitenbild: amtliches Orthofoto für Österreich, außerhalb Sentinel-2 (grob). */
const SAT_AT = {
  url: "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg",
  bounds: [9.4, 46.3, 17.3, 49.1] as [number, number, number, number],
  attribution: 'Datenquelle: <a href="https://basemap.at" target="_blank">basemap.at</a>',
};
const SAT_EOX = {
  url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg",
  attribution:
    '<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless – s2maps.eu</a> von EOX IT Services GmbH (enthält veränderte Copernicus-Sentinel-Daten 2020)',
};

class TauriMapSource implements Source {
  constructor(private readonly name: string) {}

  getKey(): string {
    return this.name;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const data = await invoke<ArrayBuffer>("map_read", { name: this.name, offset, length });
    return { data };
  }
}

/** Im reinen Browser (Entwicklung) werden die Dateien per HTTP aus /maps geladen. */
class DevMapSource implements Source {
  private inner: FetchSource;

  constructor(private readonly name: string) {
    this.inner = new FetchSource(`/maps/${name}.pmtiles`);
  }

  getKey(): string {
    return this.name;
  }

  getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string) {
    return this.inner.getBytes(offset, length, signal, etag);
  }
}

export async function availableMaps(): Promise<string[]> {
  if (!inTauri()) return [...VECTOR_MAPS, "terrain"];
  return invoke<string[]>("map_files");
}

/** Welche Vektorkarten tatsächlich gezeichnet werden. */
function shownSets(available: Set<string>): VectorMap[] {
  return VECTOR_MAPS.filter((m) => {
    if (!available.has(m)) return false;
    if (m === "basis" && (available.has("ring") || available.has("core"))) return false;
    return true;
  });
}

type Flavor = "light" | "dark";

/** Punkte der Basiskarte, die bei „gedämpft“ bleiben (keine Geschäfte, Lokale, Bänke … – nur Orientierung) */
const POI_RUHIG = ["beach", "forest", "marina", "park", "peak", "zoo", "garden", "aerodrome", "station", "ferry_terminal", "stadium", "university", "townhall", "attraction", "museum", "theatre"];

/** Farbe wie mit CSS-Filter saturate(s) contrast(c) brightness(b) */
function farbeDaempfen(f: string, s: number, c: number, b: number): string {
  const m = f.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const r = f.trim().match(/^rgba?\(([^)]+)\)$/i);
  let rgb: number[];
  let a: number | null = null;
  if (m) {
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  } else if (r) {
    const t = r[1].split(",").map((x) => parseFloat(x));
    rgb = t.slice(0, 3).map((x) => x / 255);
    if (t.length > 3) a = t[3];
  } else return f;
  const [R, G, B] = rgb;
  const sat = [
    (0.213 + 0.787 * s) * R + (0.715 - 0.715 * s) * G + (0.072 - 0.072 * s) * B,
    (0.213 - 0.213 * s) * R + (0.715 + 0.285 * s) * G + (0.072 - 0.072 * s) * B,
    (0.213 - 0.213 * s) * R + (0.715 - 0.715 * s) * G + (0.072 + 0.928 * s) * B,
  ];
  const aus = sat.map((x) => Math.round(Math.max(0, Math.min(1, ((x - 0.5) * c + 0.5) * b)) * 255));
  return a === null ? `#${aus.map((x) => x.toString(16).padStart(2, "0")).join("")}` : `rgba(${aus.join(",")},${a})`;
}

/** Farbsatz der Basiskarte gedämpft (eigene Marken sollen vorne stehen – Befund „Kartenpunkte“) */
function gedaempft<T>(f: T, dunkel: boolean): T {
  const [s, c, b] = dunkel ? [0.35, 0.88, 1] : [0.3, 0.85, 1.03];
  const gehe = (o: unknown): unknown => {
    if (typeof o === "string") return farbeDaempfen(o, s, c, b);
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, gehe(v)]));
    return o;
  };
  return gehe(f) as T;
}

function setLayers(name: VectorMap, flavor: Flavor, ruhig = false): maplibregl.LayerSpecification[] {
  const fl = ruhig ? gedaempft(namedFlavor(flavor), flavor === "dark") : namedFlavor(flavor);
  const set = layers(name, fl, { lang: "de" }) as unknown as maplibregl.LayerSpecification[];
  // Hintergrund kommt einmal eigens ganz unten, sonst würde er die gröberen Karten verdecken
  return set
    .filter((l) => l.type !== "background")
    .map((l) => {
      const neu = { ...l, id: `${name}-${l.id}` } as maplibregl.LayerSpecification;
      // gedämpft: Geschäfte und Lokale der Basiskarte weglassen
      if (ruhig && l.id === "pois") (neu as { filter?: unknown }).filter = ["all", ["in", ["get", "kind"], ["literal", POI_RUHIG]], [">=", ["zoom"], ["+", ["get", "min_zoom"], 0]]];
      return neu;
    });
}

const BUILDINGS: maplibregl.LayerSpecification = {
  id: "lw-buildings-3d",
  type: "fill-extrusion",
  source: "core",
  "source-layer": "buildings",
  minzoom: 14,
  filter: ["in", "kind", "building", "building_part"],
  layout: { visibility: "none" },
  paint: {
    "fill-extrusion-color": "#d8d2c8",
    "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
    "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
    "fill-extrusion-opacity": 0.85,
  },
};

const HILLSHADE: maplibregl.LayerSpecification = {
  id: "lw-hillshade",
  type: "hillshade",
  source: "terrain",
  layout: { visibility: "none" },
  paint: { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": "#4a4a4a" },
};

function spriteUrl(f: Flavor): string {
  return `${window.location.origin}/sprites/v4/${f}`;
}

function buildStyle(f: Flavor): maplibregl.StyleSpecification {
  const origin = window.location.origin;
  const flavor = namedFlavor(f);
  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: spriteUrl(f),
    sources: {
      "sat-eox": { type: "raster", tiles: [SAT_EOX.url], tileSize: 256, maxzoom: 14, attribution: SAT_EOX.attribution },
      "sat-at": {
        type: "raster",
        tiles: [SAT_AT.url],
        tileSize: 256,
        maxzoom: 19,
        bounds: SAT_AT.bounds,
        attribution: SAT_AT.attribution,
      },
    },
    layers: [
      { id: "lw-bg", type: "background", paint: { "background-color": flavor.background } },
      { id: "lw-sat-eox", type: "raster", source: "sat-eox", layout: { visibility: "none" } },
      { id: "lw-sat-at", type: "raster", source: "sat-at", layout: { visibility: "none" } },
    ],
  };
}

export interface MapHandle {
  map: maplibregl.Map;
  hasTerrain(): boolean;
  setMode3d(on: boolean): void;
  setSatellite(on: boolean): void;
  /** Nach Installation/Löschen von Kartenpaketen: Ebenen anpassen. */
  refresh(available: string[]): void;
  /** Dunkle Karte an/aus */
  setDunkel(on: boolean): void;
}

/** Ein gemeinsames pmtiles-Protokoll für alle Karten (es kann mehrere Kartenfenster geben) */
let protocol: Protocol | null = null;
const geoeffnet = new Map<string, number>();
let protokollStand = 0;

export interface MapOptionen {
  dunkel?: boolean;
  /** eigene Knöpfe, Maßstab und Quellenhinweis (Kartenfenster) statt der von MapLibre */
  eigeneBedienung?: boolean;
  /** Basiskarte gedämpft, ohne Geschäfte und Lokale (Kartenfenster) */
  ruhig?: boolean;
}

export function createMap(container: string | HTMLElement, initial: string[], opts: MapOptionen = {}): MapHandle {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tilev4);
  }
  const proto = protocol;
  let flavor: Flavor = opts.dunkel ? "dark" : "light";
  let available = new Set<string>();
  let shown: VectorMap[] = [];
  let mode3d = false;
  let satellite = false;

  const map = new maplibregl.Map({
    container,
    style: buildStyle(flavor),
    center: START_CENTER,
    zoom: 8,
    minZoom: 5,
    maxZoom: 19.5,
    // 2D: flach von oben, nicht kippbar (in 3D wird das Kippen freigegeben)
    maxPitch: 0,
    maxBounds: MAX_BOUNDS,
    attributionControl: opts.eigeneBedienung ? false : { compact: true },
    // Schriftordner liegen ohne Leerzeichen im Programm, damit die
    // Pfade auf allen Systemen gleich funktionieren.
    transformRequest: (url, resourceType) => {
      if (resourceType === "Glyphs") {
        return { url: url.replace(/%20|\s/g, "_") };
      }
      return { url };
    },
  });

  if (!opts.eigeneBedienung) {
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  }

  /** Erste Ebene der eigenen Daten (Dienststellen, Fahrzeuge …) – Karten kommen darunter. */
  const firstOwnLayer = (): string | undefined =>
    map.getStyle().layers.find((l) => l.id.startsWith("lw-") && !["lw-bg", "lw-sat-eox", "lw-sat-at"].includes(l.id))?.id;

  const removeSet = (name: string) => {
    for (const l of map.getStyle().layers.filter((x) => x.id.startsWith(`${name}-`))) map.removeLayer(l.id);
    if (map.getSource(name)) map.removeSource(name);
  };

  const addSet = (name: VectorMap, before: string | undefined) => {
    map.addSource(name, { type: "vector", url: `pmtiles://${name}`, attribution: ATTRIBUTION });
    for (const l of setLayers(name, flavor, !!opts.ruhig)) map.addLayer(l, before);
  };

  /** Sichtbarkeit nach Modus: Satellit blendet Flächen und Linien aus, Beschriftungen bleiben. */
  /** Ursprüngliche Schriftfarben der Kartenbeschriftungen (für die Rückkehr vom Satellitenbild) */
  const textFarben = new Map<string, [unknown, unknown, unknown]>();
  const applyVisibility = () => {
    for (const l of map.getStyle().layers) {
      const isSet = VECTOR_MAPS.some((m) => l.id.startsWith(`${m}-`));
      if (!isSet) continue;
      const vis = satellite && l.type !== "symbol" ? "none" : "visible";
      map.setLayoutProperty(l.id, "visibility", vis);
      if (l.type !== "symbol") continue;
      // Auf dem Luftbild: helle Schrift mit dunklem Rand, damit Orts- und Straßennamen lesbar bleiben
      if (satellite) {
        if (!textFarben.has(l.id)) {
          textFarben.set(l.id, [
            map.getPaintProperty(l.id, "text-color"),
            map.getPaintProperty(l.id, "text-halo-color"),
            map.getPaintProperty(l.id, "text-halo-width"),
          ]);
        }
        map.setPaintProperty(l.id, "text-color", "#ffffff");
        map.setPaintProperty(l.id, "text-halo-color", "rgba(0,0,0,0.85)");
        map.setPaintProperty(l.id, "text-halo-width", 1.6);
      } else if (textFarben.has(l.id)) {
        const [c, h, w] = textFarben.get(l.id)!;
        map.setPaintProperty(l.id, "text-color", c as string);
        map.setPaintProperty(l.id, "text-halo-color", h as string);
        map.setPaintProperty(l.id, "text-halo-width", w as number);
        textFarben.delete(l.id);
      }
    }
    map.setLayoutProperty("lw-sat-eox", "visibility", satellite ? "visible" : "none");
    map.setLayoutProperty("lw-sat-at", "visibility", satellite ? "visible" : "none");
    // Satellitenbild auch in 3D (Gelände darunter); Schummerung und Häuser dann nicht
    const v3 = mode3d && !satellite ? "visible" : "none";
    for (const id of ["lw-hillshade", "lw-buildings-3d"]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v3);
  };

  /** Baut die Kartenebenen nach den vorhandenen Dateien (neu) auf. */
  const sync = (list: string[]) => {
    const next = new Set(list);
    // Ebenen und Quellen der Karten entfernen (eigene Daten bleiben)
    if (map.getLayer("lw-buildings-3d")) map.removeLayer("lw-buildings-3d");
    if (map.getLayer("lw-hillshade")) map.removeLayer("lw-hillshade");
    if (map.getSource("terrain")) {
      map.setTerrain(null);
      map.removeSource("terrain");
    }
    for (const name of shown) removeSet(name);
    textFarben.clear();
    // Dateien (neu) öffnen – nach einem Kartenupdate liest PMTiles sonst den alten Stand
    // (nur einmal je Änderung, auch wenn mehrere Karten offen sind)
    for (const name of list) {
      if (geoeffnet.get(name) === protokollStand) continue;
      geoeffnet.set(name, protokollStand);
      proto.add(new PMTiles(inTauri() ? new TauriMapSource(name) : new DevMapSource(name)));
    }

    const want = shownSets(next);
    const before = firstOwnLayer();
    for (const name of want) addSet(name, before);
    shown = want;
    available = next;

    const top = want[want.length - 1];
    const firstLabel = top ? map.getStyle().layers.find((l) => l.id.startsWith(`${top}-`) && l.type === "symbol")?.id : undefined;
    const beforeExtra = firstLabel ?? before;
    if (next.has("terrain")) {
      map.addSource("terrain", {
        type: "raster-dem",
        url: "pmtiles://terrain",
        encoding: "terrarium",
        tileSize: 256,
        attribution: TERRAIN_ATTRIBUTION,
      });
      map.addLayer(HILLSHADE, beforeExtra);
    }
    if (next.has("core")) map.addLayer(BUILDINGS, beforeExtra);
    if (mode3d && next.has("terrain")) map.setTerrain({ source: "terrain", exaggeration: 1.4 });
    applyVisibility();
  };

  map.once("style.load", () => sync(initial));

  const setMode3d = (on: boolean) => {
    mode3d = on;
    if (on && !opts.eigeneBedienung) satellite = false;
    applyVisibility();
    if (on) map.setMaxPitch(75);
    if (on && available.has("terrain")) {
      map.setTerrain({ source: "terrain", exaggeration: 1.4 });
      map.easeTo({ pitch: 60, duration: 800 });
    } else if (on) {
      /* ohne Höhendaten: nur Kippen freigeben */
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      // nach dem Zurückkippen sperren
      map.once("moveend", () => {
        if (!mode3d) map.setMaxPitch(0);
      });
    }
  };

  const setSatellite = (on: boolean) => {
    if (on && mode3d && !opts.eigeneBedienung) setMode3d(false);
    satellite = on;
    applyVisibility();
  };

  return {
    map,
    hasTerrain: () => available.has("terrain"),
    setMode3d,
    setSatellite,
    refresh: (list) => {
      protokollStand++;
      // nur nach geladenem Stil möglich
      if (map.isStyleLoaded()) sync(list);
      else map.once("idle", () => sync(list));
    },
    setDunkel: (on) => {
      const f: Flavor = on ? "dark" : "light";
      if (f === flavor) return;
      flavor = f;
      const anwenden = () => {
        map.setSprite(spriteUrl(f));
        map.setPaintProperty("lw-bg", "background-color", namedFlavor(f).background);
        BUILDINGS.paint = { ...BUILDINGS.paint, "fill-extrusion-color": on ? "#3b4250" : "#d8d2c8" };
        sync([...available]);
      };
      if (map.isStyleLoaded()) anwenden();
      else map.once("idle", anwenden);
    },
  };
}
