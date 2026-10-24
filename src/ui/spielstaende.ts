/**
 * Spielstände: Übersicht über den Ordner „Dokumente/LeitWerk/Spielstände“ –
 * laden, umbenennen, weitergeben (exportieren), löschen und importieren.
 * Dazu das kleine Fenster zum Speichern unter einem Namen.
 */
import "./startseite.css";
import { mp } from "../net/mehrspieler";
import * as spielstand from "../net/spielstand";
import * as ordner from "../net/spielstandOrdner";
import { inTauri } from "../platform";
import { confirmDialog } from "./dialog";
import { el, esc, toast } from "./dom";
import { istDunkel } from "./ws/persoenlich";

const I: Record<string, string> = {
  datei: `<path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h5"/>`,
  auto: `<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/><path d="M12 8v4l2.5 2"/>`,
  laden: `<path d="M7 4.5v15l12-7.5z"/>`,
  stift: `<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>`,
  teilen: `<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>`,
  muell: `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>`,
  ordner: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  import: `<path d="M12 15V3M7 10l5 5 5-5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>`,
  zu: `<path d="M6 6l12 12M18 6L6 18"/>`,
  suche: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`,
  speichern: `<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>`,
  uhr: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  funk: `<path d="M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14M8 16a5.5 5.5 0 0 1 0-8M16 8a5.5 5.5 0 0 1 0 8"/><circle cx="12" cy="12" r="1.5"/>`,
  liste: `<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>`,
  leute: `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>`,
  wolke: `<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z"/>`,
};
const ico = (n: string, k = "") => `<svg class="st-ico ${k}" viewBox="0 0 24 24" aria-hidden="true">${I[n] ?? ""}</svg>`;

function wann(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86_400) return `vor ${Math.round(s / 3600)} Std.`;
  if (s < 7 * 86_400) return `vor ${Math.round(s / 86_400)} Tag${Math.round(s / 86_400) > 1 ? "en" : ""}`;
  return new Date(t).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
const datumZeit = (t: number) => new Date(t).toLocaleString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mb = (b: number) => (b < 1_048_576 ? `${Math.max(1, Math.round(b / 1024))} kB` : `${(b / 1_048_576).toLocaleString("de-AT", { maximumFractionDigits: 1 })} MB`);

function huelle(klasse: string): HTMLElement {
  const root = el("div", { class: `lw-ss lw-neu ${istDunkel() ? "dunkel" : "hell"} ${klasse}`, role: "dialog", "aria-modal": "true" });
  document.body.appendChild(root);
  return root;
}
function schliessbar(root: HTMLElement, fertig?: () => void): () => void {
  const zu = () => {
    if (!root.isConnected) return;
    root.classList.add("weg");
    document.removeEventListener("keydown", taste, true);
    setTimeout(() => root.remove(), 260);
    fertig?.();
  };
  const taste = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !document.querySelector(".dlg-overlay")) {
      e.stopPropagation();
      zu();
    }
  };
  document.addEventListener("keydown", taste, true);
  root.addEventListener("mousedown", (e) => e.target === root && zu());
  return zu;
}

/** Fenster: aktuelles Spiel unter einem Namen speichern */
export function speichernDialog(): Promise<string | null> {
  if (document.querySelector(".lw-ss.lw-ss-klein")) return Promise.resolve(null);
  return new Promise((ok) => {
    const root = huelle("lw-ss-klein");
    root.innerHTML = `<div class="lw-ss-karte">
      <div class="lw-ss-kopf"><h2>${ico("speichern")}Spielstand speichern</h2><button class="lw-ss-icon" data-a="zu" title="Schließen">${ico("zu")}</button></div>
      <label class="lw-ss-feld"><span>Name</span><input class="lw-ss-name" maxlength="80"></label>
      <p class="lw-ss-leise">Wird im Ordner <b class="lw-ss-pfad">Dokumente/LeitWerk/Spielstände</b> gespeichert – mit allen Einsätzen, Fahrzeugen und Daten.</p>
      <div class="lw-ss-knoepfe"><button class="lw-ss-knopf leise" data-a="zu">Abbrechen</button><button class="lw-ss-knopf" data-a="ok">${ico("speichern")}Speichern</button></div>
    </div>`;
    let fertigWert: string | null = null;
    const zu = schliessbar(root, () => ok(fertigWert));
    const name = root.querySelector<HTMLInputElement>(".lw-ss-name")!;
    name.value = spielstand.standardName();
    setTimeout(() => {
      name.focus();
      name.select();
    }, 50);
    void ordner.ordnerPfad().then((p) => (root.querySelector(".lw-ss-pfad")!.textContent = p));
    const speichern = async () => {
      const b = root.querySelector<HTMLButtonElement>('[data-a="ok"]')!;
      b.disabled = true;
      try {
        fertigWert = await spielstand.speichernAls(name.value);
        toast(`Gespeichert: ${fertigWert.replace(/\.leitwerk$/, "")}`);
        zu();
      } catch (e) {
        toast(String((e as Error)?.message ?? e), "error");
        b.disabled = false;
      }
    };
    name.addEventListener("keydown", (e) => e.key === "Enter" && void speichern());
    root.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
      if (a === "zu") zu();
      if (a === "ok") void speichern();
    });
  });
}

/**
 * Übersicht der Spielstände. `geladen` wird nach dem Laden aufgerufen.
 * `warnen`: vor dem Laden fragen, weil ein Spiel läuft.
 */
export function spielstaendeOeffnen(opt: { geladen?: (name: string) => void; warnen?: boolean } = {}): void {
  if (document.querySelector(".lw-ss.lw-ss-gross")) return;
  const root = huelle("lw-ss-gross");
  const gast = mp.status.rolle === "client";
  root.innerHTML = `<div class="lw-ss-karte">
    <div class="lw-ss-kopf">
      <div><h2>${ico("ordner")}Spielstände</h2><div class="lw-ss-pfad lw-ss-leise">…</div></div>
      <div class="lw-ss-kopf-knoepfe">
        ${inTauri() ? `<button class="lw-ss-knopf leise" data-a="ordner">${ico("ordner")}Ordner öffnen</button>` : ""}
        <button class="lw-ss-knopf leise" data-a="import">${ico("import")}Spielstand importieren …</button>
        <button class="lw-ss-icon" data-a="zu" title="Schließen (Esc)">${ico("zu")}</button>
      </div>
    </div>
    <div class="lw-ss-werkzeug"><label class="lw-ss-suche">${ico("suche")}<input type="search" placeholder="Spielstände durchsuchen …"></label><span class="lw-ss-anzahl lw-ss-leise"></span></div>
    ${gast ? `<div class="lw-ss-hinweis">Als Mitspieler kannst du keinen Spielstand laden – das macht der Host.</div>` : ""}
    <div class="lw-ss-liste"><div class="lw-ss-leer lw-ss-leise">Lade …</div></div>
  </div>`;
  const zu = schliessbar(root);
  const listeEl = root.querySelector<HTMLElement>(".lw-ss-liste")!;
  const suche = root.querySelector<HTMLInputElement>(".lw-ss-suche input")!;
  void ordner.ordnerPfad().then((p) => (root.querySelector(".lw-ss-pfad")!.textContent = p));

  let dateien: ordner.SpielstandDatei[] = [];
  let auto: Awaited<ReturnType<typeof spielstand.autosaveInfo>> = null;

  const chip = (i: string, t: string, k = "") => `<span class="lw-ss-chip ${k}">${ico(i, "klein")}${esc(t)}</span>`;
  const karte = (d: { titel: string; datei?: string; zeit: number; info: ordner.SpielstandInfo | null; groesse?: number; auto?: boolean }, nr: number) => {
    const i = d.info;
    const chips = [
      i?.funkgruppe ? chip("funk", i.funkgruppe) : "",
      i?.simZeit ? chip("uhr", `Spielzeit ${datumZeit(i.simZeit)}`) : "",
      i?.einsaetze !== undefined ? chip("liste", `${i.einsaetze} Einsätze${i.offen ? ` · ${i.offen} offen` : ""}`) : "",
      i?.wetter ? chip("wolke", i.wetter) : "",
      i?.spieler?.length ? chip("leute", i.spieler.join(", "), "mp") : "",
    ].join("");
    return `<article class="lw-ss-eintrag${d.auto ? " auto" : ""}" style="--d:${Math.min(nr, 12) * 0.04}s" ${d.datei ? `data-datei="${esc(d.datei)}"` : `data-auto="1"`}>
      <div class="lw-ss-symbol">${ico(d.auto ? "auto" : "datei")}</div>
      <div class="lw-ss-text">
        <div class="lw-ss-titel"><b>${esc(d.titel)}</b>${d.auto ? `<span class="lw-ss-badge">Automatisch</span>` : ""}</div>
        <div class="lw-ss-zeit lw-ss-leise" title="${esc(datumZeit(d.zeit))}">Gespeichert ${esc(wann(d.zeit))} · ${esc(datumZeit(d.zeit))}${d.groesse ? ` · ${mb(d.groesse)}` : ""}${i?.version ? ` · LeitWerk ${esc(i.version)}` : ""}</div>
        ${chips ? `<div class="lw-ss-chips">${chips}</div>` : `<div class="lw-ss-chips lw-ss-leise">ältere Datei – keine Details gespeichert</div>`}
      </div>
      <div class="lw-ss-aktionen">
        ${d.datei ? `<button class="lw-ss-icon" data-a="umbenennen" title="Umbenennen">${ico("stift")}</button><button class="lw-ss-icon" data-a="export" title="Exportieren (z. B. zum Weitergeben)">${ico("teilen")}</button><button class="lw-ss-icon gefahr" data-a="loeschen" title="Löschen">${ico("muell")}</button>` : ""}
        <button class="lw-ss-knopf" data-a="laden" ${gast ? "disabled" : ""}>${ico("laden")}Laden</button>
      </div>
    </article>`;
  };

  const zeichnen = () => {
    const q = suche.value.trim().toLowerCase();
    const passt = (t: string) => !q || q.split(/\s+/).every((w) => t.toLowerCase().includes(w));
    const teile: string[] = [];
    let n = 0;
    if (auto && passt("automatische sicherung autosave")) teile.push(karte({ titel: "Automatische Sicherung", zeit: auto.gespeichert, info: { einsaetze: auto.einsaetze }, auto: true }, n++));
    for (const d of dateien) {
      const titel = d.datei.replace(/\.leitwerk$/, "");
      if (!passt(`${titel} ${d.datei} ${d.info?.funkgruppe ?? ""} ${d.info?.spieler?.join(" ") ?? ""} ${datumZeit(d.info?.gespeichert ?? d.geaendert)}`)) continue;
      teile.push(karte({ titel, datei: d.datei, zeit: d.info?.gespeichert ?? d.geaendert, info: d.info, groesse: d.groesse }, n++));
    }
    root.querySelector(".lw-ss-anzahl")!.textContent = `${dateien.length} Spielstand${dateien.length === 1 ? "" : "e"}`;
    listeEl.innerHTML = teile.length
      ? teile.join("")
      : q
        ? `<div class="lw-ss-leer lw-ss-leise">Nichts gefunden.</div>`
        : `<div class="lw-ss-leer"><div class="lw-ss-leer-symbol">${ico("ordner")}</div><b>Noch keine Spielstände</b><span class="lw-ss-leise">Im Spiel über „Spiel“ → „Spielstand speichern“ – oder eine Datei importieren.</span></div>`;
  };
  const neuLaden = async () => {
    try {
      [dateien, auto] = await Promise.all([ordner.liste(), spielstand.autosaveInfo()]);
    } catch (e) {
      listeEl.innerHTML = `<div class="lw-ss-leer">Spielstände konnten nicht gelesen werden: ${esc(String((e as Error)?.message ?? e))}</div>`;
      return;
    }
    zeichnen();
  };
  suche.addEventListener("input", zeichnen);

  root.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-a]");
    if (!b) return;
    const a = b.dataset.a;
    const eintrag = b.closest<HTMLElement>(".lw-ss-eintrag");
    const datei = eintrag?.dataset.datei;
    try {
      if (a === "zu") zu();
      else if (a === "ordner") await ordner.ordnerZeigen();
      else if (a === "import") {
        const r = await ordner.importieren();
        for (const f of r.fehler) toast(f, "error");
        if (r.ok.length) {
          toast(r.ok.length === 1 ? `Importiert: ${r.ok[0].replace(/\.leitwerk$/, "")}` : `${r.ok.length} Spielstände importiert`);
          await neuLaden();
          root.querySelector(`[data-datei="${CSS.escape(r.ok[0])}"]`)?.classList.add("neu");
        }
      } else if (a === "laden") {
        if (opt.warnen && !(await confirmDialog("Spielstand laden", "Das laufende Spiel wird dabei ersetzt. Vorher speichern? Das geht über „Spiel“ → „Spielstand speichern“.", "Laden"))) return;
        b.disabled = true;
        const titel = eintrag?.querySelector(".lw-ss-titel b")?.textContent ?? "";
        if (datei) await spielstand.ladenDatei(datei);
        else await spielstand.autosaveLaden();
        toast(`Geladen: ${titel}`);
        zu();
        opt.geladen?.(titel);
      } else if (a === "loeschen" && datei) {
        const titel = eintrag?.querySelector(".lw-ss-titel b")?.textContent ?? datei;
        if (!(await confirmDialog("Spielstand löschen", `„${titel}“ wird endgültig gelöscht.`, "Löschen", true))) return;
        eintrag!.classList.add("weg");
        await ordner.loeschen(datei);
        setTimeout(() => void neuLaden(), 220);
      } else if (a === "export" && datei) {
        const p = await spielstand.exportieren(datei);
        if (p) toast("Exportiert");
      } else if (a === "umbenennen" && datei && eintrag) {
        const t = eintrag.querySelector<HTMLElement>(".lw-ss-titel")!;
        const alt = t.querySelector("b")!.textContent ?? "";
        t.innerHTML = `<input class="lw-ss-umbenennen" maxlength="80">`;
        const inp = t.querySelector<HTMLInputElement>("input")!;
        inp.value = alt;
        inp.focus();
        inp.select();
        let fertig = false;
        const ende = async (speichern: boolean) => {
          if (fertig) return;
          fertig = true;
          if (speichern && inp.value.trim() && inp.value.trim() !== alt) {
            try {
              const neu = await ordner.umbenennen(datei, inp.value.trim());
              // die Übersicht zeigt den Dateinamen
              const d = dateien.find((x) => x.datei === datei);
              if (d) d.datei = neu;
            } catch (err) {
              toast(String((err as Error)?.message ?? err), "error");
            }
          }
          zeichnen();
        };
        inp.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") void ende(true);
          if (ev.key === "Escape") {
            ev.stopPropagation();
            void ende(false);
          }
        });
        inp.addEventListener("blur", () => void ende(true));
      }
    } catch (err) {
      toast(String((err as Error)?.message ?? err), "error");
      b.disabled = false;
    }
  });
  void neuLaden();
}
