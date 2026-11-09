/**
 * RD-Übersicht (Einsatzmaske) aus dem Entwurf „Einsatzmaske“ – angebunden an Store und Simulation.
 * Zeigt den Notfall, der in der Einsatzliste (oder auf der Karte) ausgewählt ist.
 */
import vorlage from "./vorlage.html?raw";
import css from "../masken-teile/masken.css?raw";
import { EinsatzmaskeLogik } from "./logik.js";
import { entwurfEinbinden, type EntwurfFenster } from "../../entwurf/einbinden";
import { gesagteAdresse } from "../../../abfrage/adresseGesagt";
import { nummerAus } from "../../../sim/rufnummer";
import { PARTNER, PARTNER_ARTEN, type PartnerArt } from "../../../sim/partner";
import { ortAnStelle } from "../../../data/ortProfile";
import { gespraechExportieren } from "../../gespraechExport";
import { buchungName } from "../../../data/klinik";
import { altersgruppeVon, DRINGLICHKEIT_NAME, dringlichkeitFuer, symptom, symptomAusDiagnose, symptomSuche, zuweisungId, zuweisungLesen, type Altersgruppe, type Dringlichkeit, type Symptom } from "../../../data/zuweisung";
import { store } from "../../../data/store";
import { allCodes, findCode, hasCodes, searchCodes } from "../../../sim/codes";
import { infoFreitext, PARTNER_PHASE_TEXT, sim, type Einsatz, type SimFahrzeug, type Vorschlag } from "../../../sim/engine";
import { mp } from "../../../net/mehrspieler";
import { distanceM, searchAddress } from "../../../sim/geo";
import { KATEGORIE_LABEL } from "../../../sim/settings";
import { toast } from "../../dom";
import { pers } from "../../ws/persoenlich";
import { panelZeigen, type PanelKontext } from "../../ws/arbeitsplatz";
import { funkRufen, karteWaehlen, karteZeigen, waehle } from "../../ws/auswahl";
import { fzPasst, stufeFarbe, uhr } from "../../panels/teile";
import { codesVon, crewListe, fahrtzielText, fzTyp, minText, ortSuchen, restMin, standortText, statusNr, statusText, wacheOrt, zeilenKlasse, type OrtGruppe, type OrtTreffer } from "../masken-teile/daten";

type Wahl = { alter: Altersgruppe; sym: string | null; dring: Dringlichkeit };
type St = Record<string, unknown> & { fzSuche?: string; symSuche?: string; khWahl?: Wahl };

const RUF_TEXT = { klingelt: "Notruf klingelt", aktiv: "Notrufgespräch läuft", gehalten: "Anrufer wird gehalten", verpasst: "Verpasster Anruf", beendet: "" } as const;
const FARBE_DRING: Record<"rot" | "gelb" | "gruen", Dringlichkeit> = { rot: 30, gelb: 20, gruen: 10 };
const ALTER_NAME: Record<Altersgruppe, string> = { kleinkind: "Kleinkind", kind: "Kind", erwachsener: "Erwachsener" };
const MARKE = { passend: "passend", ausweich: "Ausweich", rueckfall: "Rückfall" } as const;

/** Filtergruppe (Typ-Umschalter Alle/RTW/NEF/NAH/KTW) */
function gruppeVon(fz: SimFahrzeug): string {
  const t = fz.rmTyp;
  if (t === "RTW" || t === "RTW-C" || t === "NAW") return "RTW";
  if (t === "NEF") return "NEF";
  if (t === "NAH" || t === "ITH") return "NAH";
  if (t === "KTW" || t === "SKTW") return "KTW";
  return "";
}

function norm(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
}

/** Dringlichkeit, wie die Leitstelle sie kennt: nach dem Eintreffen aus der Lage, vorher aus der Einsatzstufe */
function farbeVon(e: Einsatz): "rot" | "gelb" | "gruen" {
  const l = e.wahr.lage;
  if (l?.aufgedeckt && l.patienten[0]) return l.patienten[0].sichtung;
  const k = sim.stufeVon(e)?.kategorie;
  return k === "kritisch" ? "rot" : k === "dringend" ? "gelb" : "gruen";
}

/** Startwerte der Krankenhaus-Zuweisung aus Verdacht/KH-Anfrage/Buchung und Lage */
function khStart(e: Einsatz): Wahl {
  const id = e.khAnfrage?.verdacht ?? e.verdacht ?? e.kh?.grund;
  const l = e.wahr.lage;
  const alter: Altersgruppe = l?.aufgedeckt && l.patienten[0] ? altersgruppeVon(l.patienten[0].alter) : "erwachsener";
  const z = zuweisungLesen(id);
  if (z) return { alter: z.a, sym: z.s.id, dring: z.d };
  const s = id?.startsWith("bu_") ? symptom(symptomAusDiagnose(id)) : undefined;
  const wunsch = FARBE_DRING[farbeVon(e)];
  return { alter, sym: s?.id ?? null, dring: s ? dringlichkeitFuer(s, wunsch) : wunsch };
}

/** Zweiter Notruf zum selben Ort: offener Einsatz der letzten Stunden in der Nähe */
function gleicherOrt(e: Einsatz): Einsatz | undefined {
  if (e.zusammengelegt || e.gsKind || e.zustand === "abgeschlossen" || !e.adresse || e.fahrzeuge.length) return undefined;
  return sim.state.einsaetze.find((x) => x !== e && !x.gsKind && !x.zusammengelegt && x.zustand !== "abgeschlossen" && x.adresse && x.erstellt < e.erstellt && sim.state.zeit - x.erstellt < 3 * 3_600_000 && distanceM(x.adresse, e.adresse!) < 300);
}

/** Höhere Buchstaben desselben Kapitels („Aufwerten“): RD-6C1 → RD-6D1, RD-6E1 … */
function aufwertungenVon(code: string | null): { code: string; text: string; stufe: string; farbe: string }[] {
  const m = code?.match(/^(.*?\d+)([A-Z])(.*)$/);
  if (!m) return [];
  const [, kap, b] = m;
  return allCodes()
    .filter((c) => {
      const x = c.code.match(/^(.*?\d+)([A-Z])(.*)$/);
      return !!x && x[1] === kap && x[2] > b;
    })
    .sort((a, z) => a.code.localeCompare(z.code, "de", { numeric: true }))
    .slice(0, 8)
    .map((c) => ({ code: c.code, text: c.beschreibung, stufe: c.stufe, farbe: stufeFarbe(c.stufe) }));
}

/** Text der Ankunft eines alarmierten Fahrzeugs */
function etaText(fz: SimFahrzeug): { text: string; sort: number } {
  const r = restMin(fz);
  switch (fz.phase) {
    case "ausruecken":
      return { text: "rückt aus", sort: 50 };
    case "anfahrt":
    case "routing":
    case "rendezvous":
    case "bereitstellung":
    case "naAbholung":
      return r !== null ? { text: `in ${r} min`, sort: r } : { text: "unterwegs", sort: 60 };
    case "vorOrt":
    case "suche":
    case "treffpunkt":
    case "wartetBR":
    case "naEinstieg":
      return { text: "am Ort", sort: -1 };
    case "transport":
      return { text: r !== null ? `KH in ${r} min` : "Transport", sort: -1 };
    case "warteKH":
    case "uebergabe":
      return { text: "im KH", sort: -1 };
    default:
      return fz.status === "alarmWache" || fz.status === "alarmFunk" || fz.status === "alarmiert" ? { text: "alarmiert", sort: 55 } : { text: "frei", sort: 99 };
  }
}

/** Vorschläge (Fahrzeiten, Empfehlung) – asynchron, je Einsatz zwischengespeichert */
interface VorschlagStand {
  key: string;
  freiKey: string;
  um: number;
  laedt: boolean;
  liste: Vorschlag[];
  empfohlen: string[];
  gruende: string[];
  fehlt: string[];
}

export function einsatzFenster(ctx: PanelKontext): { el: HTMLElement; dispose(): void; zeichnen(): void; setzeId(id: string | null): void } {
  const root = document.createElement("div");
  root.className = "pl ew-masken-panel";
  root.style.cssText = "height:100%;overflow:hidden";
  let id: string | null = null;
  let vs: VorschlagStand | null = null;
  let genannt: { text: string; treffer: OrtTreffer | null } | null = null;
  let letzterVerdacht = "";
  let fenster: EntwurfFenster<EinsatzmaskeLogik> | null = null;

  const einsatz = () => (id ? sim.einsatz(id) : undefined);
  const fehler = (x: unknown) => toast(String((x as Error)?.message ?? x), "error");

  /** Schlüssel, bei dem die Vorauswahl neu bestimmt wird */
  const vsKey = (e: Einsatz) => `${e.id}|${e.adresse?.lat},${e.adresse?.lon}|${e.code}|${e.fahrzeuge.join("+")}`;
  const freiKey = () =>
    Object.values(sim.state.fahrzeuge)
      .filter((f) => sim.verfuegbar(f))
      .map((f) => f.id)
      .join(",").length + "|" + Object.values(sim.state.fahrzeuge).filter((f) => sim.verfuegbar(f)).length;

  let vsLauf = 0;
  async function vorschlaegeHolen(e: Einsatz): Promise<void> {
    const key = vsKey(e);
    const fk = freiKey();
    if (!e.adresse) {
      vs = { key, freiKey: fk, um: Date.now(), laedt: false, liste: [], empfohlen: [], gruende: [], fehlt: [] };
      return;
    }
    const lauf = ++vsLauf;
    const alt = vs && vs.key.split("|")[0] === e.id ? vs : null;
    vs = { key: alt?.key === key ? key : "", freiKey: fk, um: Date.now(), laedt: !alt || alt.key !== key, liste: alt?.liste ?? [], empfohlen: alt?.empfohlen ?? [], gruende: alt?.gruende ?? [], fehlt: alt?.fehlt ?? [] };
    const res = await sim.vorschlaege(e.id).catch(() => [] as Vorschlag[]);
    if (lauf !== vsLauf) return;
    const emp = sim.empfehlung(e.id, res);
    // Empfohlene (und Hinweise wie EL ÖBB) zuerst, dann nach Fahrzeit
    const vorne = [...emp.ids, ...(emp.oben ?? [])];
    const liste = [...vorne.map((x) => res.find((r) => r.fz.id === x)).filter((x): x is Vorschlag => !!x), ...res.filter((r) => !vorne.includes(r.fz.id))];
    vs = { key, freiKey: fk, um: Date.now(), laedt: false, liste, empfohlen: emp.ids, gruende: emp.gruende, fehlt: emp.fehlt ?? [] };
    fenster?.zeichnen();
  }
  function vorschlagPruefen(e: Einsatz): void {
    const key = vsKey(e);
    if (!vs || vs.key !== key) {
      if (!vs || !vs.laedt || vs.key !== "") void vorschlaegeHolen(e);
      return;
    }
    // freie Fahrzeuge haben sich geändert: Fahrzeiten neu (höchstens alle 3 s), Auswahl bleibt
    if (!vs.laedt && vs.freiKey !== freiKey() && Date.now() - vs.um > 3000) void vorschlaegeHolen(e);
  }

  /** genannte Adresse (aus dem Gespräch bzw. der Meldung) für die Ortssuche auflösen */
  function genanntPruefen(e: Einsatz): void {
    const text = e.anruf ? gesagteAdresse(e.meldung.adresse, e.anruf.gespraech.filter((m) => m.von === "anrufer").map((m) => m.text)) : e.meldung.adresse || null;
    if (!text) {
      genannt = null;
      return;
    }
    if (genannt?.text === text) return;
    genannt = { text, treffer: null };
    void searchAddress(text, 1)
      .then((h) => {
        if (genannt?.text !== text || !h[0]) return;
        genannt.treffer = { name: h[0].label, zeile: e.anruf ? `vom Anrufer genannt: „${text}“` : `gemeldet: „${text}“`, rechts: "", art: "ruf", ort: { lat: h[0].lat, lon: h[0].lon, label: h[0].label } };
        fenster?.zeichnen();
      })
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------- Daten für die Logik
  function fzEintrag(v: { fz: SimFahrzeug; sekunden: number | null; hinweis: string | null; kt?: boolean }, frei: boolean) {
    const fz = v.fz;
    const p = fz.kt;
    const hinweis =
      (!frei ? "" : v.hinweis) ||
      (v.kt ? "KT – abziehen" : "") ||
      (p && !p.aktiv && p.fahrten.length ? `KT ab ${p.losUm ? new Date(p.losUm).toTimeString().slice(0, 5) : "?"}` : "") ||
      (fz.wechselOffen ? (fz.wechselOffen === "ende" ? "Dienstende" : "Wechsel ausständig") : "") ||
      (fz.ausserDienst ? "außer Dienst" : "");
    return {
      id: fz.id,
      status: statusNr(fz),
      ruf: fz.funkrufname,
      typ: fzTyp(fz),
      crew: crewListe(fz),
      von: standortText(fz),
      nach: fahrtzielText(fz),
      codes: codesVon(fz),
      fahrt: frei ? minText(v.sekunden) : "–",
      hinweis,
      cls: zeilenKlasse("lz", fz),
      frei: frei && !v.hinweis,
      gruppe: gruppeVon(fz),
      ueber: fz.wechselOffen ?? null,
      titel: v.kt ? "fährt Krankentransport ohne Patient – wird beim Alarmieren abgezogen, die Transporte sind dann wieder offen" : v.hinweis && frei ? v.hinweis : "",
    };
  }

  function khDaten(e: Einsatz, st: St) {
    const start = khStart(e);
    const wahl: Wahl = st.khWahl ?? start;
    const s: Symptom | undefined = symptom(wahl.sym ?? undefined);
    const farbe = farbeVon(e);
    const symMit = (x: Symptom) => ({ id: x.id, name: x.name, kategorie: x.kategorie, dring: dringlichkeitFuer(x, FARBE_DRING[farbe]) });
    // „Aus der Abfrage“: Verdacht und Symptome zum Stichwort des Codes
    const c = findCode(e.code ?? undefined);
    const vorschlag: Symptom[] = [];
    const dazu = (x: Symptom | undefined) => x && !vorschlag.some((y) => y.id === x.id) && vorschlag.push(x);
    dazu(symptom(start.sym ?? undefined));
    if (c) {
      for (const x of symptomSuche(c.beschreibung.split(/\s+[–-]\s+/)[0], 3)) dazu(x);
      for (const x of symptomSuche(c.gruppenname.replace(/^\d+\s*-\s*/, ""), 3)) dazu(x);
    }
    const grund = s ? zuweisungId(s.id, wahl.dring, wahl.alter) : "";
    const pos = e.adresse ?? e.wahr;
    const kind = wahl.alter !== "erwachsener";
    const alle = grund ? sim.khFuer(pos, grund, wahl.dring === 30, kind, false, sim.cacVorrang(e)) : [];
    const top = alle.filter((v) => !v.zu).slice(0, 3);
    const marke = (eig: keyof typeof MARKE) => (eig === "ausweich" && kind ? "Ausweich – keine Kinderabteilung" : MARKE[eig]);
    const karten = top.map((v) => {
      const knapp = v.gesamt > 0 && v.frei / v.gesamt < 0.34;
      return {
        id: v.h.id,
        name: v.h.kurzname || v.h.name,
        kurz: v.h.kurzname || v.h.name,
        km: `${v.km.toFixed(0)} km`,
        merk: [
          { t: marke(v.eignung), cls: v.eignung === "passend" ? "ok" : "" },
          ...(v.gesamt ? [{ t: v.voll ? `belegt (${v.gesamt}/${v.gesamt})` : `${v.frei}/${v.gesamt} frei`, cls: "" }] : []),
          ...(v.h.landeplatz === "kein" ? [{ t: "kein Hubschrauberlandeplatz", cls: "" }] : []),
        ],
        pill: v.voll ? "belegt" : knapp ? `${v.frei}/${v.gesamt}` : "frei",
        pillCls: `pill ${v.voll || knapp ? "gelb" : "ok"}`,
      };
    });
    const gezeigt = new Set(top.map((v) => v.h.id));
    const andere = [
      ...alle.filter((v) => !gezeigt.has(v.h.id)).map((v) => ({ id: v.h.id, kurz: v.h.kurzname || v.h.name, t: `${v.h.kurzname || v.h.name} (${v.km.toFixed(0)} km) · ${marke(v.eignung)}${v.zu ? " · zu" : v.voll ? " · belegt" : ""}` })),
      ...store
        .list("hospitals")
        .filter((h) => !gezeigt.has(h.id) && !alle.some((v) => v.h.id === h.id))
        .map((h) => ({ h, km: distanceM(pos, h) / 1000 }))
        .filter((x) => x.km < 150)
        .sort((a, b) => a.km - b.km)
        .map(({ h, km }) => ({ id: h.id, kurz: h.kurzname || h.name, t: `${h.kurzname || h.name} (${km.toFixed(0)} km)${grund ? " · passt nicht" : ""}` })),
    ];
    const gebuchtIn = e.kh && e.kh.grund === grund ? top.find((v) => v.h.id === e.kh!.hospitalId) : undefined;
    const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
    return {
      wahl,
      startSchritt: wahl.sym ? 4 : 2,
      alterName: ALTER_NAME[wahl.alter],
      symName: s?.name ?? "",
      dringName: DRINGLICHKEIT_NAME[wahl.dring],
      erlaubt: s?.dringlichkeiten ?? null,
      symVorschlag: vorschlag.slice(0, 4).map(symMit),
      symTreffer: st.symSuche ? symptomSuche(String(st.symSuche), 8).map(symMit) : [],
      grund,
      karten,
      andere,
      leer: grund && !top.length ? "Kein passendes Haus nimmt gerade auf – „Andere Häuser“ zeigt alle." : "",
      vorgewaehlt: (gebuchtIn ?? top.find((v) => !v.voll) ?? top[0])?.h.id ?? "",
      gebucht: e.kh ? `gebucht ${uhr(e.kh.zeit)}` : "",
      gebuchtId: e.kh?.hospitalId ?? "",
      gebuchtTitel: e.kh ? `${h?.name ?? e.kh.hospitalId}${e.kh.grund ? ` · Verdacht ${buchungName(e.kh.grund)}` : ""} · durch ${e.kh.durch === "rtw" ? "RTW" : e.kh.durch === "nah" ? "NAH (Pilot)" : "Leitstelle"}` : "",
      anfrage: e.khAnfrage ? `${e.khAnfrage.von} erbittet KH-Buchung: Verdacht ${buchungName(e.khAnfrage.verdacht)}` : "",
      zoText: e.zo ? `Zielort: ${e.zo.label}` : "",
    };
  }

  function daten(st: St) {
    const e = einsatz();
    if (!e) return null;
    vorschlagPruefen(e);
    genanntPruefen(e);
    const jetzt = sim.state.zeit;
    const a = e.anruf;
    const c = findCode(e.code ?? undefined);
    const stufe = sim.stufeVon(e);
    const gleich = gleicherOrt(e);

    // ---- Bänder im Kopf
    const baender: Record<string, string>[] = [];
    if (a && a.status !== "beendet" && e.zustand !== "abgeschlossen") {
      const wer = a.angenommenVon && mp.aktiv ? ` · ${a.angenommenVon.pid === mp.ich.pid ? "du" : a.angenommenVon.name}` : "";
      const dauer = a.status === "aktiv" ? Math.max(0, Math.floor((jetzt - a.seit) / 1000)) : -1;
      baender.push({ art: a.status === "verpasst" ? "rot" : "ok", text: RUF_TEXT[a.status] + wer, lang: dauer >= 0 ? `${Math.floor(dauer / 60)}:${String(dauer % 60).padStart(2, "0")}` : "", knopf: "Zur Abfrage", aktion: "abfrage" });
    } else if (!a && e.meldung.text && e.zustand !== "abgeschlossen")
      baender.push({ art: e.adressePruefen ? "rot" : "grau", text: `Meldung: ${e.meldung.text}`, knopf: "", aktion: "" });
    if (gleich) {
      const gc = findCode(gleich.code ?? undefined);
      baender.push({ art: "gelb", text: `Gleicher Einsatzort wie ${gleich.nummer}${gc ? ` (${gc.code})` : ""} – zweiter Notruf?`, knopf: "Zusammenlegen", aktion: "zusammenlegen", titel: "Kein neuer Einsatz – die Abfrage wird beim bestehenden Einsatz dazugespeichert" });
    }
    const gs = e.gs && !e.gs.aufgehoben ? e.gs : null;
    if (gs)
      baender.push({
        art: gs.brNoetig && !gs.br ? "rot" : "blau",
        text: `Großeinsatz${gs.stufe ? ` ${gs.stufe}` : ""} · ${gs.br ? `BR ${gs.br.label}` : gs.brNoetig ? "Bereitstellungsraum festlegen – Fahrzeuge warten!" : "Bereitstellungsraum noch nicht festgelegt"}`,
        knopf: "Großeinsatz",
        aktion: "gs",
      });
    const imEinsatz = e.fahrzeuge.map((x) => sim.state.fahrzeuge[x]).filter((f): f is SimFahrzeug => !!f && f.einsatzId === e.id);
    if (e.zustand === "abgeschlossen") baender.push({ art: "grau", text: "Einsatz abgeschlossen", knopf: e.adresse ? "Auf Karte" : "", aktion: "karte" });
    else if (imEinsatz.length) {
      const amOrt = imEinsatz.filter((f) => etaText(f).sort < 0).length;
      const unterwegs = imEinsatz.map((f) => restMin(f)).filter((m): m is number => m !== null && !imEinsatz.every((f) => etaText(f).sort < 0));
      const n = imEinsatz.length;
      const text = amOrt === n ? `${n === 1 ? "1 Fahrzeug" : `${n} Fahrzeuge`} am Einsatz` : `${n === 1 ? "1 Fahrzeug" : `${n} Fahrzeuge`} unterwegs${amOrt ? ` · ${amOrt} am Ort` : unterwegs.length ? ` · erstes in ${Math.min(...unterwegs)} min am Ort` : ""}`;
      baender.push({ art: "blau", text, knopf: e.adresse ? "Auf Karte" : "", aktion: "karte" });
    }

    // ---- Ort
    const ortMerk: { t: string; cls: string }[] = [];
    const o = a?.ortung;
    const ortungFertig = o?.status === "fertig" && typeof o.lat === "number" ? o : null;
    if (e.adresse) {
      if (genannt && norm(e.adresse.label).includes(norm(genannt.text.split(",")[0]).slice(0, 10))) ortMerk.push({ t: e.anruf ? "vom Anrufer genannt" : "gemeldet", cls: "" });
      if (ortungFertig) {
        const d = distanceM(e.adresse, { lat: ortungFertig.lat!, lon: ortungFertig.lon! });
        ortMerk.push(d <= (ortungFertig.radius ?? 0) ? { t: `Handy-Ortung ±${ortungFertig.radius} m passt`, cls: "ok" } : { t: `Handy-Ortung ±${ortungFertig.radius} m weicht ab`, cls: "" });
      }
      if (e.rueckrufGemacht) ortMerk.push({ t: "vom Anrufer bestätigt", cls: "ok" });
    }
    const bekannt = e.adresse && typeof e.adresse.lat === "number" ? ortAnStelle(e.adresse.lat, e.adresse.lon) : null;
    if (bekannt) ortMerk.push({ t: bekannt.label, cls: "" });

    // ---- Partner
    const noetig = sim.partnerErkannt(e);
    const hm = (x: number) => new Date(x).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
    const partner = PARTNER_ARTEN.map((art: PartnerArt) => {
      const p = PARTNER[art];
      const al = e.partner?.[art];
      const da = e.partnerDa?.[art];
      const n = noetig.find((x) => x.art === art);
      return {
        art,
        fw: art === "fw",
        pol: art === "pol",
        berg: art === "berg",
        wasser: art === "wasser",
        ki: art === "ki",
        text: da ? `${p.name} vor Ort` : al ? `${p.name} verständigt` : p.name,
        titel: da ? `${p.name} vor Ort seit ${hm(da)}` : al ? `${p.name} alarmiert um ${hm(al)}, unterwegs` : n ? `${p.name} erforderlich: ${n.grund} – klicken zum Alarmieren` : `${p.name} alarmieren`,
        cls: `kn sm partner-k${al || da ? " an" : n ? " ew-noetig" : ""}`,
        aus: !!al,
      };
    });
    const partnerInfo: string[] = [];
    if (bekannt?.profil?.hinweis) partnerInfo.push(`${bekannt.name}: ${bekannt.profil.hinweis}`);
    if (e.br) partnerInfo.push(`Bereitstellungsraum ${e.br.label}${e.boSicher ? " – Einsatzort gesichert" : " – warten auf Freigabe durch die Polizei"}`);
    for (const u of sim.partnerVon(e)) partnerInfo.push(`${u.name}: ${PARTNER_PHASE_TEXT[u.phase]}`);

    // ---- Alarmierte Fahrzeuge (volle Zeilen, nach Eintreffzeit)
    const alarmiert = e.fahrzeuge
      .map((x) => sim.state.fahrzeuge[x])
      .filter((f): f is SimFahrzeug => !!f)
      .map((fz) => {
        const drin = fz.einsatzId === e.id;
        const kind = !drin && fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
        const beiPatient = kind?.gsKind?.parent === e.id ? ` (Patient ${kind.gsKind.nr})` : "";
        const wo = drin && gs ? (fz.phase === "wartetBR" ? " · im BR" : gs.ziel[fz.id] === "br" && fz.phase !== "vorOrt" ? " · zum BR" : "") : "";
        const unterwegs = fz.phase === "ausruecken" || fz.phase === "anfahrt" || fz.phase === "routing";
        const eta = drin ? etaText(fz) : { text: beiPatient ? "bei Patient" : "frei", sort: 98 };
        return {
          id: fz.id,
          cls: zeilenKlasse("fz", fz),
          status: statusNr(fz),
          ruf: fz.funkrufname,
          typ: fzTyp(fz),
          wache: wacheOrt(fz),
          stText: `${statusText(fz)}${wo}${drin ? "" : beiPatient || " (frei)"}`,
          crew: crewListe(fz).join(" · "),
          eta: eta.text,
          sort: eta.sort,
          kannStorno: drin,
          stornoText: unterwegs ? "Storno" : "Freigeben",
          stornoTitel: unterwegs ? "Storno über Funk – Fahrzeug rückt ein" : "Fahrzeug aus dem Einsatz freigeben",
          titel: "",
        };
      })
      .sort((x, y) => x.sort - y.sort);

    // ---- Fahrzeugliste
    const q = String(st.fzSuche ?? "").trim();
    const v = vs && (vs.key === vsKey(e) || vs.key === "") ? vs : null;
    let liste: ReturnType<typeof fzEintrag>[] = [];
    let nichtFrei: ReturnType<typeof fzEintrag>[] = [];
    const freiIds = new Set((v?.liste ?? []).map((x) => x.fz.id));
    if (q) {
      liste = (v?.liste ?? []).filter((x) => fzPasst(x.fz, q)).map((x) => fzEintrag(x, true));
      nichtFrei = Object.values(sim.state.fahrzeuge)
        .filter((f) => !freiIds.has(f.id) && fzPasst(f, q))
        .sort((x, y) => x.funkrufname.localeCompare(y.funkrufname, "de", { numeric: true }))
        .slice(0, 60)
        .map((fz) => fzEintrag({ fz, sekunden: null, hinweis: fz.ausserDienst ? "außer Dienst" : "nicht frei" }, false));
    } else if (v) {
      liste = v.liste.slice(0, Math.max(30, v.empfohlen.length)).map((x) => fzEintrag(x, true));
      const ort = e.adresse;
      if (ort)
        nichtFrei = Object.values(sim.state.fahrzeuge)
          .filter((f) => !freiIds.has(f.id) && !sim.verfuegbar(f) && !f.ausserDienst && f.status !== "abgemeldet" && !e.fahrzeuge.includes(f.id) && gruppeVon(f))
          .map((f) => ({ f, d: distanceM(f, ort) }))
          .sort((x, y) => x.d - y.d)
          .slice(0, 8)
          .map(({ f }) => fzEintrag({ fz: f, sekunden: null, hinweis: null }, false));
    }

    // ---- Ausrückordnung
    const ausrueck: string[] = [];
    if (stufe) {
      ausrueck.push(`Rettungsmittel: ${stufe.rettungsmittel.replace(/>/g, " › ") || "kein Fahrzeug"}, ${stufe.sondersignal ? "mit" : "ohne"} Sondersignal`);
      if (stufe.nfsErforderlich) ausrueck.push("NFS erforderlich");
      if (stufe.notarzt !== "nein") ausrueck.push(`Notarzt: ${stufe.notarzt === "nef" ? "NEF (NAH nur, wenn deutlich schneller)" : "der schnellste (NEF oder NAH)"}`);
      ausrueck.push(`Kategorie: ${KATEGORIE_LABEL[stufe.kategorie]}`);
    } else ausrueck.push(c ? "Stufe nicht zugeordnet" : "Noch kein Code – die Ausrückordnung ergibt sich aus der Stufe.");
    for (const g of v?.gruende ?? []) ausrueck.push(g);

    // ---- Nachforderungen
    const nachforderungen = (e.nachforderungen ?? [])
      .filter((n) => !n.erledigt)
      .map((n) => `Nachforderung von ${n.von}: ${n.art === "NA" ? (n.anzahl > 1 ? `${n.anzahl} Notärzte` : "Notarzt") : n.art === "BIT" ? "BIT (Patient zu schwer für die Trage)" : `${n.anzahl} weitere${n.anzahl > 1 ? "" : "s"} Rettungsmittel`}`);

    const wer = a?.angenommenVon?.name ?? e.bearbeiter?.name ?? "";
    const verdacht = e.khAnfrage?.verdacht ?? e.verdacht ?? "";
    if (verdacht !== letzterVerdacht) {
      // neue Anfrage/neuer Verdacht: Zuweisung neu beginnen
      letzterVerdacht = verdacht;
      if (fenster) fenster.k.state = { ...fenster.k.state, khWahl: undefined, khSchritt: undefined, khHaus: undefined };
      st = { ...st, khWahl: undefined };
    }
    return {
      nummer: e.nummer,
      eingang: `Eingang ${uhr(e.erstellt)} · vor ${Math.max(0, Math.round((jetzt - e.erstellt) / 60000))} min${wer ? ` · ${wer}` : ""}`,
      baender,
      laufend: e.fahrzeuge.length > 0,
      anzahlAlarm: imEinsatz.length,
      stufe: c?.stufe ?? "Ohne Code",
      stufeFarbe: c ? stufeFarbe(c.stufe) : "#6b7280",
      code: c?.code ?? "",
      codeText: c?.beschreibung ?? (hasCodes() ? "Noch kein Code – kommt aus der Abfrage oder über „Ändern“" : ""),
      codeZusatz: e.infoRtw,
      codeHinweis: hasCodes() ? "" : "Keine Einsatzcodes vorhanden – bitte unter Einstellungen → Leitstelle → Einsatzcodes & Abfrage importieren.",
      aufwertungen: aufwertungenVon(e.code),
      adresse: e.adresse?.label ?? "",
      ortMerk,
      ortPill: e.rueckrufGemacht ? "Ort bestätigt" : "",
      genanntTreffer: genannt?.treffer ?? null,
      ortungTreffer: ortungFertig
        ? { name: `Handy-Ortung ±${ortungFertig.radius} m`, zeile: `${ortungFertig.art ?? ""} · ${ortungFertig.lat!.toFixed(5)}, ${ortungFertig.lon!.toFixed(5)}`, rechts: "", art: "ortung", ort: { lat: ortungFertig.lat!, lon: ortungFertig.lon!, label: `Ortung ±${ortungFertig.radius} m (${ortungFertig.lat!.toFixed(5)}, ${ortungFertig.lon!.toFixed(5)})` } }
        : null,
      mitOrtung: !!a,
      ortungTitel: o?.status === "laeuft" ? "Ortung läuft …" : a?.status === "klingelt" ? "Erst nach dem Annehmen" : "Handy-Ortung anfordern",
      zusatz: e.zusatz,
      telefon: e.telefon ?? "",
      rueckTitel: !(e.telefon ?? "").trim() ? "Rufnummer des Anrufers übernehmen" : a ? "Anrufer zurückrufen" : e.rueckrufGemacht ? "Anrufer hat die Adresse bestätigt" : "Rückruf beim Anrufer (Adresse bestätigen)",
      nachforderungen,
      alarmiert,
      partner,
      partnerInfo,
      infoFrei: e.infoAuto ? infoFreitext(e.infoRtw, e.infoAuto) : e.infoRtw,
      intern: e.infoIntern,
      protokoll: e.protokoll.map((p) => ({ t: uhr(p.zeit), x: p.text, von: p.von ?? "" })),
      mitExport: !!a && pers().exportKnopf !== false,
      liste,
      nichtFrei,
      vorschlag: { key: v?.key ?? "", laedt: !e.adresse ? false : !v || v.laedt, empfohlen: v?.empfohlen ?? [] },
      listeHinweis: !e.adresse ? "Für Vorschläge zuerst den Einsatzort eingeben." : "",
      fehlt: (v?.fehlt ?? []).join(" · "),
      ausrueck,
      ueberText: (rufe: string[], ende: boolean) => `${ende ? "Über Dienstende" : "Wechsel ausständig"} (${rufe.join(", ")}) – zuerst anfunken und fragen, ob sie den Einsatz noch übernehmen. Erst nach der Bestätigung gilt das Fahrzeug als alarmiert.`,
      kh: khDaten(e, st),
      zlTitel: gleich ? `Mit ${gleich.nummer} zusammenlegen – kein neuer Einsatz, die Abfrage wird dort dazugespeichert` : "Zusammenlegen – nur bei einem zweiten Notruf zum selben Einsatzort",
      schliessenTitel: e.fahrzeuge.length ? "Einsatz durch die Leitstelle schließen" : "Einsatz ohne Fahrzeug schließen (z. B. Telemedizin, Beratung)",
    };
  }

  // ---------------------------------------------------------------- Aktionen
  async function tun(was: string, ...arg: unknown[]): Promise<unknown> {
    const e = einsatz();
    if (!e) return false;
    try {
      switch (was) {
        case "alarmieren": {
          const hinweise = await sim.call("alarmiere", e.id, arg[0] as string[]).catch((x) => [String(x.message ?? x)]);
          for (const h of hinweise) toast(h, / vorgemerkt – /.test(h) ? "ok" : "error");
          vs = null;
          return true;
        }
        case "storno": {
          const fz = sim.state.fahrzeuge[arg[0] as string];
          if (!fz) return false;
          const unterwegs = fz.phase === "ausruecken" || fz.phase === "anfahrt" || fz.phase === "routing";
          await sim.call(unterwegs ? "storno" : "entlasse", fz.id);
          return true;
        }
        case "funk":
          panelZeigen("funk");
          setTimeout(() => funkRufen(arg[0] as string), 60);
          return true;
        case "partner":
          await sim.call("partnerAnfordern", e.id, arg[0] as PartnerArt);
          return true;
        case "schliessen":
          await sim.call("schliesse", e.id, e.fahrzeuge.length ? "durch Leitstelle" : "ohne Fahrzeug (z. B. Telemedizin, Beratung)");
          return true;
        case "zusammenlegen": {
          const g = gleicherOrt(e);
          if (!g) {
            toast("Kein offener Einsatz am selben Einsatzort – Zusammenlegen geht nur bei einem zweiten Notruf zum selben Ereignis", "error");
            return false;
          }
          await sim.call("zusammenlegen", e.id, g.id);
          waehle("einsatz", g.id);
          return true;
        }
        case "abfrage":
          waehle("einsatz", e.id, { maske: false, karte: false });
          panelZeigen("abfrage");
          return true;
        case "karte":
          if (e.adresse) karteZeigen(e.adresse.lat, e.adresse.lon, 15);
          return true;
        case "gs":
          panelZeigen("grosseinsatz");
          return true;
        case "code":
          await sim.call("aktualisiere", e.id, { code: arg[0] as string });
          return true;
        case "ort": {
          const o = arg[0] as { lat: number; lon: number; label: string };
          await sim.call("aktualisiere", e.id, { adresse: { lat: o.lat, lon: o.lon, label: o.label } });
          karteZeigen(o.lat, o.lon, 15);
          return true;
        }
        case "karteWaehlen": {
          const p = await karteWaehlen("Einsatzort anklicken");
          if (!p) return false;
          await sim.call("aktualisiere", e.id, { adresse: { ...p, label: `Koordinate ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` } });
          return true;
        }
        case "ortung":
          if (!e.anruf || e.anruf.status === "klingelt" || e.anruf.ortung?.status === "laeuft") return false;
          await sim.call("ortung", e.id);
          return true;
        case "zo": {
          const o = arg[0] as { lat: number; lon: number; label: string };
          await sim.call("aktualisiere", e.id, { zo: { lat: o.lat, lon: o.lon, label: o.label } });
          return true;
        }
        case "bucheKh":
          await sim.call("bucheKh", e.id, arg[0] as string, arg[1] as string);
          toast("Krankenhaus gebucht");
          return true;
        case "export":
          await gespraechExportieren("rd", e.id);
          return true;
        case "infoFz": {
          const frei = String(arg[0] ?? "").trim();
          const auto = e.infoAuto ?? "";
          await sim.call("aktualisiere", e.id, { infoRtw: auto ? (frei ? `${auto} // ${frei}` : auto) : frei });
          return true;
        }
        case "aktualisiere":
          await sim.call("aktualisiere", e.id, arg[0] as Parameters<typeof sim.aktualisiere>[1]);
          return true;
        case "rueckruf": {
          const tel = (e.telefon ?? "").trim();
          if (!tel) {
            await sim.call("aktualisiere", e.id, { telefon: e.wahr.abfrage?.anrufer.nummer || nummerAus(e.id, true) });
            return true;
          }
          if (e.anruf) {
            if (e.anruf.status === "aktiv") {
              toast("Das Gespräch läuft bereits");
              return false;
            }
            const m = await import("../../panels/telefon");
            m.anrufAnnehmen("rd", e.id);
            return true;
          }
          const bestaetigt = await sim.call("rueckruf", e.id);
          if (bestaetigt) toast(`Anrufer bestätigt: ${bestaetigt}`);
          return true;
        }
        default:
          return false;
      }
    } catch (x) {
      fehler(x);
      return false;
    }
  }

  const app = {
    leerText: "Einen Einsatz in der Einsatzliste oder auf der Karte anklicken.",
    daten,
    tun,
    hinweis: (t: string) => toast(t, "error"),
    codeSuche: (q: string) =>
      (q.trim() ? searchCodes(q, 40) : [])
        .map((c) => ({ code: c.code, text: c.beschreibung, stufe: c.stufe, farbe: stufeFarbe(c.stufe) })),
    ortSuchen: (q: string, wo: string): Promise<OrtGruppe[]> => {
      const e = einsatz();
      if (!e) return Promise.resolve([]);
      const o = e.anruf?.ortung;
      const bei = e.adresse ?? (o?.status === "fertig" && typeof o.lat === "number" ? { lat: o.lat, lon: o.lon! } : null);
      return wo === "zs" ? ortSuchen(q, { bei: e.adresse }) : ortSuchen(q, { bei, genannt: genannt?.text ?? null });
    },
  };

  const f = entwurfEinbinden(root, "masken", vorlage, css, (props) => new EinsatzmaskeLogik(props), { app });
  fenster = f;
  f.wurzel.classList.add("eingebettet");

  let titelSchmal: boolean | null = null;
  const titel = () => {
    const schmal = root.getBoundingClientRect().width < 430;
    if (schmal === titelSchmal) return;
    titelSchmal = schmal;
    ctx.setzeTitel(schmal ? "RD" : "RD-Übersicht");
  };
  const ro = new ResizeObserver(titel);
  ro.observe(root);
  titel();

  return {
    el: root,
    zeichnen: () => f.zeichnen(),
    setzeId: (neu: string | null) => {
      if (neu === id) return f.zeichnen();
      id = neu;
      vs = null;
      genannt = null;
      letzterVerdacht = neu ? (sim.einsatz(neu)?.khAnfrage?.verdacht ?? sim.einsatz(neu)?.verdacht ?? "") : "";
      f.k.neuerEinsatz();
      f.zeichnen();
    },
    dispose: () => {
      ro.disconnect();
      f.entfernen();
    },
  };
}

