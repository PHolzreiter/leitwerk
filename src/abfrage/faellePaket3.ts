/**
 * Fallpaket 3 (Stand 0.88): Einweisungen durch Ärzte und Einrichtungen (Transport ohne Notfall) und Stürze,
 * die schon länger her sind – damit die Verteilung der Versorgungsstufen (Akuttransport, BLS grün) stimmt.
 */
import type { FallVorlage } from "./faelle";

export const FAELLE_PAKET3: FallVorlage[] = [
  // ================================================================ EINWEISUNGEN (Arzt / Einrichtung fordert einen Transport an)

  // ---------------------------------------------------------------- Hausarzt: Lungenentzündung
  {
    id: "hausarzt_einweisung_pneumonie",
    name: "Hausarzt weist mit Lungenentzündung ein",
    thema: "anforderung_arzt",
    haeufigkeit: 3,
    alter: [60, 92],
    orte: ["arzt"],
    kategorien: ["arztpraxis", "primaerversorgung"],
    tageszeit: "tag",
    stelle: ["im Behandlungsraum", "im Warteraum"],
    anrufer: ["arzt", "ordi"],
    geschehen: [
      "{P} ist mit Husten und Fieber in die Ordination gekommen, die Lunge rasselt rechts, Verdacht auf Lungenentzündung.",
      "{Er} ist wach, kann sitzen und gehen, braucht aber das Krankenhaus.",
      "Die Einweisung ist geschrieben.",
    ],
    hergang: ["Ordination, ich brauche einen Transport ins Krankenhaus, Einweisung wegen Lungenentzündung, Patient sitzend.", "Wir haben einen Patienten zur Einweisung, Pneumonie, nicht dringend."],
    seitMin: [10, 40],
    fest: { anforderer: "normal", grund: "transport", dringlichkeit: "ohne", transportart: ["sitzend", "gehend"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Sättigung 93 Prozent, Fieber 38,4.", "Die Gattin begleitet {ihn}."],
    verlauf: ["Du bist ruhig und sachlich, die Ordination ist voll."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "ambulant erworbene Pneumonie, Sättigung 93, Kreislauf stabil – Einweisung", na: "nein", symptom: "fieber", dringlichkeit: 10, buchung: "bu_pneumonie_atemnot_copd" }],
  },

  // ---------------------------------------------------------------- Hausarzt: Hausbesuch, kann nicht mehr gehen
  {
    id: "hausbesuch_einweisung_liegend",
    name: "Hausarzt auf Hausbesuch: liegender Transport",
    thema: "anforderung_arzt",
    haeufigkeit: 3,
    alter: [75, 98],
    orte: ["wohnung", "haus"],
    stelle: ["im Schlafzimmer", "im Pflegebett im Wohnzimmer"],
    anrufer: ["arzt"],
    tageszeit: "tag",
    geschehen: [
      "Du bist die Hausärztin bzw. der Hausarzt und gerade auf Hausbesuch bei {P}.",
      "{Er} ist seit Tagen schwächer, trinkt kaum, die Nierenwerte waren schon letzte Woche schlecht.",
      "{Er} gehört heute ins Krankenhaus, liegend, ein Notfall ist es nicht.",
    ],
    hergang: ["Ich bin auf Hausbesuch und brauche einen liegenden Transport ins Krankenhaus, Einweisung, kein Notfall."],
    seitMin: [10, 40],
    fest: { anforderer: "normal", grund: "transport", dringlichkeit: "ohne", transportart: "liegend", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Die Tochter ist da und sperrt auf.", "Blutdruck 105 zu 60, Puls 90."],
    verlauf: ["Du bist ruhig und routiniert."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Exsikkose mit Nierenfunktionsverschlechterung, stabil – Einweisung liegend", na: "nein", symptom: "exsikkose", dringlichkeit: 10, buchung: "bu_exsikkose_synkope_az_verschlechterung" }],
  },

  // ---------------------------------------------------------------- Pflegeheim: Heimarzt weist ein
  {
    id: "heim_einweisung",
    name: "Pflegeheim: Einweisung durch den Heimarzt",
    thema: "anforderung_arzt",
    haeufigkeit: 3,
    alter: [78, 99],
    orte: ["pflegeheim"],
    stelle: ["im Zimmer"],
    anrufer: ["pflege"],
    geschehen: [
      "Der Heimarzt war heute Vormittag da und hat {P} eingewiesen.",
      "Grund: {seit gestern ein dickes, rotes, warmes Bein|zunehmend verwirrt und Harnwegsinfekt|Blutzucker seit Tagen entgleist|Wunde am Fuß, die nicht heilt}.",
      "{Er} ist stabil, ein Notfall ist es nicht.",
    ],
    hergang: ["Pflegeheim, wir brauchen einen Transport für eine Bewohnerin, Einweisung vom Heimarzt, nicht dringend.", "Wir haben eine Einweisung für einen Bewohner, liegend bitte."],
    seitMin: [30, 180],
    fest: { anforderer: "normal", grund: "transport", dringlichkeit: "ohne", transportart: ["liegend", "rollstuhl"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Die Einweisung und der Pflegebrief liegen bereit.", "Die Angehörigen sind informiert."],
    verlauf: ["Du bist ruhig und sachlich, du hast die Dokumentation vor dir."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Einweisung aus dem Pflegeheim, Patient stabil", na: "nein", symptom: "kranke_person", dringlichkeit: 10, buchung: "bu_exsikkose_synkope_az_verschlechterung" }],
  },

  // ---------------------------------------------------------------- Telemedizin: Transport zur Abklärung
  {
    id: "telemed_einweisung_bauch",
    name: "Telemedizin: Bauchschmerzen zur Abklärung",
    thema: "anforderung_arzt",
    haeufigkeit: 2,
    alter: [25, 85],
    orte: ["wohnung", "haus"],
    stelle: ["zu Hause im Wohnzimmer"],
    anrufer: ["telemed"],
    geschehen: [
      "Du bist Ärztin/Arzt der Telemedizin und hast gerade mit {P} telefoniert.",
      "{Er} hat seit dem Vormittag Bauchschmerzen rechts unten, leichtes Fieber, kein Erbrechen.",
      "Das gehört heute im Krankenhaus angeschaut, aber nicht mit Blaulicht.",
    ],
    hergang: ["Telemedizin, ich brauche einen Transport zur Abklärung, Verdacht auf Blinddarm, kein Notfall."],
    seitMin: [20, 60],
    fest: { anforderer: "telemed", grund: "transport", dringlichkeit: "ohne", transportart: ["sitzend", "gehend"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Eine Rückrufnummer vom Patienten habe ich.", "Der Patient ist allein, sperrt aber selbst auf."],
    verlauf: ["Du bist ruhig und sachlich."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Verdacht auf Appendizitis, Kreislauf stabil, Schmerz mäßig", na: "nein", symptom: "bauchschmerzen", dringlichkeit: 10, buchung: "bu_akutes_abdomen" }],
  },

  // ---------------------------------------------------------------- Ärztefunkdienst: Transport, kein Notfall
  {
    id: "aerztefunk_transport",
    name: "Ärztefunkdienst: Transport ins Krankenhaus",
    thema: "anforderung_arzt",
    haeufigkeit: 2,
    alter: [65, 95],
    orte: ["wohnung", "haus"],
    stelle: ["im Schlafzimmer", "im Wohnzimmer"],
    anrufer: ["aerztefunk"],
    stunden: [17, 8],
    geschehen: [
      "Du bist vom Ärztefunkdienst und gerade bei {P} auf Visite.",
      "{Er} hat {Fieber und Schüttelfrost bei bekanntem Harnwegsinfekt|starke Schmerzen nach einem Sturz vor zwei Tagen, die Hüfte gehört geröntgt|einen Harnverhalt, der Katheter lässt sich nicht legen}.",
      "Stabil, aber heute noch ins Krankenhaus.",
    ],
    hergang: ["Ärztefunkdienst, ich brauche einen Transport für einen Patienten, Einweisung, kein Notfall."],
    seitMin: [20, 60],
    fest: { anforderer: "141", grund: "transport", dringlichkeit: "ohne", transportart: ["liegend", "sitzend"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Die Einweisung ist geschrieben.", "Der Sohn bleibt bis zum Eintreffen."],
    verlauf: ["Du bist ruhig und routiniert, du hast noch weitere Visiten."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Einweisung durch den Ärztefunkdienst, Patient stabil", na: "nein", symptom: "kranke_person", dringlichkeit: 10, buchung: "bu_exsikkose_synkope_az_verschlechterung" }],
  },

  // ---------------------------------------------------------------- Dialysestation: Patient muss ins Krankenhaus
  {
    id: "dialyse_einweisung",
    name: "Dialyse: Patient muss ins Krankenhaus",
    thema: "anforderung_arzt",
    haeufigkeit: 1,
    alter: [55, 88],
    orte: ["arzt"],
    kategorien: ["arztpraxis", "primaerversorgung"],
    tageszeit: "tag",
    stelle: ["in der Dialysestation"],
    anrufer: ["arzt", "pflege"],
    geschehen: [
      "Ein Dialysepatient hat seit gestern Fieber, der Shunt ist gerötet und überwärmt.",
      "Die Dialyse heute ist erledigt, {er} ist stabil, soll aber stationär abgeklärt werden.",
    ],
    hergang: ["Dialyse, wir brauchen einen sitzenden Transport ins Krankenhaus für einen Patienten, kein Notfall."],
    seitMin: [20, 60],
    fest: { anforderer: "normal", grund: "transport", dringlichkeit: "ohne", transportart: "sitzend", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Blutdruck 130 zu 70, Fieber 38,2.", "Der Befund liegt bei."],
    verlauf: ["Du bist ruhig und sachlich."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Verdacht auf Shuntinfekt, Fieber, Kreislauf stabil – Einweisung", na: "nein", symptom: "fieber", dringlichkeit: 10, buchung: "bu_hyperkaliaemie_akutes_nierenversagen" }],
  },

  // ---------------------------------------------------------------- Facharzt: Augenarzt schickt ins Krankenhaus
  {
    id: "facharzt_einweisung",
    name: "Facharzt-Ordination schickt Patienten ins Krankenhaus",
    thema: "anforderung_arzt",
    haeufigkeit: 1.5,
    alter: [50, 90],
    orte: ["arzt"],
    kategorien: ["arztpraxis"],
    tageszeit: "tag",
    stelle: ["im Warteraum der Ordination"],
    anrufer: ["ordi", "arzt"],
    geschehen: [
      "Der Facharzt hat bei {P} {eine tiefe Venenthrombose im Bein|einen sehr hohen Blutdruck ohne Beschwerden|eine Wundinfektion nach Operation} festgestellt.",
      "{Er} soll heute noch ins Krankenhaus, kann aber nicht selbst fahren.",
    ],
    hergang: ["Ordination, wir brauchen einen Transport für einen Patienten ins Krankenhaus, Überweisung, kein Notfall."],
    seitMin: [10, 40],
    fest: { anforderer: "normal", grund: "transport", dringlichkeit: "ohne", transportart: ["sitzend", "gehend", "rollstuhl"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Die Überweisung ist geschrieben.", "{Er} wartet im Warteraum."],
    verlauf: ["Du bist freundlich und sachlich."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Überweisung vom Facharzt, Patient stabil", na: "nein", symptom: "kranke_person", dringlichkeit: 10, buchung: "bu_hausaerztlich" }],
  },

  // ---------------------------------------------------------------- Hausarzt: dringend, aber kein Notarzt
  {
    id: "hausarzt_sofort_sitzend",
    name: "Hausarzt: heute noch, möglichst bald",
    thema: "anforderung_arzt",
    haeufigkeit: 1.5,
    alter: [40, 90],
    orte: ["arzt"],
    kategorien: ["arztpraxis", "primaerversorgung"],
    tageszeit: "tag",
    stelle: ["im Behandlungsraum"],
    anrufer: ["arzt", "ordi"],
    geschehen: [
      "{P} hat in der Ordination {einen Blutzucker von über 400 und ist sehr durstig|Blut im Harn und Fieber|ein neu aufgetretenes Vorhofflimmern mit Puls 120, aber stabil}.",
      "Es soll möglichst bald ins Krankenhaus gehen, einen Notarzt braucht es nicht.",
    ],
    hergang: ["Ordination, wir brauchen bitte möglichst bald einen Transport ins Krankenhaus, sitzend, kein Notarzt."],
    seitMin: [10, 30],
    fest: { anforderer: "normal", grund: "transport", dringlichkeit: "sofort", transportart: ["sitzend", "gehend"], bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Ein Zugang liegt.", "Der Befund wird mitgegeben."],
    verlauf: ["Du bist ruhig und sachlich."],
    varianten: [{ id: "A", p: 1, sichtung: "gelb", lage: "dringliche Einweisung vom Hausarzt, Patient stabil", na: "nein", symptom: "kranke_person", dringlichkeit: 20, buchung: "bu_exsikkose_synkope_az_verschlechterung" }],
  },

  // ================================================================ STÜRZE, DIE SCHON LÄNGER HER SIND

  // ---------------------------------------------------------------- Sturz vor Tagen, Schulter
  {
    id: "sturz_vor_tagen",
    name: "Sturz vor ein paar Tagen – Schmerzen werden schlimmer",
    thema: "sturz",
    haeufigkeit: 2.5,
    alter: [65, 92],
    orte: ["wohnung", "haus"],
    stelle: ["im Wohnzimmer", "in der Küche"],
    anrufer: ["selbst", "kind", "partner"],
    geschehen: [
      "{P} ist vor ein paar Tagen in der Wohnung gestürzt und hat sich {die Schulter|das Handgelenk|die Rippen} angeschlagen.",
      "Damals hat es nicht so weh getan, jetzt wird es immer schlimmer, {er} kann sich kaum anziehen.",
      "Am Kopf hat {er} sich nichts getan, weg war {er} nie.",
    ],
    hergang: ["{P} ist vor ein paar Tagen gestürzt, jetzt tut die Schulter immer mehr weh.", "Meine Mutter ist am Wochenende hingefallen, jetzt hat sie so Schmerzen."],
    hergangIch: ["Ich bin vor ein paar Tagen gestürzt, und jetzt tut mir die Schulter so weh."],
    seitMin: [600, 1440],
    fest: { schwer_pat: "nein", hoehe: "boden", verletzt: "ja", region: "extremitaet", blutung_stark: "nein", fehlstellung: "nein", ohnmacht: "nein", aelter6h: "ja", umstand: "keine", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Der Arm ist blau verfärbt.", "Zum Hausarzt kommt {er} allein nicht."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Schulterprellung nach Sturz vor drei Tagen, Verdacht auf Humeruskopffraktur, Kreislauf stabil", na: "nein", revers: 0.3, symptom: "schulterverletzung", dringlichkeit: 10, buchung: "bu_isolierte_extremitaetenverletzung" }],
  },

  // ---------------------------------------------------------------- Gestürzt, unverletzt, braucht Hilfe zum Aufstehen
  {
    id: "sturz_aufhelfen",
    name: "Gestürzt, unverletzt – kommt allein nicht hoch",
    thema: "sturz",
    haeufigkeit: 2.5,
    alter: [75, 96],
    orte: ["wohnung", "haus", "pflegeheim"],
    stelle: ["[ort=wohnung|haus] im Wohnzimmer", "[ort=wohnung|haus] am Gang", "[ort=pflegeheim] im Zimmer"],
    anrufer: ["partner", "selbst", "nachbar", "pflege"],
    geschehen: [
      "{P} ist beim {Umdrehen|Aufstehen vom Sessel|Gehen mit dem Rollator} langsam zu Boden gesackt.",
      "Weh tut {ihm} nichts, angeschlagen hat {er} sich nicht.",
      "Aber allein kommt {er} nicht mehr hoch, und hochheben schafft ihr es nicht.",
    ],
    hergang: ["{P} ist hingefallen, verletzt ist {er} nicht, aber ich krieg {ihn} nicht hoch.", "Mein Mann sitzt am Boden und kommt nicht mehr auf."],
    hergangIch: ["Ich bin am Boden und komm nicht mehr auf, verletzt bin ich nicht."],
    seitMin: [10, 60],
    fest: { schwer_pat: ["nein", "ja"], hoehe: "boden", verletzt: "nein", region: "extremitaet", blutung_stark: "nein", fehlstellung: "nein", ohnmacht: "nein", aelter6h: "nein", umstand: "boden_1", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Höchstens am {Knie|Ellbogen} ist eine kleine Rötung, sonst ist nichts.", "{Er} sitzt am Boden an den Kasten gelehnt.", "{Er} redet ganz normal."],
    verlauf: ["[selbst=ja] Es ist dir peinlich, dass du anrufen musst."],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "Sturz ohne Verletzung, Aufhelfen, Patient verbleibt zu Hause", na: "nein", revers: 0.8, symptom: "soziale_indikation", dringlichkeit: 10, buchung: "bu_hausaerztlich" }],
  },
];
