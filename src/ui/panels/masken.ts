/**
 * Einsatzmaske (Notfall) und KT-Maske (Krankentransport/Überstellung) als eigene Fenster.
 * Sie zeigen, was in der Einsatzliste (oder auf der Karte) ausgewählt ist.
 */
import { gesagteAdresse } from "../../abfrage/adresseGesagt";
import { nummerAus } from "../../sim/rufnummer";
import { PARTNER, PARTNER_ARTEN } from "../../sim/partner";
import { ortAnStelle } from "../../data/ortProfile";
import { exportKnopf } from "../gespraechExport";
import { buchungName } from "../../data/klinik";
import { ALTERSGRUPPEN, altersgruppeVon, DRINGLICHKEITEN, dringlichkeitFuer, symptom, symptomAusDiagnose, symptomSuche, zuweisungId, zuweisungLesen, type Altersgruppe, type Dringlichkeit, type Symptom } from "../../data/zuweisung";
import { store } from "../../data/store";
import { findCode, hasCodes, searchCodes, type Einsatzcode } from "../../sim/codes";
import { infoFreitext, PARTNER_PHASE_TEXT, sim, type Einsatz } from "../../sim/engine";
import { mp } from "../../net/mehrspieler";
import { distanceM } from "../../sim/geo";
import { KATEGORIE_LABEL } from "../../sim/settings";
import { el, esc, toast } from "../dom";
import { ktMaske } from "../ktView";
import { panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, funkRufen, karteWaehlen, karteZeigen, onAuswahl, waehle } from "../ws/auswahl";
import { addressInput, crewHtml, fehlerZeigen, fzKlassen, minuten, statusChip, stufeFarbe, uhr, vorgemerktHtml, typHtml, dienstHtml, fzPasst } from "./teile";

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
        : `<span class="alert-text">Keine Einsatzcodes vorhanden – bitte unter Einstellungen → Leitstelle → Einsatzcodes & Abfrage importieren.</span>`;
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
  let gesagt: string | null = null;
  btnGenannt.addEventListener("click", () => {
    if (!gesagt) return;
    adr.input.value = gesagt;
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
    gesagt = gesagteAdresse(e.meldung.adresse, a.gespraech.filter((m) => m.von === "anrufer").map((m) => m.text));
    btnGenannt.disabled = !gesagt;
    btnGenannt.title = gesagt ? `Genannte Adresse übernehmen: „${gesagt}“` : "Genannte Adresse – erst wenn der Anrufer eine Straße oder einen Ort gesagt hat";
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
  // 📞: ohne Nummer die Rufnummer des Anrufers übernehmen, mit Nummer den Anrufer zurückrufen
  const telB = el("button", { class: "btn small icon" }, "📞");
  const telTitel = () => (telB.title = telIn.value.trim() && e.anruf ? "Anrufer zurückrufen" : "Rufnummer des Anrufers übernehmen");
  telTitel();
  telIn.addEventListener("input", telTitel);
  telB.addEventListener("click", () => {
    if (!telIn.value.trim()) {
      telIn.value = e.wahr.abfrage?.anrufer.nummer || nummerAus(e.id, true);
      telTitel();
      void fehlerZeigen(sim.call("aktualisiere", e.id, { telefon: telIn.value }));
      return;
    }
    const st = e.anruf?.status;
    if (!e.anruf) return toast("Zu diesem Einsatz gibt es keinen Anrufer", "error");
    if (st === "aktiv") return toast("Das Gespräch läuft bereits");
    void import("./telefon").then((m) => m.anrufAnnehmen("rd", e.id));
  });
  aufZeile("Rückruf", telIn, telB);
  // Partner-Organisationen (Feuerwehr, Polizei, Berg-/Wasserrettung) mit eigenen Fahrzeugen
  const partnerZeile = el("div", { class: "partner-zeile" });
  const partnerInfo = el("div", { class: "partner-info muted" });
  let partnerKey = "";
  const partnerZeigen = () => {
    const noetig = sim.partnerErkannt(e);
    const einheiten = sim.partnerVon(e);
    // Einsatzort ist ein bekannter Ort (Freibad, Bahnhof, Tierpark …): Hinweis für den Disponenten
    const ort = typeof e.adresse?.lat === "number" ? ortAnStelle(e.adresse.lat, e.adresse.lon) : null;
    const key = JSON.stringify([e.partner ?? {}, e.partnerDa ?? {}, e.br?.label ?? "", e.boSicher ?? 0, noetig, einheiten.map((u) => [u.name, u.phase]), ort?.name ?? ""]);
    if (key === partnerKey) return;
    partnerKey = key;
    partnerZeile.innerHTML = "";
    const uhr = (x: number) => new Date(x).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
    for (const art of PARTNER_ARTEN) {
      const p = PARTNER[art];
      const alarmiert = e.partner?.[art];
      const da = e.partnerDa?.[art];
      const n = noetig.find((x) => x.art === art);
      const b = el("button", { class: `btn small partner-b${da ? " da" : alarmiert ? " unterwegs" : n ? " noetig" : ""}`, type: "button" }, `${da ? "✓ " : alarmiert ? "⏱ " : ""}${p.symbol} ${p.name}`);
      b.title = da
        ? `${p.name} vor Ort seit ${uhr(da)}`
        : alarmiert
          ? `${p.name} alarmiert um ${uhr(alarmiert)}, unterwegs`
          : n
            ? `${p.name} erforderlich: ${n.grund} – klicken zum Alarmieren`
            : `${p.name} alarmieren`;
      b.disabled = !!alarmiert;
      b.addEventListener("click", () => void fehlerZeigen(sim.call("partnerAnfordern", e.id, art)));
      partnerZeile.appendChild(b);
    }
    const zeilen: string[] = [];
    if (ort) zeilen.push(`<div class="partner-ort">📍 <b>${esc(ort.label)}</b> – ${esc(ort.name)}${ort.profil?.hinweis ? `<br>${esc(ort.profil.hinweis)}` : ""}</div>`);
    if (e.br) zeilen.push(`<div class="partner-br">🅿 ${esc(e.br.label)}${e.boSicher ? " – <b>Einsatzort gesichert</b>" : " – warten auf Freigabe durch die Polizei"}</div>`);
    if (einheiten.length) zeilen.push(einheiten.map((u) => `<span class="partner-fz">${PARTNER[u.art].symbol} ${esc(u.name)}: ${esc(PARTNER_PHASE_TEXT[u.phase])}</span>`).join(""));
    partnerInfo.innerHTML = zeilen.join("");
  };
  partnerZeigen();
  const partnerBox = el("div");
  partnerBox.append(partnerZeile, partnerInfo);
  aufZeile("Partner", partnerBox);
  aufZeile("Info RTW", infoRtw);
  aufZeile("Intern", infoIntern);

  // Alarmierung
  const alarmBox = el("div", { class: "mask-box" });
  alarmBox.innerHTML = `<div class="box-title">Fahrzeuge</div>`;
  const assigned = el("div", { class: "assigned" });
  const sugg = el("div", { class: "sugg" });
  // Suche über alle Fahrzeuge (Funkrufname auch ohne „/“, Wache, Typ)
  const suche = el("input", { type: "search", class: "fz-suche", placeholder: "Fahrzeug suchen (z. B. 75001, Krems, NEF) …" }) as HTMLInputElement;
  suche.addEventListener("input", () => renderSuggestions());
  suche.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      suche.value = "";
      renderSuggestions();
    }
  });
  const alarmRow = el("div", { class: "row-btns" });
  const btnAlarm = el("button", { class: "btn primary" }, "Alarmieren");
  const btnClose = el("button", { class: "btn" }, "Einsatz schließen");
  alarmRow.append(btnAlarm, btnClose);
  // Fahrzeuge über der Dienstzeit: nur vormerken – Hinweis zum Alarmieren
  const ueberHinweis = el("div", { class: "ueber-hinweis", hidden: "" });
  const knopfText = () => {
    const ausw = [...chosen].map((id) => sim.state.fahrzeuge[id]).filter(Boolean);
    const ueber = ausw.filter((f) => f.wechselOffen);
    btnAlarm.textContent = ueber.length && ueber.length === ausw.length ? "Vormerken" : ueber.length ? "Alarmieren / Vormerken" : "Alarmieren";
    ueberHinweis.hidden = !ueber.length;
    if (ueber.length) {
      const ende = ueber.some((f) => f.wechselOffen === "ende");
      ueberHinweis.innerHTML = `<b>${ende ? "Über Dienstende" : "Wechsel ausständig"}</b> (${ueber.map((f) => esc(f.funkrufname)).join(", ")}) – zuerst anfunken und fragen, ob sie den Einsatz noch übernehmen. Erst nach der Bestätigung gilt das Fahrzeug als alarmiert.`;
    }
  };
  alarmBox.append(assigned, suche, sugg, ueberHinweis, alarmRow);
  root.appendChild(alarmBox);

  // KH / BO / ZO
  const khBox = el("div", { class: "mask-box" });
  khBox.innerHTML = `<div class="box-title">Krankenhaus · Berufungs- und Zielort</div>`;
  const khInfo = el("div", { class: "kh-info" });
  // Zuweisung: Symptom (mit Synonymen) → Altersgruppe → Dringlichkeit → die nächsten passenden Häuser, die jetzt aufnehmen
  const dringChip = el("span", { class: "kh-dring" });
  const symFeld = el("div", { class: "zw-sym" });
  const symIn = el("input", { class: "zw-suche", type: "search", placeholder: "Symptom suchen (z. B. Brustschmerz, Sturz, Atemnot) …" }) as HTMLInputElement;
  const symChip = el("div", { class: "zw-chip", hidden: "" });
  const symListe = el("div", { class: "zw-liste", hidden: "" });
  symFeld.append(symIn, symChip, symListe);
  const altZeile = el("div", { class: "zw-seg zw-alter" });
  const drZeile = el("div", { class: "zw-seg zw-dring" });
  const khKarten = el("div", { class: "zw-kh" });
  const khSel = el("select", { class: "kh-sel", title: "anderes Krankenhaus wählen" }) as HTMLSelectElement;
  const btnBook = el("button", { class: "btn small primary" }, "KH buchen");
  const khRow = el("div", { class: "kh-row zw-row" });
  khRow.append(khSel, btnBook);
  const boZo = el("div", { class: "muted bozo" });
  const zo = addressInput("Zielort (frei, z. B. für Krankentransport)", (o) => void fehlerZeigen(sim.call("aktualisiere", e.id, { zo: o })));
  const zwKopf = el("div", { class: "zw-kopf" });
  zwKopf.append(dringChip, symFeld);
  khBox.append(khInfo, zwKopf, altZeile, drZeile, khKarten, khRow, boZo, el("div", { class: "fld-label" }, "Zielort manuell"), zo.root);
  root.appendChild(khBox);

  /** Dringlichkeit, wie die Leitstelle sie kennt: nach dem Eintreffen aus der Lage, vorher aus der Einsatzstufe */
  const dringlichkeit = (): "rot" | "gelb" | "gruen" => {
    const l = e.wahr.lage;
    if (l?.aufgedeckt && l.patienten[0]) return l.patienten[0].sichtung;
    const k = sim.stufeVon(e)?.kategorie;
    return k === "kritisch" ? "rot" : k === "dringend" ? "gelb" : "gruen";
  };
  const DRING_TEXT = { rot: "Patient rot", gelb: "Patient gelb", gruen: "Patient grün" };
  const FARBE_DRING: Record<"rot" | "gelb" | "gruen", Dringlichkeit> = { rot: 30, gelb: 20, gruen: 10 };
  let zwSym: Symptom | undefined;
  let zwAlter: Altersgruppe = "erwachsener";
  let zwDring: Dringlichkeit = 20;
  let zwGewaehlt = "";
  /** Zuweisung (oder ältere Diagnose) in die Auswahl übernehmen */
  const zwSetzen = (id: string | null | undefined) => {
    if (!id) return;
    const z = zuweisungLesen(id);
    if (z) {
      zwSym = z.s;
      zwAlter = z.a;
      zwDring = z.d;
    } else if (id.startsWith("bu_")) {
      zwSym = symptom(symptomAusDiagnose(id));
      if (zwSym) zwDring = dringlichkeitFuer(zwSym, FARBE_DRING[dringlichkeit()]);
    }
  };
  const grundWert = () => (zwSym ? zuweisungId(zwSym.id, zwDring, zwAlter) : "");
  const zwZeigen = () => {
    symChip.hidden = !zwSym;
    symIn.hidden = !!zwSym;
    symChip.innerHTML = zwSym ? `<b>${esc(zwSym.name)}</b> <span class="muted">${esc(zwSym.kategorie)}</span> <button class="btn small zw-weg" title="anderes Symptom">✕</button>` : "";
    altZeile.innerHTML = ALTERSGRUPPEN.map((a) => `<button class="btn small${a.id === zwAlter ? " an" : ""}" data-zw-alter="${a.id}" title="${a.text} Jahre">${a.name}</button>`).join("");
    drZeile.innerHTML = DRINGLICHKEITEN.map((d) => {
      const erlaubt = !zwSym || zwSym.dringlichkeiten.includes(d.id);
      return `<button class="btn small d${d.id}${d.id === zwDring && zwSym ? " an" : ""}" data-zw-dring="${d.id}"${erlaubt ? "" : " disabled"}>${d.name}</button>`;
    }).join("");
  };
  const symSuchen = () => {
    const q = symIn.value.trim();
    const treffer = q ? symptomSuche(q, 10) : [];
    symListe.hidden = !treffer.length;
    symListe.innerHTML = treffer
      .map((x, i) => {
        const syn = x.synonyme.filter((y) => q && y.toLowerCase().includes(q.toLowerCase().split(/\s+/)[0])).slice(0, 2);
        return `<div class="zw-treffer${i === 0 ? " sel" : ""}" data-zw-sym="${esc(x.id)}"><b>${esc(x.name)}</b> <span class="muted">${esc(x.kategorie)}${syn.length ? ` · ${esc(syn.join(", "))}` : ""}</span></div>`;
      })
      .join("");
  };
  const symWaehlen = (id: string) => {
    const x = symptom(id);
    if (!x) return;
    zwSym = x;
    zwDring = dringlichkeitFuer(x, FARBE_DRING[dringlichkeit()]);
    if (e.wahr.lage?.aufgedeckt && e.wahr.lage.patienten[0]) zwAlter = altersgruppeVon(e.wahr.lage.patienten[0].alter);
    symIn.value = "";
    symListe.hidden = true;
    zwZeigen();
    fillKh(true);
  };
  symIn.addEventListener("input", symSuchen);
  symIn.addEventListener("keydown", (ev) => {
    const ke = ev as KeyboardEvent;
    const alle = [...symListe.querySelectorAll<HTMLElement>(".zw-treffer")];
    const i = alle.findIndex((x) => x.classList.contains("sel"));
    if (ke.key === "ArrowDown" || ke.key === "ArrowUp") {
      ke.preventDefault();
      const n = Math.max(0, Math.min(alle.length - 1, i + (ke.key === "ArrowDown" ? 1 : -1)));
      alle.forEach((x, j) => x.classList.toggle("sel", j === n));
    } else if (ke.key === "Enter" && alle[Math.max(0, i)]) {
      ke.preventDefault();
      symWaehlen(alle[Math.max(0, i)].dataset.zwSym!);
    } else if (ke.key === "Escape") symListe.hidden = true;
  });
  symListe.addEventListener("mousedown", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-zw-sym]");
    if (!t) return;
    ev.preventDefault();
    symWaehlen(t.dataset.zwSym!);
  });
  symChip.addEventListener("click", (ev) => {
    if (!(ev.target as HTMLElement).closest(".zw-weg")) return;
    zwSym = undefined;
    zwZeigen();
    fillKh(true);
    symIn.focus();
  });
  altZeile.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-zw-alter]");
    if (!t) return;
    zwAlter = t.dataset.zwAlter as Altersgruppe;
    zwZeigen();
    fillKh(true);
  });
  drZeile.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-zw-dring]");
    if (!t || t.disabled) return;
    zwDring = Number(t.dataset.zwDring) as Dringlichkeit;
    zwZeigen();
    fillKh(true);
  });

  let khKey = "";
  const MARKE = { passend: "passend", ausweich: "Ausweich", rueckfall: "Rückfall" } as const;
  /** Kinder in einem Haus ohne Kinder-Abteilung: als Ausweich gekennzeichnet */
  const marke = (eig: keyof typeof MARKE) => (eig === "ausweich" && zwSym && zwAlter !== "erwachsener" ? "⚠ Ausweich – keine Kinderabteilung" : MARKE[eig]);
  const fillKh = (force = false) => {
    const d = dringlichkeit();
    const grund = grundWert();
    const key = `${grund}|${d}|${e.adresse?.lat}|${Math.floor(sim.state.zeit / 60_000)}`;
    if ((key === khKey || document.activeElement === khSel) && !force) return;
    khKey = key;
    dringChip.className = `kh-dring ${d}`;
    dringChip.textContent = DRING_TEXT[d];
    const pos = e.adresse ?? e.wahr;
    const kind = zwSym ? zwAlter !== "erwachsener" : (e.wahr.lage?.aufgedeckt ? (e.wahr.lage.patienten[0]?.alter ?? 99) : 99) < 15;
    const rot = zwSym ? zwDring === 30 : d === "rot";
    const vorschlaege = sim.khFuer(pos, grund || null, rot, kind, false, sim.cacVorrang(e));
    // die drei nächsten passenden Häuser, die jetzt aufnehmen
    const top = vorschlaege.filter((v) => !v.zu).slice(0, 3);
    if (!zwGewaehlt || force || !top.some((v) => v.h.id === zwGewaehlt)) {
      const gebucht = e.kh && e.kh.grund === grund ? top.find((v) => v.h.id === e.kh!.hospitalId) : undefined;
      zwGewaehlt = (gebucht ?? top.find((v) => !v.voll) ?? top[0])?.h.id ?? "";
    }
    khKarten.innerHTML = !grund
      ? `<div class="muted">Symptom wählen – dann zeigt die Liste die nächsten passenden Häuser, die jetzt aufnehmen.</div>`
      : top.length
        ? top
            .map((v) => {
              const lage = v.voll ? `belegt (${v.gesamt}/${v.gesamt})` : v.gesamt ? `${v.frei}/${v.gesamt} frei` : "";
              return `<label class="zw-khk ${v.eignung}${v.voll ? " voll" : ""}${v.h.id === zwGewaehlt ? " an" : ""}" data-zw-kh="${esc(v.h.id)}"><input type="radio" name="zwkh-${esc(e.id)}"${v.h.id === zwGewaehlt ? " checked" : ""}> <b>${esc(v.h.kurzname || v.h.name)}</b> <span class="muted">${v.km.toFixed(0)} km · ${marke(v.eignung)}${lage ? ` · ${lage}` : ""}${v.h.landeplatz === "kein" ? " · kein Hubschrauberlandeplatz" : ""}</span></label>`;
            })
            .join("")
        : `<div class="alert-text">Kein passendes Haus nimmt gerade auf.</div>`;
    // alle anderen bleiben wählbar
    const gezeigt = new Set(top.map((v) => v.h.id));
    khSel.innerHTML = "";
    khSel.appendChild(el("option", { value: "" }, top.length ? "– anderes Krankenhaus –" : "– Krankenhaus wählen –"));
    const weitere = vorschlaege.filter((v) => !gezeigt.has(v.h.id));
    if (weitere.length) {
      const g = el("optgroup");
      g.label = "passend, aber zu oder weiter weg";
      for (const v of weitere) g.appendChild(el("option", { value: v.h.id, class: `kh-opt ${v.eignung}${v.zu || v.voll ? " nein" : ""}` }, `${v.h.kurzname || v.h.name} (${v.km.toFixed(0)} km) · ${marke(v.eignung)}${v.zu ? " · zu" : v.voll ? " · belegt" : ""}`));
      khSel.appendChild(g);
    }
    const rest = store
      .list("hospitals")
      .filter((h) => !gezeigt.has(h.id) && !weitere.some((v) => v.h.id === h.id))
      .map((h) => ({ h, km: distanceM(pos, h) / 1000 }))
      .filter((x) => x.km < 150)
      .sort((a, b) => a.km - b.km);
    if (rest.length) {
      const g = el("optgroup");
      g.label = grund ? "passt nicht" : "alle Krankenhäuser";
      for (const { h, km } of rest) g.appendChild(el("option", { value: h.id, class: `kh-opt${grund ? " nein" : ""}` }, `${h.kurzname || h.name} (${km.toFixed(0)} km)`));
      khSel.appendChild(g);
    }
  };
  khKarten.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-zw-kh]");
    if (!t) return;
    zwGewaehlt = t.dataset.zwKh!;
    khSel.value = "";
    khKarten.querySelectorAll(".zw-khk").forEach((x) => x.classList.toggle("an", x === t));
  });
  btnBook.addEventListener("click", () => {
    const ziel = khSel.value || zwGewaehlt;
    if (!ziel) return toast("Bitte ein Krankenhaus wählen", "error");
    void fehlerZeigen(sim.call("bucheKh", e.id, ziel, grundWert()));
    khSel.value = "";
    toast("Krankenhaus gebucht");
  });
  zwSetzen(e.khAnfrage?.verdacht ?? e.verdacht ?? e.kh?.grund);
  if (!zwSym) zwDring = FARBE_DRING[dringlichkeit()];
  let letzterVerdacht = e.khAnfrage?.verdacht ?? e.verdacht ?? "";
  zwZeigen();
  fillKh(true);

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
    // Empfohlene (und Hinweise wie EL ÖBB) zuerst, damit sie nicht aus der Liste fallen
    const vorne = new Set([...emp.ids, ...(emp.oben ?? [])]);
    suggestions = [...res.filter((r) => vorne.has(r.fz.id)), ...res.filter((r) => !vorne.has(r.fz.id))];
    renderSuggestions();
  }

  function renderSuggestions() {
    sugg.innerHTML = "";
    if (gruende.length) {
      sugg.appendChild(el("div", { class: "sugg-why" }, gruende.join(" · ")));
    }
    const q = suche.value.trim();
    let shown = suggestions.slice(0, 14);
    if (q) {
      // Treffer aus allen freien Fahrzeugen (mit Anfahrtszeit), dazu nicht freie mit ihrem Status
      const frei = new Set(suggestions.map((s) => s.fz.id));
      shown = [
        ...suggestions.filter((s) => fzPasst(s.fz, q)),
        ...Object.values(sim.state.fahrzeuge)
          .filter((f) => !frei.has(f.id) && fzPasst(f, q))
          .sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de", { numeric: true }))
          .map((fz) => ({ fz, sekunden: null, hinweis: fz.ausserDienst ? "außer Dienst" : "nicht frei", kt: false })),
      ].slice(0, 40);
    }
    for (const s of shown) {
      const row = el("label", { class: `sugg-row${s.hinweis ? " blocked" : ""}${empfohlen.has(s.fz.id) ? " rec" : ""}${fzKlassen(s.fz)}` });
      const cb = el("input", { type: "checkbox" });
      cb.checked = chosen.has(s.fz.id);
      cb.disabled = !!s.hinweis;
      cb.addEventListener("change", () => {
        if (cb.checked) chosen.add(s.fz.id);
        else chosen.delete(s.fz.id);
        knopfText();
      });
      row.appendChild(cb);
      const info = el("span", { class: "sugg-info" });
      info.innerHTML = `${statusChip(s.fz)} <b data-dienstfz="${esc(s.fz.id)}">${esc(s.fz.funkrufname)}</b> <span class="muted">${typHtml(s.fz)} · ${esc(s.fz.kurzname || s.fz.stationName)}</span> ${crewHtml(s.fz)}${dienstHtml(s.fz)}`;
      row.appendChild(info);
      info.insertAdjacentHTML("beforeend", vorgemerktHtml(s.fz));
      if (s.kt) info.insertAdjacentHTML("beforeend", ` <span class="kt-fz aktiv" title="fährt Krankentransport ohne Patient – wird beim Alarmieren abgezogen, die Transporte sind dann wieder offen">KT – abziehen</span>`);
      row.appendChild(el("span", { class: "sugg-eta" }, s.hinweis ? s.hinweis : minuten(s.sekunden)));
      sugg.appendChild(row);
    }
    if (shown.length === 0) sugg.appendChild(el("div", { class: "muted" }, q ? "Kein Fahrzeug gefunden." : "Keine freien Fahrzeuge."));
    knopfText();
  }

  btnAlarm.addEventListener("click", async () => {
    if (chosen.size === 0) return toast("Bitte Fahrzeuge auswählen", "error");
    const hinweise = await sim.call("alarmiere", e.id, [...chosen]).catch((x) => [String(x.message ?? x)]);
    for (const h of hinweise) toast(h, / vorgemerkt – /.test(h) ? "ok" : "error");
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
        const row = el("div", { class: `as-row${fzKlassen(fz)}` });
        const imEinsatz = fz.einsatzId === e.id;
        row.innerHTML = `<span class="as-platz"></span>${statusChip(fz)} <b data-dienstfz="${esc(fz.id)}">${esc(fz.funkrufname)}</b> <span class="muted as-info" title="${esc(sim.statusDef(fz.status).name)}">${typHtml(fz)} · ${esc(sim.statusDef(fz.status).name)}${imEinsatz ? "" : " (frei)"}</span> ${crewHtml(fz)}${dienstHtml(fz)}`;
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
        ? `<div>Gebucht: <b>${esc(h?.name ?? e.kh.hospitalId)}</b></div><div class="muted">${e.kh.grund ? `Verdacht: ${esc(buchungName(e.kh.grund))} · ` : ""}durch ${e.kh.durch === "rtw" ? "RTW" : e.kh.durch === "nah" ? "NAH (Pilot)" : "Leitstelle"} · ${uhr(e.kh.zeit)}</div>`
        : e.khAnfrage
          ? `<div class="alert-text">${esc(e.khAnfrage.von)} erbittet KH-Buchung: <b>Verdacht ${esc(buchungName(e.khAnfrage.verdacht))}</b></div>`
          : `<div class="muted">Noch kein Krankenhaus gebucht.</div>`;
      khBox.classList.toggle("alert", !!e.khAnfrage);
      const v = e.khAnfrage?.verdacht ?? e.verdacht ?? "";
      if (v && v !== letzterVerdacht) {
        letzterVerdacht = v;
        zwSetzen(v);
        zwZeigen();
        fillKh(true);
      }
      fillKh();
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
