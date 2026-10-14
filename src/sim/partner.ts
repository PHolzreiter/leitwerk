/**
 * Partner-Organisationen (einfache Version): Feuerwehr, Polizei, Bergrettung, Wasserrettung.
 * Keine eigenen Fahrzeuge – angefordert heißt sofort vor Ort.
 * Hier steht, wann sie gebraucht werden (nach Kapitel, Antworten und Codename).
 */
import type { Antworten } from "../abfrage/schema";

export type PartnerArt = "fw" | "pol" | "berg" | "wasser";

export const PARTNER: Record<PartnerArt, { name: string; kurz: string; symbol: string }> = {
  fw: { name: "Feuerwehr", kurz: "FW", symbol: "🚒" },
  pol: { name: "Polizei", kurz: "Pol", symbol: "🚓" },
  berg: { name: "Bergrettung", kurz: "BR", symbol: "⛰" },
  wasser: { name: "Wasserrettung", kurz: "WR", symbol: "🌊" },
};

export const PARTNER_ARTEN: PartnerArt[] = ["fw", "pol", "berg", "wasser"];

/** Warum eine Organisation gebraucht wird (Text für Funk und Protokoll) */
export interface PartnerGrund {
  art: PartnerArt;
  grund: string;
}

/**
 * Welche Partner braucht der Einsatz?
 * kapitel/antworten aus der Abfrage (bzw. der Wahrheit), codeName = Name/Beschreibung des Codes.
 */
export function partnerNoetig(kapitel: string | null | undefined, a: Antworten, codeName: string): PartnerGrund[] {
  const kap = kapitel ?? "";
  const n = codeName;
  const out: PartnerGrund[] = [];
  const add = (art: PartnerArt, grund: string) => {
    if (!out.some((x) => x.art === art)) out.push({ art, grund });
  };
  // Feuerwehr
  if (a.eingeklemmt === "ja" || /eingeklemmt|verschüttet|eingeschlossen/i.test(n)) add("fw", "Person eingeklemmt");
  if (kap === "29" || kap === "34" || /\bVU\b|Verkehrsunfall|Unfallmeldung/i.test(n)) add("fw", "Verkehrsunfall – Absicherung und technische Hilfe");
  if (kap === "7" || /Feuer|Brand|Explosion|Brennende/i.test(n)) add("fw", "Brand/Explosion");
  if (kap === "8" || a.gefahrgut === "ja" || /Gefahrgut|Kohlenmonoxid|Gasgeruch|CBRN/i.test(n)) add("fw", "Gefahrstoff");
  if (kap === "22") add("fw", "technische Rettung");
  if (kap === "15" || /Strom/i.test(n)) add("fw", "Stromunfall – Freischalten/Absichern");
  if (/verschlossen|Türöffnung/i.test(n)) add("fw", "Türöffnung");
  if (a.andere_gefahren === "ja") add("fw", "Gefahr an der Einsatzstelle");
  // Polizei
  if (kap === "4" || /Gewalt|Überfall|Verbrechen|Sexualdelikt|Körperverletzung/i.test(n)) add("pol", "Gewalttat");
  if (kap === "27" || /Schuss|Stich|Pfählung/i.test(n)) add("pol", "Schuss-/Stichverletzung");
  if (/aggressiv|gewalttätig|Waffen/i.test(n) || a.aggressiv === "ja" || a.gewalt === "ja") add("pol", "aggressiver Patient – Eigenschutz");
  if (kap === "25" || /Suizid|UBG|Unterbringung|Psychiatrie/i.test(n)) add("pol", "Psychiatrie/Suizidgefahr (ggf. Unterbringung)");
  if ((kap === "29" || kap === "34") && a.verletzte === "ja") add("pol", "Verkehrsunfall mit Verletzten");
  if (kap === "9" && (a.tod === "offensichtlich" || a.tod === "moeglich")) add("pol", "Todesfall");
  if (kap === "38") add("pol", "Anforderung durch die Polizei");
  // Bergrettung
  if (kap === "ALP" || /Alpin|Lawine|Bergrettung|Gondel|Lift/i.test(n)) add("berg", "Alpinunfall");
  // Wasserrettung
  const imWasser = a.wo !== undefined ? a.wo !== "land" : true;
  if ((kap === "14" && imWasser && !/nicht mehr im Wasser/i.test(n)) || /Eisrettung|Hochwasser|Fliessgewässer|Fließgewässer/i.test(n)) add("wasser", "Person im Wasser");
  return out;
}

/** Bei Polizeieinsätzen ist die Polizei schon dort (Kapitel 38) */
export function partnerSchonDa(kapitel: string | null | undefined): PartnerArt[] {
  return kapitel === "38" ? ["pol"] : [];
}
