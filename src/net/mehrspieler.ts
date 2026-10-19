/**
 * Multiplayer: Verbindung über den Relay, Abgleich des Spielzustands und Befehle.
 *
 * Die Simulation läuft nur beim Host. Er schickt allen Mitspielern beim Beitritt den
 * vollständigen Zustand und danach zweimal pro Sekunde die Änderungen. Mitspieler
 * schicken ihre Eingaben als Befehle an den Host, der sie mit Berechtigungsprüfung
 * ausführt. Bricht eine Verbindung ab, wird automatisch neu verbunden.
 */
import { store, type StoreBefehl } from "../data/store";
import { aktiveRegionen, REGIONEN } from "../sim/geo";
import { DeltaBauer, deltaAnwenden, zustandUebernehmen } from "./spiegel";
import type { Persisted } from "../data/model";
import {
  berechtigungFuer,
  sim,
  type Bearbeiter,
  type Befehl,
  type Berechtigung,
  type SimState,
} from "../sim/engine";

export const RELAY_URL = "wss://server.leitwerk.workers.dev";
const DELTA_MS = 500;
const CHUNK = 400_000;
const ANTWORT_TIMEOUT_MS = 15_000;

export type Rechte = Record<Berechtigung, boolean>;
export const STANDARD_RECHTE: Rechte = { disponieren: true, steuern: true, einstellungen: false, kt: true };
export const RECHTE_LABEL: Record<Berechtigung, string> = {
  disponieren: "Disponieren",
  steuern: "Simulation steuern",
  einstellungen: "Einstellungen & Daten",
  kt: "KT disponieren",
};

export interface Spieler {
  pid: string;
  name: string;
  online: boolean;
  host: boolean;
  rechte: Rechte;
  /** Antwortzeit in ms (vom Host gemessen bzw. gemeldet) */
  ping?: number | null;
  /** seit wann nicht verbunden */
  offlineSeit?: number | null;
}

export type Rolle = "aus" | "host" | "client";

/** Zustand der Verbindung, für die Anzeige */
export interface Status {
  rolle: Rolle;
  code: string;
  verbunden: boolean;
  /** nur Mitspieler: Host ist da */
  hostDa: boolean;
  /** Host hat das Spiel absichtlich verlassen */
  hostVerlassen: boolean;
  fehler: string | null;
}

type Nachricht = { t: string; [k: string]: unknown };

function zufallsId(n = 16): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ohne Speicher geht es auch */
  }
}

/** Dauerhafte Spieler-ID dieses Rechners (damit man nach Abbruch „derselbe“ bleibt) */
export function meinePid(): string {
  let p = lsGet("leitwerk.pid");
  if (!p) {
    p = zufallsId(8);
    lsSet("leitwerk.pid", p);
  }
  return p;
}

export function meinName(): string {
  return lsGet("leitwerk.name") ?? "";
}

class Mehrspieler {
  status: Status = { rolle: "aus", code: "", verbunden: false, hostDa: false, hostVerlassen: false, fehler: null };
  spieler: Spieler[] = [];
  ich: Bearbeiter = { pid: meinePid(), name: meinName() || "Disponent" };
  ungeleseneChats = 0;

  private ws: WebSocket | null = null;
  private token = "";
  private absichtlichZu = false;
  private retry = 0;
  private retryTimer: number | undefined;
  private deltaTimer: number | undefined;
  private warLaufend = false;
  private listeners = new Set<() => void>();
  private meldungListeners = new Set<(text: string) => void>();
  private anfrageListeners = new Set<(pid: string, name: string) => void>();
  private rtt: number | null = null;
  private pingGesendet = 0;
  private sessionZaehler = 0;
  private offen = new Map<string, { resolve(v: unknown): void; reject(e: Error): void; timer: number }>();
  private chunks = new Map<string, string[]>();
  private delta = new DeltaBauer();
  private storeTimer: number | undefined;

  constructor() {
    store.onChange(() => {
      if (this.status.rolle === "host") {
        window.clearTimeout(this.storeTimer);
        this.storeTimer = window.setTimeout(() => this.anAlle({ t: "store", data: store.snapshot() }), 400);
      }
    });
    sim.onChange(() => {
      const n = sim.state.chat?.length ?? 0;
      if (n > this.letzterChat) {
        if (this.letzterChat >= 0) this.ungeleseneChats += n - this.letzterChat;
        this.letzterChat = n;
      }
    });
  }
  private letzterChat = -1;

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Kurze Meldungen für alle (z. B. „Max hat die Verbindung verloren“) */
  onMeldung(fn: (text: string) => void): void {
    this.meldungListeners.add(fn);
  }

  private melden(text: string): void {
    for (const fn of this.meldungListeners) fn(text);
  }

  /** Host: ein Mitspieler möchte Host werden */
  onHostAnfrage(fn: (pid: string, name: string) => void): void {
    this.anfrageListeners.add(fn);
  }

  /** Nebenfenster: Anzeige-Stand vom Hauptfenster übernehmen (ohne eigene Verbindung) */
  spiegeln(d: { status: Status; spieler: Spieler[]; ich: Bearbeiter; ungelesen: number }): void {
    this.status = d.status;
    this.spieler = d.spieler;
    this.ich = d.ich;
    this.ungeleseneChats = d.ungelesen;
    this.emit();
  }

  /** Stand für Nebenfenster */
  spiegelDaten(): { status: Status; spieler: Spieler[]; ich: Bearbeiter; ungelesen: number } {
    return { status: this.status, spieler: this.spieler, ich: this.ich, ungelesen: this.ungeleseneChats };
  }

  get aktiv(): boolean {
    return this.status.rolle !== "aus";
  }

  /** Darf ich das? (als Host immer) */
  darf(r: Berechtigung): boolean {
    if (this.status.rolle !== "client") return true;
    return this.spieler.find((s) => s.pid === this.ich.pid)?.rechte[r] ?? STANDARD_RECHTE[r];
  }

  setName(name: string): void {
    this.ich = { ...this.ich, name: name.trim().slice(0, 30) || "Disponent" };
    lsSet("leitwerk.name", this.ich.name);
    sim.ich = this.ich;
  }

  // ------------------------------------------------------------------ Starten

  /** Startet ein Spiel als Host mit dem aktuellen Stand. Gibt den Code zurück. */
  async hosten(name: string): Promise<string> {
    this.setName(name);
    for (let versuch = 0; versuch < 6; versuch++) {
      const code = String(100000 + Math.floor(Math.random() * 900000));
      this.token = zufallsId();
      try {
        await this.verbinden("host", code, true);
        lsSet(`leitwerk.host.${code}`, this.token);
        return code;
      } catch (e) {
        if (!/belegt/i.test(String(e))) throw e;
      }
    }
    throw new Error("Kein freier Code gefunden – bitte nochmal versuchen");
  }

  /** Nach einem Absturz: dasselbe Spiel (gleicher Code) wieder als Host aufnehmen. */
  async hostFortsetzen(code: string, name: string): Promise<void> {
    const t = lsGet(`leitwerk.host.${code}`);
    if (!t) throw new Error("Für dieses Spiel ist kein Host-Schlüssel gespeichert");
    this.setName(name);
    this.token = t;
    await this.verbinden("host", code, false);
  }

  /** Code des letzten Spiels (als Mitspieler) und ob man es als Host fortsetzen kann */
  letztesSpiel(): { code: string | null; hostCode: (c: string) => boolean } {
    return { code: lsGet("leitwerk.letztesSpiel"), hostCode: (c) => !!lsGet(`leitwerk.host.${c}`) };
  }

  /** Tritt einem Spiel bei. */
  async beitreten(code: string, name: string): Promise<void> {
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) throw new Error("Der Code hat 6 Ziffern");
    this.setName(name);
    await this.verbinden("client", c, false);
    lsSet("leitwerk.letztesSpiel", c);
  }

  /** Verlässt das Spiel. Der Host meldet sich bei allen ab. */
  verlassen(): void {
    if (this.status.rolle === "host") this.anAlle({ t: "bye" });
    const warClient = this.status.rolle === "client";
    this.absichtlichZu = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.deltaTimer);
    this.ws?.close(1000, "verlassen");
    this.ws = null;
    for (const o of this.offen.values()) {
      window.clearTimeout(o.timer);
      o.reject(new Error("Spiel verlassen"));
    }
    this.offen.clear();
    sim.remote = null;
    sim.mode = "solo";
    if (warClient) {
      // Zurück zu den eigenen Daten und einer leeren Leitstelle
      store.leaveSession();
      sim.neu();
    }
    this.status = { rolle: "aus", code: "", verbunden: false, hostDa: false, hostVerlassen: false, fehler: null };
    this.spieler = [];
    lsSet("leitwerk.letztesSpiel", null);
    this.emit();
  }

  /** Mitspieler übernimmt die Host-Rolle (wenn der Host weg ist). */
  /** Mitspieler bittet den (anwesenden) Host um die Host-Rolle */
  hostAnfragen(): void {
    if (this.status.rolle !== "client" || !this.status.hostDa) return;
    this.sendeRoh({ t: "host-anfrage" });
  }

  /** Host gibt die Host-Rolle an einen Mitspieler ab, ohne dass jemand die Verbindung verliert */
  hostUebergeben(pid: string): void {
    if (this.status.rolle !== "host") return;
    const ziel = this.spieler.find((s) => s.pid === pid && s.online && !s.host);
    if (!ziel) return;
    // Letzten Stand noch an alle, dann übergeben
    this.deltaSenden();
    void sim.call("chat", `${this.ich.name} übergibt die Host-Rolle an ${ziel.name}`);
    this.deltaSenden();
    this.sendeRoh({ relay: "handover", pid, token: zufallsId() });
    this.alsMitspieler();
    this.melden(`${ziel.name} ist jetzt Host – du spielst als Mitspieler weiter`);
  }

  /** In den Mitspieler-Modus wechseln (eigene Daten bleiben geschützt) */
  private alsMitspieler(): void {
    window.clearInterval(this.deltaTimer);
    sim.pause();
    if (!store.inSession) store.enterSession(store.snapshot());
    this.status = { ...this.status, rolle: "client", hostDa: true, hostVerlassen: false };
    this.clientModus();
    this.emit();
  }

  private clientModus(): void {
    sim.mode = "client";
    sim.istOnline = null;
    sim.onlineSpieler = null;
    sim.remote = (name, args) => this.anfrage({ t: "cmd", name, args });
    store.remote = (name: StoreBefehl, args) => {
      void this.anfrage({ t: "scmd", name, args }).catch((e) => this.fehler(String(e.message ?? e)));
    };
  }

  hostUebernehmen(): void {
    if (this.status.rolle !== "client" || !this.ws) return;
    this.token = zufallsId();
    this.sendeRoh({ t: "claim-host", token: this.token });
  }

  // ------------------------------------------------------------------ Verbindung

  private verbinden(rolle: "host" | "client", code: string, neu: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      this.absichtlichZu = false;
      const p = new URLSearchParams({ role: rolle, pid: this.ich.pid, name: this.ich.name });
      if (rolle === "host") {
        p.set("token", this.token);
        if (neu) p.set("create", "1");
      }
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${RELAY_URL}/room/${code}?${p}`);
      } catch (e) {
        reject(e as Error);
        return;
      }
      let begruesst = false;
      // Lebenszeichen und Messung der Antwortzeit alle 5 s
      const ping = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (this.status.rolle === "client" && this.status.hostDa) {
          ws.send(JSON.stringify({ t: "ping", ts: Date.now(), rtt: this.rtt }));
        } else {
          this.pingGesendet = Date.now();
          ws.send("ping");
        }
      }, 5_000);
      ws.onmessage = (ev) => {
        if (ev.data === "pong") {
          // Host: Antwortzeit zum Server
          if (this.pingGesendet && this.status.rolle === "host") {
            const ich = this.spieler.find((x) => x.pid === this.ich.pid);
            if (ich) ich.ping = Date.now() - this.pingGesendet;
          }
          return;
        }
        let m: Nachricht;
        try {
          m = JSON.parse(String(ev.data)) as Nachricht;
        } catch {
          return;
        }
        if (!begruesst) {
          if (m.t === "error") {
            reject(new Error(String(m.reason)));
            this.absichtlichZu = true;
            return;
          }
          if (m.t === "welcome") {
            begruesst = true;
            this.ws = ws;
            this.retry = 0;
            this.angemeldet(rolle, code, m);
            resolve();
          }
          return;
        }
        this.empfangen(m);
      };
      ws.onerror = () => {
        if (!begruesst) reject(new Error("Server nicht erreichbar – besteht eine Internetverbindung?"));
      };
      ws.onclose = () => {
        window.clearInterval(ping);
        if (this.ws !== ws) return;
        this.ws = null;
        this.verbindungWeg();
      };
    });
  }

  private angemeldet(rolle: "host" | "client", code: string, m: Nachricht): void {
    const vorher = this.status.rolle;
    this.status = {
      rolle,
      code,
      verbunden: true,
      hostDa: rolle === "host" || Boolean(m.hostPresent),
      hostVerlassen: false,
      fehler: null,
    };
    if (rolle === "host") {
      this.alsHost(m.players as { pid: string; name: string; role: string }[]);
      if (vorher === "host" && this.warLaufend) sim.call("start");
    } else {
      this.clientModus();
    }
    this.emit();
  }

  private verbindungWeg(): void {
    window.clearInterval(this.deltaTimer);
    if (this.absichtlichZu || this.status.rolle === "aus") return;
    this.status = { ...this.status, verbunden: false };
    if (this.status.rolle === "host") {
      // Ohne Verbindung pausiert das Spiel – bei Rückkehr geht es weiter
      this.warLaufend = sim.state.laeuft || this.warLaufend;
      sim.pause();
    }
    this.emit();
    const warte = Math.min(10_000, 1000 * 2 ** this.retry);
    this.retry++;
    this.retryTimer = window.setTimeout(() => {
      const r = this.status.rolle;
      if (r === "aus") return;
      this.verbinden(r, this.status.code, false).catch((e) => {
        const msg = String((e as Error).message ?? e);
        if (/Host übernommen/.test(msg)) {
          // Während wir weg waren, hat jemand übernommen: als Mitspieler zurück
          this.alsMitspieler();
          this.status = { ...this.status, verbunden: false };
          this.melden(`${msg} – du spielst als Mitspieler weiter`);
          this.absichtlichZu = false;
          this.retry = 0;
          this.verbindungWeg();
          return;
        }
        if (/nicht gefunden|voll|Kein Zugriff/.test(msg)) {
          this.status = { ...this.status, fehler: msg };
          this.emit();
          return;
        }
        this.verbindungWeg();
      });
    }, warte);
  }

  private sendeRoh(m: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Host: an alle oder einen Mitspieler (große Nachrichten in Stücken) */
  private anAlle(d: Nachricht, to?: string): void {
    if (this.status.rolle !== "host" || !this.ws) return;
    const text = JSON.stringify(d);
    if (text.length <= CHUNK) {
      this.sendeRoh(to ? { to, d } : { d });
      return;
    }
    const id = zufallsId(4);
    const n = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < n; i++) {
      const teil = { t: "chunk", id, i, n, part: text.slice(i * CHUNK, (i + 1) * CHUNK) };
      this.sendeRoh(to ? { to, d: teil } : { d: teil });
    }
  }

  /** Mitspieler: Befehl an den Host, wartet auf die Antwort */
  private anfrage(m: Nachricht): Promise<unknown> {
    if (!this.ws || !this.status.hostDa) return Promise.reject(new Error("Kein Host verbunden – bitte warten"));
    const id = zufallsId(6);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.offen.delete(id);
        reject(new Error("Keine Antwort vom Host"));
      }, ANTWORT_TIMEOUT_MS);
      this.offen.set(id, { resolve, reject, timer });
      this.sendeRoh({ ...m, id });
    });
  }

  private fehler(text: string): void {
    this.status = { ...this.status, fehler: text };
    this.emit();
    window.setTimeout(() => {
      if (this.status.fehler === text) {
        this.status = { ...this.status, fehler: null };
        this.emit();
      }
    }, 6000);
  }

  // ------------------------------------------------------------------ Empfangen

  private empfangen(m: Nachricht): void {
    switch (m.t) {
      case "chunk": {
        const id = String(m.id);
        const teile = this.chunks.get(id) ?? [];
        teile[Number(m.i)] = String(m.part);
        this.chunks.set(id, teile);
        if (teile.filter((x) => x !== undefined).length === Number(m.n)) {
          this.chunks.delete(id);
          this.empfangen(JSON.parse(teile.join("")) as Nachricht);
        }
        return;
      }
      // ---- vom Relay
      case "join":
      case "leave":
      case "host-back":
      case "host-changed":
      case "host-gone":
        return this.relayEreignis(m);
      case "you-are-host":
        if (m.token) this.token = String(m.token);
        this.alsHost(m.players as { pid: string; name: string; role: string }[], true);
        if (m.von) this.melden(`${String(m.von)} hat dir die Host-Rolle übergeben`);
        this.emit();
        return;
      case "pong":
        this.rtt = Date.now() - Number(m.ts);
        return;
      case "error":
        this.fehler(String(m.reason));
        return;
      // ---- Host → Mitspieler
      case "full": {
        // Alle brauchen dieselben Straßenpakete, sonst stimmen Fahrzeiten und Vorschläge nicht überein
        const hostReg = ((m.regionen as string[] | undefined) ?? []).filter((r) => r !== "alt");
        const meine = aktiveRegionen().filter((r) => r !== "alt");
        if (hostReg.length && meine.length) {
          const fehlt = hostReg.filter((r) => !meine.includes(r));
          const zuviel = meine.filter((r) => !hostReg.includes(r));
          if (fehlt.length || zuviel.length) {
            const name = (l: string[]) => l.map((r) => REGIONEN[r] ?? r).join(", ");
            const text = `Andere Straßenpakete als der Host${fehlt.length ? ` – es fehlt: ${name(fehlt)}` : ""}${zuviel.length ? ` – bitte ausschalten: ${name(zuviel)}` : ""} (Einstellungen → Kartenpakete)`;
            this.verlassen();
            this.fehler(text);
            return;
          }
        }
      }
        store.enterSession(m.store as Persisted);
        sim.mode = "client";
        zustandUebernehmen(m.state as SimState);
        this.spieler = m.spieler as Spieler[];
        this.status = { ...this.status, hostDa: true, hostVerlassen: false };
        this.letzterChat = sim.state.chat?.length ?? 0;
        sim.notify();
        this.emit();
        return;
      case "delta":
        deltaAnwenden(m);
        return;
      case "store":
        store.enterSession(m.data as Persisted);
        return;
      case "session": {
        const neu = m.spieler as Spieler[];
        for (const s of neu) {
          const alt = this.spieler.find((x) => x.pid === s.pid);
          if (s.pid === this.ich.pid) continue;
          if (alt?.online && !s.online) this.melden(`${s.name} hat die Verbindung verloren`);
          if (alt && !alt.online && s.online) this.melden(`${s.name} ist wieder verbunden`);
          if (!alt && s.online) this.melden(`${s.name} ist beigetreten`);
        }
        this.spieler = neu;
        this.emit();
        return;
      }
      case "bye":
        this.status = { ...this.status, hostDa: false, hostVerlassen: true };
        this.emit();
        return;
      case "result": {
        const o = this.offen.get(String(m.id));
        if (!o) return;
        this.offen.delete(String(m.id));
        window.clearTimeout(o.timer);
        if (m.ok) o.resolve(m.value);
        else o.reject(new Error(String(m.error)));
        return;
      }
      // ---- Mitspieler → Host
      case "from":
        void this.befehlAusfuehren(String(m.pid), String(m.name), m.d as Nachricht);
        return;
    }
  }

  private relayEreignis(m: Nachricht): void {
    const players = (m.players as { pid: string; name: string; role: string }[]) ?? [];
    if (this.status.rolle === "host") {
      const vorher = new Map(this.spieler.map((s) => [s.pid, s.online]));
      this.spielerAbgleichen(players);
      if (m.t === "join") {
        this.voll(String(m.pid));
        this.melden(vorher.has(String(m.pid)) ? `${String(m.name)} ist wieder verbunden` : `${String(m.name)} ist beigetreten`);
      }
      if (m.t === "leave" && vorher.get(String(m.pid))) this.melden(`${String(m.name)} hat die Verbindung verloren`);
      this.anAlle({ t: "session", spieler: this.spieler });
    } else {
      if (m.t === "host-gone") this.status = { ...this.status, hostDa: false };
      if (m.t === "host-back" || m.t === "host-changed") this.status = { ...this.status, hostDa: true, hostVerlassen: false };
      // Spielerliste kommt vom Host; Online-Status hier sofort nachziehen
      const online = new Set(players.map((p) => p.pid));
      this.spieler = this.spieler.map((s) => ({ ...s, online: online.has(s.pid) }));
    }
    this.emit();
  }

  // ------------------------------------------------------------------ Host

  private alsHost(players: { pid: string; name: string; role: string }[], uebernommen = false): void {
    this.status = { ...this.status, rolle: "host", hostDa: true, verbunden: true, hostVerlassen: false };
    sim.mode = "host";
    sim.remote = null;
    sim.istOnline = (pid) => this.spieler.some((x) => x.pid === pid && x.online);
    sim.onlineSpieler = () => this.spieler.filter((x) => x.online).map((x) => ({ pid: x.pid, name: x.name }));
    sim.ich = this.ich;
    store.remote = null;
    // Nach einer Übernahme bleiben die Daten der Sitzung im Speicher (die eigenen Daten bleiben unberührt)
    this.spielerAbgleichen(players);
    this.delta.leeren();
    window.clearInterval(this.deltaTimer);
    this.deltaTimer = window.setInterval(() => this.deltaSenden(), DELTA_MS);
    this.voll();
    if (uebernommen) {
      lsSet(`leitwerk.host.${this.status.code}`, this.token);
      sim.call("chat", `${this.ich.name} hat das Spiel als Host übernommen`);
    }
  }

  private spielerAbgleichen(players: { pid: string; name: string; role: string }[]): void {
    const alt = new Map(this.spieler.map((s) => [s.pid, s]));
    const online = new Map(players.map((p) => [p.pid, p]));
    const neu: Spieler[] = [];
    const altIch = this.spieler.find((x) => x.pid === this.ich.pid);
    const ichHost: Spieler = {
      pid: this.ich.pid,
      name: this.ich.name,
      online: true,
      host: true,
      rechte: { disponieren: true, steuern: true, einstellungen: true, kt: true },
      ping: altIch?.ping ?? null,
    };
    neu.push(ichHost);
    for (const s of this.spieler) {
      if (s.pid === this.ich.pid) continue;
      const p = online.get(s.pid);
      const offlineSeit = p ? null : s.online ? Date.now() : (s.offlineSeit ?? Date.now());
      neu.push({ ...s, host: false, online: !!p, name: p?.name ?? s.name, offlineSeit, ping: p ? s.ping : null });
    }
    for (const p of players) {
      if (p.pid === this.ich.pid || neu.some((s) => s.pid === p.pid)) continue;
      neu.push({ pid: p.pid, name: p.name, online: true, host: false, rechte: { ...(alt.get(p.pid)?.rechte ?? STANDARD_RECHTE) } });
    }
    this.spieler = neu;
  }

  /** Host: allen den kompletten Stand neu schicken (z. B. nach dem Laden eines Spielstands) */
  neuSynchronisieren(): void {
    if (this.status.rolle !== "host") return;
    this.delta.leeren();
    this.voll();
  }

  /** Host ändert die Rechte eines Mitspielers */
  setRechte(pid: string, r: Berechtigung, an: boolean): void {
    const s = this.spieler.find((x) => x.pid === pid);
    if (!s || s.host) return;
    s.rechte = { ...s.rechte, [r]: an };
    this.anAlle({ t: "session", spieler: this.spieler });
    this.emit();
  }

  /** Vollständiger Stand an einen (oder alle) Mitspieler */
  private voll(to?: string): void {
    this.anAlle({ t: "full", state: sim.state, store: store.snapshot(), spieler: this.spieler, regionen: aktiveRegionen() }, to);
    if (!to) this.delta.merken();
  }



  private deltaSenden(): void {
    if (!this.ws || !this.spieler.some((s) => !s.host && s.online)) return;
    this.anAlle(this.delta.bauen());
    // alle 10 s die Spielerliste mit Antwortzeiten
    if (++this.sessionZaehler % 20 === 0) {
      this.anAlle({ t: "session", spieler: this.spieler });
      this.emit();
    }
  }



  private async befehlAusfuehren(pid: string, name: string, m: Nachricht): Promise<void> {
    const antwort = (ok: boolean, value?: unknown, error?: string) =>
      this.anAlle({ t: "result", id: m.id as string, ok, value, error }, pid);
    const s = this.spieler.find((x) => x.pid === pid);
    const rechte = s?.rechte ?? STANDARD_RECHTE;
    if (m.t === "ping") {
      if (s) s.ping = typeof m.rtt === "number" ? m.rtt : null;
      this.anAlle({ t: "pong", ts: m.ts }, pid);
      return;
    }
    if (m.t === "host-anfrage") {
      for (const fn of this.anfrageListeners) fn(pid, s?.name ?? name);
      return;
    }
    try {
      if (m.t === "cmd") {
        const befehl = String(m.name) as Befehl;
        const r = berechtigungFuer(befehl);
        if (r && !(rechte[r] ?? STANDARD_RECHTE[r])) return antwort(false, undefined, `Keine Berechtigung (${RECHTE_LABEL[r]})`);
        const value = await sim.ausfuehren(befehl, (m.args as unknown[]) ?? [], { pid, name: s?.name ?? name });
        antwort(true, value ?? null);
      } else if (m.t === "scmd") {
        if (!rechte.einstellungen) return antwort(false, undefined, "Keine Berechtigung (Einstellungen & Daten)");
        const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[String(m.name)];
        if (typeof fn !== "function") return antwort(false, undefined, "Unbekannter Befehl");
        fn.apply(store, (m.args as unknown[]) ?? []);
        if (m.name === "setSettings" || m.name === "resetSettings") sim.neuPlanen();
        antwort(true);
      }
    } catch (e) {
      antwort(false, undefined, String((e as Error).message ?? e));
    }
  }
}

export const mp = new Mehrspieler();
