/**
 * Fallgeschichten: Ein Notruf beginnt mit einer stimmigen Geschichte (Ort, Hergang, Patient,
 * Vorerkrankungen, Zustand, Umgebung). Die Antworten auf die Schemafragen werden daraus
 * abgeleitet – und die KI bekommt die ganze Fallakte, damit sie jede Frage (auch aus einem
 * anderen Abfrageschema) menschlich und widerspruchsfrei beantworten kann.
 */
import { frageIndex, type Antworten, type Schema, type Wert } from "./schema";

// ------------------------------------------------------------------ Vorlagen

/** Wo es passiert */
export type OrtArt =
  | "wohnung"
  | "haus"
  | "garten"
  | "pflegeheim"
  | "strasse"
  | "geschaeft"
  | "lokal"
  | "arbeit"
  | "baustelle"
  | "schule"
  | "sport"
  | "freizeit"
  | "natur"
  | "wasser"
  | "auto"
  | "arzt"
  | "bahnhof";

/** Wo ein Fall vorkommt: nur an den genannten Orten, überall oder überall außer dort */
export type OrtModus = "nur" | "ueberall" | "ausser";

/** Wer anruft (wird mit Alter/Geschlecht zur passenden Rolle) */
export type AnruferTyp =
  | "partner"
  | "kind"
  | "eltern"
  | "nachbar"
  | "selbst"
  | "fern"
  | "pflege"
  | "arzt"
  | "ordi"
  | "lehrer"
  | "kollege"
  | "passant"
  | "verkauf"
  | "lenker"
  | "begleiter"
  | "trainer"
  | "bademeister"
  | "wirt"
  | "telemed"
  | "polizei"
  | "bergrettung";

export interface SzenarioVorlage {
  id: string;
  /** neutrales Thema (themen.ts), z. B. „sturz“ */
  thema: string;
  /** Häufigkeit innerhalb des Themas */
  gewicht?: number;
  alter: [number, number];
  geschlecht?: "m" | "w";
  orte: OrtArt[];
  /** „nur“ (Standard): nur an den Orten oben; „ueberall“: an allen passenden Orten; „ausser“: überall außer an den Orten oben */
  ortModus?: OrtModus;
  /** genaue Stelle, z. B. „im Badezimmer“; {ort} = Gemeinde */
  stelle: string[];
  /** nur bei Natur/unklarem Ort: so beschreibt der Anrufer, wo er ist ({ort} = Gemeinde in der Nähe) */
  wo?: string[];
  anrufer: AnruferTyp[];
  /**
   * Was wirklich passiert ist – Fakten (Abfolge, Umstände), aus denen die KI die Erzählung jedes Mal neu
   * formuliert. Bedingungen in eckigen Klammern: [variante=A], [ort=schule], [selbst=ja], [wissen=fremd], [anrufer=kind] …
   */
  geschehen?: string[];
  /** So könnte es klingen – Stilbeispiele für den ersten Satz (3. Person, Platzhalter siehe fuellen); nie wörtlich verwendet, wenn es Fakten gibt */
  hergang: string[];
  /** Hergang, wenn der Patient selbst anruft (Ich-Form); fehlt = Patient ruft nie selbst an */
  hergangIch?: string[];
  /** so lange ist es her (Minuten) */
  seitMin?: [number, number];
  /** feste Antworten (Fragen-IDs des Schemas); Liste = eine davon */
  fest?: Record<string, Wert | Wert[]>;
  /** Dinge, die der Anrufer sieht/weiß und auf Nachfrage erzählt */
  details?: string[];
  /** passende Vorerkrankungen (eine oder keine wird gewählt), zusätzlich zu den altersüblichen */
  vorerkrankungen?: string[];
  /** wie sich die Lage während des Gesprächs anfühlt (Stimmung, kleine Veränderungen) */
  verlauf?: string[];
  /** feste Umgebung (statt zufälligem Stock/Tür), z. B. „3. Stock, enges Stiegenhaus“ */
  umgebung?: string[];
  /** Jahreszeiten / Uhrzeiten, in denen es passt */
  jahreszeit?: ("fruehling" | "sommer" | "herbst" | "winter")[];
  stunden?: [number, number];
  /** nur bei Hitze (≥ 25 °C) bzw. Kälte (≤ 3 °C) */
  wetter?: "hitze" | "kaelte" | "glatt";
  /** weitere Antworten, die zur Geschichte gehören (auch Fragen anderer Kapitel), z. B. verwirrt: "ja" */
  extra?: Record<string, Wert>;
  /** kein (bekannter) Patient – z. B. Lichtsignale, Tier: so steht es statt der Patientenangaben in der Fallakte */
  ohnePatient?: string;
  /** Anrufer sieht den Patienten nicht (versperrte Tür, nur am Telefon): Befunde wie Hautfarbe, Atmung, Sprechen kennt er nicht */
  ohneSicht?: boolean;
  /** Anrufer hat den Patienten nur gefunden (nicht gesehen, wie es angefangen hat): „seit“ = seit dem Finden */
  gefunden?: boolean;
}

// ------------------------------------------------------------------ fertige Fallgeschichte

export interface Szenario {
  vorlage: string;
  thema: string;
  ortArt: OrtArt;
  /** z. B. „im Badezimmer, Wohnung im 2. Stock“ */
  stelle: string;
  /** kein bekannter Patient (Text für die Fallakte) */
  ohnePatient?: string;
  /** Anrufer sieht den Patienten nicht */
  ohneSicht?: boolean;
  /** Anrufer kennt den Ort nicht genau (Natur) – so beschreibt er ihn */
  wo?: string;
  hergang: string;
  hergangIch?: string;
  /** Fakten zum Hergang (gefüllt) */
  geschehen?: string[];
  /** Stilbeispiele (gefüllt) */
  stil?: string[];
  /** „vor etwa 10 Minuten“ */
  seit: string;
  seitMin: number;
  patient: {
    name: string;
    alter: number;
    geschlecht: "m" | "w";
    vorerkrankungen: string[];
    medikamente: string[];
    allergien: string;
    hausarzt: string;
    gewicht: string;
  };
  details: string[];
  umgebung: string[];
  verlauf: string[];
  /** Antworten auf weitere Schemafragen (auch aus anderen Kapiteln), passend zur Geschichte */
  zusatz: Antworten;
  gefunden?: boolean;
}

// ------------------------------------------------------------------ Werkzeuge

type Rnd = () => number;

function pick<T>(a: T[], rnd: Rnd): T {
  return a[Math.floor(rnd() * a.length)];
}

function zwischen(a: number, b: number, rnd: Rnd): number {
  return Math.round(a + rnd() * (b - a));
}

/** Platzhalter füllen: {er} {Er} {ihn} {ihm} {sein…} {P} {p} {ort} {name} {vorname} {a|b|c} */
export function fuellen(t: string, v: { w: boolean; bezug: string; ort: string; name: string; seite?: number }, rnd: Rnd): string {
  const pr: Record<string, [string, string]> = {
    er: ["er", "sie"],
    Er: ["Er", "Sie"],
    ihn: ["ihn", "sie"],
    ihm: ["ihm", "ihr"],
    sein: ["sein", "ihr"],
    seine: ["seine", "ihre"],
    seinen: ["seinen", "ihren"],
    seinem: ["seinem", "ihrem"],
    seiner: ["seiner", "ihrer"],
    seines: ["seines", "ihres"],
    Sein: ["Sein", "Ihr"],
    Seine: ["Seine", "Ihre"],
    der: ["der", "die"],
    Der: ["Der", "Die"],
    den: ["den", "die"],
    Unser: ["Unser", "Unsere"],
    einem: ["einem", "einer"],
    en: ["en", "in"],
    unser: ["unser", "unsere"],
    in: ["", "in"],
  };
  // Platzhalter wie {er} dürfen in Wahlmöglichkeiten stecken („{Seit heute ist {er} …|{Er} ist …}“)
  let s = t.replace(/\{(\w+)\}/g, "\u0001$1\u0002").replace(/\{([^{}]*\|[^{}]*)\}/g, (_, x: string) => {
    const teile = x.split("|");
    // rechts/links bleibt im ganzen Fall dieselbe Seite
    if (v.seite !== undefined && teile.length === 2 && /^recht/.test(teile[0]) && /^link/.test(teile[1])) return teile[v.seite];
    return pick(teile, rnd);
  });
  s = s.replace(/\u0001(\w+)\u0002/g, "{$1}");
  s = s.replace(/\{(\w+)\}/g, (m, k: string, pos: number, ganz: string) => {
    if (pr[k]) return pr[k][v.w ? 1 : 0];
    // {P} am Satzanfang groß, mitten im Satz klein („Dann ist meine Mutter …“)
    if (k === "P") return /(^|[.!?:„“"]\s*)$/.test(ganz.slice(0, pos)) ? v.bezug.charAt(0).toUpperCase() + v.bezug.slice(1) : v.bezug;
    if (k === "p") return v.bezug;
    if (k === "ort") return v.ort;
    if (k === "name") return v.name;
    if (k === "vorname") return v.name.split(" ")[0];
    return m;
  });
  return s;
}

// ------------------------------------------------------------------ Vorerkrankungen und Medikamente

interface Krankheit {
  name: string;
  medikamente: string[];
  /** setzt diese Antworten (z. B. diabetiker = ja) */
  fakten: Antworten;
  ab?: number;
}

const KRANKHEITEN: Krankheit[] = [
  { name: "hoher Blutdruck", medikamente: ["Blutdrucktabletten"], fakten: {}, ab: 40 },
  { name: "Diabetes", medikamente: ["Metformin", "Insulin"], fakten: { diabetiker: "ja" }, ab: 35 },
  { name: "Vorhofflimmern", medikamente: ["Eliquis (Blutverdünner)", "Xarelto (Blutverdünner)", "Marcoumar (Blutverdünner)"], fakten: { blutverduenner: "ja", herzleiden: "ja" }, ab: 55 },
  { name: "hatte vor ein paar Jahren einen Herzinfarkt, hat zwei Stents", medikamente: ["Aspirin und Blutdrucktabletten", "Aspirin und einen Cholesterinsenker", "Aspirin"], fakten: { herz_vg: "ja", herzleiden: "ja", blutverduenner: "ja" }, ab: 50 },
  { name: "Herzschwäche", medikamente: ["Entwässerungstabletten", "Herztabletten"], fakten: { herzleiden: "ja" }, ab: 65 },
  { name: "COPD (vom Rauchen)", medikamente: ["zwei Sprays zum Inhalieren"], fakten: { lungenerkrankung: "copd" }, ab: 50 },
  { name: "Asthma", medikamente: ["ein Asthmaspray"], fakten: { lungenerkrankung: "asthma" } },
  { name: "Epilepsie", medikamente: ["Keppra"], fakten: { epilepsie: "ja" } },
  { name: "hatte vor zwei Jahren einen leichten Schlaganfall", medikamente: ["Aspirin"], fakten: { vg_schlaganfall: "ja", blutverduenner: "ja" }, ab: 60 },
  { name: "Depressionen", medikamente: ["Antidepressiva"], fakten: { psych_vorerkrankung: "ja" }, ab: 18 },
  { name: "beginnende Demenz", medikamente: [], fakten: {}, ab: 75 },
  { name: "Osteoporose", medikamente: ["Kalziumtabletten"], fakten: {}, ab: 65 },
  { name: "Rheuma", medikamente: ["Schmerztabletten"], fakten: {}, ab: 50 },
  { name: "Schilddrüse", medikamente: ["Thyrex"], fakten: {}, ab: 30 },
  { name: "Nierenschwäche", medikamente: [], fakten: {}, ab: 65 },
  { name: "Krebs, ist in Behandlung", medikamente: ["Schmerzpflaster"], fakten: {}, ab: 55 },
  // nur aus Geschichten (nie zufällig)
  { name: "hatte vor ein paar Monaten eine Thrombose im Bein", medikamente: ["Xarelto (Blutverdünner)", "Eliquis (Blutverdünner)"], fakten: { blutverduenner: "ja" }, ab: 999 },
  { name: "Diabetes, spritzt Insulin", medikamente: ["Insulin"], fakten: { diabetiker: "ja" }, ab: 999 },
  { name: "Krebs im Endstadium", medikamente: ["Morphin über eine Schmerzpumpe"], fakten: {}, ab: 999 },
];

/** Vorerkrankungen passend zu Alter, Vorlage und bereits feststehenden Antworten */
function profil(alter: number, a: Antworten, vorlage: string[] | undefined, rnd: Rnd): { vor: string[]; med: string[]; fakten: Antworten } {
  const vor: string[] = [];
  const med: string[] = [];
  const fakten: Antworten = {};
  const nimm = (k: Krankheit) => {
    if (vor.includes(k.name)) return;
    // widerspricht einer festen Antwort (z. B. diabetiker = nein)?
    for (const [id, w] of Object.entries(k.fakten)) if (a[id] !== undefined && a[id] !== w && a[id] !== "unbekannt") return;
    vor.push(k.name);
    if (k.medikamente.length) {
      // „Aspirin und Blutdrucktabletten“ + „Blutdrucktabletten“ → nichts doppelt
      for (const m of pick(k.medikamente, rnd).split(/ und (?=[A-ZÄÖÜa-zäöü])/)) if (!med.some((x) => x.toLowerCase() === m.toLowerCase())) med.push(m.replace(/^einen /, ""));
    }
    Object.assign(fakten, k.fakten);
  };
  // was die Abfrage schon festgelegt hat, muss in der Geschichte vorkommen
  // was die Geschichte vorgibt („!…“), zuerst – dann ergänzt „nach“ nichts Doppeltes (z. B. zweimal Diabetes)
  for (const n of (vorlage ?? []).filter((x) => x.startsWith("!")).map((x) => x.slice(1))) {
    const k = KRANKHEITEN.find((x) => x.name === n);
    if (k) nimm(k);
    else if (!vor.includes(n)) vor.push(n);
  }
  const nach = (id: string, w: string, name: string) => {
    if (a[id] === w && fakten[id] !== w) {
      const k = KRANKHEITEN.find((x) => x.name === name);
      if (k) nimm(k);
    }
  };
  nach("diabetiker", "ja", "Diabetes");
  nach("epilepsie", "ja", "Epilepsie");
  nach("lungenerkrankung", "asthma", "Asthma");
  nach("lungenerkrankung", "copd", "COPD (vom Rauchen)");
  nach("herz_vg", "ja", "hatte vor ein paar Jahren einen Herzinfarkt, hat zwei Stents");
  nach("vg_schlaganfall", "ja", "hatte vor zwei Jahren einen leichten Schlaganfall");
  nach("psych_vorerkrankung", "ja", "Depressionen");
  if (a.herzleiden === "ja" && !vor.some((v) => /Herz|Vorhof/.test(v))) nimm(KRANKHEITEN[alter >= 55 ? 2 : 4]);
  if (a.blutverduenner === "ja" && !med.some((m) => /Blutverd|Aspirin/.test(m))) {
    // junge Menschen haben selten Vorhofflimmern – eher eine Thrombose
    nimm(alter >= 50 ? KRANKHEITEN[2] : KRANKHEITEN.find((x) => /Thrombose/.test(x.name))!);
    if (!med.some((m) => /Blutverd/.test(m))) med.push("Eliquis (Blutverdünner)");
  }
  if (a.lungenerkrankung === "andere") vor.push("eine Lungenerkrankung (Lungenfibrose)");
  // passend zur Geschichte: „!…“ kommt immer vor (die Geschichte erzählt davon), sonst eine mit 70 %
  for (const n of (vorlage ?? []).filter((x) => x.startsWith("!")).map((x) => x.slice(1))) {
    const k = KRANKHEITEN.find((x) => x.name === n);
    if (k) nimm(k);
    else if (!vor.includes(n)) vor.push(n);
  }
  const frei = (vorlage ?? []).filter((x) => !x.startsWith("!"));
  if (frei.length && rnd() < 0.7) {
    const n = pick(frei, rnd);
    const k = KRANKHEITEN.find((x) => x.name === n);
    if (k) nimm(k);
    else if (!vor.includes(n)) vor.push(n);
  }
  // altersübliche
  const anzahl = alter < 30 ? (rnd() < 0.15 ? 1 : 0) : alter < 55 ? (rnd() < 0.45 ? 1 : 0) : alter < 75 ? zwischen(0, 2, rnd) : zwischen(1, 3, rnd);
  for (let i = 0; i < 6 && vor.length < anzahl; i++) {
    const k = pick(KRANKHEITEN, rnd);
    if ((k.ab ?? 0) <= alter) nimm(k);
  }
  return { vor, med, fakten };
}

// ------------------------------------------------------------------ Szenario bauen

const SEIT_TEXT = (min: number): string =>
  min <= 3
    ? "gerade eben, vor ein, zwei Minuten"
    : min <= 20
      ? `vor etwa ${Math.round(min / 5) * 5 || 5} Minuten`
      : min < 60
        ? "vor ungefähr einer halben Stunde"
        : min < 120
          ? "vor etwa einer Stunde"
          : min < 360
            ? `vor ein paar Stunden (etwa ${Math.round(min / 60)})`
            : min < 1440
              ? "seit heute früh"
              : "seit gestern";

function umgebung(ort: OrtArt, alter: number, rnd: Rnd): string[] {
  const u: string[] = [];
  if (ort === "wohnung") {
    const stock = pick([0, 1, 1, 2, 2, 3, 4], rnd);
    u.push(stock === 0 ? "Erdgeschoss" : `${stock}. Stock${stock >= 2 ? (rnd() < 0.5 ? ", es gibt einen Lift" : ", kein Lift") : ""}`);
    u.push(`Tür ${pick(["5", "7", "12", "3", "14", "9"], rnd)}${rnd() < 0.4 ? `, Stiege ${pick(["1", "2", "3"], rnd)}` : ""}`);
    u.push(rnd() < 0.5 ? "die Haustür unten ist zugesperrt – jemand muss aufmachen" : "die Haustür unten ist offen");
  } else if (ort === "haus" || ort === "garten") {
    u.push(pick(["Einfamilienhaus", "Einfamilienhaus mit Garten", "Bauernhaus, Zufahrt über den Hof", "Reihenhaus"], rnd));
    if (rnd() < 0.35) u.push(pick(["Hausnummer ist schlecht zu sehen", "Einfahrt neben der Garage", "das Gartentor ist offen"], rnd));
  } else if (ort === "pflegeheim") u.push(`${pick(["1.", "2.", "3."], rnd)} Stock, Zimmer ${zwischen(101, 330, rnd)}, Eingang beim Haupteingang`);
  if ((ort === "wohnung" || ort === "haus" || ort === "garten") && rnd() < 0.2) u.push(pick(["ein Hund ist da – ich sperr ihn weg", "eine Katze läuft herum"], rnd));
  if (alter > 80 && (ort === "wohnung" || ort === "haus") && rnd() < 0.2) u.push("es gibt ein Notrufarmband, aber das hat nicht ausgelöst");
  return u;
}

/** „[fehlstellung=ja] Das Bein …“ → nur, wenn die Antwort passt; mehrere Bedingungen mit Komma, Alternativen mit | */
function passtBedingung(d: string, a: Antworten): boolean {
  const m = d.match(/^\[([^\]]*)\]/);
  if (!m) return true;
  return m[1].split(",").every((teil) => {
    const [id, werte] = teil.split("=").map((x) => x.trim());
    const nicht = id.endsWith("!");
    const ok = werte.split("|").includes(String(a[nicht ? id.slice(0, -1) : id]));
    return nicht ? !ok : ok;
  });
}

function ohneBedingung(d: string): string {
  return d.replace(/^\[[^\]]*\]\s*/, "");
}

/** Das sagt der Anrufer, wenn er nicht weiß, was eine Option bedeutet: „weiß ich nicht“ wird zu „unbekannt“ */
function wert(x: Wert | Wert[], rnd: Rnd): Wert {
  return Array.isArray(x) ? pick(x, rnd) : x;
}

/** Feste Antworten einer Vorlage auflösen (Listen → ein Wert); Alter/Geschlecht dazu */
export function vorlageFest(v: SzenarioVorlage, rnd: Rnd): Antworten {
  const a: Antworten = {};
  for (const [k, x] of Object.entries(v.fest ?? {})) a[k] = wert(x, rnd);
  if (a.alter === undefined) a.alter = zwischen(v.alter[0], v.alter[1], rnd);
  if (a.geschlecht === undefined) a.geschlecht = v.geschlecht ?? (rnd() < 0.5 ? "m" : "w");
  altersPlausibel(v, a, rnd);
  return a;
}

/**
 * Vorgeschichte, die zum Alter passen muss (eine 15-Jährige mit Blutverdünner wirkt unecht):
 * Steht in der Vorlage eine Auswahl („ja“ oder „nein“), wird die passende genommen – sonst rückt das Alter
 * (innerhalb der Spanne der Vorlage) in einen glaubwürdigen Bereich. Gilt für alle Fälle, auch selbst erstellte.
 */
const AB_ALTER: [string, string, number][] = [
  ["blutverduenner", "ja", 35],
  ["herz_vg", "ja", 35],
  ["herzleiden", "ja", 30],
  ["vg_schlaganfall", "ja", 40],
  ["vg_tia", "ja", 40],
  ["aneurysma", "ja", 45],
  ["lungenerkrankung", "copd", 40],
];
export function altersPlausibel(v: { alter: [number, number]; fest?: Record<string, Wert | Wert[]>; anrufer?: string[] }, a: Antworten, rnd: Rnd): void {
  if (typeof a.alter !== "number") return;
  for (const [id, w, ab] of AB_ALTER) {
    if (a[id] !== w || (a.alter as number) >= ab) continue;
    const moeglich = v.fest?.[id];
    const andere = Array.isArray(moeglich) ? moeglich.filter((x) => x !== w) : [];
    if (andere.length) a[id] = pick(andere, rnd);
    else if (v.alter[1] >= ab) a.alter = zwischen(Math.max(ab, v.alter[0]), v.alter[1], rnd);
  }
  // Nur die Polizei fordert einen UBG-Transport an – ruft sonst jemand an, lautet die Antwort „nein“
  if (a.ubg !== undefined && a.ubg !== "nein" && !(v.anrufer ?? []).some((x) => /polizei/.test(x))) a.ubg = "nein";
  // Schwanger nur im passenden Alter
  if (a.schwanger === "ja" && ((a.alter as number) < 14 || (a.alter as number) > 50) && v.alter[1] >= 16) a.alter = zwischen(Math.max(16, v.alter[0]), Math.min(45, v.alter[1]), rnd);
}

/** Vorlage für ein Thema wählen (Jahreszeit, Uhrzeit, Wetter beachten) */
export function vorlageWaehlen(
  vorlagen: SzenarioVorlage[],
  thema: string,
  ctx: { jahreszeit: string; stunde: number; temp: number; glatt: boolean },
  rnd: Rnd,
): SzenarioVorlage | null {
  const passend = vorlagen.filter((v) => {
    if (!thema || v.thema !== thema) return false;
    if (v.jahreszeit && !v.jahreszeit.includes(ctx.jahreszeit as never)) return false;
    if (v.stunden) {
      const [a, b] = v.stunden;
      const drin = a <= b ? ctx.stunde >= a && ctx.stunde < b : ctx.stunde >= a || ctx.stunde < b;
      if (!drin) return false;
    }
    if (v.wetter === "hitze" && ctx.temp < 25) return false;
    if (v.wetter === "kaelte" && ctx.temp > 3) return false;
    if (v.wetter === "glatt" && !ctx.glatt) return false;
    return true;
  });
  if (!passend.length) return null;
  const sum = passend.reduce((s, v) => s + (v.gewicht ?? 1), 0);
  let r = rnd() * sum;
  for (const v of passend) {
    r -= v.gewicht ?? 1;
    if (r <= 0) return v;
  }
  return passend[passend.length - 1];
}

/** Wie der Anrufer den Patienten nennt */
export function bezugFuer(anruferRolle: string, selbst: boolean, w: boolean, alter: number): string {
  const r = anruferRolle.toLowerCase();
  if (selbst) return "ich";
  if (/ehemann|ehefrau|lebensgef|partner/.test(r)) return w ? "meine Frau" : "mein Mann";
  if (/^mutter|^vater/.test(r)) return w ? "meine Tochter" : "mein Sohn";
  if (/tochter|sohn/.test(r)) return w ? "meine Mutter" : "mein Vater";
  if (/pflege/.test(r)) return w ? "eine Bewohnerin" : "ein Bewohner";
  if (/arzt|ärzt|ordination/.test(r)) return w ? "eine Patientin" : "ein Patient";
  if (/lehrer/.test(r)) return w ? "eine Schülerin" : "ein Schüler";
  if (/kolleg/.test(r)) return w ? "meine Kollegin" : "mein Kollege";
  if (/trainer/.test(r)) return w ? "eine Spielerin" : "ein Spieler";
  if (/freund|begleit/.test(r)) return w ? "meine Freundin" : "mein Freund";
  if (/nachbar/.test(r)) return w ? "meine Nachbarin" : "mein Nachbar";
  if (alter < 14) return w ? "ein Mädchen" : "ein Bub";
  if (alter >= 70) return w ? "eine ältere Frau" : "ein älterer Herr";
  return w ? "eine Frau" : "ein Mann";
}

/**
 * Fertige Fallgeschichte. `a` sind die Antworten aus dem Schema (passend zum Code),
 * `bezug`/`selbst` kommen vom gewählten Anrufer.
 */
export function szenarioBauen(
  v: SzenarioVorlage,
  a: Antworten,
  opt: { bezug: string; selbst: boolean; ort: string; name: string; ortArt?: OrtArt },
  rnd: Rnd,
): Szenario {
  const w = a.geschlecht === "w";
  const alter = typeof a.alter === "number" ? a.alter : zwischen(v.alter[0], v.alter[1], rnd);
  const seite = rnd() < 0.5 ? 0 : 1;
  const f = (t: string) => fuellen(t, { w, bezug: opt.bezug, ort: opt.ort, name: opt.name, seite }, rnd);
  // Fakten und Details stehen in der 3. Person – ruft der Patient selbst an, heißt {P} dort „er“/„sie“
  const f3 = opt.selbst ? (t: string) => fuellen(t, { w, bezug: w ? "sie" : "er", ort: opt.ort, name: opt.name, seite }, rnd) : f;
  const ortArt = opt.ortArt ?? (v.ortModus && v.ortModus !== "nur" ? "wohnung" : pick(v.orte, rnd));
  // Zeit passend zu den Antworten (liegt am Boden < 1 h, > 6 h her, < 4,5 h …)
  let [smin, smax] = v.seitMin ?? [3, 20];
  const eng = (a2: number, b2: number) => {
    const n0 = Math.max(smin, a2);
    const n1 = Math.min(smax, b2);
    [smin, smax] = n0 <= n1 ? [n0, n1] : [a2, b2];
  };
  if (a.umstand === "boden_1") eng(5, 55);
  if (a.umstand === "boden_2") eng(60, 120);
  if (a.umstand === "boden_3") eng(130, 400);
  if (a.aelter6h === "nein") eng(0, 350);
  if (a.aelter6h === "ja") eng(400, 2000);
  if (a.seit === "unter") eng(0, 260);
  if (a.seit === "ueber") eng(280, 1500);
  const seitMin = zwischen(smin, smax, rnd);
  const pr = profil(alter, a, v.vorerkrankungen, rnd);
  const zusatz: Antworten = { ...pr.fakten, ...(v.extra ?? {}) };
  const setze = (id: string, x: Wert) => {
    if (a[id] === undefined && zusatz[id] === undefined) zusatz[id] = x;
  };
  // Was die Geschichte schon sagt, gilt auch für die Fakten (sonst „ganz blass“ in der Geschichte, „Farbe normal“ in den Fakten)
  const alleTexte = [...(v.geschehen ?? []), ...(v.details ?? [])]
    .filter((t) => passtBedingung(t, { ...a, variante: a.variante ?? "" }))
    .map((t) => ohneBedingung(t).toLowerCase())
    .join(" ");
  if (/\b(blass|grau im gesicht|ganz grau|bläulich|blau (im gesicht|an den lippen|anlaufen)|wird blau|ganz blau)/.test(alleTexte)) setze("hautfarbe", "ja");
  else if (/rot im gesicht|rot ist [^.]{0,8}im gesicht|hochrot/.test(alleTexte)) setze("hautfarbe", "nein");
  if (/(klatschnass|nass geschwitzt|schwitzt (stark|total|so)|schweißnass|kalter schweiß|kaltschweiß|verschwitzt)/.test(alleTexte)) setze("kaltschweiss", "ja");
  // Anrufer sieht den Patienten nicht: Befunde bleiben offen (keine Zeile in den Fakten)
  const sicht = !v.ohneSicht;
  // was jeder Anrufer beantworten kann, auch wenn das eigene Kapitel nicht danach fragt
  setze("aelter6h", seitMin > 360 ? "ja" : "nein");
  setze("seit", seitMin > 270 ? "ueber" : "unter");
  for (const id of ["diabetiker", "epilepsie", "herz_vg", "herzleiden", "blutverduenner", "vg_schlaganfall", "vg_tia", "psych_vorerkrankung", "aneurysma", "bluter", "kokain"]) setze(id, "nein");
  setze("lungenerkrankung", "nein");
  // schwanger nur, wenn die Geschichte davon handelt (sonst verwirrt es nur)
  setze("schwanger", w && /schwanger|geburt/.test(v.thema) ? "ja" : "nein");
  const schlimm = a.bw === "nein" || a.at === "keine" || a.at === "agonal";
  // wer gerade bewusstlos ist: „war kurz weg“, „ist im Kopf klar“, „redet ganze Sätze“ passen nicht
  const weg = a.bw === "nein";
  if (!weg && sicht) setze("ohnmacht", schlimm ? "ja" : "nein");
  if (!weg && sicht) setze("verwirrt", a.bw === "getruebt" ? "ja" : "nein");
  setze("gewalt", "nein");
  setze("gewalttaetig", "nein");
  setze("aggressiv", "nein");
  setze("waffen", "nein");
  setze("mehrere_verletzte", a.anzahl_patienten === "n" ? "ja" : "nein");
  // sehr schwer nur bei Erwachsenen
  setze("schwer_pat", alter >= 16 && rnd() < 0.08 ? "ja" : "nein");
  if (sicht) {
    setze("hautfarbe", schlimm ? "ja" : "nein");
    setze("kaltschweiss", schlimm ? "ja" : "nein");
    // kleine Kinder reden ohnehin nicht in Sätzen
    if (!weg && a.bw !== "getruebt" && alter >= 4) setze("sprachschw", a.at === "abnorm" ? "ja" : "nein");
  }
  // Pflege und Ärzte fordern meist an: Transportart und Dringlichkeit wissen sie
  if (a.wissen === "profi") {
    const stabil = (a.bw === undefined || a.bw === "ja") && (a.at === undefined || a.at === "normal");
    setze("anforderer", "normal");
    setze("grund", a.bw === "getruebt" || a.bw === "nein" ? "bewusstsein" : a.at === "abnorm" ? "atmung" : "transport");
    setze("dringlichkeit", stabil ? "sofort" : "geraete");
    setze("transportart", !stabil || alter >= 80 ? "liegend" : "sitzend");
  }
  const traumatisch = ["sturz", "verkehrsunfall", "verletzung", "tierbiss", "gewalt", "stich_schuss", "eingeklemmt", "blutung", "brand", "strom", "wasser", "auge", "alpin"].includes(v.thema);
  if (!traumatisch && sicht) {
    setze("verletzt", "nein");
    setze("blutung_stark", "nein");
    setze("fehlstellung", "nein");
  }
  // Texte mit [bedingung] nur, wenn sie zu den Antworten (und Ort, Anrufer) passen
  const alle: Antworten = { ...zusatz, ...a, ort: ortArt, selbst: opt.selbst ? "ja" : "nein" };
  const passend = (l: string[]) => {
    const ok = l.filter((t) => passtBedingung(t, alle));
    return pick(ok.length ? ok : l, rnd).replace(/^\[[^\]]*\]\s*/, "");
  };
  const gewicht = zusatz.schwer_pat === "ja" || a.schwer_pat === "ja" ? "sehr schwer, deutlich über 120 kg" : alter < 14 ? "normal für das Alter" : pick(["normal", "eher schlank", "ein bisschen kräftiger"], rnd);
  const arztOrt = /^\d+$/.test(opt.ort.trim()) || !opt.ort.trim() ? "im Ort" : `in ${opt.ort}`;
  return {
    vorlage: v.id,
    thema: v.thema,
    ortArt,
    stelle: f(passend(v.stelle.length ? v.stelle : [""])),
    wo: v.wo?.length ? f(pick(v.wo, rnd)) : undefined,
    hergang: (opt.selbst ? ichFix : (t: string) => t)(f(passend(v.hergang.length ? v.hergang : v.geschehen?.length ? [v.geschehen[0]] : [""]))),
    hergangIch: opt.selbst && v.hergangIch?.length ? f(passend(v.hergangIch)) : undefined,
    geschehen: v.geschehen?.length ? v.geschehen.filter((d) => passtBedingung(d, alle)).map((d) => f3(ohneBedingung(d))) : undefined,
    stil: (opt.selbst && v.hergangIch?.length ? v.hergangIch : v.hergang).filter((d) => d.trim() && passtBedingung(d, alle)).map((d) => f(ohneBedingung(d))),
    seit: SEIT_TEXT(seitMin),
    seitMin,
    patient: {
      name: opt.name,
      alter,
      geschlecht: w ? "w" : "m",
      vorerkrankungen: pr.vor,
      medikamente: pr.med,
      allergien: rnd() < 0.15 ? pick(["Penicillin", "Pflaster", "Nüsse", "Wespenstiche", "Kontrastmittel"], rnd) : "keine bekannt",
      hausarzt: `${pick(["Dr. Huber", "Dr. Leitner", "Dr. Wagner", "Dr. Pichler", "Dr. Steiner", "Dr. Bauer"], rnd)} ${arztOrt}`,
      gewicht,
    },
    // alle Details – wichtige Befunde dürfen nicht zufällig fehlen (sonst sagt der Anrufer „nix steht ab“)
    details: (v.details ?? []).filter((d) => passtBedingung(d, alle)).map((d) => f3(ohneBedingung(d))),
    umgebung: v.umgebung?.length ? v.umgebung.filter((d) => passtBedingung(d, alle)).map((d) => f(ohneBedingung(d))) : umgebung(ortArt, alter, rnd),
    verlauf: (v.verlauf ?? []).filter((d) => passtBedingung(d, alle)).map((d) => f(ohneBedingung(d))),
    zusatz,
    ohnePatient: v.ohnePatient ? f(v.ohnePatient) : undefined,
    ohneSicht: v.ohneSicht || undefined,
    gefunden: v.gefunden || undefined,
  };
}

// ------------------------------------------------------------------ Fakten in Alltagssprache (für die KI)

/** Antwort → Satz, so wie es ein Laie weiß. {er} usw. werden gefüllt. */
const FAKT: Record<string, Record<string, string>> = {
  ohnmacht: { ja: "{Er} war kurz weg bzw. fast ohnmächtig", nein: "{{Er} war nicht bewusstlos, auch nicht kurz|weggekippt ist {er} nicht|ohnmächtig war {er} nicht}" },
  verletzt: { ja: "{Er} hat sich verletzt", nein: "{eine Verletzung siehst du keine|verletzt ist {er} nicht, soweit du siehst|du siehst keine Wunde}" },
  blutung_stark: { ja: "es blutet stark, die Tücher sind schnell durch", nein: "{stark blutet nichts|eine starke Blutung siehst du keine}" },
  fehlstellung: { ja: "ein Arm/Bein steht komisch ab bzw. ist sichtbar verformt", nein: "{nichts steht komisch ab|Arme und Beine schauen normal aus}" },
  aelter6h: { ja: "das Ganze ist schon länger als sechs Stunden her", nein: "es ist weniger als sechs Stunden her" },
  seit: { unter: "die Beschwerden gibt es seit weniger als 4 Stunden", ueber: "die Beschwerden gibt es schon länger als 4–5 Stunden" },
  diabetiker: { ja: "{Er} ist zuckerkrank (Diabetes)", nein: "{Er} hat keinen Zucker" },
  epilepsie: { ja: "{Er} hat Epilepsie", nein: "Epilepsie hat {er} keine" },
  herz_vg: { ja: "{Er} hatte schon einmal einen Herzinfarkt", nein: "einen Herzinfarkt hatte {er} noch nie" },
  herzleiden: { ja: "{Er} hat es mit dem Herzen", nein: "mit dem Herzen hat {er} nichts" },
  blutverduenner: { ja: "{Er} nimmt Blutverdünner", nein: "Blutverdünner nimmt {er} keine" },
  vg_schlaganfall: { ja: "{Er} hatte schon einmal einen Schlaganfall", nein: "einen Schlaganfall hatte {er} noch nie" },
  vg_tia: { ja: "{Er} hatte schon einmal so einen kurzen Schlaganfall, der wieder weggegangen ist", nein: "so etwas hatte {er} noch nie" },
  psych_vorerkrankung: { ja: "{Er} ist wegen Depressionen in Behandlung", nein: "psychisch ist nichts bekannt" },
  lungenerkrankung: { asthma: "{Er} hat Asthma", copd: "{Er} hat COPD, eine Raucherlunge", andere: "{Er} hat eine Lungenkrankheit", nein: "mit der Lunge hat {er} nichts" },
  schwanger: { ja: "{Er} ist schwanger", nein: "schwanger ist sie nicht" },
  hautfarbe: { ja: "{{Er} ist ganz blass im Gesicht|{Er} schaut ganz blass aus|{Er} ist käsweiß}", nein: "{die Gesichtsfarbe ist normal|blass ist {er} nicht|{er} hat eine normale Farbe}" },
  kaltschweiss: { ja: "{{Er} ist kalt und schweißig|die Haut ist kalt und feucht|{er} ist ganz verschwitzt}", nein: "{verschwitzt ist {er} nicht|die Haut ist normal, nicht feucht|{Er} schwitzt nicht}" },
  sprachschw: { ja: "{Er} kann vor lauter Schnaufen nur einzelne Wörter sagen", nein: "{reden kann {er} normal|{er} redet in ganzen Sätzen|beim Reden muss {er} nicht nach Luft schnappen}" },
  verwirrt: { ja: "{Er} ist durcheinander und weiß nicht recht, wo {er} ist", nein: "{durcheinander ist {er} nicht|{er} weiß, wo {er} ist}" },
  kokain: { ja: "{Er} hat Kokain genommen", nein: "Drogen nimmt {er} keine" },
  aneurysma: { ja: "{Er} hat ein Aneurysma an der Bauchschlagader", nein: "von einem Aneurysma weißt du nichts" },
  bluter: { ja: "{Er} ist Bluter (eine Krankheit, bei der das Blut schlecht gerinnt)", nein: "eine Blutgerinnungskrankheit hat {er} nicht" },
  transportart: { liegend: "{Er} kann nicht sitzen – {er} muss liegend transportiert werden", sitzend: "{Er} kann sitzen, aber nicht weit gehen", gehend: "{Er} kann selbst gehen", rollstuhl: "{Er} sitzt im eigenen Rollstuhl" },
  dringlichkeit: { ohne: "es ist nicht eilig", sofort: "es sollte bald jemand kommen, {er} ist aber stabil", geraete: "es ist dringend – {er} braucht Sauerstoff bzw. Überwachung" },
  schwer_pat: { ja: "{Er} ist sehr schwer, deutlich über 120 Kilo", nein: "zum Tragen ist {er} nicht übermäßig schwer" },
  gewalt: { ja: "{Er} ist gewalttätig", nein: "{Er} ist nicht gewalttätig" },
  gewalttaetig: { ja: "{Er} ist aggressiv und schlägt um sich", nein: "{Er} ist nicht aggressiv" },
  aggressiv: { ja: "{Er} ist aggressiv", nein: "{Er} ist nicht aggressiv" },
  waffen: { ja: "es sind Waffen in der Nähe", nein: "Waffen sind keine da" },
  mehrere_verletzte: { ja: "es sind mehrere Personen verletzt", nein: "es ist nur eine Person betroffen" },
  // Protokoll-Antworten in Alltagssprache (sonst liest die KI die Stichworte des Protokolls vor)
  region: {
    extremitaet: "verletzt ist nur eine Hand, ein Finger, ein Arm oder ein Bein – genau dort, wo es in der Fallakte steht",
    kopf: "verletzt ist {er} am Kopf bzw. im Gesicht",
    hals_brust: "verletzt ist {er} am Hals bzw. an der Brust",
    rumpf: "verletzt ist {er} am Bauch, Rücken, an der Hüfte oder am Oberschenkel – genau dort, wo es in der Fallakte steht",
    mehrere: "{er} ist an mehreren Stellen verletzt",
  },
  staerke: { gefaehrlich: "es spritzt bzw. hört trotz Draufdrücken nicht auf", stark: "es blutet stark, die Tücher sind schnell durch", schwach: "es blutet, aber mit Draufdrücken geht es", gering: "es blutet kaum noch" },
  hoehe: { boden: "{er} ist ebenerdig hingefallen, nicht von irgendwo herunter", treppe: "{er} ist die Treppe hinuntergefallen" },
  umstand: { keine: "sonst gibt es nichts Besonderes", wetter: "{er} liegt draußen in der Kälte bzw. im Nassen", boden_1: "{er} liegt noch am Boden", boden_2: "{er} liegt noch am Boden", boden_3: "{er} liegt noch am Boden", oeffentlich: "{er} liegt an einem öffentlichen Platz" },
  atemweg: { frei: "{er} kriegt wieder normal Luft", teilweise: "{er} hustet und beim Atmen pfeift es, ein bisschen Luft kriegt {er} aber", komplett: "{er} kann weder husten noch atmen noch einen Laut machen" },
  situation: { fruchtwasser: "das Fruchtwasser ist abgegangen, Wehen gibt es noch keine", wehen: "sie hat Wehen", unmittelbar: "die Wehen kommen ganz knapp hintereinander und sie muss schon pressen", kopf: "man sieht schon den Kopf", geboren: "das Baby ist schon da" },
  woran: { suessigkeit: "es war ein Zuckerl", essen: "es war ein Stück Essen", fluessigkeit: "es war etwas zum Trinken", objekt: "es war ein kleiner Gegenstand bzw. ein Spielzeugteil" },
  ursache: { trauma: "es kommt von einer Verletzung (siehe Fallakte)" },
  lage: {
    eingeklemmt: "{er} ist eingeklemmt und kommt allein nicht heraus",
    frei: "{er} war eingeklemmt, ist jetzt aber frei",
    unter_fahrzeug: "{er} liegt unter einem Fahrzeug eingeklemmt",
    eingeschlossen: "{er} ist eingeschlossen, aber nicht in Gefahr",
    kein_suizid: "dass {er} sich etwas antun will, hat {er} nicht gesagt",
    gedanken: "{er} hat gesagt bzw. geschrieben, dass {er} nicht mehr mag – etwas Konkretes hat {er} aber nicht angekündigt",
    absicht: "{er} hat geschrieben bzw. gesagt, dass {er} sich etwas antun will",
  },
  hauptbeschwerde: { fieber: "vor allem geht es um das Fieber", schwaeche: "vor allem ist {er} so schwach", schwindel: "vor allem ist {ihm} schwindlig" },
};

export function faktSaetze(z: Antworten, w: boolean): string[] {
  const out: string[] = [];
  for (const [id, x] of Object.entries(z)) {
    if (id === "schwanger" && !w) continue;
    const t = FAKT[id]?.[String(x)];
    if (t) {
      const satz = fuellen(t, { w, bezug: "", ort: "", name: "" }, Math.random);
      if (!out.includes(satz)) out.push(satz);
    }
  }
  return out;
}

/** Antworten, die selbstverständlich „nein“ sind (stehen nicht extra in der Anweisung – die Vorerkrankungen sagen es schon) */
export const SELBSTVERSTAENDLICH = new Set(["diabetiker", "epilepsie", "herz_vg", "herzleiden", "blutverduenner", "vg_schlaganfall", "vg_tia", "psych_vorerkrankung", "aneurysma", "bluter", "kokain", "lungenerkrankung", "gewalt", "gewalttaetig", "aggressiv", "waffen"]);

/** Fallakte für die KI (Geheimwissen der Anruferin/des Anrufers) */
export function fallakte(sz: Szenario, opt: { selbst: boolean; bezug: string; quelle?: "vorort" | "polizei" | "telefon"; fremd?: boolean; hausarztIch?: boolean; vorgeschichte?: "ja" | "teilweise" | "nein"; name?: string; kannAntworten?: boolean }): string {
  const p = sz.patient;
  const w = p.geschlecht === "w";
  const q = opt.quelle ?? "vorort";
  const wer = opt.selbst ? `Du selbst${opt.name ? ` (${opt.name})` : ""}` : `${opt.bezug.charAt(0).toUpperCase()}${opt.bezug.slice(1)} (${p.name})`;
  const z: string[] = [];
  const erlebt = q === "polizei" ? "so hat es dir die Streife vor Ort gemeldet" : q === "telefon" ? "das hat dir der Patient bzw. die Angehörigen gerade am Telefon geschildert – du bist nicht vor Ort" : "das hast du erlebt";
  if (sz.geschehen?.length) {
    // keine fertigen Beispielsätze mehr – die KI hat sie fast immer wörtlich übernommen
    z.push(`WAS WIRKLICH PASSIERT IST (${erlebt}) – Fakten. Erzähl es in DEINEN Worten, so wie du es erlebt hast, nie wörtlich ablesen und nicht alles auf einmal:\n${sz.geschehen.map((g) => `- ${g}`).join("\n")}`);
  } else z.push(`WAS PASSIERT IST (${erlebt}): ${opt.selbst && sz.hergangIch ? sz.hergangIch : sz.hergang} ${/^seit/.test(sz.seit) ? `Das geht so ${sz.seit}` : `Das war ${sz.seit}`}.`);
  z.push(`WO: ${sz.stelle}${sz.umgebung.length ? ` (${sz.umgebung.join("; ")})` : ""}.`);
  const titel = opt.selbst
    ? "WAS DU SPÜRST UND WEISST (hier über dich in der dritten Person notiert – du sagst es natürlich in Ich-Form)"
    : q === "polizei"
      ? "WAS DIE STREIFE SIEHT UND WEISS"
      : q === "telefon"
        ? "WAS DU AUS DEM TELEFONAT WEISST"
        : "WAS DU SIEHST UND WEISST";
  if (sz.details.length) z.push(`${titel} (erzählst du, wenn es passt oder gefragt wird): ${sz.details.join(" ")}`);
  const vorErk = `Vorerkrankungen: ${p.vorerkrankungen.length ? p.vorerkrankungen.join(", ") : "keine bekannt"}. Medikamente: ${p.medikamente.length ? p.medikamente.join(", ") : "keine regelmäßigen"}. Allergien: ${p.allergien}.`;
  if (sz.ohnePatient) z.push(`BETROFFENE: ${sz.ohnePatient}`);
  else if (opt.fremd && opt.kannAntworten === false)
    z.push(`ÜBER ${w ? "SIE" : "IHN"}: Du kennst ${w ? "sie" : "ihn"} nicht, und ${w ? "sie" : "er"} kann dir nichts sagen – Name, Alter, Krankheiten und Medikamente weißt du nicht (das Alter kannst du nur schätzen). ${w ? "Weiblich" : "Männlich"}.`);
  else if (opt.fremd)
    z.push(
      `ÜBER ${w ? "SIE" : "IHN"} (du kennst ${w ? "sie" : "ihn"} nicht; den Namen und das, was hier steht, weißt du nur, weil ${q === "polizei" ? "die Streife" : "du"} ${w ? "sie" : "ihn"} gefragt ${q === "polizei" ? "hat" : "hast"} – fragt die Leitstelle danach, ${q === "polizei" ? "gibst du es von der Streife weiter" : "fragst du kurz nach und sagst es dann"}): ${p.name}, ${w ? "weiblich" : "männlich"}. ${vorErk} (Das erfährst du nur, wenn ${w ? "sie" : "er"} antworten kann.) Den Hausarzt kennst du nicht.`,
    );
  else if (opt.vorgeschichte && opt.vorgeschichte !== "ja" && !opt.selbst)
    z.push(
      `ÜBER ${w ? "SIE" : "IHN"}: ${wer}, ${w ? "weiblich" : "männlich"}. ${
        opt.vorgeschichte === "teilweise" && p.vorerkrankungen.length ? `Du weißt nur, dass ${w ? "sie" : "er"} ${p.vorerkrankungen[0]} hat – sonst kennst du keine Krankheiten, Medikamente oder den Hausarzt.` : "Krankheiten, Medikamente und Hausarzt kennst du nicht – außer dem, was oben ausdrücklich steht."
      }`,
    );
  else z.push(`ÜBER ${opt.selbst ? "DICH" : w ? "SIE" : "IHN"}: ${wer}, ${p.alter} ${p.alter === 1 ? "Jahr" : "Jahre"}, ${w ? "weiblich" : "männlich"}, Gewicht ${p.gewicht}. ${vorErk} Hausarzt: ${opt.hausarztIch ? "du selbst" : p.hausarzt}.`);
  void w;
  if (sz.ohneSicht) z.push(`WICHTIG: Du siehst ${w ? "sie" : "ihn"} NICHT. Wie ${w ? "sie" : "er"} ausschaut, ob ${w ? "sie" : "er"} atmet oder reagiert, weißt du nicht – das sagst du ehrlich.`);
  if (sz.verlauf.length) z.push(`STIMMUNG UND VERLAUF IM GESPRÄCH: ${sz.verlauf.join(" ")}`);
  return z.join("\n");
}

/** Stimmung des Anrufers aus der Geschichte („Du bist panisch …“) – damit Stimme, Beispiele und Verlauf zusammenpassen */
export function stimmungAusVerlauf(verlauf: string[]): "ruhig" | "gefasst" | "aufgeregt" | "panisch" | null {
  const t = verlauf.join(" ").toLowerCase();
  if (/panisch|schreist|weinst|verängstigt/.test(t)) return "panisch";
  if (/sehr aufgeregt|geschockt|aufgewühlt|aufgeregt/.test(t)) return "aufgeregt";
  if (/nervös|besorgt|erschrocken|traurig/.test(t)) return "gefasst";
  if (/ruhig|sachlich|routiniert/.test(t)) return "ruhig";
  return null;
}

/** Was man nur beim Patienten sieht – wer ihn nicht sieht (vor der Tür), kann es nicht wissen */
const SICHT_FELDER = ["verwirrt", "hautfarbe", "kaltschweiss", "sprachschw", "blutung_stark", "blutung", "fehlstellung", "verletzt"];
/** Bei Fällen „sieht ihn nicht“ sind solche Befunde „unbekannt“ (wenn die Frage das als Antwort kennt) */
export function sichtUnbekannt(schema: Schema, kapitel: string, ohneSicht: boolean | undefined, a: Antworten): void {
  if (!ohneSicht) return;
  const idx = frageIndex(schema, kapitel);
  for (const id of SICHT_FELDER) {
    if (a[id] === undefined || a[id] === "unbekannt") continue;
    if ((idx.get(id)?.optionen ?? []).some((o) => String(o.wert) === "unbekannt")) a[id] = "unbekannt";
  }
}

/** „Ich hat sich geschnitten“ → „Ich hab mich geschnitten“ (Hergang in 3. Person, aber der Patient ruft selbst an) */
export function ichFix(t: string): string {
  const fest: Record<string, string> = { hat: "hab", ist: "bin", kann: "kann", muss: "muss", will: "will", weiß: "weiß", war: "war", hatte: "hatte", darf: "darf", soll: "soll", mag: "mag", wird: "werd", nimmt: "nehm", isst: "ess", sieht: "seh", spricht: "sprech", liegt: "lieg", kriegt: "krieg" };
  return t
    .replace(/\bIch ([a-zäöüß]+)\b/g, (m, v: string) => (fest[v] ? `Ich ${fest[v]}` : /et$/.test(v) ? `Ich ${v.slice(0, -1)}` : /[^s]t$/.test(v) ? `Ich ${v.slice(0, -1)}e` : m))
    .replace(/\b(Ich \S+(?: \S+){0,4}?) sich\b/g, "$1 mich")
    .replace(/\b(Ich [^.!?]*?)\bsein(e[nmrs]?)?\b/g, (_m, a: string, e?: string) => `${a}mein${e ?? ""}`);
}
