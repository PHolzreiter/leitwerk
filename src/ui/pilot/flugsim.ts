/**
 * Piloten-Interface: Verbindung zum Flugsimulator (MSFS 2024/2020 über SimConnect, Rust: msfs.rs),
 * Flugplan zum Laden in MSFS (.pln) und Wetter-Hilfe.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri, saveTextFile } from "../../platform";
import { sim, type SimFahrzeug } from "../../sim/engine";
import { LAGE, WETTER_LABEL, type WetterLage } from "../../sim/weather";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";

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
}
export function vorgabe(): Vorgabe {
  try {
    return JSON.parse(localStorage.getItem(SCHLUESSEL) ?? "{}") as Vorgabe;
  } catch {
    return {};
  }
}
function vorgabeSetzen(v: Partial<Vorgabe>): void {
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
};

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
    flugsim.zustand = ev.payload.zustand;
    flugsim.text = ev.payload.text;
    flugsim.dll = ev.payload.dll;
    geaendert();
  });
  await listen<SimDaten>("msfs-daten", (ev) => datenEmpfangen(ev.payload));
}

/** Flugdaten (auch vom Test-Simulator) – höchstens einmal pro Sekunde an den Host */
export function datenEmpfangen(d: SimDaten): void {
  flugsim.daten = d;
  flugsim.datenUm = Date.now();
  if (flugsim.zustand !== "verbunden") {
    flugsim.zustand = "verbunden";
    flugsim.text = "Mit dem Flugsimulator verbunden";
  }
  const fz = fzVon();
  const jetzt = Date.now();
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
    const pfad = await invoke<string>("msfs_starten", { dll: dll ?? vorgabe().dll ?? null });
    flugsim.dll = pfad;
    vorgabeSetzen({ auto: true, ...(dll ? { dll } : {}) });
  } catch (e) {
    flugsim.text = String((e as Error)?.message ?? e);
    if (flugsim.zustand === "aus") flugsim.zustand = "fehler";
  }
  geaendert();
}

export async function flugsimTrennen(): Promise<void> {
  vorgabeSetzen({ auto: false });
  if (inTauri()) await invoke("msfs_stoppen").catch(() => undefined);
  flugsim.zustand = "aus";
  flugsim.text = "";
  flugsim.daten = null;
  geaendert();
}

/** Programm schließt das Piloten-Interface: Verbindung beenden, Einstellung „automatisch“ bleibt */
export function flugsimBeenden(): void {
  if (inTauri()) void invoke("msfs_stoppen").catch(() => undefined);
  flugsim.zustand = "aus";
  flugsim.daten = null;
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
  const datei = ascii(`LeitWerk ${titel}`).replace(/[ .]+/g, "_");
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
        wahl === "selbst"
          ? `<p>Du stellst das Wetter im MSFS selbst ein. Achtung: Ob die Leitstelle dich wegen Wetter nicht alarmieren kann, richtet sich weiter nach dem Wetter in LeitWerk.</p>`
          : echt
            ? `<p>LeitWerk nutzt <b>echtes Wetter</b>. Im MSFS: <b>Wetter → Live-Wetter</b> einschalten.</p><p class="plt-leise">Beide holen das Wetter aus verschiedenen Quellen – meist ähnlich, aber z. B. die Wolkenuntergrenze kann abweichen.</p>`
            : `<p>LeitWerk würfelt das Wetter. Im MSFS: <b>Wetter → Voreinstellung</b> wählen:</p>
               <div class="plt-wetter-tipp">${esc(msfsVorgabe(w.lage))}</div>
               <p class="plt-leise">Wind im MSFS etwa ${Math.round(w.wind / 1.852)} kt aus ${Math.round(w.richtung)}°. Ändert sich das Wetter in LeitWerk, steht es oben im Interface – dann hier nachsehen.</p>`
      }`;
    body.querySelectorAll<HTMLButtonElement>("[data-w]").forEach((b) =>
      b.addEventListener("click", () => {
        vorgabeSetzen({ wetter: b.dataset.w as "leitwerk" | "selbst" });
        zeichnen();
      }),
    );
  };
  zeichnen();
  openDialog({ title: "Wetter für den Flugsimulator", body, actions: [{ label: "Fertig", kind: "primary" }] });
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
