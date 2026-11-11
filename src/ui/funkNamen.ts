/** Funkrufnamen für die Spracherkennung: Hinweis (wie gesprochen) und Nachbearbeitung mit den Fahrzeugen im Spiel */
import { sim } from "../sim/engine";
import { store } from "../data/store";
import { funkSprechform, funkTextGlaetten } from "../sim/funkErkennung";
import { orteImText } from "./ortNamen";

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
  return orteImText(funkTextGlaetten(t, funkNamenAlle(), funkNamenAktiv()));
}

/**
 * Hinweis für die Spracherkennung (Whisper liest ihn als „gerade Gesagtes“ und übernimmt Wortwahl und Schreibweisen):
 * ein kurzes, ausgewogenes Beispiel-Funkgespräch in ganzen Sätzen – mit den Rufnamen, die gerade zählen (wer funkt,
 * Fahrzeuge der laufenden Einsätze, Spieler-Hubschrauber), Orten und Krankenhäusern der Einsätze. Keine echten früheren
 * Funksprüche (die prägen das Thema vor, z. B. „Storno“) und keine langen Ziffernlisten (die führen zu Erfindungen).
 * extra: weitere Namen, die vorkommen sollen (Piloten-Hubschrauber).
 */
export function funkHinweis(extra = ""): string {
  const name = (id: string) => {
    const f = sim.state.fahrzeuge[id];
    return f ? funkSprechform(sim.rufname(f)) : "";
  };
  // 1. wer gerade funkt bzw. gerufen wird, 2. Fahrzeuge laufender Einsätze (unterwegs, vor Ort), 3. Spieler-Hubschrauber
  const wichtig: string[] = [];
  const dazu = (n: string) => {
    if (n && !wichtig.includes(n)) wichtig.push(n);
  };
  const gespr = (sim.state.funkGespraeche ?? []).filter((g) => g.status !== "ende").sort((a, b) => (b.echtLetzt ?? 0) - (a.echtLetzt ?? 0));
  for (const g of gespr) {
    dazu(name(g.fzId));
    if (g.an?.fzId) dazu(name(g.an.fzId));
  }
  for (const f of Object.values(sim.state.fahrzeuge)) if (f.pilot) dazu(funkSprechform(sim.rufname(f)));
  const laufend = sim.state.einsaetze.filter((e) => e.zustand !== "abgeschlossen").slice(0, 12);
  for (const e of laufend) for (const id of e.fahrzeuge ?? []) dazu(name(id));
  for (const n of extra.split(/[,.]\s*/).map((x) => x.trim()).filter((x) => x && !/^(Landeplatz|Einsatzort|Patient)$/i.test(x))) dazu(n);
  const n = (i: number, ersatz: string) => wichtig[i] ?? ersatz;
  // Orte und Krankenhäuser der laufenden Einsätze
  const orte: string[] = [];
  for (const e of laufend) {
    const o = e.adresse?.label?.split(",").pop()?.replace(/^\s*\d{4}\s+/, "").trim();
    if (o && !orte.includes(o)) orte.push(o);
  }
  const khs: string[] = [];
  for (const e of laufend) {
    const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
    const k = h?.kurzname || h?.name;
    if (k && !khs.includes(k)) khs.push(k);
  }
  const ort = (i: number, ersatz: string) => orte[i] ?? ersatz;
  const kh = khs[0] ?? "UK Krems";
  const gruppe = sim.sprechgruppeName(null);
  const saetze = [
    `Funkverkehr Rettungsdienst Niederösterreich, Sprechgruppe ${gruppe}.`,
    `${n(0, "75 1")} von LEO, kommen. Hier ${n(0, "75 1")}, kommen.`,
    `Hier LEO, ${n(1, "NEF Tulln")} ist ab Wache mit einer Eintreffzeit von 12 Minuten zu euch alarmiert, kommen.`,
    `Hier ${n(0, "75 1")}, verstanden, warten auf ${n(1, "NEF Tulln")}, kommen.`,
    `LEO von ${n(2, "56 6")}, kommen. Hier LEO, kommen.`,
    `Hier ${n(2, "56 6")} mit einer Lagemeldung, ein Patient, wach, Atmung normal, benötigen Notarzt, kommen.`,
    `Hier LEO, Notarzt kommt, Rendezvous in ${ort(0, "Krems")}, kommen.`,
    `Hier ${n(3, "C 2")}, Patient übernommen, Transport ins ${kh}, Voranmeldung Schockraum, kommen.`,
    `Hier LEO, Storno für euren Einsatz, rückt ein, kommen.`,
    `Wo seid ihr gerade, wie lange noch bis ${ort(1, "Tulln")}? Hier LEO, verstanden, Ende.`,
  ];
  let t = saetze.join(" ");
  // weitere Rufnamen nur als kurze Zeile davor (höchstens 600 Zeichen insgesamt, das Ende zählt am meisten)
  const weitere = wichtig.slice(4, 14).join(", ");
  if (weitere && weitere.length + t.length + 2 < 600) t = `${weitere}. ${t}`;
  return t.slice(-600);
}
