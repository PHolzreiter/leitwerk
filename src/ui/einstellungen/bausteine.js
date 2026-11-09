// Eigene Bausteine der Einstellungsseiten (aus dem Spielmenü-Entwurf „Einstellungsseiten“): Textfeld, Karte (Lage),
// Einrichtungen, Dienstplan, KH-Aufnahme, CSV-Import, Zuordnung zu den Merkmalen.
// Echte Daten und Aktionen kommen aus this.app.zusatz (einstellungen/zusatz.ts). Aufruf: zusatzZeile.call(komponente, r, base, ctx)
/* eslint-disable */

const IC = { an: 'M5 12.5l4.5 4.5L19 7.5', zu: 'M12 4a8 8 0 1 0 0 16zM12 4a8 8 0 0 1 0 16', aus2: 'M4 13c2.5-3 4.5-3 8 0s5.5 3 8 0', nein: 'M6 12h12' };
const TAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export function zusatzZeile(r, base, ctx) {
  const st = this.state || {};
  const Z = this.app && this.app.zusatz;
  const { rk, V, setV, sw1 } = ctx;
  const segL = (key, opts, def) => opts.map(o => ({ label: o, cls: 'l-seg' + (V(key, def) === o ? ' on' : ''), pick: () => this.wert(key, o) }));
  const melde = t => this.setState({ ['ok_' + rk]: t });

  if (r.t === 'area') return { ...base, isRow: false, isArea: true, zeilen: r.zeilen || 3, ph: r.ph || '', val: V(r.key, r.def || ''), set: setV(r.key) };

  if (r.t === 'lage') {
    // Kartenausschnitt: echte Karte (zusatz.lageKarte), Klick setzt den Punkt; Koordinaten auch von Hand
    const koord = String(V(r.key, r.def || '') || '');
    this.lageRefs = this.lageRefs || {};
    const ref = this.lageRefs[r.key] = this.lageRefs[r.key] || { current: null };
    if (Z) Z.lageKarte(ref, koord, r.marke || 'hier', (lat, lon) => this.wert(r.key, lat.toFixed(5) + ', ' + lon.toFixed(5)));
    return { ...base, isRow: false, isLage: true, val: koord, set: setV(r.key), kartenRef: ref, ohneKarte: !Z, karteDa: !!(Z && Z.karteDa()),
      karte: () => { if (!Z) return; melde('Im Kartenfenster einen Punkt anklicken …'); Z.karteWaehlen(r.label).then(p => { if (p) { this.wert(r.key, p.lat.toFixed(5) + ', ' + p.lon.toFixed(5)); melde('Punkt übernommen'); } else melde('Abgebrochen'); }); } };
  }

  if (r.t === 'einr') {
    // Einrichtungen des Krankenhauses als Gruppen (Wert = Namen mit Komma, wie in der Tabelle)
    const G = Z ? Z.einrGruppen() : [];
    const cur = Z ? Z.einrLesen(String(V(r.key, r.def || '') || '')) : [];
    const zu = st['ez_' + r.key] || G.slice(1).map(g => g.t);
    const setzen = ids => this.wert(r.key, Z.einrText(ids));
    return { ...base, isRow: false, isEinr: true, gruppen: G.map(g => ({ t: g.t, offen: !zu.includes(g.t), exp: zu.includes(g.t) ? 'false' : 'true', pfCls: 'ei-pf' + (zu.includes(g.t) ? '' : ' auf'),
      n: g.e.filter(x => cur.includes(x.id)).length + ' von ' + g.e.length,
      auf: () => this.setState({ ['ez_' + r.key]: zu.includes(g.t) ? zu.filter(x => x !== g.t) : [...zu, g.t] }),
      e: g.e.map(x => ({ t: x.name, an: cur.includes(x.id) ? 'true' : 'false', cls: 'ei-chip' + (cur.includes(x.id) ? ' on' : ''), flip: () => setzen(cur.includes(x.id) ? cur.filter(y => y !== x.id) : [...cur, x.id]) })) })) };
  }

  if (r.t === 'plan') {
    // Dienstplan-Editor: Wert bleibt der Text wie in der Tabelle („Mo–Fr 07:00–19:00; Sa 08:00–16:00“)
    const text = String(V(r.key, r.def || '') || '');
    const p = Z ? Z.planLesen(text) : { schichten: [], fehler: 'nicht verfügbar' };
    const sch = p.schichten;
    const setz = n => this.wert(r.key, Z.planText(n));
    const h = x => { if (x === 'auf') return 6.8; if (x === 'unter') return 16.6; const [a, b] = String(x).split(':'); return (+a || 0) + (+b || 0) / 60; };
    let std2 = 0;
    const woche = TAGE.map((t, i) => ({ t, b: [].concat(...sch.filter(s => s.t.includes(i)).map(s => {
      const a = h(s.von), e0 = h(s.bis), e = e0 <= a ? 24 : e0; std2 += (e0 <= a ? 24 - a + e0 : e - a);
      const tip = LANG[i] + ' ' + (s.von === 'auf' ? 'Sonnenaufgang' : s.von) + ' – ' + (s.bis === 'unter' ? 'Sonnenuntergang' : s.bis);
      return [{ x: (a / 24 * 100).toFixed(2), w: ((e - a) / 24 * 100).toFixed(2), tip }];
    })) }));
    // über Mitternacht: Rest am nächsten Tag zeigen
    sch.forEach(s => { const a = h(s.von), e0 = h(s.bis); if (e0 <= a && e0 > 0) s.t.forEach(i => woche[(i + 1) % 7].b.push({ x: '0', w: (e0 / 24 * 100).toFixed(2), tip: LANG[(i + 1) % 7] + ' bis ' + (s.bis === 'unter' ? 'Sonnenuntergang' : s.bis) })); });
    const rund = sch.length === 0;
    return { ...base, isRow: false, isPlan: true, planFehler: p.fehler || '', hatPlanFehler: !!p.fehler,
      vorlagen: [['24/7', []], ['Tag Mo–Fr 07–19', [{ t: [0, 1, 2, 3, 4], von: '07:00', bis: '19:00' }]], ['Wechsel 07 und 19 Uhr', [{ t: [0, 1, 2, 3, 4, 5, 6], von: '07:00', bis: '19:00' }, { t: [0, 1, 2, 3, 4, 5, 6], von: '19:00', bis: '07:00' }]], ['Hell (Sonnenauf- bis -untergang)', [{ t: [0, 1, 2, 3, 4, 5, 6], von: 'auf', bis: 'unter' }]]].map(([t, n]) => ({ t, go: () => setz(n) })),
      schichten: sch.map((s, si) => ({ keinTag: s.t.length === 0,
        tage: TAGE.map((t, i) => ({ t, lang: LANG[i], an: s.t.includes(i) ? 'true' : 'false', cls: 'ei-tag' + (s.t.includes(i) ? ' on' : ''), flip: () => setz(sch.map((x, j) => j !== si ? x : { ...x, t: x.t.includes(i) ? x.t.filter(y => y !== i) : [...x.t, i].sort() })) })),
        von: s.von, bis: s.bis, vonSonne: s.von === 'auf', vonUhr: s.von !== 'auf', bisSonne: s.bis === 'unter', bisUhr: s.bis !== 'unter',
        setVon: e => setz(sch.map((x, j) => j !== si ? x : { ...x, von: e.target.value })), setBis: e => setz(sch.map((x, j) => j !== si ? x : { ...x, bis: e.target.value })),
        weg: () => setz(sch.filter((x, j) => j !== si)) })),
      plus: () => setz([...(rund ? [] : sch), { t: [5, 6], von: '08:00', bis: '20:00' }]),
      summe: rund ? 'Rund um die Uhr im Dienst (zwei Teams: 07–19 und 19–07)' : Z.planText(sch) + ' · ' + Math.round(std2) + ' Stunden pro Woche',
      achse: [0, 6, 12, 18, 24].map(x => ({ x: x / 24 * 100, t: x })), woche: rund ? TAGE.map(t => ({ t, b: [{ x: '0', w: '100', tip: 'rund um die Uhr' }] })) : woche };
  }

  if (r.t === 'khauf') {
    if (!Z) return { ...base, isRow: true, isInfo: true, value: 'nur im Spiel', dot: '#9AA3B5' };
    const haeuser = Z.kh.haeuser();
    const wahl = String(V('kh_haus', '') || '');
    const haus = haeuser.find(x => x.id === wahl || x.name === wahl || x.kurz === wahl) || haeuser[0];
    if (!haus) return { ...base, isRow: true, isInfo: true, value: 'Keine Krankenhäuser mit Notaufnahme', dot: '#9AA3B5' };
    const kind = V('kh_alt', 'Erwachsene') === 'Kinder';
    const zeitWahl = st.s_kh_zeit || null;
    const d = Z.kh.daten(haus.id, kind ? 'kind' : 'erwachsener', zeitWahl, st.s_kh_f || '');
    const lu = st.kh_luecken && st.kh_luecken.id === haus.id ? st.kh_luecken.l : null;
    return { ...base, isRow: false, isKhauf: true, haeuser: haeuser.map(x => x.name), haus: haus.name, setHaus: e => this.setState({ s_kh_haus: e.target.value, kh_luecken: null }),
      alter: segL('kh_alt', ['Erwachsene', 'Kinder'], 'Erwachsene'),
      zeit: zeitWahl ? 'Zeitpunkt: ' + d.zeitKurz : 'Jetzt · ' + d.zeitKurz, zeitLang: d.zeitLang,
      zeitWert: d.zeitWert, zeitJetzt: () => this.setState({ s_kh_zeit: undefined }), istJetzt: !zeitWahl, nichtJetzt: !!zeitWahl,
      filter: st.s_kh_f || '', setFilter: e => this.setState({ s_kh_f: e.target.value }),
      bereiche: d.bereiche.map(b => ({ ...b, set: e => { const f = Z.kh.zeitSetzen(haus.id, b.id, e.target.value); if (f) melde('⚠ ' + f); else this.setState({}); }, vorgabe: () => { Z.kh.zeitVorgabe(haus.id, b.id); this.setState({}); } })),
      keineBereiche: d.bereiche.length === 0,
      symGr: d.gruppen.map(g => ({ t: g.t, s: g.s.map(s => ({ t: s.t, syn: s.syn, z: s.z.map(z => z.leer ? { leer: true, voll: false, cls: 'ei-z leer', sym: '', tip: '' } : { leer: false, voll: true, sym: IC[z.sym], cls: 'ei-z ' + z.sym + (z.eigen ? ' eigen' : ''), tip: z.tip, klick: () => { Z.kh.schalten(haus.id, s.id, z.d); this.setState({}); } }) })) })),
      luecken: () => { melde('prüfe …'); setTimeout(() => this.setState({ kh_luecken: { id: haus.id, l: Z.kh.luecken(haus.id, d.zeitMs) }, ['ok_' + rk]: undefined }), 20); },
      hatLuecken: !!lu, lueckenN: lu ? lu.length : 0, keineLuecken: !!lu && lu.length === 0,
      lueckenL: (lu || []).map(x => ({ sym: x.was, zeit: x.zeiten.join(', '), info: '' })),
      kannStd: d.vorgabeDa, stdCls: 'l-ghost sm' + (st.cfm === 'khstd' ? ' on' : ''), stdFrage: () => this.setState({ cfm: st.cfm === 'khstd' ? null : 'khstd' }), stdOffen: st.cfm === 'khstd', stdNein: () => this.setState({ cfm: null }),
      stdGo: () => { Z.kh.hausVorgabe(haus.id); this.setState({ cfm: null, ['ok_' + rk]: 'Haus zurück auf Vorgabe' }); } };
  }

  if (r.t === 'import') {
    if (!Z) return { ...base, isRow: true, isInfo: true, value: 'nur im Programm', dot: '#9AA3B5' };
    const art = st.impVon || 'fahrzeuge';
    const imp = st.impDatei;
    const ersetzen = V('imp_modus', 'Ergänzen') === 'Ersetzen';
    const zurueck = () => this.setState({ sp: art, impDatei: null, sw: sw1(), cfm: null });
    const waehlen = () => Z.imp.waehlen(art, st.impKind || null).then(i => { if (i) this.setState({ impDatei: i, impKind: i.kind }); }).catch(e => melde('⚠ ' + String((e && e.message) || e)));
    if (!imp) return { ...base, isRow: false, isImport: true, hatDatei: false, keineDatei: true, waehlen, andere: waehlen, ab: zurueck,
      datei: 'Noch keine Datei gewählt', dateiInfo: 'CSV mit Kopfzeile · Trennzeichen ; oder , · UTF-8', inhalte: [], kacheln: [], fehler: [], hinweise: [], modus: [], okText: '', hatFehler: false, hatHinweise: false };
    return { ...base, isRow: false, isImport: true, hatDatei: true, keineDatei: false, datei: imp.name, dateiInfo: imp.zeilen + ' Zeilen · ' + imp.trenn, andere: waehlen, waehlen,
      inhalt: imp.kindLabel + (imp.erkannt ? ' (erkannt)' : ''), setInhalt: e => { const k = Z.imp.arten().find(a => e.target.value.startsWith(a.label)); if (k) this.setState({ impDatei: Z.imp.neu(imp, k.kind), impKind: k.kind }); },
      inhalte: Z.imp.arten().map(a => a.kind === imp.kind ? a.label + (imp.erkannt ? ' (erkannt)' : '') : a.label),
      kacheln: [[imp.zeilen, 'Zeilen', ''], [imp.ok, 'übernehmbar', ' ok'], [imp.fehler.length, 'fehlerhaft', ' rot'], [imp.hinweise.length, 'Hinweise', ' gelb']].map(([n, t, c]) => ({ n: String(n), t, cls: 'ei-kachel' + c })),
      spalten: imp.spalten || '–', ignoriert: imp.ignoriert || '–',
      modus: segL('imp_modus', ['Ergänzen', 'Ersetzen'], 'Ergänzen'),
      modusHint: ersetzen ? 'Ersetzt alle eigenen ' + imp.kindLabel + ' – die Standarddaten bleiben' : 'Neue Einträge kommen dazu, gleiche Einträge werden aktualisiert',
      fehler: imp.fehler.slice(0, 50).map(f => ({ z: f.zeile, t: f.meldung })), hatFehler: imp.fehler.length > 0,
      hinweise: imp.hinweise.slice(0, 50).map(f => ({ z: f.zeile, t: f.meldung })), hatHinweise: imp.hinweise.length > 0,
      okText: imp.ok === 1 ? '1 Zeile übernehmen' : imp.ok + ' Zeilen übernehmen', okAus: imp.ok === 0,
      ok: () => { if (!imp.ok) return; try { const t = Z.imp.uebernehmen(imp, ersetzen); const pg = this.settingsData().reduce((a, g) => a.concat(g.pages), []).find(p => p.id === art); const i = pg ? pg.rows.findIndex(x => (x.btns || []).some(b => b && b.imp)) : -1; this.setState({ sp: art, impDatei: null, sw: sw1(), cfm: null, ...(i >= 0 ? { ['ok_' + art + ':' + (pg.rows[i].key || i)]: t } : {}) }); } catch (e) { melde('⚠ ' + String((e && e.message) || e)); } },
      ab: zurueck };
  }

  if (r.t === 'zuord') {
    if (!Z) return { ...base, isRow: true, isInfo: true, value: 'nur im Spiel', dot: '#9AA3B5' };
    const nur = !!V('zu_nur', false);
    const d = Z.zuord.daten(nur);
    if (!d) return { ...base, isRow: false, isZuord: true, leer: true, nichtLeer: false, leerText: 'Aktiv ist das eingebaute LeitWerk-Codesystem – es verwendet die Merkmale selbst. Die Zuordnung braucht es erst für ein eigenes Abfrageschema.', zeilen: [], merkmale: [], stand: '', stufen: '', hatStufen: false, nurAn: 'false', nurCls: 'l-tog', nurFlip: () => undefined, ki: () => undefined, fertig: () => this.setState({ sp: 'satzRd', sw: sw1(), cfm: null }) };
    return { ...base, isRow: false, isZuord: true, leer: false, nichtLeer: true, nurAn: nur ? 'true' : 'false', nurCls: 'l-tog' + (nur ? ' on' : ''), nurFlip: () => this.wert('zu_nur', !nur),
      ki: () => { melde('KI fragt …'); Z.zuord.ki(t => melde(t)).then(t => melde(t), e => melde('⚠ ' + String((e && e.message) || e))); }, stand: d.stand,
      merkmale: d.merkmale,
      zeilen: d.zeilen.map(z => ({ ...z, setM: e => { Z.zuord.setzen(z.id, e.target.value); this.setState({}); }, qCls: 'ei-q' + (z.art === 'gelb' ? ' ann' : z.art === 'rot' ? ' rot' : '') })),
      stufen: d.stufen, hatStufen: !!d.stufen,
      fertig: () => this.setState({ sp: 'satzRd', sw: sw1(), cfm: null }) };
  }
  return null;
}
