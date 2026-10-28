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
  type KtTransportArt,
  type SekDaten,
  KT_AUFTRAG_LABEL,
  KT_BEHANDLUNGEN,
  KT_KASSEN,
  KT_TRANSPORTART_LABEL,
} from "../sim/kt";
import { abfrageAnsicht } from "./abfrageAnsicht";
import { codeFehlt, codeInfo, istUeberstellung, ktAbfrage, ktCode, ktCodeDef, ktCodes, ktFrageText } from "../sim/ktCodes";
import { artVon as artVonFrage, gespraechsFeld } from "../sim/ktBedingungen";
import { bedText } from "../sim/ktBedingungen";
import { distanceM } from "../sim/geo";
import { addressInput, dienstHtml, fzPasst, statusChip, typHtml } from "./panels/teile";
import { liveSammler } from "./panels/live";
import { el, esc, toast } from "./dom";

/** Schon gestellte (oder als erledigt markierte) Fragen je Auftrag – für „Nächste Frage“ */
const ktGefragt = new Map<string, Set<string>>();
function gefragtVon(id: string): Set<string> {
  let s = ktGefragt.get(id);
  if (!s) ktGefragt.set(id, (s = new Set()));
  return s;
}

/** Angaben, die nur Krankentransporte haben (nicht bei Überstellungen) */
const NUR_KT = new Set(["ktArt", "behandlung", "gehfaehig", "transportmittel", "auftrag", "art"]);

/** Ist die Angabe zu dieser Frage schon da (oder wurde gefragt)? */
function ktFeldFertig(k: KtAuftrag, id: string): boolean {
  return gefragtVon(k.id).has(id) || ktWertDa(k, id) === true;
}

/** Steht zu dieser Frage schon ein Wert in der Aufnahme? null = an einem Wert nicht erkennbar (Ja/Nein-Häkchen) */
function ktWertDa(k: KtAuftrag, id: string): boolean | null {
  const d = k.d;
  switch (id) {
    case "wer":
      return !!k.anruf?.gespraech.some((m) => m.von === "anrufer") || k.quelle !== "hotline";
    case "patient":
      return !!d.patient.name;
    case "von":
      return !!d.von;
    case "nach":
      return !!d.nach;
    case "termin":
    case "abholung":
      return !!(d.termin || d.abholung);
    case "grund":
      return !!d.grund;
    case "lage":
      return !!d.lage;
    case "telefon":
      return !!d.telefon;
    case "ktArt":
      return !!d.ktArt;
    case "transportmittel":
      return !!d.transportmittel;
    case "gehfaehig":
      return d.gehfaehig !== undefined && d.gehfaehig !== null;
    case "auftrag":
      return !!d.auftrag;
    case "kasse":
      return !!d.kasse;
    case "behandlung":
      return !!d.behandlung;
    case "zusage":
      return !!d.sek?.zusage;
    default:
      return null;
  }
}

/** Suchtext der Fahrzeugsuche je Auftrag (bleibt beim Neuaufbau der Disposition) */
const ktSuche = new Map<string, string>();

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
    // Text der Frage aus dem aktiven Codesatz (eigene KT-Abfrage); abgeschaltete Fragen ohne 🗨
    const text = ktFrageText(id);
    if (!f || !text || k.anruf?.status !== "aktiv" || !ichFuehre(k)) return null;
    const b = el("button", { class: "frag-knopf", type: "button", title: text }, "🗨");
    b.addEventListener("click", () => {
      gefragtVon(k.id).add(id);
      void stelle(text, f);
    });
    return b;
  };
  function datenBauen(): void {
    const darf = ["aufnahme", "offen", "vorgemerkt"].includes(k.status) && (!k.anruf || k.anruf.status !== "aktiv" || ichFuehre(k));
    const art = artVon(k.d);
    const neu = abfrageAnsicht() === "neu";
    datenBox.innerHTML = "";
    datenBox.classList.toggle("neu", neu);
    const titel = el("div", { class: "box-title kt-titel" });
    titel.innerHTML = `Auftrag <span class="kt-art-chip ${art}">${art === "sek" ? "Überstellung" : "Krankentransport"}</span>`;
    datenBox.appendChild(titel);
    // Neue Ansicht: statt aller Fragen nur die nächste offene (mit 🗨 und „erledigt“)
    if (neu && k.anruf?.status === "aktiv" && ichFuehre(k)) datenBox.appendChild(naechsteFrage(art));
    // Fragen der Abfrage in ihrer Reihenfolge (eigener Codesatz) – ein Klick stellt die Frage
    if (!neu && k.anruf?.status === "aktiv" && ichFuehre(k)) {
      const leiste = el("div", { class: "kt-fragenleiste" });
      ktAbfrage()
        .filter((q) => q.aktiv !== false && q.text.trim())
        .forEach((q, i) => {
          const f = KT_FRAGEN.find((x) => x.id === gespraechsFeld(q));
          if (!f) return;
          const b = el("button", { class: `kt-frage-b ${artVonFrage(q)}`, type: "button", title: q.text, "data-kt-frage": q.id }, `${i + 1}. ${q.text}`);
          b.addEventListener("click", () => void stelle(q.text, f));
          leiste.appendChild(b);
        });
      if (leiste.childElementCount) datenBox.appendChild(leiste);
    }
    if (art === "kt" && !(k.d.von && k.d.nach))
      datenBox.appendChild(el("div", { class: "kt-hinweis muted" }, "Krankenhaus → Krankenhaus wird automatisch eine Überstellung."));

    const grid = el("div", { class: "kt-grid" });
    /** neue Ansicht: Abschnitte als Karten, jede mit eigenem Raster */
    const karten = el("div", { class: "kt-karten" });
    let ziel = grid;
    const deaktiv: (HTMLInputElement | HTMLSelectElement | HTMLButtonElement)[] = [];
    /** Zeile: Beschriftung (mit 🗨-Frage, wenn ein Gespräch läuft) und Feld */
    const zeile = (label: string, id: KtFrage["id"] | null, feld: HTMLElement) => {
      const l = el("div", { class: "kt-lbl" });
      // neue Ansicht: ✓ = Angabe da, ○ = noch offen
      if (neu && id && k.status === "aufnahme") {
        const w = ktWertDa(k, id);
        const ok = w === null ? gefragtVon(k.id).has(id) : w;
        l.appendChild(el("span", { class: `kt-mark${ok ? " ok" : ""}`, title: ok ? "erledigt" : "noch offen" }, ok ? "✓" : "○"));
      }
      l.appendChild(el("span", {}, label));
      const fk = id ? frageKnopf(id) : null;
      if (fk) l.appendChild(fk);
      ziel.append(l, feld);
    };
    const abschnitt = (t: string) => {
      if (!neu) return void grid.appendChild(el("div", { class: "kt-abschnitt" }, t));
      const karte = el("div", { class: "kt-karte" });
      ziel = el("div", { class: "kt-grid" });
      karte.append(el("div", { class: "kt-karte-titel" }, t), ziel);
      karten.appendChild(karte);
    };
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
    abschnitt(neu ? "Anrufer und Patient" : "Anrufer");
    zeile(
      "Wer",
      "wer",
      el("div", { class: "muted" }, k.quelle === "hotline" ? (k.anruf?.gespraech.some((m) => m.von === "anrufer") ? "siehe Gespräch" : "–") : QUELLE[k.quelle]),
    );
    const rueck = el("div", { class: "row-btns kt-tel" });
    // 📞: ohne Nummer übernehmen, mit Nummer (und beendetem Gespräch) zurückrufen
    const telB = el("button", { class: "btn small icon", type: "button", title: k.d.telefon && k.anruf ? "Anrufer zurückrufen" : "Rufnummer des Anrufers übernehmen" }, "📞");
    telB.addEventListener("click", () => {
      if (!k.d.telefon) return setze({ telefon: k.wahr?.d?.telefon || nummerAus(k.id, false) });
      if (k.anruf?.status === "aktiv") return;
      void import("./panels/telefon").then((m) => m.anrufAnnehmen("kt", k.id));
    });
    deaktiv.push(telB);
    telB.hidden = !k.anruf;
    rueck.append(text(k.d.telefon, "Telefonnummer", (v) => setze({ telefon: v })), telB);
    zeile("Rückruf", "telefon", rueck);

    // ---- Patient
    if (!neu) abschnitt("Patient");
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
    const dringlichkeit = () =>
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
    if (v !== "termin") zeile("Abholung", "abholung", zeitFeld("abholung"));
    // SEK: Dringlichkeit gleich unter der Abholung (bei SOFORT ist die Zeit egal)
    const frueh = art === "sek" && v !== "termin";
    if (frueh) dringlichkeit();
    if (v !== "abholung") zeile(terminName, "termin", zeitFeld("termin"));
    if (!frueh) dringlichkeit();

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
      haken(neu ? "Hygienemaßnahme (Infektion/Isolation)" : "Infektion/Isolation", k.d.infektion, (v) => setze({ infektion: v })),
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

    // ---- neue Ansicht: Art des Transports und Abrechnung
    if (neu) {
      /** Auswahlliste mit „–“ für noch nicht angegeben */
      const auswahl = (werte: [string, string][], aktuell: string | null | undefined, onSet: (v: string | null) => void) => {
        const sel = el("select");
        sel.appendChild(el("option", { value: "" }, "–"));
        for (const [v, l] of werte) sel.appendChild(el("option", { value: v }, l));
        if (aktuell && !werte.some(([v]) => v === aktuell)) sel.appendChild(el("option", { value: aktuell }, aktuell));
        sel.value = aktuell ?? "";
        sel.addEventListener("change", () => onSet(sel.value || null));
        deaktiv.push(sel);
        return sel;
      };
      if (art === "kt") {
        abschnitt("Transportdaten");
        zeile("Transportart", "ktArt", auswahl(Object.entries(KT_TRANSPORTART_LABEL), k.d.ktArt, (v) => setze({ ktArt: v as KtTransportArt | null })));
        zeile("Behandlung", "behandlung", auswahl(KT_BEHANDLUNGEN.map((b) => [b, b]), k.d.behandlung, (v) => setze({ behandlung: v ?? "" })));
        zeile(
          "Transportmittel",
          "transportmittel",
          knopfleiste<"einfach" | "qualifiziert">(
            [
              ["einfach", "einfacher KT"],
              ["qualifiziert", "qualifizierter KT"],
            ],
            k.d.transportmittel ?? null,
            (v) => setze({ transportmittel: v }),
          ),
        );
        zeile(
          "Bis zum Fahrzeug",
          "gehfaehig",
          knopfleiste<"ja" | "nein">(
            [
              ["ja", "gehfähig"],
              ["nein", "nicht gehfähig"],
            ],
            k.d.gehfaehig === true ? "ja" : k.d.gehfaehig === false ? "nein" : null,
            (v) => setze({ gehfaehig: v === "ja" }),
          ),
        );
      }
      abschnitt("Abrechnung");
      if (art === "kt")
        zeile(
          "Transportauftrag",
          "auftrag",
          knopfleiste<"ja" | "nein" | "einrichtung">(
            (Object.entries(KT_AUFTRAG_LABEL) as ["ja" | "nein" | "einrichtung", string][]).map(([v, l]) => [v, l]),
            k.d.auftrag ?? null,
            (v) => setze({ auftrag: v }),
          ),
        );
      zeile("Krankenkasse", "kasse", auswahl(KT_KASSEN.map((x) => [x, x]), k.d.kasse, (v) => setze({ kasse: v ?? "" })));
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
    const org = { KTR: "rk", KTA: "asb", KTx: "egal" }[k.d.art];
    const passende = ktCodes().filter((c) => {
      if (art === "sek") return c.gruppe === "SEK";
      const o = ktCodeDef(c.code)?.bed.org;
      return c.gruppe === "KT" && (!o || o === org);
    });
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
    // Kein (eindeutiger) Code im Codesatz für diese Angaben: deutlich zeigen statt raten
    if (!k.d.code && k.d.lage) {
      const km = k.d.von && k.d.nach ? distanceM(k.d.von, k.d.nach) / 1000 : 0;
      const f = codeFehlt(k.d, km);
      if (f)
        ziel.append(
          el("div", { class: "kt-lbl" }),
          el(
            "div",
            { class: "kt-codefehlt" },
            f.fehler === "keiner"
              ? `Im Codesatz ist für diese Angaben kein Code hinterlegt (${bedText(f.bed)}). Bitte den Codesatz ergänzen (Einstellungen → Einsatzcodes & Abfrage → KT/SEK-Codes).`
              : `Mehrere Codes passen gleich gut: ${f.kandidaten.join(", ")} – der Codesatz ist nicht eindeutig.`,
          ),
        );
    }

    for (const x of deaktiv) x.disabled = !darf;
    datenBox.appendChild(neu ? karten : grid);
    if (k.status === "aufnahme") {
      const b = el("button", { class: "btn primary kt-anlegen" }, "Auftrag anlegen");
      b.disabled = !darf;
      b.addEventListener("click", () => fehler(sim.call("ktAnlegen", k.id)));
      datenBox.appendChild(b);
    }
  }


  /** Neue Ansicht: die nächste offene Frage der Abfrage (Reihenfolge aus dem Codesatz) */
  function naechsteFrage(art: Art): HTMLElement {
    const box = el("div", { class: "kt-naechste" });
    const liste = ktAbfrage()
      .filter((q) => q.aktiv !== false && q.text.trim())
      .map((q) => ({ q, id: gespraechsFeld(q) }))
      .filter((x) => {
        const f = KT_FRAGEN.find((y) => y.id === x.id);
        if (!f) return false;
        if (art === "kt") return !f.sek;
        return !NUR_KT.has(x.id);
      });
    // neue Angaben, die ein eigener Codesatz (noch) nicht fragt, hinten anhängen
    for (const id of ["ktArt", "behandlung", "gehfaehig", "transportmittel", "auftrag", "kasse"]) {
      if (art === "sek" && NUR_KT.has(id)) continue;
      if (liste.some((x) => x.id === id)) continue;
      const text = ktFrageText(id);
      if (text) liste.push({ q: { id, text, aktiv: true }, id });
    }
    const offen = liste.filter((x) => !ktFeldFertig(k, x.id));
    const fertig = liste.length - offen.length;
    const n = offen[0];
    const kopf = el("div", { class: "kt-naechste-kopf" });
    kopf.append(el("span", {}, n ? "Nächste Frage" : "Abfrage"), el("span", { class: "muted" }, `${fertig} von ${liste.length} erledigt`));
    box.appendChild(kopf);
    if (!n) {
      box.appendChild(el("div", { class: "kt-naechste-text" }, "✓ Alles gefragt – Angaben prüfen und den Auftrag anlegen."));
      return box;
    }
    const zeile = el("div", { class: "kt-naechste-zeile" });
    zeile.appendChild(el("div", { class: "kt-naechste-text" }, n.q.text));
    const f = KT_FRAGEN.find((y) => y.id === n.id)!;
    const fragen = el("button", { class: "btn small primary", type: "button", title: "Diese Frage stellen" }, "🗨 Fragen");
    fragen.addEventListener("click", () => {
      gefragtVon(k.id).add(n.id);
      void stelle(n.q.text, f);
    });
    const ok = el("button", { class: "btn small", type: "button", title: "Als erledigt markieren (schon bekannt oder nicht nötig)" }, "✓ erledigt");
    ok.addEventListener("click", () => {
      gefragtVon(k.id).add(n.id);
      datenKey = "";
      refresh();
    });
    zeile.append(fragen, ok);
    box.appendChild(zeile);
    return box;
  }

  function refresh(): void {
    const a = k.anruf;
    const dk = JSON.stringify([k.d, k.status, a?.status, a?.angenommenVon?.pid, abfrageAnsicht(), [...gefragtVon(k.id)], a?.gespraech.length]);
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
    const hatteFokus = !!document.activeElement?.closest?.(".fz-suche") && dispoBox.contains(document.activeElement);
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
      info.innerHTML = `<b data-dienstfz="${esc(fz.id)}">${esc(fz.funkrufname)}</b> <span class="muted">${typHtml(fz)} · ${esc(sim.statusDef(fz.status).name)}</span>${dienstHtml(fz)}${
        nef ? ` + <b data-dienstfz="${esc(nef.id)}">${esc(nef.funkrufname)}</b> <span class="muted">NEF · ${esc(sim.statusDef(nef.status).name)}</span>` : ""
      }${plan && plan.fahrten.length > 1 ? `<div class="muted">${plan.fahrten.length} Fahrten: ${fahrten}</div>` : ""}${
        plan && !plan.aktiv && plan.losUm ? `<div class="kt-losum">rückt automatisch um <b>${hhmm(plan.losUm)}</b> aus</div>` : ""
      }`;
      dispoBox.appendChild(info);
      if (k.status === "vorgemerkt") {
        if (plan && !plan.aktiv) zeile.appendChild(knopf("Jetzt losschicken", "primary", () => sim.call("ktSchicken", fz.id)));
        zeile.appendChild(knopf("Vormerkung lösen", "", () => sim.call("ktLoesen", k.id)));
      }
      if (k.status === "unterwegs" && plan?.aktiv) zeile.appendChild(knopf("Storno über Funk", "danger-text", () => sim.call("ktFunkStorno", fz.id), "Fahrzeug ohne Patient bricht alle seine Fahrten ab"));
      if (plan?.fruehFrage === k.id) {
        const f = el("div", { class: "kt-frueh" });
        f.innerHTML = `<b>${esc(fz.funkrufname)}</b> ist zu früh am Abholort – warten oder frei melden? <span class="muted">(auch über Funk)</span>`;
        const fb = el("span", { class: "row-btns" });
        fb.append(knopf("Warten", "", () => sim.call("ktFrueh", fz.id, "warten"), "Wartet, bis der Patient fertig ist"), knopf("Frei melden", "", () => sim.call("ktFrueh", fz.id, "frei"), "Fährt zur Dienststelle, Transport wieder undisponiert"));
        f.appendChild(fb);
        dispoBox.appendChild(f);
      }
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
    // Suche über alle Fahrzeuge (Funkrufname auch ohne „/“, Wache, Typ)
    const suche = el("input", { type: "search", class: "fz-suche", placeholder: "Fahrzeug suchen (z. B. 75001, Krems, SKTW) …" }) as HTMLInputElement;
    suche.value = ktSuche.get(k.id) ?? "";
    dispoBox.append(suche, liste);
    if (hatteFokus) {
      suche.focus();
      suche.setSelectionRange(suche.value.length, suche.value.length);
    }
    liste.innerHTML = `<div class="muted">Fahrzeiten werden berechnet …</div>`;
    const vs = await sim.ktVorschlaege(k.id);
    if (lauf !== dispoLauf) return;
    const sek = artVon(k.d) === "sek";
    const blau = codeInfo(k.d.code).sondersignal;
    let alleVs: KtVorschlag[] | null = null;
    const reihe = (v: KtVorschlag) => {
      const r = el("div", { class: `kt-vs${v.ersatz ? " ersatz" : ""}`, "data-kt-fz": v.fz.id });
      const los = v.losSpaetestens ? `los spätestens ${hhmm(v.losSpaetestens)}` : "";
      const zuSpaet = v.losSpaetestens !== null && v.losSpaetestens < sim.state.zeit;
      r.innerHTML = `<span class="kt-vs-info">${statusChip(v.fz)} <b data-dienstfz="${esc(v.fz.id)}">${esc(v.fz.funkrufname)}</b> <span class="muted">${typHtml(v.fz)} · ${esc(v.fz.kurzname || v.fz.stationName)}</span>${dienstHtml(v.fz)}${
        v.begleit ? ` + <b data-dienstfz="${esc(v.begleit.id)}">${esc(v.begleit.funkrufname)}</b> <span class="muted">NEF</span>` : ""
      } <span class="kt-eta">${v.sekunden === null ? "?" : `${Math.round(v.sekunden / 60)} min`}</span> <span class="${zuSpaet ? "alert-text" : "muted"}">${esc(los)}</span>${
        v.ersatz ? ` <span class="kt-ersatz-chip">Ersatz</span>` : ""
      }${v.hinweis ? ` <span class="muted">· ${esc(v.hinweis)}</span>` : ""}</span>`;
      const btns = el("span", { class: "row-btns" });
      const frei = !v.fz.kt && sim.verfuegbar(v.fz);
      const bId = v.begleit?.id ?? null;
      if (frei)
        btns.appendChild(
          knopf(
            "Alarmieren",
            "primary",
            async () => {
              await sim.call("ktVormerken", k.id, v.fz.id, "neu", bId);
              await sim.call("ktSchicken", v.fz.id);
            },
            "Fährt sofort los",
          ),
        );
      btns.appendChild(knopf(v.fz.kt ? "Als nächste Fahrt" : "Vormerken", "", () => sim.call("ktVormerken", k.id, v.fz.id, "neu", bId), v.fz.kt ? "Nach seinen anderen Fahrten" : "Fährt zur richtigen Zeit selbst los"));
      // Mehrfachtransport: dazu, solange noch kein Patient an Bord ist (nicht mit Blaulicht oder Notarzt)
      const plan = v.fz.kt;
      const anBord = plan?.aktiv && (plan.fahrten[0] ?? []).some((x) => sim.ktAuftrag(x)?.status === "anBord");
      if (plan && !blau && !bId && !anBord)
        btns.appendChild(knopf("Mehrfachtransport", "", () => sim.call("ktVormerken", k.id, v.fz.id, "sammel"), "Zusätzlich mitnehmen – das Fahrzeug fährt die kürzeste Reihenfolge"));
      r.appendChild(btns);
      return r;
    };
    // je Fahrzeugtyp höchstens drei, damit z. B. viele Hubschrauber den SNAW nicht verdrängen
    const begrenzt = (l: KtVorschlag[], max: number) => {
      const n = new Map<string, number>();
      return l
        .filter((v) => {
          const c = (n.get(v.fz.rmTyp) ?? 0) + 1;
          n.set(v.fz.rmTyp, c);
          return c <= 3;
        })
        .slice(0, max);
    };
    const zeigen = async () => {
      const q = suche.value.trim();
      ktSuche.set(k.id, q);
      liste.innerHTML = "";
      if (q) {
        if (!alleVs) {
          liste.innerHTML = `<div class="muted">Suche …</div>`;
          alleVs = await sim.ktVorschlaege(k.id, true);
          if (lauf !== dispoLauf || suche.value.trim() !== q) return;
          liste.innerHTML = "";
        }
        const treffer = alleVs.filter((v) => fzPasst(v.fz, q)).sort((a, b) => (a.sekunden ?? 1e9) - (b.sekunden ?? 1e9));
        const gefunden = new Set(treffer.map((v) => v.fz.id));
        for (const v of treffer.slice(0, 30)) liste.appendChild(reihe(v));
        // im Notfalleinsatz: nur zur Info
        for (const f of Object.values(sim.state.fahrzeuge)
          .filter((f) => !gefunden.has(f.id) && fzPasst(f, q))
          .slice(0, 10)) {
          const r = el("div", { class: "kt-vs ersatz" });
          r.innerHTML = `<span class="kt-vs-info">${statusChip(f)} <b>${esc(f.funkrufname)}</b> <span class="muted">${typHtml(f)} · ${esc(f.kurzname || f.stationName)} · ${f.einsatzId ? "im Notfalleinsatz" : "nicht verfügbar"}</span></span>`;
          liste.appendChild(r);
        }
        if (!liste.childElementCount) liste.appendChild(el("div", { class: "muted" }, "Kein Fahrzeug gefunden."));
        return;
      }
      // Vorschlag: passende zuerst (Einsatzmittelvorschlag, dann Fahrzeit), danach Ersatz – eine Liste
      const passend = begrenzt(vs.filter((v) => !v.ersatz), 8);
      const ersatz = begrenzt(vs.filter((v) => v.ersatz), 6);
      liste.appendChild(
        el(
          "div",
          { class: `kt-vs-titel${passend.length ? "" : " warn"}` },
          passend.length ? (sek ? `Vorschlag (${ktCode(k.d.code)?.name ?? k.d.code})` : "Vorschlag") : sek ? "Kein passendes S-Fahrzeug frei – Ersatz oder suchen" : "Kein KTW frei – Ersatz oder suchen",
        ),
      );
      const best = passend[0];
      const zuSpaet = (v: KtVorschlag) => v.losSpaetestens !== null && v.losSpaetestens < sim.state.zeit;
      if (passend.length && (passend.every(zuSpaet) || (!!best && k.d.sofort && (best.sekunden ?? 1e9) > 30 * 60)))
        liste.appendChild(el("div", { class: "kt-vs-titel warn" }, "Das passende Fahrzeug ist weit weg – Ersatz prüfen"));
      for (const v of [...passend, ...ersatz]) liste.appendChild(reihe(v));
      if (!vs.length) liste.appendChild(el("div", { class: "muted" }, "Kein passendes Fahrzeug verfügbar – über die Suche ist jedes Fahrzeug wählbar."));
    };
    suche.addEventListener("input", () => void zeigen());
    suche.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        suche.value = "";
        void zeigen();
      }
    });
    await zeigen();
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
    const pk = JSON.stringify([k.status, k.fz, k.begleit, k.d.von, k.d.nach, k.d.code, k.d.sek, fz?.status, fz?.kt?.fahrten, fz?.kt?.losUm, fz?.kt?.aktiv, fz?.kt?.fruehFrage, nef?.status]);
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
