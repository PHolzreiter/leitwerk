// Automatischer Test des Relays (läuft nach jedem Deploy in GitHub Actions, Node 22).
const BASE = process.argv[2] || "wss://server.leitwerk.workers.dev";
const code = String(100000 + Math.floor(Math.random() * 900000));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? "OK  " : "FEHLER"} ${what}`);
  if (!ok) fails++;
};

function connect(params) {
  const url = `${BASE}/room/${code}?${new URLSearchParams(params)}`;
  const ws = new WebSocket(url);
  const inbox = [];
  ws.addEventListener("message", (e) => inbox.push(JSON.parse(e.data)));
  const opened = new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const next = async (pred, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
      await wait(50);
    }
    return null;
  };
  return { ws, inbox, opened, next };
}

const host = connect({ role: "host", pid: "h1", name: "Paul", token: "geheim1", create: "1" });
await host.opened;
const hw = await host.next((m) => m.t === "welcome");
check(hw && hw.role === "host", "Host angemeldet, Code " + code);

const c1 = connect({ role: "client", pid: "c1", name: "Max" });
await c1.opened;
check(!!(await c1.next((m) => m.t === "welcome")), "Mitspieler angemeldet");
check(!!(await host.next((m) => m.t === "join" && m.pid === "c1")), "Host erfährt vom Beitritt");

c1.ws.send(JSON.stringify({ t: "cmd", name: "alarmiere" }));
const f = await host.next((m) => m.t === "from");
check(f && f.pid === "c1" && f.d.name === "alarmiere", "Befehl Mitspieler → Host");

host.ws.send(JSON.stringify({ d: { t: "delta", x: 1 } }));
check(!!(await c1.next((m) => m.t === "delta")), "Daten Host → alle");
host.ws.send(JSON.stringify({ to: "c1", d: { t: "result", ok: true } }));
check(!!(await c1.next((m) => m.t === "result")), "Antwort Host → einzelner Spieler");

const groß = "x".repeat(600000);
host.ws.send(JSON.stringify({ d: { t: "chunk", data: groß } }));
const g = await c1.next((m) => m.t === "chunk");
check(g && g.data.length === 600000, "Große Nachricht (600 kB)");

// Sprechfunk: von jedem direkt an alle anderen
const c3 = connect({ role: "client", pid: "c3", name: "Pilot" });
await c3.opened;
await c3.next((m) => m.t === "welcome");
c3.ws.send(JSON.stringify({ relay: "funk", d: { k: "daten", n: 1 } }));
const fh = await host.next((m) => m.t === "funk");
check(fh && fh.pid === "c3" && fh.d.n === 1, "Sprechfunk Mitspieler → Host");
check(!!(await c1.next((m) => m.t === "funk" && m.pid === "c3")), "Sprechfunk Mitspieler → anderer Mitspieler");
host.ws.send(JSON.stringify({ relay: "funk", d: { k: "daten", n: 2 } }));
check(!!(await c3.next((m) => m.t === "funk" && m.pid === "h1" && m.d.n === 2)), "Sprechfunk Host → Mitspieler");
await wait(300);
check(!c3.inbox.some((m) => m.t === "funk" && m.pid === "c3"), "Sprechfunk kommt nicht zum Absender zurück");
c3.ws.close();
await host.next((m) => m.t === "leave" && m.pid === "c3");

// Mitspieler verbindet neu (gleiche ID)
const c1b = connect({ role: "client", pid: "c1", name: "Max" });
await c1b.opened;
check(!!(await c1b.next((m) => m.t === "welcome")), "Mitspieler neu verbunden");
await wait(500);

// Fremder Host bekommt den Code nicht
const fremd = connect({ role: "host", pid: "x", name: "X", token: "anders", create: "1" });
await fremd.opened;
const fe = await fremd.next((m) => m.t === "error");
check(fe && /belegt/.test(fe.reason), "Belegter Code wird abgelehnt");

// Host trennt sich
host.ws.close();
check(!!(await c1b.next((m) => m.t === "host-gone")), "Mitspieler erfährt: Host weg");

// Host kommt zurück
const host2 = connect({ role: "host", pid: "h1", name: "Paul", token: "geheim1" });
await host2.opened;
check(!!(await host2.next((m) => m.t === "welcome")), "Host wieder verbunden");
check(!!(await c1b.next((m) => m.t === "host-back")), "Mitspieler erfährt: Host zurück");
host2.ws.close();
await c1b.next((m) => m.t === "host-gone");

// Mitspieler übernimmt
c1b.ws.send(JSON.stringify({ t: "claim-host", token: "neu2" }));
check(!!(await c1b.next((m) => m.t === "you-are-host")), "Mitspieler übernimmt als Host");
const alt = connect({ role: "host", pid: "h1", name: "Paul", token: "geheim1" });
await alt.opened;
const ae = await alt.next((m) => m.t === "error");
check(!!ae && /übernommen/.test(ae.reason), "Alter Host wird nach Übernahme nicht mehr Host: " + (ae && ae.reason));

const unbekannt = new WebSocket(`${BASE}/room/000001?role=client&pid=z&name=Z`);
const ue = await new Promise((r) => unbekannt.addEventListener("message", (e) => r(JSON.parse(e.data))));
check(ue.t === "error", "Unbekannter Code wird abgelehnt");

// Übergabe ohne Trennung: neuer Host c1b übergibt an c2
const c2 = connect({ role: "client", pid: "c2", name: "Eva" });
await c2.opened;
await c2.next((m) => m.t === "welcome");
c1b.ws.send(JSON.stringify({ relay: "handover", pid: "c2", token: "tok3" }));
const yh = await c2.next((m) => m.t === "you-are-host");
check(yh && yh.token === "tok3", "Host-Übergabe ohne Trennung");
check(!!(await c1b.next((m) => m.t === "host-changed" && m.pid === "c2")), "Alter Host erfährt die Übergabe");
c1b.ws.send(JSON.stringify({ t: "cmd", name: "x" }));
check(!!(await c2.next((m) => m.t === "from" && m.pid === "c1")), "Alter Host ist jetzt Mitspieler");

for (const w of [c2.ws, c1.ws, c1b.ws, fremd.ws, alt.ws, unbekannt]) try { w.close(); } catch {}
console.log(fails ? `${fails} Fehler` : "Alles in Ordnung");
process.exit(fails ? 1 : 0);
