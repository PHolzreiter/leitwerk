/**
 * Ein Fenster für alles, was man einstellen kann – links eine Navigation, sortiert nach „Wen betrifft es?“:
 * Mein Platz (nur dieser Rechner) · Leitstelle (Daten für alle) · Simulation · Programm. Oben eine Suche.
 *
 * Die Inhalte kommen aus den bestehenden Ansichten (Persönlich, Leitstelle & Simulation, Programm, Daten);
 * jede Seite zeigt daraus nur die passenden Abschnitte.
 */
import type { Kind } from "../../data/model";
import { KIND_LABEL } from "../../data/model";
import { store } from "../../data/store";
import { createDataView, type DataViewDeps } from "../dataView";
import { el } from "../dom";
import { createSettingsView } from "../settingsView";
import { persoenlichView } from "./persoenlichView";

type Quelle = "persoenlich" | "simulation" | "programm" | "daten";

interface Seite {
  id: string;
  gruppe: string;
  label: string;
  info: string;
  quelle: Quelle;
  /** Abschnitte (Überschriften) aus der Quelle */
  abschnitte?: string[];
  /** Datenart (Quelle „daten“) */
  art?: Kind;
}

const GRUPPEN: { id: string; label: string; info: string }[] = [
  { id: "platz", label: "Mein Platz", info: "nur dieser Rechner" },
  { id: "leitstelle", label: "Leitstelle", info: "für alle im Spiel" },
  { id: "simulation", label: "Simulation", info: "für alle im Spiel" },
  { id: "programm", label: "Programm", info: "" },
];

const SEITEN: Seite[] = [
  { id: "darstellung", gruppe: "platz", label: "Darstellung", info: "Hell/Dunkel, Farben, Statusfarben, Karte", quelle: "persoenlich", abschnitte: ["Aussehen", "Farben", "Eigene Statusfarben", "Funkgruppen auf der Karte"] },
  { id: "telefon", gruppe: "platz", label: "Telefon & Töne", info: "Klingeln, Anklopfen, Funk-Piep, eigene Töne", quelle: "persoenlich", abschnitte: ["Anrufe und Töne", "Eigene Tondateien"] },
  { id: "sprache", gruppe: "platz", label: "Sprache", info: "Vorlesen, Stimmen, Spracherkennung, Sprechtaste", quelle: "persoenlich", abschnitte: ["Sprache"] },
  { id: "ki", gruppe: "platz", label: "KI-Anrufer", info: "Sprachmodell, Testanruf", quelle: "simulation", abschnitte: ["Notrufe und KI-Anrufer"] },
  { id: "bedienung", gruppe: "platz", label: "Bedienung", info: "Tastenkürzel, Arbeitsplatz, Einführung", quelle: "persoenlich", abschnitte: ["Tastenkürzel", "Arbeitsplatz", "Einführung"] },

  { id: "fahrzeuge", gruppe: "leitstelle", label: "Fahrzeuge", info: "Typ, Dienststelle, Dienstplan, Größe", quelle: "daten", art: "vehicles" },
  { id: "dienststellen", gruppe: "leitstelle", label: "Dienststellen", info: "Wachen, Stützpunkte", quelle: "daten", art: "stations" },
  { id: "krankenhaeuser", gruppe: "leitstelle", label: "Krankenhäuser", info: "Abteilungen, Ambulanzen", quelle: "daten", art: "hospitals" },
  { id: "pois", gruppe: "leitstelle", label: "Orte (POIs)", info: "Orte mit Kategorie: Schule, Pflegeheim, Bahnhof …", quelle: "daten", art: "pois" },
  { id: "codes", gruppe: "leitstelle", label: "Einsatzcodes & Abfrage", info: "Codeliste, Abfrageschema", quelle: "daten", art: "codes" },
  { id: "vorlagen", gruppe: "leitstelle", label: "Einsatzvorlagen", info: "feste Einsätze statt Zufall", quelle: "daten", art: "templates" },
  { id: "rettungsmittel", gruppe: "leitstelle", label: "Rettungsmittel je Stufe", info: "welches Fahrzeug bei welcher Kategorie", quelle: "simulation", abschnitte: ["Stufen-Zuordnung"] },
  { id: "status", gruppe: "leitstelle", label: "Statusmodell", info: "Nummern, Namen, Farben", quelle: "simulation", abschnitte: ["Statusmodell"] },

  { id: "aufkommen", gruppe: "simulation", label: "Einsatzaufkommen", info: "Notfälle und KT je Stunde, Komplikationen", quelle: "simulation", abschnitte: ["Einsatzaufkommen"] },
  { id: "zeiten", gruppe: "simulation", label: "Zeiten", info: "Ausrücken, Fahrzeiten, Verortung", quelle: "simulation", abschnitte: ["Ausrückzeiten", "Fahrzeiten und Verortung"] },
  { id: "wetter", gruppe: "simulation", label: "Wetter & Flugrettung", info: "Wetter, Nachtflug", quelle: "simulation", abschnitte: ["Flugrettung und Wetter"] },

  { id: "karten", gruppe: "programm", label: "Kartenpakete", info: "Straßen, Detailkarten, Gelände", quelle: "programm", abschnitte: ["Kartenpakete", "Straßennetz und Adressen"] },
  { id: "programm", gruppe: "programm", label: "Programm & Updates", info: "Version, Updates, Speicherort", quelle: "programm", abschnitte: ["Programm"] },
];

/** Was man in den Datenbereichen findet (für die Suche) */
const SUCHWOERTER: Partial<Record<Kind, string>> = {
  vehicles: "funkrufname typ kategorie dienstplan dienstzeit schicht schichten nachtflug nachtflugtauglich aktiv größe groß klein crafter t6 rtw-c ktw-b blaulicht zivildienst",
  stations: "wache dienststelle stützpunkt organisation adresse koordinaten",
  hospitals: "krankenhaus abteilung ambulanz station schockraum neurologie pci herzkatheter stroke unfall",
  codes: "einsatzcode code abfrageschema schema kapitel kategorie stufe",
  templates: "vorlage einsatz meldung",
  pois: "ort poi",
};

/** Alte Einstiegspunkte (Reiter der früheren Fenster) → Seite */
const ALT: Record<string, string> = { persoenlich: "darstellung", simulation: "aufkommen", programm: "karten", daten: "fahrzeuge" };

export interface EinstellungenFenster {
  overlay: HTMLElement;
  zeigen(seite?: string): void;
  verstecken(): void;
}

export function einstellungenFenster(deps: DataViewDeps): EinstellungenFenster {
  const overlay = el("div", { class: "gross-overlay es-overlay", hidden: "" });
  const box = el("div", { class: "gross es", role: "dialog", "aria-modal": "true" });
  const kopf = el("div", { class: "gross-kopf" });
  kopf.appendChild(el("div", { class: "gross-titel" }, "Einstellungen"));
  const suche = el("input", { type: "search", class: "es-suche", placeholder: "Suchen … (z. B. „Nachtflug“, „Dienstplan“, „Klingelton“)" }) as HTMLInputElement;
  kopf.appendChild(suche);
  kopf.appendChild(el("span", { class: "spacer" }));
  const zu = el("button", { class: "gross-zu", type: "button", title: "Schließen (Esc)" }, "×");
  kopf.appendChild(zu);
  const koerper = el("div", { class: "es-koerper" });
  const nav = el("nav", { class: "es-nav" });
  const inhalt = el("div", { class: "es-inhalt" });
  koerper.append(nav, inhalt);
  box.append(kopf, koerper);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // ---- Quellen (einmal gebaut, je nach Seite eingeblendet)
  const quellen = new Map<Quelle, { c: HTMLElement; v: { refresh(): void; zeigeArt?(k: Kind): void } }>();
  const quelle = (q: Quelle) => {
    let x = quellen.get(q);
    if (x) return x;
    const c = el("div", { class: `es-quelle es-q-${q}` });
    c.hidden = true;
    inhalt.appendChild(c);
    const v =
      q === "persoenlich"
        ? persoenlichView(c)
        : q === "daten"
          ? createDataView(c, {
              ...deps,
              // nach einem Import zeigt die Tabelle evtl. eine andere Datenart → Navigation nachziehen
              onArt: (k) => {
                const s = SEITEN.find((x) => x.art === k);
                if (s && s.id !== aktiv) {
                  aktiv = s.id;
                  navZeichnen();
                }
              },
            })
          : createSettingsView(c, q === "programm" ? "programm" : "simulation");
    x = { c, v };
    quellen.set(q, x);
    // Ansichten bauen sich bei Änderungen neu auf → Abschnitte erneut filtern
    new MutationObserver(() => filtern()).observe(c, { childList: true, subtree: false });
    return x;
  };

  // Abschnitte, die keiner Seite zugeordnet sind, landen unter „Weitere …“ (damit nichts verloren geht)
  const weitere = new Map<Quelle, string[]>();

  let aktiv = "darstellung";
  const titelVon = (s: Element) => s.querySelector(":scope > h3")?.textContent?.trim() ?? "";

  /** In der aktiven Quelle nur die Abschnitte der aktiven Seite zeigen */
  function filtern(): void {
    const s = SEITEN.find((x) => x.id === aktiv) ?? weitereSeite(aktiv);
    if (!s || s.quelle === "daten") return;
    const q = quellen.get(s.quelle);
    if (!q) return;
    const zeigen = new Set(s.abschnitte ?? []);
    const bekannt = new Set(SEITEN.filter((x) => x.quelle === s.quelle).flatMap((x) => x.abschnitte ?? []));
    const rest: string[] = [];
    q.c.querySelectorAll(".set-sec").forEach((sec) => {
      const t = titelVon(sec);
      if (!bekannt.has(t)) rest.push(t);
      (sec as HTMLElement).hidden = !(zeigen.has(t) || (s.id.startsWith("weitere-") && !bekannt.has(t)));
    });
    weitere.set(s.quelle, rest);
    // Speichern/Zurücksetzen nur bei Leitstellen-/Simulations-Einstellungen
    q.c.querySelectorAll<HTMLElement>(".set-actions").forEach((a) => (a.hidden = false));
  }

  function weitereSeite(id: string): Seite | undefined {
    if (!id.startsWith("weitere-")) return undefined;
    const q = id.slice(8) as Quelle;
    return { id, gruppe: q === "persoenlich" ? "platz" : q === "programm" ? "programm" : "simulation", label: "Weitere", info: "", quelle: q, abschnitte: [] };
  }

  function zeige(id: string): void {
    const s = SEITEN.find((x) => x.id === id) ?? weitereSeite(id);
    if (!s) return;
    aktiv = s.id;
    const q = quelle(s.quelle);
    for (const [k, x] of quellen) x.c.hidden = k !== s.quelle;
    if (s.quelle === "daten" && s.art) q.v.zeigeArt?.(s.art);
    else q.v.refresh();
    filtern();
    inhalt.scrollTop = 0;
    q.c.scrollTop = 0;
    navZeichnen();
  }

  // ---- Navigation und Suche
  let suchText = "";
  const textIndex = new Map<string, string>();
  function indexVon(s: Seite): string {
    let t = textIndex.get(s.id);
    if (t !== undefined) return t;
    t = `${s.label} ${s.info} ${(s.abschnitte ?? []).join(" ")}`;
    if (s.quelle !== "daten") {
      const q = quelle(s.quelle);
      q.c.querySelectorAll(".set-sec").forEach((sec) => {
        if ((s.abschnitte ?? []).includes(titelVon(sec))) t += ` ${sec.textContent ?? ""}`;
      });
    } else if (s.art) t += ` ${KIND_LABEL[s.art]} importieren exportieren csv ${SUCHWOERTER[s.art] ?? ""}`;
    t = t.toLowerCase();
    textIndex.set(s.id, t);
    return t;
  }

  function navZeichnen(): void {
    nav.innerHTML = "";
    const q = suchText.trim().toLowerCase();
    let treffer = 0;
    for (const g of GRUPPEN) {
      const seiten = SEITEN.filter((s) => s.gruppe === g.id && (!q || q.split(/\s+/).every((w) => indexVon(s).includes(w))));
      // „Weitere“ je Quelle, wenn es nicht zugeordnete Abschnitte gibt
      for (const [quelleId, rest] of weitere) {
        const w = weitereSeite(`weitere-${quelleId}`)!;
        if (rest.length && w.gruppe === g.id && !q) seiten.push({ ...w, label: "Weitere", info: rest.join(", ") });
      }
      if (!seiten.length) continue;
      const kopfG = el("div", { class: "es-gruppe" });
      kopfG.innerHTML = `<span>${g.label}</span>${g.info ? `<span class="muted small">${g.info}</span>` : ""}`;
      nav.appendChild(kopfG);
      for (const s of seiten) {
        treffer++;
        const b = el("button", { type: "button", class: `es-punkt${s.id === aktiv ? " aktiv" : ""}`, title: s.info });
        b.dataset.seite = s.id;
        const n = s.art ? store.counts(s.art).gesamt + (s.art === "pois" ? store.counts("hospitals").gesamt + store.counts("stations").gesamt : 0) : null;
        b.innerHTML = `<span class="es-label">${s.label}</span>${n !== null ? `<span class="count">${n}</span>` : ""}`;
        b.addEventListener("click", () => zeige(s.id));
        nav.appendChild(b);
      }
    }
    if (!treffer) nav.appendChild(el("div", { class: "muted small es-nichts" }, "Nichts gefunden."));
  }

  suche.addEventListener("input", () => {
    suchText = suche.value;
    navZeichnen();
  });
  suche.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const erster = nav.querySelector<HTMLButtonElement>(".es-punkt");
      erster?.click();
    }
  });
  store.onChange(() => {
    if (!overlay.hidden) navZeichnen();
  });

  // ---- Öffnen / Schließen
  const verstecken = () => {
    overlay.classList.add("zu");
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove("zu");
    }, 140);
  };
  zu.addEventListener("click", verstecken);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) verstecken();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && !document.querySelector(".dlg-overlay")) {
      e.stopPropagation();
      verstecken();
    }
  });

  return {
    overlay,
    zeigen: (seite) => {
      overlay.hidden = false;
      zeige(ALT[seite ?? ""] ?? seite ?? aktiv);
    },
    verstecken,
  };
}
