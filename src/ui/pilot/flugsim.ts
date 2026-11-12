/**
 * Piloten-Interface: Verbindung zum Flugsimulator – MSFS 2024/2020 über SimConnect (Rust: msfs.rs) und
 * X-Plane 12 über dessen Webserver (Rust: xplane.rs). Beide werden gleichzeitig gesucht; es zählt der, der fliegt.
 * Flugplan zum Laden in MSFS (.pln) und Wetter-Hilfe.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri, saveTextFile } from "../../platform";
import { sim, type SimFahrzeug } from "../../sim/engine";
import { LAGE, WETTER_LABEL, type WetterLage } from "../../sim/weather";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import { carlsEmpfangen } from "./eingabe";

export type SimZustand = "aus" | "keineDll" | "wartet" | "verbunden" | "getrennt" | "fehler";

export interface SimDaten {
  lat: number;
  lon: number;
  hoehe: number;
  agl: number;
  kurs: number;
  kts: number;
  am_boden: boolean;
  motor: boolean;
}

const SCHLUESSEL = "leitwerk.pilot.msfs";
interface Vorgabe {
  dll?: string;
  auto?: boolean;
  /** Community-Ordner (wenn LeitWerk ihn nicht selbst findet) */
  community?: string;
  /** PMS50 GTN750: Flugplan automatisch bereitlegen */
  gtnAuto?: boolean;
  wetter?: "leitwerk" | "selbst";
  /** HPG H145: CARLS-Funkgerät verbinden (Standard an) */
  carls?: boolean;
  /** HPG H145: App „LeitWerk“ im Tablet eingebaut (Standard aus) */
  tabletApp?: boolean;
  /** X-Plane 12: Uhrzeit von LeitWerk übernehmen (Standard an) */
  xpZeit?: boolean;
  /** MSFS: Dauer eines Wetterwechsels in Spielminuten (0 = sofort, Standard 10) */
  wxUeb?: number;
  /** MSFS: Wolken beim Wechsel über die Bedeckung oder über die Dichte ein-/ausblenden (Test) */
  wxWolken?: "bedeckung" | "dichte";
  /** X-Plane 12: Plugin „LeitWerk“ (Tablet-Fenster, auch in VR) automatisch einbauen (Standard an) */
  xpPlugin?: boolean;
  /** MSFS 2024: EFB-App „LeitWerk“ automatisch einbauen und aktualisieren (Standard an; aus nach „Entfernen“) */
  efbApp?: boolean;
  /** X-Plane 12: welche EC135 LeitWerk bekommen (Ordner → ja/nein; sonst die drei vorgeschlagenen) */
  ec135Wahl?: Record<string, boolean>;
}
export function vorgabe(): Vorgabe {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL) ?? "{}") as Vorgabe;
  } catch {
    return {};
  }
}
export function vorgabeSetzen(v: Partial<Vorgabe>): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ ...vorgabe(), ...v }));
  } catch {
    /* egal */
  }
}

export const flugsim = {
  zustand: "aus" as SimZustand,
  text: "",
  dll: null as string | null,
  daten: null as SimDaten | null,
  datenUm: 0,
  /** HPG H145: CARLS-Funkgerät hat auf das Lebenszeichen geantwortet */
  carls: null as { verbunden: boolean; modus: number; phase: number } | null,
  /** woher die Flugdaten gerade kommen */
  quelle: null as Quelle | null,
  /** Zustand je Simulator (die Felder oben sind daraus zusammengesetzt) */
  ms: { zustand: "aus" as SimZustand, text: "" },
  xp: { zustand: "aus" as SimZustand, text: "", version: null as string | null },
};

export type Quelle = "msfs" | "xplane" | "test";
const letzte: Partial<Record<Quelle, { d: SimDaten; um: number }>> = {};

/** Gesamtzustand aus MSFS und X-Plane (für die Anzeige) */
function zusammenfassen(): void {
  const frisch = (q: Quelle) => !!letzte[q] && Date.now() - letzte[q]!.um < 5000;
  const ms = flugsim.ms, xp = flugsim.xp;
  if (flugsim.quelle && frisch(flugsim.quelle)) {
    flugsim.zustand = "verbunden";
    flugsim.text = flugsim.quelle === "xplane" ? xp.text || "Mit X-Plane 12 verbunden" : flugsim.quelle === "msfs" ? ms.text || "Mit MSFS verbunden" : "Mit dem Flugsimulator verbunden";
    return;
  }
  if (xp.zustand === "verbunden") { flugsim.zustand = "verbunden"; flugsim.text = xp.text; return; }
  if (ms.zustand === "verbunden") { flugsim.zustand = "verbunden"; flugsim.text = ms.text; return; }
  // X-Plane läuft, aber noch kein Flug geladen
  if (xp.zustand === "wartet" && xp.version) { flugsim.zustand = "wartet"; flugsim.text = xp.text; return; }
  if (xp.zustand === "fehler") { flugsim.zustand = "fehler"; flugsim.text = xp.text; return; }
  if (ms.zustand === "wartet" || (xp.zustand === "wartet" && ms.zustand !== "fehler")) {
    flugsim.zustand = "wartet";
    flugsim.text = ms.zustand === "wartet" ? "Warte auf MSFS oder X-Plane 12" : `Warte auf X-Plane 12${ms.zustand === "keineDll" && !/Windows/.test(ms.text) ? " – für MSFS fehlt die SimConnect.dll" : ""}`;
    return;
  }
  flugsim.zustand = ms.zustand;
  flugsim.text = ms.text;
}

let hoertZu = false;
let fzVon: () => SimFahrzeug | undefined = () => undefined;
let geaendert: () => void = () => {};
let letztesSenden = 0;

/** Wer die Daten bekommt (Piloten-Interface) */
export function flugsimAnbinden(fz: () => SimFahrzeug | undefined, aenderung: () => void): void {
  fzVon = fz;
  geaendert = aenderung;
}

async function zuhoeren(): Promise<void> {
  if (hoertZu) return;
  hoertZu = true;
  await listen<{ zustand: SimZustand; text: string; dll: string | null }>("msfs-status", (ev) => {
    flugsim.ms = { zustand: ev.payload.zustand, text: ev.payload.text };
    flugsim.dll = ev.payload.dll;
    zusammenfassen();
    geaendert();
  });
  await listen<SimDaten>("msfs-daten", (ev) => datenEmpfangen(ev.payload, "msfs"));
  await listen<{ zustand: SimZustand; text: string; version: string | null }>("xplane-status", (ev) => {
    // neu verbunden (oder neuer Flug): Uhrzeit, Wetter und Flugplan neu übergeben
    if (ev.payload.zustand !== "verbunden" || flugsim.xp.zustand !== "verbunden") xpNeu();
    flugsim.xp = { zustand: ev.payload.zustand, text: ev.payload.text, version: ev.payload.version };
    zusammenfassen();
    geaendert();
  });
  await listen<SimDaten>("xplane-daten", (ev) => datenEmpfangen(ev.payload, "xplane"));
  await listen<{ verbunden: boolean; modus: number; phase: number }>("msfs-carls-status", (ev) => {
    flugsim.carls = ev.payload;
    geaendert();
  });
  await listen<number>("msfs-carls", (ev) => {
    carlsEmpfangen(Number(ev.payload) || 0);
    geaendert();
  });
}

/**
 * Welcher Simulator zählt, wenn beide Daten schicken: der, in dem sich das Luftfahrzeug bewegt;
 * stehen beide, bleibt es beim bisherigen.
 */
export function quelleWaehlen(aktuell: Quelle | null, neu: Quelle, jetzt: number, l: Partial<Record<Quelle, { d: SimDaten; um: number }>>): Quelle {
  if (neu === "test" || !aktuell || aktuell === neu) return neu;
  const a = l[aktuell];
  if (!a || jetzt - a.um > 5000) return neu;
  const bewegt = (x?: { d: SimDaten }) => !!x && (x.d.kts > 5 || !x.d.am_boden);
  return bewegt(l[neu]) && !bewegt(a) ? neu : aktuell;
}

/** Flugdaten (MSFS, X-Plane oder Test-Simulator) – höchstens einmal pro Sekunde an den Host */
export function datenEmpfangen(d: SimDaten, quelle: Quelle = "test"): void {
  const jetztMs = Date.now();
  letzte[quelle] = { d, um: jetztMs };
  const q = quelleWaehlen(flugsim.quelle, quelle, jetztMs, letzte);
  if (q !== quelle) return;
  flugsim.quelle = q;
  flugsim.daten = d;
  flugsim.datenUm = jetztMs;
  if (flugsim.zustand !== "verbunden" || quelle !== "test") zusammenfassen();
  const fz = fzVon();
  const jetzt = Date.now();
  if (quelle === "xplane") void xplaneAbgleich(d);
  if (fz && jetzt - letztesSenden >= 900) {
    letztesSenden = jetzt;
    void sim
      .call("pilotPosition", fz.id, d.lat, d.lon, { hoehe: d.hoehe, agl: d.agl, kurs: d.kurs, kts: d.kts, amBoden: d.am_boden, motor: d.motor })
      .catch((e) => console.warn("Position", e));
  }
  geaendert();
}

export async function flugsimVerbinden(dll?: string): Promise<void> {
  if (!inTauri()) {
    flugsim.zustand = "fehler";
    flugsim.text = "Die Verbindung zum MSFS geht nur im Programm (nicht im Browser)";
    geaendert();
    return;
  }
  await zuhoeren();
  try {
    // CARLS läuft über die Tablet-Mission (hpg.ts) – das Lebenszeichen über SimConnect bleibt aus
    await invoke("msfs_carls", { an: false }).catch(() => undefined);
    // X-Plane 12 wird immer mitgesucht (läuft auch ohne SimConnect.dll)
    await invoke("xplane_starten").catch(() => undefined);
    vorgabeSetzen({ auto: true, ...(dll ? { dll } : {}) });
    const pfad = await invoke<string>("msfs_starten", { dll: dll ?? vorgabe().dll ?? null });
    flugsim.dll = pfad;
  } catch (e) {
    flugsim.ms = { zustand: flugsim.ms.zustand === "aus" ? "fehler" : flugsim.ms.zustand, text: String((e as Error)?.message ?? e) };
  }
  zusammenfassen();
  geaendert();
}

export async function flugsimTrennen(): Promise<void> {
  vorgabeSetzen({ auto: false });
  if (inTauri()) {
    await invoke("msfs_stoppen").catch(() => undefined);
    await invoke("xplane_stoppen").catch(() => undefined);
  }
  flugsim.zustand = "aus";
  flugsim.carls = null;
  flugsim.text = "";
  flugsim.daten = null;
  flugsim.quelle = null;
  flugsim.ms = { zustand: "aus", text: "" };
  flugsim.xp = { zustand: "aus", text: "", version: null };
  geaendert();
}

/** Programm schließt das Piloten-Interface: Verbindung beenden, Einstellung „automatisch“ bleibt */
export function flugsimBeenden(): void {
  if (inTauri()) {
    void invoke("msfs_stoppen").catch(() => undefined);
    void invoke("xplane_stoppen").catch(() => undefined);
  }
  flugsim.zustand = "aus";
  flugsim.carls = null;
  flugsim.daten = null;
  flugsim.quelle = null;
}

export async function dllWaehlen(): Promise<void> {
  if (!inTauri()) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const p = await open({ multiple: false, directory: false, filters: [{ name: "SimConnect.dll", extensions: ["dll"] }], title: "SimConnect.dll wählen" });
  if (typeof p !== "string") return;
  await flugsimVerbinden(p);
}

/** Kommen noch Daten? (sonst: Hinweis) */
export function datenFrisch(): boolean {
  return !!flugsim.daten && Date.now() - flugsim.datenUm < 5000;
}

// ------------------------------------------------------------------ Flugplan (.pln)

function gms(wert: number, pos: string, neg: string): string {
  const h = wert >= 0 ? pos : neg;
  const a = Math.abs(wert);
  const g = Math.floor(a);
  const mf = (a - g) * 60;
  const m = Math.floor(mf);
  const s = (mf - m) * 60;
  return `${h}${g}° ${m}' ${s.toFixed(2)}"`;
}

/** Koordinate in der Schreibweise von MSFS (N48° 24' 1.20",E15° 36' 0.00",+000800.00) */
export function lla(lat: number, lon: number, fuss = 0): string {
  const h = `${fuss >= 0 ? "+" : "-"}${Math.abs(fuss).toFixed(2).padStart(9, "0")}`;
  return `${gms(lat, "N", "S")},${gms(lon, "E", "W")},${h}`;
}

/** Koordinate zum Abschreiben (Dezimal und Grad/Minuten) */
export function koordText(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)} (${gms(lat, "N", "S")} ${gms(lon, "E", "W")})`;
}

/** Nur einfache Zeichen (MSFS und Add-ons vertragen keine Sonderzeichen in Namen) */
export function ascii(s: string): string {
  return s
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ._@-]+/g, " ").replace(/\s+/g, " ").trim();
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** VFR-Flugplan von der aktuellen Position zu einem Ziel (zwei Benutzer-Wegpunkte) */
export function plnText(titel: string, von: { lat: number; lon: number; fuss: number }, nach: { lat: number; lon: number; name: string }): string {
  const wp = (id: string, p: { lat: number; lon: number }, fuss: number) => `        <ATCWaypoint id="${id}">
            <ATCWaypointType>User</ATCWaypointType>
            <WorldPosition>${lla(p.lat, p.lon, fuss)}</WorldPosition>
        </ATCWaypoint>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<SimBase.Document Type="AceXML" version="1,0">
    <Descr>AceXML Document</Descr>
    <FlightPlan.FlightPlan>
        <Title>${xmlEsc(ascii(titel))}</Title>
        <FPType>VFR</FPType>
        <RouteType>Direct</RouteType>
        <CruisingAlt>1500.000</CruisingAlt>
        <DepartureID>CUSTD</DepartureID>
        <DepartureLLA>${lla(von.lat, von.lon, von.fuss)}</DepartureLLA>
        <DestinationID>CUSTA</DestinationID>
        <DestinationLLA>${lla(nach.lat, nach.lon, 0)}</DestinationLLA>
        <Descr>${xmlEsc(ascii(`LeitWerk ${titel}`))}</Descr>
        <DepartureName>Custom departure</DepartureName>
        <DestinationName>${xmlEsc(ascii(nach.name))}</DestinationName>
        <AppVersion>
            <AppVersionMajor>11</AppVersionMajor>
            <AppVersionBuild>282174</AppVersionBuild>
        </AppVersion>
${wp("CUSTD", von, von.fuss)}
${wp("CUSTA", nach, 0)}
    </FlightPlan.FlightPlan>
</SimBase.Document>
`;
}

export async function flugplanSpeichern(fz: SimFahrzeug, nach: { lat: number; lon: number; name: string }): Promise<void> {
  const fuss = flugsim.daten && datenFrisch() ? flugsim.daten.hoehe : 0;
  const titel = `${fz.kurzname || fz.funkrufname} – ${nach.name}`;
  // immer derselbe Name (Paul 11.11.): der neue Plan überschreibt den alten
  const datei = "Leitwerk";
  if (flugsim.quelle === "xplane") {
    const inhalt = fmsText({ lat: fz.lat, lon: fz.lon, fuss }, nach);
    if (inTauri()) void invoke("gtn_gfp", { inhalt: gfpText({ lat: fz.lat, lon: fz.lon }, nach) }).catch(() => undefined);
    const direkt = inTauri() ? await invoke<string | null>("xplane_fms", { inhalt }).catch(() => null) : null;
    if (direkt) return toast(`Flugplan „Leitwerk“ zum ${nach.name} in X-Plane (Output/FMS plans) – im GPS/FMS laden`);
    const p2 = await saveTextFile(`${datei}.fms`, inhalt, { name: "X-Plane-Flugplan", extensions: ["fms"] });
    if (p2) toast("Flugplan gespeichert – nach X-Plane/Output/FMS plans legen und im GPS/FMS laden");
    return;
  }
  const pfad = await saveTextFile(`${datei}.pln`, plnText(titel, { lat: fz.lat, lon: fz.lon, fuss }, nach), { name: "MSFS-Flugplan", extensions: ["pln"] });
  if (pfad) toast("Flugplan gespeichert – im MSFS auf der Weltkarte unter „Laden“ öffnen");
}

// ------------------------------------------------------------------ Wetter-Hilfe

/** Wolkenbild für MSFS (Voreinstellung im Wetter-Menü) */
function msfsVorgabe(lage: WetterLage): string {
  const i = LAGE[lage];
  if (i.art === "gewitter") return "Gewitter (Thunderstorm)";
  if (i.art === "schnee") return "Schnee (Snow)";
  if (i.art === "regen") return lage === "starkregen" ? "Sturm (Storm)" : "Regen (Rain)";
  if (i.art === "nebel") return "Bedeckt (Overcast) mit geringer Sicht";
  if (i.wolken >= 0.85) return "Bedeckt (Overcast)";
  if (i.wolken >= 0.6) return "Aufgelockert bis stark bewölkt (Broken Clouds)";
  if (i.wolken >= 0.35) return "Teilweise bewölkt (Scattered Clouds)";
  if (i.wolken > 0) return "Wenige Wolken (Few Clouds)";
  return "Klarer Himmel (Clear Skies)";
}

export function wetterDialog(): void {
  const body = el("div", { class: "plt-wetter" });
  const zeichnen = () => {
    const w = sim.wetterWerte();
    const echt = !!sim.settings.wetterEcht;
    const wahl = vorgabe().wetter ?? "leitwerk";
    const rose = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(((w.richtung % 360) + 360) % 360 / 45) % 8];
    body.innerHTML = `
      <div class="plt-wetter-jetzt"><b>${esc(WETTER_LABEL[w.lage])}</b> · ${Math.round(w.temp)} °C · Wind ${Math.round(w.wind)} km/h aus ${rose}${w.boeen > w.wind + 5 ? `, Böen ${Math.round(w.boeen)}` : ""} · Sicht ${w.sicht >= 10 ? "über 10" : w.sicht.toFixed(1).replace(".", ",")} km</div>
      ${sim.flugverbotJetzt() ? `<p class="plt-warn">In LeitWerk ist gerade kein Flugbetrieb möglich.</p>` : ""}
      <div class="plt-reiter zwei"><button data-w="leitwerk" class="${wahl === "leitwerk" ? "an" : ""}">Wie LeitWerk</button><button data-w="selbst" class="${wahl === "selbst" ? "an" : ""}">Selbst einstellen</button></div>
      ${
        flugsim.quelle === "xplane"
          ? wahl === "selbst"
            ? `<p>Du stellst das Wetter in X-Plane selbst ein. Achtung: Ob die Leitstelle dich wegen Wetter nicht alarmieren kann, richtet sich weiter nach dem Wetter in LeitWerk.</p>`
            : echt
              ? `<p>LeitWerk nutzt <b>echtes Wetter</b> – X-Plane wird auf <b>Real Weather</b> gestellt.</p>`
              : `<p>LeitWerk stellt sein Wetter in X-Plane <b>selbst ein</b> (Wolken, Sicht, Wind, Niederschlag, Temperatur, Luftdruck) und passt es an, wenn es sich in LeitWerk ändert.</p>`
          : wahl === "selbst"
          ? `<p>Du stellst das Wetter im MSFS selbst ein. Achtung: Ob die Leitstelle dich wegen Wetter nicht alarmieren kann, richtet sich weiter nach dem Wetter in LeitWerk.</p>`
          : echt
            ? `<p>LeitWerk nutzt <b>echtes Wetter</b> – die LeitWerk-App im EFB schaltet im MSFS <b>Live-Wetter</b> ein.</p><p class="plt-leise">Beide holen das Wetter aus verschiedenen Quellen – meist ähnlich, aber z. B. die Wolkenuntergrenze kann abweichen.</p>`
            : `<p>LeitWerk stellt sein Wetter im MSFS <b>selbst ein</b> (Wolken, Sicht, Wind, Niederschlag, Temperatur, Luftdruck) – über die LeitWerk-App im EFB-Tablet, ohne dass du sie öffnen musst. Ändert sich das Wetter in LeitWerk, zieht MSFS nach.</p>
               <p style="margin:12px 0 6px"><b>Wetterwechsel</b> – wie schnell neues Wetter aufzieht (Spielzeit, im Zeitraffer schneller)</p>
               <div class="plt-reiter">${[[0, "Sofort"], [2, "Schnell (2 min)"], [10, "Realistisch (10 min)"]].map(([m, t]) => `<button data-ueb="${m}" class="${wetterUebergang.min === m ? "an" : ""}">${t}</button>`).join("")}</div>
               <p style="margin:12px 0 6px"><b>Wolken beim Wechsel (Test)</b> – was ruhiger aussieht</p>
               <div class="plt-reiter zwei">${[["bedeckung", "über die Bedeckung"], ["dichte", "über die Dichte"]].map(([m, t]) => `<button data-wolken="${m}" class="${wetterUebergang.wolken === m ? "an" : ""}">${t}</button>`).join("")}</div>
               <p class="plt-leise">Falls es nicht klappt, im MSFS unter Wetter → Voreinstellung von Hand wählen: ${esc(msfsVorgabe(w.lage))}, Wind etwa ${Math.round(w.wind / 1.852)} kt aus ${Math.round(w.richtung)}°.</p>`
      }`;
    body.querySelectorAll<HTMLButtonElement>("[data-ueb]").forEach((b) =>
      b.addEventListener("click", () => {
        wetterUebergang.min = Number(b.dataset.ueb);
        zeichnen();
      }),
    );
    body.querySelectorAll<HTMLButtonElement>("[data-wolken]").forEach((b) =>
      b.addEventListener("click", () => {
        wetterUebergang.wolken = b.dataset.wolken as "bedeckung" | "dichte";
        zeichnen();
      }),
    );
    body.querySelectorAll<HTMLButtonElement>("[data-w]").forEach((b) =>
      b.addEventListener("click", () => {
        vorgabeSetzen({ wetter: b.dataset.w as "leitwerk" | "selbst" });
        zeichnen();
      }),
    );
  };
  zeichnen();
  openDialog({ title: "Wetter für den Flugsimulator", body, actions: [{ label: "Fertig", kind: "primary", onClick: () => { xpAbgleich.wetterKey = ""; } }] });
}

// ------------------------------------------------------------------ PMS50 GTN750: Flugplan automatisch bereitlegen

export const gtn = { paket: null as string | null, community: null as string | null, ziel: "", fehler: "", geprueft: false };

export async function gtnSuchen(): Promise<void> {
  if (!inTauri()) return;
  try {
    const o = await invoke<{ community: string | null; paket: string | null }>("gtn_suchen", { community: vorgabe().community ?? null });
    gtn.paket = o.paket;
    gtn.community = o.community;
  } catch (e) {
    gtn.fehler = String((e as Error)?.message ?? e);
  }
  gtn.geprueft = true;
  geaendert();
}

export async function communityWaehlen(): Promise<void> {
  if (!inTauri()) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const p = await open({ directory: true, multiple: false, title: "Community-Ordner des Flugsimulators wählen" });
  if (typeof p !== "string") return;
  vorgabeSetzen({ community: p });
  gtn.ziel = "";
  await gtnSuchen();
  // H145-Tablet gleich im neuen Ordner einrichten
  void import("./handy").then((h) => h.tabletLinkPruefen(p));
}

export function gtnAn(): boolean {
  return vorgabe().gtnAuto !== false;
}

export function gtnUmschalten(an: boolean): void {
  vorgabeSetzen({ gtnAuto: an });
  gtn.ziel = "";
  geaendert();
}

/** Wegpunkt-Kennung für das GTN (höchstens 5 Zeichen, Großbuchstaben/Ziffern) */
function wpZeile(id: string, name: string, lat: number, lon: number): string {
  // Kommentar: nur Buchstaben, Leerzeichen und . - _ @ (keine Ziffern), höchstens 20 Zeichen
  const k = ascii(name).replace(/[^A-Za-z ._@-]/g, "").trim().slice(0, 20) || "LeitWerk";
  return `${id},${k},${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** Legt den Flugplan zum aktuellen Ziel ins GTN750 (nur wenn sich das Ziel geändert hat) */
export function gtnBereitlegen(fz: SimFahrzeug, ziel: { lat: number; lon: number; name: string; art: "bo" | "kh" } | null, alle: { bo?: { lat: number; lon: number }; kh?: { lat: number; lon: number; name: string } }): void {
  if (!inTauri() || !gtn.paket || !gtnAn() || !ziel) return;
  const key = `${fz.id}|${ziel.art}|${ziel.lat.toFixed(5)},${ziel.lon.toFixed(5)}`;
  if (key === gtn.ziel) return;
  gtn.ziel = key;
  const fuss = flugsim.daten && datenFrisch() ? flugsim.daten.hoehe : 0;
  const pln = plnText(`${fz.kurzname || fz.funkrufname} ${ziel.name}`, { lat: fz.lat, lon: fz.lon, fuss }, ziel);
  const wp = [alle.bo ? wpZeile("LWBO", "Einsatzort", alle.bo.lat, alle.bo.lon) : "", alle.kh ? wpZeile("LWKH", alle.kh.name, alle.kh.lat, alle.kh.lon) : "", wpZeile("LWBAS", fz.stationName || "Stuetzpunkt", fz.heim.lat, fz.heim.lon)].filter(Boolean).join("\r\n");
  void invoke<string>("gtn_schreiben", { community: vorgabe().community ?? null, pln, wegpunkte: wp })
    .then(() => {
      gtn.fehler = "";
      toast(`GTN750: Flugplan zum ${ziel.art === "bo" ? "Einsatzort" : ziel.name} bereit – im GTN Flight Plan → Menu → Import`);
      geaendert();
    })
    .catch((e) => {
      gtn.fehler = String((e as Error)?.message ?? e);
      gtn.ziel = "";
      geaendert();
    });
}

/** HPG H145: CARLS-Funkgerät verbinden? */
export function carlsAn(): boolean {
  return vorgabe().carls !== false;
}

export function carlsUmschalten(an: boolean): void {
  vorgabeSetzen({ carls: an });
  if (!an) flugsim.carls = null;

  geaendert();
}

// ------------------------------------------------------------------ X-Plane 12: Uhrzeit, Wetter, Flugplan

/** Stand des Abgleichs mit X-Plane (für die Anzeige im Cockpit-Bereich) */
export const xpAbgleich = {
  zeitSim: 0,
  zeitReal: 0,
  wetterKey: "",
  laeuft: false,
  fehler: "",
  pause: 0,
  zeitText: "",
  wetterText: "",
  fms: "",
  fmsZiel: "",
  fmsFehler: "",
  gfp: "",
};

function xpNeu(): void {
  xpWx.geprueft = false;
  xpWx.regionGeht = undefined;
  xpWx.dauer = 0;
  xpWx.ist = null;
  xpAbgleich.zeitSim = 0;
  xpAbgleich.wetterKey = "";
  xpAbgleich.fmsZiel = "";
  xpAbgleich.pause = 0;
}

/** Spielzeit als GMT für X-Plane (Tag im Jahr ab 0, Stunden mit Nachkomma) */
export function xpZeit(t: number): { day_of_year: number; time_in_24_hours: number } {
  const d = new Date(t);
  const tag = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000);
  return { day_of_year: tag, time_in_24_hours: +(d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600).toFixed(4) };
}

const NIEDERSCHLAG: Partial<Record<WetterLage, number>> = {
  niesel: 0.15, leichter_regen: 0.3, regen: 0.55, starkregen: 0.9, gewitter: 0.7, hagel: 0.9, unwetter: 1,
  schneeregen: 0.5, leichter_schnee: 0.3, schnee: 0.6, starker_schnee: 0.9, eisregen: 0.5,
};

/** Wetter von LeitWerk als eigenes Wetter für X-Plane (Flight Initialization: weather.definition) */
export function xpWetter(w: { lage: WetterLage; temp: number; wind: number; boeen: number; richtung: number; sicht: number; druck: number }, lat: number, lon: number, bodenM: number): Record<string, unknown> {
  const i = LAGE[w.lage];
  const boden = Math.max(0, bodenM) * 3.28084;
  const nass = i.art === "regen" || i.art === "schnee" || i.art === "eis";
  const wolken: Record<string, unknown>[] = [];
  const schicht = (type: string, cover: number, ab: number, bis: number) => wolken.push({ type, cover_ratio: cover, bases_in_feet_msl: Math.round(boden + ab), tops_in_feet_msl: Math.round(boden + bis) });
  if (w.lage === "nebel") schicht("stratus", 1, 0, 600);
  else if (w.lage === "hochnebel") schicht("stratus", 1, 500, 2500);
  else if (i.art === "gewitter") schicht("cumulunimbus", 0.8, 3000, 30000);
  else if (i.wolken > 0) {
    const flach = i.wolken >= 0.85 || nass;
    schicht(flach ? "stratus" : "cumulus", i.wolken, nass ? 1500 : flach ? 2500 : 4000, nass ? 6000 : flach ? 5500 : 7000);
  }
  const kt = w.wind / 1.852;
  const boe = Math.max(0, (w.boeen - w.wind) / 1.852);
  const turb = i.heftig ? 0.35 : kt > 15 ? 0.2 : 0.05;
  const terrain = i.art === "schnee" ? (w.lage === "leichter_schnee" ? "lightly_snowy" : "medium_snowy") : i.art === "eis" ? "lightly_icy" : i.art === "regen" || i.art === "gewitter" ? (w.lage === "niesel" ? "lightly_wet" : w.lage === "starkregen" ? "very_wet" : "medium_wet") : "dry";
  return {
    definition: {
      latitude_in_degrees: +lat.toFixed(4),
      longitude_in_degrees: +lon.toFixed(4),
      elevation_in_meters: Math.round(Math.max(0, bodenM)),
      visibility_in_kilometers: Math.max(0.1, +w.sicht.toFixed(2)),
      temperature_in_degrees_celsius: Math.round(w.temp),
      altimeter_setting_in_hpa: Math.round(w.druck),
      precipitation_ratio: NIEDERSCHLAG[w.lage] ?? 0,
      clouds: wolken,
      wind: [
        { altitude_in_feet_msl: Math.round(boden + 1000), speed_in_knots: Math.round(kt), direction_in_degrees_true: Math.round(w.richtung), gust_increase_in_knots: Math.round(boe), turbulence_ratio: turb },
        { altitude_in_feet_msl: Math.round(boden + 5000), speed_in_knots: Math.round(kt * 1.4), direction_in_degrees_true: Math.round((w.richtung + 15) % 360), turbulence_ratio: turb / 2 },
      ],
    },
    vertical_speed_in_thermal_in_feet_per_minute: 0,
    wave_height_in_meters: 0.5,
    wave_direction_in_degrees: Math.round(w.richtung),
    terrain_state: terrain,
    variation_across_region_percentage: 10,
    evolution_over_time_enum: "static",
  };
}

/** Uhrzeit und Wetter von LeitWerk an X-Plane (nur bei Änderung; Uhrzeit, wenn sie über 1 min abweicht) */
async function xplaneAbgleich(d: SimDaten): Promise<void> {
  if (!inTauri() || xpAbgleich.laeuft || Date.now() < xpAbgleich.pause) return;
  const data: Record<string, unknown> = {};
  if (vorgabe().xpZeit !== false) {
    const erwartet = xpAbgleich.zeitSim + (Date.now() - xpAbgleich.zeitReal);
    // im Zeitraffer läuft LeitWerk schneller als der Simulator: dann öfter nachziehen
    const grenze = sim.wirksamesTempo() > 1 ? 8_000 : 60_000;
    if (!xpAbgleich.zeitSim || Math.abs(sim.state.zeit - erwartet) > grenze) data.gmt_time = xpZeit(sim.state.zeit);
  }
  let key = "";
  if ((vorgabe().wetter ?? "leitwerk") === "leitwerk") {
    const echt = !!sim.settings.wetterEcht;
    const w = sim.wetterWerte();
    key = echt ? "echt" : `${w.lage}|${Math.round(w.wind / 10)}|${Math.round(w.richtung / 45)}`;
    const boden = Math.max(0, (d.hoehe - d.agl) / 3.28084);
    if (key !== xpAbgleich.wetterKey && xpPluginWetter() && !echt && xpAbgleich.wetterKey && xpAbgleich.wetterKey !== "echt") {
      // Wechsel im laufenden Flug: das Plugin setzt das neue Wetter (X-Plane blendet über 1–2 min ein; kein Ruckeln wie
      // beim Neuaufbau über PATCH /flight, und anders als die Region-Werte kommt es sicher an – Paul 11.11.)
      xpAbgleich.wetterKey = key;
      xpWx.dauer = 0;
      xpAbgleich.wetterText = `${WETTER_LABEL[w.lage]} – Wechsel über das Plugin (${wetterUebergang.min ? `${wetterUebergang.min} Spielminuten` : "sofort am Boden, in der Luft 1–2 min"})`;
      void xpLog(xpAbgleich.wetterText);
    } else if (key !== xpAbgleich.wetterKey) {
      const z = xpWerteJetzt();
      // Wechsel im laufenden Flug: sanft über die Region-Werte (X-Plane blendet selbst über 1–2 min ein)
      if (!echt && xpWx.ist && z && wetterUebergang.min > 0 && xpWx.regionGeht !== false && xpAbgleich.wetterKey && xpAbgleich.wetterKey !== "echt") {
        xpUebergangStarten(z, boden);
        xpAbgleich.wetterKey = key;
      } else {
        data.weather = echt ? "use_real_weather" : xpWetter(w, d.lat, d.lon, boden);
        xpWx.ist = echt ? null : z;
        xpWx.dauer = 0;
      }
    }
    if (xpWx.dauer > 0) void xpUebergangSchritt(boden);
  }
  if (!Object.keys(data).length) return;
  xpAbgleich.laeuft = true;
  try {
    await invoke("xplane_flug", { json: JSON.stringify({ data }) });
    const uhr = new Date(sim.state.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
    if (data.gmt_time) {
      xpAbgleich.zeitSim = sim.state.zeit;
      xpAbgleich.zeitReal = Date.now();
      xpAbgleich.zeitText = `Uhrzeit ${uhr} übernommen`;
    }
    if (data.weather) {
      xpAbgleich.wetterKey = key;
      if (!xpWx.geprueft) void xpRegionPruefen();
      xpAbgleich.wetterText = key === "echt" ? "Echtes Wetter (X-Plane: Real Weather)" : `${WETTER_LABEL[sim.wetterWerte().lage]} übernommen (${uhr})`;
    }
    xpAbgleich.fehler = "";
  } catch (e) {
    xpAbgleich.fehler = String((e as Error)?.message ?? e);
    xpAbgleich.pause = Date.now() + 60_000;
  } finally {
    xpAbgleich.laeuft = false;
    geaendert();
  }
}

/** Flugplan für X-Plane (Format „3 version“, lädt X-Plane 12 weiterhin): Start → Ziel als Koordinaten-Wegpunkte */
export function fmsText(von: { lat: number; lon: number; fuss: number }, nach: { lat: number; lon: number }): string {
  const vz = (x: number, n: number) => `${x < 0 ? "-" : "+"}${Math.abs(x).toFixed(3).padStart(n, "0")}`;
  const zeile = (lat: number, lon: number, fuss: number) => `28 ${vz(lat, 6)}_${vz(lon, 7)} ${Math.round(fuss).toFixed(6)} ${lat.toFixed(6)} ${lon.toFixed(6)}`;
  return ["I", "3 version", "1", "1", zeile(von.lat, von.lon, von.fuss), zeile(nach.lat, nach.lon, 0), ""].join("\r\n");
}

/** Spieler fliegt mit X-Plane: Flugplan „Leitwerk“ zum aktuellen Ziel in Output/FMS plans legen (überschreibt den alten) */
export function xplaneFlugplanBereitlegen(fz: SimFahrzeug, ziel: { lat: number; lon: number; name: string; art: "bo" | "kh" } | null): void {
  if (!inTauri() || flugsim.quelle !== "xplane" || !ziel) return;
  const key = `${fz.id}|${ziel.art}|${ziel.lat.toFixed(5)},${ziel.lon.toFixed(5)}`;
  if (key === xpAbgleich.fmsZiel) return;
  xpAbgleich.fmsZiel = key;
  const fuss = flugsim.daten && datenFrisch() ? flugsim.daten.hoehe : 0;
  // GTN 750/650 (Reality XP): Leitwerk.gfp im FPLN-Ordner des Garmin-Trainers
  void invoke<string[]>("gtn_gfp", { inhalt: gfpText({ lat: fz.lat, lon: fz.lon }, ziel) })
    .then((p) => { xpAbgleich.gfp = p.length ? "GTN: Flugplan „Leitwerk“ bereit (Flight Plan → Menu → Catalog → Import)" : ""; })
    .catch(() => undefined);
  void invoke<string | null>("xplane_fms", { inhalt: fmsText({ lat: fz.lat, lon: fz.lon, fuss }, ziel) })
    .then((pfad) => {
      if (!pfad) {
        xpAbgleich.fmsFehler = "X-Plane-Ordner nicht gefunden – Flugplan über „Flugplan speichern“ selbst ablegen.";
        geaendert();
        return;
      }
      xpAbgleich.fmsFehler = "";
      xpAbgleich.fms = `„Leitwerk“ zum ${ziel.art === "bo" ? "Einsatzort" : ziel.name}`;
      toast(`X-Plane: Flugplan „Leitwerk“ zum ${ziel.art === "bo" ? "Einsatzort" : ziel.name} bereit – im GPS/FMS laden`);
      geaendert();
    })
    .catch((e) => {
      xpAbgleich.fmsFehler = String((e as Error)?.message ?? e);
      xpAbgleich.fmsZiel = "";
      geaendert();
    });
}

// ------------------------------------------------------------------ X-Plane-Plugin „LeitWerk“ (Tablet, auch in VR)

interface PluginStand {
  ordner: string | null;
  aktuell: boolean;
  neu: boolean;
  neustart: boolean;
  mitgeliefert: boolean;
  version: string;
  fehler: string | null;
}

/** Stand des X-Plane-Plugins: eingebaut? und Lebenszeichen aus X-Plane (alle 10 s, „xp:plugin:…“) */
export const xpPlugin = {
  stand: null as PluginStand | null,
  meldung: null as {
    version: string;
    vr: boolean;
    sichtbar: boolean;
    zeit: number;
    /** X-Plane kann eigene Cockpit-Geräte (ab 12.1) / Wetter von Plugins (ab 12.3) */
    geraete: boolean;
    wetter: boolean;
    /** im geladenen Flugzeug eingebaut: MFD, Klapp-Tablet, Funkgerät */
    cockpit: string[];
    /** Stand des Wetters im Plugin („-“, „gesetzt“, „wechsel 40%“, „echt“) */
    wetterStand: string;
  } | null,
};

/** Plugin in X-Plane prüfen und (wenn eingeschaltet) einbauen bzw. erneuern – still, meldet nur Neues */
export async function xplanePluginPruefen(einbauen = vorgabe().xpPlugin !== false, laut = false): Promise<void> {
  if (!inTauri()) return;
  try {
    const st = await invoke<PluginStand>("xplane_plugin", { einbauen, entfernen: null });
    xpPlugin.stand = st;
    if (st.fehler) toast(st.fehler, "error");
    else if (st.neu) toast(st.neustart ? "X-Plane: Tablet-Plugin „LeitWerk“ erneuert – wirkt nach dem nächsten Start von X-Plane" : "X-Plane: Tablet-Plugin „LeitWerk“ eingebaut – in X-Plane unter Plugins › LeitWerk");
    else if (laut && !st.ordner) toast("X-Plane 12 nicht gefunden (x-plane_install_12.txt)", "error");
    else if (laut && !st.mitgeliefert) toast("In dieser Version ist das X-Plane-Plugin nicht dabei", "error");
    else if (laut && st.aktuell) toast("X-Plane: Tablet-Plugin ist aktuell");
  } catch (e) {
    console.warn("X-Plane-Plugin", e);
  }
}

/** Plugin aus X-Plane entfernen (und nicht mehr automatisch einbauen) */
export async function xplanePluginEntfernen(): Promise<void> {
  vorgabeSetzen({ xpPlugin: false });
  if (!inTauri()) return;
  try {
    const st = await invoke<PluginStand>("xplane_plugin", { einbauen: false, entfernen: true });
    xpPlugin.stand = st;
    toast(st.neustart ? "X-Plane: Tablet-Plugin entfernt – ab dem nächsten Start von X-Plane" : "X-Plane: Tablet-Plugin entfernt");
  } catch (e) {
    toast(`X-Plane-Plugin: ${String((e as Error)?.message ?? e)}`, "error");
  }
}

/** Lebenszeichen des Plugins: „xp:plugin:<version>:<vr|2d>:<an|aus>“ */
export function xpPluginMeldung(text: string): void {
  const t = text.split(":");
  if (t[1] !== "plugin") return;
  // xp:plugin:<version>:<vr|2d>:<an|aus>[:<kann>:<cockpit>:<wetter>] (ab Plugin 0.2)
  const kann = (t[5] ?? "").split(",");
  xpPlugin.meldung = {
    version: t[2] ?? "",
    vr: t[3] === "vr",
    sichtbar: t[4] === "an",
    zeit: Date.now(),
    geraete: kann.includes("geraete"),
    wetter: kann.includes("wetter"),
    cockpit: (t[6] ?? "").split(",").filter(Boolean),
    wetterStand: t[7] ?? "",
  };
}

// ------------------------------------------------------------------ EC135 (Rotorsim): LeitWerk im Cockpit
/** Stand des Einbaus je EC135-Ordner in X-Plane (Rust ec135.rs) */
export type Ec135Flugzeug = { ordner: string; name: string; zustand: "original" | "eingebaut" | "veraendert"; teile: string[]; hinweis: string; aktuell: boolean; vorschlag: boolean };
export type Ec135Stand = { xplane: boolean; flugzeuge: Ec135Flugzeug[]; meldung: string; fehler: string };
export const ec135 = { stand: null as Ec135Stand | null, laeuft: false };

/**
 * EC135 im X-Plane-Ordner prüfen bzw. LeitWerk einbauen/entfernen: linkes MFD (statt EuroNav, solange LeitWerk läuft),
 * Kachel und App auf dem Klapp-Tablet (AviTab), TETRA-Funkgerät. Ohne ordner: alle gefundenen EC135.
 */
export async function ec135Cockpit(aktion: "pruefen" | "einbauen" | "aktualisieren" | "entfernen", ordner?: string): Promise<void> {
  if (!inTauri() || ec135.laeuft) return;
  ec135.laeuft = true;
  try {
    const st = await invoke<Ec135Stand>("ec135_cockpit", { aktion, ordner: ordner ?? null });
    ec135.stand = st;
    if (st.fehler) toast(`EC135: ${st.fehler}`, "error");
    else if (st.meldung) toast(`EC135: ${st.meldung.replace(/\n/g, " · ")} – wirkt beim nächsten Laden des Hubschraubers`);
  } catch (e) {
    toast(`EC135: ${String((e as Error)?.message ?? e)}`, "error");
  } finally {
    ec135.laeuft = false;
    geaendert();
  }
}

/** Plugin meldet sich gerade (letzte 25 s) */
export function xpPluginDa(): boolean {
  return !!xpPlugin.meldung && Date.now() - xpPlugin.meldung.zeit < 25000;
}

/** Das Plugin setzt das Wetter selbst (X-Plane 12.3+): sanft, ohne Neuaufbau – LeitWerk schickt nur noch den Anfang */
export function xpPluginWetter(): boolean {
  return xpPluginDa() && !!xpPlugin.meldung?.wetter;
}

export function xpZeitUmschalten(an: boolean): void {
  vorgabeSetzen({ xpZeit: an });
  xpAbgleich.zeitSim = 0;
  geaendert();
}

// ------------------------------------------------------------------ MSFS 2024: Wetter und Uhrzeit über die EFB-App

/**
 * Wetter von LeitWerk für MSFS. Die EFB-App (tools/efb-app) liest es aus /stand (neu.wx) und setzt es über die
 * Wetter-Schnittstelle des Simulators (JS_LISTENER_WEATHER, UpdateTempWeatherPreset). Höhen über Grund (m),
 * Wind in Knoten, Temperatur °C, Druck hPa, Niederschlag mm/h. null = Pilot stellt das Wetter selbst ein.
 */
/** Wie lange ein Wetterwechsel im Flugsimulator dauert (Spielminuten): Standard 10; wählbar im Wetter-Dialog und im Testmenü */
export const wetterUebergang = {
  get min(): number {
    return vorgabe().wxUeb ?? 10;
  },
  set min(m: number) {
    vorgabeSetzen({ wxUeb: m });
  },
  get wolken(): "bedeckung" | "dichte" {
    return vorgabe().wxWolken ?? "bedeckung";
  },
  set wolken(w: "bedeckung" | "dichte") {
    vorgabeSetzen({ wxWolken: w });
  },
};

export function msfsWetter(): Record<string, unknown> | null {
  const zeit = vorgabe().xpZeit !== false ? sim.state.zeit : null;
  // jetzt = Spielzeit (auch ohne Uhrzeit-Übernahme: der Wetterübergang läuft in Spielzeit, also mit dem Zeitraffer)
  const basis = { zeit, jetzt: sim.state.zeit, tempo: sim.wirksamesTempo(), ueb: wetterUebergang.min, wolkenModus: wetterUebergang.wolken };
  if ((vorgabe().wetter ?? "leitwerk") !== "leitwerk") return zeit ? { ...basis, nurZeit: true } : null;
  if (sim.settings.wetterEcht) return { ...basis, echt: true };
  const w = sim.wetterWerte();
  const i = LAGE[w.lage];
  const nass = i.art === "regen" || i.art === "schnee" || i.art === "eis";
  const wolken: XpWolke[] = [];
  if (w.lage === "nebel") wolken.push({ ab: 0, bis: 180, dichte: 1, bedeckung: 1, typ: "stratus" });
  else if (w.lage === "hochnebel") wolken.push({ ab: 150, bis: 700, dichte: 1, bedeckung: 1, typ: "stratus" });
  else if (i.art === "gewitter") {
    wolken.push({ ab: 900, bis: 9000, dichte: 1, bedeckung: 0.8, typ: "cb" });
  } else if (i.wolken > 0) {
    const flach = i.wolken >= 0.85 || nass;
    wolken.push({ ab: nass ? 450 : flach ? 750 : 1200, bis: nass ? 1800 : flach ? 1700 : 2100, dichte: nass ? 0.9 : 0.7, bedeckung: i.wolken, typ: flach ? "stratus" : "cumulus" });
  }
  const regen = { niesel: 0.5, leichter_regen: 1.5, regen: 4, starkregen: 15, gewitter: 10, hagel: 20, unwetter: 30, schneeregen: 3, leichter_schnee: 1, schnee: 3, starker_schnee: 8, eisregen: 3 } as Partial<Record<WetterLage, number>>;
  return {
    ...basis,
    lage: w.lage,
    text: WETTER_LABEL[w.lage],
    temp: Math.round(w.temp),
    druck: Math.round(w.druck),
    sicht: w.sicht,
    wind: Math.round(w.wind / 1.852),
    boe: Math.round(Math.max(0, w.boeen - w.wind) / 1.852),
    richtung: Math.round(w.richtung),
    regen: regen[w.lage] ?? 0,
    art: i.art === "schnee" ? "SNOW" : w.lage === "hagel" ? "HAIL" : "RAIN",
    schnee: i.art === "schnee" ? (w.lage === "starker_schnee" ? 0.15 : 0.05) : 0,
    gewitter: i.art === "gewitter" ? (w.lage === "gewitter" ? 0.5 : 0.9) : 0,
    wolken,
  };
}

/** Rückmeldungen der EFB-App zum Wetter (Test): werden angezeigt und in msfs-wetter-test.json gespeichert */
export const msfsWetterStand = { text: "", meldungen: [] as { t: string; zeit: string }[] };

export async function msfsWetterMeldung(roh: string): Promise<void> {
  const t = roh.replace(/^wx:/, "");
  msfsWetterStand.meldungen.push({ t, zeit: new Date().toISOString() });
  if (msfsWetterStand.meldungen.length > 200) msfsWetterStand.meldungen.splice(0, 50);
  const kurz = t.split("|")[0];
  if (!kurz.startsWith("daten")) msfsWetterStand.text = kurz.slice(0, 160);
  geaendert();
  if (!inTauri()) return;
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const pfad = await join(await appDataDir(), "msfs-wetter-test.json");
    await invoke("write_text_file", { path: pfad, content: JSON.stringify(msfsWetterStand.meldungen, null, 1) });
  } catch {
    /* nur Test */
  }
}

// ------------------------------------------------------------------ X-Plane 12: sanfter Wetterwechsel (Region-Datarefs)

/**
 * X-Plane blendet Änderungen an sim/weather/region/* selbst über 1–2 Minuten ein (Wolken etwa 1 min).
 * Dazu wie in MSFS kleine Schritte über die Wechseldauer (Spielzeit). Wolkenschichten behalten ihre Höhe:
 * gleiche Höhe → am selben Platz ändern, sonst alte Schicht ausblenden und neue auf freiem Platz einblenden.
 * Beim Beitreten (und wenn Region-Werte fehlen) wird das Wetter weiter über PATCH /flight sofort gesetzt.
 * Test: Liste der Region-Werte, ihre Startwerte und Fehler gehen in xplane-wetter-test.json.
 */
export type XpWolke = { ab: number; bis: number; dichte: number; bedeckung: number; typ?: "stratus" | "cumulus" | "cb" };
type XpWerte = { temp: number; druck: number; regen: number; gewitter: number; sicht: number; wind: number; boe: number; richtung: number; wolken: (XpWolke | null)[] };
const XR = "sim/weather/region/";
const xpWx = {
  ist: null as XpWerte | null,
  von: null as XpWerte | null,
  ziel: null as XpWerte | null,
  plan: [] as ({ von: XpWolke | null; nach: XpWolke | null } | null)[],
  start: 0,
  dauer: 0,
  letzt: 0,
  geprueft: false,
  regionGeht: undefined as boolean | undefined,
  windHoehen: [] as number[],
  log: [] as { t: string; zeit: string }[],
};

async function xpLog(t: string): Promise<void> {
  xpWx.log.push({ t, zeit: new Date().toISOString() });
  if (xpWx.log.length > 200) xpWx.log.splice(0, 50);
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    await invoke("write_text_file", { path: await join(await appDataDir(), "xplane-wetter-test.json"), content: JSON.stringify(xpWx.log, null, 1) });
  } catch {
    /* nur Test */
  }
}

function xpWerteJetzt(): XpWerte | null {
  const m = msfsWetter() as (Record<string, unknown> & { wolken?: XpWolke[] }) | null;
  if (!m || m.echt || m.nurZeit) return null;
  const w = (m.wolken ?? []).slice(0, 3);
  return {
    temp: m.temp as number, druck: m.druck as number, regen: m.regen as number, gewitter: m.gewitter as number, sicht: m.sicht as number,
    wind: m.wind as number, boe: m.boe as number, richtung: m.richtung as number,
    wolken: [w[0] ?? null, w[1] ?? null, w[2] ?? null],
  };
}

/** Einmal je Verbindung: welche Region-Werte gibt es, was steht drin (Einheiten prüfen) */
async function xpRegionPruefen(): Promise<void> {
  xpWx.geprueft = true;
  try {
    const liste = await invoke<string[]>("xplane_suchen", { anfang: XR });
    await xpLog(`Region-Werte in X-Plane (${liste.length}): ${liste.join("; ")}`);
    const namen = ["cloud_coverage_percent", "cloud_base_msl_m", "cloud_tops_msl_m", "cloud_type", "visibility_reported_sm", "rain_percent", "thunderstorm_percent", "sealevel_pressure_pas", "sealevel_temperature_c", "wind_altitude_msl_m", "wind_speed_msc", "wind_direction_degt", "update_immediately", "change_mode"].map((n) => XR + n);
    const werte = await invoke<Record<string, unknown>>("xplane_lesen", { namen });
    await xpLog(`Startwerte: ${JSON.stringify(werte)}`);
    const alt = werte[XR + "wind_altitude_msl_m"];
    xpWx.windHoehen = Array.isArray(alt) ? (alt as number[]) : [];
    const kern = ["cloud_coverage_percent", "cloud_base_msl_m", "cloud_tops_msl_m", "visibility_reported_sm"].map((n) => XR + n);
    xpWx.regionGeht = kern.every((n) => n in werte);
    if (!xpWx.regionGeht) await xpLog("Region-Werte fehlen – Wetterwechsel weiter sofort (über PATCH /flight)");
  } catch (e) {
    await xpLog(`Prüfen fehlgeschlagen: ${String((e as Error)?.message ?? e)}`);
  }
}

function xpUebergangStarten(z: XpWerte, _boden: number): void {
  const von = xpWx.ist!;
  xpWx.plan = wolkenPlan(von.wolken, z.wolken);
  xpWx.von = von;
  xpWx.ziel = { ...z, wolken: xpWx.plan.map((p) => p?.nach ?? null) };
  xpWx.start = sim.state.zeit;
  xpWx.dauer = wetterUebergang.min * 60_000;
  xpWx.letzt = 0;
  xpAbgleich.wetterText = `Wechsel zu ${WETTER_LABEL[sim.wetterWerte().lage]} läuft (${wetterUebergang.min} Spielminuten)`;
  void xpLog(xpAbgleich.wetterText);
}

function wolkenPlan(V: (XpWolke | null)[], Z: (XpWolke | null)[]): ({ von: XpWolke | null; nach: XpWolke | null } | null)[] {
  const plan: ({ von: XpWolke | null; nach: XpWolke | null } | null)[] = [null, null, null];
  const gleich = (a: XpWolke, b: XpWolke) => Math.abs(a.ab - b.ab) < 1 && Math.abs(a.bis - b.bis) < 1;
  V.forEach((v, i) => { if (v) plan[i] = { von: v, nach: null }; });
  const offen: XpWolke[] = [];
  for (const z of Z) {
    if (!z) continue;
    const i = plan.findIndex((p) => p && p.von && !p.nach && gleich(p.von, z));
    if (i >= 0) plan[i]!.nach = z;
    else offen.push(z);
  }
  for (const z of offen) {
    let i = plan.findIndex((p) => !p);
    if (i < 0) i = plan.findIndex((p) => p && !p.nach);
    if (i < 0) break;
    plan[i] = { von: null, nach: z };
  }
  return plan;
}

const weich = (f: number) => f * f * (3 - 2 * f);
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

function xpMischen(a: XpWerte, b: XpWerte, f: number): XpWerte {
  const d = ((b.richtung - a.richtung + 540) % 360) - 180;
  const wolken = xpWx.plan.map((p) => {
    if (!p) return null;
    if (p.von && p.nach) return { ...p.nach, ab: p.von.ab, bis: p.von.bis, bedeckung: lerp(p.von.bedeckung, p.nach.bedeckung, f) };
    const L = (p.von ?? p.nach)!;
    return { ...L, bedeckung: L.bedeckung * (p.von ? 1 - f : f) };
  });
  return {
    temp: lerp(a.temp, b.temp, f), druck: lerp(a.druck, b.druck, f), regen: lerp(a.regen, b.regen, f), gewitter: lerp(a.gewitter, b.gewitter, f),
    sicht: lerp(a.sicht, b.sicht, f), wind: lerp(a.wind, b.wind, f), boe: lerp(a.boe, b.boe, f), richtung: (a.richtung + d * f + 360) % 360, wolken,
  };
}

/** Ein Schritt des Übergangs: höchstens alle 20 s echter Zeit (X-Plane blendet dazwischen selbst ein) */
async function xpUebergangSchritt(boden: number): Promise<void> {
  if (!xpWx.von || !xpWx.ziel || Date.now() - xpWx.letzt < 20_000) return;
  xpWx.letzt = Date.now();
  const f = Math.max(0, Math.min(1, (sim.state.zeit - xpWx.start) / xpWx.dauer));
  const w = f >= 1 ? xpWx.ziel : xpMischen(xpWx.von, xpWx.ziel, weich(f));
  const TYP = { stratus: 1, cumulus: 2, cb: 3 } as const;
  const werte: [string, number | null, number][] = [[XR + "update_immediately", null, 0]];
  w.wolken.forEach((L, i) => {
    werte.push([XR + "cloud_coverage_percent", i, L ? Math.max(0, Math.min(1, L.bedeckung)) : 0]);
    if (L) {
      werte.push([XR + "cloud_base_msl_m", i, Math.round(boden + L.ab)], [XR + "cloud_tops_msl_m", i, Math.round(boden + L.bis)]);
      if (L.typ) werte.push([XR + "cloud_type", i, TYP[L.typ]]);
    }
  });
  werte.push(
    [XR + "visibility_reported_sm", null, +(w.sicht / 1.609).toFixed(2)],
    [XR + "rain_percent", null, +Math.min(1, w.regen / 15).toFixed(3)],
    [XR + "thunderstorm_percent", null, +w.gewitter.toFixed(3)],
    [XR + "sealevel_pressure_pas", null, Math.round(w.druck * 100)],
    [XR + "sealevel_temperature_c", null, +w.temp.toFixed(1)],
  );
  xpWx.windHoehen.forEach((h, i) => {
    const ueber = h - boden;
    if (ueber > 3000) return;
    werte.push([XR + "wind_speed_msc", i, +(w.wind * 0.514444 * (1 + 0.3 * Math.max(0, ueber) / 3000)).toFixed(2)], [XR + "wind_direction_degt", i, Math.round(w.richtung)]);
  });
  try {
    const fehler = await invoke<string[]>("xplane_schreiben", { werte });
    xpWx.ist = w;
    if (fehler.length) await xpLog(`Schritt ${Math.round(f * 100)} %: ${fehler.length} Fehler – ${fehler.slice(0, 6).join(" | ")}`);
    if (f >= 1) {
      xpWx.dauer = 0;
      xpAbgleich.wetterText = `${WETTER_LABEL[sim.wetterWerte().lage]} übernommen (sanfter Wechsel)`;
      await xpLog(xpAbgleich.wetterText);
      geaendert();
    }
  } catch (e) {
    xpAbgleich.fehler = String((e as Error)?.message ?? e);
    geaendert();
  }
}

/** Flugplan für das GTN 750/650 (Garmin .gfp, eine Zeile): Start → Ziel als Koordinaten (Grad + Zehntelminuten) */
export function gfpText(von: { lat: number; lon: number }, nach: { lat: number; lon: number }): string {
  const teil = (x: number, gradStellen: number, plus: string, minus: string) => {
    const a = Math.abs(x);
    let g = Math.floor(a);
    let m = Math.round((a - g) * 600);
    if (m >= 600) { g += 1; m -= 600; }
    return `${x < 0 ? minus : plus}${String(g).padStart(gradStellen, "0")}${String(m).padStart(3, "0")}`;
  };
  const k = (p: { lat: number; lon: number }) => `${teil(p.lat, 2, "N", "S")}${teil(p.lon, 3, "E", "W")}`;
  return `FPN/RI:F:${k(von)}:F:${k(nach)}`;
}
