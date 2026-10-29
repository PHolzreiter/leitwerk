/**
 * Großschadensfall (ab NF5, also ab 6 Betroffenen): erfundene Ereignisse an echten Orten.
 *
 * Hier steht, was passiert (Wahrheit): welche Szenarien es gibt, wann und wo sie passieren können, wie viele
 * Patienten es gibt und was sie haben, wer anruft und was man vor Ort sieht. Den Ablauf im Spiel (Bereitstellungsraum,
 * Sicht- und Lagemeldung, Abtransport) macht die Simulation (engine.ts).
 *
 * Jedes Szenario variiert bei jedem Durchlauf: Zahl und Verteilung der Patienten, Alter, Verletzungen, Anrufer,
 * geschätzte Zahlen und die Geschichte (Fahrzeuge, Ursache, Wetter). Ereignisse auf Straßen und Strecken passieren
 * jedes Mal an einer anderen passenden Stelle; Tunnel, Industriepark und Messe sind feste Orte.
 */
import type { Antworten } from "../abfrage/schema";
import type { AnruferTyp, OrtArt } from "../abfrage/szenario";
import type { PartnerArt } from "./partner";

export type GsSichtung = "rot" | "gelb" | "gruen" | "tot";
export type NfStufe = "NF5" | "NF10" | "NF30";

/** Ein Patient im Großschaden (Wahrheit) */
export interface GsPatient {
  nr: number;
  alter: number;
  geschlecht: "m" | "w";
  sichtung: GsSichtung;
  /** Verletzungsmuster / Krankheitsbild (so meldet es die Einsatzleitung) */
  muster: string;
  /** Verdachtsdiagnose (Buchungs-ID aus klinik.json) */
  diagnose: string;
  /** wer es ist („Lenker 2. Pkw“) – nur für die Geschichte */
  rolle?: string;
  /** erst nach Befreiung bzw. Rettung durch die Feuerwehr erreichbar */
  fw?: boolean;
  /** zeitkritisch: Kandidat für den Hubschrauber */
  nah?: boolean;
  bw?: "ja" | "getruebt" | "nein";
  at?: "normal" | "abnorm" | "agonal" | "keine";
}

/** So erzählt ein Anrufer (wird zur Fallgeschichte für die KI) */
export interface GsAnrufer {
  typ: AnruferTyp;
  /** ruft so viele Minuten nach dem Ereignis an (der erste sofort) */
  nachMin: number;
  ortArt: OrtArt;
  stelle: string[];
  hergang: string[];
  geschehen: string[];
  details: string[];
  verlauf: string[];
  /** Antworten, die dieser Anrufer gibt (zu den gemeinsamen dazu) */
  fest: Antworten;
  /** Patient, von dem er vor allem erzählt */
  patient: { alter: number; geschlecht: "m" | "w" };
}

/** Ein fertig gebautes Ereignis */
export interface GsAufbau {
  szenario: string;
  titel: string;
  /** Art des Notfalls (Sichtmeldung) */
  art: string;
  /** was das erste Fahrzeug sieht */
  sicht: string;
  gefahren: string[];
  patienten: GsPatient[];
  unverletzt: number;
  partner: PartnerArt[];
  /** Thema des Abfragekapitels (verkehrsunfall, brand …) */
  thema: string;
  anrufer: GsAnrufer[];
  /** Befreiung/Rettung durch die Feuerwehr dauert (Minuten nach Eintreffen der Feuerwehr) */
  fwMin: [number, number];
  /** Zufahrt / Einweisung (Lagemeldung) */
  zufahrt: string;
  /** Anrainer mit Augen-/Atemwegsreizung rufen selbst an (KremsChem) */
  anrainer?: number;
}

/** Ort eines Ereignisses (in der Simulation ausgewählt) */
export interface GsOrt {
  lat: number;
  lon: number;
  /** Adresse bzw. Stelle, wie sie im Einsatz steht */
  adresse: string;
  /** so sagt es der Anrufer */
  gemeldet: string;
  gemeinde: string;
  /** Straße/Strecke (B37, S5) */
  strasse?: string;
  richtung?: string;
  /** Gebäude: Stockwerke */
  stockwerke?: number;
  /** Bahnstrecke mit Oberleitung */
  elektrifiziert?: boolean;
}

export interface GsKontext {
  rnd: () => number;
  stunde: number;
  /** 0 = Sonntag … 6 = Samstag */
  wochentag: number;
  /** Wetter: trocken, nebel, regen, gewitter, schnee, eis */
  wetter: string;
  dunkel: boolean;
  heiss: boolean;
  ort: GsOrt;
}

/** Wo ein Szenario spielt */
export type GsOrtArt =
  | { art: "fest"; lat: number; lon: number; adresse: string; gemeldet: string; gemeinde: string }
  | { art: "strasse"; typ: "landstrasse" | "autobahn"; namen: string[] }
  | { art: "gebaeude" }
  | { art: "bahnuebergang" };

export interface GsSzenario {
  id: string;
  titel: string;
  /** kann passieren von–bis (Stunde, bis exklusiv; über Mitternacht erlaubt) */
  stunden: [number, number];
  /** nur Montag bis Freitag */
  werktags?: boolean;
  /** nur in dieser Funkgruppe */
  funkgruppe: string;
  ort: GsOrtArt;
  bauen(k: GsKontext): GsAufbau;
}

// ------------------------------------------------------------------ Werkzeuge

function zwischen(r: () => number, a: number, b: number): number {
  return Math.floor(a + r() * (b - a + 1));
}

function wahl<T>(r: () => number, l: T[]): T {
  return l[Math.floor(r() * l.length)];
}

function mischen<T>(r: () => number, l: T[]): T[] {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** „≈ 45“: ein paar Jahre daneben */
function ca(r: () => number, alter: number, streu = 4): number {
  return Math.max(1, alter + zwischen(r, -streu, streu));
}

interface PoolEintrag extends Omit<GsPatient, "nr" | "alter" | "geschlecht" | "sichtung"> {
  alter: [number, number];
  geschlecht?: "m" | "w";
}

/**
 * Patienten ziehen: je Sichtung eine Zahl im Bereich; die ersten `fest` Einträge des Pools kommen sicher
 * (die Personen der Geschichte), der Rest zufällig aus dem Pool.
 */
function ziehen(r: () => number, plan: { s: GsSichtung; n: number; pool: PoolEintrag[]; fest?: number }[]): GsPatient[] {
  const out: GsPatient[] = [];
  for (const p of plan) {
    const fest = p.pool.slice(0, Math.min(p.fest ?? 0, p.n));
    const rest = p.pool.slice(p.fest ?? 0);
    const wahlen = [...fest];
    let frei = mischen(r, rest);
    while (wahlen.length < p.n && (rest.length || p.pool.length)) {
      if (!frei.length) frei = mischen(r, rest.length ? rest : p.pool);
      wahlen.push(frei.shift()!);
    }
    for (const x of wahlen) {
      const { alter, geschlecht, ...sonst } = x;
      out.push({ ...sonst, nr: 0, alter: zwischen(r, alter[0], alter[1]), geschlecht: geschlecht ?? (r() < 0.5 ? "m" : "w"), sichtung: p.s });
    }
  }
  // Nummern in zufälliger Reihenfolge (so findet man sie auch)
  const ord = mischen(r, out);
  ord.forEach((p, i) => (p.nr = i + 1));
  return out.sort((a, b) => a.nr - b.nr);
}

/** Schätzung eines Laien: „Wie viele Personen sind betroffen?“ (Abfragewert) */
export function schaetzungWert(n: number): string {
  return n <= 1 ? "1" : n <= 5 ? "n" : n <= 10 ? "6-10" : n <= 30 ? "11-30" : "30+";
}

function schaetzen(r: () => number, wirklich: number, streu = 0.35): string {
  return schaetzungWert(Math.max(2, Math.round(wirklich * (1 - streu + r() * 2 * streu))));
}

/** NF-Stufe aus der Zahl der Betroffenen */
export function nfAusZahl(n: number): NfStufe {
  return n > 30 ? "NF30" : n > 10 ? "NF10" : "NF5";
}

/** Kräfte nach Stufe: SEG zum Berufungsort, dazu in den Bereitstellungsraum (Notarztmittel, Rettungsmittel, BEL) */
export const NF_KRAEFTE: Record<NfStufe, { na: number; rm: number; bel: number }> = {
  NF5: { na: 2, rm: 3, bel: 0 },
  NF10: { na: 4, rm: 6, bel: 1 },
  NF30: { na: 8, rm: 12, bel: 2 },
};
/** Schnelleinsatzgruppe (zum Berufungsort) */
export const SEG = { bel: 1, nef: 2, rtw: 3 };

const WETTER_GRUND: Record<string, string> = {
  nebel: "dichten Nebel",
  regen: "die nasse Fahrbahn",
  gewitter: "die nasse Fahrbahn",
  schnee: "Schneefahrbahn",
  eis: "Glatteis",
};

function stelleText(o: GsOrt): string {
  return o.gemeldet;
}

// ------------------------------------------------------------------ Szenarien (TETRA NÖ-03)

/** Pkw-Insassen: max. 5 Personen pro Auto */
const VU_GRUEN: PoolEintrag[] = [
  { muster: "HWS-Zerrung", diagnose: "bu_bagatellverletzung", alter: [20, 60] },
  { muster: "Gurtprellung Brustkorb", diagnose: "bu_bagatellverletzung", alter: [20, 70] },
  { muster: "Prellungen, Schock", diagnose: "bu_bagatellverletzung", alter: [18, 75] },
  { muster: "Platzwunde Stirn", diagnose: "bu_bagatellverletzung", alter: [18, 70] },
  { muster: "Knieprellung", diagnose: "bu_bagatellverletzung", alter: [20, 65] },
  { muster: "Schnittwunden durch Glassplitter", diagnose: "bu_bagatellverletzung", alter: [18, 70] },
];

const auffahrBundesstrasse: GsSzenario = {
  id: "gs_auffahr_b",
  titel: "Auffahrunfall Bundesstraße",
  stunden: [5, 10],
  funkgruppe: "NÖ-03",
  ort: { art: "strasse", typ: "landstrasse", namen: ["B37", "B3", "B4", "B19", "B35"] },
  bauen(k) {
    const r = k.rnd;
    const autos = zwischen(r, 3, 5);
    const grund = WETTER_GRUND[k.wetter] ?? (k.stunde < 9 && r() < 0.5 ? "die tiefstehende Sonne" : "Unaufmerksamkeit");
    const eingeklemmt = r() < 0.75;
    const familieVorne = r() < 0.5;
    const rotPool: PoolEintrag[] = eingeklemmt
      ? [{ rolle: "Pendler im mittleren Pkw", muster: "eingeklemmt, Rippenserienfraktur, Atemnot", diagnose: "bu_schweres_thoraxtrauma", alter: [41, 49], geschlecht: "m", fw: true, nah: true, bw: "ja", at: "abnorm" }]
      : [{ rolle: "Lenker im mittleren Pkw", muster: "Thoraxtrauma, Atemnot, Verdacht innere Blutung", diagnose: "bu_schweres_thoraxtrauma", alter: [41, 49], geschlecht: "m", nah: true, bw: "getruebt", at: "abnorm" }];
    const gelbPool: PoolEintrag[] = [
      { rolle: "Lenkerin 3. Pkw", muster: "Unterarmfraktur", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [46, 54], geschlecht: "w" },
      { rolle: "Beifahrer 3. Pkw", muster: "Verdacht Beckenfraktur", diagnose: "bu_polytrauma", alter: [56, 64], geschlecht: "m" },
    ];
    const kinder: PoolEintrag[] = [
      { rolle: "Mutter", muster: "HWS-Zerrung", diagnose: "bu_bagatellverletzung", alter: [34, 42], geschlecht: "w" },
      { rolle: "Kind", muster: "Schulterprellung", diagnose: "bu_verletztes_kind", alter: [8, 10] },
      { rolle: "Kind", muster: "leicht verletzt, weint", diagnose: "bu_verletztes_kind", alter: [5, 7] },
      { rolle: "Kombi-Lenker", muster: "Gurtprellung", diagnose: "bu_bagatellverletzung", alter: [27, 33], geschlecht: "m" },
      { rolle: "Lenker letzter Pkw", muster: "HWS-Zerrung", diagnose: "bu_bagatellverletzung", alter: [21, 27] },
      ...VU_GRUEN,
    ];
    const patienten = ziehen(r, [
      { s: "rot", n: 1, pool: rotPool, fest: 1 },
      { s: "gelb", n: zwischen(r, 1, 2), pool: gelbPool, fest: 2 },
      { s: "gruen", n: zwischen(r, 4, 5), pool: kinder, fest: 3 },
    ]);
    const unverletzt = zwischen(r, 0, 1);
    const n = patienten.length + unverletzt;
    const strasse = k.ort.strasse ?? "Bundesstraße";
    const rot = patienten.find((p) => p.sichtung === "rot")!;
    const fest: Antworten = {
      verletzte: "ja",
      grossunfall: "nein",
      mechanismus: "nein",
      hohe_geschw: "nein",
      gefahrgut: "nein",
      eingeklemmt: eingeklemmt ? "ja" : "nein",
      blutung_stark: "nein",
      andere_gefahren: "ja",
      gering: "nein",
      anrufer_selbst: "nein",
      anzahl: "n",
      mehrere_rm: "ja",
      bw: rot.bw === "getruebt" ? "getruebt" : "ja",
      at: "abnorm",
    };
    const geschehen = [
      `Auf der ${strasse} hat sich in der Früh der Verkehr gestaut. Ein Kombi hat wegen ${grund} die Bremslichter zu spät gesehen und zwei Autos ineinandergeschoben, ein weiteres Auto ist noch hinten aufgefahren – insgesamt ${autos} Autos.`,
      eingeklemmt ? "Im mittleren Auto sitzt ein Mann eingeklemmt, die Tür geht nicht auf, er bekommt schlecht Luft." : "Im mittleren Auto sitzt ein Mann, der ganz schlecht Luft bekommt und sich die Brust hält.",
      `In einem Auto ${familieVorne ? "weiter vorne" : "weiter hinten"} sitzt eine Mutter mit zwei Kindern, die Kinder weinen.`,
      "Mehrere Leute stehen verletzt neben den Autos, andere halten sich den Nacken.",
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "lenker",
        nachMin: 0,
        ortArt: "landstrasse",
        stelle: [`auf der ${strasse}`],
        hergang: [`Da ist gerade ein Auffahrunfall passiert, ${autos} Autos, mehrere Verletzte, einer ist eingeklemmt!`],
        geschehen: [...geschehen, "Du bist mit deinem Auto hinten nachgekommen und hast angehalten. Du bist selbst nicht verletzt."],
        details: ["Es staut sich schon in beide Richtungen.", "Ein paar Leute versuchen zu helfen.", eingeklemmt ? "Die Fahrertür vom mittleren Auto ist ganz eingedrückt." : "Der Mann im mittleren Auto ist ganz blass."],
        verlauf: ["Du bist aufgeregt und redest schnell, im Hintergrund hupt es."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n) },
        patient: { alter: rot.alter, geschlecht: rot.geschlecht },
      },
      {
        typ: "lenker",
        nachMin: zwischen(r, 2, 4),
        ortArt: "landstrasse",
        stelle: [`auf der ${strasse}, Gegenrichtung`],
        hergang: ["Ich fahr gerade auf der Gegenfahrbahn vorbei, da drüben sind mehrere Autos ineinandergekracht!"],
        geschehen: [...geschehen.slice(0, 1), "Du siehst das nur im Vorbeifahren von der Gegenfahrbahn aus und hast kurz angehalten."],
        details: ["Wie viele verletzt sind, kannst du nicht genau sagen.", "Ein paar Leute stehen auf der Straße."],
        verlauf: ["Du bist unsicher, wie schlimm es ist."],
        fest: { ...fest, eingeklemmt: "unbekannt", anzahl: "unbekannt", bw: "unbekannt", at: "unbekannt", anzahl_patienten: schaetzen(r, n, 0.5) },
        patient: { alter: rot.alter, geschlecht: rot.geschlecht },
      },
      {
        typ: "selbst",
        nachMin: zwischen(r, 3, 6),
        ortArt: "auto",
        stelle: [`im Auto auf der ${strasse}`],
        hergang: ["Wir hatten gerade einen Unfall, mir tut der Nacken weh und meine Kinder weinen!"],
        geschehen: ["Du bist die Mutter, du sitzt mit deinen zwei Kindern im Auto, das in den Auffahrunfall verwickelt war.", "Dein Nacken tut weh, die Kinder sind erschrocken und weinen, eines hält sich die Schulter.", ...geschehen.slice(1, 2)],
        details: ["Die Kinder sind angeschnallt gewesen.", "Vor euch hängt ein Mann in seinem Auto fest."],
        verlauf: ["Du bist aufgelöst und besorgt um deine Kinder."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.4), bw: "ja", at: "normal" },
        patient: { alter: ca(r, 38), geschlecht: "w" },
      },
    ];
    return {
      szenario: this.id,
      titel: `Auffahrunfall ${autos} Pkw, ${strasse}`,
      art: `Verkehrsunfall, ${autos} Pkw aufeinander aufgefahren${eingeklemmt ? ", eine Person eingeklemmt" : ""}`,
      sicht: `${autos} Pkw ineinander verkeilt, mehrere Personen auf der Fahrbahn, ${eingeklemmt ? "eine Person im mittleren Fahrzeug eingeklemmt" : "eine Person im mittleren Fahrzeug mit Atemnot"}`,
      gefahren: ["fließender Verkehr in der Gegenrichtung", "auslaufende Betriebsmittel", ...(k.wetter === "nebel" ? ["schlechte Sicht durch Nebel"] : [])],
      patienten,
      unverletzt,
      partner: ["fw", "pol"],
      thema: "verkehrsunfall",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [8, 18],
      zufahrt: `Zufahrt über die ${strasse}, Stau beachten, Rettungsgasse`,
    };
  },
};

const auffahrSchnellstrasse: GsSzenario = {
  id: "gs_auffahr_s",
  titel: "Auffahrunfall Schnellstraße",
  stunden: [9, 20],
  funkgruppe: "NÖ-03",
  ort: { art: "strasse", typ: "autobahn", namen: ["S5", "S33"] },
  bauen(k) {
    const r = k.rnd;
    const vaterLenkt = r() < 0.65;
    const kindAlter = zwischen(r, 3, 8);
    const vorne = r() < 0.5 ? "einen Pkw und einen Kastenwagen" : "zwei Pkw";
    const stauGrund = r() < 0.6 ? "einer Baustelle" : "einer Panne";
    const strasse = k.ort.strasse ?? "Schnellstraße";
    const lenker: PoolEintrag = vaterLenkt
      ? { rolle: "Vater (Lenker Van)", muster: "eingeklemmt, Oberschenkelfraktur, Thoraxtrauma", diagnose: "bu_polytrauma", alter: [38, 44], geschlecht: "m", fw: true, nah: true, bw: "getruebt", at: "abnorm" }
      : { rolle: "Mutter (Lenkerin Van)", muster: "eingeklemmt, Oberschenkelfraktur, Thoraxtrauma", diagnose: "bu_polytrauma", alter: [36, 42], geschlecht: "w", fw: true, nah: true, bw: "getruebt", at: "abnorm" };
    const beifahrer: PoolEintrag = vaterLenkt
      ? { rolle: "Mutter (Beifahrerin Van)", muster: "Unterarmfraktur, Rippenprellung", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [36, 42], geschlecht: "w" }
      : { rolle: "Vater (Beifahrer Van)", muster: "Unterarmfraktur, Rippenprellung", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [38, 44], geschlecht: "m" };
    const patienten = ziehen(r, [
      {
        s: "rot",
        n: 2,
        pool: [{ rolle: "Kind (aus dem Van geschleudert)", muster: "aus dem Fahrzeug geschleudert, bewusstlos, Schädel-Hirn-Trauma", diagnose: "bu_kritisch_krankes_kind", alter: [kindAlter, kindAlter], nah: true, bw: "nein", at: "abnorm" }, lenker],
        fest: 2,
      },
      { s: "gelb", n: 2, pool: [beifahrer, { rolle: "Lenkerin Pkw vorne", muster: "Rückenschmerz, Verdacht Wirbelfraktur", diagnose: "bu_wirbelsaeulenverletzung_mit_neurologisch", alter: [51, 59], geschlecht: "w" }], fest: 2 },
      {
        s: "gruen",
        n: zwischen(r, 3, 6),
        pool: [
          { rolle: "Kind (Van)", muster: "Platzwunde Stirn", diagnose: "bu_verletztes_kind", alter: [7, 9] },
          { rolle: "Kind (Van)", muster: "Prellungen, Schock", diagnose: "bu_verletztes_kind", alter: [10, 12] },
          { rolle: "Beifahrer Pkw vorne", muster: "HWS-Zerrung", diagnose: "bu_bagatellverletzung", alter: [53, 61], geschlecht: "m" },
          { rolle: "Lenker Kastenwagen", muster: "Prellung Schulter", diagnose: "bu_bagatellverletzung", alter: [29, 37], geschlecht: "m" },
          ...VU_GRUEN,
        ],
        fest: 4,
      },
    ]);
    const n = patienten.length;
    const fest: Antworten = {
      verletzte: "ja",
      grossunfall: "nein",
      mechanismus: "geschleudert",
      hohe_geschw: "ja",
      gefahrgut: "nein",
      eingeklemmt: "ja",
      blutung_stark: "unbekannt",
      andere_gefahren: "ja",
      gering: "nein",
      anrufer_selbst: "nein",
      anzahl: "n",
      mehrere_rm: "ja",
      bw: "nein",
      at: "abnorm",
    };
    const geschehen = [
      `Auf der ${strasse} hat sich vor ${stauGrund} der Verkehr gestaut. Ein vollbeladener Van mit einer Familie (Eltern und drei Kinder, auf dem Weg in den Urlaub) ist mit hoher Geschwindigkeit auf das Stauende aufgefahren, auf ${vorne}.`,
      `Ein kleines Kind (ca. ${kindAlter} Jahre) wurde aus dem Van geschleudert und liegt regungslos auf der Fahrbahn.`,
      `${vaterLenkt ? "Der Vater" : "Die Mutter"} sitzt eingeklemmt am Steuer und stöhnt.`,
      "Weitere Leute aus den Autos sind verletzt, manche gehen herum, andere sitzen am Straßenrand.",
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "lenker",
        nachMin: 0,
        ortArt: "autobahn",
        stelle: [`auf der ${strasse}`],
        hergang: ["Hier ist ein schwerer Unfall, ein Kind liegt regungslos auf der Straße!"],
        geschehen: [...geschehen, "Du bist der Lenker des Kastenwagens, auf den aufgefahren wurde. Dir tut die Schulter weh, sonst geht es dir gut."],
        details: ["Das Kind bewegt sich nicht.", "Überall liegen Koffer und Taschen auf der Fahrbahn.", "Hinter euch staut es sich."],
        verlauf: ["Du bist geschockt und redest durcheinander."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n) },
        patient: { alter: kindAlter, geschlecht: r() < 0.5 ? "m" : "w" },
      },
      {
        typ: "lenker",
        nachMin: zwischen(r, 1, 3),
        ortArt: "autobahn",
        stelle: [`im Stau auf der ${strasse}`],
        hergang: ["Vorne im Stau ist gerade ein Auto voll reingekracht, da liegt ein Kind auf der Straße!"],
        geschehen: [...geschehen.slice(0, 2), "Du stehst einige Autos weiter hinten im Stau und siehst nur einen Teil."],
        details: ["Mehrere Leute laufen hin.", "Wie viele Verletzte es sind, weißt du nicht genau."],
        verlauf: ["Du bist aufgeregt."],
        fest: { ...fest, eingeklemmt: "unbekannt", anzahl: "unbekannt", at: "unbekannt", anzahl_patienten: schaetzen(r, n, 0.5) },
        patient: { alter: kindAlter, geschlecht: r() < 0.5 ? "m" : "w" },
      },
      {
        typ: "eltern",
        nachMin: zwischen(r, 4, 7),
        ortArt: "autobahn",
        stelle: [`neben dem Van auf der ${strasse}`],
        hergang: ["Bitte kommen Sie schnell, mein Kind liegt auf der Straße und mein Mann ist eingeklemmt!"],
        geschehen: [...geschehen, "Du bist die Mutter (bzw. ein Elternteil) aus dem Van, dein Arm tut sehr weh."],
        details: ["Die anderen Kinder sitzen weinend am Straßenrand.", "Jemand kümmert sich um dein Kind auf der Straße."],
        verlauf: ["Du bist panisch und weinst."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.3) },
        patient: { alter: kindAlter, geschlecht: r() < 0.5 ? "m" : "w" },
      },
    ];
    return {
      szenario: this.id,
      titel: `Auffahrunfall Stauende ${strasse}`,
      art: "Verkehrsunfall am Stauende, Van auf mehrere Fahrzeuge aufgefahren, Kind herausgeschleudert, Person eingeklemmt",
      sicht: `Van auf ${vorne} aufgefahren, ein Kind regungslos auf der Fahrbahn, Lenker im Van eingeklemmt, Gepäck auf der Fahrbahn`,
      gefahren: ["Stauende, nachkommender Verkehr", "auslaufende Betriebsmittel"],
      patienten,
      unverletzt: 0,
      partner: ["fw", "pol"],
      thema: "verkehrsunfall",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [10, 20],
      zufahrt: `Zufahrt über die ${strasse} ${k.ort.richtung ? `Richtung ${k.ort.richtung}` : ""} durch die Rettungsgasse`.trim(),
    };
  },
};

const tunnelDuernstein: GsSzenario = {
  id: "gs_tunnel_duernstein",
  titel: "Unfall im Tunnel Dürnstein",
  stunden: [8, 20],
  funkgruppe: "NÖ-03",
  ort: { art: "fest", lat: 48.39565, lon: 15.52106, adresse: "B3, Tunnel Dürnstein, 3601 Dürnstein", gemeldet: "im Tunnel bei Dürnstein auf der B3", gemeinde: "Dürnstein" },
  bauen(k) {
    const r = k.rnd;
    const gegner = wahl(r, ["ein Wohnmobil", "einen Kleinbus", "einen Lieferwagen"]);
    const brand = r() < 0.6;
    const naeher = r() < 0.5 ? "Dürnstein" : "Loiben";
    const dahinter = wahl(r, ["mehrere Autos", "eine Motorradgruppe", "ein Reisebus"]);
    const patienten = ziehen(r, [
      { s: "rot", n: 1, pool: [{ rolle: "Pkw-Lenker", muster: brand ? "eingeklemmt, Verbrennungen an den Beinen, Thoraxtrauma" : "eingeklemmt, Thoraxtrauma, Beinverletzung", diagnose: "bu_polytrauma", alter: [25, 31], geschlecht: "m", fw: true, nah: true, bw: "getruebt", at: "abnorm" }], fest: 1 },
      {
        s: "gelb",
        n: 2,
        pool: [
          { rolle: "Beifahrerin Pkw", muster: "Rauchgasinhalation, Unterarmfraktur", diagnose: "bu_co_vergiftung_tauchunfall", alter: [23, 29], geschlecht: "w" },
          { rolle: `Lenker (${gegner.replace(/^(ein|einen) /, "")})`, muster: "Brustschmerz nach Aufprall", diagnose: "bu_acs_ohne_st_hebung_unklarer_thoraxschmer", alter: [60, 68], geschlecht: "m" },
        ],
        fest: 2,
      },
      {
        s: "gruen",
        n: zwischen(r, 3, 7),
        pool: [
          { rolle: `Beifahrerin (${gegner.replace(/^(ein|einen) /, "")})`, muster: "Prellungen", diagnose: "bu_bagatellverletzung", alter: [58, 66], geschlecht: "w" },
          { muster: "leichte Rauchgasinhalation (Husten, Augenbrennen)", diagnose: "bu_pneumonie_atemnot_copd", alter: [18, 75] },
          { muster: "leichte Rauchgasinhalation (Husten)", diagnose: "bu_pneumonie_atemnot_copd", alter: [18, 75] },
          { muster: "Augenbrennen durch Rauch", diagnose: "bu_augenverletzung", alter: [18, 70] },
        ],
        fest: 1,
      },
    ]);
    const n = patienten.length;
    const fest: Antworten = {
      verletzte: "ja",
      grossunfall: "nein",
      mechanismus: "nein",
      hohe_geschw: "nein",
      gefahrgut: "nein",
      eingeklemmt: "ja",
      blutung_stark: "unbekannt",
      andere_gefahren: "ja",
      gering: "nein",
      anrufer_selbst: "nein",
      anzahl: "n",
      mehrere_rm: "ja",
      bw: "unbekannt",
      at: "abnorm",
    };
    const geschehen = [
      `Im Tunnel Dürnstein auf der B3 (eine Röhre, Gegenverkehr), näher am Portal ${naeher}, ist ein Pkw auf die Gegenfahrbahn gekommen und frontal gegen ${gegner} geprallt.`,
      brand ? "Der Pkw hat zu brennen begonnen, der Tunnel füllt sich mit dichtem Rauch." : "Aus dem Motorraum vom Pkw kommt starker Rauch, der Tunnel ist verraucht.",
      `Die Leute dahinter (${dahinter}) haben ihre Fahrzeuge stehen gelassen und sind zu den Portalen hinausgelaufen, viele husten.`,
      "Der Pkw-Lenker ist eingeklemmt.",
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "lenker",
        nachMin: 0,
        ortArt: "landstrasse",
        stelle: ["vor dem Tunnelportal"],
        hergang: ["Im Tunnel bei Dürnstein hat's gekracht, da brennt ein Auto und alles ist voller Rauch!"],
        geschehen: [...geschehen, "Du bist mit deinem Auto im Tunnel gestanden und zu Fuß hinausgelaufen. Du hustest ein bisschen."],
        details: ["Aus dem Tunnel kommt schwarzer Rauch.", "Es kommen immer mehr Leute heraus."],
        verlauf: ["Du hustest zwischendurch und bist außer Atem."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n + 4, 0.4) },
        patient: { alter: ca(r, 28), geschlecht: "m" },
      },
      {
        typ: "passant",
        nachMin: zwischen(r, 1, 4),
        ortArt: "landstrasse",
        stelle: [`beim Tunnelportal ${naeher}`],
        hergang: ["Ich bin mit dem Rad beim Tunnel, da kommt Rauch raus und Leute laufen heraus!"],
        geschehen: [...geschehen.slice(1, 3), "Du bist Radfahrer und stehst am Tunnelportal, du warst nicht im Tunnel."],
        details: ["Ein paar Leute sitzen hustend am Straßenrand."],
        verlauf: ["Du bist aufgeregt."],
        fest: { ...fest, eingeklemmt: "unbekannt", anzahl: "unbekannt", bw: "unbekannt", at: "unbekannt", anzahl_patienten: schaetzen(r, n, 0.5) },
        patient: { alter: ca(r, 28), geschlecht: "m" },
      },
      {
        typ: "lenker",
        nachMin: zwischen(r, 3, 6),
        ortArt: "landstrasse",
        stelle: ["im Tunnel"],
        hergang: ["Mir ist einer frontal reingefahren im Tunnel, der andere steckt im Auto fest!"],
        geschehen: [`Du bist die Person am Steuer von ${gegner.replace(/^ein /, "dem ").replace(/^einen /, "dem ")}, in das der Pkw frontal gekracht ist.`, ...geschehen.slice(1), "Deine Brust tut weh vom Gurt."],
        details: ["Dein Beifahrer ist auch ausgestiegen.", "Im Pkw sitzen zwei junge Leute."],
        verlauf: ["Du bist zittrig und unter Schock."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.4) },
        patient: { alter: ca(r, 28), geschlecht: "m" },
      },
    ];
    return {
      szenario: this.id,
      titel: "Verkehrsunfall im Tunnel Dürnstein",
      art: `Verkehrsunfall im Tunnel, Pkw frontal gegen ${gegner.replace(/^(ein|einen) /, "")}${brand ? ", Fahrzeugbrand" : ""}, Person eingeklemmt`,
      sicht: `Rauch tritt aus dem Tunnelportal aus, mehrere Personen hustend vor dem Portal, ${brand ? "Fahrzeugbrand im Tunnel" : "starke Rauchentwicklung im Tunnel"}`,
      gefahren: [brand ? "Fahrzeugbrand im Tunnel" : "starke Rauchentwicklung", "Tunnel verraucht – Zugang nur mit Atemschutz (Feuerwehr)"],
      patienten,
      unverletzt: zwischen(r, 2, 6),
      partner: ["fw", "pol"],
      thema: "verkehrsunfall",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [12, 22],
      zufahrt: `Zufahrt zum Portal ${naeher}, Bereitstellung außerhalb des Rauchs`,
    };
  },
};

const wohnungsbrand: GsSzenario = {
  id: "gs_wohnungsbrand",
  titel: "Brand Mehrparteienhaus",
  stunden: [20, 6],
  funkgruppe: "NÖ-03",
  ort: { art: "gebaeude" },
  bauen(k) {
    const r = k.rnd;
    const stock = Math.max(1, Math.min(3, zwischen(r, 1, Math.max(1, (k.ort.stockwerke ?? 4) - 2))));
    const fluechter = r() < 0.6;
    const haustier = r() < 0.4;
    const gelbPool: PoolEintrag[] = [
      { rolle: "Kind (oberes Stockwerk)", muster: "Rauchgasinhalation, Husten, Atemnot", diagnose: "bu_internistischer_kindernotfall", alter: [6, 8], fw: true },
      { rolle: "ältere Frau mit COPD", muster: "Rauchgasinhalation, Atemnot bei COPD", diagnose: "bu_pneumonie_atemnot_copd", alter: [75, 81], geschlecht: "w", fw: true },
      { muster: "Rauchgasinhalation, Husten, Atemnot", diagnose: "bu_co_vergiftung_tauchunfall", alter: [25, 70], fw: true },
      { muster: "Rauchgasinhalation, Husten", diagnose: "bu_pneumonie_atemnot_copd", alter: [20, 80], fw: true },
    ];
    const rotPool: PoolEintrag[] = [{ rolle: "Bewohner der Brandwohnung", muster: "bewusstlos, Rauchgas-/CO-Vergiftung, Verbrennungen an Händen und Gesicht", diagnose: "bu_schwere_verbrennung", alter: [55, 61], geschlecht: "m", fw: true, nah: true, bw: "nein", at: "abnorm" }];
    if (fluechter && r() < 0.4) rotPool.push({ rolle: "Bewohner (Flucht durchs Stiegenhaus)", muster: "schwere Rauchgasinhalation, eingetrübt", diagnose: "bu_co_vergiftung_tauchunfall", alter: [30, 60], bw: "getruebt", at: "abnorm" });
    const patienten = ziehen(r, [
      { s: "rot", n: rotPool.length, pool: rotPool, fest: rotPool.length },
      { s: "gelb", n: zwischen(r, 3, 5) - (rotPool.length > 1 ? 1 : 0), pool: gelbPool, fest: 2 },
      { s: "gruen", n: zwischen(r, 2, 6), pool: [{ muster: "leichte Rauchgasinhalation", diagnose: "bu_pneumonie_atemnot_copd", alter: [18, 80] }, { muster: "Schock, Panik", diagnose: "bu_hausaerztlich", alter: [18, 85] }, { muster: "Husten, Augenbrennen", diagnose: "bu_augenverletzung", alter: [15, 80] }] },
    ]);
    const unverletzt = zwischen(r, 10, 20);
    const fest: Antworten = { art: "feuer", brennt_noch: "nein", eingeschlossen: "ja", mehrere_verletzte: "unbekannt", bw: "unbekannt", at: "unbekannt" };
    const geschehen = [
      `In einem Mehrparteienhaus (${k.ort.stockwerke ?? 4} Stockwerke) brennt eine Wohnung im ${stock}. Stock in Vollbrand – der Bewohner ist vermutlich mit der Zigarette auf dem Sofa eingeschlafen.`,
      "Das Stiegenhaus ist voller Rauch, keiner kommt mehr hinunter. Bewohner der oberen Stockwerke stehen auf den Balkonen und rufen um Hilfe.",
      ...(fluechter ? ["Ein Bewohner hat versucht, durchs Stiegenhaus zu flüchten, und ist hustend zusammengebrochen."] : []),
      ...(haustier ? ["Eine Bewohnerin will unbedingt zurück, weil ihre Katze noch in der Wohnung ist."] : []),
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "selbst",
        nachMin: 0,
        ortArt: "wohnung",
        stelle: [`in der Wohnung im ${Math.min((k.ort.stockwerke ?? 4), stock + zwischen(r, 1, 2))}. Stock`],
        hergang: ["Bei uns im Haus brennt es, das Stiegenhaus ist voller Rauch, wir kommen nicht mehr raus!"],
        geschehen: [...geschehen, "Du wohnst in einem oberen Stockwerk und bist in deiner Wohnung eingeschlossen. Unter dir brennt es. Du stehst mit dem Telefon auf dem Balkon."],
        details: ["Durch die Wohnungstür kommt Rauch.", "Unten auf der Straße stehen schon Leute."],
        verlauf: ["Du hast große Angst, hustest manchmal."],
        fest: { ...fest, anzahl_patienten: "unbekannt" },
        patient: { alter: ca(r, 45, 15), geschlecht: "w" },
      },
      {
        typ: "nachbar",
        nachMin: zwischen(r, 1, 3),
        ortArt: "strasse",
        stelle: ["auf der Straße gegenüber"],
        hergang: ["Gegenüber brennt ein Wohnhaus, die Leute stehen auf den Balkonen und schreien!"],
        geschehen: [...geschehen.slice(0, 2), "Du wohnst gegenüber und siehst das Feuer aus dem Fenster."],
        details: ["Aus einem Fenster schlagen Flammen.", "Auf mehreren Balkonen stehen Leute."],
        verlauf: ["Du bist aufgeregt."],
        fest: { ...fest, mehrere_verletzte: "unbekannt", anzahl_patienten: schaetzen(r, patienten.length + 4, 0.4) },
        patient: { alter: ca(r, 58), geschlecht: "m" },
      },
      {
        typ: "selbst",
        nachMin: zwischen(r, 3, 6),
        ortArt: "wohnung",
        stelle: ["auf dem Balkon im obersten Stock"],
        hergang: ["Wir stehen am Balkon, es ist überall Rauch, mein Kind hustet ganz stark!"],
        geschehen: [...geschehen.slice(0, 2), "Du stehst mit deinem Kind (ca. 7 Jahre) auf dem Balkon, das Kind hustet stark."],
        details: ["Im Stiegenhaus siehst du nichts mehr vor lauter Rauch."],
        verlauf: ["Du bist panisch."],
        fest: { ...fest, mehrere_verletzte: "ja", anzahl_patienten: schaetzen(r, patienten.length + 3, 0.3) },
        patient: { alter: 7, geschlecht: r() < 0.5 ? "m" : "w" },
      },
    ];
    return {
      szenario: this.id,
      titel: `Brand Mehrparteienhaus, ${k.ort.adresse}`,
      art: `Wohnungsbrand im ${stock}. Stock, Stiegenhaus verraucht, Personen eingeschlossen`,
      sicht: `Wohnung im ${stock}. Stock in Vollbrand, Stiegenhaus verraucht, Personen auf den Balkonen der oberen Stockwerke`,
      gefahren: ["Brand, Rauchausbreitung im Stiegenhaus", "Personenrettung über Drehleiter und Atemschutz (Feuerwehr)"],
      patienten,
      unverletzt,
      partner: ["fw", "pol", "ki"],
      thema: "brand",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [6, 25],
      zufahrt: "Zufahrt vor dem Haus für die Drehleiter freihalten, Rettungsdienst seitlich davon",
    };
  },
};

const kremsChem: GsSzenario = {
  id: "gs_kremschem",
  titel: "Explosion KremsChem",
  stunden: [6, 22],
  werktags: true,
  funkgruppe: "NÖ-03",
  ort: { art: "fest", lat: 48.40672, lon: 15.63666, adresse: "Hafenstraße 77, 3500 Krems an der Donau (KremsChem)", gemeldet: "KremsChem, Hafenstraße 77, Krems", gemeinde: "Krems an der Donau" },
  bauen(k) {
    const r = k.rnd;
    const anlage = wahl(r, ["der Formaldehyd-Anlage", "einem Harzreaktor", "dem Lager"]);
    const stadt = r() < 0.5;
    const spaet = k.stunde >= 14;
    const tote = r() < 0.5 ? 0 : zwischen(r, 1, 2);
    const patienten = ziehen(r, [
      { s: "tot", n: tote, pool: [{ muster: "tot (Explosionsherd)", diagnose: "bu_polytrauma", alter: [25, 60], geschlecht: "m" }] },
      {
        s: "rot",
        n: zwischen(r, 2, 4),
        pool: [
          { muster: "großflächige Verbrennungen (ca. 30 %)", diagnose: "bu_schwere_verbrennung", alter: [22, 58], nah: true, bw: "getruebt", at: "abnorm" },
          { muster: "Explosionstrauma (Thorax, Trommelfell)", diagnose: "bu_schweres_thoraxtrauma", alter: [22, 60], nah: true, at: "abnorm" },
          { muster: "schwere Inhalation mit Atemnot", diagnose: "bu_co_vergiftung_tauchunfall", alter: [20, 60], at: "abnorm" },
        ],
        fest: 2,
      },
      {
        s: "gelb",
        n: zwischen(r, 4, 6),
        pool: [
          { muster: "Verbrennungen unter 15 %", diagnose: "bu_leichte_verbrennung", alter: [20, 60] },
          { muster: "Splitterverletzungen", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [20, 60] },
          { muster: "Verätzung der Augen", diagnose: "bu_augenverletzung", alter: [20, 60] },
          { muster: "Inhalation, Atemnot", diagnose: "bu_pneumonie_atemnot_copd", alter: [20, 62] },
        ],
      },
      {
        s: "gruen",
        n: zwischen(r, spaet ? 6 : 8, spaet ? 10 : 15),
        pool: [
          { muster: "Reizung von Augen und Atemwegen", diagnose: "bu_augenverletzung", alter: [19, 62] },
          { muster: "kleine Schnittwunden", diagnose: "bu_bagatellverletzung", alter: [19, 62] },
          { muster: "Schock", diagnose: "bu_hausaerztlich", alter: [19, 62] },
          { muster: "Husten, Reizung der Atemwege", diagnose: "bu_pneumonie_atemnot_copd", alter: [19, 62] },
        ],
      },
    ]);
    const n = patienten.filter((p) => p.sichtung !== "tot").length;
    const fest: Antworten = { art: "explosion", brennt_noch: "nein", eingeschlossen: "unbekannt", mehrere_verletzte: "ja", bw: "nein", at: "abnorm" };
    const geschehen = [
      `Bei KremsChem im Industriepark Krems hat es in ${anlage} eine Explosion gegeben, ein Teil der Halle brennt.`,
      "Formaldehyd-Dämpfe treten aus, eine dunkle Rauchwolke zieht über das Gebiet.",
      "Verletzte Arbeiter liegen vor der Halle, andere sind in den Sozialraum geflüchtet und husten.",
      ...(tote ? ["Bei der Anlage liegt jemand, der sich nicht mehr bewegt."] : []),
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "kollege",
        nachMin: 0,
        ortArt: "arbeit",
        stelle: ["beim Werkstor"],
        hergang: ["Hier ist der Werkschutz von KremsChem, wir hatten eine Explosion, es gibt viele Verletzte!"],
        geschehen: [...geschehen, "Du bist vom Werkschutz bzw. Schichtleiter und hast die Lage im Blick. Die Betriebsfeuerwehr ist schon dran."],
        details: ["Die Mitarbeiter sammeln sich beim Sammelplatz.", "Es riecht stechend."],
        verlauf: ["Du bist angespannt, aber sachlich."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.3) },
        patient: { alter: ca(r, 40, 12), geschlecht: "m" },
      },
      {
        typ: "kollege",
        nachMin: zwischen(r, 1, 3),
        ortArt: "arbeit",
        stelle: ["im Sozialraum"],
        hergang: ["Bei uns in der Firma ist was explodiert, meine Kollegen sind verletzt, wir kriegen schlecht Luft!"],
        geschehen: [...geschehen.slice(0, 3), "Du bist Mitarbeiter, hast dich in den Sozialraum geflüchtet, deine Augen brennen."],
        details: ["Neben dir sitzen mehrere Kollegen, die husten."],
        verlauf: ["Du hustest und bist panisch."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.5) },
        patient: { alter: ca(r, 35, 10), geschlecht: "m" },
      },
      {
        typ: "passant",
        nachMin: zwischen(r, 2, 5),
        ortArt: "strasse",
        stelle: ["auf der Hafenstraße"],
        hergang: ["Beim Industriepark hat's gerade gewaltig gekracht, da steigt eine riesige schwarze Wolke auf!"],
        geschehen: [...geschehen.slice(0, 2), "Du bist Passant und stehst draußen vor dem Gelände."],
        details: ["Du siehst Leute aus der Halle laufen."],
        verlauf: ["Du bist aufgeregt."],
        fest: { ...fest, mehrere_verletzte: "unbekannt", bw: "unbekannt", at: "unbekannt", anzahl_patienten: "unbekannt" },
        patient: { alter: ca(r, 40, 12), geschlecht: "m" },
      },
    ];
    return {
      szenario: this.id,
      titel: "Explosion mit Gefahrstoffaustritt, KremsChem",
      art: `Explosion in ${anlage}, Brand, Gefahrstoffaustritt (Formaldehyd)`,
      sicht: `Brand in der Produktionshalle, dunkle Rauchwolke Richtung ${stadt ? "Stadt" : "Donau"}, mehrere Verletzte vor der Halle`,
      gefahren: ["Gefahrstoffaustritt (Formaldehyd) – Annäherung nur mit dem Wind im Rücken", "Brand in der Halle", "Dekontamination durch die Feuerwehr"],
      patienten,
      unverletzt: zwischen(r, 10, 30),
      partner: ["fw", "pol", "ki"],
      thema: "brand",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [5, 15],
      zufahrt: "Zufahrt über die Hafenstraße, Werkstor, Einweiser am Tor",
      anrainer: stadt ? zwischen(r, 3, 6) : zwischen(r, 0, 2),
    };
  },
};

const messeTulln: GsSzenario = {
  id: "gs_messe_tulln",
  titel: "Brand Messe Tulln",
  stunden: [9, 15],
  werktags: true,
  funkgruppe: "NÖ-03",
  ort: { art: "fest", lat: 48.32725, lon: 16.03651, adresse: "Messeplatz 1, 3430 Tulln an der Donau (Messe Tulln)", gemeldet: "Messe Tulln, Messeplatz", gemeinde: "Tulln an der Donau" },
  bauen(k) {
    const r = k.rnd;
    const messe = wahl(r, ["Gartenbaumesse", "Freizeitmesse", "Baumesse"]);
    const aeltere = messe === "Gartenbaumesse";
    const ursache = wahl(r, ["ein Kabelbrand", "eine Gasflasche an einem Gastro-Stand", "ein Heizstrahler"]);
    const halle = `Halle ${wahl(r, ["1", "3", "4", "10", "11"])}`;
    const patienten = ziehen(r, [
      {
        s: "rot",
        n: zwischen(r, 1, 3),
        pool: [
          { muster: "bewusstlos nach Rauchgasinhalation", diagnose: "bu_co_vergiftung_tauchunfall", alter: [20, 75], bw: "nein", at: "abnorm" },
          { rolle: "niedergetrampelte Frau", muster: "Thoraxtrauma nach Sturz im Gedränge", diagnose: "bu_schweres_thoraxtrauma", alter: [66, 74], geschlecht: "w", nah: true, at: "abnorm" },
          { rolle: "Aussteller", muster: "Verbrennungen an Armen und Gesicht", diagnose: "bu_schwere_verbrennung", alter: [30, 55], nah: true },
        ],
        fest: 1,
      },
      {
        s: "gelb",
        n: zwischen(r, 4, 8),
        pool: [
          { muster: "Rauchgasinhalation mit Atemnot", diagnose: "bu_co_vergiftung_tauchunfall", alter: [aeltere ? 50 : 20, 85] },
          { muster: "Sprunggelenksfraktur nach Sturz", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [20, 80] },
          { muster: "Unterarmfraktur nach Sturz", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [aeltere ? 55 : 8, 85] },
          { rolle: "älterer Besucher", muster: "Brustschmerz", diagnose: "bu_acs_ohne_st_hebung_unklarer_thoraxschmer", alter: [65, 82], geschlecht: "m" },
        ],
      },
      {
        s: "gruen",
        n: zwischen(r, 10, 20),
        pool: [
          { muster: "leichte Rauchgasinhalation", diagnose: "bu_pneumonie_atemnot_copd", alter: [aeltere ? 45 : 6, 85] },
          { muster: "Prellungen", diagnose: "bu_bagatellverletzung", alter: [aeltere ? 45 : 6, 85] },
          { muster: "Kreislaufprobleme", diagnose: "bu_exsikkose_synkope_az_verschlechterung", alter: [aeltere ? 55 : 12, 88] },
          { muster: "Panik, Hyperventilation", diagnose: "bu_hausaerztlich", alter: [15, 70] },
        ],
      },
    ]);
    const n = patienten.length;
    const fest: Antworten = { art: "feuer", brennt_noch: "nein", eingeschlossen: "unbekannt", mehrere_verletzte: "ja", bw: "nein", at: "abnorm" };
    const geschehen = [
      `Auf der ${messe} in der Messe Tulln (${halle}) hat ${ursache} einen Stand in Brand gesetzt, die volle Halle ist schnell verraucht.`,
      "Die Besucher drängen zu den Ausgängen, im Gedränge sind Menschen gestürzt und niedergetrampelt worden.",
      `Draußen sitzen und liegen viele Leute, manche sind kollabiert${k.heiss ? ", es ist sehr heiß" : ""}.`,
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "aufsicht",
        nachMin: 0,
        ortArt: "freizeit",
        stelle: [`vor ${halle}`],
        hergang: ["Hier ist die Security der Messe Tulln, in einer Halle brennt es, es gibt viele Verletzte!"],
        geschehen: [...geschehen, "Du bist von der Messe-Security und koordinierst draußen die Leute."],
        details: ["Die Halle wird gerade geräumt.", "Ein Sanitäter der Messe gibt es heute nicht."],
        verlauf: ["Du bist gestresst, aber bemühst dich, klar zu reden."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.3) },
        patient: { alter: ca(r, 70), geschlecht: "w" },
      },
      {
        typ: "passant",
        nachMin: zwischen(r, 1, 3),
        ortArt: "freizeit",
        stelle: ["vor dem Messeeingang"],
        hergang: ["Auf der Messe brennt es, die Leute sind übereinander gefallen, eine alte Frau liegt am Boden!"],
        geschehen: [...geschehen, "Du bist Besucher und bist selbst gerade hinausgekommen."],
        details: ["Du hast Rauch eingeatmet und hustest."],
        verlauf: ["Du bist panisch und hustest."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.5) },
        patient: { alter: ca(r, 70), geschlecht: "w" },
      },
      {
        typ: "kollege",
        nachMin: zwischen(r, 2, 5),
        ortArt: "freizeit",
        stelle: [`bei ${halle}`],
        hergang: ["Ich bin Aussteller, bei uns in der Halle brennt's, mein Nachbar hat sich die Hände verbrannt!"],
        geschehen: [...geschehen.slice(0, 2), "Du bist Aussteller, dein Standnachbar hat beim Löschversuch Verbrennungen abbekommen."],
        details: ["Ihr seid jetzt draußen vor der Halle."],
        verlauf: ["Du bist aufgeregt."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.4) },
        patient: { alter: ca(r, 45, 10), geschlecht: "m" },
      },
    ];
    return {
      szenario: this.id,
      titel: `Brand in der Messe Tulln (${halle})`,
      art: `Brand in einer Messehalle, Massenpanik mit Sturzverletzungen, Rauchgasinhalation`,
      sicht: `Rauch aus ${halle}, viele Personen vor der Halle, mehrere liegende Personen`,
      gefahren: ["Brand und Rauch in der Halle", "Menschenmenge vor den Ausgängen"],
      patienten,
      unverletzt: zwischen(r, 20, 60),
      partner: ["fw", "pol", "ki"],
      thema: "brand",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [3, 10],
      zufahrt: "Zufahrt über den Messeplatz, Patientensammelstelle am Parkplatz vor dem Haupteingang",
    };
  },
};

const bahnuebergang: GsSzenario = {
  id: "gs_bahnuebergang",
  titel: "Zug gegen Lkw am Bahnübergang",
  stunden: [0, 24],
  funkgruppe: "NÖ-03",
  ort: { art: "bahnuebergang" },
  bauen(k) {
    const r = k.rnd;
    const h = k.stunde;
    const pendler = (h >= 6 && h < 9) || (h >= 16 && h < 19);
    const nacht = h >= 22 || h < 5;
    const lkw = wahl(r, ["ein Sattelzug", "ein Traktor mit Anhänger", "ein Holztransporter"]);
    const gelbN = nacht ? zwischen(r, 2, 3) : pendler ? zwischen(r, 5, 8) : zwischen(r, 3, 5);
    const gruenN = nacht ? zwischen(r, 2, 3) : pendler ? zwischen(r, 10, 19) : zwischen(r, 4, 9);
    const patienten = ziehen(r, [
      {
        s: "rot",
        n: nacht ? 2 : zwischen(r, 2, 3),
        pool: [
          { rolle: "Lkw-Lenker", muster: "eingeklemmt, Polytrauma", diagnose: "bu_polytrauma", alter: [46, 54], geschlecht: "m", fw: true, nah: true, bw: "getruebt", at: "abnorm" },
          { rolle: "Lokführer", muster: "Thorax- und Beinverletzung", diagnose: "bu_schweres_thoraxtrauma", alter: [41, 49], nah: true, at: "abnorm" },
          { rolle: "Fahrgast", muster: "bewusstlos, Schädel-Hirn-Trauma", diagnose: "bu_schweres_sht", alter: [18, 75], nah: true, bw: "nein" },
        ],
        fest: 2,
      },
      {
        s: "gelb",
        n: gelbN,
        pool: [
          { muster: "Unterarmfraktur", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [16, 80] },
          { muster: "Schlüsselbeinfraktur", diagnose: "bu_isolierte_extremitaetenverletzung", alter: [16, 80] },
          { muster: "Verdacht Wirbelsäulenverletzung", diagnose: "bu_wirbelsaeulenverletzung_mit_neurologisch", alter: [18, 80] },
          { muster: "Platzwunde mit starker Blutung", diagnose: "bu_gesichtsschaedelverletzung", alter: [16, 80] },
        ],
      },
      {
        s: "gruen",
        n: gruenN,
        pool: [
          { muster: "Prellungen", diagnose: "bu_bagatellverletzung", alter: [12, 85] },
          { muster: "HWS-Zerrung", diagnose: "bu_bagatellverletzung", alter: [16, 80] },
          { muster: "Schnittwunden", diagnose: "bu_bagatellverletzung", alter: [12, 85] },
          { muster: "Schock", diagnose: "bu_hausaerztlich", alter: [12, 85] },
        ],
      },
    ]);
    const n = patienten.length;
    const strom = k.ort.elektrifiziert !== false;
    const fest: Antworten = {
      verletzte: "ja",
      grossunfall: "zug",
      mechanismus: "nein",
      hohe_geschw: "ja",
      gefahrgut: "nein",
      eingeklemmt: "ja",
      blutung_stark: "unbekannt",
      andere_gefahren: "ja",
      gering: "nein",
      anrufer_selbst: "nein",
      anzahl: "n",
      mehrere_rm: "ja",
      bw: "unbekannt",
      at: "unbekannt",
    };
    const geschehen = [
      `Am Bahnübergang (${stelleText(k.ort)}) ist ${lkw} hängen geblieben, als die Schranken zugegangen sind. Der Zug hat den Anhänger erfasst, der Triebwagen ist teilweise entgleist.`,
      `Im Zug sind die Fahrgäste durch den Wagen geschleudert worden${pendler ? ", der Zug war voll mit Pendlern" : nacht ? ", im Zug waren nur wenige Leute" : ""}.`,
      "Der Lkw-Lenker ist in seinem Führerhaus eingeklemmt, der Lokführer ist verletzt.",
    ];
    const anrufer: GsAnrufer[] = [
      {
        typ: "lenker",
        nachMin: 0,
        ortArt: "landstrasse",
        stelle: ["vor dem Bahnübergang"],
        hergang: ["Hier ist gerade ein Zug in einen Lkw am Bahnübergang gekracht!"],
        geschehen: [...geschehen, "Du bist mit dem Auto vor dem geschlossenen Bahnübergang gestanden und hast alles gesehen."],
        details: ["Der Zug steht schräg neben den Gleisen.", "Leute klettern aus dem Zug."],
        verlauf: ["Du bist schockiert und redest schnell."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.5) },
        patient: { alter: ca(r, 50), geschlecht: "m" },
      },
      {
        typ: "passant",
        nachMin: zwischen(r, 1, 3),
        ortArt: "bahnhof",
        stelle: ["im Zug"],
        hergang: ["Ich sitz im Zug, wir sind gerade mit irgendwas zusammengekracht, hier sind viele Verletzte!"],
        geschehen: [...geschehen.slice(0, 2), "Du bist Fahrgast im Zug, dein Knie tut weh, neben dir liegt jemand bewusstlos."],
        details: ["Im Wagen liegen Taschen und Glassplitter.", "Manche Leute bluten am Kopf."],
        verlauf: ["Du bist panisch."],
        fest: { ...fest, bw: "nein", anzahl_patienten: schaetzen(r, n, 0.3) },
        patient: { alter: ca(r, 40, 15), geschlecht: "m" },
      },
      {
        typ: "bahnpersonal",
        nachMin: zwischen(r, 2, 5),
        ortArt: "bahnhof",
        stelle: ["im Zug"],
        hergang: ["Hier spricht die Zugbegleiterin, unser Zug ist am Bahnübergang mit einem Lkw kollidiert und entgleist, wir haben mehrere Verletzte!"],
        geschehen: [...geschehen, "Du bist die Zugbegleiterin und gehst durch den Zug."],
        details: [strom ? "Die Oberleitung ist noch nicht abgeschaltet – keiner soll auf die Gleise." : "Auf der Strecke gibt es keine Oberleitung."],
        verlauf: ["Du bist angespannt, aber sachlich."],
        fest: { ...fest, anzahl_patienten: schaetzen(r, n, 0.25) },
        patient: { alter: ca(r, 50), geschlecht: "m" },
      },
    ];
    return {
      szenario: this.id,
      titel: `Zug gegen Lkw am Bahnübergang, ${k.ort.gemeinde}`,
      art: `Zugunfall am Bahnübergang, Zug gegen ${lkw.replace(/^ein /, "")}, Triebwagen teilweise entgleist`,
      sicht: `Zug teilweise entgleist neben dem Bahnübergang, Lkw-Anhänger zerstört, Fahrgäste steigen aus`,
      gefahren: [strom ? "Oberleitung – Arbeiten an den Gleisen erst nach Abschaltung und Erdung" : "Gleisbereich (Strecke ohne Oberleitung)", "Zugverkehr auf dem Nachbargleis sperren"],
      patienten,
      unverletzt: nacht ? zwischen(r, 0, 3) : pendler ? zwischen(r, 20, 60) : zwischen(r, 5, 20),
      partner: ["fw", "pol"],
      thema: "verkehrsunfall",
      anrufer: anrufer.slice(0, zwischen(r, 2, 3)),
      fwMin: [12, 25],
      zufahrt: "Zufahrt über die Straße zum Bahnübergang, nicht über die Gleise",
    };
  },
};

export const GS_SZENARIEN: GsSzenario[] = [auffahrBundesstrasse, auffahrSchnellstrasse, tunnelDuernstein, wohnungsbrand, kremsChem, messeTulln, bahnuebergang];

/** Kann das Szenario jetzt passieren? (Uhrzeit, Werktag) */
export function gsPasstZeit(s: GsSzenario, t: number): boolean {
  const d = new Date(t);
  const h = d.getHours();
  const [a, b] = s.stunden;
  const drin = a <= b ? h >= a && h < b : h >= a || h < b;
  if (!drin) return false;
  if (s.werktags && (d.getDay() === 0 || d.getDay() === 6)) return false;
  return true;
}

/**
 * Wohnhäuser für den Wohnungsbrand: echte Mehrparteienhäuser mit 4–6 Stockwerken (© OpenStreetMap-Mitwirkende).
 * Die Liste bestätigt Paul vor dem Einbau.
 */
export const GS_GEBAEUDE: { adresse: string; gemeinde: string; lat: number; lon: number; stockwerke: number }[] = [
  { adresse: "Symalenstraße 29, 3500 Krems an der Donau", gemeinde: "Krems an der Donau", lat: 48.413, lon: 15.64024, stockwerke: 4 },
  { adresse: "Hartliebgasse 3, 3500 Krems an der Donau", gemeinde: "Krems an der Donau", lat: 48.41588, lon: 15.62307, stockwerke: 6 },
  { adresse: "Goldenkrongasse 4, 3500 Krems an der Donau", gemeinde: "Krems an der Donau", lat: 48.41128, lon: 15.62342, stockwerke: 6 },
  { adresse: "Ringstraße 10, 3500 Krems an der Donau", gemeinde: "Krems an der Donau", lat: 48.41074, lon: 15.60548, stockwerke: 6 },
  { adresse: "Austraße 18, 3500 Krems an der Donau", gemeinde: "Krems an der Donau", lat: 48.40729, lon: 15.60875, stockwerke: 5 },
  { adresse: "Mühlbachgasse 2, 3500 Krems an der Donau", gemeinde: "Krems an der Donau", lat: 48.40965, lon: 15.60183, stockwerke: 5 },
  { adresse: "Leopoldstraße 21, 3400 Klosterneuburg", gemeinde: "Klosterneuburg", lat: 48.30365, lon: 16.32709, stockwerke: 5 },
  { adresse: "Albrechtstraße 98, 3400 Klosterneuburg", gemeinde: "Klosterneuburg", lat: 48.31487, lon: 16.31619, stockwerke: 5 },
  { adresse: "Marzellingasse 12, 3400 Klosterneuburg", gemeinde: "Klosterneuburg", lat: 48.30417, lon: 16.32216, stockwerke: 5 },
  { adresse: "Wiener Straße 66, 3400 Klosterneuburg", gemeinde: "Klosterneuburg", lat: 48.30261, lon: 16.32956, stockwerke: 5 },
  { adresse: "Kirchengasse 3, 2000 Stockerau", gemeinde: "Stockerau", lat: 48.38454, lon: 16.21125, stockwerke: 5 },
  { adresse: "J.-Widhalm-Straße 13, 2070 Retz", gemeinde: "Retz", lat: 48.74904, lon: 15.95357, stockwerke: 4 },
];

/** Strecken ohne Oberleitung (Kamptalbahn): Orte entlang der Strecke */
export const OHNE_OBERLEITUNG = /Zöbing|Schönberg am Kamp|Langenlois|Gars|Plank am Kamp|Stiefern|Rosenburg|Hadersdorf|Etsdorf|Kamp/i;

/** Text zum Verletzungsmuster eines Patienten („Patient 3, rot, ca. 45, männlich: …“) */
export function gsPatientText(p: GsPatient): string {
  const farbe = { rot: "rot", gelb: "gelb", gruen: "grün", tot: "tot" }[p.sichtung];
  return `Patient ${p.nr}, ${farbe}, ca. ${p.alter} Jahre, ${p.geschlecht === "w" ? "weiblich" : "männlich"}: ${p.muster}`;
}
