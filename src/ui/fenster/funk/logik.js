// Logik des Funk- und Chat-Fensters – aus dem Entwurf „Funk.dc.html“ übernommen.
// Statt der Beispiele im Entwurf kommen Daten und Aktionen aus dem Spiel (props.app, siehe index.ts).
/* eslint-disable */
import { DCLogic } from "../../entwurf/dclogic.js";

export class FunkLogik extends DCLogic {
  constructor(p) {
    super(p);
    this.state = {};
    this.verlaufRef = { current: null };
    this.chatRef = { current: null };
    this.eingabeRef = { current: null };
    this.chatEingabeRef = { current: null };
  }
  componentWillUnmount() {
    clearTimeout(this.tt);
  }
  /** kurzer Hinweis im Fenster (wie im Entwurf) */
  zeige(txt) {
    clearTimeout(this.tt);
    this.setState({ toast: txt });
    this.tt = setTimeout(() => this.setState({ toast: "" }), 2200);
  }
  renderVals() {
    const st = this.state || {};
    const app = this.props.app;
    const d = app.daten();
    const a = app.aktionen;
    const pilot = this.props.rolle === "pilot";
    const g = { breite: Number(this.props.breite) || 560, hoehe: Number(this.props.hoehe) || 1000 };
    // Ansicht: im Arbeitsplatz fest je Fenster (Reiter macht dockview), eingebettet (Pilot) über die eigenen Reiter
    const ansicht = (this.props.mitKopf ? st.ansicht : null) || this.props.ansicht || "funk";
    const modus = st.modus || d.modus || "sprechen";

    // ---- Sprechgruppen (aus dem Spiel: RD-NOE-03, beim Großeinsatz RD-NOE-09, beim zweiten RD-NOE-10)
    const GR = d.gruppen;
    const meine = d.meine;
    const grd = GR.find((x) => x.k === meine) || GR[0];
    const stumm = d.stumm || {};

    // ---- Verlauf: Gespräche mit ihren Funksprüchen
    const gespraeche = d.gespraeche.map((v) => ({
      cls: "gesp" + (stumm[v.gr] ? " stumm" : ""),
      tag: v.grKurz,
      tagCls: "tag" + (v.gs ? " gs" : ""),
      mit: v.mit,
      zeit: v.zeit,
      einsatz: v.einsatz,
      hatEinsatz: !!v.einsatz,
      titel: v.einsatz ? "Klick: " + v.einsatz + " markieren" : "",
      klick: () => v.einsatzId && a.waehle(v.einsatzId),
      sprueche: v.sprueche.map((s) => ({
        cls: "sp" + (s.leo ? " leo" : "") + (s.neu ? " neu" : ""),
        zeit: s.zeit,
        von: s.von,
        text: s.text,
        gesprochen: !!s.gesprochen,
        hatWer: !!s.wer,
        wer: s.wer || "",
      })),
    }));

    // ---- Anzeige am Gerät: wer spricht, ich sende / warte
    const an = d.anzeige;
    const ich = d.sende; // "sendet" | "wartet" | null
    const wartet = ich === "wartet";
    const wechsel = (dir) => () => {
      if (GR.length < 2) return;
      const neu = a.gruppeWeiter(dir);
      if (neu) this.zeige("Sprechgruppe " + neu.name + (neu.gs ? " · Großeinsatz" : ""));
    };

    const gruppen = GR.map((x) => ({
      cls: "gm" + (stumm[x.k] ? " stumm" : ""),
      name: x.kurz,
      istGs: x.gs,
      laut: !stumm[x.k],
      stumm: !!stumm[x.k],
      stummAn: stumm[x.k] ? "true" : "false",
      tonLabel: stumm[x.k] ? x.name + " wieder hören" : x.name + " stumm schalten (Text bleibt sichtbar)",
      ton: (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        a.stumm(x.k, !stumm[x.k]);
      },
    }));

    // ---- Chat
    const c = d.chat;
    const chatSenden = () => {
      const x = (this.state.chatEntwurf || "").trim();
      if (!x) return;
      this.setState({ chatEntwurf: "" });
      a.chatSenden(x);
    };
    const funkSenden = () => {
      const x = (this.state.entwurf || "").trim();
      if (!x) return;
      this.setState({ entwurf: "" });
      Promise.resolve(a.funkSenden(x)).then((ok) => {
        if (ok === false && !this.state.entwurf) this.setState({ entwurf: x });
      });
    };

    const reiter = [
      ["funk", "Funk", d.rufe, "bdg ruft", d.rufe + (d.rufe === 1 ? " Fahrzeug ruft" : " Fahrzeuge rufen")],
      ["chat", "Chat", ansicht === "chat" ? 0 : c.ungelesen, "bdg neu", c.ungelesen + (c.ungelesen === 1 ? " neue Nachricht" : " neue Nachrichten")],
    ].map(([k, tx, n, cl, ti]) => ({
      t: tx,
      cls: "tab" + (ansicht === k ? " on" : ""),
      an: ansicht === k ? "true" : "false",
      hatBdg: n > 0,
      bdg: String(n),
      bdgCls: cl,
      bdgTitel: ti,
      klick: () => {
        this.setState({ ansicht: k, hilfe: false });
        if (a.ansicht) a.ansicht(k);
      },
    }));
    const MODI = [["sprechen", "Sprechen"], ["text", "Text"]];
    const taste = d.taste;
    const eigen = d.eigenerName;
    const anderes = d.beispielFz;
    return {
      ...g,
      reiter,
      mitKopf: !!this.props.mitKopf,
      toast: st.toast || "",
      hatToast: !!st.toast,
      istFunk: ansicht === "funk",
      istChat: ansicht === "chat",
      fkCls: "fk " + modus,
      gruppen,
      dIch: ich === "sendet",
      pegelW: String(an.pegel || 0),
      gerGruppe: grd ? grd.name : "",
      gerFenster: !!an.kopf,
      gerFTitel: an.kopf || "",
      gerFZeile: an.zeile || "",
      gerFGruppe: an.gruppe || "",
      hhCls: "hh" + (GR.length > 1 ? " fg-mehr" : ""),
      hhPopCls: "hh-pop" + (ich ? (wartet ? " wartet" : " ich") : ""),
      hhPttCls: "hh-ptt" + (ich ? (wartet ? " wartet" : " an") : ""),
      fgCls: "fg" + (an.kopf ? " fg-aktiv" : "") + (GR.length > 1 ? " fg-mehr" : ""),
      fgLampeCls: "fg-lampe" + (an.lampe ? " an" : ""),
      fgStat: this.props.status || d.status,
      fgSeiteO: an.kopf ? "Option" : "KWlist",
      fgSeiteU: an.kopf ? "Ordner" : "▤",
      fgPopCls: "fg-pop" + (ich ? (wartet ? " wartet" : " ich") : ""),
      hatNeben: !!an.kopf && !!an.neben,
      fgNeben: an.neben || "",
      keinFunk: gespraeche.length === 0,
      grLinks: wechsel(-1),
      grRechts: wechsel(1),
      kreuzTitel: GR.length > 1 ? "Steuerkreuz links/rechts: Sprechgruppe wechseln (" + GR.map((x) => x.name).join(", ") + ")" : "Steuerkreuz links/rechts: Sprechgruppe wechseln (gerade gibt es nur " + (grd ? grd.name : "eine") + ")",
      gespraeche,
      verlaufRef: this.verlaufRef,
      chatRef: this.chatRef,
      eingabeRef: this.eingabeRef,
      chatEingabeRef: this.chatEingabeRef,
      bildGeraet: d.bildGeraet,
      bildHand: d.bildHand,
      istSprechen: modus === "sprechen",
      istText: modus === "text",
      modi: MODI.map(([k, tx]) => ({
        t: tx,
        cls: "seg" + (modus === k ? " on" : ""),
        an: modus === k ? "true" : "false",
        klick: () => {
          this.setState({ modus: k });
          a.modus(k);
          if (k === "text") setTimeout(() => this.eingabeRef.current && this.eingabeRef.current.focus(), 30);
        },
      })),
      modusIdx: modus === "text" ? "1" : "0",
      pttCls: "fg-ptt" + (ich ? (wartet ? " wartet" : " an") : ""),
      pttGedrueckt: ich ? "true" : "false",
      pttAn: (e) => a.pttAn(e),
      entwurf: st.entwurf || "",
      entwurfEin: (e) => {
        this.setState({ entwurf: e && e.target ? e.target.value : "" });
        a.tippt();
      },
      entwurfTaste: (e) => {
        if (e && e.key === "Enter") funkSenden();
      },
      funkSenden,
      hilfeOffen: !!st.hilfe,
      hilfeAn: st.hilfe ? "true" : "false",
      hilfeKlick: () => this.setState({ hilfe: !st.hilfe }),
      taste,
      istLst: !pilot,
      hGruppen:
        "Sprechgruppe wechseln: Steuerkreuz am Funkgerät links/rechts. Normal ist es " +
        d.grundName +
        ", beim Großeinsatz kommt RD-NOE-09 dazu, bei einem zweiten gleichzeitig RD-NOE-10. Die anderen Gruppen hörst du leiser; der Lautsprecher-Knopf über dem Verlauf schaltet eine Gruppe stumm (der Text bleibt).",
      hRufen: pilot
        ? "Rufen: „LEO von " + eigen + ", kommen“ – zu einem Fahrzeug: „" + anderes + " von " + eigen + ", kommen“. Alle im Spiel hören mit."
        : "Rufen: „" + anderes + " von LEO, kommen“ (auch „NEF Krems …“) – danach ohne Rufnamen weiter, es gilt das zuletzt gerufene Fahrzeug.",
      hAntw: pilot ? "Antworten, wenn du gerufen wirst: „Hier " + eigen + ", kommen“." : "Antworten, wenn ein Fahrzeug ruft: „Hier LEO, kommen“.",
      phSpruch: pilot ? "Funkspruch … z. B. „LEO von " + eigen + ", kommen“" : "Funkspruch … z. B. „" + anderes + " von LEO, kommen“",
      leerFunk: pilot ? "Selbst rufen: „LEO von " + eigen + ", kommen“ – tippen oder " + taste + " halten." : "Selbst rufen: „" + anderes + " von LEO, kommen“ – tippen oder " + taste + " halten.",
      personen: c.personen.map((p) => ({ name: p.name, cls: "person" + (p.weg ? " weg" : ""), titel: p.titel })),
      nachrichten: c.nachrichten.map((m) => ({
        cls: "msg" + (m.ich ? " ich" : "") + (m.neu ? " neu" : ""),
        von: m.ich ? "Du" : m.von,
        zeit: m.zeit,
        text: m.text,
        hatBezug: false,
        bezug: "",
        bezugKlick: () => {},
      })),
      chatLeer: c.nachrichten.length === 0,
      chatLeerText: c.leerText,
      phChat: "Nachricht an alle Disponenten …",
      chatEntwurf: st.chatEntwurf || "",
      chatEin: (e) => this.setState({ chatEntwurf: e && e.target ? e.target.value : "" }),
      chatTaste: (e) => {
        if (e && e.key === "Enter") chatSenden();
      },
      chatSenden,
    };
  }
}
