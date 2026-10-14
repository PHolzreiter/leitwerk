/**
 * Krankentransporte und Überstellungen: Liste (linke Seite) und Auftragsmaske mit Hotline-Gespräch und Disposition.
 */
import { BEREICHE, bereicheVon } from "../data/model";
import { store } from "../data/store";
import { KT_FRAGEN, ktFragen, type KtFrage } from "../abfrage/ktGespraech";
import { mp } from "../net/mehrspieler";
import { sim, type KtVorschlag, type SimFahrzeug } from "../sim/engine";
import {
  bereichName,
  hhmm,
  KT_ART_LABEL,
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
import { addressInput } from "./panels/teile";
import { liveSammler } from "./panels/live";
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

/** Art des Auftrags: Krankentransport oder Überstellung (SEK) */
type Art = "kt" | "sek";
function artVon(d: KtDaten): Art {
  return istUeberstellung(d) ? "sek" : "kt";
}

/** Code als farbiges Kästchen: Notarzt (D) rot, Sondersignal (B) orange, SOFORT gelb, Überstellung violett */
export function codeChip(code: string | null | undefined, gross = false): string {
  if (!code) return `<span class="kt-code leer${gross ? " big" : ""}">kein Code</span>`;
  const i = codeInfo(code);
  const cls = i.arzt && i.sondersignal ? "sek-d" : i.sondersignal ? "sek-b" : i.sofort ? "sofort" : i.gruppe === "SEK" ? "sek" : "kt";
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
  if (s.bit) t.push("BIT");
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
    const lage = k.d.lage ? esc(ktKurz(k.d).replace(/^.*\(/, "(")) : "";
    const name = esc(k.d.patient.name || "(Aufnahme)");
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

export function ktMaske(k: KtAuftrag, deps: { flyTo(lat: number, lon: number, z?: number): void; abfrage(id: string): void }): { root: HTMLElement; refresh(): void } {
  const abfrageZeigen = deps.abfrage;
  const root = el("div", { class: "mask kt-mask" });
  const kopf = el("div", { class: "mask-head" });
  const datenBox = el("div", { class: "mask-box" });
  const dispoBox = el("div", { class: "mask-box" });
  const protBox = el("div", { class: "mask-box" });
  const anrufHinweis = el("div", { class: "mask-anruf-hinweis" });
  root.append(kopf, anrufHinweis, datenBox, dispoBox, protBox);

  // Fragen an den Anrufer (Gespräch selbst steht im Abfrage-Fenster)
  const stelle = async (text: string, f?: KtFrage) => {
    const l = liveSammler(k.id);
    await ktFragen(k, text, f, l.onToken).catch((e) => toast(String(e.message ?? e), "error"));
    l.fertig();
    refresh();
  };

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
    datenBox.innerHTML = "";
    const titel = el("div", { class: "box-title kt-titel" });
    titel.innerHTML = `Auftrag <span class="kt-art-chip ${art}">${art === "sek" ? "Überstellung" : "Krankentransport"}</span>`;
    datenBox.appendChild(titel);
    if (art === "kt" && !(k.d.von && k.d.nach))
      datenBox.appendChild(el("div", { class: "kt-hinweis muted" }, "Krankenhaus → Krankenhaus wird automatisch eine Überstellung."));

    const grid = el("div", { class: "kt-grid" });
    const deaktiv: (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[] = [];
    /** Zeile: Beschriftung (mit 🗨-Frage, wenn ein Gespräch läuft) und Feld */
    const zeile = (label: string, id: KtFrage["id"] | null, feld: HTMLElement) => {
      const l = el("div", { class: "kt-lbl" });
      l.appendChild(el("span", {}, label));
      const fk = id ? frageKnopf(id) : null;
      if (fk) l.appendChild(fk);
      grid.append(l, feld);
    };
    const abschnitt = (t: string) => grid.appendChild(el("div", { class: "kt-abschnitt" }, t));
    /** Auswahl als Knopfleiste */
    const knopfleiste = <T extends string | boolean>(werte: [T, string, string?][], aktuell: T | null, onSet: (v: T) => void) => {
      const seg = el("div", { class: "kt-seg" });
      for (const [v, label, cls] of werte) {
        const b = el("button", { class: `kt-seg-b${aktuell === v ? " active" : ""}${cls ? ` ${cls}` : ""}`, type: "button" }, label);
        b.addEventListener("click", () => aktuell !== v && onSet(v));
        deaktiv.push(b);
        seg.appendChild(b);
      }
      return seg;
    };
    /** Häkchen, optional mit eigener 🗨-Frage */
    const haken = (label: string, wert: boolean, onSet: (v: boolean) => void, frage?: KtFrage["id"], titelText = "") => {
      const l = el("label", { class: "chk", title: titelText });
      const c = el("input", { type: "checkbox" });
      c.checked = wert;
      c.addEventListener("change", () => onSet(c.checked));
      deaktiv.push(c);
      l.append(c, el("span", {}, label));
      const fk = frage ? frageKnopf(frage) : null;
      if (fk) l.appendChild(fk);
      return l;
    };
    const text = (wert: string, ph: string, onSet: (v: string) => void) => {
      const i = el("input", { type: "text", placeholder: ph });
      i.value = wert;
      i.addEventListener("change", () => onSet(i.value.trim()));
      deaktiv.push(i);
      return i;
    };

    // ---- Anrufer
    abschnitt("Anrufer");
    zeile(
      "Wer",
      "wer",
      el("div", { class: "muted" }, k.quelle === "hotline" ? (k.anruf?.gespraech.some((m) => m.von === "anrufer") ? "siehe Gespräch" : "–") : QUELLE[k.quelle]),
    );
    zeile("Rückruf", "telefon", text(k.d.telefon, "Telefonnummer", (v) => setze({ telefon: v })));

    // ---- Patient
    abschnitt("Patient");
    const pat = el("div", { class: "row-btns" });
    const name = text(k.d.patient.name, "Name", (v) => setze({ patient: { ...k.d.patient, name: v } }));
    const alter = el("input", { type: "number", min: "0", max: "120", class: "zahl", placeholder: "Alter" });
    alter.value = k.d.patient.alter === null ? "" : String(k.d.patient.alter);
    alter.addEventListener("change", () => setze({ patient: { ...k.d.patient, alter: alter.value === "" ? null : Number(alter.value) } }));
    const g = el("select");
    g.append(el("option", { value: "" }, "–"), el("option", { value: "w" }, "w"), el("option", { value: "m" }, "m"));
    g.value = k.d.patient.geschlecht ?? "";
    g.addEventListener("change", () => setze({ patient: { ...k.d.patient, geschlecht: (g.value || null) as "m" | "w" | null } }));
    deaktiv.push(alter, g);
    pat.append(name, alter, g);
    zeile("Name, Alter", "patient", pat);
    zeile("Grund", "grund", text(k.d.grund, art === "sek" ? "Diagnose / Grund der Überstellung" : "Grund / Diagnose", (v) => setze({ grund: v })));
    zeile("Info", null, text(k.d.patient.info, art === "sek" ? "z. B. intubiert, 2 Perfusoren" : "z. B. bis zum Fahrzeug gehfähig", (v) => setze({ patient: { ...k.d.patient, info: v } })));

    // ---- Fahrt
    abschnitt("Fahrt");
    zeile("Abholort", "von", ortWahl(k.d.von, darf, false, (o) => setze({ von: o })));
    zeile("Ziel", "nach", ortWahl(k.d.nach, darf, false, (o) => setze({ nach: o })));
    const zeiten = el("div", { class: "row-btns kt-zeiten" });
    const ab = el("input", { type: "time" });
    ab.value = hmFuer(k.d.abholung);
    ab.addEventListener("change", () => setze({ abholung: ab.value ? zeitAus(ab.value) : null }));
    const termin = el("input", { type: "time" });
    termin.value = hmFuer(k.d.termin);
    termin.addEventListener("change", () => setze({ termin: zeitAus(termin.value) }));
    deaktiv.push(ab, termin);
    const fkAb = frageKnopf("abholung");
    zeiten.append(el("span", { class: "muted" }, "Abholung"), ab);
    if (fkAb) zeiten.appendChild(fkAb);
    zeiten.append(el("span", { class: "muted" }, art === "sek" ? "Ankunft" : "Termin"), termin);
    zeile("Zeiten", "termin", zeiten);
    zeile(
      "Dringlichkeit",
      "sofort",
      knopfleiste<boolean>(
        [
          [false, "geplant"],
          [true, art === "sek" ? "SOFORT" : "SOFORT (Einweisung)", "sofort"],
        ],
        k.d.sofort,
        (v) => setze({ sofort: v }),
      ),
    );

    // ---- Transport
    abschnitt("Transport");
    const lagen: [KtLage, string][] = [
      ["gehend", "gehfähig"],
      ["sitzend", "Tragstuhl"],
      ["liegend", "liegend"],
    ];
    if (art === "kt") lagen.push(["rollstuhl", "eig. Rollstuhl"]);
    zeile("Sitzen/Liegen", "lage", knopfleiste<KtLage>(lagen, k.d.lage, (v) => setze({ lage: v })));
    const opts = el("div", { class: "kt-opts" });
    opts.append(
      haken("Begleitperson", k.d.begleitung, (v) => setze({ begleitung: v }), "begleitung"),
      haken("Sauerstoff", k.d.sauerstoff, (v) => setze({ sauerstoff: v }), "sauerstoff"),
      haken("Infektion/Isolation", k.d.infektion, (v) => setze({ infektion: v }), "infektion"),
    );
    zeile("Zusätzlich", null, opts);
    if (art === "sek") {
      const s: SekDaten = k.d.sek ?? sekLeer();
      const setzeSek = (p: Partial<SekDaten>) => setze({ sek: { ...s, ...p } });
      const bedarf = el("div", { class: "kt-opts" });
      bedarf.append(
        haken("Notarzt", s.arzt, (v) => setzeSek({ arzt: v }), "arzt", "Notarztbegleitete Überstellung"),
        haken("Monitoring", s.monitoring, (v) => setzeSek({ monitoring: v }), "monitoring", "Überwachung am Monitor nötig"),
        haken("beatmet", s.beatmet, (v) => setzeSek({ beatmet: v })),
        haken("instabil", s.instabil, (v) => setzeSek({ instabil: v }), "stabil", "Während der Fahrt muss laufend am Patienten gearbeitet werden – kein Hubschrauber"),
        haken("Inkubator / Kind", s.inkubator, (v) => setzeSek({ inkubator: v }), "inkubator"),
        haken("BIT nötig", !!s.bit, (v) => setzeSek({ bit: v }), "gewicht", "Sehr schwerer Patient – Betten-Intensivtransporter (Schwerlast)"),
      );
      zeile("Medizinisch", null, bedarf);
      zeile("Übernahme", "zusage", text(s.zusage, "z. B. zugesagt von OA Dr. …", (v) => setzeSek({ zusage: v })));
    }

    // ---- Auftrag: Wunsch und Code
    abschnitt("Code");
    if (art === "kt") {
      const wunsch = el("select");
      for (const [v, l] of Object.entries(KT_ART_LABEL)) wunsch.appendChild(el("option", { value: v }, l));
      wunsch.value = k.d.art;
      wunsch.addEventListener("change", () => setze({ art: wunsch.value as KtArt }));
      deaktiv.push(wunsch);
      zeile("Wunsch", "art", wunsch);
    }
    const codeZeile = el("div", { class: "kt-codezeile" });
    const codeSel = el("select");
    const passende = KT_CODES.filter((c) => (art === "sek" ? c.gruppe === "SEK" : c.gruppe === "KT" && c.code.startsWith(`${k.d.art}-`)));
    codeSel.appendChild(el("option", { value: "" }, "– Code –"));
    const gruppen = new Map<string, HTMLOptGroupElement>();
    for (const c of passende) {
      let gr = gruppen.get(c.kapitel);
      if (!gr) {
        gr = el("optgroup", { label: c.kapitel });
        gruppen.set(c.kapitel, gr);
        codeSel.appendChild(gr);
      }
      gr.appendChild(el("option", { value: c.code }, `${c.code} – ${c.name}`));
    }
    if (k.d.code && !passende.some((c) => c.code === k.d.code)) codeSel.appendChild(el("option", { value: k.d.code }, `${k.d.code} – ${ktCode(k.d.code)?.name ?? ""}`));
    codeSel.value = k.d.code ?? "";
    codeSel.addEventListener("change", () => setze({ code: codeSel.value || null }));
    deaktiv.push(codeSel);
    codeZeile.appendChild(codeSel);
    if (k.d.codeManuell) {
      const zurueck = el("button", { class: "btn small", type: "button", title: "Code wieder automatisch aus den Angaben bestimmen" }, "↺ Vorschlag");
      zurueck.addEventListener("click", () => setze({ code: null }));
      deaktiv.push(zurueck);
      codeZeile.appendChild(zurueck);
    } else codeZeile.appendChild(el("span", { class: "muted small" }, k.d.code ? "aus den Angaben" : "ergibt sich aus den Angaben"));
    zeile("Code", null, codeZeile);

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
    if (!k.d.von) {
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
    // je Fahrzeugtyp höchstens drei, damit z. B. viele Hubschrauber den SNAW nicht verdrängen
    const begrenzt = (l: KtVorschlag[], max: number) => {
      const n = new Map<string, number>();
      return l.filter((v) => {
        const c = (n.get(v.fz.rmTyp) ?? 0) + 1;
        n.set(v.fz.rmTyp, c);
        return c <= 3;
      }).slice(0, max);
    };
    const passend = begrenzt(vs.filter((v) => !v.ersatz), 8);
    const ersatz = begrenzt(vs.filter((v) => v.ersatz), 8);
    if (passend.length) {
      liste.appendChild(el("div", { class: "kt-vs-titel" }, sek ? `Vorschlag (${ktCode(k.d.code)?.name ?? k.d.code})` : "Vorschlag"));
      for (const v of passend) liste.appendChild(reihe(v));
    } else {
      liste.appendChild(el("div", { class: "kt-vs-titel warn" }, sek ? "Kein passendes S-Fahrzeug frei" : "Kein KTW frei"));
    }
    if (ersatz.length) {
      const det = el("details", { class: "kt-ersatz" });
      // Ersatz gleich zeigen, wenn nichts Passendes rechtzeitig kommt
      const best = passend[0];
      const zuSpaet = (v: KtVorschlag) => v.losSpaetestens !== null && v.losSpaetestens < sim.state.zeit;
      const weit = !!best && k.d.sofort && (best.sekunden ?? 1e9) > 30 * 60;
      if (!passend.length || passend.every(zuSpaet) || weit) det.open = true;
      if (passend.length && (passend.every(zuSpaet) || weit))
        liste.appendChild(el("div", { class: "kt-vs-titel warn" }, "Das passende Fahrzeug ist weit weg – Ersatz prüfen"));
      det.appendChild(el("summary", {}, sek ? "Ersatz aus dem Regelrettungsdienst (nur wenn nötig)" : "Ersatz: RTW (nur wenn nötig)"));
      for (const v of ersatz) det.appendChild(reihe(v));
      liste.appendChild(det);
    }
    if (!vs.length) liste.appendChild(el("div", { class: "muted" }, "Kein passendes Fahrzeug verfügbar."));
  }

  function refresh(): void {
    const c = ktCode(k.d.code);
    kopf.innerHTML = `${codeChip(k.d.code, true)}<div><div class="mask-nr">${esc(k.nummer)}</div>${c ? `<div class="kt-codename">${esc(c.name)}</div>` : ""}<div class="muted">${QUELLE[k.quelle]} · Eingang ${hhmm(k.eingang)} · <b>${esc(KT_STATUS_LABEL[k.status])}</b></div></div>`;
    // Anruf: kurzer Hinweis, das Gespräch steht im Abfrage-Fenster
    const a = k.anruf;
    anrufHinweis.hidden = !a || a.status === "beendet";
    if (a && a.status !== "beendet") {
      const t = { klingelt: "📞 KT-Hotline klingelt", aktiv: "📞 Gespräch läuft", gehalten: "⏸ Anrufer wird gehalten", verpasst: "📵 Verpasster Anruf", beendet: "" }[a.status];
      anrufHinweis.innerHTML = `<span>${t}${a.angenommenVon && !ichFuehre(k) ? ` · ${esc(a.angenommenVon.name)}` : ""}</span>`;
      const b = el("button", { class: "btn small" }, "Abfrage ›");
      b.addEventListener("click", () => abfrageZeigen(k.id));
      anrufHinweis.appendChild(b);
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
