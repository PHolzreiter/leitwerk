/**
 * Einsatzmaske (Notfall) und KT-Maske (Krankentransport/Überstellung) als eigene Fenster.
 * Sie zeigen, was in der Einsatzliste (oder auf der Karte) ausgewählt ist.
 */
import { nummerAus } from "../../sim/rufnummer";
import { PARTNER, PARTNER_ARTEN, partnerNoetig } from "../../sim/partner";
import { exportKnopf } from "../gespraechExport";
import { HOSPITAL_FLAGS, HOSPITAL_FLAG_LABEL, type HospitalFlag } from "../../data/model";
import { store } from "../../data/store";
import { findCode, hasCodes, searchCodes, type Einsatzcode } from "../../sim/codes";
import { infoFreitext, sim, type Einsatz } from "../../sim/engine";
import { mp } from "../../net/mehrspieler";
import { distanceM } from "../../sim/geo";
import { KATEGORIE_LABEL } from "../../sim/settings";
import { el, esc, toast } from "../dom";
import { ktMaske } from "../ktView";
import { panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, funkRufen, karteWaehlen, karteZeigen, onAuswahl, waehle } from "../ws/auswahl";
import { addressInput, crewHtml, fehlerZeigen, minuten, statusChip, stufeFarbe, uhr } from "./teile";

/** Einsatzmaske für einen Einsatz bauen */
export function einsatzMaske(e: Einsatz): { root: HTMLElement; refresh(): void } {
  const root = el("div", { class: "mask" });

  const head = el("div", { class: "mask-head" });
  root.appendChild(head);

  // Anruf: kurzer Hinweis, Gespräch und Abfrage stehen im Abfrage-Fenster
  const anrufHinweis = el("div", { class: "mask-anruf-hinweis" });
  root.appendChild(anrufHinweis);

  // Meldung
  const meld = el("div", { class: "mask-box meldung" });
  meld.innerHTML = `<div class="box-title">Meldung</div><div class="meld-text">${esc(e.meldung.text)}</div>
    <div class="muted">Gemeldete Adresse: <b class="meld-adr">${esc(e.meldung.adresse)}</b></div>`;
  const meldActions = el("div", { class: "row-btns" });
  const btnUse = el("button", { class: "btn small" }, "Adresse suchen");
  const btnRueck = el("button", { class: "btn small" }, "Rückruf beim Anrufer");
  meldActions.append(btnUse, btnRueck);
  meld.appendChild(meldActions);
  const rueckOut = el("div", { class: "rueck muted" });
  meld.appendChild(rueckOut);
  root.appendChild(meld);
  meld.hidden = !!e.anruf;

  // Code
  // Aufnahme (Code, Einsatzort, Informationen) kompakt in einem Kasten – das füllt der Calltaker
  const aufBox = el("div", { class: "mask-box mask-auf" });
  const aufZeile = (label: string, ...inhalt: HTMLElement[]) => {
    const feld = el("div", { class: "auf-feld" });
    feld.append(...inhalt);
    aufBox.append(el("div", { class: "auf-lbl" }, label), feld);
  };
  const codeInput = el("input", { type: "text", class: "code-suche", placeholder: "🔍 Code / Stichwort" });
  const codeList = el("div", { class: "addr-list", hidden: "" });
  const codeInfo = el("div", { class: "code-info" });
  const codeWrap = el("div", { class: "addr" });
  codeWrap.append(codeInput, codeList);
  aufZeile("Code", codeInfo, codeWrap);
  root.appendChild(aufBox);
  const showCode = () => {
    const c = findCode(e.code ?? undefined);
    if (!c) {
      codeInfo.innerHTML = hasCodes()
        ? `<span class="muted">Noch kein Code.</span>`
        : `<span class="alert-text">Keine Einsatzcodes vorhanden – bitte unter Daten → Einsatzcodes importieren.</span>`;
      return;
    }
    const st = sim.stufeVon(e);
    const details = `${c.gruppenname} · ${st ? `${st.rettungsmittel.replace(/>/g, " › ") || "kein Fahrzeug"}${st.nfsErforderlich ? " · NFS" : ""}${st.notarzt !== "nein" ? " · Notarzt" : ""} · ${st.sondersignal ? "mit" : "ohne"} Sondersignal · ${KATEGORIE_LABEL[st.kategorie]}` : "Stufe nicht zugeordnet"}`;
    codeInfo.title = `${c.code} ${c.beschreibung}\n${details}`;
    codeInfo.innerHTML = `<span class="stufe-badge" style="background:${stufeFarbe(c.stufe)}">${esc(c.stufe)}</span>
      <b>${esc(c.code)}</b> <span class="code-name">${esc(c.beschreibung)}</span>
      <div class="muted code-details">${esc(details)}</div>`;
  };
  codeInput.addEventListener("input", () => {
    const hits = searchCodes(codeInput.value, 40);
    codeList.innerHTML = "";
    for (const c of hits) {
      const it = el("div", { class: "addr-item" });
      it.innerHTML = `<span class="stufe-dot" style="background:${stufeFarbe(c.stufe)}"></span><b>${esc(c.code)}</b> ${esc(c.beschreibung)} <span class="muted">· ${esc(c.stufe)}</span>`;
      it.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        pickCode(c);
      });
      codeList.appendChild(it);
    }
    codeList.hidden = hits.length === 0;
  });
  codeInput.addEventListener("blur", () => setTimeout(() => (codeList.hidden = true), 150));
  const pickCode = (c: Einsatzcode) => {
    codeInput.value = "";
    codeList.hidden = true;
    void fehlerZeigen(sim.call("aktualisiere", e.id, { code: c.code }));
    showCode();
    void refreshSuggestions();
  };
  showCode();

  // Adresse
  const adr = addressInput("Straße Hausnummer Ort …", (o) => {
    void fehlerZeigen(sim.call("aktualisiere", e.id, { adresse: o }));
    karteZeigen(o.lat, o.lon, 15);
    void refreshSuggestions();
  });
  if (e.adresse) adr.input.value = e.adresse.label;
  const adrRow = el("div", { class: "row-btns" });
  const btnPick = el("button", { class: "btn small icon", title: "Einsatzort auf der Karte wählen" }, "🗺");
  btnPick.addEventListener("click", async () => {
    const p = await karteWaehlen("Einsatzort anklicken");
    if (!p) return;
    const label = `Koordinate ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
    adr.input.value = label;
    void fehlerZeigen(sim.call("aktualisiere", e.id, { adresse: { ...p, label } }));
    void refreshSuggestions();
  });
  adrRow.appendChild(btnPick);
  // Bei Notrufen: genannte Adresse übernehmen und Handy-Ortung
  const btnGenannt = el("button", { class: "btn small icon" }, "📍");
  btnGenannt.addEventListener("click", () => {
    adr.input.value = e.meldung.adresse;
    adr.input.dispatchEvent(new Event("input"));
    adr.input.focus();
  });
  const btnOrtung = el("button", { class: "btn small icon", title: "Handy-Ortung anfordern" }, "📡");
  btnOrtung.addEventListener("click", () => void fehlerZeigen(sim.call("ortung", e.id)));
  adrRow.append(btnGenannt, btnOrtung);
  const ortungOut = el("div", { class: "ortung" });
  let ortungKey = "";
  const zeigeOrtung = () => {
    const a = e.anruf;
    btnGenannt.hidden = btnOrtung.hidden = !a;
    if (!a) return;
    btnGenannt.disabled = !a.gespraech.some((m) => m.von === "anrufer");
    btnGenannt.title = btnGenannt.disabled ? "Genannte Adresse – erst wenn der Anrufer etwas gesagt hat" : `Genannte Adresse übernehmen: „${e.meldung.adresse}“`;
    const o = a.ortung;
    btnOrtung.disabled = a.status === "klingelt" || o?.status === "laeuft";
    const key = JSON.stringify(o ?? null);
    if (key === ortungKey) return;
    ortungKey = key;
    ortungOut.innerHTML = "";
    if (!o) return;
    if (o.status === "laeuft") {
      ortungOut.innerHTML = `<span class="muted">📡 Ortung läuft …</span>`;
      return;
    }
    const lat = o.lat!;
    const lon = o.lon!;
    ortungOut.innerHTML = `📡 <b>${esc(o.art ?? "")}</b> ±${o.radius} m <span class="muted">${lat.toFixed(5)}, ${lon.toFixed(5)}</span> `;
    const zeigen = el("button", { class: "btn small" }, "Karte");
    zeigen.addEventListener("click", () => karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16));
    const nehmen = el("button", { class: "btn small primary" }, "Als Einsatzort übernehmen");
    nehmen.addEventListener("click", () => {
      const label = `Ortung ±${o.radius} m (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      adr.input.value = label;
      void fehlerZeigen(sim.call("aktualisiere", e.id, { adresse: { lat, lon, label } }));
      karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16);
      void refreshSuggestions();
    });
    ortungOut.append(zeigen, nehmen);
  };
  const zusatz = el("input", { type: "text", class: "adr-zusatz", placeholder: "Zusatz (Stiege, Stock, Tür …)" });
  zusatz.value = e.zusatz;
  zusatz.addEventListener("change", () => void fehlerZeigen(sim.call("aktualisiere", e.id, { zusatz: zusatz.value })));
  adrRow.classList.add("adr-knoepfe");
  const adrZeile = el("div", { class: "adr-zeile" });
  adrZeile.append(adr.root, adrRow);
  aufZeile("Ort", adrZeile, zusatz, ortungOut);
  zeigeOrtung();

  btnUse.addEventListener("click", () => {
    adr.input.value = e.meldung.adresse;
    adr.input.dispatchEvent(new Event("input"));
    adr.input.focus();
  });
  btnRueck.addEventListener("click", async () => {
    const a = await sim.call("rueckruf", e.id).catch((x) => (toast(String(x.message ?? x), "error"), null));
    rueckOut.innerHTML = `Anrufer bestätigt: <b>${esc(a ?? "")}</b>`;
  });
  if (e.rueckrufGemacht) rueckOut.innerHTML = `Anrufer bestätigt: <b>${esc(e.wahr.adresse)}</b>`;

  // Infos
  const infoRtw = el("textarea", { rows: "1", class: "auf-info", placeholder: "Info an die Fahrzeuge (Zufahrt, Hund …)" });
  infoRtw.value = e.infoRtw;
  // Vorne steht automatisch „m 67J B~ A+“ aus der Abfrage; eigener Text kommt hinter „//“
  infoRtw.addEventListener("input", () => {
    const auto = e.infoAuto ?? "";
    if (!auto || !infoRtw.value.startsWith(auto)) return;
    const rest = infoRtw.value.slice(auto.length);
    if (rest.trim() && !/^\s*\/\//.test(rest)) {
      infoRtw.value = `${auto} // ${rest.trimStart()}`;
      infoRtw.selectionStart = infoRtw.selectionEnd = infoRtw.value.length;
    }
  });
  infoRtw.addEventListener("change", () => {
    const auto = e.infoAuto ?? "";
    // nur „//“ ohne Text dahinter wieder entfernen
    const frei = infoFreitext(infoRtw.value, auto);
    const wert = auto && infoRtw.value.startsWith(auto) ? (frei ? `${auto} // ${frei}` : auto) : infoRtw.value;
    infoRtw.value = wert;
    void fehlerZeigen(sim.call("aktualisiere", e.id, { infoRtw: wert }));
  });
  const infoIntern = el("textarea", { rows: "1", class: "auf-info", placeholder: "Interne Info für die Leitstelle" });
  infoIntern.value = e.infoIntern;
  infoIntern.addEventListener("change", () => void fehlerZeigen(sim.call("aktualisiere", e.id, { infoIntern: infoIntern.value })));
  // Rückrufnummer (Anrufernummer übernehmen)
  const telIn = el("input", { type: "tel", class: "auf-tel", placeholder: "Rückrufnummer" });
  telIn.value = e.telefon ?? "";
  telIn.addEventListener("change", () => void fehlerZeigen(sim.call("aktualisiere", e.id, { telefon: telIn.value.trim() })));
  const telB = el("button", { class: "btn small icon", title: "Rufnummer des Anrufers übernehmen" }, "📞");
  telB.addEventListener("click", () => {
    telIn.value = nummerAus(e.id, true);
    void fehlerZeigen(sim.call("aktualisiere", e.id, { telefon: telIn.value }));
  });
  aufZeile("Rückruf", telIn, telB);
  // Partner-Organisationen (sofort vor Ort, sobald angefordert)
  const partnerZeile = el("div", { class: "partner-zeile" });
  let partnerKey = "";
  const partnerZeigen = () => {
    const a = e.anruf;
    const name = `${findCode(e.code ?? undefined)?.beschreibung ?? ""} ${store.schema?.codes[e.code ?? ""]?.name ?? ""}`;
    const noetig = partnerNoetig(a?.kapitel, a?.antworten ?? {}, name);
    const key = JSON.stringify([e.partner ?? {}, noetig]);
    if (key === partnerKey) return;
    partnerKey = key;
    partnerZeile.innerHTML = "";
    for (const art of PARTNER_ARTEN) {
      const p = PARTNER[art];
      const da = e.partner?.[art];
      const n = noetig.find((x) => x.art === art);
      const b = el("button", { class: `btn small partner-b${da ? " da" : n ? " noetig" : ""}`, type: "button" }, `${da ? "✓ " : ""}${p.symbol} ${p.name}`);
      b.title = da
        ? `${p.name} vor Ort seit ${new Date(da).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`
        : n
          ? `${p.name} erforderlich: ${n.grund} – klicken zum Anfordern`
          : `${p.name} anfordern (ist sofort vor Ort)`;
      b.disabled = !!da;
      b.addEventListener("click", () => void fehlerZeigen(sim.call("partnerAnfordern", e.id, art)));
      partnerZeile.appendChild(b);
    }
  };
  partnerZeigen();
  aufZeile("Partner", partnerZeile);
  aufZeile("Info RTW", infoRtw);
  aufZeile("Intern", infoIntern);

  // Alarmierung
  const alarmBox = el("div", { class: "mask-box" });
  alarmBox.innerHTML = `<div class="box-title">Fahrzeuge</div>`;
  const assigned = el("div", { class: "assigned" });
  const sugg = el("div", { class: "sugg" });
  const alarmRow = el("div", { class: "row-btns" });
  const btnAlarm = el("button", { class: "btn primary" }, "Alarmieren");
  const btnClose = el("button", { class: "btn" }, "Einsatz schließen");
  alarmRow.append(btnAlarm, btnClose);
  alarmBox.append(assigned, sugg, alarmRow);
  root.appendChild(alarmBox);

  // KH / BO / ZO
  const khBox = el("div", { class: "mask-box" });
  khBox.innerHTML = `<div class="box-title">Krankenhaus · Berufungs- und Zielort</div>`;
  const khInfo = el("div", { class: "kh-info" });
  const grundSel = el("select");
  for (const f of HOSPITAL_FLAGS) grundSel.appendChild(el("option", { value: f }, HOSPITAL_FLAG_LABEL[f]));
  const khSel = el("select");
  const btnBook = el("button", { class: "btn small" }, "KH buchen");
  const khRow = el("div", { class: "kh-row" });
  khRow.append(grundSel, khSel, btnBook);
  const boZo = el("div", { class: "muted bozo" });
  const zo = addressInput("Zielort (frei, z. B. für Krankentransport)", (o) => void fehlerZeigen(sim.call("aktualisiere", e.id, { zo: o })));
  khBox.append(khInfo, khRow, boZo, el("div", { class: "fld-label" }, "Zielort manuell"), zo.root);
  root.appendChild(khBox);

  const fillKh = () => {
    const grund = grundSel.value as HospitalFlag;
    const pos = e.adresse ?? e.wahr;
    const list = store
      .list("hospitals")
      .filter((h) => h.abteilungen[grund])
      .map((h) => ({ h, d: distanceM(pos, h) }))
      .sort((a, b) => a.d - b.d);
    khSel.innerHTML = "";
    for (const { h, d } of list) khSel.appendChild(el("option", { value: h.id }, `${h.kurzname || h.name} (${(d / 1000).toFixed(0)} km)`));
    if (list.length === 0) khSel.appendChild(el("option", { value: "" }, "kein KH mit dieser Abteilung"));
  };
  grundSel.addEventListener("change", fillKh);
  btnBook.addEventListener("click", () => {
    if (!khSel.value) return;
    void fehlerZeigen(sim.call("bucheKh", e.id, khSel.value, grundSel.value as HospitalFlag));
    toast("Krankenhaus gebucht");
  });
  if (e.khAnfrage) grundSel.value = e.khAnfrage.abteilung;
  fillKh();

  // Protokoll
  const protBox = el("div", { class: "mask-box" });
  protBox.innerHTML = `<div class="box-title">Protokoll</div>`;
  const prot = el("div", { class: "prot" });
  protBox.appendChild(prot);
  root.appendChild(protBox);
  // Gespräch exportieren (nur bei Einsätzen mit Anruf)
  const exportZeile = el("div", { class: "mask-export" });
  exportZeile.appendChild(exportKnopf("rd", () => e.id));
  exportZeile.hidden = !e.anruf;
  root.appendChild(exportZeile);

  // ---------- dynamische Teile
  let suggestions: Awaited<ReturnType<typeof sim.vorschlaege>> = [];
  const chosen = new Set<string>();
  let suggestFor = "";
  let empfohlen = new Set<string>();
  let gruende: string[] = [];

  const vorschlagKey = () => `${e.adresse?.lat},${e.adresse?.lon},${e.code},${e.fahrzeuge.join("+")}`;
  async function refreshSuggestions() {
    if (!e.adresse) {
      sugg.innerHTML = `<div class="muted">Für Vorschläge zuerst den Einsatzort eingeben.</div>`;
      return;
    }
    const key = vorschlagKey();
    suggestFor = key;
    sugg.innerHTML = `<div class="muted">Fahrzeiten werden berechnet …</div>`;
    const res = await sim.vorschlaege(e.id);
    if (suggestFor !== key) return;
    suggestions = res;
    // Vorauswahl nach Stufe (Rangfolge, NFS, Notarzt; bereits alarmierte zählen mit)
    chosen.clear();
    const emp = sim.empfehlung(e.id, res);
    for (const id of emp.ids) chosen.add(id);
    empfohlen = new Set(emp.ids);
    gruende = emp.gruende;
    // Empfohlene zuerst, damit sie nicht aus der Liste fallen
    suggestions = [...res.filter((r) => empfohlen.has(r.fz.id)), ...res.filter((r) => !empfohlen.has(r.fz.id))];
    renderSuggestions();
  }

  function renderSuggestions() {
    sugg.innerHTML = "";
    if (gruende.length) {
      sugg.appendChild(el("div", { class: "sugg-why" }, gruende.join(" · ")));
    }
    const shown = suggestions.slice(0, 14);
    for (const s of shown) {
      const row = el("label", { class: `sugg-row${s.hinweis ? " blocked" : ""}${empfohlen.has(s.fz.id) ? " rec" : ""}` });
      const cb = el("input", { type: "checkbox" });
      cb.checked = chosen.has(s.fz.id);
      cb.disabled = !!s.hinweis;
      cb.addEventListener("change", () => (cb.checked ? chosen.add(s.fz.id) : chosen.delete(s.fz.id)));
      row.appendChild(cb);
      const info = el("span", { class: "sugg-info" });
      info.innerHTML = `${statusChip(s.fz)} <b>${esc(s.fz.funkrufname)}</b> <span class="muted">${esc(s.fz.rmTyp)} · ${esc(s.fz.stationName)}</span> ${crewHtml(s.fz)}`;
      row.appendChild(info);
      if (s.kt) info.insertAdjacentHTML("beforeend", ` <span class="kt-fz aktiv" title="fährt Krankentransport ohne Patient – wird beim Alarmieren abgezogen, die Transporte sind dann wieder offen">KT – abziehen</span>`);
      row.appendChild(el("span", { class: "sugg-eta" }, s.hinweis ? s.hinweis : minuten(s.sekunden)));
      sugg.appendChild(row);
    }
    if (shown.length === 0) sugg.appendChild(el("div", { class: "muted" }, "Keine freien Fahrzeuge."));
  }

  btnAlarm.addEventListener("click", async () => {
    if (chosen.size === 0) return toast("Bitte Fahrzeuge auswählen", "error");
    const hinweise = await sim.call("alarmiere", e.id, [...chosen]).catch((x) => [String(x.message ?? x)]);
    for (const h of hinweise) toast(h, "error");
    void refreshSuggestions();
  });
  btnClose.addEventListener("click", () => {
    void fehlerZeigen(sim.call("schliesse", e.id, e.fahrzeuge.length ? "durch Leitstelle" : "ohne Fahrzeug (z. B. Telemedizin, Beratung)"));
  });

  // Änderungen anderer Spieler übernehmen (Felder, in denen gerade getippt wird, bleiben)
  let letzterCode = e.code;
  const feld = (i: HTMLInputElement | HTMLTextAreaElement, wert: string) => {
    if (document.activeElement !== i && i.value !== wert) i.value = wert;
  };
  const dyn = {
    refresh() {
      const an = e.anruf;
      anrufHinweis.hidden = !an || an.status === "beendet" || e.zustand === "abgeschlossen";
      const hk = an ? `${an.status}|${an.angenommenVon?.pid}` : "";
      if (an && anrufHinweis.dataset.k !== hk) {
        anrufHinweis.dataset.k = hk;
        const t = { klingelt: "📞 Notruf klingelt", aktiv: "📞 Notrufgespräch läuft", gehalten: "⏸ Anrufer wird gehalten", verpasst: "📵 Verpasster Anruf", beendet: "" }[an.status];
        anrufHinweis.innerHTML = `<span>${t}${an.angenommenVon && mp.aktiv ? ` · ${esc(an.angenommenVon.pid === mp.ich.pid ? "du" : an.angenommenVon.name)}` : ""}</span>`;
        const knopf = el("button", { class: "btn small" }, "Abfrage ›");
        knopf.addEventListener("click", () => {
          waehle("einsatz", e.id, { maske: false, karte: false });
          panelZeigen("abfrage");
        });
        anrufHinweis.appendChild(knopf);
      }
      meld.hidden = !!e.anruf;
      zeigeOrtung();
      if (e.code !== letzterCode) {
        letzterCode = e.code;
        showCode();
      }
      if (e.adresse) feld(adr.input, e.adresse.label);
      // Adresse, Code oder Fahrzeuge von einem anderen Spieler geändert: Vorschläge neu berechnen
      if (e.adresse && vorschlagKey() !== suggestFor) void refreshSuggestions();
      feld(zusatz, e.zusatz);
      feld(telIn, e.telefon ?? "");
      partnerZeigen();
      feld(infoRtw, e.infoRtw);
      feld(infoIntern, e.infoIntern);
      if (e.zo) feld(zo.input, e.zo.label);
      const c = findCode(e.code ?? undefined);
      head.innerHTML = `<span class="stufe-badge big" style="background:${stufeFarbe(c?.stufe)}">${esc(c?.stufe ?? "ohne Code")}</span>
        <div><div class="mask-nr">${esc(e.nummer)}</div><div class="muted">Eingang ${uhr(e.erstellt)} · ${Math.round((sim.state.zeit - e.erstellt) / 60000)} min · ${{ neu: "neu", offen: "in Bearbeitung", laufend: "laufend", abgeschlossen: "abgeschlossen" }[e.zustand]}</div></div>`;
      meld.classList.toggle("alert", e.adressePruefen);
      // zugeordnete Fahrzeuge + offene Nachforderungen
      assigned.innerHTML = "";
      for (const n of e.nachforderungen ?? []) {
        if (n.erledigt) continue;
        assigned.appendChild(el("div", { class: "nachforderung" }, `⚠ Nachforderung von ${n.von}: ${n.art === "NA" ? (n.anzahl > 1 ? `${n.anzahl} Notärzte` : "Notarzt") : n.art === "BIT" ? "BIT (Patient zu schwer für die Trage)" : `${n.anzahl} weitere${n.anzahl > 1 ? "" : "s"} Rettungsmittel`}`));
      }
      for (const id of e.fahrzeuge) {
        const fz = sim.state.fahrzeuge[id];
        if (!fz) continue;
        const row = el("div", { class: "as-row" });
        const imEinsatz = fz.einsatzId === e.id;
        row.innerHTML = `${statusChip(fz)} <b>${esc(fz.funkrufname)}</b> <span class="muted">${esc(fz.rmTyp)} · ${esc(sim.statusDef(fz.status).name)}${imEinsatz ? "" : " (frei)"}</span> ${crewHtml(fz)}`;
        if (imEinsatz) {
          const r = el("button", { class: "btn small", title: `${fz.funkrufname} über Funk rufen` }, "📻");
          r.addEventListener("click", () => {
            panelZeigen("funk");
            setTimeout(() => funkRufen(fz.id), 60);
          });
          row.appendChild(r);
          const unterwegs = fz.phase === "ausruecken" || fz.phase === "anfahrt" || fz.phase === "routing";
          const b = el("button", { class: "btn small" }, unterwegs ? "Storno" : "freigeben");
          b.title = unterwegs ? "Storno über Funk – Fahrzeug rückt ein" : "Fahrzeug aus dem Einsatz freigeben";
          b.addEventListener("click", () => void fehlerZeigen(sim.call(unterwegs ? "storno" : "entlasse", fz.id)));
          row.appendChild(b);
        }
        assigned.appendChild(row);
      }
      // KH
      const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
      khInfo.innerHTML = e.kh
        ? `<div>Gebucht: <b>${esc(h?.name ?? e.kh.hospitalId)}</b></div><div class="muted">Grund: ${esc(HOSPITAL_FLAG_LABEL[e.kh.grund])} · durch ${e.kh.durch === "rtw" ? "RTW" : "Leitstelle"} · ${uhr(e.kh.zeit)}</div>`
        : e.khAnfrage
          ? `<div class="alert-text">${esc(e.khAnfrage.von)} erbittet KH-Buchung: <b>${esc(HOSPITAL_FLAG_LABEL[e.khAnfrage.abteilung])}</b></div>`
          : `<div class="muted">Noch kein Krankenhaus gebucht.</div>`;
      khBox.classList.toggle("alert", !!e.khAnfrage);
      boZo.innerHTML = `BO: ${esc(e.bo?.label ?? "–")}<br>ZO: ${esc(e.zo?.label ?? "–")}`;
      // Protokoll
      prot.innerHTML = e.protokoll
        .slice()
        .reverse()
        .map((p) => `<div><span class="muted">${uhr(p.zeit)}</span> ${esc(p.text)}${p.von ? ` <span class="prot-von">${esc(p.von)}</span>` : ""}</div>`)
        .join("");
      btnAlarm.disabled = e.zustand === "abgeschlossen";
    },
  };
  dyn.refresh();
  void refreshSuggestions();
  return { root, refresh: () => dyn.refresh() };
}


// ---------------------------------------------------------------- Fenster

function maskenFenster(ctx: PanelKontext, art: "einsatz" | "kt") {
  const root = el("div", { class: "pl maske" });
  let fuer: string | null = null;
  let obj: unknown = null;
  let dyn: { refresh(): void } | null = null;

  const leer = (text: string) => {
    fuer = null;
    obj = null;
    dyn = null;
    root.innerHTML = `<div class="muted pad mask-leer">${text}</div>`;
    ctx.setzeTitel(art === "einsatz" ? "Einsatzmaske" : "KT-Maske");
  };

  const zeigen = () => {
    const a = auswahl();
    if (art === "einsatz") {
      const e = a.art === "einsatz" && a.id ? sim.einsatz(a.id) : undefined;
      if (!e) {
        if (!fuer) leer("Einen Einsatz in der Einsatzliste oder auf der Karte anklicken.");
        return;
      }
      if (fuer === e.id && obj === e) return dyn?.refresh();
      fuer = e.id;
      obj = e;
      root.innerHTML = "";
      const m = einsatzMaske(e);
      root.appendChild(m.root);
      dyn = m;
      ctx.setzeTitel(`Einsatz ${e.nummer}`);
    } else {
      const k = a.art === "kt" && a.id ? sim.ktAuftrag(a.id) : undefined;
      if (!k) {
        if (!fuer) leer("Einen Krankentransport oder eine Überstellung in der Einsatzliste anklicken.");
        return;
      }
      if (fuer === k.id && obj === k) return dyn?.refresh();
      fuer = k.id;
      obj = k;
      root.innerHTML = "";
      const m = ktMaske(k, {
        flyTo: () => undefined,
        abfrage: (id) => {
          waehle("kt", id, { maske: false, karte: false });
          panelZeigen("abfrage");
        },
      });
      root.appendChild(m.root);
      dyn = m;
      ctx.setzeTitel(`${k.d.sek || k.d.code?.startsWith("SEK") ? "Überstellung" : "KT"} ${k.nummer}`);
    }
  };

  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      zeigen();
    }, 400);
  };
  const aus = [
    sim.onChange(spaeter),
    onAuswahl((a) => {
      if (a.art === art || (!a.art && !a.id)) zeigen();
    }),
  ];
  zeigen();
  return { el: root, dispose: () => aus.forEach((f) => f()) };
}

registriere({
  komponente: "einsatz",
  titel: "Einsatzmaske",
  info: "Code, Einsatzort, Fahrzeuge alarmieren, Krankenhaus",
  bereich: "rechts",
  erstellen: (ctx) => maskenFenster(ctx, "einsatz"),
});

registriere({
  komponente: "kt",
  titel: "KT-Maske",
  info: "Krankentransport oder Überstellung aufnehmen und disponieren",
  bereich: "rechts",
  erstellen: (ctx) => maskenFenster(ctx, "kt"),
});

// Auswahl: passende Maske nach vorne holen (nur das Fenster, in dem geklickt wurde)
onAuswahl((a, opts, hier) => {
  if (!hier || !a.id || opts.maske === false) return;
  panelZeigen(a.art === "kt" ? "kt" : "einsatz");
});
