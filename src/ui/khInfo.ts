/**
 * Krankenhaus im Spiel: kurze Übersicht (Karte), ausführliches Fenster („Mehr Info“) und das Fenster „KH-Status“.
 * Zeigt Akut-Abteilungen, Einrichtungen, Öffnungszeiten und freie Plätze – keine Quellen (die stehen in den Einstellungen).
 */
import type { Hospital } from "../data/model";
import { akutAbteilung, akutJetzt, akutVon, buchungName, EINRICHTUNG_TYP_LABEL, EINRICHTUNGEN, type EinrichtungTyp } from "../data/klinik";
import { aufnahmetag, belegt, MIT_ZEITEN, offen, plaetze, RESSOURCEN, zeitenText, type Ressource } from "../sim/khStatus";
import { sim } from "../sim/engine";
import { openDialog } from "./dialog";
import { el, esc } from "./dom";
import { registriere } from "./ws/arbeitsplatz";
import { khAufnahmeOeffnen } from "./khAufnahme";
import { khStatusFenster } from "./fenster/khstatus";

/** Gruppen der Akut-Abteilungen für die Anzeige */
const AKUT_GRUPPEN: [string, string[]][] = [
  ["Notfall", ["ak_notaufnahme", "ak_schockraum", "ak_unfallchirurgie", "ak_innere_medizin"]],
  ["Herz & Gefäße", ["ak_herzkatheter", "ak_kardiologie", "ak_cardiac_arrest_center", "ak_herzchirurgie", "ak_gefaesschirurgie", "ak_angiographie"]],
  ["Neuro", ["ak_stroke_unit", "ak_thrombektomie", "ak_neurologie", "ak_neurochirurgie", "ak_wirbelsaeulenchirurgie"]],
  ["Frau & Kind", ["ak_kreisssaal", "ak_gynaekologie", "ak_neonatologie", "ak_kinder_jugendheilkunde", "ak_kinder_intensiv", "ak_kinderchirurgie", "ak_kinder_jugend_psychiatrie"]],
  ["Intensiv", ["ak_innere_intensiv", "ak_chirurgische_intensiv"]],
];

export function nimmtRettung(h: Hospital): boolean {
  return akutVon(h).size > 0;
}

function jetzt(): number {
  return sim.state.zeit || Date.now();
}

/** Status eines Platzes: zu / x von n frei */
function platzStatus(h: Hospital, r: Ressource, t: number): { n: number; frei: number; offen: boolean } {
  const def = RESSOURCEN.find((x) => x.id === r)!;
  const n = plaetze(h, r);
  return { n, frei: Math.max(0, n - belegt(sim.state.khBelegung, h.id, r, t)), offen: offen(h, def.einrichtung, t) };
}

/** Zelle „3/8“ mit Füllstand */
function platzZelle(h: Hospital, r: Ressource, t: number, kurz = false): string {
  const s = platzStatus(h, r, t);
  if (s.n <= 0) return `<span class="khp leer">–</span>`;
  if (!s.offen) return `<span class="khp zu" title="geschlossen">zu</span>`;
  const art = s.frei === 0 ? "voll" : s.frei / s.n <= 0.25 ? "knapp" : "frei";
  const titel = `${s.frei} von ${s.n} frei`;
  return `<span class="khp ${art}" title="${titel}">${kurz ? "" : `<span class="khp-bar" style="--anteil:${((s.n - s.frei) / s.n) * 100}%"></span>`}<b>${s.frei}</b>/${s.n}</span>`;
}

/** Aufnahmerad-Hinweis */
function radText(h: Hospital, t: number): string {
  const r = h.aufnahmerad;
  if (!r) return "";
  return aufnahmetag(r, t) ? `Aufnahmetag (${r.gruppe}) – nimmt heute auf` : `kein Aufnahmetag (${r.gruppe}) – Akutaufnahme heute in einem anderen Haus`;
}

/** Kurze Übersicht für das Karten-Popup */
export function khKurzElement(h: Hospital, onEdit?: () => void): HTMLElement {
  const t = jetzt();
  const box = el("div", { class: "khk" });
  const rettung = nimmtRettung(h);
  const wichtig: Ressource[] = ["notaufnahme", "unfall", "kindernotaufnahme", "schockraum", "schockraum_trauma", "schockraum_intern", "herzkatheter", "stroke_unit", "kreisssaal", "druckkammer", "ecmo"];
  const zeilen = rettung
    ? wichtig
        .filter((r) => plaetze(h, r) > 0)
        .map((r) => `<div class="khk-z"><span>${esc(RESSOURCEN.find((x) => x.id === r)!.name)}</span>${platzZelle(h, r, t)}</div>`)
        .join("")
    : "";
  const ak = akutJetzt(h, t);
  box.innerHTML = `
    <div class="khk-kopf">
      <div class="khk-name">${esc(h.name)}</div>
      <div class="khk-ort">${esc(h.ort)}</div>
    </div>
    <div class="khk-tags">
      <span class="khk-tag ${rettung ? "ja" : "nein"}">${rettung ? "nimmt Rettung" : "keine Rettung"}</span>
      ${rettung ? `<span class="khk-tag">${ak.size} von ${akutVon(h).size} Akut-Abt. offen</span>` : ""}
    </div>
    ${radText(h, t) ? `<div class="khk-rad">${esc(radText(h, t))}</div>` : ""}
    ${zeilen ? `<div class="khk-liste">${zeilen}</div>` : ""}`;
  const knoepfe = el("div", { class: "khk-knoepfe" });
  const mehr = el("button", { class: "btn small primary" }, "Mehr Info");
  mehr.addEventListener("click", () => khDetail(h));
  knoepfe.appendChild(mehr);
  if (onEdit) {
    const b = el("button", { class: "btn small" }, "Bearbeiten");
    b.addEventListener("click", onEdit);
    knoepfe.appendChild(b);
  }
  box.appendChild(knoepfe);
  return box;
}

/** Ausführliches Fenster zu einem Krankenhaus */
export function khDetail(h: Hospital): void {
  const t = jetzt();
  const body = el("div", { class: "khd" });
  const ak = akutVon(h);
  const akJetzt = akutJetzt(h, t);
  const einr = new Set(h.einrichtungen ?? []);

  const plaetzeHtml = RESSOURCEN.filter((r) => plaetze(h, r.id) > 0 && ak.has(RESSOURCE_AK[r.id] ?? ""))
    .map(
      (r) => `<div class="khd-platz">
        <div class="khd-pn">${esc(r.name)}</div>
        <div class="khd-pz">${esc(zeitenText(h.zeiten?.[r.einrichtung]))}${h.aufnahmerad?.einrichtungen[r.einrichtung] !== undefined ? " · nur an Aufnahmetagen" : ""}</div>
        ${platzZelle(h, r.id, t)}
      </div>`,
    )
    .join("");

  const gruppen = AKUT_GRUPPEN.map(([titel, ids]) => {
    const da = ids.filter((id) => ak.has(id));
    return da.length ? { titel, ids: da } : null;
  }).filter((x): x is { titel: string; ids: string[] } => !!x);
  const sonst = [...ak].filter((id) => !AKUT_GRUPPEN.some(([, ids]) => ids.includes(id)));
  if (sonst.length) gruppen.push({ titel: "Weitere Fächer", ids: sonst });
  const akutHtml = gruppen
    .map(
      (g) => `<div class="khd-gruppe"><h4>${esc(g.titel)}</h4><div class="khd-chips">${g.ids
        .map((id) => `<span class="khd-chip${akJetzt.has(id) ? "" : " zu"}" title="${akJetzt.has(id) ? "offen" : "gerade geschlossen"}">${esc(akutAbteilung(id)?.name ?? id)}${akJetzt.has(id) ? "" : " · zu"}</span>`)
        .join("")}</div></div>`,
    )
    .join("");

  const typen = Object.keys(EINRICHTUNG_TYP_LABEL) as EinrichtungTyp[];
  const einrHtml = typen
    .map((typ) => {
      const l = EINRICHTUNGEN.filter((x) => x.typ === typ && einr.has(x.id));
      if (!l.length) return "";
      return `<details class="khd-einr"${typ === "station" ? "" : ""}><summary>${esc(EINRICHTUNG_TYP_LABEL[typ])} <span class="muted">(${l.length})</span></summary><div class="khd-chips">${l
        .map((x) => {
          const z = MIT_ZEITEN.includes(x.id) && h.zeiten?.[x.id]?.length ? ` <span class="muted">· ${esc(zeitenText(h.zeiten[x.id]))}</span>` : "";
          return `<span class="khd-chip plain">${esc(x.name)}${z}</span>`;
        })
        .join("")}</div></details>`;
    })
    .join("");

  const rettung = nimmtRettung(h);
  body.innerHTML = `
    <div class="khd-kopf">
      <div class="khd-ort">${esc(h.ort)}${h.kurzname && h.kurzname !== h.name ? ` · ${esc(h.kurzname)}` : ""}</div>
      <span class="khk-tag ${rettung ? "ja" : "nein"}">${rettung ? "nimmt Rettung" : "keine Rettung"}</span>
    </div>
    ${radText(h, t) ? `<div class="khk-rad">${esc(radText(h, t))}</div>` : ""}
    ${plaetzeHtml ? `<section><h3>Akutaufnahme jetzt</h3><div class="khd-plaetze">${plaetzeHtml}</div></section>` : ""}
    ${akutHtml ? `<section><h3>Akut-Abteilungen</h3>${akutHtml}</section>` : `<section><h3>Akut-Abteilungen</h3><p class="muted">Dieses Haus nimmt keine Rettung auf.</p></section>`}
    <section><h3>Stationen, Ambulanzen und Bereiche</h3>${einrHtml || '<p class="muted">keine Angaben</p>'}</section>`;
  openDialog({
    title: h.name,
    body,
    wide: true,
    actions: [
      { label: "Aufnahme bei Notfällen …", onClick: () => (khAufnahmeOeffnen(h.id), true) },
      { label: "Schließen", kind: "primary" },
    ],
  });
}

/** Zu welcher Akut-Abteilung gehören die gezählten Plätze? (Plätze zeigen wir nur, wenn es die Abteilung gibt) */
const RESSOURCE_AK: Record<string, string> = {
  notaufnahme: "ak_notaufnahme",
  unfall: "ak_unfallchirurgie",
  kindernotaufnahme: "ak_kinder_jugendheilkunde",
  schockraum: "ak_schockraum",
  schockraum_trauma: "ak_schockraum",
  schockraum_intern: "ak_schockraum",
  herzkatheter: "ak_herzkatheter",
  ecmo: "ak_cardiac_arrest_center",
  stroke_unit: "ak_stroke_unit",
  kreisssaal: "ak_kreisssaal",
  druckkammer: "ak_druckkammer",
  pvz: "ak_primaerversorgung",
};

// ------------------------------------------------------------------ Fenster „KH-Status“ (Plätze · Akutversorgung)
// Aussehen und Bedienung aus dem Entwurf – siehe ./fenster/khstatus/. Hier nur die Werte je Zelle (eine Quelle für beide Reiter).

/**
 * Spalten der Plätze-Ansicht. Jede Spalte gehört zu einer Akut-Abteilung (ak): was die Krankenhaus-Übersicht
 * unter „Akut-Abteilungen“ zeigt, steht auch hier – und umgekehrt (eine Quelle für beide Ansichten).
 */
export const SPALTEN: { k: string; rs: Ressource[]; n: string; ak: string[] }[] = [
  { k: "nfa", rs: ["notaufnahme"], n: "NFA", ak: ["ak_notaufnahme", "ak_primaerversorgung"] },
  { k: "unf", rs: ["unfall"], n: "Unfall", ak: ["ak_unfallchirurgie", "ak_primaerversorgung_unfall"] },
  { k: "kin", rs: ["kindernotaufnahme"], n: "Kinder", ak: ["ak_kinder_jugendheilkunde"] },
  { k: "sr", rs: ["schockraum", "schockraum_trauma", "schockraum_intern"], n: "Schock", ak: ["ak_schockraum"] },
  { k: "pci", rs: ["herzkatheter"], n: "PCI", ak: ["ak_herzkatheter"] },
  { k: "str", rs: ["stroke_unit"], n: "Stroke", ak: ["ak_stroke_unit"] },
  { k: "krs", rs: ["kreisssaal"], n: "Kreißsaal", ak: ["ak_kreisssaal"] },
];

/** Welche der Akut-Abteilungen hat das Haus (in der Reihenfolge der Liste), und ist sie gerade offen? */
function akDa(h: Hospital, ak: string[], t: number): { id: string; offen: boolean } | null {
  const alle = akutVon(h);
  const id = ak.find((x) => alle.has(x));
  return id ? { id, offen: akutJetzt(h, t).has(id) } : null;
}

/** Wert einer Plätze-Zelle: [frei, gesamt] · „zu“ · „offen“ (keine Plätze hinterlegt) · null (gibt es nicht); dazu die Ressourcen für „Wer belegt“ */
export function platzWert(h: Hospital, sp: (typeof SPALTEN)[number], t: number): { v: [number, number] | "zu" | "offen" | null; rs: Ressource[]; titel: string } {
  const ak = akDa(h, sp.ak, t);
  if (!ak) return { v: null, rs: [], titel: "" };
  const name = akutAbteilung(ak.id)?.name ?? ak.id;
  if (!ak.offen) return { v: "zu", rs: [], titel: `${name}: gerade geschlossen` };
  const da = ak.id.startsWith("ak_primaerversorgung") ? [] : sp.rs.filter((r) => plaetze(h, r) > 0);
  // Abteilung ohne gezählte Plätze: nur offen/zu (wie in der Übersicht)
  if (!da.length) return { v: "offen", rs: [], titel: `${name}: offen (keine Plätze hinterlegt)` };
  const st = da.map((r) => platzStatus(h, r, t));
  const offenI = da.map((_, i) => i).filter((i) => st[i].offen);
  if (!offenI.length) return { v: "zu", rs: [], titel: `${name}: gerade geschlossen` };
  const n = offenI.reduce((a, i) => a + st[i].n, 0);
  const frei = offenI.reduce((a, i) => a + st[i].frei, 0);
  const titel = da.length > 1 ? da.map((r, i) => `${RESSOURCEN.find((x) => x.id === r)!.name}: ${st[i].offen ? `${st[i].frei}/${st[i].n} frei` : "zu"}`).join(" · ") : "";
  return { v: [frei, n], rs: offenI.map((i) => da[i]), titel };
}

// ------------------------------------------------------------------ Ansicht „Akutversorgung“ (wie die Übersicht der Leitstelle)

type AkvZustand = "ok" | "zu" | "voll";
const AKV_TEXT: Record<AkvZustand, string> = { ok: "verfügbar", zu: "geschlossen", voll: "belegt" };

/** Spalten: Name, Akut-Abteilung(en) (erste vorhandene zählt; Primärversorgung als Ersatz), Ressourcen für die Plätze */
export const AKV_SPALTEN: { k: string; n: string; titel: string; ak: string[]; rs?: Ressource[]; einzeln?: boolean; trenn?: boolean }[] = [
  { k: "srt", n: "SRT", titel: "Schockraum Trauma", ak: ["ak_schockraum"], rs: ["schockraum_trauma", "schockraum"], einzeln: true },
  { k: "sri", n: "SRI", titel: "Schockraum internistisch", ak: ["ak_schockraum"], rs: ["schockraum_intern", "schockraum"], einzeln: true },
  { k: "pci", n: "PCI", titel: "Herzkatheter", ak: ["ak_herzkatheter"], rs: ["herzkatheter"] },
  { k: "ct", n: "CT", titel: "Computertomographie", ak: ["ak_ct"] },
  { k: "end", n: "END", titel: "Endoskopie", ak: ["ak_gastro_endoskopie"] },
  { k: "str", n: "STROKE", titel: "Stroke Unit", ak: ["ak_stroke_unit"], rs: ["stroke_unit"] },
  { k: "nfa", n: "NFA", titel: "Notaufnahme", ak: ["ak_notaufnahme", "ak_primaerversorgung"], rs: ["notaufnahme"], trenn: true },
  { k: "unf", n: "UNF", titel: "Unfallaufnahme", ak: ["ak_unfallchirurgie", "ak_primaerversorgung_unfall"], rs: ["unfall"] },
  { k: "kind", n: "KIND", titel: "Kindernotaufnahme / Kinderabteilung", ak: ["ak_kinder_jugendheilkunde"], rs: ["kindernotaufnahme"], trenn: true },
  { k: "krs", n: "KRS", titel: "Kreißsaal", ak: ["ak_kreisssaal"], rs: ["kreisssaal"] },
];

/** Zustand einer Spalte: null = gibt es dort nicht (für Tests und die Anzeige) */
export function akvZustand(h: Hospital, n: string, t: number): { ak: string; offen: boolean } | null {
  const s = AKV_SPALTEN.find((x) => x.n === n);
  const ak = s ? akDa(h, s.ak, t) : null;
  return ak ? { ak: ak.id, offen: ak.offen } : null;
}
export const AKV_SPALTEN_AK: Record<string, string[]> = Object.fromEntries(AKV_SPALTEN.map((s) => [s.n, s.ak]));

/** Wert einer Akut-Zelle: Symbole (Schockräume einzeln, sonst eines), Hinweis, belegte Ressource (für „Wer belegt“); null = gibt es dort nicht */
export function akvWert(h: Hospital, s: (typeof AKV_SPALTEN)[number], t: number): { z: AkvZustand[]; titel: string; belegt?: Ressource } | null {
  const ak = akDa(h, s.ak, t);
  if (!ak) return null;
  const name = akutAbteilung(ak.id)?.name ?? s.titel;
  if (ak.id.startsWith("ak_primaerversorgung")) {
    // Primärversorgung mit gezählten Plätzen (Health Center Flughafen): auch „voll“
    const n = plaetze(h, "pvz");
    const voll = ak.offen && n > 0 && belegt(sim.state.khBelegung, h.id, "pvz", t) >= n;
    const z: AkvZustand = !ak.offen ? "zu" : voll ? "voll" : "ok";
    return { z: [z], titel: `${name} (keine vollwertige ${s.n === "NFA" ? "Notaufnahme" : "Unfallaufnahme"}): ${AKV_TEXT[z]}`, belegt: voll ? "pvz" : undefined };
  }
  const r = (s.rs ?? []).find((x) => plaetze(h, x) > 0);
  // keine gezählten Plätze: offen/zu wie in der Krankenhaus-Übersicht
  if (!r || !ak.offen) {
    const z: AkvZustand = ak.offen ? "ok" : "zu";
    return { z: [z], titel: `${name}: ${AKV_TEXT[z]}` };
  }
  const st = platzStatus(h, r, t);
  const titel = `${s.titel}${r === "schockraum" ? " (gemeinsamer Schockraum)" : ""}: ${st.offen ? `${st.frei} von ${st.n} frei` : "geschlossen"}`;
  if (!st.offen) return { z: s.einzeln ? Array(Math.min(st.n, 3)).fill("zu") : ["zu"], titel };
  if (s.einzeln) {
    const l: AkvZustand[] = [];
    for (let i = 0; i < Math.min(st.n, 3); i++) l.push(i < st.frei ? "ok" : "voll");
    return { z: l, titel, belegt: r };
  }
  return { z: [st.frei > 0 ? "ok" : "voll"], titel, belegt: r };
}

/** Aufnahmerad: „ja“ (Aufnahmetag) · „nein“ · leer, mit Hinweis */
export function radWert(h: Hospital, t: number): { rad: "" | "ja" | "nein"; titel: string } {
  if (!h.aufnahmerad) return { rad: "", titel: "" };
  return { rad: aufnahmetag(h.aufnahmerad, t) ? "ja" : "nein", titel: `Wiener Aufnahmerad: ${radText(h, t)}` };
}

/** Wer belegt die Plätze (Einsatz, beteiligte Fahrzeuge, Buchungsgrund, bis wann) */
export function belegungListe(h: Hospital, r: Ressource, t: number): { einsatz: string | null; nummer: string; fahrzeuge: string[]; grund: string; bis: number; privat?: boolean; fremd?: boolean }[] {
  const liste = (sim.state.khBelegung?.[h.id]?.[r] ?? []).filter((x) => x.bis > t).sort((a, b) => a.bis - b.bis);
  return liste.map((b) => {
    const e = b.einsatz ? sim.einsatz(b.einsatz) : undefined;
    if (!e && b.fremd) return { einsatz: null, nummer: "", fahrzeuge: [b.fremd.von], grund: b.fremd.grund, bis: b.bis, fremd: true };
    if (!e) return { einsatz: null, nummer: "", fahrzeuge: [], grund: "selbst gekommen", bis: b.bis, privat: true };
    const prot = e.protokoll.map((p) => p.text).join("\n");
    const fzs = e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f) => !!f);
    // am Transport beteiligt: Transportmittel, begleitendes NEF/ACN, Hubschrauber mit Patient
    const dabei = fzs.filter((f) =>
      sim.transportfaehig(f)
        ? !prot.includes(`${f.funkrufname}: Patient wird vom BIT`) && !prot.includes(`${f.funkrufname}: kein Transport`) && !prot.includes(`${f.funkrufname}: Transportverweigerung`) && !prot.includes(`${f.funkrufname}: Patient verstorben`)
        : prot.includes(`${f.funkrufname}: Notarzt begleitet`) || prot.includes(`${f.funkrufname}: ACN begleitet`) || prot.includes(`${f.funkrufname}: Patient wird mit dem NAH`) || (f.begleitet && f.einsatzId === e.id),
    );
    return {
      einsatz: e.id,
      nummer: e.nummer,
      fahrzeuge: dabei.map((f) => `${f.funkrufname} (${f.typ ?? f.rmTyp})`),
      grund: e.kh?.grund ? buchungName(e.kh.grund) : "ohne Buchungsgrund",
      bis: b.bis,
    };
  });
}

/** Selbst gekommene Patienten zusammenfassen („3× privat“), Buchungen einzeln */
export function belegungZeilen<T extends { privat?: boolean; bis: number }>(l: T[]): (T & { anzahl?: number })[] {
  const privat = l.filter((x) => x.privat);
  const rest: (T & { anzahl?: number })[] = l.filter((x) => !x.privat);
  if (privat.length) rest.push({ ...privat[0], anzahl: privat.length });
  return rest;
}

registriere({
  komponente: "khstatus",
  titel: "KH-Status",
  info: "Krankenhäuser: offen oder zu, freie Plätze in Notaufnahme, Unfall, Kinder, Schockraum, Herzkatheter, Stroke Unit, Kreißsaal",
  bereich: "rechts",
  erstellen: (ctx) => khStatusFenster(ctx, "plaetze"),
});

registriere({
  komponente: "akutversorgung",
  titel: "Akutversorgung",
  info: "Übersicht wie in der Leitstelle: was jedes Krankenhaus hat (Schockraum Trauma/intern, PCI, CT, Endoskopie, Stroke, Notaufnahme, Unfall …) und ob es gerade verfügbar, belegt oder geschlossen ist",
  bereich: "rechts",
  erstellen: (ctx) => khStatusFenster(ctx, "akut"),
});
