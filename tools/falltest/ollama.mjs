/**
 * Anbindung an Ollama – mit genau den Einstellungen, die LeitWerk selbst verwendet.
 * Die Werte werden bei jedem Start aus src-tauri/src/ki.rs gelesen, damit Test und Spiel nie auseinanderlaufen.
 * Ändert sich der Aufbau von ki.rs so, dass die Werte nicht mehr gefunden werden, bricht das Programm ab.
 */
import { readFileSync } from "node:fs";

/** Einstellungen aus ki.rs lesen (Temperatur, Kontext, Länge, Wiederholungsstrafe, JSON-Temperatur, Denkmodus) */
export function kiEinstellungenAusApp(kiRsPfad) {
  const t = readFileSync(kiRsPfad, "utf8");
  const start = t.indexOf("pub async fn ki_chat(");
  if (start < 0) throw new Error("ki.rs: Funktion ki_chat nicht gefunden – Testprogramm muss angepasst werden");
  const f = t.slice(start, start + 4000);
  const zahl = (re, was) => {
    const m = f.match(re);
    if (!m) throw new Error(`ki.rs: „${was}“ nicht gefunden – Testprogramm muss angepasst werden`);
    return Number(m[1]);
  };
  const keep = f.match(/"keep_alive"\s*:\s*"([^"]+)"/);
  return {
    temperatur: zahl(/"temperature"\s*:\s*([\d.]+)\s*,\s*"num_ctx"/, "temperature"),
    numCtx: zahl(/"num_ctx"\s*:\s*(\d+)/, "num_ctx"),
    numPredict: zahl(/"num_predict"\s*:\s*max_tokens\.unwrap_or\((\d+)\)/, "num_predict"),
    repeatPenalty: zahl(/"repeat_penalty"\s*:\s*([\d.]+)/, "repeat_penalty"),
    jsonTemperatur: zahl(/body\["options"\]\["temperature"\]\s*=\s*serde_json::json!\(([\d.]+)\)/, "JSON-Temperatur"),
    keepAlive: keep ? keep[1] : "60m",
    // Modelle mit Denkmodus: LeitWerk schaltet ihn ab
    ohneDenken: [...f.matchAll(/model\.starts_with\("([^"]+)"\)/g)].map((m) => m[1]),
  };
}

export class Ollama {
  constructor(basis, modell, einst) {
    this.basis = basis.replace(/\/$/, "");
    this.modell = modell;
    this.e = einst;
    this.aufrufe = 0;
    this.fehler = 0;
    this.laufend = 0;
    this.maxGleichzeitig = 0;
  }

  static basisUrl() {
    const h = process.env.OLLAMA_HOST?.trim();
    if (!h) return "http://127.0.0.1:11434";
    return /^https?:\/\//.test(h) ? h : `http://${h.includes(":") ? h : `${h}:11434`}`;
  }

  async modelle() {
    const r = await fetch(`${this.basis}/api/tags`).catch(() => null);
    if (!r || !r.ok) return null;
    const j = await r.json();
    return (j.models ?? []).map((m) => m.name);
  }

  /** Modell in den Speicher laden, damit die erste Antwort nicht die Ladezeit misst */
  async vorwaermen() {
    await fetch(`${this.basis}/api/generate`, { method: "POST", body: JSON.stringify({ model: this.modell, prompt: "", keep_alive: this.e.keepAlive }) }).catch(() => null);
  }

  /**
   * Eine Antwort – wie ki_chat in der App. Zusätzlich nur die Startzahl (seed), damit sich Läufe wiederholen lassen.
   * Gibt Text und reine Rechenzeit der KI zurück.
   */
  async chat(messages, { json = false, maxTokens, seed } = {}) {
    const body = {
      model: this.modell,
      messages,
      stream: false,
      keep_alive: this.e.keepAlive,
      options: {
        temperature: json ? this.e.jsonTemperatur : this.e.temperatur,
        num_ctx: this.e.numCtx,
        num_predict: maxTokens ?? (json ? 1600 : this.e.numPredict),
        repeat_penalty: this.e.repeatPenalty,
        ...(seed !== undefined ? { seed } : {}),
      },
    };
    if (json) body.format = "json";
    if (this.e.ohneDenken.some((p) => this.modell.startsWith(p))) body.think = false;
    this.aufrufe++;
    this.laufend++;
    this.maxGleichzeitig = Math.max(this.maxGleichzeitig, this.laufend);
    const t0 = Date.now();
    try {
      const r = await fetch(`${this.basis}/api/chat`, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(json ? 600_000 : 180_000) });
      if (!r.ok) throw new Error(`KI-Fehler: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      if (j.error) throw new Error(`KI-Fehler: ${j.error}`);
      const rechenMs = ((j.prompt_eval_duration ?? 0) + (j.eval_duration ?? 0)) / 1e6;
      return { text: j.message?.content ?? "", rechenMs: rechenMs || Date.now() - t0, wandMs: Date.now() - t0, tokens: j.eval_count ?? 0 };
    } catch (err) {
      this.fehler++;
      throw err;
    } finally {
      this.laufend--;
    }
  }
}

/** Test-KI ohne Ollama: kurze, plausible Antworten – nur zum Prüfen, ob das Testprogramm selbst läuft */
export class TestKi {
  constructor() {
    this.modell = "test-ki";
    this.aufrufe = 0;
    this.fehler = 0;
    this.maxGleichzeitig = 1;
  }
  async modelle() {
    return ["test-ki"];
  }
  async vorwaermen() {}
  async chat(messages, { json = false } = {}) {
    this.aufrufe++;
    await new Promise((r) => setTimeout(r, 5));
    if (json) return { text: "{}", rechenMs: 5, wandMs: 5, tokens: 1 };
    const letzte = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const text = /adresse|wo genau|notfallort/i.test(letzte) ? "Hauptstraße 12 in Krems." : /alt\b|jahre/i.test(letzte) ? "Er ist so um die siebzig." : "Ja, so ist es.";
    return { text, rechenMs: 5, wandMs: 5, tokens: 5 };
  }
}
