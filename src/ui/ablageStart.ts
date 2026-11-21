/**
 * Beim Programmstart: Ordner in „Dokumente/LeitWerk“ anlegen.
 * v0.73: einmalig alte importierte Codelisten und Abfrageschemas entfernen (im Programm und als Dateien);
 * eigene Codesätze werden danach nur noch bewusst gewählt (Einstellungen → Einsatzcodes & Abfrage), nicht mehr automatisch geladen.
 */
import { ablageBasis, ablageListe, ablageLesen, ablageSpeichern } from "../net/ablage";
import { inTauri } from "../platform";
import { codesEinmaligAufraeumen } from "./codesaetze";
import { store } from "../data/store";
import { NAMEN_VORLAGE, namenLesen, namenVorlage } from "../data/namen";
import { standardRecords } from "../data/standard";

/** Namens-Ersetzungen: Vorlage im Ordner „Namen“ anlegen, aktive Datei neu einlesen (im Ordner bearbeitet) */
/** Vorlage im Ordner „Namen“ anlegen bzw. auf den neuen Stand bringen (nur, solange rechts nichts eingetragen ist) */
export async function namenVorlageSichern(): Promise<void> {
  const l = await ablageListe("Namen");
  const neu = namenVorlage(standardRecords());
  if (!l.some((d) => d.datei === NAMEN_VORLAGE)) return void (await ablageSpeichern("Namen", NAMEN_VORLAGE, neu));
  const alt = await ablageLesen("Namen", NAMEN_VORLAGE).catch(() => null);
  if (alt !== null && alt !== neu && !namenLesen(alt).length) await ablageSpeichern("Namen", NAMEN_VORLAGE, neu);
}

export async function namenAbgleichen(): Promise<void> {
  await namenVorlageSichern();
  const l = await ablageListe("Namen");
  const datei = store.namenDatei;
  if (!datei || store.inSession || !l.some((d) => d.datei === datei)) return;
  const r = namenLesen(await ablageLesen("Namen", datei));
  if (r.length && JSON.stringify(r) !== JSON.stringify(store.namen)) store.setNamen(r, datei);
}

export async function ablageAbgleichen(nurTest = false): Promise<void> {
  if (!inTauri() && !nurTest) return;
  try {
    await ablageBasis();
    await codesEinmaligAufraeumen();
    await namenAbgleichen().catch((e) => console.warn("Namen", e));
  } catch (e) {
    console.warn("Ablage", e);
  }
}
