/**
 * Beim Programmstart: Ordner in „Dokumente/LeitWerk“ anlegen.
 * v0.73: einmalig alte importierte Codelisten und Abfrageschemas entfernen (im Programm und als Dateien);
 * eigene Codesätze werden danach nur noch bewusst gewählt (Einstellungen → Einsatzcodes & Abfrage), nicht mehr automatisch geladen.
 */
import { ablageBasis } from "../net/ablage";
import { inTauri } from "../platform";
import { codesEinmaligAufraeumen } from "./codesaetze";

export async function ablageAbgleichen(nurTest = false): Promise<void> {
  if (!inTauri() && !nurTest) return;
  try {
    await ablageBasis();
    await codesEinmaligAufraeumen();
  } catch (e) {
    console.warn("Ablage", e);
  }
}
