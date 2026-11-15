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
  ["Luftrettungsstützpunkt NAH 2", "Stützpunkt eines Hubschraubers (ebenso NAH 9, 10, 15, 16, 17, 18)"],
  ["NAH 2", "Name eines Hubschraubers (ebenso NAH 9, 10, 15, 16, 17, 18)"],
  ["Rettungsleitstelle", "Leitstelle"],
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

/** Vorlage-Datei mit den neutralen Namen */
export function namenVorlage(): string {
  const zeilen = ["# LeitWerk – Namens-Ersetzungen: rechts neben dem Strichpunkt den eigenen Namen eintragen", "neutral;eigen"];
  for (const [n, w] of NEUTRALE_NAMEN) zeilen.push(`# ${w}`, `${n};`);
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
