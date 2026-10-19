/** Formular zum Anlegen und Bearbeiten von Dienststellen, Fahrzeugen, Krankenhäusern und POIs. */
import { partnerArtVonTyp } from "../sim/partner";
import {
  AUSFUEHRUNGEN,
  MODELL_WAHL,
  KIND_SINGULAR,
  ORIGIN_LABEL,
  STATION_TYPES,
  VEHICLE_CATEGORIES,
  type Hospital,
  type Kind,
  type KindMap,
  type Origin,
  type Poi,
  type Station,
  type Vehicle,
  type VehicleCategory,
  type Einsatzvorlage,
  type Einsatzcode,
} from "../data/model";
import { store } from "../data/store";
import { akutMoeglich, EINRICHTUNG_TYP_LABEL, EINRICHTUNGEN, einrichtungenAusAlt, type EinrichtungTyp } from "../data/klinik";
import { codeKategorien } from "../sim/codes";
import { confirmDialog, openDialog } from "./dialog";
import { el, toast } from "./dom";
import { dienstplanEditor } from "./dienstplanEditor";
import { ORT_KATEGORIEN, POI_KATEGORIEN, kategorienText, poiKategorien } from "../data/orte";
import type { Schicht } from "../sim/dienst";

export interface EditorDeps {
  /** Wechselt zur Karte, lässt einen Punkt wählen und kehrt zurück */
  pickOnMap(hint: string): Promise<{ lat: number; lon: number } | null>;
}

const ID_PREFIX: Record<Kind, string> = { stations: "ds", vehicles: "fz", hospitals: "kh", pois: "poi", templates: "ev", codes: "code" };

function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  const wrap = el("label", { class: "fld" });
  wrap.append(el("span", { class: "fld-label" }, label), input);
  if (hint) wrap.append(el("span", { class: "fld-hint" }, hint));
  return wrap;
}

function textInput(value: string, placeholder = ""): HTMLInputElement {
  const i = el("input", { type: "text", placeholder });
  i.value = value;
  return i;
}

function selectInput(options: [string, string][], value: string): HTMLSelectElement {
  const s = el("select");
  for (const [v, label] of options) {
    const o = el("option", { value: v }, label);
    if (v === value) o.selected = true;
    s.appendChild(o);
  }
  return s;
}

function checkbox(label: string, checked: boolean): [HTMLElement, HTMLInputElement] {
  const wrap = el("label", { class: "chk" });
  const i = el("input", { type: "checkbox" });
  i.checked = checked;
  wrap.append(i, el("span", {}, label));
  return [wrap, i];
}

function parseNum(v: string): number {
  return Number(v.trim().replace(",", "."));
}

/**
 * Öffnet den Editor. existingId = null legt neu an; preset füllt Koordinaten vor.
 */
export function openEditor(
  kind: Kind,
  existingId: string | null,
  deps: EditorDeps,
  preset: { lat?: number; lon?: number; dienststelleId?: string } = {},
): void {
  const existing = existingId ? (store.get(kind, existingId) as KindMap[Kind] | undefined) : undefined;
  const form = el("div", { class: "form-grid" });
  const g = (k: string): string => ((existing as unknown as Record<string, unknown>)?.[k] as string) ?? "";

  // Felder je Art
  const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  const add = (key: string, label: string, input: HTMLInputElement | HTMLSelectElement, hint?: string, wide = false) => {
    inputs[key] = input;
    const f = field(label, input, hint);
    if (wide) f.classList.add("wide");
    form.appendChild(f);
  };

  let einrInputs: Record<string, HTMLInputElement> = {};
  let akutInputs: Record<string, HTMLInputElement> = {};
  let katInputs: Record<string, HTMLInputElement> = {};

  let aktivInput: HTMLInputElement | null = null;
  let ausweich: { chk: HTMLInputElement; sel: HTMLSelectElement } | null = null;
  let nachtInput: HTMLInputElement | null = null;
  let dienstplan: { wert(): Schicht[] } | null = null;

  const addPosition = (lat: number | undefined, lon: number | undefined, nameKey: string) => {
    add("lat", "Breitengrad *", textInput(lat !== undefined ? lat.toFixed(6) : "", "48.20000"));
    add("lon", "Längengrad *", textInput(lon !== undefined ? lon.toFixed(6) : "", "15.63000"));
    const pick = el("button", { class: "btn small", type: "button" }, "Position auf der Karte wählen");
    pick.addEventListener("click", async () => {
      dlg.hide();
      const p = await deps.pickOnMap(`Position für „${(inputs[nameKey] as HTMLInputElement | undefined)?.value || KIND_SINGULAR[kind]}“ anklicken`);
      dlg.show();
      if (p) {
        (inputs.lat as HTMLInputElement).value = p.lat.toFixed(6);
        (inputs.lon as HTMLInputElement).value = p.lon.toFixed(6);
      }
    });
    const pickWrap = el("div", { class: "fld wide" });
    pickWrap.appendChild(pick);
    form.appendChild(pickWrap);
  };

  if (kind === "vehicles") {
    const v = existing as Vehicle | undefined;
    add("funkrufname", "Funkrufname *", textInput(v?.funkrufname ?? "", "z. B. 75/001"), "RTW/KTW: 75/001 · NEF: 75/099 · NAH: 99/002");
    add("kurzname", "Kurzname", textInput(v?.kurzname ?? "", "z. B. Christophorus 2"));
    // Fahrzeugart; ein zweites Feld nur, wo es etwas zu unterscheiden gibt (RTW / RTW groß / RTW-C …)
    const katStart = v?.kategorie === "EL ÖBB" ? "BEL" : (v?.kategorie ?? "RTW");
    add(
      "kategorie",
      "Fahrzeugart",
      selectInput(VEHICLE_CATEGORIES.filter((c) => c !== "EL ÖBB").map((c) => [c, c === "BEL" ? "EL (BEL / EL ÖBB)" : c]), katStart),
    );
    add("ausfuehrung", "Ausführung", selectInput([], ""));
    add("modell", "Fahrzeug", selectInput([], ""), "Wirkt auf die 3D-Ansicht");
    const ausStart = (): string => {
      const t = (v?.typ ?? "").toUpperCase().replace(/\s+/g, "");
      switch (katStart) {
        case "RTW":
          return t.includes("RTW-C") || t === "RTWC" ? (v?.aufbau === "klein" ? "rtw" : "rtwc") : v?.aufbau === "gross" ? "rtw_gross" : "rtw";
        case "KTW":
          return /^KTW-?B$/.test(t) ? "ktwb" : "ktw";
        case "NEF":
          return /ÖAMTC|OEAMTC/.test(t) || v?.ersatzFuer ? "nef_oeamtc" : "nef";
        case "BEL":
          return v?.kategorie === "EL ÖBB" ? "el_oebb" : "bel";
        default:
          return "";
      }
    };
    const artFelder = () => {
      const kat = (inputs.kategorie as HTMLSelectElement).value as VehicleCategory;
      const aSel = inputs.ausfuehrung as HTMLSelectElement;
      const mSel = inputs.modell as HTMLSelectElement;
      const alt = aSel.value;
      const ausf = AUSFUEHRUNGEN[kat] ?? [];
      aSel.innerHTML = "";
      for (const a of ausf) aSel.appendChild(el("option", { value: a.id }, a.label));
      if (ausf.some((a) => a.id === alt)) aSel.value = alt;
      else if (kat === katStart && ausf.some((a) => a.id === ausStart())) aSel.value = ausStart();
      (aSel.closest(".fld") as HTMLElement).hidden = !ausf.length;
      const kZiel = ausf.find((a) => a.id === aSel.value)?.kategorie ?? kat;
      const mw = MODELL_WAHL[kZiel] ?? [];
      const altM = mSel.value || v?.modell || "";
      mSel.innerHTML = "";
      if (mw.length) mSel.appendChild(el("option", { value: "" }, "zufällig"));
      for (const [id, label] of mw) mSel.appendChild(el("option", { value: id }, label));
      mSel.value = mw.some(([id]) => id === altM) ? altM : "";
      (mSel.closest(".fld") as HTMLElement).hidden = !mw.length;
    };
    (inputs.kategorie as HTMLSelectElement).addEventListener("change", artFelder);
    (inputs.ausfuehrung as HTMLSelectElement).addEventListener("change", artFelder);
    artFelder();
    // Feuerwehr, Polizei, Berg- und Wasserrettung haben keine eigenen Fahrzeuge in der Liste
    const stations = store
      .list("stations")
      .filter((s) => !partnerArtVonTyp(s.typ) || s.id === (v?.dienststelleId ?? preset.dienststelleId))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    add(
      "dienststelle",
      "Dienststelle *",
      selectInput(
        [["", "– bitte wählen –"], ...stations.map((s) => [s.id, s.name] as [string, string])],
        v?.dienststelleId ?? preset.dienststelleId ?? "",
      ),
      undefined,
      true,
    );
    const [wrap, input] = checkbox("Aktiv (wird in der Simulation eingesetzt)", v?.aktiv ?? true);
    aktivInput = input;
    form.appendChild(wrap);
    const [wrapN, inputN] = checkbox("Nachtflugtauglich", v?.nachtflug ?? false);
    nachtInput = inputN;
    form.appendChild(wrapN);
    // Ausweichfahrzeug (NEF) für einen Hubschrauber
    const nahs = store
      .list("vehicles")
      .filter((x) => x.kategorie === "NAH")
      .sort((a, b) => a.funkrufname.localeCompare(b.funkrufname, "de", { numeric: true }));
    const ausBox = el("div", { class: "fld wide ausweich-box" });
    const [ausWrap, ausChk] = checkbox("Nur Ausweichfahrzeug für einen Hubschrauber", !!v?.ersatzFuer);
    const ausSel = selectInput(
      nahs.map((n) => [n.funkrufname, `${n.funkrufname}${n.kurzname ? ` · ${n.kurzname}` : ""}`] as [string, string]),
      v?.ersatzFuer || nahs.find((n) => n.dienststelleId === (v?.dienststelleId ?? preset.dienststelleId))?.funkrufname || nahs[0]?.funkrufname || "",
    );
    const ausInfo = el("div", { class: "fld-hint" });
    ausBox.append(ausWrap, ausSel, ausInfo);
    form.appendChild(ausBox);
    ausweich = { chk: ausChk, sel: ausSel };
    // beim Hubschrauber: welches NEF ihn vertritt
    const vertreter = v ? store.list("vehicles").filter((x) => x.ersatzFuer && (x.ersatzFuer === v.funkrufname || x.ersatzFuer === v.kurzname)) : [];
    const nahInfo = el("div", { class: "fld wide fld-hint" }, vertreter.length ? `Ausweich-NEF: ${vertreter.map((x) => x.funkrufname).join(", ")} – fährt mit dieser Besatzung, wenn der Hubschrauber nicht fliegen kann oder abgemeldet ist.` : "Kein Ausweich-NEF. Ein NEF wird zum Ausweichfahrzeug, wenn du bei ihm „Nur Ausweichfahrzeug“ wählst.");
    form.appendChild(nahInfo);
    const dpWrap = el("div", { class: "fld wide" });
    dpWrap.appendChild(el("label", {}, "Dienstplan (Schichten – jede Schicht hat ein eigenes Team)"));
    const heimSt = v ? (store.get("stations", v.dienststelleId) as Station | undefined) : undefined;
    const dpe = dienstplanEditor(v?.dienstplan, heimSt ? { lat: heimSt.lat, lon: heimSt.lon } : undefined);
    dienstplan = dpe;
    dpWrap.appendChild(dpe.root);
    form.appendChild(dpWrap);
    const dpErsatz = el("div", { class: "fld wide fld-hint" });
    form.appendChild(dpErsatz);
    const katSel = inputs.kategorie as HTMLSelectElement;
    const sichtbar = () => {
      const kat = katSel.value;
      wrapN.hidden = kat !== "NAH" && kat !== "ITH";
      nahInfo.hidden = kat !== "NAH";
      ausBox.hidden = kat !== "NEF";
      const aus = kat === "NEF" && ausChk.checked;
      ausSel.hidden = !aus;
      ausInfo.textContent = aus
        ? `Im Dienst nur, wenn ${ausSel.value} im Dienst ist, aber wegen des Wetters nicht fliegen kann. Nacht ist kein Grund: fliegt der Hubschrauber nur bei Tag, gibt es in der Nacht kein Ersatz-NEF. Besatzung wie am Hubschrauber (ohne Pilot). Fliegt er wieder, meldet sich das NEF nach dem laufenden Einsatz ab.`
        : "Normales NEF mit eigenem Dienstplan.";
      dpWrap.hidden = aus;
      dpErsatz.hidden = !aus;
      dpErsatz.textContent = `Dienstplan: wie ${ausSel.value} – nur bei Flugverbot oder wenn der Hubschrauber abgemeldet ist.`;
    };
    katSel.addEventListener("change", sichtbar);
    ausChk.addEventListener("change", sichtbar);
    ausSel.addEventListener("change", sichtbar);
    sichtbar();

  } else if (kind === "codes") {
    const c = existing as Einsatzcode | undefined;
    add("code", "Code *", textInput(c?.code ?? "", "z. B. 18-S2-02"));
    const kat = textInput(c?.kategorie ?? "", "z. B. ALS rot");
    const dl = el("datalist", { id: "kategorien-liste" });
    for (const k of [...new Set([...store.settings.stufen.map((s) => s.stufe), ...codeKategorien()])]) dl.appendChild(el("option", { value: k }));
    kat.setAttribute("list", "kategorien-liste");
    add("kategorie", "Kategorie (Stufe)", kat, "bestimmt Fahrzeugvorschlag, Sondersignal und Dringlichkeit");
    form.appendChild(dl);
    add("name", "Name *", textInput(c?.name ?? ""), undefined, true);
    add("kapitel", "Kapitel", textInput(c?.kapitel ?? "", "z. B. 10 - Brustschmerz"), undefined, true);
  } else if (kind === "templates") {
    const t = existing as Einsatzvorlage | undefined;
    add("code", "Einsatzcode *", textInput(t?.code ?? "", "z. B. 18-S2-02"));
    add("patient_alter", "Patientenalter", textInput(t?.patientAlter === null || t?.patientAlter === undefined ? "" : String(t.patientAlter), "leer = zufällig"));
    add("adresse", "Adresse (wie vom Anrufer genannt)", textInput(t?.adresse ?? ""), undefined, true);
    add("meldung", "Meldung des Anrufers", textInput(t?.meldung ?? ""), undefined, true);
    add(
      "transport",
      "Transport",
      selectInput(
        [["", "zufällig (nach Stufe)"], ["ja", "ja"], ["nein", "nein"]],
        t?.transport === null || t?.transport === undefined ? "" : t.transport ? "ja" : "nein",
      ),
    );
    form.appendChild(el("div", { class: "fld" }));
    addPosition(preset.lat ?? t?.lat, preset.lon ?? t?.lon, "adresse");
  } else {
    add("name", "Name *", textInput(g("name")), undefined, true);
    if (kind === "stations") {
      const s = existing as Station | undefined;
      add("typ", "Typ", selectInput(STATION_TYPES.map((t) => [t, t]), s?.typ ?? "Rettungsdienst"));
      add("organisation", "Organisation", textInput(s?.organisation ?? "", "z. B. Rotes Kreuz"));
      add("ort", "Ort", textInput(s?.ort ?? ""));
      add("bezirk", "Bezirk", textInput(s?.bezirk ?? ""));
      add("adresse", "Adresse", textInput(s?.adresse ?? ""), undefined, true);
    } else if (kind === "hospitals") {
      const h = existing as Hospital | undefined;
      add("kurzname", "Kurzname", textInput(h?.kurzname ?? "", "z. B. UK Krems"));
      add("ort", "Ort", textInput(h?.ort ?? ""));
    } else {
      const p = existing as Poi | undefined;
      add("ort", "Ort", textInput(p?.ort ?? ""));
      // Kategorien (mehrere möglich): bestimmen, wofür der Ort im Spiel verwendet wird
      const gesetzt = p ? poiKategorien(p) : [];
      const eigenTeile = (p?.typ ?? "")
        .split(/[,;/|]+/)
        .map((x) => x.trim())
        .filter((x) => x && !ORT_KATEGORIEN.some((k) => k.label.toLowerCase() === x.toLowerCase() || k.key === x.toLowerCase() || (!k.liste && k.key !== "sonstiges" && k.muster.test(x))));
      const box = el("div", { class: "flag-grid wide" });
      box.appendChild(el("div", { class: "fld-label" }, "Kategorien (mehrere möglich) – bestimmen, welche Notfälle hier passieren"));
      katInputs = {};
      for (const k of POI_KATEGORIEN.filter((x) => x.key !== "sonstiges")) {
        const [wrap, input] = checkbox(k.label, gesetzt.includes(k.key));
        wrap.title = k.wirkung;
        katInputs[k.key] = input;
        box.appendChild(wrap);
      }
      form.appendChild(box);
      add("typ_eigen", "Sonstiges (eigene Bezeichnung)", textInput(eigenTeile.join(", "), "z. B. Kirche, Campingplatz"), "Krankenhäuser und Dienststellen sind eigene Listen und zählen automatisch als Orte", true);
    }
    const geo = existing as Station | Hospital | Poi | undefined;
    addPosition(preset.lat ?? geo?.lat, preset.lon ?? geo?.lon, "name");

    if (kind === "hospitals") {
      const h = existing as Hospital | undefined;
      const vorher = new Set(h?.einrichtungen?.length ? h.einrichtungen : h ? einrichtungenAusAlt(h.abteilungen, h.bereiche) : []);
      const aus = new Set(h?.akutAus ?? []);
      einrInputs = {};
      akutInputs = {};
      // Akut-Abteilungen: ergeben sich aus den Einrichtungen, einzeln abschaltbar
      const akutBox = el("div", { class: "flag-grid wide akut-grid" });
      const akutZeigen = () => {
        const an = Object.entries(einrInputs).filter(([, i]) => i.checked).map(([k]) => k);
        for (const [k, i] of Object.entries(akutInputs)) if (!i.checked) aus.add(k);
        for (const [k, i] of Object.entries(akutInputs)) if (i.checked) aus.delete(k);
        akutBox.innerHTML = "";
        akutBox.appendChild(el("div", { class: "fld-label" }, "Akut-Abteilungen (ergeben sich aus den Einrichtungen – Häkchen weg = nimmt nicht akut auf)"));
        akutInputs = {};
        const liste = akutMoeglich(an);
        for (const a2 of liste) {
          const [wrap, input] = checkbox(a2.name, !aus.has(a2.id));
          akutInputs[a2.id] = input;
          akutBox.appendChild(wrap);
        }
        if (!liste.length) akutBox.appendChild(el("div", { class: "muted" }, "keine – erst Einrichtungen anhaken"));
      };
      for (const typ of Object.keys(EINRICHTUNG_TYP_LABEL) as EinrichtungTyp[]) {
        const det = el("details", { class: "fld wide einr-gruppe" });
        const liste = EINRICHTUNGEN.filter((x) => x.typ === typ);
        const n = liste.filter((x) => vorher.has(x.id)).length;
        det.appendChild(el("summary", {}, `${EINRICHTUNG_TYP_LABEL[typ]} (${n} von ${liste.length})`));
        const grid = el("div", { class: "flag-grid wide" });
        for (const x of liste) {
          const [wrap, input] = checkbox(x.name, vorher.has(x.id));
          einrInputs[x.id] = input;
          input.addEventListener("change", akutZeigen);
          grid.appendChild(wrap);
        }
        det.appendChild(grid);
        form.appendChild(det);
      }
      akutZeigen();
      form.appendChild(akutBox);
    }
  }
  add("hinweis", "Hinweis", textInput(g("hinweis")), undefined, true);

  if (existing) {
    form.appendChild(
      el(
        "div",
        { class: "fld wide fld-hint" },
        `ID: ${existing.id} · Quelle: ${ORIGIN_LABEL[existing.herkunft]}${
          existing.herkunft === "standard" ? " (Änderungen werden als eigene Daten gespeichert)" : ""
        }`,
      ),
    );
  }

  const save = (): boolean => {
    const val = (k: string) => (inputs[k]?.value ?? "").trim();
    const herkunft: Origin = existing && existing.herkunft === "import" ? "import" : "manuell";
    const id = existing?.id ?? store.newId(ID_PREFIX[kind]);
    const base = { id, hinweis: val("hinweis"), herkunft, herkunftDetail: existing?.herkunftDetail };

    if (kind === "codes") {
      if (!val("code")) return fail("Bitte einen Code eingeben.");
      if (!val("name")) return fail("Bitte einen Namen eingeben.");
      const doppelt = store.list("codes").find((x) => x.code === val("code") && x.id !== existing?.id);
      if (doppelt) return fail(`Den Code ${val("code")} gibt es schon.`);
      const c: Einsatzcode = {
        ...base,
        id: existing?.id ?? val("code"),
        code: val("code"),
        name: val("name"),
        kategorie: val("kategorie"),
        kapitel: val("kapitel"),
      };
      store.upsert("codes", [c]);
    } else if (kind === "vehicles") {
      if (!val("funkrufname")) return fail("Bitte einen Funkrufnamen eingeben.");
      if (!val("dienststelle")) return fail("Bitte eine Dienststelle wählen.");
      const v: Vehicle = {
        ...base,
        funkrufname: val("funkrufname"),
        kurzname: val("kurzname"),
        kategorie: (AUSFUEHRUNGEN[val("kategorie") as VehicleCategory]?.find((x) => x.id === val("ausfuehrung"))?.kategorie ?? val("kategorie")) as VehicleCategory,
        typ: AUSFUEHRUNGEN[val("kategorie") as VehicleCategory]?.find((x) => x.id === val("ausfuehrung"))?.typ ?? (existing && (existing as Vehicle).kategorie === val("kategorie") ? (existing as Vehicle).typ : val("kategorie")),
        dienststelleId: val("dienststelle"),
        aktiv: aktivInput?.checked ?? true,
        nachtflug: nachtInput?.checked ?? false,
        dienstplan: dienstplan?.wert() ?? [],
        // leer = bewusst kein Ausweichfahrzeug (Standard-Zuordnung wird dann nicht ergänzt)
        ersatzFuer: val("kategorie") === "NEF" && ausweich?.chk.checked ? ausweich.sel.value : "",
      };
      const ausf = AUSFUEHRUNGEN[val("kategorie") as VehicleCategory]?.find((x) => x.id === val("ausfuehrung"));
      if (ausf?.aufbau) v.aufbau = ausf.aufbau;
      if (val("modell")) v.modell = val("modell");
      const geaendert: Vehicle[] = [v];
      // Regel: nur ein RTW-C je Dienststelle – ein anderer wird zum großen RTW
      if (v.typ.trim().toUpperCase() === "RTW-C") {
        v.typ = "RTW-C";
        for (const x of store.list("vehicles")) {
          if (x.id !== v.id && x.dienststelleId === v.dienststelleId && x.typ.trim().toUpperCase() === "RTW-C") {
            geaendert.push({ ...x, typ: "RTW", aufbau: "gross" });
            toast(`${x.funkrufname} ist jetzt RTW (Großraum) – je Dienststelle gibt es nur einen RTW-C`);
          }
        }
      }
      store.upsert("vehicles", geaendert);
    } else if (kind === "templates") {
      if (!val("code")) return fail("Bitte einen AMPDS-Code eingeben.");
      const lat = parseNum(val("lat"));
      const lon = parseNum(val("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fail("Bitte die Position wählen.");
      const alter = val("patient_alter");
      const t: Einsatzvorlage = {
        ...base,
        code: val("code"),
        adresse: val("adresse"),
        meldung: val("meldung"),
        lat,
        lon,
        patientAlter: alter === "" ? null : Number(alter),
        transport: val("transport") === "" ? null : val("transport") === "ja",
      };
      store.upsert("templates", [t]);
    } else {
      if (!val("name")) return fail("Bitte einen Namen eingeben.");
      const lat = parseNum(val("lat"));
      const lon = parseNum(val("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 44 || lat > 52 || lon < 7 || lon > 21) {
        return fail("Bitte gültige Koordinaten eingeben oder die Position auf der Karte wählen.");
      }
      const geo = { ...base, name: val("name"), lat, lon };
      if (kind === "stations") {
        const s: Station = {
          ...geo,
          typ: val("typ"),
          organisation: val("organisation"),
          ort: val("ort"),
          bezirk: val("bezirk"),
          adresse: val("adresse"),
        };
        store.upsert("stations", [s]);
      } else if (kind === "hospitals") {
        const einrichtungen = EINRICHTUNGEN.map((x) => x.id).filter((id) => einrInputs[id]?.checked);
        const akutAus = Object.entries(akutInputs).filter(([, i]) => !i.checked).map(([k]) => k);
        const h: Hospital = { ...geo, kurzname: val("kurzname"), ort: val("ort"), einrichtungen, akutAus };
        delete h.abteilungen;
        delete h.bereiche;
        store.upsert("hospitals", [h]);
      } else {
        const keys = Object.entries(katInputs).filter(([, i]) => i.checked).map(([k]) => k);
        const p: Poi = { ...geo, typ: kategorienText(keys, val("typ_eigen")), ort: val("ort") };
        store.upsert("pois", [p]);
      }
    }
    toast(`${KIND_SINGULAR[kind]} gespeichert`);
    return true;
  };

  const errorBox = el("div", { class: "form-error" });
  form.appendChild(errorBox);
  const fail = (msg: string): false => {
    errorBox.textContent = msg;
    return false;
  };

  const actions: Parameters<typeof openDialog>[0]["actions"] = [];
  if (existing) {
    actions.push({
      label: "Löschen",
      kind: "danger",
      onClick: async () => {
        const extra =
          kind === "stations"
            ? ` Auch die ${store.list("vehicles").filter((v) => v.dienststelleId === existing.id).length} Fahrzeuge dieser Dienststelle werden gelöscht.`
            : "";
        const ok = await confirmDialog("Löschen", `„${displayName(kind, existing)}“ wirklich löschen?${extra}`, "Löschen", true);
        if (!ok) return false;
        store.remove(kind, existing.id);
        toast(`${KIND_SINGULAR[kind]} gelöscht`);
        return true;
      },
    });
  }
  actions.push({ label: "Abbrechen" }, { label: "Speichern", kind: "primary", onClick: save });

  const dlg = openDialog({
    title: existing ? `${KIND_SINGULAR[kind]} bearbeiten` : `${KIND_SINGULAR[kind]} anlegen`,
    body: form,
    actions,
    wide: kind === "hospitals" || kind === "vehicles",
  });
}

export function displayName(kind: Kind, r: KindMap[Kind]): string {
  if (kind === "vehicles") return (r as Vehicle).funkrufname;
  if (kind === "templates") return `${(r as Einsatzvorlage).code} ${(r as Einsatzvorlage).adresse}`;
  if (kind === "codes") return (r as Einsatzcode).code;
  return (r as Station).name ?? r.id;
}
