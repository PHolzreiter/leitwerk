/**
 * Ortsnamen für die Spracherkennung: nur die, die gerade in Frage kommen (Leistung und weniger Fehlgriffe):
 * Orte bei den Einsätzen und in ihrer Nähe, bei den Fahrzeugen unterwegs, große Orte (viel los) und die Krankenhäuser.
 */
import { store } from "../data/store";
import { stellen } from "../data/einsatzstellen";
import { sim } from "../sim/engine";
import { distanceM } from "../sim/geo";
import { orteGlaetten } from "../sim/funkErkennung";

interface Ort {
  name: string;
  lat: number;
  lon: number;
  n: number;
}

let index: Ort[] | null = null;
let indexStellen = 0;

/** alle bekannten Orte mit ungefährer Lage und wie viel dort ist (Dienststellen, Orte von Interesse, Einsatzstellen) */
function orte(): Ort[] {
  const st = stellen();
  if (index && indexStellen === st.length) return index;
  const m = new Map<string, { lat: number; lon: number; n: number }>();
  const dazu = (name: string | undefined, lat: number, lon: number, gewicht = 1) => {
    const o = name?.trim();
    if (!o || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const x = m.get(o);
    if (x) {
      x.lat = (x.lat * x.n + lat * gewicht) / (x.n + gewicht);
      x.lon = (x.lon * x.n + lon * gewicht) / (x.n + gewicht);
      x.n += gewicht;
    } else m.set(o, { lat, lon, n: gewicht });
  };
  for (const s of store.list("stations")) dazu(s.ort, s.lat, s.lon, 3);
  for (const p of store.list("pois")) dazu(p.ort, p.lat, p.lon);
  for (const h of store.list("hospitals")) dazu(h.ort, h.lat, h.lon, 5);
  for (const s of st) dazu(s.ort, s.lat, s.lon);
  index = [...m].map(([name, x]) => ({ name, ...x }));
  indexStellen = st.length;
  return index;
}

let cache: { t: number; liste: string[] } | null = null;

/** Orte, die gerade in Frage kommen */
export function orteJetzt(): string[] {
  if (cache && Date.now() - cache.t < 10_000) return cache.liste;
  const alle = orte();
  const out = new Set<string>();
  // große Orte (viel los)
  for (const o of [...alle].sort((a, b) => b.n - a.n).slice(0, 80)) out.add(o.name);
  // Krankenhäuser (Name, Kurzname, Ort)
  for (const h of store.list("hospitals")) {
    out.add(h.ort);
    if (h.kurzname) out.add(h.kurzname);
  }
  // in der Nähe der Einsätze und der Fahrzeuge unterwegs
  const punkte: { lat: number; lon: number }[] = [];
  for (const e of sim.state.einsaetze) {
    if (e.zustand === "abgeschlossen" || !e.adresse) continue;
    punkte.push(e.adresse);
  }
  for (const f of Object.values(sim.state.fahrzeuge)) if (f.einsatzId || f.status !== "freiWache") punkte.push({ lat: f.lat, lon: f.lon });
  for (const o of alle) if (punkte.some((p) => distanceM(p, o) < 12_000)) out.add(o.name);
  cache = { t: Date.now(), liste: [...out] };
  return cache.liste;
}

/** erkannten Text: Ortsnamen richtigstellen */
export function orteImText(t: string): string {
  try {
    return orteGlaetten(t, orteJetzt());
  } catch {
    return t;
  }
}
