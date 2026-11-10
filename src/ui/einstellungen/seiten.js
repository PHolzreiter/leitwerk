// Einstellungsseiten – eine Definition für Hauptmenü (hauptmenue/komponente.js) und Spielmenü (spielmenue/).
// Aus dem Design „LeitWerk Hauptmenü“ (settingsData) und „LeitWerk Spielmenü“ (Einstellungsseiten: neue Seiten und Bausteine).
// SeitenBasis wird in die Komponenten gemischt (seitenEinmischen). Die Komponente hat this.app (Anbindung) und kann
// seitenOpt() liefern: { imSpiel, gesperrt, gross, angefragt, anfragen(), tab(t) }.
// Eigene Bausteine (KH-Aufnahme, Dienstplan, Karte, Einrichtungen, CSV-Import, Zuordnung, Textfeld) zeichnet bausteine.js.
/* eslint-disable */
import { zusatzZeile } from './bausteine.js';

export class SeitenBasis {
  reglerAnim(e) {
    // Regler-Animation. Läuft per Skript, weil die Regler beim Umschalten neu gezeichnet werden (CSS-Übergänge greifen dort nicht).
    const t = e.target && e.target.closest ? e.target.closest('.l-seg, .l-tog') : null;
    if (!t || !t.animate || t.classList.contains('on') && t.classList.contains('l-seg')) return;
    const istTog = t.classList.contains('l-tog');
    const box = istTog ? t : t.closest('.l-segs');
    if (!box) return;
    const r = box.getBoundingClientRect();
    const warAn = istTog && t.classList.contains('on');
    const vorher = istTog ? null : box.querySelector('.l-seg.on');
    const vr = vorher ? vorher.getBoundingClientRect() : null;
    const feder = 'cubic-bezier(.34,1.45,.5,1)';
    const finden = () => { const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el && el.closest(istTog ? '.l-tog' : '.l-segs'); };
    // Sofort nach dem Neuzeichnen starten (noch vor dem nächsten Bild) – sonst sieht man kurz den Endzustand und dann einen Sprung zurück
    let fertig = false, nt = 0;
    const istUm = b => istTog ? b.classList.contains('on') !== warAn : (() => { const o = b.querySelector('.l-seg.on'); return !!o && (!vr || Math.abs(o.getBoundingClientRect().left - vr.left) > 1); })();
    const mo = new MutationObserver(() => { const b = finden(); if (b && istUm(b)) lauf(); });
    const lauf = () => {
      if (fertig) return;
      fertig = true; mo.disconnect(); clearTimeout(nt);
      const b = finden();
      if (!b) return;
      const br = b.getBoundingClientRect();
      if (istTog) {
        const an = b.classList.contains('on');
        if (an === warAn) return;
        // eigener Knopf statt ::after, damit es in jedem Browser gleitet
        const k = document.createElement('i');
        k.className = 'l-togknob' + (an ? ' an' : '');
        b.appendChild(k);
        b.classList.add('l-togani');
        const von = an ? 3 : 23, nach = an ? 23 : 3;
        const ka = k.animate([
          { transform: 'translateX(' + von + 'px) scale(1)' },
          { transform: 'translateX(' + (von + (nach - von) * .55) + 'px) scaleX(1.45) scaleY(.85)', offset: .35 },
          { transform: 'translateX(' + nach + 'px) scale(1)' }
        ], { duration: 460, easing: feder });
        if (an) {
          const f = document.createElement('i');
          f.className = 'l-togfill';
          b.insertBefore(f, k);
          f.animate([{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 1, offset: .7 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => f.remove();
        }
        b.animate([{ boxShadow: '0 0 0 0 rgba(59,139,255,' + (an ? .55 : .25) + ')' }, { boxShadow: '0 0 0 9px rgba(59,139,255,0)' }], { duration: 560, easing: 'ease-out' });
        ka.onfinish = ka.oncancel = () => { k.remove(); b.classList.remove('l-togani'); };
        return;
      }
      const neu = b.querySelector('.l-seg.on');
      if (!neu) return;
      const nr = neu.getBoundingClientRect();
      if (!vr) return;
      // Markierung als Fenster: darunter bleibt die helle Schrift, im Fenster liegt dieselbe Schrift dunkel und steht still.
      // So ist jede Schrift in jedem Moment entweder hell auf dunkel oder dunkel auf blau – nie weiß auf blau.
      const ox = br.left + b.clientLeft, oy = br.top + b.clientTop;
      const L0 = vr.left - ox, L1 = nr.left - ox, W0 = vr.width, W1 = nr.width;
      const pill = document.createElement('span');
      pill.className = 'l-segpill';
      Object.assign(pill.style, { left: L1 + 'px', top: (nr.top - oy) + 'px', width: W1 + 'px', height: nr.height + 'px' });
      const cl = document.createElement('span');
      cl.className = 'l-segclone';
      Object.assign(cl.style, { left: -L1 + 'px', top: -(nr.top - oy) + 'px', width: b.clientWidth + 'px', height: b.clientHeight + 'px' });
      b.querySelectorAll('.l-seg').forEach(x => {
        const xr = x.getBoundingClientRect();
        const c = x.cloneNode(true);
        c.className = 'l-seg l-segc';
        c.removeAttribute('onclick');
        Object.assign(c.style, { left: (xr.left - ox) + 'px', top: (xr.top - oy) + 'px', width: xr.width + 'px', height: xr.height + 'px' });
        cl.appendChild(c);
      });
      pill.appendChild(cl);
      b.appendChild(pill);
      b.classList.add('l-segsani');
      // ruhig wie macOS/iOS: glattes Gleiten, kein Dehnen, kein Nachfedern, kein Leuchten
      const opt = { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)' };
      const kf = [{ left: L0 + 'px', width: W0 + 'px' }, { left: L1 + 'px', width: W1 + 'px' }];
      const a = pill.animate(kf, opt);
      cl.animate(kf.map(k => ({ left: -parseFloat(k.left) + 'px' })), opt);
      a.onfinish = a.oncancel = () => {
        // Endzustand ohne Farbübergang übernehmen – sonst blitzt die Schrift kurz hell auf
        b.classList.add('l-segsfix'); b.classList.remove('l-segsani'); pill.remove();
        void b.offsetWidth; requestAnimationFrame(() => b.classList.remove('l-segsfix'));
      };
    };
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    nt = setTimeout(lauf, 150);
  }
  // ---------- Auswahlliste & Kalender im LeitWerk-Stil ----------
  popMaus(e) {
    const t = e.target;
    if (this.pop && this.pop.m.contains(t)) return;
    const sel = t.closest && t.closest('select.l-select');
    const dt = t.closest && t.closest('.l-dt');
    const wasAnker = this.pop && this.pop.anker;
    if (this.pop) this.popZu();
    if (sel && !sel.disabled) { e.preventDefault(); if (wasAnker !== sel) this.ddAuf(sel); sel.focus(); return; }
    if (dt) { e.preventDefault(); if (wasAnker !== dt) this.dtAuf(dt); return; }
  }
  popTaste(e) {
    if (this.pop) {
      if (e.key === 'Escape' || (e.key === 'q' && !(e.target.closest && e.target.closest('input')))) { e.preventDefault(); e.stopImmediatePropagation(); const a = this.pop.anker; this.popZu(); if (a.focus) a.focus(); return; }
      if (e.key === 'Tab') { this.popZu(); return; }
      if (this.pop.art === 'dd' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const b = Array.from(this.pop.m.querySelectorAll('.l-ddopt'));
        const i = b.indexOf(document.activeElement);
        const n = b[Math.max(0, Math.min(b.length - 1, (i < 0 ? b.findIndex(x => x.classList.contains('on')) : i) + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (n) n.focus();
      }
      return;
    }
    const sel = e.target && e.target.closest && e.target.closest('select.l-select');
    if (sel && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); this.ddAuf(sel); }
  }
  popRoot(anker) { return anker.closest('.l-root') || document.body; }
  popPos(m, anker) {
    const root = this.popRoot(anker);
    const rr = root.getBoundingClientRect(), sk = (rr.width / (root.offsetWidth || rr.width)) || 1;
    const r = anker.getBoundingClientRect();
    const ax = (r.left - rr.left) / sk, ay = (r.top - rr.top) / sk, ab = (r.bottom - rr.top) / sk, aw = r.width / sk;
    m.style.minWidth = aw + 'px';
    const h = m.offsetHeight, w = m.offsetWidth, rh = root.offsetHeight, rw = root.offsetWidth;
    const unten = rh - ab - 12 >= h || rh - ab > ay;
    const top = Math.max(8, Math.min(unten ? ab + 6 : ay - 6 - h, rh - h - 8));
    Object.assign(m.style, { left: Math.max(8, Math.min(ax, rw - w - 8)) + 'px', top: top + 'px', transformOrigin: unten ? 'top center' : 'bottom center' });
  }
  popZeig(m, anker, art) {
    this.popRoot(anker).appendChild(m);
    this.popPos(m, anker);
    anker.classList.add('dd-auf');
    this.pop = { m, anker, art };
    requestAnimationFrame(() => m.classList.add('auf'));
  }
  popZu() {
    if (!this.pop) return;
    const { m, anker } = this.pop;
    this.pop = null;
    anker.classList.remove('dd-auf');
    m.classList.remove('auf'); m.classList.add('zu');
    setTimeout(() => m.remove(), 160);
  }
  ddAuf(sel) {
    const m = document.createElement('div');
    m.className = 'l-dd';
    m.setAttribute('role', 'listbox');
    Array.from(sel.options).forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'l-ddopt' + (o.selected ? ' on' : '');
      b.setAttribute('role', 'option');
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span>';
      b.lastChild.textContent = o.textContent;
      b.addEventListener('click', ev => {
        ev.preventDefault();
        const setzen = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setzen.call(sel, sel.options[i].value);
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        this.popZu(); sel.focus();
      });
      m.appendChild(b);
    });
    this.popZeig(m, sel, 'dd');
    const on = m.querySelector('.on') || m.firstChild;
    if (on) { on.scrollIntoView({ block: 'nearest' }); on.focus({ preventScroll: true }); }
  }
  dtAuf(btn) {
    const d = new Date(btn.dataset.v || Date.now());
    const m = document.createElement('div');
    m.className = 'l-dd l-dtp';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', 'Datum und Uhrzeit wählen');
    this.dtS = { btn, m, jahr: d.getFullYear(), mon: d.getMonth(), tag: new Date(d.getFullYear(), d.getMonth(), d.getDate()), h: d.getHours(), mi: d.getMinutes() };
    m.addEventListener('click', e => this.dtKlick(e));
    this.dtZeichnen();
    this.popZeig(m, btn, 'dt');
  }
  dtZeichnen() {
    const s = this.dtS, z = n => String(n).padStart(2, '0');
    const MON = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const start = (new Date(s.jahr, s.mon, 1).getDay() + 6) % 7, tage = new Date(s.jahr, s.mon + 1, 0).getDate(), heute = new Date().toDateString();
    let zellen = '<span></span>'.repeat(start);
    for (let t = 1; t <= tage; t++) {
      const dd = new Date(s.jahr, s.mon, t);
      zellen += '<button type="button" class="l-dtd' + (dd.getTime() === s.tag.getTime() ? ' on' : '') + (dd.toDateString() === heute ? ' heute' : '') + '" data-t="' + t + '">' + t + '</button>';
    }
    const pfeil = r => '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (r ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7') + '" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
    s.m.innerHTML = '<div class="l-dth"><button type="button" class="l-dtn" data-nav="-1" aria-label="Voriger Monat">' + pfeil(false) + '</button><b>' + MON[s.mon] + ' ' + s.jahr + '</b><button type="button" class="l-dtn" data-nav="1" aria-label="Nächster Monat">' + pfeil(true) + '</button></div>'
      + '<div class="l-dtw">' + ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(x => '<span>' + x + '</span>').join('') + '</div>'
      + '<div class="l-dtg">' + zellen + '</div>'
      + '<div class="l-dtt"><span>Uhrzeit</span><span class="l-dtstep"><button type="button" data-h="-1" aria-label="Stunde zurück">−</button><b>' + z(s.h) + '</b><button type="button" data-h="1" aria-label="Stunde vor">+</button></span><span class="l-dtcol">:</span><span class="l-dtstep"><button type="button" data-mi="-15" aria-label="15 Minuten zurück">−</button><b>' + z(s.mi) + '</b><button type="button" data-mi="15" aria-label="15 Minuten vor">+</button></span></div>'
      + '<div class="l-dtq">' + ['06:00', '12:00', '19:00', '23:00'].map(q => '<button type="button" data-q="' + q + '" class="' + (q === z(s.h) + ':' + z(s.mi) ? 'on' : '') + '">' + q + '</button>').join('') + '</div>'
      + '<button type="button" class="l-btn l-dtok" data-ok="1">Übernehmen</button>';
  }
  dtKlick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const s = this.dtS, z = n => String(n).padStart(2, '0');
    if (b.dataset.nav) { s.mon += +b.dataset.nav; if (s.mon < 0) { s.mon = 11; s.jahr--; } if (s.mon > 11) { s.mon = 0; s.jahr++; } }
    else if (b.dataset.t) s.tag = new Date(s.jahr, s.mon, +b.dataset.t);
    else if (b.dataset.h) s.h = (s.h + +b.dataset.h + 24) % 24;
    else if (b.dataset.mi) { let x = s.mi + +b.dataset.mi; if (x < 0) { x += 60; s.h = (s.h + 23) % 24; } if (x >= 60) { x -= 60; s.h = (s.h + 1) % 24; } s.mi = x; }
    else if (b.dataset.q) { const [hh, mm] = b.dataset.q.split(':'); s.h = +hh; s.mi = +mm; }
    else if (b.dataset.ok) {
      const t = s.tag, WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      void WT;
      // Startzeit gilt sofort (Anzeige kommt beim nächsten Zeichnen)
      this.wert(s.btn.dataset.key || 'startzeit', t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate()) + 'T' + z(s.h) + ':' + z(s.mi));
      this.popZu(); s.btn.focus();
      return;
    }
    const fokus = b.dataset.nav ? '[data-nav="' + b.dataset.nav + '"]' : null;
    this.dtZeichnen();
    if (fokus) { const f = s.m.querySelector(fokus); if (f) f.focus(); }
  }
  // Suchtreffer: Seite öffnen, zur Einstellung scrollen und sie kurz aufleuchten lassen
  zuTreffer(t) {
    const st = this.state || {};
    const neu = { sg: t.p.gid, sp: t.p.id, q: '', sw: (st.sw || 0) + 1, swLate: false, cfm: null, warn: null, hl: t.rk };
    if (t.tq) { neu['tq_' + t.p.id] = t.tq; if (this.app.feldWert) this.app.feldWert('tq_' + t.p.id, t.tq); }
    this.setState(neu);
    clearTimeout(this.tHl);
    setTimeout(() => {
      const box = document.querySelector(this.seitenScroll || '.l-item.open .l-sscroll');
      const el = t.rk && box ? box.querySelector('[data-k="' + t.rk + '"]') : null;
      if (box) box.scrollTop = el ? Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 60) : 0;
    }, 60);
    this.tHl = setTimeout(() => this.setState({ hl: null }), 2200);
  }
  // Einstellungswerte: gebundene Schlüssel kommen aus der App (bindung.ts), alles andere bleibt im Menü-Zustand
  // Bearbeiten-Seite einer Tabelle: Werte einsammeln und über die Tabelle speichern bzw. löschen
  editFertig(art) {
    const e = this.editInfo;
    if (!e || !e.tab) return;
    try {
      if (art === 'loeschen') { if (e.tab.loeschen) e.tab.loeschen(e.z); return; }
      const werte = e.felder.map(f => {
        if (f.t === 'info') return f.value;
        if (f.t === 'btns') return '';
        const v = this.wertLesen(f.key, f.def);
        return f.t === 'tog' ? (v ? 'ja' : 'nein') : String(v ?? '');
      });
      if (e.tab.speichern) Promise.resolve(e.tab.speichern(e.z, werte)).catch(err => console.error('Bearbeiten', err));
    } catch (err) { console.error('Bearbeiten', err); }
  }
  wertLesen(k, d) {
    const a = this.app.einst ? this.app.einst.lesen(k) : undefined;
    if (a !== undefined) return a;
    const v = (this.state || {})['s_' + k];
    return v ?? d;
  }
  wert(k, v) {
    if (this.app.einst && this.app.einst.schreiben(k, v)) return this.setState({});
    if (this.app.feldWert) this.app.feldWert(k, v);
    this.setState({ ['s_' + k]: v });
  }
  // Seite direkt öffnen (Sprünge aus dem Spiel, z. B. „KH-Aufnahme …“, „Anordnungen verwalten …“)
  seiteOeffnen(sp, extra) {
    const st = this.state || {};
    const data = this.settingsData();
    let g = data.find(x => x.pages.some(p => p.id === sp));
    if (!g) { g = data[0]; sp = g.pages[0].id; }
    this.setState({ sg: g.id, sp, q: '', edit: null, cfm: null, warn: null, keyCap: null, sw: (st.sw || 0) + 1, swLate: false, ...(extra || {}) });
  }
  zusatzZeile(r, base, ctx) {
    return zusatzZeile.call(this, r, base, ctx);
  }
  settingsData() {
    // Zeilen-Bausteine. Jede Zeile kann zusätzlich `when` (nur zeigen, wenn …) und Knöpfe mit
    // { l: Text, sub: Unterseite, go: [Gruppe, Seite], tab: Spiel-starten-Reiter, cfm: Rückfrage, ok: Rückmeldung } haben.
    // Im Hauptmenü gibt es keine Popups: Tabellen und Editoren sind Unterseiten, Rückfragen erscheinen direkt unter der Zeile.
    const H = (label) => ({ t: 'head', label });
    const T = (label, key, def, hint, x) => ({ t: 'tog', label, key, def, hint, ...(x || {}) });
    const S = (label, key, opts, def, hint, x) => ({ t: 'seg', label, key, opts, def, hint, ...(x || {}) });
    const L = (label, key, options, def, hint, x) => ({ t: 'sel', label, key, options, def, hint, ...(x || {}) });
    const R = (label, key, min, max, step, def, fmt, hint, reset, x) => ({ t: 'range', label, key, min, max, step, def, fmt, hint, reset, ...(x || {}) });
    const N = (label, key, def, unit, hint, step, x) => ({ t: 'num', label, key, def, unit, hint, step, ...(x || {}) });
    const K = (label, key, def, hint) => ({ t: 'key', label, key, def, hint });
    const B = (label, btns, hint, x) => ({ t: 'btns', label, btns, hint, ...(x || {}) });
    const I = (label, value, hint, dot, x) => ({ t: 'info', label, value, hint, dot, ...(x || {}) });
    const C = (label, key, color, hint, tog) => ({ t: 'color', label, key, color, hint, tog });
    const TN = (label, key, def, hint) => ({ t: 'tn', label, key, def, hint });
    const ST = (label, key, nr, nm, color, on) => ({ t: 'stat', label, key, nr, nm, color, on });
    // Listeneintrag: Name, Zusatz, Zustand (Chip), optional Schalter und Knöpfe
    const IT = (label, hint, chip, dot, x) => ({ t: 'item', label, hint, chip, dot, ...(x || {}) });
    const F = (label, key, ph, hint, x) => ({ t: 'feld', label, key, ph, hint, ...(x || {}) });
    const TON = (label, key, def) => ({ t: 'ton', label, key, def });
    const TAB = (cols, rows, x) => ({ t: 'table', cols, rows, ...(x || {}) });
    const bausteine = { H, T, S, L, R, N, K, B, I, C, IT, F, TON, TAB };
    const CH = (key) => ({ t: 'chart', key });
    const pct = v => v + ' %';
    const ok = '#4CC38A', grau = '#9AA3B5', gelb = '#FFC72C', blau = '#3B8BFF';
    const kurven = v => !v('wecht', true);
    // Statusmodell wie in der App (sim/settings.ts → DEFAULT_STATUS)
    const STATUS = [
      ['frei auf der Wache', 'st1', '1', 'Frei Wache', '#2e9d4a', true],
      ['Anfahrt zum Einsatzort', 'st2', '2', 'zum Berufungsort', '#f2b600', false],
      ['am Einsatzort', 'st3', '3', 'am Berufungsort', '#e67e22', false],
      ['Transport zum Zielort', 'st4', '4', 'zum Zielort', '#1e88e5', false],
      ['am Zielort / Übergabe', 'st5', '5', 'am Zielort', '#3949ab', false],
      ['frei, unterwegs', 'st6', '6', 'Frei Funk', '#7cc576', true],
      ['Dienstfahrt (alarmierbar)', 'st7', '7', 'Dienstfahrt', '#8d6e63', true],
      ['Bereitschaft (alarmierbar)', 'st8', '8', 'Bereitschaft', '#26a69a', true],
      ['alarmiert auf der Wache', 'st9', 'A', 'Alarmiert auf Wache', '#c62828', false],
      ['alarmiert über Funk', 'st10', 'F', 'Alarmiert über Funk', '#f4511e', false],
      ['alarmiert, rückt aus', 'st11', '9', 'Alarmiert und quittiert', '#e53935', false],
      ['nicht im Dienst', 'st12', '0', 'Abgemeldet', '#6b7280', false]
    ];
    const TOENE = ['Klingeln klassisch', 'Klingeln modern', 'Telefon leise', 'Piep kurz', 'Doppelpiep', 'Gong', '– aus –'];
    const FG = [['NÖ-01', 'Mostviertel · St. Pölten', '#3B8BFF'], ['NÖ-02', 'Waldviertel', '#4CC38A'], ['NÖ-03', 'Krems · Tulln · Hollabrunn', '#FFC72C'], ['NÖ-04', 'Weinviertel', '#A970FF'], ['NÖ-05', 'Mödling · Bruck · Baden Nord', '#2FB5C4'], ['NÖ-06', 'Wr. Neustadt · Neunkirchen · Baden Süd', '#E5484D']];
    const imp = [B('Import & Export', [{ l: 'CSV importieren …', imp: true }, 'Exportieren …'], 'CSV-Dateien · Vorlage und Beispiel liegen in Dokumente/LeitWerk')];
    const daten = [
      { id: 'platz', label: 'Mein Platz', scope: 'Nur für diesen Rechner · gilt sofort', pages: [
        { id: 'darstellung', label: 'Darstellung', info: 'Hell/Dunkel, Größe, Karte', kw: 'dunkelmodus nachtmodus thema zoom schriftgröße skalierung animation 3d poi grenzen funkgruppen', rows: [
          S('Farbschema', 'thema', ['Hell', 'Dunkel', 'Wie das System'], 'Dunkel', 'Gilt im Spiel – das Hauptmenü bleibt dunkel'),
          S('Karte', 'karte', ['Passt sich an', 'Immer hell'], 'Passt sich an', 'Im dunklen Farbschema wird die Karte dunkel – oder sie bleibt hell'),
          R('Größe der Oberfläche', 'skal', 75, 150, 5, 100, pct, 'Schrift, Knöpfe und Abstände', 100),
          T('Bewegungen', 'anim', true, 'Weiche Übergänge beim Öffnen und Wechseln'),
          T('Wetter in der 3D-Ansicht', 'wx3d', true, 'Regen, Schnee, Hagel, Dunst und Blitze'),
          L('Orte (POIs) auf der Karte', 'poi', ['immer', 'ab Zoom 10 (Bezirk)', 'ab Zoom 12 (Gemeinde)', 'ab Zoom 13', 'ab Zoom 14 (Ortskern)', 'ab Zoom 15', 'ab Zoom 16 (Straße)'], 'ab Zoom 14 (Ortskern)', 'Wichtige Orte erscheinen drei Stufen früher'),
          H('Funkgruppen auf der Karte'),
          T('Grenzen anzeigen', 'fglinien', true, 'Feine Linien an den TETRA-Grenzen'),
          B('Je Funkgruppe', [{ l: 'Farben und Auswahl …', sub: 'fgfarben' }], 'Einzelne Gruppen ausblenden, eigene Farben')
        ]},
        { id: 'fgfarben', sub: true, parent: 'darstellung', label: 'Funkgruppen auf der Karte', info: 'Auswahl und Farben', kw: 'funkgruppe farbe grenze tetra', rows: [
          ...FG.map(([id, kurz, c]) => C(id + (id === 'NÖ-03' ? ' (deine)' : ''), 'fgc_' + id, c, kurz, ['fgo_' + id, true])),
          B('', [{ l: 'Standardfarben', cfm: 'Alle Funkgruppen wieder einblenden und die Standardfarben verwenden?', ok: 'Zurückgesetzt' }])
        ]},
        { id: 'farben', label: 'Farben', info: 'Vorlagen, Statusfarben, Design', kw: 'farbe akzent kontrast status hinterlegen vorlage design datei', rows: [
          L('Farbvorlage', 'fv', ['NÖ Blau-Gelb', 'Neutral Grau', 'Nachtschicht (gedämpft)', 'Hoher Kontrast'], 'NÖ Blau-Gelb', 'Die Schrift passt sich an, damit sie lesbar bleibt'),
          B('Einzelne Farben', [{ l: 'Anpassen …', sub: 'farbenEigen' }], 'Akzent, Leiste, Flächen, Warnung'),
          B('Design als Datei', [{ l: 'Speichern …', ok: 'Gespeichert in Dokumente/LeitWerk/Designs' }, 'Laden …'], 'Vorlage und eigene Farben – zum Teilen mit Freunden'),
          H('Fahrzeuge'),
          B('Eigene Statusfarben', [{ l: 'Bearbeiten …', sub: 'statusfarben' }], 'Nur für deine Anzeige'),
          C('Alarmierte Fahrzeuge hinterlegen', 'falarm', '#FFF3C4', '„Alarmiert auf Wache“ und „Alarmiert über Funk“'),
          C('Fahrzeuge auf Funk in Farbe', 'ffunk', '#E5484D', '„Frei Funk“ und „Alarmiert über Funk“')
        ]},
        { id: 'farbenEigen', sub: true, parent: 'farben', label: 'Einzelne Farben', info: 'Eigene Farben', kw: 'akzent leiste hintergrund fenster warnung', rows: [
          C('Akzent', 'fe_akz', '#3B8BFF', 'Knöpfe, Auswahl, Markierungen'),
          C('Obere Leiste', 'fe_lei', '#1A1D24'),
          C('Hintergrund', 'fe_bg', '#111216'),
          C('Fenster', 'fe_fen', '#171A21'),
          C('Warnung', 'fe_warn', '#E5484D', 'Verpasste Anrufe, Nachforderungen'),
          B('', [{ l: 'Eigene Farben zurücksetzen', cfm: 'Alle eigenen Farben verwerfen und wieder die Farbvorlage verwenden?', ok: 'Zurückgesetzt' }])
        ]},
        { id: 'statusfarben', sub: true, parent: 'farben', label: 'Eigene Statusfarben', info: 'Nur für deine Anzeige', kw: 'status farbe', note: 'Nummer und Bedeutung der Status legt die Leitstelle fest (Leitstelle → Statusmodell). Hier änderst du nur, wie sie bei dir aussehen.', rows: [
          ...STATUS.map(([label, key, nr, nm, c]) => C(nr + ' – ' + nm, 'sf_' + key, c, label)),
          B('', [{ l: 'Farben der Leitstelle verwenden', cfm: 'Eigene Statusfarben verwerfen?', ok: 'Zurückgesetzt' }])
        ]},
        { id: 'telefon', label: 'Telefon & Töne', info: 'Annehmen, Klingeln, eigene Töne', kw: 'klingelton ton sound lautstärke piep notruf annehmen hotline audio export gespräch', rows: [
          T('Ich nehme Notrufe an', 'notrufe', true, 'Aus: kein Klingeln, kein Telefon (z. B. reiner Funk-Disponent)'),
          T('Ich nehme die KT-Hotline an', 'kthot', true),
          T('Ich nehme Überstellungen an', 'ueberst', true, 'Sekundärtransporte (SEK) von Krankenhäusern'),
          T('Klingelton bei Anrufen', 'klingel', true),
          R('Lautstärke', 'tlaut', 0, 100, 5, 80, pct),
          T('Funk-Piep, wenn ein Fahrzeug ruft', 'fpiep', true),
          L('Ausgabegerät für Töne', 'tdev', ['Wie das System', 'Lautsprecher', 'Headset'], 'Wie das System', 'Z. B. Klingeln über Lautsprecher, Stimmen im Headset'),
          B('Töne je Ereignis', [{ l: 'Anpassen …', sub: 'toene' }], 'Eigener Ton und eigene Lautstärke je Ereignis'),
          B('Eigene Tondateien', [{ l: 'Verwalten …', sub: 'tondateien' }], 'Nur auf diesem Rechner'),
          T('Knopf „Gespräch exportieren“', 'gexp', false, 'Speichert Gespräch, Abfrage und Protokoll als Datei – zum Melden von Fehlern')
        ]},
        { id: 'toene', sub: true, parent: 'telefon', label: 'Töne je Ereignis', info: 'Ton und Lautstärke', kw: 'ton klingelton anklopfen chat warnung', rows: [
          TON('Notruf klingelt', 'te_notruf', 'Klingeln klassisch'),
          TON('KT-Hotline klingelt', 'te_kt', 'Telefon leise'),
          TON('Anklopfen', 'te_anklopfen', 'Doppelpiep'),
          TON('Fahrzeug ruft (Funk)', 'te_funk', 'Piep kurz'),
          TON('Dringender Funkruf', 'te_funkD', 'Doppelpiep'),
          TON('Neue Chat-Nachricht', 'te_chat', 'Gong'),
          TON('Warnung', 'te_warn', 'Doppelpiep')
        ].map(r => ({ ...r, options: TOENE }))},
        { id: 'tondateien', sub: true, parent: 'telefon', label: 'Eigene Tondateien', info: 'Hochladen, löschen', kw: 'tondatei mp3 wav hochladen', rows: [
          IT('Klingelton Wache', '4,2 s · 68 KB · für „Notruf klingelt“', '', '', { btns: ['▶', { l: 'Löschen', cfm: '„Klingelton Wache“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.', ok: 'Gelöscht' }] }),
          IT('Piep hoch', '0,4 s · 9 KB', '', '', { btns: ['▶', { l: 'Löschen', cfm: '„Piep hoch“ löschen?', ok: 'Gelöscht' }] }),
          B('Hochladen', ['Klingelton …', 'Kurzer Ton …'], 'Klingelton bis 30 s, kurzer Ton bis 3 s · MP3, WAV, OGG'),
          I('Belegt', '0,08 MB', '', grau)
        ]},
        { id: 'anrufe', label: 'Anrufe & KI', info: 'Gemini oder lokal (Ollama)', kw: 'ki gemini cloud schlüssel key ollama sprachmodell modell anrufer stimme testanruf', rows: [
          S('Anrufer-KI', 'kimodus', ['Gemini (Cloud)', 'Lokal (Ollama)'], 'Lokal (Ollama)', 'Fällt Gemini aus, springt die lokale KI ein'),
          H('Gemini (Cloud)'),
          B('Schlüssel', [{ l: 'Einrichten …', sub: 'gemini' }, { l: 'Testen', ok: 'Schlüssel gültig' }], 'Kostenlos, wird nur auf diesem Rechner gespeichert', { chip: ((this.state || {})['ok_gemini:gkey'] ? 'eingerichtet' : 'nicht eingerichtet'), dot: ((this.state || {})['ok_gemini:gkey'] ? ok : grau) }),
          T('Freisprechen (ohne Sprechtaste)', 'freispr', false, 'Am besten mit Kopfhörern'),
          T('Telefonklang und Geräusche vom Notfallort', 'klang', true),
          T('Funk: Gemini versteht den Funk (Test)', 'gfunk', false, 'Kennt alle Fahrzeuge, schreibt Rufnamen richtig'),
          T('Funk: Mit Gemini sprechen auch die Fahrzeuge', 'gfzg', false, 'Jedes Fahrzeug mit eigener Stimme, neu verteilt bei jedem Schichtwechsel'),
          H('Lokale KI (Ollama)'),
          B('Ollama', [{ l: 'Beenden', ok: 'Beendet' }], 'Läuft auf diesem Rechner – ohne Internet, ohne Konto', { chip: 'installiert · läuft', dot: ok }),
          B('Sprachmodell', [{ l: 'Modelle …', sub: 'modelle' }], 'Mittel: gemma3:12b · empfohlen für 32 GB', { chip: 'gemma3:12b', dot: ok }),
          T('Lokale KI verwenden', 'lokal', true, 'Sonst einfache, vorbereitete Antworten'),
          T('Ollama beim Beenden von LeitWerk schließen', 'olbeend', true),
          T('Schnelles Gespräch (Test)', 'schnell', false, 'Anrufer spricht ab dem ersten geprüften Satz'),
          B('Ausprobieren', [{ l: 'Testanruf', ok: 'Testanruf läuft – Mikrofon an' }, { l: 'Geschwindigkeit', ok: 'Flüssig: erste Wörter nach 0,8 s' }], 'Probegespräch ohne Spiel · wie schnell der Anrufer antwortet'),
          H('Funk'),
          T('Funkmeldungen manchmal unvollständig', 'unvoll', true, 'NEF meist vollständig, RTW öfter nicht, KTW am öftesten – dann nachfragen')
        ]},
        { id: 'gemini', sub: true, parent: 'anrufe', label: 'Gemini einrichten', info: 'Schlüssel', kw: 'gemini schlüssel key api', note: 'Der Schlüssel ist kostenlos und bleibt nur auf diesem Rechner. LeitWerk schickt ihn nur an Google, nie an Mitspieler.', rows: [
          B('1. Schlüssel holen', [{ l: 'Seite von Google öffnen', ok: 'Im Browser geöffnet' }], 'Mit deinem Google-Konto anmelden, „Schlüssel erstellen“'),
          F('2. Schlüssel einfügen', 'gkey', 'Schlüssel einfügen …', '', { pw: true, btns: [{ l: 'Prüfen', ok: 'Schlüssel gültig' }] }),
          B('3. Ausprobieren', [{ l: 'Testanruf mit Gemini', ok: 'Testanruf läuft' }])
        ]},
        { id: 'modelle', sub: true, parent: 'anrufe', label: 'Sprachmodelle', info: 'Laden, wechseln, löschen', kw: 'modell ollama gemma qwen arbeitsspeicher ram', rows: [
          I('Dieser Rechner', '32 GB Arbeitsspeicher · empfohlen: Mittel', 'Größere Modelle sprechen natürlicher, brauchen aber mehr Speicher und antworten langsamer', blau),
          IT('Klein · gemma3:4b', '3,3 GB · für 8–16 GB Arbeitsspeicher', 'geladen', grau, { btns: [{ l: 'Verwenden', ok: 'Wird verwendet' }, { l: 'Löschen', cfm: 'gemma3:4b löschen? Du kannst es jederzeit wieder laden.', ok: 'Gelöscht' }] }),
          IT('Mittel · gemma3:12b', '8,1 GB · für 32 GB Arbeitsspeicher', 'aktiv', ok, { btns: [{ l: 'Löschen', cfm: 'gemma3:12b löschen? Es ist gerade aktiv – danach antwortet die KI einfacher.', ok: 'Gelöscht' }] }),
          IT('Mittel · qwen3:8b', '5,2 GB · flott, etwas weniger natürlich', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          IT('Groß · gemma3:27b', '17 GB · ab 48 GB Arbeitsspeicher', 'zu groß', gelb, { btns: [{ l: 'Trotzdem laden', cfm: 'gemma3:27b braucht etwa 48 GB, dieser Rechner hat 32 GB. Es kann sein, dass Ollama sehr langsam wird. Trotzdem laden?', ok: 'Wird geladen … 0 %' }] }),
          F('Anderes Modell', 'omod', 'z. B. llama3.1:8b', 'Name aus der Ollama-Bibliothek', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] })
        ]},
        { id: 'sprache', label: 'Sprache & Stimmen', info: 'Vorlesen, Piper, Tempo', kw: 'stimme vorlesen piper tempo lautstärke', rows: [
          T('Anrufer vorlesen', 'vorl', true, 'Nur bei dem, der das Gespräch führt'),
          T('Funk vorlesen', 'fvorl', true),
          R('Lautstärke der Stimmen', 'slaut', 0, 100, 5, 85, pct),
          R('Sprechtempo', 'tempo', 70, 140, 5, 100, pct),
          B('Stimmen (Piper)', [{ l: 'Verwalten …', sub: 'piper' }], 'Je mehr geladen, desto abwechslungsreicher – läuft nur lokal', { chip: '3 geladen', dot: ok }),
          L('Ausgabegerät für Stimmen am Telefon', 'sdev', ['Wie das System', 'Headset', 'Lautsprecher'], 'Wie das System', 'Anrufer und KI-Gespräche'),
          L('Ausgabegerät für Stimmen im Funk', 'fdev', ['Wie am Telefon', 'Headset', 'Lautsprecher'], 'Wie am Telefon', 'Fahrzeuge und Leitstelle im Funk')
        ]},
        { id: 'piper', sub: true, parent: 'sprache', label: 'Stimmen (Piper)', info: 'Laden, anhören, löschen', kw: 'piper stimme laden', rows: [
          IT('Thorsten', 'Mann · 63 MB', 'geladen', ok, { btns: ['▶', { l: 'Löschen', cfm: 'Stimme „Thorsten“ löschen?', ok: 'Gelöscht' }] }),
          IT('Kerstin', 'Frau · 63 MB', 'geladen', ok, { btns: ['▶', { l: 'Löschen', cfm: 'Stimme „Kerstin“ löschen?', ok: 'Gelöscht' }] }),
          IT('Karlsson', 'Mann, älter · 63 MB', 'geladen', ok, { btns: ['▶', { l: 'Löschen', cfm: 'Stimme „Karlsson“ löschen?', ok: 'Gelöscht' }] }),
          IT('Eva', 'Frau · 63 MB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          IT('Ramona', 'Frau, jünger · 63 MB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          IT('Pavoque', 'Mann, tief · 63 MB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] })
        ]},
        { id: 'mikro', label: 'Mikrofon & Funk', info: 'Spracheingabe, Funktasten', kw: 'mikro mikrofon sprechen spracherkennung whisper push to talk ptt funktaste funk', rows: [
          T('Spracheingabe', 'eingabe', true, 'Mikrofon neben den Eingabefeldern gedrückt halten'),
          K('Sprechtaste (gedrückt halten)', 'kSprech', 'F9', 'Spricht ins gerade laufende Gespräch'),
          T('Erkannten Text gleich abschicken', 'autosend', true),
          L('Mikrofon fürs Telefon', 'mic', ['Wie das System', 'Headset-Mikrofon', 'MacBook-Mikrofon'], 'Wie das System', 'Spracheingabe und Gespräche mit Anrufern'),
          L('Mikrofon für den Funk', 'micFunk', ['Wie am Telefon', 'Headset-Mikrofon', 'MacBook-Mikrofon'], 'Wie am Telefon', 'Funktaste und Sprechfunk'),
          B('Erkennung (Whisper)', [{ l: 'Modelle …', sub: 'whisper' }], 'Läuft nur auf deinem Rechner, ohne Internet', { chip: 'Ausgewogen', dot: ok }),
          B('Ausprobieren', [{ l: 'Mikrofon testen', ok: 'Erkannt: „RTW Krems 1, bitte melden“' }], 'Gedrückt halten, sprechen, loslassen'),
          H('Funk'),
          K('Funktaste (gedrückt halten)', 'kFunk', 'F10'),
          K('Eigene Funktaste: normale Gruppe', 'kFunkN', '–'),
          K('Eigene Funktaste: RD-NOE-09', 'kF09', '–', 'Gruppe des Großeinsatzes'),
          K('Eigene Funktaste: RD-NOE-10', 'kF10', '–', 'Zweiter gleichzeitiger Großeinsatz'),
          R('Lautstärke der anderen Funkgruppen', 'fgLaut', 0, 100, 5, 60, pct, 'Dringende Rufe kommen immer voll'),
          L('Funk beim Telefonieren', 'fTel', ['Normal', 'Leiser', 'Stumm'], 'Leiser', 'Solange du telefonierst – dringende Rufe bleiben hörbar'),
          T('Echte Disponenten hören', 'echteD', true, 'Mehrspieler'),
          T('Echte Piloten hören', 'echteP', true, 'Mehrspieler'),
          T('Funk-Klang', 'fklang', true, 'Blechern, kurzes Rauschen beim Loslassen'),
          R('Lautstärke Sprechfunk', 'sfLaut', 0, 100, 5, 80, pct)
        ]},
        { id: 'whisper', sub: true, parent: 'mikro', label: 'Erkennung (Whisper)', info: 'Modelle', kw: 'whisper spracherkennung modell', rows: [
          IT('Schnell', '140 MB · für jeden Rechner', 'geladen', grau, { btns: [{ l: 'Verwenden', ok: 'Wird verwendet' }] }),
          IT('Ausgewogen', '460 MB · empfohlen', 'aktiv', ok),
          IT('Beste Erkennung', '1,6 GB · braucht einen flotten Rechner', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] })
        ]},
        { id: 'pilot', label: 'Pilot & Flugsimulator', info: 'MSFS, Tablet, Handy, Tasten', kw: 'pilot hubschrauber msfs flugsimulator community tablet h145 gtn750 flugplan handy joystick statustasten globale tastenkürzel wetter', rows: [
          H('Flugsimulator'),
          B('Flugsimulator', [{ l: 'Community-Ordner wählen …', ok: 'LeitWerk-Add-on eingetragen' }], 'Für Position, Status und Tablet – einmal einrichten', { chip: 'MSFS 2024 · wartet', dot: grau }),
          S('Wetter im Flugsimulator', 'simwx', ['Wie LeitWerk', 'Selbst'], 'Wie LeitWerk', 'Wie LeitWerk: im MSFS „Live-Wetter“ einschalten'),
          T('Flugplan für das GTN750', 'gtn', true, 'Route zum Einsatzort bzw. Krankenhaus zum Importieren im GTN'),
          B('H145-Tablet', [{ l: 'Neu eintragen', ok: 'Eingetragen – wirkt nach dem nächsten MSFS-Start' }], 'Alarm, Route und Patient in der Missions-App des Tablets', { chip: 'eingetragen', dot: ok }),
          H('Alarmtöne'),
          { ...TON('Alarmierung', 'pt_alarm', 'Melder RD Prio 1'), options: ['Melder RD Prio 1', 'Melder RD Prio 2', 'Melder FW Prio 1', 'Martinshorn', 'Fünftonfolge', 'Pager', 'Doppelpiep', 'TETRA-Alarm', 'Gong', 'Dringend'] },
          { ...TON('Abruf aus dem Bereitstellungsraum', 'pt_abruf', 'Pager'), options: ['Pager', 'Doppelpiep', 'Triller', 'Gong', 'Dringend'] },
          B('Eigener Alarmton', [{ l: 'Hinzufügen …', datei: { accept: '.mp3,.wav,.m4a,audio/*', f: d => this.app.zusatz ? this.app.zusatz.alarm.hinzu(d[0]) : 'nur im Programm' } }, { l: 'Ordner öffnen', act: () => this.app.zusatz ? this.app.zusatz.alarm.ordner() : undefined }], 'MP3, WAV oder M4A · höchstens 30 s und 5 MB'),
          H('Handy als Statusgerät'),
          B('Handy koppeln', [{ l: 'Kopplung starten', ok: 'Im Handy-Browser öffnen: 192.168.1.24:8765 · Code 4821' }], 'Status und Sprechtaste vom Handy · gleiches WLAN', { chip: 'nicht gekoppelt', dot: grau }),
          H('Tasten und Joystick'),
          K('Status 1 – Frei Wache', 'pk_s1', '1'),
          K('Status 2 – zum Berufungsort', 'pk_s2', '2'),
          K('Status 3 – am Berufungsort', 'pk_s3', '3'),
          K('Status 4 – zum Zielort', 'pk_s4', '4'),
          K('Status 5 – am Zielort', 'pk_s5', '5'),
          K('Status 6 – Frei Funk', 'pk_s6', '6'),
          K('Status 9 – Alarmiert und quittiert', 'pk_s9', '9'),
          K('Sprechtaste (gedrückt halten)', 'pk_funk', 'Leertaste', 'Auch eine Joystick-Taste oder eine Taste am Cockpit-Funkgerät'),
          K('Funk zum RTW', 'pk_funkRtw', 'R'),
          K('Übungsflug starten/anhalten', 'pk_fliegen', 'F'),
          T('Globale Tastenkürzel', 'pglob', true, 'Strg+Umschalt+Taste – funktionieren auch, wenn der Flugsimulator im Vordergrund ist'),
          T('Status-Tasten am Funkgerät der H145', 'pcarls', true, 'Ziffer kurz drücken: Status nach 1 s, roter Hörer bricht ab'),
          T('App „LeitWerk“ im Tablet der H145', 'ptabletapp', false, 'Eigenes Symbol auf dem Startbildschirm des Tablets – vor dem Start von MSFS einschalten')
        ]},
        { id: 'bedienung', label: 'Bedienung', info: 'Tastenkürzel, Anordnung', kw: 'tastatur shortcut hotkey taste fenster layout anordnung debug einführung', rows: [
          H('Tastenkürzel'),
          K('Anruf annehmen', 'k1', 'F1'),
          K('Auflegen', 'k2', 'Escape'),
          K('Halten / zurückwechseln', 'k3', 'F3'),
          K('Fahrzeug suchen', 'k4', 'Ctrl+F'),
          K('Neuer Einsatz (Test)', 'k5', 'F5'),
          K('Einsatzliste zeigen', 'k6', 'Ctrl+1'),
          K('Karte zeigen', 'k7', 'Ctrl+2'),
          K('Funk zeigen', 'k8', 'Ctrl+3'),
          H('Arbeitsplatz'),
          B('Anordnung der Fenster', [{ l: 'Gespeicherte …', sub: 'anordnungen' }, { l: 'Zurücksetzen', cfm: 'Alle Fenster wieder wie beim ersten Start anordnen?', ok: 'Zurückgesetzt' }], 'Wird automatisch gemerkt'),
          H('Sonstiges'),
          B('Einführung', [{ l: 'Noch einmal zeigen', ok: 'Kommt beim nächsten Spielstart' }]),
          T('Entwicklerfunktionen', 'dev', false, 'Nur zum Prüfen der Daten')
        ]},
        { id: 'anordnungen', sub: true, parent: 'bedienung', label: 'Gespeicherte Anordnungen', info: 'Fenster-Layouts', kw: 'anordnung layout fenster monitor', rows: [
          IT('Zwei Monitore', '7 Fenster · links Karte, rechts Abfrage', '', '', { btns: [{ l: 'Übernehmen', ok: 'Gilt beim nächsten Spielstart' }, 'Als Datei …', { l: 'Löschen', cfm: '„Zwei Monitore“ löschen?', ok: 'Gelöscht' }] }),
          IT('Laptop', '4 Fenster', '', '', { btns: [{ l: 'Übernehmen', ok: 'Gilt beim nächsten Spielstart' }, 'Als Datei …', { l: 'Löschen', cfm: '„Laptop“ löschen?', ok: 'Gelöscht' }] }),
          B('Aus Datei', ['Anordnung laden …'], 'Zum Beispiel von einem Freund')
        ]}
      ]},
      { id: 'sim', label: 'Spiel & Simulation', scope: 'Für dein nächstes Spiel · im Multiplayer gilt der Host', sim: true, pages: [
        { id: 'aufkommen', label: 'Einsatzaufkommen', info: 'Notfälle, KT, Nachbarzonen', kw: 'einsätze pro stunde realistisch standard stressig krankentransport überstellung acn akutpflege nachbarzone generator zeitraffer kurve', rows: [
          S('Aufkommen', 'aufk', ['Realistisch', 'Standard', 'Stressig'], 'Standard', 'Realistisch: wie 2025 · Standard: mehr und spannender gemischt'),
          H('Je Stunde'),
          CH('kurve'),
          T('Einsätze automatisch erzeugen', 'gen', true),
          L('Quelle der Einsätze', 'quelle', ['zufällig (Adressen im Gebiet)', 'aus Einsatzvorlagen'], 'zufällig (Adressen im Gebiet)'),
          T('Zeitraffer bei neuem Notruf auf 1×', 'tempo1', true),
          T('Einsätze in Nachbarzonen (Work in Progress)', 'fremd', false, 'Eigene Fahrzeuge fahren knapp außerhalb der Funkgruppe', { warn: 'Noch in Arbeit: In den anderen Zonen sind kaum Fahrzeuge hinterlegt, deren Einsätze werden vereinfacht nachgestellt. Dabei kann es zu Fehlern kommen, die sich im laufenden Spiel nicht beheben lassen.', warnJa: 'Trotzdem einschalten' }),
          R('Häufigkeit (Nachbarzonen)', 'fremdRate', 0.2, 6, 0.2, 1, v => 'ca. ' + String(v).replace('.', ',') + ' / h', '', undefined, { when: v => !!v('fremd', false) })
        ]},
        { id: 'anrufer', label: 'Notrufe & Anrufer', info: 'Verlauf, Fälle, Anrufer-KI', kw: 'fallkatalog fälle anrufer gespräch falsche adresse rückruf komplikation revers verweigerung notruf abfrageschema', rows: [
          T('Einsätze kommen als Notruf', 'alsNotruf', true, 'Mit Anrufer am Telefon · braucht ein Abfrageschema (Leitstelle → Einsatzcodes)'),
          S('Anrufer-KI im Multiplayer', 'kimp', ['Jeder selbst', 'Alle Gemini', 'Alle lokal'], 'Jeder selbst', 'Wer ohne passende KI beitritt, richtet sie beim Beitreten ein'),
          H('Anrufer und Verlauf'),
          R('Anrufer mit falscher Adresse', 'falsch', 0, 30, 1, 5, pct),
          T('Rückruf auch ohne aufgenommene Nummer', 'rueck', false),
          S('Komplikationen', 'kompl', ['Ruhig', 'Normal', 'Fordernd'], 'Normal', 'Verschlechterung, Irrtum des Anrufers, mehr Betroffene'),
          S('Transportverweigerung (Revers)', 'revers', ['Normal', 'Selten', 'Aus'], 'Normal'),
          B('Fallkatalog', [{ l: 'Fälle …', sub: 'faelle' }], 'Ansehen, selbst schreiben, prüfen, importieren', { chip: '214 Fälle', dot: ok })
        ]},
        { id: 'faelle', sub: true, parent: 'anrufer', label: 'Fallkatalog', info: 'Fälle bearbeiten', kw: 'fall fälle katalog schreiben prüfen', rows: [
          TAB(['Fall', 'Art', 'Notarzt', 'Herkunft'], [
            ['Atemnot im Pflegeheim', 'Notfall', 'nach Kompetenz', 'eingebaut'],
            ['Sturz in der Wohnung, Hüfte', 'Notfall', 'nein', 'eingebaut'],
            ['Brustschmerz beim Sport', 'Notfall', 'ja', 'eingebaut'],
            ['Dialyse Rückfahrt', 'KT', 'nein', 'eingebaut'],
            ['Verlegung Stroke Unit', 'Sekundär', 'ja', 'eigener'],
            ['Kind mit Fieberkrampf', 'Notfall', 'ja', 'eigener']
          ], { suche: 'Fälle durchsuchen …', neu: 'Neuer Fall', anzahl: '214 Fälle · 12 eigene' }),
          B('Prüfen', [{ l: 'Alle Fälle prüfen', ok: 'Alle 214 in Ordnung' }], 'Telefonat, Verlauf, Krankenhaus stimmig?'),
          B('Import & Export', ['Importieren …', 'Exportieren …'])
        ]},
        { id: 'neuerFall', sub: true, parent: 'faelle', label: 'Neuer Fall', info: 'Leer oder mit KI', kw: 'neuer fall ki entwurf', rows: [
          F('Name', 'nf_name', 'z. B. Sturz im Weinkeller', 'Kurz und eindeutig – so steht er im Fallkatalog'),
          { t: 'area', label: 'Beschreibung für die KI', key: 'nf_text', ph: 'Was passiert, wer ruft an, wie kann es ausgehen? Ein, zwei Sätze reichen.', hint: 'Nur für „Entwurf mit KI“ nötig – die KI füllt daraus alle Schritte vor', zeilen: 4 },
          B('', [{ l: 'Leer beginnen', act: () => this.app.zusatz.fall.neu(String(this.wertLesen('nf_name', '') || ''), '', false) }, { l: 'Entwurf mit KI', act: () => this.app.zusatz.fall.neu(String(this.wertLesen('nf_name', '') || ''), String(this.wertLesen('nf_text', '') || ''), true) }, { l: 'Abbrechen', back: true }])
        ]},
        { id: 'alarmierung', label: 'Alarmierung', info: 'Rendezvous, Stufen', kw: 'rettungsmittel stufe nef rtw rendezvous notarzt toleranz vorschlag nfs sondersignal', rows: [
          T('Rendezvous RTW – NEF', 'rdv', true, 'NEF mehr als 15 min entfernt: RTW fährt los und trifft das NEF unterwegs'),
          N('Toleranz für besser passende Rettungsmittel', 'tol', 5, 'min'),
          H('Stufen-Zuordnung'),
          TAB(['Stufe', 'Rettungsmittel', 'NFS', 'Notarzt', 'Signal', 'Kategorie', 'Transport'], [
            ['ALS rot', 'RTW-C>RTW>KTW', 'nein', 'schnellstes (NEF/NAH)', 'ja', 'Kritisch', '85 %'],
            ['ALS orange', 'RTW-C>RTW>KTW', 'nein', 'NEF bevorzugt', 'ja', 'Kritisch', '85 %'],
            ['ALS gelb', 'RTW-C>RTW>KTW', 'ja', 'nein', 'ja', 'Dringend', '80 %'],
            ['ALS grün', 'RTW>RTW-C>KTW', 'ja', 'nein', 'nein', 'Dringend', '75 %'],
            ['BLS rot', 'RTW>RTW-C>KTW', 'nein', 'nein', 'ja', 'Dringend', '75 %'],
            ['BLS gelb', 'RTW>KTW>RTW-C', 'nein', 'nein', 'ja', 'Dringend', '70 %'],
            ['BLS grün', 'KTW>RTW>RTW-C', 'nein', 'nein', 'nein', 'Stabil', '65 %'],
            ['BLS/ALS aufwertbar', 'RTW/RTW-C', 'nein', 'nein', 'ja', 'Dringend', '75 %'],
            ['Akuttransport grün', 'KTW>RTW>RTW-C', 'nein', 'nein', 'nein', 'Stabil', '100 %'],
            ['Telemedizin', 'KTW>RTW>RTW-C', 'nein', 'nein', 'nein', 'Stabil', '30 %'],
            ['Weitergabe', '– (Weitergabe)', 'nein', 'nein', 'nein', 'Stabil', '0 %'],
            ['Großunfall', 'RTW-C>RTW>KTW', 'nein', 'schnellstes (NEF/NAH)', 'ja', 'Kritisch', '90 %'],
            ['Alpinunfall', 'RTW>RTW-C>KTW', 'nein', 'schnellstes (NEF/NAH)', 'ja', 'Dringend', '70 %'],
            ['S5 Reanimation', 'RTW-C>RTW>KTW', 'nein', 'schnellstes (NEF/NAH)', 'ja', 'Kritisch', '70 %'],
            ['S4 Notarzt', 'RTW-C>RTW>KTW', 'nein', 'NEF bevorzugt', 'ja', 'Kritisch', '85 %'],
            ['S4 Mehrere Verletzte', 'RTW-C>RTW>KTW', 'nein', 'schnellstes (NEF/NAH)', 'ja', 'Kritisch', '90 %'],
            ['S3 Notfall', 'RTW-C>RTW>KTW', 'ja', 'nein', 'ja', 'Dringend', '80 %'],
            ['S2 Dringend', 'RTW>KTW>RTW-C', 'nein', 'nein', 'ja', 'Dringend', '75 %'],
            ['S1 Nicht dringend', 'KTW>RTW>RTW-C', 'nein', 'nein', 'nein', 'Stabil', '65 %'],
            ['S0 Beratung / Weitergabe', '– (Weitergabe)', 'nein', 'nein', 'nein', 'Stabil', '0 %'],
            ['ACN', 'ACN', 'nein', 'nein', 'nein', 'Stabil', '0 %']
          ], { edit: true, ding: 'Stufe', typen: ['text', 'text', 'tog', ['sel', ['nein', 'NEF bevorzugt', 'schnellstes (NEF/NAH)']], 'tog', ['sel', ['Stabil', 'Dringend', 'Kritisch']], 'num'], hint: '„>“ trennt die Ränge, „/“ heißt gleichwertig. Ein schlechter passendes Rettungsmittel kommt nur, wenn das bessere mehr als die Toleranz länger braucht.' })
        ]},
        { id: 'krankenhaus', label: 'Krankenhäuser & KT', info: 'Belegung, Daueraufträge', kw: 'krankenhaus belegung grundbelegung dialyse bestrahlung chemo daueraufträge', rows: [
          T('Grundbelegung durch andere Patienten', 'khg', true, 'Vormittags viel, nachts kaum'),
          R('Stärke der Grundbelegung', 'khgF', 10, 200, 10, 100, pct, '', undefined, { when: v => !!v('khg', true) }),
          N('Dialyse-Patienten je Krankenhaus mit Dialyse', 'dia', 6, 'pro Tag'),
          N('Bestrahlungs-Patienten je Krankenhaus', 'strahl', 3, 'pro Tag'),
          N('Chemotherapie-Patienten mit fixem Termin', 'chemo', 1, 'pro Tag')
        ]},
        { id: 'zeiten', label: 'Zeiten', info: 'Ausrücken, Fahrzeiten', kw: 'ausrückzeit fahrzeit sondersignal blaulicht verortung tag nacht bereitschaft', rows: [
          H('Ausrückzeiten (Alarm bis Abfahrt, in Minuten)'),
          N('Tag beginnt', 'tagV', 7, 'Uhr'),
          N('Tag endet', 'tagB', 19, 'Uhr'),
          TN('RTW / KTW', 'boden', [0.5, 2, 1, 4]),
          TN('NEF', 'nef', [0.5, 4, 1.5, 13]),
          TN('Hubschrauber', 'nah', [2, 4, 5, 10]),
          N('Frei unterwegs', 'unterwegs', 10, 'Sekunden'),
          N('Aus der Bereitschaft', 'bereit', 3, '+ min'),
          H('Fahrzeiten und Verortung'),
          N('Sondersignal: Fahrzeit × Faktor', 'sosi', 0.8, '×', '', 0.05),
          N('Verortung richtig bis', 'vort', 250, 'Meter', '', 10)
        ]},
        { id: 'wetter', label: 'Wetter & Flugrettung', info: 'Echtes Wetter, Jahreszeit', kw: 'wetter echt open-meteo regen schnee nebel jahreszeit nah hubschrauber flug nachtflug fest', rows: [
          T('Wetter simulieren', 'wsim', true, 'Bei Nebel und Gewitter fliegt kein NAH'),
          T('Echtes Wetter', 'wecht', true, 'Stündlich für die Funkgruppe (Open-Meteo), auch vergangene Tage', { when: v => !!v('wsim', true) }),
          R('Wechsel', 'wwech', 0, 100, 1, 50, v => v <= 0 ? 'fix' : v >= 88 ? 'sehr oft' : v >= 65 ? 'oft' : v >= 30 ? 'normal' : 'selten', 'Ganz links bleibt es immer gleich', undefined, { when: v => !!v('wsim', true) && kurven(v) }),
          L('Festes Wetter', 'wlage', ['klar', 'bewölkt', 'Regen', 'Schnee', 'Nebel', 'Gewitter', 'Glätte'], 'klar', '', { when: v => !!v('wsim', true) && kurven(v) && Number(v('wwech', 50)) <= 0 }),
          N('Temperatur', 'wtemp', 18, '°C', '', 1, { when: v => !!v('wsim', true) && kurven(v) && Number(v('wwech', 50)) <= 0 }),
          L('Jahreszeit', 'jz', ['nach Spieldatum', 'Frühling', 'Sommer', 'Herbst', 'Winter'], 'nach Spieldatum', 'Bestimmt, welche Notfälle häufiger sind (Hitze, Kälte, Glätte)', { when: kurven }),
          N('NAH Reisegeschwindigkeit', 'nahv', 220, 'km/h', 'Nachts fliegen nur nachtflugtaugliche Hubschrauber', 10)
        ]}
      ]},
      { id: 'daten', label: 'Leitstelle', scope: 'Daten für alle im Spiel · gilt sofort', pages: [
        { id: 'fahrzeuge', label: 'Fahrzeuge', info: 'Typ, Dienstplan, Nachtflug', kw: 'funkrufname kurzname typ kategorie dienstplan dienstzeit schicht nachtflug rtw ktw nef nah aktiv', rows: [
          TAB(['Funkrufname', 'Kurzname', 'Kategorie', 'Typ', 'Dienststelle', 'Dienstplan', 'Aktiv'], [
            ['72/101', 'RTW Krems 1', 'RTW', 'RTW', 'RD Krems', '24/7', 'ja'],
            ['72/102', 'RTW Krems 2', 'RTW', 'RTW', 'RD Krems', 'Mo–So 07–19', 'ja'],
            ['72/131', 'KTW Krems 3', 'KTW', 'KTW groß', 'RD Krems', 'Mo–Fr 06–18', 'ja'],
            ['72/190', 'NEF Krems', 'NEF', 'NEF', 'Klinikum Krems', '24/7', 'ja'],
            ['72/201', 'RTW Langenlois', 'RTW', 'RTW-C', 'RD Langenlois', '24/7', 'ja'],
            ['99/002', 'NAH Krems', 'NAH', 'NAH', 'Luftrettung Krems', '24/7', 'ja']
          ], { suche: 'Fahrzeug suchen …', neu: 'Neues Fahrzeug', ding: 'Fahrzeug', anzahl: '681 Fahrzeuge', edit: true,
               typen: ['text', 'text', ['sel', ['RTW', 'RTW-C', 'KTW', 'NEF', 'NAH', 'ACN', 'SEW']], 'text', 'text', 'plan', 'tog'],
               extra: [['Nachtflug', 'tog', 'nein'], ['Ersatz für', 'text', ''], ['Hinweis', 'text', '']] }), ...imp] },
        { id: 'dienststellen', label: 'Dienststellen', info: 'Wachen, Stützpunkte', kw: 'wache dienststelle stützpunkt adresse koordinaten bezirk', rows: [
          TAB(['Name', 'Typ', 'Ort', 'Bezirk', 'Fahrzeuge'], [
            ['RD Krems', 'Rettungsdienst', 'Krems an der Donau', 'Krems', '9'], ['RD Langenlois', 'Rettungsdienst', 'Langenlois', 'Krems-Land', '4'], ['RD Gföhl', 'Rettungsdienst', 'Gföhl', 'Krems-Land', '3'], ['Klinikum Krems', 'Notarztstützpunkt', 'Krems an der Donau', 'Krems', '1'], ['Luftrettung Krems', 'Luftrettung', 'Gneixendorf', 'Krems', '1']
          ], { suche: 'Dienststelle suchen …', neu: 'Neue Dienststelle', ding: 'Dienststelle', anzahl: '863 Dienststellen', edit: true,
               typen: ['text', ['sel', ['Rettungsdienst', 'Notarztstützpunkt', 'Luftrettung', 'Stellplatz (nur Fahrzeuge)', 'Feuerwehr', 'Polizei', 'Bergrettung', 'Wasserrettung', 'Sonstige']], 'text', 'text', 'fix'],
               extra: [['Adresse', 'text', ''], ['Lage', 'lage', '48.4101, 15.6033'], ['Hinweis', 'text', '']] }), ...imp] },
        { id: 'krankenhaeuser', label: 'Krankenhäuser', info: 'Abteilungen, Landeplatz', kw: 'krankenhaus abteilung ambulanz station schockraum stroke herzkatheter landeplatz zufahrt', rows: [
          TAB(['Name', 'Kurzname', 'Ort'], [
            ['Universitätsklinikum Krems', 'UK Krems', 'Krems an der Donau'], ['Universitätsklinikum St. Pölten', 'UK St. Pölten', 'St. Pölten'], ['Universitätsklinikum Tulln', 'UK Tulln', 'Tulln'], ['Landesklinikum Horn', 'LK Horn', 'Horn'], ['Landesklinikum Zwettl', 'LK Zwettl', 'Zwettl']
          ], { suche: 'Krankenhaus suchen …', neu: 'Neues Krankenhaus', ding: 'Krankenhaus', anzahl: '116 Krankenhäuser', edit: true, typen: ['text', 'text', 'text'],
               extra: [['Lage', 'lage', '48.4120, 15.6157'], ['Rettungszufahrt', 'text', ''], ['Hubschrauberlandeplatz', 'text', ''], ['Einrichtungen', 'einr', ''], ['Aufnahme bei Notfällen', 'khlink', ''], ['Hinweis', 'text', '']] }), ...imp] },
        { id: 'khauf', label: 'KH-Aufnahme', info: 'Akut-Zeiten, Symptome', kw: 'aufnahme notaufnahme akut symptom öffnungszeiten herzkatheter stroke schockraum lücken zuweisung', rows: [{ t: 'khauf' }] },
        { id: 'pois', label: 'Orte (POIs)', info: 'Schule, Pflegeheim, Bahnhof', kw: 'ort poi objekt kategorie', rows: [
          TAB(['Name', 'Kategorien', 'Ort'], [
            ['Pflegeheim am Steinertor', 'pflegeheim', 'Krems an der Donau'], ['Bahnhof Krems', 'bahnhof', 'Krems an der Donau'], ['Volksschule Langenlois', 'schule', 'Langenlois'], ['Freibad Tulln', 'bad', 'Tulln']
          ], { suche: 'Ort suchen …', neu: 'Neuer Ort', ding: 'Ort', anzahl: '10.756 Orte', edit: true, typen: ['text', 'text', 'text'], extra: [['Lage', 'lage', '48.4100, 15.6000'], ['Hinweis', 'text', '']] }), ...imp] },
        { id: 'codes', label: 'Einsatzcodes & Abfrage', info: 'Codes und Abfrage – RD und KT/SEK', kw: 'einsatzcode code abfrageschema schema kapitel kategorie stufe leitwerk-codesystem transportcodes kt sek', rows: [
          I('Notruf (RD)', 'LeitWerk-Codesystem (eingebaut)', '542 Codes in 38 Kapiteln, mit Abfrage', ok),
          I('Krankentransport & Überstellung (KT/SEK)', 'LeitWerk-Transportcodes (eingebaut)', '136 Codes, mit KT-Abfrage', ok),
          B('Eigene Codes & Abfrage', [{ l: 'Im Realismus-Menü', go: ['real', 'realismus'] }], 'Eigene Sätze hochladen und umschalten – jeder Spieler selbst'),
          S('Codeliste', 'codeart', ['Notruf (RD)', 'KT/SEK'], 'Notruf (RD)'),
          TAB(['Code', 'Name', 'Kategorie', 'Kapitel'], [
            ['RD-6D1', 'Atemnot – reagiert nicht', 'ALS orange', '6 - Atemnot'], ['RD-6D3', 'Schwere Atemnot (spricht kaum, blau/grau)', 'ALS gelb', '6 - Atemnot'], ['RD-9E1', 'Kreislaufstillstand nach Erhängen/Strangulation', 'ALS rot', '9 - Leblose Person / Kreislaufstillstand'], ['RD-10C1', 'Brustschmerz bei bekanntem Herzleiden', 'ALS gelb', '10 - Brustschmerz'], ['RD-17A1', 'Sturz vor über 6 Stunden', 'ALS grün', '17 - Sturz'], ['RD-26A1', 'Krankentransport gewünscht', 'Telemedizin', '26 - Kranke Person']
          ], { suche: 'Code suchen …', anzahl: '542 Codes · LeitWerk-Codesystem', when: v => v('codeart', 'Notruf (RD)') === 'Notruf (RD)' }),
          TAB(['Code', 'Name', 'Kapitel', 'Art'], [
            ['KTR-90T1', 'Fahrt zum Krankenhaus – gehend', '90 – Fahrt zum Krankenhaus', 'KT'], ['KTR-90T2', 'Fahrt zum Krankenhaus – eigener Rollstuhl', '90 – Fahrt zum Krankenhaus', 'KT'], ['KTA-95T1', 'Entlassung nach Hause – gehend', '95 – Heimtransport', 'KT'], ['SEK-96N6-ITH', 'Dringende Notarztüberstellung mit Hubschrauber (ITH)', '96 – Überstellung', 'SEK'], ['SEK-96G7-SNAW', 'Geplante Kinder-/Inkubatorüberstellung mit SNAW', '96 – Überstellung', 'SEK']
          ], { suche: 'Code suchen …', anzahl: '136 Codes · LeitWerk-Transportcodes', when: v => v('codeart', 'Notruf (RD)') === 'KT/SEK' })] },
        { id: 'vorlagen', label: 'Einsatzvorlagen', info: 'Feste Einsätze statt Zufall', kw: 'vorlage einsatz meldung', note: 'Vorlagen werden nur verwendet, wenn unter Spiel & Simulation → Einsatzaufkommen „Quelle der Einsätze: aus Einsatzvorlagen“ gewählt ist.', rows: [
          TAB(['Code', 'Adresse', 'Meldung'], [
            ['A01-2', 'Steinertor 3, Krems', 'Bewohnerin bekommt schlecht Luft'], ['S07-1', 'Hauptplatz 1, Langenlois', 'Sturz auf der Stiege'], ['K01-1', 'Klinikum Tulln', 'Rückfahrt nach Dialyse']
          ], { suche: 'Vorlage suchen …', neu: 'Neue Vorlage', ding: 'Vorlage', anzahl: '3 Vorlagen', edit: true, typen: ['text', 'text', 'text'], extra: [['Lage', 'lage', '48.4100, 15.6000'], ['Patient Alter', 'text', ''], ['Transport', 'tog', 'ja'], ['Hinweis', 'text', '']] }), ...imp] },
        { id: 'status', label: 'Statusmodell', info: 'Nummern, Namen, Farben', kw: 'status statusmodell nummer farbe alarmierbar', rows: [
          H('Bedeutung · Nummer · Bezeichnung · Farbe · alarmierbar'),
          ...STATUS.map(a => ST(...a))
        ]}
      ,
        { id: 'csvImport', sub: true, parent: 'fahrzeuge', label: 'CSV importieren', info: 'Prüfen und übernehmen', kw: 'csv import datei', rows: [{ t: 'import' }] }
      ]},
      { id: 'real', label: 'Realismus', scope: 'Nur lokal · jeder Spieler selbst', pages: [
        { id: 'realismus', label: 'Realismus', info: 'Eigene Codes und Namen', kw: 'codeliste abfrageschema namen funkrufnamen logos json csv', note: 'Echte Codes und Namen sind aus rechtlichen Gründen nicht dabei. Lade nur Inhalte, an denen du die Rechte hast. Im Multiplayer lädt jeder sein eigenes Paket – ohne Paket siehst du neutrale Namen und Codes.', rows: [
          H('Eigene Codes & Abfrage – Notruf (RD)'),
          IT('LeitWerk-Codesystem (eingebaut)', 'Codes im gewohnten Aufbau (RD-…), mit Abfrage – immer verfügbar', 'aktiv', ok),
          IT('Mein RD-Satz', 'Codeliste · Abfrageschema · Dokumente/LeitWerk', '', '', { btns: [{ l: 'Verwenden', ok: 'RD-Satz „Mein RD-Satz“ aktiv' }, { l: 'Löschen', cfm: '„Mein RD-Satz“ (Notruf) wird aus Dokumente/LeitWerk gelöscht.', ok: 'Gelöscht' }] }),
          B('Eigenen RD-Satz', [{ l: 'Hochladen', sub: 'satzRd' }], 'Codeliste (CSV) und/oder Abfrageschema (JSON)'),
          H('Eigene Codes & Abfrage – Krankentransport & Überstellung (KT/SEK)'),
          IT('LeitWerk-Transportcodes (eingebaut)', 'Codes für KT und Überstellungen (KT…, SEK-…), mit KT-Abfrage – immer verfügbar', 'aktiv', ok),
          B('Eigenen KT/SEK-Satz', [{ l: 'Codes & Abfrage bearbeiten', sub: 'ktEditor' }, { l: 'Hochladen', sub: 'satzKt' }], 'Neuer Satz auf Basis des aktiven, oder Dateien hochladen'),
          H('Namen und Bilder'),
          B('Namens-Ersetzungen', ['CSV laden …'], 'neutral;eigen – Organisationen, Leitstelle, Dienststellen, Hubschrauber'),
          B('Funkrufnamen', ['CSV laden …']),
          B('Logos & Fahrzeugbilder', ['Dateien laden …'], 'PNG oder SVG'),
          B('Vorlage-Dateien', ['Ordner öffnen'], 'Mit neutralen Beispielwerten · Ablage in Dokumente/LeitWerk')
        ]},
        { id: 'satzRd', sub: true, parent: 'realismus', label: 'Eigener RD-Satz', info: 'Hochladen', kw: 'codeliste csv abfrageschema json satz', note: 'Du kannst beides zusammen oder nur eines davon hochladen. Gespeichert wird in Dokumente/LeitWerk. Fehlt die Abfrage, bleibt die eingebaute.', rows: [
          F('Name des Satzes', 'satzRdName', 'z. B. Mein Satz', 'Unter diesem Namen findest du den Satz später wieder'),
          B('Codeliste (CSV)', [{ l: 'Datei wählen …', ok: 'codes.csv · 530 Codes erkannt' }], 'Spalten: Code, Name, Kategorie (z. B. „ALS rot“), Kapitel'),
          B('Abfrageschema (JSON)', [{ l: 'Datei wählen …', ok: 'schema.json · gültig' }], 'Fragen und Regeln für die Notrufabfrage – enthält meist auch die Codes'),
          B('Zuordnung zu den LeitWerk-Merkmalen', [{ l: 'Zuordnung …', sub: 'zuordnung' }], 'Welche Frage deines Schemas welchem Merkmal entspricht – damit die Anrufer passend antworten'),
          B('', [{ l: 'Speichern & verwenden', back: true }, { l: 'Abbrechen', back: true }])
        ]},
        { id: 'zuordnung', sub: true, parent: 'satzRd', label: 'Zuordnung zu den Merkmalen', info: 'Fragen ↔ Merkmale', kw: 'zuordnung merkmal frage antwort schema ki', note: 'Nur nötig für eigene Abfrageschemas. Eindeutige Fragen ordnet LeitWerk selbst zu – hier prüfst du die offenen und unsicheren.', rows: [{ t: 'zuord' }] },
        { id: 'satzKt', sub: true, parent: 'realismus', label: 'Eigener KT/SEK-Satz', info: 'Hochladen', kw: 'kt sek codes abfrage json satz', note: 'Du kannst beides zusammen oder nur eines davon hochladen. Gespeichert wird in Dokumente/LeitWerk.', rows: [
          F('Name des Satzes', 'satzKtName', 'z. B. Mein KT-Satz', 'Unter diesem Namen findest du den Satz später wieder'),
          B('KT-/SEK-Codes (JSON)', [{ l: 'Datei wählen …', ok: 'kt-codes.json · 136 Codes erkannt' }], 'Codes mit ihren Bedingungen – so, wie der Editor sie speichert'),
          B('KT-Abfrage (JSON)', [{ l: 'Datei wählen …', ok: 'kt-abfrage.json · gültig' }], 'Fragen der KT-Hotline mit Art und dem, was sie klären'),
          B('', [{ l: 'Speichern & verwenden', back: true }, { l: 'Abbrechen', back: true }])
        ]},
        { id: 'ktEditor', sub: true, parent: 'realismus', label: 'KT/SEK-Codes bearbeiten', info: 'Editor', kw: 'kt editor codes bedingungen abfrage entwurf', note: 'Neuer Satz auf Basis des aktiven. Solange er unvollständig ist, bleibt er ein Entwurf und ist noch nicht spielbar.', rows: [
          F('Name des Satzes', 'ktEdName', 'z. B. Mein KT-Satz'),
          TAB(['Code', 'Name', 'Kapitel', 'Fahrt'], [
            ['KTR-90T1', 'Fahrt zum Krankenhaus – gehend', '90 – Fahrt zum Krankenhaus', 'zum KH'], ['KTR-90T1S', 'Einweisung SOFORT – gehend', '90 – Fahrt zum Krankenhaus', 'zum KH'], ['KTA-95T1', 'Entlassung nach Hause – gehend', '95 – Heimtransport', 'heim'], ['SEK-96N6-ITH', 'Dringende Notarztüberstellung mit Hubschrauber (ITH)', '96 – Überstellung', 'Überstellung']
          ], { suche: 'Code suchen …', neu: 'Neuer Code', ding: 'Code', anzahl: '136 Codes', edit: true, typen: ['text', 'text', 'text', ['sel', ['zum KH', 'heim', 'Überstellung', 'Termin']]], extra: [['Bedingungen', 'text', 'liegend · Begleitung · …'], ['Hinweis', 'text', '']] }),
          B('KT-Abfrage', [{ l: 'Fragen bearbeiten', ok: 'Im Editor geöffnet' }], 'Fragen der KT-Hotline'),
          B('', [{ l: 'Prüfen', ok: 'Vollständig – spielbar' }, { l: 'Speichern & verwenden', back: true }])
        ]}
      ]},
      { id: 'prog', label: 'Programm', scope: '', pages: [
        { id: 'karten', label: 'Kartenpakete', info: 'Straßen, Detailkarten, Gelände', kw: 'karte download paket straßennetz adressen routing offline gelände bundesland wien', note: 'Im Multiplayer brauchen alle dieselben Straßenpakete. Ohne Straßenpaket eines Bundeslands gibt es keine Transporte dorthin.', rows: [
          I('Grundpaket & Straßen Niederösterreich', 'immer installiert', '', ok),
          I('Straßennetz und Adressen', 'bereit', '412.000 Knoten · 1,1 Mio. Adressen · Bundesländer: NÖ, Wien', ok),
          H('Straßen weiterer Bundesländer'),
          IT('Wien', 'Straßen und Adressen · 48 MB', 'installiert', ok, { tog: ['pk_wien', true], btns: [{ l: 'Löschen', cfm: 'Straßenpaket Wien löschen? Ohne Paket gibt es keine Transporte nach Wien.', ok: 'Gelöscht' }] }),
          IT('Burgenland', '31 MB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          IT('Oberösterreich', '88 MB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          IT('Steiermark', '92 MB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          H('Detailkarten und Gelände'),
          IT('Detailkarte Niederösterreich', 'Gebäude und Hausnummern · 410 MB', 'installiert', ok, { tog: ['pk_detail', true], btns: [{ l: 'Löschen', cfm: 'Detailkarte löschen?', ok: 'Gelöscht' }] }),
          IT('Gelände für die 3D-Ansicht', 'Niederösterreich · 1,2 GB', '', '', { btns: [{ l: 'Laden', ok: 'Wird geladen … 0 %' }] }),
          I('Satellitenbild', 'online, ohne Paket', '', grau)
        ]},
        { id: 'programm', label: 'Programm & Updates', info: 'Version, Ordner, Spielstände', kw: 'version update aktualisieren speicherort ordner spielstand spielstände dokumente eigene dateien sichern backup', rows: [
          I('Version', '0.113.0 · aktuell', '', ok),
          B('Updates', [{ l: 'Jetzt suchen', ok: 'Auf dem neuesten Stand' }]),
          H('Eigene Dateien & Spielstände'),
          I('Ordner', 'Dokumente/LeitWerk', 'Alles, was du selbst dazugibst, liegt dort – je Art ein Ordner', grau),
          B('Spielstände', [{ l: 'Ansehen', tab: 'fort' }, 'Ordner öffnen'], 'Gespeicherte Schichten'),
          ...[['Abfrageschema', 'eigene Schemas'], ['Codelisten', 'eigene Codelisten'], ['Daten', 'importierte Fahrzeuge, Dienststellen, Krankenhäuser'], ['Fälle', 'eigene Fälle'], ['Töne', 'eigene Tondateien'], ['Designs', 'gespeicherte Farben'], ['Anordnungen', 'Fenster-Layouts']].map(([n, h]) => B(n, ['Ordner öffnen'], h))
        ]}
      ]}
    ];
    // Seiten mit echten Daten aus der App (zeilen.ts) – sonst die Zeilen aus dem Design
    if (this.app.zeilen) daten.forEach(g => g.pages.forEach(p => { try { const z = this.app.zeilen(p.id, bausteine); if (z) p.rows = z; } catch (e) { console.error('Einstellungsseite ' + p.id, e); } }));
    if (this.seitenAnpassen) this.seitenAnpassen(daten);
    return daten;
  }
  // Werte für die Vorlage seiten.html (Gruppen, Seiten, Zeilen, Suche)
  seitenWerte() {
    const st = this.state || {};
    const set = (k, v) => this.setState({ [k]: v });

    const data = this.settingsData();
    const opt = this.seitenOpt ? this.seitenOpt() : {};
    const gast = !!opt.gesperrt;
    if (opt.imSpiel) data.forEach(g => { if (g.id === 'sim') g.scope = gast ? 'Vom Host · nur ansehen' : 'Gilt sofort im laufenden Spiel · für alle'; if (g.id === 'daten') g.scope = gast ? 'Vom Host · nur ansehen' : 'Daten für alle im Spiel · gilt sofort'; });
    const all = [];
    data.forEach(g => g.pages.forEach(p => all.push({ ...p, gid: g.id, glabel: g.label, scope: g.scope, isSim: !!g.sim })));
    const norm = x => String(x).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
    const q = norm((st.q || '').trim());
    const sg = st.sg || 'platz';
    const grp = data.find(g => g.id === sg) || data[0];
    const list = all.filter(p => p.gid === grp.id && !p.sub);
    // Suche: Treffer im Hauptbereich – erst passende Seiten, dann einzelne Einstellungen; ein Klick springt genau dorthin
    const treffer = [];
    if (q) {
      const pfad = p => p.glabel + ' › ' + (p.sub ? (all.find(x => x.id === p.parent) || {}).label + ' › ' : '') + p.label;
      all.forEach(p => { if (norm(p.label + ' ' + p.info + ' ' + (p.kw || '')).includes(q)) treffer.push({ label: p.label, hint: p.info, wo: p.glabel, p, rk: null }); });
      all.forEach(p => p.rows.forEach((r, idx) => {
        if (r.t === 'head') return;
        if (r.t === 'table') { r.rows.forEach(z => { if (norm(z.join(' ')).includes(q)) treffer.push({ label: z[0], hint: z.slice(1).join(' · '), wo: pfad(p), p, rk: p.id + ':' + idx, tq: z[0] }); }); return; }
        if (r.label && norm(r.label + ' ' + (r.hint || '') + ' ' + (r.chip || '')).includes(q)) treffer.push({ label: r.label, hint: r.hint || '', wo: pfad(p), p, rk: p.id + ':' + (r.key || idx) });
      }));
    }
    const sp = st.sp || 'darstellung';
    // Tabellenzeile bearbeiten oder neu anlegen: eigene Unterseite (kein Popup), Felder nach Spaltentyp
    if (st.edit) {
      const quelleP = all.find(p => p.id === st.edit.p);
      const tab = quelleP && quelleP.rows[st.edit.t];
      if (tab) {
        const zeile = st.edit.z >= 0 ? tab.rows[st.edit.z] : tab.cols.map(() => '');
        const pre = 'ed_' + st.edit.p + '_' + st.edit.z + '_';
        const feld = (label, typ, wert, k) => {
          const t = Array.isArray(typ) ? typ[0] : typ;
          if (t === 'sel') return { t: 'sel', label, key: pre + k, options: typ[1], def: wert || typ[1][0] };
          if (t === 'tog') return { t: 'tog', label, key: pre + k, def: wert === 'ja' };
          if (t === 'num') return { t: 'num', label, key: pre + k, def: parseFloat(wert) || 0, unit: '%' };
          if (t === 'fix') return { t: 'info', label, value: wert || '–', hint: 'wird gezählt', dot: '#9AA3B5' };
          if (t === 'plan') return [{ t: 'head', label: 'Dienstplan' }, { t: 'plan', label, key: pre + k, def: wert }];
          if (t === 'lage') return { t: 'lage', label, key: pre + k, def: wert, marke: zeile[1] || zeile[0] || 'hier' };
          if (t === 'einr') return [{ t: 'head', label: 'Einrichtungen' }, { t: 'einr', label, key: pre + k, def: wert }];
          if (t === 'khlink') return { t: 'btns', label, btns: [{ l: 'KH-Aufnahme …', go: ['daten', 'khauf'], khId: st.edit.z >= 0 ? zeile[0] : null }], hint: 'Akut-Zeiten und welche Notfälle das Haus aufnimmt' };
          return { t: 'feld', label, key: pre + k, ph: label, def: wert };
        };
        const ding = tab.ding || 'Eintrag';
        const felder = [].concat(...tab.cols.map((c, i) => feld(c, (tab.typen || [])[i] || 'text', zeile[i], i)));
        (tab.extra || []).forEach(([l, typ, def], i) => felder.push(...[].concat(feld(l, typ, st.edit.z >= 0 ? (zeile[tab.cols.length + i] ?? def) : '', 'x' + i))));
        this.editInfo = { tab, felder: felder.filter(f => f.t !== 'head'), z: st.edit.z };
        const neu = st.edit.z < 0;
        all.push({ id: 'bearbeiten', sub: true, parent: quelleP.id, gid: quelleP.gid, glabel: quelleP.glabel, scope: quelleP.scope, label: neu ? (tab.neu || 'Neu') : ding + ' bearbeiten', info: '', kw: '',
          rows: [...felder, { t: 'btns', label: '', btns: [{ l: neu ? 'Anlegen' : 'Fertig', back: true, edit: 'speichern' }, ...(neu ? [{ l: 'Abbrechen', back: true }] : [{ l: 'Löschen', cfm: ding + ' „' + zeile[0] + '“ löschen? Das gilt sofort für alle im Spiel.', back: true, edit: 'loeschen' }])] }] });
      }
    }
    if (st.impVon) { const ip = all.find(p => p.id === 'csvImport'); const vp = all.find(p => p.id === st.impVon); if (ip && vp) { ip.parent = vp.id; ip.gid = vp.gid; ip.scope = vp.scope; ip.label = vp.label + ' – CSV importieren'; } }
    const page = all.find(p => p.id === sp) || all[0];
    const V = (k, d) => this.wertLesen(k, d);
    const setV = k => e => this.wert(k, (e && e.target) ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e);
    const vv = (k, d) => V(k, d);
    const sw1 = () => (st.sw || 0) + 1;
    // Knöpfe: Unterseite, Sprung, Reiter, Rückfrage direkt unter der Zeile, kurze Rückmeldung als Chip
    const knopf = (b, rk, bi) => {
      const o = typeof b === 'string' ? { l: b } : b;
      const id = rk + '#' + bi;
      const tun = () => {
        if (o.act || o.datei) {
          const melden = r => this.setState({ ['ok_' + rk]: typeof r === 'string' && r ? r : (o.ok || 'Erledigt'), cfm: null });
          const fehler = e => this.setState({ ['ok_' + rk]: '⚠ ' + String((e && e.message) || e), cfm: null });
          if (o.datei) {
            const f = document.createElement('input'); f.type = 'file'; f.accept = o.datei.accept || ''; f.multiple = !!o.datei.mehrere;
            f.addEventListener('change', () => { const d = Array.from(f.files || []); if (!d.length) return; this.setState({ ['ok_' + rk]: 'wird geladen …' }); Promise.resolve().then(() => o.datei.f(d)).then(melden, fehler); });
            f.click();
            return;
          }
          this.setState({ ['ok_' + rk]: 'läuft …', cfm: null });
          Promise.resolve().then(() => o.act()).then(melden, fehler);
          if (!o.back) return;
        }
        if (o.imp) return this.setState({ sp: 'csvImport', impVon: page.id, impDatei: null, sw: sw1(), swLate: false, cfm: null });
        if (o.sub) return this.setState({ sp: o.sub, sw: sw1(), swLate: false, cfm: null });
        if (o.go) return this.setState({ sg: o.go[0], sp: o.go[1], q: '', sw: sw1(), swLate: false, cfm: null, ...(o.khId ? { s_kh_haus: o.khId } : {}), edit: o.go[1] === 'bearbeiten' ? st.edit : null });
        if (o.tab) { if (opt.tab) opt.tab(o.tab); return; }
        if (o.back) { if (o.edit) this.editFertig(o.edit); return this.setState({ sp: (st.edit && st.edit.p) || page.parent, edit: null, sw: sw1(), swLate: false, cfm: null }); }
        if (o.ok) this.setState({ ['ok_' + rk]: o.ok, cfm: null });
      };
      return { label: o.sub ? o.l.replace(/ …$/, '') : o.l, cls: 'l-ghost sm' + (o.sub ? ' l-gsub' : '') + (st.cfm === id ? ' on' : ''), click: () => { if (o.cfm) this.setState({ cfm: st.cfm === id ? null : id }); else tun(); }, cfm: o.cfm, id, tun };
    };
    const sichtbar = page.rows.filter(r => !r.when || r.when(vv));
    const rows = sichtbar.map((r, idx) => {
      const rk = page.id + ':' + (r.key || page.rows.indexOf(r));
      const base = { rk, hlCls: st.hl === rk ? 'l-hl' : '', i: Math.min(idx, 14), label: r.label, hint: r.hint || '', hasHint: !!r.hint, isHead: r.t === 'head', isRow: !['head', 'table', 'chart', 'area', 'lage', 'einr', 'plan', 'khauf', 'import', 'zuord'].includes(r.t),
        isTog: false, isSeg: false, isSel: false, isRange: false, hasReset: false, isNum: false, isKey: false, isBtns: false, isInfo: false, isColor: false, isTn: false, isStat: false,
        isFeld: false, isTon: false, isTable: false, isChart: false, isArea: false, isLage: false, isEinr: false, isPlan: false, isKhauf: false, isImport: false, isZuord: false, hasStrip: false, hasOk: !!st['ok_' + rk], okText: st['ok_' + rk] || '', okCls: 'l-okchip' + (String(st['ok_' + rk] || '').startsWith('⚠') ? ' warn' : String(st['ok_' + rk] || '').endsWith('…') ? ' laeuft' : ''), rowCls: 'l-srow' + (r.label ? '' : ' l-srow-solo') };
      // Rückfrage eines Knopfs in dieser Zeile
      const btns = (r.btns || []).map((b, bi) => knopf(b, rk, bi));
      const offen = btns.find(b => b.cfm && st.cfm === b.id);
      if (offen) Object.assign(base, { hasStrip: true, stripText: offen.cfm, stripJa: offen.label.replace(/ …$/, ''), stripJaGo: () => offen.tun(), stripNein: () => this.setState({ cfm: null }), stripCls: 'l-strip' + (/lösch|verwerf|zurück/i.test(offen.cfm + offen.label) ? ' rot' : '') });
      const chip = r.chip ? { isInfo: true, value: r.chip, dot: r.dot || '#9AA3B5' } : {};
      if (r.t === 'head') return base;
      if (r.t === 'tog') {
        const on = !!V(r.key, r.def);
        const warte = st.warn === rk;
        const res = { ...base, isTog: true, on: on ? 'true' : 'false', togCls: 'l-tog' + (on ? ' on' : ''), flip: () => { if (!on && r.warn) return this.setState({ warn: warte ? null : rk }); this.setState({ warn: null }); this.wert(r.key, !on); } };
        if (warte) Object.assign(res, { hasStrip: true, stripText: r.warn, stripJa: r.warnJa || 'Einschalten', stripJaGo: () => { this.setState({ warn: null }); this.wert(r.key, true); }, stripNein: () => this.setState({ warn: null }), stripCls: 'l-strip gelb' });
        return res;
      }
      if (r.t === 'seg') return { ...base, isSeg: true, opts: r.opts.map(o => ({ label: o, cls: 'l-seg' + (V(r.key, r.def) === o ? ' on' : ''), pick: () => this.wert(r.key, o) })) };
      if (r.t === 'sel') return { ...base, isSel: true, options: (this.app.einst && this.app.einst.optionen(r.key)) || r.options, val: V(r.key, r.def), set: setV(r.key) };
      if (r.t === 'range') { const v = Number(V(r.key, r.def)); return { ...base, isRange: true, min: r.min, max: r.max, step: r.step, val: v, valText: r.fmt(v), set: setV(r.key), hasReset: r.reset !== undefined, resetLabel: 'Auf ' + r.reset + ' % zurücksetzen', reset: () => this.wert(r.key, r.reset) }; }
      if (r.t === 'num') return { ...base, isNum: true, val: V(r.key, r.def), unit: r.unit, step: r.step || 1, set: setV(r.key) };
      if (r.t === 'key') {
        const fang = st.keyCap === r.key;
        const txt = (this.app.einst && this.app.einst.tasteText(r.key)) || V(r.key, r.def);
        return { ...base, isKey: true, keyText: fang ? 'Taste drücken …' : txt, keyCls: 'l-key' + (fang ? ' fang' : ''), keyAria: r.label + ': ' + txt + ' – zum Ändern klicken',
          keyClick: () => this.setState({ keyCap: fang ? null : r.key }),
        };
      }
      if (r.t === 'btns') return { ...base, ...chip, isBtns: btns.length > 0, btns };
      if (r.t === 'item') {
        const res = { ...base, ...chip, isBtns: btns.length > 0 && !base.hasOk, btns, rowCls: 'l-srow l-sitem' };
        if (r.tog) { const on = !!V(r.tog[0], r.tog[1]); Object.assign(res, { isTog: true, on: on ? 'true' : 'false', togCls: 'l-tog' + (on ? ' on' : ''), flip: () => this.wert(r.tog[0], !on) }); }
        return res;
      }
      if (r.t === 'info') return { ...base, isInfo: true, value: r.value, dot: r.dot || '#9AA3B5' };
      if (r.t === 'color') {
        const res = { ...base, isColor: true, color: V(r.key, r.color), setColor: setV(r.key) };
        if (r.tog) { const on = !!V(r.tog[0], r.tog[1]); Object.assign(res, { isTog: true, on: on ? 'true' : 'false', togCls: 'l-tog' + (on ? ' on' : ''), flip: () => this.wert(r.tog[0], !on) }); }
        return res;
      }
      if (r.t === 'feld') return { ...base, isFeld: true, ftype: r.pw ? 'password' : 'text', ph: r.ph, val: V(r.key, r.def ?? ''), set: setV(r.key), isBtns: btns.length > 0, btns };
      if (r.t === 'ton') return { ...base, isTon: true, options: (this.app.einst && this.app.einst.optionen(r.key)) || r.options, val: V(r.key, r.def), set: setV(r.key), laut: V(r.key + '_l', 70), setLaut: setV(r.key + '_l'), probe: () => { const t = this.app.einst && this.app.einst.probe ? this.app.einst.probe(r.key) : null; this.setState({ ['ok_' + rk]: t || '▶ ' + V(r.key, r.def) }); } };
      if (r.t === 'table') {
        const qq = norm(st['tq_' + page.id] || '');
        const zeilen = r.rows.filter(z => !qq || norm(z.join(' ')).includes(qq));
        return { ...base, isTable: true, cols: r.cols.map((c, ci) => ({ c, cls: ci === 0 ? 'l-th1' : '' })), tcols: 'grid-template-columns: minmax(150px, 1.6fr) repeat(' + (r.cols.length - 1) + ', minmax(70px, 1fr))' + (r.edit ? ' 30px' : ''),
          trows: zeilen.map(z => ({ cells: z.slice(0, r.cols.length).map((c, ci) => ({ c, cls: ci === 0 ? 'l-td1' : '' })), edit: !!r.edit, go: () => r.oeffnen ? r.oeffnen(r.rows.indexOf(z)) : this.setState({ edit: { p: page.id, t: page.rows.indexOf(r), z: r.rows.indexOf(z) }, sp: 'bearbeiten', sw: sw1(), swLate: false, cfm: null }) })), hasEdit: !!r.edit,
          neuGo: () => r.neuOeffnen ? r.neuOeffnen() : r.neuZiel ? this.setState({ sp: r.neuZiel, sw: sw1(), swLate: false, cfm: null }) : this.setState({ edit: { p: page.id, t: page.rows.indexOf(r), z: -1 }, sp: 'bearbeiten', sw: sw1(), swLate: false, cfm: null }),
          hasTop: !!(r.suche || r.neu || r.anzahl), suche: r.suche || '', hasSuche: !!r.suche, tq: st['tq_' + page.id] || '', setTq: e => { const v = e.target.value; if (this.app.feldWert) this.app.feldWert('tq_' + page.id, v); this.setState({ ['tq_' + page.id]: v }); },
          neu: r.neu || '', hasNeu: !!r.neu, anzahl: r.anzahl || '', thint: r.hint || '', hasThint: !!r.hint, leer: zeilen.length === 0 };
      }
      if (r.t === 'chart') {
        // Aufkommen je Stunde wie in der App (aufkommenPanel.ts): Reihen je Versorgungsstufe + KT + Überstellungen + ACN,
        // Punkte ziehen ändert die Stunde; „Tabelle“ = Verteilung nach Schwere (harmlos/mittel/kritisch)
        const RDF = [2, 1.5, 1.2, 1, 1, 1.2, 2, 3, 3.8, 4.2, 4.4, 4.3, 4, 3.8, 3.7, 3.8, 4, 4.3, 4.1, 3.6, 3.2, 2.8, 2.5, 2.2];
        const KTF = [0, 0, 0, 0, 0, 0.3, 1.5, 4, 5.5, 5.8, 5.2, 4.5, 4, 4.4, 4.8, 4.2, 3.2, 2, 1, 0.5, 0.2, 0, 0, 0];
        const SKF = [0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.6, 1, 1.2, 1.2, 1.1, 1, 1.1, 1.2, 1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2];
        const ACF = [0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.06, 0.15, 0.22, 0.25, 0.24, 0.22, 0.2, 0.2, 0.21, 0.2, 0.18, 0.16, 0.14, 0.12, 0.1, 0.07, 0.05, 0.03];
        const norm1 = a => { const t = a.reduce((x, y) => x + y, 0); return a.map(v => v / t); };
        const vorlage = { Realistisch: { rd: 1, kt: 1, sek: 1, acn: 1 }, Standard: { rd: 1.4, kt: 1, sek: 1, acn: 1 }, Stressig: { rd: 2, kt: 1.3, sek: 1.3, acn: 1.3 } }[V('aufk', 'Standard')] || { rd: 1, kt: 1, sek: 1, acn: 1 };
        // Statistik 2025 (Anteile wie STUFEN_INFO), Funkgruppe NÖ-03 ≈ 68 Notfälle am Tag (realistisch)
        const STU = [['Telemedizin', 28562, '#2563eb'], ['Akuttransport grün', 24807, '#3a9c8f'], ['BLS grün', 3428, '#7cbf5e'], ['ALS grün', 48815, '#2f8a52'], ['BLS gelb', 54651, '#d9a400'], ['ALS gelb', 36291, '#9a7206'], ['BLS/ALS aufwertbar', 25634, '#7d64cc'], ['BLS rot', 41395, '#e06469'], ['ALS orange', 19935, '#e2761b'], ['ALS rot', 1999, '#a61b1b'], ['Großunfall', 5, '#475569']];
        const nSum = STU.reduce((t, x) => t + x[1], 0);
        const form = norm1(RDF);
        const reihen = [
          ...STU.map(([name, n, farbe], i) => ({ id: 'n' + i, name, farbe, gruppe: 'Notfälle', std: form.map(v => v * 68 * vorlage.rd * n / nSum) })),
          { id: 'kt', name: 'Krankentransporte', farbe: '#0b55a8', gruppe: 'Transporte', std: norm1(KTF).map(v => v * 52 * vorlage.kt) },
          { id: 'sek', name: 'Überstellungen', farbe: '#6d4fd6', gruppe: 'Transporte', std: norm1(SKF).map(v => v * 14 * vorlage.sek) },
          { id: 'acn', name: 'ACN (je Standort)', farbe: '#c2410c', gruppe: 'ACN', std: norm1(ACF).map(v => v * 2.4 * vorlage.acn) }
        ];
        const wert = x => st['ak_' + x.id] || x.std;
        const sel = reihen.find(x => x.id === (st.akSel || 'n4')) || reihen[4];
        const w = wert(sel);
        const max = Math.max(0.5, ...reihen.filter(x => x.gruppe === sel.gruppe).reduce((a, x) => a.concat(wert(x)), [])) * 1.15;
        const W = 480, Hh = 150, X = h => (h + 0.5) * W / 24, Y = v => Hh - v / max * Hh;
        const setze = arr => this.setState({ ['ak_' + sel.id]: arr.map(v => Math.max(0, Math.round(v * 100) / 100)) });
        const fmt = (v, d) => v.toFixed(d).replace('.', ',');
        const summe = a => a.reduce((t, v) => t + v, 0);
        const sumN = reihen.filter(x => x.gruppe === 'Notfälle').reduce((t, x) => t + summe(wert(x)), 0);
        const stunde = st.akH ?? 14;
        const ziehen = e => {
          const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
          const b = svg.getBoundingClientRect();
          const h = Math.max(0, Math.min(23, Math.floor((e.clientX - b.left) / b.width * 24)));
          const v = Math.max(0, (1 - (e.clientY - b.top) / b.height) * max);
          const neu = w.slice(); neu[h] = v;
          this.setState({ ['ak_' + sel.id]: neu.map(x => Math.round(x * 100) / 100), akH: h });
        };
        const tab = V('kansicht', 'Grafik') === 'Tabelle';
        const sw = { harmlos: 35, mittel: 50, kritisch: 15 };
        const andere = V('akAndere', true);
        return { ...base, isChart: true, isGrafik: !tab, isTabelle: tab,
          ansicht: ['Grafik', 'Tabelle'].map(o => ({ label: o, cls: 'l-seg' + (V('kansicht', 'Grafik') === o ? ' on' : ''), pick: () => this.setState({ s_kansicht: o }) })),
          kinfo: V('aufk', 'Standard') + ' · Funkgruppe NÖ-03 (14,2 % von NÖ) · am Tag ≈ ' + Math.round(sumN) + ' Notfälle, ' + Math.round(summe(wert(reihen[11]))) + ' Krankentransporte, ' + Math.round(summe(wert(reihen[12]))) + ' Überstellungen, ' + fmt(summe(wert(reihen[13])), 1) + ' ACN je Standort',
          kreihen: reihen.map((x, i) => {
            const su = summe(wert(x));
            const kopf = i === 0 || reihen[i - 1].gruppe !== x.gruppe;
            return { kopf, gruppe: x.gruppe === 'Notfälle' ? 'Notfälle · ' + Math.round(sumN) + ' am Tag' : x.gruppe === 'Transporte' ? 'Krankentransporte und Überstellungen' : 'Akutpflege (ACN)', name: x.name, farbe: x.farbe,
              zahl: x.gruppe === 'Notfälle' ? fmt(su / sumN * 100, su / sumN < 0.01 ? 2 : 1) + ' %' : fmt(su, su < 10 ? 1 : 0) + '/Tag',
              cls: 'l-kreihe' + (x.id === sel.id ? ' on' : '') + (st['ak_' + x.id] ? ' eigen' : ''), pick: () => this.setState({ akSel: x.id }) };
          }),
          kname: sel.name, kfarbe: sel.farbe, ksumme: fmt(summe(w), summe(w) < 10 ? 1 : 0) + (sel.gruppe === 'Notfälle' ? ' Notfälle' : sel.gruppe === 'ACN' ? ' Einsätze je Standort' : ' Fahrten') + ' am Tag',
          kw: W, kh: Hh, kvb: '0 -6 ' + W + ' ' + (Hh + 12),
          kgrid: [0.25, 0.5, 0.75].map(f => ({ y: (Hh * f).toFixed(1) })),
          kandere: andere ? reihen.filter(x => x.id !== sel.id && x.gruppe === sel.gruppe).map(x => ({ pts: wert(x).map((v, h) => X(h).toFixed(1) + ',' + Math.max(-4, Y(v)).toFixed(1)).join(' '), farbe: x.farbe })) : [],
          klinie: w.map((v, h) => X(h).toFixed(1) + ',' + Y(v).toFixed(1)).join(' '),
          kpunkte: w.map((v, h) => ({ lx: (X(h) / W * 100).toFixed(2), ty: ((Y(v) + 6) / (Hh + 12) * 100).toFixed(2), cls: 'l-kdot' + (h === stunde ? ' on' : '') })),
          kband: { x: (stunde * W / 24).toFixed(1), w: (W / 24).toFixed(1) },
          kstd: [0, 6, 12, 18, 24].map(h => ({ x: (h * W / 24).toFixed(1), t: String(h) })),
          kzieh: ziehen, kziehMove: e => { if (e.buttons === 1) ziehen(e); },
          kStunde: String(stunde).padStart(2, '0') + '–' + String(stunde + 1).padStart(2, '0') + ' Uhr',
          kStundeWert: fmt(w[stunde], 2) + ' in dieser Stunde',
          kVor: () => this.setState({ akH: (stunde + 23) % 24 }), kNach: () => this.setState({ akH: (stunde + 1) % 24 }),
          kWerkzeug: [
            ['Grundniveau −', () => setze(w.map(v => v - 0.1 * Math.max(...w) / 4))],
            ['Grundniveau +', () => setze(w.map(v => v + 0.1 * Math.max(...w) / 4))],
            ['Kurve −10 %', () => setze(w.map(v => v * 0.9))],
            ['Kurve +10 %', () => setze(w.map(v => v * 1.1))],
            ['Glätten', () => setze(w.map((v, h) => (w[(h + 23) % 24] + 2 * v + w[(h + 1) % 24]) / 4))],
            ['Reihe auf Standard', () => this.setState({ ['ak_' + sel.id]: undefined })],
            ['Alle zurücksetzen', () => { const z = {}; reihen.forEach(x => { z['ak_' + x.id] = undefined; }); this.setState(z); }]
          ].map(([label, go]) => ({ label, go })),
          kAndereCls: 'l-mini' + (andere ? ' on' : ''), kAndere: () => this.setState({ s_akAndere: !andere }),
          kSchwere: Object.keys(sw).map(k => ({ k, val: V('sw_' + k, sw[k]), set: setV('sw_' + k) })),
          tstd: RDF.map((v, h) => ({ h: String(h).padStart(2, '0') + '–' + String(h + 1).padStart(2, '0') + ' Uhr',
            rd: fmt(reihen.filter(x => x.gruppe === 'Notfälle').reduce((t, x) => t + wert(x)[h], 0), 1), kt: fmt(wert(reihen[11])[h], 1), sk: fmt(wert(reihen[12])[h], 1), acn: fmt(wert(reihen[13])[h], 2) })) };
      }
      const zusatz = this.zusatzZeile ? this.zusatzZeile(r, base, { rk, V, setV, sw1, page }) : null;
      if (zusatz) return zusatz;
      if (r.t === 'tn') {
        const k = j => r.key + '_' + j;
        return { ...base, isTn: true, a: V(k(0), r.def[0]), b: V(k(1), r.def[1]), c: V(k(2), r.def[2]), d: V(k(3), r.def[3]), setA: setV(k(0)), setB: setV(k(1)), setC: setV(k(2)), setD: setV(k(3)),
          aria1: r.label + ' Tag von', aria2: r.label + ' Tag bis', aria3: r.label + ' Nacht von', aria4: r.label + ' Nacht bis' };
      }
      if (r.t === 'stat') { const on = !!V(r.key + '_a', r.on); return { ...base, isStat: true, isTog: true, nr: V(r.key + '_n', r.nr), nm: V(r.key + '_m', r.nm), setNr: setV(r.key + '_n'), setNm: setV(r.key + '_m'), color: V(r.key + '_c', r.color), setColor: setV(r.key + '_c'), on: on ? 'true' : 'false', togCls: 'l-tog' + (on ? ' on' : ''), flip: () => this.wert(r.key + '_a', !on), aria1: r.label + ': Nummer', aria2: r.label + ': Bezeichnung', aria3: r.label + ': alarmierbar' }; }
      return base;
    });
    if (rows.length) rows[0].rowCls += ' first';
    // „Standard“ je Seite: alle Werte dieser Seite verwerfen (Rückfrage direkt darunter)
    const schluessel = [];
    page.rows.forEach(r => { if (r.key) schluessel.push(r.key); if (r.tog) schluessel.push(r.tog[0]); });
    const kannStd = schluessel.length > 0 && page.rows.some(r => ['tog', 'seg', 'sel', 'range', 'num', 'key', 'tn', 'stat', 'color', 'ton'].includes(r.t));
    const stdOffen = st.cfm === 'std:' + page.id;
    const stdGo = () => {
      const neu = { cfm: null };
      Object.keys(st).forEach(k => { if (schluessel.some(s => k === 's_' + s || k.startsWith('s_' + s + '_'))) neu[k] = undefined; });
      if (this.app.einst) schluessel.forEach(s => { this.app.einst.schreiben(s, undefined); ['_0', '_1', '_2', '_3', '_l', '_n', '_m', '_c', '_a'].forEach(x => this.app.einst.schreiben(s + x, undefined)); });
      this.setState(neu);
    };
    const parent = page.sub ? all.find(p => p.id === page.parent) : null;
    const gesperrt = gast && (page.gid === 'sim' || page.gid === 'daten');
    return {
      q: st.q || '',
            onQ: e => set('q', e.target.value),
            sgroups: data.map(g => ({ label: g.label, zu: gast && (g.id === 'sim' || g.id === 'daten'), cls: 'l-tab' + (g.id === sg ? ' on' : ''), pick: () => this.setState({ sg: g.id, sp: g.pages[0].id, q: '', sw: (st.sw || 0) + 1, swLate: false, cfm: null, warn: null, keyCap: null }) })),
            spages: list.map(p => ({ label: p.label, info: p.info, cls: 'l-spage' + (p.id === page.id || p.id === page.parent ? ' on' : ''), pick: () => this.setState({ sg: p.gid, sp: p.id, sw: (st.sw || 0) + 1, swLate: false, cfm: null, warn: null, keyCap: null }) })),
            rowsCls: ((st.sw || 0) % 2 ? 'l-swapA' : 'l-swapB') + (st.swLate ? ' l-late' : '') + (gesperrt ? ' ein-zu' : ''),
            ttlCls: (st.sw || 0) % 2 ? 'l-ttlA' : 'l-ttlB',
            hatQ: !!q, isSuche: !!q, notSuche: !q,
            qLeer: () => { this.setState({ q: '' }); setTimeout(() => { const i = document.getElementById('l-ssuche'); if (i) i.focus(); }, 0); },
            qKey: e => { if (e.key === 'Escape' && st.q) { e.preventDefault(); e.stopPropagation(); this.setState({ q: '' }); } if (e.key === 'Enter' && treffer[0]) { e.preventDefault(); this.zuTreffer(treffer[0]); } },
            treffer: treffer.slice(0, 60).map((t, i) => ({ label: t.label, hint: t.hint, hasHint: !!t.hint, wo: t.wo, i: Math.min(i, 14), go: () => this.zuTreffer(t) })),
            trefferText: treffer.length === 0 ? '' : treffer.length === 1 ? '1 Treffer' : (treffer.length > 60 ? 'mehr als 60' : treffer.length) + ' Treffer',
            keinTreffer: !!q && treffer.length === 0,
            page: { label: page.label, scope: page.scope, note: page.note || '', hasNote: !!page.note, isSub: !!parent, parentLabel: parent ? parent.label : '',
              back: () => parent && (page.id === 'csvImport' && this.setState({ impVon: null, impDatei: null }), page.id === 'bearbeiten' && this.editInfo && this.editInfo.z >= 0 && this.editFertig('speichern'), this.setState({ sp: parent.id, edit: null, sw: (st.sw || 0) + 1, swLate: false, cfm: null })),
              kannStd: kannStd && !stdOffen && !gesperrt, stdOffen, stdAsk: () => this.setState({ cfm: 'std:' + page.id }), stdGo, stdNein: () => this.setState({ cfm: null }) },
            subMerk: (this.subParent = parent ? parent.id : null, ''),
            rows,
            grossDa: !!opt.gross, grossT: st.gross ? 'Kleiner' : 'Groß', grossTip: st.gross ? 'Zurück in das Spielmenü' : 'Einstellungen über den ganzen Bildschirm',
            grossIc: st.gross ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', grossFlip: () => this.setState({ gross: !st.gross }), gross: !!st.gross,
            sperre: gesperrt, sperreText: 'Diese Einstellungen gelten für alle im Spiel und kommen vom Host. Ändern darf sie nur, wer das Recht „Einstellungen & Daten“ hat.',
            angefragt: !!opt.angefragt, nichtAngefragt: !opt.angefragt, anfragen: () => { if (opt.anfragen) opt.anfragen(); this.setState({}); }
    };
  }
}

/** Methoden der Einstellungsseiten in eine Komponenten-Klasse mischen (eigene Methoden der Klasse bleiben) */
export function seitenEinmischen(Klasse) {
  for (const n of Object.getOwnPropertyNames(SeitenBasis.prototype)) {
    if (n === 'constructor' || Object.prototype.hasOwnProperty.call(Klasse.prototype, n)) continue;
    Object.defineProperty(Klasse.prototype, n, Object.getOwnPropertyDescriptor(SeitenBasis.prototype, n));
  }
}
