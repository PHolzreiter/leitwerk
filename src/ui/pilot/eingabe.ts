/**
 * Eingabe im Piloten-Interface: Tasten im Fenster, globale Tastenkürzel (Programm, auch wenn der
 * Flugsimulator vorne ist) und Joystick-Tasten (Gamepad-Schnittstelle des Fensters).
 */
import { inTauri } from "../../platform";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import { AKTIONEN, belegung, belegungSpeichern, HALTEN, kuerzelAus, kuerzelName, standardBelegung, tastenName, type Belegung, type PilotAktion } from "./tasten";

let ausloesen: ((a: PilotAktion) => void) | null = null;
let loslassen: ((a: PilotAktion) => void) | null = null;
let lernt = false;
/** gerade gedrückte Halte-Aktionen (Sprechtasten) und von wo */
const gehalten = new Map<PilotAktion, Set<string>>();

/** Halte-Aktion gedrückt bzw. losgelassen (quelle: Taste, Kürzel, Joystick …) – mehrfaches Drücken zählt einmal */
function halten(a: PilotAktion, quelle: string, an: boolean): void {
  const q = gehalten.get(a) ?? new Set<string>();
  const vorher = q.size > 0;
  if (an) q.add(quelle);
  else q.delete(quelle);
  gehalten.set(a, q);
  if (an && !vorher) ausloesen?.(a);
  if (!an && vorher && q.size === 0) loslassen?.(a);
}

/** alle Halte-Aktionen einer Quelle loslassen (Fenster verliert den Fokus …) */
function allesLoslassen(quelle?: string): void {
  for (const [a, q] of gehalten) {
    if (!q.size) continue;
    if (quelle) halten(a, quelle, false);
    else {
      q.clear();
      loslassen?.(a);
    }
  }
}

// ------------------------------------------------------------------ Tasten im Fenster

function onKey(ev: KeyboardEvent): void {
  if (!ausloesen || lernt) return;
  if (ev.repeat) {
    // gehaltene Sprechtaste: Wiederholungen nicht weitergeben (Leertaste würde sonst Knöpfe drücken)
    const b0 = belegung();
    if ((Object.keys(b0.taste) as PilotAktion[]).some((k) => b0.taste[k] === ev.code && HALTEN.includes(k))) ev.preventDefault();
    return;
  }
  const t = ev.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
  if (document.querySelector(".dlg-overlay")) return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const b = belegung();
  const a = (Object.keys(b.taste) as PilotAktion[]).find((k) => b.taste[k] === ev.code);
  if (!a) return;
  ev.preventDefault();
  if (HALTEN.includes(a)) halten(a, "taste", true);
  else ausloesen(a);
}

function onKeyUp(ev: KeyboardEvent): void {
  const b = belegung();
  const a = (Object.keys(b.taste) as PilotAktion[]).find((k) => b.taste[k] === ev.code);
  if (!a || !HALTEN.includes(a)) return;
  ev.preventDefault();
  halten(a, "taste", false);
}

const onBlur = () => allesLoslassen("taste");

// ------------------------------------------------------------------ globale Kürzel (Tauri)

let globalAktiv: string[] = [];

async function globalAbmelden(): Promise<void> {
  if (!inTauri() || !globalAktiv.length) return;
  try {
    const gs = await import("@tauri-apps/plugin-global-shortcut");
    await gs.unregister(globalAktiv);
  } catch (e) {
    console.warn("Globale Kürzel abmelden", e);
  }
  globalAktiv = [];
}

async function globalAnmelden(): Promise<void> {
  await globalAbmelden();
  const b = belegung();
  if (!inTauri() || !b.globalAn || !ausloesen) return;
  try {
    const gs = await import("@tauri-apps/plugin-global-shortcut");
    for (const a of Object.keys(b.global) as PilotAktion[]) {
      const k = b.global[a];
      if (!k) continue;
      try {
        await gs.register(k, (ev) => {
          if (lernt) return;
          if (HALTEN.includes(a)) halten(a, "global", ev.state === "Pressed");
          else if (ev.state === "Pressed") ausloesen?.(a);
        });
        globalAktiv.push(k);
      } catch (e) {
        console.warn("Kürzel belegt", k, e);
        toast(`Tastenkürzel ${kuerzelName(k)} ist schon von einem anderen Programm belegt`, "error");
      }
    }
  } catch (e) {
    console.warn("Globale Kürzel", e);
  }
}

// ------------------------------------------------------------------ Joystick

let joyTimer: number | undefined;
const gedrueckt = new Map<string, boolean>();

function joyAbfragen(): void {
  const pads = navigator.getGamepads?.() ?? [];
  const b = belegung();
  for (const p of pads) {
    if (!p) continue;
    p.buttons.forEach((btn, i) => {
      const k = `${p.id}#${i}`;
      const war = gedrueckt.get(k) ?? false;
      gedrueckt.set(k, btn.pressed);
      if (btn.pressed === war || lernt || !ausloesen) return;
      const a = (Object.keys(b.joy) as PilotAktion[]).find((x) => b.joy[x]?.geraet === p.id && b.joy[x]?.taste === i);
      if (!a) return;
      if (HALTEN.includes(a)) halten(a, `joy:${k}`, btn.pressed);
      else if (btn.pressed) ausloesen(a);
    });
  }
}

/** Wartet auf den nächsten Tastendruck an irgendeinem Joystick */
function joyLernen(abbruch: AbortSignal): Promise<{ geraet: string; taste: number } | null> {
  return new Promise((resolve) => {
    const vorher = new Map<string, boolean>();
    for (const p of navigator.getGamepads?.() ?? []) if (p) p.buttons.forEach((b, i) => vorher.set(`${p.id}#${i}`, b.pressed));
    const t = window.setInterval(() => {
      if (abbruch.aborted) {
        window.clearInterval(t);
        return resolve(null);
      }
      for (const p of navigator.getGamepads?.() ?? []) {
        if (!p) continue;
        for (let i = 0; i < p.buttons.length; i++) {
          const k = `${p.id}#${i}`;
          if (p.buttons[i].pressed && !vorher.get(k)) {
            window.clearInterval(t);
            gedrueckt.set(k, true);
            return resolve({ geraet: p.id, taste: i });
          }
          vorher.set(k, p.buttons[i].pressed);
        }
      }
    }, 40);
  });
}

// ------------------------------------------------------------------ HPG H145: CARLS-Funkgerät im Cockpit

let carlsLerner: ((w: number) => void) | null = null;
export let letzterCarls = 0;

/** Neuer Wert von L:CARLS_RT_BUTTON (aus dem Flugsimulator) */
export function carlsEmpfangen(w: number): void {
  // nur die Tasten 1–9 (−1 = zurückgesetzt, 0 = nichts gedrückt)
  if (!(w >= 1 && w <= 9)) return;
  letzterCarls = w;
  if (carlsLerner) return carlsLerner(w);
  if (lernt || !ausloesen) return;
  const b = belegung();
  const a = (Object.keys(b.carls) as PilotAktion[]).find((k) => b.carls[k] === w);
  if (a) ausloesen(a);
}

// ------------------------------------------------------------------ Start/Stopp

/** Handy: Sprechtaste gedrückt bzw. losgelassen */
export function handyHalten(a: PilotAktion, an: boolean): void {
  if (HALTEN.includes(a)) halten(a, "handy", an);
}

export function eingabeStarten(f: (a: PilotAktion) => void, los?: (a: PilotAktion) => void): void {
  ausloesen = f;
  loslassen = los ?? null;
  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  void globalAnmelden();
  window.clearInterval(joyTimer);
  joyTimer = window.setInterval(joyAbfragen, 50);
}

export function eingabeStoppen(): void {
  allesLoslassen();
  ausloesen = null;
  loslassen = null;
  document.removeEventListener("keydown", onKey);
  document.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", onBlur);
  void globalAbmelden();
  window.clearInterval(joyTimer);
  joyTimer = undefined;
}

// ------------------------------------------------------------------ Belegen

const kurzGeraet = (id: string) => id.replace(/\s*\(.*?\)\s*/g, " ").trim().slice(0, 28) || "Joystick";

export function tastenDialog(): void {
  let b: Belegung = belegung();
  const body = el("div", { class: "plt-tasten" });
  let abbruch: AbortController | null = null;
  const zeichnen = () => {
    body.innerHTML = `
      <p class="plt-leise">Klick auf ein Feld und drück dann die gewünschte Taste. <b>Entf</b> löscht die Belegung, <b>Esc</b> bricht ab.</p>
      <label class="plt-check"><input type="checkbox" class="plt-global-an" ${b.globalAn ? "checked" : ""}${inTauri() ? "" : " disabled"}> Globale Tastenkürzel – funktionieren auch, wenn der Flugsimulator im Vordergrund ist${inTauri() ? "" : " (nur im Programm, nicht im Browser)"}</label>
      <table class="plt-tasten-tab"><thead><tr><th>Aktion</th><th>Taste im Fenster</th><th>Global</th><th>Joystick</th><th>H145-Funkgerät</th></tr></thead><tbody></tbody></table>
      <p class="plt-leise plt-klein">Globale Kürzel brauchen eine Zusatztaste (Strg, Alt, Umschalt) – sonst wären die Ziffern im ganzen System belegt. Joystick: die Taste einmal drücken, während das Feld blinkt. Ob der Joystick auch bei Fokus auf dem Flugsimulator erkannt wird, hängt vom System ab – im Zweifel globale Kürzel oder das Handy nehmen. H145-Funkgerät: die Tasten am CARLS-Funkgerät in der Mittelkonsole der HPG H145 (MSFS muss verbunden sein); anklicken und dann die Taste im Cockpit drücken.</p>`;
    body.querySelector<HTMLInputElement>(".plt-global-an")!.addEventListener("change", (ev) => {
      b = { ...b, globalAn: (ev.target as HTMLInputElement).checked };
    });
    const tb = body.querySelector("tbody")!;
    for (const a of AKTIONEN) {
      const tr = el("tr");
      tr.innerHTML = `<td>${esc(a.name)}</td>`;
      const feld = (text: string, art: "taste" | "global" | "joy" | "carls") => {
        const td = el("td");
        const btn = el("button", { class: "plt-taste-feld" }, text);
        btn.addEventListener("click", () => lernen(btn, a.id, art));
        td.appendChild(btn);
        tr.appendChild(td);
      };
      feld(tastenName(b.taste[a.id]), "taste");
      feld(kuerzelName(b.global[a.id]), "global");
      const j = b.joy[a.id];
      feld(j ? `${kurzGeraet(j.geraet)} · Taste ${j.taste + 1}` : "–", "joy");
      const c = b.carls[a.id];
      if (a.id !== "fliegen" && !HALTEN.includes(a.id)) feld(c !== undefined ? `Wert ${c}` : "–", "carls");
      else tr.appendChild(el("td"));
      tb.appendChild(tr);
    }
  };
  const lernen = (btn: HTMLButtonElement, a: PilotAktion, art: "taste" | "global" | "joy" | "carls") => {
    abbruch?.abort();
    body.querySelectorAll(".plt-taste-feld.lernt").forEach((x) => x.classList.remove("lernt"));
    btn.classList.add("lernt");
    btn.textContent = art === "joy" ? "Joystick-Taste drücken …" : art === "carls" ? "Taste am Funkgerät im Cockpit drücken …" : "Taste drücken …";
    lernt = true;
    const ende = () => {
      lernt = false;
      carlsLerner = null;
      document.removeEventListener("keydown", key, true);
      abbruch?.abort();
      abbruch = null;
      zeichnen();
    };
    const key = (ev: KeyboardEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === "Escape") return ende();
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (art === "taste") delete b.taste[a];
        else if (art === "global") delete b.global[a];
        else if (art === "carls") delete b.carls[a];
        else delete b.joy[a];
        return ende();
      }
      if (art === "taste") {
        if (["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return;
        for (const k of Object.keys(b.taste) as PilotAktion[]) if (b.taste[k] === ev.code) delete b.taste[k];
        b.taste[a] = ev.code;
        return ende();
      }
      if (art === "global") {
        if (["Shift", "Control", "Alt", "Meta"].includes(ev.key)) return;
        const k = kuerzelAus(ev);
        if (!k) {
          btn.textContent = "mit Strg/Alt/Umschalt (oder F-Taste)";
          return;
        }
        for (const x of Object.keys(b.global) as PilotAktion[]) if (b.global[x] === k) delete b.global[x];
        b.global[a] = k;
        return ende();
      }
    };
    document.addEventListener("keydown", key, true);
    if (art === "carls") {
      carlsLerner = (w) => {
        for (const x of Object.keys(b.carls) as PilotAktion[]) if (b.carls[x] === w) delete b.carls[x];
        b.carls[a] = w;
        ende();
      };
    }
    if (art === "joy") {
      abbruch = new AbortController();
      void joyLernen(abbruch.signal).then((j) => {
        if (!j) return;
        for (const x of Object.keys(b.joy) as PilotAktion[]) if (b.joy[x]?.geraet === j.geraet && b.joy[x]?.taste === j.taste) delete b.joy[x];
        b.joy[a] = j;
        ende();
      });
    }
  };
  zeichnen();
  // während des Belegens keine globalen Kürzel (sonst kommt der Tastendruck hier nicht an)
  void globalAbmelden();
  const wache = window.setInterval(() => {
    if (body.isConnected) return;
    window.clearInterval(wache);
    abbruch?.abort();
    lernt = false;
    if (ausloesen) void globalAnmelden();
  }, 300);
  openDialog({
    title: "Tasten und Joystick",
    body,
    wide: true,
    actions: [
      {
        label: "Standard",
        kind: "plain",
        onClick: () => {
          b = standardBelegung();
          zeichnen();
          return false;
        },
      },
      { label: "Abbrechen", kind: "plain", onClick: () => { abbruch?.abort(); lernt = false; } },
      {
        label: "Speichern",
        kind: "primary",
        onClick: () => {
          abbruch?.abort();
          lernt = false;
          belegungSpeichern(b);
          toast("Tastenbelegung gespeichert");
        },
      },
    ],
  });
}
