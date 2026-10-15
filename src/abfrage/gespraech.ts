/**
 * Notrufgespräch: Fragen der Leitstelle an den Anrufer schicken und seine Antwort holen –
 * mit KI (Ollama) oder, wenn keine KI läuft, mit einfachen Antworten aus der „Wahrheit“.
 * Läuft auf dem Rechner des Gesprächsführers; Ergebnisse gehen über sim.call an alle.
 */
import { store } from "../data/store";
import { sim, type Einsatz } from "../sim/engine";
import { antwortOhneKi, erinnerung, ersterSatzOhneKi, systemPrompt, type AnrufKontext } from "./anrufer";
import { kiBereit, kiPrefs, kiStatus, type KiNachricht } from "./ki";
import { kiAntwortNeu, nachrichtArt } from "./runde";
import { inTauri } from "../platform";
import { fragenImAblauf, type Frage } from "./schema";
import { anruferSagt, satzSprecher } from "../ui/sprache";

/** für Vergleiche: klein, ohne Satzzeichen */
function normFrage(t: string): string {
  return t.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-zäöüß0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Wurde diese Frage schon gestellt (und beantwortet)? */
export function schonGefragt(gespraech: { von: string; text: string }[], frage: string): boolean {
  const n = normFrage(frage);
  if (!n) return false;
  // die gerade gestellte Frage steht evtl. schon als letzte Nachricht im Verlauf
  const bis = gespraech.length && gespraech[gespraech.length - 1].von === "leitstelle" && normFrage(gespraech[gespraech.length - 1].text) === n ? gespraech.length - 1 : gespraech.length;
  for (let i = 0; i < bis; i++) {
    const m = gespraech[i];
    if (m.von === "leitstelle" && (normFrage(m.text) === n || normFrage(m.text).startsWith(n) || n.startsWith(normFrage(m.text))) && gespraech.slice(i + 1, bis).some((x) => x.von === "anrufer")) return true;
  }
  return false;
}

export const ERÖFFNUNG = "Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?";

export function kontext(e: Einsatz): AnrufKontext | null {
  const w = e.wahr.abfrage;
  const schema = store.schema;
  if (!w || !schema || !e.anruf) return null;
  return {
    schema,
    anrufer: w.anrufer,
    kapitel: w.kapitel,
    // Fallgeschichte: weitere Antworten (auch zu Fragen anderer Kapitel); die des Schemas haben Vorrang
    wahrheit: { ...(w.szenario?.zusatz ?? {}), ...w.antworten },
    lage: w.lage,
    adresse: e.meldung.adresse,
    patientAlter: e.wahr.patientAlter,
    versuche: e.anruf.versuche,
    rueckrufDurchLeitstelle: e.anruf.rueckruf,
    ortUnbekannt: !!w.ortUnbekannt,
    szenario: w.szenario,
  };
}

/** Läuft gerade eine Antwort? (pro Einsatz nur eine gleichzeitig) */
const laufend = new Set<string>();
export function antwortetGerade(id: string): boolean {
  return laufend.has(id);
}

function einfacheAntwort(k: AnrufKontext, frage: string, schemaFrage?: Frage): string {
  if (schemaFrage) return antwortOhneKi(k, schemaFrage);
  // freie Frage: passendste Frage der Abfrage suchen (gemeinsame Wörter)
  const woerter = new Set(normFrage(frage).split(" ").filter((w) => w.length > 3));
  let beste: Frage | null = null;
  let punkte = 1;
  for (const { frage: sf } of fragenImAblauf(k.schema, k.kapitel, k.wahrheit)) {
    const p = normFrage(sf.text).split(" ").filter((w) => w.length > 3 && woerter.has(w)).length;
    if (p > punkte) {
      punkte = p;
      beste = sf;
    }
  }
  if (beste) return antwortOhneKi(k, beste);
  const f = frage.toLowerCase();
  if (/notfallort|adresse|wo\b|wohin/.test(f)) return k.adresse;
  if (/nummer|erreichbar/.test(f)) return k.anrufer.nummer;
  if (/passiert|was ist|was los/.test(f)) return antwortOhneKi(k, { id: "schilderung", typ: "text", text: frage } as Frage);
  if (/alt\b|alter|jahre/.test(f)) return k.patientAlter ? `So um die ${k.patientAlter}.` : "Das weiß ich nicht genau.";
  if (/name/.test(f)) return k.anrufer.name;
  return "Das weiß ich nicht genau.";
}

/**
 * Leitstelle fragt (frei oder per 🗨 aus dem Schema); der Anrufer antwortet.
 * onToken zeigt die KI-Antwort live an (nur beim Gesprächsführer).
 */
export async function fragen(e: Einsatz, text: string, schemaFrage?: Frage, onToken?: (t: string) => void): Promise<void> {
  const k = kontext(e);
  if (!k || laufend.has(e.id)) return;
  laufend.add(e.id);
  try {
    if (text) await sim.call("anrufNachricht", e.id, "leitstelle", text);
    const quelle = { wert: "ki" as "ki" | "fest" };
    // fertige Sätze schon vorlesen, während die KI noch schreibt
    const sprecher = satzSprecher((satz) => e.anruf?.status === "aktiv" && anruferSagt(satz, k.anrufer, e.id));
    const antwort = await anruferAntwort(e, k, text, schemaFrage, (t) => {
      onToken?.(t);
      sprecher.token(t);
    }, quelle);
    if (antwort) {
      await sim.call("anrufNachricht", e.id, "anrufer", antwort, quelle.wert);
      sprecher.ende(antwort);
    }
  } finally {
    laufend.delete(e.id);
  }
}

/** Erster Satz des Anrufers nach dem Abheben */
export async function eroeffnen(e: Einsatz, onToken?: (t: string) => void): Promise<void> {
  await fragen(e, ERÖFFNUNG, undefined, onToken);
}

async function anruferAntwort(
  e: Einsatz,
  k: AnrufKontext,
  frage: string,
  schemaFrage: Frage | undefined,
  onToken?: (t: string) => void,
  quelle: { wert: "ki" | "fest" } = { wert: "ki" },
): Promise<string> {
  quelle.wert = "fest";
  // Andere Leitstelle und eCall: die erste Meldung kommt fix vom Programm
  const x = k.anrufer;
  const ersteAntwort = !(e.anruf?.gespraech ?? []).some((m) => m.von === "anrufer");
  const pause = () => new Promise((r) => setTimeout(r, 700));
  if (ersteAntwort && frage === ERÖFFNUNG && (x.art === "ecall" || x.art === "leitstelle")) {
    await pause();
    return ersterSatzOhneKi(k);
  }
  if (x.art === "ecall" && !x.sprachkontakt) {
    await pause();
    return "(keine Antwort – im Hintergrund nur Geräusche aus dem Fahrzeug)";
  }
  // Ollama evtl. erst nach dem Programmstart gestartet: Status neu holen
  if (!kiBereit() && inTauri() && kiPrefs().aktiv) await kiStatus().catch(() => null);
  if (!kiBereit()) {
    // Ohne KI: kurze Pause wie beim Sprechen, dann die passende Antwort
    await new Promise((r) => setTimeout(r, 600));
    const erste = (e.anruf?.gespraech ?? []).filter((m) => m.von === "anrufer").length === 0;
    if (erste && frage === ERÖFFNUNG) return ersterSatzOhneKi(k);
    const a = einfacheAntwort(k, frage, schemaFrage);
    return schonGefragt(e.anruf?.gespraech ?? [], frage) ? `Wie gesagt: ${a.charAt(0).toLowerCase()}${a.slice(1)}` : a;
  }
  const verlauf: KiNachricht[] = [{ role: "system", content: systemPrompt(k) }];
  for (const m of e.anruf?.gespraech ?? []) {
    if (m.von === "leitstelle") verlauf.push({ role: "user", content: `Leitstelle: ${m.text}` });
    else if (m.von === "anrufer") verlauf.push({ role: "assistant", content: m.text });
  }
  // Die gerade gestellte Frage ist evtl. noch nicht im synchronisierten Verlauf
  const letzte = verlauf[verlauf.length - 1];
  if (frage && !(letzte.role === "user" && letzte.content === `Leitstelle: ${frage}`)) {
    verlauf.push({ role: "user", content: `Leitstelle: ${frage}` });
  }
  // Kurzer Hinweis an die letzte Frage hängen (wird nicht im Verlauf gespeichert)
  const zuletzt = verlauf[verlauf.length - 1];
  if (zuletzt.role === "user") {
    const sf = schemaFrage ?? (frage === ERÖFFNUNG ? ({ id: "ort_adresse", typ: "text", text: frage } as Frage) : undefined);
    const g = e.anruf?.gespraech ?? [];
    const letzteAntwort = [...g].reverse().find((m) => m.von === "anrufer")?.text;
    verlauf[verlauf.length - 1] = {
      role: "user",
      content: `${zuletzt.content}\n${erinnerung(k, sf, { wiederholt: schonGefragt(g, frage), letzteAntwort, art: sf ? "frage" : nachrichtArt(frage), text: frage, erste: ersteAntwort })}`,
    };
  }
  try {
    const g = e.anruf?.gespraech ?? [];
    const frueher = g.filter((m) => m.von === "anrufer").map((m) => m.text);
    const t = await kiAntwortNeu(verlauf, frueher, (x) => onToken?.(x), { pruefen: !schonGefragt(g, frage) });
    quelle.wert = "ki";
    return t;
  } catch (err) {
    console.warn("KI-Antwort", err);
    return einfacheAntwort(k, frage, schemaFrage);
  }
}
