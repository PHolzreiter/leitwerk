/**
 * Das Funkgerät (TETRA-Bedienteil wie im RTW): Bild des Geräts, dahinter das Display.
 * Display: Netz, Ordner, Sprechgruppe, Status (Dispo: „Frei auf Wache“, Pilot: sein echter Status).
 * Spricht jemand, erscheint über dem Display ein Fenster mit seinem Rufnamen („Senden“ bzw. „Warten …“ beim eigenen).
 * Bedienbar ist nur das Steuerkreuz links/rechts: Sprechgruppe wechseln (wenn es eine Großeinsatz-Gruppe gibt).
 */
import geraetUrl from "../assets/funkgeraet.webp?url";
import { mp } from "../net/mehrspieler";
import { sim, type FunkGespraech } from "../sim/engine";
import { el, esc } from "./dom";
import { funkEmpfang, funkGruppenSetzen, funkPegel, funkSendeZustand, gsGruppeOffen, sprechGruppe } from "./sprechfunk";
import { istPilot } from "./pilot/modus";

/** Name der Sprechgruppe am Gerät („NÖ-03“ → „RD-NOE-03“; Großeinsatz: RD-NOE-09) */
export function gruppenName(kanal: "gs" | null): string {
  if (kanal === "gs") return "RD-NOE-09";
  const id = sim.funkgruppe().id.replace(/^N[ÖO]E?-?/i, "");
  return `RD-NOE-${id}`;
}

/** Status-Text des Piloten (Hubschrauber) */
function pilotStatus(): string {
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  if (!heli) return "Frei auf Wache";
  if (heli.status === "freiWache") return "Frei auf Wache";
  return sim.statusDef(heli.status).name;
}

/** Wer spricht gerade auf dem Kanal (Rufname), sonst leer */
function wenHoereIch(kanal: "gs" | null): string {
  const hoert = funkEmpfang();
  if (hoert) return hoert.von === "LEO" ? "LEO" : hoert.von;
  const s = sim.state.funkSendet;
  if (s && s.pid !== (sim.ich?.pid ?? mp.ich.pid)) return s.von;
  const jetzt = Date.now();
  const g = (sim.state.funkGespraeche ?? []).find((x: FunkGespraech) => x.status !== "ende" && (x.kanal ?? null) === kanal && (x.ausstehend || (x.sprichtBis ?? 0) > jetzt));
  if (!g) return "";
  return g.ausstehend?.von ?? [...g.sprueche].reverse().find((x) => x.von !== "LEO")?.von ?? g.funkname;
}

export function funkGeraetErstellen(opt: { nurKanal?: "gs" | null } = {}): { el: HTMLElement; refresh(): void } {
  const root = el("div", { class: "fg" });
  root.innerHTML = `
    <div class="fg-display">
      <div class="fg-status"><span class="fg-balken"><i></i><i></i><i></i><i></i></span><span class="fg-sym">⇣</span></div>
      <div class="fg-zeilen">
        <div class="fg-z">TETRA</div>
        <div class="fg-z">DISPOZONEN</div>
        <div class="fg-z fg-gruppe"><button type="button" class="fg-pfeil" data-r="-1" aria-label="Gruppe zurück">‹</button><span></span><button type="button" class="fg-pfeil" data-r="1" aria-label="Gruppe weiter">›</button></div>
        <div class="fg-z fg-stat"></div>
      </div>
      <div class="fg-seite"><span>KWlist</span><span class="fg-blatt">▤</span></div>
      <div class="fg-pop" hidden><div class="fg-pop-kopf"></div><div class="fg-pop-name"></div><div class="fg-pop-pegel"><span></span></div></div>
    </div>
    <img class="fg-bild" src="${geraetUrl}" alt="Funkgerät" draggable="false">
    <button type="button" class="fg-kreuz links" data-r="-1" title="Sprechgruppe wechseln"></button>
    <button type="button" class="fg-kreuz rechts" data-r="1" title="Sprechgruppe wechseln"></button>`;
  const gruppeEl = root.querySelector<HTMLElement>(".fg-gruppe span")!;
  const statEl = root.querySelector<HTMLElement>(".fg-stat")!;
  const pop = root.querySelector<HTMLElement>(".fg-pop")!;
  const popKopf = root.querySelector<HTMLElement>(".fg-pop-kopf")!;
  const popName = root.querySelector<HTMLElement>(".fg-pop-name")!;
  const popPegel = root.querySelector<HTMLElement>(".fg-pop-pegel span")!;

  /** Gruppe, in der gesprochen wird */
  const gruppe = (): "gs" | null => (opt.nurKanal !== undefined ? opt.nurKanal : sprechGruppe());
  const wechseln = () => {
    if (opt.nurKanal !== undefined || !gsGruppeOffen()) return;
    const neu = gruppe() === "gs" ? null : "gs";
    if (istPilot()) funkGruppenSetzen({ pilotSenden: neu === "gs" ? "gs" : "normal" });
    else funkGruppenSetzen({ senden: neu });
    refresh();
  };
  root.querySelectorAll<HTMLButtonElement>(".fg-kreuz, .fg-pfeil").forEach((b) => b.addEventListener("click", wechseln));

  function refresh(): void {
    const k = gruppe();
    const name = gruppenName(k);
    if (gruppeEl.textContent !== name) gruppeEl.textContent = name;
    const mehr = opt.nurKanal === undefined && gsGruppeOffen();
    root.classList.toggle("fg-mehr", mehr);
    const st = istPilot() ? pilotStatus() : "Frei auf Wache";
    if (statEl.textContent !== st) statEl.textContent = st;
    // Fenster über dem Display: wer spricht (bzw. ich sende / warte)
    const ich = funkSendeZustand();
    let kopf = "";
    let wer = "";
    if (ich?.art === "sendet") {
      kopf = "Senden";
      wer = name;
    } else if (ich?.art === "wartet") {
      kopf = "Warten …";
      wer = wenHoereIch(k) || name;
    } else {
      wer = wenHoereIch(k);
      if (wer) kopf = "Gruppenruf";
    }
    pop.hidden = !kopf;
    pop.classList.toggle("ich", ich?.art === "sendet");
    pop.classList.toggle("wartet", ich?.art === "wartet");
    if (popKopf.textContent !== kopf) popKopf.textContent = kopf;
    if (popName.innerHTML !== esc(wer)) popName.innerHTML = esc(wer);
    popPegel.style.width = ich?.art === "sendet" ? `${Math.min(100, Math.round(Math.sqrt(funkPegel()) * 260))}%` : "0";
  }
  refresh();
  return { el: root, refresh };
}
