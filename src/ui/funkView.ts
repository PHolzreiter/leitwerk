/**
 * Funk (rechter Reiter): rufende Fahrzeuge, laufendes Funkgespräch mit Schnellknöpfen,
 * Verlauf aller Funkgespräche (alle Spieler hören mit) und Statusmeldungen.
 */
import { funkNamenGlaetten, mikroAnbinden } from "./sprache";
import { funkKiAntwort } from "../abfrage/funkKi";
import { mp } from "../net/mehrspieler";
import { buchungName } from "../data/klinik";
import { store } from "../data/store";
import { findCode } from "../sim/codes";
import { sim, type FunkGespraech } from "../sim/engine";
import { el, esc, toast } from "./dom";

function uhr(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

function ichFuehre(g: FunkGespraech): boolean {
  return !g.fuehrer || sim.mode === "solo" || g.fuehrer.pid === (sim.ich?.pid ?? mp.ich.pid);
}

/** Einsatz des Gesprächs als Funkauftrag („Einsatz …, Code …, Adresse …, Info …“) */
function einsatzAuftrag(g: FunkGespraech): string {
  const e = g.einsatzId ? sim.einsatz(g.einsatzId) : undefined;
  if (!e) return "Hier LEO, habt ihr noch einen Auftrag offen, kommen";
  const c = findCode(e.code ?? undefined);
  const teile = [`Einsatz ${e.nummer}`, c ? `${c.code} ${c.beschreibung}` : "", e.adresse ? `Einsatzort ${e.adresse.label}${e.zusatz ? `, ${e.zusatz}` : ""}` : "", e.infoRtw ? `Info: ${e.infoRtw}` : ""].filter(Boolean);
  return `Hier LEO, ${teile.join(", ")}, kommen`;
}

function zielKh(g: FunkGespraech): string {
  const e = g.einsatzId ? sim.einsatz(g.einsatzId) : undefined;
  const h = e?.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
  return h ? `Hier LEO, Zielkrankenhaus ${h.kurzname || h.name}, ${e!.kh!.grund ? `${buchungName(e!.kh!.grund)}, ` : ""}kommen` : "Hier LEO, Zielkrankenhaus: ";
}

/** Schnellknöpfe: Text wird gesendet; „…“-Knöpfe füllen nur das Eingabefeld */
const SCHNELL: [string, (g: FunkGespraech) => string, boolean?][] = [
  ["Einsatzauftrag", einsatzAuftrag],
  ["Lagemeldung?", () => "Hier LEO, bitte gebt mir eine Lagemeldung, wenn ihr vor Ort seid, kommen"],
  ["Status / ETA?", () => "Hier LEO, wie ist euer Status, wann seid ihr vor Ort, kommen"],
  ["Zustand Patient?", () => "Hier LEO, wie ist der Zustand des Patienten, braucht ihr weitere Kräfte, kommen"],
  ["Zielkrankenhaus", zielKh],
  ["Zusatzinfo …", () => "Hier LEO, Zusatzinfo zu eurem Einsatz: ", true],
  ["Funkcheck", () => "Hier LEO, Funkcheck, wie hört ihr mich, kommen"],
];

export function createFunkView(root: HTMLElement, deps: { select(einsatzId: string): void }): { refresh(): void; rufen(fzId: string): void; offen(): number } {
  root.innerHTML = "";
  const rufe = el("div", { class: "funk-rufe" });
  const aktiv = el("div", { class: "funk-aktiv", hidden: "" });
  const aktivKopf = el("div", { class: "funk-aktiv-kopf" });
  const aktivVerlauf = el("div", { class: "funk-verlauf" });
  const schnell = el("div", { class: "row-btns funk-schnell" });
  const form = el("form", { class: "funk-form" });
  const eingabe = el("input", { type: "text", placeholder: "Funkspruch an das Fahrzeug … (Enter)" });
  const senden = el("button", { class: "btn small primary", type: "submit" }, "Senden");
  const funkHinweis = () => `Hier LEO, kommen. Verstanden, Ende. ${Object.values(sim.state.fahrzeuge).slice(0, 60).map((f) => f.funkrufname).join(", ")}`;
  form.append(
    eingabe,
    mikroAnbinden({
      input: eingabe,
      rang: 3,
      aktiv: () => aktivId !== null,
      senden: () => form.requestSubmit(),
      hinweis: funkHinweis,
      nachher: (t) => funkNamenGlaetten(t, Object.values(sim.state.fahrzeuge).map((f) => f.funkrufname)),
    }),
    senden,
  );
  aktiv.append(aktivKopf, aktivVerlauf, schnell, form);
  // Freies Funkfeld: „75/001 von LEO, kommen“ (tippen oder sprechen) – daneben die Auswahl wie bisher
  const rufenZeile = el("form", { class: "funk-rufen" });
  const freiInput = el("input", { type: "text", placeholder: "Fahrzeug anfunken, z. B. „75/001 von LEO, kommen“" });
  const rufenInput = el("input", { type: "text", class: "funk-wahl", placeholder: "75/001", list: "funk-fz-liste", title: "Fahrzeug auswählen und rufen" });
  const liste = el("datalist", { id: "funk-fz-liste" });
  const namen = () => Object.values(sim.state.fahrzeuge).map((f) => f.funkrufname);
  rufenZeile.append(
    freiInput,
    mikroAnbinden({
      input: freiInput,
      rang: 4,
      aktiv: () => true,
      senden: () => rufenZeile.requestSubmit(),
      hinweis: funkHinweis,
      nachher: (t) => funkNamenGlaetten(t, namen()),
    }),
    el("button", { class: "btn small primary", type: "submit" }, "📻 Rufen"),
    liste,
  );
  const wahlZeile = el("div", { class: "funk-wahlzeile muted small" });
  wahlZeile.append(el("span", {}, "oder nur auswählen:"), rufenInput);
  rufenZeile.appendChild(wahlZeile);
  rufenInput.addEventListener("change", () => {
    if (!rufenInput.value.trim()) return;
    const fz = fahrzeugIn(rufenInput.value);
    if (!fz) return toast("Fahrzeug nicht gefunden", "error");
    rufenInput.value = "";
    rufen(fz.id);
  });
  const verlauf = el("div", { class: "funk-alle" });
  const statusTitel = el("details", { class: "funk-status" });
  const statusListe = el("div");
  statusTitel.append(el("summary", {}, "Statusmeldungen"), statusListe);
  statusTitel.addEventListener("toggle", () => refresh());
  const gruppe = el("div", { class: "funk-gruppe", title: "Gefunkt wird auf dieser TETRA-Gruppe – auch Fahrzeuge von außen wechseln für den Einsatz hierher" });
  root.append(gruppe, rufe, aktiv, rufenZeile, el("div", { class: "funk-titel" }, "Funkverkehr"), verlauf, statusTitel);

  let aktivId: number | null = null;

  for (const [label, text, nurVorlage] of SCHNELL) {
    const b = el("button", { class: "btn small", type: "button" }, label);
    b.addEventListener("click", () => {
      if (aktivId === null) return;
      const t = text(gespraech(aktivId)!);
      if (nurVorlage || t.endsWith(": ")) {
        eingabe.value = t;
        eingabe.focus();
        eingabe.setSelectionRange(t.length, t.length);
        return;
      }
      fehler(sim.call("funkSenden", aktivId, t));
    });
    schnell.appendChild(b);
  }
  const stornoB = el("button", { class: "btn small danger-text", type: "button" }, "Storno");
  stornoB.addEventListener("click", () => {
    const g = aktivId !== null ? gespraech(aktivId) : undefined;
    if (g) fehler(sim.call("funkSenden", g.id, "Hier LEO, Storno für euren Einsatz, rückt ein, kommen"));
  });
  const endeB = el("button", { class: "btn small primary", type: "button" }, "Verstanden, ENDE");
  endeB.addEventListener("click", () => aktivId !== null && fehler(sim.call("funkEnde", aktivId)));
  schnell.append(stornoB, endeB);

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t || aktivId === null) return;
    eingabe.value = "";
    fehler(sim.call("funkSenden", aktivId, t));
  });
  /** Funkrufname im Text finden (längster Treffer zuerst, „75 1“ zählt als „75/001“) */
  function fahrzeugIn(text: string) {
    const t = funkNamenGlaetten(text, namen()).toLowerCase();
    const alle = Object.values(sim.state.fahrzeuge).sort((a, b) => b.funkrufname.length - a.funkrufname.length);
    return alle.find((f) => t === f.funkrufname.toLowerCase()) ?? alle.find((f) => t.includes(f.funkrufname.toLowerCase()));
  }
  rufenZeile.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const roh = freiInput.value.trim();
    if (!roh) return;
    const text = funkNamenGlaetten(roh, namen());
    const fz = fahrzeugIn(text);
    if (!fz) return toast("Kein Fahrzeug erkannt – bitte mit Funkrufnamen, z. B. „75/001 von LEO, kommen“", "error");
    freiInput.value = "";
    // nur der Name? Dann der übliche Anruf
    rufen(fz.id, text.toLowerCase() === fz.funkrufname.toLowerCase() ? undefined : text);
  });

  function gespraech(id: number): FunkGespraech | undefined {
    return sim.state.funkGespraeche?.find((g) => g.id === id);
  }

  function rufen(fzId: string, text?: string): void {
    void sim
      .call("funkRufen", fzId, text)
      .then((id) => {
        aktivId = id as number;
        refresh();
        eingabe.focus();
      })
      .catch((e) => toast(String((e as Error).message ?? e), "error"));
  }

  const spruchHtml = (g: FunkGespraech) =>
    g.sprueche
      .map((s) => `<div class="funk-spruch ${s.von === "LEO" ? "leo" : "fz"}"><span class="muted">${uhr(s.zeit)}</span> ${esc(s.text)}${s.wer && mp.aktiv ? ` <span class="prot-von">${esc(s.wer)}</span>` : ""}</div>`)
      .join("") + (g.wartetAufKi ? `<div class="funk-spruch fz muted">… ${esc(g.funkname)} antwortet</div>` : "");

  let letzterVerlauf = "";
  let letzteRufe = "";
  let fzListe = "";
  function refresh(): void {
    const fg = `📻 TETRA ${sim.funkgruppe().id}`;
    if (gruppe.textContent !== fg) gruppe.textContent = fg;
    const alle = sim.state.funkGespraeche ?? [];
    // Rufende Fahrzeuge – dringende zuerst; nur neu zeichnen, wenn sich etwas geändert hat
    const rufend = alle.filter((g) => g.status === "ruft").sort((a, b) => Number(!!b.dringend) - Number(!!a.dringend) || a.seit - b.seit);
    const rufKey = JSON.stringify(rufend.map((g) => [g.id, g.rufe, g.dringend]));
    if (rufKey !== letzteRufe) {
    letzteRufe = rufKey;
    rufe.innerHTML = "";
    for (const g of rufend) {
      const z = el("div", { class: `funk-ruf${g.dringend ? " dringend" : ""}` });
      const e = g.einsatzId ? sim.einsatz(g.einsatzId) : undefined;
      z.innerHTML = `<span class="funk-ruf-text">${g.dringend ? "❗" : "📻"} <b>${esc(g.funkname)}</b> ruft LEO${g.rufe > 1 ? ` (${g.rufe}×)` : ""}${e ? ` <span class="muted">· ${esc(e.nummer)}</span>` : ""}${g.dringend ? ` <span class="funk-dringend">dringend</span>` : ""}</span>`;
      const b = el("button", { class: "btn small primary" }, "Antworten");
      b.addEventListener("click", () => {
        aktivId = g.id;
        fehler(sim.call("funkAntworten", g.id).then(() => refresh()));
        if (g.einsatzId) deps.select(g.einsatzId);
      });
      z.appendChild(b);
      rufe.appendChild(z);
    }
    }
    // Aktives Gespräch: zuletzt gewähltes, sonst das neueste offene, das ich führe
    let g = aktivId !== null ? gespraech(aktivId) : undefined;
    if (!g || g.status === "ende" || !ichFuehre(g)) {
      g = alle.find((x) => (x.status === "offen" || x.status === "leoRuft") && x.fuehrer && ichFuehre(x));
      aktivId = g?.id ?? null;
    }
    aktiv.hidden = !g;
    if (g) {
      aktivKopf.innerHTML = `📻 Funk mit <b>${esc(g.funkname)}</b> ${g.status === "leoRuft" ? `<span class="muted">– wartet auf Antwort …</span>` : ""}`;
      const html = spruchHtml(g);
      if (aktivVerlauf.dataset.k !== html) {
        aktivVerlauf.dataset.k = html;
        aktivVerlauf.innerHTML = html;
        aktivVerlauf.scrollTop = aktivVerlauf.scrollHeight;
      }
      const darf = g.status === "offen";
      eingabe.disabled = senden.disabled = !darf || !!g.wartetAufKi;
      schnell.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = !darf || !!g!.wartetAufKi));
      // Freie Frage: Besatzung antwortet (KI läuft beim Gesprächsführer)
      if (g.wartetAufKi && ichFuehre(g)) void funkKiAntwort(g);
    }
    // Verlauf aller Gespräche (alle hören mit)
    const sicht = alle.slice(0, 25);
    const key = JSON.stringify(sicht.map((x) => [x.id, x.status, x.sprueche.length, x.wartetAufKi]));
    if (key !== letzterVerlauf) {
      letzterVerlauf = key;
      verlauf.innerHTML = "";
      for (const x of sicht) {
        const box = el("div", { class: `funk-g st-${x.status}` });
        const e = x.einsatzId ? sim.einsatz(x.einsatzId) : undefined;
        box.innerHTML = `<div class="funk-g-kopf"><b>${esc(x.funkname)}</b>${e ? ` <span class="muted">${esc(e.nummer)}</span>` : ""}${x.fuehrer && mp.aktiv ? ` <span class="prot-von">${esc(x.fuehrer.name)}</span>` : ""}${x.status === "ende" ? "" : ` <span class="funk-live">● ${x.status === "ruft" ? "ruft" : "läuft"}</span>`}</div>${spruchHtml(x)}`;
        box.addEventListener("click", () => {
          if (x.einsatzId) deps.select(x.einsatzId);
          if (x.status !== "ende" && ichFuehre(x)) {
            aktivId = x.id;
            refresh();
          }
        });
        verlauf.appendChild(box);
      }
      if (!sicht.length) verlauf.innerHTML = `<div class="muted pad">Noch kein Funkverkehr. Fahrzeuge rufen „LEO“, wenn sie etwas melden; du kannst sie auch selbst rufen.</div>`;
    }
    // Statusmeldungen (wie bisher)
    const st = sim.state.funk.slice(0, 80);
    const stKey = `${sim.state.funkZaehler}|${st.length}|${st[0]?.zeit}`;
    if (statusTitel.open && statusListe.dataset.k !== stKey) {
      statusListe.dataset.k = stKey;
      statusListe.innerHTML = st
      .map((f) => `<div class="funk-row art-${f.art}"><span class="muted">${uhr(f.zeit)}</span> <b>${esc(f.von)}</b> ${esc(f.text)}</div>`)
      .join("");
    }
    // Liste zum Rufen
    const names = Object.values(sim.state.fahrzeuge).map((f) => f.funkrufname).sort().join("|");
    if (names !== fzListe) {
      fzListe = names;
      liste.innerHTML = names
        .split("|")
        .map((n) => `<option value="${esc(n)}"></option>`)
        .join("");
    }
  }

  refresh();
  return {
    refresh,
    rufen,
    offen: () => (sim.state.funkGespraeche ?? []).filter((g) => g.status === "ruft").length,
  };
}
