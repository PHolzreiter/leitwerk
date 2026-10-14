/**
 * 3D-Fahrzeugmodelle (nur in der 3D-Ansicht und nah herangezoomt).
 *
 * Bewusst einfach und schnell: jedes Fahrzeug besteht aus wenigen Quadern (Karosserie,
 * Fenster, Räder, Blaulicht), direkt mit WebGL gezeichnet – ohne zusätzliche Bibliothek.
 * Einheitlich in der Farbe der Organisation; Blaulicht blinkt bei Sondersignal.
 */
import maplibregl from "maplibre-gl";
import { store } from "./data/store";
import { flughoehe, positionBei, richtungBei, rotorLaeuft } from "./sim/bewegung";
import { sim, type SimFahrzeug } from "./sim/engine";
import { orgFarbe } from "./mapLayers";

/** Ab dieser Zoomstufe Modelle statt Punkte */
export const ZOOM_MODELLE = 16;
/** Fliegende Hubschrauber schon ab dieser Zoomstufe als Modell (vergrößert) */
export const ZOOM_FLUG = 12.5;
/** Unterhalb dieser Zoomstufe werden die Modelle etwas vergrößert, damit man sie erkennt */
const ZOOM_ECHT = 18.5;

type Teil = "karosserie" | "glas" | "rad" | "blau" | "rotor" | "dunkel";
/** Quader: Mitte (x quer, y längs nach vorne, z hoch) und Maße in Metern */
interface Quader {
  x: number;
  y: number;
  z: number;
  b: number;
  l: number;
  h: number;
  teil: Teil;
  /** dreht sich (Rotorblatt) */
  dreh?: boolean;
}

const q = (x: number, y: number, z: number, b: number, l: number, h: number, teil: Teil, dreh = false): Quader => ({ x, y, z, b, l, h, teil, dreh });

function raeder(spur: number, vorn: number, hinten: number, r = 0.35): Quader[] {
  return [q(-spur, vorn, r, 0.26, r * 2, r * 2, "rad"), q(spur, vorn, r, 0.26, r * 2, r * 2, "rad"), q(-spur, hinten, r, 0.26, r * 2, r * 2, "rad"), q(spur, hinten, r, 0.26, r * 2, r * 2, "rad")];
}

/** VW T6 Hochdach: KTW, RTW, SKTW */
const T6_HOCHDACH: Quader[] = [
  q(0, -0.5, 1.35, 1.9, 4.3, 2.0, "karosserie"),
  q(0, 2.15, 0.8, 1.9, 1.0, 0.9, "karosserie"),
  q(0, 1.62, 1.72, 1.78, 0.08, 0.75, "glas"),
  q(0, 1.05, 1.78, 1.93, 1.0, 0.6, "glas"),
  q(-0.55, 1.4, 2.43, 0.4, 0.25, 0.16, "blau"),
  q(0.55, 1.4, 2.43, 0.4, 0.25, 0.16, "blau"),
  q(-0.6, -2.5, 2.43, 0.3, 0.2, 0.14, "blau"),
  q(0.6, -2.5, 2.43, 0.3, 0.2, 0.14, "blau"),
  ...raeder(0.85, 1.75, -1.6),
];

/** VW Crafter: RTW-C, SRTW, SNAW */
const CRAFTER: Quader[] = [
  q(0, -0.55, 1.65, 2.05, 5.8, 2.5, "karosserie"),
  q(0, 2.85, 0.9, 2.0, 1.0, 1.0, "karosserie"),
  q(0, 2.3, 1.95, 1.9, 0.08, 0.9, "glas"),
  q(0, 1.75, 2.0, 2.08, 1.0, 0.65, "glas"),
  q(-0.6, 2.15, 3.0, 0.45, 0.28, 0.18, "blau"),
  q(0.6, 2.15, 3.0, 0.45, 0.28, 0.18, "blau"),
  q(-0.65, -3.3, 3.0, 0.35, 0.22, 0.16, "blau"),
  q(0.65, -3.3, 3.0, 0.35, 0.22, 0.16, "blau"),
  ...raeder(0.95, 2.55, -2.2, 0.38),
];

/** VW T6 Bus (ohne Hochdach): NEF */
const T6_BUS: Quader[] = [
  q(0, -0.5, 1.15, 1.9, 3.9, 1.6, "karosserie"),
  q(0, 1.95, 0.78, 1.9, 1.0, 0.86, "karosserie"),
  q(0, 1.42, 1.55, 1.78, 0.08, 0.6, "glas"),
  q(0, -0.45, 1.58, 1.93, 3.5, 0.5, "glas"),
  q(0, 0.9, 2.02, 1.3, 0.3, 0.14, "blau"),
  ...raeder(0.85, 1.55, -1.5),
];

/** VW Passat Kombi: BEL */
const PASSAT: Quader[] = [
  q(0, 0, 0.66, 1.8, 4.8, 0.72, "karosserie"),
  q(0, -0.35, 1.17, 1.66, 2.5, 0.3, "glas"),
  q(0, -0.4, 1.38, 1.6, 2.3, 0.12, "karosserie"),
  q(0, 0.25, 1.5, 1.1, 0.25, 0.12, "blau"),
  ...raeder(0.8, 1.45, -1.45, 0.33),
];

/** EC135: NAH */
const EC135: Quader[] = [
  q(0, 0.65, 1.45, 1.5, 2.5, 1.5, "karosserie"),
  q(0, 2.25, 1.35, 1.3, 0.7, 1.1, "karosserie"),
  q(0, 2.2, 1.65, 1.36, 0.78, 0.7, "glas"),
  q(0, -2.6, 1.72, 0.45, 4.0, 0.45, "karosserie"),
  q(0, -4.75, 2.25, 0.12, 0.6, 1.3, "karosserie"),
  q(0, -4.3, 1.75, 1.8, 0.4, 0.08, "karosserie"),
  q(-0.85, 0.5, 0.06, 0.1, 2.6, 0.1, "dunkel"),
  q(0.85, 0.5, 0.06, 0.1, 2.6, 0.1, "dunkel"),
  q(-0.85, 0.5, 0.35, 0.08, 0.1, 0.55, "dunkel"),
  q(0.85, 0.5, 0.35, 0.08, 0.1, 0.55, "dunkel"),
  q(0, 0.6, 2.35, 0.3, 0.3, 0.3, "dunkel"),
  q(0, 0.6, 2.55, 0.28, 10.2, 0.05, "rotor", true),
  q(0, 0.6, 2.55, 10.2, 0.28, 0.05, "rotor", true),
];

/** BIT: kleiner Koffer-LKW */
const LKW: Quader[] = [
  q(0, 2.45, 1.3, 2.1, 1.5, 1.9, "karosserie"),
  q(0, 3.22, 1.75, 1.95, 0.06, 0.8, "glas"),
  q(0, -1.15, 1.85, 2.3, 5.4, 2.6, "karosserie"),
  q(0, 0.5, 0.5, 1.4, 6.0, 0.35, "dunkel"),
  q(-0.6, 3.0, 2.33, 0.4, 0.25, 0.15, "blau"),
  q(0.6, 3.0, 2.33, 0.4, 0.25, 0.15, "blau"),
  ...raeder(1.0, 2.4, -2.3, 0.45),
];

function formFuer(fz: SimFahrzeug): Quader[] {
  switch (fz.rmTyp) {
    case "NAH":
    case "ITH":
      return EC135;
    case "BIT":
      return LKW;
    case "EL ÖBB":
      return PASSAT;
    case "RTW-C":
    case "SRTW":
    case "SNAW":
      return CRAFTER;
    case "NEF":
      return T6_BUS;
    case "BEL":
      return PASSAT;
    default:
      return T6_HOCHDACH;
  }
}

// ---------------------------------------------------------------- Mathe (Spalten-Matrizen, 64 bit)

type M4 = Float64Array;
function mul(a: ArrayLike<number>, b: ArrayLike<number>): M4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
function trans(x: number, y: number, z: number): M4 {
  const o = new Float64Array(16);
  o[0] = o[5] = o[10] = o[15] = 1;
  o[12] = x;
  o[13] = y;
  o[14] = z;
  return o;
}
function skal(x: number, y: number, z: number): M4 {
  const o = new Float64Array(16);
  o[0] = x;
  o[5] = y;
  o[10] = z;
  o[15] = 1;
  return o;
}
function rotZ(a: number): M4 {
  const o = new Float64Array(16);
  const c = Math.cos(a);
  const s = Math.sin(a);
  o[0] = c;
  o[1] = s;
  o[4] = -s;
  o[5] = c;
  o[10] = o[15] = 1;
  return o;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ---------------------------------------------------------------- WebGL

const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
uniform mat4 uMVP;
uniform mat3 uRot;
varying vec3 vNor;
void main() {
  vNor = normalize(uRot * aNor);
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;
const FS = `
precision mediump float;
uniform vec3 uFarbe;
uniform float uLeucht;
varying vec3 vNor;
void main() {
  vec3 licht = normalize(vec3(-0.4, 0.5, 0.8));
  float d = max(dot(normalize(vNor), licht), 0.0);
  vec3 f = uFarbe * (0.5 + 0.5 * d);
  gl_FragColor = vec4(mix(f, uFarbe * 1.6, uLeucht), 1.0);
}`;

/** Würfel −0.5…0.5 mit Normalen, 36 Ecken */
function wuerfel(): Float32Array {
  const seiten: [number[], number[][]][] = [
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  ];
  const out: number[] = [];
  for (const [n, v] of seiten) for (const i of [0, 1, 2, 0, 2, 3]) out.push(v[i][0] / 2, v[i][1] / 2, v[i][2] / 2, n[0], n[1], n[2]);
  return new Float32Array(out);
}

const FARBEN: Record<Exclude<Teil, "karosserie">, [number, number, number]> = {
  glas: hexRgb("#1c2733"),
  rad: hexRgb("#141619"),
  dunkel: hexRgb("#2a2d31"),
  rotor: hexRgb("#30343a"),
  blau: hexRgb("#1f5dff"),
};

export interface Fahrzeug3D {
  /** 3D-Ansicht an/aus (Modelle nur in 3D) */
  setMode3d(on: boolean): void;
  /** Modelle ein/aus (Einstellung) */
  setAktiv(on: boolean): void;
  aktiv(): boolean;
  /** Fahrzeug unter dem Bildschirmpunkt (für Klicks auf Modelle) */
  treffer(x: number, y: number): string | null;
}

const LS = "leitwerk.modelle3d";
export function modelleGewuenscht(): boolean {
  try {
    return localStorage.getItem(LS) !== "0";
  } catch {
    return true;
  }
}

export function addFahrzeug3D(map: maplibregl.Map): Fahrzeug3D {
  let mode3d = false;
  let gewuenscht = modelleGewuenscht();
  let prog: WebGLProgram | null = null;
  let buf: WebGLBuffer | null = null;
  const loc: Record<string, WebGLUniformLocation | number | null> = {};
  const richtungMerk = new Map<string, number>();
  const farbeMerk = new Map<string, [number, number, number]>();
  // Zwischen zwei Simulationsschritten weiterrechnen (flüssige Bewegung)
  let simZeit = sim.state.zeit;
  let simReal = performance.now();
  sim.onChange(() => {
    if (sim.state.zeit !== simZeit) {
      simZeit = sim.state.zeit;
      simReal = performance.now();
    }
  });
  const jetzt = () => (sim.state.laeuft ? simZeit + Math.min(1500, performance.now() - simReal) * sim.state.tempo : simZeit);

  const sichtbar = () => mode3d && gewuenscht && map.getZoom() >= ZOOM_FLUG;
  /** zuletzt gezeichnete Bildschirmpositionen (Pixel) */
  let bildpunkte: { id: string; x: number; y: number }[] = [];

  /** Punkte nur beim Herauszoomen; Beschriftung schwebt über dem Modell */
  const ebenenAnpassen = () => {
    const an = mode3d && gewuenscht;
    const max = an ? ZOOM_MODELLE : 24;
    if (map.getLayer("lw-vehicles")) {
      map.setLayerZoomRange("lw-vehicles", 0, max);
      // fliegende Hubschrauber sind ab ZOOM_FLUG als Modell zu sehen: dort keinen Punkt
      const op = an ? ["step", ["zoom"], 1, ZOOM_FLUG, ["case", ["==", ["get", "flug"], 1], 0, 1]] : 1;
      map.setPaintProperty("lw-vehicles", "circle-opacity", op);
      map.setPaintProperty("lw-vehicles", "circle-stroke-opacity", op);
    }
    if (map.getLayer("lw-vehicles-nr")) {
      map.setLayerZoomRange("lw-vehicles-nr", 10, max);
      map.setPaintProperty("lw-vehicles-nr", "text-opacity", an ? ["step", ["zoom"], 1, ZOOM_FLUG, ["case", ["==", ["get", "flug"], 1], 0, 1]] : 1);
    }
    if (map.getLayer("lw-vehicles-shadow")) map.setLayerZoomRange("lw-vehicles-shadow", 0, max);
    if (map.getLayer("lw-vehicles-label")) {
      map.setLayoutProperty("lw-vehicles-label", "text-anchor", an ? ["step", ["zoom"], "top", ZOOM_MODELLE, "bottom"] : "top");
      map.setLayoutProperty("lw-vehicles-label", "text-offset", an ? ["step", ["zoom"], ["literal", [0, 1.2]], ZOOM_MODELLE, ["literal", [0, -3.2]]] : [0, 1.2]);
    }
    map.triggerRepaint();
  };

  const farbe = (fz: SimFahrzeug): [number, number, number] => {
    let f = farbeMerk.get(fz.id);
    if (!f) {
      const st = store.get("stations", fz.stationId);
      f = hexRgb(st ? orgFarbe(st) : "#c62828");
      farbeMerk.set(fz.id, f);
    }
    return f;
  };

  const layer: maplibregl.CustomLayerInterface = {
    id: "lw-fz3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(_m, gl) {
      const sh = (typ: number, src: string) => {
        const s = gl.createShader(typ)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("3D-Shader", gl.getShaderInfoLog(s));
        return s;
      };
      prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      loc.aPos = gl.getAttribLocation(prog, "aPos");
      loc.aNor = gl.getAttribLocation(prog, "aNor");
      loc.uMVP = gl.getUniformLocation(prog, "uMVP");
      loc.uRot = gl.getUniformLocation(prog, "uRot");
      loc.uFarbe = gl.getUniformLocation(prog, "uFarbe");
      loc.uLeucht = gl.getUniformLocation(prog, "uLeucht");
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, wuerfel(), gl.STATIC_DRAW);
    },
    render(gl, args) {
      if (!prog || !sichtbar()) return;
      const t = jetzt();
      const real = performance.now();
      const blink = Math.floor(real / 260) % 2 === 0;
      const matrix = (args.defaultProjectionData?.mainMatrix ?? args.modelViewProjectionMatrix) as ArrayLike<number>;
      const b = map.getBounds();
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc.aPos as number);
      gl.vertexAttribPointer(loc.aPos as number, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.aNor as number);
      gl.vertexAttribPointer(loc.aNor as number, 3, gl.FLOAT, false, 24, 12);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      // keine Rückseiten-Auslese: das Modell ist für Mercator (y nach Süden) gespiegelt
      gl.disable(gl.CULL_FACE);
      let laeuft = false;
      const zoom = map.getZoom();
      const breite = map.getCanvas().clientWidth;
      const hoeheBild = map.getCanvas().clientHeight;
      const punkte: { id: string; x: number; y: number }[] = [];
      for (const fz of Object.values(sim.state.fahrzeuge)) {
        // wie in 2D: frei auf der Wache stehende Fahrzeuge nicht zeigen
        if (!fz.einsatzId && fz.phase === "frei" && Math.abs(fz.lat - fz.heim.lat) < 0.0005 && Math.abs(fz.lon - fz.heim.lon) < 0.0005) continue;
        const [lon, lat] = positionBei(fz, t);
        if (lon < b.getWest() - 0.01 || lon > b.getEast() + 0.01 || lat < b.getSouth() - 0.01 || lat > b.getNorth() + 0.01) continue;
        const r = richtungBei(fz, t);
        if (r !== null) richtungMerk.set(fz.id, r);
        const heading = richtungMerk.get(fz.id) ?? 0;
        const boden = map.queryTerrainElevation([lon, lat]) ?? 0;
        const hoehe = flughoehe(fz, t);
        const fliegend = hoehe > 5;
        if (zoom < ZOOM_MODELLE && !fliegend) continue;
        const mc = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], boden + hoehe);
        // knapp über der Grenze vergrößert (bis 4×, fliegend bis 30×), ganz nah in echter Größe
        const gross = Math.min(fliegend ? 30 : 4, Math.max(1, Math.pow(2, (ZOOM_ECHT - zoom) * 0.9)));
        const s = mc.meterInMercatorCoordinateUnits() * gross;
        // Modell: Meter → Mercator (y zeigt dort nach Süden), gedreht nach Fahrtrichtung
        const welt = mul(mul(trans(mc.x, mc.y, mc.z), skal(s, -s, s)), rotZ((-heading * Math.PI) / 180));
        const basis = mul(matrix, welt);
        // Bildschirmpunkt (Mitte, ca. 1,5 m hoch) für Klicks
        const cw = basis[11] * 1.5 + basis[15];
        if (cw > 0) {
          const cx = (basis[8] * 1.5 + basis[12]) / cw;
          const cy = (basis[9] * 1.5 + basis[13]) / cw;
          punkte.push({ id: fz.id, x: ((cx + 1) / 2) * breite, y: ((1 - cy) / 2) * hoeheBild });
        }
        const rotor = rotorLaeuft(fz, t);
        if (rotor || fz.blaulicht) laeuft = true;
        const koerper = farbe(fz);
        for (const teil of formFuer(fz)) {
          let lokal = trans(teil.x, teil.y, teil.z);
          if (teil.dreh) lokal = mul(lokal, rotZ(rotor ? (real / 1000) * 25 : 0.5));
          lokal = mul(lokal, skal(teil.b, teil.l, teil.h));
          const mvp = mul(basis, lokal);
          gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(mvp));
          // Normalen: nur die Drehung (Licht kommt von schräg oben)
          const a = (-heading * Math.PI) / 180 + (teil.dreh && rotor ? (real / 1000) * 25 : 0);
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          gl.uniformMatrix3fv(loc.uRot, false, new Float32Array([ca, sa, 0, -sa, ca, 0, 0, 0, 1]));
          const an = teil.teil === "blau" && fz.blaulicht && blink;
          const farbeTeil = teil.teil === "karosserie" ? koerper : FARBEN[teil.teil];
          gl.uniform3fv(loc.uFarbe, an ? [0.35, 0.55, 1] : farbeTeil);
          gl.uniform1f(loc.uLeucht, an ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 36);
        }
      }
      bildpunkte = punkte;
      // Fahrzeuge bewegen sich: weiterzeichnen (nur solange etwas zu sehen ist)
      if (laeuft || sim.state.laeuft) map.triggerRepaint();
    },
  };

  const hinzufuegen = () => {
    if (!map.getLayer("lw-fz3d")) map.addLayer(layer, map.getLayer("lw-vehicles-label") ? "lw-vehicles-label" : undefined);
    ebenenAnpassen();
  };
  if (map.isStyleLoaded() && map.getLayer("lw-vehicles")) hinzufuegen();
  else map.once("idle", hinzufuegen);
  map.on("zoomend", () => map.triggerRepaint());

  return {
    setMode3d(on) {
      mode3d = on;
      ebenenAnpassen();
    },
    setAktiv(on) {
      gewuenscht = on;
      try {
        localStorage.setItem(LS, on ? "1" : "0");
      } catch {
        /* egal */
      }
      ebenenAnpassen();
    },
    aktiv: () => gewuenscht,
    treffer(x, y) {
      if (!sichtbar()) return null;
      let best: { id: string; d: number } | null = null;
      for (const p of bildpunkte) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 28 && (!best || d < best.d)) best = { id: p.id, d };
      }
      return best?.id ?? null;
    },
  };
}
