/**
 * Was der Anrufer gerade sagt (KI schreibt Wort für Wort) – für das Abfrage-Fenster,
 * auch wenn es in einem anderen Programmfenster offen ist.
 */
import { bus } from "../ws/bus";

type Hoerer = (id: string, text: string | null) => void;
const hoerer = new Set<Hoerer>();
const aktuell = new Map<string, string>();

export function liveText(id: string): string | null {
  return aktuell.get(id) ?? null;
}

let sendeTimer: number | undefined;
function melden(id: string, text: string | null, senden: boolean): void {
  if (text === null) aktuell.delete(id);
  else aktuell.set(id, text);
  for (const fn of hoerer) fn(id, text);
  if (!senden) return;
  // höchstens ein paar Mal pro Sekunde über den Fenster-Bus
  if (text === null) {
    window.clearTimeout(sendeTimer);
    sendeTimer = undefined;
    bus.senden({ t: "live", id, text: null });
  } else if (sendeTimer === undefined) {
    sendeTimer = window.setTimeout(() => {
      sendeTimer = undefined;
      bus.senden({ t: "live", id, text: aktuell.get(id) ?? null });
    }, 120);
  }
}

/** Sammler für die Wörter einer Antwort */
export function liveSammler(id: string): { onToken(t: string): void; fertig(): void } {
  let text = "";
  return {
    onToken: (t) => {
      text += t;
      melden(id, text, true);
    },
    fertig: () => melden(id, null, true),
  };
}

export function onLive(fn: Hoerer): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

bus.empfangen((m) => {
  if (m.t === "live") melden(String(m.id), (m.text as string | null) ?? null, false);
});
