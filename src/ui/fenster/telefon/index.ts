/**
 * Telefon-Fenster nach dem Entwurf „Telefon“: nur zum Zurückrufen und Anrufen (angenommen wird in der Abfrage).
 * Oben die Suche, darunter „Alle · Verpasst · Angenommen“ und „Alle · RD · KT · SEK“; Abschnitte Verpasst
 * (Zurückrufen) und Angenommen (erneut anrufen). Läuft ein Rückruf: Balken mit „Zur Abfrage“.
 */
import vorlage from "./vorlage.html?raw";
import css from "./telefon.css?raw";
import { TelefonLogik } from "./logik.js";
import { entwurfEinbinden } from "../../entwurf/einbinden";
import { nachKlick } from "../../../klick";
import { store } from "../../../data/store";
import { mp } from "../../../net/mehrspieler";
import { sim, type Anruf } from "../../../sim/engine";
import { istUeberstellung, ktCode } from "../../../sim/ktCodes";
import { nummerAus } from "../../../sim/rufnummer";
import { el } from "../../dom";
import { aufloesungHtml } from "../../panels/notrufAbfrage";
import { angezeigteNummer, anrufAnnehmen, istMeins } from "../../panels/telefon";
import { panelZeigen, type PanelInstanz, type PanelKontext } from "../../ws/arbeitsplatz";
import { auswahl, onAuswahl, waehle } from "../../ws/auswahl";

type ArtT = "notruf" | "kt" | "sek";
interface TelZeile {
  id: string;
  art: ArtT;
  rd: boolean;
  tel: string;
  s: "verpasst" | "beendet" | "laeuft";
  vorher?: "verpasst" | "beendet";
  rueckruf: boolean;
  wer: string;
  versuche: number;
  ohneNummer: boolean;
  zeile: string;
  dauer: string;
  suche: string;
  mitAufl: boolean;
  zeit: number;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function hm(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}
function beginn(a: Anruf): number {
  const m = a.gespraech.find((x) => x.von === "system" && /angenommen|Rückruf/i.test(x.text)) ?? a.gespraech[0];
  return m?.zeit ?? a.seit;
}

/** Ende des ersten Gesprächs (für „12:35 · 4:40 min“) */
function ende(a: Anruf): number {
  const m = a.gespraech.find((x) => x.von === "system" && /beendet|aufgelegt/i.test(x.text));
  return m?.zeit ?? a.seit;
}

/** Läuft ein Rückruf bzw. Gespräch bei mir, das aus Verpasst/Angenommen kommt? */
function laeuftBeiMir(a: Anruf): boolean {
  return (a.status === "aktiv" || a.status === "gehalten") && !!a.angenommenVon && istMeins(a) && a.rueckruf;
}

/** Woher ein laufender Rückruf kommt (Verpasst oder Angenommen) – damit die Zeile im Abschnitt bleibt */
const vorherStatus = new Map<string, "verpasst" | "beendet">();

function zeilen(): TelZeile[] {
  const t = sim.state.zeit;
  const l: TelZeile[] = [];
  const darfOhne = !!sim.settings.rueckrufOhneNummer;
  for (const e of sim.state.einsaetze) {
    const a = e.anruf;
    if (!a) continue;
    const laeuft = laeuftBeiMir(a);
    if (a.status !== "verpasst" && a.status !== "beendet" && !laeuft) continue;
    const c = e.code ? store.schema?.codes[e.code] : null;
    const tel = angezeigteNummer(e);
    const was = [e.code, c?.name?.split(" – ")[0]].filter(Boolean).join(" ");
    const ort = e.adresse?.label ?? (a.status === "verpasst" ? "noch kein Ort" : "");
    const s: TelZeile["s"] = laeuft ? "laeuft" : (a.status as "verpasst" | "beendet");
    const vorher = laeuft ? (vorherStatus.get(e.id) ?? "beendet") : undefined;
    l.push({
      id: e.id,
      art: "notruf",
      rd: true,
      tel,
      s,
      vorher,
      rueckruf: a.rueckruf,
      wer: a.angenommenVon?.name ?? "",
      versuche: a.versuche,
      ohneNummer: !e.telefon && !darfOhne,
      zeile: [`Einsatz ${e.nummer}`, was, ort].filter(Boolean).join(" · "),
      dauer: s === "verpasst" ? `vor ${mmss(t - a.seit)}${a.rueckrufUm ? ` · ruft in ca. ${Math.max(1, Math.round((a.rueckrufUm - t) / 60_000))} min wieder an` : ""}` : s === "laeuft" ? mmss(t - a.seit) : `${hm(beginn(a))} · ${mmss(ende(a) - beginn(a))} min`,
      suche: [tel, e.nummer, `einsatz ${e.nummer}`, e.code, c?.name, ort, "notruf 144", "rd"].filter(Boolean).join(" ").toLowerCase(),
      mitAufl: s === "beendet" && !!e.wahr.abfrage,
      zeit: a.seit,
    });
  }
  for (const k of sim.state.kt ?? []) {
    const a = k.anruf;
    if (!a) continue;
    const laeuft = laeuftBeiMir(a);
    if (a.status !== "verpasst" && a.status !== "beendet" && !laeuft) continue;
    const sek = istUeberstellung(k.d) || !!k.wahr?.d?.sek;
    const tel = k.wahr?.d?.telefon || nummerAus(k.id, false);
    const s: TelZeile["s"] = laeuft ? "laeuft" : (a.status as "verpasst" | "beendet");
    const name = k.d.patient.name;
    const was = [k.d.code, k.d.grund || (k.d.code ? ktCode(k.d.code)?.name : "")].filter(Boolean).join(" ");
    const ort = k.d.von || k.d.nach ? `${k.d.von?.label ?? "?"} → ${k.d.nach?.label ?? "?"}` : a.status === "verpasst" ? "noch kein Auftrag" : "";
    l.push({
      id: k.id,
      art: sek ? "sek" : "kt",
      rd: false,
      tel,
      s,
      vorher: laeuft ? (vorherStatus.get(k.id) ?? "beendet") : undefined,
      rueckruf: a.rueckruf,
      wer: a.angenommenVon?.name ?? "",
      versuche: a.versuche,
      ohneNummer: !k.d.telefon && !darfOhne,
      zeile: [name || `Auftrag ${k.nummer}`, was, ort].filter(Boolean).join(" · "),
      dauer: s === "verpasst" ? `vor ${mmss(t - a.seit)}${a.rueckrufUm ? ` · ruft in ca. ${Math.max(1, Math.round((a.rueckrufUm - t) / 60_000))} min wieder an` : ""}` : s === "laeuft" ? mmss(t - a.seit) : `${hm(beginn(a))} · ${mmss(ende(a) - beginn(a))} min`,
      suche: [tel, name, k.nummer, `auftrag ${k.nummer}`, k.d.code, k.d.grund, ort, sek ? "überstellung sek" : "kt-hotline kt"].filter(Boolean).join(" ").toLowerCase(),
      mitAufl: false,
      zeit: a.seit,
    });
  }
  // neueste zuerst; verpasste nach Eingang
  return l.sort((a, b) => b.zeit - a.zeit);
}

export function telefonFenster(ctx: PanelKontext): PanelInstanz {
  const root = el("div", { class: "pl telefon-ew" });
  root.style.cssText = "height:100%;min-height:0";
  const app = {
    anrufe: () => zeilen(),
    auswahl: () => auswahl().id ?? "",
    rufe: (id: string) => {
      const rd = !!sim.einsatz(id);
      const a = rd ? sim.einsatz(id)?.anruf : sim.ktAuftrag(id)?.anruf;
      if (a?.status === "verpasst" || a?.status === "beendet") vorherStatus.set(id, a.status);
      void anrufAnnehmen(rd ? "rd" : "kt", id);
    },
    oeffnen: (id: string) => waehle(sim.einsatz(id) ? "einsatz" : "kt", id, { maske: false }),
    zurAbfrage: () => panelZeigen("abfrage"),
  };
  const f = entwurfEinbinden(root, "telefon", vorlage, css, (p) => new TelefonLogik(p), { app });
  const k = f.k;
  const innen = k._zeichnen!;
  k._zeichnen = () => {
    innen();
    // Auflösung (Notruf): HTML aus der Abfrage-Auswertung
    for (const [id, r] of k.auflRefs) {
      const ziel = r.current;
      if (!ziel || !ziel.isConnected) continue;
      if (ziel.dataset.fertig === id) continue;
      const e = sim.einsatz(id);
      ziel.innerHTML = e ? aufloesungHtml(e) : "";
      ziel.dataset.fertig = id;
    }
    const n = k._nVerp ?? 0;
    ctx.setzeBadge(n || null, "warn");
  };
  const zeichnen = () => k._zeichnen?.();
  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      zeichnen();
    }, 250);
  };
  const uhr = window.setInterval(() => nachKlick(zeichnen), 1000);
  const aus = [sim.onChange(spaeter), onAuswahl(() => zeichnen()), mp.onChange(spaeter)];
  zeichnen();
  return {
    el: root,
    dispose: () => {
      window.clearInterval(uhr);
      aus.forEach((x) => x());
      f.entfernen();
    },
  };
}
