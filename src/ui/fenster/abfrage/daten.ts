/**
 * Daten und Aktionen für das Abfrage-Fenster aus dem Spiel (statt der Beispiele im Entwurf).
 *
 * Anrufe kommen aus allen Einsätzen und KT-Aufträgen (klingelt, im Gespräch, gehalten). Die Abfrage wird als Liste
 * von Schritten geliefert – jeder Schritt hat eine Art wie im Entwurf (wahl · mehr · eingabe · ort · kapitel),
 * seine Antwort (undefined = noch offen) und die Aktionen, die die Antwort ins Spiel schreiben:
 * Notruf → Abfrageschema (abfrageSetze/abfrageExtra/aktualisiere), KT und SEK → Auftragsdaten (ktSetze).
 */
import { store } from "../../../data/store";
import { bereicheVon } from "../../../data/model";
import { gesagteAdresse } from "../../../abfrage/adresseGesagt";
import { sprechFrage } from "../../../abfrage/sprechfrage";
import { fragen, kiQuelleVon } from "../../../abfrage/gespraech";
import { kiBereit } from "../../../abfrage/ki";
import { KT_FRAGEN } from "../../../abfrage/ktGespraech";
import { kapitelZuThema } from "../../../abfrage/themen";
import { antwortLabel, bestimmeCode, frageFuer, fragenImAblauf, istKreislaufstillstand, stufeRang, stufeVonCode, type Frage, type Schema, type Wert } from "../../../abfrage/schema";
import { mp } from "../../../net/mehrspieler";
import { sim, infoFreitext, type Anruf, type Einsatz, type SimFahrzeug } from "../../../sim/engine";
import { distanceM, searchAddress, type AddressHit } from "../../../sim/geo";
import { bereichName, EINRICHTUNG_LABEL, KT_BEHANDLUNGEN, KT_KASSEN, KT_TRANSPORTART_LABEL, sekLeer, type KtAuftrag, type KtDaten, type KtLage, type KtOrt, type KtTransportArt, type SekDaten } from "../../../sim/kt";
import { istUeberstellung, ktCode, ktFrageText } from "../../../sim/ktCodes";
import { findCode } from "../../../sim/codes";
import { toast } from "../../dom";
import { gespraechExportieren } from "../../gespraechExport";
import { ktFrageStellen } from "../../ktView";
import { kapitelZumText } from "../../panels/notrufGefuehrt";
import { istGespraechsfuehrer } from "../../panels/notrufAbfrage";
import { liveSammler, liveText } from "../../panels/live";
import { alleAnrufe, angezeigteNummer, istMeins, type AnrufEintrag } from "../../panels/telefon";
export { nehmeIchAn } from "../../panels/telefon";
import { panelZeigen } from "../../ws/arbeitsplatz";
import { karteWaehlen, karteZeigen, waehle } from "../../ws/auswahl";
import { pers } from "../../ws/persoenlich";

export type ArtA = "notruf" | "kt" | "sek";

/** Ein Anruf in der Anrufleiste */
export interface AnrufVM {
  id: string;
  art: ArtA;
  s: "klingelt" | "aktiv" | "gehalten";
  mein: boolean;
  artName: string;
  nummer: string;
  info: string;
  titel: string;
  zeit: string;
  wer: string;
}

export interface Treffer {
  name: string;
  zeile: string;
  rechts?: string;
  typ: "ruf" | "adr" | "org" | "ortung";
  nehmen(): void;
}

/** Ein Schritt der Abfrage (eine Frage) */
export interface Schritt {
  id: string;
  teil: string;
  text: string;
  typ: "wahl" | "mehr" | "eingabe" | "ort" | "kapitel";
  hinweis?: string;
  /** Anzeige der Antwort; undefined = noch offen, null = ausgelassen */
  antwort: string | null | undefined;
  optionen: string[];
  an?: number[];
  wert?: string;
  zahl?: boolean;
  platz?: string;
  ortPlatz?: string;
  kapPlatz?: string;
  waehlen(i: number): void;
  umschalten(i: number): void;
  mehrFertig(): void;
  eingeben(t: string): boolean | void;
  einfuegen?(): string;
  treffer(q: string): { gruppen: { t: string; items: Treffer[] }[]; laedt: boolean };
  kapitel(q: string): { nr: string; t: string; titel?: string; an?: boolean }[];
  kapitelNehmen(nr: string, q: string): void;
  karte?(): Promise<boolean>;
  ortung?: { text: string; titel: string; aus: boolean; wichtig: boolean; klick(): void } | null;
  stellen?: (() => void) | null;
}

export interface GespraechVM {
  id: string;
  art: ArtA;
  artName: string;
  nummer: string;
  anrufInfo: string;
  dauer: string;
  /** darf ich die Abfrage führen? / läuft das Gespräch gerade (nicht gehalten)? */
  darf: boolean;
  aktiv: boolean;
  gehaltenText: string;
  code: string;
  codeName: string;
  codeLeer: boolean;
  stand: string;
  codeTitel: string;
  codeKlick(): void;
  alarme: { text: string; knopf?: string; klick?: () => void }[];
  schritte: Schritt[];
  msgs: { von: "ls" | "anr" | "sys"; wer: string; t: string; x: string; live?: boolean }[];
  kiText: string;
  kiTitel: string;
  mitExport: boolean;
  exportieren(): void;
  infoAuto: string;
  infoText: string;
  infoSetzen(t: string): void;
  ziel: string;
  zielEinsatz: string;
  zur(): void;
}

const ART_NAME: Record<ArtA, string> = { notruf: "Notruf 144", kt: "KT-Hotline", sek: "Überstellung" };

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function uhrzeit(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function km(m: number): string {
  return m < 950 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m / 1000).toLocaleString("de-AT")} km`;
}

function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/str\.?(?=\s|$)/g, "strasse");
}

/** Netzbetreiber aus der Vorwahl (nur Anzeige) – erfundene Namen, keine echten Anbieter */
const NETZ: [RegExp, string][] = [
  [/^0664/, "Alpennetz"],
  [/^0676|^0650/, "Donaufunk"],
  [/^0699|^0660/, "Weitblick Mobil"],
  [/^0680|^0681|^0688/, "Kleinnetz / sonstige"],
];
function quelleText(tel: string): string {
  const mobil = /^06/.test(tel.replace(/\s/g, ""));
  if (!mobil) return "Festnetz";
  return `Mobil · ${NETZ.find(([r]) => r.test(tel.replace(/\s/g, "")))?.[1] ?? "Mobilfunk"}`;
}

// ---------------------------------------------------------------- lokale Merker (nur in diesem Fenster)

/** bestätigte Antworten, die im Spiel keinen eigenen Wert haben („keine Aufwertung“, „nichts davon“ …) */
const bestaetigt = new Map<string, Map<string, string>>();
function best(id: string): Map<string, string> {
  let m = bestaetigt.get(id);
  if (!m) bestaetigt.set(id, (m = new Map()));
  return m;
}

/** Ergebnisse der Ortssuche (asynchron) – nach dem Eintreffen wird neu gezeichnet */
const suchCache = new Map<string, { hits: AddressHit[]; fertig: boolean }>();
let neuZeichnen: () => void = () => {};
export function beiSuchErgebnis(f: () => void): void {
  neuZeichnen = f;
}
function adressSuche(q: string): { hits: AddressHit[]; fertig: boolean } {
  const key = q.trim().toLowerCase();
  if (key.length < 2) return { hits: [], fertig: true };
  let c = suchCache.get(key);
  if (!c) {
    c = { hits: [], fertig: false };
    suchCache.set(key, c);
    if (suchCache.size > 80) suchCache.delete(suchCache.keys().next().value!);
    const eintrag = c;
    // kurz warten: beim Tippen nicht jeden Buchstaben suchen
    window.setTimeout(() => {
      if (suchCache.get(key) !== eintrag) return;
      searchAddress(q, 8)
        .then((h) => (eintrag.hits = h))
        .catch(() => (eintrag.hits = []))
        .finally(() => {
          eintrag.fertig = true;
          neuZeichnen();
        });
    }, 220);
  }
  return c;
}

/** Einrichtungen (Krankenhäuser mit Stationen, Orte wie Pflegeheim, Ordination …) */
interface Einr {
  name: string;
  zeile: string;
  such: string;
  ort: KtOrt;
}
let einrCache: { n: number; l: Einr[] } | null = null;
function einrichtungen(): Einr[] {
  const khs = store.list("hospitals");
  const pois = store.list("pois");
  const n = khs.length * 100000 + pois.length;
  if (einrCache?.n === n) return einrCache.l;
  const l: Einr[] = [];
  for (const h of khs) {
    const name = h.kurzname || h.name;
    const ortTxt = h.ort && !name.includes(h.ort) ? h.ort : "";
    const basis = norm(`${name} ${h.name} ${h.ort ?? ""}`);
    l.push({ name, zeile: [ortTxt, "Krankenhaus"].filter(Boolean).join(" · "), such: basis, ort: { lat: h.lat, lon: h.lon, label: name, khId: h.id } });
    for (const b of bereicheVon(h))
      l.push({
        name: `${name} · Station: ${bereichName(b)}`,
        zeile: [ortTxt, "Krankenhaus"].filter(Boolean).join(" · "),
        such: `${basis} ${norm(bereichName(b))} ${norm(b)}`,
        ort: { lat: h.lat, lon: h.lon, label: `${name}, ${bereichName(b)}`, khId: h.id, bereich: b },
      });
  }
  for (const p of pois) {
    const einr = EINRICHTUNG_LABEL[p.typ.split(",")[0]];
    l.push({ name: p.name, zeile: [p.ort, einr ?? p.typ.split(",")[0]].filter(Boolean).join(" · "), such: norm(`${p.name} ${p.ort ?? ""}`), ort: { lat: p.lat, lon: p.lon, label: `${p.name}${p.ort ? `, ${p.ort}` : ""}`, ...(einr ? { einrichtung: einr } : {}) } });
  }
  einrCache = { n, l };
  return l;
}
function einrSuche(q: string, nurKh: boolean, max = 6): Einr[] {
  const w = norm(q).split(/[\s,·]+/).filter(Boolean);
  if (!w.length || norm(q).length < 3) return [];
  return einrichtungen()
    .filter((e) => (!nurKh || e.ort.khId) && w.every((x) => e.such.includes(x)))
    .slice(0, max);
}

// ---------------------------------------------------------------- Anrufe

function ichName(): string {
  return sim.ich?.name ?? mp.ich?.name ?? "Ich";
}

/** Gehört das Gespräch mir? (angenommen von mir; gehalten: von mir gehalten) */
export function istMeinGespraech(a: Anruf): boolean {
  return !!a.angenommenVon && istMeins(a);
}

function beginn(a: Anruf): number {
  const m = a.gespraech.find((x) => x.von === "system" && /angenommen|Rückruf/.test(x.text)) ?? a.gespraech[0];
  return m?.zeit ?? a.seit;
}

export function anrufListe(): AnrufVM[] {
  const t = sim.state.zeit;
  const l = alleAnrufe().filter((x) => x.anruf.status === "klingelt" || x.anruf.status === "aktiv" || x.anruf.status === "gehalten");
  // Notrufe immer oben, sonst nach Eingang
  l.sort((a, b) => (a.typ === "notruf" ? 0 : 1) - (b.typ === "notruf" ? 0 : 1) || a.anruf.seit - b.anruf.seit);
  return l.map((x) => anrufVM(x, t));
}

function anrufVM(x: AnrufEintrag, t: number): AnrufVM {
  const a = x.anruf;
  const mein = istMeinGespraech(a);
  const s = a.status as AnrufVM["s"];
  const info: string[] = [quelleText(x.telefon)];
  if (x.art === "rd") {
    if (a.folge) info.push(`Folgeanruf · Einsatz ${x.nummer}`);
    else if (a.versuche > 1) info.push(`ruft wieder an (${a.versuche}.)`);
    if (a.ortung?.status === "fertig") info.push(`geortet ±${a.ortung.radius} m`);
  } else {
    if (a.versuche > 1) info.push(`ruft wieder an (${a.versuche}.)`);
    if (x.titel && s !== "klingelt") info.push(x.titel);
  }
  const knapp = s === "gehalten" && a.haltenBis && a.haltenBis - t < 30_000;
  const zeit = s === "klingelt" ? `klingelt ${mmss(t - a.seit)}` : s === "gehalten" ? `gehalten ${mmss(t - a.seit)}${knapp ? " · legt gleich auf" : ""}` : mmss(t - beginn(a));
  const name = a.angenommenVon?.name ?? "";
  const wer = s === "klingelt" ? "" : `${mein ? name || ichName() : name || "jemand"} · ${s === "gehalten" ? "gehalten" : "im Gespräch"}`;
  return { id: x.id, art: x.typ, s, mein, artName: ART_NAME[x.typ], nummer: x.telefon, info: info.join(" · "), titel: `${ART_NAME[x.typ]} · ${x.nummer}`, zeit, wer };
}

// ---------------------------------------------------------------- Stand der Einsatzmittel (Farbe des Code-Kästchens)

const STAND: [string, string][] = [
  ["", "noch nichts alarmiert"],
  ["a", "alarmiert"],
  ["9", "alarmiert und quittiert"],
  ["2", "unterwegs zum Berufungsort"],
  ["3", "am Berufungsort"],
  ["4", "unterwegs zum Zielort"],
  ["5", "am Zielort"],
];
function standVon(fz: SimFahrzeug[]): string {
  const rang: Record<string, number> = { alarmWache: 1, alarmFunk: 1, alarmiert: 2, zumBO: 3, amBO: 4, zumZO: 5, amZO: 6 };
  let r = 0;
  for (const f of fz) r = Math.max(r, rang[f.status] ?? 0);
  return STAND[r][0];
}
function standText(s: string): string {
  return STAND.find((x) => x[0] === s)?.[1] ?? STAND[0][1];
}

// ---------------------------------------------------------------- Gespräch (gemeinsam)

function msgsAus(a: Anruf, id: string): GespraechVM["msgs"] {
  const l: GespraechVM["msgs"] = a.gespraech.map((m) => ({
    von: m.von === "leitstelle" ? "ls" : m.von === "anrufer" ? "anr" : "sys",
    wer: m.von === "leitstelle" ? "Leitstelle" : "Anrufer",
    t: uhrzeit(m.zeit),
    x: m.text,
  }));
  const live = liveText(id);
  if (live) l.push({ von: "anr", wer: "Anrufer", t: uhrzeit(sim.state.zeit), x: live, live: true });
  return l;
}

/** Leerer Schritt (alle Aktionen tun nichts) – Grundlage für die einzelnen Fragen */
function schritt(p: Partial<Schritt> & Pick<Schritt, "id" | "teil" | "text" | "typ" | "antwort">): Schritt {
  return {
    optionen: [],
    waehlen: () => {},
    umschalten: () => {},
    mehrFertig: () => {},
    eingeben: () => {},
    treffer: () => ({ gruppen: [], laedt: false }),
    kapitel: () => [],
    kapitelNehmen: () => {},
    ...p,
  };
}

// ---------------------------------------------------------------- Notruf

/** Fragen nach Bewusstsein und Atmung */
function istBwAt(f: Frage): boolean {
  return f.id === "bw" || f.id === "at" || (f.typ === "single" && /(wach|ansprechbar|bewusst|atmet|atmung)/i.test(f.text));
}
/** „Wer ruft an?“ */
function istWer(f: Frage): boolean {
  return f.typ === "single" && (f.id === "anrufer" || /wer ruft|beim patient|sind sie (selbst|der patient)/i.test(f.text));
}

function notrufGespraech(e: Einsatz): GespraechVM | null {
  const a = e.anruf;
  const schema = store.schema;
  if (!a) return null;
  const t = sim.state.zeit;
  const ich = istGespraechsfuehrer(e);
  const darf = ich && (a.status === "aktiv" || a.status === "gehalten");
  const aktiv = darf && a.status === "aktiv";
  const telefon = angezeigteNummer(e);
  const b = best(e.id);
  const setze = (fid: string, w: Wert) => fehler(sim.call("abfrageSetze", e.id, fid, w));
  const aktualisiere = (p: Partial<Einsatz>) => fehler(sim.call("aktualisiere", e.id, p));
  const l = liveSammler(e.id);
  const stelle = (text: string, f?: Frage) => {
    if (!aktiv) return;
    void fragen(e, text, f, l.onToken)
      .catch((err) => toast(String((err as Error).message ?? err), "error"))
      .finally(() => l.fertig());
  };
  const frageStellen = (f: Frage | null | undefined) => (f ? () => stelle(sprechFrage(f, schema, a.antworten, { erste: !a.gespraech.some((m) => m.von === "leitstelle") }), f) : null);

  const S: Schritt[] = [];
  const ids = new Set<string>();
  const dazu = (s: Schritt) => {
    if (ids.has(s.id)) return;
    ids.add(s.id);
    S.push(s);
  };
  const frageSchritt = (f0: Frage, teil: string) => {
    const f = frageFuer(f0, a.antworten);
    const w = a.antworten[f.id];
    const offen = w === undefined || w === null;
    if (f.typ === "single") {
      const opts = f.optionen ?? [];
      return schritt({
        id: f.id, teil, text: f.text, typ: "wahl", hinweis: f.hinweis ?? undefined,
        antwort: offen ? undefined : antwortLabel(f, w),
        optionen: opts.map((o) => o.label),
        an: opts.map((o, i) => (o.wert === w ? i : -1)).filter((i) => i >= 0),
        waehlen: (i) => opts[i] && setze(f.id, opts[i].wert),
        stellen: frageStellen(f),
      });
    }
    return schritt({
      id: f.id, teil, text: f.text, typ: "eingabe", hinweis: f.hinweis ?? undefined, zahl: f.typ === "zahl",
      antwort: offen ? undefined : antwortLabel(f, w),
      wert: offen ? "" : w === "unbekannt" ? "?" : String(w),
      platz: f.typ === "zahl" ? "Zahl eintippen („?“ = unbekannt) – Enter geht weiter" : "Eintippen – Enter geht weiter",
      eingeben: (txt) => {
        if (f.typ !== "zahl") return void setze(f.id, txt);
        if (/^(\?|unbekannt|weiß nicht|weiss nicht)$/i.test(txt)) return void setze(f.id, "unbekannt");
        const n = Number(txt.replace(",", ".").replace(/[^\d.]/g, ""));
        if (!txt.match(/\d/) || !Number.isFinite(n)) {
          toast("Bitte eine Zahl eintippen („?“ = unbekannt)", "error");
          return false;
        }
        setze(f.id, Math.round(n));
      },
      stellen: frageStellen(f),
    });
  };

  if (schema) {
    const g = schema.globale_fragen;
    const p3 = g.phase_3_was_ist_passiert ?? [];
    const p4 = g.phase_4_primaerabfrage ?? [];
    for (const f of g.phase_1_einsatzort ?? []) {
      if (f.id === "ort_adresse") dazu(ortSchrittNotruf(e, f, stelle, frageStellen(f)));
      else if (f.id === "ort_zusatz" || /zusatz/i.test(f.id))
        dazu(
          schritt({
            id: f.id, teil: "Einsatzort", text: "Stiege, Stock, Tür?", typ: "eingabe",
            antwort: e.zusatz.trim() ? e.zusatz : b.has(f.id) ? null : undefined, wert: e.zusatz,
            platz: "Stiege, Stock, Tür, Zufahrt … – Enter geht weiter",
            eingeben: (txt) => aktualisiere({ zusatz: txt }),
            stellen: frageStellen(f),
          }),
        );
      else dazu(frageSchritt(f, "Einsatzort"));
    }
    for (const f of g.phase_2_rueckruf ?? []) {
      if (f.typ === "text" && (f.id === "rueckrufnummer" || /nummer|rückruf|erreichbar/i.test(f.text)))
        dazu(
          schritt({
            id: f.id, teil: "Rückrufnummer", text: f.text, typ: "eingabe",
            antwort: e.telefon || (a.antworten[f.id] ? String(a.antworten[f.id]) : undefined), wert: e.telefon || "",
            platz: `Nummer eintippen – Einfg setzt die angezeigte ${telefon} ein – Enter geht weiter`,
            einfuegen: () => telefon,
            eingeben: (txt) => {
              aktualisiere({ telefon: txt });
              setze(f.id, txt);
            },
            stellen: frageStellen(f),
          }),
        );
      else dazu(frageSchritt(f, "Rückrufnummer"));
    }
    for (const f of p3.filter(istWer)) dazu(frageSchritt(f, "Anrufer"));
    for (const f of p4.filter(istBwAt)) dazu(frageSchritt(f, "Bewusstsein und Atmung"));
    for (const f of p3) if (!istWer(f) && f.typ !== "text" && f.typ !== "kapitelwahl") dazu(frageSchritt(f, "Was ist passiert?"));
    const was = p3.find((f) => f.typ === "text") ?? null;
    dazu(kapitelSchritt(e, schema, was, frageStellen(was)));
    if (a.kapitel === "42") {
      dazu(code42Schritt(e, schema, aktiv ? () => stelle("Welches Einsatzmittel brauchen Sie, und wohin?") : null));
    } else if (a.kapitel) {
      for (const { phase, frage } of fragenImAblauf(schema, a.kapitel, a.antworten)) {
        if (ids.has(frage.id)) continue;
        dazu(frageSchritt(frage, phase === "Primärabfrage" ? "Primärabfrage" : `Kapitel ${a.kapitel} · ${schema.kapitel[a.kapitel]?.titel ?? phase}`));
      }
      for (const s of abschlussSchritte(e, schema)) dazu(s);
    }
  }

  // Code und Stand der Fahrzeuge
  const erg = a.ergebnis;
  const code = e.code || erg?.code || "";
  const c = code ? schema?.codes[code] : null;
  const eigener = !!erg && e.codeQuelle === "dispo" && !!e.code && e.code !== erg.code;
  const fz = e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f): f is SimFahrzeug => !!f && f.einsatzId === e.id);
  const stand = standVon(fz);
  const zur = () => waehle("einsatz", e.id, { karte: true });

  // Hinweise
  const alarme: GespraechVM["alarme"] = [];
  if (schema && istKreislaufstillstand(a.antworten) && a.kapitel !== kapitelZuThema("stillstand", schema)) {
    const kap = kapitelZuThema("stillstand", schema);
    alarme.push({
      text: "Bewusstlos und keine Atmung: Kreislaufstillstand – Reanimation anleiten!",
      ...(kap && schema.kapitel[kap] && darf ? { knopf: `Kapitel ${kap} wählen`, klick: () => setze("kapitel", kap) } : {}),
    });
  } else if (erg?.reanimation) alarme.push({ text: "Reanimation anleiten! Herzdruckmassage, 100–120/min" });

  const q = kiQuelleVon(e.id);
  const kiText = !q ? "" : q.art === "gemini" ? "Anrufer: Gemini" : q.art === "lokal" ? (q.ersatz ? "⚠ Anrufer: lokale KI" : "Anrufer: lokale KI") : q.ersatz ? "⚠ einfache Antworten" : "einfache Antworten";
  const kiTitel = !q ? "" : q.ersatz ? `Gemini ist gerade nicht erreichbar (${q.ersatz}) – der Anrufer antwortet ${q.art === "lokal" ? "mit der lokalen KI" : "mit einfachen Sätzen"}.` : q.art === "gemini" ? "Der Anrufer spricht über Gemini (Cloud)." : q.art === "lokal" ? "Der Anrufer spricht über die lokale KI." : "Keine KI bereit – der Anrufer antwortet mit einfachen Sätzen.";

  const auto = e.infoAuto ?? "";
  const o = a.ortung;
  const info = [quelleText(telefon), o?.status === "fertig" ? `geortet ±${o.radius} m${o.art ? ` (${o.art})` : ""}` : o?.status === "laeuft" ? "Ortung läuft …" : "", ({ dialekt: "Dialekt", gebrochen: "gebrochenes Deutsch" } as Record<string, string>)[e.wahr.abfrage?.anrufer.sprache ?? ""] ?? ""].filter(Boolean);
  return {
    id: e.id,
    art: "notruf",
    artName: ART_NAME.notruf,
    nummer: telefon,
    anrufInfo: info.join(" · "),
    dauer: mmss(t - beginn(a)),
    darf,
    aktiv,
    gehaltenText: `Gehalten – der Anrufer hört die Warteschleife${a.haltenBis ? ` · legt in ca. ${mmss(a.haltenBis - t)} auf` : ""}`,
    code: code || "kein Code",
    codeName: code ? (c?.name || findCode(code)?.beschreibung || "") : "",
    codeLeer: !code,
    stand,
    codeTitel: code
      ? `${eigener ? "Selbst gewählter" : erg && !a.kapitel ? "Code" : "Vorläufiger"} Code ${code}${c?.name ? ` – ${c.name}` : ""}${c?.kategorie ? ` (${c.kategorie})` : ""} · Einsatzmittel: ${standText(stand)}${eigener ? ` · Die Abfrage ergibt ${erg!.code} – Klick übernimmt ihn` : " · Klick: zur RD-Übersicht"}`
      : "Der Code ergibt sich aus der Abfrage, sobald das Kapitel gewählt ist",
    codeKlick: () => (eigener ? fehler(sim.call("abfrageCode", e.id)) : zur()),
    alarme,
    schritte: S,
    msgs: msgsAus(a, e.id),
    kiText,
    kiTitel,
    mitExport: pers().exportKnopf !== false,
    exportieren: () => void gespraechExportieren("rd", e.id),
    infoAuto: auto,
    infoText: infoFreitext(e.infoRtw, auto),
    infoSetzen: (txt) => {
      const frei = txt.trim();
      const wert = auto ? (frei ? `${auto} // ${frei}` : auto) : frei;
      if (wert !== e.infoRtw) aktualisiere({ infoRtw: wert });
    },
    ziel: "RD-Übersicht",
    zielEinsatz: `Einsatz ${e.nummer}`,
    zur,
  };
}

/** Einsatzort: eine Suchzeile für Adressen und Einrichtungen, dazu die Handy-Ortung */
function ortSchrittNotruf(e: Einsatz, f: Frage, _stelle: unknown, stellen: (() => void) | null): Schritt {
  const a = e.anruf!;
  const nehmen = (o: { lat: number; lon: number; label: string }) => {
    fehler(sim.call("aktualisiere", e.id, { adresse: { lat: o.lat, lon: o.lon, label: o.label } }));
    karteZeigen(o.lat, o.lon, 15);
  };
  const o = a.ortung;
  const bezug = o?.status === "fertig" && o.lat != null && o.lon != null ? { lat: o.lat, lon: o.lon } : null;
  const ab = (p: { lat: number; lon: number }) => (bezug ? km(distanceM(bezug, p)) : "");
  return schritt({
    id: f.id,
    teil: "Einsatzort",
    text: "Wo genau ist der Notfallort?",
    hinweis: undefined,
    typ: "ort",
    antwort: e.adresse?.label,
    ortPlatz: "Adresse oder Einrichtung eintippen, z. B. „wiener str 12 krems“ – Enter übernimmt",
    stellen,
    treffer: (q) => {
      const gruppen: { t: string; items: Treffer[] }[] = [];
      const ruf: Treffer[] = [];
      // was der Anrufer gesagt hat (als Adresse gesucht)
      const gesagt = gesagteAdresse(e.meldung.adresse, a.gespraech.filter((m) => m.von === "anrufer").map((m) => m.text));
      if (gesagt && !q.trim()) {
        const r = adressSuche(gesagt);
        const h = r.hits[0];
        if (h) ruf.push({ name: h.label, zeile: `vom Anrufer genannt: „${gesagt}“`, rechts: ab(h), typ: "ruf", nehmen: () => nehmen(h) });
      }
      if (o?.status === "fertig" && o.lat != null && o.lon != null && !q.trim()) {
        const lat = o.lat, lon = o.lon;
        ruf.push({ name: `Handy-Ortung ±${o.radius} m`, zeile: `${o.art ?? "Ortung"} · ${lat.toFixed(5)}, ${lon.toFixed(5)}`, typ: "ortung", nehmen: () => nehmen({ lat, lon, label: `Ortung ±${o.radius} m (${lat.toFixed(5)}, ${lon.toFixed(5)})` }) });
      }
      if (ruf.length) gruppen.push({ t: "Vom Anrufer genannt", items: ruf });
      let laedt = false;
      if (q.trim()) {
        const r = adressSuche(q);
        laedt = !r.fertig;
        const einr = einrSuche(q, false);
        const namen = new Set(einr.map((x) => norm(x.ort.label)));
        const adr = r.hits.filter((h) => !namen.has(norm(h.label)));
        gruppen.push({ t: "Adressen", items: adr.map((h) => ({ name: h.label, zeile: h.place ? "Ort" : [h.postcode, h.city].filter(Boolean).join(" ") || "Adresse", rechts: ab(h), typ: "adr" as const, nehmen: () => nehmen(h) })) });
        gruppen.push({ t: "Einrichtungen", items: einr.map((x) => ({ name: x.name, zeile: x.zeile, rechts: ab(x.ort), typ: "org" as const, nehmen: () => nehmen(x.ort) })) });
      }
      return { gruppen, laedt };
    },
    karte: async () => {
      const pkt = await karteWaehlen("Einsatzort anklicken");
      if (!pkt) return false;
      fehler(sim.call("aktualisiere", e.id, { adresse: { ...pkt, label: `Koordinate ${pkt.lat.toFixed(5)}, ${pkt.lon.toFixed(5)}` } }));
      return true;
    },
    ortung: {
      text: o?.status === "laeuft" ? "Ortung läuft …" : o?.status === "fertig" ? "Neu orten" : "Handy-Ortung",
      titel: "Handy-Ortung anfordern (Standort aus dem Netz)",
      aus: a.status !== "aktiv" || o?.status === "laeuft" || !istGespraechsfuehrer(e),
      wichtig: !!e.wahr.abfrage?.ortUnbekannt && !o,
      klick: () => fehler(sim.call("ortung", e.id)),
    },
  });
}

/** „Was ist passiert?“ – Kapitel über Nummer oder Stichwort */
function kapitelSchritt(e: Einsatz, schema: Schema, was: Frage | null, stellen: (() => void) | null): Schritt {
  const a = e.anruf!;
  const K = a.kapitel ? schema.kapitel[a.kapitel] : null;
  const txt = was ? a.antworten[was.id] : null;
  return schritt({
    id: "__was",
    teil: "Was ist passiert?",
    text: "Was ist genau passiert?",
    hinweis: "Kapitel (Hauptbeschwerde) wählen",
    typ: "kapitel",
    antwort: a.kapitel ? `${a.kapitel} · ${K?.titel ?? ""}${txt ? ` – „${txt}“` : ""}` : undefined,
    stellen,
    kapitel: (q) => {
      const s = q.trim();
      const alle = Object.values(schema.kapitel);
      let l: { kapitel: string; titel: string }[];
      if (!s) l = alle;
      else if (/^\d+$/.test(s)) l = alle.filter((k) => k.kapitel.startsWith(s));
      else {
        const n = norm(s);
        const punkte = kapitelZumText(schema, s);
        const titel = alle.filter((k) => norm(k.titel).includes(n) && !punkte.some((p) => p.kapitel === k.kapitel));
        l = [...punkte.map((p) => ({ kapitel: p.kapitel, titel: p.titel })), ...titel].slice(0, 12);
      }
      return l.map((k) => ({ nr: k.kapitel, t: k.titel, titel: schema.kapitel[k.kapitel]?.stichworte.join(", ") ?? "", an: a.kapitel === k.kapitel }));
    },
    kapitelNehmen: (nr, q) => {
      const t = q.trim();
      if (was && t && !/^\d+$/.test(t)) fehler(sim.call("abfrageSetze", e.id, was.id, t));
      fehler(sim.call("abfrageSetze", e.id, "kapitel", nr));
    },
  });
}

/** Anforderung durch andere Leitstelle: keine Abfrage, nur den Code wählen */
function code42Schritt(e: Einsatz, schema: Schema, stellen: (() => void) | null): Schritt {
  const codes = Object.entries(schema.codes).filter(([, c]) => c.kapitel.startsWith("42 ") || c.kapitel.startsWith("42-"));
  return schritt({
    id: "__code42",
    teil: "Code wählen (Anforderung durch andere Leitstelle)",
    text: "Welcher Code?",
    hinweis: "Keine Abfrage bei Anforderung durch eine andere Leitstelle",
    typ: "kapitel",
    kapPlatz: "Code oder Stichwort tippen – Enter wählt den ersten Treffer",
    antwort: e.code ? `${e.code} ${schema.codes[e.code]?.name ?? ""}` : undefined,
    stellen,
    kapitel: (q) => {
      const n = norm(q.trim());
      return codes.filter(([code, c]) => !n || norm(`${code} ${c.name} ${c.kategorie}`).includes(n)).map(([code, c]) => ({ nr: code, t: `${c.name} · ${c.kategorie}`, an: e.code === code }));
    },
    kapitelNehmen: (nr) => fehler(sim.call("aktualisiere", e.id, { code: nr })),
  });
}

/** Aufwertung, Zusatzkennung, Polizei */
function abschlussSchritte(e: Einsatz, schema: Schema): Schritt[] {
  const a = e.anruf!;
  const b = best(e.id);
  const K = a.kapitel ? schema.kapitel[a.kapitel] : null;
  if (!K) return [];
  const out: Schritt[] = [];
  const erg = bestimmeCode(schema, a.kapitel!, a.antworten);
  const extra = (p: Partial<Anruf["extra"]>) => fehler(sim.call("abfrageExtra", e.id, p));
  if (K.aufwertung && Object.keys(K.aufwertung).length) {
    const jetzt = erg ? stufeVonCode(erg.determinante, schema) : "";
    const stufen = Object.keys(K.aufwertung).filter((st) => stufeRang(st, schema) > stufeRang(jetzt, schema));
    if (stufen.length) {
      const w = a.extra.aufwertung;
      out.push(
        schritt({
          id: "__aufwertung", teil: "Abschluss", text: "Muss aufgewertet werden?", typ: "wahl",
          hinweis: "Aufwertung und Zusatzkennung ergeben sich aus den Antworten",
          antwort: w ? `Aufwerten auf ${w}` : b.has("__aufwertung") ? "keine Aufwertung" : undefined,
          optionen: ["keine Aufwertung", ...stufen.map((s) => `Aufwerten auf ${s}`)],
          an: [w ? stufen.indexOf(w) + 1 : b.has("__aufwertung") ? 0 : -1].filter((i) => i >= 0),
          waehlen: (i) => {
            b.set("__aufwertung", "1");
            extra({ aufwertung: i === 0 ? null : stufen[i - 1] });
          },
        }),
      );
    }
  }
  const zus = erg ? (K.zusatzkennungen?.[erg.determinante] ?? []) : [];
  if (zus.length) {
    const w = a.extra.zusatz;
    out.push(
      schritt({
        id: "__zusatz", teil: "Abschluss", text: "Zusatzkennung", typ: "wahl",
        antwort: w ? w : b.has("__zusatz") ? "keine Zusatzkennung" : undefined,
        optionen: ["keine Zusatzkennung", ...zus],
        an: [w ? zus.indexOf(w) + 1 : b.has("__zusatz") ? 0 : -1].filter((i) => i >= 0),
        waehlen: (i) => {
          b.set("__zusatz", "1");
          extra({ zusatz: i === 0 ? null : zus[i - 1] });
        },
      }),
    );
  }
  if (K.polizei_kennung && Object.keys(K.polizei_kennung).length) {
    const w = a.extra.polizei;
    out.push(
      schritt({
        id: "__polizei", teil: "Abschluss", text: "Braucht es die Polizei?", typ: "wahl",
        antwort: w ? "ja" : b.has("__polizei") ? "nein" : undefined,
        optionen: ["nein", "ja"],
        an: [w ? 1 : b.has("__polizei") ? 0 : -1].filter((i) => i >= 0),
        waehlen: (i) => {
          b.set("__polizei", "1");
          extra({ polizei: i === 1 });
        },
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------- KT-Hotline und Überstellung

/** Uhrzeit (14:30, 1430, 14.30, 14) in Simulationszeit: heute, oder morgen, wenn sie schon lange vorbei ist */
function zeitAus(txt: string): number | null {
  const m = txt.trim().match(/^(\d{1,2})(?:[:.h ]?(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const d = new Date(sim.state.zeit);
  d.setHours(h, min, 0, 0);
  let t = d.getTime();
  if (t < sim.state.zeit - 6 * 3_600_000) t += 24 * 3_600_000;
  return t;
}
function hm(t: number | null | undefined): string {
  return t ? new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }) : "";
}

/** Adresse oder Krankenhaus, das der Anrufer im Gespräch schon genannt hat */
function genanntKt(k: KtAuftrag, wo: "von" | "nach"): KtOrt | null {
  const o = k.wahr?.d?.[wo];
  if (!o) return null;
  const gesagt = (k.anruf?.gespraech ?? []).filter((m) => m.von === "anrufer").map((m) => norm(m.text)).join(" ");
  if (o.khId) {
    const h = store.list("hospitals").find((x) => x.id === o.khId);
    if (!h) return null;
    const namen = [h.kurzname, h.ort, h.name].filter(Boolean).map((x) => norm(x!));
    return namen.some((n) => n.length >= 4 && gesagt.includes(n.replace(/^(lk|uk|kh)\s+/, ""))) ? { lat: h.lat, lon: h.lon, label: h.kurzname || h.name, khId: h.id } : null;
  }
  const strasse = norm(o.label.split(",")[0].replace(/\s*\d.*$/, "").trim());
  return strasse && gesagt.includes(strasse) ? o : null;
}

function ktGespraech(k: KtAuftrag, x: AnrufEintrag): GespraechVM | null {
  const a = k.anruf;
  if (!a) return null;
  const t = sim.state.zeit;
  const sek = istUeberstellung(k.d) || !!k.wahr?.d?.sek;
  const art: ArtA = sek ? "sek" : "kt";
  const ich = istMeinGespraech(a) && (sim.mode === "solo" || a.angenommenVon?.pid === (sim.ich?.pid ?? mp.ich.pid));
  const darf = ich && (a.status === "aktiv" || a.status === "gehalten") && ["aufnahme", "offen", "vorgemerkt"].includes(k.status);
  const aktiv = darf && a.status === "aktiv";
  const d = k.d;
  const b = best(k.id);
  const setze = (p: Partial<KtDaten>) => fehler(sim.call("ktSetze", k.id, p));
  const s0: SekDaten = d.sek ?? sekLeer();
  const setzeSek = (p: Partial<SekDaten>) => setze({ sek: { ...s0, ...p } });
  /** Frage aus dem KT-Codesatz stellen (Text des Codesatzes, sonst der eingebaute) */
  const frage = (feld: string | null, eigen?: string) => {
    const f = feld ? KT_FRAGEN.find((y) => y.id === feld) : undefined;
    const text = (feld ? ktFrageText(feld) : null) ?? eigen ?? f?.text;
    if (!text) return null;
    return () => {
      if (aktiv) void ktFrageStellen(k, text, f);
    };
  };
  const wahl = (id: string, teil: string, text: string, optionen: string[], an: number, setzen: (i: number) => void, feld: string | null, hinweis?: string, eigen?: string) =>
    schritt({
      id, teil, text, typ: "wahl", hinweis,
      antwort: an >= 0 ? optionen[an] : undefined,
      optionen,
      an: an >= 0 ? [an] : [],
      waehlen: (i) => {
        b.set(id, optionen[i]);
        setzen(i);
      },
      stellen: frage(feld, eigen),
    });
  const ortSchritt = (wo: "von" | "nach", teil: string, text: string): Schritt => {
    const wert = d[wo];
    const anderer = wo === "nach" ? d.von : d.nach;
    const ab = (p: { lat: number; lon: number }) => (anderer ? km(distanceM(anderer, p)) : "");
    const nehmen = (o: KtOrt) => {
      setze({ [wo]: o } as Partial<KtDaten>);
      karteZeigen(o.lat, o.lon, 15);
    };
    return schritt({
      id: wo, teil, text, typ: "ort",
      antwort: wert ? (wert.einrichtung ? `${wert.label} (${wert.einrichtung})` : wert.label) : undefined,
      ortPlatz: sek ? "Krankenhaus oder Station eintippen, z. B. „horn intensiv“ – Enter übernimmt" : "Adresse oder Einrichtung eintippen, z. B. „lk horn dialyse“ – Enter übernimmt",
      stellen: frage(wo),
      treffer: (q) => {
        const gruppen: { t: string; items: Treffer[] }[] = [];
        const g = genanntKt(k, wo);
        if (g && !q.trim()) gruppen.push({ t: "Vom Anrufer genannt", items: [{ name: g.label, zeile: g.khId ? "vom Anrufer genannt · Krankenhaus" : "vom Anrufer genannt", rechts: ab(g), typ: "ruf", nehmen: () => nehmen(g) }] });
        let laedt = false;
        if (q.trim()) {
          const einr = einrSuche(q, false, 8);
          if (!sek || !einr.some((x) => x.ort.khId)) {
            const r = adressSuche(q);
            laedt = !r.fertig;
            const namen = new Set(einr.map((x) => norm(x.ort.label)));
            gruppen.push({
              t: "Adressen",
              items: r.hits.filter((h) => !namen.has(norm(h.label))).map((h) => ({ name: h.label, zeile: h.place ? "Ort" : [h.postcode, h.city].filter(Boolean).join(" ") || "Adresse", rechts: ab(h), typ: "adr" as const, nehmen: () => nehmen({ lat: h.lat, lon: h.lon, label: h.label, ...(einrBei(h) ? { einrichtung: einrBei(h)! } : {}) }) })),
            });
          }
          gruppen.push({ t: "Einrichtungen", items: einr.map((x) => ({ name: x.name, zeile: x.zeile, rechts: ab(x.ort), typ: "org" as const, nehmen: () => nehmen(x.ort) })) });
        }
        return { gruppen, laedt };
      },
      karte: async () => {
        const pkt = await karteWaehlen(wo === "von" ? "Abholort anklicken" : "Zielort anklicken");
        if (!pkt) return false;
        setze({ [wo]: { ...pkt, label: `Koordinate ${pkt.lat.toFixed(5)}, ${pkt.lon.toFixed(5)}` } } as Partial<KtDaten>);
        return true;
      },
      ortung: null,
    });
  };

  const S: Schritt[] = [];
  const anruferSprach = a.gespraech.find((m) => m.von === "anrufer")?.text ?? "";
  S.push(
    schritt({
      id: "wer", teil: sek ? "Anfordernd" : "Anrufer und Patient", text: sek ? "Wer fordert an?" : "Wer spricht, bitte?", typ: "eingabe",
      antwort: b.get("wer") ?? (anruferSprach ? `siehe Gespräch – „${anruferSprach.length > 60 ? `${anruferSprach.slice(0, 57)} …` : anruferSprach}“` : k.quelle !== "hotline" ? "Auftrag ohne Anruf" : undefined),
      wert: b.get("wer") ?? "",
      eingeben: (txt) => void b.set("wer", txt),
      stellen: frage("wer"),
    }),
  );
  S.push(
    schritt({
      id: "pat", teil: sek ? "Patient" : "Anrufer und Patient", text: "Wie heißt der Patient und wie alt ist er?", typ: "eingabe",
      antwort: d.patient.name ? `${d.patient.name}${d.patient.alter !== null ? `, ${d.patient.alter}` : ""}` : undefined,
      wert: d.patient.name ? `${d.patient.name}${d.patient.alter !== null ? `, ${d.patient.alter}` : ""}` : "",
      platz: "Name, Alter – z. B. „Monika Winkler, 81“ – Enter geht weiter",
      eingeben: (txt) => {
        const m = txt.match(/^(.*?)[,\s]+(\d{1,3})\s*(j\.?|jahre)?\s*$/i);
        const name = (m ? m[1] : txt).trim();
        const alter = m ? Number(m[2]) : d.patient.alter;
        setze({ patient: { ...d.patient, name, alter } });
      },
      stellen: frage("patient"),
    }),
  );
  S.push(wahl("geschl", sek ? "Patient" : "Anrufer und Patient", "Geschlecht", ["weiblich", "männlich"], d.patient.geschlecht === "w" ? 0 : d.patient.geschlecht === "m" ? 1 : -1, (i) => setze({ patient: { ...d.patient, geschlecht: i === 0 ? "w" : "m" } }), null, undefined, "Ist der Patient eine Frau oder ein Mann?"));
  S.push(ortSchritt("von", "Abholort", sek ? "Wo wird der Patient abgeholt – Krankenhaus und Station?" : "Wo soll der Patient abgeholt werden?"));
  S.push(ortSchritt("nach", "Zielort", sek ? "Wohin geht die Überstellung – Krankenhaus und Station?" : "Wohin soll der Transport gehen?"));
  if (sek) {
    S.push(wahl("dring", "Dringlichkeit", "Wie dringend ist die Überstellung?", ["geplant", "sofort"], d.sofort ? 1 : b.has("dring") ? 0 : -1, (i) => setze({ sofort: i === 1 }), "sofort"));
    S.push(
      schritt({
        id: "zeit", teil: "Zeit", text: "Wann ist der Patient bereit?", typ: "eingabe", hinweis: "Eine Zeit genügt – Abholzeit",
        antwort: d.abholung ? `${hm(d.abholung)} (Abholzeit)` : d.termin ? `${hm(d.termin)} (Termin)` : undefined,
        wert: hm(d.abholung),
        platz: "Uhrzeit, z. B. „13:20“ – Enter geht weiter",
        eingeben: (txt) => {
          const z = zeitAus(txt);
          if (!z) return toast("Bitte eine Uhrzeit eintippen, z. B. 13:20", "error"), false;
          setze({ abholung: z });
        },
        stellen: frage("abholung"),
      }),
    );
  } else {
    const zeitart = d.zeitVorgabe ?? (d.termin && !d.abholung ? "termin" : d.abholung && !d.termin ? "abholung" : (b.get("zeitart") as "termin" | "abholung" | undefined) ?? null);
    S.push(wahl("zeitart", "Zeit", "Gibt es einen Termin oder eine Abholzeit?", ["Termin", "Abholzeit"], zeitart === "termin" ? 0 : zeitart === "abholung" ? 1 : -1, (i) => b.set("zeitart", i === 0 ? "termin" : "abholung"), null, "Eine Zeit genügt", "Gibt es einen Termin, oder wann soll der Patient abgeholt werden?"));
    const wer: "termin" | "abholung" = zeitart === "abholung" ? "abholung" : "termin";
    const wert = d.zeitVorgabe === wer || !d.zeitVorgabe ? d[wer] : null;
    S.push(
      schritt({
        id: "zeit", teil: "Zeit", text: wer === "termin" ? "Wann ist der Termin?" : "Wann soll der Patient abgeholt werden?", typ: "eingabe",
        antwort: wert ? `${hm(wert)} (${wer === "termin" ? "Termin" : "Abholzeit"})` : undefined,
        wert: hm(wert),
        platz: "Uhrzeit, z. B. „14:30“ – Enter geht weiter",
        eingeben: (txt) => {
          const z = zeitAus(txt);
          if (!z) return toast("Bitte eine Uhrzeit eintippen, z. B. 14:30", "error"), false;
          setze({ [wer]: z } as Partial<KtDaten>);
        },
        stellen: frage(wer),
      }),
    );
  }
  S.push(
    schritt({
      id: "grund", teil: sek ? "Patient" : "Grund", text: sek ? "Diagnose / Grund der Überstellung" : "Was ist der Grund für den Transport?", typ: "eingabe",
      antwort: d.grund || undefined, wert: d.grund,
      eingeben: (txt) => setze({ grund: txt }),
      stellen: frage("grund"),
    }),
  );
  if (sek) {
    const begl = s0.arzt ? 2 : s0.monitoring ? 1 : b.has("begl") ? 0 : -1;
    S.push(wahl("begl", "Medizinisch", "Braucht der Patient eine Notarztbegleitung?", ["keine", "Überwachung", "Notarzt"], begl, (i) => setzeSek({ arzt: i === 2, monitoring: i === 1 }), "arzt"));
    S.push(wahl("stabil", "Medizinisch", "Ist der Patient stabil?", ["stabil", "instabil"], s0.instabil ? 1 : b.has("stabil") ? 0 : -1, (i) => setzeSek({ instabil: i === 1 }), "stabil"));
  }
  // Mehrfachwahl: was während der Fahrt nötig ist
  const mehr: [string, boolean, (v: boolean) => void][] = sek
    ? [
        ["beatmet", s0.beatmet, (v) => setzeSek({ beatmet: v })],
        ["Monitor", s0.monitoring, (v) => setzeSek({ monitoring: v })],
        ["O₂", d.sauerstoff, (v) => setze({ sauerstoff: v })],
        ["Infektion / Isolation", d.infektion, (v) => setze({ infektion: v })],
        ["Inkubator / Kind", s0.inkubator, (v) => setzeSek({ inkubator: v })],
        ["BIT nötig", !!s0.bit, (v) => setzeSek({ bit: v })],
        ["Begleitperson", d.begleitung, (v) => setze({ begleitung: v })],
      ]
    : [
        ["Begleitperson", d.begleitung, (v) => setze({ begleitung: v })],
        ["O₂", d.sauerstoff, (v) => setze({ sauerstoff: v })],
        ["Infektion / Isolation", d.infektion, (v) => setze({ infektion: v })],
      ];
  const gewaehlt = mehr.map(([, v], i) => (v ? i : -1)).filter((i) => i >= 0);
  S.push(
    schritt({
      id: "zus", teil: sek ? "Medizinisch" : "Transport", text: sek ? "Was braucht er während der Fahrt?" : "Gibt es sonst etwas zu beachten?", typ: "mehr", hinweis: "Mehrere möglich",
      antwort: gewaehlt.length ? gewaehlt.map((i) => mehr[i][0]).join(", ") : b.has("zus") ? "nichts" : undefined,
      optionen: mehr.map(([t]) => t),
      an: gewaehlt,
      umschalten: (i) => mehr[i][2](!mehr[i][1]),
      mehrFertig: () => void b.set("zus", "1"),
      stellen: frage(sek ? "zustand" : "zusatz"),
    }),
  );
  const lagen: [KtLage, string][] = sek
    ? [
        ["sitzend", "sitzend"],
        ["liegend", "liegend"],
      ]
    : [
        ["gehend", "gehfähig"],
        ["rollstuhl", "Rollstuhl"],
        ["sitzend", "Tragstuhl"],
        ["liegend", "liegend"],
      ];
  S.push(wahl("lage", "Transport", sek ? "Sitzend oder liegend?" : "Kann der Patient sitzen, oder muss er liegen?", lagen.map(([, l]) => l), lagen.findIndex(([v]) => v === d.lage), (i) => setze({ lage: lagen[i][0] }), "lage"));
  if (!sek) {
    const ta = Object.entries(KT_TRANSPORTART_LABEL) as [KtTransportArt, string][];
    S.push(wahl("ktArt", "Transportdaten", "Welche Transportart?", ta.map(([, l]) => l), ta.findIndex(([v]) => v === d.ktArt), (i) => setze({ ktArt: ta[i][0] }), "ktArt"));
    S.push(wahl("behandlung", "Transportdaten", "Was wird dort gemacht?", KT_BEHANDLUNGEN, d.behandlung ? KT_BEHANDLUNGEN.indexOf(d.behandlung) : -1, (i) => setze({ behandlung: KT_BEHANDLUNGEN[i] }), "behandlung"));
    S.push(wahl("gehfaehig", "Transportdaten", "Kann der Patient bis zum Fahrzeug selbst gehen?", ["gehfähig", "nicht gehfähig"], d.gehfaehig === true ? 0 : d.gehfaehig === false ? 1 : -1, (i) => setze({ gehfaehig: i === 0 }), "gehfaehig"));
    S.push(wahl("transportmittel", "Transportdaten", "Braucht der Patient während der Fahrt Betreuung?", ["einfacher KT", "qualifizierter KT"], d.transportmittel === "einfach" ? 0 : d.transportmittel === "qualifiziert" ? 1 : -1, (i) => setze({ transportmittel: i === 0 ? "einfach" : "qualifiziert" }), "transportmittel"));
    const auftr: ["ja" | "nein" | "einrichtung", string][] = [
      ["ja", "ja"],
      ["nein", "nein"],
      ["einrichtung", "über die Einrichtung"],
    ];
    S.push(wahl("auftrag", "Abrechnung", "Gibt es einen Transportauftrag vom Arzt?", auftr.map(([, l]) => l), auftr.findIndex(([v]) => v === d.auftrag), (i) => setze({ auftrag: auftr[i][0] }), "auftrag"));
  }
  S.push(wahl("kasse", "Abrechnung", "Bei welcher Krankenkasse ist der Patient versichert?", KT_KASSEN, d.kasse ? KT_KASSEN.indexOf(d.kasse) : -1, (i) => setze({ kasse: KT_KASSEN[i] }), "kasse"));
  S.push(
    schritt({
      id: "rueck", teil: "Rückrufnummer", text: "Unter welcher Nummer erreichen wir Sie?", typ: "eingabe",
      antwort: d.telefon || undefined, wert: d.telefon,
      platz: `Nummer eintippen – Einfg setzt die angezeigte ${x.telefon} ein – Enter geht weiter`,
      einfuegen: () => x.telefon,
      eingeben: (txt) => setze({ telefon: txt }),
      stellen: frage("telefon"),
    }),
  );

  const code = d.code ?? "";
  const fz = [k.fz, k.begleit].map((id) => (id ? sim.state.fahrzeuge[id] : null)).filter((f): f is SimFahrzeug => !!f);
  const stand = standVon(fz);
  const ziel = sek ? "SEK-Übersicht" : "KT-Übersicht";
  const zur = () => {
    if (k.status === "aufnahme" && darf) {
      // vollständige Aufnahme gleich als Auftrag anlegen; sonst steht in der Übersicht, was noch fehlt
      sim.call("ktAnlegen", k.id).catch((e) => toast(String((e as Error).message ?? e), "error"));
    }
    waehle("kt", k.id);
    panelZeigen("kt");
  };
  const g = d.patient.geschlecht ?? "";
  const auto = d.patient.alter !== null || g ? `${d.patient.alter ?? ""}${g}` : "";
  return {
    id: k.id,
    art,
    artName: ART_NAME[art],
    nummer: x.telefon,
    anrufInfo: [quelleText(x.telefon), k.quelle !== "hotline" ? "Rückruf zum Auftrag" : a.rueckruf ? "Rückruf" : ""].filter(Boolean).join(" · "),
    dauer: mmss(t - beginn(a)),
    darf,
    aktiv,
    gehaltenText: `Gehalten – der Anrufer hört die Warteschleife${a.haltenBis ? ` · legt in ca. ${mmss(a.haltenBis - t)} auf` : ""}`,
    code: code || "kein Code",
    codeName: code ? (ktCode(code)?.name ?? "") : "",
    codeLeer: !code,
    stand,
    codeTitel: code ? `${d.codeManuell ? "Selbst gewählter" : "Vorläufiger"} Code ${code}${ktCode(code)?.name ? ` – ${ktCode(code)!.name}` : ""} · Einsatzmittel: ${standText(stand)} · Klick: zur ${ziel}` : "Der Code ergibt sich aus den Angaben",
    codeKlick: zur,
    alarme: [],
    schritte: S,
    msgs: msgsAus(a, k.id),
    kiText: kiBereit() ? "Anrufer: KI" : "feste Antworten",
    kiTitel: kiBereit() ? "Der Anrufer antwortet über die KI." : "Keine KI bereit – der Anrufer antwortet mit festen Sätzen.",
    mitExport: pers().exportKnopf !== false,
    exportieren: () => void gespraechExportieren("kt", k.id),
    infoAuto: auto,
    infoText: d.patient.info,
    infoSetzen: (txt) => txt.trim() !== d.patient.info && setze({ patient: { ...d.patient, info: txt.trim() } }),
    ziel,
    zielEinsatz: `Auftrag ${k.nummer}`,
    zur,
  };
}

/** Liegt an der Adresse eine Einrichtung (Ordination, Pflegeheim …)? */
function einrBei(o: { lat: number; lon: number; label: string }): string | null {
  const l = norm(o.label);
  const p = store.list("pois").find((x) => EINRICHTUNG_LABEL[x.typ.split(",")[0]] && distanceM(x, o) < 60 && l.includes(norm(x.name).slice(0, 12)));
  return p ? EINRICHTUNG_LABEL[p.typ.split(",")[0]] : null;
}

/** Gespräch zu einem Anruf (nur meine Gespräche: aktiv oder gehalten) */
export function gespraechZu(id: string): GespraechVM | null {
  const x = alleAnrufe().find((y) => y.id === id);
  if (!x || !istMeinGespraech(x.anruf) || (x.anruf.status !== "aktiv" && x.anruf.status !== "gehalten")) return null;
  if (x.art === "rd") {
    const e = sim.einsatz(id);
    return e ? notrufGespraech(e) : null;
  }
  const k = sim.ktAuftrag(id);
  return k ? ktGespraech(k, x) : null;
}
