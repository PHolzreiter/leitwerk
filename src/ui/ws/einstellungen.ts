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
  { id: "simulation", label: "Spiel & Simulation", info: "für alle im Spiel" },
  { id: "leitstelle", label: "Leitstelle", info: "Daten – für alle im Spiel" },
  { id: "programm", label: "Programm", info: "" },
];

/**
 * Seiten: was zusammen gebraucht wird, steht beieinander. `stichworte` helfen der Suche
 * (andere Wörter für dasselbe, z. B. „Dunkelmodus“ für das Farbschema).
 */
const SEITEN: (Seite & { stichworte?: string })[] = [
  { id: "darstellung", gruppe: "platz", label: "Darstellung", info: "Hell/Dunkel, Größe, Bewegungen, Karte und Funkgruppen", quelle: "persoenlich", abschnitte: ["Aussehen", "Funkgruppen auf der Karte"], stichworte: "dunkelmodus nachtmodus thema theme zoom schriftgröße skalierung animation 3d poi grenzen" },
  { id: "farben", gruppe: "platz", label: "Farben", info: "Farbvorlagen, eigene Farben, Statusfarben", quelle: "persoenlich", abschnitte: ["Farben", "Eigene Statusfarben"], stichworte: "farbe akzent kontrast rotes kreuz status hinterlegen" },
  { id: "telefon", gruppe: "platz", label: "Telefon & Töne", info: "Annehmen, Klingeln, Lautstärke, eigene Töne", quelle: "persoenlich", abschnitte: ["Anrufe und Töne", "Eigene Tondateien"], stichworte: "klingelton ton sound lautstärke anklopfen piep funk-piep notruf annehmen hotline audio" },
  { id: "sprache", gruppe: "platz", label: "Sprache & Mikrofon", info: "Vorlesen, Stimmen, Spracheingabe, Sprechtaste", quelle: "persoenlich", abschnitte: ["Sprache"], stichworte: "mikro mikrofon stimme vorlesen sprechen spracherkennung whisper diktieren push to talk ptt" },
  { id: "bedienung", gruppe: "platz", label: "Bedienung", info: "Tastenkürzel, Fenster-Anordnung, Einführung, Entwickler", quelle: "persoenlich", abschnitte: ["Tastenkürzel", "Arbeitsplatz", "Einführung", "Entwickler"], stichworte: "tastatur shortcut hotkey taste fenster layout anordnung debug" },

  { id: "aufkommen", gruppe: "simulation", label: "Spielgebiet & Aufkommen", info: "Funkgruppe, wie viele Einsätze, Fallkatalog, ACN", quelle: "simulation", abschnitte: ["Spielgebiet", "Einsatzaufkommen"], stichworte: "funkgruppe tetra zone gebiet bezirk nachbarzone einsätze pro stunde ruhig stressig fälle fallkatalog generator zufall vorlagen acn" },
  { id: "ki", gruppe: "simulation", label: "Notrufe & Anrufer", info: "Anrufer, Verlauf, KI-Anrufer, Sprachmodell", quelle: "simulation", abschnitte: ["Anrufer und Verlauf", "Notrufe und KI-Anrufer"], stichworte: "ki ollama sprachmodell modell qwen gemma anrufer gespräch falsche adresse rückruf komplikation revers verweigerung" },
  { id: "alarmierung", gruppe: "simulation", label: "Alarmierung", info: "Rendezvous, welches Rettungsmittel bei welcher Stufe", quelle: "simulation", abschnitte: ["Alarmierung", "Stufen-Zuordnung"], stichworte: "rettungsmittel stufe nef rtw rendezvous notarzt toleranz vorschlag" },
  { id: "krankenhaus", gruppe: "simulation", label: "Krankenhäuser & KT", info: "Belegung, Dialyse, Bestrahlung, Chemo", quelle: "simulation", abschnitte: ["Krankenhäuser und Daueraufträge"], stichworte: "krankenhaus belegung grundbelegung dialyse bestrahlung chemo daueraufträge krankentransport" },
  { id: "zeiten", gruppe: "simulation", label: "Zeiten", info: "Ausrücken, Fahrzeiten, Verortung", quelle: "simulation", abschnitte: ["Ausrückzeiten", "Fahrzeiten und Verortung"], stichworte: "ausrückzeit fahrzeit sondersignal blaulicht verortung tag nacht" },
  { id: "wetter", gruppe: "simulation", label: "Wetter & Flugrettung", info: "echtes Wetter, Wechsel, Jahreszeit, Hubschrauber", quelle: "simulation", abschnitte: ["Flugrettung und Wetter"], stichworte: "wetter echt open-meteo regen schnee nebel jahreszeit nah hubschrauber flug nachtflug" },

  { id: "fahrzeuge", gruppe: "leitstelle", label: "Fahrzeuge", info: "Typ, Dienststelle, Dienstplan, Größe", quelle: "daten", art: "vehicles" },
  { id: "dienststellen", gruppe: "leitstelle", label: "Dienststellen", info: "Wachen, Stützpunkte", quelle: "daten", art: "stations" },
  { id: "krankenhaeuser", gruppe: "leitstelle", label: "Krankenhäuser", info: "Abteilungen, Ambulanzen, Zufahrt, Landeplatz", quelle: "daten", art: "hospitals" },
  { id: "pois", gruppe: "leitstelle", label: "Orte (POIs)", info: "Orte mit Kategorie: Schule, Pflegeheim, Bahnhof …", quelle: "daten", art: "pois" },
  { id: "codes", gruppe: "leitstelle", label: "Einsatzcodes & Abfrage", info: "Codeliste, Abfrageschema", quelle: "daten", art: "codes" },
  { id: "vorlagen", gruppe: "leitstelle", label: "Einsatzvorlagen", info: "feste Einsätze statt Zufall", quelle: "daten", art: "templates" },
  { id: "status", gruppe: "leitstelle", label: "Statusmodell", info: "Nummern, Namen, Farben der Status", quelle: "simulation", abschnitte: ["Statusmodell"], stichworte: "status statusmodell nummer farbe" },

  { id: "karten", gruppe: "programm", label: "Kartenpakete", info: "Straßen, Detailkarten, Gelände", quelle: "programm", abschnitte: ["Kartenpakete", "Straßennetz und Adressen"], stichworte: "karte download paket straßennetz adressen routing offline" },
  { id: "programm", gruppe: "programm", label: "Programm & Updates", info: "Version, Updates, Speicherorte, Spielstände", quelle: "programm", abschnitte: ["Programm", "Spielstände"], stichworte: "version update aktualisieren speicherort ordner spielstand spielstände dokumente" },
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

/** Für die Suche: klein, ohne Umlaute und Satzzeichen (Größe = groesse) */
function norm(t: string): string {
  return t
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9äöüß\s-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Alte Einstiegspunkte (Reiter der früheren Fenster) → Seite */
const ALT: Record<string, string> = { persoenlich: "darstellung", simulation: "aufkommen", programm: "karten", daten: "fahrzeuge", rettungsmittel: "alarmierung" };

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
    new MutationObserver(() => {
      eintraegeCache = null;
      filtern();
    }).observe(c, { childList: true, subtree: false });
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
    // Seitenkopf: Titel und kurz, worum es geht
    // (in die Seite selbst, nicht in den beobachteten Behälter – sonst ruft sich das Filtern endlos auf)
    const seiteEl = q.c.querySelector<HTMLElement>(":scope > .settings") ?? q.c.firstElementChild;
    if (seiteEl) {
      seiteEl.querySelector(":scope > .es-seitenkopf")?.remove();
      const kopfS = el("div", { class: "es-seitenkopf" });
      kopfS.innerHTML = `<h2>${s.label}</h2>${s.info ? `<p>${s.info}</p>` : ""}`;
      seiteEl.prepend(kopfS);
    }
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
    t = `${s.label} ${s.info} ${(s.abschnitte ?? []).join(" ")} ${(s as { stichworte?: string }).stichworte ?? ""}`;
    if (s.quelle !== "daten") {
      const q = quelle(s.quelle);
      q.c.querySelectorAll(".set-sec").forEach((sec) => {
        if ((s.abschnitte ?? []).includes(titelVon(sec))) t += ` ${sec.textContent ?? ""}`;
      });
    } else if (s.art) t += ` ${KIND_LABEL[s.art]} importieren exportieren csv ${SUCHWOERTER[s.art] ?? ""}`;
    t = norm(t);
    textIndex.set(s.id, t);
    return t;
  }

  function navZeichnen(): void {
    nav.innerHTML = "";
    const q = norm(suchText.trim());
    let treffer = 0;
    for (const g of GRUPPEN) {
      const seiten = SEITEN.filter((s) => s.gruppe === g.id && (!q || q.split(/\s+/).every((w) => indexVon(s).includes(w) || trefferSeiten.has(s.id))));
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
        b.addEventListener("click", () => {
          trefferBox.hidden = true;
          zeige(s.id);
        });
        nav.appendChild(b);
      }
    }
    if (!treffer) nav.appendChild(el("div", { class: "muted small es-nichts" }, "Nichts gefunden."));
  }

  // ---- Suche bis auf die einzelne Einstellung
  interface Treffer {
    seite: Seite;
    abschnitt: string;
    titel: string;
    text: string;
    ziel: HTMLElement[];
  }
  let eintraegeCache: Treffer[] | null = null;
  let trefferSeiten = new Set<string>();
  const trefferBox = el("div", { class: "es-treffer", hidden: "" });
  inhalt.appendChild(trefferBox);
  function eintraege(): Treffer[] {
    if (eintraegeCache) return eintraegeCache;
    const out: Treffer[] = [];
    for (const qid of ["persoenlich", "simulation", "programm"] as Quelle[]) {
      const q = quelle(qid);
      q.c.querySelectorAll<HTMLElement>(".set-sec").forEach((sec) => {
        const abschnitt = titelVon(sec);
        const seite = SEITEN.find((x) => x.quelle === qid && (x.abschnitte ?? []).includes(abschnitt)) ?? weitereSeite(`weitere-${qid}`);
        if (!seite) return;
        const hinweis = sec.querySelector(":scope > p")?.textContent ?? "";
        out.push({ seite, abschnitt, titel: abschnitt, text: norm(`${abschnitt} ${hinweis}`), ziel: [sec.querySelector<HTMLElement>(":scope > h3") ?? sec] });
        sec.querySelectorAll<HTMLElement>(".pers-zeile, .set-grid > label, .set-table th, h4").forEach((row) => {
          let titel: string;
          let mehr = "";
          const ziel = [row];
          if (row.classList.contains("pers-zeile")) {
            const l = row.querySelector(".pers-label") ?? row.firstElementChild;
            titel = (l?.firstElementChild ?? l)?.textContent?.trim() ?? "";
            mehr = row.textContent ?? "";
          } else {
            titel = row.textContent?.trim() ?? "";
            mehr = row.title ?? "";
            if (row.parentElement?.classList.contains("set-grid") && row.nextElementSibling instanceof HTMLElement) {
              ziel.push(row.nextElementSibling);
              mehr += ` ${row.nextElementSibling.textContent ?? ""}`;
            }
          }
          if (!titel || titel.length > 140) return;
          out.push({ seite, abschnitt, titel, text: norm(`${titel} ${mehr}`), ziel });
        });
      });
    }
    eintraegeCache = out;
    return out;
  }
  function trefferZeigen(): void {
    const q = norm(suchText.trim());
    trefferSeiten = new Set();
    if (q.length < 2) {
      trefferBox.hidden = true;
      return;
    }
    const woerter = q.split(/\s+/);
    const liste = eintraege()
      .map((t) => {
        const tt = norm(t.titel);
        if (!woerter.every((w) => t.text.includes(w) || norm(t.seite.label).includes(w))) return null;
        const punkte = woerter.reduce((a, w) => a + (tt.startsWith(w) ? 4 : tt.includes(w) ? 3 : 1), 0) + (t.titel === t.abschnitt ? 0.5 : 0);
        return { t, punkte };
      })
      .filter((x): x is { t: Treffer; punkte: number } => !!x)
      .sort((a, b) => b.punkte - a.punkte)
      .slice(0, 40);
    for (const x of liste) trefferSeiten.add(x.t.seite.id);
    trefferBox.hidden = false;
    trefferBox.innerHTML = "";
    trefferBox.appendChild(el("div", { class: "es-treffer-kopf" }, liste.length ? `${liste.length} Einstellung${liste.length === 1 ? "" : "en"} gefunden` : "Keine einzelne Einstellung gefunden – links stehen passende Bereiche, falls es welche gibt."));
    for (const { t } of liste) {
      const b = el("button", { type: "button", class: "es-treffer-z" });
      b.innerHTML = `<b></b><span></span>`;
      b.querySelector("b")!.textContent = t.titel;
      b.querySelector("span")!.textContent = t.titel === t.abschnitt ? t.seite.label : `${t.seite.label} › ${t.abschnitt}`;
      b.addEventListener("click", () => {
        trefferBox.hidden = true;
        zeige(t.seite.id);
        requestAnimationFrame(() => {
          // die Seite baut sich beim Öffnen neu auf → das Element frisch suchen
          eintraegeCache = null;
          const neu = eintraege().find((x) => x.seite.id === t.seite.id && x.abschnitt === t.abschnitt && x.titel === t.titel) ?? t;
          neu.ziel[0].scrollIntoView({ block: "center", behavior: "smooth" });
          for (const z of neu.ziel) {
            z.classList.remove("es-blink");
            void z.offsetWidth;
            z.classList.add("es-blink");
          }
        });
      });
      trefferBox.appendChild(b);
    }
  }

  suche.addEventListener("input", () => {
    suchText = suche.value;
    trefferZeigen();
    navZeichnen();
  });
  suche.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const erster = trefferBox.hidden ? nav.querySelector<HTMLButtonElement>(".es-punkt") : trefferBox.querySelector<HTMLButtonElement>(".es-treffer-z");
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
