/**
 * Gesprächsablauf „neu“: Das Programm denkt, die KI redet.
 *
 * 1. Verstehen: Worum geht es in der (frei getippten) Frage? → Themen
 * 2. Wahrheit: Was weiß DIESER Anrufer JETZT dazu? → Antwortkern
 * 3. (KI formuliert den Kern in eigenen Worten)
 * 4. Prüfen: Widerspricht die Antwort dem Kern? → Gründe für eine Korrektur
 * 5. Reparieren: einmal neu erzeugen, sonst feste Antwort aus dem Kern
 *
 * Alles hängt nur an den Antworten des Falls (Schema, Zustand, Persona) – nicht an gut formulierten Fall-Texten.
 * So laufen selbst erstellte Fälle genauso gut wie die mitgelieferten.
 */
import { antwortOhneKi, inDuForm, patientW, wahrheitText, zeitText, type AnrufKontext } from "./anrufer";
import { anleitungAus, type AnleitungTyp } from "./faelle";
import { frageIndex, fragenImAblauf, type Frage } from "./schema";

export type Thema =
  | "zeit"
  | "atmung"
  | "bewusstsein"
  | "alter"
  | "geschlecht"
  | "anzahl"
  | "vorerkrankung"
  | "medikamente"
  | "allergie"
  | "blutung"
  | "verletzung"
  | "haut"
  | "schweiss"
  | "sprechen"
  | "verwirrt"
  | "dabei"
  | "name_patient"
  | "name_anrufer"
  | "schwanger";

/** Woran man ein Thema in einer getippten Frage erkennt (klein geschrieben, ä/ö/ü bleiben) */
const MUSTER: [Thema, RegExp][] = [
  ["zeit", /seit wann|wie lange? (schon|geht|hat|ist|dauert|liegt)|wann (hat|ist|war|genau|ungefähr|haben|sind)\b|um wie ?viel uhr|wie lang(e)? (ist|war) das her|seit (wie|einer)\b|wann (das|des) (passiert|angefangen|begonnen)/],
  ["atmung", /\batm|\bluft\b|schnauf|röchel|keuch|pfeif|\batem/],
  ["bewusstsein", /\bwach\b|bewusst|reagier|ansprechbar|ohnmächt|bei sich\b|reaktion|bei bewusstsein|munter/],
  ["alter", /wie alt|\balter\b|jahre alt|jahrgang|geburtsjahr|wie viele jahre/],
  ["geschlecht", /mann oder (eine )?frau|frau oder (ein )?mann|bub oder|mädchen oder|geschlecht|männlich|weiblich/],
  ["anzahl", /wie ?viele (personen|leute|patienten|verletzte|betroffene)|mehrere (personen|verletzte|betroffene)|nur (eine|einer)( person)?\b|weitere (verletzte|personen)|eine person/],
  ["vorerkrankung", /vorerkrank|krankheit|erkrank|vorgeschichte|zuckerkrank|diabet|\bzucker\b|\bherz|asthma|copd|\blunge|epilep|schlaganfall|infarkt|krebs|dement|bekannte (leiden|probleme)/],
  ["medikamente", /medikament|tablette|pille|blutverdünn|regelmäßig (was|etwas)? ?(ein|nehmen|nimmt)|nimmt (er|sie) (was|etwas)|spritzt|insulin|marcoumar|aspirin|spray/],
  ["allergie", /allerg/],
  ["blutung", /\bblut(et|ung|en|ig)?\b/],
  ["verletzung", /verletz|wunde|gebrochen|\bbruch|fehlstell|steht .* ab|verformt|verrenkt/],
  ["haut", /blass|bleich|gesichtsfarbe|\bfarbe\b|\bgrau\b|bläulich|\bblau\b|hautfarbe|im gesicht aus/],
  ["schweiss", /schwitz|schweiß|kalt und feucht|feucht/],
  ["sprechen", /ganze sätze|einzelne wörter|reden kann|sprechen kann|kann (er|sie) (normal )?(reden|sprechen)|nach jedem wort|zwischen (den )?wörtern|beim (reden|sprechen)|sprechpause/],
  ["verwirrt", /verwirrt|orientiert|durcheinander|weiß (er|sie) ,? ?wo|desorient/],
  ["dabei", /(jemand|wer|leute|personen?) (anderer |anders |sonst |noch |weiterer )*(da|bei ihnen|dabei|anwesend|vor ort)\b|\ballein\b|wer (kann|könnte) (die tür|aufmachen|helfen)|sonst noch wer/],
  ["name_patient", /wie heißt (er|sie|der|die|das|ihr|ihre)\b|name (des|der|vom|von der) (patient|mann|frau|person|kind)|wie heißt .* (patient|mann|frau|kind|person)/],
  ["name_anrufer", /wie heißen sie|ihr name|wer spricht|mit wem spreche|wie ist ihr name/],
  ["schwanger", /schwanger/],
];

/** Felder der Fall-Antworten, die zu einem Thema gehören (Reihenfolge = Wichtigkeit) */
const FELDER: Partial<Record<Thema, string[]>> = {
  atmung: ["at"],
  bewusstsein: ["bw"],
  alter: ["alter"],
  geschlecht: ["geschlecht"],
  anzahl: ["anzahl_patienten"],
  blutung: ["staerke", "blutung_stark", "blutung"],
  verletzung: ["verletzt", "fehlstellung", "region"],
  haut: ["hautfarbe"],
  schweiss: ["kaltschweiss"],
  sprechen: ["sprachschw"],
  verwirrt: ["verwirrt"],
  schwanger: ["schwanger"],
};

/** Befunde, die man nur sieht, wenn man beim Patienten ist */
const SICHT: Thema[] = ["atmung", "bewusstsein", "haut", "schweiss", "sprechen", "verwirrt", "blutung", "verletzung"];
/** Befunde, die nach einer Veränderung im Gespräch nicht mehr sicher stimmen */
const ZUSTANDSABHAENGIG: Thema[] = ["haut", "schweiss", "sprechen", "verwirrt"];

const klein = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** Themen einer Frage der Leitstelle (leer = kein bekanntes Thema) */
export function themenErkennen(text: string): Thema[] {
  const t = klein(text);
  // „Wann kommt die Rettung?“ u. Ä. fragt der Anrufer, nicht die Leitstelle
  const out: Thema[] = [];
  for (const [thema, re] of MUSTER) if (re.test(t) && !out.includes(thema)) out.push(thema);
  // „seit wann atmet er so?“ fragt nach der Zeit, nicht nach der Atmung
  if (out.includes("zeit") && out.length > 1 && /^(und )?(seit wann|wie lange|wann)/.test(t)) return ["zeit"];
  // „wie heißen Sie“ ist nicht „wie heißt der Patient“
  if (out.includes("name_anrufer")) return out.filter((x) => x !== "name_patient");
  return out;
}

/** Schemafrage zu einem Feld (für die Formulierung in Alltagssprache) */
function frageZu(k: AnrufKontext, id: string): Frage {
  return frageIndex(k.schema, k.kapitel).get(id) ?? frageIndex(k.schema).get(id) ?? ({ id, typ: "ja_nein", text: id } as unknown as Frage);
}

/** Satz mit Subjekt („schnauft ganz schwer“ → „Er schnauft ganz schwer“) */
function mitSubjekt(k: AnrufKontext, t: string): string {
  if (/^(das |du |es |er |sie |ich |ein |eine |\d)/i.test(t)) return t;
  // Selbstanrufer: „atmet normal“ → „Du atmest normal“
  if (k.anrufer.selbst) return inDuForm(`Er ${t}`);
  return `${patientW(k) ? "Sie" : "Er"} ${t}`;
}

export interface Kern {
  /** Antwortkern in Sätzen (für die KI) */
  saetze: string[];
  /** geprüfte Felder mit wahrem Wert */
  felder: Record<string, string | number>;
  /** der Anrufer weiß es nicht (dann wird nichts auf Ja/Nein geprüft) */
  unbekannt: boolean;
}

/** Was weiß dieser Anrufer jetzt zu diesen Themen? */
export function antwortKern(k: AnrufKontext, themen: Thema[]): Kern {
  const saetze: string[] = [];
  const felder: Record<string, string | number> = {};
  let unbekannt = false;
  const p = k.anrufer.persona;
  const sz = k.szenario;
  const w = patientW(k);
  const ihn = w ? "sie" : "ihn";
  const er = w ? "sie" : "er";
  const geaendert = (k.verlauf ?? []).length > 0;
  const kenntVor = k.anrufer.selbst || !p || p.kenntVorgeschichte === "ja";
  // Was in der Fallakte ausdrücklich steht („Sie hat Depressionen“), weiß der Anrufer – auch wenn er sonst wenig weiß
  const akte = sz ? [...(sz.geschehen ?? []), ...sz.details].join(" ").toLowerCase() : "";
  const ausAkte = (liste: string[]) =>
    liste.filter((x) => {
      const woerter = x.toLowerCase().replace(/\(.*?\)/g, "").split(/[^a-zäöüß]+/).filter((w) => w.length >= 5);
      return woerter.some((w) => akte.includes(w.slice(0, Math.max(5, w.length - 3))));
    });
  for (const thema of themen) {
    if (sz?.ohneSicht && SICHT.includes(thema)) {
      saetze.push(`Das weißt du nicht – du siehst ${ihn} nicht.`);
      unbekannt = true;
      continue;
    }
    if (geaendert && ZUSTANDSABHAENGIG.includes(thema)) {
      saetze.push("Beschreib, wie es JETZT ist (siehe GERADE GEÄNDERT).");
      continue;
    }
    const ids = FELDER[thema];
    if (ids) {
      for (const id of ids) {
        const wert = k.wahrheit[id];
        if (wert === undefined || wert === null) continue;
        const t = wahrheitText(k, frageZu(k, id));
        if (!t) continue;
        if (/weißt du nicht|kannst du nicht sagen/.test(t)) unbekannt = true;
        felder[id] = wert as string | number;
        saetze.push(`${mitSubjekt(k, t)}.`.replace(/\.\.$/, "."));
        break;
      }
      continue;
    }
    switch (thema) {
      case "zeit": {
        const z = zeitText(k);
        if (z) saetze.push(`${z}.`);
        break;
      }
      case "vorerkrankung":
        if (!sz) break;
        if (kenntVor) saetze.push(sz.patient.vorerkrankungen.length ? `Vorerkrankungen: ${sz.patient.vorerkrankungen.join(", ")} – sonst nichts.` : "Vorerkrankungen hat " + (k.anrufer.selbst ? "du keine" : `${er} keine`) + ", soweit bekannt.");
        else if (ausAkte(sz.patient.vorerkrankungen).length) saetze.push(`Du weißt nur: ${ausAkte(sz.patient.vorerkrankungen).join(", ")}. Mehr weißt du nicht.`);
        else if (p?.kenntVorgeschichte === "teilweise" && sz.patient.vorerkrankungen.length) saetze.push(`Du weißt nur: ${sz.patient.vorerkrankungen[0]}. Mehr weißt du nicht.`);
        else {
          saetze.push(p?.wissen === "fremd" ? `Das weißt du nicht, du kennst ${ihn} nicht.` : "Das weißt du nicht genau.");
          unbekannt = true;
        }
        break;
      case "medikamente":
        if (!sz) break;
        if (kenntVor) {
          if (!sz.patient.medikamente.length) saetze.push(k.anrufer.selbst ? "Du nimmst keine Medikamente regelmäßig." : `Regelmäßig nimmt ${er} keine Medikamente.`);
          else if (p?.medsUngefaehr) saetze.push(`${er.charAt(0).toUpperCase()}${er.slice(1)} nimmt Medikamente (${sz.patient.medikamente.join(", ")}), aber die Namen weißt du nicht auswendig – beschreib sie ungefähr oder biete an nachzuschauen.`);
          else saetze.push(`Medikamente: ${sz.patient.medikamente.join(", ")}.`);
        } else if (ausAkte(sz.patient.medikamente).length) saetze.push(`Du weißt nur: ${ausAkte(sz.patient.medikamente).join(", ")}. Mehr weißt du nicht.`);
        else {
          saetze.push(p?.wissen === "fremd" ? `Das weißt du nicht, du kennst ${ihn} nicht.` : "Das weißt du nicht.");
          unbekannt = true;
        }
        break;
      case "allergie":
        if (sz) saetze.push(kenntVor ? `Allergien: ${sz.patient.allergien}.` : "Das weißt du nicht.");
        break;
      case "dabei":
        if (p?.dabei) saetze.push(p.dabei);
        break;
      case "name_patient":
        if (!sz) break;
        if (k.anrufer.selbst) saetze.push(`Du heißt ${k.anrufer.name}.`);
        else if (p?.wissen === "fremd" && k.wahrheit.bw !== "ja") {
          saetze.push("Den Namen weißt du nicht.");
          unbekannt = true;
        } else saetze.push(`${er.charAt(0).toUpperCase()}${er.slice(1)} heißt ${sz.patient.name}.`);
        break;
      case "name_anrufer":
        saetze.push(`Du heißt ${k.anrufer.name}.`);
        break;
    }
  }
  return { saetze, felder, unbekannt };
}

/**
 * Freie Frage ohne erkanntes Thema: passendste Frage des Kapitels nach gemeinsamen Wörtern
 * (deckt alle Schemafragen ab – auch die eines selbst erstellten Falls).
 */
export function schemaFrageZu(k: AnrufKontext, text: string): Frage | undefined {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").split(/\s+/).filter((x) => x.length > 3);
  const woerter = new Set(norm(text));
  const unwichtig = new Set(["patient", "patientin", "person", "der", "haben", "einen", "eine", "sind", "wird", "wurde", "gibt", "sich", "noch", "schon", "irgendwie", "bitte"]);
  let beste: Frage | undefined;
  let punkte = 1;
  for (const { frage } of fragenImAblauf(k.schema, k.kapitel, k.wahrheit)) {
    if (frage.typ === "text" || frage.typ === "kapitelwahl") continue;
    const p = norm(frage.text).filter((x) => woerter.has(x) && !unwichtig.has(x)).length;
    if (p > punkte) {
      punkte = p;
      beste = frage;
    }
  }
  return beste;
}

// ------------------------------------------------------------------ Prüfen

const WEISS_NICHT = /wei(ß|ss) (ich|i)? ?(nicht|net|ned)|(nicht|net),? (wei(ß|ss)|sagen)|keine ahnung|kann ich (nicht|net) sagen|seh (ich )?(sie|ihn|nix|nichts)|weiß nicht|nicht sehen|keine sicht|kenn (ihn|sie) (nicht|net)/;

const ZAHL_EINER: Record<string, number> = { ein: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const ZAHL_BIS19: Record<string, number> = { null: 0, eins: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const ZAHL_ZEHNER: Record<string, number> = { zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90, hundert: 100 };
/** Alle Zahlen eines Texts – als Ziffern oder ausgeschrieben („sechsundsiebzig“) */
export function zahlenIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.toLowerCase().matchAll(/\d{1,3}|[a-zäöüß]+/g)) {
    const w = m[0];
    if (/^\d/.test(w)) {
      out.push(Number(w));
      continue;
    }
    if (w in ZAHL_ZEHNER) out.push(ZAHL_ZEHNER[w]);
    else if (w in ZAHL_BIS19 && !["ein", "eine", "einer", "eins"].includes(w)) out.push(ZAHL_BIS19[w]);
    else {
      const x = w.match(/^([a-zäöü]+?)und(zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)$/);
      if (x && x[1] in ZAHL_EINER) out.push(ZAHL_EINER[x[1]] + ZAHL_ZEHNER[x[2]]);
    }
  }
  return out;
}

const NEG = /\b(nein|na|naa|nö|nicht|net|ned|kein\w*|nix|nichts|niemand|nie)\b/;
const erster = (t: string) => klein(t).split(/[.!?…]/)[0] ?? "";

function atmungNormalBehauptet(a: string): boolean {
  return /(atmet|atme|atmen|atmung|luft)[^.!?]*\b(normal|ruhig|gut|ohne probleme|ganz normal)\b/.test(a) && !/(nicht|net|kein\w*) (ganz )?(normal|gut|ruhig)|schlecht|schwer|kaum|mühsam/.test(a);
}
function atmungSchlechtBehauptet(a: string): boolean {
  return /schlecht luft|kaum luft|keine luft|schnauf|röchel|ringt|keuch|atmet (ganz )?(schwer|schnell|mühsam|kaum|nicht)|schwer (luft|atmen)|pfeif|schnapp|atmet nicht|kriegt nix|krieg nix/.test(a);
}
function wachBehauptet(a: string): boolean {
  return /\b(ist wach|bin wach|wach und|redet mit|antwortet|gibt (mir )?antwort|schaut (mich|einen|uns) an|ist munter|ansprechbar)\b/.test(a) && !/nicht (wach|ansprechbar)|net (wach|ansprechbar)/.test(a);
}
function nichtWachBehauptet(a: string): boolean {
  return /reagiert (gar |überhaupt )?(nicht|net|nix|auf nichts|auf gar nichts)|bewusstlos|nicht (wach|ansprechbar)|net (wach|ansprechbar)|rührt sich nicht|ohnmächtig|ist weg\b/.test(a);
}

/** Minuten aus einer Zeitangabe der Antwort (null = keine erkannt) */
function minutenAus(a: string): number | null {
  const zahl: Record<string, number> = { ein: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, zehn: 10, zwanzig: 20, dreißig: 30, fünfzehn: 15 };
  const z = (x: string) => (/^\d+$/.test(x) ? Number(x) : zahl[x] ?? NaN);
  let m = a.match(/(\d+|ein|eine|einer|zwei|drei|vier|fünf|zehn|fünfzehn|zwanzig|dreißig) ?(minute|minuten|min)\b/);
  if (m) return z(m[1]);
  if (/halbe(n)? stunde/.test(a)) return 30;
  if (/viertelstunde|viertel stunde/.test(a)) return 15;
  m = a.match(/(\d+|ein|eine|einer|zwei|drei|vier|fünf) ?(stunde|stunden)\b/);
  if (m) return z(m[1]) * 60;
  if (/gerade eben|grad eben|gerade erst|vor (ein,? )?zwei minuten/.test(a)) return 2;
  return null;
}

/**
 * Widerspricht die Antwort dem, was der Anrufer weiß? Gibt die Gründe zurück (leer = passt).
 * Geprüft wird nur, was sich sicher erkennen lässt – lieber eine Antwort durchlassen als eine gute verwerfen.
 */
export function antwortPruefen(k: AnrufKontext, themen: Thema[], kern: Kern, antwort: string, frage?: Frage, gefragt = ""): string[] {
  const a = klein(antwort);
  if (!a || /^\(/.test(a)) return [];
  const g: string[] = [];
  const er = patientW(k) ? "sie" : "er";
  const wahr = (id: string) => (id in kern.felder ? String(kern.felder[id]) : undefined);
  // Atmung
  const at = wahr("at");
  if (at && themen.includes("atmung") && !kern.unbekannt) {
    if (at === "normal" && atmungSchlechtBehauptet(a) && !atmungNormalBehauptet(a)) g.push(`die Atmung ist normal – ${er} kriegt gut Luft`);
    if (at !== "normal" && at !== "unbekannt" && atmungNormalBehauptet(a)) g.push(at === "abnorm" ? `${er} atmet NICHT normal – ${er} kriegt schlecht Luft` : `${er} atmet nicht normal – nur ganz selten oder gar nicht`);
  }
  // Bewusstsein
  const bw = wahr("bw");
  if (bw && themen.includes("bewusstsein") && !kern.unbekannt) {
    if (bw === "ja" && nichtWachBehauptet(a) && !wachBehauptet(a)) g.push(`${er} ist wach und reagiert`);
    if (bw === "nein" && wachBehauptet(a) && !nichtWachBehauptet(a)) g.push(`${er} reagiert NICHT – ${er} ist nicht wach`);
  }
  // Geschlecht, Anzahl
  const gs = wahr("geschlecht");
  if (gs === "m" && /\b(eine frau|ein mädchen|weiblich)\b/.test(a) && !/\b(mann|bub|männlich|bursch)\b/.test(a)) g.push("es ist ein Mann bzw. Bub");
  if (gs === "w" && /\b(ein mann|ein bub|männlich|ein bursch)\b/.test(a) && !/\b(frau|mädchen|weiblich)\b/.test(a)) g.push("es ist eine Frau bzw. ein Mädchen");
  const anz = wahr("anzahl_patienten");
  if (anz === "1" && /\b(zwei|drei|mehrere|beide)\b/.test(a) && !NEG.test(erster(a))) g.push("es ist nur eine Person betroffen");
  // Alter
  if (themen.includes("alter") && k.szenario) {
    const p = k.anrufer.persona;
    const sollListe = zahlenIn(String(p?.alterGesagt ?? k.szenario.patient.alter));
    // Spanne nur bei einer geschätzten Einzelzahl („so um die 50“); eine genannte Spanne („zwischen 60 und 70“) gilt genau
    const spanne = sollListe.length >= 2 ? 3 : p?.wissen === "fremd" || p?.wissen === "bekannt" ? 12 : 2;
    const zw = zahlenIn((a.match(/zwischen ([^.!?]*?) und ([^.!?,]+)/) ?? []).slice(1).join(" "));
    if (zw.length === 2 && zw[0] >= zw[1]) g.push(`das Alter ist ${p?.alterGesagt ?? sollListe[0]}`);
    const genannt = zahlenIn(a.replace(/[\wäöüß]+\s+(minute|minuten|stunde|stunden|uhr|stock|kilo|kg|tage|tagen|wochen)\b/g, "")).filter((n) => n > 0 && n < 120);
    if (sollListe.length && genannt.some((n) => n < Math.min(...sollListe) - spanne || n > Math.max(...sollListe) + spanne)) g.push(`das Alter ist ${p?.alterGesagt ?? sollListe[0]}`);
  }
  // „weiß ich nicht“ ist die Antwort – dann kein Ja oder Nein behaupten
  if (kern.unbekannt && kern.saetze.length && !WEISS_NICHT.test(a) && /^\W*(ja|jo|nein|na|naa|genau|stimmt)\b/.test(erster(a))) g.push(kern.saetze[0].replace(/\.$/, ""));
  // Zeit
  if (themen.includes("zeit") && k.szenario && !k.szenario.gefunden) {
    const soll = k.szenario.seitMin;
    const genannt = minutenAus(a);
    if (genannt !== null && soll > 0 && (genannt > soll * 2.5 + 10 || genannt < soll / 2.5 - 3)) g.push(`die Zeit stimmt nicht – ${zeitText(k)}`);
    if (soll < 180 && /gestern|seit (dem )?(mittag|frühstück|vormittag|nachmittag|morgen)|mittagessen|heute früh|in der nacht/.test(a) && !/gestern|früh|nacht|mittag/.test(k.szenario.seit)) g.push(`die Zeit stimmt nicht – ${zeitText(k)}`);
  }
  // Wer ist dabei
  const dabei = k.anrufer.persona?.dabei ?? "";
  if (themen.includes("dabei") && dabei && !/allein|niemand/i.test(dabei) && /\b(allein|niemand|nur ich)\b/.test(a) && !/nicht allein|net allein/.test(a)) g.push(`du bist NICHT allein: ${dabei}`);
  // Ja/Nein-Fragen (Hautfarbe, Schweiß, Schwangerschaft … und jede Ja/Nein-Frage des Schemas)
  const janein = [...Object.keys(kern.felder).filter((id) => !["at", "bw", "geschlecht", "alter", "anzahl_patienten"].includes(id)), ...(frage && !(frage.id in kern.felder) ? [frage.id] : [])];
  if (janein.length === 1 && !kern.unbekannt) {
    const id = janein[0];
    const w = String(kern.felder[id] ?? k.wahrheit[id] ?? "");
    const optionen = (frage?.optionen ?? []).map((o) => String(o.wert));
    const istJaNein = (w === "ja" || w === "nein") && (!frage || frage.id !== id || (optionen.includes("ja") && optionen.includes("nein")));
    if (istJaNein) {
      const e = erster(a);
      const sagtJa = /^\W*(ja|jo|genau|stimmt|freilich|schon)\b/.test(e) && !NEG.test(e);
      const sagtNein = /^\W*(nein|na|naa|nö|ne)\b/.test(e) || (NEG.test(e) && !/^\W*(ja|jo)\b/.test(e));
      // umgekehrt gefragt („Kann er die Arme normal bewegen?“ zum Merkmal „Lähmung“): ja und nein tauschen
      const umgekehrt = /\b(normal|gleich|gleichmäßig|richtig|wie immer|wie sonst)\b/i.test(gefragt) && !/\bnicht\b|\bkein/i.test(gefragt) && !["atmung_geprueft"].includes(id);
      const soll = umgekehrt ? (w === "ja" ? "nein" : "ja") : w;
      if (soll === "nein" && sagtJa) g.push(`die richtige Antwort ist „nein“`);
      if (soll === "ja" && sagtNein) g.push(`die richtige Antwort ist „ja“`);
    }
  }
  // Ich-Form beim Selbstanrufer
  if (k.anrufer.selbst && /^(er|sie|der patient|die patientin)\b/.test(a)) g.push("du bist selbst der Patient – rede in der Ich-Form");
  return [...new Set(g)];
}

/** Feste Antwort aus dem Kern (wenn die KI zweimal danebenliegt) */
export function kernAntwort(k: AnrufKontext, themen: Thema[], kern: Kern, frage?: Frage): string {
  if (frage) return antwortOhneKi(k, frage);
  const ich = (t: string) =>
    t
      .replace(/^Du bist\b/, "Ich bin")
      .replace(/^Du heißt\b/, "Ich heiße")
      .replace(/^Du nimmst\b/, "Ich nehme")
      .replace(/^Du weißt nur\b/, "Ich weiß nur")
      .replace(/^Das weißt du nicht\b/, "Das weiß ich nicht")
      .replace(/\bdu kennst (ihn|sie) nicht\b/, "ich kenn $1 nicht")
      .replace(/\bdu siehst (ihn|sie) nicht\b/, "ich seh $1 nicht")
      .replace(/^Du hast\b/, "Ich hab")
      .replace(/^Du ([a-zäöüß]+?)e?st\b/, "Ich $1e")
      .replace(/\bhast du\b/g, "hab ich")
      .replace(/\bkannst du\b/g, "kann ich")
      .replace(/\bweißt du\b/g, "weiß ich")
      .replace(/\bbist du\b/g, "bin ich")
      .replace(/\bmusst\b/g, "muss")
      .replace(/\bkannst\b/g, "kann")
      .replace(/\bdu\b/g, "ich")
      .replace(/\bdir\b/g, "mir")
      .replace(/\bdich\b/g, "mich")
      .replace(/ – (beschreib|biete).*$/, ".")
      .replace(/\(siehe [^)]*\)/g, "");
  const s = kern.saetze.filter((x) => !/^Beschreib/.test(x)).slice(0, 2).map(ich).join(" ");
  void themen;
  return s || "Das weiß ich nicht genau.";
}

/** Thema zu einem Feld der Abfrage („at“ → Atmung) */
export function themenZuFeld(id: string): Thema[] {
  return (Object.entries(FELDER) as [Thema, string[]][]).filter(([, ids]) => ids.includes(id)).map(([t]) => t);
}

/** Kern für eine Schemafrage (per 🗨 gestellt oder aus einer freien Frage erkannt) */
export function kernFuerFrage(k: AnrufKontext, frage: Frage): Kern {
  const themen = themenZuFeld(frage.id);
  if (themen.length) return antwortKern(k, themen);
  const wert = k.wahrheit[frage.id];
  const t = wert === undefined || wert === null ? null : wahrheitText(k, frage);
  return { saetze: t ? [`${mitSubjekt(k, t)}.`] : [], felder: t ? { [frage.id]: wert as string | number } : {}, unbekannt: !t || /weißt du nicht|kannst du nicht sagen/.test(t) };
}

// ------------------------------------------------------------------ Anweisungen: geht das, und was ist danach?

/** Was nach einer Anweisung gilt (für die Fallakte: „was du schon machst“) */
const MASSNAHME: Partial<Record<AnleitungTyp, [string, string]>> = {
  // [über den Patienten, Selbstanrufer]
  reanimation: ["Du machst Herzdruckmassage und zählst laut mit.", ""],
  seitenlage: ["{Er} liegt jetzt in stabiler Seitenlage.", ""],
  oberkoerper_hoch: ["{Er} sitzt jetzt mit dem Oberkörper hoch.", "Du sitzt jetzt aufrecht."],
  beine_hoch: ["{Er} liegt flach, die Beine sind hochgelagert.", "Du liegst flach und hast die Beine hochgelagert."],
  druck_blutung: ["Du drückst ein Tuch fest auf die Wunde.", "Du drückst ein Tuch fest auf die Wunde."],
  beruhigen: ["Du redest beruhigend mit {ihm} und atmest langsam mit {ihm}.", "Du versuchst, ganz langsam zu atmen."],
  zucker: ["{Er} hat etwas Süßes zu trinken bekommen.", "Du hast etwas Süßes getrunken."],
  spray: ["{Er} hat noch zwei Hübe vom Spray genommen.", "Du hast noch zwei Hübe vom Spray genommen."],
  geburt: ["Saubere Handtücher liegen bereit.", "Saubere Handtücher liegen bereit."],
  nicht_bewegen: ["Du bewegst {ihn} nicht und hast {ihn} zugedeckt.", "Du bleibst ruhig liegen."],
  fremdkoerper: ["Du hast {ihm} kräftig auf den Rücken geklopft.", ""],
};

export interface AnweisungKern {
  typen: AnleitungTyp[];
  /** was der Anrufer tun bzw. sagen soll */
  saetze: string[];
  /** Anweisungen, die nicht gehen (Grund für die KI) */
  nichtMachbar: string[];
  /** dasselbe so, wie es der Anrufer sagt (für die feste Antwort) */
  gesagt: string[];
  /** neu gemerkte Maßnahmen */
  massnahmen: string[];
}

/** Geht die Anweisung in dieser Lage – und was sagt der Anrufer dazu? */
export function anweisungKern(k: AnrufKontext, text: string): AnweisungKern {
  const typen = anleitungAus(text, true);
  const w = patientW(k);
  const er = w ? "sie" : "er";
  const ihm = w ? "ihr" : "ihm";
  const ihn = w ? "sie" : "ihn";
  const f = (t: string) => t.replace(/\{Er\}/g, w ? "Sie" : "Er").replace(/\{ihm\}/g, ihm).replace(/\{ihn\}/g, ihn);
  const sz = k.szenario;
  const ich = k.anrufer.selbst;
  const dabei = k.anrufer.persona?.dabei ?? "";
  const allein = /allein|niemand/i.test(dabei);
  const wohnlich = !sz || ["wohnung", "haus", "garten", "pflegeheim", "arzt"].includes(sz.ortArt);
  const wach = k.wahrheit.bw === "ja";
  const atmetNormal = k.wahrheit.at === "normal";
  const saetze: string[] = [];
  const nichtMachbar: string[] = [];
  const gesagt: string[] = [];
  const massnahmen: string[] = [];
  const nein = (grund: string, ichSage: string) => {
    nichtMachbar.push(grund);
    gesagt.push(ichSage);
    saetze.push(`Das geht nicht: ${grund}.`);
  };
  // Gefahr am Ort (Gärgas, Rauch, Gas, Strom): der Anrufer geht nicht hin – nur Tür, Beruhigen, Absichern
  const gefahr = !!sz && ["gefahrstoff", "brand", "strom"].includes(sz.thema) && /keller|gas|rauch|strom|leitung/i.test([...(sz.geschehen ?? []), ...sz.details, sz.stelle].join(" "));
  for (const typ of typen) {
    if (gefahr && !["tuer", "beruhigen", "absichern"].includes(typ)) {
      nein(`dort ist es gefährlich (siehe Fallakte) – du gehst nicht hin und wartest auf Feuerwehr und Rettung`, "Da geh ich nicht hin, da unten ist es gefährlich – ich warte auf die Feuerwehr.");
      continue;
    }
    if (sz?.ohneSicht && typ !== "tuer" && typ !== "beruhigen") {
      nein(`du kommst nicht zu ${ihm} – du stehst vor der versperrten Tür und siehst ${ihn} nicht`, `Das geht nicht, ich komm ja nicht zu ${ihm} rein – die Tür ist zu.`);
      continue;
    }
    switch (typ) {
      case "tuer":
        if (!wohnlich) saetze.push("Hier gibt es keine Tür zum Aufsperren – du kannst der Rettung aber winken bzw. jemanden zur Straße schicken, wenn jemand da ist.");
        else if (allein && !ich) saetze.push(`Du bist allein – du kannst niemanden zur Tür schicken. Du kannst kurz selbst aufsperren und gleich wieder zu ${ihm} gehen.`);
        else if (allein && ich) saetze.push("Du bist allein – wenn du es schaffst, sperrst du selbst auf, sonst sagst du, dass es nicht geht.");
        else saetze.push(`Jemand, der da ist (${dabei.replace(/\.$/, "")}), geht zur Tür.`);
        break;
      case "zucker":
        // benommen, aber schluckt: ein paar Schlucke gehen; wer nicht reagiert, bekommt nichts
        if (k.wahrheit.bw === "nein" && !ich) nein(`${er} ist nicht richtig wach – einem Menschen, der nicht wach ist, gibt man nichts zu trinken (${er} könnte sich verschlucken)`, `Das geht nicht, ${er} ist ja nicht richtig wach – da kann ich ${ihm} nichts zu trinken geben.`);
        else saetze.push(f("Du gibst {ihm} etwas Süßes zu trinken und sagst, ob {er} schlucken kann.".replace("{er}", er)));
        break;
      case "reanimation":
        if (wach || atmetNormal) nein(`${er} ist ${wach ? "wach" : "nicht wach, atmet aber normal"} – Herzdruckmassage passt da nicht, sag das verwundert`, wach ? `Was? ${er.charAt(0).toUpperCase()}${er.slice(1)} ist doch wach und redet!` : `Aber ${er} atmet doch – soll ich da wirklich drücken?`);
        else if (!/drück|druck|pump|herzdruck|reanim|wiederbeleb|zähl|weiter/.test(text.toLowerCase())) {
          // erst hinknien und Hände auflegen – gedrückt wird, wenn die Leitstelle es sagt
          saetze.push(f("Du kniest dich neben {ihn} und legst die Hände auf die Mitte der Brust – gedrückt wird erst, wenn die Leitstelle es sagt."));
          continue;
        } else saetze.push("Du legst los: Herzdruckmassage, und du zählst laut mit („eins, zwei, drei …“).");
        break;
      case "seitenlage":
        if (wach) saetze.push(`${er.charAt(0).toUpperCase()}${er.slice(1)} ist wach – du hilfst ${ihm} in eine bequeme Lage und sagst, dass ${er} wach ist.`);
        else saetze.push(f("Du drehst {ihn} auf die Seite (stabile Seitenlage) und schaust, ob {er} atmet.".replace("{er}", er)));
        break;
      case "druck_blutung":
        if (sz && !/blut|wunde|schnitt/i.test([...(sz.geschehen ?? []), ...sz.details].join(" ")) && k.wahrheit.blutung_stark !== "ja") nein("es blutet nirgends", "Es blutet aber nirgends.");
        else saetze.push("Du drückst ein sauberes Tuch fest auf die Wunde und sagst, ob es weniger wird.");
        break;
      case "spray":
        if (sz && !sz.patient.medikamente.some((m) => /spray|inhal/i.test(m))) nein("es gibt hier kein Spray", "Wir haben kein Spray da.");
        else saetze.push(ich ? "Du nimmst noch zwei Hübe." : `${er.charAt(0).toUpperCase()}${er.slice(1)} nimmt noch zwei Hübe vom Spray.`);
        break;
      case "absichern":
        if (k.anrufer.typ !== "lenker") saetze.push("Du hast kein eigenes Auto hier – du bleibst von der Fahrbahn weg und passt auf den Verkehr auf.");
        else saetze.push("Du schaltest die Warnblinkanlage ein und stellst das Warndreieck auf.");
        break;
      default:
        if (ich && ["reanimation", "seitenlage", "fremdkoerper"].includes(typ)) nein("das kannst du an dir selbst nicht machen", "Das kann ich bei mir selber nicht machen.");
        else saetze.push("Du machst es und sagst kurz, wie, und was du dabei siehst.");
    }
    if (!nichtMachbar.length) {
      const m = MASSNAHME[typ]?.[ich ? 1 : 0];
      if (m) massnahmen.push(f(m));
    }
  }
  return { typen, saetze, nichtMachbar, gesagt, massnahmen };
}

/** Behauptet der Anrufer, eine Anweisung auszuführen, die nicht geht? */
export function anweisungPruefen(a: AnweisungKern, antwort: string): string[] {
  if (!a.nichtMachbar.length) return [];
  const t = klein(antwort);
  const tutEs = /\b(mach ich|mache ich|ich (mach|mache|geb|gebe|leg|lege|drück|drücke|hol|hole|schick|schicke|setz|setze|fang)|okay,? (ich|mach)|wird gemacht|schon dabei)\b/.test(t);
  return tutEs && !NEG.test(erster(t)) ? a.nichtMachbar.map((g) => `das geht nicht – ${g}`) : [];
}
