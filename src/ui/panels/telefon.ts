/**
 * Telefon: alle Anrufe (Notruf, KT-Hotline, Überstellung) mit Annehmen, Halten, Zurückwechseln, Auflegen.
 * Beim Annehmen geht das Abfrage-Fenster auf.
 */
import { eroeffnen } from "../../abfrage/gespraech";
import { KT_FRAGEN, ktFragen } from "../../abfrage/ktGespraech";
import { mp } from "../../net/mehrspieler";
import { sim, type Anruf } from "../../sim/engine";
import { nummerAus } from "../../sim/rufnummer";
import { istUeberstellung } from "../../sim/ktCodes";
import { el, esc, toast } from "../dom";
import { funkPiepAktualisieren, klingeltonAktualisieren } from "../klingelton";
import { dock, panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, onAuswahl, waehle } from "../ws/auswahl";
import { onPers, pers, setzePers } from "../ws/persoenlich";
import { liveSammler } from "./live";

export type AnrufArt = "rd" | "kt";

export interface AnrufEintrag {
  art: AnrufArt;
  /** Notruf, KT-Hotline oder Überstellung */
  typ: "notruf" | "kt" | "sek";
  id: string;
  nummer: string;
  anruf: Anruf;
  telefon: string;
  titel: string;
}

const TYP_LABEL = { notruf: "Notruf 144", kt: "KT-Hotline", sek: "Überstellung" };

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

/** Aufgenommene Rückrufnummer (aus der Maske) */
export function rueckrufNummer(x: { art: "rd" | "kt"; id: string }): string {
  return x.art === "rd" ? (sim.einsatz(x.id)?.telefon ?? "") : (sim.ktAuftrag(x.id)?.d.telefon ?? "");
}

export function istMeins(a: Anruf): boolean {
  return !a.angenommenVon || sim.mode === "solo" || a.angenommenVon.pid === (sim.ich?.pid ?? mp.ich.pid);
}

export function alleAnrufe(mitBeendeten = false): AnrufEintrag[] {
  const l: AnrufEintrag[] = [];
  const t = sim.state.zeit;
  const zeigen = (a: Anruf) => a.status !== "beendet" || (mitBeendeten && t - a.seit < 15 * 60_000);
  for (const e of sim.state.einsaetze) {
    const a = e.anruf;
    if (!a || (e.zustand === "abgeschlossen" && a.status !== "beendet") || !zeigen(a)) continue;
    l.push({ art: "rd", typ: "notruf", id: e.id, nummer: e.nummer, anruf: a, telefon: nummerAus(e.id, true), titel: e.meldung.adresse || "Notruf" });
  }
  for (const k of sim.state.kt ?? []) {
    const a = k.anruf;
    if (!a || !zeigen(a)) continue;
    const sek = istUeberstellung(k.d) || k.wahr?.d?.sek;
    l.push({
      art: "kt",
      typ: sek ? "sek" : "kt",
      id: k.id,
      nummer: k.nummer,
      anruf: a,
      telefon: k.wahr?.d?.telefon || nummerAus(k.id, false),
      titel: k.d.patient.name || (sek ? "Überstellung" : "Krankentransport"),
    });
  }
  return l;
}

/** Mein laufendes Gespräch (falls eins) */
export function meinGespraech(): AnrufEintrag | null {
  return alleAnrufe().find((x) => x.anruf.status === "aktiv" && istMeins(x.anruf)) ?? null;
}

// ---------------------------------------------------------------- Aktionen

/** Annehmen, zurückrufen oder aus der Warteschleife holen; Abfrage-Fenster zeigen */
export async function anrufAnnehmen(art: AnrufArt, id: string): Promise<void> {
  try {
    if (art === "rd") {
      await sim.call("anrufAnnehmen", id);
      waehle("einsatz", id, { maske: false });
      panelZeigen("abfrage");
      const e = sim.einsatz(id);
      const letzte = e?.anruf?.gespraech[e.anruf.gespraech.length - 1];
      if (e && (!letzte || (letzte.von !== "anrufer" && !/fortgesetzt|übernimmt/.test(letzte.text)))) {
        const live = liveSammler(id);
        await eroeffnen(e, live.onToken).catch((err) => toast(String(err.message ?? err), "error"));
        live.fertig();
      }
    } else {
      await sim.call("ktAnrufAnnehmen", id);
      waehle("kt", id, { maske: false });
      panelZeigen("abfrage");
      const k = sim.ktAuftrag(id);
      const letzte = k?.anruf?.gespraech[k.anruf.gespraech.length - 1];
      if (k && (!letzte || (letzte.von !== "anrufer" && !/fortgesetzt|übernimmt/.test(letzte.text)))) {
        const live = liveSammler(id);
        await ktFragen(k, KT_FRAGEN[0].text, KT_FRAGEN[0], live.onToken).catch((err) => toast(String(err.message ?? err), "error"));
        live.fertig();
      }
    }
  } catch (e) {
    toast(String((e as Error).message ?? e), "error");
  }
}

export function anrufHalten(art: AnrufArt, id: string): void {
  fehler(sim.call(art === "rd" ? "anrufHalten" : "ktAnrufHalten", id));
}

export function anrufAuflegen(art: AnrufArt, id: string): void {
  fehler(
    sim.call(art === "rd" ? "anrufBeenden" : "ktAnrufBeenden", id).then(() => {
      // Nach dem Gespräch: Maske nach vorne; steckt die Abfrage bei der Karte, wieder die Karte zeigen
      const d = dock();
      const abf = d?.getPanel("abfrage");
      const karte = d?.getPanel("karte");
      if (abf && karte && abf.group === karte.group && !meinGespraech()) karte.api.setActive();
      waehle(art === "rd" ? "einsatz" : "kt", id);
    }),
  );
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- Fenster

function erstellen(ctx: PanelKontext) {
  const root = el("div", { class: "pl telefon" });
  const kopf = el("div", { class: "pl-kopf tel-kopf" });
  const schalter = (label: string, titel: string, wert: () => boolean, setzen: (v: boolean) => void) => {
    const l = el("label", { class: "schalter", title: titel });
    const c = el("input", { type: "checkbox" });
    c.checked = wert();
    c.addEventListener("change", () => setzen(c.checked));
    l.append(c, el("span", { class: "schalter-knopf" }), el("span", {}, label));
    return { l, c };
  };
  const s1 = schalter("Notrufe", "Ich nehme Notrufe an (Klingeln, Fenster gehen von selbst auf)", () => pers().notrufe, (v) => setzePers({ notrufe: v }));
  const s2 = schalter("KT-Hotline", "Ich nehme die KT-Hotline an (Krankentransporte und Überstellungen)", () => pers().ktHotline, (v) => setzePers({ ktHotline: v }));
  kopf.append(el("span", { class: "tel-titel" }, "Ich nehme an:"), s1.l, s2.l);
  const liste = el("div", { class: "pl-body tel-liste" });
  root.append(kopf, liste);

  function zeile(x: AnrufEintrag): HTMLElement {
    const a = x.anruf;
    const meins = istMeins(a);
    const wer = a.angenommenVon && mp.aktiv && !meins ? ` · ${esc(a.angenommenVon.name)}` : "";
    const t = sim.state.zeit;
    const st =
      a.status === "klingelt"
        ? `<span class="tel-st klingelt">${a.folge ? "Folgeanruf" : a.versuche > 1 ? `ruft wieder an (${a.versuche}.)` : "klingelt"}</span>`
        : a.status === "aktiv"
          ? `<span class="tel-st aktiv">im Gespräch${wer}</span>`
          : a.status === "gehalten"
            ? `<span class="tel-st gehalten">gehalten${wer}</span>${a.haltenBis && a.haltenBis - t < 30_000 ? ` <span class="alert-text">legt gleich auf</span>` : ""}`
            : a.status === "verpasst"
              ? `<span class="tel-st verpasst">verpasst${a.versuche > 1 ? ` (${a.versuche}×)` : ""}</span>`
              : `<span class="tel-st beendet">beendet</span>`;
    const r = el("div", { class: `tel-row typ-${x.typ} st-${a.status}${auswahl().id === x.id ? " sel" : ""}` });
    r.innerHTML = `
      <span class="tel-bar"></span>
      <span class="tel-icon">${a.status === "gehalten" ? "⏸" : a.status === "verpasst" ? "📵" : a.status === "beendet" ? "☎" : "📞"}</span>
      <div class="tel-main">
        <div><b>${TYP_LABEL[x.typ]}</b> <span class="muted">${esc(x.telefon)}</span></div>
        <div class="muted">${esc(x.nummer)} · ${esc(x.titel)}</div>
      </div>
      <div class="tel-rechts">${st}<div class="tel-dauer">${a.status === "beendet" ? "" : mmss(t - a.seit)}</div></div>`;
    const knoepfe = el("div", { class: "tel-knoepfe" });
    const knopf = (label: string, cls: string, fn: () => void, titel = "") => {
      const b = el("button", { class: `btn small ${cls}`, title: titel }, label);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        fn();
      });
      knoepfe.appendChild(b);
      return b;
    };
    if (a.status === "klingelt") knopf("Annehmen", "primary", () => void anrufAnnehmen(x.art, x.id), "Anruf annehmen (laufendes Gespräch wird gehalten)");
    if (a.status === "verpasst") {
      const ohne = !rueckrufNummer(x);
      const b = knopf("Zurückrufen", "primary", () => void anrufAnnehmen(x.art, x.id));
      if (ohne && sim.settings.rueckrufNurMitNummer) {
        b.disabled = true;
        b.title = "Keine Rückrufnummer aufgenommen – Rückruf nicht möglich";
      }
    }
    if (a.status === "aktiv" && meins) {
      knopf("Halten", "", () => anrufHalten(x.art, x.id), "Anrufer in die Warteschleife – bei zu langem Warten legt er auf");
      knopf("Auflegen", "danger-text", () => anrufAuflegen(x.art, x.id));
    }
    if (a.status === "gehalten") {
      if (meins) knopf("Zurückwechseln", "primary", () => void anrufAnnehmen(x.art, x.id), "Gespräch fortsetzen (das laufende wird gehalten)");
      else knopf("Übernehmen", "primary", () => void anrufAnnehmen(x.art, x.id), "Gehaltenen Anruf aufgreifen und weiterführen");
      if (meins) knopf("Auflegen", "danger-text", () => anrufAuflegen(x.art, x.id));
    }
    if (knoepfe.childElementCount) r.appendChild(knoepfe);
    r.addEventListener("click", () => {
      waehle(x.art === "rd" ? "einsatz" : "kt", x.id, { maske: false });
      if (a.status === "aktiv" || a.status === "gehalten" || a.status === "beendet") panelZeigen("abfrage");
    });
    return r;
  }

  const ORD: Record<string, number> = { klingelt: 0, aktiv: 1, gehalten: 2, verpasst: 3, beendet: 4 };
  function render(): void {
    s1.c.checked = pers().notrufe;
    s2.c.checked = pers().ktHotline;
    const l = alleAnrufe(true).sort((a, b) => ORD[a.anruf.status] - ORD[b.anruf.status] || a.anruf.seit - b.anruf.seit);
    liste.innerHTML = "";
    const laufend = l.filter((x) => x.anruf.status !== "beendet");
    const beendet = l.filter((x) => x.anruf.status === "beendet").slice(-6).reverse();
    for (const x of laufend) liste.appendChild(zeile(x));
    if (!laufend.length) liste.appendChild(el("div", { class: "muted pad tel-leer" }, "Keine Anrufe. Neue Anrufe klingeln hier."));
    if (beendet.length) {
      liste.appendChild(el("div", { class: "tel-trenner" }, "Zuletzt"));
      for (const x of beendet) liste.appendChild(zeile(x));
    }
    const klingelt = laufend.filter((x) => x.anruf.status === "klingelt").length;
    ctx.setzeBadge(klingelt || laufend.filter((x) => x.anruf.status === "gehalten").length, klingelt ? "klingelt" : "warn");
  }

  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      render();
    }, 250);
  };
  const uhr = window.setInterval(render, 1000);
  const aus = [sim.onChange(spaeter), onAuswahl(() => render()), onPers(() => render()), mp.onChange(spaeter)];
  render();
  return {
    el: root,
    dispose: () => {
      window.clearInterval(uhr);
      aus.forEach((f) => f());
    },
  };
}

registriere({
  komponente: "telefon",
  titel: "Telefon",
  info: "Alle Anrufe: annehmen, halten, zurückwechseln",
  bereich: "links",
  einmalig: true,
  erstellen,
});

// ---------------------------------------------------------------- Klingeln und automatisches Öffnen (nur Hauptfenster)

export function anrufBeobachterStarten(): void {
  const bekannt = new Set<string>();
  let erstes = true;
  const pruefen = () => {
    const p = pers();
    const anrufe = alleAnrufe();
    const klingeltNotruf = anrufe.some((x) => x.typ === "notruf" && x.anruf.status === "klingelt");
    const klingeltKt = anrufe.some((x) => x.typ !== "notruf" && x.anruf.status === "klingelt");
    klingeltonAktualisieren(klingeltNotruf && p.notrufe && sim.state.laeuft, klingeltKt && p.ktHotline && sim.state.laeuft);
    funkPiepAktualisieren(p.funkTon && (sim.state.funkGespraeche ?? []).some((g) => g.status === "ruft"));
    // Neuer Anruf klingelt: Telefon zeigen (wenn ich diese Anrufe annehme)
    for (const x of anrufe) {
      const key = `${x.id}:${x.anruf.versuche}:${x.anruf.status === "klingelt" ? x.anruf.seit : ""}`;
      if (x.anruf.status !== "klingelt" || bekannt.has(key)) continue;
      bekannt.add(key);
      if (erstes) continue;
      if ((x.typ === "notruf" && p.notrufe) || (x.typ !== "notruf" && p.ktHotline)) panelZeigen("telefon");
    }
    erstes = false;
  };
  let wartet = false;
  sim.onChange(() => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      pruefen();
    }, 300);
  });
  onPers(pruefen);
}
