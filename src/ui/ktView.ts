/**
 * Krankentransporte: Liste (linke Seite) und Auftragsmaske mit Hotline-Gespräch und Disposition.
 */
import { BEREICHE, bereicheVon } from "../data/model";
import { store } from "../data/store";
import { KT_FRAGEN, ktAntwortetGerade, ktFragen, type KtFrage } from "../abfrage/ktGespraech";
import { kiBereit } from "../abfrage/ki";
import { mp } from "../net/mehrspieler";
import { sim, type SimFahrzeug } from "../sim/engine";
import { bereichName, hhmm, KT_ART_LABEL, KT_LAGE_LABEL, KT_STATUS_LABEL, ktKurz, type KtArt, type KtAuftrag, type KtDaten, type KtLage, type KtOrt } from "../sim/kt";
import { addressInput } from "./opsView";
import { el, esc, toast } from "./dom";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

const STATUS_ORDNUNG: Record<string, number> = { aufnahme: 0, offen: 1, vorgemerkt: 2, unterwegs: 3, anBord: 4, erledigt: 5, storniert: 6 };

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

// ---------------------------------------------------------------- Liste

export function ktListe(container: HTMLElement, deps: { selected(): string | null; select(id: string): void; annehmen(id: string): void }, alle: boolean): void {
  const liste = (sim.state.kt ?? []).filter((k) => alle || (k.status !== "erledigt" && k.status !== "storniert"));
  liste.sort((a, b) => {
    const ka = a.anruf?.status === "klingelt" ? -1 : STATUS_ORDNUNG[a.status];
    const kb = b.anruf?.status === "klingelt" ? -1 : STATUS_ORDNUNG[b.status];
    return ka - kb || (a.d.termin ?? a.eingang) - (b.d.termin ?? b.eingang);
  });
  container.innerHTML = "";
  for (const k of liste) {
    const row = el("div", { class: `kt-row st-${k.status}${k.id === deps.selected() ? " sel" : ""}` });
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const a = k.anruf;
    const tel =
      a && (a.status === "klingelt" || a.status === "verpasst")
        ? `<div class="inc-anruf ${a.status === "klingelt" ? "klingelt" : "verpasst"}">${a.status === "klingelt" ? "📞 KT-Hotline klingelt" : "📵 verpasst"}</div>`
        : a?.status === "aktiv"
          ? `<div class="inc-anruf aktiv">📞 im Gespräch</div>`
          : "";
    const spaet = k.d.termin && ["offen", "vorgemerkt"].includes(k.status) && (k.d.abholung ?? k.d.termin - 45 * 60_000) < sim.state.zeit;
    row.innerHTML = `
      <div class="kt-zeit"><b>${hhmm(k.d.termin)}</b><span class="muted">${k.d.abholung ? `ab ${hhmm(k.d.abholung)}` : ""}</span></div>
      <div class="kt-main">
        <div><b>${esc(k.d.patient.name || "(Aufnahme)")}</b> <span class="kt-lage">${k.d.lage ? esc(ktKurz(k.d).replace(/^.*\(/, "(")) : ""}</span> <span class="kt-art">${esc(k.d.art)}</span>${k.quelle === "dauer" ? ` <span class="muted">· Dauer</span>` : k.quelle === "online" ? ` <span class="muted">· online</span>` : ""}</div>
        <div class="muted">${esc(k.d.von?.label ?? "?")} → ${esc(k.d.nach?.label ?? "?")}</div>
        ${tel}
      </div>
      <div class="kt-st"><span class="kt-status ${k.status}${spaet ? " spaet" : ""}">${esc(KT_STATUS_LABEL[k.status])}</span>${fz ? `<div class="muted">${esc(fz.funkrufname)}</div>` : ""}</div>`;
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
  if (!liste.length) container.innerHTML = `<div class="muted pad">Keine offenen Krankentransporte.</div>`;
}

// ---------------------------------------------------------------- Ortswahl (Krankenhaus + Station oder Adresse)

function ortWahl(wert: KtOrt | null, darf: boolean, onSet: (o: KtOrt) => void): HTMLElement {
  const root = el("div", { class: "kt-ort" });
  const modus = el("select");
  modus.append(el("option", { value: "kh" }, "Krankenhaus"), el("option", { value: "adr" }, "Adresse"));
  modus.value = wert && !wert.khId ? "adr" : "kh";
  const khSel = el("select");
  const beSel = el("select");
  const khs = store.list("hospitals").slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
  khSel.appendChild(el("option", { value: "" }, "– Krankenhaus –"));
  for (const h of khs) khSel.appendChild(el("option", { value: h.id }, h.kurzname || h.name));
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
    datenBox.innerHTML = `<div class="box-title">Transportauftrag</div>`;
    const grid = el("div", { class: "kt-grid" });
    const zeile = (label: string, id: KtFrage["id"] | null, feld: HTMLElement) => {
      const l = el("div", { class: "kt-lbl" });
      const fk = id ? frageKnopf(id) : null;
      if (fk) l.appendChild(fk);
      l.appendChild(document.createTextNode(label));
      grid.append(l, feld);
    };
    const wer = el("div", { class: "muted" }, k.quelle === "hotline" ? (k.anruf?.gespraech.some((m) => m.von === "anrufer") ? "siehe Gespräch" : "–") : k.quelle === "online" ? "Online-Anmeldung" : "Dauerauftrag");
    zeile("Anrufer", "wer", wer);
    // Patient
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
    zeile("Patient", "patient", pat);
    const info = el("input", { type: "text", placeholder: "Kurzinfo, z. B. bis zum Fahrzeug gehfähig" });
    info.value = k.d.patient.info;
    info.addEventListener("change", () => setze({ patient: { ...k.d.patient, info: info.value } }));
    zeile("Info", null, info);
    zeile("Abholort", "von", ortWahl(k.d.von, darf, (o) => setze({ von: o })));
    zeile("Ziel", "nach", ortWahl(k.d.nach, darf, (o) => setze({ nach: o })));
    const zeiten = el("div", { class: "row-btns" });
    const termin = el("input", { type: "time" });
    termin.value = hmFuer(k.d.termin);
    termin.addEventListener("change", () => setze({ termin: zeitAus(termin.value) }));
    const ab = el("input", { type: "time" });
    ab.value = hmFuer(k.d.abholung);
    ab.addEventListener("change", () => setze({ abholung: ab.value ? zeitAus(ab.value) : null }));
    const fkAb = frageKnopf("abholung");
    zeiten.append(termin, el("span", { class: "muted" }, "Abholung"));
    if (fkAb) zeiten.appendChild(fkAb);
    zeiten.append(ab);
    zeile("Termin", "termin", zeiten);
    const grund = el("input", { type: "text", placeholder: "Grund / Diagnose" });
    grund.value = k.d.grund;
    grund.addEventListener("change", () => setze({ grund: grund.value }));
    zeile("Grund", "grund", grund);
    const lage = el("select");
    lage.appendChild(el("option", { value: "" }, "– sitzend oder liegend? –"));
    for (const [v, l] of Object.entries(KT_LAGE_LABEL)) lage.appendChild(el("option", { value: v }, l));
    lage.value = k.d.lage ?? "";
    lage.addEventListener("change", () => setze({ lage: (lage.value || null) as KtLage | null }));
    zeile("Transport", "lage", lage);
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
    const art = el("select");
    for (const [v, l] of Object.entries(KT_ART_LABEL)) art.appendChild(el("option", { value: v }, l));
    art.value = k.d.art;
    art.addEventListener("change", () => setze({ art: art.value as KtArt }));
    zeile("Wunsch", "art", art);
    const tel = el("input", { type: "text", placeholder: "Rückrufnummer" });
    tel.value = k.d.telefon;
    tel.addEventListener("change", () => setze({ telefon: tel.value }));
    zeile("Telefon", "telefon", tel);
    for (const x of [name, alter, g, info, termin, ab, grund, lage, art, tel]) x.disabled = !darf;
    datenBox.appendChild(grid);
    if (k.status === "aufnahme") {
      const b = el("button", { class: "btn primary" }, "Auftrag anlegen");
      b.disabled = !darf;
      b.addEventListener("click", () => fehler(sim.call("ktAnlegen", k.id)));
      datenBox.appendChild(b);
    }
  }

  // ---- Disposition
  let dispoKey = "";
  async function dispoBauen(): Promise<void> {
    dispoBox.innerHTML = `<div class="box-title">Disposition</div>`;
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const knopf = (label: string, cls: string, fn: () => Promise<unknown>) => {
      const b = el("button", { class: `btn small ${cls}` }, label);
      b.addEventListener("click", () => fehler(fn()));
      return b;
    };
    const zeile = el("div", { class: "row-btns" });
    if (fz) {
      const plan = fz.kt;
      const info = el("div", {});
      info.innerHTML = `<b>${esc(fz.funkrufname)}</b> <span class="muted">${esc(fz.rmTyp)} · ${esc(sim.statusDef(fz.status).name)}${plan ? ` · ${plan.fahrten.length} Fahrt(en): ${plan.fahrten.map((f) => f.map((id) => esc(sim.ktAuftrag(id)?.nummer ?? "?")).join(" + ")).join(" → ")}` : ""}</span>`;
      dispoBox.appendChild(info);
      if (k.status === "vorgemerkt") {
        if (plan && !plan.aktiv) zeile.appendChild(knopf("Jetzt losschicken", "primary", () => sim.call("ktSchicken", fz.id)));
        zeile.appendChild(knopf("Vormerkung lösen", "", () => sim.call("ktLoesen", k.id)));
      }
      if (k.status === "unterwegs" && plan?.aktiv) zeile.appendChild(knopf("Storno über Funk (alle Fahrten)", "danger-text", () => sim.call("ktFunkStorno", fz.id)));
    }
    if (["offen", "vorgemerkt", "unterwegs", "aufnahme"].includes(k.status)) zeile.appendChild(knopf("Auftrag stornieren", "danger-text", () => sim.call("ktStorno", k.id, "durch Leitstelle")));
    dispoBox.appendChild(zeile);
    if (k.status !== "offen") return;
    if (!k.d.von) {
      dispoBox.appendChild(el("div", { class: "muted" }, "Für Vorschläge zuerst den Abholort eintragen."));
      return;
    }
    const liste = el("div", { class: "kt-vorschlaege" });
    liste.innerHTML = `<div class="muted">Fahrzeiten werden berechnet …</div>`;
    dispoBox.appendChild(liste);
    const vs = await sim.ktVorschlaege(k.id);
    liste.innerHTML = "";
    for (const v of vs.slice(0, 12)) {
      const r = el("div", { class: "kt-vs" });
      const los = v.losSpaetestens ? `los spätestens ${hhmm(v.losSpaetestens)}` : "";
      const zuSpaet = v.losSpaetestens !== null && v.losSpaetestens < sim.state.zeit;
      r.innerHTML = `<span><b>${esc(v.fz.funkrufname)}</b> <span class="muted">${esc(v.fz.rmTyp)} · ${v.sekunden === null ? "?" : `${Math.round(v.sekunden / 60)} min`}</span> <span class="${zuSpaet ? "alert-text" : "muted"}">${esc(los)}</span>${v.hinweis ? ` <span class="muted">· ${esc(v.hinweis)}</span>` : ""}</span>`;
      const btns = el("span", { class: "row-btns" });
      const frei = !v.fz.kt?.aktiv && sim.verfuegbar(v.fz);
      btns.appendChild(knopf(v.fz.kt ? "Als nächste Fahrt" : "Vormerken", "", () => sim.call("ktVormerken", k.id, v.fz.id, "neu")));
      if (v.fz.kt) btns.appendChild(knopf("Sammelfahrt", "", () => sim.call("ktVormerken", k.id, v.fz.id, "sammel")));
      if (frei && !v.fz.kt)
        btns.appendChild(
          knopf("Jetzt schicken", "primary", async () => {
            await sim.call("ktVormerken", k.id, v.fz.id, "neu");
            await sim.call("ktSchicken", v.fz.id);
          }),
        );
      r.appendChild(btns);
      liste.appendChild(r);
    }
    if (!vs.length) liste.innerHTML = `<div class="muted">Kein KTW verfügbar.</div>`;
  }

  function refresh(): void {
    kopf.innerHTML = `<span class="kt-art big">${esc(k.d.art)}</span><div><div class="mask-nr">${esc(k.nummer)}</div><div class="muted">${{ hotline: "KT-Hotline", online: "Online-Anmeldung", dauer: "Dauerauftrag" }[k.quelle]} · Eingang ${hhmm(k.eingang)} · <b>${esc(KT_STATUS_LABEL[k.status])}</b></div></div>`;
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
    const pk = JSON.stringify([k.status, k.fz, k.d.von, fz?.status, fz?.kt?.fahrten]);
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
