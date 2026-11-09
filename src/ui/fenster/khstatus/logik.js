// Logik des KH-Status-Fensters – aus dem Entwurf „KHStatus.dc.html“ übernommen.
// Statt der Beispieldaten kommen Krankenhäuser, Plätze, Akutversorgung und „Wer belegt“ aus dem Spiel (props.app, siehe index.ts).
// Unterschied zur Entwurfsfläche: props.breite ist die Breite des Fensters selbst (ohne den Rand der Fläche).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

// Dauerhaft gemerkt (je Reiter): Filter, Sortierung, Spaltenreihenfolge und -breiten
const MERKEN = ["land", "rett", "sortK", "sortAuf", "ord", "br"];

export class KHStatusLogik extends DCLogic {
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
    const g = { breite: Number(this.props.breite) || 560, hoehe: Number(this.props.hoehe) || 1000 };
    const ansicht = app.ansicht || 'plaetze';
    const akut = ansicht === 'akut';
    const sw = st.sw || 0;
    const neu = (patch) => this.setState({ ...patch, sw: sw + 1 });

    // ---- Krankenhäuser aus dem Spiel (Plätze: [frei, gesamt] · 'zu' · 'offen' ohne Zählung · null = gibt es nicht)
    const haeuserRoh = app.haeuser();

    // ---- Spalten: Plätze (wie bisher im Spiel) und Akutversorgung (wie die Übersicht der Leitstelle)
    const SP_P = [
      { k: 'nfa', kurz: 'NFA', t: 'NFA', lang: 'NFA', titel: 'Notaufnahme' },
      { k: 'unf', kurz: 'UNF', t: 'UNF', lang: 'UNF', titel: 'Unfallaufnahme' },
      { k: 'kin', kurz: 'KIN', t: 'KIN', lang: 'Kinder', titel: 'Kindernotaufnahme' },
      { k: 'sr', kurz: 'SR', t: 'SR', lang: 'Schockraum', titel: 'Schockraum (Trauma und internistisch)' },
      { k: 'pci', kurz: 'PCI', t: 'PCI', lang: 'PCI', titel: 'Herzkatheter' },
      { k: 'str', kurz: 'STR', t: 'STR', lang: 'STR', titel: 'Stroke Unit' },
      { k: 'krs', kurz: 'KRS', t: 'KRS', lang: 'KRS', titel: 'Kreißsaal' },
    ];
    const SP_A = [
      { k: 'srt', kurz: 'SRT', t: 'SRT', lang: 'SRT', titel: 'Schockraum Trauma' },
      { k: 'sri', kurz: 'SRI', t: 'SRI', lang: 'SRI', titel: 'Schockraum internistisch' },
      { k: 'pci', kurz: 'PCI', t: 'PCI', lang: 'PCI', titel: 'Herzkatheter' },
      { k: 'ct', kurz: 'CT', t: 'CT', lang: 'CT', titel: 'Computertomographie' },
      { k: 'end', kurz: 'END', t: 'END', lang: 'END', titel: 'Endoskopie' },
      { k: 'str', kurz: 'STR', t: 'STR', lang: 'Stroke', titel: 'Stroke Unit' },
      { k: 'nfa', kurz: 'NFA', t: 'NFA', lang: 'NFA', titel: 'Notaufnahme', trenn: true },
      { k: 'unf', kurz: 'UNF', t: 'UNF', lang: 'UNF', titel: 'Unfallaufnahme' },
      { k: 'kind', kurz: 'KIN', t: 'KIND', lang: 'KIND', titel: 'Kindernotaufnahme / Kinderabteilung', trenn: true },
      { k: 'krs', kurz: 'KRS', t: 'KRS', lang: 'KRS', titel: 'Kreißsaal' },
    ];
    const SP_STD = akut ? SP_A : SP_P;
    const ordn = (st.ord || {})[ansicht];
    const eigeneReihe = !!ordn;
    const SP = eigeneReihe ? ordn.map(k => SP_STD.find(x => x.k === k)).filter(Boolean).map(x => ({ ...x, trenn: false })) : SP_STD;

    // ---- Filter
    const LAND = [['noe', 'Niederösterreich'], ['alle', 'Alle Bundesländer']];
    const land = st.land || 'noe';
    const rett = st.rett !== undefined ? st.rett : true;
    // Textsuche: jedes Wort muss passen – Name, Ort, Bundesland oder eine Abteilung (dann nur Häuser, die sie haben)
    const ABT = [...SP_P.map(x => ({ w: [x.kurz, x.t, x.lang, x.titel], p: x.k })), ...SP_A.map(x => ({ w: [x.kurz, x.t, x.lang, x.titel], a: x.k }))];
    const woerter = (st.such || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const passtWort = (h, w) => (h.kurz + ' ' + h.name + ' ' + h.ort + ' ' + h.land).toLowerCase().includes(w)
      || ABT.some(x => x.w.some(n => String(n).toLowerCase().startsWith(w)) && (x.p ? h.P[x.p] != null : h.A[x.a] != null));
    let liste = haeuserRoh.filter(h => (land === 'alle' || h.land === 'Niederösterreich') && (!rett || h.rett) && woerter.every(w => passtWort(h, w)));

    // ---- Sortieren über die Spaltenköpfe (Standard: nach Name); bei Plätzen nach freien Plätzen, „zu“ und „gibt es nicht“ ans Ende
    const sortK = st.sortK || 'name';
    const sortAuf = st.sortK ? st.sortAuf !== false : true;
    const RANG = { ok: 0, voll: 1, zu: 2 };
    const wert = (h, k) => {
      if (k === 'name') return h.kurz;
      if (akut) { const v = h.A[k]; if (v == null) return null; const l = Array.isArray(v) ? v : [v]; return l.includes('ok') ? -l.filter(x => x === 'ok').length : RANG[l[0]]; }
      const v = h.P[k]; if (v == null || v === 'zu') return null; if (v === 'offen') return -1; return -v[0];
    };
    liste = liste.slice().sort((a, b) => { const x = wert(a, sortK), y = wert(b, sortK);
      if (x === null || y === null) return x === y ? a.kurz.localeCompare(b.kurz, 'de') : x === null ? 1 : -1;
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de'); return (sortAuf ? r : -r) || a.kurz.localeCompare(b.kurz, 'de'); });

    // ---- Wer belegt (aus dem Spiel)
    const popAuf = (h, sp) => (e) => { if (e && e.stopPropagation) e.stopPropagation();
      const sec = e && e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('.fe') : null;
      const r = sec ? sec.getBoundingClientRect() : { left: 0, top: 0 }; const z = sec && sec.offsetWidth ? r.width / sec.offsetWidth : 1;
      const W = sec && sec.offsetWidth ? sec.offsetWidth : g.breite, Hh = sec && sec.offsetHeight ? sec.offsetHeight : g.hoehe;
      const cr = e && e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null;
      let x = cr ? (cr.left + cr.width / 2 - r.left) / z - 135 : 40, y = cr ? (cr.bottom - r.top) / z + 6 : 120;
      x = Math.max(12, Math.min(x, W - 282)); y = Math.max(12, Math.min(y, Hh - 220));
      this.setState({ pop: { kh: h.kurz, was: sp.titel, zeilen: app.belegung(h.id, akut ? 'a' : 'p', sp.k), x, y } }); };

    // ---- Zellen
    const D = { ok: 'M5 8.3l2 2 4-4.3', voll: 'M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8', zu: 'M5 8h6' };
    const sym = (z) => ({ cls: 'as ' + z, d: D[z] });
    const TXT = { ok: 'verfügbar', voll: 'belegt', zu: 'geschlossen' };
    const zelleP = (h, sp) => { const v = h.P[sp.k]; const wrap = '';
      if (v == null) return { wrap, cls: 'pz leer', istText: true, text: '–', titel: sp.titel + ': gibt es hier nicht', istZahl: false, istSym: false, klick: () => {} };
      if (v === 'zu') return { wrap, cls: 'pz zu', istText: true, text: 'zu', titel: sp.titel + ': gerade geschlossen', istZahl: false, istSym: false, klick: () => {} };
      if (v === 'offen') return { wrap, cls: 'pz offen', istText: true, text: 'offen', titel: sp.titel + ': offen (keine Plätze hinterlegt)', istZahl: false, istSym: false, klick: () => {} };
      const [frei, n] = v; const bel = n - frei; const art = frei === 0 ? 'voll' : frei / n <= 0.25 ? 'knapp' : 'frei';
      return { wrap, cls: 'pz ' + art + (bel ? ' klickbar' : ''), istZahl: true, istText: false, istSym: false, frei: String(frei), n: String(n), anteil: String(Math.round(bel / n * 100)),
        titel: (h.Pt[sp.k] || sp.titel + ': ' + frei + ' von ' + n + ' frei') + (bel ? ' – klicken: wer belegt' : ''), klick: bel ? popAuf(h, sp) : () => {} };
    };
    const zelleA = (h, sp) => { const v = h.A[sp.k]; const wrap = sp.trenn ? 'trenn' : '';
      if (v == null) return { wrap, cls: 'av leer', istText: false, istZahl: false, istSym: false, titel: sp.titel + ': gibt es hier nicht', klick: () => {} };
      const l = Array.isArray(v) ? v : [v]; const schlimmst = l.includes('ok') ? 'ok' : l.includes('voll') ? 'voll' : 'zu'; const bel = l.filter(x => x === 'voll').length && h.Ab[sp.k];
      return { wrap, cls: 'av ' + schlimmst + (bel ? ' klickbar' : ''), istSym: true, istText: false, istZahl: false, sym: l.map(sym), eins: sym(schlimmst),
        titel: (h.At[sp.k] || sp.titel + ': ' + (l.length > 1 ? l.map(x => TXT[x]).join(', ') : TXT[l[0]])) + (bel ? ' – klicken: wer belegt' : ''), klick: bel ? popAuf(h, sp) : () => {} };
    };

    // ---- Spaltenbreiten je Ansicht und Breite (ziehbar, als Anteile gemerkt)
    const STD = akut
      ? { b: 'minmax(0,2.4fr) ' + 'minmax(0,1fr) '.repeat(10).trim(), n: 'minmax(0,3fr) ' + 'minmax(0,1fr) '.repeat(10).trim(), s: 'minmax(0,3.4fr) ' + 'minmax(0,1fr) '.repeat(10).trim() }
      : { b: 'minmax(0,2.2fr) ' + 'minmax(0,1fr) '.repeat(7).trim(), n: 'minmax(0,2.6fr) ' + 'minmax(0,1fr) '.repeat(7).trim(), s: 'minmax(0,3fr) ' + 'minmax(0,1fr) '.repeat(7).trim() };
    const lay = g.breite >= 820 ? 'b' : g.breite <= 430 ? 's' : 'n';
    const bkey = ansicht + '-' + lay;
    const br = st.br || {};
    const cols = br[bkey] ? br[bkey].map(w => 'minmax(0,' + w.toFixed(1) + 'fr)').join(' ') : STD[lay];
    const MIN = 20;
    const breiten = (el) => { const k = el && el.closest ? el.closest('.kk') : null; if (!k) return null; return (getComputedStyle(k).gridTemplateColumns || '').split(' ').map(parseFloat).filter(x => !isNaN(x)); };
    const schiebe = (w0, i, dx) => { const w = w0.slice(); const sum = w0[i] + w0[i + 1]; w[i] = Math.max(MIN, Math.min(sum - MIN, w0[i] + dx)); w[i + 1] = sum - w[i]; return w; };
    const zieher = (i) => ({
      ziehStart: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation();
        const el = ev && ev.currentTarget; const w0 = breiten(el); if (!w0 || w0.length < i + 2) return;
        const zoom = el && el.offsetWidth ? (el.getBoundingClientRect().width / el.offsetWidth) || 1 : 1; const x0 = ev.clientX;
        const zieh = (e) => this.setState({ br: { ...(this.state.br || {}), [bkey]: schiebe(w0, i, (e.clientX - x0) / zoom) } });
        const los = () => { window.removeEventListener('mousemove', zieh); window.removeEventListener('mouseup', los); this.setState({ zieht: false }); };
        window.addEventListener('mousemove', zieh); window.addEventListener('mouseup', los); this.setState({ zieht: true }); },
      reset: (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); const n = { ...br }; delete n[bkey]; const o = { ...(st.ord || {}) }; delete o[ansicht]; this.setState({ br: n, ord: o }); },
      taste: (e) => { const k = e && e.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight') return; if (e.preventDefault) e.preventDefault();
        const basis = br[bkey] || breiten(e.currentTarget); if (!basis) return; this.setState({ br: { ...br, [bkey]: schiebe(basis, i, k === 'ArrowRight' ? 12 : -12) } }); } });
    const KOPF = [{ k: 'name', kurz: 'Krankenhaus', t: 'Krankenhaus', lang: 'Krankenhaus', titel: 'Name', li: true }].concat(SP);
    // Spalten verschieben: Spaltenkopf ziehen und auf einer anderen Spalte loslassen (Krankenhaus bleibt vorne)
    const greif = (i) => (ev) => { if (i < 1 || !ev || ev.button !== 0) return;
      const kopfEl = ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget.closest('.kk') : null; if (!kopfEl) return;
      const x0 = ev.clientX; let aktiv = false;
      const ziel = (e) => { let b = -1; Array.from(kopfEl.querySelectorAll('.hk')).forEach((h, j) => { const r = h.getBoundingClientRect(); if (e.clientX >= r.left - 4 && e.clientX <= r.right + 4) b = j; }); return b; };
      const mv = (e) => { if (!aktiv && Math.abs(e.clientX - x0) < 6) return; aktiv = true; const z = ziel(e); this.setState({ greift: i, ziel: z >= 1 ? z : null }); };
      const up = (e) => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); if (!aktiv) return;
        this.ohneKlick = Date.now(); const z = ziel(e); const patch = { greift: null, ziel: null };
        if (z >= 1 && z !== i) { const l = SP.map(x => x.k); const [m] = l.splice(i - 1, 1); l.splice(z - 1, 0, m); patch.ord = { ...(st.ord || {}), [ansicht]: l };
          if (br[bkey]) { const w = br[bkey].slice(); const [ww] = w.splice(i, 1); w.splice(z, 0, ww); patch.br = { ...br, [bkey]: w }; } }
        this.setState(patch); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
    const kopf = KOPF.map((s, i) => { const on = sortK === s.k;
      return { zelle: 'hk' + (s.li ? ' li' : '') + (s.re ? ' re' : '') + (s.trenn ? ' trenn' : '') + (st.greift === i ? ' greift' : '') + (st.ziel === i && st.greift !== i ? ' ziel' : ''), zieh: i < KOPF.length - 1, ...zieher(i), greif: greif(i), kurz: s.kurz, t: s.t, lang: s.lang,
        cls: 'sk' + (on ? ' on' + (sortAuf ? '' : ' hoch') : ''), aria: on ? (sortAuf ? 'ascending' : 'descending') : 'none',
        titel: s.titel + ' · klicken: sortieren' + (s.k === 'name' ? '' : ' (meiste freie zuerst) · ziehen: Spalte verschieben'),
        klick: () => { if (this.ohneKlick && Date.now() - this.ohneKlick < 400) return; neu({ sortK: s.k, sortAuf: on ? !sortAuf : true }); } }; });

    const RAD = { ja: ['Aufnahmetag', 'rad'], nein: ['kein Aufnahmetag', 'rad nein'] };
    const haeuser = liste.map(h => ({ cls: 'kz' + (h.rett ? '' : ' ohne'), kurz: h.kurz, ort: h.ort + (land === 'alle' && h.land !== 'Niederösterreich' && h.land && h.land !== h.ort ? ' · ' + h.land : ''),
      hatRad: !!h.rad, rad: h.rad ? RAD[h.rad][0] : '', radCls: h.rad ? RAD[h.rad][1] : '', radTitel: h.radTitel || '',
      zellen: SP.map(sp => akut ? zelleA(h, sp) : zelleP(h, sp)),
      klick: () => app.oeffnen(h.id), taste: (e) => { if (e && e.key === 'Enter' && e.target === e.currentTarget) app.oeffnen(h.id); } }));

    const p = st.pop;
    return {
      ...g,
      such: st.such || '', suchEin: (e) => neu({ such: e && e.target ? e.target.value : '' }),
      laender: LAND.map(([v, tx]) => ({ t: tx, cls: 'seg' + (land === v ? ' on' : ''), an: land === v ? 'true' : 'false', klick: () => neu({ land: v }) })),
      landIdx: land === 'alle' ? '1' : '0',
      rettCls: 'chip' + (rett ? ' on' : ''), rettAn: rett ? 'true' : 'false', rettKlick: () => neu({ rett: !rett }),
      listeCls: 'kl' + (akut ? ' akut ' : ' ') + (sw % 2 ? 'swA' : 'swB') + (st.zieht ? ' zieht' : '') + (st.greift ? ' greifen' : ''), tabTitel: akut ? 'Akutversorgung' : 'Freie Plätze', cols, kopf, haeuser, keine: haeuser.length === 0,
      istAkut: akut, legende: ['ok', 'voll', 'zu'].map(z => ({ cls: 'as ' + z, d: D[z], t: TXT[z] })),
      popOffen: !!p, popKh: p ? p.kh : '', popWas: p ? p.was : '', popX: p ? String(Math.round(p.x)) : '0', popY: p ? String(Math.round(p.y)) : '0',
      popZeilen: p ? p.zeilen.map(z => ({ ...z, hatFz: !!z.fz })) : [], popLeer: !!p && !p.zeilen.length, popZu: () => this.setState({ pop: null }),
    };
  }
}
