// Pilotenansicht – Logik aus dem Entwurf „Pilot“ (LeitWerk Arbeitsplatz, 09.11.), Hauptteil neu mit Beta 64
// (Entwurf Beta 64, Paul 17.11.2026): Leiste Einsätze · Status · Einstellungen, Einsatzliste links, Einsatz bzw. „Zielort buchen“
// Schritt für Schritt in der Mitte, Karte rechts; Status gedrückt halten wie bisher; der echte Funk im Reiter „Status“.
// Aufbau, fließende Größen, Schubladen (Wetter, Update, Fehler melden, Spiel) und Aufklappen wie im Entwurf;
// die Inhalte (Hubschrauber, Status, Einsatz, Patient, Buchung, Großeinsatz, Cockpit) kommen echt aus dem Spiel:
// this.props.app.daten() liefert den Stand, this.props.app.a die Aktionen (siehe pilotView.ts › ansichtDaten).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";
import { marke } from "./marke.js";

export class PilotLogik extends DCLogic {
  constructor(p) {
    super(p);
    this.state = {};
    this.mitteRef = { current: null };
    this.ak = 0;
    this.akKey = "";
  }

  /** Schublade schließen (mit Animation: erst fährt das Fenster hoch, dann wird der Reiter wieder zum Knopf) */
  schubladeZu() {
    const S = this.state;
    if (S.wx) return this.wetterUmschalten();
    if (!S.pp || S.ppZuIst) return;
    clearTimeout(this.pt);
    this.setState({ ppZuIst: true });
    this.pt = setTimeout(() => this.setState({ pp: "", ppZuIst: false, ppNach: true }), 500);
    setTimeout(() => this.setState({ ppNach: false }), 900);
  }

  wetterUmschalten() {
    const S = this.state;
    clearTimeout(this.zt);
    if (!S.wx) {
      clearTimeout(this.zn);
      this.setState({ wx: true, wxZu: false, wxNach: false, pp: "", ppZuIst: false });
    } else {
      this.setState({ wxZu: true });
      this.zt = setTimeout(() => {
        this.setState({ wx: false, wxZu: false, wxNach: true });
        this.zn = setTimeout(() => this.setState({ wxNach: false }), 420);
      }, 470);
    }
  }

  /** irgendeine Schublade offen? */
  offen() {
    return !!(this.state.wx || this.state.pp);
  }

  toast(t) {
    clearTimeout(this.tt);
    this.setState({ toast: t });
    this.tt = setTimeout(() => this.setState({ toast: "" }), 2200);
  }

  /** Zielort buchen, Schritt für Schritt (Entwurf Beta 64): füllt b mit den Werten für die Vorlage */
  buchen(b, E, A, S) {
    const bs = S.bs || "art";
    const seite = E.seite;
    const folge = seite === "kein" ? ["art", "kein"] : seite === "rtw" || seite === "naMit" ? ["art", "wer", "alter", "symptom", "dring", "vorschlag"] : ["art", "alter", "symptom", "dring", "vorschlag"];
    const idx = bs === "manuell" ? folge.indexOf("vorschlag") : Math.max(0, folge.indexOf(bs));
    const geh = (x) => this.setState({ bs: x, khHov: "" });
    const fertig = (t) => { this.setState({ buchen: false, bs: "art", khWahl: "", khHov: "" }); if (t) this.toast(t); };
    const NAME = { art: "Transportart", kein: "Endegrund", wer: "Wer bucht", alter: "Alter", symptom: "Symptom", dring: "Dringlichkeit", vorschlag: "Vorschläge", manuell: "Manuell buchen" };
    const opt = (o) => ({ d: "", r: "", st: "", merk: null, rein: null, raus: null, ...o, cls: "pvn-o" + (o.on ? " an" : "") + (o.extra || "") });
    Object.assign(b, { bSchrittT: "Schritt " + (idx + 1) + " von " + folge.length + " · " + NAME[bs], bBalken: folge.map((x, i) => (i <= idx ? "an" : "")), bFrage: "", bHinweis: "", bSuche: false, bOpt: null, bLeer: "", bManuell: null, bAbschluss: null, bAbText: "", bAbCls: "kn prim pvn-ab", bFuss: "", bTreffer: null, bQ: "", bPh: "", bSucheCls: "pvn-such" });
    b.bAbbrechen = () => fertig("");
    b.bZurueck = () => { if (bs === "manuell") return geh("vorschlag"); const i = folge.indexOf(bs); if (i > 0) geh(folge[i - 1]); else fertig(""); };
    // Auswahl bisher (als Chips)
    const aus = [];
    const w = E.wahl.find((x) => x.on);
    if (w && idx > 0) aus.push(w.t);
    if (idx > folge.indexOf("alter") && folge.indexOf("alter") >= 0) { const a = E.altW.find((x) => x.on); if (a) aus.push(a.t); }
    if (idx > folge.indexOf("symptom") && folge.indexOf("symptom") >= 0 && E.schritte[1] && E.schritte[1].wert !== "–") aus.push(E.schritte[1].wert);
    if (idx > folge.indexOf("dring") && folge.indexOf("dring") >= 0 && E.schritte[2]) aus.push(E.schritte[2].wert);
    b.bAuswahl = aus.length ? aus : null;
    if (bs === "art") {
      b.bFrage = "Transportart oder Endegrund";
      b.bOpt = E.wahl.map((x) => opt({ t: x.t, d: x.d, on: x.on, klick: () => { x.klick(); geh(x.id === "kein" ? "kein" : x.id === "rtw" || x.id === "naMit" ? "wer" : "alter"); } }));
    } else if (bs === "kein") {
      b.bFrage = "Endegrund";
      b.bHinweis = "Kein Transport – warum? Danach frei über Funk (6).";
      b.bOpt = (E.keinWahl || []).map((x) => opt({ t: x.t, d: x.s, on: x.on, klick: () => { x.klick(); fertig("Endegrund gebucht – danach frei über Funk (6)"); } }));
    } else if (bs === "wer") {
      b.bFrage = "Wer bucht das Krankenhaus?";
      if (E.rtwFehlt) b.bHinweis = "Noch kein RTW im Einsatz – bitte bei der Leitstelle anfordern (Funk oder Chat).";
      else b.bOpt = [
        opt({ t: "Übergeben – RTW bucht selbst", d: "Der RTW wählt das Krankenhaus, ihr meldet euch danach frei (6)", on: !!(E.rtwWahl && E.rtwWahl.on), klick: () => { A.rtwBucht(); fertig("Übergabe gebucht – der RTW bucht selbst"); } }),
        opt({ t: "Selbst buchen", d: "Du wählst das Krankenhaus, der RTW fährt hin", klick: () => geh("alter") }),
      ];
    } else if (bs === "alter") {
      b.bFrage = "Wie alt ist der Patient?";
      b.bOpt = E.altW.map((x) => opt({ t: x.t, d: x.s, on: x.on, klick: () => { x.klick(); geh("symptom"); } }));
    } else if (bs === "symptom") {
      b.bFrage = "Symptom";
      b.bHinweis = E.symHinweis;
      b.bSuche = true; b.bQ = E.symQ; b.bPh = "Symptom suchen, z. B. Atemnot, Brustschmerz, Polytrauma";
      b.bTippen = (ev) => A.symSuche(ev.target.value);
      b.bTaste = (ev) => { if (ev.key === "Enter" && E.symW[0]) { E.symW[0].klick(); geh("dring"); } };
      b.bTreffer = E.symQ.trim() && E.symW.length ? E.symW.map((x) => ({ t: x.t, d: x.kat || "", klick: () => { x.klick(); geh("dring"); } })) : null;
      b.bSucheCls = "pvn-such" + (b.bTreffer ? " auf" : "");
      const gew = E.schritte[1] && E.schritte[1].wert !== "–" ? E.schritte[1].wert : "";
      if (gew && !E.symQ.trim()) b.bOpt = [opt({ t: gew, d: "gewählt – weiter mit der Dringlichkeit", on: true, klick: () => geh("dring") })];
    } else if (bs === "dring") {
      b.bFrage = "Dringlichkeit";
      b.bHinweis = E.schritte[1] && E.schritte[1].wert !== "–" ? "Für „" + E.schritte[1].wert + "“ möglich:" : "";
      const F = { 10: ["#2e9d4a", "#ffffff"], 20: ["#f57c00", "#15181c"], 30: ["#d32f2f", "#ffffff"] };
      b.bOpt = E.drW.map((x) => opt({ t: x.t, d: x.s, on: x.on, extra: " farbig", st: "background:" + F[x.id][0] + ";color:" + F[x.id][1] + ";border-color:" + F[x.id][0] + ";", klick: () => { x.klick(); geh("vorschlag"); } }));
    } else if (bs === "vorschlag" || bs === "manuell") {
      const man = bs === "manuell";
      const liste = man ? E.khAndere || [] : E.khs;
      const wahl = liste.find((h) => h.id === S.khWahl) || (!man && E.gebuchtId ? liste.find((h) => h.id === E.gebuchtId) : null) || null;
      b.bFrage = man ? "Manuell buchen" : "Vorschläge";
      b.bHinweis = man ? "Krankenhaus eintippen – alle Häuser, ohne Vorschlag" : "passend zu Alter, Symptom und Dringlichkeit, nach Entfernung";
      if (man) { b.bSuche = true; b.bQ = E.andereQ; b.bPh = "Krankenhaus suchen, z. B. Tulln, AKH, Horn"; b.bTippen = (ev) => A.andereSuche(ev.target.value); b.bTaste = () => {}; }
      b.bOpt = liste.length ? liste.map((h, i) => opt({ t: (man ? "" : i + 1 + " · ") + h.n, d: h.km + h.min, on: wahl && wahl.id === h.id,
        merk: [...(h.merk || []).map((m) => ({ t: m.t, c: m.c || "" })), ...(h.frei ? [{ t: h.frei, c: h.freiCls && /rot/.test(h.freiCls) ? "rot" : h.freiCls && /gelb/.test(h.freiCls) ? "gelb" : "ok" }] : [])],
        r: E.gebuchtId === h.id ? "gebucht " + (E.gebuchtT || "") : "",
        klick: () => this.setState({ khWahl: h.id }), rein: () => this.setState({ khHov: h.id }), raus: () => { if (this.state.khHov === h.id) this.setState({ khHov: "" }); } })) : null;
      b.bLeer = man ? (E.andereQ.trim() && !liste.length ? "Nichts gefunden – anders eintippen." : "") : E.khLeer;
      if (!man) b.bManuell = () => geh("manuell");
      b.bAbText = wahl ? (E.gebuchtId === wahl.id ? wahl.n + " ist gebucht" : wahl.n + " buchen") : "Krankenhaus wählen";
      b.bAbCls = "kn prim pvn-ab" + (wahl && E.gebuchtId !== wahl.id ? "" : " aus");
      b.bAbschluss = () => { if (!wahl || E.gebuchtId === wahl.id) return; A.khBuchen(wahl.id); fertig(wahl.n + " gebucht – Platz belegt"); };
      b.bFuss = "Die Buchung belegt einen Platz im Krankenhaus – wie in der Leitstelle.";
      if (!man) { this.karteZeigt = true; A.karteVorschlag(E.khs.map((h) => h.id), S.khHov || (wahl ? wahl.id : "")); }
    }
    if (bs !== "vorschlag" && this.karteZeigt) { this.karteZeigt = false; A.karteVorschlag([], ""); }
  }

  renderVals() {
    const S = this.state || {}, P = this.props;
    const A = P.app.a;
    const D = P.app.daten();
    const B = Number(P.breite) || 1920, H = Number(P.hoehe) || 1080;
    const thema = P.thema === "hell" ? "hell" : "dunkel";
    const G = !!D.gs;
    const kompakt = B < 1500;

    // ---- Status-Tasten (gedrückt halten, ca. 2 s)
    const stl = D.stl.map((s) => ({
      n: s.n, t: kompakt ? s.kurz : s.t, k: s.k, f: s.f,
      cls: "pv-sb" + (s.aktiv ? " aktiv" : "") + (s.halten ? " halten" : "") + (s.leise ? " leise" : "") + (s.aus ? " aus" : ""),
      tip: "Gedrückt halten (ca. 2 Sekunden), bis der Status durchgeht" + (s.k ? " – oder Taste " + s.k : ""),
      an: (ev) => { if (ev && ev.button) return; try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch (e) {} A.statusAn(s.key); },
      ab: () => A.statusAb(s.key),
      kein: (ev) => ev.preventDefault(),
    }));

    // ---- Phasenleiste
    const PHT = D.phasen.titel, PHK = D.phasen.kurz, pj = D.phasen.i;
    const phasen = PHT.map((t, i) => ({ t: (B < 1500 && G) || B < 1300 ? PHK[i] : t, tip: t, i: i < pj ? "✓" : String(i + 1), cls: "pv-ph" + (i < pj ? " fertig" : i === pj ? " jetzt" : "") }));

    // ---- Cockpit (je Zeile aufklappbar)
    const ckOffen = S.ck !== undefined ? S.ck : (D.cockpit[0] ? D.cockpit[0].k : "");
    const cockpit = D.cockpit.map((c) => ({
      ...c, auf: ckOffen === c.k, exp: ckOffen === c.k ? "true" : "false", cls: "pv-ck" + (ckOffen === c.k ? " auf" : ""),
      knoepfe: (c.knoepfe || []).map((k) => ({ t: k.t, cls: "kn sm" + (k.prim ? " prim" : "") + (k.an ? " an" : ""), klick: k.klick })),
      klick: () => this.setState({ ck: ckOffen === c.k ? "" : c.k }),
    }));

    // ---- Layout (Beta 64): Leiste | Liste | Mitte | Karte – fließend nach Breite; hochkant liegt die Karte unten
    const eins = B < 760;
    const stapel = !eins && H > B * 1.15 && B < 1400;
    const ohneListe = eins || B < 1000;
    const tab = S.tab || "einsaetze";
    const lw = ohneListe ? 0 : B >= 1500 ? 316 : 268;
    const rb = eins || stapel ? 0 : Math.min(560, Math.max(340, Math.round(B * 0.3)));
    const hauptCls = "pv-haupt pvn" + (ohneListe ? " ohne-liste" : "") + (stapel ? " stapel" : "") + (eins ? " eins" : "") + (eins && tab === "karte" ? " nur-karte" : "");

    // ---- Statustasten 1–9 (7 gibt es nicht: sichtbar, aber gesperrt)
    const nachN = {};
    stl.forEach((x) => (nachN[x.n] = x));
    const tasten = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => n === "7" ? { gesperrt: true, da: false } : nachN[n] ? { ...nachN[n], t: (D.stl.find((x) => x.n === n) || {}).t || nachN[n].t, da: true, gesperrt: false, miniCls: nachN[n].cls + " pvn-m", grossCls: nachN[n].cls + " pvn-g" } : null).filter(Boolean);

    // ---- Einsatzliste: der laufende zuerst; ein neuer Einsatz wird von selbst gewählt
    const L = D.liste || [];
    if (D.aktId !== this.letzteAkt) {
      this.letzteAkt = D.aktId;
      if (D.aktId) { this.state.sel = D.aktId; this.state.buchen = false; }
    }
    const sel = S.sel && L.some((e) => e.id === S.sel) ? S.sel : D.aktId || (L[0] && L[0].id) || "";
    const it = L.find((e) => e.id === sel) || null;
    const istAkt = !!it && !!it.laeuft;
    const gebucht = !!D.planT;
    const liste = L.map((e) => {
      const an = e.id === sel;
      const zielKurz = e.laeuft ? (gebucht ? "gebucht" : e.kt ? "Ziel fest" : "Zielort offen") : e.ziel ? (e.ziel === "Kein Transport" || e.ziel === "Übergabe" ? e.ziel : "→ " + e.ziel) : "beendet";
      return { ...e, mk: marke(e.stufe), klick: () => this.setState({ sel: e.id, buchen: false, tab: "einsaetze" }), cls: "pvn-e" + (an ? " an" : "") + (e.laeuft ? " laeuft" : ""), sCls: "pvn-s" + (an ? " an" : ""), aktuell: an ? "true" : "false",
        zustand: e.laeuft ? "LÄUFT" : "BEENDET", zcls: "pvn-zu" + (e.laeuft ? " l" : ""), zielKurz, zielCls: "pvn-zk" + (e.laeuft ? (gebucht || e.kt ? " ok" : " offen") : "") };
    });
    const vl = (arr) => (arr || []).map((v) => {
      if (!v.abf) return { ...v, text: true, abf: null };
      const auf = !!(S.abf || {})[v.key];
      return { ...v, text: false, abfAuf: auf, abfCls: "pvn-abfk" + (auf ? " auf" : ""), pfeil: auf ? "▴" : "▾", abfKlick: () => this.setState({ abf: { ...(this.state.abf || {}), [v.key]: !auf } }) };
    });
    const zeitenL = (z) => (z || []).map((x) => ({ ...x, cls: "pvn-zr" + (x.leer ? " leer" : "") }));
    const E = D.ent;
    const ein = D.ein || {};
    let d = null;
    if (it && istAkt) {
      d = { mk: marke(ein.stufe || it.stufe), code: ein.code || it.code, sw: ein.sw || it.sw, meta: ein.nr || "Nr. " + it.nr, zustand: "LÄUFT", zcls: "pvn-zu l", meldebild: it.meldebild,
        zi: !!ein.zi, ziB: ein.ziB || "", ziS: ein.ziS || "", ziT: ein.ziT || "", gsText: ein.gsText || "", fzs: D.fzs && D.fzs.length ? D.fzs : null, stufe: ein.stufe || "–", gruppe: D.gruppe || "",
        adr: ein.adr || it.adr, zusatz: ein.zusatz || "", fl: D.fl ? D.fl.km + " · " + D.fl.t : "", nav: D.nav && D.nav.length ? D.nav : null, ortT: D.gs ? "Einsatzort und Bereitstellungsraum" : D.kt ? "Abholort und Ziel" : "Berufungsort",
        patZu: D.patZu || "", pats: D.pats && D.pats.length ? D.pats : null, patVerlauf: D.patVerlauf && D.patVerlauf.length ? D.patVerlauf : null, keinPat: !D.patZu && !(D.pats && D.pats.length),
        zeiten: zeitenL(D.zeiten), verlauf: vl(D.verlauf),
        zielT: D.planT || (D.kt ? it.ziel : ""), zielArt: D.kt ? "Überstellung – das Ziel steht fest" : "", zielTag: gebucht ? "gebucht" : D.kt ? "Ziel fest" : "offen",
        zielTagCls: "pvn-tag " + (gebucht || D.kt ? "ok" : "gelb"), zielCls: "pv-k pvn-ziel" + (gebucht || D.kt ? " ok" : " offen"),
        buchbar: !!E, buchT: gebucht ? "Ändern" : "Zielort buchen",
        buchHinweis: E ? (gebucht ? "Ändern geht, solange ihr am Einsatzort seid." : "") : D.kt ? "" : D.gs && D.st.n === "3" ? "Buchen geht, sobald euch die Einsatzleitung einen Patienten zugeteilt hat." : gebucht ? "Ändern geht nur am Einsatzort (Status 3)." : "Buchen geht am Einsatzort (Status 3)." };
    } else if (it) {
      d = { mk: marke(it.stufe), code: it.code, sw: it.sw, meta: "Nr. " + it.nr + " · " + it.datum + " " + it.zeit, zustand: "BEENDET", zcls: "pvn-zu", meldebild: it.meldebild, zi: false, ziB: "", ziS: "", ziT: "", gsText: "", fzs: null,
        stufe: it.stufe || "–", gruppe: "", adr: it.adr, zusatz: it.zusatz, fl: "", nav: null, ortT: "Berufungsort", patZu: [it.patient ? "Patient " + it.patient : "", it.patText || ""].filter(Boolean).join(" · "), pats: null, patVerlauf: null, keinPat: !it.patient && !it.patText,
        zeiten: zeitenL(it.zeiten), verlauf: vl(it.verlauf), zielT: it.ziel || "–", zielArt: it.zielArt || "", zielTag: "beendet", zielTagCls: "pvn-tag", zielCls: "pv-k pvn-ziel", buchbar: false, buchT: "", buchHinweis: "" };
    }

    // ---- Zielort buchen, Schritt für Schritt (Transportart oder Endegrund → Alter → Symptom → Dringlichkeit → Vorschläge)
    const buchenAn = tab === "einsaetze" && !!S.buchen && istAkt && !!E;
    const b = {};
    if (buchenAn) this.buchen(b, E, A, S);
    else if (this.karteZeigt) { this.karteZeigt = false; A.karteVorschlag([], ""); }

    // ---- Wechsel in der Mitte: kurz einblenden (nur Deckkraft), oben anfangen
    const key = tab + "|" + sel + "|" + (buchenAn ? S.bs || "art" : "");
    if (key !== this.akKey) {
      if (this.akKey) this.ak++;
      this.akKey = key;
      const m = this.mitteRef;
      setTimeout(() => { if (m.current) m.current.scrollTop = 0; }, 0);
    }
    const animN = this.ak ? (this.ak % 2 ? "pvn-ein-a" : "pvn-ein-b") : "none";

    // ---- Einstellungen: die echten Dialoge des Spiels
    const dlg = (n) => () => A.dialog(n);
    const spielZ = (D.spiel || []).filter((z) => z.t !== "Einstellungen" && z.t !== "Hubschrauber wechseln").map((z) => ({ t: z.t, h: z.i, k: z.t === "Zum Hauptmenü" ? "Verlassen …" : "Öffnen …", cls: "kn sm" + (z.gefahr ? " gefahr" : ""), klick: () => z.klick() }));
    const einst = [
      { t: "Funk", z: [
        { t: "Sprechfunk", h: "Mikrofon, Spracherkennung, Lautstärken, Mithören, echte Mitspieler", k: "Öffnen …", klick: dlg("funk") },
        { t: "Tasten und Joystick", h: "Statustasten (gedrückt halten), Sprechtaste, Funk zum RTW, Übungsflug", k: "Öffnen …", klick: dlg("tasten") } ] },
      { t: "Melder und Handy", z: [
        { t: "Alarmtöne", h: "Ton für Alarmierung und Abruf aus dem Bereitstellungsraum, eigene Töne, Lautstärke", k: "Öffnen …", klick: dlg("alarm") },
        { t: "Handy als Statusgerät", h: "Status und Sprechtaste vom Handy – gleiches WLAN", k: "Koppeln …", klick: dlg("handy") } ] },
      { t: "Flugsimulator", z: [
        { t: "Einrichtung", h: "MSFS 2024, X-Plane, H145-Tablet und -Funkgerät, GTN750, EFB-App", k: "Öffnen …", klick: dlg("einrichtung") },
        { t: "Wetter im Flugsimulator", h: "wie LeitWerk oder selbst einstellen", k: "Öffnen …", klick: dlg("wetter") } ] },
      { t: "Spiel", z: [
        { t: "Pilot und Flugsimulator", h: "alle Einstellungen wie im Spielmenü", k: "Öffnen …", klick: dlg("seite") },
        { t: "Hubschrauber wechseln", h: D.heli.zeile || "einen anderen Hubschrauber übernehmen", k: "Wechseln …", klick: () => A.hubschrauberWechseln() },
        ...spielZ ] },
    ].map((g) => ({ ...g, z: g.z.map((z) => ({ cls: "kn sm", ...z })) }));

    const kein = D.heli.name === "Kein Hubschrauber";
    const reiter = [{ id: "einsaetze", t: "Einsätze" }, { id: "status", t: "Status" }, { id: "einst", t: "Einstellungen" }, ...(eins ? [{ id: "karte", t: "Karte" }] : [])].map((r) => ({
      ...r, cls: "pvn-r" + (tab === r.id ? " an" : ""), aktuell: tab === r.id ? "page" : "false", istEinsatz: r.id === "einsaetze", istStatus: r.id === "status", istEinst: r.id === "einst", istKarte: r.id === "karte",
      punkt: r.id === "einsaetze" && tab !== "einsaetze" && !!D.alarm, klick: () => this.setState({ tab: r.id, buchen: r.id === "einsaetze" ? this.state.buchen : false }) }));
    // Funk im Reiter „Status“: feste Höhe (das Funkfenster rechnet mit ihr), unter den Statustasten bis zum Rand
    const funkH = Math.max(420, H - 52 - 50 - (D.alarm ? 66 : 0) - (D.warte ? 34 : 0) - 290);
    const haupt = {
      hauptCls, rb, lw, funkH, reiter, liste, tasten, mitteRef: this.mitteRef, animN, d, ...b,
      listeZahl: L.length ? String(L.length) : "", listeLeer: !L.length, listeLeerT: kein ? "Noch kein Hubschrauber gewählt." : "Noch keine Einsätze in dieser Sitzung.",
      zeigeListe: !ohneListe, zeigeStreifen: ohneListe && tab === "einsaetze" && L.length > 0, zeigeKarte: !eins || tab === "karte",
      zeigeLeer: tab === "einsaetze" && !it, leerT: kein ? "Kein Hubschrauber" : "Kein Alarm", leerU: kein ? "Wähle deinen Hubschrauber – dann kommen die Einsätze hierher." : D.warte || "Bereitschaft. Neue Einsätze erscheinen hier von selbst, der Melder klingelt.",
      leerKnopf: kein, leerKlick: () => A.hubschrauberWechseln(),
      zeigeEinsatz: tab === "einsaetze" && !!it && !buchenAn, zeigeBuchen: buchenAn, zeigeStatus: tab === "status", zeigeEinst: tab === "einst", einst,
      buchenAuf: () => this.setState({ buchen: true, bs: "art", khWahl: "", khHov: "" }),
    };
    // ---- Kopf: Wetter, Update, Fehler, Spiel (Schubladen) – Platz in der Kopfzeile
    const wxAuf = !!S.wx;
    const pp = S.pp || "";
    const Bk = B - (D.upd ? 320 : 0) - ((wxAuf || S.wxNach) ? 330 : (pp || S.ppNach) ? 430 : 0);
    const W = D.wx;
    const FL = { ok: "möglich", gelb: "eingeschränkt", rot: "kein Flug" };

    // ---- Zeitraffer und Verbindung
    const Z = D.zr;
    const U = D.upd;

    return {
      B, H, thema,
      wCls: "ap pv" + (B < 760 ? " s1" : "") + (B < 560 || Bk < 300 ? " s2" : ""),
      lang: B >= 1100,
      markeCls: "pv-marke" + (pp === "spiel" ? " offen" : ""),
      markeKlick: () => { const aa = (this.props.app && this.props.app.a) || {}; if (typeof aa.spielmenue === "function") { aa.spielmenue(); return; } if (pp === "spiel") this.schubladeZu(); else { clearTimeout(this.pt); this.setState({ pp: "spiel", ppZuIst: false, wx: false }); } },
      spielListe: D.spiel.map((z, d) => ({ ...z, d, cls: "kl-p kl-z" + (z.gefahr ? " gefahr" : ""), klick: () => { this.schubladeZu(); z.klick(); } })),
      heli: D.heli, heliZeile: B >= 1100 && !!D.heli.zeile,
      st: D.st,
      uhr: D.uhr,
      // Wetter: dasselbe Fenster wie in der Kopfleiste (Inhalt zeichnet pilotView nach dem Zeichnen hinein)
      wx: W,
      wxCls: "pv-wx" + (wxAuf ? " offen" : ""), wxKlick: () => this.wetterUmschalten(), wxZu: S.wxZu ? " zu" : "", wxReiter: wxAuf ? " reiter" + (S.wxZu ? " schliesst" : "") : "", wxOffen: wxAuf,
      flugCls: "pv-flug " + W.flug,
      wxT: Bk >= 1200 ? W.lang : W.grad,
      flugKT: Bk < 640 ? { ok: "✓", gelb: "!", rot: "✕" }[W.flug] : Bk < 900 ? { ok: "Flug ok", gelb: "eingeschränkt", rot: "kein Flug" }[W.flug] : "Flug " + FL[W.flug].replace("kein Flug", "gesperrt"),
      wmax: Math.max(220, H - 52 - 10 - 160),
      zrCls: "pv-pill pv-verb" + (Z.gelb ? " gelb" : "") + (Bk < 600 ? " ein" : ""), zrTip: Z.tip,
      zrA: B < 560 ? "" : B >= 1250 ? Z.a : "", zrX: Z.x, zrB: B >= 1250 ? Z.b : "", zrC: Z.c,
      verbCls: "pv-pill pv-verb" + (D.verb.gelb ? " gelb" : "") + (Bk < 900 ? " ein" : ""), verbT: D.verb.t, verbL: B >= 1100 ? D.verb.l : "",
      e: {
        upd: (pp === "fehler" || pp === "cockpit") && B < 1280 ? " ein" : "", ck: pp === "cockpit" ? "" : Bk < 1100 ? " ein" : "", lang: Bk < 1200 ? " ein" : "", zeile: Bk < 1200 ? " ein" : "", heli: Bk < 900 ? " ein" : "", verbL: Bk < 1200 ? " ein" : "",
        zrA: Bk < 1250 ? " ein" : "", zrB: Bk < 1250 ? " ein" : "", zrC: Bk < 1250 && Z.c ? "" : " ein",
      },
      // Update
      upd: U ? { ...U, spaeterKlick: () => { if (U.spaeterAktion) U.spaeterAktion(); this.schubladeZu(); } } : { da: false },
      updCls: "pv-upd kl-upd" + (U && U.istLaedt ? " laedt" : "") + (pp === "update" ? " offen" : ""),
      updKlick: () => { if (pp === "update") this.schubladeZu(); else { clearTimeout(this.pt); this.setState({ pp: "update", ppZuIst: false, wx: false }); } },
      updOk: () => { if (U && U.okAktion) U.okAktion(); },
      // Cockpit, Simulator und Übungsflug: Schublade oben in der Leiste
      ckCls: "pv-ckn" + (pp === "cockpit" ? " offen" : ""),
      ckKlick: () => { if (pp === "cockpit") this.schubladeZu(); else { clearTimeout(this.pt); this.setState({ pp: "cockpit", ppZuIst: false, wx: false }); } },
      ckPunkt: (D.cockpit[0] && D.cockpit[0].f) || "var(--dim)",
      // Fehler melden
      fehlerCls: "pv-ik" + (pp === "fehler" ? " offen" : ""),
      fehlerKlick: () => { if (pp === "fehler") this.schubladeZu(); else { clearTimeout(this.pt); this.setState({ pp: "fehler", ppZuIst: false, wx: false, fehlerDatei: "", fehlerNr: 0 }); } },
      fehlerNeu: !S.fehlerDatei && !S.fehlerNr, fehlerOk: !!S.fehlerDatei, fehlerDatei: S.fehlerDatei || "",
      fehlerTicket: !!S.fehlerNr, fehlerNr: S.fehlerNr ? "#" + S.fehlerNr : "",
      fehlerFehl: !!S.fehlerFehl, fehlerFehlText: (S.fehlerFehl || "") + " – du kannst den Bericht stattdessen als Datei speichern.",
      fehlerBilderText: (S.fehlerBilder || []).length ? "Bilder ändern …" : "Bilder anhängen …",
      fehlerBilderDa: !!(S.fehlerBilder || []).length, fehlerBilderInfo: (S.fehlerBilder || []).map((b) => b.name).join(", "),
      fehlerBilder: async () => { const l = await A.bilderWaehlen(); this.setState({ fehlerBilder: l }); },
      fehlerSendenCls: "kn sm prim" + (S.fehlerLaeuft ? " aus" : ""), fehlerSendenText: S.fehlerLaeuft ? "Sende …" : "Senden",
      fehlerSenden: async () => {
        if (this.state.fehlerLaeuft) return;
        const text = this.state.fehlerText || "";
        if (!text.trim()) return this.setState({ fehlerFehl: "Bitte kurz beschreiben, was passiert ist" });
        this.setState({ fehlerLaeuft: true, fehlerFehl: "" });
        const r = await A.fehlerSenden(text, this.state.fehlerBilder || []);
        this.setState(r.nr ? { fehlerLaeuft: false, fehlerNr: r.nr, fehlerText: "", fehlerBilder: [] } : { fehlerLaeuft: false, fehlerFehl: "Nicht gesendet: " + (r.fehler || "unbekannt") });
      },
      fehlerText: S.fehlerText || "", fehlerTippen: (ev) => { this.state.fehlerText = ev.target.value; },
      fehlerSpeichern: async () => { const d = await A.fehlerSpeichern(this.state.fehlerText || ""); if (d) this.setState({ fehlerDatei: d, fehlerText: "", fehlerFehl: "" }); },
      fehlerNochmal: () => this.setState({ fehlerDatei: "", fehlerNr: 0, fehlerText: "", fehlerBilder: [], fehlerFehl: "" }),
      fehlerIn: D.fehlerIn,
      pop: { update: pp === "update", fehler: pp === "fehler", spiel: pp === "spiel", cockpit: pp === "cockpit" }, ppZu: S.ppZuIst ? " zu" : "", ppZuKlick: () => this.schubladeZu(),
      ppR: (() => { const r = (n) => (pp === n ? " reiter" + (S.ppZuIst ? " schliesst" : "") : ""); return { update: r("update"), fehler: r("fehler"), spiel: r("spiel"), cockpit: r("cockpit") }; })(),
      // Hinweis (Verbindung, kein Hubschrauber) und Alarm
      warte: D.warte,
      alarm: !!D.alarm, alT: D.alarm ? D.alarm.t : "", alS: D.alarm ? D.alarm.s : "", alZ: !!(D.alarm && (D.alarm.ziB || D.alarm.ziT)), alZB: D.alarm ? D.alarm.ziB : "", alZT: D.alarm ? (D.alarm.ziB && D.alarm.ziT ? "// " + D.alarm.ziT : D.alarm.ziT) : "",
      quitt: () => A.sofortStatus("alarmiert"), abheben: () => A.sofortStatus("zumBO"),
      phasen, stl, cockpit, einstKlick: () => A.einstellungen(),
      ueb: { ...D.ueb, knoepfe: (D.ueb.knoepfe || []).map((k) => ({ ...k, cls: "kn sm" + (k.aus ? " aus" : "") })) },
      zeitraffer: D.zeitraffer, zeitKnopf: D.zeitKnopf ? { ...D.zeitKnopf, cls: "kn sm" + (D.zeitKnopf.an ? " an" : "") } : null,
      testKnopf: D.test ? () => A.testMenue() : null,
      gsBR: !!(D.gs && D.gs.br), gs: D.gs ? { ...D.gs, zug: D.gs.zug ? { ...D.gs.zug, f: D.gs.zug.f } : null } : {}, gsLeg: G,
      folgCls: "kn sm" + (D.folgen ? " an" : ""), folgen: () => A.folgen(), gross: () => A.gross(), punktHinweis: D.punktWaehlen, khLeg: buchenAn && (S.bs || "art") === "vorschlag" && !!(E && E.khs.length),
      // Funk im Kopf nur, wenn etwas los ist (jemand spricht, du sendest, belegt, unterbrochen) – „Funk frei“ braucht keinen Platz
      funkT: D.funkKanal && (D.funkKanal.sendet || /spricht|belegt|unterbrochen|Warten|geprüft|kein Großeinsatz/.test(D.funkKanal.kanal)) ? D.funkKanal.kanal : "", funkCls: "pv-pill pvn-funkp" + (D.funkKanal && D.funkKanal.sendet ? " sendet" : / spricht/.test((D.funkKanal && D.funkKanal.kanal) || "") ? " spricht" : "") + (Bk < 1150 ? " ein" : ""),
      ...haupt,
      toast: S.toast || "",
    };
  }
}
