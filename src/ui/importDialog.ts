/** CSV-Import mit Vorschau, Fehlerliste und Wahl der Datenart. */
import { KIND_LABEL, KINDS, type Kind } from "../data/model";
import { detectKind, importCsv, type ImportResult } from "../data/schema";
import { store } from "../data/store";
import { pickTextFile } from "../platform";
import { openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

const MAX_LIST = 200;

export async function startImport(defaultKind: Kind, onDone: (kind: Kind) => void): Promise<void> {
  const file = await pickTextFile();
  if (!file) return;

  let kind: Kind = detectKind(file.text) ?? defaultKind;
  let result: ImportResult<Kind>;
  let mode: "ergaenzen" | "ersetzen" = "ergaenzen";

  const body = el("div", { class: "import" });
  const head = el("div", { class: "import-head" });
  const kindSel = el("select");
  for (const k of KINDS) {
    const o = el("option", { value: k }, KIND_LABEL[k]);
    kindSel.appendChild(o);
  }
  kindSel.value = kind;
  head.append(el("span", {}, `Datei: ${file.name}`), el("span", { class: "spacer" }), el("span", {}, "Inhalt:"), kindSel);

  const modeBox = el("div", { class: "import-mode" });
  const mk = (value: typeof mode, label: string, hint: string) => {
    const l = el("label", { class: "chk" });
    const r = el("input", { type: "radio", name: "import-mode", value });
    r.checked = value === mode;
    r.addEventListener("change", () => (mode = value));
    l.append(r, el("span", {}, label), el("small", {}, ` – ${hint}`));
    return l;
  };
  modeBox.append(
    mk("ergaenzen", "Ergänzen", "neue Einträge hinzufügen, gleiche ID wird aktualisiert"),
    mk("ersetzen", "Ersetzen", "bisherige eigene Einträge dieser Art vorher entfernen (Standarddaten bleiben)"),
  );

  const summary = el("div", { class: "import-summary" });
  const details = el("div", { class: "import-details" });
  body.append(head, summary, modeBox, details);

  const render = () => {
    result = importCsv(kind, file.text, {
      stations: store.list("stations"),
      existing: store.list(kind) as { id: string; name?: string; funkrufname?: string; kurzname?: string; code?: string }[],
      herkunft: "import",
      herkunftDetail: file.name,
    });
    const ok = result.records.length;
    summary.innerHTML = `
      <div><b>${result.zeilen}</b> Zeilen gelesen · <b class="ok">${ok}</b> übernehmbar ·
      <b class="${result.fehler.length ? "err" : ""}">${result.fehler.length}</b> fehlerhaft ·
      ${result.warnungen.length} Hinweise</div>
      <div class="muted">Erkannte Spalten: ${esc(result.spaltenErkannt.join(", ") || "–")}</div>
      ${result.spaltenIgnoriert.length ? `<div class="muted">Ignoriert: ${esc(result.spaltenIgnoriert.join(", "))}</div>` : ""}`;
    const list = (title: string, items: { zeile: number; meldung: string }[], cls: string) =>
      items.length
        ? `<div class="issue-title ${cls}">${title}</div><ul class="issues ${cls}">${items
            .slice(0, MAX_LIST)
            .map((i) => `<li><span>${i.zeile > 0 ? `Zeile ${i.zeile}` : "Gesamt"}</span> ${esc(i.meldung)}</li>`)
            .join("")}${items.length > MAX_LIST ? `<li>… und ${items.length - MAX_LIST} weitere</li>` : ""}</ul>`
        : "";
    details.innerHTML =
      list("Fehler (diese Zeilen werden nicht übernommen)", result.fehler, "err") +
      list("Hinweise", result.warnungen, "warn");
    dlg?.setActionEnabled(1, ok > 0);
  };

  kindSel.addEventListener("change", () => {
    kind = kindSel.value as Kind;
    render();
  });

  let dlg: ReturnType<typeof openDialog> | null = null;
  dlg = openDialog({
    title: "CSV importieren",
    body,
    wide: true,
    actions: [
      { label: "Abbrechen" },
      {
        label: "Importieren",
        kind: "primary",
        onClick: () => {
          if (!result || result.records.length === 0) return false;
          store.upsert(kind, result.records, mode === "ersetzen");
          toast(`${result.records.length} ${KIND_LABEL[kind]} importiert`);
          onDone(kind);
          return true;
        },
      },
    ],
  });
  render();
}
