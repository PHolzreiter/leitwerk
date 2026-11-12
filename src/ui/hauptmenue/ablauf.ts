/**
 * Abläufe des Hauptmenüs mit echten Daten: Spiel starten, Fortsetzen, Lobby, Beitreten, Pilot,
 * Bereitschafts-Check, Update, Changelog, Fortschritt, Mithelfen, Beenden.
 * Alles ohne Dialoge – Fehler gehen als Text an das Menü zurück.
 */
import { mp, meinName, STANDARD_RECHTE } from "../../net/mehrspieler";
import { sim, fliegt, type Berechtigung } from "../../sim/engine";
import { store } from "../../data/store";
import * as spielstand from "../../net/spielstand";
import * as ordner from "../../net/spielstandOrdner";
import { inTauri, pickTextFile } from "../../platform";
import { pruefen, type Check } from "../startseite";
import { UPDATES } from "../fortschritt";
import { onUpdate, updateInfo } from "../updateDienst";
import { installUpdate, appVersion } from "../../updates";
import { fortschrittLaden, hilfeLaden, hilfeLokal, meineTickets, onTickets, ticketSchicken, type FortschrittPunkt, type TicketArt } from "../../net/tickets";
import { livePrefs, setLivePrefs, schluesselGeprueft } from "../../abfrage/liveKi";
import { letzterHeli, merkeHeli, pilotOeffnen } from "../pilot/pilotView";
import { einrichtungBeobachten, einrichtungDialog, einrichtungOffen } from "../pilot/einrichtung";
import { WETTER_LABEL } from "../../sim/weather";
import { funkgruppe } from "../../sim/funkgruppen";

const fehlerText = (e: unknown): string => String((e as Error)?.message ?? e).replace(/^Error:\s*/, "");

export function ablaufBauen(neuZeichnen: () => void, schliessen: () => void) {
  const aus: (() => void)[] = [];
  let checks: Check[] | null = null;
  let saves: ordner.SpielstandDatei[] = [];
  let autosave: { gespeichert: number; einsaetze: number } | null = null;
  let fortschritt: FortschrittPunkt[] = [];
  let hilfe = hilfeLokal();
  let version = "";
  let updLaden: { done: number; total: number } | null = null;
  let updFehler = "";
  let warteAufStart = false;
  let beiHostZu: (() => void) | undefined;

  async function checksLaden(): Promise<void> {
    try {
      checks = await pruefen();
    } catch {
      checks = [];
    }
    neuZeichnen();
  }
  async function savesLaden(): Promise<void> {
    try {
      saves = (await ordner.liste()).sort((a, b) => b.geaendert - a.geaendert);
    } catch {
      saves = [];
    }
    try {
      autosave = await spielstand.autosaveInfo();
    } catch {
      autosave = null;
    }
    neuZeichnen();
  }

  const zeit = (t: number): string => new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  const wann = (t: number): string => {
    const s = (Date.now() - t) / 1000;
    if (s < 3600) return `vor ${Math.max(1, Math.round(s / 60))} Min.`;
    const d = new Date(t);
    const heute = new Date();
    const gestern = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === heute.toDateString()) return `heute ${zeit(t)}`;
    if (d.toDateString() === gestern.toDateString()) return `gestern ${zeit(t)}`;
    return d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" }) + ".";
  };
  const tageszeit = (t: number): string => {
    const h = new Date(t).getHours();
    return h >= 22 || h < 6 ? "Nacht" : h < 10 ? "Morgen" : h < 17 ? "Tag" : "Abend";
  };

  /** Ins Spiel: Menü weg */
  const insSpiel = (): void => schliessen();

  return {
    starten(): void {
      void checksLaden();
      void savesLaden();
      void appVersion().then((v) => {
        version = v && v !== "Browser" ? v : "";
        neuZeichnen();
      });
      void fortschrittLaden()
        .then((r) => {
          fortschritt = r.punkte;
          neuZeichnen();
        })
        .catch(() => undefined);
      void hilfeLaden()
        .then((h) => {
          hilfe = h;
          neuZeichnen();
        })
        .catch(() => undefined);
      aus.push(mp.onChange(() => {
        // Mitspieler: der Host hat die Lobby geschlossen → zurück zur Code-Eingabe
        if (mp.status.rolle === "client" && mp.status.hostVerlassen) {
          warteAufStart = false;
          mp.verlassen();
          beiHostZu?.();
          neuZeichnen();
          return;
        }
        // Mitspieler: der Host hat das Spiel gestartet → ins Spiel
        if (warteAufStart && mp.status.rolle === "client" && mp.status.hostDa && !sim.state.lobby) {
          warteAufStart = false;
          insSpiel();
          return;
        }
        neuZeichnen();
      }));
      aus.push(sim.onChange(() => {
        if (warteAufStart && mp.status.rolle === "client" && mp.status.hostDa && !sim.state.lobby) {
          warteAufStart = false;
          insSpiel();
        }
      }));
      aus.push(onUpdate(() => neuZeichnen()));
      aus.push(onTickets(() => neuZeichnen()));
      aus.push(einrichtungBeobachten(() => neuZeichnen()));
    },
    beenden(): void {
      aus.forEach((f) => f());
    },

    // ------------------------------------------------ Bereitschafts-Check (wie die alte Startseite)
    checks(): { name: string; text: string; detail: string; stufe: string; seite?: string }[] | null {
      if (!checks) return null;
      return checks.map((c) => ({ name: c.name, text: c.text, detail: c.hilfe ?? c.text, stufe: c.stand === "pruefe" ? "aus" : c.stand, seite: c.seite }));
    },
    checksNeu: () => void checksLaden(),

    // ------------------------------------------------ Spiel starten
    async neuesSpiel(zeitText: string): Promise<string | null> {
      if (mp.status.rolle === "client") return "Als Mitspieler startet der Host das Spiel";
      const t = zeitText ? new Date(zeitText).getTime() : Date.now();
      if (!Number.isFinite(t)) return "Startzeit verstehe ich nicht";
      try {
        await sim.call("neuesSpiel", t);
        insSpiel();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    fortsetzenText(): string {
      return autosave ? wann(autosave.gespeichert) : "";
    },
    saves(): { datei: string; name: string; info: string; offen: string; wann: string; auto: boolean }[] {
      const liste: { datei: string; name: string; info: string; offen: string; wann: string; auto: boolean }[] = [];
      if (autosave)
        liste.push({ datei: "", name: "Automatische Sicherung", info: autosave.einsaetze === 1 ? "1 Einsatz" : `${autosave.einsaetze} Einsätze`, offen: "", wann: wann(autosave.gespeichert), auto: true });
      for (const s of saves) {
        const i = s.info ?? {};
        const teile = [i.funkgruppe, i.simZeit ? `Spielzeit ${zeit(i.simZeit)} · ${tageszeit(i.simZeit)}` : "", i.spieler?.length ? `mit ${i.spieler.join(", ")}` : ""].filter(Boolean);
        liste.push({ datei: s.datei, name: i.name || s.datei.replace(/\.leitwerk$/, ""), info: teile.join(" · "), offen: i.offen != null ? `${i.offen} offen` : "", wann: wann(s.geaendert), auto: false });
      }
      return liste;
    },
    async laden(datei: string): Promise<string | null> {
      if (mp.status.rolle === "client") return "Als Mitspieler lädt der Host den Spielstand";
      try {
        if (datei) await spielstand.ladenDatei(datei);
        else await spielstand.autosaveLaden();
        sim.start();
        insSpiel();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    async umbenennen(datei: string, name: string): Promise<string | null> {
      try {
        await ordner.umbenennen(datei, name);
        await savesLaden();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    async loeschen(datei: string): Promise<string | null> {
      try {
        await ordner.loeschen(datei);
        await savesLaden();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    async exportieren(datei: string): Promise<string | null> {
      try {
        await spielstand.exportieren(datei);
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    async importieren(): Promise<string | null> {
      const f = await pickTextFile(".leitwerk,.json");
      if (!f) return null;
      try {
        await ordner.schreiben(f.name.replace(/\.(leitwerk|json)$/i, ""), f.text);
        await savesLaden();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    ordnerOeffnen(): void {
      void ordner.ordnerZeigen().catch(() => undefined);
    },
    imProgramm: inTauri(),

    // ------------------------------------------------ Anrufer-KI (Erstwahl ohne Dialog)
    kiErstwahlNoetig(): boolean {
      return !livePrefs().gewaehlt && !(navigator.webdriver && !location.search.includes("erstwahl"));
    },
    kiWaehlen(art: "gemini" | "lokal"): void {
      setLivePrefs({ an: art === "gemini", gewaehlt: true });
      neuZeichnen();
    },
    geminiBereit: () => schluesselGeprueft(),

    // ------------------------------------------------ Lobby (Host)
    rolle: () => mp.status.rolle,
    lobby() {
      const s = mp.status;
      return {
        code: s.code ?? "",
        zustand: !s.verbunden ? "verbinde …" : s.rolle === "host" || s.hostDa ? "verbunden" : "Host nicht da",
        zustandOk: s.verbunden && (s.rolle === "host" || s.hostDa),
        spieler: mp.spieler.map((p) => {
          const fz = Object.values(sim.state.fahrzeuge).find((x) => x.pilot?.pid === p.pid);
          return { pid: p.pid, name: p.name, host: p.host, ich: p.pid === mp.ich.pid, online: p.online, pilot: fz ? fz.kurzname || fz.funkrufname : "", rechte: { ...STANDARD_RECHTE, ...p.rechte } as Record<Berechtigung, boolean> };
        }),
      };
    },
    meinName: () => meinName(),
    async hosten(name: string): Promise<string | null> {
      try {
        sim.lobbySetzen(true);
        await mp.hosten(name);
        sim.lobbySetzen(true);
        neuZeichnen();
        return null;
      } catch (e) {
        sim.lobbySetzen(false);
        return fehlerText(e);
      }
    },
    lobbySchliessen(): void {
      mp.verlassen();
      sim.lobbySetzen(false);
      neuZeichnen();
    },
    setRechte: (pid: string, r: Berechtigung, an: boolean) => mp.setRechte(pid, r, an),

    // ------------------------------------------------ Beitreten (Disponent und Pilot)
    async beitreten(code: string, name: string): Promise<string | null> {
      const c = code.replace(/\D/g, "");
      try {
        if (mp.status.rolle === "host") return "Du bist gerade Host einer Lobby – zuerst schließen";
        if (mp.status.rolle === "client" && mp.status.code !== c) mp.verlassen();
        if (mp.status.rolle !== "client") await mp.beitreten(c, name);
        return null;
      } catch (e) {
        const t = fehlerText(e);
        if (/nicht gefunden|unbekannt|kein spiel|ungültig/i.test(t)) return "Kein Spiel mit diesem Code – bitte prüfen";
        if (/verbind|erreich|offline|timeout|netz/i.test(t)) return "Host gerade nicht erreichbar – ist er online?";
        return t;
      }
    },
    beitrittVerlassen(): void {
      warteAufStart = false;
      if (mp.status.rolle === "client") mp.verlassen();
      neuZeichnen();
    },
    /** Zustand nach dem Beitritt */
    sitzung() {
      const s = mp.status;
      const st = store.settings;
      const host = mp.spieler.find((p) => p.host);
      const fg = funkgruppe(st.funkgruppe);
      const t = sim.state.zeit;
      const w = sim.state.wetter;
      const ja = (b: boolean | undefined, std = true) => ((b ?? std) ? "Ein" : "Aus");
      const arten = [st.rdAktiv !== false ? "RD" : "", st.ktAktiv !== false ? "KT" : "", st.sekAktiv !== false ? "SEK" : "", st.acnAktiv !== false ? "ACN" : ""].filter(Boolean).join(" · ") || "keine";
      const wetter = st.wetterAktiv === false ? "aus" : st.wetterEcht ? "Echt" : (st.wetterWechsel ?? 50) <= 0 ? "Fest" : (st.wetterWechsel ?? 50) >= 70 ? "Wechselhaft" : "Simuliert";
      const ich = mp.spieler.find((p) => p.pid === mp.ich.pid);
      const rechte = { ...STANDARD_RECHTE, ...(ich?.rechte ?? {}) } as Record<Berechtigung, boolean>;
      return {
        verbunden: s.verbunden,
        hostDa: !!s.hostDa,
        laeuft: !!s.hostDa && !sim.state.lobby,
        host: host?.name ?? "–",
        funkgruppe: fg.id,
        bezirke: fg.bezirke,
        fgId: fg.id,
        spielzeit: t ? `${zeit(t)} · ${tageszeit(t)}` : "–",
        wetterJetzt: w ? String(WETTER_LABEL[w.lage as keyof typeof WETTER_LABEL] ?? w.lage) : "–",
        einstellungen: [
          ["Aufkommen", { realistisch: "Realistisch", stressig: "Stressig" }[st.aufkommenStufe as string] ?? "Standard"],
          ["Einsatzarten", arten],
          ["Wetter", wetter + (w && st.wetterAktiv !== false ? ` · ${WETTER_LABEL[w.lage as keyof typeof WETTER_LABEL] ?? ""}` : "")],
          ["Jahreszeit", { auto: "nach Datum", fruehling: "Frühling", sommer: "Sommer", herbst: "Herbst", winter: "Winter" }[st.jahreszeit ?? "auto"] ?? "nach Datum"],
          ["Als Notruf", ja(st.anrufe, false)],
          ["Anrufer-KI", { frei: "Jeder selbst", gemini: "Alle Gemini", lokal: "Alle lokal" }[st.kiRegel ?? "frei"]],
          ["Einsatzcodes", "LeitWerk"],
          ["Quelle", st.generatorQuelle === "vorlagen" ? "Vorlagen" : "Zufällig"],
          ["Komplikationen", { ruhig: "Ruhig", normal: "Normal", fordernd: "Fordernd" }[st.komplikationen ?? "normal"]],
          ["Falsche Adresse", `${st.falscheAdresseProzent ?? 0} %`],
          ["Rückruf ohne Nr.", ja(st.rueckrufOhneNummer, false)],
          ["Revers", { normal: "Normal", selten: "Selten", aus: "Aus" }[st.revers ?? "normal"]],
          ["Rendezvous", ja(st.rendezvous)],
          ["Toleranz", `${st.toleranzMin} min`],
          ["Sondersignal", `× ${String(st.sondersignalFaktor).replace(".", ",")}`],
          ["Nachbarzonen", ja(st.fremdzoneAktiv, false)],
          ["KH-Belegung", st.khGrundAktiv === false ? "Aus" : `${Math.round((st.khGrundFaktor ?? 1) * 100)} %`],
          ["Zeitraffer bei Notruf", st.tempoBeiNotruf === false ? "bleibt" : "auf 1×"],
        ] as [string, string][],
        rechte,
      };
    },
    /** Wird gerufen, wenn der Host die Lobby schließt, in der man wartet */
    onHostZu(f: () => void): void {
      beiHostZu = f;
    },
    /** Disponent: in ein laufendes Spiel → Menü weg; in eine wartende Lobby → warten, bis der Host startet */
    alsDisponentRein(): "drin" | "wartet" {
      if (mp.status.hostDa && !sim.state.lobby) {
        insSpiel();
        return "drin";
      }
      warteAufStart = true;
      return "wartet";
    },

    // ------------------------------------------------ Pilot
    helis() {
      const ich = mp.ich.pid;
      const letzter = letzterHeli();
      return Object.values(sim.state.fahrzeuge)
        .filter((x) => fliegt(x) && !x.ersatzFuer)
        .map((fz) => {
          const grund = sim.pilotHindernis(fz, ich);
          const hind = sim.flugHindernis(fz);
          return { id: fz.id, name: fz.kurzname || fz.funkrufname, base: fz.stationName ?? "", nacht: !!fz.nachtflug, grund: grund ?? "", hind: hind ?? "", letzter: fz.id === letzter };
        })
        .sort((a, b) => Number(!!a.grund) - Number(!!b.grund) || a.name.localeCompare(b.name, "de"));
    },
    async pilotTest(name: string): Promise<string | null> {
      try {
        if (mp.status.rolle === "host") return "Du bist gerade Host eines Spiels – zuerst die Lobby schließen";
        if (mp.status.rolle === "client") mp.verlassen();
        if (name.trim()) mp.setName(name);
        await Promise.race([spielstand.jetztSichern().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))]);
        sim.pilotTestStarten({ pid: mp.ich.pid, name: mp.ich.name });
        neuZeichnen();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    async pilotRein(heliId: string | null): Promise<string | null> {
      try {
        if (heliId) {
          await sim.call("pilotUebernehmen", heliId);
          sim.pilotTestGebiet(heliId);
          merkeHeli(heliId);
        }
        pilotOeffnen();
        insSpiel();
        return null;
      } catch (e) {
        return fehlerText(e);
      }
    },
    pilotWartet: () => mp.status.rolle === "client" && !!sim.state.lobby,
    /** Einrichtung für MSFS und X-Plane: wie viel offen ist, Fenster öffnen */
    einrichtung: () => einrichtungOffen(),
    einrichtungZeigen: () => einrichtungDialog(),

    // ------------------------------------------------ Update
    update() {
      const u = updateInfo();
      if (updLaden) return { zustand: updLaden.done >= updLaden.total && updLaden.total > 0 ? "fertig" : "laedt", version: u?.version ?? "", done: updLaden.done, total: updLaden.total, fehler: updFehler };
      if (u) return { zustand: "verfuegbar", version: u.version, done: 0, total: 0, fehler: updFehler };
      return { zustand: "aktuell", version, done: 0, total: 0, fehler: updFehler };
    },
    async updateLaden(): Promise<void> {
      if (updLaden) return;
      updLaden = { done: 0, total: 0 };
      updFehler = "";
      neuZeichnen();
      try {
        // vorher sichern, falls ein Spiel lief
        await spielstand.jetztSichern().catch(() => undefined);
        await installUpdate((p) => {
          updLaden = { done: p.done, total: p.total };
          neuZeichnen();
        });
      } catch (e) {
        updFehler = fehlerText(e) || "Unbekannter Fehler";
        // Mac: Programm läuft nicht aus „Programme“ (z. B. direkt aus dem DMG oder Downloads) → kann sich nicht selbst ersetzen
        if (/read-only|os error 30|permission denied|os error 13|operation not permitted/i.test(updFehler))
          updFehler += " – LeitWerk bitte in den Ordner „Programme“ ziehen, von dort starten und erneut versuchen.";
        console.warn("Update", e);
        updLaden = null;
        neuZeichnen();
      }
    },
    version: () => version,

    // ------------------------------------------------ Changelog, Fortschritt, Mithelfen
    changelog: () => UPDATES,
    fortschritt: () => fortschritt,
    hilfe: () => hilfe,
    tickets: () => meineTickets(),
    async ticket(art: TicketArt, titel: string, text: string, daten: Record<string, unknown>, hilfeId?: string): Promise<string | null> {
      const r = await ticketSchicken({ art, titel, text, daten, hilfeId, funkgruppe: store.settings.funkgruppe });
      if (r.ergebnis === "fehler") return "fehler" in r ? String((r as { fehler?: string }).fehler ?? "Senden fehlgeschlagen") : "Senden fehlgeschlagen";
      neuZeichnen();
      return null;
    },

    // ------------------------------------------------ Beenden
    async programmBeenden(): Promise<boolean> {
      if (!inTauri()) return false;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type Ablauf = ReturnType<typeof ablaufBauen>;
