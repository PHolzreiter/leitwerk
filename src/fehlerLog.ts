/**
 * Fehler und Warnungen mitschreiben (nur im Speicher, die letzten 300) –
 * für „Fehler melden“: eine Datei, die man dem Entwickler schicken kann.
 */
export interface LogEintrag {
  zeit: number;
  art: "fehler" | "warnung" | "info";
  text: string;
}

const MAX = 300;
const log: LogEintrag[] = [];

function text(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack.split("\n").slice(1, 6).join("\n")}` : ""}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a).slice(0, 800);
      } catch {
        return String(a);
      }
    })
    .join(" ")
    .slice(0, 2000);
}

export function logEintrag(art: LogEintrag["art"], ...args: unknown[]): void {
  log.push({ zeit: Date.now(), art, text: text(args) });
  if (log.length > MAX) log.splice(0, log.length - MAX);
}

export function logEintraege(): LogEintrag[] {
  return [...log];
}

let gestartet = false;
/** Konsole und unbehandelte Fehler mitschreiben (einmal beim Start) */
export function fehlerLogStarten(): void {
  if (gestartet) return;
  gestartet = true;
  const err = console.error.bind(console);
  const warn = console.warn.bind(console);
  console.error = (...a: unknown[]) => {
    logEintrag("fehler", ...a);
    err(...a);
  };
  console.warn = (...a: unknown[]) => {
    logEintrag("warnung", ...a);
    warn(...a);
  };
  window.addEventListener("error", (ev) => logEintrag("fehler", ev.error ?? ev.message, `${ev.filename}:${ev.lineno}`));
  window.addEventListener("unhandledrejection", (ev) => logEintrag("fehler", "Unbehandelt:", ev.reason));
  logEintrag("info", "Programmstart", navigator.userAgent);
}
