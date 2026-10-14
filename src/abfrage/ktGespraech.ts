/**
 * KT-Hotline: Gespräch mit dem Auftraggeber (Station, Patient, Angehörige, Hausarzt).
 * Feste Abfrage (kein importiertes Schema); Antworten mit KI oder einfachen Sätzen.
 */
import { inTauri } from "../platform";
import { sim } from "../sim/engine";
import { bereichName, hhmm, KT_LAGE_LABEL, type KtAuftrag, type KtDaten } from "../sim/kt";
import { kiBereit, kiChat, kiPrefs, kiStatus, type KiNachricht } from "./ki";

export interface KtFrage {
  id: keyof KtDaten | "wer" | "patient" | "arzt" | "monitoring" | "stabil" | "inkubator" | "zusage" | "gewicht";
  text: string;
  /** nur bei Überstellungen */
  sek?: boolean;
}

/** Feste Abfrage der KT-Hotline */
export const KT_FRAGEN: KtFrage[] = [
  { id: "wer", text: "Krankentransport, guten Tag. Wer spricht, bitte?" },
  { id: "patient", text: "Wie heißt der Patient und wie alt ist er?" },
  { id: "von", text: "Wo soll der Patient abgeholt werden?" },
  { id: "nach", text: "Wohin soll der Transport gehen?" },
  { id: "termin", text: "Wann ist der Termin?" },
  { id: "abholung", text: "Wann soll der Patient abgeholt werden?" },
  { id: "grund", text: "Was ist der Grund für den Transport?" },
  { id: "lage", text: "Wollen Sie sitzen oder liegen? – Kann der Patient sitzen, oder muss er liegen?" },
  { id: "begleitung", text: "Fährt eine Begleitperson mit?" },
  { id: "sauerstoff", text: "Braucht der Patient Sauerstoff?" },
  { id: "infektion", text: "Gibt es eine Infektion oder Isolation?" },
  { id: "art", text: "Haben Sie einen Wunsch, mit wem Sie fahren – Rotes Kreuz oder Samariterbund?" },
  { id: "telefon", text: "Unter welcher Nummer erreichen wir Sie?" },
  // Überstellungen
  { id: "sofort", text: "Wie dringend ist die Überstellung – geplant oder sofort?", sek: true },
  { id: "arzt", text: "Braucht der Patient eine Notarztbegleitung?", sek: true },
  { id: "monitoring", text: "Braucht er Monitoring, ist er beatmet?", sek: true },
  { id: "stabil", text: "Ist der Patient stabil, oder muss während der Fahrt laufend an ihm gearbeitet werden?", sek: true },
  { id: "inkubator", text: "Ist es ein Kind oder ein Neugeborenes – braucht es einen Inkubator?", sek: true },
  { id: "zusage", text: "Ist die Übernahme im Zielkrankenhaus zugesagt?", sek: true },
  { id: "gewicht", text: "Wie schwer ist der Patient ungefähr – passt er auf eine normale Trage?", sek: true },
];

function ort(o: KtDaten["von"]): string {
  if (!o) return "weiß ich nicht";
  return o.khId ? `${o.label}` : o.label;
}

/** Wahre Antwort in einfachen Worten */
export function ktAntwortOhneKi(k: KtAuftrag, f: KtFrage): string {
  const w = k.wahr.d;
  const zuHause = !w.von?.khId;
  switch (f.id) {
    case "wer": {
      const a = k.wahr.anrufer;
      const anliegen = w.sek ? ` Ich bräuchte eine Überstellung${w.sofort ? ", dringend" : ""}${w.sek.bit ? " – der Patient ist sehr schwer, wir brauchen den BIT" : ""}.` : w.sofort && !w.von?.khId ? " Wir bräuchten einen Transport für eine Einweisung." : "";
      return (
        (a.rolle.startsWith("Pflegekraft") || a.rolle.startsWith("Ärzt") || a.rolle.startsWith("Arzt")
          ? `Grüß Gott, ${a.name}, ${a.rolle}.`
          : `Grüß Gott, ${a.name}, ich bin ${a.rolle === "Patient selbst" ? "selbst der Patient" : a.rolle}.`) + anliegen
      );
    }
    case "patient":
      return `${w.patient.name}, ${w.patient.alter} Jahre.`;
    case "von":
      return zuHause ? `Bei ${w.patient.geschlecht === "w" ? "ihr" : "ihm"} zu Hause: ${ort(w.von)}.` : `${ort(w.von)}.`;
    case "nach":
      return w.nach?.khId ? `Ins ${w.nach.label}.` : `Nach Hause: ${ort(w.nach)}.`;
    case "termin":
      return w.termin ? `Um ${hhmm(w.termin)}.` : "Das weiß ich nicht genau.";
    case "abholung":
      return w.abholung ? `So um ${hhmm(w.abholung)} bitte.` : "Rechtzeitig halt, dass sich der Termin ausgeht.";
    case "grund":
      return `${w.grund}.`;
    case "lage":
    {
      const basis =
        w.lage === "liegend" ? "Liegend, bitte." : w.lage === "rollstuhl" ? "Im eigenen Rollstuhl." : w.lage === "gehend" ? "Gehend, das geht schon." : "Sitzend.";
      const info = w.patient.info && !/rollstuhl/i.test(w.patient.info) ? ` ${w.patient.info[0].toUpperCase()}${w.patient.info.slice(1)}.` : "";
      return basis + info;
    }
    case "begleitung":
      return w.begleitung ? "Ja, eine Begleitperson fährt mit." : "Nein.";
    case "sauerstoff":
      return w.sauerstoff ? "Ja, Sauerstoff braucht er/sie." : "Nein.";
    case "infektion":
      return w.infektion ? "Ja, Isolation – MRSA." : "Nein, nichts bekannt.";
    case "art":
      return w.art === "KTR" ? "Am liebsten mit dem Roten Kreuz." : w.art === "KTA" ? "Wenn's geht, mit dem Samariterbund." : "Das ist egal.";
    case "telefon":
      return w.telefon;
    case "sofort":
      if (!w.sek) return w.sofort ? "So bald wie möglich bitte, der Hausarzt hat eine Einweisung geschrieben." : "Zum Termin, das reicht.";
      return w.sofort ? "Sofort bitte, das ist dringend." : "Geplant, das hat ein bisschen Zeit.";
    case "arzt":
      return w.sek?.arzt || w.sek?.beatmet ? "Ja, das muss notarztbegleitet sein." : "Nein, ein Arzt ist nicht nötig.";
    case "monitoring":
      return w.sek?.beatmet
        ? "Er ist intubiert und beatmet, braucht natürlich Monitoring."
        : w.sek?.monitoring
          ? "Ja, Monitoring braucht er, beatmet ist er nicht."
          : "Nein, kein Monitoring nötig.";
    case "stabil":
      return w.sek?.instabil ? "Nein, er ist kreislaufinstabil, wir sind laufend am Nachjustieren." : "Ja, derzeit stabil.";
    case "inkubator":
      return w.sek?.inkubator ? ((w.patient.alter ?? 1) < 1 ? "Ja, ein Neugeborenes, es braucht einen Inkubator." : `Ja, ein Kind, ${w.patient.alter} Jahre.`) : "Nein, ein Erwachsener.";
    case "gewicht":
      return w.sek?.bit ? "Er ist sehr schwer, deutlich über 150 Kilo – da braucht es den BIT." : "Normalgewichtig, das passt auf eine normale Trage.";
    case "zusage":
      return w.sek?.zusage ? `Ja, ${w.sek.zusage.replace(/^Übernahme zugesagt von /, "zugesagt hat ")}.` : "Das kläre ich gerade noch ab, ich melde mich.";
    default:
      return "Das weiß ich nicht.";
  }
}

function fakten(k: KtAuftrag): string {
  const w = k.wahr.d;
  return [
    `Patient: ${w.patient.name}, ${w.patient.alter} Jahre${w.patient.info ? ` (${w.patient.info})` : ""}`,
    `Abholort: ${ort(w.von)}${w.von?.khId ? "" : " (Wohnadresse)"}`,
    `Ziel: ${ort(w.nach)}${w.nach?.bereich ? ` (${bereichName(w.nach.bereich)})` : ""}`,
    `Termin: ${hhmm(w.termin)}`,
    `gewünschte Abholung: ${w.abholung ? hhmm(w.abholung) : "keine besondere, rechtzeitig"}`,
    `Grund: ${w.grund}`,
    `Transportart: ${w.lage ? KT_LAGE_LABEL[w.lage] : "?"}`,
    `Begleitperson: ${w.begleitung ? "ja" : "nein"}`,
    `Sauerstoff: ${w.sauerstoff ? "ja" : "nein"}`,
    `Infektion/Isolation: ${w.infektion ? "ja (MRSA)" : "nein"}`,
    `Wunsch Organisation: ${w.art === "KTR" ? "Rotes Kreuz" : w.art === "KTA" ? "Samariterbund" : "egal"}`,
    `Rückrufnummer: ${w.telefon}`,
    ...(w.sek
      ? [
          `Es ist eine Überstellung in ein anderes Krankenhaus. Dringlichkeit: ${w.sofort ? "sofort" : "geplant"}`,
          `Notarztbegleitung: ${w.sek.arzt || w.sek.beatmet ? "ja" : "nein"}; Monitoring: ${w.sek.monitoring ? "ja" : "nein"}; beatmet: ${w.sek.beatmet ? "ja" : "nein"}; stabil: ${w.sek.instabil ? "nein, kreislaufinstabil" : "ja"}`,
          `Inkubator/Kind: ${w.sek.inkubator ? "ja" : "nein"}; Übernahme: ${w.sek.zusage || "noch nicht zugesagt"}`,
          `Gewicht: ${w.sek.bit ? "sehr schwer, über 150 kg – BIT (Schwerlast-Transporter) nötig" : "normal"}`,
        ]
      : w.sofort
        ? ["Der Hausarzt hat eine Einweisung geschrieben, der Transport soll sofort sein."]
        : []),
  ].join("\n");
}

function prompt(k: KtAuftrag): string {
  const a = k.wahr.anrufer;
  return [
    `Du spielst in einer Trainingssimulation eine Person, die bei der Krankentransport-Hotline in Niederösterreich anruft, um einen Krankentransport zu bestellen (kein Notfall). Antworte nur mit dem, was diese Person ins Telefon sagt: Ich-Form, Deutsch, kurz, freundlich, keine Aufzählungen, keine Regieanweisungen.`,
    `Wer du bist: ${a.name}, ${a.rolle}.`,
    `Diese Angaben stimmen. Nenne jeweils nur das, wonach gefragt wird:`,
    fakten(k),
    `Wenn nach etwas gefragt wird, das oben nicht steht, antworte passend und knapp oder sag, dass du es nicht weißt. Wiederhole dich nicht.`,
  ].join("\n");
}

const laufend = new Set<string>();
export function ktAntwortetGerade(id: string): boolean {
  return laufend.has(id);
}

/** Leitstelle fragt (frei oder per 🗨); der Anrufer antwortet */
export async function ktFragen(k: KtAuftrag, text: string, frage?: KtFrage, onToken?: (t: string) => void): Promise<void> {
  if (laufend.has(k.id)) return;
  laufend.add(k.id);
  try {
    await sim.call("ktAnrufNachricht", k.id, "leitstelle", text);
    let antwort = "";
    if (!kiBereit() && inTauri() && kiPrefs().aktiv) await kiStatus().catch(() => null);
    if (kiBereit()) {
      const verlauf: KiNachricht[] = [{ role: "system", content: prompt(k) }];
      for (const m of k.anruf?.gespraech ?? []) {
        if (m.von === "leitstelle") verlauf.push({ role: "user", content: `Leitstelle: ${m.text}` });
        else if (m.von === "anrufer") verlauf.push({ role: "assistant", content: m.text });
      }
      const letzte = verlauf[verlauf.length - 1];
      if (!(letzte.role === "user" && letzte.content === `Leitstelle: ${text}`)) verlauf.push({ role: "user", content: `Leitstelle: ${text}` });
      if (frage) verlauf[verlauf.length - 1].content += `\n[Hinweis nur für dich, nicht aussprechen: Die richtige Antwort ist: ${ktAntwortOhneKi(k, frage)}]`;
      try {
        antwort = await kiChat(verlauf, onToken);
      } catch (e) {
        console.warn("KT-KI", e);
      }
    }
    if (!antwort) {
      await new Promise((r) => setTimeout(r, 600));
      antwort = frage ? ktAntwortOhneKi(k, frage) : einfach(k, text);
    }
    await sim.call("ktAnrufNachricht", k.id, "anrufer", antwort);
  } finally {
    laufend.delete(k.id);
  }
}

/** Freie Frage ohne KI: nach Stichworten die passende Schemafrage beantworten */
function einfach(k: KtAuftrag, text: string): string {
  const t = text.toLowerCase();
  const passend: [RegExp, KtFrage["id"]][] = [
    [/wer|spricht|name.*ihr/, "wer"],
    [/patient|heißt|alt/, "patient"],
    [/abhol.*wo|wo.*abhol|von wo/, "von"],
    [/wohin|ziel/, "nach"],
    [/termin/, "termin"],
    [/wann.*abhol|abholzeit/, "abholung"],
    [/grund|warum|diagnose/, "grund"],
    [/sitz|lieg|geh|rollstuhl/, "lage"],
    [/begleit/, "begleitung"],
    [/sauerstoff|o2/, "sauerstoff"],
    [/infekt|isol|mrsa/, "infektion"],
    [/rotes kreuz|samariter|asb|wunsch/, "art"],
    [/nummer|erreich|telefon/, "telefon"],
    [/dringend|sofort|eilig/, "sofort"],
    [/arzt|notarzt/, "arzt"],
    [/monitor|beatm/, "monitoring"],
    [/stabil|kreislauf/, "stabil"],
    [/inkubator|kind|neugeboren/, "inkubator"],
    [/zugesagt|übernahme|bett/, "zusage"],
    [/schwer|gewicht|kilo|trage|bit/, "gewicht"],
  ];
  const id = passend.find(([re]) => re.test(t))?.[1];
  const f = KT_FRAGEN.find((x) => x.id === id);
  return f ? ktAntwortOhneKi(k, f) : "Wie bitte? Das weiß ich leider nicht.";
}
