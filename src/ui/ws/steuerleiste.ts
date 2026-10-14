/**
 * Steuerleiste oben: Uhr, Start/Pause, Tempo, Wetter, Anrufannahme, Fenster- und Anordnungs-Menü,
 * Daten und Einstellungen (als großes Pop-up), Spiel/Multiplayer.
 */
import { store } from "../../data/store";
import { mp } from "../../net/mehrspieler";
import { sim } from "../../sim/engine";
import { flugverbot, JAHRESZEIT_LABEL, jahreszeitVon, WETTER_LABEL, WETTER_SYMBOL } from "../../sim/weather";
import { ensureCodes } from "../codesPrompt";
import { createDataView } from "../dataView";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import { createSettingsView } from "../settingsView";
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
import { karteWaehlen, karteZeigen } from "./auswahl";
import { fensterSchliessen } from "./nebenfenster";
import { onPers, pers, setzePers } from "./persoenlich";
import { persoenlichView } from "./persoenlichView";

// ---------------------------------------------------------------- Menüs

let offenesMenu: { el: HTMLElement; knopf: HTMLElement } | null = null;

function menuSchliessen(): void {
  if (!offenesMenu) return;
  offenesMenu.knopf.classList.remove("offen");
  const m = offenesMenu.el;
  m.classList.add("zu");
  setTimeout(() => m.remove(), 120);
  offenesMenu = null;
}

/** Wetterprognose für die nächsten Spielstunden */
function wetterMenu(m: HTMLElement): void {
  m.classList.add("wetter-menu");
  const opt = sim.wetterOpt();
  const p = sim.wetterPrognose(8);
  const uhr = (t: number) => new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const jz = JAHRESZEIT_LABEL[jahreszeitVon(sim.state.zeit, opt)];
  const modus = { realistisch: "realistisch", wechselhaft: "wechselhaft", fest: "immer gleich" }[opt.modus];
  const temps = p.map((x) => x.temp);
  const zeilen = p
    .map(
      (x, i) =>
        `<tr class="${i === 0 ? "jetzt" : ""}${flugverbot(x.lage) ? " bad" : ""}"><td>${i === 0 ? "jetzt" : uhr(x.zeit)}</td><td class="w-sym">${WETTER_SYMBOL[x.lage]}</td><td>${WETTER_LABEL[x.lage]}</td><td class="w-temp">${Math.round(x.temp)}°</td><td class="muted">${flugverbot(x.lage) ? "kein Flug" : ""}</td></tr>`,
    )
    .join("");
  m.innerHTML = `<div class="lw-menu-titel">Wetterprognose</div>
    <table class="wetter-tab">${zeilen}</table>
    <div class="muted small wetter-fuss">${jz} · ${modus} · ${Math.round(Math.min(...temps))}° bis ${Math.round(Math.max(...temps))}°${
      sim.settings.wetterAktiv ? "" : " · Wetter ist ausgeschaltet"
    }</div>`;
}

function menu(knopf: HTMLElement, bauen: (m: HTMLElement) => void): void {
  if (offenesMenu?.knopf === knopf) return menuSchliessen();
  menuSchliessen();
  const m = el("div", { class: "lw-menu" });
  bauen(m);
  document.body.appendChild(m);
  const r = knopf.getBoundingClientRect();
  const breite = m.offsetWidth;
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - breite - 8, r.left))}px`;
  m.style.top = `${r.bottom + 6}px`;
  knopf.classList.add("offen");
  offenesMenu = { el: m, knopf };
}

document.addEventListener("mousedown", (e) => {
  if (offenesMenu && !offenesMenu.el.contains(e.target as Node) && !offenesMenu.knopf.contains(e.target as Node)) menuSchliessen();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && offenesMenu) {
    e.stopPropagation();
    menuSchliessen();
  }
});

function punkt(m: HTMLElement, label: string, info: string, fn: () => void, opts: { haken?: boolean; rechts?: string; deaktiv?: boolean } = {}): void {
  const b = el("button", { class: `lw-menu-punkt${opts.haken ? " an" : ""}`, type: "button" });
  b.innerHTML = `<span class="haken">${opts.haken ? "✓" : ""}</span><span class="txt"><span>${esc(label)}</span>${info ? `<span class="info">${esc(info)}</span>` : ""}</span>${opts.rechts ? `<span class="rechts">${esc(opts.rechts)}</span>` : ""}`;
  b.disabled = !!opts.deaktiv;
  b.addEventListener("click", () => {
    menuSchliessen();
    fn();
  });
  m.appendChild(b);
}

function titel(m: HTMLElement, t: string): void {
  m.appendChild(el("div", { class: "lw-menu-titel" }, t));
}

function fensterName(id: string): string {
  return id === "haupt" ? "Hauptfenster" : `Fenster ${id.replace("fenster-", "")}`;
}

function fensterMenu(m: HTMLElement): void {
  titel(m, "Fenster öffnen oder nach vorne holen");
  for (const d of panelDefs()) {
    const wo = woOffen(d.komponente);
    const woText = wo && wo !== FENSTER_ID ? fensterName(wo) : "";
    punkt(m, d.titel, d.info, () => panelZeigen(d.komponente), { haken: !!wo, rechts: woText });
    if (d.mehrfach && wo) {
      punkt(m, `Weitere: ${d.titel}`, d.komponente === "karte" ? "z. B. Übersicht und Detail nebeneinander" : "z. B. mit anderem Filter", () => panelOeffnen(d.komponente));
    }
  }
  m.appendChild(el("div", { class: "lw-menu-trenner" }));
  if (IST_HAUPT) {
    punkt(m, "Neues Programmfenster", "Für den zweiten Bildschirm – Reiter einfach hineinziehen oder über ⧉ verschieben", () => void inEigenesFenster([woOffen("karte") ? "karte-2" : "karte"]).catch(() => undefined));
    const andere = andereFenster();
    if (andere.length) punkt(m, `${andere.length} weitere${andere.length > 1 ? "" : "s"} Fenster offen`, andere.map(fensterName).join(", "), () => undefined, { deaktiv: true });
  } else {
    punkt(m, "Dieses Fenster schließen", "Die Fenster darin gehen zu – über das Menü im Hauptfenster wieder öffnen", () => void fensterSchliessen());
  }
}

function anordnungMenu(m: HTMLElement): void {
  if (!IST_HAUPT) {
    titel(m, "Anordnungen");
    m.appendChild(el("div", { class: "lw-menu-hinweis" }, "Vorlagen und gespeicherte Anordnungen wählst du im Hauptfenster."));
    return;
  }
  titel(m, "Vorlagen");
  for (const v of VORLAGEN) punkt(m, v.name, v.info, () => void vorlageAnwenden(v));
  const eigene = anordnungen();
  if (eigene.length) {
    titel(m, "Meine Anordnungen");
    for (const a of eigene) punkt(m, a.name, a.fenster.length ? `mit ${a.fenster.length} weiteren Fenster${a.fenster.length > 1 ? "n" : ""}` : "", () => void anordnungAnwenden(a));
  }
  m.appendChild(el("div", { class: "lw-menu-trenner" }));
  punkt(m, "Jetzige Anordnung speichern …", "Unter einem Namen, inklusive weiterer Fenster", () => speichernDialog());
  punkt(m, "Anordnungen verwalten …", "Exportieren, importieren, löschen, zurücksetzen", () => einstellungenOeffnen("persoenlich"));
}

function speichernDialog(): void {
  const body = el("div");
  const input = el("input", { type: "text", placeholder: "z. B. Nachtdienst, Zwei Monitore zu Hause" });
  body.append(el("p", { class: "muted" }, "Die Anordnung aller Fenster wird unter diesem Namen gespeichert."), input);
  openDialog({
    title: "Anordnung speichern",
    body,
    actions: [
      { label: "Abbrechen" },
      {
        label: "Speichern",
        kind: "primary",
        onClick: async () => {
          const n = input.value.trim();
          if (!n) return false;
          await anordnungSpeichern(n);
          toast(`Anordnung „${n}“ gespeichert`);
        },
      },
    ],
  });
}

// ---------------------------------------------------------------- große Pop-ups (Daten, Einstellungen)

interface Gross {
  overlay: HTMLElement;
  zeigen(tab?: string): void;
  verstecken(): void;
}

function grossesFenster(titelText: string, tabs: { id: string; label: string; bauen(c: HTMLElement): { refresh(): void } }[]): Gross {
  const overlay = el("div", { class: "gross-overlay", hidden: "" });
  const box = el("div", { class: "gross", role: "dialog", "aria-modal": "true" });
  const kopf = el("div", { class: "gross-kopf" });
  kopf.appendChild(el("div", { class: "gross-titel" }, titelText));
  const reiter = el("div", { class: "gross-tabs" });
  kopf.appendChild(reiter);
  const zu = el("button", { class: "gross-zu", type: "button", title: "Schließen (Esc)" }, "×");
  kopf.appendChild(zu);
  const inhalt = el("div", { class: "gross-inhalt" });
  box.append(kopf, inhalt);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  const gebaut = new Map<string, { c: HTMLElement; v: { refresh(): void } }>();
  let aktiv = tabs[0].id;
  const zeigeTab = (id: string) => {
    aktiv = id;
    reiter.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    for (const [tid, x] of gebaut) x.c.hidden = tid !== id;
    let g = gebaut.get(id);
    if (!g) {
      const c = el("div", { class: "gross-seite" });
      inhalt.appendChild(c);
      const t = tabs.find((x) => x.id === id)!;
      g = { c, v: t.bauen(c) };
      gebaut.set(id, g);
    } else g.v.refresh();
  };
  if (tabs.length > 1) {
    for (const t of tabs) {
      const b = el("button", { type: "button" }, t.label);
      b.dataset.tab = t.id;
      b.addEventListener("click", () => zeigeTab(t.id));
      reiter.appendChild(b);
    }
  }
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
    zeigen: (tab) => {
      overlay.hidden = false;
      zeigeTab(tab ?? aktiv);
    },
    verstecken,
  };
}

let daten: Gross | null = null;
let einstellungen: Gross | null = null;

/** Ort auf der Karte wählen, während Daten/Einstellungen offen sind (Pop-up kurz ausblenden) */
async function waehlenAusPopup(hinweis: string) {
  const offen = [daten, einstellungen].filter((g) => g && !g.overlay.hidden) as Gross[];
  for (const g of offen) g.overlay.hidden = true;
  const r = await karteWaehlen(hinweis);
  for (const g of offen) g.overlay.hidden = false;
  return r;
}

export function datenOeffnen(): void {
  daten ??= grossesFenster("Daten", [
    {
      id: "daten",
      label: "Daten",
      bauen: (c) =>
        createDataView(c, {
          pickOnMap: waehlenAusPopup,
          showOnMap: (lat, lon) => {
            daten?.verstecken();
            karteZeigen(lat, lon, 14);
          },
        }),
    },
  ]);
  daten.zeigen();
}

export function einstellungenOeffnen(tab?: "persoenlich" | "simulation" | "programm"): void {
  einstellungen ??= grossesFenster("Einstellungen", [
    { id: "persoenlich", label: "Persönlich", bauen: (c) => persoenlichView(c) },
    { id: "simulation", label: "Leitstelle & Simulation", bauen: (c) => createSettingsView(c, "simulation") },
    { id: "programm", label: "Programm & Karten", bauen: (c) => createSettingsView(c, "programm") },
  ]);
  einstellungen.zeigen(tab);
}

// ---------------------------------------------------------------- Leiste

export function steuerleisteBauen(kopf: HTMLElement): void {
  setzeEditorDeps({ pickOnMap: waehlenAusPopup });
  kopf.innerHTML = `
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">LeitWerk</span>${IST_HAUPT ? "" : `<span class="brand-sub">${esc(fensterName(FENSTER_ID))}</span>`}</div>
    <div class="sl-gruppe sl-sim">
      <button id="sim-play" class="btn small" type="button">▶ Start</button>
      <div class="tempo seg" role="group" aria-label="Zeitraffer">
        <button type="button" data-tempo="1">1×</button><button type="button" data-tempo="2">2×</button><button type="button" data-tempo="5">5×</button><button type="button" data-tempo="10">10×</button>
      </div>
      <time id="clock" class="clock" title="Simulationszeit">--:--:--</time>
      <button id="weather" class="weather" type="button" title="Wetter – klicken für die Prognose">–</button>
    </div>
    <div class="sl-gruppe sl-annahme" title="Welche Anrufe nimmst du an? (Klingeln und automatisches Öffnen)">
      <button type="button" class="sl-toggle" data-annahme="notrufe">📞 Notrufe</button>
      <button type="button" class="sl-toggle" data-annahme="ktHotline">🚑 KT-Hotline</button>
    </div>
    <span class="spacer"></span>
    <div class="sl-gruppe">
      <button type="button" class="btn small sl-menu-knopf" data-menu="fenster">Fenster ▾</button>
      <button type="button" class="btn small sl-menu-knopf" data-menu="anordnung">Anordnung ▾</button>
    </div>
    <div class="sl-gruppe">
      <button type="button" class="btn small" data-act="daten">Daten</button>
      <button type="button" class="btn small" data-act="einstellungen">Einstellungen</button>
      <button id="btn-spiel" class="btn small" type="button" title="Spielstand und Multiplayer">Spiel</button>
    </div>`;

  // Uhr, Start/Pause, Tempo, Wetter
  const clock = kopf.querySelector<HTMLElement>("#clock")!;
  const play = kopf.querySelector<HTMLButtonElement>("#sim-play")!;
  const weather = kopf.querySelector<HTMLElement>("#weather")!;
  const fmt = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tempoBtns = kopf.querySelectorAll<HTMLButtonElement>("[data-tempo]");
  const render = () => {
    clock.textContent = fmt.format(new Date(sim.state.zeit));
    play.textContent = sim.state.laeuft ? "❚❚ Pause" : "▶ Start";
    play.classList.toggle("primary", !sim.state.laeuft);
    tempoBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.tempo) === sim.state.tempo));
    const w = sim.state.wetter.lage;
    const txt = `${WETTER_SYMBOL[w]} ${WETTER_LABEL[w]} ${Math.round(sim.temperatur())}°`;
    if (weather.textContent !== txt) weather.textContent = txt;
    weather.classList.toggle("bad", flugverbot(w));
    weather.title = `${flugverbot(w) ? "Kein Flugbetrieb für NAH" : "Flugbetrieb möglich"} – klicken für die Prognose`;
  };
  weather.addEventListener("click", () => menu(weather, wetterMenu));
  const fehler = (e: Error) => toast(String(e.message ?? e), "error");
  play.addEventListener("click", () => {
    if (sim.state.laeuft) return void sim.call("pause").catch(fehler);
    if (ensureCodes(() => void sim.call("start").catch(fehler))) void sim.call("start").catch(fehler);
  });
  tempoBtns.forEach((b) => b.addEventListener("click", () => void sim.call("setTempo", Number(b.dataset.tempo)).catch(fehler)));
  sim.onChange(render);
  render();

  // Anrufannahme
  const annahme = kopf.querySelectorAll<HTMLButtonElement>("[data-annahme]");
  const annahmeZeigen = () =>
    annahme.forEach((b) => {
      const an = pers()[b.dataset.annahme as "notrufe" | "ktHotline"];
      b.classList.toggle("an", an);
      b.setAttribute("aria-pressed", String(an));
      b.title = `${b.dataset.annahme === "notrufe" ? "Notrufe" : "KT-Hotline"}: ${an ? "ich nehme an (klingelt, Telefon geht auf)" : "nehme ich nicht an"}`;
    });
  annahme.forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.annahme as "notrufe" | "ktHotline";
      setzePers({ [k]: !pers()[k] });
    }),
  );
  onPers(annahmeZeigen);
  annahmeZeigen();

  // Menüs
  kopf.querySelectorAll<HTMLButtonElement>("[data-menu]").forEach((b) =>
    b.addEventListener("click", () => menu(b, b.dataset.menu === "fenster" ? fensterMenu : anordnungMenu)),
  );
  onPanelsGeaendert(() => {
    if (offenesMenu?.knopf.dataset.menu === "fenster") {
      const k = offenesMenu.knopf;
      menuSchliessen();
      menu(k, fensterMenu);
    }
  });
  kopf.querySelector("[data-act=daten]")!.addEventListener("click", () => datenOeffnen());
  kopf.querySelector("[data-act=einstellungen]")!.addEventListener("click", () => einstellungenOeffnen());

  // Hinweise im Spiel (z. B. Rechte) aktuell halten
  mp.onChange(render);
  store.onChange(render);
}
