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
  /** wie oft: 1 selten, 2 mittel, 3 häufig, 5 sehr häufig */
  haeufigkeit: number;
  varianten: FallVariante[];
}

// ------------------------------------------------------------------ Katalog

export const FAELLE: FallVorlage[] = [
  // ---------------------------------------------------------------- 1 Fremdkörper Kleinkind
  {
    id: "fk_kleinkind",
    thema: "ersticken",
    haeufigkeit: 1,
    alter: [1, 3],
    orte: ["wohnung", "haus"],
    stelle: ["in der Küche", "im Wohnzimmer", "beim Essen am Tisch"],
    anrufer: ["eltern"],
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
    verlauf: ["Du bist sehr aufgeregt. Wenn man dir Rückenschläge oder Kompressionen erklärt, machst du es sofort und sagst, was passiert."],
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
    thema: "brustschmerz",
    haeufigkeit: 3,
    alter: [50, 85],
    orte: ["wohnung", "haus", "garten", "arbeit"],
    stelle: ["im Wohnzimmer", "in der Küche", "im Garten", "im Büro"],
    anrufer: ["partner", "selbst", "kollege", "kind"],
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
    verlauf: ["Du bist besorgt, aber gefasst."],
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
    thema: "schlaganfall",
    haeufigkeit: 3,
    alter: [60, 92],
    orte: ["wohnung", "haus", "geschaeft"],
    stelle: ["im Wohnzimmer im Sessel", "in der Küche", "im Geschäft bei der Kassa"],
    anrufer: ["kind", "partner", "verkauf"],
    hergang: ["Mit {P} stimmt was nicht, {er} redet so komisch und der Mund hängt {rechts|links} runter!"],
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
      "Vor einer Stunde war noch alles normal, da hab ich mit {ihm} geredet.",
      "{Er} versteht mich, aber man versteht {ihn} kaum.",
      "Den {rechten|linken} Arm kann {er} nicht richtig heben.",
      "Gestürzt ist {er} nicht.",
      "Atmen tut {er} normal.",
    ],
    vorerkrankungen: ["!Vorhofflimmern", "hoher Blutdruck"],
    verlauf: ["Du bist aufgeregt, aber kooperativ."],
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
    thema: "sturz",
    haeufigkeit: 5,
    alter: [75, 95],
    geschlecht: "w",
    orte: ["wohnung"],
    stelle: ["im Bad", "am Gang vor dem Bad", "im Schlafzimmer"],
    anrufer: ["nachbar", "kind", "selbst"],
    hergang: ["{P} ist gestürzt, {er} liegt am Boden und kommt nicht mehr auf."],
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
      "{Er} ist auf dem Weg ins Bad ausgerutscht.",
      "Die {rechte|linke} Hüfte tut {ihm} weh, das Bein liegt so komisch nach außen gedreht.",
      "Am Kopf hat {er} sich nicht angeschlagen.",
      "{Er} redet ganz normal.",
      "{Er} friert ein bisschen und hat Durst.",
      "Dritter Stock, das Stiegenhaus ist eng und der Lift winzig.",
    ],
    vorerkrankungen: ["!Osteoporose", "Herzschwäche"],
    verlauf: ["Du bist ruhig."],
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
        lage: "wach, Verdacht auf Schenkelhalsbruch, ausgekühlt und ausgetrocknet, liegt seit mehreren Stunden",
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
    thema: "stillstand",
    haeufigkeit: 1,
    alter: [45, 85],
    geschlecht: "m",
    orte: ["geschaeft", "wohnung", "sport"],
    stelle: ["an der Kassa", "im Wohnzimmer", "am Spielfeldrand"],
    anrufer: ["passant", "verkauf", "partner", "trainer"],
    hergang: ["Da ist ein Mann umgefallen, {er} rührt sich nicht!", "{P} ist umgefallen, {er} reagiert nicht mehr!"],
    seitMin: [1, 2],
    fest: { tod: "nein", ursache_9: "keine", beobachtet: "ja", bw: "nein", at: "agonal", anzahl_patienten: "1" },
    details: [
      "{Er} reagiert gar nicht, auch nicht aufs Schütteln.",
      "{Er} macht so komische Geräusche, so ein Schnarchen, ganz selten.",
      "{Er} wird ganz grau im Gesicht.",
      "Am Kopf blutet {er} ein bisschen vom Hinfallen.",
      "Da hängt so ein Gerät an der Wand, mit einem Herz drauf (sagst du nur, wenn nach einem Defi gefragt wird).",
    ],
    verlauf: ["Du bist sehr aufgeregt, willst aber helfen. Wenn man dir die Herzdruckmassage erklärt, machst du sie und zählst laut mit."],
    varianten: [
      {
        id: "rea",
        p: 1,
        sichtung: "rot",
        lage: "Kreislaufstillstand, Reanimation läuft",
        na: "immer",
        verlauf: [
          { nachMin: [3.5, 5], art: "besserung", chance: 0.05, mitAnleitung: { typ: "reanimation", chance: 0.35 }, bw: "nein", at: "normal", sichtung: "rot", text: "Das Gerät sagt Schock … es hat ihn geschockt … {er} hustet, {er} atmet wieder!", wechselZu: "rosc" },
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
    thema: "verkehrsunfall",
    haeufigkeit: 2,
    alter: [18, 60],
    geschlecht: "m",
    orte: ["strasse"],
    stelle: ["auf der Landstraße nach dem Ortsende, bei einer Kurve"],
    wo: ["auf der Landstraße kurz nach {ort}, bei einer Kurve"],
    anrufer: ["lenker", "passant"],
    hergang: ["Da ist ein Auto gegen einen Baum gefahren, der Fahrer sitzt noch drin, die Tür geht nicht auf!"],
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
      "Nur das eine Auto, nur er drin, ein junger Mann.",
      "Er stöhnt und fragt immer, was passiert ist.",
      "Er atmet schnell und sagt, es tut weh beim Luftholen.",
      "Seine Beine stecken im Fußraum fest.",
      "Am Kopf blutet er ein bisschen.",
      "Vorne dampft es raus, brennen tut nichts.",
      "Das Auto steht halb auf der Straße, es ist ziemlich dunkel.",
      "Der Airbag ist aufgegangen, angeschnallt war er.",
    ],
    verlauf: ["Du bist geschockt, aber hilfsbereit. Wenn man dir sagt, du sollst die Stelle absichern, machst du das."],
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
    thema: "zucker",
    haeufigkeit: 2,
    alter: [25, 80],
    orte: ["wohnung", "haus", "arbeit"],
    stelle: ["im Wohnzimmer", "in der Küche", "im Büro"],
    anrufer: ["partner", "kollege"],
    hergang: ["{P} ist Diabetiker, {er} ist total verwirrt und schwitzt, ich glaub, {er} ist unterzuckert."],
    seitMin: [5, 20],
    fest: { verhalten: "ja", gewalttaetig: "nein", diabetiker: "ja", bw: "getruebt", at: "normal", anzahl_patienten: "1" },
    details: [
      "{Er} redet wirres Zeug und weiß nicht, wo {er} ist.",
      "{Er} ist klatschnass geschwitzt und zittert.",
      "Ich hab gemessen, 38 steht da.",
      "Ich hab {ihm} Saft gegeben, aber {er} will nicht richtig trinken.",
      "{Er} war heute Nachmittag Rad fahren und hat dann kaum was gegessen.",
      "Wir haben so ein Notfallset, aber ich weiß nicht, wie das geht.",
    ],
    vorerkrankungen: ["!Diabetes"],
    verlauf: ["Du bist ruhig, du kennst die Krankheit. Wenn man dir sagt, du sollst Zucker oder Saft geben, versuchst du es."],
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
    thema: "atemnot",
    haeufigkeit: 2,
    alter: [12, 25],
    orte: ["wohnung", "schule", "sport"],
    stelle: ["im Zimmer", "in der Garderobe", "im Klassenzimmer"],
    anrufer: ["selbst", "eltern", "lehrer", "begleiter"],
    hergang: ["{P} kriegt keine Luft, {er} hat Asthma und das Spray hilft nicht!"],
    hergangIch: ["Ich … krieg keine Luft … Asthma … das Spray hilft nicht."],
    seitMin: [15, 30],
    fest: { lungenerkrankung: "asthma", tracheostoma: "nein", sprachschw: "ja", hautfarbe: "nein", kaltschweiss: "nein", bw: "ja", at: "abnorm", anzahl_patienten: "1" },
    details: [
      "{Er} hat in den letzten 20 Minuten viermal das Spray genommen, hilft kaum.",
      "{Er} ist verkühlt und war bei einer Freundin mit Katze.",
      "Es pfeift beim Atmen, {er} kann nur zwei, drei Wörter am Stück sagen.",
      "Asthma hat {er} seit der Kindheit.",
    ],
    verlauf: ["Wenn du selbst anrufst, sprichst du nur in kurzen Satzfetzen mit Pausen zum Luftholen."],
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
    thema: "schwangerschaft",
    haeufigkeit: 1,
    alter: [22, 40],
    geschlecht: "w",
    orte: ["wohnung", "haus"],
    stelle: ["im Schlafzimmer", "im Wohnzimmer", "im Bad"],
    anrufer: ["partner", "selbst"],
    hergang: ["{P} kriegt das Baby, die Wehen kommen ganz schnell, wir schaffen es nicht mehr ins Spital!"],
    hergangIch: ["Ich krieg das Baby, die Wehen kommen alle zwei Minuten, ich schaff es nicht mehr ins Spital!"],
    seitMin: [30, 60],
    fest: { ssw: 39, mehrlinge: "nein", situation: "unmittelbar", kompl_baby: "nein", kompl_mutter: "nein", blutung_stark: "nein", komplikationen: "nein", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "Termin ist nächste Woche.",
      "Es ist das zweite Kind, beim ersten ist es auch schnell gegangen.",
      "Die Wehen kommen alle zwei Minuten, seit einer Stunde.",
      "Das Fruchtwasser ist vor 20 Minuten gekommen, ganz klar.",
      "Sie sagt, sie muss pressen.",
      "Ein bisschen Blut, nicht viel.",
      "Bei den Kontrollen war alles normal.",
    ],
    verlauf: ["Du bist sehr aufgeregt und redest schnell. Wenn man dir die Geburt erklärt, machst du mit."],
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
          { nachMin: [4, 6], art: "verschlechterung", sichtung: "rot", lage: "Kind geboren, Neugeborenes schlaff, atmet nicht ausreichend", na: "immer", text: "Es ist da … es schreit nicht, es ist ganz schlaff!" },
          { nachMin: [8, 10], art: "besserung", chance: 0.3, mitAnleitung: { typ: "geburt", chance: 0.5 }, sichtung: "gelb", lage: "Neugeborenes nach Abtrocknen und Wärmen rosig, schreit", text: "Jetzt schreit es!", wechselZu: "A" },
        ],
        buchung: "bu_kritisch_krankes_neugeborenes",
      },
    ],
  },

  // ---------------------------------------------------------------- 10 Psychische Krise
  {
    id: "psych_eingesperrt",
    thema: "psych",
    haeufigkeit: 2,
    alter: [20, 60],
    orte: ["wohnung"],
    stelle: ["vor der Wohnungstür im 3. Stock"],
    anrufer: ["begleiter", "nachbar"],
    hergang: ["{P} hat mir geschrieben, dass {er} nicht mehr will. {Er} macht nicht auf, ich steh vor {seiner} Tür."],
    seitMin: [20, 40],
    fest: { ubg: "dringend", lage: "absicht", substanzen: "ja", verwirrt: "nein", ploetzlich: "nein", psych_vorerkrankung: "ja", blutung: "unbekannt", gewalt: "nein", waffen: "nein", selbstverbrennung: "nein", krisenteam: "nein", bw: "unbekannt", at: "unbekannt", anzahl_patienten: "1" },
    details: [
      "{Er} hat geschrieben, es tut {ihm} leid und {er} kann nicht mehr. Seitdem hebt {er} nicht ab.",
      "Drinnen läuft der Fernseher, aber {er} antwortet nicht.",
      "Waffen hat {er} keine, glaub ich.",
      "{Er} hat Depressionen, ist in Behandlung, und vor zwei Wochen hat {sein} Partner {ihn} verlassen.",
      "Vor drei Jahren war schon einmal so was.",
      "{Er} trinkt in letzter Zeit viel.",
      "Einen Schlüssel hab ich nicht.",
    ],
    vorerkrankungen: ["!Depressionen"],
    verlauf: ["Du bist sehr besorgt und weinst zwischendurch. Du siehst den Patienten nicht – was du nicht siehst, weißt du nicht."],
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
    thema: "bewusstlos",
    haeufigkeit: 5,
    alter: [16, 85],
    orte: ["geschaeft", "freizeit", "strasse", "arzt"],
    stelle: ["in der Kirche", "an der Kassa", "an der Bushaltestelle", "im Wartezimmer"],
    anrufer: ["passant", "verkauf", "eltern", "partner"],
    hergang: ["{P} ist umgefallen, {er} ist bewusstlos!"],
    seitMin: [1, 2],
    fest: { hautfarbe: "ja", herzleiden: "nein", bauchschmerz: "nein", bw: "nein", at: "normal", anzahl_patienten: "1" },
    details: [
      "{Er} ist einfach so zusammengesackt, nach langem Stehen.",
      "Atmen tut {er} normal.",
      "{Er} ist ganz blass.",
      "Gekrampft hat {er} nicht.",
      "Verletzt hat {er} sich nicht, {er} ist eher hingerutscht.",
      "{Er} hat heute noch nichts gegessen, sagt {er}.",
    ],
    verlauf: ["Du bist am Anfang sehr aufgeregt, wirst ruhiger, sobald der Patient wieder redet."],
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
    thema: "atemnot",
    haeufigkeit: 3,
    alter: [15, 40],
    geschlecht: "w",
    orte: ["wohnung", "schule", "arbeit", "lokal"],
    stelle: ["im Wohnzimmer", "am Gang", "in der Garderobe"],
    anrufer: ["begleiter", "eltern", "lehrer", "kollege"],
    hergang: ["{P} kriegt keine Luft mehr, die Hände sind ganz verkrampft, bitte schnell!"],
    seitMin: [5, 15],
    fest: { lungenerkrankung: "nein", tracheostoma: "nein", sprachschw: "nein", hautfarbe: "nein", kaltschweiss: "nein", bw: "ja", at: "abnorm", anzahl_patienten: "1" },
    details: [
      "Das hat nach einem Streit angefangen.",
      "{Er} atmet total schnell und sagt, {er} stirbt.",
      "Die Hände sind so verkrampft, und es kribbelt im Gesicht.",
      "Rot im Gesicht, nicht blau.",
      "Das hatte {er} schon einmal, Asthma hat {er} keins.",
    ],
    verlauf: ["Du bist aufgeregt. Wenn man dir sagt, du sollst {ihn} beruhigen und mit {ihm} langsam atmen, machst du es."],
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
    thema: "bewusstlos",
    haeufigkeit: 3,
    alter: [25, 65],
    geschlecht: "m",
    orte: ["bahnhof", "strasse"],
    stelle: ["auf der Bank beim Bahnhof", "an der Bushaltestelle", "auf einer Parkbank"],
    anrufer: ["passant", "wirt"],
    hergang: ["Da liegt ein Mann auf der Bank, der rührt sich nicht."],
    seitMin: [5, 30],
    stunden: [18, 6],
    fest: { hautfarbe: "nein", herzleiden: "unbekannt", bauchschmerz: "nein", bw: "getruebt", at: "normal", anzahl_patienten: "1" },
    details: [
      "Er brummt was, wenn ich ihn laut anrede.",
      "Er schnarcht.",
      "Neben ihm stehen lauter Bierdosen.",
      "Verletzt ist er nicht, soweit ich seh.",
      "Ich kenn ihn nicht.",
    ],
    verlauf: ["Du bist unsicher und traust dich nicht ganz hin. Wenn man dich bittet, gehst du hin und sprichst ihn an."],
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
    thema: "blutung",
    haeufigkeit: 3,
    alter: [15, 85],
    orte: ["wohnung", "haus", "garten"],
    stelle: ["in der Küche", "im Garten", "in der Werkstatt"],
    anrufer: ["selbst", "partner"],
    hergang: ["{P} hat sich beim Gemüseschneiden in den Finger geschnitten, es hört nicht auf zu bluten."],
    hergangIch: ["Ich hab mich beim Gemüseschneiden in den Finger geschnitten, es hört nicht auf zu bluten."],
    seitMin: [5, 15],
    fest: { ursache: "trauma", staerke: "schwach", region: "extremitaet", bluter: "nein", blutverduenner: ["ja", "nein"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "Am Zeigefinger, ziemlich tief, so zwei Zentimeter.",
      "Das Tuch ist schon ganz rot, aber es spritzt nicht.",
      "Spüren tut {er} den Finger normal.",
      "Ein bisschen flau ist {ihm}.",
    ],
    verlauf: ["Du bist ruhig, ein bisschen zittrig."],
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
      { id: "C", p: 0.05, sichtung: "gelb", lage: "tiefe Schnittverletzung, Sehnen und Gefäße betroffen, starke Blutung, abgebunden", na: "RS", buchung: "bu_isolierte_extremitaetenverletzung" },
    ],
  },

  // ---------------------------------------------------------------- 15 Pflegeheim, Fieber
  {
    id: "pflegeheim_fieber",
    thema: "krank",
    haeufigkeit: 5,
    alter: [78, 96],
    orte: ["pflegeheim"],
    stelle: ["im Zimmer auf Station 2"],
    anrufer: ["pflege"],
    hergang: ["{P} hat seit gestern Fieber und ist heute deutlich schläfriger."],
    seitMin: [600, 1400],
    fest: { sonderdiagnose: "nein", verwirrt: "nein", hauptbeschwerde: "fieber", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "{Er} ist erweckbar, aber schläfriger als sonst.",
      "Atemfrequenz um die 24, {er} rasselt ein bisschen.",
      "Wir haben 38,9 Fieber, Blutdruck 125 zu 70, Puls 98, Sättigung 91.",
      "{Er} trinkt seit gestern fast nichts.",
      "Es gibt eine Patientenverfügung, keine Reanimation.",
      "Den Hausarzt erreichen wir nicht.",
      "Arztbrief und Medikamentenliste liegen bereit.",
    ],
    vorerkrankungen: ["!beginnende Demenz", "Herzschwäche", "Diabetes"],
    verlauf: ["Du bist Pflegekraft, ruhig und sachlich, und verwendest Fachbegriffe."],
    varianten: [
      { id: "A", p: 0.85, sichtung: "gelb", lage: "Fieber 38,9, Sättigung 91, stabil", na: "nein", naBegleitet: false, buchung: "bu_pneumonie_atemnot_copd" },
      { id: "B", p: 0.15, sichtung: "rot", lage: "Blutdruck 85 zu 50, Puls 120, sehr schläfrig, Verdacht auf Sepsis", na: "NFS-NKA", buchung: "bu_sepsis" },
    ],
  },

  // ---------------------------------------------------------------- 16 Hexenschuss
  {
    id: "hexenschuss",
    thema: "ruecken",
    haeufigkeit: 3,
    alter: [30, 75],
    geschlecht: "m",
    orte: ["haus", "wohnung", "arbeit"],
    stelle: ["im Keller", "im Schlafzimmer", "im Lager"],
    anrufer: ["selbst", "partner", "kollege"],
    hergang: ["{P} liegt am Boden und kann sich nicht mehr bewegen, der Rücken!"],
    hergangIch: ["Ich lieg am Boden, ich kann mich nicht mehr bewegen, der Rücken … bitte kommen Sie!"],
    seitMin: [10, 30],
    fest: { ursache: "nein", zerreiss: "nein", aneurysma: "nein", ohnmacht: "nein", grau: "nein", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: [
      "Beim Heben einer Kiste hat es reingeschossen.",
      "Gestürzt ist {er} nicht, {er} hat sich auf den Boden gelegt.",
      "Die Beine spürt {er} normal.",
      "Vor zwei Jahren hatte {er} das auch schon.",
    ],
    verlauf: ["Du stöhnst und klingst dramatisch, bist aber klar im Kopf."],
    varianten: [
      { id: "A", p: 0.97, sichtung: "gruen", lage: "akuter Rückenschmerz nach Heben, Neurologie unauffällig", na: "nein", naBegleitet: false, revers: 0.12, buchung: "bu_isolierte_extremitaetenverletzung" },
      { id: "C", p: 0.03, sichtung: "rot", lage: "blass, Blutdruck 90 zu 60, Schmerz in Bauch und Rücken", na: "immer", buchung: "bu_rupturiertes_bauchaortenaneurysma" },
    ],
  },
];

// ------------------------------------------------------------------ Auswahl

export function fallVorlage(id: string | undefined): FallVorlage | undefined {
  return id ? FAELLE.find((f) => f.id === id) : undefined;
}

export function fallVariante(f: FallVorlage, id: string): FallVariante | undefined {
  return f.varianten.find((v) => v.id === id);
}

/** Fall wählen (Häufigkeit, Uhrzeit, Jahreszeit, Wetter) */
export function fallWaehlen(ctx: { jahreszeit: string; stunde: number; temp: number; glatt: boolean }, rnd: () => number): FallVorlage | null {
  const passend = FAELLE.filter((v) => {
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
  ["druck_blutung", /(wunde|blut|tuch|verband|abbind)/],
  ["fremdkoerper", /(\brücken|schulterbl|heimlich|oberbauch|bäuchlings|kopf (nach )?(unten|tiefer)|unterarm)/],
  ["reanimation", /(herzdruck|reanim|wiederbeleb|brustkorb|brustmitte|brustbein|drück|drueck|pump|mitzählen|defi|aed)/],
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
