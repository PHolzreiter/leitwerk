// RD-Übersicht (Einsatzmaske) – Logik aus dem Entwurf „Einsatzmaske“ übernommen.
// Die Beispieldaten des Entwurfs sind durch die echten Daten ersetzt: this.props.app.daten(state) liefert den Einsatz,
// die Vorschläge und die Krankenhaus-Zuweisung aus dem Spiel, this.props.app.tun(...) führt die Aktionen aus.
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";
import { vliste, knopfText, breitenLaden } from "../masken-teile/vliste.js";

const TYPEN = ['Alle', 'RTW', 'NEF', 'NAH', 'KTW'];
const ALTER = [['kleinkind', 'Kleinkind', 'unter 1 Jahr'], ['kind', 'Kind', '1 – 17'], ['erwachsener', 'Erwachsener', '18 +']];
const DRING = [[10, 'stabil', 'Notaufnahme'], [20, 'dringend', 'rasch versorgen'], [30, 'Schockraum', 'Intensiv']];
const BAND_FARBE = { ok: 'var(--ok)', blau: 'var(--akzent)', gelb: 'var(--gelb)', rot: 'var(--rot)', grau: 'var(--dim)' };

export class EinsatzmaskeLogik extends DCLogic {
  constructor(p) {
    super(p);
    this.state = { vlBr: breitenLaden('rd'), ent: {} };
    this.refs = { code: { current: null }, os: { current: null }, zs: { current: null }, sym: { current: null }, fz: { current: null } };
    this._suchLauf = 0;
  }

  /** Einsatz gewechselt: Bedienzustand zurücksetzen (Spaltenbreiten und Sortierung bleiben) */
  neuerEinsatz() {
    const s = this.state;
    this.state = { vlBr: s.vlBr, vlK: s.vlK, vlAuf: s.vlAuf, filter: s.filter, ent: {}, sw: (s.sw || 0) + 1 };
  }

  fokus(ref) { setTimeout(() => { const el = ref.current; if (el && el.focus) { el.focus(); if (el.select) el.select(); } }, 30); }

  // ---- Eingabefelder: Entwurf solange getippt wird, übernehmen beim Verlassen (oder Enter)
  feld(name, wert, speichern) {
    const ent = this.state.ent || {};
    return {
      wert: name in ent ? ent[name] : (wert || ''),
      fokus: () => { this.state.ent = { ...(this.state.ent || {}), [name]: wert || '' }; },
      ein: (e) => { this.state.ent = { ...(this.state.ent || {}), [name]: e.target.value }; },
      fertig: (e) => { const v = e.target.value; const n = { ...(this.state.ent || {}) }; delete n[name]; this.state.ent = n; if (v !== (wert || '')) speichern(v); this.setState({}); },
      taste: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } else if (e.key === 'Escape') { e.target.value = wert || ''; e.target.blur(); } },
    };
  }

  // ---- Ortssuche (Einsatzort und Zielort manuell): Treffer kommen asynchron
  suche(wo, q) {
    const lauf = ++this._suchLauf;
    this.setState({ [wo]: { ...(this.state[wo] || {}), q, hinweis: q.trim().length > 1 ? 'Suche …' : '' } });
    clearTimeout(this._suchT);
    this._suchT = setTimeout(async () => {
      const gruppen = await this.props.app.ortSuchen(q, wo).catch(() => []);
      if (lauf !== this._suchLauf) return;
      const n = gruppen.reduce((s, g) => s + g.items.length, 0);
      this.setState({ [wo]: { q, gruppen, hinweis: !n && q.trim().length > 1 ? 'Kein Treffer – anders schreiben oder auf der Karte wählen.' : '' } });
    }, 220);
  }
  suchWerte(wo, waehlen, zu, ref, ersatz) {
    const s = this.state[wo] || { q: '', gruppen: [] };
    const roh = !s.q && ersatz && ersatz.length ? ersatz : (s.gruppen || []);
    let erster = true;
    const gruppen = roh.map(g => ({ t: g.t, items: g.items.map(it => {
      const cls = 'treffer' + (erster ? ' erster' : ''); const rechts = erster ? 'Enter' : it.rechts; erster = false;
      return { cls, name: it.name, zeile: it.zeile, rechts, org: it.art === 'org', adr: it.art === 'adr', ruf: it.art === 'ruf', ortung: it.art === 'ortung', klick: () => waehlen(it) };
    }) }));
    const alle = roh.flatMap(g => g.items);
    return {
      query: s.q || '', gruppen, hinweis: s.hinweis || '', ref,
      eingabe: (e) => this.suche(wo, e.target.value),
      taste: (e) => { if (e.key === 'Enter' && alle[0]) { e.preventDefault(); waehlen(alle[0]); } else if (e.key === 'Escape') { e.preventDefault(); zu(); } },
      zu,
    };
  }

  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const d = app.daten(st);
    if (!d) return { leer: true, da: false, leerText: app.leerText };
    const tun = (...a) => app.tun(...a);

    // ---- Vorschlag: beim ersten Laden (und wenn sich Ort, Code oder Fahrzeuge ändern) die Empfehlung wählen
    if (d.vorschlag.key && st.gewFuer !== d.vorschlag.key && !d.vorschlag.laedt) {
      const g = {}; d.vorschlag.empfohlen.forEach(id => { g[id] = true; });
      this.state = { ...this.state, gew: g, gewFuer: d.vorschlag.key, sw: (st.sw || 0) + 1 };
    }
    const S = this.state;
    const gewaehlt = S.gew || {};
    const filter = S.filter || 'Alle';
    const laufend = d.laufend;

    // ---- Fahrzeugliste (wie im Fahrzeuge-Fenster)
    const passt = (f) => filter === 'Alle' || f.gruppe === filter;
    const istGew = (f) => !!gewaehlt[f.id] && f.frei;
    const zeile = (f) => ({ ...f, cls: f.cls + (istGew(f) ? ' gew' : '') + (f.frei ? '' : ' weg'),
      klick: () => { if (f.frei) this.setState({ gew: { ...(this.state.gew || {}), [f.id]: !gewaehlt[f.id] } }); } });
    const eintraege = [];
    const frei = d.liste.filter(passt);
    frei.forEach(f => eintraege.push(zeile(f)));
    const weg = d.nichtFrei.filter(passt);
    if (weg.length) { eintraege.push({ trenner: true, trennText: 'Nicht frei' }); weg.forEach(f => eintraege.push(zeile(f))); }
    const vlTeil = vliste(this, eintraege, { zeitTitel: 'Zeit', zeitPx: 56, swExtra: S.sw || 0, name: 'rd' });
    const gewListe = [...d.liste, ...d.nichtFrei].filter(istGew);
    const ueber = gewListe.filter(f => f.ueber);
    const typFilter = TYPEN.map(x => ({ t: x, cls: 'seg' + (filter === x ? ' on' : ''), klick: () => this.setState({ filter: x, sw: (S.sw || 0) + 1 }) }));
    const alarmieren = async () => {
      if (!gewListe.length) return app.hinweis('Bitte Fahrzeuge in der Liste wählen');
      const ok = await tun('alarmieren', gewListe.map(f => f.id));
      if (ok !== false) this.setState({ gew: {} });
    };
    const vormerken = async () => {
      if (!ueber.length) return app.hinweis('Vormerken gilt für Fahrzeuge über der Dienstzeit – erst anfunken und fragen, ob sie den Einsatz noch übernehmen');
      const ok = await tun('alarmieren', ueber.map(f => f.id));
      if (ok !== false) { const g = { ...(this.state.gew || {}) }; ueber.forEach(f => delete g[f.id]); this.setState({ gew: g }); }
    };

    // ---- alarmierte Fahrzeuge, nach Eintreffzeit
    const alarmiert = d.alarmiert.map(z => ({ ...z, funk: () => tun('funk', z.id), storno: () => tun('storno', z.id) }));

    // ---- Code ändern / aufwerten
    const codeOffen = !!S.codeOffen;
    const codeTreffer = codeOffen ? app.codeSuche(S.codeSuche || '').map((c, i) => ({ ...c, cls: 'dd-z ew-wahl' + (i === 0 && S.codeSuche ? ' erster' : ''), klick: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ codeOffen: false, codeSuche: '' }); tun('code', c.code); } })) : [];
    const aufwertungen = d.aufwertungen.map(a => ({ ...a, klick: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ aufw: false }); tun('code', a.code); } }));

    // ---- Ort
    const ortOffen = S.ortSuche !== undefined ? S.ortSuche : !d.adresse;
    const ortWaehlen = (it) => { this.setState({ ortSuche: false, os: { q: '', gruppen: [] } }); tun('ort', it.ort); };
    const ortZu = () => this.setState({ ortSuche: false, os: { q: '', gruppen: [] } });
    // ohne Eingabe: genannte Adresse und Handy-Ortung als Vorschlag
    const vorab = [];
    if (d.genanntTreffer) vorab.push({ t: 'Vom Anrufer genannt', items: [d.genanntTreffer] });
    if (d.ortungTreffer) vorab.push({ t: 'Handy-Ortung', items: [d.ortungTreffer] });
    const os = this.suchWerte('os', ortWaehlen, ortZu, this.refs.os, vorab);
    Object.assign(os, {
      karte: async () => { const ok = await tun('karteWaehlen'); if (ok) this.setState({ ortSuche: false }); },
      mitOrtung: d.mitOrtung, ortung: () => tun('ortung'), ortungTitel: d.ortungTitel, mitZu: !!d.adresse,
    });

    // ---- Krankenhaus: Schritte nacheinander (1 Altersgruppe → 2 Symptom → 3 Dringlichkeit → 4 Vorschlag)
    const kh = d.kh;
    const schritt = S.khSchritt || kh.startSchritt;
    const setzeKh = (p, weiter) => this.setState({ khWahl: { ...kh.wahl, ...p }, khSchritt: weiter, khHaus: undefined, andere: false });
    const alterWahl = ALTER.map(([id, t, klein]) => ({ t, klein, cls: kh.wahl.alter === id ? 'on' : '', klick: () => setzeKh({ alter: id }, kh.wahl.sym ? 4 : 2) }));
    const symWahl = (s) => { this.setState({ symSuche: '' }); setzeKh({ sym: s.id, dring: s.dring }, 3); };
    const symChips = (S.symSuche ? kh.symTreffer : kh.symVorschlag).map((s, i) => ({ t: s.name, titel: s.kategorie, cls: (kh.wahl.sym === s.id ? 'on' : '') + (i === 0 && S.symSuche ? ' on' : ''), klick: () => symWahl(s) }));
    const dringWahl = DRING.map(([id, t, klein]) => {
      const erlaubt = !kh.erlaubt || kh.erlaubt.includes(id);
      return { t, klein, cls: (kh.wahl.dring === id ? 'on' : '') + (erlaubt ? '' : ' aus'), klick: () => { if (erlaubt) setzeKh({ dring: id }, 4); } };
    });
    const titel = ['Altersgruppe', 'Symptom', 'Dringlichkeit', 'Vorschlag'];
    const fragen = ['Wie alt ist der Patient?', 'Was hat der Patient?', 'Wie dringend?', 'Passende Krankenhäuser'];
    const werte = [kh.alterName, kh.symName, kh.dringName, ''];
    const khSchritte = [0, 1, 2, 3].map(i => ({ nr: String(i + 1), titel: titel[i], frage: fragen[i], wert: werte[i],
      fertig: i + 1 < schritt, aktiv: i + 1 === schritt, offen: i + 1 > schritt,
      istAlter: i === 0, istSymptom: i === 1, istDringlich: i === 2, istVorschlag: i === 3,
      klick: () => { this.setState({ khSchritt: i + 1 }); if (i === 1) this.fokus(this.refs.sym); } }));
    const khHaus = S.khHaus || kh.vorgewaehlt;
    const khKarten = kh.karten.map(h => ({ ...h, cls: 'khk' + (h.id === khHaus ? ' gew' : ''), radio: 'radio' + (h.id === khHaus ? ' an' : ''), klick: () => this.setState({ khHaus: h.id }) }));
    const hausName = (kh.karten.find(h => h.id === khHaus) || kh.andere.find(h => h.id === khHaus) || {}).kurz || '';
    const zoWaehlen = (it) => { this.setState({ zoOffen: false, zs: { q: '', gruppen: [] } }); tun('zo', it.ort); };
    const zs = this.suchWerte('zs', zoWaehlen, () => this.setState({ zoOffen: false }), this.refs.zs);

    // ---- Kopf
    const baender = d.baender.map(b => ({ ...b, cls: 'band ' + b.art, farbe: BAND_FARBE[b.art] || 'var(--dim)', klick: () => tun(b.aktion), klick2: () => tun(b.aktion2), titel: b.titel || '' }));

    // ---- Protokoll
    const protAlle = !!S.protAlle;
    const nProt = this.props.hoehe < 760 ? 2 : 6;
    const protokoll = protAlle ? d.protokoll : d.protokoll.slice(-nProt);

    const nFrei = d.liste.length;
    return {
      leer: false, da: true,
      ...vlTeil,
      vlLeer: d.vorschlag.laedt ? 'Fahrzeiten werden berechnet …' : !eintraege.length ? (S.fzSuche ? 'Kein Fahrzeug gefunden.' : 'Keine freien Fahrzeuge.') : '',
      listeHinweis: d.listeHinweis,
      nummer: d.nummer, eingang: d.eingang, baender,
      ortPill: d.ortPill,
      stufe: d.stufe, stufeFarbe: d.stufeFarbe, code: d.code, codeText: d.codeText, codeZusatz: d.codeZusatz, codeHinweis: d.codeHinweis,
      codeOffen, codeExp: codeOffen ? 'true' : 'false', codeSuche: S.codeSuche || '', codeTreffer, codeRef: this.refs.code,
      codeLeer: codeOffen && !codeTreffer.length ? (S.codeSuche ? 'Kein Code gefunden.' : 'Code oder Stichwort eingeben.') : '',
      codeKlick: () => { const auf = !S.codeOffen; this.setState({ codeOffen: auf, aufw: false, codeSuche: '' }); if (auf) this.fokus(this.refs.code); },
      codeEingabe: (e) => this.setState({ codeSuche: e.target.value }),
      codeTaste: (e) => { if (e.key === 'Escape') this.setState({ codeOffen: false }); else if (e.key === 'Enter' && codeTreffer[0]) { e.preventDefault(); codeTreffer[0].klick(); } },
      kannAufwerten: aufwertungen.length > 0, aufwertungen,
      aufwOffen: !!S.aufw, aufwExp: S.aufw ? 'true' : 'false', aufwKlick: () => this.setState({ aufw: !S.aufw, codeOffen: false }),
      ortZu: !ortOffen, ortOffen, ort: d.adresse || '', ortMerk: d.ortMerk,
      ortKlick: () => { this.setState({ ortSuche: true, os: { q: '', gruppen: [] } }); this.fokus(this.refs.os); },
      os,
      zusatz: this.feld('zusatz', d.zusatz, v => tun('aktualisiere', { zusatz: v })),
      rueck: this.feld('rueck', d.telefon, v => tun('aktualisiere', { telefon: v.trim() })),
      rueckTitel: d.rueckTitel, rueckKlick: () => tun('rueckruf'),
      nachforderungen: d.nachforderungen,
      alarmiert, hatAlarm: alarmiert.length > 0,
      partner: d.partner.map(p => ({ ...p, klick: () => { if (!p.aus) tun('partner', p.art); } })),
      partnerInfo: d.partnerInfo,
      infoFz: this.feld('infoFz', d.infoFrei, v => tun('infoFz', v)),
      intern: this.feld('intern', d.intern, v => tun('aktualisiere', { infoIntern: v })),
      protokoll, protMehr: d.protokoll.length > nProt, protKnopf: protAlle ? 'Weniger' : 'Alles zeigen', protKlick: () => this.setState({ protAlle: !protAlle }),
      mitExport: d.mitExport, exportKlick: () => tun('export'),
      fzTitel: 'Fahrzeuge',
      fzZahl: laufend ? d.anzahlAlarm + ' alarmiert · Nachalarmieren möglich' + (gewListe.length ? ' · ' + gewListe.length + ' gewählt' : '')
        : nFrei + ' frei im Umkreis' + (gewListe.length ? ' · ' + gewListe.length + ' gewählt' : '') + (d.anzahlAlarm ? ' · ' + d.anzahlAlarm + ' alarmiert' : ''),
      aoOffen: !!S.ao, aoExp: S.ao ? 'true' : 'false', aoKlick: () => this.setState({ ao: !S.ao }), ausrueck: d.ausrueck,
      typFilter, typIdx: String(Math.max(0, TYPEN.indexOf(filter))),
      sucheOffen: !!S.sucheOffen, sucheKnopfCls: 'kn sm' + (S.sucheOffen ? ' an' : ''), fzSuche: S.fzSuche || '', fzSucheRef: this.refs.fz,
      sucheKlick: () => { const auf = !S.sucheOffen; this.setState({ sucheOffen: auf, fzSuche: auf ? S.fzSuche : '', sw: (S.sw || 0) + 1 }); if (auf) this.fokus(this.refs.fz); },
      fzSucheEin: (e) => this.setState({ fzSuche: e.target.value }),
      fzSucheTaste: (e) => { if (e.key === 'Escape') this.setState({ fzSuche: '', sucheOffen: false }); },
      fehlt: d.fehlt, ueber: ueber.length ? d.ueberText(ueber.map(f => f.ruf), ueber.some(f => f.ueber === 'ende')) : '',
      khGebucht: kh.gebucht, khGebuchtTitel: kh.gebuchtTitel, khAnfrage: kh.anfrage,
      khSchritte, alterWahl, dringWahl, symChips, symTitel: S.symSuche ? (kh.symTreffer.length ? 'Treffer:' : 'Kein Symptom gefunden.') : (kh.symVorschlag.length ? 'Aus der Abfrage:' : ''),
      symSuche: S.symSuche || '', symRef: this.refs.sym,
      symEingabe: (e) => this.setState({ symSuche: e.target.value }),
      symTaste: (e) => { if (e.key === 'Enter' && kh.symTreffer[0]) { e.preventDefault(); symWahl(kh.symTreffer[0]); } },
      khKarten, khLeer: kh.leer,
      andereOffen: !!S.andere, andereKlick: () => this.setState({ andere: !S.andere, zoOffen: false }),
      andereListe: [{ id: '', t: '– anderes Krankenhaus –' }, ...kh.andere.map(h => ({ id: h.id, t: h.t }))],
      andereWert: kh.andere.some(h => h.id === S.khHaus) ? S.khHaus : '',
      andereWahl: (e) => { if (e.target.value) this.setState({ khHaus: e.target.value }); },
      zoOffen: !!S.zoOffen, zs, zoText: kh.zoText,
      zoKlick: () => { const auf = !S.zoOffen; this.setState({ zoOffen: auf, andere: false, zs: { q: '', gruppen: [] } }); if (auf) this.fokus(this.refs.zs); },
      buchenText: hausName ? (kh.gebuchtId === khHaus ? hausName + ' gebucht' : hausName + ' buchen') : 'Krankenhaus wählen',
      buchen: () => { if (!khHaus) return app.hinweis('Bitte ein Krankenhaus wählen'); tun('bucheKh', khHaus, kh.grund); },
      zusammenlegen: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ mehrOffen: false }); tun('zusammenlegen'); },
      zlTitel: d.zlTitel,
      schliessen: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ mehrOffen: false }); tun('schliessen'); },
      schliessenTitel: d.schliessenTitel,
      mehrOffen: !!S.mehrOffen, mehrExp: S.mehrOffen ? 'true' : 'false', mehrKlick: () => this.setState({ mehrOffen: !S.mehrOffen }),
      vormerken, vormerkenTitel: 'Fahrzeuge über der Dienstzeit vormerken – erst nach dem Anfunken alarmiert',
      alarmieren,
      hauptKnopf: knopfText(gewListe, laufend ? 'nachalarmieren' : 'alarmieren') || (laufend ? 'Nachalarmieren' : 'Alarmieren'),
    };
  }
}
