/**
 * Großeinsatz-Fenster aus dem Entwurf („Grosseinsatz.dc.html“, von Paul am 08.11. abgenommen).
 * Hier werden die echten Daten des laufenden Großeinsatzes für die Logik aufbereitet (statt der Beispiele im Entwurf)
 * und die Knöpfe an die Simulation angeschlossen: Bereitstellungsraum (Adresse, Karte, Vorschlag), Buchen je Patient
 * (normales Buchungsmenü), Voraviso, Notiz zur Lage, Einsatzmaske, Funk (Sprechgruppe des Großeinsatzes).
 */
import { findCode } from "../../../sim/codes";
import { store } from "../../../data/store";
import { sim, type Einsatz, type GsZeile, type SimFahrzeug } from "../../../sim/engine";
import { distanceM, searchAddress, type AddressHit } from "../../../sim/geo";
import { gsPatientText, type GsPatient } from "../../../sim/grossschaden";
import { belegt, plaetze, RESSOURCEN, istVoravisiert } from "../../../sim/khStatus";
import { openDialog } from "../../dialog";
import { entwurfEinbinden, type EntwurfFenster } from "../../entwurf/einbinden";
import { panelZeigen } from "../../ws/arbeitsplatz";
import { fahrzeugZeigen, karteWaehlen, karteZeigen, waehle } from "../../ws/auswahl";
import { funkGruppenSetzen } from "../../sprechfunk";
import { khBuchung } from "../../panels/masken";
import { fehlerZeigen, uhr } from "../../panels/teile";
import { GrosseinsatzLogik } from "./logik.js";
import vorlage from "./vorlage.html?raw";
import css from "./grosseinsatz.css?raw";

type Stand = "wartet" | "fw" | "versorgt" | "bereit" | "fahrt" | "kh" | "tot";

/** Großeinsätze, die gerade laufen (bzw. vor kurzem zu Ende gegangen sind) */
export function grosseinsaetze(): Einsatz[] {
  const t = sim.state.zeit;
  return sim.state.einsaetze.filter((e) => e.gs && !e.gs.aufgehoben && !e.gsKind && (e.zustand !== "abgeschlossen" || (e.gs.ende && t - e.gs.ende < 60 * 60_000)));
}

/** braucht ein Großeinsatz gerade Aufmerksamkeit (BR fehlt, KH-Anfrage offen)? – für das „!“ am Reiter */
export function gsBrauchtWas(l = grosseinsaetze()): boolean {
  return l.some((x) => x.gs && x.gs.phase !== "ende" && !x.gs.br) || l.some((x) => Object.values(x.gs?.kinder ?? {}).some((id) => sim.einsatz(id)?.khAnfrage));
}

/** Einsatz eines Patienten (Buchung, Transport) */
function kindVon(e: Einsatz, nr: number): Einsatz | undefined {
  const id = e.gs?.kinder[nr];
  return id ? sim.einsatz(id) : undefined;
}

function fzVon(e: Einsatz): SimFahrzeug[] {
  return e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f): f is SimFahrzeug => !!f && f.einsatzId === e.id);
}

/** Was mit dem Patienten gerade passiert */
function standVon(e: Einsatz, p: GsPatient): { st: Stand; stT: string } {
  if (p.sichtung === "tot") return { st: "tot", stT: "verstorben" };
  const k = kindVon(e, p.nr);
  const ab = e.gs?.erreichbar[p.nr];
  const nochNicht = ab === undefined || ab > sim.state.zeit;
  if (!k) return p.fw && nochNicht ? { st: "fw", stT: "wird von der Feuerwehr gerettet" } : { st: "wartet", stT: "wartet" };
  if (k.zustand === "abgeschlossen") return { st: "kh", stT: "im Krankenhaus übergeben" };
  const fz = fzVon(k);
  if (!fz.length) {
    if (nochNicht) return p.fw ? { st: "fw", stT: "wird von der Feuerwehr gerettet" } : { st: "wartet", stT: "wartet" };
    return { st: "wartet", stT: "wartet auf Transport" };
  }
  const wer = fz.map((f) => f.funkrufname).join(" + ");
  if (fz.some((f) => f.status === "zumZO")) return { st: "fahrt", stT: `Transport · ${wer}` };
  if (fz.some((f) => f.status === "amZO")) return { st: "kh", stT: `im Krankenhaus · ${wer}` };
  if (fz.some((f) => f.phase === "warteKH")) return { st: "bereit", stT: `transportbereit · ${wer}` };
  if (!fz.some((f) => f.phase === "vorOrt" || f.phase === "suche")) return { st: p.fw && nochNicht ? "fw" : "wartet", stT: `Fahrzeug kommt · ${wer}` };
  return { st: "versorgt", stT: `in Versorgung · ${wer}` };
}

/** Krankenhaus buchen für einen Patienten: das normale Buchungsmenü im Pop-up */
function buchenDialog(k: Einsatz, titel: string): void {
  let dlg: ReturnType<typeof openDialog> | null = null;
  const teil = khBuchung(k, { kompakt: true, gebucht: () => dlg?.close() });
  dlg = openDialog({ title: titel, body: teil.root, actions: [{ label: "Schließen" }], wide: true });
  const aus = sim.onChange(() => {
    if (!teil.root.isConnected) return aus();
    teil.refresh();
  });
}

const SOLL_NAME: Record<string, string> = { "weiterer BEL": "BEL (Leitung BR)" };
const zeilen = (l: GsZeile[] | undefined) => (l ?? []).map((z) => ({ a: SOLL_NAME[z.art] ?? z.art, ist: z.ist, soll: z.soll }));

/** Bereitstellungsraum: Name und Abstand aus dem gespeicherten Ort */
function brAnzeige(e: Einsatz): { name: string; abstand: string } | null {
  const br = e.gs?.br;
  if (!br) return null;
  const bo = e.adresse ?? { lat: e.wahr.lat, lon: e.wahr.lon };
  const m = Math.round(distanceM(br, bo) / 10) * 10;
  const abstand = m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km vom Einsatzort` : `${m} m vom Einsatzort`;
  let name = (br.label ?? "").replace(/^Bereitstellungsraum\s*/, "");
  const v = name.match(/^ca\. \d+ m (\S+) vom Einsatzort$/);
  if (v) name = `Vorschlag, ${v[1]}`;
  else if (/^\(Karte/.test(name)) name = "Punkt auf der Karte";
  return { name: name || "Bereitstellungsraum", abstand };
}

/** Lagemeldung der Einsatzleitung in SCENE / SAFETY / SITUATION / SUPPORT zerlegen (Text aus engine.gsLagemeldung) */
function lagePunkte(text: string): { k: string; v: string }[] | null {
  const m = text.match(/^(NF\d+), (.+?)\. (\d+ Patienten.*?)\. Verletzungsmuster: (.+?)\. (?:Benötigen (.+?)\. )?(Nachforderung: .+?|Kräfte vorerst ausreichend)\. Zufahrt: (.+)$/s);
  if (!m) return null;
  return [
    { k: "SCENE", v: `${m[1]}, ${m[2]}` },
    { k: "SAFETY", v: /^Zufahrt/i.test(m[7]) ? m[7] : `Zufahrt: ${m[7]}` },
    { k: "SITUATION", v: `${m[3]} · ${m[4]}` },
    { k: "SUPPORT", v: [m[5] ? `Benötigen ${m[5]}` : "", m[6]].filter(Boolean).join(" · ") },
  ];
}

const ART: Record<string, [string, string]> = { sicht: ["Sichtmeldung", "sicht"], lage: ["Lagemeldung", "lage"], nachforderung: ["Nachforderung", "nf"], notiz: ["Notiz", "notiz"], info: ["Info", "info"] };

/** alles, was das Fenster zeigt – aus Simulation und Store */
function daten(e: Einsatz) {
  const gs = e.gs!;
  const w = e.wahr.gs;
  const t = sim.state.zeit;
  const vor = gs.phase === "alarm" || gs.phase === "sicht";
  // Patienten
  const pat = (w?.patienten ?? []).filter((p) => gs.gezeigt.includes(p.nr));
  const pats = pat.map((p) => {
    const k = kindVon(e, p.nr);
    const h = k?.kh ? store.get("hospitals", k.kh.hospitalId) : undefined;
    const s = standVon(e, p);
    return {
      nr: p.nr, s: p.sichtung, a: p.alter, g: p.geschlecht === "w" ? "w" : "m", m: p.muster, ...s,
      kh: p.sichtung === "tot" ? null : h ? h.kurzname || h.name : null, khLang: h?.name ?? "",
      anfrage: !!k?.khAnfrage, buchbar: !!k && k.zustand !== "abgeschlossen" && p.sichtung !== "tot",
    };
  });
  // Soll/Ist
  const si = sim.gsSollIst(e);
  // Kräfte: Berufungsort, Bereitstellungsraum, Anfahrt/Transport (auch die Fahrzeuge der Patienten-Einsätze)
  const kinder = Object.values(gs.kinder).map((id) => sim.einsatz(id)).filter((x): x is Einsatz => !!x);
  const alle = [...fzVon(e), ...kinder.flatMap(fzVon)].filter((f, i, l) => l.indexOf(f) === i);
  const chip = (f: SimFahrzeug) => {
    const sd = sim.statusDef(f.status);
    return { id: f.id, r: f.funkrufname, typ: f.typ ?? f.rmTyp, st: `s${String(sd.nummer).toLowerCase()}`, status: `${sd.nummer} ${sd.name}`, rolle: f.id === gs.el ? "EL" : f.id === gs.brBel ? "BR" : "", dm: !!f.dispoMobil };
  };
  const BO = ["vorOrt", "warteKH", "suche"];
  const kraefte = [
    { n: "Berufungsort", fz: alle.filter((f) => BO.includes(f.phase)).map(chip) },
    { n: "Bereitstellungsraum", fz: alle.filter((f) => f.phase === "wartetBR").map(chip) },
    { n: "Anfahrt / Transport", fz: alle.filter((f) => !BO.includes(f.phase) && f.phase !== "wartetBR").map(chip) },
  ];
  // Nachforderung der Einsatzleitung
  const nf = (e.nachforderungen ?? []).filter((x) => !x.erledigt);
  const nfBr = nf.filter((x) => x.art !== "BIT").map((x) => (x.art === "NA" ? `${x.anzahl} Notarztmittel` : `${x.anzahl} Rettungsmittel`));
  const nfBit = nf.filter((x) => x.art === "BIT").map(() => "BIT (Schwerlasttransport)");
  const nachf = nf.length ? `Nachforderung: ${[nfBr.length ? `${nfBr.join(", ")} in den Bereitstellungsraum` : "", ...nfBit].filter(Boolean).join(", ")}` : null;
  // Lage: Zeitleiste (älteste oben)
  const meldungen = gs.meldungen
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.zeit - b.m.zeit || a.i - b.i)
    .map(({ m }) => {
      let [art, cls] = ART[m.art] ?? ["", "notiz"];
      let text = m.text.replace(/^(Sichtmeldung|Lagemeldung): /, "");
      let punkte: { k: string; v: string }[] | null = null;
      if (m.art === "lage" || m.art === "nachforderung") {
        punkte = lagePunkte(text);
        if (punkte) {
          art = "Lagemeldung";
          cls = "lage";
          text = "";
        }
      }
      if (m.art === "info" && /Einsatzleitung/.test(m.text)) [art, cls] = ["Einsatzleitung", "el"];
      return { zeit: uhr(m.zeit), von: m.von, art, cls, text, punkte: punkte ?? [] };
    });
  // Meilensteine
  const erste = (f: (m: (typeof gs.meldungen)[number]) => boolean) => gs.meldungen.find(f)?.zeit;
  const tSicht = erste((m) => m.art === "sicht");
  const tLage = erste((m) => (m.art === "lage" || m.art === "nachforderung") && /^Lagemeldung:/.test(m.text));
  const tBr = gs.br ? [...e.protokoll].reverse().find((p) => p.text.startsWith("Bereitstellungsraum: "))?.zeit : undefined;
  const tBel = gs.bel ? erste((m) => m.art === "info" && /übernehme die Einsatzleitung/.test(m.text)) : undefined;
  const ende = gs.phase === "ende";
  const z = (x: number | null | undefined) => (x ? uhr(x) : "");
  const meilen = [
    { t: "Sichtmeldung", zeit: z(tSicht), ok: !!tSicht || gs.phase !== "alarm" },
    { t: "Lagemeldung", zeit: z(tLage), ok: !!tLage || !vor },
    { t: "BR festgelegt", zeit: z(tBr), ok: !!gs.br },
    { t: "EL an BEL", zeit: z(tBel), ok: gs.bel, titel: "Einsatzleitung an den BEL übergeben" },
    { t: "alle abtransportiert", zeit: z(gs.ende), ok: ende },
    { t: "BR aufgelöst", zeit: z(gs.ende), ok: ende && !!gs.br },
  ];
  // Krankenhäuser in der Nähe mit Notaufnahme/Unfall/Schockraum
  const pos = e.adresse ?? { lat: e.wahr.lat, lon: e.wahr.lon };
  const haeuser = store
    .list("hospitals")
    .filter((h) => sim.khImNetz(h) && (h.einrichtungen ?? []).some((x) => x === "amb_notaufnahme" || x === "amb_unfall" || x === "fb_schockraum"))
    .map((h) => ({ h, km: distanceM(pos, h) / 1000 }))
    .filter((x) => x.km < 70)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8)
    .map(({ h, km }) => {
      let ges = 0;
      let frei = 0;
      for (const r of RESSOURCEN) {
        if (r.id === "pvz") continue;
        const n = plaetze(h, r.id);
        ges += n;
        frei += Math.max(0, n - belegt(sim.state.khBelegung, h.id, r.id, t));
      }
      return { id: h.id, n: h.kurzname || h.name, lang: h.name, km: `${km.toFixed(0)} km`, frei, ges, an: gs.voraviso.includes(h.id) || istVoravisiert(h.id) };
    });
  const weitere = e.weitereAnrufe ?? [];
  const lebend = (w?.patienten ?? []).filter((p) => p.sichtung !== "tot").length;
  const code = findCode(e.code ?? undefined);
  return {
    id: e.id,
    nummer: e.nummer,
    stufe: gs.stufe ?? "GS",
    stufeOffen: !gs.stufe,
    stufeTitel: gs.stufe ? "Stufe nach Zahl der Betroffenen" : "Stufe noch offen (kommt mit der Lagemeldung)",
    titel: (!vor || gs.phase === "sicht") && w?.art ? w.art : code?.beschreibung ?? "Großeinsatz",
    unterTitel: `${e.adresse?.label ?? e.meldung.adresse} · seit ${uhr(e.erstellt)}${e.zustand === "abgeschlossen" ? " · abgeschlossen" : ""}`,
    gruppe: sim.sprechgruppeName(gs.gruppe ?? "gs"),
    vor,
    ende,
    pats,
    patGesamt: vor ? null : (w?.patienten.length ?? lebend) || null,
    seg: zeilen(si?.seg),
    brZ: zeilen(si?.br),
    br: brAnzeige(e),
    anrufe: weitere.length ? `${weitere.length} weitere${weitere.length === 1 ? "r Notruf" : " Notrufe"} zusammengelegt` : "",
    anrufeTitel: weitere.map((a) => `${a.nummer} (${uhr(a.zeit)})`).join(", "),
    kraefte,
    nachf,
    meldungen,
    meilen,
    haeuser,
  };
}

/** Fenster in ein Element zeichnen; gibt zurück, wie es neu gezeichnet wird */
export function grosseinsatzFenster(ziel: HTMLElement, opt: { titel(t: string): void; badge(an: boolean): void }): { zeichnen(): void; entfernen(): void } {
  let fuer: string | null = null;
  const aktuell = (): Einsatz | undefined => {
    const l = grosseinsaetze();
    return l.find((x) => x.id === fuer) ?? l[0];
  };
  const app = {
    daten: () => {
      const e = aktuell();
      fuer = e?.id ?? null;
      opt.badge(gsBrauchtWas());
      opt.titel(e ? `Großeinsatz ${e.nummer}` : "Großeinsatz");
      return e ? daten(e) : null;
    },
    buchen: (nr: number) => {
      const e = aktuell();
      const k = e && kindVon(e, nr);
      const p = e?.wahr.gs?.patienten.find((x) => x.nr === nr);
      if (k && p) buchenDialog(k, `Krankenhaus buchen – ${gsPatientText(p)}`);
    },
    brVorschlag: (): boolean => {
      const e = aktuell();
      const v = e && sim.gsBrVorschlag(e.id);
      if (!e || !v) return false;
      void fehlerZeigen(sim.call("gsBr", e.id, v));
      return true;
    },
    brKarte: async (fertig: () => void) => {
      const e = aktuell();
      if (!e) return;
      const bo = e.adresse ?? { lat: e.wahr.lat, lon: e.wahr.lon };
      panelZeigen("karte", { nurWennOffen: true });
      karteZeigen(bo.lat, bo.lon, 15);
      const p = await karteWaehlen("Bereitstellungsraum anklicken");
      if (!p) return;
      void fehlerZeigen(sim.call("gsBr", e.id, { lat: p.lat, lon: p.lon, label: `Bereitstellungsraum (Karte, ${Math.round(distanceM(p, bo))} m vom Einsatzort)` }));
      fertig();
    },
    brAdresse: (h: AddressHit) => {
      const e = aktuell();
      if (e) void fehlerZeigen(sim.call("gsBr", e.id, { lat: h.lat, lon: h.lon, label: `Bereitstellungsraum ${h.label}` }));
    },
    suche: (q: string) => searchAddress(q, 8),
    zurMaske: () => {
      const e = aktuell();
      if (e) waehle("einsatz", e.id);
    },
    zumFunk: () => {
      const e = aktuell();
      funkGruppenSetzen({ senden: e?.gs?.gruppe ?? "gs" });
      panelZeigen("funk");
    },
    notiz: (text: string) => {
      const e = aktuell();
      if (e) void fehlerZeigen(sim.call("gsNotiz", e.id, text));
    },
    voraviso: (khId: string, an: boolean) => {
      const e = aktuell();
      if (e) void fehlerZeigen(sim.call("gsVoraviso", e.id, khId, an));
    },
    fahrzeug: (id: string) => fahrzeugZeigen(id),
  };
  const f: EntwurfFenster<GrosseinsatzLogik> = entwurfEinbinden(ziel, "grosseinsatz", vorlage, css, (p) => new GrosseinsatzLogik(p), { app });
  return { zeichnen: () => f.zeichnen(), entfernen: () => f.entfernen() };
}
