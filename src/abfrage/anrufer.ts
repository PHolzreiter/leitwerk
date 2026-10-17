/**
 * KI-Anrufer: Wer ruft an (passend zur Lage, mit Zufall), was weiß er, wie spricht er.
 * Erzeugt die Anweisung für das Sprachmodell und einfache Antworten ohne KI.
 */
import { fragtNachZustand, hinweisZurArt, type NachrichtArt } from "./runde";
import { antwortLabel, frageIndex, type Antworten, type Frage, type Schema } from "./schema";
import { ist, thema } from "./themen";
import { bezugFuer, fallakte, faktSaetze, fuellen, SELBSTVERSTAENDLICH, type AnruferTyp, type OrtArt, type Szenario } from "./szenario";
import { einstiegHinweis, personaText, type Persona } from "./persona";
import { frageMitPronomen } from "./sprechfrage";

export interface Anrufer {
  /** Beziehung zum Patienten, z. B. „Ehefrau“, „Pflegerin im Heim“ */
  rolle: string;
  /** Wert für die Schemafrage „Wer ruft an?“ */
  anruferWert: string;
  name: string;
  geschlecht: "m" | "w";
  /** Ort der Situation, z. B. „Wohnung“, „Pflegeheim“, „Gehsteig“, „Arztpraxis“ */
  ort: string;
  emotion: "ruhig" | "gefasst" | "aufgeregt" | "panisch";
  sprache: "hochdeutsch" | "dialekt" | "gebrochen";
  herkunft?: string;
  schwerhoerig: boolean;
  nummer: string;
  /** Patient ist der Anrufer selbst */
  selbst: boolean;
  /** Sonderfälle: Polizei, Einrichtung, andere Leitstelle, eCall */
  art?: "privat" | "polizei" | "einrichtung" | "leitstelle" | "ecall";
  /** Name der Dienststelle/Einrichtung, z. B. „Landesleitzentrale der Polizei“ */
  stelle?: string;
  /** fertige Meldung (andere Leitstelle, eCall-Ansage), vom Programm erzeugt */
  meldung?: string;
  /** eCall: ob jemand im Fahrzeug antwortet */
  sprachkontakt?: boolean;
  /** Art des Anrufers (aus der Fallgeschichte) */
  typ?: AnruferTyp;
  /** Persönlichkeit: Wissen, Art zu reden, Einstieg, Wörter für den Patienten */
  persona?: Persona;
}

/** Wo kann dieser Anrufer sein? (fehlt = überall) */
const ORT_ANRUFER: Partial<Record<AnruferTyp, OrtArt[]>> = {
  partner: ["wohnung", "haus", "garten", "strasse", "geschaeft", "lokal", "freizeit", "natur", "wasser", "auto", "arzt", "bahnhof", "sport"],
  kind: ["wohnung", "haus", "garten", "strasse", "geschaeft", "lokal", "freizeit", "natur", "auto", "arzt", "pflegeheim"],
  eltern: ["wohnung", "haus", "garten", "strasse", "geschaeft", "freizeit", "natur", "wasser", "auto", "arzt", "sport", "bahnhof"],
  nachbar: ["wohnung", "haus", "garten", "strasse"],
  fern: ["wohnung", "haus", "garten"],
  pflege: ["pflegeheim", "wohnung", "haus"],
  arzt: ["arzt", "wohnung", "haus", "pflegeheim"],
  ordi: ["arzt"],
  lehrer: ["schule", "sport", "freizeit"],
  kollege: ["arbeit", "baustelle", "geschaeft", "lokal"],
  passant: ["strasse", "geschaeft", "freizeit", "natur", "bahnhof", "sport", "lokal", "wasser", "auto", "garten"],
  verkauf: ["geschaeft", "bahnhof"],
  lenker: ["strasse", "auto"],
  trainer: ["sport"],
  bademeister: ["wasser", "freizeit", "sport"],
  wirt: ["lokal"],
};

/** Anrufer-Typen, die an diesem Ort passen (passt keiner, bleiben alle) */
export function anruferAmOrt(typen: AnruferTyp[], ort: OrtArt | undefined): AnruferTyp[] {
  if (!ort) return typen;
  const ok = typen.filter((t) => !ORT_ANRUFER[t] || ORT_ANRUFER[t]!.includes(ort));
  return ok.length ? ok : typen;
}

const VORNAMEN_W = ["Maria", "Anna", "Elisabeth", "Sabine", "Andrea", "Claudia", "Julia", "Lisa", "Sandra", "Karin", "Monika", "Theresa", "Sophie", "Katharina", "Birgit", "Ingrid"];
const VORNAMEN_M = ["Josef", "Johann", "Franz", "Michael", "Thomas", "Andreas", "Stefan", "Markus", "Lukas", "Florian", "Karl", "Gerhard", "Wolfgang", "Manfred", "David", "Martin"];
const NACHNAMEN = ["Gruber", "Huber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Mayer", "Hofer", "Leitner", "Berger", "Fuchs", "Eder", "Schmid", "Winkler", "Weber", "Schwarz", "Maier", "Schneider"];
const HERKUNFT = ["Türkei", "Serbien", "Rumänien", "Syrien", "Afghanistan", "Ungarn", "Polen", "Bosnien", "Ukraine", "Slowakei"];

/** Zufälliger Vor- und Nachname */
export function zufallsName(g: "m" | "w", rnd: () => number = Math.random): string {
  return `${pick(g === "w" ? VORNAMEN_W : VORNAMEN_M, rnd)} ${pick(NACHNAMEN, rnd)}`;
}

/** Zufällige Telefonnummer (österreichisch) */
export function zufallsNummer(rnd: () => number = Math.random): string {
  return telefonnummer(rnd);
}

function pick<T>(a: T[], rnd: () => number): T {
  return a[Math.floor(rnd() * a.length)];
}

function gewichtet<T>(liste: [T, number][], rnd: () => number): T {
  const sum = liste.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * sum;
  for (const [v, w] of liste) {
    r -= w;
    if (r <= 0) return v;
  }
  return liste[liste.length - 1][0];
}

function telefonnummer(rnd: () => number): string {
  const vorwahl = pick(["0664", "0660", "0676", "0699", "0650", "0681", "02732", "02742"], rnd);
  let n = "";
  for (let i = 0; i < (vorwahl.length === 4 ? 7 : 5); i++) n += Math.floor(rnd() * 10);
  return `${vorwahl} ${n}`;
}

type Situation = { ort: string; rolle: string; anruferWert: string; geschlecht?: "m" | "w"; selbst?: boolean; profi?: boolean; typ?: AnruferTyp };

/**
 * Wählt einen passenden Anrufer. Die Lage (Alter, Bewusstsein, Kapitel) beeinflusst
 * die Wahrscheinlichkeiten, legt aber nichts fest – so bleibt es abwechslungsreich.
 */
export function anruferWaehlen(
  kapitel: string,
  a: Antworten,
  rnd: () => number = Math.random,
  adresse = "",
  /** aus der Fallgeschichte: wer anrufen darf und wo es passiert */
  geschichte?: { typen: AnruferTyp[]; ort: string; ortArt?: OrtArt },
): Anrufer {
  const sonder = sonderAnrufer(kapitel, a, rnd, adresse, geschichte);
  if (sonder) return sonder;
  const alter = typeof a.alter === "number" ? a.alter : 50;
  const patientW = a.geschlecht === "w";
  const kannSelbst = a.bw === "ja" && (a.at === "normal" || a.at === "abnorm") && alter >= 14;
  const kind = alter < 14;
  const alt = alter >= 75;
  const draussen = ist(kapitel, "verkehrsunfall", "sturz", "gewalt", "tierbiss", "stich_schuss", "verletzung", "alpin", "eingeklemmt", "hitze_kaelte");
  const kandidaten: [Situation, number][] = [];
  const add = (s: Situation, w: number) => w > 0 && kandidaten.push([s, w]);

  // Zu Hause
  add({ ort: "Wohnung", rolle: patientW ? "Ehemann" : "Ehefrau", anruferWert: "2", geschlecht: patientW ? "m" : "w", typ: "partner" }, alter >= 25 && !kind ? 4 : 0);
  add({ ort: "Wohnung", rolle: "Lebensgefährtin", anruferWert: "2", geschlecht: "w", typ: "partner" }, alter >= 20 && alter < 70 && !patientW ? 1 : 0);
  add({ ort: "Wohnung", rolle: "Mutter", anruferWert: "2", geschlecht: "w", typ: "eltern" }, kind ? 6 : alter < 25 ? 1 : 0);
  add({ ort: "Wohnung", rolle: "Vater", anruferWert: "2", geschlecht: "m", typ: "eltern" }, kind ? 3 : 0);
  add({ ort: "Wohnung", rolle: rnd() < 0.5 ? "Tochter" : "Sohn", anruferWert: "2", typ: "kind" }, alter >= 60 ? 4 : 0);
  add({ ort: "Wohnung", rolle: "Nachbarin", anruferWert: "2", geschlecht: "w", typ: "nachbar" }, alter >= 60 ? 1 : 0.3);
  add({ ort: "Wohnung", rolle: "Patient selbst", anruferWert: "1", selbst: true, typ: "selbst" }, kannSelbst ? (alter > 80 ? 1 : 3) : 0);
  add({ ort: "Wohnung", rolle: "Angehöriger, nicht vor Ort (am Telefon mit dem Patienten)", anruferWert: "3", typ: "fern" }, kannSelbst ? 0.6 : 0);
  // Einrichtungen
  add({ ort: "Pflegeheim", rolle: "Pflegekraft im Pflegeheim", anruferWert: "einrichtung", profi: true, typ: "pflege" }, alt ? 4 : alter >= 65 ? 1 : 0);
  add({ ort: "Arztpraxis", rolle: "Hausärztin/Hausarzt", anruferWert: "einrichtung", profi: true, typ: "arzt" }, !kind && ist(kapitel, "brustschmerz", "atemnot", "krank", "schlaganfall", "bauch", "herz", "kopfschmerz") ? 1 : 0.2);
  add({ ort: "Arztpraxis", rolle: "Ordinationsassistentin am Empfang", anruferWert: "einrichtung", geschlecht: "w", typ: "ordi" }, !kind ? 0.6 : 0.2);
  add({ ort: "Schule / Kindergarten", rolle: "Lehrerin", anruferWert: "2", geschlecht: "w", typ: "lehrer" }, kind && alter >= 3 ? 1.5 : 0);
  add({ ort: "Arbeitsplatz", rolle: rnd() < 0.5 ? "Arbeitskollege" : "Arbeitskollegin", anruferWert: "2", typ: "kollege" }, alter >= 17 && alter < 66 ? 1.5 : 0);
  // Draußen
  add({ ort: "Straße / Gehsteig", rolle: "Passant", anruferWert: "2", typ: "passant" }, draussen ? 5 : 1);
  add({ ort: "Supermarkt", rolle: "Mitarbeiterin im Supermarkt", anruferWert: "2", geschlecht: "w", typ: "verkauf" }, 0.6);
  add({ ort: "Straße", rolle: "Lenker, der den Unfall beobachtet hat", anruferWert: "2", typ: "lenker" }, ist(kapitel, "verkehrsunfall") ? 4 : 0);

  // Fallgeschichte: nur passende Anrufer (Ort kommt aus der Geschichte)
  if (geschichte?.typen.length) {
    const ersatz: Record<AnruferTyp, Situation> = {
      partner: { ort: "", rolle: patientW ? "Ehemann" : "Ehefrau", anruferWert: "2", geschlecht: patientW ? "m" : "w", typ: "partner" },
      kind: { ort: "", rolle: rnd() < 0.5 ? "Tochter" : "Sohn", anruferWert: "2", typ: "kind" },
      eltern: { ort: "", rolle: rnd() < 0.65 ? "Mutter" : "Vater", anruferWert: "2", typ: "eltern" },
      nachbar: { ort: "", rolle: rnd() < 0.6 ? "Nachbarin" : "Nachbar", anruferWert: "2", typ: "nachbar" },
      selbst: { ort: "", rolle: "Patient selbst", anruferWert: "1", selbst: true, typ: "selbst" },
      fern: { ort: "", rolle: "Angehöriger, nicht vor Ort (am Telefon mit dem Patienten)", anruferWert: "3", typ: "fern" },
      pflege: { ort: "", rolle: "Pflegekraft im Pflegeheim", anruferWert: "einrichtung", profi: true, typ: "pflege" },
      arzt: { ort: "", rolle: "Hausärztin/Hausarzt", anruferWert: "einrichtung", profi: true, typ: "arzt" },
      ordi: { ort: "", rolle: "Ordinationsassistentin am Empfang", anruferWert: "einrichtung", geschlecht: "w", typ: "ordi" },
      lehrer: { ort: "", rolle: rnd() < 0.7 ? "Lehrerin" : "Lehrer", anruferWert: "2", typ: "lehrer" },
      kollege: { ort: "", rolle: rnd() < 0.5 ? "Arbeitskollege" : "Arbeitskollegin", anruferWert: "2", typ: "kollege" },
      passant: { ort: "", rolle: rnd() < 0.5 ? "Passant" : "Passantin", anruferWert: "2", typ: "passant" },
      verkauf: { ort: "", rolle: rnd() < 0.6 ? "Mitarbeiterin im Geschäft" : "Mitarbeiter im Geschäft", anruferWert: "2", typ: "verkauf" },
      lenker: { ort: "", rolle: "Lenker, der den Unfall beobachtet hat", anruferWert: "2", typ: "lenker" },
      begleiter: { ort: "", rolle: rnd() < 0.5 ? "Freund, der dabei ist" : "Freundin, die dabei ist", anruferWert: "2", typ: "begleiter" },
      trainer: { ort: "", rolle: "Trainer im Sportverein", anruferWert: "2", geschlecht: "m", typ: "trainer" },
      bademeister: { ort: "", rolle: rnd() < 0.7 ? "Bademeister" : "Bademeisterin", anruferWert: "2", typ: "bademeister" },
      wirt: { ort: "", rolle: rnd() < 0.5 ? "Wirt" : "Kellnerin", anruferWert: "2", typ: "wirt" },
      telemed: { ort: "", rolle: "Ärztin/Arzt der Telemedizin", anruferWert: "einrichtung", profi: true, typ: "telemed" },
      polizei: { ort: "", rolle: rnd() < 0.5 ? "Polizist" : "Polizistin", anruferWert: "2", profi: true, typ: "polizei" },
      bergrettung: { ort: "", rolle: "Einsatzleiter der Bergrettung", anruferWert: "einrichtung", geschlecht: "m", profi: true, typ: "bergrettung" },
    };
    // Selbst anrufen geht nur wach und mit ausreichender Atmung; der Anrufer muss zum Ort und zum Alter passen
    const altersGerecht = (t: AnruferTyp) => (t === "eltern" ? alter < 30 : t === "kind" ? alter >= 45 : t === "partner" ? alter >= 18 : t === "lehrer" ? alter < 20 : true);
    let typen = anruferAmOrt(geschichte.typen, geschichte.ortArt).filter((t) => t !== "selbst" || kannSelbst);
    if (typen.some(altersGerecht)) typen = typen.filter(altersGerecht);
    const erlaubt = kandidaten.filter(([x]) => x.typ && typen.includes(x.typ));
    const pool: [Situation, number][] = erlaubt.length ? erlaubt : typen.map((t) => [ersatz[t], 1] as [Situation, number]);
    if (!erlaubt.length && !pool.length) pool.push([ersatz.passant, 1]);
    kandidaten.length = 0;
    for (const [x, w] of pool) kandidaten.push([{ ...x, ort: geschichte.ort }, w]);
    // Typen, die oben nicht gewichtet werden (Begleiter, Trainer …), trotzdem möglich
    for (const t of typen) if (!kandidaten.some(([x]) => x.typ === t)) kandidaten.push([{ ...ersatz[t], ort: geschichte.ort }, 0.8]);
  }
  const s = gewichtet(kandidaten, rnd);
  const geschlecht: "m" | "w" =
    s.geschlecht ?? (s.selbst ? (patientW ? "w" : "m") : /Tochter|Kollegin|in\b/.test(s.rolle) ? "w" : /Sohn|Kollege/.test(s.rolle) ? "m" : rnd() < 0.5 ? "w" : "m");

  // Gefühlslage: je schlimmer und je näher, desto aufgeregter; Profis bleiben ruhig
  const schlimm = a.bw === "nein" || a.at === "keine" || a.at === "agonal";
  let emotion: Anrufer["emotion"];
  if (s.profi) emotion = schlimm ? "gefasst" : "ruhig";
  else if (s.selbst) emotion = gewichtet([["ruhig", 3], ["gefasst", 3], ["aufgeregt", 2]], rnd);
  else if (schlimm || kind) emotion = gewichtet([["panisch", 5], ["aufgeregt", 3], ["gefasst", 1]], rnd);
  else emotion = gewichtet([["ruhig", 2], ["gefasst", 3], ["aufgeregt", 3], ["panisch", 1]], rnd);

  const sprache: Anrufer["sprache"] = s.profi ? (rnd() < 0.1 ? "dialekt" : "hochdeutsch") : gewichtet([["hochdeutsch", 6], ["dialekt", 3], ["gebrochen", 1.5]], rnd);
  const vorname = pick(geschlecht === "w" ? VORNAMEN_W : VORNAMEN_M, rnd);
  return {
    rolle: gendern(s.rolle, geschlecht),
    anruferWert: s.anruferWert,
    name: `${vorname} ${pick(NACHNAMEN, rnd)}`,
    geschlecht,
    ort: s.ort,
    emotion,
    sprache,
    herkunft: sprache === "gebrochen" ? pick(HERKUNFT, rnd) : undefined,
    schwerhoerig: (s.selbst && alter > 78 && rnd() < 0.35) || rnd() < 0.03,
    nummer: telefonnummer(rnd),
    selbst: !!s.selbst,
    typ: s.typ,
  };
}

/** „Ärztin/Arzt“ → passende Form zum Geschlecht */
function gendern(t: string, g: "m" | "w"): string {
  return t
    .replace(/Beamtin\/Beamter/g, g === "w" ? "Beamtin" : "Beamter")
    .replace(/Hausärztin\/Hausarzt/g, g === "w" ? "Hausärztin" : "Hausarzt")
    .replace(/Ärztin\/Arzt/g, g === "w" ? "Ärztin" : "Arzt")
    .replace(/Disponent\/in/g, g === "w" ? "Disponentin" : "Disponent")
    .replace(/Mitarbeiter\/in/g, g === "w" ? "Mitarbeiterin" : "Mitarbeiter")
    .replace(/Pistenretter\/in/g, g === "w" ? "Pistenretterin" : "Pistenretter")
    .replace(/eine\/n /g, g === "w" ? "eine " : "einen ");
}

/** „Ich bin …“ für die Frage „Wer ruft an?“ */
export function werText(x: Anrufer): string {
  if (x.selbst) return `${x.name.split(" ")[0]} ${x.name.split(" ").slice(1).join(" ")} – ich ruf für mich selber an, mir geht's nicht gut.`;
  const r = x.rolle.split(";")[0].split("(")[0].trim();
  if (x.art === "ecall") return x.sprachkontakt ? `Ich sitz im Auto, ich bin ${x.geschlecht === "w" ? "die Fahrerin" : "der Fahrer"}.` : "(keine Antwort)";
  if (x.art && x.art !== "privat") return `${x.stelle ? `${x.stelle}, ` : ""}${x.name}${x.art === "polizei" ? " – ich rufe für unsere Streife vor Ort an" : ""}.`;
  const art = /^(Pflegekraft|Mitarbeiterin|Lehrerin|Nachbarin|Ehefrau|Lebensgefährtin|Mutter|Tochter|Arbeitskollegin|Ordinationsassistentin)/.test(r) ? "die" : /^(Hausärztin|Hausarzt)/.test(r) ? (x.geschlecht === "w" ? "die" : "der") : "der";
  return `Ich bin ${art} ${r}.`;
}

/**
 * Was der Anrufer sagt, wenn sich der Zustand verändert hat – im laufenden Gespräch
 * oder als Folgeanruf. null = Anrufer kann nichts mehr sagen bzw. weiß nichts davon.
 */
export function veraenderungText(x: Anrufer, patientW: boolean, neu: { bw: string; at: string }, besserung: boolean, folge: boolean): string | null {
  if (x.art === "leitstelle" || (x.art === "ecall" && !x.sprachkontakt)) return null;
  const Er = patientW ? "Sie" : "Er";
  let was: string;
  if (x.selbst) {
    if (neu.bw === "nein" || neu.at === "keine" || neu.at === "agonal") return null;
    was = besserung ? "Mir geht's jetzt wieder ein bissl besser." : "Mir wird ganz schwindlig … ich kann bald nimmer …";
  } else if (besserung) was = `${Er} ist wieder zu sich gekommen und redet wieder.`;
  else if (neu.at === "keine" || neu.at === "agonal") was = `${Er} atmet nicht mehr! ${Er} rührt sich nicht mehr!`;
  else if (neu.bw === "nein") was = `${Er} reagiert überhaupt nicht mehr!${neu.at === "abnorm" ? ` Und ${Er.toLowerCase()} schnauft ganz komisch.` : ""}`;
  else if (neu.bw === "getruebt") was = `${Er} ist jetzt ganz benommen und redet nur mehr wirres Zeug.`;
  else was = `${Er} schnauft jetzt ganz schwer.`;
  const wer = bezugVon(x, patientW);
  if (x.art === "polizei") return `${folge ? "Landesleitzentrale der Polizei nochmal – " : ""}die Streife meldet: ${was}`;
  if (x.art === "einrichtung") return `${folge ? `${x.stelle} nochmal, ${x.name}. ` : ""}Der Zustand hat sich verändert: ${was}`;
  if (!folge) return besserung ? was : `Moment … ${was}`;
  return `Ich hab vorhin schon angerufen wegen ${wer === "ich" ? "mir" : dativ(wer)}! ${was}${besserung ? "" : " Wo bleibt die Rettung?"}`;
}

// ------------------------------------------------------------------ Sonderfälle (Kapitel gibt den Anrufer vor)

function ortVon(adresse: string): string {
  const m = adresse.match(/\d{4}\s+([^,]+)/) ?? adresse.match(/,\s*([^,]+)$/);
  return (m?.[1] ?? adresse).trim();
}

const FAHRZEUGE = ["BMW X5", "VW Golf", "Skoda Octavia", "Audi A4", "VW Passat", "Mercedes C-Klasse", "Ford Focus", "Toyota Yaris", "Seat Leon", "Dacia Duster", "VW Transporter", "Renault Clio"];
const FARBEN = ["schwarz", "weiß", "silber", "grau", "blau", "rot", "dunkelgrün"];

function sonderAnrufer(kapitel: string, a: Antworten, rnd: () => number, adresse: string, geschichte?: { typen: AnruferTyp[]; ort: string }): Anrufer | null {
  const ort = ortVon(adresse) || "dem Ort";
  const basis = (p: Partial<Anrufer> & Pick<Anrufer, "rolle" | "anruferWert">): Anrufer => {
    const geschlecht = p.geschlecht ?? (rnd() < 0.5 ? "w" : "m");
    p = { ...p, rolle: gendern(p.rolle, geschlecht) };
    return {
      name: `${pick(geschlecht === "w" ? VORNAMEN_W : VORNAMEN_M, rnd)} ${pick(NACHNAMEN, rnd)}`,
      geschlecht,
      ort: "Dienststelle",
      emotion: "ruhig",
      sprache: "hochdeutsch",
      schwerhoerig: false,
      nummer: telefonnummer(rnd),
      selbst: false,
      ...p,
    };
  };
  if (ist(kapitel, "anforderung_polizei")) {
    const streife = `${ort} ${1 + Math.floor(rnd() * 3)}`;
    return basis({
      art: "polizei",
      rolle: `Beamtin/Beamter der Landesleitzentrale der Polizei; die Streife „${streife}“ ist beim Patienten und hat den Rettungsdienst angefordert`,
      anruferWert: "polizei",
      stelle: "Landesleitzentrale der Polizei",
      ort: "Landesleitzentrale (die Streife ist vor Ort)",
      emotion: "ruhig",
      nummer: "059133",
    });
  }
  if (ist(kapitel, "anforderung_arzt")) {
    const anf = String(a.anforderer ?? "normal");
    const heim = pick([`Pflegeheim ${ort}`, `Landespflegeheim ${ort}`, `Seniorenzentrum ${ort}`, `Pflege- und Betreuungszentrum ${ort}`], rnd);
    const station = `Station ${1 + Math.floor(rnd() * 4)}`;
    const varianten: Record<string, [string, string, string]> = {
      normal: [rnd() < 0.7 ? `diplomierte Pflegekraft im ${heim}, ${station}` : `Hausärztin/Hausarzt in ${ort}`, rnd() < 0.7 ? heim : `Ordination in ${ort}`, rnd() < 0.7 ? `${heim}, ${station}` : `Ordination`],
      telemed: ["Ärztin/Arzt der telefonischen Gesundheitsberatung (Telemedizin)", "Telemedizin", "Telemedizin-Zentrale (der Patient ist zu Hause)"],
      "141": ["Ärztin/Arzt vom Ärztefunkdienst 141", "Ärztefunkdienst 141", "141-Callcenter (der Patient ist zu Hause)"],
      ecn: ["Mitarbeiter/in der Gesundheitshotline 1450", "Gesundheitshotline 1450", "1450-Callcenter"],
      schi: ["Pistenretter/in am Schigebiet", "Pistenrettung", "Piste"],
    };
    // Fallgeschichte legt fest, wer anruft (Pflegeheim, Hausarzt, Ordination, Telemedizin)
    if (geschichte?.typen.length && anf === "normal") {
      const pool = geschichte.typen.filter((x) => ["pflege", "arzt", "ordi"].includes(x));
      const t = pool.length ? pick(pool, rnd) : "pflege";
      const hausbesuch = !/praxis|pflegeheim/i.test(geschichte.ort);
      if (t === "pflege") varianten.normal = [`diplomierte Pflegekraft im ${heim}, ${station}`, heim, `${heim}, ${station}`];
      else if (t === "arzt") varianten.normal = [`Hausärztin/Hausarzt in ${ort}`, `Ordination in ${ort}`, hausbesuch ? "beim Patienten zu Hause (Hausbesuch)" : "Ordination"];
      else varianten.normal = [`Ordinationsassistentin der Hausarztpraxis in ${ort}`, `Ordination in ${ort}`, "Ordination"];
    }
    const [rolle, stelle, wo] = varianten[anf] ?? varianten.normal;
    return basis({ art: "einrichtung", rolle, anruferWert: "einrichtung", stelle, ort: wo, emotion: "ruhig", ...(rolle.startsWith("Ordinationsassistentin") ? { geschlecht: "w" as const } : {}) });
  }
  if (ist(kapitel, "anforderung_ls")) {
    const org = gewichtet<[string, string, string]>(
      [
        [["Bezirksalarmzentrale der Feuerwehr", "Feuerwehr", "feuerwehr"], 5],
        [["Einsatzleitstelle der Bergrettung", "Bergrettung", "berg"], 2],
        [["Einsatzleitstelle der Wasserrettung", "Wasserrettung", "wasser"], 1.5],
        [["Rettungsleitstelle des Nachbarbundeslandes", "Nachbarleitstelle", "ls"], 1],
      ],
      rnd,
    );
    const mittel = String(a.mittel ?? "rtw");
    return basis({
      art: "leitstelle",
      rolle: `Disponent/in der ${org[0]}`,
      anruferWert: "ls",
      stelle: org[0],
      ort: "Leitstelle",
      emotion: "ruhig",
      meldung: lagebild42(org[2], mittel, adresse, rnd),
    });
  }
  if (ist(kapitel, "ecall")) {
    const kontakt = a.sprachkontakt === "ja";
    const insassen = 1 + Math.floor(rnd() * 3);
    const richtung = pick(["Nord", "Süd", "Ost", "West", "Nordost", "Südwest"], rnd);
    const fz = `${pick(FAHRZEUGE, rnd)}, ${pick(FARBEN, rnd)}`;
    return basis({
      art: "ecall",
      rolle: kontakt ? `Insasse des verunfallten Fahrzeugs (${fz})` : "automatische Unfallmeldung",
      anruferWert: "system",
      stelle: "eCall",
      ort: "im verunfallten Fahrzeug",
      emotion: kontakt ? pick(["gefasst", "aufgeregt"] as const, rnd) : "ruhig",
      sprachkontakt: kontakt,
      meldung: `Automatische Unfallmeldung. Auslösung: ${pick(["Airbag", "Airbag", "Aufprallsensor", "manuell (SOS-Taste)"], rnd)}. Fahrzeug: ${fz}. Fahrtrichtung: ${richtung}. Insassen laut Gurtsensor: ${insassen}. Position: ${adresse}. ${kontakt ? "Sprachverbindung wird hergestellt." : "Sprachverbindung: keine Antwort."}`,
    });
  }
  return null;
}

/** Kurz-Lagebild einer anderen Leitstelle (ohne Abfrage) */
function lagebild42(org: string, mittel: string, adresse: string, rnd: () => number): string {
  const schwer = mittel === "na" || mittel === "nah";
  const lagen: Record<string, [string[], string[]]> = {
    feuerwehr: [
      ["PKW gegen PKW, zwei Personen leicht verletzt, beide gehfähig", "Brand in einem Wohnhaus, eine Person mit Rauchgasverdacht", "PKW von der Fahrbahn abgekommen, Lenker leicht verletzt"],
      ["PKW gegen Baum, eine Person eingeklemmt, ansprechbar", "PKW gegen PKW, unbekannte Anzahl an Betroffenen, ein Fahrzeug im Vollbrand", "Wohnungsbrand, eine Person bewusstlos aus der Wohnung gerettet", "LKW gegen PKW, Lenker eingeklemmt, schwer verletzt"],
    ],
    berg: [
      ["Wanderer mit Knöchelverletzung, nicht mehr gehfähig, wird von der Bergrettung zur Forststraße gebracht", "Mountainbiker gestürzt, Handgelenk verletzt"],
      ["Wanderer abgestürzt, ca. 20 Meter, ansprechbar, starke Schmerzen", "Kletterer abgestürzt, Bewusstsein getrübt", "Paragleiter abgestürzt, Rückenverletzung"],
    ],
    wasser: [
      ["Badegast mit Schnittverletzung am Fuß", "Kind aus dem Wasser geholt, wach, hat Wasser geschluckt"],
      ["Person aus dem Wasser gezogen, bewusstlos, Reanimation durch Wasserrettung läuft", "Badeunfall nach Kopfsprung, kann Beine nicht bewegen"],
    ],
    ls: [["Patient für Transport ins Krankenhaus, Grenzgebiet", "verletzte Person nach Sturz, Grenzgebiet"], ["Verkehrsunfall im Grenzgebiet, eine Person schwer verletzt", "Reanimation im Grenzgebiet, unsere Kräfte sind länger unterwegs"]],
  };
  const [leicht, ernst] = lagen[org] ?? lagen.feuerwehr;
  const lage = pick(schwer ? ernst : leicht, rnd);
  const bedarf: Record<string, string> = { ktw: "einen Transport", rtw: "einen RTW", na: "einen Notarzt und einen RTW", nah: "den Notarzthubschrauber" };
  return `Einsatzort: ${adresse}. Lage: ${lage}. Wir brauchen ${bedarf[mittel] ?? "den Rettungsdienst"}.`;
}

// ------------------------------------------------------------------ Anweisung für das Sprachmodell

const EMOTION_TEXT: Record<Anrufer["emotion"], string> = {
  ruhig: "Du bist ruhig und sachlich.",
  gefasst: "Du bist besorgt, aber gefasst und kooperativ.",
  aufgeregt: "Du bist aufgeregt, redest schnell, wiederholst dich manchmal und unterbrichst dich selbst.",
  panisch: "Du bist panisch: kurze, abgehackte Sätze, du flehst um schnelle Hilfe, beruhigst dich etwas, wenn die Leitstelle klare Anweisungen gibt.",
};

function sprachText(x: Anrufer): string {
  if (x.sprache === "dialekt") return "Du sprichst leichten niederösterreichischen Dialekt (z. B. „i“, „net“, „a bissl“, „gschwind“), bleibst aber verständlich.";
  if (x.sprache === "gebrochen") return `Deutsch ist nicht deine Muttersprache (du kommst aus ${x.herkunft}). Du sprichst einfaches, gebrochenes Deutsch mit Grammatikfehlern, verstehst schwierige Wörter manchmal nicht und fragst nach.`;
  return "Du sprichst normales Hochdeutsch mit österreichischem Einschlag.";
}

export interface AnrufKontext {
  schema: Schema;
  anrufer: Anrufer;
  kapitel: string;
  wahrheit: Antworten;
  /** Bezeichnung des wahren Codes (nur als Hintergrund, nie aussprechen) */
  lage: string;
  /** Adresse, wie der Anrufer sie nennt (kann falsch sein) */
  adresse: string;
  patientAlter: number | null;
  /** wie oft schon angerufen wurde (Rückruf nach verpasstem Anruf) */
  versuche: number;
  rueckrufDurchLeitstelle: boolean;
  /** Anrufer weiß nicht genau, wo er ist (Ortung nötig) */
  ortUnbekannt: boolean;
  /** Fallgeschichte (Hergang, Patient, Umgebung …), falls vorhanden */
  szenario?: Szenario;
}

/** Bewusstsein und Atmung in Laiensprache (so beschreibt es ein Anrufer) */
const LAIE: Record<string, Record<string, string>> = {
  bw: {
    ja: "ist wach und reagiert, wenn man mit {ihm} redet",
    getruebt: "ist benommen, redet verwirrt oder undeutlich, reagiert nur langsam",
    nein: "reagiert überhaupt nicht, auch nicht auf Rütteln oder lautes Ansprechen",
    unbekannt: "das weißt du nicht genau",
  },
  at: {
    normal: "atmet ganz normal",
    abnorm: "schnauft schwer, ringt nach Luft oder atmet sehr schnell",
    agonal: "macht nur ganz selten so komische schnappende Atemzüge",
    keine: "atmet nicht",
    unbekannt: "das weißt du nicht",
  },
};

/** Wahrheit zu einer Frage in Worten (für die KI) */
export function wahrheitText(k: AnrufKontext, f: Frage): string | null {
  const wert = k.wahrheit[f.id];
  if (wert === undefined || wert === null) return null;
  const p = k.anrufer.persona;
  const w = patientW(k);
  if (p && !k.anrufer.selbst) {
    if (f.id === "alter") return `${p.alterGesagt}${p.wissen === "fremd" || p.wissen === "bekannt" ? " – genauer weißt du es nicht" : ""}`;
    if (VORGESCHICHTE.has(f.id) && p.kenntVorgeschichte !== "ja") {
      const ehrlich = antwortLabel(f, wert);
      return p.wissen === "fremd"
        ? k.wahrheit.bw === "ja"
          ? `das weißt du nicht, du kennst ${w ? "sie" : "ihn"} nicht – du kannst ${w ? "sie" : "ihn"} kurz fragen, dann sagt ${w ? "sie" : "er"}: ${ehrlich}`
          : `das weißt du nicht, du kennst ${w ? "sie" : "ihn"} nicht`
        : p.kenntVorgeschichte === "teilweise" && /^(Ja|ja)/.test(ehrlich)
          ? `${ehrlich} (soweit du weißt)`
          : "das weißt du nicht genau";
    }
  }
  if (LAIE[f.id]?.[String(wert)]) {
    const t = fuellen(LAIE[f.id][String(wert)], { w, bezug: "", ort: "", name: "" }, Math.random);
    return k.anrufer.selbst && f.id === "bw" ? "du bist wach, aber dir geht es nicht gut" : t;
  }
  const label = antwortLabel(f, wert);
  if (label === "–") return null;
  return label === "Unbekannt" || label === "unbekannt" ? "das weißt du nicht" : label;
}

/** Fragen zur Vorgeschichte – weiß nur, wer den Patienten gut kennt */
const VORGESCHICHTE = new Set(["diabetiker", "epilepsie", "herz_vg", "herzleiden", "blutverduenner", "vg_schlaganfall", "vg_tia", "psych_vorerkrankung", "aneurysma", "bluter", "lungenerkrankung", "sonderdiagnose", "kokain"]);

/** Ist der Patient eine Frau? */
function patientW(k: AnrufKontext): boolean {
  return k.szenario ? k.szenario.patient.geschlecht === "w" : k.wahrheit.geschlecht === "w";
}

/** Fakten: jede Schemafrage mit der wahren Antwort (nur auf Nachfrage verraten) */
function faktenText(k: AnrufKontext): string {
  const idx = frageIndex(k.schema, k.kapitel);
  const zeilen: string[] = [];
  for (const id of Object.keys(k.wahrheit)) {
    const f: Frage | undefined = idx.get(id);
    if (!f || f.typ === "text" || f.typ === "kapitelwahl" || id === "anrufer") continue;
    const t = wahrheitText(k, f);
    if (t) zeilen.push(`- ${frageMitPronomen(f.text, patientW(k))} → ${t}`);
  }
  return zeilen.join("\n");
}

/** Was ein Laie über die Hauptbeschwerde sagt (je Kapitel) */
const KAPITEL_LAIE: Record<string, string> = {
  bauch: "hat starke Bauchschmerzen",
  allergie: "hat eine allergische Reaktion, Ausschlag und Schwellung",
  tierbiss: "ist von einem Tier gebissen worden",
  gewalt: "ist angegriffen worden",
  ruecken: "hat starke Rückenschmerzen",
  atemnot: "kriegt ganz schlecht Luft",
  brand: "hat sich verbrannt",
  gefahrstoff: "hat irgendwas eingeatmet, Rauch oder Gas",
  stillstand: "rührt sich nicht mehr",
  brustschmerz: "hat starke Schmerzen in der Brust",
  ersticken: "hat sich verschluckt",
  krampf: "hat einen Krampfanfall gehabt",
  zucker: "ist ganz komisch, mit dem Zucker stimmt wahrscheinlich was nicht",
  wasser: "war im Wasser, wir haben ihn rausgeholt",
  strom: "hat einen Stromschlag bekommen",
  auge: "hat was mit dem Auge",
  sturz: "ist gestürzt",
  kopfschmerz: "hat ganz starke Kopfschmerzen",
  herz: "hat Herzrasen bzw. Probleme mit dem Herz",
  hitze_kaelte: "war zu lange in der Hitze oder Kälte und ist ganz schwach",
  blutung: "blutet stark",
  eingeklemmt: "ist eingeklemmt",
  vergiftung: "hat Tabletten oder etwas anderes geschluckt",
  schwangerschaft: "ist schwanger und es geht ihr nicht gut",
  psych: "ist psychisch völlig durch den Wind",
  krank: "fühlt sich krank und schwach",
  stich_schuss: "ist verletzt worden, mit einem Messer oder ähnlichem",
  schlaganfall: "ist auf einmal ganz komisch, ich glaub, das ist ein Schlaganfall",
  verkehrsunfall: "ist in einen Unfall verwickelt",
  verletzung: "hat sich verletzt",
  bewusstlos: "ist umgekippt",
  unklar: "da stimmt was nicht, ich weiß nicht genau was",
  infekt: "hat hohes Fieber und Husten",
  alpin: "hat sich am Berg verletzt",
};

/** Wie der Anrufer den Patienten nennt */
function bezug(k: AnrufKontext): string {
  if (k.szenario) return bezugFuer(k.anrufer.rolle, k.anrufer.selbst, k.szenario.patient.geschlecht === "w", k.szenario.patient.alter);
  return bezugVon(k.anrufer, k.wahrheit.geschlecht === "w");
}

/** „mein Mann“ → „meinem Mann“, „ein Patient“ → „einem Patienten“ */
function dativ(b: string): string {
  return b
    .replace(/^eine ältere Frau$/, "einer älteren Frau")
    .replace(/^ein älterer Herr$/, "einem älteren Herrn")
    .replace(/^eine junge Frau$/, "einer jungen Frau")
    .replace(/^ein junger Mann$/, "einem jungen Mann")
    .replace(/^mein /, "meinem ")
    .replace(/^meine /, "meiner ")
    .replace(/^ein Patient$/, "einem Patienten")
    .replace(/^ein Kollege$/, "einem Kollegen")
    .replace(/^ein /, "einem ")
    .replace(/^eine /, "einer ");
}

function bezugVon(x: Anrufer, w: boolean): string {
  const r = x.rolle.toLowerCase();
  if (x.selbst) return "ich";
  if (/ehemann|ehefrau|lebensgef/.test(r)) return w ? "meine Frau" : "mein Mann";
  if (/^mutter|^vater/.test(r)) return w ? "meine Tochter" : "mein Sohn";
  if (/tochter|sohn/.test(r)) return w ? "meine Mutter" : "mein Vater";
  if (/pflege/.test(r)) return w ? "eine Bewohnerin" : "ein Bewohner";
  if (/arzt|ärzt/.test(r)) return w ? "eine Patientin" : "ein Patient";
  if (/lehrer/.test(r)) return w ? "eine Schülerin" : "ein Schüler";
  if (/kolleg/.test(r)) return w ? "eine Kollegin" : "ein Kollege";
  return w ? "eine Frau" : "ein Mann";
}

/** Vom Programm geschriebene Kernaussage auf „Was ist passiert?“ (passt immer zu den Fakten) */
export function schilderung(k: AnrufKontext): string {
  if (k.szenario && (!k.anrufer.art || ["privat", "einrichtung", "polizei"].includes(k.anrufer.art))) {
    const t = k.anrufer.selbst && k.szenario.hergangIch ? k.szenario.hergangIch : k.szenario.hergang;
    // die ersten ein, zwei Sätze – so erzählt man es am Telefon
    const saetze = t.match(/[^.!?…]+[.!?…]+/g) ?? [t];
    return saetze.slice(0, 2).map((x) => x.trim()).join(" ");
  }
  const wer = bezug(k);
  let was = KAPITEL_LAIE[thema(k.kapitel)] ?? "fühlt sich gar nicht gut";
  if (ist(k.kapitel, "anforderung_arzt")) {
    const g: Record<string, string> = { transport: "muss ins Krankenhaus, ist aber stabil", na: "braucht einen Notarzt", nah: "braucht den Hubschrauber", reanimiert: "ist gerade wiederbelebt worden", bewusstsein: "ist akut eingetrübt", atmung: "atmet akut schlecht", blutung: "blutet stark", herz: "hat Herzbeschwerden" };
    was = g[String(k.wahrheit.grund ?? "")] ?? "muss ins Krankenhaus";
  }
  if (ist(k.kapitel, "ecall")) {
    const v: Record<string, string> = { keine: "Wir hatten einen Unfall, aber ich glaub, es ist keiner verletzt.", leicht: "Wir hatten einen Unfall, es tut nur ein bissl weh.", eine: "Wir hatten einen Unfall, und eine Person ist verletzt.", mehrere_1: "Wir hatten einen Unfall, zwei von uns sind verletzt.", mehrere_n: "Wir hatten einen schweren Unfall, mehrere sind verletzt.", unbekannt: "Wir hatten einen Unfall, ich weiß nicht, wie's den anderen geht." };
    return v[String(k.wahrheit.verletzte ?? "unbekannt")] ?? v.unbekannt;
  }
  if (k.anrufer.art === "leitstelle") return k.anrufer.meldung ?? "";
  if (ist(k.kapitel, "anforderung_polizei")) {
    const p = String(k.wahrheit.problem ?? "");
    const pt: Record<string, string> = { brust: "hat Brustschmerzen", geburt: "bekommt gerade ein Kind", krampf: "hat einen Krampfanfall gehabt", schlaganfall: "hat Anzeichen für einen Schlaganfall", psych: "ist in einem psychischen Ausnahmezustand", lebensbedrohlich: "ist schwer krank", gering: "hat leichte Beschwerden" };
    was = pt[p] ?? "hat ein medizinisches Problem";
  }
  if (wer === "ich")
    was = was
      .replace(/\bes geht ihr nicht gut\b/g, "mir geht's nicht gut")
      .replace(/\bhat\b/g, "hab")
      .replace(/\bist\b/g, "bin")
      .replace(/\bkriegt\b/g, "krieg")
      .replace(/\bfühlt\b/g, "fühl")
      .replace(/\bblutet\b/g, "blute")
      .replace(/\bsich\b/g, "mich")
      .replace(/\bwar\b/g, "war");
  const zusatz: string[] = [];
  if (k.wahrheit.bw === "nein") zusatz.push("reagiert nicht");
  else if (k.wahrheit.bw === "getruebt") zusatz.push("ist ganz benommen");
  if (k.wahrheit.at === "keine") zusatz.push("atmet nicht");
  else if (k.wahrheit.at === "agonal") zusatz.push("schnappt nur ganz selten nach Luft");
  else if (k.wahrheit.at === "abnorm" && !ist(k.kapitel, "atemnot")) zusatz.push("schnauft ganz schwer");
  const satz = `${wer === "ich" ? "Ich" : wer.charAt(0).toUpperCase() + wer.slice(1)} ${was}${zusatz.length && wer !== "ich" ? `, ${zusatz.join(" und ")}` : ""}.`;
  return k.anrufer.art === "polizei" ? `Die Streife meldet: ${satz.charAt(0).toLowerCase()}${satz.slice(1)}` : satz;
}

/** Fester Zustand in einem Satz (wird jeder Frage angehängt, damit die KI nicht abdriftet) */
function zustand(k: AnrufKontext): string {
  const t: string[] = [];
  if (k.wahrheit.bw === "ja" && k.wahrheit.verwirrt === "ja") t.push("ist wach und redet, aber durcheinander");
  else if (typeof k.wahrheit.bw === "string" && LAIE.bw[k.wahrheit.bw]) t.push(LAIE.bw[k.wahrheit.bw]);
  if (typeof k.wahrheit.at === "string" && LAIE.at[k.wahrheit.at]) t.push(LAIE.at[k.wahrheit.at]);
  const w = patientW(k);
  return t.length ? fuellen(`${k.anrufer.selbst ? "Zustand:" : w ? "Sie" : "Er"} ${t.join(" und ")} – daran ändert sich während des ganzen Gesprächs nichts.`, { w, bezug: "", ort: "", name: "" }, Math.random) : "";
}

/** Bekannte Antworten in Sätzen (Alltagssprache, wo möglich) */
function antwortSaetze(k: AnrufKontext): string {
  const w = patientW(k);
  const wer = k.anrufer.selbst ? "Du" : w ? "Sie" : "Er";
  const p = k.anrufer.persona;
  const fuell = (t: string) => fuellen(t, { w, bezug: "", ort: "", name: "" }, Math.random);
  const idx = frageIndex(k.schema, k.kapitel);
  const zeilen: string[] = [];
  const nurFakt: Antworten = {};
  for (const [id, wert] of Object.entries(k.wahrheit)) {
    if (["anrufer", "schilderung", "ort_adresse", "ort_zusatz", "rueckrufnummer", "kapitel"].includes(id)) continue;
    // kein bekannter Patient (Lichtsignale, Tier): nur die eigenen Fragen des Kapitels
    if (k.szenario?.ohnePatient && (id in k.szenario.zusatz || ["alter", "geschlecht", "bw", "at", "anzahl_patienten"].includes(id))) continue;
    // aus der Geschichte ergänzte „nein“-Antworten stehen schon in den Vorerkrankungen
    if (k.szenario && id in k.szenario.zusatz && (wert === "nein" || wert === "0") && SELBSTVERSTAENDLICH.has(id)) continue;
    // Schwangerschaft nur bei Frauen im passenden Alter
    if (/schwanger|entbunden/.test(id) && (!w || (k.szenario && (k.szenario.patient.alter < 12 || k.szenario.patient.alter > 55)))) continue;
    const f = idx.get(id);
    if (id === "bw" && wert === "ja" && k.wahrheit.verwirrt === "ja") {
      zeilen.push(`- ${wer}: ist wach und redet, aber durcheinander`);
      continue;
    }
    if (LAIE[id]?.[String(wert)]) {
      zeilen.push(`- ${wer}: ${fuell(LAIE[id][String(wert)])}`);
      continue;
    }
    // Vorgeschichte und Alter: was dieser Anrufer davon weiß (siehe DEINE ART)
    if (p && !k.anrufer.selbst && ((VORGESCHICHTE.has(id) && p.kenntVorgeschichte !== "ja") || id === "alter")) continue;
    if (faktSaetze({ [id]: wert }, w).length) {
      nurFakt[id] = wert;
      continue;
    }
    if (!f || f.typ === "text" || f.typ === "kapitelwahl") continue;
    const t = wahrheitText(k, f);
    if (t) zeilen.push(`- ${frageMitPronomen(f.text, w)} → ${t}`);
  }
  for (const s of faktSaetze(nurFakt, w)) zeilen.push(`- ${s}`);
  if (k.szenario && !k.szenario.ohnePatient && (!p || p.kenntVorgeschichte === "ja" || k.anrufer.selbst))
    zeilen.push(`- Alles, was oben nicht als Vorerkrankung oder Medikament steht, ${k.anrufer.selbst ? "hast bzw. nimmst du nicht" : `hat bzw. nimmt ${w ? "sie" : "er"} nicht (soweit du weißt)`}.`);
  return [...new Set(zeilen)].join("\n");
}

const BEISPIELE: Record<Anrufer["emotion"], string> = {
  ruhig: "„Ja, also … {er} liegt jetzt am Sofa, {er} sagt, {ihm} ist schwindlig.“ / „Moment, ich schau … nein, Blut seh ich keines.“",
  gefasst: "„Ja, {er} redet mit mir, aber {er} ist ganz blass.“ / „Seit dem Mittagessen ungefähr. Kommen Sie bald?“",
  aufgeregt: "„Ja, ja, {er} schaut mich an, aber {er} sagt nix Gscheites!“ / „Ich weiß nicht, vielleicht zehn Minuten? Bitte beeilen Sie sich!“",
  panisch: "„{Er} atmet – ich glaub – ich weiß nicht! Bitte schnell!“ / „Ja … okay … ich mach's, ich mach's!“",
};

/** Anweisung für Anrufer mit Fallgeschichte: menschlich, mit Fallakte statt Frageliste */
function promptGeschichte(k: AnrufKontext): string {
  const x = k.anrufer;
  const sz = k.szenario!;
  const art = x.art ?? "privat";
  const laie = art === "privat";
  const bz = bezug(k);
  const ich = x.selbst;
  const telefon = /telemed|141|1450|gesundheitshotline/i.test(`${x.rolle} ${x.stelle ?? ""}`);
  const quelle: "vorort" | "polizei" | "telefon" = art === "polizei" ? "polizei" : telefon ? "telefon" : "vorort";
  const wer = sz.ohnePatient
    ? "Du rufst an, weil du etwas beobachtet hast bzw. weil dir etwas passiert ist (siehe Fallakte)."
    : ich
    ? "Du bist selbst der Patient."
    : art === "polizei"
      ? `Du bist ${x.rolle}. Du meldest dich mit „Landesleitzentrale der Polizei, ${x.name}“. Du sprichst für die Streife vor Ort: Was in der Fallakte steht, hat sie dir gemeldet. Weißt du etwas nicht, sagst du „Moment, ich frag bei der Streife nach …“ und gibst dann eine Antwort, die zur Fallakte passt. Du sprichst ruhig, sachlich und knapp, wie Polizei am Telefon.`
      : telefon
        ? `Du bist ${x.rolle}${x.stelle && !x.rolle.includes(x.stelle) ? ` (${x.stelle})` : ""}. Du bist NICHT beim Patienten, sondern hast gerade mit ${dativ(bz)} telefoniert und forderst jetzt die Rettung an. Du sprichst ruhig, fachlich und knapp; was du nicht weißt, sagst du ehrlich („Das hab ich nicht gefragt“).`
        : art === "einrichtung"
      ? `Du bist ${x.rolle}${x.stelle ? ` (${x.stelle})` : ""} und rufst wegen ${dativ(bz)} an. Du sprichst ruhig und fachlich, aber knapp.`
      : `Du bist ${x.rolle} und rufst wegen ${dativ(bz).replace(/^meinem /, "deinem ").replace(/^meiner /, "deiner ")} an.`;
  const ort = k.ortUnbekannt
    ? `Wo du bist, weißt du NICHT genau. Auf die Frage nach dem Ort beschreibst du nur, was du weißt und siehst: „${k.adresse}“. Straße und Hausnummer kennst du nicht.`
    : `Die Adresse, die du nennst: ${k.adresse}. Stock, Tür und Zufahrt sagst du, wenn danach gefragt wird.`;
  return [
    `Du spielst in einer Trainingssimulation eine echte Person, die beim Rettungsnotruf 144 in Niederösterreich anruft.${laie ? " Du bist KEIN Sanitäter und kein Arzt." : ""} Du sagst nur, was diese Person ins Telefon spricht: gesprochene Sprache, Ich-Form, Deutsch – keine Regieanweisungen, keine Sternchen, keine Listen.`,
    `WER DU BIST: ${x.name}. ${wer} Rückrufnummer: ${x.nummer}.`,
    ort,
    `FALLAKTE – das ist wirklich passiert. Alles, was du sagst, muss dazu passen. Erfinde nichts, was dem widerspricht; was hier nicht steht, beantwortest du so, wie es zu dieser Geschichte passt, oder sagst ehrlich, dass du es nicht weißt.${ich ? " („Er/sie“ in der Fallakte meint dich selbst.)" : ""}`,
    fallakte(sz, {
      selbst: ich,
      bezug: bz,
      quelle,
      fremd: !ich && (x.persona ? x.persona.wissen === "fremd" : /passant|lenker|mitarbeiter|bademeister|wirt|kellner|polizei|beamt/i.test(x.rolle)),
      hausarztIch: /^haus(arzt|ärztin)/i.test(x.rolle),
      vorgeschichte: x.persona?.wissen === "bekannt" ? x.persona.kenntVorgeschichte : undefined,
    }),
    `DAS STIMMT SICHER (nur wenn die Leitstelle danach fragt, in deinen eigenen Worten):`,
    antwortSaetze(k),
    `WIE DU REDEST:`,
    `- Du bist ein Mensch in einer Ausnahmesituation, kein Formular. Rede, wie Leute am Telefon reden: mal unvollständige Sätze, mal ein „äh“, „Moment“, „jo“, „bitte“ – aber nicht übertrieben und nicht in jeder Antwort.`,
    `- Beantworte, was gefragt wird, meist in ein bis zwei kurzen Sätzen. Ab und zu sagst du dazu, was dich gerade beschäftigt („Bitte kommen S' schnell“, „${ich ? "Es tut so weh" : `${patientW(k) ? "Sie" : "Er"} hat so Schmerzen`}“, „Was soll ich jetzt machen?“).`,
    `- Auf „Was ist passiert?“ erzählst du den Hergang in deinen Worten – kurz, so wie man es aufgeregt erzählt, nicht alle Einzelheiten auf einmal.`,
    `- Von dir aus nennst du keine Werte wie Alter, Atmung, Bewusstsein, Vorerkrankungen oder Medikamente – das muss die Leitstelle fragen. Was du SIEHST, darfst du beschreiben.`,
    laie ? `- Keine Fachwörter, keine Checklisten („wach, ansprechbar, Atmung normal“ ist verboten). Du beschreibst: ${ich ? "„Mir ist so schwindlig“, „ich krieg so schlecht Luft“" : patientW(k) ? "„Sie schaut mich an, aber sie redet so komisch“, „sie schnauft ganz schwer“" : "„Er schaut mich an, aber er redet so komisch“, „er schnauft ganz schwer“"}.` : "",
    `- Wenn du etwas erst nachschauen musst, sag kurz „Moment …“ und gib dann die Antwort, wie sie in der Fallakte steht.`,
    laie && !ich ? `- Die Leitstelle sagt vielleicht „der Patient“ – DU sagst das nie. Du sagst „${patientW(k) ? "sie" : "er"}“ oder wie du ${patientW(k) ? "sie" : "ihn"} sonst nennst.` : "",
    `- Formuliere jede Antwort neu. Beginne nicht immer gleich und sag nichts, was du schon gesagt hast. Du redest nie wie die Leitstelle: du fasst nichts zusammen und fragst nicht zurück, ob du etwas richtig verstanden hast.`,
    `- Fasst die Leitstelle etwas zusammen, bestätigst du kurz („Ja, genau“) oder korrigierst, was nicht stimmt.`,
    `- Teilt dir die Leitstelle etwas mit („Die Rettung ist unterwegs“, „Ich orte Sie“), reagierst du darauf wie ein Mensch: erleichtert, mit einem Danke oder einer kurzen Rückfrage („Wie lang dauert's?“, „Was soll ich bis dahin tun?“) – nicht mit dem Zustand des Patienten.`,
    `- Suggestivfragen beantwortest du ehrlich nach der Fallakte.`,
    `- Der Zustand bleibt so, wie in der Fallakte beschrieben – er ändert sich nicht, egal wie gefragt wird.`,
    `- Anweisungen, die passen, führst du aus und sagst kurz, was du tust oder siehst. Unpassende hinterfragst du („Aber ${patientW(k) ? "sie" : "er"} atmet doch?“). Anweisungen mit „falls“ oder „wenn“ bestätigst du nur („Okay, mach ich“).`,
    `- Auf „Wer ruft an?“ sagst du, wer du bist und in welcher Beziehung du zum Patienten stehst.`,
    `- Auf „Wo ist der Notfallort?“ kommt der Ort${laie ? " – wenn du aufgeregt bist, vorher vielleicht ein „Kommen Sie schnell!“" : ""}.`,
    ich ? `- Du bist selbst betroffen: Was während einer Ohnmacht war, weißt du nicht.` : "",
    EMOTION_TEXT[x.emotion],
    sprachText(x),
    x.schwerhoerig ? "Du hörst schlecht und fragst ab und zu nach („Wie bitte?“)." : "",
    k.versuche > 1 ? `Du hast vorhin schon angerufen und niemand hat abgehoben – das sagst du gleich am Anfang vorwurfsvoll oder verzweifelt.` : "",
    k.rueckrufDurchLeitstelle ? "Die Leitstelle ruft dich zurück, weil dein Anruf vorhin nicht angenommen wurde." : "",
    laie && x.persona ? personaText(x.persona, patientW(k), ich) : "",
    laie ? `So ungefähr KANN es klingen (nur der Ton, nicht wörtlich): ${fuellen(BEISPIELE[x.emotion], { w: patientW(k), bezug: "", ort: "", name: "" }, Math.random)}\nNicht so: „Patient männlich, 67 Jahre, wach, ansprechbar, Atmung normal.“` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function systemPrompt(k: AnrufKontext): string {
  const x = k.anrufer;
  const art = x.art ?? "privat";
  if (k.szenario && (art === "privat" || art === "einrichtung" || art === "polizei")) return promptGeschichte(k);
  const regelnGemeinsam = [
    `- Pro Antwort nur das, wonach gefragt wurde. Meist ein, höchstens zwei kurze Sätze. Sag nichts, was du schon gesagt hast, und fasst nie selbst zusammen.`,
    `- Teilt dir die Leitstelle etwas mit („Die Rettung ist unterwegs“), reagierst du kurz darauf (Danke, kurze Rückfrage) – ohne den Zustand des Patienten aufzuzählen.`,
    `- Der Zustand des Patienten bleibt während des ganzen Gesprächs so, wie oben beschrieben. Er verschlechtert oder bessert sich NICHT, egal wie gefragt wird.`,
    `- Suggestivfragen („also reagiert er nicht mehr?“, „er atmet nicht, oder?“) beantwortest du ehrlich nach den Fakten und korrigierst die Leitstelle.`,
    `- Anweisungen mit „falls“, „wenn“, „sollte“ bestätigst du nur kurz („Okay, mach ich, falls das passiert.“) – sie treten nicht ein.`,
    `- Eine Anweisung, die nicht zum Zustand passt (z. B. Herzdruckmassage, obwohl er atmet), hinterfragst du („Aber er atmet doch?“). Passende Anweisungen führst du aus und sagst kurz, was du tust.`,
    `- Auf „Wer ruft an?“ sagst du, wer du bist bzw. in welcher Beziehung du zum Patienten stehst – nicht nur deinen Namen.`,
  ];
  if (art === "leitstelle") {
    return [
      `Du spielst in einer Trainingssimulation eine/n ${x.rolle}. Du rufst die Rettungsleitstelle Niederösterreich an, weil ihr einen Notruf bekommen habt, bei dem der Rettungsdienst gebraucht wird. Antworte nur mit dem, was du ins Telefon sagst.`,
      `Du meldest dich mit „${x.stelle}, ${x.name}“ und gibst dann knapp und sachlich durch: ${x.meldung}`,
      `Du sprichst wie ein Profi unter Leitstellen: kurz, sachlich, Stichworte. Eine medizinische Abfrage machst du nicht – Fragen zum Patienten beantwortest du nur mit dem, was du aus deinem Notruf weißt; alles andere „wissen wir nicht, unsere Kräfte sind noch nicht vor Ort“.`,
      `Rückrufnummer: ${x.nummer}.`,
    ].join("\n");
  }
  if (art === "ecall") {
    return [
      `Du spielst in einer Trainingssimulation eine/n ${x.rolle}. Dein Auto hat gerade einen Unfall gehabt, das System hat automatisch die Rettung verständigt und jetzt spricht die Leitstelle über die Freisprechanlage mit dir.`,
      `Unfallort: ${k.adresse}.`,
      `Diese Fakten stimmen (nur auf Nachfrage, in Alltagssprache):`,
      faktenText(k),
      ...regelnGemeinsam,
      EMOTION_TEXT[x.emotion],
      sprachText(x),
    ].join("\n");
  }
  const wer =
    art === "polizei"
      ? `Du bist ${x.rolle}. Du sprichst für die Streife vor Ort: Was die Streife gemeldet hat, weißt du; anderes fragst du bei der Streife nach („Moment, ich frag bei der Streife nach … “) und gibst dann die Antwort.`
      : art === "einrichtung"
        ? `Du bist ${x.rolle} (${x.stelle}). Du rufst wegen ${dativ(bezug(k))} an. Du sprichst ruhig und fachlich korrekt, aber knapp.`
        : x.selbst
          ? "Du bist selbst der Patient."
          : `Du bist ${x.rolle} und rufst wegen ${dativ(bezug(k)).replace(/^meinem /, "deinem ").replace(/^meiner /, "deiner ")} an.`;
  const ort = k.ortUnbekannt
    ? `Du weißt NICHT genau, wo du bist. Wenn nach dem Ort gefragt wird, beschreibst du nur grob, was du weißt und siehst: „${k.adresse}“. Eine Straße mit Hausnummer kennst du nicht.`
    : `Die Adresse, die du nennst: ${k.adresse}. Stockwerk, Tür oder Zufahrt sagst du nur, wenn extra danach gefragt wird.`;
  const laie = art === "privat";
  return [
    `Du spielst in einer Trainingssimulation eine echte Person, die beim Rettungsnotruf 144 in Niederösterreich anruft.${laie ? " Du bist KEIN Sanitäter und kein Arzt." : ""} Antworte nur mit dem, was diese Person ins Telefon sagt: Ich-Form, Deutsch, keine Regieanweisungen, keine Sternchen, keine Aufzählungen.`,
    `Wer du bist: ${x.name}. ${wer} Ort: ${x.ort}. Rückrufnummer: ${x.nummer}.`,
    ort,
    art === "polizei" ? `Du meldest dich mit „Landesleitzentrale der Polizei, ${x.name}“.` : "",
    `Auf „Was ist passiert?“ sagst du sinngemäß nur das: „${schilderung(k)}“ – in deinen eigenen Worten, nicht mehr.`,
    `Hintergrund (GEHEIM, nur damit du die Lage verstehst – sprich diese Fachwörter NIE aus): ${k.lage}.`,
    `Diese Fakten stimmen. Du sagst sie NUR, wenn die Leitstelle genau danach fragt – jeweils nur den einen Punkt${laie ? ", in Alltagssprache" : ""}:`,
    faktenText(k),
    `So redest du:`,
    ...regelnGemeinsam,
    `- Von dir aus nennst du NIE Alter, Geschlecht, Bewusstsein, Atmung, Vorerkrankungen oder Medikamente. Die Leitstelle muss das einzeln erfragen.`,
    laie ? `- Keine Fachbegriffe und keine Checklisten („wach, ansprechbar, Atmung normal“ ist verboten). Du beschreibst, was du siehst und hörst: „Er redet so komisch“, „sie schnauft ganz schwer“.` : "",
    `- Auf „Wo ist der Notfallort?“ kommt die Adresse – sonst nichts.${laie ? " Wenn du panisch bist, darf vorher ein Ausruf kommen wie „Kommen Sie schnell!“." : ""}`,
    x.selbst ? `- Du bist selbst betroffen: Was während einer Ohnmacht war, weißt du nicht; du erzählst nur, wie es dir ging und geht.` : "",
    `- Wenn du etwas nicht weißt, sag das ehrlich. Wenn etwas gefragt wird, das oben nicht steht, antworte passend zur Lage, ohne den Fakten zu widersprechen.`,
    EMOTION_TEXT[x.emotion],
    sprachText(x),
    x.schwerhoerig ? "Du hörst schlecht und fragst ab und zu nach („Wie bitte?“)." : "",
    k.versuche > 1 ? `Du hast vorhin schon angerufen und niemand hat abgehoben – das sagst du gleich am Anfang vorwurfsvoll oder verzweifelt.` : "",
    k.rueckrufDurchLeitstelle ? "Die Leitstelle ruft dich zurück, weil dein Anruf vorhin nicht angenommen wurde." : "",
    laie ? `Beispiele, wie es klingen soll:\nLeitstelle: Wo genau ist der Notfallort? → „Hauptstraße 12 in Gföhl.“\nLeitstelle: Ist er wach? → „Ja … also er schaut mich an, aber er sagt nix Gscheites.“\nLeitstelle: Also reagiert er nicht mehr? (obwohl er wach ist) → „Doch, doch, er schaut mich eh an.“\nFALSCH wäre: „Patient männlich, 67 Jahre, wach, ansprechbar, Atmung normal.“` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Kurzer Hinweis, der jeder Frage angehängt wird (hält kleine Modelle auf Kurs) */
export function erinnerung(
  k: AnrufKontext,
  schemaFrage?: Frage,
  opt: { wiederholt?: boolean; letzteAntwort?: string; art?: NachrichtArt; text?: string; erste?: boolean } = {},
): string {
  const laie = (k.anrufer.art ?? "privat") === "privat";
  const art: NachrichtArt = schemaFrage ? "frage" : (opt.art ?? "frage");
  const teile: string[] = [];
  if (opt.erste && laie && (k.versuche > 1 || k.rueckrufDurchLeitstelle))
    teile.push(
      k.rueckrufDurchLeitstelle
        ? "Die Leitstelle ruft dich zurück, weil vorhin keiner abgehoben hat. Sag zuerst kurz etwas wie „Ja? … Ach, die Rettung – endlich! Ich hab vorhin schon angerufen!“ und dann, wo ihr seid."
        : "Du hast vorhin schon angerufen und keiner hat abgehoben – sag das zuerst kurz (vorwurfsvoll oder verzweifelt), dann, wo ihr seid.",
    );
  const einstieg = !!opt.erste && laie && !!k.anrufer.persona && !k.ortUnbekannt && !(k.versuche > 1 || k.rueckrufDurchLeitstelle) && (schemaFrage?.id === "ort_adresse" || /notfallort/i.test(opt.text ?? ""));
  if (einstieg) {
    teile.push(einstiegHinweis(k.anrufer.persona!, k.adresse));
  } else if (art === "frage") {
    teile.push("Antworte nur auf diese eine Frage, kurz, ohne weitere Details von dir aus.");
    if (opt.wiederholt) teile.push("Diese Frage hat die Leitstelle schon einmal gestellt: antworte kurz mit „Wie gesagt, …“ und denselben Fakten, aber in anderen Worten.");
    if (!schemaFrage)
      teile.push(
        k.szenario
          ? "Geh genau auf DIESE Frage ein und antworte passend zur Fallakte, menschlich und in deinen eigenen Worten."
          : "Das ist eine eigene Frage der Leitstelle: Geh genau auf DIESE Frage ein und antworte nach den Fakten oben.",
      );
  } else teile.push(hinweisZurArt(art, laie));
  if (opt.letzteAntwort && !opt.wiederholt) teile.push(`Deine letzte Antwort war „${opt.letzteAntwort}“ – fang nicht wieder so an und sag nichts davon noch einmal.`);
  // Zustand nur dazu, wenn es darum geht – sonst sagt die KI ihn bei jeder Gelegenheit auf
  const z = zustand(k);
  const umZustand = art === "anweisung" || (!!opt.text && fragtNachZustand(opt.text)) || (!!schemaFrage && ["bw", "at"].includes(schemaFrage.id));
  if (z && k.anrufer.art !== "leitstelle" && (umZustand || (art === "frage" && !k.szenario))) teile.push(z);
  if (schemaFrage) {
    let t: string | null;
    if (schemaFrage.id === "ort_adresse") t = einstieg && ["problem", "unvollstaendig"].includes(k.anrufer.persona!.einstieg) ? null : k.ortUnbekannt ? `du weißt es nicht genau: ${k.adresse}` : k.adresse;
    else if (schemaFrage.id === "schilderung")
      t = k.szenario?.geschehen?.length
        ? "erzähl in deinen eigenen Worten, was passiert ist (siehe WAS WIRKLICH PASSIERT IST) – kurz, so wie man es am Telefon erzählt, nicht alles auf einmal und nicht wörtlich"
        : k.szenario
          ? `erzähl den Hergang aus der Fallakte in deinen Worten (Kern: ${schilderung(k)})`
          : schilderung(k);
    else if (schemaFrage.id === "anrufer") t = werText(k.anrufer);
    else t = wahrheitText(k, schemaFrage);
    if (t) teile.push(k.szenario ? `Die ehrliche Antwort darauf ist: ${t} – sag es in deinen eigenen Worten, wie ein Mensch am Telefon.` : `Die ehrliche Antwort darauf ist: ${t}.`);
  }
  return `[Hinweis nur für dich, nicht aussprechen: ${teile.join(" ")}]`;
}

/** Antwort ohne KI auf die Eröffnung „Wo genau ist der Notfallort?“ */
export function ersterSatzOhneKi(k: AnrufKontext): string {
  const x = k.anrufer;
  if (x.art === "leitstelle") return `${x.stelle}, ${x.name}. ${x.meldung}`;
  if (x.art === "ecall") return x.meldung ?? "Automatische Unfallmeldung.";
  if (x.art === "polizei") return `Landesleitzentrale der Polizei, ${x.name}. Eine Streife braucht die Rettung: ${k.adresse}.`;
  if (x.art === "einrichtung") return `${x.stelle}, ${x.name}. Wir bräuchten die Rettung: ${k.adresse}.`;
  const vorher = k.versuche > 1 ? "Ich hab vorhin schon angerufen! " : "";
  const dringend = x.emotion === "panisch" ? "Schnell, bitte kommen Sie! " : "";
  const ort = k.ortUnbekannt ? `Ich weiß nicht genau … ${k.adresse}.` : `${k.adresse}.`;
  if (k.rueckrufDurchLeitstelle) return `Ja, hallo? Ach, die Rettung … ja, ich hab angerufen. ${dringend}${ort}`;
  return `${vorher}${dringend}${ort}`;
}


/** Antwort ohne KI auf eine Schemafrage: die wahre Antwort in einfacher Form */
export function antwortOhneKi(k: AnrufKontext, frage: Frage): string {
  if (frage.id === "ort_adresse") return k.ortUnbekannt ? `Ich weiß nicht genau … ${k.adresse}.` : k.adresse;
  if (frage.id === "rueckrufnummer") return k.anrufer.nummer;
  if (frage.id === "schilderung") return schilderung(k);
  if (frage.id === "anrufer") return werText(k.anrufer);
  if (LAIE[frage.id] && typeof k.wahrheit[frage.id] === "string") {
    const t = wahrheitText(k, frage);
    if (t) return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
  }
  const w = k.wahrheit[frage.id];
  if (w === undefined || w === null) return "Das weiß ich nicht.";
  const label = antwortLabel(frage, w);
  if (label === "Unbekannt" || label === "unbekannt") return "Das weiß ich nicht.";
  return label.replace(/^Ja\b.*/, (m) => (m === "Ja" ? "Ja." : m)).replace(/^Nein$/, "Nein.");
}
