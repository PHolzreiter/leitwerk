/**
 * Krankenhaus im Spiel: kurze Übersicht (Karte), ausführliches Fenster („Mehr Info“) und das Fenster „KH-Status“.
 * Zeigt Akut-Abteilungen, Einrichtungen, Öffnungszeiten und freie Plätze – keine Quellen (die stehen in den Einstellungen).
 */
import type { Hospital } from "../data/model";
import { store } from "../data/store";
import { akutAbteilung, akutJetzt, akutVon, EINRICHTUNG_TYP_LABEL, EINRICHTUNGEN, type EinrichtungTyp } from "../data/klinik";
import { aufnahmetag, belegt, MIT_ZEITEN, offen, plaetze, RESSOURCEN, zeitenText, type Ressource } from "../sim/khStatus";
import { sim } from "../sim/engine";
import { distanceM } from "../sim/geo";
import { openDialog } from "./dialog";
import { el, esc } from "./dom";
import { registriere } from "./ws/arbeitsplatz";

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
  openDialog({ title: h.name, body, wide: true, actions: [{ label: "Schließen", kind: "primary" }] });
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
};

// ------------------------------------------------------------------ Fenster „KH-Status“

/**
 * Spalten der Plätze-Ansicht. Jede Spalte gehört zu einer Akut-Abteilung (ak): was die Krankenhaus-Übersicht
 * unter „Akut-Abteilungen“ zeigt, steht auch hier – und umgekehrt (eine Quelle für beide Ansichten).
 */
const SPALTEN: { rs: Ressource[]; n: string; ak: string[] }[] = [
  { rs: ["notaufnahme"], n: "NFA", ak: ["ak_notaufnahme", "ak_primaerversorgung"] },
  { rs: ["unfall"], n: "Unfall", ak: ["ak_unfallchirurgie", "ak_primaerversorgung_unfall"] },
  { rs: ["kindernotaufnahme"], n: "Kinder", ak: ["ak_kinder_jugendheilkunde"] },
  { rs: ["schockraum", "schockraum_trauma", "schockraum_intern"], n: "Schock", ak: ["ak_schockraum"] },
  { rs: ["herzkatheter"], n: "PCI", ak: ["ak_herzkatheter"] },
  { rs: ["stroke_unit"], n: "Stroke", ak: ["ak_stroke_unit"] },
  { rs: ["kreisssaal"], n: "Kreißsaal", ak: ["ak_kreisssaal"] },
];

/** Welche der Akut-Abteilungen hat das Haus (in der Reihenfolge der Liste), und ist sie gerade offen? */
function akDa(h: Hospital, ak: string[], t: number): { id: string; offen: boolean } | null {
  const alle = akutVon(h);
  const id = ak.find((x) => alle.has(x));
  return id ? { id, offen: akutJetzt(h, t).has(id) } : null;
}

/** Mehrere Ressourcen (Schockräume) zusammengefasst */
function sammelZelle(h: Hospital, sp: (typeof SPALTEN)[number], t: number): string {
  const ak = akDa(h, sp.ak, t);
  if (!ak) return `<span class="khp leer">–</span>`;
  const name = akutAbteilung(ak.id)?.name ?? ak.id;
  if (!ak.offen) return `<span class="khp zu" title="${esc(name)}: gerade geschlossen">zu</span>`;
  const da = ak.id.startsWith("ak_primaerversorgung") ? [] : sp.rs.filter((r) => plaetze(h, r) > 0);
  // Abteilung ohne gezählte Plätze: nur offen/zu (wie in der Übersicht)
  if (!da.length) return `<span class="khp frei" title="${esc(name)}: offen (keine Plätze hinterlegt)">offen</span>`;
  if (da.length === 1) return platzZelle(h, da[0], t);
  const st = da.map((r) => platzStatus(h, r, t));
  const offenL = st.filter((s) => s.offen);
  if (!offenL.length) return `<span class="khp zu">zu</span>`;
  const n = offenL.reduce((a, s) => a + s.n, 0);
  const frei = offenL.reduce((a, s) => a + s.frei, 0);
  const art = frei === 0 ? "voll" : frei / n <= 0.25 ? "knapp" : "frei";
  const titel = da.map((r, i) => `${RESSOURCEN.find((x) => x.id === r)!.name}: ${st[i].offen ? `${st[i].frei}/${st[i].n} frei` : "zu"}`).join("\n");
  return `<span class="khp ${art}" title="${esc(titel)}"><span class="khp-bar" style="--anteil:${((n - frei) / n) * 100}%"></span><b>${frei}</b>/${n}</span>`;
}

// ------------------------------------------------------------------ Ansicht „Akutversorgung“ (wie die Übersicht der Leitstelle)

type AkvZustand = "ok" | "zu" | "voll";
const AKV_SYMBOL: Record<AkvZustand, string> = {
  ok: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.3l2 2 4-4.3"/></svg>`,
  zu: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M5 8h6"/></svg>`,
  voll: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/></svg>`,
};
const AKV_TEXT: Record<AkvZustand, string> = { ok: "verfügbar", zu: "geschlossen", voll: "belegt" };

/** Spalten: Name, Akut-Abteilung(en) (erste vorhandene zählt; Primärversorgung als Ersatz), Ressourcen für die Plätze */
const AKV_SPALTEN: { n: string; titel: string; ak: string[]; rs?: Ressource[]; einzeln?: boolean; trenn?: boolean }[] = [
  { n: "SRT", titel: "Schockraum Trauma", ak: ["ak_schockraum"], rs: ["schockraum_trauma", "schockraum"], einzeln: true },
  { n: "SRI", titel: "Schockraum internistisch", ak: ["ak_schockraum"], rs: ["schockraum_intern", "schockraum"], einzeln: true },
  { n: "PCI", titel: "Herzkatheter", ak: ["ak_herzkatheter"], rs: ["herzkatheter"] },
  { n: "CT", titel: "Computertomographie", ak: ["ak_ct"] },
  { n: "END", titel: "Endoskopie", ak: ["ak_gastro_endoskopie"] },
  { n: "STROKE", titel: "Stroke Unit", ak: ["ak_stroke_unit"], rs: ["stroke_unit"] },
  { n: "NFA", titel: "Notaufnahme", ak: ["ak_notaufnahme", "ak_primaerversorgung"], rs: ["notaufnahme"], trenn: true },
  { n: "UNF", titel: "Unfallaufnahme", ak: ["ak_unfallchirurgie", "ak_primaerversorgung_unfall"], rs: ["unfall"] },
  { n: "KIND", titel: "Kindernotaufnahme / Kinderabteilung", ak: ["ak_kinder_jugendheilkunde"], rs: ["kindernotaufnahme"], trenn: true },
  { n: "KRS", titel: "Kreißsaal", ak: ["ak_kreisssaal"], rs: ["kreisssaal"] },
];

function akvFeld(zust: AkvZustand[], titel: string): string {
  const schlimmst: AkvZustand = zust.includes("ok") ? "ok" : zust.includes("voll") ? "voll" : "zu";
  return `<span class="akv-f ${schlimmst}" title="${esc(titel)}">${zust.map((z) => `<i class="akv-s ${z}">${AKV_SYMBOL[z]}</i>`).join("")}</span>`;
}

/** Zustand einer Spalte: null = gibt es dort nicht (für Tests und die Anzeige) */
export function akvZustand(h: Hospital, n: string, t: number): { ak: string; offen: boolean } | null {
  const s = AKV_SPALTEN.find((x) => x.n === n);
  const ak = s ? akDa(h, s.ak, t) : null;
  return ak ? { ak: ak.id, offen: ak.offen } : null;
}
export const AKV_SPALTEN_AK: Record<string, string[]> = Object.fromEntries(AKV_SPALTEN.map((s) => [s.n, s.ak]));

function akvZelle(h: Hospital, s: (typeof AKV_SPALTEN)[number], t: number): string {
  const ak = akDa(h, s.ak, t);
  if (!ak) return `<span class="akv-f leer"></span>`;
  const name = akutAbteilung(ak.id)?.name ?? s.titel;
  if (ak.id.startsWith("ak_primaerversorgung")) {
    const z: AkvZustand = ak.offen ? "ok" : "zu";
    return akvFeld([z], `${name} (keine vollwertige ${s.n === "NFA" ? "Notaufnahme" : "Unfallaufnahme"}): ${AKV_TEXT[z]}`);
  }
  const r = (s.rs ?? []).find((x) => plaetze(h, x) > 0);
  // keine gezählten Plätze: offen/zu wie in der Krankenhaus-Übersicht
  if (!r || !ak.offen) {
    const z: AkvZustand = ak.offen ? "ok" : "zu";
    return akvFeld([z], `${name}: ${AKV_TEXT[z]}`);
  }
  const st = platzStatus(h, r, t);
  const titel = `${s.titel}${r === "schockraum" ? " (gemeinsamer Schockraum)" : ""}: ${st.offen ? `${st.frei} von ${st.n} frei` : "geschlossen"}`;
  if (!st.offen) return akvFeld(s.einzeln ? Array(Math.min(st.n, 3)).fill("zu") : ["zu"], titel);
  if (s.einzeln) {
    const l: AkvZustand[] = [];
    for (let i = 0; i < Math.min(st.n, 3); i++) l.push(i < st.frei ? "ok" : "voll");
    return akvFeld(l, titel);
  }
  return akvFeld([st.frei > 0 ? "ok" : "voll"], titel);
}

function khStatusPanel(ctx: { params: Record<string, unknown>; setzeParams(p: Record<string, unknown>): void; sichtbar(): boolean }, standard: "plaetze" | "akut") {
  const root = el("div", { class: "khs" });
  const ansicht = el("div", { class: "khs-ansicht", role: "tablist" });
  let modus: "plaetze" | "akut" = ctx.params.ansicht === "akut" || ctx.params.ansicht === "plaetze" ? (ctx.params.ansicht as "plaetze" | "akut") : standard;
  const knopf = (m: "plaetze" | "akut", l: string) => {
    const b = el("button", { class: "btn small", type: "button", "data-ansicht": m }, l);
    b.addEventListener("click", () => {
      modus = m;
      merken();
      render();
    });
    return b;
  };
  ansicht.append(knopf("akut", "Akutversorgung"), knopf("plaetze", "Plätze"));
  const kopf = el("div", { class: "khs-kopf" });
  const such = el("input", { type: "search", placeholder: "Krankenhaus suchen …", class: "khs-such" }) as HTMLInputElement;
  const umkreis = el("select", { class: "khs-umkreis", title: "Umkreis um die Mitte deiner Funkgruppe" }) as HTMLSelectElement;
  for (const [v, l] of [["40", "bis 40 km"], ["70", "bis 70 km"], ["120", "bis 120 km"], ["0", "alle"]]) umkreis.appendChild(el("option", { value: v }, l));
  umkreis.value = String(ctx.params.umkreis ?? "70");
  const nurRettung = el("input", { type: "checkbox" }) as HTMLInputElement;
  nurRettung.checked = ctx.params.nurRettung !== false;
  const nrLabel = el("label", { class: "khs-check" });
  nrLabel.append(nurRettung, document.createTextNode(" nur mit Rettung"));
  kopf.append(ansicht, such, umkreis, nrLabel);
  const tabelle = el("div", { class: "khs-tab" });
  root.append(kopf, tabelle);

  const render = () => {
    const t = jetzt();
    const g = sim.funkgruppe();
    const mitte = { lat: (g.bbox[1] + g.bbox[3]) / 2, lon: (g.bbox[0] + g.bbox[2]) / 2 };
    const max = Number(umkreis.value);
    const q = such.value.trim().toLowerCase();
    const liste = store
      .list("hospitals")
      .map((h) => ({ h, km: distanceM(mitte, h) / 1000 }))
      .filter((x) => (!max || x.km <= max) && (!nurRettung.checked || nimmtRettung(x.h)) && (!q || `${x.h.name} ${x.h.kurzname} ${x.h.ort}`.toLowerCase().includes(q)))
      .sort((a, b) => a.km - b.km);
    ansicht.querySelectorAll<HTMLElement>("[data-ansicht]").forEach((b) => b.classList.toggle("primary", b.dataset.ansicht === modus));
    tabelle.classList.toggle("akv", modus === "akut");
    if (modus === "akut") {
      const kopf = `<div class="akv-z akv-head"><span class="akv-name">Krankenhaus</span>${AKV_SPALTEN.map((s) => `<span class="${s.trenn ? "akv-trenn" : ""}" title="${esc(s.titel)}">${s.n}</span>`).join("")}</div>`;
      tabelle.innerHTML =
        kopf +
        (liste
          .map(
            ({ h, km }) => `<div class="akv-z" data-kh="${esc(h.id)}" tabindex="0" role="button">
              <span class="akv-name"><b>${esc(h.kurzname || h.name)}</b><small>${km.toFixed(0)} km</small></span>
              ${AKV_SPALTEN.map((s) => `<span class="${s.trenn ? "akv-trenn" : ""}">${akvZelle(h, s, t)}</span>`).join("")}
            </div>`,
          )
          .join("") || `<div class="khs-leer">Kein Krankenhaus im gewählten Umkreis.</div>`) +
        `<div class="akv-legende"><span><i class="akv-s ok">${AKV_SYMBOL.ok}</i> verfügbar</span><span><i class="akv-s voll">${AKV_SYMBOL.voll}</i> belegt</span><span><i class="akv-s zu">${AKV_SYMBOL.zu}</i> geschlossen</span><span>leer = gibt es dort nicht</span></div>`;
      return;
    }
    const kopfZeile = `<div class="khs-z khs-head"><span>Krankenhaus</span>${SPALTEN.map((sp) => `<span>${sp.n}</span>`).join("")}</div>`;
    tabelle.innerHTML =
      kopfZeile +
      (liste
        .map(
          ({ h, km }) => `<div class="khs-z" data-kh="${esc(h.id)}" tabindex="0" role="button">
            <span class="khs-name"><b>${esc(h.kurzname || h.name)}</b><small>${km.toFixed(0)} km${h.aufnahmerad ? (aufnahmetag(h.aufnahmerad, t) ? " · Aufnahmetag" : " · kein Aufnahmetag") : ""}</small></span>
            ${SPALTEN.map((sp) => `<span>${sammelZelle(h, sp, t)}</span>`).join("")}
          </div>`,
        )
        .join("") || `<div class="khs-leer">Kein Krankenhaus im gewählten Umkreis.</div>`);
  };
  const merken = () => ctx.setzeParams({ umkreis: umkreis.value, nurRettung: nurRettung.checked, ansicht: modus });
  umkreis.addEventListener("change", () => (merken(), render()));
  nurRettung.addEventListener("change", () => (merken(), render()));
  such.addEventListener("input", render);
  const oeffnen = (z: Element | null) => {
    const id = (z as HTMLElement | null)?.dataset.kh;
    const h = id ? store.get("hospitals", id) : undefined;
    if (h) khDetail(h);
  };
  tabelle.addEventListener("click", (e) => oeffnen((e.target as Element).closest("[data-kh]")));
  tabelle.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") oeffnen((e.target as Element).closest("[data-kh]"));
  });
  let letzt = 0;
  const aus = [
    sim.onChange(() => {
      const now = performance.now();
      if (now - letzt < 2000 || !ctx.sichtbar()) return;
      letzt = now;
      render();
    }),
    store.onChange(render),
  ];
  render();
  return { el: root, dispose: () => aus.forEach((f) => f()), sichtbar: (an: boolean) => an && render() };
}

registriere({
  komponente: "khstatus",
  titel: "KH-Status",
  info: "Krankenhäuser in der Nähe: offen oder zu, freie Plätze in Notaufnahme, Schockraum, Herzkatheter, Stroke Unit, Kreißsaal",
  bereich: "rechts",
  erstellen: (ctx) => khStatusPanel(ctx, "plaetze"),
});

registriere({
  komponente: "akutversorgung",
  titel: "Akutversorgung",
  info: "Übersicht wie in der Leitstelle: was jedes Krankenhaus hat (Schockraum Trauma/intern, PCI, CT, Endoskopie, Stroke, Notaufnahme, Unfall …) und ob es gerade verfügbar, belegt oder geschlossen ist",
  bereich: "rechts",
  erstellen: (ctx) => khStatusPanel(ctx, "akut"),
});
