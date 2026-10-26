// Test des Ticket-Dienstes ohne Cloudflare: Durable Object mit node:sqlite nachgebaut.
// Aufruf: node --experimental-sqlite ticketdienst/test/tickets-test.mjs
import { register } from "node:module";
import { DatabaseSync } from "node:sqlite";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, n) { if (s === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }", shortCircuit: true }; return n(s, c); }`),
);

const { default: oeffentlich, TicketStore, GRENZEN } = await import("../src/index.js");
const { default: admin, accessGueltig } = await import("../admin/src/index.js");

let fehler = 0;
const check = (ok, text) => {
  console.log(`${ok ? "OK    " : "FEHLER"} ${text}`);
  if (!ok) fehler++;
};

function fakeSql() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(q, ...b) {
      const st = db.prepare(q);
      const lesen = /^\s*(SELECT|WITH)/i.test(q) || /RETURNING/i.test(q);
      const rows = lesen ? st.all(...b) : (st.run(...b), []);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
}
const store = new TicketStore({ storage: { sql: fakeSql() } }, {});
const env = { TICKETS: { idFromName: () => "haupt", get: () => store } };

const anfrage = (pfad, opt = {}) => new Request(`https://tickets.test${pfad}`, { headers: { "content-type": "application/json", "cf-connecting-ip": opt.ip ?? "1.2.3.4", ...(opt.headers ?? {}) }, method: opt.method ?? "GET", body: opt.body ? JSON.stringify(opt.body) : undefined });

// Hilfe-Liste
let r = await oeffentlich.fetch(anfrage("/api/hilfe"), env);
let j = await r.json();
check(r.status === 200 && j.punkte.length === 7 && j.punkte[0].titel.includes("NÖ-01") && j.punkte.some((p) => /Johanniter/.test(p.titel)), `Startliste: ${j.punkte.length} Punkte`);
check(r.headers.get("access-control-allow-origin") === "*", "CORS für LeitWerk");

// Ticket anlegen
const ticket = { art: "poi", titel: "Neuer POI: Freibad Testort", text: "fehlt", daten: { name: "Freibad Testort", lat: 48.2, lon: 15.6 }, importCsv: "id;name;typ\nx;Freibad Testort;freibad", kontakt: "Max", hilfeId: "fg-03", version: "0.67.0", funkgruppe: "NÖ-03", anhaenge: [{ name: "liste.csv", inhalt: "a;b\n1;2" }, { name: "notiz.txt", inhalt: "x".repeat(1_500_000) }] };
r = await oeffentlich.fetch(anfrage("/api/tickets", { method: "POST", body: ticket }), env);
j = await r.json();
check(r.status === 200 && j.nr === 1 && /^[0-9a-f]{32}$/.test(j.geheim), `Ticket angelegt: #${j.nr}`);
const eins = j;

// Prüfungen
const fehlt = async (b, was) => {
  const x = await oeffentlich.fetch(anfrage("/api/tickets", { method: "POST", body: b, ip: "9.9.9.9" }), env);
  const y = await x.json();
  check(x.status >= 400 && !!y.fehler, `abgelehnt: ${was} (${y.fehler})`);
};
await fehlt({ ...ticket, art: "virus" }, "unbekannte Art");
await fehlt({ ...ticket, titel: "" }, "ohne Titel");
await fehlt({ ...ticket, anhaenge: [{ name: "boese.exe", inhalt: "MZ" }] }, ".exe");
await fehlt({ ...ticket, anhaenge: [{ name: "gross.csv", inhalt: "y".repeat(GRENZEN.dateiBytes + 10) }] }, "Datei über 2 MB");
await fehlt({ ...ticket, anhaenge: Array.from({ length: 6 }, (_, i) => ({ name: `d${i}.txt`, inhalt: "x" })) }, "mehr als 5 Anhänge");
await fehlt({ ...ticket, anhaenge: [1, 2, 3].map((i) => ({ name: `d${i}.txt`, inhalt: "z".repeat(1_900_000) })) }, "zusammen über 5 MB");

// Grenze je Stunde
let letzter = 0;
for (let i = 0; i < GRENZEN.proStunde + 2; i++) letzter = (await oeffentlich.fetch(anfrage("/api/tickets", { method: "POST", body: { art: "vorschlag", titel: `T${i}` }, ip: "5.5.5.5" }), env)).status;
check(letzter === 429, `Grenze ${GRENZEN.proStunde} Tickets je Stunde und Adresse`);

// Stand nur mit Geheimwort
r = await oeffentlich.fetch(anfrage("/api/status", { method: "POST", body: { tickets: [{ nr: eins.nr, geheim: eins.geheim }, { nr: eins.nr, geheim: "falsch" }, { nr: 999, geheim: "x" }] } }), env);
j = await r.json();
check(j.tickets.length === 1 && j.tickets[0].status === "eingegangen", "Stand nur mit dem richtigen Geheimwort");

// Admin: ohne Einrichtung gesperrt
r = await admin.fetch(new Request("https://admin.test/api/tickets"), { ...env, ACCESS_TEAM: "", ACCESS_AUD: "" });
check(r.status === 503, "Admin ohne Einrichtung gesperrt");
r = await admin.fetch(new Request("https://admin.test/api/tickets", { headers: { "cf-access-jwt-assertion": "a.b.c" } }), { ...env, ACCESS_TEAM: "team.cloudflareaccess.com", ACCESS_AUD: "aud1" });
check(r.status === 401, "falsches Access-Token: kein Zugang");
// Passwort
const pw = { ...env, ADMIN_PASSWORT: "geheim123" };
r = await admin.fetch(new Request("https://admin.test/api/tickets", { headers: { authorization: `Basic ${btoa("admin:falsch")}` } }), pw);
check(r.status === 401, "falsches Passwort: kein Zugang");
const mitPw = (pfad, opt = {}) => admin.fetch(new Request(`https://admin.test${pfad}`, { method: opt.method ?? "GET", headers: { authorization: `Basic ${btoa("admin:geheim123")}`, "content-type": "application/json" }, body: opt.body ? JSON.stringify(opt.body) : undefined }), pw);
r = await mitPw("/api/tickets");
j = await r.json();
check(r.status === 200 && j.length >= 2 && j.find((t) => t.nr === 1)?.anhaenge === 2, `Admin-Liste (${j.length} Tickets, Anhänge gezählt)`);
r = await mitPw("/api/tickets/1");
j = await r.json();
check(j.daten?.name === "Freibad Testort" && j.import_csv.includes("freibad") && !("geheim" in j) && j.anhaenge.length === 2, "Ticket-Details ohne Geheimwort");
r = await mitPw("/api/tickets/1/anhang?name=notiz.txt");
const t = await r.text();
check(t.length === 1_500_000, `großer Anhang wieder zusammengesetzt (${t.length} Zeichen)`);
r = await mitPw("/api/tickets/1", { method: "PATCH", body: { status: "eingebaut", version: "0.67.0", antwort: "Danke, ist drin!" } });
check((await r.json()).ok, "Stand setzen");
r = await oeffentlich.fetch(anfrage("/api/status", { method: "POST", body: { tickets: [{ nr: eins.nr, geheim: eins.geheim }] } }), env);
j = await r.json();
check(j.tickets[0].status === "eingebaut" && j.tickets[0].version === "0.67.0" && j.tickets[0].antwort === "Danke, ist drin!", "Nutzer sieht den neuen Stand mit Version und Antwort");
r = await mitPw("/api/hilfe", { method: "PUT", body: [{ id: "neu1", titel: "Neuer Punkt", text: "bitte helfen", art: "poi", aktiv: true }, { id: "fg-01", titel: "Fahrzeuge NÖ-01", art: "fahrzeug", aktiv: false }] });
j = await r.json();
r = await oeffentlich.fetch(anfrage("/api/hilfe"), env);
const h = (await r.json()).punkte;
check(j.ok && h.length === 1 && h[0].id === "neu1", "Hilfe-Liste bearbeiten (ausgeblendete Punkte fehlen öffentlich)");
r = await mitPw("/");
{ const html = await r.text(); check(r.status === 200 && html.includes("LeitWerk Tickets") && html.includes("[hidden]{display:none!important}"), "Admin-Seite (Reiter schalten wirklich um)"); }

// Entwicklungsfortschritt
r = await oeffentlich.fetch(anfrage("/api/fortschritt"), env);
j = await r.json();
check(r.status === 200 && j.punkte.length === 8 && j.punkte.some((p) => p.stand === "arbeit" && p.prozent > 0) && j.punkte.every((p) => !/notruf n(ö|oe)|leosim|lstsim/i.test(p.titel + p.text)), `Fortschritt: ${j.punkte.length} Punkte, ohne Quellen`);
r = await mitPw("/api/fortschritt", { method: "PUT", body: [{ id: "a", titel: "Neu A", stand: "arbeit", prozent: 140 }, { id: "b", titel: "Versteckt", stand: "geplant", prozent: 0, aktiv: false }, { id: "c", titel: "Fertig C", stand: "fertig", prozent: 100 }] });
j = await r.json();
r = await oeffentlich.fetch(anfrage("/api/fortschritt"), env);
const fs = (await r.json()).punkte;
check(j.ok && fs.length === 2 && fs[0].id === "a" && fs[0].prozent === 100 && fs[1].stand === "fertig", "Fortschritt bearbeiten (Prozent begrenzt, ausgeblendete fehlen öffentlich)");
r = await oeffentlich.fetch(anfrage("/api/tickets", { method: "POST", body: { art: "idee", titel: "Nachtmodus für Funk", text: "wäre fein" }, ip: "7.7.7.7" }), env);
check(r.status === 200 && (await r.json()).nr > 0, "Idee/Wunsch als Ticket");
r = await mitPw("/");
check((await r.text()).includes("Entwicklungsfortschritt"), "Admin-Seite hat den Reiter Entwicklungsfortschritt");

// Access-Token prüfen (mit eigenem Schlüssel)
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const jwt = async (inhalt) => {
  const kopfInhalt = `${b64({ alg: "RS256", kid: "k1" })}.${b64(inhalt)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(kopfInhalt));
  return `${kopfInhalt}.${Buffer.from(sig).toString("base64url")}`;
};
globalThis.fetch = async (u) => ({ json: async () => (String(u).includes("/cdn-cgi/access/certs") ? { keys: [jwk] } : {}) });
const team = "team.cloudflareaccess.com";
const gut = await jwt({ aud: ["aud1"], exp: Math.floor(Date.now() / 1000) + 600, iss: `https://${team}`, email: "paul@example" });
check(await accessGueltig(gut, team, "aud1"), "gültiges Access-Token wird angenommen");
check(!(await accessGueltig(gut, team, "andere")), "falsche Audience abgelehnt");
check(!(await accessGueltig(await jwt({ aud: ["aud1"], exp: Math.floor(Date.now() / 1000) - 10, iss: `https://${team}` }), team, "aud1")), "abgelaufenes Token abgelehnt");
const teile = gut.split(".");
check(!(await accessGueltig(`${teile[0]}.${b64({ aud: ["aud1"], exp: 9e9, iss: `https://${team}` })}.${teile[2]}`, team, "aud1")), "verändertes Token abgelehnt");
r = await admin.fetch(new Request("https://admin.test/api/tickets", { headers: { "cf-access-jwt-assertion": gut } }), { ...env, ACCESS_TEAM: team, ACCESS_AUD: "aud1" });
check(r.status === 200, "Admin mit Access-Anmeldung");

console.log(`FEHLER: ${fehler}`);
process.exit(fehler ? 1 : 0);
