/**
 * Eigene Kartenebenen in MapLibre: Funkgruppen-Grenzen, eigene POIs, Fahrtwege (nur bei Auswahl), Besatzung zu Fuß,
 * Partner-Fahrzeuge, Flugzeuge, Flugspur. Wachen, Krankenhäuser, Partner-Dienststellen, Einsätze und Fahrzeuge
 * zeichnet das Kartenfenster als eigene Marken (ui/fenster/karte/marken.ts).
 */
import maplibregl from "maplibre-gl";
import type { Feature as GFeature, FeatureCollection, LineString, Point } from "geojson";
import { anzeigeZeit, besatzungBei, personenBei, positionBei } from "./sim/bewegung";
import { fliegt, sim } from "./sim/engine";
import { type PartnerArt } from "./sim/partner";
import { ortKategorie, poiKategorien } from "./data/orte";
import { flugPosition } from "./sim/flughafen";
import { type Station } from "./data/model";
import { store } from "./data/store";
import { FUNK_FARBEN, FUNKGRUPPEN } from "./sim/funkgruppen";
import { onPers, pers } from "./ui/ws/persoenlich";

export const FONT = ["Noto Sans Medium"];

/** Farbe je Organisation – nur noch für die Karosserie der 3D-Modelle (keine Legende mehr; die Marken sind neutral) */
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

/** Farben der Partner-Organisationen (Dienststellen und Fahrzeuge) */
export const PARTNER_FARBE: Record<PartnerArt, string> = { fw: "#e53935", pol: "#1e3a8a", berg: "#2e7d32", wasser: "#0097a7", ki: "#7c3aed" };

/** Orte, die man schon weiter herausgezoomt sieht (große Einrichtungen, Pflege, Bahnhöfe, Landeplätze) */
const POI_WICHTIG = new Set(["pflegeheim", "betreutes_wohnen", "behinderteneinrichtung", "bahnhof", "landeplatz", "einkaufszentrum", "freizeitpark", "therme", "skigebiet", "hochschule"]);
function poiFeatures(): FeatureCollection<Point> {
  return collection(
    store.list("pois").map((p) => {
      const k = poiKategorien(p);
      const gruppe = ortKategorie(k[0])?.gruppe ?? "sonstiges";
      return pointFeature(p.id, p.lon, p.lat, { name: p.name, wichtig: k.some((x) => POI_WICHTIG.has(x)) ? 1 : 0, zeichen: k.includes("landeplatz") ? "lp" : (POI_ZEICHEN[gruppe] ?? "·") });
    }),
  );
}

/** Ab welcher Zoomstufe Orte erscheinen (persönliche Einstellung; wichtige drei Stufen früher) */
export function poiZoom(): { normal: number; wichtig: number } {
  const z = pers().poiZoom ?? 14;
  return { normal: Math.min(z, 24), wichtig: z >= 24 ? 24 : Math.max(0, z - 3) };
}

/** Buchstabe der POI-Marke je Gruppe (Pflegeheim P, Schule S, Bahnhof B …) */
const POI_ZEICHEN: Record<string, string> = {
  pflege: "P",
  bildung: "S",
  gesundheit: "A",
  verkehr: "B",
  flughafen: "F",
  einkauf: "E",
  sport: "Sp",
  wasser: "W",
  freizeit: "Fz",
  gastro: "G",
  arbeit: "I",
  gelaende: "·",
  sonstiges: "·",
};

/** Marke eines eigenen POI als Bild (wie .poi im Entwurf: türkis, weißer Rand, Schatten) */
function poiBild(zeichen: string, landeplatz: boolean): ImageData {
  const pr = 2;
  const n = 24 * pr;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.scale(pr, pr);
  const r = landeplatz ? 9 : 8;
  g.shadowColor = "rgba(0,0,0,.5)";
  g.shadowBlur = 4;
  g.shadowOffsetY = 1;
  g.beginPath();
  g.arc(12, 12, r, 0, Math.PI * 2);
  g.fillStyle = landeplatz ? "#2fae5b" : "#ffffff";
  g.fill();
  g.shadowColor = "transparent";
  g.beginPath();
  g.arc(12, 12, r - 2, 0, Math.PI * 2);
  g.fillStyle = landeplatz ? "#ffffff" : "#2a9d8f";
  g.fill();
  g.fillStyle = landeplatz ? "#1f7a3f" : "#ffffff";
  g.font = `900 ${landeplatz ? 10 : zeichen.length > 1 ? 7.5 : 8.5}px Inter, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(landeplatz ? "H" : zeichen, 12, 12.5);
  return g.getImageData(0, 0, n, n);
}

export interface DataLayerCallbacks {
  /** Klick auf einen eigenen POI */
  onPoi(id: string, at: maplibregl.LngLat): void;
}

export const LAYER_GROUPS: Record<"pois", string[]> = {
  pois: ["lw-pois", "lw-pois-w"],
};

/** Name einer Funkgruppe wie am Funkgerät: „NÖ-03“ → „RD-NOE-03“ */
export function funkgruppenName(id: string): string {
  return String(id).replace(/^NÖ-/, "RD-NOE-");
}

/** Grenzen der TETRA-Funkgruppen (Farbe und Sichtbarkeit persönlich); die eigene blau gestrichelt wie im Entwurf */
function funkFeatures(): FeatureCollection {
  const p = pers();
  const eigene = sim.funkgruppe().id;
  const feats: GFeature[] = [];
  if (p.funkLinien === false) return { type: "FeatureCollection", features: feats };
  for (const g of FUNKGRUPPEN) {
    if (p.funkGruppen?.[g.id] === false) continue;
    const eigen = g.id === eigene ? 1 : 0;
    const farbe = eigen && !p.funkFarben?.[g.id] ? "#3B8BFF" : (p.funkFarben?.[g.id] ?? FUNK_FARBEN[g.id]);
    for (const r of g.ringe) feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: r }, properties: { id: g.id, farbe, eigen } });
    // Beschriftung ungefähr in der Mitte (Mittel aller Punkte)
    const pts = g.ringe.flat();
    const lon = pts.reduce((a, q) => a + q[0], 0) / pts.length;
    const lat = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { id: g.id, farbe, eigen, label: funkgruppenName(g.id) } });
  }
  return { type: "FeatureCollection", features: feats };
}

/** Funkgruppen-Grenzen und eigene POIs (Wachen, Krankenhäuser und Partner zeichnet das Kartenfenster selbst) */
export function addDataLayers(map: maplibregl.Map, cb: DataLayerCallbacks): void {
  map.addSource("lw-funkgruppen", { type: "geojson", data: funkFeatures() });
  map.addLayer({
    id: "lw-funk-linie",
    type: "line",
    source: "lw-funkgruppen",
    filter: ["==", ["geometry-type"], "LineString"],
    paint: {
      "line-color": ["get", "farbe"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, ["case", ["==", ["get", "eigen"], 1], 1.8, 0.9], 11, ["case", ["==", ["get", "eigen"], 1], 2.5, 1.4]],
      "line-opacity": ["case", ["==", ["get", "eigen"], 1], 0.9, 0.45],
      "line-dasharray": [4.8, 3.2],
    },
  });
  map.addLayer({
    id: "lw-funk-label",
    type: "symbol",
    source: "lw-funkgruppen",
    filter: ["==", ["geometry-type"], "Point"],
    maxzoom: 10.5,
    layout: { "text-field": ["get", "label"], "text-size": 13, "text-font": FONT, "text-allow-overlap": false },
    paint: { "text-color": ["get", "farbe"], "text-halo-color": "rgba(255,255,255,0.85)", "text-halo-width": 1.6, "text-opacity": ["case", ["==", ["get", "eigen"], 1], 0.95, 0.6] },
  });
  const funkNeu = () => (map.getSource("lw-funkgruppen") as maplibregl.GeoJSONSource | undefined)?.setData(funkFeatures());
  const ausPers = onPers(funkNeu);
  const ausStoreF = store.onChange(funkNeu);
  map.once("remove", () => {
    ausPers();
    ausStoreF();
  });
  map.addSource("lw-pois", { type: "geojson", data: poiFeatures() });
  for (const z of new Set([...Object.values(POI_ZEICHEN), "lp"])) {
    const id = `lw-poi-${z}`;
    if (!map.hasImage(id)) map.addImage(id, poiBild(z, z === "lp"), { pixelRatio: 2 });
  }

  // Orte (POIs): normale erst nah herangezoomt, wichtige schon früher (einstellbar unter Persönlich → Darstellung)
  const pz = poiZoom();
  const poiEbene = (id: string, wichtig: boolean, minzoom: number) =>
    map.addLayer({
      id,
      type: "symbol",
      source: "lw-pois",
      minzoom,
      filter: ["==", ["get", "wichtig"], wichtig ? 1 : 0],
      layout: {
        "icon-image": ["concat", "lw-poi-", ["get", "zeichen"]],
        "icon-allow-overlap": false,
        "icon-padding": 1,
        "symbol-sort-key": wichtig ? 0 : 1,
      },
    });
  poiEbene("lw-pois", false, pz.normal);
  poiEbene("lw-pois-w", true, pz.wichtig);
  const ausPoiZoom = onPers(() => {
    const z = poiZoom();
    if (!map.getLayer("lw-pois")) return;
    map.setLayerZoomRange("lw-pois", z.normal, 24);
    map.setLayerZoomRange("lw-pois-w", z.wichtig, 24);
  });
  map.once("remove", ausPoiZoom);

  const ausStore = store.onChange(() => (map.getSource("lw-pois") as maplibregl.GeoJSONSource | undefined)?.setData(poiFeatures()));
  map.once("remove", ausStore);

  for (const layer of LAYER_GROUPS.pois) {
    map.on("click", layer, (e) => {
      if (pickActive) return;
      const id = e.features?.[0]?.properties?.lwid as string | undefined;
      if (id) cb.onPoi(id, e.lngLat);
    });
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = pickActive ? "crosshair" : ""));
  }
}

let pickActive = false;
/** Wird gerade ein Ort auf der Karte gewählt? */
export function pickLaeuft(): boolean {
  return pickActive;
}
/** Ort-Wählen an/aus (das Kartenfenster zeigt dazu das Banner) */
export function setzePick(an: boolean): void {
  pickActive = an;
}

export function setGroupVisible(map: maplibregl.Map, group: keyof typeof LAYER_GROUPS, on: boolean) {
  for (const id of LAYER_GROUPS[group]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
}

// ---------------------------------------------------------------- Simulation


/** Fahrzeuge, die frei auf ihrer Wache stehen, zeigt die Karte nicht (die Wache zeigt sie beim Anklicken) */
export function daheim(fz: (typeof sim.state.fahrzeuge)[string]): boolean {
  if (fz.einsatzId || fz.phase !== "frei") return false;
  return Math.abs(fz.lat - fz.heim.lat) < 0.0005 && Math.abs(fz.lon - fz.heim.lon) < 0.0005;
}

/** Spieler-NAH: Flugspur (wo er war), nur hier in der Anzeige gesammelt */
const spuren = new Map<string, [number, number][]>();
function spurFeatures(): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  for (const fz of Object.values(sim.state.fahrzeuge)) {
    if (!fz.pilot) {
      spuren.delete(fz.id);
      continue;
    }
    const l = spuren.get(fz.id) ?? [];
    const letzt = l[l.length - 1];
    if (!letzt || Math.abs(letzt[0] - fz.lon) + Math.abs(letzt[1] - fz.lat) > 0.0004) l.push([fz.lon, fz.lat]);
    if (l.length > 600) l.splice(0, l.length - 600);
    spuren.set(fz.id, l);
    if (l.length > 1) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: l }, properties: { color: sim.statusDef(fz.status).farbe } });
  }
  return { type: "FeatureCollection", features };
}

/** Besatzungen zu Fuß bzw. beim Patienten: ein Punkt je Besatzung (weiter weg), ein Punkt je Person (nah) */
function besatzungFeatures(): FeatureCollection<Point> {
  const t = anzeigeZeit();
  const out: Feature[] = [];
  for (const fz of Object.values(sim.state.fahrzeuge)) {
    const b = besatzungBei(fz, t);
    if (!b) continue;
    out.push(pointFeature(fz.id, b.pos[0], b.pos[1], { einzel: 0, ruf: fz.funkrufname }));
    personenBei(fz, t).forEach((p, i) => out.push(pointFeature(`${fz.id}-${i}`, p.pos[0], p.pos[1], { einzel: 1, ruf: fz.funkrufname })));
  }
  return collection(out);
}

/** Flugzeuge mit angekündigtem Notfall an Bord: Anflug, Landung, Rollen zur Abstellposition (bleibt dort, bis der Einsatz zu ist) */
function flugzeugFeatures(): FeatureCollection<Point> {
  const t = anzeigeZeit();
  const out: Feature[] = [];
  for (const e of sim.state.einsaetze) {
    const f = e.flughafen?.flug;
    if (!f || e.zustand === "abgeschlossen") continue;
    const p = flugPosition(f, t);
    if (!p) continue;
    out.push(pointFeature(`flug-${e.id}`, p.lon, p.lat, { name: f.nummer, kurs: p.kurs, boden: p.amBoden ? 1 : 0, einsatz: e.id }));
  }
  return collection(out);
}
/** Flugzeug in der Luft oder beim Rollen (dann öfter neu zeichnen) */
function flugzeugBewegt(): boolean {
  const t = anzeigeZeit();
  return sim.state.einsaetze.some((e) => {
    const f = e.flughafen?.flug;
    return !!f && e.zustand !== "abgeschlossen" && t >= f.bahn[0].t && t <= f.amStand + 2000;
  });
}
/** Flugzeug-Symbol (von oben, Nase nach oben) */
function flugzeugBild(): ImageData {
  const n = 64;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!;
  g.translate(n / 2, n / 2);
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#1f2937";
  g.lineWidth = 2.2;
  g.lineJoin = "round";
  g.beginPath();
  // Rumpf, Flügel, Leitwerk
  g.moveTo(0, -28);
  g.quadraticCurveTo(4, -24, 4, -14);
  g.lineTo(4, -6);
  g.lineTo(28, 6);
  g.lineTo(28, 11);
  g.lineTo(4, 5);
  g.lineTo(3.5, 18);
  g.lineTo(12, 25);
  g.lineTo(12, 29);
  g.lineTo(0, 26);
  g.lineTo(-12, 29);
  g.lineTo(-12, 25);
  g.lineTo(-3.5, 18);
  g.lineTo(-4, 5);
  g.lineTo(-28, 11);
  g.lineTo(-28, 6);
  g.lineTo(-4, -6);
  g.lineTo(-4, -14);
  g.quadraticCurveTo(-4, -24, 0, -28);
  g.closePath();
  g.fill();
  g.stroke();
  return g.getImageData(0, 0, n, n);
}

/** Fahrzeuge von Feuerwehr, Polizei, Berg- und Wasserrettung */
function partnerFzFeatures(): FeatureCollection<Point> {
  return collection((sim.state.partnerFz ?? []).map((u) => pointFeature(u.id, u.lon, u.lat, { name: u.name, color: PARTNER_FARBE[u.art], einsatz: u.einsatzId })));
}

/** Für die Fahrtwege: welche Fahrzeuge gerade gewählt sind (Fahrzeug selbst oder alle eines Einsatzes) und ihre Farbe */
export interface WegeQuelle {
  fahrzeuge(): string[];
  farbe(fzId: string): string;
}

/**
 * Fahrtwege nur bei Auswahl: Bodenfahrzeuge entlang der Straße (Rest der Route ab der aktuellen Position),
 * Hubschrauber in Luftlinie zum Ziel (gestrichelt).
 */
function wegeFeatures(q: WegeQuelle | null): FeatureCollection<LineString> {
  const feats: GFeature<LineString>[] = [];
  if (!q) return { type: "FeatureCollection", features: feats };
  const t = anzeigeZeit();
  for (const id of q.fahrzeuge()) {
    const fz = sim.state.fahrzeuge[id];
    const f = fz?.fahrt;
    if (!fz || !f || t > f.start + f.dauer * 1000 + 1500) continue;
    const [lon, lat] = positionBei(fz, t);
    const ziel = f.coords[f.coords.length - 1];
    const luft = fliegt(fz);
    let coords: [number, number][];
    if (luft) coords = [[lon, lat], ziel];
    else {
      const el = (t - f.start) / 1000;
      let i = f.times.findIndex((x) => x >= el);
      if (i < 0) i = f.coords.length - 1;
      coords = [[lon, lat], ...f.coords.slice(Math.max(1, i))];
    }
    if (coords.length < 2) continue;
    feats.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { farbe: q.farbe(id), luft: luft ? 1 : 0 } });
  }
  return { type: "FeatureCollection", features: feats };
}

export interface SimLayers {
  /** Fahrtwege neu zeichnen (z. B. nach einer neuen Auswahl) */
  wegeNeu(): void;
}

export function addSimLayers(map: maplibregl.Map, cb: { onIncident(id: string): void; wege: WegeQuelle }): SimLayers {
  map.addSource("lw-routes", { type: "geojson", data: wegeFeatures(cb.wege) });
  map.addSource("lw-pilot-spur", { type: "geojson", data: spurFeatures() });
  map.addSource("lw-partner-fz", { type: "geojson", data: partnerFzFeatures() });
  map.addSource("lw-besatzung", { type: "geojson", data: besatzungFeatures() });
  map.addSource("lw-flugzeuge", { type: "geojson", data: flugzeugFeatures() });
  if (!map.hasImage("lw-flugzeug")) map.addImage("lw-flugzeug", flugzeugBild(), { pixelRatio: 2 });

  // Fahrtweg (Boden): dunkler Rand, darüber die Statusfarbe; Flugweg: Luftlinie, lang gestrichelt
  map.addLayer({
    id: "lw-routes-rand",
    type: "line",
    source: "lw-routes",
    filter: ["==", ["get", "luft"], 0],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#111216", "line-opacity": 0.55, "line-width": 8 },
  });
  map.addLayer({
    id: "lw-routes",
    type: "line",
    source: "lw-routes",
    filter: ["==", ["get", "luft"], 0],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "farbe"], "line-width": 4.5 },
  });
  map.addLayer({
    id: "lw-routes-luft",
    type: "line",
    source: "lw-routes",
    filter: ["==", ["get", "luft"], 1],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: { "line-color": ["get", "farbe"], "line-width": 3, "line-dasharray": [14 / 3, 8 / 3] },
  });
  // Spieler-NAH: geflogene Strecke
  map.addLayer({
    id: "lw-pilot-spur",
    type: "line",
    source: "lw-pilot-spur",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.75 },
  });
  // Partner-Fahrzeuge: klein, unter den eigenen Fahrzeugen
  map.addLayer({
    id: "lw-partner-fz",
    type: "circle",
    source: "lw-partner-fz",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 10, 3.5, 13, 6],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.2],
    },
  });
  map.addLayer({
    id: "lw-partner-fz-label",
    type: "symbol",
    source: "lw-partner-fz",
    minzoom: 12,
    layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 10, "text-offset": [0, 1], "text-anchor": "top" },
    paint: { "text-color": "#374151", "text-halo-color": "#ffffff", "text-halo-width": 1.3 },
  });
  // Besatzung zu Fuß (wie im Entwurf: kleiner orangener Punkt, dunkler Rand, heller Außenring) – erst ganz nah
  for (const [id, einzel, min, max] of [["lw-besatzung", 0, 15, 16], ["lw-besatzung-einzeln", 1, 16, 24]] as const) {
    map.addLayer({
      id: `${id}-ring`,
      type: "circle",
      source: "lw-besatzung",
      filter: ["==", ["get", "einzel"], einzel],
      minzoom: min,
      maxzoom: max,
      paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-opacity": 0.9 },
    });
    map.addLayer({
      id,
      type: "circle",
      source: "lw-besatzung",
      filter: ["==", ["get", "einzel"], einzel],
      minzoom: min,
      maxzoom: max,
      paint: { "circle-radius": 3.5, "circle-color": "#EBB36B", "circle-stroke-color": "#111216", "circle-stroke-width": 1.5 },
    });
  }
  // Flugzeug mit angekündigtem Notfall (Anflug, Landung, Rollen)
  map.addLayer({
    id: "lw-flugzeuge",
    type: "symbol",
    source: "lw-flugzeuge",
    layout: {
      "icon-image": "lw-flugzeug",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.45, 12, 0.8, 15, 1.4],
      "icon-rotate": ["get", "kurs"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "text-field": ["get", "name"],
      "text-font": FONT,
      "text-size": 10,
      "text-offset": [0, 1.8],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
  });

  map.on("click", "lw-flugzeuge", (e) => {
    const id = e.features?.[0]?.properties?.einsatz as string | undefined;
    if (id && !pickActive) cb.onIncident(id);
  });
  map.on("click", "lw-partner-fz", (e) => {
    const id = e.features?.[0]?.properties?.einsatz as string | undefined;
    if (id && !pickActive) cb.onIncident(id);
  });
  for (const l of ["lw-flugzeuge", "lw-partner-fz"]) {
    map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", l, () => (map.getCanvas().style.cursor = pickActive ? "crosshair" : ""));
  }

  const wegeNeu = () => (map.getSource("lw-routes") as maplibregl.GeoJSONSource | undefined)?.setData(wegeFeatures(cb.wege));
  let last = 0;
  const ausSim = sim.onChange(() => {
    const now = performance.now();
    if (now - last < 300) return;
    last = now;
    (map.getSource("lw-partner-fz") as maplibregl.GeoJSONSource | undefined)?.setData(partnerFzFeatures());
    (map.getSource("lw-besatzung") as maplibregl.GeoJSONSource | undefined)?.setData(besatzungFeatures());
    (map.getSource("lw-pilot-spur") as maplibregl.GeoJSONSource | undefined)?.setData(spurFeatures());
    (map.getSource("lw-flugzeuge") as maplibregl.GeoJSONSource | undefined)?.setData(flugzeugFeatures());
    wegeNeu();
  });
  map.once("remove", ausSim);
  // Flüssige Bewegung: Wege und Besatzung ca. 10× pro Sekunde neu (nur wenn das Spiel läuft und etwas fährt)
  const glatt = window.setInterval(() => {
    if (!sim.state.laeuft || document.hidden) return;
    if (cb.wege.fahrzeuge().length) wegeNeu();
    const geht = Object.values(sim.state.fahrzeuge).some((fz) => fz.fuss);
    if (geht) (map.getSource("lw-besatzung") as maplibregl.GeoJSONSource | undefined)?.setData(besatzungFeatures());
    if (flugzeugBewegt()) (map.getSource("lw-flugzeuge") as maplibregl.GeoJSONSource | undefined)?.setData(flugzeugFeatures());
  }, 100);
  map.once("remove", () => window.clearInterval(glatt));
  return { wegeNeu };
}
