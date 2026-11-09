/**
 * Fahrzeug im Blick: Klick wählt (Info-Karte und Fahrtweg zeichnet das Kartenfenster), Doppelklick zoomt heran
 * und die Kamera folgt (2D von oben, 3D schräg von der Seite).
 */
import maplibregl from "maplibre-gl";
import { positionBei, richtungBei } from "./sim/bewegung";
import { fliegt, sim, type SimFahrzeug } from "./sim/engine";

export interface FzFokus {
  /** Fahrzeug auswählen (Info-Karte und Fahrtweg zeigt das Kartenfenster), null = abwählen */
  waehle(id: string | null): void;
  /** Kamera folgt dem Fahrzeug, null = nicht mehr folgen */
  folge(id: string | null): void;
  gewaehlt(): string | null;
  /** Kamera folgt gerade einem Fahrzeug */
  folgt(): boolean;
  /** welchem Fahrzeug die Kamera folgt */
  folgtId(): string | null;
}

export interface FzFokusDeps {
  is3d(): boolean;
  /** Auswahl oder Folgen hat sich geändert (neu zeichnen) */
  geaendert(): void;
}

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

  function waehle(id: string | null): void {
    if (id === gewaehlt) return;
    gewaehlt = id;
    if (folgt && folgt !== id) folge(null);
    deps.geaendert();
  }

  function zielZoom(fz: SimFahrzeug): number {
    return fliegt(fz) ? (deps.is3d() ? 15.6 : 15) : 17;
  }

  function folge(id: string | null): void {
    folgt = id;
    cancelAnimationFrame(laeuft);
    const fz = id ? sim.state.fahrzeuge[id] : undefined;
    if (!fz) {
      folgt = null;
      deps.geaendert();
      return;
    }
    if (gewaehlt !== fz.id) gewaehlt = fz.id;
    deps.geaendert();
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
      laeuft = requestAnimationFrame(schritt);
    };
    laeuft = requestAnimationFrame(schritt);
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

  const aus2 = sim.onChange(() => {
    if (gewaehlt && !sim.state.fahrzeuge[gewaehlt]) waehle(null);
  });

  map.once("remove", () => {
    aus1();
    aus2();
    cancelAnimationFrame(laeuft);
    window.removeEventListener("keydown", escTaste, true);
  });

  return { waehle, folge, gewaehlt: () => gewaehlt, folgt: () => folgt !== null, folgtId: () => folgt };
}
