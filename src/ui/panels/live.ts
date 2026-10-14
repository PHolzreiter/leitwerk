/**
 * Was der Anrufer gerade sagt (KI schreibt Wort für Wort) – für das Abfrage-Fenster,
 * auch wenn es in einem anderen Programmfenster offen ist.
 */
import { bus } from "../ws/bus";

type Hoerer = (id: string, text: string | null) => void;
const hoerer = new Set<Hoerer>();
const aktuell = new Map<string, string>();

export function liveText(id: string): string | null {
  return aktuell.get(id) ?? null;
}

let sendeTimer: number | undefined;
function melden(id: string, text: string | null, senden: boolean): void {
  if (text === null) aktuell.delete(id);
  else aktuell.set(id, text);
  for (const fn of hoerer) fn(id, text);
  if (!senden) return;
  // höchstens ein paar Mal pro Sekunde über den Fenster-Bus
  if (text === null) {
    window.clearTimeout(sendeTimer);
    sendeTimer = undefined;
    bus.senden({ t: "live", id, text: null });
  } else if (sendeTimer === undefined) {
    sendeTimer = window.setTimeout(() => {
      sendeTimer = undefined;
      bus.senden({ t: "live", id, text: aktuell.get(id) ?? null });
    }, 120);
  }
}

/** Sammler für die Wörter einer Antwort */
export function liveSammler(id: string): { onToken(t: string): void; fertig(): void } {
  let text = "";
  return {
    onToken: (t) => {
      text += t;
      melden(id, text, true);
    },
    fertig: () => melden(id, null, true),
  };
}

export function onLive(fn: Hoerer): () => void {
  hoerer.add(fn);
  return () => hoerer.delete(fn);
}

bus.empfangen((m) => {
  if (m.t === "live") melden(String(m.id), (m.text as string | null) ?? null, false);
});

/** Nachricht im Gesprächsverlauf */
interface VerlaufNachricht {
  zeit: number;
  von: "leitstelle" | "anrufer" | "system";
  text: string;
  wer?: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Gesprächsverlauf nachziehen, ohne ihn neu aufzubauen: nur neue Nachrichten werden angehängt
 * (kein Flackern, kein Springen). Scrollt nur mit, wenn man unten war.
 */
export function verlaufNachziehen(verlauf: HTMLElement, live: HTMLElement, msgs: VerlaufNachricht[], id: string): void {
  const da = verlauf.querySelectorAll(".anruf-msg:not(.live)");
  const unten = verlauf.scrollHeight - verlauf.scrollTop - verlauf.clientHeight < 40;
  let start = da.length;
  if (msgs.length < da.length || live.parentElement !== verlauf) {
    verlauf.replaceChildren();
    start = 0;
  }
  const neu = start < msgs.length || live.parentElement !== verlauf;
  const frag = document.createDocumentFragment();
  for (const m of msgs.slice(start)) {
    const d = document.createElement("div");
    d.className = `anruf-msg ${m.von}`;
    d.innerHTML = m.von === "system" ? `<em>${esc(m.text)}</em>` : `<b>${m.von === "anrufer" ? "Anrufer" : esc(m.wer ?? "Leitstelle")}:</b> ${esc(m.text)}`;
    const z = document.createElement("span");
    z.className = "msg-zeit";
    z.textContent = new Date(m.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    d.appendChild(z);
    frag.appendChild(d);
  }
  verlauf.insertBefore(frag, live.parentElement === verlauf ? live : null);
  if (live.parentElement !== verlauf) verlauf.appendChild(live);
  // fertige Antwort ersetzt die Live-Zeile im selben Schritt
  const t = liveText(id);
  const neueAntwort = msgs.slice(start).some((m) => m.von === "anrufer");
  if (t && !neueAntwort) {
    live.hidden = false;
    live.textContent = t;
  } else if (neueAntwort || !live.textContent) live.hidden = true;
  if (neu && (unten || start === 0)) verlauf.scrollTop = verlauf.scrollHeight;
}

/** Live-Zeile zeigen; das Ende („null“) erst etwas später ausblenden – bis dahin steht die fertige Antwort im Verlauf (kein Aufblitzen) */
export function liveZeigen(verlauf: HTMLElement, live: HTMLElement, id: string, text: string | null): void {
  if (text) {
    live.hidden = false;
    live.textContent = text;
    if (verlauf.scrollHeight - verlauf.scrollTop - verlauf.clientHeight < 80) verlauf.scrollTop = verlauf.scrollHeight;
    return;
  }
  setTimeout(() => {
    if (!liveText(id)) live.hidden = true;
  }, 600);
}
