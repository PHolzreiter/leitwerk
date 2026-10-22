/**
 * Einsatzprofil je Ortskategorie (POI): Wer ruft dort an, wo genau ist der Patient, welche Partner braucht es,
 * was sollte der Disponent wissen. Ein Freibad ist kein Badesee (Bademeister, keine Wasserrettung), ein Bahnhof
 * keine Bushaltestelle (ÖBB, Oberleitung), ein Museum kein Tierpark (Aufsicht statt Tierpfleger).
 *
 * „stelle“ ersetzt die Stelle der Fallgeschichte, wenn deren Stellen nicht zum Ort passen („stelleMuster“).
 */
import type { AnruferTyp } from "../abfrage/szenario";
import type { PartnerArt } from "../sim/partner";
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
  bushaltestelle: {
    anrufer: ["busfahrer", "passant", "selbst", "begleiter"],
    rollen: { busfahrer: "Busfahrer, der an der Haltestelle steht" },
    stelle: ["an der Bushaltestelle", "im Bus, der an der Haltestelle steht", "beim Aussteigen aus dem Bus", "im Wartehäuschen der Bushaltestelle"],
    stelleMuster: /bus|haltestelle/i,
    hinweis: "Bushaltestelle: Bei Unfall mit dem Bus oder einem Auto Polizei; der Bus steht oft noch an der Haltestelle",
    partner: [{ art: "pol", grund: "Unfall an der Bushaltestelle", themen: ["verkehrsunfall"] }],
  },
  busbahnhof: {
    anrufer: ["busfahrer", "passant", "selbst", "begleiter"],
    rollen: { busfahrer: "Busfahrerin am Busbahnhof" },
    stelle: ["am Busbahnhof bei Steig {2|4|5}", "im Bus am Busbahnhof", "im Wartebereich des Busbahnhofs"],
    stelleMuster: /bus/i,
    hinweis: "Busbahnhof: viele Busse und Fahrgäste – Zufahrt und Steig erfragen",
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
};

/** Profil eines Ortes (mehrere Kategorien: das erste mit Profil) */
export function ortProfil(kat: string | null | undefined): OrtProfil | undefined {
  return kat ? ORT_PROFIL[kat] : undefined;
}

/** Ort (POI) mit Profil an dieser Stelle – für den Hinweis in der Einsatzmaske */
export function ortAnStelle(lat: number, lon: number, radiusM = 120): { name: string; kat: string; label: string; profil?: OrtProfil } | null {
  let best: { name: string; kat: string; label: string; profil?: OrtProfil; d: number } | null = null;
  for (const o of alleOrte()) {
    if (o.kind !== "pois") continue;
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
