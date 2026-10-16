/**
 * Codesystem = Einsatzcodes + Abfrageschema in einer JSON-Datei.
 * Prüfung beim Laden (verständliche Meldungen, z. B. für eine von einer KI erstellte Datei)
 * und Zusammenführen mit der aktuell geladenen Codeliste zum Speichern.
 */
import type { Einsatzcode } from "../data/model";
import { pruefe, type Bedingung, type Frage, type Schema } from "./schema";
import { THEMEN } from "./themen";

export const FORMAT = "leitwerk-codesystem";

/** Fehler (Datei unbrauchbar) und Hinweise (läuft, aber unvollständig) */
export function pruefeCodesystem(s: Schema): { fehler: string[]; hinweise: string[] } {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  if (!s || typeof s !== "object") return { fehler: ["Die Datei enthält kein Objekt."], hinweise };
  if (!s.kapitel || typeof s.kapitel !== "object" || !Object.keys(s.kapitel).length) fehler.push("„kapitel“ fehlt oder ist leer.");
  if (!s.globale_fragen || typeof s.globale_fragen !== "object") fehler.push("„globale_fragen“ fehlt.");
  if (!s.codes || typeof s.codes !== "object" || !Object.keys(s.codes).length) fehler.push("„codes“ fehlt oder ist leer.");
  if (fehler.length) return { fehler, hinweise };

  const codes = s.codes;
  const prim = s.globale_fragen.phase_4_primaerabfrage ?? [];
  for (const id of ["alter", "bw", "at"]) if (!prim.some((f) => f.id === id)) hinweise.push(`Primärabfrage: die Frage „${id}“ fehlt – das Spiel braucht sie für Anrufer und Patienten.`);
  if (!(s.globale_fragen.phase_3_was_ist_passiert ?? []).some((f) => f.typ === "kapitelwahl")) hinweise.push("phase_3_was_ist_passiert: keine Frage vom Typ „kapitelwahl“.");

  let st: RegExp | null = null;
  if (s.stufen?.muster) {
    try {
      st = new RegExp(s.stufen.muster);
    } catch {
      fehler.push(`stufen.muster „${s.stufen.muster}“ ist kein gültiger regulärer Ausdruck.`);
    }
  }
  const code = (c: string | undefined, wo: string) => {
    if (c && !codes[c]) fehler.push(`${wo}: Code „${c}“ steht nicht in „codes“.`);
  };
  for (const [k, K] of Object.entries(s.kapitel)) {
    const wo = `Kapitel ${k}`;
    if (!K || typeof K !== "object") {
      fehler.push(`${wo}: kein Objekt.`);
      continue;
    }
    if (K.kapitel !== k) hinweise.push(`${wo}: „kapitel“ sollte „${k}“ sein (ist „${K.kapitel}“).`);
    if (!K.titel) hinweise.push(`${wo}: „titel“ fehlt.`);
    if (!Array.isArray(K.fragen)) fehler.push(`${wo}: „fragen“ muss eine Liste sein.`);
    if (!Array.isArray(K.regeln) || !K.regeln.length) {
      fehler.push(`${wo}: „regeln“ fehlt oder ist leer.`);
      continue;
    }
    const letzte = K.regeln[K.regeln.length - 1];
    if (letzte.wenn) fehler.push(`${wo}: die letzte Regel braucht kein „wenn“ (Standardregel), sonst endet nicht jeder Weg auf einem Code.`);
    // Determinanten dürfen auch nur über „aufloesung“ zu einem Code werden
    const det = (c: string | undefined, w: string) => {
      if (c && !codes[c] && !K.aufloesung?.[c]) fehler.push(`${w}: Code „${c}“ steht weder in „codes“ noch in „aufloesung“.`);
    };
    const ids = new Set([...(K.fragen ?? []).map((f: Frage) => f.id), ...Object.values(s.globale_fragen).flat().map((f) => f.id)]);
    const fragenIn = (b: Bedingung | null | undefined, w: string) => {
      if (!b) return;
      if ("all" in b) b.all.forEach((x) => fragenIn(x, w));
      else if ("any" in b) b.any.forEach((x) => fragenIn(x, w));
      else if ("not" in b) fragenIn(b.not, w);
      else if ("q" in b && !ids.has(b.q) && !Object.values(s.kapitel).some((x) => x.fragen?.some((f) => f.id === b.q))) hinweise.push(`${w}: Bedingung fragt „${b.q}“, diese Frage gibt es nicht.`);
    };
    K.regeln.forEach((r, i) => {
      const w = `${wo}, Regel ${i + 1}`;
      const arten = [r.code, r.wechsel_zu_kapitel, r.code_nach_antwort].filter(Boolean).length;
      if (arten !== 1) fehler.push(`${w}: braucht genau eines von „code“, „wechsel_zu_kapitel“, „code_nach_antwort“.`);
      det(r.code, w);
      if (r.wechsel_zu_kapitel && !s.kapitel[r.wechsel_zu_kapitel]) fehler.push(`${w}: Kapitel „${r.wechsel_zu_kapitel}“ gibt es nicht.`);
      for (const c of Object.values(r.code_nach_antwort?.zuordnung ?? {})) det(c, w);
      fragenIn(r.wenn, w);
      try {
        pruefe(r.wenn, {});
      } catch {
        fehler.push(`${w}: Bedingung ist nicht lesbar.`);
      }
    });
    for (const f of K.fragen ?? []) {
      if (!f.id || !f.text) fehler.push(`${wo}: eine Frage ohne „id“ oder „text“.`);
      if (f.typ === "single" && !f.optionen?.length) fehler.push(`${wo}, Frage „${f.id}“: Typ „single“ braucht „optionen“.`);
      fragenIn(f.anzeigen_wenn, `${wo}, Frage „${f.id}“`);
    }
    const ks = K.kreislaufstillstand;
    if (ks?.code) det(ks.code, `${wo}, kreislaufstillstand`);
    if (ks?.wechsel_zu_kapitel && !s.kapitel[ks.wechsel_zu_kapitel]) fehler.push(`${wo}, kreislaufstillstand: Kapitel „${ks.wechsel_zu_kapitel}“ gibt es nicht.`);
    for (const [det, z] of Object.entries(K.aufloesung ?? {})) for (const c of Object.values(z)) code(c, `${wo}, aufloesung ${det}`);
    for (const c of Object.values(K.aufwertung ?? {})) det(c, `${wo}, aufwertung`);
    for (const c of Object.values(K.polizei_kennung ?? {})) code(c, `${wo}, polizei_kennung`);
    for (const l of Object.values(K.zusatzkennungen ?? {})) for (const c of l) code(c, `${wo}, zusatzkennungen`);
  }
  // Themen (für die Fallgeschichten)
  const themen = Object.entries(s.kapitel).map(([k, K]) => [k, K?.thema] as const);
  if (themen.some(([, t]) => t)) {
    const gesehen = new Map<string, string>();
    for (const [k, t] of themen) {
      if (!t) hinweise.push(`Kapitel ${k}: „thema“ fehlt – dazu gibt es keine Fallgeschichten.`);
      else if (!THEMEN.some((x) => x.id === t)) hinweise.push(`Kapitel ${k}: Thema „${t}“ kennt LeitWerk nicht.`);
      else if (gesehen.has(t)) hinweise.push(`Thema „${t}“ kommt doppelt vor (Kapitel ${gesehen.get(t)} und ${k}).`);
      else gesehen.set(t, k);
    }
  }
  const kats = new Set<string>();
  for (const [c, v] of Object.entries(codes)) {
    if (!v?.name) hinweise.push(`Code „${c}“: „name“ fehlt.`);
    if (!v?.kategorie) hinweise.push(`Code „${c}“: „kategorie“ (Einsatzstufe) fehlt – dann schlägt das Spiel keine Fahrzeuge vor.`);
    else kats.add(v.kategorie);
    if (st && !st.test(c)) hinweise.push(`Code „${c}“ passt nicht zu stufen.muster.`);
  }
  // nicht zu viele Meldungen
  const kurz = (l: string[]) => (l.length > 25 ? [...l.slice(0, 25), `… und ${l.length - 25} weitere`] : l);
  return { fehler: kurz([...new Set(fehler)]), hinweise: kurz([...new Set(hinweise)]) };
}

/** Geladenes Abfrageschema + aktuelle Codeliste als eine Datei */
export function codesystemDatei(schema: Schema, codes: Einsatzcode[]): string {
  const alle: Schema["codes"] = { ...schema.codes };
  for (const c of codes) alle[c.code] = { name: c.name, kategorie: c.kategorie, kapitel: c.kapitel };
  const out = { format: FORMAT, ...schema, codes: alle };
  out.format = FORMAT;
  return JSON.stringify(out, null, 1);
}
