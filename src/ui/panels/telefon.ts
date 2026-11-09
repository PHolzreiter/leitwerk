/**
 * Telefon: Anrufe aus dem Spiel (Notruf, KT-Hotline, Überstellung) und die Aktionen Annehmen, Halten, Auflegen.
 * Das Fenster selbst (nur Zurückrufen und Anrufen) steht in src/ui/fenster/telefon; angenommen wird in der Abfrage.
 */
import { funkTon } from "../sprechfunk";
import { istPilot } from "../pilot/modus";
import { spielen } from "../sounds";
import { kiPrefs } from "../../abfrage/ki";
import { verstummen } from "../sprache";
import { eroeffnen } from "../../abfrage/gespraech";
import { KT_FRAGEN, ktFragen } from "../../abfrage/ktGespraech";
import { mp } from "../../net/mehrspieler";
import { sim, type Anruf, type Einsatz } from "../../sim/engine";
import { nummerAus } from "../../sim/rufnummer";
import { istUeberstellung } from "../../sim/ktCodes";
import { toast } from "../dom";
import { funkPiepAktualisieren, klingeltonAktualisieren } from "../klingelton";
import { dock, panelZeigen, registriere } from "../ws/arbeitsplatz";
import { waehle } from "../ws/auswahl";
import { onPers, pers } from "../ws/persoenlich";
import { telefonFenster } from "../fenster/telefon";
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

/** Nehme ich diese Art von Anrufen an? (Filter RD · KT · SEK im Abfrage-Fenster, „Ich nehme an“ in der Kopfleiste) */
export function nehmeIchAn(typ: "notruf" | "kt" | "sek"): boolean {
  const p = pers();
  return typ === "notruf" ? p.notrufe : typ === "kt" ? p.ktHotline : p.ueberstellungen !== false;
}

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

/** Nummer, die beim Notruf angezeigt wird – dieselbe, die der Anrufer auf Nachfrage nennt */
export function angezeigteNummer(e: Einsatz): string {
  return e.wahr.abfrage?.anrufer.nummer || nummerAus(e.id, true);
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
    l.push({ art: "rd", typ: "notruf", id: e.id, nummer: e.nummer, anruf: a, telefon: angezeigteNummer(e), titel: e.meldung.adresse || "Notruf" });
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
  verstummen();
  fehler(sim.call(art === "rd" ? "anrufHalten" : "ktAnrufHalten", id));
}

export function anrufAuflegen(art: AnrufArt, id: string): void {
  verstummen();
  fehler(
    sim.call(art === "rd" ? "anrufBeenden" : "ktAnrufBeenden", id).then(() => {
      // Notruf (RD) beendet: Ton „Einsatz rein“
      if (art === "rd") funkTon("einsatzRein");
      // Nach dem Gespräch: Maske nach vorne; steckt die Abfrage bei der Karte, wieder die Karte zeigen
      const d = dock();
      const abf = d?.getPanel("abfrage");
      const karte = d?.getPanel("karte");
      if (abf && karte && abf.group === karte.group && !meinGespraech()) karte.api.setActive();
      waehle(art === "rd" ? "einsatz" : "kt", id);
    }),
  );
}

registriere({
  komponente: "telefon",
  titel: "Telefon",
  info: "Zurückrufen und anrufen: verpasste und angenommene Anrufe (angenommen wird in der Abfrage)",
  bereich: "links",
  einmalig: true,
  erstellen: (ctx) => telefonFenster(ctx),
});

// ---------------------------------------------------------------- Klingeln und automatisches Öffnen (nur Hauptfenster)

export function anrufBeobachterStarten(): void {
  const bekannt = new Set<string>();
  let erstes = true;
  const funkGemeldet = new Set<number>();
  const pruefen = () => {
    // Piloten-Interface: Telefon, KT-Hotline und Funk der Leitstelle gehen den Piloten nichts an
    if (istPilot()) {
      klingeltonAktualisieren(false, false);
      funkPiepAktualisieren(false);
      erstes = true;
      return;
    }
    const p = pers();
    const anrufe = alleAnrufe();
    const klingeltNotruf = anrufe.some((x) => x.typ === "notruf" && x.anruf.status === "klingelt");
    const klingeltKt = anrufe.some((x) => x.typ !== "notruf" && x.anruf.status === "klingelt" && nehmeIchAn(x.typ));
    // Während ich telefoniere: kein Dauerklingeln, nur ein kurzer Anklopf-Ton je neuem Anruf
    const telefoniere = !!meinGespraech();
    klingeltonAktualisieren(!telefoniere && klingeltNotruf && p.notrufe && sim.state.laeuft, !telefoniere && klingeltKt && sim.state.laeuft);
    const rufe = (sim.state.funkGespraeche ?? []).filter((g) => g.status === "ruft");
    funkPiepAktualisieren(p.funkTon && rufe.length > 0, rufe.some((g) => g.dringend));
    // Während ich telefoniere: einmal ein kurzer Ton, wenn jemand funken möchte (der Funk wartet aufs Auflegen)
    for (const g of sim.state.funkGespraeche ?? []) {
      if (g.status !== "wartet" || !g.wegenTelefon || funkGemeldet.has(g.id)) continue;
      funkGemeldet.add(g.id);
      if (telefoniere && p.funkTon && !erstes) spielen("funk");
    }
    // Neuer Anruf klingelt: Abfrage zeigen (dort wird abgehoben – wenn ich diese Anrufe annehme)
    for (const x of anrufe) {
      const key = `${x.id}:${x.anruf.versuche}:${x.anruf.status === "klingelt" ? x.anruf.seit : ""}`;
      if (x.anruf.status !== "klingelt" || bekannt.has(key)) continue;
      bekannt.add(key);
      if (erstes) continue;
      const fuerMich = nehmeIchAn(x.typ);
      if (telefoniere && fuerMich && sim.state.laeuft && kiPrefs().klingelton) spielen("anklopfen");
      if (fuerMich) panelZeigen("abfrage");
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
