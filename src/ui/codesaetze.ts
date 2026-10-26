/**
 * Eigene Codesätze – ab v0.76 getrennt für Notrufe (RD) und für Krankentransporte/Überstellungen (KT/SEK):
 *  - RD:     Abfrageschema/RD/<Name>.json (Abfrage) und/oder Codelisten/RD/<Name>.csv (Codes)
 *  - KT/SEK: Abfrageschema/Krankentransport_Sekundärtransporte/<Name>.json (Fragen der KT-Hotline)
 *            und/oder Codelisten/Krankentransport_Sekundärtransporte/<Name>.json (Codes mit Bedingungen)
 * Gleicher Name = ein Satz. Beide Bereiche sind einzeln wählbar; das eingebaute LeitWerk-System ist immer wählbar.
 * Im Multiplayer gilt, was der Host gewählt hat.
 */
import { istSchema, type Schema } from "../abfrage/schema";
import { importCsv } from "../data/schema";
import { store } from "../data/store";
import { standardCodesystem } from "../data/standard";
import { ablageLesen, ablageListe, ablageLoeschen, ablageName, ablageSpeichern, type AblageOrdner } from "../net/ablage";
import { decodeText } from "../platform";
import { pruefeKtSatz, type KtAbfrageFrage, type KtCodeDef } from "../sim/ktBedingungen";
import { standardKtAbfrage } from "../sim/ktCodes";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { schemaUebernehmen } from "./importDialog";
import { ktEditorOeffnen } from "./ktCodeEditor";

export const RECHTLICHER_HINWEIS =
  "Aus rechtlichen Gründen können wir die echten Einsatzcodes und Abfrageschemas leider nicht mitliefern. LeitWerk bringt deshalb ein eigenes Codesystem mit, das sich ähnlich spielt. Du kannst aber jederzeit deine eigene Codeliste und dein eigenes Abfrageschema einbauen.";

export type Bereich = "rd" | "kt";

export const ORDNER: Record<Bereich, { abfrage: AblageOrdner; codes: AblageOrdner; codesEndung: RegExp }> = {
  rd: { abfrage: "Abfrageschema/RD", codes: "Codelisten/RD", codesEndung: /\.(csv|txt)$/i },
  kt: { abfrage: "Abfrageschema/Krankentransport_Sekundärtransporte", codes: "Codelisten/Krankentransport_Sekundärtransporte", codesEndung: /\.json$/i },
};

export interface CodeSatz {
  bereich: Bereich;
  name: string;
  /** Dateiname im Abfrage-Ordner */
  schema?: string;
  /** Dateiname im Codes-Ordner */
  codes?: string;
  /** im Editor als Entwurf gespeichert (noch nicht spielbar) */
  entwurf?: boolean;
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

/** Name des aktiven eigenen RD-Satzes (null = eingebautes LeitWerk-Codesystem) */
export function aktiverSatz(): string | null {
  const eigen = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard");
  if (!eigen) return null;
  try {
    return localStorage.getItem(LS_AKTIV) ?? (store.schemaRoh?.name || "Eigener Satz");
  } catch {
    return store.schemaRoh?.name || "Eigener Satz";
  }
}

/** Name des aktiven eigenen KT-/SEK-Satzes (null = eingebaut) */
export function aktiverKtSatz(): string | null {
  const k = store.ktSatzRoh;
  return k ? k.name || "Eigener Satz" : null;
}

const aktivIn = (b: Bereich) => (b === "rd" ? aktiverSatz() : aktiverKtSatz());

/** Alle gespeicherten Sätze eines Bereichs */
export async function satzListe(bereich: Bereich = "rd"): Promise<CodeSatz[]> {
  const o = ORDNER[bereich];
  const m = new Map<string, CodeSatz>();
  const nimm = (name: string, t: number) => {
    const s = m.get(name.toLowerCase()) ?? { bereich, name, geaendert: 0 };
    s.geaendert = Math.max(s.geaendert, t);
    m.set(name.toLowerCase(), s);
    return s;
  };
  for (const d of await ablageListe(o.abfrage).catch(() => [])) if (/\.json$/i.test(d.datei)) nimm(basis(d.datei), d.geaendert).schema = d.datei;
  for (const d of await ablageListe(o.codes).catch(() => [])) if (o.codesEndung.test(d.datei)) nimm(basis(d.datei), d.geaendert).codes = d.datei;
  // Entwürfe erkennen
  for (const s of m.values()) {
    for (const [ordner, datei] of [
      [o.abfrage, s.schema],
      [bereich === "kt" ? o.codes : null, s.codes],
    ] as const) {
      if (!ordner || !datei) continue;
      try {
        if ((JSON.parse(await ablageLesen(ordner, datei)) as { entwurf?: boolean }).entwurf) s.entwurf = true;
      } catch {
        /* egal */
      }
    }
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Zurück zum eingebauten System (RD bzw. KT/SEK) */
export function eingebautAktivieren(bereich: Bereich = "rd"): void {
  if (bereich === "kt") {
    store.setKtSatz(null);
    return;
  }
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

/** RD-Abfrageschema lesen (ein KT-Teil darin zählt nicht – KT/SEK ist eigener Bereich) */
function rdSchemaLesen(text: string, datei: string): Schema {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  if (!istSchema(roh)) throw new Error(`${datei} ist kein gültiges Abfrageschema (es fehlen „kapitel“, „globale_fragen“ oder „codes“)`);
  const s = roh as Schema & { kt?: unknown };
  delete s.kt;
  return s;
}

/** KT-/SEK-Codes (JSON: { codes: [...] } oder eine Liste) */
export function ktCodesLesen(text: string, datei: string): KtCodeDef[] {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  const l = Array.isArray(roh) ? roh : (roh as { codes?: unknown })?.codes;
  if (!Array.isArray(l) || !l.length || !l.every((c) => c && typeof (c as KtCodeDef).code === "string" && typeof (c as KtCodeDef).bed === "object"))
    throw new Error(`${datei}: keine KT-/SEK-Codes erkannt (nötig: „codes“ mit „code“, „name“ und „bed“ – so, wie der Editor speichert)`);
  return l as KtCodeDef[];
}

/** KT-Abfrage (JSON: { abfrage: [...] } oder eine Liste) */
export function ktAbfrageLesen(text: string, datei: string): KtAbfrageFrage[] {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  const l = Array.isArray(roh) ? roh : (roh as { abfrage?: unknown })?.abfrage;
  if (!Array.isArray(l) || !l.length || !l.every((f) => f && typeof (f as KtAbfrageFrage).text === "string" && typeof (f as KtAbfrageFrage).id === "string"))
    throw new Error(`${datei}: keine Fragen erkannt (nötig: „abfrage“ mit „id“ und „text“ je Frage)`);
  return l as KtAbfrageFrage[];
}

/** Gespeicherten Satz aktivieren */
export async function satzAktivieren(s: CodeSatz): Promise<void> {
  if (s.entwurf) throw new Error(`„${s.name}“ ist ein Entwurf – erst im Editor fertigstellen`);
  const o = ORDNER[s.bereich];
  if (s.bereich === "kt") {
    const codes = s.codes ? ktCodesLesen(await ablageLesen(o.codes, s.codes), s.codes) : undefined;
    const abfrage = s.schema ? ktAbfrageLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : undefined;
    const r = pruefeKtSatz({ codes: codes ?? eingebauteKtCodes(), abfrage }, standardKtAbfrage());
    if (r.fehler.length) throw new Error(`„${s.name}“ ist noch nicht vollständig (${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"}) – bitte im Editor bearbeiten`);
    store.setKtSatz({ name: s.name, ...(codes ? { codes } : {}), ...(abfrage ? { abfrage } : {}) });
    toast(`KT-/SEK-Satz „${s.name}“ aktiv${codes ? "" : " (nur Abfrage – die Codes bleiben die eingebauten)"}${abfrage ? "" : " (nur Codes – die Abfrage bleibt die eingebaute)"}`);
    return;
  }
  const schema = s.schema ? rdSchemaLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : null;
  let codes: ReturnType<typeof codesLesen> | null = null;
  if (s.codes) {
    codes = codesLesen(await ablageLesen(o.codes, s.codes), s.codes);
    if ("fehler" in codes) throw new Error(codes.fehler);
  }
  eingebautAktivieren("rd");
  if (schema) schemaUebernehmen(schema, s.schema!, false);
  if (codes && "codes" in codes) store.upsert("codes", codes.codes!);
  aktivMerken(s.name);
  toast(`RD-Satz „${s.name}“ aktiv${schema ? "" : " (nur Codeliste – die Abfrage bleibt die eingebaute)"}`);
}

/** Eingebaute KT-/SEK-Codes (für einen Satz, der nur die Abfrage mitbringt) */
function eingebauteKtCodes(): KtCodeDef[] {
  return ((standardCodesystem() as { kt?: { codes?: KtCodeDef[] } }).kt?.codes ?? []) as KtCodeDef[];
}

/** Datei aus einem Datei-Feld lesen */
async function dateiText(inp: HTMLInputElement): Promise<{ name: string; text: string } | null> {
  const f = inp.files?.[0];
  if (!f) return null;
  return { name: f.name, text: decodeText(await f.arrayBuffer()) };
}

const TITEL: Record<Bereich, string> = { rd: "Notruf (RD)", kt: "Krankentransport & Überstellung (KT/SEK)" };

/** Fenster „Eigene Codes & Abfrage hinzufügen“ für einen Bereich */
export function satzHochladen(bereich: Bereich, fertig?: () => void): void {
  const o = ORDNER[bereich];
  const body = el("div", { class: "cs-hoch" });
  body.innerHTML = `<p class="muted small">Du kannst beides zusammen oder nur eines davon hochladen. Gespeichert wird in <b>Dokumente/LeitWerk</b> unter <b>${esc(o.codes)}</b> und <b>${esc(o.abfrage)}</b>; danach steht der Satz in der Liste zum Wechseln bereit.</p>`;
  const grid = el("div", { class: "form-grid" });
  const name = el("input", { type: "text", name: "satzname", placeholder: "z. B. Meine Leitstelle" }) as HTMLInputElement;
  const codes = el("input", { type: "file", name: "codeliste", accept: bereich === "rd" ? ".csv,.txt,text/csv,text/plain" : ".json,application/json" }) as HTMLInputElement;
  const schema = el("input", { type: "file", name: "abfrageschema", accept: ".json,application/json" }) as HTMLInputElement;
  const feld = (label: string, input: HTMLElement, hinweis: string) => {
    const w = el("label", { class: "fld wide" });
    w.append(el("span", { class: "fld-label" }, label), input, el("span", { class: "fld-hint" }, hinweis));
    return w;
  };
  grid.append(feld("Name des Satzes", name, "Unter diesem Namen findest du den Satz später wieder."));
  if (bereich === "rd")
    grid.append(
      feld("Codeliste (CSV)", codes, "Spalten: Code, Name, Kategorie (z. B. „ALS rot“), Kapitel."),
      feld("Abfrageschema (JSON)", schema, "Fragen und Regeln für die Notrufabfrage – enthält meist auch die Codes."),
    );
  else
    grid.append(
      feld("KT-/SEK-Codes (JSON)", codes, "Codes mit ihren Bedingungen – so, wie der Editor sie speichert."),
      feld("KT-Abfrage (JSON)", schema, "Fragen der KT-Hotline mit Art und dem, was sie klären."),
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
    title: `Eigene Codes & Abfrage – ${TITEL[bereich]}`,
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
            toast("Bitte Codes und/oder eine Abfrage wählen", "error");
            return false;
          }
          const n = ablageName(name.value.trim() || basis((s ?? c)!.name));
          let sText = s?.text;
          let cText = c?.text;
          try {
            if (bereich === "rd") {
              if (s) sText = JSON.stringify(rdSchemaLesen(s.text, s.name));
              if (c) {
                const r = codesLesen(c.text, c.name);
                if ("fehler" in r) throw new Error(r.fehler);
              }
            } else {
              if (c) cText = JSON.stringify({ codes: ktCodesLesen(c.text, c.name) });
              if (s) sText = JSON.stringify({ abfrage: ktAbfrageLesen(s.text, s.name) });
            }
          } catch (e) {
            toast(String((e as Error).message ?? e), "error");
            return false;
          }
          const vorhanden = (await satzListe(bereich)).find((x) => x.name.toLowerCase() === n.toLowerCase());
          if (vorhanden && !(await confirmDialog("Satz ersetzen?", `Es gibt schon einen Satz „${vorhanden.name}“. Die neuen Dateien ersetzen die alten.`, "Ersetzen"))) return false;
          try {
            if (sText) await ablageSpeichern(o.abfrage, `${n}.json`, sText);
            if (cText) await ablageSpeichern(o.codes, `${n}.${bereich === "rd" ? "csv" : "json"}`, cText);
            const satz = (await satzListe(bereich)).find((x) => x.name.toLowerCase() === n.toLowerCase());
            if (satz) await satzAktivieren(satz);
          } catch (e) {
            toast(String((e as Error).message ?? e), "error");
            fertig?.();
            return false;
          }
          fertig?.();
          return true;
        },
      },
    ],
  });
}

/** Fenster „Einsatzcodes & Abfrage“: Hinweis, je Bereich eingebaut + gespeicherte Sätze, Hochladen */
export function codesaetzeOeffnen(geaendert?: () => void): void {
  const body = el("div", { class: "cs-saetze" });
  const zeichnen = async () => {
    const listen = { rd: await satzListe("rd"), kt: await satzListe("kt") };
    body.innerHTML = `<div class="cs-rechtlich"><b>Hinweis</b><p>${esc(RECHTLICHER_HINWEIS)}</p></div>`;
    for (const bereich of ["rd", "kt"] as const) {
      const aktiv = aktivIn(bereich);
      const o = ORDNER[bereich];
      const abschnitt = el("div", { class: "cs-bereich", "data-bereich": bereich });
      abschnitt.appendChild(el("h4", { class: "cs-bereich-titel" }, TITEL[bereich]));
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
        eingebautAktivieren(bereich);
        toast(`Eingebaut aktiv: ${TITEL[bereich]}`);
        geaendert?.();
        void zeichnen();
      });
      zeile(
        bereich === "rd" ? "LeitWerk-Codesystem (eingebaut)" : "LeitWerk-Transportcodes (eingebaut)",
        bereich === "rd" ? "Eigene Codes im gewohnten Aufbau (RD-…), mit Abfrage – immer verfügbar" : "Eigene Codes für Krankentransporte und Überstellungen (KT…, SEK-…), mit KT-Abfrage – immer verfügbar",
        aktiv === null,
        [std],
      );
      for (const s of listen[bereich]) {
        const istAktiv = aktiv?.toLowerCase() === s.name.toLowerCase();
        const nutzen = el("button", { class: "btn small", "data-satz": s.name }, "Verwenden");
        nutzen.disabled = istAktiv || !!s.entwurf;
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
          if (!(await confirmDialog("Satz löschen", `„${s.name}“ (${TITEL[bereich]}) wird aus Dokumente/LeitWerk gelöscht.`, "Löschen", true))) return;
          if (s.schema) await ablageLoeschen(o.abfrage, s.schema).catch(() => undefined);
          if (s.codes) await ablageLoeschen(o.codes, s.codes).catch(() => undefined);
          if (istAktiv) eingebautAktivieren(bereich);
          geaendert?.();
          void zeichnen();
        });
        const teile =
          bereich === "rd"
            ? [s.codes ? "Codeliste" : "", s.schema ? "Abfrageschema" : ""].filter(Boolean).join(" + ")
            : [s.codes ? "Codes" : "", s.schema ? "Abfrage" : ""].filter(Boolean).join(" + ");
        const fehlt = s.schema ? (s.codes ? "" : bereich === "rd" ? "" : " – Codes bleiben die eingebauten") : " – Abfrage bleibt die eingebaute";
        const knoepfe = [nutzen];
        if (bereich === "kt") {
          const bearb = el("button", { class: "btn small", title: "Codes und Abfrage bearbeiten" }, "Bearbeiten");
          bearb.addEventListener("click", async () => {
            try {
              const codes = s.codes ? ktCodesLesen(await ablageLesen(o.codes, s.codes), s.codes) : undefined;
              const abfrage = s.schema ? ktAbfrageLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : undefined;
              ktEditorOeffnen({ satz: { codes: codes ?? eingebauteKtCodes(), abfrage }, name: s.name, fertig: () => (geaendert?.(), void zeichnen()) });
            } catch (e) {
              toast(String((e as Error).message ?? e), "error");
            }
          });
          knoepfe.push(bearb);
        }
        knoepfe.push(weg);
        zeile(s.name, `${s.entwurf ? "ENTWURF – noch nicht spielbar · " : ""}${teile}${fehlt}`, istAktiv, knoepfe);
      }
      abschnitt.appendChild(ul);
      const knoepfe = el("div", { class: "row-btns cs-neu" });
      const neu = el("button", { class: "btn primary", "data-satz-neu": bereich }, "+ Eigene Codes & Abfrage hinzufügen …");
      neu.addEventListener("click", () =>
        satzHochladen(bereich, () => {
          geaendert?.();
          void zeichnen();
        }),
      );
      knoepfe.appendChild(neu);
      if (bereich === "kt") {
        const kt = el("button", { class: "btn", "data-kt-editor": "" }, "Codes & Abfrage bearbeiten …");
        kt.title = "Eigene Codes für Krankentransporte und Überstellungen – als neuer Satz auf Basis des aktiven";
        kt.addEventListener("click", () => ktEditorOeffnen({ fertig: () => (geaendert?.(), void zeichnen()) }));
        knoepfe.appendChild(kt);
      }
      abschnitt.appendChild(knoepfe);
      body.appendChild(abschnitt);
    }
  };
  void zeichnen();
  openDialog({ title: "Einsatzcodes & Abfrage", body, wide: true, actions: [{ label: "Schließen" }] });
}

/**
 * Einmalig beim Start: v0.73 alte importierte Codes/Schemas entfernen; v0.76 gemischte Sätze entfernen –
 * ab jetzt RD und KT/SEK getrennt (die Dateien liegen dann in den Unterordnern).
 */
export async function codesEinmaligAufraeumen(): Promise<boolean> {
  if (store.codesGetrennt || store.inSession) return false;
  const hatte = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard") || !!store.ktSatzRoh;
  store.codesTrennen();
  aktivMerken(null);
  let dateien = 0;
  for (const ordner of ["Abfrageschema", "Codelisten"] as const) {
    for (const d of await ablageListe(ordner).catch(() => [])) {
      await ablageLoeschen(ordner, d.datei)
        .then(() => dateien++)
        .catch((e) => console.warn("Ablage löschen", e));
    }
  }
  if (hatte || dateien)
    toast("Neu: Codes für Notrufe (RD) und für Krankentransporte/Überstellungen (KT/SEK) sind jetzt getrennt. Eigene Sätze bitte unter Einstellungen → Einsatzcodes & Abfrage neu hinzufügen.");
  return true;
}
