/**
 * Fall-Editor: Fälle des Fallkatalogs ansehen, anlegen, ändern, prüfen und gleich durchspielen.
 *
 * Aufbau: links die Liste (eingebaute Fälle 🔒, eigene Fälle), rechts der gewählte Fall in fünf Schritten:
 *   1 Grundlagen · 2 Anrufer & Hergang · 3 Abfrage · 4 Ausgänge · 5 Prüfen & Testen
 * Eingebaute Fälle sind mit dem Admin-Passwort änderbar (die Änderung liegt neben dem Original und lässt sich
 * zurücksetzen). Eigene Fälle kann jeder anlegen; Fallpakete lassen sich exportieren und importieren.
 * Optional entwirft die KI einen Fall aus einer kurzen Beschreibung – alles bleibt danach von Hand änderbar.
 */
import {
  alleFaelle,
  eingebauterFall,
  fallAktivSetzen,
  fallLoeschen,
  fallpaketExport,
  fallpaketImport,
  fallSpeichern,
  faelleGeaendert,
  istFallAktiv,
  istGeaendert,
  type AnleitungTyp,
  type FallEreignis,
  type FallVariante,
  type FallVorlage,
  type NaBedarf,
} from "../abfrage/faelle";
import { fallPruefen } from "../abfrage/faellePruefen";
import { kiBereit, kiJson, kiStatus } from "../abfrage/ki";
import { bestimmeCode, fragenImAblauf, type Antworten, type Frage, type Schema, type Wert } from "../abfrage/schema";
import type { AnruferTyp, OrtArt, OrtModus } from "../abfrage/szenario";
import { ERÖFFNUNG, probeGespraech } from "../abfrage/gespraech";
import { kapitelZuThema, merkmaleAusSchema, merkmaleInSchema, THEMEN, themaLabel } from "../abfrage/themen";
import { BUCHUNGEN } from "../data/klinik";
import { store } from "../data/store";
import { pickTextFile, saveTextFile } from "../platform";
import { sim } from "../sim/engine";
import type { Atmung, Bewusstsein, Sichtung } from "../sim/lage";
import { PARTNER, type PartnerArt, type PartnerGrund } from "../sim/partner";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

// ------------------------------------------------------------------ Auswahllisten

const ORTE: [OrtArt, string][] = [
  ["wohnung", "Wohnung"],
  ["haus", "Haus"],
  ["garten", "Garten"],
  ["pflegeheim", "Pflegeheim"],
  ["strasse", "Straße"],
  ["geschaeft", "Geschäft"],
  ["lokal", "Lokal"],
  ["arbeit", "Arbeitsplatz"],
  ["baustelle", "Baustelle"],
  ["schule", "Schule / Kindergarten"],
  ["sport", "Sportplatz"],
  ["freizeit", "Freizeit"],
  ["natur", "Natur / Wald"],
  ["wasser", "Gewässer"],
  ["auto", "im Auto"],
  ["arzt", "Arztpraxis"],
  ["bahnhof", "Bahnhof"],
];

const ANRUFER: [AnruferTyp, string][] = [
  ["partner", "Partner/in"],
  ["kind", "Sohn / Tochter"],
  ["eltern", "Eltern"],
  ["nachbar", "Nachbar/in"],
  ["selbst", "Patient selbst"],
  ["fern", "Angehörige (nicht vor Ort)"],
  ["pflege", "Pflegekraft"],
  ["arzt", "Arzt / Ärztin"],
  ["ordi", "Ordination"],
  ["lehrer", "Lehrer/in, Betreuer/in"],
  ["kollege", "Kollege/in"],
  ["passant", "Passant/in"],
  ["verkauf", "Verkaufspersonal"],
];

const HAEUFIG: [number, string][] = [
  [1, "selten"],
  [2, "mittel"],
  [3, "häufig"],
  [5, "sehr häufig"],
];

const JAHRESZEITEN: ["fruehling" | "sommer" | "herbst" | "winter", string][] = [
  ["fruehling", "Frühling"],
  ["sommer", "Sommer"],
  ["herbst", "Herbst"],
  ["winter", "Winter"],
];

const SICHTUNG: [Sichtung, string][] = [
  ["gruen", "grün – leicht"],
  ["gelb", "gelb – dringend"],
  ["rot", "rot – kritisch"],
];

const NA_BEDARF: [NaBedarf, string][] = [
  ["nein", "kein Notarzt nötig"],
  ["RS", "Notarzt, wenn nur RS vor Ort"],
  ["NFS", "Notarzt bis NFS (NKA/NKV/NKI nicht)"],
  ["NFS-NKA", "Notarzt bis NFS/NKA"],
  ["NFS-NKV", "Notarzt bis NKV (NKI nicht)"],
  ["NFS-NKI", "Notarzt bei jeder Kompetenz außer Arzt"],
  ["immer", "immer Notarzt"],
];

const BW: [Bewusstsein, string][] = [
  ["ja", "wach"],
  ["getruebt", "getrübt"],
  ["nein", "bewusstlos"],
];

const AT: [Atmung, string][] = [
  ["normal", "normal"],
  ["abnorm", "erschwert / abnorm"],
  ["agonal", "Schnappatmung"],
  ["keine", "keine Atmung"],
];

const ANLEITUNGEN: [AnleitungTyp, string][] = [
  ["reanimation", "Herzdruckmassage"],
  ["fremdkoerper", "Fremdkörper-Manöver"],
  ["seitenlage", "stabile Seitenlage"],
  ["oberkoerper_hoch", "Oberkörper hoch"],
  ["beine_hoch", "Beine hoch"],
  ["druck_blutung", "Druck auf die Blutung"],
  ["beruhigen", "beruhigen / Atmung anleiten"],
  ["zucker", "Zucker geben"],
  ["spray", "Spray / Inhalation"],
  ["geburt", "Geburt begleiten"],
  ["nicht_bewegen", "nicht bewegen, zudecken"],
  ["absichern", "Unfallstelle absichern"],
  ["tuer", "Tür öffnen / einweisen"],
];

const SCHRITTE = ["Grundlagen", "Anrufer & Hergang", "Abfrage", "Ausgänge", "Prüfen & Testen"] as const;

/** Admin-Passwort für eingebaute Fälle (nur eine Sperre gegen Versehen, kein Schutz der Daten) */
const ADMIN = "TGVpdFdlcmsyNg==";
let adminFrei = false;

// ------------------------------------------------------------------ kleine Bausteine

type Opt<T extends string | number> = [T, string][];

function auswahl<T extends string | number>(opts: Opt<T>, wert: T | undefined, setze: (v: T) => void, leer?: string): HTMLSelectElement {
  const s = el("select") as HTMLSelectElement;
  if (leer !== undefined) s.appendChild(el("option", { value: "" }, leer));
  for (const [v, l] of opts) s.appendChild(el("option", { value: String(v) }, l));
  s.value = wert === undefined ? "" : String(wert);
  s.addEventListener("change", () => {
    const o = opts.find(([v]) => String(v) === s.value);
    setze((o ? o[0] : (s.value as T)) as T);
  });
  return s;
}

function zahl(wert: number | undefined, setze: (v: number) => void, opt: { min?: number; max?: number; step?: number; breit?: string } = {}): HTMLInputElement {
  const i = el("input", { type: "number", class: "fe-zahl" }) as HTMLInputElement;
  if (opt.min !== undefined) i.min = String(opt.min);
  if (opt.max !== undefined) i.max = String(opt.max);
  i.step = String(opt.step ?? 1);
  if (opt.breit) i.style.width = opt.breit;
  i.value = wert === undefined ? "" : String(wert);
  i.addEventListener("input", () => {
    const n = Number(i.value.replace(",", "."));
    if (i.value !== "" && Number.isFinite(n)) setze(n);
  });
  return i;
}

function text(wert: string | undefined, setze: (v: string) => void, platzhalter = "", lang = false): HTMLInputElement | HTMLTextAreaElement {
  const i = lang ? (el("textarea", { rows: "2", placeholder: platzhalter }) as HTMLTextAreaElement) : (el("input", { type: "text", placeholder: platzhalter }) as HTMLInputElement);
  i.value = wert ?? "";
  i.addEventListener("input", () => setze(i.value));
  return i;
}

function haken(wert: boolean, setze: (v: boolean) => void, label: string, titel = ""): HTMLLabelElement {
  const l = el("label", { class: "fe-haken", title: titel });
  const i = el("input", { type: "checkbox" }) as HTMLInputElement;
  i.checked = wert;
  i.addEventListener("change", () => setze(i.checked));
  l.append(i, document.createTextNode(` ${label}`));
  return l;
}

/** Mehrfachauswahl als Chips */
/** mehrere Elemente nebeneinander */
function mit(...kinder: HTMLElement[]): HTMLElement {
  const d = el("div", { class: "fe-feld" });
  d.append(...kinder);
  return d;
}

function chips<T extends string>(opts: Opt<T>, gewaehlt: T[], setze: (v: T[]) => void): HTMLElement {
  const box = el("div", { class: "fe-chips" });
  const an = new Set(gewaehlt);
  for (const [v, l] of opts) {
    const b = el("button", { type: "button", class: `fe-chip${an.has(v) ? " an" : ""}` }, l);
    b.addEventListener("click", () => {
      if (an.has(v)) an.delete(v);
      else an.add(v);
      b.classList.toggle("an", an.has(v));
      setze(opts.map(([x]) => x).filter((x) => an.has(x)));
    });
    box.appendChild(b);
  }
  return box;
}

/** Liste von Texten (z. B. mehrere Hergänge – einer wird zufällig gewählt) */
function textListe(werte: string[], setze: (v: string[]) => void, opt: { platzhalter?: string; lang?: boolean; neu?: string } = {}): HTMLElement {
  const box = el("div", { class: "fe-liste" });
  const liste = [...werte];
  const zeichnen = () => {
    box.innerHTML = "";
    liste.forEach((w, i) => {
      const z = el("div", { class: "fe-liste-z" });
      const f = text(w, (v) => {
        liste[i] = v;
        setze([...liste]);
      }, opt.platzhalter, opt.lang);
      const x = el("button", { type: "button", class: "btn small fe-x", title: "Entfernen" }, "×");
      x.addEventListener("click", () => {
        liste.splice(i, 1);
        setze([...liste]);
        zeichnen();
      });
      z.append(f, x);
      box.appendChild(z);
    });
    const plus = el("button", { type: "button", class: "btn small fe-plus" }, opt.neu ?? "+ hinzufügen");
    plus.addEventListener("click", () => {
      liste.push("");
      setze([...liste]);
      zeichnen();
      (box.querySelectorAll("input, textarea")[liste.length - 1] as HTMLElement | undefined)?.focus();
    });
    box.appendChild(plus);
  };
  zeichnen();
  return box;
}

/** Zeile: Beschriftung, Eingabe, Hilfetext */
function zeile(label: string, inhalt: HTMLElement | HTMLElement[], hilfe?: string): HTMLElement {
  const z = el("div", { class: "fe-zeile" });
  const l = el("div", { class: "fe-label" });
  l.textContent = label;
  const r = el("div", { class: "fe-feld" });
  for (const x of Array.isArray(inhalt) ? inhalt : [inhalt]) r.appendChild(x);
  if (hilfe) r.appendChild(el("div", { class: "fe-hilfe" }, hilfe));
  z.append(l, r);
  return z;
}

function abschnitt(titel: string, info?: string): HTMLElement {
  const s = el("section", { class: "fe-abschnitt" });
  s.appendChild(el("h3", {}, titel));
  if (info) s.appendChild(el("p", { class: "fe-info" }, info));
  return s;
}

function idAus(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || "fall";
}

function freieId(basis: string): string {
  const da = new Set(alleFaelle(true).map((f) => f.id));
  if (!da.has(basis)) return basis;
  for (let i = 2; ; i++) if (!da.has(`${basis}_${i}`)) return `${basis}_${i}`;
}

function neuerFall(): FallVorlage {
  return {
    id: "",
    name: "",
    thema: "krank",
    haeufigkeit: 2,
    alter: [30, 80],
    orte: ["wohnung"],
    stelle: ["im Wohnzimmer"],
    anrufer: ["partner"],
    geschehen: [""],
    hergang: [],
    seitMin: [5, 30],
    fest: {},
    details: [],
    varianten: [{ id: "A", p: 1, sichtung: "gruen", lage: "", na: "nein", buchung: "bu_hausaerztlich" }],
  };
}

const naechsteVarId = (f: FallVorlage) => {
  const da = new Set(f.varianten.map((v) => v.id));
  for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") if (!da.has(c)) return c;
  return `V${f.varianten.length + 1}`;
};

// ------------------------------------------------------------------ Fenster

let offen: { zeigen(id?: string): void } | null = null;

/** Fall-Editor öffnen (optional gleich einen Fall) */
export function fallEditorOeffnen(id?: string): void {
  offen ??= fensterBauen();
  offen.zeigen(id);
}

function fensterBauen(): { zeigen(id?: string): void } {
  const overlay = el("div", { class: "gross-overlay fe-overlay", hidden: "" });
  const box = el("div", { class: "gross fe", role: "dialog", "aria-modal": "true" });
  const kopf = el("div", { class: "gross-kopf" });
  kopf.appendChild(el("div", { class: "gross-titel" }, "Fall-Editor"));
  kopf.appendChild(el("span", { class: "muted small fe-kopfinfo" }, "Fälle für den Fallkatalog: Telefonat, Abfrage, Ausgänge, Notarzt-Bedarf, Krankenhaus"));
  kopf.appendChild(el("span", { class: "spacer" }));
  const adminB = el("button", { class: "btn small", type: "button", title: "Eingebaute Fälle bearbeiten (Admin-Passwort)" });
  const zu = el("button", { class: "gross-zu", type: "button", title: "Schließen (Esc)" }, "×");
  kopf.append(adminB, zu);
  const koerper = el("div", { class: "es-koerper fe-koerper" });
  const nav = el("nav", { class: "es-nav fe-nav" });
  const inhalt = el("div", { class: "fe-inhalt" });
  koerper.append(nav, inhalt);
  box.append(kopf, koerper);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // ---- Zustand
  let gewaehlt: string | null = null;
  /** Arbeitskopie des gewählten Falls */
  let entwurf: FallVorlage | null = null;
  /** Fall noch nicht gespeichert (neu) */
  let istNeu = false;
  let geaendert = false;
  let schritt = 0;
  let suche = "";
  /** in der Abfrage: Antworten für alle Ausgänge („“) oder für einen Ausgang */
  let abfrageFuer = "";

  const adminText = () => {
    adminB.textContent = adminFrei ? "🔓 Admin" : "🔒 Admin";
    adminB.classList.toggle("primary", adminFrei);
  };
  adminText();
  adminB.addEventListener("click", () => {
    if (adminFrei) {
      adminFrei = false;
      adminText();
      zeichnen();
      return;
    }
    const i = el("input", { type: "password", placeholder: "Passwort" }) as HTMLInputElement;
    const body = el("div");
    body.append(el("p", { class: "muted" }, "Mit dem Admin-Passwort lassen sich auch die eingebauten Fälle ändern. Deine Änderung liegt neben dem Original und lässt sich jederzeit zurücksetzen."), i);
    const d = openDialog({
      title: "Admin-Freigabe",
      body,
      actions: [
        { label: "Abbrechen" },
        {
          label: "Freigeben",
          kind: "primary",
          onClick: () => {
            if (i.value !== atob(ADMIN)) {
              toast("Passwort falsch", "error");
              i.select();
              return false;
            }
            adminFrei = true;
            adminText();
            zeichnen();
          },
        },
      ],
    });
    i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (d.root.closest(".dlg")?.querySelector(".dlg-foot .btn.primary") as HTMLButtonElement | null)?.click();
    });
  });

  const gesperrt = () => !!entwurf && !istNeu && !!eingebauterFall(entwurf.id) && !adminFrei;

  // ---- Liste links
  function navZeichnen(): void {
    nav.innerHTML = "";
    const oben = el("div", { class: "fe-nav-oben" });
    const s = el("input", { type: "search", class: "fe-suche", placeholder: "Fall suchen …" }) as HTMLInputElement;
    s.value = suche;
    s.addEventListener("input", () => {
      suche = s.value;
      listeZeichnen();
    });
    const neu = el("button", { class: "btn small primary", type: "button" }, "+ Neuer Fall");
    neu.addEventListener("click", () => void neuDialog());
    const imp = el("button", { class: "btn small", type: "button", title: "Fallpaket (.json) laden" }, "Importieren");
    imp.addEventListener("click", () => void importieren());
    const exp = el("button", { class: "btn small", type: "button", title: "Fälle als Fallpaket (.json) speichern" }, "Exportieren");
    exp.addEventListener("click", () => exportDialog());
    oben.append(s, el("div", { class: "fe-nav-knoepfe" }));
    oben.lastElementChild!.append(neu, imp, exp);
    nav.appendChild(oben);
    nav.appendChild(el("div", { class: "fe-nav-liste" }));
    listeZeichnen();
  }

  function listeZeichnen(): void {
    const box = nav.querySelector(".fe-nav-liste")!;
    box.innerHTML = "";
    const q = suche.trim().toLowerCase();
    const passt = (f: FallVorlage) => !q || `${f.name ?? ""} ${f.id} ${themaLabel(f.thema)} ${(f.geschehen ?? []).join(" ")} ${f.hergang.join(" ")}`.toLowerCase().includes(q);
    const alle = alleFaelle(true).filter(passt);
    const gruppen: [string, FallVorlage[]][] = [
      ["Eigene Fälle", alle.filter((f) => !eingebauterFall(f.id))],
      ["Eingebaute Fälle", alle.filter((f) => !!eingebauterFall(f.id))],
    ];
    for (const [titel, liste] of gruppen) {
      const g = el("div", { class: "es-gruppe" });
      g.innerHTML = `<span>${titel}</span><span class="muted small">${liste.length} ${liste.length === 1 ? "Fall" : "Fälle"}</span>`;
      box.appendChild(g);
      if (!liste.length) box.appendChild(el("div", { class: "muted small es-nichts" }, titel === "Eigene Fälle" ? "Noch keine – „+ Neuer Fall“ oder ein Fallpaket importieren." : "Nichts gefunden."));
      for (const f of liste.sort((a, b) => fallName(a).localeCompare(fallName(b), "de"))) {
        const b = el("button", { type: "button", class: `es-punkt fe-punkt${f.id === gewaehlt ? " aktiv" : ""}${istFallAktiv(f.id) ? "" : " aus"}` });
        const zeichen = eingebauterFall(f.id) ? (istGeaendert(f.id) ? "✎" : "🔒") : "";
        b.innerHTML = `<span class="es-label">${esc(fallName(f))}</span><span class="fe-punkt-info">${esc(themaLabel(f.thema))}</span>${zeichen ? `<span class="fe-zeichen" title="${istGeaendert(f.id) ? "eingebaut, geändert" : "eingebaut"}">${zeichen}</span>` : ""}`;
        b.addEventListener("click", () => void waehlen(f.id));
        box.appendChild(b);
      }
    }
  }

  const fallName = (f: FallVorlage) => f.name?.trim() || f.id;

  async function weiterOhneSpeichern(): Promise<boolean> {
    if (!geaendert || !entwurf) return true;
    return confirmDialog("Änderungen verwerfen?", `„${fallName(entwurf) || "Neuer Fall"}“ hat ungespeicherte Änderungen.`, "Verwerfen", true);
  }

  async function waehlen(id: string): Promise<void> {
    if (id === gewaehlt && !istNeu) return;
    if (!(await weiterOhneSpeichern())) return;
    const f = alleFaelle(true).find((x) => x.id === id);
    if (!f) return;
    gewaehlt = id;
    entwurf = structuredClone(f);
    istNeu = false;
    geaendert = false;
    abfrageFuer = "";
    zeichnen();
  }

  // ---- rechts: Fall
  const kopfZeile = el("div", { class: "fe-fallkopf" });
  const schrittLeiste = el("div", { class: "fe-schritte" });
  const formular = el("fieldset", { class: "fe-form" }) as HTMLFieldSetElement;
  const fuss = el("div", { class: "fe-fuss" });
  inhalt.append(kopfZeile, schrittLeiste, formular, fuss);

  function zeichnen(): void {
    navZeichnen();
    if (!entwurf) {
      kopfZeile.innerHTML = "";
      schrittLeiste.innerHTML = "";
      fuss.innerHTML = "";
      formular.innerHTML = `<div class="fe-leer"><h2>Fälle selbst schreiben</h2>
        <p>Ein Fall ist die verborgene Wahrheit hinter einem Notruf: wer anruft, was passiert ist, wie die Abfrage ausgeht – und welche Ausgänge es gibt (z. B. meist harmlos, manchmal ernst). Daraus entstehen Telefonat, Lagemeldung, Notarzt-Bedarf und Krankenhaus.</p>
        <p>Links einen Fall wählen oder mit <b>+ Neuer Fall</b> beginnen – leer oder mit einem Entwurf der KI aus deiner Beschreibung.</p></div>`;
      formular.disabled = false;
      return;
    }
    kopfZeichnen();
    schrittLeiste.innerHTML = "";
    SCHRITTE.forEach((t, i) => {
      const b = el("button", { type: "button", class: `fe-schritt${i === schritt ? " aktiv" : ""}` });
      b.innerHTML = `<span class="fe-nr">${i + 1}</span> ${t}`;
      b.addEventListener("click", () => {
        schritt = i;
        zeichnen();
      });
      schrittLeiste.appendChild(b);
    });
    formular.innerHTML = "";
    formular.disabled = gesperrt();
    if (gesperrt()) {
      const h = el("div", { class: "fe-sperre" });
      h.innerHTML = `🔒 Eingebauter Fall – nur ansehen. Zum Ändern oben <b>Admin</b> freigeben oder unten <b>Als eigenen Fall kopieren</b>.`;
      formular.appendChild(h);
    }
    [schrittGrundlagen, schrittHergang, schrittAbfrage, schrittAusgaenge, schrittPruefen][schritt]();
    fussZeichnen();
  }

  function kopfZeichnen(): void {
    const f = entwurf!;
    const eingebaut = !!eingebauterFall(f.id) && !istNeu;
    const befunde = befundeJetzt();
    const hart = befunde.filter((b) => b.hart).length;
    kopfZeile.innerHTML = `<div class="fe-fallname">${esc(fallName(f) || "Neuer Fall")}${geaendert ? ' <span class="fe-ungespeichert" title="ungespeichert">●</span>' : ""}</div>
      <div class="fe-fallinfo muted small">${esc(themaLabel(f.thema))} · ${f.varianten.length} ${f.varianten.length === 1 ? "Ausgang" : "Ausgänge"}${eingebaut ? ` · eingebaut${istGeaendert(f.id) ? ", geändert" : ""}` : istNeu ? " · neu" : " · eigener Fall"}${f.id ? ` · ID ${esc(f.id)}` : ""}</div>
      <div class="fe-ampel ${hart ? "rot" : befunde.length ? "gelb" : "gruen"}" title="${esc(befunde.map((b) => b.text).join("\n"))}">${hart ? `⚠ ${hart} ${hart === 1 ? "Fehler" : "Fehler"}` : befunde.length ? `✓ spielbar · ${befunde.length} ${befunde.length === 1 ? "Hinweis" : "Hinweise"}` : "✓ spielbar"}</div>`;
    kopfZeile.querySelector(".fe-ampel")!.addEventListener("click", () => {
      schritt = 4;
      zeichnen();
    });
  }

  /** nach jeder Eingabe: ungespeichert markieren, Ampel aktualisieren */
  let ampelTimer = 0;
  function aenderung(): void {
    geaendert = true;
    clearTimeout(ampelTimer);
    ampelTimer = window.setTimeout(() => {
      if (entwurf) kopfZeichnen();
      fussZeichnen();
    }, 250);
  }

  function fussZeichnen(): void {
    fuss.innerHTML = "";
    if (!entwurf) return;
    const f = entwurf;
    const eingebaut = !!eingebauterFall(f.id) && !istNeu;
    const links = el("div", { class: "fe-fuss-links" });
    const rechts = el("div", { class: "fe-fuss-rechts" });
    if (!istNeu) {
      links.appendChild(
        haken(istFallAktiv(f.id), (v) => {
          fallAktivSetzen(f.id, v);
          listeZeichnen();
        }, "im Spiel aktiv", "Ausgeschaltete Fälle kommen im Spiel nicht vor"),
      );
    }
    const kopie = el("button", { class: "btn small", type: "button" }, eingebaut ? "Als eigenen Fall kopieren" : "Kopie anlegen");
    kopie.addEventListener("click", () => {
      const k = structuredClone(f);
      k.id = freieId(`${idAus(fallName(f))}_kopie`);
      k.name = `${fallName(f)} (Kopie)`;
      entwurf = k;
      istNeu = true;
      gewaehlt = null;
      geaendert = true;
      zeichnen();
    });
    if (!istNeu) links.appendChild(kopie);
    if (eingebaut && istGeaendert(f.id) && adminFrei) {
      const orig = el("button", { class: "btn small danger-text", type: "button" }, "Original wiederherstellen");
      orig.addEventListener("click", async () => {
        if (!(await confirmDialog("Original wiederherstellen?", "Deine Änderungen an diesem eingebauten Fall gehen verloren.", "Wiederherstellen", true))) return;
        fallLoeschen(f.id);
        entwurf = structuredClone(eingebauterFall(f.id)!);
        geaendert = false;
        zeichnen();
      });
      links.appendChild(orig);
    }
    if (!eingebaut && !istNeu) {
      const loe = el("button", { class: "btn small danger-text", type: "button" }, "Löschen");
      loe.addEventListener("click", async () => {
        if (!(await confirmDialog("Fall löschen?", `„${fallName(f)}“ wird gelöscht. Exportiere ihn vorher, wenn du ihn behalten willst.`, "Löschen", true))) return;
        fallLoeschen(f.id);
        entwurf = null;
        gewaehlt = null;
        geaendert = false;
        zeichnen();
      });
      links.appendChild(loe);
    }
    if (geaendert && !istNeu) {
      const verw = el("button", { class: "btn small", type: "button" }, "Änderungen verwerfen");
      verw.addEventListener("click", () => {
        entwurf = structuredClone(alleFaelle(true).find((x) => x.id === f.id)!);
        geaendert = false;
        zeichnen();
      });
      rechts.appendChild(verw);
    }
    const sp = el("button", { class: "btn small primary", type: "button" }, istNeu ? "Fall anlegen" : "Speichern");
    sp.disabled = gesperrt() || (!geaendert && !istNeu);
    sp.addEventListener("click", () => speichern());
    rechts.appendChild(sp);
    fuss.append(links, rechts);
  }

  function speichern(): boolean {
    if (!entwurf || gesperrt()) return false;
    const f = entwurf;
    if (!fallName(f).trim()) {
      toast("Bitte dem Fall einen Namen geben (Schritt 1)", "error");
      schritt = 0;
      zeichnen();
      return false;
    }
    if (istNeu) f.id = freieId(f.id ? idAus(f.id) : idAus(f.name ?? ""));
    // leere Einträge weg
    f.stelle = f.stelle.filter((x) => x.trim());
    f.hergang = f.hergang.filter((x) => x.trim());
    if (f.geschehen) f.geschehen = f.geschehen.filter((x) => x.trim());
    if (f.umgebung) {
      f.umgebung = f.umgebung.filter((x) => x.trim());
      if (!f.umgebung.length) delete f.umgebung;
    }
    if (f.hergangIch) f.hergangIch = f.hergangIch.filter((x) => x.trim());
    if (f.hergangIch && !f.hergangIch.length) delete f.hergangIch;
    for (const k of ["details", "vorerkrankungen", "verlauf", "wo"] as const) {
      const l = f[k];
      if (l) {
        const r = l.filter((x) => x.trim());
        if (r.length) f[k] = r;
        else delete f[k];
      }
    }
    if (!f.stelle.length) f.stelle = [""];
    fallSpeichern(structuredClone(f));
    gewaehlt = f.id;
    istNeu = false;
    geaendert = false;
    toast(`„${fallName(f)}“ gespeichert`);
    zeichnen();
    return true;
  }

  // ---- Schritt 1: Grundlagen
  function schrittGrundlagen(): void {
    const f = entwurf!;
    const a = abschnitt("Worum geht es?", "Name und Thema bestimmen, wo der Fall in der Abfrage landet. Die Häufigkeit sagt, wie oft er im Spiel vorkommt.");
    a.append(
      zeile("Name", text(f.name, (v) => {
        f.name = v;
        aenderung();
      }, "z. B. Sturz im Badezimmer, Oberschenkel")),
      zeile("Thema", auswahl(THEMEN.map((t) => [t.id, t.label] as [string, string]), f.thema, (v) => {
        f.thema = v;
        aenderung();
      }), "Hauptbeschwerde, unabhängig vom Codesystem – daraus folgt das Kapitel der Abfrage"),
      zeile("Häufigkeit", auswahl(HAEUFIG, f.haeufigkeit, (v) => {
        f.haeufigkeit = Number(v);
        aenderung();
      })),
    );
    const p = abschnitt("Patient");
    const alterVon = zahl(f.alter[0], (v) => {
      f.alter = [v, f.alter[1]];
      aenderung();
    }, { min: 0, max: 110, breit: "70px" });
    const alterBis = zahl(f.alter[1], (v) => {
      f.alter = [f.alter[0], v];
      aenderung();
    }, { min: 0, max: 110, breit: "70px" });
    p.append(
      zeile("Alter", [alterVon, el("span", { class: "muted" }, " bis "), alterBis, el("span", { class: "muted" }, " Jahre")]),
      zeile("Geschlecht", auswahl([["m", "männlich"], ["w", "weiblich"]] as Opt<"m" | "w">, f.geschlecht, (v) => {
        if ((v as string) === "") delete f.geschlecht;
        else f.geschlecht = v;
        aenderung();
      }, "egal (zufällig)")),
      zeile("Kein Patient", text(f.ohnePatient, (v) => {
        if (v.trim()) f.ohnePatient = v;
        else delete f.ohnePatient;
        aenderung();
      }, "nur bei Fällen ohne Patient, z. B. „Lichtsignale am Berg“"), "leer lassen, wenn es einen Patienten gibt"),
    );
    const o = abschnitt("Wo?", "Der Einsatzort wird passend gewählt (Wohnadresse, Pflegeheim, Straße …). Pflegeheim, Arztpraxis, Schule und Bahnhof nur dort, wo es so einen Ort (POI) im Gebiet gibt.");
    const modusHilfe: Record<OrtModus, string> = {
      nur: "der Fall passiert nur an den markierten Orten",
      ueberall: "der Fall kann überall passieren (Markierung egal) – Stellen am besten mit [ort=…] schreiben",
      ausser: "der Fall passiert überall, nur NICHT an den markierten Orten",
    };
    const hilfe = el("span", { class: "fe-hinweis" }, modusHilfe[f.ortModus ?? "nur"]);
    o.append(
      zeile("Vorkommen", mit(auswahl([["nur", "nur an diesen Orten"], ["ueberall", "überall"], ["ausser", "überall außer an diesen Orten"]] as Opt<OrtModus>, f.ortModus ?? "nur", (v) => {
        if (v === "nur") delete f.ortModus;
        else f.ortModus = v;
        hilfe.textContent = modusHilfe[v];
        aenderung();
      }), hilfe)),
      zeile("Ort", chips(ORTE, f.orte, (v) => {
        f.orte = v;
        aenderung();
      })),
      zeile("Genaue Stelle", textListe(f.stelle, (v) => {
        f.stelle = v;
        aenderung();
      }, { platzhalter: "z. B. im Badezimmer", neu: "+ Stelle" }), "eine davon wird gewählt; {ort} = Gemeinde"),
      zeile("Beschreibung (Natur)", textListe(f.wo ?? [], (v) => {
        f.wo = v;
        aenderung();
      }, { platzhalter: "z. B. am Wanderweg oberhalb von {ort}, beim Marterl", neu: "+ Beschreibung" }), "nur wenn der Anrufer die Adresse nicht kennt"),
    );
    const z = abschnitt("Wann?", "Leer = jederzeit.");
    const stundenAn = !!f.stunden;
    const von = zahl(f.stunden?.[0] ?? 8, (v) => {
      f.stunden = [v, f.stunden?.[1] ?? 18];
      aenderung();
    }, { min: 0, max: 23, breit: "60px" });
    const bis = zahl(f.stunden?.[1] ?? 18, (v) => {
      f.stunden = [f.stunden?.[0] ?? 8, v];
      aenderung();
    }, { min: 0, max: 24, breit: "60px" });
    von.disabled = bis.disabled = !stundenAn;
    z.append(
      zeile("Jahreszeit", chips(JAHRESZEITEN, f.jahreszeit ?? [], (v) => {
        if (v.length) f.jahreszeit = v;
        else delete f.jahreszeit;
        aenderung();
      })),
      zeile("Uhrzeit", [
        haken(stundenAn, (an) => {
          if (an) f.stunden = [Number(von.value) || 8, Number(bis.value) || 18];
          else delete f.stunden;
          von.disabled = bis.disabled = !an;
          aenderung();
        }, "nur von"),
        von,
        el("span", { class: "muted" }, " bis "),
        bis,
        el("span", { class: "muted" }, " Uhr"),
      ]),
      zeile("Wetter", auswahl([["hitze", "nur bei Hitze (ab 25 °C)"], ["kaelte", "nur bei Kälte (bis 3 °C)"], ["glatt", "nur bei Glätte"]] as Opt<"hitze" | "kaelte" | "glatt">, f.wetter, (v) => {
        if ((v as string) === "") delete f.wetter;
        else f.wetter = v;
        aenderung();
      }, "egal")),
    );
    formular.append(a, p, o, z);
  }

  // ---- Schritt 2: Anrufer & Geschichte
  function schrittHergang(): void {
    const f = entwurf!;
    const hilfe = el("details", { class: "fe-platzhalter" });
    hilfe.innerHTML = `<summary>Platzhalter und Bedingungen</summary>
      <table>
        <tr><td><code>{P}</code> / <code>{p}</code></td><td>die Person aus Sicht des Anrufers („Mein Mann“, „Die Frau“) – groß/klein</td></tr>
        <tr><td><code>{er} {Er} {ihn} {ihm} {sein} {seine} …</code></td><td>wird bei Frauen zu „sie, Sie, sie, ihr, ihr, ihre …“</td></tr>
        <tr><td><code>{beim Essen|beim Fernsehen}</code></td><td>eines davon zufällig – mehr Abwechslung (<code>{rechten|linken}</code> bleibt im ganzen Fall gleich)</td></tr>
        <tr><td><code>{ort}</code> <code>{name}</code></td><td>Gemeinde, Name des Patienten</td></tr>
        <tr><td><code>[variante=A] …</code></td><td>gilt nur im Ausgang A (<code>[variante!=A]</code>: in allen anderen)</td></tr>
        <tr><td><code>[ort=schule] …</code></td><td>gilt nur an diesem Ort (<code>[ort=wohnung|haus]</code>: an einem davon)</td></tr>
        <tr><td><code>[anrufer_typ=nachbar] …</code></td><td>gilt nur, wenn dieser Anrufer anruft</td></tr>
        <tr><td><code>[selbst=ja] …</code></td><td>gilt nur, wenn der Patient selbst anruft</td></tr>
        <tr><td><code>[wissen=fremd] …</code></td><td>gilt nur für Fremde (<code>nah</code> = Angehörige, <code>bekannt</code> = Nachbarn, Kollegen …)</td></tr>
        <tr><td><code>[woran=essen] …</code></td><td>gilt nur bei dieser Antwort aus der Abfrage</td></tr>
      </table>`;
    const a = abschnitt("Wer kann anrufen?", "Bei jedem Notruf wird daraus ein anderer Anrufer gewürfelt – passend zu Ort und Alter, mit eigener Art zu reden, eigenem Wissen (Angehörige wissen mehr als Fremde) und eigenem Einstieg ins Gespräch.");
    a.append(
      zeile("Anrufer", chips(ANRUFER, f.anrufer, (v) => {
        f.anrufer = v;
        aenderung();
      })),
    );
    const h = abschnitt(
      "Was ist wirklich passiert?",
      "Fakten statt fertiger Sätze: Die KI erzählt daraus bei jedem Anruf neu – in den Worten des jeweiligen Anrufers. Schreib auf, was passiert ist, in welcher Reihenfolge und unter welchen Umständen. Was nur bestimmte Anrufer wissen können, mit Bedingung (z. B. [wissen=nah]).",
    );
    h.append(
      hilfe,
      zeile("Fakten", textListe(f.geschehen ?? [], (v) => {
        f.geschehen = v;
        aenderung();
      }, { lang: true, platzhalter: "z. B. {P} ist {in der Nacht|am Morgen} auf dem Weg ins Bad ausgerutscht und auf die Hüfte gefallen.", neu: "+ Fakt" })),
      zeile(
        "So könnte es klingen",
        textListe(f.hergang, (v) => {
          f.hergang = v;
          aenderung();
        }, { lang: true, platzhalter: "z. B. {P} ist gestürzt, {er} liegt am Boden und kommt nicht mehr auf!", neu: "+ Beispiel" }),
        "nur als Anhaltspunkt für den Ton – die KI übernimmt das nie wörtlich",
      ),
      zeile(
        "… wenn der Patient selbst anruft",
        textListe(f.hergangIch ?? [], (v) => {
          f.hergangIch = v;
          aenderung();
        }, { lang: true, platzhalter: "Ich-Form, z. B. Ich bin im Bad gestürzt und komm nicht mehr hoch!", neu: "+ Beispiel" }),
      ),
    );
    const seitVon = zahl(f.seitMin?.[0] ?? 5, (v) => {
      f.seitMin = [v, f.seitMin?.[1] ?? v];
      aenderung();
    }, { min: 0, breit: "70px" });
    const seitBis = zahl(f.seitMin?.[1] ?? 30, (v) => {
      f.seitMin = [f.seitMin?.[0] ?? 0, v];
      aenderung();
    }, { min: 0, breit: "70px" });
    const d = abschnitt("Was sieht und weiß der Anrufer noch?", "Das erzählt er auf Nachfrage oder wenn es passt. Die KI darf zwischen den Zeilen lesen, aber nichts davon widersprechen.");
    d.append(
      zeile("Seit wann", [seitVon, el("span", { class: "muted" }, " bis "), seitBis, el("span", { class: "muted" }, " Minuten")]),
      zeile("Details", textListe(f.details ?? [], (v) => {
        f.details = v;
        aenderung();
      }, { lang: true, platzhalter: "z. B. {Er} liegt auf den Fliesen, das Bein ist so komisch verdreht.", neu: "+ Detail" })),
      zeile("Umgebung", textListe(f.umgebung ?? [], (v) => {
        f.umgebung = v;
        aenderung();
      }, { platzhalter: "z. B. 3. Stock, enges Stiegenhaus", neu: "+ Angabe" }), "leer = zufällig (Stock, Tür, Haustür) – nur ausfüllen, wenn es für den Fall wichtig ist"),
      zeile("Vorerkrankungen", textListe(f.vorerkrankungen ?? [], (v) => {
        f.vorerkrankungen = v;
        aenderung();
      }, { platzhalter: "z. B. Osteoporose (mit ! davor: immer)", neu: "+ Vorerkrankung" }), "eine davon (oder keine) kommt zu den altersüblichen dazu; „!Asthma“ kommt immer vor"),
      zeile("Hinweise fürs Gespräch", textListe(f.verlauf ?? [], (v) => {
        f.verlauf = v;
        aenderung();
      }, { lang: true, platzhalter: "z. B. Wenn man dir die Herzdruckmassage erklärt, machst du sie und zählst laut mit.", neu: "+ Hinweis" }), "Regieanweisung für die KI (Du-Form). Die Stimmung würfelt das Spiel – nur festlegen, wenn sie zum Fall gehört."),
    );
    formular.append(a, h, d);
  }

  // ---- Schritt 3: Abfrage
  function schrittAbfrage(): void {
    const f = entwurf!;
    const schema = store.schema as Schema | null;
    const a = abschnitt("Wie geht die Abfrage aus?", "Hier legst du fest, was der Anrufer auf die Fragen der Abfrage antwortet – die Wahrheit. Der Code ergibt sich daraus von selbst (er steht nicht im Fall). Antworten ohne Festlegung wählt das Spiel passend aus.");
    formular.appendChild(a);
    if (!schema) {
      a.appendChild(el("div", { class: "fe-sperre" }, "Es ist kein Abfrageschema geladen (Einstellungen → Einsatzcodes & Abfrage). Ohne Schema lassen sich die Antworten nicht festlegen."));
      return;
    }
    const kap = kapitelZuThema(f.thema, schema);
    if (!kap) {
      a.appendChild(el("div", { class: "fe-sperre" }, `Das geladene Abfrageschema hat kein Kapitel zum Thema „${themaLabel(f.thema)}“.`));
      return;
    }
    // für alle Ausgänge oder nur für einen
    const fuer = el("div", { class: "fe-fuer" });
    const opts: Opt<string> = [["", "alle Ausgänge"], ...f.varianten.map((v) => [v.id, `nur Ausgang ${v.id}${v.lage ? ` – ${v.lage.slice(0, 40)}` : ""}`] as [string, string])];
    fuer.append(el("span", { class: "muted" }, "Antworten für "), auswahl(opts, abfrageFuer, (v) => {
      abfrageFuer = v;
      zeichnen();
    }));
    a.appendChild(fuer);
    if (abfrageFuer && !f.varianten.some((v) => v.id === abfrageFuer)) abfrageFuer = "";
    const variante = abfrageFuer ? f.varianten.find((v) => v.id === abfrageFuer) : undefined;
    if (variante) a.appendChild(el("p", { class: "fe-info" }, `Nur was in Ausgang ${variante.id} anders ist als bei „alle Ausgänge“ – z. B. „Atmung: Schnappatmung“ nur im schweren Ausgang.`));

    const ergebnis = el("div", { class: "fe-ergebnis" });
    const liste = el("div", { class: "fe-fragen" });
    a.append(ergebnis, liste);

    /** feste Antworten in Schema-IDs (bei Listen der erste Wert für den Ablauf) */
    const basisSchema = (): Antworten => {
      const m: Antworten = {};
      for (const [k, x] of Object.entries(f.fest ?? {})) m[k] = Array.isArray(x) ? (x[0] ?? null) : x;
      if (m.alter === undefined) m.alter = Math.round((f.alter[0] + f.alter[1]) / 2);
      if (m.geschlecht === undefined) m.geschlecht = f.geschlecht ?? "m";
      return merkmaleInSchema(schema, { ...m, ...(variante?.fest ?? {}) });
    };
    const zeichneFragen = () => {
      const ant = basisSchema();
      const erg = bestimmeCode(schema, kap, ant);
      const c = erg ? schema.codes[erg.code] : undefined;
      ergebnis.innerHTML = c
        ? `<span class="muted">Ergebnis der Abfrage (nur zur Kontrolle):</span> <b>${esc(erg!.code)}</b> ${esc(c.name ?? "")}`
        : `<span class="fe-warn">Mit diesen Antworten ergibt sich noch kein Code – es fehlen Antworten.</span>`;
      liste.innerHTML = "";
      let phase = "";
      for (const { phase: ph, frage } of fragenImAblauf(schema, kap, ant)) {
        if (frage.typ === "text" || frage.typ === "kapitelwahl") continue;
        if (ph !== phase) {
          phase = ph;
          liste.appendChild(el("div", { class: "fe-phase" }, ph));
        }
        liste.appendChild(frageZeile(frage, ant));
      }
    };
    /** Merkmal-Schlüssel und -Wert zu einer Schema-Antwort */
    const merkmal = (frage: Frage, wert: Wert): [string, Wert] => {
      const m = merkmaleAusSchema(schema, { [frage.id]: wert });
      const e = Object.entries(m).find(([k]) => k !== frage.id) ?? [frage.id, m[frage.id]];
      return [e[0], e[1] ?? null];
    };
    const merkmalKey = (frage: Frage) => merkmal(frage, frage.optionen?.[0]?.wert ?? "x")[0];
    const frageZeile = (frage: Frage, ant: Antworten): HTMLElement => {
      const key = merkmalKey(frage);
      const ziel = variante ? (variante.fest ??= {}) : (f.fest ??= {});
      const roh = variante ? variante.fest?.[key] : f.fest?.[key];
      const geerbt = variante && roh === undefined ? f.fest?.[key] : undefined;
      const z = el("div", { class: `fe-frage${roh === undefined && geerbt === undefined ? " offen" : ""}` });
      z.appendChild(el("div", { class: "fe-frage-text" }, frage.text));
      const feld = el("div", { class: "fe-frage-feld" });
      const setze = (v: Wert | Wert[] | undefined) => {
        if (v === undefined) delete (ziel as Record<string, unknown>)[key];
        else (ziel as Record<string, unknown>)[key] = v;
        if (variante && variante.fest && !Object.keys(variante.fest).length) delete variante.fest;
        aenderung();
        zeichneFragen();
      };
      if (frage.typ === "zahl") {
        const istAlter = frage.id === "alter";
        const i = el("input", { type: "number", class: "fe-zahl", placeholder: istAlter ? "aus Schritt 1" : "–" }) as HTMLInputElement;
        i.value = roh === undefined || Array.isArray(roh) ? "" : String(roh);
        i.addEventListener("change", () => setze(i.value === "" ? undefined : Number(i.value)));
        feld.appendChild(i);
        if (istAlter) feld.appendChild(el("span", { class: "fe-hilfe" }, "leer = Alter aus Schritt 1"));
      } else {
        const opts = frage.optionen ?? [];
        // Werte als Merkmal → zurück in die Schema-Option
        const zuSchema = (mw: Wert) => opts.find((o) => merkmal(frage, o.wert)[1] === mw)?.wert ?? String(mw);
        const liste = Array.isArray(roh) ? roh.map(zuSchema) : null;
        const s = el("select") as HTMLSelectElement;
        s.appendChild(el("option", { value: "" }, variante ? (geerbt !== undefined ? "wie bei allen Ausgängen" : "– nicht festgelegt –") : "– nicht festgelegt –"));
        for (const o of opts) s.appendChild(el("option", { value: o.wert }, o.label));
        s.appendChild(el("option", { value: "*" }, "eine von mehreren (zufällig) …"));
        s.value = liste ? "*" : roh === undefined ? "" : zuSchema(roh as Wert);
        feld.appendChild(s);
        const mehr = el("div", { class: "fe-chips klein" });
        if (liste) {
          for (const o of opts) {
            const b = el("button", { type: "button", class: `fe-chip${liste.includes(o.wert) ? " an" : ""}` }, o.label);
            b.addEventListener("click", () => {
              const neu = liste.includes(o.wert) ? liste.filter((x) => x !== o.wert) : [...liste, o.wert];
              setze(neu.map((w) => merkmal(frage, w)[1]));
            });
            mehr.appendChild(b);
          }
          feld.appendChild(mehr);
        }
        s.addEventListener("change", () => {
          if (s.value === "") setze(undefined);
          else if (s.value === "*") setze(opts.slice(0, 2).map((o) => merkmal(frage, o.wert)[1]));
          else setze(merkmal(frage, s.value)[1]);
        });
        if (geerbt !== undefined) feld.appendChild(el("span", { class: "fe-hilfe" }, `alle Ausgänge: ${Array.isArray(geerbt) ? geerbt.join(" / ") : String(geerbt)}`));
      }
      void ant;
      z.appendChild(feld);
      return z;
    };
    zeichneFragen();
  }

  // ---- Schritt 4: Ausgänge (Varianten)
  function schrittAusgaenge(): void {
    const f = entwurf!;
    const a = abschnitt("Wie geht der Fall aus?", "Jeder Ausgang ist eine mögliche Wahrheit mit Wahrscheinlichkeit – z. B. 80 % harmlos, 20 % ernst. Was die Besatzung sieht, steht im Lagebild; daraus folgt die Lagemeldung.");
    const summe = f.varianten.reduce((s, v) => s + v.p, 0);
    const sumZeile = el("div", { class: `fe-summe${Math.abs(summe - 1) > 0.001 ? " fehler" : ""}` });
    const sumText = () => {
      const s = f.varianten.reduce((x, v) => x + v.p, 0);
      sumZeile.className = `fe-summe${Math.abs(s - 1) > 0.001 ? " fehler" : ""}`;
      sumZeile.textContent = `Summe der Wahrscheinlichkeiten: ${Math.round(s * 100)} %${Math.abs(s - 1) > 0.001 ? " – muss 100 % ergeben" : ""}`;
    };
    sumText();
    const ausgleich = el("button", { class: "btn small", type: "button", title: "Wahrscheinlichkeiten so anpassen, dass sie 100 % ergeben" }, "auf 100 % ausgleichen");
    ausgleich.addEventListener("click", () => {
      const s = f.varianten.reduce((x, v) => x + v.p, 0);
      if (s > 0) for (const v of f.varianten) v.p = Math.round((v.p / s) * 1000) / 1000;
      const rest = 1 - f.varianten.reduce((x, v) => x + v.p, 0);
      const groesster = [...f.varianten].sort((x, y) => y.p - x.p)[0];
      if (groesster) groesster.p = Math.round((groesster.p + rest) * 1000) / 1000;
      aenderung();
      zeichnen();
    });
    const kopf = el("div", { class: "fe-summe-zeile" });
    kopf.append(sumZeile, ausgleich);
    a.appendChild(kopf);
    formular.appendChild(a);
    for (const v of f.varianten) formular.appendChild(varianteKarte(f, v, sumText));
    const neu = el("button", { class: "btn small primary fe-neu-var", type: "button" }, "+ Ausgang");
    neu.addEventListener("click", () => {
      f.varianten.push({ id: naechsteVarId(f), p: 0, sichtung: "gelb", lage: "", na: "nein", buchung: f.varianten[0]?.buchung ?? "bu_hausaerztlich" });
      aenderung();
      zeichnen();
    });
    formular.appendChild(neu);
  }

  function varianteKarte(f: FallVorlage, v: FallVariante, sumText: () => void): HTMLElement {
    const k = el("div", { class: `fe-var sicht-${v.sichtung}` });
    const kopf = el("div", { class: "fe-var-kopf" });
    kopf.innerHTML = `<b>Ausgang ${esc(v.id)}</b>`;
    const pIn = zahl(Math.round(v.p * 1000) / 10, (n) => {
      v.p = Math.max(0, Math.min(100, n)) / 100;
      sumText();
      aenderung();
    }, { min: 0, max: 100, step: 1, breit: "70px" });
    kopf.append(pIn, el("span", { class: "muted" }, "% "), el("span", { class: "fe-hilfe" }, v.p === 0 ? "0 % = entsteht nur durch Wechsel im Verlauf" : ""));
    kopf.appendChild(el("span", { class: "spacer" }));
    const loe = el("button", { class: "btn small danger-text", type: "button" }, "Ausgang entfernen");
    loe.disabled = f.varianten.length <= 1;
    loe.addEventListener("click", () => {
      f.varianten = f.varianten.filter((x) => x !== v);
      aenderung();
      zeichnen();
    });
    kopf.appendChild(loe);
    k.appendChild(kopf);

    const sicht = auswahl(SICHTUNG, v.sichtung, (x) => {
      v.sichtung = x;
      k.className = `fe-var sicht-${x}`;
      aenderung();
    });
    k.append(
      zeile("Beim Eintreffen", sicht),
      zeile("Lagebild", text(v.lage, (x) => {
        v.lage = x;
        aenderung();
      }, "z. B. wach, stabil, Schmerzen in der rechten Hüfte, Bein verkürzt und außenrotiert", true), "so meldet die Besatzung die Lage (ohne Alter/Geschlecht – das kommt automatisch)"),
      zeile("Notarzt", auswahl(NA_BEDARF, v.na, (x) => {
        v.na = x;
        aenderung();
      }), "nach der Scope-of-Practice-Matrix: wer vor Ort ist, entscheidet, ob ein NA nachgefordert wird"),
      zeile("Notarzt fährt mit", auswahl([["ja", "ja"], ["nein", "nein"]] as Opt<"ja" | "nein">, v.naBegleitet === undefined ? undefined : v.naBegleitet ? "ja" : "nein", (x) => {
        if ((x as string) === "") delete v.naBegleitet;
        else v.naBegleitet = x === "ja";
        aenderung();
      }, "Standard (rot/Notarzt-Bedarf: ja, gelb: oft, grün: nein)")),
      zeile("Krankenhaus (Verdacht)", buchungWahl(v.buchung, (x) => {
        v.buchung = x;
        aenderung();
      })),
      zeile("Transport", [
        haken(v.transport !== false, (x) => {
          if (x) delete v.transport;
          else v.transport = false;
          aenderung();
        }, "Patient wird ins Krankenhaus gebracht"),
        haken(!!v.tot, (x) => {
          if (x) v.tot = true;
          else delete v.tot;
          aenderung();
        }, "Patient verstorben (Notarzt stellt den Tod fest)"),
      ]),
      zeile("Revers", [
        zahl(Math.round((v.revers ?? 0) * 100), (x) => {
          if (x > 0) v.revers = Math.min(100, x) / 100;
          else delete v.revers;
          aenderung();
        }, { min: 0, max: 100, breit: "70px" }),
        el("span", { class: "muted" }, " % verweigern den Transport"),
      ], "nur wache, stabile Patienten; die Einstellung „Revers“ verringert oder schaltet es aus"),
    );
    // Partner
    const partnerBox = el("div", { class: "fe-partner" });
    const partnerZeichnen = () => {
      partnerBox.innerHTML = "";
      (v.partner ?? []).forEach((pg, i) => {
        const z = el("div", { class: "fe-partner-z" });
        z.append(
          auswahl(Object.entries(PARTNER).map(([id, d]) => [id, d.name] as [PartnerArt, string]), pg.art, (x) => {
            pg.art = x;
            aenderung();
          }),
          text(pg.grund, (x) => {
            pg.grund = x;
            aenderung();
          }, "Grund, z. B. Tragehilfe"),
          haken(!!pg.blockiert, (x) => {
            pg.blockiert = x || undefined;
            aenderung();
          }, "ohne geht nichts", "Der Rettungsdienst kann ohne sie nicht arbeiten (Befreiung, Tragehilfe, Zugang)"),
          haken(!!pg.eigenschutz, (x) => {
            pg.eigenschutz = x || undefined;
            aenderung();
          }, "Eigenschutz", "Gewalt/Waffen: Rettungsdienst wartet im Bereitstellungsraum"),
        );
        const x = el("button", { type: "button", class: "btn small fe-x" }, "×");
        x.addEventListener("click", () => {
          v.partner = (v.partner ?? []).filter((_, j) => j !== i);
          if (!v.partner.length) delete v.partner;
          aenderung();
          partnerZeichnen();
        });
        z.appendChild(x);
        partnerBox.appendChild(z);
      });
      const plus = el("button", { type: "button", class: "btn small fe-plus" }, "+ Feuerwehr, Polizei …");
      plus.addEventListener("click", () => {
        (v.partner ??= []).push({ art: "fw", grund: "" } as PartnerGrund);
        aenderung();
        partnerZeichnen();
      });
      partnerBox.appendChild(plus);
    };
    partnerZeichnen();
    k.appendChild(zeile("Weitere Kräfte", partnerBox, "Tragehilfe fordert der RTW über die Leitstelle an"));
    // ohne Notarzt
    const ohne = el("div", { class: "fe-ohne" });
    const ohneZeichnen = () => {
      ohne.innerHTML = "";
      const an = !!v.ohneNa;
      ohne.appendChild(
        haken(an, (x) => {
          if (x) v.ohneNa = { nachMin: 15, sichtung: "rot", lage: "" };
          else delete v.ohneNa;
          aenderung();
          ohneZeichnen();
        }, "Patient verschlechtert sich, wenn der nötige Notarzt fehlt"),
      );
      if (v.ohneNa) {
        const o = v.ohneNa;
        ohne.append(
          el("span", { class: "muted" }, " nach "),
          zahl(o.nachMin, (x) => {
            o.nachMin = x;
            aenderung();
          }, { min: 1, breit: "60px" }),
          el("span", { class: "muted" }, " min: "),
          auswahl(SICHTUNG, o.sichtung, (x) => {
            o.sichtung = x;
            aenderung();
          }),
          text(o.lage, (x) => {
            o.lage = x;
            aenderung();
          }, "neues Lagebild"),
        );
      }
    };
    ohneZeichnen();
    k.appendChild(zeile("Ohne Notarzt", ohne));
    // Verlauf
    const verlauf = el("div", { class: "fe-verlauf" });
    const verlaufZeichnen = () => {
      verlauf.innerHTML = "";
      (v.verlauf ?? []).forEach((ev, i) => verlauf.appendChild(ereignisKarte(f, v, ev, () => {
        v.verlauf = (v.verlauf ?? []).filter((_, j) => j !== i);
        if (!v.verlauf.length) delete v.verlauf;
        aenderung();
        verlaufZeichnen();
      })));
      const plus = el("button", { type: "button", class: "btn small fe-plus" }, "+ Ereignis");
      plus.addEventListener("click", () => {
        (v.verlauf ??= []).push({ nachMin: [8, 12], art: "verschlechterung", sichtung: "rot" });
        aenderung();
        verlaufZeichnen();
      });
      verlauf.appendChild(plus);
    };
    verlaufZeichnen();
    k.appendChild(zeile("Verlauf", verlauf, "Was sich ab dem Notruf ändert – der Anrufer meldet es bzw. die Besatzung vor Ort. Steuert die Einstellung „Komplikationen“."));
    return k;
  }

  function ereignisKarte(f: FallVorlage, v: FallVariante, ev: FallEreignis, weg: () => void): HTMLElement {
    const k = el("div", { class: "fe-ereignis" });
    const z1 = el("div", { class: "fe-ereignis-z" });
    z1.append(
      el("span", { class: "muted" }, "nach "),
      zahl(ev.nachMin[0], (x) => {
        ev.nachMin = [x, ev.nachMin[1]];
        aenderung();
      }, { min: 0, breit: "56px" }),
      el("span", { class: "muted" }, "–"),
      zahl(ev.nachMin[1], (x) => {
        ev.nachMin = [ev.nachMin[0], x];
        aenderung();
      }, { min: 0, breit: "56px" }),
      el("span", { class: "muted" }, " min "),
      auswahl([["verschlechterung", "Verschlechterung"], ["besserung", "Besserung"]] as Opt<"verschlechterung" | "besserung">, ev.art ?? "verschlechterung", (x) => {
        ev.art = x;
        aenderung();
      }),
      el("span", { class: "muted" }, " Chance "),
      zahl(Math.round((ev.chance ?? 1) * 100), (x) => {
        if (x >= 100) delete ev.chance;
        else ev.chance = Math.max(0, x) / 100;
        aenderung();
      }, { min: 0, max: 100, breit: "60px" }),
      el("span", { class: "muted" }, "%"),
    );
    const x = el("button", { type: "button", class: "btn small fe-x", title: "Ereignis entfernen" }, "×");
    x.addEventListener("click", weg);
    z1.appendChild(x);
    const z2 = el("div", { class: "fe-ereignis-z" });
    z2.append(
      el("span", { class: "muted" }, "danach: "),
      auswahl(SICHTUNG, ev.sichtung, (y) => {
        ev.sichtung = y;
        aenderung();
      }, "Sichtung gleich"),
      auswahl(BW, ev.bw, (y) => {
        if ((y as string) === "") delete ev.bw;
        else ev.bw = y;
        aenderung();
      }, "Bewusstsein gleich"),
      auswahl(AT, ev.at, (y) => {
        if ((y as string) === "") delete ev.at;
        else ev.at = y;
        aenderung();
      }, "Atmung gleich"),
      auswahl(NA_BEDARF, ev.na, (y) => {
        if ((y as string) === "") delete ev.na;
        else ev.na = y;
        aenderung();
      }, "Notarzt-Bedarf gleich"),
    );
    const z3 = el("div", { class: "fe-ereignis-z breit" });
    z3.append(
      text(ev.lage, (y) => {
        if (y.trim()) ev.lage = y;
        else delete ev.lage;
        aenderung();
      }, "neues Lagebild (was die Besatzung dann sieht)"),
      text(ev.text, (y) => {
        if (y.trim()) ev.text = y;
        else delete ev.text;
        aenderung();
      }, "so meldet es der Anrufer, z. B. {Er} reagiert nicht mehr!"),
    );
    const z4 = el("div", { class: "fe-ereignis-z" });
    const andere = f.varianten.filter((x) => x !== v).map((x) => [x.id, `Ausgang ${x.id}`] as [string, string]);
    z4.append(
      el("span", { class: "muted" }, "mit Anleitung am Telefon "),
      auswahl(ANLEITUNGEN, ev.mitAnleitung?.typ, (y) => {
        if ((y as string) === "") delete ev.mitAnleitung;
        else ev.mitAnleitung = { typ: y, chance: ev.mitAnleitung?.chance ?? 0.5 };
        aenderung();
      }, "–"),
      el("span", { class: "muted" }, " Chance dann "),
      zahl(Math.round((ev.mitAnleitung?.chance ?? 0.5) * 100), (y) => {
        if (ev.mitAnleitung) ev.mitAnleitung.chance = Math.max(0, Math.min(100, y)) / 100;
        aenderung();
      }, { min: 0, max: 100, breit: "60px" }),
      el("span", { class: "muted" }, "% · "),
      haken(!!ev.nurMitNa, (y) => {
        if (y) ev.nurMitNa = true;
        else delete ev.nurMitNa;
        aenderung();
      }, "erst wenn der Notarzt da ist"),
      el("span", { class: "muted" }, " · wechselt zu "),
      auswahl(andere, ev.wechselZu, (y) => {
        if ((y as string) === "") delete ev.wechselZu;
        else ev.wechselZu = y;
        aenderung();
      }, "–"),
    );
    k.append(z1, z2, z3, z4);
    return k;
  }

  function buchungWahl(wert: string, setze: (v: string) => void): HTMLElement {
    const s = el("select", { class: "fe-buchung" }) as HTMLSelectElement;
    const kats = [...new Set(BUCHUNGEN.map((b) => b.kategorie))];
    for (const kat of kats) {
      const g = el("optgroup") as HTMLOptGroupElement;
      g.label = kat;
      for (const b of BUCHUNGEN.filter((x) => x.kategorie === kat).sort((x, y) => x.name.localeCompare(y.name, "de"))) g.appendChild(el("option", { value: b.id }, b.name));
      s.appendChild(g);
    }
    s.value = wert;
    s.addEventListener("change", () => setze(s.value));
    return s;
  }

  // ---- Schritt 5: Prüfen & Testen
  /** Befunde: hart = so nicht spielbar; weich = Hinweis (z. B. offene Frage, die das Spiel selbst beantwortet) */
  function befundeJetzt(): { text: string; hart: boolean }[] {
    if (!entwurf) return [];
    const out = fallPruefen(entwurf, store.schema as Schema | null).map((b) => ({ text: `${b.variante ? `Ausgang ${b.variante}: ` : ""}${b.fehler.replace(/hat keine Antwort$/, "ist offen – das Spiel wählt eine passende Antwort")}`, hart: !/hat keine Antwort$/.test(b.fehler) }));
    if (!fallName(entwurf).trim()) out.unshift({ text: "Name fehlt (Schritt 1)", hart: true });
    if (!entwurf.geschehen?.some((h) => h.trim())) out.push({ text: "Was passiert ist (Fakten) fehlt (Schritt 2)", hart: true });
    if (!entwurf.anrufer.length) out.push({ text: "kein Anrufer gewählt (Schritt 2)", hart: true });
    if (!entwurf.orte.length && (entwurf.ortModus ?? "nur") === "nur") out.push({ text: "kein Ort gewählt (Schritt 1)", hart: true });
    for (const v of entwurf.varianten) if (!v.lage.trim()) out.push({ text: `Ausgang ${v.id}: Lagebild fehlt`, hart: true });
    if (entwurf.anrufer.includes("selbst") && !entwurf.hergangIch?.some((h) => h.trim())) out.push({ text: "Patient kann selbst anrufen, aber es gibt kein Beispiel in Ich-Form (Schritt 2) – geht auch ohne", hart: false });
    const ein = out.filter((b, i) => out.findIndex((x) => x.text === b.text) === i);
    return [...ein.filter((b) => b.hart), ...ein.filter((b) => !b.hart)];
  }

  function schrittPruefen(): void {
    const f = entwurf!;
    const a = abschnitt("Prüfen", "Das Prüfprogramm spielt die Abfrage mit jedem Ausgang durch: Ergibt sich ein Code? Hat jede Frage eine Antwort? Widerspricht sich etwas?");
    const bef = befundeJetzt();
    if (!bef.length) a.appendChild(el("div", { class: "fe-ok" }, "✓ Keine Hinweise – der Fall ist spielbar."));
    else {
      if (!bef.some((b) => b.hart)) a.appendChild(el("div", { class: "fe-ok" }, "✓ Der Fall ist spielbar. Hinweise:"));
      const ul = el("ul", { class: "fe-befunde" });
      for (const b of bef) ul.appendChild(el("li", { class: b.hart ? "hart" : "" }, b.text));
      a.appendChild(ul);
      a.appendChild(el("p", { class: "fe-info" }, "Fehlende Antworten legst du in Schritt 3 fest – oder lass sie bewusst offen, dann wählt das Spiel eine passende."));
    }
    const b = abschnitt(
      "Probe-Anrufe",
      "Drei Notrufe mit diesem Fall, jeweils mit einem anderen Anrufer: wer anruft, wie er redet, was er weiß – und mit KI die ersten Antworten. So siehst du, wie unterschiedlich die Anrufe werden. Nichts davon kommt ins Spiel.",
    );
    const proben = el("div", { class: "fe-proben" });
    const probeB = el("button", { class: "btn small", type: "button" }, "▶ 3 Probe-Anrufe");
    probeB.addEventListener("click", () => void probeAnrufe(f, proben, probeB));
    b.append(probeB, proben);
    const t = abschnitt("Durchspielen", "Startet gleich einen Notruf mit diesem Fall. Ungespeicherte Änderungen werden vorher gespeichert.");
    const varWahl = auswahl([["", "Ausgang zufällig"], ...f.varianten.map((v) => [v.id, `Ausgang ${v.id} – ${v.lage.slice(0, 50) || v.sichtung}`] as [string, string])], "", () => undefined);
    const los = el("button", { class: "btn primary", type: "button" }, "▶ Diesen Fall durchspielen");
    los.disabled = sim.mode === "client";
    if (sim.mode === "client") t.appendChild(el("p", { class: "fe-hilfe" }, "Im Mehrspieler-Spiel kann nur der Gastgeber Fälle starten."));
    los.addEventListener("click", async () => {
      if (!gesperrt() && (geaendert || istNeu) && !speichern()) return;
      const e = await sim.generiereFall(f.id, varWahl.value || undefined);
      if (!e) {
        toast("Der Fall ließ sich nicht starten – siehe Hinweise oben", "error");
        return;
      }
      toast(`Notruf mit „${fallName(f)}“ kommt herein`);
      verstecken();
    });
    t.append(zeile("Ausgang", varWahl), los);
    formular.append(a, b, t);
  }

  /** Probe-Anrufe: Anrufer würfeln, Fakten füllen und (mit KI) die ersten Fragen stellen */
  async function probeAnrufe(f: FallVorlage, box: HTMLElement, knopf: HTMLButtonElement): Promise<void> {
    if (sim.mode === "client") return void toast("Im Mehrspieler-Spiel kann nur der Gastgeber Proben starten", "error");
    if (!gesperrt() && (geaendert || istNeu) && !speichern()) return;
    knopf.disabled = true;
    box.innerHTML = "";
    await kiStatus().catch(() => null);
    const ki = kiBereit();
    if (!ki) box.appendChild(el("p", { class: "fe-hilfe" }, "Die KI läuft nicht – gezeigt werden nur die gewürfelten Anrufer und Fakten. Mit KI (Einstellungen → KI-Anrufer) antworten sie auch."));
    const schema = store.schema as Schema | null;
    const alleFragen = schema ? Object.values(schema.globale_fragen ?? {}).flat() : [];
    const fr = (id: string) => alleFragen.find((x) => x.id === id);
    try {
      for (let i = 0; i < 3; i++) {
        const e = await sim.probeFall(f.id);
        const w = e?.wahr.abfrage;
        if (!e || !w) {
          box.appendChild(el("p", { class: "fe-warn" }, "Der Fall ließ sich nicht erzeugen – siehe Hinweise oben."));
          break;
        }
        const x = w.anrufer;
        const p = x.persona;
        const karte = el("div", { class: "fe-probe" });
        const kopf = el("div", { class: "fe-probe-kopf" });
        const EMO: Record<string, string> = { ruhig: "ruhig", gefasst: "gefasst", aufgeregt: "aufgeregt", panisch: "panisch" };
        const STIL: Record<string, string> = { knapp: "redet knapp", normal: "redet normal", gespraechig: "redet gern", unsicher: "unsicher" };
        const WISSEN: Record<string, string> = { nah: "kennt den Patienten gut", bekannt: "kennt ihn ein bisschen", fremd: "kennt ihn nicht", profi: "Fachkraft" };
        const EIN: Record<string, string> = { adresse: "beginnt mit der Adresse", dringend: "„bitte schnell“", problem: "beginnt mit dem Problem", hallo: "„bin ich richtig?“", unvollstaendig: "vergisst die Gemeinde", umschreibung: "beschreibt das Haus", vorstellung: "stellt sich vor" };
        kopf.innerHTML = `<b>${esc(x.rolle)}</b> · ${esc(EMO[x.emotion] ?? x.emotion)}${x.sprache !== "hochdeutsch" ? ` · ${x.sprache === "dialekt" ? "Dialekt" : "gebrochenes Deutsch"}` : ""}${p ? ` · ${esc(STIL[p.stil])} · ${esc(WISSEN[p.wissen])} · ${esc(EIN[p.einstieg])}${p.nennt[0] !== "ich" ? ` · sagt „${esc(p.nennt.slice(0, 2).join("“, „"))}“` : ""}` : ""}`;
        karte.appendChild(kopf);
        const sz = w.szenario;
        if (sz?.geschehen?.length) karte.appendChild(el("div", { class: "fe-probe-fakten" }, sz.geschehen.join(" ")));
        const verlauf = el("div", { class: "fe-probe-verlauf" });
        karte.appendChild(verlauf);
        box.appendChild(karte);
        if (!ki) continue;
        const warten = el("div", { class: "fe-probe-z muted" }, "…");
        verlauf.appendChild(warten);
        await probeGespraech(
          e,
          [
            { text: ERÖFFNUNG, frage: fr("ort_adresse") },
            { text: "Was ist passiert?", frage: fr("schilderung") },
            { text: "Wie alt ist der Patient ungefähr?", frage: fr("alter") },
          ],
          (von, text) => {
            const z = el("div", { class: `fe-probe-z ${von}` });
            z.innerHTML = `<span class="fe-probe-von">${von === "leitstelle" ? "Leitstelle" : "Anrufer"}:</span> ${esc(text)}`;
            verlauf.insertBefore(z, warten);
          },
        );
        warten.remove();
      }
    } catch (err) {
      toast(`Probe: ${String((err as Error).message ?? err)}`, "error");
    } finally {
      knopf.disabled = false;
    }
  }

  // ---- Neuer Fall (leer oder KI-Entwurf)
  async function neuDialog(): Promise<void> {
    if (!(await weiterOhneSpeichern())) return;
    const body = el("div", { class: "fe-neu" });
    const name = el("input", { type: "text", placeholder: "Name, z. B. Bienenstich im Garten" }) as HTMLInputElement;
    const beschr = el("textarea", { rows: "5", placeholder: "Kurz beschreiben, was passiert ist und wie es ausgehen kann – z. B.: Mann, 40, wird im Garten von einer Biene in den Hals gestochen, ist aufgeregt. Meist nur Schwellung und Angst, selten allergische Reaktion mit Atemnot." }) as HTMLTextAreaElement;
    const kiInfo = el("div", { class: "fe-hilfe" });
    body.append(el("p", { class: "muted" }, "Du kannst leer beginnen oder die KI einen Entwurf aus deiner Beschreibung machen lassen. Danach ist alles von Hand änderbar."), zeile("Name", name), zeile("Beschreibung (für die KI)", [beschr, kiInfo]));
    await kiStatus().catch(() => null);
    const ki = kiBereit();
    kiInfo.textContent = ki ? "Der Entwurf dauert je nach Rechner ein bis zwei Minuten." : "Die KI ist nicht gestartet (Einstellungen → KI-Anrufer) – leer beginnen geht immer.";
    openDialog({
      title: "Neuer Fall",
      body,
      wide: true,
      actions: [
        { label: "Abbrechen" },
        {
          label: "Leer beginnen",
          onClick: () => {
            const f = neuerFall();
            f.name = name.value.trim();
            beginne(f);
          },
        },
        {
          label: "✨ Entwurf mit KI",
          kind: "primary",
          onClick: async () => {
            if (!ki) {
              toast("Die KI ist nicht bereit – bitte in den Einstellungen starten oder leer beginnen", "error");
              return false;
            }
            if (beschr.value.trim().length < 15) {
              toast("Bitte den Fall in ein, zwei Sätzen beschreiben", "error");
              return false;
            }
            void kiEntwurf(name.value.trim(), beschr.value.trim());
          },
        },
      ],
    });
  }

  function beginne(f: FallVorlage): void {
    entwurf = f;
    istNeu = true;
    gewaehlt = null;
    geaendert = true;
    schritt = 0;
    abfrageFuer = "";
    zeichnen();
  }

  async function kiEntwurf(name: string, beschreibung: string): Promise<void> {
    const warten = el("div", { class: "fe-ki-warten" });
    warten.innerHTML = `<div class="fe-spinner"></div><div>Die KI schreibt einen Entwurf …</div><div class="fe-ki-text muted small"></div>`;
    const d = openDialog({ title: "Entwurf mit KI", body: warten, actions: [{ label: "Abbrechen" }] });
    let abgebrochen = false;
    d.root.closest(".dlg")?.querySelector(".dlg-foot .btn")?.addEventListener("click", () => (abgebrochen = true));
    const out = warten.querySelector(".fe-ki-text")!;
    try {
      let n = 0;
      const antwort = await kiJson(kiPrompt(name, beschreibung), () => {
        n++;
        out.textContent = `${n} Teile geschrieben …`;
      });
      if (abgebrochen) return;
      d.close();
      const f = entwurfAusKi(antwort, name);
      if (!f) {
        toast("Die KI hat keinen brauchbaren Entwurf geliefert – bitte nochmal versuchen oder leer beginnen", "error");
        return;
      }
      beginne(f);
      toast("Entwurf übernommen – bitte alle Schritte durchsehen");
    } catch (e) {
      d.close();
      toast(`KI-Fehler: ${String((e as Error).message ?? e)}`, "error");
    }
  }

  // ---- Export / Import
  function exportDialog(): void {
    const body = el("div", { class: "fe-export" });
    const alle = alleFaelle(true);
    const eigene = alle.filter((f) => !eingebauterFall(f.id) || istGeaendert(f.id));
    const gewaehltSet = new Set(eigene.map((f) => f.id));
    body.appendChild(el("p", { class: "muted" }, "Welche Fälle sollen ins Fallpaket? Das Paket ist eine .json-Datei, die man in jedem LeitWerk importieren kann."));
    const liste = el("div", { class: "fe-export-liste" });
    for (const f of alle.sort((a, b) => fallName(a).localeCompare(fallName(b), "de"))) {
      const l = haken(gewaehltSet.has(f.id), (v) => {
        if (v) gewaehltSet.add(f.id);
        else gewaehltSet.delete(f.id);
      }, `${fallName(f)}${eingebauterFall(f.id) ? (istGeaendert(f.id) ? " (eingebaut, geändert)" : " (eingebaut)") : ""}`);
      liste.appendChild(l);
    }
    body.appendChild(liste);
    openDialog({
      title: "Fallpaket exportieren",
      body,
      actions: [
        { label: "Abbrechen" },
        {
          label: "Speichern …",
          kind: "primary",
          onClick: async () => {
            if (!gewaehltSet.size) {
              toast("Keine Fälle gewählt", "error");
              return false;
            }
            const json = fallpaketExport([...gewaehltSet]);
            const datum = new Date().toISOString().slice(0, 10);
            const p = await saveTextFile(`leitwerk-faelle-${datum}.json`, json, { name: "Fallpaket", extensions: ["json"] });
            if (p) toast(`${gewaehltSet.size} ${gewaehltSet.size === 1 ? "Fall" : "Fälle"} exportiert`);
          },
        },
      ],
    });
  }

  async function importieren(): Promise<void> {
    const d = await pickTextFile(".json");
    if (!d) return;
    const r = fallpaketImport(d.text, adminFrei);
    if (r.fehler.length && !r.neu && !r.ersetzt) {
      openDialog({ title: "Import nicht möglich", body: el("pre", { class: "fe-importfehler" }, r.fehler.slice(0, 20).join("\n")), actions: [{ label: "OK", kind: "primary" }] });
      return;
    }
    toast(`${r.neu} neu, ${r.ersetzt} ersetzt${r.fehler.length ? `, ${r.fehler.length} übersprungen` : ""}`);
    if (r.fehler.length) openDialog({ title: "Einige Fälle wurden übersprungen", body: el("pre", { class: "fe-importfehler" }, r.fehler.slice(0, 20).join("\n")), actions: [{ label: "OK", kind: "primary" }] });
    zeichnen();
  }

  // ---- Öffnen / Schließen
  const verstecken = () => {
    overlay.classList.add("zu");
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove("zu");
    }, 140);
  };
  const schliessen = async () => {
    if (!(await weiterOhneSpeichern())) return;
    if (istNeu) {
      entwurf = null;
      istNeu = false;
    } else if (entwurf && geaendert) entwurf = structuredClone(alleFaelle(true).find((x) => x.id === entwurf!.id) ?? entwurf);
    geaendert = false;
    verstecken();
  };
  zu.addEventListener("click", () => void schliessen());
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) void schliessen();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && !document.querySelector(".dlg-overlay")) {
      e.stopPropagation();
      void schliessen();
    }
  });
  faelleGeaendert(() => {
    if (!overlay.hidden) listeZeichnen();
  });

  return {
    zeigen(id) {
      overlay.hidden = false;
      if (id && id !== gewaehlt) void waehlen(id);
      else zeichnen();
    },
  };
}

// ------------------------------------------------------------------ KI-Entwurf

function kiPrompt(name: string, beschreibung: string): { role: "system" | "user"; content: string }[] {
  const themen = THEMEN.map((t) => `${t.id} (${t.label})`).join(", ");
  const buchungen = BUCHUNGEN.map((b) => `${b.id} (${b.name})`).join("; ");
  const system = `Du entwirfst Notruf-Fälle für einen Leitstellensimulator in Niederösterreich. Antworte NUR mit einem JSON-Objekt, ohne Erklärung.
Felder:
- "name": kurzer Name
- "thema": eine dieser IDs: ${themen}
- "alter": [von, bis] in Jahren
- "geschlecht": "m", "w" oder weglassen
- "orte": Liste aus ${ORTE.map(([k]) => k).join(", ")}
- "stelle": 2–3 kurze Ortsangaben wie „im Badezimmer“
- "anrufer": Liste aus ${ANRUFER.map(([k]) => k).join(", ")}
- "geschehen": 3–5 Fakten, was wirklich passiert ist (Abfolge, Umstände) – sachlich, aus Sicht von jemandem, der dabei war. Platzhalter: {P} = die Person („Mein Mann“), {er}/{Er}/{ihn}/{ihm}/{sein} = Pronomen, {a|b} = eines davon zufällig.
- "hergang": 1–2 Beispiele, wie ein Laie den ersten Satz am Telefon sagen könnte (österreichisches Deutsch, keine Fachsprache, gleiche Platzhalter).
- "details": 2–4 Dinge, die der Anrufer auf Nachfrage erzählt (mit Platzhaltern)
- "seitMin": [von, bis] Minuten seit dem Ereignis
- "varianten": 1–3 Ausgänge, zusammen p = 1. Jeder: { "id": "A", "p": 0.8, "sichtung": "gruen"|"gelb"|"rot", "lage": "Lagebild der Besatzung, kurz, fachlich", "na": "nein"|"immer"|"RS"|"NFS-NKV", "buchung": eine ID aus der Liste }
Meist harmlos, selten ernst. Buchungen: ${buchungen}`;
  return [
    { role: "system", content: system },
    { role: "user", content: `${name ? `Name: ${name}\n` : ""}Beschreibung: ${beschreibung}` },
  ];
}

/** KI-Antwort → Fall (nur bekannte Felder, Werte geprüft; der Rest bleibt Standard) */
export function entwurfAusKi(antwort: string, name: string): FallVorlage | null {
  const roh = antwort.slice(antwort.indexOf("{"), antwort.lastIndexOf("}") + 1);
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(roh) as Record<string, unknown>;
  } catch {
    return null;
  }
  const f = neuerFall();
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const strs = (x: unknown) => (Array.isArray(x) ? x.map(str).filter(Boolean) : []);
  const paar = (x: unknown, d: [number, number]): [number, number] => (Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === "number") ? [Math.min(x[0], x[1]), Math.max(x[0], x[1])] : d);
  f.name = name || str(j.name) || "Neuer Fall";
  if (THEMEN.some((t) => t.id === j.thema)) f.thema = j.thema as string;
  f.alter = paar(j.alter, f.alter);
  if (j.geschlecht === "m" || j.geschlecht === "w") f.geschlecht = j.geschlecht;
  const orte = strs(j.orte).filter((o) => ORTE.some(([k]) => k === o)) as OrtArt[];
  if (orte.length) f.orte = orte;
  if (j.ortModus === "ueberall" || j.ortModus === "ausser") f.ortModus = j.ortModus;
  const stelle = strs(j.stelle);
  if (stelle.length) f.stelle = stelle;
  const anr = strs(j.anrufer).filter((o) => ANRUFER.some(([k]) => k === o)) as AnruferTyp[];
  if (anr.length) f.anrufer = anr;
  const h = strs(j.hergang);
  if (h.length) f.hergang = h;
  const g = strs(j.geschehen);
  if (g.length) f.geschehen = g;
  const det = strs(j.details);
  if (det.length) f.details = det;
  f.seitMin = paar(j.seitMin, f.seitMin ?? [5, 30]);
  if (Array.isArray(j.varianten)) {
    const vs: FallVariante[] = [];
    for (const x of j.varianten as Record<string, unknown>[]) {
      if (!x || typeof x !== "object") continue;
      const sichtung = (["gruen", "gelb", "rot"] as Sichtung[]).includes(x.sichtung as Sichtung) ? (x.sichtung as Sichtung) : "gelb";
      const na = NA_BEDARF.some(([k]) => k === x.na) ? (x.na as NaBedarf) : "nein";
      const buchung = BUCHUNGEN.some((b) => b.id === x.buchung) ? (x.buchung as string) : sichtung === "gruen" ? "bu_hausaerztlich" : "bu_exsikkose_synkope_az_verschlechterung";
      vs.push({ id: naechsteVarId({ ...f, varianten: vs }), p: typeof x.p === "number" ? Math.max(0, Math.min(1, x.p)) : 0, sichtung, lage: str(x.lage), na, buchung });
    }
    if (vs.length) {
      const s = vs.reduce((a, v) => a + v.p, 0);
      for (const v of vs) v.p = s > 0 ? Math.round((v.p / s) * 100) / 100 : Math.round(100 / vs.length) / 100;
      vs[0].p = Math.round((vs[0].p + 1 - vs.reduce((a, v) => a + v.p, 0)) * 100) / 100;
      f.varianten = vs;
    }
  }
  return f;
}
