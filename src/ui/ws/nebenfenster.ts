/**
 * Weitere Programmfenster (z. B. für den zweiten Bildschirm).
 *
 * Die Simulation läuft nur im Hauptfenster. Ein Nebenfenster ist ein Spiegel – wie ein Mitspieler im
 * Multiplayer, nur lokal: es bekommt den vollständigen Stand und danach laufend die Änderungen, und
 * schickt alle Eingaben als Befehle ans Hauptfenster.
 */
import { store, type StoreBefehl } from "../../data/store";
import type { Persisted } from "../../data/model";
import { mp } from "../../net/mehrspieler";
import { DeltaBauer, deltaAnwenden, zustandUebernehmen, type Nachricht } from "../../net/spiegel";
import { inTauri } from "../../platform";
import { sim, type Befehl, type SimState } from "../../sim/engine";
import { toast } from "../dom";
import { anfrage, beantworten, bus, FENSTER_ID, IST_HAUPT } from "./bus";
import { setzeFensterOeffner, type FensterBounds } from "./arbeitsplatz";
import { istPilot, onPilotModus } from "../pilot/modus";

const DELTA_MS = 250;
const START_KEY = (id: string) => `leitwerk.layout.v2.${id}`;
const OFFEN_KEY = "leitwerk.fenster";

// ---------------------------------------------------------------- Hauptfenster

/** angemeldete Nebenfenster */
const verbunden = new Set<string>();
/** Programm wird beendet: Liste der offenen Fenster für den nächsten Start behalten */
let beendet = false;
/** Pilotenmodus: die Nebenfenster sind weggeräumt (ihre Liste bleibt für danach) */
let geparkt = false;
/** Ticket 24: zurück im Hauptmenü – die Nebenfenster sind zu, ihre Liste bleibt für den nächsten Spielstart */
let imMenue = false;

function offeneMerken(): void {
  if (beendet || geparkt || imMenue) return;
  try {
    localStorage.setItem(OFFEN_KEY, JSON.stringify([...verbunden]));
  } catch {
    /* egal */
  }
}

export function nebenfensterAnzahl(): number {
  return verbunden.size;
}

let zaehler = 1;
function freieId(): string {
  for (;;) {
    const id = `fenster-${++zaehler}`;
    if (!verbunden.has(id)) return id;
  }
}

/** Neues Programmfenster öffnen. panels: welche Fenster hinein; layout: gespeicherte Anordnung */
async function oeffnen(panels: string[], layout?: unknown, bounds?: FensterBounds, wunschId?: string): Promise<string | null> {
  const id = wunschId ?? freieId();
  try {
    if (layout) localStorage.setItem(START_KEY(id), JSON.stringify(layout));
    else localStorage.setItem(`${START_KEY(id)}.start`, JSON.stringify(panels));
    if (!layout) localStorage.removeItem(START_KEY(id));
  } catch {
    /* ohne Speicher geht es trotzdem (Standard-Anordnung) */
  }
  const b = bounds ?? { x: window.screenX + 60, y: window.screenY + 60, w: 1100, h: 760 };
  if (inTauri()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const w = new WebviewWindow(id, {
        url: "index.html",
        title: `LeitWerk – Fenster ${id.replace("fenster-", "")}`,
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
        minWidth: 480,
        minHeight: 360,
        focus: true,
        // Reiter zwischen Fenstern ziehen (HTML-Ziehen; Windows braucht das ausgeschaltet)
        dragDropEnabled: false,
      });
      await new Promise<void>((ok, fehler) => {
        void w.once("tauri://created", () => ok());
        void w.once("tauri://error", (e) => fehler(new Error(String(e.payload))));
      });
    } catch (e) {
      toast(`Fenster konnte nicht geöffnet werden: ${String((e as Error).message ?? e)}`, "error");
      return null;
    }
  } else {
    const url = new URL(location.href);
    url.searchParams.set("fenster", id);
    const w = window.open(url.href, id, `left=${b.x},top=${b.y},width=${b.w},height=${b.h}`);
    if (!w) {
      toast("Der Browser hat das neue Fenster blockiert", "error");
      return null;
    }
  }
  return id;
}

function stand(): { state: SimState; store: Persisted; mp: ReturnType<typeof mp.spiegelDaten>; ich: typeof sim.ich } {
  return { state: sim.state, store: store.snapshot(), mp: mp.spiegelDaten(), ich: sim.ich };
}

export function hauptfensterStarten(): void {
  if (!IST_HAUPT) return;
  setzeFensterOeffner((panels, layout, bounds) => oeffnen(panels, layout, bounds));
  const delta = new DeltaBauer();

  bus.empfangen((m, von) => {
    if (m.t === "hallo") {
      verbunden.add(von);
      offeneMerken();
      bus.senden({ t: "voll", ...stand() }, von);
      delta.merken();
    } else if (m.t === "bye") {
      verbunden.delete(von);
      offeneMerken();
    }
  });
  beantworten("cmd", async (m) => (sim.call.bind(sim) as (n: Befehl, ...a: unknown[]) => Promise<unknown>)(String(m.name) as Befehl, ...((m.args as unknown[]) ?? [])));
  beantworten("scmd", (m) => {
    const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[String(m.name)];
    if (typeof fn !== "function") throw new Error("Unbekannter Befehl");
    return fn.apply(store, (m.args as unknown[]) ?? []);
  });

  window.setInterval(() => {
    if (!verbunden.size) return;
    bus.senden(delta.bauen() as Nachricht);
  }, DELTA_MS);
  let storeTimer: number | undefined;
  store.onChange(() => {
    if (!verbunden.size) return;
    window.clearTimeout(storeTimer);
    storeTimer = window.setTimeout(() => bus.senden({ t: "store", data: store.snapshot() }), 300);
  });
  mp.onChange(() => verbunden.size && bus.senden({ t: "mp", mp: mp.spiegelDaten(), ich: sim.ich }));
  // Ein ganz neuer Stand (Spielstand geladen, Spiel beigetreten …): alles neu schicken
  let letzterStand: SimState | null = sim.state;
  sim.onChange(() => {
    if (sim.state === letzterStand) return;
    letzterStand = sim.state;
    if (verbunden.size) {
      bus.senden({ t: "voll", ...stand() });
      delta.merken();
    }
  });

  // Pilotenmodus: nur das Piloten-Fenster – Nebenfenster weg, danach wieder wie vorher
  onPilotModus((an) => {
    if (an) {
      if (verbunden.size) {
        offeneMerken();
        geparkt = true;
        bus.senden({ t: "fensterParken" });
        verbunden.clear();
      } else geparkt = true;
      wiederhergestellt = false;
    } else if (geparkt) {
      geparkt = false;
      void nebenfensterWiederherstellen();
    }
  });

  // Hauptfenster schließt: alle Nebenfenster mit – ihre Anordnung bleibt, beim nächsten Start gehen sie wieder auf (Ticket 24)
  const alleZu = () => {
    beendet = true;
    bus.senden({ t: "fensterParken" });
  };
  window.addEventListener("beforeunload", alleZu);
  if (inTauri()) {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow().onCloseRequested(() => {
        alleZu();
      }),
    );
  }
}

/**
 * Ticket 24: zurück ins Hauptmenü (Spiel verlassen, Sitzung geschlossen): die Nebenfenster gehen zu, es bleibt ein Fenster.
 * Ihre Liste und Anordnung (mit Lage und Größe) bleiben – beim nächsten Spielstart gehen sie wieder auf.
 */
export function nebenfensterZumMenue(): void {
  if (!IST_HAUPT) return;
  if (verbunden.size) {
    offeneMerken();
    bus.senden({ t: "fensterParken" });
    verbunden.clear();
  }
  imMenue = true;
  wiederhergestellt = false;
}

/** Lage und Größe, wie sie das Fenster selbst zuletzt gemerkt hat – nur, wenn sie noch auf einem Bildschirm liegt */
async function gemerkteLage(id: string): Promise<FensterBounds | undefined> {
  let b: FensterBounds | null = null;
  try {
    b = JSON.parse(localStorage.getItem(`${START_KEY(id)}.lage`) ?? "null") as FensterBounds | null;
  } catch {
    b = null;
  }
  if (!b || ![b.x, b.y, b.w, b.h].every((v) => typeof v === "number" && isFinite(v)) || b.w < 200 || b.h < 150) return undefined;
  if (!inTauri()) return b;
  try {
    const { availableMonitors } = await import("@tauri-apps/api/window");
    const schirme = await availableMonitors();
    // Mitte der Titelleiste muss auf einem vorhandenen Bildschirm liegen – sonst (Bildschirm fehlt) auf den Hauptbildschirm
    const px = b.x + b.w / 2;
    const py = b.y + 20;
    const da = schirme.some((m) => {
      const f = m.scaleFactor || 1;
      const x = m.position.x / f;
      const y = m.position.y / f;
      return px >= x && px < x + m.size.width / f && py >= y && py < y + m.size.height / f;
    });
    return da || !schirme.length ? b : undefined;
  } catch {
    return b;
  }
}

/** Beim Start: Nebenfenster vom letzten Mal wieder öffnen */
let wiederhergestellt = false;
export async function nebenfensterWiederherstellen(): Promise<void> {
  if (!IST_HAUPT || wiederhergestellt || istPilot()) return;
  wiederhergestellt = true;
  imMenue = false;
  let ids: string[] = [];
  try {
    ids = JSON.parse(localStorage.getItem(OFFEN_KEY) ?? "[]") as string[];
  } catch {
    ids = [];
  }
  for (const id of ids) {
    let layout: unknown = null;
    try {
      layout = JSON.parse(localStorage.getItem(START_KEY(id)) ?? "null");
    } catch {
      layout = null;
    }
    if (layout) await oeffnen([], layout, await gemerkteLage(id), id);
  }
}

/** Im Nebenfenster: Lage und Größe laufend merken (fürs Wiederöffnen – Ticket 24) */
function lageMerken(): void {
  let alt = "";
  const merk = async () => {
    let b: FensterBounds = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
    if (inTauri()) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const w = getCurrentWindow();
        const f = (await w.scaleFactor()) || 1;
        const p = await w.outerPosition();
        const s = await w.innerSize();
        b = { x: Math.round(p.x / f), y: Math.round(p.y / f), w: Math.round(s.width / f), h: Math.round(s.height / f) };
      } catch {
        /* dann die Werte aus dem Browser */
      }
    }
    const t = JSON.stringify(b);
    if (t === alt) return;
    alt = t;
    try {
      localStorage.setItem(`${START_KEY(FENSTER_ID)}.lage`, t);
    } catch {
      /* egal */
    }
  };
  void merk();
  window.setInterval(() => void merk(), 2000);
}

// ---------------------------------------------------------------- Nebenfenster

/** Im Nebenfenster: mit dem Hauptfenster verbinden und den Stand übernehmen */
export function nebenfensterVerbinden(): Promise<void> {
  sim.mode = "client";
  sim.remote = (name, args) => anfrage("haupt", { t: "cmd", name, args });
  store.remote = (name: StoreBefehl, args) => void anfrage("haupt", { t: "scmd", name, args }).catch((e) => toast(String(e.message ?? e), "error"));

  lageMerken();
  return new Promise((ok) => {
    let erhalten = false;
    bus.empfangen((m) => {
      switch (m.t) {
        case "voll": {
          store.enterSession(m.store as Persisted);
          zustandUebernehmen(m.state as SimState);
          sim.ich = (m.ich as typeof sim.ich) ?? sim.ich;
          mp.spiegeln(m.mp as Parameters<typeof mp.spiegeln>[0]);
          sim.notify();
          if (!erhalten) {
            erhalten = true;
            ok();
          }
          return;
        }
        case "delta":
          if (erhalten) deltaAnwenden(m as Nachricht);
          return;
        case "store":
          store.enterSession(m.data as Persisted);
          return;
        case "mp":
          sim.ich = (m.ich as typeof sim.ich) ?? sim.ich;
          mp.spiegeln(m.mp as Parameters<typeof mp.spiegeln>[0]);
          return;
        case "fensterSchliessen":
          void fensterSchliessen();
          return;
        case "fensterParken":
          // Pilotenmodus im Hauptfenster: zu, die Anordnung bleibt für später
          void fensterSchliessen(true);
          return;
      }
    });
    const hallo = () => bus.senden({ t: "hallo" }, "haupt");
    void bus.bereit.then(hallo);
    // falls das Hauptfenster noch nicht so weit ist: wiederholen
    const t = window.setInterval(() => (erhalten ? window.clearInterval(t) : hallo()), 1500);
    window.addEventListener("beforeunload", () => bus.senden({ t: "bye" }));
    if (inTauri()) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(() => bus.senden({ t: "bye" })));
    }
  });
}

/** Startanordnung eines neuen Nebenfensters (welche Fenster hinein) */
export function startPanels(): string[] {
  try {
    const k = `${START_KEY(FENSTER_ID)}.start`;
    const l = JSON.parse(localStorage.getItem(k) ?? "[]") as string[];
    localStorage.removeItem(k);
    return l;
  } catch {
    return [];
  }
}

export async function fensterSchliessen(anordnungBehalten = false): Promise<void> {
  bus.senden({ t: "bye" });
  try {
    if (!anordnungBehalten) {
      localStorage.removeItem(START_KEY(FENSTER_ID));
      localStorage.removeItem(`${START_KEY(FENSTER_ID)}.lage`);
    }
  } catch {
    /* egal */
  }
  if (inTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } else window.close();
}

bus.empfangen((m) => {
  if (m.t === "panelZeigen") void fensterNachVorne();
});

/** Dieses Programmfenster nach vorne holen */
export async function fensterNachVorne(): Promise<void> {
  if (inTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.unminimize().catch(() => undefined);
    await w.setFocus().catch(() => undefined);
  } else window.focus();
}
