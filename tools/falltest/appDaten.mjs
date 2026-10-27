/**
 * Daten der installierten LeitWerk-App lesen, damit der Test genau mit deinem Stand läuft:
 *  - leitstelle.json (Einstellungen, Funkgruppe, aktives Abfrageschema und Codeliste, KT/SEK-Satz, eigene Daten)
 *  - aus dem Browser-Speicher der App: eigene und geänderte Fälle, KI-Modell, Name des aktiven Codesatzes
 * Gelesen wird nur eine Kopie – an der App wird nichts verändert.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const KENNUNG = "at.pholzreiter.leitwerk";
/** Diese Schlüssel aus dem Browser-Speicher der App übernehmen */
export const SPEICHER_SCHLUESSEL = ["leitwerk.faelle", "leitwerk.ki", "lw.codesatz"];

function appDatenOrdner() {
  const h = homedir();
  if (process.platform === "darwin") return join(h, "Library", "Application Support", KENNUNG);
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(h, "AppData", "Roaming"), KENNUNG);
  return join(process.env.XDG_DATA_HOME ?? join(h, ".local", "share"), KENNUNG);
}

function dateienSuchen(ordner, passt, tiefe = 6, out = []) {
  if (tiefe < 0 || !existsSync(ordner)) return out;
  let eintraege = [];
  try {
    eintraege = readdirSync(ordner, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of eintraege) {
    const p = join(ordner, e.name);
    if (e.isDirectory()) dateienSuchen(p, passt, tiefe - 1, out);
    else if (passt(e.name)) out.push(p);
  }
  return out;
}

/** UTF-16LE (so speichert WebKit) aus Hex */
function utf16(hex) {
  const b = Buffer.from(hex, "hex");
  return b.toString("utf16le");
}

/** Eine WebKit-Speicherdatei (SQLite) lesen – über eine Kopie, damit die laufende App nicht gestört wird */
export function speicherAusDatei(d) {
  const tmp = mkdtempSync(join(tmpdir(), "lw-falltest-"));
  try {
    const kopie = join(tmp, "ls.sqlite3");
    copyFileSync(d, kopie);
    for (const zusatz of ["-wal", "-shm"]) if (existsSync(d + zusatz)) copyFileSync(d + zusatz, kopie + zusatz);
    let roh = "";
    try {
      roh = execFileSync("sqlite3", ["-readonly", kopie, `select key || char(9) || hex(value) from ItemTable where key in (${SPEICHER_SCHLUESSEL.map((k) => `'${k}'`).join(",")});`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    } catch {
      return null;
    }
    const out = {};
    for (const z of roh.split("\n")) {
      const [k, hex] = z.split("\t");
      if (k && hex) out[k] = utf16(hex.trim());
    }
    return out;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Browser-Speicher (WebKit, macOS) der App: Schlüssel → Text */
function browserSpeicher(hinweise) {
  if (process.platform !== "darwin") return {};
  const basis = join(homedir(), "Library", "WebKit", KENNUNG);
  const dateien = dateienSuchen(basis, (n) => n === "localstorage.sqlite3" || n.endsWith(".localstorage")).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!dateien.length) {
    hinweise.push("Browser-Speicher der App nicht gefunden – eigene Fälle und KI-Modell werden nicht übernommen.");
    return {};
  }
  for (const d of dateien) {
    const out = speicherAusDatei(d);
    if (out && Object.keys(out).length) return out;
  }
  hinweise.push("Im Browser-Speicher der App stehen keine eigenen Fälle oder KI-Einstellungen.");
  return {};
}

/**
 * Alles einsammeln. Ergebnis: { leitstelle: string|null, speicher: {key: text}, quelle: string, hinweise: string[] }
 */
export function appDatenLesen() {
  const hinweise = [];
  const ordner = appDatenOrdner();
  const datei = join(ordner, "leitstelle.json");
  let leitstelle = null;
  if (existsSync(datei)) leitstelle = readFileSync(datei, "utf8");
  else hinweise.push(`Keine App-Daten gefunden (${datei}) – es gelten die eingebauten Daten.`);
  const speicher = browserSpeicher(hinweise);
  return { leitstelle, speicher, quelle: existsSync(datei) ? datei : "eingebaut", hinweise };
}

/** Kurzbeschreibung für den Bericht */
export function appDatenInfo(d) {
  const info = {};
  try {
    const j = d.leitstelle ? JSON.parse(d.leitstelle) : null;
    info.funkgruppe = j?.einstellungen?.funkgruppe ?? null;
    info.schema = j?.abfrageschema ? j.abfrageschema.name || "eigenes Abfrageschema" : "eingebaut";
    info.ktSatz = j?.ktsatz?.name ?? (j?.ktsatz ? "eigener Satz" : "eingebaut");
  } catch {
    /* egal */
  }
  try {
    const f = d.speicher["leitwerk.faelle"] ? JSON.parse(d.speicher["leitwerk.faelle"]) : null;
    info.eigeneFaelle = f?.eigene?.length ?? 0;
    info.geaenderteFaelle = f ? Object.keys(f.geaendert ?? {}).length : 0;
    info.ausgeschaltet = f?.aus?.length ?? 0;
  } catch {
    /* egal */
  }
  try {
    info.modell = d.speicher["leitwerk.ki"] ? JSON.parse(d.speicher["leitwerk.ki"]).modell ?? null : null;
  } catch {
    /* egal */
  }
  return info;
}
