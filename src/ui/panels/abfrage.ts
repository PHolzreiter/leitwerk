/**
 * Abfrage-Fenster: Anrufleiste | Gespräch | Abfrage-Schema – gebaut nach dem Entwurf (src/ui/fenster/abfrage).
 * Hier nur die Anmeldung beim Arbeitsplatz.
 */
import { abfrageFenster } from "../fenster/abfrage";
import { registriere } from "../ws/arbeitsplatz";

registriere({
  komponente: "abfrage",
  titel: "Abfrage",
  info: "Anrufe abheben, Gespräch mit dem Anrufer, Abfrage Frage für Frage, Hinweise für die Besatzung",
  bereich: "rechts",
  einmalig: true,
  erstellen: abfrageFenster,
});
