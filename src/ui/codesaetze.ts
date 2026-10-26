/**
 * Eigene Codesätze: eine Codeliste (CSV) und/oder ein Abfrageschema (JSON) unter einem Namen.
 * Die Dateien liegen in „Dokumente/LeitWerk/Codelisten“ und „…/Abfrageschema“ (gleicher Name = ein Satz).
 * Das eingebaute LeitWerk-Codesystem ist immer wählbar. Im Multiplayer gilt der Satz des Hosts
 * (die Daten kommen mit dem Spiel des Hosts und werden beim Mitspieler nicht gespeichert).
 */
import { istSchema, type Schema } from "../abfrage/schema";
import { importCsv } from "../data/schema";
import { store } from "../data/store";
import { ablageLesen, ablageListe, ablageLoeschen, ablageName, ablageSpeichern } from "../net/ablage";
import { decodeText } from "../platform";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { schemaUebernehmen } from "./importDialog";

export const RECHTLICHER_HINWEIS =
  "Aus rechtlichen Gründen können wir die echten Einsatzcodes und Abfrageschemas leider nicht mitliefern. LeitWerk bringt deshalb ein eigenes Codesystem mit, das sich ähnlich spielt. Du kannst aber jederzeit deine eigene Codeliste und dein eigenes Abfrageschema einbauen.";

export interface CodeSatz {
  name: string;
  /** Dateiname in Abfrageschema/ */
  schema?: string;
  /** Dateiname in Codelisten/ */
  codes?: string;
  geaendert: number;
}

const LS_AKTIV = "lw.codesatz";
const basis = (datei: string) => datei.replace(/\.(json|csv|txt)$/i, "");

function aktivMerken(name: string | null): void {
  try {
    if (name) localStorage.setItem(LS_AKTIV, name);
    else localStorage.removeItem(LS_AKTIV);
  } catch {
    /* egal */
  }
}

/** Name des aktiven eigenen Satzes (null = eingebautes LeitWerk-Codesystem) */
export function aktiverSatz(): string | null {
  const eigen = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard");
  if (!eigen) return null;
  try {
    return localStorage.getItem(LS_AKTIV) ?? (store.schemaRoh?.name || "Eigener Satz");
  } catch {
    return store.schemaRoh?.name || "Eigener Satz";
  }
}

/** Alle gespeicherten Sätze (aus den beiden Ordnern) */
export async function satzListe(): Promise<CodeSatz[]> {
  const m = new Map<string, CodeSatz>();
  const nimm = (name: string, t: number) => {
    const s = m.get(name.toLowerCase()) ?? { name, geaendert: 0 };
    s.geaendert = Math.max(s.geaendert, t);
    m.set(name.toLowerCase(), s);
    return s;
  };
  for (const d of await ablageListe("Abfrageschema").catch(() => [])) if (/\.json$/i.test(d.datei)) nimm(basis(d.datei), d.geaendert).schema = d.datei;
  for (const d of await ablageListe("Codelisten").catch(() => [])) if (/\.(csv|txt)$/i.test(d.datei)) nimm(basis(d.datei), d.geaendert).codes = d.datei;
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Zurück zum eingebauten LeitWerk-Codesystem */
export function eingebautAktivieren(): void {
  store.setSchema(null);
  store.removeMany("codes", store.list("codes").filter((c) => c.herkunft !== "standard").map((c) => c.id));
  aktivMerken(null);
}

/** Codeliste (CSV) lesen; Fehlertext oder Codes */
function codesLesen(text: string, datei: string) {
  const r = importCsv("codes", text, { stations: [], existing: [], herkunft: "import", herkunftDetail: datei });
  if (!r.records.length) return { fehler: `${datei}: keine Codes erkannt (nötig ist die Spalte „Code“, dazu Name, Kategorie, Kapitel)` };
  return { codes: r.records, fehlerZeilen: r.fehler.length };
}

/** Gespeicherten Satz aktivieren */
export async function satzAktivieren(s: CodeSatz): Promise<void> {
  let schema: Schema | null = null;
  if (s.schema) {
    const roh = JSON.parse(await ablageLesen("Abfrageschema", s.schema)) as unknown;
    if (!istSchema(roh)) throw new Error(`${s.schema} ist kein gültiges Abfrageschema`);
    schema = roh as Schema;
  }
  let codes: ReturnType<typeof codesLesen> | null = null;
  if (s.codes) {
    codes = codesLesen(await ablageLesen("Codelisten", s.codes), s.codes);
    if ("fehler" in codes) throw new Error(codes.fehler);
  }
  eingebautAktivieren();
  if (schema) schemaUebernehmen(schema, s.schema!);
  if (codes && "codes" in codes) store.upsert("codes", codes.codes!);
  aktivMerken(s.name);
  toast(`Codesatz „${s.name}“ aktiv${schema ? "" : " (nur Codeliste – die Abfrage bleibt die eingebaute)"}`);
}

/** Datei aus einem Datei-Feld lesen */
async function dateiText(inp: HTMLInputElement): Promise<{ name: string; text: string } | null> {
  const f = inp.files?.[0];
  if (!f) return null;
  return { name: f.name, text: decodeText(await f.arrayBuffer()) };
}

/** Fenster „Eigene Codes & Abfrageschema hinzufügen“ */
export function satzHochladen(fertig?: () => void): void {
  const body = el("div", { class: "cs-hoch" });
  body.innerHTML = `<p class="muted small">Du kannst beides zusammen oder nur eines davon hochladen. Die Dateien werden in <b>Dokumente/LeitWerk</b> gespeichert (Codelisten und Abfrageschema) und stehen danach in der Liste zum Wechseln bereit.</p>`;
  const grid = el("div", { class: "form-grid" });
  const name = el("input", { type: "text", name: "satzname", placeholder: "z. B. Meine Leitstelle" }) as HTMLInputElement;
  const codes = el("input", { type: "file", name: "codeliste", accept: ".csv,.txt,text/csv,text/plain" }) as HTMLInputElement;
  const schema = el("input", { type: "file", name: "abfrageschema", accept: ".json,application/json" }) as HTMLInputElement;
  const feld = (label: string, input: HTMLElement, hinweis: string) => {
    const w = el("label", { class: "fld wide" });
    w.append(el("span", { class: "fld-label" }, label), input, el("span", { class: "fld-hint" }, hinweis));
    return w;
  };
  grid.append(
    feld("Name des Satzes", name, "Unter diesem Namen findest du den Satz später wieder."),
    feld("Codeliste (CSV)", codes, "Spalten: Code, Name, Kategorie (z. B. „ALS rot“), Kapitel."),
    feld("Abfrageschema (JSON)", schema, "Fragen und Regeln für die Notrufabfrage – enthält meist auch die Codes."),
  );
  body.appendChild(grid);
  const vorschlag = (inp: HTMLInputElement) =>
    inp.addEventListener("change", () => {
      const f = inp.files?.[0];
      if (f && !name.value.trim()) name.value = basis(f.name);
    });
  vorschlag(schema);
  vorschlag(codes);

  openDialog({
    title: "Eigene Codes & Abfrageschema hinzufügen",
    body,
    wide: true,
    actions: [
      { label: "Abbrechen" },
      {
        label: "Speichern & verwenden",
        kind: "primary",
        onClick: async () => {
          const c = await dateiText(codes);
          const s = await dateiText(schema);
          if (!c && !s) {
            toast("Bitte eine Codeliste und/oder ein Abfrageschema wählen", "error");
            return false;
          }
          const n = ablageName(name.value.trim() || basis((s ?? c)!.name));
          if (s) {
            try {
              if (!istSchema(JSON.parse(s.text))) throw new Error();
            } catch {
              toast(`${s.name} ist kein gültiges Abfrageschema (es fehlen „kapitel“, „globale_fragen“ oder „codes“)`, "error");
              return false;
            }
          }
          if (c) {
            const r = codesLesen(c.text, c.name);
            if ("fehler" in r) {
              toast(r.fehler!, "error");
              return false;
            }
          }
          const vorhanden = (await satzListe()).find((x) => x.name.toLowerCase() === n.toLowerCase());
          if (vorhanden && !(await confirmDialog("Satz ersetzen?", `Es gibt schon einen Satz „${vorhanden.name}“. Die neuen Dateien ersetzen die alten.`, "Ersetzen"))) return false;
          try {
            if (s) await ablageSpeichern("Abfrageschema", `${n}.json`, s.text);
            if (c) await ablageSpeichern("Codelisten", `${n}.csv`, c.text);
            const satz = (await satzListe()).find((x) => x.name.toLowerCase() === n.toLowerCase()) ?? { name: n, schema: s ? `${n}.json` : undefined, codes: c ? `${n}.csv` : undefined, geaendert: Date.now() };
            await satzAktivieren(satz);
          } catch (e) {
            toast(String((e as Error).message ?? e), "error");
            return false;
          }
          fertig?.();
          return true;
        },
      },
    ],
  });
}

/** Fenster „Codes & Abfrage“: Hinweis, eingebautes System, gespeicherte Sätze, Hochladen */
export function codesaetzeOeffnen(geaendert?: () => void): void {
  const body = el("div", { class: "cs-saetze" });
  const zeichnen = async () => {
    const liste = await satzListe();
    const aktiv = aktiverSatz();
    body.innerHTML = `<div class="cs-rechtlich"><b>Hinweis</b><p>${esc(RECHTLICHER_HINWEIS)}</p></div>`;
    const ul = el("div", { class: "cs-liste-saetze" });
    const zeile = (titel: string, info: string, istAktiv: boolean, knoepfe: HTMLElement[]) => {
      const z = el("div", { class: `cs-satz${istAktiv ? " aktiv" : ""}` });
      z.innerHTML = `<div class="cs-satz-text"><b>${esc(titel)}</b>${istAktiv ? ` <span class="cs-aktiv">aktiv</span>` : ""}<div class="muted small">${esc(info)}</div></div>`;
      const k = el("div", { class: "row-btns" });
      knoepfe.forEach((b) => k.appendChild(b));
      z.appendChild(k);
      ul.appendChild(z);
    };
    const std = el("button", { class: "btn small", "data-satz": "" }, "Verwenden");
    std.disabled = aktiv === null;
    std.addEventListener("click", () => {
      eingebautAktivieren();
      toast("Eingebautes LeitWerk-Codesystem aktiv");
      geaendert?.();
      void zeichnen();
    });
    zeile("LeitWerk-Codesystem (eingebaut)", "Eigene Codes im gewohnten Aufbau (RD-…), mit Abfrage – immer verfügbar", aktiv === null, [std]);
    for (const s of liste) {
      const nutzen = el("button", { class: "btn small", "data-satz": s.name }, "Verwenden");
      nutzen.disabled = aktiv?.toLowerCase() === s.name.toLowerCase();
      nutzen.addEventListener("click", async () => {
        try {
          await satzAktivieren(s);
        } catch (e) {
          toast(String((e as Error).message ?? e), "error");
        }
        geaendert?.();
        void zeichnen();
      });
      const weg = el("button", { class: "btn small danger-text" }, "Löschen");
      weg.addEventListener("click", async () => {
        if (!(await confirmDialog("Satz löschen", `„${s.name}“ wird aus Dokumente/LeitWerk gelöscht.`, "Löschen", true))) return;
        if (s.schema) await ablageLoeschen("Abfrageschema", s.schema).catch(() => undefined);
        if (s.codes) await ablageLoeschen("Codelisten", s.codes).catch(() => undefined);
        if (aktiv?.toLowerCase() === s.name.toLowerCase()) eingebautAktivieren();
        geaendert?.();
        void zeichnen();
      });
      const teile = [s.codes ? "Codeliste" : "", s.schema ? "Abfrageschema" : ""].filter(Boolean).join(" + ");
      zeile(s.name, `${teile}${s.schema ? "" : " – Abfrage bleibt die eingebaute"}`, aktiv?.toLowerCase() === s.name.toLowerCase(), [nutzen, weg]);
    }
    body.appendChild(ul);
    const neu = el("button", { class: "btn primary cs-neu" }, "+ Eigene Codes & Abfrageschema hinzufügen …");
    neu.addEventListener("click", () =>
      satzHochladen(() => {
        geaendert?.();
        void zeichnen();
      }),
    );
    body.appendChild(neu);
  };
  void zeichnen();
  openDialog({ title: "Einsatzcodes & Abfrage", body, wide: true, actions: [{ label: "Schließen" }] });
}

/** v0.73, einmalig: alte importierte Codelisten und Abfrageschemas entfernen – im Programm und als Dateien */
export async function codesEinmaligAufraeumen(): Promise<boolean> {
  if (store.codesAufgeraeumt || store.inSession) return false;
  const hatte = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard");
  store.codesAufraeumen();
  aktivMerken(null);
  let dateien = 0;
  for (const ordner of ["Abfrageschema", "Codelisten"] as const) {
    for (const d of await ablageListe(ordner).catch(() => [])) {
      await ablageLoeschen(ordner, d.datei)
        .then(() => dateien++)
        .catch((e) => console.warn("Ablage löschen", e));
    }
  }
  if (hatte || dateien) toast("Neu: LeitWerk bringt jetzt ein eigenes Codesystem mit. Eigene Codes und Abfrageschemas kannst du unter Einstellungen → Einsatzcodes & Abfrage wieder hinzufügen.");
  return true;
}
