/**
 * Beta 66 (Paul 18.11.2026): MSFS über SimConnect (msfs.rs)
 *  - Uhrzeit von LeitWerk setzen (zusätzlich zur EFB-App) – mit Rückmeldung, ob MSFS sie übernommen hat
 *  - Fahrzeuge am Einsatzort: Modelle der installierten Pakete (Standard und kostenlose Pakete auf flightsim.to)
 *    stehen mit Blaulicht dort, wo die Fahrzeuge des Einsatzes im Spiel stehen; Trage beim Patienten ab Alarm.
 *    Großeinsatz: wenige im Bereitstellungsraum, die meisten am Einsatzort. Weg, sobald das Fahrzeug abfährt,
 *    sonst am Ende des Einsatzes.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "../../platform";
import { sim, type Einsatz, type SimFahrzeug } from "../../sim/engine";
import { distanceM } from "../../sim/geo";

/** Download-Seiten der kostenlosen Fahrzeug-Pakete (jeder installiert selbst) */
export const PROP_PAKETE = [
  { t: "German Emergency Vehicle Pack", url: "https://flightsim.to/addon/27286/german-emergency-vehicle-pack" },
  { t: "H145 Action Pack Vehicles DE", url: "https://flightsim.to/addon/42133/h145-action-pack-vehicles-de" },
];

const SCHLUESSEL = "leitwerk.pilot.msfsExtra";
type Vorgabe = { props?: boolean };
function vorgabe(): Vorgabe {
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

// ------------------------------------------------------------------ Uhrzeit

export const msfsZeit = {
  ist: null as { zulu: number; tag: number; jahr: number; abs: number; um: number } | null,
  gesetzt: 0,
  versuche: 0,
  text: "",
  ausnahmen: [] as number[],
};

const hhmm = (sek: number): string => {
  const s = ((Math.round(sek) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

/** Abweichung in Minuten (über Mitternacht hinweg) */
function abweichungMin(ist: number, soll: number): number {
  const d = Math.abs(ist - soll) % 86400;
  return Math.min(d, 86400 - d) / 60;
}

function zeitAbgleich(an: boolean, verbunden: boolean): void {
  if (!an || !verbunden) {
    msfsZeit.versuche = 0;
    return;
  }
  const z = msfsZeit.ist;
  if (!z || Date.now() - z.um > 5000) return;
  const soll = sim.state.zeit / 1000;
  const sollTag = soll % 86400;
  const ab = abweichungMin(z.zulu, sollTag);
  const tagSoll = new Date(sim.state.zeit);
  const tagFalsch = z.jahr > 0 && z.jahr !== tagSoll.getUTCFullYear();
  if (ab <= 2 && !tagFalsch) {
    if (msfsZeit.versuche) msfsZeit.text = `Uhrzeit von LeitWerk übernommen – MSFS ${hhmm(z.zulu)} UTC.`;
    else if (!msfsZeit.text) msfsZeit.text = `Uhrzeit stimmt – MSFS ${hhmm(z.zulu)} UTC.`;
    msfsZeit.versuche = 0;
    return;
  }
  // nicht öfter als alle 20 s; nach drei erfolglosen Versuchen nur noch alle 5 Minuten
  const pause = msfsZeit.versuche >= 3 ? 300_000 : 20_000;
  if (Date.now() - msfsZeit.gesetzt < pause) return;
  if (msfsZeit.versuche >= 3)
    msfsZeit.text = `MSFS übernimmt die Uhrzeit nicht – zeigt ${hhmm(z.zulu)} UTC statt ${hhmm(sollTag)} UTC. Im MSFS „Live-Zeit“ bzw. Live-Wetter ausschalten; LeitWerk versucht es alle 5 Minuten.`;
  msfsZeit.versuche++;
  msfsZeit.gesetzt = Date.now();
  void invoke("msfs_zeit_setzen", { ms: sim.state.zeit }).catch(() => undefined);
}

// ------------------------------------------------------------------ Fahrzeuge am Einsatzort

type Kat = "rtw" | "nef" | "patient" | "polizei" | "feuerwehr";
export const msfsProps = {
  titel: [] as string[],
  quelleText: "",
  aktiv: new Map<string, { titel: string; lat: number; lon: number }>(),
  meldung: "",
  fehler: 0,
  gesucht: false,
  testBis: 0,
};

const WAHL: Record<Kat, { ja: RegExp; nein?: RegExp }> = {
  rtw: { ja: /ambulan|rtw|ktw|krankenwagen|rettungswagen|\bems\b|drk|asb|brk|samarit|johanniter|malteser|rescue|medic/i, nein: /notarzt|\bnef\b|doctor|arzt|gurney|stretcher|trage|spine|heli|h145|ec135/i },
  nef: { ja: /notarzt|\bnef\b|doctor|arzt/i, nein: /heli|h145|ec135|gurney|trage/i },
  patient: { ja: /gurney|stretcher|trage|spine/i },
  polizei: { ja: /police|polizei/i, nein: /heli|h145|ec135/i },
  feuerwehr: { ja: /fire.?truck|feuerwehr|firetruck|\bfire\b/i, nein: /heli|h145|ec135|flare|smoke|rauch|feuer.?effekt/i },
};

/** bestes Modell für eine Art: Blaulicht/Einsatz-Variante bevorzugt */
export function propTitel(kat: Kat, titel: string[] = msfsProps.titel): string | null {
  const w = WAHL[kat];
  const k = titel.filter((t) => w.ja.test(t) && !(w.nein && w.nein.test(t)));
  if (!k.length) return kat === "nef" ? propTitel("rtw", titel) : null;
  const punkte = (t: string) => (/emergency|blaulicht|blue|lights? on|einsatz|alarm|siren/i.test(t) ? 3 : 0) + (/park|static|off\b|aus\b/i.test(t) ? -2 : 0) + (/low.?poly/i.test(t) ? 1 : 0);
  return [...k].sort((a, b) => punkte(b) - punkte(a) || a.localeCompare(b))[0];
}

function peil(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return ((Math.atan2(y, x) / r) % 360 + 360) % 360;
}

/** Punkt in Richtung kurs (Grad) im Abstand m */
function versetzt(p: { lat: number; lon: number }, kurs: number, m: number): { lat: number; lon: number } {
  const r = Math.PI / 180;
  return { lat: p.lat + (m * Math.cos(kurs * r)) / 111_320, lon: p.lon + (m * Math.sin(kurs * r)) / (111_320 * Math.cos(p.lat * r)) };
}

type Soll = { id: string; titel: string; lat: number; lon: number; kurs: number };

/** Was jetzt im MSFS stehen soll (höchstens 6 am Einsatzort, 2 im Bereitstellungsraum, 1 Trage) */
export function propsSoll(fz: SimFahrzeug | undefined, e: Einsatz | undefined, mit: SimFahrzeug[], br: { lat: number; lon: number } | null): Soll[] {
  if (!fz || !e) return [];
  const out: Soll[] = [];
  const pat = { lat: e.wahr.lat, lon: e.wahr.lon };
  const ganz = e.zustand === "abgeschlossen";
  if (ganz) return [];
  // Trage beim Patienten ab Alarm (nicht im Großeinsatz: da ist der Ort weit verteilt)
  const trage = propTitel("patient");
  if (trage && !e.gs && !e.gsKind && Number.isFinite(pat.lat)) out.push({ id: `pat:${e.id}`, titel: trage, lat: pat.lat, lon: pat.lon, kurs: 0 });
  const amBo = mit
    .filter((x) => x.kategorie !== "NAH" && x.rmTyp !== "NAH" && !x.pilot && ["vorOrt", "warteKH", "suche"].includes(x.phase) && x.status === "amBO")
    .sort((a, b) => (a.vorOrtSeit ?? 0) - (b.vorOrtSeit ?? 0))
    .slice(0, 6);
  const imBr = br ? mit.filter((x) => x.phase === "wartetBR" && !x.pilot && x.kategorie !== "NAH").slice(0, 2) : [];
  // nicht aufeinander: wer zu nah an der Trage oder an einem anderen Fahrzeug steht, rückt ein Stück zur Seite
  const belegt: { lat: number; lon: number }[] = out.map((x) => ({ lat: x.lat, lon: x.lon }));
  let i = 0;
  for (const x of [...amBo, ...imBr]) {
    const kat: Kat = x.kategorie === "NEF" || x.rmTyp === "NEF" || x.rmTyp === "ACN" ? "nef" : "rtw";
    const t = propTitel(kat);
    if (!t) continue;
    const ziel = x.phase === "wartetBR" ? (br ?? pat) : pat;
    let p = x.fuss?.park ?? { lat: x.lat, lon: x.lon };
    for (let k = 0; k < 12 && belegt.some((b) => distanceM(b, p) < 9); k++) p = versetzt(ziel, (200 + (i + k) * 47) % 360, 14 + 6 * Math.floor((i + k) / 6));
    belegt.push(p);
    i++;
    const m = distanceM(p, ziel);
    out.push({ id: `fz:${x.id}`, titel: t, lat: p.lat, lon: p.lon, kurs: m > 3 ? peil(p, ziel) : 0 });
  }
  return out;
}

let letzterAbgleich = 0;
let hoertZu = false;
let neuZeichnen: () => void = () => {};

async function zuhoeren(): Promise<void> {
  if (hoertZu || !inTauri()) return;
  hoertZu = true;
  await listen<{ zulu: number; tag: number; jahr: number; abs: number }>("msfs-zeit", (ev) => {
    msfsZeit.ist = { ...ev.payload, um: Date.now() };
  });
  await listen<string>("msfs-zeit-gesetzt", (ev) => {
    msfsZeit.text = `Uhrzeit an MSFS geschickt: ${ev.payload} – warte auf die Bestätigung …`;
    neuZeichnen();
  });
  await listen<number>("msfs-ausnahme", (ev) => {
    msfsZeit.ausnahmen.push(Number(ev.payload));
    if (msfsZeit.ausnahmen.length > 20) msfsZeit.ausnahmen.shift();
  });
  await listen<[string[], string]>("msfs-props-liste", (ev) => {
    const [l, text] = ev.payload;
    for (const t of l) if (!msfsProps.titel.includes(t)) msfsProps.titel.push(t);
    msfsProps.quelleText = text || `MSFS meldet ${l.length} passende Modelle.`;
    neuZeichnen();
  });
  await listen<{ id: string; ok: boolean; text: string }>("msfs-prop", (ev) => {
    const p = ev.payload;
    if (!p.ok) {
      msfsProps.aktiv.delete(p.id);
      msfsProps.fehler++;
      msfsProps.meldung = p.text;
      // dieses Modell nicht mehr verwenden
      const m = /„(.+)“/.exec(p.text);
      if (m) msfsProps.titel = msfsProps.titel.filter((t) => t !== m[1]);
    } else msfsProps.meldung = `Gesetzt: ${p.text}`;
    neuZeichnen();
  });
  // neue Verbindung: der Simulator kennt die alten Objekte nicht mehr
  await listen("msfs-props-neu", () => {
    msfsProps.aktiv.clear();
    msfsProps.gesucht = false;
  });
}

/** Modelle suchen: Community-Ordner (sofort) und die Liste vom Simulator (MSFS 2024) */
export async function propsSuchen(community?: string): Promise<void> {
  if (!inTauri()) return;
  try {
    const l = await invoke<string[]>("msfs_props_ordner", { community: community || null });
    for (const t of l) if (!msfsProps.titel.includes(t)) msfsProps.titel.push(t);
    if (!msfsProps.quelleText) msfsProps.quelleText = `${l.length} passende Modelle im Community-Ordner.`;
  } catch {
    /* egal */
  }
  await invoke("msfs_props_suchen").catch(() => undefined);
  msfsProps.gesucht = true;
  neuZeichnen();
}

export function propsAn(): boolean {
  return vorgabe().props !== false;
}
export function propsUmschalten(an: boolean): void {
  vorgabeSetzen({ props: an });
  if (!an) for (const id of [...msfsProps.aktiv.keys()]) weg(id);
  neuZeichnen();
}

function weg(id: string): void {
  msfsProps.aktiv.delete(id);
  void invoke("msfs_prop_weg", { id }).catch(() => undefined);
}

/** Test: ein Einsatzfahrzeug 40 m vor dem Hubschrauber (90 s) */
export function propsTest(pos: { lat: number; lon: number; kurs: number } | null): string {
  const t = propTitel("rtw") ?? propTitel("nef") ?? propTitel("polizei") ?? propTitel("feuerwehr");
  if (!t) return "Kein Modell gefunden – erst ein Paket installieren, MSFS neu starten, dann „Modelle suchen“.";
  if (!pos) return "Keine Position vom Simulator – bist du im Flug?";
  const p = versetzt(pos, pos.kurs, 40);
  msfsProps.aktiv.set("test", { titel: t, lat: p.lat, lon: p.lon });
  msfsProps.testBis = Date.now() + 90_000;
  void invoke("msfs_prop_setzen", { id: "test", titel: t, lat: p.lat, lon: p.lon, kurs: (pos.kurs + 90) % 360 }).catch(() => undefined);
  return `„${t}“ steht gleich 40 m vor dir (90 s).`;
}

/** Jede Sekunde aus dem Piloten-Interface: Uhrzeit und Fahrzeuge abgleichen */
export function msfsExtraTick(o: { verbunden: boolean; zeitAn: boolean; fz?: SimFahrzeug; e?: Einsatz; mit: SimFahrzeug[]; br: { lat: number; lon: number } | null; zeichnen: () => void }): void {
  if (!inTauri()) return;
  neuZeichnen = o.zeichnen;
  void zuhoeren();
  zeitAbgleich(o.zeitAn, o.verbunden);
  if (!o.verbunden) return;
  if (!msfsProps.gesucht) void propsSuchen();
  if (Date.now() - letzterAbgleich < 2000) return;
  letzterAbgleich = Date.now();
  if (msfsProps.testBis && Date.now() > msfsProps.testBis) {
    msfsProps.testBis = 0;
    weg("test");
  }
  const soll = propsAn() ? propsSoll(o.fz, o.e, o.mit, o.br) : [];
  const ids = new Set(soll.map((x) => x.id));
  for (const id of [...msfsProps.aktiv.keys()]) if (id !== "test" && !ids.has(id)) weg(id);
  for (const s of soll) {
    const a = msfsProps.aktiv.get(s.id);
    if (a && a.titel === s.titel && distanceM(a, s) < 25) continue;
    msfsProps.aktiv.set(s.id, { titel: s.titel, lat: s.lat, lon: s.lon });
    void invoke("msfs_prop_setzen", s).catch(() => undefined);
  }
}

/** Download-Seite öffnen (im Programm über den Browser des Systems) */
export function paketSeite(url: string): void {
  if (!inTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  void invoke("link_oeffnen", { url }).catch(() => void navigator.clipboard?.writeText(url));
}
