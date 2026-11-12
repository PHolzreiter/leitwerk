/**
 * „Fehler melden“: schickt den Bericht (Version, letzte Fehlermeldungen, Einstellungen, Spielzustand),
 * das Protokoll der Sitzung, auf Wunsch die Funk-Aufnahmen und Bilder als Ticket an das LeitWerk-Team.
 * Ohne Verbindung (oder auf Wunsch) als Datei speichern.
 */
import { store } from "../data/store";
import { logEintraege } from "../fehlerLog";
import { aufnahmenFuerBericht, protokollFuerBericht, protokollPfad } from "../protokoll";
import { mp } from "../net/mehrspieler";
import { inTauri, saveTextFile } from "../platform";
import { GRENZEN_FEHLER, bytes, dateiAlsAnhang, ticketSchicken } from "../net/tickets";
import { sim } from "../sim/engine";
import { kiBereit, kiPrefs } from "../abfrage/ki";
import { textDialog } from "./dialog";
import { toast } from "./dom";
import { pers } from "./ws/persoenlich";
import { sprachPrefs } from "./sprache";

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
  let text = `${fehlerBericht(beschreibung)}\n## Protokoll dieser Sitzung${protokollPfad() ? ` (${protokollPfad()})` : ""}\n\n\`\`\`jsonl\n${prot}\n\`\`\`\n`;
  // auf Wunsch (Einstellungen › Mikrofon & Funk): die letzten eigenen Funksprüche zum Nachhören (WAV, Base64)
  if (sprachPrefs().berichtAufnahmen) {
    const a = await aufnahmenFuerBericht(10).catch(() => []);
    if (a.length) text += `\n## Funk-Aufnahmen (letzte ${a.length})\n\n${a.map((x) => `### ${x.name}\nErkannt: ${x.text}\n\n\`\`\`wav-base64\n${x.wavB64}\n\`\`\`\n`).join("\n")}`;
  }
  return saveTextFile(`LeitWerk_Fehlerbericht_${stempel}.md`, text, { name: "Text (Markdown)", extensions: ["md", "txt"] });
}

export async function fehlerMelden(): Promise<void> {
  const text = await textDialog("Fehler melden", "Was ist passiert? (kurz beschreiben – was du gemacht hast und was falsch war)", "");
  if (text === null) return;
  try {
    const r = await fehlerTicketSenden(text);
    if ("nr" in r) return toast(`Danke! Fehler-Ticket #${r.nr} ist angekommen – Antwort unter „Meine Tickets“.`);
    toast(`Ticket nicht gesendet (${r.fehler}) – bitte als Datei speichern`, "error");
    const pfad = await fehlerBerichtSpeichern(text);
    if (pfad) toast("Fehlerbericht gespeichert");
  } catch (err) {
    toast(String((err as Error).message ?? err), "error");
  }
}

// ------------------------------------------------------------------ als Ticket

/** Text auf höchstens n Bytes kürzen – vom Anfang her (das Neueste steht am Ende) */
function hinten(t: string, n: number): string {
  if (bytes(t) <= n) return t;
  let r = t.slice(-Math.floor(n / 2));
  while (bytes(r) > n) r = r.slice(Math.floor(r.length / 10));
  const z = r.indexOf("\n");
  return `(gekürzt – ältere Zeilen weggelassen)\n${z >= 0 ? r.slice(z + 1) : r}`;
}

/** Bilder wählen (Screenshots) – für das Fehler-Ticket */
export function bilderWaehlen(): Promise<{ name: string; inhalt: string }[]> {
  return new Promise((ok) => {
    const i = document.createElement("input");
    i.type = "file";
    i.multiple = true;
    i.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
    i.addEventListener("change", async () => {
      const l: { name: string; inhalt: string }[] = [];
      for (const f of Array.from(i.files ?? [])) {
        if (f.size > GRENZEN_FEHLER.dateiBytes) {
          toast(`${f.name}: größer als ${GRENZEN_FEHLER.dateiBytes / 1_000_000} MB`, "error");
          continue;
        }
        l.push(await dateiAlsAnhang(f));
      }
      ok(l.slice(0, 5));
    });
    i.click();
  });
}

/**
 * Fehlerbericht als Ticket schicken: Beschreibung als Text, dazu Anhänge fehlerbericht.md, protokoll.jsonl,
 * Funk-Aufnahmen (wenn eingeschaltet) und Bilder – innerhalb der Grenzen des Ticket-Dienstes (ältestes Protokoll fällt weg).
 */
export async function fehlerTicketSenden(beschreibung: string, opt: { zusatz?: string; bilder?: { name: string; inhalt: string }[] } = {}): Promise<{ nr: number } | { fehler: string }> {
  const G = GRENZEN_FEHLER;
  const rest = G.dateiBytes - 50_000;
  const bilder = (opt.bilder ?? []).slice(0, 5).map((b, i) => ({ name: `bild-${i + 1}.${(b.name.match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png").toLowerCase()}`, inhalt: b.inhalt }));
  const anh: { name: string; inhalt: string }[] = [];
  anh.push({ name: "fehlerbericht.md", inhalt: hinten(`${fehlerBericht(beschreibung)}${opt.zusatz ? `\n${opt.zusatz}\n` : ""}`, rest) });
  const prot = await protokollFuerBericht(rest).catch(() => "");
  if (prot) anh.push({ name: "protokoll.jsonl", inhalt: hinten(prot, rest) });
  const groesse = (a: { name: string; inhalt: string }) => (/\.(png|jpe?g|webp|wav)$/i.test(a.name) ? (a.inhalt.length * 3) / 4 : bytes(a.inhalt));
  let summe = anh.reduce((n, a) => n + groesse(a), 0) + bilder.reduce((n, a) => n + groesse(a), 0);
  if (sprachPrefs().berichtAufnahmen) {
    const a = await aufnahmenFuerBericht(10).catch(() => []);
    const texte: string[] = [];
    // neueste zuerst, solange Platz ist
    for (const x of [...a].reverse()) {
      const g = (x.wavB64.length * 3) / 4;
      if (anh.length + bilder.length >= G.anhaenge - 1 || summe + g > G.gesamtBytes - 200_000 || g > G.dateiBytes) continue;
      const name = `funk-${x.name.replace(/[^\w.-]+/g, "_").replace(/\.wav$/i, "")}.wav`;
      anh.push({ name, inhalt: x.wavB64 });
      texte.push(`${name}: ${x.text}`);
      summe += g;
    }
    if (texte.length) anh.push({ name: "funk-erkannt.txt", inhalt: texte.join("\n") });
  }
  anh.push(...bilder);
  const erste = (beschreibung.trim().split("\n")[0] || "ohne Beschreibung").slice(0, 90);
  const version = (document.getElementById("app-version")?.textContent ?? "").trim().replace(/^v/, "");
  const r = await ticketSchicken({
    art: "fehler",
    titel: `Fehler: ${erste}`,
    text: beschreibung.trim().slice(0, 8000) || undefined,
    version,
    funkgruppe: store.settings.funkgruppe,
    anhaenge: anh,
  });
  if (r.ergebnis === "gesendet") return { nr: r.nr };
  return { fehler: r.ergebnis === "fehler" ? r.fehler : "Ticket-Dienst nicht erreichbar" };
}
