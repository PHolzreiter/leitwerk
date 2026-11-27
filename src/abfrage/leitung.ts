/**
 * Telefon-Klang (Paul 27.11.2026, Beta 82): wie der Anrufer über die Leitung klingt und was man im Hintergrund hört.
 *
 * - Leitung je Anrufer: Handy (schmal, verzerrt bei lauten Stellen, Aussetzer – am Land/Berg öfter) oder Festnetz (ruhig, dumpf).
 * - Aussetzer verschlucken Wörter: in der Mitschrift steht dort „…“.
 * - Was im Hintergrund zu hören ist (Umgebung je Ort, Ereignisse je Fall), plant `klangPlan` – abgespielt wird in ui/telefonKlang.ts.
 * Alles nur mit der Cloud-KI (die lokale KI ist nur der Rückfall).
 */
import type { Einsatz } from "../sim/engine";
import { panikStufe } from "./anrufer";

export interface Leitung {
  art: "handy" | "festnetz";
  /** Netzqualität 0 (Funkloch) … 1 (perfekt); Festnetz immer 1 */
  netz: number;
  /** Zufall für diesen Anruf (gleich bei jedem Aufbau) */
  seed: number;
}

/** einfacher, wiederholbarer Zufall */
export function zufallAus(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function hash(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DRAUSSEN = new Set(["strasse", "landstrasse", "autobahn", "feldweg", "wald", "berg", "ufer", "feld", "natur", "wasser", "garten", "sport", "freizeit", "baustelle", "bahnhof", "auto"]);
const ABSEITS = new Set(["wald", "berg", "feld", "feldweg", "ufer", "natur", "wasser"]);

/** Ort des Anrufers (aus dem Szenario) */
export function ortVon(e: Einsatz): string {
  return String(e.wahr.abfrage?.szenario?.ortArt ?? "wohnung");
}

/** Handy oder Festnetz, wie gut das Netz ist – fest je Anruf */
export function leitungFuer(e: Einsatz): Leitung {
  const a = e.wahr.abfrage?.anrufer;
  const seed = hash(`${e.id}|${e.anruf?.versuche ?? 0}`);
  const rnd = zufallAus(seed);
  const ort = ortVon(e);
  const typ = a?.typ ?? "";
  let festnetz = 0;
  if (a?.art === "ecall" || DRAUSSEN.has(ort)) festnetz = 0;
  else if (typ === "pflege" || typ === "arzt" || typ === "ordi" || ort === "pflegeheim" || ort === "arzt") festnetz = 0.85;
  else if (typ === "lehrer" || typ === "verkauf" || typ === "kollege") festnetz = 0.35;
  else if (ort === "wohnung" || ort === "haus") festnetz = Number(e.wahr.abfrage?.szenario?.patient?.alter ?? 0) >= 75 && (a?.selbst || a?.typ === "partner") ? 0.5 : 0.2;
  if (rnd() < festnetz) return { art: "festnetz", netz: 1, seed };
  let netz = 0.88 + (rnd() - 0.5) * 0.2;
  if (ABSEITS.has(ort)) netz = 0.45 + rnd() * 0.3;
  else if (ort === "landstrasse" || ort === "autobahn" || ort === "auto") netz = 0.7 + rnd() * 0.2;
  // ab und zu schlechter Empfang auch im Haus (Keller, dicke Mauern)
  else if (rnd() < 0.12) netz = 0.55 + rnd() * 0.2;
  return { art: "handy", netz: Math.max(0.3, Math.min(1, netz)), seed };
}

// ---------------------------------------------------------------- Stimme über die Leitung

/** Biquad (RBJ) – Hoch- oder Tiefpass */
function koeff(f: number, rate: number, hoch: boolean, q = 0.707): number[] {
  const w = (2 * Math.PI * Math.min(f, rate / 2 - 100)) / rate;
  const a = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const b0 = hoch ? (1 + c) / 2 : (1 - c) / 2;
  const b1 = hoch ? -(1 + c) : 1 - c;
  const a0 = 1 + a;
  return [b0 / a0, b1 / a0, b0 / a0, (-2 * c) / a0, (1 - a) / a0];
}

class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private k: number[]) {}
  schritt(x: number): number {
    const k = this.k;
    const y = k[0] * x + k[1] * this.x1 + k[2] * this.x2 - k[3] * this.y1 - k[4] * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** µ-law (8 bit) wie im Telefonnetz – gibt die typische Körnung */
function mulaw(x: number): number {
  const mu = 255;
  const s = Math.sign(x);
  const y = (s * Math.log1p(mu * Math.abs(x))) / Math.log1p(mu);
  const q = Math.round(y * 127) / 127;
  return (Math.sign(q) * (Math.pow(1 + mu, Math.abs(q)) - 1)) / mu;
}

/**
 * Die Stimme des Anrufers so, wie sie über die Leitung ankommt.
 * Handy: Bandpass 300–3400 Hz, µ-law, Übersteuern bei lauten Stellen, langsam schwankende Lautstärke, Aussetzer
 * (Gilbert-Elliott: kurze Lücken 40–160 ms, bei schlechtem Netz selten lange bis ~0,8 s).
 * Festnetz: 250–2900 Hz (dumpf), ruhig, leises Brummen.
 */
export class LeitungsFilter {
  private hp: Biquad;
  private tp: Biquad;
  private tp2: Biquad;
  private rnd: () => number;
  private gain = 1;
  private gainZiel = 1;
  private schlecht = false;
  private rest = 0;
  private fade = 1;
  private n = 0;
  private lueckeAb = -1;
  private brummPhase = 0;
  /** Beginn der Aussetzer (Sample-Position), die lang genug waren, um ein Wort zu verschlucken */
  readonly luecken: number[] = [];
  constructor(
    private rate: number,
    readonly leitung: Leitung,
  ) {
    const handy = leitung.art === "handy";
    this.hp = new Biquad(koeff(handy ? 300 : 250, rate, true));
    this.tp = new Biquad(koeff(handy ? 3400 : 2900, rate, false));
    this.tp2 = new Biquad(koeff(handy ? 3600 : 3100, rate, false));
    this.rnd = zufallAus(leitung.seed ^ 0x9e3779b9);
  }
  /** wie viele Samples bisher (für die Lage der Aussetzer im Satz) */
  get gesamt(): number {
    return this.n;
  }
  private rahmen(): void {
    const handy = this.leitung.art === "handy";
    // Lautstärke schwankt (Telefon bewegt sich)
    if (handy && this.rnd() < 0.05) this.gainZiel = 0.72 + this.rnd() * 0.35;
    if (!handy || this.leitung.netz >= 0.999) return;
    const q = this.leitung.netz;
    if (this.schlecht) {
      if (--this.rest <= 0) this.schlecht = false;
    } else {
      // Wahrscheinlichkeit je 20 ms: gutes Netz ~ alle 15 s, schlechtes ~ alle 2 s
      const p = 0.0012 + Math.pow(1 - q, 2) * 0.03;
      if (this.rnd() < p) {
        this.schlecht = true;
        const lang = this.rnd() < (1 - q) * 0.35;
        this.rest = lang ? 15 + Math.floor(this.rnd() * 25) : 2 + Math.floor(this.rnd() * 6);
      }
    }
  }
  verarbeiten(f: Float32Array): Float32Array {
    const handy = this.leitung.art === "handy";
    const rahmen = Math.max(1, Math.round(this.rate * 0.02));
    for (let i = 0; i < f.length; i++, this.n++) {
      if (this.n % rahmen === 0) this.rahmen();
      let y = this.tp2.schritt(this.tp.schritt(this.hp.schritt(f[i])));
      this.gain += (this.gainZiel - this.gain) * 0.0005;
      if (handy) {
        // lauter Teil (Schreien) übersteuert
        y = Math.tanh(y * 1.9 * this.gain) / Math.tanh(1.9);
        y = mulaw(y);
      } else {
        this.brummPhase += (2 * Math.PI * 50) / this.rate;
        y = y * 1.05 + Math.sin(this.brummPhase) * 0.0015;
      }
      // Aussetzer weich ein-/ausblenden (4 ms)
      const ziel = this.schlecht ? 0 : 1;
      this.fade += (ziel - this.fade) * Math.min(1, 1 / (this.rate * 0.004));
      if (this.schlecht && this.lueckeAb < 0) this.lueckeAb = this.n;
      if (!this.schlecht && this.lueckeAb >= 0) {
        if (this.n - this.lueckeAb >= this.rate * 0.15) this.luecken.push(this.lueckeAb);
        this.lueckeAb = -1;
      }
      const rausch = (this.rnd() - 0.5) * (handy ? 0.006 : 0.003);
      f[i] = Math.max(-1, Math.min(1, y * this.fade + rausch));
    }
    return f;
  }
}

/**
 * Aussetzer haben Wörter verschluckt: an der passenden Stelle der Mitschrift „…“ (Lage im Satz anteilig).
 * anteile: 0…1 (wo im gesprochenen Satz die Lücke war)
 */
export function verschlucken(text: string, anteile: number[]): string {
  const w = text.split(/\s+/).filter(Boolean);
  if (!w.length || !anteile.length) return text;
  const weg = new Set<number>();
  for (const a of anteile) weg.add(Math.min(w.length - 1, Math.max(0, Math.floor(a * w.length))));
  const aus: string[] = [];
  w.forEach((x, i) => {
    if (!weg.has(i)) return aus.push(x);
    const satzende = /[.!?]$/.exec(x)?.[0] ?? "";
    if (aus[aus.length - 1]?.startsWith("…")) aus[aus.length - 1] = "…" + satzende;
    else aus.push("…" + satzende);
  });
  return aus.join(" ");
}

// ---------------------------------------------------------------- Was man im Hintergrund hört

export type KlangStufe = "aus" | "dezent" | "realistisch";

export interface KlangPlan {
  leitung: Leitung;
  /** Dauergeräusche (Kennungen der Umgebung) */
  umgebung: string[];
  /** einzelne Geräusche mit Gewicht (je höher, desto öfter) */
  ereignisse: [string, number][];
  /** 0 ruhig … 1 außer sich – wie oft/heftig */
  aufregung: number;
  draussen: boolean;
  /** Wetter am Ort (nur draußen hörbar): regen, starkregen, wind, sturm */
  wetter: string[];
}

const REGEN = /regen|niesel|gewitter|hagel|unwetter|schneeregen|eisregen/;

/**
 * Geräusche zum Anruf: Umgebung aus dem Ort, Ereignisse aus Thema, Variante, Patient und Stimmung
 * (ein Fall kann mit `geraeusche` eigene dazugeben).
 */
export function klangPlan(e: Einsatz, wetter?: { lage?: string; wind?: number }): KlangPlan {
  const leitung = leitungFuer(e);
  const rnd = zufallAus(leitung.seed ^ 0x51ed27);
  const ort = ortVon(e);
  const ab = e.wahr.abfrage;
  const a = ab?.anrufer;
  const sz = ab?.szenario;
  const thema = String(sz?.thema ?? "");
  const id = `${e.wahr.lage?.fall?.id ?? ""} ${sz?.vorlage ?? ""}`;
  const text = [...(sz?.geschehen ?? []), ...(sz?.details ?? []), ...(sz?.umgebung ?? []), sz?.hergang ?? ""].join(" ").toLowerCase();
  const alter = Number(sz?.patient?.alter ?? ab?.antworten?.alter ?? 50);
  const draussen = DRAUSSEN.has(ort);
  const umgebung: string[] = [];
  switch (ort) {
    case "wohnung":
    case "haus":
      umgebung.push("raum");
      if (rnd() < 0.3) umgebung.push("fernseher");
      else if (rnd() < 0.2) umgebung.push("uhr");
      break;
    case "pflegeheim":
    case "arzt":
      umgebung.push("raum", "flur");
      break;
    case "strasse":
    case "bahnhof":
      umgebung.push("verkehr");
      break;
    case "landstrasse":
      umgebung.push("verkehr_land");
      break;
    case "autobahn":
      umgebung.push("autobahn");
      break;
    case "auto":
      umgebung.push("auto_innen");
      break;
    case "geschaeft":
      umgebung.push("menge");
      break;
    case "lokal":
      umgebung.push("menge", "geschirr");
      break;
    case "arbeit":
      umgebung.push("maschinen");
      break;
    case "baustelle":
      umgebung.push("baustelle");
      break;
    case "schule":
      umgebung.push("kinder");
      break;
    case "sport":
    case "freizeit":
      umgebung.push("menge_draussen");
      break;
    case "ufer":
    case "wasser":
      umgebung.push("wind", "wasser");
      break;
    default:
      umgebung.push("wind");
      if (ort !== "berg" && rnd() < 0.6) umgebung.push("voegel");
  }
  if (a?.art === "ecall" && !umgebung.includes("auto_innen")) umgebung.push("auto_innen");
  // Wetter hört man nur draußen
  const wt: string[] = [];
  const lage = wetter?.lage ?? "";
  if (draussen && ort !== "auto") {
    if (/starkregen|gewitter|hagel|unwetter/.test(lage)) wt.push("starkregen");
    else if (REGEN.test(lage)) wt.push("regen");
    if ((wetter?.wind ?? 0) >= 45 || /unwetter|gewitter/.test(lage)) wt.push("sturm");
    else if ((wetter?.wind ?? 0) >= 25 && !umgebung.includes("wind")) wt.push("wind");
  } else if (/starkregen|gewitter|hagel|unwetter/.test(lage)) wt.push("regen_drinnen");
  // Ereignisse
  const ev = new Map<string, number>();
  const dazu = (k: string, g: number) => ev.set(k, (ev.get(k) ?? 0) + g);
  const t = `${thema} ${id} ${text}`;
  const bw = String(ab?.antworten?.bw ?? "");
  const at = String(ab?.antworten?.at ?? "");
  if (/stillstand|reanimation|leblos/.test(t) || at === "agonal" || /schnappatmung|röchel/.test(t)) dazu("roecheln", 4);
  else if (/bewusstlos/.test(thema) || bw === "nein") dazu("roecheln", 1.5);
  if (/sturz|verletzung|ruecken|bauch|blutung|eingeklemmt|verkehrsunfall|tierbiss|strom|hitze_kaelte|alpin/.test(thema)) dazu("stoehnen", 3);
  if (/eingeklemmt|verkehrsunfall|brand|gewalt|stich_schuss|strom/.test(thema) || /schreit|schreien|brüllt/.test(text)) dazu("schreien", 2.5);
  if (/schwangerschaft/.test(thema) && /wehe|geburt|presst/.test(text)) dazu("schreien", 2), dazu("stoehnen", 2);
  if (/atemnot|brand|ersticken|infekt|gefahrstoff|allergie/.test(thema) || /hustet|husten/.test(text)) dazu("husten", 3);
  if (/vergiftung|bauch|kopfschmerz/.test(thema) || /erbricht|erbrochen|übergeben|speib|kotzt/.test(text)) dazu("erbrechen", 1.5);
  if (alter < 2) dazu("baby", 4);
  else if (alter < 12) dazu("kind_weint", 3);
  else if (a?.typ === "eltern" || /kinder (weinen|schreien)|das kind weint/.test(text)) dazu("kind_weint", 1);
  if (/brand/.test(thema) || /rauchmelder|feuer|brennt|rauch/.test(text)) dazu("rauchmelder", 2), dazu("feuer", 3);
  if (/verkehrsunfall|eingeklemmt/.test(thema) && draussen) dazu("hupe", 1), dazu("warnblinker", 0.5);
  if (/hund/.test(text) || ((ort === "wohnung" || ort === "haus" || ort === "garten") && rnd() < 0.15)) dazu("hund", /hund/.test(text) ? 3 : 1);
  if ((ort === "wohnung" || ort === "haus") && rnd() < 0.1) dazu("tuerklingel", 0.6);
  if (draussen && /verkehrsunfall|brand|gewalt|eingeklemmt/.test(thema) && rnd() < 0.5) dazu("sirene_fern", 0.8);
  // eigene Liste des Falls
  for (const k of (sz as { geraeusche?: string[] } | undefined)?.geraeusche ?? []) dazu(k, 3);
  // Beta 83: was der Patient selbst von sich gibt, folgt seinem Zustand (ändert er sich im Gespräch, ändern sich die Geräusche)
  if (bw || at) {
    const mal = (k: string, f: number) => ev.has(k) && ev.set(k, (ev.get(k) ?? 0) * f);
    const weg = bw === "nein" || at === "keine" || at === "agonal";
    if (weg) {
      for (const k of ["stoehnen", "husten", "erbrechen"]) ev.delete(k);
      mal("schreien", 0.35); // schreien andere am Ort
      if (alter < 2) ev.delete("baby");
      else if (alter < 12) ev.delete("kind_weint");
    } else if (bw === "getruebt") {
      mal("stoehnen", 0.6);
      mal("schreien", 0.4);
    }
    if (at === "keine") ev.delete("roecheln");
    else if (at === "agonal") ev.set("roecheln", Math.max(4, ev.get("roecheln") ?? 0));
    else if (bw === "nein") ev.set("roecheln", Math.max(2, ev.get("roecheln") ?? 0));
    else ev.delete("roecheln");
  }
  const ereignisse = [...ev.entries()].filter(([, g]) => g > 0);
  const aufregung = Math.max(0, Math.min(1, (ab?.stimmung?.stufe ?? panikStufe(a?.emotion)) / 5));
  return { leitung, umgebung, ereignisse, aufregung, draussen, wetter: wt };
}

/** wie oft ein Ereignis kommt (Sekunden zwischen zwei), je nach Stufe und Aufregung */
export function ereignisAbstand(stufe: KlangStufe, aufregung: number, rnd: () => number = Math.random): number {
  const basis = stufe === "realistisch" ? 12 : 26;
  const f = 1.4 - aufregung * 0.8;
  return Math.max(4, basis * f * (0.6 + rnd() * 0.8));
}
