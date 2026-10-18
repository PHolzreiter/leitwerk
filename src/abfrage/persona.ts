/**
 * Anrufer-Persönlichkeit: Damit kein Notruf wie der andere klingt, bekommt jeder (private) Anrufer
 * - ein Wissen (Angehörige wissen viel, Bekannte manches, Fremde nur, was sie sehen),
 * - eine Art zu reden (knapp, normal, gesprächig, unsicher) mit eigenen Füllwörtern und einer Eigenheit,
 * - einen Einstieg ins Gespräch (Adresse, „bitte schnell“, gleich das Problem, „Hallo, bin ich richtig?“ …),
 * - eigene Wörter für den Patienten („die Mama“, „der Franz“, „der ältere Herr“ – nie „der Patient“),
 * - eine Schätzung des Alters (Fremde und Bekannte irren sich).
 * Alles wird beim Entstehen des Notrufs ausgewürfelt und steht dann fest.
 */
import type { AnruferTyp } from "./szenario";

export type Wissen = "nah" | "bekannt" | "fremd" | "profi";
export type Redestil = "knapp" | "normal" | "gespraechig" | "unsicher";
export type Einstieg = "adresse" | "dringend" | "problem" | "hallo" | "unvollstaendig" | "umschreibung" | "vorstellung";

export interface Persona {
  wissen: Wissen;
  stil: Redestil;
  einstieg: Einstieg;
  /** Lieblingswörter (sparsam verwenden) */
  woerter: string[];
  /** eine Eigenheit (oder keine) */
  eigenheit: string | null;
  /** so nennt der Anrufer den Patienten (abwechselnd) */
  nennt: string[];
  /** was der Anrufer auf die Frage nach dem Alter sagt */
  alterGesagt: string;
  /** weiß, welche Krankheiten und Medikamente der Patient hat */
  kenntVorgeschichte: "ja" | "teilweise" | "nein";
  /** Medikamente nur ungefähr („irgendwas fürs Herz“) */
  medsUngefaehr: boolean;
  /** wer sonst noch da ist */
  dabei: string;
}

type Rnd = () => number;

function pick<T>(a: T[], rnd: Rnd): T {
  return a[Math.floor(rnd() * a.length)];
}

function gewichtet<T>(liste: [T, number][], rnd: Rnd): T {
  const sum = liste.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * sum;
  for (const [v, w] of liste) {
    r -= w;
    if (r <= 0) return v;
  }
  return liste[liste.length - 1][0];
}

/** Wie gut kennt der Anrufer den Patienten? */
export function wissenVon(typ: AnruferTyp | undefined, selbst: boolean): Wissen {
  if (selbst) return "nah";
  switch (typ) {
    case "partner":
    case "kind":
    case "eltern":
    case "fern":
      return "nah";
    case "nachbar":
    case "kollege":
    case "begleiter":
    case "lehrer":
    case "trainer":
      return "bekannt";
    case "pflege":
    case "arzt":
    case "ordi":
    case "telemed":
    case "polizei":
    case "bergrettung":
      return "profi";
    default:
      return "fremd";
  }
}

/** Wörter für den Patienten – je nach Beziehung, Geschlecht und Alter */
function nennWoerter(typ: AnruferTyp | undefined, rolle: string, w: boolean, alter: number, vorname: string, nachname: string, rnd: Rnd): string[] {
  // Achtung: „Pflegeheim“ enthält „ehe“ – deshalb Wortanfänge prüfen
  const r = rolle.toLowerCase();
  const er = w ? "sie" : "er";
  if (typ === "pflege") return [w ? `die Frau ${nachname}` : `der Herr ${nachname}`, w ? "die Bewohnerin" : "der Bewohner", er];
  if (typ === "arzt" || typ === "ordi") return [w ? `die Frau ${nachname}` : `der Herr ${nachname}`, w ? "die Patientin" : "der Patient", er];
  if (typ === "partner" || /\b(ehefrau|ehemann|lebensgef\w*|partner\w*)\b/.test(r)) return [w ? "meine Frau" : "mein Mann", w ? `die ${vorname}` : `der ${vorname}`, er];
  if (typ === "kind" || /tochter|sohn/.test(r))
    return rnd() < 0.6 ? [w ? "die Mama" : "der Papa", w ? "meine Mutter" : "mein Vater", er] : [w ? "meine Mutter" : "mein Vater", w ? "die Mutti" : "der Vati", er];
  if (typ === "eltern" || /^mutter|^vater/.test(r)) {
    if (alter < 6) return [w ? "die Kleine" : "der Kleine", w ? `die ${vorname}` : `der ${vorname}`, er];
    return [w ? "meine Tochter" : "mein Sohn", w ? `die ${vorname}` : `der ${vorname}`, er];
  }
  if (typ === "nachbar" || /nachbar/.test(r)) return [w ? "meine Nachbarin" : "mein Nachbar", w ? `die Frau ${nachname}` : `der Herr ${nachname}`, er];
  if (typ === "kollege" || /kolleg/.test(r)) return [w ? "meine Kollegin" : "mein Kollege", w ? `die ${vorname}` : `der ${vorname}`, er];
  if (typ === "begleiter" || /freund/.test(r)) return [w ? "meine Freundin" : "mein Freund", w ? `die ${vorname}` : `der ${vorname}`, er];
  if (typ === "lehrer") return [w ? "eine Schülerin" : "ein Schüler", w ? `die ${vorname}` : `der ${vorname}`, er];
  if (typ === "trainer") return [w ? "eine Spielerin" : "ein Spieler", w ? `die ${vorname}` : `der ${vorname}`, er];
  // Fremde: nach Aussehen
  if (alter < 14) return [w ? "ein Mädchen" : "ein Bub", w ? "die Kleine" : "der Kleine", er];
  if (alter < 25) return w ? ["eine junge Frau", "das Mädel", er] : ["ein junger Mann", "der Bursch", er];
  if (alter >= 70) return w ? ["eine ältere Dame", "die Frau", er] : ["ein älterer Herr", "der Herr", er];
  return w ? [pick(["eine Frau", "eine Dame"], rnd), "die Frau", er] : [pick(["ein Mann", "ein Herr"], rnd), "der Mann", er];
}

/** Was der Anrufer auf „Wie alt?“ sagt: Angehörige genau, Bekannte ungefähr, Fremde geschätzt (oft daneben) */
function alterSagen(alter: number, wissen: Wissen, rnd: Rnd): string {
  if (wissen === "nah" || wissen === "profi") return String(alter);
  const runde5 = (n: number) => Math.max(1, Math.round(n / 5) * 5);
  if (alter < 14) {
    const s = Math.max(1, alter + Math.round((rnd() - 0.5) * 4));
    return `vielleicht ${s}, ${s + 2}`;
  }
  if (wissen === "bekannt") {
    if (rnd() < 0.35) return String(alter);
    return `so um die ${runde5(alter + Math.round((rnd() - 0.5) * 8))}`;
  }
  const fehler = Math.round((rnd() + rnd() - 1) * 14);
  const s = runde5(alter + fehler);
  return rnd() < 0.5 ? `schätzungsweise ${s}` : `so zwischen ${s - 5} und ${s + 5}`;
}

const WOERTER: Record<string, string[]> = {
  hochdeutsch: ["also", "äh", "irgendwie", "halt", "na ja", "ja genau", "sozusagen", "eben"],
  dialekt: ["jo", "na", "eh", "gell", "oiso", "hoit", "geh", "schauns"],
  gebrochen: ["ja ja", "bitte", "wie sagt man", "okay"],
};

/** Persönlichkeit für einen privaten Anrufer (Profis bekommen eine ruhige, knappe) */
export function personaWaehlen(
  x: { rolle: string; selbst: boolean; typ?: AnruferTyp; emotion: "ruhig" | "gefasst" | "aufgeregt" | "panisch"; sprache: string },
  p: { alter: number; w: boolean; vorname: string; nachname: string; wach?: boolean; sicht?: boolean },
  opt: { ortUnbekannt?: boolean; draussen?: boolean; zuhause?: boolean },
  rnd: Rnd = Math.random,
): Persona {
  const wissen = wissenVon(x.typ, x.selbst);
  const alt = !x.selbst && /mutter|vater|ehefrau|ehemann|nachbar/i.test(x.rolle) && p.alter >= 70;
  const stil: Redestil =
    wissen === "profi"
      ? gewichtet<Redestil>([["knapp", 3], ["normal", 3], ["gespraechig", 0.7], ["unsicher", 0.7]], rnd)
      : gewichtet<Redestil>(
          [
            ["normal", 4],
            ["knapp", x.emotion === "panisch" ? 3 : 2],
            ["gespraechig", alt ? 3 : 1.5],
            ["unsicher", wissen === "fremd" ? 2 : 1],
          ],
          rnd,
        );
  const einstieg: Einstieg =
    opt.ortUnbekannt
      ? "adresse"
      : wissen === "profi"
        ? gewichtet<Einstieg>([["adresse", 2], ["vorstellung", 3]], rnd)
      : gewichtet<Einstieg>(
          [
            ["adresse", 5],
            ["dringend", x.emotion === "panisch" || x.emotion === "aufgeregt" ? 4 : 1],
            ["problem", x.emotion === "panisch" ? 3 : x.emotion === "aufgeregt" ? 2 : 1],
            ["hallo", stil === "unsicher" ? 2.5 : 0.8],
            ["unvollstaendig", 1.5],
            ["umschreibung", opt.draussen ? 0.5 : 1.2],
          ],
          rnd,
        );
  const pool = WOERTER[x.sprache] ?? WOERTER.hochdeutsch;
  const w1 = pick(pool, rnd);
  const w2 = pick(pool.filter((w) => w !== w1), rnd);
  const er = p.w ? "sie" : "er";
  const ihm = p.w ? "ihr" : "ihm";
  // Eigenheiten nur, wenn sie zur Lage passen (mit einem Bewusstlosen redet man nicht, ein Kleinkind „geht nie zum Arzt“ nicht …)
  const wach = p.wach !== false;
  const sicht = p.sicht !== false;
  const eigenheiten: string[] = x.selbst
    ? ["Du stöhnst zwischendurch kurz („Au … Moment …“).", "Du fragst einmal zwischendurch, wie lange die Rettung noch braucht.", "Du sagst oft „Moment“, weil dir alles schwerfällt.", "Du entschuldigst dich einmal, dass du so lästig bist."]
    : wissen === "fremd"
      ? [
          ...(opt.draussen ? ["Du redest zwischendurch kurz mit anderen Leuten, die dabeistehen („Kann wer eine Decke holen?“)."] : []),
          "Du sagst oft „Moment“ und schaust dann nach.",
          "Du entschuldigst dich zwischendurch, weil du nicht weißt, was du tun sollst.",
          "Du fragst einmal zwischendurch, wie lange die Rettung noch braucht.",
        ]
      : [
          ...(wach && sicht && p.alter >= 3 ? [`Du redest zwischendurch kurz mit ${p.w ? "ihr" : "ihm"} („${p.vorname}, die Rettung kommt gleich!“).`] : []),
          "Du wiederholst Fragen der Leitstelle halb, bevor du antwortest („Ob " + er + " … ? Moment …“).",
          "Du sagst oft „Moment“ und schaust dann nach.",
          ...(p.alter >= 18 ? [`Du erwähnst einmal nebenbei etwas, das dich zusätzlich beschäftigt (dass du gerade erst heimgekommen bist, dass ${er} sich nie schont o. Ä.).`] : []),
          "Du fragst einmal zwischendurch, wie lange die Rettung noch braucht.",
        ];
  const eigenheitenProfi = [
    "Du schaust zwischendurch in die Dokumentation nach („Moment, ich schau in die Doku …“).",
    "Du hast es eilig, weil auf der Station noch viel los ist – du redest schnell und sachlich.",
    `Du bist erst seit kurzem im Haus und kennst ${p.w ? "sie" : "ihn"} noch nicht so gut – manches musst du nachschauen.`,
    "Du sagst Werte gern mit Uhrzeit dazu („um sieben in der Früh …“).",
    "Du fragst einmal, welches Krankenhaus es wird, weil du die Angehörigen anrufen musst.",
  ];
  const eigenheit = wissen === "profi" ? (rnd() < 0.3 ? null : pick(eigenheitenProfi, rnd)) : rnd() < 0.45 ? null : pick(eigenheiten, rnd);
  const kenntVorgeschichte: Persona["kenntVorgeschichte"] = wissen === "nah" || wissen === "profi" ? "ja" : wissen === "bekannt" ? (rnd() < 0.5 ? "teilweise" : "nein") : "nein";
  // Wer sonst noch da ist – konkret (wichtig für Anweisungen wie „Schicken Sie jemanden zur Tür“)
  const verwandt = pick(["deine Schwester", "dein Bruder", "deine Tochter", "dein Sohn", "eine Nachbarin"], rnd);
  const dabeiListe =
    wissen === "fremd"
      ? opt.draussen
        ? ["Ein paar Leute stehen herum, einer kniet schon neben " + ihm + ".", "Außer dir ist gerade niemand da.", "Eine zweite Person ist bei dir und hilft."]
        : ["Außer dir ist gerade niemand da.", "Eine Kollegin von dir ist auch da und hilft."]
      : wissen === "profi"
        ? ["Eine Kollegin ist bei " + ihm + ", du telefonierst vom Stationszimmer.", "Du bist selbst bei " + ihm + ", eine Kollegin hilft dir."]
        : opt.zuhause === false
          ? ["Du bist allein mit " + ihm + ".", "Ein paar Leute stehen herum und schauen."]
          : ["Du bist allein mit " + ihm + " – sonst ist niemand da, der die Tür aufmachen könnte.", `Außer dir ist ${verwandt} da und kann helfen (z. B. die Haustür aufmachen).`, "Du bist allein mit " + ihm + ", das Telefon hast du auf Lautsprecher."];
  return {
    wissen,
    stil,
    einstieg,
    woerter: [w1, w2],
    eigenheit,
    nennt: x.selbst ? ["ich"] : nennWoerter(x.typ, x.rolle, p.w, p.alter, p.vorname, p.nachname, rnd),
    alterGesagt: alterSagen(p.alter, wissen, rnd),
    kenntVorgeschichte,
    medsUngefaehr: wissen === "nah" && !x.selbst && p.alter >= 18 && rnd() < 0.45,
    dabei: x.selbst ? (rnd() < 0.7 ? "Du bist allein – niemand kann dir die Tür aufmachen." : `${verwandt.charAt(0).toUpperCase()}${verwandt.slice(1)} ist bei dir.`) : pick(dabeiListe, rnd),
  };
}

const STIL_TEXT: Record<Redestil, string> = {
  knapp: "Du redest knapp: kurze Antworten, kaum etwas von dir aus.",
  normal: "Du antwortest normal: ein, zwei Sätze, ab und zu ein Gefühl dazu.",
  gespraechig: "Du redest gern und erzählst manchmal ein bisschen mehr, als gefragt war (Nebensächliches, aber nichts, was der Fallakte widerspricht) – lass dich aber von der Leitstelle zurückholen.",
  unsicher: "Du bist unsicher: „ich glaub“, „ich weiß nicht genau“, du fragst manchmal nach, was gemeint ist.",
};

/** Zeilen für die Anweisung an die KI */
export function personaText(p: Persona, w: boolean, selbst: boolean): string {
  const er = w ? "sie" : "er";
  const ihn = w ? "sie" : "ihn";
  const z: string[] = ["DEINE ART (damit klingst du anders als andere Anrufer – halte dich daran):"];
  z.push(`- ${STIL_TEXT[p.stil]}`);
  z.push(`- Deine typischen Füllwörter: „${p.woerter.join("“, „")}“ – sparsam, nicht in jedem Satz.`);
  if (p.eigenheit) z.push(`- ${p.eigenheit}`);
  if (!selbst) {
    z.push(
      p.wissen === "profi"
        ? `- So nennst du ${ihn} (abwechselnd): ${p.nennt.map((n) => `„${n}“`).join(", ")}.`
        : `- So nennst du ${ihn} (abwechselnd): ${p.nennt.map((n) => `„${n}“`).join(", ")}. NIE „der Patient“ oder „die Patientin“ – so redet kein Angehöriger oder Passant.`,
    );
    if (p.wissen === "fremd") z.push(`- Du kennst ${ihn} NICHT. Name, Alter, Krankheiten, Medikamente, Hausarzt weißt du nicht. Fragt die Leitstelle danach, sagst du das – ist ${er} wach, kannst du ${ihn} kurz fragen („Moment, ich frag …“) und gibst weiter, was ${er} sagt.`);
    else if (p.wissen === "bekannt")
      z.push(
        `- Du kennst ${ihn}, aber nicht sehr genau. ${p.kenntVorgeschichte === "teilweise" ? "Von Krankheiten weißt du nur das Auffälligste, Medikamente kennst du nicht" : "Krankheiten und Medikamente kennst du nicht"} – sag ehrlich „das weiß ich nicht“.`,
      );
    else if (p.medsUngefaehr) z.push(`- Die Namen der Medikamente weißt du nicht auswendig – du beschreibst sie („irgendwas fürs Herz“, „so eine kleine weiße Tablette“) oder bietest an, nachzuschauen.`);
    z.push(`- Auf die Frage nach dem Alter sagst du: ${p.alterGesagt}${p.wissen === "fremd" || p.wissen === "bekannt" ? " (genauer weißt du es nicht)" : ""}.`);
  }
  return z.join("\n");
}

/** Hinweis für den ersten Satz (Antwort auf „Wo ist der Notfallort?“) */
export function einstiegHinweis(p: Persona, adresse: string, rnd: Rnd = Math.random): string {
  const teile = adresse.split(",").map((t) => t.trim());
  const strasse = teile[0] ?? adresse;
  switch (p.einstieg) {
    case "dringend":
      return `Zwei ganz kurze Sätze: zuerst ein Ausruf, dass es dringend ist (z. B. ${pick(["„Bitte, schnell …“", "„Sie müssen sofort kommen!“", "„Hilfe, bitte!“", "„Schnell, bitte!“", "„Bitte kommen Sie schnell!“"], rnd)}), DANN SOFORT die Adresse (${adresse}). Sonst nichts.`;
    case "problem":
      return "Du bist so durch den Wind, dass du NICHT mit der Adresse anfängst: du rufst nur kurz heraus, was los ist (ein kurzer Satz, höchstens zehn Wörter, keine Einzelheiten) – ohne Adresse. Die Adresse sagst du erst, wenn die Leitstelle noch einmal nach dem Ort fragt.";
    case "hallo":
      return `Du hast vor Aufregung nicht richtig zugehört und fragst NUR nach, ob du richtig verbunden bist (z. B. ${pick(["„Hallo? Ist da die Rettung?“", "„Ja, hallo … bin ich da richtig beim Notruf?“", "„Rettung? Hallo?“", "„Hallo, ist das die 144?“"], rnd)}). Nur diese eine kurze Frage – keine Adresse, keine Antwort darauf, nichts weiter. Die Adresse sagst du, wenn die Leitstelle es bestätigt und noch einmal fragt.`;
    case "unvollstaendig":
      return teile.length > 1 ? `Du nennst nur „${strasse}“ – die Gemeinde vergisst du. Die sagst du erst, wenn die Leitstelle nachfragt.` : "Nenn den Ort.";
    case "vorstellung":
      return `Du meldest dich wie ein Profi: wer du bist und von wo (z. B. ${pick(["„Grüß Gott, hier ist <dein Name> von <wo du arbeitest>“", "„<wo du arbeitest>, <dein Name>, grüß Gott“", "„Ja, grüß Gott, <dein Name> hier, <wo du arbeitest>“"], rnd)}), dann die Adresse (${adresse}). Zwei kurze Sätze, sonst nichts.`;
    case "umschreibung":
      return "Du nennst die vollständige Adresse (Straße, Hausnummer, Ort) und sagst in einem kurzen Satz dazu, woran man das Haus erkennt – denk dir selbst etwas Passendes aus.";
    default:
      return "Nenn nur die Adresse (Straße, Hausnummer, Ort) – sonst nichts.";
  }
}
