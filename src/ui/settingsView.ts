/** Reiter „Einstellungen“: Statusmodell, Einsatzaufkommen, Stufen-Zuordnung, Fahrzeiten, Flugrettung. */
import { store } from "../data/store";
import { sim } from "../sim/engine";
import { geoStatus } from "../sim/geo";
import { GEBIETE, KATEGORIEN, KATEGORIE_LABEL, NOTARZT_LABEL, defaultStufeFuer, type Kategorie, type NotarztRegel, type Settings } from "../sim/settings";
import { codeKategorien } from "../sim/codes";
import { WETTER_LABEL, type WetterLage } from "../sim/weather";
import { confirmDialog } from "./dialog";
import { buildAppSection, buildPacksSection } from "./packsView";
import { buildKiSection } from "./kiView";
import { el, esc, toast } from "./dom";

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

export function createSettingsView(container: HTMLElement): { refresh(): void } {
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

    // Aufkommen
    const aSec = section(
      "Einsatzaufkommen",
      "Wie viele Notfälle und Krankentransporte pro Stunde kommen, steht in der Tabelle darunter. Hier stellst du ein, wie sich die Notfälle auf die Kategorien verteilen (Anteile).",
    );
    const aGrid = el("div", { class: "set-grid" });
    for (const k of KATEGORIEN) {
      const i = num(draft.aufkommen[k], "0.5");
      i.addEventListener("change", () => (draft.aufkommen[k as Kategorie] = Number(i.value) || 0));
      aGrid.append(el("label", {}, `Anteil ${KATEGORIE_LABEL[k]}`), i);
    }
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
    for (const g of GEBIETE) geb.appendChild(el("option", { value: g.name }, g.name));
    geb.value = draft.gebiet.name;
    geb.addEventListener("change", () => (draft.gebiet = GEBIETE.find((g) => g.name === geb.value) ?? GEBIETE[0]));
    aGrid.append(el("label", {}, "Einsatzgebiet"), geb);
    const fa = num(draft.falscheAdresseProzent);
    fa.addEventListener("change", () => (draft.falscheAdresseProzent = Number(fa.value) || 0));
    aGrid.append(el("label", {}, "Anrufer mit falscher Adresse (%)"), fa);
    const kSel = el("select");
    for (const [v, l] of [["ruhig", "ruhig – selten Überraschungen"], ["normal", "normal – etwa jeder 10. Einsatz verändert sich"], ["fordernd", "fordernd – oft Verschlechterungen und Irrtümer"]]) kSel.appendChild(el("option", { value: v }, l));
    kSel.value = draft.komplikationen ?? "normal";
    kSel.addEventListener("change", () => (draft.komplikationen = kSel.value as Settings["komplikationen"]));
    aGrid.append(el("label", {}, "Komplikationen (Verschlechterung, Irrtum des Anrufers, mehr Betroffene)"), kSel);
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
    aSec.appendChild(dGrid);

    // Stufen
    const stSec = section(
      "Stufen-Zuordnung",
      "Je Kategorie der Einsatzcodes (neue Kategorien aus einem Import erscheinen hier automatisch mit Standardwerten). Rettungsmittel nach Rangfolge: „>“ trennt die Ränge, „/“ heißt gleichwertig (z. B. KTW>RTW>RTW-C oder RTW/RTW-C). Ein schlechter passendes Rettungsmittel wird nur vorgeschlagen, wenn das besser passende mehr als die Toleranz länger braucht. NFS: ohne Notfallsanitäter an Bord kommt ein NEF dazu. Notarzt „NEF bevorzugt“: ein NAH nur, wenn er mehr als die Toleranz schneller ist.",
    );
    // Kategorien aus der importierten Codeliste, die noch keine Zuordnung haben
    for (const k of codeKategorien()) {
      if (!draft.stufen.some((x) => x.stufe === k)) draft.stufen.push(defaultStufeFuer(k));
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
    const bereich = (label: string, wert: [number, number]) => {
      const lo = num(Math.round((wert[0] / 60) * 10) / 10, "0.5");
      const hi = num(Math.round((wert[1] / 60) * 10) / 10, "0.5");
      lo.addEventListener("change", () => (wert[0] = Math.max(0, Number(lo.value) || 0) * 60));
      hi.addEventListener("change", () => (wert[1] = Math.max(wert[0] / 60, Number(hi.value) || 0) * 60));
      const w = el("div", { class: "row-btns" });
      w.append(lo, el("span", { class: "muted" }, "bis"), hi, el("span", { class: "muted" }, "min"));
      rGrid.append(el("label", {}, label), w);
    };
    const tv = num(a.tagVon, "1");
    const tb = num(a.tagBis, "1");
    tv.addEventListener("change", () => (a.tagVon = Math.min(23, Math.max(0, Number(tv.value) || 0))));
    tb.addEventListener("change", () => (a.tagBis = Math.min(24, Math.max(0, Number(tb.value) || 0))));
    const tw = el("div", { class: "row-btns" });
    tw.append(tv, el("span", { class: "muted" }, "bis"), tb, el("span", { class: "muted" }, "Uhr"));
    rGrid.append(el("label", {}, "Tag (sonst Nacht)"), tw);
    bereich("Bodengebunden – Tag", a.bodenTag);
    bereich("Bodengebunden – Nacht", a.bodenNacht);
    bereich("Hubschrauber – Tag", a.nahTag);
    bereich("Hubschrauber – Nacht", a.nahNacht);
    const uw = num(a.unterwegs, "1");
    uw.addEventListener("change", () => (a.unterwegs = Math.max(0, Number(uw.value) || 10)));
    rGrid.append(el("label", {}, "Frei unterwegs (Sekunden)"), uw);
    const bp = num(a.bereitschaftPlusMin, "1");
    bp.addEventListener("change", () => (a.bereitschaftPlusMin = Math.max(0, Number(bp.value) || 0)));
    rGrid.append(el("label", {}, "Bereitschaft: zusätzlich (Minuten)"), bp);
    rSec.appendChild(rGrid);

    // Flugrettung
    const nSec = section("Flugrettung und Wetter", "Bei Nebel und Gewitter fliegt kein NAH. Nachts nur Hubschrauber mit „Nachtflugtauglich“ (Reiter Daten → Fahrzeuge).");
    const nGrid = el("div", { class: "set-grid" });
    const wa = el("input", { type: "checkbox" });
    wa.checked = draft.wetterAktiv;
    wa.addEventListener("change", () => (draft.wetterAktiv = wa.checked));
    nGrid.append(el("label", {}, "Wetter simulieren"), wa);
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

    // KI-Anrufer
    buildKiSection(
      section(
        "Notrufe und KI-Anrufer",
        "Mit einem Abfrageschema (Daten → Einsatzcodes) kommen Einsätze als Anruf. Den Anrufer spielt eine KI (Ollama), die auf deinem Rechner läuft – ohne Internet und kostenlos. Ohne KI antwortet der Anrufer mit einfachen Sätzen.",
      ),
      draft,
    );

    // Kartenpakete und Programm
    buildPacksSection(
      section(
        "Kartenpakete",
        "Das Grundpaket ist immer installiert. Detailkarten und Gelände für die 3D-Ansicht kannst du bei Bedarf dazuladen oder wieder löschen. Das Satellitenbild wird online geladen und braucht kein Paket.",
      ),
    );
    buildAppSection(section("Programm"));

    // Status von Straßennetz/Adressen
    const gSec = section("Straßennetz und Adressen");
    const gInfo = el("div", { class: "muted" }, "wird geprüft …");
    gSec.appendChild(gInfo);
    void geoStatus().then((g) => {
      gInfo.innerHTML = `Straßennetz: <b>${esc(g.roads)}</b>${g.roads_nodes ? ` (${g.roads_nodes.toLocaleString("de-AT")} Knoten)` : ""} · Adressen: <b>${esc(g.addresses)}</b>${g.address_count ? ` (${g.address_count.toLocaleString("de-AT")})` : ""}`;
    });

    // Aktionen
    const act = el("div", { class: "set-actions" });
    const save = el("button", { class: "btn primary" }, "Speichern");
    save.addEventListener("click", () => {
      store.setSettings(draft);
      void sim.call("neuPlanen").catch(() => undefined);
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

  render();
  return { refresh: render };
}
