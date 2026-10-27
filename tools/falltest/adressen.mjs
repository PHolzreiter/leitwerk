/**
 * Echte Adressen wie in der App: liest die installierten Adresspakete (addresses-<Land>.tsv.gz) und wählt bzw. sucht
 * Adressen nach genau demselben Verfahren wie src-tauri/src/addresses.rs (random_in, search).
 * Ohne Pakete bleibt es bei den Test-Adressen des Browsers („Testgasse“).
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const KENNUNG = "at.pholzreiter.leitwerk";
/** gleiche Reihenfolge wie REGIONEN in lib.rs */
const REGIONEN = ["noe", "wien", "bgld", "ooe", "stmk"];

function appDaten() {
  const h = homedir();
  if (process.platform === "darwin") return join(h, "Library", "Application Support", KENNUNG);
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(h, "AppData", "Roaming"), KENNUNG);
  return join(process.env.XDG_DATA_HOME ?? join(h, ".local", "share"), KENNUNG);
}

/** wie geo_dateien() in lib.rs: Pakete je Bundesland (nur mit Straßennetz, nicht ausgeschaltet), sonst das alte Gesamtpaket */
export function adressDateien(packsOrdner = join(appDaten(), "packs")) {
  let aus = [];
  try {
    aus = JSON.parse(readFileSync(join(packsOrdner, "regionen.json"), "utf8")).aus ?? [];
  } catch {
    /* keine Einstellung */
  }
  const out = [];
  let strassen = 0;
  for (const reg of REGIONEN) {
    if (!existsSync(join(packsOrdner, `roads-${reg}.lwrg.gz`)) || aus.includes(reg)) continue;
    strassen++;
    const a = join(packsOrdner, `addresses-${reg}.tsv.gz`);
    if (existsSync(a)) out.push(a);
  }
  if (!strassen) {
    const kandidaten = [join(packsOrdner, "addresses.tsv.gz"), "/Applications/LeitWerk.app/Contents/Resources/maps/addresses.tsv.gz"];
    const p = kandidaten.find((x) => existsSync(x));
    if (p) out.push(p);
  }
  return out;
}

/** wie normalize() in addresses.rs */
export function normalize(s) {
  let out = "";
  for (const ch of s.toLowerCase()) {
    if (ch === "ä") out += "ae";
    else if (ch === "ö") out += "oe";
    else if (ch === "ü") out += "ue";
    else if (ch === "ß") out += "ss";
    else if ("áàâ".includes(ch)) out += "a";
    else if ("éèê".includes(ch)) out += "e";
    else if (/[\p{L}\p{N}]/u.test(ch)) out += ch;
    else out += " ";
  }
  return out.split(/\s+/).filter(Boolean).join(" ").replaceAll("strasse", "str").replaceAll("sankt ", "st ");
}

export class Adressen {
  constructor() {
    this.rec = [];
    this.norm = [];
    this.lat = [];
    this.lon = [];
    this.ort = [];
  }

  static async laden(dateien) {
    const a = new Adressen();
    for (const d of dateien) {
      const rl = createInterface({ input: createReadStream(d).pipe(createGunzip()), crlfDelay: Infinity });
      for await (const line of rl) {
        const f = line.split("\t");
        if (f.length < 7) continue;
        const la = Number.parseFloat(f[5]);
        const lo = Number.parseFloat(f[6]);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
        const place = f[0] === "o";
        a.rec.push([f[1], f[2], f[3], place ? "" : f[4]]);
        a.norm.push(normalize(`${f[1]} ${f[3]} ${place ? "" : f[4]}`));
        // in der App als f32 gespeichert
        a.lat.push(Math.fround(la));
        a.lon.push(Math.fround(lo));
        a.ort.push(place);
      }
    }
    return a;
  }

  get anzahl() {
    return this.rec.length;
  }

  treffer(i) {
    const [street, number, postcode, city] = this.rec[i];
    let label;
    if (this.ort[i]) label = street;
    else {
      const place = [postcode, city].filter((s) => s).join(" ");
      label = place ? `${street} ${number}, ${place}` : `${street} ${number}`;
    }
    return { label, street, number, postcode, city, lat: this.lat[i], lon: this.lon[i], place: this.ort[i] };
  }

  /** wie random_in(): xorshift64 mit der Startzahl aus der App */
  zufall(bbox, count, seed) {
    const idx = [];
    for (let i = 0; i < this.rec.length; i++) if (!this.ort[i] && this.lon[i] >= bbox[0] && this.lat[i] >= bbox[1] && this.lon[i] <= bbox[2] && this.lat[i] <= bbox[3]) idx.push(i);
    if (!idx.length) return [];
    const M = (1n << 64n) - 1n;
    let x = BigInt(seed) | 1n;
    const n = BigInt(idx.length);
    const out = [];
    for (let k = 0; k < count; k++) {
      x ^= (x << 13n) & M;
      x ^= x >> 7n;
      x ^= (x << 17n) & M;
      out.push(this.treffer(idx[Number(x % n)]));
    }
    return out;
  }

  /** wie search() */
  suche(query, limit) {
    const tokens = normalize(query).split(" ").filter(Boolean);
    if (!tokens.length) return [];
    const number = tokens.find((t) => /^\d/.test(t) && !(t.length === 4 && /^\d{4}$/.test(t)));
    const words = tokens.filter((t) => t !== number);
    if (!words.length) return [];
    const scored = [];
    for (let i = 0; i < this.rec.length; i++) {
      const hay = this.norm[i];
      if (!words.every((w) => hay.includes(w))) continue;
      let score = 100;
      if (hay.startsWith(words[0])) score -= 30;
      if (this.ort[i]) score -= number === undefined ? 40 : 0;
      if (number !== undefined) {
        if (this.ort[i]) continue;
        const hn = normalize(this.rec[i][1]).replaceAll(" ", "");
        if (hn === number) score -= 50;
        else if (hn.startsWith(number)) score -= 20;
        else continue;
      }
      scored.push([score, i]);
      if (scored.length > 5000) break;
    }
    // zweites Kriterium wie in Rust: Länge des gespeicherten Eintrags (Bytes)
    const len = (i) => Buffer.byteLength(this.rec[i].join("\t"));
    scored.sort((a, b) => a[0] - b[0] || len(a[1]) - len(b[1]));
    return scored.slice(0, limit).map(([, i]) => this.treffer(i));
  }
}
