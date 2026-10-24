/** CSV-Import mit Vorschau, Fehlerliste und Wahl der Datenart. */
import { ablageName, ablageSichern } from "../net/ablage";
import { KIND_LABEL, KINDS, type Kind } from "../data/model";
import { detectKind, importCsv, type ImportResult } from "../data/schema";
import { store } from "../data/store";
import { pickTextFile } from "../platform";
import { istSchema, type Schema } from "../abfrage/schema";
import { pruefeCodesystem } from "../abfrage/codesystem";
import { uebersetzeSchema } from "../abfrage/normalisieren";
import { standardCodesystem } from "../data/standard";
import { stufeRaten } from "../sim/settings";
import type { Einsatzcode } from "../data/model";
import { openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

const MAX_LIST = 200;

export async function startImport(defaultKind: Kind, onDone: (kind: Kind) => void): Promise<void> {
  const file = await pickTextFile(".csv,.txt,.json");
  if (!file) return;
  if (file.text.trimStart().startsWith("{")) return schemaImport(file, onDone);

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
          ablageSichern(kind === "codes" ? "Codelisten" : "Daten", ablageName(file.name, "csv"), file.text);
          toast(`${result.records.length} ${KIND_LABEL[kind]} importiert`);
          onDone(kind);
          return true;
        },
      },
    ],
  });
  render();
}

/** Codesystem (JSON: Codes + Abfrage) übernehmen – die Codes darin werden in die Codeliste übernommen. */
function schemaImport(file: { name: string; text: string }, onDone: (kind: Kind) => void): void {
  let schema: unknown;
  try {
    schema = JSON.parse(file.text);
  } catch (e) {
    toast(`Die Datei ist kein gültiges JSON: ${String((e as Error).message ?? e)}`, "error");
    return;
  }
  if (!istSchema(schema)) {
    toast("Die Datei ist kein Codesystem (es fehlen „kapitel“, „globale_fragen“ oder „codes“).", "error");
    return;
  }
  const s = schema as Schema;
  const { fehler, hinweise: roheHinweise } = pruefeCodesystem(s);
  // fehlende Fragen „alter/bw/at“ zählen nicht, wenn eine andere Frage dasselbe Merkmal hat
  const u = uebersetzeSchema(s, standardCodesystem());
  const hinweise = roheHinweise.filter((h) => !/^Primärabfrage: die Frage „/.test(h));
  if (u.fehlend.length) hinweise.push(`Für diese Merkmale gibt es keine Frage – Anrufer und Patient werden dazu nur geraten: ${u.fehlend.join(", ")}`);
  if (!u.kompatibel) hinweise.push(`Dein Codesystem wird auf die LeitWerk-Merkmale übersetzt: ${u.zuordnung.filter((z) => z.merkmal).length} von ${u.zuordnung.length} Fragen zugeordnet. Prüfen unter Einstellungen → Einsatzcodes & Abfrage → „Zuordnung …“.`);
  // Kategorien ohne Einsatzstufe (weder in den Einstellungen noch in der Datei)
  const bekannt = new Set([...store.settings.stufen.map((x) => x.stufe), ...(s.einsatzstufen ?? []).map((x) => x.stufe)]);
  const fehlt = [...new Set(Object.values(s.codes ?? {}).map((c) => c?.kategorie).filter((k): k is string => !!k && !bekannt.has(k)))];
  const geraten = fehlt.filter((k) => stufeRaten(k));
  const unklar = fehlt.filter((k) => !stufeRaten(k));
  if (geraten.length) hinweise.push(`Diese Kategorien wurden nach dem Namen eingeordnet (prüfen unter Rettungsmittel je Stufe): ${geraten.slice(0, 12).join(", ")}${geraten.length > 12 ? " …" : ""}`);
  if (unklar.length) hinweise.push(`Diese Kategorien haben noch keine Einsatzstufe (Rettungsmittel je Stufe): ${unklar.slice(0, 12).join(", ")}${unklar.length > 12 ? " …" : ""}`);
  const neu = new Set(Object.keys(s.codes ?? {}).map((c) => c.toUpperCase()));
  const alt = store.list("codes").filter((c) => c.herkunft !== "standard" && !neu.has(c.code.toUpperCase()));
  if (!fehler.length && !alt.length) {
    schemaUebernehmen(s, file.name);
    onDone("codes");
    // Hinweise stören nicht beim Laden – nur kurz melden
    if (hinweise.length) toast(`Hinweis zum Codesystem${hinweise.length > 1 ? ` (1 von ${hinweise.length})` : ""}: ${hinweise[0]}`, "error");
    return;
  }
  const body = el("div", { class: "cs-pruefung" });
  body.appendChild(
    el("p", {}, `${s.name ? `„${s.name}“ · ` : ""}${Object.keys(s.kapitel).length} Kapitel · ${Object.keys(s.codes ?? {}).length} Codes`),
  );
  const liste = (titel: string, l: string[], cls: string) => {
    if (!l.length) return;
    body.appendChild(el("div", { class: `cs-titel ${cls}` }, titel));
    const ul = el("ul", { class: "cs-liste" });
    for (const x of l) ul.appendChild(el("li", {}, x));
    body.appendChild(ul);
  };
  liste("Fehler – so kann die Datei nicht geladen werden:", fehler, "alert-text");
  liste("Hinweise – die Datei läuft, ist aber unvollständig:", hinweise, "warn-text");
  let weg: HTMLInputElement | null = null;
  if (alt.length && !fehler.length) {
    const lab = el("label", { class: "chk" });
    weg = el("input", { type: "checkbox" }) as HTMLInputElement;
    weg.checked = true;
    lab.append(weg, ` ${alt.length} bisherige Codes, die nicht in dieser Datei stehen, entfernen (Wechsel des Codesystems)`);
    body.appendChild(lab);
  }
  openDialog({
    title: "Codesystem laden",
    body,
    wide: true,
    actions: fehler.length
      ? [{ label: "Schließen" }]
      : [
          { label: "Abbrechen" },
          {
            label: "Laden",
            kind: "primary",
            onClick: () => {
              if (weg?.checked) store.removeMany("codes", alt.map((c) => c.id));
              schemaUebernehmen(s, file.name);
              onDone("codes");
            },
          },
        ],
  });
}

export function schemaUebernehmen(schema: Schema, dateiname: string): void {
  const vorhanden = new Map(store.list("codes").map((c) => [c.code.toUpperCase(), c.id]));
  const codes: Einsatzcode[] = Object.entries(schema.codes).map(([code, c]) => ({
    id: vorhanden.get(code.toUpperCase()) ?? code,
    code,
    name: c.name,
    kategorie: c.kategorie,
    kapitel: c.kapitel,
    hinweis: "",
    herkunft: "import",
    herkunftDetail: dateiname,
  }));
  store.setSchema(schema);
  store.upsert("codes", codes);
  ablageSichern("Abfrageschema", ablageName(dateiname, "json"), JSON.stringify(schema));
  // Einsatzstufen aus der Datei, die es noch nicht gibt
  const neu = (schema.einsatzstufen ?? []).filter((x) => x?.stufe && !store.settings.stufen.some((st) => st.stufe === x.stufe));
  if (neu.length) {
    const set = structuredClone(store.settings);
    for (const x of neu)
      set.stufen.push({
        stufe: x.stufe,
        rettungsmittel: x.rettungsmittel ?? "",
        nfsErforderlich: !!x.nfs_erforderlich,
        notarzt: x.notarzt === "nef" || x.notarzt === "schnellster" ? x.notarzt : "nein",
        sondersignal: !!x.sondersignal,
        // ohne Angabe: aus Notarzt und Sondersignal ableiten
        kategorie: x.kategorie === "kritisch" || x.kategorie === "dringend" || x.kategorie === "stabil" ? x.kategorie : x.notarzt === "nef" || x.notarzt === "schnellster" ? "kritisch" : x.sondersignal ? "dringend" : "stabil",
        transportProzent: Math.max(0, Math.min(100, Number(x.transport_prozent ?? 70))),
      });
    store.setSettings(set);
    toast(`${neu.length} neue Einsatzstufen aus dem Codesystem angelegt (Einstellungen → Rettungsmittel je Stufe)`);
  }
  toast(`Codesystem geladen${schema.name ? ` („${schema.name}“)` : ""}: ${Object.keys(schema.kapitel).length} Kapitel, ${codes.length} Codes`);
}
