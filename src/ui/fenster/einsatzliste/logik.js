// Einsatzliste – Logik aus dem Entwurf „LeitWerk Arbeitsplatz“ (Einsatzliste.dc.html, von Paul am 09.11. abgenommen).
// Beispieldaten des Entwurfs sind durch die echten Einträge ersetzt (props.app.daten(), siehe index.ts),
// Knöpfe rufen die echten Aktionen (props.app.…). Filter, Spaltenwahl, Breiten und Sortierung werden je Fenster gemerkt.
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

export const LAGE_T = { anruf: 'Anruf', dispo: 'disponieren', vorgemerkt: 'vorgemerkt', zumbo: 'zum BO', ambo: 'am BO', zumzo: 'zum ZO', amzo: 'am ZO', erledigt: 'erledigt' };
export const LAGE_L = { anruf: 'Anruf läuft', dispo: 'disponieren', vorgemerkt: 'Fahrzeug vorgemerkt – fährt selbst los', zumbo: 'zum Berufungsort', ambo: 'am Berufungsort', zumzo: 'zum Zielort', amzo: 'am Zielort', erledigt: 'erledigt' };
const LAGE_R = { anruf: 0, dispo: 1, vorgemerkt: 2, zumbo: 3, ambo: 4, zumzo: 5, amzo: 6, erledigt: 7 };
// Fahrtziel: was gerade angefahren wird – BO bis „am BO“, danach ZO
const zielVon = (e) => (['zumzo', 'amzo', 'erledigt'].includes(e.lage) && e.zo) ? { t: e.zo, w: 'ZO' } : { t: e.bo, w: 'BO', gem: e.boGem };
const ALLE = [
  { k: 'lage', t: 'Zustand', w: 100 }, { k: 'nr', t: 'Nr', w: 70 }, { k: 'code', t: 'Code', w: 96 }, { k: 'sw', t: 'Stichwort', w: 230 },
  { k: 'bo', t: 'Berufungsort', w: 180 }, { k: 'zo', t: 'Zielort', w: 160 }, { k: 'ziel', t: 'Fahrtziel (BO oder ZO)', kurz: 'Fahrtziel', w: 180 }, { k: 'fz', t: 'Fahrzeuge', w: 220 }, { k: 'mk', t: 'Hinweis', w: 180 }, { k: 'info', t: 'Mehr Infos (i-Symbol)', w: 26, fix: true },
];
const STD_SICHT = { b: ['lage', 'nr', 'code', 'sw', 'bo', 'zo', 'fz', 'mk'], m: ['lage', 'code', 'sw', 'bo', 'zo', 'fz', 'info'], n: ['lage', 'code', 'bo', 'zo', 'info'], s: ['code', 'ziel', 'info'] };
const STD_W = { m: { lage: 120, code: 100, sw: 200, bo: 160, zo: 150, fz: 180 }, n: { lage: 112, code: 100, bo: 150, zo: 130 }, s: { code: 96, ziel: 170 } };
const TYP_R = ['NAH', 'NEF', 'BEL', 'EL-Fzg', 'RTW-C', 'RTW', 'KTW', 'KIT'];
const typRang = (f) => { const i = TYP_R.indexOf(f.rm || f.typ); return i < 0 ? 99 : i; };
const RANGCODE = (c) => { const m = (c || '').match(/-\d+([A-Z])/); return m ? 'EDCBAKOZ'.indexOf(m[1]) : 99; };
const dringendMk = (e) => e.mk.some(m => m.dringend);

export class EinsatzlisteLogik extends DCLogic {
  constructor(p) {
    super(p);
    // gemerkte Einstellungen dieses Fensters (Filter, Spalten je Breite, Breiten, Sortierung)
    const m = (p && p.app && p.app.gemerkt) || {};
    this.state = { art: ['alle', 'rd', 'kt', 'sek'].includes(m.art) ? m.art : undefined, zuTun: m.zuTun, erl: m.erledigt, sicht: m.sicht, bw: m.bw, sortK: m.sortK, sortAuf: m.sortAuf };
  }
  setState(p) {
    super.setState(p);
    const s = this.state, app = this.props.app;
    if (app && app.merken) app.merken({ art: s.art, zuTun: s.zuTun, erledigt: s.erl, sicht: s.sicht, bw: s.bw, sortK: s.sortK, sortAuf: s.sortAuf });
  }
  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const B = Number(this.props.breite) || 560;
    const DATEN = app.daten();

    // ---- Filter
    const art = st.art || 'alle';
    const zuTun = !!st.zuTun;
    const erl = !!st.erl;
    const q = (st.q || '').trim().toLowerCase();
    const ARTEN = [['alle', 'Alle'], ['rd', 'Notfall'], ['kt', 'KT'], ['sek', B <= 430 ? 'SEK' : 'Überstellung']];
    const passtArt = (e, a) => a === 'alle' || e.art === a;
    const istTun = (e) => e.lage === 'dispo' || e.lage === 'anruf' || e.tun;
    const sichtbar = DATEN.filter(e => passtArt(e, art) && (erl || e.lage !== 'erledigt') && (!zuTun || istTun(e))
      && (!q || q.split(/\s+/).every(w => e.such.includes(w))));

    // ---- Spalten: Auswahl per Rechtsklick (Hakerl), je Breite gemerkt
    const iw = B - 28;
    const lay = iw >= 1200 ? 'b' : iw >= 700 ? 'm' : iw >= 400 ? 'n' : 's';
    const sicht = (st.sicht || {})[lay] || STD_SICHT[lay];
    const SP = ALLE.filter(c => sicht.includes(c.k));
    const nurCode = !sicht.includes('sw');
    const bw = { ...((st.bw || {})[lay] || {}) };
    const wv = (c) => bw[c.k] || (STD_W[lay] || {})[c.k] || c.w;
    const cols = SP.map(c => c.fix ? '26px' : 'minmax(0,' + wv(c) + 'fr)').join(' ');
    // wie viele Fahrzeug-Kastl passen in die Spalte? Rest als „+n“
    const summe = SP.reduce((a, c) => a + (c.fix ? 0 : wv(c)), 0);
    const fzC = SP.find(c => c.k === 'fz');
    const fzPx = fzC ? (iw - 26 - 12 * (SP.length - 1) - SP.filter(c => c.fix).length * 26) * wv(fzC) / summe : 0;
    const passen = Math.max(1, Math.floor((fzPx + 4) / 66));
    const sortK = st.sortK || null, auf = st.sortAuf !== undefined ? st.sortAuf : true;
    const W = { lage: e => LAGE_R[e.lage], nr: e => e.nrVoll, code: e => (e.code ? RANGCODE(e.code) : 98) + e.code, sw: e => e.sw || '~', bo: e => e.bo, zo: e => e.zo || '~', ziel: e => zielVon(e).t, fz: e => -e.fz.length, mk: e => -e.mk.length, info: e => e.rang };
    const liste = sortK && W[sortK] && sicht.includes(sortK)
      ? sichtbar.slice().sort((x, y) => { const a = W[sortK](x), b = W[sortK](y); const r = typeof a === 'string' ? a.localeCompare(b, 'de') : a < b ? -1 : a > b ? 1 : 0; return (auf ? r : -r) || x.rang - y.rang; })
      : sichtbar.slice().sort((x, y) => x.rang - y.rang);
    const breiten = (el) => { const k = el && el.closest ? el.closest('.ek') : null; if (!k) return null; return (getComputedStyle(k).gridTemplateColumns || '').split(' ').map(parseFloat).filter(x => !isNaN(x)); };
    const letzte = SP.length - 1 - (SP[SP.length - 1] && SP[SP.length - 1].fix ? 1 : 0);
    const kopf = SP.map((s, i) => ({ zelle: 'hk', t: s.fix ? '' : (s.kurz || s.t), tab: s.fix ? '-1' : '0', titel: s.fix ? '' : 'Nach ' + s.t + ' sortieren (dritter Klick: wieder nach Dringlichkeit) · Rechtsklick: Spalten wählen',
      cls: 'sk' + (sortK === s.k ? ' on' + (auf ? '' : ' hoch') : ''), aria: sortK === s.k ? (auf ? 'ascending' : 'descending') : 'none',
      klick: () => { if (s.fix) return; this.setState(sortK !== s.k ? { sortK: s.k, sortAuf: true } : auf ? { sortAuf: false } : { sortK: null, sortAuf: true }); },
      zieh: i < letzte,
      ziehStart: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation();
        const el = ev && ev.currentTarget; const w0 = breiten(el); if (!w0 || w0.length < i + 2) return;
        const zoom = el && el.offsetWidth ? (el.getBoundingClientRect().width / el.offsetWidth) || 1 : 1; const x0 = ev.clientX;
        const zieh = (e) => { const sum = w0[i] + w0[i + 1]; const a = Math.max(40, Math.min(sum - 40, w0[i] + (e.clientX - x0) / zoom));
          const n = {}; SP.forEach((c, j) => { if (!c.fix) n[c.k] = Math.round(j === i ? a : j === i + 1 ? sum - a : w0[j]); });
          this.setState({ bw: { ...(this.state.bw || {}), [lay]: n } }); };
        const los = () => { window.removeEventListener('mousemove', zieh); window.removeEventListener('mouseup', los); this.setState({ zieht: false }); };
        window.addEventListener('mousemove', zieh); window.addEventListener('mouseup', los); this.setState({ zieht: true }); },
      reset: () => { const nn = { ...(st.bw || {}) }; delete nn[lay]; this.setState({ bw: nn }); } }));

    // ---- Zellen
    const sel = app.auswahlId();
    const kastl = (f) => ({ id: f.id, r: f.r, cls: 'fzk s' + f.s.toLowerCase(), titel: f.r + ' · ' + f.typ + (f.zu ? ' · ' + f.zu : ''), typ: f.typ, zu: f.zu });
    const leerC = { zielZ: false, lageZ: false, nr: false, code: false, swz: false, ortz: false, fz: false, marken: false, mehr: false };
    const ctText = (e) => e.stufe + ' · ' + e.sw + (e.zi ? ' · ' + e.zi : '');
    const zCode = (e) => ({ ...leerC, code: true, titel: e.code && !nurCode ? e.code : '', t: e.code || (e.lage === 'anruf' ? 'Abfrage' : 'ohne Code'), cdCls: 'cd' + (e.code ? '' : ' leer'), farbe: e.farbe || 'transparent', hatCt: !!e.code && nurCode, ct: e.code ? ctText(e) : '' });
    const info = (e) => [['Nr', e.nrVoll + ' · Eingang ' + e.ein], ['Zustand', LAGE_L[e.lage]], ['Stichwort', e.sw ? e.sw + (e.zi ? ' · ' + e.zi : '') : '–'], ['Berufungsort', e.bo], ['Zielort', e.zo || '–'], ['Hinweis', e.mk.length ? e.mk.map(m => m.t).join(' · ') : '–']].filter(([k]) => k === 'Nr' || k === 'Hinweis' || k === 'Stichwort' || !sicht.includes({ Zustand: 'lage', Berufungsort: 'bo', Zielort: 'zo' }[k])).map(([k, v]) => ({ k, v }));
    const zelle = (c, e) => {
      if (c.k === 'lage') return { ...leerC, lageZ: true, t: LAGE_T[e.lage], cls: 'zst ' + e.lage + (e.neu ? ' neu' : ''), titel: LAGE_L[e.lage] + (e.neu ? ' – noch nie disponiert' : '') };
      if (c.k === 'nr') return { ...leerC, nr: true, t: e.nr, u: e.ein, titel: e.nrVoll + ' · Eingang ' + e.ein };
      if (c.k === 'code') return zCode(e);
      if (c.k === 'sw') return { ...leerC, swz: true, t: e.sw || '–', zi: e.zi || '', hatZi: !!e.zi };
      if (c.k === 'bo') return { ...leerC, ortz: true, t: e.bo, cls: 'ortt zz' + (e.boGem ? ' gem' : '') };
      if (c.k === 'ziel') { const z = zielVon(e); return { ...leerC, zielZ: true, t: z.t, wT: (z.w === 'BO' ? 'Berufungsort' : 'Zielort') + ': ' + z.t, wCls: 'zk ' + z.w.toLowerCase() + (z.gem ? ' gem' : '') }; }
      if (c.k === 'zo') return { ...leerC, ortz: true, t: e.zo || '–', cls: 'ortt zz' + (e.zo ? '' : ' strich') };
      if (c.k === 'fz') { const n = e.fz.length > passen ? Math.max(1, passen - 1) : e.fz.length; const sortiert = e.fz.slice().sort((a, b) => typRang(a) - typRang(b));
        return { ...leerC, fz: true, fzl: e.fz.slice(0, n).map(kastl), hatRest: e.fz.length > n, rest: '+' + (e.fz.length - n), alle: sortiert.map(kastl), keinFz: !e.fz.length, leerT: e.lage === 'dispo' ? 'noch kein Fahrzeug' : '–', keinCls: 'keinfz' + (e.lage === 'dispo' ? ' rot' : '') }; }
      if (c.k === 'mk') return { ...leerC, marken: true, mk: e.mk };
      if (c.k === 'info') { const fzAlle = e.fz.slice().sort((a, b) => typRang(a) - typRang(b)).map(kastl);
        return { ...leerC, mehr: true, info: info(e), iFz: !sicht.includes('fz') && fzAlle.length > 0, iFzl: fzAlle, iMk: false, mehrCls: 'mehr' + (dringendMk(e) && !sicht.includes('mk') ? ' achtung' : '') }; }
      return leerC;
    };
    const zeilen = liste.map(e => ({ id: e.id, cls: 'ez ' + e.lage + (e.neu ? ' neu' : '') + (sel === e.id ? ' gew' : '') + (e.fremd ? ' fremd' : ''), zellen: SP.map(c => zelle(c, e)),
      klick: () => app.oeffnen(e),
      doppel: () => app.karte(e) }));

    // ---- Rechtsklick: Spalten wählen
    const ctx = st.ctx || null;
    const spaltenMenue = ALLE.map(c => { const an = sicht.includes(c.k);
      return { t: c.t, an: an ? 'true' : 'false', cls: 'mz hk2' + (an ? ' an' : ''), klick: (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); const neu = an ? sicht.filter(x => x !== c.k) : ALLE.map(x => x.k).filter(x => x === c.k || sicht.includes(x)); if (!neu.filter(x => x !== 'info').length) return; this.setState({ sicht: { ...(st.sicht || {}), [lay]: neu } }); } }; });
    const rechts = (ev) => { if (!ev) return; if (ev.preventDefault) ev.preventDefault(); const fe = ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget.closest('.fe') : null; if (!fe) return;
      const r = fe.getBoundingClientRect(); const z = fe.offsetWidth ? r.width / fe.offsetWidth : 1; const x = (ev.clientX - r.left) / z, y = (ev.clientY - r.top) / z;
      this.setState({ ctx: { x: Math.max(8, Math.min(fe.offsetWidth - 248, x)), y: Math.max(8, Math.min(fe.offsetHeight - 380, y)) } }); };

    const offen = (a) => DATEN.filter(e => passtArt(e, a) && e.lage !== 'erledigt');
    const dringend = (a) => DATEN.filter(e => passtArt(e, a) && (e.lage === 'dispo' || e.lage === 'anruf')).length;
    const artIdx = Math.max(0, ARTEN.findIndex(a => a[0] === art));
    const neuOffen = st.menue === 'neu', testOffen = st.menue === 'test';
    const T = (n, h, f, o = {}) => ({ n, h, tr: !!o.tr, cls: 'mz' + (o.warn ? ' warn' : ''), klick: () => { this.setState({ menue: null }); f(); } });
    const testPunkte = [T('Notfall', 'zufällig', () => app.test('rd')), T('Krankentransport', 'zufällig', () => app.test('kt')), T('Überstellung', 'zufällig', () => app.test('sek'))];
    if (app.host()) testPunkte.push(T('Großschadensfall auslösen', 'nur Host', () => app.test('gs'), { tr: true, warn: true }));
    testPunkte.push(T('Testlauf KI-Gespräche …', '', () => app.test('testlauf', art), { tr: true }));
    return {
      rootCls: 'el-wurzel' + (st.zieht ? ' zieht' : ''),
      q: st.q || '', suche: (e) => this.setState({ q: e && e.target ? e.target.value : '' }),
      neuAuf: () => this.setState({ menue: neuOffen ? null : 'neu' }), testAuf: () => this.setState({ menue: testOffen ? null : 'test' }), menueZu: () => this.setState({ menue: null }),
      neuOffen, testOffen,
      neuKT: () => { this.setState({ menue: null }); app.neu('kt'); }, neuSEK: () => { this.setState({ menue: null }); app.neu('sek'); },
      testPunkte,
      artIdx, arten: ARTEN.map(([k, t]) => { const d = dringend(k); const o = offen(k).length; return { t, cls: 'seg' + (k === art ? ' on' : ''), an: k === art ? 'true' : 'false', n: String(o), nCls: 'n' + (d ? ' rot' : ''), titel: o + ' offen' + (d ? ', ' + d + ' brauchen dich' : ''), klick: () => this.setState({ art: k }) }; }),
      zuTunCls: 'chip' + (zuTun ? ' on' : ''), zuTunAn: zuTun ? 'true' : 'false', zuTunKlick: () => this.setState({ zuTun: !zuTun }),
      erlCls: 'chip' + (erl ? ' on' : ''), erlAn: erl ? 'true' : 'false', erlKlick: () => this.setState({ erl: !erl }),
      cols, kopf, zeilen, nurCode,
      tabCls: 'tab-l' + (nurCode ? ' nurcode' : ''),
      rechts, ctxOffen: !!ctx, ctxX: ctx ? ctx.x : 0, ctxY: ctx ? ctx.y : 0, spaltenMenue, ctxZu: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); this.setState({ ctx: null }); },
      ctxStandard: () => { const nn = { ...(st.sicht || {}) }; delete nn[lay]; const bb = { ...(st.bw || {}) }; delete bb[lay]; this.setState({ sicht: nn, bw: bb, ctx: null }); },
      ctxHinweis: { b: 'gilt für breite Fenster', m: 'gilt für mittlere Fenster', n: 'gilt für normale Fenster', s: 'gilt für schmale Fenster' }[lay],
      leer: !zeilen.length, leerText: app.keineDaten() ? 'Noch keine Einsätze. Die Simulation erzeugt Einsätze, sobald die Uhr läuft.' : 'Nichts passt zum Filter.',
      hatToast: false, toast: '',
    };
  }
}
