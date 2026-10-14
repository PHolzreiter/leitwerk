/** Telefon-Klingeln (Web Audio, keine Tondatei nötig): Notruf und KT-Hotline klingen verschieden. */
import { kiPrefs } from "../abfrage/ki";
import { pers } from "./ws/persoenlich";

/** Lautstärke aus den persönlichen Einstellungen (70 % = wie früher) */
const faktor = () => Math.max(0, Math.min(1.6, pers().lautstaerke / 70));

let ctx: AudioContext | null = null;
let timerNotruf: number | undefined;
let timerKt: number | undefined;

function ton(freqs: number[], stoesse: number[], dauer: number, laut: number): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    for (const start of stoesse) {
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(gain);
        o.start(t0 + start);
        o.stop(t0 + start + dauer);
      }
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(laut * faktor(), t0 + start + 0.02);
      gain.gain.setValueAtTime(laut * faktor(), t0 + start + dauer - 0.04);
      gain.gain.linearRampToValueAtTime(0, t0 + start + dauer);
    }
  } catch {
    /* kein Ton möglich – egal */
  }
}

/** Notruf: zwei kurze Stöße (Bürotelefon) */
const notruf = () => ton([440, 480], [0, 0.5], 0.38, 0.12);
/** KT-Hotline: ein längerer, tieferer Ton */
const kt = () => ton([350, 420], [0], 0.9, 0.09);

/** Klingeln an/aus – wird regelmäßig mit dem aktuellen Zustand aufgerufen */
export function klingeltonAktualisieren(notrufKlingelt: boolean, ktKlingelt = false): void {
  const p = kiPrefs().klingelton;
  const an1 = notrufKlingelt && p;
  const an2 = ktKlingelt && p;
  if (an1 && timerNotruf === undefined) {
    notruf();
    timerNotruf = window.setInterval(notruf, 3000);
  } else if (!an1 && timerNotruf !== undefined) {
    window.clearInterval(timerNotruf);
    timerNotruf = undefined;
  }
  if (an2 && timerKt === undefined) {
    window.setTimeout(kt, 1500);
    timerKt = window.setInterval(kt, 4000);
  } else if (!an2 && timerKt !== undefined) {
    window.clearInterval(timerKt);
    timerKt = undefined;
  }
}
let funkTimer: number | undefined;

function piep(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [start, f] of [[0, 1200], [0.15, 900]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.value = 0.04 * faktor();
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + start);
      o.stop(t0 + start + 0.12);
    }
  } catch {
    /* egal */
  }
}

/** Kurzer Funk-Piep, solange ein Fahrzeug LEO ruft */
export function funkPiepAktualisieren(ruft: boolean): void {
  const an = ruft && kiPrefs().klingelton;
  if (an && funkTimer === undefined) {
    piep();
    funkTimer = window.setInterval(piep, 6000);
  } else if (!an && funkTimer !== undefined) {
    window.clearInterval(funkTimer);
    funkTimer = undefined;
  }
}
