/**
 * Einsatzliste: alle Notfälle, Krankentransporte und Überstellungen in einer Liste,
 * farbig nach Zustand (rot = disponieren, gelb = Anruf/Aufnahme, blau = unterwegs, grün = vor Ort, grau = erledigt).
 */
import { findCode } from "../../sim/codes";
import { sim, type Einsatz } from "../../sim/engine";
import { hhmm, KT_STATUS_LABEL, type KtAuftrag } from "../../sim/kt";
import { codeInfo, istUeberstellung, ktCode } from "../../sim/ktCodes";
import { mp } from "../../net/mehrspieler";
import { ensureCodes } from "../codesPrompt";
import { el, esc, toast } from "../dom";
import { codeChip, sekTags } from "../ktView";
import { registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, onAuswahl, waehle } from "../ws/auswahl";
import { bearbeiterHtml, stufeFarbe, uhr } from "./teile";

export type Lage = "anruf" | "dispo" | "unterwegs" | "vorort" | "erledigt";

export const LAGE_LABEL: Record<Lage, string> = {
  anruf: "Anruf / Aufnahme",
  dispo: "disponieren",
  unterwegs: "unterwegs",
  vorort: "vor Ort / an Bord",
  erledigt: "erledigt",
};
const LAGE_ORDNUNG: Record<Lage, number> = { anruf: 0, dispo: 1, unterwegs: 2, vorort: 3, erledigt: 4 };

const ANRUF_LAEUFT = ["klingelt", "aktiv", "gehalten", "verpasst"];

export function einsatzLage(e: Einsatz): Lage {
  if (e.zustand === "abgeschlossen") return "erledigt";
  if (e.anruf && ANRUF_LAEUFT.includes(e.anruf.status)) return "anruf";
  const fz = e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f) => f && f.einsatzId === e.id);
  if (!fz.length || e.nachforderungen?.some((n) => !n.erledigt) || e.khAnfrage || e.adressePruefen) return "dispo";
  if (fz.some((f) => ["suche", "vorOrt", "warteKH", "transport", "uebergabe"].includes(f!.phase))) return "vorort";
  return "unterwegs";
}

export function ktLage(k: KtAuftrag): Lage {
  if (k.status === "erledigt" || k.status === "storniert") return "erledigt";
  if (k.status === "aufnahme" || (k.anruf && ["klingelt", "aktiv", "gehalten"].includes(k.anruf.status))) return "anruf";
  if (k.status === "offen") return "dispo";
  if (k.status === "anBord") return "vorort";
  return "unterwegs";
}

type Art = "alle" | "rd" | "kt" | "sek" | "ktsek";
const ART_LABEL: [Art, string][] = [
  ["alle", "Alle"],
  ["rd", "Notfall"],
  ["kt", "KT"],
  ["sek", "Überstellung"],
];

interface Zeile {
  art: "rd" | "kt" | "sek";
  id: string;
  lage: Lage;
  zeit: number;
  e?: Einsatz;
  k?: KtAuftrag;
}

function erstellen(ctx: PanelKontext) {
  const root = el("div", { class: "pl liste" });
  const kopf = el("div", { class: "pl-kopf" });
  const chips = el("div", { class: "pl-chips" });
  const werkzeug = el("div", { class: "pl-werkzeug" });
  const suche = el("input", { type: "search", class: "pl-suche", placeholder: "Suchen (Nummer, Ort, Code, Name) …" });
  const zuTun = el("label", { class: "chk small", title: "Nur Einträge, bei denen gerade etwas zu tun ist" });
  const zuTunCb = el("input", { type: "checkbox" });
  zuTun.append(zuTunCb, el("span", {}, "nur zu tun"));
  const erledigt = el("label", { class: "chk small" });
  const erledigtCb = el("input", { type: "checkbox" });
  erledigt.append(erledigtCb, el("span", {}, "erledigte"));
  const neu = el("button", { class: "btn small", title: "Krankentransport oder Überstellung von Hand anlegen" }, "+ Neu");
  const test = el("button", { class: "btn small", title: "Zufälligen Test-Einsatz erzeugen" }, "+ Test");
  werkzeug.append(suche, zuTun, erledigt, neu, test);
  kopf.append(chips, werkzeug);
  const liste = el("div", { class: "pl-body el-liste" });
  root.append(kopf, liste);

  let art = (ctx.params.art as Art) ?? "alle";
  zuTunCb.checked = !!ctx.params.zuTun;
  erledigtCb.checked = !!ctx.params.erledigt;
  zuTunCb.addEventListener("change", () => {
    ctx.setzeParams({ zuTun: zuTunCb.checked });
    render();
  });
  erledigtCb.addEventListener("change", () => {
    ctx.setzeParams({ erledigt: erledigtCb.checked });
    render();
  });
  suche.addEventListener("input", () => render());

  neu.addEventListener("click", async () => {
    const id = await sim.call("ktNeuManuell").catch((err) => (toast(String(err.message ?? err), "error"), null));
    for (let i = 0; id && !sim.ktAuftrag(id) && i < 20; i++) await new Promise((r) => setTimeout(r, 100));
    if (id) waehle("kt", id);
  });
  test.addEventListener("click", (ev) => testMenu(ev.currentTarget as HTMLElement, art));

  function zeilen(): Zeile[] {
    const out: Zeile[] = [];
    // Anrufe, die noch niemand angenommen hat, stehen nur im Telefon
    for (const e of sim.state.einsaetze) {
      if (e.anruf && !e.anruf.angenommenVon && !e.fahrzeuge.length) continue;
      out.push({ art: "rd", id: e.id, lage: einsatzLage(e), zeit: e.erstellt, e });
    }
    for (const k of sim.state.kt ?? []) {
      if (k.anruf && !k.anruf.angenommenVon && k.status === "aufnahme") continue;
      out.push({ art: istUeberstellung(k.d) ? "sek" : "kt", id: k.id, lage: ktLage(k), zeit: k.d.abholung ?? k.d.termin ?? k.eingang, k });
    }
    return out;
  }

  function passt(z: Zeile, q: string): boolean {
    if (art !== "alle" && !(art === "ktsek" ? z.art !== "rd" : z.art === art)) return false;
    if (z.lage === "erledigt" && !erledigtCb.checked) return false;
    if (zuTunCb.checked && !(z.lage === "anruf" || z.lage === "dispo")) return false;
    if (!q) return true;
    const text = z.e
      ? `${z.e.nummer} ${z.e.code ?? ""} ${findCode(z.e.code ?? undefined)?.beschreibung ?? ""} ${z.e.adresse?.label ?? ""} ${z.e.meldung.adresse}`
      : `${z.k!.nummer} ${z.k!.d.code ?? ""} ${z.k!.d.patient.name} ${z.k!.d.von?.label ?? ""} ${z.k!.d.nach?.label ?? ""}`;
    return text.toLowerCase().includes(q);
  }

  function render(): void {
    const q = suche.value.trim().toLowerCase();
    const alle = zeilen();
    // Filter-Chips mit Anzahl (offene)
    chips.innerHTML = "";
    for (const [a, label] of ART_LABEL) {
      const n = alle.filter((z) => z.lage !== "erledigt" && (a === "alle" || z.art === a)).length;
      const dringend = alle.filter((z) => (a === "alle" || z.art === a) && (z.lage === "anruf" || z.lage === "dispo")).length;
      const b = el("button", { class: `pl-chip${art === a || (art === "ktsek" && a !== "rd" && a !== "alle") ? " active" : ""}` });
      b.innerHTML = `${label} <span class="n${dringend ? " rot" : ""}">${n}</span>`;
      b.addEventListener("click", () => {
        art = a;
        ctx.setzeParams({ art });
        render();
      });
      chips.appendChild(b);
    }
    const sichtbar = alle.filter((z) => passt(z, q));
    sichtbar.sort((a, b) => LAGE_ORDNUNG[a.lage] - LAGE_ORDNUNG[b.lage] || (a.art === "rd" && b.art === "rd" ? b.zeit - a.zeit : a.zeit - b.zeit));
    const sel = auswahl();
    liste.innerHTML = "";
    for (const z of sichtbar) liste.appendChild(z.e ? rdZeile(z.e, z.lage, sel.id === z.id) : ktZeile(z.k!, z.art === "sek" ? "sek" : "kt", z.lage, sel.id === z.id));
    if (!sichtbar.length) {
      liste.appendChild(
        el(
          "div",
          { class: "muted pad" },
          alle.length ? "Nichts passt zum Filter." : "Noch keine Einsätze. Die Simulation erzeugt Einsätze, sobald die Uhr läuft (Start oben).",
        ),
      );
    }
    // Reiter: Zahl der Einträge, bei denen etwas zu tun ist
    const tun = alle.filter((z) => z.lage === "dispo").length;
    ctx.setzeBadge(tun, "warn");
  }

  function rdZeile(e: Einsatz, lage: Lage, gewaehlt: boolean): HTMLElement {
    const c = findCode(e.code ?? undefined);
    const row = el("div", { class: `el-row lage-${lage}${gewaehlt ? " sel" : ""}` });
    const a = e.anruf;
    const warn = e.adressePruefen || e.khAnfrage || e.nachforderungen?.some((n) => !n.erledigt);
    const tel =
      a && e.zustand !== "abgeschlossen" && ANRUF_LAEUFT.includes(a.status)
        ? `<span class="el-anruf ${a.status}">${
            a.status === "klingelt" ? (a.folge ? "📞 Folgeanruf" : "📞 klingelt") : a.status === "verpasst" ? "📵 verpasst" : a.status === "gehalten" ? "⏸ gehalten" : `📞 im Gespräch${a.angenommenVon && mp.aktiv ? ` · ${esc(a.angenommenVon.pid === mp.ich.pid ? "du" : a.angenommenVon.name)}` : ""}`
          }</span>`
        : "";
    const fz = e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f) => f && f.einsatzId === e.id);
    // kompakt: Zeile 1 Code + Stichwort, Zeile 2 Ort; rechts Uhrzeit, Zustand, Fahrzeuge
    row.title = `${e.nummer}${c ? ` · ${c.code} ${c.beschreibung}` : ""}`;
    row.innerHTML = `
      <span class="el-bar"></span>
      <div class="el-main">
        <div class="el-z1">${
          c
            ? `<span class="el-typ rd el-code"><span class="stufe-dot" style="background:${stufeFarbe(c.stufe)}"></span>${esc(c.code)}</span><span class="el-text">${esc(c.beschreibung)}</span>`
            : `<span class="el-typ rd el-code leer">${a ? "Abfrage" : "ohne Code"}</span>`
        }${warn ? `<span class="warn-dot" title="Rückfrage oder Nachforderung offen">!</span>` : ""}${tel}</div>
        <div class="el-z2 muted">${esc(e.adresse?.label ?? (e.meldung.adresse ? `gemeldet: ${e.meldung.adresse}` : "Adresse fehlt"))}</div>
        ${bearbeiterHtml(e)}
      </div>
      <div class="el-rechts"><span class="el-zeit">${uhr(e.erstellt)}</span><span class="el-lage">${esc(LAGE_LABEL[lage])}</span>${fz.length ? `<div class="el-fz">${fz.map((f) => esc(f!.funkrufname)).join(", ")}</div>` : ""}</div>`;
    row.addEventListener("click", () => waehle("einsatz", e.id));
    return row;
  }

  function ktZeile(k: KtAuftrag, typ: "kt" | "sek", lage: Lage, gewaehlt: boolean): HTMLElement {
    const row = el("div", { class: `el-row lage-${lage}${gewaehlt ? " sel" : ""}` });
    const fz = k.fz ? sim.state.fahrzeuge[k.fz] : undefined;
    const nef = k.begleit ? sim.state.fahrzeuge[k.begleit] : undefined;
    const a = k.anruf;
    const ab = k.d.abholung ?? (k.d.termin ? k.d.termin - 45 * 60_000 : null);
    const spaet = ab !== null && ["offen", "vorgemerkt"].includes(k.status) && ab < sim.state.zeit;
    const dringend = codeInfo(k.d.code).sondersignal || k.d.sofort;
    const tel =
      a && ["klingelt", "aktiv", "gehalten", "verpasst"].includes(a.status)
        ? `<span class="el-anruf ${a.status}">${a.status === "klingelt" ? "📞 Hotline klingelt" : a.status === "verpasst" ? "📵 verpasst" : a.status === "gehalten" ? "⏸ gehalten" : "📞 im Gespräch"}</span>`
        : "";
    const zeit = k.d.abholung ? hhmm(k.d.abholung) : k.d.termin ? hhmm(k.d.termin) : hhmm(k.eingang);
    const zeitArt = k.d.abholung ? "Abh." : k.d.termin ? (typ === "sek" ? "Ank." : "Termin") : "Eing.";
    row.title = `${k.nummer} · ${typ === "sek" ? "Überstellung" : "Krankentransport"}`;
    row.innerHTML = `
      <span class="el-bar"></span>
      <div class="el-main">
        <div class="el-z1"><span class="el-typ ${typ} el-codewrap">${codeChip(k.d.code)}</span><b class="el-name">${esc(k.d.patient.name || "(Aufnahme)")}</b>${sekTags(k.d)}<span class="el-text muted">${esc(ktCode(k.d.code)?.name ?? "")}</span>${dringend ? `<span class="el-sofort">SOFORT</span>` : ""}${tel}</div>
        <div class="el-z2 muted">${esc(k.d.von?.label ?? "?")} → ${esc(k.d.nach?.label ?? "?")}</div>
      </div>
      <div class="el-rechts"><span class="el-zeit"><span class="muted">${zeitArt}</span> ${zeit}</span><span class="el-lage${spaet ? " spaet" : ""}">${esc(spaet ? "zu spät dran" : KT_STATUS_LABEL[k.status])}</span>${fz ? `<div class="el-fz">${esc(fz.funkrufname)}${nef ? ` + ${esc(nef.funkrufname)}` : ""}</div>` : ""}</div>`;
    row.addEventListener("click", () => waehle("kt", k.id));
    return row;
  }

  // gedrosselt neu zeichnen
  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      render();
    }, 400);
  };
  const aus = [sim.onChange(spaeter), onAuswahl(() => render()), mp.onChange(spaeter)];
  render();
  return {
    el: root,
    dispose: () => aus.forEach((f) => f()),
  };
}

/** Kleines Menü „+ Test“: Notfall, Krankentransport oder Überstellung erzeugen */
function testMenu(anker: HTMLElement, art: Art): void {
  document.querySelector(".ctx-menu.test")?.remove();
  const m = el("div", { class: "ctx-menu test" });
  const r = anker.getBoundingClientRect();
  m.style.position = "fixed";
  m.style.left = `${Math.max(8, r.right - 220)}px`;
  m.style.top = `${r.bottom + 4}px`;
  const punkt = (label: string, fn: () => Promise<void>) => {
    const b = el("button", {}, label);
    b.addEventListener("click", () => {
      m.remove();
      void fn();
    });
    m.appendChild(b);
  };
  punkt("Notfall (Notruf)", async () => {
    if (!ensureCodes()) return;
    const e = await sim.call("generiere").catch((err) => (toast(String(err.message ?? err), "error"), null));
    for (let i = 0; e && !sim.einsatz(e.id) && i < 20; i++) await new Promise((x) => setTimeout(x, 100));
    if (e) waehle("einsatz", e.id);
    else toast("Kein Einsatz erzeugt – Adressen noch nicht geladen?", "error");
  });
  const kt = async (sek: boolean) => {
    const k = await (sek ? sim.call("generiereSek") : sim.call("generiereKt")).catch((err) => (toast(String(err.message ?? err), "error"), null));
    for (let i = 0; k && !sim.ktAuftrag(k.id) && i < 20; i++) await new Promise((x) => setTimeout(x, 100));
    if (k) waehle("kt", k.id);
    else toast("Kein Auftrag erzeugt – sind Krankenhäuser mit Stationen vorhanden?", "error");
  };
  punkt("Krankentransport", () => kt(false));
  punkt("Überstellung", () => kt(true));
  if (art === "kt") m.prepend(m.children[1]);
  if (art === "sek") m.prepend(m.children[2]);
  document.body.appendChild(m);
  setTimeout(() =>
    document.addEventListener("mousedown", function weg(ev) {
      if (!m.contains(ev.target as Node)) {
        m.remove();
        document.removeEventListener("mousedown", weg);
      }
    }),
  );
}

registriere({
  komponente: "einsatzliste",
  titel: "Einsatzliste",
  info: "Notfälle, Krankentransporte und Überstellungen",
  bereich: "links",
  mehrfach: true,
  erstellen,
});
