/**
 * Prüfprogramm für den Fallkatalog: Ist jeder Fall in sich stimmig und mit dem geladenen
 * Abfrageschema spielbar? (läuft in den Tests und in den Einstellungen → Daten)
 */
import { buchung } from "../data/klinik";
import { FAELLE, type FallVariante, type FallVorlage } from "./faelle";
import { bestimmeCode, fragenImAblauf, type Antworten, type Schema } from "./schema";
import { vorlageFest } from "./szenario";
import { kapitelZuThema, merkmaleInSchema } from "./themen";

export interface FallBefund {
  fall: string;
  variante?: string;
  fehler: string;
}

/** Zustände, die sich widersprechen */
function widerspruch(a: Antworten): string | null {
  if (a.bw === "ja" && (a.at === "keine" || a.at === "agonal")) return "wach, aber atmet nicht bzw. Schnappatmung";
  if (a.bw === "nein" && a.sprachschw === "nein" && a.at !== "unbekannt") return "bewusstlos, aber kann ganze Sätze sprechen";
  return null;
}

function varianteSoll(f: FallVorlage, v: FallVariante, out: FallBefund[]): void {
  const add = (fehler: string) => out.push({ fall: f.id, variante: v.id, fehler });
  if (!buchung(v.buchung)) add(`Buchung „${v.buchung}“ gibt es nicht`);
  for (const ev of v.verlauf ?? []) {
    if (ev.wechselZu && !f.varianten.some((x) => x.id === ev.wechselZu)) add(`Wechsel zu unbekannter Variante „${ev.wechselZu}“`);
    if (ev.nachMin[0] > ev.nachMin[1]) add("Zeitfenster verkehrt");
  }
  if (!v.lage) add("Lagebild fehlt");
}

/** Alle Fälle prüfen; mit Schema auch: Kapitel vorhanden, Code ergibt sich, jede Abfragefrage beantwortbar */
export function faellePruefen(schema: Schema | null): FallBefund[] {
  const out: FallBefund[] = [];
  const ids = new Set<string>();
  for (const f of FAELLE) {
    if (ids.has(f.id)) out.push({ fall: f.id, fehler: "doppelte ID" });
    ids.add(f.id);
    const summe = f.varianten.reduce((s, v) => s + v.p, 0);
    if (Math.abs(summe - 1) > 0.001) out.push({ fall: f.id, fehler: `Wahrscheinlichkeiten ergeben ${Math.round(summe * 100)} % statt 100 %` });
    for (const v of f.varianten) {
      varianteSoll(f, v, out);
      if (!schema || v.p === 0) continue;
      const kap = kapitelZuThema(f.thema, schema);
      if (!kap) {
        out.push({ fall: f.id, fehler: `kein Kapitel zum Thema „${f.thema}“` });
        break;
      }
      // mehrere Ziehungen, weil feste Antworten Listen sein können
      for (let i = 0; i < 6; i++) {
        const a: Antworten = { ...vorlageFest(f, Math.random), ...(v.fest ?? {}) };
        const w = widerspruch(a);
        if (w) out.push({ fall: f.id, variante: v.id, fehler: `Widerspruch: ${w}` });
        const ant = merkmaleInSchema(schema, a);
        const erg = bestimmeCode(schema, kap, ant);
        if (!erg || !schema.codes[erg.code]) {
          out.push({ fall: f.id, variante: v.id, fehler: "kein Code aus den Antworten" });
          break;
        }
        for (const { frage } of fragenImAblauf(schema, kap, ant)) {
          if (frage.typ === "text" || frage.typ === "kapitelwahl") continue;
          if (["alter", "geschlecht", "anzahl_patienten", "bw", "at"].includes(frage.id) && ant[frage.id] !== undefined) continue;
          if (ant[frage.id] === undefined) {
            const msg = `Frage „${frage.id}“ (${frage.text}) hat keine Antwort`;
            if (!out.some((x) => x.fall === f.id && x.variante === v.id && x.fehler === msg)) out.push({ fall: f.id, variante: v.id, fehler: msg });
          }
        }
      }
    }
  }
  return out;
}
