/**
 * Funk über die KI – nach dem Prinzip „Das Programm denkt, die KI redet“:
 * - Den Inhalt eines Funkspruchs bestimmt das Programm (fester Text: Lagemeldung, Nachforderung, Antwort …).
 * - Die KI formuliert ihn wie eine echte Besatzung (kurz, Fachsprache), der Rahmen „Hier …, kommen“ kommt vom Programm.
 * - Das Programm prüft: alle Anforderungen, Zahlen und Namen drin? Nichts erfunden (Patientenname, Messwerte,
 *   neue Anforderungen)? Sonst einmal neu, dann der feste Text.
 * Gilt für jeden Einsatz – auch für künftige und selbst erstellte Fälle.
 * Läuft beim Gesprächsführer (wer das Gespräch begonnen bzw. den Ruf beantwortet hat).
 */
import { ohneVitalwerte, sim, type FunkAusstehend, type FunkGespraech } from "../sim/engine";
import { patientText } from "../sim/lage";
import { buchungName } from "../data/klinik";
import { store } from "../data/store";
import { inTauri } from "../platform";
import { kiBereit, kiChat, kiPrefs, kiStatus, type KiNachricht } from "./ki";
import { zahlenIn } from "./verstehen";

// ------------------------------------------------------------------ Wissen der Besatzung

/** Fahrzeugart in Worten (für die Rolle) */
function besatzungVon(fzId: string): string {
  const fz = sim.state.fahrzeuge[fzId];
  if (!fz) return "Besatzung eines Rettungsmittels";
  const t = fz.rmTyp.toUpperCase();
  if (t === "BEL") return "Bezirkseinsatzleiter (BEL) des Roten Kreuzes";
  if (t === "ACN") return "Acute Community Nurse (diplomierte Pflegekraft mit Notfallsanitäter-Ausbildung und Notfallkompetenz Intubation, allein im Fahrzeug)";
  if (/ÖBB/.test(t)) return "Einsatzleiter der ÖBB";
  if (t === "NAH" || t === "ITH") return "Notarzt-Hubschrauber (Notarzt, Flugretter, Pilot)";
  if (t === "NAW") return "Notarztwagen der Flughafenambulanz (Notarzt, Notfallsanitäter, Rettungssanitäter)";
  if (fz.kategorie === "NEF") return "Notarzteinsatzfahrzeug (Notarzt und Notfallsanitäter)";
  if (fz.kategorie === "RTW") return "Rettungswagen (Notfallsanitäter und Rettungssanitäter)";
  if (fz.kategorie === "KTW") return "Krankentransportwagen (Rettungssanitäter)";
  return `${fz.rmTyp} (Rettungsdienst)`;
}

/** Was die Besatzung weiß (für freie Fragen der Leitstelle) – Messwerte nur auf Nachfrage */
export function lageWissen(fzId: string, einsatzId: string | null, frage = ""): string {
  const fz = sim.state.fahrzeuge[fzId];
  const e = einsatzId ? sim.einsatz(einsatzId) : fz?.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  if (!fz) return "";
  const teile = [`Status: ${sim.statusDef(fz.status).name}.`];
  if (!e) {
    teile.push("Ihr habt gerade keinen Einsatz.");
    return teile.join("\n");
  }
  teile.push(`Euer Einsatz: ${e.nummer}, Einsatzort ${e.adresse?.label ?? "unbekannt"}.`);
  const vorOrt = ["vorOrt", "warteKH", "transport", "uebergabe", "rendezvous", "treffpunkt", "suche"].includes(fz.phase);
  const l = e.wahr.lage;
  if (vorOrt && l) {
    teile.push(`Was ihr vor Ort seht: ${l.patienten.map((p) => patientText(p)).join("; ")}.`);
    // Messwerte kennt die KI nur, wenn die Leitstelle ausdrücklich danach fragt – sonst erzählt sie sie ungefragt
    const befund = l.fall?.kern ? (WERT_FRAGE.test(frage) ? l.fall.kern : ohneVitalwerte(l.fall.kern)) : "";
    if (befund) teile.push(`Befund: ${befund}.${WERT_FRAGE.test(frage) ? " (Nur die Messwerte nennen, die hier stehen.)" : " (Keine Messwerte nennen.)"}`);
    const v = e.kh?.grund ?? e.verdacht ?? e.wahr.verdacht;
    if (v) teile.push(`Verdacht: ${buchungName(v)}.`);
    const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
    if (h) teile.push(`Zielkrankenhaus: ${h.kurzname || h.name}.`);
    const offen = (e.nachforderungen ?? []).filter((n) => !n.erledigt);
    if (offen.length) teile.push(`Noch offen angefordert: ${offen.map((n) => (n.art === "NA" ? "Notarzt" : n.art === "BIT" ? "BIT" : `${n.anzahl}× Rettungsmittel`)).join(", ")}.`);
  } else teile.push("Ihr seid noch nicht beim Patienten und wisst nur, was die Leitstelle durchgegeben hat.");
  if (e.rendezvous && e.rendezvous.status !== "fertig") teile.push(`Rendezvous mit dem Notarzt: Treffpunkt ${e.rendezvous.punkt.label}.`);
  if (fz.phaseEnde && ["anfahrt", "transport", "rendezvous", "ausruecken"].includes(fz.phase)) teile.push(`Ankunft in ca. ${Math.max(1, Math.round((fz.phaseEnde - sim.state.zeit) / 60000))} Minuten.`);
  return teile.join("\n");
}

/** Namen des Patienten (dürfen am Funk nie vorkommen) */
function patientNamen(einsatzId: string | null): string[] {
  const e = einsatzId ? sim.einsatz(einsatzId) : undefined;
  const n = e?.wahr.abfrage?.szenario?.patient.name ?? "";
  return n.split(/\s+/).filter((x) => x.length >= 3);
}

// ------------------------------------------------------------------ Rahmen und Inhalt

/** „Hier 75/001 mit einer Lagemeldung, X, kommen“ → Kopf, Inhalt, Schluss */
export function zerlegen(fest: string): { kopf: string; inhalt: string; schluss: string } {
  const m = fest.trim().match(/^(Hier [^,]+?)(?:,\s*|\.\s+)([\s\S]*?)(?:,?\s*(kommen|Ende)\W*)?$/i);
  if (!m) return { kopf: "", inhalt: fest.replace(/,?\s*kommen\W*$/i, ""), schluss: "kommen" };
  return { kopf: m[1], inhalt: m[2].trim(), schluss: m[3] ? (m[3].toLowerCase() === "ende" ? "Ende" : "kommen") : "kommen" };
}

/** KI-Text auf den Inhalt kürzen: kein eigener Kopf, kein „kommen“, keine Anführungszeichen */
function nurInhalt(t: string, rufname: string): string {
  let x = t.replace(/[„“"»«*]/g, "").replace(/\s+/g, " ").trim();
  const r = rufname.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  x = x.replace(new RegExp(`^(LEO,?\\s*)?(von\\s+${r},?\\s*)?(hier\\s+)?${r}(\\s+mit einer Lagemeldung)?[,.:]?\\s*`, "i"), "");
  x = x.replace(/^(LEO|Leitstelle)[,:]\s*/i, "").replace(/^hier\s+[^,.]+[,.]\s*/i, "");
  x = x.replace(/[,.\s]*(kommen|ende|over)\W*$/i, "").replace(/[.,;\s]+$/, "");
  return x;
}

/** Fertiger Funkspruch aus Kopf, Inhalt und Schluss (Lagemeldung: „Hier X mit einer Lagemeldung. …, kommen.“) */
export function zusammensetzen(kopf: string, inhalt: string, schluss: string): string {
  const i = inhalt.charAt(0).toUpperCase() + inhalt.slice(1);
  if (!kopf) return `${i}, ${schluss}`;
  if (/Lagemeldung$/i.test(kopf)) return `${kopf}. ${i}, ${schluss}.`;
  return `${kopf}, ${inhalt}, ${schluss}`;
}

// ------------------------------------------------------------------ Prüfen

const ANFORDERUNG: [RegExp, RegExp][] = [
  // [im Inhalt vorhanden → muss auch in der Antwort vorkommen]
  [/notarzt|\bnef\b|\bna\b/i, /notarzt|\bnef\b|\bna\b|hubschrauber|christophorus|\bc ?\d+/i],
  [/rettungsmittel|\brtw\b/i, /rettungsmittel|\brtw\b|\bktw\b|fahrzeug|wagen/i],
  [/\bbit\b|schwerlast/i, /\bbit\b|schwerlast/i],
  [/feuerwehr/i, /feuerwehr/i],
  [/polizei/i, /polizei/i],
  [/bergrettung/i, /bergrettung/i],
  [/wasserrettung/i, /wasserrettung/i],
  [/storno/i, /storno|nicht (mehr )?(erforderlich|nötig|benötigt)|abbestell/i],
  [/reanimation|reanimationspflichtig/i, /reanim|cpr|herzdruck/i],
  [/verstorben|tod /i, /verstorben|tot\b|tod/i],
  [/eigenschutz/i, /eigenschutz|sicher(em|en) abstand|abstand/i],
  [/rendezvous/i, /rendezvous|treffpunkt|treffen/i],
  [/voranmeldung|schockraum/i, /voranmeld|schockraum|notaufnahme|anmeld/i],
];
/** Anforderungen, die die KI nicht erfinden darf */
const ERFUNDEN: [RegExp, RegExp][] = [
  [/(benötig|brauch|fordern|anfordern|bitte|schick)[^.]*\b(notarzt|nef|hubschrauber|christophorus)\b|\b(notarzt|nef|hubschrauber)\b[^.]*(benötig|brauch|nachgefordert)/i, /notarzt|\bnef\b|\bna\b|hubschrauber|christophorus|\bc ?\d/i],
  [/(benötig|brauch|fordern|bitte|schick)[^.]*\b(feuerwehr)\b/i, /feuerwehr/i],
  [/(benötig|brauch|fordern|bitte|schick)[^.]*\b(polizei)\b/i, /polizei/i],
  [/(benötig|brauch|fordern|bitte|schick)[^.]*\b(rtw|rettungsmittel|ktw)\b/i, /rettungsmittel|\brtw\b|\bktw\b/i],
  [/(benötig|brauch|fordern|bitte)[^.]*\bbit\b/i, /\bbit\b/i],
  [/storno/i, /storno/i],
];
/** Fragt die Leitstelle ausdrücklich nach Messwerten? */
const WERT_FRAGE = /sättigung|spo2|blutdruck|\brr\b|puls|herzfrequenz|blutzucker|\bbz\b|vital|temperatur|fieber|gcs|atemfrequenz|werte/i;
const MESSWERT = /(sättigung|spo2|spo₂|blutdruck|\brr\b|puls|herzfrequenz|blutzucker|\bbz\b|temperatur|\bgcs\b|atemfrequenz)\s*(von|bei|um|liegt bei|ist|:)?\s*(ca\.?\s*)?\d|\d+\s*(%|mmhg|\/min\b|mg\/dl)/i;

/** Eigennamen im Inhalt, die bleiben müssen (Krankenhäuser, Treffpunkte, Hubschrauber-Rufnamen) */
function namenIm(inhalt: string): string[] {
  const out: string[] = [];
  for (const m of inhalt.matchAll(/\b(?:LK|UK|KH|Klinik|Landesklinikum|Universitätsklinikum)\s+([A-ZÄÖÜ][\wäöüß.-]+)/g)) out.push(m[1]);
  for (const m of inhalt.matchAll(/\bRendezvous\s+(?:in\s+|bei\s+|an\s+der\s+)?([A-ZÄÖÜ][\wäöüß.-]+)/g)) out.push(m[1]);
  for (const m of inhalt.matchAll(/\b(C\s?\d+)\b/g)) out.push(m[1].replace(/\s/, ""));
  return out;
}

/** Widerspricht der formulierte Inhalt dem festen? Gibt die Gründe zurück (leer = passt) */
export function funkPruefen(festGanz: string, text: string, opt: { frage?: string; namen?: string[]; art?: FunkAusstehend["art"]; wissen?: string } = {}): string[] {
  const g: string[] = [];
  let fest = festGanz;
  const a = text.toLowerCase();
  if (!a.trim()) return ["leer"];
  if (text.length > 420) g.push("zu lang");
  // nie der Name des Patienten
  for (const n of opt.namen ?? []) if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) g.push("Name des Patienten am Funk");
  // Messwerte nur auf Nachfrage
  const wertGefragt = WERT_FRAGE.test(opt.frage ?? "");
  if (!wertGefragt && MESSWERT.test(text) && !MESSWERT.test(fest)) g.push("Messwerte ungefragt");
  if (opt.art === "frage") {
    // freie Antwort: keine Zahl, die die Besatzung nicht kennt (erfundene Messwerte, Minuten …)
    if (opt.wissen !== undefined) {
      const bekannt = new Set(zahlenIn(`${opt.wissen} ${opt.frage ?? ""}`));
      for (const z of zahlenIn(text.replace(/\b\d{2,3}\/\d{3}\b/g, "").replace(/\bC\s?\d+\b/gi, ""))) if (z > 1 && !bekannt.has(z)) g.push(`Zahl ${z} erfunden`);
    }
    return [...new Set(g)];
  }
  // geprüft wird gegen den Inhalt (ohne „Hier …“ und „kommen“)
  fest = zerlegen(fest).inhalt;
  // alles Wichtige aus dem Inhalt muss drin sein
  for (const [im, muss] of ANFORDERUNG) if (im.test(fest) && !muss.test(text)) g.push(`fehlt: ${im.source.split("|")[0].replace(/\\b/g, "")}`);
  // nichts Neues anfordern
  for (const [neu, imFest] of ERFUNDEN) if (neu.test(text) && !imFest.test(fest)) g.push(`erfunden: ${neu.source.match(/\(([a-z|]+)\)\\b/)?.[1]?.split("|")[0] ?? "Anforderung"}`);
  // Zahlen (Minuten, Anzahl, Hausnummern …) und Namen bleiben
  // Funkrufnamen („75/001“) und Hubschrauber („C2“) zählen nicht als Zahl
  const ohneRufnamen = (x: string) => x.replace(/\b\d{2,3}\/\d{3}\b/g, "").replace(/\bC\s?\d+\b/gi, "").replace(/\bÖAMTC \d+\b/g, "");
  const zahlenFest = zahlenIn(ohneRufnamen(fest)).filter((z) => z > 0);
  const zahlenText = new Set(zahlenIn(ohneRufnamen(text)));
  for (const z of zahlenFest) if (!zahlenText.has(z)) g.push(`Zahl ${z} fehlt`);
  for (const n of namenIm(fest)) if (!a.replace(/\s/g, "").includes(n.toLowerCase().replace(/\s/g, ""))) g.push(`${n} fehlt`);
  return [...new Set(g)];
}

// ------------------------------------------------------------------ Formulieren

const BEISPIELE = [
  "Pat. mit starkem Druckgefühl in der Brust, Atemnot und kaltschweißig",
  "Bestätigter Verkehrsunfall, PKW gegen Baum. 4 Personen betroffen, 2 davon verletzt. 1x Rot mit Thoraxtrauma und Bewusstseinstrübung, 1x Gelb mit Rückenschmerzen und leichten neurologischen Ausfällen in den Beinen. Bitte einen weiteren RTW und 2x NEF",
  "Pat. mit einer leichten Schnittverletzung am Finger, kreislaufstabil. Das wäre ein Storno für das NEF",
  "Pat. öffnet die Tür nicht, kein Kontakt zum Patienten. Wir bräuchten einmal die Feuerwehr zur Türöffnung",
  "Pat. mit Brustschmerzen und Hebungen im EKG, wir würden ein NEF benötigen",
  "Pat. männlich, 43 Jahre, mit Hemiparese links seit 1 Stunde. Frage, wäre ein Hubschrauber verfügbar",
];

/** Fahrzeug, das spricht (beim Funk zwischen Fahrzeugen bzw. Pilot ↔ RTW nicht unbedingt das des Gesprächs) */
function sprecherId(g: FunkGespraech, a: FunkAusstehend): string {
  return (Object.values(sim.state.fahrzeuge).find((x) => sim.rufname(x) === a.von) ?? sim.state.fahrzeuge[g.fzId])?.id ?? g.fzId;
}

function systemText(g: FunkGespraech, a: FunkAusstehend): string {
  const fz = sim.state.fahrzeuge[sprecherId(g, a)];
  const an = a.an ?? "LEO (die Leitstelle)";
  return [
    `Du bist in einer Trainingssimulation die Besatzung von „${a.von}“ – ${besatzungVon(fz?.id ?? g.fzId)} – im Rettungsdienst Niederösterreich am Funk (TETRA). Du sprichst mit ${an}.`,
    "Du sagst NUR den Inhalt des Funkspruchs. Den Anfang („Hier …“) und das „kommen“ am Ende setzt das Programm – schreib sie NICHT.",
    "Funksprache: knapp und sachlich wie eine erfahrene Besatzung, Fachbegriffe sind gut (Pat., kreislaufstabil, Thoraxtrauma, Hemiparese, Hebungen im EKG). Ein bis drei kurze Sätze oder Stichworte. Keine Höflichkeitsfloskeln, keine Erklärungen, keine Regieanweisungen.",
    "Regeln: NIEMALS den Namen des Patienten. Keine Messwerte (Sättigung, Blutdruck, Puls …), außer die Leitstelle fragt ausdrücklich danach. Fordere nichts an und storniere nichts, was nicht im Inhalt steht. Zahlen, Uhrzeiten, Orte, Krankenhäuser und Rufnamen genau so übernehmen.",
    `So klingt das (nur der Ton, nicht übernehmen): ${BEISPIELE.map((b) => `„${b}“`).join(" / ")}`,
  ].join("\n");
}

function aufgabeText(g: FunkGespraech, a: FunkAusstehend, inhalt: string): string {
  if (a.art === "frage") {
    return [
      "WAS IHR WISST:",
      lageWissen(sprecherId(g, a), g.einsatzId, a.frage ?? ""),
      `${a.an ? a.an : "Die Leitstelle"} fragt: „${a.frage ?? ""}“`,
      "Antworte knapp, nur mit dem, was ihr wisst. Was ihr nicht wisst: „noch nicht beurteilbar“ oder „unbekannt“.",
    ].join("\n");
  }
  return [
    a.frage ? `${a.an ? a.an : "Die Leitstelle"} hat gesagt: „${a.frage}“` : "",
    `INHALT (genau das sagen, nichts weglassen, nichts dazu): ${inhalt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Formulierten Funkspruch erzeugen (KI, geprüft) – sonst der feste */
export async function funkSpruchErzeugen(g: FunkGespraech, a: FunkAusstehend): Promise<{ text: string; quelle: "ki" | "fest"; nachgebessert?: string }> {
  const fest = { text: a.fest, quelle: "fest" as const };
  if (kiPrefs().funk === "fest" || !kiPrefs().aktiv) return fest;
  if (!kiBereit() && inTauri()) await kiStatus().catch(() => null);
  if (!kiBereit()) return fest;
  const { kopf, inhalt, schluss } = zerlegen(a.fest);
  const verlauf: KiNachricht[] = [
    { role: "system", content: systemText(g, a) },
    { role: "user", content: aufgabeText(g, a, inhalt) },
  ];
  const namen = patientNamen(g.einsatzId);
  const wissen = a.art === "frage" ? lageWissen(sprecherId(g, a), g.einsatzId, a.frage ?? "") : undefined;
  const versuch = async (msgs: KiNachricht[]) => nurInhalt(await kiChat(msgs), a.von);
  try {
    let t = await versuch(verlauf);
    let probleme = funkPruefen(a.fest, t, { frage: a.frage, namen, art: a.art, wissen });
    let nach: string | undefined;
    if (probleme.length) {
      const nochmal = [...verlauf, { role: "assistant" as const, content: t }, { role: "user" as const, content: `Das war nicht richtig (${probleme.join("; ")}). Sag den Inhalt nochmal, vollständig und ohne etwas dazuzuerfinden: ${inhalt}` }];
      const t2 = await versuch(nochmal);
      const p2 = funkPruefen(a.fest, t2, { frage: a.frage, namen, art: a.art, wissen });
      nach = `neu erzeugt (${probleme.join("; ")})`;
      if (p2.length) return { ...fest, nachgebessert: `feste Meldung (${p2.join("; ")})` };
      t = t2;
      probleme = p2;
    }
    if (!t) return fest;
    return { text: zusammensetzen(kopf, t, schluss), quelle: "ki", nachgebessert: nach };
  } catch (err) {
    console.warn("Funk-KI", err);
    return fest;
  }
}

// ------------------------------------------------------------------ Dienst: formuliert, was ich als Gesprächsführer sagen lassen muss

const laufend = new Set<string>();

function ichFuehre(g: FunkGespraech, ich: string): boolean {
  return sim.mode === "solo" || !g.fuehrer || g.fuehrer.pid === ich;
}

/** Ausstehende Funksprüche formulieren, die ich als Gesprächsführer erzeugen muss */
export function funkDienst(ich: string): void {
  for (const g of sim.state.funkGespraeche ?? []) {
    const a = g.ausstehend;
    if (!a || !ichFuehre(g, ich)) continue;
    const key = `${g.id}:${g.sprueche.length}`;
    if (laufend.has(key)) continue;
    laufend.add(key);
    void funkSpruchErzeugen(g, a)
      .then((r) => sim.call("funkFzAntwort", g.id, r.text, r.quelle))
      .catch((err) => console.warn("Funk", err))
      .finally(() => setTimeout(() => laufend.delete(key), 30_000));
  }
}
