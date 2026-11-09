/**
 * Echte Zeilen für die Einstellungsseiten des Hauptmenüs (statt der Beispieldaten aus dem Design).
 * Die Komponente ruft zeilen(seite, bausteine); undefined = Zeilen aus dem Design.
 * Asynchrone Daten (Status, Listen) werden in laden() einmal geholt, zwischengespeichert und nach jeder Aktion aufgefrischt.
 * Im Hauptmenü gibt es keine Dialoge: Rückfragen über cfm, Ergebnisse als Chip (Rückgabe-Text bzw. throw).
 */
import { FARBEN, type Bausteine, type Knopf, type Zeile, type ZeilenQuelle } from "./vertrag";
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
import { ktCodes, standardKtAbfrage } from "../../sim/ktCodes";
import { pruefeKtSatz } from "../../sim/ktBedingungen";
import { sim } from "../../sim/engine";
import { geoStatus, regionSetzen, searchAddress, REGIONEN, type GeoStatus } from "../../sim/geo";
import { GRUNDPAKET, appVersion, formatBytes, installPack, packSize, packsChanged, packsLocal, packsManifest, removePack, type Pack, type PacksLocal, type UpdateInfo } from "../../updates";
import { updateInfo, updateInstallieren, onUpdate, updateJetztPruefen } from "../updateDienst";
import { ABLAGE_INFO, ablageBasis, ablageLesen, ablageLoeschen, ablageName, ablageSichern, ablageSpeichern, ablageZeigen, type AblageOrdner } from "../../net/ablage";
import { ordnerZeigen } from "../../net/spielstandOrdner";
import { pers, onPers, setzePers } from "../ws/persoenlich";
import { STATUS_BEDEUTUNG } from "../settingsView";
import { DATEI_REGELN, EREIGNIS_LABEL, STANDARD_SOUND, VORLAGEN as TON_VORLAGEN, dateiHinzufuegen, dateiLoeschen, eigeneDateien, spielen, type EigeneDatei, type SoundEreignis } from "../sounds";
import { anrufKiModus, livePrefs, liveTesten, prefsHoerer, schluesselDa, schluesselGeprueft } from "../../abfrage/liveKi";
import { MODELLE as KI_MODELLE, STUFE_LABEL, empfohleneStufe, kiBeenden, kiChat, kiInstallieren, kiModellLaden, kiModellLoeschen, kiPrefs, kiStarten, kiStatus, rechnerRam, setKiPrefs, type KiStatus } from "../../abfrage/ki";
import { MODELLE as SPRACH_MODELLE, PIPER_STIMMEN, modellLaden, modellLoeschen, piperLaden, piperLoeschen, piperStatus, probe, setzeSprache, sprachPrefs, sprachStatus } from "../sprache";
import { LAYOUT_KEY, anordnungAnwenden, anordnungen, anordnungImportieren, anordnungLoeschen, dock, onPanelsGeaendert } from "../ws/arbeitsplatz";
import { alleFaelle, eingebauterFall, faelleGeaendert, fallpaketExport, fallpaketImport, istFallAktiv, istGeaendert, type FallVorlage } from "../../abfrage/faelle";
import { faellePruefen } from "../../abfrage/faellePruefen";
import { fallEditorOeffnen } from "../fallEditor";
import {
  ORDNER,
  aktiverKtSatz,
  aktiverSatz,
  aktivMerken,
  codesLesen,
  eingebautAktivieren,
  eingebauteKtCodes,
  ktAbfrageLesen,
  ktCodesLesen,
  rdSchemaLesen,
  satzListe,
  type Bereich,
  type CodeSatz,
} from "../codesaetze";
import { ktEditorOeffnen } from "../ktCodeEditor";
import { pruefeCodesystem } from "../../abfrage/codesystem";
import type { Schema } from "../../abfrage/schema";
import type { Einsatzcode } from "../../data/model";

const { ok: OK, grau: GRAU, gelb: GELB, blau: BLAU, rot: ROT } = FARBEN;
const NUR_PROGRAMM = "nur im Programm";
const PRUEFT = "wird geprüft …";

// ------------------------------------------------------------------ Modul-Zustand (bleibt über das Schließen des Menüs erhalten)

/** laufende Downloads/Installationen: Schlüssel → Fortschrittstext */
const ladeStand: Record<string, string> = {};
/** Werte unbekannter Schlüssel, die die Komponente meldet (Felder z_…, omod, Schalter kp_…, Suche tq_…) */
const zw: Record<string, unknown> = {};
/** gewählte Dateien der Hochladen-Seiten */
const gewaehlt: Record<Bereich, { codes?: { name: string; text: string; info: string }; schema?: { name: string; text: string; info: string } }> = { rd: {}, kt: {} };
/** Fehler beim Speichern einer Tabellenzeile (je Seite), bis zum nächsten erfolgreichen Speichern */
const tabFehler: Record<string, string> = {};

/** Verbindung zur gerade offenen Quelle (für feldWert und Downloads, die nach dem Schließen weiterlaufen) */
let aktiv: { bald(): void; regionSchalten(region: string, an: boolean): void } | null = null;

/** Die Komponente meldet Werte von Schlüsseln, die bindung.ts nicht kennt. */
export function feldWert(key: string, wert: unknown): void {
  zw[key] = wert;
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
    saetze?: Record<Bereich, CodeSatz[]>;
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
  const saetzeLaden = async () => {
    const [rd, kt] = await Promise.all([satzListe("rd").catch(() => []), satzListe("kt").catch(() => [])]);
    c.saetze = { rd, kt };
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
      ...store.settings.status.map((s, i) => b.C(`${s.nummer} – ${s.name}`, "sf_st" + (i + 1), s.farbe, bedeutung(s.key))),
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
    const hint = "Läuft auf diesem Rechner – ohne Internet, ohne Konto";
    if (!tauri) return b.B("Ollama", [], hint, { chip: NUR_PROGRAMM, dot: GRAU });
    if (ladeStand.ollama) return b.B("Ollama", [], hint, { chip: ladeStand.ollama, dot: BLAU });
    const s = c.ki;
    if (s === undefined) return b.B("Ollama", [], hint, { chip: PRUEFT, dot: GRAU });
    if (s === null) return b.B("Ollama", [knopf("Prüfen", () => undefined, {}, kiLaden)], hint, { chip: "Status unbekannt", dot: GELB });
    if (!s.installiert)
      return b.B(
        "Ollama",
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
        "Ollama",
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
    return b.B("Ollama", [knopf("Beenden", async () => (await kiBeenden(), "Beendet"), {}, kiLaden)], hint, { chip: "installiert · läuft", dot: OK });
  }
  function anrufe(b: Bausteine): Zeile[] {
    const geprueft = schluesselGeprueft();
    const da = schluesselDa();
    const m = kiPrefs().modell;
    const info = KI_MODELLE.find((x) => x.name === m);
    const empf = c.ram ? empfohleneStufe(c.ram) : null;
    const modellHint = `${info ? `${STUFE_LABEL[info.stufe]}: ` : ""}${m}${c.ram ? ` · dieser Rechner: ${c.ram} GB${empf ? `, empfohlen: ${STUFE_LABEL[empf]}` : ""}` : ""}`;
    const modellChip = !tauri ? { chip: NUR_PROGRAMM, dot: GRAU } : c.ki === undefined ? { chip: m, dot: GRAU } : hatModell(m) ? { chip: m, dot: OK } : { chip: `${m} · nicht geladen`, dot: GELB };
    return [
      b.S("Anrufer-KI", "kimodus", ["Gemini (Cloud)", "Lokal (Ollama)"], "Lokal (Ollama)", "Fällt Gemini aus, springt die lokale KI ein"),
      b.H("Gemini (Cloud)"),
      b.B("Schlüssel", [{ l: "Einrichten …", sub: "gemini" }, knopf("Testen", geminiTest)], "Kostenlos, wird nur auf diesem Rechner gespeichert", geprueft ? { chip: "geprüft", dot: OK } : da ? { chip: "eingerichtet · nicht geprüft", dot: GELB } : { chip: "nicht eingerichtet", dot: GRAU }),
      b.T("Freisprechen (ohne Sprechtaste)", "freispr", false, "Am besten mit Kopfhörern"),
      b.T("Telefonklang und Geräusche vom Notfallort", "klang", true),
      b.T("Funk: Gemini versteht den Funk (Test)", "gfunk", false, "Kennt alle Fahrzeuge, schreibt Rufnamen richtig"),
      b.T("Funk: Mit Gemini sprechen auch die Fahrzeuge", "gfzg", false, "Jedes Fahrzeug mit eigener Stimme, neu verteilt bei jedem Schichtwechsel"),
      b.H("Lokale KI (Ollama)"),
      ollamaZeile(b),
      b.B("Sprachmodell", [{ l: "Modelle …", sub: "modelle" }], modellHint, modellChip),
      b.T("Lokale KI verwenden", "lokal", true, "Sonst einfache, vorbereitete Antworten"),
      b.T("Ollama beim Beenden von LeitWerk schließen", "olbeend", true),
      b.T("Schnelles Gespräch (Test)", "schnell", false, "Anrufer spricht ab dem ersten geprüften Satz"),
      b.B(
        "Ausprobieren",
        [
          knopf("Testanruf", async () => {
            if (anrufKiModus() === "gemini" && da) return geminiTest();
            const r = await lokalerTest();
            return `Anrufer: „${r.antwort}“`;
          }),
          knopf("Geschwindigkeit", async () => {
            if (anrufKiModus() === "gemini" && da) return geminiTest();
            const { s1, s2 } = await lokalerTest();
            const urteil = s2 <= 5 ? "Flüssig – passt gut" : s2 <= 10 ? "Brauchbar" : s2 <= 18 ? "Eher langsam – eine Stufe kleiner wäre flüssiger" : "Zu langsam für Gespräche – bitte eine kleinere Stufe";
            return `${urteil}: erste Wörter nach ${komma(s1)} s, fertig nach ${komma(s2)} s`;
          }, {}, kiLaden),
        ],
        "Probegespräch ohne Spiel · wie schnell der Anrufer antwortet (der erste Test nach dem Laden dauert länger)",
      ),
      b.H("Funk"),
      b.T("Funkmeldungen manchmal unvollständig", "unvoll", true, "NEF meist vollständig, RTW öfter nicht, KTW am öftesten – dann nachfragen"),
    ];
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
    if (!s.laeuft) throw new Error("Ollama läuft nicht – erst unter „Anrufe & KI“ starten");
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
    if (s && !s.laeuft) out.push(b.I("Ollama", s.installiert ? "läuft nicht" : "nicht installiert", "Laden und Löschen geht nur, wenn Ollama läuft (Anrufe & KI)", GELB));
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
      const na = new Set(f.varianten.map((v) => v.na));
      if (na.size === 1 && na.has("nein")) return "nein";
      if (na.size === 1 && na.has("immer")) return "ja";
      if ([...na].some((x) => x !== "nein" && x !== "immer")) return "nach Kompetenz";
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
    const satz = aktiverSatz();
    const kapitel = store.schema ? Object.keys(store.schema.kapitel).length : new Set(rd.map((x) => x.gruppenname)).size;
    const kt = ktCodes();
    const ktName = aktiverKtSatz();
    const rdName = satz ? `Eigener Satz: ${satz}` : "LeitWerk-Codesystem (eingebaut)";
    const ktLabel = ktName ? `Eigener Satz: ${ktName}` : "LeitWerk-Transportcodes (eingebaut)";
    const kap = (x: { gruppe: number; gruppenname: string }) => (x.gruppe ? `${x.gruppe} - ${x.gruppenname}` : x.gruppenname);
    return [
      b.I("Notruf (RD)", rdName, `${zahl(rd.length)} Codes in ${kapitel} Kapiteln${store.schema ? ", mit Abfrage" : ""}`, rd.length ? OK : GELB),
      b.I("Krankentransport & Überstellung (KT/SEK)", ktLabel, `${zahl(kt.length)} Codes, mit KT-Abfrage`, kt.length ? OK : GELB),
      b.B("Eigene Codes & Abfrage", [{ l: "Im Realismus-Menü", go: ["real", "realismus"] }], "Eigene Sätze hochladen und umschalten – jeder Spieler selbst"),
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

  // ---------------- Realismus: Codesätze
  const TITEL: Record<Bereich, string> = { rd: "Notruf (RD)", kt: "Krankentransport & Überstellung (KT/SEK)" };
  const basisName = (datei: string) => datei.replace(/\.(json|csv|txt)$/i, "");

  /** Schema übernehmen (wie schemaUebernehmen in importDialog.ts, aber ohne Meldungen) */
  function schemaLaden(schema: Schema, dateiname: string): number {
    const vorhanden = new Map(store.list("codes").map((x) => [x.code.toUpperCase(), x.id]));
    const liste: Einsatzcode[] = Object.entries(schema.codes).map(([code, x]) => ({
      id: vorhanden.get(code.toUpperCase()) ?? code,
      code,
      name: x.name,
      kategorie: x.kategorie,
      kapitel: x.kapitel,
      hinweis: "",
      herkunft: "import",
      herkunftDetail: dateiname,
    }));
    store.setSchema(schema);
    store.upsert("codes", liste);
    const neu2 = (schema.einsatzstufen ?? []).filter((x) => x?.stufe && !store.settings.stufen.some((st) => st.stufe === x.stufe));
    if (neu2.length) {
      const set = structuredClone(store.settings);
      for (const x of neu2)
        set.stufen.push({
          stufe: x.stufe,
          rettungsmittel: x.rettungsmittel ?? "",
          nfsErforderlich: !!x.nfs_erforderlich,
          notarzt: x.notarzt === "nef" || x.notarzt === "schnellster" ? x.notarzt : "nein",
          sondersignal: !!x.sondersignal,
          kategorie: x.kategorie === "kritisch" || x.kategorie === "dringend" || x.kategorie === "stabil" ? x.kategorie : x.notarzt === "nef" || x.notarzt === "schnellster" ? "kritisch" : x.sondersignal ? "dringend" : "stabil",
          transportProzent: Math.max(0, Math.min(100, Number(x.transport_prozent ?? 70))),
        });
      store.setSettings(set);
    }
    return neu2.length;
  }

  /** Satz aktivieren (wie satzAktivieren in codesaetze.ts, aber mit Rückgabe-Text statt Meldung) */
  async function satzVerwenden(s: CodeSatz): Promise<string> {
    if (s.entwurf) throw new Error(`„${s.name}“ ist ein Entwurf – erst im KT-Code-Editor fertigstellen`);
    const o = ORDNER[s.bereich];
    if (s.bereich === "kt") {
      const kc = s.codes ? ktCodesLesen(await ablageLesen(o.codes, s.codes), s.codes) : undefined;
      const ab = s.schema ? ktAbfrageLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : undefined;
      const r = pruefeKtSatz({ codes: kc ?? eingebauteKtCodes(), abfrage: ab }, standardKtAbfrage());
      if (r.fehler.length) throw new Error(`„${s.name}“ ist noch nicht vollständig (${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"}: ${r.fehler[0]}) – bitte im KT-Code-Editor bearbeiten`);
      store.setKtSatz({ name: s.name, ...(kc ? { codes: kc } : {}), ...(ab ? { abfrage: ab } : {}) });
      return `KT/SEK-Satz „${s.name}“ aktiv${kc ? "" : " (nur Abfrage – Codes eingebaut)"}${ab ? "" : " (nur Codes – Abfrage eingebaut)"}`;
    }
    const schema = s.schema ? rdSchemaLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : null;
    let liste: ReturnType<typeof codesLesen> | null = null;
    if (s.codes) {
      liste = codesLesen(await ablageLesen(o.codes, s.codes), s.codes);
      if ("fehler" in liste) throw new Error(liste.fehler);
    }
    eingebautAktivieren("rd");
    let stufenNeu = 0;
    if (schema) stufenNeu = schemaLaden(schema, s.schema!);
    if (liste && "codes" in liste && liste.codes) store.upsert("codes", liste.codes);
    aktivMerken(s.name);
    return `RD-Satz „${s.name}“ aktiv${schema ? "" : " (nur Codeliste – Abfrage eingebaut)"}${stufenNeu ? ` · ${stufenNeu} neue Einsatzstufen` : ""}`;
  }

  function satzZeilen(b: Bausteine, bereich: Bereich): Zeile[] {
    const out: Zeile[] = [];
    const aktivName = bereich === "rd" ? aktiverSatz() : aktiverKtSatz();
    out.push(
      b.IT(
        bereich === "rd" ? "LeitWerk-Codesystem (eingebaut)" : "LeitWerk-Transportcodes (eingebaut)",
        bereich === "rd" ? "Codes im gewohnten Aufbau (RD-…), mit Abfrage – immer verfügbar" : "Codes für KT und Überstellungen (KT…, SEK-…), mit KT-Abfrage – immer verfügbar",
        aktivName === null ? "aktiv" : "",
        aktivName === null ? OK : "",
        { btns: aktivName === null ? [] : [knopf("Verwenden", () => (eingebautAktivieren(bereich), `Eingebaut aktiv: ${TITEL[bereich]}`))] },
      ),
    );
    const liste = c.saetze?.[bereich];
    if (!liste) {
      out.push(b.IT("Eigene Sätze", "Dokumente/LeitWerk", PRUEFT, GRAU));
      return out;
    }
    const o = ORDNER[bereich];
    for (const s of liste) {
      const istAktiv = aktivName?.toLowerCase() === s.name.toLowerCase();
      const teile = bereich === "rd" ? [s.codes ? "Codeliste" : "", s.schema ? "Abfrageschema" : ""].filter(Boolean).join(" · ") : [s.codes ? "Codes" : "", s.schema ? "Abfrage" : ""].filter(Boolean).join(" · ");
      const btns: Knopf[] = [];
      if (!istAktiv && !s.entwurf) btns.push(knopf("Verwenden", () => satzVerwenden(s), {}, saetzeLaden));
      if (bereich === "kt")
        btns.push(
          knopf("Bearbeiten", async () => {
            const kc = s.codes ? ktCodesLesen(await ablageLesen(o.codes, s.codes), s.codes) : undefined;
            const ab = s.schema ? ktAbfrageLesen(await ablageLesen(o.abfrage, s.schema), s.schema) : undefined;
            ktEditorOeffnen({ satz: { codes: kc ?? eingebauteKtCodes(), abfrage: ab }, name: s.name, fertig: () => void saetzeLaden() });
            return "Im Editor geöffnet";
          }),
        );
      btns.push(
        knopf(
          "Löschen",
          async () => {
            if (s.schema) await ablageLoeschen(o.abfrage, s.schema).catch(() => undefined);
            if (s.codes) await ablageLoeschen(o.codes, s.codes).catch(() => undefined);
            if (istAktiv) eingebautAktivieren(bereich);
            return "Gelöscht";
          },
          { cfm: `„${s.name}“ (${bereich === "rd" ? "Notruf" : "KT/SEK"}) wird aus Dokumente/LeitWerk gelöscht.` },
          saetzeLaden,
        ),
      );
      out.push(b.IT(s.name, `${s.entwurf ? "ENTWURF – noch nicht spielbar · " : ""}${teile} · Dokumente/LeitWerk`, istAktiv ? "aktiv" : s.entwurf ? "Entwurf" : "", istAktiv ? OK : s.entwurf ? GELB : "", { btns }));
    }
    return out;
  }

  const NOCH_NICHT = "Kommt mit dem Realismus-Paket";
  function realismus(b: Bausteine): Zeile[] {
    const spaeter = (l: string) => knopf(l, () => NOCH_NICHT);
    return [
      b.H("Eigene Codes & Abfrage – Notruf (RD)"),
      ...satzZeilen(b, "rd"),
      b.B("Eigenen RD-Satz", [{ l: "Hochladen", sub: "satzRd" }], "Codeliste (CSV) und/oder Abfrageschema (JSON)"),
      b.H("Eigene Codes & Abfrage – Krankentransport & Überstellung (KT/SEK)"),
      ...satzZeilen(b, "kt"),
      b.B("Eigenen KT/SEK-Satz", [{ l: "Codes & Abfrage bearbeiten", sub: "ktEditor" }, { l: "Hochladen", sub: "satzKt" }], "Neuer Satz auf Basis des aktiven, oder Dateien hochladen"),
      b.H("Namen und Bilder"),
      b.B("Namens-Ersetzungen", [spaeter("CSV laden …")], "neutral;eigen – Organisationen, Leitstelle, Dienststellen, Hubschrauber · noch nicht wirksam"),
      b.B("Funkrufnamen", [spaeter("CSV laden …")], "noch nicht wirksam"),
      b.B("Logos & Fahrzeugbilder", [spaeter("Dateien laden …")], "PNG oder SVG · noch nicht wirksam"),
      b.B("Vorlage-Dateien", tauri ? [knopf("Ordner öffnen", () => ablageZeigen())] : [], "Ablage in Dokumente/LeitWerk", tauri ? undefined : { chip: NUR_PROGRAMM, dot: GRAU }),
    ];
  }

  /** Hochladen-Seite (RD bzw. KT/SEK) */
  function satzHoch(b: Bausteine, bereich: Bereich): Zeile[] {
    const g = gewaehlt[bereich];
    const nameKey = bereich === "rd" ? "z_satzRdName" : "z_satzKtName";
    const chip = (x?: { name: string; info: string }) => (x ? { chip: `${x.name} · ${x.info}`, dot: OK } : undefined);
    const codesKnopf = dateiKnopf("Datei wählen …", bereich === "rd" ? ".csv,.txt,text/csv,text/plain" : ".json,application/json", async (f) => {
      const text = await dateiText(f);
      let info: string;
      if (bereich === "rd") {
        const r = codesLesen(text, f.name);
        if ("fehler" in r) throw new Error(r.fehler);
        info = `${zahl(r.codes!.length)} Codes erkannt${r.fehlerZeilen ? `, ${r.fehlerZeilen} Zeilen fehlerhaft` : ""}`;
      } else info = `${zahl(ktCodesLesen(text, f.name).length)} Codes erkannt`;
      g.codes = { name: f.name, text, info };
      return `${f.name} · ${info}`;
    });
    const schemaKnopf = dateiKnopf("Datei wählen …", ".json,application/json", async (f) => {
      const text = await dateiText(f);
      let info: string;
      if (bereich === "rd") {
        const s = rdSchemaLesen(text, f.name);
        const p = pruefeCodesystem(s);
        if (p.fehler.length) throw new Error(`${f.name}: ${p.fehler[0]}${p.fehler.length > 1 ? ` (und ${p.fehler.length - 1} weitere Fehler)` : ""}`);
        info = `gültig · ${zahl(Object.keys(s.codes ?? {}).length)} Codes${p.hinweise.length ? ` · ${p.hinweise.length} Hinweise` : ""}`;
      } else info = `gültig · ${zahl(ktAbfrageLesen(text, f.name).length)} Fragen`;
      g.schema = { name: f.name, text, info };
      return `${f.name} · ${info}`;
    });
    const speichern = knopf(
      "Speichern & verwenden",
      async () => {
        if (!g.codes && !g.schema) throw new Error("Bitte Codes und/oder eine Abfrage wählen");
        const o = ORDNER[bereich];
        const n = ablageName(String(zw[nameKey] ?? "").trim() || basisName((g.schema ?? g.codes)!.name));
        let sText = g.schema?.text;
        let cText = g.codes?.text;
        if (bereich === "rd") {
          if (g.schema) sText = JSON.stringify(rdSchemaLesen(g.schema.text, g.schema.name));
        } else {
          if (g.codes) cText = JSON.stringify({ codes: ktCodesLesen(g.codes.text, g.codes.name) });
          if (g.schema) sText = JSON.stringify({ abfrage: ktAbfrageLesen(g.schema.text, g.schema.name) });
        }
        const vorher = (await satzListe(bereich)).some((x) => x.name.toLowerCase() === n.toLowerCase());
        if (sText) await ablageSpeichern(o.abfrage, `${n}.json`, sText);
        if (cText) await ablageSpeichern(o.codes, `${n}.${bereich === "rd" ? "csv" : "json"}`, cText);
        gewaehlt[bereich] = {};
        delete zw[nameKey];
        const satz = (await satzListe(bereich)).find((x) => x.name.toLowerCase() === n.toLowerCase());
        if (!satz) throw new Error(`„${n}“ wurde gespeichert, aber nicht gefunden`);
        const r = await satzVerwenden(satz);
        return `${vorher ? "Ersetzt" : "Gespeichert"} · ${r}`;
      },
      {},
      saetzeLaden,
    );
    const abbrechen: Knopf = { l: "Abbrechen", back: true, act: () => void (gewaehlt[bereich] = {}) };
    const nameZeile = { ...b.F("Name des Satzes", nameKey, bereich === "rd" ? "z. B. Mein Satz" : "z. B. Mein KT-Satz", "Unter diesem Namen findest du den Satz später wieder – leer: Dateiname"), def: String(zw[nameKey] ?? "") } as Zeile;
    if (bereich === "rd")
      return [
        nameZeile,
        b.B("Codeliste (CSV)", [codesKnopf], "Spalten: Code, Name, Kategorie (z. B. „ALS rot“), Kapitel", chip(g.codes)),
        b.B("Abfrageschema (JSON)", [schemaKnopf], "Fragen und Regeln für die Notrufabfrage – enthält meist auch die Codes", chip(g.schema)),
        b.B("", [speichern, abbrechen], "Ein Satz mit gleichem Namen wird ersetzt"),
      ];
    return [
      nameZeile,
      b.B("KT-/SEK-Codes (JSON)", [codesKnopf], "Codes mit ihren Bedingungen – so, wie der Editor sie speichert", chip(g.codes)),
      b.B("KT-Abfrage (JSON)", [schemaKnopf], "Fragen der KT-Hotline mit Art und dem, was sie klären", chip(g.schema)),
      b.B("", [speichern, abbrechen], "Ein Satz mit gleichem Namen wird ersetzt"),
    ];
  }

  function ktEditor(b: Bausteine): Zeile[] {
    const n = aktiverKtSatz();
    return [
      b.I("Aktiver KT/SEK-Satz", n ?? "LeitWerk-Transportcodes (eingebaut)", `${zahl(ktCodes().length)} Codes`, OK),
      b.B("Editor", [knopf("KT-Code-Editor öffnen", () => (ktEditorOeffnen({ fertig: () => void saetzeLaden() }), "Im Editor geöffnet"))], "Codes mit Bedingungen und die Fragen der KT-Hotline – als neuer Satz auf Basis des aktiven"),
    ];
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
      out.push(tauri ? b.B(o.replace(/_/g, " "), [knopf("Ordner öffnen", () => ablageZeigen(o))], h) : b.B(o.replace(/_/g, " "), [], h, { chip: NUR_PROGRAMM, dot: GRAU }));
    return out;
  }

  // ================================================================== Verteilung

  const SEITEN: Record<string, (b: Bausteine) => Zeile[]> = {
    fgfarben,
    statusfarben,
    toene,
    tondateien,
    anrufe,
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
    realismus,
    satzRd: (b) => satzHoch(b, "rd"),
    satzKt: (b) => satzHoch(b, "kt"),
    ktEditor,
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
      void saetzeLaden();
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
