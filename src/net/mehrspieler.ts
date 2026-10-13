/**
 * Multiplayer: Verbindung über den Relay, Abgleich des Spielzustands und Befehle.
 *
 * Die Simulation läuft nur beim Host. Er schickt allen Mitspielern beim Beitritt den
 * vollständigen Zustand und danach zweimal pro Sekunde die Änderungen. Mitspieler
 * schicken ihre Eingaben als Befehle an den Host, der sie mit Berechtigungsprüfung
 * ausführt. Bricht eine Verbindung ab, wird automatisch neu verbunden.
 */
import { store, type StoreBefehl } from "../data/store";
import type { Persisted } from "../data/model";
import {
  berechtigungFuer,
  sim,
  type Bearbeiter,
  type Befehl,
  type Berechtigung,
  type Einsatz,
  type SimFahrzeug,
  type SimState,
} from "../sim/engine";

export const RELAY_URL = "wss://server.leitwerk.workers.dev";
const DELTA_MS = 500;
const CHUNK = 400_000;
const ANTWORT_TIMEOUT_MS = 15_000;

export type Rechte = Record<Berechtigung, boolean>;
export const STANDARD_RECHTE: Rechte = { disponieren: true, steuern: true, einstellungen: false };
export const RECHTE_LABEL: Record<Berechtigung, string> = {
  disponieren: "Disponieren",
  steuern: "Simulation steuern",
  einstellungen: "Einstellungen & Daten",
};

export interface Spieler {
  pid: string;
  name: string;
  online: boolean;
  host: boolean;
  rechte: Rechte;
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
  private offen = new Map<string, { resolve(v: unknown): void; reject(e: Error): void; timer: number }>();
  private chunks = new Map<string, string[]>();
  private cache = {
    fz: new Map<string, string>(),
    fahrt: new Map<string, unknown>(),
    pos: new Map<string, string>(),
    ein: new Map<string, string>(),
    einIds: "",
    fzIds: "",
    funk: "",
    chat: 0,
  };
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
      const ping = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 20_000);
      ws.onmessage = (ev) => {
        if (ev.data === "pong") return;
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
      sim.mode = "client";
      sim.remote = (name, args) => this.anfrage({ t: "cmd", name, args });
      store.remote = (name: StoreBefehl, args) => {
        void this.anfrage({ t: "scmd", name, args }).catch((e) => this.fehler(String(e.message ?? e)));
      };
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
        if (/anderer Spieler ist inzwischen Host/.test(msg)) {
          // Während wir weg waren, hat jemand übernommen: als Mitspieler zurück
          this.status = { ...this.status, rolle: "client" };
          sim.mode = "client";
          this.absichtlichZu = false;
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
        this.alsHost(m.players as { pid: string; name: string; role: string }[], true);
        this.emit();
        return;
      case "error":
        this.fehler(String(m.reason));
        return;
      // ---- Host → Mitspieler
      case "full":
        store.enterSession(m.store as Persisted);
        sim.mode = "client";
        this.zustandUebernehmen(m.state as SimState);
        this.spieler = m.spieler as Spieler[];
        this.status = { ...this.status, hostDa: true, hostVerlassen: false };
        this.letzterChat = sim.state.chat?.length ?? 0;
        sim.notify();
        this.emit();
        return;
      case "delta":
        this.deltaAnwenden(m);
        return;
      case "store":
        store.enterSession(m.data as Persisted);
        return;
      case "session":
        this.spieler = m.spieler as Spieler[];
        this.emit();
        return;
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
      this.spielerAbgleichen(players);
      if (m.t === "join") this.voll(String(m.pid));
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
    sim.ich = this.ich;
    store.remote = null;
    // Nach einer Übernahme bleiben die Daten der Sitzung im Speicher (die eigenen Daten bleiben unberührt)
    this.spielerAbgleichen(players);
    this.cacheLeeren();
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
    const ichHost: Spieler = { pid: this.ich.pid, name: this.ich.name, online: true, host: true, rechte: { disponieren: true, steuern: true, einstellungen: true } };
    neu.push(ichHost);
    for (const s of this.spieler) {
      if (s.pid === this.ich.pid) continue;
      const p = online.get(s.pid);
      neu.push({ ...s, host: false, online: !!p, name: p?.name ?? s.name });
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
    this.cacheLeeren();
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
    this.anAlle({ t: "full", state: sim.state, store: store.snapshot(), spieler: this.spieler }, to);
    if (!to) this.cacheMerken();
  }

  private cacheLeeren(): void {
    this.cache = { fz: new Map(), fahrt: new Map(), pos: new Map(), ein: new Map(), einIds: "", fzIds: "", funk: "", chat: 0 };
  }

  private fzSchluessel(fz: SimFahrzeug): string {
    const { lat: _a, lon: _b, fahrt: _c, ...rest } = fz;
    return JSON.stringify(rest);
  }

  private cacheMerken(): void {
    this.cacheLeeren();
    this.deltaBauen();
  }

  private deltaBauen(): Nachricht {
    const st = sim.state;
    const c = this.cache;
    const fz: SimFahrzeug[] = [];
    const pos: [string, number, number][] = [];
    for (const f of Object.values(st.fahrzeuge)) {
      const k = this.fzSchluessel(f);
      if (c.fz.get(f.id) !== k || c.fahrt.get(f.id) !== f.fahrt) {
        fz.push(f);
        c.fz.set(f.id, k);
        c.fahrt.set(f.id, f.fahrt);
        c.pos.set(f.id, `${f.lat},${f.lon}`);
        continue;
      }
      const p = `${f.lat},${f.lon}`;
      if (c.pos.get(f.id) !== p) {
        pos.push([f.id, f.lat, f.lon]);
        c.pos.set(f.id, p);
      }
    }
    const fzIds = Object.keys(st.fahrzeuge).join(",");
    const ein: Einsatz[] = [];
    for (const e of st.einsaetze) {
      const k = JSON.stringify(e);
      if (c.ein.get(e.id) !== k) {
        ein.push(e);
        c.ein.set(e.id, k);
      }
    }
    const einIds = st.einsaetze.map((e) => e.id).join(",");
    const funkTop = st.funk.slice(0, 60);
    const funkKey = JSON.stringify(funkTop);
    const d: Nachricht = {
      t: "delta",
      zeit: st.zeit,
      tempo: st.tempo,
      laeuft: st.laeuft,
      wetter: st.wetter,
      naechster: st.naechster,
      zaehler: st.zaehler,
      funkZaehler: st.funkZaehler,
    };
    if (fz.length) d.fz = fz;
    if (pos.length) d.pos = pos;
    if (fzIds !== c.fzIds) {
      d.fzIds = Object.keys(st.fahrzeuge);
      c.fzIds = fzIds;
    }
    if (ein.length) d.ein = ein;
    if (einIds !== c.einIds) {
      d.einIds = st.einsaetze.map((e) => e.id);
      c.einIds = einIds;
    }
    if (funkKey !== c.funk) {
      d.funk = funkTop;
      c.funk = funkKey;
    }
    const chatN = st.chat?.length ?? 0;
    if (chatN !== c.chat) {
      d.chat = st.chat;
      c.chat = chatN;
    }
    return d;
  }

  private deltaSenden(): void {
    if (!this.ws || !this.spieler.some((s) => !s.host && s.online)) return;
    this.anAlle(this.deltaBauen());
  }

  private deltaAnwenden(d: Nachricht): void {
    const st = sim.state;
    Object.assign(st, {
      zeit: d.zeit,
      tempo: d.tempo,
      laeuft: d.laeuft,
      wetter: d.wetter,
      naechster: d.naechster,
      zaehler: d.zaehler,
      funkZaehler: d.funkZaehler,
    });
    for (const f of (d.fz as SimFahrzeug[] | undefined) ?? []) {
      // Objekte behalten (die Oberfläche hält Verweise darauf), nur Inhalt ersetzen
      if (st.fahrzeuge[f.id]) Object.assign(st.fahrzeuge[f.id], f);
      else st.fahrzeuge[f.id] = f;
    }
    for (const [id, lat, lon] of (d.pos as [string, number, number][] | undefined) ?? []) {
      const f = st.fahrzeuge[id];
      if (f) {
        f.lat = lat;
        f.lon = lon;
      }
    }
    if (d.fzIds) {
      const ids = new Set(d.fzIds as string[]);
      for (const id of Object.keys(st.fahrzeuge)) if (!ids.has(id)) delete st.fahrzeuge[id];
    }
    if (d.ein || d.einIds) {
      const map = new Map(st.einsaetze.map((e) => [e.id, e]));
      for (const e of (d.ein as Einsatz[] | undefined) ?? []) {
        const alt = map.get(e.id);
        if (alt) Object.assign(alt, e);
        else map.set(e.id, e);
      }
      const order = (d.einIds as string[] | undefined) ?? st.einsaetze.map((e) => e.id).concat(((d.ein as Einsatz[]) ?? []).map((e) => e.id).filter((id) => !st.einsaetze.some((x) => x.id === id)));
      st.einsaetze = order.map((id) => map.get(id)).filter((e): e is Einsatz => !!e);
    }
    if (d.funk) {
      // Funk: die neuesten Meldungen kommen vom Host, ältere bleiben erhalten
      const neu = d.funk as SimState["funk"];
      const ids = new Set(neu.map((f) => f.id));
      st.funk = [...neu, ...st.funk.filter((f) => !ids.has(f.id) && f.id < (neu[neu.length - 1]?.id ?? 0))].slice(0, 300);
    }
    if (d.chat) st.chat = d.chat as SimState["chat"];
    sim.notify();
  }

  /** Vollständigen Stand übernehmen, vorhandene Objekte dabei weiterverwenden */
  private zustandUebernehmen(neu: SimState): void {
    const alt = sim.state;
    const fz: SimState["fahrzeuge"] = {};
    for (const [id, f] of Object.entries(neu.fahrzeuge)) fz[id] = alt.fahrzeuge[id] ? Object.assign(alt.fahrzeuge[id], f) : f;
    const altEin = new Map(alt.einsaetze.map((e) => [e.id, e]));
    const ein = neu.einsaetze.map((e) => (altEin.has(e.id) ? Object.assign(altEin.get(e.id)!, e) : e));
    sim.state = { ...neu, fahrzeuge: fz, einsaetze: ein, chat: neu.chat ?? [] };
  }

  private async befehlAusfuehren(pid: string, name: string, m: Nachricht): Promise<void> {
    const antwort = (ok: boolean, value?: unknown, error?: string) =>
      this.anAlle({ t: "result", id: m.id as string, ok, value, error }, pid);
    const s = this.spieler.find((x) => x.pid === pid);
    const rechte = s?.rechte ?? STANDARD_RECHTE;
    try {
      if (m.t === "cmd") {
        const befehl = String(m.name) as Befehl;
        const r = berechtigungFuer(befehl);
        if (r && !rechte[r]) return antwort(false, undefined, `Keine Berechtigung (${RECHTE_LABEL[r]})`);
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
