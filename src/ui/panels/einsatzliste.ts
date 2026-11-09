/**
 * Einsatzliste: alle Notfälle, Krankentransporte und Überstellungen in einer Liste.
 * Aussehen und Bedienung aus dem Entwurf (src/ui/fenster/einsatzliste), Daten und Aktionen aus dem Spiel.
 */
import { sim, type Einsatz } from "../../sim/engine";
import type { KtAuftrag } from "../../sim/kt";
import { einsatzlisteFenster } from "../fenster/einsatzliste";
import { registriere } from "../ws/arbeitsplatz";

export type Lage = "anruf" | "dispo" | "unterwegs" | "vorort" | "erledigt";

export const LAGE_LABEL: Record<Lage, string> = {
  anruf: "Anruf / Aufnahme",
  dispo: "disponieren",
  unterwegs: "unterwegs",
  vorort: "vor Ort / an Bord",
  erledigt: "erledigt",
};

const ANRUF_LAEUFT = ["klingelt", "aktiv", "gehalten", "verpasst"];

/** Grobe Lage eines Einsatzes (für andere Fenster; die Liste selbst zeigt den genaueren Zustand) */
export function einsatzLage(e: Einsatz): Lage {
  if (e.zustand === "abgeschlossen") return "erledigt";
  if (e.anruf && ANRUF_LAEUFT.includes(e.anruf.status)) return "anruf";
  // Großeinsatz: zu tun, solange der BR fehlt, Buchungen offen sind oder nachgefordert wird
  if (e.gs && !e.gs.aufgehoben && e.gs.phase !== "alarm") {
    const kinder = Object.values(e.gs.kinder).map((id) => sim.einsatz(id));
    return e.gs.brNoetig || e.nachforderungen?.some((n) => !n.erledigt) || kinder.some((k) => k && !k.kh && k.zustand !== "abgeschlossen") ? "dispo" : "vorort";
  }
  const fz = e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f) => f && f.einsatzId === e.id);
  if (!fz.length && e.fremd) return "erledigt";
  if (!e.fremd && (!fz.length || e.nachforderungen?.some((n) => !n.erledigt) || e.khAnfrage || e.adressePruefen)) return "dispo";
  if (fz.some((f) => ["suche", "vorOrt", "warteKH", "transport", "uebergabe", "rendezvous", "treffpunkt"].includes(f!.phase))) return "vorort";
  return "unterwegs";
}

export function ktLage(k: KtAuftrag): Lage {
  if (k.status === "erledigt" || k.status === "storniert") return "erledigt";
  if (k.status === "aufnahme" || (k.anruf && ["klingelt", "aktiv", "gehalten"].includes(k.anruf.status))) return "anruf";
  if (k.status === "offen") return "dispo";
  if (k.status === "anBord") return "vorort";
  return "unterwegs";
}

registriere({
  komponente: "einsatzliste",
  titel: "Einsatzliste",
  info: "Notfälle, Krankentransporte und Überstellungen",
  bereich: "links",
  mehrfach: true,
  erstellen: einsatzlisteFenster,
});
