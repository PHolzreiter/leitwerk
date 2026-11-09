/**
 * Funk- und Chat-Fenster aus dem Entwurf („Funk.dc.html“, von Paul am 08.11. abgenommen) – mit echten Daten.
 *
 * Funk: TETRA-Bedienteil (Querformat) bzw. Handfunkgerät (Hochformat), Sprechen | Text, Verlauf nach Gesprächen,
 * Stumm je Gruppe, Funkregeln, Steuerkreuz wechselt die Sprechgruppe. Gesprochen wird mit dem echten Sprechfunk
 * (sprechfunk.ts: PTT, Aufnahme, Empfang, Warteschlange); getippte Funksprüche gehen an den KI-Funk (funkLeo).
 * Chat: Nachrichten an die Mitspieler (sim.chat).
 *
 * Auch für die Pilotenansicht: `funkEinbinden(ziel, { rolle: "pilot", mitKopf: true, status })`.
 */
import vorlage from "./vorlage.html?raw";
import css from "./funk.css?raw";
import geraetUrl from "../../../assets/funkgeraet.webp?url";
import handUrl from "../../../assets/funkgeraet-hand.webp?url";
import { entwurfEinbinden } from "../../entwurf/einbinden";
import { FunkLogik } from "./logik.js";
import { mp } from "../../../net/mehrspieler";
import { sim, type FunkGespraech, type FunkSpruch, type Sprechgruppe } from "../../../sim/engine";
import { toast } from "../../dom";
import { funkGlaetten } from "../../funkNamen";
import { eigenerName, geraetId, gruppenName, pilotStatus, wenHoereIch } from "../../funkGeraet";
import { sprachPrefs, tastenName } from "../../sprache";
import { belegung, tastenName as pilotTastenName } from "../../pilot/tasten";
import { istPilot } from "../../pilot/modus";
import {
  funkGruppenSetzen,
  funkGruppenWahl,
  funkPegel,
  funkSendeZustand,
  gruppeHoerbar,
  onFunkEmpfang,
  onFunkGruppen,
  onFunkSenden,
  sprechGruppe,
  sprechGruppeWeiter,
  sprechStart,
  sprechStopp,
} from "../../sprechfunk";

type GrKey = "normal" | "gs" | "gs2";
const grKey = (k: Sprechgruppe | undefined): GrKey => (k ? k : "normal");

export interface FunkProps {
  /** Leitstelle (Standard) oder Pilot (Sprechtaste Leertaste, Funkregeln für den Piloten) */
  rolle?: "leitstelle" | "pilot";
  /** eigener Status im Display statt „Frei auf Wache“ (Pilot: sonst sein Status aus dem Spiel) */
  status?: string;
  /**
   * Sprechgruppe („03“, „09“, „10“) – wie im Entwurf. Im Spiel bestimmt der Sprechfunk die Gruppe
   * (Pilot: die seines Einsatzes); ist die genannte Gruppe in Betrieb, wird sie beim Einbinden gewählt.
   */
  gruppe?: string;
  /** Funk oder Chat (im Arbeitsplatz fest je Fenster) */
  ansicht?: "funk" | "chat";
  /** eigene Reiter Funk · Chat zeichnen (für die Pilotenansicht; im Arbeitsplatz macht das dockview) */
  mitKopf?: boolean;
  /** Klick auf ein Gespräch (Standard: nichts) */
  waehle?: (einsatzId: string) => void;
  /** wird nach jedem Zeichnen mit der Zahl rufender Fahrzeuge und ungelesener Nachrichten aufgerufen */
  zaehler?: (rufe: number, ungelesen: number) => void;
}

export interface FunkFenster {
  wurzel: HTMLElement;
  zeichnen(): void;
  props(p: Partial<FunkProps>): void;
  /** Fahrzeug anfunken (Kontextmenü „Anfunken“ in anderen Fenstern) */
  rufen(fzId: string): void;
  /** Fahrzeuge, die gerade rufen (Zähler am Reiter) */
  rufe(): number;
  entfernen(): void;
}

function uhr(t: number, sek = true): string {
  return new Date(t).toLocaleTimeString("de-AT", sek ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
}

/** echte Sekunden seit dem ersten Funkspruch mit derselben Spielzeit (in der Pause steht die Spieluhr) */
function funkVersatz(zeilen: { s: { zeit: number; echt?: number } }[], i: number): number {
  const z = zeilen[i].s;
  if (z.echt === undefined) return 0;
  let j = i;
  while (j > 0 && zeilen[j - 1].s.zeit === z.zeit && zeilen[j - 1].s.echt !== undefined) j--;
  return Math.max(0, z.echt - (zeilen[j].s.echt ?? z.echt));
}

function modusGemerkt(): "sprechen" | "text" {
  try {
    return localStorage.getItem("lw-funk-modus") === "text" ? "text" : "sprechen";
  } catch {
    return "sprechen";
  }
}

/** Fahrzeuge, die gerade rufen */
export function funkRufe(): number {
  return (sim.state.funkGespraeche ?? []).filter((g) => g.status === "ruft" || g.status === "mithoeren").length;
}

interface Block {
  gr: GrKey;
  grKurz: string;
  gs: boolean;
  mit: string;
  zeit: string;
  einsatz: string;
  einsatzId: string | null;
  sprueche: { zeit: string; von: string; text: string; wer: string; gesprochen: boolean; leo: boolean; neu: boolean }[];
}

export function funkEinbinden(ziel: HTMLElement, props: FunkProps = {}): FunkFenster {
  let p: FunkProps = { ...props };
  const pilot = () => (p.rolle ? p.rolle === "pilot" : istPilot());

  // Wunsch-Gruppe aus den Props (wie im Entwurf), wenn sie gerade in Betrieb ist
  if (p.gruppe) {
    const k: Sprechgruppe = p.gruppe.endsWith("09") ? "gs" : p.gruppe.endsWith("10") ? "gs2" : null;
    if (sim.offeneGruppen().includes(k)) {
      if (pilot()) funkGruppenSetzen({ pilotSenden: k === null ? "normal" : k });
      else funkGruppenSetzen({ senden: k });
    }
  }

  // ---------------------------------------------------------------- Verlauf (nur neu bauen, wenn sich etwas tut)
  const gesehen = new Set<string>();
  let ersterBau = true;
  let verlaufKey = "";
  let bloecke: Block[] = [];
  function verlauf(): Block[] {
    const alle = sim.state.funkGespraeche ?? [];
    const zeilen = alle
      .flatMap((g) => g.sprueche.map((s, i) => ({ s, g, i, t: s.echt ?? (g.echtSeit ?? 0) + i })))
      .sort((a, b) => a.t - b.t)
      .slice(-200);
    const key = JSON.stringify([zeilen.length, zeilen[zeilen.length - 1]?.t, alle.map((g) => `${g.id}:${g.sprueche.length}:${g.einsatzId ?? ""}`).join(",")]);
    if (key === verlaufKey) return bloecke;
    verlaufKey = key;
    const neu: Block[] = [];
    let letzt: { g: FunkGespraech; b: Block } | null = null;
    zeilen.forEach(({ s, g, i }, n) => {
      const zeit = s.zeit + funkVersatz(zeilen, n);
      const id = `${g.id}:${i}`;
      const istNeu = !ersterBau && !gesehen.has(id);
      gesehen.add(id);
      // aufeinanderfolgende Funksprüche desselben Gesprächs bilden einen Block (wie im Entwurf)
      if (!letzt || letzt.g.id !== g.id) {
        const e = g.einsatzId ? sim.einsatz(g.einsatzId) : undefined;
        const name = gruppenName(g.kanal ?? null);
        const b: Block = {
          gr: grKey(g.kanal),
          grKurz: name.slice(-2),
          gs: !!g.kanal,
          mit: g.an ? `${g.an.funkname} ↔ ${g.funkname}` : g.funkname,
          zeit: uhr(zeit, false),
          einsatz: e ? `Einsatz ${e.nummer}` : "",
          einsatzId: e ? g.einsatzId : null,
          sprueche: [],
        };
        neu.push(b);
        letzt = { g, b };
      }
      const leo = s.von === "LEO";
      letzt.b.sprueche.push({ zeit: uhr(zeit), von: s.von, text: s.text, wer: leo ? (s as FunkSpruch).wer ?? "" : "", gesprochen: !!s.stimme, leo, neu: istNeu });
    });
    ersterBau = false;
    bloecke = neu;
    return bloecke;
  }

  // ---------------------------------------------------------------- Display: wer spricht
  function anzeige() {
    const k = sprechGruppe();
    const name = gruppenName(k);
    const ich = funkSendeZustand();
    let kopf = "";
    let zeile = "";
    let gruppe = "";
    if (ich?.art === "sendet") {
      kopf = "Senden";
      zeile = `ID: ${geraetId(pilot() ? eigenerName() : "LEO")}`;
      gruppe = name;
    } else if (ich?.art === "wartet") {
      kopf = "Warten …";
      const w = wenHoereIch(k);
      zeile = w ? `ID: ${geraetId(w)}` : "";
      gruppe = "danach bist du dran";
    } else {
      const w = wenHoereIch(k);
      if (w) {
        kopf = "Gruppe aktiv";
        zeile = `ID: ${geraetId(w)}`;
        gruppe = name;
      }
    }
    // was in den anderen Gruppen gerade gefunkt wird (Lampe neben der Gruppe, kleiner im Fenster)
    const neben = sim
      .offeneGruppen()
      .filter((x) => x !== k && gruppeHoerbar(x))
      .map((x) => [x, wenHoereIch(x)] as const)
      .filter(([, w]) => !!w)
      .map(([x, w]) => `${gruppenName(x).slice(-2)}: ${w}`);
    const pegel = ich?.art === "sendet" ? Math.min(100, Math.round(Math.sqrt(funkPegel()) * 260)) : 0;
    return { kopf, zeile, gruppe, neben: neben.join(" · "), lampe: neben.length > 0, pegel };
  }

  // ---------------------------------------------------------------- Chat
  let chatGesehen = -1;
  function chat() {
    const msgs = sim.state.chat ?? [];
    const ab = chatGesehen < 0 ? msgs.length : chatGesehen;
    chatGesehen = msgs.length;
    const ichName = sim.ich?.name ?? mp.ich.name;
    const personen = mp.aktiv
      ? mp.spieler.map((s) => ({ name: s.pid === mp.ich.pid ? `${s.name} (du)` : s.name, weg: !s.online, titel: s.host ? "Host" : s.online ? "Mitspieler" : "nicht verbunden" }))
      : [{ name: `${ichName} (du)`, weg: false, titel: "" }];
    return {
      personen,
      // allein schreibt nur man selbst; im Mehrspieler nach Namen
      nachrichten: msgs.map((m, i) => ({ von: m.von, ich: !mp.aktiv || m.von === mp.ich.name, zeit: uhr(m.zeit, false), text: m.text, neu: i >= ab })),
      ungelesen: mp.ungeleseneChats,
      leerText: mp.aktiv
        ? "Noch keine Nachrichten. Hier schreibt ihr euch untereinander."
        : "Der Chat ist für Spiele mit mehreren Disponenten (Spiel → Multiplayer). Hier schreibt ihr euch untereinander.",
    };
  }

  /** Beispiel-Rufname für Hilfe und Platzhalter: ein echtes Fahrzeug des Spiels */
  let beispiel = "";
  function beispielFz(): string {
    if (beispiel) return beispiel;
    const fz = Object.values(sim.state.fahrzeuge ?? {});
    const f = fz.find((x) => x.rmTyp === "RTW" || x.rmTyp === "RTW-C") ?? fz[0];
    beispiel = f?.funkrufname || "56/006";
    return beispiel;
  }

  let modus = modusGemerkt();
  function daten() {
    const offen = sim.offeneGruppen();
    const meine = sprechGruppe();
    const pl = pilot();
    return {
      modus,
      gruppen: offen.map((k) => {
        const name = gruppenName(k);
        return { k: grKey(k), name, kurz: name.slice(-2), gs: k !== null };
      }),
      meine: grKey(meine),
      grundName: gruppenName(null),
      stumm: { ...funkGruppenWahl().stumm },
      gespraeche: verlauf(),
      anzeige: anzeige(),
      sende: funkSendeZustand()?.art ?? null,
      rufe: funkRufe(),
      status: pl ? pilotStatus() : "Frei auf Wache",
      taste: pl ? pilotTastenName(belegung().taste.funk) : tastenName(sprachPrefs().funkTaste),
      eigenerName: pl ? eigenerName() : "LEO",
      beispielFz: beispielFz(),
      bildGeraet: geraetUrl,
      bildHand: handUrl,
      chat: chat(),
    };
  }

  // ---------------------------------------------------------------- Aktionen
  /** Gesprächspartner jetzt (zuletzt aktives Gespräch der Leitstelle auf meiner Gruppe) */
  function partner(): FunkGespraech | undefined {
    const k = sprechGruppe();
    return (sim.state.funkGespraeche ?? [])
      .filter((g) => (g.kanal ?? null) === k && !g.an && ["offen", "leoRuft", "mensch"].includes(g.status))
      .sort((a, b) => (b.echtLetzt ?? 0) - (a.echtLetzt ?? 0))[0];
  }
  // Wer gerade schreibt, bekommt keine Minute Stille: Gespräch bleibt offen
  let tipptGemeldet = 0;
  const tippt = () => {
    const g = partner();
    if (!g || Date.now() - tipptGemeldet < 3000) return;
    tipptGemeldet = Date.now();
    sim.call("funkTippt", g.id).catch(() => {});
  };
  const waehle = (id: string) => p.waehle?.(id);

  const aktionen = {
    gruppeWeiter(dir: 1 | -1) {
      sprechGruppeWeiter(dir);
      const k = sprechGruppe();
      return { name: gruppenName(k), gs: k !== null };
    },
    stumm(k: GrKey, an: boolean) {
      funkGruppenSetzen({ stumm: { [k]: an } });
    },
    modus(m: "sprechen" | "text") {
      modus = m;
      try {
        localStorage.setItem("lw-funk-modus", m);
      } catch {
        /* egal */
      }
      verlaufKey = "";
    },
    async funkSenden(roh: string): Promise<boolean> {
      const t = funkGlaetten(roh);
      try {
        if (pilot()) {
          await sim.call("funkMenschText", null, t, sprechGruppe());
          return true;
        }
        const id = await sim.call("funkLeo", t, sprechGruppe(), false);
        const g = sim.state.funkGespraeche?.find((x) => x.id === id);
        if (g?.einsatzId) waehle(g.einsatzId);
        return true;
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
        return false;
      }
    },
    tippt,
    pttAn(e: PointerEvent) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const b = e.currentTarget as HTMLElement | null;
      try {
        b?.setPointerCapture?.(e.pointerId);
      } catch {
        /* egal */
      }
      void sprechStart("leo", pilot() ? undefined : sprechGruppe());
      // Loslassen auch merken, wenn der Knopf inzwischen neu gezeichnet wurde
      const los = () => {
        window.removeEventListener("pointerup", los, true);
        window.removeEventListener("pointercancel", los, true);
        void sprechStopp();
      };
      window.addEventListener("pointerup", los, true);
      window.addEventListener("pointercancel", los, true);
    },
    waehle,
    chatSenden(t: string) {
      sim.call("chat", t).catch((e) => toast(String((e as Error).message ?? e), "error"));
    },
    ansicht(k: "funk" | "chat") {
      if (k === "chat") mp.ungeleseneChats = 0;
      neuZeichnen();
    },
  };

  const app = { daten, aktionen };
  const f = entwurfEinbinden(ziel, "funk", vorlage, css, (pr) => new FunkLogik(pr), {
    rolle: pilot() ? "pilot" : "leitstelle",
    status: p.status ?? "",
    ansicht: p.ansicht ?? "funk",
    mitKopf: !!p.mitKopf,
    app,
  });
  const k = f.k;

  // Nach dem Zeichnen: Verlauf und Chat unten halten (wenn man unten war), Zähler melden
  const roh = k._zeichnen!;
  let vEl: HTMLElement | null = null;
  let cEl: HTMLElement | null = null;
  let vKey = "";
  let cAnz = -1;
  k._zeichnen = () => {
    const v0 = k.verlaufRef.current;
    const c0 = k.chatRef.current;
    const vUnten = !v0 || !v0.isConnected || v0.scrollHeight - v0.scrollTop - v0.clientHeight < 40;
    const cUnten = !c0 || !c0.isConnected || c0.scrollHeight - c0.scrollTop - c0.clientHeight < 40;
    roh();
    const v = k.verlaufRef.current;
    if (v && v.isConnected && (v !== vEl || (verlaufKey !== vKey && vUnten))) v.scrollTop = v.scrollHeight;
    vEl = v && v.isConnected ? v : null;
    vKey = verlaufKey;
    const c = k.chatRef.current;
    const n = sim.state.chat?.length ?? 0;
    if (c && c.isConnected && (c !== cEl || (n !== cAnz && cUnten))) c.scrollTop = c.scrollHeight;
    cEl = c && c.isConnected ? c : null;
    cAnz = n;
    p.zaehler?.(funkRufe(), mp.ungeleseneChats);
  };

  // ---------------------------------------------------------------- neu zeichnen, wenn sich etwas tut
  let geplant = false;
  function neuZeichnen(): void {
    if (geplant) return;
    geplant = true;
    requestAnimationFrame(() => {
      geplant = false;
      k._zeichnen?.();
    });
  }
  let simWartet = false;
  const aus = [
    sim.onChange(() => {
      if (simWartet) return;
      simWartet = true;
      setTimeout(() => {
        simWartet = false;
        neuZeichnen();
      }, 200);
    }),
    mp.onChange(() => neuZeichnen()),
    onFunkSenden(() => neuZeichnen()),
    onFunkEmpfang(() => neuZeichnen()),
    onFunkGruppen(() => neuZeichnen()),
  ];
  // Display (wer spricht, Pegel) und „tippt noch“ laufend
  let anzKey = "";
  const uhrId = setInterval(() => {
    if (!f.wurzel.isConnected) return;
    if ((k.state.entwurf as string | undefined)?.trim()) tippt();
    const a = anzeige();
    const key = JSON.stringify([a, funkSendeZustand()?.art ?? null]);
    if (key !== anzKey || a.pegel) {
      anzKey = key;
      neuZeichnen();
    }
  }, 150);

  return {
    wurzel: f.wurzel,
    zeichnen: () => k._zeichnen?.(),
    props(neu) {
      p = { ...p, ...neu };
      const q: Record<string, unknown> = {};
      if ("status" in neu) q.status = neu.status ?? "";
      if ("rolle" in neu) q.rolle = pilot() ? "pilot" : "leitstelle";
      if ("ansicht" in neu) q.ansicht = neu.ansicht ?? "funk";
      if ("mitKopf" in neu) q.mitKopf = !!neu.mitKopf;
      f.props(q);
    },
    rufen(fzId: string) {
      void sim
        .call("funkRufen", fzId)
        .then(() => {
          neuZeichnen();
          k.eingabeRef.current?.focus();
        })
        .catch((e) => toast(String((e as Error).message ?? e), "error"));
    },
    rufe: funkRufe,
    entfernen() {
      clearInterval(uhrId);
      aus.forEach((x) => x());
      f.entfernen();
    },
  };
}
