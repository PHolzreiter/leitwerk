/**
 * Zuweisung (Notfalleinsätze): Symptom + Altersgruppe + Dringlichkeit → welche Häuser aufnehmen.
 * 121 Symptome mit Kategorie, Synonymen und erlaubten Dringlichkeiten (zuweisung.json). Je Symptom steht,
 * welche Akut-Abteilungen es braucht (stabil/dringend bzw. Schockraum/Intensiv), ob es zeitkritisch ist und
 * welcher Platz belegt wird. Daraus entsteht eine Buchung wie in klinik.ts (ID „avn:<symptom>:<dringlichkeit>:<alter>“),
 * die das bestehende Vorschlags-System (Öffnungszeiten, Plätze, Entfernung) verwendet.
 * Gilt nur für Notfalleinsätze, nicht für Krankentransporte und Überstellungen.
 */
import daten from "./zuweisung.json";
import type { Buchung } from "./klinik";

export type Dringlichkeit = 10 | 20 | 30;
export type Altersgruppe = "kleinkind" | "kind" | "erwachsener";

export const DRINGLICHKEITEN: { id: Dringlichkeit; name: string }[] = [
  { id: 10, name: "stabil" },
  { id: 20, name: "dringend" },
  { id: 30, name: "Schockraum/Intensiv" },
];
export const DRINGLICHKEIT_NAME: Record<Dringlichkeit, string> = { 10: "stabil", 20: "dringend", 30: "Schockraum/Intensiv" };

export const ALTERSGRUPPEN: { id: Altersgruppe; name: string; text: string }[] = [
  { id: "kleinkind", name: "Kleinkind/Neugeboren", text: "unter 1" },
  { id: "kind", name: "Kind", text: "1 – 17" },
  { id: "erwachsener", name: "Erwachsener", text: "18+" },
];
const ALTER_KURZ: Record<Altersgruppe, string> = { kleinkind: "k", kind: "j", erwachsener: "e" };
const ALTER_LANG: Record<string, Altersgruppe> = { k: "kleinkind", j: "kind", e: "erwachsener" };

export interface Symptom {
  id: string;
  kategorie: string;
  name: string;
  synonyme: string[];
  dringlichkeiten: Dringlichkeit[];
  art: "intern" | "trauma";
  /** Akut-Abteilungen bei stabil/dringend (ODER über Alternativen, UND innerhalb) */
  o: string[][] | null;
  /** Akut-Abteilungen bei Schockraum/Intensiv */
  s: string[][] | null;
  zeitkritisch: boolean;
  /** besonderer Platz (Herzkatheter, Stroke Unit, Kreißsaal, Druckkammer) statt Notaufnahme/Schockraum */
  platz: string | null;
  ausweich: "intern" | "trauma" | null;
  /** Kinder: null = allgemeine Kinder-Regel, false = wie Erwachsene, sonst eigene Optionen */
  kinder: string[][] | false | null;
  /** stabil auch in der Primärversorgung (PVZ) */
  pvz: boolean;
  /** Schockraum-Art: egal = jeder Schockraum (nächstes Haus) */
  schock: "egal" | null;
}

export const SYMPTOME = (daten as { symptome: Symptom[] }).symptome;
const NACH_ID = new Map(SYMPTOME.map((s) => [s.id, s]));

export function symptom(id: string | null | undefined): Symptom | undefined {
  return id ? NACH_ID.get(id) : undefined;
}

/** Altersgruppe aus dem Alter (unbekannt = Erwachsener) */
export function altersgruppeVon(alter: number | null | undefined): Altersgruppe {
  if (alter === null || alter === undefined || !Number.isFinite(alter)) return "erwachsener";
  return alter < 1 ? "kleinkind" : alter < 18 ? "kind" : "erwachsener";
}

/** Erlaubte Dringlichkeit, die der gewünschten am nächsten liegt (bei Gleichstand die höhere) */
export function dringlichkeitFuer(s: Symptom, wunsch: Dringlichkeit): Dringlichkeit {
  if (s.dringlichkeiten.includes(wunsch)) return wunsch;
  return [...s.dringlichkeiten].sort((a, b) => Math.abs(a - wunsch) - Math.abs(b - wunsch) || b - a)[0] ?? wunsch;
}

export function zuweisungId(sid: string, d: Dringlichkeit, a: Altersgruppe): string {
  return `avn:${sid}:${d}:${ALTER_KURZ[a]}`;
}

export function istZuweisung(id: string | null | undefined): boolean {
  return !!id && id.startsWith("avn:");
}

export function zuweisungLesen(id: string | null | undefined): { s: Symptom; d: Dringlichkeit; a: Altersgruppe } | null {
  if (!istZuweisung(id)) return null;
  const [, sid, d, a] = id!.split(":");
  const s = symptom(sid);
  const dd = Number(d) as Dringlichkeit;
  if (!s || ![10, 20, 30].includes(dd)) return null;
  return { s, d: dd, a: ALTER_LANG[a] ?? "erwachsener" };
}

/** Text für Anzeige und Funk: „Herzrhythmusstörung, dringend“ (+ Altersgruppe bei Kindern) */
export function zuweisungName(id: string): string {
  const z = zuweisungLesen(id);
  if (!z) return id;
  return `${z.s.name}, ${DRINGLICHKEIT_NAME[z.d]}${z.a !== "erwachsener" ? `, ${ALTERSGRUPPEN.find((x) => x.id === z.a)!.name}` : ""}`;
}

export type ZuweisungBuchung = Buchung & {
  /** Schockraum-Art, die das Haus haben muss (null = keine Vorgabe) */
  schock: "trauma" | "intern" | null;
  platz: string | null;
  kind: boolean;
  /** Kinder: Häuser, die es nur für Erwachsene können (Ausweich, gekennzeichnet) */
  ausweichKind: string[][] | null;
  pvz: boolean;
  art: "intern" | "trauma";
};

const KINDER_AK = ["ak_kinder_jugendheilkunde", "ak_kinder_intensiv", "ak_kinderchirurgie", "ak_neonatologie", "ak_kinder_jugend_psychiatrie"];

const cache = new Map<string, ZuweisungBuchung>();

/** Buchung (wie klinik.ts) aus Symptom, Dringlichkeit und Altersgruppe */
export function zuweisungBuchung(id: string): ZuweisungBuchung | undefined {
  const c = cache.get(id);
  if (c) return c;
  const z = zuweisungLesen(id);
  if (!z) return undefined;
  const { s, d, a } = z;
  const kind = a !== "erwachsener";
  let optionen: string[][] = (d === 30 ? (s.s ?? s.o) : (s.o ?? s.s)) ?? [["ak_notaufnahme"]];
  // Schockraum/Intensiv ohne besonderen Platz: Haus braucht einen Schockraum der passenden Art
  const schockraum = d === 30 && !s.platz;
  const mitSchockraum = (l: string[][]) => (schockraum ? l.map((alt) => (alt.includes("ak_schockraum") ? alt : [...alt, "ak_schockraum"])) : l);
  let ausweichKind: string[][] | null = null;
  if (kind && s.kinder !== false) {
    // Kinder (alle Dringlichkeiten gleich): passend nur mit Kinder-Abteilung – dazu, was sonst nötig ist (z. B. Unfall + Kinder,
    // Neurochirurgie + Kinder). Häuser, die es nur für Erwachsene können, sind gekennzeichnete Ausweich-Häuser.
    const basis = s.kinder ? s.kinder : optionen;
    const istKind = (alt: string[]) => alt.some((x) => KINDER_AK.includes(x));
    const mit = (x: string) => basis.filter((alt) => !istKind(alt)).map((alt) => [...new Set([...alt, x])]);
    const eigene = basis.filter(istKind);
    const intensiv = d === 30 ? (a === "kleinkind" ? [...mit("ak_kinder_intensiv"), ...mit("ak_neonatologie")] : mit("ak_kinder_intensiv")) : [];
    const kinder = s.art === "trauma" ? [...mit("ak_kinderchirurgie"), ...mit("ak_kinder_jugendheilkunde")] : mit("ak_kinder_jugendheilkunde");
    ausweichKind = mitSchockraum(basis.filter((alt) => !istKind(alt)));
    optionen = [...eigene, ...intensiv, ...kinder];
  }
  optionen = mitSchockraum(optionen);
  const b: ZuweisungBuchung = {
    id,
    kategorie: s.art === "trauma" ? "Trauma" : s.kategorie,
    name: zuweisungName(id),
    optionen,
    zeitkritisch: s.zeitkritisch && d >= 20,
    ausweich: d === 10 ? s.ausweich : null,
    schock: schockraum && s.schock !== "egal" ? (s.art === "trauma" ? "trauma" : "intern") : null,
    platz: s.platz,
    kind,
    ausweichKind: ausweichKind?.length ? ausweichKind : null,
    pvz: s.pvz && d === 10,
    art: s.art,
  };
  cache.set(id, b);
  return b;
}

/** Plätze, die der Patient belegt (Gruppen nach Rang, wie ressourcenFuer in khStatus) */
export function zuweisungRessourcen(id: string, eignung: "passend" | "ausweich" | "rueckfall", kind: boolean): string[][] | null {
  const b = zuweisungBuchung(id);
  if (!b) return null;
  const z = zuweisungLesen(id)!;
  const SCHOCK_T = ["schockraum_trauma", "schockraum"];
  const SCHOCK_I = ["schockraum_intern", "schockraum"];
  const kinderTuer = kind || b.kind ? [["kindernotaufnahme"], ["notaufnahme"]] : [["notaufnahme"]];
  if (eignung !== "passend") return b.art === "trauma" ? [["unfall"], ["notaufnahme"]] : kinderTuer;
  switch (b.platz) {
    case "herzkatheter":
      return [["herzkatheter"], SCHOCK_I];
    case "stroke_unit":
      return [["stroke_unit"], ["notaufnahme"]];
    case "kreisssaal":
      return [["kreisssaal"]];
    case "druckkammer":
      return [["druckkammer"]];
    default:
      break;
  }
  if (z.d === 30) {
    if (b.optionen.some((alt) => alt.includes("ak_cardiac_arrest_center"))) return [["ecmo"], SCHOCK_I, ["notaufnahme"]];
    return b.art === "trauma" ? [SCHOCK_T, ["unfall"]] : b.schock === null ? [SCHOCK_I, SCHOCK_T, ["notaufnahme"]] : [SCHOCK_I, ["notaufnahme"]];
  }
  if (b.pvz) return b.art === "trauma" ? [["pvz"], ["unfall"], ["notaufnahme"]] : [["pvz"], ["notaufnahme"]];
  return b.art === "trauma" ? [["unfall"], ["notaufnahme"]] : kinderTuer;
}

// ------------------------------------------------------------------ Suche

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();

/** Symptome zur Suche: Name vor Synonym, Wortanfang vor Teil */
export function symptomSuche(q: string, max = 12): Symptom[] {
  const w = norm(q).split(/\s+/).filter(Boolean);
  if (!w.length) return [];
  const treffer: { s: Symptom; p: number }[] = [];
  for (const s of SYMPTOME) {
    const name = norm(s.name);
    const syn = s.synonyme.map(norm);
    const kat = norm(s.kategorie);
    let p = 0;
    let alle = true;
    for (const x of w) {
      if (name.split(" ").some((t) => t.startsWith(x))) p += 3;
      else if (name.includes(x)) p += 2;
      else if (syn.some((y) => y.split(" ").some((t) => t.startsWith(x)))) p += 1.5;
      else if (syn.some((y) => y.includes(x))) p += 1;
      else if (kat.includes(x)) p += 0.5;
      else alle = false;
    }
    if (alle) treffer.push({ s, p });
  }
  return treffer.sort((a, b) => b.p - a.p || a.s.name.localeCompare(b.s.name, "de")).slice(0, max).map((x) => x.s);
}

// ------------------------------------------------------------------ aus der Verdachtsdiagnose (Fälle)

const PAAR: Record<string, string> = {
  bu_stemi: "st_hebungsinfarkt_oder_stemi_aequivalent",
  bu_acs_ohne_st_hebung_unklarer_thoraxschmer: "acs_ohne_ekg_diagnostik",
  bu_reanimation_mit_rosc: "reanimation_medizinische_ursache",
  bu_laufende_reanimation_ecpr: "reanimation_medizinische_ursache",
  bu_aortendissektion: "thoraxschmerz_nicht_traumatisch",
  bu_rupturiertes_bauchaortenaneurysma: "akutes_abdomen",
  bu_akuter_arterieller_extremitaetenverschlu: "extremitaetenischaemie",
  bu_instabile_rhythmusstoerung: "herzrhythmusstoerung",
  bu_lungenembolie: "atemnot",
  bu_hypertensiver_notfall: "hypertensiver_notfall",
  bu_schlaganfall: "schlaganfall_apss_1_3",
  bu_schlaganfall_mit_v_a_grossen_gefaessvers: "schlaganfall_apss_4_9",
  bu_intrakranielle_blutung: "bewusstseinsstoerung_gcs_3_8",
  bu_erstmaliger_krampfanfall: "krampfanfall_erstmalig_unklar",
  bu_status_epilepticus: "status_epilepticus",
  bu_polytrauma: "polytrauma_ohne_sht",
  bu_schweres_sht: "schaedelhirntrauma",
  bu_wirbelsaeulenverletzung_mit_neurologisch: "wirbelsaeulenverletzung_mit_neurologischen_ausfa",
  bu_schweres_thoraxtrauma: "thoraxverletzung_stumpf",
  bu_abdominaltrauma: "abdominalverletzung",
  bu_isolierte_extremitaetenverletzung: "verletzungen_kombiniert",
  bu_bagatellverletzung: "wunde_weichteilverletzung",
  bu_amputationsverletzung: "amputation_arm_bein_mit_replantationsfaehigem_am",
  bu_gesichtsschaedelverletzung: "gesichts_kopfverletzung_augen",
  bu_augenverletzung: "augenverletzung",
  bu_schwere_verbrennung: "verbrennung_ueber_10_koerperoberflaeche",
  bu_leichte_verbrennung: "verbrennung_unter_10_koerperoberflaeche",
  bu_akutes_abdomen: "akutes_abdomen",
  bu_obere_gi_blutung: "gastrointestinale_blutung",
  bu_sepsis: "sepsis",
  bu_pneumonie_atemnot_copd: "atemnot",
  bu_exsikkose_synkope_az_verschlechterung: "kranke_person",
  bu_hausaerztlich: "kranke_person",
  bu_blutzuckerentgleisung: "blutzuckerentgleisung",
  bu_hyperkaliaemie_akutes_nierenversagen: "kranke_person",
  bu_anaphylaxie: "allergische_reaktion",
  bu_onkologischer_notfall: "kranke_person",
  bu_intoxikation: "vergiftung_oral_iv",
  bu_co_vergiftung_tauchunfall: "vergiftung_inhalativ",
  bu_fieber_nach_tropenaufenthalt: "infektionskrankheiten",
  bu_geburt_wehen: "drohende_geburt_ueber_ssw_37",
  bu_fruehgeburt: "drohende_geburt_unter_ssw_37",
  bu_gynaekologischer_notfall: "gynaekologisches_problem",
  bu_nierenkolik_harnverhalt_hodentorsion: "urologisches_problem",
  bu_internistischer_kindernotfall: "kranke_person",
  bu_kritisch_krankes_kind: "atemnot",
  bu_kritisch_krankes_neugeborenes: "neugeborenenversorgung",
  bu_verletztes_kind: "verletzungen_kombiniert",
  bu_psychische_krise_kind_jugendlicher: "akut_psychiatrisches_zustandsbild",
  bu_starkes_nasenbluten_fremdkoerper_hno: "nasenbluten",
  bu_schwere_hautreaktion: "allergische_reaktion",
  bu_psychische_krise_suizidalitaet: "akut_psychiatrisches_zustandsbild",
  bu_entzugssyndrom_delir: "entzugssymptomatik",
};

/** Feinere Wahl nach Stichworten im Fall (Körperteil, Ursache) */
const STICHWORTE: [RegExp, string][] = [
  [/schenkelhals/, "schenkelhalsfraktur"],
  [/h(ü|u)ft/, "hueftverletzung"],
  [/knie/, "knieverletzung"],
  [/sprung|kn(ö|o)chel/, "sprunggelenksverletzung"],
  [/oberschenkel/, "oberschenkelverletzung"],
  [/unterschenkel|schienbein|wade/, "unterschenkelverletzung"],
  [/fu(ß|ss)|zehe|ferse/, "fussverletzung_ohne_amputation"],
  [/schulter/, "schulterverletzung"],
  [/schl(ü|u)sselbein/, "schluesselbeinverletzung"],
  [/oberarm/, "oberarmverletzung"],
  [/ellbogen/, "ellbogenverletzung"],
  [/handgelenk/, "handgelenksverletzung"],
  [/unterarm|speiche|elle\b/, "unterarmverletzung"],
  [/hand|finger/, "handverletzung_ohne_amputation"],
  [/becken/, "beckenverletzung"],
];

/** Symptom-ID aus der Verdachtsdiagnose des Falls (mit Stichworten aus dem Fall) */
export function symptomAusDiagnose(bu: string, text = ""): string {
  const t = text.toLowerCase();
  if (bu === "bu_isolierte_extremitaetenverletzung" || bu === "bu_verletztes_kind") {
    for (const [re, id] of STICHWORTE) if (re.test(t)) return id;
  }
  if (bu === "bu_polytrauma" && /sch(ä|a)del|sht|kopf/.test(t)) return "polytrauma_mit_sht";
  if (bu === "bu_amputationsverletzung" && /finger|zehe/.test(t)) return "amputation_finger_zehen_mit_replantationsfaehige";
  if (bu === "bu_co_vergiftung_tauchunfall" && /tauch/.test(t)) return "geraetetauchunfall";
  if (bu === "bu_exsikkose_synkope_az_verschlechterung") return /synkop|kollaps|ohnmacht/.test(t) ? "kollaps" : /exsikk|trink|ausgetrocknet/.test(t) ? "exsikkose" : "kranke_person";
  if (bu === "bu_nierenkolik_harnverhalt_hodentorsion" && /hoden|skrotum/.test(t)) return "akutes_skrotum";
  if (bu === "bu_internistischer_kindernotfall") return /fieberkrampf|krampf/.test(t) ? "fieberkrampf" : /atem|luft|pseudokrupp/.test(t) ? "atemnot" : /fieber/.test(t) ? "fieber" : "kranke_person";
  if (bu === "bu_kritisch_krankes_kind" && /bewusst|reagiert nicht/.test(t)) return "bewusstseinsstoerung_gcs_3_8";
  if (bu === "bu_starkes_nasenbluten_fremdkoerper_hno" && /fremdk/.test(t)) return "fremdkoerper_nase_ohren";
  if (bu === "bu_psychische_krise_suizidalitaet" && /suizid|selbstmord/.test(t)) return "suizidalitaet";
  if (bu === "bu_gynaekologischer_notfall" && /schwanger/.test(t)) return "schwangerschaftskomplikationen";
  return PAAR[bu] ?? "kranke_person";
}
