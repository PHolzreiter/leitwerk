/**
 * Beim Programmstart: Ordner in „Dokumente/LeitWerk“ anlegen und mit der Leitstelle abgleichen.
 * - Ist ein Abfrageschema geladen, aber noch nicht im Ordner → hineinlegen (Sicherung).
 * - Ist keines geladen (z. B. neu installiert), liegt aber eines im Ordner → automatisch laden.
 */
import { istSchema, type Schema } from "../abfrage/schema";
import { store } from "../data/store";
import { ablageBasis, ablageLesen, ablageListe, ablageSichern } from "../net/ablage";
import { inTauri } from "../platform";
import { toast } from "./dom";
import { schemaUebernehmen } from "./importDialog";

export async function ablageAbgleichen(nurTest = false): Promise<void> {
  if (!inTauri() && !nurTest) return;
  try {
    await ablageBasis();
    const dateien = (await ablageListe("Abfrageschema")).filter((d) => d.datei.toLowerCase().endsWith(".json"));
    const roh = store.schemaRoh;
    if (roh && !dateien.length) {
      const name = `${(roh as { name?: string }).name?.trim() || "Abfrageschema"}.json`;
      ablageSichern("Abfrageschema", name, JSON.stringify(roh));
      return;
    }
    if (!roh && dateien.length) {
      for (const d of dateien) {
        try {
          const s = JSON.parse(await ablageLesen("Abfrageschema", d.datei)) as unknown;
          if (!istSchema(s)) continue;
          schemaUebernehmen(s as Schema, d.datei);
          toast(`Abfrageschema aus Dokumente/LeitWerk/Abfrageschema geladen: ${d.datei}`);
          return;
        } catch {
          /* nächste Datei */
        }
      }
    }
  } catch (e) {
    console.warn("Ablage", e);
  }
}
