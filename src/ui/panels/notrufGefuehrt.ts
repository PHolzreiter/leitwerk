/**
 * Geführte Notruf-Abfrage: die nächste Frage groß, darunter bleiben die beantworteten Fragen stehen
 * (die neueste oben, die erste ganz unten) – je eine Zeile mit der gewählten Antwort; ein Klick klappt
 * alle Antworten zum Ändern auf. Das Protokoll als Sätze steht nur beim Einsatz.
 *
 * Reihenfolge: Ort → Rückrufnummer → Wer ruft an → Bewusstsein/Atmung → Was ist passiert (Kapitel)
 * → Primärabfrage und Kapitelfragen → Abschluss.
 *
 * Tasten: 1–9 Antwort · Leertaste stellt die Frage · Enter weiter/überspringen · ↑ zurück · ↓ vor
 */
import { sprechFrage } from "../../abfrage/sprechfrage";
import { store } from "../../data/store";
import { antwortLabel, fragenImAblauf, istKreislaufstillstand, type Frage, type Schema, type Wert } from "../../abfrage/schema";
import { kapitelZuThema } from "../../abfrage/themen";
import { sim, type Einsatz } from "../../sim/engine";
import { el, esc, toast } from "../dom";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

export interface GefuehrtKontext {
  e: Einsatz;
  /** Frage an den Anrufer stellen (Text, Frage aus dem Schema) */
  stelle(text: string, f?: Frage): Promise<void>;
  /** Eingabe des Einsatzorts (Adresse, Karte, Genannte, Ortung) */
  ortFeld(f: Frage): HTMLElement;
  /** Zusatzinfos zum Ort (Stiege, Stock …) */
  zusatzFeld(): HTMLInputElement;
  /** angezeigte Rufnummer des Anrufers */
  angezeigt(): string;
  /** Code-Auswahl bei Kapitel 42 (andere Leitstelle) */
  code42(darf: boolean): HTMLElement;
  /** Aufwertung, Zusatzkennung, Polizei – null wenn das Kapitel nichts davon hat */
  abschluss(darf: boolean): HTMLElement | null;
  /** führe ich das Gespräch? */
  darf(): boolean;
}

type Art = "ort" | "zusatz" | "rueckruf" | "frage" | "was" | "code42";
interface Schritt {
  id: string;
  art: Art;
  frage: Frage | null;
  /** Überschrift über der Frage (Abschnitt) */
  teil: string;
}

/** Fragen nach Bewusstsein und Atmung */
function istBwAt(f: Frage): boolean {
  return f.id === "bw" || f.id === "at" || (f.typ === "single" && /(wach|ansprechbar|bewusst|atmet|atmung)/i.test(f.text));
}

/** „Wer ruft an?“ / „Sind Sie beim Patienten?“ */
function istWer(f: Frage): boolean {
  return f.typ === "single" && (f.id === "anrufer" || /wer ruft|beim patient|sind sie (selbst|der patient)/i.test(f.text));
}

function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

/** Alltagsworte des Anrufers → Thema (Kapitel im geladenen Codesystem über das Thema) */
const ALLTAG: [RegExp, string][] = [
  [/bauch|magen|erbrech|kotz|übel/, "bauch"],
  [/allerg|wespe|biene|quaddel|ausschlag|anaphyl|geschwollen/, "allergie"],
  [/gebissen|biss|hund/, "tierbiss"],
  [/geschlagen|schlägerei|rauferei|überfall|prügel|verprügelt|angegriffen/, "gewalt"],
  [/rücken|kreuzweh|bandscheib|hexenschuss/, "ruecken"],
  [/luft|atemnot|atmet schwer|keucht|asthma|schnauft/, "atemnot"],
  [/brand|brennt|feuer|verbrannt|verbrüh|explosion/, "brand"],
  [/\bgas\b|gasgeruch|rauch|chemikal|kohlenmonoxid/, "gefahrstoff"],
  [/reanim|leblos|\btot\b|atmet nicht|kein puls|herzstillstand/, "stillstand"],
  [/brust|infarkt|herzinfarkt/, "brustschmerz"],
  [/verschluckt|erstick|steckt im hals|bonbon/, "ersticken"],
  [/krampf|zuckt|epilep|anfall/, "krampf"],
  [/zucker|diabet|insulin/, "zucker"],
  [/ertrunk|ertrink|im wasser|pool|schwimm/, "wasser"],
  [/strom|elektr/, "strom"],
  [/\baug/, "auge"],
  [/gestürzt|sturz|gefallen|hingefallen|ausgerutscht|gestolpert|leiter|stiege runter/, "sturz"],
  [/kopfweh|kopfschmerz|migräne/, "kopfschmerz"],
  [/herzrasen|herzstolpern|herzklopfen|puls/, "herz"],
  [/hitze|sonnenstich|unterkühl|erfror|kälte/, "hitze_kaelte"],
  [/blut|schnitt|nasenbluten/, "blutung"],
  [/eingeklemmt|eingeschlossen|eingesperrt|steckt fest/, "eingeklemmt"],
  [/tablette|vergift|überdos|drogen|betrunken|besoffen|alkohol|pilze/, "vergiftung"],
  [/schwanger|wehen|geburt|fruchtblase|entbind/, "schwangerschaft"],
  [/suizid|selbstmord|umbringen|depress|psych|panikattacke/, "psych"],
  [/krank|schwach|unwohl|schwindl|geht.{0,12}schlecht/, "krank"],
  [/messer|stich|geschossen|schuss/, "stich_schuss"],
  [/schlaganfall|gelähmt|lähmung|verwaschen|mundwinkel|kann nicht (mehr )?reden/, "schlaganfall"],
  [/unfall|\bauto|pkw|lkw|motorrad|radfahrer|zusammensto|kollision|angefahren/, "verkehrsunfall"],
  [/verletzt|(?<!zusammen)gebrochen|bruch|verstaucht|verdreht|wunde/, "verletzung"],
  [/bewusstlos|ohnmächtig|umgekippt|kollab|zusammengebrochen|zusammengesackt|reagiert nicht/, "bewusstlos"],
  [/fieber|grippe|husten|infekt|corona/, "infekt"],
];

const FUELLWORTE = new Set(["der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "und", "oder", "ist", "sind", "hat", "haben", "war", "wird", "mit", "auf", "bei", "von", "vom", "zum", "zur", "aus", "nach", "sich", "sie", "ihr", "ihm", "ihn", "mein", "meine", "meiner", "nicht", "kein", "keine", "sehr", "ganz", "jetzt", "gerade", "hier", "dort", "plötzlich", "seit", "stunde", "stunden", "minuten", "mann", "frau", "kind", "patient", "patientin", "mutter", "vater", "oma", "opa", "nachbar", "nachbarin", "bitte", "schnell", "glaub", "glaube", "irgendwie", "einfach", "auch", "noch", "schon"]);

/** Kapitel passend zum Freitext „Was ist passiert?“ – nach Anzahl der Treffer */
export function kapitelZumText(schema: Schema, text: string): { kapitel: string; titel: string; punkte: number }[] {
  const roh = text.toLowerCase();
  const woerter = norm(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => (w.length >= 4 && !FUELLWORTE.has(w)) || /^\d+$/.test(w));
  const punkte = new Map<string, number>();
  const dazu = (kap: string, p: number) => punkte.set(kap, (punkte.get(kap) ?? 0) + p);
  // Alltagsworte über das Thema
  for (const [re, t] of ALLTAG) {
    if (!re.test(roh)) continue;
    const kap = kapitelZuThema(t, schema);
    if (kap && schema.kapitel[kap]) dazu(kap, 4);
  }
  for (const k of Object.values(schema.kapitel)) {
    const titel = norm(k.titel);
    const stich = k.stichworte.map(norm);
    for (const w of woerter) {
      if (w === norm(k.kapitel)) dazu(k.kapitel, 5);
      else if (titel.includes(w)) dazu(k.kapitel, 3);
      else if (stich.some((s) => s.includes(w) || (s.length >= 5 && w.includes(s)))) dazu(k.kapitel, 2);
      else if (w.length >= 6 && (titel.includes(w.slice(0, 5)) || stich.some((s) => s.startsWith(w.slice(0, 5))))) dazu(k.kapitel, 1);
    }
  }
  return [...punkte.entries()]
    .map(([kapitel, p]) => ({ kapitel, titel: schema.kapitel[kapitel]?.titel ?? "", punkte: p }))
    .sort((a, b) => b.punkte - a.punkte);
}

export function gefuehrteAbfrage(ctx: GefuehrtKontext): { el: HTMLElement; refresh(): void; dispose(): void } {
  const { e } = ctx;
  const root = el("div", { class: "gf" });
  /** ausdrücklich gewählte Frage (↑) – sonst die erste offene */
  let aktuell: string | null = null;
  /** übersprungene Fragen (nur hier in der Ansicht) */
  const uebersprungen = new Set<string>();
  /** aufgeklappte alte Fragen (alle Antworten sichtbar) */
  const offen = new Set<string>();
  /** Suche in langen Antwortlisten und im Freitext „Was ist passiert?“ (bleibt beim Neuaufbau) */
  let suche = "";
  let wasText = "";
  let schluessel = "";

  // ---------------------------------------------------------------- Schritte

  function schritte(schema: Schema): Schritt[] {
    const a = e.anruf!;
    const g = schema.globale_fragen;
    const p3 = g.phase_3_was_ist_passiert ?? [];
    const p4 = g.phase_4_primaerabfrage ?? [];
    const out: Schritt[] = [];
    const ids = new Set<string>();
    const dazu = (s: Schritt) => {
      if (ids.has(s.id)) return;
      ids.add(s.id);
      out.push(s);
    };
    for (const f of g.phase_1_einsatzort ?? []) {
      if (f.id === "ort_adresse") dazu({ id: f.id, art: "ort", frage: f, teil: "Einsatzort" });
      else if (f.id === "ort_zusatz" || /zusatz/i.test(f.id)) dazu({ id: f.id, art: "zusatz", frage: f, teil: "Einsatzort" });
      else dazu({ id: f.id, art: "frage", frage: f, teil: "Einsatzort" });
    }
    for (const f of g.phase_2_rueckruf ?? [])
      dazu({ id: f.id, art: f.typ === "text" && (f.id === "rueckrufnummer" || /nummer|rückruf|erreichbar/i.test(f.text)) ? "rueckruf" : "frage", frage: f, teil: "Rückrufnummer" });
    for (const f of p3.filter(istWer)) dazu({ id: f.id, art: "frage", frage: f, teil: "Anrufer" });
    for (const f of p4.filter(istBwAt)) dazu({ id: f.id, art: "frage", frage: f, teil: "Bewusstsein und Atmung" });
    for (const f of p3) if (!istWer(f) && f.typ !== "text" && f.typ !== "kapitelwahl") dazu({ id: f.id, art: "frage", frage: f, teil: "Was ist passiert?" });
    dazu({ id: "__was", art: "was", frage: p3.find((f) => f.typ === "text") ?? null, teil: "Was ist passiert?" });
    if (!a.kapitel) return out;
    if (a.kapitel === "42") {
      dazu({ id: "__code42", art: "code42", frage: null, teil: "Code wählen (Anforderung durch andere Leitstelle)" });
      return out;
    }
    for (const { phase, frage } of fragenImAblauf(schema, a.kapitel, a.antworten)) dazu({ id: frage.id, art: "frage", frage, teil: phase });
    return out;
  }

  function beantwortet(s: Schritt): boolean {
    const a = e.anruf!;
    switch (s.art) {
      case "ort":
        return !!e.adresse;
      case "zusatz":
        return !!e.zusatz.trim();
      case "rueckruf":
        return !!e.telefon || (s.frage ? a.antworten[s.frage.id] !== undefined && a.antworten[s.frage.id] !== null : false);
      case "was":
        return !!a.kapitel;
      case "code42":
        return !!e.code;
      default:
        return a.antworten[s.id] !== undefined && a.antworten[s.id] !== null;
    }
  }

  const erledigt = (s: Schritt) => beantwortet(s) || uebersprungen.has(s.id);

  function aktuellerSchritt(liste: Schritt[]): Schritt | null {
    if (aktuell) {
      const s = liste.find((x) => x.id === aktuell);
      if (s) return s;
      aktuell = null;
    }
    return liste.find((s) => !erledigt(s)) ?? null;
  }

  /** zur nächsten offenen Frage (nach einer Antwort) */
  function weiter(): void {
    aktuell = null;
    offen.clear();
    suche = "";
    neu();
  }

  function setze(id: string, wert: Wert): void {
    uebersprungen.delete(id);

    fehler(sim.call("abfrageSetze", e.id, id, wert));
  }

  // ---------------------------------------------------------------- gewählte Antwort (kurz)

  function antwortKurz(s: Schritt): string {
    const a = e.anruf!;
    const schema = store.schema!;
    switch (s.art) {
      case "ort":
        return e.adresse?.label ?? "–";
      case "zusatz":
        return e.zusatz;
      case "rueckruf":
        return e.telefon || String(a.antworten[s.id] ?? "");
      case "was": {
        const K = a.kapitel ? schema.kapitel[a.kapitel] : null;
        const t = s.frage ? a.antworten[s.frage.id] : null;
        return `Kapitel ${a.kapitel} ${K?.titel ?? ""}${t ? ` – „${t}“` : ""}`;
      }
      case "code42":
        return `Code ${e.code}`;
      default: {
        const f = s.frage!;
        return antwortLabel(f, a.antworten[f.id]);
      }
    }
  }

  // ---------------------------------------------------------------- Aufbau

  function neu(): void {
    schluessel = "";
    refresh();
  }

  function frageStellen(s: Schritt): void {
    const a = e.anruf;
    if (!a || a.status !== "aktiv" || !ctx.darf()) return;
    const erste = !a.gespraech.some((m) => m.von === "leitstelle");
    if (s.frage) void ctx.stelle(sprechFrage(s.frage, store.schema, a.antworten, { erste }), s.frage);
    else if (s.art === "code42") void ctx.stelle("Welches Einsatzmittel brauchen Sie, und wohin?");
  }

  function bauen(): void {
    const a = e.anruf;
    const schema = store.schema;
    root.innerHTML = "";
    if (!a || !schema || (a.status !== "aktiv" && a.status !== "gehalten" && a.status !== "beendet")) return;
    const darf = ctx.darf();
    const aktiv = a.status === "aktiv" && darf;
    const liste = schritte(schema);
    const s = aktuellerSchritt(liste);

    // Kreislaufstillstand: sofort sichtbar
    if (istKreislaufstillstand(a.antworten) && a.kapitel !== kapitelZuThema("stillstand", schema)) {
      const ks = el("div", { class: "reanimation gf-alarm" });
      ks.append(el("span", {}, "⚠ Bewusstlos und keine Atmung: Kreislaufstillstand – Reanimation anleiten! "));
      const kap = kapitelZuThema("stillstand", schema);
      if (kap && schema.kapitel[kap] && darf) {
        const b = el("button", { class: "btn small primary", type: "button" }, `Kapitel ${kap} wählen`);
        b.addEventListener("click", () => {
          aktuell = null;
          fehler(sim.call("abfrageSetze", e.id, "kapitel", kap));
        });
        ks.appendChild(b);
      }
      root.appendChild(ks);
    }

    // ---- Karte mit der aktuellen Frage
    if (s) root.appendChild(frageKarte(s, liste, darf, aktiv));
    else {
      const fertig = el("div", { class: "gf-karte gf-fertig" });
      fertig.append(el("div", { class: "gf-teil" }, "Abfrage"), el("div", { class: "gf-frage" }, a.kapitel ? "✓ Alle Fragen beantwortet" : "Kapitel fehlt noch"));
      const ab = a.kapitel && a.kapitel !== "42" ? ctx.abschluss(darf) : null;
      if (ab) fertig.appendChild(ab);
      root.appendChild(fertig);
    }

    // ---- darunter die schon beantworteten (und übersprungenen) Fragen: die neueste oben, die erste ganz unten
    const alt = el("div", { class: "gf-alte" });
    for (const x of [...liste].reverse()) {
      if (x === s) continue;
      const ja = beantwortet(x);
      if (!ja && !uebersprungen.has(x.id)) continue;
      alt.appendChild(alteFrage(x, ja, darf));
    }
    if (alt.childElementCount) root.appendChild(alt);
    fokusSetzen();
  }

  /** beantwortete Frage: eine Zeile mit der gewählten Antwort; Klick klappt alle Antworten zum Ändern auf */
  function alteFrage(x: Schritt, ja: boolean, darf: boolean): HTMLElement {
    const box = el("div", { class: `gf-alt${ja ? "" : " ohne"}${offen.has(x.id) ? " offen" : ""}` });
    box.dataset.alt = x.id;
    const kopf = el("button", { class: "gf-alt-kopf", type: "button", title: offen.has(x.id) ? "Zuklappen" : "Antwort ändern" });
    const text = x.art === "was" ? "Was ist passiert?" : x.art === "code42" ? "Code" : (x.frage?.text ?? x.teil);
    kopf.append(el("span", { class: "gf-alt-frage" }, text), el("span", { class: "gf-alt-antwort" }, ja ? antwortKurz(x) : "nicht gefragt"));
    kopf.addEventListener("click", () => {
      if (offen.has(x.id)) offen.delete(x.id);
      else offen.add(x.id);
      neu();
    });
    box.appendChild(kopf);
    if (offen.has(x.id)) {
      const body = el("div", { class: "gf-antwort" });
      body.appendChild(antwortFeld(x, darf));
      box.appendChild(body);
    }
    return box;
  }

  /** Eingabe für eine Frage (aktuelle Karte oder aufgeklappte alte Frage) */
  function antwortFeld(s: Schritt, darf: boolean): HTMLElement {
    const a = e.anruf!;
    const schema = store.schema!;
    const f = s.frage;
    if (s.art === "ort" && f) return ctx.ortFeld(f);
    if (s.art === "zusatz") {
      const inp = ctx.zusatzFeld();
      inp.classList.add("gf-feld");
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          inp.dispatchEvent(new Event("change"));
          if (!inp.value.trim()) uebersprungen.add(s.id);
          weiter();
        }
      });
      return inp;
    }
    if (s.art === "rueckruf") return rueckrufFeld(s, darf);
    if (s.art === "was") return wasFeld(s, schema, darf);
    if (s.art === "code42") return ctx.code42(darf);
    if (f?.typ === "single") return optionen(f, a.antworten[f.id], darf);
    if (f?.typ === "zahl") return zahlFeld(f, a.antworten[f.id], darf);
    if (f?.typ === "text") return textFeld(f, a.antworten[f.id], darf);
    return el("div");
  }

  function frageKarte(s: Schritt, liste: Schritt[], darf: boolean, aktiv: boolean): HTMLElement {
    const karte = el("div", { class: "gf-karte" });
    karte.dataset.id = s.id;
    const i = liste.indexOf(s);
    const kopf = el("div", { class: "gf-teil" });
    kopf.append(el("span", {}, s.teil), el("span", { class: "muted" }, `Frage ${i + 1}`));
    karte.appendChild(kopf);

    const zeile = el("div", { class: "gf-frage-zeile" });
    const text = s.art === "was" ? "Was ist passiert?" : s.art === "code42" ? "Welcher Code? (keine Abfrage bei Anforderung durch andere Leitstelle)" : (s.frage?.text ?? "");
    zeile.appendChild(el("div", { class: "gf-frage" }, text));
    if (aktiv && (s.frage || s.art === "code42")) {
      const q = el("button", { class: "btn small gf-stellen", type: "button", title: "Dem Anrufer diese Frage stellen (Leertaste)" }, "🗨 Fragen");
      q.addEventListener("click", () => frageStellen(s));
      zeile.appendChild(q);
    }
    karte.appendChild(zeile);
    if (s.frage?.hinweis) karte.appendChild(el("div", { class: "frage-hinweis" }, s.frage.hinweis));

    const body = el("div", { class: "gf-antwort" });
    body.appendChild(antwortFeld(s, darf));
    karte.appendChild(body);

    // ---- unten: zurück / weiter
    const nav = el("div", { class: "gf-nav" });
    const zurueck = el("button", { class: "btn small", type: "button", title: "Vorige Frage (↑)" }, "← zurück");
    zurueck.disabled = i <= 0;
    zurueck.addEventListener("click", () => schritt(-1));
    const ja = beantwortet(s);
    const vor = el("button", { class: `btn small${ja ? " primary" : ""}`, type: "button", title: ja ? "Zur nächsten offenen Frage (Enter)" : "Frage auslassen (Enter)" }, ja ? "weiter →" : "überspringen →");
    vor.addEventListener("click", () => ueberspringen(s));
    nav.append(zurueck, el("span", { class: "spacer" }), vor);
    karte.appendChild(nav);
    return karte;
  }

  function ueberspringen(s: Schritt): void {
    if (!beantwortet(s)) uebersprungen.add(s.id);
    weiter();
  }

  /** eine Frage vor oder zurück (auch auf beantwortete) */
  function schritt(r: 1 | -1): void {
    const schema = store.schema;
    if (!schema || !e.anruf) return;
    const liste = schritte(schema);
    const s = aktuellerSchritt(liste);
    const i = s ? liste.indexOf(s) : liste.length;
    const j = Math.max(0, Math.min(liste.length - 1, i + r));
    if (!s && r === 1) return;
    aktuell = liste[j]?.id ?? null;
    suche = "";
    neu();
  }

  // ---------------------------------------------------------------- Antwortfelder

  function optionen(f: Frage, wert: Wert | undefined, darf: boolean): HTMLElement {
    const box = el("div", { class: "gf-optionen-box" });
    const alle = f.optionen ?? [];
    const lang = alle.length > 8;
    const knoepfe = el("div", { class: `gf-optionen${lang ? " lang" : ""}` });
    const zeigen = () => {
      knoepfe.innerHTML = "";
      const q = norm(suche.trim());
      const sicht = q ? alle.filter((o) => norm(o.label).includes(q)) : alle;
      sicht.forEach((o, i) => {
        const b = el("button", { class: `gf-opt${wert === o.wert ? " gewaehlt" : ""}`, type: "button" });
        if (i < 9) b.appendChild(el("span", { class: "gf-taste" }, String(i + 1)));
        b.appendChild(el("span", {}, o.label));
        b.disabled = !darf;
        b.addEventListener("click", () => {
          setze(f.id, o.wert);
          weiter();
        });
        knoepfe.appendChild(b);
      });
      if (!sicht.length) knoepfe.appendChild(el("div", { class: "muted small" }, "Nichts gefunden."));
    };
    if (lang) {
      // lange Listen (#224): Suchfeld – tippen filtert, Enter nimmt den ersten Treffer
      const such = el("input", { type: "search", class: "gf-suche", placeholder: `${alle.length} Antworten – tippen zum Suchen, Enter nimmt die erste` });
      such.value = suche;
      such.disabled = !darf;
      such.addEventListener("input", () => {
        suche = such.value;
        zeigen();
      });
      such.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          knoepfe.querySelector<HTMLButtonElement>(".gf-opt")?.click();
        } else if (ev.key === "Escape" || ev.key === "ArrowUp" || ev.key === "ArrowDown") {
          ev.preventDefault();
          such.blur();
        }
      });
      box.appendChild(such);
    }
    zeigen();
    box.appendChild(knoepfe);
    return box;
  }

  function zahlFeld(f: Frage, wert: Wert | undefined, darf: boolean): HTMLElement {
    const box = el("div", { class: "gf-optionen" });
    const inp = el("input", { type: "number", min: "0", max: "120", class: "zahl gf-feld", placeholder: "Zahl, Enter" });
    inp.value = typeof wert === "number" ? String(wert) : "";
    inp.disabled = !darf;
    const nehmen = () => {
      if (inp.value === "") return false;
      setze(f.id, Number(inp.value));
      return true;
    };
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (nehmen() || wert !== undefined) weiter();
      }
    });
    inp.addEventListener("change", () => void nehmen());
    const unb = el("button", { class: `gf-opt${wert === "unbekannt" ? " gewaehlt" : ""}`, type: "button" });
    unb.append(el("span", { class: "gf-taste" }, "1"), el("span", {}, "unbekannt"));
    unb.disabled = !darf;
    unb.addEventListener("click", () => {
      setze(f.id, "unbekannt");
      weiter();
    });
    box.append(inp, unb);
    return box;
  }

  function textFeld(f: Frage, wert: Wert | undefined, darf: boolean): HTMLElement {
    const inp = el("input", { type: "text", class: "text gf-feld", placeholder: "Antwort, Enter" });
    inp.value = typeof wert === "string" ? wert : "";
    inp.disabled = !darf;
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        const v = inp.value.trim();
        if (v) setze(f.id, v);
        else uebersprungen.add(f.id);
        weiter();
      }
    });
    inp.addEventListener("change", () => inp.value.trim() && setze(f.id, inp.value.trim()));
    return inp;
  }

  /** Rückrufnummer (#225): Feld = Rückrufnummer des Einsatzes; Knopf/Einfg fügt die angezeigte Nummer ein */
  function rueckrufFeld(s: Schritt, darf: boolean): HTMLElement {
    const box = el("div", { class: "gf-rueckruf" });
    const inp = el("input", { type: "tel", class: "text gf-feld", placeholder: "Nummer, Enter" });
    inp.value = e.telefon || String(e.anruf?.antworten[s.id] ?? "");
    inp.disabled = !darf;
    const nehmen = () => {
      const v = inp.value.trim();
      if (!v || v === e.telefon) return;
  
      fehler(sim.call("aktualisiere", e.id, { telefon: v }));
      if (s.frage) setze(s.frage.id, v);
    };
    const einfuegen = () => {
      inp.value = ctx.angezeigt();
      inp.focus();
    };
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Insert") {
        ev.preventDefault();
        einfuegen();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        nehmen();
        if (!inp.value.trim()) uebersprungen.add(s.id);
        weiter();
      }
    });
    inp.addEventListener("change", nehmen);
    const b = el("button", { class: "btn small", type: "button", title: "Angezeigte Rufnummer einfügen (Taste Einfg)" }, `⤵ ${ctx.angezeigt()}`);
    b.disabled = !darf;
    b.addEventListener("click", einfuegen);
    box.append(inp, b);
    if (!e.telefon) box.appendChild(el("div", { class: "muted small gf-hinweis" }, "Ohne Rückrufnummer ist kein Rückruf möglich."));
    return box;
  }

  /** „Was ist passiert?“ (#227): Freitext, darunter die passenden Kapitel – Enter nimmt das erste */
  function wasFeld(s: Schritt, schema: Schema, darf: boolean): HTMLElement {
    const a = e.anruf!;
    const box = el("div", { class: "gf-was" });
    if (a.kapitel) {
      const K = schema.kapitel[a.kapitel];
      const chip = el("div", { class: "kapitel-chip" });
      chip.innerHTML = `<b>${esc(a.kapitel)}</b> ${esc(K?.titel ?? "")}`;
      if (darf) {
        const x = el("button", { class: "btn small", type: "button" }, "anderes Kapitel");
        x.addEventListener("click", () => {
          wasText = String((s.frage && a.antworten[s.frage.id]) ?? "");
          aktuell = s.id;
          fehler(sim.call("abfrageSetze", e.id, "kapitel", null));
        });
        chip.appendChild(x);
      }
      box.appendChild(chip);
      return box;
    }
    const inp = el("input", { type: "text", class: "text gf-feld gf-was-feld", placeholder: "Worte des Anrufers – z. B. „Schmerzen in der Brust“, „gestürzt“ – Enter nimmt das erste Kapitel" });
    inp.value = wasText || String((s.frage && a.antworten[s.frage.id]) ?? "");
    inp.disabled = !darf;
    const liste = el("div", { class: "kapitel-liste gf-kapitel" });
    let alleZeigen = false;
    const waehlen = (kap: string) => {
      const t = inp.value.trim();
      if (s.frage && t) fehler(sim.call("abfrageSetze", e.id, s.frage.id, t));
      wasText = "";
      aktuell = null;
      offen.clear();
      suche = "";
  
      fehler(sim.call("abfrageSetze", e.id, "kapitel", kap));
    };
    const zeigen = () => {
      liste.innerHTML = "";
      const t = inp.value.trim();
      const treffer = t && !alleZeigen ? kapitelZumText(schema, t).slice(0, 8) : Object.values(schema.kapitel).map((k) => ({ kapitel: k.kapitel, titel: k.titel, punkte: 0 }));
      treffer.forEach((k, i) => {
        const b = el("button", { class: `kapitel-opt${i === 0 && t && !alleZeigen ? " erster" : ""}`, type: "button" });
        b.innerHTML = `<b>${esc(k.kapitel)}</b> ${esc(k.titel)}`;
        b.title = schema.kapitel[k.kapitel]?.stichworte.join(", ") ?? "";
        b.disabled = !darf;
        b.addEventListener("click", () => waehlen(k.kapitel));
        liste.appendChild(b);
      });
      if (t && !treffer.length) liste.appendChild(el("div", { class: "muted small" }, "Kein Kapitel passt zu diesen Worten – anders formulieren oder alle Kapitel zeigen."));
      alle.textContent = alleZeigen ? "nur passende" : "alle Kapitel";
    };
    const alle = el("button", { class: "btn small", type: "button" }, "alle Kapitel");
    alle.addEventListener("click", () => {
      alleZeigen = !alleZeigen;
      zeigen();
    });
    inp.addEventListener("input", () => {
      wasText = inp.value;
      alleZeigen = false;
      zeigen();
    });
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        const b = liste.querySelector<HTMLButtonElement>(".kapitel-opt.erster");
        if (b && !b.disabled) b.click();
      } else if ((ev.key === " " || ev.code === "Space") && !inp.value.trim()) {
        // leeres Feld: Leertaste stellt die Frage
        ev.preventDefault();
        frageStellen(s);
      } else if (ev.key === "ArrowUp" || ev.key === "Escape") {
        ev.preventDefault();
        inp.blur();
        if (ev.key === "ArrowUp") schritt(-1);
      }
    });
    const zeile = el("div", { class: "row-btns" });
    zeile.append(inp, alle);
    box.append(zeile, liste);
    zeigen();
    return box;
  }

  // ---------------------------------------------------------------- Fokus und Tasten

  /** Eingabefeld der aktuellen Frage gleich aktiv (nicht, wenn gerade woanders getippt wird) */
  function fokusSetzen(): void {
    const feld = root.querySelector<HTMLInputElement>(".gf-karte input.gf-feld, .gf-karte input.gf-suche, .gf-karte .adr-zeile input");
    const akt = document.activeElement as HTMLElement | null;
    const tipptWoanders = !!akt && akt !== feld && !root.contains(akt) && (akt.tagName === "INPUT" || akt.tagName === "TEXTAREA" || akt.tagName === "SELECT" || akt.isContentEditable);
    if (feld && !feld.disabled && !tipptWoanders && root.offsetParent) feld.focus({ preventScroll: true });
  }

  const taste = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !root.isConnected || !root.offsetParent || !ctx.darf()) return;
    const t = ev.target as HTMLElement | null;
    const karte = root.querySelector<HTMLElement>(".gf-karte[data-id]");
    const schema = store.schema;
    if (!karte || !schema || !e.anruf) return;
    const s = schritte(schema).find((x) => x.id === karte.dataset.id);
    if (!s) return;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
      if (!root.contains(t)) return;
      // Zahl/Suche: Leertaste stellt die Frage, ↑ zurück
      const zahl = t.classList.contains("zahl") || t.classList.contains("gf-suche");
      if (zahl && (ev.key === " " || ev.code === "Space") && !(t as HTMLInputElement).value.trim()) {
        ev.preventDefault();
        frageStellen(s);
      } else if (zahl && ev.key === "ArrowUp") {
        ev.preventDefault();
        (t as HTMLInputElement).blur();
        schritt(-1);
      }
      return;
    }
    if (/^[1-9]$/.test(ev.key)) {
      const b = [...karte.querySelectorAll<HTMLButtonElement>(".gf-opt")][Number(ev.key) - 1];
      if (b && !b.disabled) {
        ev.preventDefault();
        b.click();
      }
    } else if (ev.key === " " || ev.code === "Space" || ev.key === "f" || ev.key === "F") {
      ev.preventDefault();
      frageStellen(s);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      ueberspringen(s);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      schritt(-1);
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      schritt(1);
    }
  };
  document.addEventListener("keydown", taste);

  function refresh(): void {
    const a = e.anruf;
    if (!a) return;
    // nur neu aufbauen, wenn sich eine Antwort (oder die Auswahl) geändert hat – das passiert nicht beim Tippen
    const k = JSON.stringify([a.status, a.kapitel, a.antworten, a.extra, ctx.darf(), e.adresse?.label, e.zusatz, e.telefon, e.code, aktuell, [...uebersprungen], [...offen]]);
    if (k === schluessel) return;
    schluessel = k;
    // Ansicht nicht springen lassen
    const scroller: [HTMLElement, number][] = [];
    for (let x = root.parentElement; x && !x.classList.contains("lw-panel"); x = x.parentElement) if (x.scrollTop) scroller.push([x, x.scrollTop]);
    bauen();
    for (const [x, top] of scroller) x.scrollTop = top;
  }

  // nach dem Verlassen eines Felds aufgeschobene Änderungen nachziehen
  refresh();
  return { el: root, refresh, dispose: () => document.removeEventListener("keydown", taste) };
}
