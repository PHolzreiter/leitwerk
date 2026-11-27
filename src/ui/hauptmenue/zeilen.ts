/**
 * Echte Zeilen für die Einstellungsseiten des Hauptmenüs (statt der Beispieldaten aus dem Design).
 * Die Komponente ruft zeilen(seite, bausteine); undefined = Zeilen aus dem Design.
 * Asynchrone Daten (Status, Listen) werden in laden() einmal geholt, zwischengespeichert und nach jeder Aktion aufgefrischt.
 * Im Hauptmenü gibt es keine Dialoge: Rückfragen über cfm, Ergebnisse als Chip (Rückgabe-Text bzw. throw).
 */
import { KLANG_DATEIEN } from "../telefonKlang";
import { statusFarbeStandard } from "../statusFarben";
import { FARBEN, type Bausteine, type Knopf, type Zeile, type ZeilenQuelle } from "./vertrag";
import { discordAn, discordVerbunden } from "../discord";
import { decodeText, inTauri, saveTextFile } from "../../platform";
import { store } from "../../data/store";
import {
  KIND_FILE,
  KIND_LABEL,
  STATION_TYPES,
  VEHICLE_CATEGORIES,
  type Einsatzvorlage,
  type Hospital,
  type Kind,
  type KindMap,
  type Poi,
  type Station,
  type Vehicle,
  type VehicleCategory,
} from "../../data/model";
import { exportCsv, landeplatzLesen, landeplatzText, zufahrtLesen, zufahrtText } from "../../data/schema";
import { akutAbteilung, AKUT, EINRICHTUNGEN, einrichtung } from "../../data/klinik";
import { ORT_KATEGORIEN, kategorieLabel, kategorienText, poiKategorien } from "../../data/orte";
import { planKurz, planLesen } from "../../sim/dienst";
import { FUNK_FARBEN, FUNKGRUPPEN } from "../../sim/funkgruppen";
import { KATEGORIE_LABEL, KATEGORIEN, NOTARZT_LABEL, defaultSettings, defaultStufeFuer, stufeRaten, type Kategorie, type NotarztRegel, type Settings, type StufeDef } from "../../sim/settings";
import { allCodes, codeKategorien } from "../../sim/codes";
import { ktCodes } from "../../sim/ktCodes";
import { sim } from "../../sim/engine";
import { geoStatus, regionSetzen, searchAddress, REGIONEN, type GeoStatus } from "../../sim/geo";
import { GRUNDPAKET, appVersion, formatBytes, installPack, packSize, packsChanged, packsLocal, packsManifest, removePack, type Pack, type PacksLocal, type UpdateInfo } from "../../updates";
import { updateInfo, updateInstallieren, onUpdate, updateJetztPruefen } from "../updateDienst";
import { ABLAGE_INFO, ablageBasis, ablageListe, ablageLesen, ablageLoeschen, ablageName, ablageSichern, ablageSpeichern, ablageZeigen, type AblageDatei, type AblageOrdner } from "../../net/ablage";
import { ordnerZeigen } from "../../net/spielstandOrdner";
import { pers, onPers, setzePers } from "../ws/persoenlich";
import { STATUS_BEDEUTUNG } from "../settingsView";
import { DATEI_REGELN, EREIGNIS_LABEL, STANDARD_SOUND, VORLAGEN as TON_VORLAGEN, dateiHinzufuegen, dateiLoeschen, eigeneDateien, spielen, type EigeneDatei, type SoundEreignis } from "../sounds";
import { anrufKiModus, livePrefs, liveTesten, prefsHoerer, schluesselDa, schluesselGeprueft } from "../../abfrage/liveKi";
import { MODELLE as KI_MODELLE, STUFE_LABEL, empfohleneStufe, kiBeenden, kiChat, kiInstallieren, kiModellLaden, kiModellLoeschen, kiPrefs, kiStarten, kiStatus, rechnerRam, setKiPrefs, type KiStatus } from "../../abfrage/ki";
import { MODELLE as SPRACH_MODELLE, PIPER_STIMMEN, funkSagt, mikroTesten, modellLaden, modellLoeschen, piperLaden, piperLoeschen, piperStatus, probe, setzeSprache, sprachPrefs, sprachStatus, tastenName } from "../sprache";
import { einrichtenSetzen, hoerenOk, mikroOk, probeOk, tastenOk } from "../einrichtenStand";
import { audioArt } from "./bindung";
import { LAYOUT_KEY, anordnungAnwenden, anordnungen, anordnungImportieren, anordnungLoeschen, dock, onPanelsGeaendert } from "../ws/arbeitsplatz";
import { alleFaelle, brauchtVon, eingebauterFall, faelleGeaendert, fallpaketExport, fallpaketImport, istFallAktiv, istGeaendert, kompetenzRang, type FallVorlage } from "../../abfrage/faelle";
import { faellePruefen } from "../../abfrage/faellePruefen";
import { fallEditorOeffnen } from "../fallEditor";
import {
  TEILE,
  aktivDatei,
  ktBeispiel,
  ktCodesLesen,
  ktKiAnleitung,
  teilAktivieren,
  teilHochladen,
  teilListe,
  teilLoeschen,
  type Teil,
  type TeilDatei,
} from "../codesaetze";
import BEISPIEL_NOTRUF from "../../../data/beispiele/beispiel_codesystem.json?raw";
import { STANDARD_CODESYSTEM_TEXT } from "../../data/standard";
import { ktEditorOeffnen } from "../ktCodeEditor";
import { namenVorlageSichern } from "../ablageStart";
import { NAMEN_VORLAGE, namenKiAnleitung, namenLesen as ersetzungenLesen, namenVorlage } from "../../data/namen";
import { standardRecords } from "../../data/standard";

const { ok: OK, grau: GRAU, gelb: GELB, blau: BLAU, rot: ROT } = FARBEN;
const NUR_PROGRAMM = "nur im Programm";
const PRUEFT = "wird geprüft …";

// ------------------------------------------------------------------ Modul-Zustand (bleibt über das Schließen des Menüs erhalten)

/** laufende Downloads/Installationen: Schlüssel → Fortschrittstext */
const ladeStand: Record<string, string> = {};
/** Werte unbekannter Schlüssel, die die Komponente meldet (Felder z_…, omod, Schalter kp_…, Suche tq_…) */
const zw: Record<string, unknown> = {};
/** Dropdown „Aktiv“ der Eigenen Dateien: Schlüssel → Wechsel, Zähler je Reiter, letzte Rückmeldung */
const wahlen: Record<string, (v: string) => void> = {};
const wahlStand: Record<string, number> = {};
const wahlMeldung: Record<string, { t: string; dot: string }> = {};
/** Fehler beim Speichern einer Tabellenzeile (je Seite), bis zum nächsten erfolgreichen Speichern */
const tabFehler: Record<string, string> = {};

/** Verbindung zur gerade offenen Quelle (für feldWert und Downloads, die nach dem Schließen weiterlaufen) */
let aktiv: { bald(): void; regionSchalten(region: string, an: boolean): void } | null = null;

/** Die Komponente meldet Werte von Schlüsseln, die bindung.ts nicht kennt. */
export function feldWert(key: string, wert: unknown): void {
  zw[key] = wert;
  if (key.startsWith("ak_")) return void wahlen[key]?.(String(wert ?? ""));
  const m = key.match(/^kp_(.+)$/);
  if (m) aktiv?.regionSchalten(m[1], !!wert);
  else if (key.startsWith("tq_")) aktiv?.bald();
}

const zahl = (n: number) => n.toLocaleString("de-DE");
const komma = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const prozent = (d: number, t: number) => `${Math.min(100, Math.round((d / Math.max(1, t)) * 100))} %`;
const fehlerText = (e: unknown) => String((e as Error)?.message ?? e);
const norm = (x: unknown) => String(x ?? "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Datei als Text (UTF-8 bzw. wie pickTextFile) */
async function dateiText(f: File): Promise<string> {
  return decodeText(await f.arrayBuffer());
}

// ------------------------------------------------------------------ Quelle

export function zeilenQuelle(neuZeichnen: () => void): { zeilen: ZeilenQuelle; laden(): void; beenden(): void } {
  // ---------------- Zwischenspeicher
  const c: {
    dateien?: EigeneDatei[];
    ki?: KiStatus | null;
    ram?: number;
    piper?: string[];
    whisper?: string[];
    teile?: Record<Teil, TeilDatei[]>;
    namen?: AblageDatei[];
    packs?: Pack[] | null;
    packsFehler?: string;
    local?: PacksLocal | null;
    geo?: GeoStatus | null;
    version?: string;
    update?: UpdateInfo | null;
    basis?: string;
  } = {};

  let beendet = false;
  let zt = 0;
  const neu = () => {
    if (!beendet) neuZeichnen();
  };
  /** gedrosselt neu zeichnen (Fortschritt) */
  const bald = () => {
    if (zt || beendet) return;
    zt = window.setTimeout(() => {
      zt = 0;
      neu();
    }, 200);
  };
  const tauri = inTauri();

  // ---------------- Laden je Bereich
  const dateienLaden = async () => {
    c.dateien = (await eigeneDateien().catch(() => [] as EigeneDatei[])).filter((d) => d.art !== "alarm");
    neu();
  };
  const kiLaden = async () => {
    if (!tauri) return;
    c.ki = await kiStatus().catch(() => null);
    neu();
  };
  const ramLaden = async () => {
    if (!tauri) return;
    c.ram = await rechnerRam().catch(() => 0);
    neu();
  };
  const piperLaden2 = async () => {
    if (!tauri) return;
    c.piper = await piperStatus().catch(() => []);
    neu();
  };
  const whisperLaden = async () => {
    if (!tauri) return;
    c.whisper = (await sprachStatus().catch(() => ({ modelle: [] as string[], ordner: "" }))).modelle;
    neu();
  };
  const namenLaden = async () => {
    try {
      // Vorlage immer im Ordner (neu geschrieben, falls sie fehlt oder noch leer und veraltet ist)
      await namenVorlageSichern().catch(() => undefined);
      const l = await ablageListe("Namen");
      c.namen = l.filter((d) => /\.(csv|txt)$/i.test(d.datei)).sort((a, b) => (a.datei === NAMEN_VORLAGE ? -1 : b.datei === NAMEN_VORLAGE ? 1 : a.datei.localeCompare(b.datei, "de")));
    } catch {
      c.namen = [];
    }
    neu();
  };
  const teileLaden = async () => {
    const t = Object.keys(TEILE) as Teil[];
    const l = await Promise.all(t.map((x) => teilListe(x).catch(() => [] as TeilDatei[])));
    c.teile = Object.fromEntries(t.map((x, i) => [x, l[i]])) as Record<Teil, TeilDatei[]>;
    neu();
  };
  const packsLaden = async () => {
    if (!tauri) return;
    c.local = await packsLocal().catch(() => null);
    c.geo = await geoStatus().catch(() => null);
    neu();
    try {
      c.packs = await packsManifest();
      c.packsFehler = undefined;
    } catch (e) {
      c.packsFehler = fehlerText(e);
      c.packs ??= null;
    }
    neu();
  };
  const programmLaden = async () => {
    c.version = await appVersion().catch(() => "?");
    c.update = updateInfo();
    c.basis = await ablageBasis().catch((e) => fehlerText(e));
    neu();
  };

  // ---------------- Beobachter
  let storeStand = 0;
  const aus: (() => void)[] = [];
  const beobachten = () => {
    aus.push(
      store.onChange(() => {
        storeStand++;
        bald();
      }),
    );
    aus.push(onPers(() => bald()));
    aus.push(faelleGeaendert(() => bald()));
    aus.push(onPanelsGeaendert(() => bald()));
    aus.push(
      onUpdate(() => {
        c.update = updateInfo();
        bald();
      }),
    );
    const lp = () => bald();
    prefsHoerer.add(lp);
    aus.push(() => prefsHoerer.delete(lp));
  };

  aktiv = {
    bald,
    regionSchalten(region, an) {
      if (!tauri) return;
      void regionSetzen(region, an)
        .then(() => packsChanged())
        .catch((e) => console.warn("Region", e))
        .finally(() => void packsLaden());
    },
  };

  // ---------------- Knopf-Helfer
  /** Aktion: danach auffrischen und neu zeichnen; Fehler gehen als Warn-Chip an die Komponente */
  const tun = (fn: () => unknown, nachher?: () => Promise<void> | void) => async (): Promise<string | void> => {
    try {
      const r = await fn();
      return typeof r === "string" ? r : undefined;
    } finally {
      try {
        await nachher?.();
      } catch {
        /* egal */
      }
      neu();
    }
  };
  const knopf = (l: string, fn: () => unknown, x: Partial<Knopf> = {}, nachher?: () => Promise<void> | void): Knopf => ({ l, ...x, act: tun(fn, nachher) });
  const dateiKnopf = (l: string, accept: string, fn: (f: File) => unknown, nachher?: () => Promise<void> | void): Knopf => ({
    l,
    datei: { accept, f: (d: File[]) => tun(() => fn(d[0]), nachher)() },
  });

  /** Fortschritt in ladeStand führen, während fn läuft */
  async function mitStand<T>(k: string, start: string, fn: (setz: (t: string) => void) => Promise<T>): Promise<T> {
    if (ladeStand[k]) throw new Error("Läuft schon");
    ladeStand[k] = start;
    bald();
    try {
      return await fn((t) => {
        ladeStand[k] = t;
        aktiv?.bald();
      });
    } finally {
      delete ladeStand[k];
      aktiv?.bald();
    }
  }

  // ================================================================== Seiten

  // ---------------- Mein Platz: Darstellung → Funkgruppen
  function fgfarben(b: Bausteine): Zeile[] {
    const deine = store.settings.funkgruppe ?? "NÖ-03";
    return [
      ...FUNKGRUPPEN.map((g) => b.C(g.id + (g.id === deine ? " (deine)" : ""), "fgc_" + g.id, FUNK_FARBEN[g.id], g.bezirke, ["fgo_" + g.id, true])),
      b.B("", [knopf("Standardfarben", () => (setzePers({ funkFarben: {}, funkGruppen: {} }), "Zurückgesetzt"), { cfm: "Alle Funkgruppen wieder einblenden und die Standardfarben verwenden?" })]),
    ];
  }

  // ---------------- Farben → Statusfarben
  function statusfarben(b: Bausteine): Zeile[] {
    return [
      ...store.settings.status.map((s, i) => b.C(`${s.nummer} – ${s.name}`, "sf_st" + (i + 1), statusFarbeStandard(s.key), bedeutung(s.key))),
      b.B("", [knopf("Farben der Leitstelle verwenden", () => (setzePers({ statusFarben: {} }), "Zurückgesetzt"), { cfm: "Eigene Statusfarben verwerfen?" })]),
    ];
  }

  // ---------------- Telefon → Töne je Ereignis
  const TON_KEY: Record<SoundEreignis, string> = { notruf: "te_notruf", kt: "te_kt", anklopfen: "te_anklopfen", funk: "te_funk", funkDringend: "te_funkD", chat: "te_chat", warnung: "te_warn" };
  function toene(b: Bausteine): Zeile[] {
    return (Object.entries(EREIGNIS_LABEL) as [SoundEreignis, string][]).map(([ev, label]) => b.TON(label, TON_KEY[ev], TON_VORLAGEN[STANDARD_SOUND[ev].slice(8)]?.name ?? ""));
  }

  // ---------------- Telefon → Eigene Tondateien
  function tondateien(b: Bausteine): Zeile[] {
    const out: Zeile[] = [];
    const ds = c.dateien;
    if (!ds) out.push(b.I("Eigene Dateien", PRUEFT, "", GRAU));
    else if (!ds.length) out.push(b.I("Eigene Dateien", "noch keine", "Unten hochladen – danach unter „Töne je Ereignis“ auswählbar", GRAU));
    else {
      const so = pers().sounds;
      for (const d of ds) {
        const fuer = (Object.keys(EREIGNIS_LABEL) as SoundEreignis[]).filter((ev) => so[ev]?.quelle === `datei:${d.id}`).map((ev) => `„${EREIGNIS_LABEL[ev]}“`);
        out.push(
          b.IT(d.name, `${komma(d.sek)} s · ${Math.max(1, Math.round(d.bytes / 1000))} KB${fuer.length ? ` · für ${fuer.join(", ")}` : ""}`, "", "", {
            btns: [
              knopf("▶", () => (spielen("chat", `datei:${d.id}`, 70), "▶ läuft")),
              knopf(
                "Löschen",
                async () => {
                  await dateiLoeschen(d.id);
                  const s2 = { ...pers().sounds };
                  for (const [k, v] of Object.entries(s2)) if (v.quelle === `datei:${d.id}`) delete s2[k];
                  setzePers({ sounds: s2 });
                  return "Gelöscht";
                },
                { cfm: `„${d.name}“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.` },
                dateienLaden,
              ),
            ],
          }),
        );
      }
    }
    const hoch = (fuer: "klingel" | "kurz") => async (f: File) => {
      const d = await dateiHinzufuegen(f, fuer);
      ablageSichern("Töne", f.name, await f.arrayBuffer());
      return `„${d.name}“ gespeichert (${komma(d.sek)} s)`;
    };
    const accept = ".mp3,.wav,audio/mpeg,audio/wav";
    out.push(
      b.B(
        "Hochladen",
        [dateiKnopf("Klingelton …", accept, hoch("klingel"), dateienLaden), dateiKnopf("Kurzer Ton …", accept, hoch("kurz"), dateienLaden)],
        `Klingelton bis ${DATEI_REGELN.klingel.maxSek} s, kurzer Ton bis ${DATEI_REGELN.kurz.maxSek} s · MP3, WAV`,
      ),
    );
    const summe = (ds ?? []).reduce((a, d) => a + d.bytes, 0);
    out.push(b.I("Belegt", ds ? `${komma(summe / 1_000_000, 2)} MB` : "…", "", GRAU));
    return out;
  }

  // ---------------- Anrufe & KI
  const hatModell = (name: string) => !!c.ki?.modelle.some((m) => m === name || m.startsWith(name));
  const TEST_GESPRAECH = [
    { role: "system" as const, content: "Du spielst eine echte Person, die beim Notruf 144 in Niederösterreich anruft: Dein Vater (78) ist im Garten von der Leiter gefallen und blutet am Kopf, er ist wach, aber ganz blass. Du bist aufgeregt. Sag nur, was du ins Telefon sprichst: kurz, umgangssprachlich österreichisch, keine Listen." },
    { role: "user" as const, content: "Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?" },
    { role: "assistant" as const, content: "Gartengasse 4 in Gföhl, bitte schnell!" },
    { role: "user" as const, content: "Leitstelle: Was ist denn passiert?" },
  ];
  /** Probegespräch mit der lokalen KI (wie Testanruf in kiView.ts) */
  async function lokalerTest(): Promise<{ antwort: string; s1: number; s2: number }> {
    if (!tauri) throw new Error("Die lokale KI gibt es nur im Programm");
    const s = await kiStatus();
    c.ki = s;
    if (!s.installiert) throw new Error("Ollama ist nicht installiert");
    if (!s.laeuft) throw new Error("Ollama läuft nicht – erst starten");
    const m = kiPrefs().modell;
    if (!hatModell(m)) throw new Error(`Modell ${m} ist nicht geladen (Sprachmodelle → Laden)`);
    const t0 = performance.now();
    let erstes = 0;
    const antwort = await kiChat(TEST_GESPRAECH, () => {
      if (!erstes) erstes = performance.now();
    });
    return { antwort, s1: ((erstes || performance.now()) - t0) / 1000, s2: (performance.now() - t0) / 1000 };
  }
  const geminiTest = async () => {
    if (!schluesselDa()) throw new Error("Noch kein Schlüssel – unter „Einrichten“ einfügen");
    return `Gemini antwortet: ${await liveTesten()}`;
  };
  function ollamaZeile(b: Bausteine): Zeile {
    const hint = "Läuft auf deinem PC – ohne Internet, ohne Konto";
    if (!tauri) return b.B("Lokale KI (Ollama)", [], hint, { chip: NUR_PROGRAMM, dot: GRAU });
    if (ladeStand.ollama) return b.B("Lokale KI (Ollama)", [], hint, { chip: ladeStand.ollama, dot: BLAU });
    const s = c.ki;
    if (s === undefined) return b.B("Lokale KI (Ollama)", [], hint, { chip: PRUEFT, dot: GRAU });
    if (s === null) return b.B("Lokale KI (Ollama)", [knopf("Prüfen", () => undefined, {}, kiLaden)], hint, { chip: "Status unbekannt", dot: GELB });
    if (!s.installiert)
      return b.B(
        "Lokale KI (Ollama)",
        [
          knopf(
            "Installieren",
            () =>
              mitStand("ollama", "wird heruntergeladen …", async (setz) => {
                const msg = await kiInstallieren((f) => setz(f.total ? `${f.text || "lädt"} ${prozent(f.done, f.total)}` : f.text || "läuft …"));
                for (let i = 0; i < 20; i++) {
                  await warte(1500);
                  if ((await kiStatus()).laeuft) break;
                }
                return msg || "Installiert";
              }),
            {},
            kiLaden,
          ),
        ],
        hint,
        { chip: "nicht installiert", dot: GRAU },
      );
    if (!s.laeuft)
      return b.B(
        "Lokale KI (Ollama)",
        [
          knopf(
            "Starten",
            async () => {
              await kiStarten();
              for (let i = 0; i < 10; i++) {
                if ((await kiStatus()).laeuft) return "Läuft";
                await warte(1000);
              }
              throw new Error("Ollama startet nicht");
            },
            {},
            kiLaden,
          ),
        ],
        hint,
        { chip: `installiert${s.version ? ` (${s.version})` : ""} · läuft nicht`, dot: GELB },
      );
    return b.B("Lokale KI (Ollama)", [knopf("Beenden", async () => (await kiBeenden(), "Beendet"), {}, kiLaden)], hint, { chip: "installiert · läuft", dot: OK });
  }
  // ---------------- Gemini einrichten
  const AI_STUDIO = "https://aistudio.google.com/apikey";
  function gemini(b: Bausteine): Zeile[] {
    return [
      b.B(
        "1. Schlüssel holen",
        [
          knopf("Seite von Google öffnen", async () => {
            if (!tauri) {
              window.open(AI_STUDIO, "_blank", "noopener");
              return "Im Browser geöffnet";
            }
            // Das Programm kann keine Webseiten öffnen: Adresse zum Einfügen in den Browser kopieren
            try {
              await navigator.clipboard.writeText(AI_STUDIO);
              return "Adresse kopiert – im Browser einfügen: aistudio.google.com/apikey";
            } catch {
              return "Im Browser öffnen: aistudio.google.com/apikey";
            }
          }),
        ],
        "Mit deinem Google-Konto anmelden, „API-Schlüssel erstellen“, kopieren",
      ),
      b.F("2. Schlüssel einfügen", "gkey", "Schlüssel einfügen …", schluesselGeprueft() ? "✓ geprüft – Gemini ist bereit" : schluesselDa() ? "Noch nicht geprüft" : "", {
        pw: true,
        btns: [
          knopf("Prüfen", async () => {
            if (livePrefs().schluessel.trim().length < 20) throw new Error("Das sieht nicht nach einem Schlüssel aus – bitte ganz kopieren");
            return `Schlüssel gültig – ${await liveTesten()}`;
          }),
        ],
      }),
      b.B("3. Ausprobieren", [knopf("Testanruf mit Gemini", geminiTest)]),
    ];
  }

  // ---------------- Sprachmodelle (Ollama)
  async function kiModellHolen(name: string): Promise<string> {
    const s = await kiStatus();
    c.ki = s;
    if (!s.laeuft) throw new Error("Ollama läuft nicht – erst unter „Telefon, Funk & KI“ starten");
    await mitStand(`ki:${name}`, "Download startet …", (setz) => kiModellLaden(name, (f) => setz(f.total ? `wird geladen … ${prozent(f.done, f.total)}` : f.text || "wird geladen …")));
    return `${name} geladen`;
  }
  function modelle(b: Bausteine): Zeile[] {
    const out: Zeile[] = [];
    if (!tauri) {
      out.push(b.I("Dieser Rechner", NUR_PROGRAMM, "Die lokale KI gibt es nur im installierten Programm", GRAU));
      return out;
    }
    const ram = c.ram ?? 0;
    const empf = ram ? empfohleneStufe(ram) : null;
    out.push(
      b.I(
        "Dieser Rechner",
        c.ram === undefined ? PRUEFT : ram ? `${ram} GB Arbeitsspeicher${empf ? ` · empfohlen: ${STUFE_LABEL[empf]}` : ""}` : "Arbeitsspeicher unbekannt",
        "Größere Modelle sprechen natürlicher, brauchen aber mehr Speicher und antworten langsamer",
        BLAU,
      ),
    );
    const s = c.ki;
    if (s && !s.laeuft) out.push(b.I("Ollama", s.installiert ? "läuft nicht" : "nicht installiert", "Laden und Löschen geht nur, wenn Ollama läuft (Telefon, Funk & KI)", GELB));
    const gewaehlt2 = kiPrefs().modell;
    const zeile = (name: string, label: string, hint: string, braucht: number) => {
      const da = hatModell(name);
      const istAktiv = gewaehlt2 === name;
      const lade = ladeStand[`ki:${name}`];
      const chip = lade ?? (istAktiv && da ? "aktiv" : istAktiv ? "gewählt · nicht geladen" : da ? "geladen" : ram && braucht > ram ? "zu groß" : "");
      const dot = lade ? BLAU : istAktiv && da ? OK : istAktiv ? GELB : da ? GRAU : chip ? GELB : "";
      const btns: Knopf[] = [];
      if (s === undefined) {
        out.push(b.IT(label, hint, PRUEFT, GRAU));
        return;
      }
      if (!lade) {
        if (da && !istAktiv) btns.push(knopf("Verwenden", () => (setKiPrefs({ modell: name }), "Wird verwendet"), {}, kiLaden));
        if (!da) {
          const zuGross = ram > 0 && braucht > ram;
          btns.push(
            knopf(zuGross ? "Trotzdem laden" : "Laden", () => kiModellHolen(name), zuGross ? { cfm: `${name} braucht etwa ${braucht} GB, dieser Rechner hat ${ram} GB. Es kann sein, dass Ollama sehr langsam wird oder das Modell gar nicht lädt. Kaputt geht nichts – du kannst es wieder löschen. Trotzdem laden?` } : {}, kiLaden),
          );
          if (!istAktiv) btns.push(knopf("Verwenden", () => (setKiPrefs({ modell: name }), "Gewählt – noch laden"), {}, kiLaden));
        }
        if (da)
          btns.push(
            knopf("Löschen", async () => (await kiModellLoeschen(name), "Gelöscht"), { cfm: `${name} löschen?${istAktiv ? " Es ist gerade aktiv – danach antwortet die KI einfacher." : ""} Du kannst es jederzeit wieder laden.` }, kiLaden),
          );
      }
      out.push(b.IT(label, hint, chip, dot, { btns }));
    };
    for (const m of KI_MODELLE) zeile(m.name, `${STUFE_LABEL[m.stufe]} · ${m.name}`, `${komma(m.gb)} GB · ab ${m.ram} GB Arbeitsspeicher · ${m.info}${m.stufe === empf ? " · empfohlen" : ""}`, m.ram);
    // geladene Modelle, die nicht in der Liste stehen
    for (const x of s?.modelle ?? []) if (!KI_MODELLE.some((m) => x === m.name || x.startsWith(m.name))) zeile(x, `Eigenes · ${x}`, "aus der Ollama-Bibliothek", 0);
    if (gewaehlt2 && !KI_MODELLE.some((m) => m.name === gewaehlt2) && !(s?.modelle ?? []).some((x) => x === gewaehlt2 || x.startsWith(gewaehlt2))) zeile(gewaehlt2, `Eigenes · ${gewaehlt2}`, "aus der Ollama-Bibliothek", 0);
    out.push(
      b.F("Anderes Modell", "omod", "z. B. llama3.1:8b", "Name aus der Ollama-Bibliothek – wird geladen und verwendet", {
        btns: [
          knopf(
            "Laden",
            async () => {
              const n = String(zw.omod ?? "").trim();
              if (!n) throw new Error("Bitte einen Modellnamen eingeben");
              await kiModellHolen(n);
              setKiPrefs({ modell: n });
              return `${n} geladen und verwendet`;
            },
            {},
            kiLaden,
          ),
        ],
      }),
    );
    return out;
  }

  // ---------------- Stimmen (Piper)
  function piper(b: Bausteine): Zeile[] {
    if (!tauri) return [b.I("Stimmen (Piper)", NUR_PROGRAMM, "Piper-Stimmen gibt es nur im installierten Programm – im Browser liest der Computer vor", GRAU)];
    const da = c.piper;
    return PIPER_STIMMEN.map((v) => {
      const m = v.label.match(/^(.*?)\s*\((.*)\)$/);
      const name = m ? m[1] : v.label;
      const zusatz = m ? m[2] : v.g === "w" ? "Frau" : "Mann";
      const lade = ladeStand[`piper:${v.name}`];
      const ist = !!da?.includes(v.name);
      const btns: Knopf[] = [];
      if (da && !lade) {
        if (ist) {
          btns.push(knopf("▶", () => (probe(v.g, v.name), "▶ Probe")));
          btns.push(knopf("Löschen", async () => (await piperLoeschen(v.name), "Gelöscht"), { cfm: `Stimme „${name}“ löschen?` }, piperLaden2));
        } else
          btns.push(
            knopf(
              "Laden",
              async () => {
                await mitStand(`piper:${v.name}`, "startet …", (setz) => piperLaden(v.name, (d, t, entpacken) => setz(entpacken ? "wird entpackt …" : t ? `wird geladen … ${prozent(d, t)}` : `${Math.round(d / 1e6)} MB`)));
                if (sprachPrefs().stimmeArt !== "piper") setzeSprache({ stimmeArt: "piper" });
                return `Stimme „${name}“ ist bereit`;
              },
              {},
              piperLaden2,
            ),
          );
      }
      return b.IT(name, `${zusatz} · ${v.mb} MB`, lade ?? (da === undefined ? PRUEFT : ist ? "geladen" : ""), lade ? BLAU : ist ? OK : "", { btns });
    });
  }

  // ---------------- Erkennung (Whisper)
  function whisper(b: Bausteine): Zeile[] {
    if (!tauri) return [b.I("Erkennung (Whisper)", NUR_PROGRAMM, "Die Spracherkennung auf dem Rechner gibt es nur im installierten Programm", GRAU)];
    const da = c.whisper;
    const gew = sprachPrefs().modell;
    return SPRACH_MODELLE.map((m) => {
      const t = m.label.split(/\s+–\s+/);
      const name = t[0];
      const zusatz = t.slice(1).join(" – ");
      const lade = ladeStand[`wh:${m.name}`];
      const ist = !!da?.includes(m.name);
      const istAktiv = ist && gew === m.name;
      const btns: Knopf[] = [];
      if (da && !lade) {
        if (ist && !istAktiv) btns.push(knopf("Verwenden", () => (setzeSprache({ modell: m.name }), "Wird verwendet")));
        if (!ist)
          btns.push(
            knopf(
              "Laden",
              async () => {
                await mitStand(`wh:${m.name}`, "startet …", (setz) => modellLaden(m.name, (d, tt) => setz(tt ? `wird geladen … ${prozent(d, tt)}` : `${Math.round(d / 1e6)} MB`)));
                setzeSprache({ modell: m.name });
                return `„${name}“ ist bereit und wird verwendet`;
              },
              {},
              whisperLaden,
            ),
          );
        if (ist) btns.push(knopf("Löschen", async () => (await modellLoeschen(m.name), "Gelöscht"), { cfm: `Modell „${name}“ löschen?${istAktiv ? " Es wird gerade verwendet." : ""}` }, whisperLaden));
      }
      const groesse = m.mb >= 1000 ? `${komma(m.mb / 1000)} GB` : `${m.mb} MB`;
      return b.IT(name, `${groesse}${zusatz ? ` · ${zusatz}` : ""}`, lade ?? (da === undefined ? PRUEFT : istAktiv ? "aktiv" : ist ? "geladen" : ""), lade ? BLAU : istAktiv ? OK : ist ? GRAU : "", { btns });
    });
  }

  // ================================================================== Mein Platz (Beta 71): für neue Spieler geordnet

  /** Pegel als Balken (0–1) */
  const balken = (p: number) => {
    const n = Math.round(Math.max(0, Math.min(1, p)) * 10);
    return `${"▮".repeat(n)}${"▯".repeat(10 - n)}`;
  };
  /** Mikrofon testen: 4 Sekunden, Pegel läuft im Chip der Zeile „Pegel“ mit */
  async function mikroProbe(welches: "telefon" | "funk"): Promise<string> {
    const k = `pegel:${welches}`;
    return mitStand(k, "Jetzt sprechen …", async (setz) => {
      const r = await mikroTesten(4, { welches, pegel: (p) => setz(`${balken(p)}  sprich jetzt …`) });
      if (!r.startsWith("⚠")) {
        if (welches === "telefon") einrichtenSetzen({ mikro: sprachPrefs().mikro });
        return r;
      }
      throw new Error(r.replace(/^⚠\s*/, ""));
    });
  }
  const pegelZeile = (b: Bausteine, welches: "telefon" | "funk") => {
    const t = ladeStand[`pegel:${welches}`];
    return t ? [b.I("Pegel", t, "Die Balken sollen beim Sprechen deutlich ausschlagen", BLAU)] : [];
  };
  /** Probeton über Kopfhörer/Lautsprecher: Klingeln und eine Stimme */
  const hoerProbe = () => {
    spielen("notruf", undefined, 70);
    setTimeout(() => probe("w"), 1800);
    return "▶ Klingeln, dann eine Stimme – hörst du beides?";
  };
  const funkProbe = () => {
    const p = sprachPrefs();
    if (!p.funkVorlesen) throw new Error("„Funk vorlesen“ ist aus (Telefon, Funk & KI)");
    funkSagt("Test", "Hier 75 1, Test, kommen.", 1);
    return "▶ Funkspruch – kommt er aus dem richtigen Gerät?";
  };
  /** Sprechtaste drücken: wartet bis zu 8 Sekunden auf die Telefon- oder Funktaste */
  const tastenProbe = () =>
    new Promise<string>((ok, fehler) => {
      const p = sprachPrefs();
      const namen: Record<string, string> = { [p.taste]: "Telefon", [p.funkTaste]: "Funk" };
      const weg = () => {
        window.removeEventListener("keydown", h, true);
        window.removeEventListener("mousedown", m, true);
        clearTimeout(t);
      };
      const treffer = (code: string) => {
        if (!namen[code]) return false;
        weg();
        einrichtenSetzen({ tasten: true });
        ok(`✓ ${namen[code]}-Sprechtaste (${tastenName(code)}) erkannt`);
        return true;
      };
      const h = (e: KeyboardEvent) => {
        if (treffer(e.code)) e.preventDefault();
      };
      const m = (e: MouseEvent) => void treffer(`Mouse${e.button}`);
      const t = window.setTimeout(() => {
        weg();
        fehler(new Error(`Keine Sprechtaste gedrückt – Telefon: ${tastenName(p.taste)}, Funk: ${tastenName(p.funkTaste)}`));
      }, 8000);
      window.addEventListener("keydown", h, true);
      window.addEventListener("mousedown", m, true);
    });
  /** Probeanruf: klingeln, Anrufer spricht, du antwortest (Mikrofon), die KI antwortet */
  async function probeAnruf(): Promise<string> {
    return mitStand("probeanruf", "Es klingelt …", async (setz) => {
      spielen("notruf", undefined, 70);
      await warte(2500);
      setz("Der Anrufer spricht …");
      probe("w");
      await warte(5500);
      if (!sprachPrefs().eingabe) {
        einrichtenSetzen({ probe: true });
        return "Gehört? Die Spracheingabe ist aus – im Spiel tippst du deine Fragen";
      }
      setz("Jetzt antworten: 4 Sekunden sprechen, z. B. „Wo genau ist der Notfallort?“");
      const r = await mikroTesten(4, { welches: "telefon", pegel: (p) => setz(`${balken(p)}  sprich jetzt …`) });
      if (r.startsWith("⚠")) throw new Error(r.replace(/^⚠\s*/, ""));
      einrichtenSetzen({ probe: true, mikro: sprachPrefs().mikro });
      return `${r} – so kommt es im Spiel an`;
    });
  }

  /** Status eines Schritts */
  const schritt = (fertig: boolean | null, offen = "offen") => (fertig === null ? { chip: "nicht nötig", dot: GRAU } : fertig ? { chip: "✓ erledigt", dot: OK } : { chip: offen, dot: GELB });
  const kiBereit = (): boolean | null => {
    if (anrufKiModus() === "gemini") return schluesselGeprueft();
    if (!kiPrefs().aktiv) return null;
    if (!tauri) return null;
    return !!c.ki?.laeuft && hatModell(kiPrefs().modell);
  };
  const erkennungBereit = (): boolean | null => (!sprachPrefs().eingabe || !tauri ? null : !!c.whisper?.includes(sprachPrefs().modell));

  // ---------------- Einrichten: Schritt für Schritt
  function einrichten(b: Bausteine): Zeile[] {
    const p = sprachPrefs();
    const s1 = hoerenOk();
    const s2 = erkennungBereit();
    const s3 = !p.eingabe ? null : mikroOk();
    const s4 = !p.eingabe ? null : tastenOk();
    const s5 = kiBereit();
    const s6 = probeOk();
    const alle = [s1, s2, s3, s4, s5, s6];
    const fertig = alle.filter((x) => x !== false).length;
    const out: Zeile[] = [
      b.I("So weit bist du", `${fertig} von ${alle.length} Schritten`, "Geh die Schritte von oben nach unten durch. Dauert etwa 5 Minuten. Alles lässt sich später ändern.", fertig === alle.length ? OK : GELB),
      // 1 Hören
      b.H("Schritt 1 · Hören"),
      b.S("Wie hörst und sprichst du?", "auArt", ["Headset (Kopfhörer mit Mikrofon)", "Lautsprecher und Mikrofon", "Telefon und Funk auf getrennten Geräten"], "Headset (Kopfhörer mit Mikrofon)", "Ein Headset ist am besten: Du hörst die Anrufer gut, und sie hören sich nicht selbst"),
      b.L("Kopfhörer bzw. Lautsprecher", "sdev", ["Wie das System"], "Wie das System", "Hier kommen die Anrufer, der Funk und die Töne heraus"),
      b.B("Probeton", [knopf("▶ Abspielen", hoerProbe), knopf("Ich habe beides gehört", () => (einrichtenSetzen({ hoeren: sprachPrefs().geraetStimmen }), "✓ Gemerkt"))], "Zuerst klingelt es, dann spricht eine Stimme. Nichts gehört? Oben ein anderes Gerät wählen und noch einmal", schritt(s1, "noch nicht gehört")),
      // 2 Spracherkennung
      b.H("Schritt 2 · Sprechen statt tippen"),
      b.T("Mit der Stimme sprechen", "eingabe", true, "Du sprichst mit Anrufern und Fahrzeugen. Aus: Du tippst alles"),
    ];
    if (p.eingabe) {
      const empf = SPRACH_MODELLE.find((m) => /ausgewogen/i.test(m.label)) ?? SPRACH_MODELLE[0];
      const lade = ladeStand[`wh:${empf.name}`];
      const btns: Knopf[] =
        tauri && s2 === false && !lade
          ? [
              knopf(
                `Laden (${empf.mb} MB)`,
                async () => {
                  await mitStand(`wh:${empf.name}`, "startet …", (setz) => modellLaden(empf.name, (d, tt) => setz(tt ? `wird geladen … ${prozent(d, tt)}` : `${Math.round(d / 1e6)} MB`)));
                  setzeSprache({ modell: empf.name });
                  return "Spracherkennung ist bereit";
                },
                {},
                whisperLaden,
              ),
            ]
          : [];
      btns.push({ l: "Andere Größe …", sub: "whisper" });
      out.push(b.B("Spracherkennung", btns, "Damit LeitWerk versteht, was du sagst. Läuft nur auf deinem PC, ohne Internet", lade ? { chip: lade, dot: BLAU } : s2 === null ? { chip: NUR_PROGRAMM, dot: GRAU } : schritt(s2, "noch nicht geladen")));
      // 3 Mikrofon
      out.push(b.H("Schritt 3 · Mikrofon"));
      if (audioArt() === "getrennt") out.push(b.L("Mikrofon fürs Telefon", "mic", ["Wie das System"], "Wie das System"));
      else out.push(b.L("Mikrofon", "mic", ["Wie das System"], "Wie das System", "Beim Headset: das Mikrofon des Headsets"));
      out.push(b.B("Mikrofon testen", [knopf("Testen – 4 Sekunden sprechen", () => mikroProbe("telefon"))], "Klicken und z. B. sagen: „Notruf 144, wo genau ist der Notfallort?“ – danach steht da, was verstanden wurde", schritt(s3, "noch nicht getestet")));
      out.push(...pegelZeile(b, "telefon"));
      // 4 Sprechtasten
      out.push(b.H("Schritt 4 · Sprechtasten"));
      out.push(b.K("Sprechtaste fürs Telefon (gedrückt halten)", "kSprech", "F9", "Solange du sie hältst, hört dich der Anrufer"));
      out.push(b.K("Sprechtaste für den Funk (gedrückt halten)", "kFunk", "F10", "Solange du sie hältst, sendest du im Funk"));
      out.push(b.B("Ausprobieren", [knopf("Jetzt eine Sprechtaste drücken", tastenProbe)], "Klicken, dann innerhalb von 8 Sekunden eine der beiden Tasten drücken", schritt(s4, "noch nicht probiert")));
    } else {
      out.push(b.I("Mikrofon und Sprechtasten", "nicht nötig", "Die Spracheingabe ist aus – du tippst deine Fragen und Funksprüche", GRAU));
    }
    // 5 KI
    out.push(b.H("Schritt 5 · Wer spielt die Anrufer?"));
    out.push(b.S("Anrufer-KI", "kimodus", ["Gemini (Cloud)", "Lokal (Ollama)"], "Lokal (Ollama)", "Gemini: am natürlichsten, braucht Internet und einen kostenlosen Schlüssel. Lokal: läuft auf deinem PC, braucht einen kräftigen Rechner"));
    out.push(
      b.B(
        "Einrichten",
        anrufKiModus() === "gemini" ? [{ l: "Gemini-Schlüssel …", sub: "gemini" }] : [{ l: "Lokale KI …", sub: "modelle" }],
        anrufKiModus() === "gemini" ? "Schlüssel holen und einfügen – Schritt für Schritt erklärt" : "Ein Sprachmodell laden – LeitWerk schlägt die passende Größe für deinen PC vor",
        schritt(s5, "noch nicht bereit"),
      ),
    );
    // 6 Probeanruf
    out.push(b.H("Schritt 6 · Probeanruf"));
    out.push(b.B("Probeanruf", [knopf("Starten", probeAnruf)], p.eingabe ? "Es klingelt, ein Anrufer spricht, dann antwortest du – so wie im Spiel" : "Es klingelt und ein Anrufer spricht – so wie im Spiel", ladeStand.probeanruf ? { chip: ladeStand.probeanruf, dot: BLAU } : schritt(s6, "noch nicht gemacht")));
    out.push(b.B("Mehr einstellen", [{ l: "Kopfhörer & Mikrofon", go: ["platz", "audio"] }, { l: "Telefon, Funk & KI", go: ["platz", "gespraech"] }], "Lautstärken, Funk, Stimmen und alles Weitere"));
    return out;
  }

  // ---------------- Kopfhörer & Mikrofon
  function audio(b: Bausteine): Zeile[] {
    const art = audioArt();
    const getrennt = art === "getrennt";
    const out: Zeile[] = [
      b.S("Wie hörst und sprichst du?", "auArt", ["Headset (Kopfhörer mit Mikrofon)", "Lautsprecher und Mikrofon", "Telefon und Funk auf getrennten Geräten"], "Headset (Kopfhörer mit Mikrofon)", "Ein Headset ist am besten. Bei Lautsprechern nicht „Freisprechen“ verwenden – sonst hört sich der Anrufer selbst"),
      b.H("Hören"),
    ];
    if (!tauri) out.push(b.I("Geräte wählen", NUR_PROGRAMM, "Im Browser kommt alles aus dem Gerät, das am Computer eingestellt ist", GRAU));
    if (getrennt) {
      out.push(b.L("Telefon: Anrufer", "sdev", ["Wie das System"], "Wie das System", "Hier hörst du die Anrufer"));
      out.push(b.B("", [knopf("▶ Testen", () => (probe("w"), "▶ Stimme"))]));
      out.push(b.L("Funk: Fahrzeuge", "fdev", ["Wie am Telefon"], "Wie am Telefon", "Hier hörst du den Funk"));
      out.push(b.B("", [knopf("▶ Testen", funkProbe)]));
      out.push(b.L("Töne (Klingeln, Funk-Piep)", "tdev", ["Wie das System"], "Wie das System", "Z. B. Klingeln über die Lautsprecher, damit du es auch ohne Headset hörst"));
      out.push(b.B("", [knopf("▶ Testen", () => (spielen("notruf", undefined, 70), "▶ Klingeln"))]));
      out.push(b.T("Telefon links, Funk rechts", "stereo", false, "Im Headset: Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"));
    } else {
      out.push(b.L(art === "headset" ? "Headset" : "Lautsprecher", "sdev", ["Wie das System"], "Wie das System", "Anrufer, Funk und Töne kommen alle hier heraus"));
      out.push(b.B("Probeton", [knopf("▶ Abspielen", hoerProbe)], "Zuerst klingelt es, dann spricht eine Stimme"));
      if (art === "headset") out.push(b.T("Telefon links, Funk rechts", "stereo", false, "Anrufer nur im linken Ohr, Funk nur im rechten – wie in einer echten Leitstelle. Töne bleiben auf beiden Seiten"));
    }
    out.push(b.H("Sprechen"));
    if (getrennt) {
      out.push(b.L("Mikrofon fürs Telefon", "mic", ["Wie das System"], "Wie das System"));
      out.push(b.B("", [knopf("Testen – 4 Sekunden sprechen", () => mikroProbe("telefon"))]));
      out.push(...pegelZeile(b, "telefon"));
      out.push(b.L("Mikrofon für den Funk", "micFunk", ["Wie am Telefon"], "Wie am Telefon"));
      out.push(b.B("", [knopf("Testen – 4 Sekunden sprechen", () => mikroProbe("funk"))]));
      out.push(...pegelZeile(b, "funk"));
    } else {
      out.push(b.L("Mikrofon", "mic", ["Wie das System"], "Wie das System", art === "headset" ? "Das Mikrofon des Headsets" : "Am besten ein Mikrofon nahe am Mund"));
      out.push(b.B("Mikrofon testen", [knopf("Testen – 4 Sekunden sprechen", () => mikroProbe("telefon"))], "Klicken und sprechen – danach steht da, was verstanden wurde"));
      out.push(...pegelZeile(b, "telefon"));
    }
    out.push(b.H("Lautstärken"));
    out.push(b.R("Anrufer am Telefon", "slaut", 0, 100, 5, 85, (v) => `${v} %`));
    out.push(b.R("Fahrzeuge im Funk", "sfLautKi", 0, 150, 5, 100, (v) => `${v} %`, "Fahrzeuge, die der Computer spricht"));
    out.push(b.R("Mitspieler im Funk", "sfLaut", 0, 150, 5, 90, (v) => `${v} %`, "Stimmen echter Spieler (Disponenten, Piloten)"));
    out.push(b.R("Andere Funkgruppen", "fgLaut", 0, 100, 5, 60, (v) => `${v} %`, "Gruppen, die du nur mithörst – dringende Rufe kommen immer voll"));
    out.push(b.L("Funk, während du telefonierst", "fTel", ["Normal", "Leiser", "Stumm"], "Leiser", "Dringende Rufe bleiben hörbar"));
    out.push(b.R("Töne", "tlaut", 0, 100, 5, 80, (v) => `${v} %`, "Klingeln, Funk-Piep, Chat"));
    out.push(b.R("Deine Stimme im Funk", "sfSende", 0, 200, 5, 100, (v) => `${v} %`, "Wie laut dich die Mitspieler hören"));
    out.push(b.H("Tipps"));
    out.push(b.I("Bluetooth-Headset", "", "Viele Bluetooth-Headsets klingen schlecht, sobald das Mikrofon an ist. Ein Headset mit Kabel oder USB ist besser", GRAU));
    out.push(b.I("Nichts zu hören?", "", "Lautstärke am Computer prüfen und oben das richtige Gerät wählen. Neu angesteckte Geräte erscheinen nach dem Neustart von LeitWerk", GRAU));
    return out;
  }

  // ---------------- Telefon, Funk & KI
  function gespraech(b: Bausteine): Zeile[] {
    const p = sprachPrefs();
    const geprueft = schluesselGeprueft();
    const da = schluesselDa();
    const m = kiPrefs().modell;
    const info = KI_MODELLE.find((x) => x.name === m);
    const empf = c.ram ? empfohleneStufe(c.ram) : null;
    const modellHint = `${info ? `${STUFE_LABEL[info.stufe]}: ` : ""}${m}${c.ram ? ` · dein PC: ${c.ram} GB Arbeitsspeicher${empf ? `, passend: ${STUFE_LABEL[empf]}` : ""}` : ""}`;
    const modellChip = !tauri ? { chip: NUR_PROGRAMM, dot: GRAU } : c.ki === undefined ? { chip: m, dot: GRAU } : hatModell(m) ? { chip: "bereit", dot: OK } : { chip: "noch nicht geladen", dot: GELB };
    const piperN = c.piper?.length ?? 0;
    const wh = SPRACH_MODELLE.find((x) => x.name === p.modell);
    return [
      // Telefon
      b.H("Telefon"),
      b.T("Ich nehme Notrufe an", "notrufe", true, "Aus: Bei dir klingelt kein Notruf (z. B. wenn du nur den Funk machst)"),
      b.T("Ich nehme die KT-Hotline an", "kthot", true, "Bestellungen von Krankentransporten"),
      b.T("Ich nehme Überstellungen an", "ueberst", true, "Anrufe von Krankenhäusern, die einen Patienten verlegen"),
      b.T("Mit der Stimme sprechen", "eingabe", true, "Aus: Du tippst deine Fragen"),
      b.K("Sprechtaste fürs Telefon (gedrückt halten)", "kSprech", "F9", "Solange du sie hältst, hört dich der Anrufer"),
      b.T("Erkannten Text gleich abschicken", "autosend", true, "Aus: Du kannst den Text vor dem Abschicken noch ändern"),
      b.T("Freisprechen (ohne Sprechtaste)", "freispr", false, "Der Anrufer hört dich, sobald du sprichst – nur mit Headset, sonst hört er sich selbst"),
      b.T("Anrufer vorlesen", "vorl", true, "Aus: Du liest nur mit, was der Anrufer sagt"),
      b.T("Telefonklang", "klang", true, "Der Anrufer klingt wie am Telefon – über Handy (manchmal mit Aussetzern) oder Festnetz. Nur mit Gemini"),
      b.S("Hintergrundgeräusche", "hgr", ["Aus", "Dezent", "Realistisch"], "Dezent", "Was man beim Anrufer hört: Straße, Wohnung, Wind, Stöhnen, Husten, Hund … – passend zum Notfall. Nur mit Gemini"),
      b.T("Knopf „Gespräch exportieren“", "gexp", false, "Speichert ein Gespräch als Datei – zum Melden von Fehlern"),
      // Funk
      b.H("Funk"),
      b.K("Sprechtaste für den Funk (gedrückt halten)", "kFunk", "F10", "Spricht in die Gruppe, die am Funkgerät gewählt ist"),
      b.K("Eigene Funktaste: normale Gruppe", "kFunkN", "–", "Nur wenn du für jede Gruppe eine eigene Taste willst"),
      b.K("Eigene Funktaste: RD-NOE-09", "kF09", "–", "Gruppe für Großeinsätze"),
      b.K("Eigene Funktaste: RD-NOE-10", "kF10", "–", "Zweite Gruppe für Großeinsätze"),
      b.T("Funk vorlesen", "fvorl", true, "Aus: Du liest die Funksprüche nur mit"),
      b.T("Funk-Klang", "fklang", true, "Stimmen klingen blechern wie im echten Funk"),
      b.T("Echte Disponenten hören", "echteD", true, "Nur im Mehrspieler"),
      b.T("Echte Piloten hören", "echteP", true, "Nur im Mehrspieler"),
      b.T("Funkmeldungen manchmal unvollständig", "unvoll", true, "Wie im echten Leben: Manchmal fehlt etwas, dann fragst du nach"),
      b.T("Funk-Aufnahmen an Fehlerberichte anhängen", "sfAufn", false, "Die letzten 10 eigenen Funksprüche – hilft, die Spracherkennung zu verbessern"),
      // KI
      b.H("KI – wer spricht Anrufer und Fahrzeuge?"),
      b.S("Anrufer-KI", "kimodus", ["Gemini (Cloud)", "Lokal (Ollama)"], "Lokal (Ollama)", "Gemini: am natürlichsten, braucht Internet. Lokal: läuft auf deinem PC. Fällt Gemini aus, springt die lokale KI ein"),
      b.B("Gemini", [{ l: "Einrichten …", sub: "gemini" }, knopf("Testen", geminiTest)], "Kostenloser Schlüssel von Google – bleibt nur auf deinem PC", geprueft ? { chip: "bereit", dot: OK } : da ? { chip: "Schlüssel nicht geprüft", dot: GELB } : { chip: "nicht eingerichtet", dot: GRAU }),
      b.T("Gemini versteht den Funk", "gfunk", false, "Test: kennt alle Fahrzeuge, schreibt Rufnamen richtig"),
      b.T("Fahrzeuge sprechen mit Gemini", "gfzg", false, "Jedes Fahrzeug mit eigener Stimme (immer an, wenn Gemini die Anrufer spielt)"),
      ollamaZeile(b),
      b.B("Lokale KI: Sprachmodell", [{ l: "Wählen …", sub: "modelle" }], modellHint, modellChip),
      b.T("Lokale KI verwenden", "lokal", true, "Aus: Die Anrufer antworten mit vorbereiteten Sätzen"),
      b.T("Lokale KI beim Beenden schließen", "olbeend", true),
      b.T("Schnelles Gespräch (Test)", "schnell", false, "Anrufer fängt früher zu sprechen an"),
      b.B(
        "Ausprobieren",
        [
          knopf("Testanruf", async () => {
            if (anrufKiModus() === "gemini" && da) return geminiTest();
            const r = await lokalerTest();
            return `Anrufer: „${r.antwort}“`;
          }),
          knopf("Wie schnell?", async () => {
            if (anrufKiModus() === "gemini" && da) return geminiTest();
            const { s1, s2 } = await lokalerTest();
            const urteil = s2 <= 5 ? "Flüssig – passt gut" : s2 <= 10 ? "Brauchbar" : s2 <= 18 ? "Eher langsam – ein kleineres Modell wäre flüssiger" : "Zu langsam – bitte ein kleineres Modell";
            return `${urteil}: erste Wörter nach ${komma(s1)} s, fertig nach ${komma(s2)} s`;
          }, {}, kiLaden),
        ],
        "Ein kurzes Probegespräch ohne Spiel (das erste dauert länger)",
      ),
      // Stimmen & Erkennung
      b.H("Stimmen und Spracherkennung"),
      b.B("Stimmen", [{ l: "Wählen …", sub: "piper" }], "Je mehr Stimmen, desto abwechslungsreicher klingen Anrufer und Fahrzeuge (Piper, läuft auf deinem PC)", !tauri ? { chip: NUR_PROGRAMM, dot: GRAU } : c.piper === undefined ? { chip: PRUEFT, dot: GRAU } : piperN ? { chip: `${piperN} geladen`, dot: OK } : { chip: "Computerstimme", dot: GELB }),
      b.R("Sprechtempo", "tempo", 70, 140, 5, 100, (v) => `${v} %`),
      b.B("Spracherkennung", [{ l: "Wählen …", sub: "whisper" }], "Versteht, was du sagst (Whisper, läuft auf deinem PC)", !tauri ? { chip: NUR_PROGRAMM, dot: GRAU } : c.whisper === undefined ? { chip: PRUEFT, dot: GRAU } : c.whisper.includes(p.modell) ? { chip: wh ? wh.label.split(/\s+–\s+/)[0] : "bereit", dot: OK } : { chip: "noch nicht geladen", dot: GELB }),
      b.B("Alles in Ruhe einrichten", [{ l: "Zum Einrichten", go: ["platz", "einrichten"] }], "Schritt für Schritt mit Probeanruf"),
    ];
  }

  // ---------------- Töne (je Ereignis und eigene Dateien auf einer Seite)
  // ---------------- Discord (Beta 74): „Spielt LeitWerk“
  let discordStand: { ok: boolean; um: number } | null = null;
  function discordSeite(b: Bausteine): Zeile[] {
    if (!discordStand || Date.now() - discordStand.um > 5000) {
      const vorher = discordStand?.ok;
      void discordVerbunden().then((ok) => {
        discordStand = { ok, um: Date.now() };
        if (ok !== vorher) neuZeichnen();
      });
    }
    const an = discordAn();
    const ok = discordStand?.ok;
    const zeilen: Zeile[] = [
      b.H("Discord"),
      b.T("In Discord zeigen, dass ich LeitWerk spiele", "discord", true, "Freunde sehen „Spielt LeitWerk“ in deinem Profil und in der Mitgliederliste"),
      b.T("Details zeigen", "discordDetails", true, "Rolle, Funkgruppe, offene Einsätze und Spieltyp – nie Adressen, Namen oder Codes"),
    ];
    if (!an) zeilen.push(b.I("Verbindung", "aus", "Eingeschaltet erscheint es nach wenigen Sekunden", GRAU));
    else if (ok === undefined) zeilen.push(b.I("Verbindung", PRUEFT, "", GRAU));
    else if (ok) zeilen.push(b.I("Verbindung", "verbunden", "Discord zeigt jetzt „Spielt LeitWerk“", OK));
    else
      zeilen.push(
        b.I("Verbindung", "Discord läuft nicht", inTauri() ? "Discord (Programm, nicht im Browser) auf diesem Rechner starten – LeitWerk verbindet sich dann von selbst (spätestens nach 30 Sekunden)" : "Nur im installierten Programm", GELB),
      );
    zeilen.push(b.I("Tipp", "", "Ganz ausschalten geht auch in Discord: Einstellungen › Aktivitätsprivatsphäre", GRAU));
    return zeilen;
  }

  function toeneSeite(b: Bausteine): Zeile[] {
    return [
      b.T("Klingelton bei Anrufen", "klingel", true),
      b.T("Funk-Piep, wenn ein Fahrzeug ruft", "fpiep", true),
      b.R("Lautstärke der Töne", "tlaut", 0, 100, 5, 80, (v) => `${v} %`),
      b.H("Welcher Ton wann?"),
      ...toene(b),
      b.H("Eigene Tondateien"),
      ...tondateien(b),
    ];
  }

  // ---------------- Bedienung → Gespeicherte Anordnungen
  function anordnungenSeite(b: Bausteine): Zeile[] {
    const out: Zeile[] = [];
    const l = anordnungen();
    if (!l.length) out.push(b.I("Gespeicherte Anordnungen", "noch keine", "Eigene Anordnungen speicherst du im Spiel unter „Anordnung“ – oder lädst sie unten aus einer Datei", GRAU));
    for (const x of l) {
      out.push(
        b.IT(x.name, x.fenster.length ? `Hauptfenster + ${x.fenster.length} weitere${x.fenster.length > 1 ? "" : "s"} Fenster` : "Hauptfenster", "", "", {
          btns: [
            knopf("Übernehmen", async () => {
              if (dock()) {
                await anordnungAnwenden(x);
                return "Übernommen";
              }
              // vor dem Spiel: gilt beim nächsten Spielstart (Nebenfenster öffnet das Spiel nicht von selbst)
              localStorage.setItem(LAYOUT_KEY, JSON.stringify(x.haupt));
              return x.fenster.length ? "Gilt beim nächsten Spielstart (ohne Nebenfenster)" : "Gilt beim nächsten Spielstart";
            }),
            knopf("Als Datei …", async () => ((await saveTextFile(`leitwerk-anordnung-${x.name}.json`, JSON.stringify(x, null, 1), { name: "Anordnung", extensions: ["json"] })) ? "Gespeichert" : "Abgebrochen")),
            knopf("Löschen", () => (anordnungLoeschen(x.name), "Gelöscht"), { cfm: `„${x.name}“ löschen?` }),
          ],
        }),
      );
    }
    out.push(
      b.B(
        "Aus Datei",
        [
          dateiKnopf("Anordnung laden …", ".json,application/json", async (f) => {
            const text = await dateiText(f);
            const a = anordnungImportieren(text);
            ablageSichern("Anordnungen", ablageName(f.name, "json"), text);
            return `„${a.name}“ übernommen`;
          }),
        ],
        "Zum Beispiel von einem Freund",
      ),
    );
    return out;
  }

  // ---------------- Fallkatalog
  const fallName = (f: FallVorlage) => f.name?.trim() || f.id;
  function faelle(b: Bausteine): Zeile[] {
    const alle = alleFaelle(true).slice().sort((a, b2) => fallName(a).localeCompare(fallName(b2), "de"));
    const eigene = alle.filter((f) => !eingebauterFall(f.id));
    const notarzt = (f: FallVorlage) => {
      const k = new Set(f.varianten.map((v) => brauchtVon(v)));
      if (k.size === 1 && k.has("NA")) return "ja";
      if (!k.has("NA")) return [...k].sort((a, b) => kompetenzRang(b) - kompetenzRang(a))[0] === "RS" ? "nein" : `bis ${[...k].sort((a, b) => kompetenzRang(b) - kompetenzRang(a))[0]}`;
      return "teils";
    };
    const herkunft = (f: FallVorlage) => `${eingebauterFall(f.id) ? (istGeaendert(f.id) ? "eingebaut, geändert" : "eingebaut") : "eigener"}${istFallAktiv(f.id) ? "" : " · aus"}`;
    const ids = alle.map((f) => f.id);
    return [
      b.TAB(
        ["Fall", "Art", "Notarzt", "Herkunft"],
        alle.map((f) => [fallName(f), f.spezial ? "besonderer Anruf" : "Notfall", notarzt(f), herkunft(f)]),
        {
          suche: "Fälle durchsuchen …",
          neu: "Neuer Fall",
          anzahl: `${zahl(alle.length)} Fälle · ${zahl(eigene.length)} eigene`,
          edit: true,
          ding: "Fall",
          oeffnen: (z: number) => fallEditorOeffnen(ids[z]),
          neuZiel: "neuerFall",
          hint: "Stift öffnet den Fall-Editor (Telefonat, Abfrage, Ausgänge, Krankenhaus)",
        },
      ),
      b.B(
        "Prüfen",
        [
          knopf("Alle Fälle prüfen", () => {
            const liste = alleFaelle(true);
            const befund = faellePruefen(store.schema, liste);
            if (!befund.length) return `Alle ${zahl(liste.length)} in Ordnung`;
            const faelle2 = new Set(befund.map((x) => x.fall));
            const f0 = befund[0];
            throw new Error(`${befund.length} Problem${befund.length === 1 ? "" : "e"} in ${faelle2.size} Fäll${faelle2.size === 1 ? "" : "en"} – z. B. ${f0.fall}${f0.variante ? ` (${f0.variante})` : ""}: ${f0.fehler}`);
          }),
        ],
        "Telefonat, Verlauf, Krankenhaus stimmig?",
      ),
      b.B("Import & Export", [
        dateiKnopf("Importieren …", ".json,application/json", async (f) => {
          const text = await dateiText(f);
          const r = fallpaketImport(text, false);
          if (!r.neu && !r.ersetzt) throw new Error(r.fehler[0] ?? "Keine Fälle in der Datei");
          ablageSichern("Fälle", ablageName(f.name, "json"), text);
          return `${r.neu} neu, ${r.ersetzt} ersetzt${r.fehler.length ? `, ${r.fehler.length} übersprungen (${r.fehler[0]})` : ""}`;
        }),
        knopf("Exportieren …", async () => {
          const liste = alleFaelle(true);
          const eig = liste.filter((f) => !eingebauterFall(f.id) || istGeaendert(f.id));
          const ausw = (eig.length ? eig : liste).map((f) => f.id);
          const p = await saveTextFile(`leitwerk-faelle-${new Date().toISOString().slice(0, 10)}.json`, fallpaketExport(ausw), { name: "Fallpaket", extensions: ["json"] });
          return p ? `${ausw.length} ${eig.length ? "eigene/geänderte " : ""}Fälle exportiert` : "Abgebrochen";
        }),
      ], "Fallpakete (JSON) – exportiert werden die eigenen und geänderten Fälle"),
    ];
  }

  // ---------------- Alarmierung: Stufen
  function stufenListe(): StufeDef[] {
    const l = store.settings.stufen.map((s) => ({ ...s }));
    for (const k of codeKategorien()) if (!l.some((x) => x.stufe === k)) l.push(stufeRaten(k) ?? defaultStufeFuer(k));
    return l;
  }
  const NA_TEXT = (Object.keys(NOTARZT_LABEL) as NotarztRegel[]).map((k) => NOTARZT_LABEL[k]);
  const KAT_TEXT = KATEGORIEN.map((k) => KATEGORIE_LABEL[k]);
  function settingsSchreiben(fn: (s: Settings) => void): void {
    const s = structuredClone(store.settings);
    fn(s);
    store.setSettings(s);
    void sim.call("neuPlanen").catch(() => undefined);
  }
  function alarmierung(b: Bausteine): Zeile[] {
    const stufen = stufenListe();
    const zeile = (s: StufeDef) => [s.stufe, s.rettungsmittel || "– (Weitergabe)", s.nfsErforderlich ? "ja" : "nein", NOTARZT_LABEL[s.notarzt] ?? s.notarzt, s.sondersignal ? "ja" : "nein", KATEGORIE_LABEL[s.kategorie] ?? s.kategorie, `${s.transportProzent} %`];
    const out: Zeile[] = [b.T("Rendezvous RTW – NEF", "rdv", true, "NEF mehr als 15 min entfernt: RTW fährt los und trifft das NEF unterwegs"), b.N("Toleranz für besser passende Rettungsmittel", "tol", 5, "min"), b.H("Stufen-Zuordnung")];
    if (tabFehler.alarmierung) out.push(b.I("Nicht gespeichert", tabFehler.alarmierung, "", ROT));
    out.push(
      b.TAB(["Stufe", "Rettungsmittel", "NFS", "Notarzt", "Signal", "Kategorie", "Transport"], stufen.map(zeile), {
        edit: true,
        neu: "Neue Stufe",
        ding: "Stufe",
        typen: ["text", "text", "tog", ["sel", NA_TEXT], "tog", ["sel", KAT_TEXT], "num"],
        hint: "„>“ trennt die Ränge, „/“ heißt gleichwertig. Ein schlechter passendes Rettungsmittel kommt nur, wenn das bessere mehr als die Toleranz länger braucht.",
        speichern: (z: number, w: string[]) =>
          sicher("alarmierung", () => {
            const alt = z >= 0 ? stufen[z] : undefined;
            const name = (w[0] ?? "").trim();
            if (!name) throw new Error("Bitte einen Namen für die Stufe eingeben");
            if (stufen.some((x) => x.stufe === name && x !== alt)) throw new Error(`Die Stufe „${name}“ gibt es schon`);
            const rm = (w[1] ?? "").trim();
            const neu2: StufeDef = {
              stufe: name,
              rettungsmittel: /^–|weitergabe/i.test(rm) || !rm ? "" : rm.toUpperCase().replace(/\s+/g, ""),
              nfsErforderlich: w[2] === "ja",
              notarzt: ((Object.keys(NOTARZT_LABEL) as NotarztRegel[]).find((k) => NOTARZT_LABEL[k] === w[3]) ?? alt?.notarzt ?? "nein") as NotarztRegel,
              sondersignal: w[4] === "ja",
              kategorie: (KATEGORIEN.find((k) => KATEGORIE_LABEL[k] === w[5]) ?? alt?.kategorie ?? "dringend") as Kategorie,
              transportProzent: Math.max(0, Math.min(100, Math.round(parseFloat(String(w[6]).replace(",", ".")) || 0))),
            };
            settingsSchreiben((s) => {
              const i = alt ? s.stufen.findIndex((x) => x.stufe === alt.stufe) : -1;
              if (i >= 0) s.stufen[i] = neu2;
              else s.stufen.push(neu2);
            });
          }),
        loeschen: (z: number) =>
          sicher("alarmierung", () => {
            const alt = stufen[z];
            if (!alt) return;
            const std = defaultSettings().stufen.find((x) => x.stufe === alt.stufe);
            settingsSchreiben((s) => {
              // eingebaute Stufen kommen beim Laden wieder – sie werden auf die Standardwerte zurückgesetzt
              if (std) s.stufen = s.stufen.map((x) => (x.stufe === alt.stufe ? { ...std } : x));
              else s.stufen = s.stufen.filter((x) => x.stufe !== alt.stufe);
            });
          }),
      }),
    );
    return out;
  }

  /** Speichern aus einer Tabelle: Fehler merken (die Komponente zeigt sie nicht), Erfolg löscht den Fehler */
  async function sicher(seite: string, fn: () => unknown): Promise<void> {
    try {
      await fn();
      delete tabFehler[seite];
    } catch (e) {
      tabFehler[seite] = fehlerText(e);
      console.warn("Hauptmenü speichern", e);
    }
    neu();
  }

  // ---------------- Leitstelle: Datentabellen
  const ID_PREFIX: Record<Kind, string> = { stations: "ds", vehicles: "fz", hospitals: "kh", pois: "poi", templates: "ev", codes: "code" };
  const lageText = (r: { lat: number; lon: number }) => `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`;
  /** „48.41, 15.60“ oder eine Adresse → Koordinaten */
  async function lageLesen(text: string, alt?: { lat: number; lon: number }, altText?: string): Promise<{ lat: number; lon: number }> {
    const t = text.trim();
    if (alt && t === (altText ?? "").trim()) return { lat: alt.lat, lon: alt.lon };
    if (!t) throw new Error("Bitte die Lage angeben (Breite, Länge oder eine Adresse)");
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/) ?? t.match(/^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/);
    if (m) {
      let lat = Number(m[1].replace(",", "."));
      let lon = Number(m[2].replace(",", "."));
      const latOk = (x: number) => x >= 44 && x <= 52;
      const lonOk = (x: number) => x >= 7 && x <= 21;
      if (!latOk(lat) && latOk(lon) && lonOk(lat)) [lat, lon] = [lon, lat];
      if (!latOk(lat) || !lonOk(lon)) throw new Error(`Koordinate ${t} liegt außerhalb des Kartengebiets`);
      return { lat, lon };
    }
    const hit = (await searchAddress(t, 1).catch(() => []))[0];
    if (!hit) throw new Error(`„${t}“ nicht gefunden – bitte Koordinaten angeben (Breite, Länge)`);
    return { lat: hit.lat, lon: hit.lon };
  }

  /** Tabellenzeilen je Datenart (zwischengespeichert, bis sich die Daten ändern) */
  type TabDaten<K extends Kind> = { recs: KindMap[K][]; rows: string[][]; gesamt: number };
  const tabCache = new Map<string, { stand: number; q: string; d: TabDaten<Kind> }>();
  function tabDaten<K extends Kind>(kind: K, zeile: (r: KindMap[K]) => string[], seite: string): TabDaten<K> {
    const q = norm(zw[`tq_${seite}`] ?? "").trim();
    const alt = tabCache.get(kind);
    if (alt && alt.stand === storeStand && alt.q === q) return alt.d as unknown as TabDaten<K>;
    const alle = store.list(kind) as KindMap[K][];
    let recs = alle;
    let rows: string[][];
    if (alle.length <= 2000) rows = alle.map(zeile);
    else {
      // große Listen: nur die ersten 200 (bzw. die ersten 200 Treffer der Suche)
      const t: KindMap[K][] = [];
      rows = [];
      for (const r of alle) {
        const z = zeile(r);
        if (q && !norm(z.join(" ")).includes(q)) continue;
        t.push(r);
        rows.push(z);
        if (t.length >= 200) break;
      }
      recs = t;
    }
    const d: TabDaten<K> = { recs, rows, gesamt: alle.length };
    tabCache.set(kind, { stand: storeStand, q, d: d as unknown as TabDaten<Kind> });
    return d;
  }
  /** Anzahl-Text: ehrlich, wenn nur ein Teil geliefert wird */
  const anzahlText = (d: TabDaten<Kind>, wort: string) => (d.recs.length < d.gesamt ? `${zahl(d.gesamt)} ${wort} · ${zahl(d.recs.length)} gezeigt – Suche zeigt mehr` : `${zahl(d.gesamt)} ${wort}`);

  function importExport(b: Bausteine, kind: Kind): Zeile {
    return b.B(
      "Import & Export",
      [
        { l: "CSV importieren …", imp: true } as Knopf,
        knopf("Exportieren …", async () => {
          const csv = exportCsv(kind, store.list(kind), store.list("stations"));
          const p = await saveTextFile(`leitwerk_${KIND_FILE[kind]}.csv`, csv);
          return p ? `${KIND_LABEL[kind]} exportiert` : "Abgebrochen";
        }),
      ],
      "CSV-Dateien · erst prüfen, dann ergänzen oder ersetzen · Vorlage und Beispiel liegen in Dokumente/LeitWerk",
    );
  }

  /** Gemeinsamer Rahmen der Datentabellen */
  function datenSeite<K extends Kind>(
    b: Bausteine,
    seite: string,
    kind: K,
    cfg: {
      cols: string[];
      zeile: (r: KindMap[K]) => string[];
      x: Record<string, unknown>;
      wort: string;
      bauen: (alt: KindMap[K] | undefined, w: string[], altW: string[] | undefined) => Promise<KindMap[K][]> | KindMap[K][];
    },
  ): Zeile[] {
    const d = tabDaten(kind, cfg.zeile, seite);
    const out: Zeile[] = [];
    if (tabFehler[seite]) out.push(b.I("Nicht gespeichert", tabFehler[seite], "", ROT));
    out.push(
      b.TAB(cfg.cols, d.rows, {
        ...cfg.x,
        edit: true,
        anzahl: anzahlText(d as TabDaten<Kind>, cfg.wort),
        speichern: (z: number, w: string[]) =>
          sicher(seite, async () => {
            const alt = z >= 0 ? d.recs[z] : undefined;
            const liste = await cfg.bauen(alt, w.map((x) => String(x ?? "")), z >= 0 ? d.rows[z] : undefined);
            store.upsert(kind, liste);
          }),
        loeschen: (z: number) =>
          sicher(seite, () => {
            const alt = d.recs[z];
            if (alt) store.remove(kind, alt.id);
          }),
      }),
    );
    out.push(importExport(b, kind));
    return out;
  }
  const basisVon = (alt: { id: string; herkunft: string; herkunftDetail?: string } | undefined, kind: Kind, hinweis: string) => ({
    id: alt?.id ?? store.newId(ID_PREFIX[kind]),
    hinweis: hinweis.trim(),
    herkunft: (alt?.herkunft === "import" ? "import" : "manuell") as "import" | "manuell",
    herkunftDetail: alt?.herkunftDetail,
  });
  const geaendert = (w: string[], altW: string[] | undefined, i: number) => !altW || (w[i] ?? "") !== (altW[i] ?? "");

  function fahrzeuge(b: Bausteine): Zeile[] {
    const stationen = store.list("stations");
    const stName = new Map(stationen.map((s) => [s.id, s.name]));
    const typText = (v: Vehicle) => `${v.typ}${v.aufbau === "gross" && v.typ !== "RTW-C" ? " (groß)" : ""}`;
    const planZelle = (v: Vehicle) => (v.ersatzFuer ? `nur bei Flugverbot (Ersatz für ${v.ersatzFuer})` : planKurz(v.dienstplan));
    return datenSeite(b, "fahrzeuge", "vehicles", {
      cols: ["Funkrufname", "Kurzname", "Kategorie", "Typ", "Dienststelle", "Dienstplan", "Aktiv"],
      wort: "Fahrzeuge",
      zeile: (v) => [v.funkrufname, v.kurzname, v.kategorie, typText(v), stName.get(v.dienststelleId) ?? "⚠ fehlt", planZelle(v), v.aktiv ? "ja" : "nein", v.nachtflug ? "ja" : "nein", v.ersatzFuer ?? "", v.hinweis ?? ""],
      x: {
        suche: "Fahrzeug suchen …",
        neu: "Neues Fahrzeug",
        ding: "Fahrzeug",
        typen: ["text", "text", ["sel", [...VEHICLE_CATEGORIES]], "text", "text", "plan", "tog"],
        extra: [["Nachtflug", "tog", "nein"], ["Ersatz für", "text", ""], ["Hinweis", "text", ""]],
      },
      bauen: (alt, w, altW) => {
        const funk = w[0].trim();
        if (!funk) throw new Error("Bitte einen Funkrufnamen eingeben");
        const kat = (VEHICLE_CATEGORIES as readonly string[]).includes(w[2]) ? (w[2] as VehicleCategory) : alt?.kategorie ?? "RTW";
        let dienststelleId = alt?.dienststelleId ?? "";
        if (geaendert(w, altW, 4) || !alt) {
          const n = w[4].trim().toLowerCase();
          const treffer = stationen.filter((s) => s.name.trim().toLowerCase() === n);
          if (!treffer.length) throw new Error(`Dienststelle „${w[4]}“ gibt es nicht`);
          if (treffer.length > 1 && !treffer.some((s) => s.id === dienststelleId)) throw new Error(`Dienststelle „${w[4]}“ gibt es mehrmals – bitte im Spiel unter Daten zuordnen`);
          dienststelleId = treffer.some((s) => s.id === dienststelleId) ? dienststelleId : treffer[0].id;
        }
        let typ = w[3].replace(/\s*\(groß\)\s*$/, "").trim();
        let aufbau = alt?.aufbau;
        if (alt && !geaendert(w, altW, 3)) typ = alt.kategorie === kat ? alt.typ : kat;
        else if (geaendert(w, altW, 3)) aufbau = /\(groß\)\s*$/.test(w[3]) ? "gross" : undefined;
        if (!typ) typ = kat;
        let dienstplan = alt?.dienstplan;
        if (!alt || geaendert(w, altW, 5)) {
          const p = planLesen(w[5]);
          if (p.fehler) throw new Error(p.fehler);
          dienstplan = p.plan;
        }
        const v: Vehicle = {
          ...(alt ?? {}),
          ...basisVon(alt, "vehicles", w[9] ?? ""),
          funkrufname: funk,
          kurzname: w[1].trim(),
          kategorie: kat,
          typ,
          dienststelleId,
          aktiv: w[6] === "ja",
          nachtflug: w[7] === "ja",
          dienstplan: dienstplan ?? [],
        };
        if (aufbau) v.aufbau = aufbau;
        else delete v.aufbau;
        const ers = (w[8] ?? "").trim();
        if (ers || alt?.ersatzFuer !== undefined) v.ersatzFuer = ers;
        const liste: Vehicle[] = [v];
        // je Dienststelle nur ein RTW-C – ein anderer wird zum großen RTW (wie im Fahrzeug-Dialog)
        if (v.typ.toUpperCase() === "RTW-C") {
          v.typ = "RTW-C";
          v.aufbau = "gross";
          for (const x of store.list("vehicles")) if (x.id !== v.id && x.dienststelleId === v.dienststelleId && x.typ.trim().toUpperCase() === "RTW-C") liste.push({ ...x, typ: "RTW", aufbau: "gross" });
        }
        return liste;
      },
    });
  }

  function dienststellen(b: Bausteine): Zeile[] {
    const anzahl = new Map<string, number>();
    for (const v of store.list("vehicles")) anzahl.set(v.dienststelleId, (anzahl.get(v.dienststelleId) ?? 0) + 1);
    const typen = [...new Set([...STATION_TYPES, ...store.list("stations").map((s) => s.typ).filter(Boolean)])];
    return datenSeite(b, "dienststellen", "stations", {
      cols: ["Name", "Typ", "Ort", "Bezirk", "Fahrzeuge"],
      wort: "Dienststellen",
      zeile: (s) => [s.name, s.typ, s.ort, s.bezirk, String(anzahl.get(s.id) ?? 0), s.adresse ?? "", lageText(s), s.hinweis ?? ""],
      x: {
        suche: "Dienststelle suchen …",
        neu: "Neue Dienststelle",
        ding: "Dienststelle",
        typen: ["text", ["sel", typen], "text", "text", "fix"],
        extra: [["Adresse", "text", ""], ["Lage", "lage", ""], ["Hinweis", "text", ""]],
      },
      bauen: async (alt, w, altW) => {
        const name = w[0].trim();
        if (!name) throw new Error("Bitte einen Namen eingeben");
        const lage = await lageLesen(w[6] || (alt ? "" : w[5]), alt, altW?.[6]);
        const s: Station = { ...(alt ?? {}), ...basisVon(alt, "stations", w[7] ?? ""), name, typ: w[1] || "Rettungsdienst", organisation: alt?.organisation ?? "", ort: w[2].trim(), bezirk: w[3].trim(), adresse: (w[5] ?? "").trim(), lat: lage.lat, lon: lage.lon };
        return [s];
      },
    });
  }

  const EINR_NACH_NAME = new Map(EINRICHTUNGEN.flatMap((e) => [[e.name.toLowerCase(), e.id] as [string, string], [e.id.toLowerCase(), e.id] as [string, string]]));
  const AKUT_NACH_NAME = new Map(AKUT.flatMap((a) => [[a.name.toLowerCase(), a.id] as [string, string], [a.id.toLowerCase(), a.id] as [string, string]]));
  const namenLesen = (text: string, karte: Map<string, string>, was: string) =>
    text
      .split(/\s*[;,]\s*/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const id = karte.get(x.toLowerCase());
        if (!id) throw new Error(`${was} „${x}“ gibt es nicht`);
        return id;
      });
  function krankenhaeuser(b: Bausteine): Zeile[] {
    return datenSeite(b, "krankenhaeuser", "hospitals", {
      cols: ["Name", "Kurzname", "Ort"],
      wort: "Krankenhäuser",
      // Reihenfolge wie im Entwurf: Lage (Karte), Zufahrt, Landeplatz, Einrichtungen (Gruppen), Akut-Bereiche aus, Sprung zur KH-Aufnahme
      zeile: (h) => [
        h.name,
        h.kurzname,
        h.ort,
        lageText(h),
        zufahrtText(h.zufahrt),
        landeplatzText(h.landeplatz),
        (h.einrichtungen ?? []).map((id) => einrichtung(id)?.name ?? id).join(", "),
        (h.akutAus ?? []).map((id) => akutAbteilung(id)?.name ?? id).join(", "),
        "",
        h.hinweis ?? "",
      ],
      x: {
        suche: "Krankenhaus suchen …",
        neu: "Neues Krankenhaus",
        ding: "Krankenhaus",
        typen: ["text", "text", "text"],
        extra: [["Lage", "lage", ""], ["Rettungszufahrt", "text", ""], ["Hubschrauberlandeplatz", "text", ""], ["Einrichtungen", "einr", ""], ["Akut-Bereiche aus", "text", ""], ["Aufnahme bei Notfällen", "khlink", ""], ["Hinweis", "text", ""]],
        hint: "„Akut-Bereiche aus“ mit Komma getrennt · Öffnungszeiten der Akut-Bereiche unter KH-Aufnahme",
      },
      bauen: async (alt, w, altW) => {
        const name = w[0].trim();
        if (!name) throw new Error("Bitte einen Namen eingeben");
        const lage = await lageLesen(w[3], alt, altW?.[3]);
        const h: Hospital = { ...(alt ?? {}), ...basisVon(alt, "hospitals", w[9] ?? ""), name, kurzname: w[1].trim(), ort: w[2].trim(), lat: lage.lat, lon: lage.lon };
        if (!alt || geaendert(w, altW, 6)) h.einrichtungen = namenLesen(w[6], EINR_NACH_NAME, "Einrichtung");
        if (!alt || geaendert(w, altW, 7)) h.akutAus = namenLesen(w[7], AKUT_NACH_NAME, "Akut-Abteilung");
        if (!alt || geaendert(w, altW, 4)) {
          const z = zufahrtLesen(w[4]);
          if (w[4].trim() && !z) throw new Error("Zufahrt: bitte so angeben: einfahrt=48.41296,15.61544; p=48.41247,15.61458");
          h.zufahrt = z;
        }
        if (!alt || geaendert(w, altW, 5)) {
          const l = landeplatzLesen(w[5]);
          if (w[5].trim() && !l) throw new Error("Landeplatz: bitte Koordinaten („48.41210,15.61480“) oder „kein“ angeben");
          h.landeplatz = l;
        }
        delete h.abteilungen;
        delete h.bereiche;
        return [h];
      },
    });
  }

  function pois(b: Bausteine): Zeile[] {
    const katText = (p: Poi) => poiKategorien(p).map(kategorieLabel).join(", ");
    return datenSeite(b, "pois", "pois", {
      cols: ["Name", "Kategorien", "Ort"],
      wort: "Orte",
      zeile: (p) => [p.name, katText(p), p.ort, lageText(p), p.hinweis ?? ""],
      x: { suche: "Ort suchen …", neu: "Neuer Ort", ding: "Ort", typen: ["text", "text", "text"], extra: [["Lage", "lage", ""], ["Hinweis", "text", ""]], hint: "Kategorien mit Komma getrennt, z. B. „Pflegeheim, Schule“" },
      bauen: async (alt, w, altW) => {
        const name = w[0].trim();
        if (!name) throw new Error("Bitte einen Namen eingeben");
        const lage = await lageLesen(w[3], alt, altW?.[3]);
        let typ = alt?.typ ?? "";
        if (!alt || geaendert(w, altW, 1)) {
          const keys: string[] = [];
          const eigen: string[] = [];
          for (const t of w[1].split(/\s*[;,]\s*/).map((x) => x.trim()).filter(Boolean)) {
            const k = ORT_KATEGORIEN.find((x) => !x.liste && (x.key === t.toLowerCase() || x.label.toLowerCase() === t.toLowerCase()));
            if (k) keys.push(k.key);
            else eigen.push(t);
          }
          typ = kategorienText(keys, eigen.join(", "));
        }
        const p: Poi = { ...(alt ?? {}), ...basisVon(alt, "pois", w[4] ?? ""), name, typ, ort: w[2].trim(), lat: lage.lat, lon: lage.lon };
        return [p];
      },
    });
  }

  const TRANSPORT = ["nach Stufe", "ja", "nein"];
  function vorlagen(b: Bausteine): Zeile[] {
    return datenSeite(b, "vorlagen", "templates", {
      cols: ["Code", "Adresse", "Meldung"],
      wort: "Vorlagen",
      zeile: (t) => [t.code, t.adresse, t.meldung, lageText(t), t.patientAlter == null ? "" : String(t.patientAlter), t.transport == null ? "nach Stufe" : t.transport ? "ja" : "nein", t.hinweis ?? ""],
      x: { suche: "Vorlage suchen …", neu: "Neue Vorlage", ding: "Vorlage", typen: ["text", "text", "text"], extra: [["Lage", "lage", ""], ["Patient Alter", "text", ""], ["Transport", ["sel", TRANSPORT], "nach Stufe"], ["Hinweis", "text", ""]] },
      bauen: async (alt, w, altW) => {
        const code = w[0].trim();
        if (!code) throw new Error("Bitte einen Code eingeben");
        const lage = await lageLesen(w[3] || (alt && !geaendert(w, altW, 1) ? "" : w[1]), alt, altW?.[3]);
        const alter = w[4].trim();
        if (alter && !Number.isFinite(Number(alter))) throw new Error(`Alter „${alter}“ ist keine Zahl`);
        const t: Einsatzvorlage = {
          ...(alt ?? {}),
          ...basisVon(alt, "templates", w[6] ?? ""),
          code,
          adresse: w[1].trim(),
          meldung: w[2].trim(),
          lat: lage.lat,
          lon: lage.lon,
          patientAlter: alter === "" ? null : Number(alter),
          transport: w[5] === "ja" ? true : w[5] === "nein" ? false : null,
        };
        return [t];
      },
    });
  }

  // ---------------- Einsatzcodes & Abfrage
  function codes(b: Bausteine): Zeile[] {
    const rd = allCodes();
    const rdD = aktivDatei("notruf");
    const satz = rdD ? rdD.replace(/\.(json|csv|txt)$/i, "") : null;
    const kapitel = store.schema ? Object.keys(store.schema.kapitel).length : new Set(rd.map((x) => x.gruppenname)).size;
    const kt = ktCodes();
    const ktName = store.ktSatzRoh ? store.ktSatzRoh.name || "Eigener Satz" : null;
    const rdName = satz ? `Eigene Datei: ${satz}` : "LeitWerk-Codesystem (eingebaut)";
    const ktLabel = ktName ? `Eigene Datei: ${ktName}` : "LeitWerk-Transportcodes (eingebaut)";
    const kap = (x: { gruppe: number; gruppenname: string }) => (x.gruppe ? `${x.gruppe} - ${x.gruppenname}` : x.gruppenname);
    return [
      b.I("Notruf (RD)", rdName, `${zahl(rd.length)} Codes in ${kapitel} Kapiteln${store.schema ? ", mit Abfrage" : ""}`, rd.length ? OK : GELB),
      b.I("Krankentransport & Überstellung (KT/SEK)", ktLabel, `${zahl(kt.length)} Codes, mit KT-Abfrage`, kt.length ? OK : GELB),
      b.B("Eigene Codes & Abfrage", [{ l: "Notruf (RD)", go: ["real", "notruf"] }, { l: "KT/SEK", go: ["real", "ktsek"] }], "Unter Eigene Dateien hochladen und umschalten – jeder Spieler selbst"),
      b.S("Codeliste", "codeart", ["Notruf (RD)", "KT/SEK"], "Notruf (RD)"),
      b.TAB(["Code", "Name", "Kategorie", "Kapitel"], rd.map((x) => [x.code, x.beschreibung, x.stufe, kap(x)]), {
        suche: "Code suchen …",
        anzahl: `${zahl(rd.length)} Codes · ${satz ?? "LeitWerk-Codesystem"}`,
        when: (v: (k: string, d: unknown) => unknown) => v("codeart", "Notruf (RD)") === "Notruf (RD)",
      }),
      b.TAB(["Code", "Name", "Kapitel", "Art"], kt.map((x) => [x.code, x.name, x.kapitel, x.gruppe]), {
        suche: "Code suchen …",
        anzahl: `${zahl(kt.length)} Codes · ${ktName ?? "LeitWerk-Transportcodes"}`,
        when: (v: (k: string, d: unknown) => unknown) => v("codeart", "Notruf (RD)") === "KT/SEK",
      }),
    ];
  }

  // ---------------- Statusmodell
  const BEDEUTUNG_EXTRA: Record<string, string> = { alarmWache: "alarmiert auf der Wache", alarmFunk: "alarmiert über Funk" };
  const bedeutung = (key: string) => STATUS_BEDEUTUNG[key] ?? BEDEUTUNG_EXTRA[key] ?? key;
  function status(b: Bausteine): Zeile[] {
    return [
      b.H("Bedeutung · Nummer · Bezeichnung · Farbe · alarmierbar"),
      ...store.settings.status.map((s, i) => ({ t: "stat", label: bedeutung(s.key), key: "st" + (i + 1), nr: s.nummer, nm: s.name, color: s.farbe, on: s.verfuegbar }) as Zeile),
    ];
  }

  // ---------------- Eigene Dateien (Beta 70): je Reiter genau eine Datei – Notruf, KT/SEK, Namen
  const basisName = (datei: string) => datei.replace(/\.(json|csv|txt)$/i, "");
  const EINGEBAUT: Record<Teil, string> = {
    notruf: "Eingebaut – LeitWerk-Codesystem",
    ktsek: "Eingebaut – LeitWerk-Transportcodes",
  };
  const FORMAT: Record<Teil, string> = {
    notruf: "Eine JSON-Datei mit Kapiteln, Fragen, Regeln und Codes – Aufbau wie die Beispieldatei",
    ktsek: "Eine JSON-Datei mit allen KT/SEK-Codes und ihren Bedingungen – Aufbau wie die Beispieldatei",
  };
  const notrufAnleitung = (): string => {
    const a = (JSON.parse(BEISPIEL_NOTRUF) as { anleitung_fuer_ki?: string | string[] }).anleitung_fuer_ki ?? "";
    return Array.isArray(a) ? a.join("\n") : a;
  };
  const BEISPIEL: Record<Teil, { datei: string; hint: string; text: () => string; ki: () => string }> = {
    notruf: {
      datei: "Beispiel Notruf.json",
      hint: "Kleines, vollständiges Beispiel (3 Kapitel) – zeigt den Aufbau. Oben in der Datei steht eine Anleitung für eine KI.",
      text: () => BEISPIEL_NOTRUF,
      ki: notrufAnleitung,
    },
    ktsek: {
      datei: "Beispiel KT-SEK.json",
      hint: "Die eingebauten KT/SEK-Codes als Beispiel – vollständig, weil jede Kombination genau einen Code braucht. Oben in der Datei steht eine Anleitung für eine KI.",
      text: ktBeispiel,
      ki: () => ktKiAnleitung().join("\n"),
    },
  };
  /** Text für die KI: Anleitung + Beispieldatei + Platz für den Auftrag */
  const kiText = (anleitung: string, beispiel: string, art: string) =>
    `${anleitung}\n\n## Beispieldatei (${art})\n\n\`\`\`\n${beispiel}\n\`\`\`\n\n## Mein Auftrag\nRegion: \nWorauf achten: \n`;
  const kiKnopf = (anleitung: () => string, beispiel: () => string, art: string) =>
    knopf("KI-Anleitung kopieren", async () => {
      await navigator.clipboard.writeText(kiText(anleitung(), beispiel(), art));
      return "Kopiert – in eine KI einfügen, unten Region und Wünsche ergänzen";
    });

  /** Dropdown „Aktiv“: Schlüssel mit Zähler, damit nach jedem Wechsel wieder der echte Stand angezeigt wird */
  function aktivWahl(b: Bausteine, id: string, optionen: string[], jetzt: string, wechsel: (v: string) => Promise<string>, hint: string): Zeile[] {
    const key = `ak_${id}_${wahlStand[id] ?? 0}`;
    wahlen[key] = (v) => {
      if (v === jetzt) return;
      wahlMeldung[id] = { t: "wird umgeschaltet …", dot: GRAU };
      neu();
      void wechsel(v)
        .then((t) => (wahlMeldung[id] = { t, dot: OK }))
        .catch((e) => (wahlMeldung[id] = { t: fehlerText(e), dot: ROT }))
        .finally(() => {
          wahlStand[id] = (wahlStand[id] ?? 0) + 1;
          void Promise.all([teileLaden(), namenLaden()]).finally(neu);
        });
    };
    const out = [b.L("Aktiv", key, optionen, jetzt, hint)];
    const m = wahlMeldung[id];
    if (m) out.push(b.I("Rückmeldung", m.t, "", m.dot));
    return out;
  }

  const ordnerZeile = (b: Bausteine, o: AblageOrdner) =>
    tauri ? b.B("Ordner", [knopf("Ordner öffnen", () => ablageZeigen(o))], `Dokumente/LeitWerk/${o}`) : b.B("Ordner", [], `Dokumente/LeitWerk/${o}`, { chip: NUR_PROGRAMM, dot: GRAU });

  /** Reiter Notruf (RD) bzw. KT/SEK: eine Datei */
  function teilSeite(b: Bausteine, t: Teil): Zeile[] {
    const d = TEILE[t];
    const liste = c.teile?.[t];
    const aktivD = aktivDatei(t);
    const out: Zeile[] = [];
    const spielbar = (liste ?? []).filter((x) => !x.entwurf);
    const namen = spielbar.map((x) => x.name);
    const jetzt = aktivD ? basisName(aktivD) : EINGEBAUT[t];
    const optionen = [EINGEBAUT[t], ...namen];
    if (aktivD && !namen.some((n) => n.toLowerCase() === jetzt.toLowerCase())) optionen.push(jetzt);
    out.push(
      ...aktivWahl(
        b,
        t,
        optionen,
        jetzt,
        async (v) => {
          if (v === EINGEBAUT[t]) return teilAktivieren(t, null);
          const x = spielbar.find((y) => y.name === v);
          if (!x) throw new Error(`„${v}“ ist nicht mehr im Ordner – bitte neu hochladen`);
          return teilAktivieren(t, x.datei);
        },
        "Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner",
      ),
    );
    if (t === "notruf") {
      const s = store.schemaRoh;
      out.push(b.I("Inhalt", s ? `${zahl(Object.keys(s.kapitel).length)} Kapitel · ${zahl(Object.keys(s.codes ?? {}).length)} Codes` : `${zahl(allCodes().length)} Codes`, "Codes und Abfrage stecken in derselben Datei", OK));
      out.push(b.B("Zuordnung zu den LeitWerk-Merkmalen", [{ l: "Zuordnung …", sub: "zuordnung" }], "Nur für eine eigene Datei: welche Frage welchem Merkmal entspricht – damit die Anrufer passend antworten"));
    } else {
      out.push(b.I("Inhalt", `${zahl(ktCodes().length)} Codes`, "Die Fragen der KT-Hotline sind immer die eingebauten", OK));
      out.push(b.B("KT-Code-Editor", [knopf("Editor öffnen", () => (ktEditorOeffnen({ fertig: () => void teileLaden() }), "Im Editor geöffnet"))], "Codes und Bedingungen im Spiel bearbeiten – speichert als neue Datei; dort auch Entwürfe fertigstellen"));
    }
    const bsp = BEISPIEL[t];
    out.push(b.H("Eigene Datei hinzufügen"));
    out.push(b.B("Datei hochladen", [dateiKnopf("Datei wählen …", ".json,application/json", async (x) => teilHochladen(t, x.name, await dateiText(x)), teileLaden)], `${FORMAT[t]} · wird in den Ordner kopiert und gleich verwendet`));
    const bKnoepfe: Knopf[] = [knopf("Beispieldatei herunterladen …", async () => ((await saveTextFile(bsp.datei, bsp.text(), { name: "JSON-Datei", extensions: ["json"] })) ? `Gespeichert: ${bsp.datei}` : "Abgebrochen"))];
    if (t === "notruf") bKnoepfe.push(knopf("Eingebautes System herunterladen …", async () => ((await saveTextFile("LeitWerk-Codesystem.json", STANDARD_CODESYSTEM_TEXT, { name: "JSON-Datei", extensions: ["json"] })) ? "Gespeichert: LeitWerk-Codesystem.json" : "Abgebrochen")));
    out.push(b.B("Beispieldatei", bKnoepfe, bsp.hint));
    out.push(b.B("Mit einer KI erstellen", [kiKnopf(bsp.ki, bsp.text, "JSON")], "Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch Region und Wünsche dazuschreiben"));
    out.push(ordnerZeile(b, d.ordner));
    out.push(b.H(`Dateien im Ordner ${d.ordner}`));
    if (!liste) out.push(b.I("Dateien", PRUEFT, "", GRAU));
    else if (!liste.length) out.push(b.I("Dateien", "noch keine eigene Datei", "Mit „Datei hochladen“ hinzufügen oder direkt in den Ordner legen", GRAU));
    for (const x of liste ?? []) {
      const istAktiv = aktivD?.toLowerCase() === x.datei.toLowerCase();
      const btns: Knopf[] = [];
      if (t === "ktsek")
        btns.push(
          knopf("Bearbeiten", async () => {
            const codes = ktCodesLesen(await ablageLesen(d.ordner, x.datei), x.datei);
            ktEditorOeffnen({ satz: { codes }, name: x.name, fertig: () => void teileLaden() });
            return "Im Editor geöffnet";
          }),
        );
      btns.push(knopf("Löschen", () => teilLoeschen(t, x.datei), { cfm: `„${x.datei}“ wird aus Dokumente/LeitWerk/${d.ordner} gelöscht.` }, teileLaden));
      out.push(b.IT(x.name, `${x.entwurf ? "ENTWURF – im KT-Code-Editor fertigstellen · " : ""}${x.datei}`, istAktiv ? "aktiv" : x.entwurf ? "Entwurf" : "", istAktiv ? OK : x.entwurf ? GELB : "", { btns }));
    }
    return out;
  }

  /** Reiter Namen: echte Namen per Datei (die eingebauten Daten sind neutral) */
  function namenSeite(b: Bausteine): Zeile[] {
    const EIN = "Eingebaut – neutrale Namen";
    const aktivD = store.namen.length ? (store.namenDatei ?? "") : null;
    const liste = c.namen ?? [];
    const jetzt = aktivD === null ? EIN : aktivD || "eigene Namen";
    const optionen = [EIN, ...liste.map((d) => d.datei)];
    if (aktivD !== null && !optionen.includes(jetzt)) optionen.push(jetzt);
    const out: Zeile[] = [
      ...aktivWahl(
        b,
        "namen",
        optionen,
        jetzt,
        async (v) => {
          if (v === EIN) return store.setNamen(null), "Wieder neutrale Namen";
          return namenVerwenden(v);
        },
        "Gilt sofort · nur auf diesem Rechner · Liste = Dateien im Ordner",
      ),
      b.I("Ersetzungen", aktivD === null ? "Rettungsdienst, Rettungswache, Krankentransport, Luftrettung, NAH 2 …" : `${zahl(store.namen.length)} Ersetzungen aus „${aktivD}“`, "Gilt für Dienststellen, Organisationen, Hubschrauber-Namen und Orte – auch für Krankentransport und Überstellungen", OK),
      b.H("Eigene Datei hinzufügen"),
    ];
    const laden = dateiKnopf(
      "Datei wählen …",
      ".csv,.txt,text/csv,text/plain",
      async (f) => {
        const text = await dateiText(f);
        const r = ersetzungenLesen(text);
        if (!r.length) throw new Error("Keine Ersetzungen gefunden (Zeilen „neutral;eigen“, rechts ausgefüllt)");
        const name = ablageName(f.name, "csv");
        await ablageSpeichern("Namen", name, text);
        store.setNamen(r, name);
        return `${zahl(r.length)} Ersetzungen aktiv – „${name}“ in Dokumente/LeitWerk/Namen`;
      },
      namenLaden,
    );
    out.push(b.B("Datei hochladen", [laden], "CSV „neutral;eigen“ – links der neutrale Name aus der Vorlage, rechts dein Name · wird in den Ordner kopiert und gleich verwendet"));
    out.push(
      b.B(
        "Beispieldatei",
        [knopf("Beispieldatei herunterladen …", async () => ((await saveTextFile(NAMEN_VORLAGE, namenVorlage(standardRecords()))) ? `Gespeichert: ${NAMEN_VORLAGE}` : "Abgebrochen"))],
        "Alle neutralen Namen: Organisationen, Hubschrauber, Stützpunkte für Krankentransport & Überstellung (KT/SEK), Dienststellen – rechts eintragen. Oben steht eine Anleitung für eine KI. Liegt auch im Ordner.",
      ),
    );
    out.push(b.B("Mit einer KI erstellen", [kiKnopf(() => namenKiAnleitung().join("\n"), () => namenVorlage(standardRecords()), "CSV")], "Kopiert die Anleitung samt Beispieldatei – in eine KI einfügen und nur noch die Region dazuschreiben"));
    out.push(ordnerZeile(b, "Namen"));
    out.push(b.B("Im Ordner geändert?", [knopf("Neu einlesen", () => namenLaden().then(() => (aktivD ? namenVerwenden(aktivD) : "Eingelesen")))], "Nach dem Bearbeiten einer Datei im Ordner"));
    out.push(b.H("Dateien im Ordner Namen"));
    if (!c.namen) out.push(b.I("Dateien", PRUEFT, "", GRAU));
    for (const d of liste) {
      const istAktiv = aktivD !== null && aktivD.toLowerCase() === d.datei.toLowerCase();
      const vorlage = d.datei === NAMEN_VORLAGE;
      const btns: Knopf[] = vorlage
        ? []
        : [
            knopf(
              "Löschen",
              async () => {
                await ablageLoeschen("Namen", d.datei);
                if (istAktiv) store.setNamen(null);
                return "Gelöscht";
              },
              { cfm: `„${d.datei}“ wird aus Dokumente/LeitWerk/Namen gelöscht.` },
              namenLaden,
            ),
          ];
      out.push(b.IT(basisName(d.datei), vorlage ? "Vorlage mit allen neutralen Namen – rechts eintragen, unter neuem Namen speichern" : d.datei, istAktiv ? "aktiv" : "", istAktiv ? OK : "", { btns }));
    }
    return out;
  }
  /** Namensdatei aus dem Ordner lesen und aktivieren */
  async function namenVerwenden(datei: string): Promise<string> {
    const r = ersetzungenLesen(await ablageLesen("Namen", datei));
    if (!r.length) throw new Error(datei === NAMEN_VORLAGE ? "Die Vorlage ist noch leer – rechts die eigenen Namen eintragen" : "Keine Ersetzungen in der Datei (rechte Spalte leer?)");
    store.setNamen(r, datei);
    return `${zahl(r.length)} Ersetzungen aktiv`;
  }

  // ---------------- Kartenpakete
  function karten(b: Bausteine): Zeile[] {
    if (!tauri) return [b.I("Kartenpakete", NUR_PROGRAMM, "Kartenpakete gibt es nur im installierten Programm", GRAU), b.I("Satellitenbild", "online, ohne Paket", "", GRAU)];
    const out: Zeile[] = [];
    const local = c.local;
    const g = c.geo;
    const inst = local?.installed ?? {};
    out.push(b.I("Grundpaket & Straßen Niederösterreich", local === undefined ? PRUEFT : inst[GRUNDPAKET] && inst["bl-noe"] ? "immer installiert" : "fehlt – wird beim Start geladen", "", local === undefined ? GRAU : inst[GRUNDPAKET] && inst["bl-noe"] ? OK : GELB));
    if (g === undefined) out.push(b.I("Straßennetz und Adressen", PRUEFT, "", GRAU));
    else if (!g) out.push(b.I("Straßennetz und Adressen", "Status unbekannt", "", GELB));
    else {
      const bl = (g.regionen ?? []).map((r) => (r === "alt" ? "älteres Gesamtnetz" : REGIONEN[r] ?? r)).join(", ");
      out.push(b.I("Straßennetz und Adressen", g.roads, [g.roads_nodes ? `${zahl(g.roads_nodes)} Knoten` : "", g.address_count ? `${zahl(g.address_count)} Adressen` : "", bl ? `Bundesländer: ${bl}` : ""].filter(Boolean).join(" · "), g.roads_nodes ? OK : GELB));
    }
    if (c.packsFehler) out.push(b.I("Paketverzeichnis", "nicht erreichbar", `${c.packsFehler} – Download derzeit nicht möglich`, GELB));
    const packs = c.packs ?? [];
    const ids = [...new Set([...packs.map((p) => p.id), ...Object.keys(inst)])].filter((id) => id !== GRUNDPAKET && id !== "bl-noe");
    const aus = g?.regionen_aus ?? [];
    const zeile = (id: string) => {
      const p = packs.find((x) => x.id === id);
      const i = inst[id];
      const lade = ladeStand[`pack:${id}`];
      const update = !!(p && i && p.version !== i.version);
      const region = id.startsWith("bl-") ? id.slice(3) : null;
      const btns: Knopf[] = [];
      if (!lade) {
        if (p && (!i || update))
          btns.push(
            knopf(
              i ? "Aktualisieren" : "Laden",
              async () => {
                await mitStand(`pack:${id}`, "Wird geladen … 0 %", (setz) => installPack(id, (pr) => setz(`Wird geladen … ${prozent(pr.done, pr.total)}`)));
                packsChanged();
                return `${p.name} installiert`;
              },
              {},
              packsLaden,
            ),
          );
        if (i && !(p?.pflicht ?? false))
          btns.push(
            knopf(
              "Löschen",
              async () => {
                await removePack(id);
                packsChanged();
                return "Gelöscht";
              },
              { cfm: `${p?.name ?? id} löschen?${region ? ` Ohne Paket gibt es keine Transporte nach ${REGIONEN[region] ?? region}.` : ""} Du kannst es jederzeit wieder laden.` },
              packsLaden,
            ),
          );
      }
      const x: { btns: Knopf[]; tog?: [string, boolean] } = { btns };
      if (i && region && region !== "noe") x.tog = ["kp_" + region, !aus.includes(region)];
      const hint = [p?.beschreibung, p ? formatBytes(packSize(p)) : ""].filter(Boolean).join(" · ");
      return b.IT(p?.name ?? id, hint, lade ?? (update ? "Update verfügbar" : i ? "installiert" : ""), lade ? BLAU : update ? GELB : i ? OK : "", x);
    };
    const strassen = ids.filter((id) => id.startsWith("bl-"));
    const andere = ids.filter((id) => !id.startsWith("bl-"));
    out.push(b.H("Straßen weiterer Bundesländer"));
    if (c.packs === undefined && !strassen.length) out.push(b.I("Paketverzeichnis", PRUEFT, "", GRAU));
    out.push(...strassen.map(zeile));
    out.push(b.H("Detailkarten und Gelände"));
    out.push(...andere.map(zeile));
    out.push(b.I("Satellitenbild", "online, ohne Paket", "", GRAU));
    if (local?.dir) out.push(b.I("Speicherort", local.dir, "", GRAU));
    return out;
  }

  // ---------------- Programm & Updates
  function programm(b: Bausteine): Zeile[] {
    const u = c.update;
    const out: Zeile[] = [
      b.I("Version", c.version === undefined ? PRUEFT : !tauri ? `${c.version} · Entwicklung im Browser` : u ? `${c.version} · Update auf ${u.version} verfügbar` : `${c.version} · aktuell`, "", !tauri ? GRAU : u ? GELB : OK),
    ];
    if (!tauri) out.push(b.B("Updates", [], "", { chip: NUR_PROGRAMM, dot: GRAU }));
    else {
      const btns: Knopf[] = [
        knopf("Jetzt suchen", async () => {
          const neu2 = await updateJetztPruefen();
          c.update = neu2;
          return neu2 ? `Version ${neu2.version} verfügbar` : "Auf dem neuesten Stand";
        }),
      ];
      if (u) btns.push(knopf("Installieren", () => (updateInstallieren(u), "Wird installiert – LeitWerk startet danach neu"), { cfm: "Jetzt aktualisieren? LeitWerk startet danach neu – deine Daten und Einstellungen bleiben." }));
      out.push(b.B("Updates", btns, u?.notes ? u.notes.split("\n")[0] : undefined));
    }
    out.push(b.H("Eigene Dateien & Spielstände"));
    out.push(b.I("Ordner", c.basis ?? "…", "Alles, was du selbst dazugibst, liegt dort – je Art ein Ordner", GRAU));
    out.push(b.B("Spielstände", [{ l: "Ansehen", tab: "fort" }, ...(tauri ? [knopf("Ordner öffnen", () => ordnerZeigen())] : [])], "Gespeicherte Schichten"));
    for (const [o, h] of Object.entries(ABLAGE_INFO) as [AblageOrdner, string][])
      if (!["Abfrageschema", "Codelisten", "Codelisten/RD", "Abfrageschema/Krankentransport_Sekundärtransporte"].includes(o))
        out.push(tauri ? b.B(o.replace(/_/g, " "), [knopf("Ordner öffnen", () => ablageZeigen(o))], h) : b.B(o.replace(/_/g, " "), [], h, { chip: NUR_PROGRAMM, dot: GRAU }));
    // Herkunft der Telefon-Geräusche (CC BY verlangt die Namen)
    const by = KLANG_DATEIEN.filter((d) => d.lizenz.startsWith("CC BY"));
    if (KLANG_DATEIEN.length) {
      out.push(b.H("Geräusche am Telefon"));
      out.push(b.I("Herkunft", `${KLANG_DATEIEN.length} Aufnahmen von freesound.org`, `${KLANG_DATEIEN.length - by.length} frei (CC0), ${by.length} mit Namensnennung (CC BY)`, GRAU));
      for (const d of by) out.push(b.I(d.titel || d.tag, `${d.urheber} · ${d.lizenz}`, d.quelle, GRAU));
    }
    return out;
  }

  // ================================================================== Verteilung

  const SEITEN: Record<string, (b: Bausteine) => Zeile[]> = {
    fgfarben,
    statusfarben,
    einrichten,
    discord: discordSeite,
    audio,
    gespraech,
    toene: toeneSeite,
    gemini,
    modelle,
    piper,
    whisper,
    anordnungen: anordnungenSeite,
    faelle,
    alarmierung,
    fahrzeuge,
    dienststellen,
    krankenhaeuser,
    pois,
    vorlagen,
    codes,
    status,
    notruf: (b) => teilSeite(b, "notruf"),
    ktsek: (b) => teilSeite(b, "ktsek"),
    namen: namenSeite,
    karten,
    programm,
  };

  const zeilen: ZeilenQuelle = (seite, b) => {
    const f = SEITEN[seite];
    if (!f) return undefined;
    try {
      return f(b);
    } catch (e) {
      console.error("Hauptmenü-Zeilen", seite, e);
      return [b.I("Fehler", fehlerText(e), "Diese Seite konnte nicht aufgebaut werden", ROT)];
    }
  };

  let geladen = false;
  return {
    zeilen,
    laden() {
      if (geladen) return;
      geladen = true;
      beobachten();
      void dateienLaden();
      void kiLaden();
      void ramLaden();
      void piperLaden2();
      void whisperLaden();
      void teileLaden();
      void namenLaden();
      void packsLaden();
      void programmLaden();
    },
    beenden() {
      beendet = true;
      if (zt) clearTimeout(zt);
      aus.splice(0).forEach((f) => f());
      if (aktiv?.bald === bald) aktiv = null;
    },
  };
}
