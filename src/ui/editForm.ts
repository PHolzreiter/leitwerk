/** Formular zum Anlegen und Bearbeiten von Dienststellen, Fahrzeugen, Krankenhäusern und POIs. */
import {
  HOSPITAL_FLAGS,
  BEREICHE_AMBULANZ,
  BEREICHE_STATION,
  HOSPITAL_FLAG_LABEL,
  KIND_SINGULAR,
  ORIGIN_LABEL,
  STATION_TYPES,
  VEHICLE_CATEGORIES,
  type Hospital,
  type HospitalFlag,
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
import { codeKategorien } from "../sim/codes";
import { confirmDialog, openDialog } from "./dialog";
import { el, toast } from "./dom";

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

  let flagInputs: Partial<Record<HospitalFlag, HTMLInputElement>> = {};

  let bereichInputs: Record<string, HTMLInputElement> = {};
  let aktivInput: HTMLInputElement | null = null;
  let nachtInput: HTMLInputElement | null = null;

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
    add(
      "kategorie",
      "Kategorie",
      selectInput(VEHICLE_CATEGORIES.map((c) => [c, c]), v?.kategorie ?? "RTW"),
      "Zum Start fahren nur RTW, NEF und NAH Einsätze",
    );
    add("typ", "Fahrzeugtyp", textInput(v?.typ ?? "", "z. B. RTW-C"));
    const stations = store
      .list("stations")
      .slice()
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
    const [wrapN, inputN] = checkbox("Nachtflugtauglich (nur NAH)", v?.nachtflug ?? false);
    nachtInput = inputN;
    form.appendChild(wrapN);
  } else if (kind === "codes") {
    const c = existing as Einsatzcode | undefined;
    add("code", "Code *", textInput(c?.code ?? "", "z. B. RD-10D1"));
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
    add("code", "AMPDS-Code *", textInput(t?.code ?? "", "z. B. RD-10D1"));
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
      add("typ", "Typ", textInput(p?.typ ?? "", "z. B. Freizeit, Verkehr, Schule"));
      add("ort", "Ort", textInput(p?.ort ?? ""));
    }
    const geo = existing as Station | Hospital | Poi | undefined;
    addPosition(preset.lat ?? geo?.lat, preset.lon ?? geo?.lon, "name");

    if (kind === "hospitals") {
      const h = existing as Hospital | undefined;
      const box = el("div", { class: "flag-grid wide" });
      box.appendChild(el("div", { class: "fld-label" }, "Abteilungen"));
      flagInputs = {};
      for (const f of HOSPITAL_FLAGS) {
        const [wrap, input] = checkbox(HOSPITAL_FLAG_LABEL[f], h?.abteilungen[f] ?? false);
        flagInputs[f] = input;
        box.appendChild(wrap);
      }
      form.appendChild(box);
      // Stationen und Ambulanzen (für Krankentransporte)
      bereichInputs = {};
      for (const [titel, liste] of [["Stationen", BEREICHE_STATION], ["Ambulanzen und Bereiche", BEREICHE_AMBULANZ]] as const) {
        const b = el("div", { class: "flag-grid wide" });
        b.appendChild(el("div", { class: "fld-label" }, `${titel} (für Krankentransporte)`));
        for (const [k, name] of Object.entries(liste)) {
          const [wrap, input] = checkbox(name, h?.bereiche?.includes(k) ?? false);
          bereichInputs[k] = input;
          b.appendChild(wrap);
        }
        form.appendChild(b);
      }
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
        kategorie: val("kategorie") as VehicleCategory,
        typ: val("typ"),
        dienststelleId: val("dienststelle"),
        aktiv: aktivInput?.checked ?? true,
        nachtflug: nachtInput?.checked ?? false,
      };
      store.upsert("vehicles", [v]);
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
        const abteilungen = {} as Record<HospitalFlag, boolean>;
        for (const f of HOSPITAL_FLAGS) abteilungen[f] = flagInputs[f]?.checked ?? false;
        const bereiche = Object.entries(bereichInputs).filter(([, i]) => i.checked).map(([k]) => k);
        const h: Hospital = { ...geo, kurzname: val("kurzname"), ort: val("ort"), abteilungen, bereiche };
        store.upsert("hospitals", [h]);
      } else {
        const p: Poi = { ...geo, typ: val("typ"), ort: val("ort") };
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
    wide: kind === "hospitals",
  });
}

export function displayName(kind: Kind, r: KindMap[Kind]): string {
  if (kind === "vehicles") return (r as Vehicle).funkrufname;
  if (kind === "templates") return `${(r as Einsatzvorlage).code} ${(r as Einsatzvorlage).adresse}`;
  if (kind === "codes") return (r as Einsatzcode).code;
  return (r as Station).name ?? r.id;
}
