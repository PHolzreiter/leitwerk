/**
 * Einrichtung: was LeitWerk in MSFS 2024 und X-Plane 12 einbaut – an einer Stelle, mit klarem Stand je Teil.
 *
 * Eigene Teile (EFB-App, X-Plane-Plugin) baut LeitWerk beim Start von selbst ein und hält sie aktuell.
 * Änderungen an fremden Flugzeugen (HPG H145: App im Tablet; Rotorsim EC135) macht der Spieler einmal per Knopf,
 * danach hält LeitWerk sie aktuell. Mission und Web-Link der H145 legt LeitWerk von selbst an (wie bisher).
 * Zu sehen im Hauptmenü unter Pilot und in der Pilotenansicht (Cockpit).
 */
import "./einrichtung.css";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../platform";
import { openDialog, type DialogHandle } from "../dialog";
import { el, esc, toast } from "../dom";
import { communityWaehlen, dllWaehlen, ec135, ec135Cockpit, gtn, gtnSuchen, vorgabe, vorgabeSetzen, xplanePluginEntfernen, xplanePluginPruefen, xpPlugin, type Ec135Flugzeug } from "./flugsim";
import { efbPort, efbStarten, tabletAppSetzen } from "./handy";
import { hpgEinrichten } from "./hpg";

export type Zustand = "ok" | "update" | "fehlt" | "optional" | "unnoetig" | "neustart" | "fehler" | "pruefe";

export interface Aktion {
  t: string;
  klick: () => unknown;
  prim?: boolean;
}

export interface Eintrag {
  id: string;
  titel: string;
  zustand: Zustand;
  text: string;
  /** Hinweis in kleinerer Schrift (z. B. Anleitung) */
  hinw?: string;
  aktionen: Aktion[];
  /** EC135: ein Hubschrauber (eingerückt, mit Auswahl) */
  wahl?: { an: boolean; umschalten: () => unknown };
  unter?: boolean;
}

export interface Gruppe {
  id: "msfs" | "xplane";
  titel: string;
  /** Simulator gefunden? sonst ist die ganze Gruppe „nicht nötig“ */
  da: boolean;
  eintraege: Eintrag[];
}

interface EfbStand { community: string | null; installiert: string | null; mitgeliefert: string; fremd: boolean; geaendert: boolean; fehler: string }
interface H145Stand { h145: boolean; mission: boolean; link: boolean; app: boolean; app_aktuell: boolean }

const st = {
  geprueft: false,
  laeuft: false,
  efb: null as EfbStand | null,
  h145: null as H145Stand | null,
  dll: undefined as string | null | undefined,
  /** in dieser Sitzung geändert – wirkt nach dem nächsten Start des Simulators bzw. Laden des Flugzeugs */
  neu: new Set<string>(),
  fehler: {} as Record<string, string>,
};

const hoerer = new Set<() => void>();
/** Bei jeder Änderung des Stands (zum Neuzeichnen) */
export function einrichtungBeobachten(f: () => void): () => void {
  hoerer.add(f);
  return () => hoerer.delete(f);
}
function melden(): void {
  for (const f of hoerer) {
    try {
      f();
    } catch (e) {
      console.warn("Einrichtung", e);
    }
  }
}

const fehlerText = (e: unknown) => String((e as Error)?.message ?? e);

async function efbLesen(aktion: "pruefen" | "einbauen" | "entfernen"): Promise<void> {
  try {
    const s = await invoke<EfbStand>("efb_app", { community: vorgabe().community ?? null, aktion });
    st.efb = s;
    if (s.geaendert) st.neu.add("efb");
    if (s.fehler && aktion !== "pruefen") toast(s.fehler, "error");
    else if (s.geaendert) toast(aktion === "entfernen" ? "MSFS: EFB-App „LeitWerk“ entfernt – ab dem nächsten Start von MSFS" : `MSFS: EFB-App „LeitWerk“ ${s.installiert} eingebaut – wirkt nach dem nächsten Start von MSFS`);
  } catch (e) {
    st.fehler.efb = fehlerText(e);
  }
}

async function h145Lesen(): Promise<void> {
  if (!efbPort) {
    st.h145 = null;
    return;
  }
  try {
    st.h145 = await invoke<H145Stand>("hpg_tablet_stand", { community: vorgabe().community ?? null, port: efbPort });
  } catch (e) {
    st.fehler.h145 = fehlerText(e);
  }
}

/** Alles nachsehen (ohne etwas zu ändern – außer dem X-Plane-Plugin, das LeitWerk selbst aktuell hält) */
export async function einrichtungPruefen(): Promise<void> {
  if (!inTauri()) {
    st.geprueft = true;
    melden();
    return;
  }
  st.fehler = {};
  await efbStarten();
  await Promise.all([
    gtnSuchen(),
    efbLesen("pruefen"),
    h145Lesen(),
    invoke<string | null>("msfs_dll_suchen", { gewaehlt: vorgabe().dll ?? null }).then(
      (d) => void (st.dll = d),
      () => void (st.dll = null),
    ),
    xplanePluginPruefen(false),
    ec135Cockpit("pruefen"),
  ]);
  st.geprueft = true;
  melden();
}

/** Ist dieser Hubschrauber für LeitWerk gewählt? (ohne eigene Wahl: die drei vorgeschlagenen) */
export function ec135Gewaehlt(f: Ec135Flugzeug): boolean {
  const w = vorgabe().ec135Wahl ?? {};
  return w[f.ordner] ?? f.vorschlag;
}

function ec135Wahl(f: Ec135Flugzeug, an: boolean): void {
  vorgabeSetzen({ ec135Wahl: { ...(vorgabe().ec135Wahl ?? {}), [f.ordner]: an } });
}

/**
 * Beim Start von LeitWerk (still): eigene Teile einbauen und aktuell halten, schon Eingebautes in fremden Flugzeugen
 * aktuell halten. Was der Spieler entfernt hat, bleibt draußen.
 */
export async function einrichtungAuto(): Promise<void> {
  if (!inTauri() || st.laeuft) return;
  st.laeuft = true;
  try {
    await einrichtungPruefen();
    const v = vorgabe();
    const arbeit: Promise<unknown>[] = [];
    // EFB-App: nur wenn MSFS (Community-Ordner) da ist
    if (st.efb?.community && v.efbApp !== false && !st.efb.fremd && st.efb.installiert !== st.efb.mitgeliefert) arbeit.push(efbLesen("einbauen"));
    // X-Plane-Plugin
    if (xpPlugin.stand?.ordner && v.xpPlugin !== false && xpPlugin.stand.mitgeliefert && !xpPlugin.stand.aktuell) arbeit.push(xplanePluginPruefen(true));
    // H145: Mission anlegen (der Link kommt mit efbStarten), App aktuell halten, wenn eingebaut
    if (st.h145?.h145 && !st.h145.mission) arbeit.push(hpgEinrichten().then(() => void st.neu.add("h145mission")));
    if (st.h145?.h145 && v.tabletApp && !st.h145.app_aktuell) arbeit.push(tabletAppSetzen(true, null, true).then(() => void st.neu.add("h145app")));
    await Promise.all(arbeit);
    // EC135: eingebaute, gewählte Hubschrauber auf den Stand dieser Version bringen (nacheinander)
    for (const f of ec135.stand?.flugzeuge ?? []) {
      if (f.zustand !== "original" && !f.aktuell && ec135Gewaehlt(f)) {
        await ec135Cockpit("aktualisieren", f.ordner);
        st.neu.add(`ec135:${f.ordner}`);
      }
    }
    await h145Lesen();
  } catch (e) {
    console.warn("Einrichtung", e);
  } finally {
    st.laeuft = false;
    melden();
  }
}

// ------------------------------------------------------------------ Liste

const SIMCONNECT_HILFE =
  "SimConnect.dll fehlt: Sie kommt mit dem kostenlosen MSFS-SDK. In MSFS 2024: Optionen › Allgemein › Entwickler › Developer Mode ein, dann oben Help › SDK Installer. " +
  "Danach findet LeitWerk die Datei selbst (C:\\MSFS 2024 SDK\\SimConnect SDK\\lib\\SimConnect.dll) – oder „Datei wählen …“.";

function msfsGruppe(): Gruppe {
  const v = vorgabe();
  const community = gtn.community ?? st.efb?.community ?? null;
  const e: Eintrag[] = [];
  e.push({
    id: "community",
    titel: "Community-Ordner",
    zustand: community ? "ok" : "unnoetig",
    text: community ?? "MSFS nicht gefunden – nur nötig, wenn du mit MSFS fliegst.",
    aktionen: [{ t: community ? "Anderen wählen …" : "Ordner wählen …", klick: () => communityWaehlen().then(() => einrichtungAuto()) }],
  });
  const windows = /Windows/i.test(navigator.userAgent);
  e.push({
    id: "simconnect",
    titel: "SimConnect (Verbindung zu MSFS)",
    zustand: st.dll ? "ok" : !windows ? "unnoetig" : "fehlt",
    text: st.dll ? `Gefunden: ${st.dll}` : !windows ? "Nur unter Windows." : "Nicht gefunden.",
    hinw: st.dll ? undefined : windows ? SIMCONNECT_HILFE : undefined,
    aktionen: windows ? [{ t: st.dll ? "Andere Datei …" : "Datei wählen …", klick: () => dllWaehlen().then(() => einrichtungPruefen()) }] : [],
  });
  const efb = st.efb;
  const efbAus = v.efbApp === false;
  e.push({
    id: "efb",
    titel: "EFB-App „LeitWerk“ (Tablet in jedem Flugzeug)",
    zustand: !efb ? "pruefe" : efb.fremd || st.fehler.efb ? "fehler" : !efb.installiert ? (efbAus ? "optional" : "fehlt") : efb.installiert !== efb.mitgeliefert ? "update" : st.neu.has("efb") ? "neustart" : "ok",
    text: !efb
      ? "…"
      : efb.fremd
        ? "Ein fremdes Paket „leitwerk-efb-pilot“ liegt im Community-Ordner – LeitWerk lässt es in Ruhe."
        : st.fehler.efb || efb.fehler ||
          (!efb.installiert
            ? efbAus ? "Entfernt – LeitWerk baut sie nicht mehr von selbst ein." : "Noch nicht eingebaut."
            : efb.installiert !== efb.mitgeliefert
              ? `Version ${efb.installiert} eingebaut, ${efb.mitgeliefert} ist dabei.`
              : `Version ${efb.installiert} · Wetter und Uhrzeit von LeitWerk, Einsatz-App im EFB.${st.neu.has("efb") ? " Wirkt nach dem nächsten Start von MSFS." : ""}`),
    aktionen: efb?.fremd
      ? []
      : [
          ...(!efb?.installiert || efb.installiert !== efb.mitgeliefert
            ? [{ t: efb?.installiert ? "Aktualisieren" : "Einbauen", prim: true, klick: async () => (vorgabeSetzen({ efbApp: true }), await efbLesen("einbauen")) }]
            : []),
          ...(efb?.installiert ? [{ t: "Entfernen", klick: async () => (vorgabeSetzen({ efbApp: false }), await efbLesen("entfernen")) }] : []),
        ],
  });
  const h = st.h145;
  if (!h?.h145) {
    e.push({ id: "h145", titel: "HPG H145", zustand: "unnoetig", text: efbPort ? "Nicht installiert – nur für die H145 nötig." : "…", aktionen: [] });
  } else {
    e.push({
      id: "h145mission",
      titel: "H145: Mission „LeitWerk Leitstelle“",
      zustand: h.mission ? (st.neu.has("h145mission") ? "neustart" : "ok") : "fehlt",
      text: h.mission ? "Im Tablet: Missions › Library › „LeitWerk Leitstelle“ (nach dem Anlegen einmal REFRESH)." : "Noch nicht angelegt.",
      aktionen: [{ t: h.mission ? "Index neu bauen" : "Anlegen", prim: !h.mission, klick: async () => (await hpgEinrichten(), st.neu.add("h145mission")) }],
    });
    e.push({
      id: "h145link",
      titel: "H145: Link im Web-Browser des Tablets",
      zustand: h.link ? "ok" : "fehlt",
      text: h.link ? "„LeitWerk“ in der Web-Browser-App des Tablets." : "Wird mit dem nächsten Prüfen eingetragen (wirkt nach dem Start von MSFS).",
      aktionen: h.link ? [] : [{ t: "Eintragen", prim: true, klick: async () => (await (await import("./handy")).tabletLinkPruefen(), st.neu.add("h145link")) }],
    });
    const an = !!v.tabletApp;
    e.push({
      id: "h145app",
      titel: "H145: App „LeitWerk“ im Tablet",
      zustand: !an ? "optional" : !h.app || !h.app_aktuell ? "update" : st.neu.has("h145app") ? "neustart" : "ok",
      text: !an
        ? "Optional: eigenes Symbol „LeitWerk“ auf dem Startbildschirm des Tablets (ändert zwei Dateien der H145, Sicherung bleibt)."
        : !h.app
          ? "Gewählt, aber nicht (mehr) eingebaut – z. B. nach einem Update der H145."
          : !h.app_aktuell
            ? "Eingebaut, aber nicht auf dem Stand dieser LeitWerk-Version."
            : `Eingebaut.${st.neu.has("h145app") ? " Wirkt nach dem nächsten Start von MSFS." : ""}`,
      aktionen: an
        ? [
            ...(!h.app || !h.app_aktuell ? [{ t: "Aktualisieren", prim: true, klick: async () => (await tabletAppSetzen(true, null, true), st.neu.add("h145app")) }] : []),
            { t: "Entfernen", klick: async () => (await tabletAppSetzen(false), st.neu.add("h145app")) },
          ]
        : [{ t: "Einbauen", klick: async () => (await tabletAppSetzen(true), st.neu.add("h145app")) }],
    });
  }
  e.push({
    id: "gtn",
    titel: "PMS50 GTN750",
    zustand: gtn.paket ? "ok" : "unnoetig",
    text: gtn.paket ? "Flugplan liegt bei Alarm und nach der Zielwahl im GTN bereit – nichts einzubauen." : "Nicht installiert – optional.",
    aktionen: [],
  });
  return { id: "msfs", titel: "MSFS 2024", da: !!community, eintraege: e };
}

function xplaneGruppe(): Gruppe {
  const v = vorgabe();
  const pl = xpPlugin.stand;
  const da = !!pl?.ordner;
  const e: Eintrag[] = [];
  e.push({ id: "xplane", titel: "X-Plane 12", zustand: !pl ? "pruefe" : da ? "ok" : "unnoetig", text: !pl ? "…" : da ? pl.ordner! : "Nicht gefunden – nur nötig, wenn du mit X-Plane fliegst.", aktionen: [] });
  if (da) {
    const aus = v.xpPlugin === false;
    e.push({
      id: "xpplugin",
      titel: "Plugin „LeitWerk“ (Tablet, Cockpit, Wetter)",
      zustand: pl.fehler ? "fehler" : !pl.mitgeliefert ? "unnoetig" : pl.aktuell ? (pl.neustart ? "neustart" : "ok") : aus ? "optional" : pl.version ? "update" : "fehlt",
      text: pl.fehler
        ? pl.fehler
        : !pl.mitgeliefert
          ? "In dieser LeitWerk-Version nicht dabei."
          : pl.aktuell
            ? `Eingebaut${pl.version ? ` (${pl.version})` : ""}.${pl.neustart ? " Wirkt nach dem nächsten Start von X-Plane." : ""}`
            : aus
              ? "Entfernt – LeitWerk baut es nicht mehr von selbst ein."
              : "Noch nicht eingebaut bzw. nicht aktuell.",
      aktionen: !pl.mitgeliefert
        ? []
        : [
            ...(!pl.aktuell ? [{ t: "Einbauen", prim: true, klick: async () => (vorgabeSetzen({ xpPlugin: true }), await xplanePluginPruefen(true, true)) }] : []),
            ...(pl.aktuell ? [{ t: "Entfernen", klick: () => xplanePluginEntfernen() }] : []),
          ],
    });
    const es = ec135.stand;
    const fl = es?.flugzeuge ?? [];
    e.push({
      id: "ec135",
      titel: "Rotorsim EC135: MFD, Klapp-Tablet, TETRA-Funkgerät",
      zustand: !es ? "pruefe" : !fl.length ? "unnoetig" : "optional",
      text: !es ? "…" : !fl.length ? "Keine EC135 in X-Plane/Aircraft gefunden." : "Hake an, welche Hubschrauber LeitWerk bekommen. Wirkt beim nächsten Laden des Hubschraubers; „Entfernen“ stellt die Originaldateien wieder her.",
      aktionen: [{ t: "Neu suchen", klick: () => ec135Cockpit("pruefen") }],
    });
    for (const f of fl) {
      const an = ec135Gewaehlt(f);
      const drin = f.zustand !== "original";
      const neu = st.neu.has(`ec135:${f.ordner}`);
      const z: Zustand = an ? (!drin ? "fehlt" : !f.aktuell ? "update" : neu ? "neustart" : "ok") : drin ? "update" : "unnoetig";
      e.push({
        id: `ec135:${f.ordner}`,
        unter: true,
        titel: f.name,
        zustand: z,
        text: an
          ? !drin
            ? "Gewählt, noch nicht eingebaut."
            : f.zustand === "veraendert"
              ? "Seit dem Einbau geändert (Update des Hubschraubers?) – wird neu umgebaut."
              : !f.aktuell
                ? "Eingebaut, aber nicht auf dem Stand dieser LeitWerk-Version."
                : `Eingebaut: ${f.teile.join(", ") || "–"}.${neu ? " Wirkt beim nächsten Laden." : ""}`
          : drin
            ? "Nicht gewählt, aber eingebaut – „Entfernen“ stellt das Original wieder her."
            : "Nicht gewählt.",
        hinw: f.hinweis || undefined,
        wahl: {
          an,
          umschalten: async () => {
            ec135Wahl(f, !an);
            if (!an && !drin) {
              await ec135Cockpit("einbauen", f.ordner);
              st.neu.add(`ec135:${f.ordner}`);
            } else if (an && drin) {
              await ec135Cockpit("entfernen", f.ordner);
              st.neu.add(`ec135:${f.ordner}`);
            }
          },
        },
        aktionen:
          an && drin && !f.aktuell
            ? [{ t: "Aktualisieren", prim: true, klick: async () => (await ec135Cockpit("aktualisieren", f.ordner), st.neu.add(`ec135:${f.ordner}`)) }]
            : !an && drin
              ? [{ t: "Entfernen", klick: async () => (await ec135Cockpit("entfernen", f.ordner), st.neu.add(`ec135:${f.ordner}`)) }]
              : an && !drin
                ? [{ t: "Einbauen", prim: true, klick: async () => (await ec135Cockpit("einbauen", f.ordner), st.neu.add(`ec135:${f.ordner}`)) }]
                : [],
      });
    }
  }
  return { id: "xplane", titel: "X-Plane 12", da, eintraege: e };
}

export function einrichtungGruppen(): Gruppe[] {
  return [msfsGruppe(), xplaneGruppe()];
}

const OFFEN: Zustand[] = ["fehlt", "update", "fehler"];

/** Wie viel noch zu tun ist (nur in gefundenen Simulatoren) */
export function einrichtungOffen(): { offen: number; neustart: number; geprueft: boolean; laeuft: boolean } {
  let offen = 0;
  let neustart = 0;
  for (const g of einrichtungGruppen()) {
    if (!g.da) continue;
    for (const e of g.eintraege) {
      if (OFFEN.includes(e.zustand)) offen++;
      if (e.zustand === "neustart") neustart++;
    }
  }
  return { offen, neustart, geprueft: st.geprueft, laeuft: st.laeuft || ec135.laeuft };
}

/** Alles Offene erledigen (was einen Knopf „Einbauen/Aktualisieren/Anlegen/Entfernen bei Abwahl“ hat) */
export async function allesEinrichten(): Promise<void> {
  if (st.laeuft) return;
  st.laeuft = true;
  melden();
  try {
    for (const g of einrichtungGruppen()) {
      if (!g.da) continue;
      for (const e of g.eintraege) {
        if (!OFFEN.includes(e.zustand) || e.id === "simconnect") continue;
        const a = e.aktionen.find((x) => x.prim) ?? (e.wahl && !e.wahl.an ? e.aktionen[0] : undefined);
        if (a) await a.klick();
      }
    }
  } finally {
    st.laeuft = false;
  }
  await einrichtungPruefen();
}

// ------------------------------------------------------------------ Dialog

const ZEICHEN: Record<Zustand, [string, string]> = {
  ok: ["✓", "aktuell"],
  update: ["↑", "Update"],
  fehlt: ["✗", "fehlt"],
  optional: ["○", "optional"],
  unnoetig: ["–", "nicht nötig"],
  neustart: ["↻", "nach Neustart"],
  fehler: ["!", "Fehler"],
  pruefe: ["…", "prüfe"],
};

let offenerDialog: DialogHandle | null = null;

function koerper(): HTMLElement {
  const wurzel = el("div", { class: "ew" });
  const klicks: (() => unknown)[] = [];
  const knopf = (a: Aktion) => {
    klicks.push(a.klick);
    return `<button class="btn ${a.prim ? "primary" : "plain"} ew-btn" data-k="${klicks.length - 1}">${esc(a.t)}</button>`;
  };
  const o = einrichtungOffen();
  let h = `<div class="ew-kopf"><div class="ew-sum ${o.offen ? "offen" : "fertig"}">${
    !o.geprueft ? "Prüfe …" : o.laeuft ? "Richte ein …" : o.offen ? `${o.offen} ${o.offen === 1 ? "Punkt" : "Punkte"} offen` : "Alles eingerichtet ✓"
  }${o.neustart ? ` <span class="ew-neu">· ${o.neustart}× wirkt nach Neustart</span>` : ""}</div>
  <div class="ew-text">Eigene Teile (EFB-App, X-Plane-Plugin) baut LeitWerk beim Start von selbst ein und hält sie aktuell. Änderungen an fremden Hubschraubern machst du hier einmal – danach hält LeitWerk sie aktuell.</div></div>`;
  for (const g of einrichtungGruppen()) {
    const sichtbar = g.eintraege.filter((e) => e.zustand !== "unnoetig" || e.unter || e.id === "community" || e.id === "xplane");
    const still = g.eintraege.filter((e) => !sichtbar.includes(e));
    h += `<section class="ew-gr${g.da ? "" : " aus"}"><h3>${esc(g.titel)}${g.da ? "" : ' <span class="ew-dim">· nicht gefunden</span>'}</h3>`;
    for (const e of g.da ? sichtbar : sichtbar.slice(0, 1)) {
      const [z, w] = ZEICHEN[e.zustand];
      let wahl = "";
      if (e.wahl) {
        klicks.push(e.wahl.umschalten);
        wahl = `<button class="ew-cb${e.wahl.an ? " an" : ""}" role="checkbox" aria-checked="${e.wahl.an}" aria-label="${esc(e.titel)} für LeitWerk" data-k="${klicks.length - 1}">${e.wahl.an ? "✓" : ""}</button>`;
      }
      h += `<div class="ew-z z-${e.zustand}${e.unter ? " unter" : ""}">${wahl}<span class="ew-st" title="${w}">${z}</span><div class="ew-in"><div class="ew-t">${esc(e.titel)} <span class="ew-w">${w}</span></div><div class="ew-d">${esc(e.text)}</div>${e.hinw ? `<div class="ew-h">${esc(e.hinw)}</div>` : ""}</div><div class="ew-ak">${e.aktionen.map(knopf).join("")}</div></div>`;
    }
    const rest = g.da ? still : g.eintraege.slice(1);
    if (rest.length) h += `<details class="ew-rest"><summary>Nicht nötig (${rest.length})</summary>${rest.map((e) => `<div class="ew-z z-unnoetig"><span class="ew-st">–</span><div class="ew-in"><div class="ew-t">${esc(e.titel)}</div><div class="ew-d">${esc(e.text)}</div></div><div class="ew-ak">${e.aktionen.map(knopf).join("")}</div></div>`).join("")}</details>`;
    h += "</section>";
  }
  wurzel.innerHTML = h;
  wurzel.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-k]");
    if (!b || st.laeuft) return;
    const f = klicks[Number(b.dataset.k)];
    if (!f) return;
    b.setAttribute("disabled", "");
    void Promise.resolve(f())
      .catch((e) => toast(fehlerText(e), "error"))
      .then(() => einrichtungPruefen());
  });
  return wurzel;
}

/** Fenster „Einrichtung“ (Hauptmenü › Pilot und Pilotenansicht) */
export function einrichtungDialog(): void {
  offenerDialog?.close();
  const box = el("div");
  box.appendChild(koerper());
  const d = openDialog({
    title: "Einrichtung für MSFS und X-Plane",
    body: box,
    wide: true,
    actions: [
      { label: "Neu prüfen", onClick: () => (void einrichtungPruefen(), false) },
      { label: "Alles einrichten", kind: "primary", onClick: () => (void allesEinrichten(), false) },
      { label: "Schließen" },
    ],
  });
  offenerDialog = d;
  // über dem Hauptmenü (z-index 5000) liegen
  const ov = d.root.closest<HTMLElement>(".dlg-overlay");
  if (ov) ov.style.zIndex = "6000";
  const neu = () => {
    if (!document.body.contains(box)) return weg();
    const scroll = d.root.scrollTop;
    box.replaceChildren(koerper());
    d.root.scrollTop = scroll;
    d.setActionEnabled(1, !st.laeuft && einrichtungOffen().offen > 0);
  };
  const weg = einrichtungBeobachten(neu);
  const takt = window.setInterval(() => {
    if (!document.body.contains(box)) {
      window.clearInterval(takt);
      weg();
      if (offenerDialog === d) offenerDialog = null;
    } else if (ec135.laeuft || st.laeuft) neu();
  }, 500);
  neu();
  if (!st.laeuft) void einrichtungPruefen();
}
