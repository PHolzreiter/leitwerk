/** Reiter „Daten“: Dienststellen, Fahrzeuge, Krankenhäuser und POIs verwalten, CSV-Import/-Export. */
import {
  HOSPITAL_FLAGS,
  KIND_FILE,
  KIND_LABEL,
  KINDS,
  ORIGIN_LABEL,
  type Hospital,
  type Kind,
  type KindMap,
  type Poi,
  type Station,
  type Vehicle,
  type Einsatzvorlage,
  type Einsatzcode,
} from "../data/model";
import { exportCsv } from "../data/schema";
import { codesystemDatei } from "../abfrage/codesystem";
import beispielCodesystem from "../../data/beispiele/beispiel_codesystem.json?raw";
import { planKurz } from "../sim/dienst";
import { sim } from "../sim/engine";
import { FUNKGRUPPEN, inFunkgruppe } from "../sim/funkgruppen";
import { alleOrte, kategorieLabel, poiKategorien, ORT_KATEGORIEN } from "../data/orte";
import { BEISPIEL, STANDARD_INFO, VORLAGE } from "../data/standard";
import { store } from "../data/store";
import { saveTextFile, storeLocation } from "../platform";
import { confirmDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { displayName, openEditor, type EditorDeps } from "./editForm";
import { startImport } from "./importDialog";

const MAX_ROWS = 600;
/** Funkgruppe je Position (Punkt-in-Fläche ist teuer) */
const gebietCache = new Map<string, string>();

const FLAG_SHORT: Record<string, string> = {
  notfallambulanz: "NFA",
  schockraum: "Schock",
  unfallambulanz: "Unfall",
  kinderambulanz: "Kind",
  intensiv_anaesthesie: "ICU",
  neurologie: "Neuro",
  kinderintensiv: "PICU",
  neonatologie: "Neo",
  hno: "HNO",
  urologie: "Uro",
  gyn_geburtshilfe: "Gyn",
};

export interface DataViewDeps extends EditorDeps {
  showOnMap(lat: number, lon: number): void;
  /** gewählte Datenart hat gewechselt (z. B. nach einem Import) */
  onArt?(k: Kind): void;
}

export function createDataView(container: HTMLElement, deps: DataViewDeps): { refresh(): void; zeigeArt(k: Kind): void } {
  let current: Kind = "stations";
  let query = "";
  /** Sortierung: Spalte (Index) und Richtung; -1 = Standard (Name) */
  let sortSp = -1;
  let sortAb = false;
  /** gewählte Filter je Datenart: Filtername → Wert ("" = alle) */
  const filter: Partial<Record<Kind, Record<string, string>>> = {};
  /** Orte: auch Krankenhäuser und Dienststellen zeigen */
  let alleOrteZeigen = true;

  container.innerHTML = `
    <div class="data-layout">
      <nav class="data-nav"></nav>
      <section class="data-main">
        <div class="sources-panel"></div>
        <div class="schema-bar" hidden></div>
        <div class="toolbar">
          <h2 class="tb-title"></h2>
          <input class="tb-search" type="search" placeholder="Suchen …" />
          <span class="spacer"></span>
          <button class="btn primary" data-act="new">Neu</button>
          <button class="btn" data-act="import">CSV importieren …</button>
          <button class="btn" data-act="export">Exportieren …</button>
          <button class="btn" data-act="template">Vorlage …</button>
          <button class="btn" data-act="example">Beispiel …</button>
          <button class="btn danger-text" data-act="clear">Eigene löschen</button>
        </div>
        <div class="data-filter"></div>
        <div class="table-wrap"><table class="data-table"><thead></thead><tbody></tbody></table></div>
        <div class="table-foot muted"></div>
      </section>
    </div>`;

  const nav = container.querySelector<HTMLElement>(".data-nav")!;
  const sources = container.querySelector<HTMLElement>(".sources-panel")!;
  const title = container.querySelector<HTMLElement>(".tb-title")!;
  const search = container.querySelector<HTMLInputElement>(".tb-search")!;
  const thead = container.querySelector<HTMLElement>("thead")!;
  const tbody = container.querySelector<HTMLElement>("tbody")!;
  const foot = container.querySelector<HTMLElement>(".table-foot")!;
  const schemaBar = container.querySelector<HTMLElement>(".schema-bar")!;
  const filterBar = container.querySelector<HTMLElement>(".data-filter")!;

  /** Abfrageschema (nur bei Einsatzcodes): Status, laden, entfernen */
  function renderSchemaBar() {
    schemaBar.hidden = current !== "codes";
    if (schemaBar.hidden) return;
    const sch = store.schema;
    schemaBar.innerHTML = sch
      ? `<div><b>Codesystem geladen${sch.name ? `: ${esc(sch.name)}` : ""}</b> <span class="muted">· ${Object.keys(sch.kapitel).length} Kapitel · ${Object.keys(sch.codes).length} Codes${sch.version ? ` · Version ${esc(String(sch.version))}` : ""}</span>
         <div class="muted small">Codes und Abfrage kommen aus einer Datei. Neue Einsätze kommen als Notruf, den du annimmst und abfragst – der Code ergibt sich aus der Abfrage.</div></div>`
      : `<div><b>Kein Codesystem geladen</b>
         <div class="muted small">Ein Codesystem ist eine JSON-Datei mit Einsatzcodes und Abfrage. Damit kommen Einsätze als Anruf, den du abfragst. Das Beispiel enthält eine Anleitung, mit der eine KI ein eigenes Codesystem erstellen kann.</div></div>`;
    const btns = el("div", { class: "row-btns" });
    const laden = el("button", { class: "btn small primary" }, sch ? "Ersetzen …" : "Codesystem laden …");
    laden.addEventListener("click", () => void startImport("codes", (k) => select(k)));
    btns.appendChild(laden);
    if (sch) {
      const roh = store.schemaRoh;
      const sp = el("button", { class: "btn small", title: "Codes und Abfrage zusammen als eine JSON-Datei speichern" }, "Als eine Datei speichern …");
      sp.addEventListener("click", async () => {
        if (!roh) return;
        const name = (roh.name || "codesystem").replace(/[^\wäöüÄÖÜß-]+/g, "_");
        const p = await saveTextFile(`${name}.json`, codesystemDatei(roh, store.list("codes")));
        if (p) toast("Codesystem gespeichert (Codes und Abfrage in einer Datei)");
      });
      btns.appendChild(sp);
    }
    const bsp = el("button", { class: "btn small", title: "Kleines Beispiel mit Anleitung für eine KI" }, "Beispiel-Codesystem …");
    bsp.addEventListener("click", async () => {
      const p = await saveTextFile("beispiel_codesystem.json", beispielCodesystem);
      if (p) toast("Beispiel gespeichert – die Anleitung für eine KI steht in „anleitung_fuer_ki“");
    });
    btns.appendChild(bsp);
    if (sch) {
      const weg = el("button", { class: "btn small danger-text" }, "Entfernen");
      weg.addEventListener("click", async () => {
        const ok = await confirmDialog("Codesystem entfernen", "Die Abfrage wird entfernt. Die Codeliste bleibt. Neue Einsätze kommen dann wieder ohne Anruf.", "Entfernen", true);
        if (!ok) return;
        store.setSchema(null);
        toast("Codesystem entfernt");
        render();
      });
      btns.appendChild(weg);
    }
    schemaBar.appendChild(btns);
  }

  let location = "";
  void storeLocation().then((l) => {
    location = l;
    renderSources();
  });

  search.addEventListener("input", () => {
    query = search.value.trim().toLowerCase();
    renderTable();
  });

  container.querySelector(".toolbar")!.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest("button")?.dataset.act;
    if (!act) return;
    void handleAction(act);
  });

  async function handleAction(act: string) {
    const file = KIND_FILE[current];
    try {
      if (act === "new") {
        openEditor(current, null, deps);
      } else if (act === "import") {
        await startImport(current, (k) => select(k));
      } else if (act === "export") {
        const csv = exportCsv(current, store.list(current), store.list("stations"));
        const p = await saveTextFile(`leitwerk_${file}.csv`, csv);
        if (p) toast(`${KIND_LABEL[current]} exportiert`);
      } else if (act === "template") {
        const p = await saveTextFile(`vorlage_${file}.csv`, VORLAGE[current]);
        if (p) toast("Vorlage gespeichert");
      } else if (act === "example") {
        const p = await saveTextFile(`beispiel_${file}.csv`, BEISPIEL[current]);
        if (p) toast("Beispiel gespeichert");
      } else if (act === "clear") {
        const n = store.counts(current).eigene;
        if (n === 0) {
          toast(`Keine eigenen ${KIND_LABEL[current]} vorhanden`);
          return;
        }
        const ok = await confirmDialog(
          "Eigene Daten löschen",
          `Alle ${n} eigenen ${KIND_LABEL[current]} (Import und manuell) löschen? Die Standarddaten bleiben erhalten.`,
          "Löschen",
          true,
        );
        if (ok) store.clearOwn(current);
      }
    } catch (err) {
      toast(`Fehler: ${String(err)}`, "error");
    }
  }

  function select(kind: Kind) {
    if (kind !== current) deps.onArt?.(kind);
    if (kind !== current) {
      sortSp = -1;
      sortAb = false;
    }
    current = kind;
    query = "";
    search.value = "";
    render();
  }

  function renderNav() {
    nav.innerHTML = "";
    for (const k of KINDS) {
      const c = store.counts(k);
      const b = el("button", { class: `nav-item${k === current ? " active" : ""}` });
      // Orte: Krankenhäuser und Dienststellen zählen mit
      const n = k === "pois" ? c.gesamt + store.counts("hospitals").gesamt + store.counts("stations").gesamt : c.gesamt;
      b.innerHTML = `<span>${KIND_LABEL[k]}</span><span class="count">${n}</span>`;
      b.addEventListener("click", () => select(k));
      nav.appendChild(b);
    }
    nav.appendChild(el("div", { class: "nav-help" }, "Rechtsklick auf die Karte legt neue Einträge direkt an der Stelle an."));
  }

  function renderSources() {
    const on = store.standardAktiv;
    sources.innerHTML = "";
    const row = el("div", { class: "src-row" });
    const chk = el("input", { type: "checkbox", id: "std-toggle" });
    chk.checked = on;
    chk.addEventListener("change", () => store.setStandardAktiv(chk.checked));
    const lbl = el("label", { for: "std-toggle" });
    lbl.innerHTML = `<b>Standarddaten von LeitWerk verwenden</b> <span class="muted">(${esc(STANDARD_INFO)}: ${KINDS.map(
      (k) => `${store.standardCount(k)} ${KIND_LABEL[k]}`,
    ).join(", ")})</span>`;
    row.append(chk, lbl);
    sources.appendChild(row);

    const info = el("div", { class: "muted src-info" });
    info.textContent = on
      ? "Eigene Daten mit gleicher ID ersetzen den Standard-Eintrag. Für eine ganz eigene Leitstelle die Standarddaten abschalten."
      : "Standarddaten sind abgeschaltet – es werden nur deine eigenen Daten verwendet.";
    sources.appendChild(info);

    if (store.hiddenCount > 0) {
      const r = el("div", { class: "src-row" });
      const b = el("button", { class: "btn small" }, "Wiederherstellen");
      b.addEventListener("click", () => store.restoreHidden());
      r.append(el("span", { class: "muted" }, `${store.hiddenCount} gelöschte Standard-Einträge ausgeblendet.`), b);
      sources.appendChild(r);
    }
    if (location) sources.appendChild(el("div", { class: "muted src-info" }, `Gespeichert in: ${location}`));
    if (store.lastError) sources.appendChild(el("div", { class: "form-error" }, store.lastError));
  }

  function columns(kind: Kind): [string, (r: KindMap[Kind]) => string][] {
    const stationName = new Map(store.list("stations").map((s) => [s.id, s.name]));
    const vehicleCount = new Map<string, number>();
    for (const v of store.list("vehicles")) vehicleCount.set(v.dienststelleId, (vehicleCount.get(v.dienststelleId) ?? 0) + 1);
    switch (kind) {
      case "stations":
        return [
          ["Name", (r) => (r as Station).name],
          ["Typ", (r) => (r as Station).typ],
          ["Organisation", (r) => (r as Station).organisation],
          ["Ort", (r) => (r as Station).ort],
          ["Bezirk", (r) => (r as Station).bezirk],
          ["Fahrzeuge", (r) => String(vehicleCount.get(r.id) ?? 0)],
        ];
      case "vehicles":
        return [
          ["Funkrufname", (r) => (r as Vehicle).funkrufname],
          ["Kurzname", (r) => (r as Vehicle).kurzname],
          ["Kategorie", (r) => (r as Vehicle).kategorie],
          ["Typ", (r) => `${(r as Vehicle).typ}${(r as Vehicle).aufbau === "gross" && (r as Vehicle).typ !== "RTW-C" ? " (groß)" : ""}`],
          ["Dienststelle", (r) => stationName.get((r as Vehicle).dienststelleId) ?? "⚠ fehlt"],
          ["Dienstplan", (r) => ((r as Vehicle).ersatzFuer ? `nur bei Flugverbot (Ersatz für ${(r as Vehicle).ersatzFuer})` : planKurz((r as Vehicle).dienstplan))],
          ["Aktiv", (r) => ((r as Vehicle).aktiv ? "ja" : "nein")],
        ];
      case "hospitals":
        return [
          ["Name", (r) => (r as Hospital).name],
          ["Ort", (r) => (r as Hospital).ort],
          [
            "Abteilungen",
            (r) =>
              HOSPITAL_FLAGS.filter((f) => (r as Hospital).abteilungen[f])
                .map((f) => FLAG_SHORT[f])
                .join(" · "),
          ],
        ];
      case "pois":
        return [
          ["Name", (r) => (r as Poi).name],
          ["Kategorien", (r) => poiKategorien(r as Poi).map(kategorieLabel).join(", ")],
          ["Ort", (r) => (r as Poi).ort],
        ];
      case "codes":
        return [
          ["Code", (r) => (r as Einsatzcode).code],
          ["Name", (r) => (r as Einsatzcode).name],
          ["Kategorie", (r) => (r as Einsatzcode).kategorie],
          ["Kapitel", (r) => (r as Einsatzcode).kapitel],
        ];
      case "templates":
        return [
          ["Code", (r) => (r as Einsatzvorlage).code],
          ["Adresse", (r) => (r as Einsatzvorlage).adresse],
          ["Meldung", (r) => (r as Einsatzvorlage).meldung],
        ];
    }
  }

  type Zeile = { kind: Kind; r: KindMap[Kind] };

  /** Filter je Datenart: Name → Werte eines Eintrags */
  function filterDefs(kind: Kind): [string, (z: Zeile) => string[]][] {
    const st = new Map(store.list("stations").map((x) => [x.id, x]));
    // Gebiet = Funkgruppe (Bezirke), aus der Position
    const gebiet = (p: { lat: number; lon: number } | undefined): string[] => {
      if (!p) return [""];
      const k = `${p.lat},${p.lon}`;
      let g = gebietCache.get(k);
      if (g === undefined) {
        const f = FUNKGRUPPEN.find((x) => inFunkgruppe(x, p.lat, p.lon));
        g = f ? `${f.id} (${f.bezirke})` : "außerhalb NÖ";
        gebietCache.set(k, g);
      }
      return [g];
    };
    const geb: [string, (z: Zeile) => string[]] = ["Gebiet", (z) => gebiet(z.kind === "vehicles" ? st.get((z.r as Vehicle).dienststelleId) : (z.r as Station))];
    switch (kind) {
      case "stations":
        return [
          ["Typ", (z) => [(z.r as Station).typ]],
          ["Organisation", (z) => [(z.r as Station).organisation]],
          ["Bezirk", (z) => [(z.r as Station).bezirk]],
          geb,
        ];
      case "vehicles":
        return [
          ["Kategorie", (z) => [(z.r as Vehicle).kategorie]],
          ["Typ", (z) => [(z.r as Vehicle).typ]],
          ["Dienststelle", (z) => [st.get((z.r as Vehicle).dienststelleId)?.name ?? "⚠ fehlt"]],
          ["Organisation", (z) => [st.get((z.r as Vehicle).dienststelleId)?.organisation ?? ""]],
          ["Bezirk", (z) => [st.get((z.r as Vehicle).dienststelleId)?.bezirk ?? ""]],
          geb,
          [
            "Im Dienst",
            (z) => {
              const v = z.r as Vehicle;
              const fz = sim.state.fahrzeuge[v.id];
              return [!v.aktiv || !fz ? "nicht aktiv" : fz.ausserDienst ? "außer Dienst" : "im Dienst"];
            },
          ],
          ["Aktiv", (z) => [(z.r as Vehicle).aktiv ? "ja" : "nein"]],
        ];
      case "hospitals":
        return [["Ort", (z) => [(z.r as Hospital).ort]], geb];
      case "pois":
        return [
          ["Kategorie", (z) => (z.kind === "pois" ? poiKategorien(z.r as Poi) : z.kind === "hospitals" ? ["krankenhaus"] : alleOrte().find((o) => o.id === z.r.id)?.kategorien ?? []).map(kategorieLabel)],
          ["Ort", (z) => [(z.r as Poi).ort]],
          geb,
        ];
      case "codes":
        return [
          ["Kategorie", (z) => [(z.r as Einsatzcode).kategorie]],
          ["Kapitel", (z) => [(z.r as Einsatzcode).kapitel]],
        ];
      case "templates":
        return [];
    }
  }

  function zeilen(): Zeile[] {
    const eigene = (store.list(current) as KindMap[Kind][]).map((r) => ({ kind: current, r }));
    if (current !== "pois" || !alleOrteZeigen) return eigene;
    return [...eigene, ...store.list("hospitals").map((r) => ({ kind: "hospitals" as Kind, r })), ...store.list("stations").map((r) => ({ kind: "stations" as Kind, r }))];
  }

  function renderFilter(alle: Zeile[]) {
    filterBar.innerHTML = "";
    const defs = filterDefs(current);
    const f = (filter[current] ??= {});
    for (const [name, fn] of defs) {
      const zahl = new Map<string, number>();
      for (const z of alle) for (const v of fn(z)) zahl.set(v, (zahl.get(v) ?? 0) + 1);
      if (zahl.size < 2 && !f[name]) continue;
      const sel = el("select", { "data-filter": name }) as HTMLSelectElement;
      sel.appendChild(el("option", { value: "" }, "alle"));
      const werte = [...zahl.keys()].sort((a, b) => (name === "Kategorie" && current === "pois" ? ORT_KATEGORIEN.findIndex((k) => k.label === a) - ORT_KATEGORIEN.findIndex((k) => k.label === b) : a.localeCompare(b, "de", { numeric: true })));
      for (const w of werte) sel.appendChild(el("option", { value: w }, `${w || "(leer)"} (${zahl.get(w)})`));
      sel.value = f[name] ?? "";
      if (sel.value !== (f[name] ?? "")) f[name] = "";
      sel.addEventListener("change", () => {
        f[name] = sel.value;
        renderTable();
      });
      const lab = el("label", {}, `${name}:`);
      lab.appendChild(sel);
      filterBar.appendChild(lab);
    }
    if (current === "pois") {
      const lab = el("label", { title: "Krankenhäuser und Dienststellen zählen auch als Orte" });
      const c = el("input", { type: "checkbox" }) as HTMLInputElement;
      c.checked = alleOrteZeigen;
      c.addEventListener("change", () => {
        alleOrteZeigen = c.checked;
        renderTable();
      });
      lab.append(c, "auch Krankenhäuser und Dienststellen");
      filterBar.appendChild(lab);
    }
    if (Object.values(f).some(Boolean)) {
      const b = el("button", { class: "btn small", type: "button" }, "Filter zurücksetzen");
      b.addEventListener("click", () => {
        filter[current] = {};
        renderTable();
      });
      filterBar.appendChild(b);
    }
    filterBar.hidden = !filterBar.childElementCount;
  }

  function renderTable() {
    title.textContent = KIND_LABEL[current];
    const cols = columns(current);
    thead.innerHTML = `<tr>${cols
      .map(([h], i) => `<th class="sortierbar" data-sp="${i}" title="Klicken zum Sortieren">${esc(h)}${sortSp === i ? `<span class="sort-pfeil">${sortAb ? "▼" : "▲"}</span>` : ""}</th>`)
      .join("")}<th class="sortierbar" data-sp="${cols.length}">Quelle${sortSp === cols.length ? `<span class="sort-pfeil">${sortAb ? "▼" : "▲"}</span>` : ""}</th><th></th></tr>`;
    thead.querySelectorAll<HTMLElement>("th[data-sp]").forEach((th) =>
      th.addEventListener("click", () => {
        const i = Number(th.dataset.sp);
        if (sortSp === i) {
          if (sortAb) {
            sortSp = -1;
            sortAb = false;
          } else sortAb = true;
        } else {
          sortSp = i;
          sortAb = false;
        }
        renderTable();
      }),
    );

    const all = zeilen();
    renderFilter(all);
    const f = filter[current] ?? {};
    const defs = filterDefs(current).filter(([n]) => f[n]);
    const wert = (z: Zeile, i: number): string => {
      if (z.kind !== current) {
        // Krankenhaus / Dienststelle in der Orte-Liste
        const o = z.r as Station | Hospital;
        return i === 0 ? o.name : i === 1 ? kategorieLabel(z.kind === "hospitals" ? "krankenhaus" : (alleOrte().find((x) => x.id === o.id)?.kategorien[0] ?? "sonstiges")) : i === 2 ? o.ort : "";
      }
      return cols[i] ? cols[i][1](z.r) : ORIGIN_LABEL[z.r.herkunft];
    };
    const filtered = all.filter(
      (z) =>
        defs.every(([n, fn]) => fn(z).includes(f[n])) &&
        (!query || cols.some((_, i) => wert(z, i).toLowerCase().includes(query)) || z.r.id.toLowerCase().includes(query)),
    );
    const name = (z: Zeile) => (z.kind === current ? displayName(current, z.r) : (z.r as Station).name);
    const sorted = filtered.slice().sort((a, b) => {
      if (sortSp < 0) return name(a).localeCompare(name(b), "de", { numeric: true });
      const x = wert(a, sortSp);
      const y = wert(b, sortSp);
      const nx = Number(x);
      const ny = Number(y);
      const c = x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y, "de", { numeric: true });
      return (sortAb ? -c : c) || name(a).localeCompare(name(b), "de", { numeric: true });
    });

    const frag = document.createDocumentFragment();
    for (const z of sorted.slice(0, MAX_ROWS)) {
      const r = z.r;
      const tr = el("tr");
      if (z.kind !== current) tr.classList.add("fremd");
      tr.innerHTML =
        cols
          .map((c, i) => {
            const t = esc(wert(z, i));
            return current === "vehicles" && c[0] === "Dienstplan" ? `<td data-dienstfz="${esc(r.id)}">${t}</td>` : `<td>${t}</td>`;
          })
          .join("") +
        `<td><span class="badge src-${r.herkunft}" title="${esc(r.herkunftDetail ?? "")}">${z.kind !== current ? esc(z.kind === "hospitals" ? "Krankenhaus" : "Dienststelle") : ORIGIN_LABEL[r.herkunft]}</span></td>`;
      const act = el("td", { class: "row-actions" });
      if (z.kind === "codes") {
        // keine Position
      } else if (z.kind !== "vehicles") {
        const m = el("button", { class: "btn small", title: "Auf der Karte zeigen" }, "Karte");
        m.addEventListener("click", (e) => {
          e.stopPropagation();
          const g = r as Station;
          deps.showOnMap(g.lat, g.lon);
        });
        act.appendChild(m);
      } else {
        const st = store.get("stations", (r as Vehicle).dienststelleId);
        if (st) {
          const m = el("button", { class: "btn small", title: "Dienststelle auf der Karte zeigen" }, "Karte");
          m.addEventListener("click", (e) => {
            e.stopPropagation();
            deps.showOnMap(st.lat, st.lon);
          });
          act.appendChild(m);
        }
      }
      tr.appendChild(act);
      tr.addEventListener("click", () => openEditor(z.kind, r.id, deps));
      frag.appendChild(tr);
    }
    tbody.innerHTML = "";
    tbody.appendChild(frag);

    const c = store.counts(current);
    foot.textContent =
      `${filtered.length} von ${all.length} ${KIND_LABEL[current]} (${c.standard} Standard, ${c.eigene} eigene)` +
      (filtered.length > MAX_ROWS ? ` – angezeigt werden die ersten ${MAX_ROWS}, bitte suchen oder filtern` : "") +
      ` · Spaltenkopf klicken zum Sortieren · Klick auf eine Zeile zum Bearbeiten`;
    if (all.length === 0 && current === "codes") {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 2}" class="empty">Noch keine Einsatzcodes. LeitWerk bringt keine Codeliste mit – bitte deine Liste mit „CSV importieren …“ oder ein Abfrageschema (JSON) laden. Nötig ist nur die Spalte „Code“; dazu Name, Kategorie (Stufe, z. B. „ALS rot“) und Kapitel (z. B. „10 - Brustschmerz“).</td></tr>`;
    } else if (all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 2}" class="empty">Noch keine ${KIND_LABEL[current]}. Mit „Neu“ anlegen oder eine CSV-Datei importieren (Vorlage und Beispiel helfen beim Aufbau der Datei).</td></tr>`;
    }
  }

  function render() {
    renderNav();
    renderSources();
    renderSchemaBar();
    renderTable();
  }

  store.onChange(render);
  render();
  return { refresh: render, zeigeArt: (k: Kind) => (k === current ? render() : select(k)) };
}

