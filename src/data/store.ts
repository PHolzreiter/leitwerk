/**
 * Datenhaltung der Leitstelle.
 *
 * Gespeichert werden nur die eigenen Daten (Import oder manuell angelegt).
 * Die Standarddaten kommen mit dem Programm und können abgeschaltet werden.
 * Ein eigener Datensatz mit derselben ID wie ein Standard-Datensatz ersetzt diesen
 * (so werden bearbeitete Standarddaten gespeichert).
 */
import { partnerArtVonTyp } from "../sim/partner";
import { einrichtungenAusAlt } from "./klinik";
import { categoryFromType, streuung } from "./schema";
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
import { standardCodesystem, standardRecords } from "./standard";
import { mergeSettings, type Settings } from "../sim/settings";
import { ergaenzeSchema, istSchema, type Schema } from "../abfrage/schema";
import { uebersetzeSchema, type Uebersetzung } from "../abfrage/normalisieren";
import { themenSchema } from "../abfrage/themen";

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
          codesAufgeraeumt: parsed.codesAufgeraeumt,
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
        if (this.data.version < 4) {
          // ab v0.24: importierte KTW zu 30 % KTW, 70 % KTW-B (fest je Funkrufname)
          for (const v of this.data.eigene.vehicles) {
            if (v.herkunft === "import" && v.kategorie === "KTW" && (v.typ === "KTW" || v.typ === "KTW-B")) v.typ = streuung(v.funkrufname) < 0.3 ? "KTW" : "KTW-B";
          }
          this.data.version = 4;
        }
        if (this.data.version < 5) {
          // ab v0.26: Krankenhäuser mit Einrichtungen statt Abteilungs-Häkchen
          const std = new Map(standardRecords().hospitals.map((h) => [h.id, h]));
          for (const h of this.data.eigene.hospitals) {
            if (h.einrichtungen?.length) continue;
            const s = std.get(h.id);
            h.einrichtungen = s?.einrichtungen?.length ? [...s.einrichtungen] : einrichtungenAusAlt(h.abteilungen, h.bereiche);
            delete h.abteilungen;
            delete h.bereiche;
          }
          this.data.version = 5;
        }
        if (this.data.version < 6) {
          // ab v0.53: ACN (Acute Community Nurse) fährt mit
          for (const v of this.data.eigene.vehicles) {
            if (v.kategorie === "Sonstige" && /ACN/i.test(v.funkrufname)) {
              v.kategorie = "ACN";
              v.typ = "ACN";
              v.aktiv = true;
            }
          }
          this.data.version = 6;
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
    void this.schema; // Themen-Zuordnung des Codesystems aktualisieren
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

  /** Ist das mitgelieferte LeitWerk-Codesystem aktiv (kein eigenes geladen)? */
  get schemaIstStandard(): boolean {
    return !istSchema(this.data.abfrageschema);
  }

  get schema(): Schema | null {
    const s = ergaenzeSchema(this.uebersetzung.schema);
    themenSchema(s);
    return s;
  }

  /** Übersetzung des geladenen Codesystems auf die neutralen Merkmale (Zuordnung Frage → Merkmal) */
  get uebersetzung(): Uebersetzung {
    const roh = istSchema(this.data.abfrageschema) ? this.data.abfrageschema : standardCodesystem();
    const std = standardCodesystem();
    return uebersetzeSchema(roh, roh === std ? null : std);
  }

  /** Wurden alte importierte Codes/Schemas (v0.73) schon einmalig entfernt? */
  get codesAufgeraeumt(): boolean {
    return !!this.data.codesAufgeraeumt;
  }

  /** Einmalig: importiertes Abfrageschema und importierte Codes entfernen (eingebautes Codesystem gilt) */
  codesAufraeumen(): void {
    if (this.remote || this.eigeneSicherung) return;
    this.data.abfrageschema = undefined;
    this.data.eigene.codes = this.data.eigene.codes.filter((c) => c.herkunft === "standard");
    this.data.codesAufgeraeumt = true;
    this.changed();
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
      const base =
        kind === "codes"
          ? istSchema(this.data.abfrageschema)
            ? []
            : std.codes.filter((r) => !hidden.has(r.id) && !ownIds.has(r.id))
          : this.data.standardAktiv
            ? (std[kind] as KindMap[Kind][]).filter((r) => !hidden.has(r.id) && !ownIds.has(r.id))
            : kind === "stations"
              ? // Feuerwehr, Polizei, Berg- und Wasserrettung gibt es auch mit eigenen Rettungsdienst-Daten
                (std.stations as KindMap[Kind][]).filter((r) => partnerArtVonTyp((r as Station).typ) && !hidden.has(r.id) && !ownIds.has(r.id))
              : kind === "pois" && !own.length
                ? // Orte (Pflegeheime, Schulen …) gelten auch mit eigenen Rettungsdienst-Daten, solange keine eigenen Orte da sind
                  (std.pois as KindMap[Kind][]).filter((r) => !hidden.has(r.id))
                : [];
      (out as Record<Kind, KindMap[Kind][]>)[kind] = [...base, ...own];
    }
    // Ausweich-NEF: eigene Fahrzeuge ohne Angabe (z. B. älterer Import) übernehmen die Zuordnung der Standarddaten
    const stdErsatz = new Map(std.vehicles.filter((v) => v.ersatzFuer).map((v) => [v.funkrufname, v.ersatzFuer!]));
    if (stdErsatz.size) out.vehicles = out.vehicles.map((v) => (v.ersatzFuer === undefined && v.kategorie === "NEF" && stdErsatz.has(v.funkrufname) ? { ...v, ersatzFuer: stdErsatz.get(v.funkrufname) } : v));
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
