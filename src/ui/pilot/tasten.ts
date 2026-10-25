/**
 * Piloten-Interface: Tastenbelegung für die Status (und weitere Aktionen).
 * Pro Aktion gibt es drei Wege: Taste im LeitWerk-Fenster, globales Tastenkürzel (geht auch, wenn der
 * Flugsimulator im Vordergrund ist – nur im Programm, nicht im Browser) und eine Joystick-Taste.
 * Gespeichert wird pro Rechner (localStorage).
 */
import type { StatusKey } from "../../sim/settings";

export type PilotAktion = "s9" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "fliegen";

export const AKTIONEN: { id: PilotAktion; name: string; status?: StatusKey }[] = [
  { id: "s9", name: "Quittieren – Alarm angenommen", status: "alarmiert" },
  { id: "s1", name: "Status 1 – frei auf Wache", status: "freiWache" },
  { id: "s2", name: "Status 2 – zum Berufungsort", status: "zumBO" },
  { id: "s3", name: "Status 3 – am Berufungsort", status: "amBO" },
  { id: "s4", name: "Status 4 – zum Zielort", status: "zumZO" },
  { id: "s5", name: "Status 5 – am Zielort", status: "amZO" },
  { id: "s6", name: "Status 6 – frei über Funk", status: "freiFunk" },
  { id: "fliegen", name: "Übungsflug zum nächsten Ziel / anhalten" },
];

/** Joystick-Taste: welches Gerät (Name) und welche Taste */
export interface JoyTaste {
  geraet: string;
  taste: number;
}

export interface Belegung {
  /** Taste im Fenster (KeyboardEvent.code, z. B. „Digit1“) */
  taste: Partial<Record<PilotAktion, string>>;
  /** globales Kürzel (Tauri-Schreibweise, z. B. „CommandOrControl+Shift+1“) */
  global: Partial<Record<PilotAktion, string>>;
  globalAn: boolean;
  joy: Partial<Record<PilotAktion, JoyTaste>>;
  /** HPG H145: Wert von L:CARLS_RT_BUTTON je Aktion (Tasten am CARLS-Funkgerät) */
  carls: Partial<Record<PilotAktion, number>>;
}

const SCHLUESSEL = "leitwerk.pilot.tasten";

export function standardBelegung(): Belegung {
  return {
    taste: { s9: "Digit9", s1: "Digit1", s2: "Digit2", s3: "Digit3", s4: "Digit4", s5: "Digit5", s6: "Digit6", fliegen: "KeyF" },
    global: {
      s1: "CommandOrControl+Shift+1",
      s2: "CommandOrControl+Shift+2",
      s3: "CommandOrControl+Shift+3",
      s4: "CommandOrControl+Shift+4",
      s5: "CommandOrControl+Shift+5",
      s6: "CommandOrControl+Shift+6",
      s9: "CommandOrControl+Shift+9",
    },
    globalAn: true,
    joy: {},
    // Vermutung: die Taste liefert ihre Ziffer – sonst im Tasten-Fenster anlernen
    carls: { s1: 1, s2: 2, s3: 3, s4: 4, s5: 5, s6: 6, s9: 9 },
  };
}

export function belegung(): Belegung {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (roh) {
      const b = JSON.parse(roh) as Partial<Belegung>;
      const s = standardBelegung();
      return { taste: { ...s.taste, ...b.taste }, global: { ...s.global, ...b.global }, globalAn: b.globalAn ?? s.globalAn, joy: { ...b.joy }, carls: b.carls ? { ...b.carls } : s.carls };
    }
  } catch {
    /* Standard */
  }
  return standardBelegung();
}

export function belegungSpeichern(b: Belegung): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(b));
  } catch {
    /* ohne Speicher gilt sie bis zum Neustart */
  }
}

/** Lesbarer Name einer Fenster-Taste („Digit1“ → „1“, „Numpad3“ → „Num 3“, „KeyF“ → „F“) */
export function tastenName(code: string | undefined): string {
  if (!code) return "–";
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^F\d+$/.test(code)) return code;
  return code.replace(/^Arrow/, "Pfeil ").replace("Space", "Leertaste");
}

/** Lesbarer Name eines globalen Kürzels */
export function kuerzelName(k: string | undefined): string {
  if (!k) return "–";
  const mac = /Mac/i.test(navigator.platform);
  return k.replace("CommandOrControl", mac ? "⌘" : "Strg").replace("Shift", mac ? "⇧" : "Umschalt").replace("Alt", mac ? "⌥" : "Alt").replace(/\+/g, " + ");
}

/** Taste aus einem Tastendruck als globales Kürzel (Tauri-Schreibweise); null = keine brauchbare Kombination */
export function kuerzelAus(ev: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (ev.ctrlKey || ev.metaKey) mods.push("CommandOrControl");
  if (ev.altKey) mods.push("Alt");
  if (ev.shiftKey) mods.push("Shift");
  let k = "";
  if (/^Digit\d$/.test(ev.code)) k = ev.code.slice(5);
  else if (/^Key[A-Z]$/.test(ev.code)) k = ev.code.slice(3);
  else if (/^Numpad\d$/.test(ev.code)) k = `num${ev.code.slice(6)}`;
  else if (/^F\d+$/.test(ev.code)) k = ev.code;
  if (!k) return null;
  // ohne Zusatztaste nur F-Tasten (sonst wären Ziffern im ganzen System belegt)
  if (!mods.length && !/^F\d+$/.test(k)) return null;
  return [...mods, k].join("+");
}
