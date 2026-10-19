/**
 * Eine Gesprächsrunde mit der KI – gemeinsam für Notruf und KT-Hotline:
 * - erkennt, was die Leitstelle gerade gesagt hat (Frage, Zusammenfassung, Anweisung, Mitteilung, Verabschiedung),
 * - lässt die KI nichts wiederholen, was sie schon gesagt hat (Sätze werden beim Schreiben geprüft;
 *   ist alles schon gesagt, wird die Antwort mit einem Hinweis neu erzeugt).
 */
import { bereinigen, kiChat, satzEnde, type KiNachricht } from "./ki";

export type NachrichtArt = "frage" | "zusammenfassung" | "anweisung" | "mitteilung" | "abschluss";

/** Füllwörter am Satzanfang, die nichts an der Art ändern („okay danke, was ist passiert“) */
const VORSPANN = /^(?:okay|ok|okey|gut|sehr gut|alles klar|klar|verstanden|danke(?: schön| sehr)?|ja|jawohl|jo|aha|mhm|super|in ordnung|na gut|so|und|dann|jetzt|gut dann|sonst|bitte)\b[\s,.!:;–-]*/;

export function ohneVorspann(t: string): string {
  let x = t.trim();
  for (let i = 0; i < 4; i++) {
    const y = x.replace(VORSPANN, "");
    if (y === x || !y) break;
    x = y;
  }
  return x;
}

const W_WORT = /^(?:seit wann|ab wann|bis wann|wie lange?|um wie viel uhr|was|wo|wie|wer|wen|wem|wessen|wann|welche[rsmn]?|warum|wieso|weshalb|woran|womit|wohin|woher|wovon|wodurch|wofür|wieviel\w*|wie ?viel\w*)\b/;
/** Verb am Anfang = Ja/Nein-Frage („atmet er normal“, „können sie mir sagen …“) */
const FRAGE_VERB = /^(?:ist|sind|war|waren|hat|haben|hatte|hatten|kann|können|könnten|konnte|darf|dürfen|muss|müssen|soll|sollen|will|wollen|möchte|atmet|reagiert|blutet|hustet|spricht|redet|antwortet|bewegt|liegt|sitzt|steht|gibt|geht|kommt|bringt|hilft|nimmt|tut|weiß|wissen|kennen|kennt|sieht|hört|merkt|fühlt|trinkt|isst|schwitzt|wirkt|klagt|braucht|brauchen|befindet|wurde|wurden|wird|werden|leidet|krampft|zittert|blutete|schläft|nimmt|verwendet|hast|bist|seid|habt)\b/;
/** Befehlsverben in der Sie-Form („legen Sie …“) */
const BEFEHL_VERB = /^(?:legen|bringen|drücken|drucken|öffnen|schauen|bleiben|machen|halten|gehen|holen|sperren|schalten|lassen|geben|kühlen|setzen|nehmen|beginnen|zählen|stellen|decken|ziehen|schicken|suchen|heben|drehen|knien|pressen|klopfen|sprechen|warten|rufen|tun|regen|führen|versuchen|achten|beobachten|kontrollieren|überprüfen|prüfen|fassen|umfassen|schlagen|beugen|strecken|überstrecken|entfernen|räumen|sichern|sorgen|bitten|fragen|reden|beruhigen|wickeln|pressen|lagern|ziehen|tragen|helfen|schreiben|notieren|hören|kommen|lesen|verwenden|benutzen|nutzen|kleben|richten|stützen|stoppen|wecken|rütteln|sprühen|wiederholen|machens|schauns|legens)\s+sie\b/;
/** Bitten, etwas zu erzählen, sind Fragen („erzählen Sie mal, was passiert ist“) */
const ERZAEHL = /^(?:erzählen|sagen|beschreiben|schildern|nennen|buchstabieren|wiederholen)\s+sie\s+(?:mir\s+)?(?:mal\s+|bitte\s+|kurz\s+|doch\s+|noch\s+(?:einmal|mal)\s+)*(?:was|wo|wie|wer|wann|welche|ob|die|den|das|ihre|ihren|genau|kurz)\b/;
const NUR_BEFEHL = /^(?:warten|weiter(?:machen)?|drücken|pressen|zählen|ruhig bleiben|nicht auflegen|dranbleiben|weiter so)\b/;

function satzArt(c: string): "frage" | "anweisung" | "mitteilung" | "aussage" {
  const roh = c.trim();
  const t = ohneVorspann(roh.replace(/[?.!]+$/, "")).trim();
  if (!t) return "aussage";
  if (ERZAEHL.test(t)) return "frage";
  if (BEFEHL_VERB.test(t) || NUR_BEFEHL.test(t) || /\bsie (sollen|müssen)\b/.test(t)) return roh.endsWith("?") && !BEFEHL_VERB.test(t) ? "frage" : "anweisung";
  if (roh.endsWith("?") || W_WORT.test(t) || FRAGE_VERB.test(t)) return "frage";
  if (/^bitte\b/.test(roh.toLowerCase()) && /\b\w+en\b/.test(t)) return "anweisung";
  return "aussage";
}

/** Was sagt die Leitstelle gerade? (einfache Erkennung über typische Wendungen – auch ohne Fragezeichen und Großschreibung) */
export function nachrichtArt(text: string): NachrichtArt {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const frage = t.includes("?");
  if (/(auf )?wiederh(ö|oe)ren|tschüss|baba\b|servus\b|das war'?s|ich leg(e)? (jetzt )?auf|wir legen (jetzt )?auf|danke für (ihren|den) anruf/.test(t)) return "abschluss";
  if (!frage && /^(okay,? |gut,? |so,? )?(also|das heißt|sie sagen|sie sagten|somit|verstehe|ich fasse zusammen)\b/.test(t)) return "zusammenfassung";
  if (!frage && /\b(somit|das heißt|sie sagten|wenn ich (sie )?richtig verstehe)\b/.test(t)) return "zusammenfassung";
  if (frage && /(richtig|korrekt|stimmt (das|so)|oder|gell|ja)\?\s*$/.test(t) && /\b(also|das heißt|sie sagten|somit|verstehe ich)\b/.test(t)) return "zusammenfassung";
  // „Die Rettung ist unterwegs, bleiben Sie am Telefon“ ist eine Mitteilung, keine Anweisung
  const unterwegs = /\b(rettung|rettungsdienst|rettungswagen|notarzt|hubschrauber|kollegen|fahrzeug|hilfe|wagen|auto|team|feuerwehr|polizei|transport|krankentransport)\b[^.?!]*\b(unterwegs|kommt|kommen|auf dem weg|geschickt|alarmiert|schicke|schicken|verständigt|da sein|bei ihnen)\b/;
  const mitteilungSatz = (c: string) =>
    unterwegs.test(c) || /\b(ich|wir) (werde|werden|versuche|versuchen|tu|tun)\b[^.?!]*\b(orten|schicken|verständigen|kümmern|organisieren|eintragen|weitergeben)\b/.test(c) || /\b(verzöger|später|dauert|halbe stunde)\b/.test(c);
  const teile = (t.match(/[^.?!]+[.?!]*/g) ?? [t]).map((x) => x.trim()).filter((x) => x.replace(/[.?!,\s]/g, ""));
  const arten = teile.map((c) => {
    // nach Kommas aufteilen, falls ein Teil eine Frage ist („okay danke, was ist passiert“)
    const stuecke = c.split(/,\s*/);
    for (let i = stuecke.length - 1; i >= 0; i--) {
      const a = satzArt(stuecke.slice(i).join(", "));
      if (a === "frage" || a === "anweisung") return a;
    }
    return mitteilungSatz(c) ? "mitteilung" : satzArt(c);
  });
  const nurDranBleiben = (c: string) => /bleiben sie (bitte )?(am telefon|dran|in der leitung|bei (ihm|ihr))/.test(c);
  const letzte = arten[arten.length - 1];
  if (letzte === "frage") return "frage";
  if (letzte === "anweisung") return nurDranBleiben(teile[teile.length - 1]) && teile.some(mitteilungSatz) ? "mitteilung" : "anweisung";
  if (arten.includes("frage")) return "frage";
  if (arten.includes("anweisung")) return teile.every((c, i) => arten[i] !== "anweisung" || nurDranBleiben(c)) && teile.some(mitteilungSatz) ? "mitteilung" : "anweisung";
  if (arten.includes("mitteilung")) return "mitteilung";
  // Aussagesatz, der wie eine Frage gebaut ist („Er ist wach und atmet normal“) → Bestätigung
  if (/^(er|sie|der|die|das|es) (ist|hat|atmet|blutet|kann|liegt|sitzt)\b/.test(ohneVorspann(t))) return "zusammenfassung";
  return "mitteilung";
}

/** Fragt die Leitstelle nach dem Zustand (Bewusstsein, Atmung …)? */
export function fragtNachZustand(text: string): boolean {
  return /atm|wach|reagier|bewusst|ansprech|redet|sprechen|luft|puls|herz|augen|blau|blass|schnauf/.test(text.toLowerCase());
}

/** Kurzer Hinweis je nach Art der Nachricht (gilt für alle Anrufer) */
export function hinweisZurArt(art: NachrichtArt, laie: boolean, jemandDa = true): string {
  switch (art) {
    case "zusammenfassung":
      return "Die Leitstelle fasst zusammen, was sie verstanden hat. Antworte nur ganz kurz: bestätigen oder korrigieren, was nicht stimmt. Wiederhole ihre Worte nicht und zähl nichts neu auf.";
    case "anweisung":
      return `Die Leitstelle sagt dir, was du tun sollst. Passt es zur Fallakte, tu es und sag kurz, was du tust oder was du dabei siehst – nur das, was zu genau dieser Anweisung passt. Passt es nicht, frag nach. Bedingte Anweisungen („falls“, „wenn“) und Bitten wie „Bleiben Sie dran“ bestätigst du nur kurz.`;
    case "mitteilung": {
      const art = ["sag erleichtert danke", "frag, wie lange es ungefähr dauert", "frag, was du bis dahin machen sollst", ...(jemandDa ? ["sag, dass jemand die Rettung einweist (nur wer laut Fallakte da ist)"] : []), "sag kurz „okay“ und dass du dranbleibst", "sag, wie froh du bist, dass jemand kommt", "frag, ob du noch irgendwas herrichten sollst"];
      const w = art[Math.floor(Math.random() * art.length)];
      return `Die Leitstelle hat dir etwas MITGETEILT, keine Frage gestellt. Reagiere kurz und menschlich darauf${laie ? ` – diesmal: ${w} (in deinen eigenen Worten)` : " (bestätigen, kurz nachfragen, was noch nötig ist)"}. Beschreib jetzt NICHT noch einmal den Zustand des Patienten.`;
    }
    case "abschluss":
      return `Die Leitstelle beendet das Gespräch. Verabschiede dich kurz in einem Satz, etwa so: „${["Danke, bis gleich", "Okay, danke Ihnen", "Danke – ich warte", "Gut, danke schön", "Danke, ich schau, dass ich sie sehe"][Math.floor(Math.random() * 5)]}.“`;
    default:
      return "";
  }
}

// ------------------------------------------------------------------ Wiederholungen erkennen

const FUELL = new Set(["äh", "ähm", "ja", "jo", "na", "also", "okay", "ok", "gut", "bitte", "schon", "eh", "halt", "mal", "noch", "so", "und", "wie", "gesagt", "moment", "genau", "nein", "nicht", "nix", "net"]);

function woerter(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/[^a-zäöüß0-9 ]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^is$/, "ist"))
    .filter((w) => w && !FUELL.has(w));
}

/** Ähnlichkeit zweier Sätze (0–1): Anteil gemeinsamer Wörter */
export function aehnlichkeit(a: string, b: string): number {
  const A = new Set(woerter(a));
  const B = new Set(woerter(b));
  if (!A.size || !B.size) return 0;
  let gemein = 0;
  for (const w of A) if (B.has(w)) gemein++;
  return gemein / Math.min(A.size, B.size) * (Math.min(A.size, B.size) / Math.max(A.size, B.size)) ** 0.35;
}

/** Sätze eines Textes */
/** Abkürzungen und Ordnungszahlen, nach denen kein Satz endet („St. Andrä“, „Dr. Huber“, „3. Stock“) */
const KEIN_ENDE = /(?:^|[\s(„"])(?:St|Dr|Nr|Str|Hr|Fr|Mag|Ing|DI|ca|bzw|usw|vgl|inkl|Hl|Prof|Univ|Bgm|z\.\s?B|u\.\s?a|d\.\s?h)\.$/i;
const ORDINAL_DAVOR = /(?:^|\s)\d{1,3}\.$/;
const ORDINAL_DANACH = /^\s+(?:Stock|Stiege|Etage|Obergeschoß|Obergeschoss|OG|Klasse|Bezirk|Mal|Tür|Zimmer|Station|Jänner|Januar|Februar|Feber|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/;

/** Länge bis einschließlich des ersten echten Satzendes in t (das von Leerraum gefolgt wird), sonst -1 */
export function satzEndeIn(t: string): number {
  const re = /[.!?…](?=\s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const bis = m.index + 1;
    if (m[0] === ".") {
      const vor = t.slice(Math.max(0, bis - 12), bis);
      if (KEIN_ENDE.test(vor)) continue;
      if (ORDINAL_DAVOR.test(vor) && ORDINAL_DANACH.test(t.slice(bis))) continue;
    }
    return bis;
  }
  return -1;
}

export function saetze(t: string): string[] {
  const out: string[] = [];
  let rest = t;
  for (;;) {
    const n = satzEndeIn(rest);
    if (n < 0) break;
    out.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  out.push(rest);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Wurde dieser Satz (sinngemäß gleich) schon gesagt? Kurze Floskeln („Ja, genau.“) zählen nicht. */
export function schonGesagt(satz: string, frueher: string[]): boolean {
  if (woerter(satz).length < 3) return false;
  for (const f of frueher) for (const s of saetze(f)) if (aehnlichkeit(satz, s) >= 0.72) return true;
  return false;
}

function sichtbar(roh: string): string {
  let x = roh.replace(/<think>[\s\S]*?<\/think>/g, "");
  const offen = x.indexOf("<think>");
  if (offen >= 0) x = x.slice(0, offen);
  return x.replace(/^\s*(Anrufer(in)?|Ich|Caller)\s*:\s*/i, "");
}

/**
 * KI-Antwort holen, Satz für Satz freigeben (für Anzeige und Vorlesen) und schon Gesagtes weglassen.
 * Bleibt nichts Neues übrig, wird einmal mit einem Hinweis neu gefragt.
 * `frueher`: bisherige Antworten des Anrufers.
 */
export async function kiAntwortNeu(verlauf: KiNachricht[], frueher: string[], onText: (stueck: string) => void, opt: { pruefen?: boolean; chat?: typeof kiChat; maxSaetze?: number } = {}): Promise<string> {
  const chat = opt.chat ?? kiChat;
  const pruefen = opt.pruefen !== false && frueher.length > 0;
  const runde = async (msgs: KiNachricht[], streng: boolean): Promise<{ text: string; verworfen: string[] }> => {
    let roh = "";
    let frei = 0;
    let stopp = false;
    const raus: string[] = [];
    const verworfen: string[] = [];
    const nimm = (satz: string) => {
      if (streng && schonGesagt(satz, frueher)) {
        verworfen.push(satz.trim());
        // nach einer Wiederholung kommt meist noch mehr davon – den Rest weglassen
        if (raus.length) stopp = true;
        return;
      }
      raus.push(satz.trim());
      onText(`${raus.length > 1 ? " " : ""}${satz.trim()}`);
      // so viel sagt man am Telefon auf einmal – der Rest wird nicht mehr ausgesprochen
      if (opt.maxSaetze && raus.length >= opt.maxSaetze) stopp = true;
    };
    await chat(msgs, (tok) => {
      if (stopp) return;
      roh += tok;
      const sicht = sichtbar(roh);
      for (;;) {
        const rest = sicht.slice(frei);
        const n = satzEndeIn(rest);
        if (n < 0) break;
        frei += n;
        if (rest.slice(0, n).trim()) nimm(rest.slice(0, n));
        if (stopp) break;
      }
    });
    if (!stopp) {
      const rest = sichtbar(roh).slice(frei).trim();
      if (rest) for (const s of saetze(rest)) if (!stopp) nimm(s);
    }
    return { text: satzEnde(bereinigen(raus.join(" "))), verworfen };
  };
  const erst = await runde(verlauf, pruefen);
  if (erst.text || !pruefen) return erst.text;
  // alles schon gesagt: neu fragen, mit Hinweis
  const neu = verlauf.map((m) => ({ ...m }));
  const letzte = neu[neu.length - 1];
  letzte.content += `\n[Hinweis nur für dich, nicht aussprechen: „${erst.verworfen.join(" ")}“ hast du schon gesagt – sag das NICHT noch einmal. Reagiere stattdessen genau auf das, was die Leitstelle gerade gesagt hat: kurz bestätigen, kurz nachfragen oder sagen, was du gerade tust.]`;
  const zweit = await runde(neu, false);
  return zweit.text || erst.verworfen.join(" ");
}
