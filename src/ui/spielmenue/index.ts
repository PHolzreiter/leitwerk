/**
 * Spielmenü (Entwurf „LeitWerk Spielmenü“): öffnet über das Logo in der Kopfleiste oder Esc.
 * 01 Weiterspielen · 02 Spielstand (Pilot: Hubschrauber wechseln) · 03 Einstellungen (dieselben Seiten wie im Hauptmenü) ·
 * 04 Multiplayer · 05 Fälle · 06 Zum Hauptmenü · LeitWerk beenden. Allein pausiert das Spiel, solange das Menü offen ist;
 * im Multiplayer läuft es weiter (der Host kann für alle pausieren).
 */
import vorlageRoh from "./vorlage.html?raw";
import smCss from "./spielmenue.css?raw";
import hmCss from "../hauptmenue/hauptmenue.css?raw";
import logoUrl from "../hauptmenue/logo.svg?url";
import { SpielmenueKomponente } from "./komponente.js";
import { ansicht } from "../entwurf/laufzeit";
import { mitSeiten, seitenCss } from "../einstellungen/vorlage";
import { zusatzBauen } from "../einstellungen/zusatz";
import { einstellungsBindung } from "../hauptmenue/bindung";
import type { ZeilenQuelle } from "../hauptmenue/vertrag";
import { sim, fliegt, type Berechtigung } from "../../sim/engine";
import { store } from "../../data/store";
import { mp, meinName, RECHTE_LABEL, STANDARD_RECHTE } from "../../net/mehrspieler";
import * as spielstand from "../../net/spielstand";
import * as ordner from "../../net/spielstandOrdner";
import { inTauri, pickTextFile, saveTextFile } from "../../platform";
import { wetterKurz } from "../ws/kopfleisteInhalt";
import { karteWaehlen } from "../ws/auswahl";
import { alleFaelle, eingebauterFall, faelleGeaendert, fallpaketExport, fallpaketImport, istFallAktiv, istGeaendert, type FallVorlage } from "../../abfrage/faelle";
import { faellePruefen } from "../../abfrage/faellePruefen";
import { themaLabel } from "../../abfrage/themen";
import { fallEditorOeffnen } from "../fallEditor";
import { ablageName, ablageSichern } from "../../net/ablage";
import { appVersion } from "../../updates";
import { merkeHeli, pilotAktiv, pilotVerlassen } from "../pilot/pilotView";
import { hauptmenueOffen, hauptmenueZeigen } from "../hauptmenue";
import { spielmenueAnmelden } from "./oeffnen";
import { toast } from "../dom";

const vorlage = mitSeiten(vorlageRoh);
const fehlerText = (e: unknown): string => String((e as Error)?.message ?? e).replace(/^Error:\s*/, "");
const p2 = (n: number) => String(n).padStart(2, "0");
const uhrzeit = (t: number, sek = false) => {
  const d = new Date(t);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}${sek ? `:${p2(d.getSeconds())}` : ""}`;
};
/** „NÖ-03“ → „RD-NOE-03“ (Name der Funkgruppe wie am Funkgerät) */
const gruppenName = () => String(sim.funkgruppe().id).replace(/^NÖ-/, "RD-NOE-");
const RECHTE: Berechtigung[] = ["disponieren", "kt", "steuern", "einstellungen"];
const RECHT_INFO: Record<Berechtigung, string> = {
  disponieren: "Notrufe annehmen, Einsätze anlegen, alarmieren",
  kt: "Krankentransporte planen",
  steuern: "Zeitraffer, Pause, Aufkommen",
  einstellungen: "Fahrzeuge, Dienststellen, Krankenhäuser",
};

/** Rechte, die dieser Spieler in dieser Sitzung schon angefragt hat */
const angefragt = new Set<string>();

let offen: {
  wurzel: HTMLElement;
  k: SpielmenueKomponente;
  weg(): void;
} | null = null;
/** Spiel lief beim Öffnen (allein): beim Schließen weiterlaufen lassen */
let warLaufend = false;

export function spielmenueOffen(): boolean {
  return !!offen;
}

/** Spielmenü öffnen – optional gleich einen Punkt („einstellungen“ mit Seite, „spielstand“, „multiplayer“, „faelle“) */
export function spielmenueOeffnen(punkt?: string, seite?: string, extra?: Record<string, unknown>): void {
  if (hauptmenueOffen()) return;
  if (!offen) bauen();
  if (punkt) offen!.k.oeffne(punkt, seite, extra);
}

/** Zurück ins Spiel */
export function spielmenueSchliessen(weiter = true): void {
  if (!offen) return;
  const o = offen;
  offen = null;
  o.weg();
  if (weiter && warLaufend && mp.status.rolle === "aus" && !sim.state.laeuft) sim.start();
  warLaufend = false;
}

/** Alte Seitennamen (früheres Einstellungsfenster) → Seiten der Einstellungen */
const ALT: Record<string, string> = { ki: "anrufer", persoenlich: "darstellung", simulation: "aufkommen", daten: "fahrzeuge", rettungsmittel: "alarmierung" };

/** Einstellungen im Spielmenü öffnen (Sprünge aus dem Spiel, z. B. „Anordnungen verwalten …“, „KH-Aufnahme …“) */
export function spielmenueEinstellungen(seite?: string, extra?: Record<string, unknown>): void {
  spielmenueOeffnen("einstellungen", seite ? (ALT[seite] ?? seite) : undefined, extra);
}

function bauen(): void {
  // allein: Spiel anhalten, solange das Menü offen ist
  warLaufend = false;
  if (mp.status.rolle === "aus" && sim.state.laeuft) {
    warLaufend = true;
    sim.pause();
  }
  const stil = document.createElement("style");
  stil.dataset.spielmenue = "";
  stil.textContent = `${hmCss.replace(/^body\{margin:0\}\s*/m, "").replace(/^a\{color:#3B8BFF\}a:hover\{color:#6AA6FF\}\s*/m, "")}\n${seitenCss}\n${smCss}`;
  document.head.appendChild(stil);
  const wurzel = document.createElement("div");
  wurzel.className = "smw-wurzel";
  document.body.appendChild(wurzel);

  let k: SpielmenueKomponente;
  let zt = 0;
  const neu = () => k?.setState({});
  const bald = () => {
    if (zt) return;
    zt = window.setTimeout(() => {
      zt = 0;
      neu();
    }, 1000);
  };
  const aus: (() => void)[] = [];

  // ---------------------------------------------------------------- Einstellungen (wie im Hauptmenü)
  const einst = einstellungsBindung(neu);
  let zeilen: ZeilenQuelle | undefined;
  let feldWert: ((k: string, v: unknown) => void) | undefined;
  let zq: { laden(): void; beenden(): void } | undefined;
  void import("../hauptmenue/zeilen").then((m) => {
    if (!offen) return;
    const q = m.zeilenQuelle(neu);
    zeilen = q.zeilen;
    zq = q;
    feldWert = m.feldWert;
    q.laden();
    neu();
  });
  const zusatz = zusatzBauen({
    neuZeichnen: neu,
    // Ort im Kartenfenster wählen: Menü kurz ausblenden
    karteWaehlen: async (hinweis) => {
      wurzel.style.visibility = "hidden";
      try {
        return await karteWaehlen(hinweis);
      } finally {
        wurzel.style.visibility = "";
      }
    },
  });

  // ---------------------------------------------------------------- Spielstände
  let saves: ordner.SpielstandDatei[] = [];
  let auto: { gespeichert: number; einsaetze: number } | null = null;
  const savesLaden = async () => {
    try {
      saves = (await ordner.liste()).sort((a, b) => b.geaendert - a.geaendert);
    } catch {
      saves = [];
    }
    auto = await spielstand.autosaveInfo().catch(() => null);
    neu();
  };
  void savesLaden();
  const wann = (t: number): string => {
    const s = (Date.now() - t) / 1000;
    if (s < 3600) return `vor ${Math.max(1, Math.round(s / 60))} Min.`;
    const d = new Date(t);
    if (d.toDateString() === new Date().toDateString()) return `heute ${uhrzeit(t)}`;
    if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `gestern ${uhrzeit(t)}`;
    return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.`;
  };
  const einsatzText = (n: number) => (n === 1 ? "1 Einsatz" : `${n} Einsätze`);

  // ---------------------------------------------------------------- Fälle (eigene und geänderte, mit Prüfung)
  let faelleCache: { name: string; id: string; info: string; chip: string; chipCls: string }[] | null = null;
  aus.push(faelleGeaendert(() => {
    faelleCache = null;
    neu();
  }));
  const fallName = (f: FallVorlage) => f.name?.trim() || f.id;
  const faelleListe = () => {
    if (faelleCache) return faelleCache;
    const liste = alleFaelle(true).filter((f) => !eingebauterFall(f.id) || istGeaendert(f.id));
    let befunde: { fall: string }[] = [];
    try {
      befunde = faellePruefen(store.schema, liste);
    } catch {
      befunde = [];
    }
    faelleCache = liste
      .sort((a, b) => fallName(a).localeCompare(fallName(b), "de"))
      .map((f) => {
        const n = befunde.filter((b) => b.fall === fallName(f) || b.fall === f.id).length;
        const aktiv = istFallAktiv(f.id);
        return {
          id: f.id,
          name: fallName(f),
          info: `${f.spezial ? "Besonderer Anruf" : "Notfall"} · ${themaLabel(f.thema)} · ${eingebauterFall(f.id) ? "eingebaut, geändert" : "eigener Fall"}`,
          chip: !aktiv ? "aus" : n ? `${n} Hinweis${n === 1 ? "" : "e"}` : "geprüft",
          chipCls: `sm-chip${!aktiv ? "" : n ? " sm-gelb" : " sm-ok"}`,
        };
      });
    return faelleCache;
  };

  // ---------------------------------------------------------------- Hilfen fürs Spiel
  const meinFz = () => Object.values(sim.state.fahrzeuge).find((f) => f.pilot?.pid === mp.ich.pid);
  const ichSpieler = () => mp.spieler.find((p) => p.pid === mp.ich.pid);
  const meineRechte = () => ({ ...STANDARD_RECHTE, ...(ichSpieler()?.rechte ?? {}) }) as Record<Berechtigung, boolean>;

  const app = {
    logoUrl,
    einst,
    zusatz,
    zeilen: ((seite, b) => (zeilen ? zeilen(seite, b) : undefined)) as ZeilenQuelle,
    feldWert: (key: string, v: unknown) => feldWert?.(key, v),
    version: () => versionText,
    /** Mitspieler ohne Recht „Einstellungen & Daten“: Spiel & Simulation und Leitstelle nur ansehen */
    gesperrt: () => mp.status.rolle === "client" && !mp.darf("einstellungen"),
    angefragt: (r: string) => angefragt.has(r),
    anfragen: (r: string) => {
      if (mp.rechtAnfragen(r as Berechtigung)) angefragt.add(r);
      else toast("Der Host ist gerade nicht verbunden", "error");
      neu();
    },
    schliessen: () => spielmenueSchliessen(true),

    kopf() {
      const st = sim.state;
      const pilot = pilotAktiv();
      const rolle = mp.status.rolle;
      const fz = meinFz();
      let wetter = "";
      try {
        const w = wetterKurz();
        wetter = sim.settings.wetterAktiv === false ? "" : `${w.kurz} ${w.grad}`;
      } catch {
        wetter = "";
      }
      const laufend = st.einsaetze.filter((e) => e.zustand !== "abgeschlossen" && !e.fremd).length;
      const wartend = st.einsaetze.filter((e) => e.anruf && !e.fremd && ["klingelt", "gehalten", "verpasst"].includes(e.anruf.status)).length;
      const host = mp.spieler.find((p) => p.host);
      const andere = mp.spieler.filter((p) => !p.host && p.pid !== mp.ich.pid && p.online).map((p) => p.name);
      const sd = fz ? sim.statusDef(fz.status) : null;
      return {
        modus: pilot ? "Pilot" : rolle === "host" ? "Host" : rolle === "client" ? "Mitspieler" : "Solo",
        rolle,
        uhr: st.zeit ? uhrzeit(st.zeit, true) : "–",
        wetter,
        laeuft: !!st.laeuft,
        hostDa: rolle !== "client" || !!mp.status.hostDa,
        darfSteuern: rolle !== "client" || mp.darf("steuern"),
        spielerText: `${mp.spieler.length} Spieler`,
        hostName: host?.name ?? "dem Host",
        andere: andere.length > 1 ? `${andere.slice(0, -1).join(", ")} und ${andere[andere.length - 1]}` : andere[0] ?? "",
        andereN: andere.length,
        einsaetzeText: einsatzText(laufend),
        verpasst: wartend,
        fgName: gruppenName(),
        heliName: fz ? fz.kurzname || fz.funkrufname : "",
        heliRuf: fz && fz.kurzname ? fz.funkrufname : "",
        pilotText: fz ? `${fz.kurzname || fz.funkrufname} · Status ${sd?.nummer ?? ""} · ${sd?.name ?? ""}` : "Kein Hubschrauber gewählt",
      };
    },
    pauseUmschalten() {
      void sim.call(sim.state.laeuft ? "pause" : "start").catch((e: unknown) => toast(fehlerText(e), "error"));
    },

    spielstand: {
      name: () => spielstand.standardName(),
      async speichern(name: string): Promise<string> {
        await spielstand.speichernAls(name);
        await savesLaden();
        return `Gespeichert · ${einsatzText(sim.state.einsaetze.length)}, Spielzeit ${uhrzeit(sim.state.zeit)}`;
      },
      saves() {
        const l: { datei: string; name: string; info: string }[] = [];
        if (auto) l.push({ datei: "", name: "Automatische Sicherung", info: `${einsatzText(auto.einsaetze)} · ${wann(auto.gespeichert)}` });
        for (const s of saves) {
          const i = s.info ?? {};
          const teile = [i.einsaetze != null ? einsatzText(i.einsaetze) : "", i.simZeit ? `Spielzeit ${uhrzeit(i.simZeit)}` : "", wann(s.geaendert)].filter(Boolean);
          l.push({ datei: s.datei, name: i.name || s.datei.replace(/\.leitwerk$/, ""), info: teile.join(" · ") });
        }
        return l;
      },
      autoText: () => (auto ? `Zuletzt ${wann(auto.gespeichert)} · beim Verlassen immer` : "Sobald ein Einsatz läuft · beim Verlassen immer"),
      ordnerDa: inTauri(),
      ordner: () => void ordner.ordnerZeigen().catch(() => undefined),
      async laden(datei: string): Promise<string | null> {
        if (mp.status.rolle === "client") return "Laden kann nur der Host";
        try {
          await spielstand.jetztSichern().catch(() => undefined);
          if (datei) await spielstand.ladenDatei(datei);
          else await spielstand.autosaveLaden();
          warLaufend = true;
          toast("Spielstand geladen");
          await savesLaden();
          return null;
        } catch (e) {
          return fehlerText(e);
        }
      },
    },

    mp() {
      const s = mp.status;
      const code = s.code ? `${s.code.slice(0, 3)} ${s.code.slice(3)}` : "";
      const fzVon = (pid: string) => Object.values(sim.state.fahrzeuge).find((x) => x.pilot?.pid === pid);
      const platz = (pid: string) => {
        const fz = fzVon(pid);
        return fz ? `Pilot · ${fz.kurzname || fz.funkrufname}` : `Disponent · ${gruppenName()}`;
      };
      const andere = mp.spieler.filter((p) => !p.host && p.online).map((p) => p.name);
      const ich = ichSpieler();
      const r = meineRechte();
      return {
        code,
        lobbyChip: `Lobby offen · ${mp.spieler.length} von 6`,
        lobbyChipCls: `sm-chip${s.verbunden ? " sm-ok" : " sm-gelb"}`,
        lobbyZuText: andere.length ? `Lobby schließen? ${andere.join(", ")} ${andere.length === 1 ? "wird" : "werden"} getrennt, du spielst allein weiter.` : "Lobby schließen? Du spielst allein weiter.",
        ichName: meinName() || "Du",
        ichPlatz: s.rolle === "client" ? platz(mp.ich.pid) : `${platz(mp.ich.pid)} · Host`,
        host: mp.spieler.find((p) => p.host)?.name ?? "–",
        verbText: `${!s.verbunden ? "Verbindung unterbrochen – verbinde neu …" : !s.hostDa ? "Host nicht verbunden" : typeof ich?.ping === "number" ? `Verbindung ${ich.ping} ms` : "verbunden"} · ${mp.spieler.length} Spieler`,
        hostWegDa: s.rolle === "client" && !s.hostDa,
        hostUebernehmen: () => mp.hostUebernehmen(),
        spieler: mp.spieler.map((p) => {
          const ichSelbst = p.pid === mp.ich.pid;
          const verb = p.host && ichSelbst ? "auf diesem Rechner" : !p.online ? `getrennt${p.offlineSeit ? ` seit ${uhrzeit(p.offlineSeit)}` : ""}` : typeof p.ping === "number" ? `${p.ping} ms` : "verbunden";
          const farbe = !p.online ? "#FFB4B6" : typeof p.ping === "number" && p.ping > 150 ? "#FFC72C" : "#4CC38A";
          return {
            pid: p.pid,
            name: p.name,
            nameCls: p.online ? "" : "sm-weg",
            ich: ichSelbst,
            host: p.host,
            platz: platz(p.pid),
            platzCls: p.online ? "" : "sm-weg",
            verb,
            verbFarbe: farbe,
            rechte: RECHTE.map((id) => ({ id, an: p.host || (p.rechte[id] ?? STANDARD_RECHTE[id]), fest: p.host || s.rolle !== "host", aria: `${p.name}: ${RECHTE_LABEL[id]}` })),
            uebergebenDa: s.rolle === "host" && !p.host && p.online,
          };
        }),
        meineRechte: RECHTE.map((id) => ({
          id,
          name: RECHTE_LABEL[id],
          info: RECHT_INFO[id],
          an: !!r[id],
          angefragt: !r[id] && angefragt.has(id),
          anfragbar: !r[id] && !angefragt.has(id),
        })),
      };
    },
    async lobbyOeffnen(): Promise<string | null> {
      if (sim.pilotTest) return "Im Übungsflug gibt es keinen Multiplayer – zuerst zurück ins Hauptmenü";
      const name = meinName().trim();
      if (!name) return "Bitte zuerst einen Namen eingeben (Hauptmenü › Spiel starten › Multiplayer)";
      try {
        const c = await mp.hosten(name);
        toast(`Lobby offen – Code ${c}`);
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    lobbySchliessen: () => {
      mp.verlassen();
      toast("Lobby geschlossen – du spielst allein weiter");
    },
    codeKopieren: () => void navigator.clipboard?.writeText(mp.status.code).catch(() => undefined),
    rechtSetzen: (pid: string, r: Berechtigung, an: boolean) => mp.setRechte(pid, r, an),
    hostUebergeben: (pid: string) => mp.hostUebergeben(pid),
    mpVerlassen: () => {
      mp.verlassen();
      toast("Spiel verlassen");
    },

    faelle: () => ({ liste: faelleListe() }),
    fallOeffnen: (id: string) => fallEditorOeffnen(id),
    async faelleImportieren(): Promise<string | null> {
      const f = await pickTextFile(".json,application/json");
      if (!f) return null;
      const r = fallpaketImport(f.text, false);
      if (!r.neu && !r.ersetzt) throw new Error(r.fehler[0] ?? "Keine Fälle in der Datei");
      ablageSichern("Fälle", ablageName(f.name, "json"), f.text);
      return `${r.neu} neu, ${r.ersetzt} ersetzt${r.fehler.length ? `, ${r.fehler.length} übersprungen` : ""}`;
    },
    async faelleExportieren(): Promise<string | null> {
      const liste = alleFaelle(true);
      const eig = liste.filter((f) => !eingebauterFall(f.id) || istGeaendert(f.id));
      const ausw = (eig.length ? eig : liste).map((f) => f.id);
      const p = await saveTextFile(`leitwerk-faelle-${new Date().toISOString().slice(0, 10)}.json`, fallpaketExport(ausw), { name: "Fallpaket", extensions: ["json"] });
      return p ? `${ausw.length} ${eig.length ? "eigene und geänderte " : ""}Fälle exportiert` : null;
    },

    helis() {
      const ich = mp.ich.pid;
      const mein = meinFz();
      return Object.values(sim.state.fahrzeuge)
        .filter((x) => fliegt(x) && !x.ersatzFuer)
        .map((fz) => {
          const grund = fz.id === mein?.id ? null : sim.pilotHindernis(fz, ich);
          const andererPilot = fz.pilot && fz.pilot.pid !== ich ? fz.pilot.name : "";
          return {
            id: fz.id,
            name: fz.kurzname || fz.funkrufname,
            info: `${fz.funkrufname}${fz.stationName ? ` · ${fz.stationName}` : ""} · ${fz.nachtflug ? "Tag und Nacht" : "nur Tagflug"}`,
            chip: fz.id === mein?.id ? "du" : andererPilot ? `${andererPilot} fliegt` : grund ? grund : "",
            chipCls: fz.id === mein?.id ? "sm-chip sm-ok" : "sm-chip",
          };
        })
        .sort((a, b) => Number(a.chip !== "du") - Number(b.chip !== "du") || Number(!!a.chip) - Number(!!b.chip) || a.name.localeCompare(b.name, "de"));
    },
    async heliWechseln(id: string): Promise<string | null> {
      try {
        const alt = meinFz();
        if (alt) await sim.call("pilotAbgeben", alt.id);
        await sim.call("pilotUebernehmen", id);
        if (sim.pilotTest) sim.pilotTestGebiet(id);
        merkeHeli(id);
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },

    async zumHauptmenue(): Promise<void> {
      try {
        await spielstand.jetztSichern();
      } catch (e) {
        console.warn("Sichern vor dem Hauptmenü", e);
      }
      spielmenueSchliessen(false);
      if (pilotAktiv()) return void (await pilotVerlassen());
      sim.pause();
      if (mp.status.rolle !== "aus") mp.verlassen();
      hauptmenueZeigen(undefined, { splash: false });
    },
    async beenden(): Promise<string | null> {
      await spielstand.jetztSichern().catch(() => undefined);
      if (!inTauri()) return "Beenden geht nur im Programm – im Browser einfach das Fenster schließen";
      try {
        const fz = meinFz();
        if (fz && pilotAktiv()) await sim.call("pilotAbgeben", fz.id).catch(() => undefined);
        if (mp.status.rolle !== "aus") mp.verlassen();
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
  };

  let versionText = "";
  void appVersion().then((v) => {
    versionText = v && v !== "Browser" ? `v${v}` : (document.getElementById("app-version")?.textContent ?? "");
    neu();
  });

  // Größe der Fläche (nicht des Bildschirms): bei Zoom der Oberfläche passt das Menü genau hinein
  const mass = () => ({ breite: wurzel.clientWidth || window.innerWidth, hoehe: wurzel.clientHeight || window.innerHeight });
  k = new SpielmenueKomponente(app, mass());
  const a = ansicht(vorlage, wurzel);
  k._zeichnen = () => {
    try {
      a.zeichnen(k.renderVals());
    } catch (e) {
      console.error("Spielmenü", e);
    }
  };
  const groesse = () => {
    k.props = { ...k.props, ...mass() };
    neu();
  };
  window.addEventListener("resize", groesse);
  const taste = (e: KeyboardEvent) => k.escTaste(e);
  document.addEventListener("keydown", taste, true);
  aus.push(sim.onChange(bald), store.onChange(neu), mp.onChange(() => {
    // Lobby/Spiel verlassen oder Host gewechselt: neu zeichnen
    neu();
  }));
  const uhr = window.setInterval(bald, 1000);

  offen = {
    wurzel,
    k,
    weg: () => {
      window.clearInterval(uhr);
      if (zt) clearTimeout(zt);
      window.removeEventListener("resize", groesse);
      document.removeEventListener("keydown", taste, true);
      aus.forEach((f) => f());
      zq?.beenden();
      try {
        k.componentWillUnmount();
      } catch {
        /* egal */
      }
      wurzel.classList.add("zu");
      setTimeout(() => {
        wurzel.remove();
        stil.remove();
      }, 260);
    },
  };
  k._zeichnen();
  k.componentDidMount();
  requestAnimationFrame(() => wurzel.classList.add("auf"));
}

// ---------------------------------------------------------------- Esc im Spiel öffnet das Spielmenü
let escAn = false;
/** Esc im Spiel: Spielmenü öffnen (wenn nichts anderes Esc braucht) */
export function spielmenueEscEinrichten(): void {
  if (escAn) return;
  escAn = true;
  spielmenueAnmelden({ oeffnen: spielmenueOeffnen, einstellungen: spielmenueEinstellungen });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || offen || hauptmenueOffen()) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
    // offene Dialoge, Großfenster (Fall-Editor …), Kartenauswahl und Schubladen haben Vorrang
    if (document.querySelector(".dlg-overlay, .gross-overlay:not([hidden]), .kl-pop.offen, .plt-karte-pop:not([hidden]), .karte-waehlen, .wahl-hinweis:not([hidden])")) return;
    e.preventDefault();
    spielmenueOeffnen();
  });
}
