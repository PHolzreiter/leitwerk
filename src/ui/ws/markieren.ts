/**
 * Gegenseitiges Markieren beim Darüberfahren (Einsatzliste ↔ Fahrzeuge):
 * Fährt die Maus über ein Fahrzeug-Kastl in der Einsatzliste, wird die Zeile des Fahrzeugs in der Fahrzeugliste
 * markiert; fährt sie in der Fahrzeugliste über einen Code, wird die Zeile des Einsatzes in der Einsatzliste markiert.
 * Erst nach ca. 150 ms Stillstand (beim Drüberwischen passiert nichts), immer nur eine Zeile, und die Listen schalten
 * nur eine Klasse um (kein Neuaufbau). Gilt auch über Programmfenster hinweg (Fenster-Bus).
 */
import { bus } from "./bus";

export type MarkArt = "fahrzeug" | "einsatz";
type Hoerer = (id: string | null) => void;

const hoerer: Record<MarkArt, Set<Hoerer>> = { fahrzeug: new Set(), einsatz: new Set() };
const jetzt: Record<MarkArt, string | null> = { fahrzeug: null, einsatz: null };

function melden(art: MarkArt, id: string | null): void {
  if (jetzt[art] === id) return;
  jetzt[art] = id;
  for (const fn of hoerer[art]) fn(id);
}

/** Zeile markieren (null = Markierung weg) */
export function markiere(art: MarkArt, id: string | null): void {
  if (jetzt[art] === id) return;
  melden(art, id);
  bus.senden({ t: "markiere", art, id });
}

/** gerade markierte Zeile (z. B. nach einem Neuaufbau wieder setzen) */
export function markiert(art: MarkArt): string | null {
  return jetzt[art];
}

export function onMarkiert(art: MarkArt, fn: Hoerer): () => void {
  hoerer[art].add(fn);
  return () => hoerer[art].delete(fn);
}

bus.empfangen((m) => {
  if (m.t === "markiere" && (m.art === "fahrzeug" || m.art === "einsatz")) melden(m.art, (m.id as string | null) ?? null);
});

/**
 * Darüberfahren in einem Bereich beobachten: Elemente mit dem Attribut `attr` (z. B. data-fz) melden ihren Wert
 * nach `ms` Stillstand; beim Verlassen wird die Markierung gelöscht.
 */
export function hoverMarkieren(wurzel: HTMLElement, attr: string, art: MarkArt, ms = 150): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ziel: string | null = null;
  const finde = (t: EventTarget | null): string | null => {
    const el = t instanceof Element ? t.closest<HTMLElement>(`[${attr}]`) : null;
    return el && wurzel.contains(el) ? el.getAttribute(attr) || null : null;
  };
  const bewegt = (ev: MouseEvent) => {
    const id = finde(ev.target);
    if (timer) clearTimeout(timer);
    timer = null;
    if (!id) {
      if (ziel) markiere(art, null);
      ziel = null;
      return;
    }
    if (id === ziel) return;
    if (ziel) markiere(art, null);
    ziel = null;
    timer = setTimeout(() => {
      ziel = id;
      markiere(art, id);
    }, ms);
  };
  const raus = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (ziel) markiere(art, null);
    ziel = null;
  };
  wurzel.addEventListener("mousemove", bewegt);
  wurzel.addEventListener("mouseleave", raus);
  return () => {
    raus();
    wurzel.removeEventListener("mousemove", bewegt);
    wurzel.removeEventListener("mouseleave", raus);
  };
}
