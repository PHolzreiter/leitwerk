/**
 * Das Funkgerät (TETRA-Bedienteil wie im RTW): Bild des Geräts, dahinter das Display.
 * Display: Netz, Ordner, Sprechgruppe, Status (Dispo: „Frei auf Wache“, Pilot: sein echter Status).
 * Spricht jemand, erscheint im Display „Gruppe aktiv“ mit seiner ID („ID: 75001“, Leitstelle 80000) und der Gruppe;
 * rechts stehen dann „Option“ und „Ordner“ (beim eigenen Spruch „Senden“ bzw. „Warten …“).
 * Bedienbar ist nur das Steuerkreuz links/rechts: Sprechgruppe wechseln (eigene, 09, 10).
 */
import geraetUrl from "../assets/funkgeraet.webp?url";
import { mp } from "../net/mehrspieler";
import { sim, type FunkGespraech, type Sprechgruppe } from "../sim/engine";
import { el, esc } from "./dom";
import { funkEmpfang, funkPegel, funkSendeZustand, funkUnterbrochen, gruppeHoerbar, sprechGruppe, sprechGruppeWeiter } from "./sprechfunk";
import { istPilot } from "./pilot/modus";

/** Name der Sprechgruppe am Gerät („RD-NOE-03“; Großeinsatz RD-NOE-09 bzw. RD-NOE-10) */
export function gruppenName(kanal: Sprechgruppe): string {
  return sim.sprechgruppeName(kanal);
}

/** Status-Text des Piloten (Hubschrauber) */
export function pilotStatus(): string {
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  if (!heli) return "Frei auf Wache";
  if (heli.status === "freiWache") return "Frei auf Wache";
  return sim.statusDef(heli.status).name;
}

/** Wer spricht gerade auf dieser Gruppe (Rufname), sonst leer */
export function wenHoereIch(kanal: Sprechgruppe): string {
  const hoert = funkEmpfang(kanal);
  if (hoert) return hoert.von === "LEO" ? "LEO" : hoert.von;
  const s = sim.state.funkSendet;
  if (s && s.pid !== (sim.ich?.pid ?? mp.ich.pid) && (s.gruppe ?? null) === kanal) return s.von;
  const jetzt = Date.now();
  const g = (sim.state.funkGespraeche ?? []).find((x: FunkGespraech) => x.status !== "ende" && (x.kanal ?? null) === kanal && (x.ausstehend || (x.sprichtBis ?? 0) > jetzt));
  if (!g) return "";
  return g.ausstehend?.von ?? [...g.sprueche].reverse().find((x) => x.von !== "LEO")?.von ?? g.funkname;
}

/** Kennung der Leitstelle am Funkgerät (vorläufig) */
export const LEO_ID = "80000";

/** eigener Rufname (Pilot: sein Hubschrauber) */
export function eigenerName(): string {
  const heli = sim.pilotVon(sim.ich?.pid ?? mp.ich.pid);
  return heli ? sim.rufname(heli) : "LEO";
}

/** Geräte-ID wie am Display („ID: 75001“): Ziffern des Funkrufnamens, Leitstelle 80000 */
export function geraetId(rufname: string): string {
  if (!rufname || /^leo\b/i.test(rufname)) return LEO_ID;
  const fz = Object.values(sim.state.fahrzeuge).find((f) => f.funkrufname === rufname || sim.rufname(f) === rufname || f.kurzname === rufname);
  const quelle = fz?.funkrufname ?? rufname;
  const ziffern = quelle.replace(/\D/g, "");
  return ziffern || quelle;
}

export function funkGeraetErstellen(): { el: HTMLElement; refresh(): void } {
  const root = el("div", { class: "fg" });
  root.innerHTML = `
    <div class="fg-display">
      <div class="fg-status"><span class="fg-balken"><i></i><i></i><i></i><i></i></span><span class="fg-sym">⇣</span></div>
      <div class="fg-zeilen">
        <div class="fg-z">TETRA</div>
        <div class="fg-z">BOS</div>
        <div class="fg-z fg-gruppe"><button type="button" class="fg-pfeil" data-r="-1" aria-label="Gruppe zurück">‹</button><span></span><button type="button" class="fg-pfeil" data-r="1" aria-label="Gruppe weiter">›</button><i class="fg-lampe" title="In einer anderen Gruppe wird gerade gefunkt"></i></div>
        <div class="fg-z fg-stat"></div>
      </div>
      <div class="fg-seite"><span class="fg-seite-o">KWlist</span><span class="fg-blatt">▤</span></div>
      <div class="fg-pop" hidden><div class="fg-pop-kopf"></div><div class="fg-pop-name"></div><div class="fg-pop-gruppe"></div><div class="fg-pop-pegel"><span></span></div><div class="fg-pop-neben"></div></div>
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
  const popGruppe = root.querySelector<HTMLElement>(".fg-pop-gruppe")!;
  const seiteO = root.querySelector<HTMLElement>(".fg-seite-o")!;
  const blatt = root.querySelector<HTMLElement>(".fg-blatt")!;

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
    // Steuerkreuz: immer eigene Gruppe, 09 und 10
    root.classList.toggle("fg-mehr", true);
    const st = istPilot() ? pilotStatus() : "Frei auf Wache";
    if (statEl.textContent !== st) statEl.textContent = st;
    // Fenster über dem Display: wer spricht (bzw. ich sende / warte)
    const ich = funkSendeZustand();
    let kopf = "";
    let wer = "";
    const weg = funkUnterbrochen();
    if (!ich && weg) {
      kopf = "Unterbrochen";
      wer = weg;
    } else if (ich?.art === "sendet") {
      kopf = "Senden";
      wer = `ID: ${geraetId(istPilot() ? eigenerName() : "LEO")}`;
    } else if (ich?.art === "wartet") {
      kopf = "Warten …";
      const w = wenHoereIch(k);
      wer = w ? `ID: ${geraetId(w)}` : "";
    } else {
      const w = wenHoereIch(k);
      if (w) {
        kopf = "Gruppe aktiv";
        wer = `ID: ${geraetId(w)}`;
      }
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
      kopf = "Gruppe aktiv";
      wer = "";
    }
    // wie am Gerät: im Fenster unten die Sprechgruppe, rechts „Option“ und „Ordner“
    const gText = kopf && (wer || ich) ? name : "";
    if (popGruppe.textContent !== gText) popGruppe.textContent = gText;
    const o = kopf ? "Option" : "KWlist";
    if (seiteO.textContent !== o) seiteO.textContent = o;
    const bl = kopf ? "Ordner" : "▤";
    if (blatt.textContent !== bl) blatt.textContent = bl;
    const nebenText = neben.join(" · ");
    if (popNeben.textContent !== nebenText) popNeben.textContent = nebenText;
    pop.hidden = !kopf;
    root.classList.toggle("fg-aktiv", !!kopf);
    pop.classList.toggle("ich", ich?.art === "sendet");
    pop.classList.toggle("wartet", ich?.art === "wartet");
    if (popKopf.textContent !== kopf) popKopf.textContent = kopf;
    if (popName.innerHTML !== esc(wer)) popName.innerHTML = esc(wer);
    popPegel.style.width = ich?.art === "sendet" ? `${Math.min(100, Math.round(Math.sqrt(funkPegel()) * 260))}%` : "0";
  }
  refresh();
  return { el: root, refresh };
}
