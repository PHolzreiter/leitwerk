/**
 * Simulationskern: Uhr, Fahrzeuge, Einsätze, Funkmeldungen.
 *
 * Der Zustand besteht nur aus einfachen Objekten, damit er später im Multiplayer
 * vom Host an die Mitspieler übertragen werden kann. Alle Eingriffe des Spielers
 * laufen über die öffentlichen Methoden (alarmieren, Adresse setzen, …).
 */
import { nachKlick } from "../klick";
import { ACTIVE_CATEGORIES, bereicheVon, HOSPITAL_FLAG_LABEL, type Hospital, type HospitalFlag, type Vehicle } from "../data/model";
import { store } from "../data/store";
import { abteilungFuer, allCodes, findCode, hasCodes, type Einsatzcode } from "./codes";
import { distanceM, erreichbar, flightRoute, geoStatus, randomAddresses, route, searchAddress, travelTimes, type LatLon, type Route } from "./geo";
import { generiereBesetzung, hatNFS, rmTypVon, type Platz, type RmTyp } from "./crew";
import { defaultStufeFuer, raenge, type Kategorie, type Settings, type StatusKey, type StufeDef } from "./settings";
import {
  fahrFaktor,
  flugverbot,
  istNacht,
  jahreszeitVon,
  lageArt,
  lageVon,
  nextWetter,
  planAuffuellen,
  prognose,
  temperatur,
  wetterFortschreiben,
  wetterJetzt,
  wetterSetzen,
  WETTER_LABEL,
  type PrognoseStunde,
  type Wetter,
  type WetterLage,
  type WetterOpt,
  type WetterWerte,
} from "./weather";
import { bestimmeCode, fallZiehen, kapitelVonCode, wahrheitFuer, type Antworten, type Schema } from "../abfrage/schema";
import { anruferWaehlen, veraenderungText, zufallsName, type Anrufer } from "../abfrage/anrufer";
import { bezugFuer, fuellen, stimmungAusVerlauf, szenarioBauen, vorlageFest, vorlageWaehlen, type OrtArt, type Szenario } from "../abfrage/szenario";
import { SZENARIEN } from "../abfrage/szenarien";
import { abfrageBlock, abfrageSaetze } from "../abfrage/protokollText";
import {
  dauerDaten,
  hhmm,
  hotlineAnrufer,
  neueDaten,
  passt,
  sekLeer,
  zufallsDaten,
  type KtAuftrag,
  type KtDaten,
  type KtOrt,
  type KtPlan,
} from "./kt";
import { codeInfo, codeVorschlag, istUeberstellung } from "./ktCodes";
import { PARTNER, partnerNoetig, partnerSchonDa, type PartnerArt } from "./partner";
import { funkgruppe, inFunkgruppe, mitteVon, type Funkgruppe } from "./funkgruppen";
import { sekZufall } from "./sek";
import { bedarf, istStillstand, lageErzeugen, lagemeldungText, patientText, type Lage } from "./lage";

const MIN = 60_000;
const NF_NAME = { NA: "Notarzt", RTW: "Rettungsmittel", BIT: "BIT (Schwerlasttransport)" } as const;
/** So lange wartet die Besatzung auf den BIT, dann transportiert sie selbst */
const BIT_WARTEN = 35 * MIN;

export interface Ort extends LatLon {
  label: string;
}

/** Fahrt entlang einer Route; times sind bereits auf Sondersignal umgerechnet. */
export interface Fahrt {
  coords: [number, number][];
  times: number[];
  start: number;
  dauer: number;
  /** Hubschrauber: Sekunde, ab der er über dem Einsatzort kreist, und ab der er landet */
  kreisAb?: number;
  landungAb?: number;
  /** mit Sondersignal (Blaulicht) */
  blau?: boolean;
}

export type Phase =
  | "frei"
  | "ausruecken"
  | "anfahrt"
  | "suche"
  | "vorOrt"
  | "warteKH"
  | "transport"
  | "uebergabe"
  | "rueckfahrt"
  | "routing"
  | "ktFahrt"
  | "ktHalt"
  | "ktReinigung";

export interface SimFahrzeug {
  id: string;
  funkrufname: string;
  kurzname: string;
  kategorie: Vehicle["kategorie"];
  /** Rettungsmitteltyp (RTW-C, RTW, KTW, NEF, NAH) */
  rmTyp: RmTyp;
  besetzung: Platz[];
  stationId: string;
  stationName: string;
  heim: LatLon;
  lat: number;
  lon: number;
  status: StatusKey;
  phase: Phase;
  phaseEnde: number | null;
  einsatzId: string | null;
  fahrt: Fahrt | null;
  nachtflug: boolean;
  /** begleitet den Transport (NEF/NAH bei kritischen Einsätzen) */
  begleitet: boolean;
  /** Leitstelle hat eine Lagemeldung beim Eintreffen angefordert */
  lagemeldungAngefordert?: boolean;
  /** seit wann vor Ort (für die Zwischenmeldung) */
  vorOrtSeit?: number | null;
  zwischenGemeldet?: boolean;
  /** Transport per Funk angekündigt */
  transportGemeldet?: boolean;
  /** technischer Defekt: nicht einsatzbereit bis */
  defektBis?: number | null;
  /** KT auf der Wache alarmiert: quittiert um (Status „Alarmiert und quittiert“) */
  quittUm?: number | null;
  /** Blaulicht an (Fahrt mit Sondersignal; bleibt am Einsatzort an, wenn mit Blaulicht angefahren) */
  blaulicht?: boolean;
  /** Krankentransport-Plan (vorgemerkte bzw. laufende Fahrten) */
  kt?: (KtPlan & { reinigen?: boolean; wartetAuf?: string | null; wartetKt?: string | null; wartetSeit?: number | null }) | null;
}

/** Fahrzeugvorschlag für einen Krankentransport oder eine Überstellung */
export interface KtVorschlag {
  fz: SimFahrzeug;
  /** mitfahrendes NEF (Notarzt-Überstellung mit RTW/SRTW) */
  begleit: SimFahrzeug | null;
  sekunden: number | null;
  hinweis: string | null;
  losSpaetestens: number | null;
  /** nur Ersatz (Regelrettungsdienst), wenn nichts Passendes frei ist */
  ersatz: boolean;
  rang: number;
}

export interface Vorschlag {
  fz: SimFahrzeug;
  /** Zeit bis zum Eintreffen inkl. Ausrücken (s), null = nicht erreichbar */
  sekunden: number | null;
  hinweis: string | null;
  /** fährt gerade einen Krankentransport ohne Patient (wird beim Alarmieren abgezogen) */
  kt?: boolean;
}

export interface Protokoll {
  zeit: number;
  text: string;
  /** Spieler, der es ausgelöst hat (Multiplayer) */
  von?: string;
}

/** Fall aus dem Abfrageschema (Kapitel, wahre Antworten, Code) */
export interface Fall {
  kapitel: string;
  antworten: Antworten;
  code: string;
  /** Fallgeschichte (Vorlage) und gewählter Ort */
  vorlage?: string;
  ortArt?: OrtArt;
}

/** So heißt der Ort beim Anrufer */
const ORT_LABEL: Record<OrtArt, string> = {
  wohnung: "Wohnung",
  haus: "Einfamilienhaus",
  garten: "Garten",
  pflegeheim: "Pflegeheim",
  strasse: "Straße / Gehsteig",
  geschaeft: "Geschäft",
  lokal: "Lokal",
  arbeit: "Arbeitsplatz",
  baustelle: "Baustelle",
  schule: "Schule",
  sport: "Sportplatz",
  freizeit: "Freizeitanlage",
  natur: "im Freien, abseits der Straße",
  wasser: "am Wasser (Badeplatz)",
  auto: "im Auto",
  arzt: "Arztpraxis",
  bahnhof: "Bahnhof",
};

/** Gemeinde aus einer Adresse („Hauptstraße 3, 3500 Krems“ → „Krems“) */
function gemeindeVon(adresse: string): string {
  const m = adresse.match(/\d{4}\s+([^,()]+)/) ?? adresse.match(/,\s*([^,()]+)\s*$/);
  return (m?.[1] ?? "").trim() || "dem Ort";
}

/** Medizinisch plausibel? (z. B. keine Geburt mit 60, keine Schwangerschaft beim Mann) */
export function plausibel(kapitel: string, a: Antworten, codeName: string): boolean {
  const alter = typeof a.alter === "number" ? a.alter : null;
  const schwanger =
    kapitel === "24" ||
    a.problem === "geburt" ||
    (a.schwanger !== undefined && a.schwanger !== "nein" && a.schwanger !== "unbekannt") ||
    /schwanger|geburt|eklampsie|wehen|fruchtwasser|postpartal|entbind/i.test(codeName);
  if (schwanger && (a.geschlecht === "m" || (alter !== null && (alter < 14 || alter > 46)))) return false;
  if (/\bMann\b|Hoden|Prostata/.test(codeName) && a.geschlecht === "w") return false;
  if (/\bFrau(en)?\b/.test(codeName) && a.geschlecht === "m") return false;
  return true;
}

/** Kapitel für einen neuen Fall – häufige Notrufe öfter, Alpinunfälle selten */
const KAPITEL_GEWICHT: Record<string, number> = {
  "17": 3, "26": 3, "10": 2.5, "6": 2.5, "28": 2, "31": 2, "29": 2, "12": 1.5, "21": 1.5, "1": 1.5, "18": 1.5, "9": 1.2, ALP: 0.15, "42": 0.3, "34": 0.3,
};
/** Wetter macht manche Notrufe häufiger: Hitze → Hitzenotfälle, Badeunfälle; Kälte → Unterkühlung, Infekte; Glätte → Stürze, Unfälle */
export function wetterFaktor(kap: string, temp: number, lage: WetterLage, wind = 0): number {
  const art = lageArt(lage);
  const glatt = lage === "eisregen" || (temp < 1 && (art === "schnee" || art === "regen" || art === "nebel"));
  const sturm = wind >= 45 || lage === "unwetter";
  const nass = art === "regen" || art === "gewitter";
  switch (kap) {
    case "20":
      return temp >= 30 ? 6 : temp >= 26 ? 3 : temp <= -5 ? 5 : temp <= 0 ? 3 : temp <= 5 ? 1.2 : 0.15;
    case "14":
      return temp >= 28 ? 3.5 : temp >= 23 ? 2 : temp < 12 ? 0.3 : 1;
    case "2":
      return temp >= 20 ? 1.6 : temp < 5 ? 0.6 : 1;
    case "3":
      return temp >= 18 ? 1.3 : temp < 3 ? 0.7 : 1;
    case "8":
      return temp <= 0 ? 2.2 : temp <= 6 ? 1.5 : 0.8;
    case "6":
      return (temp <= 0 ? 1.5 : temp >= 30 ? 1.3 : 1) * (lage === "hochnebel" ? 1.3 : 1);
    case "36":
      return temp <= 5 ? 2.2 : temp >= 22 ? 0.4 : 1;
    case "26":
    case "31":
      return temp >= 30 ? 1.5 : temp >= 27 ? 1.2 : 1;
    case "17":
      return (lage === "eisregen" ? 3 : glatt ? 1.8 : 1) * (sturm ? 1.3 : 1);
    case "30":
      return sturm ? 1.6 : glatt ? 1.3 : 1;
    case "29":
      return (lage === "eisregen" ? 2.6 : glatt ? 2 : lage === "nebel" ? 1.5 : lage === "starkregen" || lage === "unwetter" ? 1.5 : nass ? 1.3 : 1) * (sturm ? 1.3 : 1);
    case "15":
      return art === "gewitter" ? 6 : 1;
    default:
      return 1;
  }
}

function kapitelZiehen(schema: Schema, faktor: (kap: string) => number = () => 1): string {
  const kaps = Object.keys(schema.kapitel);
  const g = (k: string) => (KAPITEL_GEWICHT[k] ?? 1) * faktor(k);
  const sum = kaps.reduce((s, k) => s + g(k), 0);
  let r = Math.random() * sum;
  for (const k of kaps) {
    r -= g(k);
    if (r <= 0) return k;
  }
  return kaps[0];
}

/** Passt der gezogene Fall zum Wetter? (Hitze-/Kältenotfall, Blitzschlag) */
function passtZumWetter(kap: string, a: Antworten, codeName: string, temp: number, lage: WetterLage): boolean {
  if (kap === "20" || /Hitze|Kälte|Unterkühl|Erfrier|Sonnenstich/i.test(codeName)) {
    const kalt = a.art === "kaelte" || /Kälte|Unterkühl|Erfrier/i.test(codeName);
    if (kalt && temp > 12) return Math.random() < 0.05;
    if (!kalt && temp < 18) return Math.random() < 0.05;
  }
  if (/Blitz/i.test(codeName) && lageArt(lage) !== "gewitter") return Math.random() < 0.1;
  return true;
}

/** Ein Funkspruch („Hier LEO …“, „LEO von 75/001 kommen“) */
export interface FunkSpruch {
  zeit: number;
  /** Funkrufname des Fahrzeugs oder „LEO“ */
  von: string;
  text: string;
  /** Disponent, der für LEO gesprochen hat */
  wer?: string;
}

export type FunkAnliegen = "lage" | "nachforderung" | "storno" | "kh" | "adresse" | "info";

/** Funkgespräch zwischen LEO und einem Fahrzeug */
export interface FunkGespraech {
  id: number;
  fzId: string;
  funkname: string;
  einsatzId: string | null;
  /** ruft = Fahrzeug ruft LEO; leoRuft = LEO ruft das Fahrzeug; offen = verbunden */
  status: "ruft" | "leoRuft" | "offen" | "ende";
  seit: number;
  /** ruft: nächster Wiederholungsruf; leoRuft: Fahrzeug meldet sich */
  naechster: number | null;
  rufe: number;
  anliegen: { art: FunkAnliegen; text: string } | null;
  fuehrer: Bearbeiter | null;
  sprueche: FunkSpruch[];
  /** freie Frage der Leitstelle – Antwort kommt von der KI des Gesprächsführers */
  wartetAufKi?: boolean;
  /** dringender Ruf (Nachforderung, Verschlechterung, Eigenschutz) – steht oben */
  dringend?: boolean;
}

export interface Nachforderung {
  art: "NA" | "RTW" | "BIT";
  anzahl: number;
  seit: number;
  von: string;
  erinnert: number;
  erledigt: boolean;
}

export interface ChatNachricht {
  zeit: number;
  von: string;
  text: string;
}

export interface AnrufNachricht {
  zeit: number;
  /** echte Uhrzeit (ms) – für den Gesprächsexport */
  echt?: number;
  /** wie die Antwort entstand (KI oder feste Antwort) */
  quelle?: "ki" | "fest";
  von: "leitstelle" | "anrufer" | "system";
  text: string;
  /** Name des Disponenten (bei „leitstelle“) */
  wer?: string;
}

/** Notruf als Anruf mit Abfrage (nur mit importiertem Abfrageschema) */
export interface Anruf {
  status: "klingelt" | "aktiv" | "gehalten" | "verpasst" | "beendet";
  /** Simulationszeit des letzten Statuswechsels */
  seit: number;
  /** gehalten: so lange wartet der Anrufer, dann legt er auf */
  haltenBis?: number | null;
  /** klingelt bis (danach legt der Anrufer auf) */
  klingelBis: number;
  /** verpasst: ruft um diese Zeit wieder an */
  rueckrufUm: number | null;
  versuche: number;
  /** Leitstelle hat zurückgerufen */
  rueckruf: boolean;
  angenommenVon: Bearbeiter | null;
  gespraech: AnrufNachricht[];
  /** Antworten der Abfrage (vom Calltaker angeklickt) */
  antworten: Antworten;
  kapitel: string | null;
  extra: { aufwertung: string | null; zusatz: string | null; polizei: boolean };
  /** vorläufiger Code und Reanimationshinweis aus der Abfrage */
  ergebnis: { code: string; reanimation: boolean } | null;
  /** Folgeanruf: das sagt der Anrufer, sobald angenommen wird */
  folge?: string | null;
  /** Handy-Ortung (AML/GPS oder Funkzelle) */
  ortung?: { status: "laeuft" | "fertig"; fertigUm: number; lat?: number; lon?: number; radius?: number; art?: string } | null;
}

/** Wer einen Einsatz gerade bearbeitet (Multiplayer) */
export interface Bearbeiter {
  pid: string;
  name: string;
}

export interface Einsatz {
  id: string;
  nummer: string;
  erstellt: number;
  zustand: "neu" | "offen" | "laufend" | "abgeschlossen";
  /** Wahrheit der Simulation – für den Disponenten verborgen */
  wahr: {
    lat: number;
    lon: number;
    adresse: string;
    code: string;
    patientAlter: number;
    transport: boolean;
    abteilung: HospitalFlag;
    rtwBuchtSelbst: boolean;
    /** Wahrheit für den Anrufer (Abfrageschema) */
    abfrage?: { kapitel: string; antworten: Antworten; code: string; anrufer: Anrufer; lage: string; ortUnbekannt?: boolean; szenario?: Szenario };
    /** Verborgene Lage: Patienten und ihr Verlauf */
    lage?: Lage;
  };
  /** Was gemeldet wurde (später: Ergebnis der Notrufabfrage) */
  meldung: { text: string; adresse: string; adresseFalsch: boolean };
  /** Platz für das spätere Abfrageschema (Calltaker) */
  abfrage: Record<string, string> | null;
  /** Eingaben des Disponenten */
  code: string | null;
  /** dispo = vom Disponenten gewählt (die Abfrage überschreibt ihn dann nicht mehr) */
  codeQuelle: "dispo" | "abfrage" | null;
  adresse: Ort | null;
  zusatz: string;
  infoRtw: string;
  /** automatisch aus der Abfrage (Geschlecht, Alter, B, A) – steht vorne in infoRtw */
  infoAuto?: string;
  infoIntern: string;
  bo: Ort | null;
  zo: Ort | null;
  kh: { hospitalId: string; grund: HospitalFlag; durch: "dispo" | "rtw"; zeit: number } | null;
  khAnfrage: { abteilung: HospitalFlag; seit: number; von: string } | null;
  rueckrufGemacht: boolean;
  /** vom Calltaker aufgenommene Rückrufnummer */
  telefon?: string;
  adressePruefen: boolean;
  fahrzeuge: string[];
  protokoll: Protokoll[];
  bearbeiter?: Bearbeiter | null;
  anruf?: Anruf | null;
  /** offene Nachforderungen der Besatzung (Notarzt, weitere RTW) */
  nachforderungen?: Nachforderung[];
  /** BIT kam nicht: Besatzung transportiert selbst */
  bitVerzicht?: boolean;
  /** zuletzt ins Protokoll geschriebene Abfrage (Erstaufnahme, Änderungen) */
  abfrageStand?: { antworten: Antworten; kapitel: string | null; code: string | null } | null;
  /** angeforderte Partner-Organisationen (Zeitpunkt; sofort vor Ort) */
  partner?: Partial<Record<PartnerArt, number>>;
  /** Lagemeldung kommt ein paar Minuten nach dem Eintreffen */
  lageGeplant?: { um: number; fzId: string; angefordert: boolean; erstes: boolean } | null;
  /** zuletzt an fehlende Partner erinnert */
  partnerErinnert?: number;
}

export interface Funkmeldung {
  id: number;
  zeit: number;
  von: string;
  einsatzId: string | null;
  text: string;
  art: "status" | "sprechwunsch" | "info" | "warnung";
  quittiert: boolean;
}

export interface SimState {
  zeit: number;
  tempo: number;
  laeuft: boolean;
  fahrzeuge: Record<string, SimFahrzeug>;
  einsaetze: Einsatz[];
  funk: Funkmeldung[];
  wetter: Wetter;
  naechster: Record<Kategorie, number>;
  zaehler: number;
  funkZaehler: number;
  chat?: ChatNachricht[];
  funkGespraeche?: FunkGespraech[];
  funkGZaehler?: number;
  /** Krankentransporte */
  kt?: KtAuftrag[];
  ktZaehler?: number;
  /** Tag, für den die Daueraufträge schon angelegt sind (yyyy-mm-dd) */
  ktDauerTag?: number;
}

/** Befehle, die Spieler auslösen können (im Multiplayer laufen sie beim Host). */
export const BEFEHLE = {
  disponieren: [
    "alarmiere",
    "aktualisiere",
    "bucheKh",
    "entlasse",
    "schliesse",
    "rueckruf",
    "quittiere",
    "manualStatus",
    "setzeBesetzung",
    "oeffne",
    "anrufAnnehmen",
    "anrufNachricht",
    "anrufBeenden",
    "anrufHalten",
    "abfrageSetze",
    "abfrageExtra",
    "abfrageCode",
    "ortung",
    "funkAntworten",
    "funkRufen",
    "funkSenden",
    "funkFzAntwort",
    "funkEnde",
    "storno",
    "partnerAnfordern",
  ],
  steuern: ["start", "pause", "setTempo", "generiere", "setWetter", "wetterUebernehmen", "neuPlanen", "reset", "generiereKt", "generiereSek"],
  kt: [
    "ktNeuManuell",
    "ktAnrufAnnehmen",
    "ktAnrufNachricht",
    "ktAnrufBeenden",
    "ktAnrufHalten",
    "ktSetze",
    "ktAnlegen",
    "ktVormerken",
    "ktSchicken",
    "ktLoesen",
    "ktStorno",
    "ktFunkStorno",
  ],
  immer: ["chat"],
} as const;
export type Befehl = (typeof BEFEHLE)[keyof typeof BEFEHLE][number];
export type Berechtigung = "disponieren" | "steuern" | "einstellungen" | "kt";

export function berechtigungFuer(b: Befehl): Berechtigung | null {
  if ((BEFEHLE.disponieren as readonly string[]).includes(b)) return "disponieren";
  if ((BEFEHLE.steuern as readonly string[]).includes(b)) return "steuern";
  if ((BEFEHLE.kt as readonly string[]).includes(b)) return "kt";
  return null;
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Flugroute mit Platzrunden: gerade bis an den Kreis (Radius 350 m), n Runden mit ca. 120 km/h,
 * dann Landeanflug zur Mitte.
 */
function platzrunden(r: Route, ziel: LatLon, n: number): Route & { kreisAb: number; landungAb: number } {
  const R = 350;
  const [sx, sy] = r.coords[0];
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((ziel.lat * Math.PI) / 180);
  // Einflugpunkt: auf dem Kreis, Richtung Startpunkt
  let dx = (sx - ziel.lon) * mLon;
  let dy = (sy - ziel.lat) * mLat;
  const d = Math.hypot(dx, dy);
  if (d < R * 1.5) return { ...r, kreisAb: r.duration, landungAb: r.duration };
  dx /= d;
  dy /= d;
  const a0 = Math.atan2(dy, dx);
  const ein: [number, number] = [ziel.lon + (dx * R) / mLon, ziel.lat + (dy * R) / mLat];
  const geradeS = r.duration * ((d - R) / d);
  const coords: [number, number][] = [r.coords[0], ein];
  const times = [0, geradeS];
  const v = 120 / 3.6;
  const schritte = 24;
  const dt = (2 * Math.PI * R) / v / schritte;
  let t = geradeS;
  for (let i = 1; i <= n * schritte; i++) {
    const a = a0 + (i / schritte) * 2 * Math.PI;
    t += dt;
    coords.push([ziel.lon + (Math.cos(a) * R) / mLon, ziel.lat + (Math.sin(a) * R) / mLat]);
    times.push(t);
  }
  const landungAb = t;
  t += 35;
  coords.push([ziel.lon, ziel.lat]);
  times.push(t);
  return { coords, times, duration: t, distance: r.distance + n * 2 * Math.PI * R + R, kreisAb: geradeS, landungAb };
}

/** Hubschrauber (NAH, ITH) */
export function fliegt(fz: Pick<SimFahrzeug, "kategorie">): boolean {
  return fz.kategorie === "NAH" || fz.kategorie === "ITH";
}

/** Freitext aus der Info an den RTW (ohne den automatischen Teil vorne) */
export function infoFreitext(info: string, auto: string): string {
  if (!auto) return info.trim();
  if (info.startsWith(auto)) return info.slice(auto.length).replace(/^\s*\/\/\s*/, "").trim();
  return info.trim();
}

/** Punkt in gegebener Entfernung (m) und Richtung (Grad) */
function versetzt(lat: number, lon: number, meter: number, grad: number): { lat: number; lon: number } {
  const r = (grad * Math.PI) / 180;
  const dLat = (meter * Math.cos(r)) / 111_320;
  const dLon = (meter * Math.sin(r)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Wahrscheinlichkeit je Kapitel, dass der Anrufer draußen ist und den Ort nicht genau kennt */
const ORT_UNBEKANNT: Record<string, number> = { ALP: 0.8, "14": 0.4, "29": 0.2, "17": 0.12, "30": 0.12, "20": 0.15, "22": 0.15, "3": 0.15, "2": 0.08 };

/** Grobe Ortsbeschreibung, wie ein Anrufer ohne Adresse sie gibt (oder null = Adresse bekannt) */
function ortUnbekanntBeschreibung(kapitel: string, ort: string): string | null {
  if (Math.random() >= (ORT_UNBEKANNT[kapitel] ?? 0)) return null;
  const bei = ort.replace(/^.*,\s*/, "").replace(/^\d{4}\s+/, "") || "dem Ort";
  const varianten: Record<string, string[]> = {
    ALP: [`am Berg oberhalb von ${bei}, irgendwo am Wanderweg`, `im Wald über ${bei}, auf einem Steig, ich seh nur Bäume`, `auf einer Forststraße bei ${bei}, wir sind schon ewig gegangen`],
    "14": [`am Wasser bei ${bei}, beim Ufer, da ist so ein Badeplatz`, `an der Donau bei ${bei}, irgendwo am Radweg`],
    "29": [`auf der Landstraße bei ${bei}, kurz nach dem Ortsende`, `auf der Straße zwischen ${bei} und dem nächsten Ort, bei einer Kurve`],
  };
  const allgemein = [`auf einem Feldweg bei ${bei}`, `im Wald bei ${bei}, beim Weg`, `am Radweg bei ${bei}, zwischen den Feldern`];
  return pick(varianten[kapitel] ?? allgemein);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

/** Zufälliges Patientenalter, passend zur Gruppe. */
function alterFuer(code: Einsatzcode): number {
  if (code.gruppe === 24) return Math.round(rnd(18, 42));
  const r = Math.random();
  if (r < 0.1) return Math.round(rnd(1, 14));
  if (r < 0.35) return Math.round(rnd(15, 49));
  return Math.round(rnd(50, 95));
}

type Listener = () => void;

export class Simulation {
  state: SimState;
  /** solo = allein, host = Simulation läuft hier, client = Spiegel des Hosts */
  mode: "solo" | "host" | "client" = "solo";
  /** Im Client-Modus: schickt Befehle an den Host */
  remote: ((name: Befehl, args: unknown[]) => Promise<unknown>) | null = null;
  /** Wer den gerade laufenden Befehl ausgelöst hat */
  actor: Bearbeiter | null = null;
  /** Multiplayer: ist ein Spieler gerade verbunden? */
  istOnline: ((pid: string) => boolean) | null = null;
  /** Ich selbst (Name im Multiplayer) */
  ich: Bearbeiter | null = null;
  private listeners = new Set<Listener>();
  private routingBusy = new Set<string>();
  private lastReal = 0;
  private timer: number | undefined;

  constructor() {
    this.state = Simulation.leererZustand();
    this.syncVehicles();
    this.planGenerator(true);
    store.onChange(() => this.syncVehicles());
  }

  static leererZustand(): SimState {
    const now = Date.now();
    return {
      zeit: now,
      tempo: 1,
      laeuft: false,
      fahrzeuge: {},
      einsaetze: [],
      funk: [],
      wetter: nextWetter(now, null),
      naechster: { stabil: 0, dringend: 0, kritisch: 0 },
      zaehler: 0,
      funkZaehler: 0,
      chat: [],
      funkGespraeche: [],
      funkGZaehler: 0,
      kt: [],
      ktZaehler: 0,
    };
  }

  /** Neue, leere Leitstelle (z. B. nach dem Verlassen eines Spiels). */
  neu(): void {
    this.pause();
    this.state = Simulation.leererZustand();
    this.syncVehicles();
    this.planGenerator(true);
    this.emit();
  }

  get settings(): Settings {
    return store.settings;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    // nicht neu zeichnen, während ein Knopf gedrückt ist (sonst geht der Klick verloren)
    nachKlick(this.emitJetzt);
  }

  private readonly emitJetzt = (): void => {
    for (const fn of this.listeners) fn();
  };

  /** Benachrichtigt die Oberfläche (z. B. nach Daten vom Host). */
  notify(): void {
    this.emit();
  }

  /**
   * Führt einen Befehl aus – allein oder als Host sofort, als Mitspieler beim Host.
   * Die Oberfläche ruft Änderungen immer hierüber auf.
   */
  async call<K extends Befehl>(name: K, ...args: Parameters<Simulation[K]>): Promise<Awaited<ReturnType<Simulation[K]>>> {
    if (this.remote) return (await this.remote(name, args)) as Awaited<ReturnType<Simulation[K]>>;
    if (this.mode === "host" && this.ich) return (await this.ausfuehren(name, args, this.ich)) as Awaited<ReturnType<Simulation[K]>>;
    return (await (this[name] as (...a: unknown[]) => unknown)(...args)) as Awaited<ReturnType<Simulation[K]>>;
  }

  /** Beim Host: Befehl eines Mitspielers ausführen (Berechtigung ist schon geprüft). */
  async ausfuehren(name: Befehl, args: unknown[], von: Bearbeiter): Promise<unknown> {
    const vorher = this.actor;
    this.actor = von;
    try {
      const fn = this[name] as (...a: unknown[]) => unknown;
      if (typeof fn !== "function") throw new Error(`Unbekannter Befehl ${name}`);
      // Wer an einem Einsatz arbeitet, wird als Bearbeiter vermerkt
      const eid = typeof args[0] === "string" ? this.einsatz(args[0]) : undefined;
      if (eid && name !== "schliesse" && name !== "oeffne" && (BEFEHLE.disponieren as readonly string[]).includes(name)) {
        eid.bearbeiter = { ...von };
      }
      return await fn.apply(this, args);
    } finally {
      this.actor = vorher;
    }
  }

  /** Ersetzt den ganzen Zustand (Spielstand laden, Daten vom Host). */
  ladeZustand(st: SimState): void {
    this.pause();
    st.chat ??= [];
    for (const fz of Object.values(st.fahrzeuge)) {
      // Routenberechnung lief beim Speichern gerade: Fahrzeug fährt zur Wache
      if (fz.phase === "routing") {
        fz.phase = "rueckfahrt";
        fz.fahrt = null;
        fz.phaseEnde = st.zeit;
      }
    }
    this.state = st;
    this.state.laeuft = false;
    this.emit();
  }

  /** Spieler öffnet einen Einsatz (Multiplayer: andere sehen, wer daran arbeitet). */
  oeffne(id: string): void {
    const e = this.einsatz(id);
    if (!e || !this.actor || e.zustand === "abgeschlossen") return;
    // Nur ansehen nimmt den Einsatz niemandem weg (auch keinen Entwurf) – erst eine Eingabe übernimmt ihn
    if (!e.bearbeiter) {
      e.bearbeiter = { ...this.actor };
      this.emit();
    }
  }

  chat(text: string): void {
    const t = text.trim().slice(0, 500);
    if (!t) return;
    this.state.chat ??= [];
    this.state.chat.push({ zeit: Date.now(), von: this.actor?.name ?? "Leitstelle", text: t });
    if (this.state.chat.length > 200) this.state.chat.splice(0, this.state.chat.length - 200);
    this.emit();
  }

  /** Gewählte Funkgruppe (= Einsatzgebiet) */
  funkgruppe(): Funkgruppe {
    return funkgruppe(this.settings.funkgruppe);
  }

  /** Zufällige Adresse innerhalb der Funkgruppe (Adressen kommen aus der Box, hier wird genau geprüft) */
  private async adresseImGebiet(): Promise<Awaited<ReturnType<typeof randomAddresses>>[number] | null> {
    const g = this.funkgruppe();
    for (let i = 0; i < 6; i++) {
      const hits = await randomAddresses(g.bbox, 8);
      const drin = hits.find((h) => inFunkgruppe(g, h.lat, h.lon));
      if (drin) return drin;
    }
    return null;
  }

  /** Wetter-Einstellungen */
  wetterOpt(): WetterOpt {
    const s = this.settings;
    const alt = s.wetterModus === "fest" ? 0 : s.wetterModus === "wechselhaft" ? 80 : 50;
    return {
      wechsel: Math.max(0, Math.min(100, s.wetterWechsel ?? alt)),
      jahreszeit: s.jahreszeit ?? "auto",
      festLage: lageVon(s.wetterFestLage ?? "klar"),
      festTemp: s.wetterFestTemp ?? 18,
    };
  }

  /** aktuelle Temperatur (°C) */
  temperatur(): number {
    const w = this.state.wetter;
    return temperatur(this.state.zeit, lageVon(w.lage), this.wetterOpt(), { lage: w.vorher, seit: w.seit });
  }

  /** alle aktuellen Wetterwerte (Wind, Sicht …) */
  wetterWerte(): WetterWerte {
    return wetterJetzt(this.state.wetter, this.state.zeit, this.wetterOpt());
  }

  /** stündliche Wetterprognose */
  wetterPrognose(stunden = 12): PrognoseStunde[] {
    return prognose(this.state.wetter, this.state.zeit, this.wetterOpt(), stunden);
  }

  /** Flugbetrieb wetterbedingt nicht möglich? */
  flugverbotJetzt(): boolean {
    return this.settings.wetterAktiv && flugverbot(this.state.wetter.lage, this.state.wetter.wind ?? 0);
  }

  /**
   * Geänderte Wetter-Einstellungen übernehmen.
   * fliessend: das aktuelle Wetter bleibt, nur die Vorhersage wird nach den neuen Einstellungen neu gerechnet –
   * das Wetter geht mit den nächsten Wechseln sanft in das neue Muster über.
   * neu: Wetter und Vorhersage werden sofort komplett neu gesetzt.
   */
  wetterUebernehmen(art: "fliessend" | "neu"): void {
    const o = this.wetterOpt();
    const t = this.state.zeit;
    const w = this.state.wetter;
    if (art === "neu" || o.wechsel <= 0) {
      const start = o.wechsel <= 0 ? o.festLage : nextWetter(t, null, o).lage;
      this.state.wetter = wetterSetzen(lageVon(start), t, o, w);
      this.state.wetter.vorher = null; // kein Übergang: sofort das neue Wetter
    } else {
      // nächster Wechsel spätestens nach dem neuen Takt, Vorhersage neu
      w.plan = [];
      const takt = nextWetter(t, w.lage, o, w.wind, w.richtung);
      w.bis = Math.min(w.bis, t + Math.max(10 * 60_000, takt.bis - t));
      planAuffuellen(w, o);
    }
    this.funk("Wetterdienst", null, `Wetter: ${WETTER_LABEL[lageVon(this.state.wetter.lage)]}`, "info");
    this.emit();
  }

  setWetter(lage: Wetter["lage"]): void {
    this.state.wetter = wetterSetzen(lageVon(lage), this.state.zeit, this.wetterOpt(), this.state.wetter);
    this.funk("Wetterdienst", null, `Wetter: ${WETTER_LABEL[lageVon(lage)]}`, flugverbot(lageVon(lage)) ? "warnung" : "info");
    this.emit();
  }

  // ------------------------------------------------------------------ Uhr

  start(): void {
    if (this.timer !== undefined) return;
    this.lastReal = performance.now();
    this.timer = window.setInterval(() => this.tick(), 250);
    this.state.laeuft = true;
    this.emit();
  }

  pause(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.state.laeuft = false;
    this.emit();
  }

  setTempo(t: number): void {
    this.state.tempo = t;
    this.emit();
  }

  private tick(): void {
    const nowReal = performance.now();
    const dt = Math.min(2000, nowReal - this.lastReal) * this.state.tempo;
    this.lastReal = nowReal;
    this.state.zeit += dt;
    const t = this.state.zeit;

    if (this.settings.wetterAktiv && (t >= this.state.wetter.bis || !this.state.wetter.plan?.length || (this.wetterOpt().wechsel <= 0 && this.state.wetter.lage !== this.wetterOpt().festLage))) {
      if (wetterFortschreiben(this.state.wetter, t, this.wetterOpt())) {
        this.funk("Wetterdienst", null, `Wetter: ${WETTER_LABEL[this.state.wetter.lage]}`, flugverbot(this.state.wetter.lage, this.state.wetter.wind) ? "warnung" : "info");
      }
    }
    this.runGenerator(dt);
    this.ktTick(t, dt);
    for (const fz of Object.values(this.state.fahrzeuge)) this.updateVehicle(fz, t);
    this.checkKhAnfragen(t);
    this.anrufeTick(t);
    this.lageTick(t);
    this.funkTick(t);
    this.emit();
  }

  // ------------------------------------------------------------------ Fahrzeuge

  /** Übernimmt aktive RTW/KTW/NEF/NAH aus den Stammdaten (neue kommen dazu, gelöschte gehen). */
  private syncVehicles(): void {
    if (this.mode === "client") return;
    const stations = store.stationsById();
    const wanted = store
      .list("vehicles")
      .filter((v) => v.aktiv && ACTIVE_CATEGORIES.includes(v.kategorie) && stations.has(v.dienststelleId));
    const ids = new Set(wanted.map((v) => v.id));
    for (const id of Object.keys(this.state.fahrzeuge)) {
      const fz = this.state.fahrzeuge[id];
      if (!ids.has(id) && !fz.einsatzId) delete this.state.fahrzeuge[id];
    }
    for (const v of wanted) {
      const st = stations.get(v.dienststelleId)!;
      const existing = this.state.fahrzeuge[v.id];
      const rmTyp = rmTypVon(v);
      if (existing) {
        if (existing.rmTyp !== rmTyp) existing.besetzung = generiereBesetzung(rmTyp);
        Object.assign(existing, {
          funkrufname: v.funkrufname,
          kurzname: v.kurzname,
          kategorie: v.kategorie,
          rmTyp,
          nachtflug: v.nachtflug,
          stationName: st.name,
        });
        continue;
      }
      this.state.fahrzeuge[v.id] = {
        id: v.id,
        funkrufname: v.funkrufname,
        kurzname: v.kurzname,
        kategorie: v.kategorie,
        rmTyp,
        besetzung: generiereBesetzung(rmTyp),
        stationId: st.id,
        stationName: st.name,
        heim: { lat: st.lat, lon: st.lon },
        lat: st.lat,
        lon: st.lon,
        status: "freiWache",
        phase: "frei",
        phaseEnde: null,
        einsatzId: null,
        fahrt: null,
        nachtflug: v.nachtflug,
        begleitet: false,
      };
    }
  }

  statusDef(key: StatusKey) {
    return this.settings.status.find((s) => s.key === key)!;
  }

  /** Besetzung manuell ändern (Kontextmenü „Besetzung ändern“). */
  setzeBesetzung(id: string, besetzung: Platz[]): void {
    const fz = this.state.fahrzeuge[id];
    if (!fz) return;
    fz.besetzung = besetzung.map((p) => ({ ...p }));
    this.emit();
  }

  /** Kann Patienten transportieren (RTW, RTW-C, KTW, Sekundärfahrzeuge) */
  transportfaehig(fz: SimFahrzeug): boolean {
    return ["RTW", "RTW-C", "KTW", "SKTW", "SRTW", "SNAW", "BIT"].includes(fz.rmTyp);
  }

  /** Hat einen Notarzt an Bord (NEF, NAH, SNAW) */
  mitNotarzt(fz: SimFahrzeug): boolean {
    return ["NEF", "NAH", "ITH", "SNAW"].includes(fz.rmTyp);
  }

  /** Wer spricht am Funk für den Einsatz? Der BEL vor Ort ist Ansprechpartner Nr. 1. */
  private sprecher(e: Einsatz, sonst: SimFahrzeug): SimFahrzeug {
    return this.einsatzFz(e).find((x) => x.rmTyp === "BEL" && x.phase === "vorOrt") ?? sonst;
  }

  verfuegbar(fz: SimFahrzeug): boolean {
    return this.statusDef(fz.status).verfuegbar && !fz.einsatzId && !fz.kt?.aktiv;
  }

  /** Kann der Hubschrauber gerade fliegen? Gibt den Grund zurück, wenn nicht. */
  flugHindernis(fz: SimFahrzeug): string | null {
    if (!fliegt(fz)) return null;
    if (this.flugverbotJetzt()) {
      const w = this.state.wetter;
      return `Flug wetterbedingt nicht möglich (${WETTER_LABEL[lageVon(w.lage)]}${(w.wind ?? 0) >= 50 ? ", Sturm" : ""})`;
    }
    if (istNacht(this.state.zeit, fz.heim.lat, fz.heim.lon) && !fz.nachtflug) {
      return "Kein Nachtflug möglich";
    }
    return null;
  }

  private setStatus(fz: SimFahrzeug, s: StatusKey, quiet = false): void {
    if (fz.status === s) return;
    fz.status = s;
    const def = this.statusDef(s);
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    if (e) this.log(e, /^\d+$/.test(def.nummer) ? `${fz.funkrufname}: Status ${def.nummer} – ${def.name}` : `${fz.funkrufname}: ${def.name}`);
    // „Alarmiert auf Wache/über Funk“ setzt die Leitstelle, nicht das Fahrzeug
    if (s === "alarmWache" || s === "alarmFunk") return;
    if (!quiet) this.funk(fz.funkrufname, fz.einsatzId, `Status ${def.nummer} – ${def.name}`, "status");
  }

  /** Manuelle Statusänderung durch den Disponenten (nur ohne Einsatz). */
  manualStatus(id: string, s: StatusKey): string | null {
    const fz = this.state.fahrzeuge[id];
    if (!fz) return "Fahrzeug nicht gefunden";
    if (fz.einsatzId) return "Fahrzeug ist im Einsatz – zuerst freigeben";
    this.setStatus(fz, s, true);
    if (s === "freiWache") {
      fz.lat = fz.heim.lat;
      fz.lon = fz.heim.lon;
      fz.fahrt = null;
      fz.phase = "frei";
    }
    this.emit();
    return null;
  }

  private position(fz: SimFahrzeug, t: number): void {
    const f = fz.fahrt;
    if (!f) return;
    const el = (t - f.start) / 1000;
    if (el >= f.dauer) {
      const last = f.coords[f.coords.length - 1];
      fz.lon = last[0];
      fz.lat = last[1];
      return;
    }
    let i = 1;
    while (i < f.times.length && f.times[i] < el) i++;
    const t0 = f.times[i - 1];
    const t1 = f.times[i] ?? t0;
    const k = t1 > t0 ? (el - t0) / (t1 - t0) : 1;
    const a = f.coords[i - 1];
    const b = f.coords[i] ?? a;
    fz.lon = a[0] + (b[0] - a[0]) * k;
    fz.lat = a[1] + (b[1] - a[1]) * k;
  }

  private faktor(e: Einsatz | undefined): number {
    const st = e ? this.stufeVon(e) : undefined;
    return st?.sondersignal ? this.settings.sondersignalFaktor : 1;
  }

  /** Startet eine Fahrt (asynchron, Routing) und setzt danach die Phase. */
  private fahre(fz: SimFahrzeug, ziel: LatLon, phase: Phase, sondersignal: boolean): void {
    this.routingBusy.add(fz.id);
    fz.phase = "routing";
    fz.blaulicht = sondersignal && !fliegt(fz);
    const von = { lat: fz.lat, lon: fz.lon };
    const p: Promise<Route> =
      fliegt(fz) ? Promise.resolve(flightRoute(von, ziel, this.settings.nahGeschwindigkeit)) : route(von, ziel);
    void p.then((r) => {
      this.routingBusy.delete(fz.id);
      const wf = !fliegt(fz) && this.settings.wetterAktiv ? fahrFaktor(this.state.wetter.lage, this.temperatur()) : 1;
      const f = (sondersignal && !fliegt(fz) ? this.settings.sondersignalFaktor : 1) * wf;
      // Hubschrauber kreist 1–3 Mal über Einsatzorten (nicht über Krankenhäusern und Landeplätzen)
      const kreis = fliegt(fz) && phase === "anfahrt" && !this.istLandeplatz(ziel) ? platzrunden(r, ziel, 1 + Math.floor(Math.random() * 3)) : null;
      const rr = kreis ?? r;
      fz.fahrt = { coords: rr.coords, times: rr.times.map((x) => x * f), start: this.state.zeit, dauer: rr.duration * f, blau: sondersignal };
      if (kreis) Object.assign(fz.fahrt, { kreisAb: kreis.kreisAb, landungAb: kreis.landungAb });
      fz.phase = phase;
      fz.phaseEnde = this.state.zeit + fz.fahrt.dauer * 1000;
      this.emit();
    });
  }

  /** Krankenhaus, Hubschrauberstützpunkt oder Landeplatz in der Nähe (≤ 300 m)? */
  private istLandeplatz(p: LatLon): boolean {
    const nah = (x: LatLon) => distanceM(p, x) < 300;
    if (store.list("hospitals").some(nah)) return true;
    if (store.list("pois").some((x) => /lande|heli|hubschrauber/i.test(`${x.typ} ${x.name}`) && nah(x))) return true;
    return Object.values(this.state.fahrzeuge).some((f) => fliegt(f) && nah(f.heim));
  }

  private updateVehicle(fz: SimFahrzeug, t: number): void {
    if (fz.phase === "routing") return;
    this.position(fz, t);
    if (fz.kt?.aktiv && !fz.einsatzId) {
      if (fz.quittUm && t >= fz.quittUm) {
        fz.quittUm = null;
        if (fz.status === "alarmWache") this.setStatus(fz, "alarmiert");
      }
      if (fz.phaseEnde !== null && t >= fz.phaseEnde) this.ktUpdate(fz, t);
      return;
    }
    if (fz.phaseEnde === null || t < fz.phaseEnde) return;
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;

    switch (fz.phase) {
      case "ausruecken": {
        if (!e || !e.adresse) return this.freigeben(fz);
        // selten: technischer Defekt beim Ausrücken
        if (Math.random() < 0.004 && !fliegt(fz)) {
          this.log(e, `${fz.funkrufname}: technischer Defekt, nicht einsatzbereit`);
          this.fzRuft(fz, e, "nachforderung", "technischer Defekt am Fahrzeug, sind nicht einsatzbereit, bitte anderes Rettungsmittel alarmieren");
          this.freigeben(fz);
          fz.defektBis = t + rnd(30, 60) * MIN;
          this.setStatus(fz, "abgemeldet");
          return;
        }
        this.setStatus(fz, "zumBO");
        this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
        break;
      }
      case "anfahrt": {
        fz.fahrt = null;
        if (!e) return this.freigeben(fz);
        this.setStatus(fz, "amBO");
        if (!e.adresse) return;
        const d = distanceM(e.adresse, e.wahr);
        if (d > this.settings.verortungRadius) {
          fz.phase = "suche";
          fz.phaseEnde = null;
          if (!e.adressePruefen) {
            e.adressePruefen = true;
            this.log(e, `${fz.funkrufname}: kein Patient an der angegebenen Adresse`);
            this.fzRuft(fz, e, "adresse", "kein Patient an der angegebenen Adresse, bitte Adresse prüfen");
          }
        } else {
          fz.phase = "vorOrt";
          fz.phaseEnde = t + rnd(10, 22) * MIN;
          fz.vorOrtSeit = t;
          fz.zwischenGemeldet = false;
          // manchmal: schwierige Zufahrt / Hausnummer schlecht auffindbar
          if (Math.random() < 0.06 && this.transportfaehig(fz)) {
            const plus = rnd(2, 4);
            fz.phaseEnde += plus * MIN;
            this.fzRuft(fz, e, "info", `Zufahrt schwierig, Hausnummer schlecht auffindbar, Patientenkontakt verzögert sich um ca. ${Math.round(plus)} Minuten`);
          }
          if (fz.rmTyp === "BIT") fz.phaseEnde = t + rnd(20, 35) * MIN; // Schwerlast: Umlagern dauert
          this.eintreffenLage(fz, e);
          this.ktHilfeDa(e);
          const p0 = e.wahr.lage?.patienten[0];
          if (p0 && istStillstand(p0)) fz.phaseEnde = t + rnd(30, 45) * MIN;
        }
        break;
      }
      case "vorOrt": {
        if (!e) return this.freigeben(fz);
        // ohne Feuerwehr/Polizei/Berg-/Wasserrettung geht es nicht weiter (Befreiung, Eigenschutz)
        const fehlen = this.partnerFehlt(e);
        if (fehlen.length) {
          fz.phaseEnde = t + 2 * MIN;
          if (!e.partnerErinnert || t - e.partnerErinnert > 6 * MIN) {
            e.partnerErinnert = t;
            this.log(e, `${fz.funkrufname} wartet auf ${fehlen.map((x) => PARTNER[x.art].name).join(", ")}`);
            this.fzRuft(this.sprecher(e, fz), e, "nachforderung", `benötigen weiterhin ${fehlen.map((x) => `${PARTNER[x.art].name} (${x.grund})`).join(" und ")}, ohne können wir nicht weiterarbeiten`);
          }
          break;
        }
        this.entscheideTransport(fz, e, t);
        break;
      }
      case "warteKH":
        break;
      case "transport": {
        fz.fahrt = null;
        fz.blaulicht = false;
        this.setStatus(fz, "amZO");
        fz.phase = "uebergabe";
        fz.phaseEnde = t + rnd(8, 18) * MIN;
        break;
      }
      case "uebergabe": {
        if (e) this.log(e, `${fz.funkrufname}: Übergabe abgeschlossen`);
        this.freigeben(fz);
        break;
      }
      case "rueckfahrt": {
        fz.fahrt = null;
        fz.phase = "frei";
        fz.phaseEnde = null;
        fz.lat = fz.heim.lat;
        fz.lon = fz.heim.lon;
        if (fz.defektBis && t < fz.defektBis) this.setStatus(fz, "abgemeldet", true);
        else this.setStatus(fz, "freiWache", true);
        break;
      }
      default:
        break;
    }
  }

  private kritisch(e: Einsatz): boolean {
    return this.stufeVon(e)?.kategorie === "kritisch";
  }

  private entscheideTransport(fz: SimFahrzeug, e: Einsatz, t: number): void {
    if (!this.transportfaehig(fz)) {
      // NEF/NAH: begleitet bei kritischen Transporten, sonst frei
      const rtwMitTransport =
        e.wahr.transport &&
        e.fahrzeuge.some((id) => {
          const x = this.state.fahrzeuge[id];
          return x && x.einsatzId === e.id && this.transportfaehig(x);
        });
      // Notarzt fährt mit: kritischer Einsatz oder (beim BIT-Transport) Notarzt nötig
      const naMit = this.kritisch(e) || (!!e.wahr.lage?.bit && bedarf(e.wahr.lage).na > 0);
      if (rtwMitTransport && naMit && fz.kategorie === "NEF") {
        fz.begleitet = true;
        this.log(e, `${fz.funkrufname}: Notarzt begleitet den Transport`);
      } else if (rtwMitTransport && this.kritisch(e) && fliegt(fz)) {
        this.log(e, `${fz.funkrufname}: Patient wird mit dem NAH transportiert`);
        fz.begleitet = true;
      } else {
        this.log(e, `${fz.funkrufname}: Einsatz beendet`);
        return this.freigeben(fz);
      }
      fz.phase = "warteKH";
      fz.phaseEnde = null;
      if (e.kh) this.startTransport(e);
      return;
    }
    // Schwerer Patient: der BIT transportiert; bis er da ist, wartet die Besatzung
    const l = e.wahr.lage;
    if (l?.bit && e.wahr.transport && !e.bitVerzicht && fz.rmTyp !== "BIT") {
      const bit = this.einsatzFz(e).find((x) => x.rmTyp === "BIT");
      if (bit && (bit.phase === "vorOrt" || bit.phase === "warteKH")) {
        this.log(e, `${fz.funkrufname}: Patient wird vom BIT ${bit.funkrufname} transportiert`);
        this.funk(fz.funkrufname, e.id, `Patient an BIT ${bit.funkrufname} übergeben`, "info");
        return this.freigeben(fz);
      }
      const nf = e.nachforderungen?.find((n) => n.art === "BIT");
      const seit = nf?.seit ?? t;
      // BIT ist unterwegs: auf ihn warten; sonst nur begrenzt
      if (bit || t - seit < BIT_WARTEN) {
        fz.phaseEnde = t + 2 * MIN;
        return;
      }
      e.bitVerzicht = true;
      if (nf) nf.erledigt = true;
      this.log(e, `${fz.funkrufname}: kein BIT verfügbar – Transport mit eigenem Fahrzeug`);
      this.fzRuft(fz, e, "info", "kein BIT gekommen, wir transportieren mit eigenem Fahrzeug, mit zusätzlicher Tragehilfe");
    }
    if (!e.wahr.transport) {
      this.log(e, `${fz.funkrufname}: kein Transport erforderlich`);
      this.funk(fz.funkrufname, e.id, "Kein Transport, Patient verbleibt vor Ort", "info");
      return this.freigeben(fz);
    }
    fz.phase = "warteKH";
    fz.phaseEnde = null;
    if (e.kh) return this.startTransport(e);
    if (e.wahr.rtwBuchtSelbst) {
      this.bucheKhAuto(e, fz.funkrufname);
      return;
    }
    e.khAnfrage = { abteilung: e.wahr.abteilung, seit: t, von: fz.funkrufname };
    this.fzRuft(fz, e, "kh", `erbitte KH-Buchung, ${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]}`);
    this.log(e, `${fz.funkrufname} erbittet KH-Buchung (${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]})`);
  }

  /** Bucht automatisch das nächstgelegene passende Krankenhaus (RTW bucht selbst). */
  private bucheKhAuto(e: Einsatz, von: string): void {
    const ziel = this.naechstesKh(e.wahr, e.wahr.abteilung);
    if (!ziel) return;
    e.kh = { hospitalId: ziel.id, grund: e.wahr.abteilung, durch: "rtw", zeit: this.state.zeit };
    e.zo = { lat: ziel.lat, lon: ziel.lon, label: ziel.name };
    e.khAnfrage = null;
    this.log(e, `${von} bucht ${ziel.name} (${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]})`);
    this.funk(von, e.id, `KH gebucht: ${ziel.kurzname || ziel.name} – ${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]}`, "info");
    this.startTransport(e);
  }

  naechstesKh(pos: LatLon, abteilung: HospitalFlag): Hospital | undefined {
    const all = store.list("hospitals").filter((h) => this.khImNetz(h));
    const passend = all.filter((h) => h.abteilungen[abteilung]);
    const pool = passend.length ? passend : all.filter((h) => h.abteilungen.notfallambulanz);
    return pool.slice().sort((a, b) => distanceM(pos, a) - distanceM(pos, b))[0];
  }

  private checkKhAnfragen(t: number): void {
    for (const e of this.state.einsaetze) {
      if (e.khAnfrage && t - e.khAnfrage.seit > 4 * MIN) {
        this.funk(e.khAnfrage.von, e.id, "Keine Rückmeldung – buchen selbst", "info");
        this.bucheKhAuto(e, e.khAnfrage.von);
      }
    }
  }

  /** Alle Fahrzeuge des Einsatzes, die auf das KH warten, fahren los. */
  private startTransport(e: Einsatz): void {
    if (!e.kh) return;
    const h = store.get("hospitals", e.kh.hospitalId);
    if (!h) return;
    for (const id of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[id];
      if (!fz || fz.phase !== "warteKH") continue;
      this.setStatus(fz, "zumZO");
      this.fahre(fz, h, "transport", this.kritisch(e));
    }
  }

  /** Fahrzeug aus dem Einsatz lösen und zurück zur Wache schicken. */
  freigeben(fz: SimFahrzeug): void {
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    fz.einsatzId = null;
    fz.begleitet = false;
    fz.blaulicht = false;
    fz.vorOrtSeit = null;
    fz.transportGemeldet = false;
    this.setStatus(fz, "freiFunk");
    if (distanceM(fz, fz.heim) < 80) {
      fz.phase = "frei";
      fz.phaseEnde = null;
      fz.fahrt = null;
      this.setStatus(fz, "freiWache", true);
    } else {
      this.fahre(fz, fz.heim, "rueckfahrt", false);
    }
    if (e) this.pruefeAbschluss(e);
  }

  private pruefeAbschluss(e: Einsatz): void {
    const aktiv = Object.values(this.state.fahrzeuge).some((f) => f.einsatzId === e.id);
    if (!aktiv && e.fahrzeuge.length > 0 && e.zustand !== "abgeschlossen") {
      e.zustand = "abgeschlossen";
      e.khAnfrage = null;
      this.log(e, "Einsatz abgeschlossen");
    }
  }

  // ------------------------------------------------------------------ Einsätze

  einsatz(id: string): Einsatz | undefined {
    return this.state.einsaetze.find((e) => e.id === id);
  }

  stufeVon(e: Einsatz): StufeDef | undefined {
    const c = findCode(e.code ?? undefined);
    return c ? this.stufeDef(c.stufe) : undefined;
  }

  /** Bedeutung einer Stufe; unbekannte Stufen (neu importiert) bekommen Standardwerte. */
  stufeDef(stufe: string): StufeDef | undefined {
    if (!stufe) return undefined;
    return this.settings.stufen.find((s) => s.stufe === stufe) ?? defaultStufeFuer(stufe);
  }

  log(e: Einsatz, text: string): void {
    const p: Protokoll = { zeit: this.state.zeit, text };
    if (this.actor && this.mode !== "solo") p.von = this.actor.name;
    e.protokoll.push(p);
  }

  funk(von: string, einsatzId: string | null, text: string, art: Funkmeldung["art"]): void {
    this.state.funk.unshift({
      id: ++this.state.funkZaehler,
      zeit: this.state.zeit,
      von,
      einsatzId,
      text,
      art,
      quittiert: art === "status" || art === "info",
    });
    if (this.state.funk.length > 300) this.state.funk.length = 300;
  }

  quittiere(funkId: number): void {
    const m = this.state.funk.find((f) => f.id === funkId);
    if (m) m.quittiert = true;
    this.emit();
  }

  private neueNummer(): string {
    const d = new Date(this.state.zeit);
    this.state.zaehler++;
    return `${pad(d.getFullYear() % 100, 2)}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}-${pad(this.state.zaehler, 4)}`;
  }

  /** Legt einen Einsatz an (vom Generator, aus einer Vorlage oder später vom Calltaker). */
  erstelleEinsatz(p: {
    lat: number;
    lon: number;
    adresse: string;
    code: Einsatzcode;
    meldung?: string;
    gemeldeteAdresse?: string;
    /** echte Gemeinde (bei Orten ohne Adresse) */
    gemeinde?: string;
    patientAlter?: number | null;
    transport?: boolean | null;
    /** Fall aus dem Abfrageschema: Einsatz kommt als Anruf */
    fall?: Fall | null;
  }): Einsatz {
    const stufe = this.stufeDef(p.code.stufe);
    const alter = p.patientAlter ?? alterFuer(p.code);
    const kritisch = stufe?.kategorie === "kritisch";
    const transport = p.transport ?? Math.random() * 100 < (stufe?.transportProzent ?? 70);
    const gemeldet = p.gemeldeteAdresse ?? p.adresse;
    const e: Einsatz = {
      id: `e${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      nummer: this.neueNummer(),
      erstellt: this.state.zeit,
      zustand: "neu",
      wahr: {
        lat: p.lat,
        lon: p.lon,
        adresse: p.adresse,
        code: p.code.code,
        patientAlter: alter,
        transport,
        abteilung: abteilungFuer(p.code, alter < 15, kritisch),
        rtwBuchtSelbst: Math.random() < 0.5,
      },
      meldung: {
        text: p.meldung || `${p.code.beschreibung}. Patient ca. ${alter} Jahre.`,
        adresse: gemeldet,
        adresseFalsch: gemeldet !== p.adresse,
      },
      abfrage: null,
      code: null,
      codeQuelle: null,
      adresse: null,
      zusatz: "",
      infoRtw: "",
      infoIntern: "",
      bo: null,
      zo: null,
      kh: null,
      khAnfrage: null,
      rueckrufGemacht: false,
      adressePruefen: false,
      fahrzeuge: [],
      protokoll: [],
    };
    for (const art of partnerSchonDa(p.fall?.kapitel)) (e.partner ??= {})[art] = this.state.zeit;
    if (p.fall && store.schema) {
      const schema = store.schema;
      const vorlage = p.fall.vorlage ? SZENARIEN.find((v) => v.id === p.fall!.vorlage) : undefined;
      const ortArt: OrtArt | undefined = p.fall.ortArt ?? vorlage?.orte[0];
      const anrufer = anruferWaehlen(
        p.fall.kapitel,
        p.fall.antworten,
        Math.random,
        gemeldet,
        vorlage && ortArt ? { typen: vorlage.anrufer, ort: ORT_LABEL[ortArt] } : undefined,
      );
      let szenario: Szenario | undefined;
      if (vorlage) {
        const a = p.fall.antworten;
        const w = a.geschlecht === "w";
        const alt = typeof a.alter === "number" ? a.alter : alter;
        // Familie heißt gleich
        const familie = /ehe|lebensgef|mutter|vater|tochter|sohn/i.test(anrufer.rolle);
        const neu = zufallsName(w ? "w" : "m");
        const pname = anrufer.selbst ? anrufer.name : familie ? `${neu.split(" ")[0]} ${anrufer.name.split(" ").slice(1).join(" ")}` : neu;
        szenario = szenarioBauen(vorlage, a, { bezug: bezugFuer(anrufer.rolle, anrufer.selbst, w, alt), selbst: anrufer.selbst, ort: p.gemeinde ?? gemeindeVon(p.adresse), name: pname, ortArt }, Math.random);
        const st = stimmungAusVerlauf(szenario.verlauf);
        if (st && (anrufer.art ?? "privat") === "privat") anrufer.emotion = st;
      }
      e.wahr.abfrage = {
        kapitel: p.fall.kapitel,
        antworten: p.fall.antworten,
        code: p.fall.code,
        anrufer,
        lage: `${schema.codes[p.fall.code]?.name ?? p.code.beschreibung} (${schema.kapitel[p.fall.kapitel]?.titel ?? ""})`,
        szenario,
      };
      e.meldung.text = "";
      e.wahr.lage = lageErzeugen(p.fall.kapitel, p.fall.antworten, this.state.zeit, kritisch, this.settings.komplikationen ?? "normal");
      e.anruf = {
        status: "klingelt",
        seit: this.state.zeit,
        klingelBis: this.state.zeit + rnd(45, 75) * 1000,
        rueckrufUm: null,
        versuche: 1,
        rueckruf: false,
        angenommenVon: null,
        gespraech: [],
        antworten: {},
        kapitel: null,
        extra: { aufwertung: null, zusatz: null, polizei: false },
        ergebnis: null,
      };
    }
    this.log(e, e.anruf ? "Notruf klingelt" : "Notruf eingegangen");
    this.state.einsaetze.unshift(e);
    this.funk("Notruf", e.id, `Neuer Einsatz ${e.nummer}`, "info");
    this.emit();
    return e;
  }

  /** Disponent setzt Code, Adresse und Texte. */
  aktualisiere(
    id: string,
    patch: Partial<Pick<Einsatz, "code" | "adresse" | "zusatz" | "infoRtw" | "infoIntern" | "bo" | "zo" | "telefon">>,
  ): void {
    const e = this.einsatz(id);
    if (!e) return;
    const adresseNeu = patch.adresse && (!e.adresse || distanceM(patch.adresse, e.adresse) > 5);
    Object.assign(e, patch);
    if (patch.code !== undefined) e.codeQuelle = "dispo";
    if (e.zustand === "neu") e.zustand = "offen";
    if (patch.adresse) {
      e.bo = patch.adresse;
      if (adresseNeu) {
        this.log(e, `Adresse: ${patch.adresse.label}`);
        if (e.adressePruefen) this.adresseKorrigiert(e);
      }
    }
    if (patch.code) this.log(e, `Code: ${patch.code}`);
    if (patch.telefon) this.log(e, `Rückrufnummer: ${patch.telefon}`);
    this.emit();
  }

  /** Nach einer Adresskorrektur fahren die suchenden Fahrzeuge zur neuen Adresse. */
  private adresseKorrigiert(e: Einsatz): void {
    if (!e.adresse) return;
    const ok = distanceM(e.adresse, e.wahr) <= this.settings.verortungRadius;
    if (ok) e.adressePruefen = false;
    for (const id of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[id];
      if (!fz || (fz.phase !== "suche" && fz.phase !== "anfahrt")) continue;
      this.setStatus(fz, "zumBO");
      this.funk(fz.funkrufname, e.id, "Neue Adresse verstanden, fahren hin", "info");
      this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
    }
  }

  /** Rückruf beim Anrufer: liefert die tatsächliche Adresse. */
  rueckruf(id: string): string | null {
    const e = this.einsatz(id);
    if (!e) return null;
    if (this.settings.rueckrufNurMitNummer && !e.telefon) throw new Error("Keine Rückrufnummer aufgenommen – Rückruf nicht möglich");
    e.rueckrufGemacht = true;
    this.log(e, `Rückruf beim Anrufer: Adresse ${e.wahr.adresse}`);
    this.emit();
    return e.wahr.adresse;
  }

  /** Alarmiert Fahrzeuge. Gibt Hinweise zurück (z. B. NAH darf nicht fliegen). */
  alarmiere(id: string, fahrzeugIds: string[]): string[] {
    const e = this.einsatz(id);
    const hinweise: string[] = [];
    if (!e) return ["Einsatz nicht gefunden"];
    if (!e.adresse) return ["Bitte zuerst eine Adresse eingeben"];
    if (fahrzeugIds.length) this.abfrageProtokoll(e);
    for (const fid of fahrzeugIds) {
      const fz = this.state.fahrzeuge[fid];
      if (!fz) continue;
      const abziehen = this.ktAbziehbar(fz);
      if (!this.verfuegbar(fz) && !abziehen) {
        hinweise.push(`${fz.funkrufname} ist nicht verfügbar`);
        continue;
      }
      const hindernis = this.flugHindernis(fz);
      if (hindernis) {
        hinweise.push(`${fz.funkrufname}: ${hindernis}`);
        this.funk(fz.funkrufname, e.id, hindernis, "warnung");
        continue;
      }
      // Vorgemerkte Krankentransporte gehen zurück in „nicht disponiert“
      if (fz.kt && !fz.kt.aktiv) this.ktPlanLoesen(fz, `${fz.funkrufname} für Notfall ${e.nummer} alarmiert`);
      // Fahrzeug fährt KT ohne Patient: wird abgezogen, die Transporte sind wieder offen
      if (abziehen) {
        this.ktPlanLoesen(fz, `${fz.funkrufname} für Notfall ${e.nummer} abgezogen`, false);
        this.funk(fz.funkrufname, e.id, "Krankentransport abgebrochen – übernehmen Notfall", "info");
      }
      fz.einsatzId = e.id;
      if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id);
      const sek = this.ausrueckSek(fz, false);
      const aufWache = fz.status === "freiWache" || fz.status === "bereitschaft";
      fz.quittUm = null;
      this.setStatus(fz, aufWache ? "alarmWache" : "alarmFunk");
      fz.fahrt = null;
      fz.phase = "ausruecken";
      fz.phaseEnde = this.state.zeit + sek * 1000;
      this.log(e, `${fz.funkrufname} alarmiert`);
      // Fahrzeug von außerhalb der Funkgruppe: wechselt für den Einsatz auf unsere Gruppe
      const fg = this.funkgruppe();
      if (!inFunkgruppe(fg, fz.heim.lat, fz.heim.lon)) {
        this.log(e, `${fz.funkrufname} wechselt auf TETRA ${fg.id}`);
        this.funk(fz.funkrufname, e.id, `wechselt auf TETRA ${fg.id}`, "info");
      }
    }
    if (e.fahrzeuge.length > 0) e.zustand = "laufend";
    this.emit();
    return hinweise;
  }

  /** Tagsüber laut Einstellung (Standard 5–22 Uhr)? */
  istTag(t = this.state.zeit): boolean {
    const a = this.settings.ausrueck;
    const h = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    return a.tagVon <= a.tagBis ? h >= a.tagVon && h < a.tagBis : h >= a.tagVon || h < a.tagBis;
  }

  /**
   * Ausrückzeit in Sekunden: auf der Wache nach Tag/Nacht und Fahrzeugart (zufällig im Bereich,
   * bei schaetzung der Mittelwert), frei unterwegs wenige Sekunden, Bereitschaft + Zuschlag.
   */
  ausrueckSek(fz: SimFahrzeug, schaetzung: boolean): number {
    const a = this.settings.ausrueck;
    const z = (r: [number, number]) => (schaetzung ? (r[0] + r[1]) / 2 : rnd(r[0], r[1]));
    const wache = () => {
      const tag = this.istTag();
      if (fliegt(fz)) return z(tag ? a.nahTag : a.nahNacht);
      return z(tag ? a.bodenTag : a.bodenNacht);
    };
    if (fz.status === "freiWache") return wache();
    if (fz.status === "bereitschaft") return wache() + a.bereitschaftPlusMin * 60;
    return schaetzung ? a.unterwegs : a.unterwegs * rnd(0.7, 1.5);
  }

  /** Disponent bucht ein Krankenhaus. */
  bucheKh(id: string, hospitalId: string, grund: HospitalFlag): void {
    const e = this.einsatz(id);
    const h = store.get("hospitals", hospitalId);
    if (!e || !h) return;
    e.kh = { hospitalId, grund, durch: "dispo", zeit: this.state.zeit };
    e.zo = { lat: h.lat, lon: h.lon, label: h.name };
    e.khAnfrage = null;
    this.log(e, `KH gebucht durch Leitstelle: ${h.name} (${HOSPITAL_FLAG_LABEL[grund]})`);
    // RTW wartet schon? Dann losfahren
    this.startTransport(e);
    this.emit();
  }

  /** Fahrzeug manuell aus dem Einsatz entlassen. */
  entlasse(fahrzeugId: string): void {
    const fz = this.state.fahrzeuge[fahrzeugId];
    if (!fz || !fz.einsatzId) return;
    const e = this.einsatz(fz.einsatzId);
    if (e) this.log(e, `${fz.funkrufname} durch Leitstelle freigegeben`);
    this.freigeben(fz);
    this.emit();
  }

  /** Einsatz ohne Fahrzeuge schließen (z. B. Telemedizin, Fehlalarm). */
  schliesse(id: string, grund: string): void {
    const e = this.einsatz(id);
    if (!e) return;
    for (const fid of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[fid];
      if (fz?.einsatzId === e.id) this.freigeben(fz);
    }
    e.zustand = "abgeschlossen";
    e.khAnfrage = null;
    e.bearbeiter = null;
    this.log(e, `Einsatz geschlossen: ${grund}`);
    this.emit();
  }

  /** Fahrzeuge mit Fahrzeit zum Einsatzort, sortiert. */
  async vorschlaege(id: string): Promise<Vorschlag[]> {
    const e = this.einsatz(id);
    if (!e?.adresse) return [];
    const ziel = e.adresse;
    const frei = Object.values(this.state.fahrzeuge).filter((f) => this.verfuegbar(f) || this.ktAbziehbar(f));
    const boden = frei.filter((f) => !fliegt(f));
    const zeiten = await travelTimes(ziel, boden.map((f) => ({ lat: f.lat, lon: f.lon })));
    const faktor = this.faktor(e);
    const out = boden.map((fz, i) => {
      const z = zeiten[i];
      const ausr = this.ausrueckSek(fz, true);
      // KT-Fahrzeug ohne Patient: nur auf ausdrückliche Wahl (nicht in der Empfehlung)
      return { fz, sekunden: z === null ? null : z * faktor + ausr, hinweis: null as string | null, kt: !!fz.kt?.aktiv };
    });
    for (const fz of frei.filter((f) => fliegt(f))) {
      const flug = distanceM(fz, ziel) / (this.settings.nahGeschwindigkeit / 3.6) + this.ausrueckSek(fz, true) + 90;
      out.push({ fz, sekunden: flug, hinweis: this.flugHindernis(fz), kt: !!fz.kt?.aktiv });
    }
    return out.sort((a, b) => (a.sekunden ?? 1e9) - (b.sekunden ?? 1e9));
  }

  /**
   * Einsatzmittelvorschlag nach Stufe:
   * - Rettungsmittel nach Rangfolge; jeder Rang schlechter darf die Toleranz kürzer brauchen
   *   (Punktzahl = Fahrzeit + Rang × Toleranz)
   * - NFS erforderlich: RM ohne NFS bekommt + Toleranz und zusätzlich ein NEF (NAH, wenn kein NEF)
   * - Notarzt „nef“: NEF, NAH nur wenn mehr als die Toleranz schneller; „schnellster“: NEF oder NAH
   * Bereits alarmierte Fahrzeuge werden berücksichtigt.
   */
  /** ids = vorausgewählt; oben = nur oben in der Liste zeigen (z. B. EL ÖBB, selbst alarmieren) */
  empfehlung(id: string, liste: Vorschlag[]): { ids: string[]; gruende: string[]; oben?: string[] } {
    const e = this.einsatz(id);
    const stufe = e ? this.stufeVon(e) : undefined;
    if (!e) return { ids: [], gruende: [] };
    if (!stufe) {
      // ohne Code: nur offene Nachforderungen (BIT)
      const ids: string[] = [];
      const gruende: string[] = [];
      this.bitEmpfehlung(e, liste.filter((v) => v.sekunden !== null && !v.hinweis && !v.kt), ids, gruende);
      return { ids, gruende };
    }
    const tol = this.settings.toleranzMin * 60;
    const ids: string[] = [];
    const oben: string[] = [];
    const gruende: string[] = [];
    const min = (s: number) => `${Math.round(s / 60)} min`;
    const nutzbar = liste.filter((v) => v.sekunden !== null && !v.hinweis && !v.kt);

    const imEinsatz = e.fahrzeuge.map((fid) => this.state.fahrzeuge[fid]).filter((f) => f && f.einsatzId === e.id);
    let rm: SimFahrzeug | undefined = imEinsatz.find((f) => this.transportfaehig(f));
    let arzt: SimFahrzeug | undefined = imEinsatz.find((f) => this.mitNotarzt(f));

    const rangListe = raenge(stufe);
    if (!rm && rangListe.length) {
      let best: { v: Vorschlag; punkte: number; rang: number } | null = null;
      for (const v of nutzbar) {
        const r = rangListe.findIndex((g) => g.includes(v.fz.rmTyp));
        if (r < 0) continue;
        let punkte = v.sekunden! + r * tol;
        if (stufe.nfsErforderlich && !hatNFS(v.fz.besetzung)) punkte += tol;
        if (!best || punkte < best.punkte) best = { v, punkte, rang: r };
      }
      if (best) {
        rm = best.v.fz;
        ids.push(rm.id);
        const text = `${rm.funkrufname} (${rm.rmTyp}, ${min(best.v.sekunden!)})`;
        gruende.push(best.rang === 0 ? `${text}: passendes Rettungsmittel` : `${text}: besser passende sind deutlich weiter weg`);
      } else {
        // Kein Primärfahrzeug: Sekundärfahrzeug, das mindestens gleichwertig ausgestattet ist
        const typen = rangListe.flat();
        // BIT und ITH nur über Nachforderung bzw. von Hand
        const erlaubt = typen.includes("RTW-C") ? ["SNAW", "SRTW"] : typen.includes("RTW") ? ["SRTW", "SNAW"] : ["SKTW", "SRTW", "SNAW"];
        const sek = nutzbar.find((v) => erlaubt.includes(v.fz.rmTyp));
        if (sek) {
          rm = sek.fz;
          ids.push(rm.id);
          gruende.push(`${rm.funkrufname} (${rm.rmTyp}, ${min(sek.sekunden!)}): kein Primärfahrzeug verfügbar – Sekundärfahrzeug`);
        } else gruende.push(`Kein passendes Rettungsmittel (${stufe.rettungsmittel}) verfügbar`);
      }
    }

    if (!arzt && rm && this.mitNotarzt(rm)) arzt = rm;
    const nfsFehlt = stufe.nfsErforderlich && rm !== undefined && !hatNFS(rm.besetzung);
    const regel = stufe.notarzt !== "nein" ? stufe.notarzt : nfsFehlt ? "nef" : "nein";
    if (!arzt && regel !== "nein") {
      const nef = nutzbar.find((v) => v.fz.rmTyp === "NEF");
      const nah = nutzbar.find((v) => v.fz.rmTyp === "NAH") ?? (nef ? undefined : nutzbar.find((v) => v.fz.rmTyp === "ITH"));
      let wahl: Vorschlag | undefined;
      if (regel === "schnellster") wahl = [nef, nah].filter((x): x is Vorschlag => !!x).sort((a, b) => a.sekunden! - b.sekunden!)[0];
      else if (nef && nah) wahl = nah.sekunden! + tol < nef.sekunden! ? nah : nef;
      else wahl = nef ?? nah;
      if (wahl) {
        arzt = wahl.fz;
        ids.push(arzt.id);
        const grund = nfsFehlt && stufe.notarzt === "nein" ? "kein NFS am Rettungsmittel" : "Notarzt erforderlich";
        gruende.push(`${arzt.funkrufname} (${arzt.rmTyp}, ${min(wahl.sekunden!)}): ${grund}`);
      } else {
        gruende.push("Kein Notarztmittel (NEF/NAH) verfügbar");
      }
    }
    // BEL bei Großeinsätzen: mehrere Rettungsmittel oder Großaufgebot (Feuerwehr/Polizei)
    if (!imEinsatz.some((f) => f.rmTyp === "BEL")) {
      const transport = imEinsatz.filter((f) => this.transportfaehig(f)).length + (rm && !imEinsatz.includes(rm) ? 1 : 0);
      const offen = (e.nachforderungen ?? []).filter((n) => !n.erledigt && n.art === "RTW").reduce((a, n) => a + n.anzahl, 0);
      const kap = e.wahr.abfrage?.kapitel ?? "";
      const gross = stufe.kategorie === "kritisch" && ["29", "22", "7", "8", "34", "42"].includes(kap);
      if (transport + offen >= 3 || gross) {
        const bel = nutzbar.find((v) => v.fz.rmTyp === "BEL");
        if (bel) {
          ids.push(bel.fz.id);
          gruende.push(`${bel.fz.funkrufname} (BEL, ${min(bel.sekunden!)}): Großeinsatz – Einsatzleitung vor Ort`);
        }
      }
    }
    this.bitEmpfehlung(e, nutzbar, ids, gruende);
    // EL ÖBB bei Unfällen auf oder an Bahngleisen
    const bahnText = `${findCode(e.code ?? undefined)?.beschreibung ?? ""} ${e.wahr.abfrage?.lage ?? ""} ${e.infoRtw} ${e.infoIntern} ${e.adresse?.label ?? ""}`;
    if (/bahn|gleis|zug|schiene|öbb/i.test(bahnText) && !imEinsatz.some((f) => f.rmTyp === "EL ÖBB")) {
      // nur Hinweis – den Einsatzleiter der ÖBB schickt der Disponent selbst
      const el = nutzbar.find((v) => v.fz.rmTyp === "EL ÖBB");
      if (el) {
        oben.push(el.fz.id);
        gruende.push(`Hinweis: ${el.fz.funkrufname} (EL ÖBB, ${min(el.sekunden!)}) bei Unfall an Bahngleisen selbst dazu alarmieren`);
      }
    }
    return { ids, gruende, oben };
  }

  /** BIT nachgefordert (Patient zu schwer für die normale Trage): BIT vorschlagen */
  private bitEmpfehlung(e: Einsatz, nutzbar: Vorschlag[], ids: string[], gruende: string[]): void {
    const imEinsatz = this.einsatzFz(e);
    if (!(e.nachforderungen ?? []).some((n) => n.art === "BIT" && !n.erledigt) || imEinsatz.some((f) => f.rmTyp === "BIT")) return;
    const bit = nutzbar.find((v) => v.fz.rmTyp === "BIT");
    if (bit) {
      ids.push(bit.fz.id);
      gruende.push(`${bit.fz.funkrufname} (BIT, ${Math.round(bit.sekunden! / 60)} min): Nachforderung Schwerlasttransport`);
    } else gruende.push("Kein BIT verfügbar – die Besatzung transportiert nach Wartezeit selbst");
  }

  // ------------------------------------------------------------------ Generator

  private planGenerator(init = false): void {
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) {
      if (init || this.state.naechster[k] === 0) this.planNaechsten(k);
    }
  }

  private planNaechsten(k: Kategorie): void {
    const proStunde = this.settings.aufkommen[k];
    if (!proStunde || proStunde <= 0) {
      this.state.naechster[k] = Number.POSITIVE_INFINITY;
      return;
    }
    // Poisson-Prozess: exponentiell verteilte Abstände
    const minuten = (-Math.log(1 - Math.random()) * 60) / proStunde;
    this.state.naechster[k] = this.state.zeit + minuten * MIN;
  }

  /** Nach Änderung des Aufkommens neu planen. */
  neuPlanen(): void {
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) this.planNaechsten(k);
    this.emit();
  }

  /** Neue Notfälle nach dem Aufkommen der aktuellen Stunde (Einstellungen → Aufkommen) */
  private runGenerator(dt: number): void {
    if (!this.settings.generatorAktiv) return;
    const h = new Date(this.state.zeit).getHours();
    const proStunde = this.settings.stunden?.[h]?.rd ?? 6;
    const anteile = this.settings.aufkommen;
    const summe = (["stabil", "dringend", "kritisch"] as Kategorie[]).reduce((a, k) => a + Math.max(0, anteile[k] ?? 0), 0) || 1;
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) {
      const rate = (proStunde * Math.max(0, anteile[k] ?? 0)) / summe;
      if (Math.random() < (rate * dt) / 3_600_000) void this.generiere(k);
    }
  }

  /** Erzeugt sofort einen Einsatz (Kategorie zufällig, wenn nicht angegeben). */
  async generiere(k?: Kategorie): Promise<Einsatz | null> {
    const s = this.settings;
    if (!hasCodes()) return null;
    const schema = s.anrufe ? store.schema : null;
    if (s.generatorQuelle === "vorlagen") {
      const vorlagen = store.list("templates");
      if (vorlagen.length) {
        const v = pick(vorlagen);
        const code = findCode(v.code) ?? pick(allCodes());
        const fall = schema ? this.fallFuerCode(schema, code.code) : null;
        return this.erstelleEinsatz({
          lat: v.lat,
          lon: v.lon,
          adresse: v.adresse || "Adresse lt. Vorlage",
          code,
          meldung: v.meldung,
          patientAlter: v.patientAlter ?? (typeof fall?.antworten.alter === "number" ? fall.antworten.alter : null),
          transport: v.transport,
          fall,
        });
      }
    }
    const kat: Kategorie = k ?? pick(["stabil", "dringend", "dringend", "kritisch"] as Kategorie[]);
    const passt = (stufe: string) => {
      const st = this.stufeDef(stufe);
      return !!st && st.kategorie === kat && raenge(st).length > 0;
    };
    let code: Einsatzcode | undefined;
    let fall: Fall | null = null;
    if (schema) {
      // Fall aus dem Abfrageschema ziehen: Antworten und Code passen garantiert zusammen
      const temp = this.temperatur();
      const lage = lageVon(this.state.wetter.lage);
      const wetter = this.settings.wetterAktiv;
      const glatt = lage === "eisregen" || (temp < 1 && ["schnee", "regen", "nebel"].includes(lageArt(lage)));
      const ctx = { jahreszeit: jahreszeitVon(this.state.zeit, this.wetterOpt()), stunde: new Date(this.state.zeit).getHours(), temp: wetter ? temp : 15, glatt: wetter && glatt };
      for (let i = 0; i < 400 && !fall; i++) {
        const kap = kapitelZiehen(schema, wetter ? (kp) => wetterFaktor(kp, temp, lage, this.state.wetter.wind ?? 0) : undefined);
        // Fallgeschichte zuerst: sie legt Ort, Hergang und die wichtigsten Antworten fest
        const vorlage = vorlageWaehlen(SZENARIEN, kap, ctx, Math.random);
        const f = fallZiehen(schema, kap, Math.random, 0.04, vorlage ? vorlageFest(vorlage, Math.random) : {});
        const c = f ? findCode(f.ergebnis.code) : undefined;
        const name = `${c?.beschreibung ?? ""} ${c ? (schema.codes[c.code]?.name ?? "") : ""}`;
        if (
          f &&
          c &&
          passt(c.stufe) &&
          plausibel(f.ergebnis.pfad[0], f.antworten, name) &&
          (!wetter || passtZumWetter(f.ergebnis.pfad[0], f.antworten, name, temp, lage))
        ) {
          code = c;
          fall = { kapitel: f.ergebnis.pfad[0], antworten: f.antworten, code: c.code };
          if (vorlage) {
            fall.vorlage = vorlage.id;
            fall.ortArt = pick(vorlage.orte);
          }
        }
      }
    }
    if (!code) {
      const temp = this.temperatur();
      const lage = lageVon(this.state.wetter.lage);
      const codes = allCodes().filter(
        (c) => passt(c.stufe) && !/Aufwertung/i.test(c.beschreibung) && (!s.wetterAktiv || passtZumWetter("", {}, c.beschreibung, temp, lage)),
      );
      if (codes.length === 0) return null;
      code = pick(codes);
    }
    const adr = await this.adresseImGebiet();
    if (!adr) return null;
    let gemeldet = adr.label;
    // Manche Anrufer nennen eine falsche Adresse (andere Hausnummer derselben Straße)
    if (Math.random() * 100 < s.falscheAdresseProzent) {
      const andere = (await searchAddress(`${adr.street} ${adr.city}`, 40)).filter(
        (h) => !h.place && distanceM(h, adr) > s.verortungRadius * 1.5,
      );
      if (andere.length) gemeldet = pick(andere).label;
    }
    const alter = typeof fall?.antworten.alter === "number" ? fall.antworten.alter : null;
    // Notruf aus der Natur: Anrufer weiß nicht genau, wo er ist (Ortung nötig)
    const vorlage = fall?.vorlage ? SZENARIEN.find((v) => v.id === fall!.vorlage) : undefined;
    let draussen: string | null = null;
    if (vorlage) {
      // Geschichte im Freien (Wald, Feldweg, Landstraße): Ort nur grob bekannt
      if (vorlage.wo?.length && (fall!.ortArt === "natur" || (fall!.ortArt === "strasse" && Math.random() < 0.5))) {
        draussen = fuellen(pick(vorlage.wo), { w: fall!.antworten.geschlecht === "w", bezug: "", ort: adr.city || gemeindeVon(adr.label), name: "" }, Math.random);
      }
    } else if (fall) draussen = ortUnbekanntBeschreibung(fall.kapitel, adr.city || adr.label);
    if (fall && draussen) {
      const p = versetzt(adr.lat, adr.lon, rnd(400, 1800), rnd(0, 360));
      const e = this.erstelleEinsatz({ lat: p.lat, lon: p.lon, adresse: `Koordinate ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} (${draussen})`, code, gemeldeteAdresse: draussen, gemeinde: adr.city || gemeindeVon(adr.label), fall, patientAlter: alter });
      if (e.wahr.abfrage) e.wahr.abfrage.ortUnbekannt = true;
      return e;
    }
    return this.erstelleEinsatz({ lat: adr.lat, lon: adr.lon, adresse: adr.label, code, gemeldeteAdresse: gemeldet, fall, patientAlter: alter });
  }

  private fallFuerCode(schema: Schema, code: string): Fall | null {
    const kap = kapitelVonCode(schema, code);
    const a = wahrheitFuer(schema, code);
    return kap && a ? { kapitel: kap, antworten: a, code } : null;
  }

  // ------------------------------------------------------------------ Anrufe

  private anrufeTick(t: number): void {
    for (const e of this.state.einsaetze) {
      const a = e.anruf;
      if (!a || e.zustand === "abgeschlossen") continue;
      if (a.ortung?.status === "laeuft" && t >= a.ortung.fertigUm) this.ortungFertig(e);
      if (a.status === "gehalten" && t >= (a.haltenBis ?? t)) {
        a.status = "verpasst";
        a.seit = t;
        a.haltenBis = null;
        a.rueckrufUm = t + rnd(1, 2) * MIN;
        a.gespraech.push({ zeit: t, echt: Date.now(), von: "system", text: "Der Anrufer hat aufgelegt – zu lange in der Warteschleife" });
        this.log(e, "Anrufer hat in der Warteschleife aufgelegt");
        this.funk("Notruf", e.id, `Anrufer ${e.nummer} hat in der Warteschleife aufgelegt`, "warnung");
      } else if (a.status === "klingelt" && t >= a.klingelBis) {
        a.status = "verpasst";
        a.seit = t;
        a.rueckrufUm = t + rnd(2, 3) * MIN;
        this.log(e, `Anruf nicht angenommen – Anrufer hat aufgelegt (${a.versuche}. Versuch)`);
        this.funk("Notruf", e.id, `Verpasster Anruf ${e.nummer}`, "warnung");
      } else if (a.status === "verpasst" && a.rueckrufUm !== null && t >= a.rueckrufUm) {
        a.status = "klingelt";
        a.seit = t;
        a.versuche++;
        a.klingelBis = t + rnd(45, 75) * 1000;
        a.rueckrufUm = null;
        this.log(e, `Anrufer ruft erneut an (${a.versuche}. Versuch)`);
        this.funk("Notruf", e.id, `Erneuter Anruf ${e.nummer}`, "warnung");
      }
    }
  }

  private calltaker(): Bearbeiter {
    return this.actor ?? this.ich ?? { pid: "solo", name: "Leitstelle" };
  }

  private nurCalltaker(e: Einsatz): Anruf {
    const a = e.anruf;
    if (!a) throw new Error("Kein Anruf zu diesem Einsatz");
    const ich = this.calltaker();
    if (a.status === "klingelt" || a.status === "verpasst") throw new Error("Bitte zuerst den Anruf annehmen");
    if (a.angenommenVon && a.angenommenVon.pid !== ich.pid && this.mode !== "solo") {
      throw new Error(`Das Gespräch führt ${a.angenommenVon.name}`);
    }
    return a;
  }

  /** Anruf annehmen (klingelt), zurückrufen (verpasst) oder übernehmen (Gesprächsführer getrennt) */
  anrufAnnehmen(id: string): void {
    const e = this.einsatz(id);
    const a = e?.anruf;
    if (!e || !a) throw new Error("Kein Anruf zu diesem Einsatz");
    if (a.status === "verpasst" && this.settings.rueckrufNurMitNummer && !e.telefon) throw new Error("Keine Rückrufnummer aufgenommen – Rückruf nicht möglich");
    const ich = this.calltaker();
    if (a.status === "gehalten") {
      // Gehaltene Anrufe kann jeder Disponent aufgreifen
      const vorher = a.angenommenVon;
      this.andereHalten(ich, e.id);
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.haltenBis = null;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: vorher && vorher.pid !== ich.pid ? `${ich.name} übernimmt das Gespräch` : "Gespräch fortgesetzt" });
      if (a.folge) {
        a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "anrufer", text: a.folge });
        a.folge = null;
      }
      e.bearbeiter = { ...ich };
      this.emit();
      return;
    }
    if (a.status === "aktiv") {
      const fuehrer = a.angenommenVon;
      if (fuehrer && fuehrer.pid !== ich.pid && (this.istOnline?.(fuehrer.pid) ?? true)) {
        throw new Error(`Das Gespräch führt bereits ${fuehrer.name}`);
      }
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: `${ich.name} übernimmt das Gespräch` });
    } else if (a.status === "klingelt" || a.status === "verpasst") {
      this.andereHalten(ich, e.id);
      a.rueckruf = a.status === "verpasst";
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.rueckrufUm = null;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: a.rueckruf ? `Rückruf durch ${ich.name}` : `Anruf angenommen von ${ich.name}` });
      this.log(e, a.rueckruf ? "Leitstelle ruft zurück" : "Anruf angenommen");
      if (a.folge) {
        a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "anrufer", text: a.folge });
        a.folge = null;
      }
    } else {
      throw new Error("Das Gespräch ist bereits beendet");
    }
    e.bearbeiter = { ...ich };
    if (e.zustand === "neu") e.zustand = "offen";
    this.emit();
  }

  anrufNachricht(id: string, von: "leitstelle" | "anrufer", text: string, quelle?: "ki" | "fest"): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    const t = text.trim().slice(0, 1500);
    if (!t) return;
    a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von, text: t, wer: von === "leitstelle" ? this.calltaker().name : undefined, quelle });
    if (a.gespraech.length > 200) a.gespraech.splice(1, a.gespraech.length - 200);
    this.emit();
  }

  anrufBeenden(id: string): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    a.status = "beendet";
    a.seit = this.state.zeit;
    a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: "Gespräch beendet" });
    this.log(e, "Notrufgespräch beendet");
    this.abfrageProtokoll(e);
    this.emit();
  }

  /** Anrufer in die Warteschleife legen (er legt auf, wenn es zu lange dauert) */
  anrufHalten(id: string): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    if (a.status !== "aktiv") return;
    this.halten(a);
    this.log(e, "Anrufer wird gehalten");
    this.emit();
  }

  private halten(a: Anruf): void {
    a.status = "gehalten";
    a.seit = this.state.zeit;
    a.haltenBis = this.state.zeit + rnd(100, 160) * 1000;
    a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: "Anrufer wird gehalten" });
  }

  /** Wer einen Anruf annimmt, legt sein laufendes Gespräch in die Warteschleife */
  private andereHalten(ich: Bearbeiter, ausser: string): void {
    const meins = (a: Anruf | null | undefined) => a?.status === "aktiv" && (!a.angenommenVon || a.angenommenVon.pid === ich.pid || this.mode === "solo");
    for (const x of this.state.einsaetze) {
      if (x.id !== ausser && x.zustand !== "abgeschlossen" && meins(x.anruf)) {
        this.halten(x.anruf!);
        this.log(x, "Anrufer wird gehalten");
      }
    }
    for (const k of this.state.kt ?? []) if (k.id !== ausser && meins(k.anruf)) this.halten(k.anruf!);
  }

  /** Antwort in der Abfrage setzen (wert null = zurücknehmen); „kapitel“ wählt das Kapitel */
  abfrageSetze(id: string, frage: string, wert: string | number | null): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    if (frage === "kapitel") a.kapitel = wert === null ? null : String(wert);
    else if (wert === null) delete a.antworten[frage];
    else a.antworten[frage] = wert;
    this.abfrageAuswerten(e);
    this.emit();
  }

  abfrageExtra(id: string, extra: Partial<Anruf["extra"]>): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    a.extra = { ...a.extra, ...extra };
    this.abfrageAuswerten(e);
    this.emit();
  }

  /** Vorläufigen Code aus der Abfrage berechnen und in den Einsatz übernehmen */
  private abfrageAuswerten(e: Einsatz): void {
    const a = e.anruf;
    const schema = store.schema;
    if (a) this.infoAusAbfrage(e, a.antworten);
    if (!a || !schema || !a.kapitel) {
      if (a) a.ergebnis = null;
      return;
    }
    const erg = bestimmeCode(schema, a.kapitel, a.antworten, a.extra);
    a.ergebnis = erg ? { code: erg.code, reanimation: erg.reanimation } : null;
    // Nach der Erstaufnahme: ändert sich der Code, kommt die geänderte Abfrage ins Protokoll
    const st = e.abfrageStand;
    if (st && erg && erg.code !== st.code) this.abfrageProtokoll(e, true);
    // Selbst gewählter Code bleibt; die Abfrage zeigt ihren Vorschlag nur an
    if (e.codeQuelle === "dispo") return;
    if (erg && erg.code !== e.code && findCode(erg.code)) {
      const vorher = e.code;
      e.code = erg.code;
      e.codeQuelle = "abfrage";
      if (e.zustand === "neu") e.zustand = "offen";
      this.log(e, `${vorher ? "Code geändert" : "Code"} (Abfrage): ${erg.code}`);
    }
  }


  /** Ausgefüllte Abfrage als Text ins Protokoll: Erstaufnahme (beim Alarmieren oder Auflegen) bzw. Änderung */
  private abfrageProtokoll(e: Einsatz, aenderung = false): void {
    const a = e.anruf;
    const schema = store.schema;
    if (!a || !schema) return;
    if (!aenderung && e.abfrageStand) return;
    const alt = e.abfrageStand;
    let nur: Set<string> | undefined;
    if (aenderung && alt) {
      nur = new Set<string>();
      for (const id of new Set([...Object.keys(alt.antworten), ...Object.keys(a.antworten)])) {
        if (JSON.stringify(alt.antworten[id] ?? null) !== JSON.stringify(a.antworten[id] ?? null)) nur.add(id);
      }
    }
    const saetze = abfrageSaetze(schema, a.kapitel, a.antworten, nur);
    const code = a.ergebnis?.code ?? null;
    if (!saetze.length && !aenderung && !a.kapitel) return;
    const K = a.kapitel ? schema.kapitel[a.kapitel] : undefined;
    const kopf: string[] = [];
    if (aenderung && alt && alt.kapitel !== a.kapitel && K) kopf.push(`Neue Hauptbeschwerde: ${a.kapitel} ${K.titel}`);
    else if (!aenderung && K) kopf.push(`Hauptbeschwerde: ${a.kapitel} ${K.titel}`);
    if (code) kopf.push(`${aenderung && alt?.code ? `Code geändert: ${alt.code} → ` : "Code: "}${code} ${schema.codes[code]?.name ?? ""}`.trim());
    this.log(e, abfrageBlock(aenderung ? "Änderung" : "Erstaufnahme", this.state.zeit, saetze, kopf));
    e.abfrageStand = { antworten: { ...a.antworten }, kapitel: a.kapitel, code };
  }

  /** „m 67J B~ A+“ aus der Abfrage vorne in die Info an den RTW schreiben, Freitext bleibt hinter „//“ */
  private infoAusAbfrage(e: Einsatz, a: Antworten): void {
    const teile: string[] = [];
    if (a.geschlecht === "m" || a.geschlecht === "w") teile.push(a.geschlecht);
    if (typeof a.alter === "number") teile.push(`${a.alter}J`);
    const b: Record<string, string> = { ja: "B+", getruebt: "B~", nein: "B-" };
    const at: Record<string, string> = { normal: "A+", abnorm: "A~", agonal: "A-", keine: "A-" };
    if (typeof a.bw === "string" && b[a.bw]) teile.push(b[a.bw]);
    if (typeof a.at === "string" && at[a.at]) teile.push(at[a.at]);
    const neu = teile.join(" ");
    const alt = e.infoAuto ?? "";
    if (neu === alt) return;
    const frei = infoFreitext(e.infoRtw, alt);
    e.infoAuto = neu;
    e.infoRtw = neu && frei ? `${neu} // ${frei}` : neu || frei;
  }

  /** Den Code aus der Abfrage übernehmen (nachdem der Disponent selbst einen gewählt hatte) */
  abfrageCode(id: string): void {
    const e = this.einsatz(id);
    if (!e?.anruf) return;
    e.codeQuelle = "abfrage";
    this.abfrageAuswerten(e);
    this.emit();
  }

  // ------------------------------------------------------------------ Lage (Verlauf)

  /** Geplante Veränderungen eintreten lassen und melden (Anrufer bzw. Besatzung) */
  private lageTick(t: number): void {
    for (const e of this.state.einsaetze) {
      if (e.lageGeplant && t >= e.lageGeplant.um && e.zustand !== "abgeschlossen") this.lageMeldungJetzt(e);
      const l = e.wahr.lage;
      if (!l || e.zustand === "abgeschlossen") continue;
      for (const ev of l.ereignisse) {
        if (ev.eingetreten || t < ev.um) continue;
        ev.eingetreten = true;
        const p = l.patienten[ev.patient - 1];
        if (!p) continue;
        p.bw = ev.bw;
        p.at = ev.at;
        p.sichtung = ev.art === "verschlechterung" ? "rot" : p.sichtung === "rot" ? "gelb" : p.sichtung;
        l.verlauf.push({ zeit: t, text: `${ev.art === "verschlechterung" ? "Verschlechterung" : "Besserung"}: ${patientText(p)}` });
        this.lageMelden(e, ev.art === "besserung", t);
      }
    }
  }

  private lageMelden(e: Einsatz, besserung: boolean, t: number): void {
    const l = e.wahr.lage!;
    const p0 = l.patienten[0];
    if (l.aufgedeckt) {
      // Besatzung vor Ort meldet sich
      const fz = e.fahrzeuge.map((id) => this.state.fahrzeuge[id]).find((f) => f && f.einsatzId === e.id && f.phase === "vorOrt");
      if (!fz) return;
      const text = besserung
        ? `Patient hat sich gebessert, ${patientText(p0).replace(/ \(.*\)$/, "")}`
        : istStillstand(p0)
          ? "Patient jetzt reanimationspflichtig, Reanimation läuft"
          : `Patient verschlechtert sich, ${patientText(p0).replace(/ \(.*\)$/, "")}`;
      const fehlt = this.fehlendeKraefte(e);
      this.nachfordern(e, fz, fehlt);
      const zusatz = fehlt.na ? ", benötigen Notarzt" : "";
      this.fzRuft(this.sprecher(e, fz), e, fehlt.na ? "nachforderung" : "lage", `${text}${zusatz}`);
      if (istStillstand(p0) && fz.phaseEnde !== null) fz.phaseEnde = Math.max(fz.phaseEnde, t + rnd(30, 40) * MIN);
      return;
    }
    // Vor dem Eintreffen weiß es nur der Anrufer
    const w = e.wahr.abfrage;
    const a = e.anruf;
    if (!w || !a) return;
    const text = veraenderungText(w.anrufer, p0.geschlecht === "w", p0, besserung, a.status === "beendet");
    if (!text) {
      if (a.status === "aktiv" && w.anrufer.selbst) {
        a.gespraech.push({ zeit: t, echt: Date.now(), von: "system", text: "Der Anrufer antwortet nicht mehr – man hört nur noch Geräusche." });
      }
      return;
    }
    // Was der Anrufer jetzt weiß (für die KI und die Abfrage-Antworten)
    w.antworten = { ...w.antworten, bw: p0.bw, at: p0.at };
    if (a.status === "aktiv") {
      a.gespraech.push({ zeit: t, echt: Date.now(), von: "anrufer", text });
      this.log(e, "Anrufer meldet eine Veränderung");
    } else if (a.status === "gehalten") {
      a.folge = text;
    } else if (a.status === "beendet") {
      a.status = "klingelt";
      a.seit = t;
      a.klingelBis = t + rnd(45, 75) * 1000;
      a.rueckruf = false;
      a.folge = text;
      a.gespraech.push({ zeit: t, echt: Date.now(), von: "system", text: "Folgeanruf" });
      this.log(e, "Folgeanruf vom Anrufer");
      this.funk("Notruf", e.id, `Folgeanruf ${e.nummer}`, "warnung");
    }
  }

  /**
   * Fahrzeug trifft ein: das erste Fahrzeug sieht die Lage. Die Lagemeldung kommt erst nach ein paar
   * Minuten (Patient angeschaut), beim Verkehrsunfall nach etwa einer Minute; Reanimation sofort.
   */
  private eintreffenLage(fz: SimFahrzeug, e: Einsatz): void {
    const l = e.wahr.lage;
    const angefordert = !!fz.lagemeldungAngefordert;
    fz.lagemeldungAngefordert = false;
    const t = this.state.zeit;
    const kap = e.wahr.abfrage?.kapitel ?? "";
    const erstes = !!l && !l.aufgedeckt;
    if (l) {
      l.aufgedeckt = true;
      if (erstes) l.verlauf.push({ zeit: t, text: `${fz.funkrufname} als erstes Fahrzeug vor Ort` });
    }
    // fehlende Partner: Eigenschutz bei Gewalt – die Besatzung wartet und meldet sich gleich
    const fehlen = this.partnerFehlt(e);
    if (erstes && fehlen.some((x) => x.art === "pol" && /Gewalt|Schuss|aggressiv/.test(x.grund))) {
      this.log(e, `${fz.funkrufname} wartet zum Eigenschutz in sicherem Abstand auf die Polizei`);
      this.fzRuft(this.sprecher(e, fz), e, "nachforderung", "vor Ort, warten zum Eigenschutz in sicherem Abstand, benötigen Polizei");
      e.partnerErinnert = t;
    }
    if (!erstes && !angefordert) return;
    const sofort = !!l && istStillstand(l.patienten[0]);
    const vu = kap === "29" || kap === "34";
    const um = sofort ? t : t + (vu ? rnd(0.8, 1.3) : rnd(2, 5)) * MIN;
    e.lageGeplant = { um, fzId: fz.id, angefordert, erstes };
    if (sofort) this.lageMeldungJetzt(e);
  }

  /** Geplante Lagemeldung senden (aus lageTick oder sofort) */
  private lageMeldungJetzt(e: Einsatz): void {
    const plan = e.lageGeplant;
    e.lageGeplant = null;
    if (!plan) return;
    const fz = this.state.fahrzeuge[plan.fzId];
    if (!fz || fz.einsatzId !== e.id) return;
    const l = e.wahr.lage;
    if (!l) {
      if (plan.angefordert) this.fzRuft(fz, e, "lage", "vor Ort, Lage entspricht der Meldung");
      return;
    }
    const kap = e.wahr.abfrage?.kapitel ?? "";
    const ant = e.wahr.abfrage?.antworten ?? {};
    const angenommenRea = ant.at === "keine" || ant.at === "agonal";
    const p0 = l.patienten[0];
    const fehlt = this.fehlendeKraefte(e);
    // NEF/NAH unterwegs, aber kein Notarzt nötig → Storno empfehlen (nur das erste transportfähige Fahrzeug)
    const naUnterwegs = this.einsatzFz(e).some((x) => (x.kategorie === "NEF" || fliegt(x)) && x.phase !== "vorOrt");
    const naStorno = plan.erstes && this.transportfaehig(fz) && naUnterwegs && bedarf(l).na === 0;
    const partner = this.partnerFehlt(e);
    const abweichung = l.irrtum !== null || angenommenRea !== istStillstand(p0) || l.patienten.length > 1 || ["29", "34", "22", "7", "8"].includes(kap);
    if ((plan.erstes && (abweichung || fehlt.na > 0 || fehlt.rtw > 0 || fehlt.bit > 0 || naStorno || partner.length > 0)) || plan.angefordert) {
      let text = lagemeldungText(l, kap, fehlt, naStorno);
      const da = (Object.keys(e.partner ?? {}) as PartnerArt[]).map((a) => PARTNER[a].name);
      if (da.length) text += `, ${da.join(" und ")} vor Ort`;
      if (partner.length) {
        text += `, benötigen ${partner.map((x) => `${PARTNER[x.art].name} (${x.grund})`).join(" und ")}`;
        e.partnerErinnert = this.state.zeit;
      }
      this.nachfordern(e, fz, fehlt);
      const art: FunkAnliegen = fehlt.na || fehlt.rtw || fehlt.bit || partner.length ? "nachforderung" : naStorno ? "storno" : "lage";
      this.fzRuft(this.sprecher(e, fz), e, art, `Lagemeldung: ${text}`);
      l.verlauf.push({ zeit: this.state.zeit, text: `${fz.funkrufname}: ${text}` });
    }
  }

  /** Partner, die laut Lage gebraucht werden, aber noch nicht angefordert sind */
  partnerFehlt(e: Einsatz): { art: PartnerArt; grund: string }[] {
    const w = e.wahr.abfrage;
    const name = `${findCode(e.wahr.code)?.beschreibung ?? ""} ${store.schema?.codes[w?.code ?? e.wahr.code]?.name ?? ""}`;
    return partnerNoetig(w?.kapitel, w?.antworten ?? {}, name).filter((x) => !e.partner?.[x.art]);
  }

  /** Partner-Organisation anfordern: ist sofort vor Ort */
  partnerAnfordern(id: string, art: PartnerArt): void {
    const e = this.einsatz(id);
    if (!e) return;
    e.partner ??= {};
    if (e.partner[art]) return;
    const t = this.state.zeit;
    e.partner[art] = t;
    this.log(e, `${PARTNER[art].name} angefordert – vor Ort`);
    this.funk(PARTNER[art].name, e.id, `${PARTNER[art].name} vor Ort (${e.nummer})`, "info");
    // wartende Besatzungen können jetzt arbeiten
    if (!this.partnerFehlt(e).length) {
      for (const fz of this.einsatzFz(e)) if (fz.phase === "vorOrt" && fz.phaseEnde !== null && fz.phaseEnde < t + 5 * MIN) fz.phaseEnde = t + rnd(5, 10) * MIN;
    }
    this.emit();
  }

  /** Fahrzeuge, die gerade für den Einsatz unterwegs oder vor Ort sind */
  private einsatzFz(e: Einsatz): SimFahrzeug[] {
    return e.fahrzeuge.map((id) => this.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && x.einsatzId === e.id);
  }

  /** Wie viele Notärzte / transportfähige Fahrzeuge fehlen laut Lage? */
  fehlendeKraefte(e: Einsatz): { na: number; rtw: number; bit: number } {
    const l = e.wahr.lage;
    if (!l) return { na: 0, rtw: 0, bit: 0 };
    const b = bedarf(l);
    const fz = this.einsatzFz(e);
    const na = fz.filter((x) => this.mitNotarzt(x)).length;
    const tr = fz.filter((x) => this.transportfaehig(x)).length;
    const bit = l.bit && !e.bitVerzicht && !fz.some((x) => x.rmTyp === "BIT") ? 1 : 0;
    return { na: Math.max(0, b.na - na), rtw: Math.max(0, b.transport - tr), bit };
  }

  private nachfordern(e: Einsatz, fz: SimFahrzeug, fehlt: { na: number; rtw: number; bit: number }): void {
    e.nachforderungen ??= [];
    const t = this.state.zeit;
    for (const art of ["NA", "RTW", "BIT"] as const) {
      const n = art === "NA" ? fehlt.na : art === "RTW" ? fehlt.rtw : fehlt.bit;
      if (n <= 0) continue;
      const offen = e.nachforderungen.find((x) => x.art === art && !x.erledigt);
      if (offen) offen.anzahl = Math.max(offen.anzahl, n);
      else e.nachforderungen.push({ art, anzahl: n, seit: t, von: fz.funkrufname, erinnert: t, erledigt: false });
      this.log(e, `${fz.funkrufname} fordert nach: ${n}× ${NF_NAME[art]}`);
    }
  }

  // ------------------------------------------------------------------ Funk

  private neuesGespraech(fz: SimFahrzeug, e: Einsatz | null, status: FunkGespraech["status"]): FunkGespraech {
    this.state.funkGespraeche ??= [];
    const g: FunkGespraech = {
      id: (this.state.funkGZaehler = (this.state.funkGZaehler ?? 0) + 1),
      fzId: fz.id,
      funkname: fz.funkrufname,
      einsatzId: e?.id ?? null,
      status,
      seit: this.state.zeit,
      naechster: null,
      rufe: 0,
      anliegen: null,
      fuehrer: null,
      sprueche: [],
    };
    this.state.funkGespraeche.unshift(g);
    if (this.state.funkGespraeche.length > 150) this.state.funkGespraeche.length = 150;
    return g;
  }

  private spruch(g: FunkGespraech, von: string, text: string, wer?: string): void {
    g.sprueche.push({ zeit: this.state.zeit, von, text, wer });
    // Inhaltliche Funksprüche stehen auch im Einsatzprotokoll (nicht das reine Rufen)
    const e = g.einsatzId ? this.einsatz(g.einsatzId) : undefined;
    if (e && text && !/^(LEO von \S+ kommen|Hier \S+ kommen|\S+ von LEO kommen|Hier LEO kommen|Hier LEO,? verstanden,? ENDE|Hier LEO ENDE)$/i.test(text.trim()))
      this.log(e, `📻 ${von}: ${text}`);
  }

  /** Fahrzeug ruft LEO („LEO von 75/001 kommen“) und wartet auf Antwort */
  fzRuft(fz: SimFahrzeug, e: Einsatz | null, art: FunkAnliegen, text: string): void {
    const offen = this.state.funkGespraeche?.find((g) => g.fzId === fz.id && g.status !== "ende");
    if (offen && offen.status === "offen") {
      // schon verbunden: gleich durchgeben
      this.spruch(offen, fz.funkrufname, `${text}, kommen`);
      offen.anliegen = { art, text };
      return;
    }
    if (offen && offen.status === "ruft" && offen.anliegen) {
      offen.anliegen.text += `; ${text}`;
      if (art === "nachforderung") offen.dringend = true;
      return;
    }
    const g = offen ?? this.neuesGespraech(fz, e, "ruft");
    g.status = "ruft";
    g.anliegen = { art, text };
    g.dringend = art === "nachforderung" || /Reanimation|reanimationspflichtig|verschlechtert|Eigenschutz|Defekt/i.test(text);
    g.rufe = 1;
    g.naechster = this.state.zeit + rnd(50, 70) * 1000;
    this.spruch(g, fz.funkrufname, `LEO von ${fz.funkrufname} kommen`);
    if (e) this.log(e, `${fz.funkrufname} ruft LEO`);
  }

  private funkTick(t: number): void {
    for (const fz of Object.values(this.state.fahrzeuge)) {
      const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
      // Zwischenmeldung bei langer Versorgung
      if (e && fz.phase === "vorOrt" && fz.vorOrtSeit && !fz.zwischenGemeldet && t - fz.vorOrtSeit > 20 * MIN && fz.phaseEnde && fz.phaseEnde - t > 5 * MIN && this.transportfaehig(fz)) {
        fz.zwischenGemeldet = true;
        this.fzRuft(fz, e, "info", `Zwischenmeldung: Versorgung dauert noch an, voraussichtlich ${Math.round((fz.phaseEnde - t) / MIN)} Minuten`);
      }
      // Transport: Ankündigung mit Voranmeldung (kritisch immer, sonst manchmal)
      if (e && fz.phase === "transport" && !fz.transportGemeldet && fz.phaseEnde && this.transportfaehig(fz)) {
        fz.transportGemeldet = true;
        const krit = this.kritisch(e);
        if (krit || Math.random() < 0.3) {
          const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
          const min = Math.max(1, Math.round((fz.phaseEnde - t) / MIN));
          const p0 = e.wahr.lage?.patienten[0];
          const vor = krit ? `, Voranmeldung ${e.kh?.grund === "schockraum" || /Schockraum/i.test(HOSPITAL_FLAG_LABEL[e.kh?.grund ?? e.wahr.abteilung] ?? "") ? "Schockraum" : "Notaufnahme"}${p0 ? `: ${patientText(p0).replace(/ \(.*\)$/, "")}` : ""}` : "";
          this.fzRuft(fz, e, "info", `Patient übernommen, Transport ${h ? `ins ${h.kurzname || h.name}` : "ins Krankenhaus"}, Eintreffen in ca. ${min} Minuten${vor}`);
        }
      }
      // nach einem Defekt wieder einsatzbereit
      if (fz.defektBis && t >= fz.defektBis) {
        fz.defektBis = null;
        if (fz.status === "abgemeldet") {
          this.setStatus(fz, fz.phase === "frei" ? "freiWache" : "freiFunk");
          this.funk(fz.funkrufname, null, "Defekt behoben, wieder einsatzbereit", "info");
        }
      }
    }
    for (const g of this.state.funkGespraeche ?? []) {
      if (g.status === "ruft" && g.naechster !== null && t >= g.naechster) {
        g.rufe++;
        g.naechster = t + rnd(60, 90) * 1000;
        this.spruch(g, g.funkname, `LEO von ${g.funkname} kommen`);
      } else if (g.status === "leoRuft" && g.naechster !== null && t >= g.naechster) {
        g.status = "offen";
        g.naechster = null;
        this.spruch(g, g.funkname, `Hier ${g.funkname} kommen`);
      }
    }
    // Nachforderungen: erledigt, sobald genug alarmiert ist; sonst nach 5 Minuten erinnern
    for (const e of this.state.einsaetze) {
      if (!e.nachforderungen?.length || e.zustand === "abgeschlossen") continue;
      const fehlt = this.fehlendeKraefte(e);
      for (const n of e.nachforderungen) {
        if (n.erledigt) continue;
        if ((n.art === "NA" ? fehlt.na : n.art === "RTW" ? fehlt.rtw : fehlt.bit) === 0) {
          n.erledigt = true;
          this.log(e, `Nachforderung ${NF_NAME[n.art]} erledigt`);
        } else if (t - n.erinnert > 5 * MIN) {
          n.erinnert = t;
          const fz = this.einsatzFz(e).find((x) => x.funkrufname === n.von) ?? this.einsatzFz(e)[0];
          if (fz) this.fzRuft(fz, e, "nachforderung", `Nachforderung ${n.art === "RTW" ? `${n.anzahl}× Rettungsmittel` : NF_NAME[n.art]} noch offen, wann können wir damit rechnen`);
        }
      }
    }
  }

  private gespraech(id: number): FunkGespraech {
    const g = this.state.funkGespraeche?.find((x) => x.id === id);
    if (!g) throw new Error("Funkgespräch nicht gefunden");
    return g;
  }

  private nurFunkfuehrer(g: FunkGespraech): void {
    const ich = this.calltaker();
    if (this.mode !== "solo" && g.fuehrer && g.fuehrer.pid !== ich.pid && (this.istOnline?.(g.fuehrer.pid) ?? true)) {
      throw new Error(`Den Funk mit ${g.funkname} führt ${g.fuehrer.name}`);
    }
    g.fuehrer = { ...ich };
  }

  /** LEO antwortet auf einen Ruf; das Fahrzeug gibt sein Anliegen durch */
  funkAntworten(id: number): void {
    const g = this.gespraech(id);
    if (g.status !== "ruft") return;
    this.nurFunkfuehrer(g);
    this.spruch(g, "LEO", "Hier LEO kommen", this.calltaker().name);
    g.status = "offen";
    g.naechster = null;
    if (g.anliegen) this.spruch(g, g.funkname, `Hier ${g.funkname}, ${g.anliegen.text}, kommen`);
    this.emit();
  }

  /** LEO ruft ein Fahrzeug („75/001 von LEO kommen“) */
  /** LEO ruft ein Fahrzeug; text = eigener Anruf (z. B. gesprochen „75/001 von LEO, kommen“) */
  funkRufen(fzId: string, text?: string): number {
    const fz = this.state.fahrzeuge[fzId];
    if (!fz) throw new Error("Fahrzeug nicht gefunden");
    const offen = this.state.funkGespraeche?.find((g) => g.fzId === fz.id && g.status !== "ende");
    if (offen) {
      if (offen.status === "ruft") this.funkAntworten(offen.id);
      return offen.id;
    }
    const e = fz.einsatzId ? (this.einsatz(fz.einsatzId) ?? null) : null;
    const g = this.neuesGespraech(fz, e, "leoRuft");
    g.fuehrer = { ...this.calltaker() };
    this.spruch(g, "LEO", text?.trim().slice(0, 300) || `${fz.funkrufname} von LEO kommen`, g.fuehrer.name);
    g.naechster = this.state.zeit + rnd(3, 9) * 1000;
    this.emit();
    return g.id;
  }

  /** LEO spricht im offenen Gespräch; bekannte Anliegen beantwortet die Besatzung sofort */
  funkSenden(id: number, text: string): void {
    const g = this.gespraech(id);
    const t = text.trim().slice(0, 500);
    if (!t) return;
    if (g.status === "ende") throw new Error("Das Funkgespräch ist beendet");
    if (g.status !== "offen") throw new Error("Das Fahrzeug hat sich noch nicht gemeldet");
    this.nurFunkfuehrer(g);
    this.spruch(g, "LEO", t, this.calltaker().name);
    const antwort = this.funkVerstehen(g, t);
    if (antwort) this.spruch(g, g.funkname, antwort);
    else if (antwort === null) g.wartetAufKi = true;
    this.emit();
  }

  /** Antwort der Besatzung auf eine freie Frage (kommt von der KI bzw. dem Rückfalltext) */
  funkFzAntwort(id: number, text: string): void {
    const g = this.gespraech(id);
    if (!g.wartetAufKi) return;
    g.wartetAufKi = false;
    this.spruch(g, g.funkname, text.trim().slice(0, 500));
    this.emit();
  }

  funkEnde(id: number): void {
    const g = this.gespraech(id);
    if (g.status === "ende") return;
    if (g.status === "ruft") throw new Error("Bitte zuerst antworten");
    this.nurFunkfuehrer(g);
    this.spruch(g, "LEO", "Hier LEO, verstanden, ENDE", this.calltaker().name);
    g.status = "ende";
    g.wartetAufKi = false;
    this.emit();
  }

  /** Storno an ein Fahrzeug (über Funk) – es rückt ein */
  storno(fzId: string): void {
    const fz = this.state.fahrzeuge[fzId];
    if (!fz?.einsatzId) return;
    const e = this.einsatz(fz.einsatzId) ?? null;
    const offen = this.state.funkGespraeche?.find((g) => g.fzId === fz.id && g.status !== "ende");
    const g = offen ?? this.neuesGespraech(fz, e, "offen");
    const wer = this.calltaker().name;
    if (!offen || offen.status !== "offen") {
      this.spruch(g, "LEO", `${fz.funkrufname} von LEO kommen`, wer);
      this.spruch(g, fz.funkrufname, `Hier ${fz.funkrufname} kommen`);
    }
    this.spruch(g, "LEO", `Hier LEO, Storno für euren Einsatz${e ? ` ${e.nummer}` : ""}, kommen`, wer);
    this.spruch(g, fz.funkrufname, `Hier ${fz.funkrufname}, Storno verstanden, rücken ein, kommen`);
    this.spruch(g, "LEO", "Hier LEO ENDE", wer);
    g.status = "ende";
    if (e) this.log(e, `Storno an ${fz.funkrufname}`);
    this.freigeben(fz);
    this.emit();
  }

  /** Bekannte Anliegen der Leitstelle erkennen und passend antworten (null = freie Frage) */
  private funkVerstehen(g: FunkGespraech, text: string): string | null {
    const fz = this.state.fahrzeuge[g.fzId];
    if (!fz) return null;
    const t = text.toLowerCase();
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    const hier = `Hier ${fz.funkrufname}`;
    const vorOrt = fz.phase === "vorOrt" || fz.phase === "warteKH" || fz.phase === "suche";
    if (/\bende\b/.test(t) && t.length < 30) {
      g.status = "ende";
      return "";
    }
    if (/lagemeldung/.test(t)) {
      if (vorOrt && e) {
        const l = e.wahr.lage;
        const fehlt = this.fehlendeKraefte(e);
        if (l) this.nachfordern(e, fz, fehlt);
        return `${hier}, Lagemeldung: ${l ? lagemeldungText(l, e.wahr.abfrage?.kapitel ?? "", fehlt, false) : "Lage entspricht der Meldung"}, kommen`;
      }
      fz.lagemeldungAngefordert = true;
      return `${hier}, so verstanden, wir geben eine Lagemeldung, wenn wir vor Ort sind, kommen`;
    }
    if (/storno|abbrech|einrück|nicht mehr benötigt/.test(t)) {
      if (fz.einsatzId) {
        const ev = this.einsatz(fz.einsatzId);
        if (ev) this.log(ev, `Storno an ${fz.funkrufname} (Funk)`);
        this.freigeben(fz);
      }
      return `${hier}, Storno verstanden, rücken ein, kommen`;
    }
    if (/status|wo seid|wo bist|eintreff|wie lange|wann seid|wann seit|position|fahrzeit/.test(t)) {
      const min = fz.phaseEnde ? Math.max(1, Math.round((fz.phaseEnde - this.state.zeit) / MIN)) : null;
      if (fz.phase === "anfahrt" || fz.phase === "ausruecken") return `${hier}, sind auf Anfahrt, Eintreffen in ca. ${min ?? "?"} Minuten, kommen`;
      if (vorOrt) return `${hier}, sind vor Ort beim Patienten, kommen`;
      if (fz.phase === "transport") return `${hier}, sind mit Patient auf dem Weg ins Krankenhaus, ca. ${min ?? "?"} Minuten, kommen`;
      if (fz.phase === "uebergabe") return `${hier}, sind bei der Übergabe im Krankenhaus, kommen`;
      if (fz.phase === "rueckfahrt") return `${hier}, sind frei und auf dem Rückweg zur Dienststelle, kommen`;
      return `${hier}, sind frei, kommen`;
    }
    if (/patient|zustand|wie geht|reanim|braucht ihr|benötigt ihr|nachforder/.test(t)) {
      if (!vorOrt || !e) return `${hier}, sind noch nicht vor Ort, kommen`;
      const l = e.wahr.lage;
      if (!l) return `${hier}, Patient wird versorgt, Zustand stabil, kommen`;
      const fehlt = this.fehlendeKraefte(e);
      const bedarfText = fehlt.na || fehlt.rtw ? `, ${[fehlt.na && "benötigen Notarzt", fehlt.rtw && `benötigen ${fehlt.rtw} weitere Rettungsmittel`].filter(Boolean).join(", ")}` : ", keine weiteren Kräfte erforderlich";
      return `${hier}, ${l.patienten.length > 1 ? `${l.patienten.length} Patienten, ` : ""}${patientText(l.patienten[0]).replace(/ \(.*\)$/, "")}${bedarfText}, kommen`;
    }
    if (/funkcheck|wie hört ihr|wie hören sie|verständigung/.test(t)) return `${hier}, höre euch laut und klar, kommen`;
    if (/(feuerwehr|polizei|bergrettung|wasserrettung).*(vor ort|kommt|unterwegs|alarmiert|angefordert)/.test(t)) return `${hier}, verstanden, kommen`;
    if (/zielkrankenhaus|zielklinik|fahrt ins|bringt (ihn|sie|den patienten)/.test(t)) return `${hier}, Zielkrankenhaus verstanden, kommen`;
    if (/zusatzinfo|zur info|beachtet|achtung|hinweis/.test(t)) return `${hier}, Information verstanden, kommen`;
    if (/einsatz .*(code|adresse|einsatzort)|neuer einsatz|einsatzauftrag|übernehmt/.test(t)) {
      return fz.einsatzId ? `${hier}, Einsatz verstanden, kommen` : `${hier}, Einsatz verstanden, rücken aus, kommen`;
    }
    if (/verstanden|danke|passt/.test(t) && t.length < 40) return "";
    return null;
  }

  /** Handy-Ortung anstoßen; das Ergebnis kommt nach einigen Sekunden (Simulationszeit) */
  ortung(id: string): void {
    const e = this.einsatz(id);
    const a = e?.anruf;
    if (!e || !a) throw new Error("Ortung gibt es nur bei Notrufen");
    if (a.status === "klingelt") throw new Error("Bitte zuerst den Anruf annehmen");
    if (a.ortung?.status === "laeuft") return;
    a.ortung = { status: "laeuft", fertigUm: this.state.zeit + rnd(12, 40) * 1000 };
    this.log(e, "Ortung angefordert");
    this.emit();
  }

  private ortungFertig(e: Einsatz): void {
    const o = e.anruf?.ortung;
    if (!o) return;
    const draussen = !!e.wahr.abfrage?.ortUnbekannt;
    const gps = Math.random() < (draussen ? 0.75 : 0.65);
    const radius = Math.round(gps ? rnd(8, 60) : rnd(300, 2500) / 50) * (gps ? 1 : 50);
    const p = versetzt(e.wahr.lat, e.wahr.lon, Math.random() * radius * 0.6, rnd(0, 360));
    Object.assign(o, { status: "fertig", lat: p.lat, lon: p.lon, radius, art: gps ? "GPS (AML)" : "Funkzelle" });
    this.log(e, `Ortung: ${o.art} ±${radius} m`);
  }

  // ------------------------------------------------------------------ Krankentransporte

  ktAuftrag(id: string): KtAuftrag | undefined {
    return this.state.kt?.find((k) => k.id === id);
  }

  private ktLog(k: KtAuftrag, text: string): void {
    const p: Protokoll = { zeit: this.state.zeit, text };
    if (this.actor && this.mode !== "solo") p.von = this.actor.name;
    k.protokoll.push(p);
  }

  private ktNummer(): string {
    const d = new Date(this.state.zeit);
    this.state.ktZaehler = (this.state.ktZaehler ?? 0) + 1;
    return `KT-${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}-${pad(this.state.ktZaehler, 3)}`;
  }

  /** Krankenhäuser, die im geladenen Straßennetz liegen (null = alle; im Browser oder noch nicht geprüft) */
  khErreichbar: Set<string> | null = null;
  private abdeckungLaeuft = 0;

  /** Prüft, welche Krankenhäuser mit den installierten Straßenpaketen erreichbar sind */
  async abdeckungAktualisieren(): Promise<void> {
    const lauf = ++this.abdeckungLaeuft;
    // warten, bis das Straßennetz geladen ist
    for (let i = 0; i < 120; i++) {
      const g = await geoStatus().catch(() => null);
      if (!g || g.roads !== "laden") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (lauf !== this.abdeckungLaeuft) return;
    const khs = store.list("hospitals");
    try {
      const ok = await erreichbar(khs);
      this.khErreichbar = new Set(khs.filter((_, i) => ok[i]).map((h) => h.id));
    } catch {
      this.khErreichbar = null;
    }
  }

  /** Krankenhaus im Straßennetz? */
  khImNetz(h: { id: string }): boolean {
    return !this.khErreichbar || this.khErreichbar.has(h.id);
  }

  /** Krankenhäuser mit dieser Station/Ambulanz, nach Entfernung (bis 70 km) */
  private khMit(bereich: string, nahe: LatLon) {
    return store
      .list("hospitals")
      .filter((h) => bereicheVon(h).includes(bereich) && distanceM(h, nahe) < 70_000 && this.khImNetz(h))
      .sort((a, b) => distanceM(a, nahe) - distanceM(b, nahe));
  }

  private ktNeu(d: KtDaten, quelle: KtAuftrag["quelle"], serie?: string): KtAuftrag {
    const hotline = quelle === "hotline";
    const vonHeim = !d.von?.khId;
    const k: KtAuftrag = {
      id: `kt${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      nummer: this.ktNummer(),
      quelle,
      eingang: this.state.zeit,
      status: hotline ? "aufnahme" : "offen",
      d: hotline ? { ...neueDaten(), sek: d.sek ? sekLeer() : null } : structuredClone(d),
      wahr: {
        d: structuredClone(d),
        anrufer: hotlineAnrufer(d),
        verzoegerungMin: (vonHeim ? rnd(0, 8) : rnd(0, 4)) + (Math.random() < 0.1 ? rnd(8, 20) : 0),
        nichtDa: !d.sek && Math.random() < 0.03,
        verschlechterung: !d.sek && Math.random() < 0.02,
      },
      fz: null,
      anruf: hotline ? this.ktNeuerAnruf(null) : null,
      protokoll: [],
      serie,
    };
    k.wahr.d.code ??= this.ktCodeFuer(k.wahr.d);
    if (!hotline) k.d.code ??= k.wahr.d.code;
    this.ktLog(
      k,
      hotline ? "Anruf an der KT-Hotline" : quelle === "online" ? "Online-Anmeldung eingegangen" : quelle === "manuell" ? "Auftrag von Hand angelegt" : "Dauerauftrag",
    );
    (this.state.kt ??= []).unshift(k);
    if (this.state.kt.length > 400) this.state.kt = this.state.kt.filter((x, i) => i < 300 || (x.status !== "erledigt" && x.status !== "storniert"));
    return k;
  }

  /** Code-Vorschlag zu den Angaben (Hubschrauber nur bei weiter Strecke) */
  ktCodeFuer(d: KtDaten): string | null {
    const km = d.von && d.nach ? distanceM(d.von, d.nach) / 1000 : 0;
    return codeVorschlag(d, km);
  }

  /** Leeren Auftrag anlegen (z. B. Anruf direkt beim Disponenten) */
  ktNeuManuell(): string {
    const k = this.ktNeu(neueDaten(), "manuell");
    k.status = "aufnahme";
    k.d = neueDaten();
    k.wahr.d = neueDaten();
    this.emit();
    return k.id;
  }

  /** Neue zufällige Überstellung zwischen Krankenhäusern (dringend: immer Anruf) */
  async generiereSek(quelle?: "online" | "hotline"): Promise<KtAuftrag | null> {
    const mitte = mitteVon(this.funkgruppe());
    // nur Häuser, die mit den installierten Straßenpaketen erreichbar sind
    const khs = store.list("hospitals").filter((h) => this.khImNetz(h));
    const ds = sekZufall({ mitte, khs, jetzt: this.state.zeit });
    if (!ds) return null;
    const q = quelle ?? (ds[0].sofort || Math.random() < 0.3 ? "hotline" : "online");
    const serie = ds.length > 1 ? `SEK-${Date.now().toString(36)}` : undefined;
    const k = this.ktNeu(ds[0], q, serie);
    if (ds[1]) this.ktNeu(ds[1], "online", serie);
    this.emit();
    return k;
  }

  private ktNeuerAnruf(folge: string | null): Anruf {
    return {
      status: "klingelt",
      seit: this.state.zeit,
      klingelBis: this.state.zeit + rnd(50, 80) * 1000,
      rueckrufUm: null,
      versuche: 1,
      rueckruf: false,
      angenommenVon: null,
      gespraech: [],
      antworten: {},
      kapitel: null,
      extra: { aufwertung: null, zusatz: null, polizei: false },
      ergebnis: null,
      folge,
    };
  }

  /** Neuer zufälliger Krankentransport (online angemeldet oder über die Hotline) */
  async generiereKt(quelle?: "online" | "hotline"): Promise<KtAuftrag | null> {
    let d: KtDaten | null = null;
    for (let i = 0; i < 4 && !d; i++) {
      const adr = await this.adresseImGebiet();
      if (!adr) continue;
      const heim: KtOrt = { lat: adr.lat, lon: adr.lon, label: adr.label };
      d = zufallsDaten({ heim, khMit: (b) => this.khMit(b, heim) }, this.state.zeit);
    }
    if (!d) return null;
    const k = this.ktNeu(d, quelle ?? (Math.random() < 0.45 ? "hotline" : "online"));
    this.emit();
    return k;
  }

  /** Daueraufträge (Dialyse, Bestrahlung) für einen Tag anlegen – nur, was noch bevorsteht */
  private ktDauerLaeuft = false;
  private async ktDauer(tag0: number): Promise<void> {
    if (this.ktDauerLaeuft) return;
    this.ktDauerLaeuft = true;
    try {
      const g = this.funkgruppe();
      const imGebiet = (h: { lat: number; lon: number }) => inFunkgruppe(g, h.lat, h.lon);
      const mitte = mitteVon(g);
      const alle = store.list("hospitals").filter((h) => this.khImNetz(h));
      for (const [bereich, jeKh] of [
        ["DIA", this.settings.dauerDialyseJeKh ?? 6],
        ["STR", this.settings.dauerStrahlJeKh ?? 3],
        ["CHE", this.settings.dauerChemoJeKh ?? 1],
      ] as const) {
        const moeglich = alle.filter((h) => bereicheVon(h).includes(bereich));
        // KH im Gebiet; gibt es dort keines, das nächstgelegene (bis 70 km)
        let mit = moeglich.filter(imGebiet);
        if (!mit.length) mit = moeglich.filter((h) => distanceM(h, mitte) < 70_000).sort((x, y) => distanceM(x, mitte) - distanceM(y, mitte)).slice(0, 1);
        const n = Math.round(mit.length * jeKh);
        if (!n) continue;
        const adressen = (await randomAddresses(g.bbox, n * 3)).filter((a) => inFunkgruppe(g, a.lat, a.lon)).slice(0, n);
        for (const a of adressen) {
          const heim: KtOrt = { lat: a.lat, lon: a.lon, label: a.label };
          const kh = mit.slice().sort((x, y) => distanceM(x, heim) - distanceM(y, heim))[0];
          const [hin, zurueck] = dauerDaten(heim, kh, bereich, tag0);
          const serie = `${bereich}-${a.lat.toFixed(4)}`;
          if (hin.termin! > this.state.zeit) this.ktNeu(hin, "dauer", serie);
          if (zurueck.termin! > this.state.zeit) this.ktNeu(zurueck, "dauer", serie);
        }
      }
      this.emit();
    } finally {
      this.ktDauerLaeuft = false;
    }
  }

  private ktTick(t: number, dt: number): void {
    // vorgemerkte Fahrzeuge fahren zur berechneten Zeit selbst los
    for (const fz of Object.values(this.state.fahrzeuge)) {
      const plan = fz.kt;
      if (!plan || plan.aktiv || !plan.losUm || t < plan.losUm || fz.einsatzId) continue;
      if (!this.statusDef(fz.status).verfuegbar || this.flugHindernis(fz)) continue;
      plan.losUm = null;
      plan.aktiv = true;
      this.ktFahrtStarten(fz, true);
    }
    // Daueraufträge für den aktuellen Tag
    const d = new Date(t);
    // ab dem Nachmittag sind auch die Fahrten des nächsten Tages schon bestellt
    if (this.mode !== "client" && !this.ktDauerLaeuft) {
      const heute0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const bis = d.getHours() >= 16 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() : heute0;
      const geplant = typeof this.state.ktDauerTag === "number" ? this.state.ktDauerTag : -Infinity;
      if (geplant < bis) {
        const tag0 = geplant < heute0 ? heute0 : bis;
        this.state.ktDauerTag = tag0;
        void this.ktDauer(tag0);
      }
    }
    // Neue Aufträge nach Aufkommen der Stunde
    if (this.settings.generatorAktiv) {
      const rate = this.settings.stunden?.[d.getHours()]?.kt ?? 0;
      if (Math.random() < (rate * dt) / 3_600_000) void this.generiereKt();
      const sekRate = this.settings.stunden?.[d.getHours()]?.sek ?? 0;
      if (Math.random() < (sekRate * dt) / 3_600_000) void this.generiereSek();
    }
    for (const k of this.state.kt ?? []) {
      const a = k.anruf;
      // Anrufe: nicht angenommen → aufgelegt, später neuer Versuch
      if (a && a.status === "gehalten" && t >= (a.haltenBis ?? t)) {
        a.status = "verpasst";
        a.seit = t;
        a.haltenBis = null;
        a.rueckrufUm = t + rnd(2, 4) * MIN;
        a.gespraech.push({ zeit: t, echt: Date.now(), von: "system", text: "Der Anrufer hat aufgelegt – zu lange in der Warteschleife" });
        this.ktLog(k, "Anrufer hat in der Warteschleife aufgelegt");
      } else if (a && a.status === "klingelt" && t >= a.klingelBis) {
        a.status = "verpasst";
        a.seit = t;
        a.rueckrufUm = t + rnd(2, 4) * MIN;
        this.ktLog(k, "Anruf an der KT-Hotline nicht angenommen");
      } else if (a && a.status === "verpasst" && a.rueckrufUm !== null && t >= a.rueckrufUm) {
        a.status = "klingelt";
        a.seit = t;
        a.versuche++;
        a.klingelBis = t + rnd(50, 80) * 1000;
        a.rueckrufUm = null;
      }
      // „Wo bleibt der Transport?“ – wenn das Fahrzeug deutlich zu spät ist
      if (!k.nachfrage && ["offen", "vorgemerkt", "unterwegs"].includes(k.status) && k.d.termin) {
        const soll = k.d.abholung ?? k.d.termin - 30 * MIN;
        if (t > soll + 15 * MIN) {
          k.nachfrage = true;
          const freundlich = Math.random() < 0.6;
          const wer = /^(Pflegekraft|Ärzt|Arzt) auf der/.test(k.wahr.anrufer.rolle) ? `${k.wahr.anrufer.name}, ${k.wahr.anrufer.rolle.replace(/^(Pflegekraft|Ärztin|Arzt) /, "")}` : k.wahr.anrufer.name;
          const text = freundlich
            ? `Grüß Gott, ${wer} hier. Wir warten auf den Transport für ${k.d.patient.name || "unseren Patienten"} – wissen Sie, wann der Wagen kommt?`
            : `Hallo?! ${wer}. Wir warten jetzt schon ewig auf den Transport für ${k.d.patient.name || "den Patienten"}! Wo bleibt der denn?`;
          if (!k.anruf || k.anruf.status === "beendet") k.anruf = this.ktNeuerAnruf(text);
          else k.anruf.folge = text;
          this.ktLog(k, "Nachfrage: Wo bleibt der Transport?");
        }
      }
    }
  }

  // ---------------- Hotline-Gespräch

  ktAnrufAnnehmen(id: string): void {
    const k = this.ktAuftrag(id);
    const a = k?.anruf;
    if (!k || !a) throw new Error("Kein Anruf");
    if (a.status === "verpasst" && this.settings.rueckrufNurMitNummer && !k.d.telefon) throw new Error("Keine Rückrufnummer aufgenommen – Rückruf nicht möglich");
    const ich = this.calltaker();
    if (a.status === "gehalten") {
      // Gehaltene Anrufe kann jeder Disponent aufgreifen
      if (a.angenommenVon && a.angenommenVon.pid !== ich.pid) a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: `${ich.name} übernimmt das Gespräch` });
      this.andereHalten(ich, k.id);
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.haltenBis = null;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: "Gespräch fortgesetzt" });
      if (a.folge) {
        a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "anrufer", text: a.folge });
        a.folge = null;
      }
    } else if (a.status === "aktiv") {
      if (a.angenommenVon && a.angenommenVon.pid !== ich.pid && (this.istOnline?.(a.angenommenVon.pid) ?? true)) {
        throw new Error(`Das Gespräch führt bereits ${a.angenommenVon.name}`);
      }
      a.angenommenVon = { ...ich };
    } else if (a.status === "klingelt" || a.status === "verpasst") {
      this.andereHalten(ich, k.id);
      a.rueckruf = a.status === "verpasst";
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.rueckrufUm = null;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: `${a.rueckruf ? "Rückruf durch" : "Angenommen von"} ${ich.name}` });
      if (a.folge) {
        a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "anrufer", text: a.folge });
        a.folge = null;
      }
    } else throw new Error("Das Gespräch ist beendet");
    k.bearbeiter = { ...ich };
    this.emit();
  }

  ktAnrufNachricht(id: string, von: "leitstelle" | "anrufer", text: string, quelle?: "ki" | "fest"): void {
    const a = this.ktAuftrag(id)?.anruf;
    if (!a || a.status !== "aktiv") return;
    const t = text.trim().slice(0, 1500);
    if (!t) return;
    a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von, text: t, wer: von === "leitstelle" ? this.calltaker().name : undefined, quelle });
    this.emit();
  }

  ktAnrufHalten(id: string): void {
    const k = this.ktAuftrag(id);
    const a = k?.anruf;
    if (!k || !a || a.status !== "aktiv") return;
    this.halten(a);
    this.ktLog(k, "Anrufer wird gehalten");
    this.emit();
  }

  ktAnrufBeenden(id: string): void {
    const k = this.ktAuftrag(id);
    const a = k?.anruf;
    if (!k || !a || (a.status !== "aktiv" && a.status !== "gehalten")) return;
    a.status = "beendet";
    a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: "Gespräch beendet" });
    this.emit();
  }

  // ---------------- Auftrag bearbeiten

  ktSetze(id: string, patch: Partial<KtDaten>): void {
    const k = this.ktAuftrag(id);
    if (!k) return;
    if (k.status === "anBord" || k.status === "erledigt" || k.status === "storniert") throw new Error("Der Auftrag kann nicht mehr geändert werden");
    k.d = { ...k.d, ...patch, patient: { ...k.d.patient, ...(patch.patient ?? {}) } };
    if (patch.sek) k.d.sek = { ...patch.sek };
    // Krankenhaus → Krankenhaus: Überstellung mit Zusatzangaben
    const beideKh = !!k.d.von?.khId && !!k.d.nach?.khId;
    if (beideKh && !k.d.sek) k.d.sek = sekLeer();
    // ein Ort ist eine Adresse: Krankentransport, keine Überstellung
    if (!beideKh && k.d.sek && k.d.von && k.d.nach) k.d.sek = null;
    if ("code" in patch) k.d.codeManuell = !!patch.code;
    if (!k.d.codeManuell) k.d.code = this.ktCodeFuer(k.d);
    // Entweder Abholzeit oder Termin: die andere Zeit rechnet das Spiel aus
    if ("abholung" in patch) k.d.zeitVorgabe = patch.abholung ? "abholung" : k.d.termin && k.d.zeitVorgabe === "abholung" ? null : k.d.zeitVorgabe;
    if ("termin" in patch) k.d.zeitVorgabe = patch.termin ? "termin" : k.d.abholung && k.d.zeitVorgabe === "termin" ? null : k.d.zeitVorgabe;
    if ("abholung" in patch || "termin" in patch || "von" in patch || "nach" in patch || "lage" in patch) void this.ktZeitenRechnen(k.id);
    this.emit();
  }

  /** Aus der vorgegebenen Zeit die andere berechnen: Fahrzeit Abholort → Ziel plus Einladen und Übergabe */
  private async ktZeitenRechnen(id: string): Promise<void> {
    const k = this.ktAuftrag(id);
    if (!k || !k.d.zeitVorgabe || !k.d.von || !k.d.nach) return;
    const sek = (await travelTimes(k.d.nach, [k.d.von]))[0];
    const k2 = this.ktAuftrag(id);
    if (!k2 || !k2.d.von || !k2.d.nach || sek === null || sek === undefined) return;
    const laden = (k2.d.lage === "liegend" ? 15 : 10) * MIN + 10 * MIN;
    const fuenf = 5 * MIN;
    if (k2.d.zeitVorgabe === "termin" && k2.d.termin) {
      k2.d.abholung = Math.floor((k2.d.termin - sek * 1000 - laden) / fuenf) * fuenf;
    } else if (k2.d.zeitVorgabe === "abholung" && k2.d.abholung) {
      k2.d.termin = Math.ceil((k2.d.abholung + sek * 1000 + laden) / fuenf) * fuenf;
    } else return;
    this.emit();
  }

  /** Telefonisch aufgenommenen Auftrag anlegen (Pflichtfelder prüfen) */
  ktAnlegen(id: string): void {
    const k = this.ktAuftrag(id);
    if (!k || k.status !== "aufnahme") return;
    const fehlt = [
      !k.d.patient.name && "Name",
      !k.d.von && "Abholort",
      !k.d.nach && "Ziel",
      !k.d.termin && !k.d.abholung && "Termin oder Abholzeit",
      !k.d.lage && "Transportart (gehfähig/Tragstuhl/liegend)",
      !k.d.code && "Code",
    ].filter(Boolean);
    if (fehlt.length) throw new Error(`Bitte noch eintragen: ${fehlt.join(", ")}`);
    k.status = "offen";
    this.ktLog(k, "Auftrag angelegt");
    this.emit();
  }

  /** Auftrag stornieren (z. B. Termin abgesagt) */
  ktStorno(id: string, grund = "storniert"): void {
    const k = this.ktAuftrag(id);
    if (!k) return;
    if (k.status === "anBord") throw new Error("Patient ist schon an Bord");
    if (k.fz) this.ktAusPlan(k);
    else this.ktBegleitLoesen(k);
    k.status = "storniert";
    this.ktLog(k, `Storniert: ${grund}`);
    this.emit();
  }

  // ---------------- Disposition

  /** Fahrzeugvorschläge für einen Auftrag: zuerst die passenden, darunter Ersatz (Regelrettungsdienst) */
  async ktVorschlaege(id: string): Promise<KtVorschlag[]> {
    const k = this.ktAuftrag(id);
    const von = k?.d.von;
    if (!k || !von) return [];
    const info = codeInfo(k.d.code);
    const alle = Object.values(this.state.fahrzeuge).filter((f) => !f.einsatzId && (this.verfuegbar(f) || f.kt));
    // Fahrzeit vom Abholort zum Ziel (für „los spätestens“ und die Hubschrauber-Frage)
    let fahrzeit = 0;
    if (k.d.nach) fahrzeit = (await travelTimes(k.d.nach, [von]))[0] ?? 0;
    const soll = k.d.abholung ?? (k.d.termin ? k.d.termin - fahrzeit * 1000 - 15 * MIN : null);

    // Welche Typen passen (Vorschlag), welche nur als Ersatz; Paare = mit NEF
    type Wahl = { typen: RmTyp[]; nef?: boolean; ersatz: boolean; hinweis?: string };
    const w: Wahl[] = [];
    const flugSinnvoll = fahrzeit > 30 * 60 && !k.d.sek?.instabil;
    if (info.gruppe === "KT") {
      w.push({ typen: ["KTW"], ersatz: false });
      w.push({ typen: ["RTW", "RTW-C"], ersatz: true, hinweis: "RTW – nur wenn nötig" });
    } else {
      const code = k.d.code ?? "";
      const z = Number(code.match(/^SEK-96[KBD](\d)/)?.[1] ?? 3);
      const ith: Wahl = { typen: ["ITH"], ersatz: false, hinweis: "Intensivtransporthubschrauber" };
      const nah: Wahl = { typen: ["NAH"], ersatz: false, hinweis: "Hubschrauber" };
      const mitNef: Wahl = { typen: ["SRTW", "RTW", "RTW-C"], nef: true, ersatz: true, hinweis: "mit NEF" };
      if (z <= 3) {
        w.push({ typen: ["SKTW"], ersatz: false });
        w.push({ typen: ["KTW", "SRTW", "RTW", "RTW-C"], ersatz: true, hinweis: "kein SKTW frei" });
      } else if (z === 6 && info.fahrzeug === "SRTW") {
        w.push({ typen: ["SRTW"], ersatz: false });
        w.push({ typen: ["RTW", "RTW-C"], ersatz: true, hinweis: "kein SRTW frei" });
      } else if (z === 6) {
        if (!info.fahrzeug && flugSinnvoll) w.push(ith, nah);
        w.push({ typen: ["SNAW"], ersatz: false });
        w.push(mitNef);
        if (info.fahrzeug && flugSinnvoll) w.push({ ...ith, ersatz: true }, { ...nah, ersatz: true });
      } else if (z === 7) {
        w.push(ith, nah);
        w.push({ typen: ["SNAW"], ersatz: true, hinweis: "kein Hubschrauber" });
        w.push(mitNef);
      } else if (code.endsWith("-RTW")) {
        w.push({ typen: ["RTW", "RTW-C"], ersatz: false, hinweis: "Inkubator vom Krankenhaus" });
        w.push({ typen: ["SRTW", "SNAW"], ersatz: true });
      } else {
        // Inkubator-/Kinderüberstellung: ITH oder SNAW
        if (info.fahrzeug === "SNAW") w.push({ typen: ["SNAW"], ersatz: false }, { ...ith, ersatz: true });
        else if (info.fahrzeug === "ITH") w.push(ith, nah, { typen: ["SNAW"], ersatz: true });
        else w.push(ith, { typen: ["SNAW"], ersatz: false });
        w.push({ ...mitNef, hinweis: "mit NEF, Inkubator vom Krankenhaus" });
      }
    }

    // Überstellung eines sehr schweren Patienten: BIT zuerst (mit NEF, wenn ein Arzt nötig ist)
    if (info.gruppe === "SEK" && k.d.sek?.bit) w.unshift({ typen: ["BIT"], nef: info.arzt, ersatz: false, hinweis: info.arzt ? "Schwerlast, mit NEF" : "Schwerlast" });
    const typVon = new Map<string, Wahl>();
    for (const x of w) for (const t of x.typen) if (!typVon.has(t)) typVon.set(t, x);
    const kandidaten = alle.filter((f) => typVon.has(f.rmTyp) && (info.gruppe !== "KT" || f.rmTyp !== "SKTW"));
    const boden = kandidaten.filter((f) => !fliegt(f));
    const zeiten = await travelTimes(von, boden.map((f) => ({ lat: f.lat, lon: f.lon })));
    const faktor = info.sondersignal ? this.settings.sondersignalFaktor : 1;
    const eta = new Map<string, number | null>();
    boden.forEach((f, i) => eta.set(f.id, zeiten[i] === null ? null : zeiten[i]! * faktor + this.ausrueckSek(f, true)));
    for (const f of kandidaten.filter((x) => fliegt(x))) {
      eta.set(f.id, distanceM(f, von) / (this.settings.nahGeschwindigkeit / 3.6) + this.ausrueckSek(f, true) + 90);
    }
    // bestes freies NEF für Paare
    let nef: { fz: SimFahrzeug; sek: number } | null = null;
    if (w.some((x) => x.nef)) {
      const nefs = Object.values(this.state.fahrzeuge).filter((f) => f.rmTyp === "NEF" && this.verfuegbar(f) && !f.kt);
      const nz = await travelTimes(von, nefs.map((f) => ({ lat: f.lat, lon: f.lon })));
      nefs.forEach((f, i) => {
        const s = nz[i] === null ? null : nz[i]! * faktor + this.ausrueckSek(f, true);
        if (s !== null && (!nef || s < nef.sek)) nef = { fz: f, sek: s };
      });
    }
    const out: KtVorschlag[] = [];
    for (const fz of kandidaten) {
      const wahl = typVon.get(fz.rmTyp)!;
      const hinweise: string[] = [];
      if (wahl.hinweis) hinweise.push(wahl.hinweis);
      const hindernis = this.flugHindernis(fz);
      if (hindernis) continue;
      let sek = eta.get(fz.id) ?? null;
      let begleit: SimFahrzeug | null = null;
      if (wahl.nef) {
        const n = nef as { fz: SimFahrzeug; sek: number } | null;
        if (!n) hinweise.push("kein NEF frei");
        else {
          begleit = n.fz;
          if (sek !== null) sek = Math.max(sek, n.sek);
        }
      }
      if (fz.kt?.aktiv) hinweise.push(`fährt KT, ${fz.kt.fahrten.length} Fahrt(en) geplant`);
      else if (fz.kt) hinweise.push(`vorgemerkt (${fz.kt.fahrten.flat().length})`);
      out.push({ fz, begleit, sekunden: sek, hinweis: hinweise.join(" · ") || null, losSpaetestens: soll && sek !== null ? soll - sek * 1000 : null, ersatz: wahl.ersatz, rang: w.indexOf(wahl) });
    }
    return out.sort((a, b) => Number(a.ersatz) - Number(b.ersatz) || (a.ersatz ? 0 : a.rang - b.rang) || (a.sekunden ?? 1e9) - (b.sekunden ?? 1e9));
  }

  /**
   * Transport einem Fahrzeug zuteilen.
   * modus: „neu“ = eigene Fahrt (hinten anhängen), „sammel“ = zur letzten noch nicht begonnenen Fahrt dazu
   * (Sammelfahrt; auch zur laufenden, solange noch kein Patient an Bord ist).
   * begleitId: NEF, das mitfährt (Notarzt-Überstellung mit RTW/SRTW)
   */
  async ktVormerken(id: string, fzId: string, modus: "neu" | "sammel" = "neu", begleitId?: string | null): Promise<void> {
    const k = this.ktAuftrag(id);
    const fz = this.state.fahrzeuge[fzId];
    if (!k || !fz) throw new Error("Nicht gefunden");
    if (!["offen", "vorgemerkt"].includes(k.status)) throw new Error("Der Auftrag ist nicht offen");
    const info = codeInfo(k.d.code);
    if (fz.rmTyp === "SKTW" && info.gruppe === "KT") throw new Error("SKTW fahren nur Überstellungen zwischen Krankenhäusern");
    if (fz.einsatzId) throw new Error(`${fz.funkrufname} ist in einem Notfalleinsatz`);
    const hindernis = this.flugHindernis(fz);
    if (hindernis) throw new Error(`${fz.funkrufname}: ${hindernis}`);
    const nef = begleitId ? this.state.fahrzeuge[begleitId] : undefined;
    if (begleitId && (!nef || nef.einsatzId || nef.kt)) throw new Error("Das NEF ist nicht mehr frei");
    if (k.fz) this.ktAusPlan(k);
    const plan = (fz.kt ??= { fahrten: [], aktiv: false, halte: [], halt: 0 });
    let ziel: string[] | null = null;
    if (modus === "sammel" && plan.fahrten.length) {
      const letzte = plan.fahrten[plan.fahrten.length - 1];
      const laufend = plan.aktiv && plan.fahrten.length === 1;
      const schonAnBord = laufend && letzte.some((x) => this.ktAuftrag(x)?.status === "anBord");
      if (schonAnBord) throw new Error("Es ist schon ein Patient an Bord – bitte als eigene Fahrt anhängen");
      if (letzte.some((x) => this.ktAuftrag(x)?.begleit)) throw new Error("Notarzt-Überstellung: keine Sammelfahrt");
      ziel = letzte;
    }
    const gruppe = ziel ? [...ziel, k.id] : [k.id];
    const grund = passt(gruppe.map((x) => (x === k.id ? k.d : this.ktAuftrag(x)?.d)).filter((x): x is KtDaten => !!x));
    if (grund) {
      if (!plan.fahrten.length && !plan.aktiv) fz.kt = null;
      throw new Error(grund);
    }
    if (ziel) ziel.push(k.id);
    else plan.fahrten.push([k.id]);
    k.fz = fz.id;
    if (nef) {
      nef.kt = { fahrten: [[k.id]], aktiv: false, halte: [], halt: 0 };
      k.begleit = nef.id;
    }
    const sofort = plan.aktiv && plan.fahrten[0].includes(k.id);
    k.status = sofort ? "unterwegs" : "vorgemerkt";
    this.ktLog(k, `${fz.funkrufname}${nef ? ` + ${nef.funkrufname}` : ""} ${sofort ? "zugeteilt (Sammelfahrt)" : "vorgemerkt"}`);
    if (sofort) this.ktHalteNeu(fz);
    else if (!plan.aktiv && plan.fahrten[0]?.includes(k.id)) await this.ktLosUmRechnen(fz);
    this.emit();
  }

  /**
   * Ausrückzeitpunkt der ersten vorgemerkten Fahrt: früheste Abholzeit minus Anfahrt und Ausrücken.
   * Zu diesem Zeitpunkt fährt das Fahrzeug selbst los.
   */
  private async ktLosUmRechnen(fz: SimFahrzeug): Promise<void> {
    const plan = fz.kt;
    if (!plan || plan.aktiv) return;
    const ks = (plan.fahrten[0] ?? []).map((x) => this.ktAuftrag(x)).filter((x): x is KtAuftrag => !!x && !!x.d.von);
    if (!ks.length) return;
    const zeitAb = (k: KtAuftrag) => k.d.abholung ?? (k.d.termin ?? this.state.zeit) - 45 * MIN;
    const erste = ks.sort((a, b) => zeitAb(a) - zeitAb(b))[0];
    const sek = (await travelTimes(erste.d.von!, [{ lat: fz.lat, lon: fz.lon }]))[0] ?? 15 * 60;
    if (fz.kt !== plan || plan.aktiv) return;
    plan.losUm = Math.floor((zeitAb(erste) - sek * 1000 - 3 * MIN) / MIN) * MIN;
    for (const k of ks) this.ktLog(k, `${fz.funkrufname} rückt um ${hhmm(Math.max(plan.losUm, this.state.zeit))} aus`);
  }

  /** Vorgemerktes Fahrzeug losschicken (ein begleitendes NEF fährt mit los) */
  ktSchicken(fzId: string): void {
    const fz = this.state.fahrzeuge[fzId];
    const plan = fz?.kt;
    if (!fz || !plan || !plan.fahrten.length) throw new Error("Nichts vorgemerkt");
    if (plan.aktiv) return;
    if (fz.einsatzId) throw new Error(`${fz.funkrufname} ist in einem Notfalleinsatz`);
    if (!this.statusDef(fz.status).verfuegbar) throw new Error(`${fz.funkrufname} ist nicht verfügbar`);
    const hindernis = this.flugHindernis(fz);
    if (hindernis) throw new Error(`${fz.funkrufname}: ${hindernis}`);
    plan.aktiv = true;
    this.ktFahrtStarten(fz, true);
    this.emit();
  }

  /** Vormerkung eines Transports lösen (Fahrzeug steht noch) */
  ktLoesen(id: string): void {
    const k = this.ktAuftrag(id);
    if (!k?.fz) return;
    const fz = this.state.fahrzeuge[k.fz];
    if (fz?.kt?.aktiv && fz.kt.fahrten[0]?.includes(k.id)) throw new Error("Das Fahrzeug ist schon unterwegs – Storno über Funk");
    this.ktAusPlan(k);
    k.status = "offen";
    this.ktLog(k, "Vormerkung gelöst");
    this.emit();
  }

  /** Storno über Funk: Fahrzeug ohne Patient an Bord bricht die Fahrten ab */
  ktFunkStorno(fzId: string): void {
    const fz = this.state.fahrzeuge[fzId];
    const plan = fz?.kt;
    if (!fz || !plan) return;
    if (plan.aktiv && this.ktPatientAnBord(fz)) throw new Error("Es ist ein Patient an Bord – Storno nicht möglich");
    if (plan.aktiv) this.ktFunkSpruch(fz, "Storno für eure Krankentransporte");
    this.ktPlanLoesen(fz, plan.aktiv ? "Storno über Funk" : "Vormerkung aufgehoben");
    this.emit();
  }

  private ktFunkSpruch(fz: SimFahrzeug, text: string): void {
    const g = this.neuesGespraech(fz, null, "offen");
    const wer = this.calltaker().name;
    this.spruch(g, "LEO", `${fz.funkrufname} von LEO kommen`, wer);
    this.spruch(g, fz.funkrufname, `Hier ${fz.funkrufname} kommen`);
    this.spruch(g, "LEO", `Hier LEO, ${text}, kommen`, wer);
    this.spruch(g, fz.funkrufname, `Hier ${fz.funkrufname}, verstanden, kommen`);
    this.spruch(g, "LEO", "Hier LEO ENDE", wer);
    g.status = "ende";
  }

  /** Hat das Fahrzeug einen eigenen Patienten an Bord? (Begleit-NEF zählt nicht) */
  ktPatientAnBord(fz: SimFahrzeug): boolean {
    return !!fz.kt?.aktiv && (fz.kt.fahrten[0] ?? []).some((x) => {
      const k = this.ktAuftrag(x);
      return k?.status === "anBord" && k.fz === fz.id;
    });
  }

  /** Fahrzeug fährt KT ohne Patient an Bord: kann für einen Notfall abgezogen werden */
  ktAbziehbar(fz: SimFahrzeug): boolean {
    return !!fz.kt?.aktiv && !fz.einsatzId && !this.ktPatientAnBord(fz) && fz.phase !== "ktReinigung";
  }

  /** Alle Transporte eines Fahrzeugs zurück in „nicht disponiert“ */
  private ktPlanLoesen(fz: SimFahrzeug, grund: string, frei = true): void {
    const plan = fz.kt;
    if (!plan) return;
    const warAktiv = plan.aktiv;
    for (const id of plan.fahrten.flat()) {
      const k = this.ktAuftrag(id);
      if (!k || k.status === "erledigt" || k.status === "storniert") continue;
      if (k.begleit === fz.id && k.fz !== fz.id) {
        // nur Begleitung (NEF): der Transport bleibt, der Notarzt fehlt
        k.begleit = null;
        this.ktLog(k, `${grund}: ${fz.funkrufname} begleitet nicht mehr – Notarzt fehlt`);
        continue;
      }
      if (k.status === "anBord") continue;
      this.ktBegleitLoesen(k);
      k.status = "offen";
      k.fz = null;
      this.ktLog(k, `${grund} – neu disponieren`);
    }
    fz.kt = null;
    fz.blaulicht = false;
    if (warAktiv && !fz.einsatzId && frei) this.freigeben(fz);
  }

  /** Begleitendes NEF eines Transports freigeben */
  private ktBegleitLoesen(k: KtAuftrag): void {
    const nef = k.begleit ? this.state.fahrzeuge[k.begleit] : undefined;
    k.begleit = null;
    if (!nef?.kt) return;
    const warAktiv = nef.kt.aktiv;
    nef.kt.fahrten = nef.kt.fahrten.map((f) => f.filter((x) => x !== k.id)).filter((f) => f.length);
    if (!nef.kt.fahrten.length) {
      nef.kt = null;
      if (warAktiv && !nef.einsatzId) this.freigeben(nef);
    }
  }

  /** Transport aus dem Plan seines Fahrzeugs entfernen */
  private ktAusPlan(k: KtAuftrag): void {
    this.ktBegleitLoesen(k);
    const fz = k.fz ? this.state.fahrzeuge[k.fz] : undefined;
    k.fz = null;
    const plan = fz?.kt;
    if (!fz || !plan) return;
    const lief = plan.aktiv && plan.fahrten[0]?.includes(k.id);
    plan.fahrten = plan.fahrten.map((f) => f.filter((x) => x !== k.id)).filter((f) => f.length);
    if (lief) {
      if (!plan.fahrten.length || !plan.fahrten[0].some((x) => ["unterwegs", "anBord"].includes(this.ktAuftrag(x)?.status ?? ""))) {
        // laufende Fahrt ist leer: nächste Fahrt oder Ende
        this.ktFahrtFertig(fz, false);
      } else this.ktHalteNeu(fz);
    } else if (!plan.fahrten.length && !plan.aktiv) fz.kt = null;
    else if (!plan.aktiv) {
      plan.losUm = null;
      void this.ktLosUmRechnen(fz).then(() => this.emit());
    }
  }

  /** Halte der laufenden Fahrt (neu) berechnen: erst abholen (nach Abholzeit), dann abliefern (nach Termin) */
  private ktHalteNeu(fz: SimFahrzeug): void {
    const plan = fz.kt!;
    const ids = plan.fahrten[0] ?? [];
    const ks = ids.map((x) => this.ktAuftrag(x)).filter((x): x is KtAuftrag => !!x);
    const zeitAb = (k: KtAuftrag) => k.d.abholung ?? (k.d.termin ?? 0) - 45 * MIN;
    const ab = ks.filter((k) => k.status === "unterwegs" || k.status === "vorgemerkt").sort((a, b) => zeitAb(a) - zeitAb(b));
    const an = ks.filter((k) => k.status !== "erledigt" && k.status !== "storniert").sort((a, b) => (a.d.termin ?? 0) - (b.d.termin ?? 0));
    plan.halte = [...ab.map((k) => ({ kt: k.id, art: "ab" as const })), ...an.map((k) => ({ kt: k.id, art: "an" as const }))];
    plan.halt = 0;
    // fährt gerade: zum (neuen) ersten Halt umleiten
    if (plan.aktiv && (fz.phase === "ktFahrt" || fz.phase === "routing") && plan.halte.length) this.ktNaechsterHalt(fz);
  }

  private ktFahrtStarten(fz: SimFahrzeug, ausruecken: boolean): void {
    const plan = fz.kt!;
    for (const id of plan.fahrten[0] ?? []) {
      const k = this.ktAuftrag(id);
      if (k && k.status === "vorgemerkt" && k.fz === fz.id) {
        k.status = "unterwegs";
        this.ktLog(k, `${fz.funkrufname} unterwegs`);
      }
      // begleitendes NEF fährt mit los
      const nef = k?.begleit && k.fz === fz.id ? this.state.fahrzeuge[k.begleit] : undefined;
      if (nef?.kt && !nef.kt.aktiv && nef.kt.fahrten[0]?.includes(id) && !nef.einsatzId) {
        nef.kt.aktiv = true;
        this.ktLog(k!, `${nef.funkrufname} unterwegs (Begleitung)`);
        this.ktFahrtStarten(nef, true);
      }
    }
    plan.halte = [];
    plan.wartetSeit = null;
    this.ktHalteNeu(fz);
    const aufWache = ausruecken && (fz.status === "freiWache" || fz.status === "bereitschaft");
    const sek = ausruecken ? this.ausrueckSek(fz, false) : rnd(5, 15);
    this.setStatus(fz, aufWache ? "alarmWache" : "alarmFunk");
    fz.fahrt = null;
    fz.phase = "ausruecken";
    // KT auf der Wache: nach ca. 20 s „Alarmiert und quittiert“, danach Ausrücken
    fz.quittUm = aufWache ? this.state.zeit + rnd(15, 25) * 1000 : null;
    fz.phaseEnde = Math.max(this.state.zeit + sek * 1000, fz.quittUm ? fz.quittUm + rnd(10, 30) * 1000 : 0);
  }

  /** Ist der Halt für dieses Fahrzeug (noch) anzufahren? */
  private ktHaltGilt(fz: SimFahrzeug, h: { kt: string; art: "ab" | "an" }): boolean {
    const k = this.ktAuftrag(h.kt);
    if (!k || k.status === "erledigt" || k.status === "storniert") return false;
    if (k.fz !== fz.id) {
      // Begleitung: zum Abholort, solange der Patient noch nicht weg ist; dann zum Ziel
      if (k.begleit !== fz.id) return false;
      return h.art === "ab" ? k.status === "unterwegs" || k.status === "vorgemerkt" : true;
    }
    return h.art === "ab" ? k.status === "unterwegs" : k.status === "anBord";
  }

  private ktNaechsterHalt(fz: SimFahrzeug): void {
    const plan = fz.kt!;
    // Halte von stornierten oder übergebenen Transporten überspringen
    while (plan.halt < plan.halte.length && !this.ktHaltGilt(fz, plan.halte[plan.halt])) plan.halt++;
    if (plan.halt >= plan.halte.length) return this.ktFahrtFertig(fz, false);
    const h = plan.halte[plan.halt];
    const k = this.ktAuftrag(h.kt)!;
    const ziel = h.art === "ab" ? k.d.von : k.d.nach;
    if (!ziel) return this.ktFahrtFertig(fz, false);
    // Status: zum BO, bis der letzte Abholort erreicht ist; dann zum ZO
    this.setStatus(fz, h.art === "ab" ? "zumBO" : "zumZO");
    const blau = (plan.fahrten[0] ?? []).some((x) => codeInfo(this.ktAuftrag(x)?.d.code).sondersignal);
    plan.wartetSeit = null;
    this.fahre(fz, ziel, "ktFahrt", blau);
  }

  private ktUpdate(fz: SimFahrzeug, t: number): void {
    const plan = fz.kt!;
    switch (fz.phase) {
      case "ausruecken":
        this.ktNaechsterHalt(fz);
        break;
      case "ktFahrt": {
        fz.fahrt = null;
        const h = plan.halte[plan.halt];
        const k = h && this.ktAuftrag(h.kt);
        if (!h || !k) return this.ktNaechsterHalt(fz);
        fz.phase = "ktHalt";
        const sek = istUeberstellung(k.d);
        const s = k.d.sek;
        if (h.art === "ab") {
          this.setStatus(fz, "amBO");
          const heim = !k.d.von?.khId;
          const min = sek
            ? s?.arzt || s?.beatmet || s?.inkubator
              ? rnd(15, 30)
              : s?.monitoring
                ? rnd(10, 20)
                : rnd(8, 16)
            : k.wahr.nichtDa
              ? rnd(6, 10)
              : (heim ? rnd(5, 12) : rnd(6, 18)) + k.wahr.verzoegerungMin;
          fz.phaseEnde = t + min * MIN;
        } else {
          this.setStatus(fz, "amZO");
          fz.phaseEnde = t + (sek && (s?.arzt || s?.monitoring) ? rnd(10, 20) : k.d.lage === "liegend" ? rnd(8, 15) : rnd(4, 10)) * MIN;
        }
        break;
      }
      case "ktHalt": {
        if (plan.wartetKt) {
          // Warten auf Nachforderung vorbei (Hilfe da oder Zeit abgelaufen): weiter mit dem nächsten Halt
          plan.wartetAuf = null;
          plan.wartetKt = null;
          return this.ktNaechsterHalt(fz);
        }
        const h = plan.halte[plan.halt];
        const k = h && this.ktAuftrag(h.kt);
        if (h && k && k.fz !== fz.id) {
          // Begleitung (NEF): am Abholort warten, bis der Patient im Fahrzeug ist
          if (h.art === "ab" && (k.status === "unterwegs" || k.status === "vorgemerkt")) {
            plan.wartetSeit ??= t;
            if (t - plan.wartetSeit < 45 * MIN) {
              fz.phaseEnde = t + MIN;
              return;
            }
          }
        } else if (h && k) {
          if (h.art === "ab") {
            // Notarzt-Überstellung: ohne das begleitende NEF fährt der Patient nicht ab
            const nef = k.begleit ? this.state.fahrzeuge[k.begleit] : undefined;
            if (nef && nef.status !== "amBO") {
              plan.wartetSeit ??= t;
              if (t - plan.wartetSeit < 30 * MIN) {
                fz.phaseEnde = t + MIN;
                return;
              }
            }
            if (k.wahr.nichtDa) {
              k.status = "storniert";
              this.ktLog(k, `${fz.funkrufname}: Patient nicht angetroffen`);
              this.fzRuft(fz, null, "info", `Patient ${k.d.patient.name} am Abholort nicht angetroffen, ${k.nummer} wird storniert`);
              this.ktBegleitLoesen(k);
            } else {
              k.status = "anBord";
              this.ktLog(k, `${fz.funkrufname}: Patient an Bord`);
              if (k.wahr.verschlechterung) {
                k.wahr.verschlechterung = false;
                plan.halt++;
                return this.ktHilfeAnfordern(fz, k);
              }
            }
          } else {
            k.status = "erledigt";
            this.ktLog(k, `${fz.funkrufname}: am Ziel übergeben`);
            if (k.d.infektion) plan.reinigen = true;
          }
        }
        plan.halt++;
        this.ktNaechsterHalt(fz);
        break;
      }
      case "ktReinigung":
        this.ktFahrtFertig(fz, true);
        break;
      default:
        break;
    }
  }

  /** Fahrt abgeschlossen: Desinfektion nach Infektionstransport, dann nächste Fahrt oder frei */
  private ktFahrtFertig(fz: SimFahrzeug, nachReinigung: boolean): void {
    const plan = fz.kt;
    if (!plan) return;
    if (!nachReinigung) {
      plan.fahrten.shift();
      plan.halte = [];
      plan.halt = 0;
      fz.blaulicht = false;
      if (plan.reinigen) {
        plan.reinigen = false;
        this.setStatus(fz, "bereitschaft");
        fz.fahrt = null;
        fz.phase = "ktReinigung";
        fz.phaseEnde = this.state.zeit + rnd(5, 10) * MIN;
        this.funk(fz.funkrufname, null, "Fahrzeug wird nach Infektionstransport desinfiziert", "info");
        return;
      }
    }
    if (plan.fahrten.length) {
      // Folgeauftrag (Mehrfachauftrag): direkt weiter
      this.ktFahrtStarten(fz, false);
      return;
    }
    fz.kt = null;
    this.freigeben(fz);
  }

  /** Patient verschlechtert sich im KTW: Nachforderung als Notfall an der Position des KTW */
  private ktHilfeAnfordern(fz: SimFahrzeug, k: KtAuftrag): void {
    const codes = allCodes().filter((c) => this.stufeDef(c.stufe)?.kategorie === "dringend");
    const code = codes.length ? pick(codes) : allCodes()[0];
    const label = `KTW ${fz.funkrufname} – Position ${fz.lat.toFixed(5)}, ${fz.lon.toFixed(5)}`;
    if (!code) {
      this.ktFahrtWeiter(fz);
      return;
    }
    const e = this.erstelleEinsatz({ lat: fz.lat, lon: fz.lon, adresse: label, code, meldung: `Nachforderung ${fz.funkrufname}: Patient ${k.d.patient.name} verschlechtert sich während des Krankentransports (${k.d.grund}).` });
    e.adresse = { lat: fz.lat, lon: fz.lon, label };
    e.zustand = "offen";
    this.log(e, `Nachforderung durch ${fz.funkrufname} (Krankentransport ${k.nummer})`);
    this.ktLog(k, `Patient verschlechtert sich – Nachforderung ${e.nummer}`);
    fz.kt!.wartetAuf = e.id;
    fz.kt!.wartetKt = k.id;
    // KTW bleibt stehen, bis die Nachforderung da ist (spätestens 40 min, dann fährt er selbst weiter)
    fz.phase = "ktHalt";
    fz.phaseEnde = this.state.zeit + 40 * MIN;
    this.fzRuft(fz, e, "nachforderung", `Patient verschlechtert sich, benötigen RTW mit Notarzt, Position ${label.split("Position ")[1]}`);
  }

  /** Ein Fahrzeug der Nachforderung ist da: KTW übergibt den Patienten und fährt weiter */
  private ktHilfeDa(e: Einsatz): void {
    for (const fz of Object.values(this.state.fahrzeuge)) {
      if (fz.kt?.wartetAuf !== e.id) continue;
      const plan = fz.kt;
      plan.wartetAuf = null;
      const k = plan.wartetKt ? this.ktAuftrag(plan.wartetKt) : undefined;
      if (k && k.status === "anBord") {
        k.status = "erledigt";
        this.ktLog(k, `Patient an ${e.nummer} übergeben`);
      }
      fz.phaseEnde = this.state.zeit + rnd(3, 8) * MIN;
    }
  }

  private ktFahrtWeiter(fz: SimFahrzeug): void {
    fz.phaseEnde = this.state.zeit;
  }

  /** Alle Einsätze und Fahrzeugzustände zurücksetzen. */
  reset(): void {
    this.state.einsaetze = [];
    this.state.funk = [];
    this.state.kt = [];
    this.state.ktDauerTag = undefined;
    for (const fz of Object.values(this.state.fahrzeuge)) {
      Object.assign(fz, {
        lat: fz.heim.lat,
        lon: fz.heim.lon,
        status: "freiWache",
        phase: "frei",
        phaseEnde: null,
        einsatzId: null,
        fahrt: null,
        begleitet: false,
        kt: null,
      });
    }
    this.planGenerator(true);
    this.emit();
  }
}

export const sim = new Simulation();
