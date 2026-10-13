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
}

/** Fakten in Klartext: jede Schemafrage mit der wahren Antwort */
function faktenText(k: AnrufKontext): string {
  const idx = frageIndex(k.schema);
  const zeilen: string[] = [];
  for (const [id, wert] of Object.entries(k.wahrheit)) {
    const f: Frage | undefined = idx.get(id);
    if (!f || f.typ === "text" || f.typ === "kapitelwahl" || id === "anrufer") continue;
    const label = antwortLabel(f, wert);
    if (label === "–") continue;
    zeilen.push(`- ${f.text} → ${label === "Unbekannt" || label === "unbekannt" ? "weißt du nicht" : label}`);
  }
  return zeilen.join("\n");
}

export function systemPrompt(k: AnrufKontext): string {
  const x = k.anrufer;
  const wer = x.selbst ? "Du bist selbst der Patient." : `Du bist ${x.rolle} des Patienten bzw. der Patientin.`;
  return [
    `Du spielst in einer Trainingssimulation eine Person, die beim Rettungsnotruf 144 in Niederösterreich anruft. Antworte immer nur als diese Person, auf Deutsch, in der Ich-Form, ohne Regieanweisungen, ohne Erzählertext, ohne Sternchen.`,
    `Wer du bist: ${x.name}. ${wer} Ort der Situation: ${x.ort}. Deine Rückrufnummer: ${x.nummer}.`,
    `Adresse, die du nennst, wenn gefragt: ${k.adresse}.`,
    `Was passiert ist (Hintergrund, NICHT wörtlich vorlesen, keine Fachbegriffe): ${k.lage}.${k.patientAlter ? ` Patient/in ca. ${k.patientAlter} Jahre.` : ""}`,
    `Diese Fakten stimmen. Gib sie nur preis, wenn danach gefragt wird, und in eigenen, laienhaften Worten (eine Pflegekraft oder Ärztin darf fachlicher sprechen):`,
    faktenText(k),
    `Wenn nach etwas gefragt wird, das oben nicht steht, antworte plausibel und passend zur Lage, aber widersprich den Fakten nie. Wenn du etwas nicht weißt, sag das.`,
    EMOTION_TEXT[x.emotion],
    sprachText(x),
    x.schwerhoerig ? "Du hörst schlecht und fragst ab und zu nach („Wie bitte?“)." : "",
    k.versuche > 1 ? `Du hast vorhin schon angerufen und niemand hat abgehoben – erwähne das gleich am Anfang vorwurfsvoll oder verzweifelt.` : "",
    k.rueckrufDurchLeitstelle ? "Die Leitstelle ruft dich zurück, weil dein Anruf vorhin nicht angenommen werden konnte." : "",
    `Halte dich kurz: meist 1–2 Sätze. Erzähle nicht alles auf einmal, sondern beantworte, was gefragt wird. Wenn die Leitstelle Anweisungen gibt (z. B. Herzdruckmassage, Kopf überstrecken), befolge sie und beschreibe, was du tust.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Erster Satz ohne KI (Platzhalter, bis die KI antwortet, oder wenn keine KI da ist) */
export function ersterSatzOhneKi(k: AnrufKontext): string {
  const x = k.anrufer;
  const vorher = k.versuche > 1 ? "Ich hab vorhin schon angerufen! " : "";
  const dringend = x.emotion === "panisch" ? "Schnell, bitte! " : x.emotion === "aufgeregt" ? "Bitte kommen Sie! " : "";
  if (k.rueckrufDurchLeitstelle) return `Ja, hallo? Ach, die Rettung … ja, ich hab angerufen. ${dringend}`.trim();
  if (x.selbst) return `${vorher}Hallo, ich bräuchte die Rettung. ${dringend}Mir geht's nicht gut.`;
  return `${vorher}Hallo, Rettung? ${dringend}Es geht um ${x.selbst ? "mich" : "einen Patienten"}: ${kurzLage(k)}`;
}

function kurzLage(k: AnrufKontext): string {
  const titel = k.schema.kapitel[k.kapitel]?.titel ?? "einen Notfall";
  return `${titel.split("/")[0].split(",")[0].trim()}.`;
}

/** Antwort ohne KI auf eine Schemafrage: die wahre Antwort in einfacher Form */
export function antwortOhneKi(k: AnrufKontext, frage: Frage): string {
  if (frage.id === "ort_adresse") return k.adresse;
  if (frage.id === "rueckrufnummer") return k.anrufer.nummer;
  if (frage.id === "anrufer") return k.anrufer.selbst ? "Ich bin selbst der Patient." : `Ich bin ${k.anrufer.rolle.toLowerCase()}.`;
  if (frage.id === "schilderung") return `${kurzLage(k)}`;
  const w = k.wahrheit[frage.id];
  if (w === undefined || w === null) return "Das weiß ich nicht.";
  const label = antwortLabel(frage, w);
  if (label === "Unbekannt" || label === "unbekannt") return "Das weiß ich nicht.";
  return label.replace(/^Ja\b.*/, (m) => (m === "Ja" ? "Ja." : m)).replace(/^Nein$/, "Nein.");
}
