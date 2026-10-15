/**
 * Eine Gesprächsrunde mit der KI – gemeinsam für Notruf und KT-Hotline:
 * - erkennt, was die Leitstelle gerade gesagt hat (Frage, Zusammenfassung, Anweisung, Mitteilung, Verabschiedung),
 * - lässt die KI nichts wiederholen, was sie schon gesagt hat (Sätze werden beim Schreiben geprüft;
 *   ist alles schon gesagt, wird die Antwort mit einem Hinweis neu erzeugt).
 */
import { bereinigen, kiChat, satzEnde, type KiNachricht } from "./ki";

export type NachrichtArt = "frage" | "zusammenfassung" | "anweisung" | "mitteilung" | "abschluss";

/** Was sagt die Leitstelle gerade? (einfache Erkennung über typische Wendungen) */
export function nachrichtArt(text: string): NachrichtArt {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  const frage = t.includes("?");
  if (/(auf )?wiederh(ö|oe)ren|tschüss|baba\b|servus\b|das war'?s|ich leg(e)? (jetzt )?auf|wir legen (jetzt )?auf|danke für (ihren|den) anruf/.test(t)) return "abschluss";
  if (!frage && /^(okay,? |gut,? |so,? )?(also|das heißt|sie sagen|sie sagten|somit|verstehe|ich fasse zusammen)\b/.test(t)) return "zusammenfassung";
  if (!frage && /\b(somit|das heißt|sie sagten|wenn ich (sie )?richtig verstehe)\b/.test(t)) return "zusammenfassung";
  if (frage && /(richtig|korrekt|stimmt (das|so)|oder|gell|ja)\?\s*$/.test(t) && /\b(also|das heißt|sie sagten|somit|verstehe ich)\b/.test(t)) return "zusammenfassung";
  const befehl =
    /\b(legen|bringen|drücken|drucken|öffnen|schauen|bleiben|machen|halten|gehen|holen|sperren|schalten|lassen|geben|kühlen|setzen|nehmen|beginnen|zählen|sagen|stellen|decken|ziehen|schicken|suchen|heben|drehen|knien|pressen|klopfen|sprechen|warten|rufen) sie\b/.test(t) ||
    /\bsie (sollen|müssen|dürfen)\b|\bbitte (nicht )?(\w+en)\b/.test(t);
  if (!frage && befehl) return "anweisung";
  const mitteilung =
    /\b(rettung|rettungsdienst|rettungswagen|notarzt|hubschrauber|kollegen|fahrzeug|hilfe|wagen|auto|team|feuerwehr|polizei|transport|krankentransport)\b[^.?!]*\b(unterwegs|kommt|kommen|auf dem weg|geschickt|alarmiert|schicke|schicken|verständigt|da sein|bei ihnen)\b/.test(t) ||
    /\b(ich|wir) (werde|werden|versuche|versuchen|tu|tun)\b[^.?!]*\b(orten|schicken|verständigen|kümmern|organisieren|eintragen|weitergeben)\b/.test(t) ||
    /\b(verzöger|später|dauert|halbe stunde|minuten)\b/.test(t);
  if (!frage && mitteilung) return "mitteilung";
  if (frage) return befehl && !/^(können|könnten|würden|haben|ist|sind|wie|was|wo|wer|wann)/.test(t) ? "anweisung" : "frage";
  if (befehl) return "anweisung";
  // Aussagesatz ohne Fragezeichen, der wie eine Frage gebaut ist („Er ist wach und atmet normal“) → Bestätigung
  if (/^(er|sie|der|die|das|es) (ist|hat|atmet|blutet|kann|liegt|sitzt)\b/.test(t)) return "zusammenfassung";
  return "mitteilung";
}

/** Fragt die Leitstelle nach dem Zustand (Bewusstsein, Atmung …)? */
export function fragtNachZustand(text: string): boolean {
  return /atm|wach|reagier|bewusst|ansprech|redet|sprechen|luft|puls|herz|augen|blau|blass|schnauf/.test(text.toLowerCase());
}

/** Kurzer Hinweis je nach Art der Nachricht (gilt für alle Anrufer) */
export function hinweisZurArt(art: NachrichtArt, laie: boolean): string {
  switch (art) {
    case "zusammenfassung":
      return "Die Leitstelle fasst zusammen, was sie verstanden hat. Antworte nur ganz kurz: bestätigen („Ja, genau.“, „Ja, so ist es.“) oder korrigieren, was nicht stimmt. Wiederhole ihre Worte nicht und zähl nichts neu auf.";
    case "anweisung":
      return `Die Leitstelle sagt dir, was du tun sollst. Passt es zur Fallakte, tu es und sag kurz, was du tust oder was du dabei siehst${laie ? " („Okay … so, jetzt liegt er auf der Seite.“)" : ""}. Passt es nicht, frag nach. Bedingte Anweisungen („falls“, „wenn“) bestätigst du nur.`;
    case "mitteilung":
      return `Die Leitstelle hat dir etwas MITGETEILT, keine Frage gestellt. Reagiere kurz und menschlich darauf${laie ? " – z. B. erleichtert, mit einem Danke, oder mit einer kurzen Rückfrage („Wie lang dauert's ungefähr?“, „Was soll ich bis dahin machen?“)" : " (bestätigen, kurz nachfragen, was noch nötig ist)"}. Beschreib jetzt NICHT noch einmal den Zustand des Patienten.`;
    case "abschluss":
      return "Die Leitstelle beendet das Gespräch. Verabschiede dich kurz in einem Satz.";
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
export function saetze(t: string): string[] {
  return (t.match(/[^.!?…]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
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
export async function kiAntwortNeu(verlauf: KiNachricht[], frueher: string[], onText: (stueck: string) => void, opt: { pruefen?: boolean; chat?: typeof kiChat } = {}): Promise<string> {
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
    };
    await chat(msgs, (tok) => {
      if (stopp) return;
      roh += tok;
      const sicht = sichtbar(roh);
      for (;;) {
        const rest = sicht.slice(frei);
        const m = rest.match(/^[\s\S]*?[.!?…](?=\s)/);
        if (!m) break;
        frei += m[0].length;
        if (m[0].trim()) nimm(m[0]);
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
