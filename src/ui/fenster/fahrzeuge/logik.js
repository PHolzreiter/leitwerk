// Logik des Fahrzeuge-Fensters – aus dem Entwurf „Fahrzeuge.dc.html“ übernommen.
// Statt der Beispieldaten kommen Fahrzeuge, Status und Statusänderungen aus dem Spiel (props.app, siehe index.ts).
// Unterschied zur Entwurfsfläche: props.breite ist die Breite des Fensters selbst (ohne den Rand der Fläche, daher ohne „- 32“).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

// Dauerhaft gemerkte Einstellungen des Fensters (Filter, Sortierung, Spalten, Breiten)
const MERKEN = ["gruppe", "stFilter", "zu", "sortK", "sortAuf", "aus", "br", "nurEinsatz"];

export class FahrzeugeLogik extends DCLogic {
  constructor(p) {
    super(p);
    const g = (p && p.app && p.app.gemerkt) || {};
    this.state = {};
    for (const k of MERKEN) if (g[k] !== undefined) this.state[k] = g[k];
  }
  setState(p) {
    super.setState(p);
    const app = this.props.app;
    if (!app || !app.merken) return;
    clearTimeout(this._mt);
    this._mt = setTimeout(() => {
      const m = {};
      for (const k of MERKEN) m[k] = this.state[k];
      app.merken(m);
    }, 400);
  }
  componentWillUnmount() { clearTimeout(this._mt); }
  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const g = { breite: this.props.breite || 560, hoehe: this.props.hoehe || 1000 };
    const ansicht = app.ansicht || 'alle';
    // Fahrzeuge aus dem Spiel (Statusfarben aus den Einstellungen bzw. dem Entwurf, gleich in Hell und Dunkel)
    const fz = app.fahrzeuge();
    const gruppe = st.gruppe || 'alle';
    const bereichAlle = !!st.bereichAlle;
    const stFilter = st.stFilter || 'alle';
    const such = (st.such || '').trim().toLowerCase();
    const zu = st.zu || {};
    const sel = st.sel || '';
    const sw = st.sw || 0;
    const neu = (patch) => this.setState({ ...patch, sw: sw + 1 });
    // Sortierung über die Spaltenköpfe: nochmal klicken dreht die Richtung um; leere Werte immer ans Ende
    const sortK = st.sortK || (ansicht === 'aktive' ? 'status' : 'ruf');
    const sortAuf = st.sortAuf !== undefined && st.sortK ? st.sortAuf : true;
    const GR = [['alle', 'Alle', () => true], ['rtw', 'RTW', (f) => f.rtw], ['ktw', 'KTW', (f) => f.ktw],
      ['nef', 'NEF', (f) => f.nef, 'NEF (auch am Hubschrauber-Stützpunkt)'], ['nah', 'NAH', (f) => f.nah, 'Hubschrauber'],
      ['sek', 'Sekundär', (f) => f.sek, 'Sekundärfahrzeuge (SNAW, SRTW, SKTW, BIT)'], ['el', 'EL', (f) => f.el, 'Einsatzleiter (BEL, EL ÖBB)']];
    const imBereich = (f) => bereichAlle || !f.fremd;
    const sichtbarB = fz.filter(imBereich);
    const grF = (GR.find(x => x[0] === gruppe) || GR[0])[2];
    const passt = (f) => grF(f) && (!such || f.suche.includes(such));
    const aktivSt = (f) => f.aktiv;
    const SORD = ['alarmWache', 'alarmFunk', 'alarmiert', 'zumBO', 'amBO', 'zumZO', 'amZO', 'freiFunk', 'dienstfahrt', 'bereitschaft', 'freiWache', 'abgemeldet'];
    const SWERT = { ruf: f => f.ruf, typ: f => f.typ, status: f => SORD.indexOf(f.key), lst: f => f.von || null, ziel: f => f.nach || null, fahrt: f => f.nach || f.von || null, code: f => (f.codes[0] || {}).c || null, eta: f => f.etaMin };
    const sortiere = (l) => { const w = SWERT[sortK] || SWERT.ruf; return l.slice().sort((a, b) => { const x = w(a), y = w(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de', { numeric: true });
      return (sortAuf ? r : -r) || a.ruf.localeCompare(b.ruf, 'de', { numeric: true }); }); };
    const SPALTE = { ruf: 'Funkkennung', typ: 'Typ', status: 'Status', lst: 'Letzter Standort', ziel: 'Fahrtziel', fahrt: 'Fahrtziel', code: 'Code', eta: 'Ankunft' };
    // Spaltenbreiten: je Ansicht (breit/normal/schmal) an den Trennern im Kopf ziehbar; als Anteile gespeichert, damit sie mit dem Fenster mitwachsen
    // Spalten je Ansicht; per Rechtsklick auf den Kopf aus- und einblendbar (je Breite gemerkt)
    const KEYS = { b: ['ruf', 'typ', 'status', 'lst', 'ziel', 'code', 'eta'], n: ['ruf', 'status', 'fahrt', 'code', 'eta'], s: ['status', 'ruf', 'fahrt', 'code'] };
    const STDW = { b: { ruf: 'minmax(0,.8fr)', typ: 'minmax(0,.6fr)', status: 'minmax(0,1fr)', lst: 'minmax(0,1.2fr)', ziel: 'minmax(0,1.2fr)', code: 'minmax(0,.8fr)', eta: '62px' }, n: { ruf: '76px', status: 'minmax(0,1.05fr)', fahrt: 'minmax(0,1.5fr)', code: '86px', eta: '60px' }, s: { status: '22px', ruf: '66px', fahrt: 'minmax(0,1fr)', code: '84px' } };
    const fw = g.breite; const lay = fw >= 820 ? 'b' : fw <= 430 ? 's' : 'n';
    const aus = st.aus || {};
    const sichtK = (a) => KEYS[a].filter(k => !(aus[a] || []).includes(k));
    const br = st.br || {};
    const bkey = (a) => a + ':' + sichtK(a).join(',');
    const cols = (a) => br[bkey(a)] ? br[bkey(a)].map(w => 'minmax(0,' + w.toFixed(1) + 'fr)').join(' ') : sichtK(a).map(k => STDW[a][k]).join(' ');
    const MIN = (a, i) => a === 's' && i === 0 ? 18 : 34;
    const breiten = (el) => { const kopfEl = el && el.closest ? el.closest('.fzk-b,.fzk-n,.fzk-s') : null; if (!kopfEl) return null;
      return (getComputedStyle(kopfEl).gridTemplateColumns || '').split(' ').map(parseFloat).filter(x => !isNaN(x)); };
    const schiebe = (a, w0, i, dx) => { const w = w0.slice(); const sum = w0[i] + w0[i + 1];
      w[i] = Math.max(MIN(a, i), Math.min(sum - MIN(a, i + 1), w0[i] + dx)); w[i + 1] = sum - w[i]; return w; };
    const zieher = (a, i) => ({
      ziehStart: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation();
        const el = ev && ev.currentTarget; const w0 = breiten(el); if (!w0 || w0.length < i + 2) return;
        const zoom = el && el.offsetWidth ? (el.getBoundingClientRect().width / el.offsetWidth) || 1 : 1; const x0 = ev.clientX;
        const zieh = (e) => this.setState({ br: { ...(this.state.br || {}), [bkey(a)]: schiebe(a, w0, i, (e.clientX - x0) / zoom) } });
        const los = () => { window.removeEventListener('mousemove', zieh); window.removeEventListener('mouseup', los); this.setState({ zieht: false }); };
        window.addEventListener('mousemove', zieh); window.addEventListener('mouseup', los); this.setState({ zieht: true }); },
      reset: (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); const n = { ...br }; delete n[bkey(a)]; this.setState({ br: n }); },
      taste: (e) => { const k = e && e.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight') return; if (e.preventDefault) e.preventDefault();
        const w0 = br[bkey(a)] ? null : breiten(e.currentTarget); const basis = br[bkey(a)] || w0; if (!basis) return;
        this.setState({ br: { ...br, [bkey(a)]: schiebe(a, basis, i, k === 'ArrowRight' ? 12 : -12) } }); } });
    const kopf = (l0, a) => { const l = l0.filter(x => sichtK(a).includes(x[0])); return l.map(([k, tx, re], i) => { const on = sortK === k; return { zelle: 'hk' + (re ? ' re' : ''), zieh: i < l.length - 1, ...zieher(a, i), t: tx, cls: 'sk' + (re ? ' re' : '') + (on ? ' on' + (sortAuf ? '' : ' hoch') : ''),
      aria: on ? (sortAuf ? 'ascending' : 'descending') : 'none', titel: 'Nach ' + SPALTE[k] + ' sortieren',
      klick: () => neu({ sortK: k, sortAuf: on ? !sortAuf : true }) }; }); };
    const SPN = { b: { ruf: 'Funkkennung', typ: 'Typ', status: 'Status', lst: 'Letzter Standort', ziel: 'Fahrtziel', code: 'Code', eta: 'Ankunft' }, n: { ruf: 'Fahrzeug (mit Typ)', status: 'Status', fahrt: 'Fahrtziel', code: 'Code', eta: 'Ankunft' }, s: { status: 'Status (Ziffer)', ruf: 'Fahrzeug (mit Typ)', fahrt: 'Fahrtziel', code: 'Code' } };
    const spMenue = KEYS[lay].map(k => { const an = sichtK(lay).includes(k); return { t: SPN[lay][k], an: an ? 'true' : 'false', cls: 'mz hk2' + (an ? ' an' : ''),
      klick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); const cur = aus[lay] || []; const neuA = an ? cur.concat([k]) : cur.filter(x => x !== k); if (neuA.length >= KEYS[lay].length) return; this.setState({ aus: { ...aus, [lay]: neuA } }); } }; });
    const spaltenRechts = (e) => { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); const sec = e && e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.fe') : null; if (!sec) return;
      const r = sec.getBoundingClientRect(); const z = sec.offsetWidth ? r.width / sec.offsetWidth : 1; let x = (e.clientX - r.left) / z, y = (e.clientY - r.top) / z;
      this.setState({ spm: { x: Math.max(6, Math.min(x, sec.offsetWidth - 240)), y: Math.max(6, Math.min(y, sec.offsetHeight - 330)) } }); };
    const zeile = (f) => {
      const frei = !f.auf;
      return { cls: 'lz fzz s' + f.s + (f.funk ? ' funk' : '') + (sel === f.id ? ' gewaehlt' : ''), stil: f.stil, id: f.id, eid: f.eid || '', st: f.nr, ruf: f.ruf, typ: f.typ, wache: f.wache, crew: f.crew,
        aussen: !!f.aussen, marken: f.marken, ort: f.nach || f.von || '', ortCls: 'ort2' + (f.nach ? '' : ' nur'), stx: f.stx, von: f.von || '', nach: f.nach || '', hatWeg: !!f.von, hatNach: !!f.nach, codes: f.codes, aufVor: frei ? f.stx : '', aufNr: frei ? '' : f.auf[0], aufText: frei ? '' : f.auf[1], eta: f.eta,
        klick: () => { this.setState({ sel: f.id }); app.klick(f.id); }, folgen: () => { this.setState({ sel: f.id }); app.folgen(f.id); },
        menue: (e) => { if (e && e.preventDefault) e.preventDefault(); if (e && e.stopPropagation) e.stopPropagation(); const sec = e && e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.fe') : null; const r = sec ? sec.getBoundingClientRect() : { left: 0, top: 0, width: g.breite }; const z = sec && sec.offsetWidth ? r.width / sec.offsetWidth : 1;
          const H = sec ? sec.offsetHeight : g.hoehe; const mh = 46 + (app.menueStatus.length + (app.weitere(f.id).length ? 1 : 0)) * 30 + app.weitere(f.id).length * 30;
          let x = ((e ? e.clientX : 40) - r.left) / z, y = ((e ? e.clientY : 120) - r.top) / z; x = Math.min(x, g.breite - 230); this.setState({ menue: { id: f.id, x: Math.max(6, x), y: Math.max(6, Math.min(y, H - mh - 6)) } }); } };
    };
    // Alle: nach Dienststelle
    const reihen = sichtbarB.filter(passt);
    // Gruppen: alles mit derselben Nummer vor dem „/“; Hubschrauber eigene Gruppe (zuletzt); Name nach Bezirk (aus den Spieldaten)
    const namen = [];
    reihen.forEach(f => { if (!namen.includes(f.gKey)) namen.push(f.gKey); });
    const gOrd = (k) => k === 'Hubschrauber' ? 1e6 : /^\d+$/.test(k) ? Number(k) : 5e5;
    namen.sort((x, y) => gOrd(x) - gOrd(y) || x.localeCompare(y, 'de'));
    const dienststellen = namen.map(n => { const l = sortiere(reihen.filter(f => f.gKey === n)); const offen = !zu[n] || !!such;
      const orte = []; l.forEach(f => { if (f.wache && !orte.includes(f.wache)) orte.push(f.wache); });
      return { name: l[0].gName, orte: orte.join(' · '), offen: offen ? 'true' : 'false',
        kopfCls: 'dst' + (offen ? '' : ' zu'), inCls: 'dst-in' + (offen ? '' : ' zu'), klick: () => { this.zuSeit = Date.now(); this.setState({ zu: { ...zu, [n]: !zu[n] } }); setTimeout(() => this.forceUpdate(), 420); },
        // zugeklappte Gruppen: Zeilen nur kurz nach dem Zuklappen (für die Animation), sonst leer – spart viele Zeilen
        fz: offen || (this.zuSeit && Date.now() - this.zuSeit < 400) ? l.map(zeile) : [] }; });
    // Aktive
    const aktiveAlle = sichtbarB.filter(f => aktivSt(f));
    const aktiveRoh = aktiveAlle.filter(f => passt(f) && (stFilter === 'alle' || f.key === stFilter));
    const ORD = ['alarmWache', 'alarmFunk', 'alarmiert', 'zumBO', 'amBO', 'zumZO', 'amZO', 'freiFunk', 'dienstfahrt', 'bereitschaft'];
    const daSt = ORD.filter(s => aktiveAlle.some(f => f.key === s && passt(f)));
    const SD = app.status;
    const statusChips = [{ t: 'jeder Status', n: String(aktiveAlle.filter(f => passt(f)).length), cls: 'chip' + (stFilter === 'alle' ? ' on' : ''), an: stFilter === 'alle' ? 'true' : 'false', hatFarbe: false, farbe: '', nr: '', klick: () => neu({ stFilter: 'alle' }) }]
      .concat(daSt.map(s => ({ t: SD[s].name, nr: SD[s].nr, farbe: SD[s].farbe, hatFarbe: true, n: String(aktiveAlle.filter(f => f.key === s && passt(f)).length), cls: 'chip' + (stFilter === s ? ' on' : ''), an: stFilter === s ? 'true' : 'false', klick: () => neu({ stFilter: stFilter === s ? 'alle' : s }) })));
    // Statusänderungen (neueste oben)
    const logRoh = ansicht === 'log' ? app.log() : [];
    const log = logRoh.filter(l => (!st.nurEinsatz || l.einsatz) && (bereichAlle || !l.fremd) && (!such || l.suche.includes(such)))
      .slice(0, 300)
      .map(l => ({ zeit: l.zeit, ruf: l.ruf, von: SD[l.von].nr, nach: SD[l.nach].nr, vonFarbe: SD[l.von].farbe, nachFarbe: SD[l.nach].farbe, vonCls: 'sc' + (SD[l.von].funk ? ' funk' : ''), nachCls: 'sc' + (SD[l.nach].funk ? ' funk' : ''),
        text: l.text, titel: SD[l.von].nr + ' ' + SD[l.von].name + ' → ' + SD[l.nach].nr + ' ' + SD[l.nach].name + ' · Klick: Fahrzeug auf der Karte zeigen', klick: () => app.logKlick(l.id) }));
    const m = st.menue ? fz.find(f => f.id === st.menue.id) : null;
    const weitere = m ? app.weitere(m.id) : [];
    const gefiltert = !!such || gruppe !== 'alle' || stFilter !== 'alle';
    return {
      ...g,
      such: st.such || '', suchEin: (e) => neu({ such: e && e.target ? e.target.value : '' }),
      suchPlatz: ansicht === 'log' ? 'Fahrzeug, Status, Einsatz …' : 'Fahrzeug, Funkrufname, Dienststelle, Einsatz …',
      zeigGruppen: ansicht !== 'log', zeigNurEinsatz: ansicht === 'log', zeigStatus: ansicht === 'aktive',
      nurEinsatzCls: 'chip' + (st.nurEinsatz ? ' on' : ''), nurEinsatzAn: st.nurEinsatz ? 'true' : 'false', nurEinsatzKlick: () => neu({ nurEinsatz: !st.nurEinsatz }),
      gruppen: GR.map(([k, tx, f, ti]) => ({ t: k === 'sek' && g.breite < 440 ? 'Sek.' : tx, titel: (ti || tx) + ' · ' + sichtbarB.filter(f).length, cls: 'seg' + (gruppe === k ? ' on' : ''), an: gruppe === k ? 'true' : 'false', klick: () => neu({ gruppe: k }) })),
      gruppeIdx: String(Math.max(0, GR.findIndex(x => x[0] === gruppe))), gruppeN: String(GR.length),
      bereich: [[app.bereichName(), false], ['Alle', true]].map(([tx, a]) => ({ t: tx, an: bereichAlle === a ? 'true' : 'false', cls: 'seg' + (bereichAlle === a ? ' on' : ''), klick: () => { neu({ bereichAlle: a }); app.bereichGeaendert && setTimeout(app.bereichGeaendert, 0); } })), bereichIdx: bereichAlle ? '1' : '0',
      statusChips,
      istAlle: ansicht === 'alle', istAktive: ansicht === 'aktive', istLog: ansicht === 'log',
      listeCls: 'liste2 lay-' + lay + ' ' + (sw % 2 ? 'swA' : 'swB') + (st.zieht ? ' zieht' : '') + KEYS[lay].filter(k => !sichtK(lay).includes(k)).map(k => ' ohne-' + k + (k === 'ruf' && lay !== 'b' ? ' ohne-typ' : '')).join(''), logCls: 'liste2 ' + (sw % 2 ? 'swA' : 'swB'),
      dienststellen, aktive: ansicht === 'aktive' ? sortiere(aktiveRoh).map(zeile) : [],
      keineAlle: ansicht === 'alle' && reihen.length === 0, keineAlleText: fz.length ? 'Nichts passt zum Filter.' : 'Keine Fahrzeuge – unter Einstellungen → Leitstelle → Fahrzeuge anlegen.',
      kopfN: kopf([['ruf', 'Fahrzeug'], ['status', 'Status'], ['fahrt', 'Fahrtziel'], ['code', 'Code'], ['eta', 'Ankunft', true]], 'n'),
      kopfB: kopf([['ruf', 'Funkkennung'], ['typ', 'Typ'], ['status', 'Status'], ['lst', 'Letzter Standort'], ['ziel', 'Fahrtziel'], ['code', 'Code'], ['eta', 'Ankunft', true]], 'b'),
      kopfS: kopf([['status', 'St'], ['ruf', 'Fahrzeug'], ['fahrt', 'Fahrtziel'], ['code', 'Code', true]], 's'),
      colsN: cols('n'), colsB: cols('b'), colsS: cols('s'),
      gVars: sichtK(lay).map((k, i) => '--g-' + k + ': ' + (i + 1) + ';').join(' ') + (lay === 'b' ? '' : ' --g-typ: ' + (sichtK(lay).indexOf('ruf') + 1) + ';'),
      spaltenRechts, spOffen: !!st.spm, spX: st.spm ? String(Math.round(st.spm.x)) : '0', spY: st.spm ? String(Math.round(st.spm.y)) : '0', spZu: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ spm: null }); },
      spMenue, spStandard: () => { const n = { ...aus }; delete n[lay]; this.setState({ aus: n, spm: null }); }, spHinweis: { b: 'gilt für breite Fenster', n: 'gilt für normale Fenster', s: 'gilt für schmale Fenster' }[lay],
      keineAktiven: ansicht === 'aktive' && aktiveRoh.length === 0, keineAktivenText: aktiveAlle.length && gefiltert ? 'Nichts passt zum Filter.' : 'Kein Fahrzeug unterwegs – alle frei auf der Wache oder abgemeldet.',
      log, keinLog: ansicht === 'log' && log.length === 0, keinLogText: logRoh.length ? 'Nichts passt zum Filter.' : 'Noch keine Statusänderungen in diesem Spiel.',
      menueOffen: !!m, menueX: m ? String(Math.round(st.menue.x)) : '0', menueY: m ? String(Math.round(st.menue.y)) : '0', menueRuf: m ? m.ruf : '', menueZu: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ menue: null }); },
      menueStatus: app.menueStatus.map(s => ({ nr: SD[s].nr, name: SD[s].name, farbe: SD[s].farbe, scCls: 'sc' + (SD[s].funk ? ' funk' : ''), cls: 'mz' + (m && m.key === s ? ' akt' : ''), klick: () => { if (!m) return; this.setState({ menue: null }); app.setzeStatus(m.id, s); } })),
      menueMehr: weitere.length > 0, menueWeitere: weitere.map(w => ({ t: w.t, klick: () => { this.setState({ menue: null }); w.klick(); } })),
      // für den Reiter (Zahl)
      _zahlAlle: sichtbarB.length, _zahlAktiv: aktiveAlle.length,
    };
  }
}
