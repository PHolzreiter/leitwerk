/**
 * Fragen der Abfrage so, wie ein Calltaker sie ausspricht: ohne Klammertext, abwechslungsreich und mit
 * „er“/„sie“, sobald das Geschlecht feststeht (bis dahin allgemein „der Patient“). Ruft der Patient selbst
 * an, wird er mit „Sie“ angesprochen.
 *
 * Grundlage ist die Abfrage, wie sie der Calltaker ausgefüllt hat – nicht die Wahrheit.
 */
import type { Antworten, Frage, Schema } from "./schema";
import { merkmalVonFrage, merkmaleAusSchema } from "./themen";

/** Wie der Calltaker den Patienten nennt */
export type Anrede = "neutral" | "m" | "w" | "sie";

/** Anrede aus der bisher ausgefüllten Abfrage */
export function anredeAus(schema: Schema | null, antworten: Antworten): Anrede {
  const a = schema ? merkmaleAusSchema(schema, antworten) : antworten;
  if (a.anrufer === "1") return "sie";
  // mehrere Betroffene: Geschlecht spielt keine Rolle
  if (a.anzahl_patienten !== undefined && a.anzahl_patienten !== "1") return "neutral";
  if (a.geschlecht === "m" || a.geschlecht === "w") return a.geschlecht;
  return "neutral";
}

/**
 * Sprechfassungen je Merkmal. Platzhalter: {er} {Er} {ihn} {ihm} {sein} {seine} {seinen} {seiner}.
 * „sie“: eigene Fassungen für den Anrufer, der selbst der Patient ist (sonst automatisch umgeformt).
 */
const SPRECH: Record<string, { er: string[]; sie?: string[] }> = {
  ort_adresse: { er: ["Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?", "Wo genau sind Sie – Ort, Straße und Hausnummer?", "Wie lautet die genaue Adresse?"] },
  ort_zusatz: { er: ["Welcher Stock, welche Tür? Gibt es etwas, das wir bei der Zufahrt wissen müssen?", "Ist das ein Haus oder eine Wohnung – Stiege, Stock, Tür?", "Wie kommen wir am besten hin – Stock, Tür, Eingang?"] },
  rueckrufnummer: { er: ["Unter welcher Nummer erreiche ich Sie, falls wir getrennt werden?", "Sagen Sie mir bitte noch Ihre Telefonnummer für einen Rückruf.", "Unter welcher Nummer sind Sie erreichbar?"] },
  schilderung: { er: ["Was ist passiert?", "Erzählen Sie mir kurz, was passiert ist.", "Okay. Was genau ist los?"], sie: ["Was ist passiert?", "Erzählen Sie mir kurz, was los ist.", "Was genau ist passiert?"] },
  anrufer: { er: ["Wer spricht da, und wie stehen Sie zum Patienten?", "Wer ruft an – sind Sie beim Patienten?", "Wie heißen Sie, und in welcher Beziehung stehen Sie zum Patienten?"] },
  anzahl_patienten: { er: ["Wie viele Personen sind betroffen?", "Ist nur eine Person betroffen oder mehrere?", "Geht es um eine Person?"] },
  alter: { er: ["Wie alt ist {er} ungefähr?", "Wie alt ist {er} denn?", "Wissen Sie, wie alt {er} ist – ungefähr reicht."], sie: ["Wie alt sind Sie?", "Darf ich fragen, wie alt Sie sind?"] },
  geschlecht: { er: ["Ist es ein Mann oder eine Frau?", "Handelt es sich um einen Mann oder eine Frau?"] },
  bw: { er: ["Ist {er} wach? Reagiert {er}, wenn Sie {ihn} ansprechen?", "Ist {er} bei Bewusstsein und ansprechbar?", "Reagiert {er} auf Sie, wenn Sie mit {ihm} reden?"], sie: ["Sind Sie ganz wach, oder ist Ihnen schwindlig oder wird Ihnen schwarz vor Augen?"] },
  at: { er: ["Atmet {er} normal?", "Wie atmet {er}?", "Schauen Sie bitte genau hin: Wie atmet {er}?"], sie: ["Kriegen Sie normal Luft?", "Wie geht's Ihnen mit dem Atmen?"] },
  sprachschw: { er: ["Kann {er} ganze Sätze sprechen, oder nur einzelne Wörter?", "Muss {er} beim Reden nach jedem Wort Luft holen?"], sie: ["Können Sie ganze Sätze sprechen, oder müssen Sie zwischendurch Luft holen?"] },
  hautfarbe: { er: ["Welche Hautfarbe hat {er} – ist {er} blass, grau oder bläulich?", "Wie schaut {er} im Gesicht aus – blass oder bläulich?"] },
  grau: { er: ["Ist die Haut aschfahl oder grau?", "Ist {er} ganz grau im Gesicht?"] },
  kaltschweiss: { er: ["Ist {seine} Haut kalt und feucht?", "Schwitzt {er} kalt?"], sie: ["Ist Ihre Haut kalt und feucht?", "Schwitzen Sie kalt?"] },
  blutung_stark: { er: ["Blutet {er} irgendwo? Wenn ja – wie stark?", "Blutet es stark – läuft oder spritzt es?"] },
  fehlstellung: { er: ["Steht irgendwas komisch ab, ist etwas sichtbar verformt?", "Schaut ein Arm oder Bein verdreht oder gebrochen aus?"] },
  ohnmacht: { er: ["War {er} bewusstlos oder kurz weg?", "Ist {er} ohnmächtig geworden, auch nur kurz?"], sie: ["Waren Sie kurz bewusstlos oder ist Ihnen schwarz vor Augen geworden?"] },
  verletzt: { er: ["Hat {er} sich dabei verletzt?", "Sehen Sie irgendwo eine Verletzung?"], sie: ["Haben Sie sich verletzt?"] },
  aelter6h: { er: ["Wann ist das passiert – länger als sechs Stunden her?", "Wie lang ist das ungefähr her?"] },
  seit: { er: ["Seit wann hat {er} diese Beschwerden?", "Wann hat das angefangen?"], sie: ["Seit wann haben Sie die Beschwerden?", "Wann hat das angefangen?"] },
  herz_vg: { er: ["Hatte {er} schon einmal einen Herzinfarkt oder Probleme mit dem Herz?", "Ist ein Herzinfarkt bekannt?"] },
  herzleiden: { er: ["Hat {er} es mit dem Herzen?", "Ist bei {ihm} etwas mit dem Herz bekannt?"] },
  diabetiker: { er: ["Ist {er} zuckerkrank?", "Hat {er} Diabetes?"] },
  epilepsie: { er: ["Hat {er} Epilepsie?", "Hatte {er} so einen Anfall schon einmal?"] },
  blutverduenner: { er: ["Nimmt {er} Blutverdünner?", "Nimmt {er} blutverdünnende Medikamente?"] },
  lungenerkrankung: { er: ["Hat {er} eine Lungenkrankheit, Asthma oder COPD?", "Ist bei {ihm} etwas mit der Lunge bekannt?"] },
  vg_schlaganfall: { er: ["Hatte {er} schon einmal einen Schlaganfall?", "Ist ein früherer Schlaganfall bekannt?"] },
  vg_tia: { er: ["Hatte {er} schon einmal so etwas, das von selbst wieder weggegangen ist?"] },
  schwanger: { er: ["Ist sie schwanger, oder hat sie vor kurzem entbunden?", "Könnte sie schwanger sein?"], sie: ["Sind Sie schwanger oder haben Sie vor kurzem entbunden?"] },
  verwirrt: { er: ["Ist {er} verwirrt? Weiß {er}, wo {er} ist?", "Ist {er} durcheinander?"] },
  schwer_pat: { er: ["Ist {er} sehr schwer – bräuchten wir Hilfe zum Tragen?", "Wie schwer ist {er} ungefähr?"] },
  sprachstoerung: { er: ["Redet {er} anders als sonst, undeutlich oder verwaschen?"] },
  laehmung: { er: ["Kann {er} Arme und Beine normal bewegen?", "Ist eine Seite schwächer oder gelähmt?"] },
  fast_gesicht: { er: ["Bitten Sie {ihn} zu lächeln – hängt ein Mundwinkel?", "Sagen Sie {ihm}, {er} soll lächeln. Ist das Gesicht auf beiden Seiten gleich?"] },
  fast_arm: { er: ["Bitten Sie {ihn}, beide Arme nach vorne zu heben – sinkt ein Arm ab?", "Kann {er} beide Arme gleich hochheben?"] },
  fast_sprache: { er: ["Lassen Sie {ihn} einen einfachen Satz nachsprechen – klingt das verwaschen?"] },
  brustschmerz: { er: ["Hat {er} Schmerzen in der Brust?"], sie: ["Haben Sie Schmerzen in der Brust?"] },
  brust: { er: ["Hat {er} Schmerzen oder Druck in der Brust?"], sie: ["Haben Sie Schmerzen oder Druck in der Brust?"] },
  tracheostoma: { er: ["Hat {er} eine Kanüle im Hals, einen Luftröhrenschnitt?"] },
  atemweg: { er: ["Kann {er} husten, sprechen oder atmen?", "Hustet {er}, kriegt {er} Luft?"] },
  woran: { er: ["Woran hat {er} sich verschluckt?", "Was hat {er} im Mund gehabt?"] },
  krampft: { er: ["Krampft {er} jetzt noch?", "Zuckt {er} noch?"] },
  puls: { er: ["Können Sie einen Puls fühlen?"] },
  unzweifelhaft: { er: ["Sind Sie sich ganz sicher, dass {er} tot ist?"] },
  atmung_geprueft: { er: ["Haben Sie nachgeschaut, ob {er} jetzt normal atmet?"] },
  hoehe: { er: ["Ist {er} ebenerdig hingefallen oder von irgendwo heruntergestürzt?", "Wie tief ist {er} gefallen – nur am Boden hingefallen oder von weiter oben?"] },
  situation: { er: ["Wie weit ist die Geburt – hat sie Wehen, muss sie schon pressen, sieht man schon etwas?", "Wie schaut's mit der Geburt aus – wie oft kommen die Wehen, presst sie schon?"], sie: ["Wie weit ist die Geburt – haben Sie Wehen, müssen Sie schon pressen?", "Wie oft kommen die Wehen, müssen Sie schon pressen?"] },
  umstand: { er: ["Liegt {er} noch am Boden – und wie lange schon ungefähr?", "Gibt es sonst etwas Besonderes – liegt {er} noch am Boden, ist {er} schwer zu erreichen?"] },
  staerke: { er: ["Wie stark blutet es – tropft es, läuft es, oder spritzt es?", "Wie viel Blut ist das – hört es mit Draufdrücken auf?"] },
  sturz: { er: ["Ist {er} dabei gestürzt?"] },
  region: { er: ["Wo genau ist {er} verletzt?", "Wo tut es {ihm} weh?"] },
  schmerzort: { er: ["Wo genau tut es {ihm} weh?"], sie: ["Wo genau tut es Ihnen weh?"] },
  ploetzlich_stark: { er: ["Hat der Schmerz ganz plötzlich und extrem stark angefangen, wie ein Schlag?"] },
  kokain: { er: ["Hat {er} Drogen genommen, Kokain zum Beispiel?"] },
  drogen_12h: { er: ["Hat {er} in den letzten 12 Stunden Drogen oder Medikamente genommen?"], sie: ["Haben Sie in den letzten 12 Stunden Drogen oder Medikamente genommen?"] },
  drogen_welche: { er: ["Welche Drogen waren das?"], sie: ["Welche Drogen waren das?"] },
  substanzen: { er: ["Hat {er} irgendwelche Tabletten oder Substanzen genommen?"] },
  aggressiv: { er: ["Ist {er} aggressiv oder gewalttätig?"] },
  gewalttaetig: { er: ["Ist {er} aggressiv?", "Ist {er} gewalttätig geworden?"] },
  waffen: { er: ["Sind irgendwelche Waffen da?", "Gibt es Waffen in der Nähe?"] },
  psych_vorerkrankung: { er: ["Ist bei {ihm} eine psychische Erkrankung bekannt?"] },
  bluter: { er: ["Ist {er} Bluter?"] },
  aneurysma: { er: ["Ist bei {ihm} ein Aneurysma an der Bauchschlagader bekannt?"] },
  mehrere_verletzte: { er: ["Sind noch andere Personen verletzt?"] },
  anrufer_selbst: { er: ["Sind Sie selbst auch verletzt?", "Und Sie – sind Sie selber verletzt?"] },
  anzahl: { er: ["Wie viele Verletzte gibt es?", "Wie viele Personen sind verletzt?"] },
  gering: { er: ["War das nur ein leichter Unfall – langsam, so wie ein Parkschaden?"] },
  hohe_geschw: { er: ["War das mit hoher Geschwindigkeit, auf der Freilandstraße oder Autobahn – oder wissen Sie das nicht?", "War das Auto schnell unterwegs – oder wissen Sie das nicht?"] },
  hohe_energie: { er: ["War das ein heftiger Aufprall, mit hoher Geschwindigkeit?"] },
  grossunfall: { er: ["Ist ein Bus, ein Zug oder eine Straßenbahn beteiligt, oder sind sehr viele Autos betroffen?"] },
  mechanismus: { er: ["Ist ein Fußgänger, ein Radfahrer oder ein Motorrad beteiligt? Hat sich ein Auto überschlagen oder ist jemand herausgeschleudert worden?"] },
  andere_gefahren: { er: ["Gibt es sonst eine Gefahr – Feuer, Rauch, auslaufendes Benzin, fließender Verkehr?"] },
  gefahrgut: { er: ["Ist ein Lkw mit Gefahrgut beteiligt – mit so einer orangen Tafel?"] },
  eingeklemmt: { er: ["Ist jemand eingeklemmt, kommt jemand nicht aus dem Auto heraus?", "Ist jemand eingeklemmt?"] },
  verletzte: { er: ["Ist jemand verletzt?", "Gibt es Verletzte?"] },
  grund: { er: ["Warum braucht {er} die Rettung – was ist der Grund?", "Weshalb soll {er} ins Krankenhaus?"] },
  dringlichkeit: { er: ["Wie dringend ist es – muss {er} sofort fahren, braucht {er} Sauerstoff oder Überwachung?", "Wie eilig ist es?"] },
  transportart: { er: ["Kann {er} sitzen, oder muss {er} liegend transportiert werden?", "Kann {er} gehen oder sitzen?"] },
  anforderer: { er: ["Rufen Sie als Arzt oder von der Pflege an?"] },
  hauptbeschwerde: { er: ["Was ist {sein} Hauptproblem – was macht {ihm} am meisten zu schaffen?", "Welche Beschwerden hat {er} vor allem?"] },
  lage: { er: ["Ist {er} irgendwo eingeklemmt oder eingeschlossen?", "Kommt {er} selbst heraus, oder steckt {er} irgendwo fest?"] },
  lage_psych: { er: ["Was genau hat {er} gesagt oder geschrieben – will {er} sich etwas antun?", "Hat {er} gesagt, dass {er} sich etwas antun will – oder wie?"] },
  schwaeche: { er: ["Ist eine Körperseite plötzlich schwach oder taub?"] },
  gleichgewicht: { er: ["Hat {er} plötzlich Probleme mit dem Gleichgewicht, schwankt {er}?"] },
  sehen: { er: ["Sieht {er} plötzlich schlechter oder doppelt?"] },
  kopfschmerz: { er: ["Hat {er} plötzlich ganz starke Kopfschmerzen bekommen?"] },
  nur_alarm: { er: ["Ist das nur ein Brandalarm, ohne dass jemand verletzt ist?"] },
  hochrisiko: { er: ["Hat {er} schwere Vorerkrankungen oder ein geschwächtes Immunsystem?"] },
  medikation: { er: ["Hat {er} schon ein Notfallmedikament bekommen, zum Beispiel einen Adrenalin-Pen?"] },
  vergiftung: { er: ["Könnte {er} etwas eingenommen haben, zu viele Tabletten oder Gift?"] },
  verhalten: { er: ["Verhält {er} sich anders als sonst?", "Benimmt {er} sich irgendwie auffällig?"] },
  tod: { er: ["Ist {er} schon kalt oder steif – oder ist das ganz plötzlich passiert?"] },
  ursache_9: { er: ["Wissen Sie, warum {er} umgefallen ist – ein Unfall, Strom, Wasser, Drogen?"] },
  todeszeichen: { er: ["Ist {er} schon kalt und steif, oder hat {er} so dunkle Flecken auf der Haut?"] },
  zeuge: { er: ["Haben Sie gesehen, wie {er} umgefallen ist?"] },
};

/** Fragen, die nur der Calltaker beantwortet – werden nicht gestellt */
export function istInterneFrage(f: Frage): boolean {
  return f.typ === "kapitelwahl" || /^(Calltaker|Polizei-Kennung|Soll statt)/.test(f.text);
}

const PRONOMEN: Record<string, [string, string, string]> = {
  // [männlich, weiblich, allgemein]
  er: ["er", "sie", "der Patient"],
  Er: ["Er", "Sie", "Der Patient"],
  ihn: ["ihn", "sie", "den Patienten"],
  ihm: ["ihm", "ihr", "dem Patienten"],
  sein: ["sein", "ihr", "sein"],
  seine: ["seine", "ihre", "seine"],
  seinen: ["seinen", "ihren", "seinen"],
  seiner: ["seiner", "ihrer", "seiner"],
};

function fuellePronomen(t: string, an: Anrede): string {
  const i = an === "w" ? 1 : an === "m" ? 0 : 2;
  // allgemein: nur das erste Mal „der Patient“, danach „er“/„ihn“ (bezogen auf „der Patient“)
  let erstes = true;
  let s = t.replace(/\{(\w+)\}/g, (m, k: string) => {
    const p = PRONOMEN[k];
    if (!p) return m;
    if (i === 2 && !erstes) return p[0];
    erstes = false;
    return p[i];
  });
  // „Ist der Patient …“ am Satzanfang groß
  s = s.replace(/(^|[.?!]\s+)der Patient/g, "$1Der Patient");
  return s;
}

/** 3. Person → „Sie“-Form (für den Patienten, der selbst anruft) */
const VERB_SIE: Record<string, string> = {
  ist: "sind",
  hat: "haben",
  kann: "können",
  atmet: "atmen",
  war: "waren",
  hatte: "hatten",
  nimmt: "nehmen",
  blutet: "bluten",
  wird: "werden",
  reagiert: "reagieren",
  spricht: "sprechen",
  redet: "reden",
  verhält: "verhalten",
  leidet: "leiden",
  fühlt: "fühlen",
  krampft: "krampfen",
  steckt: "stecken",
  brennt: "brennen",
  weiß: "wissen",
  erwartet: "erwarten",
  muss: "müssen",
  bräuchte: "bräuchten",
};

function inSieForm(t: string): string {
  let s = t;
  // Verb vor dem Patienten: „Ist der Patient …“ → „Sind Sie …“
  s = s.replace(/\b(\w+) (der Patient|die Patientin|die Person|er|sie)\b/g, (m, verb: string, wer: string) => {
    const v = VERB_SIE[verb.toLowerCase()];
    if (!v) return m;
    void wer;
    return `${verb[0] === verb[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v} Sie`;
  });
  s = s.replace(/\b(der Patient|die Patientin|die Person)\b/g, "Sie").replace(/\bden Patienten\b/g, "Sie").replace(/\b(dem Patienten|der Patientin)\b/g, "Ihnen");
  s = s.replace(/\b(sein|ihr)(e|en|er|em)?\b(?= \w)/g, (_m, _a, e: string | undefined) => `Ihr${e ?? ""}`);
  return s;
}

/** Allgemeine Umformung, wenn es keine eigene Sprechfassung gibt */
function allgemein(text: string, an: Anrede): string {
  let t = text
    // Klammerzusätze („(ungefähr)“, „(Stichworte)“) gehören nicht in die gesprochene Frage
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+([?.!])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  // „Überdosis / Vergiftung“ → „Überdosis oder Vergiftung“
  t = t.replace(/\s*\/\s*/g, " oder ");
  if (an === "sie") return inSieForm(t);
  if (an === "neutral") return t;
  const w = an === "w";
  t = t
    .replace(/\b[Dd]er Patient\b|\b[Dd]ie Patientin\b/g, (m) => (m[0] === "D" ? (w ? "Sie" : "Er") : w ? "sie" : "er"))
    .replace(/\bden Patienten\b|\bdie Patientin\b/g, w ? "sie" : "ihn")
    .replace(/\bdem Patienten\b|\bder Patientin\b/g, w ? "ihr" : "ihm")
    .replace(/\bdes Patienten\b/g, w ? "der Patientin" : "des Patienten");
  // „Verhält sich er“ → „Verhält er sich“
  t = t.replace(/\b(\w+) sich (er|sie)\b/gi, (m, v: string, p: string) => (/^(er|sie)$/i.test(v) ? m : `${v} ${p.toLowerCase()} sich`));
  // „Ist Er wach?“ → „Ist er wach?“ (nur am Satzanfang groß)
  t = t.replace(/(\S) (Er|Sie)\b/g, (m, vor: string, p: string) => (/[.?!:]$/.test(vor) ? m : `${vor} ${p.toLowerCase()}`));
  return t;
}

/** Schlüssel (Merkmal) einer Frage */
function merkmal(schema: Schema | null, f: Frage): string {
  return schema ? merkmalVonFrage(schema, f.id) : f.id;
}

/**
 * Gesprochene Fassung einer Schemafrage. `nr` wählt die Fassung (z. B. wie oft schon gefragt),
 * `zufall` eine zufällige.
 */
export function sprechFrage(f: Frage, schema: Schema | null, antworten: Antworten, opt: { zufall?: () => number; erste?: boolean } = {}): string {
  const an = anredeAus(schema, antworten);
  const m = merkmal(schema, f);
  // gleiche ID, anderes Kapitel: „Situation“ bei der psychischen Krise ist etwas anderes als beim Eingeklemmten
  const psych = m === "lage" && (f.optionen ?? []).some((o) => o.wert === "absicht" || o.wert === "gedanken");
  const def = psych ? SPRECH.lage_psych : SPRECH[m];
  const rnd = opt.zufall ?? Math.random;
  if (m === "ort_adresse" && opt.erste) return "Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?";
  // Kinder: „Bub oder Mädchen?“
  if (m === "geschlecht" && typeof antworten.alter === "number" && antworten.alter < 14) return "Ist es ein Bub oder ein Mädchen?";
  if (def) {
    if (an === "sie" && def.sie?.length) return def.sie[Math.floor(rnd() * def.sie.length)];
    // „schwanger“ fragt immer nach „sie“
    const liste = def.er;
    const t = liste[Math.floor(rnd() * liste.length)];
    if (an === "sie") return inSieForm(fuellePronomen(t, "neutral"));
    return fuellePronomen(t, m === "schwanger" ? "w" : an);
  }
  return allgemein(f.text, an);
}

/** Schemafrage mit „er“/„sie“ statt „der Patient“ und ohne Klammertext (für die Anweisung an die KI) */
export function frageMitPronomen(text: string, w: boolean | null): string {
  return allgemein(text, w === null ? "neutral" : w ? "w" : "m");
}

/** „der Patient“ in einer Antwort des Anrufers durch „er“/„sie“ ersetzen (so redet kein Laie) */
export function ohnePatientWort(text: string, w: boolean): string {
  return text
    .replace(/\bzu(m Patienten| der Patientin|r Patientin)\b/g, w ? "zu ihr" : "zu ihm")
    .replace(/\bbei(m Patienten| der Patientin| dem Patienten)\b/g, w ? "bei ihr" : "bei ihm")
    .replace(/\b([Dd])(er Patient|ie Patientin)\b/g, (_m, d: string) => (d === "D" ? (w ? "Sie" : "Er") : w ? "sie" : "er"))
    .replace(/\b(den Patienten|die Patientin)\b/g, w ? "sie" : "ihn")
    .replace(/\b(dem Patienten|der Patientin)\b/g, w ? "ihr" : "ihm")
    .replace(/\bdes Patienten\b/g, w ? "von ihr" : "von ihm");
}
