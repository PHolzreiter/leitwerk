/**
 * LeitWerk Ticket-Dienst (öffentlich)
 *
 * Nutzer schicken aus LeitWerk Tickets (fehlende Dienststellen, Fahrzeuge, POIs, Krankenhaus-Angaben,
 * Änderungsvorschläge) mit .txt/.csv-Anhängen. Sie bekommen eine Ticket-Nummer und ein Geheimwort
 * zurück, mit dem nur sie den Stand ihres Tickets abfragen können. Kein Schlüssel im Programm.
 *
 *   GET  /api/hilfe              → offene Punkte „Deine Hilfe wird gebraucht“
 *   POST /api/tickets            → Ticket anlegen  {art, titel, text, daten?, importCsv?, kontakt?, hilfeId?, version?, funkgruppe?, anhaenge?: [{name, inhalt}]}
 *   POST /api/status             → Stand eigener Tickets {tickets: [{nr, geheim}]}
 *   GET  /api/fortschritt        → Entwicklungsfortschritt (In Arbeit / Geplant, mit Prozent)
 *
 * Alles liegt in EINEM Durable Object (SQLite). Die Admin-Seite (Worker „tickets-admin“) benutzt es über RPC.
 */
import { DurableObject } from "cloudflare:workers";

export const ARTEN = ["dienststelle", "fahrzeug", "poi", "krankenhaus", "vorschlag", "hilfe", "idee"];
export const STATUS = ["eingegangen", "in_arbeit", "rueckfrage", "eingebaut", "erledigt", "abgelehnt"];
export const GRENZEN = {
  titel: 200,
  text: 8000,
  daten: 40_000,
  importCsv: 40_000,
  kontakt: 200,
  anhaenge: 5,
  dateiBytes: 2_000_000,
  gesamtBytes: 5_000_000,
  proStunde: 20,
};
/** SQLite im Durable Object speichert höchstens 2 MB je Wert – Anhänge werden in Teile zerlegt */
const TEIL = 400_000; // Zeichen – auch bei 4 Byte je Zeichen unter 2 MB

const START_HILFE = [
  ["fg-01", "Fahrzeuge NÖ-01 kontrollieren", "Stimmen Funkrufnamen, Typen (RTW-C, RTW, KTW, BEL) und Dienstzeiten in Amstetten, Waidhofen/Ybbs, Scheibbs, Melk, St. Pölten, Lilienfeld und Purkersdorf? Fehlt ein Fahrzeug oder ist eines zu viel?", "fahrzeug"],
  ["fg-02", "Fahrzeuge NÖ-02 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Gmünd, Waidhofen/Thaya, Horn und Zwettl?", "fahrzeug"],
  ["fg-03", "Fahrzeuge NÖ-03 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Krems, Tulln und Hollabrunn?", "fahrzeug"],
  ["fg-04", "Fahrzeuge NÖ-04 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Mistelbach, Gänserndorf und Korneuburg?", "fahrzeug"],
  ["fg-05", "Fahrzeuge NÖ-05 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Mödling, Bruck an der Leitha, Schwechat und Baden (Nord)?", "fahrzeug"],
  ["fg-06", "Fahrzeuge NÖ-06 kontrollieren", "Stimmen Funkrufnamen, Typen und Dienstzeiten in Wiener Neustadt, Neunkirchen und Baden (Süd)?", "fahrzeug"],
  ["juh-sek", "Sekundärfahrzeuge der Johanniter", "Welche SKTW, SRTW, SNAW und BIT haben die Johanniter in NÖ – mit Funkrufnamen, Dienstzeiten und Standorten (St. Pölten, Wiener Neudorf, Spillern, Zwettl, Stellplätze bei den Kliniken)?", "fahrzeug"],
];

/**
 * Liste Entwicklungsfortschritt: [id, titel, text, stand („arbeit“ | „geplant“ | „fertig“), prozent].
 * Wird einmal je FORTSCHRITT_STAND in den Dienst geschrieben (ersetzt dann die Liste) – danach gilt die Admin-Seite.
 */
export const FORTSCHRITT_STAND = "2026-10-30";
export const START_FORTSCHRITT = [
  ["nah-pilot", "Notarzthubschrauber selbst fliegen", "Als Pilot im Multiplayer mitspielen – mit oder ohne Flugsimulator (MSFS 2024, H145-Tablet und -Funkgerät, Sprechfunk, Großeinsatz). Noch offen: Verlegungsflüge, X-Plane", "arbeit", 85],
  ["grossschaden", "Großschadensfall", "Ab 6 Betroffenen: Schnelleinsatzgruppe und Bereitstellungsraum in zwei Schritten, Einsatzleitung vor Ort, Patienten einzeln buchen, Voraviso. Noch offen: weitere Einsatzarten (Betreuung, Suche) und Gebiete", "arbeit", 85],
  ["telefon", "Bessere Telefongespräche", "Natürlichere Anrufer und genauere Antworten in der Notrufabfrage", "arbeit", 75],
  ["funk", "Überarbeitung des Funksystems", "Funkverkehr mit Fahrzeugen klarer, schneller und realistischer – eigene Sprechgruppe beim Großeinsatz gibt es schon", "arbeit", 30],
  ["tablet", "Zweitbildschirm am Tablet", "Karte, Fahrzeuge und Krankenhäuser zusätzlich am Tablet im WLAN anzeigen", "geplant", 0],
  ["nah-verlegung", "Verlegungsflüge mit dem Hubschrauber", "Überstellungen zwischen Krankenhäusern als Auftrag für den Piloten", "geplant", 0],
  ["xplane", "X-Plane 12 für Piloten", "Hubschrauber auch mit X-Plane 12 fliegen", "geplant", 0],
  ["einsatzaufkommen", "Einsatzaufkommen nach Versorgungsstufe", "Realistische Verteilung über den Tag, Spielstufen Realistisch, Standard und Stressig", "fertig", 100],
  ["notfaelle", "100 neue Notfälle und neue Abfrage-Ansicht", "Mehr Abwechslung bei den Notrufen, Fragen bleiben stehen, Anleitungen am Telefon", "fertig", 100],
  ["zuweisung", "Krankenhaus-Zuweisung nach Symptom", "Symptom, Altersgruppe und Dringlichkeit bestimmen das Krankenhaus; freie Plätze sofort sichtbar", "fertig", 100],
  ["fahrzeugsuche", "Fahrzeugwahl mit Suche", "Alle verfügbaren Fahrzeuge in einer scrollbaren Liste, auch aus anderen Funkgruppen", "fertig", 100],
  ["sek-kt", "Fahrzeugwahl bei Überstellungen und Krankentransporten", "Vorschlag nach Dienstzeit, Suche, Alarmieren oder Vormerken", "fertig", 100],
  ["karte-info", "Info-Fenster auf der Karte", "Klick auf ein Fahrzeug zeigt Status und Ankunftszeit, ohne die Karte zu verlassen", "fertig", 100],
  ["kt-codes", "Transport-Codes mit Editor", "Codes für Krankentransporte und Überstellungen über Bedingungen, mit Editor und Prüfung", "fertig", 100],
  ["schema", "Eigenes Codesystem & eigene Schemas", "Eingebaute Codeliste mit Abfrage ab der Installation; eigene Codelisten und Abfrageschemas hochladen und wechseln", "fertig", 100],
];

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

async function sha256(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("LeitWerk Ticket-Dienst", { headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
    }
    const store = env.TICKETS.get(env.TICKETS.idFromName("haupt"));
    try {
      if (url.pathname === "/api/hilfe" && request.method === "GET") return json({ punkte: await store.hilfe(false) });
      if (url.pathname === "/api/fortschritt" && request.method === "GET") return json({ punkte: await store.fortschritt(false) });
      if (url.pathname === "/api/tickets" && request.method === "POST") {
        const laenge = Number(request.headers.get("content-length") ?? 0);
        if (laenge > 8_000_000) return json({ fehler: "Ticket zu groß" }, 413);
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ fehler: "Ungültiges Ticket" }, 400);
        }
        const ip = request.headers.get("cf-connecting-ip") ?? "unbekannt";
        // IP nur als Prüfsumme mit Tagessalz (für die Grenze je Stunde), nie im Klartext
        const ipHash = await sha256(`${ip}|${new Date().toISOString().slice(0, 10)}|leitwerk`);
        const r = await store.neu(body, ipHash);
        return json(r, r.fehler ? (r.code ?? 400) : 200);
      }
      if (url.pathname === "/api/status" && request.method === "POST") {
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ fehler: "Ungültige Anfrage" }, 400);
        }
        const liste = Array.isArray(body?.tickets) ? body.tickets.slice(0, 200) : [];
        return json({ tickets: await store.status(liste) });
      }
    } catch (e) {
      return json({ fehler: "Interner Fehler" }, 500);
    }
    return json({ fehler: "Nicht gefunden" }, 404);
  },
};

/** Text prüfen und kürzen */
function text(v, max) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/\u0000/g, "").slice(0, max).trim();
}

export class TicketStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tickets (
      nr INTEGER PRIMARY KEY AUTOINCREMENT, geheim TEXT NOT NULL, erstellt INTEGER NOT NULL, geaendert INTEGER NOT NULL,
      art TEXT NOT NULL, titel TEXT NOT NULL, text TEXT, daten TEXT, import_csv TEXT, kontakt TEXT, hilfe_id TEXT,
      app_version TEXT, funkgruppe TEXT, status TEXT NOT NULL DEFAULT 'eingegangen', version TEXT, antwort TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS anhaenge (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nr INTEGER NOT NULL, name TEXT NOT NULL, groesse INTEGER NOT NULL, teil INTEGER NOT NULL, inhalt TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hilfe (
      id TEXT PRIMARY KEY, titel TEXT NOT NULL, text TEXT, art TEXT, reihenfolge INTEGER NOT NULL DEFAULT 0, aktiv INTEGER NOT NULL DEFAULT 1, geaendert INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS fortschritt (
      id TEXT PRIMARY KEY, titel TEXT NOT NULL, text TEXT, stand TEXT NOT NULL DEFAULT 'geplant', prozent INTEGER NOT NULL DEFAULT 0,
      reihenfolge INTEGER NOT NULL DEFAULT 0, aktiv INTEGER NOT NULL DEFAULT 1, geaendert INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rate (ip TEXT NOT NULL, zeit INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
    const geimpft = this.sql.exec(`SELECT v FROM meta WHERE k = 'hilfe_start'`).toArray();
    if (!geimpft.length) {
      const t = Date.now();
      START_HILFE.forEach(([id, titel, txt, art], i) => this.sql.exec(`INSERT OR IGNORE INTO hilfe (id, titel, text, art, reihenfolge, aktiv, geaendert) VALUES (?, ?, ?, ?, ?, 1, ?)`, id, titel, txt, art, i, t));
      this.sql.exec(`INSERT INTO meta (k, v) VALUES ('hilfe_start', '1')`);
    }
    // Liste je Stand einmal schreiben (neuer Stand ersetzt die Liste; dazwischen gilt die Admin-Seite)
    const stand = this.sql.exec(`SELECT v FROM meta WHERE k = 'fortschritt_stand'`).toArray()[0]?.v;
    if (stand !== FORTSCHRITT_STAND) {
      const t = Date.now();
      this.sql.exec(`DELETE FROM fortschritt`);
      START_FORTSCHRITT.forEach(([id, titel, txt, stand, prozent], i) =>
        this.sql.exec(`INSERT OR IGNORE INTO fortschritt (id, titel, text, stand, prozent, reihenfolge, aktiv, geaendert) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`, id, titel, txt, stand, prozent, i, t),
      );
      this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('fortschritt_stand', ?)`, FORTSCHRITT_STAND);
    }
  }

  // ---------------------------------------------------------------- öffentlich

  /** offene Punkte (alle = auch abgeschaltete, für die Admin-Seite) */
  hilfe(alle) {
    const rows = this.sql.exec(`SELECT id, titel, text, art, reihenfolge, aktiv FROM hilfe ${alle ? "" : "WHERE aktiv = 1"} ORDER BY reihenfolge, titel`).toArray();
    return rows.map((r) => ({ id: r.id, titel: r.titel, text: r.text ?? "", art: r.art ?? "", reihenfolge: r.reihenfolge, aktiv: !!r.aktiv }));
  }

  /** Entwicklungsfortschritt (alle = auch ausgeblendete, für die Admin-Seite) */
  fortschritt(alle) {
    const rows = this.sql.exec(`SELECT id, titel, text, stand, prozent, reihenfolge, aktiv, geaendert FROM fortschritt ${alle ? "" : "WHERE aktiv = 1"} ORDER BY reihenfolge, titel`).toArray();
    return rows.map((r) => ({ id: r.id, titel: r.titel, text: r.text ?? "", stand: r.stand === "arbeit" ? "arbeit" : r.stand === "fertig" ? "fertig" : "geplant", prozent: r.prozent, reihenfolge: r.reihenfolge, aktiv: !!r.aktiv, geaendert: r.geaendert }));
  }

  /** Ticket anlegen (mit Prüfung und Grenze je Stunde) */
  neu(b, ipHash) {
    const jetzt = Date.now();
    if (!b || typeof b !== "object") return { fehler: "Ungültiges Ticket" };
    const art = String(b.art ?? "");
    if (!ARTEN.includes(art)) return { fehler: "Unbekannte Art" };
    const titel = text(b.titel, GRENZEN.titel);
    if (!titel) return { fehler: "Titel fehlt" };
    // Grenze je Stunde
    this.sql.exec(`DELETE FROM rate WHERE zeit < ?`, jetzt - 3_600_000);
    const n = this.sql.exec(`SELECT COUNT(*) AS n FROM rate WHERE ip = ?`, ipHash).one().n;
    if (n >= GRENZEN.proStunde) return { fehler: "Zu viele Tickets in kurzer Zeit – bitte später noch einmal", code: 429 };
    let daten = "";
    if (b.daten !== undefined && b.daten !== null) {
      daten = JSON.stringify(b.daten);
      if (daten.length > GRENZEN.daten) return { fehler: "Angaben zu groß" };
    }
    const importCsv = text(b.importCsv, GRENZEN.importCsv);
    // Anhänge: nur .txt und .csv, als Text
    const anh = Array.isArray(b.anhaenge) ? b.anhaenge : [];
    if (anh.length > GRENZEN.anhaenge) return { fehler: `Höchstens ${GRENZEN.anhaenge} Anhänge` };
    let gesamt = 0;
    const dateien = [];
    for (const a of anh) {
      const name = text(a?.name, 120).replace(/[\\/:*?"<>|]/g, "_");
      if (!/\.(txt|csv)$/i.test(name)) return { fehler: `Nur .txt- und .csv-Dateien erlaubt (${name || "ohne Namen"})` };
      const inhalt = typeof a?.inhalt === "string" ? a.inhalt : "";
      if (inhalt.includes("\u0000")) return { fehler: `${name} ist keine Textdatei` };
      const bytes = new TextEncoder().encode(inhalt).length;
      if (bytes > GRENZEN.dateiBytes) return { fehler: `${name} ist größer als 2 MB` };
      gesamt += bytes;
      dateien.push({ name, inhalt, bytes });
    }
    if (gesamt > GRENZEN.gesamtBytes) return { fehler: "Anhänge zusammen größer als 5 MB" };
    const geheim = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const nr = this.sql
      .exec(
        `INSERT INTO tickets (geheim, erstellt, geaendert, art, titel, text, daten, import_csv, kontakt, hilfe_id, app_version, funkgruppe)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING nr`,
        geheim, jetzt, jetzt, art, titel, text(b.text, GRENZEN.text), daten, importCsv, text(b.kontakt, GRENZEN.kontakt),
        text(b.hilfeId, 60), text(b.version, 30), text(b.funkgruppe, 10),
      )
      .one().nr;
    for (const d of dateien) {
      for (let i = 0, teil = 0; i < Math.max(1, d.inhalt.length); i += TEIL, teil++) {
        this.sql.exec(`INSERT INTO anhaenge (nr, name, groesse, teil, inhalt) VALUES (?, ?, ?, ?, ?)`, nr, d.name, d.bytes, teil, d.inhalt.slice(i, i + TEIL));
      }
    }
    this.sql.exec(`INSERT INTO rate (ip, zeit) VALUES (?, ?)`, ipHash, jetzt);
    return { nr, geheim, status: "eingegangen", erstellt: jetzt };
  }

  /** Stand der eigenen Tickets (nur mit dem passenden Geheimwort) */
  status(liste) {
    const out = [];
    for (const x of liste) {
      const nr = Number(x?.nr);
      if (!Number.isInteger(nr)) continue;
      const r = this.sql.exec(`SELECT nr, geheim, status, version, antwort, geaendert FROM tickets WHERE nr = ?`, nr).toArray()[0];
      if (!r || r.geheim !== String(x.geheim ?? "")) continue;
      out.push({ nr: r.nr, status: r.status, version: r.version ?? "", antwort: r.antwort ?? "", geaendert: r.geaendert });
    }
    return out;
  }

  // ---------------------------------------------------------------- Admin (nur über den Worker „tickets-admin“)

  liste(filter = {}) {
    const w = [];
    const p = [];
    if (filter.status) {
      w.push("status = ?");
      p.push(String(filter.status));
    }
    if (filter.art) {
      w.push("art = ?");
      p.push(String(filter.art));
    }
    const rows = this.sql
      .exec(
        `SELECT t.nr, t.erstellt, t.geaendert, t.art, t.titel, t.status, t.version, t.funkgruppe, t.hilfe_id, t.kontakt,
                (SELECT COUNT(DISTINCT name) FROM anhaenge a WHERE a.nr = t.nr) AS anhaenge
         FROM tickets t ${w.length ? `WHERE ${w.join(" AND ")}` : ""} ORDER BY t.nr DESC LIMIT 500`,
        ...p,
      )
      .toArray();
    return rows;
  }

  ticket(nr) {
    const r = this.sql.exec(`SELECT * FROM tickets WHERE nr = ?`, Number(nr)).toArray()[0];
    if (!r) return null;
    const { geheim: _g, ...rest } = r;
    const anh = this.sql.exec(`SELECT MIN(id) AS id, name, MAX(groesse) AS groesse FROM anhaenge WHERE nr = ? GROUP BY name ORDER BY MIN(id)`, Number(nr)).toArray();
    return { ...rest, daten: r.daten ? JSON.parse(r.daten) : null, anhaenge: anh };
  }

  anhang(nr, name) {
    const teile = this.sql.exec(`SELECT inhalt FROM anhaenge WHERE nr = ? AND name = ? ORDER BY teil`, Number(nr), String(name)).toArray();
    return teile.length ? teile.map((x) => x.inhalt).join("") : null;
  }

  setze(nr, patch) {
    const r = this.sql.exec(`SELECT nr FROM tickets WHERE nr = ?`, Number(nr)).toArray()[0];
    if (!r) return { fehler: "Ticket nicht gefunden" };
    const status = patch.status !== undefined ? String(patch.status) : undefined;
    if (status !== undefined && !STATUS.includes(status)) return { fehler: "Unbekannter Status" };
    this.sql.exec(
      `UPDATE tickets SET status = COALESCE(?, status), version = COALESCE(?, version), antwort = COALESCE(?, antwort), geaendert = ? WHERE nr = ?`,
      status ?? null, patch.version !== undefined ? text(patch.version, 30) : null, patch.antwort !== undefined ? text(patch.antwort, 2000) : null, Date.now(), Number(nr),
    );
    return { ok: true };
  }

  loesche(nr) {
    this.sql.exec(`DELETE FROM anhaenge WHERE nr = ?`, Number(nr));
    this.sql.exec(`DELETE FROM tickets WHERE nr = ?`, Number(nr));
    return { ok: true };
  }

  /** Liste Entwicklungsfortschritt ersetzen */
  fortschrittSpeichern(punkte) {
    if (!Array.isArray(punkte)) return { fehler: "Liste erwartet" };
    const t = Date.now();
    this.sql.exec(`DELETE FROM fortschritt`);
    punkte.slice(0, 100).forEach((x, i) => {
      const id = text(x?.id, 60) || `f${t}-${i}`;
      const titel = text(x?.titel, 200);
      if (!titel) return;
      const stand = ["arbeit", "geplant", "fertig"].includes(x?.stand) ? x.stand : "geplant";
      const prozent = Math.max(0, Math.min(100, Math.round(Number(x?.prozent) || 0)));
      this.sql.exec(`INSERT OR REPLACE INTO fortschritt (id, titel, text, stand, prozent, reihenfolge, aktiv, geaendert) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, titel, text(x?.text, 2000), stand, prozent, i, x?.aktiv === false ? 0 : 1, t);
    });
    return { ok: true, punkte: this.fortschritt(true) };
  }

  /** Liste „Deine Hilfe wird gebraucht“ ersetzen */
  hilfeSpeichern(punkte) {
    if (!Array.isArray(punkte)) return { fehler: "Liste erwartet" };
    const t = Date.now();
    this.sql.exec(`DELETE FROM hilfe`);
    punkte.slice(0, 100).forEach((x, i) => {
      const id = text(x?.id, 60) || `p${t}-${i}`;
      const titel = text(x?.titel, 200);
      if (!titel) return;
      this.sql.exec(`INSERT OR REPLACE INTO hilfe (id, titel, text, art, reihenfolge, aktiv, geaendert) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, titel, text(x?.text, 2000), text(x?.art, 20), i, x?.aktiv === false ? 0 : 1, t);
    });
    return { ok: true, punkte: this.hilfe(true) };
  }
}
