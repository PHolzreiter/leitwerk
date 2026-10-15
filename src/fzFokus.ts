/**
 * Fahrzeug im Blick: Klick zeigt Auftrag und Route, Doppelklick zoomt heran und die Kamera folgt
 * (2D von oben, 3D schräg von der Seite).
 */
import maplibregl from "maplibre-gl";
import type { FeatureCollection, Feature, LineString, Point } from "geojson";
import { flughoehe, positionBei, richtungBei } from "./sim/bewegung";
import { fliegt, sim, type SimFahrzeug } from "./sim/engine";
import { hhmm } from "./sim/kt";
import { codeText } from "./sim/ktCodes";
import { findCode } from "./sim/codes";
import { esc } from "./ui/dom";

export interface FzFokus {
  /** Fahrzeug auswählen (Popup + Route), null = abwählen */
  waehle(id: string | null): void;
  /** Kamera folgt dem Fahrzeug, null = nicht mehr folgen */
  folge(id: string | null): void;
  gewaehlt(): string | null;
  /** Kamera folgt gerade einem Fahrzeug */
  folgt(): boolean;
}

export interface FzFokusDeps {
  is3d(): boolean;
  /** Auftrag des Fahrzeugs öffnen (Einsatz oder Krankentransport) */
  oeffne(fz: SimFahrzeug): void;
}

const LEER: FeatureCollection = { type: "FeatureCollection", features: [] };

export function addFzFokus(map: maplibregl.Map, deps: FzFokusDeps): FzFokus {
  let gewaehlt: string | null = null;
  let folgt: string | null = null;
  let laeuft = 0;

  // Zwischen zwei Simulationsschritten weiterrechnen (flüssige Kamera)
  let simZeit = sim.state.zeit;
  let simReal = performance.now();
  const aus1 = sim.onChange(() => {
    if (sim.state.zeit !== simZeit) {
      simZeit = sim.state.zeit;
      simReal = performance.now();
    }
  });
  const jetzt = () => (sim.state.laeuft ? simZeit + Math.min(1500, performance.now() - simReal) * sim.state.tempo : simZeit);

  map.addSource("lw-fz-sel", { type: "geojson", data: LEER });
  map.addLayer({
    id: "lw-fz-sel-linie",
    type: "line",
    source: "lw-fz-sel",
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ff8c1a", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 15, 6], "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "lw-fz-sel-ziel",
    type: "circle",
    source: "lw-fz-sel",
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 7, "circle-color": "#ff8c1a", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
  });

  /** Popup: in 3D unter dem Fahrzeug, damit der fliegende Hubschrauber darüber sichtbar bleibt */
  const neuesPopup = () => {
    const p = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 16, className: "fz-popup", maxWidth: "300px", anchor: deps.is3d() ? "top" : undefined });
    p.on("close", () => {
      if (!schliesstSelbst) {
        gewaehlt = null;
        folge(null);
        routeZeichnen();
      }
    });
    return p;
  };
  let popup = neuesPopup();
  let schliesstSelbst = false;

  // Hinweis „Kamera folgt …“
  const chip = document.createElement("div");
  chip.className = "fz-folgt";
  chip.hidden = true;
  map.getContainer().appendChild(chip);

  /** Rest der Route ab der aktuellen Position */
  function routeZeichnen(): void {
    const src = map.getSource("lw-fz-sel") as maplibregl.GeoJSONSource | undefined;
    const fz = gewaehlt ? sim.state.fahrzeuge[gewaehlt] : undefined;
    if (!src) return;
    if (!fz?.fahrt) {
      src.setData(LEER);
      return;
    }
    const f = fz.fahrt;
    const t = jetzt();
    const el = (t - f.start) / 1000;
    let i = f.times.findIndex((x) => x >= el);
    if (i < 0) i = f.coords.length - 1;
    const [lon, lat] = positionBei(fz, t);
    const rest: [number, number][] = [[lon, lat], ...f.coords.slice(Math.max(1, i))];
    const ziel = f.coords[f.coords.length - 1];
    const feats: Feature[] = [
      { type: "Feature", geometry: { type: "LineString", coordinates: rest } as LineString, properties: {} },
      { type: "Feature", geometry: { type: "Point", coordinates: ziel } as Point, properties: {} },
    ];
    src.setData({ type: "FeatureCollection", features: feats });
  }

  function auftragText(fz: SimFahrzeug): string {
    if (fz.einsatzId) {
      const e = sim.einsatz(fz.einsatzId);
      if (e) {
        const c = findCode(e.code ?? undefined);
        return `<b>${esc(e.nummer)}</b> ${c ? esc(`${c.code} ${c.beschreibung}`) : ""}<br><span class="muted">${esc(e.adresse?.label ?? "")}</span>`;
      }
    }
    const ids = fz.kt?.aktiv ? (fz.kt.fahrten[0] ?? []) : [];
    if (ids.length) {
      return ids
        .map((id) => sim.ktAuftrag(id))
        .filter((k) => !!k)
        .map((k) => `<b>${esc(k!.nummer)}</b> ${esc(codeText(k!.d.code))}<br><span class="muted">${esc(k!.d.von?.label ?? "?")} → ${esc(k!.d.nach?.label ?? "?")}</span>`)
        .join("<br>");
    }
    if (fz.kt) return `<span class="muted">für ${fz.kt.fahrten.flat().length} Krankentransport(e) vorgemerkt</span>`;
    return `<span class="muted">kein Auftrag</span>`;
  }

  function popupInhalt(fz: SimFahrzeug): HTMLElement {
    const d = document.createElement("div");
    const st = sim.statusDef(fz.status);
    const t = jetzt();
    const rest = fz.fahrt ? Math.max(0, (fz.fahrt.start + fz.fahrt.dauer * 1000 - t) / 60_000) : null;
    const hoehe = flughoehe(fz, t);
    d.innerHTML = `
      <div class="lw-popup-title">${esc(fz.funkrufname)} <span class="fz-popup-typ">${esc(fz.rmTyp)}</span></div>
      <div class="lw-popup-sub"><span class="fz-st" style="background:${esc(st.farbe)}">${fz.status === "alarmWache" || fz.status === "alarmFunk" ? "&nbsp;" : esc(String(st.nummer))}</span> ${esc(st.name)}${fz.blaulicht ? " · mit Sondersignal" : ""}${hoehe > 5 ? ` · in der Luft (${Math.round(hoehe)} m)` : ""}</div>
      <div class="fz-popup-auftrag">${auftragText(fz)}</div>
      ${rest !== null ? `<div class="fz-popup-eta">Ankunft ca. ${hhmm(t + rest * 60_000)} (in ${Math.max(1, Math.round(rest))} min)</div>` : ""}`;
    const knoepfe = document.createElement("div");
    knoepfe.className = "fz-popup-btns";
    const b1 = document.createElement("button");
    b1.className = "btn small";
    b1.textContent = folgt === fz.id ? "Nicht mehr folgen" : "🎥 Kamera folgen";
    b1.addEventListener("click", () => folge(folgt === fz.id ? null : fz.id));
    knoepfe.appendChild(b1);
    if (fz.einsatzId || fz.kt) {
      const b2 = document.createElement("button");
      b2.className = "btn small";
      b2.textContent = "Auftrag öffnen";
      b2.addEventListener("click", () => deps.oeffne(fz));
      knoepfe.appendChild(b2);
    }
    d.appendChild(knoepfe);
    return d;
  }

  let inhaltKey = "";
  function popupAktualisieren(neu = false): void {
    const fz = gewaehlt ? sim.state.fahrzeuge[gewaehlt] : undefined;
    if (!fz) return;
    const [lon, lat] = positionBei(fz, jetzt());
    popup.setLngLat([lon, lat]);
    const key = JSON.stringify([fz.status, fz.einsatzId, fz.kt?.fahrten, fz.blaulicht, folgt, Math.round((fz.fahrt?.start ?? 0) / 1000), Math.floor(jetzt() / 30_000)]);
    if (neu || key !== inhaltKey) {
      inhaltKey = key;
      popup.setDOMContent(popupInhalt(fz));
    }
    if (neu) popup.addTo(map);
  }

  function waehle(id: string | null): void {
    if (id === gewaehlt && id) {
      popupAktualisieren();
      return;
    }
    gewaehlt = id;
    if (folgt && folgt !== id) folge(null);
    schliesstSelbst = true;
    popup.remove();
    schliesstSelbst = false;
    popup = neuesPopup();
    if (id) popupAktualisieren(true);
    routeZeichnen();
  }

  function zielZoom(fz: SimFahrzeug): number {
    return fliegt(fz) ? (deps.is3d() ? 15.6 : 15) : 17;
  }

  function folge(id: string | null): void {
    folgt = id;
    cancelAnimationFrame(laeuft);
    const fz = id ? sim.state.fahrzeuge[id] : undefined;
    chip.hidden = !fz;
    if (!fz) {
      if (gewaehlt) popupAktualisieren(false);
      return;
    }
    if (gewaehlt !== fz.id) waehle(fz.id);
    chip.innerHTML = `🎥 Kamera folgt <b>${esc(fz.funkrufname)}</b> <button type="button" title="Nicht mehr folgen (Esc)">✕</button>`;
    chip.querySelector("button")!.addEventListener("click", () => folge(null));
    // Kamera jedes Bild aufs Fahrzeug; Zoom, Neigung und Drehung gleiten zum Ziel
    const t0 = jetzt();
    const r0 = richtungBei(fz, t0) ?? map.getBearing();
    let zielZ: number | null = Math.max(map.getZoom(), zielZoom(fz));
    let zielPitch: number | null = deps.is3d() ? 62 : 0;
    const zielB0 = deps.is3d() ? r0 - 35 : 0;
    let b = map.getBearing();
    const winkel = (soll: number, ist: number) => ((soll - ist + 540) % 360) - 180;
    const schritt = () => {
      if (folgt !== fz.id) return;
      const tt = jetzt();
      const [x, y] = positionBei(fz, tt);
      const opts: { center: [number, number]; zoom?: number; pitch?: number; bearing?: number } = { center: [x, y] };
      if (zielZ !== null) {
        const z = map.getZoom();
        opts.zoom = z + (zielZ - z) * 0.12;
        if (Math.abs(zielZ - z) < 0.03) zielZ = null; // danach darf man selbst zoomen
      }
      if (zielPitch !== null) {
        const pi = map.getPitch();
        opts.pitch = pi + (zielPitch - pi) * 0.12;
        if (Math.abs(zielPitch - pi) < 0.5) zielPitch = null;
      }
      if (deps.is3d()) {
        // schräg von der Seite hinter dem Fahrzeug, weich nachdrehen
        const rr = richtungBei(fz, tt);
        const soll = rr !== null ? rr - 35 : zielB0;
        b += winkel(soll, b) * 0.05;
        opts.bearing = b;
      } else if (Math.abs(winkel(0, map.getBearing())) > 0.5) opts.bearing = map.getBearing() + winkel(0, map.getBearing()) * 0.12;
      map.jumpTo(opts);
      if (gewaehlt === fz.id) popup.setLngLat([x, y]);
      laeuft = requestAnimationFrame(schritt);
    };
    laeuft = requestAnimationFrame(schritt);
    popupAktualisieren(false);
  }

  // Wer die Karte selbst verschiebt, beendet das Folgen
  map.on("dragstart", () => folgt && folge(null));
  const escTaste = (e: KeyboardEvent) => {
    if (e.key === "Escape" && folgt) {
      e.stopImmediatePropagation();
      folge(null);
    }
  };
  window.addEventListener("keydown", escTaste, true);

  let last = 0;
  const aus2 = sim.onChange(() => {
    if (!gewaehlt) return;
    const now = performance.now();
    if (now - last < 250) return;
    last = now;
    if (!sim.state.fahrzeuge[gewaehlt]) return waehle(null);
    routeZeichnen();
    popupAktualisieren(false);
  });

  map.once("remove", () => {
    aus1();
    aus2();
    cancelAnimationFrame(laeuft);
    window.removeEventListener("keydown", escTaste, true);
    popup.remove();
  });

  return { waehle, folge, gewaehlt: () => gewaehlt, folgt: () => folgt !== null };
}
