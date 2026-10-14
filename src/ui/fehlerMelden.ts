/**
 * „Fehler melden“: speichert eine Datei mit Version, letzten Fehlermeldungen, Einstellungen
 * und einer Zusammenfassung des Spielzustands.
 */
import { store } from "../data/store";
import { logEintraege } from "../fehlerLog";
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
    "## Letzter Funk",
    "",
    ...st.funk.slice(0, 30).map((f) => `- ${new Date(f.zeit).toLocaleTimeString("de-AT")} ${f.von}: ${f.text}`),
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
    JSON.stringify(
      st.einsaetze.slice(-5).map((e) => ({ ...e, protokoll: e.protokoll.slice(-30) })),
      null,
      1,
    ).slice(0, 60000),
    "```",
    "",
  ];
  return out.join("\n");
}

export async function fehlerMelden(): Promise<void> {
  const text = await textDialog("Fehler melden", "Was ist passiert? (kurz beschreiben – was du gemacht hast und was falsch war)", "");
  if (text === null) return;
  const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  try {
    const pfad = await saveTextFile(`LeitWerk_Fehlerbericht_${stempel}.md`, fehlerBericht(text), { name: "Text (Markdown)", extensions: ["md", "txt"] });
    if (pfad) toast("Fehlerbericht gespeichert – schick die Datei an den Entwickler");
  } catch (err) {
    toast(String((err as Error).message ?? err), "error");
  }
}
