import "./style.css";
import { store } from "./data/store";
import { availableMaps, createMap, type MapHandle } from "./map";
import { addDataLayers, addSimLayers, pickLocation, setGroupVisible, setSelectedIncident } from "./mapLayers";
import { sim } from "./sim/engine";
import { geoStatus } from "./sim/geo";
import { flugverbot, WETTER_LABEL, WETTER_SYMBOL } from "./sim/weather";
import { createDataView, type DataViewDeps } from "./ui/dataView";
import { toast } from "./ui/dom";
import { openEditor } from "./ui/editForm";
import { createOpsView } from "./ui/opsView";
import { createSettingsView } from "./ui/settingsView";
import { checkOnStart, ensureGrundpaket } from "./ui/packsView";
import { appVersion, onPacksChanged } from "./updates";

type View = "map" | "data" | "settings";
let currentView: View = "map";
let handle: MapHandle | null = null;
let settingsView: { refresh(): void } | null = null;

function showView(v: View): void {
  currentView = v;
  for (const id of ["map", "data", "settings"] as View[]) {
    const sec = document.getElementById(`view-${id}`);
    if (sec) sec.hidden = id !== v;
  }
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === v);
  });
  if (v === "map") requestAnimationFrame(() => handle?.map.resize());
  if (v === "settings") settingsView?.refresh();
}

function showMessage(text: string): void {
  const box = document.getElementById("map-message");
  if (!box) return;
  box.textContent = `${text} (Klicken zum Schließen)`;
  box.hidden = false;
  box.onclick = () => (box.hidden = true);
}

function setupSimBar(): void {
  const clock = document.getElementById("clock")!;
  const play = document.getElementById("sim-play") as HTMLButtonElement;
  const weather = document.getElementById("weather")!;
  const fmt = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tempoBtns = document.querySelectorAll<HTMLButtonElement>("[data-tempo]");

  const render = () => {
    clock.textContent = fmt.format(new Date(sim.state.zeit));
    play.textContent = sim.state.laeuft ? "❚❚ Pause" : "▶ Start";
    play.classList.toggle("primary", !sim.state.laeuft);
    tempoBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.tempo) === sim.state.tempo));
    const w = sim.state.wetter.lage;
    weather.textContent = `${WETTER_SYMBOL[w]} ${WETTER_LABEL[w]}`;
    weather.classList.toggle("bad", flugverbot(w));
    weather.title = flugverbot(w) ? "Kein Flugbetrieb für NAH" : "Flugbetrieb möglich";
  };
  play.addEventListener("click", () => (sim.state.laeuft ? sim.pause() : sim.start()));
  tempoBtns.forEach((b) => b.addEventListener("click", () => sim.setTempo(Number(b.dataset.tempo))));
  sim.onChange(render);
  render();
}

async function watchGeo(): Promise<void> {
  const out = document.getElementById("geo-status");
  for (let i = 0; i < 60; i++) {
    try {
      const g = await geoStatus();
      if (out) out.textContent = `Straßennetz: ${g.roads} · Adressen: ${g.addresses}`;
      if (g.roads !== "laden" && g.addresses !== "laden") {
        if (g.roads.startsWith("Fehler") || g.addresses.startsWith("Fehler")) toast(`${g.roads} / ${g.addresses}`, "error");
        return;
      }
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function init(): Promise<void> {
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => {
    t.addEventListener("click", () => showView(t.dataset.view as View));
  });

  await store.load();
  void appVersion().then((v) => {
    const el = document.getElementById("app-version");
    if (el && v !== "Browser") el.textContent = `v${v}`;
  });
  await ensureGrundpaket();
  setupSimBar();
  void watchGeo();

  let maps: string[] = [];
  try {
    maps = await availableMaps();
  } catch (err) {
    console.error(err);
  }
  if (!maps.includes("overview")) {
    showMessage("Die Kartendateien wurden nicht gefunden. Bitte unter Einstellungen → Kartenpakete das Grundpaket laden.");
  }

  const h = createMap("map", maps);
  handle = h;
  const map = h.map;

  const pickOnMap = async (hint: string) => {
    const prev = currentView;
    showView("map");
    const r = await pickLocation(map, hint);
    if (prev !== "map") showView(prev);
    return r;
  };

  const deps: DataViewDeps = {
    pickOnMap,
    showOnMap: (lat, lon) => {
      showView("map");
      map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14) });
    },
  };

  createDataView(document.getElementById("view-data")!, deps);
  settingsView = createSettingsView(document.getElementById("view-settings")!);

  const ops = createOpsView(
    document.querySelector<HTMLElement>(".ops-left")!,
    document.querySelector<HTMLElement>(".ops-right")!,
    {
      flyTo: (lat, lon, zoom) => map.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(map.getZoom(), 12.5) }),
      pickOnMap,
      onSelectIncident: (id) => setSelectedIncident(map, id),
    },
  );

  map.on("load", () => {
    addDataLayers(map, {
      onEdit: (kind, id) => openEditor(kind, id, deps),
      onCreateAt: (kind, lat, lon) => openEditor(kind, null, deps, { lat, lon }),
    });
    addSimLayers(map, {
      onIncident: (id) => ops.select(id),
      onVehicle: (id) => {
        const fz = sim.state.fahrzeuge[id];
        if (fz?.einsatzId) ops.select(fz.einsatzId);
        else if (fz) toast(`${fz.funkrufname}: ${sim.statusDef(fz.status).name}`);
      },
    });
  });

  // Ebenen ein-/ausblenden
  document.querySelectorAll<HTMLInputElement>(".map-panel input[data-group]").forEach((cb) => {
    cb.addEventListener("change", () => {
      setGroupVisible(map, cb.dataset.group as "stations" | "hospitals" | "pois", cb.checked);
    });
  });

  // 2D / 3D und Satellit (Satellit nur in 2D)
  const btn3d = document.getElementById("btn-3d") as HTMLButtonElement;
  const btnSat = document.getElementById("btn-sat") as HTMLButtonElement;
  let is3d = false;
  let isSat = false;
  const renderModeButtons = () => {
    btn3d.textContent = is3d ? "2D-Ansicht" : "3D-Ansicht";
    btn3d.classList.toggle("primary", is3d);
    btnSat.textContent = isSat ? "Straßenkarte" : "Satellit";
    btnSat.classList.toggle("primary", isSat);
  };
  btn3d.addEventListener("click", () => {
    is3d = !is3d;
    if (is3d) isSat = false;
    h.setMode3d(is3d);
    renderModeButtons();
  });
  btnSat.addEventListener("click", () => {
    isSat = !isSat;
    if (isSat) is3d = false;
    h.setSatellite(isSat);
    renderModeButtons();
  });

  // Kartenpakete installiert oder gelöscht: Ebenen neu aufbauen
  onPacksChanged(async () => {
    try {
      h.refresh(await availableMaps());
    } catch (e) {
      console.error(e);
    }
  });

  // Statusleiste
  const pos = document.getElementById("cursor-pos");
  const zoom = document.getElementById("zoom-level");
  map.on("mousemove", (e) => {
    if (pos) pos.textContent = `Position: ${e.lngLat.lat.toFixed(5)}° N, ${e.lngLat.lng.toFixed(5)}° O`;
  });
  const updateZoom = () => {
    if (zoom) zoom.textContent = `Zoom: ${map.getZoom().toFixed(1)}`;
  };
  map.on("zoom", updateZoom);
  map.on("load", updateZoom);

  // Startansicht: Testgebiet
  const b = store.settings.gebiet.bbox;
  map.once("load", () => map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, duration: 0 }));

  const errors = new Set<string>();
  let satHinweis = false;
  map.on("error", (e) => {
    // Satellitenbild kommt aus dem Internet: Ausfälle nur einmal kurz melden
    if (String((e as { sourceId?: string }).sourceId ?? "").startsWith("sat-")) {
      if (!satHinweis) {
        satHinweis = true;
        toast("Satellitenbild nicht erreichbar – besteht eine Internetverbindung?", "error");
        setTimeout(() => (satHinweis = false), 60_000);
      }
      return;
    }
    console.error("Kartenfehler", e.error);
    const msg = e.error?.message ?? String(e.error);
    if (errors.size < 5 && !errors.has(msg)) {
      errors.add(msg);
      showMessage(`Kartenfehler: ${[...errors].join(" | ")}`);
    }
  });
}

void init().then(() => setTimeout(() => void checkOnStart(), 2500));
