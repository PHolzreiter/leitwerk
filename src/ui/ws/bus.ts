/**
 * Fenster-Bus: Nachrichten zwischen dem Hauptfenster und weiteren Fenstern (zweiter Bildschirm).
 * Im Programm über Tauri-Ereignisse, im Browser über BroadcastChannel.
 */
import { inTauri } from "../../platform";

/** Kennung dieses Programmfensters: „haupt“ oder z. B. „fenster-2“ (im Programm = Fensterbezeichnung) */
function eigeneId(): string {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__;
  const label = tauri?.metadata?.currentWindow?.label;
  if (label) return label === "main" ? "haupt" : label;
  return new URLSearchParams(location.search).get("fenster") ?? "haupt";
}
export const FENSTER_ID: string = eigeneId();
export const IST_HAUPT = FENSTER_ID === "haupt";

export interface BusNachricht {
  t: string;
  [k: string]: unknown;
}

interface Umschlag {
  von: string;
  an: string | null;
  m: BusNachricht;
}

type Empfaenger = (m: BusNachricht, von: string) => void;
const empfaenger = new Set<Empfaenger>();
let senden: ((u: Umschlag) => void) | null = null;
const warteschlange: Umschlag[] = [];

function ankommen(u: Umschlag): void {
  if (!u || u.von === FENSTER_ID) return;
  if (u.an && u.an !== FENSTER_ID) return;
  for (const fn of empfaenger) {
    try {
      fn(u.m, u.von);
    } catch (e) {
      console.error("Fenster-Bus", e);
    }
  }
}

async function verbinden(): Promise<void> {
  if (inTauri()) {
    const ev = await import("@tauri-apps/api/event");
    await ev.listen<Umschlag>("lw-bus", (e) => ankommen(e.payload));
    senden = (u) => void ev.emit("lw-bus", u).catch((e) => console.warn("Fenster-Bus", e));
  } else if ("BroadcastChannel" in window) {
    const ch = new BroadcastChannel("leitwerk-bus");
    ch.onmessage = (e) => ankommen(e.data as Umschlag);
    senden = (u) => ch.postMessage(u);
  } else {
    senden = () => undefined;
  }
  for (const u of warteschlange.splice(0)) senden(u);
}
const bereit = verbinden();

export const bus = {
  bereit,
  /** an alle anderen Fenster (oder an ein bestimmtes) */
  senden(m: BusNachricht, an: string | null = null): void {
    const u: Umschlag = { von: FENSTER_ID, an, m: JSON.parse(JSON.stringify(m)) as BusNachricht };
    if (senden) senden(u);
    else warteschlange.push(u);
  },
  empfangen(fn: Empfaenger): () => void {
    empfaenger.add(fn);
    return () => empfaenger.delete(fn);
  },
};

// ---------------------------------------------------------------- Anfrage/Antwort

let anfrageZaehler = 0;
const offen = new Map<string, { ok(v: unknown): void; fehler(e: Error): void; timer: number }>();

bus.empfangen((m) => {
  if (m.t !== "antwort") return;
  const o = offen.get(String(m.id));
  if (!o) return;
  offen.delete(String(m.id));
  window.clearTimeout(o.timer);
  if (m.ok) o.ok(m.wert);
  else o.fehler(new Error(String(m.fehler ?? "Fehler")));
});

/** Anfrage an ein Fenster, das mit beantworten() antwortet */
export function anfrage(an: string, m: BusNachricht, timeoutMs = 30_000): Promise<unknown> {
  const id = `${FENSTER_ID}:${++anfrageZaehler}`;
  return new Promise((ok, fehler) => {
    const timer = window.setTimeout(() => {
      offen.delete(id);
      fehler(new Error("Das Hauptfenster antwortet nicht"));
    }, timeoutMs);
    offen.set(id, { ok, fehler, timer });
    bus.senden({ ...m, id }, an);
  });
}

/** Anfragen eines Typs beantworten */
export function beantworten(t: string, fn: (m: BusNachricht, von: string) => unknown): void {
  bus.empfangen(async (m, von) => {
    if (m.t !== t) return;
    try {
      const wert = await fn(m, von);
      bus.senden({ t: "antwort", id: m.id, ok: true, wert: wert ?? null }, von);
    } catch (e) {
      bus.senden({ t: "antwort", id: m.id, ok: false, fehler: String((e as Error).message ?? e) }, von);
    }
  });
}
