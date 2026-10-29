/**
 * Steuerleiste oben: Uhr, Start/Pause, Tempo, Wetter, Anrufannahme, Fenster- und Anordnungs-Menü,
 * Daten und Einstellungen (als großes Pop-up), Spiel/Multiplayer.
 */
import { einstellungenFenster, type EinstellungenFenster } from "./einstellungen";
import { store } from "../../data/store";
import { mp } from "../../net/mehrspieler";
import { sim } from "../../sim/engine";
import { fallEditorOeffnen } from "../fallEditor";
import { fehlerMelden } from "../fehlerMelden";
import { symbolFuer, WETTER_LABEL } from "../../sim/weather";
import { wetterOeffnen } from "../wetterView";
import { ensureCodes } from "../codesPrompt";
import { openDialog } from "../dialog";
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
import { karteWaehlen, karteZeigen } from "./auswahl";
import { fensterSchliessen } from "./nebenfenster";
import { onPers, pers, setzePers } from "./persoenlich";
import { logoMarke, logoSchrift } from "../logo";
import { startseiteZeigen } from "../startseite";
import { confirmDialog } from "../dialog";
import { jetztSichern } from "../../net/spielstand";
import { onUpdate, updateInfo, updateInstallieren, updateLaeuft } from "../updateDienst";

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
  punkt(m, "Anordnungen verwalten …", "Exportieren, importieren, löschen, zurücksetzen", () => einstellungenOeffnen("bedienung"));
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

// ---------------------------------------------------------------- Einstellungen (ein Fenster für alles)

let fenster: EinstellungenFenster | null = null;

/** Ort auf der Karte wählen, während die Einstellungen offen sind (Pop-up kurz ausblenden) */
async function waehlenAusPopup(hinweis: string): Promise<{ lat: number; lon: number } | null> {
  const offen = fenster && !fenster.overlay.hidden ? fenster : null;
  if (offen) offen.overlay.hidden = true;
  const r = await karteWaehlen(hinweis);
  if (offen) offen.overlay.hidden = false;
  return r;
}

function fensterHolen(): EinstellungenFenster {
  fenster ??= einstellungenFenster({
    pickOnMap: waehlenAusPopup,
    showOnMap: (lat, lon) => {
      fenster?.verstecken();
      karteZeigen(lat, lon, 14);
    },
  });
  return fenster;
}

/** Einstellungen bei den Daten öffnen (Fahrzeuge, Dienststellen …); seite z. B. „codes“ */
export function datenOeffnen(seite = "fahrzeuge"): void {
  fensterHolen().zeigen(seite);
}

/** Einstellungen öffnen – optional gleich auf einer Seite (z. B. „telefon“, „fahrzeuge“; alte Reiternamen gehen auch) */
export function einstellungenOeffnen(seite?: string): void {
  fensterHolen().zeigen(seite);
}

// ---------------------------------------------------------------- Leiste

export function steuerleisteBauen(kopf: HTMLElement): void {
  setzeEditorDeps({ pickOnMap: waehlenAusPopup });
  kopf.innerHTML = `
    <div class="brand"${IST_HAUPT ? ` role="button" tabindex="0" title="Zur Startseite"` : ""}>${logoMarke(22)}<span class="brand-name">${logoSchrift()}</span>${IST_HAUPT ? "" : `<span class="brand-sub">${esc(fensterName(FENSTER_ID))}</span>`}</div>
${IST_HAUPT ? `<button type="button" class="sl-update" hidden title="Neue LeitWerk-Version verfügbar">⬇ Update</button>` : ""}
    <div class="sl-gruppe sl-sim">
      <button id="sim-play" class="btn small" type="button">▶ Start</button>
      <div class="tempo seg" role="group" aria-label="Zeitraffer">
        <button type="button" data-tempo="1">1×</button><button type="button" data-tempo="2">2×</button><button type="button" data-tempo="5">5×</button><button type="button" data-tempo="10">10×</button>
      </div>
      <time id="clock" class="clock" title="Simulationszeit">--:--:--</time>
      <button id="weather" class="weather" type="button" title="Wetter – klicken für die Prognose">–</button>
      <div class="sl-arten" role="group" aria-label="Welche Einsätze neu kommen">
        <button type="button" data-art="rd">RD</button><button type="button" data-art="kt">KT</button><button type="button" data-art="sek">SEK</button><button type="button" data-art="acn">ACN</button>
      </div>
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
      <button type="button" class="btn small" data-act="faelle" title="Fall-Editor: Fälle für den Fallkatalog ansehen, schreiben, prüfen, importieren und exportieren">Fälle</button>
      <button type="button" class="btn small" data-act="einstellungen">Einstellungen</button>
      <button id="btn-spiel" class="btn small" type="button" title="Spielstand und Multiplayer">Spiel</button>
      <button type="button" class="btn small icon" data-act="fehler" title="Fehler melden – speichert eine Datei mit den letzten Fehlermeldungen für den Entwickler">🐞</button>
    </div>`;

  // Uhr, Start/Pause, Tempo, Wetter
  const clock = kopf.querySelector<HTMLElement>("#clock")!;
  if (IST_HAUPT) {
    const upd = kopf.querySelector<HTMLButtonElement>(".sl-update")!;
    const updZeigen = () => {
      const u = updateInfo();
      upd.hidden = !u || updateLaeuft();
      if (u) upd.textContent = `⬇ Update ${u.version}`;
    };
    onUpdate(updZeigen);
    updZeigen();
    upd.addEventListener("click", async () => {
      const u = updateInfo();
      if (!u) return;
      const ok = await confirmDialog(
        `Update auf ${u.version}`,
        "LeitWerk lädt die neue Version und startet danach neu. Das laufende Spiel wird vorher automatisch gesichert – über „Spiel fortsetzen“ geht es weiter.",
        "Jetzt aktualisieren",
      );
      if (!ok) return;
      try {
        await jetztSichern();
      } catch (e) {
        console.warn("Sichern vor Update", e);
      }
      updateInstallieren();
    });
    const marke = kopf.querySelector<HTMLElement>(".brand")!;
    const zurStart = () => startseiteZeigen(undefined, { zurueck: true });
    marke.addEventListener("click", zurStart);
    marke.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && zurStart());
  }
  const play = kopf.querySelector<HTMLButtonElement>("#sim-play")!;
  const weather = kopf.querySelector<HTMLElement>("#weather")!;
  const fmt = new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const tempoBtns = kopf.querySelectorAll<HTMLButtonElement>("[data-tempo]");
  const render = () => {
    clock.textContent = fmt.format(new Date(sim.state.zeit));
    play.textContent = sim.state.laeuft ? "❚❚ Pause" : "▶ Start";
    play.classList.toggle("primary", !sim.state.laeuft);
    tempoBtns.forEach((b) => b.classList.toggle("active", Number(b.dataset.tempo) === sim.state.tempo));
    // Spieler-NAH mit Flugsimulator in der Luft: Zeitraffer läuft nur 1×
    const bremse = sim.state.tempo > 1 ? sim.zeitBremse() : null;
    const tempoGruppe = tempoBtns[0]?.parentElement;
    if (tempoGruppe) {
      tempoGruppe.classList.toggle("gebremst", !!bremse);
      tempoGruppe.title = bremse ? `Zeitraffer gerade 1× – ${bremse}` : "Zeitraffer";
    }
    const ww = sim.wetterWerte();
    const txt = `${symbolFuer(ww.lage, ww.nacht)} ${WETTER_LABEL[ww.lage]} ${Math.round(ww.temp)}°`;
    if (weather.textContent !== txt) weather.textContent = txt;
    const verbot = sim.flugverbotJetzt();
    weather.classList.toggle("bad", verbot);
    weather.title = `${verbot ? "Kein Flugbetrieb für NAH" : "Flugbetrieb möglich"} – klicken für Wetter und Prognose`;
  };
  weather.addEventListener("click", () => wetterOeffnen());
  const fehler = (e: Error) => toast(String(e.message ?? e), "error");
  play.addEventListener("click", () => {
    if (sim.state.laeuft) return void sim.call("pause").catch(fehler);
    if (ensureCodes(() => void sim.call("start").catch(fehler))) void sim.call("start").catch(fehler);
  });
  tempoBtns.forEach((b) => b.addEventListener("click", () => void sim.call("setTempo", Number(b.dataset.tempo)).catch(fehler)));
  sim.onChange(render);
  render();

  // Welche Einsätze neu kommen (RD, KT, SEK, ACN) – ändern darf nur, wer Einstellungen ändern darf (im Mehrspieler der Host)
  const ARTEN: Record<string, string> = { rd: "Notfälle (RD)", kt: "Krankentransporte (KT)", sek: "Überstellungen (SEK)", acn: "Akutpflege (ACN)" };
  const artBtns = kopf.querySelectorAll<HTMLButtonElement>("[data-art]");
  const artenZeigen = () =>
    artBtns.forEach((b) => {
      const k = `${b.dataset.art}Aktiv` as "rdAktiv" | "ktAktiv" | "sekAktiv" | "acnAktiv";
      const an = store.settings[k] !== false;
      const gast = mp.status.rolle === "client";
      b.classList.toggle("an", an);
      b.setAttribute("aria-pressed", String(an));
      b.disabled = gast;
      b.title = `${ARTEN[b.dataset.art!]}: ${an ? "es kommen neue" : "aus – es kommen keine neuen (bestehende bleiben)"}${gast ? " · ändern kann nur der Host" : ""}`;
    });
  artBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const k = `${b.dataset.art}Aktiv` as "rdAktiv" | "ktAktiv" | "sekAktiv" | "acnAktiv";
      const st = structuredClone(store.settings);
      st[k] = st[k] === false;
      store.setSettings(st);
      artenZeigen();
    }),
  );
  store.onChange(artenZeigen);
  artenZeigen();

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
  kopf.querySelector("[data-act=einstellungen]")!.addEventListener("click", () => einstellungenOeffnen());
  kopf.querySelector("[data-act=faelle]")!.addEventListener("click", () => fallEditorOeffnen());
  kopf.querySelector("[data-act=fehler]")!.addEventListener("click", () => void fehlerMelden());

  // Hinweise im Spiel (z. B. Rechte) aktuell halten
  mp.onChange(render);
  store.onChange(render);
}
