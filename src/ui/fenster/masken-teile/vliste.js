// Fahrzeugliste der Masken (RD, KT, SEK) – aus dem Entwurf übernommen („Fahrzeugliste wie im Fahrzeuge-Fenster“):
// Spalten je nach Breite der Liste (breit / normal / schmal über Container-Abfragen), Sortieren über die Köpfe
// (3. Klick = wieder Vorschlag, sortiert wird innerhalb der Gruppen), Spaltenbreiten ziehbar (Doppelklick = Standard),
// Besatzung beim Darüberfahren. Die Daten kommen vom Spiel (siehe daten.ts), hier nur Darstellung und Bedienung.
/* eslint-disable */

const vlST = { 0: 'Abgemeldet', 1: 'Frei auf Wache', 2: 'Zum Berufungsort', 3: 'Am Berufungsort', 4: 'Zum Zielort', 5: 'Am Zielort', 6: 'Frei über Funk', 7: 'Dienstfahrt', 8: 'Bereitschaft', 9: 'Alarmiert und quittiert', A: 'Alarmiert auf Wache', F: 'Alarmiert über Funk' };
const vlORD = ['A', 'F', '9', '2', '3', '4', '5', '6', '7', '8', '1', '0'];
const vlZahl = (x) => { const m = /(\d+)/.exec(String(x == null ? '' : x)); return m ? Number(m[1]) : null; };
const vlQ = (x) => typeof x === 'string' ? { t: x, cls: 'q' + (x === 'NA' ? ' na' : /^NFS/.test(x) ? ' hoch' : '') } : x;

/** gemerkte Spaltenbreiten je Maske (nur Bequemlichkeit, darf fehlen) */
export function breitenLaden(name) {
  try { const x = JSON.parse(localStorage.getItem('lw.masken.spalten.' + name) || 'null'); return x && typeof x === 'object' ? x : {}; } catch { return {}; }
}
function breitenSpeichern(name, br) {
  try { localStorage.setItem('lw.masken.spalten.' + name, JSON.stringify(br || {})); } catch { /* egal */ }
}

/**
 * Zeilen und Köpfe der Liste.
 * @param k Komponente (state/setState)
 * @param eintraege [{ trenner, trennText } | { id, status, ruf, typ, crew, von, nach, codes:[{c,text}], fahrt, los, losCls, hinweis, cls, klick, titel }]
 * @param o { zeitTitel, zeitPx, swExtra, name }
 */
export function vliste(k, eintraege, o) {
  const st = k.state || {};
  const vlK = st.vlK || '', vlAuf = st.vlAuf !== false;
  const vlW = { ruf: f => f.ruf, typ: f => f.typ, status: f => vlORD.indexOf(f.s), lst: f => f.von || null, ziel: f => f.nach || null, fahrt: f => f.nach || f.von || null, code: f => f.codes[0] ? f.codes[0].c : null, zeit: f => f.zahl };
  const vlSortiere = (l) => { if (!vlK) return l; const w = vlW[vlK]; return l.slice().sort((a, b) => { const x = w(a), y = w(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'de', { numeric: true }); return vlAuf ? r : -r; }); };
  const aus = []; let gruppe = [];
  const fertig = () => { vlSortiere(gruppe).forEach(f => aus.push(f)); gruppe = []; };
  eintraege.forEach(e => { if (e.trenner) { fertig(); aus.push({ trenner: true, fahrzeug: false, trennText: e.trennText }); return; }
    const s = String(e.status); const von = e.von || ''; const nach = e.nach || '';
    const codes = e.codes || [];
    const zt = e.fahrt; const hw = e.hinweis || '';
    gruppe.push({ trenner: false, fahrzeug: true, id: e.id, s, st: s, ruf: e.ruf, typ: e.typ, crew: (e.crew || []).map(vlQ), stx: vlST[s] || '', hinweis: hw, hatHw: !!hw,
      von, nach, ort: nach || von, ortCls: 'ort2' + (nach ? '' : ' nur'), codes, zeit: zt == null || zt === '' ? '–' : String(zt), zahl: vlZahl(zt), los: e.los || '', hatLos: !!e.los, losCls: e.losCls || 'los',
      cls: String(e.cls || 'lz') + ' vz' + (hw ? ' mit-hw' : ''), klick: e.klick, titel: e.titel || '' }); });
  fertig();

  const zeitPx = o.zeitPx;
  const STD = { b: 'minmax(0,.8fr) minmax(0,.6fr) minmax(0,1fr) minmax(0,1.15fr) minmax(0,1.15fr) minmax(0,.8fr) ' + (zeitPx + 10) + 'px', n: '76px minmax(0,1.05fr) minmax(0,1.5fr) 80px ' + zeitPx + 'px', s: '22px 66px minmax(0,1fr) ' + Math.min(zeitPx, 84) + 'px' };
  const br = st.vlBr || {};
  const cols = (a) => br[a] ? br[a].map(x => 'minmax(0,' + x.toFixed(1) + 'fr)').join(' ') : STD[a];
  const MIN = (a, i) => a === 's' && i === 0 ? 18 : 34;
  const breiten = (el) => { const kk = el && el.closest ? el.closest('.vk-b,.vk-n,.vk-s') : null; if (!kk) return null; return (getComputedStyle(kk).gridTemplateColumns || '').split(' ').map(parseFloat).filter(x => !isNaN(x)); };
  const schiebe = (a, w0, i, dx) => { const w = w0.slice(); const sum = w0[i] + w0[i + 1]; w[i] = Math.max(MIN(a, i), Math.min(sum - MIN(a, i + 1), w0[i] + dx)); w[i + 1] = sum - w[i]; return w; };
  const zieher = (a, i) => ({
    stopp: (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); },
    ziehStart: (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); if (ev && ev.stopPropagation) ev.stopPropagation();
      const el = ev && ev.currentTarget; const w0 = breiten(el); if (!w0 || w0.length < i + 2) return;
      const zoom = el && el.offsetWidth ? (el.getBoundingClientRect().width / el.offsetWidth) || 1 : 1; const x0 = ev.clientX;
      const zieh = (e) => k.setState({ vlBr: { ...(k.state.vlBr || {}), [a]: schiebe(a, w0, i, (e.clientX - x0) / zoom) } });
      const los = () => { window.removeEventListener('mousemove', zieh); window.removeEventListener('mouseup', los); k.setState({ vlZieht: false }); breitenSpeichern(o.name, k.state.vlBr); };
      window.addEventListener('mousemove', zieh); window.addEventListener('mouseup', los); k.setState({ vlZieht: true }); },
    reset: (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); const n = { ...br }; delete n[a]; k.setState({ vlBr: n }); breitenSpeichern(o.name, n); },
    taste: (e) => { const kk = e && e.key; if (kk !== 'ArrowLeft' && kk !== 'ArrowRight') return; if (e.preventDefault) e.preventDefault();
      const basis = br[a] || breiten(e.currentTarget); if (!basis) return; const n = { ...br, [a]: schiebe(a, basis, i, kk === 'ArrowRight' ? 12 : -12) }; k.setState({ vlBr: n }); breitenSpeichern(o.name, n); } });
  const zeitTitel = o.zeitTitel;
  const NAME = { ruf: 'Funkkennung', typ: 'Typ', status: 'Status', lst: 'Letzter Standort', ziel: 'Fahrtziel', fahrt: 'Fahrtziel', code: 'Code', zeit: zeitTitel };
  const kopf = (l, a) => l.map(([kk, tx, re], i) => { const on = vlK === kk;
    return { zelle: 'hk' + (re ? ' re' : ''), zieh: i < l.length - 1, ...zieher(a, i), t: tx, cls: 'sk' + (re ? ' re' : '') + (on ? ' on' + (vlAuf ? '' : ' hoch') : ''),
      aria: on ? (vlAuf ? 'ascending' : 'descending') : 'none', titel: 'Nach ' + NAME[kk] + ' sortieren · dritter Klick: wieder Vorschlag',
      klick: () => k.setState(!on ? { vlK: kk, vlAuf: true, vsw: (st.vsw || 0) + 1 } : vlAuf ? { vlAuf: false, vsw: (st.vsw || 0) + 1 } : { vlK: '', vlAuf: true, vsw: (st.vsw || 0) + 1 }) }; });
  return {
    vl: aus,
    vkN: kopf([['ruf', 'Fahrzeug'], ['status', 'Status'], ['fahrt', 'Fahrtziel'], ['code', 'Code'], ['zeit', zeitTitel, true]], 'n'),
    vkB: kopf([['ruf', 'Funkkennung'], ['typ', 'Typ'], ['status', 'Status'], ['lst', 'Letzter Standort'], ['ziel', 'Fahrtziel'], ['code', 'Code'], ['zeit', zeitTitel, true]], 'b'),
    vkS: kopf([['status', 'St'], ['ruf', 'Fahrzeug'], ['fahrt', 'Fahrtziel'], ['zeit', zeitTitel, true]], 's'),
    vlN: cols('n'), vlB: cols('b'), vlS: cols('s'),
    vlCls: 'liste vl ' + (((st.vsw || 0) + (o.swExtra || 0)) % 2 ? 'swA' : 'swB') + (st.vlZieht ? ' zieht' : ''),
  };
}

/** Text des Hauptknopfs: genau eines → Funkrufname, mehrere → Anzahl, keines → null */
export function knopfText(liste, verb, mehrVerb) {
  return liste.length === 0 ? null : liste.length === 1 ? liste[0].ruf + ' ' + verb : liste.length + ' Fahrzeuge ' + (mehrVerb || verb);
}
