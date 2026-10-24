/**
 * TETRA-Funkgruppen Niederösterreich (NÖ-01 … NÖ-06) mit ihren Bezirken.
 * Die Grenzen sind aus den Gemeindegrenzen zusammengesetzt (Statistik Austria, CC BY 4.0).
 * Die Funkgruppe bestimmt das Einsatzgebiet: Einsätze entstehen nur darin, gefunkt wird auf dieser Gruppe.
 */
import daten from "../data/funkgruppen.json";

export type FunkgruppeId = "NÖ-01" | "NÖ-02" | "NÖ-03" | "NÖ-04" | "NÖ-05" | "NÖ-06";

export interface Funkgruppe {
  id: FunkgruppeId;
  bezirke: string;
  /** schon spielbar (Daten vorhanden) */
  verfuegbar: boolean;
  ringe: [number, number][][];
  bbox: [number, number, number, number];
}

export const FUNK_QUELLE: string = (daten as { quelle: string }).quelle;

const BEZIRKE: Record<FunkgruppeId, string> = {
  "NÖ-01": "Amstetten, Waidhofen/Ybbs, Scheibbs, Melk, St. Pölten Stadt und Land, Lilienfeld",
  "NÖ-02": "Gmünd, Waidhofen/Thaya, Zwettl, Horn",
  "NÖ-03": "Krems Stadt und Land, Hollabrunn, Tulln",
  "NÖ-04": "Mistelbach, Gänserndorf, Korneuburg",
  "NÖ-05": "Bruck an der Leitha, Mödling, Baden (Nord)",
  "NÖ-06": "Wiener Neustadt Stadt und Land, Neunkirchen, Baden (Süd)",
};

/** Standardfarben wie auf der Funkgruppen-Karte */
export const FUNK_FARBEN: Record<FunkgruppeId, string> = {
  "NÖ-01": "#1fb8cc",
  "NÖ-02": "#e53935",
  "NÖ-03": "#3bb54a",
  "NÖ-04": "#c845d0",
  "NÖ-05": "#f0832a",
  "NÖ-06": "#9ccc3d",
};

/** bisher umgesetzt */
const VERFUEGBAR: FunkgruppeId[] = ["NÖ-03", "NÖ-05", "NÖ-06"];

export const FUNKGRUPPEN: Funkgruppe[] = (Object.keys(BEZIRKE) as FunkgruppeId[]).map((id) => {
  const ringe = ((daten as unknown as { gruppen: Record<string, [number, number][][]> }).gruppen[id] ?? []) as [number, number][][];
  const xs = ringe.flat().map((p) => p[0]);
  const ys = ringe.flat().map((p) => p[1]);
  return {
    id,
    bezirke: BEZIRKE[id],
    verfuegbar: VERFUEGBAR.includes(id),
    ringe,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number],
  };
});

export function funkgruppe(id: string | null | undefined): Funkgruppe {
  return FUNKGRUPPEN.find((g) => g.id === id) ?? FUNKGRUPPEN.find((g) => g.id === "NÖ-03")!;
}

/** Liegt der Punkt in der Funkgruppe? (gerade/ungerade Regel über alle Ringe) */
export function inFunkgruppe(g: Funkgruppe, lat: number, lon: number): boolean {
  const [x0, y0, x1, y1] = g.bbox;
  if (lon < x0 || lon > x1 || lat < y0 || lat > y1) return false;
  let drin = false;
  for (const r of g.ringe) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) drin = !drin;
    }
  }
  return drin;
}

/** In welcher Funkgruppe liegt der Punkt? */
export function funkgruppeVon(lat: number, lon: number): Funkgruppe | null {
  return FUNKGRUPPEN.find((g) => inFunkgruppe(g, lat, lon)) ?? null;
}

/** Mitte (Schwerpunkt der Box) */
export function mitteVon(g: Funkgruppe): { lat: number; lon: number } {
  return { lat: (g.bbox[1] + g.bbox[3]) / 2, lon: (g.bbox[0] + g.bbox[2]) / 2 };
}
