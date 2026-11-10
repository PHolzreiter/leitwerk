/**
 * Masken als Reiter RD-Übersicht (Notfall), KT-Übersicht (Krankentransport) und SEK-Übersicht (Überstellung).
 * Sie zeigen, was in der Einsatzliste (oder auf der Karte) ausgewählt ist. Die Masken selbst kommen aus dem
 * Entwurf (fenster/einsatzmaske, fenster/ktmaske); hier bleibt die Krankenhaus-Buchung für den Großeinsatz.
 */
import { einsatzFenster } from "../fenster/einsatzmaske";
import { istSek, ktFenster } from "../fenster/ktmaske";
import { buchungName } from "../../data/klinik";
import { ALTERSGRUPPEN, altersgruppeVon, DRINGLICHKEITEN, dringlichkeitFuer, symptom, symptomAusDiagnose, symptomSuche, zuweisungId, zuweisungLesen, type Altersgruppe, type Dringlichkeit, type Symptom } from "../../data/zuweisung";
import { store } from "../../data/store";
import { sim, type Einsatz } from "../../sim/engine";
import { distanceM } from "../../sim/geo";
import { el, esc, toast } from "../dom";
import { panelZeigen, registriere, reiterPassend, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, onAuswahl } from "../ws/auswahl";
import { addressInput, fehlerZeigen, uhr } from "./teile";

/** Krankenhaus buchen (Zuweisung: Symptom → Alter → Dringlichkeit → passende Häuser) – auch im Großeinsatz je Patient */
export function khBuchung(e: Einsatz, opt: { gebucht?: () => void; kompakt?: boolean } = {}): { root: HTMLElement; refresh(): void } {
  const khBox = el("div", { class: "mask-box" });
  khBox.innerHTML = `<div class="box-title">Krankenhaus · Berufungs- und Zielort</div>`;
  const khInfo = el("div", { class: "kh-info" });
  // Zuweisung: Symptom (mit Synonymen) → Altersgruppe → Dringlichkeit → die nächsten passenden Häuser, die jetzt aufnehmen
  const dringChip = el("span", { class: "kh-dring" });
  const symFeld = el("div", { class: "zw-sym" });
  const symIn = el("input", { class: "zw-suche", type: "search", placeholder: "Symptom suchen (z. B. Brustschmerz, Sturz, Atemnot) …" }) as HTMLInputElement;
  const symChip = el("div", { class: "zw-chip", hidden: "" });
  const symListe = el("div", { class: "zw-liste", hidden: "" });
  symFeld.append(symIn, symChip, symListe);
  const altZeile = el("div", { class: "zw-seg zw-alter" });
  const drZeile = el("div", { class: "zw-seg zw-dring" });
  const khKarten = el("div", { class: "zw-kh" });
  const khSel = el("select", { class: "kh-sel", title: "anderes Krankenhaus wählen" }) as HTMLSelectElement;
  const btnBook = el("button", { class: "btn small primary" }, "KH buchen");
  const khRow = el("div", { class: "kh-row zw-row" });
  khRow.append(khSel, btnBook);
  const boZo = el("div", { class: "muted bozo" });
  const zo = addressInput("Zielort (frei, z. B. für Krankentransport)", (o) => void fehlerZeigen(sim.call("aktualisiere", e.id, { zo: o })));
  const zwKopf = el("div", { class: "zw-kopf" });
  zwKopf.append(dringChip, symFeld);
  khBox.append(khInfo, zwKopf, altZeile, drZeile, khKarten, khRow, boZo, el("div", { class: "fld-label" }, "Zielort manuell"), zo.root);

  /** Dringlichkeit, wie die Leitstelle sie kennt: nach dem Eintreffen aus der Lage, vorher aus der Einsatzstufe */
  const dringlichkeit = (): "rot" | "gelb" | "gruen" => {
    const l = e.wahr.lage;
    if (l?.aufgedeckt && l.patienten[0]) return l.patienten[0].sichtung;
    const k = sim.stufeVon(e)?.kategorie;
    return k === "kritisch" ? "rot" : k === "dringend" ? "gelb" : "gruen";
  };
  const DRING_TEXT = { rot: "Patient rot", gelb: "Patient gelb", gruen: "Patient grün" };
  const FARBE_DRING: Record<"rot" | "gelb" | "gruen", Dringlichkeit> = { rot: 30, gelb: 20, gruen: 10 };
  let zwSym: Symptom | undefined;
  let zwAlter: Altersgruppe = "erwachsener";
  let zwDring: Dringlichkeit = 20;
  let zwGewaehlt = "";
  /** Zuweisung (oder ältere Diagnose) in die Auswahl übernehmen */
  const zwSetzen = (id: string | null | undefined) => {
    if (!id) return;
    const z = zuweisungLesen(id);
    if (z) {
      zwSym = z.s;
      zwAlter = z.a;
      zwDring = z.d;
    } else if (id.startsWith("bu_")) {
      zwSym = symptom(symptomAusDiagnose(id));
      if (zwSym) zwDring = dringlichkeitFuer(zwSym, FARBE_DRING[dringlichkeit()]);
    }
  };
  const grundWert = () => (zwSym ? zuweisungId(zwSym.id, zwDring, zwAlter) : "");
  const zwZeigen = () => {
    symChip.hidden = !zwSym;
    symIn.hidden = !!zwSym;
    symChip.innerHTML = zwSym ? `<b>${esc(zwSym.name)}</b> <span class="muted">${esc(zwSym.kategorie)}</span> <button class="btn small zw-weg" title="anderes Symptom">✕</button>` : "";
    altZeile.innerHTML = ALTERSGRUPPEN.map((a) => `<button class="btn small${a.id === zwAlter ? " an" : ""}" data-zw-alter="${a.id}" title="${a.text} Jahre">${a.name}</button>`).join("");
    drZeile.innerHTML = DRINGLICHKEITEN.map((d) => {
      const erlaubt = !zwSym || zwSym.dringlichkeiten.includes(d.id);
      return `<button class="btn small d${d.id}${d.id === zwDring && zwSym ? " an" : ""}" data-zw-dring="${d.id}"${erlaubt ? "" : " disabled"}>${d.name}</button>`;
    }).join("");
  };
  const symSuchen = () => {
    const q = symIn.value.trim();
    const treffer = q ? symptomSuche(q, 10) : [];
    symListe.hidden = !treffer.length;
    symListe.innerHTML = treffer
      .map((x, i) => {
        const syn = x.synonyme.filter((y) => q && y.toLowerCase().includes(q.toLowerCase().split(/\s+/)[0])).slice(0, 2);
        return `<div class="zw-treffer${i === 0 ? " sel" : ""}" data-zw-sym="${esc(x.id)}"><b>${esc(x.name)}</b> <span class="muted">${esc(x.kategorie)}${syn.length ? ` · ${esc(syn.join(", "))}` : ""}</span></div>`;
      })
      .join("");
  };
  const symWaehlen = (id: string) => {
    const x = symptom(id);
    if (!x) return;
    zwSym = x;
    zwDring = dringlichkeitFuer(x, FARBE_DRING[dringlichkeit()]);
    if (e.wahr.lage?.aufgedeckt && e.wahr.lage.patienten[0]) zwAlter = altersgruppeVon(e.wahr.lage.patienten[0].alter);
    symIn.value = "";
    symListe.hidden = true;
    zwZeigen();
    fillKh(true);
  };
  symIn.addEventListener("input", symSuchen);
  symIn.addEventListener("keydown", (ev) => {
    const ke = ev as KeyboardEvent;
    const alle = [...symListe.querySelectorAll<HTMLElement>(".zw-treffer")];
    const i = alle.findIndex((x) => x.classList.contains("sel"));
    if (ke.key === "ArrowDown" || ke.key === "ArrowUp") {
      ke.preventDefault();
      const n = Math.max(0, Math.min(alle.length - 1, i + (ke.key === "ArrowDown" ? 1 : -1)));
      alle.forEach((x, j) => x.classList.toggle("sel", j === n));
    } else if (ke.key === "Enter" && alle[Math.max(0, i)]) {
      ke.preventDefault();
      symWaehlen(alle[Math.max(0, i)].dataset.zwSym!);
    } else if (ke.key === "Escape") symListe.hidden = true;
  });
  symListe.addEventListener("mousedown", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-zw-sym]");
    if (!t) return;
    ev.preventDefault();
    symWaehlen(t.dataset.zwSym!);
  });
  symChip.addEventListener("click", (ev) => {
    if (!(ev.target as HTMLElement).closest(".zw-weg")) return;
    zwSym = undefined;
    zwZeigen();
    fillKh(true);
    symIn.focus();
  });
  altZeile.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-zw-alter]");
    if (!t) return;
    zwAlter = t.dataset.zwAlter as Altersgruppe;
    zwZeigen();
    fillKh(true);
  });
  drZeile.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-zw-dring]");
    if (!t || t.disabled) return;
    zwDring = Number(t.dataset.zwDring) as Dringlichkeit;
    zwZeigen();
    fillKh(true);
  });

  let khKey = "";
  const MARKE = { passend: "passend", ausweich: "Ausweich", rueckfall: "Rückfall" } as const;
  /** Kinder in einem Haus ohne Kinder-Abteilung: als Ausweich gekennzeichnet */
  const marke = (eig: keyof typeof MARKE) => (eig === "ausweich" && zwSym && zwAlter !== "erwachsener" ? "⚠ Ausweich – keine Kinderabteilung" : MARKE[eig]);
  const fillKh = (force = false) => {
    const d = dringlichkeit();
    const grund = grundWert();
    // neu zeichnen, sobald sich Belegungen ändern (Buchung hier oder bei einem anderen Einsatz)
    const belegungen = Object.values(sim.state.khBelegung ?? {}).reduce((n, kh) => n + Object.values(kh).reduce((m, l) => m + (l?.length ?? 0), 0), 0);
    const key = `${grund}|${d}|${e.adresse?.lat}|${Math.floor(sim.state.zeit / 60_000)}|${belegungen}|${e.kh?.hospitalId ?? ""}`;
    if ((key === khKey || document.activeElement === khSel) && !force) return;
    khKey = key;
    dringChip.className = `kh-dring ${d}`;
    dringChip.textContent = DRING_TEXT[d];
    const pos = e.adresse ?? e.wahr;
    const kind = zwSym ? zwAlter !== "erwachsener" : (e.wahr.lage?.aufgedeckt ? (e.wahr.lage.patienten[0]?.alter ?? 99) : 99) < 15;
    const rot = zwSym ? zwDring === 30 : d === "rot";
    const vorschlaege = sim.khFuer(pos, grund || null, rot, kind, false, sim.cacVorrang(e));
    // die drei nächsten passenden Häuser, die jetzt aufnehmen
    const top = vorschlaege.filter((v) => !v.zu).slice(0, 3);
    if (!zwGewaehlt || force || !top.some((v) => v.h.id === zwGewaehlt)) {
      const gebucht = e.kh && e.kh.grund === grund ? top.find((v) => v.h.id === e.kh!.hospitalId) : undefined;
      zwGewaehlt = (gebucht ?? top.find((v) => !v.voll) ?? top[0])?.h.id ?? "";
    }
    khKarten.innerHTML = !grund
      ? `<div class="muted">Symptom wählen – dann zeigt die Liste die nächsten passenden Häuser, die jetzt aufnehmen.</div>`
      : top.length
        ? top
            .map((v) => {
              const lage = v.voll ? `belegt (${v.gesamt}/${v.gesamt})` : v.gesamt ? `${v.frei}/${v.gesamt} frei` : "";
              return `<label class="zw-khk ${v.eignung}${v.voll ? " voll" : ""}${v.h.id === zwGewaehlt ? " an" : ""}" data-zw-kh="${esc(v.h.id)}"><input type="radio" name="zwkh-${esc(e.id)}"${v.h.id === zwGewaehlt ? " checked" : ""}> <b>${esc(v.h.kurzname || v.h.name)}</b> <span class="muted">${v.km.toFixed(0)} km · ${marke(v.eignung)}${lage ? ` · ${lage}` : ""}${v.h.landeplatz === "kein" ? " · kein Hubschrauberlandeplatz" : ""}</span></label>`;
            })
            .join("")
        : `<div class="alert-text">Kein passendes Haus nimmt gerade auf.</div>`;
    // alle anderen bleiben wählbar
    const gezeigt = new Set(top.map((v) => v.h.id));
    khSel.innerHTML = "";
    khSel.appendChild(el("option", { value: "" }, top.length ? "– anderes Krankenhaus –" : "– Krankenhaus wählen –"));
    const weitere = vorschlaege.filter((v) => !gezeigt.has(v.h.id));
    if (weitere.length) {
      const g = el("optgroup");
      g.label = "passend, aber zu oder weiter weg";
      for (const v of weitere) g.appendChild(el("option", { value: v.h.id, class: `kh-opt ${v.eignung}${v.zu || v.voll ? " nein" : ""}` }, `${v.h.kurzname || v.h.name} (${v.km.toFixed(0)} km) · ${marke(v.eignung)}${v.zu ? " · zu" : v.voll ? " · belegt" : ""}`));
      khSel.appendChild(g);
    }
    const rest = store
      .list("hospitals")
      .filter((h) => !gezeigt.has(h.id) && !weitere.some((v) => v.h.id === h.id))
      .map((h) => ({ h, km: distanceM(pos, h) / 1000 }))
      .filter((x) => x.km < 150)
      .sort((a, b) => a.km - b.km);
    if (rest.length) {
      const g = el("optgroup");
      g.label = grund ? "passt nicht" : "alle Krankenhäuser";
      for (const { h, km } of rest) g.appendChild(el("option", { value: h.id, class: `kh-opt${grund ? " nein" : ""}` }, `${h.kurzname || h.name} (${km.toFixed(0)} km)`));
      khSel.appendChild(g);
    }
  };
  khKarten.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-zw-kh]");
    if (!t) return;
    zwGewaehlt = t.dataset.zwKh!;
    khSel.value = "";
    khKarten.querySelectorAll(".zw-khk").forEach((x) => x.classList.toggle("an", x === t));
  });
  btnBook.addEventListener("click", () => {
    const ziel = khSel.value || zwGewaehlt;
    if (!ziel) return toast("Bitte ein Krankenhaus wählen", "error");
    void fehlerZeigen(sim.call("bucheKh", e.id, ziel, grundWert()).then(() => opt.gebucht?.()));
    khSel.value = "";
    toast("Krankenhaus gebucht");
  });
  zwSetzen(e.khAnfrage?.verdacht ?? e.verdacht ?? e.kh?.grund);
  if (!zwSym) zwDring = FARBE_DRING[dringlichkeit()];
  let letzterVerdacht = e.khAnfrage?.verdacht ?? e.verdacht ?? "";
  zwZeigen();
  fillKh(true);

  if (opt.kompakt) {
    boZo.hidden = true;
    zo.root.hidden = true;
    khBox.querySelectorAll(".fld-label").forEach((x) => ((x as HTMLElement).hidden = true));
  }
  const refresh = () => {
    if (e.zo && document.activeElement !== zo.input) zo.input.value = e.zo.label;
    // KH
    const h = e.kh ? store.get("hospitals", e.kh.hospitalId) : undefined;
    khInfo.innerHTML = e.kh
      ? `<div>Gebucht: <b>${esc(h?.name ?? e.kh.hospitalId)}</b></div><div class="muted">${e.kh.grund ? `Verdacht: ${esc(buchungName(e.kh.grund))} · ` : ""}durch ${e.kh.durch === "rtw" ? "RTW" : e.kh.durch === "nah" ? "NAH (Pilot)" : "Leitstelle"} · ${uhr(e.kh.zeit)}</div>`
      : e.khAnfrage
        ? `<div class="alert-text">${esc(e.khAnfrage.von)} erbittet KH-Buchung: <b>Verdacht ${esc(buchungName(e.khAnfrage.verdacht))}</b></div>`
        : `<div class="muted">Noch kein Krankenhaus gebucht.</div>`;
    khBox.classList.toggle("alert", !!e.khAnfrage);
    const v = e.khAnfrage?.verdacht ?? e.verdacht ?? "";
    if (v && v !== letzterVerdacht) {
      letzterVerdacht = v;
      zwSetzen(v);
      zwZeigen();
      fillKh(true);
    }
    fillKh();
    boZo.innerHTML = `BO: ${esc(e.bo?.label ?? "–")}<br>ZO: ${esc(e.zo?.label ?? "–")}`;
  };
  refresh();
  return { root: khBox, refresh };
}

// ---------------------------------------------------------------- Fenster (Reiter RD-, KT-, SEK-Übersicht)

/** Fenster einer Maske: zeigt den gewählten Auftrag der passenden Art (Abwahl lässt den letzten stehen) */
function maskenFenster(f: { el: HTMLElement; dispose(): void; zeichnen(): void; setzeId(id: string | null): void }, passt: () => string | null, gibt: (id: string) => boolean) {
  let fuer: string | null = null;
  const zeigen = () => {
    const neu = passt();
    if (neu && neu !== fuer) {
      fuer = neu;
      f.setzeId(neu);
    } else if (fuer && !gibt(fuer)) {
      fuer = null;
      f.setzeId(null);
    } else f.zeichnen();
  };
  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      zeigen();
    }, 300);
  };
  const aus = [sim.onChange(spaeter), onAuswahl(() => zeigen())];
  zeigen();
  return { el: f.el, dispose: () => (aus.forEach((x) => x()), f.dispose()) };
}

const gewaehlterEinsatz = () => {
  const a = auswahl();
  return a.art === "einsatz" && a.id && sim.einsatz(a.id) ? a.id : null;
};
const gewaehlterAuftrag = (sek: boolean) => {
  const a = auswahl();
  const k = a.art === "kt" && a.id ? sim.ktAuftrag(a.id) : undefined;
  return k && istSek(k) === sek ? k.id : null;
};

registriere({
  komponente: "einsatz",
  titel: "RD-Übersicht",
  info: "Notfall: Code, Einsatzort, Fahrzeuge alarmieren, Krankenhaus",
  bereich: "rechts",
  erstellen: (ctx: PanelKontext) => maskenFenster(einsatzFenster(ctx), gewaehlterEinsatz, (id) => !!sim.einsatz(id)),
});

registriere({
  komponente: "kt",
  titel: "KT-Übersicht",
  info: "Krankentransport: Abholort, Zielort, Fahrzeug vormerken oder losschicken",
  bereich: "rechts",
  erstellen: (ctx: PanelKontext) => maskenFenster(ktFenster(ctx, false), () => gewaehlterAuftrag(false), (id) => !!sim.ktAuftrag(id)),
});

registriere({
  komponente: "sek",
  titel: "SEK-Übersicht",
  info: "Überstellung zwischen Krankenhäusern: Abholort, Zielort, Sekundärfahrzeug",
  bereich: "rechts",
  erstellen: (ctx: PanelKontext) => maskenFenster(ktFenster(ctx, true), () => gewaehlterAuftrag(true), (id) => !!sim.ktAuftrag(id)),
});

// Auswahl: passende Maske nach vorne holen (nur das Fenster, in dem geklickt wurde)
onAuswahl((a, opts, hier) => {
  if (!hier || !a.id) return;
  const k = a.art === "kt" ? sim.ktAuftrag(a.id) : null;
  const ziel = a.art !== "kt" ? "einsatz" : k && istSek(k) ? "sek" : "kt";
  // auch ohne „Maske nach vorne“: steht gerade eine andere Übersicht vorne, zur passenden wechseln (RD ↔ KT ↔ SEK)
  if (opts.maske === false) return reiterPassend(["einsatz", "kt", "sek"], ziel);
  panelZeigen(ziel);
});
