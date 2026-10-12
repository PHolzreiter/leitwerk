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
import { BEISPIEL, STANDARD_INFO, VORLAGE } from "../data/standard";
import { store } from "../data/store";
import { saveTextFile, storeLocation } from "../platform";
import { confirmDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { displayName, openEditor, type EditorDeps } from "./editForm";
import { startImport } from "./importDialog";

const MAX_ROWS = 600;

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
}

export function createDataView(container: HTMLElement, deps: DataViewDeps): { refresh(): void } {
  let current: Kind = "stations";
  let query = "";

  container.innerHTML = `
    <div class="data-layout">
      <nav class="data-nav"></nav>
      <section class="data-main">
        <div class="sources-panel"></div>
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
      b.innerHTML = `<span>${KIND_LABEL[k]}</span><span class="count">${c.gesamt}</span>`;
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
          ["Fahrzeuge", (r) => String(vehicleCount.get(r.id) ?? 0)],
        ];
      case "vehicles":
        return [
          ["Funkrufname", (r) => (r as Vehicle).funkrufname],
          ["Kurzname", (r) => (r as Vehicle).kurzname],
          ["Kategorie", (r) => (r as Vehicle).kategorie],
          ["Typ", (r) => (r as Vehicle).typ],
          ["Dienststelle", (r) => stationName.get((r as Vehicle).dienststelleId) ?? "⚠ fehlt"],
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
          ["Typ", (r) => (r as Poi).typ],
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

  function renderTable() {
    title.textContent = KIND_LABEL[current];
    const cols = columns(current);
    thead.innerHTML = `<tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join("")}<th>Quelle</th><th></th></tr>`;

    const all = store.list(current) as KindMap[Kind][];
    const filtered = query
      ? all.filter((r) => cols.some(([, f]) => f(r).toLowerCase().includes(query)) || r.id.toLowerCase().includes(query))
      : all;
    const sorted = filtered
      .slice()
      .sort((a, b) => displayName(current, a).localeCompare(displayName(current, b), "de", { numeric: true }));

    const frag = document.createDocumentFragment();
    for (const r of sorted.slice(0, MAX_ROWS)) {
      const tr = el("tr");
      tr.innerHTML =
        cols.map(([, f]) => `<td>${esc(f(r))}</td>`).join("") +
        `<td><span class="badge src-${r.herkunft}" title="${esc(r.herkunftDetail ?? "")}">${ORIGIN_LABEL[r.herkunft]}</span></td>`;
      const act = el("td", { class: "row-actions" });
      if (current === "codes") {
        // keine Position
      } else if (current !== "vehicles") {
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
      tr.addEventListener("click", () => openEditor(current, r.id, deps));
      frag.appendChild(tr);
    }
    tbody.innerHTML = "";
    tbody.appendChild(frag);

    const c = store.counts(current);
    foot.textContent =
      `${filtered.length} von ${c.gesamt} ${KIND_LABEL[current]} (${c.standard} Standard, ${c.eigene} eigene)` +
      (filtered.length > MAX_ROWS ? ` – angezeigt werden die ersten ${MAX_ROWS}, bitte suchen` : "") +
      ` · Klick auf eine Zeile zum Bearbeiten`;
    if (all.length === 0 && current === "codes") {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 2}" class="empty">Noch keine Einsatzcodes. LeitWerk bringt keine Codeliste mit – bitte deine Liste mit „CSV importieren …“ laden. Nötig ist nur die Spalte „Code“; dazu Name, Kategorie (Stufe, z. B. „ALS rot“) und Kapitel (z. B. „10 - Brustschmerz“).</td></tr>`;
    } else if (all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${cols.length + 2}" class="empty">Noch keine ${KIND_LABEL[current]}. Mit „Neu“ anlegen oder eine CSV-Datei importieren (Vorlage und Beispiel helfen beim Aufbau der Datei).</td></tr>`;
    }
  }

  function render() {
    renderNav();
    renderSources();
    renderTable();
  }

  store.onChange(render);
  render();
  return { refresh: render };
}

