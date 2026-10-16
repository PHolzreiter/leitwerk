/**
 * Partner-Organisationen: Feuerwehr, Polizei, Bergrettung, Wasserrettung.
 * Sie fahren mit eigenen Fahrzeugen von der nächsten Dienststelle (Feuerwehr/Polizei 3, sonst 1 Fahrzeug),
 * transportieren aber nie Patienten. Hier steht, wann sie gebraucht werden (nach Kapitel, Antworten und Codename).
 */
import type { Antworten } from "../abfrage/schema";
import { thema } from "../abfrage/themen";

export type PartnerArt = "fw" | "pol" | "berg" | "wasser";

export const PARTNER: Record<PartnerArt, { name: string; kurz: string; symbol: string }> = {
  fw: { name: "Feuerwehr", kurz: "FW", symbol: "🚒" },
  pol: { name: "Polizei", kurz: "Pol", symbol: "🚓" },
  berg: { name: "Bergrettung", kurz: "BR", symbol: "⛰" },
  wasser: { name: "Wasserrettung", kurz: "WR", symbol: "🌊" },
};

export const PARTNER_ARTEN: PartnerArt[] = ["fw", "pol", "berg", "wasser"];

/** Dienststellen-Typ der Organisation */
export const PARTNER_TYP: Record<PartnerArt, string> = { fw: "Feuerwehr", pol: "Polizei", berg: "Bergrettung", wasser: "Wasserrettung" };

/** Fahrzeuge pro Alarmierung */
export const PARTNER_ANZAHL: Record<PartnerArt, number> = { fw: 3, pol: 3, berg: 1, wasser: 1 };

/** Partner-Art einer Dienststelle (null = Rettungsdienst o. Ä.) */
export function partnerArtVonTyp(typ: string | undefined): PartnerArt | null {
  const t = (typ ?? "").toLowerCase();
  if (t.includes("feuerwehr")) return "fw";
  if (t.includes("polizei")) return "pol";
  if (t.includes("bergrettung")) return "berg";
  if (t.includes("wasserrettung")) return "wasser";
  return null;
}

/** Warum eine Organisation gebraucht wird (Text für Funk und Protokoll) */
export interface PartnerGrund {
  art: PartnerArt;
  grund: string;
  /** ohne sie kann der Rettungsdienst nicht arbeiten (Befreiung, Patient nicht auffindbar, im Wasser) */
  blockiert?: boolean;
  /** Gewalt/Waffen: Rettungsdienst wartet im Bereitstellungsraum, bis die Polizei den Einsatzort sichert */
  eigenschutz?: boolean;
  /** Polizei begleitet den Transport ins Krankenhaus */
  begleitung?: boolean;
}

/** Was man über den Ort weiß (Fallgeschichte) */
export interface PartnerOrt {
  /** Art des Ortes (Straße, Arbeit, Natur …) */
  ortArt?: string;
  /** Anrufer weiß nicht, wo er ist */
  ortUnbekannt?: boolean;
}

const UNFALL = ["sturz", "verletzung", "blutung", "eingeklemmt", "strom", "auge", "brand", "verkehrsunfall"];

/**
 * Welche Partner braucht der Einsatz?
 * kapitel/antworten aus der Abfrage (bzw. der Wahrheit), codeName = Name/Beschreibung des Codes.
 */
export function partnerNoetig(kapitel: string | null | undefined, a: Antworten, codeName: string, ort: PartnerOrt = {}): PartnerGrund[] {
  const t = thema(kapitel);
  const n = codeName;
  const out: PartnerGrund[] = [];
  const add = (art: PartnerArt, grund: string, x: Partial<PartnerGrund> = {}) => {
    const da = out.find((y) => y.art === art);
    if (!da) out.push({ art, grund, ...x });
    else {
      // stärkere Gründe gewinnen (Eigenschutz/Befreiung vor bloßer Absicherung)
      if (x.blockiert && !da.blockiert) Object.assign(da, { grund }, x);
      if (x.eigenschutz) da.eigenschutz = true;
      if (x.begleitung) da.begleitung = true;
    }
  };
  const vu = t === "verkehrsunfall" || t === "ecall" || /\bVU\b|Verkehrsunfall|Unfallmeldung/i.test(n);
  // Feuerwehr: alles was brennt oder austritt, Befreiung, Verkehrsunfall, Türöffnung
  if (a.eingeklemmt === "ja" || /eingeklemmt|verschüttet|eingeschlossen/i.test(n)) add("fw", "Person eingeklemmt", { blockiert: true });
  if (t === "eingeklemmt") add("fw", "technische Rettung", { blockiert: true });
  if (t === "brand" || /Feuer|Brand|Explosion|Brennende/i.test(n)) add("fw", "Brand/Explosion", { blockiert: true });
  if (t === "gefahrstoff" || a.gefahrgut === "ja" || /Gefahrgut|Kohlenmonoxid|Gasgeruch|CBRN|austret/i.test(n)) add("fw", "Gefahrstoff tritt aus", { blockiert: true });
  if (t === "strom" || /Strom/i.test(n)) add("fw", "Stromunfall – Freischalten/Absichern", { blockiert: true });
  if (/verschlossen|Türöffnung/i.test(n) || a.tuer === "verschlossen") add("fw", "Türöffnung", { blockiert: true });
  if (vu) add("fw", "Verkehrsunfall – Absicherung und technische Hilfe");
  if (a.andere_gefahren === "ja") add("fw", "Gefahr an der Einsatzstelle");
  // Polizei: Gewalt/Waffen (Eigenschutz), Unterbringung, Unfälle im öffentlichen Raum, Arbeitsunfall
  if (t === "gewalt" || /Gewalt|Überfall|Verbrechen|Sexualdelikt|Körperverletzung/i.test(n)) add("pol", "Gewalttat", { eigenschutz: true, blockiert: true, begleitung: true });
  if (t === "stich_schuss" || /Schuss|Stich|Pfählung|Waffe/i.test(n)) add("pol", "Schuss-/Stichverletzung", { eigenschutz: true, blockiert: true, begleitung: true });
  if (/aggressiv|gewalttätig/i.test(n) || a.aggressiv === "ja" || a.gewalt === "ja" || a.gewalttaetig === "ja" || a.waffen === "ja") add("pol", "Gewalt/Waffen – Eigenschutz", { eigenschutz: true, blockiert: true, begleitung: true });
  if (t === "psych" || /Suizid|UBG|Unterbringung|Psychiatrie/i.test(n)) add("pol", "Psychiatrie/Suizidgefahr (ggf. Unterbringung)", { begleitung: true });
  if (vu) add("pol", "Verkehrsunfall");
  if (UNFALL.includes(t) && (ort.ortArt === "arbeit" || ort.ortArt === "baustelle")) add("pol", "Arbeitsunfall");
  if (UNFALL.includes(t) && (ort.ortArt === "strasse" || ort.ortArt === "bahnhof")) add("pol", "Unfall im öffentlichen Raum");
  if (t === "stillstand" && (a.tod === "offensichtlich" || a.tod === "moeglich")) add("pol", "Todesfall");
  if (t === "anforderung_polizei") add("pol", "Anforderung durch die Polizei");
  // Bergrettung: Person in der Natur, weiß nicht wo sie ist (oder Alpinunfall)
  if (t === "alpin" || /Alpin|Lawine|Bergrettung|Gondel|Lift/i.test(n)) add("berg", "Alpinunfall", { blockiert: true });
  if (ort.ortUnbekannt && ort.ortArt === "natur" && !vu && !["brand", "gefahrstoff", "wasser"].includes(t)) add("berg", "Person in unwegsamem Gelände, Standort unbekannt", { blockiert: true });
  // Wasserrettung: nur solange die Person noch im Wasser ist
  const imWasser = a.wo !== undefined ? a.wo !== "land" : true;
  if ((t === "wasser" && imWasser && !/nicht mehr im Wasser|gerettet/i.test(n)) || /Eisrettung|Hochwasser|Fliessgewässer|Fließgewässer/i.test(n)) add("wasser", "Person im Wasser", { blockiert: true });
  return out;
}

/** Bei Polizeieinsätzen ist die Polizei schon dort (Kapitel 38) */
export function partnerSchonDa(kapitel: string | null | undefined): PartnerArt[] {
  return thema(kapitel) === "anforderung_polizei" ? ["pol"] : [];
}
