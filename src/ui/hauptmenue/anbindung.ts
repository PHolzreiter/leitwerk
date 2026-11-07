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
import { ablaufBauen } from "./ablauf";
import { einstellungsBindung } from "./bindung";
import type { ZeilenQuelle } from "./vertrag";

export interface Rahmen {
  neuZeichnen(): void;
  schliessen(): void;
}

export type Anbindung = ReturnType<typeof anbindungBauen>;

export function anbindungBauen(r: Rahmen) {
  const aus: (() => void)[] = [];
  const ablauf = ablaufBauen(r.neuZeichnen, r.schliessen);
  const einst = einstellungsBindung(r.neuZeichnen);
  // Seiten mit echten Daten (zeilen.ts) – wird nachgeladen, damit das Menü sofort steht
  let zeilen: ZeilenQuelle | undefined;
  let feldWert: ((k: string, v: unknown) => void) | undefined;
  let zq: { laden(): void; beenden(): void } | undefined;
  return {
    ablauf,
    einst,
    zeilen: ((seite, b) => (zeilen ? zeilen(seite, b) : undefined)) as ZeilenQuelle,
    feldWert: (k: string, v: unknown) => feldWert?.(k, v),
    logoUrl,
    funkgruppenKarte: karte,
    bilder: {
      "21x9-morgen": b21m, "21x9-mittag": b21t, "21x9-abend": b21a, "21x9-nacht": b21n,
      "32x9-morgen": b32m, "32x9-mittag": b32t, "32x9-abend": b32a, "32x9-nacht": b32n,
    } as Record<string, string>,
    starten() {
      ablauf.starten();
      void import("./zeilen").then((m) => {
        const q = m.zeilenQuelle(r.neuZeichnen);
        zeilen = q.zeilen;
        zq = q;
        feldWert = (m as { feldWert?: (k: string, v: unknown) => void }).feldWert;
        q.laden();
        r.neuZeichnen();
      });
    },
    beenden() {
      ablauf.beenden();
      zq?.beenden();
      aus.forEach((f) => f());
    },
    neuZeichnen: r.neuZeichnen,
    schliessen: r.schliessen,
  };
}
