/** Reiter „Einstellungen“: Statusmodell, Einsatzaufkommen, Stufen-Zuordnung, Fahrzeiten, Flugrettung. */
import { ordnerZeigen } from "../net/spielstandOrdner";
import { ABLAGE_INFO, ablageBasis, ablageZeigen, type AblageOrdner } from "../net/ablage";
import { spielstaendeOeffnen } from "./spielstaende";
import { fallEditorOeffnen } from "./fallEditor";
import { store } from "../data/store";
import { sim } from "../sim/engine";
import { inTauri } from "../platform";
import { mp } from "../net/mehrspieler";
import { geoStatus, REGIONEN } from "../sim/geo";
import { KATEGORIEN, KATEGORIE_LABEL, NOTARZT_LABEL, defaultStufeFuer, stufeRaten, type Kategorie, type NotarztRegel, type Settings } from "../sim/settings";
import { codeKategorien } from "../sim/codes";
import { modusVon, WETTER_LABEL, type WetterLage } from "../sim/weather";
import { FUNKGRUPPEN } from "../sim/funkgruppen";
import { confirmDialog } from "./dialog";
import { buildAppSection, buildPacksSection } from "./packsView";
import { buildKiSection } from "./kiView";
import { el, esc, toast } from "./dom";
import { abfrageAnsicht, setzeAbfrageAnsicht } from "./abfrageAnsicht";
import { STUFEN_STANDARD } from "../abfrage/faelle";

const STATUS_BEDEUTUNG: Record<string, string> = {
  freiWache: "frei auf der Wache",
  zumBO: "Anfahrt zum Einsatzort",
  amBO: "am Einsatzort",
  zumZO: "Transport zum Zielort",
  amZO: "am Zielort / Übergabe",
  freiFunk: "frei, unterwegs",
  dienstfahrt: "Dienstfahrt (alarmierbar)",
  bereitschaft: "Bereitschaft (alarmierbar)",
  alarmiert: "alarmiert, rückt aus",
  abgemeldet: "nicht im Dienst",
};

export function createSettingsView(container: HTMLElement, teil: "simulation" | "programm" = "simulation"): { refresh(): void } {
  let draft: Settings = structuredClone(store.settings);

  const num = (v: number, step = "1", min = "0") => {
    const i = el("input", { type: "number", step, min });
    i.value = String(v);
    return i;
  };

  function render() {
    draft = structuredClone(store.settings);
    container.innerHTML = "";
    const page = el("div", { class: "settings" });
    container.appendChild(page);

    const section = (title: string, hint?: string) => {
      const s = el("section", { class: "set-sec" });
      s.appendChild(el("h3", {}, title));
      if (hint) s.appendChild(el("p", { class: "muted" }, hint));
      page.appendChild(s);
      return s;
    };

    if (teil === "programm") {
      programmTeil(section);
      return;
    }
    page.appendChild(
      el(
        "div",
        { class: "set-hinweis" },
        mp.aktiv && mp.status.rolle === "client"
          ? "Diese Einstellungen gelten für alle im Spiel und kommen vom Host – ändern kann sie nur, wer das Recht „Einstellungen & Daten“ hat."
          : "Diese Einstellungen gelten für die ganze Leitstelle – im Multiplayer bekommen alle Mitspieler die Einstellungen des Hosts.",
      ),
    );

    // Status
    const sSec = section("Statusmodell", "Nummer, Bezeichnung und Farbe der Status. Die Bedeutung ist fest, damit die Simulation weiß, was passiert.");
    const sTab = el("table", { class: "set-table" });
    sTab.innerHTML = `<tr><th>Bedeutung</th><th>Nummer</th><th>Bezeichnung</th><th>Farbe</th><th>alarmierbar</th></tr>`;
    for (const st of draft.status) {
      const tr = el("tr");
      tr.appendChild(el("td", {}, STATUS_BEDEUTUNG[st.key] ?? st.key));
      const n = el("input", { type: "text", class: "w-num" });
      n.value = st.nummer;
      n.addEventListener("change", () => (st.nummer = n.value.trim()));
      const name = el("input", { type: "text" });
      name.value = st.name;
      name.addEventListener("change", () => (st.name = name.value.trim()));
      const col = el("input", { type: "color" });
      col.value = st.farbe;
      col.addEventListener("input", () => (st.farbe = col.value));
      const av = el("input", { type: "checkbox" });
      av.checked = st.verfuegbar;
      av.addEventListener("change", () => (st.verfuegbar = av.checked));
      for (const c of [n, name, col, av]) {
        const td = el("td");
        td.appendChild(c);
        tr.appendChild(td);
      }
      sTab.appendChild(tr);
    }
    sSec.appendChild(sTab);

    // Spielgebiet
    const gSec = section("Spielgebiet", "Wo gespielt wird: Einsätze entstehen nur in dieser Funkgruppe, gefunkt wird auf ihr.");
    const gGrid = el("div", { class: "set-grid" });
    gSec.appendChild(gGrid);

    // Aufkommen
    const aSec = section(
      "Einsatzaufkommen",
      "Wie viele Notfälle und Krankentransporte kommen. Die Stufe gilt für alles; die genauen Werte je Stunde stehen in der Tabelle darunter.",
    );
    const aGrid = el("div", { class: "set-grid" });
    const stufeSel = el("select", { class: "set-aufkommen-stufe" }) as HTMLSelectElement;
    for (const [v, l] of [["ruhig", "Ruhig – etwa 60 %"], ["normal", "Normal – wie in der Tabelle"], ["stressig", "Stressig – etwa 160 %"]]) stufeSel.appendChild(el("option", { value: v }, l));
    stufeSel.value = draft.aufkommenStufe ?? "normal";
    stufeSel.addEventListener("change", () => (draft.aufkommenStufe = stufeSel.value as Settings["aufkommenStufe"]));
    aGrid.append(el("label", { title: "Wie auf der Startseite: ruhig, normal oder stressig" }, "Aufkommen insgesamt"), stufeSel);
    const gen = el("input", { type: "checkbox" });
    gen.checked = draft.generatorAktiv;
    gen.addEventListener("change", () => (draft.generatorAktiv = gen.checked));
    aGrid.append(el("label", {}, "Einsätze automatisch erzeugen"), gen);
    const src = el("select");
    src.append(el("option", { value: "zufall" }, "zufällig (Adressen im Gebiet)"), el("option", { value: "vorlagen" }, "aus Einsatzvorlagen (Reiter Daten)"));
    src.value = draft.generatorQuelle;
    src.addEventListener("change", () => (draft.generatorQuelle = src.value as Settings["generatorQuelle"]));
    aGrid.append(el("label", {}, "Quelle"), src);
    const geb = el("select");
    for (const g of FUNKGRUPPEN) {
      const o = el("option", { value: g.id }, `TETRA ${g.id} – ${g.bezirke}${g.verfuegbar ? "" : " (kommt später)"}`);
      o.disabled = !g.verfuegbar;
      geb.appendChild(o);
    }
    geb.value = draft.funkgruppe ?? "NÖ-03";
    geb.addEventListener("change", () => (draft.funkgruppe = geb.value));
    gGrid.append(
      el("label", { title: "Einsätze entstehen nur in diesen Bezirken, gefunkt wird auf dieser Gruppe. Fahrzeuge von außen kann man trotzdem alarmieren." }, "Funkgruppe (TETRA)"),
      geb,
    );
    // Anrufer und Verlauf (eigener Abschnitt, gleich nach dem Aufkommen gebaut)
    const vGrid = el("div", { class: "set-grid" });
    const alGrid = el("div", { class: "set-grid" });
    const khGrid = el("div", { class: "set-grid" });
    const fa = num(draft.falscheAdresseProzent);
    fa.addEventListener("change", () => (draft.falscheAdresseProzent = Number(fa.value) || 0));
    vGrid.append(el("label", {}, "Anrufer mit falscher Adresse (%)"), fa);
    const rn = el("input", { type: "checkbox" });
    rn.checked = !!draft.rueckrufOhneNummer;
    rn.addEventListener("change", () => (draft.rueckrufOhneNummer = rn.checked));
    vGrid.append(el("label", { title: "Normal kann die Leitstelle nur zurückrufen, wenn die Rückrufnummer in der Abfrage oder Maske eingetragen ist" }, "Rückruf auch ohne aufgenommene Nummer"), rn);
    const ansichtSel = el("select", { class: "set-abfrage-ansicht" }) as HTMLSelectElement;
    ansichtSel.append(el("option", { value: "neu" }, "neu – Notruf Frage für Frage, KT/SEK aufgeräumt"), el("option", { value: "klassisch" }, "bisherige Ansicht"));
    ansichtSel.value = abfrageAnsicht();
    ansichtSel.addEventListener("change", () => setzeAbfrageAnsicht(ansichtSel.value === "klassisch" ? "klassisch" : "neu"));
    vGrid.append(el("label", { title: "Gilt sofort und nur für diesen Rechner" }, "Abfrage-Ansicht"), ansichtSel);
    const kSel = el("select");
    for (const [v, l] of [["ruhig", "ruhig – selten Überraschungen"], ["normal", "normal – etwa jeder 10. Einsatz verändert sich"], ["fordernd", "fordernd – oft Verschlechterungen und Irrtümer"]]) kSel.appendChild(el("option", { value: v }, l));
    kSel.value = draft.komplikationen ?? "normal";
    kSel.addEventListener("change", () => (draft.komplikationen = kSel.value as Settings["komplikationen"]));
    vGrid.append(el("label", {}, "Komplikationen (Verschlechterung, Irrtum des Anrufers, mehr Betroffene)"), kSel);
    const fkSel = el("select", { class: "set-fallkatalog" }) as HTMLSelectElement;
    for (const [v, l] of [["nur", "nur Fallkatalog (neu, zum Testen)"], ["gemischt", "gemischt mit den bisherigen Fallgeschichten"], ["aus", "aus – bisherige Fallgeschichten"]]) fkSel.appendChild(el("option", { value: v }, l));
    fkSel.value = draft.fallKatalog ?? "nur";
    fkSel.addEventListener("change", () => (draft.fallKatalog = fkSel.value as Settings["fallKatalog"]));
    const fkBox = el("div", { class: "row-btns" });
    const fkEdit = el("button", { class: "btn small", type: "button", title: "Fälle ansehen, selbst schreiben, prüfen, importieren und exportieren" }, "Fälle bearbeiten …");
    fkEdit.addEventListener("click", () => fallEditorOeffnen());
    fkBox.append(fkSel, fkEdit);
    aGrid.append(el("label", { title: "Fälle mit stimmigem Telefonat, Verlauf, Notarzt-Bedarf nach Kompetenz und Krankenhaus" }, "Einsätze aus dem Fallkatalog"), fkBox);
    // Schwere der Notfälle aus dem Fallkatalog (Anteile in %)
    const schwere = { harmlos: 35, mittel: 50, kritisch: 15, ...(draft.schwere ?? {}) };
    const swBox = el("div", { class: "row-btns set-schwere" });
    const swSumme = el("span", { class: "muted small" });
    const swText = () => {
      const s = schwere.harmlos + schwere.mittel + schwere.kritisch;
      swSumme.textContent = s === 100 ? "" : `(zusammen ${s} – wird anteilig gerechnet)`;
    };
    for (const [k, l] of [["harmlos", "harmlos"], ["mittel", "mittel"], ["kritisch", "kritisch"]] as const) {
      const i = num(schwere[k], "5");
      i.style.width = "64px";
      i.dataset.schwere = k;
      i.addEventListener("change", () => {
        schwere[k] = Math.max(0, Number(i.value) || 0);
        draft.schwere = { ...schwere };
        swText();
      });
      swBox.append(el("span", { class: "muted small" }, l), i);
    }
    swText();
    swBox.appendChild(swSumme);
    aGrid.append(el("label", { title: "Wie viele Notfälle aus dem Fallkatalog harmlos (grün), mittel (gelb) oder kritisch (rot) sind – in Prozent" }, "Schwere der Notfälle (%)"), swBox);
    // Verteilung nach Versorgungsstufe (Telemedizin … ALS rot) – Standard: Statistik 2025
    const vnSel = el("select", { class: "set-verteilung" }) as HTMLSelectElement;
    for (const [v, l] of [["stufe", "Versorgungsstufe (Statistik)"], ["schwere", "Schwere (harmlos/mittel/kritisch)"]]) vnSel.appendChild(el("option", { value: v }, l));
    vnSel.value = draft.verteilungNach ?? "stufe";
    const stBox = el("div", { class: "row-btns set-stufen" });
    const stufen: Record<string, number> = { ...STUFEN_STANDARD, ...(draft.stufenVerteilung ?? {}) };
    for (const k of Object.keys(STUFEN_STANDARD)) {
      const i = num(stufen[k], "any");
      i.style.width = "72px";
      i.dataset.stufe = k;
      i.addEventListener("change", () => {
        stufen[k] = Math.max(0, Number(i.value) || 0);
        draft.stufenVerteilung = { ...stufen };
      });
      const paar = el("span", { class: "set-stufe-paar" });
      paar.append(el("span", { class: "muted small" }, k), i);
      paar.style.cssText = "display:inline-flex;align-items:center;justify-content:space-between;gap:6px;width:190px";
      stBox.appendChild(paar);
    }
    const stReset = el("button", { class: "btn small", type: "button" }, "Statistik");
    stReset.addEventListener("click", () => {
      draft.stufenVerteilung = undefined;
      for (const i of stBox.querySelectorAll<HTMLInputElement>("input[data-stufe]")) i.value = String(STUFEN_STANDARD[i.dataset.stufe!]);
      Object.assign(stufen, STUFEN_STANDARD);
    });
    stBox.appendChild(stReset);
    const sichtbar = () => {
      stBox.style.display = vnSel.value === "stufe" ? "" : "none";
      swBox.style.opacity = vnSel.value === "stufe" ? "0.5" : "";
    };
    vnSel.addEventListener("change", () => {
      draft.verteilungNach = vnSel.value as Settings["verteilungNach"];
      sichtbar();
    });
    sichtbar();
    aGrid.append(
      el("label", { title: "Versorgungsstufe: so viele Notrufe enden in Telemedizin, BLS grün … ALS rot wie in der Statistik (gilt, wenn das Codesystem diese Stufen kennt; sonst zählt die Schwere). Schwere: nach dem Zustand vor Ort." }, "Verteilung der Notfälle nach"),
      vnSel,
      el("label", { title: "Anteile der Versorgungsstufen in Prozent – „Statistik“ setzt die Werte von 2025" }, "Versorgungsstufen (%)"),
      stBox,
    );
    const rvSel = el("select", { class: "set-revers" }) as HTMLSelectElement;
    for (const [v, l] of [["normal", "normal"], ["selten", "selten"], ["aus", "aus"]]) rvSel.appendChild(el("option", { value: v }, l));
    rvSel.value = draft.revers ?? "normal";
    rvSel.addEventListener("change", () => (draft.revers = rvSel.value as Settings["revers"]));
    vGrid.append(el("label", { title: "Wache, stabile Patienten verweigern manchmal den Transport (Revers)" }, "Transportverweigerung (Revers)"), rvSel);
    const rzv = el("input", { type: "checkbox", class: "set-rendezvous" }) as HTMLInputElement;
    rzv.checked = draft.rendezvous !== false;
    rzv.addEventListener("change", () => (draft.rendezvous = rzv.checked));
    alGrid.append(el("label", { title: "Braucht der Patient einen Notarzt und ist das NEF noch mehr als 15 Minuten entfernt, fährt der RTW mit dem Patienten los und trifft das NEF unterwegs" }, "Rendezvous RTW – NEF"), rzv);
    // ACN: Akutpflege-Einsätze zu Hause
    const acnRate = el("input", { type: "range", min: "0", max: "8", step: "0.5" }) as HTMLInputElement;
    acnRate.value = String(draft.acnProTag ?? 2);
    const acnWert = el("span", { class: "muted small" });
    const acnText = () => (acnWert.textContent = Number(acnRate.value) ? `ca. ${Number(acnRate.value).toLocaleString("de-AT")} pro Standort und Tag` : "aus");
    acnText();
    acnRate.addEventListener("input", () => {
      draft.acnProTag = Number(acnRate.value);
      acnText();
    });
    const acnZeile = el("div", { class: "fremd-rate" });
    acnZeile.append(acnRate, acnWert);
    aGrid.append(el("label", { title: "Pflegerische Einsätze ohne Eile (ACN-Codes), zu denen nur die ACN nach Hause fährt – nur rund um ACN-Standorte" }, "ACN-Einsätze (Akutpflege)"), acnZeile);
    // Verteilung der Notfälle auf die Kategorien
    for (const k of KATEGORIEN) {
      const i = num(draft.aufkommen[k], "0.5");
      i.addEventListener("change", () => (draft.aufkommen[k as Kategorie] = Number(i.value) || 0));
      aGrid.append(el("label", {}, `Anteil ${KATEGORIE_LABEL[k]} (Notfälle)`), i);
    }
    // Work in Progress: Einsätze in Nachbarzonen
    const fzWrap = el("label", { title: "Einsätze knapp außerhalb deiner Funkgruppe, zu denen eigene Fahrzeuge (meist das NEF) fahren – angelegt und disponiert vom Kollegen der Nachbarzone" });
    fzWrap.innerHTML = `Einsätze in Nachbarzonen <span class="wip-badge">Work in Progress</span>`;
    const fzAn = el("input", { type: "checkbox" }) as HTMLInputElement;
    fzAn.checked = !!draft.fremdzoneAktiv;
    const fzRate = el("input", { type: "range", min: "0.2", max: "6", step: "0.2" }) as HTMLInputElement;
    fzRate.value = String(draft.fremdzoneProStunde ?? 1);
    const fzWert = el("span", { class: "muted small" });
    const fzText = () => (fzWert.textContent = `ca. ${Number(fzRate.value).toLocaleString("de-AT")} pro Stunde`);
    fzText();
    fzRate.addEventListener("input", () => {
      draft.fremdzoneProStunde = Number(fzRate.value);
      fzText();
    });
    const fzRateZeile = el("div", { class: "fremd-rate" });
    fzRateZeile.append(fzRate, fzWert);
    fzRateZeile.hidden = !fzAn.checked;
    const fzRateLabel = el("label", {}, "Häufigkeit (Nachbarzonen)");
    fzRateLabel.hidden = !fzAn.checked;
    fzAn.addEventListener("change", async () => {
      if (fzAn.checked) {
        const ok = await confirmDialog(
          "Einsätze in Nachbarzonen (Work in Progress)",
          "Diese Funktion ist noch in Arbeit: In den anderen Zonen sind noch kaum Fahrzeuge hinterlegt, deren Einsätze werden deshalb nur vereinfacht nachgestellt. Dabei kann es zu Fehlern kommen, die sich im laufenden Spiel NICHT beheben lassen. Trotzdem einschalten?",
          "Einschalten",
        );
        if (!ok) {
          fzAn.checked = false;
          return;
        }
      }
      draft.fremdzoneAktiv = fzAn.checked;
      fzRateZeile.hidden = !fzAn.checked;
      fzRateLabel.hidden = !fzAn.checked;
    });
    gGrid.append(fzWrap, fzAn, fzRateLabel, fzRateZeile);
    // Krankenhäuser: Grundbelegung (andere Leitstellen, Selbstzuweiser) mit Tageskurve
    const kgAn = el("input", { type: "checkbox" }) as HTMLInputElement;
    kgAn.checked = draft.khGrundAktiv !== false;
    const kgRate = el("input", { type: "range", min: "0.1", max: "2", step: "0.1", class: "kh-grund" }) as HTMLInputElement;
    kgRate.value = String(draft.khGrundFaktor ?? 1);
    const kgWert = el("span", { class: "muted small" });
    const kgText = () => (kgWert.textContent = `${Math.round(Number(kgRate.value) * 100)} %`);
    kgText();
    kgRate.addEventListener("input", () => {
      draft.khGrundFaktor = Number(kgRate.value);
      kgText();
    });
    const kgZeile = el("div", { class: "fremd-rate" });
    kgZeile.append(kgRate, kgWert);
    const kgLabel = el("label", {}, "Stärke der Grundbelegung");
    kgZeile.hidden = kgLabel.hidden = !kgAn.checked;
    kgAn.addEventListener("change", () => {
      draft.khGrundAktiv = kgAn.checked;
      kgZeile.hidden = kgLabel.hidden = !kgAn.checked;
    });
    khGrid.append(
      el("label", { title: "Krankenhäuser sind auch ohne deine Patienten belegt – vormittags viel, nachts kaum. Schockraum, Herzkatheter, ECMO und Druckkammer nur sehr selten." }, "Krankenhäuser: Grundbelegung durch andere Patienten"),
      kgAn,
      kgLabel,
      kgZeile,
    );
    aSec.appendChild(aGrid);

    // Aufkommen je Stunde (Notfälle und Krankentransporte)
    const tab = el("table", { class: "set-table stunden" });
    const kopf = `<th>Stunde</th><th>Notfälle / h</th><th>KT / h</th><th>Überstellungen / h</th>`;
    tab.innerHTML = `<tr>${kopf}<th></th>${kopf}</tr>`;
    for (let h = 0; h < 12; h++) {
      const tr = el("tr");
      for (const st of [h, h + 12]) {
        const z = draft.stunden[st];
        const rd = num(z.rd, "0.5");
        rd.addEventListener("change", () => (z.rd = Math.max(0, Number(rd.value) || 0)));
        const kt = num(z.kt, "0.5");
        kt.addEventListener("change", () => (z.kt = Math.max(0, Number(kt.value) || 0)));
        const sek = num(z.sek ?? 0, "0.1");
        sek.addEventListener("change", () => (z.sek = Math.max(0, Number(sek.value) || 0)));
        const td = (x: HTMLElement | string) => {
          const c = el("td");
          if (typeof x === "string") c.textContent = x;
          else c.appendChild(x);
          tr.appendChild(c);
        };
        td(`${String(st).padStart(2, "0")}–${String(st + 1).padStart(2, "0")} Uhr`);
        td(rd);
        td(kt);
        td(sek);
        if (st === h) td("");
      }
      tab.appendChild(tr);
    }
    aSec.appendChild(tab);
    const vSec = section("Anrufer und Verlauf", "Wie sich Anrufer und Einsätze verhalten: falsche Adressen, Rückrufe, Verschlechterungen, Transportverweigerung.");
    vSec.appendChild(vGrid);
    const alSec = section("Alarmierung", "Wie alarmiert wird. Welches Rettungsmittel bei welcher Stufe kommt, steht darunter.");
    alSec.appendChild(alGrid);
    const khSec = section("Krankenhäuser und Daueraufträge", "Wie voll die Krankenhäuser durch andere Patienten sind, und feste Termine (Dialyse, Bestrahlung, Chemotherapie) für die KT.");
    khSec.appendChild(khGrid);
    const dGrid = el("div", { class: "set-grid" });
    const dia = num(draft.dauerDialyseJeKh, "1");
    dia.addEventListener("change", () => (draft.dauerDialyseJeKh = Math.max(0, Number(dia.value) || 0)));
    dGrid.append(el("label", {}, "Dialyse-Patienten je Krankenhaus mit Dialyse (Daueraufträge pro Tag)"), dia);
    const str = num(draft.dauerStrahlJeKh, "1");
    str.addEventListener("change", () => (draft.dauerStrahlJeKh = Math.max(0, Number(str.value) || 0)));
    dGrid.append(el("label", {}, "Bestrahlungs-Patienten je Krankenhaus mit Strahlentherapie"), str);
    const che = num(draft.dauerChemoJeKh ?? 1, "1");
    che.addEventListener("change", () => (draft.dauerChemoJeKh = Math.max(0, Number(che.value) || 0)));
    dGrid.append(el("label", {}, "Chemotherapie-Patienten mit fixem Termin je Krankenhaus mit onkologischer Tagesklinik"), che);
    khSec.appendChild(dGrid);

    // Stufen
    const stSec = section(
      "Stufen-Zuordnung",
      "Je Kategorie der Einsatzcodes (neue Kategorien aus einem Import erscheinen hier automatisch mit Standardwerten). Rettungsmittel nach Rangfolge: „>“ trennt die Ränge, „/“ heißt gleichwertig (z. B. KTW>RTW>RTW-C oder RTW/RTW-C). Ein schlechter passendes Rettungsmittel wird nur vorgeschlagen, wenn das besser passende mehr als die Toleranz länger braucht. NFS: ohne Notfallsanitäter an Bord kommt ein NEF dazu. Notarzt „NEF bevorzugt“: ein NAH nur, wenn er mehr als die Toleranz schneller ist.",
    );
    // Kategorien aus der importierten Codeliste, die noch keine Zuordnung haben
    for (const k of codeKategorien()) {
      if (!draft.stufen.some((x) => x.stufe === k)) draft.stufen.push(stufeRaten(k) ?? defaultStufeFuer(k));
    }
    const stTab = el("table", { class: "set-table" });
    stTab.innerHTML = `<tr><th>Stufe</th><th>Rettungsmittel (Rangfolge)</th><th>NFS</th><th>Notarzt</th><th>Sondersignal</th><th>Kategorie</th><th>Transport %</th></tr>`;
    for (const s of draft.stufen) {
      const tr = el("tr");
      tr.appendChild(el("td", {}, s.stufe));
      const fz = el("input", { type: "text", class: "rm-input", placeholder: "z. B. RTW>KTW>RTW-C" });
      fz.value = s.rettungsmittel;
      fz.addEventListener("change", () => (s.rettungsmittel = fz.value.toUpperCase().replace(/\s+/g, "")));
      const nfs = el("input", { type: "checkbox" });
      nfs.checked = s.nfsErforderlich;
      nfs.addEventListener("change", () => (s.nfsErforderlich = nfs.checked));
      const na = el("select");
      for (const k of Object.keys(NOTARZT_LABEL) as NotarztRegel[]) na.appendChild(el("option", { value: k }, NOTARZT_LABEL[k]));
      na.value = s.notarzt;
      na.addEventListener("change", () => (s.notarzt = na.value as NotarztRegel));
      const sos = el("input", { type: "checkbox" });
      sos.checked = s.sondersignal;
      sos.addEventListener("change", () => (s.sondersignal = sos.checked));
      const kat = el("select");
      for (const k of KATEGORIEN) kat.appendChild(el("option", { value: k }, KATEGORIE_LABEL[k]));
      kat.value = s.kategorie;
      kat.addEventListener("change", () => (s.kategorie = kat.value as Kategorie));
      const tp = num(s.transportProzent);
      tp.addEventListener("change", () => (s.transportProzent = Number(tp.value) || 0));
      for (const c of [fz, nfs, na, sos, kat, tp]) {
        const td = el("td");
        td.appendChild(c);
        tr.appendChild(td);
      }
      stTab.appendChild(tr);
    }
    const tGrid = el("div", { class: "set-grid" });
    const tol = num(draft.toleranzMin, "1", "0");
    tol.addEventListener("change", () => (draft.toleranzMin = Math.max(0, Number(tol.value) || 0)));
    tGrid.append(el("label", {}, "Toleranz für besser passende Rettungsmittel (min)"), tol);
    stSec.appendChild(tGrid);
    stSec.appendChild(stTab);

    // Fahrzeiten
    const fSec = section("Fahrzeiten und Verortung");
    const fGrid = el("div", { class: "set-grid" });
    const sf = num(draft.sondersignalFaktor, "0.05", "0.3");
    sf.addEventListener("change", () => (draft.sondersignalFaktor = Number(sf.value) || 1));
    fGrid.append(el("label", {}, "Sondersignal: Fahrzeit × Faktor"), sf);
    const vr = num(draft.verortungRadius, "10", "20");
    vr.addEventListener("change", () => (draft.verortungRadius = Number(vr.value) || 250));
    fGrid.append(el("label", {}, "Verortung richtig bis (Meter)"), vr);
    fSec.appendChild(fGrid);

    // Ausrückzeiten
    const rSec = section(
      "Ausrückzeiten",
      "Zeit vom Alarm bis zur Abfahrt, zufällig zwischen Minimum und Maximum (Minuten). Gilt auf der Wache; frei unterwegs (Status Funk) geht es nach wenigen Sekunden los, aus der Bereitschaft dauert es länger.",
    );
    const rGrid = el("div", { class: "set-grid" });
    const a = draft.ausrueck;
    const klein = (wert: number, step: string) => {
      const i = num(wert, step);
      i.classList.add("ausr-zahl");
      return i;
    };
    /** „0,5 – 2 min“ in einer Zeile */
    const bereich = (wert: [number, number]) => {
      const lo = klein(Math.round((wert[0] / 60) * 10) / 10, "0.5");
      const hi = klein(Math.round((wert[1] / 60) * 10) / 10, "0.5");
      lo.addEventListener("change", () => (wert[0] = Math.max(0, Number(lo.value) || 0) * 60));
      hi.addEventListener("change", () => (wert[1] = Math.max(wert[0] / 60, Number(hi.value) || 0) * 60));
      const w = el("div", { class: "ausr-bereich" });
      w.append(lo, el("span", { class: "muted" }, "–"), hi, el("span", { class: "muted" }, "min"));
      return w;
    };
    const tv = klein(a.tagVon, "1");
    const tb = klein(a.tagBis, "1");
    tv.addEventListener("change", () => (a.tagVon = Math.min(23, Math.max(0, Number(tv.value) || 0))));
    tb.addEventListener("change", () => (a.tagBis = Math.min(24, Math.max(0, Number(tb.value) || 0))));
    const tw = el("div", { class: "ausr-bereich" });
    tw.append(tv, el("span", { class: "muted" }, "–"), tb, el("span", { class: "muted" }, "Uhr"));
    rGrid.append(el("label", {}, "Tag (sonst Nacht)"), tw);
    // Tabelle: je Fahrzeugart eine Zeile, Tag und Nacht nebeneinander
    a.nefTag ??= [20, 240];
    a.nefNacht ??= [90, 780];
    const ausrTab = el("div", { class: "ausr-tab" });
    ausrTab.append(el("span"), el("span", { class: "ausr-kopf" }, "☀ Tag"), el("span", { class: "ausr-kopf" }, "☾ Nacht"));
    for (const [label, tag, nacht] of [
      ["RTW / KTW", a.bodenTag, a.bodenNacht],
      ["NEF", a.nefTag, a.nefNacht],
      ["Hubschrauber", a.nahTag, a.nahNacht],
    ] as [string, [number, number], [number, number]][]) {
      ausrTab.append(el("span", { class: "ausr-art" }, label), bereich(tag), bereich(nacht));
    }
    const tabZeile = el("div", { class: "set-voll" });
    tabZeile.appendChild(ausrTab);
    const uw = klein(a.unterwegs, "1");
    uw.addEventListener("change", () => (a.unterwegs = Math.max(0, Number(uw.value) || 10)));
    const uwW = el("div", { class: "ausr-bereich" });
    uwW.append(uw, el("span", { class: "muted" }, "Sekunden"));
    const bp = klein(a.bereitschaftPlusMin, "1");
    bp.addEventListener("change", () => (a.bereitschaftPlusMin = Math.max(0, Number(bp.value) || 0)));
    const bpW = el("div", { class: "ausr-bereich" });
    bpW.append(el("span", { class: "muted" }, "+"), bp, el("span", { class: "muted" }, "min"));
    rSec.append(rGrid, tabZeile);
    const rGrid2 = el("div", { class: "set-grid" });
    rGrid2.append(el("label", {}, "Frei unterwegs"), uwW, el("label", {}, "Aus der Bereitschaft"), bpW);
    rSec.appendChild(rGrid2);

    // Flugrettung
    const nSec = section(
      "Flugrettung und Wetter",
      "Bei Nebel und Gewitter fliegt kein NAH. Nachts nur Hubschrauber mit „Nachtflugtauglich“ (Einstellungen → Leitstelle → Fahrzeuge). Das Wetter beeinflusst auch die Notrufe: Hitze bringt mehr Hitzenotfälle und Badeunfälle, Kälte mehr Unterkühlung und Infekte, Glätte mehr Stürze und Unfälle.",
    );
    const nGrid = el("div", { class: "set-grid" });
    const wa = el("input", { type: "checkbox" });
    wa.checked = draft.wetterAktiv;
    wa.addEventListener("change", () => (draft.wetterAktiv = wa.checked));
    nGrid.append(el("label", {}, "Wetter simulieren"), wa);
    // Wetter: Regler von „fix“ bis „sehr wechselhaft“
    const alt = draft.wetterModus === "fest" ? 0 : draft.wetterModus === "wechselhaft" ? 80 : 50;
    const wechselWert = draft.wetterWechsel ?? alt;
    const reglerBox = el("div", { class: "wetter-regler" });
    const wr = el("input", { type: "range", min: "0", max: "100", step: "1" });
    wr.value = String(wechselWert);
    const wrText = el("span", { class: "wetter-regler-text" });
    const skala = el("div", { class: "wetter-skala" });
    skala.append(el("span", {}, "fix"), el("span", {}, "sehr wechselhaft"));
    reglerBox.append(wr, skala, wrText);
    const echtCb = el("input", { type: "checkbox" });
    echtCb.checked = !!draft.wetterEcht;
    const echtWrap = el("div", { class: "row-btns" });
    echtWrap.append(echtCb, el("span", { class: "muted" }, "stündlich für die Funkgruppe (Open-Meteo, braucht Internet; ohne Verbindung wird simuliert)"));
    nGrid.append(el("label", { title: "Das echte Wetter zur Spielzeit – auch für vergangene Tage (Wetterarchiv) und bis 15 Tage voraus" }, "Echtes Wetter"), echtWrap);
    const wetterLbl = el("label", { title: "Wie oft und wie heftig sich das Wetter ändert. Ganz links bleibt es immer gleich." }, "Wetter");
    nGrid.append(wetterLbl, reglerBox);
    echtCb.addEventListener("change", () => {
      draft.wetterEcht = echtCb.checked;
      if (echtCb.checked && (draft.wetterWechsel ?? 50) <= 0) draft.wetterWechsel = 50;
      wr.value = String(draft.wetterWechsel ?? 50);
      wrZeigen();
      geaendert();
    });
    const festWrap = el("div", { class: "row-btns" });
    const fl = el("select");
    for (const [k, v] of Object.entries(WETTER_LABEL)) fl.appendChild(el("option", { value: k }, v));
    fl.value = draft.wetterFestLage ?? "klar";
    fl.addEventListener("change", () => {
      draft.wetterFestLage = fl.value as WetterLage;
      geaendert();
    });
    const ft = num(draft.wetterFestTemp ?? 18, "1");
    ft.min = "-25";
    ft.max = "40";
    ft.addEventListener("change", () => {
      draft.wetterFestTemp = Math.max(-25, Math.min(40, Number(ft.value) || 0));
      geaendert();
    });
    festWrap.append(fl, ft, el("span", { class: "muted" }, "°C"));
    const festLbl = el("label", {}, "Festes Wetter");
    nGrid.append(festLbl, festWrap);
    const wrZeigen = () => {
      const v = Number(wr.value);
      const takt = v >= 88 ? "etwa jede Stunde, auch heftig" : v >= 65 ? "etwa alle 1–2 Stunden" : v >= 30 ? "etwa alle 2–4 Stunden" : "selten, etwa alle 4–8 Stunden";
      wrText.textContent = v > 0 ? `${modusVon(v)} – ändert sich ${takt}` : "fix – immer das gewählte Wetter";
      festLbl.hidden = festWrap.hidden = v > 0 || !!draft.wetterEcht;
      wetterLbl.hidden = reglerBox.hidden = !!draft.wetterEcht;
    };
    wr.addEventListener("input", () => {
      draft.wetterWechsel = Number(wr.value);
      draft.wetterModus = undefined;
      wrZeigen();
      geaendert();
    });
    wrZeigen();
    const jz = el("select");
    for (const [v, l] of [
      ["auto", "nach Spieldatum"],
      ["fruehling", "Frühling"],
      ["sommer", "Sommer"],
      ["herbst", "Herbst"],
      ["winter", "Winter"],
    ])
      jz.appendChild(el("option", { value: v }, l));
    jz.value = draft.jahreszeit ?? "auto";
    jz.addEventListener("change", () => {
      draft.jahreszeit = jz.value as Settings["jahreszeit"];
      geaendert();
    });
    nGrid.append(el("label", { title: "Bestimmt Temperatur und Wetter – und damit, welche Notfälle häufiger sind (Hitze, Kälte, Glätte)" }, "Jahreszeit"), jz);
    const ns = num(draft.nahGeschwindigkeit, "10", "100");
    ns.addEventListener("change", () => (draft.nahGeschwindigkeit = Number(ns.value) || 220));
    nGrid.append(el("label", {}, "NAH Reisegeschwindigkeit (km/h)"), ns);

    const wSel = el("select");
    for (const [k, v] of Object.entries(WETTER_LABEL)) wSel.appendChild(el("option", { value: k }, v));
    wSel.value = sim.state.wetter.lage;
    const wBtn = el("button", { class: "btn small" }, "jetzt setzen");
    wBtn.addEventListener("click", () => {
      void sim
        .call("setWetter", wSel.value as WetterLage)
        .then(() => toast(`Wetter: ${WETTER_LABEL[wSel.value as WetterLage]}`))
        .catch((e) => toast(String(e.message ?? e), "error"));
    });
    const wWrap = el("div", { class: "row-btns" });
    wWrap.append(wSel, wBtn);
    nGrid.append(el("label", {}, "Wetter zum Testen setzen"), wWrap);
    nSec.appendChild(nGrid);
    // Wetter-Einstellungen geändert: ins laufende Spiel übernehmen (fließend) oder neu setzen
    const uebernahme = el("div", { class: "wetter-uebernahme", hidden: "" });
    const fliessend = el("button", { class: "btn small primary", type: "button" }, "Ins laufende Spiel übernehmen (fließend)");
    const neu = el("button", { class: "btn small danger-text", type: "button" }, "Wetter komplett neu setzen …");
    uebernahme.append(el("span", {}, "Wetter-Einstellungen geändert:"), fliessend, neu);
    nSec.appendChild(uebernahme);
    const wetterSpeichern = () => {
      const s = structuredClone(store.settings);
      Object.assign(s, { wetterEcht: draft.wetterEcht, wetterWechsel: draft.wetterWechsel, wetterModus: draft.wetterModus, wetterFestLage: draft.wetterFestLage, wetterFestTemp: draft.wetterFestTemp, jahreszeit: draft.jahreszeit, wetterAktiv: draft.wetterAktiv });
      store.setSettings(s);
    };
    fliessend.addEventListener("click", () => {
      wetterSpeichern();
      void sim
        .call("wetterUebernehmen", "fliessend")
        .then(() => {
          uebernahme.hidden = true;
          toast("Übernommen – das Wetter geht mit den nächsten Wechseln in das neue Muster über");
        })
        .catch((e) => toast(String(e.message ?? e), "error"));
    });
    neu.addEventListener("click", async () => {
      const ok = await confirmDialog(
        "Wetter komplett neu setzen",
        "Das aktuelle Wetter und die Vorhersage werden verworfen und sofort neu gesetzt – ohne Übergang (z. B. von Sonne direkt auf Regen). Einsätze, Fahrzeuge und Uhrzeit bleiben, wie sie sind.",
        "Neu setzen",
        true,
      );
      if (!ok) return;
      wetterSpeichern();
      void sim
        .call("wetterUebernehmen", "neu")
        .then(() => {
          uebernahme.hidden = true;
          toast("Wetter neu gesetzt");
        })
        .catch((e) => toast(String(e.message ?? e), "error"));
    });
    function geaendert() {
      const a = store.settings;
      uebernahme.hidden =
        !!draft.wetterEcht === !!a.wetterEcht &&
        (draft.wetterWechsel ?? -1) === (a.wetterWechsel ?? -1) && draft.wetterFestLage === a.wetterFestLage && draft.wetterFestTemp === a.wetterFestTemp && draft.jahreszeit === a.jahreszeit;
    }

    // KI-Anrufer
    buildKiSection(
      section(
        "Notrufe und KI-Anrufer",
        "Mit einem Abfrageschema (Einstellungen → Leitstelle → Einsatzcodes & Abfrage) kommen Einsätze als Anruf. Den Anrufer spielt eine KI (Ollama), die auf deinem Rechner läuft – ohne Internet und kostenlos. Ohne KI antwortet der Anrufer mit einfachen Sätzen.",
      ),
      draft,
    );

    // Aktionen
    const act = el("div", { class: "set-actions" });
    const save = el("button", { class: "btn primary" }, "Speichern");
    save.addEventListener("click", () => {
      const wetterNeu = !uebernahme.hidden;
      store.setSettings(draft);
      void sim.call("neuPlanen").catch(() => undefined);
      // geänderte Wetter-Einstellungen beim Speichern fließend übernehmen
      if (wetterNeu) {
        uebernahme.hidden = true;
        void sim.call("wetterUebernehmen", "fliessend").catch(() => undefined);
      }
      toast("Einstellungen gespeichert");
    });
    const reset = el("button", { class: "btn" }, "Standard wiederherstellen");
    reset.addEventListener("click", async () => {
      if (await confirmDialog("Standard wiederherstellen", "Alle Einstellungen auf die Standardwerte zurücksetzen?", "Zurücksetzen", true)) {
        store.resetSettings();
        void sim.call("neuPlanen").catch(() => undefined);
        render();
      }
    });
    act.append(save, reset);
    page.appendChild(act);
  }

  function programmTeil(section: (title: string, hint?: string) => HTMLElement): void {
    // Kartenpakete und Programm
    buildPacksSection(
      section(
        "Kartenpakete",
        "Grundpaket und Straßen Niederösterreich sind immer installiert. Straßen weiterer Bundesländer, Detailkarten und Gelände für die 3D-Ansicht kannst du bei Bedarf dazuladen, ein- und ausschalten oder wieder löschen. Ohne Straßenpaket eines Bundeslands gibt es keine Transporte dorthin. Im Mehrspieler brauchen alle dieselben Straßenpakete. Das Satellitenbild wird online geladen und braucht kein Paket.",
      ),
    );
    buildAppSection(section("Programm"));

    // Eigene Dateien in Dokumente/LeitWerk: Spielstände und alles Importierte
    const ssSec = section(
      "Eigene Dateien & Spielstände",
      "Spielstände und alles, was du selbst dazugibst (Abfrageschema, Codelisten, Daten, Fälle, Töne, Designs, Anordnungen), liegt zusätzlich als Datei in Dokumente/LeitWerk – je Art in einem eigenen Ordner. Eigene Codelisten und Abfrageschemas wählst du unter Einsatzcodes & Abfrage.",
    );
    const ssPfad = el("div", { class: "muted small" }, "…");
    void ablageBasis().then((p) => (ssPfad.textContent = p));
    const ssListe = el("ul", { class: "ablage-liste" });
    for (const [o, t] of Object.entries({ Spielstände: "gespeicherte Spiele", ...ABLAGE_INFO })) {
      const li = el("li");
      li.append(el("b", {}, o), el("span", { class: "muted" }, ` – ${t}`));
      if (inTauri()) {
        const b = el("button", { class: "btn small", type: "button" }, "Öffnen");
        b.addEventListener("click", () => void (o === "Spielstände" ? ordnerZeigen() : ablageZeigen(o as AblageOrdner)).catch((e) => toast(String(e?.message ?? e), "error")));
        li.appendChild(b);
      }
      ssListe.appendChild(li);
    }
    const ssKn = el("div", { class: "row-btns" });
    const ssUeb = el("button", { class: "btn small primary", type: "button" }, "Spielstände ansehen …");
    ssUeb.addEventListener("click", () => spielstaendeOeffnen({ warnen: sim.state.einsaetze.length > 0 }));
    ssKn.appendChild(ssUeb);
    if (inTauri()) {
      const ssOrd = el("button", { class: "btn small", type: "button" }, "Ordner LeitWerk öffnen");
      ssOrd.addEventListener("click", () => void ablageZeigen().catch((e) => toast(String(e?.message ?? e), "error")));
      ssKn.appendChild(ssOrd);
    }
    ssSec.append(ssPfad, ssListe, ssKn);

    // Status von Straßennetz/Adressen
    const gSec = section("Straßennetz und Adressen");
    const gInfo = el("div", { class: "muted" }, "wird geprüft …");
    gSec.appendChild(gInfo);
    void geoStatus().then((g) => {
      const bl = (g.regionen ?? []).map((r) => (r === "alt" ? "älteres Gesamtnetz" : (REGIONEN[r] ?? r))).join(", ");
      gInfo.innerHTML = `Straßennetz: <b>${esc(g.roads)}</b>${g.roads_nodes ? ` (${g.roads_nodes.toLocaleString("de-AT")} Knoten)` : ""} · Adressen: <b>${esc(g.addresses)}</b>${g.address_count ? ` (${g.address_count.toLocaleString("de-AT")})` : ""}${bl ? `<br>Bundesländer: ${esc(bl)}` : ""}`;
    });

  }

  render();
  return { refresh: render };
}
