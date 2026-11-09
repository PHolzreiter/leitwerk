/**
 * Bindung der Einstellungs-Zeilen des Hauptmenüs (Schlüssel aus settingsData() in komponente.js) an die echten App-Werte.
 * lesen/schreiben arbeiten in der Darstellung des Menüs (Auswahl-Text, Zahl, „#rrggbb“, Anzeigetext einer Taste);
 * geschrieben wird sofort (kein Speichern-Knopf), undefined = Standard.
 */
import type { EinstellungsBindung } from "./vertrag";
import { store } from "../../data/store";
import { sim } from "../../sim/engine";
import { mp } from "../../net/mehrspieler";
import { DEFAULT_STATUS, defaultAusrueck, defaultSettings, type Settings } from "../../sim/settings";
import { vorlageVon } from "../../sim/stufenKurven";
import { WETTER_LABEL, type WetterLage } from "../../sim/weather";
import { FUNK_FARBEN } from "../../sim/funkgruppen";
import { istDunkel, KUERZEL_STANDARD, pers, setzePers, STANDARD as PERS_STANDARD, type KuerzelId, type Persoenlich } from "../ws/persoenlich";
import { VORLAGEN as FARB_VORLAGEN } from "../ws/farben";
import { tasteText as kuerzelText, tasteVon } from "../ws/kuerzel";
import { DATEI_REGELN, eigeneDateien, IST_KLINGELTON, spielen, STANDARD_SOUND, VORLAGEN as TON_VORLAGEN, type EigeneDatei, type SoundEreignis } from "../sounds";
import { ausgabeGeraete, mikrofone, setzeSprache, SPRACH_STANDARD, sprachPrefs, tastenName as sprachTastenName, type SprachPrefs } from "../sprache";
import { kiPrefs, setKiPrefs } from "../../abfrage/ki";
import { anrufKiModus, livePrefs, setLivePrefs } from "../../abfrage/liveKi";
import { funkGruppenSetzen, funkGruppenWahl, telefonModus } from "../sprechfunk";
import { ALARM_AUFNAHMEN, ALARM_STANDARD, ALARM_VORLAGEN, alarmPrefs, alarmPrefsSetzen, eigeneAlarmtoene, probeSpielen, type AlarmArt } from "../pilot/alarmToene";
import { carlsAn, carlsUmschalten, gtnAn, gtnUmschalten, vorgabe, vorgabeSetzen } from "../pilot/flugsim";
import { belegung, belegungSpeichern, standardBelegung, tastenName as pilotTastenName, type PilotAktion } from "../pilot/tasten";
import { abfrageAnsicht, setzeAbfrageAnsicht } from "../abfrageAnsicht";

type Eintrag = { l: () => unknown; s: (w: unknown) => boolean };

const SYSTEM = "Wie das System";
const AUS = "– aus –";

// ---------------------------------------------------------------- Hilfen

const zahl = (w: unknown, d: number): number => {
  const n = typeof w === "number" ? w : Number(String(w ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : d;
};
const grenze = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const hex = (w: unknown): string | null => {
  const t = String(w ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) return `#${t.slice(1).replace(/./g, (c) => c + c)}`.toLowerCase();
  return null;
};
const hex6 = (w: string | undefined, d: string): string => hex(w) ?? d;

/** Auswahl-Text ↔ App-Wert */
function wahl<T extends string>(paare: [T, string][]): { text(v: T | undefined): string; wert(t: unknown): T | undefined } {
  return {
    text: (v) => paare.find(([k]) => k === v)?.[1] ?? paare[0][1],
    wert: (t) => paare.find(([, l]) => l === t)?.[0],
  };
}

/** Pers-Feld (boolean) */
const persBool = (k: keyof Persoenlich, std: boolean): Eintrag => ({
  l: () => {
    const v = pers()[k];
    return v === undefined ? std : !!v;
  },
  s: (w) => (setzePers({ [k]: w === undefined ? std : !!w } as Partial<Persoenlich>), true),
});

/** Pers-Feld (Zahl) */
const persZahl = (k: keyof Persoenlich, std: number, min: number, max: number): Eintrag => ({
  l: () => zahl(pers()[k], std),
  s: (w) => (setzePers({ [k]: w === undefined ? std : grenze(zahl(w, std), min, max) } as Partial<Persoenlich>), true),
});

type SprachBool = { [K in keyof SprachPrefs]: SprachPrefs[K] extends boolean ? K : never }[keyof SprachPrefs];
type SprachZahl = { [K in keyof SprachPrefs]: SprachPrefs[K] extends number ? K : never }[keyof SprachPrefs];
const sprBool = (k: SprachBool): Eintrag => ({
  l: () => !!sprachPrefs()[k],
  s: (w) => (setzeSprache({ [k]: w === undefined ? SPRACH_STANDARD[k] : !!w }), true),
});
const sprZahl = (k: SprachZahl, min: number, max: number): Eintrag => ({
  l: () => sprachPrefs()[k],
  s: (w) => (setzeSprache({ [k]: w === undefined ? SPRACH_STANDARD[k] : grenze(zahl(w, SPRACH_STANDARD[k]), min, max) }), true),
});

/** Spiel-Einstellungen: im Multiplayer nur mit Recht „Einstellungen“ */
function darfSim(): boolean {
  return !(mp.status.rolle === "client" && !mp.darf("einstellungen"));
}
function simSetzen(f: (s: Settings) => void): boolean {
  if (!darfSim()) return false;
  const s = structuredClone(store.settings);
  f(s);
  store.setSettings(s);
  void sim.call("neuPlanen").catch(() => undefined);
  return true;
}
const STD = defaultSettings();
const set = () => store.settings;

type SetBool = { [K in keyof Settings]-?: NonNullable<Settings[K]> extends boolean ? K : never }[keyof Settings];
type SetZahl = { [K in keyof Settings]-?: NonNullable<Settings[K]> extends number ? K : never }[keyof Settings];
/** boolean in Settings; std = Wert, wenn das Feld fehlt */
const simBool = (k: SetBool, std: boolean): Eintrag => ({
  l: () => {
    const v = set()[k];
    return v === undefined ? std : !!v;
  },
  s: (w) => simSetzen((s) => ((s as unknown as Record<string, unknown>)[k] = w === undefined ? std : !!w)),
});
const simZahl = (k: SetZahl, std: number, min = -Infinity, max = Infinity): Eintrag => ({
  l: () => zahl(set()[k], std),
  s: (w) => simSetzen((s) => ((s as unknown as Record<string, unknown>)[k] = w === undefined ? std : grenze(zahl(w, std), min, max))),
});
function simWahl<T extends string>(paare: [T, string][], lesen: () => T | undefined, schreiben: (s: Settings, v: T | undefined) => void): Eintrag {
  const m = wahl(paare);
  return {
    l: () => m.text(lesen()),
    s: (w) => {
      if (w === undefined) return simSetzen((s) => schreiben(s, undefined));
      const v = m.wert(w);
      return v === undefined ? false : simSetzen((s) => schreiben(s, v));
    },
  };
}

// ---------------------------------------------------------------- Daten, die erst geladen werden müssen

let geraete: string[] = [];
let mikros: { deviceId: string; label: string }[] = [];
let dateien: EigeneDatei[] = [];

const TON_KEYS: Record<string, SoundEreignis> = {
  te_notruf: "notruf",
  te_kt: "kt",
  te_anklopfen: "anklopfen",
  te_funk: "funk",
  te_funkD: "funkDringend",
  te_chat: "chat",
  te_warn: "warnung",
};

function tonPassend(ev: SoundEreignis): EigeneDatei[] {
  return dateien.filter((d) => d.art !== "alarm" && (IST_KLINGELTON[ev] ? d.sek <= DATEI_REGELN.klingel.maxSek : d.sek <= DATEI_REGELN.kurz.maxSek));
}
function tonOptionen(ev: SoundEreignis): string[] {
  return [...Object.values(TON_VORLAGEN).map((v) => v.name), ...tonPassend(ev).map((d) => d.name), AUS];
}
function quelleText(q: string): string {
  if (q === "aus") return AUS;
  if (q.startsWith("vorlage:")) return TON_VORLAGEN[q.slice(8)]?.name ?? "";
  if (q.startsWith("datei:")) return dateien.find((d) => d.id === q.slice(6))?.name ?? "";
  return "";
}
function textQuelle(ev: SoundEreignis, t: unknown): string | null {
  if (t === AUS) return "aus";
  const v = Object.entries(TON_VORLAGEN).find(([, x]) => x.name === t);
  if (v) return `vorlage:${v[0]}`;
  const d = tonPassend(ev).find((x) => x.name === t);
  return d ? `datei:${d.id}` : null;
}

// ---------------------------------------------------------------- Tasten

type SprachTaste = "taste" | "funkTaste" | "funkTasteNormal" | "funkTaste09" | "funkTaste10";
const SPRACH_TASTEN: Record<string, SprachTaste> = { kSprech: "taste", kFunk: "funkTaste", kFunkN: "funkTasteNormal", kF09: "funkTaste09", kF10: "funkTaste10" };
/** ohne diese Tasten geht es nicht – nicht leeren */
const SPRACH_PFLICHT: SprachTaste[] = ["taste", "funkTaste"];
const PILOT_TASTEN: Record<string, PilotAktion> = {
  pk_s1: "s1",
  pk_s2: "s2",
  pk_s3: "s3",
  pk_s4: "s4",
  pk_s5: "s5",
  pk_s6: "s6",
  pk_s9: "s9",
  pk_funk: "funk",
  pk_funkRtw: "funkRtw",
  pk_fliegen: "fliegen",
};
const KUERZEL: Record<string, KuerzelId> = { k1: "annehmen", k2: "auflegen", k3: "halten", k4: "fahrzeugSuchen", k5: "neuerEinsatz", k6: "einsatzliste", k7: "karte", k8: "funk" };
const LEER = (w: unknown) => w === "" || w === "–" || w === null;

function sprachTasteSetzen(feld: SprachTaste, code: string): boolean {
  if (!code && SPRACH_PFLICHT.includes(feld)) return false;
  if (code && (Object.values(SPRACH_TASTEN) as SprachTaste[]).some((k) => k !== feld && sprachPrefs()[k] === code)) return false;
  setzeSprache({ [feld]: code } as Partial<SprachPrefs>);
  return true;
}
function pilotTasteSetzen(a: PilotAktion, code: string | undefined): boolean {
  const b = belegung();
  if (code && (Object.keys(b.taste) as PilotAktion[]).some((k) => k !== a && b.taste[k] === code)) return false;
  const taste = { ...b.taste };
  if (code) taste[a] = code;
  else delete taste[a];
  belegungSpeichern({ ...b, taste });
  return true;
}
function kuerzelSetzen(id: KuerzelId, t: string): boolean {
  const k = pers().kuerzel;
  if (t && (Object.keys(k) as KuerzelId[]).some((x) => x !== id && k[x] === t)) return false;
  setzePers({ kuerzel: { ...k, [id]: t } });
  return true;
}

// ---------------------------------------------------------------- Bindung

/**
 * @param geladen wird aufgerufen, sobald Geräte, Mikrofone und eigene Tondateien geladen sind (zum Neuzeichnen)
 */
/** Alarmtöne des Piloten: Aufnahmen, erzeugte Töne, eigene Dateien (id wie in alarmPrefs) */
let eigeneAlarm: { id: string; name: string }[] = [];
function alarmTonListe(): { id: string; name: string }[] {
  return [
    ...Object.entries(ALARM_AUFNAHMEN).map(([id, v]) => ({ id: `aufnahme:${id}`, name: v.name })),
    ...Object.entries(ALARM_VORLAGEN).map(([id, v]) => ({ id: `vorlage:${id}`, name: v.name })),
    ...eigeneAlarm.map((d) => ({ id: `datei:${d.id}`, name: `${d.name} (eigen)` })),
  ];
}
/** eigene Alarmtöne neu einlesen (nach dem Hinzufügen) */
export function alarmToeneNeu(): Promise<void> {
  return eigeneAlarmtoene()
    .then((d) => void (eigeneAlarm = d.map((x) => ({ id: x.id, name: x.name }))))
    .catch(() => undefined);
}
function alarmEintrag(art: AlarmArt): Eintrag {
  return {
    l: () => {
      const q = alarmPrefs()[art];
      return alarmTonListe().find((x) => x.id === q)?.name ?? q;
    },
    s: (w) => {
      if (w === undefined) return (alarmPrefsSetzen({ [art]: ALARM_STANDARD[art] }), true);
      const t = alarmTonListe().find((x) => x.name === w);
      return t ? (alarmPrefsSetzen({ [art]: t.id }), true) : false;
    },
  };
}

export function einstellungsBindung(geladen?: () => void): EinstellungsBindung {
  // Entscheidungen, die für das neue Hauptmenü gelten (nur ändern, wenn nötig)
  const kp = kiPrefs();
  if (kp.ablauf !== "neu" || kp.funk !== "ki") setKiPrefs({ ablauf: "neu", funk: "ki" });
  if (abfrageAnsicht() !== "neu") setzeAbfrageAnsicht("neu");
  if (store.settings.fallKatalog !== "nur" && darfSim()) store.setSettings({ ...store.settings, fallKatalog: "nur" });
  if (sprachPrefs().stimmeArt === "supertonic") setzeSprache({ stimmeArt: "piper" });

  // einmal laden und merken
  void Promise.all([
    ausgabeGeraete().then((g) => (geraete = g)).catch(() => undefined),
    mikrofone()
      .then((m) => (mikros = m.filter((x) => x.deviceId && x.deviceId !== "default").map((x) => ({ deviceId: x.deviceId, label: x.label || "Mikrofon" }))))
      .catch(() => undefined),
    eigeneDateien().then((d) => (dateien = d)).catch(() => undefined),
    alarmToeneNeu(),
  ]).then(() => geladen?.());

  const geraetOptionen = () => [SYSTEM, ...geraete];
  const mikroOptionen = () => [SYSTEM, ...mikros.map((m) => m.label)];

  const THEMA = wahl<Persoenlich["thema"]>([["hell", "Hell"], ["dunkel", "Dunkel"], ["system", SYSTEM]]);
  const KARTE = wahl<Persoenlich["karte"]>([["auto", "Passt sich an"], ["hell", "Immer hell"]]);
  const POI: [number, string][] = [
    [0, "immer"],
    [10, "ab Zoom 10 (Bezirk)"],
    [12, "ab Zoom 12 (Gemeinde)"],
    [13, "ab Zoom 13"],
    [14, "ab Zoom 14 (Ortskern)"],
    [15, "ab Zoom 15"],
    [16, "ab Zoom 16 (Straße)"],
  ];
  /** Farbvorlagen im Menü (nur neutrale Vorlagen) */
  const fvListe = () => Object.entries(FARB_VORLAGEN).filter(([id]) => id !== "rotkreuz");

  const FE: Record<string, "akzent" | "leiste" | "hintergrund" | "fenster" | "warn"> = { fe_akz: "akzent", fe_lei: "leiste", fe_bg: "hintergrund", fe_fen: "fenster", fe_warn: "warn" };
  const FE_CSS: Record<string, string> = { akzent: "--blue", leiste: "--panel", hintergrund: "--bg", fenster: "--panel", warn: "--accent" };
  const FE_STD: Record<"hell" | "dunkel", Record<string, string>> = {
    hell: { akzent: "#0b55a8", leiste: "#ffffff", hintergrund: "#e9edf2", fenster: "#ffffff", warn: "#e63946" },
    dunkel: { akzent: "#4d93e6", leiste: "#191c21", hintergrund: "#0f1114", fenster: "#191c21", warn: "#e63946" },
  };
  const feLesen = (feld: string): string => {
    const p = pers();
    const modus = istDunkel() ? "dunkel" : "hell";
    const eigen = p.farben[modus]?.[feld];
    if (hex(eigen)) return hex(eigen)!;
    const basis = (FARB_VORLAGEN[p.farbVorlage ?? "noe"] ?? FARB_VORLAGEN.noe)[modus] as Record<string, string | undefined>;
    if (hex(basis[feld])) return hex(basis[feld])!;
    let css = "";
    try {
      css = getComputedStyle(document.documentElement).getPropertyValue(FE_CSS[feld]).trim();
    } catch {
      css = "";
    }
    return hex(css) ?? FE_STD[modus][feld];
  };

  const KIMODUS = wahl<"gemini" | "lokal">([["gemini", "Gemini (Cloud)"], ["lokal", "Lokal (Ollama)"]]);
  const SIMWX = wahl<"leitwerk" | "selbst">([["leitwerk", "Wie LeitWerk"], ["selbst", "Selbst"]]);

  const wetterWechsel = () => {
    const s = set();
    return s.wetterWechsel ?? (s.wetterModus === "fest" ? 0 : s.wetterModus === "wechselhaft" ? 80 : 50);
  };
  const wetterArt = (): "echt" | "normal" | "wechselhaft" | "fest" => {
    const w = wetterWechsel();
    return w <= 0 ? "fest" : set().wetterEcht ? "echt" : w >= 70 ? "wechselhaft" : "normal";
  };

  const feste: Record<string, Eintrag> = {
    // ---------------- Mein Platz: Darstellung
    thema: { l: () => THEMA.text(pers().thema), s: (w) => {
      const v = w === undefined ? PERS_STANDARD.thema : THEMA.wert(w);
      return v ? (setzePers({ thema: v }), true) : false;
    } },
    karte: { l: () => KARTE.text(pers().karte), s: (w) => {
      const v = w === undefined ? PERS_STANDARD.karte : KARTE.wert(w);
      return v ? (setzePers({ karte: v }), true) : false;
    } },
    skal: persZahl("skalierung", 100, 75, 150),
    anim: persBool("animationen", true),
    wx3d: persBool("wetter3d", true),
    poi: {
      l: () => {
        const z = pers().poiZoom ?? 14;
        return (POI.find(([v]) => v === z) ?? (z > 16 ? POI[POI.length - 1] : POI.find(([v]) => v >= z) ?? POI[4]))[1];
      },
      s: (w) => {
        if (w === undefined) return (setzePers({ poiZoom: 14 }), true);
        const v = POI.find(([, l]) => l === w)?.[0];
        return v === undefined ? false : (setzePers({ poiZoom: v }), true);
      },
    },
    fglinien: persBool("funkLinien", true),
    // ---------------- Farben
    fv: {
      l: () => {
        const id = pers().farbVorlage ?? "noe";
        return (fvListe().find(([k]) => k === id) ?? ["noe", FARB_VORLAGEN.noe])[1].name;
      },
      s: (w) => {
        const id = w === undefined ? "noe" : fvListe().find(([, v]) => v.name === w)?.[0];
        if (!id) return false;
        setzePers({ farbVorlage: id, farben: { hell: {}, dunkel: {} } });
        return true;
      },
    },
    falarm: {
      l: () => hex6(pers().fzAlarmFarbe, "#fff3c4"),
      s: (w) => {
        if (w === undefined) return (setzePers({ fzAlarmFarbe: undefined }), true);
        const c = hex(w);
        return c ? (setzePers({ fzAlarmFarbe: c }), true) : false;
      },
    },
    ffunk: {
      l: () => hex6(pers().fzFunkFarbe, "#d32f2f"),
      s: (w) => {
        if (w === undefined) return (setzePers({ fzFunkFarbe: undefined, fzFunkRot: true }), true);
        const c = hex(w);
        return c ? (setzePers({ fzFunkFarbe: c, fzFunkRot: true }), true) : false;
      },
    },
    // ---------------- Telefon & Töne
    notrufe: persBool("notrufe", true),
    kthot: persBool("ktHotline", true),
    klingel: { l: () => kiPrefs().klingelton, s: (w) => (setKiPrefs({ klingelton: w === undefined ? true : !!w }), true) },
    tlaut: persZahl("lautstaerke", 70, 0, 100),
    fpiep: persBool("funkTon", true),
    gexp: persBool("exportKnopf", true),
    tdev: {
      l: () => pers().tonGeraet || SYSTEM,
      s: (w) => {
        if (w === undefined || w === SYSTEM || w === "") return (setzePers({ tonGeraet: "" }), true);
        return typeof w === "string" ? (setzePers({ tonGeraet: w }), true) : false;
      },
    },
    // ---------------- Anrufe & KI
    kimodus: {
      l: () => KIMODUS.text(anrufKiModus()),
      s: (w) => {
        const v = w === undefined ? "lokal" : KIMODUS.wert(w);
        if (!v) return false;
        setLivePrefs({ an: v === "gemini", gewaehlt: true });
        return true;
      },
    },
    freispr: { l: () => !!livePrefs().freisprechen, s: (w) => (setLivePrefs({ freisprechen: w === undefined ? false : !!w }), true) },
    klang: { l: () => livePrefs().klang !== false, s: (w) => (setLivePrefs({ klang: w === undefined ? true : !!w }), true) },
    gfunk: { l: () => !!livePrefs().funkVersteher, s: (w) => (setLivePrefs({ funkVersteher: w === undefined ? false : !!w }), true) },
    // eigener Schalter existiert nicht: die Fahrzeuge sprechen mit Gemini, sobald Gemini die Anrufer-KI ist
    gfzg: { l: () => anrufKiModus() === "gemini", s: () => false },
    lokal: { l: () => kiPrefs().aktiv, s: (w) => (setKiPrefs({ aktiv: w === undefined ? true : !!w }), true) },
    olbeend: { l: () => kiPrefs().beenden, s: (w) => (setKiPrefs({ beenden: w === undefined ? false : !!w }), true) },
    schnell: { l: () => kiPrefs().schnell, s: (w) => (setKiPrefs({ schnell: w === undefined ? false : !!w }), true) },
    unvoll: simBool("funkUnvollstaendig", true),
    gkey: { l: () => livePrefs().schluessel, s: (w) => (setLivePrefs({ schluessel: w === undefined ? "" : String(w).trim() }), true) },
    // ---------------- Sprache & Stimmen
    vorl: sprBool("vorlesen"),
    fvorl: sprBool("funkVorlesen"),
    slaut: sprZahl("laut", 0, 100),
    tempo: sprZahl("tempo", 70, 140),
    sdev: {
      l: () => sprachPrefs().geraetStimmen || SYSTEM,
      s: (w) => {
        if (w === undefined || w === SYSTEM || w === "") return (setzeSprache({ geraetStimmen: "" }), true);
        return typeof w === "string" ? (setzeSprache({ geraetStimmen: w }), true) : false;
      },
    },
    // ---------------- Mikrofon & Funk
    eingabe: sprBool("eingabe"),
    autosend: sprBool("autoSenden"),
    mic: {
      l: () => {
        const id = sprachPrefs().mikro;
        return id ? mikros.find((m) => m.deviceId === id)?.label ?? SYSTEM : SYSTEM;
      },
      s: (w) => {
        if (w === undefined || w === SYSTEM || w === "") return (setzeSprache({ mikro: "" }), true);
        const m = mikros.find((x) => x.label === w);
        return m ? (setzeSprache({ mikro: m.deviceId }), true) : false;
      },
    },
    fgLaut: {
      l: () => funkGruppenWahl().mithoerLaut,
      s: (w) => (funkGruppenSetzen({ mithoerLaut: w === undefined ? 50 : grenze(zahl(w, 50), 0, 100) }), true),
    },
    fTel: {
      l: () => ({ normal: "Normal", leiser: "Leiser", stumm: "Stumm" })[telefonModus()],
      s: (w) => {
        const v = w === undefined ? "leiser" : ({ Normal: "normal", Leiser: "leiser", Stumm: "stumm" } as Record<string, "normal" | "leiser" | "stumm">)[String(w)];
        return v ? (funkGruppenSetzen({ telefon: v, telefonStumm: false }), true) : false;
      },
    },
    // ---------------- Pilot: Alarmtöne (Aufnahmen, erzeugte Melder-Töne, eigene Dateien)
    pt_alarm: alarmEintrag("alarm"),
    pt_abruf: alarmEintrag("abruf"),
    pt_alarm_l: { l: () => alarmPrefs().laut, s: (w) => (alarmPrefsSetzen({ laut: w === undefined ? 80 : grenze(zahl(w, 80), 0, 100) }), true) },
    pt_abruf_l: { l: () => alarmPrefs().laut, s: (w) => (alarmPrefsSetzen({ laut: w === undefined ? 80 : grenze(zahl(w, 80), 0, 100) }), true) },
    echteD: { l: () => funkGruppenWahl().echteDispos !== false, s: (w) => (funkGruppenSetzen({ echteDispos: w === undefined ? true : !!w }), true) },
    echteP: { l: () => funkGruppenWahl().echtePiloten !== false, s: (w) => (funkGruppenSetzen({ echtePiloten: w === undefined ? true : !!w }), true) },
    fklang: sprBool("klangfilter"),
    sfLaut: sprZahl("funkLaut", 0, 100),
    // ---------------- Pilot
    simwx: {
      l: () => SIMWX.text(vorgabe().wetter ?? "leitwerk"),
      s: (w) => {
        const v = w === undefined ? "leitwerk" : SIMWX.wert(w);
        return v ? (vorgabeSetzen({ wetter: v }), true) : false;
      },
    },
    gtn: { l: () => gtnAn(), s: (w) => (gtnUmschalten(w === undefined ? true : !!w), true) },
    pcarls: { l: () => carlsAn(), s: (w) => (carlsUmschalten(w === undefined ? true : !!w), true) },
    pglob: {
      l: () => belegung().globalAn,
      s: (w) => (belegungSpeichern({ ...belegung(), globalAn: w === undefined ? standardBelegung().globalAn : !!w }), true),
    },
    // ---------------- Bedienung
    dev: persBool("entwickler", false),

    // ================= Spiel & Simulation
    aufk: simWahl<"realistisch" | "standard" | "stressig">(
      [["realistisch", "Realistisch"], ["standard", "Standard"], ["stressig", "Stressig"]],
      () => vorlageVon(set()),
      (s, v) => {
        s.aufkommenStufe = v ?? "standard";
        s.stufenStunden = undefined;
      },
    ),
    gen: simBool("generatorAktiv", true),
    quelle: simWahl<Settings["generatorQuelle"]>(
      [["zufall", "zufällig (Adressen im Gebiet)"], ["vorlagen", "aus Einsatzvorlagen"]],
      () => set().generatorQuelle,
      (s, v) => (s.generatorQuelle = v ?? STD.generatorQuelle),
    ),
    tempo1: simBool("tempoBeiNotruf", true),
    fremd: simBool("fremdzoneAktiv", false),
    fremdRate: simZahl("fremdzoneProStunde", 1, 0, 100),
    alsNotruf: simBool("anrufe", true),
    kimp: simWahl<"frei" | "gemini" | "lokal">(
      [["frei", "Jeder selbst"], ["gemini", "Alle Gemini"], ["lokal", "Alle lokal"]],
      () => set().kiRegel ?? "frei",
      (s, v) => (s.kiRegel = v ?? "frei"),
    ),
    falsch: simZahl("falscheAdresseProzent", STD.falscheAdresseProzent, 0, 100),
    rueck: simBool("rueckrufOhneNummer", false),
    kompl: simWahl<Settings["komplikationen"]>(
      [["ruhig", "Ruhig"], ["normal", "Normal"], ["fordernd", "Fordernd"]],
      () => set().komplikationen,
      (s, v) => (s.komplikationen = v ?? STD.komplikationen),
    ),
    revers: simWahl<"normal" | "selten" | "aus">(
      [["normal", "Normal"], ["selten", "Selten"], ["aus", "Aus"]],
      () => set().revers ?? "normal",
      (s, v) => (s.revers = v ?? "normal"),
    ),
    rdv: simBool("rendezvous", true),
    tol: simZahl("toleranzMin", STD.toleranzMin, 0),
    khg: simBool("khGrundAktiv", true),
    khgF: {
      l: () => Math.round((set().khGrundFaktor ?? 1) * 100),
      s: (w) => simSetzen((s) => (s.khGrundFaktor = w === undefined ? 1 : grenze(zahl(w, 100), 10, 200) / 100)),
    },
    dia: simZahl("dauerDialyseJeKh", STD.dauerDialyseJeKh, 0),
    strahl: simZahl("dauerStrahlJeKh", STD.dauerStrahlJeKh, 0),
    chemo: simZahl("dauerChemoJeKh", STD.dauerChemoJeKh, 0),
    tagV: {
      l: () => set().ausrueck.tagVon,
      s: (w) => simSetzen((s) => (s.ausrueck.tagVon = w === undefined ? defaultAusrueck().tagVon : grenze(Math.round(zahl(w, 5)), 0, 23))),
    },
    tagB: {
      l: () => set().ausrueck.tagBis,
      s: (w) => simSetzen((s) => (s.ausrueck.tagBis = w === undefined ? defaultAusrueck().tagBis : grenze(Math.round(zahl(w, 22)), 0, 24))),
    },
    unterwegs: {
      l: () => set().ausrueck.unterwegs,
      s: (w) => simSetzen((s) => (s.ausrueck.unterwegs = w === undefined ? defaultAusrueck().unterwegs : Math.max(0, zahl(w, 10)))),
    },
    bereit: {
      l: () => set().ausrueck.bereitschaftPlusMin,
      s: (w) => simSetzen((s) => (s.ausrueck.bereitschaftPlusMin = w === undefined ? defaultAusrueck().bereitschaftPlusMin : Math.max(0, zahl(w, 5)))),
    },
    sosi: simZahl("sondersignalFaktor", STD.sondersignalFaktor, 0.1, 2),
    vort: simZahl("verortungRadius", STD.verortungRadius, 0),
    wsim: simBool("wetterAktiv", true),
    wecht: simBool("wetterEcht", false),
    wwech: {
      l: () => wetterWechsel(),
      s: (w) =>
        simSetzen((s) => {
          s.wetterWechsel = w === undefined ? (STD.wetterWechsel ?? 50) : grenze(zahl(w, 50), 0, 100);
          s.wetterModus = undefined;
        }),
    },
    wlage: {
      l: () => WETTER_LABEL[(set().wetterFestLage ?? "klar") as WetterLage] ?? WETTER_LABEL.klar,
      s: (w) => {
        const k = w === undefined ? STD.wetterFestLage : Object.entries(WETTER_LABEL).find(([, l]) => l === w)?.[0];
        return k ? simSetzen((s) => (s.wetterFestLage = k)) : false;
      },
    },
    wtemp: {
      l: () => set().wetterFestTemp ?? STD.wetterFestTemp,
      s: (w) => simSetzen((s) => (s.wetterFestTemp = w === undefined ? STD.wetterFestTemp : grenze(zahl(w, 18), -25, 40))),
    },
    jz: simWahl<NonNullable<Settings["jahreszeit"]>>(
      [["auto", "nach Spieldatum"], ["fruehling", "Frühling"], ["sommer", "Sommer"], ["herbst", "Herbst"], ["winter", "Winter"]],
      () => set().jahreszeit ?? "auto",
      (s, v) => (s.jahreszeit = v ?? "auto"),
    ),
    nahv: simZahl("nahGeschwindigkeit", STD.nahGeschwindigkeit, 50, 400),
    // ---------------- Spiel starten
    fg: {
      l: () => set().funkgruppe ?? STD.funkgruppe,
      s: (w) => simSetzen((s) => (s.funkgruppe = w === undefined ? STD.funkgruppe : String(w))),
    },
    startzeit: {
      l: () => set().startzeit ?? "",
      s: (w) => simSetzen((s) => (s.startzeit = w === undefined || w === "" ? undefined : String(w))),
    },
    wetterArt: {
      l: () => ({ echt: "Echt", normal: "Simuliert", wechselhaft: "Wechselhaft", fest: "Fest" })[wetterArt()],
      s: (w) => {
        const v = w === undefined ? "echt" : ({ Echt: "echt", Simuliert: "normal", Wechselhaft: "wechselhaft", Fest: "fest" } as Record<string, string>)[String(w)];
        if (!v) return false;
        return simSetzen((s) => {
          s.wetterAktiv = true;
          s.wetterModus = undefined;
          s.wetterEcht = v === "echt";
          s.wetterWechsel = v === "fest" ? 0 : v === "wechselhaft" ? 80 : 50;
        });
      },
    },
    a_rd: simBool("rdAktiv", true),
    a_kt: simBool("ktAktiv", true),
    a_sek: simBool("sekAktiv", true),
    a_acn: simBool("acnAktiv", true),
  };

  /** Schlüssel mit Muster (Funkgruppen, Farben, Status, Töne, Tasten, Ausrückzeiten) */
  function dynamisch(key: string): Eintrag | undefined {
    let m: RegExpMatchArray | null;
    if (feste[key]) return feste[key];

    // Funkgruppen
    if ((m = key.match(/^fgc_(.+)$/))) {
      const id = m[1];
      return {
        l: () => hex6(pers().funkFarben[id], (FUNK_FARBEN as Record<string, string>)[id] ?? "#888888"),
        s: (w) => {
          const f = { ...pers().funkFarben };
          if (w === undefined) delete f[id];
          else {
            const c = hex(w);
            if (!c) return false;
            f[id] = c;
          }
          setzePers({ funkFarben: f });
          return true;
        },
      };
    }
    if ((m = key.match(/^fgo_(.+)$/))) {
      const id = m[1];
      return {
        l: () => pers().funkGruppen[id] !== false,
        s: (w) => {
          const g = { ...pers().funkGruppen };
          if (w === undefined || w) delete g[id];
          else g[id] = false;
          setzePers({ funkGruppen: g });
          return true;
        },
      };
    }
    // eigene Farben
    if (FE[key]) {
      const feld = FE[key];
      return {
        l: () => feLesen(feld),
        s: (w) => {
          const modus = istDunkel() ? "dunkel" : "hell";
          const p = pers();
          const satz = { ...(p.farben[modus] ?? {}) };
          if (w === undefined) delete satz[feld];
          else {
            const c = hex(w);
            if (!c) return false;
            satz[feld] = c;
          }
          setzePers({ farben: { ...p.farben, [modus]: satz } });
          return true;
        },
      };
    }
    // eigene Statusfarben
    if ((m = key.match(/^sf_st(\d+)$/))) {
      const i = Number(m[1]) - 1;
      const def = () => set().status[i];
      if (!def()) return undefined;
      return {
        l: () => hex6(pers().statusFarben[def().key], hex6(def().farbe, "#888888")),
        s: (w) => {
          const f = { ...pers().statusFarben };
          if (w === undefined) delete f[def().key];
          else {
            const c = hex(w);
            if (!c) return false;
            f[def().key] = c;
          }
          setzePers({ statusFarben: f });
          return true;
        },
      };
    }
    // Statusmodell
    if ((m = key.match(/^st(\d+)_([nmca])$/))) {
      const i = Number(m[1]) - 1;
      const feld = m[2];
      if (!set().status[i]) return undefined;
      const std = DEFAULT_STATUS.find((d) => d.key === set().status[i].key) ?? DEFAULT_STATUS[i];
      if (feld === "n") return { l: () => set().status[i].nummer, s: (w) => simSetzen((s) => (s.status[i].nummer = w === undefined ? std.nummer : String(w).trim())) };
      if (feld === "m") return { l: () => set().status[i].name, s: (w) => simSetzen((s) => (s.status[i].name = w === undefined ? std.name : String(w))) };
      if (feld === "c")
        return {
          l: () => hex6(set().status[i].farbe, std.farbe),
          s: (w) => {
            const c = w === undefined ? std.farbe : hex(w);
            return c ? simSetzen((s) => (s.status[i].farbe = c)) : false;
          },
        };
      return { l: () => !!set().status[i].verfuegbar, s: (w) => simSetzen((s) => (s.status[i].verfuegbar = w === undefined ? std.verfuegbar : !!w)) };
    }
    // Ausrückzeiten (Minuten im Menü, Sekunden in der App)
    if ((m = key.match(/^(boden|nef|nah)_([0-3])$/))) {
      const art = m[1] as "boden" | "nef" | "nah";
      const n = Number(m[2]);
      const feld = `${art}${n < 2 ? "Tag" : "Nacht"}` as "bodenTag" | "bodenNacht" | "nefTag" | "nefNacht" | "nahTag" | "nahNacht";
      const j = n % 2;
      return {
        l: () => Math.round(set().ausrueck[feld][j] / 6) / 10,
        s: (w) =>
          simSetzen((s) => {
            const paar = [...s.ausrueck[feld]] as [number, number];
            paar[j] = w === undefined ? defaultAusrueck()[feld][j] : Math.max(0, Math.round(zahl(w, paar[j] / 60) * 60));
            s.ausrueck[feld] = paar;
          }),
      };
    }
    // Töne je Ereignis
    if ((m = key.match(/^(te_[A-Za-z]+)(_l)?$/)) && TON_KEYS[m[1]]) {
      const ev = TON_KEYS[m[1]];
      const jetzt = () => pers().sounds[ev] ?? { quelle: STANDARD_SOUND[ev], laut: 70 };
      if (m[2])
        return {
          l: () => zahl(jetzt().laut, 70),
          s: (w) => (setzePers({ sounds: { ...pers().sounds, [ev]: { quelle: jetzt().quelle, laut: w === undefined ? 70 : grenze(zahl(w, 70), 0, 100) } } }), true),
        };
      return {
        l: () => quelleText(jetzt().quelle) || quelleText(STANDARD_SOUND[ev]),
        s: (w) => {
          const q = w === undefined ? STANDARD_SOUND[ev] : textQuelle(ev, w);
          if (!q) return false;
          const laut = zahl(jetzt().laut, 70);
          setzePers({ sounds: { ...pers().sounds, [ev]: { quelle: q, laut } } });
          if (w !== undefined) spielen(ev, q, laut);
          return true;
        },
      };
    }
    // Sprach- und Funktasten (KeyboardEvent.code)
    if (SPRACH_TASTEN[key]) {
      const feld = SPRACH_TASTEN[key];
      return {
        l: () => sprachTastenName(sprachPrefs()[feld]),
        s: (w) => sprachTasteSetzen(feld, w === undefined ? SPRACH_STANDARD[feld] : LEER(w) ? "" : String(w)),
      };
    }
    // Pilot-Tasten
    if (PILOT_TASTEN[key]) {
      const a = PILOT_TASTEN[key];
      return {
        l: () => pilotTastenName(belegung().taste[a]),
        s: (w) => pilotTasteSetzen(a, w === undefined ? standardBelegung().taste[a] : LEER(w) ? undefined : String(w)),
      };
    }
    // Tastenkürzel
    if (KUERZEL[key]) {
      const id = KUERZEL[key];
      return {
        l: () => (pers().kuerzel[id] ? kuerzelText(pers().kuerzel[id]) : "–"),
        s: (w) => kuerzelSetzen(id, w === undefined ? KUERZEL_STANDARD[id] : LEER(w) ? "" : String(w)),
      };
    }
    return undefined;
  }

  return {
    lesen(key) {
      try {
        return dynamisch(key)?.l();
      } catch {
        return undefined;
      }
    },
    schreiben(key, wert) {
      const e = dynamisch(key);
      if (!e) return false;
      try {
        return e.s(wert);
      } catch (err) {
        console.warn("Einstellung", key, err);
        return false;
      }
    },
    optionen(key) {
      if (key === "fv") return fvListe().map(([, v]) => v.name);
      if (key === "tdev" || key === "sdev") return geraetOptionen();
      if (key === "mic") return mikroOptionen();
      if (key === "wlage") return Object.values(WETTER_LABEL);
      if (TON_KEYS[key]) return tonOptionen(TON_KEYS[key]);
      if (key === "pt_alarm" || key === "pt_abruf") return alarmTonListe().map((x) => x.name);
      return undefined;
    },
    probe(key) {
      if (key === "pt_alarm" || key === "pt_abruf") {
        const q = alarmPrefs()[key === "pt_alarm" ? "alarm" : "abruf"];
        void probeSpielen(q);
        return `▶ ${alarmTonListe().find((x) => x.id === q)?.name ?? q}`;
      }
      const m = key.match(/^(te_[A-Za-z]+)$/);
      if (m && TON_KEYS[m[1]]) {
        const v = this.lesen(key);
        return `▶ ${String(v ?? "")}`;
      }
      return undefined;
    },
    taste(key, e) {
      const loeschen = e.key === "Delete" || e.key === "Backspace" || e.code === "Delete" || e.code === "Backspace";
      if (KUERZEL[key]) {
        if (loeschen) return kuerzelSetzen(KUERZEL[key], "");
        const t = tasteVon(e);
        if (!t || ["Ctrl", "Alt", "Shift"].includes(t) || /(^|\+)(Ctrl|Alt|Shift)$/.test(t)) return false;
        return kuerzelSetzen(KUERZEL[key], t);
      }
      if (SPRACH_TASTEN[key]) {
        if (loeschen) return sprachTasteSetzen(SPRACH_TASTEN[key], "");
        if (!e.code || e.code === "Enter" || e.code === "NumpadEnter") return false;
        return sprachTasteSetzen(SPRACH_TASTEN[key], e.code);
      }
      if (PILOT_TASTEN[key]) {
        if (loeschen) return pilotTasteSetzen(PILOT_TASTEN[key], undefined);
        if (!e.code || e.code === "Enter" || e.code === "NumpadEnter") return false;
        return pilotTasteSetzen(PILOT_TASTEN[key], e.code);
      }
      return false;
    },
    tasteText(key) {
      if (KUERZEL[key] || SPRACH_TASTEN[key] || PILOT_TASTEN[key]) {
        const v = dynamisch(key)?.l();
        return typeof v === "string" ? v : undefined;
      }
      return undefined;
    },
  };
}
