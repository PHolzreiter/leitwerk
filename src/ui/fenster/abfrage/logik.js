// Abfrage-Fenster – Logik aus dem Entwurf „Abfrage“ (LeitWerk Arbeitsplatz, von Paul am 08.11. abgenommen).
// Aufbau, Tasten, Leiste und Anzeige wie im Entwurf; die Daten (Anrufe, Fragen, Gespräch, Code …) und alle Aktionen
// kommen über props.app aus dem Spiel (siehe daten.ts). Pro Anruf merkt sich das Fenster nur, welche Frage gerade
// offen ist, was übersprungen wurde und was gerade getippt wird.
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

const KEY = { notruf: "RD", kt: "KT", sek: "SEK" };
const LB_STD = 264;

export class AbfrageLogik extends DCLogic {
  constructor(p) {
    super(p);
    this.state = {};
    this.msgsRef = { current: null };
    this.fragRef = { current: null };
  }

  /** Zustand je Anruf (offene Frage, Übersprungene, Tippen) */
  per(id) {
    const per = this.state.per || {};
    return per[id] || {};
  }
  setPer(id, patch) {
    this.setState((s) => {
      const per = s.per || {};
      return { per: { ...per, [id]: { ...(per[id] || {}), ...patch } } };
    });
  }

  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const g = { breite: this.props.breite || 1600, hoehe: this.props.hoehe || 900 };
    const calls = app.anrufe();
    const mein = (c) => c.mein && (c.s === "aktiv" || c.s === "gehalten");
    // gezeigt wird mein Gespräch: das zuletzt gewählte, sonst das laufende, sonst ein gehaltenes
    let curCall = calls.find((c) => c.id === st.aktuell && mein(c)) || calls.find((c) => mein(c) && c.s === "aktiv") || calls.find(mein) || null;
    const G = curCall ? app.gespraech(curCall.id) : null;
    if (!G) curCall = null;
    const art = curCall ? curCall.art : "notruf";
    const id = curCall ? curCall.id : "";
    const ps = this.per(id);
    const set = (patch) => id && this.setPer(id, patch);

    // ---- Fragen (Schritte) des Gesprächs
    const S = G ? G.schritte : [];
    const skip = ps.skip || [];
    const jetztMs = Date.now();
    const eben = ps.eben || {};
    const erledigtS = (s) => s.antwort !== undefined || skip.includes(s.id) || (eben[s.id] && jetztMs - eben[s.id] < 2500);
    let cur = ps.cur ? S.find((s) => s.id === ps.cur) || null : null;
    if (!cur) cur = S.find((s) => !erledigtS(s)) || null;
    const idx = cur ? S.indexOf(cur) : -1;
    // Antwort gegeben: zur nächsten offenen Frage (die Daten kommen kurz danach aus dem Spiel)
    const weiterNach = (s) => set({ cur: undefined, eben: { ...eben, [s.id]: Date.now() }, skip: skip.filter((x) => x !== s.id), eing: undefined, q: "" });
    const anzeige = (s) => (s.antwort === null || (s.antwort === undefined && skip.includes(s.id)) ? "übersprungen" : s.antwort === undefined ? "…" : s.antwort || "–");

    let f = { teil: "", nr: "", text: "", hinweis: "", hatHinweis: false, istWahl: false, istKapitel: false, istEingabe: false, istOrt: false, mitWeiter: false, ohneWeiter: true, optionen: [], wert: "", gruppen: [] };
    let ersterTreffer = null;
    if (cur) {
      const opt = (label, i, an, klick, titel) => ({ t: label, nr: String(i + 1), an: an ? "true" : "false", cls: "opt" + (an ? " on" : ""), klick, titel: titel || "" });
      let optionen = [];
      if (cur.typ === "wahl") optionen = cur.optionen.map((o, i) => opt(o, i, (cur.an || []).includes(i), () => { if (!G.darf) return; cur.waehlen(i); weiterNach(cur); }));
      if (cur.typ === "mehr") optionen = cur.optionen.map((o, i) => opt(o, i, (cur.an || []).includes(i), () => { if (G.darf) cur.umschalten(i); }));
      const q = ps.q || "";
      let gruppen = [], keinTreffer = false, sucht = false, keinKapitel = false;
      if (cur.typ === "ort") {
        const r = cur.treffer(q);
        let n = 0;
        gruppen = r.gruppen.filter((gr) => gr.items.length).map((gr) => ({
          t: gr.t,
          items: gr.items.map((o) => {
            const erster = n++ === 0;
            if (erster) ersterTreffer = o;
            return { cls: "treffer" + (erster ? " erster" : ""), name: o.name, zeile: o.zeile, rechts: erster ? "Enter" : o.rechts || "", ruf: o.typ === "ruf", adr: o.typ === "adr", org: o.typ === "org", ortung: o.typ === "ortung",
              klick: () => { if (!G.darf) return; o.nehmen(); weiterNach(cur); } };
          }),
        }));
        sucht = r.laedt && !n;
        keinTreffer = !r.laedt && !!q.trim() && !n;
      }
      if (cur.typ === "kapitel") {
        const liste = cur.kapitel(q);
        keinKapitel = !!q.trim() && !liste.length;
        optionen = liste.map((k, i) => {
          if (i === 0 && q.trim()) ersterTreffer = k;
          return { t: k.t, nr: k.nr, titel: k.titel || "", an: k.an ? "true" : "false", cls: "opt" + (k.an || (q.trim() && i === 0) ? " on" : ""), klick: () => { if (!G.darf) return; cur.kapitelNehmen(k.nr, q); weiterNach(cur); } };
        });
      }
      const mitWeiter = cur.typ === "mehr" || cur.typ === "eingabe" || cur.typ === "ort";
      f = {
        teil: cur.teil, nr: "Frage " + (idx + 1) + " von " + S.length, text: cur.text, hinweis: cur.hinweis || "", hatHinweis: !!cur.hinweis,
        istWahl: cur.typ === "wahl" || cur.typ === "mehr", istKapitel: cur.typ === "kapitel", istEingabe: cur.typ === "eingabe", istOrt: cur.typ === "ort",
        mitWeiter, ohneWeiter: !mitWeiter, optionen, gruppen, keinTreffer, sucht, keinKapitel,
        wert: ps.eing !== undefined ? ps.eing : cur.wert || "",
        mitOrtung: !!cur.ortung, ortungText: cur.ortung ? cur.ortung.text : "", ortungTitel: cur.ortung ? cur.ortung.titel : "",
        ortungCls: "kn sm" + (cur.ortung && cur.ortung.aus ? " aus" : "") + (cur.ortung && cur.ortung.wichtig ? " prim" : ""),
        orten: () => { if (G.darf && cur.ortung && !cur.ortung.aus) cur.ortung.klick(); },
        karte: () => { if (G.darf && cur.karte) cur.karte().then((ok) => ok && weiterNach(cur)); },
        hatJetzt: cur.typ === "ort" && !!cur.antwort && !q, jetzt: cur.typ === "ort" ? cur.antwort || "" : "",
        ortPlatz: cur.ortPlatz || "Adresse oder Einrichtung eintippen, z. B. „wiener str 12 krems“ – Enter übernimmt",
        kapPlatz: cur.kapPlatz || "Nummer oder Stichwort tippen, z. B. „6“, „Sturz“ – Enter wählt den ersten Treffer",
        platz: cur.platz || (cur.zahl ? "Zahl eintippen – Enter geht weiter" : "Eintippen – Enter geht weiter"), modus: cur.zahl ? "numeric" : "text",
        ein: (e) => set({ eing: e && e.target ? e.target.value : "" }), q, qEin: (e) => set({ q: e && e.target ? e.target.value : "" }),
      };
    }
    const ueberspringen = () => {
      if (!cur) return;
      set({ skip: skip.includes(cur.id) || cur.antwort !== undefined ? skip : skip.concat(cur.id), cur: undefined, eing: undefined, q: "" });
    };
    const weiter = () => {
      if (!cur || !G.darf) return;
      if (cur.typ === "mehr") { cur.mehrFertig(); weiterNach(cur); }
      else if (cur.typ === "eingabe") {
        const w = (f.wert || "").trim();
        if (!w) return ueberspringen();
        if (w === (cur.wert || "").trim() && cur.antwort !== undefined) return weiterNach(cur);
        if (cur.eingeben(w) !== false) weiterNach(cur);
      } else if (cur.typ === "ort") { if (ersterTreffer) { ersterTreffer.nehmen(); weiterNach(cur); } else if (cur.antwort) weiterNach(cur); }
      else if (cur.typ === "kapitel") { if (ersterTreffer) { cur.kapitelNehmen(ersterTreffer.nr, ps.q || ""); weiterNach(cur); } }
    };
    // ↑: zur vorigen Frage (auch beantwortete), ↓ überspringen
    const zurueck = () => {
      if (!cur) { const l = S[S.length - 1]; if (l) set({ cur: l.id, eing: undefined, q: "" }); return; }
      if (idx > 0) set({ cur: S[idx - 1].id, eing: undefined, q: "" });
    };
    const stellen = () => { if (cur && cur.stellen && G.darf && G.aktiv) cur.stellen(); };

    // ---- Tasten: 1–9 Antwort · Tippen geht ins Feld · Enter weiter · Leertaste fragt · ↑ zurück · ↓ überspringen
    const halteFokus = (sec) => {
      if (!sec || !sec.focus) return;
      setTimeout(() => {
        try {
          const a = document.activeElement;
          if (!a || a === document.body || !sec.contains(a) || !a.isConnected) {
            const feld = sec.querySelector(".f-eing");
            (feld || sec).focus({ preventScroll: true });
          }
        } catch (x) { /* */ }
      }, 30);
    };
    this._halteFokus = halteFokus;
    const fokus = (e) => {
      if (!e || !e.currentTarget) return;
      // Klick in andere Felder (eigene Frage, Hinweise) nicht stören
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      halteFokus(e.currentTarget);
    };
    const ersterKlingelt = calls.find((c) => c.s === "klingelt" && sichtbarF(c));
    function sichtbarF(c) { return mein(c) || (app.filter()[KEY[c.art]] !== false); }
    const taste = (e) => {
      if (!e) return;
      const k = e.key;
      const imFeld = e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (!imFeld && e.currentTarget) halteFokus(e.currentTarget);
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // kein Gespräch: Leertaste hebt den obersten Anruf ab
      if (!curCall) {
        if (k === " " && !imFeld && ersterKlingelt) { e.preventDefault(); app.abheben(ersterKlingelt.id); this.setState({ aktuell: ersterKlingelt.id }); }
        return;
      }
      if (!cur) {
        if (k === "ArrowUp" && !imFeld) { e.preventDefault(); zurueck(); }
        return;
      }
      const istFrageFeld = imFeld && e.target.classList && e.target.classList.contains("f-eing");
      if (k === "Insert" && istFrageFeld && cur.einfuegen) { e.preventDefault(); set({ eing: cur.einfuegen() }); return; }
      if (k === "Enter") { if (imFeld && !istFrageFeld) return; e.preventDefault(); if (cur.typ === "wahl") ueberspringen(); else weiter(); return; }
      if (imFeld && !istFrageFeld) return;
      const feldDa = cur.typ === "eingabe" || cur.typ === "kapitel" || cur.typ === "ort";
      const getippt = cur.typ === "eingabe" ? f.wert || "" : ps.q || "";
      if (imFeld) {
        // im Frage-Feld: Leertaste fragt nur, solange nichts getippt ist; ↑/↓ wie sonst
        if (k === " " && !getippt) { e.preventDefault(); stellen(); return; }
        if (k === "ArrowUp") { e.preventDefault(); zurueck(); return; }
        if (k === "ArrowDown") { e.preventDefault(); ueberspringen(); return; }
        return;
      }
      if (k === " " && !(feldDa && getippt)) { e.preventDefault(); stellen(); return; }
      if (k === "ArrowUp") { e.preventDefault(); zurueck(); return; }
      if (k === "ArrowDown") { e.preventDefault(); ueberspringen(); return; }
      if (/^[1-9]$/.test(k) && f.istWahl) { const o = f.optionen[Number(k) - 1]; if (o) { e.preventDefault(); o.klick(); } return; }
      if (feldDa && k.length === 1) {
        // Tippen geht automatisch in die Textzeile
        e.preventDefault();
        const feld = e.currentTarget && e.currentTarget.querySelector ? e.currentTarget.querySelector(".f-eing") : null;
        if (cur.typ === "kapitel" || cur.typ === "ort") set({ q: (ps.q || "") + k }); else set({ eing: (f.wert || "") + k });
        if (feld) setTimeout(() => { try { feld.focus(); const n = feld.value.length; feld.setSelectionRange(n, n); } catch (x) { /* */ } }, 0);
      }
    };

    // ---- beantwortete Fragen, neueste oben (Reihenfolge der Abfrage, umgedreht)
    const erledigt = S.filter((s) => s !== cur && erledigtS(s)).reverse().map((s) => ({
      text: s.text, antwort: anzeige(s), cls: "erl-z" + (s.antwort === undefined || s.antwort === null ? " leer" : ""),
      klick: () => set({ cur: s.id, eing: undefined, q: "" }),
    }));

    // ---- Anrufe: Abheben, Halten, Auflegen, Filter
    const fil = app.filter();
    const sichtbar = calls.filter((c) => mein(c) || fil[KEY[c.art]] !== false);
    const versteckt = calls.length - sichtbar.length;
    const offenModus = !!curCall;
    const abheben = (cid) => { app.abheben(cid); this.setState({ aktuell: cid }); };
    const lb = st.lb || app.lb() || LB_STD;
    const eng = (w) => Math.max(150, Math.min(420, Math.round(w)));
    const ziehStart = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      const x0 = ev ? ev.clientX : 0; const w0 = lb;
      const zieh = (e) => this.setState({ lb: eng(w0 + (e.clientX - x0)) });
      const los = () => { window.removeEventListener("mousemove", zieh); window.removeEventListener("mouseup", los); this.setState({ zieht: false }); app.lbSetzen(this.state.lb || lb); };
      window.addEventListener("mousemove", zieh); window.addEventListener("mouseup", los);
      this.setState({ zieht: true });
    };
    const ziehTaste = (e) => { const k = e && e.key; if (k === "ArrowLeft" || k === "ArrowRight") { if (e.preventDefault) e.preventDefault(); const n = eng(lb + (k === "ArrowRight" ? 16 : -16)); this.setState({ lb: n }); app.lbSetzen(n); } };
    let ersterGesetzt = false;
    const klAnrufe = sichtbar.map((c) => {
      const klingelt = c.s === "klingelt";
      const erster = klingelt && !offenModus && !ersterGesetzt; if (erster) ersterGesetzt = true;
      const fremd = !c.mein && (c.s === "aktiv" || c.s === "gehalten");
      const knopf = klingelt ? "Abheben" : c.s === "gehalten" && c.mein && !(curCall && c.id === curCall.id) ? "Zurück" : c.s === "gehalten" && !c.mein ? "Übernehmen" : "";
      return {
        cls: "kl " + c.art + " " + (fremd && c.s === "aktiv" ? "fremd" : c.s + (fremd ? " fremd" : "")) + (erster ? " erster" : "") + (curCall && c.id === curCall.id ? " aktuell" : ""),
        artCls: "artb " + c.art, artName: c.artName, kurz: KEY[c.art], nummer: c.nummer, info: c.info, titel: c.titel || "",
        zeit: c.zeit, wer: c.wer, hatWer: !!c.wer,
        hatKnopf: !!knopf, knopf, knopfTitel: klingelt ? (offenModus ? "Abheben – das laufende Gespräch wird gehalten" : "Abheben") : knopf === "Zurück" ? "Zurück zu diesem Gespräch" : knopf === "Übernehmen" ? "Gehaltenen Anruf übernehmen und weiterführen" : "",
        klick: () => abheben(c.id),
      };
    });
    const filter = ["RD", "KT", "SEK"].map((k) => ({
      t: k, an: fil[k] !== false ? "true" : "false", cls: "fil" + (fil[k] !== false ? " an" : ""),
      titel: (fil[k] !== false ? "Werden angezeigt und angenommen: " : "Ausgeblendet: ") + { RD: "Notrufe", KT: "KT-Hotline", SEK: "Überstellungen" }[k],
      klick: () => app.filterSetzen(k, fil[k] === false),
    }));

    // ---- Hinweise für die Besatzung: automatisch „83w B+ A~“, eigener Text nach „//“
    const infoAuto = G ? G.infoAuto || "" : "";
    const infoText = ps.info !== undefined ? ps.info : G ? G.infoText || "" : "";
    const infoFertig = () => { if (G && ps.info !== undefined) { G.infoSetzen(ps.info); set({ info: undefined }); } };

    // ---- Gespräch
    const msgs = G ? G.msgs.map((m) => ({ cls: "msg " + m.von + (m.live ? " live" : ""), hatKopf: m.von !== "sys", wer: m.wer, t: m.t, x: m.x })) : [];

    const halten = () => { if (!curCall) return; if (curCall.s === "gehalten") app.abheben(curCall.id); else app.halten(curCall.id); };
    const gehalten = !!curCall && curCall.s === "gehalten";

    return {
      ...g,
      artCls: "artb " + art, artName: G ? G.artName : "", nummer: G ? G.nummer : "", anrufInfo: G ? G.anrufInfo : "", dauer: G ? G.dauer : "",
      vcodeCls: "vcode" + (G && G.stand ? " s" + G.stand : "") + (G && G.codeLeer ? " leer" : ""),
      vcodeTitel: G ? G.codeTitel : "", vcodeKlick: () => G && G.codeKlick(),
      ergCode: G ? G.code : "",
      offen: !!cur, fertig: !!G && !cur, f, weiter, taste, fokus, ueberspringen, zurueck, stellen,
      stellenCls: "kn sm" + (cur && cur.stellen && G && G.darf && G.aktiv ? "" : " aus"),
      erledigt, anzahlErl: String(erledigt.length),
      msgs, msgsRef: this.msgsRef, fragRef: this.fragRef,
      kiText: G ? G.kiText || "" : "", kiTitel: G ? G.kiTitel || "" : "", mitExport: !!G && G.mitExport, exportKlick: () => G && G.exportieren(),
      alarme: G ? G.alarme.map((a) => ({ ...a, hatKnopf: !!a.knopf })) : [],
      infoAuto, infoAutoStil: infoAuto ? "" : "display: none;", infoText, infoSepStil: infoAuto && infoText.trim() ? "" : "display: none;",
      infoPlatz: infoAuto ? "weitere Hinweise – z. B. bekommt schlecht Luft" : "Hinweise für die Besatzung",
      infoErkl: G && G.art === "notruf" ? "Alter, Geschlecht, Bewusstsein (B) und Atmung (A) kommen automatisch aus der Abfrage – eigener Text kommt nach „//“." : "Alter und Geschlecht kommen automatisch aus der Abfrage – eigener Text kommt nach „//“.",
      infoEin: (e) => set({ info: e && e.target ? e.target.value : "" }), infoFertig,
      infoTaste: (e) => { if (e && e.key === "Enter") { e.preventDefault(); infoFertig(); if (e.target && e.target.blur) e.target.blur(); } },
      zielName: G ? G.ziel : "", zurText: G ? "Zur " + G.ziel : "", zielEinsatz: G ? G.zielEinsatz : "", zur: () => G && G.zur(),
      telCls: "tel" + (offenModus ? " offen" : "") + (st.zieht ? " zieht" : ""), lb: String(lb),
      ziehStart, ziehTaste, ziehReset: () => { this.setState({ lb: LB_STD }); app.lbSetzen(LB_STD); }, istGespraech: offenModus,
      klAnrufe, keinAnruf: klAnrufe.length === 0, filter,
      klTitel: offenModus ? "Anrufe · " + klAnrufe.length : klAnrufe.length === 0 ? "Kein Anruf" : klAnrufe.length === 1 ? (klAnrufe[0].knopf === "Abheben" ? "Eingehender Anruf" : "1 Anruf") : klAnrufe.length + " Anrufe",
      klHinweis: (klAnrufe.length > 1 && !offenModus ? "Notrufe stehen oben · Leertaste hebt den obersten ab" : "") + (versteckt ? (klAnrufe.length > 1 && !offenModus ? " · " : "") + versteckt + " ausgeblendet" : ""),
      leerText: versteckt ? versteckt + (versteckt === 1 ? " Anruf ist" : " Anrufe sind") + " über den Filter oben ausgeblendet." : "Kommt ein Anruf herein, erscheint er hier zum Abheben.",
      istGehalten: gehalten, gehaltenText: G ? G.gehaltenText : "",
      haltenText: gehalten ? "Zurückholen" : "Halten", haltenAn: gehalten ? "true" : "false",
      haltenTitel: gehalten ? "Gespräch fortsetzen" : "Anrufer in die Warteschleife – bei zu langem Warten legt er auf",
      haltenCls: "kn sm" + (gehalten ? " halt-an" : ""), halten,
      stummAn: app.stumm() ? "true" : "false", stummCls: "kn sm" + (app.stumm() ? " stumm-an" : ""), stumm: () => app.stummSetzen(!app.stumm()),
      auflegen: () => curCall && app.auflegen(curCall.id),
    };
  }
}
