/**
 * Karte als Fenster (auch mehrfach, z. B. zweite Karte auf dem zweiten Bildschirm):
 * Dienststellen, Krankenhäuser, Einsätze, Fahrzeuge, 2D/3D, Satellit, Ebenen.
 */
import { addFahrzeug3D, type Fahrzeug3D } from "../../fz3d";
import { addFzFokus, type FzFokus } from "../../fzFokus";
import { availableMaps, createMap, type MapHandle } from "../../map";
import { addDataLayers, addSimLayers, ORG_FARBEN, pickLaeuft, pickLocation, setGroupVisible, setSelectedIncident } from "../../mapLayers";
import { sim, type SimFahrzeug } from "../../sim/engine";
import { onPacksChanged } from "../../updates";
import { el, toast } from "../dom";
import { openEditor, type EditorDeps } from "../editForm";
import { registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, karteWaehlen, onAuswahl, onFahrzeugZeigen, onKarteZeigen, setzeKartenWaehler, waehle } from "../ws/auswahl";
import { wetter3dAnbinden } from "../../wetter3d";
import { karteDunkel, onPers, onThema, pers, setzePers } from "../ws/persoenlich";

/** Editor-Abhängigkeiten (Ort auf der Karte wählen) – setzt das Hauptprogramm */
let editorDeps: EditorDeps = { pickOnMap: (h) => karteWaehlen(h) };
export function setzeEditorDeps(d: EditorDeps): void {
  editorDeps = d;
}

/** Anzeige unten in der Statusleiste */
function statusleiste(text: { pos?: string; zoom?: string }): void {
  if (text.pos !== undefined) {
    const p = document.getElementById("cursor-pos");
    if (p) p.textContent = text.pos;
  }
  if (text.zoom !== undefined) {
    const z = document.getElementById("zoom-level");
    if (z) z.textContent = text.zoom;
  }
}

/** Nur eine Karte holt sich beim ersten Mal das Testgebiet */
let ersteKarte = true;

function erstellen(ctx: PanelKontext) {
  const root = el("div", { class: "pl karte-fenster" });
  const mapEl = el("div", { class: "map" });
  root.appendChild(mapEl);
  const folgtAuswahl = () => ctx.params.folgt !== false;

  // Bedienfeld oben links
  const panel = el("div", { class: "map-panel" });
  panel.innerHTML = `
    <div class="seg" role="group" aria-label="Ansicht"><button type="button" data-dim="2d" class="active">2D</button><button type="button" data-dim="3d">3D</button></div>
    <div class="seg" role="group" aria-label="Kartenart"><button type="button" data-base="karte" class="active">Karte</button><button type="button" data-base="sat">Satellit</button></div>
    <div class="hint-3d map-hint" hidden>Für 3D fehlt das Paket <b>„Gelände (3D)“</b> (Einstellungen → Kartenpakete).</div>
    <button type="button" class="ebenen-toggle" aria-expanded="false">Ebenen <span>▸</span></button>
    <div class="ebenen" hidden>
      <label class="chk"><input type="checkbox" data-group="stations" checked /><span class="dot" style="background:#c62828"></span>Dienststellen</label>
      <label class="chk"><input type="checkbox" data-group="hospitals" checked /><span class="dot hosp"></span>Krankenhäuser</label>
      <label class="chk"><input type="checkbox" data-group="pois" checked /><span class="dot" style="background:#2a9d8f"></span>POIs</label>
      <label class="chk" title="Grenzen der TETRA-Funkgruppen (Farben unter Einstellungen → Darstellung)"><input type="checkbox" class="chk-funk" />Funkgruppen</label>
      <label class="chk" title="Nur in der 3D-Ansicht und nah herangezoomt"><input type="checkbox" class="chk-modelle" checked />3D-Fahrzeugmodelle</label>
      <label class="chk" title="Die Karte springt zum ausgewählten Einsatz"><input type="checkbox" class="chk-folgt" />folgt der Auswahl</label>
      <div class="legende"></div>
    </div>`;
  root.appendChild(panel);
  const meldung = el("div", { class: "map-message", hidden: "" });
  root.appendChild(meldung);
  const zeigeMeldung = (text: string) => {
    meldung.textContent = `${text} (Klicken zum Schließen)`;
    meldung.hidden = false;
    meldung.onclick = () => (meldung.hidden = true);
  };
  panel.querySelector<HTMLElement>(".legende")!.innerHTML = Object.entries(ORG_FARBEN)
    .map(([name, farbe]) => `<span><span class="dot" style="background:${farbe}"></span>${name}</span>`)
    .join("");
  const chkFolgt = panel.querySelector<HTMLInputElement>(".chk-folgt")!;
  chkFolgt.checked = folgtAuswahl();
  chkFolgt.addEventListener("change", () => ctx.setzeParams({ folgt: chkFolgt.checked }));
  const ebenenBtn = panel.querySelector<HTMLButtonElement>(".ebenen-toggle")!;
  const ebenen = panel.querySelector<HTMLElement>(".ebenen")!;
  ebenenBtn.addEventListener("click", () => {
    ebenen.hidden = !ebenen.hidden;
    ebenenBtn.setAttribute("aria-expanded", String(!ebenen.hidden));
    ebenenBtn.querySelector("span")!.textContent = ebenen.hidden ? "▸" : "▾";
  });

  let h: MapHandle | null = null;
  let fz3d: Fahrzeug3D | null = null;
  let fokus: FzFokus | null = null;
  let is3d = false;
  let wetter3dNeu: () => void = () => {};
  let isSat = false;
  const aus: (() => void)[] = [];
  let entfernt = false;

  const flyTo = (lat: number, lon: number, zoom?: number) => {
    const m = h?.map;
    if (!m) return;
    m.flyTo({ center: [lon, lat], zoom: zoom ?? Math.max(m.getZoom(), 12.5), essential: true });
  };

  async function starten(): Promise<void> {
    let maps: string[] = [];
    try {
      maps = await availableMaps();
    } catch (err) {
      console.error(err);
    }
    if (entfernt) return;
    if (!maps.includes("overview")) zeigeMeldung("Die Kartendateien wurden nicht gefunden. Bitte unter Einstellungen → Kartenpakete das Grundpaket laden.");
    h = createMap(mapEl, maps, { dunkel: karteDunkel() });
    const map = h.map;
    const hh = h;
    if (location.search.includes("debug")) {
      const w = window as unknown as { __lw?: Record<string, unknown> };
      if (w.__lw && (!w.__lw.map || (w.__lw.map as { _removed?: boolean })._removed)) w.__lw.map = map;
    }

    map.on("load", () => {
      addDataLayers(map, {
        onEdit: (kind, id) => openEditor(kind, id, editorDeps),
        onCreateAt: (kind, lat, lon) => openEditor(kind, null, editorDeps, { lat, lon }),
      });
      const auftragOeffnen = (fz: SimFahrzeug) => {
        if (fz.einsatzId) waehle("einsatz", fz.einsatzId, { karte: false });
        else if (fz.kt?.fahrten[0]?.[0]) waehle("kt", fz.kt.fahrten[0][0], { karte: false });
      };
      const fahrzeugKlick = (id: string) => {
        const fz = sim.state.fahrzeuge[id];
        if (!fz) return;
        fokus?.waehle(id);
        auftragOeffnen(fz);
      };
      addSimLayers(map, {
        onIncident: (id) => waehle("einsatz", id, { karte: false }),
        onVehicle: fahrzeugKlick,
        onVehicleDbl: (id) => fokus?.folge(id),
      });
      fokus = addFzFokus(map, { is3d: () => is3d, oeffne: auftragOeffnen });
      const getroffen = (p: { x: number; y: number }) =>
        map.queryRenderedFeatures([p.x, p.y], { layers: ["lw-vehicles", "lw-incidents", "lw-stations", "lw-hospitals", "lw-pois"].filter((l) => map.getLayer(l)) }).length > 0;
      map.on("click", (e) => {
        if (pickLaeuft() || getroffen(e.point)) return;
        const id = fz3d?.treffer(e.point.x, e.point.y);
        if (id) fahrzeugKlick(id);
        else fokus?.waehle(null);
      });
      map.on("dblclick", (e) => {
        if (pickLaeuft() || getroffen(e.point)) return;
        const id = fz3d?.treffer(e.point.x, e.point.y);
        if (id) {
          e.preventDefault();
          fokus?.folge(id);
        }
      });
      fz3d = addFahrzeug3D(map);
      let erzwungen = false;
      const w3d = wetter3dAnbinden(mapEl, () => is3d || erzwungen, map);
      aus.push(() => w3d.dispose());
      wetter3dNeu = () => w3d.aktualisieren();
      if (location.search.includes("debug")) {
        const w = window as unknown as { __lw?: Record<string, unknown> };
        if (w.__lw)
          w.__lw.wetter3dTest = (an: boolean) => {
            erzwungen = an;
            w3d.aktualisieren();
          };
      }
      fz3d.setMode3d(is3d);
      chkModelle.checked = fz3d.aktiv();
      const a = auswahl();
      setSelectedIncident(map, a.art === "einsatz" ? a.id : null);
      if (ersteKarte) {
        ersteKarte = false;
        const b = sim.funkgruppe().bbox;
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: 40, duration: 0 },
        );
      } else {
        const b = sim.funkgruppe().bbox;
        map.jumpTo({ center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], zoom: 9 });
      }
    });

    // Ebenen
    const chkFunk = panel.querySelector<HTMLInputElement>(".chk-funk")!;
    chkFunk.checked = pers().funkLinien !== false;
    chkFunk.addEventListener("change", () => setzePers({ funkLinien: chkFunk.checked }));
    onPers((p) => (chkFunk.checked = p.funkLinien !== false));
    panel.querySelectorAll<HTMLInputElement>("input[data-group]").forEach((cb) =>
      cb.addEventListener("change", () => setGroupVisible(map, cb.dataset.group as "stations" | "hospitals" | "pois", cb.checked)),
    );

    // 2D / 3D und Karte / Satellit
    const dimBtns = panel.querySelectorAll<HTMLButtonElement>("[data-dim]");
    const baseBtns = panel.querySelectorAll<HTMLButtonElement>("[data-base]");
    const hint3d = panel.querySelector<HTMLElement>(".hint-3d")!;
    let hintTimer: number | undefined;
    const renderModeButtons = () => {
      dimBtns.forEach((b) => {
        b.classList.toggle("active", (b.dataset.dim === "3d") === is3d);
        if (b.dataset.dim === "3d") {
          b.classList.toggle("disabled", !hh.hasTerrain());
          b.title = hh.hasTerrain() ? "3D-Ansicht mit Gelände" : "Paket „Gelände (3D)“ fehlt – Einstellungen → Kartenpakete";
        }
      });
      baseBtns.forEach((b) => b.classList.toggle("active", (b.dataset.base === "sat") === isSat));
    };
    dimBtns.forEach((b) =>
      b.addEventListener("click", () => {
        const ziel = b.dataset.dim === "3d";
        if (ziel && !hh.hasTerrain()) {
          hint3d.hidden = false;
          window.clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => (hint3d.hidden = true), 8000);
          return;
        }
        if (ziel === is3d) return;
        is3d = ziel;
        if (is3d) isSat = false;
        hh.setMode3d(is3d);
        fz3d?.setMode3d(is3d);
        wetter3dNeu();
        renderModeButtons();
      }),
    );
    baseBtns.forEach((b) =>
      b.addEventListener("click", () => {
        const ziel = b.dataset.base === "sat";
        if (ziel === isSat) return;
        isSat = ziel;
        if (isSat) is3d = false;
        hh.setSatellite(isSat);
        fz3d?.setMode3d(is3d);
        wetter3dNeu();
        renderModeButtons();
      }),
    );
    renderModeButtons();
    map.once("idle", renderModeButtons);

    onPacksChanged(async () => {
      if (entfernt) return;
      try {
        hh.refresh(await availableMaps());
        if (!hh.hasTerrain() && is3d) {
          is3d = false;
          hh.setMode3d(false);
          fz3d?.setMode3d(false);
        }
        setTimeout(renderModeButtons, 300);
      } catch (e) {
        console.error(e);
      }
    });

    // Statusleiste
    map.on("mousemove", (e) => statusleiste({ pos: `Position: ${e.lngLat.lat.toFixed(5)}° N, ${e.lngLat.lng.toFixed(5)}° O` }));
    const zoomZeigen = () => statusleiste({ zoom: `Zoom: ${map.getZoom().toFixed(1)}` });
    map.on("zoom", zoomZeigen);
    map.on("load", zoomZeigen);

    const fehlerGesehen = new Set<string>();
    let satHinweis = false;
    map.on("error", (e) => {
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
      if (fehlerGesehen.size < 5 && !fehlerGesehen.has(msg)) {
        fehlerGesehen.add(msg);
        zeigeMeldung(`Kartenfehler: ${[...fehlerGesehen].join(" | ")}`);
      }
    });

    aus.push(
      onKarteZeigen((w) => folgtAuswahl() && !fokus?.folgt() && flyTo(w.lat, w.lon, w.zoom)),
      onAuswahl((a, opts) => {
        setSelectedIncident(map, a.art === "einsatz" ? a.id : null);
        if (opts.karte === false || !folgtAuswahl() || fokus?.folgt()) return;
        if (a.art === "einsatz" && a.id) {
          const e = sim.einsatz(a.id);
          if (e?.adresse) flyTo(e.adresse.lat, e.adresse.lon);
        } else if (a.art === "kt" && a.id) {
          const k = sim.ktAuftrag(a.id);
          if (k?.d.von) flyTo(k.d.von.lat, k.d.von.lon, 13);
        }
      }),
      onFahrzeugZeigen((id, folgen) => {
        if (folgen && id) fokus?.folge(id);
        else fokus?.waehle(id);
      }),
      setzeKartenWaehler((hinweis) => pickLocation(map, hinweis)),
      onThema(() => hh.setDunkel(karteDunkel())),
    );
  }

  const chkModelle = panel.querySelector<HTMLInputElement>(".chk-modelle")!;
  chkModelle.addEventListener("change", () => fz3d?.setAktiv(chkModelle.checked));

  void starten();
  return {
    el: root,
    groesse: () => h?.map.resize(),
    sichtbar: (an: boolean) => an && requestAnimationFrame(() => h?.map.resize()),
    dispose: () => {
      entfernt = true;
      aus.forEach((f) => f());
      try {
        const w = window as unknown as { __lw?: Record<string, unknown> };
        if (w.__lw?.map === h?.map) delete w.__lw!.map;
        h?.map.remove();
      } catch (e) {
        console.warn(e);
      }
    },
  };
}

registriere({
  komponente: "karte",
  titel: "Karte",
  info: "Lagekarte mit Einsätzen und Fahrzeugen (auch mehrfach möglich)",
  bereich: "mitte",
  mehrfach: true,
  erstellen,
});
