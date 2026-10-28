/**
 * Besondere Anrufe (Stand 0.84): Hosentaschenanruf, Scherzanruf, „bewusstlos“ aber betrunken,
 * Rauferei unter Betrunkenen, Fieber, das „sooo schlimm“ ist, Taxifahrer und Ärztefunkdienst als Anrufer.
 * Hosentasche und Scherz haben keinen Patienten – richtig ist dort: belehren bzw. auflegen und den Einsatz schließen.
 */
import type { FallVorlage } from "./faelle";

export const FAELLE_SPEZIAL: FallVorlage[] = [
  // ---------------------------------------------------------------- Hosentaschenanruf
  {
    id: "hosentasche",
    name: "Hosentaschenanruf (niemand meldet sich)",
    thema: "unklar",
    haeufigkeit: 2,
    alter: [20, 60],
    orte: ["strasse", "wohnung", "geschaeft"],
    stelle: ["unterwegs"],
    anrufer: ["passant"],
    spezial: "hosentasche",
    ohnePatient: "Es gibt keinen Notfall – das Handy hat in der Hosentasche von selbst gewählt. Niemand weiß von dem Anruf.",
    geschehen: ["Das Handy hat in der Hosentasche den Notruf gewählt. Man hört nur Rascheln und gedämpfte Geräusche."],
    hergang: ["(Rascheln)"],
    seitMin: [0, 1],
    fest: { art: "hilflos", bw: "ja", at: "normal", anzahl_patienten: "1" },
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "kein Notfall – Hosentaschenanruf", na: "nein", transport: false, dringlichkeit: 10, buchung: "" }],
  },

  // ---------------------------------------------------------------- Scherzanruf
  {
    id: "scherzanruf",
    name: "Scherzanruf (Jugendliche)",
    thema: "unklar",
    haeufigkeit: 1,
    alter: [12, 15],
    orte: ["wohnung", "strasse"],
    stelle: ["[ort=wohnung] im Kinderzimmer", "[ort=strasse] im Park"],
    anrufer: ["passant"],
    tageszeit: "tag",
    spezial: "scherz",
    ohnePatient: "Es gibt keinen Notfall – du bist ein Jugendlicher und machst mit Freunden einen Scherzanruf.",
    geschehen: [
      "Du bist 13 und machst mit zwei Freunden einen Scherzanruf beim Notruf, zum Spaß.",
      "Du erfindest einen absurden Notfall, z. B. dass dein Freund mit dem Kopf in einem Kübel steckt oder dass dein Opa vom Dach geflogen ist.",
      "Im Hintergrund kichern deine Freunde, manchmal musst du selbst lachen.",
    ],
    hergang: ["Hallo, äh … (Kichern) … mein Freund hat den Kopf in einem Kübel stecken!"],
    seitMin: [0, 2],
    fest: { art: "hilflos", bw: "ja", at: "normal", anzahl_patienten: "1" },
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "kein Notfall – Scherzanruf", na: "nein", transport: false, dringlichkeit: 10, buchung: "" }],
  },

  // ---------------------------------------------------------------- „Bewusstlos“, aber betrunken
  {
    id: "betrunken_bewusstlos",
    name: "„Bewusstlos“ gemeldet, aber betrunken",
    thema: "bewusstlos",
    haeufigkeit: 3,
    alter: [25, 65],
    geschlecht: "m",
    orte: ["strasse", "bahnhof", "geschaeft"],
    stelle: ["[ort=strasse] auf einer Parkbank", "[ort=strasse] am Gehsteig", "[ort=bahnhof] auf dem Bahnsteig", "[ort=geschaeft] vor dem Eingang"],
    anrufer: ["passant", "verkauf"],
    auchGeschlossen: true,
    stunden: [17, 7],
    geschehen: [
      "Ein Mann liegt da und rührt sich nicht. Du hast {ihn} angesprochen, aber {er} reagiert nicht – für dich ist {er} bewusstlos.",
      "Richtig wachgerüttelt hast du {ihn} noch nicht, du hast dich nicht ganz hingetraut.",
      "[variante=B] Am Hinterkopf hat er Blut in den Haaren.",
      "Er atmet, man hört ihn schnarchen.",
    ],
    hergang: ["Da liegt ein Mann und rührt sich nicht, ich glaub, der ist bewusstlos!", "Da liegt einer am Boden, der reagiert gar nicht!"],
    seitMin: [5, 30],
    fest: { hautfarbe: "nein", herzleiden: "unbekannt", bauchschmerz: "nein", bw: "nein", at: "normal", anzahl_patienten: "1" },
    wissen: { unbekannt: ["herzleiden", "diabetiker", "epilepsie"] },
    details: [
      "Neben ihm steht eine leere Weinflasche.",
      "Wenn man ihn laut anspricht und kräftig an der Schulter rüttelt, macht er die Augen auf, brummt und lallt – er riecht stark nach Alkohol.",
    ],
    verlauf: [
      "Du bist ein bisschen nervös. Erst wenn die Leitstelle dich bittet, ihn laut anzusprechen oder an der Schulter zu rütteln, merkst du: er wird wach, lallt und ist einfach betrunken – das sagst du dann erleichtert.",
    ],
    varianten: [
      { id: "A", p: 0.85, sichtung: "gelb", wahr: { bw: "getruebt", at: "normal" }, lage: "Alkoholintoxikation, auf Schmerzreiz erweckbar, lallt, Kreislauf stabil, leicht unterkühlt", na: "nein", revers: 0.3, symptom: "bewusstseinsstoerung_gcs_9_15", dringlichkeit: 20, buchung: "bu_intoxikation" },
      { id: "B", p: 0.15, sichtung: "gelb", wahr: { bw: "getruebt", at: "normal" }, lage: "Alkoholintoxikation mit Kopfplatzwunde am Hinterkopf nach Sturz, eingetrübt", na: "nein", symptom: "kopfverletzung", dringlichkeit: 20, buchung: "bu_schweres_sht" },
    ],
  },

  // ---------------------------------------------------------------- Rauferei, alle angetrunken
  {
    id: "rauferei_betrunken",
    name: "Rauferei – alle angetrunken",
    thema: "gewalt",
    haeufigkeit: 2,
    alter: [18, 35],
    geschlecht: "m",
    orte: ["lokal", "strasse"],
    stelle: ["[ort=lokal] vor dem Lokal", "[ort=strasse] bei der Bushaltestelle"],
    anrufer: ["begleiter", "passant", "wirt"],
    tageszeit: "nacht",
    auchGeschlossen: true,
    geschehen: [
      "Nach einer Feier sind mehrere Burschen aneinandergeraten, alle haben einiges getrunken.",
      "{P} hat eine Platzwunde über dem Auge, ein zweiter hält sich die Hand und sagt, sie tut weh.",
      "Jetzt ist es ruhiger, aber zwei schreien sich noch an.",
    ],
    hergang: ["Da ist eine Schlägerei, einer blutet!", "Die haben sich geprügelt, mehrere sind verletzt, alle sind besoffen!"],
    seitMin: [2, 10],
    fest: { deliktart: "koerperverletzung", taeter_vor_ort: "ja", region: "kopf", blutung_stark: "nein", fehlstellung: "nein", aelter6h: "nein", mehrere_verletzte: "ja", bw: "ja", at: "normal", anzahl_patienten: "n" },
    wissen: { ungefaehr: ["[anrufer_typ=begleiter] region", "[anrufer_typ=begleiter] mehrere_verletzte"] },
    details: ["Alle haben getrunken.", "Die Polizei ist noch nicht da.", "Einer will heimgehen."],
    verlauf: [
      "[anrufer_typ=begleiter] Du hast selbst einiges getrunken: du redest langsamer, verhaspelst dich manchmal, wiederholst dich und bist aufgeregt. Ganz klare Antworten fallen dir schwer.",
      "[anrufer_typ=passant] Du bist aufgeregt und hältst Abstand.",
      "[anrufer_typ=wirt] Du bist genervt, aber sachlich.",
    ],
    varianten: [
      { id: "A", p: 1, sichtung: "gelb", lage: "zwei leicht Verletzte, alkoholisiert: Platzwunde Augenbraue, Handprellung; beide orientiert", na: "nein", partner: [{ art: "pol", grund: "Körperverletzung, mehrere Beteiligte", eigenschutz: true }], revers: 0.3, symptom: "gesichts_kopfverletzung_augen", dringlichkeit: 10, buchung: "bu_gesichtsschaedelverletzung" },
    ],
  },

  // ---------------------------------------------------------------- Fieber, das „sooo schlimm“ ist
  {
    id: "fieber_ehemann",
    name: "Ehemann mit Fieber – „es geht ihm sooo schlecht“",
    thema: "infekt",
    haeufigkeit: 3,
    alter: [40, 75],
    geschlecht: "m",
    orte: ["wohnung", "haus"],
    stelle: ["im Schlafzimmer", "im Wohnzimmer auf der Couch"],
    anrufer: ["partner"],
    geschehen: [
      "{P} hat seit gestern Fieber, heute früh 38,6, dazu Husten und Gliederschmerzen.",
      "{Er} liegt im Bett, ist wach, trinkt Tee und redet ganz normal – aber {er} jammert die ganze Zeit.",
    ],
    hergang: ["Meinem Mann geht's sooo schlecht, er hat so hohes Fieber, bitte kommen Sie!", "Mein Mann stirbt mir noch, der hat Fieber und es geht ihm ganz furchtbar!"],
    seitMin: [600, 1800],
    fest: { anz_symptome: "mehrere", brust: "nein", sprachschw: "nein", hautfarbe: "nein", hochrisiko: "nein", bw: "ja", at: "normal", anzahl_patienten: "1" },
    details: ["Ein Fieberzäpfchen habt ihr noch nicht genommen.", "Der Hausarzt hat heute Nachmittag zu.", "Essen will er nichts, trinken schon."],
    verlauf: [
      "Du bist sehr aufgeregt und übertreibst: für dich ist es ganz schlimm („Es geht ihm sooo schlecht!“, „Er stirbt mir noch!“). Auf genaue Fragen kommt aber heraus: er ist wach, atmet normal, redet normal.",
    ],
    varianten: [
      { id: "A", p: 1, sichtung: "gruen", lage: "grippaler Infekt, Temperatur 38,6, wach, Kreislauf stabil", na: "nein", revers: 0.4, symptom: "fieber", dringlichkeit: 10, buchung: "bu_pneumonie_atemnot_copd" },
    ],
  },

  // ---------------------------------------------------------------- Taxifahrer mit Fahrgast
  {
    id: "taxi_fahrgast",
    name: "Taxifahrer: Fahrgast kollabiert",
    thema: "bewusstlos",
    haeufigkeit: 1,
    alter: [55, 85],
    orte: ["strasse", "landstrasse"],
    stelle: ["im Taxi am Straßenrand"],
    anrufer: ["taxi"],
    geschehen: [
      "Dein Fahrgast, {P}, ist während der Fahrt plötzlich ganz blass geworden und auf dem Rücksitz kurz weggesackt.",
      "Du bist sofort rechts rangefahren. Jetzt ist {er} wieder da und redet, ist aber ganz schwach und verschwitzt.",
      "Wie {er} heißt, weißt du nicht – du hast {ihn} am Bahnhof aufgenommen.",
    ],
    hergang: ["Mein Fahrgast ist im Taxi umgekippt, der war kurz weg!", "Ich hab einen Fahrgast hinten, dem ist ganz schlecht geworden, der war kurz weg!"],
    seitMin: [2, 8],
    fest: { hautfarbe: "ja", herzleiden: "unbekannt", bauchschmerz: "nein", ohnmacht: "ja", bw: "ja", at: "normal", anzahl_patienten: "1" },
    wissen: { unbekannt: ["herzleiden", "diabetiker", "epilepsie", "blutverduenner"], ungefaehr: ["alter"] },
    details: ["{Er} sagt, {er} war auf dem Weg nach Hause.", "{Er} hat seit dem Frühstück nichts gegessen, sagt {er}."],
    varianten: [
      { id: "A", p: 0.8, sichtung: "gelb", lage: "Synkope im Sitzen, jetzt wach, Blutdruck 95 zu 60, Puls 54", na: "nein", symptom: "bewusstseinsstoerung_gcs_9_15", dringlichkeit: 20, buchung: "bu_exsikkose_synkope_az_verschlechterung" },
      { id: "B", p: 0.2, sichtung: "rot", lage: "Synkope bei Bradykardie 35, AV-Block III, kaltschweißig", na: "immer", symptom: "herzrhythmusstoerung", dringlichkeit: 30, buchung: "bu_instabile_rhythmusstoerung" },
    ],
  },

  // ---------------------------------------------------------------- Ärztefunkdienst fordert an
  {
    id: "aerztefunk_einweisung",
    name: "Ärztefunkdienst: Einweisung vom Hausbesuch",
    thema: "anforderung_arzt",
    haeufigkeit: 2,
    alter: [70, 95],
    orte: ["wohnung", "haus"],
    stelle: ["im Schlafzimmer", "im Wohnzimmer"],
    anrufer: ["aerztefunk"],
    stunden: [17, 8],
    geschehen: [
      "Du bist Ärztin/Arzt vom Ärztefunkdienst (141) und gerade bei {P} auf Hausbesuch.",
      "{Er} hat seit drei Tagen Fieber und Husten, heute ist {er} schwächer und atmet schneller, Verdacht auf Lungenentzündung.",
      "Du brauchst einen Rettungswagen für den Transport ins Krankenhaus – einen Notarzt braucht es nicht.",
    ],
    hergang: ["Ärztefunkdienst, ich bin auf Hausbesuch und brauche einen Rettungswagen für eine Einweisung, Verdacht auf Pneumonie."],
    seitMin: [30, 120],
    fest: { anforderer: "normal", grund: "atmung", bw: "ja", at: "abnorm", anzahl_patienten: "1" },
    details: ["Sättigung 89 Prozent ohne Sauerstoff, Temperatur 38,9, Blutdruck 120 zu 70, Puls 104.", "Die Einweisung ist geschrieben.", "Die Tochter ist da und packt die Sachen."],
    verlauf: ["Du bist ruhig und routiniert, du sagst knapp, was du brauchst."],
    varianten: [
      { id: "A", p: 1, sichtung: "gelb", lage: "Pneumonie, Sättigung 89 %, mit Sauerstoff 94 %, stabil", na: "nein", symptom: "atemnot", dringlichkeit: 20, buchung: "bu_pneumonie_atemnot_copd" },
    ],
  },
];
