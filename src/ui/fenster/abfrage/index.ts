/**
 * Abfrage-Fenster (Notruf- und KT-Abfrage) nach dem Entwurf „Abfrage“:
 * Anrufleiste | Gespräch | Abfrage-Schema. Vor dem Abheben stehen die Anrufe groß und mittig, danach in der
 * schmalen Leiste links; daneben die Abfrage Frage für Frage, das Gespräch mit dem Anrufer und die Hinweise für
 * die Besatzung. Daten und Aktionen kommen aus dem Spiel (daten.ts).
 */
import vorlage from "./vorlage.html?raw";
import css from "./abfrage.css?raw";
import { AbfrageLogik } from "./logik.js";
import { abfrageNachbearbeiten, anrufListe, beiNachbearbeitung, beiSuchErgebnis, gespraechZu, nachbearbeitung, nehmeIchAn, type AnrufVM, type GespraechVM } from "./daten";
import { entwurfEinbinden } from "../../entwurf/einbinden";
import { nachKlick } from "../../../klick";
import { mikroAnbinden } from "../../sprache";
import { fragen, antwortetGerade, liveSprechStrom } from "../../../abfrage/gespraech";
import { ktAntwortetGerade } from "../../../abfrage/ktGespraech";
import { mp } from "../../../net/mehrspieler";
import { sim } from "../../../sim/engine";
import { el, toast } from "../../dom";
import { ktFrageStellen } from "../../ktView";
import { liveSammler, onLive } from "../../panels/live";
import { istGespraechsfuehrer } from "../../panels/notrufAbfrage";
import { anrufAnnehmen, anrufAuflegen, anrufHalten } from "../../panels/telefon";
import { onPers, setzePers } from "../../ws/persoenlich";
import type { PanelKontext, PanelInstanz } from "../../ws/arbeitsplatz";

const HINWEIS_NOTRUF =
  "Notruf 144, Rettungsdienst. Wo genau ist der Notfallort? Ist der Patient wach? Atmet er normal? Krems, Tulln, Hollabrunn, Klosterneuburg, Langenlois, Stockerau, Gföhl, Mautern, Herzogenburg, Ziersdorf, Retz. Bewusstlos, Atemnot, Brustschmerzen, Rettungswagen, Notarzt.";
const HINWEIS_KT = "Krankentransport, Überstellung. Abholung, Termin, Station, Liegend, Sitzend, Tragsessel, Krems, Tulln, Hollabrunn, Klosterneuburg.";

/** Stumm (Vorbereitung für Sprache): nur Anzeige, gilt für dieses Fenster */
let stumm = false;

/** Eigene Frage an den Anrufer: Textzeile + Mikrofon (wird in die Vorlage eingehängt) */
function frageZeile(id: string, art: "rd" | "kt", neu: () => void): HTMLElement {
  const box = el("form", { class: "abf-frag" });
  box.style.cssText = "display:flex;gap:6px;flex:1;min-width:0";
  const eingabe = el("input", { type: "text", class: "feld", placeholder: "Eigene Frage an den Anrufer … (Enter)", "aria-label": "Eigene Frage an den Anrufer" }) as HTMLInputElement;
  const ich = () => {
    if (art === "rd") {
      const e = sim.einsatz(id);
      return !!e && istGespraechsfuehrer(e) && e.anruf?.status === "aktiv";
    }
    const k = sim.ktAuftrag(id);
    return !!k?.anruf && k.anruf.status === "aktiv" && !!k.anruf.angenommenVon && (sim.mode === "solo" || k.anruf.angenommenVon.pid === (sim.ich?.pid ?? mp.ich.pid));
  };
  const stelle = async (text: string) => {
    if (art === "rd") {
      const e = sim.einsatz(id);
      if (!e) return;
      const l = liveSammler(id);
      try {
        await fragen(e, text, undefined, l.onToken);
      } catch (err) {
        toast(String((err as Error).message ?? err), "error");
      }
      l.fertig();
    } else {
      const k = sim.ktAuftrag(id);
      if (k) await ktFrageStellen(k, text);
    }
    neu();
  };
  box.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t || !ich()) return;
    eingabe.value = "";
    void stelle(t);
  });
  const mik = mikroAnbinden({
    input: eingabe,
    rang: art === "rd" ? 1 : 2,
    aktiv: ich,
    senden: () => box.requestSubmit(),
    hinweis: () => (art === "rd" ? HINWEIS_NOTRUF : HINWEIS_KT),
    // Cloud-Anrufer (Notruf): die Stimme geht direkt an den Anrufer (Mitschrift kommt zurück)
    live:
      art === "rd"
        ? () => {
            const e = sim.einsatz(id);
            if (!e || !ich()) return null;
            const l = liveSammler(id);
            const st = liveSprechStrom(e, l.onToken, () => {
              l.fertig();
              neu();
            });
            if (!st) l.fertig();
            return st;
          }
        : undefined,
  });
  mik.innerHTML = `<svg class="ic s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"></path><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg>`;
  mik.setAttribute("aria-label", "Sprechen");
  box.append(eingabe, mik);
  (box as unknown as { _feld: HTMLInputElement })._feld = eingabe;
  return box;
}

export function abfrageFenster(ctx: PanelKontext): PanelInstanz {
  const root = el("div", { class: "pl abfrage-ew" });
  root.style.cssText = "height:100%;min-height:0";
  let zeichnen = () => {};
  let lb = Number(ctx.params.lb) || 0;
  // Gespräch dieses Renders (für die Zeile „eigene Frage“)
  let zuletzt: GespraechVM | null = null;

  const app = {
    anrufe: (): AnrufVM[] => anrufListe(),
    gespraech: (id: string): GespraechVM | null => (zuletzt = gespraechZu(id)),
    filter: () => ({ RD: nehmeIchAn("notruf"), KT: nehmeIchAn("kt"), SEK: nehmeIchAn("sek") }),
    filterSetzen: (k: "RD" | "KT" | "SEK", v: boolean) => setzePers(k === "RD" ? { notrufe: v } : k === "KT" ? { ktHotline: v } : { ueberstellungen: v }),
    abheben: (id: string) => {
      const x = anrufListe().find((y) => y.id === id);
      void anrufAnnehmen(x?.art === "notruf" ? "rd" : "kt", id).then(() => fokusNachAbheben());
    },
    halten: (id: string) => {
      const x = anrufListe().find((y) => y.id === id);
      if (x?.nach) return;
      anrufHalten(x?.art === "notruf" ? "rd" : "kt", id);
    },
    auflegen: (id: string) => {
      const x = anrufListe().find((y) => y.id === id);
      // Nachbearbeitung: „Fertig“ schließt sie
      if (x?.nach) return abfrageNachbearbeiten(null);
      anrufAuflegen(x?.art === "notruf" ? "rd" : "kt", id);
    },
    nachbearbeitung: () => nachbearbeitung()?.id ?? null,
    lb: () => lb,
    lbSetzen: (n: number) => {
      lb = n;
      ctx.setzeParams({ lb: n });
    },
    stumm: () => stumm,
    stummSetzen: (v: boolean) => {
      stumm = v;
      zeichnen();
    },
  };

  const f = entwurfEinbinden(root, "abfrage", vorlage, css, (p) => new AbfrageLogik(p), { app });
  const k = f.k;

  // Zeile „eigene Frage“ (Textfeld + Mikrofon) je Gespräch einhängen
  let frag: { id: string; el: HTMLElement } | null = null;
  const fragNachziehen = () => {
    const platz = k.fragRef.current;
    const g = zuletzt;
    if (!g || !platz) return;
    if (!frag || frag.id !== g.id) {
      frag?.el.remove();
      frag = { id: g.id, el: frageZeile(g.id, g.art === "notruf" ? "rd" : "kt", () => zeichnen()) };
    }
    if (frag.el.parentElement !== platz) platz.appendChild(frag.el);
    const feld = (frag.el as unknown as { _feld: HTMLInputElement })._feld;
    const wartet = g.art === "notruf" ? antwortetGerade(g.id) : ktAntwortetGerade(g.id);
    feld.disabled = !g.aktiv || wartet;
    platz.hidden = !g.darf;
  };

  // Gesprächsverlauf: unten bleiben, wenn man unten war
  let msgsN = -1;
  let msgsUnten = true;
  const msgsNachziehen = () => {
    const m = k.msgsRef.current;
    if (!m) return;
    const n = m.childElementCount + (m.lastElementChild?.textContent?.length ?? 0);
    if (n !== msgsN && msgsUnten) m.scrollTop = m.scrollHeight;
    msgsN = n;
  };
  root.addEventListener(
    "scroll",
    (ev) => {
      const m = k.msgsRef.current;
      if (m && ev.target === m) msgsUnten = m.scrollHeight - m.scrollTop - m.clientHeight < 40;
    },
    true,
  );

  // Fokus im Fenster halten: wird das fokussierte Element beim Neuzeichnen ersetzt (neue Frage), bleibt er im Fenster
  let drin = false;
  root.addEventListener("focusin", () => (drin = true));
  root.addEventListener("focusout", (ev) => {
    const nach = (ev as FocusEvent).relatedTarget as Node | null;
    if (nach && !root.contains(nach)) drin = false;
  });
  const fokusHalten = () => {
    if (!drin) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected && root.contains(a)) return;
    if (a && a !== document.body && a.isConnected) return void (drin = false);
    const ziel = root.querySelector<HTMLElement>(".f-eing") ?? root.querySelector<HTMLElement>("section.fe");
    ziel?.focus({ preventScroll: true });
  };

  const innen = k._zeichnen!;
  k._zeichnen = () => {
    innen();
    fokusHalten();
    fragNachziehen();
    msgsNachziehen();
    const l = anrufListe();
    const klingelt = l.filter((x) => x.s === "klingelt" && nehmeIchAn(x.art)).length;
    const meins = l.some((x) => x.mein && x.s === "aktiv");
    ctx.setzeBadge(klingelt || (meins ? "●" : null), "klingelt");
  };
  zeichnen = () => k._zeichnen?.();
  beiSuchErgebnis(() => zeichnen());

  /** nach dem Abheben: Fenster behält den Fokus (Tasten gehen gleich in die Abfrage) */
  function fokusNachAbheben(): void {
    setTimeout(() => {
      const sec = f.wurzel.querySelector<HTMLElement>("section.fe");
      if (sec && k._halteFokus) k._halteFokus(sec);
    }, 60);
  }

  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      zeichnen();
    }, 120);
  };
  const uhr = window.setInterval(() => nachKlick(zeichnen), 1000);
  const aus = [sim.onChange(spaeter), mp.onChange(spaeter), onPers(spaeter), onLive(() => spaeter()), beiNachbearbeitung(() => zeichnen())];
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
