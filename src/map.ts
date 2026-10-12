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

function setLayers(name: VectorMap): maplibregl.LayerSpecification[] {
  const set = layers(name, namedFlavor("light"), { lang: "de" }) as unknown as maplibregl.LayerSpecification[];
  // Hintergrund kommt einmal eigens ganz unten, sonst würde er die gröberen Karten verdecken
  return set
    .filter((l) => l.type !== "background")
    .map((l) => ({ ...l, id: `${name}-${l.id}` }) as maplibregl.LayerSpecification);
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

function buildStyle(): maplibregl.StyleSpecification {
  const origin = window.location.origin;
  const flavor = namedFlavor("light");
  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/sprites/v4/light`,
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
}

export function createMap(container: string, initial: string[]): MapHandle {
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tilev4);
  let available = new Set<string>();
  let shown: VectorMap[] = [];
  let mode3d = false;
  let satellite = false;

  const map = new maplibregl.Map({
    container,
    style: buildStyle(),
    center: START_CENTER,
    zoom: 8,
    minZoom: 5,
    maxZoom: 18,
    maxPitch: 75,
    maxBounds: MAX_BOUNDS,
    attributionControl: { compact: true },
    // Schriftordner liegen ohne Leerzeichen im Programm, damit die
    // Pfade auf allen Systemen gleich funktionieren.
    transformRequest: (url, resourceType) => {
      if (resourceType === "Glyphs") {
        return { url: url.replace(/%20|\s/g, "_") };
      }
      return { url };
    },
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  /** Erste Ebene der eigenen Daten (Dienststellen, Fahrzeuge …) – Karten kommen darunter. */
  const firstOwnLayer = (): string | undefined =>
    map.getStyle().layers.find((l) => l.id.startsWith("lw-") && !["lw-bg", "lw-sat-eox", "lw-sat-at"].includes(l.id))?.id;

  const removeSet = (name: string) => {
    for (const l of map.getStyle().layers.filter((x) => x.id.startsWith(`${name}-`))) map.removeLayer(l.id);
    if (map.getSource(name)) map.removeSource(name);
  };

  const addSet = (name: VectorMap, before: string | undefined) => {
    map.addSource(name, { type: "vector", url: `pmtiles://${name}`, attribution: ATTRIBUTION });
    for (const l of setLayers(name)) map.addLayer(l, before);
  };

  /** Sichtbarkeit nach Modus: Satellit blendet Flächen und Linien aus, Beschriftungen bleiben. */
  const applyVisibility = () => {
    for (const l of map.getStyle().layers) {
      const isSet = VECTOR_MAPS.some((m) => l.id.startsWith(`${m}-`));
      if (!isSet) continue;
      const vis = satellite && l.type !== "symbol" ? "none" : "visible";
      map.setLayoutProperty(l.id, "visibility", vis);
    }
    map.setLayoutProperty("lw-sat-eox", "visibility", satellite ? "visible" : "none");
    map.setLayoutProperty("lw-sat-at", "visibility", satellite ? "visible" : "none");
    const v3 = mode3d ? "visible" : "none";
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
    // Dateien (neu) öffnen – nach einem Kartenupdate liest PMTiles sonst den alten Stand
    for (const name of list) protocol.add(new PMTiles(inTauri() ? new TauriMapSource(name) : new DevMapSource(name)));

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
    if (on) satellite = false;
    applyVisibility();
    if (on && available.has("terrain")) {
      map.setTerrain({ source: "terrain", exaggeration: 1.4 });
      map.easeTo({ pitch: 60, duration: 800 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  };

  const setSatellite = (on: boolean) => {
    if (on && mode3d) setMode3d(false);
    satellite = on;
    applyVisibility();
  };

  return {
    map,
    hasTerrain: () => available.has("terrain"),
    setMode3d,
    setSatellite,
    refresh: (list) => {
      // nur nach geladenem Stil möglich
      if (map.isStyleLoaded()) sync(list);
      else map.once("idle", () => sync(list));
    },
  };
}
