/** Funkrufnamen für die Spracherkennung: Hinweis (wie gesprochen) und Nachbearbeitung mit den Fahrzeugen im Spiel */
import { sim } from "../sim/engine";
import { funkSprechform, funkTextGlaetten } from "../sim/funkErkennung";

/** alle Funkrufnamen und Rufnamen („75/001“, „NEF Krems“, „C2“) */
export function funkNamenAlle(): string[] {
  return Object.values(sim.state.fahrzeuge).flatMap((f) => [f.funkrufname, sim.rufname(f)]);
}

/** Fahrzeuge, die gerade funken oder mit denen gerade gefunkt wird */
export function funkNamenAktiv(): string[] {
  const ids = new Set<string>();
  for (const g of sim.state.funkGespraeche ?? []) {
    if (g.status === "ende") continue;
    ids.add(g.fzId);
    if (g.an?.fzId) ids.add(g.an.fzId);
  }
  return [...ids].flatMap((id) => {
    const f = sim.state.fahrzeuge[id];
    return f ? [f.funkrufname, sim.rufname(f)] : [];
  });
}

/** gesprochenen Funk richtigstellen (Zahlen, Rufnamen, „Leo“ → „LEO“) */
export function funkGlaetten(t: string): string {
  return funkTextGlaetten(t, funkNamenAlle(), funkNamenAktiv());
}

/**
 * Hinweis für die Spracherkennung: so, wie gesprochen wird („75 1 von LEO, kommen“).
 * Die Erkennung beachtet vor allem das Ende des Hinweises (und höchstens 600 Zeichen) –
 * deshalb stehen die gerade funkenden Fahrzeuge zuletzt.
 */
export function funkHinweis(extra = ""): string {
  const aktiv = [...new Set(funkNamenAktiv().map(funkSprechform))];
  // unterwegs vor frei auf der Wache (die funken mehr), abgemeldete gar nicht
  const alle = Object.values(sim.state.fahrzeuge).filter((f) => f.status !== "abgemeldet");
  const rest = [...new Set([...alle.filter((f) => f.status !== "freiWache"), ...alle.filter((f) => f.status === "freiWache")].map((f) => funkSprechform(sim.rufname(f))))].filter((n) => !aktiv.includes(n));
  const beispiel = aktiv[0] ?? "75 1";
  const schluss = `${extra}${aktiv.join(", ")}${aktiv.length ? ". " : ""}${beispiel} von LEO, kommen. Hier LEO, kommen. Verstanden, Ende.`;
  let vorne = `${rest.join(", ")}. `;
  const platz = 600 - schluss.length;
  if (vorne.length > platz) vorne = vorne.slice(vorne.length - Math.max(0, platz)).replace(/^[^,]*,\s*/, "");
  return `${vorne}${schluss}`;
}
