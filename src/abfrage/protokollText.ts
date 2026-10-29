/**
 * Ausgefüllte Abfrage als Text fürs Einsatzprotokoll, so wie es eine echte Leitstelle anzeigt:
 *   *** Erstaufnahme: 14.10.2026_15:12:35 ***
 *   1.Er ist wach und reagiert normal.
 *   2.Er atmet normal.
 * Aus Frage und Antwort wird ein kurzer Satz gebaut (Er/Sie nach dem Geschlecht).
 */
import { antwortLabel, fragenImAblauf, type Antworten, type Frage, type Schema, type Wert } from "./schema";

const VERBEN = [
  "Ist",
  "War",
  "Hat",
  "Hatte",
  "Atmet",
  "Kann",
  "Konnte",
  "Blutet",
  "Spricht",
  "Reagiert",
  "Liegt",
  "Lag",
  "Wurde",
  "Fühlt",
  "Nimmt",
  "Braucht",
  "Bekommt",
  "Klagt",
  "Hustet",
  "Erbricht",
  "Zittert",
  "Krampft",
  "Leidet",
  "Trägt",
  "Sitzt",
  "Steht",
  "Geht",
  "Riecht",
  "Hängt",
  "Brennt",
  "Besteht",
  "Gibt",
];

const SUBJEKT = /^(der Patient|die Patientin|der Betroffene|die Betroffene|das Kind|er|sie)\s+/i;

function satzEnde(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return /[.!]$/.test(t) ? t : `${t}.`;
}

function gross(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Ja/Nein/Unbekannt-Frage als Satz („Er atmet normal.“, „Die Hautfarbe ist verändert.“); null = passt nicht ins Muster */
function jaNeinSatz(frage: string, wert: string, pron: string, zusatz: string): string | null {
  // „Bitten Sie den Patienten …: Ist die Sprache verwaschen?“ → nur die eigentliche Frage
  const q = frage.trim().replace(/\?$/, "").replace(/^[^?]*:\s+(?=[A-ZÄÖÜ])/, "");
  const m = q.match(/^(\S+)\s+(.*)$/);
  if (!m || !VERBEN.includes(m[1])) return null;
  let rest = m[2];
  let subjekt: string;
  const subj = rest.match(SUBJEKT);
  if (subj) {
    subjekt = pron;
    rest = rest.slice(subj[0].length).trim();
  } else {
    // anderes Subjekt: „die Hautfarbe“, „der Schmerz“ …
    const art = rest.match(/^((?:[Dd]ie|[Dd]er|[Dd]as|[Ee]in|[Ee]ine)\s+[A-ZÄÖÜ]\S*)\s+(.*)$/);
    if (!art || /^[/(]/.test(art[2])) return null;
    subjekt = gross(art[1]);
    rest = art[2];
  }
  const verb = m[1].toLowerCase();
  // zusammengesetzte Fragen („… oder ist ein Tumor bekannt“) lieber als Frage + Antwort
  if (VERBEN.some((v) => new RegExp(`\\b${v.toLowerCase()}\\b`).test(rest))) return null;
  // Zusatz weglassen, wenn er nur wiederholt, was schon im Satz steht
  const woerter = zusatz.toLowerCase().split(/[^a-zäöüß]+/).filter((w) => w.length > 2);
  const z = zusatz && !woerter.every((w) => rest.toLowerCase().includes(w)) ? ` (${zusatz})` : "";
  if (wert === "ja") return satzEnde(`${subjekt} ${verb} ${rest}${z}`);
  if (wert === "nein") {
    // „Er hat keine Brustschmerzen“, sonst „Er atmet nicht normal“
    if ((verb === "hat" || verb === "hatte") && /^[A-ZÄÖÜ]/.test(rest)) return satzEnde(`${subjekt} ${verb} keine ${rest}${z}`);
    if ((verb === "ist" || verb === "war") && /^[A-ZÄÖÜ]/.test(rest)) return satzEnde(`${subjekt} ${verb} kein ${rest}${z}`);
    const r = rest.replace(/^noch\b/, "mehr");
    const kein = r.match(/^(ein|eine|einen)\s+(.*)$/);
    if (kein) return satzEnde(`${subjekt} ${verb} k${kein[1]} ${kein[2]}${z}`);
    return satzEnde(`${subjekt} ${verb} nicht ${r}${z}`);
  }
  if (wert === "unbekannt") {
    const s = subjekt === "Er" || subjekt === "Sie" ? subjekt.toLowerCase() : subjekt[0].toLowerCase() + subjekt.slice(1);
    return satzEnde(`Unbekannt, ob ${s} ${rest} ${verb}`);
  }
  return null;
}

/** Ein Satz für eine Antwort */
export function antwortSatz(f: Frage, wert: Wert, a: Antworten): string | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const pron = a.geschlecht === "w" ? "Sie" : a.geschlecht === "m" ? "Er" : "Der Patient";
  const label = antwortLabel(f, wert);
  switch (f.id) {
    case "alter":
      return wert === "unbekannt" ? "Das Alter ist unbekannt." : `${pron} ist ca. ${wert} Jahre alt.`;
    case "geschlecht":
      return wert === "m" ? "Der Patient ist männlich." : wert === "w" ? "Die Patientin ist weiblich." : "Geschlecht unbekannt.";
    case "anrufer":
      return `Anrufer: ${label}.`;
    case "beobachtet":
      return wert === "ja" ? "Der Zusammenbruch wurde beobachtet." : wert === "nein" ? `${pron} wurde so aufgefunden.` : "Unbekannt, ob der Zusammenbruch beobachtet wurde.";
    case "anzahl_patienten":
      return wert === "1" ? "Eine Person ist betroffen." : wert === "n" ? "MEHRERE Personen sind betroffen (2–5)." : wert === "6-10" ? "MEHRERE Personen sind betroffen (6–10)." : wert === "11-30" ? "VIELE Personen sind betroffen (11–30)." : wert === "30+" ? "SEHR VIELE Personen sind betroffen (mehr als 30)." : "Anzahl der Betroffenen unbekannt.";
  }
  if (f.typ === "text") return satzEnde(`${f.text.replace(/\?.*$/, "").replace(/\s*\(.*?\)\s*/g, " ").trim()}: ${String(wert)}`);
  if (f.typ === "zahl") return satzEnde(`${f.text.replace(/\?$/, "")}: ${label}`);
  // Ja/Nein, auch „Ja – wach und reagiert normal“
  const w = String(wert);
  const lm = label.match(/^(Ja|Nein|Unbekannt)\s*[–,-]\s*(.+)$/i);
  const basis = lm ? lm[1].toLowerCase() : w === "ja" || w === "nein" || w === "unbekannt" ? w : null;
  if (basis) {
    const s = jaNeinSatz(f.text, basis, pron, lm ? lm[2] : "");
    if (s) return s;
  }
  // sonst: Frage – Antwort
  return `${f.text.trim()} ${satzEnde(label)}`;
}

/** Sätze zur ganzen Abfrage (oder nur zu den genannten Fragen) */
export function abfrageSaetze(schema: Schema, kapitel: string | null, a: Antworten, nur?: Set<string>): string[] {
  const fragen: Frage[] = [];
  const g = schema.globale_fragen;
  for (const f of [...(g.phase_3_was_ist_passiert ?? [])]) if (f.typ !== "kapitelwahl") fragen.push(f);
  if (kapitel) for (const { frage } of fragenImAblauf(schema, kapitel, a)) fragen.push(frage);
  const out: string[] = [];
  for (const f of fragen) {
    if (nur && !nur.has(f.id)) continue;
    const s = antwortSatz(f, a[f.id], a);
    if (s) out.push(s);
  }
  return out;
}

export function zeitstempel(t: number): string {
  const d = new Date(t);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()}_${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** Block fürs Protokoll */
export function abfrageBlock(titel: string, t: number, saetze: string[], kopf: string[] = []): string {
  return [`*** ${titel}: ${zeitstempel(t)} ***`, ...kopf, ...saetze.map((s, i) => `${i + 1}.${gross(s)}`)].join("\n");
}
