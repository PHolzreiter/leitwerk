/**
 * Datenhaltung der Leitstelle.
 *
 * Gespeichert werden nur die eigenen Daten (Import oder manuell angelegt).
 * Die Standarddaten kommen mit dem Programm und können abgeschaltet werden.
 * Ein eigener Datensatz mit derselben ID wie ein Standard-Datensatz ersetzt diesen
 * (so werden bearbeitete Standarddaten gespeichert).
 */
import { categoryFromType } from "./schema";
import { loadStore, saveStore } from "../platform";
import {
  emptyPersisted,
  KINDS,
  type Kind,
  type KindMap,
  type Persisted,
  type Records,
  type Station,
} from "./model";
import { standardRecords } from "./standard";
import { mergeSettings, type Settings } from "../sim/settings";
import { ergaenzeSchema, istSchema, type Schema } from "../abfrage/schema";

type Listener = () => void;

/** Änderungen an den Daten, die im Multiplayer beim Host ausgeführt werden. */
export type StoreBefehl =
  | "setSettings"
  | "resetSettings"
  | "setStandardAktiv"
  | "upsert"
  | "remove"
  | "removeMany"
  | "clearOwn"
  | "restoreHidden"
  | "setSchema";

export class Store {
  private data: Persisted = emptyPersisted();
  private listeners = new Set<Listener>();
  private saveTimer: number | undefined;
  private effectiveCache: Records | null = null;
  lastError: string | null = null;
  /** Im Multiplayer als Mitspieler: Änderungen gehen an den Host */
  remote: ((name: StoreBefehl, args: unknown[]) => void) | null = null;
  /** Eigene Daten, solange Daten einer Sitzung (Host/Spielstand) verwendet werden */
  private eigeneSicherung: Persisted | null = null;

  /** Daten, wie sie gespeichert bzw. an Mitspieler geschickt werden. */
  snapshot(): Persisted {
    return structuredClone(this.data);
  }

  /** Verwendet Daten einer Sitzung (vom Host oder aus einem Spielstand) – ohne die eigenen zu überschreiben. */
  enterSession(data: Persisted): void {
    if (!this.eigeneSicherung) this.eigeneSicherung = this.data;
    this.data = structuredClone(data);
    this.settingsCache = null;
    this.changed(false);
  }

  get inSession(): boolean {
    return this.eigeneSicherung !== null;
  }

  /** Zurück zu den eigenen Daten. */
  leaveSession(): void {
    if (!this.eigeneSicherung) return;
    this.data = this.eigeneSicherung;
    this.eigeneSicherung = null;
    this.remote = null;
    this.settingsCache = null;
    this.changed(false);
  }

  async load(): Promise<void> {
    try {
      const json = await loadStore();
      if (json) {
        const parsed = JSON.parse(json) as Partial<Persisted>;
        const base = emptyPersisted();
        this.data = {
          version: parsed.version ?? 1,
          standardAktiv: parsed.standardAktiv ?? base.standardAktiv,
          ausgeblendet: parsed.ausgeblendet ?? [],
          eigene: { ...base.eigene, ...(parsed.eigene ?? {}) },
          einstellungen: parsed.einstellungen,
          abfrageschema: parsed.abfrageschema,
        };
        // ältere Speicherstände: neue Felder ergänzen
        for (const v of this.data.eigene.vehicles) v.nachtflug ??= false;
        if (this.data.version < 2) {
          // ab v0.3.1: KTW fahren Einsätze, AMB Type I/II und Sekundärfahrzeuge (SKTW, SRTW, SNAW) nicht
          for (const v of this.data.eigene.vehicles) {
            const t = v.typ.trim().toUpperCase();
            if (t.startsWith("AMB TYPE") || ["SKTW", "SRTW", "SNAW"].includes(t)) {
              v.kategorie = "Sonstige";
              v.aktiv = false;
            } else if (t.startsWith("KTW") && v.kategorie === "KTW") {
              v.aktiv = true;
            }
          }
          this.data.version = 2;
        }
        if (this.data.version < 3) {
          // ab v0.9: Sekundärfahrzeuge (SKTW, SRTW, SNAW, BIT, ITH), BEL und EL ÖBB fahren mit
          for (const v of this.data.eigene.vehicles) {
            const neu = categoryFromType(v.typ, v.funkrufname);
            if (v.kategorie === "Sonstige" && ["SKTW", "SRTW", "SNAW", "BIT", "ITH", "BEL", "EL ÖBB"].includes(neu)) {
              v.kategorie = neu;
              v.aktiv = true;
            }
          }
          this.data.version = 3;
        }
      }
    } catch (e) {
      this.lastError = `Gespeicherte Leitstelle konnte nicht gelesen werden: ${String(e)}`;
      console.error(e);
    }
    this.changed(false);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(persist = true): void {
    this.effectiveCache = null;
    if (persist && !this.eigeneSicherung) this.scheduleSave();
    for (const fn of this.listeners) fn();
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      saveStore(JSON.stringify(this.data)).catch((e) => {
        this.lastError = `Speichern fehlgeschlagen: ${String(e)}`;
        console.error(e);
      });
    }, 300);
  }

  private settingsCache: Settings | null = null;

  /** Simulations-Einstellungen (mit Standardwerten ergänzt). */
  get settings(): Settings {
    if (!this.settingsCache) this.settingsCache = mergeSettings(this.data.einstellungen as Partial<Settings> | undefined);
    return this.settingsCache;
  }

  setSettings(s: Settings): void {
    if (this.remote) return this.remote("setSettings", [s]);
    this.data.einstellungen = s;
    this.settingsCache = null;
    this.changed();
  }

  resetSettings(): void {
    if (this.remote) return this.remote("resetSettings", []);
    this.data.einstellungen = undefined;
    this.settingsCache = null;
    this.changed();
  }

  /** Importiertes Abfrageschema (oder null) */
  /** Codesystem so, wie es geladen wurde (ohne Ergänzungen des Spiels) */
  get schemaRoh(): Schema | null {
    return istSchema(this.data.abfrageschema) ? this.data.abfrageschema : null;
  }

  get schema(): Schema | null {
    return istSchema(this.data.abfrageschema) ? ergaenzeSchema(this.data.abfrageschema) : null;
  }

  setSchema(s: Schema | null): void {
    if (this.remote) return this.remote("setSchema", [s]);
    this.data.abfrageschema = s ?? undefined;
    this.changed();
  }

  get standardAktiv(): boolean {
    return this.data.standardAktiv;
  }

  setStandardAktiv(on: boolean): void {
    if (this.remote) return this.remote("setStandardAktiv", [on]);
    this.data.standardAktiv = on;
    this.changed();
  }

  /** Alle gültigen Datensätze: Standard (falls aktiv, ohne ausgeblendete) + eigene. */
  effective(): Records {
    if (this.effectiveCache) return this.effectiveCache;
    const std = standardRecords();
    const hidden = new Set(this.data.ausgeblendet);
    const out = {} as Records;
    for (const kind of KINDS) {
      const own = this.data.eigene[kind] as KindMap[Kind][];
      const ownIds = new Set(own.map((r) => r.id));
      const base = this.data.standardAktiv
        ? (std[kind] as KindMap[Kind][]).filter((r) => !hidden.has(r.id) && !ownIds.has(r.id))
        : [];
      (out as Record<Kind, KindMap[Kind][]>)[kind] = [...base, ...own];
    }
    this.effectiveCache = out;
    return out;
  }

  list<K extends Kind>(kind: K): KindMap[K][] {
    return this.effective()[kind];
  }

  get<K extends Kind>(kind: K, id: string): KindMap[K] | undefined {
    return this.list(kind).find((r) => r.id === id);
  }

  stationsById(): Map<string, Station> {
    return new Map(this.list("stations").map((s) => [s.id, s]));
  }

  counts(kind: Kind): { gesamt: number; standard: number; eigene: number } {
    const all = this.list(kind);
    const standard = all.filter((r) => r.herkunft === "standard").length;
    return { gesamt: all.length, standard, eigene: all.length - standard };
  }

  standardCount(kind: Kind): number {
    return standardRecords()[kind].length;
  }

  /** Fügt Datensätze hinzu oder ersetzt solche mit gleicher ID. */
  upsert<K extends Kind>(kind: K, records: KindMap[K][], replaceOwn = false): void {
    if (this.remote) return this.remote("upsert", [kind, records, replaceOwn]);
    const own = this.data.eigene[kind] as KindMap[K][];
    const next = replaceOwn ? [] : own.slice();
    const index = new Map(next.map((r, i) => [r.id, i]));
    for (const r of records) {
      const i = index.get(r.id);
      if (i === undefined) {
        index.set(r.id, next.length);
        next.push(r);
      } else {
        next[i] = r;
      }
      // Wieder einblenden, falls zuvor gelöscht
      this.data.ausgeblendet = this.data.ausgeblendet.filter((h) => h !== r.id);
    }
    (this.data.eigene as Record<Kind, KindMap[Kind][]>)[kind] = next;
    this.changed();
  }

  /** Löscht einen Datensatz. Standard-Datensätze werden ausgeblendet. */
  remove(kind: Kind, id: string): void {
    if (this.remote) return this.remote("remove", [kind, id]);
    const own = this.data.eigene[kind] as KindMap[Kind][];
    (this.data.eigene as Record<Kind, KindMap[Kind][]>)[kind] = own.filter((r) => r.id !== id);
    if (standardRecords()[kind].some((r) => r.id === id) && !this.data.ausgeblendet.includes(id)) {
      this.data.ausgeblendet.push(id);
    }
    // Fahrzeuge einer gelöschten Dienststelle mitlöschen
    if (kind === "stations") {
      for (const v of this.list("vehicles").filter((v) => v.dienststelleId === id)) {
        this.remove("vehicles", v.id);
      }
    }
    this.changed();
  }

  /** Löscht mehrere eigene Datensätze auf einmal (Standard-Datensätze werden ausgeblendet). */
  removeMany(kind: Kind, ids: string[]): void {
    if (this.remote) return this.remote("removeMany", [kind, ids]);
    const weg = new Set(ids);
    (this.data.eigene as Record<Kind, KindMap[Kind][]>)[kind] = (this.data.eigene[kind] as KindMap[Kind][]).filter((r) => !weg.has(r.id));
    for (const r of standardRecords()[kind]) if (weg.has(r.id) && !this.data.ausgeblendet.includes(r.id)) this.data.ausgeblendet.push(r.id);
    this.changed();
  }

  /** Entfernt alle eigenen Daten einer Art. */
  clearOwn(kind: Kind): void {
    if (this.remote) return this.remote("clearOwn", [kind]);
    (this.data.eigene as Record<Kind, KindMap[Kind][]>)[kind] = [];
    this.changed();
  }

  /** Blendet gelöschte Standard-Datensätze wieder ein. */
  restoreHidden(): void {
    if (this.remote) return this.remote("restoreHidden", []);
    this.data.ausgeblendet = [];
    this.changed();
  }

  get hiddenCount(): number {
    return this.data.ausgeblendet.length;
  }

  /** Erzeugt eine neue, noch unbenutzte ID. */
  newId(prefix: string): string {
    const used = new Set(KINDS.flatMap((k) => this.list(k).map((r) => r.id)));
    let n = 1;
    while (used.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
}

export const store = new Store();
