// Telefon-Fenster – Logik aus dem Entwurf „Telefon“ (LeitWerk Arbeitsplatz, von Paul am 08.11. abgenommen).
// Nur zum Zurückrufen und Anrufen – angenommen wird in der Abfrage. Die Anrufe und Aktionen kommen über props.app
// aus dem Spiel (siehe index.ts).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

const P = {
  tel: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  verp: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2M15 3l6 6M21 3l-6 6",
  zurueck: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2M14 4h6v6M20 4l-6 6",
  fertig: "M5 12l4 4 10-10",
  aufl: "M4 5h16v14H4zM8 9h8M8 13h5",
};
const ART = { notruf: "Notruf 144", kt: "KT-Hotline", sek: "Überstellung" };
const KEY = { notruf: "RD", kt: "KT", sek: "SEK" };

export class TelefonLogik extends DCLogic {
  constructor(p) {
    super(p);
    this.state = {};
    this.auflRefs = new Map();
  }
  auflRef(id) {
    let r = this.auflRefs.get(id);
    if (!r) this.auflRefs.set(id, (r = { current: null }));
    return r;
  }
  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const g = { breite: this.props.breite || 520, hoehe: this.props.hoehe || 900 };
    const calls = app.anrufe();
    const typ = st.typ || "Alle";
    const welche = st.welche || "Alle";
    const sel = app.auswahl();
    const roh = (st.such || "").trim();
    const such = roh.toLowerCase();
    const istNummer = /^[+0-9][0-9 /-]{4,}$/.test(roh);
    const ziffern = roh.replace(/\D/g, "");
    const laeuft = calls.find((c) => c.s === "laeuft");
    const stopp = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
    const auf = st.auf || {};
    const K = (t, cls, pfad, klick, titel) => ({ t, cls: "kn sm " + cls, pfad, titel: titel || t, klick: (e) => { stopp(e); if (!/ aus/.test(" " + cls)) klick(); } });
    const zeile = (c) => {
      let stT = "", sym = P.tel;
      const knoepfe = [];
      if (c.s === "laeuft") {
        stT = (c.rueckruf ? "Rückruf läuft · " : "Gespräch läuft · ") + c.wer;
        knoepfe.push(K("Zur Abfrage", "prim zr", P.tel, () => app.zurAbfrage(), "Das Gespräch läuft im Abfrage-Fenster"));
      } else if (c.s === "verpasst") {
        stT = "verpasst" + (c.versuche > 1 ? " (" + c.versuche + "×)" : ""); sym = P.verp;
        knoepfe.push(K("Zurückrufen", "prim zr" + (c.ohneNummer ? " aus" : ""), P.zurueck, () => app.rufe(c.id), c.ohneNummer ? "Keine Rückrufnummer aufgenommen – Rückruf nicht möglich" : "Anrufer zurückrufen – das Gespräch läuft im Abfrage-Fenster"));
      } else {
        stT = "beendet"; sym = P.fertig;
        if (c.mitAufl) knoepfe.push(K(auf[c.id] ? "Auflösung zu" : "Auflösung", "leise", P.aufl, () => this.setState({ auf: { ...auf, [c.id]: !auf[c.id] } }), "Was wirklich war und was in der Abfrage eingetragen wurde"));
        knoepfe.push(K("Zurückrufen", "zr" + (c.ohneNummer ? " aus" : ""), P.zurueck, () => app.rufe(c.id), c.ohneNummer ? "Keine Rückrufnummer aufgenommen – Rückruf nicht möglich" : "Rückruf beim Anrufer – z. B. um die Adresse zu klären"));
      }
      return {
        id: c.id, cls: "t-z " + c.art + " " + c.s + (sel === c.id ? " sel" : ""), art: KEY[c.art], artCls: "artb " + c.art, tel: c.tel,
        zeile: c.zeile, st: stT, dauer: c.dauer, sym, knoepfe,
        hatAufl: !!auf[c.id] && c.mitAufl, auflRef: this.auflRef(c.id), stopp,
        titel: ART[c.art] + (c.art === "notruf" && c.s === "beendet" ? " · Klick öffnet die Abfrage zum Ändern" : " · Klick wählt den " + (c.art === "notruf" ? "Einsatz" : "Auftrag")), oeffnen: () => app.oeffnen(c.id),
      };
    };
    const passt = (c) => (typ === "Alle" || KEY[c.art] === typ) && (!such || (istNummer ? c.tel.replace(/\D/g, "").includes(ziffern) : c.suche.includes(such)));
    const verpasst = calls.filter((c) => (c.s === "verpasst" || (c.s === "laeuft" && c.vorher === "verpasst")) && passt(c)).map(zeile);
    const zuletzt = calls.filter((c) => (c.s === "beendet" || (c.s === "laeuft" && c.vorher !== "verpasst")) && passt(c)).map(zeile);
    const nVerp = calls.filter((c) => c.s === "verpasst").length;
    // Anrufen: eine vollständige Nummer, die zu einem Anrufer gehört (frei wählen kann das Spiel noch nicht)
    const ziel = istNummer ? calls.find((c) => c.s !== "laeuft" && c.tel.replace(/\D/g, "") === ziffern && !c.ohneNummer) : null;
    const waehlen = () => { if (ziel) { app.rufe(ziel.id); this.setState({ such: "" }); } };
    this._nVerp = nVerp;
    return {
      ...g,
      such: st.such || "", suchEin: (e) => this.setState({ such: e && e.target ? e.target.value : "", sw: (st.sw || 0) + 1 }),
      suchTaste: (e) => { if (e && e.key === "Enter" && ziel) { if (e.preventDefault) e.preventDefault(); waehlen(); } },
      kannWaehlen: !!ziel, waehlen, waehlenTitel: ziel ? "Diese Nummer anrufen – das Gespräch läuft im Abfrage-Fenster" : "",
      welche: [["Alle", "Verpasste und angenommene Anrufe"], ["Verpasst", "Anrufe, die nie angenommen wurden"], ["Angenommen", "Leute, mit denen schon telefoniert wurde"]].map(([x, ti]) => ({ t: x, titel: ti, an: welche === x ? "true" : "false", cls: "seg" + (welche === x ? " on" : ""), klick: () => this.setState({ welche: x, sw: (st.sw || 0) + 1 }) })),
      zeigVerp: welche !== "Angenommen", zeigAng: welche !== "Verpasst", spaltenCls: "spalten" + (welche === "Alle" ? "" : " eins"),
      nVerpListe: String(verpasst.length), nAng: String(zuletzt.length),
      welcheIdx: String(["Alle", "Verpasst", "Angenommen"].indexOf(welche)), typIdx: String(["Alle", "RD", "KT", "SEK"].indexOf(typ)),
      typen: ["Alle", "RD", "KT", "SEK"].map((x) => ({ t: x, an: typ === x ? "true" : "false", cls: "seg" + (typ === x ? " on" : ""), klick: () => this.setState({ typ: x, sw: (st.sw || 0) + 1 }) })),
      hatLaeuft: !!laeuft, laeuftText: laeuft ? (laeuft.rueckruf ? "Rückruf " : "Gespräch ") + laeuft.tel + " läuft" : "", zurAbfrage: () => app.zurAbfrage(),
      verpasst, keinVerp: verpasst.length === 0,
      zuletzt, keinAng: zuletzt.length === 0, listeCls: "t-liste " + ((st.sw || 0) % 2 ? "swA" : "swB"),
    };
  }
}
