/**
 * „Fehler melden“: speichert eine Datei mit Version, letzten Fehlermeldungen, Einstellungen
 * und einer Zusammenfassung des Spielzustands.
 */
import { store } from "../data/store";
import { logEintraege } from "../fehlerLog";
import { protokollFuerBericht, protokollPfad } from "../protokoll";
import { mp } from "../net/mehrspieler";
import { inTauri, saveTextFile } from "../platform";
import { sim } from "../sim/engine";
import { kiBereit, kiPrefs } from "../abfrage/ki";
import { textDialog } from "./dialog";
import { toast } from "./dom";
import { pers } from "./ws/persoenlich";

const uhr = (t: number) => new Date(t).toLocaleString("de-AT");

export function fehlerBericht(beschreibung: string): string {
  const st = sim.state;
  const fz = Object.values(st.fahrzeuge);
  const zaehle = <T,>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const settings = { ...sim.settings } as Record<string, unknown>;
  delete settings.kiSchluessel;
  const out = [
    "# LeitWerk – Fehlerbericht",
    "",
    "## Was ist passiert (Beschreibung)",
    "",
    beschreibung || "(keine Beschreibung)",
    "",
    "## Programm",
    "",
    `- Version: ${document.getElementById("app-version")?.textContent?.trim() ?? "?"}`,
    `- Erstellt: ${uhr(Date.now())}`,
    `- Umgebung: ${inTauri() ? "Programm (Tauri)" : "Browser"} · ${navigator.userAgent}`,
    `- Fenster: ${window.innerWidth}×${window.innerHeight}, Pixeldichte ${window.devicePixelRatio}`,
    `- KI: ${kiBereit() ? `bereit (${kiPrefs().modell})` : "nicht bereit"}`,
    `- Spielmodus: ${sim.mode}${mp.aktiv ? ` · ${mp.spieler.length} Spieler` : ""}`,
    `- Abfrageschema geladen: ${store.schema ? "ja" : "nein"}`,
    "",
    "## Spielzustand",
    "",
    `- Spielzeit: ${uhr(st.zeit)} · Tempo ${st.tempo}× · ${st.laeuft ? "läuft" : "Pause"} · Wetter ${st.wetter.lage}`,
    `- Einsätze: ${st.einsaetze.length} ${JSON.stringify(zaehle(st.einsaetze, (e) => e.zustand))}`,
    `- KT/Überstellungen: ${(st.kt ?? []).length} ${JSON.stringify(zaehle(st.kt ?? [], (k) => k.status))}`,
    `- Fahrzeuge: ${fz.length} ${JSON.stringify(zaehle(fz, (f) => f.phase))}`,
    `- Funkgespräche offen: ${(st.funkGespraeche ?? []).filter((g) => g.status !== "ende").length}`,
    "",
    "## Letzte Meldungen und Fehler",
    "",
    "```text",
    ...logEintraege().map((l) => `${new Date(l.zeit).toLocaleTimeString("de-AT")} [${l.art}] ${l.text}`),
    "```",
    "",
    "## Spieler",
    "",
    ...(mp.aktiv ? mp.spieler.map((x) => `- ${x.name}${x.host ? " (Host)" : ""}: ${x.online ? "verbunden" : "nicht verbunden"} · ${sim.pilotVon(x.pid) ? `Pilot ${sim.rufname(sim.pilotVon(x.pid)!)}` : "Disponent"}`) : ["- allein"]),
    "",
    "## Letzte Statusmeldungen",
    "",
    ...st.funk.slice(0, 30).map((f) => `- ${new Date(f.zeit).toLocaleTimeString("de-AT")} ${f.von}: ${f.text}`),
    "",
    "## Letzte Funkgespräche",
    "",
    ...(st.funkGespraeche ?? []).slice(0, 25).flatMap((g) => [
      `### ${g.funkname}${g.an ? ` ↔ ${g.an.funkname}` : ""} · ${g.kanal ? sim.sprechgruppeName(g.kanal) : sim.sprechgruppeName(null)} · ${g.status}${g.mensch ? " · Sprechfunk" : ""}${g.fuehrer ? ` · führt ${g.fuehrer.name}` : ""}`,
      ...g.sprueche.map((x) => `- ${new Date(x.echt ?? x.zeit).toLocaleTimeString("de-AT")} ${x.von}${x.wer ? ` (${x.wer})` : ""}${x.stimme ? " 🎙" : ""}${x.quelle ? ` [${x.quelle}]` : ""}: ${x.text}`),
      "",
    ]),
    "",
    "## Einstellungen (Leitstelle & Simulation)",
    "",
    "```json",
    JSON.stringify(settings, null, 1).slice(0, 20000),
    "```",
    "",
    "## Persönliche Einstellungen",
    "",
    "```json",
    JSON.stringify(pers(), null, 1),
    "```",
    "",
    "## Letzte Einsätze (Rohdaten, gekürzt)",
    "",
    "```json",
    // neueste zuerst (die Liste ist neueste zuerst); ganze Einträge statt abgeschnittenem Text
    (() => {
      const teile: string[] = [];
      let n = 0;
      for (const e of st.einsaetze.slice(0, 8)) {
        const t = JSON.stringify({ ...e, protokoll: e.protokoll.slice(-40) }, null, 1);
        if (n + t.length > 120_000) break;
        teile.push(t);
        n += t.length;
      }
      return `[\n${teile.join(",\n")}\n]`;
    })(),
    "```",
    "",
  ];
  return out.join("\n");
}

/** Bericht als Datei speichern (der Benutzer wählt den Ort). Gibt den Pfad zurück, null = abgebrochen. */
export async function fehlerBerichtSpeichern(beschreibung: string): Promise<string | null> {
  const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  // laufendes Protokoll der Sitzung (Funk, Spieler, Einsätze, Warnungen) anhängen
  const prot = await protokollFuerBericht().catch(() => "");
  const text = `${fehlerBericht(beschreibung)}\n## Protokoll dieser Sitzung${protokollPfad() ? ` (${protokollPfad()})` : ""}\n\n\`\`\`jsonl\n${prot}\n\`\`\`\n`;
  return saveTextFile(`LeitWerk_Fehlerbericht_${stempel}.md`, text, { name: "Text (Markdown)", extensions: ["md", "txt"] });
}

export async function fehlerMelden(): Promise<void> {
  const text = await textDialog("Fehler melden", "Was ist passiert? (kurz beschreiben – was du gemacht hast und was falsch war)", "");
  if (text === null) return;
  try {
    const pfad = await fehlerBerichtSpeichern(text);
    if (pfad) toast("Fehlerbericht gespeichert – schick die Datei an den Entwickler");
  } catch (err) {
    toast(String((err as Error).message ?? err), "error");
  }
}
