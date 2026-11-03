/**
 * Gesprochenen Text aufbereiten (ohne Oberfläche, damit es sich prüfen lässt):
 * - Zahlwörter als Ziffern („fünfundsiebzig eins“ → „75 1“)
 * - Funkrufnamen erkennen, auch wenn die Erkennung sie etwas falsch schreibt:
 *   „75 1“, „751“, „75 0 0 1“ → „75/001“; „55 1 von LEO“ → „75/001“, wenn es nur 75/001 gibt;
 *   „Neff Krems“, „NEF Kremz“ → „NEF Krems“; „Leo“, „Lio“ → „LEO“
 */

// ------------------------------------------------------------------ Zahlwörter → Ziffern

const EINER: Record<string, number> = { eins: 1, ein: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const ZEHNER: Record<string, number> = {
  zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
  zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
};

function unter100(w: string): number | null {
  if (w === "") return 0;
  if (w in ZEHNER) return ZEHNER[w];
  if (w in EINER) return EINER[w];
  const m = w.match(/^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(zwanzig|dreißig|dreissig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)$/);
  return m ? EINER[m[1]] + ZEHNER[m[2]] : null;
}
function unter1000(w: string): number | null {
  const m = w.match(/^(.*?)hundert(.*)$/);
  if (!m) return unter100(w);
  const vor = m[1] === "" ? 1 : unter100(m[1]);
  const nach = unter100(m[2].replace(/^und/, ""));
  return vor !== null && vor < 10 && nach !== null ? vor * 100 + nach : null;
}
/** ein Wort als Zahl („fünfundsiebzig“ → 75), sonst null; „ein“ allein ist ein Artikel */
export function zahlwort(wort: string): number | null {
  const w = wort.toLowerCase();
  if (w === "ein" || w === "und") return null;
  if (w === "null") return 0;
  const m = w.match(/^(.*?)tausend(.*)$/);
  if (m) {
    const vor = m[1] === "" ? 1 : unter1000(m[1]);
    const nach = unter1000(m[2].replace(/^und/, ""));
    return vor !== null && nach !== null ? vor * 1000 + nach : null;
  }
  return unter1000(w);
}

/** Zahlwörter im Text als Ziffern schreiben („zwei Personen“ → „2 Personen“). „null“ nur zwischen Zahlen. */
export function zahlenAlsZiffern(t: string): string {
  const teile = t.split(/([\p{L}]+)/u);
  // teile: ungerade = Wörter, gerade = was dazwischen steht
  const zahlWort = (i: number) => i >= 0 && i < teile.length && zahlwort(teile[i]) !== null;
  const nebenZahl = (i: number) =>
    /\d\s*$/.test(teile[i - 1] ?? "") || /^\s*\d/.test(teile[i + 1] ?? "") || (/^\s+$/.test(teile[i - 1] ?? "") && zahlWort(i - 2)) || (/^\s+$/.test(teile[i + 1] ?? "") && zahlWort(i + 2));
  return teile
    .map((x, i) => {
      if (!/\p{L}/u.test(x)) return x;
      const n = zahlwort(x);
      if (n === null) return x;
      const w = x.toLowerCase();
      // „Acht geben“, „außer Acht“, „null Ahnung“
      if (w === "acht" && /\b(außer|ausser|in)\s*$/i.test(teile[i - 2] ?? "") && /^\s+$/.test(teile[i - 1] ?? "")) return x;
      if (w === "null" && !nebenZahl(i)) return x;
      return String(n);
    })
    .join("");
}

// ------------------------------------------------------------------ Funkrufnamen

const ZAHL_WORT_KLANG = (n: number): string => {
  const e = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"];
  const z = ["", "zehn", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
  const s = ["zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 10 ? e[r] : r < 20 ? s[r - 10] : `${r % 10 ? `${e[r % 10]}und` : ""}${z[Math.floor(r / 10)]}`;
  return `${h ? `${e[h]}hundert` : ""}${rest}`;
};

function abstand(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let vor = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, vor + (a[i - 1] === b[j - 1] ? 0 : 1));
      vor = t;
    }
  }
  return d[b.length];
}

const falten = (w: string) => w.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

/** wie die Erkennung Abkürzungen oft schreibt → richtige Schreibweise */
const ABK: [RegExp, string][] = [
  [/\b(?:neff|nev|neef|nehf|n\.?\s?e\.?\s?f\.?|en\s?e\s?ef)(?=\s|$|[,.!?-])/gi, "NEF"],
  [/\b(?:r\.?\s?t\.?\s?w\.?|er\s?te\s?we|ertewe)(?=\s|$|[,.!?-])/gi, "RTW"],
  [/\b(?:k\.?\s?t\.?\s?w\.?|ka\s?te\s?we)(?=\s|$|[,.!?-])/gi, "KTW"],
  [/\b(?:n\.?\s?a\.?\s?w\.?|en\s?a\s?we)(?=\s|$|[,.!?-])/gi, "NAW"],
  [/\b(?:a\.?\s?c\.?\s?n\.?|a\s?ce\s?en)(?=\s|$|[,.!?-])/gi, "ACN"],
  [/\b(?:christophorus|christoph|zeh|cee|ce|tse)\s*(?=\d)/gi, "C"],
  [/\b(?:leo|lio|loo|lehro|leho|léo|lehoh)\b/gi, "LEO"],
];

interface Nummer {
  name: string;
  a: string;
  b: number;
}

/**
 * Funkrufnamen im gesprochenen Text richtigstellen. namen = alle Funkrufnamen und Rufnamen der Fahrzeuge.
 * Ohne Liste nur die eindeutigen Fälle („75 001“ → „75/001“).
 */
export function funkTextGlaetten(roh: string, namen?: string[], bevorzugt?: string[]): string {
  const vorne = new Set(bevorzugt ?? []);
  let t = zahlenAlsZiffern(roh);
  for (const [re, ersatz] of ABK) t = t.replace(re, ersatz);
  // Ziffer für Ziffer gesprochen: „7 5 1“ → „751“
  t = t.replace(/\b\d(?:\s\d){2,}\b/g, (m) => m.replace(/\s/g, ""));
  // „75 0 0 1“ → „75 001“
  t = t.replace(/\b(\d{2,3})\s+((?:0\s*)+)(\d{1,2})\b/g, (_m, a: string, n: string, b: string) => `${a} ${n.replace(/\s/g, "")}${b}`);

  const nummern: Nummer[] = [];
  const woerter: { name: string; teile: string[] }[] = [];
  for (const n of new Set(namen ?? [])) {
    const m = n.match(/^(\d{2,3})\/(\d{1,3})$/);
    if (m) nummern.push({ name: n, a: m[1], b: Number(m[2]) });
    else if (/\p{L}/u.test(n)) woerter.push({ name: n, teile: (n.match(/[\p{L}]+|\d+/gu) ?? []).map(falten) });
  }
  const gibt = new Map(nummern.map((x) => [`${x.a}/${x.b}`, x.name]));

  /** passende Nummer: genau, sonst die am ähnlichsten klingende mit gleicher Endnummer */
  const finde = (a: string, b: number, ungefaehr: boolean): string | null => {
    const genau = gibt.get(`${a}/${b}`);
    const klang = ZAHL_WORT_KLANG(Number(a));
    const kand = nummern
      .filter((x) => x.b === b && x.a.length === a.length)
      .map((x) => ({ x, d: abstand(klang, ZAHL_WORT_KLANG(Number(x.a))) }))
      .sort((p, q) => p.d - q.d);
    // ruft gerade ein ähnlich klingendes Fahrzeug („55 1“ gehört, 75/001 ruft), ist das gemeint
    if (ungefaehr && (!genau || !vorne.has(genau))) {
      const v = kand.filter((k) => vorne.has(k.x.name) && k.d <= 4);
      if (v.length && (!v[1] || v[1].d > v[0].d)) return v[0].x.name;
    }
    if (genau) return genau;
    if (!ungefaehr) return null;
    if (!kand.length || kand[0].d > 6 || (kand[1] && kand[1].d === kand[0].d)) return null;
    return kand[0].x.name;
  };

  // Nummern: „75 1“, „75/1“, „75-001“, „751“
  const FUNK_DAVOR = /(?:^|\b(?:hier|an|für|ruft|rufe|von|und)\s*[,:]?\s*)$/i;
  const FUNK_DANACH = /^\s*[,:]?\s*(?:von|für|hier|kommen|bitte|LEO|melden)\b/i;
  t = t.replace(/\b(\d{2,3})(?:\s*(?:schrägstrich|strich|\/|-|–|,|\.)\s*|\s+)(\d{1,3})\b|\b(\d{3,6})\b/gi, (ganz, a: string | undefined, b: string | undefined, glatt: string | undefined, pos: number, alles: string) => {
    const imFunk = FUNK_DAVOR.test(alles.slice(0, pos)) || FUNK_DANACH.test(alles.slice(pos + ganz.length));
    if (a && b) {
      if (!namen) return b.length === 3 ? `${a}/${b}` : ganz;
      return finde(a, Number(b), imFunk) ?? ganz;
    }
    if (!glatt || !namen || !imFunk) return ganz;
    // zusammengezogen: „751“ = 75 + 1, „75001“ = 75 + 001
    const treffer = new Set<string>();
    for (const la of [2, 3]) {
      if (glatt.length <= la) continue;
      const n = finde(glatt.slice(0, la), Number(glatt.slice(la)), false);
      if (n) treffer.add(n);
    }
    if (treffer.size === 1) return [...treffer][0];
    if (treffer.size) return ganz;
    for (const la of [2, 3]) {
      if (glatt.length <= la) continue;
      const n = finde(glatt.slice(0, la), Number(glatt.slice(la)), true);
      if (n) treffer.add(n);
    }
    return treffer.size === 1 ? [...treffer][0] : ganz;
  });

  // Namen aus Wörtern: „NEF Kremz“ → „NEF Krems“ (Art genau, Ort ungefähr)
  if (woerter.length) {
    const toks = [...t.matchAll(/[\p{L}]+|\d+/gu)].map((m) => ({ w: falten(m[0]), von: m.index ?? 0, bis: (m.index ?? 0) + m[0].length }));
    const ersetzen: { von: number; bis: number; name: string }[] = [];
    for (let i = 0; i < toks.length; i++) {
      if (ersetzen.length && ersetzen[ersetzen.length - 1].bis > toks[i].von) continue;
      let best: { name: string; k: number; d: number } | null = null;
      for (const n of woerter) {
        const k = n.teile.length;
        if (i + k > toks.length) continue;
        let d = 0;
        let ok = true;
        for (let j = 0; j < k && ok; j++) {
          const soll = n.teile[j];
          const ist = toks[i + j].w;
          if (soll === ist) continue;
          // Abkürzungen und Zahlen müssen stimmen, das erste Wort auch (sonst wird aus jedem Wort ein Rufname)
          if (j === 0 || /^\d+$/.test(soll) || soll.length <= 4) {
            ok = false;
            break;
          }
          const e = abstand(soll, ist);
          if (e > (soll.length >= 7 ? 2 : 1)) ok = false;
          d += e;
        }
        if (ok && (!best || k > best.k || (k === best.k && d < best.d))) best = { name: n.name, k, d };
      }
      if (best) ersetzen.push({ von: toks[i].von, bis: toks[i + best.k - 1].bis, name: best.name });
    }
    for (const r of ersetzen.reverse()) t = t.slice(0, r.von) + r.name + t.slice(r.bis);
  }
  return t;
}

/** Rufnamen so, wie sie gesprochen werden („75/001“ → „75 1“) – als Hinweis für die Spracherkennung */
export function funkSprechform(name: string): string {
  return name.replace(/^(\d{2,3})\/0*(\d+)$/, "$1 $2");
}
