/**
 * Einsatzprofil je Ortskategorie (POI): Wer ruft dort an, wo genau ist der Patient, welche Partner braucht es,
 * was sollte der Disponent wissen. Ein Freibad ist kein Badesee (Bademeister, keine Wasserrettung), ein Bahnhof
 * keine Bushaltestelle (ÖBB, Oberleitung), ein Museum kein Tierpark (Aufsicht statt Tierpfleger).
 *
 * „stelle“ ersetzt die Stelle der Fallgeschichte, wenn deren Stellen nicht zum Ort passen („stelleMuster“).
 */
import type { AnruferTyp } from "../abfrage/szenario";
import type { PartnerArt } from "../sim/partner";
import { stellen } from "./einsatzstellen";
import { alleOrte, ortKategorie } from "./orte";

export interface OrtProfil {
  /** wer hier anruft (vorne = häufiger); Personal des Ortes kommt dazu, wenn die Geschichte Fremde erlaubt */
  anrufer?: AnruferTyp[];
  /** Rolle des Anrufers an diesem Ort („Bademeister im Freibad“) */
  rollen?: Partial<Record<AnruferTyp, string>>;
  /** wo genau der Patient ist */
  stelle?: string[];
  /** Stellen der Fallgeschichte, die hierher passen (sonst gilt „stelle“) */
  stelleMuster?: RegExp;
  /** was der Anrufer zur Umgebung weiß (Zufahrt, Treffpunkt) */
  umgebung?: string[];
  /** Hinweis für den Disponenten */
  hinweis?: string;
  /** Bademeister holt die Person heraus: keine Wasserrettung */
  ohneWasserrettung?: boolean;
  /** offenes Gewässer: Person im Wasser → Wasserrettung (und Feuerwehr) */
  offenesWasser?: boolean;
  /** zusätzliche Partner bei bestimmten Themen */
  partner?: { art: PartnerArt; grund: string; themen: string[]; blockiert?: boolean }[];
}

/** Personal eines Ortes (darf anrufen, wenn die Geschichte auch Fremde anrufen lässt) */
export const PERSONAL: AnruferTyp[] = ["bahnpersonal", "busfahrer", "tierpfleger", "aufsicht", "rezeption", "bademeister", "verkauf", "wirt", "trainer", "lehrer", "kollege"];

const BAHN_PARTNER: OrtProfil["partner"] = [
  { art: "pol", grund: "Unfall im Bahnbereich", themen: ["verletzung", "eingeklemmt", "verkehrsunfall"] },
  { art: "fw", grund: "Bahnunfall – Oberleitung erden, technische Rettung", themen: ["eingeklemmt", "strom"], blockiert: true },
];
const BAD: Pick<OrtProfil, "ohneWasserrettung" | "stelleMuster"> = { ohneWasserrettung: true, stelleMuster: /freibad|hallenbad|becken|bad\b|rutsche|sprungturm|liegewiese|sauna|therme|dusche/i };
const OFFEN: Pick<OrtProfil, "offenesWasser" | "stelleMuster" | "partner"> = {
  offenesWasser: true,
  stelleMuster: /see\b|steg|ufer|teich|strand|fluss|donau|anlege|boot|wasser/i,
  partner: [{ art: "fw", grund: "Person im Wasser – Wasserdienst/Taucher", themen: ["wasser"], blockiert: true }],
};
const SCHULE: OrtProfil = { anrufer: ["lehrer"], stelle: ["im Klassenzimmer", "im Turnsaal", "im Schulhof", "auf der Stiege im Schulhaus", "in der Garderobe"], umgebung: ["Haupteingang, jemand von der Schule wartet dort"] };
const ARBEIT_UMGEBUNG = ["beim Werkstor – der Portier zeigt den Weg", "Zufahrt über das Werksgelände"];

export const ORT_PROFIL: Record<string, OrtProfil> = {
  // ---- Verkehr
  bahnhof: {
    anrufer: ["bahnpersonal", "passant", "begleiter", "selbst"],
    rollen: { bahnpersonal: "Mitarbeiter der ÖBB am Bahnhof" },
    stelle: ["am Bahnsteig {1|2|3}", "in der Bahnhofshalle", "auf der Stiege in der Unterführung", "im Zug, der gerade am Bahnsteig steht", "beim Fahrkartenautomaten"],
    stelleMuster: /bahnsteig|bahnhof|zug|gleis|unterführung/i,
    umgebung: ["Zufahrt über den Bahnhofsvorplatz"],
    hinweis: "Bahnhof: Liegt jemand im Gleis oder unter dem Zug – Polizei, Feuerwehr (Oberleitung erden) und ÖBB-Betriebsführung (Strecke sperren) verständigen",
    partner: BAHN_PARTNER,
  },
  haltestelle: {
    anrufer: ["passant", "begleiter", "selbst"],
    stelle: ["am Bahnsteig der Haltestelle", "im Wartehäuschen der Haltestelle", "beim Übergang zum Bahnsteig"],
    stelleMuster: /bahnsteig|haltestelle|zug|gleis/i,
    hinweis: "Bahn-Haltestelle ohne Personal: Bei Person im Gleis ÖBB-Betriebsführung verständigen (Strecke sperren), Polizei",
    partner: BAHN_PARTNER,
  },
  busbahnhof: {
    anrufer: ["busfahrer", "passant", "selbst", "begleiter"],
    rollen: { busfahrer: "Busfahrerin am Busbahnhof" },
    stelle: ["am Busbahnhof bei Steig {2|4|5}", "im Bus am Busbahnhof", "im Wartebereich des Busbahnhofs"],
    stelleMuster: /bus/i,
    hinweis: "Busbahnhof: viele Busse und Fahrgäste – Zufahrt und Steig erfragen",
  },
  // ---- Flughafen Wien: Passagierbereiche (normaler Notruf); Flugzeuge und Arbeitsbereiche: die Flughafen-Leitstelle ruft an
  flughafen_terminal: {
    anrufer: ["begleiter", "passant", "verkauf", "selbst"],
    rollen: { verkauf: "Mitarbeiterin am Info-Schalter im Terminal" },
    stelle: ["in der Check-in-Halle", "bei den Check-in-Schaltern", "bei der Gepäckaufgabe", "vor dem Eingang zum Terminal", "beim Info-Schalter"],
    stelleMuster: /terminal|check-in|halle|schalter|flughafen/i,
    umgebung: ["Zufahrt über die Abflugebene vor dem Terminal"],
    hinweis: "Flughafen: Flughafenambulanz (RTW, NAW) ist am Gelände – Fahrzeuge von außen 1 Minute Sicherheitskontrolle",
  },
  flughafen_sicherheitskontrolle: {
    anrufer: ["passant", "begleiter", "verkauf"],
    rollen: { verkauf: "Mitarbeiter der Sicherheitskontrolle" },
    stelle: ["in der Warteschlange vor der Sicherheitskontrolle", "direkt an der Sicherheitskontrolle", "hinter der Sicherheitskontrolle"],
    stelleMuster: /kontrolle|schlange|flughafen/i,
    hinweis: "Flughafen: Sicherheitsbereich – Flughafenambulanz ist am schnellsten dort",
  },
  flughafen_gatebereich: {
    anrufer: ["begleiter", "passant", "verkauf", "selbst"],
    rollen: { verkauf: "Mitarbeiterin am Gate" },
    stelle: ["im Wartebereich beim Gate", "beim Boarding am Gate", "in einem Café im Pier", "auf dem Weg zum Gate"],
    stelleMuster: /gate|pier|warte|flughafen/i,
    hinweis: "Flughafen: Gatebereich im Sicherheitsbereich – Flughafenambulanz ist am schnellsten dort",
  },
  flughafen_gepaeckausgabe: {
    anrufer: ["begleiter", "passant", "verkauf", "selbst"],
    rollen: { verkauf: "Mitarbeiter beim Gepäckservice" },
    stelle: ["beim Gepäckband", "in der Ankunftshalle", "beim Ausgang aus der Gepäckausgabe"],
    stelleMuster: /gepäck|band|ankunft|flughafen/i,
    hinweis: "Flughafen: Ankunftsbereich – Flughafenambulanz ist am Gelände",
  },
  flughafen_lounge: {
    anrufer: ["wirt", "begleiter", "passant"],
    rollen: { wirt: "Mitarbeiterin der Lounge" },
    stelle: ["in der Lounge", "am Buffet in der Lounge", "im Ruhebereich der Lounge"],
    stelleMuster: /lounge|flughafen/i,
  },
  flughafen_parkhaus: {
    anrufer: ["passant", "begleiter", "selbst"],
    stelle: ["im Parkhaus auf Ebene {1|2|3|4}", "bei den Liften im Parkhaus", "bei der Ausfahrt aus dem Parkhaus"],
    stelleMuster: /parkhaus|ebene|flughafen/i,
  },
  flughafen_tankstelle: {
    anrufer: ["verkauf", "passant", "selbst"],
    rollen: { verkauf: "Mitarbeiter der Tankstelle" },
    stelle: ["an der Zapfsäule", "im Tankstellenshop", "beim Waschplatz"],
    stelleMuster: /tank|zapf|shop|flughafen/i,
  },
  flughafen_flugzeug_gate: {
    stelle: ["an Bord des Flugzeugs am Gate"],
    hinweis: "Flughafen: Notfall an Bord – Zugang über die Fluggastbrücke, Flughafenambulanz ist am Gelände",
  },
  flughafen_flugzeug_vorfeld: {
    stelle: ["an Bord des Flugzeugs auf der Außenposition"],
    hinweis: "Flughafen: Flugzeug auf Außenposition – Zugang über die Treppe, Fahrzeuge von außen 1 Minute Sicherheitskontrolle",
  },
  flughafen_notlandung: {
    stelle: ["an Bord des gelandeten Flugzeugs"],
    hinweis: "Angekündigter Notfall an Bord: Fahrzeuge warten am Warteort bei der Feuerwehr-Wache 1, bis das Flugzeug an der Abstellposition steht – Feuerwehr immer mitalarmieren",
    partner: [{ art: "fw", grund: "angekündigter Notfall an Bord – Feuerwehr fährt immer mit", themen: ["bauch", "allergie", "atemnot", "stillstand", "brustschmerz", "ersticken", "krampf", "zucker", "kopfschmerz", "herz", "blutung", "vergiftung", "schwangerschaft", "psych", "krank", "schlaganfall", "verletzung", "bewusstlos", "unklar", "infekt", "sturz"] }],
  },
  flughafen_hangar: {
    stelle: ["im Hangar", "auf einer Arbeitsbühne im Hangar", "in der Werkstatt der Werft"],
    hinweis: "Flughafen: Arbeitsunfall im Hangar – Zufahrt über das Werft-Vorfeld",
  },
  flughafen_vorfeld: {
    stelle: ["auf dem Vorfeld bei einer Parkposition", "beim Gepäckwagen auf dem Vorfeld"],
    hinweis: "Flughafen: Vorfeld – Flughafenambulanz ist am schnellsten dort",
  },
  flughafen_cargo: {
    stelle: ["in der Frachthalle", "an der Laderampe der Frachthalle"],
    hinweis: "Flughafen: Fracht – bei Gefahrgut Feuerwehr",
  },
  flughafen_gepaecksortierung: {
    stelle: ["an der Gepäcksortieranlage unter dem Terminal"],
    hinweis: "Flughafen: Gepäcksortierung im Untergeschoß – Zugang zeigt das Personal",
  },
  raststation: {
    anrufer: ["verkauf", "lenker", "passant", "begleiter"],
    rollen: { verkauf: "Mitarbeiterin der Raststation", lenker: "LKW-Fahrer auf dem Rastplatz" },
    stelle: ["im Raststättenrestaurant", "auf dem LKW-Parkplatz", "bei den Zapfsäulen", "auf der Toilette der Raststation", "im LKW auf dem Rastplatz"],
    stelleMuster: /rast|tankstelle|parkplatz|lkw/i,
    umgebung: ["an der Autobahn – nur aus einer Fahrtrichtung erreichbar"],
    hinweis: "Autobahn-Raststation: Anfahrt nur über die Richtungsfahrbahn – Fahrtrichtung erfragen; bei Unfall Autobahnpolizei",
    partner: [{ art: "pol", grund: "Unfall an der Autobahn", themen: ["verkehrsunfall"] }],
  },
  // ---- Wasser
  freibad: {
    ...BAD,
    anrufer: ["bademeister", "eltern", "begleiter"],
    rollen: { bademeister: "Bademeister im Freibad" },
    stelle: ["am Beckenrand beim Schwimmerbecken", "beim Nichtschwimmerbecken", "auf der Liegewiese", "bei der Rutsche", "beim Sprungturm"],
    umgebung: ["Zufahrt über den Wirtschaftseingang, der Bademeister wartet dort"],
    hinweis: "Freibad: Bademeister vor Ort, die Person ist meist schon aus dem Wasser – keine Wasserrettung nötig. Kopfsprung ins Seichte → an die Wirbelsäule denken",
  },
  hallenbad: {
    ...BAD,
    anrufer: ["bademeister", "begleiter", "eltern"],
    rollen: { bademeister: "Bademeisterin im Hallenbad" },
    stelle: ["am Beckenrand", "auf den Fliesen beim Becken", "in der Dusche", "in der Sauna"],
    umgebung: ["Haupteingang, der Bademeister holt die Rettung ab"],
    hinweis: "Hallenbad: Bademeister vor Ort, keine Wasserrettung nötig; rutschige Fliesen",
  },
  therme: {
    ...BAD,
    anrufer: ["bademeister", "begleiter", "partner"],
    rollen: { bademeister: "Bademeisterin in der Therme" },
    stelle: ["im Thermalbecken", "in der Sauna", "im Ruheraum", "am Beckenrand im Außenbecken"],
    umgebung: ["Zufahrt zum Personaleingang, jemand wartet dort"],
    hinweis: "Therme: Bademeister vor Ort, keine Wasserrettung; oft Kreislauf (Hitze, Sauna) bei älteren Gästen",
  },
  badesee: {
    ...OFFEN,
    anrufer: ["passant", "eltern", "begleiter", "partner"],
    stelle: ["am Ufer beim Steg", "auf der Liegewiese am See", "im Wasser, etwa 20 Meter vom Ufer", "beim Badesteg"],
    hinweis: "Offenes Gewässer: Ist die Person noch im Wasser – Wasserrettung und Feuerwehr (Wasserdienst) mitalarmieren",
  },
  hafen: {
    ...OFFEN,
    anrufer: ["passant", "begleiter", "partner"],
    stelle: ["an der Anlegestelle", "auf einem Boot im Hafen", "beim Slip", "bei der Fähre"],
    hinweis: "Offenes Gewässer (Strömung!): Ist die Person im Wasser – Wasserrettung und Feuerwehr (Wasserdienst) mitalarmieren",
  },
  // ---- Freizeit & Kultur
  museum: {
    anrufer: ["aufsicht", "begleiter", "partner"],
    rollen: { aufsicht: "Aufsicht im Museum" },
    stelle: ["in der Ausstellung im {1.|2.} Stock", "auf der Stiege im Museum", "im Museumscafé", "beim Eingang an der Kassa"],
    umgebung: ["Haupteingang, die Aufsicht holt die Rettung dort ab"],
    hinweis: "Museum: Aufsicht vor Ort, oft Stiegen ohne Lift",
  },
  tierpark: {
    anrufer: ["tierpfleger", "eltern", "begleiter"],
    rollen: { tierpfleger: "Tierpflegerin im Tierpark" },
    stelle: ["beim Streichelgehege", "beim Wildschweingehege", "am Spielplatz im Tierpark", "beim Eingang des Tierparks"],
    umgebung: ["Zufahrt über den Wirtschaftsweg, ein Tierpfleger zeigt den Weg"],
    hinweis: "Tierpark: Bei Tierbiss – ist das Tier gesichert? Tierart erfragen (Tollwut, Gift)",
  },
  freizeitpark: {
    anrufer: ["eltern", "begleiter", "aufsicht"],
    rollen: { aufsicht: "Mitarbeiter im Freizeitpark" },
    stelle: ["bei einer Rutsche", "beim Karussell", "am Spielplatz", "beim Eingang"],
    umgebung: ["Personaleingang, ein Mitarbeiter wartet dort"],
  },
  veranstaltung: {
    anrufer: ["aufsicht", "begleiter", "passant"],
    rollen: { aufsicht: "Ordner bei der Veranstaltung" },
    stelle: ["im Saal", "vor der Bühne", "im Foyer", "auf der Toilette", "beim Ausgang"],
    hinweis: "Veranstaltung: viele Menschen – Zufahrt und Treffpunkt mit dem Ordnerdienst ausmachen",
  },
  campingplatz: {
    anrufer: ["begleiter", "partner", "rezeption"],
    rollen: { rezeption: "Platzwart am Campingplatz" },
    stelle: ["beim Wohnwagen", "im Zelt", "beim Sanitärgebäude", "an der Rezeption"],
    umgebung: ["Schranken bei der Einfahrt, der Platzwart macht auf"],
  },
  ausflugsziel: {
    anrufer: ["begleiter", "partner", "passant"],
    stelle: ["auf dem Weg hinauf", "auf der Aussichtswarte", "im Burghof", "auf den Stufen"],
    umgebung: ["Zufahrt nur über einen schmalen Weg"],
    hinweis: "Ausflugsziel: Zufahrt oft eng oder nur zu Fuß – Tragehilfe/Bergrettung bedenken",
  },
  // ---- Gastronomie & Hotel
  disco: {
    anrufer: ["begleiter", "wirt", "passant"],
    rollen: { wirt: "Security in der Disco" },
    stelle: ["auf der Toilette", "vor dem Eingang", "auf der Tanzfläche", "auf dem Parkplatz"],
    hinweis: "Disco: oft Alkohol/Drogen, Gewalt – auf Eigenschutz achten, ggf. Polizei",
  },
  heuriger: {
    anrufer: ["wirt", "begleiter", "partner"],
    rollen: { wirt: "Heurigenwirtin" },
    stelle: ["im Heurigengarten", "in der Stube", "auf der Kellerstiege", "auf der Toilette"],
  },
  hotel: {
    anrufer: ["rezeption", "partner", "begleiter"],
    rollen: { rezeption: "Mitarbeiterin an der Hotelrezeption" },
    stelle: ["im Hotelzimmer {204|112|318}", "im Frühstücksraum", "in der Lobby", "im Wellnessbereich"],
    umgebung: ["die Rezeption zeigt den Weg zum Zimmer"],
  },
  // ---- Sport
  sportplatz: { anrufer: ["trainer", "begleiter", "passant"], stelle: ["am Spielfeld", "in der Kabine", "auf der Tribüne"], umgebung: ["Zufahrt über den Parkplatz beim Vereinshaus"] },
  sporthalle: { anrufer: ["trainer", "begleiter"], stelle: ["in der Halle", "in der Garderobe", "auf der Tribüne"] },
  fitnessstudio: { anrufer: ["trainer", "begleiter"], rollen: { trainer: "Trainer im Fitnessstudio" }, stelle: ["auf dem Laufband", "bei den Hanteln", "in der Garderobe"] },
  reitanlage: {
    anrufer: ["trainer", "begleiter", "eltern"],
    rollen: { trainer: "Reitlehrerin" },
    stelle: ["in der Reithalle", "auf dem Reitplatz", "im Stall", "auf der Koppel"],
    hinweis: "Reitanlage: Zufahrt oft über Feldweg; ist das Pferd gesichert?",
  },
  tennis: { anrufer: ["begleiter", "trainer"], stelle: ["am Tennisplatz", "im Clubhaus"] },
  golf: { anrufer: ["begleiter", "trainer"], rollen: { trainer: "Mitarbeiter des Golfclubs" }, stelle: ["am Grün von Loch {4|7|12}", "beim Clubhaus", "auf der Driving Range"], hinweis: "Golfplatz: Patient oft weit vom Clubhaus – Treffpunkt ausmachen, Golfcart" },
  kletteranlage: { anrufer: ["trainer", "begleiter"], rollen: { trainer: "Trainer in der Kletterhalle" }, stelle: ["an der Kletterwand", "im Boulderbereich", "im Hochseilgarten"] },
  skigebiet: { anrufer: ["begleiter", "passant", "trainer"], rollen: { trainer: "Liftwart" }, stelle: ["auf der Piste", "bei der Liftstation", "in der Schihütte"], hinweis: "Skigebiet: Pistenrettung und Lift – Treffpunkt Talstation" },
  eislaufplatz: { anrufer: ["begleiter", "eltern", "aufsicht"], rollen: { aufsicht: "Platzwart am Eislaufplatz" }, stelle: ["auf dem Eis", "bei der Bande", "in der Garderobe"] },
  motorsport: { anrufer: ["begleiter", "aufsicht"], rollen: { aufsicht: "Streckenposten" }, stelle: ["auf der Strecke", "in der Boxengasse", "bei den Zuschauern"], hinweis: "Motorsport: Rennen gestoppt? Zufahrt über das Fahrerlager" },
  // ---- Kinder & Bildung
  kinderkrippe: { anrufer: ["lehrer"], rollen: { lehrer: "Pädagogin in der Krabbelstube" }, stelle: ["im Gruppenraum", "im Garten der Krabbelstube", "beim Wickeltisch"] },
  kindergarten: { anrufer: ["lehrer"], rollen: { lehrer: "Kindergartenpädagogin" }, stelle: ["im Gruppenraum", "im Garten des Kindergartens", "im Bewegungsraum"], umgebung: ["Eingang beim Kindergarten, eine Pädagogin wartet dort"] },
  volksschule: SCHULE,
  mittelschule: SCHULE,
  hoehere_schule: SCHULE,
  berufsschule: { ...SCHULE, stelle: ["in der Lehrwerkstätte", "im Klassenzimmer", "im Schulhof"] },
  sonderschule: SCHULE,
  // ---- Einkauf
  supermarkt: { anrufer: ["verkauf", "passant", "begleiter"], rollen: { verkauf: "Mitarbeiterin im Supermarkt" }, stelle: ["an der Kassa", "zwischen den Regalen", "auf dem Parkplatz vor dem Markt"] },
  einkaufszentrum: { anrufer: ["verkauf", "aufsicht", "passant"], rollen: { aufsicht: "Security im Einkaufszentrum" }, stelle: ["auf der Rolltreppe", "im Food-Court", "in einem Geschäft", "in der Tiefgarage"], hinweis: "Einkaufszentrum: Eingang und Stockwerk erfragen, die Security holt die Rettung ab" },
  baumarkt: { anrufer: ["verkauf", "passant", "begleiter"], rollen: { verkauf: "Mitarbeiter im Baumarkt" }, stelle: ["in der Holzabteilung beim Zuschnitt", "im Gartenbereich", "auf der Leiter im Lager", "an der Kassa"] },
  // ---- Arbeit & Betriebe
  industrie: { anrufer: ["kollege"], stelle: ["in der Produktionshalle", "an einer Maschine", "im Lager"], umgebung: ARBEIT_UMGEBUNG },
  steinbruch: { anrufer: ["kollege"], stelle: ["beim Brecher", "an der Abbauwand", "beim Förderband"], umgebung: ARBEIT_UMGEBUNG, hinweis: "Steinbruch: Treffpunkt beim Werkstor – das Gelände ist weitläufig und steil" },
  saegewerk: { anrufer: ["kollege"], stelle: ["bei der Säge", "im Holzlager", "beim Hacker"], umgebung: ARBEIT_UMGEBUNG },
  lagerhaus: {
    anrufer: ["kollege", "verkauf"],
    stelle: ["beim Silo", "im Lager", "bei der Getreideannahme"],
    umgebung: ARBEIT_UMGEBUNG,
    hinweis: "Lagerhaus/Silo: Person im Silo oder Gärgase – Feuerwehr (Höhenrettung, Atemschutz)",
    partner: [{ art: "fw", grund: "Silo – Höhenrettung/Atemschutz", themen: ["eingeklemmt", "gefahrstoff"], blockiert: true }],
  },
  kraftwerk: { anrufer: ["kollege"], stelle: ["in der Schaltanlage", "im Maschinenhaus"], umgebung: ARBEIT_UMGEBUNG, hinweis: "Kraftwerk/Umspannwerk: Stromunfall – Freischalten durch den Betreiber, Feuerwehr" },
  // ---- Straßen & Gelände (unsichtbare Einsatzstellen)
  autobahn: {
    anrufer: ["lenker", "selbst", "partner", "passant"],
    rollen: { lenker: "Autofahrer, der angehalten hat" },
    stelle: ["auf dem Pannenstreifen", "auf der rechten Fahrspur", "im Stau auf der Überholspur"],
    hinweis: "Autobahn: Kilometer und Fahrtrichtung erfragen – Anfahrt nur über die Richtungsfahrbahn; Polizei zur Absicherung",
    partner: [{ art: "pol", grund: "Absicherung auf der Autobahn", themen: ["verkehrsunfall", "brustschmerz", "bewusstlos", "sturz", "krank", "verletzung"] }],
  },
  landstrasse: {
    anrufer: ["lenker", "passant", "selbst", "partner"],
    stelle: ["auf der Fahrbahn", "im Straßengraben", "auf dem Bankett"],
    hinweis: "Landstraße außerorts: Straße und nächste Orte erfragen („zwischen … und …“), ggf. Ortung",
  },
  feldweg: { anrufer: ["passant", "partner", "begleiter", "selbst"], hinweis: "Feld-/Forstweg: keine Adresse – Ortung, Zufahrt und Treffpunkt erfragen" },
  radweg: { anrufer: ["begleiter", "passant", "selbst"], stelle: ["auf dem Radweg", "neben dem Radweg in der Wiese"], hinweis: "Radweg: keine Adresse – Ortung, nächste Zufahrt erfragen" },
  wald: { anrufer: ["kollege", "begleiter", "partner", "passant"], hinweis: "Wald: keine Adresse – Ortung, Forststraße und Treffpunkt erfragen; ggf. Bergrettung" },
  berg: {
    anrufer: ["begleiter", "partner", "passant", "selbst"],
    hinweis: "Berg: Ortung, Bergrettung und Hubschrauber (Tau) erwägen",
    partner: [{ art: "berg", grund: "Person am Berg – Bergung", themen: ["alpin", "sturz"], blockiert: true }],
  },
  ufer: {
    ...OFFEN,
    anrufer: ["passant", "begleiter", "partner"],
    hinweis: "Fluss-/Seeufer: Ist die Person im Wasser – Wasserrettung und Feuerwehr (Wasserdienst); Ortung",
  },
  weinberg: { anrufer: ["kollege", "partner", "kind"], stelle: ["zwischen den Rebzeilen", "beim Traktor am Weingarten"], hinweis: "Weingarten: Zufahrt über Güterwege – Ortung, Treffpunkt erfragen" },
  feld: { anrufer: ["partner", "kind", "kollege", "passant"], stelle: ["auf dem Acker", "beim Traktor am Feldrand"], hinweis: "Feld: Zufahrt über Güterwege – Ortung, Treffpunkt erfragen" },
  bahnuebergang: {
    anrufer: ["lenker", "passant"],
    stelle: ["direkt am Bahnübergang", "neben den Gleisen beim Bahnübergang"],
    hinweis: "Bahnübergang: ÖBB-Betriebsführung verständigen (Strecke sperren), Polizei und Feuerwehr",
    partner: BAHN_PARTNER,
  },
  bruecke: {
    anrufer: ["passant", "lenker"],
    stelle: ["auf der Brücke", "unter der Brücke am Ufer"],
    hinweis: "Brücke: bei drohendem Sprung Polizei (Verhandlung) und Feuerwehr; ist jemand im Wasser – Wasserrettung",
    partner: [
      { art: "pol", grund: "Person auf der Brücke", themen: ["psych"] },
      { art: "fw", grund: "Sicherung/Sprungpolster, Wasserdienst", themen: ["psych", "wasser"], blockiert: true },
    ],
  },
  tunnel: { anrufer: ["lenker", "selbst"], hinweis: "Tunnel: Feuerwehr, Fahrtrichtung und Portal erfragen", partner: [{ art: "fw", grund: "Tunnel – Absicherung/Brandschutz", themen: ["verkehrsunfall", "brand"] }] },
  anschlussstelle: { anrufer: ["lenker", "passant"], hinweis: "Autobahn-Auffahrt: Richtung und Rampe erfragen; Polizei" },
  kreisverkehr: { anrufer: ["lenker", "passant"], stelle: ["im Kreisverkehr", "bei der Ausfahrt aus dem Kreisverkehr"] },
  kreuzung: { anrufer: ["lenker", "passant"], stelle: ["auf der Kreuzung", "im Graben neben der Kreuzung"] },
  kellergasse: {
    anrufer: ["partner", "kind", "nachbar", "passant"],
    stelle: ["im Weinkeller", "im Presshaus", "auf der Kellerstiege"],
    hinweis: "Kellergasse: Gärgas (CO₂) im Keller? Nicht hinuntergehen lassen – Feuerwehr mit Atemschutz",
    partner: [{ art: "fw", grund: "Gärgas im Keller – Atemschutz", themen: ["gefahrstoff", "bewusstlos"], blockiert: true }],
  },
  hochstand: { anrufer: ["begleiter", "selbst", "partner"], stelle: ["unter dem Hochstand", "am Hochstand"], hinweis: "Hochstand im Revier: keine Adresse – Ortung, Forststraße und Treffpunkt erfragen" },
  windrad: { anrufer: ["kollege"], stelle: ["oben in der Gondel des Windrads", "im Turm des Windrads"], hinweis: "Windrad: Person in der Höhe – Höhenrettung (Feuerwehr)", partner: [{ art: "fw", grund: "Höhenrettung", themen: ["brustschmerz", "sturz", "bewusstlos"], blockiert: true }] },
  sendemast: { anrufer: ["kollege"], hinweis: "Sendemast: Person in der Höhe – Höhenrettung (Feuerwehr)", partner: [{ art: "fw", grund: "Höhenrettung", themen: ["sturz", "bewusstlos"], blockiert: true }] },
  biogasanlage: { anrufer: ["kollege"], hinweis: "Biogasanlage: Gase (H₂S) – Eigenschutz, Feuerwehr mit Atemschutz", partner: [{ art: "fw", grund: "Gase – Atemschutz", themen: ["gefahrstoff", "eingeklemmt", "bewusstlos"], blockiert: true }] },
  kletterfels: { anrufer: ["begleiter"], hinweis: "Kletterfelsen: Bergrettung, Hubschrauber mit Tau", partner: [{ art: "berg", grund: "Bergung aus dem Fels", themen: ["alpin", "sturz"], blockiert: true }] },
  klettersteig: { anrufer: ["begleiter"], hinweis: "Klettersteig: Bergrettung, Hubschrauber mit Tau", partner: [{ art: "berg", grund: "Bergung aus dem Klettersteig", themen: ["alpin", "sturz"], blockiert: true }] },
};

/** Profil eines Ortes (mehrere Kategorien: das erste mit Profil) */
export function ortProfil(kat: string | null | undefined): OrtProfil | undefined {
  return kat ? ORT_PROFIL[kat] : undefined;
}

/** Ort (POI) mit Profil an dieser Stelle – für den Hinweis in der Einsatzmaske */
let letzte: { key: string; erg: ReturnType<typeof ortAnStelleNeu> } | null = null;
export function ortAnStelle(lat: number, lon: number, radiusM = 120): ReturnType<typeof ortAnStelleNeu> {
  const key = `${lat.toFixed(5)}|${lon.toFixed(5)}|${radiusM}|${stellen().length}|${alleOrte().length}`;
  if (letzte?.key === key) return letzte.erg;
  const erg = ortAnStelleNeu(lat, lon, radiusM);
  letzte = { key, erg };
  return erg;
}
function ortAnStelleNeu(lat: number, lon: number, radiusM: number): { name: string; kat: string; label: string; profil?: OrtProfil } | null {
  let best: { name: string; kat: string; label: string; profil?: OrtProfil; d: number } | null = null;
  const st = stellen().map((x) => ({ kind: "stellen" as const, name: x.name, lat: x.lat, lon: x.lon, kategorien: [x.typ] }));
  for (const o of [...alleOrte(), ...st]) {
    if (o.kind !== "pois" && o.kind !== "stellen") continue;
    if (Math.abs(o.lat - lat) > 0.003 || Math.abs(o.lon - lon) > 0.004) continue;
    const dLat = (o.lat - lat) * 111_320;
    const dLon = (o.lon - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
    const d = Math.hypot(dLat, dLon);
    if (d > radiusM || (best && d >= best.d)) continue;
    const kat = o.kategorien.find((k) => ORT_PROFIL[k]) ?? o.kategorien[0];
    best = { name: o.name, kat, label: ortKategorie(kat)?.label ?? kat, profil: ORT_PROFIL[kat], d };
  }
  return best ? { name: best.name, kat: best.kat, label: best.label, profil: best.profil } : null;
}

/** Partner je nach Ort anpassen: im Bad keine Wasserrettung, am offenen Wasser Feuerwehr dazu, Bahn: Polizei/Feuerwehr … */
export function ortPartner<T extends { art: PartnerArt; grund: string; blockiert?: boolean }>(liste: T[], kat: string | null | undefined, thema: string | null | undefined): T[] {
  const p = ortProfil(kat);
  if (!p) return liste;
  let out = p.ohneWasserrettung ? liste.filter((x) => x.art !== "wasser") : [...liste];
  const imWasser = liste.some((x) => x.art === "wasser");
  for (const r of p.partner ?? []) {
    if (!thema || !r.themen.includes(thema) || out.some((x) => x.art === r.art)) continue;
    // Wasserdienst der Feuerwehr nur, solange die Person noch im Wasser ist
    if (p.offenesWasser && r.themen.includes("wasser") && !imWasser) continue;
    out = [...out, { art: r.art, grund: r.grund, ...(r.blockiert ? { blockiert: true } : {}) } as T];
  }
  return out;
}
