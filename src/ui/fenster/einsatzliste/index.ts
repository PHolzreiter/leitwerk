/**
 * Einsatzliste aus dem Entwurf (Einsatzliste.dc.html) im Spiel: echte Einsätze, Krankentransporte und Überstellungen.
 * Hier werden die Spieldaten in die Einträge des Entwurfs übersetzt (Zustand, Code, Stichwort, Orte, Fahrzeuge,
 * Hinweis-Marken) und die Knöpfe an die echten Aktionen angeschlossen.
 */
import { store } from "../../../data/store";
import { findCode } from "../../../sim/codes";
import { sim, type Einsatz, type SimFahrzeug } from "../../../sim/engine";
import { ortKurz } from "../../../sim/funkErkennung";
import { hhmm, sekLeer, KT_TRANSPORTART_LABEL, type KtAuftrag, type KtOrt } from "../../../sim/kt";
import { codeInfo, istUeberstellung, ktCode } from "../../../sim/ktCodes";
import { mp } from "../../../net/mehrspieler";
import { ensureCodes } from "../../codesPrompt";
import { toast } from "../../dom";
import { entwurfEinbinden, type EntwurfFenster } from "../../entwurf/einbinden";
import { panelZeigen, type PanelKontext, type PanelInstanz } from "../../ws/arbeitsplatz";
import { auswahl, onAuswahl, waehle } from "../../ws/auswahl";
import { hoverMarkieren, markiert, onMarkiert } from "../../ws/markieren";
import { uhr } from "../../panels/teile";
import css from "./einsatzliste.css?raw";
import vorlage from "./vorlage.html?raw";
import { EinsatzlisteLogik, type ListenApp, type ListenEintrag, type ListenFahrzeug, type ListenLage, type ListenMarke } from "./logik";

// ---------------------------------------------------------------- Zustand

const ANRUF_LAEUFT = ["klingelt", "aktiv", "gehalten", "verpasst"];
const LAGE_ORDNUNG: Record<ListenLage, number> = { dispo: 0, anruf: 1, vorgemerkt: 2, zumbo: 3, ambo: 4, zumzo: 5, amzo: 6, erledigt: 9 };

/** Fahrzeug-Status → Abschnitt des Einsatzes (vor = alarmiert/zum BO, bo = am BO, zzo = zum ZO, azo = am ZO) */
function abschnitt(fz: SimFahrzeug): "vor" | "bo" | "zzo" | "azo" | null {
  switch (fz.status) {
    case "alarmWache":
    case "alarmFunk":
    case "alarmiert":
    case "zumBO":
      return "vor";
    case "amBO":
      return "bo";
    case "zumZO":
      return "zzo";
    case "amZO":
      return "azo";
    default:
      return null;
  }
}

/**
 * Zustand aus den Fahrzeugen. Wie beim Großeinsatz entschieden: „am BO“, sobald der Erste dort ist;
 * „zum ZO“, wenn der Letzte vom Einsatzort weg ist; „am ZO“, wenn der Letzte das Krankenhaus erreicht hat.
 */
function lageAusFahrzeugen(fz: SimFahrzeug[]): ListenLage {
  const a = fz.map(abschnitt).filter((x): x is NonNullable<typeof x> => !!x);
  if (!a.length) return "zumbo";
  if (a.every((x) => x === "azo")) return "amzo";
  if (a.every((x) => x === "zzo" || x === "azo")) return "zumzo";
  if (a.some((x) => x !== "vor")) return "ambo";
  return "zumbo";
}

/** Fahrzeuge, die gerade für diesen Einsatz fahren (beim Großeinsatz auch die der Patienten) */
function rdFahrzeuge(e: Einsatz): SimFahrzeug[] {
  const ids = new Set([e.id]);
  if (e.gs) for (const k of Object.values(e.gs.kinder)) ids.add(k);
  return Object.values(sim.state.fahrzeuge).filter((f) => f.einsatzId && ids.has(f.einsatzId));
}

function rdLage(e: Einsatz, fz: SimFahrzeug[]): ListenLage {
  if (e.zustand === "abgeschlossen") return "erledigt";
  if (!fz.length && e.fremd) return "erledigt";
  if (!fz.length) return e.anruf && ANRUF_LAEUFT.includes(e.anruf.status) ? "anruf" : "dispo";
  return lageAusFahrzeugen(fz);
}

/** KT/Überstellung, die schon losfahren müsste, aber noch nicht unterwegs ist */
function ktSpaet(k: KtAuftrag): boolean {
  const ab = k.d.abholung ?? (k.d.termin ? k.d.termin - 45 * 60_000 : null);
  return ab !== null && ["offen", "vorgemerkt"].includes(k.status) && ab < sim.state.zeit;
}

function ktLage(k: KtAuftrag, fz: SimFahrzeug | undefined): ListenLage {
  if (k.status === "erledigt" || k.status === "storniert") return "erledigt";
  if (k.status === "aufnahme" || (k.anruf && ["klingelt", "aktiv", "gehalten"].includes(k.anruf.status))) return "anruf";
  if (k.status === "offen") return "dispo";
  if (k.status === "vorgemerkt") return "vorgemerkt";
  if (k.status === "anBord") return fz?.status === "amZO" ? "amzo" : "zumzo";
  return fz?.status === "amBO" ? "ambo" : "zumbo";
}

// ---------------------------------------------------------------- Texte

const STUFE_FARBE: [string, string][] = [
  ["rot", "#E5484D"],
  ["orange", "#F2913A"],
  ["gelb", "#FFC72C"],
  ["grün", "#4CC38A"],
];
const KT_FARBE = "#3B8BFF";
const SEK_FARBE = "#8E7CF0";

function rdFarbe(stufe: string): string {
  const s = stufe.toLowerCase();
  for (const [k, v] of STUFE_FARBE) if (s.includes(k)) return v;
  const d = sim.stufeDef(stufe);
  if (d?.kategorie === "kritisch") return "#E5484D";
  if (d?.kategorie === "dringend") return d.sondersignal ? "#FFC72C" : "#4CC38A";
  if (d?.kategorie === "stabil" && d.rettungsmittel) return "#4CC38A";
  return "#90A4AE";
}

/** Ortsname aus einer Adresse („Obere Landstraße 12, 3500 Krems an der Donau“ → „Krems“) */
function ortAus(label: string | undefined | null): string {
  if (!label) return "";
  const teile = label.split(",").map((s) => s.trim()).filter(Boolean);
  const t = (teile.length > 1 ? teile[teile.length - 1] : teile[0] ?? "").replace(/^\d{4,5}\s+/, "");
  return ortKurz(t);
}
function khOrt(id: string | undefined | null): string {
  const h = id ? store.get("hospitals", id) : undefined;
  return h ? ortKurz(h.ort || h.kurzname || h.name) : "";
}
const ktOrt = (o: KtOrt | null): string => (o ? (o.khId ? khOrt(o.khId) : "") || ortAus(o.label) : "");

function fahrzeug(f: SimFahrzeug, zu: string): ListenFahrzeug {
  return { id: f.id, r: f.funkrufname, typ: f.typ ?? f.rmTyp, rm: f.rmTyp, s: sim.statusDef(f.status).nummer, zu };
}

/** Ort eines Fahrzeugs im Einsatz: wohin es fährt bzw. wo es steht (BR als „Ort (BR)“) */
function rdFzOrt(e: Einsatz, f: SimFahrzeug): string {
  const ab = abschnitt(f);
  const eig = f.einsatzId && f.einsatzId !== e.id ? sim.einsatz(f.einsatzId) : e;
  if (ab === "zzo" || ab === "azo") return (eig?.kh ? khOrt(eig.kh.hospitalId) : "") || ortAus(eig?.zo?.label) || ortAus(f.stationName);
  const br = f.phase === "bereitstellung" || f.phase === "wartetBR" || e.gs?.ziel[f.id] === "br";
  const brOrt = e.gs?.br ?? e.br;
  if (br && brOrt) return `${ortAus(brOrt.label) || ortAus(e.adresse?.label)} (BR)`;
  return ortAus(e.adresse?.label ?? e.meldung.adresse) || ortKurz(f.kurzname || f.stationName);
}

function initialen(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w.length > 1 ? w[w.length - 1][0] : (w[0]?.[1] ?? ""))).toUpperCase();
}

function MK(t: string, cls: string, titel: string, o: { blink?: boolean; ini?: string; dringend?: boolean } = {}): ListenMarke {
  return { t, cls: "mk " + (cls || "") + (o.blink ? " blink" : ""), titel: titel || t, wer: !!o.ini, ini: o.ini ?? "", dringend: !!o.dringend };
}

/** Marken zum Telefon (läuft gerade ein Anruf zu diesem Eintrag?) */
function anrufMarken(a: Einsatz["anruf"], hotline: boolean): ListenMarke[] {
  if (!a || !ANRUF_LAEUFT.includes(a.status)) return [];
  if (a.status === "klingelt") return [MK(a.folge ? "Folgeanruf" : hotline ? "Hotline klingelt" : "klingelt", "gelb", a.folge ? "Der Anrufer ruft noch einmal an" : "Anruf wartet im Telefon", { blink: true, dringend: true })];
  if (a.status === "verpasst") return [MK("verpasst", "rot", "Anruf verpasst – der Anrufer ruft wieder an", { dringend: true })];
  if (a.status === "gehalten") return [MK("gehalten", "gelb", "Anruf ist gehalten")];
  const wer = a.angenommenVon;
  const name = wer ? (mp.aktiv && wer.pid === mp.ich.pid ? "du" : wer.name) : "";
  return [MK("im Gespräch", "gelb", name ? `${name === "du" ? "Du fragst" : name + " fragt"} gerade ab` : "Gespräch läuft", mp.aktiv && wer ? { ini: initialen(wer.name) } : {})];
}

function bearbeiterMarke(b: Einsatz["bearbeiter"]): ListenMarke[] {
  if (!mp.aktiv || !b) return [];
  const sp = mp.spieler.find((s) => s.pid === b.pid);
  const ich = b.pid === mp.ich.pid;
  if (sp && !sp.online) return [MK(`Entwurf ${b.name}`, "", `Entwurf von ${b.name} (offline) – kann übernommen werden`, { ini: initialen(b.name) })];
  return [MK(ich ? "du" : b.name, "", `${ich ? "Du bearbeitest" : b.name + " bearbeitet"} diesen Einsatz`, { ini: initialen(b.name) })];
}

const NF_TEXT: Record<string, string> = { NA: "Notarzt", RTW: "RTW", BIT: "BIT", NFS: "NEF/RTW-C" };

// ---------------------------------------------------------------- Einträge

interface Roh {
  e: ListenEintrag;
  /** Rangfolge: Gruppe, Stufe, Zeit */
  g: number;
  kat: number;
  zeit: number;
}

function rdEintrag(e: Einsatz): Roh {
  const fz = rdFahrzeuge(e);
  const lage = rdLage(e, fz);
  const c = findCode(e.code ?? undefined);
  const st = c ? sim.stufeVon(e) : undefined;
  const gs = !!e.gs && !e.gs.aufgehoben;
  const mk: ListenMarke[] = [];
  const kinder = gs ? Object.entries(e.gs!.kinder).map(([nr, id]) => ({ nr, k: sim.einsatz(id) })) : [];
  if (gs) mk.push(MK(e.gs!.stufe ?? "Großeinsatz", "gs", "Großeinsatz – Reiter Großeinsatz"));
  if (gs && e.gs!.brNoetig) mk.push(MK("Bereitstellungsraum fehlt", "rot", "Fahrzeuge warten auf den Bereitstellungsraum – Reiter Großeinsatz", { blink: true, dringend: true }));
  for (const { nr, k } of kinder)
    if (k?.khAnfrage && k.zustand !== "abgeschlossen") mk.push(MK("KH-Anfrage", "blau", `Patient ${nr} wartet auf ein Krankenhaus`, { blink: true, dringend: true }));
  if (e.khAnfrage) mk.push(MK("KH-Anfrage", "blau", `${e.khAnfrage.von} bittet um eine Krankenhaus-Buchung`, { blink: true, dringend: true }));
  for (const n of e.nachforderungen ?? [])
    if (!n.erledigt) mk.push(MK(`Nachforderung ${n.anzahl > 1 ? n.anzahl + " " : ""}${NF_TEXT[n.art] ?? n.art}`, "gelb", `Besatzung ${n.von} fordert ${n.art === "NA" ? "einen Notarzt" : n.art === "NFS" ? "ein NEF oder einen RTW-C (Notfallsanitäter) an" : n.anzahl > 1 ? n.anzahl + " × " + n.art : n.art} nach`, { blink: true, dringend: true }));
  if (e.adressePruefen && lage !== "erledigt") mk.push(MK("Adresse prüfen", "rot", "Die Adresse stimmt vermutlich nicht – bitte prüfen", { blink: true, dringend: true }));
  if (lage !== "erledigt") mk.push(...anrufMarken(e.anruf, false));
  if (e.zusammengelegt) mk.push(MK("zusammengelegt", "", "zweiter Notruf, mit einem anderen Einsatz zusammengelegt"));
  if (e.fremd) mk.push(MK(`Zone ${e.fremd.zone}`, "", "Einsatz einer anderen Zone – dort disponiert, deine Fahrzeuge fahren mit"));
  if (e.zustand !== "abgeschlossen") mk.push(...bearbeiterMarke(e.bearbeiter));
  const offenNf = !!e.nachforderungen?.some((n) => !n.erledigt);
  const tun =
    lage !== "erledigt" &&
    (gs
      ? e.gs!.phase !== "alarm" && (e.gs!.brNoetig || offenNf || kinder.some(({ k }) => k && !k.kh && k.zustand !== "abgeschlossen"))
      : !e.fremd && (!fz.length || offenNf || !!e.khAnfrage || e.adressePruefen));
  const zo = gs ? (kinder.length ? "mehrere (Reiter Großeinsatz)" : "") : (e.zo?.label ?? (e.kh ? (store.get("hospitals", e.kh.hospitalId)?.name ?? "") : ""));
  const bo = e.adresse?.label ?? (e.meldung.adresse ? `gemeldet: ${e.meldung.adresse}` : "Adresse fehlt");
  const fzl = fz.map((f) => fahrzeug(f, rdFzOrt(e, f)));
  const sw = c?.beschreibung ?? "";
  const zi = e.infoRtw?.trim() ?? "";
  const nrKurz = e.nummer.includes("-") ? e.nummer.split("-").pop()! : e.nummer;
  const eintrag: ListenEintrag = {
    id: e.id,
    quelle: "einsatz",
    art: "rd",
    nr: nrKurz,
    nrVoll: e.nummer,
    ein: uhr(e.erstellt),
    lage,
    neu: lage === "dispo" && !e.fahrzeuge.length,
    code: c?.code ?? e.code ?? "",
    farbe: c ? rdFarbe(c.stufe) : "",
    stufe: c?.stufe ?? "",
    sw,
    zi,
    bo,
    boGem: !e.adresse && !!e.meldung.adresse,
    zo,
    fz: fzl,
    mk,
    rang: 0,
    tun,
    fremd: !!e.fremd,
    gs,
    such: [e.nummer, e.code ?? "", sw, zi, bo, zo, e.meldung.adresse, fzl.map((f) => f.r).join(" ")].join(" ").toLowerCase(),
  };
  const kat = st?.kategorie === "kritisch" ? 0 : st?.kategorie === "dringend" ? 1 : st ? 2 : 1;
  return { e: eintrag, g: gruppe(eintrag) - (gs ? 0.5 : 0), kat, zeit: e.erstellt };
}

/** Abholzeit für die Liste: eingegebene Abholung, sonst aus dem Termin (45 min vorher) – solange nicht abgeholt */
function abholText(k: KtAuftrag, lage: ListenLage): string | undefined {
  if (lage === "erledigt" || k.status === "anBord") return undefined;
  if (k.d.abholung) return `Abholung ${hhmm(k.d.abholung)}`;
  if (k.d.termin) return `Abholung ~${hhmm(k.d.termin - 45 * 60_000)}`;
  return undefined;
}

/** sofort oder Abholung (bzw. Termin − 45 min) innerhalb der nächsten Stunde; ohne Zeitangabe ebenfalls */
function bald(k: KtAuftrag): boolean {
  if (k.d.sofort) return true;
  const ab = k.d.abholung ?? (k.d.termin ? k.d.termin - 45 * 60_000 : null);
  return ab == null || ab <= sim.state.zeit + 60 * 60_000;
}

function ktEintrag(k: KtAuftrag): Roh {
  const sek = istUeberstellung(k.d);
  const f = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
  const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
  const lage = ktLage(k, f);
  const spaet = ktSpaet(k);
  const info = codeInfo(k.d.code);
  const mk: ListenMarke[] = [];
  // nur die eingegebene Zeit (Abholung oder Termin), überfällig rot
  const vorgabe = k.d.zeitVorgabe ?? (k.d.abholung ? "abholung" : k.d.termin ? "termin" : null);
  if (lage !== "erledigt") {
    if (vorgabe === "abholung" && k.d.abholung)
      mk.push(spaet ? MK(`Abholung ${hhmm(k.d.abholung)} · überfällig`, "rot", "hätte schon abgeholt werden sollen", { dringend: true }) : MK(`Abholung ab ${hhmm(k.d.abholung)}`, "", "frühestens abholbar"));
    else if (vorgabe === "termin" && k.d.termin)
      mk.push(spaet ? MK(`Termin ${hhmm(k.d.termin)} · knapp`, "rot", "müsste schon unterwegs sein, um den Termin zu schaffen", { dringend: true }) : MK(`Termin ${hhmm(k.d.termin)}`, "", "Termin im Zielkrankenhaus"));
    if (k.d.sofort || info.sondersignal) mk.push(MK(info.sondersignal ? "Sondersignal" : "SOFORT", "rot", info.sondersignal ? "mit Blaulicht" : "sofort fahren", { dringend: k.status === "offen" }));
    if (k.status === "vorgemerkt" && f?.kt?.losUm) mk.push(MK(`los ${hhmm(f.kt.losUm)}`, "", `${f.funkrufname} fährt um ${hhmm(f.kt.losUm)} selbst los`));
    if (k.status === "aufnahme" && !(k.anruf && ANRUF_LAEUFT.includes(k.anruf.status))) mk.push(MK("Aufnahme", "gelb", "Auftrag wird aufgenommen"));
    mk.push(...anrufMarken(k.anruf, true));
    if (k.nachfrage) mk.push(MK("Nachfrage", "gelb", "Der Auftraggeber hat nachgefragt, wo der Transport bleibt"));
    mk.push(...bearbeiterMarke(k.bearbeiter));
  } else if (k.status === "storniert") mk.push(MK("storniert", "", "Auftrag storniert"));
  const tags: string[] = [];
  const s = k.d.sek;
  if (s?.beatmet) tags.push("beatmet");
  else if (s?.arzt) tags.push("Arztbegleitung");
  else if (s?.monitoring) tags.push("Monitor");
  if (s?.instabil) tags.push("instabil");
  if (s?.inkubator) tags.push((k.d.patient.alter ?? 1) < 1 ? "Inkubator" : "Kind");
  if (s?.bit) tags.push("BIT");
  if (info.flug) tags.push("Flug");
  const p = k.d.patient;
  const wer = `${p.alter ?? ""}${p.geschlecht ?? ""}`;
  const rest = [...tags, ...(sek ? [k.d.grund, p.info] : [p.info || k.d.grund])].filter(Boolean).join(", ");
  const zi = wer && rest ? `${wer} // ${rest}` : wer || rest;
  const sw = ktCode(k.d.code)?.name ?? (k.d.ktArt ? KT_TRANSPORTART_LABEL[k.d.ktArt] : "") ?? "";
  const fzl: ListenFahrzeug[] = [];
  const zu = (x: SimFahrzeug) => (x.status === "zumZO" || x.status === "amZO" || k.status === "anBord" ? ktOrt(k.d.nach) : ktOrt(k.d.von)) || ortKurz(x.kurzname || x.stationName);
  if (f) fzl.push(fahrzeug(f, zu(f)));
  if (nef) fzl.push(fahrzeug(nef, zu(nef)));
  const bo = k.d.von?.label ?? "–";
  const zo = k.d.nach?.label ?? "";
  const kurz = k.nummer.split("-").pop() ?? k.nummer;
  const eintrag: ListenEintrag = {
    id: k.id,
    quelle: "kt",
    art: sek ? "sek" : "kt",
    nr: k.nummer === "PROBE" ? k.nummer : `${sek ? "SEK" : "KT"} ${kurz}`,
    nrVoll: k.nummer,
    ein: hhmm(k.eingang),
    lage,
    abhol: abholText(k, lage),
    // blinkt nur, was sofort oder in der nächsten Stunde abzuholen ist (Paul 12.11.2026)
    neu: k.status === "offen" && !k.fz && bald(k),
    code: k.d.code ?? "",
    farbe: sek ? SEK_FARBE : KT_FARBE,
    stufe: sek ? "Überstellung" : "Krankentransport",
    sw,
    zi,
    bo,
    boGem: false,
    zo,
    fz: fzl,
    mk,
    rang: 0,
    tun: lage === "dispo" || (spaet && lage !== "erledigt"),
    fremd: false,
    gs: false,
    such: [k.nummer, k.d.code ?? "", sw, zi, p.name, bo, zo, fzl.map((x) => x.r).join(" ")].join(" ").toLowerCase(),
  };
  const kat = info.sondersignal || k.d.sofort ? 1 : 2;
  return { e: eintrag, g: gruppe(eintrag) - (spaet ? 0.25 : 0), kat, zeit: k.d.abholung ?? k.d.termin ?? k.eingang };
}

/** Dringlichkeit: erst was auf dich wartet, dann laufende Anrufe, dann nach Fortschritt */
function gruppe(e: ListenEintrag): number {
  if (e.lage === "erledigt") return 90;
  if (e.lage === "dispo" || (e.tun && e.lage !== "anruf")) return 0;
  return 10 + LAGE_ORDNUNG[e.lage] * 10;
}

/** alle Einträge in Dringlichkeits-Reihenfolge (rang) */
export function eintraege(): ListenEintrag[] {
  const roh: Roh[] = [];
  for (const e of sim.state.einsaetze) {
    // Anrufe, die noch niemand angenommen hat, stehen nur im Telefon
    if (e.anruf && !e.anruf.angenommenVon && !e.fahrzeuge.length) continue;
    // Großschaden: die Patienten stehen im Reiter Großeinsatz
    if (e.gsKind) continue;
    roh.push(rdEintrag(e));
  }
  for (const k of sim.state.kt ?? []) {
    if (k.anruf && !k.anruf.angenommenVon && k.status === "aufnahme") continue;
    roh.push(ktEintrag(k));
  }
  roh.sort((a, b) => a.g - b.g || a.kat - b.kat || (a.g >= 90 ? b.zeit - a.zeit : a.zeit - b.zeit));
  return roh.map((r, i) => ((r.e.rang = i), r.e));
}

// ---------------------------------------------------------------- Aktionen

async function warten(da: () => boolean): Promise<void> {
  for (let i = 0; !da() && i < 20; i++) await new Promise((r) => setTimeout(r, 100));
}

async function neuVonHand(art: "kt" | "sek"): Promise<void> {
  const id = await sim.call("ktNeuManuell").catch((err) => (toast(String(err.message ?? err), "error"), null));
  if (!id) return;
  await warten(() => !!sim.ktAuftrag(id));
  if (art === "sek") await sim.call("ktSetze", id, { sek: sekLeer() }).catch((err) => toast(String(err.message ?? err), "error"));
  waehle("kt", id);
}

async function test(art: string, filter = "alle"): Promise<void> {
  if (art === "rd") {
    if (!ensureCodes()) return;
    const e = await sim.call("generiere").catch((err) => (toast(String(err.message ?? err), "error"), null));
    if (e) await warten(() => !!sim.einsatz(e.id));
    if (e) waehle("einsatz", e.id);
    else toast("Kein Einsatz erzeugt – Adressen noch nicht geladen?", "error");
  } else if (art === "kt" || art === "sek") {
    // Test-Aufträge kommen immer als Anruf über die KT-Hotline (Paul 11.11.2026)
    const k = await (art === "sek" ? sim.call("generiereSek", "hotline") : sim.call("generiereKt", "hotline")).catch((err) => (toast(String(err.message ?? err), "error"), null));
    if (k) await warten(() => !!sim.ktAuftrag(k.id));
    if (k) waehle("kt", k.id);
    else toast("Kein Auftrag erzeugt – sind Krankenhäuser mit Stationen vorhanden?", "error");
  } else if (art === "gs") {
    if (!ensureCodes()) return;
    const id = await sim.call("grossschadenAusloesen").catch((err) => (toast(String(err.message ?? err), "error"), null));
    if (id) await warten(() => !!sim.einsatz(String(id)));
    if (id) {
      toast("Großschadensfall ausgelöst – der erste Notruf klingelt");
      panelZeigen("grosseinsatz");
    }
  } else if (art === "testlauf") {
    // KI-Gespräche automatisch durchspielen (wie im Fall-Editor)
    const { testlaufDialog } = await import("../../testlauf");
    await testlaufDialog(null, filter === "sek" ? "sek" : filter === "kt" ? "kt" : filter === "rd" ? "notruf" : "alles");
  }
}

// ---------------------------------------------------------------- Fenster

export function einsatzlisteFenster(ctx: PanelKontext): PanelInstanz {
  const root = document.createElement("div");
  root.className = "ew-einsatzliste";
  root.style.cssText = "width:100%;height:100%;overflow:hidden";

  let daten: ListenEintrag[] = [];
  let merkTimer: ReturnType<typeof setTimeout> | null = null;
  const app: ListenApp = {
    gemerkt: { ...ctx.params },
    merken: (p) => {
      if (merkTimer) clearTimeout(merkTimer);
      merkTimer = setTimeout(() => ctx.setzeParams(JSON.parse(JSON.stringify(p))), 300);
    },
    daten: () => daten,
    keineDaten: () => !daten.length,
    auswahlId: () => auswahl().id,
    oeffnen: (e) => {
      if (e.quelle === "kt") waehle("kt", e.id, { karte: false });
      else if (e.gs) {
        waehle("einsatz", e.id, { karte: false, maske: false });
        panelZeigen("grosseinsatz");
      } else waehle("einsatz", e.id, { karte: false });
    },
    karte: (e) => waehle(e.quelle === "kt" ? "kt" : "einsatz", e.id, { maske: false }),
    neu: (art) => void neuVonHand(art),
    test: (art, filter) => void test(art, filter),
    host: () => mp.status.rolle !== "client",
  };

  // Daten holen, Reiter-Zahl setzen; gezeichnet wird nur, wenn der Reiter sichtbar ist
  let fenster: EntwurfFenster<EinsatzlisteLogik> | null = null;
  let veraltet = false;
  const markierung = () => {
    if (!fenster) return;
    const id = markiert("einsatz");
    const ziel = id ? (sim.einsatz(id)?.gsKind?.parent ?? id) : null;
    for (const z of fenster.wurzel.querySelectorAll<HTMLElement>(".ez.mark")) if (z.dataset.id !== ziel) z.classList.remove("mark");
    if (ziel) fenster.wurzel.querySelector<HTMLElement>(`.ez[data-id="${CSS.escape(ziel)}"]`)?.classList.add("mark");
  };
  const render = () => {
    daten = eintraege();
    ctx.setzeBadge(daten.filter((e) => e.lage !== "erledigt" && (e.lage === "dispo" || e.tun)).length || null, "warn");
    if (!ctx.sichtbar()) {
      veraltet = true;
      return;
    }
    veraltet = false;
    if (!fenster) {
      fenster = entwurfEinbinden(root, "einsatzliste", vorlage, css, (p) => new EinsatzlisteLogik(p), { app });
      const zeichnen = fenster.k._zeichnen!;
      // nach jedem Zeichnen die Markierung aus der Fahrzeugliste wieder setzen (Klassen gehören der Vorlage)
      fenster.k._zeichnen = () => {
        zeichnen();
        markierung();
      };
    } else fenster.zeichnen();
  };

  // gedrosselt neu zeichnen
  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      render();
    }, 400);
  };
  const aus = [
    sim.onChange(spaeter),
    mp.onChange(spaeter),
    onAuswahl(() => {
      render();
      // ausgewählten Eintrag sichtbar machen (z. B. „Zum Einsatz“ im Fahrzeug-Info auf der Karte)
      fenster?.wurzel.querySelector<HTMLElement>(".ez.gew")?.scrollIntoView({ block: "nearest" });
    }),
    onMarkiert("einsatz", markierung),
    hoverMarkieren(root, "data-fz", "fahrzeug"),
  ];
  render();
  return {
    el: root,
    dispose: () => {
      aus.forEach((f) => f());
      fenster?.entfernen();
    },
    sichtbar: (an) => {
      if (an && (veraltet || !fenster)) render();
    },
  };
}
