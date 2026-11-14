// Großschadensfall: Auslösen, Alarmierung in zwei Schritten, Bereitstellungsraum, Lagemeldung, Sichtung,
// Zuteilung der Patienten, Abruf (Sammelruf), NAH im BR, Abtransport, Ende. Aus engine.ts herausgelöst (Beta 53) –
// die Simulation (class Simulation) erbt diese Teile; was der Großschaden vom Kern braucht, steht unten als „abstract“.
import { voravisoSetzen } from "./khStatus";
import { GS_GEBAEUDE, GS_SZENARIEN, gsPasstZeit, gsPatientText, nfAusZahl, NF_KRAEFTE, OHNE_OBERLEITUNG, SEG, type GsOrt, type GsPatient, type GsSzenario, type NfStufe } from "./grossschaden";
import { store } from "../data/store";
import { findCode, hasCodes } from "./codes";
import { distanceM, randomAddresses, type LatLon, type Route } from "./geo";
import { type Settings, type StatusKey } from "./settings";
import { fahrFaktor, lageArt, lageVon, WETTER_LABEL } from "./weather";
import { fallZiehen, nfStufe, type Antworten, type Schema } from "../abfrage/schema";
import { autobahnInfo, stellenInGruppe, stellenLaden, stelleBeschreibung, type Einsatzstelle } from "../data/einsatzstellen";
import { type SzenarioVorlage } from "../abfrage/szenario";
import { kapitelFuerThema, kapitelZuThema, merkmaleInSchema } from "../abfrage/themen";
import { hhmm } from "./kt";
import { PARTNER, type PartnerArt } from "./partner";
import { inFunkgruppe, mitteVon, type Funkgruppe } from "./funkgruppen";
import { alleFaelle, brauchtVon } from "../abfrage/faelle";
import { type Einsatz, type Fall, type FunkAnliegen, type FunkGespraech, type FunkSatz, type GsLauf, type GsShuttle, type GsWahr, type GsZeile, MIN, type Ort, type SimFahrzeug, type Vorschlag, fliegt, gsNaMittel, gsRtw, pick, rnd, versetzt, type EinsatzNeu, type SimState, type Phase, type Funkmeldung, type PartnerFz } from "./engine";

export abstract class GsKern {
  // ---- vom Simulationskern (engine.ts)
  abstract state: SimState;
  abstract get settings(): Settings;
  protected abstract anpassen(schema: Schema, a: Antworten): { antworten: Antworten; roh: Antworten };
  protected abstract bucheKhAuto(e: Einsatz, von: string): void;
  abstract einsatz(id: string): Einsatz | undefined;
  protected abstract einsatzFz(e: Einsatz): SimFahrzeug[];
  protected abstract eintreffenLage(fz: SimFahrzeug, e: Einsatz): void;
  protected abstract emit(): void;
  abstract erstelleEinsatz(p: EinsatzNeu): Einsatz;
  protected abstract fahre(fz: SimFahrzeug, ziel: LatLon, phase: Phase, sondersignal: boolean): void;
  abstract flugHindernis(fz: SimFahrzeug): string | null;
  abstract freigeben(fz: SimFahrzeug): void;
  abstract funk(von: string, einsatzId: string | null, text: string, art: Funkmeldung["art"]): void;
  abstract funkgruppe(): Funkgruppe;
  protected abstract fzFunk(von: SimFahrzeug, an: SimFahrzeug, e: Einsatz, saetze: FunkSatz[], mithoeren?: { von: string; text: string }): FunkGespraech | null;
  abstract fzRuft(fz: SimFahrzeug, e: Einsatz | null, art: FunkAnliegen, text: string): void;
  abstract istTag(t?: number): boolean;
  abstract grossschaeden(): Einsatz[];
  protected abstract khPlatzBelegen(e: Einsatz): void;
  protected abstract leoGespraech(fzId: string): FunkGespraech | undefined;
  abstract log(e: Einsatz, text: string): void;
  abstract mitNotarzt(fz: SimFahrzeug): boolean;
  protected abstract nachfordern(e: Einsatz, fz: SimFahrzeug, fehlt: { na: number; rtw: number; bit: number; nfs?: number }): void;
  abstract partnerVon(e: Einsatz): PartnerFz[];
  protected abstract pruefeAbschluss(e: Einsatz): void;
  abstract rufname(fz: SimFahrzeug): string;
  protected abstract setStatus(fz: SimFahrzeug, s: StatusKey, quiet?: boolean, grund?: string): void;
  protected abstract strassenRoute(von: LatLon, ziel: LatLon): Promise<Route>;
  abstract temperatur(): number;
  abstract transportfaehig(fz: SimFahrzeug): boolean;
  abstract verdacht(e: Einsatz): string;

  /**
   * Großschadensfall auslösen (Knopf bzw. Generator „Großunfall“): ein Szenario der eigenen Funkgruppe, möglichst
   * eines, das zur Uhrzeit passt. nurPassend: nur, wenn eines zur Uhrzeit passt (sonst null).
   */
  async grossschadenAusloesen(id?: string | null, nurPassend = false): Promise<string | null> {
    const schema = this.settings.anrufe ? store.schema : null;
    if (!schema || !hasCodes()) throw new Error("Für einen Großschadensfall braucht es Notrufe mit Abfrage (Codesystem geladen, Anrufe eingeschaltet)");
    if (this.grossschaeden().length) throw new Error("Es läuft schon ein Großschadensfall");
    const fg = this.funkgruppe();
    const alle = GS_SZENARIEN.filter((s) => s.funkgruppe === fg.id && (!id || s.id === id));
    if (!alle.length) throw new Error(`Für TETRA ${fg.id} gibt es noch keine Großschadensfälle (vorerst nur TETRA NÖ-03)`);
    const jetzt = alle.filter((s) => gsPasstZeit(s, this.state.zeit));
    if (nurPassend && !jetzt.length) return null;
    const sz = pick(jetzt.length ? jetzt : alle);
    const ort = await this.gsOrtWaehlen(sz);
    if (!ort) throw new Error("Kein passender Ort für den Großschadensfall gefunden");
    const d = new Date(this.state.zeit);
    const wetter = this.settings.wetterAktiv;
    const a = sz.bauen({
      rnd: Math.random,
      stunde: d.getHours(),
      wochentag: d.getDay(),
      wetter: wetter ? lageArt(lageVon(this.state.wetter.lage)) : "trocken",
      dunkel: !this.istTag(),
      heiss: wetter && this.temperatur() >= 28,
      ort,
    });
    const w: GsWahr = {
      szenario: a.szenario,
      titel: a.titel,
      art: a.art,
      sicht: a.sicht,
      gefahren: a.gefahren,
      zufahrt: a.zufahrt,
      patienten: a.patienten,
      unverletzt: a.unverletzt,
      partner: a.partner,
      fwMin: a.fwMin,
      start: this.state.zeit,
      ort,
      thema: a.thema,
      anrufer: a.anrufer,
      anrufe: a.anrufer.slice(1).map((x, i) => ({ um: this.state.zeit + x.nachMin * MIN + rnd(0, 40) * 1000, i: i + 1 })),
      anrainer: a.anrainer ?? 0,
      anrainerUm: a.anrainer ? this.state.zeit + rnd(6, 12) * MIN : null,
    };
    const e = this.gsAnruf(w, 0, null);
    if (!e) throw new Error("Der Notruf zum Großschadensfall konnte nicht erzeugt werden (passendes Kapitel fehlt im Codesystem)");
    e.wahr.gs = w;
    this.emit();
    return e.id;
  }

  /** Ort des Ereignisses: fester Ort, passende Straßenstelle, Gebäude oder Bahnübergang in der Funkgruppe */
  protected async gsOrtWaehlen(sz: GsSzenario): Promise<GsOrt | null> {
    const o = sz.ort;
    const fg = this.funkgruppe();
    if (o.art === "fest") return { lat: o.lat, lon: o.lon, adresse: o.adresse, gemeldet: o.gemeldet, gemeinde: o.gemeinde };
    if (o.art === "gebaeude") {
      const l = GS_GEBAEUDE.filter((g) => inFunkgruppe(fg, g.lat, g.lon));
      if (!l.length) return null;
      const g = pick(l);
      return { lat: g.lat, lon: g.lon, adresse: g.adresse, gemeldet: g.adresse, gemeinde: g.gemeinde, stockwerke: g.stockwerke };
    }
    await stellenLaden();
    const st = stellenInGruppe(fg)
      .map((x) => x.stelle)
      .filter((x): x is Einsatzstelle => !!x);
    if (o.art === "strasse") {
      const l = st.filter((s) => s.typ === o.typ && o.namen.includes(s.name));
      if (!l.length) return null;
      const s = pick(l);
      const b = stelleBeschreibung(s);
      return { lat: s.lat, lon: s.lon, adresse: b.replace(/^auf der /, ""), gemeldet: b, gemeinde: s.ort, strasse: s.name, ...(o.typ === "autobahn" ? { richtung: autobahnInfo(s).richtung } : {}) };
    }
    // Bahnübergang an einer Straße
    const l = st.filter((s) => s.typ === "bahnuebergang" && s.name && s.ort);
    if (!l.length) return null;
    const s = pick(l);
    return { lat: s.lat, lon: s.lon, adresse: `Bahnübergang ${s.name}, ${s.ort}`, gemeldet: `beim Bahnübergang an der ${s.name} in ${s.ort}`, gemeinde: s.ort, elektrifiziert: !OHNE_OBERLEITUNG.test(s.ort) };
  }

  /** Notruf eines Anrufers zum Großschaden (i = welcher Anrufer; parent = erster Notruf, wenn es ein weiterer ist) */
  protected gsAnruf(w: GsWahr, i: number, parent: Einsatz | null): Einsatz | null {
    const schema = store.schema;
    const an = w.anrufer[i];
    if (!schema || !an) return null;
    const kap = kapitelZuThema(w.thema, schema) ?? kapitelFuerThema(w.thema, schema);
    if (!kap) return null;
    const fest = this.anpassen(schema, merkmaleInSchema(schema, { ...an.fest, alter: an.patient.alter, geschlecht: an.patient.geschlecht }));
    const f = fallZiehen(schema, kap, Math.random, 0, fest.antworten);
    const code = f ? findCode(f.ergebnis.code) : undefined;
    if (!f || !code) return null;
    const vorlage: SzenarioVorlage = {
      id: `${w.szenario}_${i}`,
      thema: w.thema,
      alter: [an.patient.alter, an.patient.alter],
      geschlecht: an.patient.geschlecht,
      orte: [an.ortArt],
      stelle: an.stelle,
      anrufer: [an.typ],
      geschehen: an.geschehen,
      hergang: an.hergang,
      ...(an.typ === "selbst" ? { hergangIch: an.hergang } : {}),
      details: an.details,
      verlauf: an.verlauf,
      seitMin: [Math.max(1, an.nachMin), an.nachMin + 3],
    };
    const fall: Fall = { kapitel: f.ergebnis.pfad[0], antworten: f.antworten, code: code.code, vorlage: vorlage.id, ortArt: an.ortArt, ...(Object.keys(fest.roh).length ? { roh: fest.roh } : {}) };
    const o = w.ort;
    // Bahnübergang: keine Adresse – Koordinate (der Anrufer beschreibt die Stelle)
    const findbar = !o.adresse.startsWith("Bahnübergang");
    const e = this.erstelleEinsatz({
      lat: o.lat,
      lon: o.lon,
      adresse: findbar ? o.adresse : `Koordinate ${o.lat.toFixed(5)}, ${o.lon.toFixed(5)} (${o.adresse})`,
      code,
      gemeldeteAdresse: o.gemeldet,
      gemeinde: o.gemeinde,
      fall,
      patientAlter: an.patient.alter,
      transport: true,
      vorlageObj: vorlage,
    });
    e.wahr.transport = true;
    if (parent) {
      e.gsZu = parent.id;
      e.wahr.lage = undefined;
    } else {
      const lebend = w.patienten.filter((p) => p.sichtung !== "tot");
      e.wahr.lage = {
        patienten: lebend.map((p) => ({ nr: p.nr, geschlecht: p.geschlecht, alter: p.alter, bw: p.bw ?? (p.sichtung === "rot" ? "getruebt" : "ja"), at: p.at ?? (p.sichtung === "rot" ? "abnorm" : "normal"), sichtung: p.sichtung as "rot" | "gelb" | "gruen" })),
        gemeldet: lebend.length,
        irrtum: null,
        ereignisse: [],
        aufgedeckt: false,
        verlauf: [],
      };
    }
    return e;
  }

  /** Anrainer mit Augen-/Atemwegsreizung (Gefahrstoffwolke): eigener kleiner Einsatz in der Nähe */
  protected async gsAnrainer(w: GsWahr): Promise<void> {
    const schema = store.schema;
    if (!schema) return;
    const kap = kapitelZuThema("gefahrstoff", schema);
    if (!kap) return;
    const o = w.ort;
    const d = 0.02;
    const adr = (await randomAddresses([o.lon - d, o.lat - d * 0.7, o.lon + d, o.lat + d * 0.7], 4)).find((a) => !a.place && distanceM(a, o) > 600);
    if (!adr) return;
    const alter = Math.round(rnd(25, 85));
    const g: "m" | "w" = Math.random() < 0.5 ? "m" : "w";
    const fest = this.anpassen(schema, merkmaleInSchema(schema, { substanz: "chemisch", betroffene: "ja", mehrere_verletzte: "nein", anzahl_patienten: "1", bw: "ja", at: Math.random() < 0.4 ? "abnorm" : "normal", alter, geschlecht: g }));
    const f = fallZiehen(schema, kap, Math.random, 0, fest.antworten);
    const code = f ? findCode(f.ergebnis.code) : undefined;
    if (!f || !code) return;
    const vorlage: SzenarioVorlage = {
      id: `${w.szenario}_anrainer`,
      thema: "gefahrstoff",
      alter: [alter, alter],
      geschlecht: g,
      orte: ["wohnung"],
      stelle: ["in der Wohnung"],
      anrufer: ["selbst", "partner"],
      geschehen: ["Im Industriepark hat es eine Explosion gegeben, eine dunkle Rauchwolke ist über die Wohngegend gezogen. Seitdem brennen die Augen, der Hals kratzt und es kommt ständig Husten."],
      hergang: ["{Er} hat seit der Explosion im Industriepark ganz rote Augen und hustet ständig."],
      hergangIch: ["Seit der Explosion im Industriepark brennen mir die Augen und ich huste die ganze Zeit."],
      details: ["Die Fenster waren offen, als die Wolke gekommen ist.", "Es riecht stechend."],
      verlauf: ["Du bist beunruhigt."],
      seitMin: [5, 25],
    };
    this.erstelleEinsatz({ lat: adr.lat, lon: adr.lon, adresse: adr.label, code, fall: { kapitel: f.ergebnis.pfad[0], antworten: f.antworten, code: code.code, vorlage: vorlage.id, ortArt: "wohnung" }, patientAlter: alter, vorlageObj: vorlage });
  }

  /** Großeinsatz anlegen (mit der Antwort auf „Wie viele Patienten?“ bzw. bei der ersten Alarmierung) */
  protected gsStart(e: Einsatz): GsLauf | null {
    if (e.gsKind) return null;
    if (!e.gs) {
      const stufe = nfStufe(e.anruf?.antworten);
      if (!e.wahr.gs && !stufe) return null;
      // Sprechgruppe: RD-NOE-09, ist die schon von einem anderen Großeinsatz belegt, RD-NOE-10
      const belegt = this.state.einsaetze.some((x) => x !== e && x.gs && !x.gs.aufgehoben && x.zustand !== "abgeschlossen" && (x.gs.gruppe ?? "gs") === "gs");
      e.gs = { gruppe: belegt ? "gs2" : "gs", stufe, stufeAbfrage: stufe, br: null, brNoetig: false, ziel: {}, el: null, bel: false, phase: "alarm", meldungen: [], lageText: "", lageUm: null, gezeigt: [], aufdeckenUm: null, kinder: {}, erreichbar: {}, voraviso: [], brAlarm: [] };
      // schon vorher alarmierte Fahrzeuge (bevor klar war, dass es ein Großschaden ist) fahren zum Berufungsort
      for (const fz of this.einsatzFz(e)) e.gs.ziel[fz.id] = "bo";
      if (this.einsatzFz(e).length) e.gs.segUm = this.state.zeit;
    }
    return e.gs.aufgehoben ? null : e.gs;
  }

  /**
   * Abfrage geändert: mit der Antwort 6–10 / 11–30 / über 30 Patienten wird der Einsatz sofort zum Großeinsatz
   * (Stufe aus der Abfrage, im Reiter änderbar); wird die Antwort vor der ersten Alarmierung kleiner, ist er wieder normal.
   */
  protected gsAusAbfrage(e: Einsatz): void {
    if (e.gsKind || e.zusammengelegt || e.zustand === "abgeschlossen") return;
    const stufe = nfStufe(e.anruf?.antworten);
    if (!stufe) {
      const gs = e.gs;
      if (gs && !gs.aufgehoben && !gs.segUm && !this.einsatzFz(e).length && !gs.br) {
        e.gs = null;
        this.log(e, "Kein Großeinsatz mehr (Anzahl der Patienten geändert)");
      }
      return;
    }
    const neu = !e.gs;
    const gs = this.gsStart(e);
    if (!gs) return;
    if (neu) {
      this.log(e, `Großeinsatz ${stufe} angelegt (Anzahl der Patienten aus der Abfrage)`);
      // schon jemand beim Patienten und es ist doch kein Großschaden: die Besatzung meldet es gleich
      const da = this.einsatzFz(e).find((x) => x.phase === "vorOrt" && !x.pilot);
      if (!e.wahr.gs && da) {
        gs.aufgehoben = true;
        const n = e.wahr.lage?.patienten.length ?? 1;
        this.funk(this.rufname(da), e.id, `kein Großschaden, ${n} Patient${n > 1 ? "en" : ""}`, "info");
        this.log(e, "Kein Großschaden – laut Besatzung vor Ort");
      }
    } else if (gs.stufeAbfrage !== stufe) {
      gs.stufeAbfrage = stufe;
      if (gs.stufe !== stufe) this.log(e, `Großeinsatz: Stufe ${stufe} (Abfrage geändert)`);
      gs.stufe = stufe;
    }
  }

  /** Stufe des Großeinsatzes ändern (Reiter Großeinsatz): mehr Kräfte bzw. „zu viel“ – alarmierte Fahrzeuge bleiben */
  gsStufe(id: string, stufe: NfStufe): void {
    const e = this.einsatz(id);
    if (!e?.gs || e.gs.aufgehoben) throw new Error("Kein Großeinsatz");
    if (!(stufe in NF_KRAEFTE)) throw new Error("Unbekannte Stufe");
    if (e.gs.stufe === stufe) return;
    this.log(e, `Großeinsatz: Stufe ${e.gs.stufe ?? "offen"} → ${stufe} (Leitstelle)`);
    e.gs.stufe = stufe;
    this.emit();
  }

  /**
   * Wohin fährt ein neu alarmiertes Fahrzeug? Erste Alarmierung (SEG), EL ÖBB, DispoMobil und der erste BEL
   * zum Berufungsort; alles andere – auch der zweite BEL – in den Bereitstellungsraum.
   */
  protected gsZielFuer(e: Einsatz, fz: SimFahrzeug, erste: boolean, dazu: string[] = []): "bo" | "br" {
    const gs = e.gs!;
    if (fz.dispoMobil || fz.rmTyp === "EL ÖBB") return "bo";
    if (fz.rmTyp === "BEL") {
      const belBo = [...Object.entries(gs.ziel).filter(([, z]) => z === "bo").map(([id]) => id), ...dazu.filter((id) => !gs.ziel[id])].some((id) => this.state.fahrzeuge[id]?.rmTyp === "BEL" && id !== gs.brBel);
      return belBo ? "br" : "bo";
    }
    return erste ? "bo" : "br";
  }

  /** Neu alarmierte Fahrzeuge: erste Alarmierung zum Berufungsort, alle späteren in den Bereitstellungsraum */
  protected gsAlarm(e: Einsatz, ids: string[], erste: boolean): void {
    const gs = e.gs;
    if (!gs || gs.aufgehoben) return;
    if (!gs.segUm && ids.length) this.log(e, `Großeinsatz${gs.stufe ? ` (${gs.stufe})` : ""}: Schnelleinsatzgruppe zum Berufungsort – weitere Kräfte in den Bereitstellungsraum`);
    for (const id of ids) {
      const fz = this.state.fahrzeuge[id];
      if (!fz || fz.einsatzId !== e.id || gs.ziel[id]) continue;
      const z = this.gsZielFuer(e, fz, erste);
      gs.ziel[id] = z;
      if (z === "br") {
        (gs.brAlarm ??= []).push(id);
        if (fz.rmTyp === "BEL" && !gs.brBel) gs.brBel = id;
        this.log(e, `${fz.funkrufname} in den Bereitstellungsraum${fz.id === gs.brBel ? " (bleibt dort, bis er leer ist)" : ""}`);
      }
    }
    if (ids.length && !gs.segUm) gs.segUm = this.state.zeit;
    if (!gs.br && Object.values(gs.ziel).includes("br")) gs.brNoetig = true;
  }

  /** Bereitstellungsraum festlegen (Adresse, Punkt auf der Karte oder Vorschlag) */
  gsBr(id: string, ort: Ort): void {
    const e = this.einsatz(id);
    if (!e?.gs) throw new Error("Kein Großeinsatz");
    e.gs.br = { lat: ort.lat, lon: ort.lon, label: ort.label || `Bereitstellungsraum ${ort.lat.toFixed(5)}, ${ort.lon.toFixed(5)}` };
    e.gs.brNoetig = false;
    this.log(e, `Bereitstellungsraum: ${e.gs.br.label}`);
    // wartende Fahrzeuge rücken gleich aus
    for (const fz of this.einsatzFz(e)) if (fz.phase === "ausruecken" && e.gs.ziel[fz.id] === "br" && fz.phaseEnde !== null) fz.phaseEnde = Math.min(fz.phaseEnde, this.state.zeit + 5000);
    this.emit();
  }

  /** Vorschlag für den Bereitstellungsraum: ca. 400–600 m vom Einsatzort, auf der Seite, von der die Fahrzeuge kommen */
  gsBrVorschlag(id: string): Ort | null {
    const e = this.einsatz(id);
    const bo = e?.adresse ?? (e ? { lat: e.wahr.lat, lon: e.wahr.lon } : null);
    if (!e || !bo) return null;
    const pos = this.einsatzFz(e);
    let grad = 200;
    if (pos.length) {
      const lat = pos.reduce((a, x) => a + x.lat, 0) / pos.length;
      const lon = pos.reduce((a, x) => a + x.lon, 0) / pos.length;
      if (distanceM({ lat, lon }, bo) > 300) grad = (Math.atan2((lon - bo.lon) * Math.cos((bo.lat * Math.PI) / 180), lat - bo.lat) * 180) / Math.PI;
    }
    const p = versetzt(bo.lat, bo.lon, 500, grad);
    const richtung = ["nördlich", "nordöstlich", "östlich", "südöstlich", "südlich", "südwestlich", "westlich", "nordwestlich"][Math.round((((grad % 360) + 360) % 360) / 45) % 8];
    return { lat: p.lat, lon: p.lon, label: `Bereitstellungsraum ca. 500 m ${richtung} vom Einsatzort` };
  }

  /** Voraviso an ein Krankenhaus (150 % der Plätze, keine Selbstzuweiser) bzw. zurücknehmen */
  gsVoraviso(id: string, khId: string, an: boolean): void {
    const e = this.einsatz(id);
    if (!e?.gs) throw new Error("Kein Großeinsatz");
    const h = store.get("hospitals", khId);
    if (!h) throw new Error("Krankenhaus nicht gefunden");
    const l = e.gs.voraviso;
    if (an && !l.includes(khId)) l.push(khId);
    if (!an) e.gs.voraviso = l.filter((x) => x !== khId);
    this.log(e, `${an ? "Voraviso an" : "Voraviso zurückgenommen:"} ${h.name}`);
    voravisoSetzen(this.grossschaeden().flatMap((x) => x.gs?.voraviso ?? []).concat(an ? [khId] : []));
    this.emit();
  }

  /** Lagemeldung im Reiter Großeinsatz (vom Disponenten bearbeitet) */
  gsLageText(id: string, text: string): void {
    const e = this.einsatz(id);
    if (!e?.gs) return;
    e.gs.lageText = text.slice(0, 8000);
    this.emit();
  }

  /** Eigene Notiz der Leitstelle in der Zeitleiste des Großeinsatzes */
  gsNotiz(id: string, text: string, von = "Leitstelle"): void {
    const e = this.einsatz(id);
    const s = text.trim().slice(0, 600);
    if (!e?.gs || !s) return;
    e.gs.meldungen.push({ zeit: this.state.zeit, von: von.slice(0, 40), art: "notiz", text: s });
    e.gs.lageText = `${e.gs.lageText ? `${e.gs.lageText}\n\n` : ""}${hhmm(this.state.zeit)} ${von}: ${s}`;
    this.emit();
  }

  /** Zweiter Notruf zum selben Ereignis: kein neuer Einsatz – die Abfrage kommt zum bestehenden Einsatz */
  zusammenlegen(id: string, zuId: string): void {
    const e = this.einsatz(id);
    const z = this.einsatz(zuId);
    if (!e || !z || e === z) throw new Error("Einsatz nicht gefunden");
    if (this.einsatzFz(e).length) throw new Error("Für diesen Einsatz sind schon Fahrzeuge alarmiert");
    e.zusammengelegt = z.id;
    (z.weitereAnrufe ??= []).push({ zeit: this.state.zeit, id: e.id, nummer: e.nummer });
    const a = e.anruf?.antworten ?? {};
    const was = e.anruf?.kapitel ? `Kapitel ${e.anruf.kapitel}` : "";
    this.log(z, `Weiterer Notruf (${e.nummer}) zusammengelegt${was ? `: ${was}` : ""}${a.anzahl_patienten ? `, Betroffene: ${a.anzahl_patienten}` : ""}`);
    this.log(e, `Zusammengelegt mit Einsatz ${z.nummer}`);
    e.zustand = "abgeschlossen";
    e.khAnfrage = null;
    this.emit();
  }

  /** Fahrzeuge eines weiteren Notrufs treffen beim Großschaden ein: sie gehören ab jetzt zum ersten Einsatz */
  protected gsUebernehmen(fz: SimFahrzeug, e: Einsatz, p: Einsatz): void {
    fz.einsatzId = p.id;
    if (!p.fahrzeuge.includes(fz.id)) p.fahrzeuge.push(fz.id);
    this.gsStart(p);
    if (p.gs) p.gs.ziel[fz.id] = "bo";
    if (!e.zusammengelegt) {
      e.zusammengelegt = p.id;
      (p.weitereAnrufe ??= []).push({ zeit: this.state.zeit, id: e.id, nummer: e.nummer });
    }
    this.log(e, `${fz.funkrufname}: gleicher Einsatzort wie ${p.nummer} – übernommen`);
    this.log(p, `${fz.funkrufname} (aus Einsatz ${e.nummer}) am Einsatzort`);
    this.pruefeAbschluss(e);
    if (p.gs && !p.gs.aufgehoben) this.gsEintreffen(fz, p);
    else this.eintreffenLage(fz, p);
  }

  /** Fahrzeug trifft am Berufungsort ein: Sichtmeldung, Übernahme der Einsatzleitung durch den BEL, DispoMobil */
  protected gsEintreffen(fz: SimFahrzeug, e: Einsatz): void {
    const gs = e.gs!;
    const w = e.wahr.gs;
    const t = this.state.zeit;
    gs.ziel[fz.id] = "bo";
    if (!w) {
      // kein Großschaden: die Lage ist kleiner als gemeldet – Bereitstellungsraum wird nicht gebraucht
      gs.aufgehoben = true;
      const br = this.einsatzFz(e).filter((x) => gs.ziel[x.id] === "br");
      for (const x of br) this.freigeben(x);
      const n = e.wahr.lage?.patienten.length ?? 1;
      this.funk(this.rufname(fz), e.id, `kein Großschaden, ${n} Patient${n > 1 ? "en" : ""}${br.length ? ", Fahrzeuge im Bereitstellungsraum werden nicht gebraucht" : ""}`, "info");
      this.log(e, "Kein Großschaden – Bereitstellungsraum aufgelöst");
      fz.phaseEnde = t + rnd(10, 22) * MIN;
      this.eintreffenLage(fz, e);
      return;
    }
    fz.phaseEnde = null;
    if (fz.dispoMobil) {
      gs.dm = fz.id;
      this.gsMelden(fz, e, "info", "DispoMobil am Einsatzort, übernehmen ab jetzt die Krankenhausbuchungen", "info");
      return;
    }
    // Spieler-NAH übernimmt keine Einsatzleitung (er meldet sich und wartet auf die Zuteilung)
    if (fz.pilot) return;
    const elFz = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
    const elDa = !!elFz && elFz.einsatzId === e.id;
    if (fz.rmTyp === "BEL" && !gs.bel) {
      gs.bel = true;
      gs.el = fz.id;
      if (elDa) {
        this.gsMelden(fz, e, "info", `BEL am Einsatzort, übernehme die Einsatzleitung von ${this.rufname(elFz!)}`, "info");
        return;
      }
    } else if (elDa) return;
    gs.el = fz.id;
    if (gs.phase === "alarm") {
      gs.phase = "sicht";
      gs.lageUm = t + rnd(4, 7) * MIN;
      this.log(e, `${fz.funkrufname} als erstes Fahrzeug vor Ort – übernimmt die Einsatzleitung`);
      this.gsMelden(fz, e, "lage", this.gsSichtText(e, w, fz), "sicht");
    }
  }

  /** Meldung der Einsatzleitung über Funk; im Reiter Großeinsatz steht sie, sobald sie gesagt ist */
  protected gsMelden(fz: SimFahrzeug, e: Einsatz, art: FunkAnliegen, text: string, meld: GsLauf["meldungen"][number]["art"]): void {
    this.fzRuft(fz, e, art, text);
    const g = this.leoGespraech(fz.id);
    if (g && !fz.pilot && !e.fremd) (g.gsMeldungen ??= []).push({ art: meld, text });
    else this.gsMeldungDa(e, this.rufname(fz), meld, text);
  }

  /** Meldung ist durchgegeben: in die Liste und (Sicht-/Lagemeldung) ins Feld Lagemeldung */
  protected gsMeldungDa(e: Einsatz, von: string, art: GsLauf["meldungen"][number]["art"], text: string): void {
    const gs = e.gs;
    if (!gs) return;
    const t = this.state.zeit;
    gs.meldungen.push({ zeit: t, von, art, text });
    if (art === "sicht" || art === "lage") gs.lageText = `${gs.lageText ? `${gs.lageText}\n\n` : ""}${hhmm(t)} ${von}: ${text}`;
  }

  protected gsWetterText(): string {
    const dunkel = this.istTag() ? "" : ", Dunkelheit";
    if (!this.settings.wetterAktiv) return `keine Besonderheiten${dunkel}`;
    return `${WETTER_LABEL[lageVon(this.state.wetter.lage)]}, ${Math.round(this.temperatur())} Grad${dunkel}`;
  }

  /** Sichtmeldung (erstes Fahrzeug): die Zahl ist zu Beginn nur geschätzt */
  protected gsSichtText(e: Einsatz, w: GsWahr, fz: SimFahrzeug): string {
    const echt = w.patienten.filter((p) => p.sichtung !== "tot").length + w.unverletzt;
    const streu = Math.max(1, Math.round(echt * 0.15));
    const schaetz = Math.max(3, echt + Math.round(rnd(-streu - 1, streu + 1)));
    const schwer = w.patienten.filter((p) => p.sichtung === "rot").length;
    const schwerS = Math.max(1, schwer + Math.round(rnd(-1, 1.4)));
    const da = (Object.keys(e.partnerDa ?? {}) as PartnerArt[]).map((a) => PARTNER[a].name);
    const kraefte = da.length ? `${da.join(" und ")} vor Ort` : "noch keine weiteren Einsatzkräfte vor Ort";
    return `Sichtmeldung: ${w.art}, Meldung bestätigt. Wir sehen ${w.sicht}. Gefahren: ${w.gefahren.join(", ")}. Geschätzt ca. ${schaetz} Betroffene, davon ca. ${schwerS} schwer verletzt. ${kraefte}. Witterung: ${this.gsWetterText()}. ${this.rufname(fz)} übernimmt die Funktion Einsatzleiter`;
  }

  /** Lagemeldung der Einsatzleitung: genaue Zahlen, Verletzungsmuster, Nachforderung, Zufahrt */
  protected gsLagemeldung(e: Einsatz, w: GsWahr, el: SimFahrzeug): void {
    const gs = e.gs!;
    const p = w.patienten;
    const n = (s: GsPatient["sichtung"]) => p.filter((x) => x.sichtung === s).length;
    const lebend = p.filter((x) => x.sichtung !== "tot").length;
    gs.stufe = nfAusZahl(lebend);
    const muster = [...new Set(p.filter((x) => x.sichtung === "rot" || x.sichtung === "gelb").map((x) => x.muster.split(",")[0].trim()))].slice(0, 3);
    const fehlt = this.gsFehlt(e);
    const brauchen = [fehlt.rtw && `${fehlt.rtw} Rettungsmittel`, fehlt.na && `${fehlt.na} Notarztmittel`].filter(Boolean).join(" und ");
    const partner = w.partner.filter((a) => !e.partner?.[a] && (a !== "ki" || w.unverletzt > 3)).map((a) => (a === "ki" ? `Krisenintervention für die unverletzten Betroffenen` : PARTNER[a].name));
    const text = `Lagemeldung: ${gs.stufe}, ${w.art}. ${lebend} Patienten, davon ${n("rot")} rot, ${n("gelb")} gelb, ${n("gruen")} grün${n("tot") ? `, ${n("tot")} tot` : ""}${w.unverletzt ? `, dazu ${w.unverletzt} unverletzte Betroffene` : ""}. Verletzungsmuster: ${muster.join(", ")}. ${partner.length ? `Benötigen ${partner.join(" und ")}. ` : ""}${brauchen ? `Nachforderung: ${brauchen} in den Bereitstellungsraum` : "Kräfte vorerst ausreichend"}. Zufahrt: ${w.zufahrt}`;
    if (brauchen) {
      this.nachfordern(e, el, { na: fehlt.na, rtw: fehlt.rtw, bit: 0 });
      gs.nachforderungUm = this.state.zeit;
    }
    this.log(e, `Lagemeldung: ${gs.stufe}, ${lebend} Patienten`);
    this.gsMelden(el, e, brauchen ? "nachforderung" : "lage", text, "lage");
  }

  /**
   * Braucht der Patient einen Notarzt? Wie bei den normalen Fällen (nicht nur rot): eine Variante aus dem Fallkatalog mit
   * derselben Verdachtsdiagnose und Sichtung – deren Kompetenz, dazu die Chance, dass die Maßnahmen nicht reichen.
   * Je Patient einmal bestimmt; zeitkritische (Hubschrauber) und bewusstlose Patienten immer.
   */
  protected gsNaBedarf(e: Einsatz, p: GsPatient): boolean {
    const gs = e.gs;
    if (!gs) return p.sichtung === "rot";
    const m = (gs.naBedarf ??= {});
    if (m[p.nr] !== undefined) return m[p.nr];
    let na: boolean;
    if (p.nah || p.bw === "nein") na = true;
    else {
      const alle = alleFaelle().flatMap((f) => f.varianten).filter((v) => v.buchung === p.diagnose && v.p > 0 && !v.tot);
      const gleich = alle.filter((v) => v.sichtung === p.sichtung);
      if (!gleich.length && p.sichtung === "rot") na = true;
      else if (!alle.length) na = false;
      else {
        const l = gleich.length ? gleich : alle;
        let r = Math.random() * l.reduce((a, v) => a + v.p, 0);
        const v = l.find((x) => (r -= x.p) <= 0) ?? l[l.length - 1];
        na = brauchtVon(v) === "NA" || Math.random() < (v.reichtNicht ?? 0);
      }
    }
    m[p.nr] = na;
    return na;
  }

  /** Ist der Transport geregelt (Rettungsmittel, NAH, der fliegt, bzw. Spieler-NAH, der nicht übergibt – oder schon weg)? */
  protected gsTrHat(e: Einsatz, nr: number): boolean {
    const k = this.einsatz(e.gs?.kinder[nr] ?? "");
    if (!k) return false;
    if (k.zustand === "abgeschlossen") return true;
    return this.einsatzFz(k).some((x) => this.transportfaehig(x) || (fliegt(x) && k.nahEntscheid === x.id && (!x.pilot || !x.pilot.plan || x.pilot.plan.art === "transport")));
  }

  /** Hat der Patient einen Notarzt? */
  protected gsNaHat(e: Einsatz, nr: number): boolean {
    const k = this.einsatz(e.gs?.kinder[nr] ?? "");
    if (!k) return false;
    return k.zustand === "abgeschlossen" || this.einsatzFz(k).some((x) => this.mitNotarzt(x));
  }

  /** Hat der Patient alles, was er braucht (Transport und – wenn er einen braucht – Notarzt)? */
  protected gsVersorgt(e: Einsatz, nr: number): boolean {
    const p = e.wahr.gs?.patienten.find((x) => x.nr === nr);
    if (!p || p.sichtung === "tot") return true;
    return this.gsTrHat(e, nr) && (!this.gsNaBedarf(e, p) || this.gsNaHat(e, nr));
  }

  /** Was fehlt für den Abtransport (Rettungsmittel) und die Patienten, die einen Notarzt brauchen? Zählt BO, BR und Anfahrt */
  protected gsFehlt(e: Einsatz): { rtw: number; na: number } {
    const gs = e.gs;
    const w = e.wahr.gs;
    if (!gs || !w || gs.aufgehoben || gs.phase === "ende" || gs.phase === "alarm") return { rtw: 0, na: 0 };
    const offen = w.patienten.filter((p) => p.sichtung !== "tot" && !this.gsVersorgt(e, p.nr));
    const fz = this.einsatzFz(e).filter((x) => !x.dispoMobil);
    const tr = fz.filter((x) => this.transportfaehig(x)).length;
    const na = fz.filter((x) => this.mitNotarzt(x)).length;
    const ohneTr = offen.filter((p) => !this.gsTrHat(e, p.nr));
    const ohneNa = offen.filter((p) => this.gsNaBedarf(e, p) && !this.gsNaHat(e, p.nr)).length;
    // ein NAH, der fliegt, transportiert einen Notarzt-Patienten selbst
    const nah = Math.min(fz.filter((x) => fliegt(x) && (x.pilot || !this.flugHindernis(x))).length, ohneTr.filter((p) => this.gsNaBedarf(e, p)).length);
    return { rtw: Math.max(0, ohneTr.length - tr - nah), na: Math.max(0, ohneNa - na) };
  }

  /** Großschäden: Anrufe, Lagemeldung, Patienten, Abtransport, Abruf aus dem BR, Nachforderung, Ende; Voraviso */
  protected gsTick(t: number): void {
    const vor: string[] = [];
    if (this.state.gsShuttles?.length) this.state.gsShuttles = this.state.gsShuttles.filter((x) => x.bis > t);
    for (const e of this.state.einsaetze) {
      if (e.gsKind || e.gsZu || e.zustand === "abgeschlossen") continue;
      const w = e.wahr.gs;
      if (w) this.gsAnrufeTick(e, w, t);
      const gs = e.gs;
      if (!gs || gs.aufgehoben) continue;
      vor.push(...gs.voraviso);
      if (!w || gs.phase === "ende") continue;
      if (gs.letzterTick && t - gs.letzterTick < 10_000) continue;
      gs.letzterTick = t;
      // Einsatzleiter nicht mehr vor Ort (Fahrzeug transportiert): ein anderes Fahrzeug übernimmt
      const el0 = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
      if (!el0 || el0.einsatzId !== e.id) {
        const neu = this.einsatzFz(e).filter((x) => x.phase === "vorOrt" && !x.dispoMobil && !x.pilot);
        gs.el = (neu.find((x) => x.rmTyp === "BEL") ?? neu[0])?.id ?? null;
      }
      const el = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
      if (gs.phase === "sicht" && gs.lageUm !== null && t >= gs.lageUm && el) {
        gs.phase = "lage";
        gs.lageUm = null;
        gs.aufdeckenUm = t + rnd(0.5, 1.5) * MIN;
        this.gsLagemeldung(e, w, el);
      }
      if (gs.phase !== "lage") continue;
      this.gsErreichbar(e, w);
      this.gsAufdecken(e, w, t);
      this.gsVerstorben(e, w, t);
      this.gsTeamDa(e, t);
      this.gsZuteilen(e, w, t);
      this.gsAbruf(e, w, t);
      this.gsBrLeer(e, t);
      this.gsNachfordern(e, t);
      this.gsEndePruefen(e, w, t);
    }
    voravisoSetzen(vor);
  }

  /** weitere Notrufe zum Ereignis und Anrainer-Anrufe */
  protected gsAnrufeTick(e: Einsatz, w: GsWahr, t: number): void {
    for (const a of w.anrufe) {
      if (a.erzeugt !== undefined || t < a.um) continue;
      a.erzeugt = this.gsAnruf(w, a.i, e)?.id ?? null;
    }
    if (w.anrainer > 0 && w.anrainerUm && t >= w.anrainerUm) {
      w.anrainer--;
      w.anrainerUm = w.anrainer > 0 ? t + rnd(4, 12) * MIN : null;
      void this.gsAnrainer(w);
    }
  }

  /** Patienten, die erst die Feuerwehr befreien bzw. retten muss: erreichbar ab … */
  protected gsErreichbar(e: Einsatz, w: GsWahr): void {
    const gs = e.gs!;
    const fwDa = e.partnerDa?.fw;
    for (const p of w.patienten) {
      if (gs.erreichbar[p.nr] !== undefined) continue;
      if (!p.fw) gs.erreichbar[p.nr] = 0;
      else if (fwDa) gs.erreichbar[p.nr] = fwDa + rnd(w.fwMin[0], w.fwMin[1]) * MIN;
    }
  }

  /** Einsatzleitung meldet die Patienten nach und nach (rot zuerst): je Patient ein eigener Einsatz */
  protected gsAufdecken(e: Einsatz, w: GsWahr, t: number): void {
    const gs = e.gs!;
    if (gs.aufdeckenUm !== null && t >= gs.aufdeckenUm) {
      const rang = { rot: 0, gelb: 1, gruen: 2, tot: 3 };
      const offen = w.patienten.filter((p) => !gs.gezeigt.includes(p.nr)).sort((a, b) => rang[a.sichtung] - rang[b.sichtung] || a.nr - b.nr);
      for (const p of offen.slice(0, Math.random() < 0.5 ? 1 : 2)) {
        gs.gezeigt.push(p.nr);
        if (p.sichtung !== "tot") this.gsKindAnlegen(e, p);
        this.log(e, gsPatientText(p));
      }
      gs.aufdeckenUm = gs.gezeigt.length < w.patienten.length ? t + rnd(20, 60) * 1000 : null;
    }
    // DispoMobil vor Ort: bucht die Krankenhäuser selbst
    const dm = gs.dm ? this.state.fahrzeuge[gs.dm] : undefined;
    if (dm && dm.einsatzId === e.id) {
      for (const nr of gs.gezeigt) {
        const k = this.einsatz(gs.kinder[nr] ?? "");
        if (k && !k.kh && k.zustand !== "abgeschlossen") this.bucheKhAuto(k, this.rufname(dm));
      }
    }
  }

  /** Patient als eigener (verborgener) Einsatz: Buchung, Transport, Protokoll */
  protected gsKindAnlegen(e: Einsatz, p: GsPatient): void {
    const gs = e.gs!;
    if (gs.kinder[p.nr]) return;
    const t = this.state.zeit;
    const k: Einsatz = {
      id: `${e.id}-p${p.nr}`,
      nummer: `${e.nummer}/${p.nr}`,
      erstellt: t,
      zustand: "laufend",
      wahr: {
        lat: e.wahr.lat,
        lon: e.wahr.lon,
        adresse: e.wahr.adresse,
        code: e.wahr.code,
        patientAlter: p.alter,
        transport: true,
        rtwBuchtSelbst: false,
        diagnose: p.diagnose,
        lage: {
          patienten: [{ nr: 1, geschlecht: p.geschlecht, alter: p.alter, bw: p.bw ?? (p.sichtung === "rot" ? "getruebt" : "ja"), at: p.at ?? (p.sichtung === "rot" ? "abnorm" : "normal"), sichtung: p.sichtung as "rot" | "gelb" | "gruen" }],
          gemeldet: 1,
          irrtum: null,
          ereignisse: [],
          aufgedeckt: true,
          verlauf: [],
        },
      },
      meldung: { text: gsPatientText(p), adresse: e.meldung.adresse, adresseFalsch: false },
      abfrage: null,
      code: e.code,
      codeQuelle: e.codeQuelle,
      adresse: e.adresse,
      zusatz: e.zusatz,
      infoRtw: gsPatientText(p),
      infoIntern: "",
      bo: e.bo,
      zo: null,
      kh: null,
      khAnfrage: null,
      rueckrufGemacht: false,
      adressePruefen: false,
      fahrzeuge: [],
      protokoll: [],
      gsKind: { parent: e.id, nr: p.nr, naMit: false },
    };
    k.verdacht = this.verdacht(k);
    this.state.einsaetze.push(k);
    gs.kinder[p.nr] = k.id;
    this.log(k, `Patient ${p.nr} im Großeinsatz ${e.nummer}: ${gsPatientText(p)}`);
  }

  /** Reihenfolge der Patienten: rot, gelb, grün; wer einen Notarzt braucht und zeitkritisch ist, zuerst */
  protected gsReihe(e: Einsatz, l: GsPatient[]): GsPatient[] {
    const rang = { rot: 0, gelb: 1, gruen: 2, tot: 3 };
    return [...l].sort((a, b) => rang[a.sichtung] - rang[b.sichtung] || Number(this.gsNaBedarf(e, b)) - Number(this.gsNaBedarf(e, a)) || Number(!!b.nah) - Number(!!a.nah) || a.nr - b.nr);
  }

  /**
   * Was der Patient braucht, aus diesen Fahrzeugen (der Reihe nach): Notarzt und Transport → NAW, (zeitkritisch) NAH, der
   * fliegt, RTW + NEF, NAH, der fliegt, RTW + NAH, der nicht fliegt; nur Notarzt → NEF, NAH; nur Transport → nach Sichtung
   * (RS- und NKV-RTW gleich). teil: auch nur einen Teil (RTW ohne Notarzt bzw. Notarzt ohne RTW). mitPilot: Spieler-NAH zuerst.
   */
  protected gsWahl(p: GsPatient, need: { tr: boolean; na: boolean }, frei: SimFahrzeug[], o: { teil: boolean; ktw: boolean; mitPilot?: boolean }): SimFahrzeug[] {
    const typ = (l: string[]) => frei.find((x) => l.includes(x.rmTyp));
    const nef = () => frei.find((x) => x.kategorie === "NEF" && !fliegt(x));
    const pilot = () => (o.mitPilot ? frei.find((x) => !!x.pilot && fliegt(x)) : undefined);
    const heli = () => pilot() ?? frei.find((x) => fliegt(x) && !x.pilot && !this.flugHindernis(x));
    const heliSteht = () => frei.find((x) => fliegt(x) && !x.pilot);
    const rtw = () => typ(["RTW-C", "RTW"]) ?? typ(["SRTW"]);
    const trFuer = () =>
      p.sichtung === "gruen" ? (typ(["KTW", "SKTW"]) ?? typ(["RTW", "RTW-C"]) ?? typ(["SRTW", "NAW", "SNAW"])) : (rtw() ?? typ(["NAW", "SNAW"]) ?? (o.ktw ? typ(["KTW", "SKTW"]) : undefined));
    if (need.na && need.tr) {
      const pl = pilot();
      if (pl) return [pl];
      const naw = typ(["NAW", "SNAW"]);
      if (naw) return [naw];
      const h = heli();
      if (h && p.nah) return [h];
      const r = rtw();
      const n = nef();
      if (r && n) return [r, n];
      if (h) return [h];
      const hs = heliSteht();
      if (r && hs) return [r, hs];
      if (!o.teil) return [];
      if (r) return [r];
      const nur = n ?? hs;
      if (nur) return [nur];
      const t = trFuer();
      return t ? [t] : [];
    }
    if (need.na) {
      const n = nef() ?? heli() ?? heliSteht();
      return n ? [n] : [];
    }
    if (need.tr) {
      const t = trFuer();
      return t ? [t] : [];
    }
    return [];
  }

  /**
   * Abtransport planen (Einsatzleitung, ressourcensparend): jeder Patient bekommt, was er braucht – Notarzt nach dem Muster der
   * normalen Fälle, NAH statt RTW + NEF (transportiert selbst, ein RTW beim Patienten wird frei). Zuerst der Spieler-NAH:
   * sein Patient (Wunsch der Leitstelle, sonst rot oder gelb ohne Notarzt, eher die jüngeren). Der Einsatzleiter bleibt, bis der BEL übernimmt.
   */
  protected gsZuteilen(e: Einsatz, w: GsWahr, t: number): void {
    const gs = e.gs!;
    const elFz = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
    // Spieler-NAH: nur, wenn sein Team am Einsatzort ist (Status 3)
    const vorOrt = this.einsatzFz(e).filter((x) => x.phase === "vorOrt" && !x.dispoMobil && x.rmTyp !== "BEL" && x.rmTyp !== "EL ÖBB" && (!x.pilot || (fliegt(x) && x.status === "amBO")));
    // der Einsatzleiter transportiert erst, wenn sonst niemand mehr kommt
    const nochWer = this.einsatzFz(e).some((x) => x !== elFz && this.transportfaehig(x) && x.phase !== "vorOrt");
    let frei = vorOrt.filter((x) => x !== elFz || gs.bel || (!nochWer && !vorOrt.some((y) => y !== elFz && this.transportfaehig(y))));
    const offen = () =>
      this.gsReihe(
        e,
        gs.gezeigt
          .map((nr) => w.patienten.find((p) => p.nr === nr))
          .filter((p): p is GsPatient => !!p && p.sichtung !== "tot" && !this.gsVersorgt(e, p.nr) && (gs.erreichbar[p.nr] ?? Infinity) <= t),
      );
    for (const pl of frei.filter((x) => x.pilot)) {
      const wunsch = gs.pilotWunsch?.[pl.id];
      let p = wunsch !== undefined ? w.patienten.find((x) => x.nr === wunsch && x.sichtung !== "tot" && !!gs.kinder[x.nr]) : undefined;
      if (wunsch !== undefined && (p || !w.patienten.some((x) => x.nr === wunsch && x.sichtung !== "tot"))) delete gs.pilotWunsch![pl.id];
      p ??= offen()
        .filter((x) => (x.sichtung === "rot" || x.sichtung === "gelb") && !this.gsNaHat(e, x.nr))
        .sort((a, b) => Number(this.gsNaBedarf(e, b)) - Number(this.gsNaBedarf(e, a)) || a.alter - b.alter)[0];
      if (!p) continue;
      this.gsPilotZu(e, pl, p);
      frei = frei.filter((x) => x !== pl);
    }
    frei = frei.filter((x) => !x.pilot);
    for (const p of offen()) {
      const k = this.einsatz(gs.kinder[p.nr] ?? "");
      if (!k) continue;
      const naB = this.gsNaBedarf(e, p);
      const need = { tr: !this.gsTrHat(e, p.nr), na: naB && !this.gsNaHat(e, p.nr) };
      const seit = Math.max(k.erstellt, gs.erreichbar[p.nr] ?? 0);
      // Notarzt-Patient: bis zu 8 Minuten auf Notarzt und Transport gemeinsam warten, danach auch nur einen Teil
      const teil = !need.na || !need.tr || t - seit >= 8 * MIN || this.einsatzFz(k).length > 0;
      const fzs = this.gsWahl(p, need, frei, { teil, ktw: t - k.erstellt > 10 * MIN });
      // der Notarzt der Einsatzleitung geht zum Patienten, wenn sonst keiner da ist
      if (need.na && !fzs.some((x) => this.mitNotarzt(x)) && t - seit >= 8 * MIN && elFz && elFz.phase === "vorOrt" && elFz.einsatzId === e.id && this.mitNotarzt(elFz) && !elFz.pilot && !frei.includes(elFz)) fzs.push(elFz);
      if (!fzs.length) continue;
      this.gsZuweisen(e, k, p, fzs, naB);
      frei = frei.filter((x) => !fzs.includes(x));
    }
  }

  /**
   * Fahrzeuge zum Patienten. Kommt ein NAH (fliegt, kein Spieler) dazu, transportiert er: ein RTW, der schon beim Patienten
   * ist, übergibt und bekommt im Einsatz einen neuen Patienten. Kommt sonst etwas dazu, dauert die Versorgung noch etwas.
   */
  protected gsZuweisen(e: Einsatz, k: Einsatz, p: GsPatient, fzs: SimFahrzeug[], naB: boolean): void {
    const t = this.state.zeit;
    const schon = this.einsatzFz(k).filter((x) => !fzs.includes(x));
    const dauer = (schon.length ? rnd(4, 8) : p.sichtung === "rot" ? rnd(10, 18) : p.sichtung === "gelb" ? rnd(6, 12) : rnd(4, 8)) * MIN;
    for (const fz of fzs) {
      fz.einsatzId = k.id;
      if (!k.fahrzeuge.includes(fz.id)) k.fahrzeuge.push(fz.id);
      fz.phase = "vorOrt";
      fz.phaseEnde = t + dauer;
      fz.vorOrtSeit = t;
      fz.zwischenGemeldet = true;
      fz.begleitet = false;
      fz.fuss = null;
      fz.gsPatBr = false;
      // Spieler-NAH: neue Entscheidung für diesen Patienten
      if (fz.pilot) {
        fz.pilot.plan = null;
        this.funk("Einsatzleitung", k.id, `${this.rufname(fz)}: Patient ${p.nr} übernehmen – ${p.muster}`, "warnung");
      }
    }
    const heli = fzs.find((x) => fliegt(x) && (x.pilot || !this.flugHindernis(x)));
    if (heli) k.nahEntscheid = heli.id;
    else if (k.nahEntscheid && !this.einsatzFz(k).some((x) => x.id === k.nahEntscheid)) k.nahEntscheid = undefined;
    if (k.nahEntscheid === undefined) k.nahEntscheid = "";
    for (const x of schon) {
      if (x.phase !== "vorOrt" || x.phaseEnde === null) continue;
      // transportiert der (Computer-)NAH, übergibt der RTW nach kurzer Zeit; sonst gemeinsam weiter
      if (heli && !heli.pilot && this.transportfaehig(x)) x.phaseEnde = t + rnd(2, 4) * MIN;
      else x.phaseEnde = Math.max(x.phaseEnde, t + dauer);
    }
    const mitNa = this.einsatzFz(k).some((x) => this.mitNotarzt(x));
    // ein kleiner Teil der roten Patienten verstirbt trotz Versorgung noch vor Ort
    const stirbt = k.gsKind?.stirbtUm !== undefined ? k.gsKind.stirbtUm : p.sichtung === "rot" && Math.random() < 0.08 ? t + rnd(0.3, 0.9) * dauer : null;
    k.gsKind = { parent: e.id, nr: p.nr, naMit: naB && mitNa, naNoetig: naB, naWartet: k.gsKind?.naWartet ?? null, stirbtUm: stirbt };
    const wer = fzs.map((f) => f.funkrufname).join(" + ");
    this.log(e, `Patient ${p.nr} (${{ rot: "rot", gelb: "gelb", gruen: "grün", tot: "tot" }[p.sichtung]}): ${wer}${schon.length ? " kommt dazu" : ""}${heli && !heli.pilot ? " – Transport mit dem Hubschrauber" : ""}`);
    this.log(k, `${wer} ${schon.length ? "kommt dazu" : "übernimmt den Patienten"}`);
  }

  /** Spieler-NAH übernimmt diesen Patienten (der bisherige bekommt eine andere Ressource; ein anderer Notarzt dort wird frei) */
  protected gsPilotZu(e: Einsatz, pl: SimFahrzeug, p: GsPatient): void {
    const gs = e.gs!;
    const k = this.einsatz(gs.kinder[p.nr] ?? "");
    if (!k) return;
    const alt = pl.einsatzId && pl.einsatzId !== e.id ? this.einsatz(pl.einsatzId) : undefined;
    if (alt === k) return;
    if (alt?.gsKind) {
      if (alt.nahEntscheid === pl.id) alt.nahEntscheid = undefined;
      alt.gsKind.naMit = false;
      this.log(alt, `${pl.funkrufname} wechselt zu Patient ${p.nr} (Leitstelle)`);
      this.log(e, `Patient ${alt.gsKind.nr}: ${pl.funkrufname} wechselt zu Patient ${p.nr} – Patient ${alt.gsKind.nr} bekommt eine andere Ressource`);
      // was dort noch steht, wartet auf den neuen Notarzt bzw. Transport
      for (const x of this.einsatzFz(alt)) if (x !== pl && x.phase === "vorOrt" && x.phaseEnde !== null) x.phaseEnde = Math.max(x.phaseEnde, this.state.zeit + 3 * MIN);
    }
    for (const x of this.einsatzFz(k)) if (x !== pl && this.mitNotarzt(x) && !this.transportfaehig(x)) this.gsInPool(x, k, true);
    this.gsZuweisen(e, k, p, [pl], this.gsNaBedarf(e, p));
  }

  /**
   * Leitstelle weist dem Spieler-NAH (im Reiter Großeinsatz) einen anderen Patienten zu – solange der Pilot noch keinen
   * Zielort gebucht hat; sofortiger Wechsel. Ist sein Team noch nicht am Einsatzort, gilt es beim Eintreffen.
   */
  gsSpielerPatient(id: string, fzId: string, nr: number): void {
    const e = this.einsatz(id);
    const gs = e?.gs;
    if (!e || !gs || gs.aufgehoben) throw new Error("Kein Großeinsatz");
    const fz = this.state.fahrzeuge[fzId];
    if (!fz?.pilot) throw new Error("Kein Spieler-NAH");
    const kid = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    if (fz.einsatzId !== e.id && kid?.gsKind?.parent !== e.id) throw new Error(`${fz.funkrufname} ist nicht bei diesem Großeinsatz`);
    if (fz.pilot.plan?.art === "transport" || fz.status === "zumZO" || fz.status === "amZO") throw new Error(`${fz.funkrufname} hat schon einen Zielort gebucht`);
    const p = e.wahr.gs?.patienten.find((x) => x.nr === nr);
    if (!p || p.sichtung === "tot") throw new Error("Patient nicht gefunden");
    const k = this.einsatz(gs.kinder[nr] ?? "");
    if (k && (k.zustand === "abgeschlossen" || this.einsatzFz(k).some((x) => x.status === "zumZO" || x.status === "amZO"))) throw new Error(`Patient ${nr} ist schon unterwegs ins Krankenhaus`);
    const da = !!k && fz.status === "amBO" && !fz.gsFussBis && (fz.phase === "vorOrt" || fz.einsatzId !== e.id);
    if (!da) {
      (gs.pilotWunsch ??= {})[fz.id] = nr;
      this.log(e, `${fz.funkrufname}: Patient ${nr} vorgemerkt (Leitstelle) – sobald das Team am Einsatzort ist`);
      this.emit();
      return;
    }
    if (gs.pilotWunsch) delete gs.pilotWunsch[fz.id];
    this.gsPilotZu(e, fz, p);
    this.emit();
  }

  /** Fahrzeug ist beim Patienten fertig (übergeben, Notarzt nicht mehr nötig): zurück zur Einsatzleitung für den nächsten */
  protected gsInPool(fz: SimFahrzeug, k: Einsatz, still = false): void {
    const e = k.gsKind ? this.einsatz(k.gsKind.parent) : undefined;
    if (!e?.gs || e.gs.aufgehoben || e.gs.phase === "ende" || e.zustand === "abgeschlossen") return this.freigeben(fz);
    if (k.nahEntscheid === fz.id) k.nahEntscheid = undefined;
    fz.einsatzId = e.id;
    if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id);
    e.gs.ziel[fz.id] = "bo";
    fz.phase = "vorOrt";
    fz.phaseEnde = null;
    fz.begleitet = false;
    fz.fahrt = null;
    fz.gsPatBr = false;
    if (fz.pilot) fz.pilot.plan = null;
    if (fz.status !== "amBO") this.setStatus(fz, "amBO");
    if (!still) this.log(e, `${fz.funkrufname}: Patient ${k.gsKind?.nr ?? ""} übergeben – wieder bei der Einsatzleitung`);
  }

  /** Fertig beim Patienten: im Großschaden zurück zur Einsatzleitung, sonst frei */
  protected fertigBeimPatienten(fz: SimFahrzeug, e: Einsatz): void {
    if (e.gsKind) this.gsInPool(fz, e);
    else this.freigeben(fz);
  }

  /**
   * Fahrzeug zwischen Bereitstellungsraum und Einsatzort (NAH-Team hin bzw. Patient zum Hubschrauber): keine Ressource,
   * auf der Karte wie ein KTW mit dem Rufnamen des Hubschraubers, nur während der Fahrt; Fahrzeit wie ein RTW.
   */
  protected gsShuttleFahrt(fz: SimFahrzeug, e: Einsatz, von: LatLon, nach: LatLon, fertig: (bis: number) => void): void {
    const t0 = this.state.zeit;
    const id = `gs-shuttle-${fz.id}`;
    this.state.gsShuttles = (this.state.gsShuttles ?? []).filter((x) => x.id !== id);
    fertig(t0 + Math.max(60, (distanceM(von, nach) * 1.35) / (45 / 3.6) / this.settings.sondersignalFaktor) * 1000);
    void this.strassenRoute(von, nach)
      .then((r) => {
        const wf = this.settings.wetterAktiv ? fahrFaktor(this.state.wetter.lage, this.temperatur()) : 1;
        const f = this.settings.sondersignalFaktor * wf;
        const jetzt = this.state.zeit;
        const dauer = Math.max(30, r.duration * f);
        const sh: GsShuttle = { id, fzId: fz.id, name: fz.funkrufname, einsatzId: e.id, lat: von.lat, lon: von.lon, fahrt: { coords: r.coords, times: r.times.map((x) => x * f), start: jetzt, dauer, blau: true }, bis: jetzt + dauer * 1000 };
        this.state.gsShuttles = [...(this.state.gsShuttles ?? []).filter((x) => x.id !== id), sh];
        fertig(sh.bis);
        this.emit();
      })
      .catch(() => undefined);
  }

  /** NAH abgerufen: der Hubschrauber bleibt im Bereitstellungsraum (Status 3), ein Fahrzeug bringt das Team zum Einsatzort */
  protected gsTeamZumBo(e: Einsatz, x: SimFahrzeug): void {
    const von = e.gs?.br ?? { lat: x.lat, lon: x.lon };
    if (!e.adresse) return;
    x.gsAmBr = true;
    this.gsShuttleFahrt(x, e, von, e.adresse, (bis) => {
      if (x.einsatzId === e.id && x.gsAmBr && x.phase === "wartetBR") x.gsFussBis = bis;
    });
  }

  /**
   * Abruf aus dem Bereitstellungsraum: die Einsatzleitung ruft für die offenen Patienten, was sie am ehesten brauchen
   * (Notarzt ja/nein wie bei normalen Einsätzen, RS- und NKV-RTW gleich) – zuerst zählt, was schon da ist bzw. kommt.
   * Sammelruf: „75/001, 75/002, NEF Krems von Einsatzleiter, kommen“ → jeder meldet sich → „bitte zum Berufungsort zufahren“.
   */
  protected gsAbruf(e: Einsatz, w: GsWahr, t: number): void {
    const gs = e.gs!;
    if (!e.adresse || (gs.abrufUm && t - gs.abrufUm < 90_000)) return;
    const alle = this.einsatzFz(e);
    let br = alle.filter((x) => x.phase === "wartetBR" && gs.ziel[x.id] !== "bo" && !x.gsFussBis);
    if (!br.length) return;
    // noch keinem Patienten zugeteilt: am Einsatzort bzw. auf dem Weg dorthin
    let pool = alle.filter((x) => !x.dispoMobil && x.rmTyp !== "BEL" && x.rmTyp !== "EL ÖBB" && x.id !== gs.el && (x.phase === "vorOrt" || (gs.ziel[x.id] === "bo" && (x.phase !== "wartetBR" || !!x.gsFussBis))));
    const offen = this.gsReihe(e, w.patienten.filter((p) => p.sichtung !== "tot" && !this.gsVersorgt(e, p.nr)));
    const ruf: SimFahrzeug[] = [];
    for (const p of offen) {
      if (ruf.length >= 6) break;
      const need = { tr: !this.gsTrHat(e, p.nr), na: this.gsNaBedarf(e, p) && !this.gsNaHat(e, p.nr) };
      const gilt = (l: SimFahrzeug[]) => {
        for (const x of l) {
          if (this.transportfaehig(x) || (fliegt(x) && need.na && (x.pilot || !this.flugHindernis(x)))) need.tr = false;
          if (this.mitNotarzt(x)) need.na = false;
        }
      };
      const da = this.gsWahl(p, need, pool, { teil: true, ktw: true, mitPilot: true });
      pool = pool.filter((x) => !da.includes(x));
      gilt(da);
      if (!need.tr && !need.na) continue;
      const neu = this.gsWahl(p, need, br, { teil: true, ktw: true, mitPilot: true });
      br = br.filter((x) => !neu.includes(x));
      ruf.push(...neu);
    }
    if (!ruf.length) return;
    gs.abrufUm = t;
    for (const x of ruf) {
      gs.ziel[x.id] = "bo";
      // NAH: der Hubschrauber bleibt im Bereitstellungsraum, ein Fahrzeug bringt das Team – alle bleiben Status 3
      if (fliegt(x)) this.gsTeamZumBo(e, x);
      else this.fahre(x, e.adresse, "anfahrt", true);
    }
    this.log(e, `Abruf aus dem Bereitstellungsraum: ${ruf.map((x) => x.funkrufname).join(", ")}`);
    const el = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
    if (el && !el.pilot && el.einsatzId === e.id) this.gsSammelruf(e, el, ruf);
  }

  /** Sammelruf der Einsatzleitung: jeder meldet sich der Reihe nach (ein Spieler-NAH selbst – ca. 10 s), dann der Auftrag */
  protected gsSammelruf(e: Einsatz, el: SimFahrzeug, ruf: SimFahrzeug[], nachruf = false): void {
    const ich = this.rufname(el);
    const g = this.fzFunk(el, ruf.find((x) => !x.pilot) ?? ruf[0], e, [
      { von: ich, text: `${ruf.map((x) => this.rufname(x)).join(", ")} von Einsatzleiter, kommen`, fest: true },
      ...ruf.map((x): FunkSatz => (x.pilot ? { von: this.rufname(x), text: "", wartePilot: x.id } : { von: this.rufname(x), text: `Hier ${this.rufname(x)}, kommen`, fest: true })),
      { von: ich, text: `Hier Einsatzleiter, bitte ${ruf.length > 1 ? "alle " : ""}zum Berufungsort zufahren`, fest: true },
    ]);
    if (g && nachruf) g.gsNachruf = true;
  }

  /** Spieler-NAH hat sich im Sammelruf nicht gemeldet: danach einzeln noch einmal rufen */
  protected gsNachrufen(g: FunkGespraech, ids: string[]): void {
    const e = g.einsatzId ? this.einsatz(g.einsatzId) : undefined;
    const el = this.state.fahrzeuge[g.fzId];
    if (!e || !el) return;
    for (const id of ids) {
      const x = this.state.fahrzeuge[id];
      if (x?.pilot && x.einsatzId === e.id) this.gsSammelruf(e, el, [x], true);
    }
  }

  /**
   * Patient verstirbt vor Ort (NACA 7): sein Einsatz endet, die Fahrzeuge gehen ohne Meldung zum nächsten Patienten
   * (sie stehen wieder der Einsatzleitung zur Verfügung).
   */
  protected gsVerstorben(e: Einsatz, w: GsWahr, t: number): void {
    const gs = e.gs!;
    for (const [nr, kid] of Object.entries(gs.kinder)) {
      const k = this.einsatz(kid);
      if (!k?.gsKind?.stirbtUm || k.gsKind.stirbtUm > t || k.zustand === "abgeschlossen") continue;
      const fzs = this.einsatzFz(k);
      // schon auf dem Weg ins Krankenhaus: zu spät für den Wechsel
      if (fzs.some((x) => x.phase !== "vorOrt" || x.status === "zumZO")) {
        k.gsKind.stirbtUm = null;
        continue;
      }
      const p = w.patienten.find((x) => x.nr === Number(nr));
      if (p) p.sichtung = "tot";
      k.gsKind.stirbtUm = null;
      for (const fz of fzs) {
        fz.einsatzId = e.id;
        fz.alarmiertUm = this.state.zeit;
        if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id);
        fz.phase = "vorOrt";
        fz.phaseEnde = null;
        if (fz.pilot) fz.pilot.plan = null;
      }
      // gebuchter Platz wird wieder frei
      k.kh = null;
      this.khPlatzBelegen(k);
      k.zustand = "abgeschlossen";
      k.khAnfrage = null;
      this.log(k, "Patient vor Ort verstorben");
      this.log(e, `Patient ${nr} vor Ort verstorben – ${fzs.map((x) => x.funkrufname).join(" + ") || "Fahrzeuge"} übernehmen den nächsten Patienten`);
    }
  }

  /** NAH-Team ist (mit dem Fahrzeug aus dem Bereitstellungsraum) am Einsatzort: ab jetzt gilt es als vor Ort (Status 3) */
  protected gsTeamDa(e: Einsatz, t: number): void {
    for (const fz of this.einsatzFz(e)) {
      if (!fz.gsFussBis || fz.gsFussBis > t) continue;
      fz.gsFussBis = null;
      fz.phase = "vorOrt";
      fz.phaseEnde = null;
      fz.vorOrtSeit = t;
      if (fz.status !== "amBO") this.setStatus(fz, "amBO");
      this.log(e, `${fz.funkrufname}: Team am Einsatzort (Hubschrauber bleibt im Bereitstellungsraum)`);
    }
  }

  /** Zweiter BEL im Bereitstellungsraum: ist der BR leer (und kommt nichts mehr), meldet er das der Einsatzleitung und rückt ein */
  protected gsBrLeer(e: Einsatz, t: number): void {
    const gs = e.gs!;
    const bel = gs.brBel ? this.state.fahrzeuge[gs.brBel] : undefined;
    if (!bel || bel.einsatzId !== e.id || bel.phase !== "wartetBR") return;
    const nochWer = this.einsatzFz(e).some((x) => x !== bel && gs.ziel[x.id] === "br");
    const nachf = (e.nachforderungen ?? []).some((n) => !n.erledigt);
    if (nochWer || nachf || (gs.brLeerSeit ??= t) > t - 2 * MIN) {
      if (nochWer || nachf) gs.brLeerSeit = null;
      return;
    }
    const el = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
    const ich = this.rufname(bel);
    if (el && el.einsatzId === e.id && !el.pilot) {
      const er = this.rufname(el);
      this.fzFunk(bel, el, e, [
        { von: ich, text: `Einsatzleitung von ${ich}, kommen`, fest: true },
        { von: er, text: `Hier Einsatzleitung, kommen`, fest: true },
        { von: ich, text: `Bereitstellungsraum ist leer, es kommen keine weiteren Kräfte. ${ich} rückt ein, kommen`, fest: true },
        { von: er, text: `Einsatzleitung verstanden, ende`, fest: true },
      ]);
    }
    gs.meldungen.push({ zeit: t, von: ich, art: "info", text: "Bereitstellungsraum leer – rückt ein" });
    this.log(e, `${bel.funkrufname}: Bereitstellungsraum leer – rückt ein`);
    gs.brBel = null;
    this.freigeben(bel);
  }

  /** Nachforderung an die Leitstelle, wenn mehr gebraucht wird als BO, BR und Anfahrt zusammen hergeben */
  protected gsNachfordern(e: Einsatz, t: number): void {
    const gs = e.gs!;
    const el = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
    // Feuerwehr fehlt, aber Patienten sind eingeklemmt bzw. eingeschlossen: alle 8 Minuten erinnern
    const w = e.wahr.gs;
    if (el && w && !e.partner?.fw && w.patienten.some((p) => p.fw && gs.gezeigt.includes(p.nr)) && (!gs.fwErinnert || t - gs.fwErinnert > 8 * MIN)) {
      gs.fwErinnert = t;
      this.gsMelden(el, e, "nachforderung", "Benötigen dringend Feuerwehr – Personen eingeklemmt bzw. eingeschlossen, ohne Feuerwehr kommen wir nicht zu ihnen", "nachforderung");
    }
    if (!el || (gs.nachforderungUm && t - gs.nachforderungUm < 4 * MIN)) return;
    const f = this.gsFehlt(e);
    const offen = (art: "NA" | "RTW") => (e.nachforderungen ?? []).filter((n) => !n.erledigt && n.art === art).reduce((a, n) => a + n.anzahl, 0);
    // nur, wenn mehr fehlt als schon nachgefordert ist (Erinnerungen macht der Funk)
    if (f.rtw <= offen("RTW") && f.na <= offen("NA")) return;
    gs.nachforderungUm = t;
    this.nachfordern(e, el, { na: f.na, rtw: f.rtw, bit: 0 });
    const brauchen = [f.rtw && `${f.rtw} Rettungsmittel`, f.na && `${f.na} Notarztmittel`].filter(Boolean).join(" und ");
    this.gsMelden(el, e, "nachforderung", `Nachforderung: benötigen noch ${brauchen} in den Bereitstellungsraum`, "nachforderung");
  }

  /** Alle Patienten abtransportiert: Bereitstellungsraum auflösen, ein Fahrzeug bleibt, solange die Feuerwehr arbeitet */
  protected gsEndePruefen(e: Einsatz, w: GsWahr, t: number): void {
    const gs = e.gs!;
    if (gs.gezeigt.length < w.patienten.length) return;
    const weg = w.patienten
      .filter((p) => p.sichtung !== "tot")
      .every((p) => {
        const k = this.einsatz(gs.kinder[p.nr] ?? "");
        if (!k) return false;
        return k.zustand === "abgeschlossen" || this.einsatzFz(k).some((x) => x.status === "zumZO" || x.status === "amZO");
      });
    if (!weg) return;
    gs.phase = "ende";
    gs.ende = t;
    gs.voraviso = [];
    for (const n of e.nachforderungen ?? []) n.erledigt = true;
    const fw = this.partnerVon(e).some((u) => u.art === "fw" && u.phase === "vorOrt");
    const el = gs.el ? this.state.fahrzeuge[gs.el] : undefined;
    const bleibt = fw ? (el && el.einsatzId === e.id && el.phase === "vorOrt" && !el.pilot ? el : this.einsatzFz(e).find((x) => x.phase === "vorOrt" && !x.pilot)) : undefined;
    const tot = w.patienten.filter((p) => p.sichtung === "tot").length;
    this.log(e, "Großeinsatz: alle Patienten abtransportiert, Bereitstellungsraum aufgelöst");
    if (el && el.einsatzId === e.id)
      this.gsMelden(el, e, "info", `Alle Patienten abtransportiert${tot ? `, ${tot} Verstorbene vor Ort, Polizei ist informiert` : ""}. Bereitstellungsraum wird aufgelöst${bleibt ? `, ${this.rufname(bleibt)} bleibt bis zum Ende der Feuerwehrarbeiten vor Ort` : ", Einsatzleitung beendet"}`, "lage");
    for (const x of this.einsatzFz(e)) {
      if (x === bleibt) {
        x.phaseEnde = t + rnd(15, 30) * MIN;
        continue;
      }
      this.freigeben(x);
    }
    this.pruefeAbschluss(e);
  }

  /** DispoMobil je Funkgruppe (bei der Leitstelle stationiert) – nur wo es Großschäden gibt */
  protected dispoMobilSync(): void {
    const fg = this.funkgruppe();
    const id = `dm-${fg.id}`;
    for (const k of Object.keys(this.state.fahrzeuge)) if (k.startsWith("dm-") && k !== id && !this.state.fahrzeuge[k].einsatzId) delete this.state.fahrzeuge[k];
    if (this.state.fahrzeuge[id] || !GS_SZENARIEN.some((s) => s.funkgruppe === fg.id)) return;
    const ls = store.list("stations").filter((s) => /leitstelle/i.test(s.typ ?? "") && !/öbb|polizei|flughafen/i.test(`${s.name} ${s.organisation ?? ""}`));
    const mitte = mitteVon(fg);
    const st = ls.find((s) => inFunkgruppe(fg, s.lat, s.lon)) ?? ls.sort((a, b) => distanceM(a, mitte) - distanceM(b, mitte))[0];
    if (!st) return;
    this.state.fahrzeuge[id] = {
      id,
      funkrufname: `DispoMobil ${fg.id.replace(/^NÖ-/, "")}`,
      kurzname: "DispoMobil",
      kategorie: "Sonstige",
      rmTyp: "Sonstige",
      typ: "DispoMobil",
      besetzung: [],
      stationId: st.id,
      stationName: st.name,
      heim: { lat: st.lat, lon: st.lon },
      lat: st.lat,
      lon: st.lon,
      status: "freiWache",
      phase: "frei",
      phaseEnde: null,
      einsatzId: null,
      fahrt: null,
      nachtflug: false,
      begleitet: false,
      dispoMobil: true,
      modell: "t6",
    };
  }

  /**
   * Soll/Ist im Großschaden: ① SEG (1 BEL, 2 NEF, 3 RTW-C/RTW) zum Berufungsort, ② Bereitstellungsraum nach Stufe
   * (Notarztmittel, Rettungsmittel – im Großschaden zählt jedes Rettungsmittel –, weiterer BEL).
   */
  gsSollIst(e: Einsatz): { schritt: "seg" | "br"; seg: GsZeile[]; br: GsZeile[] } | null {
    const gs = e.gs;
    if (!gs || gs.aufgehoben) return null;
    const k = NF_KRAEFTE[gs.stufe ?? "NF5"];
    const fz = (ids: string[]) => ids.map((id) => this.state.fahrzeuge[id]).filter((x): x is SimFahrzeug => !!x);
    const segFz = fz(Object.entries(gs.ziel).filter(([id, z]) => z === "bo" && !(gs.brAlarm ?? []).includes(id)).map(([id]) => id));
    const brFz = fz(gs.brAlarm ?? []);
    const zaehl = (l: SimFahrzeug[], p: (f: SimFahrzeug) => boolean) => l.filter(p).length;
    const seg: GsZeile[] = [
      { art: "BEL", soll: SEG.bel, ist: zaehl(segFz, (f) => f.rmTyp === "BEL") },
      { art: "NEF", soll: SEG.nef, ist: zaehl(segFz, (f) => f.kategorie === "NEF" && !fliegt(f)) },
      { art: "RTW-C/RTW", soll: SEG.rtw, ist: zaehl(segFz, gsRtw) },
    ];
    const br: GsZeile[] = [
      { art: "Notarztmittel", soll: k.na, ist: zaehl(brFz, gsNaMittel) },
      { art: "Rettungsmittel", soll: k.rm, ist: zaehl(brFz, (f) => this.transportfaehig(f)) },
    ];
    if (k.bel) br.push({ art: "weiterer BEL", soll: k.bel, ist: zaehl(brFz, (f) => f.rmTyp === "BEL") });
    return { schritt: gs.segUm ? "br" : "seg", seg, br };
  }

  /** Einsatzmittelvorschlag im Großschaden: ① SEG zum BO (ohne Hubschrauber), danach ② Kräfte für den BR laut Stufe */
  protected gsEmpfehlung(e: Einsatz, nf: NfStufe, liste: Vorschlag[]): { ids: string[]; gruende: string[]; oben?: string[]; fehlt?: string[] } {
    const k = NF_KRAEFTE[nf];
    const nutzbar = liste.filter((v) => v.sekunden !== null && !v.hinweis && !v.kt && !v.fz.dispoMobil && v.fz.einsatzId !== e.id);
    const zweiter = !!e.gs?.segUm;
    const ids: string[] = [];
    const fehlt: string[] = [];
    const nimm = (pruef: (f: SimFahrzeug) => boolean, n: number, hat0: number): number => {
      let hat = hat0 + ids.filter((id) => pruef(this.state.fahrzeuge[id])).length;
      for (const v of nutzbar) {
        if (hat >= n) break;
        if (ids.includes(v.fz.id) || !pruef(v.fz)) continue;
        ids.push(v.fz.id);
        hat++;
      }
      return Math.max(0, n - hat);
    };
    const si = e.gs ? this.gsSollIst(e) : null;
    const ist = (l: GsZeile[] | undefined, art: string) => l?.find((z) => z.art === art)?.ist ?? 0;
    const gruende: string[] = [];
    if (!zweiter) {
      // ① Schnelleinsatzgruppe – kein Hubschrauber (nur wenn du ihn selbst auswählst)
      const bel = nimm((f) => f.rmTyp === "BEL", SEG.bel, ist(si?.seg, "BEL"));
      const nef = nimm((f) => f.kategorie === "NEF" && !fliegt(f), SEG.nef, ist(si?.seg, "NEF"));
      const rtw = nimm(gsRtw, SEG.rtw, ist(si?.seg, "RTW-C/RTW"));
      if (bel) fehlt.push(`${bel} BEL – Alternative: Fahrzeug mit NFS als vorläufige Einsatzleitung`);
      if (nef) fehlt.push(`${nef} NEF – Alternative: NAW oder Notarzthubschrauber (selbst auswählen)`);
      if (rtw) fehlt.push(`${rtw} RTW – Alternative: KTW oder Fahrzeuge aus Nachbarbezirken (Liste scrollen)`);
      gruende.push(`${nf} · Schritt ① Schnelleinsatzgruppe zum Berufungsort: ${SEG.bel} BEL, ${SEG.nef} NEF, ${SEG.rtw} RTW-C/RTW`);
      gruende.push(`danach Schritt ② Bereitstellungsraum: ${k.na} Notarztmittel, ${k.rm} Rettungsmittel${k.bel ? `, ${k.bel} weiterer BEL` : ""}`);
    } else {
      // ② Bereitstellungsraum: Notarztmittel (auch Hubschrauber), Rettungsmittel (RTW vor KTW, im Großschaden zählt jedes)
      // Notarztmittel: bodengebunden zuerst (NEF, NAW), dann Notarzthubschrauber (höchstens zwei im BR)
      const na0 = ist(si?.br, "Notarztmittel");
      let na = nimm((f) => (f.kategorie === "NEF" && !fliegt(f)) || f.rmTyp === "NAW", k.na, na0);
      const nahDa = (e.gs?.brAlarm ?? []).filter((id) => { const f = this.state.fahrzeuge[id]; return !!f && fliegt(f); }).length;
      for (const v of nutzbar) {
        if (na <= 0 || nahDa + ids.filter((id) => fliegt(this.state.fahrzeuge[id])).length >= 2) break;
        if (ids.includes(v.fz.id) || v.fz.rmTyp !== "NAH") continue;
        ids.push(v.fz.id);
        na--;
      }
      const rm0 = ist(si?.br, "Rettungsmittel");
      nimm(gsRtw, k.rm, rm0);
      const rm = nimm((f) => this.transportfaehig(f), k.rm, rm0);
      const bel = k.bel ? nimm((f) => f.rmTyp === "BEL", k.bel, ist(si?.br, "weiterer BEL")) : 0;
      if (na) fehlt.push(`${na} Notarztmittel – Alternative: NAW, Hubschrauber oder NEF aus Nachbarbezirken (Liste scrollen)`);
      if (rm) fehlt.push(`${rm} Rettungsmittel – Alternative: KTW, BKTW bzw. Fahrzeuge aus Nachbarbezirken (Liste scrollen)`);
      if (bel) fehlt.push(`${bel} BEL – Alternative: aus dem Nachbarbezirk`);
      gruende.push(`${nf} · Schritt ② Bereitstellungsraum: ${k.na} Notarztmittel, ${k.rm} Rettungsmittel${k.bel ? `, ${k.bel} weiterer BEL` : ""}`);
      if (!e.gs?.br) gruende.push("Zuerst den Bereitstellungsraum festlegen (Reiter Großeinsatz) – erst dann kann in den BR alarmiert werden");
    }
    gruende.push("Krisenintervention und DispoMobil bei Bedarf selbst alarmieren (fahren direkt zum Berufungsort)");
    return { ids: zweiter && !e.gs?.br ? [] : ids, gruende, fehlt };
  }

  // ------------------------------------------------------------------ Partner-Organisationen

}
