/**
 * KI-Anrufer: Wer ruft an (passend zur Lage, mit Zufall), was weiß er, wie spricht er.
 * Erzeugt die Anweisung für das Sprachmodell und einfache Antworten ohne KI.
 */
import { antwortLabel, frageIndex, type Antworten, type Frage, type Schema } from "./schema";

export interface Anrufer {
  /** Beziehung zum Patienten, z. B. „Ehefrau“, „Pflegerin im Heim“ */
  rolle: string;
  /** Wert für die Schemafrage „Wer ruft an?“ */
  anruferWert: string;
  name: string;
  geschlecht: "m" | "w";
  /** Ort der Situation, z. B. „Wohnung“, „Pflegeheim“, „Gehsteig“, „Arztpraxis“ */
  ort: string;
  emotion: "ruhig" | "gefasst" | "aufgeregt" | "panisch";
  sprache: "hochdeutsch" | "dialekt" | "gebrochen";
  herkunft?: string;
  schwerhoerig: boolean;
  nummer: string;
  /** Patient ist der Anrufer selbst */
  selbst: boolean;
}

const VORNAMEN_W = ["Maria", "Anna", "Elisabeth", "Sabine", "Andrea", "Claudia", "Julia", "Lisa", "Sandra", "Karin", "Monika", "Theresa", "Sophie", "Katharina", "Birgit", "Ingrid"];
const VORNAMEN_M = ["Josef", "Johann", "Franz", "Michael", "Thomas", "Andreas", "Stefan", "Markus", "Lukas", "Florian", "Karl", "Gerhard", "Wolfgang", "Manfred", "David", "Martin"];
const NACHNAMEN = ["Gruber", "Huber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Mayer", "Hofer", "Leitner", "Berger", "Fuchs", "Eder", "Schmid", "Winkler", "Weber", "Schwarz", "Maier", "Schneider"];
const HERKUNFT = ["Türkei", "Serbien", "Rumänien", "Syrien", "Afghanistan", "Ungarn", "Polen", "Bosnien", "Ukraine", "Slowakei"];

function pick<T>(a: T[], rnd: () => number): T {
  return a[Math.floor(rnd() * a.length)];
}

function gewichtet<T>(liste: [T, number][], rnd: () => number): T {
  const sum = liste.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * sum;
  for (const [v, w] of liste) {
    r -= w;
    if (r <= 0) return v;
  }
  return liste[liste.length - 1][0];
}

function telefonnummer(rnd: () => number): string {
  const vorwahl = pick(["0664", "0660", "0676", "0699", "0650", "0681", "02732", "02742"], rnd);
  let n = "";
  for (let i = 0; i < (vorwahl.length === 4 ? 7 : 5); i++) n += Math.floor(rnd() * 10);
  return `${vorwahl} ${n}`;
}

type Situation = { ort: string; rolle: string; anruferWert: string; geschlecht?: "m" | "w"; selbst?: boolean; profi?: boolean };

/**
 * Wählt einen passenden Anrufer. Die Lage (Alter, Bewusstsein, Kapitel) beeinflusst
 * die Wahrscheinlichkeiten, legt aber nichts fest – so bleibt es abwechslungsreich.
 */
export function anruferWaehlen(kapitel: string, a: Antworten, rnd: () => number = Math.random): Anrufer {
  const alter = typeof a.alter === "number" ? a.alter : 50;
  const patientW = a.geschlecht === "w";
  const kannSelbst = a.bw === "ja" && (a.at === "normal" || a.at === "abnorm") && alter >= 14;
  const kind = alter < 14;
  const alt = alter >= 75;
  const draussen = ["29", "17", "4", "3", "27", "30", "ALP", "22", "20"].includes(kapitel);
  const kandidaten: [Situation, number][] = [];
  const add = (s: Situation, w: number) => w > 0 && kandidaten.push([s, w]);

  // Zu Hause
  add({ ort: "Wohnung", rolle: patientW ? "Ehemann" : "Ehefrau", anruferWert: "2", geschlecht: patientW ? "m" : "w" }, alter >= 25 && !kind ? 4 : 0);
  add({ ort: "Wohnung", rolle: "Lebensgefährtin", anruferWert: "2", geschlecht: "w" }, alter >= 20 && alter < 70 && !patientW ? 1 : 0);
  add({ ort: "Wohnung", rolle: "Mutter", anruferWert: "2", geschlecht: "w" }, kind ? 6 : alter < 25 ? 1 : 0);
  add({ ort: "Wohnung", rolle: "Vater", anruferWert: "2", geschlecht: "m" }, kind ? 3 : 0);
  add({ ort: "Wohnung", rolle: rnd() < 0.5 ? "Tochter" : "Sohn", anruferWert: "2" }, alter >= 60 ? 4 : 0);
  add({ ort: "Wohnung", rolle: "Nachbarin", anruferWert: "2", geschlecht: "w" }, alter >= 60 ? 1 : 0.3);
  add({ ort: "Wohnung", rolle: "Patient selbst", anruferWert: "1", selbst: true }, kannSelbst ? (alter > 80 ? 1 : 3) : 0);
  add({ ort: "Wohnung", rolle: "Angehöriger, nicht vor Ort (am Telefon mit dem Patienten)", anruferWert: "3" }, kannSelbst ? 0.6 : 0);
  // Einrichtungen
  add({ ort: "Pflegeheim", rolle: "Pflegekraft im Pflegeheim", anruferWert: "einrichtung", profi: true }, alt ? 4 : alter >= 65 ? 1 : 0);
  add({ ort: "Arztpraxis", rolle: "Hausärztin/Hausarzt", anruferWert: "einrichtung", profi: true }, !kind && ["10", "6", "26", "28", "1", "19", "18"].includes(kapitel) ? 1 : 0.2);
  add({ ort: "Arztpraxis", rolle: "Ordinationsassistentin am Empfang", anruferWert: "einrichtung", geschlecht: "w" }, !kind ? 0.6 : 0.2);
  add({ ort: "Schule / Kindergarten", rolle: "Lehrerin", anruferWert: "2", geschlecht: "w" }, kind && alter >= 3 ? 1.5 : 0);
  add({ ort: "Arbeitsplatz", rolle: rnd() < 0.5 ? "Arbeitskollege" : "Arbeitskollegin", anruferWert: "2" }, alter >= 17 && alter < 66 ? 1.5 : 0);
  // Draußen
  add({ ort: "Straße / Gehsteig", rolle: "Passant", anruferWert: "2" }, draussen ? 5 : 1);
  add({ ort: "Supermarkt", rolle: "Mitarbeiterin im Supermarkt", anruferWert: "2", geschlecht: "w" }, 0.6);
  add({ ort: "Straße", rolle: "Lenker, der den Unfall beobachtet hat", anruferWert: "2" }, kapitel === "29" ? 4 : 0);

  const s = gewichtet(kandidaten, rnd);
  const geschlecht: "m" | "w" =
    s.geschlecht ?? (s.selbst ? (patientW ? "w" : "m") : /Tochter|Kollegin|in\b/.test(s.rolle) ? "w" : /Sohn|Kollege/.test(s.rolle) ? "m" : rnd() < 0.5 ? "w" : "m");

  // Gefühlslage: je schlimmer und je näher, desto aufgeregter; Profis bleiben ruhig
  const schlimm = a.bw === "nein" || a.at === "keine" || a.at === "agonal";
  let emotion: Anrufer["emotion"];
  if (s.profi) emotion = schlimm ? "gefasst" : "ruhig";
  else if (s.selbst) emotion = gewichtet([["ruhig", 3], ["gefasst", 3], ["aufgeregt", 2]], rnd);
  else if (schlimm || kind) emotion = gewichtet([["panisch", 5], ["aufgeregt", 3], ["gefasst", 1]], rnd);
  else emotion = gewichtet([["ruhig", 2], ["gefasst", 3], ["aufgeregt", 3], ["panisch", 1]], rnd);

  const sprache: Anrufer["sprache"] = s.profi ? (rnd() < 0.1 ? "dialekt" : "hochdeutsch") : gewichtet([["hochdeutsch", 6], ["dialekt", 3], ["gebrochen", 1.5]], rnd);
  const vorname = pick(geschlecht === "w" ? VORNAMEN_W : VORNAMEN_M, rnd);
  return {
    rolle: s.rolle,
    anruferWert: s.anruferWert,
    name: `${vorname} ${pick(NACHNAMEN, rnd)}`,
    geschlecht,
    ort: s.ort,
    emotion,
    sprache,
    herkunft: sprache === "gebrochen" ? pick(HERKUNFT, rnd) : undefined,
    schwerhoerig: (s.selbst && alter > 78 && rnd() < 0.35) || rnd() < 0.03,
    nummer: telefonnummer(rnd),
    selbst: !!s.selbst,
  };
}

// ------------------------------------------------------------------ Anweisung für das Sprachmodell

const EMOTION_TEXT: Record<Anrufer["emotion"], string> = {
  ruhig: "Du bist ruhig und sachlich.",
  gefasst: "Du bist besorgt, aber gefasst und kooperativ.",
  aufgeregt: "Du bist aufgeregt, redest schnell, wiederholst dich manchmal und unterbrichst dich selbst.",
  panisch: "Du bist panisch: kurze, abgehackte Sätze, du flehst um schnelle Hilfe, beruhigst dich etwas, wenn die Leitstelle klare Anweisungen gibt.",
};

function sprachText(x: Anrufer): string {
  if (x.sprache === "dialekt") return "Du sprichst leichten niederösterreichischen Dialekt (z. B. „i“, „net“, „a bissl“, „gschwind“), bleibst aber verständlich.";
  if (x.sprache === "gebrochen") return `Deutsch ist nicht deine Muttersprache (du kommst aus ${x.herkunft}). Du sprichst einfaches, gebrochenes Deutsch mit Grammatikfehlern, verstehst schwierige Wörter manchmal nicht und fragst nach.`;
  return "Du sprichst normales Hochdeutsch mit österreichischem Einschlag.";
}

export interface AnrufKontext {
  schema: Schema;
  anrufer: Anrufer;
  kapitel: string;
  wahrheit: Antworten;
  /** Bezeichnung des wahren Codes (nur als Hintergrund, nie aussprechen) */
  lage: string;
  /** Adresse, wie der Anrufer sie nennt (kann falsch sein) */
  adresse: string;
  patientAlter: number | null;
  /** wie oft schon angerufen wurde (Rückruf nach verpasstem Anruf) */
  versuche: number;
  rueckrufDurchLeitstelle: boolean;
  /** Anrufer weiß nicht genau, wo er ist (Ortung nötig) */
  ortUnbekannt: boolean;
}

/** Bewusstsein und Atmung in Laiensprache (so beschreibt es ein Anrufer) */
const LAIE: Record<string, Record<string, string>> = {
  bw: {
    ja: "ist wach und redet normal",
    getruebt: "ist benommen, redet verwirrt oder undeutlich, reagiert nur langsam",
    nein: "reagiert überhaupt nicht, auch nicht auf Rütteln oder lautes Ansprechen",
    unbekannt: "das weißt du nicht genau",
  },
  at: {
    normal: "atmet ganz normal",
    abnorm: "schnauft schwer, ringt nach Luft oder atmet sehr schnell",
    agonal: "macht nur ganz selten so komische schnappende Atemzüge",
    keine: "atmet nicht",
    unbekannt: "das weißt du nicht",
  },
};

/** Wahrheit zu einer Frage in Worten (für die KI) */
export function wahrheitText(k: AnrufKontext, f: Frage): string | null {
  const wert = k.wahrheit[f.id];
  if (wert === undefined || wert === null) return null;
  if (LAIE[f.id]?.[String(wert)]) {
    const t = LAIE[f.id][String(wert)];
    return k.anrufer.selbst && f.id === "bw" ? "du bist wach, aber dir geht es nicht gut" : t;
  }
  const label = antwortLabel(f, wert);
  if (label === "–") return null;
  return label === "Unbekannt" || label === "unbekannt" ? "das weißt du nicht" : label;
}

/** Fakten: jede Schemafrage mit der wahren Antwort (nur auf Nachfrage verraten) */
function faktenText(k: AnrufKontext): string {
  const idx = frageIndex(k.schema);
  const zeilen: string[] = [];
  for (const id of Object.keys(k.wahrheit)) {
    const f: Frage | undefined = idx.get(id);
    if (!f || f.typ === "text" || f.typ === "kapitelwahl" || id === "anrufer" || id === "anzahl_patienten") continue;
    const t = wahrheitText(k, f);
    if (t) zeilen.push(`- ${f.text} → ${t}`);
  }
  return zeilen.join("\n");
}

export function systemPrompt(k: AnrufKontext): string {
  const x = k.anrufer;
  const patient = x.selbst ? "Du bist selbst der Patient." : `Du bist ${x.rolle} und rufst wegen einer anderen Person an (der Patientin bzw. dem Patienten).`;
  const ort = k.ortUnbekannt
    ? `Du weißt NICHT genau, wo du bist. Wenn nach dem Ort gefragt wird, beschreibst du nur grob, was du weißt und siehst: „${k.adresse}“. Eine Straße mit Hausnummer kennst du nicht.`
    : `Die Adresse, die du nennst: ${k.adresse}. Stockwerk, Tür oder Zufahrt sagst du nur, wenn extra danach gefragt wird.`;
  return [
    `Du spielst in einer Trainingssimulation eine echte Person, die beim Rettungsnotruf 144 in Niederösterreich anruft. Du bist KEIN Sanitäter und kein Arzt. Antworte nur mit dem, was diese Person ins Telefon sagt: Ich-Form, Deutsch, keine Regieanweisungen, keine Sternchen, keine Aufzählungen.`,
    `Wer du bist: ${x.name}. ${patient} Du bist gerade hier: ${x.ort}. Deine Telefonnummer: ${x.nummer}.`,
    ort,
    `Was wirklich los ist (GEHEIM, nur damit du die Lage verstehst – sprich diese Fachwörter NIE aus): ${k.lage}.`,
    `Diese Fakten stimmen. Du sagst sie aber NUR, wenn die Leitstelle genau danach fragt – jeweils nur den einen Punkt, in Alltagssprache:`,
    faktenText(k),
    `So redest du:`,
    `- Pro Antwort nur das, wonach gefragt wurde. Meist ein, höchstens zwei kurze Sätze.`,
    `- Von dir aus nennst du NIE Alter, Geschlecht, Bewusstsein, Atmung, Vorerkrankungen oder Medikamente. Die Leitstelle muss das einzeln erfragen.`,
    `- Keine Fachbegriffe und keine Checklisten („wach, ansprechbar, Atmung normal“ ist verboten). Du beschreibst, was du siehst und hörst: „Er redet so komisch“, „sie schnauft ganz schwer“, „er ist auf einmal umgekippt“.`,
    `- Auf „Wo ist der Notfallort?“ kommt die Adresse – sonst nichts. Wenn du panisch bist, darf vorher ein Ausruf kommen wie „Kommen Sie schnell, er atmet nicht mehr!“.`,
    `- Auf „Was ist passiert?“ erzählst du in ein, zwei Alltagssätzen, was du erlebt hast – keine Zahlen, keine Liste.`,
    x.selbst ? `- Du bist selbst betroffen: Was während einer Ohnmacht war, weißt du nicht; du erzählst nur, wie es dir ging und geht („Mir is auf einmal schwarz vor Augen worden“).` : "",
    `- Wenn du etwas nicht weißt, sag das ehrlich. Wenn etwas gefragt wird, das oben nicht steht, antworte passend zur Lage, ohne den Fakten zu widersprechen.`,
    `- Anweisungen der Leitstelle (z. B. Herzdruckmassage, Patient hinlegen) befolgst du und sagst kurz, was du tust.`,
    EMOTION_TEXT[x.emotion],
    sprachText(x),
    x.schwerhoerig ? "Du hörst schlecht und fragst ab und zu nach („Wie bitte?“)." : "",
    k.versuche > 1 ? `Du hast vorhin schon angerufen und niemand hat abgehoben – das sagst du gleich am Anfang vorwurfsvoll oder verzweifelt.` : "",
    k.rueckrufDurchLeitstelle ? "Die Leitstelle ruft dich zurück, weil dein Anruf vorhin nicht angenommen wurde." : "",
    `Beispiele, wie es klingen soll:`,
    `Leitstelle: Wo genau ist der Notfallort? → „Hauptstraße 12 in Gföhl.“`,
    `Leitstelle: Was ist passiert? → „Mein Mann is beim Frühstück auf einmal zusammengesackt und redet nur mehr komisch.“`,
    `Leitstelle: Ist er wach? → „Ja … also er schaut mich an, aber er sagt nix Gscheites.“`,
    `FALSCH wäre: „Patient männlich, 67 Jahre, wach, ansprechbar, Atmung normal, Hautfarbe blass.“`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Kurzer Hinweis, der jeder Frage angehängt wird (hält kleine Modelle auf Kurs) */
export function erinnerung(k: AnrufKontext, schemaFrage?: Frage): string {
  const teile = ["Antworte nur auf diese eine Frage, kurz und in Alltagssprache, ohne weitere Details von dir aus."];
  if (schemaFrage) {
    const t = schemaFrage.id === "ort_adresse" ? (k.ortUnbekannt ? `du weißt es nicht genau: ${k.adresse}` : k.adresse) : wahrheitText(k, schemaFrage);
    if (t) teile.push(`Die ehrliche Antwort darauf ist: ${t}.`);
  }
  return `[Hinweis nur für dich, nicht aussprechen: ${teile.join(" ")}]`;
}

/** Antwort ohne KI auf die Eröffnung „Wo genau ist der Notfallort?“ */
export function ersterSatzOhneKi(k: AnrufKontext): string {
  const x = k.anrufer;
  const vorher = k.versuche > 1 ? "Ich hab vorhin schon angerufen! " : "";
  const dringend = x.emotion === "panisch" ? "Schnell, bitte kommen Sie! " : "";
  const ort = k.ortUnbekannt ? `Ich weiß nicht genau … ${k.adresse}.` : `${k.adresse}.`;
  if (k.rueckrufDurchLeitstelle) return `Ja, hallo? Ach, die Rettung … ja, ich hab angerufen. ${dringend}${ort}`;
  return `${vorher}${dringend}${ort}`;
}

function kurzLage(k: AnrufKontext): string {
  const titel = k.schema.kapitel[k.kapitel]?.titel ?? "einen Notfall";
  return `${titel.replace(/\s*\([^)]*\)?/g, "").split("/")[0].split(",")[0].trim()}.`;
}

/** Antwort ohne KI auf eine Schemafrage: die wahre Antwort in einfacher Form */
export function antwortOhneKi(k: AnrufKontext, frage: Frage): string {
  if (frage.id === "ort_adresse") return k.ortUnbekannt ? `Ich weiß nicht genau … ${k.adresse}.` : k.adresse;
  if (frage.id === "rueckrufnummer") return k.anrufer.nummer;
  if (frage.id === "anrufer") return k.anrufer.selbst ? "Ich bin selbst der Patient." : `Ich bin ${k.anrufer.rolle.toLowerCase()}.`;
  if (frage.id === "schilderung") return k.anrufer.selbst ? `Mir geht's nicht gut … ${kurzLage(k)}` : `Es ist wegen … ${kurzLage(k)}`;
  if (LAIE[frage.id] && typeof k.wahrheit[frage.id] === "string") {
    const t = wahrheitText(k, frage);
    if (t) return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
  }
  const w = k.wahrheit[frage.id];
  if (w === undefined || w === null) return "Das weiß ich nicht.";
  const label = antwortLabel(frage, w);
  if (label === "Unbekannt" || label === "unbekannt") return "Das weiß ich nicht.";
  return label.replace(/^Ja\b.*/, (m) => (m === "Ja" ? "Ja." : m)).replace(/^Nein$/, "Nein.");
}
