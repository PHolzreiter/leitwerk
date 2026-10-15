/**
 * Farben persönlich: Vorlagen (NÖ, Rotes Kreuz, Neutral, Nachtschicht, Kontrast) und eigene Farben,
 * jeweils für Hell und Dunkel. Abgeleitete Töne (Hover, Auswahl, Schrift auf Farbe) werden berechnet,
 * damit alles lesbar bleibt.
 */

export type FarbFeld = "akzent" | "leiste" | "hintergrund" | "fenster" | "warn" | "text" | "hervor";

export const FELD_LABEL: Record<Exclude<FarbFeld, "text" | "hervor">, string> = {
  akzent: "Akzentfarbe (Knöpfe, Markierungen, Auswahl)",
  leiste: "Menüleiste oben",
  hintergrund: "Hintergrund",
  fenster: "Fensterfarbe",
  warn: "Warnfarbe (dringend, klingelt)",
};

type Satz = Partial<Record<FarbFeld, string>>;

export const VORLAGEN: Record<string, { name: string; hell: Satz; dunkel: Satz }> = {
  noe: { name: "NÖ Blau-Gelb", hell: {}, dunkel: {} },
  rotkreuz: {
    name: "Rotes Kreuz",
    hell: { akzent: "#c8102e", leiste: "#c8102e", hervor: "#c8102e", warn: "#e0301e" },
    dunkel: { akzent: "#ff5c64", leiste: "#3a0f14", hervor: "#ff5c64", warn: "#ff6b5a" },
  },
  grau: {
    name: "Neutral Grau",
    hell: { akzent: "#475569", leiste: "#e2e8f0", hervor: "#334155", hintergrund: "#eef1f4" },
    dunkel: { akzent: "#94a3b8", leiste: "#1e2530", hervor: "#cbd5e1", hintergrund: "#111418" },
  },
  nacht: {
    name: "Nachtschicht (gedämpft)",
    hell: { akzent: "#8a6d3b", leiste: "#efe9df", hervor: "#8a6d3b", hintergrund: "#e7e1d6", fenster: "#f5f1ea", text: "#2a241c" },
    dunkel: { akzent: "#c08a3e", leiste: "#14110d", hervor: "#c08a3e", hintergrund: "#0b0a08", fenster: "#16130f", text: "#d9cfbf", warn: "#d0563f" },
  },
  kontrast: {
    name: "Hoher Kontrast",
    hell: { akzent: "#0033cc", leiste: "#000000", hervor: "#0033cc", hintergrund: "#ffffff", fenster: "#ffffff", text: "#000000", warn: "#d00000" },
    dunkel: { akzent: "#ffd400", leiste: "#000000", hervor: "#ffd400", hintergrund: "#000000", fenster: "#000000", text: "#ffffff", warn: "#ff4040" },
  },
};

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** relative Helligkeit 0–1 */
export function helligkeit(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Schriftfarbe auf einem Hintergrund */
export function schriftAuf(hex: string): string {
  return helligkeit(hex) > 0.45 ? "#111418" : "#ffffff";
}

const FELDER_CSS = ["--blue", "--blue-line", "--hover", "--sel", "--highlight", "--highlight-text", "--leiste", "--leiste-text", "--bg", "--panel", "--panel-2", "--panel-3", "--input-bg", "--overlay", "--accent", "--alert-text", "--text", "--text-dim", "--line"];

/** Farben auf die Seite anwenden (aufgerufen bei jeder Änderung und beim Wechsel Hell/Dunkel) */
export function farbenAnwenden(vorlage: string, eigene: { hell: Satz; dunkel: Satz }, dunkel: boolean): void {
  const r = document.documentElement;
  const basis = VORLAGEN[vorlage] ?? VORLAGEN.noe;
  const f: Satz = { ...(dunkel ? basis.dunkel : basis.hell), ...(dunkel ? eigene.dunkel : eigene.hell) };
  for (const v of FELDER_CSS) r.style.removeProperty(v);
  const setze = (n: string, w: string) => r.style.setProperty(n, w);
  if (f.text) {
    setze("--text", f.text);
    setze("--text-dim", `color-mix(in srgb, ${f.text} 62%, ${f.fenster ?? (dunkel ? "#191c21" : "#ffffff")})`);
  }
  if (f.hintergrund) setze("--bg", f.hintergrund);
  if (f.fenster) {
    const t = f.text ?? (dunkel ? "#e8ebef" : "#18212c");
    setze("--panel", f.fenster);
    setze("--panel-2", `color-mix(in srgb, ${f.fenster} 95%, ${t})`);
    setze("--panel-3", `color-mix(in srgb, ${f.fenster} 90%, ${t})`);
    setze("--input-bg", f.fenster);
    setze("--overlay", `color-mix(in srgb, ${f.fenster} 95%, transparent)`);
    setze("--line", `color-mix(in srgb, ${f.fenster} 84%, ${t})`);
  }
  if (f.akzent) {
    setze("--blue", f.akzent);
    setze("--blue-line", `color-mix(in srgb, ${f.akzent} 55%, ${dunkel ? "#000" : "#fff"})`);
    setze("--hover", `color-mix(in srgb, ${f.akzent} 8%, transparent)`);
    setze("--sel", `color-mix(in srgb, ${f.akzent} 16%, transparent)`);
  }
  const hervor = f.hervor ?? f.akzent;
  if (hervor) {
    setze("--highlight", hervor);
    setze("--highlight-text", schriftAuf(hervor));
  }
  if (f.leiste) {
    setze("--leiste", f.leiste);
    setze("--leiste-text", schriftAuf(f.leiste));
  }
  if (f.warn) {
    setze("--accent", f.warn);
    setze("--alert-text", `color-mix(in srgb, ${f.warn} 75%, ${dunkel ? "#fff" : "#000"})`);
  }
  r.classList.toggle("leiste-eigen", !!f.leiste);
}
