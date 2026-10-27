#!/usr/bin/env node
/**
 * LeitWerk-Falltest: spielt Notrufe, Krankentransporte, Überstellungen und Funk automatisch durch –
 * mit genau dem Programmcode von LeitWerk (läuft in einem unsichtbaren Browser) und deiner lokalen KI (Ollama).
 *
 *   npm run falltest                      Fragen beantworten, dann läuft alles
 *   npm run falltest -- --alles           alles mit den Standardwerten, ohne Fragen
 *   npm run falltest -- --hilfe           alle Möglichkeiten
 *
 * Ergebnis: Ordner falltest-ergebnisse/<Datum>_<Version>/ mit bericht.html, fuer-claude.zip und lauf.json.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { adressDateien, Adressen } from "./adressen.mjs";
import { appDatenInfo, appDatenLesen } from "./appDaten.mjs";
import { auswerten, berichtHtml, lageMd, vergleichen, vergleichMd } from "./bericht.mjs";
import { kiEinstellungenAusApp, Ollama, TestKi } from "./ollama.mjs";
import { zipErstellen } from "./zip.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HIER, "..", "..");
const ERGEBNISSE = join(REPO, "falltest-ergebnisse");

const HILFE = `
LeitWerk-Falltest – spielt Gespräche mit dem echten LeitWerk-Code und deiner KI durch.

Was getestet wird
  --was notruf,kt,sek,funk   Bereiche (Standard: alle)
  --alles                    alles mit Standardwerten, ohne Fragen
  --fall ID,ID …             nur diese Fälle (ID oder Teil des Namens/Themas)
  --ausgang A                nur dieser Ausgang (Standard: alle, die von selbst vorkommen)
  --mal N                    jeden Fall/Ausgang N-mal (Standard 1)
  --kt N / --sek N           Anzahl Krankentransporte / Überstellungen (Standard 10)
  --fallpaket DATEI          zusätzliche Fälle aus einem Fallpaket (.json) mittesten

Wiederholen und vergleichen
  --wie LAUF                 genau dieselben Gespräche (gleiche Startzahlen) wie ein früherer Lauf
  --nur-auffaellige LAUF     nur die Gespräche, die in einem früheren Lauf auffällig waren
  --vergleich LAUF           mit diesem Lauf vergleichen (Standard: der letzte; „keiner“ = aus)
                             LAUF = Ordnername in falltest-ergebnisse, Pfad oder „letzter“
  --seed N                   Startzahl (Standard 1 = vergleichbar; „neu“ = zufällig)
  --uhrzeit HH:MM            feste Spielzeit (Standard: aus der Startzahl, Wochentag und Uhrzeit wechseln)

KI und Rechner
  --modell NAME              Ollama-Modell (Standard: das Modell aus deiner LeitWerk-App)
  --parallel N               so viele Gespräche gleichzeitig (Standard 2; Ollama braucht OLLAMA_NUM_PARALLEL ≥ N)
  --test-ki                  ohne Ollama, mit Test-Antworten (prüft nur das Testprogramm)
  --ohne-app-daten           nicht deine App-Daten (Schema, Fälle, Einstellungen), sondern die eingebauten
  --funkgruppe NÖ-0x         andere Funkgruppe
  --nicht-oeffnen            Bericht am Ende nicht automatisch öffnen
`;

// ------------------------------------------------------------------ Argumente

function argumente(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      o._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split("=", 2);
    const flag = ["alles", "test-ki", "ohne-app-daten", "nicht-oeffnen", "hilfe", "help"].includes(k);
    o[k] = flag ? true : (v ?? argv[++i]);
  }
  return o;
}

async function fragen(o) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const frag = async (t, std) => ((await rl.question(`${t} [${std}]: `)).trim() || std);
  console.log("\nLeitWerk-Falltest – Enter übernimmt den Vorschlag in [Klammern].\n");
  const was = await frag("Was testen? (notruf, kt, sek, funk – mit Komma)", "notruf,kt,sek,funk");
  o.was = was;
  if (/notruf|funk/.test(was)) o.mal = await frag("Wie oft je Fall und Ausgang?", "1");
  if (/kt/.test(was)) o.kt = await frag("Wie viele Krankentransporte?", "10");
  if (/sek/.test(was)) o.sek = await frag("Wie viele Überstellungen?", "10");
  const fall = await frag("Nur bestimmte Fälle? (leer = alle)", "alle");
  if (fall !== "alle") o.fall = fall;
  o.parallel = await frag("Wie viele Gespräche gleichzeitig?", "2");
  rl.close();
  return o;
}

// ------------------------------------------------------------------ Hilfen

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** kleiner, schneller Zufall mit Startzahl (gleich wie im Browser) */
function hash(...teile) {
  let h = 2166136261;
  for (const t of teile.join("|")) h = Math.imul(h ^ t.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}
function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Spielzeit aus der Startzahl: Wochentag gleich verteilt, Uhrzeit eher tagsüber (wie das Einsatzaufkommen) */
function spielzeit(seed, fest) {
  const r = zufall(seed ^ 0x9e3779b9);
  const montag = Date.parse("2026-10-12T00:00:00+02:00");
  const tag = Math.floor(r() * 7);
  let std, min;
  if (fest) [std, min] = fest.split(":").map(Number);
  else {
    const gewicht = [2, 1.5, 1, 1, 1, 1.5, 3, 5, 7, 8, 8, 8, 7, 7, 7, 7, 7, 6, 6, 5, 4, 4, 3, 2.5];
    let x = r() * gewicht.reduce((a, b) => a + b, 0);
    std = gewicht.findIndex((g) => (x -= g) < 0);
    min = Math.floor(r() * 60);
  }
  return montag + tag * 86_400_000 + std * 3_600_000 + (min ?? 0) * 60_000;
}

/** Lauf-Ordner finden; „letzter“ = der jüngste (beim Vergleich: mit demselben KI-Modell) */
function laufFinden(name, modell) {
  if (!name || name === "keiner") return null;
  if (name === "letzter") {
    if (!existsSync(ERGEBNISSE)) return null;
    const ordner = readdirSync(ERGEBNISSE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ERGEBNISSE, d.name, "lauf.json")))
      .map((d) => d.name)
      .filter((n) => {
        if (!modell) return true;
        try {
          return laufLesen(join(ERGEBNISSE, n)).ki.modell === modell;
        } catch {
          return false;
        }
      })
      .sort();
    return ordner.length ? join(ERGEBNISSE, ordner[ordner.length - 1]) : null;
  }
  for (const p of [name, join(ERGEBNISSE, name)]) if (existsSync(join(p, "lauf.json"))) return resolve(p);
  throw new Error(`Lauf „${name}“ nicht gefunden (erwartet: Ordner mit lauf.json)`);
}
const laufLesen = (ordner) => JSON.parse(readFileSync(join(ordner, "lauf.json"), "utf8"));

function git(...a) {
  try {
    return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const dauerText = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? `${Math.round(ms / 1000)} s` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

// ------------------------------------------------------------------ Browser

async function browserStarten() {
  let pw;
  try {
    pw = await import("playwright");
  } catch {
    throw new Error("Das Paket „playwright“ fehlt – bitte einmal „npm install“ im LeitWerk-Ordner ausführen.");
  }
  const versuche = [{}, { channel: "chrome" }];
  for (const v of versuche) {
    try {
      return await pw.chromium.launch({ headless: true, ...v });
    } catch (err) {
      if (!/Executable doesn't exist|executable|install/i.test(String(err.message))) throw err;
    }
  }
  console.log("Unsichtbarer Browser fehlt – wird einmalig heruntergeladen (ca. 100 MB) …");
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "install", "chromium"], { cwd: REPO, stdio: "inherit" });
  if (r.status !== 0) throw new Error("Browser konnte nicht installiert werden (npx playwright install chromium).");
  return pw.chromium.launch({ headless: true });
}

async function serverStarten() {
  const { createServer } = await import("vite");
  const server = await createServer({ root: REPO, configFile: join(REPO, "vite.config.ts"), logLevel: "error", clearScreen: false, server: { port: 5390, strictPort: false, host: "127.0.0.1", open: false } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5390/";
  return { server, url };
}

/** Läuft vor dem LeitWerk-Code in jeder Seite: Zufall mit Startzahl und deine App-Daten */
function vorSeite({ speicher }) {
  let s = 1;
  // Karte & Co. (fremde Pakete) bekommen eigenen Zufall – sonst verschiebt die Karte im Hintergrund den Zufall der Fälle
  let u = 7;
  const fremd = () => {
    u = (Math.imul(u, 1103515245) + 12345) >>> 0;
    return u / 4294967296;
  };
  Math.random = () => {
    const aufrufer = (new Error().stack ?? "").split("\n")[2] ?? "";
    if (!/\/src\//.test(aufrufer) || /node_modules/.test(aufrufer)) return fremd();
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__falltestSeed = (n) => {
    s = n >>> 0;
  };
  try {
    localStorage.clear();
    for (const [k, v] of Object.entries(speicher)) localStorage.setItem(k, v);
  } catch {
    /* egal */
  }
}

/** echte Adressen (wie die App) für eine Seite bereitstellen */
async function adressenAnbieten(page, adressen) {
  if (!adressen) return;
  await page.exposeFunction("__falltestAdresse", (art, a) => (art === "zufall" ? adressen.zufall(a[0], a[1], a[2]) : adressen.suche(a[0], a[1])));
}

async function seiteBereit(page, url, setup) {
  await page.goto(`${url}?debug&falltest`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForFunction(() => {
    const lw = window.__lw;
    return !!(lw && lw.sim && lw.store && lw.store.schema && Object.keys(lw.sim.state.fahrzeuge).length > 0);
  }, null, { timeout: 120_000, polling: 200 });
  await page.evaluate(
    ({ modell, funkgruppe, fallpaket }) => {
      const lw = window.__lw;
      lw.kiPrefsSetzen({ aktiv: true, modell });
      lw.kiTest.chat = (m, _onToken, max) => window.__falltestKi(JSON.stringify(m), false, max ?? null);
      lw.kiTest.json = (m) => window.__falltestKi(JSON.stringify(m), true, null);
      if (window.__falltestAdresse) lw.geoTest.adressen = { zufall: (b, c, s) => window.__falltestAdresse("zufall", [b, c, s]), suche: (q, l) => window.__falltestAdresse("suche", [q, l]) };
      if (funkgruppe) lw.store.setSettings({ ...lw.store.settings, funkgruppe });
      if (fallpaket) {
        const r = lw.faelle.fallpaketImport(fallpaket, false);
        if (r.fehler.length) console.warn("Fallpaket:", r.fehler.join("; "));
      }
    },
    setup,
  );
}

// ------------------------------------------------------------------ Hauptablauf

async function main() {
  let o = argumente(process.argv.slice(2));
  if (o.hilfe || o.help) {
    console.log(HILFE);
    return;
  }
  const ohneFragen = o.alles || Object.keys(o).some((k) => k !== "_" && !["test-ki", "nicht-oeffnen", "ohne-app-daten", "modell", "parallel"].includes(k));
  if (!ohneFragen && process.stdin.isTTY) o = await fragen(o);

  const was = new Set(String(o.was ?? "notruf,kt,sek,funk").split(/[\s,]+/).filter(Boolean));
  const mal = Math.max(1, Number(o.mal ?? 1) || 1);
  const anzahlKt = was.has("kt") ? Math.max(0, Number(o.kt ?? 10) || 0) : 0;
  const anzahlSek = was.has("sek") ? Math.max(0, Number(o.sek ?? 10) || 0) : 0;
  const parallel = Math.max(1, Math.min(8, Number(o.parallel ?? 2) || 2));
  const seedBasis = o.seed === "neu" ? Math.floor(Math.random() * 1e9) : Number(o.seed ?? 1) || 1;
  const wieLauf = o.wie ? laufFinden(o.wie) : o["nur-auffaellige"] ? laufFinden(o["nur-auffaellige"]) : null;
  const version = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version;
  const commit = git("rev-parse", "--short", "HEAD");
  const geaendert = !!git("status", "--porcelain", "--untracked-files=no", "src");

  // App-Daten
  const app = o["ohne-app-daten"] ? { leitstelle: null, speicher: {}, quelle: "eingebaut", hinweise: [] } : appDatenLesen();
  const info = appDatenInfo(app);
  for (const h of app.hinweise) console.log(`Hinweis: ${h}`);
  const speicher = { ...app.speicher };
  if (app.leitstelle) speicher["leitwerk.leitstelle"] = app.leitstelle;
  const fallpaket = o.fallpaket ? readFileSync(resolve(o.fallpaket), "utf8") : null;

  // Adressen wie in der App (aus den installierten Kartenpaketen)
  const adrDateien = o["ohne-app-daten"] ? [] : adressDateien();
  let adressen = null;
  if (adrDateien.length) {
    process.stdout.write("Adressen werden geladen … ");
    adressen = await Adressen.laden(adrDateien);
    console.log(`${adressen.anzahl.toLocaleString("de-AT")} Adressen`);
  } else console.log("Hinweis: Keine Adresspakete gefunden – es gibt nur Test-Adressen („Testgasse“). Kartenpakete in LeitWerk installieren für echte Adressen.");

  // KI
  const einst = kiEinstellungenAusApp(join(REPO, "src-tauri", "src", "ki.rs"));
  let ki;
  if (o["test-ki"]) ki = new TestKi();
  else {
    const basis = Ollama.basisUrl();
    const vorhanden = await new Ollama(basis, "", einst).modelle();
    if (!vorhanden) throw new Error(`Ollama ist nicht erreichbar (${basis}). Bitte Ollama bzw. LeitWerk starten, damit die KI läuft.`);
    const wunsch = o.modell ?? info.modell ?? "qwen3:8b";
    const modell = vorhanden.find((m) => m === wunsch) ?? vorhanden.find((m) => m.startsWith(wunsch)) ?? (o.modell ? null : vorhanden.find((m) => m.startsWith("qwen3")));
    if (!modell) throw new Error(`Modell „${wunsch}“ ist in Ollama nicht vorhanden. Vorhanden: ${vorhanden.join(", ") || "keine"}`);
    ki = new Ollama(basis, modell, einst);
    process.stdout.write(`KI: ${modell} wird geladen … `);
    await ki.vorwaermen();
    console.log("bereit");
  }

  const vergleichLauf = laufFinden(o.vergleich ?? "letzter", o.vergleich ? null : ki.modell);

  // LeitWerk im unsichtbaren Browser
  process.stdout.write("LeitWerk wird gestartet … ");
  const { server, url } = await serverStarten();
  const browser = await browserStarten();
  const kontextOpt = { timezoneId: "Europe/Vienna", locale: "de-AT", viewport: { width: 1400, height: 900 } };
  const setup = { modell: ki.modell, funkgruppe: o.funkgruppe ?? null, fallpaket };

  // Aufträge planen (Fälle aus LeitWerk selbst, mit deinen eigenen und geänderten Fällen)
  // Kartenbilder braucht der Test nicht – das spart viel Speicher und Rechenzeit
  const kontextNeu = async () => {
    const k = await browser.newContext(kontextOpt);
    await k.addInitScript(vorSeite, { speicher });
    await k.route(/\.pmtiles(\?|$)|\/sprites\/|\/fonts\/|\/maps\//, (r) => r.abort());
    return k;
  };
  const planKtx = await kontextNeu();
  const planSeite = await planKtx.newPage();
  await planSeite.exposeFunction("__falltestKi", async () => "");
  await adressenAnbieten(planSeite, adressen);
  await seiteBereit(planSeite, url, setup);
  const faelle = await planSeite.evaluate(() =>
    window.__lw.faelle.alleFaelle(false).map((f) => ({ id: f.id, name: f.name ?? f.id, thema: f.thema, varianten: f.varianten.map((v) => ({ id: v.id, p: v.p })) })),
  );
  const programmVersion = await planSeite.evaluate(() => document.getElementById("app-version")?.textContent?.trim() ?? "");
  const schemaName = await planSeite.evaluate(() => window.__lw.store.schemaIstStandard ? "LeitWerk-Codesystem (eingebaut)" : window.__lw.store.schemaRoh?.name || "eigenes Abfrageschema");
  const funkModus = await planSeite.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("leitwerk.ki") ?? "{}");
    } catch {
      return {};
    }
  });
  console.log("bereit");

  let auftraege = [];
  if (wieLauf) {
    const alt = laufLesen(wieLauf);
    auftraege = alt.auftraege
      .filter((a) => !o["nur-auffaellige"] || a.fehler || (a.durchlauf?.auffaellig?.length ?? 0) > 0)
      .map((a) => ({ key: a.key, art: a.art, fallId: a.fallId, variante: a.variante, wdh: a.wdh, seed: a.seed, zeit: a.zeit }));
    console.log(`${o["nur-auffaellige"] ? "Nur die auffälligen Gespräche" : "Dieselben Gespräche"} wie in ${wieLauf.split(/[\\/]/).pop()}: ${auftraege.length}`);
  } else {
    const filter = o.fall ? String(o.fall).toLowerCase().split(/\s*,\s*/).filter(Boolean) : null;
    const gewaehlt = faelle.filter((f) => !filter || filter.some((x) => f.id.toLowerCase() === x || f.id.toLowerCase().includes(x) || f.name.toLowerCase().includes(x) || (f.thema ?? "").toLowerCase().includes(x)));
    if (filter && !gewaehlt.length) throw new Error(`Kein Fall passt zu „${o.fall}“`);
    const neu = (art, fallId, variante, wdh) => {
      const key = `${art}:${fallId}:${variante}#${wdh}`;
      const seed = hash(seedBasis, key);
      return { key, art, fallId, variante, wdh, seed, zeit: spielzeit(seed, o.uhrzeit) };
    };
    for (const art of ["notruf", "funk"]) {
      if (!was.has(art)) continue;
      for (const f of gewaehlt) {
        const vs = o.ausgang ? f.varianten.filter((v) => v.id === o.ausgang) : f.varianten.filter((v) => v.p > 0);
        for (const v of vs) for (let i = 1; i <= mal; i++) auftraege.push(neu(art, f.id, v.id, i));
      }
    }
    for (let i = 1; i <= anzahlKt; i++) auftraege.push(neu("kt", "kt", "–", i));
    for (let i = 1; i <= anzahlSek; i++) auftraege.push(neu("sek", "sek", "–", i));
  }
  if (!auftraege.length) throw new Error("Nichts zu testen – bitte Auswahl prüfen.");
  auftraege.forEach((a, i) => (a.nr = i + 1));
  if (was.has("funk") && funkModus.funk === "fest") console.log("Hinweis: In deiner App steht „Funk: fest wie bisher“ – der Funktest nutzt trotzdem die KI-Formulierung.");

  const stempel = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Vienna" }).slice(0, 16).replace(/[ :]/g, "-");
  const ziel = join(ERGEBNISSE, `${stempel}_v${version}${o["test-ki"] ? "_test-ki" : ""}`);
  mkdirSync(join(ziel, "gespraeche"), { recursive: true });

  console.log(
    `\n${auftraege.length} Gespräche · ${parallel} gleichzeitig · Startzahl ${seedBasis} · KI ${ki.modell}\nSchema: ${schemaName} · Funkgruppe: ${o.funkgruppe ?? info.funkgruppe ?? "Standard"}${info.eigeneFaelle ? ` · ${info.eigeneFaelle} eigene Fälle` : ""}\nAbbrechen mit Strg+C (der Bericht wird trotzdem geschrieben).\n`,
  );

  // ------------------------------------------------------------ Durchlauf
  let abbrechen = false;
  process.on("SIGINT", () => {
    if (abbrechen) process.exit(130);
    abbrechen = true;
    console.log("\nWird abgebrochen – laufende Gespräche werden noch fertig gespielt (nochmal Strg+C = sofort).");
  });
  const warteschlange = [...auftraege];
  const t0 = Date.now();
  let fertig = 0;
  let auffaellig = 0;
  let laufend = 0;
  const zeile = (letzt) => {
    const rest = fertig ? ((Date.now() - t0) / fertig) * (auftraege.length - fertig) : 0;
    const t = `[${fertig}/${auftraege.length}] ${Math.round((fertig / auftraege.length) * 100)} % · ${laufend} läuft${fertig ? ` · noch ~${dauerText(rest)}` : ""} · ${auffaellig} auffällig${letzt ? ` · zuletzt: ${letzt}` : ""}`;
    if (process.stdout.isTTY) process.stdout.write(`\r\x1b[K${t.slice(0, (process.stdout.columns || 120) - 1)}`);
    else console.log(t);
  };

  async function arbeiter(nr) {
    const aktuell = { a: null, n: 0 };
    let ktx = null;
    let page = null;
    // neue Seite (auch nach einem Absturz des Browser-Tabs)
    const neueSeite = async () => {
      if (ktx) await ktx.close().catch(() => {});
      ktx = await kontextNeu();
      page = await ktx.newPage();
      await adressenAnbieten(page, adressen);
      page.on("pageerror", (e) => aktuell.a && (aktuell.a.seitenfehler ??= []).push(String(e.message ?? e).slice(0, 300)));
      await page.exposeFunction("__falltestKi", async (mJson, json, max) => {
        const a = aktuell.a;
        const seed = a ? hash(a.seed, aktuell.n++) : undefined;
        try {
          const r = await ki.chat(JSON.parse(mJson), { json, maxTokens: max ?? undefined, seed });
          if (a) {
            a.ki.aufrufe++;
            a.ki.rechenMs.push(Math.round(r.rechenMs));
            a.ki.wandMs.push(Math.round(r.wandMs));
          }
          return r.text;
        } catch (err) {
          if (a) a.ki.fehler.push(String(err.message ?? err).slice(0, 200));
          throw err;
        }
      });
    };
    await neueSeite();
    while (warteschlange.length && !abbrechen) {
      const a = warteschlange.shift();
      laufend++;
      a.arbeiter = nr;
      a.ki = { aufrufe: 0, rechenMs: [], wandMs: [], fehler: [] };
      a.start = Date.now();
      aktuell.a = a;
      for (let versuch = 1; versuch <= 2 && !a.durchlauf; versuch++) {
        aktuell.n = 0;
        a.ki = { aufrufe: 0, rechenMs: [], wandMs: [], fehler: [] };
        try {
          if (page.isClosed()) await neueSeite();
          await seiteBereit(page, url, setup);
          const art = a.art === "notruf" ? undefined : a.art;
          a.durchlauf = await Promise.race([
            page.evaluate(
              async ({ auftrag, seed, zeit }) => {
                const lw = window.__lw;
                window.__falltestSeed(seed);
                lw.sim.neuesSpiel(zeit);
                window.__falltestSeed(seed);
                const l = await lw.testlauf.testlaufAusfuehren([auftrag], { abbruch: { ja: false } });
                return l[0] ?? null;
              },
              { auftrag: { fallId: a.fallId, variante: a.variante, ...(art ? { art } : {}) }, seed: a.seed, zeit: a.zeit },
            ),
            warte(20 * 60_000).then(() => {
              throw new Error("Zeitüberschreitung (20 min)");
            }),
          ]);
          if (!a.durchlauf) a.fehler = "Gespräch konnte nicht erzeugt werden (Fall/Transport ergab keinen Anruf)";
          else delete a.fehler;
        } catch (err) {
          a.fehler = String(err.message ?? err).split("\n")[0].slice(0, 300);
          if (/crash|closed|Target|destroyed/i.test(a.fehler)) {
            a.abstuerze = (a.abstuerze ?? 0) + 1;
            await neueSeite().catch(() => {});
          }
        }
      }
      a.ende = Date.now();
      aktuell.a = null;
      if (a.durchlauf) {
        // Nummer im ganzen Lauf statt „1“
        const d = a.durchlauf;
        d.nr = a.nr;
        d.datei = d.datei.replace(/^\d+_/, `${String(a.nr).padStart(3, "0")}_`);
        d.text = d.text.replace(/^# Testlauf \d+:/, `# Testlauf ${a.nr}:`);
        // mehrere Gespräche gleichzeitig: Wartezeit an der KI ist keine langsame Antwort
        if (parallel > 1) d.auffaellig = d.auffaellig.filter((x) => !/^langsam \(/.test(x.grund));
        auffaellig += d.auffaellig.length;
        writeFileSync(join(ziel, "gespraeche", d.datei), d.text);
      }
      laufend--;
      fertig++;
      // Speicher frisch halten: alle 25 Gespräche neuer Tab
      if (fertig % 25 === nr % 25) await neueSeite().catch(() => {});
      zeile(a.durchlauf ? `${a.durchlauf.fallName} ${a.durchlauf.variante} (${a.durchlauf.auffaellig.length})` : `${a.key}: ${a.fehler}`);
    }
    await ktx?.close().catch(() => {});
  }

  await Promise.all(Array.from({ length: Math.min(parallel, auftraege.length) }, (_, i) => arbeiter(i + 1)));
  if (process.stdout.isTTY) process.stdout.write("\n");

  // ------------------------------------------------------------ Bericht
  const gelaufen = auftraege.filter((a) => a.ende);
  const lauf = {
    format: "leitwerk-falltest",
    version: 1,
    erstellt: new Date().toISOString(),
    ordner: ziel.split(/[\\/]/).pop(),
    leitwerk: { version, programmVersion, commit, geaendert },
    ki: { modell: ki.modell, einstellungen: einst, aufrufe: ki.aufrufe, fehler: ki.fehler, maxGleichzeitig: ki.maxGleichzeitig, test: !!o["test-ki"] },
    einstellungen: { was: [...was], mal, kt: anzahlKt, sek: anzahlSek, parallel, seed: seedBasis, uhrzeit: o.uhrzeit ?? null, fall: o.fall ?? null, ausgang: o.ausgang ?? null, wie: wieLauf ? wieLauf.split(/[\\/]/).pop() : null, nurAuffaellige: !!o["nur-auffaellige"] },
    daten: { quelle: app.quelle, adressen: adressen ? `${adressen.anzahl} aus ${adrDateien.map((d) => d.split(/[\\/]/).pop()).join(", ")}` : "Test-Adressen",  schema: schemaName, ...info, funkgruppe: o.funkgruppe ?? info.funkgruppe ?? null, fallpaket: o.fallpaket ?? null, ablauf: funkModus.ablauf ?? "neu" },
    dauerMs: Date.now() - t0,
    abgebrochen: abbrechen || gelaufen.length < auftraege.length,
    auftraege: gelaufen,
  };
  writeFileSync(join(ziel, "lauf.json"), JSON.stringify(lauf));
  const stats = auswerten(lauf);
  const alt = vergleichLauf && resolve(vergleichLauf) !== resolve(ziel) ? laufLesen(vergleichLauf) : null;
  const vgl = alt ? vergleichen(lauf, alt, stats, auswerten(alt)) : null;
  writeFileSync(join(ziel, "bericht.html"), berichtHtml(lauf, stats, vgl));

  // Export für Claude: dasselbe Format wie der Testlauf in der App, dazu Lage und Vergleich
  const durchlaeufe = gelaufen.filter((a) => a.durchlauf).map((a) => a.durchlauf);
  const dateien = await planSeite.evaluate(({ l, ab }) => window.__lw.testlauf.testlaufDateien(l, ab), { l: durchlaeufe, ab: lauf.abgebrochen });
  dateien.splice(1, 0, ["00_Lauf.md", lageMd(lauf, stats)]);
  if (vgl) dateien.splice(2, 0, ["00_Vergleich.md", vergleichMd(vgl)]);
  writeFileSync(join(ziel, "fuer-claude.zip"), zipErstellen(dateien));

  await browser.close();
  await server.close();

  console.log(`\nFertig in ${dauerText(lauf.dauerMs)}: ${durchlaeufe.length} Gespräche, ${stats.gesamt.auffaellig} auffällige Antworten (${stats.gesamt.quote.toFixed(1)} je 100 Antworten).`);
  if (vgl) console.log(`Vergleich mit ${vgl.altName}: ${vgl.gesamtText}`);
  const fehlerhaft = gelaufen.filter((a) => a.fehler);
  if (fehlerhaft.length) console.log(`${fehlerhaft.length} Gespräche ließen sich nicht spielen (Details im Bericht).`);
  if (stats.kiHinweis) console.log(`Hinweis: ${stats.kiHinweis}`);
  console.log(`\nBericht:  ${join(ziel, "bericht.html")}\nFür Claude: ${join(ziel, "fuer-claude.zip")}`);
  if (!o["nicht-oeffnen"] && process.platform === "darwin") spawnSync("open", [join(ziel, "bericht.html")]);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\nFehler: ${err.message ?? err}`);
  process.exit(1);
});
