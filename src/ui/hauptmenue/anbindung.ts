/**
 * Anbindung des Hauptmenüs an die App: echte Daten und Aktionen statt der Beispiele im Design.
 * Die Komponente (komponente.js) ruft nur Funktionen dieses Objekts auf.
 */
import logoUrl from "./logo.svg?url";
import karte from "./funkgruppen-karte.json";
import b21m from "./bilder/bg-21x9-morgen.jpg?url";
import b21t from "./bilder/bg-21x9-mittag.jpg?url";
import b21a from "./bilder/bg-21x9-abend.jpg?url";
import b21n from "./bilder/bg-21x9-nacht.jpg?url";
import b32m from "./bilder/bg-32x9-morgen.jpg?url";
import b32t from "./bilder/bg-32x9-mittag.jpg?url";
import b32a from "./bilder/bg-32x9-abend.jpg?url";
import b32n from "./bilder/bg-32x9-nacht.jpg?url";

export interface Rahmen {
  neuZeichnen(): void;
  schliessen(): void;
}

export type Anbindung = ReturnType<typeof anbindungBauen>;

export function anbindungBauen(r: Rahmen) {
  const aus: (() => void)[] = [];
  return {
    logoUrl,
    funkgruppenKarte: karte,
    bilder: {
      "21x9-morgen": b21m, "21x9-mittag": b21t, "21x9-abend": b21a, "21x9-nacht": b21n,
      "32x9-morgen": b32m, "32x9-mittag": b32t, "32x9-abend": b32a, "32x9-nacht": b32n,
    } as Record<string, string>,
    starten() {
      /* Beobachter kommen in den folgenden Abschnitten dazu */
    },
    beenden() {
      aus.forEach((f) => f());
    },
    neuZeichnen: r.neuZeichnen,
    schliessen: r.schliessen,
  };
}
