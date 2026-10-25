/**
 * Simulationskern: Uhr, Fahrzeuge, Einsätze, Funkmeldungen.
 *
 * Der Zustand besteht nur aus einfachen Objekten, damit er später im Multiplayer
 * vom Host an die Mitspieler übertragen werden kann. Alle Eingriffe des Spielers
 * laufen über die öffentlichen Methoden (alarmieren, Adresse setzen, …).
 */
import { rufnamen } from "./funkname";
import { aktuelleSchicht, dienstEnde, imDienst, naechsterBeginn, type Schicht } from "./dienst";
import { nachKlick } from "../klick";
import { ACTIVE_CATEGORIES, bereicheVon, khAnkunft, khLandung, type Hospital, type Vehicle, type Zufahrt } from "../data/model";
import { bestesKh, buchung, buchungName, eignung as khEignung, khVorschlaege, type KhVorschlag } from "../data/klinik";
import { grundbelegungTick, platzFuer, RESSOURCE, ressourcenFuer, type BelegungMap } from "./khStatus";
import { verdachtFuer } from "./verdacht";
import { store } from "../data/store";
import { streuung } from "../data/schema";
import { ACN_CODES, allCodes, findCode, hasCodes, istAcnCode, type Einsatzcode } from "./codes";
import { distanceM, erreichbar, flightRoute, geoStatus, randomAddresses, route, searchAddress, travelTimes, type LatLon, type Route } from "./geo";
import { generiereBesetzung, hatNFS, hoechsteQuali, rang, rmTypVon, type Platz, type Quali, type RmTyp } from "./crew";
import { defaultStufeFuer, raenge, stufeRaten, type Kategorie, type Settings, type StatusKey, type StufeDef } from "./settings";
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
  echtBei,
  type EchtStunde,
  type PrognoseStunde,
  type Wetter,
  type WetterLage,
  type WetterOpt,
  type WetterWerte,
} from "./weather";
import { bestimmeCode, fallZiehen, kapitelVonCode, wahrheitFuer, type Antworten, type Schema } from "../abfrage/schema";
import { anruferWaehlen, flughafenAnrufer, ortKandidaten, veraenderungText, zufallsName, type Anrufer } from "../abfrage/anrufer";
import { personaWaehlen } from "../abfrage/persona";
import { alleOrte, kategorienFuerOrtArt, ortGewicht, ortKategorie, poiKategorien } from "../data/orte";
import { ortAnStelle, ortPartner } from "../data/ortProfile";
import { ortRegeln } from "../abfrage/ortRegeln";
import { katKtOffen, katOffen, ortArtOffen } from "../data/ortZeiten";
import { stellen, stellenInGruppe, stellenLaden, stelleBeschreibung, type Einsatzstelle } from "../data/einsatzstellen";
import { bezugFuer, fuellen, ORT_IM_FREIEN, stimmungAusVerlauf, szenarioBauen, altersPlausibel, sichtUnbekannt, vorlageFest, vorlageWaehlen, type AnruferTyp, type OrtArt, type OrtModus, type Szenario } from "../abfrage/szenario";

/** Einsatzorte, die eine echte Einrichtung brauchen (sonst ruft z. B. eine Pflegekraft aus einem Wohnhaus an) */
/** Orte, die es im Gebiet geben muss (Einrichtung als POI bzw. Strecke/Fläche als Einsatzstelle) */
const ORT_NUR_MIT_POI: OrtArt[] = ["pflegeheim", "arzt", "schule", "bahnhof", "landstrasse", "autobahn", "feldweg", "wald", "berg", "ufer", "feld"];
/** Einsatzstellen ohne Hausnummer in der Nähe: Strecken und Flächen */
const STELLE_FLAECHE = new Set(["autobahn", "landstrasse", "feldweg", "radweg", "wald", "berg", "ufer", "weinberg", "feld", "hochstand", "kletterfels", "klettersteig"]);
/** Wie oft ein Fall an einem echten Ort (POI) spielt, wenn er auch woanders passieren kann */
const POI_ANTEIL: Partial<Record<OrtArt, number>> = { strasse: 0.25 };
/** Flughafen-Fälle pro Tag (bei normalem Aufkommen) – selten */
const FLUGHAFEN_PRO_TAG: [FlughafenArt, number][] = [
  ["landung", 0.6],
  ["flugzeug", 0.8],
  ["personal", 0.8],
];
/** Krankheitsbild, wie es die Crew bzw. die Kollegen melden */
const FLUG_BILD: Record<string, string> = {
  brustschmerz: "starke Brustschmerzen",
  schwangerschaft: "Wehen, die Geburt hat eingesetzt",
  schlaganfall: "Verdacht auf Schlaganfall",
  atemnot: "schwere Atemnot",
  bewusstlos: "ist zusammengebrochen",
  krampf: "hatte einen Krampfanfall",
  allergie: "allergische Reaktion",
  zucker: "Unterzucker, ist Diabetiker",
  krank: "fühlt sich sehr schlecht",
  sturz: "ist gestürzt",
  eingeklemmt: "ist eingeklemmt",
  verletzung: "hat sich verletzt",
  blutung: "blutet stark",
  hitze_kaelte: "Kreislaufprobleme",
  gefahrstoff: "Kontakt mit Gefahrgut",
  ruecken: "starke Rückenschmerzen",
  herz: "Herzprobleme",
};

/** Meldung der Flughafen-Leitstelle (nur, was gemeldet wurde) */
function flughafenMeldung(art: FlughafenArt, ortName: string, f: Fall, flug: Flug | null, flugNr: string, th: string): { meldung: string; bekannt: string[]; unbekannt: string } {
  const a = f.antworten;
  const alter = typeof a.alter === "number" ? a.alter : null;
  const w = a.geschlecht === "w";
  const person = alter !== null && alter < 14 ? `ein Kind, etwa ${Math.max(1, Math.round(alter))} Jahre` : `${w ? "eine Frau" : "ein Mann"}${alter !== null ? `, etwa ${Math.round(alter / 5) * 5} Jahre` : ""}`;
  const reanimiert = a.at === "keine" || a.at === "agonal";
  const bw = reanimiert ? "atmet nicht normal, die Crew reanimiert" : a.bw === "nein" ? "reagiert nicht" : a.bw === "getruebt" ? "ist nur eingetrübt ansprechbar" : "ist wach";
  const bild = reanimiert ? "" : (FLUG_BILD[th] ?? "medizinischer Notfall");
  const zustand = [bild, bw].filter(Boolean).join(", ");
  if (art === "landung" && flug) {
    return {
      meldung: `Angekündigter Notfall an Bord von Flug ${flug.nummer} aus ${flug.von}: ${person}, ${zustand}. Landung voraussichtlich um ${hhmm(flug.landung)} auf Piste ${flug.piste}, das Flugzeug rollt dann auf die Abstellposition für Notfälle am Werft-Vorfeld. Bitte schicken Sie die Rettung zum Warteort bei der Feuerwehr-Wache 1.`,
      bekannt: ["bw", "at", "alter", "geschlecht"],
      unbekannt: "Das hat uns die Crew nicht gemeldet.",
    };
  }
  if (art === "flugzeug") {
    return {
      meldung: `Notfall an Bord von Flug ${flugNr}, ${ortName.replace(/^Flugzeug /, "Flugzeug ")}: ${person}, ${zustand}. Die Crew ist beim Patienten.`,
      bekannt: ["bw", "at", "alter", "geschlecht"],
      unbekannt: "Das hat uns die Crew nicht gemeldet.",
    };
  }
  return {
    meldung: `Notfall beim Personal, ${ortName}: ${person}, ${zustand}. Kollegen sind beim Verletzten und zeigen den Weg.`,
    bekannt: ["bw", "at", "alter", "geschlecht", "blutung", "eingeklemmt", "verletzung", "sturz", "hoehe", "schmerz"],
    unbekannt: "Das wissen wir nicht, das können die Kollegen vor Ort sagen.",
  };
}
import { SZENARIEN } from "../abfrage/szenarien";
import { ist, kapitelFuerThema, kapitelZuThema, merkmaleAusSchema, merkmaleInSchema, thema } from "../abfrage/themen";
import { istZusammengesetzt, wahrheitAnpassen } from "../abfrage/normalisieren";
import { abfrageBlock, abfrageSaetze } from "../abfrage/protokollText";
import {
  dauerDaten,
  hhmm,
  hotlineAnrufer,
  khOrt,
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
import { amFlughafen, flugPlanen, HEALTH_CENTER, istFlughafenFz, istFlughafenZiel, kontrolleSek, MEDICAL_CENTER, mitKontrolle, NOTFALL_STAND, WARTEORT, type Flug } from "./flughafen";
import { PARTNER, PARTNER_ANZAHL, partnerArtVonTyp, partnerNoetig, partnerSchonDa, type PartnerArt, type PartnerGrund } from "./partner";
import { FUNKGRUPPEN, funkgruppe, inFunkgruppe, mitteVon, type Funkgruppe } from "./funkgruppen";
import { echtwetterLaden } from "./echtwetter";
import { sekZufall } from "./sek";
import { bedarf, ereignisseEinplanen, istStillstand, lageAusFall, lageErzeugen, lagemeldungText, patientText, rtwBedarf, type Lage } from "./lage";
import { anleitungAus, fallVariante, fallVorlage, fallWaehlen, varianteWaehlen, type FallVariante } from "../abfrage/faelle";
import { nachrichtArt } from "../abfrage/runde";

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
  /** Gewalt/Waffen: Fahrt in den Bereitstellungsraum und Warten dort, bis die Polizei den Einsatzort sichert */
  | "bereitstellung"
  | "wartetBR"
  | "ktFahrt"
  | "ktHalt"
  | "ktReinigung"
  /** Rendezvous: Fahrt zum Treffpunkt mit dem NEF bzw. Warten/Übergabe dort */
  | "rendezvous"
  | "treffpunkt"
  /** NEF: Fahrt ins Krankenhaus, um den Notarzt abzuholen, und Warten, bis er eingestiegen ist */
  | "naAbholung"
  | "naEinstieg";

/** Art des Fahrzeugs aus den Stammdaten: Anzeige-Typ, Großraum, ohne Blaulicht */
function fzArt(v: Vehicle, rmTyp: RmTyp): { typ: string; gross: boolean; ohneBlaulicht: boolean; ersatzFuer?: string; modell: string } {
  const typ = (v.typ || rmTyp).trim();
  const istKtwB = /^KTW-?B$/i.test(typ.replace(/\s+/g, ""));
  const gross = v.aufbau ? v.aufbau === "gross" : rmTyp === "RTW-C";
  const ersatzFuer = v.ersatzFuer?.trim() || undefined;
  return {
    typ: istKtwB ? "KTW-B" : rmTyp === "RTW-C" ? "RTW-C" : rmTyp === "RTW" ? "RTW" : rmTyp === "NEF" && ersatzFuer ? "NEF ÖAMTC" : typ,
    gross,
    ohneBlaulicht: istKtwB,
    ersatzFuer,
    modell: modellVon(v, rmTyp, gross, typ, ersatzFuer),
  };
}

/** 3D-Modell eines Fahrzeugs */
export function modellVon(v: Pick<Vehicle, "funkrufname" | "modell">, rmTyp: RmTyp, gross: boolean, typ: string, ersatzFuer?: string): string {
  const zufall = (a: string, b: string) => (streuung(`${v.funkrufname}#modell`) < 0.5 ? a : b);
  switch (rmTyp) {
    case "RTW":
    case "RTW-C":
      return gross || rmTyp === "RTW-C" ? "crafter" : "t6hoch";
    case "KTW":
      return v.modell === "t6hoch" || v.modell === "sprinter_kurz" ? v.modell : zufall("t6hoch", "sprinter_kurz");
    case "NEF":
      return ersatzFuer || /ÖAMTC|OEAMTC/i.test(typ) ? "tiguan" : "t6";
    case "BEL":
      return v.modell === "passat" || v.modell === "t6" ? v.modell : zufall("passat", "t6");
    case "EL ÖBB":
      return "caddy";
    case "SKTW":
      return "sprinter_lang";
    case "SRTW":
    case "SNAW":
      return "sprinter_gross";
    case "NAW":
      return "crafter";
    case "BIT":
      return "man";
    case "NAH":
    case "ITH":
      return "ec135";
    case "ACN":
      return "passat";
    default:
      return "t6hoch";
  }
}

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
  /** Spielzeit der letzten Alarmierung (NEF rückt bei gleichzeitiger Alarmierung nach dem RTW aus) */
  alarmUm?: number;
  /** Blaulicht an (Fahrt mit Sondersignal; bleibt am Einsatzort an, wenn mit Blaulicht angefahren) */
  blaulicht?: boolean;
  /** Typ zur Anzeige (z. B. „KTW-B“, „RTW“) */
  typ?: string;
  /** Großraum-Fahrzeug (VW Crafter) */
  gross?: boolean;
  /** KTW-B (Zivildienst): fährt ohne Blaulicht */
  ohneBlaulicht?: boolean;
  /** laufende Schicht (Kennung) – ändert sich beim Schichtwechsel */
  schicht?: string | null;
  /** laut Dienstplan nicht im Dienst */
  ausserDienst?: boolean;
  /** echtes Dienstende (für den Hinweis eine Stunde vorher) */
  dienstEnde?: number | null;
  /** außer Dienst: nächster Dienstbeginn */
  dienstBeginn?: number | null;
  /** Schichtwechsel bzw. Dienstende fällig, aber noch nicht auf der Dienststelle (gewechselt wird nur dort) */
  wechselOffen?: "wechsel" | "ende" | null;
  /** über der Dienstzeit für diesen Einsatz vorgemerkt – wird erst nach dem Anfunken alarmiert */
  ueberzeitFuer?: string | null;
  /** Ersatz-NEF eines Hubschraubers (dessen Funkrufname): nur angemeldet, wenn der nicht fliegen kann */
  ersatzFuer?: string;
  /** NEF: Notarzt wird in diesem Krankenhaus abgeholt (ID) */
  naAbholung?: string;
  /** Notarzt sitzt im NEF (abgeholt) */
  naAnBord?: boolean;
  /** nach dem Abholen: eigentliches Ziel */
  nachNa?: { ziel: LatLon; phase: Phase; blau: boolean } | null;
  /** Rückfahrt bringt zuerst den Notarzt ins Krankenhaus */
  naZurueck?: boolean;
  /** Besatzung zu Fuß unterwegs (Fahrzeug steht auf der Straße, Patient abseits) */
  fuss?: Fussweg | null;
  /** eigentliches Ziel der Fahrt (Haus/Patient), wenn das Fahrzeug auf der Straße davor stehen bleibt */
  fussZiel?: LatLon | null;
  /** 3D-Modell (t6hoch, crafter, t6, tiguan, passat, caddy, sprinter_kurz/_lang/_gross, man, ec135) */
  modell?: string;
  /** Hubschrauber vom Spiel abgemeldet, weil er nicht fliegen kann (meldet sich bei Flugwetter wieder an) */
  flugAbgemeldet?: boolean;
  /** Spieler-NAH: wird von einem Mitspieler geflogen (das Programm wartet auf seine Status und Entscheidungen) */
  pilot?: PilotInfo | null;
  /** Krankentransport-Plan (vorgemerkte bzw. laufende Fahrten) */
  kt?: (KtPlan & { reinigen?: boolean; wartetAuf?: string | null; wartetKt?: string | null; wartetSeit?: number | null }) | null;
}

/** Was der Pilot am Berufungsort mit dem Patienten vorhat */
export type PilotPlan =
  /** selbst transportieren, Ziel frei gewählt (wird immer genehmigt) */
  | { art: "transport"; hospitalId: string }
  /** Patient an den RTW übergeben (mit oder ohne Notarzt im RTW) */
  | { art: "uebergabe"; naMit: boolean }
  /** kein Transport: Patient bleibt vor Ort, Revers oder verstorben */
  | { art: "kein"; grund: "kein" | "revers" | "tot" };

/** Spieler-NAH: ein Mitspieler fliegt diesen Hubschrauber über das Piloten-Interface */
export interface PilotInfo {
  pid: string;
  name: string;
  /** Spielzeit der Übernahme */
  seit: number;
  /** nicht verbunden seit (echte Zeit, ms) – nach einer Minute übernimmt wieder der Computer */
  offlineSeit?: number | null;
  /** Entscheidung am Berufungsort */
  plan?: PilotPlan | null;
  /** Übungsflug ohne Flugsimulator: Ziel des laufenden Flugs */
  flugZiel?: string | null;
  /** zuletzt aus dem Flugsimulator: Höhe/über Grund (Fuß), Kurs, Knoten, am Boden, Triebwerk; um = echte Zeit (ms) */
  sim?: PilotSimDaten | null;
  /** Pilot erlaubt den Zeitraffer (steht am Berufungsort oder Krankenhaus am Boden) */
  zeitOk?: boolean;
}

export interface PilotSimDaten {
  hoehe: number;
  agl: number;
  kurs: number;
  kts: number;
  amBoden: boolean;
  motor: boolean;
  um: number;
}

/** Daten aus dem Flugsimulator gelten so lange als aktuell (echte Zeit) */
export const PILOT_SIM_FRISCH_MS = 10_000;

/** Status, die der Pilot selbst drückt (Ziffern wie beim RTW) */
export const PILOT_STATUS: StatusKey[] = ["alarmiert", "zumBO", "amBO", "zumZO", "amZO", "freiFunk", "freiWache"];

/** Nach so langer Zeit ohne Verbindung übernimmt der Computer den Hubschrauber wieder */
export const PILOT_OFFLINE_MS = 60_000;

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
  /** genaue Kategorie des echten Ortes (Freibad, Bahnhof, Tierpark …) */
  ortKat?: string;
  /** der Ort hat gerade zu – es passiert draußen davor */
  geschlossen?: boolean;
  /** Fall aus dem Fallkatalog (faelle.ts) mit der gezogenen Variante */
  katalog?: { id: string; variante: string };
  /** Wahrheit, die das Schema nicht abfragen kann (z. B. Schnappatmung bei „atmet normal: ja/nein“) – für Anrufer und Lage */
  roh?: Antworten;
}

/** So heißt der Ort beim Anrufer */
const ORT_LABEL: Record<OrtArt, string> = {
  wohnung: "Wohnung",
  haus: "Einfamilienhaus",
  garten: "Garten",
  pflegeheim: "Pflegeheim",
  strasse: "Straße / Gehsteig im Ort",
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
  landstrasse: "Landstraße (außerorts)",
  autobahn: "Autobahn / Schnellstraße",
  feldweg: "Feld-, Forst- oder Radweg",
  wald: "im Wald",
  berg: "am Berg",
  ufer: "am Fluss- oder Seeufer",
  feld: "auf dem Feld / im Weingarten",
};

/** Name einer unauffälligen Stelle: „Bahnübergang an der L14“, „Brücke B32 über Kamp“, „Kellergasse Bühl“ */
function stellenName(kat: string, name: string): string {
  const n = name.includes("_") ? "" : name.trim();
  const art = kat === "kellergasse" ? "Kellergasse" : (ortKategorie(kat)?.label ?? kat).split(" / ")[0];
  if (!n) return art;
  if (n.toLowerCase().includes(art.toLowerCase().slice(0, 6))) return n;
  if (kat === "bahnuebergang" || kat === "kreisverkehr") return `${art} an der ${n}`;
  return `${art} ${n}`;
}

/** Gemeinde aus einer Adresse („Hauptstraße 3, 3500 Krems“ → „Krems“) */
function gemeindeVon(adresse: string): string {
  const m = adresse.match(/\d{4}\s+([^,()]+)/) ?? adresse.match(/,\s*([^,()]+)\s*$/);
  return (m?.[1] ?? "").trim() || "dem Ort";
}

/**
 * Fall eines anderen Kapitels als Anforderung durch Arzt/Pflege (Kapitel 33) ausdrücken:
 * Hauptbeschwerde → „Grund der Anforderung“, Zustand und Patient bleiben gleich.
 */
function alsAnforderung33(schema: Schema, f: Fall): Fall | null {
  const k33 = kapitelZuThema("anforderung_arzt", schema);
  if (!k33) return null;
  const a = f.antworten;
  const GRUND: Record<string, string> = { brustschmerz: "herz", herz: "herz", atemnot: "atmung", schlaganfall: "neuro", zucker: "bz", blutung: "blutung", sturz: "sturz" };
  const t = thema(f.kapitel, schema);
  let grund = GRUND[t] ?? "transport";
  if (a.bw === "nein" || a.bw === "getruebt") grund = grund === "transport" ? "bewusstsein" : grund;
  if (t === "sturz" && a.umstand && !/boden/.test(String(a.umstand))) grund = "transport";
  const fest: Antworten = { anforderer: "normal", grund };
  for (const id of ["alter", "geschlecht", "bw", "at", "anzahl_patienten"]) if (a[id] !== undefined) fest[id] = a[id];
  if (grund === "transport") {
    fest.dringlichkeit = "sofort";
    fest.transportart = a.bw === "ja" && a.at === "normal" ? "sitzend" : "liegend";
  }
  const z = fallZiehen(schema, k33, Math.random, 0, fest);
  if (!z || z.ergebnis.pfad[0] !== k33) return null;
  return { ...f, kapitel: k33, antworten: z.antworten, code: z.ergebnis.code };
}

/** Medizinisch plausibel? (z. B. keine Geburt mit 60, keine Schwangerschaft beim Mann) */
export function plausibel(kapitel: string, a: Antworten, codeName: string): boolean {
  const alter = typeof a.alter === "number" ? a.alter : null;
  const schwanger =
    thema(kapitel) === "schwangerschaft" ||
    a.problem === "geburt" ||
    (a.schwanger !== undefined && a.schwanger !== "nein" && a.schwanger !== "unbekannt") ||
    /schwanger|geburt|eklampsie|wehen|fruchtwasser|postpartal|entbind/i.test(codeName);
  if (schwanger && (a.geschlecht === "m" || (alter !== null && (alter < 14 || alter > 46)))) return false;
  if (/\bMann\b|Hoden|Prostata/.test(codeName) && a.geschlecht === "w") return false;
  if (/\bFrau(en)?\b/.test(codeName) && a.geschlecht === "m") return false;
  return true;
}

/** Themen für einen neuen Fall – häufige Notrufe öfter, Alpinunfälle selten */
const THEMA_GEWICHT: Record<string, number> = {
  sturz: 3, krank: 3, brustschmerz: 2.5, atemnot: 2.5, schlaganfall: 2, bewusstlos: 2, verkehrsunfall: 2, krampf: 1.5, blutung: 1.5, bauch: 1.5, kopfschmerz: 1.5, stillstand: 1.2, alpin: 0.15, anforderung_ls: 0.3, ecall: 0.3,
};
/** Wetter macht manche Notrufe häufiger: Hitze → Hitzenotfälle, Badeunfälle; Kälte → Unterkühlung, Infekte; Glätte → Stürze, Unfälle */
export function wetterFaktor(kap: string, temp: number, lage: WetterLage, wind = 0): number {
  const art = lageArt(lage);
  const glatt = lage === "eisregen" || (temp < 1 && (art === "schnee" || art === "regen" || art === "nebel"));
  const sturm = wind >= 45 || lage === "unwetter";
  const nass = art === "regen" || art === "gewitter";
  switch (thema(kap)) {
    case "hitze_kaelte":
      return temp >= 30 ? 6 : temp >= 26 ? 3 : temp <= -5 ? 5 : temp <= 0 ? 3 : temp <= 5 ? 1.2 : 0.15;
    case "wasser":
      return temp >= 28 ? 3.5 : temp >= 23 ? 2 : temp < 12 ? 0.3 : 1;
    case "allergie":
      return temp >= 20 ? 1.6 : temp < 5 ? 0.6 : 1;
    case "tierbiss":
      return temp >= 18 ? 1.3 : temp < 3 ? 0.7 : 1;
    case "gefahrstoff":
      return temp <= 0 ? 2.2 : temp <= 6 ? 1.5 : 0.8;
    case "atemnot":
      return (temp <= 0 ? 1.5 : temp >= 30 ? 1.3 : 1) * (lage === "hochnebel" ? 1.3 : 1);
    case "infekt":
      return temp <= 5 ? 2.2 : temp >= 22 ? 0.4 : 1;
    case "krank":
    case "bewusstlos":
      return temp >= 30 ? 1.5 : temp >= 27 ? 1.2 : 1;
    case "sturz":
      return (lage === "eisregen" ? 3 : glatt ? 1.8 : 1) * (sturm ? 1.3 : 1);
    case "verletzung":
      return sturm ? 1.6 : glatt ? 1.3 : 1;
    case "verkehrsunfall":
      return (lage === "eisregen" ? 2.6 : glatt ? 2 : lage === "nebel" ? 1.5 : lage === "starkregen" || lage === "unwetter" ? 1.5 : nass ? 1.3 : 1) * (sturm ? 1.3 : 1);
    case "strom":
      return art === "gewitter" ? 6 : 1;
    default:
      return 1;
  }
}

function kapitelZiehen(schema: Schema, faktor: (kap: string) => number = () => 1): string {
  const kaps = Object.keys(schema.kapitel);
  const g = (k: string) => (THEMA_GEWICHT[thema(k, schema)] ?? 1) * faktor(k);
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
  if (thema(kap) === "hitze_kaelte" || /Hitze|Kälte|Unterkühl|Erfrier|Sonnenstich/i.test(codeName)) {
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
  /** von der KI formuliert („ki“) oder fester Text („fest“) */
  quelle?: "ki" | "fest";
}

/**
 * Satz, den eine Besatzung als Nächstes sagt. Den Inhalt bestimmt das Programm (fest);
 * formuliert wird er von der KI beim Gesprächsführer – kommt bis `bis` (echte Zeit) nichts, gilt der feste Text.
 */
export interface FunkAusstehend {
  /** wer spricht (Rufname) */
  von: string;
  art: FunkAnliegen | "antwort" | "frage" | "satz";
  /** ganzer fester Funkspruch („Hier 75/001, …, kommen“) */
  fest: string;
  /** worauf geantwortet wird (Funkspruch der LEO bzw. der Gegenstelle) */
  frage?: string;
  /** Gegenstelle beim Funk zwischen zwei Fahrzeugen */
  an?: string;
  /** echte Zeit (ms), ab der der feste Text gesprochen wird */
  bis: number;
  /** passiert, wenn der Satz gesprochen ist */
  aktion?: "nefStorno";
}

export type FunkAnliegen = "lage" | "nachforderung" | "storno" | "kh" | "adresse" | "info";

/** Funkgespräch zwischen LEO und einem Fahrzeug (bzw. zwischen zwei Fahrzeugen, LEO hört mit) */
export interface FunkGespraech {
  id: number;
  fzId: string;
  funkname: string;
  einsatzId: string | null;
  /** wartet = Fahrzeug will funken, der Kanal ist belegt (oder es wird telefoniert); ruft = Fahrzeug ruft LEO;
   *  sprechwunsch = dreimal gerufen, keine Antwort; leoWartet = LEO will rufen, der Kanal ist belegt;
   *  leoRuft = LEO ruft das Fahrzeug; offen = verbunden; direkt = zwei Fahrzeuge funken miteinander;
   *  mithoeren = ein Fahrzeug fragt, ob LEO mitgehört hat */
  status: "wartet" | "ruft" | "sprechwunsch" | "leoWartet" | "leoRuft" | "offen" | "ende" | "direkt" | "mithoeren";
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
  /** Funk von Fahrzeug zu Fahrzeug: Gegenstelle (fzId/funkname = wer ruft) */
  an?: { fzId: string; funkname: string } | null;
  /** noch zu sprechende Sätze (Funk von Fahrzeug zu Fahrzeug) */
  ablauf?: FunkSatz[];
  /** am Ende fragt dieses Fahrzeug, ob LEO mitgehört hat (Wiederholung) */
  mithoeren?: { von: string; text: string } | null;
  /** Funk läuft in echter Zeit: letzter Funkspruch bzw. nächster Schritt (ms) */
  echtLetzt?: number;
  echtNaechster?: number | null;
  /** seit wann das Fahrzeug funken will (echte Zeit, für die Reihenfolge) */
  echtSeit?: number;
  /** nächster Satz der Besatzung (wird gerade formuliert) */
  ausstehend?: FunkAusstehend | null;
  /** wartet, weil telefoniert wird (Hinweiston) */
  wegenTelefon?: boolean;
  /** LEO will rufen (Kanal war belegt): Anruf und gleich danach diese Durchsage */
  leoRuf?: { text: string; nachricht?: string } | null;
  /** das Anliegen des Fahrzeugs ist schon durchgegeben */
  anliegenGesagt?: boolean;
}

/** Satz im Funk zwischen zwei Fahrzeugen; aktion passiert, wenn er gesprochen ist */
export interface FunkSatz {
  von: string;
  text: string;
  aktion?: "nefStorno";
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
    /** Verdachtsdiagnose (Buchungs-ID) – ergibt sich erst beim Patienten */
    verdacht?: string;
    /** Fallkatalog: Transportverweigerung geprüft bzw. Revers unterschrieben */
    reversGeprueft?: boolean;
    revers?: boolean;
    /** veraltet (ältere Spielstände) */
    abteilung?: string;
    rtwBuchtSelbst: boolean;
    /** Wahrheit für den Anrufer (Abfrageschema) */
    abfrage?: {
      kapitel: string;
      antworten: Antworten;
      code: string;
      anrufer: Anrufer;
      lage: string;
      ortUnbekannt?: boolean;
      szenario?: Szenario;
      verlauf?: string[];
      /** was der Anrufer auf Anweisung schon macht (Seitenlage, Druck auf die Wunde …) */
      massnahmen?: string[];
      /** Stimmung im Gespräch (0 ruhig … 3 panisch) und wie viele Veränderungen schon eingerechnet sind */
      stimmung?: { stufe: number; verlauf: number; beruhigt: boolean };
      /** genauere Wahrheit, als das Schema abfragen kann (fremdes Codesystem) */
      roh?: Antworten;
    };
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
  /** grund = Buchung (Verdachtsdiagnose, ID aus klinik.json) */
  kh: { hospitalId: string; grund: string; durch: "dispo" | "rtw" | "nah"; zeit: number } | null;
  /** Besatzung bittet um Buchung und nennt die Verdachtsdiagnose */
  khAnfrage: { verdacht: string; seit: number; von: string } | null;
  /** von der Besatzung genannte Verdachtsdiagnose (sichtbar) */
  verdacht?: string | null;
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
  /** Einsatz einer Nachbarzone (vom Kollegen dort angelegt und disponiert) */
  fremd?: { zone: string; rtwText?: string };
  /** BIT kam nicht: Besatzung transportiert selbst */
  bitVerzicht?: boolean;
  /** zuletzt ins Protokoll geschriebene Abfrage (Erstaufnahme, Änderungen) */
  abfrageStand?: { antworten: Antworten; kapitel: string | null; code: string | null } | null;
  /** alarmierte Partner-Organisationen (Zeitpunkt der Alarmierung) */
  partner?: Partial<Record<PartnerArt, number>>;
  /** erstes Fahrzeug der Organisation am Einsatzort (Zeitpunkt) */
  partnerDa?: Partial<Record<PartnerArt, number>>;
  /** Bereitstellungsraum (Gewalt/Waffen): Rettungsdienst wartet dort, bis die Polizei den Einsatzort sichert */
  br?: Ort | null;
  /** Polizei hat den Einsatzort gesichert (Zeitpunkt) bzw. meldet ihn gesichert um … */
  boSicher?: number | null;
  boSicherUm?: number | null;
  /** Lagemeldung kommt ein paar Minuten nach dem Eintreffen */
  lageGeplant?: { um: number; fzId: string; angefordert: boolean; erstes: boolean } | null;
  /** zuletzt an fehlende Partner erinnert */
  partnerErinnert?: number;
  /** Rendezvous: RTW fährt dem (zu weit entfernten) NEF entgegen, Treffpunkt unterwegs */
  rendezvous?: { rtwId: string; nefId: string; punkt: Ort; status: "anfahrt" | "treffen" | "fertig"; bis?: number | null } | null;
  /** Besatzung hat gefragt, ob der Hubschrauber verfügbar ist (Rufname, z. B. „C2“) – LEOs Antwort wird verstanden */
  heliFrage?: string | null;
  /** Flughafen: Patient im Medical Center, Überstellung (KT-Auftrag) ins passende Klinikum angelegt */
  mcUeberstellung?: string | null;
  /** Flughafen-Fall (die Flughafen-Leitstelle ruft an): Art, Ort und bei angekündigten Notfällen der Flug */
  flughafen?: { art: FlughafenArt; ortKat: string; flug?: Flug | null } | null;
}

export type FlughafenArt = "landung" | "flugzeug" | "personal";

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
  /** Fahrzeuge von Feuerwehr, Polizei, Berg- und Wasserrettung im Einsatz */
  partnerFz?: PartnerFz[];
  /** Belegung der Akut-Plätze in den Krankenhäusern */
  khBelegung?: BelegungMap;
  khGrundZeit?: number;
  partnerZaehler?: number;
  /** Statusänderungen aller Fahrzeuge (neueste zuletzt, begrenzt) */
  statusLog?: StatusEintrag[];
  /** Multiplayer: Lobby auf der Startseite offen (Mitspieler warten, bis der Host startet) */
  lobby?: boolean;
  /** echtes Wetter (stündlich, aus dem Internet) – nur wenn eingestellt */
  wetterEcht?: EchtStunde[];
  /** Stand beim Laden des echten Wetters (für die Anzeige) */
  wetterEchtStand?: { ok: boolean; text: string };
}

/** Eine Statusänderung (für den Reiter „Statusänderungen“) */
export interface StatusEintrag {
  zeit: number;
  fzId: string;
  funkrufname: string;
  von: StatusKey;
  nach: StatusKey;
  /** Einsatznummer bzw. KT-Auftrag, falls im Einsatz */
  einsatz?: string;
  /** warum (Dienstende, Flugwetter, von Hand …) */
  grund?: string;
}

/** Fahrzeug einer Partner-Organisation (nur im Einsatz vorhanden; transportiert nie Patienten) */
export interface PartnerFz {
  id: string;
  art: PartnerArt;
  name: string;
  einsatzId: string;
  station: string;
  heim: LatLon;
  lat: number;
  lon: number;
  fahrt: Fahrt | null;
  blaulicht: boolean;
  phase: "ausruecken" | "anfahrt" | "bereitstellung" | "wartetBR" | "vorOrt" | "begleitung" | "amKH" | "rueckfahrt" | "routing";
  phaseEnde: number | null;
  /** Feuerwehr bleibt nach dem Rettungsdienst noch eine Weile */
  bleibtBis?: number | null;
  /** Polizei begleitet dieses Rettungsmittel ins Krankenhaus */
  begleitet?: string;
}

export const PARTNER_PHASE_TEXT: Record<PartnerFz["phase"], string> = {
  ausruecken: "rückt aus",
  routing: "Anfahrt",
  anfahrt: "Anfahrt",
  bereitstellung: "Anfahrt Bereitstellungsraum",
  wartetBR: "im Bereitstellungsraum",
  vorOrt: "am Einsatzort",
  begleitung: "begleitet ins Krankenhaus",
  amKH: "im Krankenhaus",
  rueckfahrt: "rückt ein",
};

/** Befehle, die Spieler auslösen können (im Multiplayer laufen sie beim Host). */
/** Reiner Anruf bzw. Antwort auf einen Anruf („LEO von 75/001, kommen“, „Hier LEO, kommen“, „75/001 hört“) */
export function istRufSpruch(text: string): boolean {
  return /^([^,]+ von [^,]+,? kommen|Hier [^,]+,? kommen|[^,]{2,20} hört|Hier LEO,? (verstanden,? )?Ende|Hier LEO,? mitgehört,? Ende)\W*$/i.test(text.trim());
}

/** Fester Funkspruch einer Besatzung aus dem Inhalt („Hier 75/001 mit einer Lagemeldung, …, kommen“) */
export function festerSpruch(rufname: string, art: FunkAnliegen, inhalt: string): string {
  const t = inhalt.replace(/^Lagemeldung:\s*/i, "").replace(/[.,;\s]+$/, "");
  const kopf = /^Lagemeldung:/i.test(inhalt) || art === "lage" ? `Hier ${rufname} mit einer Lagemeldung` : `Hier ${rufname}`;
  return `${kopf}, ${t}, kommen`;
}

/** Messwerte (Sättigung, Blutdruck, Puls …) gehören nicht in Meldungen – nur auf Nachfrage */
export function ohneVitalwerte(text: string): string {
  return text
    .replace(/,?\s*(?:Sauerstoff)?(?:Sättigung|SpO2|SpO₂|SaO2|Blutdruck|RR|Puls|Herzfrequenz|HF|Blutzucker|BZ|Temperatur|Fieber|GCS|Atemfrequenz|AF|etCO2)\s*(?:von|bei|um)?\s*(?:ca\.?\s*|etwa\s*|unter\s*|über\s*)?\d+(?:[.,/]\d+)*(?:\s*(?:%|mmHg|mg\/dl|mmol|°C?|\/min|Grad))?/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .trim();
}

function funkZufall<T>(l: T[]): T {
  return l[Math.floor(Math.random() * l.length)];
}

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
    "funkMitgehoert",
    "funkRufen",
    "funkSenden",
    "funkTippt",
    "funkEnde",
    "storno",
    "partnerAnfordern",
  ],
  steuern: ["start", "pause", "setTempo", "generiere", "setWetter", "wetterUebernehmen", "neuPlanen", "reset", "generiereKt", "generiereSek", "neuesSpiel"],
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
  immer: ["chat", "funkFzAntwort"],
  /** Pilot (Spieler-NAH): jeder darf, geprüft wird, ob er diesen Hubschrauber fliegt */
  pilot: ["pilotUebernehmen", "pilotAbgeben", "pilotStatus", "pilotPlan", "pilotFliegen", "pilotPosition", "pilotZeit"],
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
/** Kurzer Funkname einer Partner-Dienststelle: „Freiwillige Feuerwehr Tulln“ → „FF Tulln“ */
function kurzName(name: string, art: PartnerArt): string {
  let n = name
    .replace(/Freiwillige Feuerwehr|Feuerwehr/i, "FF")
    .replace(/Bezirksfeuerwehrkommando/i, "BFKdo")
    .replace(/Polizeiinspektion|Polizei-Inspektion|Polizei/i, "PI")
    .replace(/Österreichische Wasserrettung|Wasserrettung/i, "WR")
    .replace(/Österreichischer Bergrettungsdienst|Bergrettung/i, "BR")
    .replace(/\s*-\s*Ortsstelle|\s*Ortsstelle|\s*Einsatzstelle/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) n = PARTNER[art].kurz;
  return n;
}

function versetzt(lat: number, lon: number, meter: number, grad: number): { lat: number; lon: number } {
  const r = (grad * Math.PI) / 180;
  const dLat = (meter * Math.cos(r)) / 111_320;
  const dLon = (meter * Math.sin(r)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}

/** Wahrscheinlichkeit je Kapitel, dass der Anrufer draußen ist und den Ort nicht genau kennt */
const ORT_UNBEKANNT: Record<string, number> = { alpin: 0.8, wasser: 0.4, verkehrsunfall: 0.2, sturz: 0.12, verletzung: 0.12, hitze_kaelte: 0.15, eingeklemmt: 0.15, tierbiss: 0.15, allergie: 0.08 };

/** Grobe Ortsbeschreibung, wie ein Anrufer ohne Adresse sie gibt (oder null = Adresse bekannt) */
function ortUnbekanntBeschreibung(kapitel: string, ort: string): string | null {
  const t = thema(kapitel);
  if (Math.random() >= (ORT_UNBEKANNT[t] ?? 0)) return null;
  const bei = ort.replace(/^.*,\s*/, "").replace(/^\d{4}\s+/, "") || "dem Ort";
  const varianten: Record<string, string[]> = {
    alpin: [`am Berg oberhalb von ${bei}, irgendwo am Wanderweg`, `im Wald über ${bei}, auf einem Steig, ich seh nur Bäume`, `auf einer Forststraße bei ${bei}, wir sind schon ewig gegangen`],
    wasser: [`am Wasser bei ${bei}, beim Ufer, da ist so ein Badeplatz`, `an der Donau bei ${bei}, irgendwo am Radweg`],
    verkehrsunfall: [`auf der Landstraße bei ${bei}, kurz nach dem Ortsende`, `auf der Straße zwischen ${bei} und dem nächsten Ort, bei einer Kurve`],
  };
  const allgemein = [`auf einem Feldweg bei ${bei}`, `im Wald bei ${bei}, beim Weg`, `am Radweg bei ${bei}, zwischen den Feldern`];
  return pick(varianten[t] ?? allgemein);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

/** Fußweg der Besatzung vom Fahrzeug zum Patienten und zurück (Zeiten in Spielzeit-ms bzw. Sekunden) */
export interface Fussweg {
  park: LatLon;
  ziel: LatLon;
  /** Länge in Metern */
  m: number;
  ab: number;
  hinSek: number;
  zurueckSek: number;
  /** Rückweg beginnt (gesetzt, sobald die Besatzung zum Fahrzeug zurückgeht) */
  zurueckAb?: number;
}

/** Gehgeschwindigkeit in m/s: mit Ausrüstung hin, mit Patient (Trage/Tragesessel) zurück */
const GEHEN = 1.1;
const TRAGEN = 0.7;
/** ab dieser Entfernung meldet die Besatzung den Fußweg */
const FUSS_MELDEN_M = 300;
/** Fahrten, nach denen das Fahrzeug auf der Straße stehen bleibt (nicht ins Haus fährt) */
const AN_STRASSE = new Set<Phase>(["anfahrt", "ktFahrt"]);

/**
 * Route endet auf der Straße: das letzte Stück (Straße → Haus, quer durchs Gelände) fällt weg,
 * das Fahrzeug hält am nächsten Punkt der letzten Straße.
 */
export function anStrasse(r: Route): Route {
  const c = r.coords;
  const n = c.length;
  if (n < 3) return r;
  const ziel = c[n - 1];
  const b = c[n - 2];
  // ohne echte letzte Straßenkante (nur Zubringer): am letzten Straßenknoten halten
  if (n < 4) return { ...r, coords: c.slice(0, n - 1), times: r.times.slice(0, n - 1), duration: r.times[n - 2] };
  const a = c[n - 3];
  const kx = Math.cos((b[1] * Math.PI) / 180);
  const dx = (b[0] - a[0]) * kx;
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const k = l2 > 0 ? Math.min(1, Math.max(0, ((ziel[0] - a[0]) * kx * dx + (ziel[1] - a[1]) * dy) / l2)) : 1;
  const p: [number, number] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const tp = r.times[n - 3] + (r.times[n - 2] - r.times[n - 3]) * k;
  return { ...r, coords: [...c.slice(0, n - 2), p], times: [...r.times.slice(0, n - 2), tp], duration: tp };
}

/** Einsatzaufkommen (Startseite): ruhig / normal / stressig */
export const AUFKOMMEN_FAKTOR = { ruhig: 0.6, normal: 1, stressig: 1.6 } as const;

/** Fahrten, für die ein NEF den Notarzt an Bord braucht */
const NA_PHASEN = new Set<Phase>(["anfahrt", "bereitstellung", "rendezvous"]);

/** Rettungszufahrt des Krankenhauses, zu dem dieses Ziel gehört (Ziel = Haus oder Punkt P), sonst null */
export function khZufahrtBei(ziel: LatLon): Zufahrt | null {
  for (const h of store.list("hospitals")) {
    const z = h.zufahrt;
    if (z?.p && (distanceM(ziel, h) < 5 || distanceM(ziel, z.p) < 5)) return z;
  }
  return null;
}

/** Krankenhaus, dessen Mitte oder Punkt P dieses Ziel ist */
function khAmZiel(ziel: LatLon): Hospital | null {
  for (const h of store.list("hospitals")) if (distanceM(ziel, h) < 5 || (h.zufahrt?.p && distanceM(ziel, h.zufahrt.p) < 5)) return h;
  return null;
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
    // ältere Spielstände: Partner waren sofort vor Ort
    for (const e of st.einsaetze) {
      if (e.khAnfrage && !e.khAnfrage.verdacht) e.khAnfrage.verdacht = "";
      if (e.partner && !e.partnerDa) {
        e.partnerDa = { ...e.partner };
        e.boSicher ??= e.partner.pol ?? null;
      }
    }
    for (const u of st.partnerFz ?? []) {
      if (u.phase === "routing") {
        u.phase = "rueckfahrt";
        u.fahrt = null;
        u.phaseEnde = st.zeit;
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
  /** POIs im eigenen Gebiet mit einer Kategorie, die zum Einsatzort passt */
  private poisFuer(art: OrtArt, alter: number | null, nurKat?: string[], auchGeschlossen = false) {
    // Fall mit eigenen Orten (Bahnübergang, Hochstand …): die zählen auch ohne passende Ortsart
    const keys = nurKat?.length ? nurKat.filter((k) => kategorienFuerOrtArt(art, alter).includes(k) || !ortKategorie(k)?.ortArt) : kategorienFuerOrtArt(art, alter);
    if (!keys.length) return [];
    // nur Orte, die gerade offen sind (Schule nicht am Sonntag, Disco nur Fr/Sa nachts)
    const t = this.state.zeit;
    return this.orteImGebiet().filter((o) => o.kategorien.some((k) => keys.includes(k) && (auchGeschlossen || katOffen(k, t))));
  }

  /** POIs und Einsatzstellen der eigenen Funkgruppe (zwischengespeichert – der Generator fragt oft) */
  private orteCache: { g: string; quelle: unknown; stellen: number; orte: ReturnType<typeof alleOrte> } | null = null;
  private orteImGebiet(): ReturnType<typeof alleOrte> {
    const g = this.funkgruppe();
    const quelle = alleOrte();
    const st = stellen().length;
    if (this.orteCache && this.orteCache.g === g.id && this.orteCache.quelle === quelle && this.orteCache.stellen === st) return this.orteCache.orte;
    const orte = [...quelle.filter((o) => o.kind === "pois" && inFunkgruppe(g, o.lat, o.lon)), ...stellenInGruppe(g)];
    this.orteCache = { g: g.id, quelle, stellen: st, orte };
    return orte;
  }

  /** Welche Einrichtung (Pflegeheim, Arztpraxis, Schule) steht an dieser Stelle? Aus den Orten (POIs) */
  private einrichtungAmOrt(lat: number, lon: number): { arten: OrtArt[]; name?: string } {
    const arten: OrtArt[] = [];
    let name: string | undefined;
    for (const art of ["pflegeheim", "arzt", "schule"] as OrtArt[]) {
      const o = this.poisFuer(art, null).find((x) => distanceM(x, { lat, lon }) < 150);
      if (o) {
        arten.push(art);
        if (art === "pflegeheim") name = o.name;
      }
    }
    return { arten, name };
  }

  /** Einsatzort der Fallgeschichte: Orte, für die es echte POIs gibt, werden bevorzugt */
  private ortArtWaehlen(v: { orte: OrtArt[]; ortModus?: OrtModus; anrufer: AnruferTyp[]; auchGeschlossen?: boolean }, alter: number | null, thema?: string | null): OrtArt {
    let kand = ortKandidaten(v);
    // Orte, die gerade zu haben, fallen weg (außer der Fall darf auch dort passieren, z. B. betrunkene Person)
    if (!v.auchGeschlossen) {
      const offen = kand.filter(([o]) => ortArtOffen(o, this.state.zeit));
      if (offen.length) kand = offen;
    }
    // Arbeit und Baustelle nur im Arbeitsalter (wenn es noch etwas anderes gibt)
    if (typeof alter === "number" && (alter < 15 || alter > 72)) {
      const ohne = kand.filter(([o]) => o !== "arbeit" && o !== "baustelle");
      if (ohne.length) kand = ohne;
    }
    // Orte, die zum Fall passen (Tierbiss → Tierpark/Reitanlage, Intoxikation → Disco), kommen öfter vor
    if (thema) kand = kand.map(([o, w]) => [o, this.poisFuer(o, alter).some((x) => ortGewicht(x.kategorien, thema, alter) >= 4) ? w * 2.5 : w] as [OrtArt, number]);
    // Einrichtungen (Pflegeheim, Ordination, Schule, Bahnhof) nur, wo es so einen Ort im Gebiet gibt
    const ohneEinrichtung = kand.filter(([o]) => !ORT_NUR_MIT_POI.includes(o) || this.poisFuer(o, alter, undefined, v.auchGeschlossen).length > 0);
    if (ohneEinrichtung.length) kand = ohneEinrichtung;
    if (!v.ortModus || v.ortModus === "nur") {
      const orte = kand.map(([o]) => o);
      const mitPoi = orte.filter((o) => this.poisFuer(o, alter).length > 0);
      const passend = thema ? mitPoi.filter((o) => this.poisFuer(o, alter).some((x) => ortGewicht(x.kategorien, thema, alter) >= 4)) : [];
      if (passend.length && Math.random() < 0.6) return pick(passend);
      return mitPoi.length && Math.random() < 0.6 ? pick(mitPoi) : pick(orte);
    }
    const sum = kand.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * sum;
    for (const [o, w] of kand) if ((r -= w) <= 0) return o;
    return kand[kand.length - 1][0];
  }

  /** Adresse eines passenden POI (meistens – manchmal passiert es trotzdem woanders) */
  private async poiAdresse(
    art: OrtArt,
    alter: number | null,
    thema?: string | null,
    nurKat?: string[],
    filter?: (o: { lat: number; lon: number }) => boolean,
    auchGeschlossen = false,
  ): Promise<(Awaited<ReturnType<typeof randomAddresses>>[number] & { kat?: string; stelle?: Einsatzstelle; geschlossen?: boolean }) | null> {
    // offene Orte zuerst; geschlossene nur, wenn der Fall auch dort passieren kann
    let kand = this.poisFuer(art, alter, nurKat).filter((o) => !filter || filter(o));
    if (!kand.length && auchGeschlossen) kand = this.poisFuer(art, alter, nurKat, true).filter((o) => !filter || filter(o));
    else if (auchGeschlossen && Math.random() < 0.5) kand = this.poisFuer(art, alter, nurKat, true).filter((o) => !filter || filter(o));
    // Pflegeheim, Ordination, Schule und Fälle mit eigenem Ort: immer dort; sonst passiert es manchmal auch woanders (auf der Straße meist nicht an einer Haltestelle)
    if (!kand.length || (!nurKat?.length && !ORT_NUR_MIT_POI.includes(art) && Math.random() > (POI_ANTEIL[art] ?? 0.8))) return null;
    // genaue Kategorie mit passendem Thema und Alter bevorzugt (Huftritt → Reitanlage, Fieberkrampf → Kindergarten)
    const gew = kand.map((x) => ortGewicht(x.kategorien, thema, alter));
    let r = Math.random() * gew.reduce((a, b) => a + b, 0);
    let o = kand[kand.length - 1];
    for (let i = 0; i < kand.length; i++) if ((r -= gew[i]) <= 0) {
      o = kand[i];
      break;
    }
    // Einsatzstelle (Strecke, Fläche): keine Hausnummer – der Anrufer beschreibt, wo er ist
    if (o.kind === "stellen" && o.stelle && STELLE_FLAECHE.has(o.stelle.typ)) {
      const b = stelleBeschreibung(o.stelle);
      return { kat: o.stelle.typ, stelle: o.stelle, label: b, street: o.stelle.name, number: "", postcode: "", city: o.stelle.ort, lat: o.lat, lon: o.lon, place: false };
    }
    const d = 0.002;
    const hits = (await randomAddresses([o.lon - d, o.lat - d, o.lon + d, o.lat + d], 8)).filter((h) => !h.place);
    hits.sort((a, b) => distanceM(a, o) - distanceM(b, o));
    const h = hits[0] && distanceM(hits[0], o) < 250 ? hits[0] : null;
    // welche Kategorie des Ortes passt zum Fall (ein Ort kann Bahnhof und Bushaltestelle sein)
    const keys = nurKat?.length ? nurKat.filter((k) => kategorienFuerOrtArt(art, alter).includes(k) || !ortKategorie(k)?.ortArt) : kategorienFuerOrtArt(art, alter);
    // bei mehreren passenden Kategorien eine, die gerade offen hat (Lokal ja, Heuriger um 3 Uhr nicht)
    const passendeKat = o.kategorien.filter((k) => keys.includes(k));
    const offeneKat = passendeKat.filter((k) => katOffen(k, this.state.zeit));
    const kat = (offeneKat.length ? offeneKat : passendeKat).sort((a, b) => ortGewicht([b], thema, alter) - ortGewicht([a], thema, alter))[0];
    // unauffällige Stelle (Bahnübergang, Kreisverkehr …): heißt nach der Art, nicht nach dem Namen
    const name = o.kind === "stellen" ? stellenName(kat, o.name) : o.name;
    if (o.kind === "stellen" && !h && o.stelle) {
      const b = stelleBeschreibung(o.stelle);
      return { kat, stelle: o.stelle, label: b, street: o.stelle.name, number: "", postcode: "", city: o.stelle.ort, lat: o.lat, lon: o.lon, place: false };
    }
    return {
      kat,
      ...(kat && !katOffen(kat, this.state.zeit) ? { geschlossen: true } : {}),
      label: h ? `${name}, ${h.label}` : `${name}${o.ort ? `, ${o.ort}` : ""}`,
      street: h?.street ?? o.name,
      number: h?.number ?? "",
      postcode: h?.postcode ?? "",
      city: h?.city || o.ort,
      lat: o.lat,
      lon: o.lon,
      place: false,
    };
  }

  /** Zufällige Adresse im Umkreis eines Punktes (in der bespielten Funkgruppe) */
  private async adresseNahe(p: LatLon | undefined, radius: number): Promise<Awaited<ReturnType<typeof randomAddresses>>[number] | null> {
    if (!p) return null;
    const g = this.funkgruppe();
    const dLat = radius / 111_320;
    const dLon = radius / (111_320 * Math.cos((p.lat * Math.PI) / 180));
    for (let i = 0; i < 4; i++) {
      const hits = await randomAddresses([p.lon - dLon, p.lat - dLat, p.lon + dLon, p.lat + dLat], 8);
      const drin = hits.find((h) => inFunkgruppe(g, h.lat, h.lon) && distanceM(h, p) <= radius);
      if (drin) return drin;
    }
    return null;
  }

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
      echt: s.wetterEcht ? this.state.wetterEcht : undefined,
    };
  }

  /** Fahrzeuge über der Dienstzeit, die gerade per Funk zugesagt haben (Alarmierung darf durch) */
  private ueberzeitFreigabe = new Set<string>();
  private echtLaedt = false;
  private echtNaechsterVersuch = 0;
  private echtFehlerGemeldet = false;

  /** Echtes Wetter laden, wenn eingestellt und die geladenen Stunden nicht (mehr) reichen */
  private echtwetterPruefen(t: number): void {
    if (!this.settings.wetterAktiv || !this.settings.wetterEcht || this.echtLaedt || performance.now() < this.echtNaechsterVersuch) return;
    const e = this.state.wetterEcht;
    const STD = 3_600_000;
    if (e?.length && t >= e[0].t && t < e[e.length - 1].t - 6 * STD) return;
    const ganzNeu = !e?.length || t < e[0].t || t >= e[e.length - 1].t + STD;
    this.echtLaedt = true;
    const g = mitteVon(funkgruppe(this.settings.funkgruppe));
    void echtwetterLaden(g.lat, g.lon, t)
      .then((daten) => {
        this.state.wetterEcht = daten;
        this.state.wetterEchtStand = { ok: true, text: "Echtes Wetter (Open-Meteo)" };
        this.echtFehlerGemeldet = false;
        this.echtNaechsterVersuch = performance.now() + 60_000;
        const o = this.wetterOpt();
        const jetzt = echtBei(this.state.zeit, o);
        if (ganzNeu && jetzt) {
          // sofort aufs echte Wetter umstellen (ohne Übergang)
          this.state.wetter = wetterSetzen(jetzt.lage, this.state.zeit, o, this.state.wetter);
          this.state.wetter.vorher = null;
          this.state.wetter.bis = jetzt.t + STD;
          this.state.wetter.wind = Math.round(jetzt.wind);
          this.state.wetter.richtung = Math.round(jetzt.richtung);
        }
        this.state.wetter.plan = [];
        this.emit();
      })
      .catch((err) => {
        const text = String((err as Error)?.message ?? err);
        this.state.wetterEchtStand = { ok: false, text };
        this.echtNaechsterVersuch = performance.now() + 5 * 60_000;
        if (!this.echtFehlerGemeldet) {
          this.echtFehlerGemeldet = true;
          this.funk("Wetterdienst", null, `Echtes Wetter nicht verfügbar – simuliertes Wetter. ${text}`, "info");
        }
        this.emit();
      })
      .finally(() => {
        this.echtLaedt = false;
      });
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
    // Spieler-NAH in der Luft: Flugsimulatoren laufen in Echtzeit – dann kein Zeitraffer
    const tempo = this.state.tempo > 1 && this.zeitBremse() ? 1 : this.state.tempo;
    const dt = Math.min(2000, nowReal - this.lastReal) * tempo;
    this.lastReal = nowReal;
    this.state.zeit += dt;
    const t = this.state.zeit;

    this.echtwetterPruefen(t);
    if (this.settings.wetterAktiv && (t >= this.state.wetter.bis || !this.state.wetter.plan?.length || (this.wetterOpt().wechsel <= 0 && this.state.wetter.lage !== this.wetterOpt().festLage))) {
      if (wetterFortschreiben(this.state.wetter, t, this.wetterOpt())) {
        this.funk("Wetterdienst", null, `Wetter: ${WETTER_LABEL[this.state.wetter.lage]}`, flugverbot(this.state.wetter.lage, this.state.wetter.wind) ? "warnung" : "info");
      }
    }
    this.runGenerator(dt);
    this.ktTick(t, dt);
    this.dienstTick(t);
    this.pilotWache();
    for (const fz of Object.values(this.state.fahrzeuge)) this.updateVehicle(fz, t);
    this.partnerTick(t);
    this.flugTick(t);
    this.khTick(t);
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
          naAbholung: v.naAbholung?.trim() || undefined,
          ...fzArt(v, rmTyp),
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
        naAbholung: v.naAbholung?.trim() || undefined,
        ...fzArt(v, rmTyp),
      };
    }
    this.dienstplaene = new Map(wanted.map((v) => [v.id, v.dienstplan ?? []]));
    this.dienstTick(this.state.zeit, true);
  }

  /** Dienstpläne der Fahrzeuge (aus den Stammdaten) */
  private dienstplaene = new Map<string, Schicht[]>();
  private letzterDienstTick = 0;

  /** Dienstplan eines Fahrzeugs (leer = rund um die Uhr) */
  dienstplanVon(id: string): Schicht[] {
    return this.dienstplaene.get(id) ?? [];
  }

  /** Ist das Fahrzeug zum Zeitpunkt t laut Dienstplan im Dienst? */
  imDienstUm(fz: SimFahrzeug, t: number): boolean {
    if (fz.ersatzFuer) return !fz.ausserDienst && t <= this.state.zeit + 30 * MIN; // hängt am Flugwetter, nicht am Plan
    return imDienst(this.dienstplanVon(fz.id), t, fz.heim);
  }

  /**
   * Schichtwechsel und Dienstende: neue Schicht = neues Team. Läuft gerade ein Einsatz oder Transport,
   * macht das alte Team ihn fertig; gewechselt (bzw. abgemeldet) wird danach.
   */
  private dienstTick(t: number, sofort = false): void {
    if (!sofort && t - this.letzterDienstTick < 20_000 && t >= this.letzterDienstTick) return;
    this.letzterDienstTick = t;
    let geaendert = false;
    // Hubschrauber: kann er nicht fliegen (Wetter, Nacht ohne Nachtflug), meldet er sich ab – und bei Flugwetter wieder an
    for (const fz of Object.values(this.state.fahrzeuge)) {
      if (!fliegt(fz) || fz.ausserDienst) continue;
      const hindernis = this.flugHindernis(fz);
      if (hindernis && !fz.flugAbgemeldet && fz.status !== "abgemeldet" && this.dienstfrei(fz) && !fz.kt) {
        fz.flugAbgemeldet = true;
        this.statusWechsel(fz, "abgemeldet", "kein Flugwetter");
        geaendert = true;
      } else if (!hindernis && fz.flugAbgemeldet) {
        fz.flugAbgemeldet = false;
        if (fz.status === "abgemeldet" && !(fz.defektBis && fz.defektBis > t)) this.statusWechsel(fz, fz.phase === "frei" && distanceM(fz, fz.heim) < 80 ? "freiWache" : "freiFunk", "wieder Flugwetter");
        geaendert = true;
      }
    }
    for (const fz of Object.values(this.state.fahrzeuge)) {
      const plan = this.dienstplaene.get(fz.id);
      if (!plan) continue;
      let w = aktuelleSchicht(plan, t, fz.heim);
      let nah: SimFahrzeug | undefined;
      if (fz.ersatzFuer) {
        // Ersatz-NEF: angemeldet, solange „sein“ Hubschrauber im Dienst ist, aber nicht fliegen kann
        nah = Object.values(this.state.fahrzeuge).find((x) => x.funkrufname === fz.ersatzFuer || x.kurzname === fz.ersatzFuer);
        const nahW = nah ? aktuelleSchicht(this.dienstplanVon(nah.id), t, nah.heim) : null;
        // Hubschrauber im Dienst, kann aber wegen des WETTERS nicht fliegen → Ausweich-NEF fährt.
        // Nacht ist kein Grund: ein Hubschrauber, der nur bei Tag fliegt, hat in der Nacht kein Ersatz-NEF.
        w = nah && nahW && !nah.ausserDienst && this.wetterHindertFlug(nah) ? { ...nahW, key: `${nahW.key}#boden` } : null;
        fz.dienstEnde = null;
        fz.dienstBeginn = null;
      } else {
        fz.dienstEnde = w ? dienstEnde(plan, t, fz.heim) : null;
        fz.dienstBeginn = w ? null : naechsterBeginn(plan, t, fz.heim);
      }
      const key = w?.key ?? null;
      if (fz.schicht === undefined) {
        // erster Blick (Programmstart): ohne Teamwechsel übernehmen
        fz.schicht = key;
        if (!key && this.dienstfrei(fz) && !(fz.kt?.fahrten.length ?? 0)) this.abmeldenDienst(fz, false);
        geaendert = true;
        continue;
      }
      if (key === fz.schicht) {
        if (fz.wechselOffen) {
          fz.wechselOffen = null;
          geaendert = true;
        }
        this.heimWennFrei(fz);
        continue;
      }
      // alte Mannschaft macht laufende Arbeit fertig; gewechselt (bzw. abgemeldet) wird nur auf der Dienststelle
      const offen: "wechsel" | "ende" = key ? "wechsel" : "ende";
      if (fz.wechselOffen !== offen) {
        fz.wechselOffen = offen;
        geaendert = true;
      }
      if (!this.dienstfrei(fz) || (!key && (fz.kt?.fahrten.length ?? 0) > 0)) continue;
      if (!fz.ersatzFuer && !fliegt(fz) && !this.aufWache(fz)) {
        // frei, aber unterwegs: still zurück zur Dienststelle (Status bleibt, weiter alarmierbar)
        this.heimWennFrei(fz, true);
        continue;
      }
      fz.schicht = key;
      fz.wechselOffen = null;
      geaendert = true;
      const vorgemerkt = fz.ueberzeitFuer;
      if (key) {
        // Ersatz-NEF: dieselbe Besatzung wie am Hubschrauber (ohne Pilot)
        const crew = nah?.besetzung.filter((x) => x.quali !== "Pilot");
        fz.besetzung = crew?.length ? crew.map((x) => ({ ...x })) : generiereBesetzung(fz.rmTyp);
        if (fz.ausserDienst) {
          fz.ausserDienst = false;
          if (fz.status === "abgemeldet" && !(fz.defektBis && fz.defektBis > t)) this.statusWechsel(fz, fz.phase === "frei" && distanceM(fz, fz.heim) < 80 ? "freiWache" : "freiFunk", "Dienstbeginn");
        }
        // war für einen Einsatz vorgemerkt: das neue Team übernimmt – normal alarmieren
        if (vorgemerkt) {
          fz.ueberzeitFuer = null;
          const ev = this.einsatz(vorgemerkt);
          if (ev && ev.zustand !== "abgeschlossen") this.alarmiere(ev.id, [fz.id]);
        }
      } else {
        fz.ueberzeitFuer = null;
        this.abmeldenDienst(fz);
      }
    }
    if (geaendert && !sofort) this.emit();
  }

  /** Steht frei auf der Dienststelle */
  private aufWache(fz: SimFahrzeug): boolean {
    return fz.phase === "frei" && distanceM(fz, fz.heim) < 80;
  }

  /** Frei über Funk und nicht auf der Dienststelle: still heimfahren (auch ohne Wechsel – so ist es immer).
   *  Bereitschaft an einem anderen Ort bleibt stehen, außer ein Wechsel ist fällig. */
  private heimWennFrei(fz: SimFahrzeug, wechsel = false): void {
    if (fz.phase !== "frei" || fz.einsatzId || fz.kt || fliegt(fz) || fz.ersatzFuer || this.routingBusy.has(fz.id)) return;
    if (distanceM(fz, fz.heim) < 80) return;
    if (fz.status === "bereitschaft" && !wechsel) return;
    if (fz.status !== "freiFunk" && fz.status !== "bereitschaft") return;
    this.fahre(fz, fz.heim, "rueckfahrt", false);
  }

  /** Nichts zu tun (kein Einsatz, kein Transport, nichts vorgemerkt) – Wechsel/Dienstende möglich */
  private dienstfrei(fz: SimFahrzeug): boolean {
    if (fz.einsatzId || fz.kt?.aktiv) return false;
    return fz.phase === "frei" || fz.phase === "rueckfahrt";
  }

  /** Dienstende: Fahrzeug meldet sich ab (fährt ggf. noch heim) */
  private abmeldenDienst(fz: SimFahrzeug, merken = true): void {
    fz.ausserDienst = true;
    if (merken) this.statusWechsel(fz, "abgemeldet", "Dienstende");
    else fz.status = "abgemeldet";
    if (fz.phase === "frei" && distanceM(fz, fz.heim) >= 80 && !this.routingBusy.has(fz.id)) this.fahre(fz, fz.heim, "rueckfahrt", false);
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
    return ["RTW", "RTW-C", "NAW", "KTW", "SKTW", "SRTW", "SNAW", "BIT"].includes(fz.rmTyp);
  }

  /** Hat einen Notarzt an Bord (NEF, NAH, SNAW) */
  mitNotarzt(fz: SimFahrzeug): boolean {
    return ["NEF", "NAH", "ITH", "SNAW", "NAW"].includes(fz.rmTyp);
  }

  /** Wer spricht am Funk für den Einsatz? Der BEL vor Ort ist Ansprechpartner Nr. 1. */
  private sprecher(e: Einsatz, sonst: SimFahrzeug): SimFahrzeug {
    return this.einsatzFz(e).find((x) => x.rmTyp === "BEL" && x.phase === "vorOrt") ?? sonst;
  }

  verfuegbar(fz: SimFahrzeug): boolean {
    return this.statusDef(fz.status).verfuegbar && !fz.einsatzId && !fz.kt?.aktiv && !fz.ausserDienst;
  }

  /** Hält gerade nur das Wetter den Hubschrauber am Boden? (Nacht ohne Nachtflug zählt nicht – dann fliegt er ohnehin nicht) */
  wetterHindertFlug(fz: SimFahrzeug): boolean {
    if (!this.flugverbotJetzt()) return false;
    return !(istNacht(this.state.zeit, fz.heim.lat, fz.heim.lon) && !fz.nachtflug);
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

  /** Status setzen und für „Statusänderungen“ merken */
  private statusWechsel(fz: SimFahrzeug, s: StatusKey, grund?: string): void {
    if (fz.status === s) return;
    const log = (this.state.statusLog ??= []);
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    const kt = !e && fz.kt?.aktiv ? fz.kt.fahrten.flat()[0] : undefined;
    log.push({ zeit: this.state.zeit, fzId: fz.id, funkrufname: fz.funkrufname, von: fz.status, nach: s, ...(e ? { einsatz: e.nummer } : kt ? { einsatz: this.ktAuftrag(kt)?.nummer } : {}), ...(grund ? { grund } : {}) });
    if (log.length > 500) log.splice(0, log.length - 500);
    fz.status = s;
  }

  private setStatus(fz: SimFahrzeug, s: StatusKey, quiet = false, grund?: string): void {
    if (fz.status === s) return;
    this.statusWechsel(fz, s, grund);
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
    // von Hand in Dienst genommen bzw. abgemeldet: gilt bis zum nächsten Schichtwechsel
    if (s !== "abgemeldet" && this.statusDef(s).verfuegbar) fz.ausserDienst = false;
    this.setStatus(fz, s, true, "von Hand");
    if (s === "freiWache") {
      fz.lat = fz.heim.lat;
      fz.lon = fz.heim.lon;
      fz.fahrt = null;
      fz.phase = "frei";
    }
    this.emit();
    return null;
  }

  private position(fz: { fahrt: Fahrt | null; lat: number; lon: number }, t: number): void {
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
    // Spieler-NAH: der Pilot fliegt selbst
    if (fz.pilot) return;
    // NEF mit Notarzt im Krankenhaus: zuerst abholen bzw. nach dem Einsatz zurückbringen
    fz.naZurueck = false;
    const kh = this.naKh(fz);
    if (kh) {
      const p = khAnkunft(kh);
      if (!fz.naAnBord && NA_PHASEN.has(phase)) {
        fz.nachNa = { ziel, phase, blau: sondersignal };
        if (distanceM(fz, p) < 40) {
          fz.fahrt = null;
          fz.phase = "naEinstieg";
          fz.phaseEnde = this.state.zeit + rnd(60, 120) * 1000;
          return;
        }
        ziel = p;
        phase = "naAbholung";
      } else if (fz.naAnBord && phase === "rueckfahrt") {
        // schon beim Krankenhaus (z. B. nach dem Transport): Notarzt steigt aus
        if (distanceM(fz, p) < 40) fz.naAnBord = false;
        else {
          fz.naZurueck = true;
          ziel = p;
        }
      }
    }
    this.routingBusy.add(fz.id);
    fz.phase = "routing";
    // KTW-B (Zivildienst) fährt nie mit Blaulicht
    if (fz.ohneBlaulicht) sondersignal = false;
    fz.blaulicht = sondersignal && !fliegt(fz);
    const von = { lat: fz.lat, lon: fz.lon };
    // Besatzung steigt ein; bei Fahrten zum Patienten bleibt das Fahrzeug auf der Straße stehen
    fz.fuss = null;
    const strasse = AN_STRASSE.has(phase) && !fliegt(fz) && !khAmZiel(ziel);
    fz.fussZiel = strasse ? { lat: ziel.lat, lon: ziel.lon } : null;
    // Hubschrauber ins Krankenhaus: auf dem Landeplatz
    if (fliegt(fz)) {
      const h = khAmZiel(ziel);
      const l = h ? khLandung(h) : null;
      if (l) ziel = l;
    }
    const p: Promise<Route> =
      fliegt(fz) ? Promise.resolve(flightRoute(von, ziel, this.settings.nahGeschwindigkeit)) : this.strassenRoute(von, ziel);
    void p.then((r) => {
      this.routingBusy.delete(fz.id);
      // inzwischen hat ein Pilot übernommen: er fliegt selbst
      if (fz.pilot) return;
      const wf = !fliegt(fz) && this.settings.wetterAktiv ? fahrFaktor(this.state.wetter.lage, this.temperatur()) : 1;
      const f = (sondersignal && !fliegt(fz) ? this.settings.sondersignalFaktor : 1) * wf;
      // Hubschrauber kreist 1–3 Mal über Einsatzorten (nicht über Krankenhäusern und Landeplätzen)
      const kreis = fliegt(fz) && phase === "anfahrt" && !this.istLandeplatz(ziel) ? platzrunden(r, ziel, 1 + Math.floor(Math.random() * 3)) : null;
      const r0 = kreis ?? (strasse ? anStrasse(r) : r);
      let rr: Route = { ...r0, times: r0.times.map((x) => x * f), duration: r0.duration * f };
      // Flughafen: Fahrzeuge von außen stehen an der Einfahrt eine Minute (Sicherheitskontrolle), hinein und hinaus
      if (!fliegt(fz) && !istFlughafenFz(fz)) rr = mitKontrolle(rr).route;
      fz.fahrt = { coords: rr.coords, times: rr.times, start: this.state.zeit, dauer: rr.duration, blau: sondersignal };
      if (kreis) Object.assign(fz.fahrt, { kreisAb: kreis.kreisAb, landungAb: kreis.landungAb });
      fz.phase = phase;
      fz.phaseEnde = this.state.zeit + fz.fahrt.dauer * 1000;
      this.emit();
    });
  }

  /**
   * Fahrzeug ist angekommen und steht auf der Straße: die Besatzung geht zu Fuß zum Patienten
   * (Zeit bis zum Patientenkontakt wird länger). Größere Entfernungen meldet sie per Funk.
   */
  private zuFuss(fz: SimFahrzeug, patient: LatLon, t: number, e: Einsatz | null): void {
    const ziel = fz.fussZiel;
    fz.fussZiel = null;
    if (!ziel || fliegt(fz) || fz.phaseEnde === null) return;
    const park = { lat: fz.lat, lon: fz.lon };
    // Patient liegt dort, wo er wirklich ist (Einsatz), sonst am Ziel der Fahrt (KT)
    const p = distanceM(patient, ziel) <= this.settings.verortungRadius ? patient : ziel;
    const m = distanceM(park, p);
    if (m < 15) return;
    const hinSek = m / GEHEN;
    fz.fuss = { park, ziel: { lat: p.lat, lon: p.lon }, m, ab: t, hinSek, zurueckSek: m / TRAGEN };
    fz.phaseEnde += hinSek * 1000;
    if (m >= FUSS_MELDEN_M) {
      const gerundet = Math.round(m / 50) * 50;
      const min = Math.max(1, Math.round(hinSek / 60));
      // nur das erste Fahrzeug meldet
      const schon = e && this.einsatzFz(e).some((x) => x !== fz && x.fuss && x.fuss.m >= FUSS_MELDEN_M);
      if (!schon) {
        if (e) this.log(e, `${fz.funkrufname}: Patient abseits der Straße, ca. ${gerundet} m Fußweg`);
        this.fzRuft(fz, e, "info", `Patient liegt abseits der Straße, ca. ${gerundet} Meter Fußweg, Patientenkontakt in ca. ${min} Minute${min === 1 ? "" : "n"}`);
      }
    }
  }

  /** Krankenhaus, in dem dieses NEF den Notarzt abholt (ID oder Name), sonst null */
  private naKh(fz: SimFahrzeug): Hospital | null {
    if (!fz.naAbholung || fliegt(fz)) return null;
    const x = fz.naAbholung;
    const h = store.get("hospitals", x) ?? store.list("hospitals").find((k) => k.kurzname === x || k.name === x);
    return h ?? null;
  }

  /** Umweg über das Krankenhaus (Notarzt abholen) für die Ankunftsschätzung: Startpunkt und Zusatzzeit */
  private naUmweg(fz: SimFahrzeug): { start: LatLon; sek: number } | null {
    const kh = this.naKh(fz);
    if (!kh || fz.naAnBord) return null;
    const p = khAnkunft(kh);
    return { start: p, sek: (distanceM(fz, p) * 1.3) / (45 / 3.6) + 90 };
  }

  /**
   * Route auf der Straße. Ziel ist ein Krankenhaus mit Rettungszufahrt? Dann über die Einfahrt zum Punkt P
   * (dort geht die Besatzung „ins KH“) – nicht irgendwo ans Haus.
   */
  private strassenRoute(von: LatLon, ziel: LatLon): Promise<Route> {
    const z = khZufahrtBei(ziel);
    if (!z) return route(von, ziel);
    const p = z.p;
    const ein = z.ein;
    // schon auf dem Gelände (näher an P als die Einfahrt) oder keine Einfahrt: direkt zu P
    if (!ein || distanceM(von, p) <= distanceM(ein, p) || distanceM(von, ein) < 30) return route(von, p);
    return Promise.all([route(von, ein), route(ein, p)]).then(([a, b]) => {
      const coords = [...a.coords, ...b.coords.slice(1)];
      const times = [...a.times, ...b.times.slice(1).map((t) => t + a.duration)];
      return { coords, times, duration: a.duration + b.duration, distance: a.distance + b.distance };
    });
  }

  /** Krankenhaus, Hubschrauberstützpunkt oder Landeplatz in der Nähe (≤ 300 m)? */
  private istLandeplatz(p: LatLon): boolean {
    const nah = (x: LatLon) => distanceM(p, x) < 300;
    if (store.list("hospitals").some(nah)) return true;
    if (store.list("pois").some((x) => poiKategorien(x).includes("landeplatz") && nah(x))) return true;
    return Object.values(this.state.fahrzeuge).some((f) => fliegt(f) && nah(f.heim));
  }

  private updateVehicle(fz: SimFahrzeug, t: number): void {
    if (fz.pilot) return this.pilotUpdate(fz, t);
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
        // NEF, das den Notarzt erst abholt: bleibt „alarmiert und quittiert“, bis es beim Krankenhaus losfährt
        this.setStatus(fz, this.naUmweg(fz) ? "alarmiert" : "zumBO");
        // Gewalt/Waffen: zuerst in den Bereitstellungsraum, bis die Polizei den Einsatzort sichert
        if (e.br && !e.boSicher) this.fahre(fz, e.br, "bereitstellung", this.faktor(e) < 1);
        else this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
        break;
      }
      case "bereitstellung": {
        fz.fahrt = null;
        if (!e) return this.freigeben(fz);
        if (e.boSicher && e.adresse) {
          this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
          break;
        }
        const flug = e.flughafen?.flug;
        if (flug) {
          // angekündigter Notfall an Bord: am Warteort, bis das Flugzeug an der Abstellposition steht
          this.log(e, `${fz.funkrufname} am Warteort (Flug ${flug.nummer})`);
          if (!this.einsatzFz(e).some((x) => x !== fz && x.phase === "wartetBR")) this.fzRuft(fz, e, "info", `am Warteort bei der Feuerwehr-Wache 1, warten auf Flug ${flug.nummer}, Landung um ${hhmm(flug.landung)}`);
          fz.phase = "wartetBR";
          fz.phaseEnde = Math.max(t + MIN, flug.amStand + MIN);
          break;
        }
        this.log(e, `${fz.funkrufname} im Bereitstellungsraum`);
        if (!this.einsatzFz(e).some((x) => x !== fz && x.phase === "wartetBR")) {
          this.fzRuft(fz, e, "info", e.partner?.pol ? "im Bereitstellungsraum, warten auf Freigabe durch die Polizei" : "im Bereitstellungsraum, Polizei ist noch nicht alarmiert, bitte Polizei verständigen");
        }
        fz.phase = "wartetBR";
        fz.phaseEnde = t + 6 * MIN;
        break;
      }
      case "wartetBR": {
        if (!e) return this.freigeben(fz);
        if (e.boSicher && e.adresse) {
          this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
          break;
        }
        fz.phaseEnde = t + 6 * MIN;
        if (e.flughafen?.flug) break;
        // nur ein Fahrzeug erinnert
        const erstes = this.einsatzFz(e).find((x) => x.phase === "wartetBR");
        if (erstes === fz) this.fzRuft(fz, e, "nachforderung", e.partner?.pol ? "stehen weiterhin im Bereitstellungsraum, Einsatzort noch nicht freigegeben" : "stehen im Bereitstellungsraum, Polizei ist noch nicht alarmiert, bitte Polizei verständigen");
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
          if (istAcnCode(e.wahr.code)) {
            // Akutpflege zu Hause: die ACN versorgt 30–60 Minuten, der Patient bleibt daheim;
            // ein KTW/RTW kann das nicht – er nimmt den Patienten mit ins Krankenhaus
            if (fz.rmTyp === "ACN") fz.phaseEnde = t + rnd(30, 60) * MIN;
            else if (this.transportfaehig(fz) && !this.einsatzFz(e).some((x) => x.rmTyp === "ACN")) e.wahr.transport = true;
          }
          this.eintreffenLage(fz, e);
          this.ktHilfeDa(e);
          const p0 = e.wahr.lage?.patienten[0];
          if (p0 && istStillstand(p0)) fz.phaseEnde = t + rnd(30, 45) * MIN;
          // Fahrzeug steht auf der Straße: zu Fuß zum Patienten
          this.zuFuss(fz, e.wahr, t, e);
        }
        break;
      }
      case "vorOrt": {
        if (!e) return this.freigeben(fz);
        // ohne Feuerwehr/Polizei/Berg-/Wasserrettung geht es nicht weiter (Befreiung, Eigenschutz, Suche)
        const warten = this.partnerBlockiert(e);
        if (warten.length) {
          fz.phaseEnde = t + 2 * MIN;
          const fehlen = warten.filter((x) => !e.partner?.[x.art]);
          if (!e.partnerErinnert || t - e.partnerErinnert > 6 * MIN) {
            e.partnerErinnert = t;
            if (fehlen.length) {
              this.log(e, `${fz.funkrufname} wartet auf ${fehlen.map((x) => PARTNER[x.art].name).join(", ")}`);
              this.fzRuft(this.sprecher(e, fz), e, "nachforderung", `benötigen weiterhin ${fehlen.map((x) => `${PARTNER[x.art].name} (${x.grund})`).join(" und ")}, ohne können wir nicht weiterarbeiten`);
            } else this.log(e, `${fz.funkrufname} wartet auf ${warten.map((x) => PARTNER[x.art].name).join(", ")} (unterwegs)`);
          }
          break;
        }
        // zu Fuß zurück zum Fahrzeug (mit Patient langsamer)
        if (fz.fuss && fz.fuss.zurueckAb === undefined) {
          const mitPatient = this.transportfaehig(fz) && !!e.wahr.transport;
          fz.fuss.zurueckSek = fz.fuss.m / (mitPatient ? TRAGEN : GEHEN);
          fz.fuss.zurueckAb = t;
          fz.phaseEnde = t + fz.fuss.zurueckSek * 1000;
          break;
        }
        this.entscheideTransport(fz, e, t);
        break;
      }
      case "warteKH":
        break;
      case "rendezvous": {
        if (!e) return this.freigeben(fz);
        this.amTreffpunkt(fz, e, t);
        break;
      }
      case "treffpunkt": {
        if (!e) return this.freigeben(fz);
        this.rendezvousEnde(e, t);
        break;
      }
      case "transport": {
        fz.fahrt = null;
        fz.blaulicht = false;
        this.setStatus(fz, "amZO");
        // Flughafen: Patient im Medical Center – braucht er ein Krankenhaus, wird er von dort überstellt
        if (e?.kh?.hospitalId === MEDICAL_CENTER && this.transportfaehig(fz)) this.mcUeberstellung(e);
        fz.phase = "uebergabe";
        fz.phaseEnde = t + rnd(8, 18) * MIN;
        break;
      }
      case "uebergabe": {
        if (e) this.log(e, `${fz.funkrufname}: Übergabe abgeschlossen`);
        this.freigeben(fz);
        break;
      }
      case "naAbholung": {
        fz.fahrt = null;
        fz.phase = "naEinstieg";
        fz.phaseEnde = t + rnd(60, 120) * 1000;
        break;
      }
      case "naEinstieg": {
        const n = fz.nachNa;
        fz.nachNa = null;
        fz.naAnBord = true;
        if (!e || !n) return this.freigeben(fz);
        this.log(e, `${fz.funkrufname}: Notarzt im ${this.naKh(fz)?.kurzname || "Krankenhaus"} übernommen`);
        this.setStatus(fz, "zumBO");
        // Einsatzort kann sich inzwischen geändert haben
        const ziel = n.phase === "anfahrt" ? (e.adresse ?? n.ziel) : n.ziel;
        this.fahre(fz, ziel, n.phase, n.blau);
        break;
      }
      case "rueckfahrt": {
        fz.fahrt = null;
        if (fz.naZurueck) {
          // Notarzt im Krankenhaus abgesetzt: Bereitschaft, weiter zur Dienststelle
          fz.naZurueck = false;
          fz.naAnBord = false;
          if (!fz.ausserDienst && !(fz.defektBis && t < fz.defektBis)) this.setStatus(fz, "bereitschaft");
          this.fahre(fz, fz.heim, "rueckfahrt", false);
          break;
        }
        fz.phase = "frei";
        fz.phaseEnde = null;
        fz.lat = fz.heim.lat;
        fz.lon = fz.heim.lon;
        if ((fz.defektBis && t < fz.defektBis) || fz.ausserDienst) this.setStatus(fz, "abgemeldet", true);
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
      const naMit = e.wahr.lage?.fall ? this.naBegleitetFall(e) : this.kritisch(e) || (!!e.wahr.lage?.bit && bedarf(e.wahr.lage).na > 0);
      if (rtwMitTransport && naMit && fz.kategorie === "NEF") {
        fz.begleitet = true;
        this.log(e, `${fz.funkrufname}: Notarzt begleitet den Transport`);
      } else if (fz.rmTyp === "ACN" && rtwMitTransport && !istAcnCode(e.wahr.code) && !this.einsatzFz(e).some((x) => this.mitNotarzt(x)) && !this.einsatzFz(e).some((x) => this.transportfaehig(x) && hatNFS(x.besetzung))) {
        // ACN statt Notarzt (RS-RTW ohne NFS): fährt mit ins Krankenhaus
        fz.begleitet = true;
        this.log(e, `${fz.funkrufname}: ACN begleitet den Transport`);
      } else if (rtwMitTransport && (e.wahr.lage?.fall ? naMit : this.kritisch(e)) && fliegt(fz)) {
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
    // Spieler-NAH transportiert den Patienten selbst: der RTW wird frei
    const nahFliegt = this.pilotTransport(e);
    if (nahFliegt) {
      this.log(e, `${fz.funkrufname}: Patient wird mit ${nahFliegt.funkrufname} transportiert`);
      return this.freigeben(fz);
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
    // Fallkatalog: Todesfall, Transportverweigerung
    const fvar = this.fallVar(e);
    if (fvar?.tot) {
      if (!this.einsatzFz(e).some((x) => this.mitNotarzt(x) && x.phase === "vorOrt")) {
        // ohne Arzt keine Todesfeststellung: warten, bis der Notarzt da ist
        if (!this.einsatzFz(e).some((x) => this.mitNotarzt(x))) this.nachfordern(e, fz, { na: 1, rtw: 0, bit: 0 });
        fz.phaseEnde = t + 3 * MIN;
        return;
      }
      this.log(e, `${fz.funkrufname}: Patient verstorben, Todesfeststellung durch den Notarzt`);
      this.fzRuft(fz, e, "info", "Patient verstorben, Tod durch den Notarzt festgestellt, kein Transport, wir werden einsatzbereit");
      return this.freigeben(fz);
    }
    if (fvar?.revers && e.wahr.transport && !e.wahr.reversGeprueft) {
      e.wahr.reversGeprueft = true;
      const p0 = l?.patienten[0];
      const f = this.settings.revers === "aus" ? 0 : this.settings.revers === "selten" ? 0.5 : 1;
      if (p0 && p0.bw === "ja" && p0.sichtung !== "rot" && Math.random() < fvar.revers * f) {
        e.wahr.transport = false;
        e.wahr.revers = true;
      }
    }
    if (!e.wahr.transport) {
      this.log(e, `${fz.funkrufname}: ${e.wahr.revers ? "Transportverweigerung, Revers unterschrieben" : "kein Transport erforderlich"}`);
      if (e.wahr.revers) this.fzRuft(fz, e, "info", "Patient verweigert den Transport, Revers unterschrieben, wir werden einsatzbereit");
      else this.funk(fz.funkrufname, e.id, "Kein Transport, Patient verbleibt vor Ort", "info");
      return this.freigeben(fz);
    }
    fz.phase = "warteKH";
    fz.phaseEnde = null;
    const verdacht = this.verdacht(e);
    if (e.kh) {
      this.startTransport(e);
      return this.rendezvousLos(e, fz);
    }
    // Die Besatzung bucht selbst – über Funk fragt sie nur bei Reanimation oder mehreren Patienten an
    const p0 = l?.patienten[0];
    const anfragen = (p0 && istStillstand(p0)) || (l?.patienten.length ?? 1) > 1;
    if (e.wahr.rtwBuchtSelbst && !anfragen) {
      this.bucheKhAuto(e, fz.funkrufname);
      return this.rendezvousLos(e, fz);
    }
    e.verdacht = verdacht;
    e.khAnfrage = { verdacht, seit: t, von: fz.funkrufname };
    this.fzRuft(fz, e, "kh", `erbitte KH-Buchung, Verdacht ${buchungName(verdacht)}`);
    this.log(e, `${fz.funkrufname} erbittet KH-Buchung (Verdacht ${buchungName(verdacht)})`);
    this.rendezvousLos(e, fz);
  }

  // ------------------------------------------------------------------ Rendezvous RTW – NEF

  /**
   * Rendezvous: Braucht der Patient (mindestens gelb) einen Notarzt und ist das alarmierte NEF noch mehr als
   * 15 Minuten entfernt, fährt die Besatzung mit dem Patienten los; beide treffen sich unterwegs so, dass
   * beide gleich lange fahren. Der Funk RTW–NEF läuft über die Gruppe (LEO hört mit).
   */
  private rendezvousPruefen(e: Einsatz, t: number): void {
    const rv = e.rendezvous;
    if (rv) {
      if (rv.status !== "fertig") this.rendezvousUeberwachen(e, rv);
      return;
    }
    if (e.fremd || e.lageGeplant || !e.wahr.transport || this.settings.rendezvous === false) return;
    const l = e.wahr.lage;
    if (!l?.aufgedeckt || l.patienten.length !== 1 || l.bit) return;
    const p0 = l.patienten[0];
    if (istStillstand(p0) || (p0.sichtung !== "gelb" && p0.sichtung !== "rot")) return;
    if (this.fallVar(e)?.tot || this.partnerBlockiert(e).length) return;
    if (this.bedarfVon(e).na <= 0) return;
    const fzs = this.einsatzFz(e);
    if (fzs.some((x) => this.mitNotarzt(x) && x.phase === "vorOrt")) return;
    const rtw = fzs.find((x) => this.transportfaehig(x) && x.rmTyp !== "BIT" && x.phase === "vorOrt" && x.phaseEnde !== null);
    if (!rtw) return;
    // nur ein mit- bzw. nachalarmiertes NEF (kein Hubschrauber), das noch weit weg ist
    const nef = fzs.find((x) => x.kategorie === "NEF" && !fliegt(x) && x.phase === "anfahrt" && !!x.fahrt && x.phaseEnde !== null && x.phaseEnde - t > 15 * MIN);
    if (!nef?.fahrt || nef.phaseEnde === null) return;
    // Patient einladen, dann los; Treffpunkt auf der Route des NEF, wo beide gleich lange fahren
    const los = Math.min(rtw.phaseEnde!, t + rnd(3, 6) * MIN);
    rtw.phaseEnde = los;
    const f = nef.fahrt;
    const bisLos = (los - f.start) / 1000;
    const sek = (f.dauer + bisLos) / 2;
    let i = 1;
    while (i < f.times.length && f.times[i] < sek) i++;
    const a = f.coords[i - 1];
    const b = f.coords[i] ?? a;
    const t0 = f.times[i - 1];
    const t1 = f.times[i] ?? t0;
    const k = t1 > t0 ? Math.min(1, Math.max(0, (sek - t0) / (t1 - t0))) : 0;
    const punkt = { lat: a[1] + (b[1] - a[1]) * k, lon: a[0] + (b[0] - a[0]) * k };
    const label = this.treffpunktName(punkt, e.adresse ?? e.wahr);
    e.rendezvous = { rtwId: rtw.id, nefId: nef.id, punkt: { ...punkt, label }, status: "anfahrt", bis: null };
    const eta = Math.round((nef.phaseEnde - t) / MIN);
    this.log(e, `Rendezvous ${rtw.funkrufname} – ${nef.funkrufname}: ${label} (NEF noch ca. ${eta} Minuten entfernt)`);
    this.fahre(nef, punkt, "rendezvous", true);
    const r = this.rufname(this.sprecher(e, rtw));
    const n = this.rufname(nef);
    this.fzFunk(this.sprecher(e, rtw), nef, e, [
      { von: r, text: `${n} von ${r}, kommen` },
      { von: n, text: `Hier ${n}, kommen` },
      { von: r, text: `Hier ${r}, Patient braucht Notarzt, ihr seid noch ca. ${eta} Minuten entfernt, wir fahren euch entgegen, Rendezvous ${label}, kommen` },
      { von: n, text: `Hier ${n}, Rendezvous ${label} verstanden, Ende` },
    ]);
  }

  /** Name des Treffpunkts: nächster Ort in der Nähe, sonst Richtung und Entfernung vom Einsatzort */
  private treffpunktName(p: LatLon, bo: LatLon): string {
    let best: { ort: string; d: number } | null = null;
    for (const o of alleOrte()) {
      if (!o.ort) continue;
      const d = distanceM(p, o);
      if (d < 6000 && (!best || d < best.d)) best = { ort: o.ort, d };
    }
    if (best) return `im Bereich ${best.ort}`;
    const grad = (Math.atan2((p.lon - bo.lon) * Math.cos((bo.lat * Math.PI) / 180), p.lat - bo.lat) * 180) / Math.PI;
    const richtung = ["nördlich", "nordöstlich", "östlich", "südöstlich", "südlich", "südwestlich", "westlich", "nordwestlich"][Math.round((((grad % 360) + 360) % 360) / 45) % 8];
    return `ca. ${Math.max(1, Math.round(distanceM(p, bo) / 1000))} km ${richtung} vom Einsatzort`;
  }

  /** RTW fährt mit dem Patienten zum Treffpunkt (nach der KH-Buchung bzw. -Anfrage) */
  private rendezvousLos(e: Einsatz, fz: SimFahrzeug): void {
    const rv = e.rendezvous;
    if (!rv || rv.status !== "anfahrt" || rv.rtwId !== fz.id || fz.phase !== "warteKH") return;
    this.setStatus(fz, "zumZO");
    this.log(e, `${fz.funkrufname} fährt mit dem Patienten zum Treffpunkt (${rv.punkt.label})`);
    this.fahre(fz, rv.punkt, "rendezvous", true);
  }

  /** Einer der beiden nicht mehr im Einsatz (Storno, Umdisponieren, Revers): Rendezvous aufgeben */
  private rendezvousUeberwachen(e: Einsatz, rv: NonNullable<Einsatz["rendezvous"]>): void {
    const rtw = this.state.fahrzeuge[rv.rtwId];
    const nef = this.state.fahrzeuge[rv.nefId];
    const rtwDa = !!rtw && rtw.einsatzId === e.id;
    const nefDa = !!nef && nef.einsatzId === e.id;
    if (rtwDa && nefDa) return;
    rv.status = "fertig";
    rv.bis = null;
    this.log(e, "Rendezvous aufgehoben");
    if (rtwDa && rtw.phase === "treffpunkt") {
      rtw.phase = "warteKH";
      rtw.phaseEnde = null;
      this.startTransport(e);
    }
    // ohne RTW (z. B. Revers): das NEF fährt zum Einsatzort
    if (nefDa && (nef.phase === "treffpunkt" || nef.phase === "rendezvous") && e.adresse) this.fahre(nef, e.adresse, "anfahrt", true);
  }

  /** Am Treffpunkt angekommen; sind beide da, übernimmt der Notarzt (3–8 Minuten) */
  private amTreffpunkt(fz: SimFahrzeug, e: Einsatz, t: number): void {
    fz.fahrt = null;
    const rv = e.rendezvous;
    if (!rv || rv.status === "fertig") {
      // Rendezvous aufgehoben: RTW fährt ins Krankenhaus, NEF zum Einsatzort
      if (this.transportfaehig(fz)) {
        fz.phase = "warteKH";
        fz.phaseEnde = null;
        this.startTransport(e);
      } else if (e.adresse) this.fahre(fz, e.adresse, "anfahrt", true);
      else this.freigeben(fz);
      return;
    }
    fz.phase = "treffpunkt";
    fz.phaseEnde = null;
    if (!this.transportfaehig(fz)) this.setStatus(fz, "amBO");
    const rtw = this.state.fahrzeuge[rv.rtwId];
    const nef = this.state.fahrzeuge[rv.nefId];
    if (rtw?.phase === "treffpunkt" && nef?.phase === "treffpunkt") {
      rv.status = "treffen";
      rv.bis = t + rnd(3, 8) * MIN;
      rtw.phaseEnde = rv.bis;
      this.log(e, `Rendezvous: ${nef.funkrufname} beim Patienten in ${rtw.funkrufname}`);
    } else this.log(e, `${fz.funkrufname} am Treffpunkt, wartet auf ${fz.id === rv.rtwId ? nef?.funkrufname : rtw?.funkrufname}`);
  }

  /** Übergabe am Treffpunkt fertig: wie am Einsatzort entscheidet der Notarzt, ob er mitfährt */
  private rendezvousEnde(e: Einsatz, t: number): void {
    const rv = e.rendezvous;
    if (!rv) return;
    rv.status = "fertig";
    rv.bis = null;
    const rtw = this.state.fahrzeuge[rv.rtwId];
    const nef = this.state.fahrzeuge[rv.nefId];
    if (rtw && rtw.einsatzId === e.id) {
      rtw.phase = "warteKH";
      rtw.phaseEnde = null;
    }
    if (nef && nef.einsatzId === e.id && nef.phase === "treffpunkt") {
      nef.phase = "vorOrt";
      this.entscheideTransport(nef, e, t);
    }
    this.startTransport(e);
  }

  /** Fallkatalog: fährt der Notarzt mit? (rot, NA-Bedarf oder Vorgabe des Falls; gelb oft, grün nie) */
  private naBegleitetFall(e: Einsatz): boolean {
    const lf = e.wahr.lage?.fall;
    if (!lf) return false;
    if (lf.naMit !== undefined) return lf.naMit;
    const v = this.fallVar(e);
    const p0 = e.wahr.lage!.patienten[0];
    let mit: boolean;
    if (v?.tot) mit = false;
    else if (p0.sichtung === "rot" || istStillstand(p0)) mit = true;
    else if (v?.naBegleitet !== undefined) mit = v.naBegleitet;
    else if (lf.na !== "nein") mit = true;
    else mit = p0.sichtung === "gelb" ? Math.random() < 0.5 : false;
    lf.naMit = mit;
    return mit;
  }

  /** Verdachtsdiagnose des Einsatzes (einmal festgelegt, sobald die Besatzung beim Patienten war) */
  verdacht(e: Einsatz): string {
    if (e.wahr.verdacht) return e.wahr.verdacht;
    const fv = this.fallVar(e);
    if (fv) return (e.wahr.verdacht = fv.buchung);
    const w = e.wahr.abfrage;
    const c = findCode(e.wahr.code);
    const l = e.wahr.lage;
    const p0 = l?.patienten[0];
    const kap = w?.kapitel ?? (c?.gruppe ? String(c.gruppe) : "");
    e.wahr.verdacht = verdachtFuer({
      thema: thema(kap),
      antworten: w ? (store.schema ? merkmaleAusSchema(store.schema, w.antworten) : w.antworten) : {},
      name: `${c?.beschreibung ?? ""} ${store.schema?.codes[w?.code ?? e.wahr.code]?.name ?? ""}`,
      alter: p0?.alter ?? e.wahr.patientAlter,
      patient: p0,
      rea: !!p0 && istStillstand(p0),
    });
    return e.wahr.verdacht;
  }

  /** Patient rot (für die Wahl des Krankenhauses)? */
  patientRot(e: Einsatz): boolean {
    const p0 = e.wahr.lage?.patienten[0];
    return p0 ? p0.sichtung === "rot" : this.kritisch(e);
  }

  /** Krankenhäuser zur Verdachtsdiagnose, nach Eignung und Entfernung – mit offen/zu und freien Plätzen */
  khFuer(pos: LatLon, verdacht: string | null | undefined, rot: boolean, kind = false, nurLandeplatz = false): KhVorschlag[] {
    // Medical Center am Flughafen: nur für Patienten vom Gelände (eigene Regel unten)
    const alle = store.list("hospitals").filter((h) => this.khImNetz(h) && h.id !== MEDICAL_CENTER && (!nurLandeplatz || khLandung(h) !== null));
    const v = khVorschlaege(alle, buchung(verdacht), rot, (h) => distanceM(pos, h) / 1000, { t: this.state.zeit, belegung: this.state.khBelegung, kind });
    // Flughafen (Vorgabe Paul): kritisch → direkt in die passende Klinik; kann es das Health Center allein (offen, Platz frei) → dorthin;
    // sonst ins Medical Center (rund um die Uhr) – was weiter muss, wird von dort überstellt
    if (!amFlughafen(pos) || rot) return v;
    if (bestesKh(v)?.h.id === HEALTH_CENTER) return v;
    const mc = store.get("hospitals", MEDICAL_CENTER);
    if (!mc || !this.khImNetz(mc) || (nurLandeplatz && khLandung(mc) === null)) return v;
    return [{ h: mc, eignung: "passend", km: distanceM(pos, mc) / 1000, zu: false, voll: false, platz: null, frei: 0, gesamt: 0 }, ...v];
  }

  /** Buchung, die das Medical Center selbst erledigt (hausärztlich, Bagatellverletzung) – alles andere wird überstellt */
  private mcReicht(verdacht: string | null | undefined): boolean {
    const b = buchung(verdacht);
    return !!b && b.optionen.every((alt) => alt.every((a) => a.startsWith("ak_primaerversorgung")));
  }

  /**
   * Patient ist im Medical Center am Flughafen angekommen und braucht ein Krankenhaus: das Medical Center ruft an der
   * KT-Hotline an – Überstellung mit KTW ins passende Klinikum (Vorgabe Paul).
   */
  private mcUeberstellung(e: Einsatz): void {
    if (e.mcUeberstellung || !e.kh || this.mcReicht(e.kh.grund)) return;
    const mc = store.get("hospitals", MEDICAL_CENTER);
    if (!mc) return;
    const p0 = e.wahr.lage?.patienten[0];
    const alter = p0?.alter ?? e.wahr.patientAlter ?? null;
    const kind = (alter ?? 99) < 15;
    const alle = store.list("hospitals").filter((h) => this.khImNetz(h) && !istFlughafenZiel(h.id));
    const ziel = bestesKh(khVorschlaege(alle, buchung(e.kh.grund), false, (h) => distanceM(mc, h) / 1000, { t: this.state.zeit, belegung: this.state.khBelegung, kind }))?.h;
    if (!ziel) return;
    const g0 = e.wahr.abfrage?.antworten.geschlecht;
    const geschlecht: "m" | "w" = g0 === "w" || g0 === "m" ? g0 : Math.random() < 0.5 ? "w" : "m";
    const e2 = new Set(ziel.einrichtungen ?? []);
    const bereich = ["amb_notaufnahme", "amb_unfall", "amb_kindernotaufnahme"].find((x) => e2.has(x)) ?? "amb_notaufnahme";
    const trauma = buchung(e.kh.grund)?.kategorie === "Trauma";
    const abholung = Math.round((this.state.zeit + rnd(20, 45) * MIN) / (5 * MIN)) * 5 * MIN;
    const d: KtDaten = {
      ...neueDaten(),
      art: "KTx",
      sofort: false,
      patient: { name: zufallsName(geschlecht), alter, geschlecht, info: `Erstversorgung im Medical Center Flughafen (Einsatz ${e.nummer})` },
      von: khOrt(mc, "amb_pvz"),
      nach: khOrt(ziel, bereich),
      grund: `Weiterversorgung nach Erstversorgung am Flughafen – Verdacht ${buchungName(e.kh.grund)}`,
      lage: trauma || Math.random() < 0.4 ? "liegend" : "sitzend",
      abholung,
      telefon: "01 7007 22245",
    };
    const k = this.ktNeu(d, "hotline");
    e.mcUeberstellung = k.id;
    this.log(e, `Medical Center Flughafen: Patient wird ins ${ziel.kurzname || ziel.name} überstellt – Anruf an der KT-Hotline`);
    this.emit();
  }

  /** Grundbelegung der Krankenhäuser fortschreiben (einmal pro Simulationsminute) */
  private khTick(t: number): void {
    const b = (this.state.khBelegung ??= {});
    const letzte = this.state.khGrundZeit ?? t;
    const dt = (t - letzte) / MIN;
    if (dt < 1 && this.state.khGrundZeit !== undefined) return;
    this.state.khGrundZeit = t;
    const an = this.settings.khGrundAktiv !== false;
    grundbelegungTick(b, store.list("hospitals"), t, Math.min(dt || 1, 30), an ? (this.settings.khGrundFaktor ?? 1) : 0);
  }

  /** Platz im gebuchten Krankenhaus belegen (ab Buchung bis Ende der Behandlung) */
  private khPlatzBelegen(e: Einsatz): void {
    const b = (this.state.khBelegung ??= {});
    // frühere Reservierung dieses Einsatzes lösen (Umbuchung)
    for (const proKh of Object.values(b)) for (const liste of Object.values(proKh)) if (liste) for (let i = liste.length - 1; i >= 0; i--) if (liste[i].einsatz === e.id) liste.splice(i, 1);
    if (!e.kh) return;
    const h = store.get("hospitals", e.kh.hospitalId);
    if (!h) return;
    const t = this.state.zeit;
    const bu = buchung(e.kh.grund);
    const eig = khEignung(h, bu, this.patientRot(e)) ?? "rueckfall";
    const kind = (e.wahr.lage?.patienten[0]?.alter ?? e.wahr.patientAlter) < 15;
    const p = platzFuer(h, b, ressourcenFuer(bu?.id, eig, kind), t);
    if (!p) return;
    const def = RESSOURCE.get(p.r)!;
    const fahrt = (distanceM(e.wahr, h) / 1000) * 1.3 * MIN;
    ((b[h.id] ??= {})[p.r] ??= []).push({ bis: t + fahrt + rnd(def.dauer[0], def.dauer[1]) * MIN, einsatz: e.id });
  }

  /** Bucht automatisch das nächstgelegene passende Krankenhaus (RTW bucht selbst). */
  private bucheKhAuto(e: Einsatz, von: string): void {
    const verdacht = this.verdacht(e);
    const kind = (e.wahr.lage?.patienten[0]?.alter ?? e.wahr.patientAlter) < 15;
    const ziel = (this.hubschrauberTransport(e) && this.naechstesKh(e.wahr, verdacht, this.patientRot(e), kind, true)) || this.naechstesKh(e.wahr, verdacht, this.patientRot(e), kind);
    if (!ziel) return;
    e.verdacht = verdacht;
    e.kh = { hospitalId: ziel.id, grund: verdacht, durch: "rtw", zeit: this.state.zeit };
    e.zo = { lat: ziel.lat, lon: ziel.lon, label: ziel.name };
    e.khAnfrage = null;
    this.log(e, `${von} bucht ${ziel.name} (Verdacht ${buchungName(verdacht)})`);
    this.funk(von, e.id, `KH gebucht: ${ziel.kurzname || ziel.name} – Verdacht ${buchungName(verdacht)}`, "info");
    this.khPlatzBelegen(e);
    this.startTransport(e);
  }

  /** Bestes Krankenhaus zur Verdachtsdiagnose (passend vor Ausweichen, sonst Rückfall) */
  naechstesKh(pos: LatLon, verdacht: string, rot: boolean, kind = false, nurLandeplatz = false): Hospital | undefined {
    return bestesKh(this.khFuer(pos, verdacht, rot, kind, nurLandeplatz))?.h;
  }

  /** Transportiert in diesem Einsatz ein Hubschrauber den Patienten? */
  private hubschrauberTransport(e: Einsatz): boolean {
    return this.einsatzFz(e).some((x) => fliegt(x) && x.begleitet);
  }

  /** Hubschrauber soll in ein Haus ohne Landeplatz: Patient fährt bodengebunden, Hubschrauber ist frei */
  private ohneLandeplatz(fz: SimFahrzeug, e: Einsatz, h: Hospital): boolean {
    if (!fliegt(fz) || khLandung(h) !== null) return false;
    fz.begleitet = false;
    this.log(e, `${fz.funkrufname}: ${h.kurzname || h.name} hat keinen Hubschrauberlandeplatz – Patient wird bodengebunden transportiert`);
    this.funk(fz.funkrufname, e.id, `${h.kurzname || h.name} hat keinen Landeplatz – Transport bodengebunden, ${fz.funkrufname} frei`, "info");
    this.freigeben(fz);
    return true;
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
    const rv = e.rendezvous && e.rendezvous.status !== "fertig" ? e.rendezvous : null;
    for (const id of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[id];
      if (!fz || fz.phase !== "warteKH") continue;
      // Rendezvous: erst zum Treffpunkt
      if (rv && (id === rv.rtwId || id === rv.nefId)) continue;
      if (this.ohneLandeplatz(fz, e, h)) continue;
      this.setStatus(fz, "zumZO");
      this.fahre(fz, h, "transport", this.kritisch(e));
      if (this.transportfaehig(fz)) this.polizeiBegleitung(e, fz, h);
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
    fz.nachNa = null;
    this.setStatus(fz, "freiFunk");
    if (fz.pilot) {
      // Spieler-NAH: bleibt, wo er ist – der Pilot fliegt selbst zurück und drückt dort Status 1
      fz.phase = "frei";
      fz.phaseEnde = null;
      fz.pilot.plan = null;
    } else if (distanceM(fz, fz.heim) < 80) {
      fz.naAnBord = false;
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
    return this.settings.stufen.find((s) => s.stufe === stufe) ?? stufeRaten(stufe) ?? store.uebersetzung.stufen[stufe] ?? defaultStufeFuer(stufe);
  }

  log(e: Einsatz, text: string): void {
    const p: Protokoll = { zeit: this.state.zeit, text };
    if (this.actor && this.mode !== "solo") p.von = this.actor.name;
    e.protokoll.push(p);
  }

  funk(von: string, einsatzId: string | null, text: string, art: Funkmeldung["art"]): void {
    // Einsätze der Nachbarzone laufen auf deren Funk – man hört sie nur, wenn man selbst anfunkt
    if (this.stumm || (einsatzId && this.einsatz(einsatzId)?.fremd)) return;
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
      nummer: this.fallWunsch?.probe ? "PROBE" : this.neueNummer(),
      erstellt: this.state.zeit,
      zustand: "neu",
      wahr: {
        lat: p.lat,
        lon: p.lon,
        adresse: p.adresse,
        code: p.code.code,
        patientAlter: alter,
        transport,
        rtwBuchtSelbst: true,
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
    // Polizei ist schon dort (Anforderung durch die Polizei): Einsatzort gilt als sicher
    for (const art of partnerSchonDa(p.fall?.kapitel)) {
      (e.partner ??= {})[art] = this.state.zeit;
      (e.partnerDa ??= {})[art] = this.state.zeit;
      if (art === "pol") e.boSicher = this.state.zeit;
    }
    if (p.fall && store.schema) {
      const schema = store.schema;
      /** Wahrheit für Anrufer und Lage (mit dem, was das Schema nicht abfragen kann) */
      const wahr = (f: Fall): Antworten => (f.roh ? { ...f.antworten, ...f.roh } : f.antworten);
      const vorlage = p.fall.vorlage ? (fallVorlage(p.fall.vorlage) ?? SZENARIEN.find((v) => v.id === p.fall!.vorlage)) : undefined;
      const ortArt: OrtArt | undefined = p.fall.ortArt ?? vorlage?.orte[0];
      const anrufer = anruferWaehlen(
        p.fall.kapitel,
        wahr(p.fall),
        Math.random,
        gemeldet,
        vorlage && ortArt ? { typen: vorlage.anrufer, ort: ORT_LABEL[ortArt], ortArt, ortKat: p.fall.ortKat, geschlossen: p.fall.geschlossen } : undefined,
        this.einrichtungAmOrt(p.lat, p.lon),
      );
      // Ruft Pflege, Arzt oder Ordination an, fragt man in Kapitel 33 ab (Anforderung durch Einrichtung) –
      // dann muss auch die richtige Lösung dort liegen
      if (anrufer.art === "einrichtung" && !ist(p.fall.kapitel, "anforderung_arzt", "anforderung_polizei", "anforderung_ls", "ecall", "alpin")) {
        const neu = alsAnforderung33(schema, p.fall);
        if (neu) {
          p.fall = neu;
          e.wahr.code = neu.code;
        }
      }
      let szenario: Szenario | undefined;
      if (vorlage) {
        const a = wahr(p.fall);
        const w = a.geschlecht === "w";
        const alt = typeof a.alter === "number" ? a.alter : alter;
        // Familie heißt gleich
        // („Pflegeheim“ enthält „ehe“ – deshalb nach Typ bzw. ganzen Wörtern)
        const familie = ["partner", "kind", "eltern"].includes(anrufer.typ ?? "") || /\b(ehefrau|ehemann|lebensgef\w*|mutter|vater|tochter|sohn)\b/i.test(anrufer.rolle);
        let neu = zufallsName(w ? "w" : "m");
        // Fremde heißen nicht zufällig gleich wie der Anrufer
        for (let i = 0; i < 5 && !familie && !anrufer.selbst && neu.split(" ").slice(1).join(" ") === anrufer.name.split(" ").slice(1).join(" "); i++) neu = zufallsName(w ? "w" : "m");
        // … und niemand heißt mit Vornamen gleich wie der Anrufer (Mutter Sophie, Tochter Sophie)
        for (let i = 0; i < 8 && !anrufer.selbst && neu.split(" ")[0] === anrufer.name.split(" ")[0]; i++) neu = zufallsName(w ? "w" : "m");
        const pname = anrufer.selbst ? anrufer.name : familie ? `${neu.split(" ")[0]} ${anrufer.name.split(" ").slice(1).join(" ")}` : neu;
        const merkmale = store.schema ? merkmaleAusSchema(store.schema, a) : { ...a };
        // Fallkatalog: Texte mit [variante=…] gelten nur für die gezogene Variante
        if (p.fall.katalog) merkmale.variante = p.fall.katalog.variante;
        const privat = (anrufer.art ?? "privat") === "privat";
        // Persönlichkeit (Wissen, Art zu reden, Einstieg …) – auch Texte mit [wissen=fremd] bzw. [anrufer=…] richten sich danach
        if (privat || anrufer.art === "einrichtung") {
          const [vn, ...nn] = pname.split(" ");
          anrufer.persona = personaWaehlen(
            anrufer,
            { alter: alt, w, vorname: vn, nachname: nn.join(" "), wach: (a.bw ?? "ja") === "ja" || a.bw === "getruebt", sicht: !vorlage.ohneSicht },
            { ortUnbekannt: false, draussen: !!ortArt && ORT_IM_FREIEN.includes(ortArt), zuhause: !ortArt || ["wohnung", "haus", "garten"].includes(ortArt), oeffentlich: !!ortArt && ["geschaeft", "lokal", "bahnhof", "sport", "freizeit", "schule", "arbeit", "baustelle", "arzt"].includes(ortArt) },
            Math.random,
          );
          merkmale.wissen = anrufer.persona.wissen;
        }
        if (anrufer.typ) merkmale.anrufer_typ = anrufer.typ;
        szenario = szenarioBauen(vorlage, merkmale, { bezug: bezugFuer(anrufer.rolle, anrufer.selbst, w, alt), selbst: anrufer.selbst, ort: p.gemeinde ?? gemeindeVon(p.adresse), name: pname, ortArt, ortKat: p.fall.ortKat, geschlossen: p.fall.geschlossen }, Math.random);
        for (const x of ["variante", "wissen", "anrufer_typ", "ort", "ortkat", "selbst"]) delete szenario.zusatz[x];
        const st = stimmungAusVerlauf(szenario.verlauf);
        if (st && privat) anrufer.emotion = st;
      }
      e.wahr.abfrage = {
        kapitel: p.fall.kapitel,
        antworten: p.fall.antworten,
        code: p.fall.code,
        anrufer,
        lage: `${schema.codes[p.fall.code]?.name ?? p.code.beschreibung} (${schema.kapitel[p.fall.kapitel]?.titel ?? ""})`,
        szenario,
        ...(p.fall.roh && Object.keys(p.fall.roh).length ? { roh: p.fall.roh } : {}),
      };
      e.meldung.text = "";
      const fv = p.fall.katalog ? fallVorlage(p.fall.katalog.id) : undefined;
      const fvar = fv && p.fall.katalog ? fallVariante(fv, p.fall.katalog.variante) : undefined;
      if (fv && fvar) {
        e.wahr.lage = lageAusFall(fv.id, fvar, store.schema ? merkmaleAusSchema(store.schema, wahr(p.fall)) : wahr(p.fall), this.state.zeit);
        e.wahr.transport = fvar.transport !== false;
      } else e.wahr.lage = lageErzeugen(p.fall.kapitel, wahr(p.fall), this.state.zeit, kritisch, this.settings.komplikationen ?? "normal");
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
    // Probe aus dem Fall-Editor: nur die Wahrheit bauen, nicht ins Spiel nehmen
    if (this.fallWunsch?.probe) return e;
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
    this.bereitstellungPruefen(e, fahrzeugIds);
    for (const fid of fahrzeugIds) {
      const fz = this.state.fahrzeuge[fid];
      if (!fz) continue;
      const abziehen = this.ktAbziehbar(fz);
      if (!this.verfuegbar(fz) && !abziehen) {
        hinweise.push(`${fz.funkrufname} ist nicht verfügbar`);
        continue;
      }
      // Flughafenambulanz fährt nur am Flughafengelände
      if (istFlughafenFz(fz) && !amFlughafen(e.adresse)) {
        hinweise.push(`${fz.funkrufname} fährt nur am Flughafengelände`);
        continue;
      }
      // über der Dienstzeit (Wechsel ausständig / Dienstende): nur vormerken – alarmiert wird erst nach dem Anfunken
      if (fz.wechselOffen && !this.ueberzeitFreigabe.has(fz.id)) {
        if (fz.ueberzeitFuer !== e.id) {
          fz.ueberzeitFuer = e.id;
          this.log(e, `${fz.funkrufname} vorgemerkt (${fz.wechselOffen === "ende" ? "Dienstende vorbei" : "Wechsel ausständig"}) – zuerst anfunken`);
        }
        hinweise.push(`${fz.funkrufname} vorgemerkt – ${fz.wechselOffen === "ende" ? "über Dienstende" : "Wechsel ausständig"}: zuerst anfunken und fragen, ob sie den Einsatz noch übernehmen`);
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
      fz.ueberzeitFuer = null;
      fz.einsatzId = e.id;
      if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id);
      const sek = this.ausrueckSek(fz, false);
      const aufWache = fz.status === "freiWache" || (fz.status === "bereitschaft" && fz.phase !== "rueckfahrt");
      fz.quittUm = null;
      this.setStatus(fz, aufWache ? "alarmWache" : "alarmFunk");
      fz.fahrt = null;
      fz.phase = "ausruecken";
      fz.phaseEnde = this.state.zeit + sek * 1000;
      fz.alarmUm = this.state.zeit;
      this.log(e, `${fz.funkrufname} alarmiert`);
      // Fahrzeug von außerhalb der Funkgruppe: wechselt für den Einsatz auf unsere Gruppe
      const fg = this.funkgruppe();
      if (!inFunkgruppe(fg, fz.heim.lat, fz.heim.lon)) {
        this.log(e, `${fz.funkrufname} wechselt auf TETRA ${fg.id}`);
        this.funk(fz.funkrufname, e.id, `wechselt auf TETRA ${fg.id}`, "info");
      }
    }
    this.nefNachRtw(e);
    if (e.fahrzeuge.length > 0) e.zustand = "laufend";
    this.emit();
    return hinweise;
  }

  /**
   * Gleichzeitig alarmiert (innerhalb einer Minute): ein NEF von der Wache rückt immer nach dem RTW aus –
   * der Notarzt muss erst dazukommen. (Später: Notarzt-Abholstützpunkte je NEF.)
   */
  private nefNachRtw(e: Einsatz): void {
    const jetzt = this.state.zeit;
    const fz = e.fahrzeuge.map((id) => this.state.fahrzeuge[id]).filter((f): f is SimFahrzeug => !!f && f.phase === "ausruecken" && jetzt - (f.alarmUm ?? -1e15) <= 60_000);
    const rtwEnde = Math.max(...fz.filter((f) => f.kategorie !== "NEF" && !fliegt(f)).map((f) => f.phaseEnde ?? 0), 0);
    if (!rtwEnde) return;
    for (const nef of fz.filter((f) => f.kategorie === "NEF" && f.status === "alarmWache"))
      if ((nef.phaseEnde ?? 0) < rtwEnde + 20_000) nef.phaseEnde = rtwEnde + rnd(20, 90) * 1000;
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
      // NEF streut stärker als RTW/KTW
      if (fz.kategorie === "NEF") return z(tag ? (a.nefTag ?? [20, 240]) : (a.nefNacht ?? [90, 780]));
      return z(tag ? a.bodenTag : a.bodenNacht);
    };
    if (fz.status === "freiWache") return wache();
    // Bereitschaft unterwegs (NEF nach dem Zurückbringen des Notarztes): wie unterwegs
    if (fz.status === "bereitschaft" && fz.phase !== "rueckfahrt") return wache() + a.bereitschaftPlusMin * 60;
    return schaetzung ? a.unterwegs : a.unterwegs * rnd(0.7, 1.5);
  }

  /** Disponent bucht ein Krankenhaus. */
  bucheKh(id: string, hospitalId: string, grund: string): void {
    const e = this.einsatz(id);
    const h = store.get("hospitals", hospitalId);
    if (!e || !h) return;
    e.kh = { hospitalId, grund, durch: "dispo", zeit: this.state.zeit };
    e.zo = { lat: h.lat, lon: h.lon, label: h.name };
    e.khAnfrage = null;
    if (grund) e.verdacht ??= grund;
    this.log(e, `KH gebucht durch Leitstelle: ${h.name}${grund ? ` (${buchungName(grund)})` : ""}`);
    this.khPlatzBelegen(e);
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
    for (const u of this.partnerVon(e)) if (u.phase !== "rueckfahrt") this.partnerHeim(u);
    this.log(e, `Einsatz geschlossen: ${grund}`);
    this.emit();
  }

  /** Fahrzeuge mit Fahrzeit zum Einsatzort, sortiert. */
  async vorschlaege(id: string): Promise<Vorschlag[]> {
    const e = this.einsatz(id);
    if (!e?.adresse) return [];
    return this.vorschlaegeAn(e.adresse, this.faktor(e));
  }

  /** Fahrzeuge mit Ankunftszeit zu einem Ziel (faktor = Sondersignal-Faktor) */
  async vorschlaegeAn(ziel: LatLon, faktor: number): Promise<Vorschlag[]> {
    // Flughafenambulanz: nur für Einsätze am Flughafengelände
    const amFh = amFlughafen(ziel);
    const frei = Object.values(this.state.fahrzeuge).filter((f) => (this.verfuegbar(f) || this.ktAbziehbar(f)) && (amFh || !istFlughafenFz(f)));
    const boden = frei.filter((f) => !fliegt(f));
    const umweg = boden.map((f) => this.naUmweg(f));
    const zeiten = await travelTimes(ziel, boden.map((f, i) => umweg[i]?.start ?? { lat: f.lat, lon: f.lon }));
    const out = boden.map((fz, i) => {
      const z = zeiten[i] === null ? null : zeiten[i]! + (umweg[i]?.sek ?? 0);
      const ausr = this.ausrueckSek(fz, true);
      // KT-Fahrzeug ohne Patient: nur auf ausdrückliche Wahl (nicht in der Empfehlung)
      // von außen auf das Flughafengelände (oder hinaus): eine Minute Sicherheitskontrolle
      const kontrolle = istFlughafenFz(fz) ? 0 : kontrolleSek(fz, ziel);
      return { fz, sekunden: z === null ? null : z * (fz.ohneBlaulicht ? 1 : faktor) + ausr + kontrolle, hinweis: null as string | null, kt: !!fz.kt?.aktiv };
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
    const acnFrei = nutzbar.find((v) => v.fz.rmTyp === "ACN");

    const rangListe = raenge(stufe);
    // ACN-Code: nur die ACN fährt hin – ist keine frei, wartet der Einsatz (keine zeitliche Dringlichkeit)
    if (rangListe.flat().every((t) => t === "ACN")) {
      if (imEinsatz.length) return { ids, gruende, oben };
      if (acnFrei) {
        ids.push(acnFrei.fz.id);
        gruende.push(`${acnFrei.fz.funkrufname} (ACN, ${min(acnFrei.sekunden!)}): Akutpflege zu Hause`);
      } else gruende.push("Keine ACN frei – der Einsatz wartet, bis eine frei wird");
      return { ids, gruende, oben };
    }
    if (!rm && rangListe.length) {
      // NAW (RTW-C und Notarzt in einem): steht für einen RTW-C oder einen RTW mit Notarzt; braucht es nur einen RTW,
      // kommt er erst nach dem RTW dran (Vorgabe Paul)
      const rangC = rangListe.findIndex((g) => g.includes("RTW-C"));
      const rangR = rangListe.findIndex((g) => g.includes("RTW"));
      const rangK = rangListe.findIndex((g) => g.includes("KTW"));
      const nawRang = Math.min(...[rangC, rangR, rangK].filter((x) => x >= 0));
      // nur ein RTW nötig (RTW vor RTW-C, kein Notarzt): NAW knapp hinter dem RTW
      const nawNach = stufe.notarzt === "nein" && !(rangC >= 0 && rangC === nawRang);
      let best: { v: Vorschlag; punkte: number; rang: number } | null = null;
      for (const v of nutzbar) {
        // „KTW-B“ kann in der Rangfolge eigens stehen, sonst zählt er als KTW
        const eigen = v.fz.typ?.toUpperCase();
        let r = eigen && eigen !== v.fz.rmTyp ? rangListe.findIndex((g) => g.includes(eigen)) : -1;
        if (r < 0) r = rangListe.findIndex((g) => g.includes(v.fz.rmTyp));
        if (r < 0 && v.fz.rmTyp === "NAW" && Number.isFinite(nawRang)) r = nawRang;
        if (r < 0) continue;
        let punkte = v.sekunden! + r * tol;
        if (v.fz.rmTyp === "NAW") punkte += stufe.notarzt !== "nein" ? -tol : nawNach ? tol / 2 : 0;
        // Flughafenambulanz ist schon am Gelände: ihr RTW geht vor Fahrzeugen von außen (die durch die Kontrolle müssen)
        else if (istFlughafenFz(v.fz)) punkte -= tol;
        if (stufe.nfsErforderlich && !hatNFS(v.fz.besetzung)) punkte += tol;
        // KTW-B fährt ohne Blaulicht: bei Blaulicht-Einsätzen nachrangig
        if (v.fz.ohneBlaulicht && stufe.sondersignal) punkte += tol;
        if (!best || punkte < best.punkte) best = { v, punkte, rang: r };
      }
      if (best) {
        rm = best.v.fz;
        ids.push(rm.id);
        const text = `${rm.funkrufname} (${rm.typ ?? rm.rmTyp}${rm.ohneBlaulicht && stufe.sondersignal ? ", ohne Blaulicht" : ""}, ${min(best.v.sekunden!)})`;
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
    // Kein NFS am Rettungsmittel (z. B. nur ein RS-RTW, weil der RTW-C nicht frei ist): eine freie ACN (NKI)
    // ersetzt den Notarzt, wenn sie nicht später als NEF/NAH da ist – spart Notarztmittel
    if (!arzt && regel === "nef" && stufe.notarzt === "nein" && nfsFehlt && !imEinsatz.some((f) => f.rmTyp === "ACN") && acnFrei) {
      const naSek = Math.min(...nutzbar.filter((v) => v.fz.rmTyp === "NEF" || v.fz.rmTyp === "NAH").map((v) => v.sekunden!), Number.POSITIVE_INFINITY);
      if (acnFrei.sekunden! <= naSek + tol) {
        ids.push(acnFrei.fz.id);
        gruende.push(`${acnFrei.fz.funkrufname} (ACN, ${min(acnFrei.sekunden!)}): kein NFS am Rettungsmittel – ACN (NKI) statt Notarzt`);
        arzt = acnFrei.fz;
      }
    }
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
    // ACN als First Responder: Notarzt-Einsatz (ALS orange/rot) und die ACN ist das nächste Fahrzeug
    if (stufe.notarzt !== "nein" && acnFrei && !ids.includes(acnFrei.fz.id) && !imEinsatz.some((f) => f.rmTyp === "ACN")) {
      const andere = [...ids.map((x) => nutzbar.find((v) => v.fz.id === x)?.sekunden ?? Number.POSITIVE_INFINITY), ...imEinsatz.map((f) => (f.phase === "vorOrt" ? 0 : (f.phaseEnde ?? Number.POSITIVE_INFINITY) - this.state.zeit) / (f.phase === "vorOrt" ? 1 : 1000))];
      if (andere.length && acnFrei.sekunden! < Math.min(...andere)) {
        ids.push(acnFrei.fz.id);
        gruende.push(`${acnFrei.fz.funkrufname} (ACN, ${min(acnFrei.sekunden!)}): First Responder – ist als Erstes beim Patienten`);
      }
    }
    // BEL bei Großeinsätzen: mehrere Rettungsmittel oder Großaufgebot (Feuerwehr/Polizei)
    if (!imEinsatz.some((f) => f.rmTyp === "BEL")) {
      const transport = imEinsatz.filter((f) => this.transportfaehig(f)).length + (rm && !imEinsatz.includes(rm) ? 1 : 0);
      const offen = (e.nachforderungen ?? []).filter((n) => !n.erledigt && n.art === "RTW").reduce((a, n) => a + n.anzahl, 0);
      const kap = e.wahr.abfrage?.kapitel ?? "";
      const gross = stufe.kategorie === "kritisch" && ist(kap, "verkehrsunfall", "eingeklemmt", "brand", "gefahrstoff", "ecall", "anforderung_ls");
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
    const proStunde = (this.settings.stunden?.[h]?.rd ?? 6) * AUFKOMMEN_FAKTOR[this.settings.aufkommenStufe ?? "normal"];
    const anteile = this.settings.aufkommen;
    const summe = (["stabil", "dringend", "kritisch"] as Kategorie[]).reduce((a, k) => a + Math.max(0, anteile[k] ?? 0), 0) || 1;
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) {
      const rate = (proStunde * Math.max(0, anteile[k] ?? 0)) / summe;
      if (Math.random() < (rate * dt) / 3_600_000) void this.generiere(k);
    }
    // ACN: Akutpflege zu Hause, je Standort (dessen ACN gerade Dienst hat) einige pro Tag
    const acnRate = this.settings.acnProTag ?? 2;
    if (acnRate > 0) {
      const g = this.funkgruppe();
      const standorte = new Set(Object.values(this.state.fahrzeuge).filter((f) => f.rmTyp === "ACN" && !f.ausserDienst && inFunkgruppe(g, f.heim.lat, f.heim.lon)).map((f) => f.stationId));
      for (const st of standorte) if (Math.random() < (acnRate * dt) / 86_400_000) void this.generiereAcn(st);
    }
    // Flughafen Wien (selten): angekündigter Notfall an Bord, Notfall an Bord am Gate, Arbeitsunfall beim Personal
    if (inFunkgruppe(this.funkgruppe(), NOTFALL_STAND.lat, NOTFALL_STAND.lon)) {
      const f = AUFKOMMEN_FAKTOR[this.settings.aufkommenStufe ?? "normal"];
      for (const [art, proTag] of FLUGHAFEN_PRO_TAG) if (Math.random() < (proTag * f * dt) / 86_400_000) void this.generiereFlughafen(art);
    }
    // Work in Progress: Einsätze in Nachbarzonen
    if (this.settings.fremdzoneAktiv && Math.random() < ((this.settings.fremdzoneProStunde ?? 1) * dt) / 3_600_000) void this.generiereFremd();
  }

  private stumm = 0;
  private fremdLaeuft = false;

  /**
   * ACN-Einsatz (Akutpflege zu Hause): kommt über die Gesundheitsberatung 1450 schon mit ACN-Code herein,
   * Adresse im Umkreis des ACN-Standorts, meist ältere Patienten. Keine zeitliche Dringlichkeit.
   */
  async generiereAcn(stationId?: string): Promise<Einsatz | null> {
    if (!hasCodes()) return null;
    const g = this.funkgruppe();
    const acns = Object.values(this.state.fahrzeuge).filter((f) => f.rmTyp === "ACN" && inFunkgruppe(g, f.heim.lat, f.heim.lon) && (!stationId || f.stationId === stationId));
    if (!acns.length) return null;
    const basis = pick(acns).heim;
    let adr: Awaited<ReturnType<typeof randomAddresses>>[number] | null = null;
    for (let i = 0; i < 6 && !adr; i++) {
      const p = versetzt(basis.lat, basis.lon, rnd(300, 15000), rnd(0, 360));
      const d = 0.01;
      const hits = (await randomAddresses([p.lon - d, p.lat - d, p.lon + d, p.lat + d], 6)).filter((h) => !h.place && inFunkgruppe(g, h.lat, h.lon));
      adr = hits[0] ?? null;
    }
    if (!adr) return null;
    const gew: [string, number][] = [["ACN-O1", 25], ["ACN-O3", 20], ["ACN-O2", 12], ["ACN-O4", 12], ["ACN-O7", 10], ["ACN-O5", 8], ["ACN-O8", 7], ["ACN-O6", 6]];
    let r = Math.random() * gew.reduce((a, [, w]) => a + w, 0);
    let wahl = gew[0][0];
    for (const [c, w] of gew) if ((r -= w) <= 0) {
      wahl = c;
      break;
    }
    const code = findCode(wahl) ?? ACN_CODES.find((c) => c.code === wahl)!;
    const alter = Math.round(Math.random() < 0.7 ? rnd(75, 96) : rnd(55, 75));
    const w = Math.random() < 0.6;
    const label = adr.label;
    const e = this.erstelleEinsatz({
      lat: adr.lat,
      lon: adr.lon,
      adresse: label,
      code,
      meldung: `Gesundheitsberatung 1450: ${code.beschreibung}. ${w ? "Patientin" : "Patient"} ca. ${alter} Jahre, zu Hause. Keine zeitliche Dringlichkeit.`,
      patientAlter: alter,
      transport: false,
    });
    e.adresse = { lat: adr.lat, lon: adr.lon, label };
    e.bo = e.adresse;
    e.code = code.code;
    e.codeQuelle = "abfrage";
    this.log(e, `Von der Gesundheitsberatung 1450 übernommen (${code.code})`);
    this.emit();
    return e;
  }

  /**
   * Einsatz in einer Nachbarzone (Work in Progress): der Kollege dort legt ihn mit dem planmäßigen Code an und
   * disponiert nach dem Vorschlag. Angezeigt wird er nur, wenn eigene Fahrzeuge hinfahren – was die Nachbarzone
   * schneller selbst schafft (dort sind noch kaum Fahrzeuge hinterlegt: simuliert), fährt nicht.
   * Nur normale Einsätze mit einem Patienten, meist mit Notarzt (NEF).
   */
  async generiereFremd(): Promise<Einsatz | null> {
    if (this.fremdLaeuft || !hasCodes()) return null;
    this.fremdLaeuft = true;
    try {
      const g = this.funkgruppe();
      // Ausgangspunkt: ein freies eigenes Fahrzeug (meist NEF) – der Einsatz liegt ein Stück außerhalb der Zone
      const eigene = Object.values(this.state.fahrzeuge).filter((f) => this.verfuegbar(f) && inFunkgruppe(g, f.heim.lat, f.heim.lon));
      const nefs = eigene.filter((f) => f.rmTyp === "NEF");
      const rms = eigene.filter((f) => this.transportfaehig(f));
      let adr: Awaited<ReturnType<typeof randomAddresses>>[number] | null = null;
      let zone: Funkgruppe | undefined;
      for (let i = 0; i < 8 && !adr; i++) {
        const basis = Math.random() < 0.8 && nefs.length ? pick(nefs) : rms.length ? pick(rms) : null;
        if (!basis) return null;
        const p = versetzt(basis.heim.lat, basis.heim.lon, rnd(5000, 16000), rnd(0, 360));
        const d = 0.02;
        const hits = await randomAddresses([p.lon - d, p.lat - d, p.lon + d, p.lat + d], 8);
        for (const h of hits) {
          if (h.place || inFunkgruppe(g, h.lat, h.lon)) continue;
          zone = FUNKGRUPPEN.find((x) => x.id !== g.id && inFunkgruppe(x, h.lat, h.lon));
          if (zone) {
            adr = h;
            break;
          }
        }
      }
      if (!adr || !zone) return null;
      // nicht in der Gegend eines Notrufs, der gerade läutet oder abgefragt wird
      if (this.state.einsaetze.some((x) => x.anruf && ["klingelt", "aktiv", "gehalten"].includes(x.anruf.status) && distanceM(x.wahr, adr!) < 15_000)) return null;
      const code = this.fremdCode();
      if (!code) return null;
      const stufe = this.stufeDef(code.stufe);
      const liste = await this.vorschlaegeAn(adr, stufe?.sondersignal ? this.settings.sondersignalFaktor : 1);
      // Kräfte der Nachbarzone (simuliert): wer langsamer wäre, fährt nicht
      const grenzeRm = rnd(8, 15) * 60;
      const grenzeNa = rnd(12, 22) * 60;
      const gefiltert = liste.filter((v) => {
        if (v.sekunden === null || v.hinweis || v.kt) return false;
        if (this.transportfaehig(v.fz)) {
          // KTW nur, wenn die Stufe ohnehin zuerst einen KTW will
          if (v.fz.rmTyp === "KTW" && !(stufe ? (raenge(stufe)[0] ?? []) : []).some((t) => t.startsWith("KTW"))) return false;
          return v.sekunden <= grenzeRm;
        }
        if (v.fz.rmTyp === "NEF" || fliegt(v.fz)) return v.sekunden <= grenzeNa;
        return false;
      });
      const label = adr.label;
      this.stumm++;
      let e: Einsatz;
      try {
        e = this.erstelleEinsatz({ lat: adr.lat, lon: adr.lon, adresse: label, code, meldung: `${code.beschreibung}. Einsatz der Zone ${zone.id}.` });
      } finally {
        this.stumm--;
      }
      e.fremd = { zone: zone.id };
      e.adresse = { lat: adr.lat, lon: adr.lon, label };
      e.bo = e.adresse;
      e.code = code.code;
      e.codeQuelle = "dispo";
      e.zustand = "offen";
      e.wahr.rtwBuchtSelbst = true;
      // Partner (Feuerwehr, Polizei …) hat die Nachbarzone selbst alarmiert
      for (const x of this.partnerFehlt(e)) {
        (e.partner ??= {})[x.art] = this.state.zeit;
        (e.partnerDa ??= {})[x.art] = this.state.zeit;
      }
      e.boSicher = this.state.zeit;
      const { ids } = this.empfehlung(e.id, gefiltert);
      const meine = ids.filter((id) => {
        const f = this.state.fahrzeuge[id];
        return f && inFunkgruppe(g, f.heim.lat, f.heim.lon);
      });
      if (!meine.length) {
        this.state.einsaetze = this.state.einsaetze.filter((x) => x.id !== e.id);
        this.state.zaehler--;
        return null;
      }
      if (!ids.some((id) => this.state.fahrzeuge[id] && this.transportfaehig(this.state.fahrzeuge[id]))) e.fremd.rtwText = `Rettungswagen der Zone ${zone.id}`;
      e.zusatz = `Einsatz der Zone ${zone.id} – angelegt und disponiert vom Kollegen dort${e.fremd.rtwText ? `; ${e.fremd.rtwText} fährt mit` : ""}`;
      this.log(e, `Zone ${zone.id}: Einsatz angelegt (${code.code}), alarmiert ${ids.map((id) => this.state.fahrzeuge[id]?.funkrufname).join(", ")}`);
      this.alarmiere(e.id, ids);
      this.emit();
      return e;
    } finally {
      this.fremdLaeuft = false;
    }
  }

  /** Planmäßiger Code für einen Nachbarzonen-Einsatz: meist mit Notarzt, keine Großlagen, ein Patient */
  private fremdCode(): Einsatzcode | null {
    const codes = allCodes().filter((c) => {
      const st = this.stufeDef(c.stufe);
      if (!st || !st.rettungsmittel) return false;
      if (/Großunfall|Großschaden|Massen|MANV|mehrere|Mehrere|Alpin|Lawine/i.test(`${c.stufe} ${c.beschreibung}`)) return false;
      return !/Aufwertung|aufgewertet/i.test(c.beschreibung);
    });
    const na = codes.filter((c) => this.stufeDef(c.stufe)?.notarzt === "nef");
    const schnell = codes.filter((c) => this.stufeDef(c.stufe)?.notarzt === "schnellster");
    const sonst = codes.filter((c) => this.stufeDef(c.stufe)?.notarzt === "nein");
    const r = Math.random();
    const pool = r < 0.65 && na.length ? na : r < 0.85 && schnell.length ? schnell : sonst.length ? sonst : codes;
    return pool.length ? pick(pool) : null;
  }

  /** Erzeugt sofort einen Einsatz (Kategorie zufällig, wenn nicht angegeben). */
  async generiere(k?: Kategorie): Promise<Einsatz | null> {
    const s = this.settings;
    await stellenLaden();
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
    // Fallkatalog: der Fall (die Wahrheit) zuerst, alles andere wird daraus abgeleitet
    const katalogModus = this.fallWunsch ? "nur" : (s.fallKatalog ?? "nur");
    if (schema && katalogModus !== "aus" && (katalogModus === "nur" || Math.random() < 0.6)) {
      const kf = this.fallAusKatalog(schema);
      if (kf) {
        code = kf.code;
        fall = kf.fall;
      }
    }
    if (schema && !fall) {
      // Fall aus dem Abfrageschema ziehen: Antworten und Code passen garantiert zusammen
      const temp = this.temperatur();
      const lage = lageVon(this.state.wetter.lage);
      const wetter = this.settings.wetterAktiv;
      const glatt = lage === "eisregen" || (temp < 1 && ["schnee", "regen", "nebel"].includes(lageArt(lage)));
      const ctx = { jahreszeit: jahreszeitVon(this.state.zeit, this.wetterOpt()), stunde: new Date(this.state.zeit).getHours(), temp: wetter ? temp : 15, glatt: wetter && glatt };
      for (let i = 0; i < 400 && !fall; i++) {
        const kap = kapitelZiehen(schema, wetter ? (kp) => wetterFaktor(kp, temp, lage, this.state.wetter.wind ?? 0) : undefined);
        // Fallgeschichte zuerst: sie legt Ort, Hergang und die wichtigsten Antworten fest
        const vorlage = vorlageWaehlen(SZENARIEN, thema(kap, schema), ctx, Math.random);
        // Ort zuerst: manche Antworten hängen vom Ort ab (außerorts schneller als im Ort)
        const vFest = vorlage ? vorlageFest(vorlage, Math.random) : {};
        const vOrt = vorlage ? this.ortArtWaehlen(vorlage, typeof vFest.alter === "number" ? vFest.alter : null, vorlage.thema) : undefined;
        if (vorlage) ortRegeln(vOrt, vorlage.thema, vFest, new Set(Object.keys(vorlage.fest ?? {})));
        const fest = vorlage ? this.anpassen(schema, merkmaleInSchema(schema, vFest)) : { antworten: {}, roh: {} };
        let f = fallZiehen(schema, kap, Math.random, 0.04, fest.antworten);
        // fremdes Codesystem: zusammengesetzte Fragen aus den gewürfelten Merkmalen berechnen
        if (f && !store.uebersetzung.kompatibel) {
          const korr = this.anpassen(schema, Object.fromEntries(Object.entries(f.antworten).filter(([k]) => !istZusammengesetzt(schema, k))));
          const erg = bestimmeCode(schema, kap, korr.antworten);
          if (erg) f = { antworten: erg.antworten, ergebnis: erg };
        }
        const c = f ? findCode(f.ergebnis.code) : undefined;
        const name = `${c?.beschreibung ?? ""} ${c ? (schema.codes[c.code]?.name ?? "") : ""}`;
        if (
          f &&
          c &&
          passt(c.stufe) &&
          plausibel(f.ergebnis.pfad[0], f.antworten, name) &&
          (!wetter || passtZumWetter(f.ergebnis.pfad[0], f.antworten, name, temp, lage)) &&
          // Wasserrettung gibt es nur an manchen Gewässern: Person im Wasser nur, wo eine Ortsstelle ist
          (!partnerNoetig(f.ergebnis.pfad[0], f.antworten, name).some((x) => x.art === "wasser") || this.partnerStationenImGebiet("wasser").length > 0)
        ) {
          code = c;
          fall = { kapitel: f.ergebnis.pfad[0], antworten: f.antworten, code: c.code, ...(Object.keys(fest.roh).length ? { roh: fest.roh } : {}) };
          if (vorlage) {
            fall.vorlage = vorlage.id;
            fall.ortArt = vOrt ?? this.ortArtWaehlen(vorlage, typeof f.antworten.alter === "number" ? f.antworten.alter : null, thema(f.ergebnis.pfad[0]));
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
    // Person im Wasser: in der Nähe einer Wasserrettung (die liegen dort, wo so etwas passiert)
    const cname = `${code.beschreibung} ${schema?.codes[code.code]?.name ?? ""}`;
    const imWasser = !!fall && partnerNoetig(fall.kapitel, fall.antworten, cname).some((x) => x.art === "wasser");
    const vKat = fall?.vorlage ? (fallVorlage(fall.vorlage) ?? SZENARIEN.find((v) => v.id === fall!.vorlage))?.kategorien : undefined;
    // Person im offenen Gewässer: an einem echten See/Hafen in Reichweite einer Wasserrettung, sonst irgendwo in deren Nähe
    const wStationen = imWasser ? this.partnerStationenImGebiet("wasser") : [];
    const wasserPoi =
      imWasser && fall
        ? await this.poiAdresse("wasser", null, thema(fall.kapitel), vKat?.length ? vKat : ["badesee", "hafen"], (o) => wStationen.some((st) => distanceM(st, o) < 15000))
        : null;
    if (fall && wasserPoi?.kat) fall.ortKat = wasserPoi.kat;
    const wasserAdr = imWasser ? (wasserPoi ?? (await this.adresseNahe(pick(wStationen), 5000))) : null;
    // Anforderung durch Arzt/Pflege: meist aus einem echten Pflegeheim im Gebiet (die Adresse muss dazu passen)
    if (fall && !fall.ortArt && ist(fall.kapitel, "anforderung_arzt") && String(fall.antworten.anforderer ?? "normal") === "normal" && this.poisFuer("pflegeheim", null).length && Math.random() < 0.6)
      fall.ortArt = "pflegeheim";
    // passender echter Ort (Pflegeheim, Schule, Bahnhof …), wenn es einen im Gebiet gibt
    const vAuchZu = !!(fall?.vorlage && (fallVorlage(fall.vorlage) ?? SZENARIEN.find((v) => v.id === fall!.vorlage))?.auchGeschlossen);
    const poiAdr = !wasserAdr && fall?.ortArt ? await this.poiAdresse(fall.ortArt, typeof fall.antworten.alter === "number" ? fall.antworten.alter : null, thema(fall.kapitel), vKat, undefined, vAuchZu) : null;
    if (fall && poiAdr?.kat) fall.ortKat = poiAdr.kat;
    // Ort hat gerade zu (nur bei Fällen, die das erlauben): es passiert draußen davor
    if (fall && vAuchZu && (poiAdr?.geschlossen || (!poiAdr && fall.ortArt && !ortArtOffen(fall.ortArt, this.state.zeit)))) fall.geschlossen = true;
    let adr = wasserAdr ?? poiAdr ?? (await this.adresseImGebiet());
    if (!adr) return null;
    // Einsatzstelle ohne Hausnummer (Autobahn-Kilometer, Landstraße, Wald, Berg …): genau dort, der Anrufer beschreibt sie
    const stelleOhne = (adr as { stelle?: Einsatzstelle }).stelle;
    if (fall && stelleOhne && adr.number === "" && !adr.postcode) {
      const b = adr.label;
      // Autobahn und Landstraße findet der Disponent über die Suche („A1 85“, „B37 Gföhl“), sonst braucht es die Ortung
      const findbar = stelleOhne.typ === "autobahn" || stelleOhne.typ === "landstrasse";
      const e = this.erstelleEinsatz({
        lat: adr.lat,
        lon: adr.lon,
        adresse: findbar ? b.replace(/^auf der /, "") : `Koordinate ${adr.lat.toFixed(5)}, ${adr.lon.toFixed(5)} (${b})`,
        code,
        gemeldeteAdresse: b,
        gemeinde: stelleOhne.ort || undefined,
        fall,
        patientAlter: typeof fall.antworten.alter === "number" ? fall.antworten.alter : null,
      });
      if (e.wahr.abfrage && !findbar) e.wahr.abfrage.ortUnbekannt = true;
      return e;
    }
    let gemeldet = adr.label;
    // Manche Anrufer nennen eine falsche Adresse (andere Hausnummer derselben Straße)
    if (Math.random() * 100 < s.falscheAdresseProzent) {
      const andere = (await searchAddress(`${adr.street} ${adr.city}`, 40)).filter(
        (h) => !h.place && distanceM(h, adr!) > s.verortungRadius * 1.5,
      );
      if (andere.length) gemeldet = pick(andere).label;
    }
    const alter = typeof fall?.antworten.alter === "number" ? fall.antworten.alter : null;
    // Notruf aus der Natur: Anrufer weiß nicht genau, wo er ist (Ortung nötig)
    const vorlage = fall?.vorlage ? (fallVorlage(fall.vorlage) ?? SZENARIEN.find((v) => v.id === fall!.vorlage)) : undefined;
    let draussen: string | null = null;
    if (vorlage) {
      // Geschichte im Freien (Wald, Feldweg, Landstraße): Ort nur grob bekannt
      if (vorlage.wo?.length && (fall!.ortArt === "natur" || (fall!.ortArt === "strasse" && Math.random() < 0.5))) {
        // Verirrt in der Natur (Bergrettung nötig): meist dort, wo es eine Bergrettung gibt
        if (fall!.ortArt === "natur") {
          const berg = this.partnerStationenImGebiet("berg");
          const nah = berg.some((b) => distanceM(b, adr!) < 15000);
          if (!nah && berg.length && Math.random() < 0.7) adr = (await this.adresseNahe(pick(berg), 8000)) ?? adr;
          else if (!nah && !berg.length && Math.random() < 0.5) {
            // keine Bergrettung im Gebiet: der Anrufer weiß meist, wo er ist
            return this.erstelleEinsatz({ lat: adr.lat, lon: adr.lon, adresse: adr.label, code, gemeldeteAdresse: gemeldet, fall, patientAlter: alter });
          }
        }
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

  // ------------------------------------------------------------------ Flughafen Wien

  /**
   * Notfall am Flughafen, bei dem die Flughafen-Leitstelle anruft (Vorgabe Paul):
   * - landung: angekündigter Notfall an Bord – Landung in 10–25 Minuten, Fahrzeuge warten am Warteort
   * - flugzeug: Notfall an Bord eines gelandeten Flugzeugs (Gate oder Außenposition)
   * - personal: Arbeitsunfall bzw. Notfall beim Personal (Hangar, Vorfeld, Fracht, Gepäcksortierung)
   * Die Leitstelle ist nicht beim Patienten: sie kennt nur Krankheitsbild, Bewusstsein, Alter und Geschlecht.
   */
  async generiereFlughafen(art: FlughafenArt = pick(["landung", "flugzeug", "personal"] as FlughafenArt[]), landungInMin?: number): Promise<Einsatz | null> {
    const schema = this.settings.anrufe ? store.schema : null;
    if (!schema || !hasCodes()) return null;
    const kats: Record<FlughafenArt, string[]> = {
      landung: ["flughafen_notlandung"],
      flugzeug: ["flughafen_flugzeug_gate", "flughafen_flugzeug_vorfeld"],
      personal: ["flughafen_hangar", "flughafen_vorfeld", "flughafen_cargo", "flughafen_gepaecksortierung"],
    };
    const pois = store.list("pois").filter((p) => poiKategorien(p).some((k) => kats[art].includes(k)));
    if (!pois.length) return null;
    const poi = pick(pois);
    const ortKat = poiKategorien(poi).find((k) => kats[art].includes(k))!;
    const themen = ortKategorie(ortKat)?.themen ?? ["bewusstlos"];
    let fall: Fall | null = null;
    let code: Einsatzcode | undefined;
    for (let i = 0; i < 300 && !fall; i++) {
      const th = pick(themen);
      const kap = kapitelFuerThema(th, schema);
      if (!kap) continue;
      const f = fallZiehen(schema, kap, Math.random, 0.04);
      const c = f ? findCode(f.ergebnis.code) : undefined;
      if (!f || !c) continue;
      const st = this.stufeDef(c.stufe);
      const alter = typeof f.antworten.alter === "number" ? f.antworten.alter : null;
      // angekündigte Landung nur bei echten Notfällen; Personal ist erwachsen; an Bord eher keine Kleinkinder allein
      if (art === "landung" && !(st && (st.kategorie === "kritisch" || st.notarzt !== "nein" || ist(kap, "schwangerschaft")))) continue;
      if (art === "personal" && (alter === null || alter < 18 || alter > 65)) continue;
      if (ist(kap, "schwangerschaft") && f.antworten.geschlecht === "m") continue;
      code = c;
      fall = { kapitel: f.ergebnis.pfad[0], antworten: f.antworten, code: c.code, ortKat };
    }
    if (!fall || !code) return null;
    const flug = art === "landung" ? flugPlanen(this.state.zeit + (landungInMin ?? rnd(10, 25)) * MIN) : null;
    const flugNr = flug?.nummer ?? flugPlanen(this.state.zeit).nummer;
    const { meldung, bekannt, unbekannt } = flughafenMeldung(art, poi.name, fall, flug, flugNr, thema(fall.kapitel));
    const alter = typeof fall.antworten.alter === "number" ? fall.antworten.alter : null;
    const e = this.erstelleEinsatz({ lat: poi.lat, lon: poi.lon, adresse: `${poi.name}, Flughafen Wien, 1300 Schwechat`, code, fall, patientAlter: alter, gemeldeteAdresse: `${poi.name}, Flughafen Wien` });
    if (e.wahr.abfrage) e.wahr.abfrage.anrufer = flughafenAnrufer(meldung, bekannt, unbekannt);
    e.flughafen = { art, ortKat, flug };
    if (flug) {
      e.br = { lat: WARTEORT.lat, lon: WARTEORT.lon, label: WARTEORT.label };
      this.log(e, `Angekündigter Notfall an Bord von Flug ${flug.nummer} aus ${flug.von} – Landung um ${hhmm(flug.landung)} auf Piste ${flug.piste}, Fahrzeuge zum ${WARTEORT.label}`);
    }
    this.emit();
    return e;
  }

  /** Flugzeug steht an der Abstellposition: wartende Fahrzeuge fahren hin */
  private flugTick(t: number): void {
    for (const e of this.state.einsaetze) {
      const flug = e.flughafen?.flug;
      if (!flug || e.boSicher || t < flug.amStand || e.zustand === "abgeschlossen") continue;
      e.boSicher = t;
      this.log(e, `Flug ${flug.nummer} steht an der Abstellposition – Patient kann übernommen werden`);
      this.funk("Flughafen-Leitstelle", e.id, `${e.nummer}: Flug ${flug.nummer} steht an der Abstellposition, Zufahrt frei`, "warnung");
      for (const fz of this.einsatzFz(e)) if ((fz.phase === "wartetBR" || fz.phase === "bereitstellung") && e.adresse) this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
    }
  }

  /** Nächster Einsatz kommt aus diesem Fall (für Tests und den Fall-Editor) */
  private fallWunsch: { id: string; variante?: string; probe?: boolean } | null = null;
  /** Probe für den Fall-Editor: Einsatz mit Anrufer und Fallgeschichte bauen, ohne ihn ins Spiel zu nehmen */
  async probeFall(id: string, variante?: string): Promise<Einsatz | null> {
    this.fallWunsch = { id, variante, probe: true };
    try {
      return await this.generiere();
    } finally {
      this.fallWunsch = null;
    }
  }

  async generiereFall(id: string, variante?: string): Promise<Einsatz | null> {
    this.fallWunsch = { id, variante };
    try {
      return await this.generiere();
    } finally {
      this.fallWunsch = null;
    }
  }

  /** Fall aus dem Katalog ziehen: Variante, Antworten (Wahrheit), Kapitel und der Code, der dazu passt */
  private fallAusKatalog(schema: Schema): { fall: Fall; code: Einsatzcode } | null {
    const temp = this.temperatur();
    const lage = lageVon(this.state.wetter.lage);
    const wetter = this.settings.wetterAktiv;
    const glatt = lage === "eisregen" || (temp < 1 && ["schnee", "regen", "nebel"].includes(lageArt(lage)));
    const ctx = { jahreszeit: jahreszeitVon(this.state.zeit, this.wetterOpt()), stunde: new Date(this.state.zeit).getHours(), temp: wetter ? temp : 15, glatt: wetter && glatt };
    for (let i = 0; i < 12; i++) {
      const wunsch = this.fallWunsch;
      const f = wunsch ? fallVorlage(wunsch.id) : fallWaehlen(ctx, Math.random);
      if (!f) return null;
      const kap = kapitelFuerThema(f.thema, schema);
      if (!kap) continue;
      const v = (wunsch?.variante ? fallVariante(f, wunsch.variante) : undefined) ?? varianteWaehlen(f, this.settings.komplikationen ?? "normal", Math.random);
      const a: Antworten = { ...vorlageFest(f, Math.random), ...(v.fest ?? {}) };
      altersPlausibel({ alter: f.alter, fest: { ...(f.fest ?? {}), ...(v.fest ?? {}) }, anrufer: f.anrufer }, a, Math.random);
      // erst der Ort, dann die Antworten, die vom Ort abhängen (außerorts schneller als im Ort), dann der Code
      const ortArt = this.ortArtWaehlen(f, typeof a.alter === "number" ? a.alter : null, f.thema);
      ortRegeln(ortArt, f.thema, a, new Set([...Object.keys(f.fest ?? {}), ...Object.keys(v.fest ?? {})]));
      sichtUnbekannt(schema, kap, f.ohneSicht, a);
      const { antworten, roh } = this.anpassen(schema, merkmaleInSchema(schema, a));
      const erg = bestimmeCode(schema, kap, antworten);
      const c = erg ? findCode(erg.code) : undefined;
      if (!erg || !c) {
        console.warn("Fallkatalog: kein Code für", f.id, v.id);
        continue;
      }
      // Geschichte im Pflegeheim, in der Ordination, Schule …: nur, wo es so einen Ort im Gebiet gibt (sonst ein anderer Fall)
      if (!wunsch && ORT_NUR_MIT_POI.includes(ortArt) && !this.poisFuer(ortArt, typeof a.alter === "number" ? a.alter : null, undefined, f.auchGeschlossen).length) continue;
      // Fall an einem bestimmten Ort (Freibad, Bahnhof, Tierpark …): nur, wo es den gibt
      if (!wunsch && f.kategorien?.length && !this.poisFuer(ortArt, typeof a.alter === "number" ? a.alter : null, f.kategorien, f.auchGeschlossen).length) continue;
      // braucht die Wasserrettung: nur, wo es eine gibt
      if (!wunsch && v.partner?.some((x) => x.art === "wasser") && !this.partnerStationenImGebiet("wasser").length) continue;
      return { fall: { kapitel: kap, antworten, code: c.code, vorlage: f.id, ortArt, katalog: { id: f.id, variante: v.id }, ...(Object.keys(roh).length ? { roh } : {}) }, code: c };
    }
    return null;
  }

  /** Fremdes Codesystem: Wahrheit an die Antwortmöglichkeiten anpassen (das eigene bzw. kompatible bleibt unverändert) */
  private anpassen(schema: Schema, a: Antworten): { antworten: Antworten; roh: Antworten } {
    if (store.uebersetzung.kompatibel) return { antworten: a, roh: {} };
    return wahrheitAnpassen(schema, a);
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
    } else if (a.status === "beendet") {
      // Leitstelle ruft den Anrufer zurück (Nachfragen nach dem Gespräch)
      if (this.settings.rueckrufNurMitNummer && !e.telefon) throw new Error("Keine Rückrufnummer aufgenommen – Rückruf nicht möglich");
      this.andereHalten(ich, e.id);
      a.rueckruf = true;
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: `Rückruf durch ${ich.name}` });
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "anrufer", text: pick(["Ja, hallo?", "Hallo? Ja?", "Ja, bitte?", "Hallo, ja, ich bin's."]) });
      this.log(e, "Leitstelle ruft den Anrufer zurück");
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
    // Anleitung am Telefon (Fallkatalog): wirkt auf den Verlauf
    const lf = e.wahr.lage?.fall;
    if (von === "leitstelle" && lf) {
      for (const typ of anleitungAus(t, nachrichtArt(t) === "anweisung")) {
        if (lf.anleitungen[typ] === undefined) {
          lf.anleitungen[typ] = this.state.zeit;
          this.log(e, `Anleitung am Telefon: ${typ.replace(/_/g, " ")}`);
        }
      }
    }
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
      this.rendezvousPruefen(e, t);
      for (const ev of l.ereignisse) {
        if (ev.eingetreten || t < ev.um) continue;
        if (l.fall) {
          this.fallEreignis(e, l, ev, t);
          continue;
        }
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

  /**
   * Testlauf (Fall-Editor): das nächste Ereignis des Falls sofort eintreten lassen (Verschlechterung/Besserung),
   * damit man sieht, wie der Anrufer es meldet. Chancen gelten wie im Spiel, Anleitungen am Telefon zählen.
   * Gibt zurück, ob sich etwas getan hat.
   */
  testEreignis(e: Einsatz): boolean {
    const l = e.wahr.lage;
    if (!l?.fall) return false;
    const ev = l.ereignisse.filter((x) => !x.eingetreten && (!x.variante || x.variante === l.fall!.variante) && !x.nurMitNa).sort((a, b) => a.um - b.um)[0];
    if (!ev) return false;
    const vorher = e.anruf?.gespraech.length ?? 0;
    this.fallEreignis(e, l, ev, Math.max(this.state.zeit, ev.um));
    return (e.anruf?.gespraech.length ?? 0) > vorher;
  }

  /** Anleitung am Telefon für den Testlauf merken (wie bei einer echten Nachricht der Leitstelle) */
  testAnleitung(e: Einsatz, text: string): void {
    const lf = e.wahr.lage?.fall;
    if (!lf) return;
    for (const typ of anleitungAus(text, nachrichtArt(text) === "anweisung")) if (lf.anleitungen[typ] === undefined) lf.anleitungen[typ] = this.state.zeit;
  }

  /** Ereignis eines Falls aus dem Katalog (Chance, Anleitung, Notarzt vor Ort, Variantenwechsel) */
  private fallEreignis(e: Einsatz, l: Lage, ev: Lage["ereignisse"][number], t: number): void {
    const lf = l.fall!;
    if (ev.variante && ev.variante !== lf.variante) {
      ev.eingetreten = true;
      return;
    }
    const naDa = this.einsatzFz(e).some((x) => this.mitNotarzt(x) && (x.phase === "vorOrt" || (x.phase === "treffpunkt" && e.rendezvous?.status === "treffen")));
    if (ev.nurMitNa && !naDa) {
      ev.um = t + 3 * MIN;
      return;
    }
    ev.eingetreten = true;
    if (ev.nurOhneNa && naDa) return;
    let chance = ev.chance ?? 1;
    const gegeben = ev.mitAnleitung ? lf.anleitungen[ev.mitAnleitung.typ] : undefined;
    if (ev.mitAnleitung && gegeben !== undefined && gegeben <= t) chance = ev.mitAnleitung.chance;
    else if (ev.chanceOhneNa !== undefined && !naDa) chance = ev.chanceOhneNa;
    if (Math.random() >= chance) return;
    const p = l.patienten[0];
    if (!ev.nurText) {
      p.bw = ev.bw;
      p.at = ev.at;
    }
    if (ev.sichtung) p.sichtung = ev.sichtung;
    if (ev.wechselZu) {
      const fv = fallVorlage(lf.id);
      const nv = fv ? fallVariante(fv, ev.wechselZu) : undefined;
      if (nv) {
        lf.variante = nv.id;
        lf.kern = nv.lage;
        lf.na = nv.na;
        lf.ohneNaGeplant = false;
        lf.naMit = undefined;
        e.wahr.transport = nv.transport !== false;
        if (!e.kh) e.wahr.verdacht = undefined;
        ereignisseEinplanen(l, nv, t);
      }
    }
    if (ev.kern) lf.kern = ev.kern;
    if (ev.na) lf.na = ev.na;
    l.verlauf.push({ zeit: t, text: `${ev.art === "verschlechterung" ? "Verschlechterung" : "Veränderung"}: ${lf.kern}` });
    this.lageMelden(e, ev.art !== "verschlechterung", t, ev.text, ev.nurText);
  }

  private lageMelden(e: Einsatz, besserung: boolean, t: number, fallText?: string, nurText?: boolean): void {
    const l = e.wahr.lage!;
    const p0 = l.patienten[0];
    if (l.aufgedeckt) {
      // Besatzung vor Ort meldet sich
      const fz = e.fahrzeuge.map((id) => this.state.fahrzeuge[id]).find((f) => f && f.einsatzId === e.id && f.phase === "vorOrt");
      if (!fz) return;
      const kern = l.fall?.kern;
      const text = l.fall && kern
        ? istStillstand(p0) && !/Reanimation|verstorben/i.test(kern)
          ? "Patient jetzt reanimationspflichtig, Reanimation läuft"
          : nurText || besserung
            ? `Lage verändert: ${kern}`
            : `Patient verschlechtert sich, ${kern}`
        : besserung
          ? `Patient hat sich gebessert, ${patientText(p0).replace(/ \(.*\)$/, "")}`
          : istStillstand(p0)
            ? "Patient jetzt reanimationspflichtig, Reanimation läuft"
            : `Patient verschlechtert sich, ${patientText(p0).replace(/ \(.*\)$/, "")}`;
      const fehlt = this.fehlendeKraefte(e);
      this.nachfordern(e, fz, fehlt);
      const brauchen = [fehlt.na && "Notarzt", fehlt.rtw && `${fehlt.rtw} weitere${fehlt.rtw > 1 ? "" : "s"} Rettungsmittel`, fehlt.bit && "BIT"].filter(Boolean);
      const zusatz = brauchen.length ? `, benötigen ${brauchen.join(" und ")}` : "";
      this.fzRuft(this.sprecher(e, fz), e, brauchen.length ? "nachforderung" : "lage", `${text}${zusatz}`);
      if (istStillstand(p0) && fz.phaseEnde !== null) fz.phaseEnde = Math.max(fz.phaseEnde, t + rnd(30, 40) * MIN);
      return;
    }
    // Vor dem Eintreffen weiß es nur der Anrufer
    const w = e.wahr.abfrage;
    const a = e.anruf;
    if (!w || !a) return;
    let text: string | null;
    if (fallText) {
      const weg = w.anrufer.selbst && !besserung && p0.bw !== "ja";
      const pw = p0.geschlecht === "w";
      text = weg ? null : fuellen(fallText, { w: pw, bezug: bezugFuer(w.anrufer.rolle, w.anrufer.selbst, pw, p0.alter), ort: "", name: w.szenario?.patient.name ?? "" }, Math.random);
      // „(nur noch Keuchen am Telefon)“ gilt nur, wenn der Patient selbst telefoniert – sonst erzählt der Anrufer, was er sieht
      if (text && /^\(/.test(text) && !w.anrufer.selbst) text = veraenderungText(w.anrufer, pw, p0, besserung, a.status === "beendet");
      if (text && /^\(/.test(text)) {
        if (a.status === "aktiv") a.gespraech.push({ zeit: t, echt: Date.now(), von: "system", text: text.replace(/^\(|\)$/g, "") });
        (w.verlauf ??= []).push(`Am Telefon ist jetzt nur noch zu hören: ${text.replace(/^\(|\)$/g, "")} – du kannst kaum noch sprechen.`);
        w.antworten = { ...w.antworten, bw: p0.bw, at: p0.at };
        return;
      }
    } else text = veraenderungText(w.anrufer, p0.geschlecht === "w", p0, besserung, a.status === "beendet");
    if (!text) {
      if (a.status === "aktiv" && w.anrufer.selbst) {
        a.gespraech.push({ zeit: t, echt: Date.now(), von: "system", text: "Der Anrufer antwortet nicht mehr – man hört nur noch Geräusche." });
      }
      w.antworten = { ...w.antworten, bw: p0.bw, at: p0.at };
      return;
    }
    // Was der Anrufer jetzt weiß (für die KI und die Abfrage-Antworten) – und was sich verändert hat (die KI reagiert darauf)
    w.antworten = { ...w.antworten, bw: p0.bw, at: p0.at };
    (w.verlauf ??= []).push(text);
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
    const gefahr = this.partnerBlockiert(e).find((x) => x.eigenschutz);
    if (erstes && gefahr) {
      this.log(e, `${fz.funkrufname} wartet zum Eigenschutz in sicherem Abstand auf die Polizei`);
      this.fzRuft(this.sprecher(e, fz), e, "nachforderung", e.partner?.pol ? "vor Ort, warten zum Eigenschutz in sicherem Abstand, bis die Polizei die Lage sichert" : "vor Ort, warten zum Eigenschutz in sicherem Abstand, benötigen Polizei");
      e.partnerErinnert = t;
    }
    if (!erstes && !angefordert) return;
    const sofort = !!l && istStillstand(l.patienten[0]);
    const vu = ist(kap, "verkehrsunfall", "ecall");
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
    // NEF/NAH unterwegs, aber kein Notarzt nötig → die Besatzung storniert ihn selbst über Funk (LEO hört mit)
    const naUnterwegs = this.einsatzFz(e).filter((x) => (x.kategorie === "NEF" || fliegt(x)) && x.phase !== "vorOrt" && x.phase !== "treffpunkt");
    const naStorno = plan.erstes && this.transportfaehig(fz) && naUnterwegs.length > 0 && this.bedarfVon(e).na === 0;
    if (naStorno) for (const na of naUnterwegs) this.naStornoFunk(e, this.sprecher(e, fz), na);
    const partner = this.partnerFehlt(e);
    // Lagemeldung nur bei besonderen Umständen (Verkehrsunfall, Brand, mehrere Patienten, Lage ganz anders als gemeldet …),
    // bei Nachforderung oder wenn LEO darum gebeten hat – nicht bei jedem Einsatz
    const abweichung = l.irrtum !== null || angenommenRea !== istStillstand(p0) || l.patienten.length > 1 || ist(kap, "verkehrsunfall", "ecall", "eingeklemmt", "brand", "gefahrstoff", "alpin", "wasser", "strom", "stich_schuss");
    if ((plan.erstes && (abweichung || fehlt.na > 0 || fehlt.rtw > 0 || fehlt.bit > 0 || partner.length > 0)) || plan.angefordert) {
      let text = lagemeldungText(l, kap, fehlt, false);
      const da = (Object.keys(e.partnerDa ?? {}) as PartnerArt[]).map((a) => PARTNER[a].name);
      if (da.length) text += `, ${da.join(" und ")} vor Ort`;
      if (partner.length) {
        text += `, benötigen ${partner.map((x) => `${PARTNER[x.art].name} (${x.grund})`).join(" und ")}`;
        e.partnerErinnert = this.state.zeit;
      }
      this.nachfordern(e, fz, fehlt);
      this.ohneNaEinplanen(e, fehlt.na > 0);
      const art: FunkAnliegen = fehlt.na || fehlt.rtw || fehlt.bit || partner.length ? "nachforderung" : "lage";
      // Notarzt nötig, kein NEF in der Nähe: Frage nach dem Hubschrauber (LEOs Antwort wird verstanden)
      const heli = fehlt.na > 0 ? this.heliFrageFuer(e) : null;
      if (heli) {
        text += `, Frage: ist der ${heli} verfügbar`;
        e.heliFrage = heli;
      }
      const sprecher = this.sprecher(e, fz);
      this.fzRuft(sprecher, e, art, `Lagemeldung: ${this.unvollstaendig(ohneVitalwerte(text), sprecher)}`);
      l.verlauf.push({ zeit: this.state.zeit, text: `${fz.funkrufname}: ${text}` });
    }
  }

  /** Fragt die Besatzung nach dem Hubschrauber? (Notarzt nötig, kein freies NEF in der Nähe, ein Hubschrauber frei und Flugwetter) */
  private heliFrageFuer(e: Einsatz): string | null {
    const ort = e.wahr;
    const km = (x: SimFahrzeug) => distanceM(x, ort) / 1000;
    const alle = Object.values(this.state.fahrzeuge);
    const nef = alle.filter((x) => x.kategorie === "NEF" && !x.ersatzFuer && this.verfuegbar(x)).map(km).sort((a, b) => a - b)[0] ?? Infinity;
    const nah = alle.filter((x) => fliegt(x) && this.verfuegbar(x) && !this.flugHindernis(x)).sort((a, b) => km(a) - km(b))[0];
    if (!nah || km(nah) > 80) return null;
    const zeitkritisch = this.kritisch(e) || /schlaganfall|insult|stroke|polytrauma|schädel|stemi|infarkt|herzinfarkt/i.test(`${e.wahr.verdacht ?? ""} ${e.wahr.lage?.fall?.kern ?? ""}`);
    return nef > 25 || (zeitkritisch && nef > 12) ? this.rufname(nah) : null;
  }

  /** Nicht jede Besatzung meldet vollständig: BEL fast immer, NEF meist, RTW öfter nicht, KTW am öftesten – dann muss LEO nachfragen */
  private unvollstaendig(text: string, fz: SimFahrzeug): string {
    if (this.settings.funkUnvollstaendig === false) return text;
    const typ = fz.rmTyp.toUpperCase();
    const p = typ === "BEL" || /ÖBB/.test(typ) ? 0.02 : fz.kategorie === "NEF" || fliegt(fz) ? 0.12 : fz.kategorie === "RTW" ? 0.25 : 0.4;
    // an Kommas trennen – aber nicht innerhalb von Klammern („Feuerwehr (Tragehilfe, Treppe)“)
    const teile: string[] = [];
    let tiefe = 0;
    let akt = "";
    for (const c of text) {
      if (c === "(") tiefe++;
      if (c === ")") tiefe = Math.max(0, tiefe - 1);
      if (c === "," && tiefe === 0) {
        teile.push(akt.trim());
        akt = "";
      } else akt += c;
    }
    if (akt.trim()) teile.push(akt.trim());
    if (teile.length < 3 || Math.random() >= p) return text;
    // weggelassen wird nur Beschreibendes – nie der Patient selbst, eine Anforderung, ein Storno oder eine Frage
    const kand = teile.map((_, i) => i).filter((i) => i > 0 && !/benötig|storn|bitte|frage|feuerwehr|polizei|bergrettung|wasserrettung|vor ort|reanimation|verstorben|betroffen|rot|gelb|grün/i.test(teile[i]));
    if (!kand.length) return text;
    const weg = kand[Math.floor(Math.random() * kand.length)];
    return teile.filter((_, i) => i !== weg).join(", ");
  }

  /** RTW storniert den Notarzt direkt über Funk; der Notarzt fragt, ob LEO mitgehört hat */
  private naStornoFunk(e: Einsatz, rtw: SimFahrzeug, na: SimFahrzeug): void {
    const r = this.rufname(rtw);
    const n = this.rufname(na);
    const grund = "Patient stabil";
    this.log(e, `${r} storniert ${n} (kein Notarzt nötig)`);
    this.fzFunk(
      rtw,
      na,
      e,
      [
        { von: r, text: `${n} von ${r}, kommen` },
        { von: n, text: `Hier ${n}, kommen` },
        { von: r, text: `Hier ${r}, ${grund}, das wäre ein Storno für euch, kommen` },
        { von: n, text: `Hier ${n}, Storno verstanden, frage LEO mitgehört, kommen`, aktion: "nefStorno" },
      ],
      { von: n, text: `LEO von ${n}, Storno durch ${r} mitgehört, kommen?` },
    );
  }

  /** Fallkatalog: fehlt der nötige Notarzt, verschlechtert sich der Patient nach der Zeit aus dem Fall */
  private ohneNaEinplanen(e: Einsatz, fehltNa: boolean): void {
    const l = e.wahr.lage;
    const lf = l?.fall;
    if (!l || !lf || !fehltNa || lf.ohneNaGeplant) return;
    const fv = fallVorlage(lf.id);
    const v = fv ? fallVariante(fv, lf.variante) : undefined;
    if (!v?.ohneNa) return;
    lf.ohneNaGeplant = true;
    const p0 = l.patienten[0];
    const o = v.ohneNa;
    l.ereignisse.push({ um: this.state.zeit + o.nachMin * MIN, art: "verschlechterung", patient: 1, bw: o.bw ?? p0.bw, at: o.at ?? p0.at, eingetreten: false, sichtung: o.sichtung, kern: o.lage, na: o.na, variante: v.id, nurOhneNa: true });
    l.ereignisse.sort((x, y) => x.um - y.um);
  }

  /** Aktuelle Variante eines Katalog-Falls */
  private fallVar(e: Einsatz): FallVariante | undefined {
    const lf = e.wahr.lage?.fall;
    const fv = lf ? fallVorlage(lf.id) : undefined;
    return fv && lf ? fallVariante(fv, lf.variante) : undefined;
  }

  // ------------------------------------------------------------------ Partner-Organisationen

  /** Was der Einsatz laut Lage (Wahrheit) braucht */
  partnerBedarf(e: Einsatz): PartnerGrund[] {
    const fv = this.fallVar(e);
    const w = e.wahr.abfrage;
    const ortKat = w?.szenario?.ortKat ?? e.flughafen?.ortKat;
    if (fv) return ortPartner(fv.partner ?? [], ortKat, thema(w?.kapitel));
    const name = `${findCode(e.wahr.code)?.beschreibung ?? ""} ${store.schema?.codes[w?.code ?? e.wahr.code]?.name ?? ""}`;
    return ortPartner(partnerNoetig(w?.kapitel, w?.antworten ?? {}, name, { ortArt: w?.szenario?.ortArt, ortUnbekannt: w?.ortUnbekannt }), ortKat, thema(w?.kapitel));
  }

  /** Was der Disponent aus Abfrage und Code erkennen kann (Knopf leuchtet, Bereitstellungsraum) */
  partnerErkannt(e: Einsatz): PartnerGrund[] {
    const a = e.anruf;
    const name = `${findCode(e.code ?? undefined)?.beschreibung ?? ""} ${store.schema?.codes[e.code ?? ""]?.name ?? ""}`;
    const w = e.wahr.abfrage;
    const erkannt = partnerNoetig(a?.kapitel, a?.antworten ?? {}, name, { ortArt: a?.antworten && Object.keys(a.antworten).length ? w?.szenario?.ortArt : undefined, ortUnbekannt: w?.ortUnbekannt });
    // der Ort ist erkennbar, sobald der Disponent die Adresse (an einem echten Ort) eingetragen hat
    const amOrt = typeof e.adresse?.lat === "number" ? ortAnStelle(e.adresse.lat, e.adresse.lon) : null;
    return ortPartner(erkannt, amOrt?.kat, thema(a?.kapitel));
  }

  /** Partner, die laut Lage gebraucht werden, aber noch nicht angefordert sind */
  partnerFehlt(e: Einsatz): PartnerGrund[] {
    return this.partnerBedarf(e).filter((x) => !e.partner?.[x.art]);
  }

  /** Ohne diese Partner kann der Rettungsdienst nicht arbeiten (noch nicht da bzw. Einsatzort nicht gesichert) */
  partnerBlockiert(e: Einsatz): PartnerGrund[] {
    return this.partnerBedarf(e).filter((x) => x.blockiert && (!e.partnerDa?.[x.art] || (x.eigenschutz && !e.boSicher)));
  }

  /** Fahrzeuge der Partner in diesem Einsatz */
  partnerVon(e: Einsatz): PartnerFz[] {
    return (this.state.partnerFz ?? []).filter((u) => u.einsatzId === e.id);
  }

  /** Nächste Dienststelle der Organisation */
  private partnerStation(art: PartnerArt, ziel: LatLon): { id: string; name: string; lat: number; lon: number } | null {
    let best: { id: string; name: string; lat: number; lon: number } | null = null;
    let bd = Infinity;
    const amFh = amFlughafen(ziel);
    for (const st of store.list("stations")) {
      if (partnerArtVonTyp(st.typ) !== art) continue;
      // Betriebsfeuerwehr des Flughafens fährt nur am Gelände
      if (art === "fw" && !amFh && amFlughafen(st)) continue;
      const d = distanceM(st, ziel);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** Dienststellen einer Organisation in der bespielten Funkgruppe */
  partnerStationenImGebiet(art: PartnerArt): { lat: number; lon: number }[] {
    const g = this.funkgruppe();
    return store.list("stations").filter((st) => partnerArtVonTyp(st.typ) === art && inFunkgruppe(g, st.lat, st.lon));
  }

  /** Partner-Organisation alarmieren: Fahrzeuge rücken von der nächsten Dienststelle aus */
  partnerAnfordern(id: string, art: PartnerArt): void {
    const e = this.einsatz(id);
    if (!e) return;
    e.partner ??= {};
    if (e.partner[art]) return;
    const t = this.state.zeit;
    e.partner[art] = t;
    const ziel: LatLon = e.adresse ?? e.wahr;
    const st = this.partnerStation(art, ziel);
    const heim = st ? { lat: st.lat, lon: st.lon } : versetzt(ziel.lat, ziel.lon, rnd(6000, 12000), rnd(0, 360));
    const kurz = st ? kurzName(st.name, art) : PARTNER[art].name;
    const n = PARTNER_ANZAHL[art];
    this.state.partnerFz ??= [];
    for (let i = 0; i < n; i++) {
      this.state.partnerZaehler = (this.state.partnerZaehler ?? 0) + 1;
      this.state.partnerFz.push({
        id: `p${this.state.partnerZaehler}`,
        art,
        name: n > 1 ? `${kurz} ${i + 1}` : kurz,
        einsatzId: e.id,
        station: st?.name ?? PARTNER[art].name,
        heim,
        lat: heim.lat,
        lon: heim.lon,
        fahrt: null,
        blaulicht: false,
        phase: "ausruecken",
        // rücken innerhalb von 2 Minuten aus
        phaseEnde: t + rnd(0.7, 2) * MIN + i * rnd(5, 20) * 1000,
      });
    }
    this.log(e, `${PARTNER[art].name} alarmiert${st ? ` (${st.name}, ${n} Fahrzeug${n > 1 ? "e" : ""})` : ""}`);
    if (art === "pol") this.bereitstellungPruefen(e, []);
    this.emit();
  }

  /**
   * Gewalt/Waffen bekannt: Bereitstellungsraum ca. 500 m vom Einsatzort festlegen (auf der Seite, von der die
   * Fahrzeuge kommen). Alle Nicht-Polizei-Fahrzeuge fahren zuerst dorthin.
   */
  private bereitstellungPruefen(e: Einsatz, fahrzeugIds: string[]): void {
    if (e.br || e.boSicher || !e.adresse || e.fremd) return;
    if (!this.partnerErkannt(e).some((x) => x.eigenschutz)) return;
    const pos = [...fahrzeugIds.map((id) => this.state.fahrzeuge[id]), ...this.einsatzFz(e)].filter((x): x is SimFahrzeug => !!x);
    let grad = rnd(0, 360);
    if (pos.length) {
      const lat = pos.reduce((a, x) => a + x.lat, 0) / pos.length;
      const lon = pos.reduce((a, x) => a + x.lon, 0) / pos.length;
      if (distanceM({ lat, lon }, e.adresse) > 300) grad = (Math.atan2((lon - e.adresse.lon) * Math.cos((e.adresse.lat * Math.PI) / 180), lat - e.adresse.lat) * 180) / Math.PI;
    }
    const p = versetzt(e.adresse.lat, e.adresse.lon, rnd(450, 550), grad + rnd(-20, 20));
    const richtung = ["nördlich", "nordöstlich", "östlich", "südöstlich", "südlich", "südwestlich", "westlich", "nordwestlich"][Math.round((((grad % 360) + 360) % 360) / 45) % 8];
    e.br = { lat: p.lat, lon: p.lon, label: `Bereitstellungsraum ca. 500 m ${richtung} vom Einsatzort` };
    this.log(e, `${e.br.label} – Rettungsdienst wartet dort auf Freigabe durch die Polizei`);
  }

  /** Partner-Fahrzeuge bewegen, eintreffen lassen und wieder heimschicken */
  private partnerTick(t: number): void {
    const liste = this.state.partnerFz;
    if (!liste?.length) return;
    // Polizei meldet den Einsatzort als sicher
    for (const e of this.state.einsaetze) {
      if (e.boSicherUm && t >= e.boSicherUm) {
        e.boSicherUm = null;
        e.boSicher = t;
        this.log(e, "Polizei-Leitstelle: Einsatzort gesichert, Rettungsdienst kann zufahren");
        this.funk("Polizei-Leitstelle", e.id, `${e.nummer}: Einsatzort ist gesichert, Rettungsdienst kann zufahren`, "warnung");
        for (const fz of this.einsatzFz(e)) {
          if (fz.phase === "wartetBR" && e.adresse) this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
          else if (fz.phase === "vorOrt" && fz.phaseEnde !== null) fz.phaseEnde = Math.min(fz.phaseEnde, t + rnd(1, 3) * MIN);
        }
      }
    }
    for (const u of [...liste]) {
      if (u.phase === "routing") continue;
      this.position(u, t);
      const e = this.einsatz(u.einsatzId);
      const ziel: LatLon | null = e ? (e.adresse ?? e.wahr) : null;
      if (!e || !ziel) {
        if (u.phase !== "rueckfahrt") this.partnerHeim(u);
        else if (u.phaseEnde !== null && t >= u.phaseEnde) this.state.partnerFz = this.state.partnerFz!.filter((x) => x !== u);
        continue;
      }
      // Verbleib am Einsatzort: mit dem Rettungsdienst weg (Feuerwehr bleibt 10–20 Minuten länger)
      if (u.phase === "vorOrt" || u.phase === "wartetBR" || u.phase === "ausruecken" || u.phase === "anfahrt" || u.phase === "bereitstellung") {
        if (!this.rdNochDa(e, u, t)) {
          if (u.art === "fw" && u.phase === "vorOrt") {
            u.bleibtBis ??= t + rnd(10, 20) * MIN;
            if (t < u.bleibtBis) continue;
          }
          this.partnerHeim(u);
          continue;
        }
      }
      if (u.phase === "wartetBR" && e.boSicher) {
        this.partnerFahre(u, ziel, "anfahrt", true);
        continue;
      }
      if (u.phase === "amKH") {
        const fz = u.begleitet ? this.state.fahrzeuge[u.begleitet] : undefined;
        if (!fz || fz.einsatzId !== e.id || (fz.phase !== "transport" && fz.phase !== "uebergabe" && fz.phase !== "routing")) this.partnerHeim(u);
        continue;
      }
      if (u.phaseEnde === null || t < u.phaseEnde) continue;
      switch (u.phase) {
        case "ausruecken":
          if (u.art !== "pol" && e.br && !e.boSicher) this.partnerFahre(u, e.br, "bereitstellung", true);
          else this.partnerFahre(u, ziel, "anfahrt", true);
          break;
        case "bereitstellung":
          u.fahrt = null;
          u.blaulicht = false;
          u.phase = "wartetBR";
          u.phaseEnde = null;
          break;
        case "anfahrt":
          u.fahrt = null;
          u.blaulicht = false;
          u.phase = "vorOrt";
          u.phaseEnde = null;
          this.partnerEingetroffen(e, u, t);
          break;
        case "begleitung":
          u.fahrt = null;
          u.blaulicht = false;
          u.phase = "amKH";
          u.phaseEnde = null;
          break;
        case "rueckfahrt":
          this.state.partnerFz = this.state.partnerFz!.filter((x) => x !== u);
          break;
      }
    }
  }

  /** Ist der Rettungsdienst noch am Einsatzort (oder auf dem Weg dorthin)? */
  private rdNochDa(e: Einsatz, u: PartnerFz, t: number): boolean {
    if (e.zustand === "abgeschlossen") return false;
    const rd = this.einsatzFz(e);
    if (!rd.length) {
      // noch kein Rettungsdienst alarmiert: höchstens eine Stunde warten
      const seit = e.partner?.[u.art] ?? t;
      return e.fahrzeuge.length === 0 && t - seit < 60 * MIN;
    }
    return rd.some((x) =>
      x.phase === "routing" ? x.status !== "zumZO" && x.status !== "freiFunk" : ["ausruecken", "anfahrt", "suche", "vorOrt", "warteKH", "bereitstellung", "wartetBR"].includes(x.phase),
    );
  }

  /** Erstes Fahrzeug einer Organisation trifft ein */
  private partnerEingetroffen(e: Einsatz, u: PartnerFz, t: number): void {
    e.partnerDa ??= {};
    if (e.partnerDa[u.art]) return;
    e.partnerDa[u.art] = t;
    this.log(e, `${PARTNER[u.art].name} am Einsatzort eingetroffen (${u.name})`);
    // Polizei sichert den Einsatzort: nach 5–10 Minuten meldet die Polizei-Leitstelle „sicher“
    if (u.art === "pol" && !e.boSicher && (e.br || this.partnerBedarf(e).some((x) => x.eigenschutz))) {
      e.boSicherUm = t + rnd(5, 10) * MIN;
      return;
    }
    if (u.art === "pol" && !e.boSicher) e.boSicher = t;
    // wartende Besatzungen können jetzt arbeiten
    if (!this.partnerBlockiert(e).length) {
      for (const fz of this.einsatzFz(e)) if (fz.phase === "vorOrt" && fz.phaseEnde !== null && fz.phaseEnde > t + 3 * MIN) fz.phaseEnde = t + rnd(1, 3) * MIN;
    }
  }

  /** Polizei begleitet bei Gewalt/Unterbringung den Transport ins Krankenhaus (ein Fahrzeug) */
  private polizeiBegleitung(e: Einsatz, fz: SimFahrzeug, h: LatLon): void {
    if (!this.partnerBedarf(e).some((x) => x.art === "pol" && x.begleitung)) return;
    const u = this.partnerVon(e).find((x) => x.art === "pol" && x.phase === "vorOrt" && !x.begleitet);
    if (!u) return;
    u.begleitet = fz.id;
    this.log(e, `${u.name} begleitet ${fz.funkrufname} ins Krankenhaus`);
    this.partnerFahre(u, h, "begleitung", false);
  }

  /** Partner-Fahrzeug fährt zurück zur Dienststelle */
  private partnerHeim(u: PartnerFz): void {
    u.bleibtBis = null;
    if (distanceM(u, u.heim) < 80) {
      this.state.partnerFz = (this.state.partnerFz ?? []).filter((x) => x !== u);
      return;
    }
    this.partnerFahre(u, u.heim, "rueckfahrt", false);
  }

  private partnerFahre(u: PartnerFz, ziel: LatLon, phase: PartnerFz["phase"], blau: boolean): void {
    u.phase = "routing";
    u.blaulicht = blau;
    void route({ lat: u.lat, lon: u.lon }, ziel).then((r) => {
      if (!this.state.partnerFz?.includes(u)) return;
      const wf = this.settings.wetterAktiv ? fahrFaktor(this.state.wetter.lage, this.temperatur()) : 1;
      const f = (blau ? this.settings.sondersignalFaktor : 1) * wf;
      let rr: Route = { ...r, times: r.times.map((x) => x * f), duration: r.duration * f };
      // Flughafen: Kontrolle an der Einfahrt – außer für die Kräfte vom Gelände (Betriebsfeuerwehr, Polizei am Terminal)
      if (!amFlughafen(u.heim)) rr = mitKontrolle(rr).route;
      u.fahrt = { coords: rr.coords, times: rr.times, start: this.state.zeit, dauer: rr.duration, blau };
      u.phase = phase;
      u.phaseEnde = this.state.zeit + u.fahrt.dauer * 1000;
      this.emit();
    });
  }

  /** Fahrzeuge, die gerade für den Einsatz unterwegs oder vor Ort sind */
  private einsatzFz(e: Einsatz): SimFahrzeug[] {
    return e.fahrzeuge.map((id) => this.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x && x.einsatzId === e.id);
  }

  /** Höchste Sanitäter-Qualifikation vor Ort (NKA zählt wie NFS – ohne eigenen Zugang) */
  private kompetenzVorOrt(e: Einsatz): Quali | null {
    let best: Quali | null = null;
    for (const fz of this.einsatzFz(e)) {
      if (fz.phase !== "vorOrt" && fz.phase !== "warteKH") continue;
      const q = hoechsteQuali(fz.besetzung);
      if (q && (best === null || rang(q) > rang(best))) best = q;
    }
    return best === "NFS-NKA" ? "NFS" : best;
  }

  /** Braucht der Fall (Katalog) bei dieser Kompetenz einen Notarzt? */
  private naBedarfFall(e: Einsatz): boolean {
    const l = e.wahr.lage;
    const lf = l?.fall;
    if (!l || !lf) return false;
    const p0 = l.patienten[0];
    if (istStillstand(p0) || lf.na === "immer") return true;
    if (lf.na === "nein") return false;
    const q = this.kompetenzVorOrt(e);
    return q === null || rang(q) <= rang(lf.na as Quali);
  }

  /** Bedarf an Notärzten und Transportmitteln (Fallkatalog: nach Kompetenz vor Ort) */
  bedarfVon(e: Einsatz): { na: number; transport: number } {
    const l = e.wahr.lage;
    if (!l) return { na: 0, transport: 1 };
    if (l.fall && l.patienten.length === 1) return { na: this.naBedarfFall(e) ? 1 : 0, transport: 1 };
    const b = bedarf(l);
    return l.fall ? { na: Math.max(b.na, this.naBedarfFall(e) ? 1 : 0), transport: b.transport } : b;
  }

  /** Wie viele Notärzte / transportfähige Fahrzeuge fehlen laut Lage? */
  fehlendeKraefte(e: Einsatz): { na: number; rtw: number; bit: number } {
    const l = e.wahr.lage;
    if (!l) return { na: 0, rtw: 0, bit: 0 };
    const b = this.bedarfVon(e);
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
  //
  // Sprechfunk in echter Zeit auf EINEM Kanal (der eigenen Funkgruppe):
  // - immer nur ein Gespräch gleichzeitig – wer funken will, wartet, bis das laufende zu Ende ist (nichts wird unterbrochen)
  // - Anruf zuerst („LEO von 75/001, kommen“ → „Hier LEO, kommen“), dann die Meldung
  // - Ende, wenn das letzte Wort „verstanden“, „Ende“ oder „danke“ ist – oder nach 30 Sekunden Stille
  // - keine Antwort: nach 30 Sekunden nochmal rufen, höchstens dreimal, dann bleibt ein Sprechwunsch
  // - wer telefoniert, für den wartet der Funk (allein: immer; im Mehrspieler nur, wenn alle telefonieren)
  // - den Inhalt bestimmt das Programm (fest); formuliert wird er von der KI beim Gesprächsführer

  /** echte Zeit, nach der ein fester Satz gesprochen wird, wenn die KI nichts liefert (ms) */
  funkFestNach = 9000;
  /** Mehrspieler: wer ist gerade verbunden (vom Host gesetzt) */
  onlineSpieler: (() => Bearbeiter[]) | null = null;
  private funkUhr: number | undefined;
  private rufnamenCache: Map<string, string> | null = null;

  /** Rufname am Funk („75/001“, „RTW Spitz“, „C2“, „NEF Tulln“, „BEL Krems“ …) */
  rufname(fz: SimFahrzeug): string {
    if (!this.rufnamenCache || !this.rufnamenCache.has(fz.id)) this.rufnamenCache = rufnamen(Object.values(this.state.fahrzeuge));
    return this.rufnamenCache.get(fz.id) ?? fz.funkrufname;
  }

  /** Echtzeit-Uhr für den Funk (läuft auch in der Pause, damit laufende Gespräche fertig werden) */
  private funkUhrAn(): void {
    if (this.funkUhr !== undefined || this.mode === "client" || typeof window === "undefined") return;
    this.funkUhr = window.setInterval(() => this.funkKanal(), 400);
  }

  private neuesGespraech(fz: SimFahrzeug, e: Einsatz | null, status: FunkGespraech["status"]): FunkGespraech {
    this.state.funkGespraeche ??= [];
    const jetzt = Date.now();
    const g: FunkGespraech = {
      id: (this.state.funkGZaehler = (this.state.funkGZaehler ?? 0) + 1),
      fzId: fz.id,
      funkname: this.rufname(fz),
      einsatzId: e?.id ?? null,
      status,
      seit: this.state.zeit,
      naechster: null,
      rufe: 0,
      anliegen: null,
      fuehrer: null,
      sprueche: [],
      echtLetzt: jetzt,
      echtSeit: jetzt,
      echtNaechster: null,
    };
    this.state.funkGespraeche.unshift(g);
    if (this.state.funkGespraeche.length > 150) this.state.funkGespraeche.length = 150;
    this.funkUhrAn();
    return g;
  }

  private spruch(g: FunkGespraech, von: string, text: string, wer?: string, quelle?: "ki" | "fest"): void {
    g.sprueche.push({ zeit: this.state.zeit, von, text, wer, ...(quelle ? { quelle } : {}) });
    g.echtLetzt = Date.now();
    // Inhaltliche Funksprüche stehen auch im Einsatzprotokoll (nicht das reine Rufen)
    const e = g.einsatzId ? this.einsatz(g.einsatzId) : undefined;
    if (e && text && !istRufSpruch(text)) this.log(e, `📻 ${von}: ${text}`);
  }

  /** Laufendes Gespräch des Fahrzeugs mit LEO (nicht der Funk zwischen zwei Fahrzeugen) */
  private leoGespraech(fzId: string): FunkGespraech | undefined {
    return this.state.funkGespraeche?.find((g) => g.fzId === fzId && g.status !== "ende" && !g.an);
  }

  /** Gespräch, das gerade den Kanal belegt (es kann nur eines geben) */
  funkKanalBelegt(): FunkGespraech | undefined {
    return this.state.funkGespraeche?.find((g) => ["ruft", "leoRuft", "offen", "direkt", "mithoeren"].includes(g.status) || !!g.ausstehend);
  }

  /** Telefoniert dieser Spieler gerade (Notruf oder KT-Hotline)? Allein: telefoniert überhaupt jemand? */
  telefoniert(pid?: string): boolean {
    const mein = (a: { status: string; angenommenVon?: Bearbeiter | null } | null | undefined) => !!a && a.status === "aktiv" && (pid === undefined || !a.angenommenVon || a.angenommenVon.pid === pid);
    return this.state.einsaetze.some((e) => mein(e.anruf)) || (this.state.kt ?? []).some((k) => mein(k.anruf));
  }

  /** Muss der Funk wegen Telefonaten warten? (allein: ja, wenn telefoniert wird; Mehrspieler: nur wenn alle telefonieren) */
  private funkWegenTelefon(): boolean {
    const spieler = this.mode === "solo" ? [] : (this.onlineSpieler?.() ?? []);
    if (!spieler.length) return this.telefoniert();
    return spieler.every((s) => this.telefoniert(s.pid));
  }

  /** Wer formuliert die Sätze beim Funk zwischen Fahrzeugen? (wer gerade nicht telefoniert, am liebsten der Bearbeiter) */
  private funkErzeuger(e: Einsatz | undefined): Bearbeiter {
    const spieler = this.mode === "solo" ? [] : (this.onlineSpieler?.() ?? []);
    const frei = spieler.filter((s) => !this.telefoniert(s.pid));
    return (e?.bearbeiter && frei.find((s) => s.pid === e.bearbeiter!.pid)) ?? frei[0] ?? this.calltaker();
  }

  /** Nächster Satz einer Besatzung: KI formuliert, sonst nach funkFestNach der feste Text */
  private ausstehendSetzen(g: FunkGespraech, a: Omit<FunkAusstehend, "bis">): void {
    g.ausstehend = { ...a, bis: Date.now() + this.funkFestNach };
    g.wartetAufKi = true;
    this.funkUhrAn();
  }

  /** Den ausstehenden Satz sprechen (von der KI oder fest) */
  private ausstehendSprechen(g: FunkGespraech, text: string, quelle: "ki" | "fest"): void {
    const a = g.ausstehend;
    if (!a) return;
    g.ausstehend = null;
    g.wartetAufKi = false;
    const t = text.trim().slice(0, 600) || a.fest;
    this.spruch(g, a.von, t, undefined, quelle);
    if (a.aktion) this.funkAktion(g.einsatzId ? this.einsatz(g.einsatzId) : undefined, g.an ? this.state.fahrzeuge[g.an.fzId] : undefined, a.aktion);
    if (g.status === "direkt") {
      g.echtNaechster = Date.now() + rnd(2, 4) * 1000;
      return;
    }
    // Besatzung beendet selbst („…, Ende“)
    if (/\bende\W*$/i.test(t)) this.funkSchliessen(g);
    // LEO hat mit einer Durchsage gerufen (Storno …): nach der Quittung beendet LEO
    else if (g.leoRuf?.nachricht) {
      g.leoRuf = null;
      this.spruch(g, "LEO", "Hier LEO, Ende", g.fuehrer?.name);
      this.funkSchliessen(g);
    }
  }

  private funkSchliessen(g: FunkGespraech): void {
    g.status = "ende";
    g.ausstehend = null;
    g.wartetAufKi = false;
    g.naechster = null;
    g.echtNaechster = null;
  }

  /**
   * Funk von Fahrzeug zu Fahrzeug (z. B. RTW storniert das NEF): läuft von selbst ab, LEO hört mit.
   * Wartet wie jeder andere, bis der Kanal frei ist. mithoeren: am Ende fragt dieses Fahrzeug „LEO mitgehört?“.
   */
  private fzFunk(von: SimFahrzeug, an: SimFahrzeug, e: Einsatz, saetze: FunkSatz[], mithoeren?: { von: string; text: string }): void {
    if (e.fremd) {
      for (const s of saetze) {
        this.log(e, `${s.von} (Funk der Zone ${e.fremd.zone}): ${s.text}`);
        if (s.aktion) this.funkAktion(e, an, s.aktion);
      }
      return;
    }
    const g = this.neuesGespraech(von, e, "wartet");
    g.an = { fzId: an.id, funkname: this.rufname(an) };
    g.ablauf = saetze;
    g.mithoeren = mithoeren ?? null;
    g.dringend = true;
    g.echtNaechster = Date.now();
  }

  /** Was ein Funkspruch zwischen Fahrzeugen auslöst */
  private funkAktion(e: Einsatz | undefined, an: SimFahrzeug | undefined, aktion: FunkSatz["aktion"]): void {
    if (aktion === "nefStorno" && e && an && an.einsatzId === e.id) {
      this.log(e, `Storno an ${an.funkrufname} durch die Besatzung vor Ort`);
      this.freigeben(an);
    }
  }

  /** LEO bestätigt, dass sie den Funk zwischen zwei Fahrzeugen mitgehört hat */
  funkMitgehoert(id: number): void {
    const g = this.gespraech(id);
    if (g.status !== "mithoeren" && g.status !== "direkt" && !(g.status === "wartet" && g.mithoeren && !g.ablauf?.length)) return;
    this.nurFunkfuehrer(g);
    if (g.status === "direkt") return;
    this.spruch(g, "LEO", "Hier LEO, mitgehört, Ende", this.calltaker().name);
    this.funkSchliessen(g);
    this.emit();
  }

  /**
   * Fahrzeug will LEO etwas melden: es reiht sich ein und ruft, sobald der Kanal frei ist
   * („LEO von 75/001, kommen“). Der Text ist der feste Inhalt – formuliert wird er erst, wenn LEO antwortet.
   */
  fzRuft(fz: SimFahrzeug, e: Einsatz | null, art: FunkAnliegen, text: string): void {
    // Spieler-NAH: der Pilot funkt selbst – das Programm spricht nicht für ihn
    if (fz.pilot) {
      if (e) this.log(e, `${fz.funkrufname} (Pilot ${fz.pilot.name}): ${ohneVitalwerte(text)}`);
      return;
    }
    if (e?.fremd) {
      this.log(e, `${fz.funkrufname} (Funk der Zone ${e.fremd.zone}): ${text}`);
      return;
    }
    const inhalt = ohneVitalwerte(text);
    const dringend = art === "nachforderung" || /Reanimation|reanimationspflichtig|verschlechtert|Eigenschutz|Defekt/i.test(inhalt);
    const offen = this.leoGespraech(fz.id);
    if (offen && offen.status === "offen") {
      // schon verbunden: gleich durchgeben (oder nach dem gerade formulierten Satz)
      if (!offen.ausstehend) {
        offen.anliegen = { art, text: inhalt };
        offen.anliegenGesagt = true;
        this.ausstehendSetzen(offen, { von: offen.funkname, art, fest: festerSpruch(offen.funkname, art, inhalt) });
      } else offen.anliegen = { art, text: offen.anliegen && !offen.anliegenGesagt ? `${offen.anliegen.text}; ${inhalt}` : inhalt };
      return;
    }
    if (offen && ["wartet", "ruft", "sprechwunsch", "leoWartet", "leoRuft"].includes(offen.status)) {
      offen.anliegen = offen.anliegen && !offen.anliegenGesagt ? { art: art === "nachforderung" ? art : offen.anliegen.art, text: `${offen.anliegen.text}; ${inhalt}` } : { art, text: inhalt };
      offen.anliegenGesagt = false;
      if (dringend) offen.dringend = true;
      if (offen.status === "sprechwunsch") {
        // neuer Grund: wieder rufen
        offen.status = "wartet";
        offen.rufe = 0;
        offen.echtNaechster = Date.now();
      }
      return;
    }
    const g = this.neuesGespraech(fz, e, "wartet");
    g.anliegen = { art, text: inhalt };
    g.dringend = dringend;
    g.echtNaechster = Date.now();
    if (e) this.log(e, `${fz.funkrufname} möchte funken`);
  }

  /** Der Funkkanal (echte Zeit): Antworten, Ende nach Stille, wiederholte Rufe, und wer als Nächstes funken darf */
  private funkKanal(): void {
    if (this.mode === "client") return;
    const jetzt = Date.now();
    const alle = this.state.funkGespraeche ?? [];
    let geaendert = false;
    for (const g of alle) {
      if (g.status === "ende") continue;
      // KI zu langsam oder aus: der feste Satz
      if (g.ausstehend && jetzt >= g.ausstehend.bis) {
        this.ausstehendSprechen(g, g.ausstehend.fest, "fest");
        geaendert = true;
        continue;
      }
      if (g.ausstehend) continue;
      if (g.status === "leoRuft" && g.echtNaechster != null && jetzt >= g.echtNaechster) {
        // das Fahrzeug meldet sich
        g.status = "offen";
        g.echtNaechster = null;
        this.spruch(g, g.funkname, funkZufall([`Hier ${g.funkname}, kommen`, `${g.funkname} hört`, `Hier ${g.funkname}, kommen`]));
        const nachricht = g.leoRuf?.nachricht;
        if (nachricht) {
          this.spruch(g, "LEO", nachricht, g.fuehrer?.name);
          const antwort = this.funkVerstehen(g, nachricht);
          this.ausstehendSetzen(g, { von: g.funkname, art: "antwort", fest: antwort || `Hier ${g.funkname}, verstanden, kommen`, frage: nachricht });
        }
        geaendert = true;
      } else if (g.status === "direkt" && g.echtNaechster != null && jetzt >= g.echtNaechster) {
        // Funk zwischen zwei Fahrzeugen: Satz für Satz (Anrufe fest, Inhalte formuliert die KI)
        const s = g.ablauf?.shift();
        if (s) {
          if (istRufSpruch(s.text)) {
            this.spruch(g, s.von, s.text);
            if (s.aktion) this.funkAktion(g.einsatzId ? this.einsatz(g.einsatzId) : undefined, g.an ? this.state.fahrzeuge[g.an.fzId] : undefined, s.aktion);
            g.echtNaechster = jetzt + rnd(2, 4) * 1000;
          } else {
            const vorher = [...g.sprueche].reverse().find((x) => !istRufSpruch(x.text));
            this.ausstehendSetzen(g, { von: s.von, art: "satz", fest: s.text, frage: vorher?.text, an: s.von === g.funkname ? g.an?.funkname : g.funkname, aktion: s.aktion });
            g.echtNaechster = null;
          }
        }
        if (!g.ablauf?.length && !g.ausstehend) {
          if (g.mithoeren) {
            g.status = "mithoeren";
            g.rufe = 1;
            this.spruch(g, g.mithoeren.von, g.mithoeren.text);
          } else this.funkSchliessen(g);
        }
        geaendert = true;
      } else if (g.status === "offen" && jetzt - (g.echtLetzt ?? jetzt) > 30_000) {
        // 30 Sekunden Stille: Gespräch ist aus
        this.funkSchliessen(g);
        geaendert = true;
      } else if ((g.status === "ruft" || g.status === "mithoeren") && jetzt - (g.echtLetzt ?? jetzt) > 30_000) {
        // keine Antwort: Kanal frei geben, später nochmal rufen (höchstens dreimal)
        if (g.rufe >= 3) {
          if (g.status === "mithoeren") this.funkSchliessen(g);
          else g.status = "sprechwunsch";
        } else {
          g.status = "wartet";
          g.echtNaechster = jetzt + 1000;
        }
        geaendert = true;
      }
    }
    // Kanal frei? Dann darf der Nächste
    if (!this.funkKanalBelegt()) {
      const wartend = alle.filter((g) => (g.status === "wartet" || g.status === "leoWartet") && (g.echtNaechster ?? 0) <= jetzt);
      // LEO zuerst, dann Dringendes, dann wer länger wartet
      wartend.sort((a, b) => Number(b.status === "leoWartet") - Number(a.status === "leoWartet") || Number(!!b.dringend) - Number(!!a.dringend) || (a.echtSeit ?? 0) - (b.echtSeit ?? 0));
      const naechster = wartend[0];
      if (naechster?.status === "leoWartet") {
        naechster.status = "leoRuft";
        this.spruch(naechster, "LEO", naechster.leoRuf?.text || `${naechster.funkname} von LEO, kommen`, naechster.fuehrer?.name);
        naechster.echtNaechster = jetzt + rnd(2, 5) * 1000;
        geaendert = true;
      } else if (naechster) {
        const sperre = this.funkWegenTelefon();
        if (sperre || !this.state.laeuft) {
          // Telefon hat Vorrang (in der Pause ruft auch niemand)
          for (const g of wartend) if (sperre && !g.wegenTelefon) {
            g.wegenTelefon = true;
            geaendert = true;
          }
        } else {
          const g = naechster;
          g.wegenTelefon = false;
          if (g.an && g.ablauf?.length) {
            g.status = "direkt";
            g.fuehrer = { ...this.funkErzeuger(g.einsatzId ? this.einsatz(g.einsatzId) : undefined) };
            g.echtNaechster = jetzt;
          } else if (g.mithoeren && g.an) {
            g.status = "mithoeren";
            g.rufe++;
            this.spruch(g, g.mithoeren.von, g.mithoeren.text);
          } else {
            g.status = "ruft";
            g.rufe++;
            this.spruch(g, g.funkname, `LEO von ${g.funkname}, kommen`);
            const e = g.einsatzId ? this.einsatz(g.einsatzId) : undefined;
            if (e && g.rufe === 1) this.log(e, `${g.funkname} ruft LEO`);
          }
          geaendert = true;
        }
      }
    }
    if (geaendert) this.emit();
  }

  private funkTick(t: number): void {
    this.funkUhrAn();
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
          const b = buchung(e.kh?.grund ?? e.wahr.verdacht);
          const schock = b?.kategorie === "Trauma" && b.zeitkritisch;
          const vor = krit ? `, Voranmeldung ${schock ? "Schockraum" : "Notaufnahme"}${p0 ? `: ${patientText(p0).replace(/ \(.*\)$/, "")}` : ""}` : "";
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
    if (this.mode !== "solo" && g.fuehrer && g.fuehrer.pid !== ich.pid && (this.istOnline?.(g.fuehrer.pid) ?? true) && g.status !== "wartet" && g.status !== "sprechwunsch" && g.status !== "ruft") {
      throw new Error(`Den Funk mit ${g.funkname} führt ${g.fuehrer.name}`);
    }
    g.fuehrer = { ...ich };
  }

  /** Belegt ein anderes Gespräch den Kanal? Dann Fehlermeldung (nichts wird unterbrochen) */
  private kanalFrei(fuer: FunkGespraech | null): void {
    const b = this.funkKanalBelegt();
    if (b && b !== fuer) throw new Error(`Funk belegt – ${b.an ? `${b.funkname} und ${b.an.funkname} funken` : `${b.funkname} funkt`} gerade. Bitte warten, bis das Gespräch zu Ende ist.`);
  }

  /** LEO antwortet auf einen Ruf („Hier LEO, kommen“); das Fahrzeug gibt sein Anliegen durch */
  funkAntworten(id: number): void {
    const g = this.gespraech(id);
    if (g.status === "mithoeren") return this.funkMitgehoert(id);
    if (!["ruft", "wartet", "sprechwunsch"].includes(g.status)) return;
    this.kanalFrei(g.status === "ruft" ? g : null);
    this.nurFunkfuehrer(g);
    if (g.status !== "ruft") this.spruch(g, g.funkname, `LEO von ${g.funkname}, kommen`);
    this.spruch(g, "LEO", funkZufall(["Hier LEO, kommen", "LEO hört", "Hier LEO, kommen"]), this.calltaker().name);
    g.status = "offen";
    g.wegenTelefon = false;
    g.naechster = null;
    if (g.anliegen && !g.anliegenGesagt) {
      g.anliegenGesagt = true;
      this.ausstehendSetzen(g, { von: g.funkname, art: g.anliegen.art, fest: festerSpruch(g.funkname, g.anliegen.art, g.anliegen.text) });
    }
    this.emit();
  }

  /**
   * LEO ruft ein Fahrzeug („75/001 von LEO, kommen“); text = eigener Anruf (gesprochen oder getippt).
   * Ist der Kanal belegt, wird der Ruf vorgemerkt und geht hinaus, sobald er frei ist.
   */
  funkRufen(fzId: string, text?: string): number {
    const fz = this.state.fahrzeuge[fzId];
    if (!fz) throw new Error("Fahrzeug nicht gefunden");
    if (fz.pilot) throw new Error(`${fz.funkrufname} wird von ${fz.pilot.name} geflogen – Funk mit Piloten folgt, bis dahin bitte über den Chat`);
    // „Hier LEO, mitgehört, Ende“ (gesprochen oder getippt) auf eine Frage aus dem Fahrzeugfunk
    if (text && /mitgeh[öo]r/i.test(text)) {
      const mg = this.state.funkGespraeche?.find((g) => (g.status === "mithoeren" || (g.status === "wartet" && g.mithoeren && !g.ablauf?.length)) && (g.an?.fzId === fz.id || g.fzId === fz.id));
      if (mg) {
        this.funkMitgehoert(mg.id);
        return mg.id;
      }
    }
    const offen = this.leoGespraech(fz.id);
    if (offen) {
      if (["ruft", "wartet", "sprechwunsch"].includes(offen.status)) this.funkAntworten(offen.id);
      return offen.id;
    }
    return this.leoRuftAn(fz, text?.trim().slice(0, 300) || `${this.rufname(fz)} von LEO, kommen`);
  }

  /** LEO-Ruf starten bzw. vormerken; nachricht = Durchsage gleich nach der Antwort (Storno …) */
  private leoRuftAn(fz: SimFahrzeug, text: string, nachricht?: string): number {
    const e = fz.einsatzId ? (this.einsatz(fz.einsatzId) ?? null) : null;
    const frei = !this.funkKanalBelegt();
    const g = this.neuesGespraech(fz, e, frei ? "leoRuft" : "leoWartet");
    g.fuehrer = { ...this.calltaker() };
    g.leoRuf = { text, ...(nachricht ? { nachricht } : {}) };
    if (frei) {
      this.spruch(g, "LEO", text, g.fuehrer.name);
      g.echtNaechster = Date.now() + rnd(2, 5) * 1000;
    }
    this.emit();
    return g.id;
  }

  /** LEO spricht im offenen Gespräch; die Besatzung antwortet (Inhalt vom Programm, formuliert von der KI) */
  funkSenden(id: number, text: string): void {
    const g = this.gespraech(id);
    const t = text.trim().slice(0, 500);
    if (!t) return;
    if (g.status === "ende") throw new Error("Das Funkgespräch ist beendet");
    if (g.status !== "offen") throw new Error("Das Fahrzeug hat sich noch nicht gemeldet");
    if (g.ausstehend) throw new Error(`${g.funkname} spricht gerade`);
    this.nurFunkfuehrer(g);
    this.spruch(g, "LEO", t, this.calltaker().name);
    const antwort = this.funkVerstehen(g, t);
    // Letztes Wort „verstanden“, „Ende“ oder „danke“: Gespräch ist aus (Aufträge darin gelten trotzdem)
    if (/\b(verstanden|ende|danke)\W*$/i.test(t)) {
      this.funkSchliessen(g);
      this.emit();
      return;
    }
    if (antwort === "") {
      this.emit();
      return;
    }
    // noch nicht durchgegebenes Anliegen hängt die Besatzung an
    let fest = antwort ?? `Hier ${g.funkname}, verstanden, kommen`;
    if (g.anliegen && !g.anliegenGesagt) {
      g.anliegenGesagt = true;
      fest = `${fest.replace(/,?\s*kommen\W*$/i, "")}, außerdem: ${g.anliegen.text}, kommen`;
    }
    this.ausstehendSetzen(g, { von: g.funkname, art: antwort === null ? "frage" : "antwort", fest, frage: t });
    this.emit();
  }

  /** Funkspruch der Besatzung, den die KI beim Gesprächsführer formuliert hat */
  funkFzAntwort(id: number, text: string, quelle: "ki" | "fest" = "ki"): void {
    const g = this.gespraech(id);
    if (!g.ausstehend) return;
    this.ausstehendSprechen(g, text, quelle);
    this.emit();
  }

  /** Die Leitstelle schreibt gerade einen Funkspruch: das Gespräch nicht wegen Stille beenden */
  funkTippt(id: number): void {
    const g = (this.state.funkGespraeche ?? []).find((x) => x.id === id);
    if (!g || g.status === "ende") return;
    if (g.status === "offen" || g.status === "ruft" || g.status === "mithoeren") g.echtLetzt = Date.now();
  }

  funkEnde(id: number): void {
    const g = this.gespraech(id);
    if (g.status === "ende") return;
    if (g.status === "leoWartet") {
      this.funkSchliessen(g);
      this.emit();
      return;
    }
    if (g.status === "ruft" || g.status === "wartet" || g.status === "sprechwunsch") throw new Error("Bitte zuerst antworten");
    this.nurFunkfuehrer(g);
    this.spruch(g, "LEO", "Hier LEO, verstanden, Ende", this.calltaker().name);
    this.funkSchliessen(g);
    this.emit();
  }

  /** Storno an ein Fahrzeug: es rückt sofort ein, die Durchsage geht über Funk, sobald der Kanal frei ist */
  storno(fzId: string): void {
    const fz = this.state.fahrzeuge[fzId];
    if (!fz?.einsatzId) return;
    const e = this.einsatz(fz.einsatzId) ?? null;
    if (e) this.log(e, `Storno an ${fz.funkrufname}`);
    const offen = this.leoGespraech(fz.id);
    const durchsage = `Hier LEO, Storno für euren Einsatz${e ? ` ${e.nummer}` : ""}, kommen`;
    if (offen && offen.status === "offen" && !offen.ausstehend) {
      this.spruch(offen, "LEO", durchsage, this.calltaker().name);
      offen.leoRuf = { text: "", nachricht: durchsage };
      this.ausstehendSetzen(offen, { von: offen.funkname, art: "antwort", fest: `Hier ${offen.funkname}, Storno verstanden, rücken ein, kommen`, frage: durchsage });
    } else this.leoRuftAn(fz, `${this.rufname(fz)} von LEO, kommen`, durchsage);
    this.freigeben(fz);
    this.emit();
  }

  /**
   * Funk-Probe (Testlauf, ohne Nebenwirkungen): typische Funksprüche zu einem Einsatz mit ihrem festen Inhalt –
   * Lagemeldung, Zustand auf Nachfrage, Messwert auf Nachfrage, Transport mit Voranmeldung, Rendezvous, NEF-Storno.
   */
  funkProbe(e: Einsatz, fz: SimFahrzeug, nef?: SimFahrzeug): FunkAusstehend[] {
    const l = e.wahr.lage;
    const kap = e.wahr.abfrage?.kapitel ?? "";
    const r = this.rufname(fz);
    const bis = Number.MAX_SAFE_INTEGER;
    const out: FunkAusstehend[] = [];
    if (!l) return out;
    const p0 = l.patienten[0];
    // so, als wäre die meldende Besatzung schon vor Ort
    const vorher = { fz: [...e.fahrzeuge], eid: fz.einsatzId };
    if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id);
    fz.einsatzId = e.id;
    const fehlt = this.fehlendeKraefte(e);
    e.fahrzeuge = vorher.fz;
    fz.einsatzId = vorher.eid;
    let lage = lagemeldungText(l, kap, fehlt, false);
    const heli = fehlt.na > 0 ? this.heliFrageFuer(e) : null;
    if (heli) lage += `, Frage: ist der ${heli} verfügbar`;
    out.push({ von: r, art: fehlt.na || fehlt.rtw || fehlt.bit ? "nachforderung" : "lage", fest: festerSpruch(r, "lage", `Lagemeldung: ${ohneVitalwerte(lage)}`), bis });
    const zustandFrage = "Hier LEO, wie ist der Zustand des Patienten, braucht ihr weitere Kräfte, kommen";
    const bedarf = fehlt.na || fehlt.rtw ? `, ${[fehlt.na && "benötigen Notarzt", fehlt.rtw && rtwBedarf(fehlt.rtw, this.transportfaehig(fz))].filter(Boolean).join(", ")}` : ", keine weiteren Kräfte erforderlich";
    out.push({ von: r, art: "antwort", fest: `Hier ${r}, ${l.patienten.length > 1 ? `${l.patienten.length} Patienten, ` : ""}${ohneVitalwerte(patientText(p0).replace(/ \(.*\)$/, ""))}${bedarf}, kommen`, frage: zustandFrage, bis });
    const werte = (l.fall?.kern ?? "").split(/,\s*/).filter((x) => ohneVitalwerte(x) !== x.trim());
    out.push({ von: r, art: "antwort", fest: `Hier ${r}, ${werte.length ? werte.join(", ") : "Werte noch nicht erhoben"}, kommen`, frage: "Hier LEO, wie sind die Vitalwerte, kommen", bis });
    const verdacht = this.verdacht(e);
    out.push({ von: r, art: "antwort", fest: `Hier ${r}, Verdacht ${buchungName(verdacht)}, kommen`, frage: "Hier LEO, was habt ihr für einen Verdacht, kommen", bis });
    const h = this.naechstesKh(e.wahr, verdacht, this.patientRot(e), (p0?.alter ?? 50) < 15);
    const vor = this.kritisch(e) ? `, Voranmeldung Notaufnahme: ${ohneVitalwerte(patientText(p0).replace(/ \(.*\)$/, ""))}` : "";
    out.push({ von: r, art: "info", fest: festerSpruch(r, "info", `Patient übernommen, Transport ${h ? `ins ${h.kurzname || h.name}` : "ins Krankenhaus"}, Eintreffen in ca. ${12 + Math.floor(Math.random() * 20)} Minuten${vor}`), bis });
    if (nef) {
      const n = this.rufname(nef);
      out.push({ von: r, art: "satz", an: n, fest: `Hier ${r}, Patient braucht Notarzt, ihr seid noch ca. 17 Minuten entfernt, wir fahren euch entgegen, Rendezvous Gföhl, kommen`, bis });
      out.push({ von: r, art: "satz", an: n, fest: `Hier ${r}, Patient stabil, das wäre ein Storno für euch, kommen`, bis });
    }
    return out;
  }

  /** Bekannte Anliegen der Leitstelle erkennen und den Inhalt der Antwort festlegen (null = freie Frage, "" = keine Antwort) */
  private funkVerstehen(g: FunkGespraech, text: string): string | null {
    const fz = this.state.fahrzeuge[g.fzId];
    if (!fz) return null;
    const t = text.toLowerCase();
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : g.einsatzId ? this.einsatz(g.einsatzId) : undefined;
    const hier = `Hier ${g.funkname}`;
    const vorOrt = fz.phase === "vorOrt" || fz.phase === "warteKH" || fz.phase === "suche";
    if (/\bende\b/.test(t) && t.length < 30) return "";
    // über der Dienstzeit vorgemerkt: nach der Frage übernehmen sie (sagen nie nein) → alarmiert über Funk
    if (fz.ueberzeitFuer && (/einsatz|übernehm|bereit|brauch|dringend|alarm|noch|könn|fahrt|fahren|bitte|\?/.test(t))) {
      const ev = this.einsatz(fz.ueberzeitFuer);
      fz.ueberzeitFuer = null;
      if (ev && ev.zustand !== "abgeschlossen") {
        this.ueberzeitFreigabe.add(fz.id);
        try {
          this.alarmiere(ev.id, [fz.id]);
        } finally {
          this.ueberzeitFreigabe.delete(fz.id);
        }
        this.log(ev, `${fz.funkrufname} übernimmt den Einsatz trotz ${fz.wechselOffen === "ende" ? "Dienstende" : "ausständigem Wechsel"}`);
        return `${hier}, ja, übernehmen wir noch, sind unterwegs zu ${ev.adresse?.label ?? "Einsatzort"}, kommen`;
      }
    }
    // Antwort auf die Frage nach dem Hubschrauber
    if (e?.heliFrage && /christophorus|\bc ?\d+\b|hubschrauber|\bnah\b|verfügbar/.test(t)) {
      const ja = /\b(ja|kommt|alarmier|unterwegs|fliegt|schick|ist verfügbar)\b/.test(t) && !/\b(nicht|kein|nein)\b/.test(t);
      const h = e.heliFrage;
      e.heliFrage = null;
      return ja ? `${hier}, verstanden, warten auf ${h}, kommen` : `${hier}, verstanden, kein Hubschrauber, kommen`;
    }
    if (/lagemeldung/.test(t)) {
      if (vorOrt && e) {
        const l = e.wahr.lage;
        const fehlt = this.fehlendeKraefte(e);
        if (l) this.nachfordern(e, fz, fehlt);
        return `${hier} mit einer Lagemeldung, ${ohneVitalwerte(l ? lagemeldungText(l, e.wahr.abfrage?.kapitel ?? "", fehlt, false) : "Lage entspricht der Meldung")}, kommen`;
      }
      fz.lagemeldungAngefordert = true;
      return `${hier}, verstanden, Lagemeldung kommt, sobald wir vor Ort sind, kommen`;
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
      if (fz.phase === "naAbholung" || fz.phase === "naEinstieg") return `${hier}, holen gerade den Notarzt im ${this.naKh(fz)?.kurzname || "Krankenhaus"} ab, dann direkt zum Einsatzort, kommen`;
      if (vorOrt) return `${hier}, sind vor Ort beim Patienten, kommen`;
      if (fz.phase === "transport") return `${hier}, sind mit Patient auf dem Weg ins Krankenhaus, ca. ${min ?? "?"} Minuten, kommen`;
      if (fz.phase === "rendezvous") return `${hier}, sind auf dem Weg zum Rendezvous${e?.rendezvous ? ` ${e.rendezvous.punkt.label}` : ""}, ca. ${min ?? "?"} Minuten, kommen`;
      if (fz.phase === "treffpunkt") return `${hier}, sind am Treffpunkt${e?.rendezvous?.status === "treffen" ? ", Notarzt ist beim Patienten" : ", warten auf das Rendezvous"}, kommen`;
      if (fz.phase === "uebergabe") return `${hier}, sind bei der Übergabe im Krankenhaus, kommen`;
      if (fz.phase === "rueckfahrt") return `${hier}, sind frei und auf dem Rückweg zur Dienststelle, kommen`;
      return `${hier}, sind frei, kommen`;
    }
    // Messwerte nur auf ausdrückliche Nachfrage – und nur die, die es im Fall gibt
    if (/sättigung|spo2|blutdruck|\brr\b|puls|herzfrequenz|blutzucker|\bbz\b|vitalwerte|vitalparameter|temperatur|fieber|\bgcs\b|atemfrequenz/.test(t)) {
      if (!vorOrt || !e) return `${hier}, sind noch nicht beim Patienten, kommen`;
      const kern = e.wahr.lage?.fall?.kern ?? "";
      const werte = kern.split(/,\s*/).filter((x) => ohneVitalwerte(x) !== x.trim());
      return werte.length ? `${hier}, ${werte.join(", ")}, kommen` : `${hier}, Werte noch nicht erhoben, kommen`;
    }
    if (/patient|zustand|wie geht|reanim|braucht ihr|benötigt ihr|nachforder/.test(t)) {
      if (!vorOrt || !e) return `${hier}, sind noch nicht vor Ort, kommen`;
      const l = e.wahr.lage;
      if (!l) return `${hier}, Patient wird versorgt, Zustand stabil, kommen`;
      const fehlt = this.fehlendeKraefte(e);
      const bedarfText = fehlt.na || fehlt.rtw ? `, ${[fehlt.na && "benötigen Notarzt", fehlt.rtw && rtwBedarf(fehlt.rtw, this.transportfaehig(fz))].filter(Boolean).join(", ")}` : ", keine weiteren Kräfte erforderlich";
      return `${hier}, ${l.patienten.length > 1 ? `${l.patienten.length} Patienten, ` : ""}${ohneVitalwerte(patientText(l.patienten[0]).replace(/ \(.*\)$/, ""))}${bedarfText}, kommen`;
    }
    if (/verdacht|diagnose|was hat (er|sie|der patient|die patientin)\b/.test(t)) {
      if (!vorOrt || !e) return `${hier}, sind noch nicht beim Patienten, kommen`;
      const v = e.kh?.grund ?? e.verdacht ?? this.verdacht(e);
      return v ? `${hier}, Verdacht ${buchungName(v)}, kommen` : `${hier}, noch nicht beurteilbar, kommen`;
    }
    if (/funkcheck|wie hört ihr|wie hören sie|verständigung/.test(t)) return `${hier}, höre euch laut und klar, kommen`;
    if (/(feuerwehr|polizei|bergrettung|wasserrettung).*(vor ort|kommt|unterwegs|alarmiert|angefordert)/.test(t)) return `${hier}, verstanden, kommen`;
    if (/zielkrankenhaus|zielklinik|welches (kh|krankenhaus)|wohin (fahrt|bringt|transportiert)|wo fahrt ihr hin|fahrt ins|bringt (ihn|sie|den patienten)/.test(t)) {
      // Frage („was wird euer Zielkrankenhaus?“) → Antwort mit dem Ziel; sonst ist es eine Vorgabe von LEO
      const frage = /\?|\b(was|welche[sr]?|wohin|wo)\b/.test(t);
      if (!frage) return `${hier}, Zielkrankenhaus verstanden, kommen`;
      const gebucht = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
      if (gebucht) return `${hier}, Ziel ist ${gebucht.kurzname || gebucht.name}, kommen`;
      if (!vorOrt || !e) return `${hier}, sind noch nicht beim Patienten, Ziel noch offen, kommen`;
      const verdacht = this.verdacht(e);
      const h = this.naechstesKh(e.wahr, verdacht, this.patientRot(e), (e.wahr.lage?.patienten[0]?.alter ?? e.wahr.patientAlter) < 15);
      return h ? `${hier}, wir würden ins ${h.kurzname || h.name} fahren, kommen` : `${hier}, Ziel noch offen, kommen`;
    }
    if (/zusatzinfo|zur info|beachtet|achtung|hinweis/.test(t)) return `${hier}, Information verstanden, kommen`;
    if (/einsatz .*(code|adresse|einsatzort)|neuer einsatz|einsatzauftrag|übernehmt/.test(t)) {
      return fz.einsatzId ? `${hier}, Einsatz verstanden, kommen` : `${hier}, Einsatz verstanden, rücken aus, kommen`;
    }
    if (/^(hier leo,? )?(verstanden|danke|passt|ok|okay)\W*(kommen)?\W*$/.test(t)) return "";
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

  private ktNeu(d: KtDaten, quelle: KtAuftrag["quelle"], serie?: string, probe = false): KtAuftrag {
    const hotline = quelle === "hotline";
    const vonHeim = !d.von?.khId;
    const k: KtAuftrag = {
      id: `kt${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      nummer: probe ? "PROBE" : this.ktNummer(),
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
    // Probe (Testlauf): kommt nicht ins Spiel
    if (probe) return k;
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

  /**
   * Probe-Auftrag für den Testlauf: ein zufälliger Krankentransport bzw. eine Überstellung mit Anruf an der Hotline,
   * genau wie im Spiel erzeugt – kommt aber nicht in die Auftragsliste.
   */
  async probeKt(art: "kt" | "sek"): Promise<KtAuftrag | null> {
    let d: KtDaten | null = null;
    if (art === "sek") {
      const mitte = mitteVon(this.funkgruppe());
      const khs = store.list("hospitals").filter((h) => this.khImNetz(h));
      d = sekZufall({ mitte, khs, jetzt: this.state.zeit })?.[0] ?? null;
    } else
      for (let i = 0; i < 4 && !d; i++) {
        const adr = await this.adresseImGebiet();
        if (!adr) continue;
        const heim: KtOrt = { lat: adr.lat, lon: adr.lon, label: adr.label };
        d = zufallsDaten({ heim, khMit: (b) => this.khMit(b, heim) }, this.state.zeit);
      }
    return d ? this.ktNeu(d, "hotline", undefined, true) : null;
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
    let d: KtDaten | null = this.ktVonEinrichtung();
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

  /**
   * Etwa ein Drittel der Krankentransporte kommt aus Einrichtungen (Pflegeheim, Betreutes Wohnen, Reha,
   * Arztpraxis …) – nur zu deren KT-Zeiten (Abholung bzw. Ankunft dort). Arztpraxis = Einweisung ins KH.
   */
  private ktVonEinrichtung(): KtDaten | null {
    if (Math.random() > 0.35) return null;
    const GEWICHT: Record<string, number> = { pflegeheim: 5, betreutes_wohnen: 1.5, behinderteneinrichtung: 1, reha: 1.5, arztpraxis: 1, primaerversorgung: 1 };
    const orte = this.orteImGebiet().filter((o) => o.kind === "pois" && o.kategorien.some((k) => GEWICHT[k]));
    if (!orte.length) return null;
    for (let i = 0; i < 4; i++) {
      const gew = orte.map((o) => Math.max(...o.kategorien.map((k) => GEWICHT[k] ?? 0)));
      let r = Math.random() * gew.reduce((x, y) => x + y, 0);
      let o = orte[orte.length - 1];
      for (let j = 0; j < orte.length; j++) if ((r -= gew[j]) <= 0) {
        o = orte[j];
        break;
      }
      const kat = o.kategorien.find((k) => GEWICHT[k])!;
      const heim: KtOrt = { lat: o.lat, lon: o.lon, label: `${o.name}${o.ort ? `, ${o.ort}` : ""}` };
      const praxis = kat === "arztpraxis" || kat === "primaerversorgung";
      const d = zufallsDaten({ heim, khMit: (b) => this.khMit(b, heim), ...(praxis ? { typ: "einweisung" as const } : {}) }, this.state.zeit);
      if (!d) continue;
      // Zeitpunkt in der Einrichtung: Abholung dort bzw. Ankunft dort
      const dort = d.von === heim ? (d.abholung ?? (d.termin ? d.termin - 60 * 60_000 : this.state.zeit)) : (d.termin ?? d.abholung ?? this.state.zeit);
      if (katKtOffen(kat, dort)) return d;
    }
    return null;
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
    } else if (a.status === "beendet") {
      // Leitstelle ruft den Anrufer zurück
      if (this.settings.rueckrufNurMitNummer && !k.d.telefon) throw new Error("Keine Rückrufnummer aufgenommen – Rückruf nicht möglich");
      this.andereHalten(ich, k.id);
      a.rueckruf = true;
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "system", text: `Rückruf durch ${ich.name}` });
      a.gespraech.push({ zeit: this.state.zeit, echt: Date.now(), von: "anrufer", text: pick(["Ja, hallo?", "Ja, bitte?", "Hallo, ja?"]) });
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
    let alle = Object.values(this.state.fahrzeuge).filter(
      (f) => !f.einsatzId && !istFlughafenFz(f) && (this.verfuegbar(f) || f.kt || (f.ausserDienst && f.phase === "frei" && !(f.defektBis && f.defektBis > this.state.zeit))),
    );
    // Fahrzeit vom Abholort zum Ziel (für „los spätestens“ und die Hubschrauber-Frage)
    let fahrzeit = 0;
    if (k.d.nach) fahrzeit = (await travelTimes(k.d.nach, [von]))[0] ?? 0;
    const soll = k.d.abholung ?? (k.d.termin ? k.d.termin - fahrzeit * 1000 - 15 * MIN : null);
    // nur Fahrzeuge, die zur Abholzeit laut Dienstplan im Dienst sind (auch solche, die erst später anfangen)
    const um = Math.max(this.state.zeit, soll ?? this.state.zeit);
    alle = alle.filter((f) => this.imDienstUm(f, um) && (!f.ausserDienst || um > this.state.zeit + 5 * MIN));

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
      const nu = nefs.map((f) => this.naUmweg(f));
      const nz = await travelTimes(von, nefs.map((f, i) => nu[i]?.start ?? { lat: f.lat, lon: f.lon }));
      nefs.forEach((f, i) => {
        const s = nz[i] === null ? null : (nz[i]! + (nu[i]?.sek ?? 0)) * faktor + this.ausrueckSek(f, true);
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

  /** Durchsage an ein KT-Fahrzeug: geht über Funk hinaus, sobald der Kanal frei ist */
  private ktFunkSpruch(fz: SimFahrzeug, text: string): void {
    this.leoRuftAn(fz, `${this.rufname(fz)} von LEO, kommen`, `Hier LEO, ${text}, kommen`);
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
        // auf der Straße geparkt: hin und mit dem Patienten zurück zu Fuß
        if (fz.fussZiel && fz.phaseEnde !== null) {
          const ende = fz.phaseEnde;
          this.zuFuss(fz, fz.fussZiel, t, null);
          if (fz.fuss) {
            fz.phaseEnde = ende + (fz.fuss.hinSek + fz.fuss.zurueckSek) * 1000;
            fz.fuss.zurueckAb = fz.phaseEnde - fz.fuss.zurueckSek * 1000;
          }
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

  /**
   * Neues Spiel (Startseite): alles zurücksetzen, Uhr auf die Startzeit, Wetter dazu neu, Dienstpläne neu.
   * Danach läuft die Simulation.
   */
  // ------------------------------------------------------------------ Spieler-NAH (Pilot)

  /** Wer gerade einen Befehl gibt (Multiplayer: der Mitspieler, allein: ich) */
  private wer(): Bearbeiter {
    return this.actor ?? this.ich ?? { pid: "solo", name: "Pilot" };
  }

  /** Hubschrauber, den dieser Spieler fliegt */
  pilotVon(pid: string): SimFahrzeug | undefined {
    return Object.values(this.state.fahrzeuge).find((x) => x.pilot?.pid === pid);
  }

  /** Kann dieser Hubschrauber gerade von einem Piloten übernommen werden? Sonst der Grund. */
  pilotHindernis(fz: SimFahrzeug, pid: string): string | null {
    if (!fliegt(fz)) return "Nur Hubschrauber können geflogen werden";
    if (fz.pilot && fz.pilot.pid !== pid) return `wird schon von ${fz.pilot.name} geflogen`;
    if (fz.ausserDienst) return "nicht im Dienst";
    if (fz.ersatzFuer) return "Ersatz-NEF";
    return null;
  }

  /** Befehl des Piloten: nur für den Hubschrauber, den er selbst fliegt */
  private meinHubschrauber(fzId: string): SimFahrzeug {
    const fz = this.state.fahrzeuge[fzId];
    if (!fz) throw new Error("Hubschrauber nicht gefunden");
    if (!fz.pilot) throw new Error(`${fz.funkrufname} wird vom Computer geflogen – zuerst übernehmen`);
    if (fz.pilot.pid !== this.wer().pid) throw new Error(`${fz.funkrufname} wird von ${fz.pilot.name} geflogen`);
    return fz;
  }

  /** Mitspieler übernimmt einen Hubschrauber (auch Wiedereinstieg nach Verbindungsverlust) */
  pilotUebernehmen(fzId: string): void {
    const fz = this.state.fahrzeuge[fzId];
    if (!fz) throw new Error("Hubschrauber nicht gefunden");
    const ich = this.wer();
    const grund = this.pilotHindernis(fz, ich.pid);
    if (grund) throw new Error(`${fz.funkrufname}: ${grund}`);
    if (fz.pilot) {
      fz.pilot.offlineSeit = null;
      this.emit();
      return;
    }
    const anderer = this.pilotVon(ich.pid);
    if (anderer) throw new Error(`Du fliegst schon ${anderer.funkrufname}`);
    const t = this.state.zeit;
    this.position(fz, t);
    this.routingBusy.delete(fz.id);
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    // laufende Computer-Phase in den Stand des Piloten übersetzen: er steht bzw. schwebt dort, wo der Hubschrauber gerade ist
    let plan: PilotPlan | null = null;
    if (fz.phase === "warteKH" || fz.phase === "routing") {
      if (e && fz.begleitet && e.kh) plan = { art: "transport", hospitalId: e.kh.hospitalId };
      fz.phase = e ? (fz.status === "zumZO" ? "transport" : fz.status === "zumBO" ? "anfahrt" : "vorOrt") : "frei";
    } else if (fz.phase === "rueckfahrt") fz.phase = "frei";
    fz.fahrt = null;
    fz.phaseEnde = null;
    fz.pilot = { pid: ich.pid, name: ich.name, seit: t, offlineSeit: null, plan, flugZiel: null };
    if (e) this.log(e, `${fz.funkrufname} wird ab jetzt von ${ich.name} geflogen`);
    this.funk(fz.funkrufname, fz.einsatzId, `wird ab jetzt von ${ich.name} geflogen (Pilot)`, "info");
    this.emit();
  }

  /** Pilot verlässt den Hubschrauber: der Computer fliegt mit dem Stand des Piloten weiter */
  pilotAbgeben(fzId: string): void {
    const fz = this.meinHubschrauber(fzId);
    this.computerUebernimmt(fz, `${fz.pilot!.name} hat den Hubschrauber abgegeben`);
    this.emit();
  }

  /** Multiplayer: Pilot ohne Verbindung → nach einer Minute übernimmt der Computer */
  private pilotWache(): void {
    const online = this.istOnline;
    if (this.mode !== "host" || !online) return;
    const jetzt = Date.now();
    for (const fz of Object.values(this.state.fahrzeuge)) {
      const p = fz.pilot;
      if (!p) continue;
      if (online(p.pid)) {
        p.offlineSeit = null;
        continue;
      }
      p.offlineSeit ??= jetzt;
      if (jetzt - p.offlineSeit >= PILOT_OFFLINE_MS) this.computerUebernimmt(fz, `Verbindung zu ${p.name} verloren`);
    }
  }

  /**
   * Der Computer übernimmt einen Spieler-NAH genau dort, wo der Pilot war: Position, Status, Einsatz,
   * gewähltes Ziel und Patient an Bord bleiben – der Hubschrauber fliegt von dort normal weiter.
   */
  private computerUebernimmt(fz: SimFahrzeug, grund: string): void {
    const p = fz.pilot;
    if (!p) return;
    const t = this.state.zeit;
    this.position(fz, t);
    fz.pilot = null;
    fz.fahrt = null;
    fz.phaseEnde = null;
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    if (e) this.log(e, `${fz.funkrufname}: ${grund} – Computer fliegt weiter`);
    this.funk(fz.funkrufname, fz.einsatzId, `${grund} – Computer fliegt weiter`, "info");
    if (!e) {
      if (fz.status === "freiWache" || fz.status === "abgemeldet" || fz.status === "bereitschaft") {
        fz.phase = "frei";
        if (distanceM(fz, fz.heim) >= 80) this.fahre(fz, fz.heim, "rueckfahrt", false);
      } else this.freigeben(fz);
      return;
    }
    switch (fz.status) {
      case "alarmWache":
      case "alarmFunk":
      case "alarmiert":
        fz.phase = "ausruecken";
        fz.phaseEnde = t + 30_000;
        return;
      case "zumBO":
        if (!e.adresse) return this.freigeben(fz);
        this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
        return;
      case "amBO": {
        const plan = p.plan;
        if (plan?.art === "transport" && e.kh) {
          fz.begleitet = true;
          fz.phase = "warteKH";
          this.startTransport(e);
          return;
        }
        if (plan) {
          this.log(e, `${fz.funkrufname}: Einsatz beendet`);
          return this.freigeben(fz);
        }
        // noch nichts entschieden: kurz weiter versorgen, dann entscheidet das Programm wie sonst
        fz.phase = "vorOrt";
        fz.vorOrtSeit ??= t;
        fz.phaseEnde = t + rnd(3, 8) * MIN;
        return;
      }
      case "zumZO": {
        const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
        if (!h || !fz.begleitet) return this.freigeben(fz);
        this.fahre(fz, h, "transport", this.kritisch(e));
        return;
      }
      case "amZO":
        fz.phase = "uebergabe";
        fz.phaseEnde = t + rnd(3, 8) * MIN;
        return;
      default:
        this.freigeben(fz);
    }
  }

  /** Transportiert in diesem Einsatz ein Spieler-NAH den Patienten selbst? */
  private pilotTransport(e: Einsatz): SimFahrzeug | undefined {
    return this.einsatzFz(e).find((x) => x.pilot?.plan?.art === "transport");
  }

  /** Spieler-NAH: Position (Übungsflug) – sonst passiert nichts von selbst */
  private pilotUpdate(fz: SimFahrzeug, t: number): void {
    const f = fz.fahrt;
    if (!f) return;
    this.position(fz, t);
    if (t >= f.start + f.dauer * 1000) {
      fz.fahrt = null;
      if (fz.pilot) fz.pilot.flugZiel = null;
    }
  }

  /** Pilot drückt einen Status (Ziffern wie beim RTW). Gibt eine Fehlermeldung zurück oder null. */
  pilotStatus(fzId: string, s: StatusKey): string | null {
    const fz = this.meinHubschrauber(fzId);
    const p = fz.pilot!;
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    const t = this.state.zeit;
    if (!PILOT_STATUS.includes(s)) return "Diesen Status setzt die Leitstelle";
    if (fz.status === s) return null;
    switch (s) {
      case "alarmiert":
        // Quittieren: Alarm angenommen – jetzt wird eingestiegen und der Rotor gestartet, Status 2 kommt beim Abheben
        if (!e || !["alarmWache", "alarmFunk"].includes(fz.status)) return "Quittieren geht nur direkt nach der Alarmierung";
        this.setStatus(fz, "alarmiert");
        break;
      case "zumBO":
        if (!e) return "Kein Einsatz – Status 2 geht erst nach der Alarmierung";
        this.setStatus(fz, "zumBO");
        fz.phase = "anfahrt";
        break;
      case "amBO": {
        if (!e) return "Kein Einsatz";
        this.setStatus(fz, "amBO");
        fz.phase = "vorOrt";
        fz.vorOrtSeit = t;
        const l = e.wahr.lage;
        if (l && !l.aufgedeckt) {
          l.aufgedeckt = true;
          l.verlauf.push({ zeit: t, text: `${fz.funkrufname} als erstes Fahrzeug vor Ort` });
        }
        this.ktHilfeDa(e);
        // Verdacht steht fest, sobald jemand beim Patienten ist (fürs Patientenblatt und die Zielwahl)
        if (l || e.wahr.abfrage) this.verdacht(e);
        break;
      }
      case "zumZO":
        if (!e) return "Kein Einsatz";
        if (!p.plan) return "Zuerst festlegen, was mit dem Patienten passiert";
        if (p.plan.art === "kein") return "Kein Transport gewählt – Status 6, wenn ihr frei seid";
        if (!e.kh) return "Der RTW hat noch kein Zielkrankenhaus – bitte warten";
        fz.begleitet = p.plan.art === "transport";
        this.setStatus(fz, "zumZO");
        fz.phase = "transport";
        break;
      case "amZO":
        if (!e) return "Kein Einsatz";
        if (fz.status !== "zumZO") return "Zuerst Status 4 (zum Zielort)";
        this.setStatus(fz, "amZO");
        fz.phase = "uebergabe";
        fz.blaulicht = false;
        break;
      case "freiFunk":
        if (e) {
          const amPatient = fz.status === "amBO" && !!e.wahr.lage?.aufgedeckt;
          if (amPatient && !p.plan && !this.einsatzFz(e).some((x) => x !== fz && this.transportfaehig(x))) return "Zuerst festlegen, was mit dem Patienten passiert";
          this.log(e, fz.status === "amZO" ? `${fz.funkrufname}: Übergabe abgeschlossen` : `${fz.funkrufname}: Einsatz beendet`);
          this.freigeben(fz);
        } else {
          this.setStatus(fz, "freiFunk");
          fz.phase = "frei";
        }
        break;
      case "freiWache":
        if (e) return "Zuerst Status 6 (Einsatz beenden)";
        this.setStatus(fz, "freiWache");
        fz.phase = "frei";
        fz.naAnBord = false;
        break;
    }
    fz.phaseEnde = null;
    this.emit();
    return null;
  }

  /** Pilot legt am Berufungsort fest, was mit dem Patienten passiert (alles wird genehmigt) */
  pilotPlan(fzId: string, plan: PilotPlan): string | null {
    const fz = this.meinHubschrauber(fzId);
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    if (!e) return "Kein Einsatz";
    if (fz.status !== "amBO") return "Erst am Berufungsort (Status 3)";
    const p = fz.pilot!;
    const name = fz.funkrufname;
    const lf = e.wahr.lage?.fall;
    switch (plan.art) {
      case "transport": {
        const h = store.get("hospitals", plan.hospitalId);
        if (!h) return "Krankenhaus nicht gefunden";
        const verdacht = this.verdacht(e);
        e.wahr.transport = true;
        e.verdacht = verdacht;
        e.kh = { hospitalId: h.id, grund: verdacht, durch: "nah", zeit: this.state.zeit };
        e.zo = { lat: h.lat, lon: h.lon, label: h.name };
        e.khAnfrage = null;
        this.khPlatzBelegen(e);
        this.log(e, `${name}: Transport mit dem NAH ins ${h.kurzname || h.name} (Verdacht ${buchungName(verdacht)})`);
        this.funk(name, e.id, `Transport mit NAH: ${h.kurzname || h.name} – Verdacht ${buchungName(verdacht)}`, "info");
        // RTW, die schon auf das Krankenhaus warten, werden frei – der Patient fliegt
        for (const x of this.einsatzFz(e)) if (x !== fz && this.transportfaehig(x) && x.phase === "warteKH") {
          this.log(e, `${x.funkrufname}: Patient wird mit ${name} transportiert`);
          this.freigeben(x);
        }
        break;
      }
      case "uebergabe": {
        if (!this.einsatzFz(e).some((x) => x !== fz && this.transportfaehig(x))) return "Kein RTW im Einsatz – bitte zuerst bei der Leitstelle anfordern";
        e.wahr.transport = true;
        if (lf) lf.naMit = plan.naMit;
        this.log(e, `${name}: Patient wird an den RTW übergeben${plan.naMit ? ", Notarzt begleitet im RTW" : ""}`);
        this.funk(name, e.id, `Übergabe an RTW${plan.naMit ? " – Notarzt fährt im RTW mit" : ""}`, "info");
        break;
      }
      case "kein": {
        e.wahr.transport = false;
        if (plan.grund === "revers") e.wahr.revers = true;
        const text = plan.grund === "revers" ? "Transportverweigerung, Revers unterschrieben" : plan.grund === "tot" ? "Patient verstorben, Tod durch den Notarzt festgestellt" : "kein Transport erforderlich";
        this.log(e, `${name}: ${text}`);
        this.funk(name, e.id, text, "info");
        // RTW, die auf ein Krankenhaus warten, werden frei
        for (const x of this.einsatzFz(e)) if (x !== fz && this.transportfaehig(x) && x.phase === "warteKH") this.freigeben(x);
        break;
      }
      default:
        return "Unbekannte Auswahl";
    }
    p.plan = plan;
    this.emit();
    return null;
  }

  /**
   * Übungsflug ohne Flugsimulator: der Hubschrauber fliegt in gerader Linie mit Reisegeschwindigkeit
   * zum Berufungsort, Zielkrankenhaus, Stützpunkt oder einem Punkt; null hält an.
   */
  pilotFliegen(fzId: string, ziel: "bo" | "zo" | "heim" | (LatLon & { label?: string }) | null): string | null {
    const fz = this.meinHubschrauber(fzId);
    const t = this.state.zeit;
    this.position(fz, t);
    if (ziel === null) {
      fz.fahrt = null;
      fz.pilot!.flugZiel = null;
      this.emit();
      return null;
    }
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    let p: LatLon | null = null;
    let label = "";
    if (ziel === "bo") {
      if (!e?.adresse) return "Kein Einsatzort";
      p = e.adresse;
      label = "Einsatzort";
    } else if (ziel === "zo") {
      const h = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
      if (!h) return "Kein Zielkrankenhaus";
      p = khLandung(h) ?? h;
      label = h.kurzname || h.name;
    } else if (ziel === "heim") {
      p = fz.heim;
      label = fz.stationName || "Stützpunkt";
    } else {
      p = { lat: ziel.lat, lon: ziel.lon };
      label = ziel.label || "Punkt";
    }
    const r = flightRoute({ lat: fz.lat, lon: fz.lon }, p, this.settings.nahGeschwindigkeit);
    fz.fahrt = { coords: r.coords, times: r.times, start: t, dauer: r.duration };
    fz.pilot!.flugZiel = label;
    fz.pilot!.zeitOk = false;
    this.emit();
    return null;
  }

  /** Position (und Flugdaten) von außen – Flugsimulator, etwa einmal pro Sekunde */
  pilotPosition(fzId: string, lat: number, lon: number, d?: Omit<PilotSimDaten, "um"> | null): void {
    const fz = this.meinHubschrauber(fzId);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    const p = fz.pilot!;
    fz.fahrt = null;
    p.flugZiel = null;
    fz.lat = lat;
    fz.lon = lon;
    if (d) {
      p.sim = { hoehe: +d.hoehe || 0, agl: +d.agl || 0, kurs: +d.kurs || 0, kts: +d.kts || 0, amBoden: !!d.amBoden, motor: !!d.motor, um: Date.now() };
      if (!p.sim.amBoden) p.zeitOk = false;
    }
  }

  /** Pilot erlaubt (oder verbietet) den Zeitraffer, solange er am Boden steht */
  pilotZeit(fzId: string, ok: boolean): string | null {
    const fz = this.meinHubschrauber(fzId);
    if (ok && this.inDerLuft(fz)) return "Zeitraffer geht nur am Boden";
    fz.pilot!.zeitOk = ok;
    this.emit();
    return null;
  }

  /** Spieler-NAH fliegt gerade (Flugsimulator: nicht am Boden; Übungsflug: Flug läuft) */
  inDerLuft(fz: SimFahrzeug): boolean {
    const p = fz.pilot;
    if (!p) return false;
    if (fz.fahrt) return true;
    const d = p.sim;
    return !!d && Date.now() - d.um < PILOT_SIM_FRISCH_MS && !d.amBoden;
  }

  /**
   * Zeitraffer gesperrt? Gibt den Grund zurück. Erlaubt nur, wenn JEDER Spieler-NAH mit Flugsimulator am Boden steht –
   * am eigenen Stützpunkt oder mit Zustimmung des Piloten (am Berufungsort, im Krankenhaus).
   */
  zeitBremse(): string | null {
    for (const fz of Object.values(this.state.fahrzeuge)) {
      const p = fz.pilot;
      if (!p || p.offlineSeit) continue;
      // nur mit Flugsimulator (der läuft in Echtzeit) – der Übungsflug geht mit dem Zeitraffer mit
      if (!p.sim || Date.now() - p.sim.um > 6 * PILOT_SIM_FRISCH_MS) continue;
      const name = fz.kurzname || fz.funkrufname;
      if (!p.sim.amBoden && Date.now() - p.sim.um < PILOT_SIM_FRISCH_MS) return `${name} fliegt (${p.name})`;
      const daheim = distanceM(fz, fz.heim) < 300;
      if (!daheim && !p.zeitOk) return `${name}: ${p.name} hat den Zeitraffer nicht freigegeben`;
    }
    return null;
  }

  /** Spieler-NAH: Ziel und geschätzte Ankunft (Übungsflug: Rest der Flugzeit; Flugsimulator: echte Geschwindigkeit) */
  pilotAnkunft(fz: SimFahrzeug): { ziel: string; min: number } | null {
    const p = fz.pilot;
    if (!p) return null;
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    let z: LatLon | null = null;
    let ziel = "";
    if (e && ["alarmWache", "alarmFunk", "alarmiert", "zumBO"].includes(fz.status) && e.adresse) {
      z = e.adresse;
      ziel = "Einsatzort";
    } else if (e?.kh && fz.status === "zumZO") {
      const h = store.get("hospitals", e.kh.hospitalId);
      if (h) {
        z = khLandung(h) ?? h;
        ziel = h.kurzname || h.name;
      }
    } else if (fz.status === "freiFunk" && distanceM(fz, fz.heim) > 300) {
      z = fz.heim;
      ziel = "Stützpunkt";
    }
    if (fz.fahrt) {
      const rest = (fz.fahrt.start + fz.fahrt.dauer * 1000 - this.state.zeit) / 60_000;
      return { ziel: p.flugZiel || ziel, min: Math.max(0, rest) };
    }
    if (!z) return null;
    const d = p.sim && Date.now() - p.sim.um < PILOT_SIM_FRISCH_MS ? p.sim : null;
    const kmh = d && d.kts > 25 ? d.kts * 1.852 : this.settings.nahGeschwindigkeit;
    return { ziel, min: distanceM(fz, z) / 1000 / kmh * 60 };
  }

  neuesSpiel(zeit: number): void {
    this.pause();
    this.state.zeit = zeit;
    this.reset();
    this.state.wetterEcht = undefined;
    this.state.wetterEchtStand = undefined;
    this.echtNaechsterVersuch = 0;
    this.echtFehlerGemeldet = false;
    const o = this.wetterOpt();
    const start = o.wechsel <= 0 ? o.festLage : nextWetter(zeit, null, o).lage;
    this.state.wetter = wetterSetzen(lageVon(start), zeit, o);
    this.state.wetter.vorher = null;
    this.state.lobby = false;
    this.dienstTick(zeit, true);
    this.start();
  }

  /** Multiplayer-Lobby der Startseite offen/zu (Mitspieler warten bis zum Start) */
  lobbySetzen(an: boolean): void {
    this.state.lobby = an;
    this.emit();
  }

  /** Alle Einsätze und Fahrzeugzustände zurücksetzen. */
  reset(): void {
    this.state.einsaetze = [];
    this.state.partnerFz = [];
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
