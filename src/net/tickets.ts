/**
 * Mithelfen / Tickets: Nutzer schicken fehlende oder falsche Daten (Dienststellen, Fahrzeuge, POIs,
 * Krankenhäuser) und Vorschläge an den Ticket-Dienst (Cloudflare). Nichts davon kommt ins eigene Spiel.
 *
 * - „Meine Tickets“ liegen nur hier im Programm (Nummer + Geheimwort, damit nur der Absender den Stand sieht)
 * - ohne Verbindung landet ein Ticket in der Warteschlange und wird später geschickt
 * - ändert sich der Stand (in Arbeit, eingebaut in Version …), kommt ein kleiner Hinweis
 */
import { toast } from "../ui/dom";

export const TICKET_URL = "https://tickets.leitwerk.workers.dev";

export type TicketArt = "dienststelle" | "fahrzeug" | "poi" | "krankenhaus" | "vorschlag" | "hilfe" | "idee";
export type TicketStatus = "eingegangen" | "in_arbeit" | "rueckfrage" | "eingebaut" | "erledigt" | "abgelehnt";

export const ART_LABEL: Record<TicketArt, string> = {
  dienststelle: "Dienststelle",
  fahrzeug: "Fahrzeug",
  poi: "Ort (POI)",
  krankenhaus: "Krankenhaus",
  vorschlag: "Änderungsvorschlag",
  hilfe: "Antwort auf offenen Punkt",
  idee: "Idee/Wunsch",
};
export const STATUS_LABEL: Record<TicketStatus | "wartet", string> = {
  wartet: "noch nicht gesendet",
  eingegangen: "eingegangen",
  in_arbeit: "in Arbeit",
  rueckfrage: "Rückfrage",
  eingebaut: "eingebaut",
  erledigt: "erledigt",
  abgelehnt: "nicht übernommen",
};

/** Grenzen wie im Ticket-Dienst */
export const GRENZEN = { anhaenge: 5, dateiBytes: 2_000_000, gesamtBytes: 5_000_000, text: 8000 };
export const ANHANG_ENDUNG = /\.(txt|csv)$/i;

export interface HilfePunkt {
  id: string;
  titel: string;
  text: string;
  art: string;
}

export interface TicketEingabe {
  art: TicketArt;
  titel: string;
  text?: string;
  daten?: Record<string, unknown>;
  importCsv?: string;
  kontakt?: string;
  hilfeId?: string;
  version?: string;
  funkgruppe?: string;
  anhaenge?: { name: string; inhalt: string }[];
}

export interface MeinTicket {
  /** lokale Kennung (auch vor dem Senden) */
  id: string;
  nr?: number;
  geheim?: string;
  art: TicketArt;
  titel: string;
  erstellt: number;
  status: TicketStatus | "wartet";
  version?: string;
  antwort?: string;
  /** neuer Stand, noch nicht angesehen */
  neu?: boolean;
  /** nur solange nicht gesendet */
  eingabe?: TicketEingabe;
}

/** Startliste, falls der Dienst (noch) nicht erreichbar ist */
const START_HILFE: HilfePunkt[] = [
  ["fg-01", "Fahrzeuge NÖ-01 kontrollieren", "Stimmen Funkrufnamen, Typen (RTW-C, RTW, KTW, BEL) und Dienstzeiten in Amstetten, Waidhofen/Ybbs, Scheibbs, Melk, St. Pölten, Lilienfeld und Purkersdorf? Fehlt ein Fahrzeug oder ist eines zu viel?"],
  ["fg-02", "Fahrzeuge NÖ-02 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Gmünd, Waidhofen/Thaya, Horn und Zwettl?"],
  ["fg-03", "Fahrzeuge NÖ-03 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Krems, Tulln und Hollabrunn?"],
  ["fg-04", "Fahrzeuge NÖ-04 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Mistelbach, Gänserndorf und Korneuburg?"],
  ["fg-05", "Fahrzeuge NÖ-05 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Mödling, Bruck an der Leitha, Schwechat und Baden (Nord)?"],
  ["fg-06", "Fahrzeuge NÖ-06 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Wiener Neustadt, Neunkirchen und Baden (Süd)?"],
  ["juh-sek", "Sekundärfahrzeuge der Johanniter", "Welche SKTW, SRTW, SNAW und BIT haben die Johanniter in NÖ – mit Funkrufnamen, Dienstzeiten und Standorten (St. Pölten, Wiener Neudorf, Spillern, Zwettl, Stellplätze bei den Kliniken)?"],
].map(([id, titel, text]) => ({ id, titel, text, art: "fahrzeug" }));

const LS_HILFE = "lw.hilfe";
const LS_MEINE = "lw.tickets";

function lesen<T>(k: string, sonst: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : sonst;
  } catch {
    return sonst;
  }
}
function schreiben(k: string, v: unknown): boolean {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ Offene Punkte

let hilfeCache: HilfePunkt[] | null = null;

/** Offene Punkte: zuerst gespeichert/Startliste, dann (wenn erreichbar) frisch vom Dienst */
export function hilfeLokal(): HilfePunkt[] {
  return hilfeCache ?? lesen<HilfePunkt[] | null>(LS_HILFE, null) ?? START_HILFE;
}

export async function hilfeLaden(): Promise<HilfePunkt[]> {
  try {
    const r = await fetch(`${TICKET_URL}/api/hilfe`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { punkte?: HilfePunkt[] };
    if (Array.isArray(j.punkte)) {
      hilfeCache = j.punkte.map((p) => ({ id: String(p.id), titel: String(p.titel), text: String(p.text ?? ""), art: String(p.art ?? "") }));
      schreiben(LS_HILFE, hilfeCache);
    }
  } catch {
    /* offline: gespeicherte Liste */
  }
  return hilfeLokal();
}

// ------------------------------------------------------------------ Entwicklungsfortschritt

export interface FortschrittPunkt {
  id: string;
  titel: string;
  text: string;
  stand: "arbeit" | "geplant" | "fertig";
  prozent: number;
}

/** Ersatzliste, falls der Dienst nicht erreichbar ist (wird bei jedem Update angepasst) */
export const START_FORTSCHRITT: FortschrittPunkt[] = [
  { id: "schema", titel: "Eigenes Codesystem & eigene Schemas", text: "Eingebaute Codeliste mit Abfrage ab der Installation; eigene Codelisten und Abfrageschemas hochladen und wechseln", stand: "fertig", prozent: 100 },
  { id: "kt-codes", titel: "Transport-Codes mit Editor", text: "Codes für Krankentransporte und Überstellungen über Bedingungen, mit Editor und Prüfung", stand: "fertig", prozent: 100 },
  { id: "fahrzeugsuche", titel: "Suche bei der Fahrzeugwahl", text: "Im Einsatz schnell ein bestimmtes Fahrzeug finden", stand: "fertig", prozent: 100 },
  { id: "sek-kt", titel: "Fahrzeugwahl bei Überstellungen und Krankentransporten", text: "Vorschlag nach Dienstzeit, Suche, Alarmieren oder Vormerken; Rückfrage per Funk, wenn ein Fahrzeug zu früh dort ist", stand: "fertig", prozent: 100 },
  { id: "karte-info", titel: "Info-Fenster auf der Karte", text: "Klick auf ein Fahrzeug zeigt Status und Ankunftszeit, ohne die Karte zu verlassen", stand: "fertig", prozent: 100 },
  { id: "zuweisung", titel: "Krankenhaus-Zuweisung nach Symptom", text: "Symptom, Altersgruppe und Dringlichkeit bestimmen das Krankenhaus; Aufnahme je Haus einstellbar", stand: "fertig", prozent: 100 },
  { id: "tablet", titel: "Zweitbildschirm am Tablet", text: "Karte, Fahrzeuge und Krankenhäuser zusätzlich am Tablet im WLAN anzeigen", stand: "geplant", prozent: 0 },
  { id: "nah-pilot", titel: "Notarzthubschrauber selbst fliegen", text: "Als Pilot im Multiplayer mitspielen – mit oder ohne Flugsimulator", stand: "arbeit", prozent: 70 },
  { id: "telefon", titel: "Bessere Telefongespräche", text: "Natürlichere Anrufer und genauere Antworten in der Notrufabfrage", stand: "arbeit", prozent: 60 },
  { id: "funk", titel: "Überarbeitung des Funksystems", text: "Funkverkehr mit Fahrzeugen klarer, schneller und realistischer", stand: "geplant", prozent: 0 },
];
const LS_FORTSCHRITT = "lw.fortschritt";

/** Fortschritt: frisch vom Dienst, sonst zuletzt gesehene Liste bzw. Ersatzliste */
export async function fortschrittLaden(): Promise<{ punkte: FortschrittPunkt[]; live: boolean }> {
  try {
    const r = await fetch(`${TICKET_URL}/api/fortschritt`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { punkte?: FortschrittPunkt[] };
    if (Array.isArray(j.punkte)) {
      const punkte = j.punkte.map((p) => ({
        id: String(p.id),
        titel: String(p.titel),
        text: String(p.text ?? ""),
        stand: p.stand === "arbeit" || p.stand === "fertig" ? p.stand : ("geplant" as const),
        prozent: Math.max(0, Math.min(100, Number(p.prozent) || 0)),
      }));
      schreiben(LS_FORTSCHRITT, punkte);
      return { punkte, live: true };
    }
  } catch {
    /* offline */
  }
  return { punkte: lesen<FortschrittPunkt[] | null>(LS_FORTSCHRITT, null) ?? START_FORTSCHRITT, live: false };
}

// ------------------------------------------------------------------ Meine Tickets

/** nur im Speicher (falls Anhänge zu groß für den lokalen Speicher sind) */
let meineSpeicher: MeinTicket[] | null = null;
const hoerer = new Set<() => void>();

export function meineTickets(): MeinTicket[] {
  return meineSpeicher ?? lesen<MeinTicket[]>(LS_MEINE, []);
}

function meineSetzen(liste: MeinTicket[]): void {
  if (schreiben(LS_MEINE, liste)) meineSpeicher = null;
  else {
    // zu groß: Warteschlange ohne Anhänge sichern, vollständig nur bis zum Schließen
    meineSpeicher = liste;
    schreiben(LS_MEINE, liste.map((t) => (t.eingabe?.anhaenge ? { ...t, eingabe: { ...t.eingabe, anhaenge: [] } } : t)));
  }
  for (const f of hoerer) f();
}

export function onTickets(f: () => void): () => void {
  hoerer.add(f);
  return () => hoerer.delete(f);
}

/** Anzahl Tickets mit neuem Stand */
export function ungelesen(): number {
  return meineTickets().filter((t) => t.neu).length;
}

export function alleGelesen(): void {
  const l = meineTickets();
  if (l.some((t) => t.neu)) meineSetzen(l.map((t) => ({ ...t, neu: false })));
}

async function senden(e: TicketEingabe): Promise<{ nr: number; geheim: string; status: TicketStatus } | { fehler: string; endgueltig: boolean }> {
  try {
    const r = await fetch(`${TICKET_URL}/api/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(e),
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as { nr?: number; geheim?: string; status?: TicketStatus; fehler?: string };
    if (r.ok && j.nr && j.geheim) return { nr: j.nr, geheim: j.geheim, status: j.status ?? "eingegangen" };
    // 4xx (außer Grenze je Stunde) = Ticket ist so nicht annehmbar
    return { fehler: j.fehler ?? `Fehler ${r.status}`, endgueltig: r.status >= 400 && r.status < 500 && r.status !== 429 };
  } catch {
    return { fehler: "Ticket-Dienst nicht erreichbar", endgueltig: false };
  }
}

/**
 * Ticket abschicken. Ohne Verbindung bleibt es in der Warteschlange („noch nicht gesendet“).
 * Rückgabe: gesendet (mit Nummer), wartet, oder Fehler (Ticket nicht angenommen).
 */
export async function ticketSchicken(e: TicketEingabe): Promise<{ ergebnis: "gesendet"; nr: number } | { ergebnis: "wartet" } | { ergebnis: "fehler"; fehler: string }> {
  const r = await senden(e);
  if ("fehler" in r && r.endgueltig) return { ergebnis: "fehler", fehler: r.fehler };
  const t: MeinTicket = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, art: e.art, titel: e.titel, erstellt: Date.now(), status: "wartet" };
  if ("nr" in r) Object.assign(t, { nr: r.nr, geheim: r.geheim, status: r.status });
  else t.eingabe = e;
  meineSetzen([t, ...meineTickets()]);
  return "nr" in r ? { ergebnis: "gesendet", nr: r.nr } : { ergebnis: "wartet" };
}

/** Wartende Tickets schicken (beim Start und bei jedem Abgleich) */
export async function warteschlangeSenden(): Promise<number> {
  let gesendet = 0;
  for (const t of meineTickets().filter((x) => x.status === "wartet" && x.eingabe)) {
    const r = await senden(t.eingabe!);
    if ("nr" in r) {
      gesendet++;
      meineSetzen(meineTickets().map((x) => (x.id === t.id ? { ...x, nr: r.nr, geheim: r.geheim, status: r.status, eingabe: undefined } : x)));
    } else if (r.endgueltig) {
      meineSetzen(meineTickets().map((x) => (x.id === t.id ? { ...x, status: "abgelehnt", antwort: `Nicht angenommen: ${r.fehler}`, eingabe: undefined, neu: true } : x)));
    } else break;
  }
  return gesendet;
}

/** Wartendes Ticket verwerfen */
export function ticketVerwerfen(id: string): void {
  meineSetzen(meineTickets().filter((t) => t.id !== id));
}

/** Stand der gesendeten Tickets holen; Änderungen werden gemeldet */
export async function standAbgleichen(melden = true): Promise<number> {
  await warteschlangeSenden();
  const liste = meineTickets().filter((t) => t.nr && t.geheim);
  if (!liste.length) return 0;
  let j: { tickets?: { nr: number; status: TicketStatus; version?: string; antwort?: string }[] };
  try {
    const r = await fetch(`${TICKET_URL}/api/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tickets: liste.map((t) => ({ nr: t.nr, geheim: t.geheim })) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return 0;
    j = await r.json();
  } catch {
    return 0;
  }
  const neu = new Map((j.tickets ?? []).map((x) => [x.nr, x]));
  const geaendert: MeinTicket[] = [];
  const alle = meineTickets().map((t) => {
    const s = t.nr ? neu.get(t.nr) : undefined;
    if (!s) return t;
    const anders = s.status !== t.status || (s.version ?? "") !== (t.version ?? "") || (s.antwort ?? "") !== (t.antwort ?? "");
    if (!anders) return t;
    const n = { ...t, status: s.status, version: s.version ?? "", antwort: s.antwort ?? "", neu: true };
    geaendert.push(n);
    return n;
  });
  if (geaendert.length) {
    meineSetzen(alle);
    if (melden) {
      const t = geaendert[0];
      const wie = t.status === "eingebaut" && t.version ? `eingebaut in Version ${t.version}` : STATUS_LABEL[t.status];
      toast(geaendert.length === 1 ? `Dein Ticket #${t.nr} „${t.titel}“: ${wie}` : `${geaendert.length} deiner Tickets haben einen neuen Stand`);
    }
  }
  return geaendert.length;
}

let laeuft = false;
/** Beim Programmstart: Warteschlange schicken, Stand holen, danach alle 15 Minuten */
export function ticketDienstStarten(): void {
  if (laeuft) return;
  laeuft = true;
  setTimeout(() => void standAbgleichen(), 4000);
  setInterval(() => void standAbgleichen(), 15 * 60_000);
}

// ------------------------------------------------------------------ Anhänge

/** Größe eines Textes in Bytes (UTF-8) */
export function bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Anhänge prüfen: nur .txt/.csv, höchstens 5, je 2 MB, zusammen 5 MB */
export function anhaengePruefen(liste: { name: string; inhalt: string }[]): string | null {
  if (liste.length > GRENZEN.anhaenge) return `Höchstens ${GRENZEN.anhaenge} Dateien`;
  let summe = 0;
  for (const a of liste) {
    if (!ANHANG_ENDUNG.test(a.name)) return `${a.name}: nur .txt- oder .csv-Dateien`;
    const b = bytes(a.inhalt);
    if (b > GRENZEN.dateiBytes) return `${a.name}: größer als 2 MB`;
    summe += b;
  }
  if (summe > GRENZEN.gesamtBytes) return "Alle Dateien zusammen größer als 5 MB";
  return null;
}
