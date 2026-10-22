/**
 * Fallkatalog: Jeder Einsatz entsteht aus einem Fall – einer verborgenen Wahrheit, aus der Telefonat,
 * Verlauf, Lagemeldung, Notarzt-Bedarf und Krankenhaus abgeleitet werden. Kein Code steht hier drin,
 * nur was wirklich los ist (neutrale Merkmale, siehe themen.ts). Lesbare Fassung zum Prüfen:
 * Dokument „LeitWerk – Fall-Format und Probefälle“.
 *
 * Aufbau:
 * - Teil A (Rahmen) und B (Telefonat) wie bei den Fallgeschichten (SzenarioVorlage): Thema, Alter, Orte,
 *   Anrufer, Hergang, feste Antworten, Details. Texte mit „[variante=A]“ gelten nur für diese Variante.
 * - varianten: Ausgang mit Wahrscheinlichkeit, Zeitleiste (Verlauf, Anrufer meldet sich wieder),
 *   was die Besatzung sieht (Lagemeldung), Notarzt-Bedarf nach Kompetenz, Partner, Krankenhaus.
 */
import type { Antworten } from "./schema";
import type { SzenarioVorlage } from "./szenario";
import type { Atmung, Bewusstsein, Sichtung } from "../sim/lage";
import type { PartnerGrund } from "../sim/partner";

/** Anleitungen, die der Calltaker geben kann */
export type AnleitungTyp =
  | "reanimation"
  | "fremdkoerper"
  | "seitenlage"
  | "oberkoerper_hoch"
  | "beine_hoch"
  | "druck_blutung"
  | "beruhigen"
  | "zucker"
  | "spray"
  | "geburt"
  | "nicht_bewegen"
  | "absichern"
  | "tuer";

/**
 * Notarzt-Bedarf: "nein", "immer" oder die höchste Sanitäter-Qualifikation, die noch einen NA braucht
 * (z. B. "NFS-NKV": RS bis NKV brauchen einen NA, ein NKI nicht). NKA zählt wie NFS (kein eigener Zugang).
 */
export type NaBedarf = "nein" | "immer" | "RS" | "NFS" | "NFS-NKA" | "NFS-NKV" | "NFS-NKI";

/** Was sich ändert (Patient, Lagebild, Bedarf) */
export interface FallSetze {
  bw?: Bewusstsein;
  at?: Atmung;
  sichtung?: Sichtung;
  /** neues Lagebild für die Lagemeldung */
  lage?: string;
  na?: NaBedarf;
}

/** Ereignis auf der Zeitleiste (Minuten ab dem Notruf) */
export interface FallEreignis extends FallSetze {
  nachMin: [number, number];
  art?: "verschlechterung" | "besserung";
  /** Wahrscheinlichkeit, dass es eintritt (Standard 1) */
  chance?: number;
  /** mit dieser Anleitung am Telefon gilt diese Chance */
  mitAnleitung?: { typ: AnleitungTyp; chance: number };
  /** ohne Notarzt vor Ort gilt diese Chance */
  chanceOhneNa?: number;
  /** tritt erst ein, wenn ein Notarzt vor Ort ist (z. B. Reanimationsabbruch) */
  nurMitNa?: boolean;
  /** so meldet es der Anrufer (vor dem Eintreffen) – Platzhalter wie in den Fallgeschichten */
  text?: string;
  /** danach gilt diese Variante (Lagebild, Bedarf, Krankenhaus) */
  wechselZu?: string;
}

export interface FallVariante {
  id: string;
  /** Wahrscheinlichkeit beim Entstehen (Summe aller Varianten = 1; 0 = nur über wechselZu) */
  p: number;
  /** Antworten in dieser Variante (überschreiben fest) */
  fest?: Antworten;
  /** wahrer Zustand, wenn der Anrufer ihn nicht kennt (z. B. Tür versperrt) */
  wahr?: { bw?: Bewusstsein; at?: Atmung };
  /** Sichtung beim Eintreffen */
  sichtung: Sichtung;
  /** Lagebild für die Lagemeldung, z. B. „wach, stabil, EKG unauffällig“ */
  lage: string;
  na: NaBedarf;
  /** NA vor Ort fährt mit (Standard: rot oder NA-Bedarf → ja, gelb → oft, grün → nein) */
  naBegleitet?: boolean;
  /** Verschlechterung, solange der nötige NA fehlt (ab der Lagemeldung) */
  ohneNa?: { nachMin: number } & FallSetze;
  verlauf?: FallEreignis[];
  /** Feuerwehr, Polizei … (ersetzt die Regeln aus partner.ts) */
  partner?: PartnerGrund[];
  /** Transport ins Krankenhaus (Standard ja) */
  transport?: boolean;
  /** Transportverweigerung bei Einstellung „normal“ (nur wache, stabile Patienten) */
  revers?: number;
  /** Buchung (Verdachtsdiagnose) aus klinik.json */
  buchung: string;
  /** Patient verstorben (Tod stellt der NA fest) */
  tot?: boolean;
}

export interface FallVorlage extends SzenarioVorlage {
  /** Name zum Anzeigen (Fall-Editor) */
  name?: string;
  /** wie oft: 1 selten, 2 mittel, 3 häufig, 5 sehr häufig */
  haeufigkeit: number;
  varianten: FallVariante[];
}

// ------------------------------------------------------------------ Katalog

export const FAELLE: FallVorlage[] = [
  // ---------------------------------------------------------------- 1 Fremdkörper Kleinkind
  {
    id: "fk_kleinkind",
    name: "Fremdkörper beim Kleinkind",
    thema: "ersticken",
    haeufigkeit: 1,
    alter: [1, 3],
    orte: ["wohnung", "haus"],
    stelle: ["[woran=essen] beim Essen am Tisch in der Küche", "[woran!=essen] im Wohnzimmer", "[woran!=essen] im Kinderzimmer"],
    anrufer: ["eltern"],
    geschehen: [
      "[woran=suessigkeit] {P} hat {beim Spielen|beim Fernschauen|auf dem Sofa} ein Zuckerl gelutscht und sich plötzlich daran verschluckt.",
      "[woran=essen] {P} hat beim Essen eine ganze Weintraube in den Mund gesteckt und sich verschluckt.",
      "[woran=objekt] {P} hat beim Spielen einen kleinen Legostein in den Mund gesteckt und sich verschluckt.",
      "Seitdem hustet und würgt {er} heftig, beim Einatmen pfeift es.",
      "Du hast {ihm} schon {auf den Rücken geklopft|in den Mund geschaut}, aber es ist nichts herausgekommen.",
    ],
    hergang: [
      "[woran=suessigkeit] {P} hat sich an einem Zuckerl verschluckt, {er} hustet und kriegt so schlecht Luft!",
      "[woran=essen] {P} hat sich an einer Weintraube verschluckt, {er} hustet und würgt!",
      "[woran=objekt] {P} hat einen Legostein in den Mund gesteckt und sich verschluckt, {er} hustet!",
    ],
    seitMin: [1, 2],
    fest: { woran: ["suessigkeit", "essen", "objekt"], atemweg: "teilweise", bw: "ja", at: "abnorm", anzahl_patienten: "1", lungenerkrankung: "nein" },
    details: [
      "{Er} hustet kräftig, und beim Luftholen pfeift es.",
      "{Er} kann zwischendurch schreien, dann hustet {er} wieder.",
      "Rot ist {er} im Gesicht, blau nicht.",
      "{Er} ist sonst gesund, nimmt keine Medikamente.",
    ],
    verlauf: ["Wenn man dir Rückenschläge oder Kompressionen erklärt, machst du es sofort und sagst, was passiert."],
    varianten: [
      {
        id: "A",
        p: 0.6,
        sichtung: "gelb",
        lage: "Atemweg verlegt, hustet",
        na: "nein",
        verlauf: [{ nachMin: [1.5, 2.5], art: "besserung", at: "normal", sichtung: "gruen", lage: "wach, Fremdkörper ausgehustet, Atemweg frei, Sättigung 98", text: "Es ist draußen! {Er} hat es ausgespuckt, jetzt weint {er} nur noch." }],
        revers: 0.1,
        buchung: "bu_internistischer_kindernotfall",
      },
      {
        id: "B",
        p: 0.3,
        sichtung: "gelb",
        lage: "wach, Stridor, Fremdkörper vermutlich noch in den Atemwegen, Sättigung 90",
        na: "NFS-NKV",
        naBegleitet: true,
        ohneNa: { nachMin: 15, at: "abnorm", sichtung: "rot", lage: "zunehmend erschöpft, Sättigung fällt auf 84", na: "immer" },
        buchung: "bu_starkes_nasenbluten_fremdkoerper_hno",
      },
      {
        id: "C",
        p: 0.1,
        sichtung: "rot",
        lage: "bewusstlos, Atemwege komplett verlegt",
        na: "immer",
        verlauf: [
          { nachMin: [3, 4], art: "verschlechterung", bw: "nein", at: "keine", sichtung: "rot", text: "{Er} hustet nicht mehr, {er} wird ganz blau und schlaff, bitte!" },
          {
            nachMin: [4.5, 5.5],
            art: "besserung",
            chance: 0.15,
            mitAnleitung: { typ: "fremdkoerper", chance: 0.5 },
            bw: "ja",
            at: "abnorm",
            sichtung: "gelb",
            text: "Da ist was rausgekommen! {Er} atmet wieder, {er} weint!",
            wechselZu: "B",
          },
        ],
        buchung: "bu_kritisch_krankes_kind",
      },
    ],
  },

  // ---------------------------------------------------------------- 2 Brustschmerz
  {
    id: "brustschmerz",
    name: "Brustschmerz",
    thema: "brustschmerz",
    haeufigkeit: 3,
    alter: [50, 85],
    orte: ["wohnung", "haus", "garten", "arbeit"],
    stelle: ["[ort=wohnung|haus] im Wohnzimmer", "[ort=wohnung|haus] in der Küche", "[ort=garten] im Garten auf der Bank", "[ort=arbeit] im Büro"],
    anrufer: ["partner", "selbst", "kollege", "kind"],
    geschehen: [
      "[ort=wohnung|haus] {P} ist {beim Fernsehen|beim Zeitunglesen|nach dem Essen} gesessen, da haben auf einmal Schmerzen in der Brust angefangen.",
      "[ort=garten] {P} hat sich nach der Gartenarbeit auf die Bank gesetzt, da haben auf einmal Schmerzen in der Brust angefangen.",
      "[ort=arbeit] {P} ist am Schreibtisch gesessen, da haben auf einmal Schmerzen in der Brust angefangen.",
      "[variante=0] Es sticht, vor allem beim tiefen Einatmen und wenn {er} sich dreht.",
      "[variante=0] {Er} ist seit ein paar Tagen verkühlt und hustet.",
      "[variante!=0] Es drückt wie ein Stein auf der Brust und zieht in den linken Arm und in den Kiefer.",
      "[variante!=0] {Er} ist auf einmal ganz blass geworden und schwitzt stark.",
      "{Er} hat zuerst gemeint, das geht von selbst weg – deshalb wird erst jetzt angerufen.",
    ],
    hergang: [
      "[variante=0] {P} hat seit einer halben Stunde Schmerzen in der Brust, es sticht, wenn {er} tief einatmet.",
      "[variante!=0] {P} hat seit einer halben Stunde ganz starke Schmerzen in der Brust, es drückt wie ein Stein und zieht in den linken Arm, und {er} schwitzt total.",
    ],
    hergangIch: [
      "[variante=0] Ich hab seit einer halben Stunde Schmerzen in der Brust, es sticht beim Einatmen.",
      "[variante!=0] Ich hab so starke Schmerzen in der Brust, es drückt wie ein Stein, und ich schwitz total.",
    ],
    seitMin: [20, 40],
    fest: { herz_vg: ["nein", "nein", "ja"], kokain: "nein", bw: "ja", at: "normal", sprachschw: "nein", anzahl_patienten: "1" },
    details: [
      "[variante=0] {Er} schwitzt nicht, die Farbe ist normal.",
      "[variante=0] Schlecht ist {ihm} nicht.",
      "[variante!=0] {Er} ist ganz blass und nass geschwitzt.",
      "[variante!=0] Schlecht ist {ihm} auch.",
      "Es hat in Ruhe angefangen, {er} ist einfach dagesessen.",
    ],
    vorerkrankungen: ["hoher Blutdruck", "Diabetes"],
    varianten: [
      {
        id: "0",
        p: 0.4,
        fest: { hautfarbe: "nein", kaltschweiss: "nein" },
        sichtung: "gelb",
        lage: "wach, stabil, Brustschmerz atemabhängig, EKG unauffällig",
        na: "nein",
        naBegleitet: false,
        revers: 0.05,
        buchung: "bu_acs_ohne_st_hebung_unklarer_thoraxschmer",
      },
      {
        id: "A",
        p: 0.35,
        fest: { hautfarbe: "ja", kaltschweiss: "ja" },
        sichtung: "rot",
        lage: "Brustschmerz seit 30 Minuten, kaltschweißig und blass, im EKG Hebungen",
        na: "immer",
        buchung: "bu_stemi",
      },
      {
        id: "B",
        p: 0.15,
        fest: { hautfarbe: "ja", kaltschweiss: "ja" },
        sichtung: "rot",
        lage: "Brustschmerz, kaltschweißig, im EKG Hebungen",
        na: "immer",
        verlauf: [{ nachMin: [10, 20], art: "verschlechterung", bw: "getruebt", at: "abnorm", sichtung: "rot", lage: "Blutdruck 85 zu 50, Puls 40, im EKG Hebungen", text: "{Er} wird ganz grau und ist so komisch weg, {er} redet kaum noch!" }],
        buchung: "bu_stemi",
      },
      {
        id: "C",
        p: 0.1,
        fest: { hautfarbe: "ja", kaltschweiss: "ja" },
        sichtung: "rot",
        lage: "Brustschmerz, kaltschweißig",
        na: "immer",
        verlauf: [
          { nachMin: [6, 10], art: "verschlechterung", bw: "nein", at: "agonal", sichtung: "rot", text: "{Er} ist umgefallen, {er} antwortet nicht mehr, {er} macht so komische Atemzüge!" },
          { nachMin: [11, 14], art: "besserung", chance: 0.1, mitAnleitung: { typ: "reanimation", chance: 0.4 }, bw: "nein", at: "normal", sichtung: "rot", lage: "nach Reanimation Kreislauf wieder da, bewusstlos, atmet", text: "Das Gerät hat geschockt … {er} atmet wieder!", wechselZu: "C_rosc" },
        ],
        buchung: "bu_reanimation_mit_rosc",
      },
      { id: "C_rosc", p: 0, sichtung: "rot", lage: "nach Reanimation Kreislauf wieder da, bewusstlos, atmet", na: "immer", buchung: "bu_reanimation_mit_rosc" },
    ],
  },

  // ---------------------------------------------------------------- 3 Schlaganfall
  {
    id: "insult",
    name: "Schlaganfall",
    thema: "schlaganfall",
    haeufigkeit: 3,
    alter: [60, 92],
    orte: ["wohnung", "haus", "geschaeft"],
    stelle: ["[ort=wohnung|haus] im Wohnzimmer im Sessel", "[ort=wohnung|haus] in der Küche", "[ort=geschaeft] bei der Kassa"],
    anrufer: ["kind", "partner", "verkauf"],
    geschehen: [
      "[wissen=nah] Kurz vorher war noch alles normal, da habt ihr noch geredet.",
      "[wissen=nah] Dann ist {P} auf einmal komisch geworden: {er} redet ganz verwaschen, man versteht {ihn} kaum.",
      "[wissen!=nah] {P} wollte an der Kassa zahlen, auf einmal ist {ihm} das Geldtaschl aus der Hand gefallen und {er} redet ganz verwaschen.",
      "[wissen!=nah] Wie lange {er} das schon hat, weißt du nicht – du kennst {ihn} nur vom Sehen als Kunden.",
      "Der Mund hängt auf der {rechten|linken} Seite runter, den Arm auf derselben Seite kann {er} kaum heben.",
    ],
    hergang: [
      "{P} ist auf einmal so komisch, {er} redet ganz verwaschen und der Mund hängt {rechts|links} runter!",
      "{P} ist auf einmal ganz komisch, {er} kann nicht mehr richtig reden!",
      "{P} kann den {rechten|linken} Arm nicht mehr heben und redet so komisch!",
    ],
    seitMin: [30, 60],
    fest: {
      sprachstoerung: "ja",
      schwaeche: "ja",
      laehmung: "ja",
      gleichgewicht: "nein",
      sehen: "nein",
      kopfschmerz: "nein",
      vg_schlaganfall: "nein",
      vg_tia: "nein",
      fast_gesicht: "ja",
      fast_arm: "ja",
      fast_sprache: "ja",
      seit: "unter",
      bw: "ja",
      at: "normal",
      anzahl_patienten: "1",
    },
    details: [
      "{Er} versteht, was man sagt, aber man versteht {ihn} kaum.",
      "Den {rechten|linken} Arm kann {er} nicht richtig heben.",
      "Gestürzt ist {er} nicht.",
      "Atmen tut {er} normal.",
    ],
    vorerkrankungen: ["!Vorhofflimmern", "hoher Blutdruck"],
    verlauf: ["Wenn man dich bittet, {ihn} lächeln oder die Arme heben zu lassen, machst du es und sagst, was du siehst."],
    varianten: [
      {
        id: "A",
        p: 0.9,
        sichtung: "gelb",
        lage: "wach, Halbseitenzeichen und Sprachstörung, Beginn vor einer Stunde, Zucker normal, Transport mit Sondersignal zur Stroke Unit",
        na: "nein",
        naBegleitet: false,
        buchung: "bu_schlaganfall",
      },
      {
        id: "B",
        p: 0.1,
        sichtung: "gelb",
        lage: "wach, Halbseitenzeichen und Sprachstörung",
        na: "nein",
        verlauf: [{ nachMin: [8, 15], art: "verschlechterung", bw: "getruebt", at: "abnorm", sichtung: "rot", lage: "eingetrübt, schnarchende Atmung, Halbseitenzeichen", na: "NFS-NKV", text: "Jetzt ist {er} ganz schläfrig, {er} reagiert kaum noch." }],
        buchung: "bu_schlaganfall_mit_v_a_grossen_gefaessvers",
      },
    ],
  },

  // ---------------------------------------------------------------- 4 Sturz, Hüfte
  {
    id: "sturz_huefte",
    name: "Sturz mit Hüftverletzung",
    thema: "sturz",
    haeufigkeit: 5,
    alter: [75, 95],
    geschlecht: "w",
    orte: ["wohnung"],
    stelle: ["im Bad", "am Gang vor dem Bad", "im Schlafzimmer"],
    umgebung: ["{3. Stock, das Stiegenhaus ist eng und der Lift winzig|2. Stock, enges Stiegenhaus, kein Lift}", "Tür {4|7|11}"],
    anrufer: ["nachbar", "kind", "selbst"],
    geschehen: [
      "{P} ist {auf dem Weg ins Bad|beim Aufstehen vom Sessel|beim Aufhängen der Wäsche} ausgerutscht und auf die {rechte|linke} Seite gefallen.",
      "Seitdem liegt {er} am Boden und kommt nicht mehr auf, die Hüfte tut weh.",
      "[selbst=ja] Du hast dich mit Mühe bis zum Telefon geschoben.",
      "[anrufer_typ=nachbar] Du hast {ihn} durch die Wand rufen gehört und mit dem Reserveschlüssel aufgesperrt.",
      "[anrufer_typ=kind] Du wolltest nur kurz vorbeischauen und hast {ihn} am Boden gefunden.",
      "[variante=B] {Er} zittert vor Kälte, die Lippen sind ganz trocken – getrunken hat {er} seit dem Sturz nichts.",
    ],
    hergang: ["{P} ist gestürzt, {er} liegt am Boden und kommt nicht mehr auf.", "{P} ist hingefallen und kann nicht mehr aufstehen, die Hüfte tut {ihm} so weh.", "{P} ist gestürzt und liegt am Boden, {er} kommt allein nicht mehr hoch."],
    hergangIch: ["Ich bin gestürzt und komm nicht mehr auf, die Hüfte tut so weh."],
    seitMin: [60, 150],
    fest: {
      hoehe: "boden",
      verletzt: "ja",
      region: "extremitaet",
      blutung_stark: "nein",
      fehlstellung: "ja",
      aelter6h: "nein",
      ohnmacht: "nein",
      umstand: "boden_2",
      schwer_pat: "nein",
      blutverduenner: "ja",
      bw: "ja",
      at: "normal",
      anzahl_patienten: "1",
    },
    details: [
      "Die {rechte|linke} Hüfte tut {ihm} weh, das Bein liegt so komisch nach außen gedreht.",
      "Am Kopf hat {er} sich nicht angeschlagen.",
      "{Er} redet ganz normal.",
      "{Er} friert ein bisschen und hat Durst.",
    ],
    vorerkrankungen: ["!Osteoporose", "Herzschwäche"],
    verlauf: ["[selbst=ja] Du bist alt, ein bisschen schwerhörig und sprichst langsam."],
    varianten: [
      {
        id: "A",
        p: 0.7,
        sichtung: "gelb",
        lage: "wach, Verdacht auf Schenkelhalsbruch, liegt seit zwei Stunden",
        na: "nein",
        naBegleitet: false,
        partner: [{ art: "fw", grund: "Tragehilfe, enges Stiegenhaus", blockiert: true }],
        buchung: "bu_isolierte_extremitaetenverletzung",
      },
      {
        id: "B",
        p: 0.3,
        fest: { umstand: "boden_3" },
        sichtung: "gelb",
        lage: "wach, Verdacht auf Schenkelhalsbruch, ausgekühlt und ausgetrocknet",
        na: "nein",
        naBegleitet: false,
        partner: [{ art: "fw", grund: "Tragehilfe, enges Stiegenhaus", blockiert: true }],
        buchung: "bu_isolierte_extremitaetenverletzung",
      },
    ],
  },

  // ---------------------------------------------------------------- 5 Kreislaufstillstand
  {
    id: "kreislaufstillstand",
    name: "Kreislaufstillstand",
    thema: "stillstand",
    haeufigkeit: 1,
    alter: [45, 85],
    geschlecht: "m",
    orte: ["geschaeft", "wohnung", "sport"],
    stelle: ["[ort=geschaeft] an der Kassa", "[ort=wohnung] im Wohnzimmer", "[ort=sport] am Spielfeldrand"],
    anrufer: ["passant", "verkauf", "partner", "trainer"],
    geschehen: [
      "[ort=geschaeft] {P} ist an der Kassa gestanden und auf einmal zusammengesackt.",
      "[ort=wohnung] {P} ist {beim Fernsehen|nach dem Abendessen} auf einmal vom Sessel gekippt.",
      "[ort=sport] {P} ist {beim Zuschauen|nach dem Spiel|beim Reden mit den anderen} am Spielfeldrand einfach umgefallen.",
      "Vorher hat {er} nichts gesagt, {er} ist einfach umgefallen.",
      "Seitdem reagiert {er} nicht mehr, auch nicht aufs Rütteln.",
    ],
    hergang: ["Da ist ein Mann umgefallen, {er} rührt sich nicht!", "{P} ist umgefallen, {er} reagiert nicht mehr!"],
    seitMin: [1, 2],
    fest: { tod: "nein", ursache_9: "keine", beobachtet: "ja", bw: "nein", at: "agonal", anzahl_patienten: "1" },
    details: [
      "{Er} reagiert gar nicht, auch nicht aufs Schütteln.",
      "{Er} macht so komische Geräusche, so ein Schnarchen, ganz selten.",
      "{Er} wird ganz grau im Gesicht.",
      "[ort=geschaeft|sport] Da hängt so ein Gerät an der Wand, mit einem Herz drauf (sagst du nur, wenn nach einem Defi gefragt wird).",
      "[ort=wohnung] Einen Defi habt ihr daheim keinen.",
      "[ort=sport] Am Kopf blutet {er} ein bisschen vom Hinfallen.",
    ],
    verlauf: ["Du willst helfen. Wenn man dir die Herzdruckmassage erklärt, machst du sie und zählst laut mit."],
    varianten: [
      {
        id: "rea",
        p: 1,
        sichtung: "rot",
        lage: "Kreislaufstillstand, Reanimation läuft",
        na: "immer",
        verlauf: [
          { nachMin: [3.5, 5], art: "besserung", chance: 0.05, mitAnleitung: { typ: "reanimation", chance: 0.35 }, bw: "nein", at: "normal", sichtung: "rot", text: "Moment … {er} hustet … {er} atmet wieder! Richtig atmen tut {er}, aber wach ist {er} nicht!", wechselZu: "rosc" },
          { nachMin: [22, 30], art: "besserung", chance: 0.3, chanceOhneNa: 0.15, bw: "nein", at: "normal", sichtung: "rot", lage: "nach Reanimation Kreislauf wieder da, bewusstlos, beatmet", wechselZu: "rosc" },
          { nachMin: [32, 42], art: "verschlechterung", nurMitNa: true, at: "keine", bw: "nein", sichtung: "rot", lage: "Reanimation erfolglos beendet, Patient verstorben", wechselZu: "tot" },
        ],
        buchung: "bu_laufende_reanimation_ecpr",
      },
      { id: "rosc", p: 0, sichtung: "rot", lage: "nach Reanimation Kreislauf wieder da, bewusstlos, atmet", na: "immer", naBegleitet: true, buchung: "bu_reanimation_mit_rosc" },
      {
        id: "tot",
        p: 0,
        sichtung: "rot",
        lage: "Reanimation erfolglos beendet, Patient verstorben, Todesfeststellung durch den Notarzt",
        na: "immer",
        naBegleitet: false,
        transport: false,
        tot: true,
        partner: [{ art: "pol", grund: "unklare Todesursache" }],
        buchung: "bu_laufende_reanimation_ecpr",
      },
    ],
  },

  // ---------------------------------------------------------------- 6 Verkehrsunfall, eingeklemmt
  {
    id: "vu_eingeklemmt",
    name: "Verkehrsunfall, eingeklemmt",
    thema: "verkehrsunfall",
    haeufigkeit: 2,
    alter: [18, 60],
    geschlecht: "m",
    orte: ["strasse"],
    stelle: ["auf der Landstraße nach dem Ortsende, bei einer Kurve"],
    wo: ["auf der Landstraße kurz nach {ort}, bei einer Kurve"],
    anrufer: ["lenker", "passant"],
    geschehen: [
      "[anrufer_typ=lenker] Das Auto vor dir ist in der Kurve von der Straße abgekommen und frontal gegen einen Baum gefahren.",
      "[anrufer_typ!=lenker] Du hast einen lauten Krach gehört und bist hingelaufen: ein Auto steht frontal an einem Baum.",
      "Der Fahrer sitzt noch drin, die Fahrertür klemmt und geht nicht auf.",
      "Es ist nur das eine Auto, und nur der Fahrer ist drin.",
    ],
    hergang: ["Da ist ein Auto gegen einen Baum gefahren, der Fahrer sitzt noch drin, die Tür geht nicht auf!", "Ein Unfall! Ein Auto ist gegen einen Baum, der Mann kommt nicht raus!", "Da hat's grad gekracht, ein Auto ist frontal an einem Baum, der Fahrer steckt fest!"],
    seitMin: [2, 5],
    fest: {
      verletzte: "ja",
      grossunfall: "nein",
      mechanismus: "nein",
      hohe_geschw: "ja",
      gefahrgut: "nein",
      eingeklemmt: "ja",
      blutung_stark: "nein",
      andere_gefahren: "nein",
      gering: "nein",
      anrufer_selbst: "nein",
      anzahl: "1",
      anzahl_patienten: "1",
      bw: "ja",
      at: "abnorm",
    },
    details: [
      "Nur das eine Auto, nur er drin.",
      "Er stöhnt und fragt immer wieder, was passiert ist – dazwischen schnappt er nach Luft.",
      "Er atmet schnell und sagt, es tut weh beim Luftholen.",
      "Seine Beine stecken im Fußraum fest.",
      "Am Kopf hat er eine kleine Platzwunde, die blutet ein bisschen.",
      "Vorne dampft es raus, brennen tut nichts.",
      "Das Auto steht halb auf der Straße, es ist ziemlich dunkel.",
      "Der Airbag ist aufgegangen, angeschnallt war er.",
    ],
    verlauf: ["Wenn man dir sagt, du sollst die Stelle absichern, machst du das."],
    varianten: [
      {
        id: "A",
        p: 0.65,
        sichtung: "rot",
        lage: "Pkw gegen Baum, eine Person eingeklemmt, wach, Thoraxtrauma und Beinverletzung",
        na: "NFS",
        naBegleitet: true,
        partner: [
          { art: "fw", grund: "Person eingeklemmt", blockiert: true },
          { art: "pol", grund: "Unfallaufnahme und Absicherung" },
        ],
        buchung: "bu_schweres_thoraxtrauma",
      },
      {
        id: "B",
        p: 0.35,
        sichtung: "rot",
        lage: "Pkw gegen Baum, eine Person eingeklemmt, wach, Thoraxtrauma",
        na: "NFS",
        verlauf: [{ nachMin: [8, 12], art: "verschlechterung", bw: "getruebt", at: "abnorm", sichtung: "rot", lage: "eingeklemmt, eingetrübt, Schockzeichen, Blutdruck 85 zu 55, Puls 130", na: "immer", text: "Er redet nicht mehr mit mir, er ist so weggetreten." }],
        partner: [
          { art: "fw", grund: "Person eingeklemmt", blockiert: true },
          { art: "pol", grund: "Unfallaufnahme und Absicherung" },
        ],
        buchung: "bu_polytrauma",
      },
    ],
  },

  // ---------------------------------------------------------------- 7 Unterzucker
  {
    id: "hypoglykaemie",
    name: "Unterzucker",
    thema: "zucker",
    haeufigkeit: 2,
    alter: [25, 80],
    orte: ["wohnung", "haus", "arbeit"],
    stelle: ["[ort=wohnung|haus] im Wohnzimmer", "[ort=wohnung|haus] in der Küche", "[ort=arbeit] im Büro"],
    anrufer: ["partner", "kollege"],
    geschehen: [
      "[wissen=nah|bekannt] {P} ist zuckerkrank und spritzt Insulin.",
      "[anrufer_typ=partner] {Er} war am Nachmittag Rad fahren und hat danach kaum was gegessen.",
      "[anrufer_typ=kollege] {Er} hat heute das Mittagessen ausgelassen, weil so viel los war.",
      "Vor ein paar Minuten ist {er} komisch geworden: verwirrt, verschwitzt und zittrig.",
    ],
    hergang: ["{P} ist Diabetiker, {er} ist total verwirrt und schwitzt, ich glaub, {er} ist unterzuckert.", "{P} ist auf einmal ganz komisch, total durcheinander und klatschnass geschwitzt – {er} hat Zucker.", "{P} redet auf einmal wirres Zeug und schwitzt so, {er} ist zuckerkrank."],
    seitMin: [5, 20],
    fest: { verhalten: "ja", gewalttaetig: "nein", diabetiker: "ja", bw: "getruebt", at: "normal", anzahl_patienten: "1" },
    extra: { kaltschweiss: "ja", hautfarbe: "ja" },
    details: [
      "{Er} redet wirres Zeug und weiß nicht, wo {er} ist.",
      "{Er} ist klatschnass geschwitzt und zittert.",
      "[anrufer_typ=partner] Du hast gemessen, 38 steht auf dem Gerät.",
      "[anrufer_typ=kollege] {Er} hat ein Messgerät in der Tasche, aber du weißt nicht, wie das geht.",
      "Du hast {ihm} Saft hingestellt, aber von selbst trinkt {er} nichts – hält man {ihm} das Glas hin, nimmt {er} vielleicht ein paar Schlucke.",
      "[anrufer_typ=partner] Ihr habt so ein Notfallset, aber du weißt nicht, wie das geht.",
    ],
    vorerkrankungen: ["!Diabetes, spritzt Insulin"],
    verlauf: ["Wenn man dir sagt, du sollst Zucker oder Saft geben, versuchst du es."],
    varianten: [
      {
        id: "A",
        p: 0.75,
        sichtung: "gelb",
        lage: "Hypoglykämie, Blutzucker 36, verwirrt",
        na: "NFS-NKA",
        verlauf: [
          { nachMin: [6, 12], art: "besserung", chance: 0, mitAnleitung: { typ: "zucker", chance: 0.4 }, bw: "ja", sichtung: "gruen", lage: "nach Zucker zum Trinken wieder wach und orientiert, Blutzucker 90", na: "nein", text: "Jetzt hat {er} Saft getrunken, {er} wird wieder normal!" },
        ],
        revers: 0.15,
        buchung: "bu_blutzuckerentgleisung",
      },
      {
        id: "B",
        p: 0.25,
        sichtung: "gelb",
        lage: "Hypoglykämie, verwirrt",
        na: "NFS-NKA",
        verlauf: [{ nachMin: [5, 10], art: "verschlechterung", bw: "nein", sichtung: "rot", lage: "bewusstlos, krampft, Blutzucker 28", text: "{Er} reagiert gar nicht mehr, und jetzt zuckt {er}!" }],
        buchung: "bu_blutzuckerentgleisung",
      },
    ],
  },

  // ---------------------------------------------------------------- 8 Asthma
  {
    id: "asthma",
    name: "Asthmaanfall",
    thema: "atemnot",
    haeufigkeit: 2,
    alter: [12, 25],
    orte: ["wohnung", "schule", "sport"],
    stelle: ["[ort=wohnung] im Kinderzimmer", "[ort=wohnung] im Wohnzimmer", "[ort=schule] im Klassenzimmer", "[ort=schule] am Gang vor dem Turnsaal", "[ort=sport] in der Garderobe", "[ort=sport] am Spielfeldrand"],
    anrufer: ["selbst", "eltern", "lehrer", "begleiter"],
    geschehen: [
      "{P} hat seit der Kindheit Asthma.",
      "[ort=schule] Es hat im Turnunterricht angefangen.",
      "[ort=sport] Es hat beim Training angefangen.",
      "[ort=wohnung] Es hat am Abend angefangen, {er} ist seit ein paar Tagen verkühlt.",
      "{Er} hat in den letzten 20 Minuten mehrmals das Spray genommen, aber es hilft kaum.",
      "Es wird nicht besser, {er} kriegt immer schlechter Luft.",
    ],
    hergang: ["{P} kriegt keine Luft, {er} hat Asthma und das Spray hilft nicht!", "{P} hat einen Asthmaanfall, es wird immer schlimmer!", "{P} kriegt ganz schlecht Luft, das Spray hat nichts gebracht!"],
    hergangIch: ["Ich … krieg keine Luft … Asthma … das Spray hilft nicht."],
    seitMin: [15, 30],
    fest: { lungenerkrankung: "asthma", tracheostoma: "nein", sprachschw: "ja", hautfarbe: "nein", kaltschweiss: "nein", bw: "ja", at: "abnorm", anzahl_patienten: "1" },
    details: [
      "{Er} hat seitdem schon ein paar Mal das Spray genommen, hilft kaum.",
      "[wissen=nah] {Er} ist verkühlt und war gestern bei jemandem mit Katze.",
      "Es pfeift beim Atmen, {er} kann nur zwei, drei Wörter am Stück sagen.",
      "Asthma hat {er} seit der Kindheit.",
    ],
    verlauf: ["[selbst=ja] Du kannst nur in kurzen Satzfetzen sprechen, mit Pausen zum Luftholen."],
    varianten: [
      {
        id: "A",
        p: 0.75,
        sichtung: "gelb",
        lage: "schwerer Asthmaanfall, Sättigung 89, Spray ohne Wirkung",
        na: "RS",
        ohneNa: { nachMin: 15, sichtung: "rot", lage: "zunehmend erschöpft, Sättigung 84", na: "immer" },
        buchung: "bu_pneumonie_atemnot_copd",
      },
      {
        id: "B",
        p: 0.25,
        sichtung: "gelb",
        lage: "schwerer Asthmaanfall, Sättigung 88",
        na: "RS",
        verlauf: [{ nachMin: [6, 10], art: "verschlechterung", mitAnleitung: { typ: "oberkoerper_hoch", chance: 0.7 }, bw: "getruebt", sichtung: "rot", lage: "erschöpft, kaum Atemgeräusch, Sättigung 82", na: "immer", text: "(nur noch Keuchen und Pfeifen am Telefon)" }],
        buchung: "bu_pneumonie_atemnot_copd",
      },
    ],
  },

  // ---------------------------------------------------------------- 9 Geburt
  {
    id: "geburt",
    name: "Geburt",
    thema: "schwangerschaft",
    haeufigkeit: 1,
    alter: [22, 40],
    geschlecht: "w",
    orte: ["wohnung", "haus"],
    stelle: ["im Schlafzimmer", "im Wohnzimmer", "im Bad"],
    anrufer: ["partner", "selbst"],
    geschehen: [
      "Es ist das zweite Kind, der Termin wäre nächste Woche.",
      "Die Wehen kommen jetzt alle zwei Minuten und sind sehr stark.",
      "Die Fruchtblase ist vorhin geplatzt, das Fruchtwasser war klar.",
      "Ihr wolltet gerade ins Spital fahren, aber sie sagt, sie muss schon pressen.",
    ],
    hergang: ["{P} kriegt das Baby, die Wehen kommen ganz schnell, wir schaffen es nicht mehr ins Spital!", "Das Baby kommt! Die Wehen sind schon ganz knapp hintereinander!", "{P} hat Wehen, alle paar Minuten, und die Fruchtblase ist geplatzt!"],
    hergangIch: ["Ich krieg das Baby, die Wehen kommen alle zwei Minuten, ich schaff es nicht mehr ins Spital!"],
    seitMin: [30, 60],
    fest: { ssw: 39, mehrlinge: "nein", situation: "unmittelbar", kompl_baby: "nein", kompl_mutter: "nein", blutung_stark: "nein", komplikationen: "nein", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "Beim ersten Kind ist es auch schnell gegangen.",
      "Ein bisschen Blut, nicht viel.",
      "Bei den Kontrollen war alles normal.",
    ],
    verlauf: ["Wenn man dir die Geburt erklärt, machst du mit."],
    varianten: [
      {
        id: "A",
        p: 0.75,
        sichtung: "gelb",
        lage: "Geburt läuft",
        na: "nein",
        naBegleitet: false,
        verlauf: [{ nachMin: [4, 6], lage: "Geburt vor Eintreffen, Kind wohlauf, Mutter stabil, Nachgeburt ausständig", text: "Da ist der Kopf! … Es ist da, es schreit!" }],
        buchung: "bu_geburt_wehen",
      },
      { id: "B", p: 0.15, sichtung: "gelb", lage: "Geburt läuft, Kopf sichtbar", na: "RS", buchung: "bu_geburt_wehen" },
      {
        id: "C",
        p: 0.1,
        sichtung: "gelb",
        lage: "Geburt läuft",
        na: "nein",
        verlauf: [
          { nachMin: [4, 6], art: "verschlechterung", sichtung: "rot", lage: "Kind geboren, Neugeborenes schlaff, atmet nicht ausreichend", na: "immer", text: "Es ist da … es schreit nicht, es ist ganz schlaff, bewegt sich nicht und ist ganz bläulich-blass!" },
          { nachMin: [8, 10], art: "besserung", chance: 0.3, mitAnleitung: { typ: "geburt", chance: 0.5 }, sichtung: "gelb", lage: "Neugeborenes nach Abtrocknen und Wärmen rosig, schreit", text: "Jetzt schreit es!", wechselZu: "A" },
        ],
        buchung: "bu_kritisch_krankes_neugeborenes",
      },
    ],
  },

  // ---------------------------------------------------------------- 10 Psychische Krise
  {
    id: "psych_eingesperrt",
    name: "Psychische Krise, eingesperrt",
    thema: "psych",
    haeufigkeit: 2,
    alter: [20, 60],
    orte: ["wohnung"],
    stelle: ["vor {seiner} Wohnungstür"],
    umgebung: ["{1.|2.|3.} Stock", "die Haustür unten war offen, du stehst schon oben vor {seiner} Wohnungstür"],
    anrufer: ["begleiter", "nachbar"],
    ohneSicht: true,
    geschehen: [
      "[anrufer_typ=begleiter] Vorhin hat {er} dir geschrieben, dass es {ihm} leid tut und {er} nicht mehr kann.",
      "[anrufer_typ=nachbar] Eine Freundin von {ihm} hat dich angerufen und gebeten nachzuschauen – {er} hat ihr geschrieben, dass {er} nicht mehr will. Du wohnst nebenan.",
      "Seitdem hebt {er} nicht mehr ab.",
      "Du stehst vor {seiner} Wohnungstür, {er} macht nicht auf. Drinnen läuft der Fernseher.",
    ],
    hergang: [
      "[anrufer_typ=begleiter] {P} hat mir geschrieben, dass {er} nicht mehr will. {Er} macht nicht auf, ich steh vor {seiner} Tür.",
      "[anrufer_typ=begleiter] Ich mach mir große Sorgen, {P} hat geschrieben, dass {er} nicht mehr kann, und jetzt macht {er} nicht auf.",
      "[anrufer_typ=nachbar] {P} hat einer Freundin geschrieben, dass {er} nicht mehr will – und jetzt macht {er} nicht auf.",
      "[anrufer_typ=nachbar] {P} hat angekündigt, dass {er} sich was antut. Ich steh vor {seiner} Tür, {er} macht nicht auf.",
    ],
    seitMin: [20, 40],
    fest: { ubg: "dringend", lage: "absicht", substanzen: "unbekannt", verwirrt: "nein", ploetzlich: "nein", psych_vorerkrankung: "ja", blutung: "unbekannt", gewalt: "nein", waffen: "nein", selbstverbrennung: "nein", krisenteam: "nein", bw: "unbekannt", at: "unbekannt", anzahl_patienten: "1" },
    details: [
      "Waffen hat {er} keine, soweit du weißt.",
      "[wissen=bekannt] {Er} hat Depressionen, ist in Behandlung, und vor zwei Wochen hat sich {sein} Partner getrennt.",
      "Vor drei Jahren war schon einmal so was.",
      "{Er} trinkt in letzter Zeit viel.",
      "Einen Schlüssel hab ich nicht.",
      "Durch die Tür hörst du nur den Fernseher, sonst nichts.",
      "Ob die Polizei schon Bescheid weiß, weißt du nicht – du hast nur die Rettung angerufen.",
    ],
    vorerkrankungen: ["!Depressionen"],
    verlauf: ["Du siehst {ihn} nicht – was du nicht siehst, weißt du nicht. Du bist sehr besorgt."],
    varianten: [
      {
        id: "A",
        p: 0.525,
        wahr: { bw: "ja", at: "normal" },
        sichtung: "gelb",
        lage: "wach, unverletzt, alkoholisiert, akute Suizidalität, fährt freiwillig mit in die Psychiatrie",
        na: "nein",
        naBegleitet: false,
        partner: [{ art: "pol", grund: "Türöffnung und Eigenschutz", blockiert: true, eigenschutz: true }],
        buchung: "bu_psychische_krise_suizidalitaet",
      },
      {
        id: "A2",
        p: 0.225,
        wahr: { bw: "ja", at: "normal" },
        sichtung: "gelb",
        lage: "wach, unverletzt, alkoholisiert, akute Suizidalität, will nicht mit, Unterbringung mit Polizeibegleitung",
        na: "nein",
        naBegleitet: false,
        partner: [{ art: "pol", grund: "Türöffnung, Eigenschutz und Unterbringung", blockiert: true, eigenschutz: true, begleitung: true }],
        buchung: "bu_psychische_krise_suizidalitaet",
      },
      {
        id: "B",
        p: 0.25,
        wahr: { bw: "getruebt", at: "abnorm" },
        sichtung: "rot",
        lage: "nach Türöffnung Patient eingetrübt, Ursache unklar, Verdacht auf Vergiftung",
        na: "immer",
        partner: [{ art: "pol", grund: "Türöffnung", blockiert: true }],
        buchung: "bu_intoxikation",
      },
    ],
  },

  // ---------------------------------------------------------------- 11 Kollaps – klingt bewusstlos
  {
    id: "kollaps",
    name: "Kollaps",
    thema: "bewusstlos",
    haeufigkeit: 5,
    alter: [16, 85],
    orte: ["geschaeft", "freizeit", "strasse", "arzt"],
    stelle: ["[ort=freizeit] in der Kirche", "[ort=geschaeft] an der Kassa", "[ort=strasse] an der Bushaltestelle", "[ort=arzt] im Wartezimmer"],
    anrufer: ["passant", "verkauf", "eltern", "partner"],
    geschehen: [
      "[ort=freizeit] {P} ist in der Messe nach langem Stehen auf einmal ganz blass geworden und zusammengesackt.",
      "[ort=geschaeft] {P} hat an der Kassa gewartet, ist auf einmal ganz blass geworden und zusammengesackt.",
      "[ort=strasse] {P} hat auf den Bus gewartet, ist auf einmal ganz blass geworden und zusammengesackt.",
      "[ort=arzt] {P} ist im Wartezimmer aufgestanden, auf einmal ganz blass geworden und zusammengesackt.",
      "[wissen=fremd] Du hast gesehen, wie {er} umgefallen ist – {er} ist eher hingerutscht als hingefallen.",
      "Jetzt liegt {er} am Boden und reagiert nicht, aber {er} atmet.",
    ],
    hergang: ["{P} ist umgefallen, {er} ist bewusstlos!", "Da ist grad jemand zusammengebrochen, {er} reagiert nicht!", "{P} ist einfach umgekippt und rührt sich nicht!"],
    seitMin: [1, 2],
    fest: { hautfarbe: "ja", herzleiden: "nein", bauchschmerz: "nein", bw: "nein", at: "normal", anzahl_patienten: "1" },
    details: [
      "Atmen tut {er} normal.",
      "{Er} ist ganz blass.",
      "Gekrampft hat {er} nicht.",
      "Verletzt hat {er} sich nicht, {er} ist eher hingerutscht.",
      "{Er} hat heute noch nichts gegessen, sagt {er}.",
    ],
    verlauf: ["Du bist am Anfang sehr aufgeregt, wirst ruhiger, sobald {er} wieder zu sich kommt."],
    varianten: [
      {
        id: "A",
        p: 0.95,
        sichtung: "gelb",
        lage: "Patient bewusstlos",
        na: "nein",
        verlauf: [{ nachMin: [0.5, 1.5], art: "besserung", bw: "ja", sichtung: "gruen", lage: "wach und orientiert, Kreislaufkollaps, Vitalwerte unauffällig", text: "Jetzt macht {er} die Augen auf … {er} redet!" }],
        naBegleitet: false,
        revers: 0.15,
        buchung: "bu_exsikkose_synkope_az_verschlechterung",
      },
      {
        id: "R",
        p: 0.05,
        sichtung: "gelb",
        lage: "Patient bewusstlos",
        na: "nein",
        verlauf: [{ nachMin: [0.5, 1.5], art: "besserung", bw: "ja", sichtung: "gelb", lage: "wach, nach Synkope im EKG Rhythmusstörung", na: "immer", text: "Jetzt macht {er} die Augen auf … {er} redet!" }],
        buchung: "bu_instabile_rhythmusstoerung",
      },
    ],
  },

  // ---------------------------------------------------------------- 12 Hyperventilation
  {
    id: "hyperventilation",
    name: "Hyperventilation",
    thema: "atemnot",
    haeufigkeit: 3,
    alter: [15, 40],
    geschlecht: "w",
    orte: ["wohnung", "schule", "arbeit", "lokal"],
    stelle: ["[ort=wohnung] im Wohnzimmer", "[ort=schule] am Gang", "[ort=arbeit] im Pausenraum", "[ort=lokal] vor dem Lokal"],
    anrufer: ["begleiter", "eltern", "lehrer", "kollege"],
    geschehen: [
      "[ort=wohnung] {P} hat sich am Telefon heftig mit jemandem gestritten.",
      "[ort=schule] Nach einer Prüfung hat {er} zu weinen angefangen.",
      "[ort=arbeit] Nach einem Streit mit dem Chef ist {er} rausgelaufen.",
      "[ort=lokal] Beim Fortgehen hat es einen Streit gegeben, {er} ist rausgegangen.",
      "Danach hat {er} angefangen, ganz schnell zu atmen, und sagt, {er} kriegt keine Luft.",
      "Jetzt sind die Hände verkrampft, und um den Mund kribbelt es.",
    ],
    hergang: ["{P} kriegt keine Luft mehr, die Hände sind ganz verkrampft, bitte schnell!", "{P} atmet ganz schnell und sagt, {er} erstickt, die Finger sind ganz verkrampft!", "{P} hyperventiliert, {er} kriegt sich gar nicht mehr ein!"],
    seitMin: [5, 15],
    fest: { lungenerkrankung: "nein", tracheostoma: "nein", sprachschw: "nein", hautfarbe: "nein", kaltschweiss: "nein", bw: "ja", at: "abnorm", anzahl_patienten: "1" },
    details: [
      "{Er} atmet total schnell und sagt, {er} stirbt.",
      "Die Hände sind so verkrampft, und es kribbelt im Gesicht.",
      "Rot im Gesicht, nicht blau.",
      "[wissen=nah|bekannt] Das hatte {er} schon einmal, Asthma hat {er} keins.",
    ],
    verlauf: ["Wenn man dir sagt, du sollst {ihn} beruhigen und mit {ihm} langsam atmen, machst du es."],
    varianten: [
      {
        id: "A",
        p: 0.98,
        sichtung: "gruen",
        lage: "Hyperventilation, wach, Sättigung 100",
        na: "nein",
        naBegleitet: false,
        verlauf: [{ nachMin: [3, 6], art: "besserung", chance: 0.2, mitAnleitung: { typ: "beruhigen", chance: 0.5 }, at: "normal", sichtung: "gruen", lage: "beruhigt, Atmung normal, alle Werte unauffällig", text: "Es wird besser, {er} atmet langsamer." }],
        revers: 0.15,
        buchung: "bu_hausaerztlich",
      },
      { id: "LE", p: 0.02, sichtung: "rot", lage: "Atemnot, Sättigung 86, Verdacht auf Lungenembolie", na: "immer", buchung: "bu_lungenembolie" },
    ],
  },

  // ---------------------------------------------------------------- 13 Person auf Parkbank
  {
    id: "parkbank",
    name: "Person auf der Parkbank",
    thema: "bewusstlos",
    haeufigkeit: 3,
    alter: [25, 65],
    geschlecht: "m",
    orte: ["bahnhof", "strasse"],
    stelle: ["auf der Bank beim Bahnhof", "an der Bushaltestelle", "auf einer Parkbank"],
    anrufer: ["passant", "verkauf"],
    gefunden: true,
    geschehen: [
      "Du bist {mit dem Hund|auf dem Heimweg von der Arbeit|vom Zug kommend} vorbeigegangen und hast {ihn} auf der Bank liegen gesehen.",
      "Du hast {ihn} angesprochen, {er} brummt nur und macht kurz die Augen auf.",
      "[variante!=D] Neben {ihm} stehen ein paar leere Bierdosen, es riecht nach Alkohol.",
      "[variante=D] Neben {ihm} liegt eine Tasche, Alkohol siehst du keinen.",
      "Wie {er} heißt, weißt du nicht – {er} sagt nichts Verständliches.",
      "[variante=C] Wie du {ihn} angestupst hast, hat {er} nach dir geschlagen und geschimpft.",
    ],
    hergang: [
      "[variante!=D] Da liegt ein Mann auf der Bank, der brummt nur, wenn ich ihn anred – ich glaub, der ist betrunken.",
      "[variante!=C,variante!=D] Auf einer Bank liegt ein Mann, ganz benommen, neben ihm lauter Bierdosen.",
      "[variante=C] Da liegt einer auf der Bank, total betrunken, und wie ich ihn angestupst hab, hat er nach mir geschlagen.",
      "[variante=D] Da liegt ein Mann auf der Bank, der ist kaum wach zu kriegen – betrunken schaut er aber nicht aus.",
    ],
    seitMin: [5, 30],
    stunden: [18, 6],
    fest: { hautfarbe: "nein", herzleiden: "unbekannt", bauchschmerz: "nein", bw: "getruebt", at: "normal", anzahl_patienten: "1" },
    details: [
      "{Er} schnarcht.",
      "Verletzt ist {er} nicht, soweit du siehst.",
    ],
    verlauf: ["Du traust dich nicht ganz hin. Wenn man dich bittet, gehst du hin und sprichst {ihn} an."],
    varianten: [
      { id: "A", p: 0.7, sichtung: "gruen", lage: "alkoholisiert, weckbar, unverletzt, Zucker normal", na: "nein", naBegleitet: false, buchung: "bu_intoxikation" },
      { id: "B", p: 0.1, sichtung: "gruen", lage: "aufgewacht, alkoholisiert, geht selbstständig weg, kein Transport", na: "nein", naBegleitet: false, transport: false, buchung: "bu_intoxikation" },
      {
        id: "C",
        p: 0.15,
        sichtung: "gruen",
        lage: "alkoholisiert und aggressiv",
        na: "nein",
        naBegleitet: false,
        partner: [{ art: "pol", grund: "Patient aggressiv", blockiert: true, eigenschutz: true }],
        buchung: "bu_intoxikation",
      },
      { id: "D", p: 0.05, sichtung: "gelb", lage: "eingetrübt, Blutzucker 35, kein Alkohol", na: "NFS-NKA", buchung: "bu_blutzuckerentgleisung" },
    ],
  },

  // ---------------------------------------------------------------- 14 Schnittwunde
  {
    id: "schnittwunde",
    name: "Schnittwunde",
    thema: "blutung",
    haeufigkeit: 3,
    alter: [15, 85],
    orte: ["wohnung", "haus", "garten"],
    stelle: ["[ort=wohnung|haus] in der Küche", "[ort=garten] im Garten"],
    anrufer: ["selbst", "partner"],
    geschehen: [
      "[ort=wohnung|haus] {P} hat sich beim Gemüseschneiden mit dem Küchenmesser in den Zeigefinger geschnitten.",
      "[ort=garten] {P} hat sich beim Heckenschneiden mit der Gartenschere in den Finger geschnitten.",
      "[variante!=C] Seitdem wird mit einem Tuch draufgedrückt. Solange man drückt, geht es – aber sobald man loslässt, blutet es wieder.",
      "[variante=C] Seitdem wird mit einem Tuch draufgedrückt, aber es blutet durch das Tuch durch.",
    ],
    hergang: ["{P} hat sich in den Finger geschnitten, das ist ziemlich tief und blutet immer wieder.", "{P} hat sich mit dem Messer tief in den Finger geschnitten, ich glaub, das gehört genäht.", "Ein tiefer Schnitt in den Finger – sobald man loslässt, blutet es wieder."],
    hergangIch: ["Ich hab mich in den Finger geschnitten, ziemlich tief – sobald ich loslass, blutet es wieder."],
    seitMin: [5, 15],
    fest: { ursache: "trauma", staerke: "schwach", region: "extremitaet", bluter: "nein", blutverduenner: ["ja", "nein"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "Am Zeigefinger, ziemlich tief, so zwei Zentimeter.",
      "[variante!=C] Das Tuch ist rot durchgeblutet, es tropft, wenn man loslässt.",
      "[variante!=C] Spüren tut {er} den Finger normal.",
      "[variante=C] Die Fingerspitze ist taub, und abbiegen kann {er} den Finger nicht mehr richtig.",
      "Ein bisschen flau ist {ihm}.",
    ],
    verlauf: ["[selbst=ja] Dir ist ein bisschen flau.", "[selbst=nein] Du bist ein bisschen aufgeregt, weil du kein Blut sehen kannst."],
    varianten: [
      {
        id: "A",
        p: 0.6,
        sichtung: "gruen",
        lage: "Schnittverletzung Finger, Blutung steht",
        na: "nein",
        naBegleitet: false,
        verlauf: [{ nachMin: [2, 4], art: "besserung", chance: 0.3, mitAnleitung: { typ: "druck_blutung", chance: 0.7 }, lage: "Schnittverletzung Finger, Blutung gestillt", text: "Jetzt blutet es fast nicht mehr." }],
        revers: 0.05,
        buchung: "bu_bagatellverletzung",
      },
      { id: "B", p: 0.35, sichtung: "gruen", lage: "Schnittverletzung Finger, Druckverband angelegt", na: "nein", naBegleitet: false, buchung: "bu_bagatellverletzung" },
      { id: "C", p: 0.05, fest: { staerke: "stark" }, sichtung: "gelb", lage: "tiefe Schnittverletzung, Sehnen und Gefäße betroffen, starke Blutung, abgebunden", na: "RS", buchung: "bu_isolierte_extremitaetenverletzung" },
    ],
  },

  // ---------------------------------------------------------------- 15 Pflegeheim, Fieber
  {
    id: "pflegeheim_fieber",
    name: "Pflegeheim, Fieber",
    thema: "krank",
    haeufigkeit: 5,
    alter: [78, 96],
    orte: ["pflegeheim"],
    stelle: ["im Zimmer auf Station {1|2|3}", "in {seinem} Zimmer, Zimmer {12|14|21|23}", "im Aufenthaltsraum auf der Station"],
    anrufer: ["pflege"],
    geschehen: [
      "{P} hat Fieber, heute früh {38,9|39,2|38,7}.",
      "{Seit heute Vormittag ist {er} deutlich schläfriger als sonst und trinkt kaum.|Heute ist {er} viel schwächer als sonst, {er} isst und trinkt fast nichts.|{Er} ist heute matt, schläft viel und mag nichts trinken.}",
      "{Der Hausarzt ist nicht erreichbar, deshalb rufst du an.|Der Hausarzt hat am Telefon gesagt, {er} soll ins Krankenhaus.|Die Stationsleitung hat gesagt, du sollst die Rettung rufen.}",
    ],
    hergang: [
      "{P} hat seit gestern Fieber und ist heute deutlich schläfriger.",
      "{P} hat Fieber, {er} ist heute kaum munter und trinkt nichts.",
      "Ich bräuchte die Rettung, {P} fiebert seit gestern und baut heute deutlich ab.",
    ],
    seitMin: [1500, 2000],
    fest: { sonderdiagnose: "nein", verwirrt: "nein", hauptbeschwerde: "fieber", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "{Er} ist erweckbar, aber schläfriger als sonst.",
      "Atmen tut {er} ruhig, {er} hustet nur ab und zu.",
      "[variante!=B] Blutdruck {125 zu 70|115 zu 65|135 zu 80}, Puls {98|104|92}, Sättigung {91|92|90}.",
      "[variante=B] Blutdruck {90 zu 55|85 zu 50}, Puls {118|124}, Sättigung {89|90}. Die Hände sind kalt und {er} schaut grau aus.",
      "{Er} trinkt seit gestern fast nichts.",
      "{Es gibt eine Patientenverfügung, keine Reanimation.|Eine Patientenverfügung gibt es nicht.}",
      "Arztbrief und Medikamentenliste liegen bereit.",
    ],
    vorerkrankungen: ["!beginnende Demenz", "Herzschwäche", "Diabetes"],
    verlauf: ["Du bist Pflegekraft, ruhig und sachlich, und verwendest Fachbegriffe."],
    varianten: [
      { id: "A", p: 0.85, sichtung: "gelb", lage: "Fieber 38,9, Sättigung 91, stabil", na: "nein", naBegleitet: false, buchung: "bu_pneumonie_atemnot_copd" },
      { id: "B", p: 0.15, fest: { hautfarbe: "ja", dringlichkeit: "geraete", transportart: "liegend" }, sichtung: "rot", lage: "Blutdruck 85 zu 50, Puls 120, sehr schläfrig, Verdacht auf Sepsis", na: "NFS-NKA", buchung: "bu_sepsis" },
    ],
  },

  // ---------------------------------------------------------------- 16 Hexenschuss
  {
    id: "hexenschuss",
    name: "Hexenschuss",
    thema: "ruecken",
    haeufigkeit: 3,
    alter: [30, 75],
    geschlecht: "m",
    orte: ["haus", "wohnung", "arbeit"],
    stelle: ["[ort=haus] im Keller", "[ort=wohnung] im Schlafzimmer", "[ort=arbeit] im Lager"],
    anrufer: ["selbst", "partner", "kollege"],
    geschehen: [
      "[ort=haus|wohnung] {P} hat {eine schwere Kiste|einen Getränkekisten|den vollen Wäschekorb} gehoben, da hat es im Kreuz reingeschossen.",
      "[ort=arbeit] {P} hat beim Umräumen eine schwere Schachtel gehoben, da hat es im Kreuz reingeschossen.",
      "Seitdem liegt {er} am Boden und traut sich nicht mehr bewegen, jede Bewegung tut höllisch weh.",
      "Gestürzt ist {er} nicht, {er} hat sich selbst hingelegt.",
    ],
    hergang: ["{P} liegt am Boden und kann sich nicht mehr bewegen, der Rücken!", "{P} hat sich verhoben, {er} kommt vor Schmerzen nicht mehr hoch!", "Es hat {ihm} im Kreuz reingeschossen, {er} kann sich nicht mehr rühren."],
    hergangIch: ["Ich lieg am Boden, ich kann mich nicht mehr bewegen, der Rücken … bitte kommen Sie!"],
    seitMin: [10, 30],
    fest: { ursache: "nein", zerreiss: "nein", aneurysma: "nein", ohnmacht: "nein", grau: "nein", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "Die Beine kann {er} bewegen.",
      "Die Beine spürt {er} normal.",
      "Vor zwei Jahren hatte {er} das auch schon.",
    ],
    verlauf: ["[selbst=ja] Du stöhnst und klingst dramatisch, bist aber klar im Kopf."],
    varianten: [
      { id: "A", p: 0.97, sichtung: "gruen", lage: "akuter Rückenschmerz nach Heben, Neurologie unauffällig", na: "nein", naBegleitet: false, revers: 0.12, buchung: "bu_isolierte_extremitaetenverletzung" },
      { id: "C", p: 0.03, sichtung: "rot", lage: "blass, Blutdruck 90 zu 60, Schmerz in Bauch und Rücken", na: "immer", buchung: "bu_rupturiertes_bauchaortenaneurysma" },
    ],
  },
  // ================================================================ Fälle an bestimmten Orten (POIs)
  // „kategorien“: spielt nur an solchen Orten (Freibad ≠ Badesee, Bahnhof ≠ Bushaltestelle) – fehlt so ein Ort im Gebiet, kommt der Fall nicht.

  // ---------------------------------------------------------------- Freibad: Kopfsprung ins Seichte
  {
    id: "freibad_kopfsprung",
    name: "Kopfsprung ins seichte Becken (Freibad)",
    thema: "wasser",
    haeufigkeit: 1,
    alter: [13, 30],
    geschlecht: "m",
    orte: ["wasser"],
    kategorien: ["freibad", "hallenbad"],
    stelle: ["beim Nichtschwimmerbecken", "am Beckenrand beim Schwimmerbecken"],
    anrufer: ["bademeister", "begleiter"],
    geschehen: [
      "{P} ist vom Beckenrand mit dem Kopf voraus ins Nichtschwimmerbecken gesprungen – dort ist es nur etwa einen Meter tief.",
      "{Er} ist mit dem Kopf am Boden angeschlagen und ist kurz reglos im Wasser getrieben.",
      "Der Bademeister hat {ihn} sofort herausgeholt und am Beckenrand flach hingelegt.",
      "[variante=A] {Er} ist wach, hat Schmerzen im Nacken, kann aber Arme und Beine bewegen.",
      "[variante=B] {Er} ist wach, sagt aber, {er} spürt die Beine nicht richtig und die Finger kribbeln.",
    ],
    hergang: ["Ein Bursch ist ins seichte Becken gesprungen und mit dem Kopf am Boden aufgeschlagen!", "Da ist einer kopfüber ins Nichtschwimmerbecken gesprungen, jetzt hat er Schmerzen im Genick!"],
    seitMin: [2, 6],
    jahreszeit: ["sommer"],
    fest: { art: "kopfsprung", wo: "land", ueber6h: "nein", reanimiert: "nein", deko: "nein", hws: "ja", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Wir haben {ihn} nicht mehr bewegt, {er} liegt am Rücken.", "Eine Schramme an der Stirn hat {er}, die blutet ein bisschen.", "Getrunken hat {er} nichts, sagen die Freunde."],
    verlauf: ["Du bist ruhig und routiniert, hältst den Kopf ruhig, wenn man dich darum bittet."],
    varianten: [
      { id: "A", p: 0.75, sichtung: "gelb", lage: "Nackenschmerz nach Kopfsprung, Neurologie unauffällig, HWS immobilisiert", na: "nein", buchung: "bu_isolierte_extremitaetenverletzung" },
      { id: "B", p: 0.25, sichtung: "rot", lage: "Verdacht auf Halswirbelsäulenverletzung mit Gefühlsstörung an Beinen und Händen", na: "immer", buchung: "bu_wirbelsaeulenverletzung_mit_neurologisch" },
    ],
  },

  // ---------------------------------------------------------------- Badesee/Donau: Person untergegangen (offenes Gewässer)
  {
    id: "see_untergegangen",
    name: "Schwimmer untergegangen (offenes Gewässer)",
    thema: "wasser",
    haeufigkeit: 1,
    alter: [16, 70],
    geschlecht: "m",
    orte: ["wasser"],
    kategorien: ["badesee", "hafen"],
    stelle: ["im Wasser, etwa 30 Meter vom Ufer", "beim Steg"],
    anrufer: ["passant", "begleiter"],
    geschehen: [
      "{P} ist hinausgeschwommen und auf einmal untergegangen – {er} ist nicht mehr aufgetaucht.",
      "Du hast gesehen, wo {er} zuletzt war, ungefähr {30|40} Meter vom Ufer.",
      "Ein paar Leute sind schon hineingeschwommen und suchen, aber man sieht nichts.",
      "Einen Bademeister gibt es hier nicht.",
    ],
    hergang: ["Da ist einer untergegangen und nicht mehr aufgetaucht!", "Ein Schwimmer ist im See verschwunden, wir finden ihn nicht!"],
    seitMin: [1, 4],
    jahreszeit: ["sommer"],
    fest: { art: "ertrinken", wo: "untergegangen", ueber6h: "nein", reanimiert: "nein", hws: "nein", deko: "nein", bw: "nein", at: "keine", anzahl_patienten: "1" },
    details: ["Das Wasser ist trüb, man sieht nicht bis zum Grund.", "{Er} war vorher beim Grillen, getrunken hat {er} auch was."],
    verlauf: ["Du bist sehr aufgeregt und schaust die ganze Zeit aufs Wasser."],
    varianten: [
      {
        id: "A",
        p: 1,
        sichtung: "rot",
        lage: "Person untergegangen, Suche im Wasser läuft",
        na: "immer",
        partner: [
          { art: "wasser", grund: "Person im Wasser untergegangen", blockiert: true },
          { art: "fw", grund: "Wasserdienst/Taucher", blockiert: true },
        ],
        buchung: "bu_laufende_reanimation_ecpr",
      },
    ],
  },

  // ---------------------------------------------------------------- Therme: Kollaps nach der Sauna
  {
    id: "therme_kollaps",
    name: "Kollaps nach der Sauna (Therme)",
    thema: "bewusstlos",
    haeufigkeit: 1,
    alter: [55, 85],
    orte: ["wasser"],
    kategorien: ["therme", "hallenbad"],
    stelle: ["im Ruheraum vor der Sauna", "beim Tauchbecken"],
    anrufer: ["bademeister", "partner"],
    geschehen: [
      "{P} ist aus der Sauna gekommen, hat sich unter die kalte Dusche gestellt und ist dann zusammengesackt.",
      "Die Bademeisterin war gleich da, {er} liegt jetzt am Boden mit hochgelagerten Beinen.",
      "[variante=A] Nach kurzer Zeit macht {er} die Augen wieder auf.",
    ],
    hergang: ["Ein Gast ist nach der Sauna umgekippt!", "Da ist jemand beim Tauchbecken zusammengebrochen!"],
    seitMin: [1, 3],
    fest: { hautfarbe: "ja", herzleiden: ["nein", "ja"], bauchschmerz: "nein", bw: "nein", at: "normal", anzahl_patienten: "1" },
    details: ["{Er} atmet, ganz normal.", "{Er} ist sehr blass.", "{Er} war schon drei Saunagänge drinnen."],
    varianten: [
      { id: "A", p: 0.85, sichtung: "gelb", lage: "Kreislaufkollaps nach Saunagang", na: "nein", verlauf: [{ nachMin: [0.5, 1.5], art: "besserung", bw: "ja", sichtung: "gruen", lage: "wach, Kreislauf stabil", text: "Jetzt kommt {er} wieder zu sich!" }], naBegleitet: false, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
      { id: "R", p: 0.15, sichtung: "rot", lage: "bewusstlos, im EKG Rhythmusstörung", na: "immer", buchung: "bu_instabile_rhythmusstoerung" },
    ],
  },

  // ---------------------------------------------------------------- Bahnhof: Sturz auf der Stiege
  {
    id: "bahnhof_stiege",
    name: "Sturz auf der Stiege zum Bahnsteig",
    thema: "sturz",
    haeufigkeit: 1,
    alter: [55, 88],
    orte: ["bahnhof"],
    kategorien: ["bahnhof"],
    stelle: ["auf der Stiege in der Unterführung", "auf der Stiege zum Bahnsteig {2|3}"],
    anrufer: ["passant", "begleiter"],
    geschehen: [
      "{P} ist mit dem Koffer die Stiege hinuntergegangen, ausgerutscht und ein paar Stufen hinuntergefallen.",
      "Jetzt sitzt {er} unten an der Stiege und hält sich das Handgelenk.",
      "[variante=B] {Er} hat sich auch den Kopf angeschlagen und blutet an der Stirn.",
    ],
    hergang: ["Eine ältere Frau ist die Stiege in der Unterführung hinuntergefallen!", "Da ist jemand auf der Bahnhofsstiege gestürzt!"],
    seitMin: [2, 8],
    fest: { schwer_pat: "nein", hoehe: "treppe", verletzt: "ja", blutung_stark: "nein", ohnmacht: "nein", aelter6h: "nein", umstand: "oeffentlich", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Der Zug fährt gleich, {er} will unbedingt mit.", "Ein Mitarbeiter von der ÖBB ist auch schon da."],
    varianten: [
      { id: "A", p: 0.7, sichtung: "gelb", lage: "Verdacht auf Handgelenksbruch nach Treppensturz", na: "nein", fest: { region: "extremitaet", fehlstellung: "ja" }, buchung: "bu_isolierte_extremitaetenverletzung" },
      { id: "B", p: 0.3, sichtung: "gelb", lage: "Platzwunde Stirn, Handgelenk geprellt, nimmt Blutverdünner", na: "nein", fest: { region: "mehrere", fehlstellung: "nein", blutverduenner: "ja" }, buchung: "bu_gesichtsschaedelverletzung" },
    ],
  },

  // ---------------------------------------------------------------- Bushaltestelle: Krampfanfall im Bus
  {
    id: "bus_krampf",
    name: "Krampfanfall im Bus",
    thema: "krampf",
    haeufigkeit: 1,
    alter: [16, 60],
    orte: ["strasse"],
    kategorien: ["bushaltestelle", "busbahnhof"],
    stelle: ["im Bus, der an der Haltestelle steht", "beim Aussteigen aus dem Bus"],
    anrufer: ["busfahrer", "passant"],
    geschehen: [
      "{P} ist im Bus gesessen und hat auf einmal zu zucken angefangen, Arme und Beine.",
      "Der Busfahrer ist bei der Haltestelle stehen geblieben, die anderen Fahrgäste sind ausgestiegen.",
      "Nach ungefähr zwei Minuten hat das Zucken aufgehört, jetzt liegt {er} im Gang und ist ganz benommen.",
    ],
    hergang: ["Ein Fahrgast hat bei uns im Bus einen Anfall, er zuckt am ganzen Körper!", "Da krampft wer im Bus!"],
    seitMin: [2, 5],
    fest: { krampft: "nein", atmung_geprueft: "ja", epilepsie: ["ja", "unbekannt"], atypisch: "unbekannt", schwanger: "nein", diabetiker: "unbekannt", vergiftung: "unbekannt", vg_schlaganfall: "unbekannt", bw: "getruebt", at: "normal", anzahl_patienten: "1" },
    details: ["{Er} hat sich auf die Zunge gebissen, da ist ein bisschen Blut.", "In der Tasche ist ein Ausweis, sonst kenn ich {ihn} nicht."],
    verlauf: ["Du musst nebenbei den Fahrgästen sagen, dass es nicht weitergeht."],
    varianten: [
      { id: "A", p: 0.85, sichtung: "gelb", lage: "postiktal nach Krampfanfall, bekannte Epilepsie", na: "nein", verlauf: [{ nachMin: [3, 6], art: "besserung", bw: "ja", sichtung: "gruen", lage: "wieder orientiert nach Krampfanfall", text: "{Er} wird wieder klarer und fragt, was los war." }], buchung: "bu_erstmaliger_krampfanfall" },
      { id: "S", p: 0.15, sichtung: "rot", lage: "erneuter Krampfanfall, Status epilepticus", na: "immer", buchung: "bu_status_epilepticus" },
    ],
  },

  // ---------------------------------------------------------------- Raststation: LKW-Fahrer mit Brustschmerz
  {
    id: "rast_lkw_brust",
    name: "LKW-Fahrer mit Brustschmerz (Raststation)",
    thema: "brustschmerz",
    haeufigkeit: 1,
    alter: [40, 64],
    geschlecht: "m",
    orte: ["strasse"],
    kategorien: ["raststation"],
    stelle: ["im LKW auf dem Rastplatz", "im Raststättenrestaurant"],
    anrufer: ["verkauf", "lenker", "selbst"],
    geschehen: [
      "{P} ist mit dem LKW auf den Rastplatz gefahren, weil {er} seit einer halben Stunde einen Druck auf der Brust hat.",
      "Der Schmerz zieht in den linken Arm, {er} schwitzt stark.",
      "{Er} ist aus dem Ausland, spricht aber Deutsch.",
    ],
    hergang: ["Ein LKW-Fahrer hat starke Schmerzen in der Brust, er schwitzt total!"],
    hergangIch: ["Ich hab so einen Druck auf der Brust, das zieht in den Arm, ich steh am Rastplatz."],
    seitMin: [20, 50],
    fest: { herz_vg: ["nein", "unbekannt"], bw: "ja", at: "normal", kaltschweiss: "ja", hautfarbe: ["ja", "nein"], sprachschw: "nein", kokain: "nein", anzahl_patienten: "1" },
    details: ["Der LKW steht ganz hinten auf dem LKW-Parkplatz.", "{Er} raucht viel, sagt {er}."],
    varianten: [
      { id: "A", p: 0.75, sichtung: "rot", lage: "STEMI der Hinterwand im 12-Kanal-EKG", na: "immer", buchung: "bu_stemi" },
      { id: "B", p: 0.25, sichtung: "gelb", lage: "unklarer Thoraxschmerz, EKG ohne Hebungen", na: "nein", buchung: "bu_acs_ohne_st_hebung_unklarer_thoraxschmer" },
    ],
  },

  // ---------------------------------------------------------------- Tierpark: Biss im Streichelgehege
  {
    id: "tierpark_biss",
    name: "Biss im Tierpark",
    thema: "tierbiss",
    haeufigkeit: 1,
    alter: [4, 12],
    orte: ["freizeit"],
    kategorien: ["tierpark"],
    stelle: ["beim Streichelgehege", "beim Wildschweingehege"],
    anrufer: ["tierpfleger", "eltern"],
    geschehen: [
      "{P} hat durch den Zaun gefüttert und ist von einem {Esel|Damhirsch|Wildschwein} in die Hand gebissen worden.",
      "Das Tier ist im Gehege, die Tierpflegerin hat das Tor zugemacht.",
      "Die Hand blutet, man sieht die Bisswunde.",
    ],
    hergang: ["Ein Kind ist im Tierpark gebissen worden, die Hand blutet!"],
    seitMin: [3, 10],
    stunden: [9, 18],
    fest: { tierart: ["gross", "normal"], angriff_laeuft: "nein", region: "extremitaet", schwer: ["ja", "nein"], blutung_stark: "nein", fehlstellung: "nein", aelter6h: "nein", oberflaechlich: "nein", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Wir haben ein sauberes Tuch draufgedrückt.", "{Er} weint, ist aber ganz wach.", "Geimpft ist {er}, glaub ich."],
    varianten: [{ id: "A", p: 1, sichtung: "gelb", lage: "Bissverletzung der Hand, Sehnen fraglich betroffen", na: "nein", naBegleitet: false, buchung: "bu_verletztes_kind" }],
  },

  // ---------------------------------------------------------------- Museum: Sturz eines älteren Besuchers
  {
    id: "museum_sturz",
    name: "Sturz im Museum",
    thema: "sturz",
    haeufigkeit: 1,
    alter: [65, 90],
    orte: ["freizeit"],
    kategorien: ["museum"],
    stelle: ["auf der Stiege im Museum", "in der Ausstellung im 1. Stock"],
    anrufer: ["aufsicht", "begleiter"],
    geschehen: [
      "{P} ist bei einer Führung auf der Stiege eine Stufe übersehen und hingefallen.",
      "{Er} liegt am Boden und kann das rechte Bein nicht bewegen, die Hüfte tut weh.",
      "Einen Lift gibt es im Haus nicht, nur die Stiege.",
    ],
    hergang: ["Eine Besucherin ist bei uns im Museum gestürzt und kann nicht mehr aufstehen!"],
    seitMin: [3, 10],
    stunden: [9, 18],
    fest: { schwer_pat: "nein", hoehe: "treppe", verletzt: "ja", region: "extremitaet", blutung_stark: "nein", fehlstellung: ["ja", "nein"], ohnmacht: "nein", aelter6h: "nein", umstand: "oeffentlich", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Das Bein schaut ein bisschen nach außen gedreht aus.", "Die Führung ist unterbrochen, die Gruppe wartet."],
    varianten: [{ id: "A", p: 1, sichtung: "gelb", lage: "Verdacht auf Schenkelhalsbruch nach Treppensturz", na: "nein", buchung: "bu_isolierte_extremitaetenverletzung" }],
  },

  // ---------------------------------------------------------------- Reitanlage: Sturz vom Pferd
  {
    id: "reiten_sturz",
    name: "Sturz vom Pferd",
    thema: "sturz",
    haeufigkeit: 1,
    alter: [10, 45],
    geschlecht: "w",
    orte: ["sport"],
    kategorien: ["reitanlage"],
    stelle: ["in der Reithalle", "auf dem Reitplatz"],
    anrufer: ["trainer", "eltern"],
    geschehen: [
      "Das Pferd hat beim Springen verweigert und {P} ist im hohen Bogen heruntergefallen, mit dem Rücken auf die Stange.",
      "{Er} hatte einen Helm auf.",
      "[variante=A] {Er} liegt am Boden, hat Schmerzen im Rücken, kann aber die Beine bewegen.",
      "[variante=B] {Er} war kurz weg und weiß nicht genau, was passiert ist.",
    ],
    hergang: ["Eine Reiterin ist vom Pferd gestürzt und liegt in der Halle!"],
    seitMin: [3, 10],
    fest: { schwer_pat: "nein", hoehe: "gross", verletzt: "ja", blutung_stark: "nein", fehlstellung: "nein", aelter6h: "nein", umstand: "keine", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Das Pferd ist schon angebunden.", "Wir haben {sie} liegen lassen und zugedeckt."],
    varianten: [
      { id: "A", p: 0.7, sichtung: "gelb", lage: "Rückenprellung nach Sturz vom Pferd, Neurologie unauffällig", na: "nein", fest: { region: "rumpf", ohnmacht: "nein" }, buchung: "bu_isolierte_extremitaetenverletzung" },
      { id: "B", p: 0.3, sichtung: "rot", lage: "Schädel-Hirn-Trauma nach Sturz vom Pferd, eingetrübt", na: "immer", fest: { region: "mehrere", ohnmacht: "ja" }, verlauf: [{ nachMin: [4, 8], art: "verschlechterung", bw: "getruebt", lage: "zunehmend eingetrübt", text: "{Er} wird so komisch, {er} antwortet nicht mehr richtig!" }], buchung: "bu_schweres_sht" },
    ],
  },

  // ---------------------------------------------------------------- Disco: Alkoholvergiftung
  {
    id: "disco_alkohol",
    name: "Alkoholvergiftung in der Disco",
    thema: "vergiftung",
    haeufigkeit: 1,
    alter: [16, 22],
    orte: ["lokal"],
    kategorien: ["disco"],
    stelle: ["auf der Toilette", "vor dem Eingang"],
    anrufer: ["begleiter", "wirt"],
    geschehen: [
      "{P} hat den ganzen Abend Wodka und Shots getrunken.",
      "Jetzt liegt {er} auf der Toilette am Boden, hat erbrochen und ist kaum wach zu kriegen.",
      "[variante=B] Jemand sagt, {er} hat auch irgendeine Tablette genommen.",
    ],
    hergang: ["Unser Freund ist total betrunken und wird nicht mehr wach!", "Da liegt einer auf dem Klo und reagiert kaum mehr!"],
    seitMin: [5, 20],
    stunden: [22, 5],
    fest: { absicht: "drogen", substanz: ["andere", "unbekannt"], viz: "nein", hautfarbe: "nein", aggressiv: "nein", waffen: "nein", bw: "getruebt", at: "normal", anzahl_patienten: "1" },
    details: ["Wir haben {ihn} auf die Seite gedreht.", "Die Security ist auch da."],
    verlauf: ["Du bist selbst angetrunken, im Hintergrund ist laute Musik."],
    varianten: [
      { id: "A", p: 0.8, sichtung: "gelb", lage: "Alkoholintoxikation, Atemwege frei", na: "nein", buchung: "bu_intoxikation" },
      { id: "B", p: 0.2, sichtung: "rot", lage: "Mischintoxikation Alkohol und Tabletten, Atemwege gefährdet", na: "immer", buchung: "bu_intoxikation" },
    ],
  },
];

// ------------------------------------------------------------------ Auswahl

export function fallVorlage(id: string | undefined): FallVorlage | undefined {
  return id ? alleFaelle(true).find((f) => f.id === id) : undefined;
}

export function fallVariante(f: FallVorlage, id: string): FallVariante | undefined {
  return f.varianten.find((v) => v.id === id);
}

/** Fall wählen (Häufigkeit, Uhrzeit, Jahreszeit, Wetter) */
export function fallWaehlen(ctx: { jahreszeit: string; stunde: number; temp: number; glatt: boolean }, rnd: () => number): FallVorlage | null {
  const passend = alleFaelle().filter((v) => {
    if (v.jahreszeit && !v.jahreszeit.includes(ctx.jahreszeit as never)) return false;
    if (v.stunden) {
      const [a, b] = v.stunden;
      const drin = a <= b ? ctx.stunde >= a && ctx.stunde < b : ctx.stunde >= a || ctx.stunde < b;
      if (!drin) return false;
    }
    if (v.wetter === "hitze" && ctx.temp < 25) return false;
    if (v.wetter === "kaelte" && ctx.temp > 3) return false;
    if (v.wetter === "glatt" && !ctx.glatt) return false;
    return true;
  });
  if (!passend.length) return null;
  const sum = passend.reduce((s, v) => s + v.haeufigkeit, 0);
  let r = rnd() * sum;
  for (const v of passend) {
    r -= v.haeufigkeit;
    if (r <= 0) return v;
  }
  return passend[passend.length - 1];
}

/** Ist die Variante „kritisch“ (rot oder mit Verschlechterung)? – für die Einstellung „Komplikationen“ */
function kritischeVariante(v: FallVariante): boolean {
  return v.sichtung === "rot" || (v.verlauf ?? []).some((e) => e.art === "verschlechterung");
}

/** Variante wählen; „Komplikationen“ verschiebt die Gewichte (fordernd = kritische Verläufe häufiger) */
export function varianteWaehlen(f: FallVorlage, komplikationen: "ruhig" | "normal" | "fordernd", rnd: () => number): FallVariante {
  const faktor = komplikationen === "fordernd" ? 2 : komplikationen === "ruhig" ? 0.5 : 1;
  const liste = f.varianten.filter((v) => v.p > 0).map((v) => [v, v.p * (kritischeVariante(v) ? faktor : 1)] as const);
  const sum = liste.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * sum;
  for (const [v, w] of liste) {
    r -= w;
    if (r <= 0) return v;
  }
  return liste[liste.length - 1][0];
}

// ------------------------------------------------------------------ Anleitungen am Telefon erkennen

const ANLEITUNG_MUSTER: [AnleitungTyp, RegExp][] = [
  ["druck_blutung", /(wunde|blut(?!verd|druck|zucker|wert|gerinn)|tuch|tücher|verband|abbind|kompress|(drück|druck|press|halt)\w*[^.?!]*\bauf (den|die|das|ihren|seinen|ihre|seine) (finger|daumen|hand|arm|unterarm|oberarm|bein|fuß|zeh|kopf|stirn|stelle|schnitt|verletzung))/],
  ["fremdkoerper", /(\brücken|schulterbl|heimlich|oberbauch|bäuchlings|kopf (nach )?(unten|tiefer)|unterarm|(weiter|kräftig|fest) (zu )?husten|zum husten|husten lassen)/],
  ["reanimation", /(herzdruck|reanim|wiederbeleb|brustkorb|brustmitte|brustbein|hände[^.?!]*\bbrust|auf (die|seine|ihre) brust|drück|drueck|pump|mitzählen|defi|aed)/],
  ["seitenlage", /(seitenlage|auf die seite)/],
  ["oberkoerper_hoch", /(oberkörper|aufsetzen|hinsetzen|aufrecht|kutscher|sitzen)/],
  ["beine_hoch", /(beine (hoch|anheben)|hochlagern)/],
  ["zucker", /(zucker|saft|cola|limo|trinken)/],
  ["spray", /(spray|inhal|hub|hübe)/],
  ["geburt", /(handtuch|handtücher|pressen|abtrocknen|nabelschnur|baby|neugeboren|warm halten)/],
  ["beruhigen", /(beruhig|ruhig|langsam|tief (ein|durch)|mit ihm atmen|mit ihr atmen|ein und aus)/],
  ["nicht_bewegen", /(nicht bewegen|liegen (lassen|bleiben)|nicht aufheben|zudecken|decke)/],
  ["absichern", /(warnblink|warndreieck|absicher|warnweste|von der straße)/],
  ["tuer", /(tür|schlüssel|eingang|einweis|aufsperren)/],
];

/** Welche Anleitung steckt in diesem Satz der Leitstelle? (nur bei Anweisungen bzw. Bitten) */
export function anleitungAus(text: string, istAnweisung: boolean): AnleitungTyp[] {
  const t = text.toLowerCase();
  const bitte = istAnweisung || /\b(bitte|lassen sie|machen sie|legen sie|geben sie|drücken sie|können sie|könnten sie|versuchen sie|setzen sie|holen sie|bleiben sie)\b/.test(t);
  if (!bitte) return [];
  const out: AnleitungTyp[] = [];
  for (const [typ, re] of ANLEITUNG_MUSTER) if (re.test(t)) out.push(typ);
  // „drücken“ auf die Wunde ist keine Reanimation
  if (out.includes("druck_blutung")) return out.filter((x) => x !== "reanimation");
  return out;
}

// ------------------------------------------------------------------ eigene und geänderte Fälle (Fall-Editor)

/**
 * Eigene Fälle (jeder kann sie anlegen) und Änderungen an eingebauten Fällen (nur mit Admin-Passwort im Editor)
 * liegen auf diesem Rechner; ausgeschaltete Fälle kommen im Spiel nicht vor.
 */
export interface FallSammlung {
  eigene: FallVorlage[];
  geaendert: Record<string, FallVorlage>;
  aus: string[];
}

const SAMMLUNG_KEY = "leitwerk.faelle";
const EINGEBAUT = new Map(FAELLE.map((f) => [f.id, f]));
let sammlung: FallSammlung = sammlungLaden();
const hoerer = new Set<() => void>();

function sammlungLaden(): FallSammlung {
  try {
    const j = JSON.parse(localStorage.getItem(SAMMLUNG_KEY) ?? "null") as Partial<FallSammlung> | null;
    if (j && typeof j === "object") return { eigene: Array.isArray(j.eigene) ? j.eigene : [], geaendert: j.geaendert && typeof j.geaendert === "object" ? j.geaendert : {}, aus: Array.isArray(j.aus) ? j.aus : [] };
  } catch {
    /* kein Speicher */
  }
  return { eigene: [], geaendert: {}, aus: [] };
}

function sammlungSpeichern(): void {
  try {
    localStorage.setItem(SAMMLUNG_KEY, JSON.stringify(sammlung));
  } catch {
    /* kein Speicher */
  }
  for (const h of hoerer) h();
}

/** Bei Änderungen benachrichtigen (gibt die Abmeldung zurück) */
export function faelleGeaendert(fn: () => void): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

/** Alle Fälle: eingebaute (ggf. geändert) und eigene; ohne mitAus nur die eingeschalteten */
export function alleFaelle(mitAus = false): FallVorlage[] {
  const aus = new Set(mitAus ? [] : sammlung.aus);
  const out = FAELLE.map((f) => sammlung.geaendert[f.id] ?? f);
  for (const f of sammlung.eigene) if (!EINGEBAUT.has(f.id)) out.push(f);
  return out.filter((f) => !aus.has(f.id));
}

/** Original eines eingebauten Falls (undefined bei eigenen Fällen) */
export function eingebauterFall(id: string): FallVorlage | undefined {
  return EINGEBAUT.get(id);
}

export function istGeaendert(id: string): boolean {
  return !!sammlung.geaendert[id];
}

export function istFallAktiv(id: string): boolean {
  return !sammlung.aus.includes(id);
}

export function fallAktivSetzen(id: string, an: boolean): void {
  sammlung.aus = sammlung.aus.filter((x) => x !== id);
  if (!an) sammlung.aus.push(id);
  sammlungSpeichern();
}

/** Fall speichern: eingebaut → als Änderung neben dem Original, sonst als eigener Fall */
export function fallSpeichern(f: FallVorlage): void {
  if (EINGEBAUT.has(f.id)) sammlung.geaendert[f.id] = f;
  else {
    const i = sammlung.eigene.findIndex((x) => x.id === f.id);
    if (i >= 0) sammlung.eigene[i] = f;
    else sammlung.eigene.push(f);
  }
  sammlungSpeichern();
}

/** Eigenen Fall löschen bzw. Änderung an einem eingebauten verwerfen */
export function fallLoeschen(id: string): void {
  if (EINGEBAUT.has(id)) delete sammlung.geaendert[id];
  else {
    sammlung.eigene = sammlung.eigene.filter((x) => x.id !== id);
    sammlung.aus = sammlung.aus.filter((x) => x !== id);
  }
  sammlungSpeichern();
}

const PAKET_FORMAT = "leitwerk-faelle";

/** Fallpaket (JSON) mit den gewählten Fällen */
export function fallpaketExport(ids: string[]): string {
  const alle = alleFaelle(true);
  const faelle = ids.map((id) => alle.find((f) => f.id === id)).filter((f): f is FallVorlage => !!f);
  return JSON.stringify({ format: PAKET_FORMAT, version: 1, erstellt: new Date().toISOString(), faelle }, null, 2);
}

/** Grobe Formprüfung eines Falls aus einer Datei (null = in Ordnung) */
export function fallFormFehler(x: unknown): string | null {
  if (!x || typeof x !== "object") return "kein Fall";
  const f = x as Partial<FallVorlage>;
  const str = (v: unknown) => typeof v === "string";
  const strs = (v: unknown) => Array.isArray(v) && v.every(str);
  if (!str(f.id) || !f.id) return "ID fehlt";
  if (!str(f.thema)) return "Thema fehlt";
  if (!Array.isArray(f.alter) || f.alter.length !== 2 || !f.alter.every((n) => typeof n === "number")) return "Alter fehlt";
  if (!strs(f.orte) || !strs(f.stelle) || !strs(f.anrufer) || !strs(f.hergang)) return "Orte, Stelle, Anrufer oder Hergang fehlen";
  if (typeof f.haeufigkeit !== "number") return "Häufigkeit fehlt";
  if (!Array.isArray(f.varianten) || !f.varianten.length) return "keine Ausgänge";
  for (const v of f.varianten) {
    if (!v || typeof v !== "object" || !str(v.id) || typeof v.p !== "number" || !str(v.sichtung) || !str(v.lage) || !str(v.na) || !str(v.buchung)) return "Ausgang unvollständig";
  }
  return null;
}

/**
 * Fallpaket einlesen. Eigene Fälle mit gleicher ID werden ersetzt; eingebaute nur mit Admin-Freigabe
 * (sonst kommt der Fall als eigener mit neuer ID dazu).
 */
export function fallpaketImport(text: string, admin: boolean): { neu: number; ersetzt: number; fehler: string[] } {
  const out = { neu: 0, ersetzt: 0, fehler: [] as string[] };
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    out.fehler.push("Die Datei ist kein gültiges JSON.");
    return out;
  }
  const liste = Array.isArray(j) ? j : (j as { format?: string; faelle?: unknown[] } | null)?.faelle;
  if (!Array.isArray(liste)) {
    out.fehler.push("Kein Fallpaket (es fehlt die Liste „faelle“).");
    return out;
  }
  const ids = new Set(alleFaelle(true).map((f) => f.id));
  for (const x of liste) {
    const fehler = fallFormFehler(x);
    const f = structuredClone(x) as FallVorlage;
    if (fehler) {
      out.fehler.push(`${(x as { name?: string; id?: string })?.name ?? (x as { id?: string })?.id ?? "?"}: ${fehler}`);
      continue;
    }
    if (EINGEBAUT.has(f.id)) {
      if (admin) {
        out.ersetzt++;
        sammlung.geaendert[f.id] = f;
        continue;
      }
      let n = 2;
      while (ids.has(`${f.id}_${n}`)) n++;
      f.id = `${f.id}_${n}`;
    }
    const i = sammlung.eigene.findIndex((e) => e.id === f.id);
    if (i >= 0) {
      sammlung.eigene[i] = f;
      out.ersetzt++;
    } else {
      sammlung.eigene.push(f);
      out.neu++;
    }
    ids.add(f.id);
  }
  sammlungSpeichern();
  return out;
}
