// Namens-Ersetzungen (Realismus): Die eingebauten Daten tragen neutrale Namen („Rettungsdienst“, „NAH 2“ …).
// Wer echte Namen haben will, lädt eine CSV-Datei „neutral;eigen“ – sie wird beim Lesen der Daten angewendet
// (Dienststellen: Name und Organisation, Fahrzeuge: Kurzname, Orte: Name). Die Datei selbst liefern wir nicht mit.

export interface NamensRegel {
  neutral: string;
  eigen: string;
}

/** Neutrale Namen in den eingebauten Daten (für die Vorlage-Datei) */
export const NEUTRALE_NAMEN: [string, string][] = [
  ["Rettungsdienst", "Organisation des Rettungsdienstes (Dienststellen und Organisation)"],
  ["Rettungswache", "zweite Organisation des Rettungsdienstes"],
  ["Krankentransport", "Organisation für Krankentransporte"],
  ["Luftrettung", "Organisation der Notarzthubschrauber"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** CSV „neutral;eigen“ lesen (auch mit , oder Tab; Kopfzeile und #-Zeilen werden übersprungen) */
export function namenLesen(text: string): NamensRegel[] {
  const out: NamensRegel[] = [];
  const gesehen = new Set<string>();
  for (const roh of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const z = roh.trim();
    if (!z || z.startsWith("#")) continue;
    const t = z.includes(";") ? ";" : z.includes("\t") ? "\t" : ",";
    const [a, b] = z.split(t).map((x) => x.trim().replace(/^"(.*)"$/, "$1").trim());
    if (!a || !b || a === b) continue;
    if (/^neutral$/i.test(a) && /^eigen$/i.test(b)) continue;
    if (gesehen.has(a)) continue;
    gesehen.add(a);
    out.push({ neutral: a, eigen: b });
  }
  return out;
}

/** Name der Vorlage im Ordner Dokumente/LeitWerk/Namen */
export const NAMEN_VORLAGE = "Vorlage_Namen.csv";

/** Vorlage-Datei: Organisationen, Hubschrauber, Dienststellen des Rettungsdienstes und der Luftrettung,
 *  dazu eigener Abschnitt für Krankentransport und Überstellungen (KT/SEK)
 *  (rechts leer – wer will, trägt dort den eigenen Namen ein; leere Zeilen werden nicht angewendet) */
export function namenVorlage(daten?: { stations: { id?: string; name: string; organisation: string }[]; vehicles: { kurzname: string; kategorie: string; dienststelleId?: string }[] }): string {
  const zeilen = [
    "# LeitWerk – Namens-Ersetzungen: rechts neben dem Strichpunkt den eigenen Namen eintragen, leere Zeilen gelten nicht",
    "# Unter neuem Namen speichern (z. B. Meine_Namen.csv), dann in LeitWerk unter Eigene Dateien › Namen auswählen",
    "neutral;eigen",
    "# Organisationen (gelten als Wort in allen Namen, z. B. „Krankentransport“ in „Krankentransport St. Pölten“)",
  ];
  for (const [n] of NEUTRALE_NAMEN) zeilen.push(`${n};`);
  if (daten) {
    const heli = [...new Set(daten.vehicles.filter((v) => v.kurzname && /^(NAH|ITH)$/.test(v.kategorie)).map((v) => v.kurzname))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
    if (heli.length) zeilen.push("# Hubschrauber (NAH, ITH)", ...heli.map((h) => `${h};`));
    // Stützpunkte für Krankentransporte und Überstellungen: Dienststellen mit SKTW, SRTW, SNAW oder ITH, dazu „Krankentransport …“
    const sekIds = new Set(daten.vehicles.filter((v) => /^(SKTW|SRTW|SNAW|ITH)$/.test(v.kategorie) && v.dienststelleId).map((v) => v.dienststelleId!));
    const relevant = daten.stations.filter((x) => ["Rettungsdienst", "Luftrettung", "Leitstelle", "Krankentransport"].includes(x.organisation));
    const istKt = (x: { id?: string; name: string }) => (x.id && sekIds.has(x.id)) || /(^|\s)Krankentransport(\s|$)/.test(x.name);
    const kt = [...new Set(relevant.filter(istKt).map((x) => x.name))].sort((a, b) => a.localeCompare(b, "de"));
    if (kt.length) zeilen.push("# Krankentransport & Überstellung (KT/SEK) – Stützpunkte mit SKTW, SRTW, SNAW, ITH (ganzer Name)", ...kt.map((x) => `${x};`));
    const st = [...new Set(relevant.filter((x) => !istKt(x)).map((x) => x.name))].sort((a, b) => a.localeCompare(b, "de"));
    if (st.length) zeilen.push("# Dienststellen (ganzer Name)", ...st.map((x) => `${x};`));
  }
  return zeilen.join("\n") + "\n";
}

/** Ersetzer bauen: ganzes Feld zuerst, sonst als ganzes Wort (längster neutraler Name zuerst) */
export function namenErsetzer(regeln: NamensRegel[] | undefined): ((s: string) => string) | null {
  const r = (regeln ?? []).filter((x) => x && x.neutral && x.eigen);
  if (!r.length) return null;
  const ganz = new Map(r.map((x) => [x.neutral, x.eigen]));
  const sortiert = [...r].sort((a, b) => b.neutral.length - a.neutral.length);
  const muster = new RegExp(`(?<![\\p{L}\\p{N}])(${sortiert.map((x) => esc(x.neutral)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  return (s: string) => {
    if (!s) return s;
    const g = ganz.get(s);
    if (g !== undefined) return g;
    return s.replace(muster, (m) => ganz.get(m) ?? m);
  };
}
