/**
 * Echtes Wetter aus dem Internet (Open-Meteo, frei nutzbar, ohne Schlüssel).
 * Stündlich für die Mitte der Funkgruppe; Vergangenheit aus dem Archiv, sonst Vorhersage (bis 16 Tage).
 */
import { lageAusWmo, type EchtStunde } from "./weather";

const TAG = 86_400_000;

function datum(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Quelle für den Zeitraum: Vorhersage (92 Tage zurück bis 15 Tage voraus) oder Archiv (älter) */
export function echtwetterQuelle(zeit: number, jetzt = Date.now()): "vorhersage" | "archiv" | null {
  if (zeit > jetzt + 15 * TAG) return null;
  if (zeit >= jetzt - 85 * TAG) return "vorhersage";
  return "archiv";
}

/** Stundenwerte rund um die Zeit laden (1 Tag davor bis 6 Tage danach, soweit verfügbar) */
export async function echtwetterLaden(lat: number, lon: number, zeit: number): Promise<EchtStunde[]> {
  const jetzt = Date.now();
  const quelle = echtwetterQuelle(zeit, jetzt);
  if (!quelle) throw new Error("Für so weit in der Zukunft gibt es noch kein echtes Wetter");
  const von = zeit - TAG;
  let bis = zeit + 6 * TAG;
  if (quelle === "vorhersage") bis = Math.min(bis, jetzt + 15 * TAG);
  else bis = Math.min(bis, jetzt - 6 * TAG); // das Archiv hat ein paar Tage Verzögerung
  const basis = quelle === "archiv" ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
  const url = `${basis}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=weather_code,temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m&timeformat=unixtime&start_date=${datum(von)}&end_date=${datum(bis)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Wetterdienst antwortet nicht (${r.status})`);
    const j = (await r.json()) as {
      hourly?: { time: number[]; weather_code: (number | null)[]; temperature_2m: (number | null)[]; cloud_cover: (number | null)[]; wind_speed_10m: (number | null)[]; wind_direction_10m: (number | null)[] };
    };
    const h = j.hourly;
    if (!h?.time?.length) throw new Error("Wetterdienst lieferte keine Daten");
    const out: EchtStunde[] = [];
    for (let i = 0; i < h.time.length; i++) {
      const code = h.weather_code[i];
      const temp = h.temperature_2m[i];
      if (code == null || temp == null) continue;
      out.push({ t: h.time[i] * 1000, lage: lageAusWmo(code, h.cloud_cover[i] ?? 50, temp), temp, wind: h.wind_speed_10m[i] ?? 10, richtung: h.wind_direction_10m[i] ?? 270 });
    }
    if (!out.length) throw new Error("Wetterdienst lieferte keine Daten");
    return out;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new Error("Wetterdienst nicht erreichbar (keine Antwort)");
    if (e instanceof TypeError) throw new Error("Wetterdienst nicht erreichbar (keine Internetverbindung?)");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ Erreichbarkeit

let letztePruefung = 0;
let erreichbar: boolean | null = null;
let laufend: Promise<boolean> | null = null;

/** Ist der Wetterdienst erreichbar? (Ergebnis wird eine Minute gemerkt; jede Antwort zählt als erreichbar) */
export function wetterdienstErreichbar(neu = false): Promise<boolean> {
  if (!neu && erreichbar !== null && Date.now() - letztePruefung < 60_000) return Promise.resolve(erreichbar);
  if (laufend) return laufend;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    erreichbar = false;
    letztePruefung = Date.now();
    return Promise.resolve(false);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  laufend = fetch("https://api.open-meteo.com/v1/forecast?latitude=48.4&longitude=15.6&current=temperature_2m", { signal: ctrl.signal, cache: "no-store" })
    .then(() => true)
    .catch(() => false)
    .then((ok) => {
      clearTimeout(timer);
      erreichbar = ok;
      letztePruefung = Date.now();
      laufend = null;
      return ok;
    });
  return laufend;
}
