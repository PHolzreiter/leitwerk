// Konkrete Angaben statt Kategorien (Paul 16.11.2026): Der Anrufer zählt nicht die Antwortmöglichkeiten des Schemas auf
// („Nur Arme / Beine / Hände …“), sondern sagt, wo bzw. wie es ist („am Knöchel“, „vom Balkon im ersten Stock“,
// „das Handtuch ist schon ganz durchgeblutet“). Einordnen muss die Leitstelle selbst.
// Welche Stelle zu welcher Antwort gehört, richtet sich nach den Beschriftungen des geladenen Schemas.

import type { Frage } from "./schema";

/** Körperstelle: so sagt es der Anrufer, und Stichwörter, mit denen sie einer Antwort zugeordnet wird (genaueste zuerst) */
interface Stelle {
  am: string;
  nom: string;
  worte: string[];
  /** Wörter in der Fallgeschichte, die diese Stelle meinen */
  text: RegExp;
}

const STELLEN: Stelle[] = [
  { am: "an der Stirn", nom: "die Stirn", worte: ["Stirn", "Gesicht", "Kopf"], text: /\bstirn/i },
  { am: "am Hinterkopf", nom: "der Hinterkopf", worte: ["Hinterkopf", "Kopf"], text: /hinterkopf/i },
  { am: "am Kopf", nom: "der Kopf", worte: ["Kopf"], text: /\bkopf(?!schmerz|sprung|hörer|kissen)/i },
  { am: "im Gesicht", nom: "das Gesicht", worte: ["Gesicht", "Kopf"], text: /gesicht/i },
  { am: "an der Nase", nom: "die Nase", worte: ["Nase", "Gesicht", "Kopf"], text: /\bnase/i },
  { am: "am Kinn", nom: "das Kinn", worte: ["Kinn", "Gesicht", "Kopf"], text: /\bkinn/i },
  { am: "an der Augenbraue", nom: "die Augenbraue", worte: ["Augenbraue", "Gesicht", "Kopf"], text: /augenbraue/i },
  { am: "am Hals", nom: "der Hals", worte: ["Hals"], text: /\bhals(?!schmerz|kette)/i },
  { am: "an der Brust", nom: "die Brust", worte: ["Brust"], text: /\bbrust(?!schmerz)/i },
  { am: "an den Rippen", nom: "die Rippen", worte: ["Rippe", "Brust"], text: /rippe/i },
  { am: "am Bauch", nom: "der Bauch", worte: ["Bauch"], text: /\bbauch(?!schmerz|weh)/i },
  { am: "am Rücken", nom: "der Rücken", worte: ["Rücken"], text: /rücken(?!schmerz)/i },
  { am: "im Kreuz", nom: "das Kreuz", worte: ["Kreuz", "Rücken"], text: /\bkreuz\b/i },
  { am: "an der Hüfte", nom: "die Hüfte", worte: ["Hüfte", "Becken"], text: /hüfte/i },
  { am: "an der Leiste", nom: "die Leiste", worte: ["Leiste"], text: /leiste/i },
  { am: "am Oberschenkel", nom: "der Oberschenkel", worte: ["Oberschenkel", "Bein"], text: /oberschenkel/i },
  { am: "am Oberarm", nom: "der Oberarm", worte: ["Oberarm", "Arm"], text: /oberarm/i },
  { am: "am Ellbogen", nom: "der Ellbogen", worte: ["Ellbogen", "Arm"], text: /ellbogen|ellenbogen/i },
  { am: "am Unterarm", nom: "der Unterarm", worte: ["Unterarm", "Arm"], text: /unterarm/i },
  { am: "am Handgelenk", nom: "das Handgelenk", worte: ["Handgelenk", "Hand", "Hände", "Arm"], text: /handgelenk/i },
  { am: "an der Hand", nom: "die Hand", worte: ["Hand", "Hände", "Arm"], text: /\bhand(?!gelenk|y|tuch|tasche|lauf)/i },
  { am: "am Finger", nom: "der Finger", worte: ["Finger", "Hand", "Hände", "Arm"], text: /finger/i },
  { am: "am Knie", nom: "das Knie", worte: ["Knie", "Bein"], text: /\bknie/i },
  { am: "am Schienbein", nom: "das Schienbein", worte: ["Schienbein", "Unterschenkel", "Bein"], text: /schienbein/i },
  { am: "am Unterschenkel", nom: "der Unterschenkel", worte: ["Unterschenkel", "Bein"], text: /unterschenkel|wade/i },
  { am: "am Knöchel", nom: "der Knöchel", worte: ["Knöchel", "Fuß", "Füße", "Bein"], text: /knöchel|sprunggelenk/i },
  { am: "am Fuß", nom: "der Fuß", worte: ["Fuß", "Füße", "Bein"], text: /\bfuß|\bfuss/i },
  { am: "an der Zehe", nom: "die Zehe", worte: ["Zehe", "Fuß", "Füße", "Bein"], text: /zehe/i },
  { am: "an den Haaren", nom: "die Haare", worte: ["Haare"], text: /\bhaare/i },
  { am: "am ganzen Körper", nom: "der ganze Körper", worte: ["ganzer Körper", "Ganzer Körper"], text: /ganze[nr]? körper/i },
];

/** Fragen mit Körperstellen-Antworten */
const STELLEN_FRAGEN = new Set(["region", "wunde", "koerperteil"]);
const NICHT = new Set(["mehrere", "unbekannt", "keine", "nein"]);

/** einfacher, fester Zufall aus einem Text (eine Stelle bleibt im ganzen Gespräch gleich) */
function zahlAus(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** Welche Antwort des Schemas meint diese Stelle? (Beschriftungen, genaueste Wörter zuerst) */
function antwortFuer(f: Frage, st: Stelle): string | undefined {
  const opts = (f.optionen ?? []).filter((o) => !NICHT.has(String(o.wert)));
  for (const w of st.worte) {
    const re = new RegExp(`(^|[^\\p{L}])${w}`, "iu");
    const o = opts.find((x) => re.test(x.label));
    if (o) return String(o.wert);
  }
  return undefined;
}

export interface Zusammenhang {
  /** Fallgeschichte als Text (Hergang, Geschehen, Details) */
  text: string;
  /** fester Schlüssel für dieses Gespräch */
  schluessel: string;
  /** Patient weiblich */
  w: boolean;
  /** der Patient ruft selbst an */
  selbst?: boolean;
}

export interface Konkret {
  /** für die KI (Fakt in 3. Person bzw. „du“) */
  ki: string;
  /** fertiger Satz für Anrufer ohne KI */
  satz: string;
}

function stellenFuer(f: Frage, wert: string): Stelle[] {
  return STELLEN.filter((st) => antwortFuer(f, st) === wert);
}

/** Körperstelle für die Antwort `wert` (z. B. region = extremitaet → „am Knöchel“) – passend zur Fallgeschichte */
function stelleSagen(f: Frage, wert: string, z: Zusammenhang): string | null {
  const nom = f.id === "koerperteil";
  const sag = (st: Stelle) => (nom ? `eingeklemmt ist ${st.nom}` : st.am);
  const imText = STELLEN.filter((st) => st.text.test(z.text));
  if (wert === "mehrere") {
    // zwei Stellen aus verschiedenen Antworten
    const gruppen = new Map<string, Stelle[]>();
    for (const st of STELLEN) {
      const a = antwortFuer(f, st);
      if (a) gruppen.set(a, [...(gruppen.get(a) ?? []), st]);
    }
    const ausText = imText.filter((st) => antwortFuer(f, st));
    const erste = ausText[0] ?? [...gruppen.values()][zahlAus(z.schluessel) % gruppen.size]?.[0];
    if (!erste) return null;
    const a1 = antwortFuer(f, erste);
    const zweite = ausText.find((st) => antwortFuer(f, st) !== a1) ?? (() => {
      const rest = [...gruppen.entries()].filter(([a]) => a !== a1).flatMap(([, l]) => l);
      return rest[zahlAus(`${z.schluessel}|2`) % Math.max(1, rest.length)];
    })();
    return zweite ? `${erste.am} und ${zweite.am}` : erste.am;
  }
  const passt = stellenFuer(f, wert);
  if (!passt.length) return null;
  const ausText = imText.find((st) => passt.includes(st));
  if (ausText) return sag(ausText);
  // ohne Hinweis in der Geschichte: eine Stelle, die zur Antwort passt (nicht „ganzer Körper“, außer es gibt nur die)
  const auswahl = passt.filter((st) => !/ganze/.test(st.nom));
  const l = auswahl.length ? auswahl : passt;
  return sag(l[zahlAus(z.schluessel) % l.length]);
}

const auswahl = (l: string[], z: Zusammenhang, id: string) => l[zahlAus(`${z.schluessel}|${id}`) % l.length];

/** Fallhöhe: Woher, wenn die Geschichte es sagt – sonst etwas Passendes */
const HOEHE_WOHER = /leiter|dach|balkon|gerüst|baum|fenster|mauer|hochstand|heuboden|felsen|klettersteig|brücke|stock\b|stockwerk/i;
const HOEHE: Record<string, string[]> = {
  boden: ["{er} ist einfach umgefallen", "{er} ist gestolpert und hingefallen", "{er} ist vom Sessel gefallen", "{er} ist ausgerutscht und hingefallen"],
  treppe: ["{er} ist die Stiege hinuntergefallen, so zehn Stufen", "{er} ist die Treppe hinuntergestürzt, ein ganzes Stockwerk", "{er} ist ein paar Stufen hinuntergefallen"],
  gross: ["{er} ist vom Balkon im ersten Stock gefallen", "{er} ist von der Leiter gefallen, sicher drei, vier Meter", "{er} ist vom Gerüst gefallen, so fünf Meter", "{er} ist vom Heuboden gefallen"],
  extrem: ["{er} ist aus dem vierten Stock gefallen", "{er} ist vom Dach gefallen, das sind sicher zehn, zwölf Meter", "{er} ist von einem hohen Gerüst gestürzt, weit über zehn Meter"],
};
const HOEHE_SCHAETZUNG: Record<string, string> = {
  boden: "– nicht hoch, keinen Meter",
  treppe: "",
  gross: "– ungefähr drei bis fünf Meter",
  extrem: "– sicher mehr als zehn Meter",
};
/** Kapitel „Strom“: ist der Patient gestürzt? (gleiche Werte wie die Höhe, nur „nein“ statt „boden“) */
const STURZ: Record<string, string[]> = {
  nein: ["{er} ist nicht gestürzt bzw. nur umgefallen"],
  gross: ["{er} ist dabei von der Leiter gefallen, sicher drei, vier Meter", "{er} ist dabei vom Mast heruntergefallen, so fünf Meter"],
  extrem: ["{er} ist dabei vom Mast heruntergefallen, sicher über zehn Meter", "{er} ist dabei vom Dach gestürzt, weit über zehn Meter"],
};

const FLAECHE: Record<string, string[]> = {
  gross: ["der ganze Rücken ist verbrannt", "ein ganzes Bein ist verbrannt", "die ganze Brust und der Bauch sind verbrannt", "beide Arme und die Brust sind verbrannt"],
  mittel: ["der ganze Unterarm und die Hand sind verbrannt", "beide Hände sind verbrannt", "der halbe Oberschenkel ist verbrannt", "der ganze Arm ist verbrannt"],
  gering: ["nur eine kleine Stelle an der Hand, so groß wie eine Münze", "nur zwei Finger", "nur eine kleine Stelle am Unterarm", "nur der Handrücken, ein kleines Stück"],
  sonnenbrand: ["es ist ein Sonnenbrand, die Haut ist ganz rot"],
};
const BLUTUNG: Record<string, string[]> = {
  gefaehrlich: ["es spritzt richtig heraus, das hört nicht auf, auch wenn man draufdrückt", "es hört überhaupt nicht auf, es ist schon alles voller Blut"],
  stark: ["das Handtuch ist schon ganz durchgeblutet", "es läuft und läuft, wir haben schon drei Tücher durch", "es blutet stark, das tropft schon auf den Boden"],
  schwach: ["es blutet ein bisschen, wenn man draufdrückt, wird es weniger", "es tropft ein bisschen, mit einem Tuch geht es"],
  gering: ["es blutet fast nicht mehr", "es hat aufgehört zu bluten, nur ein bisschen sickert noch"],
};

function fuellenEr(t: string, z: Zusammenhang, ki: boolean): string {
  if (z.selbst) return t.replace(/\{er\} ist/g, ki ? "du bist" : "ich bin").replace(/\{er\}/g, ki ? "du" : "ich");
  return t.replace(/\{er\}/g, z.w ? "sie" : "er");
}
const gross = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;

/**
 * Was der Anrufer auf eine Kategorie-Frage sagt – konkret statt der Antwortmöglichkeit. null = keine konkrete Angabe
 * (dann gilt die normale Antwort).
 */
export function konkretSagen(f: Frage, wert: string, z: Zusammenhang): Konkret | null {
  if (wert === "unbekannt") return null;
  if (STELLEN_FRAGEN.has(f.id)) {
    const s = stelleSagen(f, wert, z);
    if (!s) return null;
    if (f.id === "koerperteil") return { ki: s, satz: gross(s.replace(/^eingeklemmt ist /, "")) };
    if (f.id === "wunde") return { ki: `die Wunde ist ${s}`, satz: gross(s) };
    const wer = z.selbst ? "du bist" : `${z.w ? "sie" : "er"} ist`;
    return { ki: `verletzt ${wer} ${s}`, satz: gross(s) };
  }
  if (f.id === "hoehe" && HOEHE[wert]) {
    if (HOEHE_WOHER.test(z.text)) {
      const sch = HOEHE_SCHAETZUNG[wert].replace(/^– /, "");
      return { ki: `${fuellenEr("{er} ist", z, true)} dort heruntergefallen, wo es in der Fallakte steht ${HOEHE_SCHAETZUNG[wert]}`.trim(), satz: sch ? gross(sch) : gross(fuellenEr(auswahl(HOEHE[wert], z, f.id), z, false)) };
    }
    const t = auswahl(HOEHE[wert], z, f.id);
    return { ki: fuellenEr(t, z, true), satz: gross(fuellenEr(t, z, false)) };
  }
  if (f.id === "sturz" && STURZ[wert]) {
    const t = auswahl(STURZ[wert], z, f.id);
    return { ki: fuellenEr(t, z, true), satz: gross(fuellenEr(t, z, false)) };
  }
  if (f.id === "flaeche" && FLAECHE[wert]) {
    const t = auswahl(FLAECHE[wert], z, f.id);
    return { ki: t, satz: gross(t) };
  }
  if ((f.id === "staerke" || f.id === "blutung") && BLUTUNG[wert]) {
    const t = auswahl(BLUTUNG[wert], z, f.id);
    return { ki: t, satz: gross(t) };
  }
  return null;
}

/** Fragen, bei denen der Anrufer konkret statt in Kategorien antwortet */
export const KONKRET_FRAGEN = new Set([...STELLEN_FRAGEN, "hoehe", "sturz", "flaeche", "staerke", "blutung"]);
