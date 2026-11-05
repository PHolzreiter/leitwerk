/**
 * Funk mit Cloud-Stimmen (Gemini):
 * - Jedes Fahrzeug bekommt zu Schichtbeginn eine Stimme; beim Schichtwechsel (neues Team) eine neue.
 *   RTW, NEF und Hubschrauber in der Nähe bekommen verschiedene Stimmen, damit sie nicht wie dieselbe Person klingen.
 * - Den Inhalt bestimmt das Programm; Gemini formuliert ihn (Lagemeldung, Antworten …) und spricht ihn mit der Fahrzeugstimme.
 *   Feste Sprüche („Hier 75/001, kommen“) spricht Gemini wörtlich.
 * - Gesprochen wird beim Gesprächsführer; der Ton geht wie Sprechfunk an alle Mitspieler.
 * - Gemini schreibt den Funk der Leitstelle mit (Funktaste und Sprechfunk), wenn Gemini gewählt ist.
 * - Fällt Gemini aus, liest die Stimme hier vor (jedes Fahrzeug etwas anders) – wie bisher.
 */
import { funkLiveAuftrag, funkLiveHaken, funkLivePruefen } from "../abfrage/funkKi";
import { kiPrefs } from "../abfrage/ki";
import { FUNK_STIMMEN, liveAktiv, liveFunkSprechen, liveFunkVerstehen, liveMitschrift, livePrefs } from "../abfrage/liveKi";
import { mp } from "../net/mehrspieler";
import { sim, type FunkAusstehend, type FunkGespraech, type SimFahrzeug } from "../sim/engine";
import { distanceM } from "../sim/geo";
import { inTauri } from "../platform";
import { funkAussprache, funkHoerHaken, funkVorleseHaken, sprachPrefs, sprachStatus } from "./sprache";
import { funkGlaetten, funkNamenAlle } from "./funkNamen";
import { rufnamenAlsWorte } from "../sim/funkErkennung";
import { orteJetzt } from "./ortNamen";
import { funkAngekuendigt, kiFunkAnkuendigen, kiFunkStrom } from "./sprechfunk";

// ------------------------------------------------------------------ Stimmen der Fahrzeuge

/** RTW, NEF, Hubschrauber: funken oft – Nachbarn sollen sich unterscheiden */
function wichtig(f: SimFahrzeug): boolean {
  return f.kategorie === "RTW" || f.kategorie === "NEF" || f.kategorie === "NAH" || /^(NAH|ITH|NAW)$/i.test(f.rmTyp);
}
/** so nah = „in der Nähe“ (Dienststellen) */
const NAHE_M = 30_000;

function h32(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const zuteilung = new Map<string, { schicht: string; stimme: string }>();

function zuteilen(fz: SimFahrzeug): string {
  const schicht = fz.schicht ?? "-";
  const reihe = [...FUNK_STIMMEN].sort((a, b) => h32(`${fz.id}|${schicht}|${a}`) - h32(`${fz.id}|${schicht}|${b}`));
  let stimme = reihe[0];
  if (wichtig(fz)) {
    const belegt = new Set<string>();
    for (const f of Object.values(sim.state.fahrzeuge)) {
      if (f.id === fz.id || !wichtig(f)) continue;
      const z = zuteilung.get(f.id);
      if (z && distanceM(f.heim, fz.heim) < NAHE_M) belegt.add(z.stimme);
    }
    stimme = reihe.find((v) => !belegt.has(v)) ?? reihe[0];
  }
  zuteilung.set(fz.id, { schicht, stimme });
  return stimme;
}

/** Stimme des Fahrzeugs in dieser Schicht */
export function funkStimme(fzId: string): string {
  const fz = sim.state.fahrzeuge[fzId];
  if (!fz) return FUNK_STIMMEN[h32(fzId) % FUNK_STIMMEN.length];
  const z = zuteilung.get(fzId);
  if (z && z.schicht === (fz.schicht ?? "-")) return z.stimme;
  // erstes Mal: alle wichtigen der Reihe nach (gleiches Ergebnis bei allen Mitspielern)
  if (!zuteilung.size)
    for (const f of Object.values(sim.state.fahrzeuge)
      .filter(wichtig)
      .sort((a, b) => (a.id < b.id ? -1 : 1)))
      zuteilen(f);
  const neu = zuteilung.get(fzId);
  if (neu && neu.schicht === (fz.schicht ?? "-")) return neu.stimme;
  return zuteilen(fz);
}

/** Fahrzeug zum Funkrufnamen eines Spruchs */
function fahrzeugVon(von: string, g: { fzId: string; an?: { fzId: string } | null }): SimFahrzeug | undefined {
  for (const id of [g.fzId, g.an?.fzId]) {
    const f = id ? sim.state.fahrzeuge[id] : undefined;
    if (f && (sim.rufname(f) === von || f.funkrufname === von)) return f;
  }
  return Object.values(sim.state.fahrzeuge).find((f) => sim.rufname(f) === von || f.funkrufname === von);
}

// ------------------------------------------------------------------ Sprechen

/** Funk ist ein Kanal: ein Spruch nach dem anderen */
let kette: Promise<unknown> = Promise.resolve();

function ichSpreche(g: { fuehrer: { pid: string } | null }): boolean {
  if (sim.mode === "solo") return true;
  const ich = sim.ich?.pid ?? mp.ich.pid;
  return g.fuehrer ? g.fuehrer.pid === ich : sim.mode === "host";
}

function stimmeAn(): boolean {
  return liveAktiv();
}

/** Anweisung für wörtliches Sprechen (der Text kommt zwischen « und ») */
function woertlich(von: string): string {
  return `Du bist am Funk des Rettungsdienstes in Niederösterreich die Stimme von „${rufnamenAlsWorte(von)}“. Du liest Funksprüche vor: Du sprichst GENAU die Worte zwischen den Zeichen « und », Wort für Wort – nichts weglassen, nichts hinzufügen, nichts umstellen, nichts beantworten. Zügig, sachlich und ruhig wie eine erfahrene Besatzung, Deutsch mit österreichischer Färbung.`;
}
const zitat = (t: string) => `«${funkAussprache(rufnamenAlsWorte(t))}»`;

/** Spruch mit Cloud-Stimme sprechen und an alle schicken; onStart: der erste Ton ist da */
async function sprechen(gId: number, von: string, fzId: string, system: string, text: string, onStart?: () => void): Promise<{ text: string; fertig: () => void }> {
  const strom = kiFunkStrom({ von, gId });
  let rest = 0;
  try {
    const stimme = funkStimme(fzId);
    const r = await liveFunkSprechen({ stimme, system, text, onTon: (d, rate) => strom.pcm(d, rate), onStart });
    console.info(`[Funk-Stimme] ${von} (${stimme}): erster Ton nach ${r.ersterTon} ms, fertig nach ${r.fertig} ms – ${r.text}`);
    rest = strom.ende();
    // sobald die Stimme hier fertig abgespielt ist (mit Ende-Ton), ist der Kanal frei
    return { text: r.text, fertig: () => setTimeout(() => void sim.call("funkFzFertig", gId).catch(() => undefined), rest) };
  } catch (e) {
    strom.ende();
    throw e;
  }
}

/** Ausstehender Funkspruch (Inhalt vom Programm): Gemini formuliert und spricht ihn */
async function ausstehendSprechen(g: FunkGespraech, a: FunkAusstehend): Promise<boolean> {
  if (!stimmeAn()) return false;
  const fz = fahrzeugVon(a.von, g);
  if (!fz) return false;
  const frei = kiPrefs().funk !== "fest";
  const auftrag = frei ? funkLiveAuftrag(g, a) : { system: woertlich(a.von), text: zitat(a.fest) };
  // nicht nach der Wartezeit den festen Text nehmen, solange die Stimme vorbereitet wird
  void sim.call("funkFzSpricht", g.id).catch(() => undefined);
  const lauf = kette.then(async () => {
    // inzwischen schon gesagt (z. B. fester Text nach der Wartezeit)?
    if (!sim.state.funkGespraeche?.find((x) => x.id === g.id)?.ausstehend) return true;
    let gesagt = "";
    let fertig = () => undefined as unknown;
    try {
      const r = await sprechen(g.id, a.von, fz.id, auftrag.system, auftrag.text, () => void sim.call("funkFzSpricht", g.id).catch(() => undefined));
      gesagt = r.text;
      fertig = r.fertig;
    } catch (e) {
      console.warn("Funk-Stimme", e);
      return false;
    }
    if (!frei || !gesagt) gesagt = a.fest;
    // Mitschrift der Stimme: Zahlen als Ziffern, Rufnamen richtig geschrieben („75 1“ → „75/001“)
    else gesagt = funkGlaetten(gesagt);
    if (frei) {
      const p = funkLivePruefen(g, a, gesagt);
      if (p.length) console.info(`[Funk-Stimme] ${a.von}: ${p.join("; ")} – gesagt: ${gesagt}`);
    }
    await sim.call("funkFzAntwort", g.id, gesagt, frei ? "ki" : "fest", true);
    fertig();
    return true;
  });
  kette = lauf.catch(() => undefined);
  return lauf;
}

/** Fester Spruch eines Fahrzeugs ist im Funk erschienen: true = wird mit Cloud-Stimme gesprochen (hier oder von einem Mitspieler) */
async function vorlesenNehmen(g: { id: number; fzId: string; an?: { fzId: string } | null; fuehrer: { pid: string } | null }, i: number, s: { von: string; text: string }): Promise<boolean> {
  if (s.von === "LEO") return false;
  const fz = fahrzeugVon(s.von, g);
  // Spieler-Hubschrauber spricht selbst
  if (!fz || fz.pilot) return false;
  if (ichSpreche(g) && stimmeAn()) {
    kiFunkAnkuendigen(g.id, i);
    const lauf = kette.then(async () => {
      try {
        const r = await sprechen(g.id, s.von, fz.id, woertlich(s.von), zitat(s.text), () => void sim.call("funkFzSpricht", g.id).catch(() => undefined));
        r.fertig();
        return true;
      } catch (e) {
        console.warn("Funk-Stimme", e);
        return false;
      }
    });
    kette = lauf.catch(() => undefined);
    return lauf;
  }
  // Mitspieler: kündigt der Gesprächsführer die Stimme an?
  if (sim.mode === "solo" || ichSpreche(g)) return false;
  for (let t = 0; t < 8; t++) {
    if (funkAngekuendigt(g.id, i)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

let gestartet = false;
export function funkStimmenStarten(): void {
  if (gestartet) return;
  gestartet = true;
  funkLiveHaken.erzeugen = ausstehendSprechen;
  funkVorleseHaken.nimm = vorlesenNehmen;
  // Stimme hier (ohne Gemini): wer das Gespräch führt, meldet Beginn und Ende – dann ist der Kanal gleich frei
  funkVorleseHaken.beginn = (g) => {
    if (ichSpreche(g)) void sim.call("funkFzSpricht", g.id).catch(() => undefined);
  };
  funkVorleseHaken.fertig = (g) => {
    if (ichSpreche(g)) void sim.call("funkFzFertig", g.id).catch(() => undefined);
  };
  // Mitschrift über Gemini nur, wenn hier kein Sprachmodell geladen ist (die Erkennung hier kennt die Funkrufnamen besser)
  funkHoerHaken.strom = () => {
    // Test: Gemini versteht den Funk (kennt Fahrzeuge und Gespräch) – auch wenn hier ein Sprachmodell geladen ist
    if (livePrefs().funkVersteher && stimmeAn()) {
      const g = (sim.state.funkGespraeche ?? []).filter((x) => x.status !== "ende" && !x.an).sort((a, b) => (b.echtLetzt ?? 0) - (a.echtLetzt ?? 0))[0];
      const v = liveFunkVerstehen({ fahrzeuge: [...new Set(funkNamenAlle())], partner: g?.funkname, zuletzt: g?.sprueche.slice(-2).map((x) => `${x.von}: ${x.text}`), orte: orteJetzt() });
      if (v) return v;
    }
    if (!stimmeAn() || modellHier) return null;
    const m = liveMitschrift();
    if (!m) return null;
    return m;
  };
  const pruefen = () => {
    if (!inTauri()) return;
    void sprachStatus()
      .then((st) => (modellHier = st.modelle.includes(sprachPrefs().modell)))
      .catch(() => undefined);
  };
  pruefen();
  setInterval(pruefen, 30_000);
}
let modellHier = false;
