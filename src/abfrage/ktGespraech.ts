/**
 * KT-Hotline: Gespräch mit dem Auftraggeber (Station, Patient, Angehörige, Hausarzt).
 * Feste Abfrage (kein importiertes Schema); Antworten mit KI oder einfachen Sätzen.
 */
import { inTauri } from "../platform";
import { sim } from "../sim/engine";
import { bereichName, hhmm, type KtAuftrag, type KtDaten } from "../sim/kt";
import { ohneFrageEcho, schonGefragt } from "./gespraech";
import { buchstabiert, fragtSchreibweise, namensTeil } from "./buchstabieren";
import { ohnePatientWort } from "./sprechfrage";
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

/** „UK Tulln, Dialyse“ → „Ins UK Tulln, Dialyse“; „Floridsdorf, Herzkatheterlabor“ → „In die Klinik Floridsdorf, …“ */
function zumKh(label: string): string {
  const i = label.lastIndexOf(", ");
  const haus = i < 0 ? label : label.slice(0, i);
  const bereich = i < 0 ? "" : label.slice(i + 2);
  const zu = /^(LK|UK|KH|LKH|AKH|BBR|Landesklinikum|Universitätsklinikum|Krankenhaus)\b/i.test(haus) ? `Ins ${haus}` : /^Klinik\b/i.test(haus) ? `In die ${haus}` : `In die Klinik ${haus}`;
  return bereich ? `${zu}, ${bereich}` : zu;
}

function ort(o: KtDaten["von"]): string {
  if (!o) return "weiß ich nicht";
  return o.khId ? `${o.label}` : o.label;
}

/** Wahre Antwort in einfachen Worten (passend zum Geschlecht des Patienten) */
export function ktAntwortOhneKi(k: KtAuftrag, f: KtFrage): string {
  return ktGeschlecht(ktAntwortRoh(k, f), k.wahr.d.patient.geschlecht);
}

function ktAntwortRoh(k: KtAuftrag, f: KtFrage): string {
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
      return w.nach?.khId ? `${zumKh(w.nach.label)}.` : `Nach Hause: ${ort(w.nach)}.`;
    case "termin":
      return w.termin ? `Um ${hhmm(w.termin)}.` : "Das weiß ich nicht genau.";
    case "abholung":
      return w.abholung ? `So um ${hhmm(w.abholung)} bitte.` : "Rechtzeitig halt, dass sich der Termin ausgeht.";
    case "grund":
      return `${w.grund}.`;
    case "lage":
    {
      const basis =
        w.lage === "liegend" ? "Liegend bitte – sitzen geht nicht." : w.lage === "rollstuhl" ? "Im eigenen Rollstuhl." : w.lage === "gehend" ? "Gehen geht, sitzend mitfahren reicht." : "Sitzend im Tragstuhl – weit gehen geht nicht.";
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
      else if (!z.inkubator) teile.push("vom Gewicht her normal");
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

/** Ruft der Patient selbst an? */
export function ktSelbst(k: KtAuftrag): boolean {
  return /^patient selbst/i.test(k.wahr.anrufer.rolle);
}

/** Transportart als ganzer Satz (das Stichwort „liegend“ allein hat das kleine Modell verdreht) */
function lageSatz(k: KtAuftrag): string {
  const w = k.wahr.d;
  const ich = ktSelbst(k);
  const er = w.patient.geschlecht === "w" ? "sie" : "er";
  const kann = ich ? "du kannst" : `${er} kann`;
  const muss = ich ? "du musst" : `${er} muss`;
  switch (w.lage) {
    case "liegend":
      return `Sitzen geht nicht – ${muss} liegend transportiert werden (auf der Trage).`;
    case "sitzend":
      return `Sitzen geht, aber gehen nicht weit – ${muss} im Tragstuhl sitzend transportiert werden, nicht liegend.`;
    case "gehend":
      return `${kann.charAt(0).toUpperCase()}${kann.slice(1)} selbst gehen und sitzend mitfahren.`;
    case "rollstuhl":
      return `${ich ? "Du sitzt" : `${er.charAt(0).toUpperCase()}${er.slice(1)} sitzt`} im eigenen Rollstuhl und ${ich ? "fährst" : "fährt"} darin mit.`;
    default:
      return "Transportart: weiß ich nicht.";
  }
}

function fakten(k: KtAuftrag): string {
  const w = k.wahr.d;
  const ich = ktSelbst(k);
  const er = w.patient.geschlecht === "w" ? "Sie" : "Er";
  const wer = ich ? "Du" : er;
  const hat = ich ? "hast" : "hat";
  const braucht = ich ? "brauchst" : "braucht";
  return [
    ich
      ? `Du bist selbst der Patient: ${w.patient.name}, ${w.patient.alter} Jahre${w.patient.info ? ` (${w.patient.info})` : ""}.`
      : `Patient: ${w.patient.name}, ${w.patient.alter} Jahre${w.patient.info ? ` (${w.patient.info})` : ""}`,
    `Abholort: ${ort(w.von)}${w.von?.khId ? "" : " (Wohnadresse)"}`,
    `Ziel: ${ort(w.nach)}${w.nach?.bereich ? ` (${bereichName(w.nach.bereich)})` : ""}`,
    `Termin: ${hhmm(w.termin)}`,
    `gewünschte Abholung: ${w.abholung ? hhmm(w.abholung) : "keine besondere, rechtzeitig"}`,
    `Grund: ${w.grund}`,
    `Transportart: ${lageSatz(k)}`,
    w.begleitung ? "Eine Begleitperson fährt mit." : "Es fährt niemand mit.",
    `${wer} ${braucht} ${w.sauerstoff ? "Sauerstoff" : "keinen Sauerstoff"}.`,
    w.infektion ? `${wer} ${hat} einen Keim (MRSA) – Isolation nötig.` : "Eine Infektion oder Isolation gibt es nicht.",
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
    !ktSelbst(k) ? (laie ? `- Den Patienten nennst du so, wie du ${w.patient.geschlecht === "w" ? "sie" : "ihn"} nennst (z. B. ${laieBezug(a.rolle, w.patient.geschlecht)} oder „${w.patient.geschlecht === "w" ? "sie" : "er"}“) – nie „der Patient“.` : `- Es ist ${w.patient.geschlecht === "w" ? "eine Patientin: sag „die Patientin“ bzw. „sie“" : "ein Patient: sag „der Patient“ bzw. „er“"}.`) : "",
    ktSelbst(k) ? `- Du bist selbst der Patient: Du redest IMMER in der Ich-Form über dich („ich muss liegen“, „ich wohne …“) – nie „der Patient“, nie „er“.` : "",
    `- Beantworte genau die Frage, die gestellt wird, in ein bis zwei kurzen Sätzen. Auf „Wohin?“ kommt nur das Ziel, auf „Wann?“ nur die Zeit. Uhrzeiten nennst du genau so, wie sie oben stehen.`,
    `- Die Leitstelle sprichst du mit „Sie“ an.`,
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

/** Wie ein Angehöriger den Patienten nennt („Tochter der Patientin“ → „meine Mutter“) */
function laieBezug(rolle: string, g: "m" | "w" | null): string {
  const r = rolle.toLowerCase();
  const w = g === "w";
  if (/tochter|sohn/.test(r)) return w ? "„meine Mutter“" : "„mein Vater“";
  if (/(ehe)?frau|gattin|partnerin/.test(r)) return w ? "„meine Frau“" : "„mein Mann“";
  if (/(ehe)?mann|gatte|partner/.test(r)) return w ? "„meine Frau“" : "„mein Mann“";
  if (/enkel/.test(r)) return w ? "„meine Oma“" : "„mein Opa“";
  if (/mutter|vater|eltern/.test(r)) return w ? "„meine Tochter“" : "„mein Sohn“";
  return w ? "„die Frau …“ mit Namen" : "„der Herr …“ mit Namen";
}

const laufend = new Set<string>();
export function ktAntwortetGerade(id: string): boolean {
  return laufend.has(id);
}

/**
 * Antwort des Anrufers auf eine Nachricht der Leitstelle – ohne Nebenwirkungen (der Testlauf nutzt das direkt).
 * Die Nachricht der Leitstelle muss schon im Gespräch stehen.
 */
export async function ktAntwort(k: KtAuftrag, text: string, frage?: KtFrage, onToken?: (t: string) => void): Promise<{ antwort: string; quelle: "ki" | "fest"; korrigiert?: string }> {
  let antwort = "";
  let korrigiert: string | undefined;
  let quelle: "ki" | "fest" = "ki";
  // Fest vom Programm: Buchstabieren und Verabschieden (da hat das kleine Modell Unsinn geredet)
  const art0 = frage ? "frage" : nachrichtArt(text);
  if (!frage && fragtSchreibweise(text)) {
    const anruferName = /\b(ihr(en)?|ihr) (name|nachname|vorname)\b|wie heißen sie/i.test(text) && !/patient/i.test(text);
    return { antwort: buchstabiert(namensTeil(text, anruferName ? k.wahr.anrufer.name : k.wahr.d.patient.name)), quelle: "fest" };
  }
  if (art0 === "abschluss") return { antwort: ktAbschied(k), quelle: "fest" };
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
    // die gerade gestellte Frage zählt nicht als „schon gefragt“
    const vorher = g.slice(0, g.length && g[g.length - 1].von === "leitstelle" && g[g.length - 1].text === text ? -1 : undefined);
    const wiederholt = schonGefragt(vorher, text);
    const letzteAntwort = [...vorher].reverse().find((m) => m.von === "anrufer")?.text;
    const art = frage ? "frage" : nachrichtArt(text);
    const profi = /pflege|ärzt|arzt|station|assistent|ordination|heim/i.test(k.wahr.anrufer.rolle);
    const hinweise: string[] = [];
    if (frage) hinweise.push(`Die richtige Antwort ist: ${ktAntwortOhneKi(k, frage)} – sag es in deinen eigenen Worten.`);
    else if (art === "frage") hinweise.push("Geh genau auf DIESE Frage ein und beantworte nur sie.");
    else if (art === "zusammenfassung") hinweise.push(ktZusammenfassungHinweis(k, text));
    else hinweise.push(hinweisZurArt(art, !profi));
    if (ktSelbst(k)) hinweise.push("Du bist selbst der Patient – Ich-Form.");
    if (wiederholt) hinweise.push("Die Frage wurde schon gestellt: antworte kurz mit „Wie gesagt, …“ in anderen Worten.");
    else if (letzteAntwort) hinweise.push(`Deine letzte Antwort war „${letzteAntwort}“ – sag nichts davon noch einmal.`);
    verlauf[verlauf.length - 1].content += `\n[Hinweis nur für dich, nicht aussprechen: ${hinweise.join(" ")}]`;
    const frueher = vorher.filter((m) => m.von === "anrufer").map((m) => m.text);
    try {
      antwort = await kiAntwortNeu(verlauf, frueher, (t) => onToken?.(t), { pruefen: !wiederholt });
    } catch (e) {
      console.warn("KT-KI", e);
    }
    if (antwort) {
      const vorSchliff = antwort;
      antwort = ktFeinschliff(k, text, art, antwort);
      if (antwort !== vorSchliff && quelle === "ki") korrigiert ??= vorSchliff;
    }
    // Transportart verdreht („kann nicht liegen, muss liegend …“)? Dann die richtige Angabe
    if (antwort && art !== "zusammenfassung" && ktPruefen(k, text, antwort).some((x) => x.startsWith("Transportart"))) {
      korrigiert = antwort;
      antwort = ktAntwortOhneKi(k, KT_FRAGEN.find((f) => f.id === "lage")!);
      quelle = "fest";
    }
  }
  if (!antwort) {
    antwort = frage ? ktAntwortOhneKi(k, frage) : einfach(k, text);
    if (schonGefragt((k.anruf?.gespraech ?? []).slice(0, -1), text)) antwort = `Wie gesagt: ${antwort.charAt(0).toLowerCase()}${antwort.slice(1)}`;
    quelle = "fest";
  }
  return { antwort, quelle, korrigiert };
}

function zufall<T>(l: T[]): T {
  return l[Math.floor(Math.random() * l.length)];
}

/** Ist der Anrufer vom Fach (Station, Heim, Ordination)? */
function ktProfi(k: KtAuftrag): boolean {
  return /pflege|ärzt|arzt|station|assistent|ordination|heim/i.test(k.wahr.anrufer.rolle);
}

/** Verabschieden – fest, kurz, freundlich */
export function ktAbschied(k: KtAuftrag): string {
  return ktProfi(k) ? zufall(["Danke, auf Wiederhören.", "Passt, danke – auf Wiederhören.", "Danke Ihnen, wiederhören!"]) : zufall(["Danke schön, auf Wiederhören!", "Vielen Dank, auf Wiederhören.", "Danke, wiederhören!"]);
}

/**
 * Letzter Schliff an jeder KT-Antwort (gilt für alle Aufträge):
 * keine wiederholte Frage, „die Patientin“ statt „der Patient“, keine Leitstellen-Rückfragen,
 * kein Notruf-Satz („ich bleib dran“), falsche Rückfragen der Leitstelle werden korrigiert.
 */
export function ktFeinschliff(k: KtAuftrag, text: string, art: string, antwort: string): string {
  const w = k.wahr.d;
  const weiblich = w.patient.geschlecht === "w";
  const profi = ktProfi(k);
  let t = ohneFrageEcho(antwort, text) || antwort;
  t = ktGeschlecht(t, w.patient.geschlecht);
  // Angehörige und der Patient selbst sagen nicht „der Patient“
  if (!profi) t = ohnePatientWort(t, weiblich);
  return ktSchliffRest(k, text, art, t);
}

/** „Der Patient“, „er“ … passend zum Geschlecht des Patienten */
export function ktGeschlecht(t: string, g: "m" | "w" | null): string {
  if (g === "w") {
    return t
      .replace(/\bDer Patientin (?=(soll|wird|muss|kann|ist|hat|heißt|braucht|benötigt|fährt|bekommt)\b)/g, "Die Patientin ")
      .replace(/\bDer Patient\b/g, "Die Patientin")
      .replace(/\bder Patient\b/g, "die Patientin")
      .replace(/\b(den|dem|des) Patienten\b/g, (_m, a: string) => (a === "den" ? "die Patientin" : "der Patientin"))
      .replace(/(^|[.!?–,:]\s+|\bund\s+)Er\b|(^|[.!?–,:]\s+|\bund\s+)er\b(?= (kann|muss|braucht|hat|ist|fährt|wird|soll|benötigt|bekommt|geht|sitzt|liegt)\b)/g, (m) => m.replace(/Er$/, "Sie").replace(/er$/, "sie"))
      .replace(/\b(kann|muss|braucht|hat|ist|wird|soll|benötigt) er\b/g, "$1 sie")
      .replace(/\bihn\b/g, "sie")
      .replace(/\bihm\b/g, "ihr")
      .replace(/\bsein(e[nmrs]?)?\b/g, (_m, e?: string) => `ihr${e ?? ""}`)
      .replace(/\ber\/sie\b/g, "sie");
  }
  if (g === "m") {
    return t
      .replace(/\bDie Patientin\b/g, "Der Patient")
      .replace(/\bdie Patientin\b/g, "der Patient")
      .replace(/\bder Patientin\b/g, "dem Patienten")
      .replace(/(^|[.!?–,:]\s+)Sie (?=(kann|muss|braucht|hat|ist|fährt|wird|soll|benötigt|bekommt|geht|sitzt|liegt)\b)/g, "$1Er ")
      .replace(/\ber\/sie\b/g, "er");
  }
  return t;
}

function ktSchliffRest(k: KtAuftrag, text: string, art: string, eingang: string): string {
  const profi = ktProfi(k);
  let t = eingang;
  // Notruf-Sätze und schräge Reaktionen gehören nicht an die KT-Hotline
  const schraeg = /\b(ich )?bleib\w* (ich )?dran\b|\bich warte\b|bis gleich\b|das (weiß ich|wissen wir)\b|ich schau, dass ich (sie|ihn) seh|das melden sie gern|wird gut gemacht|das war gut( so)?\b/i;
  // Rückfragen, die nur die Leitstelle stellt („Noch etwas anderes nötig?“) – erlaubt bleiben echte Anrufer-Fragen
  const erlaubteFrage = /wann|wie lange|vorbereiten|mitgeben|mitnehmen|herrichten|e-?card|transportschein|pünktlich|ausgeht|bescheid|wer (holt|kommt)|wie viel kostet|kostet/i;
  const teile = t.split(/(?<=[.!?…])\s+/).filter((x) => x.trim());
  let rest = teile.filter((x) => !schraeg.test(x) && (!/\?\s*$/.test(x) || erlaubteFrage.test(x) || art === "frage" && teile.length === 1));
  // Rückfrage der Leitstelle: bei einem Fehler widersprechen, sonst kurz bestätigen (ohne alles zu wiederholen)
  if (art === "zusammenfassung") {
    const falsch = ktZusammenfassungFalsch(k, text);
    const stimmtZu = /^\W*(ja|passt|genau|richtig|stimmt|jo|mhm|korrekt)\b/i.test(rest[0] ?? "") && !/\b(nein|nicht|net)\b/i.test(rest[0] ?? "");
    if (falsch.length && (stimmtZu || !rest.length)) rest = [`${zufall(["Nein, Moment", "Nein, nicht ganz", "Na, Moment"])} – ${falsch.join(", und ")}.`];
    else if (falsch.length) rest = rest.filter((x, i) => i === 0 || !/^\W*(passt|ja,? passt|stimmt)\b/i.test(x));
    else {
      const ww = (x: string) => x.toLowerCase().replace(/[^a-zäöüß0-9 ]/g, " ").split(/\s+/).filter((y) => y.length > 3);
      const fw = new Set(ww(text));
      rest = rest.filter((x, i) => i === 0 || ww(x).filter((y) => fw.has(y)).length / Math.max(1, ww(x).length) < 0.5);
    }
  }
  if (!rest.length) rest = [art === "mitteilung" ? (profi ? zufall(["Passt, danke!", "Gut, danke.", "Alles klar, danke."]) : zufall(["Gut, danke schön.", "Danke! Muss ich noch irgendwas vorbereiten?", "Alles klar, danke."])) : art === "anweisung" ? zufall(["Gut, mach ich.", "Ja, passt, richte ich her.", "Okay, danke."]) : "Das weiß ich leider nicht."];
  t = rest.join(" ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Rückfrage der Leitstelle („Also: … passt das?“) gegen die Wahrheit prüfen */
function ktZusammenfassungHinweis(k: KtAuftrag, text: string): string {
  const falsch = ktZusammenfassungFalsch(k, text);
  return falsch.length
    ? `Die Zusammenfassung der Leitstelle ist FALSCH: ${falsch.join("; ")}. Widersprich sofort und sag, wie es richtig ist. Auf keinen Fall „passt“ oder „ja“.`
    : "Die Zusammenfassung stimmt. Bestätige ganz kurz.";
}

/** Uhrzeiten („11:04“, „um 11 Uhr“) in Minuten seit Mitternacht */
function uhrzeiten(t: string): number[] {
  const out: number[] = [];
  for (const m of t.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)) out.push(Number(m[1]) * 60 + Number(m[2]));
  for (const m of t.matchAll(/\b(\d{1,2}) ?Uhr(?:\s+(\d{1,2})\b)?/gi)) if (!/[:.]\d{2}\s*$/.test(t.slice(0, m.index ?? 0))) out.push(Number(m[1]) * 60 + Number(m[2] ?? 0));
  return out.filter((x) => x < 24 * 60);
}

function minuten(t: number | null | undefined): number | null {
  if (!t) return null;
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/** Was an der Rückfrage der Leitstelle nicht stimmt (in Alltagsworten) */
export function ktZusammenfassungFalsch(k: KtAuftrag, text: string): string[] {
  const w = k.wahr.d;
  const t = text.toLowerCase();
  const falsch: string[] = [];
  const zeiten = [minuten(w.abholung), minuten(w.termin)].filter((x): x is number => x !== null);
  if (uhrzeiten(text).some((z) => zeiten.length && !zeiten.some((x) => Math.abs(x - z) <= 5)))
    falsch.push(`die Uhrzeit stimmt nicht: ${[w.abholung && `Abholung um ${hhmm(w.abholung)}`, w.termin && `Termin um ${hhmm(w.termin)}`].filter(Boolean).join(", ")}`);
  if (/\bliegend\b/.test(t) && w.lage && w.lage !== "liegend") falsch.push(`nicht liegend, sondern ${w.lage === "rollstuhl" ? "im eigenen Rollstuhl" : w.lage === "gehend" ? "gehend" : "sitzend"}`);
  if (/\bsitzend\b/.test(t) && w.lage === "liegend") falsch.push("nicht sitzend, sondern liegend");
  if (/mit begleit/.test(t) && !w.begleitung) falsch.push("es fährt niemand mit");
  if (/ohne begleit/.test(t) && w.begleitung) falsch.push("es fährt doch jemand mit");
  return falsch;
}

/**
 * Auffälligkeiten einer KT-Antwort gegen die Wahrheit (für den Testlauf; „Transportart …“ auch zum Korrigieren im Spiel)
 */
export function ktPruefen(k: KtAuftrag, frage: string, antwort: string): string[] {
  const w = k.wahr.d;
  const f = frage.toLowerCase();
  const a = antwort.toLowerCase();
  const g: string[] = [];
  // Transportart
  const lageFrage = /sitz|lieg|transportart/.test(f) && !/^also/.test(f);
  if (w.lage === "liegend" && (/kann nicht liegen|nicht liegend|\bsitzend\b/.test(a) && !/nicht sitzend|kann nicht sitzen|sitzen (geht|kann) (er |sie |ich )?nicht/.test(a))) g.push("Transportart verdreht (liegend)");
  else if (lageFrage && w.lage && w.lage !== "liegend" && /\bliegend\b|muss liegen/.test(a) && !/nicht liegend|muss nicht liegen|kein(e)? liege/.test(a)) g.push("Transportart verdreht (nicht liegend)");
  // Uhrzeiten: nur solche, die stimmen oder die die Leitstelle selbst genannt hat
  const genannt = (k.anruf?.gespraech ?? []).filter((m) => m.von === "leitstelle").flatMap((m) => uhrzeiten(m.text));
  const erlaubt = [minuten(w.abholung), minuten(w.termin), minuten(sim.state.zeit), ...genannt].filter((x): x is number => x !== null);
  if (uhrzeiten(antwort).some((z) => !erlaubt.some((x) => Math.abs(x - z) <= 5))) g.push("falsche Uhrzeit");
  // Ja/Nein-Angaben
  const neg = /\b(nein|nicht|kein\w*|niemand|na)\b/;
  if (/begleit/.test(f) && !/sonst/.test(f) && (w.begleitung ? neg.test(a) && !/ja/.test(a) : !neg.test(a))) g.push("Begleitperson falsch");
  if (/sauerstoff/.test(f) && !/sonst/.test(f) && (w.sauerstoff ? neg.test(a) && !/ja/.test(a) : !neg.test(a))) g.push("Sauerstoff falsch");
  if (/infekt|isolation/.test(f) && !/sonst/.test(f) && (w.infektion ? neg.test(a) && !/ja|mrsa|keim/.test(a) : !neg.test(a))) g.push("Infektion falsch");
  // Patient, Alter, Orte
  if (/heißt der patient|wie alt/.test(f)) {
    const nach = (w.patient.name.split(" ").pop() ?? "").toLowerCase();
    if (nach && !a.includes(nach)) g.push("Name des Patienten fehlt");
    if (w.patient.alter && !a.includes(String(w.patient.alter))) g.push("Alter falsch oder fehlt");
  }
  const wort = (o: KtDaten["von"]) => (o?.label.split(/[ ,]/).find((x) => x.length > 3 && !/^(klinik|landesklinikum|universitätsklinikum)$/i.test(x)) ?? "").toLowerCase();
  if (/abgeholt|abhol.*wo|von wo/.test(f) && !/wann/.test(f) && w.von && !a.includes(wort(w.von))) g.push("Abholort falsch oder fehlt");
  if (/wohin|\bziel(ort)?\b/.test(f) && w.nach && !a.includes(wort(w.nach))) g.push("Ziel falsch oder fehlt");
  // Selbstanrufer redet von sich in der 3. Person
  if (ktSelbst(k) && /\b(der patient|die patientin)\b/.test(a)) g.push("Selbstanrufer redet von „dem Patienten“");
  // falsche Rückfrage abgenickt
  if (/^also\b/.test(f) && ktZusammenfassungFalsch(k, frage).length && /^\W*(ja|passt|genau|richtig|stimmt|jo|mhm)\b/.test(a) && !/\b(nein|nicht|net)\b/.test(a.split(/[.!?]/)[0])) g.push("nickt falsche Zusammenfassung ab");
  return g;
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
    const { antwort, quelle } = await ktAntwort(k, text, frage, (t) => {
      onToken?.(t);
      sprecher.token(t);
    });
    if (quelle === "fest") await new Promise((r) => setTimeout(r, 600));
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
