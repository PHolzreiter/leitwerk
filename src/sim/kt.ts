/**
 * Krankentransporte („Wollen Sie sitzen oder liegen?“): Aufträge, Plätze im Fahrzeug,
 * Zufallsaufträge (Patient, Diagnose, Orte, Zeiten) und Daueraufträge (Dialyse, Bestrahlung).
 */
import { BEREICHE, type Hospital } from "../data/model";
import { einrichtung } from "../data/klinik";
import { zufallsName, zufallsNummer } from "../abfrage/anrufer";
import type { Anruf, Bearbeiter, Protokoll } from "./engine";

export type KtArt = "KTR" | "KTA" | "KTx";
export type KtLage = "sitzend" | "liegend" | "gehend" | "rollstuhl";
export const KT_LAGE_LABEL: Record<KtLage, string> = { gehend: "gehfähig", sitzend: "Tragstuhl (sitzend)", liegend: "liegend", rollstuhl: "eigener Rollstuhl" };
export const KT_ART_LABEL: Record<KtArt, string> = { KTR: "KTR – Rotes Kreuz gewünscht", KTA: "KTA – ASB gewünscht", KTx: "KTx – egal" };

export interface KtOrt {
  lat: number;
  lon: number;
  label: string;
  /** Krankenhaus und Station/Ambulanz (Kürzel aus BEREICHE) */
  khId?: string;
  bereich?: string;
}

/** Zusatzangaben bei Überstellungen (SEK) */
export interface SekDaten {
  /** Notarztbegleitung nötig */
  arzt: boolean;
  /** Monitoring nötig (Überwachung) */
  monitoring: boolean;
  /** beatmet */
  beatmet: boolean;
  /** Inkubator / Kind */
  inkubator: boolean;
  /** instabil – während des Transports wird laufend am Patienten gearbeitet (kein Flug) */
  instabil: boolean;
  /** Bett im Zielkrankenhaus zugesagt (von wem) */
  zusage: string;
  /** sehr schwerer Patient: BIT (Betten-Intensivtransporter) nötig */
  bit?: boolean;
}
export function sekLeer(): SekDaten {
  return { arzt: false, monitoring: false, beatmet: false, inkubator: false, instabil: false, zusage: "", bit: false };
}

export interface KtDaten {
  art: KtArt;
  /** Code (KTA-90K1, SEK-96D6 …) */
  code: string | null;
  /** Code von Hand gewählt (sonst folgt er dem Vorschlag) */
  codeManuell?: boolean;
  /** SOFORT (Einweisung, dringende Überstellung) */
  sofort: boolean;
  /** Überstellung zwischen Krankenhäusern: Zusatzangaben */
  sek: SekDaten | null;
  patient: { name: string; alter: number | null; geschlecht: "m" | "w" | null; info: string };
  von: KtOrt | null;
  nach: KtOrt | null;
  grund: string;
  lage: KtLage | null;
  begleitung: boolean;
  sauerstoff: boolean;
  infektion: boolean;
  /** Termin am Ziel (Simulationszeit) */
  termin: number | null;
  /** gewünschte Abholzeit */
  abholung: number | null;
  /** was der Disponent vorgegeben hat – die andere Zeit rechnet das Spiel aus */
  zeitVorgabe?: "abholung" | "termin" | null;
  /** Rückruf beim Auftraggeber */
  telefon: string;
}

export type KtStatus = "aufnahme" | "offen" | "vorgemerkt" | "unterwegs" | "anBord" | "erledigt" | "storniert";
export const KT_STATUS_LABEL: Record<KtStatus, string> = {
  aufnahme: "Anruf / Aufnahme",
  offen: "nicht disponiert",
  vorgemerkt: "vorgemerkt",
  unterwegs: "unterwegs",
  anBord: "Patient an Bord",
  erledigt: "erledigt",
  storniert: "storniert",
};

export interface KtAuftrag {
  id: string;
  nummer: string;
  quelle: "hotline" | "online" | "dauer" | "manuell";
  eingang: number;
  status: KtStatus;
  /** eingetragene Daten (bei Hotline erst nach der Aufnahme vollständig) */
  d: KtDaten;
  /** Wahrheit (was der Anrufer weiß) und versteckte Ereignisse */
  wahr: {
    d: KtDaten;
    /** Wer ruft an (Hotline) */
    anrufer: { rolle: string; name: string };
    verzoegerungMin: number;
    nichtDa: boolean;
    verschlechterung: boolean;
  };
  /** zugeteiltes Fahrzeug (vorgemerkt oder unterwegs) */
  fz: string | null;
  /** begleitendes Fahrzeug (NEF bei Notarzt-Überstellung mit RTW/SRTW) */
  begleit?: string | null;
  anruf: Anruf | null;
  /** „Wo bleibt der Transport?“ schon angerufen */
  nachfrage?: boolean;
  bearbeiter?: Bearbeiter | null;
  protokoll: Protokoll[];
  /** zu welcher Dauerserie (z. B. Dialyse) der Auftrag gehört */
  serie?: string;
}

/** Fahrplan eines Fahrzeugs: Fahrten nacheinander, jede Fahrt kann mehrere Patienten haben (Sammelfahrt) */
export interface KtPlan {
  fahrten: string[][];
  /** läuft gerade (losgeschickt) */
  aktiv: boolean;
  /** Halte der laufenden Fahrt (Abholen der Reihe nach, dann Abliefern) */
  halte: { kt: string; art: "ab" | "an" }[];
  /** aktueller Halt (Index in halte) */
  halt: number;
  /** vorgemerkt: fährt um diese Zeit selbst los (aus Abholzeit und Anfahrt berechnet) */
  losUm?: number | null;
}

// ---------------------------------------------------------------- Plätze

/** Plätze im KTW: 2 Sitzplätze und 1 Liegeplatz (auf dem auch jemand sitzen kann) */
export function passt(auftraege: KtDaten[]): string | null {
  // Überstellungen ohne Blaulicht dürfen mit anderen fahren (Mehrfachtransport); Blaulicht/Notarzt prüft die Zuteilung
  if (auftraege.length > 1 && auftraege.some((d) => d.infektion)) return "Infektionstransport: nur ein Patient im Fahrzeug";
  let liegend = 0;
  let sitz = 0;
  for (const d of auftraege) {
    if (d.lage === "liegend") liegend++;
    else if (d.lage === "sitzend" || d.lage === "gehend") sitz++;
    // eigener Rollstuhl belegt keinen Platz
    if (d.begleitung) sitz++;
  }
  if (liegend > 1) return "Nur ein Liegeplatz";
  // Sitzplätze: 2 + Liegeplatz, wenn er frei ist
  if (sitz > 2 + (liegend === 0 ? 1 : 0)) return "Nicht genug Sitzplätze (2 Sitz + 1 Liege)";
  return null;
}

// ---------------------------------------------------------------- Zufallsaufträge

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Diagnosen bzw. Gründe je Station/Ambulanz */
const GRUENDE: Record<string, string[]> = {
  DIA: ["Terminale Niereninsuffizienz – Hämodialyse", "Chronische Niereninsuffizienz Stadium 5 – Dialyse"],
  STR: ["Mammakarzinom – Strahlentherapie", "Prostatakarzinom – Bestrahlung", "Bronchialkarzinom – Strahlentherapie", "Rektumkarzinom – Bestrahlung"],
  CHE: ["Kolonkarzinom – Chemotherapie", "Lymphom – Chemotherapie", "Mammakarzinom – Chemotherapie"],
  RAD: ["CT Thorax zur Abklärung", "MRT LWS bei Rückenschmerzen", "CT Abdomen – Kontrolle"],
  NUK: ["Skelettszintigrafie", "Schilddrüsenszintigrafie"],
  HKL: ["Koronarangiografie geplant", "Z. n. Myokardinfarkt – Kontrolle Herzkatheter"],
  END: ["Gastroskopie", "Koloskopie bei Anämie", "ERCP geplant"],
  PHY: ["Physiotherapie nach Hüft-TEP", "Physikalische Therapie bei Lumbalgie"],
  WUN: ["Chronische Wunde Unterschenkel – Verbandswechsel", "Dekubitus sakral – Wundkontrolle", "Diabetischer Fuß – Wundversorgung"],
  SCH: ["Chronische Schmerzen – Schmerztherapie"],
  UNF: ["Kontrolle nach Radiusfraktur", "Gipskontrolle", "Nahtentfernung"],
  ZNA: ["Abklärung Synkope", "Abklärung Bauchschmerzen"],
  INT: ["Pneumonie", "Exsikkose", "Dekompensierte Herzinsuffizienz", "Harnwegsinfekt mit Verwirrtheit"],
  KAR: ["Vorhofflimmern", "Herzinsuffizienz NYHA III", "Z. n. NSTEMI"],
  GAS: ["Gastrointestinale Blutung – Kontrolle", "Leberzirrhose"],
  PUL: ["COPD-Exazerbation", "Pneumonie"],
  NEP: ["Akutes Nierenversagen"],
  ONK: ["Metastasiertes Karzinom – Schmerztherapie", "Leukämie"],
  CHI: ["Z. n. Cholezystektomie", "Z. n. Hernienoperation", "Ileus – postoperativ"],
  ORT: ["Schenkelhalsfraktur – Z. n. OP", "Z. n. Knie-TEP", "Wirbelkörperfraktur"],
  NEU: ["Z. n. Schlaganfall – Rehabilitation", "Morbus Parkinson", "Epilepsie – Einstellung"],
  NCH: ["Z. n. Bandscheiben-OP"],
  URO: ["Harnverhalt – Katheterwechsel", "Z. n. TURP"],
  GYN: ["Z. n. Sectio", "Z. n. Hysterektomie"],
  KIN: ["Bronchiolitis", "Gastroenteritis"],
  HNO: ["Z. n. Tonsillektomie"],
  AUG: ["Kataraktoperation", "Kontrolle nach Augenoperation"],
  DER: ["Erysipel", "Ulcus cruris"],
  PSY: ["Depression", "Delir – Abklärung", "Demenz mit Verhaltensauffälligkeiten"],
  GER: ["Remobilisation nach Sturz", "Gangunsicherheit – Remobilisation"],
  PAL: ["Palliative Betreuung bei Karzinom"],
  ITS: ["Verlegung nach Intensivaufenthalt"],
};

/** Einweisungen durch den Hausarzt (Grund → Aufnahme) */
const EINWEISUNG: [string, string][] = [
  ["Verdacht auf Pneumonie – stationäre Aufnahme", "INT"],
  ["Exsikkose, Allgemeinzustand reduziert", "INT"],
  ["Harnwegsinfekt mit Verwirrtheit", "INT"],
  ["Dekompensierte Herzinsuffizienz", "INT"],
  ["Sturz – Abklärung, nicht mehr mobil", "ZNA"],
  ["Erysipel Unterschenkel – i.v. Therapie", "INT"],
  ["Entgleister Diabetes", "INT"],
  ["Akute Verwirrtheit – Abklärung", "ZNA"],
  ["Zunehmende Gangunsicherheit – Akutgeriatrie", "GER"],
  ["Gallenkolik – chirurgische Abklärung", "CHI"],
];

/** Lage, Sauerstoff und Isolation passend zum Grund (z. B. Nahtentfernung gehfähig, Dekubitus liegend, COPD mit Sauerstoff) */
const LAGE_NACH_GRUND: [RegExp, [KtLage, number][]][] = [
  [/nahtentfernung|gipskontrolle|radiusfraktur|katarakt|augen|szintigrafie|schilddrüse/i, [["gehend", 3], ["sitzend", 2]]],
  [/dekubitus|palliativ|bettlägerig|terminal/i, [["liegend", 1]]],
  [/hüft|knie-tep|schenkelhals|wirbelkörper|remobilisation|gangunsicher/i, [["sitzend", 3], ["liegend", 2], ["rollstuhl", 1]]],
];
const SAUERSTOFF_GRUND = /copd|pneumonie|herzinsuffizienz|bronchial|palliativ|lungen/i;
const ISOLATION: [string, number][] = [["MRSA", 4], ["3MRGN", 1.5], ["Noro", 1], ["COVID", 1], ["Influenza", 1], ["VRE", 1]];
/** Wahrscheinlichkeit einer Isolation (Keim) je Grund */
function infektionsAnteil(grund: string, bereich: string): number {
  if (/wunde|ulcus|dekubitus|diabetischer fuß/i.test(grund)) return 0.25;
  if (bereich === "DIA") return 0.08;
  if (["INT", "GER", "PAL", "ITS"].includes(bereich)) return 0.07;
  return 0.03;
}
/** Lage, Sauerstoff, Isolation und Hinweis zum Grund */
function zumGrund(grund: string, bereich: string, alter: number, lageStandard: KtLage): { lage: KtLage; sauerstoff: boolean; infektion: boolean; info: string } {
  const regel = LAGE_NACH_GRUND.find(([re]) => re.test(grund));
  const lage = regel ? gewichtet(regel[1]) : lageStandard;
  const sauerstoff = Math.random() < (SAUERSTOFF_GRUND.test(grund) ? 0.55 : ["PUL", "KAR", "PAL"].includes(bereich) ? 0.3 : 0.04);
  const infektion = Math.random() < infektionsAnteil(grund, bereich);
  const teile = [pick(INFOS[lage]), sauerstoff ? `Sauerstoff ${pick(["1", "2", "2", "3"])} l/min` : "", infektion ? `Isolation (${gewichtet(ISOLATION)})` : "", alter > 85 && /verwirr|demenz/i.test(grund) ? "dement, braucht Begleitung" : ""];
  return { lage, sauerstoff, infektion, info: teile.filter(Boolean).join(", ") };
}

const INFOS: Record<KtLage, string[]> = {
  gehend: ["bis zum Fahrzeug gehfähig", "geht mit Rollator", ""],
  sitzend: ["braucht Hilfe beim Aufstehen", "Tragsessel nötig", "kann nicht gehen, aber sitzen", ""],
  liegend: ["bettlägerig", "nicht gehfähig", "Dekubitus – vorsichtig lagern", ""],
  rollstuhl: ["im eigenen Rollstuhl", "Rollstuhl wird mitgenommen", ""],
};

function lageFuer(alter: number, bereich: string): KtLage {
  const liegendAnteil = ["ITS", "PAL", "ORT", "NEU", "GER"].includes(bereich) ? 0.45 : alter > 80 ? 0.35 : 0.15;
  const r = Math.random();
  if (r < liegendAnteil) return "liegend";
  if (r < liegendAnteil + 0.08) return "rollstuhl";
  if (r < liegendAnteil + 0.2 && alter < 75) return "gehend";
  return "sitzend";
}

export function bereichName(kurz: string | undefined): string {
  return kurz ? (BEREICHE[kurz] ?? einrichtung(kurz)?.name ?? kurz) : "";
}

export function khOrt(h: Hospital, bereich: string): KtOrt {
  return { lat: h.lat, lon: h.lon, label: `${h.kurzname || h.name}, ${bereichName(bereich)}`, khId: h.id, bereich };
}

export interface ZufallsOrte {
  /** Wohnadresse des Patienten */
  heim: KtOrt;
  /** passende Krankenhäuser (in der Nähe, nach Entfernung) */
  khMit(bereich: string): Hospital[];
  /** Art des Transports vorgeben (z. B. Einweisung aus der Arztpraxis) */
  typ?: "ambulanz" | "heim" | "entlassung" | "einweisung";
}

/** Ambulanzen, zu denen Patienten von zu Hause gebracht werden, mit Gewicht */
const AMBULANZ_ZIELE: [string, number][] = [
  ["RAD", 3],
  ["END", 2],
  ["UNF", 2],
  ["CHE", 1.5],
  ["STR", 1],
  ["HKL", 0.6],
  ["NUK", 0.6],
  ["PHY", 1.5],
  ["WUN", 1.5],
  ["SCH", 0.5],
  ["AUG", 0.6],
];
/** Stationen, von denen entlassen wird */
const STATIONEN_ENTLASSUNG = ["INT", "INT", "CHI", "ORT", "ORT", "NEU", "GER", "GER", "URO", "KAR", "PUL", "GAS", "PSY", "DER"];

function gewichtet<T>(l: [T, number][]): T {
  let r = Math.random() * l.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of l) if ((r -= w) <= 0) return v;
  return l[l.length - 1][0];
}

export function neueDaten(): KtDaten {
  return {
    art: "KTx",
    code: null,
    sofort: false,
    sek: null,
    patient: { name: "", alter: null, geschlecht: null, info: "" },
    von: null,
    nach: null,
    grund: "",
    lage: null,
    begleitung: false,
    sauerstoff: false,
    infektion: false,
    termin: null,
    abholung: null,
    telefon: "",
  };
}

/**
 * Zufälliger Krankentransport (einfache Fahrt): zur Ambulanz, nach Hause oder Entlassung.
 * jetzt = aktuelle Simulationszeit.
 */
export function zufallsDaten(o: ZufallsOrte, jetzt: number): KtDaten | null {
  const geschlecht: "m" | "w" = Math.random() < 0.5 ? "w" : "m";
  const alter = Math.round(Math.min(98, Math.max(18, rnd(45, 95) + (Math.random() < 0.15 ? -25 : 0))));
  const art: KtArt = gewichtet([["KTx", 6], ["KTR", 3], ["KTA", 1]]);
  const typ = o.typ ?? gewichtet<"ambulanz" | "heim" | "entlassung" | "einweisung">([["ambulanz", 4], ["heim", 3], ["entlassung", 3], ["einweisung", 0.8]]);
  // Vorlauf: sofort, 1–3 h oder später am Tag
  const vorlaufMin = gewichtet<() => number>([[() => rnd(70, 120), 4], [() => rnd(120, 240), 4], [() => rnd(240, 480), 2]])();
  let termin = jetzt + vorlaufMin * 60_000;
  // Ambulanzen und Entlassungen untertags: nicht nach 17:30 (Entlassung 19:00), wenn es sich heute noch ausgeht
  const tag = new Date(jetzt);
  tag.setHours(0, 0, 0, 0);
  const schluss = tag.getTime() + (typ === "entlassung" ? 19 : 17.5) * 3_600_000;
  const frueh = jetzt + 70 * 60_000;
  if (typ !== "einweisung" && termin > schluss && frueh < schluss) termin = frueh + Math.random() * (schluss - frueh);
  termin = Math.round(termin / 300_000) * 300_000;
  let bereich: string;
  let einweisung: [string, string] | null = null;
  let kh: Hospital | undefined;
  let von: KtOrt;
  let nach: KtOrt;
  if (typ === "einweisung") {
    // Einweisung durch den Hausarzt: sofort ins nächste Krankenhaus
    einweisung = pick(EINWEISUNG);
    bereich = einweisung[1];
    kh = o.khMit(bereich)[0] ?? o.khMit("ZNA")[0];
    if (kh && !o.khMit(bereich).includes(kh)) bereich = "ZNA";
    if (!kh) return null;
    von = o.heim;
    nach = khOrt(kh, bereich);
  } else if (typ === "entlassung") {
    bereich = pick(STATIONEN_ENTLASSUNG);
    kh = o.khMit(bereich)[0];
    if (!kh) return null;
    von = khOrt(kh, bereich);
    nach = o.heim;
  } else {
    bereich = gewichtet(AMBULANZ_ZIELE);
    const auswahl = o.khMit(bereich).slice(0, 3);
    kh = auswahl.length ? pick(auswahl) : undefined;
    if (!kh) return null;
    if (typ === "ambulanz") {
      von = o.heim;
      nach = khOrt(kh, bereich);
    } else {
      von = khOrt(kh, bereich);
      nach = o.heim;
    }
  }
  const grund = einweisung ? einweisung[0] : pick(grundFuer(GRUENDE[bereich] ?? ["Kontrolle"], geschlecht));
  const zg = zumGrund(grund, bereich, alter, lageFuer(alter, bereich));
  const lage = zg.lage;
  const sofort = typ === "einweisung";
  // Abholzeit: bei Fahrten zur Ambulanz vor dem Termin (mit etwas mehr Puffer als nötig)
  const abholung = sofort
    ? jetzt + rnd(5, 20) * 60_000
    : typ === "ambulanz"
      ? Math.random() < 0.6
        ? termin - rnd(45, 75) * 60_000
        : null
      : Math.random() < 0.5
        ? termin
        : null;
  return {
    art,
    code: null,
    sofort,
    sek: null,
    patient: { name: zufallsName(geschlecht), alter, geschlecht, info: zg.info },
    von,
    nach,
    grund,
    lage,
    begleitung: /dement/.test(zg.info) || Math.random() < (alter > 85 ? 0.25 : 0.08),
    sauerstoff: zg.sauerstoff,
    infektion: zg.infektion,
    termin: sofort ? jetzt + rnd(40, 70) * 60_000 : termin,
    abholung: abholung && abholung > jetzt ? abholung : null,
    telefon: zufallsNummer(),
  };
}

/** Gründe, die zum Geschlecht passen (kein Prostatakarzinom bei einer Frau) */
export function grundFuer(liste: string[], geschlecht: "m" | "w" | null): string[] {
  const passt = liste.filter((g) => (geschlecht === "m" ? !/mamma|gynäk|ovar|uterus|schwanger|zervix/i.test(g) : geschlecht === "w" ? !/prostata|hoden/i.test(g) : true));
  return passt.length ? passt : liste;
}

/** Dialyse-Schichten: [Hinfahrt-Termin (h), Heimfahrt-Termin (h), Anteil] */
export const DIALYSE_SCHICHTEN: [number, number, number][] = [
  [6.75, 11.25, 0.5],
  [12.25, 18.0, 0.35],
  [18.25, 24.0, 0.15],
];

/** Daueraufträge eines Patienten an einem Tag (Dialyse oder Bestrahlung): Hin- und Rückfahrt */
export function dauerDaten(heim: KtOrt, kh: Hospital, bereich: "DIA" | "STR" | "CHE", tag0: number): [KtDaten, KtDaten] {
  const geschlecht: "m" | "w" = Math.random() < 0.5 ? "w" : "m";
  const alter = Math.round(rnd(50, 90));
  let hin: number;
  let heimZeit: number;
  if (bereich === "DIA") {
    const s = gewichtet(DIALYSE_SCHICHTEN.map((x) => [x, x[2]] as [[number, number, number], number]));
    hin = tag0 + s[0] * 3_600_000 + rnd(-15, 15) * 60_000;
    heimZeit = tag0 + s[1] * 3_600_000 + rnd(-20, 20) * 60_000;
  } else if (bereich === "CHE") {
    // Chemotherapie: Infusion dauert einige Stunden
    hin = tag0 + rnd(7.5, 11) * 3_600_000;
    heimZeit = hin + rnd(2, 5) * 3_600_000;
  } else {
    hin = tag0 + rnd(8, 15) * 3_600_000;
    heimZeit = hin + rnd(40, 70) * 60_000;
  }
  const grund = pick(grundFuer(GRUENDE[bereich], geschlecht));
  const zg = zumGrund(grund, bereich, alter, Math.random() < 0.2 ? "liegend" : Math.random() < 0.1 ? "rollstuhl" : "sitzend");
  const lage = zg.lage;
  const basis = {
    art: gewichtet<KtArt>([["KTx", 6], ["KTR", 3], ["KTA", 1]]),
    code: null,
    sofort: false,
    sek: null,
    patient: { name: zufallsName(geschlecht), alter, geschlecht, info: zg.info },
    grund,
    lage,
    begleitung: false,
    sauerstoff: zg.sauerstoff,
    infektion: zg.infektion,
    telefon: zufallsNummer(),
  };
  const ziel = khOrt(kh, bereich);
  return [
    { ...basis, patient: { ...basis.patient }, von: heim, nach: ziel, termin: hin, abholung: hin - rnd(30, 50) * 60_000 },
    { ...basis, patient: { ...basis.patient }, von: ziel, nach: heim, termin: heimZeit, abholung: heimZeit },
  ];
}

/** „UK Tulln, Dialyse“ → „auf der Dialyse im UK Tulln“ */
function stationText(label: string): string {
  const i = label.lastIndexOf(", ");
  if (i < 0) return `im ${label}`;
  const haus = label.slice(0, i);
  const bereich = label.slice(i + 2);
  const im = /^(LK|UK|KH|LKH|AKH|BBR|Klinik|Krankenhaus|Spital|Landesklinikum|Universitätsklinikum)\b/i.test(haus) ? `im ${haus}` : `in der Klinik ${haus}`;
  return `auf der ${bereich} ${im}`;
}

/** Wer ruft bei der KT-Hotline an */
export function hotlineAnrufer(d: KtDaten): { rolle: string; name: string } {
  const vonKh = !!d.von?.khId;
  const g: "m" | "w" = Math.random() < 0.7 ? "w" : "m";
  if (d.sek && vonKh) {
    const arzt = d.sek.arzt || d.sek.beatmet || d.sek.inkubator || d.sofort || Math.random() < 0.4;
    return arzt
      ? { rolle: `${g === "w" ? "Ärztin" : "Arzt"} ${stationText(d.von!.label)}`, name: `Dr. ${zufallsName(g)}` }
      : { rolle: `Pflegekraft ${stationText(d.von!.label)}`, name: zufallsName(g) };
  }
  if (d.sofort && !vonKh) return { rolle: "Ordinationsassistentin des Hausarztes", name: zufallsName("w") };
  if (vonKh) return { rolle: `Pflegekraft ${stationText(d.von!.label)}`, name: zufallsName(g) };
  const pw = d.patient.geschlecht === "w";
  const r = gewichtet<string>([
    ["Patient selbst", 3],
    [pw ? "Tochter der Patientin" : "Tochter des Patienten", 1.4],
    [pw ? "Sohn der Patientin" : "Sohn des Patienten", 0.8],
    ["Ordinationsassistentin des Hausarztes", 2],
    ["Pflegekraft der Hauskrankenpflege", 1],
  ]);
  if (r === "Patient selbst") return { rolle: r, name: d.patient.name };
  // Name passend zur Rolle (keine „Tochter“ namens Florian); Kinder tragen oft den Familiennamen
  const gr: "m" | "w" = /^Sohn/.test(r) ? "m" : /^(Tochter|Ordinationsassistentin)/.test(r) ? "w" : g;
  let name = zufallsName(gr);
  const famName = d.patient.name.split(/\s+/).slice(1).join(" ");
  if (/^(Tochter|Sohn)/.test(r) && famName && Math.random() < 0.6) name = `${name.split(/\s+/)[0]} ${famName}`;
  return { rolle: r, name };
}

/** Uhrzeit hh:mm */
export function hhmm(t: number | null | undefined): string {
  if (!t) return "–";
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

/** Kurztext eines Auftrags für Listen und Funk */
export function ktKurz(d: KtDaten): string {
  const l = d.lage ? { sitzend: "S", liegend: "L", gehend: "G", rollstuhl: "R" }[d.lage] : "?";
  return `${d.patient.name || "?"} (${l}${d.begleitung ? "+B" : ""}${d.infektion ? " INF" : ""}${d.sauerstoff ? " O₂" : ""})`;
}
