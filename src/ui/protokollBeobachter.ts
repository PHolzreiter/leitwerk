/**
 * Schreibt mit, was im Spiel passiert (für das laufende Protokoll): jeder Funkspruch, Wechsel im Funkgespräch,
 * wer sendet bzw. wartet, Spieler (beitreten, trennen, Pilot/Disponent), Einsatz-Protokoll und Statusmeldungen.
 * Läuft bei jedem Spieler (Host, Mitspieler, Pilot) – jeder hat sein eigenes Protokoll.
 */
import { protokoll } from "../protokoll";
import { mp } from "../net/mehrspieler";
import { sim } from "../sim/engine";

const spruecheGesehen = new Map<number, number>();
const statusGesehen = new Map<number, string>();
const einsatzGesehen = new Map<string, number>();
let funkZuletzt = "";
let sendetZuletzt = "";
let wartetZuletzt = "";
let spielerZuletzt = "";
let erstesMal = true;

function rolle(pid: string): string {
  const h = sim.pilotVon(pid);
  return h ? `Pilot ${sim.rufname(h)}` : "Disponent";
}

function pruefen(): void {
  const st = sim.state;
  // Funkgespräche: neue Sprüche und Statuswechsel
  for (const g of st.funkGespraeche ?? []) {
    const alt = spruecheGesehen.get(g.id) ?? 0;
    if (!erstesMal)
      for (let i = alt; i < g.sprueche.length; i++) {
        const s = g.sprueche[i];
        protokoll("funk", {
          g: g.id,
          fz: g.funkname,
          an: g.an?.funkname,
          gruppe: g.kanal ?? "normal",
          von: s.von,
          text: s.text,
          wer: s.wer,
          quelle: s.quelle ?? (s.stimme ? "mensch" : s.von === "LEO" ? "leo" : "fest/ki"),
          stimme: s.stimme || undefined,
          fuehrer: g.fuehrer?.name,
          status: g.status,
        });
      }
    spruecheGesehen.set(g.id, g.sprueche.length);
    const sa = statusGesehen.get(g.id);
    if (sa !== g.status) {
      if (!erstesMal) protokoll("funkStatus", { g: g.id, fz: g.funkname, an: g.an?.funkname, von: sa, nach: g.status, gruppe: g.kanal ?? "normal", anliegen: g.anliegen?.art, fuehrer: g.fuehrer?.name, mensch: g.mensch || undefined });
      statusGesehen.set(g.id, g.status);
    }
  }
  if (spruecheGesehen.size > 400) for (const k of [...spruecheGesehen.keys()].slice(0, 200)) (spruecheGesehen.delete(k), statusGesehen.delete(k));
  // Kanal: wer sendet, wer wartet
  const s = st.funkSendet;
  const sk = s ? `${s.pid}|${s.von}|${s.gruppe ?? "normal"}|${s.seit}` : "";
  if (sk !== sendetZuletzt) {
    if (!erstesMal) protokoll("kanal", s ? { sendet: s.von, wer: s.name, gruppe: s.gruppe ?? "normal", g: s.gId } : { sendet: null });
    sendetZuletzt = sk;
  }
  const w = st.funkWartet;
  const wk = w ? `${w.pid}|${w.von}|${w.gruppe ?? "normal"}` : "";
  if (wk !== wartetZuletzt) {
    if (!erstesMal) protokoll("kanal", w ? { wartet: w.von, wer: w.name, gruppe: w.gruppe ?? "normal" } : { wartet: null });
    wartetZuletzt = wk;
  }
  // Statusmeldungen (neueste zuerst)
  const f = st.funk?.[0];
  const fk = f ? `${f.zeit}|${f.von}|${f.text}` : "";
  if (fk !== funkZuletzt) {
    if (!erstesMal && f) {
      const neu = [];
      for (const x of st.funk.slice(0, 20)) {
        if (`${x.zeit}|${x.von}|${x.text}` === funkZuletzt) break;
        neu.push(x);
      }
      for (const x of neu.reverse()) protokoll("status", { von: x.von, text: x.text, spielzeit: new Date(x.zeit).toISOString() });
    }
    funkZuletzt = fk;
  }
  // Einsatz-Protokoll (Alarmierung, Nachforderung, Storno, Buchung …)
  for (const e of st.einsaetze) {
    const alt = einsatzGesehen.get(e.id);
    if (alt !== undefined && !erstesMal) for (const p of e.protokoll.slice(alt)) protokoll("einsatz", { nr: e.nummer, code: e.code, text: p.text, von: p.von, spielzeit: new Date(p.zeit).toISOString() });
    einsatzGesehen.set(e.id, e.protokoll.length);
  }
  // Spieler und Rollen
  const sp = mp.aktiv ? mp.spieler.map((x) => `${x.name}:${x.online ? "online" : "weg"}:${rolle(x.pid)}${x.host ? ":Host" : ""}`).join(", ") : "solo";
  if (sp !== spielerZuletzt) {
    protokoll("spieler", { spieler: sp, ich: `${mp.ich.name}:${rolle(sim.ich?.pid ?? mp.ich.pid)}`, modus: sim.mode });
    spielerZuletzt = sp;
  }
  erstesMal = false;
}

let gestartet = false;
export function protokollBeobachterStarten(): void {
  if (gestartet) return;
  gestartet = true;
  protokoll("start", { version: document.getElementById("app-version")?.textContent?.trim(), fenster: `${window.innerWidth}×${window.innerHeight}`, umgebung: navigator.userAgent });
  setInterval(() => {
    try {
      pruefen();
    } catch (e) {
      protokoll("log", { art: "fehler", text: `Protokoll: ${String(e)}` });
    }
  }, 600);
}
