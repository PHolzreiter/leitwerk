// Großeinsatz-Fenster: Logik aus dem Entwurf „Grosseinsatz.dc.html“ (class Component).
// Die Beispieldaten (Tunnel Dürnstein) sind durch die echten Daten ersetzt: this.props.app.daten() liefert
// den laufenden Großeinsatz (aus index.ts), die Knöpfe rufen die Aktionen in this.props.app.
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

export class GrosseinsatzLogik extends DCLogic {
  constructor(p) { super(p); this.state = {}; }
  componentWillUnmount() { clearTimeout(this.tt); clearTimeout(this.st); }
  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const B = Number(this.props.breite) || 560, H = Number(this.props.hoehe) || 1000;
    const zeige = (txt) => { clearTimeout(this.tt); this.setState({ toast: txt }); this.tt = setTimeout(() => this.setState({ toast: '' }), 2200); };
    const d = app.daten();
    const feCls = 'fe gs-ew' + (st.zieht ? ' zieht' : '');
    if (!d) return { feCls, keiner: true, aktiv: false, hatToast: !!st.toast, toast: st.toast || '' };
    // anderer Großeinsatz: eigene Eingaben zurücksetzen
    if (this._fuer !== d.id) { this._fuer = d.id; Object.assign(st, { aendern: false, adr: '', treffer: null, notiz: '', khSuche: '' }); }

    const vor = d.vor;
    const PAT = d.pats;
    const brGesetzt = !!d.br && !st.aendern;
    const n = (s) => PAT.filter(p => p.s === s).length;
    const lebend = PAT.filter(p => p.s !== 'tot');
    const weg = lebend.filter(p => p.st === 'fahrt' || p.st === 'kh').length;
    const zahlen = [['rot', 'rot'], ['gelb', 'gelb'], ['gruen', 'grün'], ['tot', 'tot']].map(([k, nn]) => ({ cls: 'zl ' + k, w: vor ? '–' : String(n(k)), von: '', n: nn, k: nn, titel: 'Sichtung ' + nn }))
      .concat([{ cls: 'zl weg', w: vor ? '–' : String(weg), von: vor ? '' : '/' + lebend.length, n: 'abtransportiert', k: 'transp.', titel: 'unterwegs ins oder im Krankenhaus' }]);

    // ---- Layout: groß = drei Spalten, mittel = zwei, klein = Unter-Reiter
    // (Entwurf: Fläche minus 32 px Rand; im Spiel ist das Fenster ohne Rand und ohne den 38 px hohen Kopf)
    const iw = B, ih = H + 38;
    const lay = iw >= 1300 && ih >= 760 ? 'l3' : iw >= 820 && ih >= 900 ? 'l2' : 'tabs';
    const tab = st.tab || this.props.tab || 'uebersicht';
    const TABS = [['uebersicht', 'Alarmierung'], ['pat', 'Patienten'], ['lage', 'Lage'], ['kh', 'Voraviso']];
    const anfragen = PAT.filter(p => p.anfrage && !p.kh).length;
    const pkt = { uebersicht: !d.br && !d.ende, pat: anfragen > 0, lage: false, kh: false };
    const leer = { alarm: false, kraefte: false, pat: false, lage: false, kh: false };
    const spalten = lay === 'l3' ? [{ ...leer, alarm: true, kraefte: true }, { ...leer, pat: true }, { ...leer, lage: true, kh: true }]
      : lay === 'l2' ? [{ ...leer, alarm: true, kraefte: true, kh: true }, { ...leer, pat: true, lage: true }]
      : [{ ...leer, alarm: tab === 'uebersicht', kraefte: tab === 'uebersicht', pat: tab === 'pat', lage: tab === 'lage', kh: tab === 'kh' }];
    // Breite der Patientenliste (für die Spalten)
    const tw = lay === 'l3' ? (iw - 48) * 1.45 / 3.45 : lay === 'l2' ? (iw - 36) * 1.15 / 2.15 : iw - 24;
    const tl = tw >= 620 ? 'b' : tw >= 400 ? 'n' : 's';

    // ---- Alarmierung
    // je Fahrzeugtyp: was fehlt – und nach dem Runterstufen, was zu viel ist (alarmierte Fahrzeuge bleiben)
    const soll = (z) => { const fehlt = z.soll - z.ist; const viel = z.ist - z.soll;
      return { a: z.a, ist: z.ist, soll: z.soll, w: z.soll ? Math.min(100, Math.round(z.ist / z.soll * 100)) : 100, cls: 'soll' + (viel > 0 ? ' ok viel' : z.ist >= z.soll ? ' ok' : ''),
        dt: fehlt > 0 ? 'fehlt ' + fehlt : viel > 0 ? viel + ' zu viel' : '✓', dCls: 'dz' + (fehlt > 0 ? ' fehlt' : viel > 0 ? ' viel' : ' ok'),
        titel: z.a + ': ' + z.ist + ' von ' + z.soll + (fehlt > 0 ? ' – es fehlen ' + fehlt : viel > 0 ? ' – ' + viel + ' mehr als die Stufe braucht (bleiben alarmiert)' : '') }; };
    const seg = d.seg.map(soll);
    const brZ = d.brZ.map(soll);

    // Adresssuche für den Bereitstellungsraum
    const treffer = st.treffer || null;
    const erst = st.erst || 0;
    const waehle = (h) => { this.setState({ treffer: null, adr: '', aendern: false }); app.brAdresse(h); zeige('Bereitstellungsraum festgelegt – jetzt in den BR alarmieren'); };
    const suchen = (q) => {
      clearTimeout(this.st);
      if (q.trim().length < 3) { this.setState({ treffer: null }); return; }
      this.st = setTimeout(async () => {
        try { const l = await app.suche(q); if ((this.state.adr || '') === q) this.setState({ treffer: l, erst: 0, suchFehler: '' }); }
        catch (e) { this.setState({ treffer: [], suchFehler: String(e && e.message || e) }); }
      }, 250);
    };

    // ---- Kräfte
    const F = (f) => ({ r: f.r, typ: f.typ, st: f.st, cls: 'fzc' + (f.rolle === 'EL' ? ' el' : f.rolle === 'BR' ? ' brl' : ''), hatRolle: !!f.rolle, rolle: f.rolle || '', zeigTyp: !f.rolle && f.typ !== f.r && !f.dm,
      titel: f.r + ' · ' + f.typ + (f.rolle === 'EL' ? ' · Einsatzleitung' : f.rolle === 'BR' ? ' · Leitung Bereitstellungsraum' : '') + ' · ' + f.status, klick: () => app.fahrzeug(f.id) });
    const kraefte = d.kraefte.map(k => ({ n: k.n, z: String(k.fz.length), fz: k.fz.map(F), leer: !k.fz.length }));
    const kSumme = d.kraefte.reduce((a, k) => a + k.fz.length, 0);

    // ---- Patienten-Tabelle: Spaltenköpfe sortieren, Breite ziehen
    const RANG = { rot: 0, gelb: 1, gruen: 2, tot: 3 };
    const SP = {
      b: [{ k: 'nr', t: 'Nr', mi: true, fix: true }, { k: 'pat', t: 'Patient' }, { k: 'muster', t: 'Verletzungsmuster' }, { k: 'stand', t: 'Stand' }, { k: 'kh', t: 'Krankenhaus', re: true }],
      n: [{ k: 'nr', t: 'Nr', mi: true, fix: true }, { k: 'muster', t: 'Patient · Muster' }, { k: 'stand', t: 'Stand' }, { k: 'kh', t: 'KH', re: true }],
      s: [{ k: 'nr', t: 'Nr', mi: true, fix: true }, { k: 'muster', t: 'Patient' }, { k: 'kh', t: 'KH', re: true }],
    }[tl];
    const STD = { b: [34, 110, 260, 200, 120], n: [30, 220, 150, 84], s: [28, 200, 80] }[tl];
    const br = st.br2 || {};
    const fr = br[tl] || STD;
    const cols = fr.map((w, i) => i === 0 ? w + 'px' : 'minmax(0,' + w + 'fr)').join(' ');
    const sortK = st.sortK || 'nr', auf = st.sortAuf !== undefined ? st.sortAuf : true;
    const STAND = { wartet: 0, versorgt: 1, bereit: 1.5, fw: 2, fahrt: 3, kh: 4, tot: 5 };
    const wert = { nr: p => p.nr, pat: p => p.a, muster: p => RANG[p.s] * 1000 + p.nr, stand: p => STAND[p.st], kh: p => p.kh || (p.anfrage ? ' ' : '~') };
    const sortiert = PAT.slice().sort((x, y) => { const a = wert[sortK](x), b = wert[sortK](y); const r = a < b ? -1 : a > b ? 1 : 0; return auf ? r : -r; });
    const breiten = (el) => { const k = el && el.closest ? el.closest('.pk2') : null; if (!k) return null; return (getComputedStyle(k).gridTemplateColumns || '').split(' ').map(parseFloat).filter(x => !isNaN(x)); };
    const kopf = SP.map((s, i) => ({ zelle: 'hk' + (s.mi ? ' mi' : s.re ? ' re' : ''), t: s.t, titel: 'Nach ' + s.t + ' sortieren',
      cls: 'sk' + (sortK === s.k ? ' on' + (auf ? '' : ' hoch') : ''), aria: sortK === s.k ? (auf ? 'ascending' : 'descending') : 'none',
      klick: () => this.setState(sortK === s.k ? { sortAuf: !auf } : { sortK: s.k, sortAuf: true }),
      zieh: i > 0 && i < SP.length - 1,
      ziehStart: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation();
        const el = ev && ev.currentTarget; const w0 = breiten(el); if (!w0 || w0.length < i + 2) return;
        const zoom = el && el.offsetWidth ? (el.getBoundingClientRect().width / el.offsetWidth) || 1 : 1; const x0 = ev.clientX;
        const zieh = (e) => { const w = w0.slice(); const sum = w0[i] + w0[i + 1]; w[i] = Math.max(40, Math.min(sum - 40, w0[i] + (e.clientX - x0) / zoom)); w[i + 1] = sum - w[i]; w[0] = fr[0]; this.setState({ br2: { ...(this.state.br2 || {}), [tl]: w.map((v, j) => j === 0 ? fr[0] : Math.round(v)) } }); };
        const los = () => { window.removeEventListener('mousemove', zieh); window.removeEventListener('mouseup', los); this.setState({ zieht: false }); };
        window.addEventListener('mousemove', zieh); window.addEventListener('mouseup', los); this.setState({ zieht: true }); },
      reset: () => { const nn = { ...br }; delete nn[tl]; this.setState({ br2: nn }); } }));
    const S_NAME = { rot: 'rot', gelb: 'gelb', gruen: 'grün', tot: 'tot' };
    const khZelle = (p) => {
      if (p.kh) return { wrap: '', text: false, stand: false, kh: true, hatKh: true, khKurz: p.kh, khLang: p.khLang || p.kh, buchen: false, strich: false };
      if (!p.buchbar) return { wrap: '', text: false, stand: false, kh: true, hatKh: false, buchen: false, strich: true };
      return { wrap: '', text: false, stand: false, kh: true, hatKh: false, buchen: true, strich: false, knCls: 'kn sm' + (p.anfrage ? ' prim blinkt' : ''), knTitel: p.anfrage ? 'Die Besatzung fragt nach einem Krankenhaus' : 'Krankenhaus buchen', klick: () => app.buchen(p.nr) };
    };
    const STCLS = { bereit: 'versorgt', tot: '' };
    const pats = sortiert.map(p => {
      const patT = { wrap: '', text: true, stand: false, kh: false, b: 'ca. ' + p.a + ' J., ' + p.g, t: '', d: '' };
      const musT = { wrap: '', text: true, stand: false, kh: false, b: '', t: p.m, d: '' };
      const kombi = { wrap: '', text: true, stand: false, kh: false, b: 'ca. ' + p.a + ' J., ' + p.g + ' · ', t: p.m, d: '' };
      const standZ = { wrap: '', text: false, stand: true, kh: false, stCls: 'stnd ' + (STCLS[p.st] !== undefined ? STCLS[p.st] : p.st), t: p.stT };
      const zellen = tl === 'b' ? [patT, musT, standZ, khZelle(p)] : tl === 'n' ? [kombi, standZ, khZelle(p)] : [kombi, khZelle(p)];
      return { nr: String(p.nr), cls: 'pz ' + p.s + (p.st === 'kh' ? ' weg' : ''), titel: 'Patient ' + p.nr + ' · Sichtung ' + S_NAME[p.s] + ' · ' + p.stT, zellen };
    });

    // ---- Lage
    const M = (m) => ({ zeit: m.zeit, von: m.von, art: m.art, hatArt: !!m.art, cls: 'zm ' + m.cls, text: m.text || '', hatText: !!m.text, punkte: m.punkte || [], hatPunkte: !!(m.punkte && m.punkte.length) });
    const meldungen = d.meldungen.map(M);
    // neue Meldung (oder eigene Notiz): Zeitleiste nach unten (im Entwurf nicht zu zeigen)
    if (!this.zeitlRef) this.zeitlRef = { current: null };
    if (meldungen.length !== this._nM) {
      const neu = this._nM !== undefined && meldungen.length > this._nM; this._nM = meldungen.length;
      if (neu) setTimeout(() => { const el = this.zeitlRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }, 0);
    }
    const notizText = st.notiz || '';
    const notizDazu = () => { const t = (this.state.notiz || '').trim(); if (!t) return; app.notiz(t); this.setState({ notiz: '' }); };

    // ---- Voraviso: alle Krankenhäuser, nach Nähe (ca. 8 sichtbar, scrollt), Suche, Spalten sortierbar
    const khQ = (st.khSuche || '').trim().toLowerCase();
    const khSort = st.khSort || 'km', khAuf = st.khAuf !== undefined ? st.khAuf : true;
    const KHW = { n: (h) => h.n.toLowerCase(), km: (h) => h.kmZahl, frei: (h) => -h.frei };
    const khListe = d.haeuser.filter(h => !khQ || khQ.split(/\s+/).every(w => h.such.includes(w))).slice().sort((x, y) => { const a = KHW[khSort](x), b = KHW[khSort](y); const r = a < b ? -1 : a > b ? 1 : 0; return khAuf ? r : -r; });
    const khKopf = [['n', 'Krankenhaus'], ['km', 'Entfernung'], ['frei', 'freie Plätze']].map(([k, t]) => ({ t, titel: 'Nach ' + t + ' sortieren', cls: 'sk' + (khSort === k ? ' on' + (khAuf ? '' : ' hoch') : ''), aria: khSort === k ? (khAuf ? 'ascending' : 'descending') : 'none',
      klick: () => this.setState(khSort === k ? { khAuf: !khAuf } : { khSort: k, khAuf: true }) }));
    const haeuser = khListe.map(h => { const an = h.an; const w = h.ges ? Math.round(h.frei / h.ges * 100) : 0;
      return { cls: 'khr' + (an ? ' an' : ''), n: h.n, titel: h.lang, km: h.km + (an ? ' · Voraviso' : ''), frei: h.frei + '/' + h.ges, ftext: an ? 'frei (150 %)' : 'frei', w, bCls: 'balken' + (w < 25 ? ' knapp' : ''), hatPl: h.ges > 0, keinePl: !h.ges,
        an: an ? 'true' : 'false', knCls: 'kn sm' + (an ? ' prim' : ''), knT: an ? '✓ vorinformiert' : 'Vorinformieren',
        klick: () => { app.voraviso(h.id, !an); zeige(an ? h.n + ': Voraviso zurückgenommen' : h.n + ': vorinformiert – 150 % der Plätze'); } }; });
    const nVor = d.haeuser.filter(h => h.an).length;

    // ---- Spieler-NAH: Patient wählen (sofortiger Wechsel, bis ein Zielort gebucht ist)
    const wahlbar = PAT.filter(p => p.s !== 'tot' && p.st !== 'fahrt' && p.st !== 'kh');
    const spieler = (d.spieler || []).map(s => {
      const akt = s.wunsch !== null && s.wunsch !== undefined ? s.wunsch : s.nr;
      const opts = (akt === null || akt === undefined ? [{ v: '', t: '– Patient wählen –' }] : []).concat(wahlbar.map(p => ({ v: String(p.nr), t: 'Patient ' + p.nr + ' · ' + S_NAME[p.s] + ' · ca. ' + p.a + ' J. · ' + p.m })));
      const pz = PAT.find(p => p.nr === s.nr);
      return { r: s.r, wo: s.wo + (s.wunsch !== null && s.wunsch !== undefined && s.wunsch !== s.nr ? ' · Patient ' + s.wunsch + ' vorgemerkt' : ''), frei: !s.zo, fest: s.zo, festT: pz ? 'Patient ' + pz.nr + ' · Zielort gebucht' : 'Zielort gebucht',
        wert: akt === null || akt === undefined ? '' : String(akt), opts,
        wahl: (e) => { const v = e && e.target ? e.target.value : ''; if (!v) return; app.spielerPatient(s.id, Number(v)); zeige(s.r + ': Patient ' + v); } };
    });

    // Patientenfluss: wo die Patienten gerade sind (gleichzeitig in verschiedenen Stadien)
    const FL = [['wartet', 'warten'], ['fw', 'Feuerwehr rettet'], ['versorgt', 'in Versorgung'], ['bereit', 'transportbereit'], ['fahrt', 'Transport'], ['imkh', 'im Krankenhaus']];
    const fluss = FL.map(([k, t]) => { const c = lebend.filter(p => p.st === (k === 'imkh' ? 'kh' : k)).length; return { n: c, t, cls: 'fl ' + k + (c ? '' : ' null'), lcls: 'flg ' + k + (c ? '' : ' null'), titel: c + ' ' + t }; });
    const flussLeer = vor || !lebend.length;
    const OK = 'M5 12.5l4.5 4.5L19 7.5';
    const meilen = d.meilen.map(m => ({ t: m.t, zeit: m.zeit || '', hatZeit: !!(m.ok && m.zeit), cls: 'ms ' + (m.ok ? 'ok' : 'offen'), d: m.ok ? OK : 'M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', titel: m.titel || m.t }));
    const tabIdx = Math.max(0, TABS.findIndex(t => t[0] === tab));
    const adr = st.adr || '';
    const adrTreffer = (treffer || []).map((h, i) => ({ t: h.label, titel: h.label, cls: i === erst ? 'erst' : '', klick: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); waehle(h); } }));
    return {
      feCls, keiner: false, aktiv: true, gsCls: 'gs',
      stufe: d.stufe, stufenCls: 'stufen' + (d.stufeOffen ? ' offen' : ''),
      stufen: d.stufen.map(x => ({ s: x.s, an: x.an ? 'true' : 'false', cls: 'stb' + (x.an ? ' on' : ''), titel: x.an ? 'Aktuelle Stufe' : 'Auf ' + x.s + ' ändern – mehr Kräfte bzw. „zu viel“ (alarmierte Fahrzeuge bleiben)',
        klick: () => { if (x.an) return; app.stufe(x.s); zeige('Stufe ' + x.s + ' – Alarmierung zeigt, was fehlt bzw. zu viel ist'); } })),
      stufeLaut: d.stufeOffen ? 'Stufe noch offen' : d.stufe + ' laut Stufe', stufeTitel: d.stufeTitel, titel: d.titel, unterTitel: d.unterTitel, gruppe: d.gruppe,
      fluss, flussLeer, flBalkenCls: 'fl-balken' + (flussLeer ? ' leer' : ''), meilen,
      zahlen,
      tabMode: lay === 'tabs', tabIdx,
      unter: TABS.map(([k, t]) => ({ t, cls: 'seg' + (k === tab ? ' on' : ''), an: k === tab ? 'true' : 'false', pk: pkt[k] && k !== tab, klick: () => this.setState({ tab: k }) })),
      rasterCls: 'raster ' + lay, spalten,
      seg, brZ, brGesetzt, brFehlt: !brGesetzt && !d.ende, brHinweis: !d.br, brZurueck: !!d.br && !!st.aendern, brSchrittCls: 'schritt' + (d.br || d.ende ? '' : ' warn'),
      brName: d.br ? d.br.name : '', brAbstand: d.br ? d.br.abstand : '',
      brAendern: () => this.setState({ aendern: true }),
      brBehalten: () => this.setState({ aendern: false, treffer: null, adr: '' }),
      brVorschlag: () => { if (app.brVorschlag()) { this.setState({ aendern: false }); zeige('Bereitstellungsraum festgelegt – jetzt in den BR alarmieren'); } },
      brKarte: () => { zeige('Karte zoomt zum Einsatzort – Bereitstellungsraum anklicken (Esc bricht ab)'); app.brKarte(() => this.setState({ aendern: false })); },
      adrText: adr, adrOffen: treffer !== null, adrTreffer, adrLeer: treffer !== null && !treffer.length, adrLeerText: st.suchFehler || 'Keine Adresse gefunden',
      adrTipp: (e) => { const q = e && e.target ? e.target.value : ''; this.setState({ adr: q }); suchen(q); },
      adrTaste: (e) => {
        if (!e) return;
        const l = this.state.treffer || [];
        if (e.key === 'ArrowDown' && l.length) { e.preventDefault(); this.setState({ erst: Math.min(l.length - 1, erst + 1) }); }
        else if (e.key === 'ArrowUp' && l.length) { e.preventDefault(); this.setState({ erst: Math.max(0, erst - 1) }); }
        else if (e.key === 'Enter' && l[erst]) { e.preventDefault(); waehle(l[erst]); }
        else if (e.key === 'Escape') this.setState({ treffer: null });
      },
      adrWeg: () => setTimeout(() => this.setState({ treffer: null }), 120),
      zurMaske: () => app.zurMaske(),
      anrufe: d.anrufe, anrufeTitel: d.anrufeTitel,
      kraefte, kraefteSumme: kSumme === 1 ? '1 Fahrzeug' : kSumme + ' Fahrzeuge',
      patInfo: vor ? 'noch keine Meldung' : PAT.length + (d.patGesamt ? ' von ' + d.patGesamt : '') + ' gemeldet', hatNachf: !!d.nachf, nachf: d.nachf || '',
      cols, kopf, pats, keinePat: !pats.length,
      meldungen, zeitlRef: this.zeitlRef, keineMeldung: !meldungen.length, notizText, notizTipp: (e) => this.setState({ notiz: e && e.target ? e.target.value : '' }),
      notizTaste: (e) => { if (e && e.key === 'Enter') notizDazu(); }, notizDazu,
      haeuser, keineKh: !haeuser.length, keineKhText: khQ ? 'Kein Krankenhaus gefunden.' : 'Keine Krankenhäuser im Netz.',
      khInfo: (nVor ? nVor + ' vorinformiert · ' : '') + '150 % der Plätze, keine Selbstzuweiser', khKopf, khSuche: st.khSuche || '', khTipp: (e) => this.setState({ khSuche: e && e.target ? e.target.value : '' }),
      spieler, hatSpieler: spieler.length > 0,
      zumFunk: () => { app.zumFunk(); zeige('Funk-Fenster: Sprechgruppe ' + d.gruppe + ' gewählt'); },
      hatToast: !!st.toast, toast: st.toast || '',
    };
  }
}
