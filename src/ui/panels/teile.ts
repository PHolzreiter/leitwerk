/** Kleine Bausteine, die mehrere Fenster brauchen (Statusfarben, Besetzung, Adresssuche, Statusmenü). */
import { ALLE_QUALIS, REGELN, besetzungKurz, generiereBesetzung, hatNFS, pruefeBesetzung, type Platz, type Quali } from "../../sim/crew";
import { sim, type Einsatz, type Ort, type SimFahrzeug } from "../../sim/engine";
import { aktuelleSchicht } from "../../sim/dienst";
import { mp } from "../../net/mehrspieler";
import { searchAddress, type AddressHit } from "../../sim/geo";
import type { StatusKey } from "../../sim/settings";
import { openDialog } from "../dialog";
import { el, esc, toast } from "../dom";

const STUFE_FARBE: Record<string, string> = {
  rot: "#e53935",
  orange: "#fb8c00",
  gelb: "#fdd835",
  grün: "#7cb342",
};

export function stufeFarbe(stufe: string | undefined): string {
  if (!stufe) return "#6b7280";
  for (const [k, v] of Object.entries(STUFE_FARBE)) if (stufe.includes(k)) return v;
  return "#90a4ae";
}

export function uhr(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

export function minuten(sek: number | null): string {
  if (sek === null) return "–";
  return `${Math.max(1, Math.round(sek / 60))} min`;
}

export function crewHtml(fz: SimFahrzeug): string {
  if (!fz.besetzung.length) return "";
  const nfs = hatNFS(fz.besetzung);
  return `<span class="crew${nfs ? " nfs" : ""}" title="${esc(fz.besetzung.map((p) => `${p.rolle}: ${p.quali}`).join("\n"))}">${esc(besetzungKurz(fz.besetzung))}</span>`;
}

/** Dialog „Besetzung ändern“ */
export function besetzungDialog(fz: SimFahrzeug): void {
  const regeln = REGELN[fz.rmTyp];
  const body = el("div", { class: "crew-edit" });
  const intro = el("div", { class: "muted" }, `${fz.funkrufname} · ${fz.rmTyp}. Leere Auswahl = Platz nicht besetzt.`);
  body.appendChild(intro);
  const selects: { rolle: string; sel: HTMLSelectElement }[] = [];
  const rollen = regeln.length ? regeln.map((r) => r.rolle) : fz.besetzung.map((p) => p.rolle);
  for (const rolle of rollen) {
    const row = el("label", { class: "crew-row" });
    row.appendChild(el("span", {}, rolle));
    const sel = el("select");
    sel.appendChild(el("option", { value: "" }, "– nicht besetzt –"));
    for (const q of ALLE_QUALIS) sel.appendChild(el("option", { value: q }, q));
    sel.value = fz.besetzung.find((p) => p.rolle === rolle)?.quali ?? "";
    row.appendChild(sel);
    selects.push({ rolle, sel });
    body.appendChild(row);
  }
  const warn = el("div", { class: "alert-text" });
  body.appendChild(warn);
  const lese = (): Platz[] =>
    selects.filter((x) => x.sel.value).map((x) => ({ rolle: x.rolle, quali: x.sel.value as Quali }));
  const pruefe = () => {
    warn.textContent = pruefeBesetzung(fz.rmTyp, lese()).join(" · ");
  };
  selects.forEach((x) => x.sel.addEventListener("change", pruefe));
  pruefe();
  openDialog({
    title: "Besetzung ändern",
    body,
    actions: [
      {
        label: "Zufällig neu",
        onClick: () => {
          const b = generiereBesetzung(fz.rmTyp);
          for (const x of selects) x.sel.value = b.find((p) => p.rolle === x.rolle)?.quali ?? "";
          pruefe();
          return false;
        },
      },
      { label: "Abbrechen" },
      {
        label: "Übernehmen",
        kind: "primary",
        onClick: () => {
          void sim.call("setzeBesetzung", fz.id, lese()).catch((e) => toast(String(e.message ?? e), "error"));
          toast(`Besetzung ${fz.funkrufname} geändert`);
        },
      },
    ],
  });
}

/** Fehler eines Befehls (z. B. keine Berechtigung im Multiplayer) als Meldung zeigen */
export async function fehlerZeigen(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (e) {
    toast(String((e as Error).message ?? e), "error");
  }
}

/** Multiplayer: wer arbeitet an dem Einsatz (offline = Entwurf, den andere übernehmen können) */
export function bearbeiterHtml(e: Einsatz): string {
  if (!mp.aktiv || !e.bearbeiter || e.zustand === "abgeschlossen") return "";
  const sp = mp.spieler.find((s) => s.pid === e.bearbeiter!.pid);
  const ich = e.bearbeiter.pid === mp.ich.pid;
  if (sp && !sp.online) return `<div class="bearbeiter entwurf">Entwurf von ${esc(e.bearbeiter.name)} (offline) – kann übernommen werden</div>`;
  return `<div class="bearbeiter${ich ? " ich" : ""}">👤 ${ich ? "du" : esc(e.bearbeiter.name)}</div>`;
}

/** Alarmiert, aber noch nicht ausgerückt (auf Wache / über Funk) – ohne Nummer, Zeile gelb */
export function istAlarmiert(fz: SimFahrzeug): boolean {
  return fz.status === "alarmWache" || fz.status === "alarmFunk";
}

/** Fahrzeug ist über Funk erreichbar (Frei Funk, über Funk alarmiert) – Name rot */
export function istFunkStatus(fz: SimFahrzeug): boolean {
  return fz.status === "freiFunk" || fz.status === "alarmFunk";
}

/** Zusatzklassen für eine Fahrzeugzeile */
export function fzKlassen(fz: SimFahrzeug): string {
  return `${istAlarmiert(fz) ? " fz-alarmiert" : ""}${istFunkStatus(fz) ? " fz-funk" : ""}`;
}

/** Fahrzeug für einen Krankentransport vorgemerkt (noch nicht unterwegs): kleines Schild mit Abfahrt */
export function vorgemerktHtml(fz: SimFahrzeug): string {
  const p = fz.kt;
  if (!p || p.aktiv || !p.fahrten.length) return "";
  const n = p.fahrten.flat().length;
  const ab = p.losUm ? ` ab ${new Date(p.losUm).toTimeString().slice(0, 5)}` : "";
  return ` <span class="kt-fz vorgemerkt" title="Für ${n} Krankentransport${n > 1 ? "e" : ""} vorgemerkt – wird beim Alarmieren für einen Notfall gelöst">KT vorgemerkt${ab}</span>`;
}

/** Fahrzeugtyp zur Anzeige: „KTW-B“, „RTW“ (Großraum mit Hinweis), „RTW-C“ … */
export function typText(fz: SimFahrzeug): string {
  return fz.typ ?? fz.rmTyp;
}

/** Typ als HTML (mit Hinweis beim Draufzeigen) */
export function typHtml(fz: SimFahrzeug): string {
  const t = typText(fz);
  const titel = fz.ohneBlaulicht ? "KTW-B – Zivildienst, fährt ohne Blaulicht" : fz.rmTyp === "RTW" && fz.gross ? "RTW (Großraum, VW Crafter)" : fz.rmTyp === "RTW" && fz.gross === false ? "RTW (VW T6 Hochdach)" : "";
  return titel ? `<span title="${esc(titel)}">${esc(t)}</span>` : esc(t);
}

/**
 * Hinweis vor Dienstende: eine Stunde vorher ein dezentes Uhr-Symbol, 30 Minuten vorher deutlicher.
 * Außer Dienst: „außer Dienst bis …“.
 */
export function dienstHtml(fz: SimFahrzeug): string {
  const t = sim.state.zeit;
  const hhmm = (x: number) => new Date(x).toTimeString().slice(0, 5);
  if (fz.ausserDienst && fz.ersatzFuer) return ` <span class="dienst-aus" title="Ersatz-NEF für ${esc(fz.ersatzFuer)}: wird angemeldet, wenn der Hubschrauber nicht fliegen kann (Wetter, Nacht)">nur bei Flugverbot</span>`;
  if (fz.ersatzFuer && !fz.ausserDienst) return ` <span class="dienst-ende st1" title="Ersatz für ${esc(fz.ersatzFuer)} – der Hubschrauber kann gerade nicht fliegen">statt ${esc(fz.ersatzFuer)}</span>`;
  if (fz.ausserDienst) {
    const b = fz.dienstBeginn;
    const tag = b && new Date(b).toDateString() !== new Date(t).toDateString() ? `${["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(b).getDay()]} ` : "";
    return ` <span class="dienst-aus" title="Laut Dienstplan nicht im Dienst${b ? ` – Dienstbeginn ${tag}${hhmm(b)}` : ""}">außer Dienst${b ? ` bis ${tag}${hhmm(b)}` : ""}</span>`;
  }
  // aktuelle Schicht immer sichtbar; kurz vor Dienstende hervorgehoben. Länger darüber: Wochenübersicht
  const w = aktuelleSchicht(sim.dienstplanVon(fz.id), t, fz.heim);
  const schicht = w ? `${hhmm(w.start).replace(/:00$/, "")}–${hhmm(w.ende).replace(/:00$/, "")}` : "";
  const e = fz.dienstEnde;
  const rest = e ? (e - t) / 60_000 : Infinity;
  const stufe = rest <= 30 && rest >= -1 ? 2 : rest <= 60 && rest >= -1 ? 1 : 0;
  if (!schicht) return "";
  const titel = e ? `Schicht ${schicht} · Dienstende ${hhmm(e)}${stufe ? ` (in ${Math.max(0, Math.round(rest))} min)` : ""}` : `Schicht ${schicht} (rund um die Uhr)`;
  return ` <span class="dienst-schicht${stufe ? ` dienst-ende st${stufe}` : ""}" data-dienstfz="${esc(fz.id)}" data-titel="${esc(titel)}">◷ ${schicht}</span>`;
}

export function statusChip(fz: SimFahrzeug): string {
  const d = sim.statusDef(fz.status);
  // alarmiert: gleich breites Kästchen ohne Nummer, damit die Namen untereinander bleiben
  const nr = istAlarmiert(fz) ? "" : d.nummer;
  return `<span class="st-chip" style="background:${d.farbe}" title="${esc(d.name)}">${esc(nr) || "&nbsp;"}</span>`;
}

/** Adress-Eingabe mit Vorschlägen. */
export function addressInput(placeholder: string, onPick: (o: Ort) => void): { root: HTMLElement; input: HTMLInputElement } {
  const root = el("div", { class: "addr" });
  const input = el("input", { type: "text", placeholder });
  const list = el("div", { class: "addr-list", hidden: "" });
  root.append(input, list);
  let timer: number | undefined;
  let hits: AddressHit[] = [];
  const choose = (h: AddressHit) => {
    input.value = h.label;
    list.hidden = true;
    onPick({ lat: h.lat, lon: h.lon, label: h.label });
  };
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      try {
        hits = await searchAddress(input.value, 12);
      } catch (e) {
        hits = [];
        list.innerHTML = `<div class="addr-item muted">${esc(String(e))}</div>`;
        list.hidden = false;
        return;
      }
      list.innerHTML = "";
      for (const h of hits) {
        const it = el("div", { class: "addr-item" }, h.label);
        if (h.place) it.classList.add("place");
        it.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          choose(h);
        });
        list.appendChild(it);
      }
      list.hidden = hits.length === 0;
    }, 250);
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && hits[0]) {
      ev.preventDefault();
      choose(hits[0]);
    }
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  return { root, input };
}

/** Rechtsklick auf ein Fahrzeug: Status setzen, Besetzung, freigeben */
export function statusMenu(fz: SimFahrzeug, x: number, y: number) {
  document.querySelector(".ctx-menu.status")?.remove();
  const m = el("div", { class: "ctx-menu status" });
  m.style.position = "fixed";
  m.style.left = `${x}px`;
  m.style.top = `${y}px`;
  m.appendChild(el("div", { class: "ctx-title" }, `${fz.funkrufname} – Status setzen`));
  for (const key of ["freiWache", "freiFunk", "bereitschaft", "dienstfahrt", "abgemeldet"] as StatusKey[]) {
    const d = sim.statusDef(key);
    const b = el("button", {}, `${d.nummer} – ${d.name}`);
    b.addEventListener("click", async () => {
      m.remove();
      const err = await sim.call("manualStatus", fz.id, key).catch((x) => String(x.message ?? x));
      if (err) toast(err, "error");
    });
    m.appendChild(b);
  }
  if (fz.besetzung.length || REGELN[fz.rmTyp].length) {
    const b = el("button", {}, "Besetzung ändern …");
    b.addEventListener("click", () => {
      m.remove();
      besetzungDialog(fz);
    });
    m.appendChild(b);
  }
  if (fz.einsatzId) {
    const b = el("button", {}, "Aus dem Einsatz freigeben");
    b.addEventListener("click", () => {
      m.remove();
      void fehlerZeigen(sim.call("entlasse", fz.id));
    });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  setTimeout(() => document.addEventListener("mousedown", function off(ev) {
    if (!m.contains(ev.target as Node)) {
      m.remove();
      document.removeEventListener("mousedown", off);
    }
  }), 0);
}

