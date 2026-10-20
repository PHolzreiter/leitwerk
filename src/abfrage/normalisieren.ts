/**
 * Schema-Übersetzer: Ein fremdes Abfrageschema wird beim Laden auf die neutralen Merkmale von LeitWerk
 * abgebildet. Innen (Fälle, Anrufer, Lage, Verstehen, KI-Anweisungen) arbeitet das Spiel immer mit diesen
 * Merkmalen („bw“ = Bewusstsein ja/getruebt/nein …); das Schema bleibt für Fragetexte, Regeln und Codes zuständig.
 *
 * Die Merkmale sind die Fragen des mitgelieferten LeitWerk-Codesystems (Katalog). Zuordnung einer Frage:
 *   1. ausdrücklich in der Datei („merkmal“ an der Frage, „merkmal_wert“ an den Antworten),
 *   2. gleiche ID wie ein Merkmal,
 *   3. automatisch über Fragetext und Antworttexte (auch umgedrehte Fragen: „bewusstlos?“ = Bewusstsein „nein“).
 * Zugeordnete Fragen bekommen die ID des Merkmals, ihre Antworten die neutralen Werte – Regeln und Bedingungen
 * werden mit umbenannt, Fragetexte und Beschriftungen bleiben. So läuft die ganze Spiellogik unverändert.
 *
 * Ein Schema, das schon überwiegend die LeitWerk-IDs verwendet, gilt als „kompatibel“: dort wird nichts
 * automatisch zugeordnet (nur ausdrückliche Angaben), damit sich an einem gepflegten Schema nichts verschiebt.
 */
import type { Antworten, Bedingung, Frage, Kapitel, Regel, Schema } from "./schema";
import { thema } from "./themen";
import { ABKUERZUNGEN, ANTWORT_WORTE, FACHBEGRIFFE, MERKMAL_WORTE } from "./merkmalWorte";
import { jaRichtung, richtung, schwereVon } from "./schwere";
import type { StufeDef } from "../sim/settings";

export interface Zuordnung {
  /** „global“ oder Kapitelnummer (erstes Vorkommen) */
  wo: string;
  /** ID der Frage in der geladenen Datei */
  frage: string;
  text: string;
  /** neutrales Merkmal (null = keins gefunden) */
  merkmal: string | null;
  /** Frage ist umgedreht gestellt („bewusstlos?“ statt „wach?“) */
  umgekehrt: boolean;
  /** Antwortwert in der Datei → neutraler Wert (fehlt = bleibt, wie er ist) */
  werte: Record<string, string>;
  quelle: "explizit" | "gleich" | "automatisch" | "keine";
  /** 0…1 (nur automatisch) */
  sicherheit: number;
  /** zugeordnet, aber nicht umbenannt (Merkmal ist schon an einer anderen Frage) */
  abgeleitet?: boolean;
  /** zusammengesetzte Frage („bewusstlos oder atmet nicht normal?“): „ja“, wenn ein Teil zutrifft */
  teile?: { merkmal: string; ja: string[] }[];
  /** über die Regeln als umgedreht erkannt (Ja/Nein getauscht) */
  gedreht?: boolean;
  /** Zuordnung kam als KI-Vorschlag (steht in der Datei als „merkmal_quelle“: "ki") */
  ki?: boolean;
}

export interface Uebersetzung {
  schema: Schema;
  zuordnung: Zuordnung[];
  kompatibel: boolean;
  /** Anteil der Fragen mit Merkmal (ohne Freitext) */
  abdeckung: number;
  /** wichtige Merkmale, die keine Frage gefunden haben */
  fehlend: string[];
  /** Einsatzstufen für Kategorien ohne sprechenden Namen (aus dem Aufbau des Codesystems) */
  stufen: Record<string, StufeDef>;
}

/** „merkmal“: "keins" – Frage ausdrücklich keinem Merkmal zuordnen */
export const KEIN_MERKMAL = "keins";

/** Merkmale, ohne die das Spiel Anrufer und Patienten nur raten kann */
export const KERN_MERKMALE = ["alter", "geschlecht", "bw", "at", "anzahl_patienten"];

// ------------------------------------------------------------------ Wörter

const STOP = new Set(
  "der die das den dem des ein eine einen einem einer eines ist sind war waren wurde wurden wird werden hat haben hatte es er sie ihn ihm ihr ihre ihren sein seine seinen person personen patient patientin patienten pat jemand man sich noch schon gerade aktuell jetzt bitte und oder auch mit von vom zu zum zur im in am an auf aus bei fuer um wie was wo wer welche welcher welches welchen gibt kann koennen sein etwa ungefaehr sehr da dort hier dabei denn dass ob nur als so z b bzw usw dies diese dieser bis vor ort liegt vorliegend".split(" "),
);

/** Wortgruppen, die dasselbe meinen (Fragen werden sehr unterschiedlich formuliert) */
const GRUPPEN: [RegExp, string][] = [
  [/^(atm|atem|beatm|luft(?!roehr))/, "ATEM"],
  [/^(bewusst|wach|ansprech|reagier|reaktion|orientier)/, "BEWUSST"],
  [/^(blut(?!er$|verd)|blutung)/, "BLUT"],
  [/^(verletz|wunde|trauma)/, "VERLETZ"],
  [/^schmerz/, "SCHMERZ"],
  [/^(brust|thorax)/, "BRUST"],
  [/^(alt|jahr|lebensjahr)$/, "ALTER"],
  [/^schwanger/, "SCHWANGER"],
  [/^(sturz|stuerz|gestuerzt|gefallen|hingefallen|abgestuerzt)/, "STURZ"],
  [/^(hoeh|meter)/, "HOEHE"],
  [/^(eingeklemm|eingeschlossen|eingesperrt|festgeklemm)/, "KLEMM"],
  [/^(bruch|knochenbr|fehlstell|fraktur|gebrochen)/, "BRUCH"],
  [/^(krampf|kraempf|anfall|zuck(?!er))/, "KRAMPF"],
  [/^(zucker|diabet|unterzucker|ueberzucker)/, "ZUCKER"],
  [/^(herz|kardi|infarkt|angina)/, "HERZ"],
  [/^(lunge|asthma|copd)/, "LUNGE"],
  [/^(sprech|sprach|rede|redet|satz|worte)/, "SPRACH"],
  [/^(haut|hautfarbe|blass|grau|blau|blaeu|bleich|zyano|fahl)/, "HAUT"],
  [/^(schweiss|kaltschweiss|verschwitz|nass)/, "SCHWEISS"],
  [/^(waffe|messer|pistole)/, "WAFFE"],
  [/^(gewalt|aggress|gewalttaetig|tobt|randali)/, "GEWALT"],
  [/^(geschlecht|maennlich|weiblich|mann|frau|bub|maedchen)$/, "GESCHLECHT"],
  [/^(anzahl|viele|mehrere|betroffen|beteiligt)/, "ANZAHL"],
  [/^(verwirr|desorient)/, "VERWIRRT"],
  [/^(laehm|halbseit|haengend|schwaech)/, "LAEHMUNG"],
  [/^(tot|leblos|verstorben|todeszeich)/, "TOT"],
  [/^(vergift|ueberdos|tabletten|substanz|drogen)/, "GIFT"],
  [/^(feuer|brand|brennt|flamme|rauch)/, "FEUER"],
  [/^(unfall|kollision|zusammenstoss|crash)/, "UNFALL"],
  [/^(medikament|tablette|arznei)/, "MEDIK"],
  [/^(blutverduenn|gerinnungshemm|marcumar|antikoag)/, "BLUTVERD"],
];

/** Wörter, die eine Verneinung enthalten („bewusstlos“ = nicht wach) */
const GEGENTEIL: [RegExp, string][] = [
  [/^(bewusstlos|regungslos|reglos|bewusstseinslos)/, "BEWUSST"],
  [/^(unverletzt)/, "VERLETZ"],
  [/^(atemstillstand|atemlos)/, "ATEM"],
];

function ohneUmlaut(t: string): string {
  return t.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

interface Woerter {
  w: Set<string>;
  /** ungerade Zahl von Verneinungen */
  neg: boolean;
  /** fragt nach dem gesunden Zustand („wach?“, „atmet normal?“, „Lächeln symmetrisch?“) statt nach einer Störung */
  normal: boolean;
  /** enthält überhaupt einen Hinweis darauf (Verneinung, gesund/gestört)? */
  signal: boolean;
}

/** Wörter für den gesunden Zustand – und solche, die trotzdem eine Störung meinen („anders als sonst“) */
const NORMAL = /^(normal|unauffaell|gewohnt|ueblich|symmetr|gleich$|orientiert|kooperativ|rosig|stabil|selbststaend|trocken|ruhig|regelmaess|wach|ansprechbar|klar|kraeftig|reagiert|frei|eupnoe|eupnoisch|reorientiert)/;
const GESTOERT = /^(anders|auffaellig|verwirrt|haengt|sinkt|schief|problem|gestoert|eingeschraenkt|abnorm)/;

/** Abkürzungen und Fachbegriffe eines Textes als zusätzliche Alltagswörter */
function erweiterung(text: string): string {
  const dazu: string[] = [];
  for (const [re, w] of [...ABKUERZUNGEN, ...FACHBEGRIFFE]) {
    re.lastIndex = 0;
    if (re.test(text)) dazu.push(w);
    re.lastIndex = 0;
  }
  return dazu.join(" ");
}

/** Wort → Vergleichsform (Wortgruppe oder die ersten 6 Buchstaben) */
function form(x: string): string | null {
  if (STOP.has(x) || x.length < 3) return null;
  const gr = GRUPPEN.find(([re]) => re.test(x));
  return gr ? gr[1] : x.slice(0, 6);
}

function woerter(text: string, klammern = false): Woerter {
  const roh = ohneUmlaut(text)
    .replace(/\([^)]*\)/g, (m) => (klammern ? ` ${m.slice(1, -1)} ` : " ")) // Klammer-Beispiele zählen meist nicht
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const w = new Set<string>();
  let neg = 0;
  let gesund = false;
  let gestoert = false;
  // Verneinung zählt nur im ersten Satzteil („Sinkt ein Arm ab oder kann er nicht gehoben werden?“ ist nicht umgedreht)
  let teil = 0;
  for (const x of roh) {
    if (/^(oder|bzw|beziehungsweise)$/.test(x)) teil++;
    if (teil === 0 && NORMAL.test(x)) gesund = true;
    if (teil === 0 && GESTOERT.test(x)) gestoert = true;
    if (/^(nicht|kein|keine|keinen|keiner|ohne)$/.test(x)) {
      if (teil === 0) neg++;
      continue;
    }
    const g = GEGENTEIL.find(([re]) => re.test(x));
    if (g) {
      neg++;
      // „bewusstlos“ = nicht wach, „Atemstillstand“ = atmet nicht – verneint einen gesunden Zustand
      if (teil === 0 && (g[1] === "BEWUSST" || g[1] === "ATEM")) gesund = true;
      w.add(g[1]);
      continue;
    }
    if (STOP.has(x) || x.length < 3) continue;
    const gr = GRUPPEN.find(([re]) => re.test(x));
    w.add(gr ? gr[1] : x.slice(0, 6));
  }
  // Abkürzungen/Fachbegriffe ergänzen (ohne Einfluss auf Verneinung)
  for (const x of ohneUmlaut(erweiterung(text)).split(/[^a-z0-9]+/)) {
    if (!x || /^(nicht|kein|keine|keinen|keiner|ohne)$/.test(x)) continue;
    const f = form(x);
    if (f) w.add(f);
  }
  const n = neg % 2 === 1;
  return { w, neg: n, normal: (gesund && !gestoert) !== n, signal: gesund || gestoert || neg > 0 };
}

/** Zusätzliche Wörter für Antworten, die sehr verschieden beschriftet werden */
const ANTWORT_FACHWORTE: Record<string, string> = {
  "anrufer.1": "Patient selbst Betroffener erste Hand",
  "anrufer.2": "Angehöriger Bekannter vor Ort dabei zweite Hand",
  "anrufer.3": "Passant Zeuge nicht dabei dritte Hand",
  "anrufer.einrichtung": "Arzt Pflege Pflegepersonal Einrichtung Heim Ordination",
  "anrufer.system": "automatisch System Alarm",
  "at.abnorm": "erschwert Atemnot schwer gestört",
  "at.agonal": "Schnappatmung agonal vereinzelt",
  "bw.getruebt": "eingetrübt getrübt verwirrt benommen schläfrig",
  "hoehe.boden": "Stand ebenerdig Boden",
};

/** Wörter einer Antwortmöglichkeit: auch Klammern und Zahlwörter zählen („Eine“ = 1, „Keine“ = 0) */
function antwortWoerter(label: string, wert?: string): Set<string> {
  const roh = `${label} ${wert && !/^(ja|nein|unbekannt)$/.test(wert) ? wert.replace(/_/g, " ") : ""}`;
  const t = ohneUmlaut(`${roh} ${erweiterung(roh)}`);
  const w = new Set<string>();
  for (const x of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^(ein|eine|eins|einer|einen|einem|1)$/.test(x)) w.add("#1");
    else if (/^(mehrere|viele|n)$/.test(x)) w.add("#n");
    else if (/^(keine|keiner|kein|0)$/.test(x)) w.add("#0");
    else if (x === "nein") w.add("#nein");
    else if (x === "ja") w.add("#ja");
    else if (/^\d+$/.test(x)) w.add(`#${x}`);
    else if (STOP.has(x) || x.length < 3 || /^(akut|akute|akuter|ploetzlich|gerade|eben|etwas)$/.test(x)) continue;
    else {
      // bei Antworten zählt das genaue Wort (Asthma ≠ COPD)
      const gr = GRUPPEN.find(([re, g]) => g !== "LUNGE" && re.test(x));
      w.add(gr ? gr[1] : x.slice(0, 6));
    }
  }
  return w;
}

function aehnlich(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.sqrt(a.size * b.size);
}

const JA = /^(ja|yes|j)\b/;
const NEIN = /^(nein|no|n)\b/;
const UNBEKANNT = /^(unbekannt|weiss nicht|weiß nicht|unklar|unsicher|keine angabe|k\.? ?a\.?)\b/;

function art(o: { wert: string; label: string }): "ja" | "nein" | "unbekannt" | null {
  const t = ohneUmlaut(`${o.label}`).trim();
  const v = ohneUmlaut(o.wert).trim();
  if (UNBEKANNT.test(t) || UNBEKANNT.test(v)) return "unbekannt";
  if (JA.test(t) || v === "ja" || v === "j") return "ja";
  if (NEIN.test(t) || v === "nein" || v === "n") return "nein";
  // Kurzschreibweisen in Checklisten: „+“ / „-“ / „?“, „positiv/negativ“, „vorhanden / nicht vorhanden“
  const kurz = t || v;
  // auch mit Erklärung dahinter: „+ (wach, adäquat)“, „- (bewusstlos)“
  if (/^(\+|✓|✔)(\s|\(|$)|^(x|positiv|pos\.?|vorhanden|zutreffend|true|yes|y)$/.test(kurz)) return "ja";
  if (/^(-|–|—)(\s|\(|$)|^(negativ|neg\.?|nicht vorhanden|unzutreffend|false|no|0)$/.test(kurz)) return "nein";
  if (/^\?+(\s|\(|$)|^(k\.?\s?a\.?|unklar|n\.?\s?b\.?)$/.test(kurz)) return "unbekannt";
  return null;
}

// ------------------------------------------------------------------ Katalog

/**
 * Zusätzliche Wörter je Merkmal – wie Fachleute bzw. andere Abfragesysteme dasselbe fragen
 * (der Katalog selbst ist in Laiensprache formuliert).
 */
const FACHWORTE: Record<string, string> = {
  anrufer: "Anrufer Melder wer meldet Beziehung",
  anzahl_patienten: "Anzahl Patienten Betroffene wie viele Verletzte Personen",
  alter: "Alter Jahre alt",
  geschlecht: "Geschlecht männlich weiblich",
  bw: "Bewusstsein wach ansprechbar reagiert orientiert Bewusstseinslage",
  at: "Atmung atmet normal Atmung normal",
  sprachschw: "Sprechdyspnoe nur einzelne Worte sprechen ganze Sätze kurze Sätze Sprechpausen",
  hautfarbe: "Hautfarbe Zyanose blau grau Lippen",
  kaltschweiss: "kaltschweißig Schweiß blass",
  lungenerkrankung: "Lungenerkrankung Asthma COPD Lunge",
  tracheostoma: "Tracheostoma Kanüle Luftröhrenschnitt",
  herz_vg: "Herzinfarkt Angina Pectoris Herzerkrankung Vorgeschichte",
  kokain: "Kokain Drogen Amphetamine",
  herzleiden: "Herzleiden Herzerkrankung bekannt",
  bauchschmerz: "Bauchschmerzen Unterbauch",
  tod: "offensichtlich tot Tod erwartet verstorben sichere Todeszeichen|sichere Todeszeichen tot",
  todeszeichen: "Todeszeichen Leichenstarre Totenflecken Verwesung",
  erwartet_grund: "Tod erwartet Endstadium Palliativ Verfügung",
  unzweifelhaft: "sicher tot unzweifelhaft absolut",
  ursache_9: "Ursache erhängt Strangulation Ersticken",
  beobachtet: "beobachtet Zusammenbruch gesehen Kollaps beobachtet",
  fast_gesicht: "Gesicht lächeln Mundwinkel hängt Gesichtshälfte",
  fast_arm: "Arme heben sinkt Arm absinken",
  fast_sprache: "Satz nachsprechen verwaschen Sprache",
  sprachstoerung: "Sprachstörung spricht undeutlich Sprachstörungen",
  schwaeche: "Schwäche Taubheitsgefühl Körperseite halbseitig",
  laehmung: "Lähmung gelähmt Lähmungserscheinungen Hemiparese",
  gleichgewicht: "Gleichgewicht Koordination Schwindel stehen",
  sehen: "Sehstörung Sehstörungen Doppelbilder sehen",
  kopfschmerz: "Kopfschmerzen plötzlich stark",
  vg_schlaganfall: "früherer Schlaganfall Gehirntumor Vorgeschichte Schlaganfall",
  seit: "seit wann Beginn Symptombeginn Stunden",
  krampft: "krampft noch Krampfanfall andauernd Status",
  atmung_geprueft: "Atmung überprüft geprüft",
  epilepsie: "Epilepsie Epileptiker Anfallsleiden",
  atypisch: "atypisch anders als sonst Anfall",
  schwanger: "schwanger Schwangerschaft entbunden Geburt",
  diabetiker: "Diabetiker Diabetes zuckerkrank Insulin",
  vergiftung: "Vergiftung Überdosis Drogen Tabletten Alkohol",
  verhalten: "Verhalten abnormal auffällig verwirrt aggressiv",
  gewalttaetig: "gewalttätig Gewalt aggressiv",
  ursache: "Auslöser Ursache Allergie Insekt Schlange",
  atem_schluck: "Atembeschwerden Schluckbeschwerden Atmen Schlucken",
  vorgeschichte: "frühere schwere allergische Reaktion Anaphylaxie Vorgeschichte",
  symptome: "Beschwerden Juckreiz Schwellung Ausschlag",
  medikation: "Notfallmedikament Adrenalin Pen Injektion",
  ohnmacht: "Ohnmacht ohnmächtig Synkope",
  schmerzort: "Schmerzort wo Schmerzen Nabel oberhalb unterhalb",
  zerreiss: "reißend zerreißend Rücken Schmerz",
  aneurysma: "Aortenaneurysma Aneurysma Hauptschlagader",
  grau: "aschfahl grau fahl Haut",
  ploetzlich_stark: "Donnerschlag plötzlich stärkste Kopfschmerz",
  taubheit: "Taubheitsgefühl taub Kribbeln",
  reanimiert: "wiederbelebt reanimiert defibrilliert geschockt",
  defi: "implantierter Defibrillator ICD LifeVest ausgelöst",
  brustschmerz: "Brustschmerzen Brust Schmerz",
  puls: "Puls Herzfrequenz langsam schnell",
  hauptbeschwerde: "Hauptbeschwerde Hauptproblem",
  verwirrt: "verwirrt desorientiert Orientierung",
  sonderdiagnose: "bekannte Erkrankung Notfallplan Sonderdiagnose",
  anz_symptome: "Symptome Anzahl Grippe Fieber Husten",
  brust: "Brustschmerzen Druck Brust",
  hochrisiko: "Risikopatient Hochrisiko Immunschwäche Vorerkrankungen",
  lage: "Situation Suizid Suizidgedanken springen",
  ubg: "Unterbringung UBG Zwangseinweisung Polizei",
  substanzen: "Medikamente Drogen Alkohol eingenommen",
  ploetzlich: "Verhalten plötzlich verändert Verhaltensänderung Persönlichkeit",
  psych_vorerkrankung: "psychische Erkrankung psychiatrisch",
  blutung: "Blutung blutet",
  gewalt: "gewalttätig Gewalt",
  waffen: "Waffen Waffe",
  selbstverbrennung: "anzünden Selbstverbrennung",
  krisenteam: "Krisendienst Krisenteam Kriseninterventions",
  absicht: "Absicht absichtlich versehentlich Suizidversuch",
  substanz: "Substanz Stoff Gift Mittel",
  viz: "Vergiftungsinformationszentrale Giftnotruf",
  aggressiv: "aggressiv gewalttätig",
  ssw: "Schwangerschaftswoche SSW Woche",
  mehrlinge: "Zwillinge Mehrlinge",
  situation: "Geburtssituation Wehen Fruchtblase Kind sichtbar",
  kompl_baby: "Baby Neugeborenes Probleme",
  kompl_mutter: "Mutter Probleme Blutung",
  blutung_stark: "starke Blutung stark blutet spritzt",
  komplikationen: "Schwangerschaftskomplikationen Risikoschwangerschaft Plazenta",
  hoehe: "Sturzhöhe Höhe Meter gestürzt gefallen",
  verletzt: "verletzt Verletzung",
  region: "Körperregion verletzt wo Verletzung Körperteil",
  fehlstellung: "Fehlstellung Bruch Fraktur offensichtlich",
  aelter6h: "länger als 6 Stunden her",
  umstand: "besondere Umstände Liegezeit Boden",
  schwer_pat: "schwergewichtig Übergewicht Tragehilfe Gewicht",
  amputation: "Amputation abgetrennt",
  hohe_energie: "hohe Energie Wucht Krafteinwirkung Aufprall",
  stelle: "Blutungsquelle Stelle Krampfader Shunt",
  staerke: "Blutungsstärke wie stark blutet",
  bluter: "Bluter Hämophilie Gerinnungsstörung",
  blutverduenner: "Blutverdünner gerinnungshemmend Marcumar",
  verletzte: "Verletzte verletzt",
  grossunfall: "Großunfall Bus Zug Massenkarambolage",
  mechanismus: "Unfallmechanismus Motorrad Fußgänger Überschlag geschleudert",
  hohe_geschw: "hohe Geschwindigkeit Autobahn Freiland",
  gefahrgut: "Gefahrgut Gefahrstoff Tankwagen",
  eingeklemmt: "eingeklemmt eingeschlossen",
  andere_gefahren: "Gefahren Feuer Rauch Kraftstoff Treibstoff Benzin ausläuft brennt Fahrzeug",
  gering: "geringer Unfallmechanismus Parkschaden leichter Anstoß",
  anrufer_selbst: "Anrufer selbst beteiligt leicht verletzt",
  koerperteil: "eingeklemmter Körperteil",
  sicher_betroffen: "sicher Person verschüttet betroffen",
  schwer_verletzt: "schwer verletzt",
  anz_eingeklemmt: "Anzahl eingeklemmt eingeschlossen",
  anz_verletzt: "Anzahl verletzt",
  art: "Verbrennung Explosion Feuer Ursache",
  brennt_noch: "brennt noch Kleidung",
  eingeschlossen: "eingeschlossen Gebäude Brand",
  mehrere_verletzte: "mehrere Verletzte",
  gesicht: "Gesicht Verbrennung Atemwege",
  flaeche: "verbrannte Fläche Prozent Körperoberfläche",
  nur_alarm: "Brandmeldeanlage Alarm unklar",
  betroffene: "Beschwerden betroffen Symptome",
  noch_verbunden: "Kontakt Stromquelle verbunden",
  strom_an: "Strom eingeschaltet Gefahr",
  sturz: "abgestürzt Sturz Höhe",
  wo: "Wo Person jetzt Wasser Ufer",
  ueber6h: "über 6 Stunden unter Wasser vermisst",
  hws: "Halswirbelsäule Nacken HWS Wirbelsäule|Halswirbelsäulen Verletzung",
  deko: "Dekompression Taucher Tauchunfall",
  mehrere_symptome: "mehrere Personen betroffen ernste Beschwerden",
  tierart: "Tierart Tier Hund",
  angriff_laeuft: "Angriff noch Tier greift",
  schwer: "Wunde schwer tief zerfetzt",
  oberflaechlich: "oberflächlich Kratzer Bisswunde",
  deliktart: "Delikt Körperverletzung Sexualdelikt",
  taeter_vor_ort: "Täter vor Ort Gefahr",
  tot: "unzweifelhaft tot",
  selbst: "selbst zugefügt Selbstverletzung",
  noch_gepfaehlt: "steckt noch gepfählt Gegenstand",
  wunde: "Wunde Lage zentral peripher",
  anzahl_wunden: "Anzahl Wunden",
  polizei: "Polizei verständigt",
  augen: "Augenverletzung Auge",
  woran: "verschluckt woran Fremdkörper",
  atemweg: "Atemweg verlegt husten sprechen",
  alpin: "Alpin Berg Bergung Lawine",
  sprachkontakt: "Sprachkontakt Insassen Sprechkontakt",
  lebensbedrohung: "Lebensbedrohung lebensbedrohlich",
  anforderer: "Anforderer wer fordert",
  grund: "Grund der Anforderung Anforderungsgrund",
  dringlichkeit: "Dringlichkeit dringend Transport",
  transportart: "Transportart liegend sitzend Rollstuhl",
  problem: "Problem Polizei meldet",
  von: "anfordernde Stelle Organisation",
  mittel: "Rettungsmittel angefordert",
};

interface KatFrage {
  id: string;
  typ: Frage["typ"];
  texte: Woerter[];
  optionen: { wert: string; label: string; w: Set<string>; art: ReturnType<typeof art> }[];
  themen: Set<string>;
  global: boolean;
  /** fragt nach dem gesunden Zustand (Text und „Ja“-Antwort, z. B. „Ja, wach und normal“) */
  normal: boolean;
}

const katCache = new WeakMap<Schema, Map<string, KatFrage>>();

function katalogAus(kat: Schema): Map<string, KatFrage> {
  const c = katCache.get(kat);
  if (c) return c;
  const m = new Map<string, KatFrage>();
  const dazu = (f: Frage, th: string | null) => {
    if (f.typ === "text" || f.typ === "kapitelwahl") return;
    let k = m.get(f.id);
    if (k) {
      // gleiche ID in mehreren Kapiteln: alle Antwortmöglichkeiten sammeln
      for (const o of f.optionen ?? []) if (!k.optionen.some((x) => x.wert === o.wert)) k.optionen.push({ wert: o.wert, label: o.label, w: antwortWoerter(`${o.label} ${ANTWORT_FACHWORTE[`${f.id}.${o.wert}`] ?? ""} ${ANTWORT_WORTE[`${f.id}.${o.wert}`] ?? ""}`, o.wert), art: art(o) });
    }
    if (!k) {
      k = {
        id: f.id,
        typ: f.typ,
        texte: [],
        optionen: (f.optionen ?? []).map((o) => ({ wert: o.wert, label: o.label, w: antwortWoerter(`${o.label} ${ANTWORT_FACHWORTE[`${f.id}.${o.wert}`] ?? ""} ${ANTWORT_WORTE[`${f.id}.${o.wert}`] ?? ""}`, o.wert), art: art(o) })),
        themen: new Set(),
        global: th === null,
        normal: woerter(`${f.text} ${(f.optionen ?? []).find((o) => art(o) === "ja")?.label ?? ""}`).normal,
      };
      m.set(f.id, k);
    }
    k.texte.push(woerter(f.text));
    if (k.texte.length === 1) {
      for (const t of [...(FACHWORTE[f.id] ?? "").split("|"), ...(MERKMAL_WORTE[f.id] ?? "").split("|")].filter(Boolean)) k.texte.push(woerter(t));
      k.texte.push(woerter(f.id.replace(/_/g, " ")));
    }
    if (th) k.themen.add(th);
  };
  for (const l of Object.values(kat.globale_fragen ?? {})) for (const f of l) dazu(f, null);
  for (const K of Object.values(kat.kapitel ?? {})) for (const f of K.fragen ?? []) dazu(f, K.thema ?? null);
  katCache.set(kat, m);
  return m;
}

// ------------------------------------------------------------------ Werte zuordnen

/** Antworten der Datei → neutrale Werte (eindeutig: zwei Antworten bekommen nie denselben Wert) */
function werteZuordnen(f: Frage, k: KatFrage, umgekehrt: boolean, _fw: Woerter): { werte: Record<string, string>; anteil: number } {
  const werte: Record<string, string> = {};
  const vergeben = new Set<string>();
  const opts = f.optionen ?? [];
  if (!opts.length) return { werte, anteil: f.typ === k.typ ? 1 : 0 };
  const setze = (von: string, nach: string | undefined) => {
    if (!nach || vergeben.has(nach) || werte[von]) return;
    werte[von] = nach;
    vergeben.add(nach);
  };
  if (istJaNein(f)) {
    // reine Ja/Nein-Frage: „ja“ = die erste (gesunde bzw. zutreffende) Antwort des Merkmals
    let jaZiel = k.optionen.find((o) => o.art === "ja")?.wert ?? k.optionen.find((o) => /^ja\b/.test(ohneUmlaut(o.label)))?.wert;
    let neinZiel = k.optionen.find((o) => o.art === "nein")?.wert ?? k.optionen.find((o) => /^nein\b/.test(ohneUmlaut(o.label)))?.wert ?? k.optionen.find((o) => /^(nein|keine?)$/.test(o.wert))?.wert;
    if (!jaZiel) {
      // Ja/Nein-Frage zu einer Auswahl („Sichere Todeszeichen?“ ↔ Tod: nein/möglich/offensichtlich): „ja“ = die Antwort, die zur Frage passt
      const fv = woerter(f.text, true).w;
      let best = 0;
      for (const o of k.optionen) {
        if (o.wert === neinZiel || o.art === "unbekannt") continue;
        const sc = aehnlich(fv, o.w);
        if (sc > best && sc >= 0.25) {
          best = sc;
          jaZiel = o.wert;
        }
      }
      neinZiel ??= k.optionen[0]?.wert !== jaZiel ? k.optionen[0]?.wert : undefined;
    }
    // Atmung: „nicht normal“ bzw. „Atemnot“ heißt erschwert – „keine“ nur, wenn ausdrücklich gar nicht geatmet wird
    if (k.id === "at") {
      const t = ohneUmlaut(f.text);
      neinZiel = umgekehrt ? (/gar nicht|atemstillstand|keine atmung|atmet nicht|apnoe/.test(t) ? "keine" : "abnorm") : /normal|unauffaell|ruhig|regelm|frei|eupno/.test(t) ? "abnorm" : "keine";
    }
    for (const o of opts) {
      const a = art(o);
      if (a === "unbekannt") setze(o.wert, k.optionen.find((x) => x.art === "unbekannt" || x.wert === "unbekannt")?.wert);
      else if (a === "ja") setze(o.wert, umgekehrt ? neinZiel : jaZiel);
      else if (a === "nein") setze(o.wert, umgekehrt ? jaZiel : neinZiel);
    }
  } else {
    // Auswahl: beste Paare aus Beschriftung (und Wert) zuerst. „Ja/Nein“ am Anfang zählt nur, wenn es eindeutig ist
    // („Nein – erschwert“ und „Nein – keine Atmung“ unterscheiden sich erst im Rest); bei umgedrehter Frage getauscht.
    const anzahl = (a: string | null) => opts.filter((o) => art(o) === a).length;
    const tausch = (a: string | null) => (umgekehrt && a === "ja" ? "nein" : umgekehrt && a === "nein" ? "ja" : a);
    const paare: { von: string; nach: string; s: number }[] = [];
    for (const o of opts) {
      const oa = art(o);
      const rest = o.label.replace(/^\s*(ja|nein)\b[\s,–—:-]*/i, "");
      const ow = antwortWoerter(rest || o.label, o.wert);
      for (const x of k.optionen) {
        let sc = aehnlich(ow, x.w);
        // gleiche Zahl („über 3 m“ ↔ „3 bis 10 Meter“) ist ein starker Hinweis
        if ([...ow].some((t) => /^#\d{1,3}$/.test(t) && t !== "#1" && t !== "#0" && x.w.has(t))) sc += 0.3;
        if (x.wert === o.wert && !umgekehrt) sc = Math.max(sc, 0.95);
        if (oa && anzahl(oa) === 1 && tausch(oa) === x.art) sc = Math.max(sc, 0.9);
        if (sc >= 0.34) paare.push({ von: o.wert, nach: x.wert, s: sc });
      }
    }
    paare.sort((a, b) => b.s - a.s);
    for (const p of paare) setze(p.von, p.nach);
    // bleibt genau eine Antwort auf jeder Seite übrig, gehören sie zusammen
    const offenVon = opts.filter((o) => !werte[o.wert] && art(o) !== "unbekannt");
    const offenNach = k.optionen.filter((x) => !vergeben.has(x.wert) && x.art !== "unbekannt" && x.wert !== "unbekannt");
    if (offenVon.length === 1 && offenNach.length === 1 && Object.keys(werte).length >= 2) setze(offenVon[0].wert, offenNach[0].wert);
  }
  // „Weiß nicht“ passt überall – zählt nicht als Beleg
  const echt = opts.filter((o) => art(o) !== "unbekannt");
  return { werte, anteil: echt.length ? echt.filter((o) => werte[o.wert]).length / echt.length : Object.keys(werte).length / opts.length };
}

/** Fragt eine Ja/Nein-Frage zur Atmung nach einer Störung („Atemnot?“) statt nach normaler Atmung? */
function atmungGestoert(text: string): boolean {
  text = `${text} ${erweiterung(text)}`;
  return /atemnot|erschwert|schwer|roechel|schnapp|gestoert|apnoe|stillstand|atmet nicht|keine atmung|nicht normal|dyspnoe|luftnot|pfeif/.test(ohneUmlaut(text));
}

function istJaNein(f: { optionen?: { wert: string; label: string }[] }): boolean {
  const o = f.optionen ?? [];
  const arten = o.map((x) => art(x));
  // reine Ja/Nein-Frage: jede Antwortart nur einmal (sonst „Nein – erschwert“ / „Nein – keine Atmung“ = Auswahl)
  return o.length >= 2 && arten.every((a) => a !== null) && new Set(arten).size === arten.length;
}

// ------------------------------------------------------------------ Hauptfunktion

interface Vorkommen {
  frage: Frage;
  wo: string;
  thema: string | null;
}

/** Woran man ein Kapitel ohne „thema“ erkennt (Titel und Stichworte) */
const THEMA_WORTE: [string, RegExp][] = [
  ["stillstand", /stillstand|reanimation|leblos|herzstillstand|atemstillstand|\brea\b|\bcpr\b/],
  ["verkehrsunfall", /verkehrsunfall|\bvu\b|autounfall|unfall.*(fahrzeug|auto|verkehr)/],
  ["ecall", /ecall|e-call|automatische unfallmeldung/],
  ["eingeklemmt", /eingeklemmt|eingeschlossen|verschuettet/],
  ["brustschmerz", /brustschmerz|thoraxschmerz|brustkorb|druck auf der brust|\bacs\b|koronar/],
  ["herz", /herzrhythmus|herzproblem|herzrasen|herzbeschwerd|rhythmus/],
  ["atemnot", /atemnot|atembeschwerd|dyspnoe|luftnot|atemprobleme|^atmung\b|\batmung$/],
  ["schlaganfall", /schlaganfall|insult|stroke|neuro|apoplex/],
  ["bewusstlos", /bewusstlos|kollaps|ohnmacht|synkope|kreislauf/],
  ["sturz", /sturz|gestuerzt|absturz|gefallen|hoehe/],
  ["blutung", /blutung|blutet|haemorrhag/],
  ["krampf", /krampf|epilep/],
  ["hitze_kaelte", /^(?!.*(feuer|brand)).*(hitze|kaelte|unterkuehl|sonnenstich|hypotherm|hypertherm)/],
  ["zucker", /zucker|diabet|hypoglyk|\bhypo\b/],
  ["vergiftung", /vergiftung|ueberdosis|intox/],
  ["allergie", /allergi|anaphyla/],
  ["ersticken", /ersticken|verschluck|fremdkoerper|aspiration/],
  ["schwangerschaft", /schwanger|geburt|entbindung|gyn|wehen/],
  ["psych", /psych|suizid|verhaltensauff|seel/],
  ["verletzung", /verletzung|trauma(?!.*sturz)/],
  ["bauch", /bauch|abdomen/],
  ["ruecken", /ruecken/],
  ["kopfschmerz", /kopfschmerz/],
  ["brand", /brand|verbrennung|explosion|feuer/],
  ["gefahrstoff", /gefahrstoff|\bgas\b|rauchgas|kohlenmonoxid|chemie/],
  ["wasser", /ertrink|wasserunfall|tauch/],
  ["strom", /strom|elektr|blitz/],
  ["tierbiss", /tierbiss|biss|tier/],
  ["gewalt", /gewalt|ueberfall|koerperverletzung/],
  ["stich_schuss", /stich|schuss/],
  ["auge", /auge/],
  ["infekt", /infekt|fieber|covid|grippe/],
  ["alpin", /alpin|berg|lawine/],
  ["anforderung_arzt", /anforderung.*(arzt|pflege|einrichtung)|aerztlich/],
  ["anforderung_polizei", /anforderung.*polizei|polizei/],
  ["anforderung_ls", /andere leitstelle|leitstelle/],
  ["krank", /krank|unwohl|schwaeche|unklar|internist|sonstig|nicht gut|befinden/],
];

function themaRaten(K: Kapitel): string | null {
  const t = ohneUmlaut(`${K.titel ?? ""}`);
  const st = ohneUmlaut((K.stichworte ?? []).join(" "));
  for (const [id, re] of THEMA_WORTE) if (re.test(t)) return id;
  for (const [id, re] of THEMA_WORTE) if (re.test(st)) return id;
  return null;
}

function alleFragen(s: Schema, themen: Record<string, string | null>): Map<string, Vorkommen[]> {
  const m = new Map<string, Vorkommen[]>();
  const dazu = (f: Frage, wo: string, th: string | null) => {
    if (!f?.id) return;
    const l = m.get(f.id) ?? [];
    l.push({ frage: f, wo, thema: th });
    m.set(f.id, l);
  };
  for (const l of Object.values(s.globale_fragen ?? {})) for (const f of l ?? []) dazu(f, "global", null);
  for (const [k, K] of Object.entries(s.kapitel ?? {})) for (const f of K.fragen ?? []) dazu(f, k, themen[k] ?? null);
  return m;
}

const cache = new WeakMap<Schema, WeakMap<Schema, Uebersetzung>>();

interface Kandidat {
  id: string;
  k: KatFrage;
  score: number;
  umgekehrt: boolean;
  werte: Record<string, string>;
}

/** Wie gut passt eine Frage (Text) zu einem Merkmal? */
function bewerten(f: Frage, fwTextRoh: Woerter, fw: Woerter, k: KatFrage, vk: Vorkommen[]): Kandidat | null {
  let fwText = fwTextRoh;
  if ((k.typ === "zahl") !== (f.typ === "zahl")) return null;
  const jn = istJaNein(f);
  // auch gemischte Antworten („Ja – keine Reaktion“, „Nein, aber verwirrt“, „Nein – wach“) können umgedreht gefragt sein
  const jaNeinArt = (f.optionen ?? []).some((o) => art(o) === "ja") && (f.optionen ?? []).some((o) => art(o) === "nein");
  // sagt der Fragetext nichts („Bewusstsein?“), entscheidet die Beschriftung der Ja-Antwort („+ (wach, adäquat)“)
  if (!fwText.signal) {
    const jaLabel = (f.optionen ?? []).find((o) => art(o) === "ja")?.label.replace(/^\s*(ja\b|\+|✓|✔)[\s,–—:(-]*/i, "") ?? "";
    const lw = woerter(jaLabel);
    if (lw.signal) fwText = { ...fwText, normal: lw.normal };
  }
  let text = 0;
  let umgekehrt = false;
  for (const kt of k.texte) {
    const a = Math.max(aehnlich(fwText.w, kt.w), aehnlich(fw.w, kt.w) * 0.9);
    if (a > text) {
      text = a;
      // umdrehen nur, wenn auch das Merkmal Ja/Nein kennt (sonst entscheiden die Beschriftungen der Antworten)
      const katJaNein = k.optionen.some((o) => o.art === "ja") && k.optionen.some((o) => o.art === "nein");
      umgekehrt = jaNeinArt && katJaNein && (k.id === "at" ? atmungGestoert(f.text) : fwText.normal !== k.normal);
    }
  }
  // Auswahlfragen: auch die Antwortmöglichkeiten sagen, worum es geht („Hergang: absichtlich / versehentlich …“)
  let opt = 0;
  const fo = (f.optionen ?? []).filter((o) => art(o) !== "unbekannt");
  const ko = k.optionen.filter((x) => x.art !== "unbekannt" && x.wert !== "unbekannt");
  if (!jn && fo.length >= 2 && ko.length >= 2) {
    let summe = 0;
    for (const o of fo) {
      const ow = antwortWoerter(o.label, o.wert);
      summe += Math.max(...ko.map((x) => (x.wert === o.wert ? 1 : aehnlich(ow, x.w))));
    }
    opt = summe / fo.length;
  }
  const inhalt = Math.max(text, 0.45 * text + 0.55 * opt);
  if (inhalt < 0.34) return null;
  const { werte, anteil } = werteZuordnen(f, k, umgekehrt, fwText);
  // Thema: Merkmale eines Kapitels passen besser zu Fragen desselben Themas
  const themen = new Set(vk.map((x) => x.thema).filter(Boolean) as string[]);
  const global = vk.some((x) => x.wo === "global");
  let bonus = 0;
  if (k.global && global) bonus += 0.2;
  else if (global && !k.global) bonus -= 0.1;
  else if (!k.global && [...themen].some((t) => k.themen.has(t))) bonus += 0.1;
  else if (!k.global && themen.size && !global) bonus -= 0.05;
  const score = inhalt * 0.75 + anteil * 0.25 + bonus;
  if (score < 0.5 || anteil <= 0) return null;
  return { id: f.id, k, score, umgekehrt, werte };
}

/** Passt ein Merkmal zu jedem „oder“-Teil der Frage fast so gut wie das beste Merkmal für diesen Teil? (dann ist sie nur ausführlich gefragt) */
function deckt(k: KatFrage, text: string, katalog: Map<string, KatFrage>): boolean {
  const teile = text.replace(/\([^)]*\)/g, " ").split(/\s+oder\s+|,\s*/i).map((x) => woerter(x).w).filter((w) => w.size);
  return teile.every((w) => {
    const eigen = Math.max(...k.texte.map((t) => aehnlich(w, t.w)));
    let best = 0;
    for (const x of katalog.values()) for (const t of x.texte) best = Math.max(best, aehnlich(w, t.w));
    return eigen >= 0.45 && eigen >= 0.85 * best;
  });
}

/** Teile einer zusammengesetzten Ja/Nein-Frage („bewusstlos oder atmet nicht normal?“) */
function teileVon(f: Frage, katalog: Map<string, KatFrage>): { merkmal: string; ja: string[] }[] | null {
  if (!istJaNein(f)) return null;
  const t = f.text.replace(/\([^)]*\)/g, " ");
  // nur „oder“ trennt zwei Dinge – ein Schrägstrich steht meist für dasselbe („Fehlstellung / Bruch“)
  if (!/\s+oder\s+/i.test(t)) return null;
  const stuecke = t.split(/\s+oder\s+|,\s*/i).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2 || x.replace(/[^a-zäöüß]/gi, "").length >= 6);
  if (stuecke.length < 2) return null;
  const teile: { merkmal: string; ja: string[]; score: number }[] = [];
  for (const st of stuecke) {
    const w = woerter(st);
    let best: { k: KatFrage; s: number; neg: boolean } | null = null;
    for (const k of katalog.values()) {
      if (k.typ === "zahl") continue;
      for (const kt of k.texte) {
        const sc = aehnlich(w.w, kt.w);
        if (!best || sc > best.s) best = { k, s: sc, neg: k.id === "at" ? atmungGestoert(st) : w.normal !== k.normal };
      }
    }
    if (!best || best.s < 0.5) return null;
    const k = best.k;
    // welche neutralen Werte machen diesen Teil zu „ja“?
    const pseudo: Frage = { id: "x", text: st, typ: "single", optionen: [{ wert: "J", label: "Ja" }, { wert: "N", label: "Nein" }] };
    const { werte } = werteZuordnen(pseudo, k, best.neg, w);
    if (!werte.J) return null;
    let ja = [werte.J];
    // „atmet nicht normal“: alles außer normal (und unbekannt)
    if (best.neg && k.id !== "bw") ja = k.optionen.map((o) => o.wert).filter((x) => x !== werte.N && x !== "unbekannt" && k.optionen.find((o) => o.wert === x)?.art !== "unbekannt");
    if (!ja.length) return null;
    teile.push({ merkmal: k.id, ja, score: best.s });
  }
  const zusammen = new Map<string, Set<string>>();
  for (const t of teile) for (const j of t.ja) (zusammen.get(t.merkmal) ?? zusammen.set(t.merkmal, new Set()).get(t.merkmal)!).add(j);
  if (zusammen.size < 2) return null;
  return [...zusammen].map(([merkmal, ja]) => ({ merkmal, ja: [...ja] }));
}

/** Schema auf die Merkmale des Katalogs abbilden (Ergebnis wird je Schema gemerkt) */
export function uebersetzeSchema(s: Schema, kat: Schema | null): Uebersetzung {
  if (!kat) return { schema: s, zuordnung: [], kompatibel: true, abdeckung: 1, fehlend: [], stufen: {} };
  let proKat = cache.get(s);
  const fertig = proKat?.get(kat);
  if (fertig) return fertig;
  const katalog = katalogAus(kat);
  const roheIds = new Set([...Object.values(s.globale_fragen ?? {}).flat(), ...Object.values(s.kapitel ?? {}).flatMap((K) => K.fragen ?? [])].filter((f) => f && f.typ !== "text" && f.typ !== "kapitelwahl").map((f) => f.id));
  const kompatibel = roheIds.size > 0 && [...roheIds].filter((id) => katalog.has(id)).length / roheIds.size >= 0.5;
  // Themen der Kapitel: angegeben, sonst aus Titel/Stichworten geraten, sonst nach der Nummer (AMPDS-Art)
  const themen: Record<string, string | null> = {};
  const geraten: Record<string, string> = {};
  for (const [k, K] of Object.entries(s.kapitel ?? {})) {
    if (K.thema || kompatibel) themen[k] = thema(k, s) || null;
    else {
      const g = themaRaten(K);
      themen[k] = g ?? (thema(k, s) || null);
      if (g) geraten[k] = g;
    }
  }
  let zuordnung = zuordnen(s, katalog, themen, kompatibel);
  // Kapitel ohne erkennbaren Titel: Thema aus dem Inhalt (Merkmale der Fragen, Namen der Codes) – dann noch einmal zuordnen
  if (!kompatibel) {
    let neu = false;
    for (const [k, K] of Object.entries(s.kapitel ?? {})) {
      if (K.thema || geraten[k]) continue;
      const g = themaAusInhalt(s, k, zuordnung, katalog);
      if (g && g !== themen[k]) {
        themen[k] = g;
        geraten[k] = g;
        neu = true;
      }
    }
    if (neu) zuordnung = zuordnen(s, katalog, themen, kompatibel);
    polungPruefen(s, kat, zuordnung);
  }

  const schema = umbenennen(s, zuordnung, geraten);
  const mitMerkmal = zuordnung.filter((z) => z.merkmal || z.teile).length;
  const da = new Set(zuordnung.flatMap((z) => [z.merkmal, ...(z.teile ?? []).map((t) => t.merkmal)]).filter(Boolean));
  const u: Uebersetzung = {
    schema,
    zuordnung,
    kompatibel,
    abdeckung: zuordnung.length ? mitMerkmal / zuordnung.length : 1,
    fehlend: KERN_MERKMALE.filter((m) => !da.has(m)),
    stufen: kompatibel ? {} : schwereVon(s).stufen,
  };
  if (!proKat) cache.set(s, (proKat = new WeakMap()));
  proKat.set(kat, u);
  return u;
}

function zuordnen(s: Schema, katalog: Map<string, KatFrage>, themen: Record<string, string | null>, kompatibel: boolean): Zuordnung[] {
  const vorkommen = alleFragen(s, themen);
  const ids = [...vorkommen.keys()].filter((id) => {
    const f = vorkommen.get(id)![0].frage;
    return f.typ !== "text" && f.typ !== "kapitelwahl";
  });
  const zuordnung: Zuordnung[] = [];
  const belegt = new Set<string>(ids); // IDs, die es in der Datei schon gibt
  const kandidaten: Kandidat[] = [];
  const zusammen = new Map<string, { merkmal: string; ja: string[] }[]>();

  for (const id of ids) {
    const vk = vorkommen.get(id)!;
    const f = vk[0].frage;
    const z: Zuordnung = { wo: vk[0].wo, frage: id, text: f.text, merkmal: null, umgekehrt: false, werte: {}, quelle: "keine", sicherheit: 0 };
    zuordnung.push(z);
    // 1. ausdrücklich
    const explizit = (f as { merkmal?: string }).merkmal;
    if (explizit === KEIN_MERKMAL) {
      z.quelle = "explizit";
      z.sicherheit = 1;
      continue;
    }
    if (explizit) {
      z.merkmal = explizit;
      z.quelle = "explizit";
      z.sicherheit = 1;
      if ((f as { merkmal_quelle?: string }).merkmal_quelle === "ki") z.ki = true;
      for (const o of f.optionen ?? []) {
        const mw = (o as { merkmal_wert?: string }).merkmal_wert;
        if (mw) z.werte[o.wert] = mw;
      }
      // Merkmal von Hand gewählt, Antworten nicht: Antworten automatisch zuordnen
      const k = katalog.get(explizit);
      if (k && !Object.keys(z.werte).length && f.optionen?.length && !f.optionen.every((o) => k.optionen.some((x) => x.wert === o.wert))) {
        const fw = woerter(f.text);
        const umg = istJaNein(f) && (k.id === "at" ? atmungGestoert(f.text) : fw.normal !== k.normal);
        z.umgekehrt = umg;
        z.werte = werteZuordnen(f, k, umg, fw).werte;
      }
      continue;
    }
    // 2. gleiche ID
    if (katalog.has(id)) {
      z.merkmal = id;
      z.quelle = "gleich";
      z.sicherheit = 1;
      continue;
    }
    if (kompatibel) continue;
    // 3. automatisch
    const fw = woerter(`${f.text} ${f.hinweis ?? ""}`.trim(), true);
    const fwText = woerter(f.text);
    let bester: Kandidat | null = null;
    for (const k of katalog.values()) {
      const c = bewerten(f, fwText, fw, k, vk);
      if (c) {
        kandidaten.push(c);
        if (!bester || c.score > bester.score) bester = c;
      }
    }
    // zusammengesetzt („A oder B“): passen die Teile zu verschiedenen Merkmalen und erklärt kein einzelnes Merkmal beide Teile
    const t = teileVon(f, katalog);
    const zwilling = (a: string, b: string) => a === b || ZWILLINGE.some((g) => g.includes(a) && g.includes(b));
    if (t && !(bester && (deckt(bester.k, f.text, katalog) || t.every((x) => zwilling(x.merkmal, bester!.k.id))))) zusammen.set(id, t);
  }
  // beste Paare zuerst; dasselbe Merkmal darf in mehreren Kapiteln vorkommen (gleiche Frage, gleiche Antwort) – nicht zweimal im selben
  kandidaten.sort((a, b) => b.score - a.score);
  const fertigIds = new Set<string>();
  const vergebenWo = new Map<string, Set<string>>();
  const woVon = (id: string) => new Set(vorkommen.get(id)!.map((x) => x.wo));
  const kollidiert = (m: string, wo: Set<string>) => {
    const da = vergebenWo.get(m);
    if (!da) return false;
    if (da.has("global") || wo.has("global")) return true;
    return [...wo].some((w) => da.has(w));
  };
  for (const [id, t] of zusammen) {
    const z = zuordnung.find((x) => x.frage === id)!;
    z.teile = t;
    z.quelle = "automatisch";
    z.sicherheit = 0.7;
    fertigIds.add(id);
  }
  for (const c of kandidaten) {
    if (fertigIds.has(c.id)) continue;
    const z = zuordnung.find((x) => x.frage === c.id)!;
    const wo = woVon(c.id);
    if (kollidiert(c.k.id, wo)) continue;
    const set = vergebenWo.get(c.k.id) ?? new Set<string>();
    for (const w of wo) set.add(w);
    vergebenWo.set(c.k.id, set);
    z.merkmal = c.k.id;
    z.quelle = "automatisch";
    z.sicherheit = Math.min(1, Math.round(c.score * 100) / 100);
    z.umgekehrt = c.umgekehrt;
    z.werte = c.werte;
    // gibt es die ID schon als eigene Frage, wird nur zugeordnet, nicht umbenannt
    if (belegt.has(c.k.id)) z.abgeleitet = true;
    fertigIds.add(c.id);
  }
  for (const z of zuordnung) if (z.quelle === "explizit" && z.merkmal && z.merkmal !== z.frage && belegt.has(z.merkmal)) z.abgeleitet = true;
  return zuordnung;
}

/** Thema eines Kapitels aus seinen Fragen (welchem Thema gehören deren Merkmale an?) und den Namen seiner Codes */
function themaAusInhalt(s: Schema, kap: string, zuordnung: Zuordnung[], katalog: Map<string, KatFrage>): string | null {
  const K = s.kapitel[kap];
  const stimmen = new Map<string, number>();
  const plus = (t: string, n: number) => stimmen.set(t, (stimmen.get(t) ?? 0) + n);
  for (const f of K.fragen ?? []) {
    const z = zuordnung.find((x) => x.frage === f.id);
    const k = z?.merkmal ? katalog.get(z.merkmal) : undefined;
    if (!k || k.global || !k.themen.size) continue;
    for (const t of k.themen) plus(t, 1 / k.themen.size);
  }
  // Namen der Codes dieses Kapitels („Sturz: große Höhe“)
  const codes = Object.entries(s.codes ?? {}).filter(([, c]) => (c.kapitel ?? "").trim().split(/\s*[-–:]\s*/)[0] === kap);
  for (const [, c] of codes) {
    const t = ohneUmlaut(`${c.name} ${c.kapitel}`);
    for (const [id, re] of THEMA_WORTE) if (re.test(t)) {
      plus(id, 0.5);
      break;
    }
  }
  const best = [...stimmen].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 1 ? best[0] : null;
}

/**
 * Umgedrehte Fragen ohne Verneinungswort („Kann er beide Arme gleich hoch halten?“ ↔ „Sinkt ein Arm ab?“):
 * Führt im Codesystem „ja“ zu harmloseren Codes, im LeitWerk-Codesystem der zugeordnete Wert aber zu schwereren
 * (oder umgekehrt), ist die Frage umgedreht – dann werden Ja und Nein getauscht.
 */
function polungPruefen(s: Schema, kat: Schema, zuordnung: Zuordnung[]): void {
  const fremd = richtung(s);
  const eigen = richtung(kat);
  const fragen = new Map([...Object.values(s.globale_fragen ?? {}).flat(), ...Object.values(s.kapitel ?? {}).flatMap((K) => K.fragen ?? [])].map((f) => [f.id, f] as const));
  for (const z of zuordnung) {
    if (z.quelle !== "automatisch" || !z.merkmal) continue;
    const f = fragen.get(z.frage);
    if (!f || !istJaNein(f)) continue;
    const ja = f.optionen!.find((o) => art(o) === "ja")?.wert;
    const nein = f.optionen!.find((o) => art(o) === "nein")?.wert;
    if (!ja || !nein || !z.werte[ja] || !z.werte[nein]) continue;
    const fd = jaRichtung(fremd, z.frage, ja, nein);
    const kd = jaRichtung(eigen, z.merkmal, z.werte[ja], z.werte[nein]);
    if (fd === undefined || kd === undefined) continue;
    // nur bei deutlichem Widerspruch auf beiden Seiten (Kategorien wie „ALS grün“/„BLS gelb“ sind nicht streng geordnet)
    if (Math.min(Math.abs(fd), Math.abs(kd)) >= 0.15 && Math.max(Math.abs(fd), Math.abs(kd)) >= 0.25 && Math.sign(fd) !== Math.sign(kd)) {
      const a = z.werte[ja];
      z.werte[ja] = z.werte[nein];
      z.werte[nein] = a;
      z.umgekehrt = !z.umgekehrt;
      z.gedreht = true;
    }
  }
}

// ------------------------------------------------------------------ Umbenennen

/** Kopie des Schemas mit neutralen IDs und Werten (Texte bleiben) */
function umbenennen(s: Schema, zuordnung: Zuordnung[], geraten: Record<string, string> = {}): Schema {
  const um = new Map<string, Zuordnung>();
  const merk = new Map<string, Zuordnung>();
  const teile = new Map<string, Zuordnung>();
  for (const z of zuordnung) {
    if (z.teile) teile.set(z.frage, z);
    if (!z.merkmal) continue;
    if (z.abgeleitet || z.merkmal === z.frage) {
      // nur Merkmal vermerken (Wahrheit wird über merkmaleInSchema übertragen)
      if (z.merkmal !== z.frage || Object.keys(z.werte).length) merk.set(z.frage, z);
      continue;
    }
    um.set(z.frage, z);
  }
  if (!um.size && !merk.size && !teile.size && !Object.keys(geraten).length) return s;
  const id = (q: string) => um.get(q)?.merkmal ?? q;
  const wert = (q: string, v: string) => um.get(q)?.werte[v] ?? v;
  const bed = (b: Bedingung | null | undefined): Bedingung | null | undefined => {
    if (!b) return b;
    if ("all" in b) return { all: b.all.map((x) => bed(x)!) };
    if ("any" in b) return { any: b.any.map((x) => bed(x)!) };
    if ("not" in b) return { not: bed(b.not)! };
    if ("q" in b) return { ...b, q: id(b.q), ...(b.in ? { in: b.in.map((v) => wert(b.q, v)) } : {}) };
    return b;
  };
  const vorb = (v: Antworten | undefined): Antworten | undefined => {
    if (!v) return v;
    const o: Antworten = {};
    for (const [k, x] of Object.entries(v)) o[id(k)] = typeof x === "string" ? wert(k, x) : x;
    return o;
  };
  const frage = (f: Frage): Frage => {
    const z = um.get(f.id);
    const m = merk.get(f.id);
    const n: Frage = { ...f, ...(f.anzeigen_wenn ? { anzeigen_wenn: bed(f.anzeigen_wenn) } : {}) };
    const tz = teile.get(f.id);
    if (tz) {
      // zusammengesetzt: Antwort wird aus den Teil-Merkmalen berechnet
      (n as { teile?: unknown }).teile = {
        ja: f.optionen?.find((o) => art(o) === "ja")?.wert,
        nein: f.optionen?.find((o) => art(o) === "nein")?.wert,
        unbekannt: f.optionen?.find((o) => art(o) === "unbekannt")?.wert,
        merkmale: tz.teile,
      };
    }
    if (z) {
      n.id = z.merkmal!;
      if (f.optionen) n.optionen = f.optionen.map((o) => ({ ...o, wert: wert(f.id, o.wert) }));
      if (z.umgekehrt) (n as { umgekehrt?: boolean }).umgekehrt = true;
    } else if (m && !(f as { merkmal?: string }).merkmal) {
      // abgeleitet: Merkmal an die Frage schreiben, damit die Wahrheit übertragen wird
      (n as { merkmal?: string }).merkmal = m.merkmal!;
      if (f.optionen) n.optionen = f.optionen.map((o) => (m.werte[o.wert] ? { ...o, merkmal_wert: m.werte[o.wert] } : o)) as Frage["optionen"];
    }
    return n;
  };
  const regel = (r: Regel): Regel => {
    const n: Regel = { ...r };
    if (r.wenn) n.wenn = bed(r.wenn);
    if (r.vorbelegung) n.vorbelegung = vorb(r.vorbelegung);
    const m = r.code_nach_antwort;
    if (m) {
      const fr = m.frage ? [m.frage] : (m.fragen ?? []);
      const zuo: Record<string, string> = {};
      for (const [k, c] of Object.entries(m.zuordnung)) zuo[k.split("|").map((v, i) => (fr[i] ? wert(fr[i], v) : v)).join("|")] = c;
      n.code_nach_antwort = { ...m, ...(m.frage ? { frage: id(m.frage) } : {}), ...(m.fragen ? { fragen: m.fragen.map(id) } : {}), zuordnung: zuo };
    }
    return n;
  };
  const p: Schema = { ...s, globale_fragen: {}, kapitel: {} };
  for (const [ph, l] of Object.entries(s.globale_fragen ?? {})) p.globale_fragen[ph] = (l ?? []).map(frage);
  for (const [k, K] of Object.entries(s.kapitel ?? {})) {
    const n: Kapitel = { ...K, fragen: (K.fragen ?? []).map(frage), regeln: (K.regeln ?? []).map(regel) };
    if (!K.thema && geraten[k]) n.thema = geraten[k];
    if (K.suffix) n.suffix = { ...K.suffix, regeln: (K.suffix.regeln ?? []).map((r) => ({ ...r, wenn: bed(r.wenn)! })) };
    if (K.kreislaufstillstand) n.kreislaufstillstand = { ...K.kreislaufstillstand, ...(K.kreislaufstillstand.vorbelegung ? { vorbelegung: vorb(K.kreislaufstillstand.vorbelegung) } : {}) };
    p.kapitel[k] = n;
  }
  return p;
}

// ------------------------------------------------------------------ Wahrheit an die Antworten des Schemas anpassen

/** Merkmale, die (fast) dasselbe fragen – mit denselben Antwortwerten */
export const ZWILLINGE: string[][] = [
  ["brustschmerz", "brust"],
  ["herzleiden", "herz_vg"],
  ["gewalttaetig", "gewalt", "aggressiv"],
  ["tot", "unzweifelhaft"],
  ["verwirrt", "verhalten"],
  ["kaltschweiss", "hautfarbe", "grau"],
  ["kopfschmerz", "ploetzlich_stark"],
  ["laehmung", "schwaeche", "fast_arm"],
  ["sprachstoerung", "fast_sprache"],
];

/** Ersatzwerte, wenn das Schema einen Wert nicht kennt (z. B. nur „atmet normal: ja/nein“) */
/** … bei umgedrehter Frage („bewusstlos?“): getrübt ist „nicht bewusstlos“ */
const NAEHE_UMGEKEHRT: Record<string, Record<string, string[]>> = {
  bw: { getruebt: ["ja", "nein"], unbekannt: ["nein"] },
};
const NAEHE: Record<string, Record<string, string[]>> = {
  bw: { getruebt: ["nein", "ja"], unbekannt: ["nein"] },
  at: { agonal: ["keine", "abnorm"], abnorm: ["keine"], keine: ["agonal", "abnorm"], unbekannt: ["abnorm"] },
  anzahl_patienten: { unbekannt: ["1"] },
  geschlecht: { unbekannt: ["m"] },
  blutung: { gefaehrlich: ["stark"], schwach: ["nein"] },
  staerke: { gefaehrlich: ["stark"], gering: ["schwach"] },
  hoehe: { extrem: ["gross"], treppe: ["boden"] },
};

/**
 * Wahrheit (neutrale Werte) so anpassen, dass jede Antwort zu einer Antwortmöglichkeit des Schemas passt.
 * roh = die ursprünglichen Werte der angepassten Antworten (für Anrufer und Lage, die mehr wissen dürfen).
 */
export function wahrheitAnpassen(schema: Schema, a: Antworten): { antworten: Antworten; roh: Antworten } {
  const roh: Antworten = {};
  const out: Antworten = { ...a };
  const optionen = new Map<string, Set<string>>();
  const umgekehrt = new Set<string>();
  const dazu = (f: Frage) => {
    if (f.typ !== "single" || !f.optionen?.length) return;
    if ((f as { umgekehrt?: boolean }).umgekehrt) umgekehrt.add(f.id);
    const s = optionen.get(f.id) ?? new Set<string>();
    for (const o of f.optionen) s.add(o.wert);
    optionen.set(f.id, s);
  };
  for (const l of Object.values(schema.globale_fragen ?? {})) for (const f of l ?? []) dazu(f);
  for (const K of Object.values(schema.kapitel ?? {})) for (const f of K.fragen ?? []) dazu(f);
  // gleichbedeutende Merkmale: fehlt eins, gilt der Wert des Zwillings (Fall setzt „brustschmerz“, Schema fragt „brust“)
  for (const gruppe of ZWILLINGE) {
    const da = gruppe.find((m) => a[m] !== undefined && a[m] !== null);
    if (!da) continue;
    for (const m of gruppe) if (a[m] === undefined && optionen.get(m)?.has(String(a[da]))) out[m] = a[da];
  }
  // was aus dem Bewusstsein folgt, wenn der Fall es nicht eigens festlegt (fremde Schemas fragen oft danach)
  const folge = (m: string, v: string) => {
    if (a[m] === undefined && out[m] === undefined && optionen.get(m)?.has(v)) out[m] = v;
  };
  if (a.bw === "getruebt") {
    folge("verwirrt", "ja");
    folge("verhalten", "ja");
  }
  if (a.bw === "ja") folge("verwirrt", "nein");
  // zusammengesetzte Fragen: „ja“, wenn ein Teil zutrifft, „nein“, wenn alle bekannt und keiner zutrifft
  const zusammen: Frage[] = [];
  for (const l of Object.values(schema.globale_fragen ?? {})) for (const f of l ?? []) if ((f as { teile?: unknown }).teile) zusammen.push(f);
  for (const K of Object.values(schema.kapitel ?? {})) for (const f of K.fragen ?? []) if ((f as { teile?: unknown }).teile) zusammen.push(f);
  for (const f of zusammen) {
    const t = (f as unknown as { teile: { ja?: string; nein?: string; unbekannt?: string; merkmale: { merkmal: string; ja: string[] }[] } }).teile;
    const werte = t.merkmale.map((m) => a[m.merkmal]);
    const trifft = t.merkmale.some((m) => m.ja.includes(String(a[m.merkmal])));
    const alleBekannt = werte.every((w) => w !== undefined && w !== null && w !== "unbekannt");
    const w = trifft ? t.ja : alleBekannt ? t.nein : (t.unbekannt ?? t.nein);
    if (w !== undefined && a[f.id] === undefined) out[f.id] = w;
  }
  for (const [id, v] of Object.entries(a)) {
    if (typeof v !== "string") continue;
    const opts = optionen.get(id);
    if (!opts || opts.has(v)) continue;
    const ersatz = ((umgekehrt.has(id) ? NAEHE_UMGEKEHRT[id]?.[v] : undefined) ?? NAEHE[id]?.[v] ?? []).find((x) => opts.has(x)) ?? (opts.has("unbekannt") ? "unbekannt" : undefined);
    if (ersatz === undefined) continue;
    roh[id] = v;
    out[id] = ersatz;
  }
  return { antworten: out, roh };
}

/** Wird die Antwort dieser Frage aus anderen Merkmalen berechnet (zusammengesetzte Frage)? */
export function istZusammengesetzt(schema: Schema, id: string): boolean {
  for (const l of Object.values(schema.globale_fragen ?? {})) for (const f of l ?? []) if (f.id === id) return !!(f as { teile?: unknown }).teile;
  for (const K of Object.values(schema.kapitel ?? {})) for (const f of K.fragen ?? []) if (f.id === id) return !!(f as { teile?: unknown }).teile;
  return false;
}

/** Merkmale des Katalogs für die Auswahl (ID, Frage im LeitWerk-Codesystem, Antworten) */
export function merkmalListe(kat: Schema): { id: string; text: string; werte: { wert: string; label: string }[] }[] {
  const m = new Map<string, { id: string; text: string; werte: { wert: string; label: string }[] }>();
  const dazu = (f: Frage) => {
    if (f.typ === "text" || f.typ === "kapitelwahl") return;
    const x = m.get(f.id) ?? { id: f.id, text: f.text, werte: [] };
    for (const o of f.optionen ?? []) if (!x.werte.some((w) => w.wert === o.wert)) x.werte.push({ wert: o.wert, label: o.label });
    m.set(f.id, x);
  };
  for (const l of Object.values(kat.globale_fragen ?? {})) for (const f of l) dazu(f);
  for (const K of Object.values(kat.kapitel ?? {})) for (const f of K.fragen ?? []) dazu(f);
  return [...m.values()];
}

/** Die wahrscheinlichsten Merkmale für eine Frage (für KI-Vorschläge), beste zuerst */
export function merkmalKandidaten(f: Frage, kat: Schema, n = 10): string[] {
  const katalog = katalogAus(kat);
  const fw = woerter(`${f.text} ${f.hinweis ?? ""}`, true);
  const teile = f.text.split(/\s+oder\s+/i).map((t) => woerter(t).w);
  return [...katalog.values()]
    .filter((k) => (k.typ === "zahl") === (f.typ === "zahl"))
    .map((k) => ({ id: k.id, s: Math.max(...k.texte.map((t) => Math.max(aehnlich(fw.w, t.w), ...teile.map((w) => aehnlich(w, t.w))))) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.id);
}

/** nur für Tests */
export const _intern = { woerter, katalogAus, aehnlich };
