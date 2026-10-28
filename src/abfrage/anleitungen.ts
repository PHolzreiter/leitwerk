/**
 * Anleitungs-Bausteine: wie ein Anrufer auf eine Anleitung der Leitstelle reagiert – einmal allgemein
 * hinterlegt (Reanimation, Blutung, Seitenlage, Geburt, Fremdkörper, Lagerung, Zucker …).
 * Ein Fall legt nur Abweichungen fest (z. B. „alt“: kann nicht lange drücken, „bett“: Patient liegt im Bett).
 *
 * Platzhalter: {er} {Er} {ihm} {ihn} {sein} – werden nach dem Geschlecht des Patienten gefüllt.
 */
import type { AnleitungTyp } from "./faelle";
import type { AnrufKontext } from "./anrufer";

export interface Abweichung {
  /** Name für den Fall-Editor */
  name: string;
  /** für die Fallakte der KI: so ist es bei dir */
  akte: string;
  /** Kern, wenn die Anleitung kommt (die KI sagt es mit eigenen Worten) */
  kern: string;
  /** feste Antwort (ohne KI bzw. wenn die KI danebenliegt) */
  sagt: string;
  /** die Anleitung geht so nicht (der Anrufer macht es nicht bzw. anders) */
  geht?: false;
  /** gilt nur einmal (z. B. zuerst Angst, dann geht es) */
  einmal?: true;
  /** gilt erst ab der n-ten Anleitung dieser Art (z. B. Fremdkörper kommt beim 2. Mal heraus) */
  abMal?: number;
}

export interface Baustein {
  name: string;
  /** feste Antworten beim Ausführen (eine davon) */
  sagt: string[];
  /** typische Rückfrage eines Laien – kommt höchstens einmal, nicht immer */
  rueckfrage?: string[];
  /** Abweichungen, die ein Fall setzen kann */
  abweichungen: Record<string, Abweichung>;
}

export const BAUSTEINE: Record<AnleitungTyp, Baustein> = {
  reanimation: {
    name: "Reanimation (Herzdruckmassage)",
    sagt: ["Okay … ich drück … eins, zwei, drei, vier, fünf …", "Ja, ich mach … eins, zwei, drei, vier …"],
    rueckfrage: ["Wie fest muss ich denn drücken?", "Ich hab Angst, dass ich {ihm} was breche!", "Muss ich auch beatmen?"],
    abweichungen: {
      alt: {
        name: "Anrufer alt/schwach – hält nicht lange durch",
        einmal: true,
        akte: "Du bist selbst alt und nicht mehr so kräftig – Herzdruckmassage strengt dich enorm an, nach kurzer Zeit kannst du kaum mehr.",
        kern: "Du versuchst es, aber du bist selbst alt und schwach – du sagst, dass du nicht weißt, wie lange du das schaffst.",
        sagt: "Ich versuch's … ich bin selber nicht mehr die Jüngste … eins, zwei, drei …",
      },
      bett: {
        name: "Patient liegt im Bett",
        einmal: true,
        geht: false,
        akte: "{Er} liegt im Bett (weiche Matratze).",
        kern: "{Er} liegt im Bett – bevor du drückst, fragst du, ob du {ihn} auf den Boden ziehen sollst (auf der Matratze gibt es nach).",
        sagt: "{Er} liegt im Bett – soll ich {ihn} auf den Boden runterziehen?",
      },
      angst: {
        name: "Anrufer traut sich zuerst nicht",
        einmal: true,
        geht: false,
        akte: "Du hast große Angst, etwas falsch zu machen – beim ersten Mal traust du dich nicht zu drücken, erst wenn die Leitstelle dich ermutigt.",
        kern: "Du traust dich zuerst nicht – du hast Angst, etwas falsch zu machen, und sagst das. Erst wenn die Leitstelle dich nochmal ermutigt, drückst du.",
        sagt: "Ich … ich trau mich nicht, ich mach sicher was falsch!",
      },
      festnetz: {
        name: "Festnetz-Telefon (kein Lautsprecher)",
        akte: "Du telefonierst vom Festnetz mit Kabel – Lautsprecher gibt es nicht; zum Drücken musst du den Hörer hinlegen und laut rufen.",
        kern: "Du hast nur ein Festnetz-Telefon mit Kabel: du legst den Hörer neben dich auf den Boden und rufst laut, damit die Leitstelle dich hört.",
        sagt: "Ich leg den Hörer hin, ich hab kein Handy – ich ruf ganz laut … eins, zwei, drei …",
      },
    },
  },
  fremdkoerper: {
    name: "Fremdkörper (Rückenschläge, Heimlich)",
    sagt: ["Okay, ich klopf {ihm} auf den Rücken … fest …", "Ja, ich mach … ich schlag zwischen die Schulterblätter …"],
    rueckfrage: ["Wie fest darf ich denn schlagen?", "Soll ich {ihm} nicht in den Mund greifen?"],
    abweichungen: {
      klein: {
        name: "Kleinkind – über den Unterarm legen",
        einmal: true,
        akte: "{Er} ist noch klein – du kannst {ihn} bäuchlings über deinen Unterarm bzw. dein Knie legen, Kopf nach unten.",
        kern: "Du legst {ihn} bäuchlings über deinen Unterarm, den Kopf tiefer, und klopfst zwischen die Schulterblätter.",
        sagt: "Ich hab {ihn} über meinem Arm, Kopf nach unten … ich klopf …",
      },
      kommt_raus: {
        name: "Fremdkörper kommt beim 2. Versuch heraus",
        einmal: true,
        abMal: 2,
        akte: "Nach ein paar kräftigen Schlägen kommt das Stück heraus.",
        kern: "Nach ein paar Schlägen kommt das Stück heraus – {er} hustet und schreit bzw. atmet wieder.",
        sagt: "Da! Es ist rausgekommen! {Er} hustet … {er} atmet wieder!",
      },
    },
  },
  seitenlage: {
    name: "Stabile Seitenlage",
    sagt: ["Okay, ich dreh {ihn} auf die Seite …", "Ja … so … {er} liegt jetzt auf der Seite."],
    rueckfrage: ["Auf welche Seite denn?", "Und den Kopf – wie soll der liegen?"],
    abweichungen: {
      zu_schwer: {
        name: "Patient zu schwer, Anrufer allein",
        akte: "{Er} ist sehr schwer – allein bringst du {ihn} kaum auf die Seite.",
        kern: "{Er} ist zu schwer – du schaffst es allein nicht, {ihn} auf die Seite zu drehen, und sagst das.",
        sagt: "Ich schaff das nicht, {er} ist zu schwer für mich allein!",
        geht: false,
      },
    },
  },
  oberkoerper_hoch: {
    name: "Oberkörper hoch lagern",
    sagt: ["Okay, ich setz {ihn} auf … so.", "Ja, {er} sitzt jetzt aufrecht."],
    abweichungen: {
      will_nicht: {
        name: "Patient will nicht anders sitzen",
        akte: "{Er} will sich nicht bewegen lassen und wehrt ab.",
        kern: "{Er} will nicht – {er} wehrt ab, wenn du {ihn} aufsetzen willst; du sagst das.",
        sagt: "{Er} will nicht, {er} sagt, so geht's am besten.",
      },
    },
  },
  beine_hoch: {
    name: "Beine hoch lagern",
    sagt: ["Okay, ich leg {ihm} die Beine hoch, auf einen Sessel.", "Ja, die Beine sind oben."],
    abweichungen: {},
  },
  druck_blutung: {
    name: "Blutung stillen (Druck)",
    sagt: ["Okay, ich drück ein Tuch drauf … fest.", "Ja, ich drück jetzt fest auf die Wunde."],
    rueckfrage: ["Soll ich das Tuch wegnehmen und schauen?", "Es ist schon ganz rot – soll ich ein neues nehmen?"],
    abweichungen: {
      kein_tuch: {
        name: "Kein sauberes Tuch da",
        akte: "Du hast kein sauberes Tuch bei der Hand.",
        kern: "Du hast kein sauberes Tuch – du nimmst, was da ist (T-Shirt, Schal, Geschirrtuch) und drückst damit fest.",
        sagt: "Ich hab kein Tuch … ich nimm mein T-Shirt, ich drück jetzt …",
      },
      durch: {
        name: "Blutet durch",
        einmal: true,
        abMal: 2,
        akte: "Die Wunde blutet stark – durch das erste Tuch geht das Blut durch.",
        kern: "Du drückst, aber das Blut kommt durchs Tuch durch – du sagst das erschrocken.",
        sagt: "Ich drück, aber es kommt durch! Das Tuch ist schon ganz voll!",
      },
    },
  },
  beruhigen: {
    name: "Beruhigen / langsam atmen",
    sagt: ["Okay … ich red mit {ihm} … ruhig, ganz ruhig.", "Ja, ich versuch, dass {er} langsam atmet."],
    abweichungen: {},
  },
  zucker: {
    name: "Zucker geben",
    sagt: ["Okay, ich geb {ihm} einen Saft … {er} trinkt.", "Ja, ich hol was Süßes … {er} schluckt."],
    rueckfrage: ["Reicht ein Saft, oder soll ich Zucker nehmen?"],
    abweichungen: {
      nichts_suesses: {
        name: "Nichts Süßes zu trinken da",
        akte: "Saft oder Cola habt ihr gerade keine im Haus.",
        kern: "Saft oder Cola habt ihr keine – du fragst, ob Zucker in Wasser auch geht, und machst das.",
        sagt: "Saft hab ich keinen … geht Zucker in Wasser? … Ich mach's.",
      },
    },
  },
  spray: {
    name: "Spray nehmen",
    sagt: ["Okay, {er} nimmt noch zwei Hübe.", "Ja, das Spray … zwei Hübe."],
    abweichungen: {},
  },
  geburt: {
    name: "Geburt",
    sagt: ["Okay, ich hol Handtücher … sie liegen bereit.", "Ja, Handtücher sind da."],
    rueckfrage: ["Was mach ich, wenn das Baby jetzt kommt?", "Muss ich die Nabelschnur durchschneiden?"],
    abweichungen: {
      kopf_sichtbar: {
        name: "Kopf schon sichtbar",
        einmal: true,
        akte: "Das Baby kommt schon – man sieht schon den Kopf.",
        kern: "Man sieht schon den Kopf – du sagst das aufgeregt und machst, was die Leitstelle sagt.",
        sagt: "Man sieht schon den Kopf! Was mach ich jetzt?",
      },
      schreit_nicht: {
        name: "Baby schreit nach der Geburt nicht gleich",
        einmal: true,
        akte: "Wenn das Baby da ist, schreit es nicht sofort – erst nach Abtrocknen und Rubbeln.",
        kern: "Das Baby ist da, aber es schreit nicht – erst als du es abtrocknest und den Rücken rubbelst, fängt es an zu schreien.",
        sagt: "Es ist da, aber es schreit nicht! … Ich rubbel … jetzt! Jetzt schreit es!",
      },
    },
  },
  nicht_bewegen: {
    name: "Nicht bewegen, zudecken",
    sagt: ["Okay, ich lass {ihn} liegen und deck {ihn} zu.", "Ja, {er} bleibt so liegen."],
    abweichungen: {
      will_aufstehen: {
        name: "Patient will aufstehen",
        akte: "{Er} will unbedingt aufstehen.",
        kern: "{Er} will unbedingt aufstehen – du hältst {ihn} zurück und sagst, dass {er} nicht folgt.",
        sagt: "{Er} will die ganze Zeit aufstehen, ich halt {ihn} eh zurück!",
      },
    },
  },
  absichern: {
    name: "Unfallstelle absichern",
    sagt: ["Okay, Warnblinker ist an, ich stell das Dreieck auf."],
    abweichungen: {},
  },
  tuer: {
    name: "Tür öffnen / einweisen",
    sagt: ["Okay, ich sperr unten auf.", "Ja, jemand geht runter zur Tür."],
    abweichungen: {},
  },
};

/** Liste der Abweichungen eines Typs (für den Fall-Editor) */
export function abweichungenVon(typ: AnleitungTyp): [string, string][] {
  return Object.entries(BAUSTEINE[typ]?.abweichungen ?? {}).map(([id, a]) => [id, a.name]);
}

/** Platzhalter füllen ({er} {Er} {ihm} {ihn} {sein}) */
export function fuellePerson(t: string, w: boolean): string {
  return t
    .replace(/\{Er\}/g, w ? "Sie" : "Er")
    .replace(/\{er\}/g, w ? "sie" : "er")
    .replace(/\{ihm\}/g, w ? "ihr" : "ihm")
    .replace(/\{ihn\}/g, w ? "sie" : "ihn")
    .replace(/\{sein\}/g, w ? "ihr" : "sein");
}

/** Abweichungen eines Typs, die in diesem Anruf gelten (aus dem Fall und aus der Lage) – [id, Abweichung] */
export function aktiveAbweichungen(typ: AnleitungTyp, fall: Partial<Record<AnleitungTyp, string[]>> | undefined, auto: Partial<Record<AnleitungTyp, string[]>>): [string, Abweichung][] {
  const ids = new Set([...(fall?.[typ] ?? []), ...(auto[typ] ?? [])]);
  const b = BAUSTEINE[typ];
  return [...ids].map((id) => [id, b?.abweichungen[id]] as [string, Abweichung | undefined]).filter((x): x is [string, Abweichung] => !!x[1]);
}

/** Text für die Fallakte der KI: was bei Anleitungen bei dir anders ist */
export function anleitungAkte(fall: Partial<Record<AnleitungTyp, string[]>> | undefined, auto: Partial<Record<AnleitungTyp, string[]>>, w: boolean): string[] {
  const out: string[] = [];
  for (const typ of Object.keys(BAUSTEINE) as AnleitungTyp[]) for (const [, a] of aktiveAbweichungen(typ, fall, auto)) out.push(fuellePerson(a.akte, w));
  return out;
}

/** Wechsel bei der Herzdruckmassage: fragt die Leitstelle nach Ablöse? */
export const ABLOESE = /(ablös|abwechs|wechseln sie|tauschen|übernehmen|übernimmt|jemand anderer drücken|lassen sie (jemand|ihren|ihre)|soll (ihr|ihre) \w+ weiter)/i;
/** Lautsprecher angesprochen? */
export const LAUTSPRECHER = /lautsprecher|auf laut|freisprech|handy (hin|neben|weg)legen|telefon (hin|neben|weg)legen/i;

/** Abweichungen, die sich aus der Lage ergeben (alt, allein, Bett, Kleinkind …) – zusätzlich zu denen des Falls */
export function autoAbweichungen(k: AnrufKontext): Partial<Record<AnleitungTyp, string[]>> {
  const out: Partial<Record<AnleitungTyp, string[]>> = {};
  const dazu = (t: AnleitungTyp, id: string) => (out[t] ??= []).push(id);
  const sz = k.szenario;
  const alter = k.patientAlter ?? 50;
  // Partner eines alten Menschen ist meist selbst alt
  if (k.anrufer.typ === "partner" && alter >= 75) dazu("reanimation", "alt");
  if (sz && /bett|im bett|auf dem bett/i.test(`${sz.stelle} ${(sz.geschehen ?? []).join(" ")}`)) dazu("reanimation", "bett");
  if (alter < 2) dazu("fremdkoerper", "klein");
  return out;
}

/** Wer ist noch da und kann helfen (ablösen, Tür öffnen)? */
export function helferDa(k: AnrufKontext): boolean {
  const d = k.anrufer.persona?.dabei ?? "";
  return !!d && !/allein|niemand/i.test(d);
}

