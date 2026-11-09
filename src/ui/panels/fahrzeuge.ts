/**
 * Fahrzeuge: „Alle Fahrzeuge“ (nach Dienststelle), „Aktive“ (alle, die nicht frei auf der Wache und nicht abgemeldet sind)
 * und „Statusänderungen“ (wer wann von welchem in welchen Status gewechselt hat).
 * Aussehen und Bedienung aus dem Entwurf – siehe ../fenster/fahrzeuge/.
 * Klick: auf der Karte zeigen und den Auftrag öffnen · Doppelklick: Kamera folgt · Rechtsklick: Status setzen.
 */
import { registriere } from "../ws/arbeitsplatz";
import { fahrzeugeFenster } from "../fenster/fahrzeuge";

export { fzBereich } from "../fenster/fahrzeuge";

registriere({
  komponente: "fahrzeuge",
  titel: "Alle Fahrzeuge",
  info: "Alle Fahrzeuge nach Dienststelle, mit Filter und Suche",
  bereich: "links",
  erstellen: (ctx) => fahrzeugeFenster(ctx, "alle", "Alle Fahrzeuge"),
});

registriere({
  komponente: "aktive",
  titel: "Aktive Fahrzeuge",
  info: "Alle Fahrzeuge, die nicht frei auf der Wache und nicht abgemeldet sind – mit Status und Auftrag",
  bereich: "links",
  erstellen: (ctx) => fahrzeugeFenster(ctx, "aktive", "Aktive Fahrzeuge"),
});

registriere({
  komponente: "statuslog",
  titel: "Statusänderungen",
  info: "Alle Statuswechsel der Fahrzeuge, neueste oben – mit Uhrzeit, Einsatz und Grund",
  bereich: "links",
  erstellen: (ctx) => fahrzeugeFenster(ctx, "log", "Statusänderungen"),
});
