/** Notruf-Datei (Abfrageschema mit Codes) direkt übernehmen – nur für Tests (?debug). Hochladen geht über Einstellungen › Eigene Dateien. */
import { ablageName, ablageSichern } from "../net/ablage";
import { store } from "../data/store";
import type { Schema } from "../abfrage/schema";
import type { Einsatzcode } from "../data/model";
import { toast } from "./dom";

export function schemaUebernehmen(schema: Schema, dateiname: string, sichern = true): void {
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
  if (sichern) ablageSichern("Abfrageschema/RD", ablageName(dateiname, "json"), JSON.stringify(schema));
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
