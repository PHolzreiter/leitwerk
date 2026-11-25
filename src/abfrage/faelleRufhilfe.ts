/**
 * Rufhilfe (Beta 73, Paul 22.11.2026): ältere Menschen mit einer Rufhilfe-Uhr (Notrufknopf am Handgelenk).
 * Zuerst kommt das Band (Name, Alter, Adresse, Schlüsselsafe), dann die Sprechverbindung über die Basis in der
 * Wohnung – die Person redet (laut, oft ein Stück weg vom Gerät) oder es bleibt still („…“).
 * Es gibt keine Kapitel-Abfrage: der Code ist immer 32B2, der Disponent entscheidet nach dem Gehörten, wen er
 * schickt (Vorschlag: der nächste RTW). Hingeschickt wird immer – auch ohne Sprechkontakt und bei einem Versehen.
 * Standard (Paul 25.11.2026): eine externe Stelle nimmt den Alarm auf – der Einsatz kommt fertig zum Disponieren
 * („extern“ = ihr Eintrag unter „Was ist passiert?“); rein versehentliche Alarme (mit Sprechkontakt) klärt sie selbst.
 * Die Person ist immer zu Hause an der gemeldeten Adresse.
 */
import type { FallVorlage } from "./faelle";

const RH = { anrufer: "rufhilfe", anzahl_patienten: "1" };
const ZUHAUSE: FallVorlage["orte"] = ["wohnung", "haus"];

export const FAELLE_RUFHILFE: FallVorlage[] = [
  // ---------------------------------------------------------------- Sturz, kommt nicht mehr hoch
  {
    id: "rufhilfe_sturz",
    name: "Rufhilfe: gestürzt, kommt nicht mehr hoch",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 5,
    alter: [72, 95],
    orte: ZUHAUSE,
    stelle: ["im Vorzimmer am Boden", "im Badezimmer am Boden", "im Schlafzimmer neben dem Bett am Boden", "in der Küche am Boden"],
    anrufer: ["selbst"],
    geschehen: [
      "Du lebst allein und hast eine Rufhilfe-Uhr am Handgelenk. Du bist gestürzt und liegst am Boden, du kommst allein nicht mehr hoch. Deshalb hast du auf den Knopf gedrückt.",
      "[variante=A] Weh tut dir eigentlich nichts, nur ein bisschen der Ellbogen. Du bist nur zu schwach zum Aufstehen.",
      "[variante=B] Deine rechte Hüfte tut furchtbar weh, du kannst das Bein kaum bewegen. Du hast dich beim Umdrehen auf den Teppich gesetzt und bist umgefallen.",
      "[variante=C] Du hast dir den Kopf am Kasten angeschlagen, es blutet ein bisschen an der Stirn. Du nimmst einen Blutverdünner. Sonst geht es dir gut.",
    ],
    hergang: ["Ich bin hingefallen und komm nicht mehr auf!", "Hallo? Ich lieg da am Boden und komm nicht mehr hoch …"],
    seitMin: [5, 60],
    extern: ["Gestürzt, liegt am Boden, kommt allein nicht mehr hoch", "[variante=A] kaum Schmerzen, nur am Ellbogen", "[variante=B] starke Schmerzen rechte Hüfte, kann das Bein kaum bewegen", "[variante=C] Kopf am Kasten angeschlagen, blutet an der Stirn, nimmt Blutverdünner"],
    fest: { ...RH, rh_kontakt: "ja", bw: "ja", at: "normal" },
    details: ["Du hörst ein bisschen schlecht und musst manchmal nachfragen.", "Die Rettung kommt mit dem Schlüssel aus dem Schlüsselsafe in die Wohnung."],
    varianten: [
      { id: "A", p: 0.55, sichtung: "gruen", lage: "nach Sturz unverletzt, kommt allein nicht hoch – aufgeholfen, möchte zu Hause bleiben", braucht: "RS", transport: false, symptom: "kollaps", dringlichkeit: 10, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
      { id: "B", p: 0.3, sichtung: "gelb", lage: "Sturz auf die rechte Hüfte, Bein verkürzt und außenrotiert, Verdacht auf Schenkelhalsfraktur, Kreislauf stabil", braucht: "NFS", reichtNicht: 0.3, symptom: "schenkelhalsfraktur", dringlichkeit: 20, buchung: "bu_isolierte_extremitaetenverletzung" },
      { id: "C", p: 0.15, sichtung: "gelb", lage: "Kopfplatzwunde Stirn unter Antikoagulation, wach und orientiert", braucht: "RS", symptom: "kopfverletzung", dringlichkeit: 20, buchung: "bu_gesichtsschaedelverletzung" },
    ],
  },

  // ---------------------------------------------------------------- Brustschmerz
  {
    id: "rufhilfe_brust",
    name: "Rufhilfe: Schmerzen in der Brust",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 1.5,
    alter: [70, 92],
    orte: ZUHAUSE,
    stelle: ["im Wohnzimmer auf der Couch", "im Schlafzimmer im Bett", "in der Küche auf einem Sessel"],
    anrufer: ["selbst"],
    geschehen: [
      "Du lebst allein und hast eine Rufhilfe-Uhr. Seit einer halben Stunde drückt es dich in der Brust, es zieht in den linken Arm. Dir ist schlecht und du schwitzt.",
      "Du sitzt, aufstehen magst du nicht. Du hast Angst.",
    ],
    hergang: ["Mir tut die Brust so weh, es drückt so …", "Ich hab so einen Druck auf der Brust, bitte kommen S'!"],
    seitMin: [15, 45],
    extern: ["Seit ca. einer halben Stunde Druck auf der Brust, zieht in den linken Arm", "Übelkeit, schwitzt"],
    fest: { ...RH, rh_kontakt: "ja", bw: "ja", at: "normal" },
    details: ["Du hast Tabletten fürs Herz.", "Die Tür ist zu, der Schlüssel ist im Schlüsselsafe."],
    varianten: [
      { id: "A", p: 0.6, sichtung: "rot", lage: "Thoraxschmerz mit Ausstrahlung in den linken Arm, kaltschweißig, 12-Kanal-EKG mit ST-Hebungen", braucht: "NA", symptom: "st_hebungsinfarkt_oder_stemi_aequivalent", dringlichkeit: 30, buchung: "bu_stemi" },
      { id: "B", p: 0.4, sichtung: "gelb", lage: "Thoraxschmerz, Kreislauf stabil, EKG ohne ST-Hebungen", braucht: "NFS", reichtNicht: 0.3, symptom: "thoraxschmerz_nicht_traumatisch", dringlichkeit: 20, buchung: "bu_acs_ohne_st_hebung_unklarer_thoraxschmer" },
    ],
  },

  // ---------------------------------------------------------------- Atemnot
  {
    id: "rufhilfe_atemnot",
    name: "Rufhilfe: bekommt schlecht Luft",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 1.5,
    alter: [72, 94],
    orte: ZUHAUSE,
    stelle: ["im Schlafzimmer, sitzt am Bettrand", "im Wohnzimmer im Lehnstuhl"],
    anrufer: ["selbst"],
    geschehen: [
      "Du lebst allein und hast eine Rufhilfe-Uhr. Du bekommst seit dem Aufwachen immer schlechter Luft, im Liegen geht es gar nicht. Die Beine sind dick geschwollen.",
      "Du redest kurzatmig, immer nur ein paar Wörter, dann musst du schnaufen.",
    ],
    hergang: ["Ich krieg … so schlecht … Luft …"],
    seitMin: [30, 180],
    extern: ["Seit dem Aufwachen zunehmend Atemnot, im Liegen gar nicht", "Beine geschwollen, spricht nur kurze Sätze"],
    fest: { ...RH, rh_kontakt: "ja", bw: "ja", at: "abnorm" },
    details: ["Du nimmst Wassertabletten und etwas fürs Herz."],
    varianten: [
      { id: "A", p: 0.6, sichtung: "gelb", lage: "dekompensierte Herzinsuffizienz, Orthopnoe, Beinödeme, SpO2 86 %", braucht: "NKV", reichtNicht: 0.3, symptom: "herzinsuffizienz", dringlichkeit: 20, buchung: "bu_pneumonie_atemnot_copd" },
      { id: "B", p: 0.4, sichtung: "rot", lage: "Lungenödem, SpO2 78 %, brodelnde Atmung, kaltschweißig", braucht: "NA", symptom: "herzinsuffizienz", dringlichkeit: 30, buchung: "bu_pneumonie_atemnot_copd" },
    ],
  },

  // ---------------------------------------------------------------- Schwäche, Schwindel
  {
    id: "rufhilfe_schwach",
    name: "Rufhilfe: schwach und schwindlig",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 2,
    alter: [75, 96],
    orte: ZUHAUSE,
    stelle: ["im Wohnzimmer auf der Couch", "im Schlafzimmer im Bett", "am WC"],
    anrufer: ["selbst"],
    geschehen: [
      "Du lebst allein und hast eine Rufhilfe-Uhr. Dir ist seit gestern so schwindlig und du bist ganz schwach, du hast kaum etwas getrunken. Beim Aufstehen wird dir schwarz vor den Augen.",
      "[variante=B] Seit heute in der Früh hast du auch Durchfall gehabt, mehrmals.",
    ],
    hergang: ["Mir ist so schwindlig, ich kann nicht aufstehen …", "Ich bin so schwach, mir dreht sich alles."],
    seitMin: [60, 600],
    extern: ["Seit gestern schwindlig und schwach, kaum getrunken", "beim Aufstehen schwarz vor Augen", "[variante=B] seit heute früh mehrmals Durchfall"],
    fest: { ...RH, rh_kontakt: "ja", bw: "ja", at: "normal" },
    details: ["Du hast keinen Schmerz in der Brust.", "Hingefallen bist du nicht."],
    varianten: [
      { id: "A", p: 0.6, sichtung: "gruen", lage: "Exsikkose, Blutdruck 95/60, orthostatischer Schwindel, sonst unauffällig", braucht: "RS", symptom: "kollaps", dringlichkeit: 10, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
      { id: "B", p: 0.4, sichtung: "gelb", lage: "Exsikkose bei Gastroenteritis, Tachykardie 110/min, Blutdruck 90/55", braucht: "NFS", symptom: "kollaps", dringlichkeit: 20, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
    ],
  },

  // ---------------------------------------------------------------- verwirrt, Fieber
  {
    id: "rufhilfe_verwirrt",
    name: "Rufhilfe: verwirrt, Fieber",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 1,
    alter: [78, 96],
    orte: ZUHAUSE,
    stelle: ["im Schlafzimmer im Bett", "im Wohnzimmer"],
    anrufer: ["selbst"],
    geschehen: [
      "Du lebst allein und hast eine Rufhilfe-Uhr. Du bist durcheinander: du weißt nicht genau, welcher Tag ist, und redest manchmal von anderen Dingen. Dir ist heiß und kalt zugleich, beim Wasserlassen brennt es seit Tagen.",
      "Warum du gedrückt hast, weißt du selbst nicht mehr so genau – dir geht es halt nicht gut.",
    ],
    hergang: ["Ja … hallo? Wer ist da? Mir ist so komisch …"],
    seitMin: [120, 720],
    extern: ["Verwirrt, weiß nicht genau, welcher Tag ist", "fühlt sich heiß und kalt, seit Tagen Brennen beim Wasserlassen"],
    fest: { ...RH, rh_kontakt: "ja", bw: "getruebt", at: "normal" },
    details: ["Deine Tochter kommt sonst immer am Wochenende."],
    varianten: [
      { id: "A", p: 0.65, sichtung: "gelb", lage: "Harnwegsinfekt mit Fieber 38,9 °C, neu verwirrt, Kreislauf stabil", braucht: "NFS", symptom: "fieber", dringlichkeit: 20, buchung: "bu_sepsis" },
      { id: "B", p: 0.35, sichtung: "rot", lage: "Urosepsis, Fieber 39,6 °C, Blutdruck 80/45, Tachykardie 125/min, somnolent", braucht: "NA", symptom: "sepsis", dringlichkeit: 30, buchung: "bu_sepsis" },
    ],
  },

  // ---------------------------------------------------------------- keine Sprechverbindung
  {
    id: "rufhilfe_still",
    name: "Rufhilfe: keine Sprechverbindung",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 3,
    alter: [74, 96],
    orte: ZUHAUSE,
    stelle: ["im Vorzimmer am Boden", "im Badezimmer", "im Schlafzimmer"],
    anrufer: ["selbst"],
    geschehen: ["Nach der Ansage meldet sich niemand – über die Rufhilfe-Basis ist nichts zu hören."],
    hergang: ["…"],
    seitMin: [5, 240],
    extern: ["Alarm ausgelöst, keine Sprechverbindung – über die Basis ist nichts zu hören"],
    fest: { ...RH, rh_kontakt: "nein", bw: "unbekannt", at: "unbekannt" },
    varianten: [
      { id: "A", p: 0.4, sichtung: "gruen", wahr: { bw: "ja", at: "normal" }, lage: "im Bad gestürzt, unverletzt, hat die Basis ohne Hörgerät nicht gehört – aufgeholfen, bleibt zu Hause", braucht: "RS", transport: false, symptom: "kollaps", dringlichkeit: 10, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
      { id: "B", p: 0.25, sichtung: "gelb", wahr: { bw: "getruebt", at: "normal" }, lage: "liegt seit Stunden am Boden, Exsikkose, Druckstellen, schläfrig, Verdacht auf Rhabdomyolyse", braucht: "NFS", symptom: "kollaps", dringlichkeit: 20, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
      { id: "C", p: 0.2, sichtung: "rot", wahr: { bw: "nein", at: "normal" }, lage: "am Boden aufgefunden, reagiert kaum, rechtsseitige Lähmung, Verdacht auf Schlaganfall", braucht: "NA", symptom: "schlaganfall_apss_4_9", dringlichkeit: 30, buchung: "bu_schlaganfall" },
      { id: "D", p: 0.15, sichtung: "gruen", wahr: { bw: "ja", at: "normal" }, lage: "wohlauf im Garten angetroffen, Alarm aus Versehen ausgelöst", braucht: "RS", transport: false, fehleinsatz: "Person wohlauf im Garten angetroffen, Rufhilfe-Alarm aus Versehen ausgelöst – kein Einsatzgrund", buchung: "" },
    ],
  },

  // ---------------------------------------------------------------- aus Versehen gedrückt (Fehleinsatz)
  {
    id: "rufhilfe_versehen",
    name: "Rufhilfe: aus Versehen ausgelöst",
    thema: "unklar",
    gruppe: "rufhilfe",
    haeufigkeit: 2,
    alter: [72, 94],
    orte: ZUHAUSE,
    stelle: ["in der Küche", "im Wohnzimmer"],
    anrufer: ["selbst"],
    geschehen: [
      "Du lebst allein und hast eine Rufhilfe-Uhr. Du bist beim Abwaschen bzw. beim Anziehen mit dem Ärmel an den Knopf gekommen – es ist NICHTS passiert, dir geht es gut.",
      "Du entschuldigst dich und sagst, dass du keine Rettung brauchst. Kommt trotzdem jemand, ist das für dich auch in Ordnung.",
    ],
    hergang: ["Ach, Entschuldigung, da bin ich angekommen – es ist eh nix!", "Jessas, das war ein Versehen, mir geht's gut!"],
    hergangIch: ["Ach, Entschuldigung, da bin ich angekommen – es ist eh nix!"],
    seitMin: [0, 1],
    fest: { ...RH, rh_kontakt: "ja", bw: "ja", at: "normal" },
    varianten: [
      { id: "A", p: 1, sichtung: "gruen", lage: "wohlauf, Rufhilfe-Alarm versehentlich ausgelöst", braucht: "RS", transport: false, fehleinsatz: "Person wohlauf, Rufhilfe-Alarm aus Versehen ausgelöst – kein Einsatzgrund", buchung: "" },
    ],
  },
];
