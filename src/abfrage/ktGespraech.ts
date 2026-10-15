/**
 * KT-Hotline: Gespräch mit dem Auftraggeber (Station, Patient, Angehörige, Hausarzt).
 * Feste Abfrage (kein importiertes Schema); Antworten mit KI oder einfachen Sätzen.
 */
import { inTauri } from "../platform";
import { sim } from "../sim/engine";
import { bereichName, hhmm, KT_LAGE_LABEL, type KtAuftrag, type KtDaten } from "../sim/kt";
import { schonGefragt } from "./gespraech";
import { kiBereit, kiPrefs, kiStatus, type KiNachricht } from "./ki";
import { hinweisZurArt, kiAntwortNeu, nachrichtArt } from "./runde";
import { anruferSagt, geschlechtAusName, satzSprecher } from "../ui/sprache";

export interface KtFrage {
  id: keyof KtDaten | "wer" | "patient" | "arzt" | "monitoring" | "stabil" | "inkubator" | "zusage" | "gewicht" | "zusatz" | "zustand";
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
  { id: "zusatz", text: "Gibt es sonst etwas zu beachten – fährt jemand mit, braucht der Patient Sauerstoff, gibt es eine Infektion?" },
  { id: "art", text: "Haben Sie einen Wunsch, mit wem Sie fahren – Rotes Kreuz oder Samariterbund?" },
  { id: "telefon", text: "Unter welcher Nummer erreichen wir Sie?" },
  // Überstellungen
  { id: "sofort", text: "Wie dringend ist die Überstellung – geplant oder sofort?", sek: true },
  { id: "arzt", text: "Braucht der Patient eine Notarztbegleitung?", sek: true },
  { id: "monitoring", text: "Braucht er Monitoring, ist er beatmet?", sek: true },
  { id: "stabil", text: "Ist der Patient stabil, oder muss während der Fahrt laufend an ihm gearbeitet werden?", sek: true },
  { id: "inkubator", text: "Ist es ein Kind oder ein Neugeborenes – braucht es einen Inkubator?", sek: true },
  { id: "zusage", text: "Ist die Übernahme im Zielkrankenhaus zugesagt?", sek: true },
  {
    id: "zustand",
    text: "Wie geht es dem Patienten – braucht er Notarzt oder Monitoring, ist er beatmet, ist er stabil? Ist er besonders schwer oder ein Kind?",
    sek: true,
  },
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
    case "zusatz": {
      const ja = [w.begleitung && "eine Begleitperson fährt mit", w.sauerstoff && "Sauerstoff braucht er/sie", w.infektion && "Isolation wegen MRSA"].filter(Boolean) as string[];
      const nein = [!w.begleitung && "keine Begleitung", !w.sauerstoff && "kein Sauerstoff", !w.infektion && "keine Infektion"].filter(Boolean) as string[];
      if (!ja.length) return "Nein, nichts Besonderes – keine Begleitung, kein Sauerstoff, keine Infektion.";
      return `${satz(ja.join(", "))}${nein.length ? ` Sonst nichts, ${nein.join(", ")}.` : ""}`;
    }
    case "zustand": {
      const z = w.sek;
      if (!z) return "Dem geht's den Umständen entsprechend gut.";
      const teile: string[] = [];
      teile.push(z.beatmet ? "Er ist intubiert und beatmet, braucht Monitoring" : z.monitoring ? "Monitoring braucht er, beatmet ist er nicht" : "Monitoring ist nicht nötig");
      teile.push(z.arzt || z.beatmet ? "es muss notarztbegleitet sein" : "ein Arzt muss nicht mit");
      teile.push(z.instabil ? "er ist kreislaufinstabil, wir justieren laufend nach" : "derzeit ist er stabil");
      if (z.inkubator) teile.push((w.patient.alter ?? 1) < 1 ? "es ist ein Neugeborenes, wir brauchen einen Inkubator" : `es ist ein Kind, ${w.patient.alter} Jahre`);
      if (z.bit) teile.push("und er ist sehr schwer, über 150 Kilo – da braucht es den BIT");
      return satz(teile.join(", "));
    }
    default:
      return "Das weiß ich nicht.";
  }
}

function satz(t: string): string {
  const s = t.trim();
  return s ? `${s[0].toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? "" : "."}` : s;
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

/** Uhrzeit der Simulation */
function jetztText(): string {
  return hhmm(sim.state.zeit);
}

export function ktPrompt(k: KtAuftrag): string {
  const a = k.wahr.anrufer;
  const w = k.wahr.d;
  const r = a.rolle.toLowerCase();
  const profi = /pflege|ärzt|arzt|station|assistent|ordination|heim/.test(r);
  const laie = !profi;
  const nachfrage = !!k.nachfrage && ["offen", "vorgemerkt", "unterwegs"].includes(k.status);
  const soll = w.abholung ?? (w.termin ? w.termin - 30 * 60_000 : null);
  const wartet = soll ? Math.max(0, Math.round((sim.state.zeit - soll) / 60_000)) : 0;
  const genervt = /ewig|wo bleibt/i.test(k.anruf?.gespraech.find((m) => m.von === "anrufer")?.text ?? "");
  return [
    `Du spielst in einer Trainingssimulation eine echte Person, die bei der Krankentransport-Hotline in Niederösterreich anruft (kein Notfall). Du sagst nur, was diese Person ins Telefon spricht: gesprochene Sprache, Ich-Form, Deutsch – keine Aufzählungen, keine Regieanweisungen.`,
    `WER DU BIST: ${a.name}, ${a.rolle}.`,
    `Es ist jetzt ${jetztText()} Uhr.`,
    nachfrage
      ? `WARUM DU ANRUFST: Der Transport ist noch nicht da. Ausgemacht war die Abholung um ${soll ? hhmm(soll) : "?"}, ihr wartet also schon ${wartet} Minuten${w.termin ? `, und um ${hhmm(w.termin)} ist der Termin` : ""}. Du willst wissen, wann der Wagen kommt${w.termin ? " und ob sich der Termin noch ausgeht" : ""}. ${genervt ? "Du bist verärgert, wirst aber freundlicher, wenn man dir eine klare Auskunft gibt." : "Du bist freundlich, aber ein bisschen besorgt."}`
      : `WARUM DU ANRUFST: Du willst einen Krankentransport bestellen${w.sek ? " (eine Überstellung in ein anderes Krankenhaus)" : ""}.`,
    `DIESE ANGABEN STIMMEN (nenne jeweils nur das, wonach gefragt wird):`,
    fakten(k),
    `WIE DU REDEST:`,
    profi
      ? `- Du bist vom Fach und hast so einen Anruf schon oft gemacht: freundlich, knapp, sachlich – aber wie ein Mensch am Telefon, nicht wie ein Formular.`
      : `- Du bist kein Profi: Du redest in Alltagssprache, manchmal etwas umständlich, ab und zu mit „äh“ oder „Moment, ich schau nach“.`,
    `- Beantworte genau die Frage, die gestellt wird, in ein bis zwei kurzen Sätzen. Auf „Wohin?“ kommt nur das Ziel, auf „Wann?“ nur die Zeit.`,
    `- Sag nichts, was du schon gesagt hast. Du fasst nie selbst zusammen und fragst nicht zurück, ob du etwas richtig verstanden hast – das macht die Leitstelle, nicht du.`,
    `- Fasst die Leitstelle zusammen, bestätigst du kurz („Ja, passt.“) oder korrigierst, was nicht stimmt.`,
    `- Teilt dir die Leitstelle etwas mit (eine Zeit, eine Verzögerung, dass alles erledigt ist), reagierst du kurz darauf: bedanken, kurz nachfragen${nachfrage ? ", ob sich der Termin noch ausgeht, oder sagen, dass du in der Dialyse/Ordination Bescheid gibst" : ""}.`,
    `- Rechne keine Uhrzeiten selbst aus. Nennt die Leitstelle eine Dauer („in einer halben Stunde“), übernimmst du die Dauer so, ohne Uhrzeit.`,
    `- Bei allgemeinen Fragen („Gibt es sonst etwas zu beachten?“, „Wie geht es dem Patienten?“) sagst du alle zutreffenden Besonderheiten in ein, zwei Sätzen.`,
    `- Wird nach etwas gefragt, das oben nicht steht, antwortest du passend und knapp oder sagst ehrlich, dass du es nicht weißt.`,
    laie ? `So ungefähr klingst du: „Ja, äh, sitzen kann sie schon, aber gehen geht schlecht.“ / „Moment, die Nummer hab ich da … 0664 …“` : `So ungefähr klingst du: „Ins LK Horn, auf die Neurologie.“ / „Liegend, sie hat noch einen Perfusor dran.“`,
  ]
    .filter(Boolean)
    .join("\n");
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
    const an = k.wahr?.anrufer;
    const stimme = { geschlecht: geschlechtAusName(`${an?.rolle ?? ""} ${an?.name ?? ""}`), emotion: "ruhig", name: an?.name };
    // fertige Sätze schon vorlesen, während die KI noch schreibt (bei fester Antwort: neu, ganz)
    let sprecher = satzSprecher((satz) => anruferSagt(satz, stimme, k.id));
    const sprecherNeu = () => (sprecher = satzSprecher((satz) => anruferSagt(satz, stimme, k.id)));
    let antwort = "";
    let quelle: "ki" | "fest" = "ki";
    if (!kiBereit() && inTauri() && kiPrefs().aktiv) await kiStatus().catch(() => null);
    if (kiBereit()) {
      const verlauf: KiNachricht[] = [{ role: "system", content: ktPrompt(k) }];
      for (const m of k.anruf?.gespraech ?? []) {
        if (m.von === "leitstelle") verlauf.push({ role: "user", content: `Leitstelle: ${m.text}` });
        else if (m.von === "anrufer") verlauf.push({ role: "assistant", content: m.text });
      }
      const letzte = verlauf[verlauf.length - 1];
      if (!(letzte.role === "user" && letzte.content === `Leitstelle: ${text}`)) verlauf.push({ role: "user", content: `Leitstelle: ${text}` });
      const g = k.anruf?.gespraech ?? [];
      const wiederholt = schonGefragt(g, text);
      const vorher = [...g].reverse().find((m) => m.von === "anrufer")?.text;
      const art = frage ? "frage" : nachrichtArt(text);
      const profi = /pflege|ärzt|arzt|station|assistent|ordination|heim/i.test(k.wahr.anrufer.rolle);
      const hinweise: string[] = [];
      if (frage) hinweise.push(`Die richtige Antwort ist: ${ktAntwortOhneKi(k, frage)} – sag es in deinen eigenen Worten.`);
      else if (art === "frage") hinweise.push("Geh genau auf DIESE Frage ein und beantworte nur sie.");
      else hinweise.push(hinweisZurArt(art, !profi));
      if (wiederholt) hinweise.push("Die Frage wurde schon gestellt: antworte kurz mit „Wie gesagt, …“ in anderen Worten.");
      else if (vorher) hinweise.push(`Deine letzte Antwort war „${vorher}“ – sag nichts davon noch einmal.`);
      verlauf[verlauf.length - 1].content += `\n[Hinweis nur für dich, nicht aussprechen: ${hinweise.join(" ")}]`;
      const frueher = g.filter((m) => m.von === "anrufer").map((m) => m.text);
      try {
        antwort = await kiAntwortNeu(
          verlauf,
          frueher,
          (t) => {
            onToken?.(t);
            sprecher.token(t);
          },
          { pruefen: !wiederholt },
        );
      } catch (e) {
        console.warn("KT-KI", e);
      }
    }
    if (!antwort) {
      await new Promise((r) => setTimeout(r, 600));
      antwort = frage ? ktAntwortOhneKi(k, frage) : einfach(k, text);
      if (schonGefragt(k.anruf?.gespraech ?? [], text)) antwort = `Wie gesagt: ${antwort.charAt(0).toLowerCase()}${antwort.slice(1)}`;
      quelle = "fest";
    }
    await sim.call("ktAnrufNachricht", k.id, "anrufer", antwort, quelle);
    if (quelle === "fest") sprecherNeu();
    sprecher.ende(antwort);
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
  const sek = !!k.wahr.d.sek;
  // allgemeine Fragen: alles Zutreffende auf einmal
  const allgemein: [RegExp, KtFrage["id"]][] = [
    [/(sonst|noch).*(beacht|wissen|besonder)|besonderheit|zu beachten|was.*mitnehmen/, "zusatz"],
    [/wie geht|zustand|wie ist .*patient|was braucht .*(fahrt|transport)/, "zustand"],
  ];
  const ids: KtFrage["id"][] = [];
  for (const [re, id] of allgemein) if (re.test(t) && (id !== "zustand" || sek)) ids.push(id);
  for (const [re, id] of passend) if (re.test(t) && !ids.includes(id)) ids.push(id);
  // Einzelfragen, die in einer allgemeinen schon stecken, nicht doppelt
  const inZusatz = ["begleitung", "sauerstoff", "infektion"];
  const inZustand = ["arzt", "monitoring", "stabil", "inkubator", "gewicht"];
  const auswahl = ids
    .filter((id) => !(ids.includes("zusatz") && inZusatz.includes(id)) && !(ids.includes("zustand") && inZustand.includes(id)))
    .slice(0, 4);
  const antworten = auswahl.map((id) => KT_FRAGEN.find((x) => x.id === id)).filter((f): f is KtFrage => !!f).map((f) => ktAntwortOhneKi(k, f));
  return antworten.length ? antworten.join(" ") : "Wie bitte? Das weiß ich leider nicht.";
}
