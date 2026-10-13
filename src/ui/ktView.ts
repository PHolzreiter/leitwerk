/**
 * Krankentransporte und Überstellungen: Liste (linke Seite) und Auftragsmaske mit Hotline-Gespräch und Disposition.
 */
import { BEREICHE, bereicheVon } from "../data/model";
import { store } from "../data/store";
import { KT_FRAGEN, ktAntwortetGerade, ktFragen, type KtFrage } from "../abfrage/ktGespraech";
import { kiBereit } from "../abfrage/ki";
import { mp } from "../net/mehrspieler";
import { sim, type KtVorschlag, type SimFahrzeug } from "../sim/engine";
import {
  bereichName,
  hhmm,
  KT_ART_LABEL,
  KT_LAGE_LABEL,
  KT_STATUS_LABEL,
  ktKurz,
  sekLeer,
  type KtArt,
  type KtAuftrag,
  type KtDaten,
  type KtLage,
  type KtOrt,
  type SekDaten,
} from "../sim/kt";
import { codeInfo, istUeberstellung, ktCode, KT_CODES } from "../sim/ktCodes";
import { addressInput } from "./opsView";
import { el, esc, toast } from "./dom";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

const STATUS_ORDNUNG: Record<string, number> = { aufnahme: 0, offen: 1, vorgemerkt: 2, unterwegs: 3, anBord: 4, erledigt: 5, storniert: 6 };
const QUELLE: Record<KtAuftrag["quelle"], string> = { hotline: "KT-Hotline", online: "Online-Anmeldung", dauer: "Dauerauftrag", manuell: "von Hand" };

function ichFuehre(k: KtAuftrag): boolean {
  const a = k.anruf;
  return !!a?.angenommenVon && (sim.mode === "solo" || a.angenommenVon.pid === (sim.ich?.pid ?? mp.ich.pid));
}

/** Uhrzeit (hh:mm) in Simulationszeit umrechnen: heute, oder morgen, wenn es schon lange vorbei ist */
function zeitAus(hm: string): number | null {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(sim.state.zeit);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let t = d.getTime();
  if (t < sim.state.zeit - 6 * 3_600_000) t += 24 * 3_600_000;
  return t;
}
function hmFuer(t: number | null): string {
  return t ? hhmm(t) : "";
}

/** Art des Auftrags: Krankentransport, Überstellung (SEK) oder Dienstfahrt */
type Art = "kt" | "sek" | "df";
function artVon(d: KtDaten): Art {
  if (d.code?.startsWith("DF-")) return "df";
  return istUeberstellung(d) ? "sek" : "kt";
}

/** Code als farbiges Kästchen: Notarzt (D) rot, Sondersignal (B) orange, SOFORT gelb, Überstellung violett */
export function codeChip(code: string | null | undefined, gross = false): string {
  if (!code) return `<span class="kt-code leer${gross ? " big" : ""}">kein Code</span>`;
  const i = codeInfo(code);
  const cls = i.gruppe === "DF" ? "df" : i.arzt && i.sondersignal ? "sek-d" : i.sondersignal ? "sek-b" : i.sofort ? "sofort" : i.gruppe === "SEK" ? "sek" : "kt";
  const name = ktCode(code)?.name ?? "";
  return `<span class="kt-code ${cls}${gross ? " big" : ""}" title="${esc(name)}">${esc(code)}</span>`;
}

/** kleine Merkmale einer Überstellung (Notarzt, Monitoring …) */
function sekTags(d: KtDaten): string {
  const s = d.sek;
  if (!s) return "";
  const t: string[] = [];
  if (s.beatmet) t.push("beatmet");
  else if (s.arzt) t.push("Notarzt");
  else if (s.monitoring) t.push("Monitor");
  if (s.inkubator) t.push((d.patient.alter ?? 1) < 1 ? "Inkubator" : "Kind");
  if (codeInfo(d.code).flug) t.push("✈");
  return t.map((x) => `<span class="kt-tag">${esc(x)}</span>`).join("");
}

// ---------------------------------------------------------------- Liste

type Filter = "alle" | "kt" | "sek";
let filter: Filter = "alle";
export function ktFilter(): Filter {
  return filter;
}

export function ktListe(container: HTMLElement, deps: { selected(): string | null; select(id: string): void; annehmen(id: string): void }, alle: boolean): void {
  const sichtbar = (sim.state.kt ?? []).filter((k) => alle || (k.status !== "erledigt" && k.status !== "storniert"));
  const zahl = (f: Filter) => sichtbar.filter((k) => f === "alle" || (f === "sek") === (artVon(k.d) === "sek")).length;
  const liste = sichtbar.filter((k) => filter === "alle" || (filter === "sek") === (artVon(k.d) === "sek"));
  liste.sort((a, b) => {
    const ka = a.anruf?.status === "klingelt" ? -1 : STATUS_ORDNUNG[a.status];
    const kb = b.anruf?.status === "klingelt" ? -1 : STATUS_ORDNUNG[b.status];
    // dringende Überstellungen nach oben
    const da = codeInfo(a.d.code).sondersignal && a.status === "offen" ? -0.5 : 0;
    const db = codeInfo(b.d.code).sondersignal && b.status === "offen" ? -0.5 : 0;
    return ka + da - (kb + db) || (a.d.abholung ?? a.d.termin ?? a.eingang) - (b.d.abholung ?? b.d.termin ?? b.eingang);
  });
  container.innerHTML = "";
  // Filter: Alle / Krankentransporte / Überstellungen
  const chips = el("div", { class: "kt-filter" });
  for (const [f, label] of [
    ["alle", "Alle"],
    ["kt", "Krankentransporte"],
    ["sek", "Überstellungen"],
  ] as [Filter, string][]) {
    const b = el("button", { class: `kt-chip${filter === f ? " active" : ""}` });
    b.innerHTML = `${label} <span class="n">${zahl(f)}</span>`;
    b.addEventListener("click", () => {
      filter = f;
      ktListe(container, deps, alle);
    });
    chips.appendChild(b);
  }
  container.appendChild(chips);
  for (const k of liste) {
    const row = el("div", { class: `kt-row st-${k.status}${k.id === deps.selected() ? " sel" : ""}` });
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
    const a = k.anruf;
    const tel =
      a && (a.status === "klingelt" || a.status === "verpasst")
        ? `<div class="inc-anruf ${a.status === "klingelt" ? "klingelt" : "verpasst"}">${a.status === "klingelt" ? "📞 KT-Hotline klingelt" : "📵 verpasst"}</div>`
        : a?.status === "aktiv"
          ? `<div class="inc-anruf aktiv">📞 im Gespräch</div>`
          : "";
    const ab = k.d.abholung ?? (k.d.termin ? k.d.termin - 45 * 60_000 : null);
    const spaet = ab !== null && ["offen", "vorgemerkt"].includes(k.status) && ab < sim.state.zeit;
    const art = artVon(k.d);
    const lage = k.d.lage ? esc(ktKurz(k.d).replace(/^.*\(/, "(")) : "";
    const name = art === "df" ? esc(ktCode(k.d.code)?.name ?? "Dienstfahrt") : esc(k.d.patient.name || "(Aufnahme)");
    row.innerHTML = `
      <div class="kt-zeit"><b>${k.d.abholung ? hhmm(k.d.abholung) : hhmm(k.d.termin)}</b><span class="muted">${k.d.abholung ? `an ${hhmm(k.d.termin)}` : k.d.termin ? "Termin" : ""}</span></div>
      <div class="kt-main">
        <div class="kt-zeile1">${codeChip(k.d.code)} <b>${name}</b> <span class="kt-lage">${lage}</span>${sekTags(k.d)}${k.quelle === "dauer" ? ` <span class="muted">· Dauer</span>` : k.quelle === "online" ? ` <span class="muted">· online</span>` : ""}</div>
        <div class="muted">${esc(k.d.von?.label ?? "?")} → ${esc(k.d.nach?.label ?? "?")}</div>
        ${tel}
      </div>
      <div class="kt-st"><span class="kt-status ${k.status}${spaet ? " spaet" : ""}">${esc(spaet ? "zu spät dran" : KT_STATUS_LABEL[k.status])}</span>${fz ? `<div class="muted">${esc(fz.funkrufname)}${nef ? ` + ${esc(nef.funkrufname)}` : ""}</div>` : ""}</div>`;
    row.addEventListener("click", () => deps.select(k.id));
    if (a && (a.status === "klingelt" || a.status === "verpasst")) {
      const b = el("button", { class: "btn small primary inc-annehmen" }, a.status === "klingelt" ? "Annehmen" : "Zurückrufen");
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deps.annehmen(k.id);
      });
      row.querySelector(".kt-main")!.appendChild(b);
    }
    container.appendChild(row);
  }
  if (!liste.length)
    container.appendChild(
      el("div", { class: "muted pad" }, filter === "sek" ? "Keine offenen Überstellungen." : filter === "kt" ? "Keine offenen Krankentransporte." : "Keine offenen Aufträge."),
    );
}

// ---------------------------------------------------------------- Ortswahl (Krankenhaus + Station oder Adresse)

function ortWahl(wert: KtOrt | null, darf: boolean, nurKh: boolean, onSet: (o: KtOrt) => void): HTMLElement {
  const root = el("div", { class: "kt-ort" });
  const modus = el("select");
  modus.append(el("option", { value: "kh" }, "Krankenhaus"), el("option", { value: "adr" }, "Adresse"));
  modus.value = wert && !wert.khId && !nurKh ? "adr" : "kh";
  const khSel = el("select");
  const beSel = el("select");
  const khs = store.list("hospitals").slice().sort((a, b) => (a.kurzname || a.name).localeCompare(b.kurzname || b.name, "de"));
  khSel.appendChild(el("option", { value: "" }, "– Krankenhaus –"));
  for (const h of khs) khSel.appendChild(el("option", { value: h.id }, `${h.kurzname || h.name}${h.ort && !(h.kurzname || h.name).includes(h.ort) ? ` (${h.ort})` : ""}`));
  const fuelleBereiche = () => {
    const h = khs.find((x) => x.id === khSel.value);
    beSel.innerHTML = "";
    beSel.appendChild(el("option", { value: "" }, "– Station/Ambulanz –"));
    for (const b of h ? bereicheVon(h) : Object.keys(BEREICHE)) beSel.appendChild(el("option", { value: b }, bereichName(b)));
  };
  const adr = addressInput("Straße Hausnummer Ort …", (o) => onSet({ lat: o.lat, lon: o.lon, label: o.label }));
  if (wert?.khId) khSel.value = wert.khId;
  fuelleBereiche();
  if (wert?.bereich) beSel.value = wert.bereich;
  if (wert && !wert.khId) adr.input.value = wert.label;
  const setzeKh = () => {
    const h = khs.find((x) => x.id === khSel.value);
    if (!h) return;
    const b = beSel.value;
    onSet({ lat: h.lat, lon: h.lon, label: `${h.kurzname || h.name}${b ? `, ${bereichName(b)}` : ""}`, khId: h.id, bereich: b || undefined });
  };
  khSel.addEventListener("change", () => {
    fuelleBereiche();
    setzeKh();
  });
  beSel.addEventListener("change", setzeKh);
  const zeigen = () => {
    const kh = modus.value === "kh";
    khSel.hidden = beSel.hidden = !kh;
    adr.root.hidden = kh;
  };
  modus.addEventListener("change", zeigen);
  zeigen();
  for (const x of [modus, khSel, beSel, adr.input]) x.disabled = !darf;
  modus.hidden = nurKh;
  root.append(modus, khSel, beSel, adr.root);
  return root;
}

// ---------------------------------------------------------------- Maske

export function ktMaske(k: KtAuftrag, deps: { flyTo(lat: number, lon: number, z?: number): void }): { root: HTMLElement; refresh(): void } {
  const root = el("div", { class: "mask kt-mask" });
  const kopf = el("div", { class: "mask-head" });
  const anrufBox = el("div", { class: "mask-box anruf" });
  const datenBox = el("div", { class: "mask-box" });
  const dispoBox = el("div", { class: "mask-box" });
  const protBox = el("div", { class: "mask-box" });
  root.append(kopf, anrufBox, datenBox, dispoBox, protBox);

  // ---- Anruf
  const anrufKopf = el("div", { class: "anruf-kopf" });
  const verlauf = el("div", { class: "anruf-verlauf" });
  const live = el("div", { class: "anruf-msg anrufer live", hidden: "" });
  const form = el("form", { class: "anruf-form" });
  const eingabe = el("input", { type: "text", placeholder: "Frage an den Anrufer … (Enter)" });
  form.append(eingabe, el("button", { class: "btn small primary", type: "submit" }, "Fragen"));
  anrufBox.append(anrufKopf, verlauf, form);
  let liveText = "";
  const onToken = (t: string) => {
    liveText += t;
    live.hidden = false;
    live.textContent = liveText;
  };
  const stelle = async (text: string, f?: KtFrage) => {
    liveText = "";
    await ktFragen(k, text, f, onToken).catch((e) => toast(String(e.message ?? e), "error"));
    live.hidden = true;
    refresh();
  };
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t || !ichFuehre(k)) return;
    eingabe.value = "";
    void stelle(t);
  });

  // ---- Daten (feste Abfrage)
  let datenKey = "";
  const setze = (patch: Partial<KtDaten>) => fehler(sim.call("ktSetze", k.id, patch));
  const frageKnopf = (id: KtFrage["id"]) => {
    const f = KT_FRAGEN.find((x) => x.id === id);
    if (!f || k.anruf?.status !== "aktiv" || !ichFuehre(k)) return null;
    const b = el("button", { class: "frag-knopf", type: "button", title: f.text }, "🗨");
    b.addEventListener("click", () => void stelle(f.text, f));
    return b;
  };
  function datenBauen(): void {
    const darf = ["aufnahme", "offen", "vorgemerkt"].includes(k.status) && (!k.anruf || k.anruf.status !== "aktiv" || ichFuehre(k));
    const art = artVon(k.d);
    datenBox.innerHTML = `<div class="box-title">${art === "sek" ? "Überstellung" : art === "df" ? "Dienstfahrt" : "Transportauftrag"}</div>`;

    // Art: Krankentransport / Überstellung / Dienstfahrt
    const seg = el("div", { class: "kt-seg" });
    for (const [a, label] of [
      ["kt", "Krankentransport"],
      ["sek", "Überstellung (SEK)"],
      ["df", "Dienstfahrt"],
    ] as [Art, string][]) {
      const b = el("button", { class: `kt-seg-b${art === a ? " active" : ""}`, type: "button" }, label);
      b.disabled = !darf;
      b.addEventListener("click", () => {
        if (a === art) return;
        if (a === "sek") setze({ sek: k.d.sek ?? sekLeer(), code: null });
        else if (a === "df") setze({ sek: null, code: "DF-99K1" });
        else setze({ sek: null, code: null });
      });
      seg.appendChild(b);
    }
    datenBox.appendChild(seg);
    if (art === "kt" && k.d.von?.khId && k.d.nach?.khId)
      datenBox.appendChild(el("div", { class: "kt-hinweis" }, "Krankenhaus → Krankenhaus ist eine Überstellung (SEK-Code)."));

    const grid = el("div", { class: "kt-grid" });
    const zeile = (label: string, id: KtFrage["id"] | null, feld: HTMLElement, cls = "") => {
      const l = el("div", { class: `kt-lbl ${cls}` });
      const fk = id ? frageKnopf(id) : null;
      if (fk) l.appendChild(fk);
      l.appendChild(document.createTextNode(label));
      grid.append(l, feld);
    };
    const abschnitt = (titel: string) => {
      grid.appendChild(el("div", { class: "kt-abschnitt" }, titel));
    };
    const deaktiv: (HTMLInputElement | HTMLSelectElement)[] = [];

    // Code
    const codeZeile = el("div", { class: "kt-codezeile" });
    const codeSel = el("select");
    const passende = KT_CODES.filter((c) => (art === "df" ? c.gruppe === "DF" : art === "sek" ? c.gruppe === "SEK" : c.gruppe === "KT" && c.code.startsWith(`${k.d.art}-`)));
    codeSel.appendChild(el("option", { value: "" }, "– Code –"));
    const gruppen = new Map<string, HTMLOptGroupElement>();
    for (const c of passende) {
      let g = gruppen.get(c.kapitel);
      if (!g) {
        g = el("optgroup", { label: c.kapitel });
        gruppen.set(c.kapitel, g);
        codeSel.appendChild(g);
      }
      g.appendChild(el("option", { value: c.code }, `${c.code} – ${c.name}`));
    }
    if (k.d.code && !passende.some((c) => c.code === k.d.code)) codeSel.appendChild(el("option", { value: k.d.code }, `${k.d.code} – ${ktCode(k.d.code)?.name ?? ""}`));
    codeSel.value = k.d.code ?? "";
    codeSel.addEventListener("change", () => setze({ code: codeSel.value || null }));
    deaktiv.push(codeSel);
    codeZeile.appendChild(codeSel);
    if (k.d.codeManuell) {
      const zurueck = el("button", { class: "btn small", type: "button", title: "Code wieder automatisch aus den Angaben bestimmen" }, "↺ Vorschlag");
      zurueck.disabled = !darf;
      zurueck.addEventListener("click", () => setze({ code: null }));
      codeZeile.appendChild(zurueck);
    } else if (art !== "df") codeZeile.appendChild(el("span", { class: "muted small" }, "folgt den Angaben"));
    zeile("Code", null, codeZeile);

    if (art !== "df") {
      const wer = el(
        "div",
        { class: "muted" },
        k.quelle === "hotline" ? (k.anruf?.gespraech.some((m) => m.von === "anrufer") ? "siehe Gespräch" : "–") : QUELLE[k.quelle],
      );
      zeile("Anrufer", "wer", wer);
      abschnitt("Patient");
      const pat = el("div", { class: "row-btns" });
      const name = el("input", { type: "text", placeholder: "Name" });
      name.value = k.d.patient.name;
      const alter = el("input", { type: "number", min: "0", max: "120", class: "zahl", placeholder: "Alter" });
      alter.value = k.d.patient.alter === null ? "" : String(k.d.patient.alter);
      const g = el("select");
      g.append(el("option", { value: "" }, "–"), el("option", { value: "w" }, "w"), el("option", { value: "m" }, "m"));
      g.value = k.d.patient.geschlecht ?? "";
      name.addEventListener("change", () => setze({ patient: { ...k.d.patient, name: name.value.trim() } }));
      alter.addEventListener("change", () => setze({ patient: { ...k.d.patient, alter: alter.value === "" ? null : Number(alter.value) } }));
      g.addEventListener("change", () => setze({ patient: { ...k.d.patient, geschlecht: (g.value || null) as "m" | "w" | null } }));
      pat.append(name, alter, g);
      deaktiv.push(name, alter, g);
      zeile("Name, Alter", "patient", pat);
      const info = el("input", { type: "text", placeholder: art === "sek" ? "z. B. intubiert, 2 Perfusoren" : "Kurzinfo, z. B. bis zum Fahrzeug gehfähig" });
      info.value = k.d.patient.info;
      info.addEventListener("change", () => setze({ patient: { ...k.d.patient, info: info.value } }));
      deaktiv.push(info);
      zeile("Info", null, info);
      const grund = el("input", { type: "text", placeholder: art === "sek" ? "Diagnose / Grund der Überstellung" : "Grund / Diagnose" });
      grund.value = k.d.grund;
      grund.addEventListener("change", () => setze({ grund: grund.value }));
      deaktiv.push(grund);
      zeile("Grund", "grund", grund);
      const lage = el("select");
      lage.appendChild(el("option", { value: "" }, "– Wollen Sie sitzen oder liegen? –"));
      for (const [v, l] of Object.entries(KT_LAGE_LABEL)) if (!(art === "sek" && v === "rollstuhl")) lage.appendChild(el("option", { value: v }, l));
      lage.value = k.d.lage ?? "";
      lage.addEventListener("change", () => setze({ lage: (lage.value || null) as KtLage | null }));
      deaktiv.push(lage);
      zeile("Transportart", "lage", lage);
      const opts = el("div", { class: "row-btns kt-opts" });
      const chk = (label: string, id: "begleitung" | "sauerstoff" | "infektion") => {
        const l = el("label", { class: "chk" });
        const fk = frageKnopf(id);
        if (fk) l.appendChild(fk);
        const c = el("input", { type: "checkbox" });
        c.checked = k.d[id];
        c.disabled = !darf;
        c.addEventListener("change", () => setze({ [id]: c.checked } as Partial<KtDaten>));
        l.append(c, el("span", {}, label));
        opts.appendChild(l);
      };
      chk("Begleitperson", "begleitung");
      chk("Sauerstoff", "sauerstoff");
      chk("Infektion/Isolation", "infektion");
      zeile("", null, opts);
    }

    abschnitt(art === "df" ? "Fahrt" : "Orte und Zeiten");
    zeile(art === "df" ? "Von (optional)" : "Abholort", "von", ortWahl(k.d.von, darf, art === "sek", (o) => setze({ von: o })));
    zeile("Ziel", "nach", ortWahl(k.d.nach, darf, art === "sek", (o) => setze({ nach: o })));
    const zeiten = el("div", { class: "row-btns kt-zeiten" });
    const ab = el("input", { type: "time" });
    ab.value = hmFuer(k.d.abholung);
    ab.addEventListener("change", () => setze({ abholung: ab.value ? zeitAus(ab.value) : null }));
    const termin = el("input", { type: "time" });
    termin.value = hmFuer(k.d.termin);
    termin.addEventListener("change", () => setze({ termin: zeitAus(termin.value) }));
    const fkTermin = frageKnopf("termin");
    zeiten.append(el("span", { class: "muted" }, "Abholung"), ab);
    zeiten.append(el("span", { class: "muted" }, art === "sek" ? "Ankunft" : "Termin"));
    if (fkTermin) zeiten.appendChild(fkTermin);
    zeiten.append(termin);
    deaktiv.push(ab, termin);
    zeile("Abholung", "abholung", zeiten);
    if (art === "kt") {
      const l = el("label", { class: "chk" });
      const c = el("input", { type: "checkbox" });
      c.checked = k.d.sofort;
      c.disabled = !darf;
      c.addEventListener("change", () => setze({ sofort: c.checked }));
      l.append(c, el("span", {}, "SOFORT (Einweisung durch den Arzt)"));
      zeile("", "sofort", l);
    }
    if (art === "df") {
      const zweck = el("input", { type: "text", placeholder: "Zweck, z. B. Werkstatt, Übung" });
      zweck.value = k.d.grund;
      zweck.addEventListener("change", () => setze({ grund: zweck.value }));
      deaktiv.push(zweck);
      zeile("Zweck", null, zweck);
    }

    // Überstellung: Dringlichkeit, Notarzt, Monitoring …
    if (art === "sek") {
      abschnitt("Überstellung");
      const s: SekDaten = k.d.sek ?? sekLeer();
      const setzeSek = (p: Partial<SekDaten>) => setze({ sek: { ...s, ...p } });
      const dring = el("div", { class: "kt-seg klein" });
      for (const [v, label] of [
        [false, "geplant"],
        [true, "SOFORT"],
      ] as [boolean, string][]) {
        const b = el("button", { class: `kt-seg-b${k.d.sofort === v ? " active" : ""}${v ? " sofort" : ""}`, type: "button" }, label);
        b.disabled = !darf;
        b.addEventListener("click", () => setze({ sofort: v }));
        dring.appendChild(b);
      }
      zeile("Dringlichkeit", "sofort", dring);
      const opts = el("div", { class: "row-btns kt-opts" });
      const chk = (label: string, feld: keyof Omit<SekDaten, "zusage">, frage: KtFrage["id"], titel: string) => {
        const l = el("label", { class: "chk", title: titel });
        const fk = frageKnopf(frage);
        if (fk) l.appendChild(fk);
        const c = el("input", { type: "checkbox" });
        c.checked = s[feld];
        c.disabled = !darf;
        c.addEventListener("change", () => setzeSek({ [feld]: c.checked }));
        l.append(c, el("span", {}, label));
        opts.appendChild(l);
      };
      chk("Notarzt", "arzt", "arzt", "Notarztbegleitete Überstellung");
      chk("Monitoring", "monitoring", "monitoring", "Überwachung am Monitor nötig");
      chk("beatmet", "beatmet", "monitoring", "Patient ist intubiert und beatmet (Notarzt nötig)");
      chk("instabil", "instabil", "stabil", "Während der Fahrt muss laufend am Patienten gearbeitet werden – kein Hubschrauber");
      chk("Inkubator / Kind", "inkubator", "inkubator", "Inkubator- oder Kinderüberstellung");
      zeile("Bedarf", null, opts);
      const zus = el("input", { type: "text", placeholder: "z. B. Übernahme zugesagt von OA Dr. …" });
      zus.value = s.zusage;
      zus.addEventListener("change", () => setzeSek({ zusage: zus.value }));
      deaktiv.push(zus);
      zeile("Übernahme", "zusage", zus);
    }

    abschnitt("Auftraggeber");
    if (art === "kt") {
      const wunsch = el("select");
      for (const [v, l] of Object.entries(KT_ART_LABEL)) wunsch.appendChild(el("option", { value: v }, l));
      wunsch.value = k.d.art;
      wunsch.addEventListener("change", () => setze({ art: wunsch.value as KtArt }));
      deaktiv.push(wunsch);
      zeile("Wunsch", "art", wunsch);
    }
    const tel = el("input", { type: "text", placeholder: "Rückrufnummer" });
    tel.value = k.d.telefon;
    tel.addEventListener("change", () => setze({ telefon: tel.value }));
    deaktiv.push(tel);
    zeile("Telefon", "telefon", tel);
    for (const x of deaktiv) x.disabled = !darf;
    datenBox.appendChild(grid);
    if (k.status === "aufnahme") {
      const b = el("button", { class: "btn primary kt-anlegen" }, "Auftrag anlegen");
      b.disabled = !darf;
      b.addEventListener("click", () => fehler(sim.call("ktAnlegen", k.id)));
      datenBox.appendChild(b);
    }
  }

  // ---- Disposition
  let dispoKey = "";
  let dispoLauf = 0;
  async function dispoBauen(): Promise<void> {
    const lauf = ++dispoLauf;
    dispoBox.innerHTML = `<div class="box-title">Disposition</div>`;
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
    const knopf = (label: string, cls: string, fn: () => Promise<unknown>, titel?: string) => {
      const b = el("button", { class: `btn small ${cls}`, title: titel ?? "" }, label);
      b.addEventListener("click", () => fehler(fn()));
      return b;
    };
    const zeile = el("div", { class: "row-btns" });
    if (fz) {
      const plan = fz.kt;
      const info = el("div", { class: "kt-zugeteilt" });
      const fahrten = plan ? plan.fahrten.map((f) => f.map((id) => esc(sim.ktAuftrag(id)?.nummer ?? "?")).join(" + ")).join(" → ") : "";
      info.innerHTML = `<b>${esc(fz.funkrufname)}</b> <span class="muted">${esc(fz.rmTyp)} · ${esc(sim.statusDef(fz.status).name)}</span>${
        nef ? ` + <b>${esc(nef.funkrufname)}</b> <span class="muted">NEF · ${esc(sim.statusDef(nef.status).name)}</span>` : ""
      }${plan && plan.fahrten.length > 1 ? `<div class="muted">${plan.fahrten.length} Fahrten: ${fahrten}</div>` : ""}`;
      dispoBox.appendChild(info);
      if (k.status === "vorgemerkt") {
        if (plan && !plan.aktiv) zeile.appendChild(knopf("Jetzt losschicken", "primary", () => sim.call("ktSchicken", fz.id)));
        zeile.appendChild(knopf("Vormerkung lösen", "", () => sim.call("ktLoesen", k.id)));
      }
      if (k.status === "unterwegs" && plan?.aktiv) zeile.appendChild(knopf("Storno über Funk", "danger-text", () => sim.call("ktFunkStorno", fz.id), "Fahrzeug ohne Patient bricht alle seine Fahrten ab"));
    }
    if (["offen", "vorgemerkt", "unterwegs", "aufnahme"].includes(k.status)) zeile.appendChild(knopf("Auftrag stornieren", "danger-text", () => sim.call("ktStorno", k.id, "durch Leitstelle")));
    if (zeile.childElementCount) dispoBox.appendChild(zeile);
    if (k.status !== "offen") return;
    if (!k.d.von && artVon(k.d) !== "df") {
      dispoBox.appendChild(el("div", { class: "muted" }, "Für Vorschläge zuerst den Abholort eintragen."));
      return;
    }
    if (!k.d.code) {
      dispoBox.appendChild(el("div", { class: "muted" }, "Für Vorschläge fehlt noch der Code (Transportart eintragen)."));
      return;
    }
    const liste = el("div", { class: "kt-vorschlaege" });
    liste.innerHTML = `<div class="muted">Fahrzeiten werden berechnet …</div>`;
    dispoBox.appendChild(liste);
    const vs = await sim.ktVorschlaege(k.id);
    if (lauf !== dispoLauf) return;
    liste.innerHTML = "";
    const sek = artVon(k.d) === "sek";
    const reihe = (v: KtVorschlag) => {
      const r = el("div", { class: `kt-vs${v.ersatz ? " ersatz" : ""}` });
      const los = v.losSpaetestens ? `los spätestens ${hhmm(v.losSpaetestens)}` : "";
      const zuSpaet = v.losSpaetestens !== null && v.losSpaetestens < sim.state.zeit;
      r.innerHTML = `<span class="kt-vs-info"><b>${esc(v.fz.funkrufname)}</b> <span class="muted">${esc(v.fz.rmTyp)}</span>${
        v.begleit ? ` + <b>${esc(v.begleit.funkrufname)}</b> <span class="muted">NEF</span>` : ""
      } <span class="kt-eta">${v.sekunden === null ? "?" : `${Math.round(v.sekunden / 60)} min`}</span> <span class="${zuSpaet ? "alert-text" : "muted"}">${esc(los)}</span>${
        v.hinweis ? ` <span class="muted">· ${esc(v.hinweis)}</span>` : ""
      }</span>`;
      const btns = el("span", { class: "row-btns" });
      const frei = !v.fz.kt && sim.verfuegbar(v.fz);
      const bId = v.begleit?.id ?? null;
      btns.appendChild(knopf(v.fz.kt ? "Als nächste Fahrt" : "Vormerken", "", () => sim.call("ktVormerken", k.id, v.fz.id, "neu", bId)));
      if (v.fz.kt && !sek && artVon(k.d) === "kt") btns.appendChild(knopf("Sammelfahrt", "", () => sim.call("ktVormerken", k.id, v.fz.id, "sammel")));
      if (frei)
        btns.appendChild(
          knopf("Jetzt schicken", "primary", async () => {
            await sim.call("ktVormerken", k.id, v.fz.id, "neu", bId);
            await sim.call("ktSchicken", v.fz.id);
          }),
        );
      r.appendChild(btns);
      return r;
    };
    const passend = vs.filter((v) => !v.ersatz).slice(0, 8);
    const ersatz = vs.filter((v) => v.ersatz).slice(0, 6);
    if (passend.length) {
      liste.appendChild(el("div", { class: "kt-vs-titel" }, sek ? `Vorschlag (${ktCode(k.d.code)?.name ?? k.d.code})` : "Vorschlag"));
      for (const v of passend) liste.appendChild(reihe(v));
    } else {
      liste.appendChild(el("div", { class: "kt-vs-titel warn" }, sek ? "Kein passendes S-Fahrzeug frei" : "Kein KTW frei"));
    }
    if (ersatz.length) {
      const det = el("details", { class: "kt-ersatz" });
      if (!passend.length) det.open = true;
      det.appendChild(el("summary", {}, sek ? "Ersatz aus dem Regelrettungsdienst (nur wenn nötig)" : "Ersatz: RTW (nur wenn nötig)"));
      for (const v of ersatz) det.appendChild(reihe(v));
      liste.appendChild(det);
    }
    if (!vs.length) liste.appendChild(el("div", { class: "muted" }, "Kein passendes Fahrzeug verfügbar."));
  }

  function refresh(): void {
    const c = ktCode(k.d.code);
    kopf.innerHTML = `${codeChip(k.d.code, true)}<div><div class="mask-nr">${esc(k.nummer)}${c ? ` <span class="muted">· ${esc(c.name)}</span>` : ""}</div><div class="muted">${QUELLE[k.quelle]} · Eingang ${hhmm(k.eingang)} · <b>${esc(KT_STATUS_LABEL[k.status])}</b></div></div>`;
    // Anruf
    const a = k.anruf;
    anrufBox.hidden = !a;
    if (a) {
      const ich = ichFuehre(k);
      anrufKopf.innerHTML = "";
      const t =
        a.status === "klingelt"
          ? `<span class="klingelt">📞 KT-Hotline klingelt</span>`
          : a.status === "verpasst"
            ? `<span class="verpasst">Verpasster Anruf</span>`
            : a.status === "aktiv"
              ? `📞 Gespräch: <b>${esc(ich ? "du" : (a.angenommenVon?.name ?? "?"))}</b> <span class="muted">${kiBereit() ? "KI" : "ohne KI"}</span>`
              : `<span class="muted">Gespräch beendet</span>`;
      anrufKopf.insertAdjacentHTML("beforeend", `<div>${t}</div>`);
      if (a.status === "klingelt" || a.status === "verpasst") {
        const b = el("button", { class: "btn small primary" }, a.status === "klingelt" ? "Annehmen" : "Zurückrufen");
        b.addEventListener("click", () => annehmen());
        anrufKopf.appendChild(b);
      }
      if (a.status === "aktiv" && ich) {
        const b = el("button", { class: "btn small danger-text" }, "Auflegen");
        b.addEventListener("click", () => fehler(sim.call("ktAnrufBeenden", k.id)));
        anrufKopf.appendChild(b);
      }
      if (verlauf.childElementCount - 1 !== a.gespraech.length) {
        verlauf.innerHTML = "";
        for (const m of a.gespraech) {
          const d = el("div", { class: `anruf-msg ${m.von}` });
          d.innerHTML = m.von === "system" ? `<em>${esc(m.text)}</em>` : `<b>${m.von === "anrufer" ? "Anrufer" : esc(m.wer ?? "Leitstelle")}:</b> ${esc(m.text)}`;
          verlauf.appendChild(d);
        }
        verlauf.appendChild(live);
        verlauf.scrollTop = verlauf.scrollHeight;
      }
      verlauf.hidden = !a.gespraech.length;
      form.hidden = !(ich && a.status === "aktiv");
      eingabe.disabled = ktAntwortetGerade(k.id);
    }
    // Daten und Disposition nur neu aufbauen, wenn sich etwas geändert hat
    const dk = JSON.stringify([k.d, k.status, a?.status, a?.angenommenVon?.pid]);
    const tippt = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
    if (dk !== datenKey && !(tippt && datenBox.contains(document.activeElement))) {
      datenKey = dk;
      datenBauen();
    }
    const fz: SimFahrzeug | undefined = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
    const pk = JSON.stringify([k.status, k.fz, k.begleit, k.d.von, k.d.nach, k.d.code, k.d.sek, fz?.status, fz?.kt?.fahrten, nef?.status]);
    if (pk !== dispoKey) {
      dispoKey = pk;
      void dispoBauen();
    }
    protBox.innerHTML = `<div class="box-title">Protokoll</div><div class="prot">${k.protokoll
      .slice()
      .reverse()
      .map((p) => `<div><span class="muted">${hhmm(p.zeit)}</span> ${esc(p.text)}${p.von ? ` <span class="prot-von">${esc(p.von)}</span>` : ""}</div>`)
      .join("")}</div>`;
  }

  const annehmen = () => {
    void (async () => {
      try {
        await sim.call("ktAnrufAnnehmen", k.id);
        refresh();
        const letzte = k.anruf?.gespraech[k.anruf.gespraech.length - 1];
        if (!letzte || letzte.von !== "anrufer") await stelle(KT_FRAGEN[0].text, KT_FRAGEN[0]);
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
      }
    })();
  };

  refresh();
  if (k.d.von) deps.flyTo(k.d.von.lat, k.d.von.lon, 13);
  return { root, refresh };
}

/** Anruf annehmen und mit der ersten Frage eröffnen (aus der Liste heraus) */
export async function ktAnnehmen(id: string): Promise<void> {
  await sim.call("ktAnrufAnnehmen", id);
  const k = sim.ktAuftrag(id);
  const letzte = k?.anruf?.gespraech[k.anruf.gespraech.length - 1];
  if (k && (!letzte || letzte.von !== "anrufer")) await ktFragen(k, KT_FRAGEN[0].text, KT_FRAGEN[0]);
}
