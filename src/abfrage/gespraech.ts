/**
 * Notrufgespräch: Fragen der Leitstelle an den Anrufer schicken und seine Antwort holen –
 * mit KI (Ollama) oder, wenn keine KI läuft, mit einfachen Antworten aus der „Wahrheit“.
 * Läuft auf dem Rechner des Gesprächsführers; Ergebnisse gehen über sim.call an alle.
 */
import { store } from "../data/store";
import { sim, type Einsatz } from "../sim/engine";
import { antwortOhneKi, erinnerung, ersterSatzOhneKi, sprachFilter, systemPrompt, zusammenfassungPruefen, type AnrufKontext } from "./anrufer";
import { kiBereit, kiPrefs, kiStatus, type KiNachricht } from "./ki";
import { kiAntwortNeu, nachrichtArt, ohneVorspann } from "./runde";
import { inTauri } from "../platform";
import { fragenImAblauf, type Frage } from "./schema";
import { anruferSagt, satzSprecher } from "../ui/sprache";
import { ohnePatientWort } from "./sprechfrage";
import { ist } from "./themen";

/** Welche Schemafragen in diesem Notruf schon gestellt wurden (die Formulierung wechselt) */
const gefragt = new Map<string, Set<string>>();
function schonGefragtId(e: Einsatz, f: Frage | undefined): boolean {
  return !!f && !!gefragt.get(e.id)?.has(f.id);
}

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
    verlauf: w.verlauf,
  };
}

/** Läuft gerade eine Antwort? (pro Einsatz nur eine gleichzeitig) */
const laufend = new Set<string>();
export function antwortetGerade(id: string): boolean {
  return laufend.has(id);
}

function einfacheAntwort(k: AnrufKontext, frage: string, schemaFrage?: Frage): string {
  if (schemaFrage) return antwortOhneKi(k, schemaFrage);
  const art = nachrichtArt(frage);
  if (art === "mitteilung") return "Okay, danke.";
  if (art === "anweisung") return "Okay, mach ich.";
  if (art === "abschluss") return "Danke, auf Wiederhören.";
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

const zufallAus = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

/**
 * Vorwärmen: Solange ein Notruf klingelt, lässt die KI schon die erste Antwort (auf „Wo genau ist der
 * Notfallort?“) schreiben. Dabei lädt Ollama das Modell und liest die lange Anweisung – beim Annehmen
 * ist die erste Antwort dann (fast) sofort da. Immer nur ein Anruf gleichzeitig.
 */
const vorab = new Map<string, Promise<{ text: string; quelle: "ki" | "fest" } | null>>();
let vorabLaeuft = false;
const vorabSchluessel = (e: Einsatz) => `${e.id}:${e.anruf?.versuche ?? 0}:${e.anruf?.rueckruf ? 1 : 0}`;

/** Während eines Testlaufs ruht das Vorwärmen (die KI ist mit dem Testlauf beschäftigt) */
export const testlaufStatus = { aktiv: false };

export function vorwaermen(): void {
  if (vorabLaeuft || testlaufStatus.aktiv || !kiBereit()) return;
  // alte Einträge (Anruf längst angenommen oder vorbei) wegräumen
  for (const key of vorab.keys()) {
    const e = sim.einsatz(key.split(":")[0]);
    if (!e?.anruf || !["klingelt", "aktiv"].includes(e.anruf.status)) vorab.delete(key);
  }
  const e = sim.state.einsaetze.find((x) => x.anruf?.status === "klingelt" && !!x.wahr.abfrage && !x.anruf.gespraech.some((m) => m.von === "anrufer") && !vorab.has(vorabSchluessel(x)));
  if (!e) return;
  const k = kontext(e);
  if (!k) return;
  vorabLaeuft = true;
  const quelle = { wert: "ki" as "ki" | "fest" };
  const p = anruferAntwort(e, k, ERÖFFNUNG, undefined, undefined, quelle)
    .then((text) => (text ? { text, quelle: quelle.wert } : null))
    .catch(() => null)
    .finally(() => {
      vorabLaeuft = false;
      setTimeout(vorwaermen, 0);
    });
  vorab.set(vorabSchluessel(e), p);
}

/** Schon vorbereitete erste Antwort holen (wartet, falls sie gerade noch geschrieben wird) */
async function vorabAntwort(e: Einsatz, text: string, schemaFrage?: Frage): Promise<{ text: string; quelle: "ki" | "fest" } | null> {
  if (text !== ERÖFFNUNG || schemaFrage || (e.anruf?.gespraech ?? []).some((m) => m.von === "anrufer")) return null;
  const key = vorabSchluessel(e);
  const p = vorab.get(key);
  if (!p) return null;
  vorab.delete(key);
  return p;
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
    const wiederholt = schonGefragtId(e, schemaFrage);
    if (schemaFrage) {
      if (!gefragt.has(e.id)) gefragt.set(e.id, new Set());
      gefragt.get(e.id)!.add(schemaFrage.id);
    }
    const quelle = { wert: "ki" as "ki" | "fest" };
    // fertige Sätze schon vorlesen, während die KI noch schreibt
    const sprecher = satzSprecher((satz) => e.anruf?.status === "aktiv" && anruferSagt(satz, k.anrufer, e.id));
    const start = Date.now();
    const fertig = await vorabAntwort(e, text, schemaFrage);
    if (fertig) {
      // vorbereitet – aber der Anrufer hört erst zu: so lange, wie man den Satz zum Sprechen braucht, plus kurz Luft holen
      const sprechzeit = text.length * 65 + 600 + Math.random() * 800;
      const rest = sprechzeit - (Date.now() - start);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      quelle.wert = fertig.quelle;
      onToken?.(fertig.text);
      sprecher.token(fertig.text);
    }
    const antwort =
      fertig?.text ??
      (await anruferAntwort(e, k, text, schemaFrage, (t) => {
        onToken?.(t);
        sprecher.token(t);
      }, quelle, wiederholt));
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

/** Frei gestellte Frage, die einer Grundfrage entspricht (Eröffnung, „Was ist passiert?“) */
function freieSchemaFrage(frage: string): Frage | undefined {
  if (frage === ERÖFFNUNG) return { id: "ort_adresse", typ: "text", text: frage } as Frage;
  // letzter Satz, ohne „okay, danke“ davor
  const teile = frage.toLowerCase().split(/[.!?]+\s*/).map((t) => ohneVorspann(t)).filter(Boolean);
  const t = (teile[teile.length - 1] ?? "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (/^(und )?(was ist (denn |da |eigentlich |genau )*(passiert|los|geschehen)|was genau ist (passiert|los)|was (ist )?(hat|haben) (sich )?(denn )?(passiert|ereignet)|worum geht('?s| es)|(erzählen|sagen|schildern|beschreiben) sie (mir )?(mal |bitte |kurz |doch )*(was|worum))/.test(t))
    return { id: "schilderung", typ: "text", text: frage } as Frage;
  if (/^(was|wie) (ist|lautet) (denn )?(ihre|die) (genaue )?(addresse|adresse)|^(wo|wohin) (genau )?(sind sie|ist (das|der notfallort|es|der einsatzort|die einsatzstelle))|^(ihre|die) (genaue )?adresse|^(können|könnten) sie mir (bitte )?sagen,? wo|^wo (genau )?(befinden sie sich|ist das passiert)|^(in )?welche[mn]? (ort|gemeinde|straße|stadt)/.test(t))
    return { id: "ort_adresse", typ: "text", text: frage } as Frage;
  return undefined;
}

/** Wie viele Sätze der Anrufer auf einmal sagt: auf den Einstieg und „Was ist passiert?“ nur wenig, je nach Art */
function hoechstSaetze(k: AnrufKontext, sf: Frage | undefined, erste: boolean): number {
  const stil = k.anrufer.persona?.stil ?? "normal";
  if (sf?.id === "ort_adresse" && erste) {
    // Adresse: ein Satz; mit „Bitte schnell!“ oder „Hallo, bin ich richtig?“ davor zwei
    const e = k.anrufer.persona?.einstieg;
    return e === "dringend" || e === "umschreibung" || e === "vorstellung" || k.versuche > 1 || k.rueckrufDurchLeitstelle ? 2 : 1;
  }
  if (sf?.id === "ort_adresse") return 2;
  if (sf?.id === "schilderung") return k.anrufer.persona?.wissen === "profi" ? 2 : stil === "gespraechig" ? 3 : stil === "knapp" ? 1 : 2;
  return stil === "gespraechig" ? 4 : 3;
}

/**
 * Atemnot: wer selbst kaum Luft kriegt, redet in Fetzen – kurze Wortgruppen mit „…“ dazwischen,
 * insgesamt nur wenige Wörter.
 */
export function inAtemnot(text: string): string {
  // nur der Anfang: der erste Satz (ist er sehr kurz, auch der zweite), höchstens neun Wörter
  const saetze = text.replace(/[„“"]/g, "").replace(/\s*…\s*/g, " ").match(/[^.!?]+[.!?]*/g) ?? [text];
  let teil = saetze[0] ?? "";
  if (teil.split(/\s+/).filter(Boolean).length < 5 && saetze[1]) teil += ` ${saetze[1]}`;
  const woerter = teil.replace(/[.!?,;:–-]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 10);
  const gruppen: string[] = [];
  let i = 0;
  while (i < woerter.length) {
    const n = 2 + Math.floor(Math.random() * 2);
    gruppen.push(woerter.slice(i, i + n).join(" "));
    i += n;
  }
  return gruppen.length ? `${gruppen.join(" … ")} …` : "… (schweres Atmen) …";
}

function atemnotSelbst(k: AnrufKontext): boolean {
  return k.anrufer.selbst && (k.wahrheit.sprachschw === "ja" || (k.wahrheit.at === "abnorm" && ist(k.kapitel, "atemnot")));
}

/**
 * Die Anweisung an die KI bleibt während eines Anrufs gleich (solange sich die Lage nicht ändert):
 * gleiche Beispiele und Eigenheiten in jeder Runde – und Ollama kann den schon gelesenen Anfang
 * wiederverwenden, statt die lange Anweisung jedes Mal neu zu lesen (spart Sekunden pro Antwort).
 */
const prompts = new Map<string, { schluessel: string; text: string }>();
function systemFuer(e: Einsatz, k: AnrufKontext): string {
  const schluessel = `${k.versuche}|${k.rueckrufDurchLeitstelle}|${k.adresse}|${JSON.stringify(k.wahrheit)}|${(k.verlauf ?? []).length}`;
  const p = prompts.get(e.id);
  if (p && p.schluessel === schluessel) return p.text;
  const text = systemPrompt(k);
  prompts.set(e.id, { schluessel, text });
  return text;
}

/** Nachrichten für die KI: Anweisung, bisheriges Gespräch und der Hinweis zur aktuellen Frage */
export function kiVerlauf(e: Einsatz, k: AnrufKontext, frage: string, schemaFrage: Frage | undefined, wiederholtId = false): KiNachricht[] {
  const ersteAntwort = !(e.anruf?.gespraech ?? []).some((m) => m.von === "anrufer");
  const verlauf: KiNachricht[] = [{ role: "system", content: systemFuer(e, k) }];
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
    const sf = schemaFrage ?? freieSchemaFrage(frage);
    const g = e.anruf?.gespraech ?? [];
    const letzteAntwort = [...g].reverse().find((m) => m.von === "anrufer")?.text;
    verlauf[verlauf.length - 1] = {
      role: "user",
      content: `${zuletzt.content}\n${erinnerung(k, sf, { wiederholt: wiederholtId || schonGefragt(g, frage), letzteAntwort, art: sf ? "frage" : nachrichtArt(frage), text: frage, erste: ersteAntwort, nr: g.filter((m) => m.von === "anrufer").length })}`,
    };
  }
  return verlauf;
}

export async function anruferAntwort(
  e: Einsatz,
  k: AnrufKontext,
  frage: string,
  schemaFrage: Frage | undefined,
  onToken?: (t: string) => void,
  quelle: { wert: "ki" | "fest" } = { wert: "ki" },
  wiederholtId = false,
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
  // Wer selbst anruft und jetzt bewusstlos ist, kann nicht mehr antworten
  if (x.selbst && (k.wahrheit.bw === "nein" || k.wahrheit.at === "keine" || k.wahrheit.at === "agonal")) {
    await pause();
    return "(keine Antwort – man hört nur noch Geräusche)";
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
  const verlauf = kiVerlauf(e, k, frage, schemaFrage, wiederholtId);
  try {
    const g = e.anruf?.gespraech ?? [];
    const frueher = g.filter((m) => m.von === "anrufer").map((m) => m.text);
    // „der Patient“ sagt kein Anrufer – auch wenn die Leitstelle so fragt
    const w = k.szenario ? k.szenario.patient.geschlecht === "w" : k.wahrheit.geschlecht === "w";
    const laie = (x.art ?? "privat") === "privat" && !x.selbst;
    const glatt = (t: string) => sprachFilter(laie ? ohnePatientWort(t, w) : t, x.sprache);
    const sf = schemaFrage ?? freieSchemaFrage(frage);
    const atemnot = atemnotSelbst(k);
    const t = await kiAntwortNeu(verlauf, frueher, (y) => onToken?.(atemnot ? "" : glatt(y)), { pruefen: !(wiederholtId || schonGefragt(g, frage)), maxSaetze: atemnot ? 2 : hoechstSaetze(k, sf, ersteAntwort) });
    quelle.wert = "ki";
    let fertig = atemnot ? inAtemnot(t) : glatt(t);
    // falsche Zusammenfassung abgenickt? Dann widerspricht der Anrufer (das kleine Modell sagt sonst fast immer „Ja, genau“)
    if (!sf && nachrichtArt(frage) === "zusammenfassung") {
      const pr = zusammenfassungPruefen(k, frage);
      if (pr && pr.falsch.length && /^\W*(ja|genau|richtig|stimmt|jo|mhm)\b/i.test(fertig) && !/\b(nein|na|nicht|net)\b/i.test(fertig.split(/[.!?]/)[0]))
        fertig = atemnot ? "Nein … nein …" : `${zufallAus(x.sprache === "dialekt" ? ["Na, na", "Nein, nein", "Na, des stimmt net"] : ["Nein, nein", "Nein, das stimmt so nicht", "Nein, Moment"])} – ${pr.richtig || pr.falsch.join(", ")}.`;
    }
    return fertig;
  } catch (err) {
    console.warn("KI-Antwort", err);
    return einfacheAntwort(k, frage, schemaFrage);
  }
}

/**
 * Probe-Gespräch (Fall-Editor): stellt dem Anrufer eines Probe-Einsatzes ein paar Fragen, ohne das Spiel zu
 * verändern. onSatz bekommt jede Nachricht (Leitstelle und Anrufer).
 */
export async function probeGespraech(e: Einsatz, fragenListe: { text: string; frage?: Frage }[], onSatz: (von: "leitstelle" | "anrufer", text: string) => void): Promise<void> {
  const k = kontext(e);
  if (!k || !e.anruf) return;
  for (const f of fragenListe) {
    e.anruf.gespraech.push({ zeit: 0, echt: Date.now(), von: "leitstelle", text: f.text });
    onSatz("leitstelle", f.text);
    const a = await anruferAntwort(e, k, f.text, f.frage);
    e.anruf.gespraech.push({ zeit: 0, echt: Date.now(), von: "anrufer", text: a });
    onSatz("anrufer", a);
  }
}
