/**
 * Fahrzeuge: „Alle Fahrzeuge“ (nach Dienststelle), „Aktive Fahrzeuge“ (alle, die nicht frei auf der Wache und nicht abgemeldet sind)
 * und „Statusänderungen“ (wer wann von welchem in welchen Status gewechselt hat).
 * Klick: auf der Karte zeigen und den Auftrag öffnen · Doppelklick: Kamera folgt · Rechtsklick: Status setzen.
 */
import { sim, type SimFahrzeug } from "../../sim/engine";
import { codeText } from "../../sim/ktCodes";
import { findCode } from "../../sim/codes";
import type { StatusKey } from "../../sim/settings";
import { el, esc } from "../dom";
import { registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { fahrzeugZeigen, karteZeigen, waehle } from "../ws/auswahl";
import { crewHtml, fzKlassen, statusChip, statusMenu, typHtml, dienstHtml } from "./teile";
import { funkgruppe, inFunkgruppe } from "../../sim/funkgruppen";
import { store } from "../../data/store";

// ---------------------------------------------------------------- Eigene Funkgruppe / alle

/** Wo gehört das Fahrzeug hin? „eigen“ = Dienststelle in der gespielten Funkgruppe (Hubschrauber immer),
 *  „aussen“ = von außen, aber gerade bei einem Einsatz in der eigenen Funkgruppe, sonst „fremd“ */
const heimCache = new Map<string, boolean>();
export function fzBereich(fz: SimFahrzeug): "eigen" | "aussen" | "fremd" {
  // Hubschrauber und ihr Ausweich-NEF am Stützpunkt immer
  if (fz.rmTyp === "NAH" || fz.rmTyp === "ITH" || fz.ersatzFuer) return "eigen";
  const g = funkgruppe(store.settings.funkgruppe);
  const k = `${g.id}|${fz.id}|${fz.heim.lat.toFixed(4)},${fz.heim.lon.toFixed(4)}`;
  let drin = heimCache.get(k);
  if (drin === undefined) {
    drin = inFunkgruppe(g, fz.heim.lat, fz.heim.lon);
    heimCache.set(k, drin);
  }
  if (drin) return "eigen";
  const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
  const ort = e?.wahr ?? e?.bo ?? null;
  if (ort && typeof ort.lat === "number" && inFunkgruppe(g, ort.lat, ort.lon)) return "aussen";
  return "fremd";
}

/** Schalter „NÖ-03 | Alle“ – startet immer auf der eigenen Funkgruppe (wird nicht gespeichert) */
function bereichSchalter(onChange: () => void): { el: HTMLElement; alle: () => boolean } {
  let alle = false;
  const box = el("div", { class: "seg fz-bereich", role: "group", title: "Nur Fahrzeuge der eigenen Funkgruppe oder alle zeigen (Hubschrauber immer; Fahrzeuge von außen im eigenen Einsatz mit Vermerk). Der Einsatzmittelvorschlag ist davon nicht betroffen." });
  const eigen = el("button", { type: "button", class: "active" }) as HTMLButtonElement;
  const alleB = el("button", { type: "button" }, "Alle") as HTMLButtonElement;
  const name = () => (eigen.textContent = funkgruppe(store.settings.funkgruppe).id);
  name();
  store.onChange(name);
  const setzen = (a: boolean) => {
    alle = a;
    eigen.classList.toggle("active", !a);
    alleB.classList.toggle("active", a);
    onChange();
  };
  eigen.addEventListener("click", () => setzen(false));
  alleB.addEventListener("click", () => setzen(true));
  box.append(eigen, alleB);
  return { el: box, alle: () => alle };
}
const aussenHtml = (fz: SimFahrzeug) => (fzBereich(fz) === "aussen" ? `<span class="fz-aussen" title="Dienststelle außerhalb der eigenen Funkgruppe – gerade bei einem Einsatz im eigenen Gebiet">von außen</span>` : "");

/** Ausweich-NEF des ÖAMTC am Hubschrauberstützpunkt */
function istOeamtcNef(f: SimFahrzeug): boolean {
  return f.rmTyp === "NEF" && (!!f.ersatzFuer || /ÖAMTC/i.test(f.typ ?? ""));
}

/** grobe Fahrzeuggruppen für den Filter */
const GRUPPEN: [string, string, (fz: SimFahrzeug) => boolean][] = [
  ["alle", "Alle", () => true],
  ["rtw", "RTW", (f) => f.rmTyp === "RTW" || f.rmTyp === "RTW-C"],
  ["nef", "NEF", (f) => f.rmTyp === "NEF" && !istOeamtcNef(f)],
  ["nef_oeamtc", "NEF ÖAMTC", (f) => istOeamtcNef(f)],
  ["nah", "Hubschrauber", (f) => f.rmTyp === "NAH" || f.rmTyp === "ITH"],
  ["s", "S-Fahrzeuge", (f) => ["SKTW", "SRTW", "SNAW", "BIT", "ITH"].includes(f.rmTyp)],
  ["el", "EL", (f) => f.rmTyp === "BEL" || f.rmTyp === "EL ÖBB"],
  ["acn", "ACN", (f) => f.rmTyp === "ACN"],
  ["kt", "KT", (f) => f.rmTyp === "KTW" || !!f.kt],
];

const PHASE_TEXT: Record<string, string> = {
  frei: "",
  ausruecken: "rückt aus",
  anfahrt: "Anfahrt",
  suche: "sucht den Einsatzort",
  vorOrt: "vor Ort",
  warteKH: "wartet auf KH",
  rendezvous: "fährt zum Treffpunkt",
  treffpunkt: "am Treffpunkt",
  transport: "Transport",
  uebergabe: "Übergabe",
  rueckfahrt: "Rückfahrt",
  routing: "plant Route",
  ktFahrt: "KT-Fahrt",
  ktHalt: "holt ab / übergibt",
};

function auftrag(fz: SimFahrzeug): string {
  if (fz.einsatzId) {
    const e = sim.einsatz(fz.einsatzId);
    if (e) {
      const c = findCode(e.code ?? undefined);
      return `<b>${esc(e.nummer)}</b> ${esc(c ? c.code : "")} <span class="muted">${esc(e.adresse?.label ?? "")}</span>`;
    }
  }
  if (fz.kt) {
    const ids = fz.kt.fahrten.flat();
    const k = ids.length ? sim.ktAuftrag(ids[0]) : undefined;
    if (k) return `<b>${esc(k.nummer)}</b> ${esc(codeText(k.d.code).split(" ")[0])} <span class="muted">${esc(k.d.von?.label ?? "")} → ${esc(k.d.nach?.label ?? "")}</span>${ids.length > 1 ? ` <span class="kt-fz">×${ids.length}</span>` : ""}`;
  }
  return "";
}

function eta(fz: SimFahrzeug): string {
  if (!fz.fahrt) return "";
  const rest = (fz.fahrt.start + fz.fahrt.dauer * 1000 - sim.state.zeit) / 60_000;
  return rest > 0 ? `${Math.max(1, Math.round(rest))} min` : "";
}

function klickVerhalten(row: HTMLElement, fz0: SimFahrzeug): void {
  // aktuelles Objekt holen (Zeilen werden wiederverwendet, im Multiplayer wird der Zustand ersetzt)
  const akt = () => sim.state.fahrzeuge[fz0.id] ?? fz0;
  row.addEventListener("click", () => {
    const fz = akt();
    karteZeigen(fz.lat, fz.lon, 13.5);
    fahrzeugZeigen(fz.id);
    if (fz.einsatzId) waehle("einsatz", fz.einsatzId, { karte: false });
    else if (fz.kt?.fahrten[0]?.[0]) waehle("kt", fz.kt.fahrten[0][0], { karte: false });
  });
  row.addEventListener("dblclick", () => fahrzeugZeigen(fz0.id, true));
  row.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    statusMenu(akt(), ev.clientX, ev.clientY);
  });
  row.title = "Klick: auf der Karte zeigen · Doppelklick: Kamera folgt · Rechtsklick: Status setzen";
}

function fahrzeugListe(ctx: PanelKontext, nurAktive: boolean) {
  const root = el("div", { class: `pl fz-fenster${nurAktive ? " aktive" : ""}` });
  const kopf = el("div", { class: "pl-kopf" });
  const chips = el("div", { class: "pl-chips" });
  const suche = el("input", { type: "search", class: "pl-suche", placeholder: "Fahrzeug, Funkrufname, Dienststelle …" });
  suche.dataset.fzSuche = "1";
  const werkzeug = el("div", { class: "pl-werkzeug" });
  const bereich = bereichSchalter(() => render());
  werkzeug.append(suche, bereich.el);
  kopf.append(chips, werkzeug);
  const liste = el("div", { class: "pl-body fz-liste" });
  root.append(kopf, liste);
  let gruppe = (ctx.params.gruppe as string) ?? "alle";
  let status = (ctx.params.status as string) ?? "alle";
  let elArt = (ctx.params.elArt as string) ?? "alle";
  const zu = new Set<string>((ctx.params.zu as string[]) ?? []);
  suche.addEventListener("input", () => render());

  const passt = (fz: SimFahrzeug, q: string) => {
    if (!GRUPPEN.find((g) => g[0] === gruppe)?.[2](fz)) return false;
    if (gruppe === "el" && elArt !== "alle" && fz.rmTyp !== elArt) return false;
    if (nurAktive && status !== "alle" && fz.status !== status) return false;
    if (!q) return true;
    return `${fz.funkrufname} ${fz.kurzname} ${fz.stationName} ${fz.rmTyp}`.toLowerCase().includes(q);
  };

  function chipsBauen(alle: SimFahrzeug[]): void {
    chips.innerHTML = "";
    for (const [id, label, f] of GRUPPEN) {
      const n = alle.filter(f).length;
      if (!n && id !== "alle") continue;
      const b = el("button", { class: `pl-chip${gruppe === id ? " active" : ""}` });
      b.innerHTML = `${label} <span class="n">${n}</span>`;
      b.addEventListener("click", () => {
        gruppe = id;
        ctx.setzeParams({ gruppe });
        render();
      });
      chips.appendChild(b);
    }
    if (gruppe === "el") {
      const sel = el("select", { class: "pl-select", title: "BEL oder EL ÖBB" });
      for (const [v, l] of [["alle", "BEL und EL ÖBB"], ["BEL", "nur BEL"], ["EL ÖBB", "nur EL ÖBB"]]) sel.appendChild(el("option", { value: v }, l));
      sel.value = elArt;
      sel.addEventListener("change", () => {
        elArt = sel.value;
        ctx.setzeParams({ elArt });
        render();
      });
      chips.appendChild(sel);
    }
    if (nurAktive) {
      const sel = el("select", { class: "pl-select", title: "Nach Status filtern" });
      sel.appendChild(el("option", { value: "alle" }, "jeder Status"));
      const da = new Set(alle.map((f) => f.status));
      for (const k of ["alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO", "zumZO", "amZO", "freiFunk", "dienstfahrt", "bereitschaft"] as StatusKey[]) {
        if (!da.has(k)) continue;
        const d = sim.statusDef(k);
        sel.appendChild(el("option", { value: k }, `${d.nummer} – ${d.name}`));
      }
      sel.value = da.has(status as StatusKey) ? status : "alle";
      sel.addEventListener("change", () => {
        status = sel.value;
        ctx.setzeParams({ status });
        render();
      });
      chips.appendChild(sel);
    }
  }

  // Zeilen wiederverwenden: nur geänderte neu bauen, DOM nur bei Änderungen anfassen
  let cache = new Map<string, { html: string; el: HTMLElement }>();
  let neuCache = new Map<string, { html: string; el: HTMLElement }>();
  let ausgabe: HTMLElement[] = [];
  const zeileAus = (key: string, cls: string, html: string, binden: (r: HTMLElement) => void): HTMLElement => {
    const k = cls + html;
    const alt = cache.get(key);
    let r: HTMLElement;
    if (alt && alt.html === k) r = alt.el;
    else {
      r = el("div", { class: cls });
      r.innerHTML = html;
      binden(r);
    }
    neuCache.set(key, { html: k, el: r });
    return r;
  };
  const ausgeben = () => {
    cache = neuCache;
    neuCache = new Map();
    const gleich = ausgabe.length === liste.children.length && ausgabe.every((x, i) => liste.children[i] === x);
    if (!gleich) liste.replaceChildren(...ausgabe);
    ausgabe = [];
  };
  let veraltet = false;

  function render(): void {
    const q = suche.value.trim().toLowerCase();
    let alle = Object.values(sim.state.fahrzeuge);
    if (!bereich.alle()) alle = alle.filter((f) => fzBereich(f) !== "fremd");
    // aktiv = unterwegs oder beschäftigt; frei auf der Wache und abgemeldet (Status 0) zählen nicht
    if (nurAktive) alle = alle.filter((f) => !!f.einsatzId || !!f.kt?.aktiv || (f.status !== "freiWache" && f.status !== "abgemeldet") || (f.status === "freiWache" && f.phase !== "frei"));
    if (!ctx.sichtbar()) {
      if (nurAktive) ctx.setzeBadge(alle.length || null);
      veraltet = true;
      return;
    }
    veraltet = false;
    chipsBauen(alle);
    const sichtbar = alle.filter((f) => passt(f, q));
    ausgabe = [];
    const liste = { appendChild: (x: HTMLElement) => void ausgabe.push(x) };
    if (nurAktive) {
      // nach Status, dann nach Name
      const ord = ["alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO", "zumZO", "amZO", "freiFunk", "dienstfahrt", "bereitschaft", "abgemeldet", "freiWache"];
      sichtbar.sort((a, b) => ord.indexOf(a.status) - ord.indexOf(b.status) || a.funkrufname.localeCompare(b.funkrufname));
      for (const fz of sichtbar) {
        const ph = PHASE_TEXT[fz.phase] ?? "";
        const html = `${statusChip(fz)}<div class="fz-main"><div><b data-dienstfz="${esc(fz.id)}">${esc(fz.funkrufname)}</b> <span class="muted">${typHtml(fz)} · ${esc(fz.kurzname || fz.stationName)}</span> ${aussenHtml(fz)}${crewHtml(fz)}${dienstHtml(fz)}</div><div class="fz-auftrag">${auftrag(fz) || `<span class="muted">${esc(sim.statusDef(fz.status).name)}</span>`}</div></div><div class="fz-rechts"><div>${esc(ph)}</div><div class="muted">${eta(fz)}</div></div>`;
        liste.appendChild(zeileAus(fz.id, `fz-row aktiv${fzKlassen(fz)}`, html, (r) => klickVerhalten(r, fz)));
      }
      if (!sichtbar.length) liste.appendChild(el("div", { class: "muted pad" }, alle.length ? "Nichts passt zum Filter." : "Kein Fahrzeug unterwegs – alle frei auf der Wache oder abgemeldet."));
      ctx.setzeBadge(alle.length || null);
      ausgeben();
      return;
    }
    // nach Dienststelle
    const gruppen = new Map<string, SimFahrzeug[]>();
    const HELI = "Notarzthubschrauber";
    const OEAMTC = "NEF ÖAMTC (Ausweich für Hubschrauber)";
    for (const fz of sichtbar) {
      // alle Hubschrauber (NAH, ITH) gemeinsam statt verstreut nach Stützpunkt
      const name = fz.rmTyp === "NAH" || fz.rmTyp === "ITH" ? HELI : istOeamtcNef(fz) ? OEAMTC : fz.stationName;
      const g = gruppen.get(name) ?? [];
      g.push(fz);
      gruppen.set(name, g);
    }
    for (const [name, fzs] of [...gruppen.entries()].sort((a, b) => (a[0] === HELI ? -1 : b[0] === HELI ? 1 : a[0] === OEAMTC ? -1 : b[0] === OEAMTC ? 1 : a[0].localeCompare(b[0], "de")))) {
      const offen = !zu.has(name) || !!q;
      const frei = fzs.filter((f) => f.status === "freiWache" || f.status === "freiFunk").length;
      const head = zeileAus(
        `g:${name}`,
        `fz-gruppe${offen ? "" : " zu"}`,
        `<span class="pfeil">${offen ? "▾" : "▸"}</span><b>${esc(name)}</b><span class="muted">${frei}/${fzs.length} frei</span>`,
        (r) =>
          r.addEventListener("click", () => {
            if (zu.has(name)) zu.delete(name);
            else zu.add(name);
            ctx.setzeParams({ zu: [...zu] });
            render();
          }),
      );
      liste.appendChild(head);
      if (!offen) continue;
      for (const fz of fzs.sort((a, b) => a.funkrufname.localeCompare(b.funkrufname))) {
        const ktIds = fz.kt?.fahrten.flat() ?? [];
        const ktSek = ktIds.some((id) => sim.ktAuftrag(id)?.d.sek);
        const ab = fz.kt && !fz.kt.aktiv && fz.kt.losUm ? ` vorgemerkt ab ${new Date(fz.kt.losUm).toTimeString().slice(0, 5)}` : fz.kt && !fz.kt.aktiv ? " vorgemerkt" : "";
        const kt = fz.kt ? `<span class="kt-fz${fz.kt.aktiv ? " aktiv" : " vorgemerkt"}${ktSek ? " sek" : ""}">${ktSek ? "SEK" : "KT"}${ktIds.length > 1 ? `×${ktIds.length}` : ""}${ab}</span>` : "";
        const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
        // Hubschrauber: ausgeschriebener Name (Christophorus 2) statt Stützpunkt
        const zusatz = name === HELI ? ` · ${esc(fz.kurzname || fz.stationName)}` : fz.kurzname ? " · " + esc(fz.kurzname) : "";
        const html = `${statusChip(fz)}<b data-dienstfz="${esc(fz.id)}">${esc(fz.funkrufname)}</b><span class="muted">${typHtml(fz)}${zusatz}</span>${aussenHtml(fz)}${crewHtml(fz)}${dienstHtml(fz)}${kt}<span class="spacer"></span><span class="muted">${esc(e?.nummer ?? "")}</span>`;
        liste.appendChild(zeileAus(fz.id, `fz-row${fzKlassen(fz)}`, html, (r) => klickVerhalten(r, fz)));
      }
    }
    if (!sichtbar.length) liste.appendChild(el("div", { class: "muted pad" }, "Keine Fahrzeuge – unter Einstellungen → Leitstelle → Fahrzeuge anlegen oder Filter ändern."));
    ausgeben();
  }

  let wartet = false;
  const aus = [
    sim.onChange(() => {
      if (wartet) return;
      wartet = true;
      setTimeout(() => {
        wartet = false;
        render();
      }, 500);
    }),
  ];
  render();
  return {
    el: root,
    dispose: () => aus.forEach((f) => f()),
    sichtbar: (an: boolean) => {
      if (an && veraltet) render();
    },
  };
}

registriere({
  komponente: "fahrzeuge",
  titel: "Alle Fahrzeuge",
  info: "Alle Fahrzeuge nach Dienststelle, mit Filter und Suche",
  bereich: "links",
  erstellen: (ctx) => fahrzeugListe(ctx, false),
});

registriere({
  komponente: "aktive",
  titel: "Aktive Fahrzeuge",
  info: "Alle Fahrzeuge, die nicht frei auf der Wache und nicht abgemeldet sind – mit Status und Auftrag",
  bereich: "links",
  erstellen: (ctx) => fahrzeugListe(ctx, true),
});

// ---------------------------------------------------------------- Statusänderungen

function statusLogFenster(ctx: PanelKontext) {
  const root = el("div", { class: "pl fz-fenster statuslog" });
  const kopf = el("div", { class: "pl-kopf" });
  const werkzeug = el("div", { class: "pl-werkzeug" });
  const suche = el("input", { type: "search", class: "pl-suche", placeholder: "Fahrzeug, Status, Einsatz …" });
  const nurEinsatz = el("label", { class: "pl-check", title: "Nur Änderungen im Einsatz bzw. Transport" });
  const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
  cb.checked = !!ctx.params.nurEinsatz;
  nurEinsatz.append(cb, document.createTextNode(" nur im Einsatz"));
  const bereich = bereichSchalter(() => {
    zuletzt = "";
    render();
  });
  werkzeug.append(suche, nurEinsatz, bereich.el);
  kopf.appendChild(werkzeug);
  const liste = el("div", { class: "pl-body fz-liste" });
  root.append(kopf, liste);
  suche.addEventListener("input", () => render());
  cb.addEventListener("change", () => {
    ctx.setzeParams({ nurEinsatz: cb.checked });
    render();
  });
  let veraltet = false;
  let zuletzt = "";
  const chip = (k: StatusKey) => {
    const d = sim.statusDef(k);
    return `<span class="st-chip" style="background:${esc(d.farbe)}" title="${esc(d.name)}">${esc(d.nummer)}</span>`;
  };
  function render(): void {
    if (!ctx.sichtbar()) {
      veraltet = true;
      return;
    }
    veraltet = false;
    const log = sim.state.statusLog ?? [];
    const q = suche.value.trim().toLowerCase();
    const schluessel = `${log.length}|${log[log.length - 1]?.zeit ?? 0}|${q}|${cb.checked}|${bereich.alle()}|${store.settings.funkgruppe}`;
    if (schluessel === zuletzt) return;
    zuletzt = schluessel;
    const zeilen: HTMLElement[] = [];
    for (let i = log.length - 1; i >= 0 && zeilen.length < 300; i--) {
      const x = log[i];
      if (cb.checked && !x.einsatz) continue;
      const lfz = sim.state.fahrzeuge[x.fzId];
      if (!bereich.alle() && lfz && fzBereich(lfz) === "fremd") continue;
      const von = sim.statusDef(x.von);
      const nach = sim.statusDef(x.nach);
      if (q && !`${x.funkrufname} ${von.name} ${nach.name} ${nach.nummer} ${x.einsatz ?? ""} ${x.grund ?? ""}`.toLowerCase().includes(q)) continue;
      const r = el("div", { class: "fz-row statuslog-zeile" });
      const uhr = new Date(x.zeit).toTimeString().slice(0, 8);
      r.innerHTML = `<span class="muted mono">${uhr}</span> <b data-dienstfz="${esc(x.fzId)}">${esc(x.funkrufname)}</b> ${chip(x.von)}<span class="muted">→</span>${chip(x.nach)} <span>${esc(nach.name)}</span><span class="spacer"></span><span class="muted">${esc([x.einsatz, x.grund].filter(Boolean).join(" · "))}</span>`;
      r.title = `${von.nummer} ${von.name} → ${nach.nummer} ${nach.name} · Klick: Fahrzeug auf der Karte zeigen`;
      r.addEventListener("click", () => fahrzeugZeigen(x.fzId, false));
      zeilen.push(r);
    }
    if (!zeilen.length) zeilen.push(el("div", { class: "muted pad" }, log.length ? "Nichts passt zum Filter." : "Noch keine Statusänderungen in diesem Spiel."));
    liste.replaceChildren(...zeilen);
  }
  let wartet = false;
  const aus = sim.onChange(() => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      render();
    }, 500);
  });
  render();
  return {
    el: root,
    dispose: () => aus(),
    sichtbar: (an: boolean) => {
      if (an && veraltet) render();
    },
  };
}

registriere({
  komponente: "statuslog",
  titel: "Statusänderungen",
  info: "Alle Statuswechsel der Fahrzeuge, neueste oben – mit Uhrzeit, Einsatz und Grund",
  bereich: "links",
  erstellen: (ctx) => statusLogFenster(ctx),
});
