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
}

export interface Uebersetzung {
  schema: Schema;
  zuordnung: Zuordnung[];
  kompatibel: boolean;
  /** Anteil der Fragen mit Merkmal (ohne Freitext) */
  abdeckung: number;
  /** wichtige Merkmale, die keine Frage gefunden haben */
  fehlend: string[];
}

/** „merkmal“: "keins" – Frage ausdrücklich keinem Merkmal zuordnen */
export const KEIN_MERKMAL = "keins";

/** Merkmale, ohne die das Spiel Anrufer und Patienten nur raten kann */
export const KERN_MERKMALE = ["alter", "geschlecht", "bw", "at", "anzahl_patienten"];

// ------------------------------------------------------------------ Wörter

const STOP = new Set(
  "der die das den dem des ein eine einen einem einer eines ist sind war waren wurde wurden wird werden hat haben hatte es er sie ihn ihm ihr ihre ihren sein seine seinen person personen patient patientin patienten pat jemand man sich noch schon gerade aktuell jetzt bitte und oder auch mit von vom zu zum zur im in am an auf aus bei fuer um wie was wo wer welche welcher welches welchen gibt kann koennen sein etwa ungefaehr sehr da dort hier dabei denn dass ob nur als so z b bzw usw dies diese dieser bis".split(" "),
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
  [/^(bruch|fehlstell|fraktur|gebrochen)/, "BRUCH"],
  [/^(krampf|kraempf|anfall|zuck)/, "KRAMPF"],
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
}

function woerter(text: string, klammern = false): Woerter {
  const roh = ohneUmlaut(text)
    .replace(/\([^)]*\)/g, (m) => (klammern ? ` ${m.slice(1, -1)} ` : " ")) // Klammer-Beispiele zählen meist nicht
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const w = new Set<string>();
  let neg = 0;
  // Verneinung zählt nur im ersten Satzteil („Sinkt ein Arm ab oder kann er nicht gehoben werden?“ ist nicht umgedreht)
  let teil = 0;
  for (const x of roh) {
    if (/^(oder|bzw|beziehungsweise)$/.test(x)) teil++;
    if (/^(nicht|kein|keine|keinen|keiner|nie|niemals|ohne)$/.test(x)) {
      if (teil === 0) neg++;
      continue;
    }
    const g = GEGENTEIL.find(([re]) => re.test(x));
    if (g) {
      neg++;
      w.add(g[1]);
      continue;
    }
    if (STOP.has(x) || x.length < 3) continue;
    const gr = GRUPPEN.find(([re]) => re.test(x));
    w.add(gr ? gr[1] : x.slice(0, 6));
  }
  return { w, neg: neg % 2 === 1 };
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
  const t = ohneUmlaut(`${label} ${wert && !/^(ja|nein|unbekannt)$/.test(wert) ? wert.replace(/_/g, " ") : ""}`);
  const w = new Set<string>();
  for (const x of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^(ein|eine|eins|einer|einen|einem|1)$/.test(x)) w.add("#1");
    else if (/^(mehrere|viele|n)$/.test(x)) w.add("#n");
    else if (/^(keine|keiner|kein|0)$/.test(x)) w.add("#0");
    else if (/^(nein|nicht)$/.test(x)) w.add("#nein");
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
      for (const o of f.optionen ?? []) if (!k.optionen.some((x) => x.wert === o.wert)) k.optionen.push({ wert: o.wert, label: o.label, w: antwortWoerter(`${o.label} ${ANTWORT_FACHWORTE[`${f.id}.${o.wert}`] ?? ""}`, o.wert), art: art(o) });
    }
    if (!k) {
      k = {
        id: f.id,
        typ: f.typ,
        texte: [],
        optionen: (f.optionen ?? []).map((o) => ({ wert: o.wert, label: o.label, w: antwortWoerter(`${o.label} ${ANTWORT_FACHWORTE[`${f.id}.${o.wert}`] ?? ""}`, o.wert), art: art(o) })),
        themen: new Set(),
        global: th === null,
      };
      m.set(f.id, k);
    }
    k.texte.push(woerter(f.text));
    if (k.texte.length === 1) {
      for (const t of (FACHWORTE[f.id] ?? "").split("|").filter(Boolean)) k.texte.push(woerter(t));
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
function werteZuordnen(f: Frage, k: KatFrage, umgekehrt: boolean, fw: Woerter): { werte: Record<string, string>; anteil: number } {
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
    // „Atmet er normal? – nein“ heißt „nicht normal“, nicht „atmet nicht“
    if (k.id === "at" && fw.w.has("normal")) neinZiel = "abnorm";
    for (const o of opts) {
      const a = art(o);
      if (a === "unbekannt") setze(o.wert, k.optionen.find((x) => x.art === "unbekannt" || x.wert === "unbekannt")?.wert);
      else if (a === "ja") setze(o.wert, umgekehrt ? neinZiel : jaZiel);
      else if (a === "nein") setze(o.wert, umgekehrt ? jaZiel : neinZiel);
    }
  } else {
    // Auswahl: beste Paare aus Beschriftung (und Wert) zuerst
    const paare: { von: string; nach: string; s: number }[] = [];
    for (const o of opts) {
      const ow = antwortWoerter(o.label, o.wert);
      const oa = art(o);
      for (const x of k.optionen) {
        let sc = aehnlich(ow, x.w);
        if (x.wert === o.wert) sc = Math.max(sc, 0.95);
        if (oa && oa === x.art) sc = Math.max(sc, 0.9);
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
  return { werte, anteil: Object.keys(werte).length / opts.length };
}

function istJaNein(f: { optionen?: { wert: string; label: string }[] }): boolean {
  const o = f.optionen ?? [];
  return o.length >= 2 && o.every((x) => art(x) !== null);
}

// ------------------------------------------------------------------ Hauptfunktion

interface Vorkommen {
  frage: Frage;
  wo: string;
  thema: string | null;
}

/** Woran man ein Kapitel ohne „thema“ erkennt (Titel und Stichworte) */
const THEMA_WORTE: [string, RegExp][] = [
  ["stillstand", /stillstand|reanimation|leblos|herzstillstand|atemstillstand/],
  ["verkehrsunfall", /verkehrsunfall|\bvu\b|autounfall|unfall.*(fahrzeug|auto|verkehr)/],
  ["ecall", /ecall|e-call|automatische unfallmeldung/],
  ["eingeklemmt", /eingeklemmt|eingeschlossen|verschuettet/],
  ["brustschmerz", /brustschmerz|thoraxschmerz|brustkorb|druck auf der brust/],
  ["herz", /herzrhythmus|herzproblem|herzrasen|herzbeschwerd|rhythmus/],
  ["atemnot", /atemnot|atembeschwerd|dyspnoe|luftnot|atemprobleme/],
  ["schlaganfall", /schlaganfall|insult|stroke|neurologisch/],
  ["bewusstlos", /bewusstlos|kollaps|ohnmacht|synkope/],
  ["sturz", /sturz|gestuerzt|absturz|gefallen/],
  ["blutung", /blutung|blutet|haemorrhag/],
  ["krampf", /krampf|epilep/],
  ["zucker", /zucker|diabet|hypoglyk/],
  ["vergiftung", /vergiftung|ueberdosis|intoxikation/],
  ["allergie", /allergi|anaphyla/],
  ["ersticken", /ersticken|verschluck|fremdkoerper/],
  ["schwangerschaft", /schwanger|geburt|entbindung/],
  ["psych", /psych|suizid|verhaltensauff/],
  ["verletzung", /verletzung|trauma(?!.*sturz)/],
  ["bauch", /bauch|abdomen/],
  ["ruecken", /ruecken/],
  ["kopfschmerz", /kopfschmerz/],
  ["brand", /brand|verbrennung|explosion/],
  ["gefahrstoff", /gefahrstoff|\bgas\b|rauchgas|kohlenmonoxid|chemie/],
  ["wasser", /ertrink|wasserunfall|tauch/],
  ["strom", /strom|elektr|blitz/],
  ["hitze_kaelte", /hitze|kaelte|unterkuehl|sonnenstich/],
  ["tierbiss", /tierbiss|biss|tier/],
  ["gewalt", /gewalt|ueberfall|koerperverletzung/],
  ["stich_schuss", /stich|schuss/],
  ["auge", /auge/],
  ["infekt", /infekt|fieber|covid|grippe/],
  ["alpin", /alpin|berg|lawine/],
  ["anforderung_arzt", /anforderung.*(arzt|pflege|einrichtung)|aerztlich/],
  ["anforderung_polizei", /anforderung.*polizei|polizei/],
  ["anforderung_ls", /andere leitstelle|leitstelle/],
  ["krank", /krank|unwohl|schwaeche|unklar/],
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

/** Schema auf die Merkmale des Katalogs abbilden (Ergebnis wird je Schema gemerkt) */
export function uebersetzeSchema(s: Schema, kat: Schema | null): Uebersetzung {
  if (!kat) return { schema: s, zuordnung: [], kompatibel: true, abdeckung: 1, fehlend: [] };
  let proKat = cache.get(s);
  const fertig = proKat?.get(kat);
  if (fertig) return fertig;
  const katalog = katalogAus(kat);
  // Themen der Kapitel: angegeben, sonst aus Titel/Stichworten geraten, sonst nach der Nummer (AMPDS-Art)
  const roheIds = new Set([...Object.values(s.globale_fragen ?? {}).flat(), ...Object.values(s.kapitel ?? {}).flatMap((K) => K.fragen ?? [])].filter((f) => f && f.typ !== "text" && f.typ !== "kapitelwahl").map((f) => f.id));
  const kompatibelVorab = roheIds.size > 0 && [...roheIds].filter((id) => katalog.has(id)).length / roheIds.size >= 0.5;
  const themen: Record<string, string | null> = {};
  const geraten: Record<string, string> = {};
  for (const [k, K] of Object.entries(s.kapitel ?? {})) {
    if (K.thema || kompatibelVorab) themen[k] = thema(k, s) || null;
    else {
      const g = themaRaten(K);
      themen[k] = g ?? (thema(k, s) || null);
      if (g) geraten[k] = g;
    }
  }
  const vorkommen = alleFragen(s, themen);
  const ids = [...vorkommen.keys()].filter((id) => {
    const f = vorkommen.get(id)![0].frage;
    return f.typ !== "text" && f.typ !== "kapitelwahl";
  });
  const gleich = ids.filter((id) => katalog.has(id)).length;
  const kompatibel = ids.length > 0 && gleich / ids.length >= 0.5;

  const zuordnung: Zuordnung[] = [];
  const belegt = new Set<string>(ids); // IDs, die es in der Datei schon gibt
  const vergeben = new Set<string>();
  const kandidaten: { id: string; k: KatFrage; score: number; umgekehrt: boolean; werte: Record<string, string> }[] = [];

  for (const id of ids) {
    const vk = vorkommen.get(id)!;
    const f = vk[0].frage as Frage & { merkmal?: string; optionen?: (Frage["optionen"] extends (infer O)[] | undefined ? O & { merkmal_wert?: string } : never)[] };
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
      for (const o of f.optionen ?? []) {
        const mw = (o as { merkmal_wert?: string }).merkmal_wert;
        if (mw) z.werte[o.wert] = mw;
      }
      // Merkmal von Hand gewählt, Antworten nicht: Antworten automatisch zuordnen
      const k = katalog.get(explizit);
      if (k && !Object.keys(z.werte).length && f.optionen?.length && !f.optionen.every((o) => k.optionen.some((x) => x.wert === o.wert))) {
        const fw = woerter(f.text);
        const umg = istJaNein(f) && k.texte.length > 0 && fw.neg !== k.texte[0].neg;
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
    const jn = istJaNein(f);
    for (const k of katalog.values()) {
      if ((k.typ === "zahl") !== (f.typ === "zahl")) continue;
      let text = 0;
      let umgekehrt = false;
      for (const kt of k.texte) {
        const a = Math.max(aehnlich(fwText.w, kt.w), aehnlich(fw.w, kt.w) * 0.9);
        if (a > text) {
          text = a;
          umgekehrt = jn && fwText.neg !== kt.neg;
        }
      }
      if (text < 0.34) continue;
      const { werte, anteil } = werteZuordnen(f, k, umgekehrt, fwText);
      // Thema: Merkmale eines Kapitels passen besser zu Fragen desselben Themas
      const themen = new Set(vk.map((x) => x.thema).filter(Boolean) as string[]);
      const global = vk.some((x) => x.wo === "global");
      let bonus = 0;
      if (k.global && global) bonus += 0.12;
      else if (!k.global && [...themen].some((t) => k.themen.has(t))) bonus += 0.1;
      else if (!k.global && themen.size && !global) bonus -= 0.05;
      const score = text * 0.75 + anteil * 0.25 + bonus;
      if (score >= 0.5 && anteil > 0) kandidaten.push({ id, k, score, umgekehrt, werte });
    }
  }
  // beste Paare zuerst, jedes Merkmal nur einmal
  kandidaten.sort((a, b) => b.score - a.score);
  const fertigIds = new Set<string>();
  // dasselbe Merkmal darf in mehreren Kapiteln vorkommen (gleiche Frage, gleiche Antwort) – nicht zweimal im selben
  const vergebenWo = new Map<string, Set<string>>();
  const woVon = (id: string) => new Set(vorkommen.get(id)!.map((x) => x.wo));
  const kollidiert = (m: string, wo: Set<string>) => {
    const da = vergebenWo.get(m);
    if (!da) return false;
    if (da.has("global") || wo.has("global")) return true;
    return [...wo].some((w) => da.has(w));
  };
  for (const c of kandidaten) {
    if (fertigIds.has(c.id)) continue;
    const z = zuordnung.find((x) => x.frage === c.id)!;
    const wo = woVon(c.id);
    if (kollidiert(c.k.id, wo)) continue;
    const frei = !belegt.has(c.k.id);
    const set = vergebenWo.get(c.k.id) ?? new Set<string>();
    for (const w of wo) set.add(w);
    vergebenWo.set(c.k.id, set);
    z.merkmal = c.k.id;
    z.quelle = "automatisch";
    z.sicherheit = Math.min(1, Math.round(c.score * 100) / 100);
    z.umgekehrt = c.umgekehrt;
    z.werte = c.werte;
    // gibt es die ID schon als eigene Frage, wird nur zugeordnet, nicht umbenannt
    if (!frei) z.abgeleitet = true;
    vergeben.add(c.k.id);
    fertigIds.add(c.id);
  }
  for (const z of zuordnung) if (z.quelle === "explizit" && z.merkmal && z.merkmal !== z.frage && belegt.has(z.merkmal)) z.abgeleitet = true;

  const schema = umbenennen(s, zuordnung, geraten);
  const mitMerkmal = zuordnung.filter((z) => z.merkmal).length;
  const da = new Set(zuordnung.map((z) => z.merkmal).filter(Boolean));
  const u: Uebersetzung = {
    schema,
    zuordnung,
    kompatibel,
    abdeckung: zuordnung.length ? mitMerkmal / zuordnung.length : 1,
    fehlend: KERN_MERKMALE.filter((m) => !da.has(m)),
  };
  if (!proKat) cache.set(s, (proKat = new WeakMap()));
  proKat.set(kat, u);
  return u;
}

// ------------------------------------------------------------------ Umbenennen

/** Kopie des Schemas mit neutralen IDs und Werten (Texte bleiben) */
function umbenennen(s: Schema, zuordnung: Zuordnung[], geraten: Record<string, string> = {}): Schema {
  const um = new Map<string, Zuordnung>();
  const merk = new Map<string, Zuordnung>();
  for (const z of zuordnung) {
    if (!z.merkmal) continue;
    if (z.abgeleitet || z.merkmal === z.frage) {
      // nur Merkmal vermerken (Wahrheit wird über merkmaleInSchema übertragen)
      if (z.merkmal !== z.frage || Object.keys(z.werte).length) merk.set(z.frage, z);
      continue;
    }
    um.set(z.frage, z);
  }
  if (!um.size && !merk.size && !Object.keys(geraten).length) return s;
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

/** nur für Tests */
export const _intern = { woerter, katalogAus, aehnlich };
