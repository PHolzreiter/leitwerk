// Hauptmenü – Logik aus dem Design „LeitWerk Hauptmenü“ (MainBild.dc.html), angebunden über this.app (anbindung.ts)
// Die Einstellungsseiten (settingsData, Zeilen, Suche, Regler, Auswahllisten) kommen aus einstellungen/seiten.js.
/* eslint-disable */
import { seitenEinmischen } from '../einstellungen/seiten.js';

export class Komponente {
  constructor(app, props) {
    this.app = app;
    this.props = props || {};
    this.state = {};
    this._plan = false;
  }
  setState(p) {
    this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p);
    if (this._plan) return;
    this._plan = true;
    Promise.resolve().then(() => { this._plan = false; if (this._zeichnen) this._zeichnen(); });
  }
  seitenOpt() {
    return { imSpiel: false, gesperrt: this.app.gesperrt ? this.app.gesperrt() : false, tab: t => { this.toggle('start'); this.setState({ tab: t }); } };
  }
  componentDidMount() {
    this.app.ablauf.onHostZu(() => this.setState({ code: '', ...((this.state || {}).ptest ? {} : { pcode: '' }), joinWeiter: false, jdrin: false, pWeiter: false, pdrin: false, jerr: 'Der Host hat die Lobby geschlossen', perr: (this.state || {}).ptest ? null : 'Der Host hat die Lobby geschlossen' }));
    // Regler-Animation: Auswahlleisten – blaue Markierung gleitet zum neuen Feld; Schalter – Knopf gleitet mit Federung
    this.onTap = e => this.reglerAnim(e);
    document.addEventListener('click', this.onTap, true);
    // eigene Auswahllisten und Kalender im LeitWerk-Stil statt der Browser-Fenster
    this.onPopDown = e => this.popMaus(e);
    this.onPopKey = e => this.popTaste(e);
    document.addEventListener('mousedown', this.onPopDown, true);
    document.addEventListener('keydown', this.onPopKey, true);
    // Esc: Hauptbildschirm → offenes Menü/Fenster schließen, sonst zum Startbildschirm; Startbildschirm → „Spiel verlassen?“
    this.onEsc = e => this.escTaste(e);
    document.addEventListener('keydown', this.onEsc, true);
    // Breite der unteren Reiter neu messen, solange keiner offen ist (Titel/Schriften kommen erst nach dem Start)
    this.nachmessen = () => { if (!(this.state || {}).fp) this.setState({ nw: this.messen() }); };
    this.tMess = setTimeout(this.nachmessen, 600);
    this.tMess2 = setTimeout(this.nachmessen, 2500);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.nachmessen());
    this.uhr = setInterval(() => { this.setState({ jetzt: Date.now() }); this.nachmessen(); }, 30000);
    this.setState({ noe: this.app.funkgruppenKarte });
    this.fokusTimer = setTimeout(() => { const b = this.splashRef && this.splashRef.current; if (b && b.focus) b.focus(); }, 80);
  }
  componentWillUnmount() { document.removeEventListener('mousedown', this.onPopDown, true); document.removeEventListener('keydown', this.onPopKey, true); this.popZu(); document.removeEventListener('keydown', this.onEsc, true); document.removeEventListener('click', this.onTap, true); clearInterval(this.uhr); clearTimeout(this.tMess); clearTimeout(this.tMess2); clearTimeout(this.t1); clearTimeout(this.t2); clearTimeout(this.fokusTimer); clearTimeout(this.tu); clearInterval(this.iu); }
  updStatus() {
    const st = this.state || {};
    return st.upd || ((this.props.update ?? 'verfügbar') === 'verfügbar' ? 'verfuegbar' : 'aktuell');
  }
  updKlick() {
    const u = this.app.ablauf.update();
    if (u.zustand === 'verfuegbar') return void this.app.ablauf.updateLaden();
    if (u.zustand === 'aktuell') {
      clearTimeout(this.tu);
      this.setState({ updSuche: true });
      this.tu = setTimeout(() => this.setState({ updSuche: false }), 1200);
    }
  }
  quitZu() {
    this.setState({ quit: false });
    setTimeout(() => { const b = this.splashRef && this.splashRef.current; if (b && b.focus) b.focus(); }, 60);
  }
  istEsc(e) {
    // Im Design-Canvas fängt die Ansicht selbst Esc ab – zum Testen wirkt dort Q genauso (nicht beim Tippen in Feldern)
    if (e.key === 'Escape') return true;
    const tippt = e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    return !tippt && (e.key === 'q' || e.key === 'Q') && !e.metaKey && !e.ctrlKey && !e.altKey;
  }
  escTaste(e) {
    const st = this.state || {};
    const intro = st.intro || ((this.props.intro ?? true) ? 'splash' : 'done');
    if (st.beendet) return;
    // Tastenkürzel wird gerade aufgenommen: die nächste Taste wird belegt (auch Esc); Entf/Rücktaste leert
    if (st.keyCap) {
      e.preventDefault(); e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      if (this.app.einst && this.app.einst.taste(st.keyCap, e)) return this.setState({ keyCap: null });
      if (this.app.einst && this.app.einst.lesen(st.keyCap) !== undefined) return this.setState({ keyCap: null });
      if (e.key === 'Delete' || e.key === 'Backspace') return this.setState({ ['s_' + st.keyCap]: '–', keyCap: null });
      const n = (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.key === ' ' ? 'Leertaste' : e.key.length === 1 ? e.key.toUpperCase() : e.key);
      return this.setState({ ['s_' + st.keyCap]: n, keyCap: null });
    }
    if (st.quit) {
      if (this.istEsc(e)) { e.preventDefault(); e.stopPropagation(); this.quitZu(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.app.ablauf.programmBeenden().then(ok => { if (!ok) this.setState({ quit: false, beendet: true }); }); }
      return;
    }
    if (!this.istEsc(e)) return;
    if (intro === 'splash') {
      e.preventDefault(); e.stopPropagation();
      this.setState({ quit: true });
      setTimeout(() => { const b = this.quitRef && this.quitRef.current; if (b && b.focus) b.focus(); }, 60);
      return;
    }
    if (intro !== 'done') return;
    e.preventDefault();
    // erst Rückfragen schließen, dann aus einer Unterseite zurück, dann zuklappen
    if (st.cfm || st.warn || st.saveRen || st.saveDel) { this.setState({ cfm: null, warn: null, saveRen: false, saveDel: false }); return; }
    if (st.fp === 'hilfe' && st.mh) { this.setState({ mh: null, mhF: {}, mhFehlt: null }); return; }
    if ((st.screen || 'main') === 'settings' && st.q) { this.setState({ q: '' }); return; }
    if ((st.screen || 'main') === 'settings' && this.subParent) { this.setState({ sp: this.subParent, edit: null, sw: (st.sw || 0) + 1, swLate: false }); return; }
    if (st.fp) { this.setState({ fp: null }); return; }
    if ((st.screen || 'main') !== 'main') { this.setState({ screen: 'main', swapping: false }); return; }
    this.zumStart();
  }
  weiter(e) {
    // Esc ist auf dem Startbildschirm für „Spiel verlassen?“ reserviert; bei offenem Dialog startet nichts
    if (e && e.key && this.istEsc(e)) return;
    if ((this.state || {}).quit || (this.state || {}).beendet) return;
    if (this.geht) return;
    this.geht = true;
    this.setState({ intro: 'leaving' });
    this.t2 = setTimeout(() => this.setState({ intro: 'done' }), 1300);
  }
  zumStart() {
    clearTimeout(this.t1); clearTimeout(this.t2);
    this.geht = false;
    this.setState({ intro: 'splash', screen: 'main', zurueck: true });
    this.fokusTimer = setTimeout(() => { const b = this.splashRef && this.splashRef.current; if (b && b.focus) b.focus(); }, 80);
  }
  // Bereitschafts-Check: was zum Spielen fehlt, kommt aus den Einstellungen
  // Bereitschafts-Check: Prüfungen der App (startseite.ts → pruefen), Zustände ok · warn · fehler · aus
  bereitschaft() {
    const farbe = { ok: '#4CC38A', warn: '#FFC72C', fehler: '#E5484D', aus: '#9AA3B5' };
    const ziel = { karten: ['prog', 'karten', 'Kartenpakete'], codes: ['daten', 'codes', 'Einsatzcodes'], anrufe: ['platz', 'anrufe', 'Anrufe & KI'] };
    const liste = this.app.ablauf.checks();
    if (!liste) return [{ kurz: 'Prüfe …', name: 'Bereitschafts-Check', text: 'wird geprüft …', detail: 'Einen Moment …', stufe: 'aus', g: 'prog', p: 'programm', ziel: '', dot: farbe.aus }];
    return liste.map(c => {
      const z = c.name === 'Spracheingabe' ? ['platz', 'mikro', 'Mikrofon & Funk'] : ziel[c.seite] || ['prog', 'programm', 'Programm'];
      return { kurz: c.name, name: c.name, text: c.text, detail: c.detail, stufe: c.stufe, g: z[0], p: z[1], ziel: z[2], dot: farbe[c.stufe] || farbe.aus };
    });
  }
  // Code prüfen = wirklich beitreten (Fehler erscheinen über den Kästchen)
  codePruefen(w) {
    const st = this.state || {};
    const c = (w === 'j' ? st.code : st.pcode) || '';
    if (c.length < 6 || st.jLaeuftPruef) return;
    const name = ((w === 'j' ? st.jname : st.pname) ?? this.app.ablauf.meinName()).trim();
    const fk = w === 'j' ? 'jerr' : 'perr';
    if (!name) return this.setState({ [fk]: 'Bitte einen Namen eingeben' });
    this.setState({ jLaeuftPruef: true, [fk]: null });
    this.app.ablauf.beitreten(c, name).then(err => {
      if (w === 'j') this.setState(err ? { jerr: err, jLaeuftPruef: false } : { jerr: null, joinWeiter: true, codeFocus: false, jdrin: false, jLaeuftPruef: false });
      else this.setState(err ? { perr: err, jLaeuftPruef: false } : { perr: null, pWeiter: true, ptest: false, pfoc: false, jLaeuftPruef: false });
    });
  }
  // Als Disponent: in ein laufendes Spiel sofort, in eine wartende Lobby „Warte auf den Host …“
  joinRein() {
    const st = this.state || {};
    if (st.jdrin) return;
    const r = this.app.ablauf.alsDisponentRein();
    if (r === 'wartet') this.setState({ jdrin: true });
  }
  einstellungOeffnen(sg, sp) {
    clearTimeout(this.t1);
    const st = this.state || {};
    const cur = st.screen || 'main';
    const sw = (st.sw || 0) + 1;
    if (cur === 'settings') return this.setState({ fp: null, sg, sp, q: '', sw, swLate: false });
    // Check fährt hoch, Einstellungen klappen gleichzeitig auf
    this.setState({ fp: null, screen: 'settings', sg, sp, q: '', sw, swLate: true, swapping: cur !== 'main' });
    if (cur !== 'main') this.t1 = setTimeout(() => this.setState({ swapping: false }), 700);
  }
  messen() {
    // Natürliche Breite jedes unteren Reiters messen – unabhängig davon, ob er gerade offen ist oder sich noch bewegt
    const nw = { ...((this.state || {}).nw || {}) };
    Object.keys(this.fpRefs || {}).forEach(key => {
      const el = this.fpRefs[key].current;
      if (!el) return;
      const w0 = el.style.width, t0 = el.style.transition;
      el.style.transition = 'none'; el.style.width = 'auto';
      nw[key] = el.offsetWidth;
      el.style.width = w0; void el.offsetWidth; el.style.transition = t0;
    });
    return nw;
  }
  fpToggle(k) {
    const st = this.state || {};
    const cur = st.fp || null;
    const unten = ['log', 'arbeit', 'hilfe'];
    const swap = !!cur && cur !== k && unten.includes(cur) && unten.includes(k);
    clearTimeout(this.tSwap);
    this.setState({ fp: cur === k ? null : k, nw: this.messen(), fpSwap: swap });
    if (swap) this.tSwap = setTimeout(() => this.setState({ fpSwap: false }), 1600);
  }
  toggle(id) {
    clearTimeout(this.t1);
    const cur = (this.state || {}).screen || 'main';
    const oeffnen = () => this.setState(id === 'settings' ? { screen: id, sw: ((this.state || {}).sw || 0) + 1, swLate: true } : { screen: id });
    if (cur === id) return this.setState({ screen: 'main', swapping: false });
    // Beitreten: Code-Feld gleich bereit zum Tippen
    if (id === 'join' || id === 'pilot') setTimeout(() => { const el = document.querySelector('.l-item.open .l-codein'); if (el && !(this.state || {}).joinWeiter && !(this.state || {}).pWeiter) el.focus({ preventScroll: true }); }, 450);
    if (cur === 'main') return oeffnen();
    // Wechsel: alter Punkt klappt zu, neuer klappt auf – gleichzeitig
    this.setState({ swapping: true });
    oeffnen();
    this.t1 = setTimeout(() => this.setState({ swapping: false }), 700);
  }
  renderVals() {
    const st = this.state || {};
    this.splashRef = this.splashRef || { current: null };
    const intro = st.intro || ((this.props.intro ?? true) ? 'splash' : 'done');
    const s = st.screen || 'main';
    const set = (k, v) => this.setState({ [k]: v });
    const item = id => ({ cls: 'l-item' + (s === id ? ' open' : ''), exp: s === id ? 'true' : 'false', toggle: () => this.toggle(id) });
    const seg = (key, opts, def) => opts.map(o => ({ label: o, cls: 'l-seg' + ((st[key] ?? def) === o ? ' on' : ''), pick: () => set(key, o) }));

    // ---------- Spiel starten (echte Werte über this.app: Einstellungen in bindung.ts, Abläufe in ablauf.ts)
    const A = this.app.ablauf;
    const Vs = (k, d) => this.wertLesen(k, d);
    const noe = st.noe || [];
    const fgId = Vs('fg', 'NÖ-03') || 'NÖ-03';
    const fgs = noe.map(f => ({
      id: f.id, d: f.d, cx: f.cx, cy: Number(f.cy) + 4,
      cls: 'l-fg' + (f.id === fgId ? ' on' : ''), lcls: 'l-fgl' + (f.id === fgId ? ' on' : ''),
      on: f.id === fgId ? 'true' : 'false', aria: 'Funkgruppe ' + f.id + ', ' + f.kurz,
      pick: () => this.wert('fg', f.id),
      key: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.wert('fg', f.id); } }
    }));
    const fgSelRaw = noe.find(f => f.id === fgId);
    const fgSel = fgSelRaw ? { id: fgSelRaw.id, kurz: fgSelRaw.kurz, bez: fgSelRaw.bez } : { id: fgId, kurz: '', bez: '' };
    const sz = A.sitzung();
    const fgsMini = noe.map(f => ({ d: f.d, cls: 'l-fg' + (f.id === sz.fgId ? ' on' : '') }));
    const wetterWahl = Vs('wetterArt', 'Simuliert');
    const startzeit = Vs('startzeit', '') || '';
    const zz = n => String(n).padStart(2, '0');
    const naechste = new Date(Date.now() + 3600000); naechste.setMinutes(0, 0, 0);
    const dtStandard = naechste.getFullYear() + '-' + zz(naechste.getMonth() + 1) + '-' + zz(naechste.getDate()) + 'T' + zz(naechste.getHours()) + ':00';
    const dtText = v => { const t = new Date(v); if (!isFinite(t.getTime())) return v; return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][t.getDay()] + ' ' + zz(t.getDate()) + '.' + zz(t.getMonth() + 1) + '. · ' + zz(t.getHours()) + ':' + zz(t.getMinutes()); };
    const wetterInfo = { Echt: 'Echtes Wetter für die Funkgruppe, Stunde für Stunde', Simuliert: 'Vom Simulator, passend zu Jahreszeit und Uhrzeit', Wechselhaft: 'Ändert sich oft – auch Gewitter, Sturm, Glätte', Fest: 'Bleibt das ganze Spiel gleich' }[wetterWahl] || '';
    const aufTitel = { Realistisch: 'Wie in der Wirklichkeit 2025', Standard: 'Etwas mehr und spannender gemischt, mit Spielhilfen', Stressig: 'Noch mehr und härter' };
    const arten = [['rd', 'RD', 'Notfälle (Rettungsdienst)', true], ['kt', 'KT', 'Krankentransporte', true], ['sek', 'SEK', 'Sekundärtransporte (Überstellungen)', true], ['acn', 'ACN', 'Akutpflege', true]];
    const lobbyDa = A.rolle() === 'host';
    const modus = lobbyDa ? 'Multiplayer' : (st.modus ?? 'Solo');
    const lobby = A.lobby();
    // Erstwahl der Anrufer-KI ohne Dialog: solange noch nie gewählt
    const kiOffen = A.kiErstwahlNoetig() || !!st.kiErst;
    const hname = st.hname ?? A.meinName();
    const lobbyNeu = () => {
      if (!hname.trim() || (kiOffen && !st.kiErst) || st.lobbyLaeuft) return;
      this.setState({ lobbyLaeuft: true, startFehler: null });
      A.hosten(hname.trim()).then(f => this.setState({ lobbyLaeuft: false, startFehler: f }));
    };
    const tab = st.tab || 'neu';
    const saves = A.saves();
    const saveSel = Math.min(st.save ?? 0, Math.max(0, saves.length - 1));
    const umbenennen = () => { const sv = saves[saveSel]; const n = (st.saveRenWert ?? '').trim(); this.setState({ saveRen: false }); if (sv && n && n !== sv.name) A.umbenennen(sv.datei, n).then(f => this.setState({ fortFehler: f })); };
    // Bereitschafts-Check aus der App
    const bereit = this.bereitschaft(st);
    const checks = bereit.map(b => ({ name: b.kurz, text: b.text, dot: b.dot, tc: b.stufe === 'ok' || b.stufe === 'aus' ? '#9AA3B5' : b.dot, fix: b.stufe === 'warn' || b.stufe === 'fehler', go: () => this.einstellungOeffnen(b.g, b.p) }));

    // ---------- Beitreten
    const code = st.code || '';
    const foc = !!st.codeFocus;
    const box = i => ({ ch: code[i] || '', cls: 'l-cbox' + (code[i] ? ' full' : '') + (foc && i === code.length ? ' next' : '') });
    const lobbyCodeJ = '';
    const szSpieler = lobby.spieler.map(p => ({ ini: (p.name.trim()[0] || '?').toUpperCase(), name: p.name + (p.ich ? ' (du)' : ''), title: p.name + (p.host ? ' · Host' : '') + (p.pilot ? ' · Pilot ' + p.pilot : ''), cls: [p.host ? 'host' : '', p.ich ? 'neu' : '', p.pilot ? 'pil' : ''].filter(Boolean).join(' ') }));

    // ---------- Pilot
    const pcode = st.pcode || '';
    const pbox = i => ({ ch: pcode[i] || '', cls: 'l-cbox' + (pcode[i] ? ' full' : '') + (st.pfoc && i === pcode.length ? ' next' : '') });
    const helis = st.pWeiter ? A.helis() : [];
    const hSel = st.heli ?? ((helis.find(h => h.letzter && !h.grund) || {}).id || null);
    // ---------- Einstellungen (gemeinsam mit dem Spielmenü: einstellungen/seiten.js)
    const SW = this.seitenWerte();
    const V = (k, d) => this.wertLesen(k, d);
    const setV = k => e => this.wert(k, (e && e.target) ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e);

    const splashShown = intro !== 'done';
    // Hintergrund nach Tageszeit: bis 21:9 die 21:9-Bilder (16:9 wird links/rechts beschnitten), ab ca. 29:10 die 32:9-Bilder
    const BILDER = {
      Morgen: { w21: this.app.bilder['21x9-morgen'], w32: this.app.bilder['32x9-morgen'], gruss: 'Guten Morgen', uhr: '07:12' },
      Mittag: { w21: this.app.bilder['21x9-mittag'], w32: this.app.bilder['32x9-mittag'], gruss: 'Guten Tag', uhr: '13:05' },
      Abend: { w21: this.app.bilder['21x9-abend'], w32: this.app.bilder['32x9-abend'], gruss: 'Guten Abend', uhr: '19:40' },
      Nacht: { w21: this.app.bilder['21x9-nacht'], w32: this.app.bilder['32x9-nacht'], gruss: 'Gute Nacht', uhr: '23:15' }
    };
    const jetzt = new Date(st.jetzt || Date.now());
    const h = jetzt.getHours();
    const autoZeit = h >= 5 && h < 10 ? 'Morgen' : h >= 10 && h < 17 ? 'Mittag' : h >= 17 && h < 21 ? 'Abend' : 'Nacht';
    const tzWahl = this.props.tageszeit ?? 'automatisch';
    const tz = BILDER[tzWahl] ? tzWahl : autoZeit;
    const bgB = BILDER[tz];
    const echteUhr = String(h).padStart(2, '0') + ':' + String(jetzt.getMinutes()).padStart(2, '0');
    const bg = { w21: bgB.w21, w32: bgB.w32,
      gruss: tz === 'Nacht' && h >= 17 ? 'Guten Abend' : bgB.gruss,
      datum: jetzt.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' }).replace('.,', ','),
      uhr: BILDER[tzWahl] ? bgB.uhr : echteUhr };
    const UPD = this.app.ablauf.update();
    const us = st.updSuche ? 'suche' : UPD.zustand;
    const uv = UPD.version || this.app.ablauf.version() || '';
    const mb = (v, ohne) => (v / 1048576).toFixed(1).replace('.', ',') + (ohne ? '' : ' MB');
    const updP = UPD.total > 0 ? Math.round(UPD.done / UPD.total * 100) : 0;
    const updMap = {
      aktuell: { label: UPD.fehler ? 'Update fehlgeschlagen · erneut' : 'Aktuell' + (uv ? ' · v' + uv : ''), color: UPD.fehler ? '#E5484D' : '#4CC38A', aria: UPD.fehler ? 'Update fehlgeschlagen: ' + UPD.fehler : 'LeitWerk ist aktuell. Klicken, um nach Updates zu suchen.' },
      suche: { label: 'Suche nach Updates …', spin: true, aria: 'Suche nach Updates' },
      verfuegbar: UPD.fehler ? { label: 'Update fehlgeschlagen · erneut', color: '#E5484D', neu: true, aria: 'Update ' + uv + ' fehlgeschlagen: ' + UPD.fehler + ' – klicken, um es erneut zu versuchen.' } : { label: 'Update ' + uv, color: '#3B8BFF', puls: true, neu: true, aria: 'Update ' + uv + ' verfügbar. Klicken zum Herunterladen und Installieren.' },
      laedt: { label: UPD.total > 0 ? mb(UPD.done, true) + ' / ' + mb(UPD.total) + ' · ' + updP + ' %' : 'Update wird geladen …', spin: true, bar: true, neu: true, aria: 'Update wird geladen' },
      fertig: { label: 'Wird installiert – LeitWerk startet neu …', color: '#FFC72C', neu: true, aria: 'Update geladen, LeitWerk startet neu.' }
    };
    const um = updMap[us];
    const fp = st.fp || null;
    const logOpen = fp === 'log';
    this.navRef = this.navRef || { current: null };
    this.fpRefs = this.fpRefs || { log: { current: null }, arbeit: { current: null }, hilfe: { current: null } };
    const fpT = k => () => this.fpToggle(k);
    const PANELBREITE = { log: 600, arbeit: 520, hilfe: 560 };
    const nw = st.nw || {};
    const bw = {};
    Object.keys(PANELBREITE).forEach(k => { bw[k] = fp === k ? PANELBREITE[k] + 'px' : (nw[k] ? nw[k] + 'px' : 'auto'); });
    const fortschritt = [];
    let fi = 0;
    const fpunkte = this.app.ablauf.fortschritt();
    [['arbeit', 'In Arbeit', '#3B8BFF'], ['geplant', 'Geplant', '#6B7385'], ['fertig', 'Gerade fertig geworden', '#4CC38A']].forEach(([stand, titel, c]) => {
      const l = fpunkte.filter(x => x.stand === stand);
      if (!l.length) return;
      fortschritt.push({ isHead: true, isItem: false, label: titel, i: Math.min(fi++, 12) });
      l.forEach(x => fortschritt.push({ isHead: false, isItem: true, titel: x.titel, pz: x.prozent, text: x.text, hasText: !!x.text, c, i: Math.min(fi++, 12) }));
    });
    const arb = fpunkte.find(x => x.stand === 'arbeit');
    const melden = [['FZ', 'Fahrzeug'], ['DS', 'Dienststelle'], ['POI', 'Ort (POI)'], ['KH', 'Krankenhaus'], ['VS', 'Vorschlag'], ['ID', 'Idee/Wunsch']].map(([k, label]) => ({ k, label, go: () => this.setState({ mh: k, mhF: {}, mhFehlt: null }) }));
    const ART = { FZ: 'fahrzeug', DS: 'dienststelle', POI: 'poi', KH: 'krankenhaus', VS: 'vorschlag', ID: 'idee', HILFE: 'hilfe' };
    // Mithelfen-Formulare wie in der App (mithelfen.ts), aber im Fenster selbst statt als Dialog
    const lage = ['lage', 'Lage', 'Adresse, Ort oder Koordinaten (48.20, 15.63)', true, 'Die Karte zum Anklicken gibt es im Spiel – hier reicht Adresse oder Koordinaten'];
    const FORM = {
      FZ: { titel: 'Fahrzeug melden', felder: [['seg', 'Was ist los?', ['Fahrzeug fehlt', 'Angaben stimmen nicht', 'Gibt es nicht mehr']], ['text', 'Dienststelle', 'Name der Dienststelle tippen …', true, 'Fehlt die Dienststelle selbst? Dann zuerst unter „Dienststelle“ melden.'], ['text', 'Funkrufname', 'z. B. 72/101', true], ['sel', 'Typ', ['RTW', 'RTW-C', 'KTW', 'NEF', 'NAH', 'ACN', 'SEW']], ['text', 'Dienstzeiten', 'wenn bekannt, z. B. Mo–Fr 07–19'], ['area', 'Hinweis', 'Was sollen wir noch wissen?']] },
      DS: { titel: 'Dienststelle melden', felder: [['text', 'Name', 'z. B. Rettungsdienst Musterdorf', true], ['sel', 'Typ', ['Rettungsdienst', 'Notarztstützpunkt', 'Luftrettung', 'Stellplatz (nur Fahrzeuge)', 'Feuerwehr', 'Polizei', 'Bergrettung', 'Wasserrettung', 'Sonstige']], ['text', 'Adresse', 'Straße Hausnummer, PLZ Ort'], lage, ['area', 'Hinweis', '']] },
      POI: { titel: 'Ort melden', felder: [['text', 'Name', 'z. B. Freibad Musterdorf', true], ['sel', 'Kategorie', ['– bitte wählen –', 'Pflegeheim', 'Schule', 'Kindergarten', 'Bahnhof', 'Bad', 'Sportplatz', 'Arztpraxis', 'Apotheke', 'Sonstiges'], true], lage, ['area', 'Hinweis', '']] },
      KH: { titel: 'Krankenhaus melden', felder: [['seg', 'Was ist los?', ['Krankenhaus / Ambulanz fehlt', 'Angaben stimmen nicht']], ['text', 'Welches Krankenhaus', 'z. B. Klinikum Musterstadt', true], ['area', 'Abteilungen / was stimmt nicht', 'Was fehlt oder stimmt nicht?', true]] },
      VS: { titel: 'Vorschlag', felder: [['text', 'Titel', 'Kurz, worum es geht', true], ['area', 'Beschreibung', 'Was soll anders werden?', true]] },
      ID: { titel: 'Idee oder Wunsch', felder: [['text', 'Titel', 'Kurz, worum es geht', true], ['area', 'Beschreibung', 'Was wünschst du dir?', true]] }
    };
    const hilfeAlle = this.app.ablauf.hilfe();
    const mhKey = st.mh && st.mh.startsWith('H') ? 'HILFE' : st.mh;
    const mhDef = mhKey === 'HILFE' ? { titel: 'Ich weiß das', frage: (hilfeAlle[Number(st.mh.slice(1))] || {}).titel + ' – ' + (hilfeAlle[Number(st.mh.slice(1))] || {}).text, felder: [['area', 'Deine Antwort', 'Was weißt du darüber?', true], ['text', 'Quelle (optional)', 'z. B. selbst gesehen, Website, Dienstplan']] } : FORM[mhKey];
    const mhF = st.mhF || {};
    const mhFelder = mhDef ? mhDef.felder.map(([typ, label, x, pflicht, hint], i) => {
      const val = mhF[i] ?? (typ === 'seg' ? x[0] : typ === 'sel' ? x[0] : '');
      const setz = v => this.setState({ mhF: { ...mhF, [i]: v }, mhFehlt: null });
      return { label, pflicht: !!pflicht, isSeg: typ === 'seg', isText: typ === 'text' || typ === 'lage', isArea: typ === 'area', isSel: typ === 'sel',
        opts: typ === 'seg' ? x.map(o => ({ label: o, cls: 'l-seg' + (val === o ? ' on' : ''), pick: () => setz(o) })) : [], options: typ === 'sel' ? x : [],
        ph: typeof x === 'string' ? x : '', val, set: e => setz(e.target.value), hint: hint || '', hasHint: !!hint };
    }) : [];
    const TST = { eingegangen: ['offen', '#9AA3B5'], wartet: ['wird gesendet', '#9AA3B5'], in_arbeit: ['in Arbeit', '#3B8BFF'], rueckfrage: ['Rückfrage', '#FFC72C'], eingebaut: ['eingebaut', '#4CC38A'], erledigt: ['erledigt', '#4CC38A'], abgelehnt: ['abgelehnt', '#E5484D'] };
    const tickets = this.app.ablauf.tickets().slice(0, 8).map(t => { const z = TST[t.status] || ['offen', '#9AA3B5']; const tage = Math.floor((Date.now() - t.erstellt) / 86400000); return { titel: t.titel, wann: tage <= 0 ? 'heute' : tage === 1 ? 'gestern' : 'vor ' + tage + ' Tagen', st: z[0], c: z[1] }; });
    const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const clAlle = this.app.ablauf.changelog();
    const changelog = (st.logAlle ? clAlle : clAlle.slice(0, 30)).map(u => { const d = u.datum ? new Date(u.datum) : null; return [u.version, d ? d.toDateString() : '', u.titel, u.punkte, d]; });
    const tage = {};
    changelog.forEach(e => { if (e[4]) tage[e[1]] = WT[e[4].getDay()] + ', ' + e[4].getDate() + '. ' + e[4].toLocaleDateString('de-AT', { month: 'long' }); });
    // Neueste zuerst im DOM; die Zeitleiste ist umgedreht (column-reverse), also steht das Neueste unten am Knopf.
    const timeline = [];
    let n = 0;
    const nachTag = [];
    changelog.forEach(e => { const g = nachTag.find(x => x.d === e[1]); if (g) g.e.push(e); else nachTag.push({ d: e[1], e: [e] }); });
    nachTag.forEach(g => {
      g.e.forEach(([version, datum, titel, punkte]) => {
        const neu = n === 0;
        timeline.push({ isEntry: true, isDay: false, version, titel, punkte, neu, i: Math.min(n, 10), cls: 'l-tli' + (n === 0 ? ' last' : ''), dotCls: 'l-tldot' + (neu ? ' neu' : ''), vc: neu ? '#FFC72C' : '#3B8BFF' });
        n++;
      });
      timeline.push({ isEntry: false, isDay: true, label: tage[g.d] || g.d, i: Math.min(n, 10) });
      n++;
    });
    return {
      upd: { label: um.label, kurz: ({ aktuell: 'Aktuell', suche: 'Suche …', verfuegbar: UPD.fehler ? 'Fehler' : 'Update', laedt: updP + ' %', fertig: 'Neustart' })[us], fehler: UPD.fehler ? 'Update fehlgeschlagen: ' + UPD.fehler : '', fehlerDa: !!UPD.fehler && us === 'verfuegbar', aria: um.aria, spin: !!um.spin, dot: !um.spin, color: um.color || '#9AA3B5', dotCls: 'l-updot' + (um.puls ? ' puls' : ''), bar: !!um.bar, pct: updP,
        cls: 'l-upd' + (um.neu ? ' neu' : '') + (um.spin ? ' busy' : '') + (st.fp === 'check' ? ' klein' : '') + (UPD.fehler && us === 'verfuegbar' ? ' fehl' : ''), go: () => this.updKlick() },
      timeline,
      logAnzahl: clAlle.length + (clAlle.length === 1 ? ' Version' : ' Versionen'), logAlleText: st.logAlle ? 'Nur neueste' : 'Alle Versionen', logAlleDa: clAlle.length > 30, logAlleKlick: () => this.setState({ logAlle: !st.logAlle }),
      newsCls: 'l-newsbtn' + (logOpen ? ' on' : ''),
      logExp: logOpen ? 'true' : 'false',
      logCls: 'l-log' + (logOpen ? ' on' : ''),
      logBackCls: 'l-logback' + (fp ? ' on' : ''),
      toggleLog: fpT('log'),
      closeLog: () => this.setState({ fp: null }),
      fortschritt, melden, bw,
      hilfe: hilfeAlle.slice(0, st.hilfeMehr ? 99 : 3).map((h, i) => ({ ...h, go: () => this.setState({ mh: 'H' + i, mhF: {}, mhFehlt: null }) })),
      hilfeMehr: !st.hilfeMehr && hilfeAlle.length > 3, hilfeMehrText: (hilfeAlle.length - 3) + ' weitere anzeigen', hilfeMehrGo: () => set('hilfeMehr', true),
      tickets,
      neuVersion: (this.app.ablauf.changelog()[0] || {}).version || '', neuTitel: (this.app.ablauf.changelog()[0] || {}).titel || '',
      arbTitel: arb ? arb.titel : '–', arbPz: arb ? arb.prozent : 0,
      hilfeAnzahl: hilfeAlle.length,
      versionText: this.app.ablauf.version() ? 'v' + this.app.ablauf.version() : '',
      mhUebersicht: !st.mh, mhForm: !!st.mh && st.mh !== 'danke', mhDanke: st.mh === 'danke',
      mhTitel: mhDef ? mhDef.titel : '', mhHatFrage: !!(mhDef && mhDef.frage), mhFrage: mhDef && mhDef.frage ? mhDef.frage : '',
      mhFelder, mhFehlt: !!st.mhFehlt, mhFehltText: st.mhFehlt || '',
      mhZurueck: () => this.setState({ mh: null, mhF: {}, mhFehlt: null }),
      mhSenden: () => {
        const fehlt = mhDef ? mhDef.felder.map((f, i) => f[3] && !String(mhF[i] ?? '').trim() || (f[0] === 'sel' && f[3] && String(mhF[i] ?? f[2][0]).startsWith('–')) ? f[1] : null).filter(Boolean) : [];
        if (fehlt.length) return this.setState({ mhFehlt: 'Bitte ausfüllen: ' + fehlt.join(', ') });
        const titel = mhKey === 'HILFE' ? 'Antwort: ' + mhDef.frage.split(' – ')[0] : mhDef.titel.replace(' melden', '') + ': ' + (mhF[1] || mhF[0] || '');
        const daten = {}; mhDef.felder.forEach((f, i) => { daten[f[1]] = mhF[i] ?? (f[0] === 'seg' || f[0] === 'sel' ? f[2][0] : ''); });
        const text = mhDef.felder.map((f, i) => f[1] + ': ' + (daten[f[1]] || '–')).join('\n');
        const hilfeId = mhKey === 'HILFE' ? (hilfeAlle[Number(st.mh.slice(1))] || {}).id : undefined;
        this.setState({ mhFehlt: 'wird gesendet …' });
        this.app.ablauf.ticket(ART[mhKey], titel, text, daten, hilfeId).then(f => this.setState(f ? { mhFehlt: f } : { mh: 'danke', mhF: {}, mhFehlt: null }));
      },
      fSwap: st.fpSwap ? 'l-fswap' : '',
      navRef: this.navRef, refLog: this.fpRefs.log, refArb: this.fpRefs.arbeit, refHilfe: this.fpRefs.hilfe,
      chkBtn: 'l-chkbtn' + (fp === 'check' ? ' on' : ''), chkExp: fp === 'check' ? 'true' : 'false', chkCls: 'l-drop' + (fp === 'check' ? ' on' : ''), toggleCheck: fpT('check'),
      chkList: bereit.map((b, i) => ({ name: b.name, detail: b.detail, ziel: b.ziel, i, dot: b.dot, go: () => this.einstellungOeffnen(b.g, b.p) })),
      chkSumme: bereit.some(b => b.stufe === 'fehler') ? 'Bereitschafts-Check · ' + bereit.filter(b => b.stufe === 'fehler').length + ' Problem' + (bereit.filter(b => b.stufe === 'fehler').length > 1 ? 'e' : '')
        : bereit.some(b => b.stufe === 'warn') ? 'Bereitschafts-Check · ' + bereit.filter(b => b.stufe === 'warn').length + ' Hinweis' + (bereit.filter(b => b.stufe === 'warn').length > 1 ? 'e' : '') : 'Bereitschafts-Check · alles bereit',
      chkDot: bereit.some(b => b.stufe === 'fehler') ? '#E5484D' : bereit.some(b => b.stufe === 'warn') ? '#FFC72C' : '#4CC38A',
      arbBtn: 'l-newsbtn' + (fp === 'arbeit' ? ' on' : ''), arbExp: fp === 'arbeit' ? 'true' : 'false', arbCls: 'l-log' + (fp === 'arbeit' ? ' on' : ''), toggleArb: fpT('arbeit'),
      hilfeBtn: 'l-newsbtn' + (fp === 'hilfe' ? ' on' : ''), hilfeExp: fp === 'hilfe' ? 'true' : 'false', hilfeCls: 'l-log' + (fp === 'hilfe' ? ' on' : ''), toggleHilfe: fpT('hilfe'),
      logoUrl: this.app.logoUrl,
      rootCls: 'l-root' + (intro === 'splash' ? ' st-intro' : '') + ((this.props.motion ?? true) ? '' : ' l-still') + ((this.props.bild ?? true) ? ' fluid' : ''),
      bg,
      isBild: !!(this.props.bild ?? true), notBild: !(this.props.bild ?? true),
      rootW: (this.props.bild ?? true) ? '100%' : '1440px', rootH: (this.props.bild ?? true) ? '100vh' : '900px', rootMinH: (this.props.bild ?? true) ? '760px' : '0',
      dimCls: 'l-dim' + (s !== 'main' || (st.fp && st.fp !== 'log') ? ' on' : ''),
      listCls: 'l-list' + (s !== 'main' ? ' has-open' : '') + (st.swapping ? ' swap' : ''),
      liveCls: 'l-live' + (intro === 'splash' || s !== 'main' || st.fp === 'arbeit' || st.fp === 'hilfe' ? ' gone' : (st.fp === 'check' ? ' down' : '')),
      logoCls: 'l-logo' + (intro === 'splash' ? ' big' : '') + (st.quit || st.beendet ? ' weg' : ''),
      showSplash: splashShown,
      splashCls: 'l-splash' + (intro === 'leaving' ? ' out' : '') + (st.quit ? ' frage' : '') + (st.zurueck ? ' spaet' : ''),
      quit: !!st.quit, beendet: !!st.beendet,
      quitRef: this.quitRef = this.quitRef || { current: null },
      quitNein: () => this.quitZu(),
      quitJa: () => { this.app.ablauf.programmBeenden().then(ok => { if (!ok) this.setState({ quit: false, beendet: true }); }); },
      neustart: () => { this.geht = false; this.setState({ beendet: false, quit: false, intro: 'splash', screen: 'main', fp: null, zurueck: false }); },
      // nach „Beenden“ erscheint der Schatten erst, wenn das Logo wieder in der Mitte angekommen ist
      haloCls: 'l-halo' + (st.zurueck ? ' spaet' : ''),
      splashRef: this.splashRef,
      weiter: e => this.weiter(e),
      zumStart: () => this.zumStart(),
      i0: item('start'), i1: item('join'), i2: item('pilot'), i3: item('settings'),

      tabNeu: 'l-tab' + (tab === 'neu' ? ' on' : ''), tabFort: 'l-tab' + (tab === 'fort' ? ' on' : ''),
      goNeu: () => set('tab', 'neu'), goFort: () => set('tab', 'fort'),
      isNeu: tab === 'neu', isFort: tab === 'fort',
      fgs, fgSel, fgsMini,
      startSub: 'Solo oder Multiplayer' + (A.fortsetzenText() ? ' · Fortsetzen: ' + A.fortsetzenText() : ''),
      fortLabel: 'Fortsetzen' + (A.fortsetzenText() ? ' · ' + A.fortsetzenText() : ''),
      // Startzeit: leer = jetzt, sonst Wunschzeit (Kalender schreibt direkt in die Einstellung)
      zeit: ['Jetzt', 'Wunschzeit'].map(o => ({ label: o, cls: 'l-seg' + ((startzeit ? 'Wunschzeit' : 'Jetzt') === o ? ' on' : ''), pick: () => { if (o === 'Jetzt') this.wert('startzeit', ''); else if (!startzeit) this.wert('startzeit', dtStandard); } })),
      isWunsch: !!startzeit, dtWert: startzeit || dtStandard, dtText: dtText(startzeit || dtStandard),
      wetter: ['Echt', 'Simuliert', 'Wechselhaft', 'Fest'].map(o => ({ label: o, cls: 'l-seg' + (wetterWahl === o ? ' on' : ''), pick: () => this.wert('wetterArt', o) })),
      isFest: wetterWahl === 'Fest', wetterInfo,
      wlageOpts: (this.app.einst && this.app.einst.optionen('wlage')) || ['klar'], wlageVal: V('wlage', 'klar'), wlageSet: setV('wlage'),
      wtempVal: V('wtemp', 18), wtempSet: setV('wtemp'),
      aufkommen: ['Realistisch', 'Standard', 'Stressig'].map(o => ({ label: o, title: aufTitel[o], cls: 'l-seg' + (V('aufk', 'Standard') === o ? ' on' : ''), pick: () => this.wert('aufk', o) })),
      arten: arten.map(([k, l, t, d]) => { const on = !!V('a_' + k, d); return { label: l, title: t, on: on ? 'true' : 'false', cls: 'l-mini' + (on ? ' on' : ''), flip: () => this.wert('a_' + k, !on) }; }),
      modus: ['Solo', 'Multiplayer'].map(o => ({ label: o, cls: 'l-seg' + (modus === o ? ' on' : ''), pick: () => { if (o === modus) return; if (o === 'Solo' && A.rolle() === 'host') { if (lobby.spieler.some(x => !x.ich)) return this.setState({ lzu: 'solo', startFehler: null }); A.lobbySchliessen(); } this.setState({ modus: o, startFehler: null, lzu: false }); } })),
      isSolo: modus === 'Solo', isMulti: modus === 'Multiplayer',
      // Lobby-Rechte je Spieler (wie im Spiel): der Host hat alle, Mitspieler starten mit den Standardrechten
      lobbyRechte: lobby.spieler.map(p => {
        const R = [['disponieren', 'Disponieren'], ['kt', 'KT disponieren'], ['steuern', 'Simulation steuern'], ['einstellungen', 'Einstellungen & Daten']];
        const name = p.name + (p.ich ? ' · du' : '') + (p.pilot ? ' ✈ ' + p.pilot : '');
        const boxen = R.map(([k, lab]) => {
          const on = p.host || !!p.rechte[k];
          return { on: String(on), aria: p.name + ': ' + lab, cls: 'l-cb' + (on ? ' on' : '') + (p.host ? ' fix' : ''), flip: () => { if (!p.host) A.setRechte(p.pid, k, !p.rechte[k]); } };
        });
        return { ini: (p.name.trim()[0] || '?').toUpperCase() + ((p.name.trim().split(/\s+/)[1] || '')[0] || '').toUpperCase(), name, farbe: p.host ? '#3B8BFF' : p.pilot ? '#6B7385' : '#FFC72C', b0: boxen[0], b1: boxen[1], b2: boxen[2], b3: boxen[3] };
      }),
      lobbyCode: lobby.code ? lobby.code.slice(0, 3) + ' ' + lobby.code.slice(3) : '…',
      lobbyZustand: lobby.zustand, lobbyPill: 'l-pill ' + (lobby.zustandOk ? 'ok' : 'warn'),
      lobbyKopieren: () => { try { navigator.clipboard.writeText(lobby.code); this.setState({ startFehler: null }); } catch (e) { /* egal */ } },
      lobbyAnzahl: lobby.spieler.length, lobbyPlatz: lobby.spieler.length < 6,
      checks,
      startLabel: modus === 'Solo' ? 'Neue Simulation starten' : 'Simulation für alle starten',
      startCls: 'l-btn' + (st.startLaeuft ? ' off' : ''),
      startFehlerDa: !!st.startFehler, startFehler: st.startFehler || '',
      startGo: () => {
        if (st.startLaeuft) return;
        if (kiOffen && !st.kiErst && modus === 'Solo') A.kiWaehlen('lokal');
        this.setState({ startLaeuft: true, startFehler: null });
        A.neuesSpiel(startzeit).then(f => this.setState({ startLaeuft: false, startFehler: f }));
      },
      // Multiplayer: zuerst Lobby erstellen (Name, beim ersten Mal die Anrufer-KI), dann gibt es Code und Rechte
      startZeigen: modus === 'Solo' || lobbyDa,
      multiNeu: !lobbyDa, multiDa: lobbyDa,
      hname: st.hname ?? A.meinName(),
      onHname: e => set('hname', (e.target.value || '').slice(0, 30)),
      hKey: e => { if (e.key === 'Enter') { e.preventDefault(); lobbyNeu(); } },
      kiOffen,
      kiOpts: ['Lokal (Ollama)', 'Gemini (Cloud)'].map(o => ({ label: o.replace(/ \(.*\)/, ''), cls: 'l-seg' + (st.kiErst === o ? ' on' : ''), pick: () => { this.setState({ kiErst: o }); A.kiWaehlen(o.startsWith('Gemini') ? 'gemini' : 'lokal'); } })),
      lobbyBtnCls: 'l-btn' + (hname.trim() && (!kiOffen || st.kiErst) && !st.lobbyLaeuft ? '' : ' off'),
      lobbyNeu,
      lzuFrage: !!st.lzu,
      lzuAsk: () => { if (lobby.spieler.some(x => !x.ich)) return set('lzu', true); A.lobbySchliessen(); this.setState({ lzu: false }); }, lzuNein: () => set('lzu', false), lzuJa: () => { const solo = st.lzu === 'solo'; A.lobbySchliessen(); this.setState(solo ? { lzu: false, modus: 'Solo' } : { lzu: false }); },
      lzuText: st.lzu === 'solo' ? 'Zurück zu Solo? Die Lobby wird geschlossen und alle Mitspieler werden getrennt.' : 'Lobby schließen? Alle Mitspieler werden getrennt.', lzuJaText: st.lzu === 'solo' ? 'Zu Solo' : 'Schließen',
      // Fortsetzen: Umbenennen und Löschen direkt hier (kein Dialog); die automatische Sicherung kann man nicht umbenennen
      savesLeer: !saves.length,
      saves: saves.map((x, i) => ({ name: x.name, info: x.info, open: x.offen, when: x.wann, cls: 'l-save' + (saveSel === i ? ' on' : ''), pick: () => this.setState({ save: i, saveRen: false, saveDel: false, fortFehler: null }) })),
      saveName: (saves[saveSel] || {}).name || '',
      saveRen: !!st.saveRen, saveDel: !!st.saveDel,
      saveRenWert: st.saveRenWert ?? ((saves[saveSel] || {}).name || ''),
      saveRenSet: e => set('saveRenWert', e.target.value),
      saveRenAuf: () => { if (!saves[saveSel] || saves[saveSel].auto) return this.setState({ fortFehler: 'Die automatische Sicherung kann man nicht umbenennen' }); this.setState({ saveRen: true, saveDel: false, saveRenWert: undefined }); setTimeout(() => { const i = document.getElementById('l-sren'); if (i) { i.focus(); i.select(); } }, 0); },
      saveRenOk: () => umbenennen(),
      saveRenKey: e => { if (e.key === 'Enter') { e.preventDefault(); umbenennen(); } },
      saveRenNein: () => this.setState({ saveRen: false }),
      saveDelAuf: () => { if (!saves[saveSel] || saves[saveSel].auto) return this.setState({ fortFehler: 'Die automatische Sicherung kann man nicht löschen' }); this.setState({ saveDel: true, saveRen: false }); },
      saveDelNein: () => this.setState({ saveDel: false }),
      saveDelJa: () => { const s = saves[saveSel]; this.setState({ saveDel: false }); if (s) A.loeschen(s.datei).then(f => this.setState({ fortFehler: f, save: 0 })); },
      saveExport: () => { const s = saves[saveSel]; if (!s || s.auto) return this.setState({ fortFehler: 'Bitte einen gespeicherten Spielstand wählen' }); A.exportieren(s.datei).then(f => this.setState({ fortFehler: f })); },
      saveImport: () => A.importieren().then(f => this.setState({ fortFehler: f })),
      saveOrdner: () => A.ordnerOeffnen(),
      fortFehlerDa: !!st.fortFehler, fortFehler: st.fortFehler || '',
      fortCls: 'l-btn' + (saves.length && !st.fortLaeuft ? '' : ' off'),
      fortGo: () => { const s = saves[saveSel]; if (!s || st.fortLaeuft) return; this.setState({ fortLaeuft: true, fortFehler: null }); A.laden(s.datei).then(f => this.setState({ fortLaeuft: false, fortFehler: f })); },

      code,
      codeA: [0, 1, 2].map(box), codeB: [3, 4, 5].map(box),
      onCode: e => { const v = (e.target.value || '').replace(/\D/g, '').slice(0, 6); this.setState({ code: v, jerr: null }); if (v.length === 6 && code.length < 6) setTimeout(() => { const n = document.getElementById('l-name'); if (n) n.focus(); }, 0); },
      codeFocus: () => set('codeFocus', true), codeBlur: () => set('codeFocus', false),
      codeFull: code.length === 6, codeEmpty: code.length < 6,
      joinEin: !st.joinWeiter, joinInfo: !!st.joinWeiter,
      jname: st.jname ?? A.meinName(),
      onJname: e => set('jname', (e.target.value || '').slice(0, 30)),
      jnameShow: (st.jname ?? A.meinName()).trim() || 'Gast',
      jinit: (((st.jname ?? A.meinName()).trim())[0] || 'G').toUpperCase(),
      weiterCls: 'l-btn' + (code.length === 6 && !st.jLaeuftPruef ? '' : ' off'),
      joinWeiter: () => this.codePruefen('j'),
      joinKey: e => { if (e.key === 'Enter') { e.preventDefault(); if (st.joinWeiter) this.joinRein(); else this.codePruefen('j'); } },
      joinZurueck: () => { A.beitrittVerlassen(); this.setState({ joinWeiter: false, jdrin: false }); },
      jErr: !!st.jerr, jLab: st.jerr || 'Code der Leitstelle · 6 Ziffern', jLabCls: 'l-lab' + (st.jerr ? ' l-laberr' : ''), jRole: st.jerr ? 'alert' : 'none', jWrapCls: 'l-codewrap big' + (st.jerr ? ' err' : ''),
      jWartet: !sz.laeuft, jLaeuft: sz.laeuft,
      jBtnCls: 'l-btn' + (st.jdrin ? ' off' : ''),
      jBtnText: st.jdrin ? 'Warte auf den Host …' : sz.laeuft ? 'Als Disponent beitreten' : 'Lobby beitreten',
      jBtnGo: () => this.joinRein(),
      jAendern: st.jdrin ? 'Lobby verlassen' : 'Ändern', pAendern: st.pWeiter && !st.ptest ? 'Lobby verlassen' : 'Ändern',
      jDrin: !!st.jdrin, jRaus: () => { A.beitrittVerlassen(); this.setState({ jdrin: false, joinWeiter: false }); },
      codeShow: (lobbyCodeJ || code).slice(0, 3) + ' ' + (lobbyCodeJ || code).slice(3),
      sz, szSet: sz.einstellungen.map(([k, v]) => ({ k, v })),
      szSpieler: szSpieler, szAnzahl: szSpieler.length, szFrei: Math.max(0, 6 - szSpieler.length), szFreiDa: szSpieler.length < 6,
      szVerb: sz.verbunden ? (sz.hostDa ? 'Verbindung steht' : 'Host nicht da') : 'verbinde …', szVerbDot: sz.verbunden && sz.hostDa ? '#4CC38A' : '#FFC72C',
      szMik: V('eingabe', true) ? 'Spracheingabe an' : 'Spracheingabe aus', szMikDot: V('eingabe', true) ? '#4CC38A' : '#9AA3B5',
      mikTest: () => this.einstellungOeffnen('platz', 'mikro'),
      versionKurz: A.version() || '–',
      szRechte: [['disponieren', 'Disponieren', 'Disponieren'], ['kt', 'KT', 'KT disponieren'], ['steuern', 'Steuern', 'Simulation steuern'], ['einstellungen', 'Einstellungen', 'Einstellungen & Daten']].map(([k, label, title]) => ({ label, title: title + (sz.rechte[k] ? '' : ' – vergibt der Host'), cls: sz.rechte[k] ? '' : 'aus' })),

      // Pilot: Schritt 1 Code + Name, Schritt 2 Hubschrauber und Lobby
      pEin: !st.pWeiter, pInfo: !!st.pWeiter,
      pcode, pcodeA: [0, 1, 2].map(pbox), pcodeB: [3, 4, 5].map(pbox),
      onPcode: e => { const v = (e.target.value || '').replace(/\D/g, '').slice(0, 6); this.setState({ pcode: v, perr: null }); if (v.length === 6 && pcode.length < 6) setTimeout(() => { const n = document.getElementById('l-pname'); if (n) n.focus(); }, 0); },
      pcodeFocus: () => set('pfoc', true), pcodeBlur: () => set('pfoc', false),
      pname: st.pname ?? A.meinName(), onPname: e => set('pname', (e.target.value || '').slice(0, 30)),
      pnameShow: (st.pname ?? A.meinName()).trim() || 'Gast',
      pWeiterCls: 'l-btn' + (pcode.length === 6 ? '' : ' off'),
      pWeiter: () => this.codePruefen('p'),
      pKey: e => { if (e.key === 'Enter') { e.preventDefault(); this.codePruefen('p'); } },
      pTest: () => { A.pilotTest(st.pname ?? A.meinName()).then(f => this.setState(f ? { perr: f } : { pWeiter: true, ptest: true, perr: null })); },
      pZurueck: () => { if (!st.ptest) A.beitrittVerlassen(); this.setState({ pWeiter: false, pdrin: false, ptest: false }); },
      pErr: !!st.perr, pLab: st.perr || 'Code des Spiels · 6 Ziffern', pLabCls: 'l-lab' + (st.perr ? ' l-laberr' : ''), pRole: st.perr ? 'alert' : 'none', pWrapCls: 'l-codewrap big' + (st.perr ? ' err' : ''),
      pWartet: !st.ptest && A.pilotWartet(), pLaeuftF: !st.ptest && !A.pilotWartet(),
      pBtnCls: 'l-btn' + (st.pLaeuft ? ' off' : ''),
      pDrin: false, pRaus: () => undefined,
      pBtnGo: () => { if (st.pLaeuft) return; this.setState({ pLaeuft: true }); A.pilotRein(hSel || null).then(f => this.setState({ pLaeuft: false, perr: f })); },
      pilotEinst: () => this.einstellungOeffnen('platz', 'pilot'),
      pMitLst: !st.ptest, pOhneLst: !!st.ptest,
      pTitel: st.ptest ? 'Testmodus · ohne Leitstelle' : 'Leitstelle gefunden',
      pOkStyle: st.ptest ? 'background: #FFC72C; box-shadow: 0 0 0 4px rgba(255,199,44,.18);' : '',
      pcodeShow: pcode.slice(0, 3) + ' ' + pcode.slice(3),
      pilotStart: st.ptest ? 'Testmodus starten' : A.pilotWartet() ? 'Lobby beitreten' : 'Als Pilot beitreten',
      helis: helis.length ? helis.map(h => ({ name: h.name, base: h.base, flug: h.nacht ? 'Tag und Nacht' : 'nur Tagflug',
        st: h.grund ? h.grund : hSel === h.id ? 'gewählt' : h.hind ? h.hind : h.letzter ? 'zuletzt geflogen' : 'frei',
        c: h.grund ? '#9AA3B5' : hSel === h.id ? '#3B8BFF' : h.hind ? '#FFC72C' : '#4CC38A',
        cls: 'l-pick' + (h.grund ? ' busy' : hSel === h.id ? ' on' : ''), pick: () => { if (!h.grund) set('heli', h.id); } }))
        : [{ name: 'Noch keine Daten vom Host', base: 'einen Moment …', flug: '', st: '', c: '#9AA3B5', cls: 'l-pick busy', pick: () => undefined }],
      simWetter: ['Wie LeitWerk', 'Selbst'].map(o => ({ label: o, cls: 'l-seg' + (V('simwx', 'Wie LeitWerk') === o ? ' on' : ''), pick: () => this.wert('simwx', o) })),
      pinit: (((st.pname ?? A.meinName()).trim())[0] || 'G').toUpperCase(),

      ...SW
    };
  }
}
seitenEinmischen(Komponente);
