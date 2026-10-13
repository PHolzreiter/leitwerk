/** Telefon-Klingeln für eingehende Notrufe (Web Audio, keine Tondatei nötig). */
import { kiPrefs } from "../abfrage/ki";

let ctx: AudioContext | null = null;
let timer: number | undefined;

function ring(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    // zwei kurze Klingelstöße (wie ein Bürotelefon)
    for (const start of [0, 0.5]) {
      for (const f of [440, 480]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(gain);
        o.start(t0 + start);
        o.stop(t0 + start + 0.38);
      }
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(0.12, t0 + start + 0.02);
      gain.gain.setValueAtTime(0.12, t0 + start + 0.34);
      gain.gain.linearRampToValueAtTime(0, t0 + start + 0.38);
    }
  } catch {
    /* kein Ton möglich – egal */
  }
}

/** Klingeln an/aus – wird regelmäßig mit dem aktuellen Zustand aufgerufen */
export function klingeltonAktualisieren(anrufKlingelt: boolean): void {
  const an = anrufKlingelt && kiPrefs().klingelton;
  if (an && timer === undefined) {
    ring();
    timer = window.setInterval(ring, 3000);
  } else if (!an && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}
