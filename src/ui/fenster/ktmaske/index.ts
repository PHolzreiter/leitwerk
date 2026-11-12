/**
 * KT-Übersicht (Krankentransport) und SEK-Übersicht (Überstellung) aus den Entwürfen „KTMaske“ und „SEKMaske“ –
 * angebunden an Store und Simulation. Beide Masken haben denselben Aufbau; `sek` schaltet Texte, Filter und Gruppen um.
 */
import vorlage from "./vorlage.html?raw";
import css from "../masken-teile/masken.css?raw";
import { KtMaskeLogik } from "./logik.js";
import { abfrageBreite, entwurfEinbinden, type EntwurfFenster } from "../../entwurf/einbinden";
import { gespraechExportieren } from "../../gespraechExport";
import { store } from "../../../data/store";
import { sim, type KtVorschlag, type SimFahrzeug } from "../../../sim/engine";
import { bereichName, hhmm, type KtAuftrag, type KtOrt, type KtStatus } from "../../../sim/kt";
import { codeInfo, istUeberstellung, ktCode, ktCodeDef, ktCodes } from "../../../sim/ktCodes";
import { distanceM, travelTimes } from "../../../sim/geo";
import { mp } from "../../../net/mehrspieler";
import { toast } from "../../dom";
import { pers } from "../../ws/persoenlich";
import { panelZeigen, type PanelKontext } from "../../ws/arbeitsplatz";
import { funkRufen, karteWaehlen, karteZeigen, waehle } from "../../ws/auswahl";
import { fzPasst } from "../../panels/teile";
import { codesVon, crewListe, fahrtzielText, fzTyp, kmText, minText, ortSuchen, restMin, standortText, statusNr, statusText, wacheOrt, zeilenKlasse, type OrtGruppe } from "../masken-teile/daten";

const QUELLE: Record<KtAuftrag["quelle"], string> = { hotline: "KT-Hotline", online: "Online-Anmeldung", dauer: "Dauerauftrag", manuell: "von Hand" };
const LAGE: Record<string, string> = { gehend: "gehfähig", sitzend: "Tragstuhl", liegend: "liegend", rollstuhl: "Rollstuhl" };
const TYPEN_KT = ["Alle", "KTW", "SKTW", "RTW"];
const TYPEN_SEK = ["Alle", "SNAW", "SRTW", "SKTW", "ITH"];
const SEK_FZ = ["SNAW", "SRTW", "SKTW", "BIT"];
const FLUG = ["ITH", "NAH"];

function gruppeVon(fz: SimFahrzeug, sek: boolean): string {
  const t = fz.rmTyp;
  if (sek) return ["SNAW", "SRTW", "SKTW", "ITH"].includes(t) ? t : "";
  if (t === "KTW") return "KTW";
  if (t === "SKTW") return "SKTW";
  if (t === "RTW" || t === "RTW-C" || t === "NAW") return "RTW";
  return "";
}

/** Uhrzeit (hh:mm) in Simulationszeit: heute, oder morgen, wenn sie schon lange vorbei ist */
function zeitAus(hm: string): number | null {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(sim.state.zeit);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let t = d.getTime();
  if (t < sim.state.zeit - 6 * 3_600_000) t += 24 * 3_600_000;
  return t;
}
const hmWert = (t: number | null | undefined) => (t ? new Date(t).toTimeString().slice(0, 5) : "");

/** Ort zur Anzeige: Krankenhaus fett mit Station darunter, sonst Adresse (Einrichtung gekennzeichnet) */
function ortAnzeige(o: KtOrt | null, sek: boolean): { adr: string; info: string } {
  if (!o) return { adr: "noch offen", info: "" };
  const h = o.khId ? store.get("hospitals", o.khId) : undefined;
  if (h) return { adr: sek ? h.name : h.kurzname || h.name, info: o.bereich ? `Station: ${bereichName(o.bereich)}` : "" };
  return { adr: o.label, info: o.einrichtung ?? "" };
}

interface VsStand {
  key: string;
  laedt: boolean;
  liste: KtVorschlag[];
  alle: KtVorschlag[] | null;
  um: number;
}

export function ktFenster(ctx: PanelKontext, sek: boolean): { el: HTMLElement; dispose(): void; zeichnen(): void; setzeId(id: string | null): void } {
  const root = document.createElement("div");
  root.className = "pl ew-masken-panel";
  root.style.cssText = "height:100%;overflow:hidden";
  let id: string | null = null;
  let vs: VsStand | null = null;
  let fahrt: { key: string; text: string } | null = null;
  let fenster: EntwurfFenster<KtMaskeLogik> | null = null;
  const auftrag = () => (id ? sim.ktAuftrag(id) : undefined);
  const fehler = (x: unknown) => toast(String((x as Error)?.message ?? x), "error");

  const vsKey = (k: KtAuftrag) => JSON.stringify([k.id, k.status, k.fz, k.begleit, k.d.von?.lat, k.d.von?.lon, k.d.nach?.lat, k.d.code, k.d.sek, k.d.abholung, k.d.termin]);
  let vsLauf = 0;
  async function vorschlaegeHolen(k: KtAuftrag, mitAllen: boolean): Promise<void> {
    const key = vsKey(k);
    const lauf = ++vsLauf;
    const alt = vs?.key === key ? vs : null;
    vs = { key, laedt: !alt, liste: alt?.liste ?? [], alle: alt?.alle ?? null, um: Date.now() };
    const liste = alt && !mitAllen ? alt.liste : await sim.ktVorschlaege(k.id).catch(() => [] as KtVorschlag[]);
    const alle = mitAllen ? await sim.ktVorschlaege(k.id, true).catch(() => [] as KtVorschlag[]) : (alt?.alle ?? null);
    if (lauf !== vsLauf) return;
    vs = { key, laedt: false, liste, alle, um: Date.now() };
    fenster?.zeichnen();
  }
  function vorschlagPruefen(k: KtAuftrag, suche: boolean): void {
    if (!k.d.von || !["aufnahme", "offen", "vorgemerkt"].includes(k.status)) return;
    const key = vsKey(k);
    if (!vs || vs.key !== key) return void vorschlaegeHolen(k, suche);
    if (suche && !vs.alle && !vs.laedt) return void vorschlaegeHolen(k, true);
    // Fahrzeiten und Verfügbarkeit nachziehen (höchstens alle 15 s)
    if (!vs.laedt && Date.now() - vs.um > 15000) void vorschlaegeHolen(k, suche);
  }
  function fahrtPruefen(k: KtAuftrag): void {
    const key = `${k.d.von?.lat},${k.d.von?.lon}|${k.d.nach?.lat},${k.d.nach?.lon}`;
    if (fahrt?.key === key || !k.d.von || !k.d.nach) return;
    fahrt = { key, text: "" };
    const von = k.d.von;
    const nach = k.d.nach;
    void travelTimes(nach, [von])
      .then((t) => {
        if (fahrt?.key !== key) return;
        const km = kmText(distanceM(von, nach) * 1.25).replace(/,\d/, "");
        fahrt.text = `ca. ${km}${t[0] ? ` · ca. ${Math.round(t[0] / 60)} min` : ""}`;
        fenster?.zeichnen();
      })
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------- Daten
  function eintrag(v: KtVorschlag | { fz: SimFahrzeug; sekunden: number | null; hinweis: string | null; losSpaetestens: number | null; ersatz?: boolean; begleit?: SimFahrzeug | null }, frei: boolean, k: KtAuftrag, opt: { begleit?: boolean } = {}) {
    const fz = v.fz;
    const p = fz.kt;
    const n = p ? p.fahrten.flat().filter((x) => x !== k.id).length : 0;
    const jetzt = sim.state.zeit;
    const flug = FLUG.includes(fz.rmTyp);
    const los = v.losSpaetestens ? `spätestens ${hhmm(v.losSpaetestens)}` : "";
    const blau = codeInfo(k.d.code).sondersignal;
    const anBord = !!p?.aktiv && (p.fahrten[0] ?? []).some((x) => sim.ktAuftrag(x)?.status === "anBord");
    // ein NEF fährt nie selbst, nur als Notarzt-Begleitung zu einem Transportfahrzeug
    if (fz.rmTyp === "NEF") opt = { ...opt, begleit: true };
    return {
      id: fz.id,
      status: statusNr(fz),
      ruf: fz.funkrufname,
      typ: fzTyp(fz),
      crew: crewListe(fz),
      von: standortText(fz),
      nach: fahrtzielText(fz),
      codes: codesVon(fz),
      fahrt: !frei ? "–" : v.sekunden === null ? "–" : flug ? `Flug ${minText(v.sekunden)}` : minText(v.sekunden),
      los: opt.begleit ? "Notarzt-Begleitung" : los || v.hinweis || "",
      losCls: `los${v.losSpaetestens !== null && v.losSpaetestens < jetzt + 5 * 60_000 ? " knapp" : ""}`,
      hinweis: n ? `noch ${n} Fahrt${n > 1 ? "en" : ""}` : fz.wechselOffen ? (fz.wechselOffen === "ende" ? "Dienstende" : "Wechsel ausständig") : fz.ausserDienst ? "außer Dienst" : "",
      cls: zeilenKlasse("lz", fz),
      frei,
      gruppe: gruppeVon(fz, sek),
      begleit: !!opt.begleit,
      nurVormerken: frei && !p && !sim.verfuegbar(fz),
      begleitVorschlag: "begleit" in v && v.begleit ? v.begleit.id : null,
      titel: !frei ? (fz.einsatzId ? "im Notfalleinsatz" : "nicht verfügbar") : v.hinweis ?? "",
      plan:
        p && p.fahrten.length && frei
          ? {
              aktiv: p.aktiv,
              sammelOk: !blau && !opt.begleit && !anBord && !(k.begleit ?? null),
              titel: `${fz.funkrufname} hat noch ${n === 1 ? "eine Fahrt" : `${n} Fahrten`}${p.aktiv ? "" : p.losUm ? ` (vorgemerkt ab ${hhmm(p.losUm)})` : " (vorgemerkt)"}`,
              textNaechste: "Fährt nach seinen anderen Fahrten zur Abholung. Vormerken genügt – es rückt zur richtigen Zeit selbst aus.",
              textJetzt: "Fährt sofort los – die schon vorgemerkten Fahrten zuerst, dieser Auftrag danach.",
              textSammel: "Nimmt den Patienten zusätzlich mit (Mehrfachtransport) – das Fahrzeug fährt die kürzeste Reihenfolge.",
            }
          : null,
    };
  }

  function daten(st: Record<string, unknown>) {
    const k = auftrag();
    if (!k) return null;
    const suche = String(st.fzSuche ?? "").trim();
    vorschlagPruefen(k, !!suche);
    fahrtPruefen(k);
    const d = k.d;
    const a = k.anruf;
    const jetzt = sim.state.zeit;
    const c = ktCode(d.code);
    const info = codeInfo(d.code);
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
    const plan = fz?.kt;
    const v = vs && vs.key === vsKey(k) ? vs : null;
    const passend = (v?.liste ?? []).filter((x) => !x.ersatz);
    const spaetestens = passend[0]?.losSpaetestens ?? null;

    // ---- Bänder im Kopf
    const baender: Record<string, string>[] = [];
    if (a && a.status !== "beendet") {
      const dauer = a.status === "aktiv" ? Math.max(0, Math.floor((jetzt - a.seit) / 1000)) : -1;
      const wer = a.angenommenVon && mp.aktiv ? ` · ${a.angenommenVon.pid === mp.ich.pid ? "du" : a.angenommenVon.name}` : "";
      const t = { klingelt: "klingelt", aktiv: "Gespräch läuft", gehalten: "Anrufer wird gehalten", verpasst: "verpasster Anruf", beendet: "" }[a.status];
      baender.push({ art: a.status === "verpasst" ? "rot" : "ok", text: `${sek ? "Anforderung" : "KT-Hotline"} · ${t}${wer}`, lang: dauer >= 0 ? `${Math.floor(dauer / 60)}:${String(dauer % 60).padStart(2, "0")}` : "", knopf: "Zum Gespräch", aktion: "abfrage" });
    } else if (k.status === "aufnahme")
      baender.push({ art: "gelb", text: "Aufnahme – Angaben ergänzen, dann den Auftrag anlegen", knopf: "Zur Aufnahme", aktion: "abfrage" });
    const sp = spaetestens ? ` · spätestens ${hhmm(spaetestens)} losschicken` : "";
    if (k.status === "offen") {
      if (sek && d.sofort) baender.push({ art: "rot", text: `Sofort${d.abholung && d.zeitVorgabe === "abholung" ? ` · Patient bereit ${hhmm(d.abholung)}` : d.termin && d.zeitVorgabe === "termin" ? ` · Termin ${hhmm(d.termin)}` : ""}`, knopf: d.von ? "Auf Karte" : "", aktion: "karte" });
      else if (sek) baender.push({ art: "gelb", text: `Geplant${d.termin && d.zeitVorgabe === "termin" ? ` · Termin ${hhmm(d.termin)}` : d.abholung && d.zeitVorgabe === "abholung" ? ` · Abholung ${hhmm(d.abholung)}` : ""}${sp}`, knopf: d.von ? "Auf Karte" : "", aktion: "karte" });
      else baender.push({ art: d.sofort ? "rot" : spaetestens && spaetestens < jetzt + 15 * 60_000 ? "rot" : "gelb", text: `Nicht disponiert${d.sofort ? " · SOFORT" : ""}${sp}`, knopf: d.von ? "Auf Karte" : "", aktion: "karte" });
    }
    if (k.status === "vorgemerkt" && fz)
      baender.push({ art: "blau", text: `Vorgemerkt · ${fz.funkrufname}${plan && !plan.aktiv && plan.losUm ? ` rückt um ${hhmm(plan.losUm)} aus` : ""}`, knopf: plan && !plan.aktiv ? "Jetzt losschicken" : "", aktion: "schicken", knopf2: "Vormerkung lösen", aktion2: "loesen" });
    if ((k.status === "unterwegs" || k.status === "anBord") && fz) {
      const r = restMin(fz);
      baender.push({ art: "blau", text: k.status === "anBord" ? `Patient an Bord · ${fz.funkrufname}${r ? ` · Ziel in ${r} min` : ""}` : `Unterwegs · ${fz.funkrufname}${r ? ` · in ${r} min` : ""}`, knopf: "Auf Karte", aktion: "fzKarte" });
    }
    if (k.status === "erledigt" || k.status === "storniert") baender.push({ art: "grau", text: k.status === "erledigt" ? "Erledigt" : "Storniert", knopf: "", aktion: "" });
    if (fz && plan?.fruehFrage === k.id)
      baender.push({ art: "gelb", text: `${fz.funkrufname} ist zu früh am Abholort – warten oder frei melden?`, knopf: "Frei melden", aktion: "frei", titel: "Fährt zur Dienststelle, Transport wieder undisponiert", knopf2: "Warten", aktion2: "warten", titel2: "Wartet, bis der Patient fertig ist" });

    // ---- Code-Block
    const pill = (t: string) => ({ t, cls: `pill ${t === "instabil" ? "rot" : "grau"}` });
    const s = d.sek;
    const abfrage = [
      s ? (s.arzt ? "mit Notarzt" : s.monitoring ? "mit Überwachung" : "") : "",
      s ? (s.instabil ? "instabil" : "stabil") : "",
      s?.beatmet ? "beatmet" : "",
      d.lage ? LAGE[d.lage] : "",
      s?.inkubator ? ((d.patient.alter ?? 1) < 1 ? "Inkubator" : "Kind") : "",
      s?.bit ? "BIT" : "",
      d.sauerstoff ? "O₂" : "",
      d.infektion ? "Infektion / Isolation" : "",
      d.begleitung ? "Begleitperson" : "",
      d.sofort && !sek ? "SOFORT" : "",
      info.flug ? "Flug" : "",
    ]
      .filter(Boolean)
      .map(pill);
    const pat = `${d.patient.alter !== null ? d.patient.alter : ""}${d.patient.geschlecht ?? ""}`;

    // ---- Zeiten: nur die eingegebene (Abholzeit beim Abholort ODER Termin beim Zielort)
    const vorgabe = d.zeitVorgabe ?? (d.termin && !d.abholung ? "termin" : d.abholung ? "abholung" : null);
    const von = ortAnzeige(d.von, sek);
    const nach = ortAnzeige(d.nach, sek);

    // ---- alarmierte (zugeteilte) Fahrzeuge
    const alarmiert = [fz, nef]
      .filter((f): f is SimFahrzeug => !!f)
      .map((f) => {
        const istNef = f === nef;
        const p = f.kt;
        const aktiv = !!p?.aktiv || (istNef && !!f.einsatzId);
        const r = restMin(f);
        const vorgemerkt = k.status === "vorgemerkt";
        const nr = p ? p.fahrten.findIndex((x) => x.includes(k.id)) : -1;
        return {
          id: f.id,
          cls: zeilenKlasse("fz", f),
          status: statusNr(f),
          ruf: f.funkrufname,
          typ: fzTyp(f),
          wache: wacheOrt(f),
          stText: istNef ? `Notarzt-Begleitung · ${statusText(f)}` : vorgemerkt ? (nr > 0 ? `als ${nr + 1}. Fahrt vorgemerkt` : "vorgemerkt") : k.status === "anBord" ? "Patient an Bord" : statusText(f),
          crew: crewListe(f).join(" · "),
          eta: vorgemerkt && !aktiv ? (p?.losUm ? `ab ${hhmm(p.losUm)}` : "vorgemerkt") : r !== null ? `in ${r} min` : k.status === "anBord" ? "an Bord" : "unterwegs",
          sort: r ?? 99,
          kannStorno: !istNef && k.status !== "anBord" && (vorgemerkt || aktiv),
          stornoTitel: vorgemerkt && !p?.aktiv ? "Vormerkung lösen – der Auftrag ist wieder offen" : "Storno über Funk – das Fahrzeug ohne Patient bricht seine Fahrten ab",
        };
      })
      .sort((x, y) => x.sort - y.sort);

    // ---- Fahrzeugliste
    const liste: (ReturnType<typeof eintrag> | { trenner: true; trennText: string })[] = [];
    const dispoMoeglich = ["aufnahme", "offen", "vorgemerkt"].includes(k.status);
    let listeHinweis = "";
    let listeHinweisWarn = false;
    if (!d.von) listeHinweis = "Für Vorschläge zuerst den Abholort eintragen.";
    else if (!d.code) listeHinweis = "Für Vorschläge fehlt noch der Code (Transportart in der Aufnahme eintragen oder „Ändern“).";
    else if (!dispoMoeglich) listeHinweis = k.status === "unterwegs" || k.status === "anBord" ? "Das Fahrzeug ist unterwegs." : "";
    const zugeteilt = new Set([k.fz, k.begleit].filter(Boolean));
    if (dispoMoeglich && d.von && d.code && v) {
      if (suche) {
        const treffer = (v.alle ?? []).filter((x) => !zugeteilt.has(x.fz.id) && fzPasst(x.fz, suche)).sort((a, b) => (a.sekunden ?? 1e9) - (b.sekunden ?? 1e9));
        const ids = new Set(treffer.map((x) => x.fz.id));
        for (const x of treffer.slice(0, 40)) liste.push(eintrag(x, true, k));
        const weg = Object.values(sim.state.fahrzeuge).filter((f) => !ids.has(f.id) && fzPasst(f, suche)).slice(0, 20);
        if (weg.length) {
          liste.push({ trenner: true, trennText: "Nicht frei" });
          for (const f of weg) liste.push(eintrag({ fz: f, sekunden: null, hinweis: null, losSpaetestens: null }, false, k));
        }
      } else {
        // je Fahrzeugtyp höchstens drei, damit z. B. viele Hubschrauber den SNAW nicht verdrängen
        const begrenzt = (l: KtVorschlag[], max: number) => {
          const n = new Map<string, number>();
          return l.filter((x) => {
            const c2 = (n.get(x.fz.rmTyp) ?? 0) + 1;
            n.set(x.fz.rmTyp, c2);
            return c2 <= 3;
          }).slice(0, max);
        };
        const pass = begrenzt(v.liste.filter((x) => !x.ersatz && !x.nurBegleit && !zugeteilt.has(x.fz.id)), 10);
        const ersatz = begrenzt(v.liste.filter((x) => x.ersatz && !x.nurBegleit && !zugeteilt.has(x.fz.id)), 8);
        // Begleit-Fahrzeuge (NEF) einzeln, nicht als „RTW + NEF“ – dazu alle freien NEF in der Nähe
        const begleiter = new Map<string, KtVorschlag>();
        for (const x of [...pass, ...ersatz]) if (x.begleit && !begleiter.has(x.begleit.id)) begleiter.set(x.begleit.id, { ...x, fz: x.begleit, begleit: null, sekunden: null, hinweis: null });
        for (const x of v.liste) if (x.nurBegleit && !zugeteilt.has(x.fz.id) && !begleiter.has(x.fz.id)) begleiter.set(x.fz.id, x);
        if (sek) {
          const alle = [...pass, ...ersatz];
          const gruppen: [string, KtVorschlag[]][] = [
            ["Sekundärfahrzeuge", alle.filter((x) => SEK_FZ.includes(x.fz.rmTyp))],
            [d.sofort ? "Hubschrauber – nur spontan" : "Hubschrauber", alle.filter((x) => FLUG.includes(x.fz.rmTyp))],
            [d.sofort ? "Regelrettungsdienst" : "Regelrettungsdienst – nur wenn nötig", alle.filter((x) => !SEK_FZ.includes(x.fz.rmTyp) && !FLUG.includes(x.fz.rmTyp))],
            ["Notarzt-Begleitung (NEF) – zusätzlich zum Transportfahrzeug", []],
          ];
          for (const [t, l] of gruppen) {
            const nefs = t.startsWith("Notarzt") ? [...begleiter.values()].filter((b) => !alle.some((x) => x.fz.id === b.fz.id)) : [];
            if (!l.length && !nefs.length) continue;
            liste.push({ trenner: true, trennText: t });
            for (const x of l) liste.push(eintrag(x, true, k));
            for (const b of nefs) liste.push(eintrag(b, true, k, { begleit: true }));
          }
        } else {
          for (const x of pass) liste.push(eintrag(x, true, k));
          if (ersatz.length) {
            liste.push({ trenner: true, trennText: "Ersatz – RTW nur wenn nötig" });
            for (const x of ersatz) liste.push(eintrag(x, true, k));
          }
        }
        if (!pass.length && v.liste.length) {
          listeHinweis = sek ? "Kein passendes S-Fahrzeug frei – Ersatz oder suchen." : "Kein KTW frei – Ersatz oder suchen.";
          listeHinweisWarn = true;
        } else if (pass.length && (pass.every((x) => x.losSpaetestens !== null && x.losSpaetestens < jetzt) || (d.sofort && (pass[0].sekunden ?? 1e9) > 30 * 60))) {
          listeHinweis = "Das passende Fahrzeug ist weit weg – Ersatz prüfen.";
          listeHinweisWarn = true;
        }
      }
    }
    const empf = passend[0];

    // ---- Ausrückordnung aus dem Code
    const ausrueck: string[] = [];
    if (c) {
      ausrueck.push(`Fahrzeug: ${info.fahrzeug ?? (info.arzt ? "RTW mit Notarzt (NEF)" : sek ? "SKTW" : "KTW")}`);
      ausrueck.push(`${info.sondersignal ? "mit" : "ohne"} Sondersignal${info.sofort ? " · sofort" : ""}`);
      if (info.arzt) ausrueck.push("Begleitung: Notarzt");
      else if (info.monitoring) ausrueck.push("Begleitung: Überwachung (Monitor)");
      if (info.flug) ausrueck.push("Hubschrauber vorgesehen");
    } else ausrueck.push("Noch kein Code – die Ausrückordnung ergibt sich aus dem Code.");
    if (empf) ausrueck.push(`Vorschlag: ${empf.fz.funkrufname} ${fzTyp(empf.fz)}${empf.begleit ? ` + ${empf.begleit.funkrufname} NEF` : ""}${empf.sekunden !== null ? ` – ${minText(empf.sekunden)} Anfahrt` : ""}`);

    // ---- Patient / Anrufer
    const kh = d.von?.khId ? store.get("hospitals", d.von.khId) : undefined;
    const anrufer = k.quelle === "hotline" ? (sek && kh ? `${kh.kurzname || kh.name}${d.von?.bereich ? `, ${bereichName(d.von.bereich)}` : ""}` : "KT-Hotline") : QUELLE[k.quelle];

    // ---- Aktion ohne Auswahl
    const aktion = k.status === "aufnahme" ? { text: "Auftrag anlegen", was: "anlegen" } : k.status === "vorgemerkt" && fz && plan && !plan.aktiv ? { text: `${fz.funkrufname} jetzt losschicken`, was: "schicken" } : null;
    const offen: KtStatus[] = ["aufnahme", "offen", "vorgemerkt", "unterwegs"];

    return {
      nummer: k.nummer,
      eingang: `Eingang ${hhmm(k.eingang)} · vor ${Math.max(0, Math.round((jetzt - k.eingang) / 60000))} min · ${QUELLE[k.quelle]}${a?.angenommenVon?.name ? ` · ${a.angenommenVon.name}` : ""}`,
      baender,
      art: sek ? "Sekundär" : "Krankentransport",
      code: d.code ?? "",
      codeText: c?.name ?? (d.code ? "" : "Noch kein Code"),
      codeZusatz: [pat, d.grund].filter(Boolean).join(" // "),
      codeHinweis: "",
      abfrage,
      von: von.adr,
      vonInfo: von.info,
      nach: nach.adr,
      nachInfo: nach.info,
      abholung: vorgabe === "abholung" && d.abholung ? hhmm(d.abholung) : "",
      abholLbl: sek && d.sofort ? "Patient bereit" : "Abholzeit",
      termin: vorgabe === "termin" && d.termin ? hhmm(d.termin) : "",
      abholWert: vorgabe === "abholung" ? hmWert(d.abholung) : "",
      terminWert: vorgabe === "termin" ? hmWert(d.termin) : "",
      fahrtText: fahrt?.text ?? "",
      vonVorschlag: [] as OrtGruppe[],
      nachVorschlag: [] as OrtGruppe[],
      alarmiert,
      patient: `${d.patient.name || "–"}${d.patient.alter !== null ? `, ${d.patient.alter}` : ""}${d.kasse ? ` · ${d.kasse}` : ""}`,
      anrufer,
      tel: d.telefon,
      grund: d.grund,
      info: d.patient.info,
      roh: { name: d.patient.name, alter: d.patient.alter === null ? "" : String(d.patient.alter), grund: d.grund, telefon: d.telefon, kasse: d.kasse ?? "", info: d.patient.info },
      protokoll: k.protokoll.map((p) => ({ t: hhmm(p.zeit), x: p.text, von: p.von ?? "" })),
      mitExport: !!a && pers().exportKnopf !== false,
      liste,
      vorschlag: {
        key: v && !v.laedt && dispoMoeglich && !k.fz ? v.key : "",
        laedt: !!d.von && !!d.code && dispoMoeglich && (!v || v.laedt),
        empfohlen: empf && dispoMoeglich && !k.fz ? { transport: empf.fz.id, begleit: empf.begleit?.id ?? null } : {},
      },
      typen: sek ? TYPEN_SEK : TYPEN_KT,
      fzZahl: (n: number) => [n ? `${n} gewählt` : "", fz ? "1 zugeteilt" : ""].filter(Boolean).join(" · "),
      fzSuchPlatz: sek ? "Fahrzeug suchen (z. B. 79901, St. Pölten, SNAW) …" : "Fahrzeug suchen (z. B. 58011, Horn, KTW) …",
      ausrueck,
      listeHinweis,
      listeHinweisWarn,
      aktion,
      nebenKnopf: k.status === "aufnahme" ? "Verwerfen" : offen.includes(k.status) ? "Auftrag stornieren" : "",
    };
  }

  // ---------------------------------------------------------------- Aktionen
  async function tun(was: string, ...arg: unknown[]): Promise<unknown> {
    const k = auftrag();
    if (!k) return false;
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    try {
      switch (was) {
        case "disponieren": {
          const [fzId, begleit, modus, schicken] = arg as [string, string | null, "neu" | "sammel", boolean];
          if (k.status === "aufnahme") await sim.call("ktAnlegen", k.id);
          await sim.call("ktVormerken", k.id, fzId, modus, begleit);
          const f = sim.state.fahrzeuge[fzId];
          if (schicken && f?.kt && !f.kt.aktiv) await sim.call("ktSchicken", fzId);
          vs = null;
          return true;
        }
        case "anlegen":
          await sim.call("ktAnlegen", k.id);
          return true;
        case "schicken":
          if (fz) await sim.call("ktSchicken", fz.id);
          return true;
        case "loesen":
          await sim.call("ktLoesen", k.id);
          vs = null;
          return true;
        case "storno": {
          const f = sim.state.fahrzeuge[arg[0] as string];
          if (!f) return false;
          if (k.status === "vorgemerkt" && !f.kt?.aktiv) await sim.call("ktLoesen", k.id);
          else await sim.call("ktFunkStorno", f.id);
          vs = null;
          return true;
        }
        case "warten":
        case "frei":
          if (fz) await sim.call("ktFrueh", fz.id, was);
          return true;
        case "neben":
          await sim.call("ktStorno", k.id, k.status === "aufnahme" ? "verworfen" : "durch Leitstelle");
          return true;
        case "funk":
          panelZeigen("funk");
          setTimeout(() => funkRufen(arg[0] as string), 60);
          return true;
        case "abfrage":
          waehle("kt", k.id, { maske: false, karte: false });
          panelZeigen("abfrage");
          return true;
        case "karte":
          if (k.d.von) karteZeigen(k.d.von.lat, k.d.von.lon, 14);
          return true;
        case "fzKarte":
          if (fz) karteZeigen(fz.lat, fz.lon, 14);
          return true;
        case "code":
          await sim.call("ktSetze", k.id, { code: (arg[0] as string | null) || null });
          return true;
        case "von":
        case "nach":
          await sim.call("ktSetze", k.id, { [was]: arg[0] as KtOrt });
          return true;
        case "karteWaehlen": {
          const wo = arg[0] as "von" | "nach";
          const p = await karteWaehlen(wo === "von" ? "Abholort anklicken" : "Zielort anklicken");
          if (!p) return false;
          await sim.call("ktSetze", k.id, { [wo]: { ...p, label: `Koordinate ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` } });
          return true;
        }
        case "zeit": {
          const [wer, hm] = arg as ["abholung" | "termin", string];
          await sim.call("ktSetze", k.id, { [wer]: hm ? zeitAus(hm) : null });
          return true;
        }
        case "setze":
          await sim.call("ktSetze", k.id, arg[0] as Parameters<typeof sim.ktSetze>[1]);
          return true;
        case "export":
          await gespraechExportieren("kt", k.id);
          return true;
        default:
          return false;
      }
    } catch (x) {
      fehler(x);
      return false;
    }
  }

  const app = {
    leerText: sek ? "Eine Überstellung in der Einsatzliste anklicken." : "Einen Krankentransport in der Einsatzliste anklicken.",
    daten,
    tun,
    hinweis: (t: string) => toast(t, "error"),
    codeSuche: (q: string) => {
      const k = auftrag();
      if (!k) return [];
      const ueb = istUeberstellung(k.d) || sek;
      const org = { KTR: "rk", KTA: "asb", KTx: "egal" }[k.d.art];
      const w = q.toLowerCase().split(/\s+/).filter(Boolean);
      const liste = ktCodes()
        .filter((c) => (ueb ? c.gruppe === "SEK" : c.gruppe === "KT" && (!ktCodeDef(c.code)?.bed.org || ktCodeDef(c.code)?.bed.org === org)))
        .filter((c) => w.every((x) => `${c.code} ${c.name} ${c.kapitel}`.toLowerCase().includes(x)))
        .slice(0, 60)
        .map((c) => ({ code: c.code, text: c.name, wert: c.code }));
      return k.d.codeManuell ? [{ code: "↺", text: "Vorschlag – Code wieder aus den Angaben bestimmen", wert: "" }, ...liste] : liste;
    },
    ortSuchen: (q: string, wo: string): Promise<OrtGruppe[]> => {
      const k = auftrag();
      if (!k) return Promise.resolve([]);
      const bei = (wo === "sv" ? k.d.von : k.d.nach) ?? k.d.von ?? k.d.nach ?? null;
      return ortSuchen(q, { bei, stationen: true, nurKh: false });
    },
  };

  const f = entwurfEinbinden(root, "masken", vorlage, css, (props) => new KtMaskeLogik(props), { app, sek });
  fenster = f;
  f.wurzel.classList.add("eingebettet");

  const kurz = sek ? "SEK" : "KT";
  let titelSchmal: boolean | null = null;
  const titel = () => {
    const schmal = abfrageBreite(root) < 430;
    if (schmal === titelSchmal) return;
    titelSchmal = schmal;
    ctx.setzeTitel(schmal ? kurz : `${kurz}-Übersicht`);
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
      fahrt = null;
      f.k.neuerAuftrag();
      f.zeichnen();
    },
    dispose: () => {
      ro.disconnect();
      f.entfernen();
    },
  };
}

/** Gehört der Auftrag in die SEK-Übersicht (Überstellung)? */
export function istSek(k: KtAuftrag): boolean {
  return istUeberstellung(k.d) || !!k.d.sek || !!k.d.code?.startsWith("SEK");
}

