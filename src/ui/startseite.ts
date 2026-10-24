/**
 * Startseite: kommt bei jedem Programmstart vor dem Spiel. Groß: Funkgruppe (auch auf der holografischen
 * NÖ-Karte), Startzeit, Einsatzaufkommen, Wetter, Solo/Multiplayer – alles andere im Einstellungsmenü.
 * Rechts unten der Bereitschafts-Check („Alles funktioniert!“) bzw. im Multiplayer die Lobby: der Host
 * stellt ein und vergibt die Rechte, Mitspieler sehen alles, können es aber nicht ändern.
 * Alle Werte bleiben im Spiel änderbar (Einstellungen).
 */
import "./startseite.css";
import { HINTERGRUND } from "../assets/startseite/bild";
import funkDaten from "../data/funkgruppen.json";
import { ACTIVE_CATEGORIES } from "../data/model";
import { store } from "../data/store";
import { alleFaelle } from "../abfrage/faelle";
import { kiPrefs, kiStatus } from "../abfrage/ki";
import { RECHTE_LABEL, STANDARD_RECHTE, meinName, mp } from "../net/mehrspieler";
import * as spielstand from "../net/spielstand";
import { inTauri } from "../platform";
import { hasCodes } from "../sim/codes";
import { sim, type Berechtigung } from "../sim/engine";
import { FUNKGRUPPEN, type FunkgruppeId } from "../sim/funkgruppen";
import { geoStatus } from "../sim/geo";
import type { Settings } from "../sim/settings";
import { WETTER_LABEL, type WetterLage } from "../sim/weather";
import { GRUNDPAKET, appVersion, packsLocal } from "../updates";
import { openDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { nimmtRettung } from "./khInfo";
import { logoMarke, logoSchrift } from "./logo";
import { sprachPrefs, sprachStatus } from "./sprache";
import { einstellungenOeffnen } from "./ws/steuerleiste";
import { istDunkel, onThema, pers, setzePers, type Thema } from "./ws/persoenlich";

// ------------------------------------------------------------------ Symbole (eigene, im Strichstil)

const P: Record<string, string> = {
  play: `<path d="M7 4.5v15l12-7.5z"/>`,
  ordner: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 11l3 2-3 2z"/>`,
  fortsetzen: `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M10 9l5 3-5 3z"/>`,
  zahnrad: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  schild: `<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>`,
  sonne: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`,
  mond: `<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`,
  monitor: `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>`,
  funk: `<path d="M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14M8 16a5.5 5.5 0 0 1 0-8M16 8a5.5 5.5 0 0 1 0 8"/><circle cx="12" cy="12" r="1.5"/>`,
  uhr: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  balken: `<path d="M5 20v-5M10 20v-9M15 20v-7M20 20V5"/>`,
  wolke: `<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z"/>`,
  leute: `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>`,
  person: `<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>`,
  karte: `<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>`,
  strasse: `<path d="M8 3L5 21M16 3l3 18M12 4v3M12 10v4M12 17v3"/>`,
  liste: `<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>`,
  ki: `<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 15.5h6"/>`,
  mikro: `<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`,
  speicher: `<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>`,
  server: `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  ok: `<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>`,
  warn: `<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>`,
  aus: `<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`,
  fehler: `<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>`,
  rtw: `<path d="M2 16V8a1 1 0 0 1 1-1h11v9"/><path d="M14 10h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/><path d="M8 9.5v3M6.5 11h3"/>`,
  arzt: `<path d="M3 12h4l2-6 4 12 2-6h6"/>`,
  kh: `<path d="M4 21V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v16M2 21h20"/><path d="M12 8v6M9 11h6"/>`,
  buch: `<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2H6"/><path d="M12 7v6M9 10h6"/>`,
  kopie: `<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`,
  pfeil: `<path d="M9 6l6 6-6 6"/>`,
  krone: `<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/>`,
};
const ico = (n: string, k = "") => `<svg class="st-ico ${k}" viewBox="0 0 24 24" aria-hidden="true">${P[n] ?? ""}</svg>`;

// ------------------------------------------------------------------ Holografische NÖ-Karte

const RINGE = (funkDaten as unknown as { gruppen: Record<string, [number, number][][]> }).gruppen;
const KURZ: Record<FunkgruppeId, string> = {
  "NÖ-01": "Mostviertel · St. Pölten",
  "NÖ-02": "Waldviertel",
  "NÖ-03": "Krems · Tulln · Hollabrunn",
  "NÖ-04": "Weinviertel",
  "NÖ-05": "Mödling · Bruck · Baden Nord",
  "NÖ-06": "Industrieviertel Süd",
};

function karteSvg(): { svg: string; mitte: Record<string, [number, number]> } {
  let x0 = 99, x1 = -99, y0 = 99, y1 = -99;
  for (const r of Object.values(RINGE)) for (const ring of r) for (const [lon, lat] of ring) {
    x0 = Math.min(x0, lon); x1 = Math.max(x1, lon); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat);
  }
  const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
  const B = 600;
  const s = B / ((x1 - x0) * k);
  const H = (y1 - y0) * s;
  const pt = (lon: number, lat: number): [number, number] => [(lon - x0) * k * s, (y1 - lat) * s];
  const mitte: Record<string, [number, number]> = {};
  const pfade = FUNKGRUPPEN.map((g) => {
    const ringe = RINGE[g.id] ?? [];
    let sx = 0, sy = 0, n = 0;
    const d = ringe
      .map((ring) => {
        // jeden 3. Punkt (reicht für die Darstellung)
        const pts = ring.filter((_, i) => i % 3 === 0 || i === ring.length - 1).map(([lon, lat]) => pt(lon, lat));
        for (const [x, y] of pts) { sx += x; sy += y; n++; }
        return "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z";
      })
      .join("");
    mitte[g.id] = [sx / Math.max(1, n), sy / Math.max(1, n)];
    return `<path class="st-fg${g.verfuegbar ? "" : " bald"}" data-fg="${g.id}" d="${d}"/>`;
  }).join("");
  const labels = FUNKGRUPPEN.map((g) => {
    const [x, y] = mitte[g.id];
    return `<g class="st-fg-label${g.verfuegbar ? "" : " bald"}" data-fg="${g.id}" transform="translate(${x.toFixed(0)},${y.toFixed(0)})"><circle r="3"/><text y="-9">${g.id}</text>${g.verfuegbar ? "" : `<text class="klein" y="14">bald</text>`}</g>`;
  }).join("");
  const svg = `<svg class="st-holo" viewBox="-20 -20 ${B + 40} ${(H + 40).toFixed(0)}" aria-label="Funkgruppen Niederösterreich">
    <defs>
      <filter id="st-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <pattern id="st-raster" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" class="st-raster-punkt"/></pattern>
      <linearGradient id="st-scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fe3ff" stop-opacity="0"/><stop offset="0.5" stop-color="#7fe3ff" stop-opacity="0.55"/><stop offset="1" stop-color="#7fe3ff" stop-opacity="0"/></linearGradient>
      <clipPath id="st-noe">${pfade.replace(/class="[^"]*"|data-fg="[^"]*"/g, "")}</clipPath>
    </defs>
    <g class="st-holo-flaeche">
      <rect x="-20" y="-20" width="${B + 40}" height="${H + 40}" fill="url(#st-raster)" clip-path="url(#st-noe)"/>
      <g filter="url(#st-glow)">${pfade}</g>
      <rect class="st-scan" x="-20" y="-60" width="${B + 40}" height="60" fill="url(#st-scan)" clip-path="url(#st-noe)"/>
      ${labels}
    </g>
  </svg>`;
  return { svg, mitte };
}

// ------------------------------------------------------------------ Bereitschafts-Check

type CheckStand = "ok" | "warn" | "fehler" | "aus" | "pruefe";
interface Check {
  id: string;
  ico: string;
  name: string;
  stand: CheckStand;
  text: string;
  hilfe?: string;
  /** Einstellungsseite zum Beheben */
  seite?: string;
}

async function pruefen(): Promise<Check[]> {
  const out: Check[] = [];
  const mit = async (c: Omit<Check, "stand" | "text">, f: () => Promise<Pick<Check, "stand" | "text" | "hilfe">>) => {
    try {
      out.push({ ...c, ...(await f()) });
    } catch (e) {
      out.push({ ...c, stand: "fehler", text: "Prüfung fehlgeschlagen", hilfe: String((e as Error)?.message ?? e) });
    }
  };
  await Promise.all([
    mit({ id: "karten", ico: "karte", name: "Kartenmaterial", seite: "karten" }, async () => {
      const l = await packsLocal();
      return l.installed[GRUNDPAKET] ? { stand: "ok", text: "Bereit" } : { stand: "fehler", text: "Grundpaket fehlt", hilfe: "Ohne Grundpaket gibt es keine Karte. Unter Einstellungen → Kartenpakete laden." };
    }),
    mit({ id: "strassen", ico: "strasse", name: "Straßennetz & Adressen", seite: "karten" }, async () => {
      if (!inTauri()) return { stand: "warn", text: "Browser-Ersatz", hilfe: "Im Browser gibt es kein echtes Straßennetz – Fahrten gehen in gerader Linie." };
      const g = await geoStatus();
      if (g.roads.startsWith("Fehler") || g.addresses.startsWith("Fehler")) return { stand: "fehler", text: "Fehler", hilfe: `${g.roads} / ${g.addresses}` };
      if (g.roads === "laden" || g.addresses === "laden") return { stand: "warn", text: "lädt noch …", hilfe: "Straßennetz und Adressen werden gerade geladen." };
      return { stand: "ok", text: "Bereit" };
    }),
    mit({ id: "codes", ico: "liste", name: "Einsatzcodes & Abfrage", seite: "codes" }, async () => {
      if (!hasCodes()) return { stand: "fehler", text: "keine Codeliste", hilfe: "LeitWerk bringt keine Codeliste mit. Unter Einstellungen → Einsatzcodes & Abfrage deine Liste bzw. dein Abfrageschema importieren." };
      if (!store.schema) return { stand: "warn", text: "ohne Abfrageschema", hilfe: "Codes sind da, aber kein Abfrageschema: Notrufe kommen ohne Telefonat herein." };
      return { stand: "ok", text: "Bereit" };
    }),
    mit({ id: "ki", ico: "ki", name: "KI-Anrufer", seite: "ki" }, async () => {
      const p = kiPrefs();
      if (!p.aktiv) return { stand: "aus", text: "ausgeschaltet", hilfe: "Ohne KI antworten die Anrufer mit vorbereiteten Sätzen." };
      const s = await kiStatus();
      if (!s.installiert) return { stand: "warn", text: "nicht installiert", hilfe: "Ollama ist nicht installiert – unter Einstellungen → KI-Anrufer einrichten." };
      if (!s.laeuft) return { stand: "warn", text: "startet …", hilfe: "Ollama läuft noch nicht – startet meist von selbst in ein paar Sekunden." };
      if (!s.modelle.some((m) => m === p.modell || m.startsWith(p.modell))) return { stand: "warn", text: "Modell fehlt", hilfe: `Das Sprachmodell „${p.modell}“ ist nicht geladen.` };
      return { stand: "ok", text: "Bereit" };
    }),
    mit({ id: "sprache", ico: "mikro", name: "Spracheingabe", seite: "sprache" }, async () => {
      const p = sprachPrefs();
      if (!p.eingabe) return { stand: "aus", text: "ausgeschaltet" };
      if (!inTauri()) return { stand: "aus", text: "nur im Programm" };
      const s = await sprachStatus();
      return s.modelle.includes(p.modell) ? { stand: "ok", text: "Bereit" } : { stand: "warn", text: "Modell fehlt", hilfe: "Das Spracherkennungs-Modell ist noch nicht geladen – unter Einstellungen → Sprache laden." };
    }),
    mit({ id: "spielstand", ico: "speicher", name: "Speicherstand" }, async () => {
      const i = await spielstand.autosaveInfo();
      return i ? { stand: "ok", text: `Sicherung ${new Date(i.gespeichert).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` } : { stand: "ok", text: "Bereit" };
    }),
  ]);
  const reihe = ["karten", "strassen", "codes", "ki", "sprache", "spielstand"];
  return out.sort((a, b) => reihe.indexOf(a.id) - reihe.indexOf(b.id));
}

// ------------------------------------------------------------------ Startseite

let offen: HTMLElement | null = null;

/** Wird die Startseite gerade gezeigt? */
export function startseiteOffen(): boolean {
  return !!offen;
}

export function startseiteZeigen(fertig?: () => void, opt: { zurueck?: boolean } = {}): void {
  if (offen) return;
  const root = el("div", { class: "st", role: "dialog", "aria-label": "LeitWerk – Startseite" });
  offen = root;
  const aus: (() => void)[] = [];
  let checks: Check[] = [];
  let modus: "solo" | "multi" = mp.status.rolle === "aus" ? "solo" : "multi";
  let startzeitArt: "jetzt" | "fest" = store.settings.startzeit ? "fest" : "jetzt";

  const themaSetzen = () => {
    root.classList.toggle("dunkel", istDunkel());
    root.classList.toggle("hell", !istDunkel());
  };
  themaSetzen();
  aus.push(onThema(themaSetzen));

  const { svg } = karteSvg();
  const version = (document.getElementById("app-version")?.textContent ?? "").trim();
  root.innerHTML = `
    <div class="st-bild" style="background-image:url('${HINTERGRUND.url}')"></div>
    <div class="st-schleier"></div>
    <aside class="st-seite st-glas">
      <div class="st-marke">${logoMarke(78)}<div>${logoSchrift()}<div class="st-unter">Leitstellensimulator</div></div></div>
      <nav class="st-nav">
        <button class="st-nav-b primaer" data-act="neu">${ico("play")}<span>Neue Simulation starten</span>${ico("pfeil", "klein")}</button>
        ${opt.zurueck ? `<button class="st-nav-b" data-act="zurueck">${ico("pfeil")}<span>Zurück zur Simulation<small>läuft weiter wie bisher</small></span></button>` : ""}
        <button class="st-nav-b" data-act="fortsetzen" hidden>${ico("fortsetzen")}<span>Spiel fortsetzen<small></small></span></button>
        <button class="st-nav-b" data-act="laden">${ico("ordner")}<span>Spielstand laden</span></button>
        <button class="st-nav-b" data-act="einstellungen">${ico("zahnrad")}<span>Einstellungen</span></button>
        <button class="st-nav-b" data-act="check">${ico("schild")}<span>Bereitschafts-Check</span></button>
      </nav>
      <div class="st-fuss">
        <div>LeitWerk ${esc(version)}</div>
        <div class="st-leise">Privates Projekt · nicht offiziell</div>
      </div>
    </aside>
    <main class="st-mitte">
      <div class="st-thema st-glas" role="group" aria-label="Darstellung">
        <button data-thema="hell">${ico("sonne")}Hell</button><button data-thema="dunkel">${ico("mond")}Dunkel</button><button data-thema="system">${ico("monitor")}System</button>
      </div>
      <section class="st-held">
        <div class="st-willkommen">Willkommen bei</div>
        <h1>${logoSchrift()}</h1>
        <p class="st-claim">Der Leitstellensimulator<br>für Niederösterreich.</p>
        <p class="st-sub">Realistische Einsatzlagen. Echte Abläufe.<br>Lernen, üben, erleben.</p>
      </section>
      <div class="st-karte-wrap"><div class="st-karte">${svg}</div><div class="st-sockel"></div></div>
      <section class="st-kacheln"></section>
    </main>
    <aside class="st-rechts">
      <section class="st-karte-cfg st-glas">
        <h2>Simulation konfigurieren</h2>
        <div class="st-feld"><label>${ico("funk")}Funkgruppe</label><select class="st-fg-sel"></select></div>
        <div class="st-feld"><label>${ico("uhr")}Startzeit</label>
          <div class="st-zeit"><div class="st-seg" data-seg="zeit"><button data-v="jetzt">Jetzt</button><button data-v="fest">Wunschzeit</button></div><input type="datetime-local" class="st-zeit-in"></div></div>
        <div class="st-feld"><label>${ico("balken")}Einsatzaufkommen</label>
          <div class="st-seg" data-seg="aufkommen"><button data-v="ruhig">Ruhig</button><button data-v="normal">Normal</button><button data-v="stressig">Stressig</button></div></div>
        <div class="st-feld"><label>${ico("wolke")}Wetter</label>
          <div class="st-wetter"><select class="st-wetter-sel"><option value="realistisch">Realistisch</option><option value="wechselhaft">Wechselhaft</option><option value="fest">Fest</option></select>
          <div class="st-wetter-fest"><select class="st-wetter-lage"></select><input type="number" class="st-wetter-temp" min="-25" max="40"><span>°C</span></div></div></div>
        <div class="st-feld"><label>${ico("leute")}Spielmodus</label>
          <button class="st-schalter" role="switch" aria-checked="false"><span data-v="solo">Solo</span><span data-v="multi">Multiplayer</span><i></i></button></div>
        <button class="st-start">${ico("play")}<span>Neue Simulation starten</span></button>
        <div class="st-start-info"></div>
      </section>
      <section class="st-check st-glas"></section>
      <section class="st-multi st-glas"></section>
    </aside>
    <a class="st-nachweis" href="${esc(HINTERGRUND.link)}" target="_blank" rel="noopener">${esc(HINTERGRUND.nachweis)}</a>`;
  document.body.appendChild(root);
  void appVersion().then((v) => {
    const f = root.querySelector(".st-fuss div");
    if (f && v && v !== "Browser") f.textContent = `LeitWerk v${v}`;
  });

  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T;
  const binHost = () => mp.status.rolle === "host";
  const binGast = () => mp.status.rolle === "client";
  const s = () => store.settings;
  const setzen = (p: Partial<Settings>) => {
    if (binGast()) return;
    store.setSettings({ ...store.settings, ...p });
  };

  // ---------------- Funkgruppe (Liste und Karte)
  const fgSel = $<HTMLSelectElement>(".st-fg-sel");
  for (const g of FUNKGRUPPEN) {
    const o = el("option", { value: g.id }, `${g.id} – ${KURZ[g.id]}${g.verfuegbar ? "" : " (bald)"}`);
    if (!g.verfuegbar) o.disabled = true;
    fgSel.appendChild(o);
  }
  fgSel.addEventListener("change", () => setzen({ funkgruppe: fgSel.value }));
  root.querySelectorAll<SVGElement>(".st-holo [data-fg]").forEach((p) =>
    p.addEventListener("click", () => {
      const g = FUNKGRUPPEN.find((x) => x.id === p.dataset.fg);
      if (!g) return;
      if (!g.verfuegbar) return toast(`${g.id} (${KURZ[g.id]}) ist noch nicht spielbar`);
      if (binGast()) return;
      setzen({ funkgruppe: g.id });
    }),
  );

  // ---------------- Startzeit
  const zeitIn = $<HTMLInputElement>(".st-zeit-in");
  const lokal = (t: number) => {
    const d = new Date(t);
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  };
  zeitIn.value = s().startzeit || lokal(Date.now());
  zeitIn.addEventListener("change", () => setzen({ startzeit: zeitIn.value || undefined }));

  // ---------------- Segmente
  root.querySelectorAll<HTMLElement>(".st-seg").forEach((seg) =>
    seg.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("button[data-v]");
      if (!b || binGast()) return;
      const v = b.dataset.v!;
      if (seg.dataset.seg === "zeit") {
        startzeitArt = v as "jetzt" | "fest";
        setzen({ startzeit: startzeitArt === "fest" ? zeitIn.value || lokal(Date.now()) : undefined });
      } else if (seg.dataset.seg === "aufkommen") setzen({ aufkommenStufe: v as Settings["aufkommenStufe"] });
      render();
    }),
  );

  // ---------------- Wetter
  const wSel = $<HTMLSelectElement>(".st-wetter-sel");
  const wLage = $<HTMLSelectElement>(".st-wetter-lage");
  const wTemp = $<HTMLInputElement>(".st-wetter-temp");
  for (const [k, v] of Object.entries(WETTER_LABEL)) wLage.appendChild(el("option", { value: k }, v));
  const wetterArt = (): "realistisch" | "wechselhaft" | "fest" => {
    const w = s().wetterWechsel ?? (s().wetterModus === "fest" ? 0 : s().wetterModus === "wechselhaft" ? 80 : 50);
    return w <= 0 ? "fest" : w >= 70 ? "wechselhaft" : "realistisch";
  };
  wSel.addEventListener("change", () => {
    const v = wSel.value;
    setzen({ wetterAktiv: true, wetterModus: undefined, wetterWechsel: v === "fest" ? 0 : v === "wechselhaft" ? 80 : 50 });
  });
  wLage.addEventListener("change", () => setzen({ wetterFestLage: wLage.value as WetterLage }));
  wTemp.addEventListener("change", () => setzen({ wetterFestTemp: Math.max(-25, Math.min(40, Number(wTemp.value) || 0)) }));

  // ---------------- Solo / Multiplayer
  const schalter = $<HTMLButtonElement>(".st-schalter");
  schalter.addEventListener("click", () => {
    if (mp.status.rolle !== "aus") return toast("Erst die Lobby verlassen, dann zurück zu Solo");
    modus = modus === "solo" ? "multi" : "solo";
    render();
  });

  // ---------------- Thema
  root.querySelectorAll<HTMLButtonElement>("[data-thema]").forEach((b) =>
    b.addEventListener("click", () => {
      setzePers({ thema: b.dataset.thema as Thema });
      render();
    }),
  );

  // ---------------- Kacheln (echte Zahlen)
  const kacheln = () => {
    const fz = store.list("vehicles").filter((v) => v.aktiv && ACTIVE_CATEGORIES.includes(v.kategorie));
    const z = [
      { i: "rtw", n: fz.filter((v) => ["RTW", "KTW"].includes(v.kategorie)).length, t: "RTW & KTW" },
      { i: "arzt", n: fz.filter((v) => v.kategorie === "NEF" || v.kategorie === "NAH").length, t: "Notarztmittel" },
      { i: "kh", n: store.list("hospitals").filter(nimmtRettung).length, t: "Krankenhäuser" },
      { i: "buch", n: alleFaelle().length, t: "Fälle im Katalog" },
    ];
    $(".st-kacheln").innerHTML = z.map((k, i) => `<div class="st-kachel st-glas" style="--d:${0.5 + i * 0.08}s">${ico(k.i)}<div><b data-zahl="${k.n}">0</b><span>${esc(k.t)}</span></div></div>`).join("");
    // hochzählen
    root.querySelectorAll<HTMLElement>("[data-zahl]").forEach((b) => {
      const ziel = Number(b.dataset.zahl);
      const t0 = performance.now();
      const schritt = () => {
        const k = Math.min(1, (performance.now() - t0) / 1100);
        b.textContent = String(Math.round(ziel * (1 - Math.pow(1 - k, 3))));
        if (k < 1 && root.isConnected) requestAnimationFrame(schritt);
      };
      setTimeout(() => requestAnimationFrame(schritt), 500);
    });
  };

  // ---------------- Bereitschafts-Check
  const checkFeld = $(".st-check");
  const zusammenfassung = () => {
    if (!checks.length) return { k: "pruefe", t: "Wird geprüft …" };
    const f = checks.filter((c) => c.stand === "fehler").length;
    const w = checks.filter((c) => c.stand === "warn").length;
    if (f) return { k: "fehler", t: `${f} Problem${f > 1 ? "e" : ""} gefunden` };
    if (w) return { k: "warn", t: `Startklar – ${w} Hinweis${w > 1 ? "e" : ""}` };
    return { k: "ok", t: "Alles funktioniert!" };
  };
  const checkZeichnen = () => {
    const z = zusammenfassung();
    const klein = modus === "multi";
    checkFeld.classList.toggle("klein", klein);
    checkFeld.innerHTML = `<button class="st-check-kopf" title="Details anzeigen">${ico("schild")}<span class="st-check-titel">Bereitschafts-Check</span><span class="st-pill ${z.k}">${ico(z.k === "ok" ? "ok" : z.k === "pruefe" ? "uhr" : "warn")}${esc(z.t)}</span></button>
      ${klein ? "" : `<ul class="st-check-liste">${checks.map((c, i) => `<li style="--d:${i * 0.09}s">${ico(c.ico)}<span>${esc(c.name)}</span><em class="${c.stand}">${ico(c.stand === "ok" ? "ok" : c.stand === "aus" ? "aus" : c.stand === "fehler" ? "fehler" : "warn")}${esc(c.text)}</em></li>`).join("")}</ul>`}`;
    checkFeld.querySelector(".st-check-kopf")!.addEventListener("click", checkDetails);
    checkFeld.querySelectorAll("li").forEach((li) => li.addEventListener("click", checkDetails));
  };
  const checkDetails = () => {
    const body = el("div", { class: "st-check-pop" });
    const z = zusammenfassung();
    body.innerHTML = `<p class="st-pill gross ${z.k}">${ico(z.k === "ok" ? "ok" : "warn")}${esc(z.t)}</p>`;
    for (const c of checks) {
      const z2 = el("div", { class: `st-check-z ${c.stand}` });
      z2.innerHTML = `${ico(c.ico)}<div><b>${esc(c.name)}</b><span>${esc(c.text)}</span>${c.hilfe ? `<small>${esc(c.hilfe)}</small>` : ""}</div>`;
      if (c.seite && c.stand !== "ok") {
        const b = el("button", { class: "btn small" }, "Beheben …");
        b.addEventListener("click", () => {
          d.close();
          einstellungenOeffnen(c.seite);
        });
        z2.appendChild(b);
      }
      body.appendChild(z2);
    }
    const d = openDialog({ title: "Bereitschafts-Check", body, actions: [{ label: "Neu prüfen", onClick: () => void checkLaufen() }, { label: "Schließen", kind: "primary" }] });
  };
  const checkLaufen = async () => {
    checks = [];
    checkZeichnen();
    checks = await pruefen();
    if (root.isConnected) checkZeichnen();
  };

  // ---------------- Multiplayer-Lobby
  const multiFeld = $(".st-multi");
  const RECHTE: Berechtigung[] = ["disponieren", "kt", "steuern", "einstellungen"];
  const multiZeichnen = () => {
    multiFeld.hidden = modus !== "multi";
    if (modus !== "multi") return;
    const r = mp.status.rolle;
    if (r === "aus") {
      multiFeld.innerHTML = `<h2>${ico("leute")}Multiplayer</h2>
        <p class="st-leise">Bis zu 6 Spieler. Du erstellst die Lobby und stellst ein – die anderen treten mit dem Code bei und sehen alles mit.</p>
        <div class="st-feld"><label>${ico("person")}Dein Name</label><input class="st-name" maxlength="30" placeholder="z. B. Paul"></div>
        <button class="st-knopf voll st-lobby-neu">${ico("krone")}Lobby erstellen</button>
        <div class="st-oder"><span>oder beitreten</span></div>
        <div class="st-beitritt"><input class="st-code" inputmode="numeric" maxlength="6" placeholder="Code"><button class="st-knopf st-lobby-bei">Beitreten</button></div>`;
      const name = multiFeld.querySelector<HTMLInputElement>(".st-name")!;
      const code = multiFeld.querySelector<HTMLInputElement>(".st-code")!;
      name.value = meinName();
      code.value = mp.letztesSpiel().code ?? "";
      const busy = async (b: HTMLButtonElement, f: () => Promise<unknown>) => {
        b.disabled = true;
        try {
          if (!name.value.trim()) throw new Error("Bitte einen Namen eingeben");
          await f();
        } catch (e) {
          toast(String((e as Error)?.message ?? e), "error");
        }
        b.disabled = false;
      };
      const neu = multiFeld.querySelector<HTMLButtonElement>(".st-lobby-neu")!;
      neu.addEventListener("click", () =>
        busy(neu, async () => {
          sim.lobbySetzen(true);
          await mp.hosten(name.value);
          sim.lobbySetzen(true);
        }),
      );
      const bei = multiFeld.querySelector<HTMLButtonElement>(".st-lobby-bei")!;
      bei.addEventListener("click", () => busy(bei, () => mp.beitreten(code.value, name.value)));
      code.addEventListener("keydown", (e) => e.key === "Enter" && bei.click());
      return;
    }
    const host = r === "host";
    const zustand = !mp.status.verbunden ? `<span class="st-pill warn">verbinde …</span>` : host || mp.status.hostDa ? `<span class="st-pill ok">verbunden</span>` : `<span class="st-pill warn">Host nicht da</span>`;
    multiFeld.innerHTML = `<h2>${ico("leute")}${host ? "Deine Lobby" : "Lobby"}${zustand}</h2>
      <div class="st-code-gross"><span>Code</span><b>${esc(mp.status.code)}</b><button class="st-mini st-kopie" title="Code kopieren">${ico("kopie")}</button></div>
      <table class="st-spieler"><thead><tr><th></th>${RECHTE.map((x) => `<th title="${esc(RECHTE_LABEL[x])}">${esc(RECHTE_LABEL[x].split(" ")[0])}</th>`).join("")}</tr></thead><tbody></tbody></table>
      <p class="st-leise">${host ? "Rechte gelten sofort. Die Einstellungen links siehst nur du bearbeitbar." : "Der Host stellt ein und startet – du siehst alles mit."}</p>
      <button class="st-knopf leise voll st-lobby-weg">${host ? "Lobby schließen" : "Lobby verlassen"}</button>`;
    const tb = multiFeld.querySelector("tbody")!;
    for (const sp of mp.spieler) {
      const tr = el("tr");
      tr.innerHTML = `<td><span class="st-dot ${sp.online ? "an" : ""}"></span>${esc(sp.name)}${sp.host ? ` ${ico("krone", "klein")}` : ""}${sp.pid === mp.ich.pid ? ` <span class="st-leise">(du)</span>` : ""}</td>`;
      for (const rr of RECHTE) {
        const td = el("td");
        const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
        cb.checked = sp.host || (sp.rechte[rr] ?? STANDARD_RECHTE[rr]);
        cb.disabled = !host || sp.host;
        cb.addEventListener("change", () => mp.setRechte(sp.pid, rr, cb.checked));
        td.appendChild(cb);
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    multiFeld.querySelector(".st-kopie")!.addEventListener("click", () => void navigator.clipboard?.writeText(mp.status.code).then(() => toast("Code kopiert")));
    multiFeld.querySelector(".st-lobby-weg")!.addEventListener("click", () => {
      mp.verlassen();
      sim.lobbySetzen(false);
      render();
    });
  };

  // ---------------- Starten
  const startKnopf = $<HTMLButtonElement>(".st-start");
  const schliessen = () => {
    if (!offen) return;
    offen = null;
    root.classList.add("weg");
    aus.forEach((f) => f());
    setTimeout(() => root.remove(), 520);
    fertig?.();
  };
  startKnopf.addEventListener("click", async () => {
    if (binGast()) return;
    const zeit = startzeitArt === "fest" && zeitIn.value ? new Date(zeitIn.value).getTime() : Date.now();
    if (!Number.isFinite(zeit)) return toast("Startzeit verstehe ich nicht", "error");
    startKnopf.disabled = true;
    try {
      await sim.call("neuesSpiel", zeit);
      schliessen();
    } catch (e) {
      toast(String((e as Error)?.message ?? e), "error");
      startKnopf.disabled = false;
    }
  });
  root.querySelector('[data-act="neu"]')!.addEventListener("click", () => {
    const k = $(".st-karte-cfg");
    k.classList.remove("blink");
    void k.offsetWidth;
    k.classList.add("blink");
    startKnopf.focus();
  });
  const fortsetzen = $<HTMLButtonElement>('[data-act="fortsetzen"]');
  void spielstand.autosaveInfo().then((i) => {
    if (!i || !root.isConnected) return;
    fortsetzen.hidden = false;
    fortsetzen.querySelector("small")!.textContent = `${new Date(i.gespeichert).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${i.einsaetze} Einsätze`;
  });
  fortsetzen.addEventListener("click", async () => {
    try {
      await spielstand.autosaveLaden();
      sim.start();
      schliessen();
    } catch (e) {
      toast(String((e as Error)?.message ?? e), "error");
    }
  });
  $('[data-act="laden"]').addEventListener("click", async () => {
    try {
      const st = await spielstand.laden();
      if (!st) return;
      sim.start();
      schliessen();
    } catch (e) {
      toast(String((e as Error)?.message ?? e), "error");
    }
  });
  if (opt.zurueck) {
    $('[data-act="zurueck"]').addEventListener("click", schliessen);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    document.addEventListener("keydown", esc);
    aus.push(() => document.removeEventListener("keydown", esc));
  }
  $('[data-act="einstellungen"]').addEventListener("click", () => einstellungenOeffnen());
  $('[data-act="check"]').addEventListener("click", checkDetails);

  // ---------------- Zeichnen (Werte aus den Einstellungen; Mitspieler sehen die des Hosts)
  function render() {
    const gast = binGast();
    root.classList.toggle("gast", gast);
    const st = s();
    const fg = st.funkgruppe ?? "NÖ-03";
    fgSel.value = fg;
    root.querySelectorAll<SVGElement>(".st-holo [data-fg]").forEach((p) => p.classList.toggle("an", p.dataset.fg === fg));
    if (!gast) startzeitArt = st.startzeit ? "fest" : startzeitArt;
    const zeitArt = gast ? (st.startzeit ? "fest" : "jetzt") : startzeitArt;
    if (st.startzeit && document.activeElement !== zeitIn) zeitIn.value = st.startzeit;
    zeitIn.hidden = zeitArt !== "fest";
    const auf = st.aufkommenStufe ?? "normal";
    root.querySelectorAll<HTMLButtonElement>(".st-seg button").forEach((b) => {
      const seg = b.closest<HTMLElement>(".st-seg")!.dataset.seg;
      b.classList.toggle("an", seg === "zeit" ? b.dataset.v === zeitArt : b.dataset.v === auf);
    });
    wSel.value = wetterArt();
    $(".st-wetter-fest").hidden = wSel.value !== "fest";
    wLage.value = st.wetterFestLage ?? "klar";
    wTemp.value = String(st.wetterFestTemp ?? 18);
    for (const x of [fgSel, zeitIn, wSel, wLage, wTemp] as (HTMLInputElement | HTMLSelectElement)[]) x.disabled = gast;
    schalter.setAttribute("aria-checked", String(modus === "multi"));
    schalter.classList.toggle("multi", modus === "multi");
    const th = pers().thema;
    root.querySelectorAll<HTMLButtonElement>("[data-thema]").forEach((b) => b.classList.toggle("an", b.dataset.thema === th));
    const startText = startKnopf.querySelector("span")!;
    startKnopf.disabled = gast;
    startText.textContent = gast ? "Warte auf den Host …" : binHost() ? "Simulation für alle starten" : "Neue Simulation starten";
    $(".st-start-info").textContent = binHost() ? `${mp.spieler.filter((x) => x.online).length} Spieler in der Lobby` : "";
    checkZeichnen();
    multiZeichnen();
  }

  aus.push(store.onChange(render));
  aus.push(
    mp.onChange(() => {
      if (mp.status.rolle !== "aus") modus = "multi";
      render();
    }),
  );
  // Mitspieler: startet der Host (oder läuft das Spiel schon), geht die Startseite zu
  aus.push(
    sim.onChange(() => {
      if (binGast() && mp.status.hostDa && !sim.state.lobby) schliessen();
    }),
  );
  kacheln();
  render();
  void checkLaufen();
}
