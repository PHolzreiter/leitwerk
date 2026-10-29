/**
 * Großeinsatz (ab NF5): eigener Reiter mit Bereitstellungsraum, Lagemeldung, Patientenliste (je Patient buchen),
 * Voraviso an die Krankenhäuser und den Kräften am Berufungsort und im Bereitstellungsraum.
 * Dazu der zweite Funk-Reiter für die Sprechgruppe Großeinsatz (mit „mithören“).
 */
import { store } from "../../data/store";
import { sim, type Einsatz, type SimFahrzeug } from "../../sim/engine";
import { distanceM } from "../../sim/geo";
import { gsPatientText, type GsPatient } from "../../sim/grossschaden";
import { belegt, plaetze, RESSOURCEN, istVoravisiert } from "../../sim/khStatus";
import { openDialog } from "../dialog";
import { el, esc } from "../dom";
import { createFunkView } from "../funkView";
import { gsMithoerenAn, gsMithoerenSetzen } from "../sprechfunk";
import { panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { IST_HAUPT } from "../ws/bus";
import { karteWaehlen, karteZeigen, waehle } from "../ws/auswahl";
import { khBuchung } from "./masken";
import { addressInput, fehlerZeigen, uhr } from "./teile";

const FARBE: Record<GsPatient["sichtung"], string> = { rot: "rot", gelb: "gelb", gruen: "grün", tot: "tot" };

/** Großeinsätze, die gerade laufen (bzw. vor kurzem zu Ende gegangen sind) */
export function grosseinsaetze(): Einsatz[] {
  const t = sim.state.zeit;
  return sim.state.einsaetze.filter((e) => e.gs && !e.gs.aufgehoben && !e.gsKind && (e.zustand !== "abgeschlossen" || (e.gs.ende && t - e.gs.ende < 60 * 60_000)));
}

/** Einsatz eines Patienten (Buchung, Transport) */
function kindVon(e: Einsatz, nr: number): Einsatz | undefined {
  const id = e.gs?.kinder[nr];
  return id ? sim.einsatz(id) : undefined;
}

function fzVon(e: Einsatz): SimFahrzeug[] {
  return e.fahrzeuge.map((id) => sim.state.fahrzeuge[id]).filter((f): f is SimFahrzeug => !!f && f.einsatzId === e.id);
}

/** Was mit dem Patienten gerade passiert */
function transportText(e: Einsatz, p: GsPatient): string {
  if (p.sichtung === "tot") return "verstorben";
  const k = kindVon(e, p.nr);
  if (!k) return "–";
  if (k.zustand === "abgeschlossen") return "übergeben";
  const fz = fzVon(k);
  if (!fz.length) {
    const ab = e.gs?.erreichbar[p.nr];
    if (ab === undefined || ab > sim.state.zeit) return p.fw ? "wird von der Feuerwehr gerettet" : "wartet";
    return "wartet auf Transport";
  }
  const wer = fz.map((f) => esc(f.funkrufname)).join(" + ");
  if (fz.some((f) => f.status === "zumZO")) return `Transport · ${wer}`;
  if (fz.some((f) => f.status === "amZO")) return `im Krankenhaus · ${wer}`;
  if (fz.some((f) => f.phase === "warteKH")) return `transportbereit · ${wer}`;
  return `in Versorgung · ${wer}`;
}

/** Krankenhaus buchen für einen Patienten: das normale Buchungsmenü im Pop-up */
function buchenDialog(k: Einsatz, titel: string): void {
  let dlg: ReturnType<typeof openDialog> | null = null;
  const teil = khBuchung(k, { kompakt: true, gebucht: () => dlg?.close() });
  dlg = openDialog({ title: titel, body: teil.root, actions: [{ label: "Schließen" }], wide: true });
  const aus = sim.onChange(() => {
    if (!teil.root.isConnected) return aus();
    teil.refresh();
  });
}

function grosseinsatz(ctx: PanelKontext) {
  const root = el("div", { class: "pl gs-fenster" });
  const body = el("div", { class: "pl-body gs-body" });
  root.appendChild(body);
  let fuer: string | null = null;
  let teile: { refresh(): void } | null = null;

  const bauen = (e: Einsatz) => {
    body.innerHTML = "";
    const kopf = el("div", { class: "gs-kopf" });
    // Bereitstellungsraum
    const brBox = el("div", { class: "mask-box gs-br" });
    const brText = el("div", { class: "gs-br-text" });
    const adr = addressInput("Bereitstellungsraum: Adresse suchen …", (o) => void fehlerZeigen(sim.call("gsBr", e.id, { ...o, label: `Bereitstellungsraum ${o.label}` })));
    const bKarte = el("button", { class: "btn small", type: "button", title: "Karte zum Einsatzort, dann den Bereitstellungsraum anklicken" }, "🗺 Auf der Karte");
    bKarte.addEventListener("click", async () => {
      const bo = e.adresse ?? { lat: e.wahr.lat, lon: e.wahr.lon };
      panelZeigen("karte", { nurWennOffen: true });
      karteZeigen(bo.lat, bo.lon, 15);
      const p = await karteWaehlen("Bereitstellungsraum anklicken");
      if (p) void fehlerZeigen(sim.call("gsBr", e.id, { lat: p.lat, lon: p.lon, label: `Bereitstellungsraum (Karte, ${Math.round(distanceM(p, bo))} m vom Einsatzort)` }));
    });
    const bVorschlag = el("button", { class: "btn small primary", type: "button", title: "ca. 500 m vom Einsatzort, auf der Seite, von der die Fahrzeuge kommen" }, "Vorschlag übernehmen");
    bVorschlag.addEventListener("click", () => {
      const v = sim.gsBrVorschlag(e.id);
      if (v) void fehlerZeigen(sim.call("gsBr", e.id, v));
    });
    const brZeile = el("div", { class: "row-btns gs-br-zeile" });
    brZeile.append(adr.root, bKarte, bVorschlag);
    brBox.append(el("div", { class: "box-title" }, "Bereitstellungsraum"), brText, brZeile);

    // Lagemeldung
    const lageBox = el("div", { class: "mask-box gs-lage" });
    const lage = el("textarea", { class: "gs-lagetext", rows: "6", placeholder: "Sicht- und Lagemeldungen der Einsatzleitung kommen automatisch hierher; du kannst ergänzen." }) as HTMLTextAreaElement;
    let lageTimer: number | undefined;
    lage.addEventListener("input", () => {
      window.clearTimeout(lageTimer);
      lageTimer = window.setTimeout(() => void fehlerZeigen(sim.call("gsLageText", e.id, lage.value)), 700);
    });
    const meldungen = el("div", { class: "gs-meldungen" });
    lageBox.append(el("div", { class: "box-title" }, "Lagemeldung"), lage, meldungen);

    // Patienten
    const patBox = el("div", { class: "mask-box gs-pat" });
    const patKopf = el("div", { class: "gs-pat-kopf" });
    const patListe = el("div", { class: "gs-pat-liste" });
    patBox.append(el("div", { class: "box-title" }, "Patienten"), patKopf, patListe);
    patListe.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-buchen]");
      if (!b) return;
      const nr = Number(b.dataset.buchen);
      const k = kindVon(e, nr);
      const p = e.wahr.gs?.patienten.find((x) => x.nr === nr);
      if (k && p) buchenDialog(k, `Krankenhaus buchen – ${gsPatientText(p)}`);
    });

    // Kräfte
    const kraftBox = el("div", { class: "mask-box gs-kraefte" });
    const kraefte = el("div");
    kraftBox.append(el("div", { class: "box-title" }, "Kräfte"), kraefte);

    // Voraviso
    const khBox = el("div", { class: "mask-box gs-kh" });
    const khListe = el("div", { class: "gs-kh-liste" });
    khBox.append(el("div", { class: "box-title" }, "Krankenhäuser · Voraviso (150 % der Plätze, keine Selbstzuweiser)"), khListe);
    khListe.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-voraviso]");
      if (!b) return;
      void fehlerZeigen(sim.call("gsVoraviso", e.id, b.dataset.voraviso!, b.dataset.an === "1"));
    });

    const anrufe = el("div", { class: "gs-anrufe muted small" });
    body.append(kopf, brBox, patBox, lageBox, kraftBox, khBox, anrufe);

    let khKey = "";
    const refresh = () => {
      const gs = e.gs;
      if (!gs) return;
      const w = e.wahr.gs;
      const phase = gs.phase === "alarm" ? "Anfahrt" : gs.phase === "sicht" ? "Sichtmeldung – Lageerkundung" : gs.phase === "lage" ? "Lage erkundet – Abtransport läuft" : "alle Patienten abtransportiert";
      kopf.innerHTML = `<div class="gs-titel"><span class="gs-stufe">${esc(gs.stufe ?? "Großeinsatz")}</span> <b>${esc(e.nummer)}</b> <span class="muted">${esc(e.adresse?.label ?? e.meldung.adresse)}</span></div><div class="muted small">${esc(phase)}${e.zustand === "abgeschlossen" ? " · Einsatz abgeschlossen" : ""}</div>`;
      kopf.onclick = () => waehle("einsatz", e.id);
      // BR
      brBox.classList.toggle("blinkt", gs.brNoetig && !gs.br);
      brText.innerHTML = gs.br
        ? `🅿 <b>${esc(gs.br.label)}</b>`
        : gs.brNoetig
          ? `<span class="alert-text">Kein Bereitstellungsraum – alarmierte Fahrzeuge warten auf der Dienststelle!</span>`
          : `<span class="muted">Noch nicht festgelegt. Alles außer der Schnelleinsatzgruppe (1 BEL, 2 NEF, 3 RTW) fährt in den Bereitstellungsraum.</span>`;
      // Lagemeldung
      if (document.activeElement !== lage && lage.value !== gs.lageText) lage.value = gs.lageText;
      meldungen.innerHTML = gs.meldungen
        .slice(-6)
        .reverse()
        .map((m) => `<div class="gs-meldung ${m.art}"><span class="muted">${uhr(m.zeit)}</span> <b>${esc(m.von)}</b> ${esc(m.text)}</div>`)
        .join("");
      // Patienten
      const pat = (w?.patienten ?? []).filter((p) => gs.gezeigt.includes(p.nr));
      const n = (s: GsPatient["sichtung"]) => pat.filter((p) => p.sichtung === s).length;
      const nf = (e.nachforderungen ?? []).filter((x) => !x.erledigt);
      patKopf.innerHTML = gs.phase === "alarm" || gs.phase === "sicht"
        ? `<span class="muted">Die Einsatzleitung meldet die Patienten nach der Lagemeldung.</span>`
        : `<span class="gs-chip rot">${n("rot")} rot</span><span class="gs-chip gelb">${n("gelb")} gelb</span><span class="gs-chip gruen">${n("gruen")} grün</span>${n("tot") ? `<span class="gs-chip tot">${n("tot")} tot</span>` : ""}<span class="muted"> · ${pat.length} von ${w?.patienten.length ?? "?"} gemeldet</span>${nf.length ? `<div class="nachforderung">⚠ Nachforderung: ${nf.map((x) => (x.art === "NA" ? `${x.anzahl} Notarztmittel` : `${x.anzahl} Rettungsmittel`)).join(", ")} in den Bereitstellungsraum</div>` : ""}`;
      const rang = { rot: 0, gelb: 1, gruen: 2, tot: 3 };
      patListe.innerHTML = pat
        .sort((a, b) => rang[a.sichtung] - rang[b.sichtung] || a.nr - b.nr)
        .map((p) => {
          const k = kindVon(e, p.nr);
          const h = k?.kh ? store.get("hospitals", k.kh.hospitalId) : undefined;
          const kh = p.sichtung === "tot" ? "" : h ? `<span class="gs-kh-name" title="${esc(h.name)}">🏥 ${esc(h.kurzname || h.name)}</span>` : k && k.zustand !== "abgeschlossen" ? `<button class="btn small${k.khAnfrage ? " primary blinkt" : ""}" data-buchen="${p.nr}">Buchen</button>` : "";
          return `<div class="gs-p ${p.sichtung}"><span class="gs-nr">${p.nr}</span><span class="gs-chip ${p.sichtung}">${FARBE[p.sichtung]}</span><span class="gs-p-text"><b>ca. ${p.alter} J., ${p.geschlecht === "w" ? "w" : "m"}</b> · ${esc(p.muster)}<br><span class="muted small">${transportText(e, p)}</span></span><span class="gs-p-kh">${kh}</span></div>`;
        })
        .join("") || `<div class="muted small">Noch keine Patienten gemeldet.</div>`;
      // Kräfte: Berufungsort, Bereitstellungsraum, Anfahrt
      const alle = fzVon(e);
      const bo = alle.filter((f) => f.phase === "vorOrt");
      const br = alle.filter((f) => f.phase === "wartetBR");
      const anf = alle.filter((f) => f.phase !== "vorOrt" && f.phase !== "wartetBR");
      const liste = (l: SimFahrzeug[]) => l.map((f) => `<span class="gs-fz${f.id === gs.el ? " el" : ""}" title="${f.id === gs.el ? "Einsatzleitung" : esc(f.typ ?? f.rmTyp)}">${esc(f.funkrufname)}${f.id === gs.el ? " (EL)" : ""}</span>`).join(" ") || `<span class="muted">–</span>`;
      kraefte.innerHTML = `<div><b>Berufungsort:</b> ${liste(bo)}</div><div><b>Bereitstellungsraum:</b> ${liste(br)}</div><div><b>Anfahrt:</b> ${liste(anf)}</div>`;
      // Krankenhäuser in der Nähe
      const pos = e.adresse ?? { lat: e.wahr.lat, lon: e.wahr.lon };
      const t = sim.state.zeit;
      const haeuser = store
        .list("hospitals")
        .filter((h) => sim.khImNetz(h) && (h.einrichtungen ?? []).length)
        .map((h) => ({ h, km: distanceM(pos, h) / 1000 }))
        .filter((x) => x.km < 70)
        .sort((a, b) => a.km - b.km)
        .slice(0, 8);
      const key = JSON.stringify([gs.voraviso, Math.floor(t / 60_000), haeuser.map((x) => x.h.id)]);
      if (key !== khKey) {
        khKey = key;
        khListe.innerHTML = haeuser
          .map(({ h, km }) => {
            let gesamt = 0;
            let frei = 0;
            for (const r of RESSOURCEN) {
              const n = plaetze(h, r.id);
              gesamt += n;
              frei += Math.max(0, n - belegt(sim.state.khBelegung, h.id, r.id, t));
            }
            const an = gs.voraviso.includes(h.id) || istVoravisiert(h.id);
            return `<div class="gs-khz${an ? " an" : ""}"><span><b>${esc(h.kurzname || h.name)}</b> <span class="muted">${km.toFixed(0)} km · ${frei}/${gesamt} frei</span></span><button class="btn small${an ? " primary" : ""}" data-voraviso="${esc(h.id)}" data-an="${an ? "0" : "1"}">${an ? "✓ voravisiert" : "Voraviso"}</button></div>`;
          })
          .join("");
      }
      anrufe.innerHTML = (e.weitereAnrufe ?? []).length ? `Weitere Notrufe zusammengelegt: ${e.weitereAnrufe!.map((a) => `${esc(a.nummer)} (${uhr(a.zeit)})`).join(", ")}` : "";
    };
    refresh();
    return { refresh };
  };

  const zeigen = () => {
    const l = grosseinsaetze();
    const e = l.find((x) => x.id === fuer) ?? l[0];
    ctx.setzeBadge(l.some((x) => x.gs?.brNoetig && !x.gs.br) || l.some((x) => Object.values(x.gs?.kinder ?? {}).some((id) => sim.einsatz(id)?.khAnfrage)) ? "!" : null, "warn");
    if (!e) {
      fuer = null;
      teile = null;
      body.innerHTML = `<div class="muted pad">Kein Großeinsatz. Ab 6 Betroffenen (NF5) wird ein Einsatz zum Großeinsatz: dann stehen hier Bereitstellungsraum, Lagemeldung, Patienten und Voraviso.</div>`;
      return;
    }
    if (e.id !== fuer || !teile) {
      fuer = e.id;
      teile = bauen(e);
      ctx.setzeTitel(`Großeinsatz ${e.nummer}`);
    } else teile.refresh();
  };
  let wartet = false;
  const aus = sim.onChange(() => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      zeigen();
    }, 500);
  });
  zeigen();
  return { el: root, dispose: () => aus() };
}

function funkGs(ctx: PanelKontext) {
  const root = el("div", { class: "pl funk-fenster" });
  const kopf = el("label", { class: "gs-mithoeren small" });
  const cb = el("input", { type: "checkbox" }) as HTMLInputElement;
  cb.checked = gsMithoerenAn();
  cb.addEventListener("change", () => gsMithoerenSetzen(cb.checked));
  kopf.append(cb, document.createTextNode(" mithören (Funkverkehr der Sprechgruppe vorlesen)"));
  const body = el("div", { class: "pl-body" });
  root.append(kopf, body);
  const v = createFunkView(body, { select: (id) => waehle("einsatz", id, { maske: false }) }, { kanal: "gs" });
  let wartet = false;
  const aus = sim.onChange(() => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      v.refresh();
      ctx.setzeBadge(v.offen(), "klingelt");
    }, 400);
  });
  return { el: root, dispose: () => aus() };
}

registriere({ komponente: "grosseinsatz", titel: "Großeinsatz", info: "Großschadensfall: Bereitstellungsraum, Lagemeldung, Patienten buchen, Voraviso", bereich: "rechts", erstellen: grosseinsatz });
registriere({ komponente: "funkgs", titel: "Funk Großeinsatz", info: "Sprechgruppe des Großeinsatzes (Einsatzleitung, Bereitstellungsraum), mit „mithören“", bereich: "rechts", erstellen: funkGs });

// Ein Großeinsatz beginnt: beide Reiter gehen auf (einmal je Einsatz)
const geoeffnet = new Set<string>();
sim.onChange(() => {
  if (!IST_HAUPT) return;
  for (const e of sim.state.einsaetze) {
    if (!e.gs || e.gs.aufgehoben || e.gsKind || e.zustand === "abgeschlossen" || geoeffnet.has(e.id)) continue;
    geoeffnet.add(e.id);
    setTimeout(() => {
      panelZeigen("funkgs");
      panelZeigen("grosseinsatz");
    }, 50);
  }
});
