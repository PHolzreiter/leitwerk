/**
 * Hauptmenü: „Entwicklungsfortschritt“ (live aus dem Ticket-Dienst, mit Fortschrittsbalken und Knopf für
 * Ideen und Wünsche) und „Changelog“ (alle Updates kompakt, mit Titeln – ohne Quellenangaben).
 */
import updates from "../data/updates.json";
import { fortschrittLaden, type FortschrittPunkt } from "../net/tickets";
import { openDialog } from "./dialog";
import { el, esc } from "./dom";
import { mithelfenOeffnen } from "./mithelfen";

export interface UpdateEintrag {
  version: string;
  datum?: string;
  titel: string;
  punkte: string[];
}

export const UPDATES = updates as UpdateEintrag[];

function punktHtml(p: FortschrittPunkt): string {
  const pz = Math.round(p.prozent);
  return `<div class="fs-punkt" data-id="${esc(p.id)}">
    <div class="fs-kopf"><b>${esc(p.titel)}</b><span class="fs-pz">${pz} %</span></div>
    <div class="fs-balken" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pz}"><span style="width:${pz}%"></span></div>
    ${p.text ? `<div class="fs-text">${esc(p.text)}</div>` : ""}
  </div>`;
}

/** Fenster „Entwicklungsfortschritt“ */
export function fortschrittOeffnen(): void {
  const body = el("div", { class: "fs" });
  body.innerHTML = `<p class="muted">Lädt …</p>`;
  const zeigen = (punkte: FortschrittPunkt[], live: boolean) => {
    const gruppe = (stand: FortschrittPunkt["stand"], titel: string) => {
      const l = punkte.filter((p) => p.stand === stand);
      return l.length ? `<section class="fs-gruppe fs-${stand}"><h3>${titel}</h3>${l.map(punktHtml).join("")}</section>` : "";
    };
    body.innerHTML = `${gruppe("arbeit", "In Arbeit")}${gruppe("geplant", "Geplant")}${gruppe("fertig", "Gerade fertig geworden")}
      ${live ? "" : `<p class="muted small">Ohne Verbindung – zuletzt bekannter Stand.</p>`}`;
    const idee = el("div", { class: "fs-idee" });
    idee.innerHTML = `<div><b>Hast du eine Idee oder einen Wunsch?</b><div class="muted small">Schick sie uns – du siehst unter „Meine Tickets“, was daraus wird.</div></div>`;
    const b = el("button", { class: "btn primary", type: "button" }, "Idee oder Wunsch schicken");
    b.addEventListener("click", () => {
      dlg.close();
      mithelfenOeffnen({ reiter: "idee" });
    });
    idee.appendChild(b);
    body.appendChild(idee);
  };
  const dlg = openDialog({ title: "Entwicklungsfortschritt", body, wide: true, actions: [{ label: "Schließen" }] });
  dlg.root.parentElement?.classList.add("fs-dlg");
  void fortschrittLaden().then((r) => zeigen(r.punkte, r.live));
}

const datumText = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("de-AT", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Fenster „Changelog“: alle Updates, neueste zuerst */
export function changelogOeffnen(): void {
  const body = el("div", { class: "cl" });
  const such = el("input", { type: "search", class: "cl-suche", placeholder: "Updates durchsuchen …" }) as HTMLInputElement;
  const liste = el("div", { class: "cl-liste" });
  body.append(such, liste);
  const zeigen = () => {
    const q = such.value.trim().toLowerCase();
    const l = UPDATES.filter((u) => !q || `${u.version} ${u.titel} ${u.punkte.join(" ")}`.toLowerCase().includes(q));
    liste.innerHTML = l.length
      ? l
          .map(
            (u, i) => `<article class="cl-eintrag${i === 0 && !q ? " neu" : ""}">
          <header><span class="cl-version">v${esc(u.version)}</span><h3>${esc(u.titel)}</h3><span class="cl-datum">${esc(datumText(u.datum))}</span></header>
          <ul>${u.punkte.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        </article>`,
          )
          .join("")
      : `<p class="muted">Nichts gefunden.</p>`;
  };
  such.addEventListener("input", zeigen);
  zeigen();
  const dlg = openDialog({ title: "Changelog", body, wide: true, actions: [{ label: "Schließen" }] });
  dlg.root.parentElement?.classList.add("cl-dlg");
}
