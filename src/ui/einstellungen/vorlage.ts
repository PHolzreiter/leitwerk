/**
 * Vorlage der Einstellungsseiten (gemeinsam für Hauptmenü und Spielmenü):
 * seiten.html (Reiter, Suche, Seitenliste, Zeilen) mit den eigenen Bausteinen aus zusatz.html.
 */
import seiten from "./seiten.html?raw";
import zusatz from "./zusatz.html?raw";
import css from "./seiten.css?raw";

export const seitenVorlage = seiten.replace("<!--ZUSATZZEILEN-->", zusatz);
export const seitenCss = css;

/** Platzhalter <!--EINSTELLUNGSSEITEN--> in einer Vorlage ersetzen */
export function mitSeiten(vorlage: string): string {
  return vorlage.replace("<!--EINSTELLUNGSSEITEN-->", seitenVorlage);
}
