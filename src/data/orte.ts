/**
 * Orte mit Kategorien: POIs, Krankenhäuser und Dienststellen zählen alle als „Orte“.
 * Die Kategorie bestimmt, was ein Ort im Spiel bewirkt (Transportziel, Fahrzeuge, passende Notfälle …).
 * Ein POI kann mehrere Kategorien haben (im Feld „typ“, mit Komma getrennt).
 */
import type { OrtArt } from "../abfrage/szenario";
import type { Hospital, Poi, Station } from "./model";
import { store } from "./store";

export interface OrtKategorie {
  key: string;
  label: string;
  /** was die Kategorie bewirkt (Hilfetext): wer dort ist, was dort typischerweise passiert */
  wirkung: string;
  /** passende Einsatzorte in den Fallgeschichten */
  ortArt?: OrtArt;
  /** erkannte Schreibweisen im Typ-Feld */
  muster: RegExp;
  /** nur über die eigene Liste (Krankenhäuser, Dienststellen) – nicht für POIs wählbar */
  liste?: "hospitals" | "stations";
  /** Gruppe für die Anzeige (Pflege, Bildung, Sport …) */
  gruppe?: OrtGruppe;
  /** Oberbegriff („Schule“, „Sport“) – passt, wenn nichts Genaueres bekannt ist */
  allgemein?: boolean;
  /** Patientengruppe: typisches Alter der Betroffenen (von–bis) */
  alter?: [number, number];
  /** Themen der Fälle, die hier besonders oft vorkommen (Sturz, Tierbiss, Vergiftung …) */
  themen?: string[];
  /** wie oft hier ohne besonderen Grund etwas passiert (1 = normal; Steinbruch, Museum seltener) */
  haeufig?: number;
  /** nicht auf der Karte (Einsatzstelle: Strecke, Fläche oder unauffälliger Punkt wie Bahnübergang) */
  unsichtbar?: boolean;
}

export type OrtGruppe = "pflege" | "bildung" | "gesundheit" | "verkehr" | "flughafen" | "einkauf" | "sport" | "wasser" | "freizeit" | "gastro" | "arbeit" | "gelaende" | "sonstiges";
export const ORT_GRUPPEN: [OrtGruppe, string][] = [
  ["pflege", "Pflege & Betreuung"],
  ["bildung", "Kinder & Bildung"],
  ["gesundheit", "Gesundheit"],
  ["verkehr", "Verkehr"],
  ["flughafen", "Flughafen"],
  ["einkauf", "Einkauf"],
  ["sport", "Sport"],
  ["wasser", "Wasser"],
  ["freizeit", "Freizeit & Kultur"],
  ["gastro", "Gastronomie & Hotel"],
  ["arbeit", "Arbeit & Betriebe"],
  ["gelaende", "Straßen & Gelände (unsichtbar)"],
  ["sonstiges", "Sonstiges"],
];

const SENIOREN: [number, number] = [65, 100];
const k = (key: string, label: string, gruppe: OrtGruppe, ortArt: OrtArt | undefined, muster: RegExp, wirkung: string, alter?: [number, number], themen?: string[], allgemein?: boolean): OrtKategorie => ({
  key,
  label,
  gruppe,
  ...(ortArt ? { ortArt } : {}),
  muster,
  wirkung,
  ...(alter ? { alter } : {}),
  ...(themen ? { themen } : {}),
  ...(allgemein ? { allgemein } : {}),
});

/** Flughafen-Kategorien: Schlüssel = Typ im POI („flughafen_terminal“) */
function f(key: string, label: string, ortArt: OrtArt | undefined, wirkung: string, themen: string[], alter?: [number, number]): OrtKategorie {
  return k(key, label, "flughafen", ortArt, new RegExp(`^${key}$`, "i"), wirkung, alter, themen);
}
const FLUGHAFEN: OrtKategorie[] = [
  f("flughafen_terminal", "Flughafen: Terminal / Check-in", "bahnhof", "Reisende: Kollaps, Sturz mit Koffer, Brustschmerz, Unterzucker – normaler Notruf", ["bewusstlos", "sturz", "brustschmerz", "zucker", "krampf"]),
  f("flughafen_sicherheitskontrolle", "Flughafen: Sicherheitskontrolle", "bahnhof", "Reisende in der Warteschlange: Kollaps, Panik, Brustschmerz", ["bewusstlos", "psych", "brustschmerz"]),
  f("flughafen_gatebereich", "Flughafen: Gatebereich (Pier)", "bahnhof", "Wartende Passagiere: Kreislauf, Krampfanfall, verletztes Kind", ["bewusstlos", "krampf", "brustschmerz", "sturz"]),
  f("flughafen_gepaeckausgabe", "Flughafen: Gepäckausgabe", "bahnhof", "Ankommende: Sturz und Quetschung am Förderband, Kollaps nach langem Flug", ["sturz", "verletzung", "bewusstlos"]),
  f("flughafen_lounge", "Flughafen: Lounge", "lokal", "Reisende: Kollaps, Brustschmerz, Alkohol", ["bewusstlos", "brustschmerz", "vergiftung"]),
  f("flughafen_parkhaus", "Flughafen: Parkhaus", "strasse", "Reisende: Sturz, Kollaps, Unfall im Parkhaus", ["sturz", "bewusstlos", "verkehrsunfall"]),
  f("flughafen_tankstelle", "Flughafen: Tankstelle", "geschaeft", "Kollaps, Unfall an der Zapfsäule", ["bewusstlos", "verletzung"]),
  f("flughafen_flugzeug_gate", "Flughafen: Flugzeug am Gate", undefined, "Notfall an Bord eines gelandeten Flugzeugs – die Flughafen-Leitstelle ruft an", ["bewusstlos", "brustschmerz", "atemnot", "krampf", "allergie"]),
  f("flughafen_flugzeug_vorfeld", "Flughafen: Flugzeug auf Außenposition", undefined, "Notfall an Bord eines Flugzeugs auf dem Vorfeld (Passagiere mit Bus und Treppe) – die Flughafen-Leitstelle ruft an", ["bewusstlos", "brustschmerz", "atemnot", "krampf"]),
  f("flughafen_notlandung", "Flughafen: Abstellposition für Notfälle", undefined, "Angekündigter Notfall an Bord: Landung in einigen Minuten – Fahrzeuge warten am Warteort, Feuerwehr fährt mit", ["stillstand", "brustschmerz", "schwangerschaft", "schlaganfall", "atemnot", "bewusstlos"]),
  f("flughafen_hangar", "Flughafen: Hangar / Werft", undefined, "Technikpersonal: Sturz aus der Höhe, Quetschung, Schnittverletzung – die Flughafen-Leitstelle ruft an", ["sturz", "eingeklemmt", "verletzung", "blutung"], [18, 65]),
  f("flughafen_vorfeld", "Flughafen: Vorfeld (Abfertigung)", undefined, "Bodenpersonal: angefahren, Quetschung, Hitze oder Kälte – die Flughafen-Leitstelle ruft an", ["verletzung", "eingeklemmt", "hitze_kaelte", "bewusstlos"], [18, 65]),
  f("flughafen_cargo", "Flughafen: Fracht (Cargo)", undefined, "Lagerpersonal: Stapler, herabfallende Ladung, Gefahrgut – die Flughafen-Leitstelle ruft an", ["eingeklemmt", "verletzung", "gefahrstoff"], [18, 65]),
  f("flughafen_gepaecksortierung", "Flughafen: Gepäcksortierung", undefined, "Personal an der Förderanlage: Einklemmung, Rücken, Schnitt – die Flughafen-Leitstelle ruft an", ["eingeklemmt", "verletzung", "ruecken"], [18, 65]),
];

export const ORT_KATEGORIEN: OrtKategorie[] = [
  { key: "krankenhaus", label: "Krankenhaus", wirkung: "wird von Rettungsmitteln angefahren (Transportziel)", muster: /krankenhaus|klinik|spital|\bkh\b|klinikum/i, liste: "hospitals" },
  { key: "rd", label: "RD-Dienststelle", wirkung: "dort sind Rettungsmittel stationiert", muster: /^rd|rettungsdienst|rettungswache|bezirksstelle|ortsstelle/i, liste: "stations" },
  { key: "na", label: "Notarzt-/Luftrettungsstützpunkt", wirkung: "Stützpunkt für NEF oder Hubschrauber", muster: /notarzt|nef-st|luftrettung|christophorus/i, liste: "stations" },
  { key: "feuerwehr", label: "Feuerwehr", wirkung: "Feuerwehrhaus (eigene Fahrzeuge folgen später)", muster: /feuerwehr|\bff\b|\bbf\b/i },
  { key: "polizei", label: "Polizei", wirkung: "Polizeiinspektion (eigene Fahrzeuge folgen später)", muster: /polizei|\bpi\b/i },
  { key: "wasserrettung", label: "Wasserrettung", wirkung: "Wasserrettung (eigene Fahrzeuge folgen später)", muster: /wasserrettung/i },
  { key: "bergrettung", label: "Bergrettung", wirkung: "Bergrettung (eigene Fahrzeuge folgen später)", muster: /bergrettung/i },
  // ---- Pflege & Betreuung
  k("pflegeheim", "Pflegeheim", "pflege", "pflegeheim", /pflegeheim|pflegezentrum|pflege- und betreuung|betreuungszentrum|seniorenheim|seniorenzentrum|pensionistenheim|altenheim|\bpbz\b|seniorenresidenz/i, "Senioren, oft dement und bettlägerig: Stürze, Infekte/Fieber, Atemnot, Schlaganfall, Anrufe vom Pflegepersonal", [70, 100], ["sturz", "krank", "infekt", "atemnot", "schlaganfall", "anforderung_arzt", "bewusstlos", "zucker"]),
  k("betreutes_wohnen", "Betreutes Wohnen", "pflege", "pflegeheim", /betreutes wohnen|betreubares wohnen|betreute wohn|seniorenwohn/i, "Senioren in eigenen Wohnungen mit Betreuung: Stürze, Kreislauf, Notrufknopf", SENIOREN, ["sturz", "krank", "bewusstlos", "brustschmerz", "schlaganfall"]),
  k("behinderteneinrichtung", "Einrichtung für Menschen mit Behinderung", "pflege", "pflegeheim", /behinderten|lebenshilfe|beeinträchtigung|tagesstätte|werkstätte|caritas.*wohnhaus|jugend am werk/i, "Menschen mit Beeinträchtigung: Krampfanfälle, Verschlucken, Stürze, psychische Krisen", [6, 75], ["krampf", "ersticken", "sturz", "psych", "verletzung"]),
  // ---- Kinder & Bildung
  k("kinderkrippe", "Krabbelstube / Kinderkrippe", "bildung", "schule", /krabbelstube|kinderkrippe|tagesbetreuung|kleinkindbetreuung|tagesmutter/i, "Kleinkinder 0–3: Verschlucken, Fieberkrampf, Stürze, allergische Reaktion", [0, 3], ["ersticken", "krampf", "sturz", "allergie", "verletzung"]),
  k("kindergarten", "Kindergarten", "bildung", "schule", /kindergarten|\bkiga\b|\blgk\b/i, "Kinder 3–6: Stürze, Verschlucken, Fieberkrampf, Insektenstich/Allergie", [3, 6], ["sturz", "ersticken", "krampf", "allergie", "verletzung"]),
  k("volksschule", "Volksschule", "bildung", "schule", /volksschule|\bvs\b|grundschule/i, "Kinder 6–10: Sturz im Turnunterricht, Verletzungen, Allergie, Krampfanfall", [6, 10], ["sturz", "verletzung", "allergie", "krampf", "zucker"]),
  k("mittelschule", "Mittelschule / Unterstufe", "bildung", "schule", /mittelschule|\bnms\b|\bms\b|polytechnische|\bpts\b|hauptschule/i, "Kinder und Jugendliche 10–15: Sportverletzungen, Kollaps, psychische Krisen, Diabetes", [10, 15], ["verletzung", "sturz", "bewusstlos", "psych", "zucker", "allergie"]),
  k("hoehere_schule", "Höhere Schule (AHS/BHS)", "bildung", "schule", /gymnasium|\bbg\b|\bbrg\b|\bborg\b|\bhak\b|\bhas\b|\bhtl\b|\bhlw\b|\bhbla\b|fachschule|\bahs\b|\bbhs\b|höhere/i, "Jugendliche 14–19: Kollaps, Sportverletzungen, Intoxikation, psychische Krisen", [14, 19], ["bewusstlos", "verletzung", "vergiftung", "psych", "zucker", "krampf"]),
  k("berufsschule", "Berufsschule", "bildung", "schule", /berufsschule|\blbs\b/i, "Lehrlinge 15–19: Werkstattunfälle, Kollaps", [15, 19], ["verletzung", "blutung", "bewusstlos", "psych"]),
  k("sonderschule", "Sonderschule / SPZ", "bildung", "schule", /sonderschule|sonderpädagog|\bspz\b|\baso\b/i, "Kinder mit Beeinträchtigung 6–18: Krampfanfälle, Verschlucken, Stürze", [6, 18], ["krampf", "ersticken", "sturz", "verletzung"]),
  k("hochschule", "Hochschule / Universität", "bildung", "schule", /universität|hochschule|\bfh\b|fachhochschule|donau-uni|\bist austria\b|campus/i, "Studierende 18–30: Kollaps, psychische Krisen, Intoxikation", [18, 30], ["bewusstlos", "psych", "vergiftung", "krampf"]),
  k("schule", "Schule (allgemein)", "bildung", "schule", /schule|gymnasium|\bhak\b|\bhtl\b|\bbg\b|\bnms\b|\bvs\b/i, "Notfälle mit Kindern und Jugendlichen", [6, 19], ["sturz", "verletzung", "allergie", "krampf"], true),
  // ---- Gesundheit
  k("arztpraxis", "Arztpraxis", "gesundheit", "arzt", /arzt|ordination|praxis|\bordi\b|\bdr\.\s/i, "Anrufe aus der Ordination: Brustschmerz, Atemnot, allergischer Schock nach Impfung", undefined, ["anforderung_arzt", "brustschmerz", "atemnot", "allergie", "bewusstlos"]),
  k("primaerversorgung", "Primärversorgungszentrum", "gesundheit", "arzt", /primärversorgung|primaerversorgung|\bpve\b|\bpvz\b|\bpvn\b|gesundheitszentrum/i, "Anrufe aus der Ordination, auch nachmittags/abends", undefined, ["anforderung_arzt", "brustschmerz", "atemnot", "allergie", "bewusstlos"]),
  k("reha", "Reha-Zentrum / Kurhaus", "gesundheit", undefined, /reha|rehabilitation|kurhaus|kurzentrum|kuranstalt/i, "Patientinnen und Patienten nach OP, Herzinfarkt oder Schlaganfall: Herz, Kreislauf, Stürze", [40, 90], ["brustschmerz", "bewusstlos", "sturz", "schlaganfall"]),
  // ---- Verkehr
  k("bahnhof", "Bahnhof", "verkehr", "bahnhof", /bahnhof|\bbhf\b|hauptbahnhof/i, "Reisende und Pendler: Kollaps, Sturz auf Stiegen, Intoxikation, Personen im Gleis", undefined, ["bewusstlos", "sturz", "vergiftung", "psych", "verletzung"]),
  k("haltestelle", "Bahn-Haltestelle", "verkehr", "bahnhof", /haltestelle|\bhst\b/i, "kleine Bahnstation: Kollaps, Sturz", undefined, ["bewusstlos", "sturz", "verletzung"]),
  k("busbahnhof", "Busbahnhof", "verkehr", "strasse", /busbahnhof|busterminal|autobusbahnhof/i, "viele Fahrgäste: Kollaps, Sturz, Intoxikation, Unfall mit Bus", undefined, ["bewusstlos", "sturz", "vergiftung", "verkehrsunfall", "psych"]),
  k("raststation", "Autobahn-Raststation", "verkehr", "strasse", /raststation|raststätte|rasthaus|autohof/i, "Reisende, LKW-Fahrer: Kollaps, Brustschmerz, Unfälle am Parkplatz", undefined, ["bewusstlos", "brustschmerz", "verkehrsunfall"]),
  // ---- Einkauf
  k("supermarkt", "Supermarkt", "einkauf", "geschaeft", /supermarkt|billa|spar\b|eurospar|interspar|hofer|lidl|penny|unimarkt|mpreis|merkur/i, "Kundschaft jeden Alters: Kollaps an der Kassa, Sturz, Brustschmerz", undefined, ["bewusstlos", "sturz", "brustschmerz", "zucker"]),
  k("einkaufszentrum", "Einkaufszentrum / Möbelhaus", "einkauf", "geschaeft", /einkaufszentrum|shopping|center|\bez\b|fachmarktzentrum|möbel|xxxlutz|ikea|kika|leiner/i, "viele Menschen: Kollaps, Sturz auf Rolltreppe, psychische Krisen", undefined, ["bewusstlos", "sturz", "psych", "brustschmerz"]),
  k("baumarkt", "Baumarkt", "einkauf", "geschaeft", /baumarkt|obi\b|hornbach|bauhaus|hagebau|bau ?& ?garten/i, "Heimwerker: Schnittverletzung, Sturz von der Leiter, Verletzung durch Ware", undefined, ["verletzung", "blutung", "sturz"]),
  k("einkauf", "Einkauf / Geschäft (allgemein)", "einkauf", "geschaeft", /einkauf|geschäft|geschaeft|markt|shop|handel/i, "Notfälle im Geschäft", undefined, ["bewusstlos", "sturz"], true),
  // ---- Sport
  k("sportplatz", "Sportplatz / Stadion", "sport", "sport", /sportplatz|fußball|fussball|stadion|\bsv\b|\bsc\b|\bfc\b|\busv\b|arena/i, "Spieler und Zuschauer: Knie-/Sprunggelenksverletzung, Kopfverletzung, plötzlicher Herztod", [10, 70], ["verletzung", "sturz", "stillstand", "bewusstlos"]),
  k("sporthalle", "Sporthalle", "sport", "sport", /sporthalle|turnhalle|mehrzweckhalle|sportzentrum|sportcenter/i, "Hallensport: Verletzungen, Kollaps", [8, 70], ["verletzung", "sturz", "bewusstlos"]),
  k("fitnessstudio", "Fitnessstudio", "sport", "sport", /fitness|\bgym\b|kraftsport|crossfit|clever fit|mrs\.? sporty|\bjohn harris/i, "Erwachsene beim Training: Brustschmerz, Herzstillstand, Kollaps, Verletzungen", [16, 75], ["brustschmerz", "stillstand", "bewusstlos", "verletzung"]),
  k("reitanlage", "Reitanlage / Reitstall", "sport", "sport", /reit|pferd|equestrian|gestüt|pony/i, "Reiterinnen, oft Kinder und Jugendliche: Sturz vom Pferd, Huftritt, Biss", [8, 65], ["sturz", "verletzung", "tierbiss", "ruecken"]),
  k("tennis", "Tennisanlage", "sport", "sport", /tennis|padel|squash/i, "Hobbysportler, oft älter: Herz, Hitze, Sprunggelenk", [12, 80], ["brustschmerz", "stillstand", "hitze_kaelte", "verletzung"]),
  k("golf", "Golfplatz", "sport", "sport", /golf/i, "ältere Spieler: Herz, Hitze, Insektenstich, Ball an den Kopf", [30, 85], ["brustschmerz", "stillstand", "hitze_kaelte", "allergie", "verletzung"]),
  k("kletteranlage", "Kletterhalle / Hochseilgarten", "sport", "sport", /kletter|boulder|hochseil|seilgarten|klettergarten/i, "Kletterer: Absturz, Verletzungen", [8, 60], ["sturz", "verletzung", "ruecken"]),
  k("skigebiet", "Skigebiet / Lift", "sport", "sport", /skigebiet|schigebiet|skilift|schilift|bergbahn|sessellift|\bski\b|\bschi\b/i, "Wintersportler: Knochenbrüche, Kopfverletzung, Unterkühlung", [6, 75], ["verletzung", "sturz", "hitze_kaelte", "alpin"]),
  k("eislaufplatz", "Eislaufplatz / Eishalle", "sport", "sport", /eislauf|eishalle|eisarena|eisstock|kunsteis/i, "Eisläufer: Sturz, Kopf- und Handgelenksverletzungen", [6, 75], ["sturz", "verletzung"]),
  k("motorsport", "Motorsport / Kartbahn", "sport", "sport", /kart|motocross|motorsport|rennstrecke|ring\b|\bmx\b|quad/i, "Fahrer und Zuschauer: Unfälle mit hoher Energie, Einklemmung", [12, 60], ["verkehrsunfall", "verletzung", "eingeklemmt"]),
  k("sport", "Sport (allgemein)", "sport", "sport", /sport|turnhalle|fitness|tennis/i, "Sportunfälle", undefined, ["verletzung", "sturz"], true),
  // ---- Wasser
  k("freibad", "Freibad", "wasser", "wasser", /freibad|strandbad|schwimmbad|parkbad|erlebnisbad/i, "Badegäste, viele Kinder: Badeunfall, Ertrinken, Sturz, Hitze, Insektenstich", undefined, ["wasser", "sturz", "verletzung", "hitze_kaelte", "allergie"]),
  k("hallenbad", "Hallenbad", "wasser", "wasser", /hallenbad|schwimmhalle|sportbad/i, "Badegäste: Badeunfall, Sturz auf nassen Fliesen, Kollaps", undefined, ["wasser", "sturz", "bewusstlos"]),
  k("therme", "Therme", "wasser", "wasser", /therme|thermal|sauna|kurbad/i, "oft ältere Gäste: Kreislaufkollaps (Hitze, Sauna), Brustschmerz, Badeunfall", [30, 90], ["bewusstlos", "brustschmerz", "wasser", "hitze_kaelte", "sturz"]),
  k("badesee", "Badesee / Badeplatz", "wasser", "wasser", /badesee|badeteich|badeplatz|badestelle|strand|\bsee\b|teich/i, "Badegäste: Ertrinken, Kopfsprung ins Seichte, Hitze, Insektenstich", undefined, ["wasser", "verletzung", "hitze_kaelte", "allergie"]),
  k("hafen", "Hafen / Anlegestelle / Fähre", "wasser", "wasser", /hafen|marina|anlegestelle|schiffsstation|fähre|faehre|bootshaus|slip/i, "Bootsfahrer, Ausflügler, Angler: Sturz ins Wasser, Ertrinken, Unterkühlung – offenes Gewässer mit Strömung", undefined, ["wasser", "sturz", "hitze_kaelte", "verletzung"]),
  k("bad", "Bad (allgemein)", "wasser", "wasser", /\bbad\b|freibad|hallenbad|badeplatz|badesee|therme/i, "Bade- und Wasserunfälle", undefined, ["wasser"], true),
  // ---- Freizeit & Kultur
  k("freizeitpark", "Freizeitpark", "freizeit", "freizeit", /freizeitpark|familypark|erlebnispark|abenteuerpark|vergnügungspark|märchenpark/i, "Familien mit Kindern: Stürze, Verletzungen, Hitze, Kollaps", undefined, ["sturz", "verletzung", "hitze_kaelte", "bewusstlos"]),
  k("tierpark", "Tierpark / Zoo", "freizeit", "freizeit", /tierpark|wildpark|zoo|tiergarten|wildgehege|streichelzoo/i, "Familien: Tierbiss, Insektenstich, Sturz", undefined, ["tierbiss", "allergie", "sturz"]),
  k("veranstaltung", "Veranstaltungsort (Kino, Theater, Halle)", "freizeit", "freizeit", /kino|cineplexx|theater|bühne|veranstaltung|stadtsaal|festsaal|konzert|kulturhaus|arena|festgelände|messe/i, "viele Menschen: Kollaps, Intoxikation, Gedränge, Schlägerei", undefined, ["bewusstlos", "vergiftung", "psych", "gewalt", "sturz"]),
  k("museum", "Museum", "freizeit", "freizeit", /museum|ausstellung|galerie/i, "Besucher, oft älter: Kollaps, Sturz", undefined, ["bewusstlos", "sturz", "brustschmerz"]),
  k("campingplatz", "Campingplatz", "freizeit", "freizeit", /camping|zeltplatz|wohnmobil/i, "Urlauber: Verbrennung (Griller), Verletzungen, Allergie, Gasvergiftung", undefined, ["verletzung", "brand", "allergie", "vergiftung"]),
  k("ausflugsziel", "Ausflugsziel (Burg, Ruine, Warte)", "freizeit", "freizeit", /burg|ruine|schloss|warte|aussicht|stift|kloster|klamm|schlucht|wallfahrt/i, "Ausflügler: Sturz auf Wegen und Stiegen, Kollaps, Hitze", undefined, ["sturz", "bewusstlos", "hitze_kaelte", "alpin", "brustschmerz"]),
  k("freizeit", "Freizeit (allgemein)", "freizeit", "freizeit", /freizeit|spielplatz|park\b|kino|museum|veranstaltung/i, "Freizeitunfälle", undefined, ["sturz", "verletzung"], true),
  // ---- Gastronomie & Hotel
  k("disco", "Disco / Bar", "gastro", "lokal", /disco|disko|club|nightclub|\bbar\b|tanzlokal|pub/i, "junge Erwachsene, nachts: Alkoholvergiftung, Drogen, Schlägerei, Stichverletzung", [16, 35], ["vergiftung", "gewalt", "stich_schuss", "psych", "bewusstlos"]),
  k("heuriger", "Heuriger / Buschenschank", "gastro", "lokal", /heuriger|heurigen|buschenschank|weingut|weinschenke/i, "Gäste aller Altersgruppen, oft älter: Verschlucken, Kollaps, Sturz, Alkohol", undefined, ["ersticken", "bewusstlos", "sturz", "vergiftung", "brustschmerz"]),
  k("hotel", "Hotel", "gastro", "lokal", /hotel|gasthof|pension|resort/i, "Gäste: Kollaps, Brustschmerz, Sturz im Zimmer", undefined, ["bewusstlos", "brustschmerz", "sturz", "stillstand"]),
  k("lokal", "Lokal / Gastronomie (allgemein)", "gastro", "lokal", /lokal|gasthaus|restaurant|café|cafe|gastro|wirt/i, "Notfälle im Lokal, Verschlucken, Intoxikationen", undefined, ["ersticken", "vergiftung", "bewusstlos"], true),
  // ---- Arbeit & Betriebe
  k("industrie", "Industriebetrieb", "arbeit", "arbeit", /werk\b|fabrik|industrie|produktion|chemie|stahl|papier|zement/i, "Beschäftigte: Einklemmung in Maschinen, Schnitt- und Quetschverletzungen, Verätzung, Stromunfall, Brand", [16, 65], ["eingeklemmt", "verletzung", "blutung", "gefahrstoff", "strom", "brand"]),
  k("steinbruch", "Steinbruch / Schottergrube", "arbeit", "arbeit", /steinbruch|schotter|kieswerk|kiesgrube|sandgrube|bergbau/i, "Beschäftigte: Einklemmung, Absturz, schwere Verletzungen", [18, 65], ["eingeklemmt", "sturz", "verletzung"]),
  k("saegewerk", "Sägewerk / Holzbetrieb", "arbeit", "arbeit", /sägewerk|saegewerk|holzindustrie|holzwerk|zimmerei|tischlerei/i, "Beschäftigte: Schnittverletzungen bis Amputation, Einklemmung", [16, 65], ["blutung", "verletzung", "eingeklemmt"]),
  k("lagerhaus", "Lagerhaus / Landwirtschaft", "arbeit", "arbeit", /lagerhaus|\brwa\b|silo|agrar|landwirtschaft|genossenschaft|mühle/i, "Beschäftigte und Landwirte: Sturz vom Silo, Einklemmung, Gärgase", [16, 75], ["sturz", "eingeklemmt", "gefahrstoff", "verletzung"]),
  k("kraftwerk", "Kraftwerk / Umspannwerk", "arbeit", "arbeit", /kraftwerk|umspannwerk|\bevn\b|verbund|wasserkraft|heizwerk/i, "Beschäftigte: Stromunfall, Verbrennung, Gefahrstoff", [18, 65], ["strom", "brand", "gefahrstoff", "verletzung"]),
  k("arbeit", "Betrieb / Arbeitsplatz (allgemein)", "arbeit", "arbeit", /betrieb|firma|werk\b|fabrik|industrie|lager/i, "Arbeitsunfälle", [16, 65], ["verletzung", "eingeklemmt"], true),
  // ---- Flughafen (Wien-Schwechat): Passagierbereiche wie ein Bahnhof (normaler Notruf), Flugzeuge und
  //      Arbeitsbereiche nur über eigene Fälle (der Flughafen ruft an)
  ...FLUGHAFEN,
  // ---- Sonstiges
  k("landeplatz", "Hubschrauber-Landeplatz / Flugplatz", "sonstiges", undefined, /lande|heli|hubschrauber|flugplatz|flughafen|flugfeld/i, "Landemöglichkeit für Hubschrauber"),
  k("sonstiges", "Sonstiges", "sonstiges", undefined, /^$/, "nur als Ort auf der Karte"),
  // ---- Straßen & Gelände: Einsatzstellen, die nicht auf der Karte stehen (Strecken und Flächen als viele Punkte)
  u("autobahn", "Autobahn / Schnellstraße", "autobahn", "Auffahrunfall, Falschfahrer, Panne mit Personenschaden – Anrufer nennt Kilometer und Fahrtrichtung", ["verkehrsunfall", "brustschmerz", "bewusstlos"]),
  u("landstrasse", "Landstraße außerorts", "landstrasse", "schwere Unfälle mit hoher Geschwindigkeit (Baum, Frontal, Motorrad), Wildunfall", ["verkehrsunfall"]),
  u("feldweg", "Feld- oder Forstweg", "feldweg", "Spaziergänger, Landwirte, Radfahrer: Sturz, Kollaps, Hundebiss", ["sturz", "bewusstlos", "tierbiss", "verletzung"]),
  u("radweg", "Radweg (Donauradweg …)", "feldweg", "Radfahrer: Sturz, Kopfverletzung, Kollaps bei Hitze", ["sturz", "verletzung", "hitze_kaelte", "bewusstlos"]),
  u("wald", "Wald", "wald", "Forstarbeit, Wanderer, Pilzesammler: Baum, Sturz, verirrt", ["eingeklemmt", "sturz", "alpin", "tierbiss"]),
  u("berg", "Berg / Gipfel / Bergweg", "berg", "Wanderer, Bergsteiger: Absturz, Erschöpfung, Herz – Bergrettung", ["alpin", "sturz", "brustschmerz", "hitze_kaelte"]),
  u("ufer", "Fluss- oder Seeufer", "ufer", "Badende, Angler, Bootsfahrer: Person im Wasser – Wasserrettung", ["wasser", "sturz", "hitze_kaelte"]),
  u("weinberg", "Weingarten", "feld", "Lese und Arbeit im Weingarten: Sturz, Hitze, Traktor", ["sturz", "hitze_kaelte", "eingeklemmt", "allergie"]),
  u("feld", "Feld / Acker", "feld", "Landwirtschaft: Traktor, Maschinen, Hitze", ["eingeklemmt", "verletzung", "hitze_kaelte"]),
  u("bahnuebergang", "Bahnübergang", undefined, "Zug gegen Auto, Fußgänger oder Radfahrer – ÖBB verständigen (Strecke sperren)", ["verkehrsunfall"]),
  u("bruecke", "Brücke", undefined, "Sprung oder Sturz von der Brücke, Person im Fluss – Polizei, Feuerwehr, Wasserrettung", ["psych", "wasser", "verkehrsunfall"]),
  u("tunnel", "Tunnel", undefined, "Unfall oder Brand im Tunnel – Feuerwehr, Zufahrt erfragen", ["verkehrsunfall", "brand"]),
  u("anschlussstelle", "Autobahn-Anschlussstelle", undefined, "Auffahrt/Abfahrt: Auffahrunfall, Falschfahrer", ["verkehrsunfall"]),
  u("kreisverkehr", "Kreisverkehr", undefined, "Rad- und Mopedunfälle, Auffahrunfälle", ["verkehrsunfall"]),
  u("kreuzung", "Kreuzung außerorts", undefined, "Seitenaufprall bei hoher Geschwindigkeit", ["verkehrsunfall"]),
  u("kellergasse", "Kellergasse / Weinkeller", undefined, "Gärgas (CO₂) im Keller während der Lese, Stürze auf Kellerstiegen – Eigenschutz! Feuerwehr mit Atemschutz", ["gefahrstoff", "sturz", "bewusstlos"]),
  u("hochstand", "Hochstand", undefined, "Jäger: Sturz vom Hochstand, Jagdunfall – oft im Wald ohne Adresse", ["sturz", "stich_schuss"]),
  u("windrad", "Windrad", undefined, "Techniker in großer Höhe: Herz, Sturz – Höhenrettung (Feuerwehr)", ["brustschmerz", "sturz", "bewusstlos"]),
  u("sendemast", "Sendemast", undefined, "Techniker in großer Höhe – Höhenrettung (Feuerwehr)", ["sturz", "bewusstlos"]),
  u("biogasanlage", "Biogasanlage", undefined, "Gase (Schwefelwasserstoff), Einklemmung – Feuerwehr mit Atemschutz", ["gefahrstoff", "eingeklemmt"]),
  u("kletterfels", "Kletterfelsen", undefined, "Kletterer: Absturz – Bergrettung", ["alpin", "sturz"]),
  u("klettersteig", "Klettersteig", undefined, "Absturz, Blockierung im Steig – Bergrettung, Hubschrauber mit Tau", ["alpin", "sturz"]),
];

/** Einsatzstelle ohne Kartenpunkt */
function u(key: string, label: string, ortArt: OrtArt | undefined, wirkung: string, themen: string[]): OrtKategorie {
  return { ...k(key, label, "gelaende", ortArt, /^$/, wirkung, undefined, themen), unsichtbar: true };
}

/** Seltener ohne besonderen Grund (sonst wären Steinbrüche und Museen so häufig wie Betriebe und Geschäfte) */
const HAEUFIG: Record<string, number> = {
  flughafen_terminal: 0.5,
  flughafen_sicherheitskontrolle: 0.3,
  flughafen_gatebereich: 0.4,
  flughafen_gepaeckausgabe: 0.3,
  flughafen_lounge: 0.3,
  flughafen_parkhaus: 0.3,
  flughafen_tankstelle: 0.2,
  steinbruch: 0.3, kraftwerk: 0.3, saegewerk: 0.6, lagerhaus: 0.5, museum: 0.5, ausflugsziel: 0.6, golf: 0.6, campingplatz: 0.7, hochschule: 0.7, raststation: 0.6 };
for (const x of ORT_KATEGORIEN) if (HAEUFIG[x.key]) x.haeufig = HAEUFIG[x.key];

export const POI_KATEGORIEN = ORT_KATEGORIEN.filter((x) => !x.liste);
/** Zum Erkennen aus Text: genaue Kategorien vor den Oberbegriffen */
const ERKENNUNG = [...POI_KATEGORIEN.filter((x) => !x.allgemein && !x.unsichtbar), ...POI_KATEGORIEN.filter((x) => x.allgemein)];

export function ortKategorie(key: string): OrtKategorie | undefined {
  return NACH_KEY.get(key);
}

const NACH_KEY = new Map(ORT_KATEGORIEN.map((k) => [k.key, k]));

export function kategorieLabel(key: string): string {
  return NACH_KEY.get(key)?.label ?? key;
}

/** Kategorien eines POI aus seinem Typ-Feld („Schule, Sport“ → ["schule","sport"]); Unbekanntes → „sonstiges“ */
const katCache = new WeakMap<object, string[]>();
export function poiKategorien(p: Pick<Poi, "typ" | "name">): string[] {
  const c = katCache.get(p);
  if (c) return c;
  const r = poiKategorienNeu(p);
  katCache.set(p, r);
  return r;
}
function poiKategorienNeu(p: Pick<Poi, "typ" | "name">): string[] {
  const teile = (p.typ ?? "")
    .split(/[,;/|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = new Set<string>();
  for (const t of teile) {
    const k = ORT_KATEGORIEN.find((x) => x.key === t.toLowerCase() || x.label.toLowerCase() === t.toLowerCase()) ?? ERKENNUNG.find((x) => x.muster.test(t));
    out.add(k && !k.liste ? k.key : "sonstiges");
  }
  if (!out.size) {
    // kein Typ: aus dem Namen raten
    const k = ERKENNUNG.find((x) => x.key !== "sonstiges" && x.muster.test(p.name ?? ""));
    out.add(k?.key ?? "sonstiges");
  }
  if (out.size > 1) out.delete("sonstiges");
  return [...out];
}

/** Kategorien als Typ-Text zum Speichern */
export function kategorienText(keys: string[], eigen = ""): string {
  const l = keys.filter((k) => k !== "sonstiges").map(kategorieLabel);
  if (eigen.trim()) l.push(eigen.trim());
  return l.join(", ");
}

export function stationKategorien(s: Pick<Station, "typ" | "name">): string[] {
  const t = `${s.typ}`.toLowerCase();
  if (/luftrettung|notarzt/.test(t)) return ["na"];
  if (/feuerwehr/.test(t)) return ["feuerwehr"];
  if (/polizei/.test(t)) return ["polizei"];
  if (/wasserrettung/.test(t)) return ["wasserrettung"];
  if (/bergrettung/.test(t)) return ["bergrettung"];
  if (/rettungsdienst/.test(t)) return ["rd"];
  return ["sonstiges"];
}

export interface Ort {
  /** stellen = unsichtbare Einsatzstelle (Strecke, Fläche, Bahnübergang …) */
  kind: "pois" | "hospitals" | "stations" | "stellen";
  id: string;
  name: string;
  ort: string;
  lat: number;
  lon: number;
  kategorien: string[];
  /** nur bei Einsatzstellen: Straße/Kilometer, Wald … */
  stelle?: import("./einsatzstellen").Einsatzstelle;
}

let orteCache: { quellen: unknown[]; orte: Ort[] } | null = null;
/** Alle Orte: POIs, Krankenhäuser und Dienststellen (zwischengespeichert, bis sich die Listen ändern) */
export function alleOrte(): Ort[] {
  const quellen = [store.list("pois"), store.list("hospitals"), store.list("stations")];
  if (orteCache && orteCache.quellen.every((q, i) => q === quellen[i])) return orteCache.orte;
  const orte = [
    ...store.list("pois").map((p: Poi): Ort => ({ kind: "pois", id: p.id, name: p.name, ort: p.ort, lat: p.lat, lon: p.lon, kategorien: poiKategorien(p) })),
    ...store.list("hospitals").map((h: Hospital): Ort => ({ kind: "hospitals", id: h.id, name: h.name, ort: h.ort, lat: h.lat, lon: h.lon, kategorien: ["krankenhaus"] })),
    ...store.list("stations").map((s: Station): Ort => ({ kind: "stations", id: s.id, name: s.name, ort: s.ort, lat: s.lat, lon: s.lon, kategorien: stationKategorien(s) })),
  ];
  orteCache = { quellen, orte };
  return orte;
}

/** Orte einer Kategorie */
export function orteMit(key: string): Ort[] {
  return alleOrte().filter((o) => o.kategorien.includes(key));
}

/** Passende POI-Kategorien für einen Einsatzort der Fallgeschichten – nach Alter des Patienten (Kleinkind → Krabbelstube/Kindergarten) */
export function kategorienFuerOrtArt(art: OrtArt, alter?: number | null): string[] {
  const alle = POI_KATEGORIEN.filter((x) => x.ortArt === art);
  if (typeof alter !== "number") return alle.map((x) => x.key);
  // nur Orte, an denen Menschen dieses Alters sind (kein 83-Jähriger im Steinbruch)
  return alle.filter((x) => !x.alter || (alter >= x.alter[0] - 1 && alter <= x.alter[1] + 2)).map((x) => x.key);
}

/**
 * Gewicht eines Orts für einen Fall: genaue Kategorien mit passendem Thema (Tierbiss → Tierpark, Reitanlage)
 * und passendem Alter zählen mehr. 0 = passt gar nicht.
 */
export function ortGewicht(kategorien: string[], thema: string | null | undefined, alter: number | null | undefined): number {
  let best = 0;
  for (const key of kategorien) {
    const kat = NACH_KEY.get(key);
    if (!kat) continue;
    let w = (kat.allgemein ? 0.6 : 1) * (kat.haeufig ?? 1);
    if (thema && kat.themen?.includes(thema)) w *= 4;
    if (typeof alter === "number" && kat.alter) w *= alter >= kat.alter[0] - 1 && alter <= kat.alter[1] + 2 ? 1.5 : 0.1;
    best = Math.max(best, w);
  }
  return best;
}
