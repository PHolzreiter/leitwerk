/**
 * Das Funkgerät (TETRA-Bedienteil wie im RTW): Bild des Geräts, dahinter das Display.
 * Display: Netz, Ordner, Sprechgruppe, Status (Dispo: „Frei auf Wache“, Pilot: sein echter Status).
 * Spricht jemand, erscheint über dem Display ein Fenster mit seinem Rufnamen („Senden“ bzw. „Warten …“ beim eigenen).
 * Bedienbar ist nur das Steuerkreuz links/rechts: Sprechgruppe wechseln (wenn es eine Großeinsatz-Gruppe gibt).
 */
import geraetUrl from "../assets/funkgeraet.webp?url";
import { mp } from "../net/mehrspieler";
import { sim, type FunkGespraech, type Sprechgruppe } from "../sim/engine";
import { el, esc } from "./dom";
import { funkEmpfang, funkPegel, funkSendeZustand, gruppeHoerbar, gsGruppeOffen, sprechGruppe, sprechGruppeWeiter } from "./sprechfunk";
import { istPilot } from "./pilot/modus";

/** Name der Sprechgruppe am Gerät („RD-NOE-03“; Großeinsatz RD-NOE-09 bzw. RD-NOE-10) */
export function gruppenName(kanal: Sprechgruppe): string {
  return sim.sprechgruppeName(kanal);
}

/** Status-Text des Piloten (Hubschrauber) */
function pilotStatus(): string {
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  if (!heli) return "Frei auf Wache";
  if (heli.status === "freiWache") return "Frei auf Wache";
  return sim.statusDef(heli.status).name;
}

/** Wer spricht gerade auf dieser Gruppe (Rufname), sonst leer */
function wenHoereIch(kanal: Sprechgruppe): string {
  const hoert = funkEmpfang(kanal);
  if (hoert) return hoert.von === "LEO" ? "LEO" : hoert.von;
  const s = sim.state.funkSendet;
  if (s && s.pid !== (sim.ich?.pid ?? mp.ich.pid) && (s.gruppe ?? null) === kanal) return s.von;
  const jetzt = Date.now();
  const g = (sim.state.funkGespraeche ?? []).find((x: FunkGespraech) => x.status !== "ende" && (x.kanal ?? null) === kanal && (x.ausstehend || (x.sprichtBis ?? 0) > jetzt));
  if (!g) return "";
  return g.ausstehend?.von ?? [...g.sprueche].reverse().find((x) => x.von !== "LEO")?.von ?? g.funkname;
}

export function funkGeraetErstellen(): { el: HTMLElement; refresh(): void } {
  const root = el("div", { class: "fg" });
  root.innerHTML = `
    <div class="fg-display">
      <div class="fg-status"><span class="fg-balken"><i></i><i></i><i></i><i></i></span><span class="fg-sym">⇣</span></div>
      <div class="fg-zeilen">
        <div class="fg-z">TETRA</div>
        <div class="fg-z">DISPOZONEN</div>
        <div class="fg-z fg-gruppe"><button type="button" class="fg-pfeil" data-r="-1" aria-label="Gruppe zurück">‹</button><span></span><button type="button" class="fg-pfeil" data-r="1" aria-label="Gruppe weiter">›</button><i class="fg-lampe" title="In einer anderen Gruppe wird gerade gefunkt"></i></div>
        <div class="fg-z fg-stat"></div>
      </div>
      <div class="fg-seite"><span>KWlist</span><span class="fg-blatt">▤</span></div>
      <div class="fg-pop" hidden><div class="fg-pop-kopf"></div><div class="fg-pop-name"></div><div class="fg-pop-pegel"><span></span></div><div class="fg-pop-neben"></div></div>
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
  const popNeben = root.querySelector<HTMLElement>(".fg-pop-neben")!;
  const lampe = root.querySelector<HTMLElement>(".fg-lampe")!;

  /** Gruppe, in der gesprochen wird */
  const gruppe = (): Sprechgruppe => sprechGruppe();
  root.querySelectorAll<HTMLButtonElement>(".fg-kreuz, .fg-pfeil").forEach((b) =>
    b.addEventListener("click", () => {
      sprechGruppeWeiter(b.dataset.r === "-1" ? -1 : 1);
      refresh();
    }),
  );

  function refresh(): void {
    const k = gruppe();
    const name = gruppenName(k);
    if (gruppeEl.textContent !== name) gruppeEl.textContent = name;
    const mehr = gsGruppeOffen();
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
    // was in den anderen Gruppen gerade gefunkt wird (kleiner darunter, Lampe neben der Gruppe)
    const neben = sim
      .offeneGruppen()
      .filter((x) => x !== k && gruppeHoerbar(x))
      .map((x) => [x, wenHoereIch(x)] as const)
      .filter(([, w]) => !!w)
      .map(([x, w]) => `${gruppenName(x).slice(-2)}: ${w}`);
    lampe.classList.toggle("an", neben.length > 0);
    if (!kopf && neben.length) {
      kopf = "Gruppenruf";
      wer = "";
    }
    const nebenText = neben.join(" · ");
    if (popNeben.textContent !== nebenText) popNeben.textContent = nebenText;
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
