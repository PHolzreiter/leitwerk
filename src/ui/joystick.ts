/**
 * Joystick, HOTAS, Gamepad – für ALLE Tastenbelegungen (Disponent und Pilot, Paul 12.11.2026).
 *
 * Quellen:
 * - Windows: Abfrage im Programm (src-tauri/src/joystick.rs) – geht auch, wenn LeitWerk nicht vorne ist
 *   (beim Piloten ist der Flugsimulator immer im Vordergrund).
 * - sonst: Gamepad-Schnittstelle des Fensters (nur solange LeitWerk den Fokus hat).
 *
 * Jede Joystick-Taste wird wie eine Taste der Tastatur weitergegeben: ein keydown/keyup mit code „Joy:<Gerät>#<Taste>“.
 * So funktionieren alle bestehenden Belegungen (Funktaste, Spracheingabe, Kürzel, Pilot-Tasten) und das Lernen der
 * Tasten („Taste drücken …“) ohne eigene Joystick-Felder.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { inTauri } from "../platform";

export const JOY = "Joy:";

export function joyCode(geraet: string, taste: number): string {
  return `${JOY}${geraet.replace(/#/g, "")}#${taste}`;
}

/** Lesbarer Name: „Logitech Extreme 3D 1 · Taste 4“, Steuerkreuz als „Kreuz ↑“ */
export function joyName(code: string): string {
  const m = code.match(/^Joy:(.*)#(\d+)$/);
  if (!m) return code;
  const g = m[1].replace(/\s*\(.*?\)\s*/g, " ").trim().slice(0, 26) || "Joystick";
  const n = Number(m[2]);
  const hat = ["Kreuz ↑", "Kreuz →", "Kreuz ↓", "Kreuz ←"][n - 32];
  return `${g} · ${hat ?? `Taste ${n + 1}`}`;
}

/** Zustand aller Tasten (für die Pilot-Belegung mit eigenem Joystick-Feld) */
const nativZustand = new Map<string, boolean[]>();
let nativ = false;

/** Geräte mit Tasten – aus dem Programm (Windows) oder der Gamepad-Schnittstelle */
export function joystickPads(): { id: string; buttons: { pressed: boolean }[] }[] {
  if (nativ) return [...nativZustand].map(([id, b]) => ({ id, buttons: b.map((p) => ({ pressed: p })) }));
  return (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p).map((p) => ({ id: p.id, buttons: [...p.buttons] }));
}

function weitergeben(geraet: string, taste: number, unten: boolean): void {
  const code = joyCode(geraet, taste);
  const ziel = (document.activeElement as HTMLElement | null) ?? document.body;
  ziel.dispatchEvent(new KeyboardEvent(unten ? "keydown" : "keyup", { code, key: code, bubbles: true, cancelable: true }));
}

let gestartet = false;
export async function joystickStarten(): Promise<void> {
  if (gestartet) return;
  gestartet = true;
  if (inTauri()) nativ = await invoke<boolean>("joystick_nativ").catch(() => false);
  if (nativ) {
    await listen<{ geraet: string; taste: number; unten: boolean }>("joy-taste", (ev) => {
      const { geraet, taste, unten } = ev.payload;
      const b = nativZustand.get(geraet) ?? [];
      while (b.length <= taste) b.push(false);
      b[taste] = unten;
      nativZustand.set(geraet, b);
      weitergeben(geraet, taste, unten);
    });
    return;
  }
  // Gamepad-Schnittstelle: Änderungen selbst erkennen
  const vorher = new Map<string, boolean>();
  window.setInterval(() => {
    for (const p of navigator.getGamepads?.() ?? []) {
      if (!p) continue;
      p.buttons.forEach((btn, i) => {
        const k = `${p.id}#${i}`;
        const war = vorher.get(k) ?? false;
        if (btn.pressed !== war) {
          vorher.set(k, btn.pressed);
          weitergeben(p.id, i, btn.pressed);
        }
      });
    }
  }, 40);
}
