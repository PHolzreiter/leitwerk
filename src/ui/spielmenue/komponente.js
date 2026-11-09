// Spielmenü – Logik aus dem Entwurf „LeitWerk Spielmenü“ (Main.dc.html), angebunden über this.app (anbindung.ts).
// Die Einstellungen (03) sind dieselben Seiten wie im Hauptmenü: einstellungen/seiten.js (eine Definition für beide).
/* eslint-disable */
import { seitenEinmischen } from '../einstellungen/seiten.js';

export class SpielmenueKomponente {
  constructor(app, props) {
    this.app = app;
    this.props = props || {};
    this.state = {};
    this._plan = false;
    this.seitenScroll = '.sm-mp.sm-open .ein-w .l-sscroll:not(.l-shits)';
  }
  setState(p) {
    this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p);
    if (this._plan) return;
    this._plan = true;
    Promise.resolve().then(() => { this._plan = false; if (this._zeichnen) this._zeichnen(); });
  }
  componentDidMount() {
    this.onTap = e => this.reglerAnim(e);
    document.addEventListener('click', this.onTap, true);
    this.onPopDown = e => this.popMaus(e);
    this.onPopKey = e => this.popTaste(e);
    document.addEventListener('mousedown', this.onPopDown, true);
    document.addEventListener('keydown', this.onPopKey, true);
  }
  componentWillUnmount() {
    document.removeEventListener('mousedown', this.onPopDown, true); document.removeEventListener('keydown', this.onPopKey, true); this.popZu();
    document.removeEventListener('click', this.onTap, true);
    clearTimeout(this.tWechsel); clearTimeout(this.tHl); clearTimeout(this.tToast);
  }
  // Einstellungsseiten: im Spiel (Texte „gilt sofort“, Gast gesperrt, Großansicht, Reiter „fort“ = Spielstand)
  seitenOpt() {
    return {
      imSpiel: true, gross: true,
      gesperrt: this.app.gesperrt(), angefragt: this.app.angefragt('einstellungen'),
      anfragen: () => this.app.anfragen('einstellungen'),
      tab: t => { if (t === 'fort') this.oeffne('spielstand'); }
    };
  }
  /** Punkt öffnen (von außen: „einstellungen“ mit Seite, „spielstand“ …) */
  oeffne(k, seite, extra) {
    const st = this.state || {};
    const offen = st.offen || null;
    const wechsel = !!offen && offen !== k && offen !== 'beenden' && offen !== 'hauptmenue';
    clearTimeout(this.tWechsel);
    this.setState({ offen: k, wechsel, ladeFrage: false, lobbyFrage: false, heliWahl: null });
    if (wechsel) this.tWechsel = setTimeout(() => this.setState({ wechsel: false }), 800);
    if (k === 'einstellungen' && seite) this.seiteOeffnen(seite, extra);
  }
  /** Esc: erst Rückfragen, dann Einstellungen (Suche, Unterseite, Groß), dann den offenen Punkt zuklappen, dann zurück ins Spiel */
  escTaste(e) {
    const st = this.state || {};
    if (this.pop) return;
    if (st.keyCap) {
      e.preventDefault(); e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      if (this.app.einst && this.app.einst.taste(st.keyCap, e)) return this.setState({ keyCap: null });
      if (this.app.einst && this.app.einst.lesen(st.keyCap) !== undefined) return this.setState({ keyCap: null });
      if (e.key === 'Delete' || e.key === 'Backspace') return this.setState({ ['s_' + st.keyCap]: '–', keyCap: null });
      const n = (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.key === ' ' ? 'Leertaste' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
      return this.setState({ ['s_' + st.keyCap]: n, keyCap: null });
    }
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    if (st.cfm || st.warn || st.ladeFrage || st.lobbyFrage || st.heliWahl || st.uebergabe || st.verlassenFrage) return this.setState({ cfm: null, warn: null, ladeFrage: false, lobbyFrage: false, heliWahl: null, uebergabe: null, verlassenFrage: false });
    if (st.offen === 'einstellungen') {
      if (st.q) return this.setState({ q: '' });
      if (this.subParent) return this.setState({ sp: this.subParent, edit: null, impVon: null, sw: (st.sw || 0) + 1, swLate: false });
      if (st.gross) return this.setState({ gross: false });
    }
    if (st.offen) return this.setState({ offen: null, wechsel: false });
    this.app.schliessen();
  }
  renderVals() {
    const st = this.state || {};
    const A = this.app;
    const K = A.kopf();
    const modus = K.modus;
    const offen = st.offen || null;
    const pilot = modus === 'Pilot';
    // Rolle im Multiplayer (der Pilot ist Mitspieler oder fliegt im Übungsflug allein)
    const solo = K.rolle === 'aus', host = K.rolle === 'host', gast = K.rolle === 'client';
    const irgendwas = !!offen && offen !== 'beenden' && offen !== 'hauptmenue';
    const auf = (k) => () => {
      const neu = offen === k ? null : k;
      // Wechsel von einem offenen Punkt direkt zum nächsten: alles im selben Takt (wie im Hauptmenü)
      const wechsel = irgendwas && !!neu && neu !== 'hauptmenue';
      clearTimeout(this.tWechsel);
      this.setState({ offen: neu, wechsel, ladeFrage: false, lobbyFrage: false, gespeichert: null, heliWahl: null, uebergabe: null, verlassenFrage: false });
      if (wechsel) this.tWechsel = setTimeout(() => this.setState({ wechsel: false }), 800);
    };
    const punkt = (k, sub) => {
      const o = offen === k;
      return { offen: o, sub, auf: auf(k), exp: o ? 'true' : 'false', cls: 'sm-mp' + (o ? ' sm-open' : '') };
    };
    const B = Number(this.props.breite) || 1600, H = Number(this.props.hoehe) || 950;
    // Höhe der offenen Karte: alle Punkte gleich hoch wie 03 Einstellungen (Inhalt scrollt), niedrige Fläche enger
    const niedrigM = H < 760;
    const RAND = (niedrigM ? 420 : 528) + (K.rolle !== 'aus' ? 55 : 0);
    const karteH = Math.max(220, Math.round(H - RAND));
    const einB = Math.max(320, Math.round(B - 2 * Math.max(B < 900 ? 16 : 72, (B - 1760) / 2) - 52));
    const einH = Math.max(180, karteH - 41);

    // ---------- Kopf
    let zustandText = 'Pausiert', zustandFarbe = '#FFC72C';
    if (host) { zustandText = (K.laeuft ? 'Läuft weiter · ' : 'Für alle pausiert · ') + K.spielerText; zustandFarbe = K.laeuft ? '#4CC38A' : '#FFC72C'; }
    if (gast) { zustandText = K.hostDa ? (K.laeuft ? 'Läuft weiter beim Host' : 'Pausiert beim Host') : 'Host nicht verbunden'; zustandFarbe = K.hostDa ? (K.laeuft ? '#4CC38A' : '#FFC72C') : '#E5484D'; }

    // ---------- 02 Spielstand
    const S = A.spielstand;
    const saves = S.saves();
    const name = st.sname ?? S.name();
    const speichern = () => {
      if (st.speichertGerade) return;
      this.setState({ speichertGerade: true, gespeichert: null });
      S.speichern(name).then(t => this.setState({ speichertGerade: false, gespeichert: t, gespeichertOk: true, sname: undefined }), e => this.setState({ speichertGerade: false, gespeichert: '⚠ ' + String((e && e.message) || e), gespeichertOk: false }));
    };
    const ladeDatei = st.ladeFrage;

    // ---------- 06 Zum Hauptmenü, Beenden
    const p5 = punkt('hauptmenue', pilot ? 'Hubschrauber abgeben und das Spiel verlassen' : solo ? 'Das Spiel wird vorher gesichert' : host ? 'Sichert das Spiel und schließt die Lobby' : 'Verlässt das Spiel bei ' + K.hostName);
    const hmGo = () => { if (st.hmLaeuft) return; this.setState({ hmLaeuft: true }); A.zumHauptmenue().finally(() => this.setState({ hmLaeuft: false })); };
    const hm = pilot ? { cls: 'sm-strip', text: 'Spiel verlassen? ' + K.heliName + ' geht zurück an die Leitstelle, der Computer fliegt weiter.', ja: 'Verlassen' } : solo
      ? { cls: 'sm-strip', text: 'Zum Hauptmenü? Das Spiel wird gesichert (' + K.einsaetzeText + ') – mit „Fortsetzen“ geht es genau hier weiter.', ja: 'Zum Hauptmenü' }
      : host
        ? { cls: 'sm-strip sm-rot', text: 'Zum Hauptmenü? ' + (K.andere ? K.andere + ' ' + (K.andereN === 1 ? 'wird' : 'werden') + ' getrennt. ' : '') + 'Das Spiel wird vorher gesichert.', ja: 'Lobby schließen und gehen' }
        : { cls: 'sm-strip', text: 'Spiel bei ' + K.hostName + ' verlassen? Deine Einsätze übernimmt der Host.', ja: 'Verlassen' };
    hm.go = hmGo;

    // ---------- 04 Multiplayer
    const M = A.mp();
    const mpVals = {
      ...M,
      fehlerDa: !!st.mpFehler, fehler: st.mpFehler || '',
      lobbyCls: 'sm-btn' + (st.lobbyLaeuft ? ' sm-aus' : ''), lobbyText: st.lobbyLaeuft ? 'Lobby wird geöffnet …' : 'Lobby öffnen',
      lobbyAuf: () => { if (st.lobbyLaeuft) return; this.setState({ lobbyLaeuft: true, mpFehler: null }); A.lobbyOeffnen().then(f => this.setState({ lobbyLaeuft: false, mpFehler: f })); },
      kopierText: st.kopiert ? 'Kopiert' : 'Code kopieren',
      kopieren: () => { A.codeKopieren(); this.setState({ kopiert: true }); clearTimeout(this.tKop); this.tKop = setTimeout(() => this.setState({ kopiert: false }), 1800); },
      spieler: M.spieler.map(x => ({ ...x,
        rechte: x.rechte.map(r => ({ ...r, cls: 'sm-haken' + (r.fest ? ' sm-fest' : r.an ? ' sm-an' : ''), an: r.an ? 'true' : 'false', flip: () => { if (!r.fest) A.rechtSetzen(x.pid, r.id, !r.an); } })),
        uebergeben: () => this.setState({ uebergabe: x.pid }) })),
      uebergabeFrage: !!st.uebergabe, uebergabeText: st.uebergabe ? ((M.spieler.find(x => x.pid === st.uebergabe) || {}).name || '') + ' wird Host, du spielst als Mitspieler weiter. Niemand verliert die Verbindung.' : '',
      uebergabeNein: () => this.setState({ uebergabe: null }), uebergabeJa: () => { A.hostUebergeben(st.uebergabe); this.setState({ uebergabe: null }); },
      verlassenFrage: !!st.verlassenFrage, verlassenText: 'Spiel bei ' + K.hostName + ' verlassen? Deine Einsätze übernimmt der Host – du spielst danach allein mit deiner eigenen Leitstelle weiter.',
      verlassen: () => this.setState({ verlassenFrage: true }), verlassenNein: () => this.setState({ verlassenFrage: false }),
      verlassenJa: () => { this.setState({ verlassenFrage: false }); A.mpVerlassen(); },
      meineRechte: M.meineRechte.map(r => ({ ...r, anfragen: () => { A.anfragen(r.id); this.setState({}); } })),
    };

    // ---------- 05 Fälle
    const F = A.faelle();
    const faelle = {
      mehr: !gast,
      oeffnen: () => this.oeffne('einstellungen', 'faelle'),
      neu: () => this.oeffne('einstellungen', 'neuerFall'),
      liste: F.liste.map(f => ({ ...f, oeffnen: () => A.fallOeffnen(f.id) })), leer: F.liste.length === 0,
      meldungDa: !!st.fallMeldung, meldung: st.fallMeldung || '', meldungCls: 'sm-chip' + (String(st.fallMeldung || '').startsWith('⚠') ? ' sm-gelb' : ' sm-ok'),
      importieren: () => A.faelleImportieren().then(t => t && this.setState({ fallMeldung: t }), e => this.setState({ fallMeldung: '⚠ ' + String((e && e.message) || e) })),
      exportieren: () => A.faelleExportieren().then(t => t && this.setState({ fallMeldung: t }), e => this.setState({ fallMeldung: '⚠ ' + String((e && e.message) || e) })),
    };

    // ---------- 02 Pilot: Hubschrauber wechseln
    const helis = pilot ? A.helis() : [];
    const heliW = helis.find(h => h.id === st.heliWahl);

    const SW = this.seitenWerte();
    const gross = !!st.gross;
    return {
      ...SW,
      logoUrl: A.logoUrl, versionText: A.version(),
      smH: H, karteH, einB, einH,
      wCls: 'l-root ein-w' + (gross ? ' ein-gross' : '') + (einH < 520 && !gross ? ' ein-niedrig' : ''),
      toastDa: !!st.toast, toast: st.toast || '',
      zu: () => this.setState({ offen: null, wechsel: false, ladeFrage: false, lobbyFrage: false }),
      listeCls: 'sm-menue sm-liste' + (irgendwas ? ' sm-has-open' : '') + (st.wechsel ? ' sm-wechsel' : '') + (niedrigM ? ' sm-niedrig' : ''),
      istSolo: solo, istHost: host, istGast: gast, mpHinweis: !solo,
      uhr: K.uhr, wetter: K.wetter, wetterDa: !!K.wetter,
      zustandText, zustandFarbe,
      pauseDa: host && K.darfSteuern, pauseText: K.laeuft ? 'Für alle pausieren' : 'Weiterlaufen lassen',
      pauseKlick: () => A.pauseUmschalten(),
      einsText: K.einsaetzeText, verpasstDa: K.verpasst > 0, verpasstText: K.verpasst === 1 ? '1 wartender Anruf' : K.verpasst + ' wartende Anrufe', pilotText: K.pilotText,
      p1: { cls: 'sm-mp', auf: () => A.schliessen() },
      p2: punkt(pilot ? 'heli' : 'spielstand', gast ? 'Kopie für dich speichern' : 'Speichern, automatische Sicherung, laden'),
      p3: punkt('einstellungen', gast && A.gesperrt() ? 'Mein Platz · den Rest ändert der Host' : 'Mein Platz und das laufende Spiel'),
      p4: punkt('multiplayer', pilot ? 'Du fliegst bei ' + K.hostName + ' mit · deine Rechte' : solo ? 'Mitspieler in dieses Spiel einladen' : host ? 'Code ' + M.code + ' · ' + K.spielerText + ' · Rechte' : 'Du spielst bei ' + K.hostName + ' mit · deine Rechte'),
      p5: { ...p5, cls: 'sm-mp' + (p5.offen ? ' sm-fragt' : '') }, hm,
      p6: punkt('faelle', 'Fall-Editor: Fälle schreiben, prüfen, importieren, exportieren'),
      faelle,
      st: {
        speichernTitel: gast ? 'Kopie speichern' : 'Jetzt speichern',
        speichernHinweis: gast ? 'Speichert den Stand des Hosts als eigenen Spielstand – du kannst ihn später allein weiterspielen.' : 'Speichert alle Einsätze, Fahrzeuge, Anrufe und den Funkverlauf.',
        name, setName: e => this.setState({ sname: e.target.value }), nameKey: e => { if (e.key === 'Enter') { e.preventDefault(); speichern(); } },
        speichernCls: 'sm-btn' + (st.speichertGerade ? ' sm-aus' : ''),
        autoText: S.autoText(), ordnerDa: S.ordnerDa, ordner: () => S.ordner(),
        ladenGesperrt: gast,
        ladeKnopf: gast ? 'sm-ghost sm-k sm-aus' : 'sm-ghost sm-k',
        ladeText: (host ? 'Laufendes Spiel für alle ' + K.spielerText + ' ersetzen?' : 'Laufendes Spiel ersetzen?') + ' „' + ((saves.find(s => s.datei === ladeDatei) || {}).name || 'Automatische Sicherung') + '“ laden – der aktuelle Stand wird vorher gesichert.',
        fehlerDa: !!st.ladeFehler, fehler: st.ladeFehler || '',
      },
      saves: saves.map(s => ({ ...s, laden: () => { if (!gast) this.setState({ ladeFrage: s.datei, ladeFehler: null }); } })), savesLeer: saves.length === 0,
      gespeichertDa: !!st.gespeichert, gespeichert: st.gespeichert || '', gespeichertCls: 'sm-chip' + (st.gespeichertOk ? ' sm-ok' : ' sm-gelb'),
      speichern,
      ladeFrage: st.ladeFrage !== undefined && st.ladeFrage !== false && st.ladeFrage !== null,
      ladenNein: () => this.setState({ ladeFrage: false }),
      ladenJa: () => { const d = st.ladeFrage; this.setState({ ladeFrage: false }); S.laden(d).then(f => this.setState(f ? { ladeFehler: f } : { ladeFehler: null, offen: null })); },
      mp: mpVals,
      lobbyFrage: !!st.lobbyFrage, lobbyKnopf: !st.lobbyFrage,
      lobbyJa: () => this.setState({ lobbyFrage: true }),
      lobbyNein: () => this.setState({ lobbyFrage: false }),
      lobbyZu: () => { this.setState({ lobbyFrage: false }); A.lobbySchliessen(); },
      istPilot: pilot, nichtPilot: !pilot, nrHm: pilot ? '05' : '06',
      p1lb: pilot ? 'Weiterfliegen' : 'Weiterspielen', p1sb: pilot ? 'Zurück ins Cockpit · Esc' : 'Zurück an deinen Platz · Esc',
      smLabel: pilot ? 'Spielmenü · Pilot · ' + K.heliName : 'Spielmenü · Funkgruppe ' + K.fgName,
      heliSub: K.heliName ? 'Du fliegst ' + K.heliName + (K.heliRuf ? ' · ' + K.heliRuf : '') : 'Hubschrauber wählen',
      heliFrage: !!heliW, heliFrageText: heliW ? (K.heliName ? K.heliName + ' abgeben und ' : '') + heliW.name + ' übernehmen?' : '',
      heliNein: () => this.setState({ heliWahl: null }),
      heliJa: () => { const id = st.heliWahl; this.setState({ heliWahl: null, heliFehler: null }); A.heliWechseln(id).then(f => f && this.setState({ heliFehler: f })); },
      heliFehlerDa: !!st.heliFehler, heliFehler: st.heliFehler || '',
      helis: helis.map(h => ({ n: h.name, info: h.info, chip: h.chip, chipCls: h.chipCls, nCls: 'sm-sn', waehlbar: !h.chip, nichtWaehlbar: !!h.chip, waehle: () => this.setState({ heliWahl: h.id, heliFehler: null }) })),
      beendenCls: 'sm-beenden-frage' + (offen === 'beenden' ? ' sm-fragt' : ''),
      beendenExp: offen === 'beenden' ? 'true' : 'false',
      beendenText: pilot ? 'LeitWerk beenden? ' + K.heliName + ' geht zurück an die Leitstelle.' : 'LeitWerk beenden? Das Spiel wird vorher gesichert.',
      beenden: () => this.setState({ offen: offen === 'beenden' ? null : 'beenden', wechsel: false }),
      beendenJa: () => { A.beenden().then(t => { if (t) this.setState({ offen: null, toast: t }); }); },
    };
  }
}
seitenEinmischen(SpielmenueKomponente);
