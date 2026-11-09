/**
 * Arbeitsplatz: frei anordenbare Fenster (andocken, als Reiter stapeln, Größe ziehen),
 * Fenster schließen und wieder öffnen, Anordnung merken, Vorlagen, eigene Anordnungen.
 */
import {
  createDockview,
  type DockviewApi,
  type DockviewGroupPanel,
  type GroupPanelPartInitParameters,
  type IContentRenderer,
  type IDockviewPanel,
  type IGroupHeaderProps,
  type IHeaderActionsRenderer,
  type ITabRenderer,
  type TabPartInitParameters,
} from "dockview-core";
import { el, esc, toast } from "../dom";
import { anfrage, bus, FENSTER_ID, IST_HAUPT } from "./bus";

// ---------------------------------------------------------------- Bausteine (Fensterarten)

/**
 * Zahl am Reiter (wie im Entwurf): „rot“ (z. B. zu disponieren), „gelb“ (Fahrzeug ruft), „blau“ (neue Nachricht),
 * „blinkt“ (gelb, blinkt – z. B. Großeinsatz braucht etwas), „zahl“ (nur graue Zahl, z. B. „Aktive 11“).
 * Ältere Arten: „warn“ (rot, Chat blau, Großeinsatz gelb blinkend), „klingelt“ (rot pulsierend, Funk gelb), „“ (graue Zahl).
 */
export type BadgeArt = "" | "warn" | "klingelt" | "rot" | "gelb" | "blau" | "blinkt" | "zahl";

export interface PanelKontext {
  panelId: string;
  params: Record<string, unknown>;
  /** Zahl/Text im Reiter (z. B. offene Funksprüche); null = keiner */
  setzeBadge(text: string | number | null, art?: BadgeArt): void;
  setzeTitel(t: string): void;
  /** Parameter dauerhaft merken (z. B. Filter der Liste) */
  setzeParams(p: Record<string, unknown>): void;
  sichtbar(): boolean;
}

export interface PanelInstanz {
  el: HTMLElement;
  dispose?(): void;
  /** Größe hat sich geändert */
  groesse?(): void;
  /** Reiter wurde sichtbar/unsichtbar */
  sichtbar?(an: boolean): void;
}

export type Bereich = "links" | "mitte" | "rechts" | "unten";

export interface PanelDef {
  komponente: string;
  titel: string;
  /** kurze Beschreibung für das Fenster-Menü */
  info: string;
  bereich: Bereich;
  /** darf mehrfach offen sein (z. B. zweite Karte) */
  mehrfach?: boolean;
  /** nur einmal im ganzen Programm (über alle Fenster) */
  einmalig?: boolean;
  erstellen(ctx: PanelKontext): PanelInstanz;
}

const DEFS = new Map<string, PanelDef>();
export function registriere(def: PanelDef): void {
  DEFS.set(def.komponente, def);
}
export function panelDefs(): PanelDef[] {
  return [...DEFS.values()];
}

// ---------------------------------------------------------------- Reiter mit Zahl

const badges = new Map<string, { text: string; art: string }>();
const badgeHoerer = new Map<string, () => void>();

function setzeBadge(id: string, text: string | number | null, art = ""): void {
  const t = text === null || text === 0 || text === "" ? "" : String(text);
  const alt = badges.get(id);
  if (alt && alt.text === t && alt.art === art) return;
  badges.set(id, { text: t, art });
  badgeHoerer.get(id)?.();
}

/** Aussehen der Zahl am Reiter (Farben wie in den Fenster-Entwürfen) */
function badgeKlasse(komponente: string, art: string): string {
  switch (art) {
    case "rot":
    case "gelb":
    case "blau":
      return `lw-bdg ${art}`;
    case "blinkt":
      return "lw-bdg gelb blinkt";
    case "warn":
      if (komponente === "chat") return "lw-bdg blau";
      if (komponente === "grosseinsatz") return "lw-bdg gelb blinkt";
      return "lw-bdg rot";
    case "klingelt":
      if (komponente === "funk") return "lw-bdg gelb";
      return "lw-bdg rot puls";
    default:
      return "lw-tab-n";
  }
}

class Reiter implements ITabRenderer {
  readonly element = el("div", { class: "lw-tab" });
  private titel = el("span", { class: "lw-tab-titel" });
  private badge = el("span", { class: "lw-tab-n", hidden: "" });
  private id = "";
  private aus: (() => void)[] = [];

  constructor() {
    this.element.append(this.titel, this.badge);
  }

  init(p: TabPartInitParameters): void {
    this.id = p.api.id;
    this.titel.textContent = p.title;
    const d = p.api.onDidTitleChange((e) => (this.titel.textContent = e.title));
    this.aus.push(() => d.dispose());
    // mittlere Maustaste schließt den Reiter (Schließen sonst rechts im Fensterkopf oder per Rechtsklick)
    const mitte = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      p.api.close();
    };
    this.element.addEventListener("auxclick", mitte);
    this.aus.push(() => this.element.removeEventListener("auxclick", mitte));
    badgeHoerer.set(this.id, () => this.zeigeBadge());
    this.zeigeBadge();
  }

  private zeigeBadge(): void {
    const b = badges.get(this.id);
    this.badge.hidden = !b?.text;
    this.badge.textContent = b?.text ?? "";
    this.badge.className = badgeKlasse(this.id.replace(/-\d+$/, ""), b?.art ?? "");
    if (b?.text) this.badge.title = this.titel.textContent ?? "";
    this.element.classList.toggle("klingelt", b?.art === "klingelt" && !!b.text);
  }

  dispose(): void {
    for (const f of this.aus) f();
    if (badgeHoerer.get(this.id)) badgeHoerer.delete(this.id);
  }
}

class Inhalt implements IContentRenderer {
  readonly element = el("div", { class: "lw-panel" });
  private inst: PanelInstanz | null = null;
  private aus: (() => void)[] = [];
  constructor(private readonly komponente: string) {}

  init(p: GroupPanelPartInitParameters): void {
    const def = DEFS.get(this.komponente);
    if (!def) {
      this.element.innerHTML = `<div class="muted pad">Unbekanntes Fenster „${esc(this.komponente)}“</div>`;
      return;
    }
    const id = p.api.id;
    const ctx: PanelKontext = {
      panelId: id,
      params: (p.params ?? {}) as Record<string, unknown>,
      setzeBadge: (t, art) => setzeBadge(id, t, art),
      setzeTitel: (t) => p.api.setTitle(t),
      setzeParams: (x) => {
        ctx.params = { ...ctx.params, ...x };
        p.api.updateParameters(ctx.params);
      },
      sichtbar: () => p.api.isVisible,
    };
    this.inst = def.erstellen(ctx);
    this.element.appendChild(this.inst.el);
    this.element.dataset.panel = this.komponente;
    const d1 = p.api.onDidDimensionsChange(() => this.inst?.groesse?.());
    const d2 = p.api.onDidVisibilityChange((e) => this.inst?.sichtbar?.(e.isVisible));
    this.aus.push(() => d1.dispose(), () => d2.dispose());
  }

  dispose(): void {
    for (const f of this.aus) f();
    try {
      this.inst?.dispose?.();
    } catch (e) {
      console.error(e);
    }
  }
}

/** Symbole im Fensterkopf (wie im Entwurf, .iknopf) */
const SYM = {
  gross: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  klein: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  raus: '<rect x="3" y="7" width="14" height="14" rx="2"/><path d="M10 3h11v11M21 3l-8 8"/>',
  zurueck: '<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 10v11h11M3 21l8-8"/>',
  zu: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const sym = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

/** Knöpfe rechts im Fensterkopf: Vollbild · In neuem Fenster öffnen · Schließen */
class KopfKnoepfe implements IHeaderActionsRenderer {
  readonly element = el("div", { class: "lw-kopf-knoepfe" });
  private aus: (() => void)[] = [];
  init(p: IGroupHeaderProps): void {
    const knopf = (titel: string, d: string) => {
      const b = el("button", { class: "lw-ik", type: "button", title: titel, "aria-label": titel });
      b.innerHTML = sym(d);
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      return b;
    };
    const gross = knopf("Vollbild", SYM.gross);
    const grossZeigen = () => {
      const an = p.api.isMaximized();
      const t = an ? "Zurück zur Anordnung" : "Vollbild";
      gross.title = t;
      gross.setAttribute("aria-label", t);
      gross.innerHTML = sym(an ? SYM.klein : SYM.gross);
    };
    gross.addEventListener("click", () => {
      if (p.api.isMaximized()) p.api.exitMaximized();
      else p.api.maximize();
      grossZeigen();
    });
    const raus = knopf(IST_HAUPT ? "In neuem Fenster öffnen" : "Zurück ins Hauptfenster", IST_HAUPT ? SYM.raus : SYM.zurueck);
    raus.addEventListener("click", () => {
      const ids = p.group.panels.map((x) => x.id);
      if (IST_HAUPT) void inEigenesFenster(ids);
      else zurueckInsHauptfenster(ids);
    });
    const zu = knopf("Fenster schließen", SYM.zu);
    const zuTitel = () => {
      const a = p.group.activePanel;
      const t = a && p.group.panels.length > 1 ? `„${a.title ?? a.id}“ schließen` : "Fenster schließen";
      zu.title = t;
      zu.setAttribute("aria-label", t);
    };
    zu.addEventListener("mouseenter", zuTitel);
    zu.addEventListener("click", () => p.group.activePanel?.api.close());
    this.element.append(gross, raus, zu);
    const d = p.api.onDidLocationChange?.((e) => {
      raus.hidden = e.location.type !== "grid";
      gross.hidden = e.location.type !== "grid";
    });
    if (d) this.aus.push(() => d.dispose());
    const m = api?.onDidMaximizedGroupChange?.(() => grossZeigen());
    if (m) this.aus.push(() => m.dispose());
  }
  dispose(): void {
    for (const f of this.aus) f();
  }
}

// ---------------------------------------------------------------- Arbeitsplatz

let api: DockviewApi | null = null;
/** v2: Abfrage als eigenes Fenster neben der Karte (0.13.1) */
export const LAYOUT_KEY = `leitwerk.layout.v2.${FENSTER_ID}`;

export function dock(): DockviewApi | null {
  return api;
}

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ohne Speicher */
  }
}

let laedt = false;
let speicherTimer: number | undefined;
function merken(): void {
  if (!api || laedt) return;
  window.clearTimeout(speicherTimer);
  speicherTimer = window.setTimeout(() => {
    if (api) lsSet(LAYOUT_KEY, JSON.stringify(api.toJSON()));
  }, 400);
  panelsMelden();
}

const aenderungsHoerer = new Set<() => void>();
/** Fenster geöffnet/geschlossen (für das Menü) */
export function onPanelsGeaendert(fn: () => void): () => void {
  aenderungsHoerer.add(fn);
  return () => aenderungsHoerer.delete(fn);
}

// ---------------------------------------------------------------- Reiter zwischen Programmfenstern ziehen

const REITER_TYP = "application/x-leitwerk-reiter";

/**
 * Reiter (z. B. „Telefon“) von einem Programmfenster in ein anderes ziehen: Das Ziel-Fenster
 * öffnet das Fenster an der Ablagestelle, das Herkunfts-Fenster schließt es.
 */
function reiterZwischenFenstern(a: DockviewApi): void {
  document.addEventListener(
    "dragstart",
    (e) => {
      const tab = (e.target as HTMLElement | null)?.closest?.("[data-tab-panel-id]") as HTMLElement | null;
      const id = tab?.dataset.tabPanelId;
      if (id && e.dataTransfer) e.dataTransfer.setData(REITER_TYP, JSON.stringify({ id, von: FENSTER_ID }));
    },
    true,
  );
  const fremd = (e: DragEvent) => !!e.dataTransfer?.types.includes(REITER_TYP);
  a.onUnhandledDragOver((e) => {
    if (fremd(e.nativeEvent as DragEvent)) e.accept();
  });
  a.onDidDrop((e) => {
    const roh = (e.nativeEvent as DragEvent).dataTransfer?.getData(REITER_TYP);
    if (!roh) return;
    let d: { id: string; von: string };
    try {
      d = JSON.parse(roh) as { id: string; von: string };
    } catch {
      return;
    }
    if (!d.id || d.von === FENSTER_ID) return;
    const komponente = d.id.replace(/-\d+$/, "");
    const def = DEFS.get(komponente);
    if (!def) return;
    if (!a.getPanel(d.id)) {
      const richtung = ({ center: "within", top: "above", bottom: "below", left: "left", right: "right" } as const)[e.position as "center"] ?? "within";
      const nr = d.id.match(/-(\d+)$/)?.[1];
      a.addPanel({
        id: d.id,
        component: komponente,
        title: nr ? `${def.titel} ${nr}` : def.titel,
        params: {},
        ...(e.group ? { position: { referenceGroup: e.group, direction: richtung } } : {}),
      });
    }
    bus.senden({ t: "reiterWeg", id: d.id }, d.von);
  });
  bus.empfangen((m) => {
    if (m.t === "reiterWeg") a.getPanel(String(m.id))?.api.close();
  });
}

export function arbeitsplatzStarten(container: HTMLElement): DockviewApi {
  container.classList.add("dockview-theme-light");
  api = createDockview(container, {
    theme: { name: "leitwerk", className: "lw-dock", gap: 8, dndOverlayMounting: "absolute", dndPanelOverlay: "group", tabAnimation: "smooth" },
    defaultRenderer: "always",
    createComponent: (o) => new Inhalt(o.name),
    defaultTabComponent: "reiter",
    createTabComponent: () => new Reiter(),
    createRightHeaderActionComponent: () => new KopfKnoepfe(),
    singleTabMode: "default",
    floatingGroupBounds: "boundedWithinViewport",
    noPanelsOverlay: "watermark",
    createWatermarkComponent: () => {
      const w = el("div", { class: "lw-leer" });
      w.innerHTML = `<div><b>Leerer Bereich</b><div class="muted">Über <b>Fenster</b> oben ein Fenster öffnen oder einen Reiter hierher ziehen.</div></div>`;
      return { element: w, init: () => undefined };
    },
    getTabContextMenuItems: (p) => [
      p.panel.api.isMaximized()
        ? { label: "Verkleinern", action: () => p.panel.api.exitMaximized() }
        : { label: "Maximieren", action: () => p.panel.api.maximize(), disabled: p.panel.api.location.type !== "grid" },
      { label: "Schwebend (frei verschiebbar)", action: () => api?.addFloatingGroup(p.panel), disabled: p.panel.api.location.type === "floating" },
      "separator",
      IST_HAUPT
        ? { label: "In eigenem Fenster öffnen", action: () => void inEigenesFenster([p.panel.id]) }
        : { label: "Zurück ins Hauptfenster", action: () => zurueckInsHauptfenster([p.panel.id]) },
      "separator",
      { label: "Schließen", action: () => p.panel.api.close() },
    ],
  });
  reiterZwischenFenstern(api);
  if (location.search.includes("debug")) {
    const w = window as unknown as { __lw?: Record<string, unknown> };
    w.__lw = {
      ...(w.__lw ?? {}),
      dock: api,
      vorlage: (i: number) => vorlageAnwenden(VORLAGEN[i]),
      zeige: (id: string) => panelZeigen(id),
      // für automatische Tests: alle Fenster gleichzeitig sichtbar
      testAnordnung: () => {
        const a = api!;
        a.clear();
        add(a, "einsatzliste");
        add(a, "einsatz", { ref: "einsatzliste", dir: "right" });
        add(a, "kt", { ref: "einsatz", dir: "right" });
        add(a, "abfrage", { ref: "kt", dir: "right" });
        add(a, "telefon", { ref: "einsatzliste", dir: "below" });
        add(a, "karte", { ref: "einsatz", dir: "below" });
        add(a, "funk", { ref: "kt", dir: "below" });
        add(a, "chat", { ref: "abfrage", dir: "below" });
        add(a, "fahrzeuge", { ref: "telefon", dir: "below" });
        add(a, "aktive", { ref: "chat", dir: "below" });
        add(a, "statuslog", { ref: "aktive", dir: "right" });
      },
    };
  }
  api.onDidLayoutChange(() => merken());
  api.onDidAddPanel(() => {
    merken();
    for (const fn of aenderungsHoerer) fn();
  });
  api.onDidRemovePanel(() => {
    merken();
    for (const fn of aenderungsHoerer) fn();
  });
  // Fußleiste wie in der Gesamtansicht (eigene Datei, später geladen: braucht Spielstand und Geodaten)
  void import("./fussleiste").then((m) => m.fussleisteStarten());
  return api;
}

/** Gespeicherte Anordnung laden; false = keine vorhanden oder kaputt */
export function anordnungLaden(json?: unknown): boolean {
  if (!api) return false;
  const daten = json ?? (() => {
    const s = lsGet(LAYOUT_KEY);
    return s ? (JSON.parse(s) as unknown) : null;
  })();
  if (!daten) return false;
  laedt = true;
  try {
    api.fromJSON(daten as Parameters<DockviewApi["fromJSON"]>[0]);
    // Fenster, die es nicht (mehr) gibt, entfernen
    for (const p of [...api.panels]) if (!DEFS.has(komponenteVon(p))) p.api.close();
    // neu seit 0.40: „Statusänderungen“ einmal neben „Aktive Fahrzeuge“ anlegen (schließt man ihn, bleibt er zu)
    const NEU_KEY = "leitwerk.neu.statuslog";
    if (!json && !lsGet(NEU_KEY) && api.getPanel("aktive") && !api.panels.some((p) => komponenteVon(p) === "statuslog")) add(api, "statuslog", { ref: "aktive", dir: "within" });
    lsSet(NEU_KEY, "1");
    return api.panels.length > 0;
  } catch (e) {
    console.warn("Anordnung konnte nicht geladen werden", e);
    api.clear();
    return false;
  } finally {
    laedt = false;
    merken();
  }
}

export function anordnungJson(): unknown {
  return api?.toJSON() ?? null;
}

function komponenteVon(p: IDockviewPanel): string {
  return (p.view.contentComponent as string | undefined) ?? p.id.replace(/-\d+$/, "");
}

// ---------------------------------------------------------------- Öffnen, zeigen, schließen

/** Welche Fenster in welchem Programmfenster offen sind (alle Programmfenster) */
const offenIn = new Map<string, string[]>();

export function offeneHier(): string[] {
  return api?.panels.map((p) => p.id) ?? [];
}

function panelsMelden(): void {
  bus.senden({ t: "panels", liste: offeneHier() });
}

/** In welchem Programmfenster ist ein Fenster offen? (hier zuerst) */
export function woOffen(id: string): string | null {
  if (offeneHier().includes(id)) return FENSTER_ID;
  for (const [f, l] of offenIn) if (l.includes(id)) return f;
  return null;
}

export function andereFenster(): string[] {
  return [...offenIn.keys()];
}

bus.empfangen((m, von) => {
  if (m.t === "panels") {
    offenIn.set(von, (m.liste as string[]) ?? []);
    for (const fn of aenderungsHoerer) fn();
  } else if (m.t === "panelsFrage") {
    panelsMelden();
  } else if (m.t === "bye") {
    offenIn.delete(von);
    for (const fn of aenderungsHoerer) fn();
  } else if (m.t === "panelZeigen") {
    panelZeigen(String(m.id), { lokal: true });
  } else if (m.t === "panelSchliessen") {
    api?.getPanel(String(m.id))?.api.close();
  }
});
bus.senden({ t: "panelsFrage" });

function neueId(komponente: string): string {
  const def = DEFS.get(komponente);
  if (!def?.mehrfach) return komponente;
  for (let i = 1; ; i++) {
    const id = i === 1 ? komponente : `${komponente}-${i}`;
    if (!woOffen(id)) return id;
  }
}

/**
 * Wohin ein Fenster als Reiter kommt, wenn es aufgeht (z. B. klingelt das Telefon): zuerst zu den Fenstern, mit
 * denen es im Entwurf ein Fenster bildet (Funk + Chat, RD/KT-Übersicht, Fahrzeuge-Reiter), dann zu verwandten.
 */
const NACHBARN: Record<string, string[]> = {
  einsatz: ["kt", "sek", "grosseinsatz", "abfrage"],
  kt: ["einsatz", "sek", "grosseinsatz", "abfrage"],
  sek: ["kt", "einsatz", "grosseinsatz", "abfrage"],
  grosseinsatz: ["einsatz", "kt", "abfrage"],
  abfrage: ["telefon", "einsatz", "kt"],
  telefon: ["abfrage", "einsatz", "kt", "einsatzliste"],
  funk: ["chat"],
  chat: ["funk"],
  fahrzeuge: ["aktive", "statuslog"],
  aktive: ["fahrzeuge", "statuslog"],
  statuslog: ["aktive", "fahrzeuge"],
  khstatus: ["akutversorgung", "khaufnahme"],
  akutversorgung: ["khstatus", "khaufnahme"],
  khaufnahme: ["khstatus", "akutversorgung"],
};

/** Gruppe, in der schon ein verwandtes Fenster bzw. eines desselben Bereichs steckt */
function gruppeFuer(bereich: Bereich, komponente?: string): DockviewGroupPanel | null {
  if (!api) return null;
  for (const n of NACHBARN[komponente ?? ""] ?? []) {
    const p = api.panels.find((x) => komponenteVon(x) === n && x.group.api.location.type === "grid");
    if (p) return p.group;
  }
  for (const p of api.panels) {
    const d = DEFS.get(komponenteVon(p));
    if (d?.bereich === bereich && p.group.api.location.type === "grid") return p.group;
  }
  return null;
}

/** Fenster hier öffnen (an passender Stelle) und nach vorne holen */
export function panelOeffnen(komponente: string, opts: { id?: string; params?: Record<string, unknown>; inaktiv?: boolean } = {}): IDockviewPanel | null {
  if (!api) return null;
  const def = DEFS.get(komponente);
  if (!def) return null;
  const id = opts.id ?? neueId(komponente);
  const vorhanden = api.getPanel(id);
  if (vorhanden) {
    if (!opts.inaktiv) vorhanden.api.setActive();
    return vorhanden;
  }
  const gruppe = gruppeFuer(def.bereich, komponente);
  const karte = api.panels.find((p) => komponenteVon(p) === "karte");
  const nr = id.match(/-(\d+)$/)?.[1];
  const basis = { id, component: komponente, title: nr ? `${def.titel} ${nr}` : def.titel, params: opts.params ?? {}, inactive: opts.inaktiv };
  let p: IDockviewPanel;
  if (gruppe) p = api.addPanel({ ...basis, position: { referenceGroup: gruppe, direction: "within" } });
  else if (karte && def.bereich !== "mitte") {
    const richtung = def.bereich === "links" ? "left" : def.bereich === "rechts" ? "right" : "below";
    const breite = Math.round(api.width * (def.bereich === "unten" ? 1 : 0.26));
    p = api.addPanel({ ...basis, position: { referencePanel: karte, direction: richtung }, initialWidth: def.bereich === "unten" ? undefined : breite, initialHeight: def.bereich === "unten" ? 220 : undefined });
  } else if (api.panels.length) {
    const ziel = karte ?? api.activePanel ?? api.panels[0];
    p = api.addPanel({ ...basis, position: { referencePanel: ziel, direction: def.bereich === "mitte" ? "within" : "right" } });
  } else p = api.addPanel(basis);
  return p;
}

/**
 * Fenster zeigen: ist es hier offen, nach vorne holen; ist es in einem anderen Programmfenster offen,
 * dort nach vorne holen; sonst hier öffnen.
 */
export function panelZeigen(id: string, opts: { lokal?: boolean; nurWennOffen?: boolean; params?: Record<string, unknown> } = {}): void {
  const p = api?.getPanel(id);
  if (p) {
    if (!p.api.isVisible || !p.group.api.isActive) p.api.setActive();
    return;
  }
  if (opts.lokal) return;
  const wo = woOffen(id);
  if (wo && wo !== FENSTER_ID) {
    bus.senden({ t: "panelZeigen", id }, wo);
    return;
  }
  if (opts.nurWennOffen) return;
  panelOeffnen(id.replace(/-\d+$/, ""), { id, params: opts.params });
}

export function panelSchliessen(id: string): void {
  const p = api?.getPanel(id);
  if (p) p.api.close();
  else {
    const wo = woOffen(id);
    if (wo) bus.senden({ t: "panelSchliessen", id }, wo);
  }
}

// ---------------------------------------------------------------- eigene Programmfenster

type FensterOeffner = (panels: string[], layout?: unknown, bounds?: FensterBounds) => Promise<string | null>;
let oeffner: FensterOeffner | null = null;
/** Das Hauptfenster meldet, wie neue Programmfenster aufgehen */
export function setzeFensterOeffner(fn: FensterOeffner): void {
  oeffner = fn;
}

export interface FensterBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fenster (Reiter) in ein neues Programmfenster verschieben */
export async function inEigenesFenster(ids: string[]): Promise<void> {
  if (!oeffner) return toast("Eigene Fenster gibt es nur im Hauptfenster", "error");
  const neu = await oeffner(ids);
  if (!neu) return;
  for (const id of ids) api?.getPanel(id)?.api.close();
}

/** Aus einem Nebenfenster zurück ins Hauptfenster */
export function zurueckInsHauptfenster(ids: string[]): void {
  bus.senden({ t: "panelsUebernehmen", ids }, "haupt");
  for (const id of ids) api?.getPanel(id)?.api.close();
}

if (IST_HAUPT) {
  bus.empfangen((m) => {
    if (m.t !== "panelsUebernehmen") return;
    for (const id of (m.ids as string[]) ?? []) panelOeffnen(id.replace(/-\d+$/, ""), { id });
  });
}

// ---------------------------------------------------------------- Vorlagen

/**
 * Aufteilung eines Bildschirms: Reihen („h“ nebeneinander, „v“ untereinander) mit Gewichten, darin Fenster
 * (ein Fenster = mehrere Reiter). Die Gewichte sind die Breiten/Höhen aus den Gesamtansichten des Entwurfs
 * (Arbeitsplatz.dc.html, 1920 × 1080: Fläche 1904 × 986, 8 px Abstand).
 */
export type Aufteilung =
  | { reihe: "h" | "v"; teile: [number, Aufteilung][] }
  | { reiter: string[]; aktiv?: string; params?: Record<string, Record<string, unknown>> };

const H = (...teile: [number, Aufteilung][]): Aufteilung => ({ reihe: "h", teile });
const V = (...teile: [number, Aufteilung][]): Aufteilung => ({ reihe: "v", teile });
const F = (reiter: string[], aktiv?: string, params?: Record<string, Record<string, unknown>>): Aufteilung => ({ reiter, aktiv, params });

/** Fenster, wie sie im Entwurf heißen */
const EINSATZLISTE = (params?: Record<string, unknown>) => F(["einsatzliste"], "einsatzliste", params ? { einsatzliste: params } : undefined);
const FAHRZEUGE = () => F(["fahrzeuge", "aktive", "statuslog"], "aktive");
const MASKE = (aktiv = "einsatz") => F(["einsatz", "kt", "sek"], aktiv);
const KARTE = () => F(["karte"]);
const FUNK = () => F(["funk", "chat"], "funk");
const ABFRAGE = () => F(["abfrage"]);
const TELEFON = () => F(["telefon"]);

export interface Vorlage {
  id: string;
  name: string;
  info: string;
  /** Bildschirmformat (für das Vorschaubild) */
  format: "16:9" | "32:9";
  /** je Bildschirm (Programmfenster) die Aufteilung; der erste ist das Hauptfenster */
  schirme: Aufteilung[];
  /** kurze Beschreibung je Bildschirm (Fußleiste), bei mehreren Bildschirmen */
  schirmInfo?: string[];
}

export const VORLAGEN: Vorlage[] = [
  {
    id: "ein",
    name: "Ein Bildschirm 16:9",
    info: "Listen links, Maske Mitte, Karte und Funk rechts",
    format: "16:9",
    schirme: [H([620, V([560, EINSATZLISTE()], [418, FAHRZEUGE()])], [560, MASKE()], [708, V([560, KARTE()], [418, FUNK()])])],
  },
  {
    id: "zwei",
    name: "Zwei Bildschirme 16:9",
    info: "Abfrage und Maske hier, Listen, Karte, Funk daneben",
    format: "16:9",
    schirme: [
      H([1140, F(["abfrage", "telefon"], "abfrage")], [756, MASKE()]),
      H([980, V([480, EINSATZLISTE()], [498, FAHRZEUGE()])], [916, V([620, KARTE()], [358, FUNK()])]),
    ],
    schirmInfo: ["Abfrage und RD-Übersicht", "Einsatzliste, Fahrzeuge, Karte, Funk"],
  },
  {
    id: "breit",
    name: "Ein Bildschirm 32:9",
    info: "Alles nebeneinander auf einem breiten Bildschirm",
    format: "32:9",
    schirme: [
      H(
        [860, V([560, EINSATZLISTE()], [418, FAHRZEUGE()])],
        [1080, F(["abfrage", "telefon"], "abfrage")],
        [620, MASKE()],
        [1240, V([620, KARTE()], [358, FUNK()])],
      ),
    ],
  },
  {
    id: "notruf",
    name: "Notruf-Disponent",
    info: "Telefon und Abfrage groß, Maske daneben",
    format: "16:9",
    schirme: [H([22, V([30, TELEFON()], [70, EINSATZLISTE({ art: "rd" })])], [48, V([55, ABFRAGE()], [45, KARTE()])], [30, V([70, MASKE()], [30, FUNK()])])],
  },
  {
    id: "kt",
    name: "KT-Disponent",
    info: "KT- und SEK-Aufträge, Hotline, aktive Fahrzeuge",
    format: "16:9",
    schirme: [
      H(
        [27, V([18, TELEFON()], [82, EINSATZLISTE({ art: "ktsek" })])],
        [40, V([68, F(["karte", "abfrage"], "karte")], [32, H([24, F(["aktive", "fahrzeuge", "statuslog"], "aktive")], [16, FUNK()])])],
        [33, MASKE("kt")],
      ),
    ],
  },
  {
    id: "funk",
    name: "Funk",
    info: "Funk groß, aktive Fahrzeuge und Karte",
    format: "16:9",
    schirme: [H([26, V([55, FAHRZEUGE()], [45, EINSATZLISTE()])], [36, V([55, FUNK()], [45, MASKE()])], [38, KARTE()])],
  },
];

/** Aufteilung in Prozent der Fläche ([x, y, b, h] je Fenster) – für die Vorschaubilder */
export function aufteilungTeile(k: Aufteilung): number[][] {
  const out: number[][] = [];
  const lauf = (n: Aufteilung, x: number, y: number, w: number, h: number) => {
    if (!("reihe" in n)) {
      out.push([x, y, w, h]);
      return;
    }
    const summe = n.teile.reduce((s, [g]) => s + g, 0) || 1;
    let pos = 0;
    for (const [g, c] of n.teile) {
      const anteil = g / summe;
      if (n.reihe === "h") lauf(c, x + pos * w, y, anteil * w, h);
      else lauf(c, x, y + pos * h, w, anteil * h);
      pos += anteil;
    }
  };
  lauf(k, 0, 0, 100, 100);
  return out;
}

const ABSTAND = 8;

/** Aufteilung als dockview-Anordnung (fromJSON) für eine Fläche von w × h Pixeln */
export function aufteilungJson(k: Aufteilung, w: number, h: number): unknown {
  let gruppe = 0;
  const panels: Record<string, { id: string; contentComponent: string; title: string; params?: Record<string, unknown> }> = {};
  let ersteGruppe = "";
  const knoten = (n: Aufteilung, bw: number, bh: number, size: number): unknown => {
    if (!("reihe" in n)) {
      const views = n.reiter.filter((id) => DEFS.has(id.replace(/-\d+$/, "")));
      for (const id of views) {
        const def = DEFS.get(id.replace(/-\d+$/, ""))!;
        panels[id] = { id, contentComponent: def.komponente, title: def.titel, ...(n.params?.[id] ? { params: n.params[id] } : {}) };
      }
      const gid = String(++gruppe);
      if (!ersteGruppe) ersteGruppe = gid;
      return { type: "leaf", data: { views, activeView: n.aktiv && views.includes(n.aktiv) ? n.aktiv : views[0], id: gid }, size };
    }
    const anzahl = n.teile.length;
    const laenge = (n.reihe === "h" ? bw : bh) - ABSTAND * (anzahl - 1);
    const summe = n.teile.reduce((s, [g]) => s + g, 0) || 1;
    let rest = laenge;
    const data = n.teile.map(([g, c], i) => {
      const l = i === anzahl - 1 ? rest : Math.round((laenge * g) / summe);
      rest -= l;
      return n.reihe === "h" ? knoten(c, l, bh, l) : knoten(c, bw, l, l);
    });
    return { type: "branch", data, size };
  };
  const wurzel = ("reihe" in k ? k : H([1, k])) as { reihe: "h" | "v"; teile: [number, Aufteilung][] };
  const root = knoten(wurzel, w, h, wurzel.reihe === "h" ? h : w);
  return { grid: { root, width: w, height: h, orientation: wurzel.reihe === "h" ? "HORIZONTAL" : "VERTICAL" }, panels, activeGroup: ersteGruppe };
}

function add(a: DockviewApi, id: string, pos?: { ref: string; dir: "left" | "right" | "above" | "below" | "within" }, params?: Record<string, unknown>): void {
  const komponente = id.replace(/-\d+$/, "");
  const def = DEFS.get(komponente);
  if (!def || a.getPanel(id)) return;
  a.addPanel({
    id,
    component: komponente,
    title: def.titel,
    params: params ?? {},
    inactive: pos?.dir === "within",
    ...(pos && a.getPanel(pos.ref) ? { position: { referencePanel: pos.ref, direction: pos.dir } } : {}),
  });
}

/** Größe des Andockbereichs (gleich nach dem Start kennt dockview sie evtl. noch nicht) */
function flaeche(a: DockviewApi): { w: number; h: number } {
  const el = document.getElementById("dock");
  const rand = 2 * ABSTAND;
  return { w: a.width || (el ? el.clientWidth - rand : 0) || 1200, h: a.height || (el ? el.clientHeight - rand : 0) || 800 };
}
const naechstesBild = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Zuletzt übernommene Vorlage/Anordnung (für die Fußleiste) */
let aufbauName = "";
const aufbauHoerer = new Set<() => void>();
export function aufbau(): { name: string; schirm?: string } {
  return { name: aufbauName, schirm: aufbauSchirm };
}
let aufbauSchirm: string | undefined;
export function onAufbau(fn: () => void): () => void {
  aufbauHoerer.add(fn);
  return () => aufbauHoerer.delete(fn);
}
function aufbauSetzen(name: string, schirm?: string): void {
  aufbauName = name;
  aufbauSchirm = schirm;
  try {
    localStorage.setItem("leitwerk.anordnung.aufbau", JSON.stringify({ name, schirm }));
  } catch {
    /* egal */
  }
  for (const fn of aufbauHoerer) fn();
}
try {
  const a = JSON.parse(localStorage.getItem("leitwerk.anordnung.aufbau") ?? "null") as { name?: string; schirm?: string } | null;
  if (a?.name) {
    aufbauName = a.name;
    aufbauSchirm = a.schirm;
  }
} catch {
  /* egal */
}

/** Wo der zweite Bildschirm vermutlich ist: rechts neben dem Hauptfenster, gleich groß */
function naechsterSchirm(i: number): FensterBounds {
  return { x: window.screenX + window.outerWidth * i, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
}

/** Vorlage anwenden (nur im Hauptfenster; schließt weitere Programmfenster) */
export async function vorlageAnwenden(v: Vorlage): Promise<void> {
  if (!api) return;
  laedt = true;
  try {
    // warten, bis dockview die Fläche kennt
    for (let i = 0; i < 60 && !(api.width > 0); i++) await naechstesBild();
    const { w, h } = flaeche(api);
    api.fromJSON(aufteilungJson(v.schirme[0], w, h) as Parameters<DockviewApi["fromJSON"]>[0]);
    bus.senden({ t: "fensterSchliessen" });
    offenIn.clear();
    aufbauSetzen(v.name, v.schirmInfo?.[0]);
    for (let i = 1; i < v.schirme.length; i++) await oeffner?.([], aufteilungJson(v.schirme[i], w, h), naechsterSchirm(i));
  } finally {
    laedt = false;
    merken();
  }
}

// ---------------------------------------------------------------- eigene Anordnungen (mit Namen)

export interface GespeicherteAnordnung {
  name: string;
  haupt: unknown;
  fenster: { layout: unknown; bounds: FensterBounds | null }[];
}

const ANORDNUNGEN_KEY = "leitwerk.anordnungen";

export function anordnungen(): GespeicherteAnordnung[] {
  try {
    return JSON.parse(lsGet(ANORDNUNGEN_KEY) ?? "[]") as GespeicherteAnordnung[];
  } catch {
    return [];
  }
}

function anordnungenSetzen(l: GespeicherteAnordnung[]): void {
  lsSet(ANORDNUNGEN_KEY, JSON.stringify(l));
  for (const fn of aenderungsHoerer) fn();
}

/** Jetzige Anordnung (mit allen Programmfenstern) einsammeln */
export async function anordnungEinsammeln(name: string): Promise<GespeicherteAnordnung> {
  const fenster: GespeicherteAnordnung["fenster"] = [];
  for (const f of andereFenster()) {
    try {
      const r = (await anfrage(f, { t: "layoutFrage" }, 3000)) as { layout: unknown; bounds: FensterBounds | null };
      if (r?.layout) fenster.push(r);
    } catch {
      /* Fenster antwortet nicht */
    }
  }
  return { name, haupt: anordnungJson(), fenster };
}

export async function anordnungSpeichern(name: string): Promise<void> {
  const a = await anordnungEinsammeln(name);
  anordnungenSetzen([...anordnungen().filter((x) => x.name !== name), a]);
}

export function anordnungLoeschen(name: string): void {
  anordnungenSetzen(anordnungen().filter((x) => x.name !== name));
}

export async function anordnungAnwenden(a: GespeicherteAnordnung): Promise<void> {
  bus.senden({ t: "fensterSchliessen" });
  offenIn.clear();
  if (!anordnungLaden(a.haupt)) {
    toast("Die Anordnung konnte nicht geladen werden", "error");
    return;
  }
  aufbauSetzen(a.name);
  for (const f of a.fenster) await oeffner?.([], f.layout, f.bounds ?? undefined);
}

export function anordnungImportieren(text: string): GespeicherteAnordnung {
  const a = JSON.parse(text) as GespeicherteAnordnung;
  if (!a || typeof a !== "object" || !a.haupt) throw new Error("Keine LeitWerk-Anordnung");
  a.name = String(a.name || "Importiert");
  a.fenster = Array.isArray(a.fenster) ? a.fenster : [];
  anordnungenSetzen([...anordnungen().filter((x) => x.name !== a.name), a]);
  return a;
}

/** Gespeicherte Anordnungen dieses Fensters löschen (Einstellungen → zurücksetzen) */
export function anordnungZuruecksetzen(): void {
  lsSet(LAYOUT_KEY, null);
  void vorlageAnwenden(VORLAGEN[0]);
}

// Nebenfenster: Anordnung auf Nachfrage melden
bus.empfangen((m, von) => {
  if (m.t === "layoutFrage" && !IST_HAUPT) {
    bus.senden(
      {
        t: "antwort",
        id: m.id,
        ok: true,
        wert: { layout: anordnungJson(), bounds: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight } },
      },
      von,
    );
  }
});
