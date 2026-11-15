/**
 * Farben persönlich: Standard-Farbschema und eigene Farben,
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

/** Nur noch das Standard-Farbschema (Paul 15.11.2026: keine Farbvorlagen mehr) – eigene Farben gehen weiter */
export const VORLAGEN: Record<string, { name: string; hell: Satz; dunkel: Satz }> = {
  noe: { name: "Standard", hell: {}, dunkel: {} },
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
  void vorlage; // früher Farbvorlagen – es gibt nur noch das Standard-Schema
  const basis = VORLAGEN.noe;
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
