/**
 * Gespräch exportieren: alles, was zu einem Anruf gehört (Chat, Abfrage, Wahrheit des Anrufers,
 * Anweisung an die KI, Protokoll) als Textdatei – zum Weitergeben, damit man Gespräche verbessern kann.
 */
import { kontext } from "../abfrage/gespraech";
import { kiBereit, kiPrefs } from "../abfrage/ki";
import { ktPrompt } from "../abfrage/ktGespraech";
import { systemPrompt } from "../abfrage/anrufer";
import { antwortLabel, fragenImAblauf, type Antworten, type Frage, type Schema } from "../abfrage/schema";
import { store } from "../data/store";
import { saveTextFile } from "../platform";
import { sim, type Anruf, type Einsatz } from "../sim/engine";
import { hhmm, type KtAuftrag } from "../sim/kt";
import { el, toast } from "./dom";
import { onPers, pers } from "./ws/persoenlich";

const zeit = (t: number | undefined) =>
  t ? new Date(t).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–";
const uhr = (t: number | undefined) => (t ? new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–");

function version(): string {
  return document.getElementById("app-version")?.textContent?.trim() ?? "?";
}

function kopf(titel: string, nummer: string, art: string): string[] {
  return [
    `# LeitWerk – Gesprächsexport ${nummer}`,
    "",
    `- Art: ${art}`,
    `- Titel: ${titel}`,
    `- Programmversion: ${version()}`,
    `- Exportiert: ${zeit(Date.now())} (echte Zeit), Spielzeit ${zeit(sim.state.zeit)}`,
    `- Anrufer-Antworten: ${kiBereit() ? `KI (${kiPrefs().modell})` : "feste Antworten (keine KI)"}`,
    `- Spielmodus: ${sim.mode}`,
    "",
  ];
}

function gespraechText(a: Anruf | null | undefined): string[] {
  if (!a) return ["(kein Anruf)", ""];
  const out = [`Status: ${a.status} · Versuche: ${a.versuche}${a.rueckruf ? " · Rückruf durch Leitstelle" : ""}${a.ortung ? ` · Ortung: ${a.ortung.status}${a.ortung.radius ? ` ±${a.ortung.radius} m` : ""}` : ""}`, ""];
  for (const m of a.gespraech) {
    const wer = m.von === "anrufer" ? "Anrufer" : m.von === "system" ? "System" : (m.wer ?? "Leitstelle");
    const q = m.von === "anrufer" && m.quelle ? ` (${m.quelle === "ki" ? "KI" : "fest"})` : "";
    out.push(`[Spiel ${uhr(m.zeit)} | echt ${uhr(m.echt)}] ${wer}${q}: ${m.text}`);
  }
  out.push("");
  return out;
}

function wert(f: Frage | undefined, w: unknown): string {
  if (w === undefined || w === null || w === "") return "–";
  return f ? antwortLabel(f, w as string) : String(w);
}

/** Tabelle: Frage | eingegeben | Wahrheit */
function abfrageTabelle(schema: Schema, kapitel: string | null, eingegeben: Antworten, wahr: Antworten | undefined, wahrKap: string | undefined): string[] {
  const fragen = new Map<string, Frage>();
  for (const f of schema.globale_fragen.phase_3_was_ist_passiert ?? []) fragen.set(f.id, f);
  for (const kap of [kapitel, wahrKap]) if (kap) for (const { frage } of fragenImAblauf(schema, kap, kap === wahrKap && wahr ? wahr : eingegeben)) fragen.set(frage.id, frage);
  const ids = new Set([...fragen.keys(), ...Object.keys(eingegeben), ...Object.keys(wahr ?? {})]);
  const out = ["| Frage | eingegeben | Wahrheit | |", "|---|---|---|---|"];
  for (const id of ids) {
    const f = fragen.get(id);
    const e = wert(f, eingegeben[id]);
    const w = wert(f, wahr?.[id]);
    const anders = e !== "–" && w !== "–" && e !== w ? "⚠ abweichend" : "";
    out.push(`| ${(f?.text ?? id).replace(/\|/g, "/")} | ${e.replace(/\|/g, "/")} | ${w.replace(/\|/g, "/")} | ${anders} |`);
  }
  out.push("");
  return out;
}

function protokollText(p: { zeit: number; text: string; von?: string }[]): string[] {
  return [...p.map((x) => `- ${uhr(x.zeit)} ${x.von ? `(${x.von}) ` : ""}${x.text.replace(/\n/g, "\n  ")}`), ""];
}

export function rdExportText(e: Einsatz): string {
  const schema = store.schema;
  const a = e.anruf;
  const w = e.wahr.abfrage;
  const out = kopf(e.meldung.adresse || "Notruf", e.nummer, "Notfall (RD)");
  out.push("## Gespräch", "", ...gespraechText(a));
  out.push(
    "## Ergebnis",
    "",
    `- Kapitel (Abfrage): ${a?.kapitel ?? "–"} · vorläufiger Code: ${a?.ergebnis?.code ?? "–"}${a?.ergebnis?.reanimation ? " · Reanimation" : ""}`,
    `- Code in der Maske: ${e.code ?? "–"} (${e.codeQuelle ?? "–"})`,
    `- Wahrheit: Kapitel ${w?.kapitel ?? "–"}, Code ${w?.code ?? e.wahr.code}`,
    `- Extra: ${a ? JSON.stringify(a.extra) : "–"}`,
    "",
  );
  if (schema && a) out.push("## Abfrage: eingegeben und Wahrheit", "", ...abfrageTabelle(schema, a.kapitel, a.antworten, w?.antworten, w?.kapitel));
  out.push(
    "## Ort",
    "",
    `- Vom Anrufer genannt: ${e.meldung.adresse}${e.meldung.adresseFalsch ? " (falsche Adresse!)" : ""}`,
    `- Tatsächlich: ${e.wahr.adresse} (${e.wahr.lat.toFixed(5)}, ${e.wahr.lon.toFixed(5)})${w?.ortUnbekannt ? " – Anrufer weiß den Ort nicht genau" : ""}`,
    `- Eingetragen: ${e.adresse?.label ?? "–"}${e.zusatz ? ` · Zusatz: ${e.zusatz}` : ""}`,
    `- Rückrufnummer: ${e.telefon || "–"}`,
    `- Info an RTW: ${e.infoRtw || "–"}`,
    `- Interne Info: ${e.infoIntern || "–"}`,
    `- Fahrzeuge: ${e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]?.funkrufname ?? id).join(", ") || "–"}`,
    `- Partner angefordert: ${Object.keys(e.partner ?? {}).join(", ") || "–"} · noch gebraucht: ${sim.partnerFehlt(e).map((x) => `${x.art} (${x.grund})`).join(", ") || "–"}`,
    "",
  );
  if (w) {
    out.push("## Anrufer (Wahrheit)", "", "```json", JSON.stringify({ anrufer: w.anrufer, lage: w.lage, patientAlter: e.wahr.patientAlter }, null, 2), "```", "");
    const k = kontext(e);
    if (k) out.push("## Anweisung an die KI (System-Prompt)", "", "```text", systemPrompt(k), "```", "");
  }
  out.push("## Protokoll", "", ...protokollText(e.protokoll));
  out.push("## Rohdaten", "", "```json", JSON.stringify({ anruf: a, wahrAbfrage: w, lage: e.wahr.lage }, null, 2), "```", "");
  return out.join("\n");
}

export function ktExportText(k: KtAuftrag): string {
  const sek = !!k.d.sek || !!k.wahr.d.sek;
  const out = kopf(k.d.patient.name || "Auftrag", k.nummer, sek ? "Überstellung (SEK)" : "Krankentransport (KT)");
  out.push("## Gespräch", "", ...gespraechText(k.anruf));
  const zeile = (label: string, e: unknown, w: unknown) => {
    const txt = (x: unknown) => (x === undefined || x === null || x === "" ? "–" : x === true ? "ja" : x === false ? "nein" : String(x));
    const a = txt(e);
    const b = txt(w);
    return `| ${label} | ${a} | ${b} | ${a !== "–" && b !== "–" && a !== b ? "⚠ abweichend" : ""} |`;
  };
  const d = k.d;
  const wd = k.wahr.d;
  out.push(
    "## Auftrag: eingegeben und Wahrheit",
    "",
    "| Feld | eingegeben | Wahrheit | |",
    "|---|---|---|---|",
    zeile("Patient", d.patient.name, wd.patient.name),
    zeile("Alter", d.patient.alter, wd.patient.alter),
    zeile("Abholort", d.von?.label, wd.von?.label),
    zeile("Ziel", d.nach?.label, wd.nach?.label),
    zeile("Abholung", d.abholung ? hhmm(d.abholung) : null, wd.abholung ? hhmm(wd.abholung) : null),
    zeile("Termin", d.termin ? hhmm(d.termin) : null, wd.termin ? hhmm(wd.termin) : null),
    zeile("Grund", d.grund, wd.grund),
    zeile("Transport", d.lage, wd.lage),
    zeile("Begleitperson", d.begleitung, wd.begleitung),
    zeile("Sauerstoff", d.sauerstoff, wd.sauerstoff),
    zeile("Infektion", d.infektion, wd.infektion),
    zeile("SOFORT", d.sofort, wd.sofort),
    zeile("Rückruf", d.telefon, wd.telefon),
    zeile("Code", d.code, wd.code),
    zeile("Überstellung", d.sek ? JSON.stringify(d.sek) : null, wd.sek ? JSON.stringify(wd.sek) : null),
    "",
    `- Anrufer (Wahrheit): ${k.wahr.anrufer.name}, ${k.wahr.anrufer.rolle}`,
    `- Status: ${k.status} · Quelle: ${k.quelle} · Eingang ${zeit(k.eingang)}`,
    "",
  );
  if (k.quelle === "hotline") out.push("## Anweisung an die KI (System-Prompt)", "", "```text", ktPrompt(k), "```", "");
  out.push("## Protokoll", "", ...protokollText(k.protokoll));
  out.push("## Rohdaten", "", "```json", JSON.stringify({ anruf: k.anruf, d: k.d, wahr: k.wahr }, null, 2), "```", "");
  return out.join("\n");
}

export async function gespraechExportieren(art: "rd" | "kt", id: string): Promise<void> {
  const e = art === "rd" ? sim.einsatz(id) : undefined;
  const k = art === "kt" ? sim.ktAuftrag(id) : undefined;
  const text = e ? rdExportText(e) : k ? ktExportText(k) : null;
  if (!text) return void toast("Nichts zu exportieren", "error");
  const nr = (e?.nummer ?? k?.nummer ?? "Gespraech").replace(/[^\w-]+/g, "_");
  try {
    const pfad = await saveTextFile(`Gespraech_${nr}.md`, text, { name: "Text (Markdown)", extensions: ["md", "txt"] });
    if (pfad) toast("Gespräch exportiert");
  } catch (err) {
    toast(String((err as Error).message ?? err), "error");
  }
}

/** Knopf „⤓ Gespräch exportieren“ (lässt sich unter Einstellungen → Persönlich ausblenden) */
export function exportKnopf(art: "rd" | "kt", id: () => string | null, klein = true): HTMLButtonElement {
  const b = el("button", { class: `btn${klein ? " small" : ""} export-knopf`, type: "button", title: "Gespräch, Abfrage, Anweisung an die KI und Protokoll als Datei speichern" }, "⤓ Gespräch exportieren");
  b.addEventListener("click", () => {
    const x = id();
    if (x) void gespraechExportieren(art, x);
  });
  const zeigen = () => (b.hidden = pers().exportKnopf === false);
  zeigen();
  onPers(zeigen);
  return b;
}
