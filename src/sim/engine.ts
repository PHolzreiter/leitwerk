/**
 * Simulationskern: Uhr, Fahrzeuge, Einsätze, Funkmeldungen.
 *
 * Der Zustand besteht nur aus einfachen Objekten, damit er später im Multiplayer
 * vom Host an die Mitspieler übertragen werden kann. Alle Eingriffe des Spielers
 * laufen über die öffentlichen Methoden (alarmieren, Adresse setzen, …).
 */
import { HOSPITAL_FLAG_LABEL, type Hospital, type HospitalFlag, type Vehicle } from "../data/model";
import { store } from "../data/store";
import { abteilungFuer, allCodes, findCode, hasCodes, type Einsatzcode } from "./codes";
import { distanceM, flightRoute, randomAddresses, route, searchAddress, travelTimes, type LatLon, type Route } from "./geo";
import { generiereBesetzung, hatNFS, rmTypVon, type Platz, type RmTyp } from "./crew";
import { defaultStufeFuer, raenge, type Kategorie, type Settings, type StatusKey, type StufeDef } from "./settings";
import { flugverbot, istNacht, nextWetter, type Wetter, WETTER_LABEL } from "./weather";
import { bestimmeCode, fallZiehen, kapitelVonCode, wahrheitFuer, type Antworten, type Schema } from "../abfrage/schema";
import { anruferWaehlen, type Anrufer } from "../abfrage/anrufer";

const MIN = 60_000;

export interface Ort extends LatLon {
  label: string;
}

/** Fahrt entlang einer Route; times sind bereits auf Sondersignal umgerechnet. */
interface Fahrt {
  coords: [number, number][];
  times: number[];
  start: number;
  dauer: number;
}

export type Phase =
  | "frei"
  | "ausruecken"
  | "anfahrt"
  | "suche"
  | "vorOrt"
  | "warteKH"
  | "transport"
  | "uebergabe"
  | "rueckfahrt"
  | "routing";

export interface SimFahrzeug {
  id: string;
  funkrufname: string;
  kurzname: string;
  kategorie: Vehicle["kategorie"];
  /** Rettungsmitteltyp (RTW-C, RTW, KTW, NEF, NAH) */
  rmTyp: RmTyp;
  besetzung: Platz[];
  stationId: string;
  stationName: string;
  heim: LatLon;
  lat: number;
  lon: number;
  status: StatusKey;
  phase: Phase;
  phaseEnde: number | null;
  einsatzId: string | null;
  fahrt: Fahrt | null;
  nachtflug: boolean;
  /** begleitet den Transport (NEF/NAH bei kritischen Einsätzen) */
  begleitet: boolean;
}

export interface Vorschlag {
  fz: SimFahrzeug;
  /** Zeit bis zum Eintreffen inkl. Ausrücken (s), null = nicht erreichbar */
  sekunden: number | null;
  hinweis: string | null;
}

export interface Protokoll {
  zeit: number;
  text: string;
  /** Spieler, der es ausgelöst hat (Multiplayer) */
  von?: string;
}

/** Fall aus dem Abfrageschema (Kapitel, wahre Antworten, Code) */
export interface Fall {
  kapitel: string;
  antworten: Antworten;
  code: string;
}

/** Kapitel für einen neuen Fall – häufige Notrufe öfter, Alpinunfälle selten */
const KAPITEL_GEWICHT: Record<string, number> = {
  "17": 3, "26": 3, "10": 2.5, "6": 2.5, "28": 2, "31": 2, "29": 2, "12": 1.5, "21": 1.5, "1": 1.5, "18": 1.5, "9": 1.2, ALP: 0.15, "42": 0.3, "34": 0.3,
};
function kapitelZiehen(schema: Schema): string {
  const kaps = Object.keys(schema.kapitel);
  const sum = kaps.reduce((s, k) => s + (KAPITEL_GEWICHT[k] ?? 1), 0);
  let r = Math.random() * sum;
  for (const k of kaps) {
    r -= KAPITEL_GEWICHT[k] ?? 1;
    if (r <= 0) return k;
  }
  return kaps[0];
}

export interface ChatNachricht {
  zeit: number;
  von: string;
  text: string;
}

export interface AnrufNachricht {
  zeit: number;
  von: "leitstelle" | "anrufer" | "system";
  text: string;
  /** Name des Disponenten (bei „leitstelle“) */
  wer?: string;
}

/** Notruf als Anruf mit Abfrage (nur mit importiertem Abfrageschema) */
export interface Anruf {
  status: "klingelt" | "aktiv" | "verpasst" | "beendet";
  /** Simulationszeit des letzten Statuswechsels */
  seit: number;
  /** klingelt bis (danach legt der Anrufer auf) */
  klingelBis: number;
  /** verpasst: ruft um diese Zeit wieder an */
  rueckrufUm: number | null;
  versuche: number;
  /** Leitstelle hat zurückgerufen */
  rueckruf: boolean;
  angenommenVon: Bearbeiter | null;
  gespraech: AnrufNachricht[];
  /** Antworten der Abfrage (vom Calltaker angeklickt) */
  antworten: Antworten;
  kapitel: string | null;
  extra: { aufwertung: string | null; zusatz: string | null; polizei: boolean };
  /** vorläufiger Code und Reanimationshinweis aus der Abfrage */
  ergebnis: { code: string; reanimation: boolean } | null;
}

/** Wer einen Einsatz gerade bearbeitet (Multiplayer) */
export interface Bearbeiter {
  pid: string;
  name: string;
}

export interface Einsatz {
  id: string;
  nummer: string;
  erstellt: number;
  zustand: "neu" | "offen" | "laufend" | "abgeschlossen";
  /** Wahrheit der Simulation – für den Disponenten verborgen */
  wahr: {
    lat: number;
    lon: number;
    adresse: string;
    code: string;
    patientAlter: number;
    transport: boolean;
    abteilung: HospitalFlag;
    rtwBuchtSelbst: boolean;
    /** Wahrheit für den Anrufer (Abfrageschema) */
    abfrage?: { kapitel: string; antworten: Antworten; code: string; anrufer: Anrufer; lage: string };
  };
  /** Was gemeldet wurde (später: Ergebnis der Notrufabfrage) */
  meldung: { text: string; adresse: string; adresseFalsch: boolean };
  /** Platz für das spätere Abfrageschema (Calltaker) */
  abfrage: Record<string, string> | null;
  /** Eingaben des Disponenten */
  code: string | null;
  codeQuelle: "dispo" | "abfrage" | null;
  adresse: Ort | null;
  zusatz: string;
  infoRtw: string;
  infoIntern: string;
  bo: Ort | null;
  zo: Ort | null;
  kh: { hospitalId: string; grund: HospitalFlag; durch: "dispo" | "rtw"; zeit: number } | null;
  khAnfrage: { abteilung: HospitalFlag; seit: number; von: string } | null;
  rueckrufGemacht: boolean;
  adressePruefen: boolean;
  fahrzeuge: string[];
  protokoll: Protokoll[];
  bearbeiter?: Bearbeiter | null;
  anruf?: Anruf | null;
}

export interface Funkmeldung {
  id: number;
  zeit: number;
  von: string;
  einsatzId: string | null;
  text: string;
  art: "status" | "sprechwunsch" | "info" | "warnung";
  quittiert: boolean;
}

export interface SimState {
  zeit: number;
  tempo: number;
  laeuft: boolean;
  fahrzeuge: Record<string, SimFahrzeug>;
  einsaetze: Einsatz[];
  funk: Funkmeldung[];
  wetter: Wetter;
  naechster: Record<Kategorie, number>;
  zaehler: number;
  funkZaehler: number;
  chat?: ChatNachricht[];
}

/** Befehle, die Spieler auslösen können (im Multiplayer laufen sie beim Host). */
export const BEFEHLE = {
  disponieren: [
    "alarmiere",
    "aktualisiere",
    "bucheKh",
    "entlasse",
    "schliesse",
    "rueckruf",
    "quittiere",
    "manualStatus",
    "setzeBesetzung",
    "oeffne",
    "anrufAnnehmen",
    "anrufNachricht",
    "anrufBeenden",
    "abfrageSetze",
    "abfrageExtra",
  ],
  steuern: ["start", "pause", "setTempo", "generiere", "setWetter", "neuPlanen", "reset"],
  immer: ["chat"],
} as const;
export type Befehl = (typeof BEFEHLE)[keyof typeof BEFEHLE][number];
export type Berechtigung = "disponieren" | "steuern" | "einstellungen";

export function berechtigungFuer(b: Befehl): Berechtigung | null {
  if ((BEFEHLE.disponieren as readonly string[]).includes(b)) return "disponieren";
  if ((BEFEHLE.steuern as readonly string[]).includes(b)) return "steuern";
  return null;
}

function rnd(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

/** Zufälliges Patientenalter, passend zur Gruppe. */
function alterFuer(code: Einsatzcode): number {
  if (code.gruppe === 24) return Math.round(rnd(18, 42));
  const r = Math.random();
  if (r < 0.1) return Math.round(rnd(1, 14));
  if (r < 0.35) return Math.round(rnd(15, 49));
  return Math.round(rnd(50, 95));
}

type Listener = () => void;

export class Simulation {
  state: SimState;
  /** solo = allein, host = Simulation läuft hier, client = Spiegel des Hosts */
  mode: "solo" | "host" | "client" = "solo";
  /** Im Client-Modus: schickt Befehle an den Host */
  remote: ((name: Befehl, args: unknown[]) => Promise<unknown>) | null = null;
  /** Wer den gerade laufenden Befehl ausgelöst hat */
  actor: Bearbeiter | null = null;
  /** Multiplayer: ist ein Spieler gerade verbunden? */
  istOnline: ((pid: string) => boolean) | null = null;
  /** Ich selbst (Name im Multiplayer) */
  ich: Bearbeiter | null = null;
  private listeners = new Set<Listener>();
  private routingBusy = new Set<string>();
  private lastReal = 0;
  private timer: number | undefined;

  constructor() {
    this.state = Simulation.leererZustand();
    this.syncVehicles();
    this.planGenerator(true);
    store.onChange(() => this.syncVehicles());
  }

  static leererZustand(): SimState {
    const now = Date.now();
    return {
      zeit: now,
      tempo: 1,
      laeuft: false,
      fahrzeuge: {},
      einsaetze: [],
      funk: [],
      wetter: nextWetter(now, null),
      naechster: { stabil: 0, dringend: 0, kritisch: 0 },
      zaehler: 0,
      funkZaehler: 0,
      chat: [],
    };
  }

  /** Neue, leere Leitstelle (z. B. nach dem Verlassen eines Spiels). */
  neu(): void {
    this.pause();
    this.state = Simulation.leererZustand();
    this.syncVehicles();
    this.planGenerator(true);
    this.emit();
  }

  get settings(): Settings {
    return store.settings;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Benachrichtigt die Oberfläche (z. B. nach Daten vom Host). */
  notify(): void {
    this.emit();
  }

  /**
   * Führt einen Befehl aus – allein oder als Host sofort, als Mitspieler beim Host.
   * Die Oberfläche ruft Änderungen immer hierüber auf.
   */
  async call<K extends Befehl>(name: K, ...args: Parameters<Simulation[K]>): Promise<Awaited<ReturnType<Simulation[K]>>> {
    if (this.remote) return (await this.remote(name, args)) as Awaited<ReturnType<Simulation[K]>>;
    if (this.mode === "host" && this.ich) return (await this.ausfuehren(name, args, this.ich)) as Awaited<ReturnType<Simulation[K]>>;
    return (await (this[name] as (...a: unknown[]) => unknown)(...args)) as Awaited<ReturnType<Simulation[K]>>;
  }

  /** Beim Host: Befehl eines Mitspielers ausführen (Berechtigung ist schon geprüft). */
  async ausfuehren(name: Befehl, args: unknown[], von: Bearbeiter): Promise<unknown> {
    const vorher = this.actor;
    this.actor = von;
    try {
      const fn = this[name] as (...a: unknown[]) => unknown;
      if (typeof fn !== "function") throw new Error(`Unbekannter Befehl ${name}`);
      // Wer an einem Einsatz arbeitet, wird als Bearbeiter vermerkt
      const eid = typeof args[0] === "string" ? this.einsatz(args[0]) : undefined;
      if (eid && name !== "schliesse" && name !== "oeffne" && (BEFEHLE.disponieren as readonly string[]).includes(name)) {
        eid.bearbeiter = { ...von };
      }
      return await fn.apply(this, args);
    } finally {
      this.actor = vorher;
    }
  }

  /** Ersetzt den ganzen Zustand (Spielstand laden, Daten vom Host). */
  ladeZustand(st: SimState): void {
    this.pause();
    st.chat ??= [];
    for (const fz of Object.values(st.fahrzeuge)) {
      // Routenberechnung lief beim Speichern gerade: Fahrzeug fährt zur Wache
      if (fz.phase === "routing") {
        fz.phase = "rueckfahrt";
        fz.fahrt = null;
        fz.phaseEnde = st.zeit;
      }
    }
    this.state = st;
    this.state.laeuft = false;
    this.emit();
  }

  /** Spieler öffnet einen Einsatz (Multiplayer: andere sehen, wer daran arbeitet). */
  oeffne(id: string): void {
    const e = this.einsatz(id);
    if (!e || !this.actor || e.zustand === "abgeschlossen") return;
    // Nur ansehen nimmt den Einsatz niemandem weg (auch keinen Entwurf) – erst eine Eingabe übernimmt ihn
    if (!e.bearbeiter) {
      e.bearbeiter = { ...this.actor };
      this.emit();
    }
  }

  chat(text: string): void {
    const t = text.trim().slice(0, 500);
    if (!t) return;
    this.state.chat ??= [];
    this.state.chat.push({ zeit: Date.now(), von: this.actor?.name ?? "Leitstelle", text: t });
    if (this.state.chat.length > 200) this.state.chat.splice(0, this.state.chat.length - 200);
    this.emit();
  }

  setWetter(lage: Wetter["lage"]): void {
    this.state.wetter = { lage, bis: this.state.zeit + 90 * 60_000 };
    this.funk("Wetterdienst", null, `Wetter: ${WETTER_LABEL[lage]}`, flugverbot(lage) ? "warnung" : "info");
    this.emit();
  }

  // ------------------------------------------------------------------ Uhr

  start(): void {
    if (this.timer !== undefined) return;
    this.lastReal = performance.now();
    this.timer = window.setInterval(() => this.tick(), 250);
    this.state.laeuft = true;
    this.emit();
  }

  pause(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.state.laeuft = false;
    this.emit();
  }

  setTempo(t: number): void {
    this.state.tempo = t;
    this.emit();
  }

  private tick(): void {
    const nowReal = performance.now();
    const dt = Math.min(2000, nowReal - this.lastReal) * this.state.tempo;
    this.lastReal = nowReal;
    this.state.zeit += dt;
    const t = this.state.zeit;

    if (this.settings.wetterAktiv && t >= this.state.wetter.bis) {
      const alt = this.state.wetter.lage;
      this.state.wetter = nextWetter(t, alt);
      if (this.state.wetter.lage !== alt) {
        this.funk("Wetterdienst", null, `Wetter: ${WETTER_LABEL[this.state.wetter.lage]}`, flugverbot(this.state.wetter.lage) ? "warnung" : "info");
      }
    }
    this.runGenerator();
    for (const fz of Object.values(this.state.fahrzeuge)) this.updateVehicle(fz, t);
    this.checkKhAnfragen(t);
    this.anrufeTick(t);
    this.emit();
  }

  // ------------------------------------------------------------------ Fahrzeuge

  /** Übernimmt aktive RTW/KTW/NEF/NAH aus den Stammdaten (neue kommen dazu, gelöschte gehen). */
  private syncVehicles(): void {
    if (this.mode === "client") return;
    const stations = store.stationsById();
    const wanted = store
      .list("vehicles")
      .filter((v) => v.aktiv && ["RTW", "KTW", "NEF", "NAH"].includes(v.kategorie) && stations.has(v.dienststelleId));
    const ids = new Set(wanted.map((v) => v.id));
    for (const id of Object.keys(this.state.fahrzeuge)) {
      const fz = this.state.fahrzeuge[id];
      if (!ids.has(id) && !fz.einsatzId) delete this.state.fahrzeuge[id];
    }
    for (const v of wanted) {
      const st = stations.get(v.dienststelleId)!;
      const existing = this.state.fahrzeuge[v.id];
      const rmTyp = rmTypVon(v);
      if (existing) {
        if (existing.rmTyp !== rmTyp) existing.besetzung = generiereBesetzung(rmTyp);
        Object.assign(existing, {
          funkrufname: v.funkrufname,
          kurzname: v.kurzname,
          kategorie: v.kategorie,
          rmTyp,
          nachtflug: v.nachtflug,
          stationName: st.name,
        });
        continue;
      }
      this.state.fahrzeuge[v.id] = {
        id: v.id,
        funkrufname: v.funkrufname,
        kurzname: v.kurzname,
        kategorie: v.kategorie,
        rmTyp,
        besetzung: generiereBesetzung(rmTyp),
        stationId: st.id,
        stationName: st.name,
        heim: { lat: st.lat, lon: st.lon },
        lat: st.lat,
        lon: st.lon,
        status: "freiWache",
        phase: "frei",
        phaseEnde: null,
        einsatzId: null,
        fahrt: null,
        nachtflug: v.nachtflug,
        begleitet: false,
      };
    }
  }

  statusDef(key: StatusKey) {
    return this.settings.status.find((s) => s.key === key)!;
  }

  /** Besetzung manuell ändern (Kontextmenü „Besetzung ändern“). */
  setzeBesetzung(id: string, besetzung: Platz[]): void {
    const fz = this.state.fahrzeuge[id];
    if (!fz) return;
    fz.besetzung = besetzung.map((p) => ({ ...p }));
    this.emit();
  }

  /** Kann Patienten transportieren (RTW, RTW-C, KTW) */
  transportfaehig(fz: SimFahrzeug): boolean {
    return fz.rmTyp === "RTW" || fz.rmTyp === "RTW-C" || fz.rmTyp === "KTW";
  }

  verfuegbar(fz: SimFahrzeug): boolean {
    return this.statusDef(fz.status).verfuegbar && !fz.einsatzId;
  }

  /** Kann der Hubschrauber gerade fliegen? Gibt den Grund zurück, wenn nicht. */
  flugHindernis(fz: SimFahrzeug): string | null {
    if (fz.kategorie !== "NAH") return null;
    if (this.settings.wetterAktiv && flugverbot(this.state.wetter.lage)) {
      return `Flug wetterbedingt nicht möglich (${WETTER_LABEL[this.state.wetter.lage]})`;
    }
    if (istNacht(this.state.zeit, fz.heim.lat, fz.heim.lon) && !fz.nachtflug) {
      return "Kein Nachtflug möglich";
    }
    return null;
  }

  private setStatus(fz: SimFahrzeug, s: StatusKey, quiet = false): void {
    if (fz.status === s) return;
    fz.status = s;
    const def = this.statusDef(s);
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    if (e) this.log(e, `${fz.funkrufname}: Status ${def.nummer} – ${def.name}`);
    if (!quiet) this.funk(fz.funkrufname, fz.einsatzId, `Status ${def.nummer} – ${def.name}`, "status");
  }

  /** Manuelle Statusänderung durch den Disponenten (nur ohne Einsatz). */
  manualStatus(id: string, s: StatusKey): string | null {
    const fz = this.state.fahrzeuge[id];
    if (!fz) return "Fahrzeug nicht gefunden";
    if (fz.einsatzId) return "Fahrzeug ist im Einsatz – zuerst freigeben";
    this.setStatus(fz, s, true);
    if (s === "freiWache") {
      fz.lat = fz.heim.lat;
      fz.lon = fz.heim.lon;
      fz.fahrt = null;
      fz.phase = "frei";
    }
    this.emit();
    return null;
  }

  private position(fz: SimFahrzeug, t: number): void {
    const f = fz.fahrt;
    if (!f) return;
    const el = (t - f.start) / 1000;
    if (el >= f.dauer) {
      const last = f.coords[f.coords.length - 1];
      fz.lon = last[0];
      fz.lat = last[1];
      return;
    }
    let i = 1;
    while (i < f.times.length && f.times[i] < el) i++;
    const t0 = f.times[i - 1];
    const t1 = f.times[i] ?? t0;
    const k = t1 > t0 ? (el - t0) / (t1 - t0) : 1;
    const a = f.coords[i - 1];
    const b = f.coords[i] ?? a;
    fz.lon = a[0] + (b[0] - a[0]) * k;
    fz.lat = a[1] + (b[1] - a[1]) * k;
  }

  private faktor(e: Einsatz | undefined): number {
    const st = e ? this.stufeVon(e) : undefined;
    return st?.sondersignal ? this.settings.sondersignalFaktor : 1;
  }

  /** Startet eine Fahrt (asynchron, Routing) und setzt danach die Phase. */
  private fahre(fz: SimFahrzeug, ziel: LatLon, phase: Phase, sondersignal: boolean): void {
    this.routingBusy.add(fz.id);
    fz.phase = "routing";
    const von = { lat: fz.lat, lon: fz.lon };
    const p: Promise<Route> =
      fz.kategorie === "NAH" ? Promise.resolve(flightRoute(von, ziel, this.settings.nahGeschwindigkeit)) : route(von, ziel);
    void p.then((r) => {
      this.routingBusy.delete(fz.id);
      const f = sondersignal && fz.kategorie !== "NAH" ? this.settings.sondersignalFaktor : 1;
      fz.fahrt = { coords: r.coords, times: r.times.map((x) => x * f), start: this.state.zeit, dauer: r.duration * f };
      fz.phase = phase;
      fz.phaseEnde = this.state.zeit + fz.fahrt.dauer * 1000;
      this.emit();
    });
  }

  private updateVehicle(fz: SimFahrzeug, t: number): void {
    if (fz.phase === "routing") return;
    this.position(fz, t);
    if (fz.phaseEnde === null || t < fz.phaseEnde) return;
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;

    switch (fz.phase) {
      case "ausruecken": {
        if (!e || !e.adresse) return this.freigeben(fz);
        this.setStatus(fz, "zumBO");
        this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
        break;
      }
      case "anfahrt": {
        fz.fahrt = null;
        if (!e) return this.freigeben(fz);
        this.setStatus(fz, "amBO");
        if (!e.adresse) return;
        const d = distanceM(e.adresse, e.wahr);
        if (d > this.settings.verortungRadius) {
          fz.phase = "suche";
          fz.phaseEnde = null;
          if (!e.adressePruefen) {
            e.adressePruefen = true;
            this.log(e, `${fz.funkrufname}: kein Patient an der angegebenen Adresse`);
            this.funk(fz.funkrufname, e.id, "Kein Patient an der angegebenen Adresse – bitte Adresse prüfen (Rückruf)", "sprechwunsch");
          }
        } else {
          fz.phase = "vorOrt";
          fz.phaseEnde = t + rnd(10, 22) * MIN;
        }
        break;
      }
      case "vorOrt": {
        if (!e) return this.freigeben(fz);
        this.entscheideTransport(fz, e, t);
        break;
      }
      case "warteKH":
        break;
      case "transport": {
        fz.fahrt = null;
        this.setStatus(fz, "amZO");
        fz.phase = "uebergabe";
        fz.phaseEnde = t + rnd(8, 18) * MIN;
        break;
      }
      case "uebergabe": {
        if (e) this.log(e, `${fz.funkrufname}: Übergabe abgeschlossen`);
        this.freigeben(fz);
        break;
      }
      case "rueckfahrt": {
        fz.fahrt = null;
        fz.phase = "frei";
        fz.phaseEnde = null;
        fz.lat = fz.heim.lat;
        fz.lon = fz.heim.lon;
        this.setStatus(fz, "freiWache", true);
        break;
      }
      default:
        break;
    }
  }

  private kritisch(e: Einsatz): boolean {
    return this.stufeVon(e)?.kategorie === "kritisch";
  }

  private entscheideTransport(fz: SimFahrzeug, e: Einsatz, t: number): void {
    if (!this.transportfaehig(fz)) {
      // NEF/NAH: begleitet bei kritischen Transporten, sonst frei
      const rtwMitTransport =
        e.wahr.transport &&
        e.fahrzeuge.some((id) => {
          const x = this.state.fahrzeuge[id];
          return x && x.einsatzId === e.id && this.transportfaehig(x);
        });
      if (rtwMitTransport && this.kritisch(e) && fz.kategorie === "NEF") {
        fz.begleitet = true;
        this.log(e, `${fz.funkrufname}: Notarzt begleitet den Transport`);
      } else if (rtwMitTransport && this.kritisch(e) && fz.kategorie === "NAH") {
        this.log(e, `${fz.funkrufname}: Patient wird mit dem NAH transportiert`);
        fz.begleitet = true;
      } else {
        this.log(e, `${fz.funkrufname}: Einsatz beendet`);
        return this.freigeben(fz);
      }
      fz.phase = "warteKH";
      fz.phaseEnde = null;
      if (e.kh) this.startTransport(e);
      return;
    }
    if (!e.wahr.transport) {
      this.log(e, `${fz.funkrufname}: kein Transport erforderlich`);
      this.funk(fz.funkrufname, e.id, "Kein Transport, Patient verbleibt vor Ort", "info");
      return this.freigeben(fz);
    }
    fz.phase = "warteKH";
    fz.phaseEnde = null;
    if (e.kh) return this.startTransport(e);
    if (e.wahr.rtwBuchtSelbst) {
      this.bucheKhAuto(e, fz.funkrufname);
      return;
    }
    e.khAnfrage = { abteilung: e.wahr.abteilung, seit: t, von: fz.funkrufname };
    this.funk(fz.funkrufname, e.id, `Erbitte KH-Buchung: ${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]}`, "sprechwunsch");
    this.log(e, `${fz.funkrufname} erbittet KH-Buchung (${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]})`);
  }

  /** Bucht automatisch das nächstgelegene passende Krankenhaus (RTW bucht selbst). */
  private bucheKhAuto(e: Einsatz, von: string): void {
    const ziel = this.naechstesKh(e.wahr, e.wahr.abteilung);
    if (!ziel) return;
    e.kh = { hospitalId: ziel.id, grund: e.wahr.abteilung, durch: "rtw", zeit: this.state.zeit };
    e.zo = { lat: ziel.lat, lon: ziel.lon, label: ziel.name };
    e.khAnfrage = null;
    this.log(e, `${von} bucht ${ziel.name} (${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]})`);
    this.funk(von, e.id, `KH gebucht: ${ziel.kurzname || ziel.name} – ${HOSPITAL_FLAG_LABEL[e.wahr.abteilung]}`, "info");
    this.startTransport(e);
  }

  naechstesKh(pos: LatLon, abteilung: HospitalFlag): Hospital | undefined {
    const all = store.list("hospitals");
    const passend = all.filter((h) => h.abteilungen[abteilung]);
    const pool = passend.length ? passend : all.filter((h) => h.abteilungen.notfallambulanz);
    return pool.slice().sort((a, b) => distanceM(pos, a) - distanceM(pos, b))[0];
  }

  private checkKhAnfragen(t: number): void {
    for (const e of this.state.einsaetze) {
      if (e.khAnfrage && t - e.khAnfrage.seit > 4 * MIN) {
        this.funk(e.khAnfrage.von, e.id, "Keine Rückmeldung – buchen selbst", "info");
        this.bucheKhAuto(e, e.khAnfrage.von);
      }
    }
  }

  /** Alle Fahrzeuge des Einsatzes, die auf das KH warten, fahren los. */
  private startTransport(e: Einsatz): void {
    if (!e.kh) return;
    const h = store.get("hospitals", e.kh.hospitalId);
    if (!h) return;
    for (const id of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[id];
      if (!fz || fz.phase !== "warteKH") continue;
      this.setStatus(fz, "zumZO");
      this.fahre(fz, h, "transport", this.kritisch(e));
    }
  }

  /** Fahrzeug aus dem Einsatz lösen und zurück zur Wache schicken. */
  freigeben(fz: SimFahrzeug): void {
    const e = fz.einsatzId ? this.einsatz(fz.einsatzId) : undefined;
    fz.einsatzId = null;
    fz.begleitet = false;
    this.setStatus(fz, "freiFunk");
    if (distanceM(fz, fz.heim) < 80) {
      fz.phase = "frei";
      fz.phaseEnde = null;
      fz.fahrt = null;
      this.setStatus(fz, "freiWache", true);
    } else {
      this.fahre(fz, fz.heim, "rueckfahrt", false);
    }
    if (e) this.pruefeAbschluss(e);
  }

  private pruefeAbschluss(e: Einsatz): void {
    const aktiv = Object.values(this.state.fahrzeuge).some((f) => f.einsatzId === e.id);
    if (!aktiv && e.fahrzeuge.length > 0 && e.zustand !== "abgeschlossen") {
      e.zustand = "abgeschlossen";
      e.khAnfrage = null;
      this.log(e, "Einsatz abgeschlossen");
    }
  }

  // ------------------------------------------------------------------ Einsätze

  einsatz(id: string): Einsatz | undefined {
    return this.state.einsaetze.find((e) => e.id === id);
  }

  stufeVon(e: Einsatz): StufeDef | undefined {
    const c = findCode(e.code ?? undefined);
    return c ? this.stufeDef(c.stufe) : undefined;
  }

  /** Bedeutung einer Stufe; unbekannte Stufen (neu importiert) bekommen Standardwerte. */
  stufeDef(stufe: string): StufeDef | undefined {
    if (!stufe) return undefined;
    return this.settings.stufen.find((s) => s.stufe === stufe) ?? defaultStufeFuer(stufe);
  }

  log(e: Einsatz, text: string): void {
    const p: Protokoll = { zeit: this.state.zeit, text };
    if (this.actor && this.mode !== "solo") p.von = this.actor.name;
    e.protokoll.push(p);
  }

  funk(von: string, einsatzId: string | null, text: string, art: Funkmeldung["art"]): void {
    this.state.funk.unshift({
      id: ++this.state.funkZaehler,
      zeit: this.state.zeit,
      von,
      einsatzId,
      text,
      art,
      quittiert: art === "status" || art === "info",
    });
    if (this.state.funk.length > 300) this.state.funk.length = 300;
  }

  quittiere(funkId: number): void {
    const m = this.state.funk.find((f) => f.id === funkId);
    if (m) m.quittiert = true;
    this.emit();
  }

  private neueNummer(): string {
    const d = new Date(this.state.zeit);
    this.state.zaehler++;
    return `${pad(d.getFullYear() % 100, 2)}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}-${pad(this.state.zaehler, 4)}`;
  }

  /** Legt einen Einsatz an (vom Generator, aus einer Vorlage oder später vom Calltaker). */
  erstelleEinsatz(p: {
    lat: number;
    lon: number;
    adresse: string;
    code: Einsatzcode;
    meldung?: string;
    gemeldeteAdresse?: string;
    patientAlter?: number | null;
    transport?: boolean | null;
    /** Fall aus dem Abfrageschema: Einsatz kommt als Anruf */
    fall?: Fall | null;
  }): Einsatz {
    const stufe = this.stufeDef(p.code.stufe);
    const alter = p.patientAlter ?? alterFuer(p.code);
    const kritisch = stufe?.kategorie === "kritisch";
    const transport = p.transport ?? Math.random() * 100 < (stufe?.transportProzent ?? 70);
    const gemeldet = p.gemeldeteAdresse ?? p.adresse;
    const e: Einsatz = {
      id: `e${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      nummer: this.neueNummer(),
      erstellt: this.state.zeit,
      zustand: "neu",
      wahr: {
        lat: p.lat,
        lon: p.lon,
        adresse: p.adresse,
        code: p.code.code,
        patientAlter: alter,
        transport,
        abteilung: abteilungFuer(p.code, alter < 15, kritisch),
        rtwBuchtSelbst: Math.random() < 0.5,
      },
      meldung: {
        text: p.meldung || `${p.code.beschreibung}. Patient ca. ${alter} Jahre.`,
        adresse: gemeldet,
        adresseFalsch: gemeldet !== p.adresse,
      },
      abfrage: null,
      code: null,
      codeQuelle: null,
      adresse: null,
      zusatz: "",
      infoRtw: "",
      infoIntern: "",
      bo: null,
      zo: null,
      kh: null,
      khAnfrage: null,
      rueckrufGemacht: false,
      adressePruefen: false,
      fahrzeuge: [],
      protokoll: [],
    };
    if (p.fall && store.schema) {
      const schema = store.schema;
      const anrufer = anruferWaehlen(p.fall.kapitel, p.fall.antworten);
      e.wahr.abfrage = {
        kapitel: p.fall.kapitel,
        antworten: p.fall.antworten,
        code: p.fall.code,
        anrufer,
        lage: `${schema.codes[p.fall.code]?.name ?? p.code.beschreibung} (${schema.kapitel[p.fall.kapitel]?.titel ?? ""})`,
      };
      e.meldung.text = "";
      e.anruf = {
        status: "klingelt",
        seit: this.state.zeit,
        klingelBis: this.state.zeit + rnd(45, 75) * 1000,
        rueckrufUm: null,
        versuche: 1,
        rueckruf: false,
        angenommenVon: null,
        gespraech: [],
        antworten: {},
        kapitel: null,
        extra: { aufwertung: null, zusatz: null, polizei: false },
        ergebnis: null,
      };
    }
    this.log(e, e.anruf ? "Notruf klingelt" : "Notruf eingegangen");
    this.state.einsaetze.unshift(e);
    this.funk("Notruf", e.id, `Neuer Einsatz ${e.nummer}`, "info");
    this.emit();
    return e;
  }

  /** Disponent setzt Code, Adresse und Texte. */
  aktualisiere(
    id: string,
    patch: Partial<Pick<Einsatz, "code" | "adresse" | "zusatz" | "infoRtw" | "infoIntern" | "bo" | "zo">>,
  ): void {
    const e = this.einsatz(id);
    if (!e) return;
    const adresseNeu = patch.adresse && (!e.adresse || distanceM(patch.adresse, e.adresse) > 5);
    Object.assign(e, patch);
    if (patch.code !== undefined) e.codeQuelle = "dispo";
    if (e.zustand === "neu") e.zustand = "offen";
    if (patch.adresse) {
      e.bo = patch.adresse;
      if (adresseNeu) {
        this.log(e, `Adresse: ${patch.adresse.label}`);
        if (e.adressePruefen) this.adresseKorrigiert(e);
      }
    }
    if (patch.code) this.log(e, `Code: ${patch.code}`);
    this.emit();
  }

  /** Nach einer Adresskorrektur fahren die suchenden Fahrzeuge zur neuen Adresse. */
  private adresseKorrigiert(e: Einsatz): void {
    if (!e.adresse) return;
    const ok = distanceM(e.adresse, e.wahr) <= this.settings.verortungRadius;
    if (ok) e.adressePruefen = false;
    for (const id of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[id];
      if (!fz || (fz.phase !== "suche" && fz.phase !== "anfahrt")) continue;
      this.setStatus(fz, "zumBO");
      this.funk(fz.funkrufname, e.id, "Neue Adresse verstanden, fahren hin", "info");
      this.fahre(fz, e.adresse, "anfahrt", this.faktor(e) < 1);
    }
  }

  /** Rückruf beim Anrufer: liefert die tatsächliche Adresse. */
  rueckruf(id: string): string | null {
    const e = this.einsatz(id);
    if (!e) return null;
    e.rueckrufGemacht = true;
    this.log(e, `Rückruf beim Anrufer: Adresse ${e.wahr.adresse}`);
    this.emit();
    return e.wahr.adresse;
  }

  /** Alarmiert Fahrzeuge. Gibt Hinweise zurück (z. B. NAH darf nicht fliegen). */
  alarmiere(id: string, fahrzeugIds: string[]): string[] {
    const e = this.einsatz(id);
    const hinweise: string[] = [];
    if (!e) return ["Einsatz nicht gefunden"];
    if (!e.adresse) return ["Bitte zuerst eine Adresse eingeben"];
    for (const fid of fahrzeugIds) {
      const fz = this.state.fahrzeuge[fid];
      if (!fz) continue;
      if (!this.verfuegbar(fz)) {
        hinweise.push(`${fz.funkrufname} ist nicht verfügbar`);
        continue;
      }
      const hindernis = this.flugHindernis(fz);
      if (hindernis) {
        hinweise.push(`${fz.funkrufname}: ${hindernis}`);
        this.funk(fz.funkrufname, e.id, hindernis, "warnung");
        continue;
      }
      fz.einsatzId = e.id;
      if (!e.fahrzeuge.includes(fz.id)) e.fahrzeuge.push(fz.id);
      const vonWache = fz.status === "freiWache";
      this.setStatus(fz, "alarmiert");
      fz.fahrt = null;
      fz.phase = "ausruecken";
      const sek =
        fz.kategorie === "NAH"
          ? this.settings.nahStartzeitSek * rnd(0.8, 1.2)
          : vonWache
            ? rnd(60, 120) * (istNacht(this.state.zeit, fz.lat, fz.lon) ? 1.6 : 1)
            : rnd(10, 25);
      fz.phaseEnde = this.state.zeit + sek * 1000;
      this.log(e, `${fz.funkrufname} alarmiert`);
    }
    if (e.fahrzeuge.length > 0) e.zustand = "laufend";
    this.emit();
    return hinweise;
  }

  /** Disponent bucht ein Krankenhaus. */
  bucheKh(id: string, hospitalId: string, grund: HospitalFlag): void {
    const e = this.einsatz(id);
    const h = store.get("hospitals", hospitalId);
    if (!e || !h) return;
    e.kh = { hospitalId, grund, durch: "dispo", zeit: this.state.zeit };
    e.zo = { lat: h.lat, lon: h.lon, label: h.name };
    e.khAnfrage = null;
    this.log(e, `KH gebucht durch Leitstelle: ${h.name} (${HOSPITAL_FLAG_LABEL[grund]})`);
    // RTW wartet schon? Dann losfahren
    this.startTransport(e);
    this.emit();
  }

  /** Fahrzeug manuell aus dem Einsatz entlassen. */
  entlasse(fahrzeugId: string): void {
    const fz = this.state.fahrzeuge[fahrzeugId];
    if (!fz || !fz.einsatzId) return;
    const e = this.einsatz(fz.einsatzId);
    if (e) this.log(e, `${fz.funkrufname} durch Leitstelle freigegeben`);
    this.freigeben(fz);
    this.emit();
  }

  /** Einsatz ohne Fahrzeuge schließen (z. B. Telemedizin, Fehlalarm). */
  schliesse(id: string, grund: string): void {
    const e = this.einsatz(id);
    if (!e) return;
    for (const fid of e.fahrzeuge) {
      const fz = this.state.fahrzeuge[fid];
      if (fz?.einsatzId === e.id) this.freigeben(fz);
    }
    e.zustand = "abgeschlossen";
    e.khAnfrage = null;
    e.bearbeiter = null;
    this.log(e, `Einsatz geschlossen: ${grund}`);
    this.emit();
  }

  /** Fahrzeuge mit Fahrzeit zum Einsatzort, sortiert. */
  async vorschlaege(id: string): Promise<Vorschlag[]> {
    const e = this.einsatz(id);
    if (!e?.adresse) return [];
    const ziel = e.adresse;
    const frei = Object.values(this.state.fahrzeuge).filter((f) => this.verfuegbar(f));
    const boden = frei.filter((f) => f.kategorie !== "NAH");
    const zeiten = await travelTimes(ziel, boden.map((f) => ({ lat: f.lat, lon: f.lon })));
    const faktor = this.faktor(e);
    const out = boden.map((fz, i) => {
      const z = zeiten[i];
      const ausr = fz.status === "freiWache" ? 90 : 15;
      return { fz, sekunden: z === null ? null : z * faktor + ausr, hinweis: null as string | null };
    });
    for (const fz of frei.filter((f) => f.kategorie === "NAH")) {
      const flug = distanceM(fz, ziel) / (this.settings.nahGeschwindigkeit / 3.6) + this.settings.nahStartzeitSek;
      out.push({ fz, sekunden: flug, hinweis: this.flugHindernis(fz) });
    }
    return out.sort((a, b) => (a.sekunden ?? 1e9) - (b.sekunden ?? 1e9));
  }

  /**
   * Einsatzmittelvorschlag nach Stufe:
   * - Rettungsmittel nach Rangfolge; jeder Rang schlechter darf die Toleranz kürzer brauchen
   *   (Punktzahl = Fahrzeit + Rang × Toleranz)
   * - NFS erforderlich: RM ohne NFS bekommt + Toleranz und zusätzlich ein NEF (NAH, wenn kein NEF)
   * - Notarzt „nef“: NEF, NAH nur wenn mehr als die Toleranz schneller; „schnellster“: NEF oder NAH
   * Bereits alarmierte Fahrzeuge werden berücksichtigt.
   */
  empfehlung(id: string, liste: Vorschlag[]): { ids: string[]; gruende: string[] } {
    const e = this.einsatz(id);
    const stufe = e ? this.stufeVon(e) : undefined;
    if (!e || !stufe) return { ids: [], gruende: [] };
    const tol = this.settings.toleranzMin * 60;
    const ids: string[] = [];
    const gruende: string[] = [];
    const min = (s: number) => `${Math.round(s / 60)} min`;
    const nutzbar = liste.filter((v) => v.sekunden !== null && !v.hinweis);

    const imEinsatz = e.fahrzeuge.map((fid) => this.state.fahrzeuge[fid]).filter((f) => f && f.einsatzId === e.id);
    let rm: SimFahrzeug | undefined = imEinsatz.find((f) => this.transportfaehig(f));
    let arzt: SimFahrzeug | undefined = imEinsatz.find((f) => f.rmTyp === "NEF" || f.rmTyp === "NAH");

    const rangListe = raenge(stufe);
    if (!rm && rangListe.length) {
      let best: { v: Vorschlag; punkte: number; rang: number } | null = null;
      for (const v of nutzbar) {
        const r = rangListe.findIndex((g) => g.includes(v.fz.rmTyp));
        if (r < 0) continue;
        let punkte = v.sekunden! + r * tol;
        if (stufe.nfsErforderlich && !hatNFS(v.fz.besetzung)) punkte += tol;
        if (!best || punkte < best.punkte) best = { v, punkte, rang: r };
      }
      if (best) {
        rm = best.v.fz;
        ids.push(rm.id);
        const text = `${rm.funkrufname} (${rm.rmTyp}, ${min(best.v.sekunden!)})`;
        gruende.push(best.rang === 0 ? `${text}: passendes Rettungsmittel` : `${text}: besser passende sind deutlich weiter weg`);
      } else {
        gruende.push(`Kein passendes Rettungsmittel (${stufe.rettungsmittel}) verfügbar`);
      }
    }

    const nfsFehlt = stufe.nfsErforderlich && rm !== undefined && !hatNFS(rm.besetzung);
    const regel = stufe.notarzt !== "nein" ? stufe.notarzt : nfsFehlt ? "nef" : "nein";
    if (!arzt && regel !== "nein") {
      const nef = nutzbar.find((v) => v.fz.rmTyp === "NEF");
      const nah = nutzbar.find((v) => v.fz.rmTyp === "NAH");
      let wahl: Vorschlag | undefined;
      if (regel === "schnellster") wahl = [nef, nah].filter((x): x is Vorschlag => !!x).sort((a, b) => a.sekunden! - b.sekunden!)[0];
      else if (nef && nah) wahl = nah.sekunden! + tol < nef.sekunden! ? nah : nef;
      else wahl = nef ?? nah;
      if (wahl) {
        arzt = wahl.fz;
        ids.push(arzt.id);
        const grund = nfsFehlt && stufe.notarzt === "nein" ? "kein NFS am Rettungsmittel" : "Notarzt erforderlich";
        gruende.push(`${arzt.funkrufname} (${arzt.rmTyp}, ${min(wahl.sekunden!)}): ${grund}`);
      } else {
        gruende.push("Kein Notarztmittel (NEF/NAH) verfügbar");
      }
    }
    return { ids, gruende };
  }

  // ------------------------------------------------------------------ Generator

  private planGenerator(init = false): void {
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) {
      if (init || this.state.naechster[k] === 0) this.planNaechsten(k);
    }
  }

  private planNaechsten(k: Kategorie): void {
    const proStunde = this.settings.aufkommen[k];
    if (!proStunde || proStunde <= 0) {
      this.state.naechster[k] = Number.POSITIVE_INFINITY;
      return;
    }
    // Poisson-Prozess: exponentiell verteilte Abstände
    const minuten = (-Math.log(1 - Math.random()) * 60) / proStunde;
    this.state.naechster[k] = this.state.zeit + minuten * MIN;
  }

  /** Nach Änderung des Aufkommens neu planen. */
  neuPlanen(): void {
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) this.planNaechsten(k);
    this.emit();
  }

  private runGenerator(): void {
    if (!this.settings.generatorAktiv) return;
    for (const k of ["stabil", "dringend", "kritisch"] as Kategorie[]) {
      if (this.state.zeit >= this.state.naechster[k]) {
        this.planNaechsten(k);
        void this.generiere(k);
      }
    }
  }

  /** Erzeugt sofort einen Einsatz (Kategorie zufällig, wenn nicht angegeben). */
  async generiere(k?: Kategorie): Promise<Einsatz | null> {
    const s = this.settings;
    if (!hasCodes()) return null;
    const schema = s.anrufe ? store.schema : null;
    if (s.generatorQuelle === "vorlagen") {
      const vorlagen = store.list("templates");
      if (vorlagen.length) {
        const v = pick(vorlagen);
        const code = findCode(v.code) ?? pick(allCodes());
        const fall = schema ? this.fallFuerCode(schema, code.code) : null;
        return this.erstelleEinsatz({
          lat: v.lat,
          lon: v.lon,
          adresse: v.adresse || "Adresse lt. Vorlage",
          code,
          meldung: v.meldung,
          patientAlter: v.patientAlter ?? (typeof fall?.antworten.alter === "number" ? fall.antworten.alter : null),
          transport: v.transport,
          fall,
        });
      }
    }
    const kat: Kategorie = k ?? pick(["stabil", "dringend", "dringend", "kritisch"] as Kategorie[]);
    const passt = (stufe: string) => {
      const st = this.stufeDef(stufe);
      return !!st && st.kategorie === kat && raenge(st).length > 0;
    };
    let code: Einsatzcode | undefined;
    let fall: Fall | null = null;
    if (schema) {
      // Fall aus dem Abfrageschema ziehen: Antworten und Code passen garantiert zusammen
      for (let i = 0; i < 400 && !fall; i++) {
        const f = fallZiehen(schema, kapitelZiehen(schema));
        const c = f ? findCode(f.ergebnis.code) : undefined;
        if (f && c && passt(c.stufe)) {
          code = c;
          fall = { kapitel: f.ergebnis.pfad[0], antworten: f.antworten, code: c.code };
        }
      }
    }
    if (!code) {
      const codes = allCodes().filter((c) => passt(c.stufe) && !/Aufwertung/i.test(c.beschreibung));
      if (codes.length === 0) return null;
      code = pick(codes);
    }
    const [adr] = await randomAddresses(s.gebiet.bbox, 1);
    if (!adr) return null;
    let gemeldet = adr.label;
    // Manche Anrufer nennen eine falsche Adresse (andere Hausnummer derselben Straße)
    if (Math.random() * 100 < s.falscheAdresseProzent) {
      const andere = (await searchAddress(`${adr.street} ${adr.city}`, 40)).filter(
        (h) => !h.place && distanceM(h, adr) > s.verortungRadius * 1.5,
      );
      if (andere.length) gemeldet = pick(andere).label;
    }
    const alter = typeof fall?.antworten.alter === "number" ? fall.antworten.alter : null;
    return this.erstelleEinsatz({ lat: adr.lat, lon: adr.lon, adresse: adr.label, code, gemeldeteAdresse: gemeldet, fall, patientAlter: alter });
  }

  private fallFuerCode(schema: Schema, code: string): Fall | null {
    const kap = kapitelVonCode(schema, code);
    const a = wahrheitFuer(schema, code);
    return kap && a ? { kapitel: kap, antworten: a, code } : null;
  }

  // ------------------------------------------------------------------ Anrufe

  private anrufeTick(t: number): void {
    for (const e of this.state.einsaetze) {
      const a = e.anruf;
      if (!a || e.zustand === "abgeschlossen") continue;
      if (a.status === "klingelt" && t >= a.klingelBis) {
        a.status = "verpasst";
        a.seit = t;
        a.rueckrufUm = t + rnd(2, 3) * MIN;
        this.log(e, `Anruf nicht angenommen – Anrufer hat aufgelegt (${a.versuche}. Versuch)`);
        this.funk("Notruf", e.id, `Verpasster Anruf ${e.nummer}`, "warnung");
      } else if (a.status === "verpasst" && a.rueckrufUm !== null && t >= a.rueckrufUm) {
        a.status = "klingelt";
        a.seit = t;
        a.versuche++;
        a.klingelBis = t + rnd(45, 75) * 1000;
        a.rueckrufUm = null;
        this.log(e, `Anrufer ruft erneut an (${a.versuche}. Versuch)`);
        this.funk("Notruf", e.id, `Erneuter Anruf ${e.nummer}`, "warnung");
      }
    }
  }

  private calltaker(): Bearbeiter {
    return this.actor ?? this.ich ?? { pid: "solo", name: "Leitstelle" };
  }

  private nurCalltaker(e: Einsatz): Anruf {
    const a = e.anruf;
    if (!a) throw new Error("Kein Anruf zu diesem Einsatz");
    const ich = this.calltaker();
    if (a.status === "klingelt" || a.status === "verpasst") throw new Error("Bitte zuerst den Anruf annehmen");
    if (a.angenommenVon && a.angenommenVon.pid !== ich.pid && this.mode !== "solo") {
      throw new Error(`Das Gespräch führt ${a.angenommenVon.name}`);
    }
    return a;
  }

  /** Anruf annehmen (klingelt), zurückrufen (verpasst) oder übernehmen (Gesprächsführer getrennt) */
  anrufAnnehmen(id: string): void {
    const e = this.einsatz(id);
    const a = e?.anruf;
    if (!e || !a) throw new Error("Kein Anruf zu diesem Einsatz");
    const ich = this.calltaker();
    if (a.status === "aktiv") {
      const fuehrer = a.angenommenVon;
      if (fuehrer && fuehrer.pid !== ich.pid && (this.istOnline?.(fuehrer.pid) ?? true)) {
        throw new Error(`Das Gespräch führt bereits ${fuehrer.name}`);
      }
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, von: "system", text: `${ich.name} übernimmt das Gespräch` });
    } else if (a.status === "klingelt" || a.status === "verpasst") {
      a.rueckruf = a.status === "verpasst";
      a.status = "aktiv";
      a.seit = this.state.zeit;
      a.rueckrufUm = null;
      a.angenommenVon = { ...ich };
      a.gespraech.push({ zeit: this.state.zeit, von: "system", text: a.rueckruf ? `Rückruf durch ${ich.name}` : `Anruf angenommen von ${ich.name}` });
      this.log(e, a.rueckruf ? "Leitstelle ruft zurück" : "Anruf angenommen");
    } else {
      throw new Error("Das Gespräch ist bereits beendet");
    }
    e.bearbeiter = { ...ich };
    if (e.zustand === "neu") e.zustand = "offen";
    this.emit();
  }

  anrufNachricht(id: string, von: "leitstelle" | "anrufer", text: string): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    const t = text.trim().slice(0, 1500);
    if (!t) return;
    a.gespraech.push({ zeit: this.state.zeit, von, text: t, wer: von === "leitstelle" ? this.calltaker().name : undefined });
    if (a.gespraech.length > 200) a.gespraech.splice(1, a.gespraech.length - 200);
    this.emit();
  }

  anrufBeenden(id: string): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    a.status = "beendet";
    a.seit = this.state.zeit;
    a.gespraech.push({ zeit: this.state.zeit, von: "system", text: "Gespräch beendet" });
    this.log(e, "Notrufgespräch beendet");
    this.emit();
  }

  /** Antwort in der Abfrage setzen (wert null = zurücknehmen); „kapitel“ wählt das Kapitel */
  abfrageSetze(id: string, frage: string, wert: string | number | null): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    if (frage === "kapitel") a.kapitel = wert === null ? null : String(wert);
    else if (wert === null) delete a.antworten[frage];
    else a.antworten[frage] = wert;
    this.abfrageAuswerten(e);
    this.emit();
  }

  abfrageExtra(id: string, extra: Partial<Anruf["extra"]>): void {
    const e = this.einsatz(id);
    if (!e) return;
    const a = this.nurCalltaker(e);
    a.extra = { ...a.extra, ...extra };
    this.abfrageAuswerten(e);
    this.emit();
  }

  /** Vorläufigen Code aus der Abfrage berechnen und in den Einsatz übernehmen */
  private abfrageAuswerten(e: Einsatz): void {
    const a = e.anruf;
    const schema = store.schema;
    if (!a || !schema || !a.kapitel) {
      if (a) a.ergebnis = null;
      return;
    }
    const erg = bestimmeCode(schema, a.kapitel, a.antworten, a.extra);
    a.ergebnis = erg ? { code: erg.code, reanimation: erg.reanimation } : null;
    if (erg && erg.code !== e.code && findCode(erg.code)) {
      const vorher = e.code;
      e.code = erg.code;
      e.codeQuelle = "abfrage";
      if (e.zustand === "neu") e.zustand = "offen";
      this.log(e, `${vorher ? "Code geändert" : "Code"} (Abfrage): ${erg.code}`);
    }
  }


  /** Alle Einsätze und Fahrzeugzustände zurücksetzen. */
  reset(): void {
    this.state.einsaetze = [];
    this.state.funk = [];
    for (const fz of Object.values(this.state.fahrzeuge)) {
      Object.assign(fz, {
        lat: fz.heim.lat,
        lon: fz.heim.lon,
        status: "freiWache",
        phase: "frei",
        phaseEnde: null,
        einsatzId: null,
        fahrt: null,
        begleitet: false,
      });
    }
    this.planGenerator(true);
    this.emit();
  }
}

export const sim = new Simulation();
