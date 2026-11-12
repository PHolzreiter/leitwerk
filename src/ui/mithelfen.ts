/**
 * „Mithelfen“: Formulare für fehlende oder falsche Daten (Dienststelle, Fahrzeug, POI, Krankenhaus)
 * und Änderungsvorschläge. Alles geht als Ticket an das LeitWerk-Team – ins eigene Spiel kommt nichts.
 * Dazu „Meine Tickets“ mit Stand (eingegangen, in Arbeit, eingebaut in Version …) und Antwort.
 */
import maplibregl from "maplibre-gl";
import { FAHRZEUG_TYPEN, type Station } from "../data/model";
import { POI_KATEGORIEN } from "../data/orte";
import { store } from "../data/store";
import { availableMaps, createMap, type MapHandle } from "../map";
import {
  ART_LABEL,
  GRENZEN,
  STATUS_LABEL,
  alleGelesen,
  anhaengePruefen,
  bytes,
  dateiAlsAnhang,
  BINAER_ENDUNG,
  meineTickets,
  onTickets,
  standAbgleichen,
  ticketSchicken,
  ticketVerwerfen,
  type HilfePunkt,
  type TicketArt,
  type TicketEingabe,
} from "../net/tickets";
import { searchAddress } from "../sim/geo";
import { planText, type Schicht } from "../sim/dienst";
import { openDialog, type DialogHandle } from "./dialog";
import { dienstplanEditor } from "./dienstplanEditor";
import { el, esc, toast } from "./dom";
import { inTauri } from "../platform";
import { BEZUG, EINGEBUNDEN, WUNSCH_TEILE } from "./pilot/hubschrauber";

export type Reiter = Exclude<TicketArt, "hilfe" | "fehler"> | "meine";
const REITER: [Reiter, string][] = [
  ["fahrzeug", "Fahrzeug"],
  ["dienststelle", "Dienststelle"],
  ["poi", "Ort (POI)"],
  ["krankenhaus", "Krankenhaus"],
  ["vorschlag", "Vorschlag"],
  ["idee", "Idee/Wunsch"],
  ["hubschrauber", "Hubschrauber"],
  ["meine", "Meine Tickets"],
];

const ORGANISATIONEN = ["Rotes Kreuz", "Arbeiter-Samariter-Bund", "Johanniter", "Malteser", "Grünes Kreuz", "ÖAMTC", "Feuerwehr", "Polizei", "Bergrettung", "Wasserrettung", "Sonstige"];
const STELLEN_TYPEN = ["Rettungsdienst", "Notarztstützpunkt", "Luftrettung", "Stellplatz (nur Fahrzeuge)", "Feuerwehr", "Polizei", "Bergrettung", "Wasserrettung", "Sonstige"];

/** CSV-Wert ohne Trennzeichen und Zeilenumbrüche */
const cv = (v: unknown) => String(v ?? "").replace(/[;\r\n]+/g, ", ").trim();
const csv = (kopf: string[], werte: unknown[]) => `${kopf.join(";")}\n${werte.map(cv).join(";")}`;

function feld(label: string, input: HTMLElement, opt: { breit?: boolean; hinweis?: string } = {}): HTMLElement {
  const w = el("label", { class: `fld${opt.breit ? " wide" : ""}` });
  w.append(el("span", { class: "fld-label" }, label), input);
  if (opt.hinweis) w.append(el("span", { class: "fld-hint" }, opt.hinweis));
  return w;
}
const eingabe = (ph = "", name = "") => el("input", { type: "text", placeholder: ph, ...(name ? { name } : {}) }) as HTMLInputElement;
function auswahl(werte: [string, string][], name = ""): HTMLSelectElement {
  const s = el("select", name ? { name } : {}) as HTMLSelectElement;
  for (const [v, l] of werte) s.appendChild(el("option", { value: v }, l));
  return s;
}

// ------------------------------------------------------------------ Ort wählen (kleine Karte + Suche)

interface OrtWahl {
  root: HTMLElement;
  wert(): { lat: number; lon: number; adresse: string } | null;
  setzen(lat: number, lon: number, adresse?: string): void;
  zerstoeren(): void;
}

function ortWahl(): OrtWahl {
  const root = el("div", { class: "mh-ort fld wide" });
  const zeile = el("div", { class: "mh-ort-zeile" });
  const such = eingabe("Adresse, Ort oder Koordinaten (48.20, 15.63) – oder in die Karte klicken", "ort-suche");
  const knopf = el("button", { class: "btn small", type: "button" }, "Suchen");
  const treffer = el("div", { class: "mh-treffer" });
  const kartenDiv = el("div", { class: "mh-karte" });
  const info = el("div", { class: "fld-hint mh-ort-info" }, "Noch kein Ort gewählt");
  zeile.append(such, knopf);
  root.append(el("span", { class: "fld-label" }, "Lage *"), zeile, treffer, kartenDiv, info);

  let pos: { lat: number; lon: number; adresse: string } | null = null;
  let h: MapHandle | null = null;
  let marker: maplibregl.Marker | null = null;

  const setzen = (lat: number, lon: number, adresse = "") => {
    pos = { lat, lon, adresse };
    info.textContent = `${adresse ? `${adresse} · ` : ""}${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    root.dataset.lat = String(lat);
    root.dataset.lon = String(lon);
    if (h) {
      if (!marker) marker = new maplibregl.Marker({ color: "#e5322d" }).setLngLat([lon, lat]).addTo(h.map);
      else marker.setLngLat([lon, lat]);
      h.map.easeTo({ center: [lon, lat], zoom: Math.max(h.map.getZoom(), 14) });
    }
  };

  const suchen = async () => {
    const q = such.value.trim();
    treffer.innerHTML = "";
    const k = q.match(/^\s*(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*$/);
    if (k) {
      const lat = Number(k[1].replace(",", "."));
      const lon = Number(k[2].replace(",", "."));
      if (lat > 46 && lat < 49.5 && lon > 14 && lon < 18) return setzen(lat, lon);
      treffer.textContent = "Koordinaten liegen nicht in Niederösterreich";
      return;
    }
    if (q.length < 3) return;
    treffer.textContent = "Suche …";
    let hits: Awaited<ReturnType<typeof searchAddress>> = [];
    try {
      hits = await searchAddress(q, 6);
    } catch {
      hits = [];
    }
    treffer.innerHTML = "";
    if (!hits.length) treffer.textContent = "Nichts gefunden – Ort in der Karte anklicken";
    for (const x of hits) {
      const b = el("button", { class: "mh-treffer-b", type: "button" }, x.label);
      b.addEventListener("click", () => {
        treffer.innerHTML = "";
        setzen(x.lat, x.lon, x.label);
      });
      treffer.appendChild(b);
    }
  };
  knopf.addEventListener("click", () => void suchen());
  such.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void suchen();
    }
  });

  // Karte erst zeigen, wenn das Formular im Dokument hängt
  setTimeout(async () => {
    if (!kartenDiv.isConnected) return;
    try {
      h = createMap(kartenDiv, await availableMaps());
      h.map.on("click", (e) => setzen(e.lngLat.lat, e.lngLat.lng));
      if (pos) setzen(pos.lat, pos.lon, pos.adresse);
    } catch {
      kartenDiv.textContent = "Karte nicht verfügbar – Ort über die Suche wählen";
    }
  }, 30);

  return {
    root,
    wert: () => pos,
    setzen,
    zerstoeren: () => {
      try {
        h?.map.remove();
      } catch {
        /* egal */
      }
    },
  };
}

// ------------------------------------------------------------------ Formulare

interface Formular {
  root: HTMLElement;
  /** fertige Eingabe oder Fehlertext */
  lesen(): Omit<TicketEingabe, "kontakt" | "anhaenge" | "version" | "funkgruppe" | "hilfeId"> | string;
  zerstoeren(): void;
}

function stationen(): Station[] {
  return store
    .list("stations")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function fahrzeugForm(): Formular {
  const root = el("div", { class: "form-grid" });
  const was = auswahl([
    ["fehlt", "Fahrzeug fehlt"],
    ["falsch", "Angaben stimmen nicht"],
    ["weg", "Fahrzeug gibt es nicht (mehr)"],
  ], "was");
  // Dienststelle: tippen und aus der Liste wählen
  const liste = el("datalist", { id: `mh-stellen-${Math.random().toString(36).slice(2, 7)}` });
  const alle = stationen().filter((s) => /^(Rettungsdienst|Notarztstützpunkt|Luftrettung)$/.test(s.typ));
  for (const s of alle) liste.appendChild(el("option", { value: `${s.name}${s.ort && !s.name.includes(s.ort) ? ` (${s.ort})` : ""}` }));
  const stelle = eingabe("Name der Dienststelle tippen …", "dienststelle");
  stelle.setAttribute("list", liste.id);
  const stelleVon = (): Station | undefined => alle.find((s) => `${s.name}${s.ort && !s.name.includes(s.ort) ? ` (${s.ort})` : ""}` === stelle.value.trim()) ?? alle.find((s) => s.name === stelle.value.trim());
  const fzSel = auswahl([], "fahrzeug");
  const fzFeld = feld("Welches Fahrzeug", fzSel);
  const name = eingabe("z. B. 75/001", "funkrufname");
  const typ = auswahl(FAHRZEUG_TYPEN.map((t) => [t.typ, t.label]), "typ");
  const dzWrap = el("details", { class: "fld wide mh-dienst" });
  dzWrap.append(el("summary", {}, "Dienstzeiten angeben (wenn bekannt)"));
  let dp: { root: HTMLElement; wert(): Schicht[] } | null = null;
  dzWrap.addEventListener("toggle", () => {
    if (dzWrap.open && !dp) {
      const s = stelleVon();
      dp = dienstplanEditor(undefined, s ? { lat: s.lat, lon: s.lon } : undefined);
      dzWrap.appendChild(dp.root);
    }
  });
  root.append(
    feld("Was ist los?", was),
    feld("Dienststelle *", stelle, { hinweis: "Fehlt die Dienststelle selbst? Dann zuerst unter „Dienststelle“ melden." }),
    liste,
    fzFeld,
    feld("Funkrufname *", name),
    feld("Typ", typ),
    dzWrap,
  );
  const fzFuellen = () => {
    const s = stelleVon();
    fzSel.innerHTML = "";
    const fz = s ? store.list("vehicles").filter((v) => v.dienststelleId === s.id) : [];
    if (!fz.length) fzSel.appendChild(el("option", { value: "" }, s ? "(keine Fahrzeuge eingetragen)" : "(zuerst Dienststelle wählen)"));
    for (const v of fz) fzSel.appendChild(el("option", { value: v.id }, `${v.funkrufname} · ${v.typ || v.kategorie}${v.dienstplan?.length ? ` · ${planText(v.dienstplan)}` : ""}`));
    fzSel.dispatchEvent(new Event("change"));
  };
  const sichtbar = () => {
    fzFeld.hidden = was.value === "fehlt";
  };
  fzSel.addEventListener("change", () => {
    const v = store.list("vehicles").find((x) => x.id === fzSel.value);
    if (v && was.value !== "fehlt") {
      name.value = v.funkrufname;
      if (FAHRZEUG_TYPEN.some((t) => t.typ === v.typ)) typ.value = v.typ;
    }
  });
  stelle.addEventListener("change", fzFuellen);
  was.addEventListener("change", () => {
    sichtbar();
    fzFuellen();
  });
  sichtbar();
  fzFuellen();
  return {
    root,
    zerstoeren: () => {},
    lesen: () => {
      const s = stelleVon();
      if (!s) return "Bitte die Dienststelle aus der Liste wählen";
      if (!name.value.trim()) return "Bitte den Funkrufnamen angeben";
      const alt = was.value === "fehlt" ? undefined : store.list("vehicles").find((x) => x.id === fzSel.value);
      const plan = dzWrap.open && dp ? dp.wert() : undefined;
      const t = FAHRZEUG_TYPEN.find((x) => x.typ === typ.value);
      const titel = was.value === "fehlt" ? `Fahrzeug fehlt: ${name.value.trim()} (${s.name})` : was.value === "weg" ? `Fahrzeug gibt es nicht mehr: ${alt?.funkrufname ?? name.value.trim()} (${s.name})` : `Fahrzeug korrigieren: ${alt?.funkrufname ?? name.value.trim()} (${s.name})`;
      return {
        art: "fahrzeug",
        titel,
        daten: {
          was: was.value,
          dienststelleId: s.id,
          dienststelle: s.name,
          fahrzeugId: alt?.id,
          bisher: alt ? { funkrufname: alt.funkrufname, typ: alt.typ, dienstplan: planText(alt.dienstplan) } : undefined,
          funkrufname: name.value.trim(),
          typ: typ.value,
          dienstplan: plan ? planText(plan) : undefined,
        },
        importCsv:
          was.value === "weg"
            ? undefined
            : csv(["id", "funkrufname", "kurzname", "kategorie", "typ", "aufbau", "modell", "dienststelle", "aktiv", "nachtflug", "dienstplan", "ersatz_fuer", "na_abholung", "hinweis"], [alt?.id ?? "", name.value.trim(), "", t?.kategorie ?? "", typ.value, "", "", s.id, "ja", "", plan ? planText(plan) : "", "", "", "Ticket"]),
      };
    },
  };
}

function dienststelleForm(): Formular {
  const root = el("div", { class: "form-grid" });
  const name = eingabe("z. B. Rotes Kreuz Ortsstelle Musterdorf", "name");
  const org = auswahl(ORGANISATIONEN.map((o) => [o, o]), "organisation");
  const typ = auswahl(STELLEN_TYPEN.map((o) => [o, o]), "typ");
  const adr = eingabe("Straße Hausnummer, PLZ Ort", "adresse");
  const ort = ortWahl();
  root.append(feld("Name *", name), feld("Organisation", org), feld("Art", typ), feld("Adresse", adr), ort.root);
  return {
    root,
    zerstoeren: ort.zerstoeren,
    lesen: () => {
      const p = ort.wert();
      if (!name.value.trim()) return "Bitte den Namen angeben";
      if (!p) return "Bitte die Lage wählen (Suche oder Klick in die Karte)";
      return {
        art: "dienststelle",
        titel: `Dienststelle fehlt: ${name.value.trim()}`,
        daten: { name: name.value.trim(), organisation: org.value, typ: typ.value, adresse: adr.value.trim() || p.adresse, lat: p.lat, lon: p.lon },
        importCsv: csv(["id", "name", "organisation", "typ", "ort", "bezirk", "adresse", "breitengrad", "laengengrad", "hinweis"], ["", name.value.trim(), org.value, typ.value, "", "", adr.value.trim() || p.adresse, p.lat.toFixed(6), p.lon.toFixed(6), "Ticket"]),
      };
    },
  };
}

function poiForm(): Formular {
  const root = el("div", { class: "form-grid" });
  const name = eingabe("z. B. Freibad Musterdorf", "name");
  const kats = POI_KATEGORIEN.slice().sort((a, b) => a.label.localeCompare(b.label, "de"));
  const kat = auswahl([["", "– bitte wählen –"], ...kats.map((k): [string, string] => [k.key, k.label])], "kategorie");
  const ort = ortWahl();
  root.append(feld("Name *", name), feld("Kategorie *", kat), ort.root);
  return {
    root,
    zerstoeren: ort.zerstoeren,
    lesen: () => {
      const p = ort.wert();
      if (!name.value.trim()) return "Bitte den Namen angeben";
      if (!kat.value) return "Bitte die Kategorie wählen";
      if (!p) return "Bitte die Lage wählen (Suche oder Klick in die Karte)";
      return {
        art: "poi",
        titel: `Ort fehlt: ${name.value.trim()}`,
        daten: { name: name.value.trim(), kategorie: kat.value, lat: p.lat, lon: p.lon, adresse: p.adresse },
        importCsv: csv(["id", "name", "typ", "ort", "breitengrad", "laengengrad", "hinweis"], ["", name.value.trim(), kat.value, "", p.lat.toFixed(6), p.lon.toFixed(6), "Ticket"]),
      };
    },
  };
}

function krankenhausForm(): Formular {
  const root = el("div", { class: "form-grid" });
  const was = auswahl([
    ["fehlt", "Krankenhaus / Ambulanz fehlt"],
    ["falsch", "Angaben stimmen nicht"],
  ], "was");
  const khs = store.list("hospitals").slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
  const kh = auswahl(khs.map((k) => [k.id, `${k.name}${k.ort ? ` (${k.ort})` : ""}`]), "krankenhaus");
  const khFeld = feld("Welches Krankenhaus", kh);
  const name = eingabe("z. B. Klinikum Musterstadt", "name");
  const nameFeld = feld("Name *", name);
  const abt = el("textarea", { rows: "3", name: "abteilungen", placeholder: "Abteilungen, Ambulanzen, Öffnungszeiten, Schockraum, Herzkatheter …" }) as HTMLTextAreaElement;
  const ort = ortWahl();
  root.append(feld("Was ist los?", was), khFeld, nameFeld, feld("Abteilungen / was stimmt nicht", abt, { breit: true }), ort.root);
  const sichtbar = () => {
    const neu = was.value === "fehlt";
    khFeld.hidden = neu;
    nameFeld.hidden = !neu;
    ort.root.hidden = !neu;
  };
  was.addEventListener("change", sichtbar);
  sichtbar();
  return {
    root,
    zerstoeren: ort.zerstoeren,
    lesen: () => {
      if (was.value === "falsch") {
        const k = khs.find((x) => x.id === kh.value);
        if (!k) return "Bitte das Krankenhaus wählen";
        if (!abt.value.trim()) return "Bitte beschreiben, was nicht stimmt";
        return { art: "krankenhaus", titel: `Krankenhaus korrigieren: ${k.name}`, daten: { was: "falsch", krankenhausId: k.id, name: k.name, angaben: abt.value.trim() } };
      }
      const p = ort.wert();
      if (!name.value.trim()) return "Bitte den Namen angeben";
      if (!p) return "Bitte die Lage wählen (Suche oder Klick in die Karte)";
      return {
        art: "krankenhaus",
        titel: `Krankenhaus fehlt: ${name.value.trim()}`,
        daten: { was: "fehlt", name: name.value.trim(), angaben: abt.value.trim(), lat: p.lat, lon: p.lon, adresse: p.adresse },
        importCsv: csv(["id", "name", "kurzname", "ort", "breitengrad", "laengengrad", "einrichtungen", "akut_aus", "zeiten", "plaetze", "aufnahmerad", "zufahrt", "landeplatz", "hinweis"], ["", name.value.trim(), "", "", p.lat.toFixed(6), p.lon.toFixed(6), "", "", "", "", "", "", "", `Ticket: ${abt.value.trim()}`]),
      };
    },
  };
}

function vorschlagForm(hilfe?: HilfePunkt, idee = false): Formular {
  const root = el("div", { class: "form-grid" });
  const titel = eingabe(hilfe ? hilfe.titel : idee ? "Kurz: deine Idee oder dein Wunsch" : "Kurz: worum geht es?", "titel");
  if (hilfe) titel.value = `Zu „${hilfe.titel}“`;
  root.append(feld("Titel *", titel, { breit: true }));
  return {
    root,
    zerstoeren: () => {},
    lesen: () => {
      if (!titel.value.trim()) return "Bitte einen Titel angeben";
      return { art: hilfe ? "hilfe" : idee ? "idee" : "vorschlag", titel: titel.value.trim() };
    },
  };
}

// ------------------------------------------------------------------ Hubschrauber-Wunsch

function hubschrauberForm(): Formular {
  const root = el("div", { class: "form-grid" });
  const info = el("div", { class: "fld wide mh-heli-info" });
  info.innerHTML = `<b>Schon eingebunden:</b> ${EINGEBUNDEN.filter((x) => x.stufe === "voll")
    .map((x) => `${esc(x.modell)} von ${esc(x.hersteller.replace(/ \(.*\)$/, ""))} (${esc(x.sim)})`)
    .join(" · ")}. Mit jedem anderen Hubschrauber geht LeitWerk über ${esc("das EFB (MSFS) bzw. das Plugin-Tablet (X-Plane)")} – hier wünschst du dir den Einbau ins Cockpit.`;
  const sim = auswahl([["", "– bitte wählen –"], ["MSFS 2024", "MSFS 2024"], ["MSFS 2020", "MSFS 2020"], ["X-Plane 12", "X-Plane 12"], ["X-Plane 11", "X-Plane 11"]], "simulator");
  const hersteller = eingabe("z. B. HPG, Rotorsim, Cowansim, Hype Performance Group", "hersteller");
  const modell = eingabe("genau wie im Hangar bzw. Flugzeugmenü, z. B. „Airbus H135 (HEMS)“", "modell");
  const variante = eingabe("z. B. HEMS, Polizei, mit EuroNav – falls es mehrere gibt", "variante");
  const bezug = auswahl(BEZUG, "bezug");
  const link = eingabe("https://… (Seite des Modells im Shop bzw. auf flightsim.to)", "link");
  const preis = auswahl([["", "– bitte wählen –"], ["kostenlos", "kostenlos"], ["kostenpflichtig", "kostenpflichtig"]], "preisart");
  const preisWert = eingabe("z. B. 39,99 €", "preis");
  const version = eingabe("z. B. 1.4.2", "version");
  const paket = eingabe("z. B. hpg-airbus-h145 bzw. Ordner unter X-Plane/Aircraft", "paket");
  const vorhanden = eingabe("z. B. AviTab, eigenes EFB, Funkgerät TRT800, GTN 750", "vorhanden");
  const gps = eingabe("z. B. GTN 750, GNS 430, eigenes FMS", "gps");
  const testen = auswahl([["", "– bitte wählen –"], ["ja", "Ja, ich habe das Modell und teste gerne"], ["nein", "Nein"]], "testen");
  const teile = el("div", { class: "mh-teile" });
  for (const [k, t] of WUNSCH_TEILE) {
    const l = el("label", { class: "mh-teil" });
    const c = el("input", { type: "checkbox", value: k }) as HTMLInputElement;
    l.append(c, el("span", {}, t));
    teile.appendChild(l);
  }
  const ordnerInfo = el("span", { class: "fld-hint" }, "Liest Name, Hersteller, Version und Paketname aus dem Ordner des Hubschraubers (manifest.json bzw. .acf). Mitgeschickt werden nur diese Angaben.");
  const ordnerKnopf = el("button", { class: "btn small", type: "button" }, "Aus Ordner lesen …");
  let gelesen: Record<string, string> | undefined;
  ordnerKnopf.addEventListener("click", async () => {
    if (!inTauri()) return toast("Geht nur im Programm", "error");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const p = await open({ directory: true, multiple: false, title: "Ordner des Hubschraubers wählen (Community-Paket bzw. X-Plane/Aircraft/…)" });
    if (typeof p !== "string") return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const i = await invoke<{ simulator: string; paket: string; name: string; hersteller: string; version: string; quelle: string }>("flugzeug_lesen", { ordner: p });
      gelesen = { ...i };
      if (i.name) modell.value = i.name;
      if (i.hersteller) hersteller.value = i.hersteller;
      if (i.version) version.value = i.version;
      if (i.paket) paket.value = i.paket;
      if (i.simulator === "X-Plane" && !sim.value) sim.value = "X-Plane 12";
      if (i.simulator === "MSFS" && !sim.value) sim.value = "MSFS 2024";
      ordnerInfo.textContent = `Gelesen aus ${i.quelle}: ${[i.name, i.hersteller, i.version].filter(Boolean).join(" · ") || "keine Angaben"} – bitte prüfen und ergänzen.`;
    } catch (e) {
      toast(String((e as Error)?.message ?? e), "error");
    }
  });
  const ordnerZeile = el("div", { class: "fld wide" });
  ordnerZeile.append(el("span", { class: "fld-label" }, "Angaben aus dem Ordner (freiwillig)"), ordnerKnopf, ordnerInfo);
  root.append(
    info,
    ...(inTauri() ? [ordnerZeile] : []),
    feld("Simulator *", sim),
    feld("Hersteller / Entwickler *", hersteller),
    feld("Modell *", modell, { breit: true, hinweis: "So, wie es im Simulator heißt – damit klar ist, welches Modell gemeint ist" }),
    feld("Variante", variante),
    feld("Version", version),
    feld("Wo bekommt man es? *", bezug),
    feld("Link", link, { hinweis: "Pflicht, außer beim Marketplace" }),
    feld("Preis", preis),
    feld("Betrag", preisWert),
    feld("Paket- bzw. Ordnername", paket, { breit: true }),
  );
  const teileFeld = el("div", { class: "fld wide" });
  teileFeld.append(el("span", { class: "fld-label" }, "Was soll LeitWerk einbauen? *"), teile);
  root.append(
    teileFeld,
    feld("Was hat das Modell schon an Bord?", vorhanden, { hinweis: "Tablet, EFB, Funkgerät, Navi" }),
    feld("Welches GPS/Navi?", gps),
    feld("Kannst du testen?", testen),
    el("p", { class: "fld wide muted small" }, "Screenshots vom Cockpit (Tablet, Funkgerät, Bildschirme) helfen sehr – unten als .png oder .jpg anhängen."),
  );
  return {
    root,
    zerstoeren: () => {},
    lesen: () => {
      const gewaehlt = Array.from(teile.querySelectorAll<HTMLInputElement>("input:checked")).map((c) => c.value);
      if (!sim.value) return "Bitte den Simulator wählen";
      if (!hersteller.value.trim()) return "Bitte den Hersteller angeben";
      if (!modell.value.trim()) return "Bitte das Modell angeben (wie im Simulator)";
      if (!bezug.value) return "Bitte angeben, wo man das Modell bekommt";
      if (bezug.value !== "marketplace" && !/^https?:\/\/\S+\.\S+/.test(link.value.trim())) return "Bitte den Link zum Modell angeben (https://…)";
      if (!gewaehlt.length) return "Bitte wählen, was LeitWerk einbauen soll";
      const titel = `Hubschrauber-Wunsch: ${hersteller.value.trim()} ${modell.value.trim()}${variante.value.trim() ? ` (${variante.value.trim()})` : ""} – ${sim.value}`;
      return {
        art: "hubschrauber",
        titel: titel.slice(0, 200),
        daten: {
          simulator: sim.value,
          hersteller: hersteller.value.trim(),
          modell: modell.value.trim(),
          variante: variante.value.trim() || undefined,
          version: version.value.trim() || undefined,
          bezug: BEZUG.find((b) => b[0] === bezug.value)?.[1],
          link: link.value.trim() || undefined,
          preis: preis.value ? `${preis.value}${preisWert.value.trim() ? ` (${preisWert.value.trim()})` : ""}` : undefined,
          paket: paket.value.trim() || undefined,
          einbauen: gewaehlt.map((k) => WUNSCH_TEILE.find((t) => t[0] === k)?.[1] ?? k),
          vorhanden: vorhanden.value.trim() || undefined,
          gps: gps.value.trim() || undefined,
          testen: testen.value || undefined,
          ausOrdner: gelesen,
        },
      };
    },
  };
}

// ------------------------------------------------------------------ Meine Tickets

function meineHtml(): string {
  const l = meineTickets();
  if (!l.length) return `<p class="muted">Du hast noch keine Tickets geschickt.</p>`;
  return `<div class="mh-meine">${l
    .map((t) => {
      const stand = t.status === "eingebaut" && t.version ? `eingebaut in Version ${esc(t.version)}` : esc(STATUS_LABEL[t.status]);
      return `<div class="mh-ticket${t.neu ? " neu" : ""}" data-id="${esc(t.id)}">
        <div class="mh-ticket-kopf"><b>${t.nr ? `#${t.nr}` : "–"}</b> ${esc(t.titel)}<span class="mh-stand s-${t.status}">${stand}</span></div>
        <div class="muted small">${esc(ART_LABEL[t.art] ?? t.art)} · ${new Date(t.erstellt).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}</div>
        ${t.antwort ? `<div class="mh-antwort"><b>Antwort:</b> ${esc(t.antwort)}</div>` : ""}
        ${t.status === "wartet" ? `<div class="small">Wird geschickt, sobald der Ticket-Dienst erreichbar ist. <button class="btn small" data-verwerfen="${esc(t.id)}">Verwerfen</button></div>` : ""}
      </div>`;
    })
    .join("")}</div>`;
}

// ------------------------------------------------------------------ Dialog

let offen: DialogHandle | null = null;

/** Mithelfen-Dialog öffnen. art = Startreiter, hilfe = offener Punkt, zu dem geantwortet wird */
export function mithelfenOeffnen(opt: { reiter?: Reiter; hilfe?: HilfePunkt; oben?: boolean } = {}): void {
  offen?.close();
  const body = el("div", { class: "mh" });
  const reiterLeiste = el("div", { class: "mh-reiter", role: "tablist" });
  const kopf = el("div", { class: "mh-kopf" });
  const formOrt = el("div", { class: "mh-form" });
  const gemeinsam = el("div", { class: "form-grid mh-gemeinsam" });
  const meine = el("div", { class: "mh-meine-wrap" });
  body.append(reiterLeiste, kopf, formOrt, gemeinsam, meine);

  // gemeinsame Felder
  const text = el("textarea", { rows: "4", name: "text", maxlength: String(GRENZEN.text), placeholder: "Was weißt du? Woher (z. B. Dienstplan der Dienststelle, eigene Erfahrung)?" }) as HTMLTextAreaElement;
  const datei = el("input", { type: "file", multiple: "", accept: ".txt,.csv,.png,.jpg,.jpeg,.webp,text/plain,text/csv,image/png,image/jpeg,image/webp", name: "anhaenge" }) as HTMLInputElement;
  const dateiListe = el("div", { class: "mh-dateien small" });
  const kontakt = eingabe("freiwillig – z. B. Name oder Forum-Name", "kontakt");
  gemeinsam.append(
    feld("Beschreibung", text, { breit: true }),
    feld("Dateien anhängen (.txt, .csv, Bilder .png/.jpg)", datei, { breit: true, hinweis: `Höchstens ${GRENZEN.anhaenge} Dateien, je 2 MB, zusammen 5 MB` }),
    dateiListe,
    feld("Kontakt (freiwillig)", kontakt, { breit: true }),
    el("p", { class: "fld wide muted small" }, "Geht nur an das LeitWerk-Team und wird nicht in dein Spiel übernommen. Was davon stimmt, kommt mit einem der nächsten Updates für alle."),
  );

  let anhaenge: { name: string; inhalt: string }[] = [];
  const dateienZeigen = () => {
    dateiListe.innerHTML = "";
    anhaenge.forEach((a, i) => {
      const z = el("div", { class: "mh-datei" });
      z.append(el("span", {}, `${a.name} (${Math.ceil((BINAER_ENDUNG.test(a.name) ? (a.inhalt.length * 3) / 4 : bytes(a.inhalt)) / 1024)} KB)`));
      const x = el("button", { class: "btn small", type: "button" }, "entfernen");
      x.addEventListener("click", () => {
        anhaenge.splice(i, 1);
        dateienZeigen();
      });
      z.append(x);
      dateiListe.appendChild(z);
    });
  };
  datei.addEventListener("change", async () => {
    const neu = [...anhaenge];
    for (const f of Array.from(datei.files ?? [])) {
      if (!/\.(txt|csv)$/i.test(f.name) && !BINAER_ENDUNG.test(f.name)) {
        toast(`${f.name}: nur .txt-, .csv- oder Bild-Dateien (.png, .jpg)`, "error");
        continue;
      }
      if (f.size > GRENZEN.dateiBytes) {
        toast(`${f.name}: größer als 2 MB`, "error");
        continue;
      }
      neu.push(await dateiAlsAnhang(f));
    }
    datei.value = "";
    const f = anhaengePruefen(neu);
    if (f) return toast(f, "error");
    anhaenge = neu;
    dateienZeigen();
  });

  let reiter: Reiter = opt.reiter ?? (opt.hilfe ? (["fahrzeug", "dienststelle", "poi", "krankenhaus"].includes(opt.hilfe.art) ? (opt.hilfe.art as Reiter) : "vorschlag") : "fahrzeug");
  let form: Formular | null = null;

  const meineZeigen = () => {
    meine.innerHTML = meineHtml();
    meine.querySelectorAll<HTMLButtonElement>("[data-verwerfen]").forEach((b) =>
      b.addEventListener("click", () => {
        ticketVerwerfen(b.dataset.verwerfen!);
        meineZeigen();
      }),
    );
  };

  const zeigen = () => {
    form?.zerstoeren();
    form = null;
    reiterLeiste.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.classList.toggle("aktiv", b.dataset.r === reiter));
    const istMeine = reiter === "meine";
    formOrt.hidden = gemeinsam.hidden = istMeine;
    kopf.hidden = istMeine || !opt.hilfe;
    meine.hidden = !istMeine;
    dlg?.setActionEnabled(0, !istMeine);
    if (istMeine) {
      meineZeigen();
      alleGelesen();
      void standAbgleichen(false).then(() => {
        if (reiter === "meine") meineZeigen();
      });
      return;
    }
    if (opt.hilfe) kopf.innerHTML = `<b>Offener Punkt:</b> ${esc(opt.hilfe.titel)}<div class="small muted">${esc(opt.hilfe.text)}</div>`;
    form =
      reiter === "fahrzeug" ? fahrzeugForm() : reiter === "dienststelle" ? dienststelleForm() : reiter === "poi" ? poiForm() : reiter === "krankenhaus" ? krankenhausForm() : reiter === "idee" ? vorschlagForm(undefined, true) : reiter === "hubschrauber" ? hubschrauberForm() : vorschlagForm(opt.hilfe);
    formOrt.innerHTML = "";
    formOrt.appendChild(form.root);
    text.placeholder = reiter === "hubschrauber" ? "Was ist an diesem Hubschrauber besonders (z. B. HEMS-Ausstattung, eigenes Tablet)? Was soll LeitWerk dort anzeigen?" : "Was weißt du? Woher (z. B. Dienstplan der Dienststelle, eigene Erfahrung)?";
  };
  for (const [r, label] of REITER) {
    const b = el("button", { type: "button", class: "mh-reiter-b", "data-r": r }, label);
    b.addEventListener("click", () => {
      reiter = r;
      zeigen();
    });
    reiterLeiste.appendChild(b);
  }

  const abschicken = async (): Promise<boolean> => {
    if (!form) return false;
    const r = form.lesen();
    if (typeof r === "string") {
      toast(r, "error");
      return false;
    }
    if (r.art === "vorschlag" || r.art === "hilfe" || r.art === "idee" ? !text.value.trim() && !anhaenge.length : false) {
      toast("Bitte beschreiben, worum es geht (oder eine Datei anhängen)", "error");
      return false;
    }
    const f = anhaengePruefen(anhaenge);
    if (f) {
      toast(f, "error");
      return false;
    }
    const version = (document.getElementById("app-version")?.textContent ?? "").trim().replace(/^v/, "");
    const e: TicketEingabe = {
      ...r,
      text: text.value.trim() || undefined,
      kontakt: kontakt.value.trim() || undefined,
      hilfeId: opt.hilfe?.id,
      version,
      funkgruppe: store.settings.funkgruppe,
      anhaenge: anhaenge.length ? anhaenge : undefined,
    };
    const knopf = dlg.root.parentElement?.querySelector<HTMLButtonElement>(".dlg-foot .btn.primary");
    if (knopf) knopf.disabled = true;
    const erg = await ticketSchicken(e);
    if (knopf) knopf.disabled = false;
    if (erg.ergebnis === "fehler") {
      toast(`Nicht angenommen: ${erg.fehler}`, "error");
      return false;
    }
    toast(erg.ergebnis === "gesendet" ? `Danke! Ticket #${erg.nr} ist angekommen.` : "Danke! Ticket gespeichert – es wird geschickt, sobald eine Verbindung besteht.");
    // weiter zu „Meine Tickets“
    text.value = "";
    anhaenge = [];
    dateienZeigen();
    reiter = "meine";
    zeigen();
    return false;
  };

  const dlg: DialogHandle = openDialog({
    title: "Mithelfen – Daten melden",
    body,
    wide: true,
    actions: [
      { label: "Abschicken", kind: "primary", onClick: abschicken },
      {
        label: "Schließen",
        onClick: () => {
          form?.zerstoeren();
          aus();
          offen = null;
        },
      },
    ],
  });
  dlg.root.parentElement?.classList.add("mh-dlg");
  // aus dem Hauptmenü bzw. der Einrichtung: über deren Ebene
  if (opt.oben) {
    const ov = dlg.root.closest<HTMLElement>(".dlg-overlay");
    if (ov) ov.style.zIndex = "6100";
  }
  offen = dlg;
  const aus = onTickets(() => {
    if (reiter === "meine" && body.isConnected) meineZeigen();
  });
  zeigen();
}
