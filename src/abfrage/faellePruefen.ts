/**
 * Prüfprogramm für den Fallkatalog: Ist jeder Fall in sich stimmig und mit dem geladenen
 * Abfrageschema spielbar? (läuft in den Tests und in den Einstellungen → Daten)
 */
import { buchung } from "../data/klinik";
import { symptom } from "../data/zuweisung";
import { alleFaelle, type AnleitungTyp, type FallVariante, type FallVorlage } from "./faelle";
import { abweichungenVon, BAUSTEINE } from "./anleitungen";
import { bestimmeCode, fragenImAblauf, type Antworten, type Schema } from "./schema";
import { altersPlausibel, sichtUnbekannt, vorlageFest } from "./szenario";
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
  if (v.buchung && !buchung(v.buchung)) add(`Buchung „${v.buchung}“ gibt es nicht`);
  if (!v.buchung && !v.symptom && v.transport !== false) add("weder Symptom noch Buchung – der RTW weiß nicht, wohin");
  // Sichtung und Dringlichkeit müssen zusammenpassen (grün 10, gelb 20, rot 30)
  if (v.dringlichkeit && ((v.sichtung === "rot" && v.dringlichkeit === 10) || (v.sichtung === "gruen" && v.dringlichkeit === 30))) add(`Sichtung ${v.sichtung} passt nicht zur Dringlichkeit ${v.dringlichkeit}`);
  if (f.spezial && v.transport !== false) add("besonderer Anruf ohne Notfall, aber mit Transport");
  const fest = { ...(f.fest ?? {}), ...(v.fest ?? {}) } as Record<string, unknown>;
  const schw = fest.schwanger;
  if (f.geschlecht === "m" && (schw === "ja" || (Array.isArray(schw) && schw.includes("ja")))) add("Mann, aber schwanger");
  const sy = symptom(v.symptom);
  if (v.symptom && !sy) add(`Symptom „${v.symptom}“ gibt es nicht`);
  if (sy && v.dringlichkeit && !sy.dringlichkeiten.includes(v.dringlichkeit)) add(`Dringlichkeit ${v.dringlichkeit} gibt es bei „${sy.name}“ nicht`);
  for (const ev of v.verlauf ?? []) {
    if (ev.wechselZu && !f.varianten.some((x) => x.id === ev.wechselZu)) add(`Wechsel zu unbekannter Variante „${ev.wechselZu}“`);
    if (ev.nachMin[0] > ev.nachMin[1]) add("Zeitfenster verkehrt");
  }
  if (!v.lage) add("Lagebild fehlt");
}

/** Abweichungen bei Anleitungen: nur bekannte */
function anleitungSoll(f: FallVorlage, out: FallBefund[]): void {
  for (const [typ, ids] of Object.entries(f.anleitung ?? {})) {
    const bekannt = new Set(abweichungenVon(typ as AnleitungTyp).map(([id]) => id));
    if (!BAUSTEINE[typ as AnleitungTyp]) {
      out.push({ fall: f.id, fehler: `Anleitung „${typ}“ gibt es nicht` });
      continue;
    }
    for (const x of ids ?? []) {
      const id = x.replace(/^\[[^\]]*\]\s*/, "");
      if (!bekannt.has(id)) out.push({ fall: f.id, fehler: `Abweichung „${id}“ gibt es bei „${typ}“ nicht` });
    }
  }
}

/** Alle Fälle prüfen; mit Schema auch: Kapitel vorhanden, Code ergibt sich, jede Abfragefrage beantwortbar */
export function faellePruefen(schema: Schema | null, liste: FallVorlage[] = alleFaelle(true)): FallBefund[] {
  const out: FallBefund[] = [];
  const ids = new Set<string>();
  for (const f of liste) {
    if (ids.has(f.id)) out.push({ fall: f.id, fehler: "doppelte ID" });
    ids.add(f.id);
    out.push(...fallPruefen(f, schema));
  }
  return out;
}

/** Einen Fall prüfen (auch im Editor, live) */
export function fallPruefen(f: FallVorlage, schema: Schema | null): FallBefund[] {
  const out: FallBefund[] = [];
  anleitungSoll(f, out);
  {
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
      altersPlausibel({ alter: f.alter, fest: { ...(f.fest ?? {}), ...(v.fest ?? {}) }, anrufer: f.anrufer }, a, Math.random);
      sichtUnbekannt(schema, kap, f.ohneSicht, a);
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
  return out.filter((b, i) => out.findIndex((x) => x.variante === b.variante && x.fehler === b.fehler) === i);
}

// ------------------------------------------------------------------ Texte auf Widersprüche prüfen

/** Bedingung „[variante=B,ort=wohnung]“ → { variante: ["B"], ort: [...] } (mit „!“ = nicht) */
function bedingungen(t: string): { key: string; nicht: boolean; werte: string[] }[] {
  const m = t.match(/^\[([^\]]*)\]/);
  if (!m) return [];
  return m[1].split(",").map((teil) => {
    const [id, w = ""] = teil.split("=").map((x) => x.trim());
    return { key: id.replace(/!$/, ""), nicht: id.endsWith("!"), werte: w.split("|").map((x) => x.trim()) };
  });
}

/** gilt der Text (auch) in diesem Ausgang? */
function giltIn(t: string, varId: string): boolean {
  return bedingungen(t).every((b) => b.key !== "variante" || (b.werte.includes(varId) !== b.nicht));
}

const ohneKlammer = (t: string) => t.replace(/^\[[^\]]*\]\s*/, "").toLowerCase();

/** Gegensatzpaare: kommt beides im selben Ausgang vor, widerspricht sich der Fall */
const GEGENSATZ: [RegExp, RegExp, string][] = [
  [/\b(blass|bleich|grau im gesicht|ganz grau|weiß im gesicht|kreidebleich)/, /\b(rot im gesicht|hochrot|rosig|normale farbe)/, "blass und zugleich rot/normal im Gesicht"],
  [/\b(schwitzt|verschwitzt|nass geschwitzt|klatschnass|kaltschwei)/, /\b(schwitzt nicht|trocken(e)? haut)/, "schwitzt und schwitzt nicht"],
  [/\b(spritzt|blutet (ganz )?stark|blutet wie verrückt|alles voller blut)/, /\b(blutet (nur )?(ein bisschen|leicht|kaum)|spritzt nicht|kaum blut)/, "starke und schwache Blutung"],
  [/\b(bewusstlos|reagiert (gar )?nicht|rührt sich nicht|nicht wach zu kriegen|krieg (ihn|sie) nicht wach)/, /\b(redet|erzählt|sagt,|antwortet|jammert|klagt)/, "reagiert nicht, redet aber"],
  [/\b(atmet nicht|keine atmung)/, /\b(atmet (ganz )?normal|atmet ruhig)/, "atmet nicht und atmet normal"],
  [/\b(in der kurve)/, /\b(gerade(n)? strecke)/, "Kurve und gerade Strecke"],
];

const ZEIT = /\b(seit (ungefähr |etwa |circa |ca\. )?(einer|zwei|drei|\d+|zehn|zwanzig|dreißig|einer halben|einer viertel) ?(minute|minuten|stunde|stunden|viertelstunde)|vor (ungefähr |etwa )?(einer|zwei|drei|\d+|zehn|zwanzig|einer halben) ?(minute|minuten|stunde|stunden)|um \d{1,2}(:\d\d)? uhr)/;
const REDEN = /\b(sagt|redet|erzählt|antwortet|jammert|klagt|fragt|schreit|ruft)\b/;
const SICHT = /\b(blass|bleich|blau|grau im gesicht|schwitzt|atmet|röchelt|lippen)\b/;
const BEKANNTE_KEYS = new Set(["variante", "ort", "selbst", "wissen", "anrufer", "anrufer_typ"]);

/**
 * Weiche Prüfung der Texte (Hinweise für den Fall-Editor): Widersprüche innerhalb eines Ausgangs,
 * Zeitangaben außerhalb von „seit wann“, Reden trotz Bewusstlosigkeit, Befunde trotz „sieht ihn nicht“,
 * Ausgänge, die sich im Gespräch nicht unterscheiden.
 */
export function fallHinweise(f: FallVorlage): FallBefund[] {
  const out: FallBefund[] = [];
  const add = (fehler: string, variante?: string) => {
    if (!out.some((x) => x.fehler === fehler && x.variante === variante)) out.push({ fall: f.id, variante, fehler });
  };
  const fakten = [...(f.geschehen ?? []), ...(f.details ?? [])].filter((t) => t.trim());
  const alleTexte = [...fakten, ...f.hergang, ...(f.hergangIch ?? []), ...f.stelle, ...(f.verlauf ?? [])];
  const ids = new Set(f.varianten.map((v) => v.id));
  for (const t of alleTexte) {
    for (const b of bedingungen(t)) {
      if (!BEKANNTE_KEYS.has(b.key) && !/^[a-z_0-9]+$/.test(b.key)) add(`unbekannte Bedingung „[${b.key}…]“ in „${t.slice(0, 50)}…“`);
      if (b.key === "variante") for (const w of b.werte) if (!ids.has(w)) add(`Bedingung nennt den Ausgang „${w}“, den es nicht gibt`);
    }
  }
  // Anrufer passen zum Alter?
  const [amin, amax] = f.alter;
  if (f.anrufer.includes("eltern") && amin >= 45) add("Eltern als Anrufer, aber der Patient ist mindestens 45");
  if (f.anrufer.includes("kind") && amax < 30) add("Sohn/Tochter als Anrufer, aber der Patient ist höchstens 30");
  if (f.anrufer.includes("lehrer") && amin >= 20) add("Lehrer/in als Anrufer, aber der Patient ist erwachsen");
  if (f.orte.some((o) => o === "schule") && f.tageszeit === "nacht") add("Schule, aber nur nachts");
  // Wissensstufen: nur Antworten, die der Fall auch kennt
  const bekannt = new Set([...Object.keys(f.fest ?? {}), ...f.varianten.flatMap((v) => Object.keys(v.fest ?? {})), ...Object.keys(f.extra ?? {}), "seit", "alter", "geschlecht"]);
  for (const x of [...(f.wissen?.ungefaehr ?? []), ...(f.wissen?.unbekannt ?? [])]) {
    const id = ohneKlammer(x);
    if (!bekannt.has(id) && !/^(diabetiker|epilepsie|herz_vg|herzleiden|blutverduenner|vg_schlaganfall|vg_tia|psych_vorerkrankung|aneurysma|bluter|lungenerkrankung|drogen_12h|drogen_welche|kokain|aelter6h)$/.test(id)) add(`Wissensstufe für „${id}“, aber der Fall hat dazu keine Antwort`);
  }
  for (const t of fakten) if (ZEIT.test(ohneKlammer(t))) add(`Zeitangabe im Text „${ohneKlammer(t).slice(0, 60)}…“ – die Zeit kommt aus „seit wann“ (Minuten); sonst widerspricht sie sich`);
  for (const s of f.stelle) if (/\b(stock|stiege|tür \d|hausnummer)\b/i.test(ohneKlammer(s))) add(`Stelle „${ohneKlammer(s)}“ nennt Stockwerk/Tür – das erzeugt das Programm, sonst widerspricht es sich`);
  const doppelt = fakten.map(ohneKlammer).filter((t, i, l) => l.indexOf(t) !== i);
  for (const d of new Set(doppelt)) add(`doppelter Text „${d.slice(0, 50)}…“`);
  // je Ausgang: was gilt gemeinsam?
  const aktiv = f.varianten.filter((v) => v.p > 0);
  for (const v of aktiv) {
    const texte = [...fakten, ...f.hergang].filter((t) => giltIn(t, v.id)).map(ohneKlammer);
    for (const [a, b, was] of GEGENSATZ) {
      const ta = texte.find((t) => a.test(t));
      const tb = texte.find((t) => b.test(t) && !a.test(t));
      if (ta && tb) add(`Widerspruch (${was}): „${ta.slice(0, 45)}…“ ↔ „${tb.slice(0, 45)}…“`, aktiv.length > 1 ? v.id : undefined);
    }
    const bw = (v.fest?.bw ?? f.fest?.bw) as string | string[] | undefined;
    if (bw === "nein") {
      const t = texte.find((x) => REDEN.test(x) && !/\b(niemand|keiner|nicht mehr|nichts)\b/.test(x) && !/\b(du |ich )/.test(x));
      if (t) add(`bewusstlos, aber im Text redet {er}: „${t.slice(0, 50)}…“`, aktiv.length > 1 ? v.id : undefined);
    }
  }
  if (f.ohneSicht) {
    const t = fakten.map(ohneKlammer).find((x) => SICHT.test(x) && !/\b(hörst|hört|am telefon|gesagt)\b/.test(x));
    if (t) add(`„sieht ihn nicht“, aber der Text beschreibt, wie er aussieht: „${t.slice(0, 50)}…“`);
  }
  if (aktiv.length > 1) {
    const unterscheidbar = (v: FallVariante) => !!v.fest || !!v.verlauf?.some((e) => e.text) || alleTexte.some((t) => bedingungen(t).some((b) => b.key === "variante" && b.werte.includes(v.id)));
    const gleich = aktiv.filter((v) => !unterscheidbar(v));
    if (gleich.length > 1) add(`Ausgänge ${gleich.map((v) => v.id).join(", ")} klingen am Telefon gleich – wenn das so gewollt ist (Unterschied erst vor Ort), passt es; sonst Texte mit [variante=…] oder eigene feste Antworten ergänzen`);
  }
  // gilt ein Hinweis für jeden Ausgang, steht er nur einmal da (ohne Ausgang)
  const zusammen: FallBefund[] = [];
  for (const b of out) {
    if (b.variante && aktiv.length > 1 && aktiv.every((v) => out.some((x) => x.variante === v.id && x.fehler === b.fehler))) {
      if (!zusammen.some((x) => !x.variante && x.fehler === b.fehler)) zusammen.push({ fall: b.fall, fehler: b.fehler });
    } else zusammen.push(b);
  }
  return zusammen;
}
