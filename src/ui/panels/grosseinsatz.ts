/**
 * Großeinsatz (ab NF5): eigener Reiter mit Bereitstellungsraum, Lagemeldung, Patientenliste (je Patient buchen),
 * Voraviso an die Krankenhäuser und den Kräften am Berufungsort und im Bereitstellungsraum.
 * Dazu der zweite Funk-Reiter für die Sprechgruppe Großeinsatz (mit „mithören“).
 */
import { store } from "../../data/store";
import { sim, type Einsatz, type GsZeile, type SimFahrzeug } from "../../sim/engine";
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
    // Kopf: Stufe, Einsatz, Phase, Zähler
    const kopf = el("div", { class: "gs-hero" });

    // ① SEG / ② Bereitstellungsraum
    const alarmBox = el("section", { class: "gs-card gs-alarm" });
    const segTeil = el("div", { class: "gs-schritt" });
    const brTeil = el("div", { class: "gs-schritt" });
    const brText = el("div", { class: "gs-br-text" });
    const adr = addressInput("Bereitstellungsraum: Adresse suchen …", (o) => void fehlerZeigen(sim.call("gsBr", e.id, { ...o, label: `Bereitstellungsraum ${o.label}` })));
    const bKarte = el("button", { class: "btn small", type: "button", title: "Karte zum Einsatzort, dann den Bereitstellungsraum anklicken" }, "Auf der Karte");
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
    const brZeile = el("div", { class: "gs-br-zeile" });
    brZeile.append(adr.root, bKarte, bVorschlag);
    const segInhalt = el("div");
    const brInhalt = el("div");
    segTeil.append(segInhalt);
    brTeil.append(brInhalt, brText, brZeile);
    const zurMaske = el("button", { class: "btn small", type: "button" }, "In der Einsatzmaske alarmieren ›");
    zurMaske.addEventListener("click", () => waehle("einsatz", e.id));
    const alarmFuss = el("div", { class: "gs-card-fuss" });
    alarmFuss.append(el("span", { class: "muted" }, "Der Fahrzeugvorschlag folgt dem aktuellen Schritt."), zurMaske);
    const schritte = el("div", { class: "gs-schritte" });
    schritte.append(segTeil, brTeil);
    alarmBox.append(el("h3", { class: "gs-card-titel" }, "Alarmierung"), schritte, alarmFuss);

    // Patienten
    const patBox = el("section", { class: "gs-card gs-pat" });
    const patKopf = el("div", { class: "gs-pat-kopf" });
    const patListe = el("div", { class: "gs-pat-liste" });
    patBox.append(el("h3", { class: "gs-card-titel" }, "Patienten"), patKopf, patListe);
    patListe.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-buchen]");
      if (!b) return;
      const nr = Number(b.dataset.buchen);
      const k = kindVon(e, nr);
      const p = e.wahr.gs?.patienten.find((x) => x.nr === nr);
      if (k && p) buchenDialog(k, `Krankenhaus buchen – ${gsPatientText(p)}`);
    });

    // Lage: Zeitleiste der Meldungen, eigene Notiz
    const lageBox = el("section", { class: "gs-card gs-lage" });
    const zeitleiste = el("ol", { class: "gs-zeitleiste" });
    const notiz = el("input", { class: "gs-notiz", type: "text", placeholder: "Notiz zur Lage ergänzen … (Enter)" }) as HTMLInputElement;
    notiz.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || !notiz.value.trim()) return;
      void fehlerZeigen(sim.call("gsNotiz", e.id, notiz.value));
      notiz.value = "";
    });
    lageBox.append(el("h3", { class: "gs-card-titel" }, "Lage"), zeitleiste, notiz);

    // Kräfte
    const kraftBox = el("section", { class: "gs-card gs-kraefte" });
    const kraefte = el("div", { class: "gs-kraefte-spalten" });
    kraftBox.append(el("h3", { class: "gs-card-titel" }, "Kräfte"), kraefte);

    // Voraviso
    const khBox = el("section", { class: "gs-card gs-kh" });
    const khListe = el("div", { class: "gs-kh-liste" });
    const khTitel = el("h3", { class: "gs-card-titel" }, "Krankenhäuser · Voraviso");
    khTitel.appendChild(el("small", {}, "150 % der Plätze, keine Selbstzuweiser"));
    khBox.append(khTitel, khListe);
    khListe.addEventListener("click", (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-voraviso]");
      if (!b) return;
      void fehlerZeigen(sim.call("gsVoraviso", e.id, b.dataset.voraviso!, b.dataset.an === "1"));
    });

    const anrufe = el("div", { class: "gs-anrufe muted small" });
    const raster = el("div", { class: "gs-raster" });
    raster.append(alarmBox, patBox, lageBox, kraftBox, khBox);
    body.append(kopf, raster, anrufe);

    const PHASEN: { id: string; name: string }[] = [
      { id: "alarm", name: "Anfahrt" },
      { id: "sicht", name: "Sichtmeldung" },
      { id: "lage", name: "Abtransport" },
      { id: "ende", name: "Ende" },
    ];
    const zeilen = (l: GsZeile[]) =>
      l
        .map((z) => {
          const pct = z.soll ? Math.min(100, Math.round((z.ist / z.soll) * 100)) : 100;
          const ok = z.ist >= z.soll;
          return `<div class="gs-soll${ok ? " ok" : ""}"><span class="gs-soll-art">${esc(z.art)}</span><span class="gs-balken"><i style="width:${pct}%"></i></span><span class="gs-soll-zahl">${z.ist}<small>/${z.soll}</small></span></div>`;
        })
        .join("");

    let khKey = "";
    const refresh = () => {
      const gs = e.gs;
      if (!gs) return;
      const w = e.wahr.gs;
      const t = sim.state.zeit;
      // Kopf
      const pat = (w?.patienten ?? []).filter((p) => gs.gezeigt.includes(p.nr));
      const n = (s: GsPatient["sichtung"]) => pat.filter((p) => p.sichtung === s).length;
      const lebend = pat.filter((p) => p.sichtung !== "tot");
      const weg = lebend.filter((p) => { const k = kindVon(e, p.nr); return !!k && (k.zustand === "abgeschlossen" || fzVon(k).some((f) => f.status === "zumZO" || f.status === "amZO")); }).length;
      const pi = PHASEN.findIndex((x) => x.id === gs.phase);
      kopf.innerHTML = `<div class="gs-hero-zeile"><span class="gs-stufe">${esc(gs.stufe ?? "Großeinsatz")}</span><div class="gs-hero-titel"><b>${esc(e.nummer)}</b><span>${esc(e.adresse?.label ?? e.meldung.adresse)}</span></div>${e.zustand === "abgeschlossen" ? `<span class="gs-tag">abgeschlossen</span>` : ""}</div>
        <ol class="gs-phasen">${PHASEN.map((x, i) => `<li class="${i < pi ? "fertig" : i === pi ? "jetzt" : ""}">${x.name}</li>`).join("")}</ol>
        <div class="gs-zahlen">${(["rot", "gelb", "gruen", "tot"] as const).map((s) => `<div class="gs-zahl ${s}"><b>${gs.phase === "alarm" || gs.phase === "sicht" ? "–" : n(s)}</b><span>${FARBE[s]}</span></div>`).join("")}<div class="gs-zahl weg"><b>${weg}<small>/${lebend.length || "–"}</small></b><span>abtransportiert</span></div></div>`;
      kopf.onclick = () => waehle("einsatz", e.id);
      // ① / ②
      const si = sim.gsSollIst(e);
      const schritt = si?.schritt ?? "seg";
      segTeil.className = `gs-schritt${schritt === "seg" ? " aktiv" : " fertig"}`;
      segInhalt.innerHTML = `<div class="gs-schritt-kopf"><span class="gs-nr-kreis">1</span><b>Schnelleinsatzgruppe</b><span class="muted">→ Berufungsort</span></div>${si ? zeilen(si.seg) : ""}`;
      const gesperrt = !gs.br;
      brTeil.className = `gs-schritt${schritt === "br" ? " aktiv" : ""}${gesperrt ? " gesperrt" : ""}${gs.brNoetig && !gs.br ? " blinkt" : ""}`;
      brInhalt.innerHTML = `<div class="gs-schritt-kopf"><span class="gs-nr-kreis">2</span><b>Bereitstellungsraum</b><span class="muted">${esc(gs.stufe ?? "")} laut Stufe</span></div>${si ? zeilen(si.br) : ""}`;
      brText.innerHTML = gs.br
        ? `<span class="gs-br-ort">🅿 ${esc(gs.br.label)}</span>`
        : `<span class="gs-hinweis">${schritt === "br" ? "Zuerst den Bereitstellungsraum festlegen – erst dann kann in den BR alarmiert werden." : "Festlegen, bevor weitere Kräfte alarmiert werden."}</span>`;
      brZeile.hidden = !!gs.br && gs.phase !== "alarm";
      // Patienten
      const nf = (e.nachforderungen ?? []).filter((x) => !x.erledigt);
      patKopf.innerHTML = gs.phase === "alarm" || gs.phase === "sicht"
        ? `<span class="muted">Die Einsatzleitung meldet die Patienten nach der Lagemeldung.</span>`
        : `<span class="muted">${pat.length} von ${w?.patienten.length ?? "?"} gemeldet</span>${nf.length ? `<div class="gs-nachf">Nachforderung: ${nf.map((x) => (x.art === "NA" ? `${x.anzahl} Notarztmittel` : `${x.anzahl} Rettungsmittel`)).join(", ")} in den Bereitstellungsraum</div>` : ""}`;
      const rang = { rot: 0, gelb: 1, gruen: 2, tot: 3 };
      patListe.innerHTML = pat
        .sort((a, b) => rang[a.sichtung] - rang[b.sichtung] || a.nr - b.nr)
        .map((p) => {
          const k = kindVon(e, p.nr);
          const h = k?.kh ? store.get("hospitals", k.kh.hospitalId) : undefined;
          const kh = p.sichtung === "tot" ? "" : h ? `<span class="gs-kh-name" title="${esc(h.name)}">${esc(h.kurzname || h.name)}</span>` : k && k.zustand !== "abgeschlossen" ? `<button class="btn small${k.khAnfrage ? " primary blinkt" : ""}" data-buchen="${p.nr}">Buchen</button>` : "";
          return `<div class="gs-p ${p.sichtung}"><span class="gs-nr">${p.nr}</span><span class="gs-p-text"><b>ca. ${p.alter} J., ${p.geschlecht === "w" ? "w" : "m"}</b> · ${esc(p.muster)}<small>${transportText(e, p)}</small></span><span class="gs-p-kh">${kh}</span></div>`;
        })
        .join("") || `<div class="gs-leer">Noch keine Patienten gemeldet.</div>`;
      // Lage (neueste oben)
      zeitleiste.innerHTML = gs.meldungen
        .slice()
        .reverse()
        .map((m) => `<li class="gs-m ${m.art}"><time>${uhr(m.zeit)}</time><div><b>${esc(m.von)}</b>${m.art === "sicht" ? " · Sichtmeldung" : m.art === "lage" ? " · Lagemeldung" : m.art === "nachforderung" ? " · Nachforderung" : m.art === "notiz" ? " · Notiz" : ""}<p>${esc(m.text)}</p></div></li>`)
        .join("") || `<li class="gs-leer">Sicht- und Lagemeldungen der Einsatzleitung erscheinen hier.</li>`;
      // Kräfte: Berufungsort, Bereitstellungsraum, Anfahrt
      const alle = fzVon(e);
      const bo = alle.filter((f) => f.phase === "vorOrt");
      const br = alle.filter((f) => f.phase === "wartetBR");
      const anf = alle.filter((f) => f.phase !== "vorOrt" && f.phase !== "wartetBR");
      const chips = (l: SimFahrzeug[]) =>
        l.map((f) => `<span class="gs-fz${f.id === gs.el ? " el" : ""}${f.id === gs.brBel ? " brl" : ""}" title="${esc(f.typ ?? f.rmTyp)}${f.id === gs.el ? " · Einsatzleitung" : f.id === gs.brBel ? " · Leitung Bereitstellungsraum" : ""}"><b>${esc(f.funkrufname)}</b><small>${esc(f.id === gs.el ? "EL" : f.rmTyp)}</small></span>`).join("") || `<span class="gs-leer">–</span>`;
      kraefte.innerHTML = [["Berufungsort", bo], ["Bereitstellungsraum", br], ["Anfahrt", anf]].map(([name, l]) => `<div class="gs-spalte"><div class="gs-spalte-kopf">${name} <span>${(l as SimFahrzeug[]).length}</span></div><div class="gs-chips">${chips(l as SimFahrzeug[])}</div></div>`).join("");
      // Krankenhäuser in der Nähe (ohne Primärversorgung)
      const pos = e.adresse ?? { lat: e.wahr.lat, lon: e.wahr.lon };
      const haeuser = store
        .list("hospitals")
        .filter((h) => sim.khImNetz(h) && (h.einrichtungen ?? []).some((x) => x === "amb_notaufnahme" || x === "amb_unfall" || x === "fb_schockraum"))
        .map((h) => ({ h, km: distanceM(pos, h) / 1000 }))
        .filter((x) => x.km < 70)
        .sort((a, b) => a.km - b.km)
        .slice(0, 8);
      const belegungen = Object.values(sim.state.khBelegung ?? {}).reduce((n, kh) => n + Object.values(kh).reduce((m, l) => m + (l?.length ?? 0), 0), 0);
      const key = JSON.stringify([gs.voraviso, Math.floor(t / 60_000), belegungen, haeuser.map((x) => x.h.id)]);
      if (key !== khKey) {
        khKey = key;
        khListe.innerHTML = haeuser
          .map(({ h, km }) => {
            let gesamt = 0;
            let frei = 0;
            for (const r of RESSOURCEN) {
              if (r.id === "pvz") continue;
              const n = plaetze(h, r.id);
              gesamt += n;
              frei += Math.max(0, n - belegt(sim.state.khBelegung, h.id, r.id, t));
            }
            const an = gs.voraviso.includes(h.id) || istVoravisiert(h.id);
            const pct = gesamt ? Math.round((frei / gesamt) * 100) : 0;
            return `<div class="gs-khz${an ? " an" : ""}"><div class="gs-khz-name"><b>${esc(h.kurzname || h.name)}</b><span class="muted">${km.toFixed(0)} km</span></div><div class="gs-khz-frei">${gesamt ? `<span class="gs-balken${pct < 25 ? " knapp" : ""}"><i style="width:${pct}%"></i></span><span>${frei}/${gesamt} frei</span>` : `<span class="muted">keine Platzangaben</span>`}</div><button class="btn small${an ? " primary" : ""}" data-voraviso="${esc(h.id)}" data-an="${an ? "0" : "1"}">${an ? "✓ Voraviso" : "Voraviso"}</button></div>`;
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
