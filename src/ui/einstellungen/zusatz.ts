/**
 * Echte Daten und Aktionen für die eigenen Bausteine der Einstellungsseiten (bausteine.js):
 * Dienstplan, Einrichtungen, Kartenausschnitt (Lage), KH-Aufnahme, CSV-Import, Zuordnung zu den Merkmalen, Neuer Fall.
 * Gilt im Hauptmenü und im Spielmenü gleich (dieselben Seiten).
 */
import maplibregl from "maplibre-gl";
import type { Hospital, Kind, KindMap } from "../../data/model";
import { KIND_LABEL } from "../../data/model";
import { store } from "../../data/store";
import { detectKind, importCsv } from "../../data/schema";
import { akutJetzt, buchung, EINRICHTUNGEN, EINRICHTUNG_TYP_LABEL, eignungJetzt, type EinrichtungTyp } from "../../data/klinik";
import { SYMPTOME, zuweisungId, type Altersgruppe, type Dringlichkeit } from "../../data/zuweisung";
import { MIT_ZEITEN } from "../../sim/khStatus";
import { planLesen as dienstLesen, planText as dienstText, type Schicht } from "../../sim/dienst";
import { sim } from "../../sim/engine";
import { distanceM } from "../../sim/geo";
import { pickTextFile } from "../../platform";
import { ablageName, ablageSichern } from "../../net/ablage";
import { ANNAHME, luecken, nachAbteilungen, quelleVorgabe, schalter, vorgabe } from "../khAufnahme";
import { KEIN_MERKMAL, KERN_MERKMALE, merkmalListe } from "../../abfrage/normalisieren";
import type { Frage, Schema } from "../../abfrage/schema";
import { standardCodesystem } from "../../data/standard";
import { kiBereit, kiStatus } from "../../abfrage/ki";
import { kiVorschlag, vorschlagEintragen } from "../../abfrage/zuordnungKi";
import { stufeRaten } from "../../sim/settings";
import { inTauri } from "../../platform";
import { availableMaps, createMap, type MapHandle } from "../../map";
import { alarmtonHinzufuegen } from "../pilot/alarmToene";
import { ablageZeigen } from "../../net/ablage";
import { alarmToeneNeu } from "../hauptmenue/bindung";
import { fallNeuOeffnen } from "../fallEditor";

const fehlerText = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error:\s*/, "");
const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const WTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const p2 = (n: number) => String(n).padStart(2, "0");

/** Schicht im Editor: Tage 0 = Montag … 6 = Sonntag, Zeiten „HH:MM“, „auf“ / „unter“ (Sonne) */
interface EdSchicht {
  t: number[];
  von: string;
  bis: string;
  kw?: Schicht["kw"];
  monate?: number[];
}

export interface ZusatzRahmen {
  /** Ort auf der Karte im Kartenfenster wählen (nur im Spiel) */
  karteWaehlen?: (hinweis: string) => Promise<{ lat: number; lon: number } | null>;
  neuZeichnen(): void;
}

export function zusatzBauen(r: ZusatzRahmen) {
  // ---------------------------------------------------------------- Karten (Lage)
  const karten = new WeakMap<HTMLElement, { h: MapHandle; m: maplibregl.Marker; koord: string; setzen: (lat: number, lon: number) => void }>();
  const koordLesen = (t: string): { lat: number; lon: number } | null => {
    const m = t.match(/(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)/);
    if (!m) return null;
    const lat = Number(m[1].replace(",", "."));
    const lon = Number(m[2].replace(",", "."));
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  };
  let kartenListe: string[] | null = null;

  // ---------------------------------------------------------------- KH-Aufnahme
  const haus = (id: string) => store.get("hospitals", id);
  const speichern = (h: Hospital) => {
    if (!h.zuweisungAn?.length) delete h.zuweisungAn;
    if (!h.zuweisungAus?.length) delete h.zuweisungAus;
    if (h.zeiten && !Object.keys(h.zeiten).length) delete h.zeiten;
    store.upsert("hospitals", [h]);
  };
  const zeitTexte = (t: number) => {
    const d = new Date(t);
    return {
      kurz: `${WTAG[d.getDay()]} ${p2(d.getDate())}.${p2(d.getMonth() + 1)}. ${p2(d.getHours())}:${p2(d.getMinutes())}`,
      lang: `${["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][d.getDay()]} ${p2(d.getHours())}:${p2(d.getMinutes())}`,
      wert: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`,
    };
  };

  // ---------------------------------------------------------------- CSV-Import
  const SEITE_KIND: Record<string, Kind> = { fahrzeuge: "vehicles", dienststellen: "stations", krankenhaeuser: "hospitals", pois: "pois", vorlagen: "templates", codes: "codes" };
  interface ImpInfo {
    name: string;
    text: string;
    kind: Kind;
    kindLabel: string;
    erkannt: boolean;
    zeilen: number;
    trenn: string;
    ok: number;
    records: unknown[];
    fehler: { zeile: number; meldung: string }[];
    hinweise: { zeile: number; meldung: string }[];
    spalten: string;
    ignoriert: string;
  }
  const pruefen = (name: string, text: string, kind: Kind, erkannt: boolean): ImpInfo => {
    const r = importCsv(kind, text, {
      stations: store.list("stations"),
      existing: store.list(kind) as { id: string; name?: string; funkrufname?: string; kurzname?: string; code?: string }[],
      herkunft: "import",
      herkunftDetail: name,
    });
    const erste = text.split(/\r?\n/, 1)[0] ?? "";
    const trenn = erste.includes(";") ? "Trennzeichen ;" : erste.includes("\t") ? "Trennzeichen Tab" : "Trennzeichen ,";
    return {
      name,
      text,
      kind,
      kindLabel: KIND_LABEL[kind],
      erkannt,
      zeilen: r.zeilen,
      trenn,
      ok: r.records.length,
      records: r.records,
      fehler: r.fehler,
      hinweise: r.warnungen,
      spalten: r.spaltenErkannt.join(", "),
      ignoriert: r.spaltenIgnoriert.join(", "),
    };
  };

  // ---------------------------------------------------------------- Zuordnung
  const fragenMitId = (s: Schema, id: string): Frage[] =>
    [...Object.values(s.globale_fragen ?? {}).flat(), ...Object.values(s.kapitel ?? {}).flatMap((k) => k.fragen ?? [])].filter((f) => f.id === id);
  let merkmaleCache: ReturnType<typeof merkmalListe> | null = null;
  const merkmale = () => (merkmaleCache ??= merkmalListe(standardCodesystem()));

  return {
    // ---------------------------------------------------------------- Dienstplan
    planLesen(text: string): { schichten: EdSchicht[]; fehler?: string } {
      const t = text.trim();
      if (/^nur bei Flugverbot/i.test(t)) return { schichten: [], fehler: `„${t}“ – Ersatzfahrzeug` };
      const p = dienstLesen(t);
      return {
        schichten: p.plan.map((s) => ({ ...s, t: s.tage.map((d) => d - 1), von: s.von === "SA" ? "auf" : s.von, bis: s.bis === "SU" ? "unter" : s.bis })),
        fehler: p.fehler,
      };
    },
    planText(sch: EdSchicht[]): string {
      const plan: Schicht[] = sch
        .filter((s) => s.t.length)
        .map((s) => {
          const x: Schicht = { tage: [...new Set(s.t)].sort().map((d) => d + 1), von: s.von === "auf" ? "SA" : s.von, bis: s.bis === "unter" ? "SU" : s.bis };
          if (s.kw) x.kw = s.kw;
          if (s.monate) x.monate = s.monate;
          return x;
        });
      return plan.length ? dienstText(plan) : "rund um die Uhr";
    },

    // ---------------------------------------------------------------- Einrichtungen
    einrGruppen(): { t: string; e: { id: string; name: string }[] }[] {
      const ord: EinrichtungTyp[] = ["ambulanz", "funktionsbereich", "intensiv", "zentrum", "station"];
      return ord
        .map((typ) => ({ t: EINRICHTUNG_TYP_LABEL[typ], e: EINRICHTUNGEN.filter((x) => x.typ === typ).map((x) => ({ id: x.id, name: x.name })) }))
        .filter((g) => g.e.length);
    },
    einrLesen(text: string): string[] {
      const nachName = new Map(EINRICHTUNGEN.flatMap((e) => [[e.name.toLowerCase(), e.id] as [string, string], [e.id.toLowerCase(), e.id] as [string, string]]));
      return text
        .split(/\s*[;,]\s*/)
        .map((x) => nachName.get(x.trim().toLowerCase()))
        .filter((x): x is string => !!x);
    },
    einrText(ids: string[]): string {
      return EINRICHTUNGEN.filter((e) => ids.includes(e.id))
        .map((e) => e.name)
        .join(", ");
    },

    // ---------------------------------------------------------------- Kartenausschnitt
    karteDa: () => !!r.karteWaehlen,
    karteWaehlen: (hinweis: string) => (r.karteWaehlen ? r.karteWaehlen(`${hinweis} anklicken`) : Promise.resolve(null)),
    lageKarte(ref: { current: unknown }, koord: string, marke: string, setzen: (lat: number, lon: number) => void): void {
      requestAnimationFrame(() => {
        const el = ref.current as HTMLElement | null;
        if (!el || !el.isConnected) return;
        const pos = koordLesen(koord);
        const da = karten.get(el);
        if (da) {
          da.setzen = setzen;
          if (pos && koord !== da.koord) {
            da.m.setLngLat([pos.lon, pos.lat]);
            da.h.map.easeTo({ center: [pos.lon, pos.lat] });
          }
          da.koord = koord;
          return;
        }
        const start = pos ?? (() => {
          const g = sim.funkgruppe();
          return { lat: (g.bbox[1] + g.bbox[3]) / 2, lon: (g.bbox[0] + g.bbox[2]) / 2 };
        })();
        const bauen = (liste: string[]) => {
          if (!el.isConnected || karten.has(el)) return;
          const h = createMap(el, liste, { dunkel: true });
          h.map.jumpTo({ center: [start.lon, start.lat], zoom: pos ? 14 : 10 });
          const knopf = document.createElement("div");
          knopf.className = "ei-marke";
          knopf.innerHTML = `<i></i><span></span>`;
          knopf.querySelector("span")!.textContent = marke;
          const m = new maplibregl.Marker({ element: knopf, anchor: "left", offset: [-7, 0] }).setLngLat([start.lon, start.lat]).addTo(h.map);
          const eintrag = { h, m, koord, setzen };
          karten.set(el, eintrag);
          h.map.on("click", (e) => {
            m.setLngLat(e.lngLat);
            eintrag.setzen(e.lngLat.lat, e.lngLat.lng);
          });
        };
        if (kartenListe) bauen(kartenListe);
        else
          void availableMaps()
            .catch(() => [] as string[])
            .then((l) => {
              kartenListe = l;
              bauen(l);
            });
      });
    },

    // ---------------------------------------------------------------- KH-Aufnahme
    kh: {
      haeuser(): { id: string; name: string; kurz: string }[] {
        const g = sim.funkgruppe();
        const mitte = { lat: (g.bbox[1] + g.bbox[3]) / 2, lon: (g.bbox[0] + g.bbox[2]) / 2 };
        return store
          .list("hospitals")
          .filter((h) => (h.einrichtungen ?? []).some((x) => ["amb_notaufnahme", "amb_unfall", "fb_schockraum", "amb_kindernotaufnahme", "amb_pvz"].includes(x)))
          .map((h) => ({ h, km: distanceM(mitte, h) / 1000 }))
          .sort((a, b) => a.km - b.km)
          .map(({ h, km }) => ({ id: h.id, kurz: h.kurzname || h.name, name: `${h.kurzname || h.name} · ${Math.round(km)} km` }));
      },
      daten(id: string, alter: Altersgruppe, zeitText: string | null, filter: string) {
        const h = haus(id)!;
        const v = vorgabe(h.id);
        const t0 = zeitText ? new Date(zeitText).getTime() : NaN;
        const t = Number.isFinite(t0) ? t0 : sim.state.zeit || Date.now();
        const z = zeitTexte(t);
        const einr = new Set(h.einrichtungen ?? []);
        const jetzt = akutJetzt(h, t);
        const bereiche = MIT_ZEITEN.filter((x) => einr.has(x)).map((eid) => {
          const plan = h.zeiten?.[eid];
          const geaendert = !!v && !gleich(plan ?? [], v.zeiten?.[eid] ?? []);
          const q = !v ? "eigenes Haus" : geaendert ? "von dir geändert" : quelleVorgabe(h, eid);
          const rad = h.aufnahmerad?.einrichtungen[eid] !== undefined ? ` · wechselnd (${h.aufnahmerad!.gruppe})` : "";
          const offen = jetzt.has(eid) || !plan?.length;
          return {
            id: eid,
            t: EINRICHTUNGEN.find((e) => e.id === eid)?.name ?? eid,
            zeit: dienstText(plan),
            jetzt: offen ? "offen" : "zu",
            jetztCls: `ei-jz ${offen ? "auf" : "zu"}`,
            quelle: q + rad,
            qCls: `ei-q${geaendert ? " du" : q === ANNAHME ? " ann" : ""}`,
            geaendert,
          };
        });
        const ohne: Hospital = { ...h, zuweisungAn: [], zuweisungAus: [] };
        const f = filter.trim().toLowerCase();
        const kat = [...new Set(SYMPTOME.map((s) => s.kategorie))];
        const gruppen = kat
          .map((k) => ({
            t: k,
            s: SYMPTOME.filter((s) => s.kategorie === k && (!f || `${s.name} ${s.synonyme.join(" ")}`.toLowerCase().includes(f))).map((s) => ({
              id: s.id,
              t: s.name,
              syn: s.synonyme.join(", "),
              z: ([10, 20, 30] as Dringlichkeit[]).map((d) => {
                if (!s.dringlichkeiten.includes(d)) return { leer: true, d };
                const zid = zuweisungId(s.id, d, alter);
                const auto = nachAbteilungen(ohne, zid, d);
                const sw = schalter(h, s.id, d);
                const wirk = sw === "an" ? "ja" : sw === "aus" ? "nein" : auto;
                const offenJetzt = wirk === "ja" && eignungJetzt(h, buchung(zid), d === 30, jetzt, t) === "passend";
                const sym = wirk === "ja" ? (offenJetzt ? "an" : "zu") : wirk === "ausweich" ? "aus2" : "nein";
                const stufe = d === 10 ? "stabil" : d === 20 ? "dringend" : "Schock";
                const was = sym === "an" ? "nimmt auf" : sym === "zu" ? "nimmt auf, Bereich jetzt zu" : sym === "aus2" ? (alter !== "erwachsener" ? "nur Ausweich – keine Kinderabteilung" : "nur Ausweich, wenn nichts anderes geht") : "nimmt nicht auf";
                const tip = `${s.name} · ${stufe}: ${was}${sw ? ` (von dir ${sw === "an" ? "eingeschaltet" : "ausgeschaltet"}; Abteilungen: ${auto === "ja" ? "ja" : auto === "ausweich" ? "Ausweich" : "nein"})` : ""}`;
                return { leer: false, d, sym, eigen: !!sw, tip };
              }),
            })),
          }))
          .filter((g) => g.s.length);
        return { zeitKurz: z.kurz, zeitLang: z.lang, zeitWert: z.wert, zeitMs: t, bereiche, gruppen, vorgabeDa: !!v };
      },
      schalten(id: string, sid: string, d: Dringlichkeit): void {
        const h0 = haus(id);
        if (!h0) return;
        const k = `${sid}:${d}`;
        const h = structuredClone(h0);
        const jetzt = schalter(h, sid, d);
        const s = SYMPTOME.find((x) => x.id === sid)!;
        for (const feld of ["zuweisungAn", "zuweisungAus"] as const) {
          const l = h[feld] ?? [];
          if (l.includes(sid)) h[feld] = [...l.filter((x) => x !== sid), ...s.dringlichkeiten.map((x) => `${sid}:${x}`)];
        }
        h.zuweisungAn = (h.zuweisungAn ?? []).filter((x) => x !== k);
        h.zuweisungAus = (h.zuweisungAus ?? []).filter((x) => x !== k);
        // nimmt auf → nimmt nicht → wie die Abteilungen
        if (jetzt === null) h.zuweisungAn.push(k);
        else if (jetzt === "an") h.zuweisungAus.push(k);
        speichern(h);
      },
      zeitSetzen(id: string, einr: string, text: string): string | null {
        const h0 = haus(id);
        if (!h0) return null;
        const p = dienstLesen(text);
        if (p.fehler) return p.fehler;
        const h = structuredClone(h0);
        h.zeiten = { ...(h.zeiten ?? {}) };
        if (p.plan.length) h.zeiten[einr] = p.plan;
        else delete h.zeiten[einr];
        speichern(h);
        return null;
      },
      zeitVorgabe(id: string, einr: string): void {
        const h0 = haus(id);
        if (!h0) return;
        const v = vorgabe(h0.id);
        const h = structuredClone(h0);
        h.zeiten = { ...(h.zeiten ?? {}) };
        if (v?.zeiten?.[einr]) h.zeiten[einr] = structuredClone(v.zeiten[einr]);
        else delete h.zeiten[einr];
        speichern(h);
      },
      hausVorgabe(id: string): void {
        const h0 = haus(id);
        const v = h0 && vorgabe(h0.id);
        if (!h0 || !v) return;
        const h = structuredClone(h0);
        delete h.zuweisungAn;
        delete h.zuweisungAus;
        if (v.zeiten) h.zeiten = structuredClone(v.zeiten);
        else delete h.zeiten;
        speichern(h);
      },
      luecken(id: string, t: number) {
        const h = haus(id);
        return h ? luecken(h, t) : [];
      },
    },

    // ---------------------------------------------------------------- CSV-Import
    imp: {
      arten: () => (["vehicles", "stations", "hospitals", "pois", "templates", "codes"] as Kind[]).map((kind) => ({ kind, label: KIND_LABEL[kind] })),
      async waehlen(seite: string, kind0: Kind | null): Promise<ImpInfo | null> {
        const f = await pickTextFile(".csv,.txt,text/csv,text/plain");
        if (!f) return null;
        const erkannt = detectKind(f.text);
        const kind = erkannt ?? kind0 ?? SEITE_KIND[seite] ?? "vehicles";
        return pruefen(f.name, f.text, kind, !!erkannt);
      },
      neu(alt: ImpInfo, kind: Kind): ImpInfo {
        return pruefen(alt.name, alt.text, kind, detectKind(alt.text) === kind);
      },
      uebernehmen(imp: ImpInfo, ersetzen: boolean): string {
        if (!imp.ok) throw new Error("Nichts zu übernehmen");
        store.upsert(imp.kind, imp.records as KindMap[typeof imp.kind][], ersetzen);
        ablageSichern("Daten", ablageName(imp.name, "csv"), imp.text);
        return `${imp.ok.toLocaleString("de-DE")} ${imp.kindLabel} ${ersetzen ? "übernommen (eigene ersetzt)" : "übernommen"}`;
      },
    },

    // ---------------------------------------------------------------- Pilot: eigener Alarmton
    alarm: {
      async hinzu(f: File): Promise<string> {
        const d = await alarmtonHinzufuegen(f);
        await alarmToeneNeu();
        r.neuZeichnen();
        return `„${d.name}“ gespeichert (${d.sek.toFixed(1).replace(".", ",")} s) – jetzt in der Auswahl`;
      },
      async ordner(): Promise<string> {
        if (!inTauri()) return "nur im Programm";
        await ablageZeigen("Töne");
        return "Ordner geöffnet";
      },
    },

    // ---------------------------------------------------------------- Neuer Fall (Fall-Editor)
    fall: {
      neu(name: string, beschreibung: string, mitKi: boolean): string {
        fallNeuOeffnen(name, beschreibung, mitKi);
        return mitKi ? "Fall-Editor: die KI schreibt den Entwurf …" : "Fall-Editor geöffnet";
      },
    },

    // ---------------------------------------------------------------- Zuordnung
    zuord: {
      daten(nur: boolean) {
        if (store.schemaIstStandard || !store.schemaRoh) return null;
        const u = store.uebersetzung;
        const roh = store.schemaRoh;
        const kern = new Set(KERN_MERKMALE);
        const ml = merkmale();
        const liste = [...u.zuordnung].sort((a, b) => Number(kern.has(b.merkmal ?? "")) - Number(kern.has(a.merkmal ?? "")) || (a.wo === "global" ? -1 : 0) - (b.wo === "global" ? -1 : 0));
        const unsicher = (z: (typeof liste)[number]) => z.quelle === "automatisch" && z.sicherheit < 0.7;
        const offen = (z: (typeof liste)[number]) => !z.merkmal && !z.teile;
        const zeilen = liste
          .filter((z) => !nur || offen(z) || unsicher(z) || z.ki)
          .map((z) => {
            const m = ml.find((x) => x.id === z.merkmal);
            const f0 = fragenMitId(roh, z.frage)[0];
            let antw = "";
            if (z.teile) antw = `„Ja“, wenn ${z.teile.map((t) => `${t.merkmal} = ${t.ja.join("/")}`).join(" oder ")}`;
            else if (m && f0?.optionen?.length)
              antw = f0.optionen
                .map((o) => {
                  const w = z.werte[o.wert] ?? (z.quelle === "gleich" && m.werte.some((x) => x.wert === o.wert) ? o.wert : "");
                  return `${o.label} → ${m.werte.find((x) => x.wert === w)?.label ?? (w || "–")}`;
                })
                .join(" · ");
            else if (f0?.typ === "zahl") antw = "Zahl wird übernommen";
            else if (!z.merkmal) antw = "noch nicht zugeordnet";
            const quelle = z.ki ? "KI-Vorschlag" : z.quelle === "explizit" ? "von Hand" : z.quelle === "gleich" ? "gleiche ID" : z.quelle === "automatisch" ? `automatisch ${Math.round(z.sicherheit * 100)} %` : "offen";
            return {
              id: z.frage,
              frage: `${z.text}${z.wo === "global" ? "" : ` (Kap. ${z.wo})`}`,
              merkmal: z.teile ? KEIN_MERKMAL : z.merkmal ?? KEIN_MERKMAL,
              antw: antw + (z.umgekehrt ? " · umgedreht gefragt" : ""),
              quelle,
              art: offen(z) ? "rot" : unsicher(z) || z.ki ? "gelb" : "",
            };
          });
        const n = u.zuordnung.length;
        const zu = u.zuordnung.filter((z) => z.merkmal || z.teile).length;
        const nOffen = u.zuordnung.filter(offen).length;
        const nUns = u.zuordnung.filter(unsicher).length;
        // Stufen des Schemas, die es in den Einstellungen noch nicht gibt
        const bekannt = new Set(store.settings.stufen.map((x) => x.stufe));
        const fremd = [...new Set(Object.values(store.schema?.codes ?? {}).map((c) => c.kategorie).filter((k) => k && !bekannt.has(k)))];
        const stufen = fremd.length
          ? `Diese Stufen aus dem eigenen Schema gibt es in den Einstellungen noch nicht: ${fremd.join(", ")}. Eingeordnet ${fremd.every((k) => stufeRaten(k)) ? "nach dem Namen" : "nach Name bzw. Aufbau"} – einstellbar unter Spiel & Simulation › Alarmierung › Stufen-Zuordnung.`
          : "";
        return {
          stand: `${n} Fragen · ${zu} zugeordnet · ${nOffen} offen · ${nUns} unsicher`,
          merkmale: [{ v: KEIN_MERKMAL, t: "– offen –" }, ...ml.map((m) => ({ v: m.id, t: m.text.length > 34 ? `${m.text.slice(0, 33)}…` : m.text }))],
          zeilen,
          stufen,
        };
      },
      setzen(frage: string, merkmal: string): void {
        if (!store.schemaRoh) return;
        const s = structuredClone(store.schemaRoh);
        for (const f of fragenMitId(s, frage)) {
          (f as Frage & { merkmal?: string }).merkmal = merkmal;
          for (const o of f.optionen ?? []) delete (o as { merkmal_wert?: string }).merkmal_wert;
        }
        store.setSchema(s);
      },
      async ki(fortschritt: (t: string) => void): Promise<string> {
        if (!kiBereit() && inTauri()) await kiStatus().catch(() => null);
        if (!kiBereit()) throw new Error("Die KI läuft nicht (Mein Platz › Anrufe & KI)");
        const u = store.uebersetzung;
        const offen = u.zuordnung.filter((z) => (!z.merkmal && !z.teile && z.quelle !== "explizit") || (z.quelle === "automatisch" && z.sicherheit < 0.7));
        if (!offen.length) return "Keine offenen oder unsicheren Fragen";
        const s = structuredClone(store.schemaRoh!);
        let n = 0;
        let ok = 0;
        for (const z of offen) {
          fortschritt(`KI fragt … ${++n} von ${offen.length}`);
          const f = fragenMitId(s, z.frage)[0];
          if (!f) continue;
          const titel = z.wo === "global" ? "Primärabfrage" : (s.kapitel[z.wo]?.titel ?? z.wo);
          try {
            const v = await kiVorschlag(f, titel, standardCodesystem());
            if (v) {
              vorschlagEintragen(s, z.frage, v);
              ok++;
            }
          } catch (e) {
            console.warn("KI-Zuordnung", fehlerText(e));
          }
        }
        store.setSchema(s);
        r.neuZeichnen();
        return `${ok} von ${offen.length} Vorschlägen übernommen – bitte prüfen`;
      },
    },
  };
}

export type Zusatz = ReturnType<typeof zusatzBauen>;
