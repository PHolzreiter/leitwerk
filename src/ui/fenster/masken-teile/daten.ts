/**
 * Gemeinsame Daten für die Masken (RD, KT, SEK): Fahrzeugzeilen (Status, Standort, Fahrtziel, Code, Besatzung),
 * alarmierte Fahrzeuge und die freie Ortssuche (Adressen und Einrichtungen).
 */
import { sim, type SimFahrzeug } from "../../../sim/engine";
import { findCode } from "../../../sim/codes";
import { ktCode } from "../../../sim/ktCodes";
import { bereichName, EINRICHTUNG_LABEL, hhmm, type KtOrt } from "../../../sim/kt";
import { distanceM, searchAddress, type LatLon } from "../../../sim/geo";
import { bereicheVon } from "../../../data/model";
import { store } from "../../../data/store";
import { typText } from "../../panels/teile";

/** Statusziffer wie am Funkgerät („1“, „A“, „F“, „9“ …) */
export function statusNr(fz: SimFahrzeug): string {
  return sim.statusDef(fz.status)?.nummer ?? "1";
}

/** über Funk erreichbar (Frei Funk, Alarmiert über Funk): Schrift rot */
export function istFunk(fz: SimFahrzeug): boolean {
  return fz.status === "freiFunk" || fz.status === "alarmFunk";
}

/** Klassen einer Fahrzeugzeile: Statusfarbe als Zeilenhintergrund */
export function zeilenKlasse(basis: "lz" | "fz", fz: SimFahrzeug): string {
  return `${basis} s${statusNr(fz).toLowerCase()}${istFunk(fz) ? " funk" : ""}`;
}

export function crewListe(fz: SimFahrzeug): string[] {
  return fz.besetzung.map((p) => p.quali);
}

/** Ort kurz: „Hauptplatz 8, 3542 Gföhl“ → „Hauptplatz 8, Gföhl“ */
export function ortKurz(label: string | undefined | null): string {
  if (!label) return "";
  return label.replace(/,\s*\d{4}\s+/, ", ");
}

/** Ort der Dienststelle ohne Organisationsnamen („Krems“) – aus den Stammdaten der Dienststelle */
export function wacheOrt(fz: SimFahrzeug): string {
  const st = store.get("stations", fz.stationId);
  if (st?.ort) return st.ort;
  // ohne Ort: Organisationswörter vorne weglassen
  return (fz.stationName || fz.kurzname || "").replace(/^.*?(Bezirksstelle|Ortsstelle|Stadtstelle|Dienststelle|Luftrettungszentrum|Stützpunkt)\s+/i, "");
}

function wache(fz: SimFahrzeug): string {
  const ort = wacheOrt(fz);
  return fz.rmTyp === "NAH" || fz.rmTyp === "ITH" ? `Stützpunkt ${ort}` : `Wache ${ort}`;
}

function amHeim(fz: SimFahrzeug): boolean {
  return distanceM(fz, fz.heim) < 250;
}

function khName(id: string | undefined): string {
  if (!id) return "";
  const h = store.get("hospitals", id);
  return h ? h.kurzname || h.name : "";
}

/**
 * Letzter Standort: auf der Wache „Wache X“; im Einsatz vor Ort der Einsatzort, beim Transport/Übergabe der Einsatzort
 * bzw. das Krankenhaus; KT-Fahrt der letzte Halt. Das Spiel merkt sich keinen früheren Ort – unterwegs ohne Auftrag daher leer.
 */
export function standortText(fz: SimFahrzeug): string {
  if (amHeim(fz)) return wache(fz);
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  if (e) {
    if (["vorOrt", "suche", "transport", "warteKH", "treffpunkt"].includes(fz.phase)) return ortKurz(e.adresse?.label ?? e.bo?.label);
    if (fz.phase === "uebergabe") return khName(e.kh?.hospitalId) || ortKurz(e.zo?.label);
    if (["ausruecken", "anfahrt", "routing"].includes(fz.phase)) return "";
  }
  const p = fz.kt;
  if (p?.aktiv && p.halt > 0) {
    const h = p.halte[p.halt - 1];
    const k = h ? sim.ktAuftrag(h.kt) : undefined;
    if (k) return ortKurz((h.art === "ab" ? k.d.von : k.d.nach)?.label);
  }
  return "";
}

/** Fahrtziel: Adresse, die gerade angefahren wird (Einsatzort, Krankenhaus, Abholort/Ziel, Wache) */
export function fahrtzielText(fz: SimFahrzeug): string {
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  if (e) {
    if (["ausruecken", "anfahrt", "routing", "suche", "rendezvous"].includes(fz.phase)) return ortKurz(e.adresse?.label ?? e.bo?.label);
    if (fz.phase === "transport") return khName(e.kh?.hospitalId) || ortKurz(e.zo?.label);
    if (fz.phase === "bereitstellung") return ortKurz(e.br?.label ?? e.gs?.br?.label);
    return "";
  }
  const p = fz.kt;
  if (p?.aktiv) {
    const h = p.halte[p.halt];
    const k = h ? sim.ktAuftrag(h.kt) : undefined;
    if (k) return ortKurz((h.art === "ab" ? k.d.von : k.d.nach)?.label);
  }
  if (fz.phase === "rueckfahrt") return wache(fz);
  return "";
}

/** Codes, mit denen das Fahrzeug gerade unterwegs ist (Darüberfahren zeigt den Text) */
export function codesVon(fz: SimFahrzeug): { c: string; text: string }[] {
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  if (e) {
    const c = findCode(e.code ?? undefined);
    return c ? [{ c: c.code, text: `${c.code} · ${c.beschreibung}` }] : [];
  }
  const p = fz.kt;
  if (p?.fahrten.length) {
    const ids = p.fahrten[0] ?? [];
    return ids
      .map((id) => sim.ktAuftrag(id)?.d.code)
      .filter((c): c is string => !!c)
      .map((c) => ({ c, text: `${c} · ${ktCode(c)?.name ?? ""}` }));
  }
  return [];
}

/** Minuten aus Sekunden („5 min“) */
export function minText(sek: number | null | undefined): string {
  if (sek === null || sek === undefined) return "–";
  return `${Math.max(1, Math.round(sek / 60))} min`;
}

/** Restfahrzeit der laufenden Fahrt in Minuten (null = keine Fahrt) */
export function restMin(fz: SimFahrzeug): number | null {
  const a = fz.pilot ? sim.pilotAnkunft(fz) : null;
  if (a) return Math.max(1, Math.round(a.min));
  if (!fz.fahrt) return null;
  const rest = (fz.fahrt.start + fz.fahrt.dauer * 1000 - sim.state.zeit) / 60_000;
  return rest > 0 ? Math.max(1, Math.round(rest)) : null;
}

/** Status als Text in der Zeile („zum Berufungsort“) */
export function statusText(fz: SimFahrzeug): string {
  const n = sim.statusDef(fz.status)?.name ?? "";
  return n.charAt(0).toLowerCase() + n.slice(1);
}

export function fzTyp(fz: SimFahrzeug): string {
  return typText(fz);
}

export { hhmm };

// ---------------------------------------------------------------- Ortssuche

export interface OrtTreffer {
  name: string;
  zeile: string;
  rechts: string;
  art: "ruf" | "adr" | "org" | "ortung";
  ort: KtOrt;
}
export interface OrtGruppe {
  t: string;
  items: OrtTreffer[];
}

function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

export function kmText(m: number): string {
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1).replace(".", ",")} km` : `${Math.round(km)} km`;
}

const POI_ART: Record<string, string> = {
  ...EINRICHTUNG_LABEL,
  apotheke: "Apotheke",
  schule: "Schule",
  kindergarten: "Kindergarten",
  bahnhof: "Bahnhof",
  lokal: "Lokal",
};

/**
 * Freie Ortssuche: erkennt Adressen und Namen von Einrichtungen (Krankenhäuser mit Stationen, Ordinationen,
 * Pflegeheime …). Treffer gruppiert, mit Entfernung zu `bei`.
 */
export async function ortSuchen(
  q: string,
  opt: { bei?: LatLon | null; genannt?: string | null; stationen?: boolean; nurKh?: boolean },
): Promise<OrtGruppe[]> {
  const gruppen: OrtGruppe[] = [];
  const weit = (p: LatLon) => (opt.bei ? kmText(distanceM(opt.bei, p)) : "");
  const w = norm(q).split(/[\s,]+/).filter(Boolean);
  // vom Anrufer genannt
  if (opt.genannt) {
    const passt = !w.length || w.every((x) => norm(opt.genannt!).includes(x));
    if (passt) {
      const h = (await searchAddress(opt.genannt, 1).catch(() => []))[0];
      if (h) gruppen.push({ t: "Vom Anrufer genannt", items: [{ name: h.label, zeile: `genannt: „${opt.genannt}“`, rechts: weit(h), art: "ruf", ort: { lat: h.lat, lon: h.lon, label: h.label } }] });
    }
  }
  if (!w.length) return gruppen;
  // Einrichtungen: Krankenhäuser (mit Stationen) und eigene Orte
  const einr: OrtTreffer[] = [];
  for (const h of store.list("hospitals")) {
    const name = h.kurzname || h.name;
    const basis = norm(`${name} ${h.name} ${h.ort ?? ""} krankenhaus klinik`);
    if (w.every((x) => basis.includes(x))) einr.push({ name: h.name, zeile: `${h.ort ?? ""} · Krankenhaus`, rechts: weit(h), art: "org", ort: { lat: h.lat, lon: h.lon, label: name, khId: h.id } });
    if (opt.stationen)
      for (const b of bereicheVon(h)) {
        const bn = bereichName(b);
        if (!w.every((x) => `${basis} ${norm(bn)} ${norm(b)}`.includes(x))) continue;
        einr.push({ name: `${name} – ${bn}`, zeile: `${h.name}${h.ort && !h.name.includes(h.ort) ? `, ${h.ort}` : ""} · Station`, rechts: weit(h), art: "org", ort: { lat: h.lat, lon: h.lon, label: `${name}, ${bn}`, khId: h.id, bereich: b } });
      }
  }
  if (!opt.nurKh)
    for (const p of store.list("pois")) {
      const t = norm(`${p.name} ${p.ort ?? ""} ${POI_ART[p.typ.split(",")[0]] ?? ""}`);
      if (!w.every((x) => t.includes(x))) continue;
      const art = POI_ART[p.typ.split(",")[0]];
      einr.push({ name: p.name, zeile: `${p.ort ?? ""}${art ? ` · ${art}` : ""}`, rechts: weit(p), art: "org", ort: { lat: p.lat, lon: p.lon, label: `${p.name}${p.ort ? `, ${p.ort}` : ""}`, ...(EINRICHTUNG_LABEL[p.typ.split(",")[0]] ? { einrichtung: EINRICHTUNG_LABEL[p.typ.split(",")[0]] } : {}) } });
    }
  const nah = (a: OrtTreffer, b: OrtTreffer) => (opt.bei ? distanceM(opt.bei, a.ort) - distanceM(opt.bei, b.ort) : 0);
  einr.sort(nah);
  // Adressen
  const namen = new Set(einr.map((x) => norm(x.ort.label)));
  const adr: OrtTreffer[] = opt.nurKh
    ? []
    : (await searchAddress(q, 10).catch(() => []))
        .filter((h) => !namen.has(norm(h.label)))
        .map((h) => ({ name: h.label, zeile: h.place ? "Ort" : h.city || "", rechts: weit(h), art: "adr" as const, ort: { lat: h.lat, lon: h.lon, label: h.label } }));
  // Krankenhaus-Suche (SEK): Einrichtungen zuerst, sonst Adressen zuerst
  const reihe: OrtGruppe[] = opt.stationen
    ? [
        { t: "Einrichtungen", items: einr.slice(0, 8) },
        { t: "Adressen", items: adr.slice(0, 5) },
      ]
    : [
        { t: "Adressen", items: adr.slice(0, 6) },
        { t: "Einrichtungen", items: einr.slice(0, 6) },
      ];
  for (const g of reihe) if (g.items.length) gruppen.push(g);
  return gruppen;
}
