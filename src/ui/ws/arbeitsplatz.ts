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

export interface PanelKontext {
  panelId: string;
  params: Record<string, unknown>;
  /** Zahl/Text im Reiter (z. B. offene Funksprüche); null = keiner */
  setzeBadge(text: string | number | null, art?: "" | "warn" | "klingelt"): void;
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

class Reiter implements ITabRenderer {
  readonly element = el("div", { class: "lw-tab" });
  private titel = el("span", { class: "lw-tab-titel" });
  private badge = el("span", { class: "lw-tab-badge", hidden: "" });
  private zu = el("button", { class: "lw-tab-zu", type: "button", title: "Fenster schließen" }, "×");
  private id = "";
  private aus: (() => void)[] = [];

  constructor() {
    this.element.append(this.titel, this.badge, this.zu);
  }

  init(p: TabPartInitParameters): void {
    this.id = p.api.id;
    this.titel.textContent = p.title;
    const d = p.api.onDidTitleChange((e) => (this.titel.textContent = e.title));
    this.aus.push(() => d.dispose());
    this.zu.addEventListener("pointerdown", (e) => e.preventDefault());
    this.zu.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      p.api.close();
    });
    badgeHoerer.set(this.id, () => this.zeigeBadge());
    this.zeigeBadge();
  }

  private zeigeBadge(): void {
    const b = badges.get(this.id);
    this.badge.hidden = !b?.text;
    this.badge.textContent = b?.text ?? "";
    this.badge.className = `lw-tab-badge${b?.art ? ` ${b.art}` : ""}`;
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

/** Knöpfe rechts im Reiterkopf: groß machen, in eigenes Fenster */
class KopfKnoepfe implements IHeaderActionsRenderer {
  readonly element = el("div", { class: "lw-kopf-knoepfe" });
  private aus: (() => void)[] = [];
  init(p: IGroupHeaderProps): void {
    const gross = el("button", { class: "lw-kopf-b", type: "button", title: "Groß machen / zurück" }, "⤢");
    gross.addEventListener("click", () => {
      if (p.api.isMaximized()) p.api.exitMaximized();
      else p.api.maximize();
    });
    const raus = el("button", { class: "lw-kopf-b", type: "button", title: IST_HAUPT ? "In eigenem Fenster öffnen (z. B. für den zweiten Bildschirm)" : "Zurück ins Hauptfenster" }, IST_HAUPT ? "⧉" : "⇱");
    raus.addEventListener("click", () => {
      const ids = p.group.panels.map((x) => x.id);
      if (IST_HAUPT) void inEigenesFenster(ids);
      else zurueckInsHauptfenster(ids);
    });
    this.element.append(gross, raus);
    const d = p.api.onDidLocationChange?.((e) => (raus.hidden = e.location.type !== "grid"));
    if (d) this.aus.push(() => d.dispose());
  }
  dispose(): void {
    for (const f of this.aus) f();
  }
}

// ---------------------------------------------------------------- Arbeitsplatz

let api: DockviewApi | null = null;
const LAYOUT_KEY = `leitwerk.layout.${FENSTER_ID}`;

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

export function arbeitsplatzStarten(container: HTMLElement): DockviewApi {
  container.classList.add("dockview-theme-light");
  api = createDockview(container, {
    theme: { name: "leitwerk", className: "lw-dock", gap: 6, dndOverlayMounting: "absolute", dndPanelOverlay: "group", tabAnimation: "smooth" },
    defaultRenderer: "always",
    createComponent: (o) => new Inhalt(o.name),
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
      "maximize",
      "float",
      "separator",
      IST_HAUPT
        ? { label: "In eigenem Fenster öffnen", action: () => void inEigenesFenster([p.panel.id]) }
        : { label: "Zurück ins Hauptfenster", action: () => zurueckInsHauptfenster([p.panel.id]) },
      "separator",
      "close",
    ],
  });
  if (location.search.includes("debug")) {
    const w = window as unknown as { __lw?: Record<string, unknown> };
    w.__lw = { ...(w.__lw ?? {}), dock: api, vorlage: (i: number) => vorlageAnwenden(VORLAGEN[i]) };
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

/** Gruppe, in der schon ein Fenster desselben Bereichs steckt */
function gruppeFuer(bereich: Bereich): DockviewGroupPanel | null {
  if (!api) return null;
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
  const gruppe = gruppeFuer(def.bereich);
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

export interface Vorlage {
  id: string;
  name: string;
  info: string;
  /** baut die Anordnung im Hauptfenster; liefert Fenster für weitere Programmfenster */
  bauen(a: DockviewApi): string[][] | void;
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
  return { w: a.width || el?.clientWidth || 1200, h: a.height || el?.clientHeight || 800 };
}
/** Größen erst setzen, wenn dockview die Fläche ausgelegt hat */
let groessen: (() => void)[] | null = null;
function spaeter(fn: () => void): void {
  if (groessen) groessen.push(fn);
  else fn();
}
function breite(a: DockviewApi, id: string, anteil: number): void {
  spaeter(() => a.getPanel(id)?.group.api.setSize({ width: Math.round(flaeche(a).w * anteil) }));
}
function hoehe(a: DockviewApi, id: string, anteil: number): void {
  spaeter(() => a.getPanel(id)?.group.api.setSize({ height: Math.round(flaeche(a).h * anteil) }));
}
const naechstesBild = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export const VORLAGEN: Vorlage[] = [
  {
    id: "alles",
    name: "Alles auf einem Bildschirm",
    info: "Listen links, Karte in der Mitte, Masken und Funk rechts",
    bauen(a) {
      add(a, "karte");
      add(a, "einsatzliste", { ref: "karte", dir: "left" });
      add(a, "telefon", { ref: "einsatzliste", dir: "above" });
      add(a, "aktive", { ref: "einsatzliste", dir: "below" });
      add(a, "fahrzeuge", { ref: "aktive", dir: "within" });
      add(a, "einsatz", { ref: "karte", dir: "right" });
      add(a, "abfrage", { ref: "einsatz", dir: "within" });
      add(a, "kt", { ref: "einsatz", dir: "within" });
      add(a, "funk", { ref: "einsatz", dir: "below" });
      add(a, "chat", { ref: "funk", dir: "within" });
      breite(a, "einsatzliste", 0.24);
      breite(a, "einsatz", 0.3);
      hoehe(a, "telefon", 0.26);
      hoehe(a, "aktive", 0.3);
      hoehe(a, "funk", 0.3);
      a.getPanel("einsatz")?.api.setActive();
      a.getPanel("aktive")?.api.setActive();
    },
  },
  {
    id: "notruf",
    name: "Notruf-Disponent",
    info: "Telefon und Abfrage groß, Einsatzmaske daneben",
    bauen(a) {
      add(a, "abfrage");
      add(a, "telefon", { ref: "abfrage", dir: "left" });
      add(a, "einsatzliste", { ref: "telefon", dir: "below" }, { art: "rd" });
      add(a, "einsatz", { ref: "abfrage", dir: "right" });
      add(a, "karte", { ref: "abfrage", dir: "below" });
      add(a, "funk", { ref: "einsatz", dir: "below" });
      breite(a, "telefon", 0.22);
      breite(a, "einsatz", 0.3);
      hoehe(a, "telefon", 0.3);
      hoehe(a, "karte", 0.45);
      hoehe(a, "funk", 0.3);
    },
  },
  {
    id: "kt",
    name: "KT-Disponent",
    info: "Krankentransporte und Überstellungen, Hotline, aktive Fahrzeuge",
    bauen(a) {
      add(a, "karte");
      add(a, "einsatzliste", { ref: "karte", dir: "left" }, { art: "ktsek" });
      add(a, "telefon", { ref: "einsatzliste", dir: "above" });
      add(a, "kt", { ref: "karte", dir: "right" });
      add(a, "abfrage", { ref: "kt", dir: "within" });
      add(a, "aktive", { ref: "karte", dir: "below" });
      add(a, "funk", { ref: "aktive", dir: "right" });
      breite(a, "einsatzliste", 0.27);
      breite(a, "kt", 0.33);
      hoehe(a, "telefon", 0.18);
      hoehe(a, "aktive", 0.32);
      a.getPanel("kt")?.api.setActive();
    },
  },
  {
    id: "funk",
    name: "Funk",
    info: "Funk groß, aktive Fahrzeuge und Karte",
    bauen(a) {
      add(a, "funk");
      add(a, "aktive", { ref: "funk", dir: "left" });
      add(a, "karte", { ref: "funk", dir: "right" });
      add(a, "einsatz", { ref: "funk", dir: "below" });
      add(a, "kt", { ref: "einsatz", dir: "within" });
      add(a, "einsatzliste", { ref: "aktive", dir: "below" });
      breite(a, "aktive", 0.26);
      breite(a, "karte", 0.38);
      hoehe(a, "einsatz", 0.45);
      a.getPanel("einsatz")?.api.setActive();
    },
  },
  {
    id: "zwei",
    name: "Zwei Monitore",
    info: "Hier Listen, Telefon und Masken – die Karte geht in ein eigenes Fenster",
    bauen(a) {
      add(a, "einsatzliste");
      add(a, "telefon", { ref: "einsatzliste", dir: "above" });
      add(a, "einsatz", { ref: "einsatzliste", dir: "right" });
      add(a, "abfrage", { ref: "einsatz", dir: "within" });
      add(a, "kt", { ref: "einsatz", dir: "within" });
      add(a, "funk", { ref: "einsatz", dir: "right" });
      add(a, "chat", { ref: "funk", dir: "within" });
      add(a, "aktive", { ref: "funk", dir: "below" });
      breite(a, "einsatzliste", 0.3);
      breite(a, "funk", 0.28);
      hoehe(a, "telefon", 0.22);
      a.getPanel("einsatz")?.api.setActive();
      a.getPanel("funk")?.api.setActive();
      return [["karte", "fahrzeuge"]];
    },
  },
];

/** Vorlage anwenden (nur im Hauptfenster; schließt weitere Programmfenster) */
export async function vorlageAnwenden(v: Vorlage): Promise<void> {
  if (!api) return;
  laedt = true;
  try {
    api.clear();
    groessen = [];
    const weitere = v.bauen(api);
    const liste = groessen;
    groessen = null;
    // warten, bis dockview die Fläche kennt
    for (let i = 0; i < 60 && !(api.width > 0); i++) await naechstesBild();
    await naechstesBild();
    await naechstesBild();
    for (const fn of liste) fn();
    // gleich nach dem Start legt dockview die Fläche evtl. noch einmal aus: Größen danach nochmals setzen
    setTimeout(() => {
      for (const fn of liste) fn();
    }, 300);
    bus.senden({ t: "fensterSchliessen" });
    offenIn.clear();
    for (const ids of weitere ?? []) await oeffner?.(ids);
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
