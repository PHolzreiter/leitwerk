/**
 * Spiegel des Simulationszustands: Änderungen („Delta“) bauen und anwenden.
 * Genutzt vom Multiplayer (Host → Mitspieler) und von weiteren Programmfenstern (Hauptfenster → Nebenfenster).
 */
import { sim, type Einsatz, type SimFahrzeug, type SimState } from "../sim/engine";

export type Nachricht = { t: string; [k: string]: unknown };

function fzSchluessel(fz: SimFahrzeug): string {
  const { lat: _a, lon: _b, fahrt: _c, ...rest } = fz;
  return JSON.stringify(rest);
}

function leer() {
  return {
    fz: new Map<string, string>(),
    fahrt: new Map<string, unknown>(),
    pos: new Map<string, string>(),
    ein: new Map<string, string>(),
    einFp: new Map<string, string>(),
    ktFp: new Map<string, string>(),
    einIds: "",
    fzIds: "",
    funk: "",
    chat: 0,
    funkG: "",
    kt: new Map<string, string>(),
    ktIds: "",
  };
}

/** Merkt sich, was schon geschickt wurde, und baut daraus die nächste Änderung */
export class DeltaBauer {
  private c = leer();

  leeren(): void {
    this.c = leer();
  }

  /** Stand merken, ohne etwas zu schicken (nach einem vollständigen Abgleich) */
  merken(): void {
    this.leeren();
    this.bauen();
  }

  bauen(): Nachricht {
    const st = sim.state;
    const c = this.c;
    const fz: SimFahrzeug[] = [];
    const pos: [string, number, number][] = [];
    for (const f of Object.values(st.fahrzeuge)) {
      const k = fzSchluessel(f);
      if (c.fz.get(f.id) !== k || c.fahrt.get(f.id) !== f.fahrt) {
        fz.push(f);
        c.fz.set(f.id, k);
        c.fahrt.set(f.id, f.fahrt);
        c.pos.set(f.id, `${f.lat},${f.lon}`);
        continue;
      }
      const p = `${f.lat},${f.lon}`;
      if (c.pos.get(f.id) !== p) {
        pos.push([f.id, f.lat, f.lon]);
        c.pos.set(f.id, p);
      }
    }
    const fzIds = Object.keys(st.fahrzeuge).join(",");
    const ein: Einsatz[] = [];
    for (const e of st.einsaetze) {
      // abgeschlossene Einsätze ändern sich kaum: erst einen billigen Fingerabdruck prüfen
      if (e.zustand === "abgeschlossen") {
        const fp = `${e.protokoll.length}|${e.anruf?.gespraech.length}|${e.anruf?.status}|${e.code}|${e.infoRtw}|${e.infoIntern}|${e.adresse?.label}|${e.telefon}|${JSON.stringify(e.partner ?? null)}`;
        if (c.einFp.get(e.id) === fp && c.ein.has(e.id)) continue;
        c.einFp.set(e.id, fp);
      }
      const k = JSON.stringify(e);
      if (c.ein.get(e.id) !== k) {
        ein.push(e);
        c.ein.set(e.id, k);
      }
    }
    const einIds = st.einsaetze.map((e) => e.id).join(",");
    const funkTop = st.funk.slice(0, 60);
    const funkKey = JSON.stringify(funkTop);
    const d: Nachricht = {
      t: "delta",
      zeit: st.zeit,
      tempo: st.tempo,
      laeuft: st.laeuft,
      wetter: st.wetter,
      naechster: st.naechster,
      zaehler: st.zaehler,
      funkZaehler: st.funkZaehler,
    };
    if (fz.length) d.fz = fz;
    if (pos.length) d.pos = pos;
    if (fzIds !== c.fzIds) {
      d.fzIds = Object.keys(st.fahrzeuge);
      c.fzIds = fzIds;
    }
    if (ein.length) d.ein = ein;
    if (einIds !== c.einIds) {
      d.einIds = st.einsaetze.map((e) => e.id);
      c.einIds = einIds;
    }
    if (funkKey !== c.funk) {
      d.funk = funkTop;
      c.funk = funkKey;
    }
    const gTop = (st.funkGespraeche ?? []).slice(0, 40);
    const gKey = JSON.stringify(gTop);
    if (gKey !== c.funkG) {
      d.funkG = gTop;
      d.funkGZaehler = st.funkGZaehler;
      c.funkG = gKey;
    }
    // Krankentransporte: geänderte Aufträge und die Reihenfolge
    const kt: unknown[] = [];
    for (const k of st.kt ?? []) {
      if (k.status === "erledigt" || k.status === "storniert") {
        const fp = `${k.status}|${k.protokoll.length}|${k.anruf?.gespraech.length}|${k.anruf?.status}`;
        if (c.ktFp.get(k.id) === fp && c.kt.has(k.id)) continue;
        c.ktFp.set(k.id, fp);
      }
      const key = JSON.stringify(k);
      if (c.kt.get(k.id) !== key) {
        kt.push(k);
        c.kt.set(k.id, key);
      }
    }
    if (kt.length) d.kt = kt;
    const ktIds = (st.kt ?? []).map((k) => k.id).join(",");
    if (ktIds !== c.ktIds) {
      d.ktIds = (st.kt ?? []).map((k) => k.id);
      c.ktIds = ktIds;
    }
    d.ktZaehler = st.ktZaehler;
    const chatN = st.chat?.length ?? 0;
    if (chatN !== c.chat) {
      d.chat = st.chat;
      c.chat = chatN;
    }
    return d;
  }
}

/** Änderung auf den eigenen (gespiegelten) Zustand anwenden */
export function deltaAnwenden(d: Nachricht): void {
  const st = sim.state;
  Object.assign(st, {
    zeit: d.zeit,
    tempo: d.tempo,
    laeuft: d.laeuft,
    wetter: d.wetter,
    naechster: d.naechster,
    zaehler: d.zaehler,
    funkZaehler: d.funkZaehler,
  });
  for (const f of (d.fz as SimFahrzeug[] | undefined) ?? []) {
    // Objekte behalten (die Oberfläche hält Verweise darauf), nur Inhalt ersetzen
    if (st.fahrzeuge[f.id]) Object.assign(st.fahrzeuge[f.id], f);
    else st.fahrzeuge[f.id] = f;
  }
  for (const [id, lat, lon] of (d.pos as [string, number, number][] | undefined) ?? []) {
    const f = st.fahrzeuge[id];
    if (f) {
      f.lat = lat;
      f.lon = lon;
    }
  }
  if (d.fzIds) {
    const ids = new Set(d.fzIds as string[]);
    for (const id of Object.keys(st.fahrzeuge)) if (!ids.has(id)) delete st.fahrzeuge[id];
  }
  if (d.ein || d.einIds) {
    const map = new Map(st.einsaetze.map((e) => [e.id, e]));
    for (const e of (d.ein as Einsatz[] | undefined) ?? []) {
      const alt = map.get(e.id);
      if (alt) Object.assign(alt, e);
      else map.set(e.id, e);
    }
    const order = (d.einIds as string[] | undefined) ?? st.einsaetze.map((e) => e.id).concat(((d.ein as Einsatz[]) ?? []).map((e) => e.id).filter((id) => !st.einsaetze.some((x) => x.id === id)));
    st.einsaetze = order.map((id) => map.get(id)).filter((e): e is Einsatz => !!e);
  }
  if (d.funk) {
    // Funk: die neuesten Meldungen kommen vom Host, ältere bleiben erhalten
    const neu = d.funk as SimState["funk"];
    const ids = new Set(neu.map((f) => f.id));
    st.funk = [...neu, ...st.funk.filter((f) => !ids.has(f.id) && f.id < (neu[neu.length - 1]?.id ?? 0))].slice(0, 300);
  }
  if (d.funkG) {
    // Funkgespräche: die neuesten kommen vom Host (Objekte behalten), ältere bleiben erhalten
    const neu = d.funkG as NonNullable<SimState["funkGespraeche"]>;
    const alt = new Map((st.funkGespraeche ?? []).map((g) => [g.id, g]));
    const min = neu[neu.length - 1]?.id ?? 0;
    st.funkGespraeche = [
      ...neu.map((g) => (alt.has(g.id) ? Object.assign(alt.get(g.id)!, g) : g)),
      ...(st.funkGespraeche ?? []).filter((g) => g.id < min),
    ].slice(0, 150);
    st.funkGZaehler = d.funkGZaehler as number;
  }
  if (d.kt || d.ktIds) {
    const liste = st.kt ?? [];
    const nachId = new Map(liste.map((k) => [k.id, k]));
    for (const k of (d.kt as NonNullable<SimState["kt"]> | undefined) ?? []) {
      const alt = nachId.get(k.id);
      if (alt) Object.assign(alt, k);
      else nachId.set(k.id, k);
    }
    const ids = (d.ktIds as string[] | undefined) ?? liste.map((k) => k.id);
    st.kt = ids.map((id) => nachId.get(id)).filter((k): k is NonNullable<typeof k> => !!k);
  }
  if (typeof d.ktZaehler === "number") st.ktZaehler = d.ktZaehler;
  if (d.chat) st.chat = d.chat as SimState["chat"];
  sim.notify();
}

/** Vollständigen Stand übernehmen, vorhandene Objekte dabei weiterverwenden */
export function zustandUebernehmen(neu: SimState): void {
  const alt = sim.state;
  const fz: SimState["fahrzeuge"] = {};
  for (const [id, f] of Object.entries(neu.fahrzeuge)) fz[id] = alt.fahrzeuge[id] ? Object.assign(alt.fahrzeuge[id], f) : f;
  const altEin = new Map(alt.einsaetze.map((e) => [e.id, e]));
  const ein = neu.einsaetze.map((e) => (altEin.has(e.id) ? Object.assign(altEin.get(e.id)!, e) : e));
  sim.state = { ...neu, fahrzeuge: fz, einsaetze: ein, chat: neu.chat ?? [] };
}
