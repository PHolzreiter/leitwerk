// Logik des Kartenfensters – aus dem Entwurf „Karte“ (class Component extends DCLogic) übernommen.
// Die gezeichnete Entwurfskarte (Verschieben, Zoomen, Beispieldaten) ist durch MapLibre und die echten Daten
// ersetzt: alles kommt aus this.props.app (siehe logik.d.ts, angebunden in index.ts).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

export class KarteLogik extends DCLogic {
  constructor(p) { super(p); this.state = {}; }
  componentWillUnmount() { clearTimeout(this.tt); }
  /** kurze Rückmeldung unten in der Karte (wie im Entwurf) */
  zeige(txt) { clearTimeout(this.tt); this.setState({ toast: txt }); this.tt = setTimeout(() => this.setState({ toast: '' }), 2200); }
  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const v = app.sicht();
    const B = Number(this.props.breite) || 560, Hh = Number(this.props.hoehe) || 1000;
    const zeige = (t) => this.zeige(t);
    const dim = v.dim, basis = v.basis, eb = v.ebenen;

    // ---- Auswahl als kleine Karte neben der Marke (Einsatz, Fahrzeug, Wache, Krankenhaus …)
    const info = v.info;
    let ix = 0, iy = 0;
    if (info) { ix = Math.max(8, Math.min(B - 278 - (B > 430 ? 50 : 0), info.x + 18)); iy = Math.max(8, Math.min(Math.max(8, Hh - 300), info.y - 40)); }
    const K = (k) => ({ t: k.t, cls: 'kn sm' + (k.cls ? ' ' + k.cls : ''), klick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); k.klick(); } });

    // ---- Suche (Treffer gruppiert, erster mit Enter)
    const such = st.such || '';
    const treffer = v.treffer || [];
    const hin = (t) => (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ such: t.titel || '', suchOffen: false }); app.trefferWaehlen(t); };
    const zeigTreffer = st.suchOffen !== false && such.trim().length >= 2 && v.trefferFuer === such.trim();

    // ---- Rechtsklick
    const ctx = v.ctx;
    const DIMS = [['2d', '2D'], ['3d', '3D']], BASEN = [['karte', 'Karte'], ['sat', 'Satellit']];
    const EBENEN = [['wachen', 'Dienststellen', ''], ['kh', 'Krankenhäuser', ''], ['poi', 'POIs', ''], ['funk', 'Funkgruppen', 'Grenze ' + v.funkgruppe], ['modelle', '3D-Fahrzeugmodelle', 'nur 3D, nah'], ['folgt', 'Karte folgt der Auswahl', '']]
      .concat(v.entwickler ? [['stellen', 'Einsatzstellen (unsichtbar)', 'Entwickler']] : []);
    const ebOffen = !!st.ebOffen;
    const m = st.meldungZu === v.meldung?.text ? null : v.meldung;
    return {
      kfCls: 'kf' + (v.waehlt ? ' waehlt' : '') + (basis === 'sat' ? ' sat' : '') + (dim === '3d' ? ' d3' : ''),
      stopp: (e) => { if (e && e.stopPropagation) e.stopPropagation(); },

      such, suchEin: (e) => { const t = e && e.target ? e.target.value : ''; this.setState({ such: t, suchOffen: true }); app.suche(t); },
      suchTaste: (e) => {
        if (!e) return; e.stopPropagation();
        if (e.key === 'Enter' && treffer[0]) { e.preventDefault(); hin(treffer[0])(); }
        else if (e.key === 'Escape') { this.setState({ such: '', suchOffen: false }); app.suche(''); app.trefferWaehlen(null); }
      },
      suchFokus: () => this.setState({ suchOffen: true }),
      suchWeg: () => setTimeout(() => this.setState({ suchOffen: false }), 150),
      hatTreffer: zeigTreffer, keineTreffer: zeigTreffer && !treffer.length,
      treffer: treffer.map((t, i) => ({ art: t.art, n: t.titel, k: t.zusatz, cls: 'tr' + (i === 0 ? ' erster' : ''), klick: hin(t) })),

      dims: DIMS.map(([k, t]) => ({ t, titel: k === '3d' && !v.gelaende ? 'Paket „Gelände (3D)“ fehlt – Einstellungen → Kartenpakete' : (k === '3d' ? '3D-Ansicht mit Gelände' : 'Von oben'), cls: 'seg' + (dim === k ? ' on' : ''), an: dim === k ? 'true' : 'false', klick: () => app.setzeDim(k) })), dimIdx: dim === '3d' ? '1' : '0',
      basen: BASEN.map(([k, t]) => ({ t, cls: 'seg' + (basis === k ? ' on' : ''), an: basis === k ? 'true' : 'false', klick: () => app.setzeBasis(k) })), basisIdx: basis === 'sat' ? '1' : '0',
      ebenenOffen: ebOffen, ebenenCls: 'ebenen-k' + (ebOffen ? ' an' : ''), ebenenAn: ebOffen ? 'true' : 'false',
      ebenenKlick: () => this.setState({ ebOffen: !ebOffen }),
      ebenen: EBENEN.map(([k, t, hz]) => ({ t, hz, titel: t, cls: 'k-schalter' + (eb[k] ? ' an' : ''), an: eb[k] ? 'true' : 'false', klick: () => app.setzeEbene(k, !eb[k]) })),
      legende: [{ t: 'Rettungswache', f: '#b8c2d1', r: '3px' }, { t: 'Flugrettung', f: '#f3d27a', r: '50%' }, { t: 'Krankenhaus (grüner Ring = nimmt auf, grau = abgemeldet)', f: '#d62828', r: '3px' }, { t: 'Berufungsort (Farbe = Stufe)', f: '#e2761b', r: '50% 50% 50% 0' }, { t: 'Fahrzeug (Punkt in Statusfarbe, blauer Blinkring = Sondersignal)', f: '#F7D98C', r: '50%' }, { t: 'Mehrere Einsätze (weit herausgezoomt)', f: 'conic-gradient(#a61b1b 0 50%,#d4a106 0)', r: '50%' }],

      zoomRein: () => app.zoom(1), zoomRaus: () => app.zoom(-1),
      aufEinsatz: () => { if (!app.aufEinsatz()) zeige('Kein Einsatz gewählt'); },
      norden: () => app.norden(), nadel: String(Math.round(-v.drehung)),
      massText: v.mass.text, massPx: String(v.mass.px), quelle: v.quelle, quelleTitel: v.quelleTitel,

      infoOffen: !!info, infoX: String(Math.round(ix)), infoY: String(Math.round(iy)), infoTitel: info ? info.titel : '', infoUnter: info ? info.unter : '',
      infoZeilen: info ? info.zeilen : [], infoKnoepfe: info ? info.knoepfe.map(K) : [],
      infoHatSt: !!(info && info.st), infoSt: info && info.st ? info.st : '', infoStCls: info && info.stCls ? info.stCls : '', infoStStil: info && info.stStil ? info.stStil : '',
      infoZu: () => app.infoZu(),

      ctxOffen: !!ctx, ctxX: ctx ? String(Math.round(Math.min(ctx.x, B - 228))) : '0', ctxY: ctx ? String(Math.round(Math.min(ctx.y, Hh - 150))) : '0', ctxKoord: ctx ? ctx.lat.toFixed(5) + ', ' + ctx.lon.toFixed(5) : '',
      ctxZu: () => app.ctxZu(), ctxZuR: (e) => { if (e && e.preventDefault) e.preventDefault(); app.ctxZu(); },
      ctxKopieren: () => { app.koordKopieren(); app.ctxZu(); zeige('Koordinaten kopiert'); },
      ctxPunkte: [['Dienststelle hier anlegen', 'stations'], ['Krankenhaus hier anlegen', 'hospitals'], ['POI hier anlegen', 'pois']].map(([t, k]) => ({ t, klick: () => { app.ctxZu(); app.anlegen(k); } })),

      folgtAn: !!v.folgt, folgtRuf: v.folgt || '', folgtAus: (e) => { if (e && e.stopPropagation) e.stopPropagation(); app.folgtAus(); },
      hatMeldung: !!m, meldungText: m ? m.text : '', meldungKnopf: !!(m && m.knopf), meldungZu: () => { this.setState({ meldungZu: m ? m.text : '' }); app.meldungZu(); }, meldungAktion: () => app.meldungAktion(),
      waehlt: !!v.waehlt, waehlTitel: v.waehlt || '', waehlZu: () => app.waehlZu(),
      toast: st.toast || v.toast || '', hatToast: !!(st.toast || v.toast),
    };
  }
}
