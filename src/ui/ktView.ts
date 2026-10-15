/**
 * Krankentransporte und Überstellungen: Auftragsmaske (Aufnahme und Disposition).
 * Das Hotline-Gespräch selbst steht im Abfrage-Fenster.
 */
import { nummerAus } from "../sim/rufnummer";
import { exportKnopf } from "./gespraechExport";
import { bereicheVon } from "../data/model";
import { store } from "../data/store";
import { KT_FRAGEN, ktFragen, type KtFrage } from "../abfrage/ktGespraech";
import { mp } from "../net/mehrspieler";
import { sim, type KtVorschlag, type SimFahrzeug } from "../sim/engine";
import {
  bereichName,
  hhmm,
  KT_ART_LABEL,
  KT_STATUS_LABEL,
  sekLeer,
  type KtArt,
  type KtAuftrag,
  type KtDaten,
  type KtLage,
  type KtOrt,
  type SekDaten,
} from "../sim/kt";
import { codeInfo, istUeberstellung, ktCode, KT_CODES } from "../sim/ktCodes";
import { addressInput, dienstHtml, typHtml } from "./panels/teile";
import { liveSammler } from "./panels/live";
import { el, esc, toast } from "./dom";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

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
export function sekTags(d: KtDaten): string {
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

// ---------------------------------------------------------------- Ortswahl (Krankenhaus + Station oder Adresse)

/** Normalisiert für die Suche (klein, ohne Akzente, ß→ss) */
function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");
}

/**
 * Ort wählen: Krankenhaus (mit Station) über ein Suchfeld – z. B. „st. pölten endo“ – oder eine Adresse.
 * `genannt` liefert die Adresse, die der Anrufer genannt hat (für 📍 übernehmen).
 */
function ortWahl(wert: KtOrt | null, darf: boolean, nurKh: boolean, onSet: (o: KtOrt) => void, genannt?: () => string | null): HTMLElement {
  const root = el("div", { class: "kt-ort" });
  const modus = el("select", { class: "kt-ort-modus" });
  modus.append(el("option", { value: "kh" }, "Krankenhaus"), el("option", { value: "adr" }, "Adresse"));
  modus.value = wert && !wert.khId && !nurKh ? "adr" : "kh";

  // Krankenhaus + Station suchen
  const khs = store.list("hospitals");
  type Treffer = { h: (typeof khs)[number]; b?: string; label: string; such: string };
  const eintraege: Treffer[] = [];
  for (const h of khs) {
    const name = h.kurzname || h.name;
    const ortTxt = h.ort && !name.includes(h.ort) ? ` (${h.ort})` : "";
    const basis = norm(`${name} ${h.name} ${h.ort ?? ""}`);
    eintraege.push({ h, label: `${name}${ortTxt}`, such: basis });
    for (const b of bereicheVon(h)) eintraege.push({ h, b, label: `${name}${ortTxt}, ${bereichName(b)}`, such: `${basis} ${norm(bereichName(b))} ${norm(b)}` });
  }
  const khWrap = el("div", { class: "addr kt-kh-suche" });
  const khInput = el("input", { type: "text", placeholder: "🔍 Krankenhaus, Station – z. B. „St. Pölten Endo“" });
  const khListe = el("div", { class: "addr-list", hidden: "" });
  khWrap.append(khInput, khListe);
  if (wert?.khId) khInput.value = wert.label;
  let treffer: Treffer[] = [];
  const waehleKh = (t: Treffer) => {
    khInput.value = t.label;
    khListe.hidden = true;
    onSet({ lat: t.h.lat, lon: t.h.lon, label: `${t.h.kurzname || t.h.name}${t.b ? `, ${bereichName(t.b)}` : ""}`, khId: t.h.id, bereich: t.b });
  };
  const sucheKh = () => {
    const w = norm(khInput.value).split(/[\s,]+/).filter(Boolean);
    treffer = w.length ? eintraege.filter((e) => w.every((x) => e.such.includes(x))).slice(0, 40) : [];
    khListe.innerHTML = "";
    for (const t of treffer) {
      const it = el("div", { class: `addr-item${t.b ? "" : " place"}` }, t.label);
      it.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        waehleKh(t);
      });
      khListe.appendChild(it);
    }
    khListe.hidden = treffer.length === 0;
  };
  khInput.addEventListener("input", sucheKh);
  khInput.addEventListener("focus", () => khInput.select());
  khInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && treffer[0]) {
      ev.preventDefault();
      waehleKh(treffer[0]);
    }
  });
  khInput.addEventListener("blur", () =>
    setTimeout(() => {
      khListe.hidden = true;
      if (wert?.khId && khInput.value !== wert.label && !treffer.some((t) => t.label === khInput.value)) khInput.value = wert.label;
    }, 150),
  );

  // Adresse (mit 📍 „Genannte Adresse übernehmen“)
  const adr = addressInput("Straße Hausnummer Ort …", (o) => onSet({ lat: o.lat, lon: o.lon, label: o.label }));
  if (wert && !wert.khId) adr.input.value = wert.label;
  const adrZeile = el("div", { class: "kt-adr-zeile" });
  const btnGenannt = el("button", { class: "btn small icon", type: "button" }, "📍");
  const g = genannt?.() ?? null;
  btnGenannt.disabled = !darf || !g;
  btnGenannt.title = g ? `Genannte Adresse übernehmen: „${g}“` : "Genannte Adresse – erst wenn der Anrufer sie gesagt hat";
  btnGenannt.addEventListener("click", () => {
    if (!g) return;
    adr.input.value = g;
    adr.input.dispatchEvent(new Event("input"));
    adr.input.focus();
  });
  adrZeile.append(adr.root, btnGenannt);

  const zeigen = () => {
    const kh = modus.value === "kh";
    khWrap.hidden = !kh;
    adrZeile.hidden = kh;
  };
  modus.addEventListener("change", zeigen);
  zeigen();
  for (const x of [modus, khInput, adr.input]) x.disabled = !darf;
  modus.hidden = nurKh;
  root.append(modus, khWrap, adrZeile);
  return root;
}

// ---------------------------------------------------------------- Maske

/** Frage an den Anrufer stellen (Antwort erscheint im Abfrage-Fenster, auch in anderen Programmfenstern) */
export async function ktFrageStellen(k: KtAuftrag, text: string, f?: KtFrage): Promise<void> {
  const l = liveSammler(k.id);
  await ktFragen(k, text, f, l.onToken).catch((e) => toast(String(e.message ?? e), "error"));
  l.fertig();
}

/** Adresse (kein Krankenhaus), die der Anrufer im Gespräch schon genannt hat */
function genannteAdresse(k: KtAuftrag, wo: "von" | "nach"): string | null {
  const o = k.wahr?.d?.[wo];
  if (!o || o.khId) return null;
  const strasse = norm(o.label.split(",")[0].replace(/\s*\d.*$/, "").trim());
  if (!strasse) return null;
  const gesagt = (k.anruf?.gespraech ?? []).some((m) => m.von === "anrufer" && norm(m.text).includes(strasse));
  // Aufträge ohne Gespräch (Fax/Online) stehen schon im Auftrag
  return gesagt || (!k.anruf && k.quelle !== "hotline") ? o.label : null;
}

/** Kurzfassung des Auftrags für die KT-Maske */
export function ktZusammenfassung(k: KtAuftrag): string {
  const d = k.d;
  const art = artVon(d);
  const lage = d.lage ? { gehend: "gehfähig", sitzend: "Tragstuhl", liegend: "liegend", rollstuhl: "eig. Rollstuhl" }[d.lage] : "Lage?";
  const extra = [d.begleitung && "Begleitperson", d.sauerstoff && "O₂", d.infektion && "Infektion"].filter(Boolean).join(" · ");
  const zeit = `${d.abholung ? `Abholung <b>${hhmm(d.abholung)}</b>` : ""}${d.abholung && d.termin ? " · " : ""}${d.termin ? `Termin <b>${hhmm(d.termin)}</b>` : ""}` || `<span class="alert-text">keine Zeit</span>`;
  return `<div class="kt-z1"><span class="kt-art-chip ${art}">${art === "sek" ? "Überstellung" : "Krankentransport"}</span> <b>${esc(d.patient.name || "Patient?")}</b>${d.patient.alter !== null ? ` <span class="muted">${d.patient.alter} J.</span>` : ""} · ${esc(lage)}${d.sofort ? ` <span class="el-sofort">SOFORT</span>` : ""}${sekTags(d)}</div>
    <div class="kt-z2">${esc(d.von?.label ?? "Abholort?")} → ${esc(d.nach?.label ?? "Ziel?")}</div>
    <div class="kt-z3">${zeit}${extra ? ` <span class="muted">· ${esc(extra)}</span>` : ""}${d.grund ? ` <span class="muted">· ${esc(d.grund)}</span>` : ""}</div>${
      d.patient.info ? `<div class="kt-z3 muted">Hinweis: ${esc(d.patient.info)}</div>` : ""
    }`;
}

/**
 * Eingabe der Auftragsdaten (Anrufer, Patient, Fahrt, Transport, Code) – im Abfrage-Fenster für den Calltaker
 * und aufgeklappt in der KT-Maske. 🗨 stellt die passende Frage an den Anrufer.
 */
export function ktFormular(k: KtAuftrag, stelle: (text: string, f?: KtFrage) => Promise<void>, opt: { info?: boolean } = {}): { el: HTMLElement; refresh(): void } {
  const datenBox = el("div", { class: "kt-formular" });
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
    const rueck = el("div", { class: "row-btns kt-tel" });
    const telB = el("button", { class: "btn small icon", type: "button", title: "Rufnummer des Anrufers übernehmen" }, "📞");
    telB.addEventListener("click", () => setze({ telefon: k.wahr?.d?.telefon || nummerAus(k.id, false) }));
    deaktiv.push(telB);
    telB.hidden = !k.anruf;
    rueck.append(text(k.d.telefon, "Telefonnummer", (v) => setze({ telefon: v })), telB);
    zeile("Rückruf", "telefon", rueck);

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
    if (opt.info !== false) zeile("Info", null, text(k.d.patient.info, art === "sek" ? "z. B. intubiert, 2 Perfusoren" : "z. B. bis zum Fahrzeug gehfähig", (v) => setze({ patient: { ...k.d.patient, info: v } })));

    // ---- Fahrt
    abschnitt("Fahrt");
    zeile("Abholort", "von", ortWahl(k.d.von, darf, false, (o) => setze({ von: o }), () => genannteAdresse(k, "von")));
    zeile("Ziel", "nach", ortWahl(k.d.nach, darf, false, (o) => setze({ nach: o }), () => genannteAdresse(k, "nach")));
    // Abholzeit (Heimtransport) ODER Termin (Hinfahrt) – die andere Zeit rechnet das Spiel aus (Fahrzeit + Ein-/Ausladen)
    const terminName = art === "sek" ? "Ankunft" : "Termin";
    const zeitFeld = (wer: "abholung" | "termin") => {
      const box = el("div", { class: "row-btns kt-zeiten" });
      const i = el("input", { type: "time" });
      i.value = hmFuer(k.d[wer]);
      i.addEventListener("change", () => setze({ [wer]: i.value ? zeitAus(i.value) : null }));
      deaktiv.push(i);
      box.appendChild(i);
      const andere = wer === "abholung" ? "termin" : "abholung";
      if (k.d.zeitVorgabe === wer && k.d[andere])
        box.appendChild(
          el("span", { class: "kt-berechnet", title: "aus dieser Zeit und der Fahrzeit berechnet" }, `→ ${andere === "termin" ? terminName : "Abholung"} ${hhmm(k.d[andere]!)} (berechnet)`),
        );
      else if (!k.d.zeitVorgabe && !k.d.abholung && !k.d.termin)
        box.appendChild(el("span", { class: "muted small" }, wer === "abholung" ? "Heimtransport" : "Hinfahrt – eine Zeit genügt"));
      return box;
    };
    const v = k.d.zeitVorgabe;
    if (v !== "termin") zeile("Abholung", "abholung", zeitFeld("abholung"));
    if (v !== "abholung") zeile(terminName, "termin", zeitFeld("termin"));
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
      haken("Begleitperson", k.d.begleitung, (v) => setze({ begleitung: v })),
      haken("Sauerstoff", k.d.sauerstoff, (v) => setze({ sauerstoff: v })),
      haken("Infektion/Isolation", k.d.infektion, (v) => setze({ infektion: v })),
    );
    zeile("Zusätzlich", "zusatz", opts);
    if (art === "sek") {
      const s: SekDaten = k.d.sek ?? sekLeer();
      const setzeSek = (p: Partial<SekDaten>) => setze({ sek: { ...s, ...p } });
      const bedarf = el("div", { class: "kt-opts" });
      bedarf.append(
        haken("Notarzt", s.arzt, (v) => setzeSek({ arzt: v }), undefined, "Notarztbegleitete Überstellung"),
        haken("Monitoring", s.monitoring, (v) => setzeSek({ monitoring: v }), undefined, "Überwachung am Monitor nötig"),
        haken("beatmet", s.beatmet, (v) => setzeSek({ beatmet: v })),
        haken("instabil", s.instabil, (v) => setzeSek({ instabil: v }), undefined, "Während der Fahrt muss laufend am Patienten gearbeitet werden – kein Hubschrauber"),
        haken("Inkubator / Kind", s.inkubator, (v) => setzeSek({ inkubator: v })),
        haken("BIT nötig", !!s.bit, (v) => setzeSek({ bit: v }), undefined, "Sehr schwerer Patient – Betten-Intensivtransporter (Schwerlast)"),
      );
      zeile("Medizinisch", "zustand", bedarf);
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


  function refresh(): void {
    const a = k.anruf;
    const dk = JSON.stringify([k.d, k.status, a?.status, a?.angenommenVon?.pid]);
    const tippt = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
    if (dk !== datenKey && !(tippt && datenBox.contains(document.activeElement))) {
      // Ansicht nicht nach oben springen lassen
      const scroller: [HTMLElement, number][] = [];
      for (let x = datenBox.parentElement; x && !x.classList.contains("lw-panel"); x = x.parentElement) if (x.scrollTop) scroller.push([x, x.scrollTop]);
      datenKey = dk;
      datenBauen();
      for (const [x, top] of scroller) x.scrollTop = top;
    }
  }
  // nach dem Verlassen eines Felds aufgeschobene Änderungen nachziehen
  datenBox.addEventListener("focusout", () => setTimeout(refresh, 0));
  refresh();
  return { el: datenBox, refresh };
}

export function ktMaske(k: KtAuftrag, deps: { flyTo(lat: number, lon: number, z?: number): void; abfrage(id: string): void }): { root: HTMLElement; refresh(): void } {
  const abfrageZeigen = deps.abfrage;
  const root = el("div", { class: "mask kt-mask" });
  const kopf = el("div", { class: "mask-head" });
  const datenBox = el("div", { class: "mask-box kt-daten" });
  const dispoBox = el("div", { class: "mask-box" });
  const protBox = el("div", { class: "mask-box" });
  const anrufHinweis = el("div", { class: "mask-anruf-hinweis" });
  const exportZeile = el("div", { class: "mask-export" });
  exportZeile.appendChild(exportKnopf("kt", () => k.id));
  exportZeile.hidden = !k.anruf;
  root.append(kopf, anrufHinweis, datenBox, dispoBox, protBox, exportZeile);

  // Aufnahme-Daten: kompakte Zusammenfassung, zum Ändern aufklappen (die Aufnahme selbst läuft im Abfrage-Fenster)
  const form = ktFormular(k, (text, f) => ktFrageStellen(k, text, f).then(() => refresh()));
  const zusammen = el("div", { class: "kt-zusammen" });
  const bearbeiten = el("button", { class: "btn small kt-bearbeiten", type: "button" }, "✎ Bearbeiten");
  let offen = k.status === "aufnahme" && !k.anruf;
  bearbeiten.addEventListener("click", () => {
    offen = !offen;
    zusammenZeigen();
  });
  let zKey = "";
  const zusammenZeigen = () => {
    form.el.hidden = !offen;
    bearbeiten.textContent = offen ? "▴ Zuklappen" : "✎ Bearbeiten";
    const html = ktZusammenfassung(k);
    if (html === zKey) return;
    zKey = html;
    zusammen.innerHTML = html;
    zusammen.appendChild(bearbeiten);
  };
  datenBox.append(zusammen, form.el);

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
      info.innerHTML = `<b>${esc(fz.funkrufname)}</b> <span class="muted">${typHtml(fz)} · ${esc(sim.statusDef(fz.status).name)}</span>${dienstHtml(fz)}${
        nef ? ` + <b>${esc(nef.funkrufname)}</b> <span class="muted">NEF · ${esc(sim.statusDef(nef.status).name)}</span>` : ""
      }${plan && plan.fahrten.length > 1 ? `<div class="muted">${plan.fahrten.length} Fahrten: ${fahrten}</div>` : ""}${
        plan && !plan.aktiv && plan.losUm ? `<div class="kt-losum">rückt automatisch um <b>${hhmm(plan.losUm)}</b> aus</div>` : ""
      }`;
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
      r.innerHTML = `<span class="kt-vs-info"><b>${esc(v.fz.funkrufname)}</b> <span class="muted">${typHtml(v.fz)}</span>${dienstHtml(v.fz)}${
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
    form.refresh();
    zusammenZeigen();
    const fz: SimFahrzeug | undefined = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
    const pk = JSON.stringify([k.status, k.fz, k.begleit, k.d.von, k.d.nach, k.d.code, k.d.sek, fz?.status, fz?.kt?.fahrten, fz?.kt?.losUm, fz?.kt?.aktiv, nef?.status]);
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
