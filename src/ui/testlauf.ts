/**
 * Testlauf (Fall-Editor): spielt Notrufe mit einem oder allen Fällen automatisch durch – die Leitstelle fragt
 * wie ein Calltaker (Grundfragen, Kapitelfragen, freie Frage, Zusammenfassung, Mitteilung, Anweisung),
 * die KI antwortet als Anrufer. Nichts davon kommt ins Spiel, nichts wird vorgelesen.
 * Am Ende: ZIP mit einem Gesprächsexport je Durchlauf und einer Übersicht mit auffälligen Antworten.
 */
import { anruferAntwort, ERÖFFNUNG, kontext, testlaufStatus } from "../abfrage/gespraech";
import { kiBereit, kiPrefs, kiStatus } from "../abfrage/ki";
import { alleFaelle, fallVorlage, istFallAktiv, type FallVorlage } from "../abfrage/faelle";
import { nachrichtArt, saetze, schonGesagt } from "../abfrage/runde";
import { fragenImAblauf, type Antworten, type Frage, type Schema } from "../abfrage/schema";
import { istInterneFrage, sprechFrage } from "../abfrage/sprechfrage";
import { store } from "../data/store";
import { inTauri, saveZipFile } from "../platform";
import { sim, type Einsatz } from "../sim/engine";
import { openDialog } from "./dialog";
import { el, toast } from "./dom";
import { ktExportText, rdExportText } from "./gespraechExport";
import { KT_FRAGEN, ktAntwort, ktPruefen, ktSelbst, type KtFrage } from "../abfrage/ktGespraech";
import { hhmm, type KtAuftrag } from "../sim/kt";

export interface TestAuftrag {
  fallId: string;
  variante: string;
  /** Krankentransport bzw. Überstellung statt Notruf */
  art?: "kt" | "sek";
}

interface Auffaellig {
  frage: string;
  antwort: string;
  grund: string;
}

interface Durchlauf {
  nr: number;
  fallId: string;
  fallName: string;
  variante: string;
  rolle: string;
  persona: string;
  fragen: number;
  dauerMs: number;
  antwortMs: number[];
  auffaellig: Auffaellig[];
  datei: string;
  text: string;
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Platzhalter {er} {Er} {ihn} {ihm} {sein} nach dem, was die Leitstelle schon weiß */
function mitPronomen(t: string, g: "m" | "w" | null): string {
  const tab: Record<string, [string, string, string]> = {
    er: ["er", "sie", "der Patient"],
    Er: ["Er", "Sie", "Der Patient"],
    ihn: ["ihn", "sie", "den Patienten"],
    ihm: ["ihm", "ihr", "dem Patienten"],
    sein: ["sein", "ihr", "sein"],
    seine: ["seine", "ihre", "seine"],
  };
  const i = g === "m" ? 0 : g === "w" ? 1 : 2;
  return t.replace(/\{(\w+)\}/g, (m, k: string) => tab[k]?.[i] ?? m);
}

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Anweisung am Telefon je Anleitungs-Art (passt zu den Mustern, die das Spiel erkennt) */
const ANWEISUNG: Record<string, string[]> = {
  druck_blutung: ["Drücken Sie bitte ein sauberes Tuch fest auf die Wunde und halten Sie den Druck."],
  fremdkoerper: ["Beugen Sie {ihn} bitte nach vorne und schlagen Sie {ihm} fünfmal kräftig zwischen die Schulterblätter."],
  fremdkoerper_kind: ["Legen Sie {ihn} bitte bäuchlings über Ihren Unterarm, Kopf nach unten, und klopfen Sie fünfmal kräftig zwischen die Schulterblätter."],
  reanimation: ["Legen Sie {ihn} auf den Rücken und drücken Sie fest in die Mitte des Brustkorbs, zweimal pro Sekunde – zählen Sie laut mit."],
  seitenlage: ["Legen Sie {ihn} bitte in die stabile Seitenlage und schauen Sie, ob {er} weiter atmet."],
  oberkoerper_hoch: ["Setzen Sie {ihn} bitte mit dem Oberkörper hoch hin und öffnen Sie ein Fenster."],
  beine_hoch: ["Legen Sie {ihn} bitte flach hin und lagern Sie die Beine hoch."],
  zucker: ["Wenn {er} schlucken kann, geben Sie {ihm} bitte etwas Zuckerhaltiges zu trinken, Saft oder Cola."],
  spray: ["Geben Sie {ihm} bitte noch zwei Hübe vom Spray."],
  geburt: ["Legen Sie bitte saubere Handtücher bereit und halten Sie das Baby nach der Geburt warm."],
  beruhigen: ["Versuchen Sie bitte, {ihn} zu beruhigen – ganz langsam ein und aus atmen, mit {ihm} gemeinsam."],
  nicht_bewegen: ["Bitte bewegen Sie {ihn} nicht und decken Sie {ihn} zu."],
  absichern: ["Schalten Sie bitte die Warnblinkanlage ein und sichern Sie die Unfallstelle ab."],
  absichern_fuss: ["Bleiben Sie bitte von der Fahrbahn weg und achten Sie auf den Verkehr. Sprechen Sie {ihn} an, aber bewegen Sie {ihn} nicht."],
  tuer: ["Schicken Sie bitte jemanden zur Haustür, der die Rettung einweist."],
  husten: ["Lassen Sie {ihn} kräftig husten – solange {er} gut hustet, klopfen Sie nicht. Sagen Sie mir sofort, wenn {er} nicht mehr husten kann."],
  kontakt: ["Klopfen Sie bitte laut an die Tür und rufen Sie {ihn} beim Namen – hören Sie etwas?"],
  dableiben: ["Bleiben Sie bitte bei {ihm} und lassen Sie {ihn} nicht allein."],
  einweisen: ["Bleiben Sie bitte bei {ihm} und winken Sie der Rettung, wenn sie kommt."],
};
const ANWEISUNG_SELBST: Record<string, string> = {
  spray: "Nehmen Sie bitte noch zwei Hübe von Ihrem Spray.",
  oberkoerper_hoch: "Setzen Sie sich bitte aufrecht hin und atmen Sie langsam.",
  zucker: "Trinken Sie bitte etwas Zuckerhaltiges, Saft oder Cola.",
  druck_blutung: "Drücken Sie bitte ein sauberes Tuch fest auf die Wunde.",
  beruhigen: "Atmen Sie bitte ganz langsam ein und aus.",
  nicht_bewegen: "Bitte bleiben Sie ruhig liegen und bewegen Sie sich nicht.",
};

/** Maßnahmen, nach denen „Bringt das was?“ Sinn ergibt */
const WIRKT = new Set(["druck_blutung", "fremdkoerper", "fremdkoerper_kind", "husten", "oberkoerper_hoch", "beine_hoch", "zucker", "spray", "beruhigen", "seitenlage"]);

/** Ist der Notfallort in einem Gebäude (Haustür, Wohnungstür)? */
function imHaus(e: Einsatz): boolean {
  return ["wohnung", "haus", "pflegeheim", "arzt", "arbeit", "schule", "lokal", "geschaeft"].includes(e.wahr.abfrage?.szenario?.ortArt ?? "wohnung");
}

/** Anweisung, die zum aktuellen Zustand, zum Ort und zum Anrufer passt (wie ein Calltaker sie geben würde) */
function anweisungWaehlen(e: Einsatz, selbst: boolean): { typ: string; text: string } {
  const l = e.wahr.lage;
  const w = e.wahr.abfrage!;
  const sz = w.szenario;
  const a = w.antworten;
  const allein = /allein|niemand/i.test(w.anrufer.persona?.dabei ?? "");
  if (sz?.ohneSicht) return { typ: "kontakt", text: "Klopfen Sie bitte laut an die Tür und rufen Sie {ihn} beim Namen – hören Sie etwas?" };
  let mitAnl = l?.ereignisse.find((x) => !x.eingetreten && x.mitAnleitung && (!x.variante || x.variante === l.fall?.variante))?.mitAnleitung?.typ;
  // Reanimation erst im Kreislaufstillstand, Seitenlage erst bei Bewusstlosigkeit – nicht schon vorher
  if (mitAnl === "reanimation" && a.at !== "keine" && a.at !== "agonal") mitAnl = undefined;
  if (mitAnl === "seitenlage" && a.bw !== "nein") mitAnl = undefined;
  const thema = sz?.thema ?? "";
  let typ =
    a.at === "keine" || a.at === "agonal"
      ? "reanimation"
      : a.bw === "nein"
        ? "seitenlage"
        : (mitAnl ??
          ({ ersticken: "fremdkoerper", atemnot: "oberkoerper_hoch", blutung: "druck_blutung", schnitt: "druck_blutung", schwangerschaft: "geburt", geburt: "geburt", verkehrsunfall: "absichern", diabetes: "zucker", zucker: "zucker", sturz: "nicht_bewegen", ruecken: "nicht_bewegen", psych: "kontakt" } as Record<string, string>)[thema] ??
          "tuer");
  // wer noch kräftig hustet, soll husten – Rückenschläge erst, wenn es nicht mehr geht
  if (typ === "fremdkoerper" && a.atemweg === "teilweise") typ = "husten";
  if (typ === "fremdkoerper" && (e.wahr.patientAlter ?? 50) < 2) typ = "fremdkoerper_kind";
  if (/hyperventil/i.test(sz?.vorlage ?? "")) typ = "beruhigen";
  if (typ === "tuer" && (allein || !imHaus(e))) typ = imHaus(e) ? "dableiben" : "einweisen";
  if (typ === "absichern" && w.anrufer.typ !== "lenker") typ = "absichern_fuss";
  const wohnlich = ["wohnung", "haus"].includes(sz?.ortArt ?? "wohnung");
  if (selbst)
    return {
      typ,
      text:
        ANWEISUNG_SELBST[typ] ??
        (wohnlich ? (allein ? "Sperren Sie bitte schon die Wohnungstür auf, wenn Sie können, und setzen Sie sich dann hin." : "Schicken Sie bitte jemanden zur Tür, der die Rettung hereinlässt, und setzen Sie sich hin.") : "Bleiben Sie bitte, wo Sie sind, und setzen Sie sich hin."),
    };
  let text = pick(ANWEISUNG[typ] ?? ANWEISUNG.tuer);
  if (typ === "oberkoerper_hoch" && !imHaus(e)) text = text.replace(/ und öffnen Sie ein Fenster/, "");
  return { typ, text };
}

/** Freie Fragen (klein, ohne Fragezeichen – so wie man schnell tippt) */
const FREI = ["seit wann ist das so", "wann hat das angefangen", "wie lange geht das schon", "nimmt {er} regelmäßig medikamente", "hat {er} vorerkrankungen", "wie heißt {er} eigentlich", "was hat {er} zuletzt gemacht bevor das passiert ist", "ist sonst noch wer bei ihnen"];
const FREI_SELBST = ["seit wann haben sie das", "wann hat das angefangen", "nehmen sie regelmäßig medikamente", "haben sie vorerkrankungen", "ist jemand bei ihnen"];

function zusammenfassung(a: Antworten, g: "m" | "w" | null, selbst: boolean, falsch: boolean): string {
  // wer selbst redet, ist wach – „Sie reagieren nicht“ wäre absurd; falsch ist dann nur die Atmung
  const bw = falsch && !selbst ? (a.bw === "ja" ? "nein" : "ja") : selbst ? undefined : a.bw;
  const at = falsch ? (a.at === "normal" ? "abnorm" : "normal") : a.at;
  const teile: string[] = [];
  if (bw === "ja") teile.push(selbst ? "Sie sind wach" : "{er} ist wach");
  else if (bw === "nein") teile.push(selbst ? "Sie reagieren nicht" : "{er} reagiert nicht");
  const subjekt = teile.length ? "" : selbst ? "Sie " : "{er} ";
  if (at === "normal") teile.push(`${subjekt}${selbst ? "atmen normal" : "atmet normal"}`);
  else if (at === "abnorm") teile.push(`${subjekt}${selbst ? "kriegen schlecht Luft" : "kriegt schlecht Luft"}`);
  if (!teile.length) return "";
  return mitPronomen(`Also: ${teile.join(" und ")}, richtig?`, g);
}

/** Was an einer Antwort auffällt (für die Übersicht) */
function pruefeAntwort(e: Einsatz, frage: string, antwort: string, art: string, frueher: string[], quelle: string, dauer: number, profi: boolean, schilderung: boolean): string[] {
  const g: string[] = [];
  if (!antwort.trim()) return ["leere Antwort"];
  if (quelle !== "ki" && !/^\(|^Mmh … ich/.test(antwort)) g.push("feste Antwort statt KI (KI-Fehler?)");
  if (!profi && !e.wahr.abfrage?.anrufer.selbst && /\b(der Patient|die Patientin|den Patienten|dem Patienten)\b/.test(antwort)) g.push("sagt „der Patient“");
  if (/Hinweis|Fallakte|WAS WIRKLICH|Leitstelle:|\[/.test(antwort)) g.push("Anweisung an die KI durchgerutscht");
  const n = saetze(antwort).length;
  if (n > 3 || antwort.split(/\s+/).length > 45) g.push(`lang (${n} Sätze)`);
  // bei Kollaps, Atemnot & Co. IST der Zustand die Schilderung – dort nicht melden
  const zustandIstThema = /bewusstlos|stillstand|kollaps|atemnot|ersticken|hyperventil|krampf/.test(`${e.wahr.abfrage?.szenario?.thema ?? ""} ${e.wahr.abfrage?.szenario?.vorlage ?? ""}`);
  if (schilderung && !profi && !zustandIstThema && /\b(atmet|atmen|bewusst|reagiert|jahre alt)\b/i.test(antwort)) g.push("verrät bei „Was ist passiert?“ schon den Zustand");
  const w = (t: string) => t.toLowerCase().replace(/[^a-zäöüß ]/g, " ").split(/\s+/).filter((x) => x.length > 3);
  const aw = w(antwort);
  const fw = new Set(w(frage));
  // nur echte Echos: die Frage wörtlich zurück (ohne Ja/Nein/neue Angabe) – „Er atmet ganz normal“ auf „Atmet er normal?“ ist eine gute Antwort
  const neu = aw.filter((x) => !fw.has(x));
  if (art === "frage" && aw.length >= 3 && neu.length === 0 && !/\b(ja|nein|na|jo|nicht|net|kein\w*|\d+)\b/i.test(antwort)) g.push("wiederholt bloß die Frage");
  // nach der Adresse darf man zweimal fragen
  // Zustand nach „Wie geht's jetzt?“ oder beim Richtigstellen einer Zusammenfassung zu wiederholen, ist normal
  const zustandsfrage = /wie geht|wie schaut|was sehen|wie ist es jetzt|bringt das was|wird es besser|^also:/i.test(frage.trim());
  if (!zustandsfrage && !/adresse|notfallort|wo genau/i.test(frage) && saetze(antwort).some((s) => schonGesagt(s, frueher))) g.push("sagt etwas zum zweiten Mal");
  if (art === "mitteilung" && /\b(atmet|bewusst|reagiert)\b/.test(antwort)) g.push("zählt bei einer Mitteilung den Zustand auf");
  if (dauer > 20000) g.push(`langsam (${Math.round(dauer / 1000)} s)`);
  return g;
}

/** Ein Notruf: Fragen stellen, Antworten holen, prüfen */
async function einGespraech(auftrag: TestAuftrag, nr: number, abbruch: { ja: boolean }, live: (z: string) => void): Promise<Durchlauf | null> {
  const schema = store.schema as Schema | null;
  if (!schema) throw new Error("Kein Abfrageschema geladen");
  const start = Date.now();
  const e = await sim.probeFall(auftrag.fallId, auftrag.variante);
  const w = e?.wahr.abfrage;
  if (!e || !e.anruf || !w) return null;
  const a = e.anruf;
  a.status = "aktiv";
  a.kapitel = w.kapitel;
  a.antworten = {};
  const eingetragen = a.antworten;
  const selbst = !!w.anrufer.selbst;
  const profi = w.anrufer.persona?.wissen === "profi";
  const auff: Auffaellig[] = [];
  const zeiten: number[] = [];
  let fragen = 0;
  const g = () => (eingetragen.geschlecht === "m" || eingetragen.geschlecht === "w" ? (eingetragen.geschlecht as "m" | "w") : null);
  const frag = async (text: string, sf?: Frage): Promise<string> => {
    if (abbruch.ja) return "";
    a.gespraech.push({ zeit: sim.state.zeit, echt: Date.now(), von: "leitstelle", text, wer: "Testlauf" });
    sim.testAnleitung(e, text);
    live(`Leitstelle: ${text}`);
    const k = kontext(e);
    if (!k) return "";
    const frueher = a.gespraech.filter((m) => m.von === "anrufer").map((m) => m.text);
    const quelle = { wert: "ki" as "ki" | "fest" };
    const t0 = Date.now();
    const ant = await anruferAntwort(e, k, text, sf, undefined, quelle);
    const dauer = Date.now() - t0;
    zeiten.push(dauer);
    fragen++;
    a.gespraech.push({ zeit: sim.state.zeit, echt: Date.now(), von: "anrufer", text: ant, quelle: quelle.wert });
    live(`Anrufer: ${ant}`);
    const art = sf ? "frage" : nachrichtArt(text);
    for (const grund of pruefeAntwort(e, text, ant, art, frueher, quelle.wert, dauer, profi, sf?.id === "schilderung" || /passiert/.test(text))) auff.push({ frage: text, antwort: ant, grund });
    return ant;
  };
  const global = (id: string): Frage | undefined => Object.values(schema.globale_fragen).flat().find((f) => f.id === id);
  const sprich = (f: Frage) => sprechFrage(f, schema, eingetragen);

  // 1) Adresse (fehlt die Gemeinde, wird nachgefragt)
  const ersteAntwort = await frag(ERÖFFNUNG);
  const strasse = (e.meldung.adresse.split(",")[0] ?? "").split(/\s+/).find((x) => x.length > 3)?.toLowerCase() ?? "";
  const gemeinde = (e.meldung.adresse.split(",").pop() ?? "").replace(/^\s*\d{4}\s*/, "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (w.ortUnbekannt) await frag("Ich orte Sie gerade. Was sehen Sie in der Nähe – Straße, Ortstafel, Gebäude?");
  else if (strasse && !ersteAntwort.toLowerCase().includes(strasse)) {
    const zweite = await frag(pick(["Wie lautet die genaue Adresse?", "wo genau ist das, welche adresse", "Ja, Sie sind beim Notruf. Wo ist der Notfallort?"]));
    if (gemeinde && !zweite.toLowerCase().includes(gemeinde)) await frag("Und in welchem Ort?");
  } else if (gemeinde && !ersteAntwort.toLowerCase().includes(gemeinde)) await frag(pick(["In welchem Ort?", "und welcher ort"]));
  // 2) Grundfragen – „Wer ruft an“ trägt der Calltaker ein (danach wird ein Selbst-Anrufer mit „Sie“ gefragt)
  const gestellt = new Set<string>(["ort_adresse"]);
  for (const id of ["schilderung", "anrufer"]) {
    const f = global(id);
    if (!f) continue;
    gestellt.add(id);
    await frag(sprich(f), f);
    if (id === "anrufer") eingetragen.anrufer = w.anrufer.anruferWert;
  }
  // 3) Fragen des Kapitels (wie die Abfrage sie zeigt; Antworten aus der Wahrheit eintragen)
  const wahr = { ...(w.szenario?.zusatz ?? {}), ...w.antworten } as Antworten;
  const thema = w.szenario?.thema ?? "";
  // Fragen, die ein Calltaker hier nicht stellen würde
  const ueberspringen = (f: Frage) =>
    (f.id === "geschlecht" && /schwanger|geburt/.test(thema)) ||
    (/polizei/i.test(f.text) && w.anrufer.art !== "polizei") ||
    (selbst && ["bw", "geschlecht", "anzahl_patienten", "hautfarbe"].includes(f.id));
  for (let i = 0; i < 16 && !abbruch.ja; i++) {
    const f = fragenImAblauf(schema, w.kapitel, eingetragen)
      .map((x) => x.frage)
      .find((x) => !gestellt.has(x.id) && !istInterneFrage(x) && x.typ !== "text" && x.typ !== "kapitelwahl");
    if (!f) break;
    gestellt.add(f.id);
    if (!ueberspringen(f)) await frag(sprich(f), f);
    if (wahr[f.id] !== undefined && wahr[f.id] !== null) eingetragen[f.id] = wahr[f.id];
  }
  // 4) eine frei getippte Frage, eine Zusammenfassung (manchmal absichtlich falsch), eine Mitteilung
  await frag(mitPronomen(pick(selbst ? FREI_SELBST : FREI), g()));
  const zf = zusammenfassung(eingetragen, g(), selbst, Math.random() < 0.35);
  if (zf) await frag(zf);
  await frag(pick(["Die Rettung ist schon unterwegs.", "Okay, ich schicke Ihnen die Rettung, sie ist schon auf dem Weg.", "der rettungsdienst ist unterwegs"]));
  // 5) Anweisung, Nachfrage (nur nach einer Maßnahme, die etwas bewirken soll), Verlauf
  const anw = anweisungWaehlen(e, selbst);
  await frag(mitPronomen(anw.text, g()));
  let wirkung = "";
  if (WIRKT.has(anw.typ) || anw.typ === "reanimation") wirkung = await frag(mitPronomen(selbst ? "Und – wird es besser?" : anw.typ === "reanimation" ? "Gut so, weiter drücken. Wie schaut's aus?" : pick(["Und, bringt das was?", "Wie geht's {ihm} jetzt?", "was sehen sie jetzt"]), g()));
  // Husten bringt nichts mehr → Rückenschläge (beim Kleinkind über dem Unterarm)
  if (anw.typ === "husten" && /nicht mehr|kaum|nix|nichts|schlechter|schwerer|blau|bitte/i.test(wirkung)) {
    await frag(mitPronomen(ANWEISUNG[(e.wahr.patientAlter ?? 50) < 2 ? "fremdkoerper_kind" : "fremdkoerper"][0], g()));
    await frag(mitPronomen("Und – ist es draußen? Kriegt {er} Luft?", g()));
  }
  let kritisch = w.antworten.bw === "nein" || w.antworten.at === "keine" || w.antworten.at === "agonal" || /schwanger|geburt|ersticken/.test(thema);
  if (!abbruch.ja && sim.testEreignis(e)) {
    const m = a.gespraech[a.gespraech.length - 1];
    if (m) live(`(Verlauf) ${m.von === "system" ? "" : "Anrufer: "}${m.text}`);
    const jetzt = e.wahr.abfrage!.antworten;
    const stillstand = jetzt.at === "keine" || jetzt.at === "agonal";
    kritisch = kritisch || stillstand || jetzt.bw === "nein";
    if (selbst && (jetzt.bw === "nein" || stillstand)) await frag("Hallo? Hören Sie mich? Hallo?");
    else if (stillstand) {
      // Wechsel zur Reanimation – wie ein Calltaker es macht
      await frag(mitPronomen("Hören Sie mir zu: Legen Sie {ihn} auf den Rücken und drücken Sie fest in die Mitte des Brustkorbs, zweimal pro Sekunde. Zählen Sie laut mit.", g()));
      await frag("Gut so, nicht aufhören. Wie schaut's aus?");
    } else if (/schwanger|geburt/.test(thema)) {
      const baby = await frag(pick(["Wie schaut das Baby aus?", "Was ist mit dem Baby?"]));
      if (/schlaff|schreit nicht|blau|bewegt sich nicht|atmet nicht/i.test(`${baby} ${m?.text ?? ""}`)) {
        await frag("Trocknen Sie das Baby sofort mit einem Handtuch kräftig ab, reiben Sie ihm den Rücken und halten Sie es warm. Atmet es?");
      } else await frag("Legen Sie das Baby der Mutter auf den Bauch und decken Sie beide gut zu. Die Nabelschnur lassen Sie, wie sie ist.");
    } else if (jetzt.bw === "nein") {
      // nach einer Wiederbelebung bzw. bei Bewusstlosigkeit: Seitenlage, nichts zu trinken
      await frag(mitPronomen(`${anw.typ === "reanimation" ? "Hören Sie auf zu drücken. " : ""}Drehen Sie {ihn} bitte in die stabile Seitenlage und geben Sie {ihm} nichts zu trinken. Atmet {er}?`, g()));
    }
    else await frag(mitPronomen(pick(["Okay. Wie geht's {ihm} jetzt?", "Was sehen Sie jetzt?", "Und, wie ist es jetzt?"]), g()));
  }
  // 6) Ende – in Lebensgefahr bleibt die Leitstelle am Telefon
  if (kritisch) await frag(selbst ? "Ich bleibe am Telefon, die Rettung ist gleich da." : mitPronomen("Ich bleibe bei Ihnen am Telefon, bis die Rettung da ist. Machen Sie weiter wie besprochen.", g()));
  else if (w.szenario?.ohneSicht) await frag("Bleiben Sie bitte vor der Tür und gehen Sie nicht allein hinein – Rettung und Polizei sind unterwegs. Auf Wiederhören.");
  else await frag(mitPronomen(selbst ? "Gut, die Rettung ist gleich bei Ihnen. Auf Wiederhören." : "Gut, die Rettung ist gleich bei Ihnen. Bleiben Sie bei {ihm}. Auf Wiederhören.", g()));
  a.status = "beendet";
  const fall = fallVorlage(auftrag.fallId);
  const p = w.anrufer.persona;
  const fallName = fall?.name ?? auftrag.fallId;
  const datei = `${String(nr).padStart(3, "0")}_${auftrag.fallId}_${auftrag.variante}.md`;
  const kopf = [
    `# Testlauf ${nr}: ${fallName} – Ausgang ${auftrag.variante}`,
    "",
    `- Anrufer: ${w.anrufer.rolle}${p ? ` · ${p.stil} · Einstieg ${p.einstieg} · Wissen ${p.wissen}` : ""} · ${w.anrufer.emotion} · ${w.anrufer.sprache}`,
    `- Fragen: ${fragen} · Dauer: ${Math.round((Date.now() - start) / 1000)} s · Antwortzeit Ø ${zeiten.length ? (zeiten.reduce((x, y) => x + y, 0) / zeiten.length / 1000).toFixed(1) : "–"} s`,
    "",
    "## Auffällig",
    "",
    ...(auff.length ? auff.map((x) => `- **${x.grund}** – auf „${x.frage}“: „${x.antwort}“`) : ["- nichts"]),
    "",
    "---",
    "",
  ];
  return {
    nr,
    fallId: auftrag.fallId,
    fallName,
    variante: auftrag.variante,
    rolle: w.anrufer.rolle,
    persona: p ? `${p.stil}, ${p.einstieg}, ${p.wissen}` : "–",
    fragen,
    dauerMs: Date.now() - start,
    antwortMs: zeiten,
    auffaellig: auff,
    datei,
    text: kopf.join("\n") + rdExportText(e),
  };
}

// ------------------------------------------------------------------ Krankentransport und Überstellung

/** Aufträge für Krankentransporte bzw. Überstellungen */
export function ktAuftraege(art: "kt" | "sek", anzahl: number): TestAuftrag[] {
  return Array.from({ length: anzahl }, () => ({ fallId: art, variante: "–", art }));
}

/** Rückfrage der Hotline, manchmal absichtlich falsch (andere Uhrzeit oder Transportart) */
function ktRueckfrage(k: KtAuftrag, falsch: boolean): string {
  const w = k.wahr.d;
  const zeit = w.abholung ?? w.termin;
  const lage = w.lage === "liegend" ? "liegend" : w.lage === "rollstuhl" ? "im eigenen Rollstuhl" : "sitzend";
  const welcherFehler = Math.random() < 0.5 && zeit ? "zeit" : "lage";
  const z = zeit ? hhmm(falsch && welcherFehler === "zeit" ? zeit + 45 * 60_000 : zeit) : null;
  const l = falsch && welcherFehler === "lage" ? (w.lage === "liegend" ? "sitzend" : "liegend") : lage;
  const ziel = (w.nach?.label ?? "").split(",")[0];
  return `Also: ${w.patient.name}${z ? `, Abholung um ${z}` : ""}${ziel ? `, nach ${ziel}` : ""}, ${l}${w.begleitung ? ", mit Begleitung" : ""} – passt das so?`;
}

/** Ein Anruf an der KT-Hotline: Fragen wie im Spiel, Antworten der KI, Prüfung gegen die Wahrheit */
async function einKtGespraech(art: "kt" | "sek", nr: number, abbruch: { ja: boolean }, live: (z: string) => void): Promise<Durchlauf | null> {
  const start = Date.now();
  const k = await sim.probeKt(art);
  if (!k || !k.anruf) return null;
  const a = k.anruf;
  a.status = "aktiv";
  const auff: Auffaellig[] = [];
  const zeiten: number[] = [];
  let fragen = 0;
  const profi = /pflege|ärzt|arzt|station|assistent|ordination|heim/i.test(k.wahr.anrufer.rolle);
  const frag = async (text: string, f?: KtFrage): Promise<string> => {
    if (abbruch.ja) return "";
    a.gespraech.push({ zeit: sim.state.zeit, echt: Date.now(), von: "leitstelle", text, wer: "Testlauf" });
    live(`Hotline: ${text}`);
    const frueher = a.gespraech.filter((m) => m.von === "anrufer").map((m) => m.text);
    const t0 = Date.now();
    const { antwort, quelle, korrigiert } = await ktAntwort(k, text, f);
    const dauer = Date.now() - t0;
    zeiten.push(dauer);
    fragen++;
    a.gespraech.push({ zeit: sim.state.zeit, echt: Date.now(), von: "anrufer", text: antwort, quelle });
    live(`Anrufer: ${antwort}`);
    const gruende = [...ktPruefen(k, text, antwort)];
    if (korrigiert) gruende.push(`Transportart verdreht – vom Programm ersetzt (KI sagte: „${korrigiert}“)`);
    else if (quelle !== "ki") gruende.push("feste Antwort statt KI (KI-Fehler?)");
    const n = saetze(antwort).length;
    if (n > 3 || antwort.split(/\s+/).length > 45) gruende.push(`lang (${n} Sätze)`);
    if (/Hinweis|Leitstelle:|\[/.test(antwort)) gruende.push("Anweisung an die KI durchgerutscht");
    if (!/^also/i.test(text) && !/nummer|wo |abgeholt|wohin/i.test(text) && saetze(antwort).some((x) => schonGesagt(x, frueher))) gruende.push("sagt etwas zum zweiten Mal");
    if (!profi && !ktSelbst(k) && /\b(der Patient|die Patientin)\b/.test(antwort) && !/patient/i.test(text)) gruende.push("sagt „der Patient“");
    if (dauer > 20000) gruende.push(`langsam (${Math.round(dauer / 1000)} s)`);
    for (const grund of gruende) auff.push({ frage: text, antwort, grund });
    return antwort;
  };
  const kf = (id: KtFrage["id"]) => KT_FRAGEN.find((f) => f.id === id)!;
  const sek = !!k.wahr.d.sek;
  // kurz halten: eine Zeitfrage, eine Sammelfrage für Besonderheiten (spart KI-Zeit; einzeln nur ab und zu)
  const zeitId: KtFrage["id"] = k.wahr.d.abholung ? "abholung" : "termin";
  for (const id of ["wer", "patient", "grund", "von", zeitId, "nach", "lage"] as KtFrage["id"][]) await frag(kf(id).text, kf(id));
  if (Math.random() < 0.75) await frag(kf("zusatz").text, kf("zusatz"));
  else for (const id of ["begleitung", "sauerstoff", "infektion"] as KtFrage["id"][]) await frag(kf(id).text, kf(id));
  if (sek) {
    await frag(kf("sofort").text, kf("sofort"));
    await frag(kf("zustand").text, kf("zustand"));
    await frag(kf("zusage").text, kf("zusage"));
  }
  if (Math.random() < 0.3) await frag(kf("telefon").text, kf("telefon"));
  // frei getippt, Rückfrage (manchmal falsch), Mitteilung, Abschluss
  const er = k.wahr.d.patient.geschlecht === "w" ? "sie" : "er";
  await frag(pick(["um wie viel uhr ist der termin nochmal", `kann ${er} selber ein paar schritte gehen`, "fährt jemand mit", "wie schreibt sich der nachname", sek ? `wie geht es ${er === "sie" ? "der patientin" : "dem patienten"} gerade` : `hat ${er} die e-card dabei`]));
  await frag(ktRueckfrage(k, Math.random() < 0.35));
  const kommt = (k.wahr.d.abholung ?? sim.state.zeit + 40 * 60_000);
  await frag(pick(["Gut, ich habe den Transport eingetragen.", `Der Wagen kommt so gegen ${hhmm(kommt)}.`, "Es kann sein, dass es ein bisschen später wird – wir melden uns, falls sich etwas ändert."]));
  await frag("Danke, auf Wiederhören.");
  a.status = "beendet";
  const name = sek ? "Überstellung" : "Krankentransport";
  const datei = `${String(nr).padStart(3, "0")}_${art}_${(k.wahr.d.code ?? "ohne").replace(/[^\w-]+/g, "_")}.md`;
  const kopf = [
    `# Testlauf ${nr}: ${name} – ${k.wahr.d.code ?? "ohne Code"}`,
    "",
    `- Anrufer: ${k.wahr.anrufer.rolle} (${k.wahr.anrufer.name})`,
    `- Fragen: ${fragen} · Dauer: ${Math.round((Date.now() - start) / 1000)} s · Antwortzeit Ø ${zeiten.length ? (zeiten.reduce((x, y) => x + y, 0) / zeiten.length / 1000).toFixed(1) : "–"} s`,
    "",
    "## Auffällig",
    "",
    ...(auff.length ? auff.map((x) => `- **${x.grund}** – auf „${x.frage}“: „${x.antwort}“`) : ["- nichts"]),
    "",
    "---",
    "",
  ];
  return {
    nr,
    fallId: art,
    fallName: name,
    variante: k.wahr.d.code ?? "–",
    rolle: k.wahr.anrufer.rolle,
    persona: profi ? "Profi" : ktSelbst(k) ? "Patient selbst" : "Laie",
    fragen,
    dauerMs: Date.now() - start,
    antwortMs: zeiten,
    auffaellig: auff,
    datei,
    text: kopf.join("\n") + ktExportText(k),
  };
}

function uebersicht(liste: Durchlauf[], abgebrochen: boolean): string {
  const z = [`# LeitWerk – Testlauf der Notrufgespräche`, "", `- Programmversion: ${document.getElementById("app-version")?.textContent?.trim() ?? "?"}`, `- KI: ${kiPrefs().modell}`, `- Datum: ${new Date().toLocaleString("de-AT")}`, `- Gespräche: ${liste.length}${abgebrochen ? " (abgebrochen)" : ""}`];
  const alleZeiten = liste.flatMap((x) => x.antwortMs);
  if (alleZeiten.length) z.push(`- Antwortzeit Ø ${(alleZeiten.reduce((a, b) => a + b, 0) / alleZeiten.length / 1000).toFixed(1)} s, längste ${(Math.max(...alleZeiten) / 1000).toFixed(1)} s`);
  const zaehl = new Map<string, number>();
  for (const d of liste) for (const x of d.auffaellig) {
    const k = x.grund.replace(/ \(.*\)$/, "");
    zaehl.set(k, (zaehl.get(k) ?? 0) + 1);
  }
  z.push("", "## Auffälligkeiten gesamt", "");
  if (!zaehl.size) z.push("- keine");
  for (const [k, n] of [...zaehl].sort((a, b) => b[1] - a[1])) z.push(`- ${k}: ${n}×`);
  z.push("", "## Alle Gespräche", "", "| Nr | Fall | Ausgang | Anrufer | Art | Fragen | Ø Antwort | Auffällig | Datei |", "|---|---|---|---|---|---|---|---|---|");
  for (const d of liste) {
    const avg = d.antwortMs.length ? (d.antwortMs.reduce((a, b) => a + b, 0) / d.antwortMs.length / 1000).toFixed(1) : "–";
    z.push(`| ${d.nr} | ${d.fallName} | ${d.variante} | ${d.rolle} | ${d.persona} | ${d.fragen} | ${avg} s | ${d.auffaellig.length ? d.auffaellig.map((x) => x.grund).join("; ") : "–"} | ${d.datei} |`);
  }
  return z.join("\n");
}

/** Liste der Aufträge: je Fall die gewählten Ausgänge, jeweils `anzahl` Mal */
export function auftraegeFuer(faelle: FallVorlage[], variante: string | "alle", anzahl: number): TestAuftrag[] {
  const out: TestAuftrag[] = [];
  for (const f of faelle) {
    // „alle“: nur Ausgänge, die von selbst vorkommen (p > 0) – die anderen erreicht man nur über ein Ereignis
    const vs = variante === "alle" ? f.varianten.filter((v) => v.p > 0).map((v) => v.id) : f.varianten.some((v) => v.id === variante) ? [variante] : [];
    for (const v of vs) for (let i = 0; i < anzahl; i++) out.push({ fallId: f.id, variante: v });
  }
  return out;
}

/** Testlauf ohne Oberfläche (auch für automatische Tests) */
export async function testlaufAusfuehren(auftraege: TestAuftrag[], opt: { abbruch: { ja: boolean }; fortschritt?: (fertig: number, gesamt: number, d: Durchlauf | null) => void; live?: (z: string) => void }): Promise<Durchlauf[]> {
  const out: Durchlauf[] = [];
  const lief = sim.state.laeuft && sim.mode !== "client";
  if (lief) sim.pause();
  testlaufStatus.aktiv = true;
  try {
    for (let i = 0; i < auftraege.length && !opt.abbruch.ja; i++) {
      let d: Durchlauf | null = null;
      try {
        d = auftraege[i].art
          ? await einKtGespraech(auftraege[i].art!, out.length + 1, opt.abbruch, opt.live ?? (() => {}))
          : await einGespraech(auftraege[i], out.length + 1, opt.abbruch, opt.live ?? (() => {}));
      } catch (err) {
        console.warn("Testlauf", err);
      }
      if (d && !opt.abbruch.ja) out.push(d);
      opt.fortschritt?.(i + 1, auftraege.length, d);
      await pause(10);
    }
  } finally {
    testlaufStatus.aktiv = false;
    if (lief) sim.start();
  }
  return out;
}

export function testlaufDateien(liste: Durchlauf[], abgebrochen: boolean): [string, string][] {
  return [["00_Uebersicht.md", uebersicht(liste, abgebrochen)], ...liste.map((d) => [d.datei, d.text] as [string, string])];
}

// ------------------------------------------------------------------ Oberfläche

/** Fenster: Ausgang und Anzahl wählen, dann läuft alles automatisch durch; am Ende ZIP speichern */
export async function testlaufDialog(fallId: string | null, vorwahl: "notruf" | "kt" | "sek" | "ktsek" | "alles" = "notruf"): Promise<void> {
  if (!kiBereit() && inTauri()) await kiStatus().catch(() => null);
  if (!kiBereit()) {
    toast("Testlauf nur mit KI – bitte zuerst die KI einschalten (Einstellungen → KI-Anrufer)", "error");
    return;
  }
  const fall = fallId ? fallVorlage(fallId) : undefined;
  const faelle = fall ? [fall] : alleFaelle(false).filter((f) => istFallAktiv(f.id));
  const body = el("div", { class: "tl" });
  const wahl = el("div", { class: "tl-wahl" });
  // Was getestet wird (nur bei „Alle testen“ bzw. aus dem KT-Bereich)
  const wasSel = el("select", { class: "tl-was" }) as HTMLSelectElement;
  for (const [v, t] of [
    ["notruf", "Notrufe (alle eingeschalteten Fälle)"],
    ["kt", "Krankentransporte"],
    ["sek", "Überstellungen"],
    ["ktsek", "Krankentransporte und Überstellungen"],
    ["alles", "alles: Notrufe, Krankentransporte, Überstellungen"],
  ] as const)
    wasSel.appendChild(el("option", { value: v }, t));
  wasSel.value = vorwahl;
  const was = () => (fall ? "notruf" : wasSel.value);
  const mitNotruf = () => was() === "notruf" || was() === "alles";
  const vSel = el("select") as HTMLSelectElement;
  vSel.appendChild(el("option", { value: "alle" }, "alle Ausgänge"));
  if (fall) for (const v of fall.varianten) vSel.appendChild(el("option", { value: v.id }, `nur Ausgang ${v.id}${v.lage ? ` – ${v.lage.slice(0, 50)}` : ""}`));
  const n = el("input", { type: "number", min: "1", max: "100", value: "10", class: "fe-zahl" }) as HTMLInputElement;
  const info = el("p", { class: "muted small" });
  const vLabel = el("label", {}, "Ausgang");
  const nLabel = el("label", {}, "Wie oft je Ausgang");
  const bauen = (): TestAuftrag[] => {
    const anzahl = Math.max(1, Math.min(100, Number(n.value) || 1));
    const w = was();
    return [
      ...(mitNotruf() ? auftraegeFuer(faelle, vSel.value, anzahl) : []),
      ...(["kt", "ktsek", "alles"].includes(w) ? ktAuftraege("kt", anzahl) : []),
      ...(["sek", "ktsek", "alles"].includes(w) ? ktAuftraege("sek", anzahl) : []),
    ];
  };
  const schaetzen = () => {
    const l = bauen();
    const notrufe = l.filter((x) => !x.art).length;
    const kts = l.length - notrufe;
    // Notruf ≈ 18 KI-Antworten, KT ≈ 12 – fast die ganze Zeit rechnet die KI
    const min = Math.max(1, Math.round((notrufe * 45 + kts * 30) / 60));
    const max = Math.max(2, Math.round((notrufe * 120 + kts * 80) / 60));
    vLabel.hidden = vSel.hidden = !mitNotruf();
    nLabel.textContent = mitNotruf() ? (was() === "alles" ? "Wie oft (je Ausgang bzw. Anzahl Transporte)" : "Wie oft je Ausgang") : "Wie viele Anrufe";
    info.textContent = `${l.length} Gespräche${notrufe && kts ? ` (${notrufe} Notrufe, ${kts} Transporte)` : ""} · grob ${min}–${max} Minuten (je nach Rechner). Es wird nichts vorgelesen und nichts kommt ins Spiel; das Spiel ist so lange pausiert.`;
  };
  vSel.addEventListener("change", schaetzen);
  wasSel.addEventListener("change", schaetzen);
  n.addEventListener("input", schaetzen);
  if (!fall) wahl.append(el("label", {}, "Was"), wasSel);
  wahl.append(vLabel, vSel, nLabel, n);
  body.append(el("p", {}, fall ? `Fall „${fall.name ?? fall.id}“ automatisch durchspielen.` : "Notrufe, Krankentransporte und Überstellungen automatisch durchspielen."), wahl, info);
  schaetzen();
  const lauf = el("div", { class: "tl-lauf" });
  lauf.hidden = true;
  const balken = el("div", { class: "tl-balken" });
  const fuell = el("div", { class: "tl-fuell" });
  balken.appendChild(fuell);
  const stand = el("div", { class: "tl-stand" });
  const liveBox = el("div", { class: "tl-live" });
  lauf.append(stand, balken, liveBox);
  body.appendChild(lauf);
  const abbruch = { ja: false };
  let laeuft = false;
  const d = openDialog({
    title: fall ? "Testlauf" : "Testlauf",
    body,
    wide: true,
    actions: [
      {
        label: "Abbrechen",
        onClick: () => {
          if (laeuft) {
            abbruch.ja = true;
            stand.textContent = "Wird nach dem laufenden Satz abgebrochen …";
            return false;
          }
        },
      },
      {
        label: "▶ Starten",
        kind: "primary",
        onClick: () => {
          const auftraege = bauen();
          if (mitNotruf() && !store.schema) {
            toast("Kein Abfrageschema geladen – Notrufe lassen sich nicht testen", "error");
            return false;
          }
          if (!auftraege.length) {
            toast("Keine Gespräche gewählt", "error");
            return false;
          }
          laeuft = true;
          wahl.hidden = true;
          info.hidden = true;
          lauf.hidden = false;
          d.setActionEnabled(1, false);
          const t0 = Date.now();
          const fortschritt = (fertig: number, gesamt: number, x: Durchlauf | null) => {
            fuell.style.width = `${(fertig / gesamt) * 100}%`;
            const rest = fertig ? ((Date.now() - t0) / fertig) * (gesamt - fertig) : 0;
            stand.textContent = `${fertig} von ${gesamt} Gesprächen fertig${fertig < gesamt ? ` · noch etwa ${Math.max(1, Math.round(rest / 60000))} min` : ""}${x ? ` · zuletzt: ${x.fallName} ${x.variante} (${x.auffaellig.length} auffällig)` : ""}`;
          };
          stand.textContent = `0 von ${auftraege.length} Gesprächen fertig`;
          const live = (z: string) => {
            const p = el("div", {}, z);
            liveBox.appendChild(p);
            while (liveBox.children.length > 8) liveBox.firstElementChild?.remove();
          };
          void testlaufAusfuehren(auftraege, { abbruch, fortschritt, live }).then((liste) => {
            laeuft = false;
            d.close();
            ergebnisDialog(liste, abbruch.ja);
          });
          return false;
        },
      },
    ],
  });
}

function ergebnisDialog(liste: Durchlauf[], abgebrochen: boolean): void {
  const body = el("div", { class: "tl" });
  const auff = liste.reduce((s, x) => s + x.auffaellig.length, 0);
  body.innerHTML = `<p>${abgebrochen ? "Abgebrochen – " : ""}${liste.length} Gespräche fertig, ${auff} auffällige Antworten.</p><p class="muted small">Speichere den ZIP-Ordner und schick ihn zum Auswerten. Drin: <b>00_Uebersicht.md</b> und je Gespräch ein Gesprächsexport.</p>`;
  const top = new Map<string, number>();
  for (const d of liste) for (const x of d.auffaellig) top.set(x.grund.replace(/ \(.*\)$/, ""), (top.get(x.grund.replace(/ \(.*\)$/, "")) ?? 0) + 1);
  if (top.size) {
    const ul = el("ul", { class: "small" });
    for (const [k, v] of [...top].sort((a, b) => b[1] - a[1]).slice(0, 8)) ul.appendChild(el("li", {}, `${k}: ${v}×`));
    body.appendChild(ul);
  }
  openDialog({
    title: "Testlauf fertig",
    body,
    actions: [
      { label: "Schließen" },
      {
        label: "ZIP speichern …",
        kind: "primary",
        onClick: async () => {
          if (!liste.length) {
            toast("Keine Gespräche zum Speichern", "error");
            return false;
          }
          const name = `leitwerk-testlauf-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.zip`;
          try {
            const p = await saveZipFile(name, testlaufDateien(liste, abgebrochen));
            if (!p) return false;
            toast(`${liste.length} Gespräche gespeichert`);
          } catch (err) {
            toast(`Speichern fehlgeschlagen: ${String((err as Error).message ?? err)}`, "error");
            return false;
          }
        },
      },
    ],
  });
}
