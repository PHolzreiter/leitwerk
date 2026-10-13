import "./style.css";
import { store } from "./data/store";
import { availableMaps, createMap, type MapHandle } from "./map";
import { addFahrzeug3D, type Fahrzeug3D } from "./fz3d";
import { ORG_FARBEN, addDataLayers, addSimLayers, pickLocation, setGroupVisible, setSelectedIncident } from "./mapLayers";
import { sim } from "./sim/engine";
import { geoStatus } from "./sim/geo";
import { flugverbot, WETTER_LABEL, WETTER_SYMBOL } from "./sim/weather";
import { createDataView, type DataViewDeps } from "./ui/dataView";
import { toast } from "./ui/dom";
import { confirmDialog } from "./ui/dialog";
import { openEditor } from "./ui/editForm";
import { createOpsView } from "./ui/opsView";
import { createSettingsView } from "./ui/settingsView";
import { checkOnStart, ensureGrundpaket } from "./ui/packsView";
import { ensureCodes } from "./ui/codesPrompt";
import { setupSpielStatus } from "./ui/spielDialog";
import { autosaveStarten } from "./net/spielstand";
import { kiBeimStart } from "./abfrage/ki";

// Für automatische Tests im Browser (…/?debug): Zugriff auf Simulation und Daten
if (location.search.includes("debug")) Object.assign(window, { __lw: { sim, store } });
import { mp } from "./net/mehrspieler";
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
  play.addEventListener("click", () => {
    const fehler = (e: Error) => toast(String(e.message ?? e), "error");
    if (sim.state.laeuft) return void sim.call("pause").catch(fehler);
    if (ensureCodes(() => void sim.call("start").catch(fehler))) void sim.call("start").catch(fehler);
  });
  tempoBtns.forEach((b) =>
    b.addEventListener("click", () => void sim.call("setTempo", Number(b.dataset.tempo)).catch((e) => toast(String(e.message ?? e), "error"))),
  );
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
  sim.ich = mp.ich;
  setupSimBar();
  setupSpielStatus();
  mp.onMeldung((t) => toast(t));
  mp.onHostAnfrage(async (pid, name) => {
    const ok = await confirmDialog("Host-Rolle angefragt", `${name} möchte Host werden. Du spielst danach als Mitspieler weiter.`, "Übergeben");
    if (ok) mp.hostUebergeben(pid);
  });
  autosaveStarten();
  void kiBeimStart().catch((e) => console.warn("KI-Start", e));
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

  let fz3d: Fahrzeug3D | null = null;
  const chkModelle = document.getElementById("chk-modelle") as HTMLInputElement;
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
    fz3d = addFahrzeug3D(map);
    fz3d.setMode3d(is3d);
    chkModelle.checked = fz3d.aktiv();
  });
  chkModelle.addEventListener("change", () => fz3d?.setAktiv(chkModelle.checked));

  // Ebenen ein-/ausblenden (Liste einklappbar)
  document.querySelectorAll<HTMLInputElement>(".map-panel input[data-group]").forEach((cb) => {
    cb.addEventListener("change", () => {
      setGroupVisible(map, cb.dataset.group as "stations" | "hospitals" | "pois", cb.checked);
    });
  });
  const ebenenBtn = document.getElementById("ebenen-toggle") as HTMLButtonElement;
  const ebenen = document.getElementById("ebenen")!;
  ebenenBtn.addEventListener("click", () => {
    ebenen.hidden = !ebenen.hidden;
    ebenenBtn.setAttribute("aria-expanded", String(!ebenen.hidden));
    ebenenBtn.querySelector("span")!.textContent = ebenen.hidden ? "▸" : "▾";
  });
  document.getElementById("legende")!.innerHTML = Object.entries(ORG_FARBEN)
    .map(([name, farbe]) => `<span><span class="dot" style="background:${farbe}"></span>${name}</span>`)
    .join("");

  // 2D / 3D und Karte / Satellit (Satellit nur in 2D); angezeigt wird immer, was aktiv ist
  let is3d = false;
  let isSat = false;
  const dimBtns = document.querySelectorAll<HTMLButtonElement>("[data-dim]");
  const baseBtns = document.querySelectorAll<HTMLButtonElement>("[data-base]");
  const hint3d = document.getElementById("hint-3d")!;
  let hintTimer: number | undefined;
  const renderModeButtons = () => {
    dimBtns.forEach((b) => {
      b.classList.toggle("active", (b.dataset.dim === "3d") === is3d);
      if (b.dataset.dim === "3d") {
        b.classList.toggle("disabled", !h.hasTerrain());
        b.title = h.hasTerrain() ? "3D-Ansicht mit Gelände" : "Paket „Gelände (3D)“ fehlt – Einstellungen → Kartenpakete";
      }
    });
    baseBtns.forEach((b) => b.classList.toggle("active", (b.dataset.base === "sat") === isSat));
  };
  dimBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const ziel = b.dataset.dim === "3d";
      if (ziel && !h.hasTerrain()) {
        hint3d.hidden = false;
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => (hint3d.hidden = true), 8000);
        return;
      }
      if (ziel === is3d) return;
      is3d = ziel;
      if (is3d) isSat = false;
      h.setMode3d(is3d);
      fz3d?.setMode3d(is3d);
      renderModeButtons();
    }),
  );
  baseBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const ziel = b.dataset.base === "sat";
      if (ziel === isSat) return;
      isSat = ziel;
      if (isSat) is3d = false;
      h.setSatellite(isSat);
      fz3d?.setMode3d(is3d);
      renderModeButtons();
    }),
  );
  document.getElementById("hint-3d-go")!.addEventListener("click", () => {
    hint3d.hidden = true;
    showView("settings");
    requestAnimationFrame(() => document.querySelector(".packs")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  });
  renderModeButtons();
  map.once("idle", renderModeButtons);

  // Kartenpakete installiert oder gelöscht: Ebenen neu aufbauen
  onPacksChanged(async () => {
    try {
      h.refresh(await availableMaps());
      if (!h.hasTerrain() && is3d) {
        is3d = false;
        h.setMode3d(false);
        fz3d?.setMode3d(false);
      }
      setTimeout(renderModeButtons, 300);
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
