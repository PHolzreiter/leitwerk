// Pilotenansicht – Logik aus dem Entwurf „Pilot“ (LeitWerk Arbeitsplatz, 09.11.).
// Aufbau, fließende Größen, Schubladen (Wetter, Update, Fehler melden, Spiel) und Aufklappen wie im Entwurf;
// die Inhalte (Hubschrauber, Status, Einsatz, Patient, Buchung, Großeinsatz, Cockpit) kommen echt aus dem Spiel:
// this.props.app.daten() liefert den Stand, this.props.app.a die Aktionen (siehe pilotView.ts › ansichtDaten).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

export class PilotLogik extends DCLogic {
  constructor(p) {
    super(p);
    this.state = {};
  }

  /** Schublade schließen (mit Animation: erst fährt das Fenster hoch, dann wird der Reiter wieder zum Knopf) */
  schubladeZu() {
    const S = this.state;
    if (S.wx) return this.wetterUmschalten();
    if (!S.pp || S.ppZuIst) return;
    clearTimeout(this.pt);
    this.setState({ ppZuIst: true });
    this.pt = setTimeout(() => this.setState({ pp: "", ppZuIst: false, ppNach: true }), 470);
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

    // ---- Layout fließend nach Breite
    const lay = B >= 1500 ? "drei" : B >= 880 ? "zwei" : "eins";
    const rb = lay === "drei" ? Math.min(640, Math.max(480, Math.round(B * 0.31))) : lay === "zwei" ? Math.max(360, Math.round(B * 0.4)) : B - 16;
    // Funk unter der Karte: wie im Entwurf 55 % (420–560 px); bei niedriger Fläche kleiner, damit die Karte bleibt
    const frei = H - 52 - 50 - 16;
    const funkH = lay === "eins" ? 460 : Math.min(560, Math.max(Math.min(420, Math.round(frei * 0.6)), Math.round(frei * 0.55)));

    // ---- Entscheidung und Buchung (Schritt-Assistent wie in der Einsatzmaske)
    const E = D.ent;
    const khWahlId = E && (S.khFuer === E.fuer && S.khWahl && E.khs.some((h) => h.id === S.khWahl) ? S.khWahl : E.gebuchtId && E.khs.some((h) => h.id === E.gebuchtId) ? E.gebuchtId : E.khs[0] ? E.khs[0].id : "");
    const khWahl = E ? E.khs.find((h) => h.id === khWahlId) : null;

    // ---- Kopf: Wetter, Update, Fehler, Spiel (Schubladen) – Platz in der Kopfzeile
    const wxAuf = !!S.wx;
    const pp = S.pp || "";
    const Bk = B - (D.upd ? 320 : 0) - ((wxAuf || S.wxNach) ? 330 : (pp || S.ppNach) ? 430 : 0);
    const W = D.wx;
    const FL = { ok: "möglich", gelb: "eingeschränkt", rot: "kein Flug" };

    // ---- Zeitraffer und Verbindung
    const Z = D.zr;
    const U = D.upd;
    const verlauf = D.verlauf.map((v, i) => v.abf ? { ...v, abfAuf: !!(S.abf || {})[v.key], abfCls: "pv-abf" + ((S.abf || {})[v.key] ? " auf" : ""), abfKlick: () => this.setState({ abf: { ...(S.abf || {}), [v.key]: !(S.abf || {})[v.key] } }) } : v);

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
      wxCls: "pv-wx" + (wxAuf ? " offen" : ""), wxKlick: () => this.wetterUmschalten(), wxZu: S.wxZu ? " zu" : "", wxReiter: wxAuf ? " reiter" : "", wxOffen: wxAuf,
      flugCls: "pv-flug " + W.flug,
      wxT: Bk >= 1200 ? W.lang : W.grad,
      flugKT: Bk < 640 ? { ok: "✓", gelb: "!", rot: "✕" }[W.flug] : Bk < 900 ? { ok: "Flug ok", gelb: "eingeschränkt", rot: "kein Flug" }[W.flug] : "Flug " + FL[W.flug].replace("kein Flug", "gesperrt"),
      wmax: Math.max(220, H - 52 - 10 - 160),
      zrCls: "pv-pill pv-verb" + (Z.gelb ? " gelb" : "") + (Bk < 600 ? " ein" : ""), zrTip: Z.tip,
      zrA: B < 560 ? "" : B >= 1250 ? Z.a : "", zrX: Z.x, zrB: B >= 1250 ? Z.b : "", zrC: Z.c,
      verbCls: "pv-pill pv-verb" + (D.verb.gelb ? " gelb" : "") + (Bk < 900 ? " ein" : ""), verbT: D.verb.t, verbL: B >= 1100 ? D.verb.l : "",
      e: {
        upd: pp === "fehler" && B < 1280 ? " ein" : "", lang: Bk < 1200 ? " ein" : "", zeile: Bk < 1200 ? " ein" : "", heli: Bk < 900 ? " ein" : "", verbL: Bk < 1200 ? " ein" : "",
        zrA: Bk < 1250 ? " ein" : "", zrB: Bk < 1250 ? " ein" : "", zrC: Bk < 1250 && Z.c ? "" : " ein",
      },
      // Update
      upd: U ? { ...U, spaeterKlick: () => { if (U.spaeterAktion) U.spaeterAktion(); this.schubladeZu(); } } : { da: false },
      updCls: "pv-upd kl-upd" + (U && U.istLaedt ? " laedt" : "") + (pp === "update" ? " offen" : ""),
      updKlick: () => { if (pp === "update") this.schubladeZu(); else { clearTimeout(this.pt); this.setState({ pp: "update", ppZuIst: false, wx: false }); } },
      updOk: () => { if (U && U.okAktion) U.okAktion(); },
      // Fehler melden
      fehlerCls: "pv-ik" + (pp === "fehler" ? " offen" : ""),
      fehlerKlick: () => { if (pp === "fehler") this.schubladeZu(); else { clearTimeout(this.pt); this.setState({ pp: "fehler", ppZuIst: false, wx: false, fehlerDatei: "" }); } },
      fehlerNeu: !S.fehlerDatei, fehlerOk: !!S.fehlerDatei, fehlerDatei: S.fehlerDatei || "",
      fehlerText: S.fehlerText || "", fehlerTippen: (ev) => { this.state.fehlerText = ev.target.value; },
      fehlerSpeichern: async () => { const d = await A.fehlerSpeichern(this.state.fehlerText || ""); if (d) this.setState({ fehlerDatei: d, fehlerText: "" }); },
      fehlerNochmal: () => this.setState({ fehlerDatei: "", fehlerText: "" }),
      fehlerIn: D.fehlerIn,
      pop: { update: pp === "update", fehler: pp === "fehler", spiel: pp === "spiel" }, ppZu: S.ppZuIst ? " zu" : "", ppZuKlick: () => this.schubladeZu(),
      ppR: { update: pp === "update" ? " reiter" : "", fehler: pp === "fehler" ? " reiter" : "", spiel: pp === "spiel" ? " reiter" : "" },
      // Hinweis (Verbindung, kein Hubschrauber) und Alarm
      warte: D.warte,
      alarm: !!D.alarm, alT: D.alarm ? D.alarm.t : "", alS: D.alarm ? D.alarm.s : "", alZ: !!(D.alarm && (D.alarm.ziB || D.alarm.ziT)), alZB: D.alarm ? D.alarm.ziB : "", alZT: D.alarm ? (D.alarm.ziB && D.alarm.ziT ? "// " + D.alarm.ziT : D.alarm.ziT) : "",
      quitt: () => A.sofortStatus("alarmiert"), abheben: () => A.sofortStatus("zumBO"),
      phasen, hauptCls: "pv-haupt " + lay, rb, linksSp: lay === "drei", statusOben: lay !== "drei", cockpitUnten: lay !== "drei",
      stl, cockpit, einstKlick: () => A.einstellungen(),
      ueb: { ...D.ueb, knoepfe: (D.ueb.knoepfe || []).map((k) => ({ ...k, cls: "kn sm" + (k.aus ? " aus" : "") })) },
      zeitraffer: D.zeitraffer, zeitKnopf: D.zeitKnopf ? { ...D.zeitKnopf, cls: "kn sm" + (D.zeitKnopf.an ? " an" : "") } : null,
      testKnopf: D.test ? () => A.testMenue() : null,
      next: D.next,
      hatEinsatz: !!D.ein, keinEinsatz: !D.ein,
      ein: D.ein || {}, fl: D.fl || {}, fzs: D.fzs, nav: D.nav,
      gsBR: !!(D.gs && D.gs.br), gs: D.gs || {}, gsLeg: G,
      patZu: !!D.patZu, patZuT: D.patZu || "", patAuf: !!(D.pats && D.pats.length), pats: D.pats || [], patVerlauf: D.patVerlauf && D.patVerlauf.length ? D.patVerlauf : null,
      // Entscheidung + Krankenhaus
      entscheiden: !!E,
      wahl: E ? E.wahl.map((w) => ({ ...w, cls: "pv-ek" + (w.on ? " on" : "") })) : [],
      keinWahl: E && E.keinWahl ? E.keinWahl.map((w) => ({ ...w, cls: w.on ? "on" : "" })) : null,
      rtwFehlt: !!(E && E.rtwFehlt),
      buchen: !!(E && E.buchen),
      khGebucht: !!(E && E.gebuchtId), khGebuchtT: E ? E.gebuchtT : "",
      khSchritte: E ? E.schritte : [],
      altW: E ? E.altW.map((w) => ({ ...w, cls: w.on ? "on" : "" })) : [],
      drW: E ? E.drW.map((w) => ({ ...w, cls: (w.on ? "on" : "") + (w.aus ? " aus" : "") })) : [],
      symQ: E ? E.symQ : "", symTippen: (ev) => A.symSuche(ev.target.value), symTaste: (ev) => { if (ev.key === "Enter" && E && E.symW[0]) E.symW[0].klick(); },
      symW: E ? E.symW : [], symHinweis: E ? E.symHinweis : "",
      khLeer: E ? E.khLeer : "",
      khs: E ? E.khs.map((h) => ({ ...h, cls: "pk-kh" + (h.id === khWahlId ? " gew" : ""), radio: "pk-radio" + (h.id === khWahlId ? " an" : ""), klick: () => this.setState({ khWahl: h.id, khFuer: E.fuer }) })) : [],
      andereAuf: !!(E && E.andereAuf), andereQ: E ? E.andereQ : "", andereTippen: (ev) => A.andereSuche(ev.target.value), andereKlick: () => A.andereUmschalten(), andereT: E && E.andereAuf ? "Nur passende" : "Andere Häuser",
      buchenT: khWahl ? (E.gebuchtId === khWahl.id ? khWahl.n + " gebucht" : khWahl.n + " buchen") : "",
      buchenKlick: () => { if (khWahl && E.gebuchtId !== khWahl.id) { A.khBuchen(khWahl.id); this.toast(khWahl.n + " gebucht – Platz belegt"); } },
      planT: D.planT,
      verlauf,
      folgCls: "kn sm" + (D.folgen ? " an" : ""), folgen: () => A.folgen(), gross: () => A.gross(), punktHinweis: D.punktWaehlen,
      funkH,
      toast: S.toast || "",
    };
  }
}
