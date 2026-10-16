/**
 * Verdachtsdiagnose (Buchung) eines Einsatzes: ergibt sich aus Thema, Antworten, Codename und dem,
 * was die Besatzung beim Patienten vorfindet. Bleibt verborgen, bis die Besatzung bucht oder anfragt.
 */
import type { Antworten } from "../abfrage/schema";
import type { LagePatient } from "./lage";

export interface VerdachtDaten {
  thema: string;
  antworten: Antworten;
  /** Name/Beschreibung des Codes */
  name: string;
  alter: number;
  patient?: LagePatient;
  /** Patient war im Kreislaufstillstand (Reanimation) */
  rea?: boolean;
  rnd?: () => number;
}

const TRAUMA = ["sturz", "verletzung", "blutung", "verkehrsunfall", "eingeklemmt", "tierbiss", "stich_schuss", "gewalt", "alpin", "ecall"];

export function verdachtFuer(d: VerdachtDaten): string {
  const r = d.rnd ?? Math.random;
  const t = d.thema;
  const n = d.name;
  const a = d.antworten;
  const rot = d.patient?.sichtung === "rot";
  const kind = d.alter < 15;
  const ja = (k: string) => a[k] === "ja";

  if (d.rea) return r() < 0.15 ? "bu_laufende_reanimation_ecpr" : "bu_reanimation_mit_rosc";

  // Fächer, die auch bei Kindern ihr eigenes Haus brauchen
  if (t === "auge") return "bu_augenverletzung";
  if (t === "brand" || /Verbrenn|Verbrüh/i.test(n)) return rot ? "bu_schwere_verbrennung" : "bu_leichte_verbrennung";
  if (/Nasenbluten/i.test(n)) return "bu_starkes_nasenbluten_fremdkoerper_hno";
  if (t === "schwangerschaft") {
    if (/Frühgeburt|vorzeitig/i.test(n) || (typeof a.ssw === "number" && a.ssw < 37)) return "bu_fruehgeburt";
    if (/Blutung|Fehlgeburt|Abort/i.test(n) && !/Geburt (steht|erfolgt)/i.test(n)) return "bu_gynaekologischer_notfall";
    return "bu_geburt_wehen";
  }
  if (t === "psych") return kind || d.alter < 18 ? "bu_psychische_krise_kind_jugendlicher" : "bu_psychische_krise_suizidalitaet";

  // Kinder
  if (kind) {
    if (d.alter < 1 && rot) return "bu_kritisch_krankes_neugeborenes";
    if (TRAUMA.includes(t) || t === "strom") return "bu_verletztes_kind";
    return rot ? "bu_kritisch_krankes_kind" : "bu_internistischer_kindernotfall";
  }

  // Trauma
  if (TRAUMA.includes(t)) {
    if (/Amputation|abgetrennt/i.test(n)) return "bu_amputationsverletzung";
    if (/Gesicht|Kiefer/i.test(n)) return "bu_gesichtsschaedelverletzung";
    if (rot) {
      if (/Kopf|Schädel|SHT/i.test(n) || ja("kopfverletzung") || (t === "sturz" && r() < 0.5)) return "bu_schweres_sht";
      if (/Wirbelsäule|Querschnitt|gelähmt/i.test(n)) return "bu_wirbelsaeulenverletzung_mit_neurologisch";
      if (t === "stich_schuss") return r() < 0.5 ? "bu_schweres_thoraxtrauma" : "bu_abdominaltrauma";
      return "bu_polytrauma";
    }
    return "bu_isolierte_extremitaetenverletzung";
  }

  switch (t) {
    case "brustschmerz":
      if (/STEMI|Infarkt/i.test(n) || (rot && r() < 0.7) || r() < 0.25) return "bu_stemi";
      if (r() < 0.08) return "bu_aortendissektion";
      if (r() < 0.08) return "bu_lungenembolie";
      return "bu_acs_ohne_st_hebung_unklarer_thoraxschmer";
    case "herz":
      return rot ? "bu_instabile_rhythmusstoerung" : r() < 0.4 ? "bu_hypertensiver_notfall" : "bu_acs_ohne_st_hebung_unklarer_thoraxschmer";
    case "schlaganfall":
      if (rot && r() < 0.5) return "bu_schlaganfall_mit_v_a_grossen_gefaessvers";
      return r() < 0.12 ? "bu_intrakranielle_blutung" : "bu_schlaganfall";
    case "kopfschmerz":
      return rot ? "bu_intrakranielle_blutung" : r() < 0.3 ? "bu_hypertensiver_notfall" : "bu_exsikkose_synkope_az_verschlechterung";
    case "krampf":
      if (rot) return "bu_status_epilepticus";
      return /erstmalig|erster/i.test(n) || ja("erstmalig") || r() < 0.3 ? "bu_erstmaliger_krampfanfall" : "bu_exsikkose_synkope_az_verschlechterung";
    case "atemnot":
    case "wasser":
      return r() < 0.06 ? "bu_lungenembolie" : "bu_pneumonie_atemnot_copd";
    case "ersticken":
      return rot ? "bu_pneumonie_atemnot_copd" : "bu_starkes_nasenbluten_fremdkoerper_hno";
    case "allergie":
      return rot || r() < 0.6 ? "bu_anaphylaxie" : "bu_schwere_hautreaktion";
    case "bauch":
      if (/Blut|Teerstuhl/i.test(n) || ja("blut_erbrochen")) return "bu_obere_gi_blutung";
      if (/Niere|Harn|Hoden/i.test(n) || r() < 0.15) return "bu_nierenkolik_harnverhalt_hodentorsion";
      if (d.alter > 60 && rot && r() < 0.3) return "bu_rupturiertes_bauchaortenaneurysma";
      return "bu_akutes_abdomen";
    case "ruecken":
      if (d.alter > 60 && rot && r() < 0.3) return "bu_rupturiertes_bauchaortenaneurysma";
      return r() < 0.3 ? "bu_nierenkolik_harnverhalt_hodentorsion" : "bu_exsikkose_synkope_az_verschlechterung";
    case "zucker":
      return "bu_blutzuckerentgleisung";
    case "vergiftung":
      if (/Alkohol|Entzug|Delir/i.test(n) && r() < 0.4) return "bu_entzugssyndrom_delir";
      return "bu_intoxikation";
    case "gefahrstoff":
      return /CO|Kohlenmonoxid|Rauchgas/i.test(n) || r() < 0.5 ? "bu_co_vergiftung_tauchunfall" : "bu_intoxikation";
    case "strom":
      return rot ? "bu_instabile_rhythmusstoerung" : "bu_leichte_verbrennung";
    case "hitze_kaelte":
      return "bu_exsikkose_synkope_az_verschlechterung";
    case "infekt":
      return rot ? "bu_sepsis" : r() < 0.4 ? "bu_pneumonie_atemnot_copd" : "bu_exsikkose_synkope_az_verschlechterung";
    case "stillstand":
      return "bu_reanimation_mit_rosc";
    default:
      // krank, bewusstlos, unklar, Anforderungen …
      if (rot && r() < 0.35) return "bu_sepsis";
      if (r() < 0.05) return "bu_onkologischer_notfall";
      if (r() < 0.03) return "bu_hyperkaliaemie_akutes_nierenversagen";
      return "bu_exsikkose_synkope_az_verschlechterung";
  }
}
