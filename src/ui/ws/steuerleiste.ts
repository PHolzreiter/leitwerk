/**
 * Kopfleiste oben (Entwurf „Kopfleiste“, 09.11.): links „Spiel“, rechts „Ich“.
 * Logo · Pause/Weiter · Zeitraffer · Uhr · Wetter · „Neu“ RD/KT/SEK/ACN | Platz | „Ich nehme an“ · Fenster ▾ ·
 * Anordnung ▾ · Update (nur wenn eines da ist) · Status · Fehler melden · ⋯ (nur wenn etwas hineingewandert ist).
 *
 * Fließend: die Teile werden der Reihe nach kompakter bzw. wandern ins „⋯“, bis alles in die Breite passt
 * (gemessen an einer unsichtbaren Kopie der Leiste, nicht mit festen Zahlen). Was wieder Platz hat, kommt zurück.
 *
 * Schubladen (Wetter, Fenster, Anordnung, ⋯, Update, Fehler melden, Logo) wie im Hauptmenü: der Knopf wird
 * zum Reiter so breit wie sein Fenster, die Beschriftungen der anderen klappen weich ein, dann fährt das
 * Fenster darunter heraus. Zu: erst hoch, dann wird der Reiter schmal, dann kommen die Beschriftungen zurück.
 */
import "./kopfleiste.css";
import { spielmenueEinstellungen, spielmenueEscEinrichten, spielmenueOeffnen } from "../spielmenue";
import { store } from "../../data/store";
import { mp } from "../../net/mehrspieler";
import { sim } from "../../sim/engine";
import { fehlerBerichtSpeichern } from "../fehlerMelden";
import { ensureCodes } from "../codesPrompt";
import { el, esc, toast } from "../dom";
import { setzeEditorDeps } from "../panels/karte";
import {
  andereFenster,
  anordnungAnwenden,
  anordnungen,
  anordnungSpeichern,
  inEigenesFenster,
  onPanelsGeaendert,
  panelDefs,
  panelOeffnen,
  panelZeigen,
  VORLAGEN,
  vorlageAnwenden,
  woOffen,
} from "./arbeitsplatz";
import { FENSTER_ID, IST_HAUPT } from "./bus";
import { karteWaehlen } from "./auswahl";
import { fensterSchliessen } from "./nebenfenster";
import { onPers, pers, setzePers } from "./persoenlich";
import { logoMarke } from "../logo";
import { jetztSichern } from "../../net/spielstand";
import { mb, onUpdate, updateImHintergrund, updateInfo, updateStand, updateStandZuruecksetzen } from "../updateDienst";
import {
  anordnungBild,
  bildSvg,
  FENSTER_GRUPPEN,
  FENSTER_KURZ,
  IC,
  ic,
  vorlageBild,
  wetterHtml,
  wetterKurz,
  wetterSchluessel,
  zeile,
  type WetterReiter,
} from "./kopfleisteInhalt";

// ---------------------------------------------------------------- Einstellungen (im Spielmenü, dieselben Seiten wie im Hauptmenü)

/** Ort auf der Karte wählen, während ein Menü offen ist (Spielmenü kurz ausblenden) */
async function waehlenAusPopup(hinweis: string): Promise<{ lat: number; lon: number } | null> {
  const m = document.querySelector<HTMLElement>(".smw-wurzel");
  if (m) m.style.visibility = "hidden";
  try {
    return await karteWaehlen(hinweis);
  } finally {
    if (m) m.style.visibility = "";
  }
}

/** Einstellungen bei den Daten öffnen (Fahrzeuge, Dienststellen …); seite z. B. „codes“ */
export function datenOeffnen(seite = "fahrzeuge"): void {
  spielmenueEinstellungen(seite);
}

/** Einstellungen öffnen – optional gleich auf einer Seite (z. B. „telefon“, „fahrzeuge“; alte Seitennamen gehen auch) */
export function einstellungenOeffnen(seite?: string): void {
  spielmenueEinstellungen(seite);
}

// ---------------------------------------------------------------- Hilfen

function fensterName(id: string): string {
  return id === "haupt" ? "Hauptfenster" : `Fenster ${id.replace("fenster-", "")}`;
}

/** „NÖ-03“ → „RD-NOE-03“ (Name der Funkgruppe wie am Funkgerät) */
function gruppenName(): string {
  return String(sim.funkgruppe().id).replace(/^NÖ-/, "RD-NOE-");
}

const TEMPI = [1, 2, 5, 10];
const ARTEN: [string, string, string][] = [
  ["rd", "RD", "Notfälle (RD)"],
  ["kt", "KT", "Krankentransporte (KT)"],
  ["sek", "SEK", "Überstellungen (SEK)"],
  ["acn", "ACN", "Akutpflege (ACN)"],
];
type ArtKey = "rdAktiv" | "ktAktiv" | "sekAktiv" | "acnAktiv";
const artAn = (k: string) => store.settings[`${k}Aktiv` as ArtKey] !== false;
/** Neu-Arten ändern darf im Mehrspieler nur der Host */
const istGast = () => mp.status.rolle === "client";

type Lade = "spiel" | "wetter" | "fenster" | "anordnung" | "mehr" | "update" | "fehler";
/** Breite der Schubladen (px, wie im Entwurf) */
const BREITE: Record<Lade, number> = { spiel: 300, wetter: 452, fenster: 392, anordnung: 420, mehr: 320, update: 380, fehler: 400 };
const LADE_CLS: Record<Lade, string> = { spiel: "kl-spop", wetter: "kl-wpop", fenster: "", anordnung: "", mehr: "kl-mpop", update: "kl-upop", fehler: "kl-fpop" };

/** Reihenfolge beim Platzmangel (Entwurf: schritte) – jeweils Klassen an der Leiste */
const SCHRITTE: string[][] = [
  ["k-ohne-ichlbl"],
  ["k-ohne-stat"],
  ["k-ohne-updtxt"],
  ["k-fen-ik"],
  ["k-ohne-marke"],
  ["k-ohne-wxtxt"],
  ["k-ohne-pausetxt"],
  ["k-ohne-neu"],
  ["k-ohne-tempo"],
  ["k-ohne-ich"],
  ["k-uhr-klein"],
  // sehr schmal (z. B. mit Update-Knopf unter ca. 500 px): Abstände enger
  ["k-eng"],
];
const SCHRITTE_ZWEIT: string[][] = [["k-fen-ik"], ["k-uhr-klein"], ["k-eng"]];
/** was ins „⋯“ wandert und als Erstes wieder zurückkommt */
const INS_MEHR = ["k-ohne-tempo", "k-ohne-ich", "k-ohne-neu"];
const ALLE_STUFEN = [...new Set(SCHRITTE.flat()), "k-mehr"];

const ohneAnimation = () => document.documentElement.classList.contains("ohne-animation") || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- Leiste

export function steuerleisteBauen(kopf: HTMLElement): void {
  setzeEditorDeps({ pickOnMap: waehlenAusPopup });
  if (IST_HAUPT) spielmenueEscEinrichten();
  kopf.className = `kl-leiste${IST_HAUPT ? "" : " kl-zweit-leiste"}`;
  kopf.setAttribute("aria-label", "Kopfleiste");

  const fenAnker = (k: "fenster" | "anordnung", label: string, symbol: string) =>
    `<div class="kl-anker re" data-lade="${k}"><button type="button" class="kn sm leise kl-fenk" data-knopf="${k}" title="${label}" aria-haspopup="true" aria-expanded="false">${ic(symbol)}<span class="kl-lab kl-fen-lab" data-lab="fen">${label}${ic(IC.pfeil)}</span></button></div>`;

  if (IST_HAUPT) {
    kopf.innerHTML = `
      <div class="kl-anker li" data-lade="spiel"><button type="button" class="kl-marke" data-knopf="spiel" title="Spielmenü: Spielstand, Einstellungen, Multiplayer, Fälle, Hauptmenü (Esc)" aria-haspopup="dialog" aria-expanded="false">${logoMarke(28)}<span class="kl-lab kl-marke-lab" data-lab="marke"><span>Leit<span class="kl-werk">Werk</span></span></span>${ic(IC.menue)}</button></div>
      <div class="kl-gr">
        <button type="button" class="kn sm kl-pause" data-knopf="pause">${ic(IC.pause)}<span class="kl-lab kl-pause-lab" data-lab="pause">Pause</span></button>
        <div class="segs kl-tempo kl-leiste-tempo" role="group" aria-label="Zeitraffer" style="--n:4;--i:0">${TEMPI.map((t) => `<button type="button" class="seg" data-tempo="${t}">${t}×</button>`).join("")}</div>
        <span class="pill blau kl-tempo-mini" title="Zeitraffer"></span>
        <time class="kl-uhr" title="Spielzeit">--:--:--</time>
        <div class="kl-anker li" data-lade="wetter"><button type="button" class="kn sm leise kl-wx" data-knopf="wetter" aria-haspopup="true" aria-expanded="false"><span class="kl-wsymbol"></span><span class="kl-wpkt" hidden></span><span class="kl-lab kl-wx-lab" data-lab="wx"></span><span class="kl-wgrad"></span></button></div>
      </div>
      <div class="kl-gr kl-anker kl-neu" data-tip="neu">
        <span class="kl-gl">Neu<span class="kl-schloss" hidden>${ic(IC.schloss, "ic s", ` style="width:12px;height:12px"`)}</span></span>
        ${ARTEN.map(([k, t]) => `<button type="button" class="kl-chip" data-art="${k}"><span class="kl-pkt"></span>${t}</button>`).join("")}
      </div>
      <span class="kl-platz"></span>
      <div class="kl-gr ohne-linie kl-anker kl-ich-gr" data-tip="ich">
        <div class="kl-ich"><span class="kl-tel">${ic(IC.telefon)}</span><span class="kl-gl kl-lab kl-ich-lbl" data-lab="ich">Ich nehme an</span>${annahmeKnoepfe()}</div>
      </div>
      <div class="kl-gr">${fenAnker("fenster", "Fenster", IC.fenster)}${fenAnker("anordnung", "Anordnung", IC.anordnung)}</div>
      <div class="kl-gr">
        <div class="kl-anker re kl-upd-anker" data-lade="update"><button type="button" class="kn sm kl-upd" data-knopf="update" title="Neue LeitWerk-Version" aria-haspopup="true" aria-expanded="false">${ic(IC.update)}<span class="kl-lab kl-upd-lab" data-lab="upd"></span></button></div>
        <button type="button" class="kl-stat" data-knopf="status"><span class="kl-sp"></span><span class="kl-lab kl-stat-lab" data-lab="stat"></span></button>
        <div class="kl-anker re" data-lade="fehler"><button type="button" class="kl-ik" data-knopf="fehler" title="Fehler melden" aria-haspopup="true" aria-expanded="false">${ic(IC.kaefer)}</button></div>
        <div class="kl-anker re kl-mehr-anker" data-lade="mehr"><button type="button" class="kl-ik" data-knopf="mehr" title="Weitere" aria-haspopup="true" aria-expanded="false">${ic(IC.mehr, "ic", ` style="stroke-width:3"`)}<span class="kl-mpkt" hidden></span></button></div>
      </div>`;
  } else {
    // Zweites Programmfenster: schmale Leiste (Titel, Fenster, Anordnung, Uhr)
    kopf.innerHTML = `
      <span class="kl-zweit"><b>LeitWerk</b> · ${esc(fensterName(FENSTER_ID))}</span>
      <span class="kl-platz"></span>
      <div class="kl-gr ohne-linie">${fenAnker("fenster", "Fenster", IC.fenster)}${fenAnker("anordnung", "Anordnung", IC.anordnung)}</div>
      <div class="kl-gr"><time class="kl-uhr" title="Spielzeit" style="font-size:16px;width:74px">--:--:--</time></div>`;
  }

  const q = <T extends HTMLElement = HTMLElement>(s: string) => kopf.querySelector<T>(s);
  const qa = <T extends HTMLElement = HTMLElement>(s: string) => [...kopf.querySelectorAll<T>(s)];
  const fehler = (e: Error) => toast(String(e.message ?? e), "error");

  // ---------------------------------------------------------------- Zustand der Schubladen
  let offen: Lade | null = null;
  let schliesst = false;
  let zuTimer = 0;
  let nachTimer = 0;
  let wetterReiter: WetterReiter = "aktuell";
  let wetterStand = "";
  let speichernOffen = false;
  let fehlerText = "";
  let fehlerDatei = "";
  const ankerVon = (k: Lade) => q(`[data-lade="${k}"]`);
  const knopfVon = (k: Lade) => q(`[data-knopf="${k}"]`);
  const popVon = () => (offen ? q(`[data-lade="${offen}"] > .kl-hb > .kl-pop`) : null);

  // ---------------------------------------------------------------- Messen (unsichtbare Kopie)
  let stufen: string[] = [];
  const messKopie = () => {
    const c = kopf.cloneNode(true) as HTMLElement;
    c.removeAttribute("id");
    c.querySelectorAll(".kl-hb, .kl-pop, .kl-tip").forEach((x) => x.remove());
    c.querySelectorAll(".ein").forEach((x) => x.classList.remove("ein"));
    c.querySelectorAll(".reiter, .kapp").forEach((x) => x.classList.remove("reiter", "kapp"));
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    return c;
  };
  const basisKlassen = () => [...kopf.classList].filter((k) => !ALLE_STUFEN.includes(k) && k !== "kl-mess");
  const breiteBei = (c: HTMLElement, s: string[]) => {
    c.className = [...basisKlassen(), "kl-mess", ...s].join(" ");
    return c.getBoundingClientRect().width;
  };

  /** Welche Teile passen? (Entwurf: schritte und zurueck) */
  function anpassen(): void {
    if (!kopf.isConnected || !kopf.clientWidth) return;
    const B = kopf.clientWidth;
    kopf.style.setProperty("--pmax", `${Math.max(240, window.innerHeight - 70)}px`);
    kopf.style.setProperty("--wmax", `${Math.max(220, window.innerHeight - 52 - 10 - 260)}px`);
    const c = messKopie();
    try {
      // Breite der Beschriftungen (für das weiche Einklappen)
      breiteBei(c, []);
      const echte = qa("[data-lab]");
      // (Update-Knopf mit Reserve: die Prozentzahl ändert sich laufend)
      c.querySelectorAll<HTMLElement>("[data-lab]").forEach((x, i) => echte[i]?.style.setProperty("--lw", `${Math.ceil(x.getBoundingClientRect().width) + (x.dataset.lab === "upd" ? 24 : 2)}px`));

      const s: string[] = [];
      const plan = IST_HAUPT ? SCHRITTE : SCHRITTE_ZWEIT;
      const mitMehr = () => (s.some((x) => INS_MEHR.includes(x)) ? [...s, "k-mehr"] : s);
      for (const schritt of plan) {
        if (breiteBei(c, mitMehr()) <= B) break;
        s.push(...schritt);
      }
      // was ins „⋯“ gewandert ist, kommt zurück, sobald es wieder Platz hat
      for (const k of INS_MEHR) {
        if (!s.includes(k)) continue;
        const ohne = s.filter((x) => x !== k);
        const probe = ohne.some((x) => INS_MEHR.includes(x)) ? [...ohne, "k-mehr"] : ohne;
        if (breiteBei(c, probe) <= B) s.splice(s.indexOf(k), 1);
      }
      const neu = mitMehr();
      const geaendert = neu.join(" ") !== stufen.join(" ");
      stufen = neu;
      for (const k of ALLE_STUFEN) kopf.classList.toggle(k, neu.includes(k));
      if (offen === "mehr" && !neu.includes("k-mehr")) sofortZu();
      if (offen) einklappen(offen, c, B);
      if (geaendert && offen === "mehr") inhaltNeu();
    } finally {
      c.remove();
    }
    zeichnen();
  }

  /**
   * Aufgeklappter Reiter: so breit wie sein Fenster. Dafür klappen die Beschriftungen der anderen weich ein
   * (nur so viele wie Platz fehlt; Reihenfolge laut Entwurf). Reicht es nicht, wird der Reiter nur so breit wie
   * möglich und das Fenster ragt mit runder Ecke darüber hinaus.
   */
  function einklappen(k: Lade, c: HTMLElement, B: number): void {
    const anker = ankerVon(k);
    const pop = popVon();
    if (!anker || !pop) return;
    breiteBei(c, stufen);
    const cAnker = c.querySelector<HTMLElement>(`[data-lade="${k}"]`)!;
    const KB = cAnker.getBoundingClientRect().width;
    const PW = Math.min(BREITE[k], B - 16);
    let fehlt = c.getBoundingClientRect().width + PW - KB - B;
    const hat = (x: string) => stufen.includes(x);
    const kandidaten: [string, boolean][] = [
      ["ich", !hat("k-ohne-ich") && !hat("k-ohne-ichlbl")],
      ["stat", !hat("k-ohne-stat")],
      ["fen", !hat("k-fen-ik") && k !== "fenster" && k !== "anordnung"],
      ["marke", !hat("k-ohne-marke") && k !== "spiel"],
      ["wx", !hat("k-ohne-wxtxt") && k !== "wetter"],
      ["pause", !hat("k-ohne-pausetxt")],
      ["upd", kopf.classList.contains("k-update") && !hat("k-ohne-updtxt") && k !== "update"],
    ];
    const ein: string[] = [];
    for (const [lab, ok] of kandidaten) {
      if (fehlt <= 0) break;
      if (!ok) continue;
      const w = [...c.querySelectorAll<HTMLElement>(`[data-lab="${lab}"]`)].reduce((s, x) => s + x.getBoundingClientRect().width + 6, 0);
      if (!w) continue;
      ein.push(lab);
      fehlt -= w;
    }
    const pw = fehlt > 0 ? Math.max(KB, PW - fehlt) : PW;
    // Lage des Fensters: bleibt es im Bild? (in der Kopie mit eingeklappten Beschriftungen nachgemessen)
    c.querySelectorAll<HTMLElement>("[data-lab]").forEach((x) => (x.style.display = ein.includes(x.dataset.lab!) ? "none" : ""));
    cAnker.style.minWidth = `${pw}px`;
    const cr = c.getBoundingClientRect();
    const ar = cAnker.getBoundingClientRect();
    const links = anker.classList.contains("li");
    let px = 0;
    if (links) {
      const aL = ar.left - cr.left;
      if (aL + PW > B - 8) px = Math.max(8 - aL, B - 8 - (aL + PW));
    } else {
      const aR = B - (cr.right - ar.right);
      if (aR - PW < 8) px = Math.max(aR - (B - 8), aR - PW - 8);
    }
    qa("[data-lab]").forEach((x) => x.classList.toggle("ein", ein.includes(x.dataset.lab!)));
    const rpw = Math.round(pw), rPW = Math.round(PW), rpx = Math.round(px);
    anker.style.setProperty("--pw", `${rpw}px`);
    anker.style.setProperty("--px", `${rpx}px`);
    pop.style.width = `${rPW}px`;
    // Ecken oben: wo das Fenster genau unter dem Reiter liegt, eckig (geht nahtlos in den Reiter über), sonst rund
    const buendigNah = rpx === 0;
    const buendigFern = rpx === 0 && rPW - rpw <= 1;
    pop.style.setProperty(links ? "--rl" : "--rr", buendigNah ? "0" : "12px");
    pop.style.setProperty(links ? "--rr" : "--rl", buendigFern ? "0" : "12px");
    anker.classList.toggle("kapp", !buendigFern);
  }

  let geplant = 0;
  const planen = () => {
    if (geplant) return;
    geplant = requestAnimationFrame(() => {
      geplant = 0;
      anpassen();
    });
  };
  new ResizeObserver(planen).observe(kopf);
  window.addEventListener("resize", planen);
  void document.fonts?.ready.then(planen);

  // ---------------------------------------------------------------- Schubladen öffnen und schließen

  function oeffnen(k: Lade): void {
    if (offen === k && !schliesst) return schliessen();
    sofortZu();
    const anker = ankerVon(k);
    const knopf = knopfVon(k);
    if (!anker || !knopf) return;
    tipWeg();
    window.clearTimeout(nachTimer);
    offen = k;
    if (k === "anordnung") speichernOffen = false;
    if (k === "fehler" && fehlerDatei) fehlerDatei = "";
    const hb = el("div", { class: `kl-hb ${anker.classList.contains("li") ? "li" : "re"}` });
    const pop = el("div", { class: `kl-pop ${LADE_CLS[k]}`.trim(), role: "dialog" });
    pop.dataset.pop = k;
    hb.appendChild(pop);
    // erst alles aufbauen und messen (unsichtbar, ohne Bewegung) …
    pop.style.animationPlayState = "paused";
    anker.appendChild(hb);
    inhaltBauen(pop, k);
    knopf.classList.add("offen");
    knopf.setAttribute("aria-expanded", "true");
    const schonEin = new Set(qa(".kl-lab.ein"));
    const c = messKopie();
    const merkEin = new Map<HTMLElement, boolean>();
    try {
      einklappen(k, c, kopf.clientWidth);
    } finally {
      c.remove();
    }
    hoeheMerken(pop);
    // … die Beschriftungen, die einklappen sollen, erst im nächsten Bild – dann laufen Verbreitern und Ausklappen ab
    // einem fertig gezeichneten Bild los (sonst ruckelt das erste Öffnen)
    qa(".kl-lab.ein").forEach((x) => {
      if (schonEin.has(x)) return;
      merkEin.set(x, true);
      x.classList.remove("ein");
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (offen !== k || schliesst) return;
        merkEin.forEach((_, x) => x.classList.add("ein"));
        anker.classList.add("reiter");
        pop.style.animationPlayState = "";
        pop.querySelectorAll<HTMLElement>(".kl-pin, .kl-pin > *, .kl-z").forEach((x) => (x.style.animationPlayState = ""));
      }),
    );
    if (k === "fehler") setTimeout(() => pop.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true }), ohneAnimation() ? 0 : 900);
  }

  /** Zu mit Animation: erst fährt das Fenster hoch, dann wird der Reiter schmal, dann kommen die Beschriftungen zurück */
  function schliessen(): void {
    if (!offen || schliesst) return;
    const k = offen;
    const pop = popVon();
    schliesst = true;
    if (pop) hoeheMerken(pop);
    pop?.classList.add("zu");
    ankerVon(k)?.classList.add("schliesst");
    const schnell = ohneAnimation();
    zuTimer = window.setTimeout(
      () => {
        aufraeumen(k);
        nachTimer = window.setTimeout(() => qa(".kl-lab.ein").forEach((x) => x.classList.remove("ein")), schnell ? 0 : 420);
      },
      schnell ? 0 : 540,
    );
  }

  function aufraeumen(k: Lade): void {
    const anker = ankerVon(k);
    anker?.querySelector(":scope > .kl-hb")?.remove();
    anker?.classList.remove("reiter", "kapp", "schliesst");
    const knopf = knopfVon(k);
    knopf?.classList.remove("offen");
    knopf?.setAttribute("aria-expanded", "false");
    if (offen === k) offen = null;
    schliesst = false;
    if (k === "fehler" && fehlerDatei) {
      fehlerDatei = "";
      fehlerText = "";
    }
  }

  /** Sofort zu (beim Wechsel zu einer anderen Schublade – wie im Entwurf ohne Zwischenschritt) */
  function sofortZu(): void {
    window.clearTimeout(zuTimer);
    if (offen) aufraeumen(offen);
  }

  /** Inhalt neu zeichnen, ohne dass das Fenster noch einmal hereinfährt */
  function inhaltNeu(): void {
    const pop = popVon();
    if (!pop || !offen || schliesst) return;
    const roll = pop.querySelector<HTMLElement>(".kl-winh")?.scrollTop ?? 0;
    const rollPop = pop.scrollTop;
    pop.classList.add("steht");
    inhaltBauen(pop, offen);
    const w = pop.querySelector<HTMLElement>(".kl-winh");
    if (w) w.scrollTop = roll;
    pop.scrollTop = rollPop;
  }

  // außerhalb klicken oder Esc: zu
  document.addEventListener(
    "mousedown",
    (e) => {
      if (!offen || schliesst) return;
      const t = e.target as Node;
      if (ankerVon(offen)?.contains(t)) return;
      if ((t as Element).closest?.(".toast")) return;
      schliessen();
    },
    true,
  );
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || !offen || schliesst) return;
      // offene Dialoge (z. B. Rückfrage) haben Vorrang
      if (document.querySelector(".dlg-overlay:not([style*='none'])")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const k = offen;
      schliessen();
      knopfVon(k)?.focus({ preventScroll: true });
    },
    true,
  );

  // ---------------------------------------------------------------- Inhalte

  function inhaltBauen(pop: HTMLElement, k: Lade): void {
    let html = "";
    if (k === "wetter") {
      wetterStand = wetterSchluessel();
      html = wetterHtml(wetterReiter, gruppenName());
    } else if (k === "fenster") html = fensterHtml();
    else if (k === "anordnung") html = anordnungHtml();
    else if (k === "mehr") html = mehrHtml();
    else if (k === "update") html = updateHtml();
    else if (k === "fehler") html = fehlerHtml();
    // vor dem ersten Bild angehalten (siehe oeffnen)
    const halt = pop.style.animationPlayState === "paused";
    pop.innerHTML = `<div class="kl-pin">${html}</div>`;
    if (halt) pop.querySelectorAll<HTMLElement>(".kl-pin, .kl-pin > *, .kl-z").forEach((x) => (x.style.animationPlayState = "paused"));
    zeichnen();
  }

  /** Höhe des Fensters für das gegenläufige Herausfahren (Fenster und Inhalt) */
  function hoeheMerken(pop: HTMLElement): void {
    pop.style.setProperty("--hh", `${Math.ceil(pop.offsetHeight) + 2}px`);
  }

  function fensterHtml(): string {
    const defs = new Map(panelDefs().map((d) => [d.komponente, d]));
    const gruppen = FENSTER_GRUPPEN.map(([t, ks]) => [t, ks.filter((x) => defs.has(x))] as [string, string[]]);
    const bekannt = new Set(gruppen.flatMap(([, ks]) => ks));
    const rest = [...defs.keys()].filter((x) => !bekannt.has(x));
    if (rest.length) gruppen.push(["Weitere", rest]);
    let d = 0;
    let h = `<div class="kl-pkopf">Fenster öffnen oder nach vorne holen</div>`;
    for (const [t, ks] of gruppen) {
      if (!ks.length) continue;
      h += `<div class="kl-pkopf gr kl-z" style="--d:${d++}">${esc(t)}</div>`;
      for (const komp of ks) {
        const def = defs.get(komp)!;
        const wo = woOffen(komp);
        const [info, symbol] = FENSTER_KURZ[komp] ?? [def.info, IC.fenster];
        const weitere = def.mehrfach && wo ? `<button type="button" class="kl-plus" data-weitere="${komp}" title="${komp === "karte" ? "Weitere Karte, z. B. Übersicht und Detail nebeneinander" : `Weitere ${esc(def.titel)}, z. B. mit anderem Filter`}">${ic(IC.plus, "ic s", ` style="width:12px;height:12px"`)}Weitere</button>` : "";
        const woPill = wo ? `<span class="kl-wo${wo === FENSTER_ID ? " hier" : ""}">${wo === FENSTER_ID ? "hier" : esc(fensterName(wo))}</span>` : "";
        h += zeile({ haken: !!wo, symbol, name: def.titel, info, rechts: weitere + woPill, d: d++, attr: ` data-panel="${komp}"` });
      }
    }
    h += `<div class="kl-trenn"></div>`;
    if (IST_HAUPT) {
      h += zeile({ symbol: IC.neuesFenster, name: "Neues Programmfenster", info: "Für den zweiten Bildschirm – Reiter hineinziehen", d: d++, attr: ` data-aktion="neues-fenster"` });
      const andere = andereFenster();
      if (andere.length)
        h += `<div class="kl-p aus kl-z klein" style="--d:${d++};min-height:30px"><span></span><span></span><span class="kl-pt"><div class="kl-pinfo" style="margin:0">${andere.length === 1 ? "1 weiteres Programmfenster" : `${andere.length} weitere Programmfenster`} offen: ${esc(andere.map(fensterName).join(", "))}</div></span><span></span></div>`;
    } else {
      h += zeile({ symbol: IC.tuer, name: "Dieses Fenster schließen", info: "Die Fenster darin gehen zu – im Hauptfenster über „Fenster“ wieder öffnen", d: d++, attr: ` data-aktion="fenster-zu"` });
    }
    return h;
  }

  const ZULETZT = "leitwerk.anordnung.zuletzt";
  const zuletzt = () => {
    try {
      return localStorage.getItem(ZULETZT) ?? "";
    } catch {
      return "";
    }
  };
  const zuletztSetzen = (v: string) => {
    try {
      localStorage.setItem(ZULETZT, v);
    } catch {
      /* egal */
    }
  };

  function anordnungHtml(): string {
    if (!IST_HAUPT)
      return `<div class="kl-pkopf">Anordnungen</div><div class="kl-p aus kl-z"><span></span><span class="kl-pi">${ic(IC.anordnung)}</span><span class="kl-pt"><div class="kl-pinfo" style="margin:0">Vorlagen und gespeicherte Anordnungen wählst du im Hauptfenster.</div></span><span></span></div>`;
    const gew = zuletzt();
    let d = 0;
    const vl = (o: { key: string; name: string; info: string; bild: string; attr: string }) =>
      `<div class="kl-p vl kl-z${o.key === gew ? " gew" : ""}" role="button" tabindex="0" style="--d:${d++}"${o.attr}><span class="kl-hk">${o.key === gew ? ic(IC.haken) : ""}</span>${o.bild}<span class="kl-pt"><div class="kl-pn">${esc(o.name)}</div><div class="kl-pinfo">${esc(o.info)}</div></span><span></span></div>`;
    let h = `<div class="kl-pkopf">Vorlagen</div>`;
    h += VORLAGEN.map((v) => vl({ key: `v:${v.id}`, name: v.name, info: v.info, bild: bildSvg(vorlageBild(v.id)), attr: ` data-vorlage="${esc(v.id)}"` })).join("");
    h += `<div class="kl-trenn"></div><div class="kl-pkopf">Meine Anordnungen</div>`;
    const eigene = anordnungen();
    h += eigene.length
      ? eigene
          .map((a, i) =>
            vl({
              key: `a:${a.name}`,
              name: a.name,
              info: a.fenster.length ? `Mit ${a.fenster.length} weiteren Programmfenster${a.fenster.length > 1 ? "n" : ""}` : "Nur dieses Programmfenster",
              bild: bildSvg(anordnungBild(a)),
              attr: ` data-eigene="${i}"`,
            }),
          )
          .join("")
      : `<div class="kl-p aus kl-z klein" style="--d:${d++}"><span></span><span></span><span class="kl-pt"><div class="kl-pinfo" style="margin:0">Noch keine – richte die Fenster ein und speichere die Anordnung hier.</div></span><span></span></div>`;
    h += `<div class="kl-trenn"></div>`;
    if (speichernOffen) {
      h += `<div class="kl-spei"><span class="lbl">Jetzige Anordnung speichern</span><div class="kl-zeile"><input class="feld" value="${esc(`Meine Anordnung ${eigene.length + 1}`)}" aria-label="Name der Anordnung" data-spei-name><button type="button" class="kn" data-aktion="spei-zu">Abbrechen</button><button type="button" class="kn prim" data-aktion="spei-ok">Speichern</button></div><div class="kl-hinw">Merkt sich alle Fenster in allen Programmfenstern, ihre Größen und die Reiter darin.</div></div>`;
    } else {
      h += zeile({ symbol: IC.speichern, name: "Jetzige Anordnung speichern …", d: d++, cls: "klein", attr: ` data-aktion="spei-auf"` });
    }
    h += zeile({ symbol: IC.regler, name: "Anordnungen verwalten …", info: "In den Einstellungen exportieren, importieren, löschen, zurücksetzen", d: d++, cls: "klein", attr: ` data-aktion="verwalten"` });
    return h;
  }

  function annahmeKnoepfe(): string {
    return `<button type="button" class="kl-ann" data-annahme="notrufe">Notrufe<span class="kl-sch"></span></button><button type="button" class="kl-ann" data-annahme="ktHotline">KT-Hotline<span class="kl-sch"></span></button>`;
  }

  function mehrHtml(): string {
    const hat = (x: string) => stufen.includes(x);
    let h = "";
    let d = 0;
    if (hat("k-ohne-tempo"))
      h += `<div class="kl-mabs kl-z" style="--d:${d++}"><span class="kl-gl">Zeitraffer</span><div class="segs kl-tempo" role="group" aria-label="Zeitraffer" style="--n:4;--i:0">${TEMPI.map((t) => `<button type="button" class="seg" data-tempo="${t}">${t}×</button>`).join("")}</div></div>`;
    if (hat("k-ohne-neu"))
      h += `<div class="kl-mabs kl-z" style="--d:${d++}"><span class="kl-gl">Neu kommen${istGast() ? " · nur der Host" : ""}</span><div class="kl-mr">${ARTEN.map(([k, t]) => `<button type="button" class="kl-chip" data-art="${k}"><span class="kl-pkt"></span>${t}</button>`).join("")}</div></div>`;
    if (hat("k-ohne-ich"))
      h += `<div class="kl-mabs kl-z" style="--d:${d++}"><span class="kl-gl">Ich nehme an</span><div class="kl-mr"><div class="kl-ich">${annahmeKnoepfe()}</div></div><div class="kl-hinw kl-nichts" style="color:var(--rot-text)" hidden>Du nimmst gerade keine Anrufe an.</div></div>`;
    return h;
  }

  function updateHtml(): string {
    const u = updateInfo();
    const s = updateStand();
    if (!u) return `<div class="kl-uinfo">LeitWerk ist aktuell.</div>`;
    const lad = s?.phase === "laedt";
    const fertig = s?.phase === "fertig";
    const fehl = s?.phase === "fehler";
    const titel = lad ? "Update wird geladen" : fertig ? "Update ist installiert" : fehl ? "Update fehlgeschlagen" : `Update ${u.version} verfügbar`;
    const neu = (u.notes ?? "")
      .split(/\n+/)
      .map((x) => x.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    const pct = s && s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
    const info = fertig
      ? "Das Spiel ist gesichert – LeitWerk startet jetzt neu und ist danach auf der neuen Version. Über „Spiel fortsetzen“ geht es genau hier weiter."
      : lad
        ? "Du kannst weiterspielen. Sobald das Update geladen ist, wird das Spiel noch einmal gesichert und LeitWerk startet von selbst neu."
        : fehl
          ? `Das Update konnte nicht geladen werden: ${s?.fehler ?? "unbekannter Fehler"}`
          : "LeitWerk lädt die neue Version im Hintergrund, du spielst weiter. Danach wird sie installiert und LeitWerk startet von selbst neu – das Spiel wird vorher gesichert, über „Spiel fortsetzen“ geht es weiter.";
    const rolle = mp.status.rolle;
    const mpT =
      rolle === "client"
        ? "Beim Neustart wirst du aus dem Spiel getrennt. Danach mit demselben Code wieder beitreten – der Host braucht dieselbe Version."
        : `Beim Neustart werden deine Mitspieler getrennt. Danach können sie mit demselben Code wieder beitreten, sobald sie auch ${u.version} haben.`;
    let knoepfe = "";
    if (fehl) knoepfe = `<button type="button" class="kn sm" data-aktion="upd-zu">Schließen</button><button type="button" class="kn sm prim" data-aktion="upd-los">Nochmal versuchen</button>`;
    else if (lad) knoepfe = `<button type="button" class="kn sm" data-aktion="zu">Schließen</button><button type="button" class="kn sm prim aus" disabled>Lädt …</button>`;
    else if (!fertig) knoepfe = `<button type="button" class="kn sm" data-aktion="zu">Später</button><button type="button" class="kn sm prim" data-aktion="upd-los">Laden und neu starten</button>`;
    return `
      <div class="kl-wk kl-z"><span class="kl-wsym" style="color:var(--akzent-text)">${ic(IC.update, "ic")}</span><div><div class="kl-wt">${esc(titel)}</div><div class="kl-ws">Du spielst ${esc(u.current)} · neu ist ${esc(u.version)}</div></div></div>
      ${neu.length ? `<div class="kl-uneu kl-z" style="--d:1"><span class="kl-abs" style="padding:0 0 4px">Was ist neu</span>${neu.map((t) => `<div><i></i>${esc(t)}</div>`).join("")}</div>` : ""}
      ${lad ? `<div class="kl-ulad kl-z" style="--d:2"><div class="kl-ubar"><i style="--w:${pct}%"></i></div><span>${s && s.total > 0 ? `Update wird geladen · ${mb(s.done)} von ${mb(s.total)} MB · du spielst weiter` : "Verbinde …"}</span></div>` : ""}
      <div class="kl-uinfo${fehl ? " rot" : ""} kl-z" style="--d:3">${esc(info)}</div>
      ${rolle !== "aus" && !fertig ? `<div class="kl-uinfo gelb kl-z" style="--d:4">${ic(IC.warn)}<span>${esc(mpT)}</span></div>` : ""}
      ${knoepfe ? `<div class="kl-uknopf kl-z" style="--d:5">${knoepfe}</div>` : ""}`;
  }

  function fehlerHtml(): string {
    const kopfZ = `<div class="kl-wk kl-z"><span class="kl-wsym">${ic(IC.kaefer, "ic")}</span><div><div class="kl-wt">Fehler melden</div><div class="kl-ws">Speichert eine Datei für den Entwickler – verschickt wird nichts.</div></div></div>`;
    if (fehlerDatei)
      return `${kopfZ}<div class="kl-fok kl-z" style="--d:1">${ic(IC.haken, "ic")}<div><b>Fehlerbericht gespeichert</b><code>${esc(fehlerDatei)}</code><span>Schick die Datei an den Entwickler. Danke!</span></div></div>
        <div class="kl-uknopf kl-z" style="--d:2"><button type="button" class="kn sm" data-aktion="fehler-nochmal">Noch einen melden</button><button type="button" class="kn sm prim" data-aktion="zu">Fertig</button></div>`;
    const IN: [string, string][] = [
      ["Programm", `Version, Fenstergröße, Spielmodus${mp.aktiv ? ", Mitspieler" : ""}`],
      ["Letzte Meldungen und Fehler", "die letzten Einträge aus dem Protokoll"],
      ["Spielzustand", "Uhrzeit, Einsätze, Fahrzeuge, offene Funkgespräche"],
      ["Letzte 5 Einsätze und der letzte Funk", "gekürzt"],
      ["Einstellungen", "Leitstelle und eigene – ohne KI-Schlüssel"],
    ];
    return `${kopfZ}
      <label class="kl-flab kl-z" style="--d:1">Was ist passiert?<textarea class="feld kl-fta" data-fehler-text placeholder="Was hast du gemacht, und was war falsch? z. B. „RTW fährt nach Status 4 nicht ins Krankenhaus“" aria-label="Was ist passiert?">${esc(fehlerText)}</textarea></label>
      <div class="kl-fin kl-z" style="--d:2"><span class="kl-abs" style="padding:0 0 4px">Kommt in die Datei</span>${IN.map(([t, z]) => `<div>${ic(IC.haken)}<span>${esc(t)}<small>${esc(z)}</small></span></div>`).join("")}</div>
      <div class="kl-uknopf kl-z" style="--d:3"><button type="button" class="kn sm" data-aktion="zu">Abbrechen</button><button type="button" class="kn sm prim" data-aktion="fehler-speichern">Datei speichern …</button></div>`;
  }

  // ---------------------------------------------------------------- Bedienen (ein Hörer für alles)

  const zuNach = (fn: () => void) => () => {
    schliessen();
    fn();
  };

  const updateLos = () => {
    void updateImHintergrund(
      () => jetztSichern(),
      () => jetztSichern(),
    );
  };

  const fehlerSpeichern = async () => {
    try {
      const pfad = await fehlerBerichtSpeichern(fehlerText);
      if (!pfad) return;
      fehlerDatei = pfad.split(/[\\/]/).pop() ?? pfad;
      inhaltNeu();
    } catch (err) {
      toast(String((err as Error).message ?? err), "error");
    }
  };

  const aktionen: Record<string, () => void> = {
    zu: () => schliessen(),
    "neues-fenster": zuNach(() => void inEigenesFenster([woOffen("karte") ? "karte-2" : "karte"]).catch(() => undefined)),
    "fenster-zu": zuNach(() => void fensterSchliessen()),
    "spei-auf": () => {
      speichernOffen = true;
      inhaltNeu();
      const f = popVon()?.querySelector<HTMLInputElement>("[data-spei-name]");
      f?.focus();
      f?.select();
    },
    "spei-zu": () => {
      speichernOffen = false;
      inhaltNeu();
    },
    "spei-ok": () => {
      const n = popVon()?.querySelector<HTMLInputElement>("[data-spei-name]")?.value.trim();
      if (!n) return;
      schliessen();
      void anordnungSpeichern(n).then(() => {
        zuletztSetzen(`a:${n}`);
        toast(`Anordnung „${n}“ gespeichert`);
      }, fehler);
    },
    verwalten: zuNach(() => spielmenueEinstellungen("anordnungen")),
    "upd-los": updateLos,
    "upd-zu": () => {
      updateStandZuruecksetzen();
      schliessen();
    },
    "fehler-speichern": () => void fehlerSpeichern(),
    "fehler-nochmal": () => {
      fehlerDatei = "";
      fehlerText = "";
      inhaltNeu();
      popVon()?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    },
  };

  const tempoSetzen = (t: number) => void sim.call("setTempo", t).catch(fehler);
  const pauseKlick = () => {
    if (sim.state.laeuft) return void sim.call("pause").catch(fehler);
    if (ensureCodes(() => void sim.call("start").catch(fehler))) void sim.call("start").catch(fehler);
  };
  const artKlick = (k: string, label: string) => {
    if (istGast()) return toast("Nur der Host kann ändern, welche Einsätze neu kommen");
    const key = `${k}Aktiv` as ArtKey;
    const st = structuredClone(store.settings);
    st[key] = st[key] === false;
    store.setSettings(st);
    toast(`${label}: ${st[key] !== false ? "kommen wieder neu herein" : "kommen keine mehr"}`);
    zeichnen();
  };

  function klick(t: HTMLElement, e: Event): void {
    const b = t.closest<HTMLElement>("[data-knopf],[data-tempo],[data-art],[data-annahme],[data-wreiter],[data-weitere],[data-panel],[data-vorlage],[data-eigene],[data-aktion]");
    if (!b || !kopf.contains(b)) return;
    if (b.dataset.weitere) {
      e.stopPropagation();
      const k = b.dataset.weitere;
      schliessen();
      panelOeffnen(k);
      return;
    }
    if (b.dataset.tempo) return tempoSetzen(Number(b.dataset.tempo));
    if (b.dataset.art) {
      const a = ARTEN.find(([k]) => k === b.dataset.art);
      if (a) artKlick(a[0], a[2]);
      return;
    }
    if (b.dataset.annahme) {
      const k = b.dataset.annahme as "notrufe" | "ktHotline";
      setzePers({ [k]: !pers()[k] });
      return;
    }
    if (b.dataset.wreiter) {
      wetterReiter = b.dataset.wreiter as WetterReiter;
      // Inhalt tauschen, die Zeilen gleiten neu herein (das Fenster selbst bleibt stehen)
      const pop = popVon();
      if (pop) {
        const roll = pop.scrollTop;
        pop.classList.add("steht");
        inhaltBauen(pop, "wetter");
        pop.classList.remove("steht");
        pop.classList.add("neu-gezeichnet");
        pop.scrollTop = roll;
      }
      return;
    }
    if (b.dataset.panel) {
      const k = b.dataset.panel;
      schliessen();
      panelZeigen(k);
      return;
    }
    if (b.dataset.vorlage) {
      const v = VORLAGEN.find((x) => x.id === b.dataset.vorlage);
      if (!v) return;
      schliessen();
      zuletztSetzen(`v:${v.id}`);
      void vorlageAnwenden(v).then(() => toast(`Anordnung „${v.name}“ übernommen`), fehler);
      return;
    }
    if (b.dataset.eigene) {
      const a = anordnungen()[Number(b.dataset.eigene)];
      if (!a) return;
      schliessen();
      zuletztSetzen(`a:${a.name}`);
      void anordnungAnwenden(a).then(() => toast(`Anordnung „${a.name}“ übernommen`), fehler);
      return;
    }
    if (b.dataset.aktion) return aktionen[b.dataset.aktion]?.();
    switch (b.dataset.knopf as Lade | "pause" | "status") {
      case "pause":
        return pauseKlick();
      case "status":
        return spielmenueOeffnen("multiplayer");
      case "spiel":
        // Logo: Spielmenü (wie Esc)
        schliessen();
        return spielmenueOeffnen();
      default:
        oeffnen(b.dataset.knopf as Lade);
    }
  }
  kopf.addEventListener("click", (e) => klick(e.target as HTMLElement, e));
  kopf.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-spei-name]")) {
      if (e.key === "Enter") aktionen["spei-ok"]();
      return;
    }
    // Zeilen (role=button) mit Enter und Leertaste
    if ((e.key === "Enter" || e.key === " ") && t.matches(".kl-p[role=button]")) {
      e.preventDefault();
      klick(t, e);
    }
  });
  kopf.addEventListener("input", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-fehler-text]")) fehlerText = (t as HTMLTextAreaElement).value;
  });

  // ---------------------------------------------------------------- Hinweise beim Darüberfahren (Neu, Ich nehme an)
  let tip: HTMLElement | null = null;
  function tipWeg(): void {
    tip?.remove();
    tip = null;
  }
  qa("[data-tip]").forEach((g) => {
    g.addEventListener("mouseenter", () => {
      if (offen) return;
      tipWeg();
      const nichts = !pers().notrufe && !pers().ktHotline;
      const an = ARTEN.filter(([k]) => artAn(k));
      const [titel, text] =
        g.dataset.tip === "neu"
          ? ["Welche Einsätze neu hereinkommen", istGast() ? `Das stellt nur der Host ein. Gerade kommen: ${an.map(([, t]) => t).join(", ") || "keine"}.` : `Gilt für das ganze Spiel. Gerade an: ${an.length} von 4.`]
          : nichts
            ? ["Du nimmst gerade keine Anrufe an", "Bei dir klingelt nichts – Anrufe gehen an die anderen Disponenten oder warten."]
            : ["Ich nehme an", "Welche Anrufe bei dir klingeln und sich von selbst öffnen. Gilt nur für dich."];
      tip = el("div", { class: `kl-tip${g.dataset.tip === "ich" ? " re" : ""}`, role: "tooltip" });
      tip.innerHTML = `<b>${esc(titel)}</b>${esc(text)}`;
      g.appendChild(tip);
    });
    g.addEventListener("mouseleave", tipWeg);
  });

  // ---------------------------------------------------------------- Zeichnen (laufend)
  const fmt = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  let wetterSchl = "";
  let breitenSchl = "";
  const setzeText = (e: HTMLElement | null, t: string) => {
    if (e && e.textContent !== t) e.textContent = t;
  };

  function zeichnen(): void {
    const st = sim.state;
    setzeText(q(".kl-uhr"), fmt.format(new Date(st.zeit)));
    q(".kl-uhr")?.classList.toggle("steht", !st.laeuft);
    let breite = "";
    if (IST_HAUPT) {
      // Pause / Weiter
      const p = q("[data-knopf=pause]")!;
      p.classList.toggle("prim", !st.laeuft);
      p.title = st.laeuft ? "Spiel anhalten" : "Weiterspielen";
      const pfad = p.querySelector("path")!;
      const soll = st.laeuft ? IC.pause : IC.play;
      if (pfad.getAttribute("d") !== soll) pfad.setAttribute("d", soll);
      setzeText(q(".kl-pause-lab"), st.laeuft ? "Pause" : "Weiter");

      // Zeitraffer (auch im ⋯); Spieler-NAH mit Flugsimulator in der Luft: läuft nur 1×
      const i = Math.max(0, TEMPI.indexOf(st.tempo));
      const bremse = st.tempo > 1 ? sim.zeitBremse() : null;
      qa(".kl-tempo").forEach((g) => {
        g.style.setProperty("--i", String(i));
        g.classList.toggle("gebremst", !!bremse);
        g.title = bremse ? `Zeitraffer gerade 1× – ${bremse}` : "Zeitraffer";
      });
      qa("[data-tempo]").forEach((b) => b.classList.toggle("on", Number(b.dataset.tempo) === st.tempo));
      const mini = q(".kl-tempo-mini")!;
      mini.classList.toggle("da", st.tempo > 1);
      setzeText(mini, `${st.tempo}×`);

      // Wetter (nur neu rechnen, wenn sich Minute oder Lage geändert haben)
      const ws = `${Math.floor(st.zeit / 60_000)}|${st.wetter.lage}|${st.wetter.wind}|${sim.settings.wetterAktiv}`;
      if (ws !== wetterSchl) {
        wetterSchl = ws;
        const w = wetterKurz();
        const wb = q("[data-knopf=wetter]")!;
        wb.title = w.titel;
        const sym = q(".kl-wsymbol")!;
        if (sym.dataset.s !== w.symbol) {
          sym.dataset.s = w.symbol;
          sym.innerHTML = ic(w.symbol);
          sym.style.display = "contents";
        }
        const pkt = q(".kl-wpkt")!;
        pkt.hidden = !w.punkt;
        pkt.style.background = w.punkt;
        setzeText(q(".kl-wx-lab"), w.kurz);
        setzeText(q(".kl-wgrad"), w.grad);
        if (offen === "wetter" && wetterSchluessel() !== wetterStand) inhaltNeu();
      }
      breite += q(".kl-wx-lab")!.textContent + (q(".kl-wgrad")!.textContent ?? "") + (st.laeuft ? "P" : "W");

      // Neu: RD/KT/SEK/ACN – gilt fürs ganze Spiel; Gast sieht Schloss und ausgegraute Kästen
      const gast = istGast();
      q(".kl-schloss")!.hidden = !gast;
      qa("[data-art]").forEach((b) => {
        const a = ARTEN.find(([k]) => k === b.dataset.art)!;
        const an = artAn(a[0]);
        b.classList.toggle("an", an);
        b.classList.toggle("zu", gast);
        b.setAttribute("aria-pressed", String(an));
        b.title = gast ? "Nur der Host kann das ändern" : `${a[2]}: ${an ? "kommen neu herein" : "kommen nicht"}`;
      });

      // Ich nehme an – gilt nur für mich; beide aus: rot umrandet
      const pr = pers();
      const nichts = !pr.notrufe && !pr.ktHotline;
      qa("[data-annahme]").forEach((b) => {
        const k = b.dataset.annahme as "notrufe" | "ktHotline";
        b.classList.toggle("an", pr[k]);
        b.setAttribute("aria-pressed", String(pr[k]));
        b.title = `${k === "notrufe" ? "Notrufe" : "KT-Hotline"}: ${pr[k] ? "ich nehme an (klingelt, Telefon geht auf)" : "nehme ich nicht an"}`;
      });
      qa(".kl-ich").forEach((x) => x.classList.toggle("aus", nichts));
      qa(".kl-nichts").forEach((x) => (x.hidden = !nichts));
      q(".kl-mpkt")!.hidden = !(nichts && stufen.includes("k-ohne-ich"));
      breite += (gast ? "G" : "") + (nichts ? "N" : "");

      // Status: Solo · RD-NOE-03 bzw. „3 Spieler · Host/Gast“
      const s = mp.status;
      const stat = q("[data-knopf=status]")!;
      const online = mp.spieler.filter((x) => x.online);
      const statT = s.rolle === "aus" ? `Solo · ${gruppenName()}` : `${Math.max(1, online.length)} Spieler · ${s.rolle === "host" ? "Host" : "Gast"}`;
      setzeText(q(".kl-stat-lab"), statT);
      stat.classList.toggle("warn", s.rolle !== "aus" && (!s.verbunden || (s.rolle === "client" && !s.hostDa)));
      stat.title =
        s.rolle === "aus"
          ? `Allein spielen, Funkgruppe ${gruppenName()} – Spielstand und Multiplayer`
          : `Mehrspieler (Code ${s.code}): ${mp.spieler.map((x) => `${x.name}${x.host ? " (Host)" : ""}${x.online ? "" : " – getrennt"}`).join(", ")} – Spielstand und Multiplayer`;
      breite += statT;

      // Update (nur wenn eines da ist)
      const u = updateInfo();
      const us = updateStand();
      kopf.classList.toggle("k-update", !!u);
      if (u) {
        const ub = q("[data-knopf=update]")!;
        const pct = us && us.total > 0 ? Math.min(100, Math.round((us.done / us.total) * 100)) : 0;
        const t = us?.phase === "laedt" ? `Lädt … ${pct} %` : us?.phase === "fertig" ? "Startet neu …" : us?.phase === "fehler" ? "Update fehlgeschlagen" : `Update ${u.version}`;
        setzeText(q(".kl-upd-lab"), t);
        ub.classList.toggle("laedt", us?.phase === "laedt");
        ub.style.setProperty("--w", `${pct}%`);
        ub.title = us?.phase === "laedt" ? `Update ${u.version} wird geladen – du spielst weiter` : `Neue LeitWerk-Version ${u.version}`;
        breite += t.replace(/\d+ %/, "00 %");
      }
    }
    if (breite !== breitenSchl) {
      breitenSchl = breite;
      planen();
    }
  }

  sim.onChange(zeichnen);
  store.onChange(zeichnen);
  mp.onChange(zeichnen);
  onPers(zeichnen);
  onUpdate(() => {
    zeichnen();
    if (offen === "update") inhaltNeu();
    if (!updateInfo() && offen === "update") schliessen();
  });
  onPanelsGeaendert(() => {
    if (offen === "fenster" || offen === "anordnung") inhaltNeu();
  });
  zeichnen();
  planen();
}
