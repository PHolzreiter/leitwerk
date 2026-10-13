/**
 * LeitWerk Relay
 *
 * Vermittelt Nachrichten zwischen dem Host eines Spiels und seinen Mitspielern.
 * Jeder Raum (6-stelliger Code) ist ein Durable Object. Der Relay speichert keine
 * Spieldaten, er leitet nur weiter und meldet, wer kommt und geht.
 *
 * Verbindung: wss://<host>/room/<code>?role=host|client&pid=<id>&name=<name>&token=<hosttoken>&create=1
 *
 * Host → Relay:   {to?: pid, d: <Nachricht>}   (ohne "to": an alle Mitspieler)
 * Client → Relay: <Nachricht>                  (geht an den Host als {t:"from", pid, name, d})
 *                 {t:"claim-host", token}      (Host übernehmen, wenn keiner da ist)
 * Relay → alle:   {t:"welcome"|"join"|"leave"|"host-gone"|"host-back"|"host-changed"|"error", ...}
 */
import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS = 6;
/** Nach so langer Zeit ohne Host darf ein Code neu vergeben werden */
const ROOM_EXPIRY_MS = 12 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("LeitWerk Relay", { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    const m = url.pathname.match(/^\/room\/(\d{6})$/);
    if (!m) return new Response("Nicht gefunden", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket erwartet", { status: 426 });
    }
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
    return stub.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Lebenszeichen ohne Kosten beantworten (der Raum muss dafür nicht aufwachen)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  sockets() {
    return this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, a: ws.deserializeAttachment() || {} }))
      .filter((s) => !s.a.gone && !s.a.replaced);
  }

  hostSocket() {
    return this.sockets().find((s) => s.a.role === "host");
  }

  players() {
    return this.sockets().map((s) => ({ pid: s.a.pid, name: s.a.name, role: s.a.role }));
  }

  send(ws, msg) {
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {
      /* Verbindung schon weg */
    }
  }

  toClients(msg, exceptPid) {
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    for (const s of this.sockets()) if (s.a.role === "client" && s.a.pid !== exceptPid) this.send(s.ws, text);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "host" ? "host" : "client";
    const pid = (url.searchParams.get("pid") || "").slice(0, 64);
    const name = (url.searchParams.get("name") || "Spieler").slice(0, 40);
    const token = url.searchParams.get("token") || "";
    const create = url.searchParams.get("create") === "1";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const reject = (reason) => {
      server.accept();
      server.send(JSON.stringify({ t: "error", reason }));
      server.close(4000, reason.slice(0, 100));
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!pid) return reject("Spieler-ID fehlt");

    const stored = (await this.ctx.storage.get("room")) || null; // {token, lastHost}
    const host = this.hostSocket();
    const now = Date.now();

    if (role === "host") {
      const own = stored && stored.token === token;
      if (create) {
        const frei = !stored || own || (!host && now - (stored.lastHost || 0) > ROOM_EXPIRY_MS);
        if (!frei) return reject("Code belegt");
      } else if (!own) {
        // Code gehört inzwischen einem anderen Host (übernommen oder übergeben)
        if (stored) return reject(`${stored.name || "Ein anderer Spieler"} hat bereits den Host übernommen`);
        return reject("Kein Zugriff auf dieses Spiel als Host");
      }
      if (host && host.a.pid !== pid) {
        // Ein anderer Host ist verbunden (z. B. übernommen) – dieser kommt als Mitspieler zurück
        return reject(`${host.a.name} hat bereits den Host übernommen`);
      }
      await this.ctx.storage.put("room", { token, lastHost: now, name });
    } else {
      if (!stored) return reject("Spiel nicht gefunden – Code prüfen");
      if (!host && now - (stored.lastHost || 0) > ROOM_EXPIRY_MS) return reject("Spiel nicht gefunden – Code prüfen");
      const others = this.sockets().filter((s) => s.a.pid !== pid);
      if (others.length >= MAX_PLAYERS) return reject(`Spiel ist voll (höchstens ${MAX_PLAYERS} Spieler)`);
    }

    // Gleicher Spieler noch verbunden (Verbindungsabbruch nicht bemerkt)? Alte Verbindung schließen.
    for (const s of this.sockets()) {
      if (s.a.pid === pid) {
        s.ws.serializeAttachment({ ...s.a, replaced: true });
        try {
          s.ws.close(4001, "Neu verbunden");
        } catch {
          /* egal */
        }
      }
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid, name, role });
    const players = this.players();
    this.send(server, { t: "welcome", role, pid, players, hostPresent: role === "host" || !!this.hostSocket() });
    if (role === "host") {
      this.toClients({ t: "host-back", pid, name, players });
    } else {
      const h = this.hostSocket();
      if (h) this.send(h.ws, { t: "join", pid, name, players });
      this.toClients({ t: "join", pid, name, players }, pid);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const a = ws.deserializeAttachment() || {};
    if (typeof message !== "string") return;
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (a.role === "host") {
      if (msg.relay === "handover") {
        // Host übergibt an einen Mitspieler, ohne die Verbindung zu trennen
        const ziel = this.sockets().find((s) => s.a.pid === msg.pid && s.a.role === "client");
        if (!ziel) return this.send(ws, { t: "error", reason: "Spieler nicht verbunden" });
        a.role = "client";
        ws.serializeAttachment(a);
        ziel.a.role = "host";
        ziel.ws.serializeAttachment(ziel.a);
        await this.ctx.storage.put("room", { token: String(msg.token || ""), lastHost: Date.now(), name: ziel.a.name });
        const players = this.players();
        this.send(ziel.ws, { t: "you-are-host", players, token: String(msg.token || ""), von: a.name });
        this.toClients({ t: "host-changed", pid: ziel.a.pid, name: ziel.a.name, players });
        return;
      }
      const text = JSON.stringify(msg.d);
      if (msg.to) {
        for (const s of this.sockets()) if (s.a.pid === msg.to) this.send(s.ws, text);
      } else {
        this.toClients(text);
      }
      return;
    }
    if (msg && msg.t === "claim-host") {
      if (this.hostSocket()) return this.send(ws, { t: "error", reason: "Es ist bereits ein Host verbunden" });
      a.role = "host";
      ws.serializeAttachment(a);
      await this.ctx.storage.put("room", { token: String(msg.token || ""), lastHost: Date.now(), name: a.name });
      const players = this.players();
      this.send(ws, { t: "you-are-host", players });
      this.toClients({ t: "host-changed", pid: a.pid, name: a.name, players });
      return;
    }
    const h = this.hostSocket();
    if (h) this.send(h.ws, { t: "from", pid: a.pid, name: a.name, d: msg });
  }

  async webSocketClose(ws, code) {
    await this.gone(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, "");
    } catch {
      /* schon zu */
    }
  }

  async webSocketError(ws) {
    await this.gone(ws);
  }

  async gone(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.replaced || a.gone) return;
    ws.serializeAttachment({ ...a, gone: true });
    const players = this.players().filter((p) => p.pid !== a.pid);
    if (a.role === "host") {
      const stored = (await this.ctx.storage.get("room")) || {};
      await this.ctx.storage.put("room", { ...stored, lastHost: Date.now() });
      this.toClients({ t: "host-gone", pid: a.pid, name: a.name, players });
    } else {
      const h = this.hostSocket();
      if (h) this.send(h.ws, { t: "leave", pid: a.pid, name: a.name, players });
      this.toClients({ t: "leave", pid: a.pid, name: a.name, players }, a.pid);
    }
  }
}
