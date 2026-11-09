// Gemeinsame Bausteine der Masken-Logik (RD, KT, SEK): Eingabefelder mit Entwurf beim Tippen und die freie Ortssuche.
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

export class MaskeBasis extends DCLogic {
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
    const lauf = this._suchLauf = (this._suchLauf || 0) + 1;
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

}
