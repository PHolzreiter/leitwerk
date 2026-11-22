/**
 * Einrichten (Mein Platz › Einrichten): was der Spieler schon ausprobiert hat – Hören, Mikrofon, Sprechtasten, Probeanruf.
 * Gemerkt je Gerät: wechselt man Kopfhörer oder Mikrofon, gilt der Schritt wieder als offen.
 */
import { sprachPrefs } from "./sprache";

const LS = "lw.einrichten";

interface Stand {
  /** Gerät, auf dem der Spieler den Probeton gehört hat ("" = wie das System) */
  hoeren?: string;
  /** Mikrofon, mit dem der Test geklappt hat ("" = wie das System) */
  mikro?: string;
  /** Sprechtaste ausprobiert */
  tasten?: boolean;
  /** Probeanruf gemacht */
  probe?: boolean;
}

function lesen(): Stand {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "{}") as Stand;
  } catch {
    return {};
  }
}

/** Wer wissen will, wenn sich etwas ändert (Bereitschafts-Check) */
export const einrichtenHoerer = new Set<() => void>();

export function einrichtenSetzen(x: Partial<Stand>): void {
  try {
    localStorage.setItem(LS, JSON.stringify({ ...lesen(), ...x }));
  } catch {
    /* egal */
  }
  einrichtenHoerer.forEach((f) => f());
}

/** Probeton auf dem jetzigen Gerät gehört? */
export function hoerenOk(): boolean {
  const s = lesen();
  return s.hoeren !== undefined && s.hoeren === sprachPrefs().geraetStimmen;
}

/** Mikrofon-Test mit dem jetzigen Mikrofon geklappt? */
export function mikroOk(): boolean {
  const s = lesen();
  return s.mikro !== undefined && s.mikro === sprachPrefs().mikro;
}

export const tastenOk = (): boolean => !!lesen().tasten;
export const probeOk = (): boolean => !!lesen().probe;
