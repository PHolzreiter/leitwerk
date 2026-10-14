/**
 * Fahrzeuge: „Alle Fahrzeuge“ (nach Dienststelle) und „Aktive Fahrzeuge“ (alle, die nicht frei auf der Wache sind).
 * Klick: auf der Karte zeigen und den Auftrag öffnen · Doppelklick: Kamera folgt · Rechtsklick: Status setzen.
 */
import { sim, type SimFahrzeug } from "../../sim/engine";
import { codeText } from "../../sim/ktCodes";
import { findCode } from "../../sim/codes";
import type { StatusKey } from "../../sim/settings";
import { el, esc } from "../dom";
import { registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { fahrzeugZeigen, karteZeigen, waehle } from "../ws/auswahl";
import { crewHtml, statusChip, statusMenu } from "./teile";

/** grobe Fahrzeuggruppen für den Filter */
const GRUPPEN: [string, string, (fz: SimFahrzeug) => boolean][] = [
  ["alle", "Alle", () => true],
  ["rtw", "RTW", (f) => f.rmTyp === "RTW" || f.rmTyp === "RTW-C"],
  ["nef", "NEF", (f) => f.rmTyp === "NEF"],
  ["nah", "Hubschrauber", (f) => f.rmTyp === "NAH" || f.rmTyp === "ITH"],
  ["s", "S-Fahrzeuge", (f) => ["SKTW", "SRTW", "SNAW", "BIT"].includes(f.rmTyp)],
  ["kt", "KT", (f) => f.rmTyp === "KTW" || !!f.kt],
];

const PHASE_TEXT: Record<string, string> = {
  frei: "",
  ausruecken: "rückt aus",
  anfahrt: "Anfahrt",
  suche: "sucht den Einsatzort",
  vorOrt: "vor Ort",
  warteKH: "wartet auf KH",
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

function klickVerhalten(row: HTMLElement, fz: SimFahrzeug): void {
  row.addEventListener("click", () => {
    karteZeigen(fz.lat, fz.lon, 13.5);
    fahrzeugZeigen(fz.id);
    if (fz.einsatzId) waehle("einsatz", fz.einsatzId, { karte: false });
    else if (fz.kt?.fahrten[0]?.[0]) waehle("kt", fz.kt.fahrten[0][0], { karte: false });
  });
  row.addEventListener("dblclick", () => fahrzeugZeigen(fz.id, true));
  row.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    statusMenu(fz, ev.clientX, ev.clientY);
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
  werkzeug.appendChild(suche);
  kopf.append(chips, werkzeug);
  const liste = el("div", { class: "pl-body fz-liste" });
  root.append(kopf, liste);
  let gruppe = (ctx.params.gruppe as string) ?? "alle";
  let status = (ctx.params.status as string) ?? "alle";
  const zu = new Set<string>((ctx.params.zu as string[]) ?? []);
  suche.addEventListener("input", () => render());

  const passt = (fz: SimFahrzeug, q: string) => {
    if (!GRUPPEN.find((g) => g[0] === gruppe)?.[2](fz)) return false;
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
    if (nurAktive) {
      const sel = el("select", { class: "pl-select", title: "Nach Status filtern" });
      sel.appendChild(el("option", { value: "alle" }, "jeder Status"));
      const da = new Set(alle.map((f) => f.status));
      for (const k of ["alarmiert", "zumBO", "amBO", "zumZO", "amZO", "freiFunk", "dienstfahrt", "bereitschaft", "abgemeldet"] as StatusKey[]) {
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

  function render(): void {
    const q = suche.value.trim().toLowerCase();
    let alle = Object.values(sim.state.fahrzeuge);
    if (nurAktive) alle = alle.filter((f) => f.status !== "freiWache" || !!f.einsatzId || !!f.kt || f.phase !== "frei");
    chipsBauen(alle);
    const sichtbar = alle.filter((f) => passt(f, q));
    liste.innerHTML = "";
    if (nurAktive) {
      // nach Status, dann nach Name
      const ord = ["alarmiert", "zumBO", "amBO", "zumZO", "amZO", "freiFunk", "dienstfahrt", "bereitschaft", "abgemeldet", "freiWache"];
      sichtbar.sort((a, b) => ord.indexOf(a.status) - ord.indexOf(b.status) || a.funkrufname.localeCompare(b.funkrufname));
      for (const fz of sichtbar) {
        const row = el("div", { class: "fz-row aktiv" });
        const ph = PHASE_TEXT[fz.phase] ?? "";
        row.innerHTML = `${statusChip(fz)}<div class="fz-main"><div><b>${esc(fz.funkrufname)}</b> <span class="muted">${esc(fz.rmTyp)} · ${esc(fz.stationName)}</span> ${crewHtml(fz)}</div><div class="fz-auftrag">${auftrag(fz) || `<span class="muted">${esc(sim.statusDef(fz.status).name)}</span>`}</div></div><div class="fz-rechts"><div>${esc(ph)}</div><div class="muted">${eta(fz)}</div></div>`;
        klickVerhalten(row, fz);
        liste.appendChild(row);
      }
      if (!sichtbar.length) liste.appendChild(el("div", { class: "muted pad" }, alle.length ? "Nichts passt zum Filter." : "Alle Fahrzeuge sind frei auf der Wache."));
      ctx.setzeBadge(alle.length || null);
      return;
    }
    // nach Dienststelle
    const gruppen = new Map<string, SimFahrzeug[]>();
    for (const fz of sichtbar) {
      const g = gruppen.get(fz.stationName) ?? [];
      g.push(fz);
      gruppen.set(fz.stationName, g);
    }
    for (const [name, fzs] of [...gruppen.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"))) {
      const offen = !zu.has(name) || !!q;
      const frei = fzs.filter((f) => f.status === "freiWache" || f.status === "freiFunk").length;
      const head = el("div", { class: `fz-gruppe${offen ? "" : " zu"}` });
      head.innerHTML = `<span class="pfeil">${offen ? "▾" : "▸"}</span><b>${esc(name)}</b><span class="muted">${frei}/${fzs.length} frei</span>`;
      head.addEventListener("click", () => {
        if (zu.has(name)) zu.delete(name);
        else zu.add(name);
        ctx.setzeParams({ zu: [...zu] });
        render();
      });
      liste.appendChild(head);
      if (!offen) continue;
      for (const fz of fzs.sort((a, b) => a.funkrufname.localeCompare(b.funkrufname))) {
        const row = el("div", { class: "fz-row" });
        const ktIds = fz.kt?.fahrten.flat() ?? [];
        const ktSek = ktIds.some((id) => sim.ktAuftrag(id)?.d.sek);
        const kt = fz.kt ? `<span class="kt-fz${fz.kt.aktiv ? " aktiv" : ""}${ktSek ? " sek" : ""}">${ktSek ? "SEK" : "KT"}${ktIds.length > 1 ? `×${ktIds.length}` : ""}</span>` : "";
        const e = fz.einsatzId ? sim.einsatz(fz.einsatzId) : undefined;
        row.innerHTML = `${statusChip(fz)}<b>${esc(fz.funkrufname)}</b><span class="muted">${esc(fz.rmTyp)}${fz.kurzname ? " · " + esc(fz.kurzname) : ""}</span>${crewHtml(fz)}${kt}<span class="spacer"></span><span class="muted">${esc(e?.nummer ?? "")}</span>`;
        klickVerhalten(row, fz);
        liste.appendChild(row);
      }
    }
    if (!sichtbar.length) liste.appendChild(el("div", { class: "muted pad" }, "Keine Fahrzeuge – unter Daten → Fahrzeuge anlegen oder Filter ändern."));
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
  return { el: root, dispose: () => aus.forEach((f) => f()) };
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
  info: "Alle Fahrzeuge, die nicht frei auf der Wache sind – mit Status und Auftrag",
  bereich: "links",
  erstellen: (ctx) => fahrzeugListe(ctx, true),
});
