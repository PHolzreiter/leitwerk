/**
 * Abfrage-Fenster: links der Anruf (Nummer, Dauer, Ortung, Halten, Stumm, Beenden),
 * in der Mitte das Gespräch, rechts der Leitfaden (Fragen passend zur Anrufart),
 * darunter die Info an die Besatzung.
 */
import { kiBereit } from "../../abfrage/ki";
import { KT_FRAGEN, ktAntwortetGerade, ktFragen, type KtFrage } from "../../abfrage/ktGespraech";
import { mp } from "../../net/mehrspieler";
import { store } from "../../data/store";
import { infoFreitext, sim, type Anruf, type Einsatz } from "../../sim/engine";
import { bereichName, hhmm, type KtAuftrag } from "../../sim/kt";
import { istUeberstellung } from "../../sim/ktCodes";
import { el, esc, toast } from "../dom";
import { codeChip } from "../ktView";
import { panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, karteZeigen, onAuswahl, waehle } from "../ws/auswahl";
import { liveSammler, liveText, onLive } from "./live";
import { notrufTeile, type NotrufTeile } from "./notrufAbfrage";
import { alleAnrufe, anrufAnnehmen, anrufAuflegen, anrufHalten, istMeins, meinGespraech } from "./telefon";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Stumm (Vorbereitung für Sprache): nur Anzeige, gilt für dieses Fenster */
let stumm = false;

type Ziel = { art: "rd"; e: Einsatz } | { art: "kt"; k: KtAuftrag };

/** Welcher Anruf wird gezeigt: mein laufendes Gespräch, sonst der ausgewählte Auftrag (wenn er einen Anruf hat) */
function zielFinden(): Ziel | null {
  const mein = meinGespraech();
  if (mein) {
    if (mein.art === "rd") {
      const e = sim.einsatz(mein.id);
      if (e) return { art: "rd", e };
    } else {
      const k = sim.ktAuftrag(mein.id);
      if (k) return { art: "kt", k };
    }
  }
  const a = auswahl();
  if (a.art === "einsatz" && a.id) {
    const e = sim.einsatz(a.id);
    if (e?.anruf) return { art: "rd", e };
  }
  if (a.art === "kt" && a.id) {
    const k = sim.ktAuftrag(a.id);
    if (k?.anruf) return { art: "kt", k };
  }
  return null;
}

function erstellen(ctx: PanelKontext) {
  const root = el("div", { class: "pl abfrage-fenster" });
  let ziel: Ziel | null = null;
  let teil: { refresh(): void; dispose(): void } | null = null;

  function aufbauen(): void {
    teil?.dispose();
    teil = null;
    root.innerHTML = "";
    if (!ziel) {
      root.appendChild(leer());
      return;
    }
    teil = ziel.art === "rd" ? notrufAnsicht(root, ziel.e) : ktAnsicht(root, ziel.k);
  }

  function leer(): HTMLElement {
    const box = el("div", { class: "abf-leer" });
    const gehalten = alleAnrufe().filter((x) => x.anruf.status === "gehalten" && istMeins(x.anruf));
    const klingelt = alleAnrufe().filter((x) => x.anruf.status === "klingelt");
    box.innerHTML = `<div class="abf-leer-icon">☎</div><b>Kein Gespräch</b><div class="muted">Nimm im Telefon einen Anruf an – dann erscheinen hier Gespräch und Leitfaden.</div>`;
    const knoepfe = el("div", { class: "row-btns" });
    for (const x of [...klingelt.slice(0, 2), ...gehalten.slice(0, 3)]) {
      const b = el("button", { class: `btn small${x.anruf.status === "klingelt" ? " primary" : ""}` }, `${x.anruf.status === "klingelt" ? "Annehmen" : "Zurückwechseln"}: ${x.nummer}`);
      b.addEventListener("click", () => void anrufAnnehmen(x.art, x.id));
      knoepfe.appendChild(b);
    }
    if (knoepfe.childElementCount) box.appendChild(knoepfe);
    return box;
  }

  function pruefen(): void {
    const neu = zielFinden();
    const altId = ziel ? (ziel.art === "rd" ? ziel.e.id : ziel.k.id) : null;
    const neuId = neu ? (neu.art === "rd" ? neu.e.id : neu.k.id) : null;
    // Objekte können ersetzt werden (Spiegel): neu aufbauen, wenn sich das Objekt geändert hat
    const altObj = ziel ? (ziel.art === "rd" ? ziel.e : ziel.k) : null;
    const neuObj = neu ? (neu.art === "rd" ? neu.e : neu.k) : null;
    if (altId !== neuId || altObj !== neuObj) {
      ziel = neu;
      aufbauen();
    } else if (!ziel) {
      // leere Ansicht: Knöpfe aktuell halten
      root.innerHTML = "";
      root.appendChild(leer());
    } else teil?.refresh();
    const a = ziel ? (ziel.art === "rd" ? ziel.e.anruf : ziel.k.anruf) : null;
    ctx.setzeBadge(a?.status === "aktiv" ? "●" : null, "klingelt");
  }

  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      pruefen();
    }, 250);
  };
  const uhr = window.setInterval(() => teil?.refresh(), 1000);
  const aus = [sim.onChange(spaeter), onAuswahl(() => pruefen()), mp.onChange(spaeter)];
  pruefen();
  return {
    el: root,
    dispose: () => {
      window.clearInterval(uhr);
      aus.forEach((f) => f());
      teil?.dispose();
    },
  };
}

// ---------------------------------------------------------------- linke Spalte (gemeinsam)

function anrufSpalte(
  typ: "notruf" | "kt" | "sek",
  nummer: string,
  telefon: string,
  a: () => Anruf | null,
  art: "rd" | "kt",
  id: string,
  extra: HTMLElement[],
): { el: HTMLElement; refresh(): void } {
  const spalte = el("div", { class: "abf-links" });
  const kopf = el("div", { class: `abf-typ typ-${typ}` });
  kopf.innerHTML = `<span>${typ === "notruf" ? "Notruf 144" : typ === "sek" ? "Überstellung" : "KT-Hotline"}</span><b>${esc(telefon)}</b><span class="muted">${esc(nummer)}</span>`;
  const status = el("div", { class: "abf-status" });
  const knoepfe = el("div", { class: "abf-knoepfe" });
  spalte.append(kopf, status, knoepfe, ...extra);

  let knopfKey = "";
  const refresh = () => {
    const x = a();
    if (!x) return;
    const t = sim.state.zeit;
    const meins = istMeins(x);
    const wer = x.angenommenVon && mp.aktiv ? (meins ? "du" : x.angenommenVon.name) : "";
    status.innerHTML = `<span class="tel-st ${x.status}">${
      { klingelt: "klingelt", aktiv: "im Gespräch", gehalten: "gehalten", verpasst: "verpasst", beendet: "beendet" }[x.status]
    }</span> <span class="abf-dauer">${x.status === "beendet" ? "" : mmss(t - x.seit)}</span>${wer ? ` <span class="muted">· ${esc(wer)}</span>` : ""}${
      x.status === "gehalten" && x.haltenBis ? `<div class="muted small">legt in ca. ${mmss(x.haltenBis - t)} auf</div>` : ""
    }<div class="muted small">${kiBereit() ? "Anrufer mit KI" : "Anrufer ohne KI (feste Antworten)"}</div>`;
    const key = `${x.status}|${meins}|${stumm}`;
    if (key === knopfKey) return;
    knopfKey = key;
    knoepfe.innerHTML = "";
    const knopf = (label: string, cls: string, fn: () => void, titel = "") => {
      const b = el("button", { class: `btn ${cls}`, title: titel }, label);
      b.addEventListener("click", fn);
      knoepfe.appendChild(b);
      return b;
    };
    if (x.status === "klingelt") knopf("📞 Annehmen", "primary", () => void anrufAnnehmen(art, id));
    if (x.status === "verpasst") knopf("📞 Zurückrufen", "primary", () => void anrufAnnehmen(art, id));
    if (x.status === "aktiv" && meins) knopf("⏸ Halten", "", () => anrufHalten(art, id), "Anrufer in die Warteschleife – bei zu langem Warten legt er auf");
    if (x.status === "gehalten" && meins) knopf("▶ Zurückwechseln", "primary", () => void anrufAnnehmen(art, id));
    if ((x.status === "aktiv" || x.status === "gehalten") && meins) {
      const s = knopf(stumm ? "🔇 Stumm" : "🎙 Mikrofon", stumm ? "warn" : "", () => {
        stumm = !stumm;
        knopfKey = "";
        refresh();
      }, "Für das Sprechen per Mikrofon (kommt später) – stumm geschaltet hört der Anrufer nichts");
      s.classList.toggle("aktiv", stumm);
      knopf("Beenden", "danger", () => anrufAuflegen(art, id));
    }
  };
  refresh();
  return { el: spalte, refresh };
}

// ---------------------------------------------------------------- Notruf

function notrufAnsicht(root: HTMLElement, e: Einsatz): { refresh(): void; dispose(): void } {
  const t: NotrufTeile = notrufTeile(e);
  const telefon = alleAnrufe(true).find((x) => x.id === e.id)?.telefon ?? "";

  // Ortung
  const ortung = el("div", { class: "abf-ortung" });
  const ortKnopf = el("button", { class: "btn small" }, "📡 Ortung");
  ortKnopf.addEventListener("click", () => fehler(sim.call("ortung", e.id)));
  const ortErg = el("div", { class: "abf-ortung-erg" });
  ortung.append(ortKnopf, ortErg);
  let ortKey = "";
  const ortungZeigen = () => {
    const a = e.anruf;
    const o = a?.ortung;
    ortKnopf.disabled = !a || a.status === "klingelt" || o?.status === "laeuft";
    const key = JSON.stringify(o ?? null);
    if (key === ortKey) return;
    ortKey = key;
    ortErg.innerHTML = "";
    if (!o) return;
    if (o.status === "laeuft") {
      ortErg.innerHTML = `<span class="muted">Ortung läuft …</span>`;
      return;
    }
    const lat = o.lat!;
    const lon = o.lon!;
    ortErg.innerHTML = `<div><b>${esc(o.art ?? "")}</b> ±${o.radius} m</div>`;
    const zeigen = el("button", { class: "btn small" }, "Karte");
    zeigen.addEventListener("click", () => karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16));
    const nehmen = el("button", { class: "btn small primary" }, "Als Einsatzort");
    nehmen.addEventListener("click", () => {
      const label = `Ortung ±${o.radius} m (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      fehler(sim.call("aktualisiere", e.id, { adresse: { lat, lon, label } }));
      karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16);
    });
    ortErg.append(zeigen, nehmen);
  };

  const maske = el("button", { class: "btn small" }, "Einsatzmaske ›");
  maske.addEventListener("click", () => waehle("einsatz", e.id));
  const links = anrufSpalte("notruf", e.nummer, telefon, () => e.anruf ?? null, "rd", e.id, [
    el("div", { class: "abf-titel" }, "Ortung"),
    ortung,
    el("div", { class: "abf-titel" }, "Ergebnis"),
    t.codeZeile,
    maske,
    t.aufloesung,
  ]);

  // Mitte: Gespräch
  const mitte = el("div", { class: "abf-mitte" });
  mitte.append(el("div", { class: "abf-titel" }, "Gespräch"), t.verlauf, t.form);

  // Info an RTW (vorne automatisch aus der Abfrage, dahinter eigener Text)
  const info = el("div", { class: "abf-info" });
  const infoFeld = el("textarea", { rows: "2", placeholder: "Info an RTW – z. B. Zufahrt über den Hof, Hund im Haus" });
  infoFeld.value = e.infoRtw;
  infoFeld.addEventListener("input", () => {
    const auto = e.infoAuto ?? "";
    if (!auto || !infoFeld.value.startsWith(auto)) return;
    const rest = infoFeld.value.slice(auto.length);
    if (rest.trim() && !/^\s*\/\//.test(rest)) {
      infoFeld.value = `${auto} // ${rest.trimStart()}`;
      infoFeld.selectionStart = infoFeld.selectionEnd = infoFeld.value.length;
    }
  });
  infoFeld.addEventListener("change", () => {
    const auto = e.infoAuto ?? "";
    const frei = infoFreitext(infoFeld.value, auto);
    const wert = auto && infoFeld.value.startsWith(auto) ? (frei ? `${auto} // ${frei}` : auto) : infoFeld.value;
    infoFeld.value = wert;
    fehler(sim.call("aktualisiere", e.id, { infoRtw: wert }));
  });
  info.append(el("div", { class: "abf-titel" }, "Info an RTW"), infoFeld, el("div", { class: "muted small" }, "Vorne steht automatisch, was die Abfrage ergibt (z. B. „m 67J B~ A+“), eigener Text kommt dahinter."));
  mitte.appendChild(info);

  // Rechts: Leitfaden
  const rechts = el("div", { class: "abf-rechts" });
  rechts.append(el("div", { class: "abf-titel" }, "Leitfaden"), store.schema ? t.abfrage : el("div", { class: "muted pad" }, "Kein Abfrageschema importiert (Daten → Einsatzcodes)."));

  const grid = el("div", { class: "abf-grid" });
  grid.append(links.el, mitte, rechts);
  root.appendChild(grid);

  const refresh = () => {
    links.refresh();
    t.refresh();
    ortungZeigen();
    if (document.activeElement !== infoFeld && infoFeld.value !== e.infoRtw) infoFeld.value = e.infoRtw;
  };
  refresh();
  return { refresh, dispose: () => t.dispose() };
}

// ---------------------------------------------------------------- KT-Hotline / Überstellung

function wertVon(k: KtAuftrag, f: KtFrage): string {
  const d = k.d;
  const s = d.sek;
  const ja = (b: boolean | undefined) => (b ? "ja" : "");
  switch (f.id) {
    case "wer":
      return k.anruf?.gespraech.some((m) => m.von === "anrufer") ? "✓" : "";
    case "patient":
      return [d.patient.name, d.patient.alter !== null ? `${d.patient.alter} J.` : ""].filter(Boolean).join(", ");
    case "von":
      return d.von?.label ?? "";
    case "nach":
      return d.nach?.label ?? "";
    case "termin":
      return d.termin ? hhmm(d.termin) : "";
    case "abholung":
      return d.abholung ? hhmm(d.abholung) : "";
    case "grund":
      return d.grund;
    case "lage":
      return d.lage ? { gehend: "gehfähig", sitzend: "Tragstuhl", liegend: "liegend", rollstuhl: "Rollstuhl" }[d.lage] : "";
    case "begleitung":
      return ja(d.begleitung);
    case "sauerstoff":
      return ja(d.sauerstoff);
    case "infektion":
      return ja(d.infektion);
    case "art":
      return d.art;
    case "telefon":
      return d.telefon;
    case "sofort":
      return d.sofort ? "SOFORT" : "";
    case "arzt":
      return ja(s?.arzt);
    case "monitoring":
      return [s?.monitoring ? "Monitor" : "", s?.beatmet ? "beatmet" : ""].filter(Boolean).join(", ");
    case "stabil":
      return s?.instabil ? "instabil" : "";
    case "inkubator":
      return ja(s?.inkubator);
    case "zusage":
      return s?.zusage ?? "";
    case "gewicht":
      return s?.bit ? "BIT" : "";
    default:
      return "";
  }
}

function ktAnsicht(root: HTMLElement, k: KtAuftrag): { refresh(): void; dispose(): void } {
  const sek = istUeberstellung(k.d) || !!k.wahr?.d?.sek;
  const telefon = alleAnrufe(true).find((x) => x.id === k.id)?.telefon ?? k.d.telefon;
  const ich = () => !!k.anruf && istMeins(k.anruf) && !!k.anruf.angenommenVon;

  // Mitte: Gespräch
  const verlauf = el("div", { class: "anruf-verlauf" });
  const live = el("div", { class: "anruf-msg anrufer live", hidden: "" });
  const form = el("form", { class: "anruf-form" });
  const eingabe = el("input", { type: "text", placeholder: "Frage an den Anrufer … (Enter)" });
  form.append(eingabe, el("button", { class: "btn small primary", type: "submit" }, "Fragen"));
  const zeigeLive = (text: string | null) => {
    live.hidden = !text;
    live.textContent = text ?? "";
    if (text) verlauf.scrollTop = verlauf.scrollHeight;
  };
  const ausLive = onLive((id, text) => id === k.id && zeigeLive(text));
  const stelle = async (text: string, f?: KtFrage) => {
    const l = liveSammler(k.id);
    await ktFragen(k, text, f, l.onToken).catch((e) => toast(String(e.message ?? e), "error"));
    l.fertig();
    refresh();
  };
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t || !ich()) return;
    eingabe.value = "";
    void stelle(t);
  });

  const codeBox = el("div", { class: "abf-code" });
  const maske = el("button", { class: "btn small" }, `${sek ? "Überstellung" : "KT-Maske"} ›`);
  maske.addEventListener("click", () => {
    waehle("kt", k.id);
    panelZeigen("kt");
  });
  const links = anrufSpalte(sek ? "sek" : "kt", k.nummer, telefon, () => k.anruf, "kt", k.id, [el("div", { class: "abf-titel" }, "Code"), codeBox, maske]);

  const mitte = el("div", { class: "abf-mitte" });
  mitte.append(el("div", { class: "abf-titel" }, "Gespräch"), verlauf, form);

  // Hinweise für die Besatzung
  const info = el("div", { class: "abf-info" });
  const infoFeld = el("textarea", { rows: "2", placeholder: sek ? "Hinweise für die Besatzung – z. B. intubiert, 2 Perfusoren, Übergabe an OA …" : "Hinweise für die Besatzung – z. B. 3. Stock ohne Lift, bis zum Auto gehfähig" });
  infoFeld.value = k.d.patient.info;
  infoFeld.addEventListener("change", () => fehler(sim.call("ktSetze", k.id, { patient: { ...k.d.patient, info: infoFeld.value.trim() } })));
  info.append(el("div", { class: "abf-titel" }, "Hinweise für die Besatzung"), infoFeld);
  mitte.appendChild(info);

  // Rechts: Leitfaden
  const rechts = el("div", { class: "abf-rechts" });
  const leitfaden = el("div", { class: "kt-leitfaden" });
  rechts.append(el("div", { class: "abf-titel" }, sek ? "Leitfaden Überstellung" : "Leitfaden Krankentransport"), leitfaden, el("div", { class: "muted small" }, "Die Antworten trägst du in der Maske ein (auch über die 🗨-Knöpfe dort)."));

  const grid = el("div", { class: "abf-grid" });
  grid.append(links.el, mitte, rechts);
  root.appendChild(grid);

  let lfKey = "";
  const leitfadenBauen = () => {
    const a = k.anruf;
    const darf = !!a && a.status === "aktiv" && ich() && !ktAntwortetGerade(k.id);
    const key = JSON.stringify([k.d, darf]);
    if (key === lfKey) return;
    lfKey = key;
    leitfaden.innerHTML = "";
    for (const f of KT_FRAGEN.filter((x) => !x.sek || sek)) {
      const w = wertVon(k, f);
      const r = el("div", { class: `lf-frage${w ? " erledigt" : ""}` });
      const b = el("button", { class: "frag-knopf", type: "button", title: "Diese Frage stellen" }, "🗨");
      b.disabled = !darf;
      b.addEventListener("click", () => void stelle(f.text, f));
      const txt = el("div", { class: "lf-text" });
      txt.innerHTML = `${esc(f.text)}${w ? `<div class="lf-wert">${esc(w)}</div>` : ""}`;
      r.append(b, txt);
      leitfaden.appendChild(r);
    }
  };

  let codeKey = "";
  const refresh = () => {
    links.refresh();
    const a = k.anruf;
    if (a && verlauf.childElementCount - 1 !== a.gespraech.length) {
      verlauf.innerHTML = "";
      for (const m of a.gespraech) {
        const d = el("div", { class: `anruf-msg ${m.von}` });
        d.innerHTML = m.von === "system" ? `<em>${esc(m.text)}</em>` : `<b>${m.von === "anrufer" ? "Anrufer" : esc(m.wer ?? "Leitstelle")}:</b> ${esc(m.text)}`;
        verlauf.appendChild(d);
      }
      verlauf.appendChild(live);
      zeigeLive(liveText(k.id));
      verlauf.scrollTop = verlauf.scrollHeight;
    }
    form.hidden = !(a?.status === "aktiv" && ich());
    eingabe.disabled = ktAntwortetGerade(k.id);
    const ck = `${k.d.code}|${k.d.von?.label}|${k.d.nach?.label}`;
    if (ck !== codeKey) {
      codeKey = ck;
      const b = k.d.nach?.bereich ? ` (${bereichName(k.d.nach.bereich)})` : "";
      codeBox.innerHTML = `${codeChip(k.d.code)}<div class="muted small">${esc(k.d.von?.label ?? "?")} → ${esc(k.d.nach?.label ?? "?")}${esc(b && !k.d.nach?.label.includes(b.slice(2, -1)) ? b : "")}</div>`;
    }
    if (document.activeElement !== infoFeld && infoFeld.value !== k.d.patient.info) infoFeld.value = k.d.patient.info;
    leitfadenBauen();
  };
  refresh();
  return { refresh, dispose: ausLive };
}

registriere({
  komponente: "abfrage",
  titel: "Abfrage",
  info: "Gespräch mit dem Anrufer, Leitfaden, Info an die Besatzung",
  bereich: "rechts",
  einmalig: true,
  erstellen,
});
