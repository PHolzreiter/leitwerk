// KT- und SEK-Übersicht – Logik aus den Entwürfen „KTMaske“ und „SEKMaske“ übernommen (beide gleich aufgebaut).
// Die Beispieldaten sind durch die echten Daten ersetzt: this.props.app.daten(state) liefert Auftrag, Vorschläge und
// Zustand aus dem Spiel, this.props.app.tun(...) führt die Aktionen aus.
/* eslint-disable */
import { MaskeBasis } from "../masken-teile/basis.js";
import { vliste, knopfText, breitenLaden } from "../masken-teile/vliste.js";

const BAND_FARBE = { ok: 'var(--ok)', blau: 'var(--akzent)', gelb: 'var(--gelb)', rot: 'var(--rot)', grau: 'var(--dim)' };
const WIE = [['jetzt', 'Jetzt losschicken'], ['naechste', 'Als nächste Fahrt'], ['sammel', 'Zusätzlich mitnehmen']];

export class KtMaskeLogik extends MaskeBasis {
  constructor(p) {
    super(p);
    this.state = { vlBr: breitenLaden(p.sek ? 'sek' : 'kt'), ent: {} };
    this.refs = { code: { current: null }, sv: { current: null }, sn: { current: null }, fz: { current: null } };
  }

  /** anderer Auftrag: Bedienzustand zurücksetzen (Spaltenbreiten und Sortierung bleiben) */
  neuerAuftrag() {
    const s = this.state;
    this.state = { vlBr: s.vlBr, vlK: s.vlK, vlAuf: s.vlAuf, filter: s.filter, ent: {}, sw: (s.sw || 0) + 1 };
  }

  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const sek = !!this.props.sek;
    const wCls = 'ew-maske ' + (sek ? 'ew-sek' : 'ew-kt');
    const d = app.daten(st);
    if (!d) return { wCls, leer: true, da: false, leerText: app.leerText };
    const tun = (...a) => app.tun(...a);

    // ---- Vorschlag: beim ersten Laden gewählt (auch schon beim neuen Auftrag)
    if (d.vorschlag.key && st.gewFuer !== d.vorschlag.key && !d.vorschlag.laedt) {
      this.state = { ...this.state, gew: { ...d.vorschlag.empfohlen }, gewFuer: d.vorschlag.key, wie: undefined, sw: (st.sw || 0) + 1 };
    }
    const S = this.state;
    const gew = S.gew || {};
    const typen = d.typen;
    const filter = typen.includes(S.filter) ? S.filter : 'Alle';

    // ---- Fahrzeugliste (wie im Fahrzeuge-Fenster): Gruppen mit Trennzeilen, gewählte treten zurück
    const passt = (f) => filter === 'Alle' || f.gruppe === filter;
    const istGew = (f) => f.frei && (gew.transport === f.id || gew.begleit === f.id);
    const eintraege = [];
    let trenner = null;
    for (const f of d.liste) {
      if (f.trenner) { trenner = f; continue; }
      if (!passt(f)) continue;
      if (trenner) { eintraege.push(trenner); trenner = null; }
      eintraege.push({ ...f, cls: f.cls + (istGew(f) ? ' gew' : '') + (f.frei ? '' : ' weg'),
        klick: () => {
          if (!f.frei) return;
          const g = { ...(this.state.gew || {}) };
          if (f.begleit) g.begleit = g.begleit === f.id ? null : f.id;
          else { g.transport = g.transport === f.id ? null : f.id; if (g.transport && f.begleitVorschlag && !g.begleit) g.begleit = f.begleitVorschlag; }
          this.setState({ gew: g, wie: undefined });
        } });
    }
    const vlTeil = vliste(this, eintraege, { zeitTitel: 'Fahrt', zeitPx: 96, swExtra: S.sw || 0, name: sek ? 'sek' : 'kt' });
    const alleFz = d.liste.filter(f => !f.trenner);
    const tr = alleFz.find(f => f.id === gew.transport && f.frei) || null;
    const bg = alleFz.find(f => f.id === gew.begleit && f.frei) || null;
    const gewListe = [tr, bg].filter(Boolean);
    const typIdx = Math.max(0, typen.indexOf(filter));
    const typFilter = typen.map(x => ({ t: x, cls: 'seg' + (filter === x ? ' on' : ''), klick: () => this.setState({ filter: x, sw: (S.sw || 0) + 1 }) }));

    // ---- Fahrzeug mit laufender Fahrt: wann fährt es?
    const plan = tr && tr.plan;
    // „Zusätzlich mitnehmen“ ist vorausgewählt; ohne Platz ausgegraut (mit Grund) und „Als nächste Fahrt“ gewählt
    const wieWahlRoh = plan ? WIE.filter(([id]) => id !== 'jetzt' || !plan.aktiv) : [];
    const darf = (id) => id !== 'sammel' || plan.sammelOk;
    const wie = plan ? (wieWahlRoh.some(([id]) => id === S.wie) && darf(S.wie) ? S.wie : plan.sammelOk ? 'sammel' : 'naechste') : 'neu';
    const wieIdx = Math.max(0, wieWahlRoh.findIndex(([id]) => id === wie));
    const keinPlatz = plan && !plan.sammelOk ? 'Zusätzlich mitnehmen geht nicht: ' + (plan.sammelGrund || 'kein Platz') : '';
    const wieWahl = wieWahlRoh.map(([id, t]) => ({ t, cls: 'seg' + (id === wie ? ' on' : '') + (darf(id) ? '' : ' aus'), klick: () => (darf(id) ? this.setState({ wie: id }) : app.hinweis(keinPlatz)), titel: !darf(id) ? keinPlatz : id === 'jetzt' ? 'Fährt sofort los – die vorgemerkten Fahrten danach' : id === 'naechste' ? 'Nach seinen anderen Fahrten' : 'Zusätzlich mitnehmen – das Fahrzeug fährt die kürzeste Reihenfolge' }));
    const wieText = plan ? (wie === 'jetzt' ? plan.textJetzt : wie === 'sammel' ? plan.textSammel : plan.textNaechste) : '';

    // ---- Hauptknopf
    let hauptKnopf;
    if (tr) {
      const verb = tr.nurVormerken ? 'vormerken' : wie === 'naechste' ? 'als nächste Fahrt' : wie === 'sammel' ? 'zusätzlich mitnehmen' : wie === 'jetzt' ? 'jetzt losschicken' : 'alarmieren';
      hauptKnopf = gewListe.length > 1 ? knopfText(gewListe, 'alarmieren') : tr.ruf + ' ' + verb;
    } else if (bg) hauptKnopf = knopfText([bg], 'alarmieren');
    else hauptKnopf = d.aktion ? d.aktion.text : 'Fahrzeug wählen';
    const alarmieren = async () => {
      if (!tr && bg) return app.hinweis('Bitte noch das Transportfahrzeug wählen – das NEF fährt nur als Begleitung mit');
      if (!tr) { if (d.aktion) return tun(d.aktion.was); return app.hinweis('Bitte ein Fahrzeug in der Liste wählen'); }
      const ok = await tun('disponieren', tr.id, bg ? bg.id : null, wie === 'sammel' ? 'sammel' : 'neu', wie === 'naechste' || tr.nurVormerken ? false : true);
      if (ok !== false) this.setState({ gew: {} });
    };
    const vormerken = async () => {
      if (!tr) return app.hinweis('Bitte ein Fahrzeug in der Liste wählen');
      const ok = await tun('disponieren', tr.id, bg ? bg.id : null, wie === 'sammel' ? 'sammel' : 'neu', false);
      if (ok !== false) this.setState({ gew: {} });
    };

    // ---- Code ändern
    const codeOffen = !!S.codeOffen;
    const codeTreffer = codeOffen ? app.codeSuche(S.codeSuche || '').map((c, i) => ({ ...c, cls: 'dd-z ew-wahl' + (c.code === d.code ? ' erster' : ''), klick: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ codeOffen: false, codeSuche: '' }); tun('code', c.wert); } })) : [];

    // ---- Abholort / Zielort: freie Ortssuche
    const ed = S.ed || 'nichts';
    const zu = () => this.setState({ ed: 'nichts', sv: { q: '', gruppen: [] }, sn: { q: '', gruppen: [] } });
    const sv = this.suchWerte('sv', (it) => { zu(); tun('von', it.ort); }, zu, this.refs.sv, d.vonVorschlag);
    sv.karte = async () => { if (await tun('karteWaehlen', 'von')) zu(); };
    const sn = this.suchWerte('sn', (it) => { zu(); tun('nach', it.ort); }, zu, this.refs.sn, d.nachVorschlag);
    sn.karte = async () => { if (await tun('karteWaehlen', 'nach')) zu(); };
    const oeffne = (wo, ref) => { this.setState({ ed: ed === wo ? 'nichts' : wo, sv: { q: '', gruppen: [] }, sn: { q: '', gruppen: [] } }); if (ed !== wo) this.fokus(ref); };

    // ---- Patient: Anzeige, „Ändern“ öffnet die Felder
    const patOffen = ed === 'patient';
    const setze = (patch) => tun('setze', patch);

    const baender = d.baender.map(b => ({ ...b, cls: 'band ' + b.art, farbe: BAND_FARBE[b.art] || 'var(--dim)', klick: () => tun(b.aktion), klick2: () => tun(b.aktion2), titel: b.titel || '', titel2: b.titel2 || '' }));
    const protAlle = !!S.protAlle;
    const nProt = this.props.hoehe < 760 ? 2 : 6;
    const alarmiert = d.alarmiert.map(z => ({ ...z, funk: () => tun('funk', z.id), storno: () => tun('storno', z.id) }));
    return {
      wCls, leer: false, da: true,
      ...vlTeil,
      vlLeer: d.vorschlag.laedt ? 'Fahrzeiten werden berechnet …' : !eintraege.length && !d.listeHinweis ? (S.fzSuche ? 'Kein Fahrzeug gefunden.' : 'Kein passendes Fahrzeug verfügbar – über „Suchen“ ist jedes Fahrzeug wählbar.') : '',
      listeHinweis: d.listeHinweis, listeHinweisCls: d.listeHinweisWarn ? 'warum ew-fehlt' : 'zeit',
      nummer: d.nummer, eingang: d.eingang, baender,
      art: d.art, code: d.code, codeText: d.codeText, codeZusatz: d.codeZusatz, codeHinweis: d.codeHinweis,
      abfrage: d.abfrage, hatAbfrage: d.abfrage.length > 0,
      codeOffen, codeExp: codeOffen ? 'true' : 'false', codeSuche: S.codeSuche || '', codeTreffer, codeRef: this.refs.code,
      codeLeer: codeOffen && !codeTreffer.length ? 'Kein passender Code.' : '',
      codeKlick: () => { const auf = !S.codeOffen; this.setState({ codeOffen: auf, codeSuche: '' }); if (auf) this.fokus(this.refs.code); },
      codeEingabe: (e) => this.setState({ codeSuche: e.target.value }),
      codeTaste: (e) => { if (e.key === 'Escape') this.setState({ codeOffen: false }); else if (e.key === 'Enter' && codeTreffer[0]) { e.preventDefault(); codeTreffer[0].klick(); } },
      suchPlatz: sek ? 'Krankenhaus und Station, z. B. „St. Pölten Intensiv“ …' : 'Adresse oder Einrichtung …',
      von: d.von, vonInfo: d.vonInfo, nach: d.nach, nachInfo: d.nachInfo,
      hatAbholzeit: !!d.abholung, abholung: d.abholung, abholLbl: d.abholLbl, hatTermin: !!d.termin, termin: d.termin,
      abholWert: d.abholWert, terminWert: d.terminWert,
      abholSetzen: (e) => tun('zeit', 'abholung', e.target.value), terminSetzen: (e) => tun('zeit', 'termin', e.target.value),
      fahrtText: d.fahrtText,
      vonOffen: ed === 'von', vonZu: ed !== 'von', vonKlick: () => oeffne('von', this.refs.sv),
      nachOffen: ed === 'nach', nachZu: ed !== 'nach', nachKlick: () => oeffne('nach', this.refs.sn),
      sv, sn,
      alarmiert, hatAlarm: alarmiert.length > 0,
      patTitel: sek ? 'Anforderung und Patient' : 'Anrufer und Patient', anrLbl: sek ? 'Anfordernd' : 'Anrufer',
      patZu: !patOffen, patOffen, patKnopf: patOffen ? 'Fertig' : 'Ändern', patKlick: () => this.setState({ ed: patOffen ? 'nichts' : 'patient' }),
      patient: d.patient, anrufer: d.anrufer, tel: d.tel, grund: d.grund, info: d.info,
      fName: this.feld('name', d.roh.name, v => setze({ patient: { name: v.trim() } })),
      fAlter: this.feld('alter', d.roh.alter, v => setze({ patient: { alter: v.trim() === '' ? null : Number(v) || null } })),
      fGrund: this.feld('grund', d.roh.grund, v => setze({ grund: v.trim() })),
      fTel: this.feld('tel', d.roh.telefon, v => setze({ telefon: v.trim() })),
      fKasse: this.feld('kasse', d.roh.kasse, v => setze({ kasse: v.trim() })),
      fInfo: this.feld('info', d.roh.info, v => setze({ patient: { info: v.trim() } })),
      protokoll: protAlle ? d.protokoll : d.protokoll.slice(-nProt), protMehr: d.protokoll.length > nProt, protKnopf: protAlle ? 'Weniger' : 'Alles zeigen', protKlick: () => this.setState({ protAlle: !protAlle }),
      mitExport: d.mitExport, exportKlick: () => tun('export'),
      fzZahl: d.fzZahl(gewListe.length),
      aoOffen: !!S.ao, aoExp: S.ao ? 'true' : 'false', aoKlick: () => this.setState({ ao: !S.ao }), ausrueck: d.ausrueck,
      typFilter, typIdx: String(typIdx), typN: String(typen.length),
      sucheOffen: !!S.sucheOffen, sucheKnopfCls: 'kn sm' + (S.sucheOffen ? ' an' : ''), fzSuche: S.fzSuche || '', fzSucheRef: this.refs.fz, fzSuchPlatz: d.fzSuchPlatz,
      sucheKlick: () => { const auf = !S.sucheOffen; this.setState({ sucheOffen: auf, fzSuche: auf ? S.fzSuche : '', sw: (S.sw || 0) + 1 }); if (auf) this.fokus(this.refs.fz); },
      fzSucheEin: (e) => this.setState({ fzSuche: e.target.value }),
      fzSucheTaste: (e) => { if (e.key === 'Escape') this.setState({ fzSuche: '', sucheOffen: false }); },
      wieZeigen: !!plan, wieTitel: plan ? plan.titel : '', wieWahl, wieIdx: String(wieIdx), wieN: String(Math.max(1, wieWahl.length)), wieText,
      nebenKnopf: d.nebenKnopf, neben: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ mehrOffen: false }); tun('neben'); },
      zurAbfrage: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState({ mehrOffen: false }); tun('abfrage'); },
      mehrOffen: !!S.mehrOffen, mehrExp: S.mehrOffen ? 'true' : 'false', mehrKlick: () => this.setState({ mehrOffen: !S.mehrOffen }),
      vormerken, vormerkenTitel: 'Vormerken – das Fahrzeug fährt zur richtigen Zeit selbst los',
      alarmieren, hauptKnopf,
    };
  }
}
