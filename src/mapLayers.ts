/** Eigene Kartenebenen: Dienststellen, Krankenhäuser, POIs. Dazu Kontextmenü und Positionswahl. */
import maplibregl from "maplibre-gl";
import type { Feature as GFeature, FeatureCollection, LineString, Point } from "geojson";
import { flughoehe } from "./sim/bewegung";
import { sim } from "./sim/engine";
import { findCode } from "./sim/codes";
import { stufeFarbe } from "./ui/panels/teile";

import {
  HOSPITAL_FLAGS,
  HOSPITAL_FLAG_LABEL,
  ORIGIN_LABEL,
  type Hospital,
  type Kind,
  type Poi,
  type Station,
} from "./data/model";
import { store } from "./data/store";
import { el, esc } from "./ui/dom";

const FONT = ["Noto Sans Medium"];

/** Farbe des Punkts je Organisation (Legende im Ebenen-Fenster) */
export const ORG_FARBEN: Record<string, string> = {
  "Rotes Kreuz": "#c62828",
  "Arbeiter-Samariter-Bund": "#ef6c00",
  Johanniter: "#7b1fa2",
  Malteser: "#5d4037",
  "ÖAMTC (Flugrettung)": "#f9a825",
  "Notruf NÖ / Leitstelle": "#1565c0",
  ÖBB: "#37474f",
  Sonstige: "#607d8b",
};

export function orgFarbe(s: Pick<Station, "organisation" | "typ">): string {
  const o = s.organisation.toLowerCase();
  if (o.includes("rotes kreuz")) return ORG_FARBEN["Rotes Kreuz"];
  if (o.includes("samariter") || o === "asb") return ORG_FARBEN["Arbeiter-Samariter-Bund"];
  if (o.includes("johanniter")) return ORG_FARBEN.Johanniter;
  if (o.includes("malteser")) return ORG_FARBEN.Malteser;
  if (o.includes("öamtc") || o.includes("oeamtc") || o.includes("öatmc") || s.typ === "Luftrettung") return ORG_FARBEN["ÖAMTC (Flugrettung)"];
  if (o.includes("öbb") || o.includes("oebb")) return ORG_FARBEN["ÖBB"];
  if (o.includes("notruf") || s.typ === "Leitstelle") return ORG_FARBEN["Notruf NÖ / Leitstelle"];
  return ORG_FARBEN.Sonstige;
}


type Feature = GFeature<Point, Record<string, string | number>>;

function pointFeature(id: string, lon: number, lat: number, props: Record<string, string | number>): Feature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { lwid: id, ...props } };
}

function collection(features: Feature[]): FeatureCollection<Point> {
  return { type: "FeatureCollection", features };
}

function stationFeatures(): FeatureCollection<Point> {
  return collection(
    store.list("stations").map((s) =>
      pointFeature(s.id, s.lon, s.lat, {
        name: s.name,
        color: orgFarbe(s),
      }),
    ),
  );
}

function hospitalFeatures(): FeatureCollection<Point> {
  return collection(
    store.list("hospitals").map((h) => pointFeature(h.id, h.lon, h.lat, { name: h.kurzname || h.name })),
  );
}

function poiFeatures(): FeatureCollection<Point> {
  return collection(store.list("pois").map((p) => pointFeature(p.id, p.lon, p.lat, { name: p.name })));
}

export interface DataLayerCallbacks {
  onEdit(kind: Kind, id: string): void;
  onCreateAt(kind: Kind, lat: number, lon: number): void;
}

export const LAYER_GROUPS: Record<"stations" | "hospitals" | "pois", string[]> = {
  stations: ["lw-stations", "lw-stations-label"],
  hospitals: ["lw-hospitals", "lw-hospitals-h", "lw-hospitals-label"],
  pois: ["lw-pois", "lw-pois-label"],
};

export function addDataLayers(map: maplibregl.Map, cb: DataLayerCallbacks): void {
  map.addSource("lw-stations", { type: "geojson", data: stationFeatures() });
  map.addSource("lw-hospitals", { type: "geojson", data: hospitalFeatures() });
  map.addSource("lw-pois", { type: "geojson", data: poiFeatures() });

  map.addLayer({
    id: "lw-pois",
    type: "circle",
    source: "lw-pois",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 9, 3, 13, 6],
      "circle-color": "#2a9d8f",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.5],
    },
  });
  map.addLayer({
    id: "lw-pois-label",
    type: "symbol",
    source: "lw-pois",
    minzoom: 12,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 11,
      "text-offset": [0, 1.0],
      "text-anchor": "top",
    },
    paint: { "text-color": "#1f5f57", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });

  map.addLayer({
    id: "lw-hospitals",
    type: "circle",
    source: "lw-hospitals",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 8.5, 4, 11, 7, 13, 10],
      "circle-color": ["step", ["zoom"], "#d62828", 8.5, "#ffffff"],
      "circle-stroke-color": "#d62828",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 8.5, 1.5, 11, 2.5],
    },
  });
  map.addLayer({
    id: "lw-hospitals-h",
    type: "symbol",
    source: "lw-hospitals",
    minzoom: 8.5,
    layout: {
      "text-field": "H",
      "text-font": FONT,
      "text-size": ["interpolate", ["linear"], ["zoom"], 8.5, 7, 13, 13],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#d62828" },
  });
  map.addLayer({
    id: "lw-hospitals-label",
    type: "symbol",
    source: "lw-hospitals",
    minzoom: 9.5,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 11,
      "text-offset": [0, 1.3],
      "text-anchor": "top",
    },
    paint: { "text-color": "#9d1c1c", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });

  map.addLayer({
    id: "lw-stations",
    type: "circle",
    source: "lw-stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.2, 9, 2.5, 11, 5, 13, 8],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, 0.3, 9, 0.8, 11, 1.5],
    },
  });
  map.addLayer({
    id: "lw-stations-label",
    type: "symbol",
    source: "lw-stations",
    minzoom: 10,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 11,
      "text-offset": [0, 1.0],
      "text-anchor": "top",
      "text-max-width": 12,
    },
    paint: { "text-color": "#123b6b", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });

  // Krankenhäuser über den Dienststellen (Notarztstützpunkte liegen oft direkt am Spital)
  for (const id of LAYER_GROUPS.hospitals) map.moveLayer(id);

  const ausStore = store.onChange(() => {
    (map.getSource("lw-stations") as maplibregl.GeoJSONSource | undefined)?.setData(stationFeatures());
    (map.getSource("lw-hospitals") as maplibregl.GeoJSONSource | undefined)?.setData(hospitalFeatures());
    (map.getSource("lw-pois") as maplibregl.GeoJSONSource | undefined)?.setData(poiFeatures());
  });
  map.once("remove", ausStore);

  // Klick: Details anzeigen
  const clickable: [string, Kind][] = [
    ["lw-stations", "stations"],
    ["lw-hospitals", "hospitals"],
    ["lw-pois", "pois"],
  ];
  for (const [layer, kind] of clickable) {
    map.on("click", layer, (e) => {
      if (pickActive) return;
      const f = e.features?.[0];
      const id = f?.properties?.lwid as string | undefined;
      if (!id) return;
      showDetails(map, kind, id, e.lngLat, cb);
    });
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = pickActive ? "crosshair" : ""));
  }

  // Rechtsklick: Kontextmenü zum Anlegen
  map.on("contextmenu", (e) => {
    if (pickActive) return;
    openContextMenu(map, e.lngLat, e.point, cb);
  });
}

let openPopup: maplibregl.Popup | null = null;

function showDetails(map: maplibregl.Map, kind: Kind, id: string, at: maplibregl.LngLat, cb: DataLayerCallbacks) {
  openPopup?.remove();
  const body = el("div", { class: "lw-popup" });

  if (kind === "stations") {
    const s = store.get("stations", id) as Station | undefined;
    if (!s) return;
    const vehicles = store
      .list("vehicles")
      .filter((v) => v.dienststelleId === id)
      .sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de"));
    body.innerHTML = `
      <div class="lw-popup-title">${esc(s.name)}</div>
      <div class="lw-popup-sub">${esc([s.typ, s.organisation, s.ort].filter(Boolean).join(" · "))}</div>
      <div class="lw-popup-list">${
        vehicles.length
          ? vehicles
              .map((v) => {
                const fz = sim.state.fahrzeuge[v.id];
                const st = fz ? sim.statusDef(fz.status) : null;
                const chip = st ? `<span class="veh-st" style="background:${st.farbe}" title="${esc(st.name)}">${esc(st.nummer)}</span>` : "";
                return `<span class="veh ${v.aktiv ? "" : "inactive"}" title="${esc(st ? `${v.typ} · ${st.name}` : v.typ)}">${chip}${esc(v.funkrufname)} <small>${esc(fz?.rmTyp ?? v.kategorie)}</small></span>`;
              })
              .join("")
          : "<em>keine Fahrzeuge</em>"
      }</div>
      <div class="lw-popup-meta">Quelle: ${ORIGIN_LABEL[s.herkunft]}</div>`;
  } else if (kind === "hospitals") {
    const h = store.get("hospitals", id) as Hospital | undefined;
    if (!h) return;
    const yes = HOSPITAL_FLAGS.filter((f) => h.abteilungen[f]).map((f) => HOSPITAL_FLAG_LABEL[f]);
    body.innerHTML = `
      <div class="lw-popup-title">${esc(h.name)}</div>
      <div class="lw-popup-sub">${esc(h.ort)}</div>
      <div class="lw-popup-list">${yes.map((y) => `<span class="dep">${esc(y)}</span>`).join("") || "<em>keine Angaben</em>"}</div>
      ${h.hinweis ? `<div class="lw-popup-meta">${esc(h.hinweis)}</div>` : ""}`;
  } else {
    const p = store.get(kind, id) as Poi | undefined;
    if (!p) return;
    body.innerHTML = `
      <div class="lw-popup-title">${esc(p.name)}</div>
      <div class="lw-popup-sub">${esc([p.typ, p.ort].filter(Boolean).join(" · "))}</div>`;
  }
  const edit = el("button", { class: "btn small" }, "Bearbeiten");
  edit.addEventListener("click", () => {
    openPopup?.remove();
    cb.onEdit(kind, id);
  });
  body.appendChild(edit);
  openPopup = new maplibregl.Popup({ maxWidth: "340px" }).setLngLat(at).setDOMContent(body).addTo(map);
}

let menuEl: HTMLElement | null = null;

function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}

function openContextMenu(map: maplibregl.Map, at: maplibregl.LngLat, point: maplibregl.Point, cb: DataLayerCallbacks) {
  closeMenu();
  const menu = el("div", { class: "ctx-menu" });
  const items: [string, () => void][] = [
    ["Dienststelle hier anlegen", () => cb.onCreateAt("stations", at.lat, at.lng)],
    ["Krankenhaus hier anlegen", () => cb.onCreateAt("hospitals", at.lat, at.lng)],
    ["POI hier anlegen", () => cb.onCreateAt("pois", at.lat, at.lng)],
    [
      `Koordinaten kopieren (${at.lat.toFixed(5)}, ${at.lng.toFixed(5)})`,
      () => void navigator.clipboard?.writeText(`${at.lat.toFixed(6)};${at.lng.toFixed(6)}`),
    ],
  ];
  for (const [label, fn] of items) {
    const b = el("button", {}, label);
    b.addEventListener("click", () => {
      closeMenu();
      fn();
    });
    menu.appendChild(b);
  }
  const container = map.getContainer();
  menu.style.left = `${Math.min(point.x, container.clientWidth - 260)}px`;
  menu.style.top = `${Math.min(point.y, container.clientHeight - 160)}px`;
  container.appendChild(menu);
  menuEl = menu;
  setTimeout(() => {
    const off = () => {
      closeMenu();
      document.removeEventListener("mousedown", handler);
    };
    const handler = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) off();
    };
    document.addEventListener("mousedown", handler);
    map.once("movestart", off);
  }, 0);
}

let pickActive = false;
/** Wird gerade ein Ort auf der Karte gewählt? */
export function pickLaeuft(): boolean {
  return pickActive;
}

/** Lässt den Benutzer einen Punkt auf der Karte wählen. */
export function pickLocation(map: maplibregl.Map, hint: string): Promise<{ lat: number; lon: number } | null> {
  pickActive = true;
  closeMenu();
  openPopup?.remove();
  const banner = el("div", { class: "pick-banner" }, `${hint} – Esc bricht ab`);
  map.getContainer().appendChild(banner);
  map.getCanvas().style.cursor = "crosshair";
  return new Promise((resolve) => {
    const finish = (v: { lat: number; lon: number } | null) => {
      pickActive = false;
      banner.remove();
      map.getCanvas().style.cursor = "";
      map.off("click", onClick);
      document.removeEventListener("keydown", onKey);
      resolve(v);
    };
    const onClick = (e: maplibregl.MapMouseEvent) => finish({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(null);
    };
    map.on("click", onClick);
    document.addEventListener("keydown", onKey);
  });
}

export function setGroupVisible(map: maplibregl.Map, group: keyof typeof LAYER_GROUPS, on: boolean) {
  for (const id of LAYER_GROUPS[group]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

// ---------------------------------------------------------------- Simulation


let selectedIncident: string | null = null;

/** Fahrzeuge, die frei auf ihrer Wache stehen, zeigt die Karte nicht (die Wache zeigt sie beim Anklicken) */
function daheim(fz: (typeof sim.state.fahrzeuge)[string]): boolean {
  if (fz.einsatzId || fz.phase !== "frei") return false;
  return Math.abs(fz.lat - fz.heim.lat) < 0.0005 && Math.abs(fz.lon - fz.heim.lon) < 0.0005;
}

function vehicleFeatures(): FeatureCollection<Point> {
  return collection(
    Object.values(sim.state.fahrzeuge).filter((fz) => !daheim(fz)).map((fz) =>
      pointFeature(fz.id, fz.lon, fz.lat, {
        name: fz.funkrufname,
        color: sim.statusDef(fz.status).farbe,
        nr: sim.statusDef(fz.status).nummer,
        nah: fz.kategorie === "NAH" || fz.kategorie === "ITH" ? 1 : 0,
        ein: fz.einsatzId ? 1 : 0,
        flug: flughoehe(fz, sim.state.zeit) > 5 ? 1 : 0,
      }),
    ),
  );
}

function incidentFeatures(): FeatureCollection<Point> {
  return collection(
    sim.state.einsaetze
      .filter((e) => e.adresse && e.zustand !== "abgeschlossen")
      .map((e) =>
        pointFeature(e.id, e.adresse!.lon, e.adresse!.lat, {
          name: e.nummer,
          color: stufeFarbe(findCode(e.code ?? undefined)?.stufe),
          sel: e.id === selectedIncident ? 1 : 0,
        }),
      ),
  );
}

function routeFeatures(): FeatureCollection<LineString> {
  const feats: GFeature<LineString>[] = [];
  for (const fz of Object.values(sim.state.fahrzeuge)) {
    if (!fz.fahrt || !fz.einsatzId) continue;
    if (selectedIncident && fz.einsatzId !== selectedIncident) continue;
    feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: fz.fahrt.coords }, properties: {} });
  }
  return { type: "FeatureCollection", features: feats };
}

export function setSelectedIncident(map: maplibregl.Map, id: string | null): void {
  selectedIncident = id;
  (map.getSource("lw-incidents") as maplibregl.GeoJSONSource | undefined)?.setData(incidentFeatures());
  (map.getSource("lw-routes") as maplibregl.GeoJSONSource | undefined)?.setData(routeFeatures());
}

export function addSimLayers(
  map: maplibregl.Map,
  cb: { onIncident(id: string): void; onVehicle(id: string): void; onVehicleDbl(id: string): void },
): void {
  map.addSource("lw-routes", { type: "geojson", data: routeFeatures() });
  map.addSource("lw-incidents", { type: "geojson", data: incidentFeatures() });
  map.addSource("lw-vehicles", { type: "geojson", data: vehicleFeatures() });

  map.addLayer({
    id: "lw-routes",
    type: "line",
    source: "lw-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#1d6fd8", "line-width": 3, "line-opacity": 0.55, "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: "lw-incidents",
    type: "circle",
    source: "lw-incidents",
    paint: {
      "circle-radius": ["case", ["==", ["get", "sel"], 1], 13, 9],
      "circle-color": ["get", "color"],
      "circle-stroke-color": ["case", ["==", ["get", "sel"], 1], "#111827", "#ffffff"],
      "circle-stroke-width": ["case", ["==", ["get", "sel"], 1], 3, 2],
    },
  });
  map.addLayer({
    id: "lw-incidents-label",
    type: "symbol",
    source: "lw-incidents",
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 11,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#7a1010", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
  });
  // Schatten unter fliegenden Hubschraubern (zeigt: er ist in der Luft)
  map.addLayer({
    id: "lw-vehicles-shadow",
    type: "circle",
    source: "lw-vehicles",
    filter: ["==", ["get", "flug"], 1],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 10, 6, 13, 9],
      "circle-color": "#000000",
      "circle-opacity": 0.35,
      "circle-blur": 0.7,
      "circle-translate": [6, 9],
    },
  });
  map.addLayer({
    id: "lw-vehicles",
    type: "circle",
    source: "lw-vehicles",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, ["case", ["==", ["get", "ein"], 1], 4, 2], 10, ["case", ["==", ["get", "ein"], 1], 7, 5], 13, 10],
      "circle-color": ["get", "color"],
      "circle-stroke-color": ["case", ["==", ["get", "nah"], 1], "#111827", "#ffffff"],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, ["case", ["==", ["get", "flug"], 1], 1.5, 1], 10, ["case", ["==", ["get", "flug"], 1], 3, 2]],
    },
  });
  map.addLayer({
    id: "lw-vehicles-nr",
    type: "symbol",
    source: "lw-vehicles",
    minzoom: 10,
    layout: { "text-field": ["get", "nr"], "text-font": FONT, "text-size": 10, "text-allow-overlap": true },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: "lw-vehicles-label",
    type: "symbol",
    source: "lw-vehicles",
    minzoom: 8,
    layout: {
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 11,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
    },
    paint: { "text-color": "#0b1726", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
  });

  map.on("click", "lw-incidents", (e) => {
    const id = e.features?.[0]?.properties?.lwid as string | undefined;
    if (id && !pickActive) cb.onIncident(id);
  });
  map.on("click", "lw-vehicles", (e) => {
    const id = e.features?.[0]?.properties?.lwid as string | undefined;
    if (id && !pickActive) cb.onVehicle(id);
  });
  // Doppelklick: heranzoomen und Kamera folgt (statt normalem Doppelklick-Zoom)
  map.on("dblclick", "lw-vehicles", (e) => {
    const id = e.features?.[0]?.properties?.lwid as string | undefined;
    if (!id || pickActive) return;
    e.preventDefault();
    cb.onVehicleDbl(id);
  });
  for (const l of ["lw-incidents", "lw-vehicles"]) {
    map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", l, () => (map.getCanvas().style.cursor = pickActive ? "crosshair" : ""));
  }

  let last = 0;
  const ausSim = sim.onChange(() => {
    const now = performance.now();
    if (now - last < 300) return;
    last = now;
    (map.getSource("lw-vehicles") as maplibregl.GeoJSONSource | undefined)?.setData(vehicleFeatures());
    (map.getSource("lw-incidents") as maplibregl.GeoJSONSource | undefined)?.setData(incidentFeatures());
    (map.getSource("lw-routes") as maplibregl.GeoJSONSource | undefined)?.setData(routeFeatures());
  });
  map.once("remove", ausSim);
}
