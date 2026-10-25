/**
 * Notrufgespräch: Fragen der Leitstelle an den Anrufer schicken und seine Antwort holen –
 * mit KI (Ollama) oder, wenn keine KI läuft, mit einfachen Antworten aus der „Wahrheit“.
 * Läuft auf dem Rechner des Gesprächsführers; Ergebnisse gehen über sim.call an alle.
 */
import { store } from "../data/store";
import { sim, type Einsatz } from "../sim/engine";
import { antwortOhneKi, erinnerung, ersterSatzOhneKi, istBekannt, sprachFilter, systemPrompt, zusammenfassungPruefen, type AnrufKontext } from "./anrufer";
import { kiBereit, kiPrefs, kiStatus, type KiNachricht } from "./ki";
import { kiAntwortNeu, nachrichtArt, ohneVorspann } from "./runde";
import { inTauri } from "../platform";
import { fragenImAblauf, type Frage } from "./schema";
import { anruferSagt, satzSprecher } from "../ui/sprache";
import { ohnePatientWort } from "./sprechfrage";
import { ist } from "./themen";
import { buchstabiert, fragtSchreibweise, namensTeil } from "./buchstabieren";
import { antwortKern, antwortPruefen, anweisungKern, anweisungPruefen, kernAntwort, kernFuerFrage, schemaFrageZu, themenErkennen, themenZuFeld, type AnweisungKern, type Kern, type Thema } from "./verstehen";

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
    wahrheit: { ...(w.szenario?.zusatz ?? {}), ...w.antworten, ...(w.roh ?? {}) },
    lage: w.lage,
    adresse: e.meldung.adresse,
    patientAlter: e.wahr.patientAlter,
    versuche: e.anruf.versuche,
    rueckrufDurchLeitstelle: e.anruf.rueckruf,
    ortUnbekannt: !!w.ortUnbekannt,
    szenario: w.szenario,
    verlauf: w.verlauf,
    massnahmen: w.massnahmen,
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
  if (art === "anweisung") return k.anrufer.nurBekannt ? "Verstanden, ich gebe das an die Crew weiter." : "Okay, mach ich.";
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
  // Adresse: die muss vollständig ankommen – nur mit Pausen
  if (/\d{4}/.test(text) && /\d/.test(text.split(",")[0] ?? "")) return text.replace(/,\s*/g, " … ").replace(/[.!]$/, " …");
  // schon in Fetzen gesprochen: so lassen (nur kürzen)
  if ((text.match(/…/g) ?? []).length >= 2) {
    const w = text.replace(/[„“"]/g, "").split(/\s+/).filter(Boolean);
    const t = w.slice(0, 12).join(" ");
    return /…\s*$/.test(t) ? t : `${t.replace(/[.!?]$/, "")} …`;
  }
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
  const schluessel = `${k.versuche}|${k.rueckrufDurchLeitstelle}|${k.adresse}|${JSON.stringify(k.wahrheit)}|${(k.verlauf ?? []).length}|${(k.massnahmen ?? []).length}`;
  const p = prompts.get(e.id);
  if (p && p.schluessel === schluessel) return p.text;
  const text = systemPrompt(k);
  prompts.set(e.id, { schluessel, text });
  return text;
}

/** Nachrichten für die KI: Anweisung, bisheriges Gespräch und der Hinweis zur aktuellen Frage */
export function kiVerlauf(e: Einsatz, k: AnrufKontext, frage: string, schemaFrage: Frage | undefined, wiederholtId = false, kern?: string[], stimmung?: string): KiNachricht[] {
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
      content: `${zuletzt.content}\n${erinnerung(k, sf, { wiederholt: wiederholtId || schonGefragt(g, frage), letzteAntwort, art: sf ? "frage" : nachrichtArt(frage), text: frage, erste: ersteAntwort, nr: g.filter((m) => m.von === "anrufer").length, kern, stimmung })}`,
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
  quelle: { wert: "ki" | "fest"; nachgebessert?: string } = { wert: "ki" },
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
  // Flughafen-Leitstelle (nicht beim Patienten): Abfragefragen fix – Gemeldetes aus der Wahrheit, sonst „nicht gemeldet“
  if (x.nurBekannt && !(ersteAntwort && frage === ERÖFFNUNG)) {
    const sf = schemaFrage ?? freieSchemaFrage(frage);
    if (sf && !["ort_adresse", "schilderung", "anrufer", "rueckrufnummer"].includes(sf.id)) {
      await pause();
      return istBekannt(x, sf.id) ? einfacheAntwort(k, frage, sf) : (x.unbekanntSatz ?? "Das wissen wir nicht.");
    }
  }
  // Wer selbst anruft und jetzt bewusstlos ist, kann nicht mehr antworten
  if (x.selbst && (k.wahrheit.bw === "nein" || k.wahrheit.at === "keine" || k.wahrheit.at === "agonal")) {
    await pause();
    return "(keine Antwort – man hört nur noch Geräusche)";
  }
  // … und wer selbst anruft und jetzt eingetrübt ist, bringt nur noch Laute heraus
  if (x.selbst && k.wahrheit.bw === "getruebt" && (k.verlauf ?? []).length) {
    await pause();
    return zufallAus(["(nur noch Stöhnen, keine verständliche Antwort)", "Mmh … ich … (dann nur noch schweres Atmen)", "(man hört nur noch Keuchen)"]);
  }
  // „Wie schreibt sich das?“ – buchstabieren (fest vom Programm)
  if (!schemaFrage && fragtSchreibweise(frage) && (x.art ?? "privat") !== "ecall") {
    await pause();
    const patientGemeint = /patient|\b(sein|ihr)(en)? (nach|vor)?name des|von (ihm|ihr)|der (mann|frau|bub|kind)/i.test(frage) || (!/\b(ihr(en)?|ihr) (nach|vor)?name\b|wie heißen sie/i.test(frage) && (k.verlauf ?? []).length === 0 && /\b(er|sie) heißt|heißt (er|sie)/i.test([...(e.anruf?.gespraech ?? [])].reverse().find((m) => m.von === "anrufer")?.text ?? ""));
    if (patientGemeint && !x.selbst) {
      const kennt = k.szenario && !(x.persona?.wissen === "fremd" && k.wahrheit.bw !== "ja");
      return kennt ? buchstabiert(namensTeil(frage, k.szenario!.patient.name)) : "Den Namen weiß ich nicht, tut mir leid.";
    }
    return buchstabiert(namensTeil(frage, x.name));
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
  // Gesprächsablauf „neu“: Frage verstehen, Antwortkern bestimmen (das Programm denkt, die KI redet)
  const neu = kiPrefs().ablauf !== "klassisch";
  const art = schemaFrage ? "frage" : nachrichtArt(frage);
  let themen: Thema[] = [];
  let kern: Kern | null = null;
  let pruefFrage: Frage | undefined;
  let hinweisFrage = schemaFrage;
  if (neu && art === "frage" && !(ersteAntwort && frage === ERÖFFNUNG)) {
    const grund = schemaFrage ?? freieSchemaFrage(frage);
    if (grund && ["ort_adresse", "schilderung", "anrufer", "rueckrufnummer"].includes(grund.id)) {
      // Grundfragen: wie bisher
    } else if (schemaFrage) {
      pruefFrage = schemaFrage;
      themen = themenZuFeld(schemaFrage.id);
      kern = kernFuerFrage(k, schemaFrage);
    } else {
      themen = themenErkennen(frage);
      if (themen.length) kern = antwortKern(k, themen);
      else {
        // kein bekanntes Thema: passendste Frage der Abfrage (auch bei selbst erstellten Fällen)
        pruefFrage = schemaFrageZu(k, frage);
        if (pruefFrage) {
          hinweisFrage = pruefFrage;
          kern = kernFuerFrage(k, pruefFrage);
        }
      }
    }
  }
  // Anweisungen: geht das überhaupt, und was gilt danach?
  let anweisung: AnweisungKern | null = null;
  if (neu && art === "anweisung") {
    anweisung = anweisungKern(k, frage);
    if (!anweisung.typen.length) anweisung = null;
  }
  const stimmung = neu ? stimmungHinweis(e, k, art, frage, anweisung) : undefined;
  const pruefbar = (!!kern && (kern.saetze.length > 0 || Object.keys(kern.felder).length > 0)) || !!anweisung?.nichtMachbar.length;
  let kernText = anweisung ? anweisung.saetze : !hinweisFrage && kern?.saetze.length ? kern.saetze : undefined;
  // Herzdruckmassage läuft: bei allem außer Fragen wird weiter gedrückt und laut gezählt
  const reaStart = !!anweisung?.massnahmen.some((m) => /Herzdruckmassage/.test(m));
  const reaLaeuft = neu && (reaStart || (reanimationLaeuft(e, k) && (art === "anweisung" || art === "mitteilung")));
  if (reaLaeuft) kernText = [...(kernText ?? []), "Du drückst weiter auf die Brust und zählst dabei laut weiter („… eins, zwei, drei, vier …“) – du hörst nicht auf."];
  const verlauf = kiVerlauf(e, k, frage, hinweisFrage, wiederholtId, kernText, stimmung);
  try {
    const g = e.anruf?.gespraech ?? [];
    const frueher = g.filter((m) => m.von === "anrufer").map((m) => m.text);
    // „der Patient“ sagt kein Anrufer – auch wenn die Leitstelle so fragt
    const w = k.szenario ? k.szenario.patient.geschlecht === "w" : k.wahrheit.geschlecht === "w";
    const laie = (x.art ?? "privat") === "privat" && !x.selbst;
    const glatt = (t: string) => sprachFilter(laie ? ohnePatientWort(t, w) : t, x.sprache);
    const sf = schemaFrage ?? freieSchemaFrage(frage);
    const atemnot = atemnotSelbst(k);
    const maxSaetze = atemnot ? 2 : themen.length ? Math.min(3, hoechstSaetze(k, sf, ersteAntwort)) : hoechstSaetze(k, sf, ersteAntwort);
    const nachbearbeiten = (t: string): string => {
      let f = fuellwortDosis(ohneRollentausch(ohneFrageEcho(atemnot ? inAtemnot(t) : glatt(t), frage)), frueher, x.persona?.woerter ?? []);
      // Adresse nochmal aufgesagt, obwohl nicht danach gefragt (kommt nach der ersten Antwort vor)
      if (k.adresse && !/adresse|notfallort|\bwo\b|straße|hausnummer|ort\b/i.test(frage)) {
        const strasse = k.adresse.split(",")[0].trim().toLowerCase();
        const teile = f.split(/(?<=[.!?…])\s+/);
        if (teile.length > 1 && strasse.length > 4 && teile[0].toLowerCase().includes(strasse)) f = teile.slice(1).join(" ");
      }
      return feinschliff(f, frage, art, k, g);
    };
    // Prüfbare Antworten erst nach der Prüfung zeigen bzw. vorlesen (eine falsche soll man nie hören)
    const t = await kiAntwortNeu(verlauf, frueher, (y) => (pruefbar ? undefined : onToken?.(atemnot ? "" : glatt(y))), { pruefen: !(wiederholtId || schonGefragt(g, frage)), maxSaetze });
    quelle.wert = "ki";
    let fertig = nachbearbeiten(t);
    // nur die Frage zurückgegeben (kommt beim kleinen Modell vor) → einfache Antwort aus den Fakten
    if (!fertig.trim()) fertig = einfacheAntwort(k, frage, schemaFrage);
    // Prüfen und bei einem Widerspruch einmal neu erzeugen – mit klarer Korrektur
    const allePruefen = (a: string) => [...(kern ? antwortPruefen(k, themen, kern, a, pruefFrage) : []), ...(anweisung ? anweisungPruefen(anweisung, a) : [])];
    // nur eine Gegenfrage statt einer Antwort („Wie lange braucht die Rettung noch?“) → einmal neu
    const nurGegenfrage = (a: string) => art === "frage" && !!a.trim() && a.split(/(?<=[.!?…])\s+/).every((x) => /\?\s*$/.test(x)) && !/was heißt|wie bitte|was meinen sie|wie meinen sie|bitte\?|was\?|wie\?/i.test(a);
    if (nurGegenfrage(fertig)) {
      const nochmal = verlauf.map((m) => ({ ...m }));
      nochmal[nochmal.length - 1].content += `\n[Korrektur nur für dich: Du hast mit einer Gegenfrage geantwortet. Beantworte zuerst die Frage der Leitstelle – wenn du es nicht weißt, sag das.]`;
      let zweite = "";
      try {
        zweite = nachbearbeiten(await kiAntwortNeu(nochmal, frueher, () => undefined, { pruefen: false, maxSaetze }));
      } catch {
        zweite = "";
      }
      fertig = zweite.trim() && !nurGegenfrage(zweite) ? zweite : kern?.saetze.length ? kernAntwort(k, themen, kern, pruefFrage) : "Das weiß ich nicht genau.";
      quelle.nachgebessert = "Gegenfrage statt Antwort";
    }
    if (pruefbar) {
      const probleme = allePruefen(fertig);
      if (probleme.length) {
        const nochmal = verlauf.map((m) => ({ ...m }));
        const letzte = nochmal[nochmal.length - 1];
        const richtig = anweisung ? anweisung.saetze : kern?.saetze ?? [];
        letzte.content += `\n[Korrektur nur für dich: Deine Antwort „${fertig}“ war falsch – ${probleme.join("; ")}.${richtig.length ? ` Richtig ist: ${richtig.join(" ")}` : ""} Antworte neu, kurz, in deinen eigenen Worten.]`;
        let zweite = "";
        try {
          zweite = nachbearbeiten(await kiAntwortNeu(nochmal, frueher, () => undefined, { pruefen: false, maxSaetze }));
        } catch {
          zweite = "";
        }
        if (zweite.trim() && !allePruefen(zweite).length) {
          fertig = zweite;
          quelle.nachgebessert = `neu erzeugt (${probleme.join("; ")})`;
        } else if (anweisung?.nichtMachbar.length) {
          fertig = anweisung.gesagt[0];
          quelle.wert = "fest";
          quelle.nachgebessert = `feste Antwort (${probleme.join("; ")})`;
        } else if (kern && (kern.saetze.length || pruefFrage)) {
          fertig = kernAntwort(k, themen, kern, pruefFrage);
          quelle.wert = "fest";
          quelle.nachgebessert = `feste Antwort (${probleme.join("; ")})`;
        }
        if (atemnot && quelle.wert === "fest") fertig = inAtemnot(fertig);
      }
    }
    // falsche Zusammenfassung abgenickt? Dann widerspricht der Anrufer (das kleine Modell sagt sonst fast immer „Ja, genau“)
    if (!sf && nachrichtArt(frage) === "zusammenfassung") {
      const pr = zusammenfassungPruefen(k, frage);
      if (pr && pr.falsch.length && /^\W*(ja|genau|richtig|stimmt|jo|mhm)\b/i.test(fertig) && !/\b(nein|na|nicht|net)\b/i.test(fertig.split(/[.!?]/)[0]))
        fertig = atemnot ? "Nein … nein …" : `${zufallAus(x.sprache === "dialekt" ? ["Na, na", "Nein, nein", "Na, des stimmt net"] : ["Nein, nein", "Nein, das stimmt so nicht", "Nein, Moment"])} – ${pr.richtig || pr.falsch.join(", ")}.`;
    }
    if (reaLaeuft && !zaehltMit(fertig)) {
      const rest = fertig.replace(/\s*(okay,? )?(ich )?bleib\w* (ich )?dran\.?/i, "").replace(/[.!…\s]+$/, "").trim();
      const z = zaehlFolge(reaStart && !reanimationLaeuft(e, k));
      fertig = rest ? `${rest} … ${z}` : z.charAt(0).toUpperCase() + z.slice(1);
    }
    // nach dem Weglassen von schon Gesagtem kann der Rest klein anfangen
    if (/^[a-zäöü]/.test(fertig)) fertig = fertig.charAt(0).toUpperCase() + fertig.slice(1);
    if (pruefbar) onToken?.(fertig);
    // ausgeführte Anweisungen merken (gelten im weiteren Gespräch)
    const wa = e.wahr.abfrage;
    if (anweisung?.massnahmen.length && wa) for (const m of anweisung.massnahmen) if (!(wa.massnahmen ??= []).includes(m)) wa.massnahmen.push(m);
    return fertig;
  } catch (err) {
    console.warn("KI-Antwort", err);
    return einfacheAntwort(k, frage, schemaFrage);
  }
}

/**
 * Letzter Schliff an jeder Antwort (gilt für alle Fälle):
 * Ich-Form beim Selbstanrufer, kein „Nein, weiß ich nicht“, keine erfundene Ankunftszeit,
 * keine wiederholte Durchsage, und auf „Wer spricht?“ kommt der Name.
 */
export function feinschliff(antwort: string, frage: string, art: string, k: AnrufKontext, gespraech: { von: string; text: string }[] = []): string {
  let t = antwort.trim();
  if (!t || t.startsWith("(")) return t;
  // Selbstanrufer: „Sie hat … Asthma …“ → „Ich hab … Asthma …“
  if (k.anrufer.selbst) {
    const ICH: Record<string, string> = { hat: "hab", ist: "bin", nimmt: "nehm", kann: "kann", atmet: "atme", kriegt: "krieg", braucht: "brauch", muss: "muss", hatte: "hatte", war: "war", fühlt: "fühl", spürt: "spür" };
    t = t.replace(/^(\W*)(Er|Sie) (hat|ist|nimmt|kann|atmet|kriegt|braucht|muss|hatte|war|fühlt|spürt)\b/, (_m, v: string, _p: string, verb: string) => `${v}Ich ${ICH[verb] ?? verb}`);
  }
  // „Nein, ich weiß nicht …“ – das Nein gehört da nicht hin
  t = t.replace(/^(nein|ja|na|jo),\s+(?=(ich weiß|das weiß|weiß ich|keine ahnung|das kann ich nicht sagen))/i, "");
  // Ankunftszeiten weiß nur die Leitstelle
  if (!/minute|gleich|bald|dauert/i.test(frage)) {
    const teile = t.split(/(?<=[.!?…])\s+/).filter((x) => !/^(die |der )?(rettung|rettungsdienst|notarzt|kollegen|sanitäter|sie)\b[^.?!]*\b(ist|sind|kommt|kommen|wird|werden)\b[^.?!]*\b(\d+|zehn|fünf|zwanzig|fünfzehn|paar) minuten\b/i.test(x.trim()));
    t = teile.length ? teile.join(" ") : "Okay.";
  }
  // Durchsage nicht nachplappern („Okay, der Rettungsdienst ist unterwegs.“)
  if (art === "mitteilung") {
    const w = (x: string) => x.toLowerCase().replace(/[^a-zäöüß ]/g, " ").split(/\s+/).filter((y) => y.length > 3);
    const fw = new Set(w(frage));
    const teile = t.split(/(?<=[.!?…])\s+/);
    const rest = teile.filter((x) => {
      const ww = w(x);
      return ww.length < 2 || ww.filter((y) => fw.has(y)).length / ww.length < 0.6;
    });
    if (rest.length < teile.length) t = rest.join(" ").replace(/^(okay|gut|ja),?\s*$/i, "") || "Okay, danke.";
  }
  // „Wer spricht?“ – der Name gehört dazu
  if (/wer (spricht|ruft)|wie heißen sie|ihr(en)? name|mit wem (spreche|rede)/i.test(frage) && k.anrufer.name && k.anrufer.art !== "ecall") {
    const teile = k.anrufer.name.split(/\s+/).filter((x) => x.length > 2);
    if (teile.length && !teile.some((x) => t.toLowerCase().includes(x.toLowerCase()))) {
      const atemlos = /…/.test(t) && (t.match(/…/g) ?? []).length >= 2;
      const rest = `${t.charAt(0).toLowerCase()}${t.slice(1)}`;
      t = atemlos ? `${k.anrufer.name.replace(/\s+/, " … ")} … ${rest}` : `${k.anrufer.name} – ${rest}`;
    }
  }
  void gespraech;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Läuft gerade eine Herzdruckmassage (angeleitet und der Patient ist noch nicht wieder da)? */
export function reanimationLaeuft(e: Einsatz, k: AnrufKontext): boolean {
  return (e.wahr.abfrage?.massnahmen ?? []).some((m) => /Herzdruckmassage/.test(m)) && k.wahrheit.bw !== "ja" && k.wahrheit.at !== "normal" && !k.anrufer.selbst;
}

const ZAHLEN = ["eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn", "zwanzig", "einundzwanzig", "zweiundzwanzig", "dreiundzwanzig", "vierundzwanzig", "fünfundzwanzig", "sechsundzwanzig", "siebenundzwanzig", "achtundzwanzig", "neunundzwanzig", "dreißig"];
/** Zählt die Antwort mit (mindestens drei Zahlen)? */
export function zaehltMit(t: string): boolean {
  const n = t.toLowerCase().match(new RegExp(`\\b(${ZAHLEN.join("|")}|\\d{1,2})\\b`, "g"));
  return (n?.length ?? 0) >= 3;
}
/** „… sieben, acht, neun, zehn …“ – ein Stück vom Mitzählen */
export function zaehlFolge(vonAnfang = false): string {
  const start = vonAnfang ? 0 : Math.floor(Math.random() * 24);
  return `${ZAHLEN.slice(start, start + 5).join(", ")} …`;
}

const STIMMUNGEN = ["ruhig", "gefasst", "aufgeregt", "panisch"] as const;
const STIMMUNG_TEXT = [
  "Du bist jetzt ruhiger und sachlich.",
  "Du bist jetzt besorgt, aber gefasst.",
  "Du bist jetzt aufgeregt und redest schneller.",
  "Du bist jetzt panisch: kurze, abgehackte Sätze.",
];

/**
 * Stimmung im Gespräch: „Die Rettung ist unterwegs“ und klare Anweisungen beruhigen, eine Verschlechterung
 * oder langes Warten ohne Zusage machen unruhiger. Gibt einen Hinweis zurück, wenn sie anders ist als am Anfang.
 */
function stimmungHinweis(e: Einsatz, k: AnrufKontext, art: string, frage: string, anweisung: AnweisungKern | null): string | undefined {
  const w = e.wahr.abfrage;
  if (!w || (k.anrufer.art ?? "privat") !== "privat") return undefined;
  const start = Math.max(0, STIMMUNGEN.indexOf(k.anrufer.emotion));
  const s = (w.stimmung ??= { stufe: start, verlauf: 0, beruhigt: false });
  const n = (k.verlauf ?? []).length;
  if (n > s.verlauf) {
    // Veränderung im Gespräch: bei einer Verschlechterung unruhiger, bei einer Besserung ruhiger
    const neu = (k.verlauf ?? []).slice(s.verlauf).join(" ").toLowerCase();
    s.stufe = /besser|wieder|atmet wieder|draußen|ausgespuckt|schreit|wach/.test(neu) ? Math.max(0, s.stufe - 1) : Math.min(3, s.stufe + 1);
    s.verlauf = n;
  }
  if (art === "mitteilung" && /rettung|unterwegs|kommt|schick|alarmiert|auf dem weg/i.test(frage)) {
    s.stufe = Math.max(0, s.stufe - 1);
    s.beruhigt = true;
  } else if (anweisung && !anweisung.nichtMachbar.length) s.stufe = Math.max(start >= 3 ? 1 : 0, s.stufe - 1);
  // lange keine Zusage, dass Hilfe kommt: einmal unruhiger
  else if (!s.beruhigt && (e.anruf?.gespraech ?? []).filter((m) => m.von === "anrufer").length === 9 && s.stufe < 3 && start >= 1) s.stufe += 1;
  return s.stufe !== start ? STIMMUNG_TEXT[s.stufe] : undefined;
}

/**
 * Füllwörter sparsam: Steht eines schon in einer der letzten beiden Antworten, in einer ganz kurzen Antwort
 * (Alter, Geschlecht …) oder mehrmals in dieser, fliegt es raus. Bedeutungstragende („jo“, „na“, „bitte“) bleiben.
 */
export function fuellwortDosis(antwort: string, frueher: string[], woerter: string[]): string {
  const weg = woerter.filter((w) => !["jo", "na", "ja ja", "okay", "bitte", "ja genau"].includes(w.toLowerCase()));
  if (!weg.length) return antwort;
  const muster = (w: string, g = "") => new RegExp(`(?<![\\wäöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\wäöüß])`, `i${g}`);
  const kommt = (t: string) => weg.some((w) => muster(w).test(t));
  if (!kommt(antwort)) return antwort;
  const kurz = antwort.split(/\s+/).length <= 5;
  const zuletzt = frueher.slice(-2).some(kommt);
  const oft = weg.reduce((n, w) => n + (antwort.match(muster(w, "g"))?.length ?? 0), 0) > 1;
  if (!kurz && !zuletzt && !oft) return antwort;
  let t = antwort;
  for (const w of weg) t = t.replace(new RegExp(`[,\\s]*${muster(w).source}[,]?`, "gi"), "");
  t = t.replace(/\s+([.!?…,])/g, "$1").replace(/^[\s,.…-]+/, "").replace(/\s{2,}/g, " ").trim();
  if (!t) return antwort;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Rückfragen, die nur die Leitstelle stellen würde („Wie geht's ihm jetzt?“, „Haben Sie Fragen dazu?“),
 * hängt das kleine Modell manchmal an – die fallen weg. Echte Anrufer-Fragen („Wie lange dauert es?“) bleiben.
 */
export function ohneRollentausch(antwort: string): string {
  const falsch = /^(kann ich (noch )?(etwas|was) für sie tun|haben sie (noch )?fragen( dazu)?|wie sagt man( das)?|wie geht.s (ihm|ihr|dem|der)\b[^?]*|was ist los|was macht ihr sonst|was ist passiert|wie geht.s weiter mit (ihm|ihr)|ist das richtig so|verstehen sie mich)\?$/i;
  const teile = antwort.split(/(?<=[.!?…])\s+/);
  while (teile.length > 1 && falsch.test(teile[teile.length - 1].trim())) teile.pop();
  return teile.join(" ");
}

/** „Wie atmet sie? Sie kriegt …“ → „Sie kriegt …“: das Modell wiederholt manchmal die Frage am Anfang */
export function ohneFrageEcho(antwort: string, frage: string): string {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const nf = norm(frage.split("?")[0]);
  if (nf.length < 6) return antwort;
  const m = antwort.match(/^\s*([^?]{4,}\?)\s*(?:[–—→:-]\s*)?/);
  if (!m || norm(m[1]) !== nf) return antwort;
  const rest = antwort.slice(m[0].length).trim();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
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
