/**
 * KI-Anrufer: Wer ruft an (passend zur Lage, mit Zufall), was weiß er, wie spricht er.
 * Erzeugt die Anweisung für das Sprachmodell und einfache Antworten ohne KI.
 */
import { ortKategorie } from "../data/orte";
import { ortProfil, PERSONAL } from "../data/ortProfile";
import { fragtNachZustand, hinweisZurArt, type NachrichtArt } from "./runde";
import { antwortLabel, frageIndex, type Antworten, type Frage, type Schema } from "./schema";
import { ist, thema } from "./themen";
import { bezugFuer, fallakte, faktSaetze, fuellen, ORT_IM_FREIEN, SELBSTVERSTAENDLICH, type AnruferTyp, type OrtArt, type OrtModus, type Szenario } from "./szenario";
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
  /** andere Leitstelle (Flughafen): nur diese Abfrage-Felder sind bekannt, sonst „unbekanntSatz“ */
  nurBekannt?: string[];
  unbekanntSatz?: string;
  /** Art des Anrufers (aus der Fallgeschichte) */
  typ?: AnruferTyp;
  /** Persönlichkeit: Wissen, Art zu reden, Einstieg, Wörter für den Patienten */
  persona?: Persona;
}

/** Wo kann dieser Anrufer sein? (fehlt = überall) */
const ORT_ANRUFER: Partial<Record<AnruferTyp, OrtArt[]>> = {
  partner: ["wohnung", "haus", "garten", "strasse", "geschaeft", "lokal", "freizeit", "natur", "wasser", "auto", "arzt", "bahnhof", "sport", "landstrasse", "autobahn", "feldweg", "wald", "berg", "ufer", "feld"],
  kind: ["wohnung", "haus", "garten", "strasse", "geschaeft", "lokal", "freizeit", "natur", "auto", "arzt", "pflegeheim", "landstrasse", "autobahn", "feldweg", "feld"],
  eltern: ["wohnung", "haus", "garten", "strasse", "geschaeft", "freizeit", "natur", "wasser", "auto", "arzt", "sport", "bahnhof", "landstrasse", "autobahn", "feldweg", "wald", "berg", "ufer"],
  nachbar: ["wohnung", "haus", "garten", "strasse"],
  fern: ["wohnung", "haus", "garten"],
  pflege: ["pflegeheim", "wohnung", "haus"],
  arzt: ["arzt", "wohnung", "haus", "pflegeheim"],
  ordi: ["arzt"],
  lehrer: ["schule", "sport", "freizeit"],
  kollege: ["arbeit", "baustelle", "geschaeft", "lokal", "wald", "feld", "autobahn", "landstrasse"],
  passant: ["strasse", "geschaeft", "freizeit", "natur", "bahnhof", "sport", "lokal", "wasser", "auto", "garten", "landstrasse", "autobahn", "feldweg", "wald", "berg", "ufer", "feld"],
  verkauf: ["geschaeft", "bahnhof"],
  lenker: ["strasse", "auto", "landstrasse", "autobahn"],
  trainer: ["sport"],
  bademeister: ["wasser", "freizeit", "sport"],
  bahnpersonal: ["bahnhof"],
  busfahrer: ["strasse"],
  tierpfleger: ["freizeit"],
  aufsicht: ["freizeit", "geschaeft", "sport", "lokal"],
  rezeption: ["lokal", "freizeit"],
  wirt: ["lokal"],
};

/** Wie oft Notfälle an welchem Ort passieren, wenn ein Fall „überall“ vorkommen darf (0 = nur mit eigener Geschichte) */
export const ORT_GEWICHT: Record<OrtArt, number> = {
  wohnung: 5,
  haus: 4,
  garten: 0.8,
  pflegeheim: 1.5,
  strasse: 2,
  geschaeft: 1.5,
  lokal: 1,
  arbeit: 1.5,
  baustelle: 0,
  schule: 0.8,
  sport: 0.7,
  freizeit: 1,
  natur: 0,
  wasser: 0,
  auto: 0,
  arzt: 0.7,
  bahnhof: 0.5,
  // im Freien ohne Adresse: selten, aber möglich (Kollaps beim Wandern, am Radweg, im Weingarten)
  landstrasse: 0.6,
  autobahn: 0.2,
  feldweg: 0.3,
  wald: 0.2,
  berg: 0.1,
  ufer: 0.15,
  feld: 0.2,
};

/** Mögliche Einsatzorte eines Falls mit Gewicht – nach Modus (nur/überall/außer) und passend zu den Anrufern */
export function ortKandidaten(v: { orte: OrtArt[]; ortModus?: OrtModus; anrufer: AnruferTyp[] }): [OrtArt, number][] {
  if (!v.ortModus || v.ortModus === "nur") return v.orte.map((o) => [o, 1]);
  const alle = (Object.keys(ORT_GEWICHT) as OrtArt[]).filter((o) => ORT_GEWICHT[o] > 0 && (v.ortModus === "ueberall" || !v.orte.includes(o)));
  const passend = alle.filter((o) => !v.anrufer.length || v.anrufer.some((t) => !ORT_ANRUFER[t] || ORT_ANRUFER[t]!.includes(o)));
  return (passend.length ? passend : alle.length ? alle : (["wohnung"] as OrtArt[])).map((o) => [o, ORT_GEWICHT[o]]);
}

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
  geschichte?: { typen: AnruferTyp[]; ort: string; ortArt?: OrtArt; ortKat?: string; geschlossen?: boolean },
  /** Was steht wirklich an der Adresse? (Pflegeheim, Arztpraxis, Schule – aus den Orten/POIs); fehlt es, wird es geschätzt */
  amOrt?: { arten: OrtArt[]; name?: string },
): Anrufer {
  // Anrufer aus einer Einrichtung nur, wenn die Adresse auch diese Einrichtung ist (kein Pflegeheim aus einem Privathaus)
  // (spielt die Fallgeschichte dort, gilt sie – das Spiel wählt solche Geschichten nur, wo es den Ort gibt)
  const hier = (art: OrtArt, muster: RegExp) => geschichte?.ortArt === art || (amOrt ? amOrt.arten.includes(art) : muster.test(adresse));
  const heimHier = hier("pflegeheim", /pflege|senioren|altenheim|\bpbz\b|heim\b/i);
  const praxisHier = hier("arzt", /ordination|praxis|\bdr\.|ärzt|arzt/i);
  const schuleHier = hier("schule", /schule|kindergarten|\bhort\b|\bbg\b|\bbrg\b|\bhak\b|\bhtl\b/i);
  const sonder = sonderAnrufer(kapitel, a, rnd, adresse, geschichte, { heim: heimHier, name: amOrt?.name });
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
  if (heimHier) add({ ort: "Pflegeheim", rolle: "Pflegekraft im Pflegeheim", anruferWert: "einrichtung", profi: true, typ: "pflege" }, alt ? 4 : alter >= 65 ? 1 : 0);
  else add({ ort: "Wohnung", rolle: "Pflegekraft der mobilen Hauskrankenpflege", anruferWert: "einrichtung", profi: true, typ: "pflege" }, alt ? 0.6 : 0);
  const hausarzt = !kind && ist(kapitel, "brustschmerz", "atemnot", "krank", "schlaganfall", "bauch", "herz", "kopfschmerz") ? 1 : 0.2;
  add({ ort: praxisHier ? "Arztpraxis" : "Wohnung (Hausbesuch)", rolle: "Hausärztin/Hausarzt", anruferWert: "einrichtung", profi: true, typ: "arzt" }, praxisHier ? hausarzt : hausarzt / 2);
  if (praxisHier) add({ ort: "Arztpraxis", rolle: "Ordinationsassistentin am Empfang", anruferWert: "einrichtung", geschlecht: "w", typ: "ordi" }, !kind ? 0.6 : 0.2);
  if (schuleHier) add({ ort: "Schule / Kindergarten", rolle: "Lehrerin", anruferWert: "2", geschlecht: "w", typ: "lehrer" }, kind && alter >= 3 ? 1.5 : 0);
  add({ ort: "Arbeitsplatz", rolle: rnd() < 0.5 ? "Arbeitskollege" : "Arbeitskollegin", anruferWert: "2", typ: "kollege" }, alter >= 17 && alter < 66 ? 1.5 : 0);
  // Draußen
  add({ ort: "Straße / Gehsteig", rolle: "Passant", anruferWert: "2", typ: "passant" }, draussen ? 5 : 1);
  add({ ort: "Geschäft", rolle: "Mitarbeiterin im Geschäft", anruferWert: "2", geschlecht: "w", typ: "verkauf" }, 0.6);
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
      bahnpersonal: { ort: "", rolle: rnd() < 0.6 ? "Mitarbeiter der ÖBB" : "Mitarbeiterin der ÖBB", anruferWert: "2", typ: "bahnpersonal" },
      busfahrer: { ort: "", rolle: rnd() < 0.7 ? "Busfahrer" : "Busfahrerin", anruferWert: "2", typ: "busfahrer" },
      tierpfleger: { ort: "", rolle: rnd() < 0.5 ? "Tierpfleger" : "Tierpflegerin", anruferWert: "2", typ: "tierpfleger" },
      aufsicht: { ort: "", rolle: rnd() < 0.5 ? "Mitarbeiter vor Ort" : "Mitarbeiterin vor Ort", anruferWert: "2", typ: "aufsicht" },
      rezeption: { ort: "", rolle: rnd() < 0.6 ? "Mitarbeiterin an der Rezeption" : "Mitarbeiter an der Rezeption", anruferWert: "2", typ: "rezeption" },
    };
    // Selbst anrufen geht nur wach und mit ausreichender Atmung; der Anrufer muss zum Ort und zum Alter passen
    const altersGerecht = (t: AnruferTyp) => (t === "eltern" ? alter < 30 : t === "kind" ? alter >= 45 : t === "partner" ? alter >= 20 : t === "lehrer" ? alter < 20 : t === "kollege" ? alter >= 16 && alter < 67 : t === "trainer" ? alter < 45 : true);
    let typen = anruferAmOrt(geschichte.typen, geschichte.ortArt).filter((t) => t !== "selbst" || kannSelbst);
    // echter Ort: wer dort anruft (Freibad: Bademeister; Badesee: keiner; Bahnhof: auch ÖBB-Personal)
    const prof = ortProfil(geschichte.ortKat);
    if (prof?.anrufer) {
      const fremdeOk = typen.some((t) => t === "passant" || t === "begleiter");
      const ziel = prof.anrufer.filter((t) => (typen.includes(t) || (fremdeOk && PERSONAL.includes(t))) && (t !== "selbst" || kannSelbst));
      if (ziel.length) typen = ziel;
    }
    // Ort hat zu: kein Personal da – es ruft jemand an, der vorbeikommt oder dabei ist
    if (geschichte.geschlossen) {
      const ohne = typen.filter((t) => !PERSONAL.includes(t) && t !== "pflege" && t !== "ordi");
      typen = ohne.length ? ohne : ["passant"];
    }
    if (typen.some(altersGerecht)) typen = typen.filter(altersGerecht);
    const erlaubt = kandidaten.filter(([x]) => x.typ && typen.includes(x.typ));
    const pool: [Situation, number][] = erlaubt.length ? erlaubt : typen.map((t) => [ersatz[t], 1] as [Situation, number]);
    if (!erlaubt.length && !pool.length) pool.push([ersatz.passant, 1]);
    kandidaten.length = 0;
    for (const [x, w] of pool) kandidaten.push([{ ...x, ort: geschichte.ort }, w]);
    // Typen, die oben nicht gewichtet werden (Begleiter, Trainer …), trotzdem möglich
    for (const t of typen) if (!kandidaten.some(([x]) => x.typ === t)) kandidaten.push([{ ...ersatz[t], ort: geschichte.ort }, 0.8]);
    // vorne im Profil = häufiger; Rolle und Ort wie am echten Ort
    if (prof?.anrufer) {
      const n = prof.anrufer.length;
      for (const k of kandidaten) {
        // am echten Ort zählt die Reihenfolge des Profils (Tierpark: meist die Tierpflegerin)
        const i = prof.anrufer.indexOf(k[0].typ!);
        if (i >= 0) k[1] = n - i;
        const rolle = k[0].typ ? prof.rollen?.[k[0].typ] : undefined;
        k[0] = { ...k[0], ...(rolle ? { rolle } : {}), ort: ortKategorie(geschichte.ortKat!)?.label ?? k[0].ort };
      }
    }
  }
  let s = gewichtet(kandidaten, rnd);
  // Pflegekraft, aber kein Pflegeheim an der Adresse: mobile Hauskrankenpflege beim Patienten zu Hause
  if (s.typ === "pflege" && !heimHier) s = { ...s, rolle: "Pflegekraft der mobilen Hauskrankenpflege", ort: /pflegeheim/i.test(s.ort) || !s.ort ? "Wohnung" : s.ort };
  else if (s.typ === "pflege" && amOrt?.name) s = { ...s, ort: amOrt.name };
  // Ordination nur in einer Praxis; sonst ist die Ärztin auf Hausbesuch
  if ((s.typ === "arzt" || s.typ === "ordi") && !praxisHier && /praxis|ordination/i.test(s.ort || "Arztpraxis"))
    s = s.typ === "arzt" ? { ...s, ort: "Wohnung (Hausbesuch)" } : { ...s, rolle: "Hausärztin/Hausarzt", geschlecht: undefined, typ: "arzt", ort: "Wohnung (Hausbesuch)" };
  const geschlecht: "m" | "w" =
    s.geschlecht ?? (s.selbst ? (patientW ? "w" : "m") : /Tochter|Kollegin|in\b/.test(s.rolle) ? "w" : /Sohn|Kollege/.test(s.rolle) ? "m" : rnd() < 0.5 ? "w" : "m");

  // Gefühlslage: je schlimmer und je näher, desto aufgeregter; Profis bleiben ruhig
  const schlimm = a.bw === "nein" || a.at === "keine" || a.at === "agonal";
  let emotion: Anrufer["emotion"];
  // Regeln (Paul): Profis sachlich; Eltern und Angehörige bei Lebensgefahr panisch; Passanten mittel; Harmloses ruhig
  const nahe = ["partner", "eltern", "kind", "fern"].includes(s.typ ?? "");
  const harmlos = !schlimm && a.bw !== "getruebt" && a.at !== "abnorm";
  if (s.profi) emotion = schlimm ? "gefasst" : "ruhig";
  else if (s.selbst) emotion = harmlos ? gewichtet([["ruhig", 3], ["gefasst", 4]], rnd) : gewichtet([["gefasst", 3], ["aufgeregt", 3]], rnd);
  else if (schlimm && (nahe || kind)) emotion = gewichtet([["panisch", 6], ["aufgeregt", 3]], rnd);
  else if (schlimm || kind) emotion = gewichtet([["aufgeregt", 4], ["panisch", 2], ["gefasst", 2]], rnd);
  else if (harmlos) emotion = gewichtet([["ruhig", 3], ["gefasst", 4], ["aufgeregt", nahe ? 1.5 : 0.5]], rnd);
  else emotion = gewichtet([["gefasst", 4], ["aufgeregt", nahe ? 4 : 2], ["panisch", nahe ? 1 : 0]], rnd);

  // kein Dialekt, kein gebrochenes Deutsch (Paul, 27./28.10.2026): das Sprachmodell macht daraus Kauderwelsch
  const sprache = "hochdeutsch" as Anrufer["sprache"];
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
    .replace(/eine\/n /g, g === "w" ? "eine " : "einen ")
    .replace(/^(Freund|Passant|Lenker|Arbeitskollege|Nachbar|Bademeister|Trainer|Wirt|Polizist|Lehrer|Mitarbeiter|Begleiter|Busfahrer|Tierpfleger|Ordner|Platzwart|Liftwart)\b(, der)?/, (m, wort: string, der?: string) =>
      g === "w" ? `${wort === "Arbeitskollege" ? "Arbeitskollegin" : `${wort}in`}${der ? ", die" : ""}` : m,
    );
}

/** „Ich bin …“ für die Frage „Wer ruft an?“ */
export function werText(x: Anrufer): string {
  if (x.selbst) return `${x.name.split(" ")[0]} ${x.name.split(" ").slice(1).join(" ")} – ich ruf für mich selber an, mir geht's nicht gut.`;
  const r = x.rolle.split(";")[0].split("(")[0].trim();
  if (x.art === "ecall") return x.sprachkontakt ? `Ich sitz im Auto, ich bin ${x.geschlecht === "w" ? "die Fahrerin" : "der Fahrer"}.` : "(keine Antwort)";
  if (x.art && x.art !== "privat") return `${x.stelle ? `${x.stelle}, ` : ""}${x.name}${x.art === "polizei" ? " – ich rufe für unsere Streife vor Ort an" : ""}.`;
  // Fremde sagen nicht „Ich bin der Passant“, sondern wie sie dazugekommen sind
  const fremd: Partial<Record<AnruferTyp, string>> = {
    passant: "Ich bin nur zufällig vorbeigekommen, ich kenn die Person nicht.",
    lenker: "Ich bin mit dem Auto vorbeigekommen und hab's gesehen.",
    verkauf: "Ich arbeite hier im Geschäft.",
    wirt: "Ich bin vom Lokal hier.",
    bademeister: "Ich bin der Bademeister hier.",
    bahnpersonal: "Ich arbeite hier am Bahnhof, bei der ÖBB.",
    busfahrer: "Ich bin der Busfahrer.",
    tierpfleger: "Ich arbeite hier im Tierpark.",
    aufsicht: "Ich arbeite hier, ich bin vom Personal.",
    rezeption: "Ich bin von der Rezeption.",
  };
  if (x.typ && fremd[x.typ]) return fremd[x.typ]!;
  if (x.typ === "pflege") return `${x.name}, ich bin ${x.geschlecht === "w" ? "diplomierte Pflegerin" : "diplomierter Pfleger"} hier im Heim.`;
  const art = /^(Pflegekraft|Mitarbeiterin|Lehrerin|Nachbarin|Ehefrau|Lebensgefährtin|Mutter|Tochter|Arbeitskollegin|Ordinationsassistentin|Freundin|Kellnerin)/.test(r) ? "die" : /^(Hausärztin|Hausarzt)/.test(r) ? (x.geschlecht === "w" ? "die" : "der") : "der";
  return `Ich bin ${art} ${r.replace(/, die dabei ist$|, der dabei ist$/, "")}.`;
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

function sonderAnrufer(
  kapitel: string,
  a: Antworten,
  rnd: () => number,
  adresse: string,
  geschichte?: { typen: AnruferTyp[]; ort: string },
  einr: { heim: boolean; name?: string } = { heim: true },
): Anrufer | null {
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
    const heim = einr.name ?? pick([`Pflegeheim ${ort}`, `Landespflegeheim ${ort}`, `Seniorenzentrum ${ort}`, `Pflege- und Betreuungszentrum ${ort}`], rnd);
    // Pflegeheim nur, wenn die Adresse eines ist – sonst ruft die Hausärztin vom Hausbesuch oder aus der Ordination an
    const pflegeAnteil = einr.heim ? 0.7 : 0;
    const station = `Station ${1 + Math.floor(rnd() * 4)}`;
    const varianten: Record<string, [string, string, string]> = {
      normal:
        rnd() < pflegeAnteil
          ? [`diplomierte Pflegekraft im ${heim}, ${station}`, heim, `${heim}, ${station}`]
          : [`Hausärztin/Hausarzt in ${ort}`, `Ordination in ${ort}`, einr.heim ? `${heim} (Visite)` : "beim Patienten zu Hause (Hausbesuch)"],
      telemed: ["Ärztin/Arzt der telefonischen Gesundheitsberatung (Telemedizin)", "Telemedizin", "Telemedizin-Zentrale (der Patient ist zu Hause)"],
      "141": ["Ärztin/Arzt vom Ärztefunkdienst 141", "Ärztefunkdienst 141", "141-Callcenter (der Patient ist zu Hause)"],
      ecn: ["Mitarbeiter/in der Gesundheitshotline 1450", "Gesundheitshotline 1450", "1450-Callcenter"],
      schi: ["Pistenretter/in am Schigebiet", "Pistenrettung", "Piste"],
    };
    // Fallgeschichte legt fest, wer anruft (Pflegeheim, Hausarzt, Ordination, Telemedizin)
    if (geschichte?.typen.length && anf === "normal") {
      let pool = geschichte.typen.filter((x) => ["pflege", "arzt", "ordi"].includes(x));
      if (!einr.heim && pool.some((x) => x !== "pflege")) pool = pool.filter((x) => x !== "pflege");
      const t = pool.length ? pick(pool, rnd) : einr.heim ? "pflege" : "arzt";
      const hausbesuch = !/praxis|pflegeheim/i.test(geschichte.ort);
      if (t === "pflege" && !einr.heim) varianten.normal = ["diplomierte Pflegekraft der mobilen Hauskrankenpflege", "Mobile Hauskrankenpflege", "beim Patienten zu Hause"];
      else if (t === "pflege") varianten.normal = [`diplomierte Pflegekraft im ${heim}, ${station}`, heim, `${heim}, ${station}`];
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

/**
 * Flughafen-Leitstelle: ruft wegen eines Notfalls an Bord bzw. beim Personal an. Sie ist nicht beim Patienten und
 * weiß nur, was gemeldet wurde (nurBekannt); alles andere beantwortet sie mit „unbekanntSatz“.
 */
export function flughafenAnrufer(meldung: string, nurBekannt: string[], unbekanntSatz: string, rnd: () => number = Math.random): Anrufer {
  const geschlecht: "m" | "w" = rnd() < 0.5 ? "w" : "m";
  return {
    name: `${pick(geschlecht === "w" ? VORNAMEN_W : VORNAMEN_M, rnd)} ${pick(NACHNAMEN, rnd)}`,
    geschlecht,
    rolle: gendern("Disponent/in der Flughafen-Leitstelle (Flughafen Wien)", geschlecht),
    anruferWert: "ls",
    ort: "Flughafen-Leitstelle",
    emotion: "ruhig",
    sprache: "hochdeutsch",
    schwerhoerig: false,
    nummer: "01 7007 22245",
    selbst: false,
    art: "leitstelle",
    stelle: "Flughafen Wien, Leitstelle",
    meldung,
    nurBekannt,
    unbekanntSatz,
  };
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
  ruhig: "Du bist ruhig und sachlich. Du drängst nicht („Sie müssen sofort kommen“ sagst du nicht) – es ist für dich kein Drama.",
  gefasst: "Du bist besorgt, aber gefasst und kooperativ. Du antwortest ordentlich, ohne zu drängen.",
  aufgeregt:
    "Du bist aufgeregt – das hört man: kurze Sätze, du setzt manchmal neu an („Er … also, er liegt da“), ab und zu ein „Bitte beeilen Sie sich“ oder „Oh Gott“. Klare Anweisungen der Leitstelle beruhigen dich ein bisschen.",
  panisch:
    "Du bist in Panik – das hört man in JEDER Antwort: ganz kurze, abgehackte Sätze, du fängst Sätze an und brichst ab, oft ein „Bitte, schnell!“ oder „Oh Gott, oh Gott“. Fragen beantwortest du trotzdem, aber kurz und gehetzt. Gibt die Leitstelle klare Anweisungen, wirst du ein bisschen ruhiger und machst mit.",
};

function sprachText(x: Anrufer): string {
  // Dialekt und gebrochenes Deutsch gibt es nicht mehr (auch ältere Spielstände sprechen Hochdeutsch)
  void x;
  return "Du sprichst normales Hochdeutsch (österreichisch, aber kein Dialekt): keine Wörter wie „i“, „net“, „is“, „nix“, „jo“. Österreichische Alltagswörter wie „Grüß Gott“, „Stiege“, „Kassa“, „Spital“ sind in Ordnung.";
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
  /** was sich im Gespräch schon verändert hat (Verlauf, vom Anrufer gemeldet) */
  verlauf?: string[];
  /** was der Anrufer auf Anweisung schon macht */
  massnahmen?: string[];
  /** Fallgeschichte (Hergang, Patient, Umgebung …), falls vorhanden */
  szenario?: Szenario;
}

/** Bewusstsein und Atmung in Laiensprache (so beschreibt es ein Anrufer) */
const LAIE: Record<string, Record<string, string>> = {
  bw: {
    ja: "{ist wach und reagiert, wenn man mit {ihm} redet|ist wach und gibt Antwort|schaut einen an und redet|ist munter und antwortet}",
    getruebt: "{ist benommen, redet verwirrt oder undeutlich, reagiert nur langsam|ist ganz benommen und redet durcheinander|reagiert nur langsam und redet wirr}",
    nein: "{reagiert überhaupt nicht, auch nicht auf Rütteln oder lautes Ansprechen|rührt sich nicht, auch nicht, wenn man {ihn} schüttelt|reagiert auf gar nichts}",
    unbekannt: "das kannst du nicht sagen – du siehst nicht, wie es {ihm} gerade geht",
  },
  at: {
    normal: "{atmet ganz normal|atmet ruhig und normal|atmet normal, ohne Probleme}",
    abnorm: "{schnauft ganz schwer|ringt nach Luft|kriegt ganz schlecht Luft|atmet ganz schnell und mühsam}",
    agonal: "{macht nur ganz selten so komische schnappende Atemzüge|schnappt nur ab und zu so komisch nach Luft|röchelt nur ganz selten}",
    keine: "atmet nicht",
    unbekannt: "das kannst du nicht sagen – du siehst bzw. hörst es nicht",
  },
};

/** Kleinkinder reden nicht: dafür eigene Worte */
const LAIE_KLEIN: Record<string, Record<string, string>> = {
  bw: { ja: "{ist wach und schaut einen an|ist munter und weint|ist wach und reagiert, wenn man {ihn} anspricht}" },
};

/** Alltagswort für eine Antwort – passend zum Alter des Patienten */
function laieWort(k: AnrufKontext, id: string, wert: string): string | undefined {
  const alter = Number(k.szenario?.patient.alter ?? k.wahrheit.alter ?? 99);
  return (alter < 4 ? LAIE_KLEIN[id]?.[wert] : undefined) ?? LAIE[id]?.[wert];
}

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
  if (f.id === "geschlecht" && (wert === "m" || wert === "w")) {
    const alter = k.szenario?.patient.alter ?? 99;
    if (k.anrufer.selbst) return wert === "w" ? "du bist weiblich" : "du bist männlich";
    return wert === "w" ? (alter < 14 ? "ein Mädchen" : alter < 18 ? "ein junges Mädchen" : "eine Frau") : alter < 14 ? "ein Bub" : alter < 18 ? "ein Bursch" : "ein Mann";
  }
  if (LAIE[f.id]?.[String(wert)]) {
    const t = fuellen(laieWort(k, f.id, String(wert))!, { w, bezug: "", ort: "", name: "" }, Math.random);
    return k.anrufer.selbst && f.id === "bw" ? "du bist wach, aber dir geht es nicht gut" : t;
  }
  // „weiß nicht“ als Antwort: so sagt es der Anrufer, nicht als Etikett
  if (wert === "unbekannt") return "das weißt du nicht";
  // Alltagssatz statt Etikett („muss liegend transportiert werden“ statt „Liegend“)
  const satz = faktSaetze({ [f.id]: wert }, w)[0];
  if (satz) return satz;
  const label = antwortLabel(f, wert);
  if (label === "–") return null;
  return label === "Unbekannt" || label === "unbekannt" ? "das weißt du nicht" : label;
}

/** Fragen zur Vorgeschichte – weiß nur, wer den Patienten gut kennt */
const VORGESCHICHTE = new Set(["diabetiker", "epilepsie", "herz_vg", "herzleiden", "blutverduenner", "vg_schlaganfall", "vg_tia", "psych_vorerkrankung", "aneurysma", "bluter", "lungenerkrankung", "sonderdiagnose", "kokain"]);

/** Ist der Patient eine Frau? */
export function patientW(k: AnrufKontext): boolean {
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
    .replace(/^eine /, "einer ")
    .replace(/\b(Kollege|Bursch|Herr|Patient|Nachbar|Bub|Junge|Mensch)$/, (m) => (m === "Herr" || m === "Nachbar" ? `${m}n` : m === "Kollege" || m === "Junge" ? `${m}n` : `${m}en`));
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
  else if (typeof k.wahrheit.bw === "string" && LAIE.bw[k.wahrheit.bw]) t.push(laieWort(k, "bw", k.wahrheit.bw)!);
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
    // nach einer Veränderung im Gespräch: Antworten zum alten Zustand (Atemweg, Baby, Komplikationen) gelten nicht mehr sicher
    if ((k.verlauf ?? []).length && ["atemweg", "kompl_baby", "komplikationen", "kompl_mutter", "situation", "sprachschw", "verwirrt", "hautfarbe", "kaltschweiss", "ohnmacht"].includes(id)) continue;
    // Fragen, die nur die Polizei beantworten kann
    if (["ubg"].includes(id) && k.anrufer.art !== "polizei") continue;
    // seltene Sonderkrankheiten: „nein“ verwirrt nur („keine Vorerkrankungen“)
    if (id === "sonderdiagnose" && wert === "nein") continue;
    // wer selbst anruft, wird nicht nach dem eigenen Geschlecht gefragt
    if (k.anrufer.selbst && id === "geschlecht") continue;
    // kein bekannter Patient (Lichtsignale, Tier): nur die eigenen Fragen des Kapitels
    if (k.szenario?.ohnePatient && (id in k.szenario.zusatz || ["alter", "geschlecht", "bw", "at", "anzahl_patienten"].includes(id))) continue;
    // aus der Geschichte ergänzte „nein“-Antworten stehen schon in den Vorerkrankungen
    if (k.szenario && id in k.szenario.zusatz && (wert === "nein" || wert === "0") && SELBSTVERSTAENDLICH.has(id)) continue;
    // Schwangerschaft nur bei Frauen im passenden Alter
    if (/schwanger|entbunden/.test(id) && (!w || (k.szenario && (k.szenario.patient.alter < 12 || k.szenario.patient.alter > 55)))) continue;
    const f = idx.get(id);
    if (id === "bw" && wert === "ja" && k.wahrheit.verwirrt === "ja") {
      zeilen.push(`- ${wer} ist wach und redet, aber durcheinander`);
      continue;
    }
    if (LAIE[id]?.[String(wert)]) {
      const frage = id === "bw" ? `Ob ${wer.toLowerCase()} wach ist und reagiert` : `Wie ${wer.toLowerCase()} atmet`;
      const ich: Record<string, string> = { "bw:ja": "Du bist wach und klar im Kopf", "bw:getruebt": "Du bist benommen und kannst nicht klar denken", "at:normal": "Du kriegst normal Luft", "at:abnorm": "Du kriegst ganz schlecht Luft und musst schnaufen" };
      if (k.anrufer.selbst) {
        const t = ich[`${id}:${wert}`];
        if (t) zeilen.push(`- ${t}`);
        continue;
      }
      zeilen.push(wert === "unbekannt" ? `- ${frage}: ${fuell(laieWort(k, id, String(wert))!)}` : `- ${wer} ${fuell(laieWort(k, id, String(wert))!)}`);
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
    if (t) zeilen.push(`- Fragt man „${frageMitPronomen(f.text, w)}“, ist die Antwort: ${t}`);
  }
  // wer gerade nicht wach ist bzw. kaum atmet: „im Kopf klar“, „redet in Sätzen“, „war nie weg“ passen nicht (auch nach einer Verschlechterung)
  const nichtWach = k.wahrheit.bw === "nein" || k.wahrheit.at === "keine" || k.wahrheit.at === "agonal";
  if (nichtWach) for (const id of ["verwirrt", "sprachschw", "ohnmacht"]) delete nurFakt[id];
  // Zeit steht schon unter ZEIT (sonst widersprechen sich „weniger als 4 Stunden“ und „vor einer halben Stunde“); Anzahl nur einmal
  for (const id of ["aelter6h", "seit"]) delete nurFakt[id];
  if (k.wahrheit.anzahl_patienten !== undefined) delete nurFakt.mehrere_verletzte;
  // was im Text steht, gewinnt: verwaschene Sprache, Verwirrtheit, Blut, Farbe
  const text = [...(k.szenario?.geschehen ?? []), ...(k.szenario?.details ?? []), ...(k.verlauf ?? [])].join(" ").toLowerCase();
  if (k.wahrheit.bw === "getruebt" || /verwaschen|kaum versteh|wirr|durcheinander|fragt immer wieder|redet nicht mehr|lallt/.test(text)) {
    if (nurFakt.verwirrt === "nein") delete nurFakt.verwirrt;
    if (nurFakt.sprachschw === "nein") delete nurFakt.sprachschw;
  }
  if (/rot im gesicht|ganz rot|hochrot/.test(text) && nurFakt.hautfarbe === "nein") delete nurFakt.hautfarbe;
  // Kleinkinder: „weiß, wo er ist“, „zum Tragen schwer“, „redet in ganzen Sätzen“ passen nicht
  if (Number(k.szenario?.patient.alter ?? 99) < 4) for (const id of ["verwirrt", "schwer_pat", "sprachschw"]) delete nurFakt[id];
  if (/blut|wunde/.test(text)) {
    if (nurFakt.verletzt === "nein") delete nurFakt.verletzt;
    if (nurFakt.blutung_stark === "nein" && !/blutet (nur )?(ein bisschen|leicht|kaum)/.test(text)) delete nurFakt.blutung_stark;
  }
  // nach einer Veränderung im Gespräch gelten die alten Befunde nicht mehr sicher
  if ((k.verlauf ?? []).length) for (const id of ["verwirrt", "sprachschw", "ohnmacht", "hautfarbe", "kaltschweiss"]) delete nurFakt[id];
  if (k.szenario?.ohneSicht) for (const id of ["verwirrt", "sprachschw", "ohnmacht", "hautfarbe", "kaltschweiss", "verletzt", "blutung_stark", "fehlstellung", "schwer_pat"]) delete nurFakt[id];
  for (const s of faktSaetze(nurFakt, w)) zeilen.push(`- ${s.charAt(0).toUpperCase()}${s.slice(1)}`);
  if (k.szenario && !k.szenario.ohnePatient && (!p || p.kenntVorgeschichte === "ja" || k.anrufer.selbst))
    zeilen.push(`- Alles, was oben nicht als Vorerkrankung oder Medikament steht, ${k.anrufer.selbst ? "hast bzw. nimmst du nicht" : `hat bzw. nimmt ${w ? "sie" : "er"} nicht (soweit du weißt)`}.`);
  return [...new Set(zeilen)].join("\n");
}

/** Beispiele nur für den Ton – bewusst ohne Zustand des Patienten (die KI übernimmt sonst die Beschwerden) */
const BEISPIELE: Record<Anrufer["emotion"], string> = {
  ruhig: "„Moment, ich schau … ja, das stimmt.“ / „Nein, das weiß ich nicht.“",
  gefasst: "„Ja, so ist es. Kommen Sie bald?“ / „Nein, das weiß ich nicht genau.“",
  aufgeregt: "„Ich weiß nicht … bitte beeilen Sie sich!“ / „Ja, ja, ich bin eh da!“",
  panisch: "„Bitte schnell – ich weiß nicht, was ich tun soll!“ / „Ja … okay … ich mach's, ich mach's!“",
};

/** Ich-/Du-Form für Fakten über den Anrufer selbst („Sie hat Asthma“ → „Du hast Asthma“) */
export function inDuForm(t: string): string {
  const verben: Record<string, string> = { erwartet: "erwartest", spürt: "spürst", traut: "traust", merkt: "merkst", sitzt: "sitzt", steht: "stehst", geht: "gehst", kommt: "kommst", zittert: "zitterst", friert: "frierst", hört: "hörst", sieht: "siehst", schreit: "schreist", weint: "weinst", sagt: "sagst", will: "willst", mag: "magst", braucht: "brauchst", trinkt: "trinkst", darf: "darfst", soll: "sollst", spricht: "sprichst", versteht: "verstehst", lag: "lagst", reagiert: "reagierst", antwortet: "antwortest", kriegt: "kriegst", liegt: "liegst", hustet: "hustest", blutet: "blutest", fühlt: "fühlst", ist: "bist", hat: "hast", kann: "kannst", war: "warst", hatte: "hattest", nimmt: "nimmst", schwitzt: "schwitzt", atmet: "atmest", redet: "redest", weiß: "weißt", muss: "musst", schaut: "schaust", wird: "wirst" };
  let x = t;
  // „Sie ist …“ / „Er hat …“ am Anfang
  x = x.replace(/^(Er|Sie)\s+([\wäöüßÄÖÜ]+)/, (m, _p, v: string) => (verben[v] ? `Du ${verben[v]}` : m));
  // „… hat sie nichts“, „nimmt er keine“, „ist sie nicht“
  x = x.replace(/\b([\wäöüßÄÖÜ]+)\s+(er|sie)\b(?=\s+(nicht|nichts|keine|keiner|keinen|noch|nie|schon))/g, (m, v: string) => (verben[v] ? `${verben[v]} du` : m));
  // „Reden kann er normal“, „Er weiß, wo er ist“ – auch mitten im Satz
  x = x.replace(/\b([\wäöüßÄÖÜ]+)\s+(er|sie)\b/g, (m, v: string) => (verben[v] ? `${verben[v]} du` : m));
  x = x.replace(/\b(er|sie)\s+([\wäöüßÄÖÜ]+)\b/gi, (m, _p, v: string) => (verben[v] ? `du ${verben[v]}` : m));
  x = x.replace(/\b(du \w+) sich\b/gi, "$1 dich").replace(/\b(\w+st du) sich\b/g, "$1 dich");
  if (/^Du /.test(x)) x = x.replace(/\bund (redet|atmet|schaut|antwortet|reagiert)\b/g, (_m, v: string) => `und ${v === "reagiert" ? "reagierst" : v.replace(/t$/, "st").replace(/ett?st$/, "est")}`);
  x = x.replace(/\b(ihn|ihm|ihr)\b/g, (m) => (m === "ihn" ? "dich" : "dir"));
  return x.replace(/^Wie alt ist (er|sie)\?/, "Dein Alter?");
}

/** Notfallort in einem Gebäude, das keine Wohnung ist: so heißt die Adresse */
const ORT_GEBAEUDE: Partial<Record<OrtArt, string>> = {
  geschaeft: "die Adresse vom Geschäft",
  lokal: "die Adresse vom Lokal",
  arbeit: "die Adresse von der Firma",
  baustelle: "die Adresse der Baustelle",
  schule: "die Adresse der Schule",
};

/** Liegt der Notfallort im Freien bzw. nicht in einem Haus? Dann ist die Adresse nur die nächste Hausnummer. */
function imFreien(k: AnrufKontext): boolean {
  return ORT_IM_FREIEN.includes((k.szenario?.ortArt ?? "") as OrtArt);
}

/** „Seit wann?“ – die eine Zeitangabe des Falls (gefunden bzw. angefangen) */
export function zeitText(k: AnrufKontext): string | null {
  const sz = k.szenario;
  if (!sz) return null;
  const w = patientW(k);
  return sz.gefunden && !k.anrufer.selbst
    ? `Gefunden hast du ${w ? "sie" : "ihn"} ${sz.seit.replace(/^seit /, "vor ")}; wie lange ${w ? "sie" : "er"} davor schon so war, weißt du nicht`
    : /^seit/.test(sz.seit)
      ? `Das geht so ${sz.seit}`
      : `Angefangen hat es ${sz.seit}`;
}

/** Szenario für die Fallakte: nach einer Veränderung ohne alte Befunde; beim Selbstanrufer in Du-Form */
function aktenSzenario(sz: Szenario, geaendert: boolean, ich: boolean): Szenario {
  let details = sz.details;
  if (geaendert) details = details.filter((d) => !/blau|farbe|rot im gesicht|blass|grau|hustet|husten|atmet|atmen|luft|pfeif|redet|antwortet|wach|reagiert|bewegt/i.test(d));
  const du = (l: string[]) => (ich ? l.map((t) => inDuForm(t)) : l);
  return { ...sz, details: du(details), geschehen: sz.geschehen ? du(sz.geschehen) : sz.geschehen };
}

/** Anweisung für Anrufer mit Fallgeschichte: menschlich, mit Fallakte statt Frageliste */
function promptGeschichte(k: AnrufKontext): string {
  const x = k.anrufer;
  const sz = k.szenario!;
  const art = x.art ?? "privat";
  const laie = art === "privat";
  const bz = bezug(k);
  const ich = x.selbst;
  // Pflegekräfte, Ärzte, Polizei: Profis – sachlich, mit Fachwörtern und Messwerten
  const profi = !ich && x.persona?.wissen === "profi";
  const telefon = /telemed|141|1450|gesundheitshotline/i.test(`${x.rolle} ${x.stelle ?? ""}`);
  const quelle: "vorort" | "polizei" | "telefon" = art === "polizei" ? "polizei" : telefon ? "telefon" : "vorort";
  const er = patientW(k) ? "sie" : "er";
  const ihn = patientW(k) ? "sie" : "ihn";
  const gemeinde = (k.adresse.split(",").pop() ?? "").replace(/^\s*\d{4}\s*/, "").trim();
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
      : x.typ === "pflege"
        ? `Du bist ${x.rolle}${gemeinde ? ` (Pflegeheim in ${gemeinde})` : ""} und rufst wegen ${dativ(bz)} an.`
        : `Du bist ${x.rolle} und rufst wegen ${dativ(bz).replace(/^meinem /, "deinem ").replace(/^meiner /, "deiner ")} an.`;
  const ort = k.ortUnbekannt
    ? `Wo du bist, weißt du NICHT genau. Auf die Frage nach dem Ort beschreibst du nur, was du weißt und siehst: „${k.adresse}“. Straße und Hausnummer kennst du nicht. Beschreib immer dieselbe Stelle (nicht einmal „vor“ und einmal „nach“ dem Ort).`
    : imFreien(k)
      ? `Die Adresse, die du nennst: ${k.adresse} – das ist die nächste Hausnummer; der Notfall ist ${sz.stelle} gleich dort. Sag das so, wenn man nach dem Ort fragt.`
      : ORT_GEBAEUDE[sz.ortArt]
        ? `Die Adresse, die du nennst: ${k.adresse} – das ist ${ORT_GEBAEUDE[sz.ortArt]}; der Notfall ist ${sz.stelle} dort. Sag das so, wenn man nach dem Ort fragt.`
        : `Die Adresse, die du nennst: ${k.adresse}. Stock, Tür und Zufahrt sagst du nur, wenn danach gefragt wird – und nur so, wie es unter WO steht.`;
  const dabei = x.persona?.dabei;
  const wohnlich = ["wohnung", "haus", "garten", "pflegeheim", "arzt"].includes(sz.ortArt);
  const keineTuer = !wohnlich ? " Hier gibt es keine Wohnungs- oder Haustür, die jemand aufsperren müsste." : "";
  const zeit = zeitText(k)!;
  const verlauf = (k.verlauf ?? []).filter(Boolean);
  const z = zustand(k);
  const zeilen = antwortSaetze(k)
    .split("\n")
    .map((l) => (ich ? `- ${inDuForm(l.replace(/^- /, ""))}` : l))
    .join("\n");
  return [
    `Du spielst in einer Trainingssimulation eine echte Person, die beim Rettungsnotruf 144 in Niederösterreich anruft.${laie && !profi ? " Du bist KEIN Sanitäter und kein Arzt." : ""} Du sagst nur, was diese Person ins Telefon spricht: gesprochene Sprache, Ich-Form, Deutsch – keine Regieanweisungen, keine Sternchen, keine Listen.`,
    `WER DU BIST: ${x.name}. ${wer} Rückrufnummer: ${x.nummer}.`,
    ort + keineTuer + " Wegbeschreibungen, Hausfarben oder Geschäfte in der Nähe erfindest du nicht – nur, was hier bzw. unter WO steht.",
    dabei && !sz.ohnePatient
      ? /allein|niemand/i.test(dabei)
        ? `WER SONST NOCH DA IST: ${dabei} Fragt die Leitstelle, ob noch jemand da ist oder jemand die Tür aufmachen kann, sagst du, dass du allein bist (von dir aus erwähnst du das nicht).`
        : `WER SONST NOCH DA IST: ${dabei} Du bist also NICHT allein. Fragt die Leitstelle, ob noch wer da ist, sagst du das; bittet sie, jemanden zur Tür oder hinaus zu schicken, schickst du diese Person.`
      : "",
    `ZEIT: ${zeit}. (Das ist die Antwort auf „Seit wann?“, „Wann war das?“, „Wie lange schon?“.)`,
    `FALLAKTE – das ist wirklich passiert. Alles, was du sagst, muss dazu passen. Was hier nicht steht, weißt du nicht – dann sagst du ehrlich „weiß ich nicht“. Erfinde NIE etwas dazu (keine Stockwerke, Wunden, Medikamente, Helfer, Geräte, die nicht hier stehen).${ich ? " („Er/sie“ in der Fallakte meint dich selbst.)" : ""}`,
    fallakte(aktenSzenario(sz, verlauf.length > 0, ich), {
      selbst: ich,
      bezug: bz,
      quelle,
      fremd: !ich && (x.persona ? x.persona.wissen === "fremd" : /passant|lenker|mitarbeiter|bademeister|wirt|kellner|polizei|beamt/i.test(x.rolle)),
      hausarztIch: /^haus(arzt|ärztin)/i.test(x.rolle),
      vorgeschichte: x.persona?.wissen === "bekannt" ? x.persona.kenntVorgeschichte : undefined,
      name: ich ? x.name : undefined,
      kannAntworten: k.wahrheit.bw === "ja",
    }),
    verlauf.length
      ? `GERADE GEÄNDERT (gilt ab jetzt und ist wichtiger als alles oben – darauf reagierst du jetzt, das beschäftigt dich; was oben dem widerspricht, gilt nicht mehr): ${verlauf.join(" / ")}${z && !ich && !/schwanger|geburt/.test(sz.thema) ? ` ${z.replace(/ – daran ändert sich.*$/, "")}.` : ""} Fragt die Leitstelle, wie es jetzt ist, beschreibst du DIESEN neuen Zustand.`
      : "",
    (k.massnahmen ?? []).length ? `WAS DU AUF ANWEISUNG DER LEITSTELLE SCHON MACHST (gilt weiter, bis die Leitstelle etwas anderes sagt): ${k.massnahmen!.join(" ")}` : "",
    `DAS STIMMT SICHER (sag es nur, wenn danach gefragt wird – mit DEINEN Worten, nie Wort für Wort):`,
    zeilen,
    `WIE DU REDEST:`,
    profi
      ? `- Du bist Profi und rufst so etwas öfter an: ruhig, sachlich, geordnet, aber wie ein Mensch am Telefon (kein Bericht vom Blatt). Fragt man nach dem Zustand, nennst du passende Messwerte aus deiner Akte (Fieber, Blutdruck, Puls, Sättigung, Blutzucker). Fachwörter sind in Ordnung. Du redest per Sie und nennst ${patientW(k) ? "die Bewohnerin bzw. Patientin" : "den Bewohner bzw. Patienten"} beim Nachnamen.`
      : `- Du bist ein Mensch in einer Ausnahmesituation, kein Formular. Rede, wie Leute am Telefon reden: mal unvollständige Sätze, mal ein „äh“ oder „Moment“ – aber nicht in jeder Antwort.`,
    `- Antworte zuerst GENAU auf das, was die Leitstelle zuletzt gesagt hat – meist in ein, zwei kurzen Sätzen. Nimm nichts vorweg (Tür aufmachen, jemanden hinausschicken erst, wenn die Leitstelle darum bittet).`,
    `- Auf „Was ist passiert?“ sagst du in einem Satz das Wichtigste – in deinen Worten, so wie man es aufgeregt erzählt.`,
    `- Von dir aus nennst du keine Werte wie Alter, Atmung, Bewusstsein, Vorerkrankungen oder Medikamente – das muss die Leitstelle fragen. Was du SIEHST, darfst du beschreiben.`,
    laie && !profi ? `- Keine Fachwörter, keine Checklisten („wach, ansprechbar, Atmung normal“ ist verboten).` : "",
    laie && !ich && !profi ? `- „Der Patient“ sagst du nie – du sagst „${er}“ oder wie du ${ihn} sonst nennst.` : "",
    `- Formuliere jede Antwort neu, fang nicht immer gleich an und sag nichts zweimal. Du fasst nichts zusammen und fragst nicht zurück, ob du richtig verstanden hast.`,
    `- Fasst die Leitstelle zusammen („Also: … richtig?“), vergleichst du JEDEN Teil mit der Fallakte. Stimmt etwas nicht, widersprichst du sofort („Nein, nein – …“) und sagst, wie es wirklich ist. Weißt du es nicht, sagst du das. Nur wenn alles stimmt, bestätigst du kurz.`,
    `- Teilt dir die Leitstelle nur etwas mit (z. B. „Die Rettung ist unterwegs“), reagierst du kurz wie ein Mensch – erleichtert, mit einem Danke oder mit der Frage, wie lange es dauert. Du wiederholst die Durchsage nicht und zählst den Zustand nicht auf.`,
    `- Die Leitstelle sprichst du mit „Sie“ an – nie mit „du“ oder „ihr“.`,
    `- Wer nicht richtig wach ist, bekommt von dir nichts zu essen oder zu trinken.`,
    `- Der Zustand bleibt so, wie in der Fallakte beschrieben – außer es steht oben „GERADE GEÄNDERT“.`,
    `- Anweisungen, die passen, führst du GENAU so aus, wie sie gesagt wurden (aufsetzen heißt aufsetzen, nicht hinlegen), und sagst kurz, WIE du es machst und was du dabei siehst (nach der Fallakte). Nur wenn du genau das wirklich schon machst, sagst du das. Kannst du es nicht (allein, kein Gerät, ${ich ? "du kannst nicht aufstehen" : "geht nicht"}), sag das. Nur eine Anweisung, die gar nicht zur Lage passt, hinterfragst du. Bei Herzdruckmassage zählst du hörbar mit („eins, zwei, drei …“).`,
    `- Auf „Wer ruft an?“ bzw. „Wie heißen Sie?“ sagst du deinen Namen (${x.name})${ich ? " und dass es um dich selbst geht – jedes Mal in anderen Worten" : " und wer du bist bzw. in welcher Beziehung du zu der Person stehst"}.`,
    `- Auf „Wo ist der Notfallort?“ kommt die Adresse (Straße, Hausnummer, Ort) – sonst nichts.`,
    ich ? `- Du bist selbst betroffen: Du redest IMMER in der Ich-Form über dich („Ich hab …“, nie „er/sie“). Was während einer Ohnmacht war, weißt du nicht. Aufstehen oder herumgehen tust du nur, wenn die Leitstelle es ausdrücklich verlangt und du es in deinem Zustand kannst.` : "",
    ich && (k.wahrheit.sprachschw === "ja" || k.wahrheit.at === "abnorm") ? `- Du kriegst kaum Luft: Du sprichst nur in ganz kurzen Fetzen von zwei, drei Wörtern, mit Pausen dazwischen („Ich … krieg … keine Luft …“). Nie ganze Sätze.` : "",
    EMOTION_TEXT[x.emotion],
    sprachText(x),
    x.schwerhoerig ? "Du hörst schlecht und fragst ab und zu nach („Wie bitte?“)." : "",
    k.versuche > 1 ? `Du hast vorhin schon angerufen und niemand hat abgehoben – das sagst du gleich am Anfang vorwurfsvoll oder verzweifelt.` : "",
    k.rueckrufDurchLeitstelle ? "Die Leitstelle ruft dich zurück, weil dein Anruf vorhin nicht angenommen wurde." : "",
    laie && x.persona ? personaText(x.persona, patientW(k), ich) : "",
    laie && !profi ? `So ungefähr KANN es klingen (nur der Ton, nicht wörtlich): ${fuellen(BEISPIELE[x.emotion], { w: patientW(k), bezug: "", ort: "", name: "" }, Math.random)}\nNicht so: „Patient männlich, 67 Jahre, wach, ansprechbar, Atmung normal.“` : "",
    profi ? `So ungefähr KANN es klingen (nur der Ton, nicht wörtlich): „Moment, ich schau in die Doku … seit gestern Abend, heute früh 38,6.“ / „Nein, das ist nicht bekannt.“` : "",
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
      x.nurBekannt
        ? `Du sprichst wie ein Profi unter Leitstellen: kurz, sachlich, Stichworte. Du bist NICHT beim Patienten. Du weißt nur, was in deiner Meldung steht. Auf alle anderen Fragen sagst du: „${x.unbekanntSatz ?? "Das wissen wir nicht."}“`
        : `Du sprichst wie ein Profi unter Leitstellen: kurz, sachlich, Stichworte. Eine medizinische Abfrage machst du nicht – Fragen zum Patienten beantwortest du nur mit dem, was du aus deinem Notruf weißt; alles andere „wissen wir nicht, unsere Kräfte sind noch nicht vor Ort“.`,
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
/** Kernwörter eines Beispielsatzes – der Inhalt ohne fertigen Satz (sonst übernimmt die KI ihn wörtlich) */
function kernWoerter(satz: string): string {
  const weg = new Set(["meine", "meiner", "meinem", "mein", "seine", "ihrem", "seinem", "einem", "einer", "eine", "hat", "sich", "nicht", "jetzt", "einfach", "schon", "gerade", "bitte", "schnell", "total", "ganz", "auf", "einmal", "immer", "noch", "und", "die", "der", "das", "ist", "sie", "er"]);
  const w = satz
    .replace(/[„“"!?.,:;–-]/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 4 && !weg.has(x.toLowerCase()));
  return [...new Set(w)].slice(0, 7).join(", ");
}

/** Behauptungen einer Zusammenfassung über Bewusstsein und Atmung */
function behauptungen(text: string): { bw?: "ja" | "nein"; at?: "normal" | "abnorm" | "keine" } {
  const t = text.toLowerCase();
  const out: { bw?: "ja" | "nein"; at?: "normal" | "abnorm" | "keine" } = {};
  if (/(reagier\w* nicht|nicht wach|bewusstlos|nicht ansprechbar|nicht bei bewusstsein)/.test(t)) out.bw = "nein";
  else if (/(ist wach|sind wach|reagiert|reagieren|ansprechbar|bei bewusstsein|redet mit)/.test(t)) out.bw = "ja";
  if (/(atmet nicht|atmen nicht|keine atmung|nicht mehr atmet)/.test(t)) out.at = "keine";
  else if (/(schlecht luft|atemnot|schnauft|atmet schwer|atmen schwer|ringt|keine luft)/.test(t)) out.at = "abnorm";
  else if (/(atmet normal|atmen normal|normal atmen|atmung (ist )?normal|atmet ganz normal|kriegen normal luft|kriegt normal luft)/.test(t)) out.at = "normal";
  return out;
}

/**
 * Zusammenfassung der Leitstelle gegen die Wahrheit prüfen (das kleine Modell nickt sonst alles ab).
 * Gibt die falschen Teile in Alltagsworten zurück (leer = stimmt) oder null (nichts Prüfbares).
 */
export function zusammenfassungPruefen(k: AnrufKontext, text: string): { falsch: string[]; richtig: string } | null {
  const b = behauptungen(text);
  if (!b.bw && !b.at) return null;
  const falsch: string[] = [];
  const w = patientW(k);
  const fuell = (t: string) => fuellen(t, { w, bezug: "", ort: "", name: "" }, Math.random);
  const Er = k.anrufer.selbst ? "ich" : w ? "sie" : "er";
  const bwW = String(k.wahrheit.bw ?? "");
  const atW = String(k.wahrheit.at ?? "");
  const richtig: string[] = [];
  if (b.bw) {
    const wahrJa = bwW === "ja" || bwW === "getruebt";
    if (bwW === "unbekannt") falsch.push(`ob ${Er} wach ${k.anrufer.selbst ? "bin" : "ist"}, weißt du nicht`);
    else if (bwW && (b.bw === "ja") !== wahrJa) falsch.push(k.anrufer.selbst ? (wahrJa ? "du bist wach" : "") : `${Er} ${fuell(laieWort(k, "bw", bwW) ?? "")}`);
  }
  if (b.at) {
    const wahr = atW === "agonal" ? "keine" : atW;
    if (atW === "unbekannt") falsch.push(`wie ${Er} ${k.anrufer.selbst ? "atme" : "atmet"}, weißt du nicht`);
    else if (wahr && b.at !== wahr) falsch.push(k.anrufer.selbst ? (atW === "abnorm" ? "du kriegst ganz schlecht Luft" : "du kriegst normal Luft") : `${Er} ${fuell(LAIE.at[atW] ?? "")}`);
  }
  if (bwW && LAIE.bw[bwW]) richtig.push(`${Er} ${fuell(laieWort(k, "bw", bwW)!)}`);
  if (atW && LAIE.at[atW]) richtig.push(`${Er} ${fuell(LAIE.at[atW])}`);
  return { falsch: falsch.filter(Boolean), richtig: richtig.join(" und ") };
}

/**
 * Sprache glätten: Formen, die das Modell für „Dialekt“ hält, die aber nicht aus Niederösterreich sind
 * (Schweizer, Berliner, Norddeutsch), und fremde Schriftzeichen.
 */
export function sprachFilter(text: string, sprache: string): string {
  let t = text
    .replace(/[\u0400-\u04FF]/g, (c) => ({ р: "r", а: "a", е: "e", о: "o", с: "c", х: "x", у: "y", к: "k", м: "m", т: "t", н: "n", в: "v" } as Record<string, string>)[c] ?? "")
    .replace(/[\u3000-\u9FFF\uAC00-\uD7AF]/g, "");
  const ersetze: [RegExp, string][] = [
    [/\bisch\b/gi, "is"],
    [/\bgsi\b/gi, "gwesen"],
    [/\bnee\b/gi, "na"],
    [/\bnich\b/gi, "net"],
    [/\bnid\b/gi, "net"],
    [/\bick\b/gi, "i"],
    [/\biech\b/gi, "i"],
    [/\bwat\b/gi, "was"],
    [/\bdenne\b/gi, "dann"],
    [/\bso 'ne\b/gi, "so a"],
    [/\b'ne\b/gi, "a"],
    [/\bnem\b/gi, "an"],
    [/\beene\b/gi, "a"],
    [/\bzwo\b/gi, "zwei"],
    [/\bVadder\b/g, "Vater"],
    [/\bexactly\b/gi, "genau"],
    [/\bnone\b/gi, "keine"],
    [/\bso['’]n\b/gi, "so a"],
    [/\bisser\b/gi, "is er"],
    [/\bischt\b/gi, "is"],
    [/\bisse\b/gi, "is"],
    [/\bsisch\b/gi, "sich"],
    [/\bvun\b/gi, "vo"],
    [/\bfürr\b/gi, "für"],
    [/\bselbste\b/gi, "selbst"],
    [/\bkeene\b/gi, "keine"],
    [/\been\b/gi, "a"],
    [/\bdoll\b/gi, "arg"],
    [/\bweißte\b/gi, "wissen S'"],
    [/\bgeguckt\b/gi, "gschaut"],
    [/\bguck(t|en|e)?\b/gi, "schau"],
    [/\bdruff\b/gi, "drauf"],
    [/\bunner\b/gi, "unter"],
    [/\bmega\b/gi, "sehr"],
    [/\bsorry\b/gi, "Entschuldigung"],
    [/\b(ago|just|regular|pretty)\b\s*/gi, ""],
    [/\b(er|sie|es) isst (net|nicht|ganz|so|käsweiß|blass|wach|munter|orientiert|bleich)(?![\wäöüß])/gi, "$1 ist $2"],
    [/\bbräuchen\b/gi, "bräuchten"],
    [/\bschreiten\b/gi, "gehen"],
    [/\b(Okay|Gut|Ja|Alles klar),? (bleib|warte) ich (dran|hier|da)\b/g, "$1, ich $2 $3"],
    [/(^|[.!?…]\s+)Bleib ich (dran|hier|da)\b/g, "$1Ich bleib $2"],
    [/(^|[.!?…]\s+)Warte ich (dran|hier|da)\b/g, "$1Ich warte $2"],
  ];
  for (const [re, neu] of ersetze) t = neu.includes("$") ? t.replace(re, neu) : t.replace(re, (m) => (m[0] === m[0].toUpperCase() && neu[0] ? neu[0].toUpperCase() + neu.slice(1) : neu));
  t = t.replace(/^\s+/, "").replace(/\s{2,}/g, " ");
  // „Jo, is net …“ klingt wie ja – vor einer Verneinung heißt es „Na“
  t = t.replace(/\bJo,?\s+(?=(is |i |ich |er |sie |des )?(net|nix|nicht|kein\w*|nie)\b)/g, "Na, ");
  t = t.replace(/\bun\b(?=\s)/g, "und");
  // Hochdeutsch und gebrochenes Deutsch: kein Dialekt („net“, „ma“, „i“ …)
  if (sprache === "hochdeutsch" || sprache === "gebrochen")
    t = t
      .replace(/\bis\b/g, "ist")
      .replace(/\bIs\b/g, "Ist")
      .replace(/\b(net|ned)\b/g, "nicht")
      .replace(/\b(Net|Ned)\b/g, "Nicht")
      .replace(/\bun\b/g, "und")
      .replace(/\bma\b(?=\s)/g, "man")
      .replace(/\bi\b(?=\s+[a-zäöü])/g, "ich")
      .replace(/\bI\b(?=\s+[a-zäöü])/g, "Ich")
      .replace(/\bnix\b/g, sprache === "gebrochen" ? "nix" : "nichts")
      .replace(/\bdes\b(?=\s+(is|ist|weiß|stimmt|geht|war)\b)/g, "das")
      .replace(/\bDes\b(?=\s)/g, "Das");
  return t;
}

/** Ist außer dem Anrufer noch jemand da, der helfen (z. B. die Tür aufmachen) kann? */
export function jemandDa(k: AnrufKontext): boolean {
  const d = k.anrufer.persona?.dabei ?? "";
  return !!d && !/allein|niemand/i.test(d);
}

/** Ein kleiner Anstoß zur Persönlichkeit für diese eine Antwort (das Modell setzt Stil-Regeln sonst kaum um) */
/** eines davon zufällig */
function eins(l: string[]): string {
  return l[Math.floor(Math.random() * l.length)];
}

function stilImpuls(k: AnrufKontext, art: NachrichtArt, nr: number): string | null {
  const p = k.anrufer.persona;
  if (!p || art === "zusammenfassung" || art === "abschluss") return null;
  const r = Math.random();
  if (r < 0.1 && p.woerter.length && art !== "frage") return `Bau in diese Antwort das Wort „${p.woerter[Math.floor(Math.random() * p.woerter.length)]}“ ein.`;
  if (r < 0.18 && p.eigenheit && nr >= 4 && (art !== "frage" || !/fragst|frag /.test(p.eigenheit))) return `Wenn es gerade passt, mach jetzt einmal das, was zu deiner Art gehört: ${p.eigenheit} Die Antwort auf die Leitstelle kommt trotzdem zuerst.`;
  if (r < 0.42) {
    if (p.stil === "gespraechig") return "Erzähl diesmal einen kleinen Nebensatz mehr dazu (nur was zur Fallakte passt).";
    if (p.stil === "unsicher") return "Sag diesmal „ich glaub“ oder „ich weiß nicht genau“ dazu.";
    if (p.stil === "knapp") return "Antworte diesmal besonders kurz – ein paar Wörter.";
    if (k.anrufer.emotion === "panisch") return "Sag es hastig, mit einem „bitte“ oder einer Wiederholung.";
  }
  return null;
}

export function erinnerung(
  k: AnrufKontext,
  schemaFrage?: Frage,
  opt: { wiederholt?: boolean; letzteAntwort?: string; art?: NachrichtArt; text?: string; erste?: boolean; nr?: number; kern?: string[]; stimmung?: string } = {},
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
    if (!schemaFrage && opt.kern?.length)
      teile.push(`Die ehrliche Antwort darauf ist: ${opt.kern.join(" ")} – sag genau das, in deinen eigenen Worten, wie ein Mensch am Telefon. Nichts dazu erfinden.`);
    else if (!schemaFrage)
      teile.push(
        k.szenario
          ? "Geh genau auf DIESE Frage ein und antworte passend zur Fallakte, menschlich und in deinen eigenen Worten."
          : "Das ist eine eigene Frage der Leitstelle: Geh genau auf DIESE Frage ein und antworte nach den Fakten oben.",
      );
  } else if (art === "zusammenfassung") {
    const pr = zusammenfassungPruefen(k, opt.text ?? "");
    if (pr && pr.falsch.length)
      teile.push(`Die Zusammenfassung der Leitstelle ist FALSCH: ${pr.falsch.join("; ")}. Widersprich sofort (z. B. „${eins(["Nein, das stimmt nicht", "Nein", "Nein, Moment", "Nein, nein", "Das stimmt so nicht"])} – …“) und sag in einem Satz, wie es wirklich ist. Auf keinen Fall „Ja“ oder „genau“.`);
    else if (pr) teile.push(`Die Zusammenfassung stimmt. Bestätige ganz kurz, etwa so: „${eins(["Ja", "Stimmt", "Ja, richtig", "Genau so", "Ja, so ist es", "Ja, das stimmt"])}.“ – nichts aufzählen.`);
    else teile.push(hinweisZurArt(art, laie, jemandDa(k)));
  } else {
    if (art === "anweisung" && opt.kern?.length) teile.push(`So ist es: ${opt.kern.join(" ")} Sag kurz, wie du es machst bzw. warum es nicht geht – genau so, nichts anderes.`);
    teile.push(hinweisZurArt(art, laie, jemandDa(k)));
  }
  if (opt.stimmung) teile.push(opt.stimmung);
  const impuls = !einstieg && !(k.anrufer.selbst && (k.wahrheit.sprachschw === "ja" || k.wahrheit.at === "abnorm")) ? stilImpuls(k, art, opt.nr ?? 0) : null;
  if (impuls) teile.push(impuls);
  if (opt.letzteAntwort && !opt.wiederholt) teile.push(`Deine letzte Antwort war „${opt.letzteAntwort}“ – fang nicht wieder so an und sag nichts davon noch einmal.`);
  // Zustand nur dazu, wenn es darum geht – sonst sagt die KI ihn bei jeder Gelegenheit auf
  const z = zustand(k);
  const umZustand = (art === "anweisung" && !/bleiben sie (bitte )?(am telefon|dran|in der leitung)/i.test(opt.text ?? "")) || (!!opt.text && art !== "mitteilung" && fragtNachZustand(opt.text)) || (!!schemaFrage && ["bw", "at"].includes(schemaFrage.id));
  if (z && k.anrufer.art !== "leitstelle" && (umZustand || (art === "frage" && !k.szenario))) teile.push(z);
  if (schemaFrage) {
    let t: string | null;
    if (schemaFrage.id === "ort_adresse") t = einstieg && ["problem", "unvollstaendig"].includes(k.anrufer.persona!.einstieg) ? null : k.ortUnbekannt ? `du weißt es nicht genau: ${k.adresse}` : k.adresse;
    else if (schemaFrage.id === "schilderung")
      t = k.szenario?.geschehen?.length
        ? `sag in deinen eigenen Worten nur das Wichtigste, was passiert ist (siehe WAS WIRKLICH PASSIERT IST)${k.szenario.stil?.length ? ` – worum es geht: ${kernWoerter(k.szenario.stil[Math.floor(Math.random() * k.szenario.stil.length)])} (daraus machst DU einen eigenen Satz)` : ""}. ${k.anrufer.persona?.wissen === "profi" ? "Ein, zwei kurze sachliche Sätze" : "EIN kurzer Satz, so wie man es aufgeregt ins Telefon sagt"}. Atmung, Bewusstsein, Verletzungen, Alter, Vorerkrankungen und wann es war, sagst du NICHT von dir aus – das fragt die Leitstelle nach`
        : k.szenario
          ? `erzähl den Hergang aus der Fallakte in deinen Worten (Kern: ${schilderung(k)})`
          : schilderung(k);
    else if (schemaFrage.id === "anrufer") t = werText(k.anrufer);
    else t = wahrheitText(k, schemaFrage);
    if (t) teile.push(k.szenario ? `Die ehrliche Antwort darauf ist: ${t} – sag es in deinen eigenen Worten, wie ein Mensch am Telefon.` : `Die ehrliche Antwort darauf ist: ${t}.`);
  }
  if (k.anrufer.persona?.wissen === "profi" && !k.anrufer.selbst && (schemaFrage?.id === "schilderung" || umZustand) && /\d/.test(k.szenario?.details.join(" ") ?? ""))
    teile.push("Nenn dabei einen passenden Messwert aus deiner Akte (z. B. Fieber, Blutdruck, Sättigung).");
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


/** Weiß der Anrufer das? (nur bei Anrufern mit eingeschränktem Wissen, z. B. Flughafen-Leitstelle) */
export function istBekannt(x: Anrufer, id: string): boolean {
  if (!x.nurBekannt) return true;
  return ["ort_adresse", "rueckrufnummer", "schilderung", "anrufer"].includes(id) || x.nurBekannt.some((b) => id === b || id.startsWith(`${b}_`));
}

/** Antwort ohne KI auf eine Schemafrage: die wahre Antwort in einfacher Form */
export function antwortOhneKi(k: AnrufKontext, frage: Frage): string {
  if (frage.id === "ort_adresse") return k.ortUnbekannt ? `Ich weiß nicht genau … ${k.adresse}.` : k.adresse;
  if (frage.id === "rueckrufnummer") return k.anrufer.nummer;
  if (frage.id === "schilderung") return schilderung(k);
  if (frage.id === "anrufer") return werText(k.anrufer);
  // Flughafen-Leitstelle: nur, was gemeldet wurde
  if (!istBekannt(k.anrufer, frage.id)) return k.anrufer.unbekanntSatz ?? "Das wissen wir nicht.";
  if (LAIE[frage.id] && typeof k.wahrheit[frage.id] === "string") {
    if (k.anrufer.selbst && frage.id === "bw") return "Ja, ich bin wach, aber mir geht's gar nicht gut.";
    const t = wahrheitText(k, frage);
    const wer = k.anrufer.selbst ? "Ich" : patientW(k) ? "Sie" : "Er";
    if (t) return k.anrufer.selbst ? `${t.charAt(0).toUpperCase()}${t.slice(1)}.` : `${wer} ${t}.`;
  }
  const w = k.wahrheit[frage.id];
  if (w === undefined || w === null) return "Das weiß ich nicht.";
  const label = antwortLabel(frage, w);
  if (label === "Unbekannt" || label === "unbekannt") return "Das weiß ich nicht.";
  return label.replace(/^Ja\b.*/, (m) => (m === "Ja" ? "Ja." : m)).replace(/^Nein$/, "Nein.");
}
