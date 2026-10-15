/** Klingeln und Funk-Piep – die Töne selbst kommen aus den persönlichen Sound-Einstellungen (sounds.ts). */
import { kiPrefs } from "../abfrage/ki";
import { dauerton } from "./sounds";

/** Klingeln an/aus – wird regelmäßig mit dem aktuellen Zustand aufgerufen */
export function klingeltonAktualisieren(notrufKlingelt: boolean, ktKlingelt = false): void {
  const p = kiPrefs().klingelton;
  dauerton("notruf", notrufKlingelt && p);
  dauerton("kt", ktKlingelt && p, 1500);
}

/** Funk-Piep, solange ein Fahrzeug LEO ruft (dringend: eigener Ton) */
export function funkPiepAktualisieren(ruft: boolean, dringend = false): void {
  const an = ruft && kiPrefs().klingelton;
  dauerton("funkDringend", an && dringend);
  dauerton("funk", an && !dringend);
}
