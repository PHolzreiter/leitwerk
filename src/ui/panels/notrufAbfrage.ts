/**
 * Notrufgespräch und strukturierte Abfrage (Leitfaden) für das Abfrage-Fenster.
 * Nur wer den Anruf angenommen hat, führt Gespräch und Abfrage; alle anderen sehen mit.
 */
import { gesagteAdresse } from "../../abfrage/adresseGesagt";
import { sprechFrage } from "../../abfrage/sprechfrage";
import { mikroAnbinden } from "../sprache";
import { store } from "../../data/store";
import { fragen, antwortetGerade, kontext } from "../../abfrage/gespraech";
import { schilderung } from "../../abfrage/anrufer";
import { patientText } from "../../sim/lage";
import { antwortLabel, bestimmeCode, fragenImAblauf, stufeRang, stufeVonCode, type Frage, type Schema, type Wert } from "../../abfrage/schema";
import { mp } from "../../net/mehrspieler";
import { sim, type Einsatz } from "../../sim/engine";
import { el, esc, toast } from "../dom";
import { liveSammler, onLive, verlaufNachziehen, liveZeigen } from "./live";
import { karteWaehlen, karteZeigen } from "../ws/auswahl";
import { addressInput } from "./teile";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}


const HINWEIS_NOTRUF = "Notruf 144, Rettungsdienst. Wo genau ist der Notfallort? Ist der Patient wach? Atmet er normal? Krems, Tulln, Hollabrunn, Klosterneuburg, Langenlois, Stockerau, Gföhl, Mautern, Herzogenburg, Ziersdorf, Retz. Bewusstlos, Atemnot, Brustschmerzen, Rettungswagen, Notarzt.";

export function istGespraechsfuehrer(e: Einsatz): boolean {
  const a = e.anruf;
  if (!a?.angenommenVon) return false;
  return sim.mode === "solo" || a.angenommenVon.pid === (sim.ich?.pid ?? mp.ich.pid);
}

export interface NotrufTeile {
  verlauf: HTMLElement;
  form: HTMLElement;
  codeZeile: HTMLElement;
  aufloesung: HTMLElement;
  /** Leitfaden: die strukturierte Abfrage */
  abfrage: HTMLElement;
  refresh(): void;
  dispose(): void;
}

export function notrufTeile(e: Einsatz): NotrufTeile {
  const verlauf = el("div", { class: "anruf-verlauf" });
  const live = el("div", { class: "anruf-msg anrufer live", hidden: "" });
  const form = el("form", { class: "anruf-form" });
  const eingabe = el("input", { type: "text", placeholder: "Frage an den Anrufer … (Enter)" });
  const senden = el("button", { class: "btn small primary", type: "submit" }, "Fragen");
  form.append(
    eingabe,
    mikroAnbinden({
      input: eingabe,
      rang: 1,
      aktiv: () => istGespraechsfuehrer(e) && (e.anruf?.status === "aktiv"),
      senden: () => form.requestSubmit(),
      hinweis: () => HINWEIS_NOTRUF,
    }),
    senden,
  );
  const codeZeile = el("div", { class: "anruf-code" });
  const abfrage = el("div", { class: "abfrage" });
  const aufloesung = el("div", { class: "aufloesung" });

  const zeigeLive = (text: string | null) => liveZeigen(verlauf, live, e.id, text);
  const ausLive = onLive((id, text) => id === e.id && zeigeLive(text));
  const stelle = async (text: string, f?: Frage) => {
    const l = liveSammler(e.id);
    try {
      await fragen(e, text, f, l.onToken);
    } catch (err) {
      toast(String((err as Error).message ?? err), "error");
    }
    l.fertig();
    refresh();
  };

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t || !istGespraechsfuehrer(e)) return;
    eingabe.value = "";
    void stelle(t);
  });

  let letzterSchluessel = "";
  // Nach dem Verlassen eines Eingabefelds aufgeschobene Änderungen nachziehen
  abfrage.addEventListener("focusout", () => setTimeout(refresh, 0));
  function refresh() {
    const a = e.anruf;
    if (!a) return;
    const ich = istGespraechsfuehrer(e);
    // Gesprächsverlauf
    const msgs = a.gespraech;
    verlaufNachziehen(verlauf, live, msgs, e.id);
    const darf = ich && (a.status === "aktiv" || a.status === "gehalten" || a.status === "beendet");
    form.hidden = !(ich && a.status === "aktiv");
    if (!ich && a.status === "aktiv") form.title = "Das Gespräch führt jemand anderer";
    eingabe.disabled = senden.disabled = antwortetGerade(e.id);

    // Vorläufiger Code
    const erg = a.ergebnis;
    const c = erg ? store.schema?.codes[erg.code] : null;
    const eigener = erg && e.codeQuelle === "dispo" && e.code !== erg.code;
    const codeSchluessel = JSON.stringify([erg, e.code, e.codeQuelle, a.status]);
    if (codeZeile.dataset.k !== codeSchluessel) {
      codeZeile.dataset.k = codeSchluessel;
      codeZeile.innerHTML = erg
        ? `${erg.reanimation ? `<div class="reanimation">⚠ Reanimation anleiten! Herzdruckmassage, 100–120/min</div>` : ""}<div>${eigener ? "Abfrage ergibt" : "Vorläufiger Code"}: <b>${esc(erg.code)}</b> ${esc(c?.name ?? "")} <span class="stufe-badge">${esc(c?.kategorie ?? "")}</span></div>`
        : a.status === "aktiv" || a.status === "gehalten" || a.status === "beendet"
          ? `<span class="muted">Der Code ergibt sich aus der Abfrage (rechts das Kapitel wählen) – oder in der Einsatzmaske selbst suchen.</span>`
          : "";
      if (eigener) {
        const zeile = el("div", { class: "muted" }, `Du hast selbst ${e.code} gewählt. `);
        const b = el("button", { class: "btn small" }, "Code aus der Abfrage übernehmen");
        b.addEventListener("click", () => fehler(sim.call("abfrageCode", e.id)));
        zeile.appendChild(b);
        codeZeile.appendChild(zeile);
      }
    }

    // Auflösung nach dem Gespräch
    const zeigbar = a.status === "beendet" || e.zustand === "abgeschlossen";
    if (!zeigbar) aufloesung.innerHTML = "";
    else if (!aufloesung.childElementCount) {
      const b = el("button", { class: "btn small" }, "Auflösung zeigen");
      b.addEventListener("click", () => {
        aufloesung.innerHTML = aufloesungHtml(e);
      });
      aufloesung.appendChild(b);
    }

    // Abfrage nur neu aufbauen, wenn sich etwas geändert hat (sonst geht der Fokus verloren)
    const schluessel = JSON.stringify([a.status, a.kapitel, a.antworten, a.extra, darf, a.angenommenVon?.pid, a.kapitel === "42" ? e.code : null, e.adresse?.label, e.zusatz, a.gespraech.some((m) => m.von === "anrufer"), a.ortung?.status, a.ortung?.radius]);
    const tippt = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
    if (schluessel !== letzterSchluessel && !(tippt && abfrage.contains(document.activeElement))) {
      letzterSchluessel = schluessel;
      abfrageBauen(darf);
    }
  }

  /** Neu aufbauen, ohne dass die Ansicht nach oben springt */
  function abfrageBauen(darf: boolean) {
    const scroller: [HTMLElement, number][] = [];
    for (let x = abfrage.parentElement; x && !x.classList.contains("lw-panel"); x = x.parentElement) if (x.scrollTop) scroller.push([x, x.scrollTop]);
    abfrageBauenInnen(darf);
    for (const [x, top] of scroller) x.scrollTop = top;
    fokusZeigen(false);
  }

  // ---- Tastatur: 1–9 wählt die Antwort der markierten Frage, Enter/↓ nächste offene Frage, ↑ zurück, F stellt die Frage
  let fokusId: string | null = null;
  const zeilen = () => [...abfrage.querySelectorAll<HTMLElement>(".frage[data-id]")].filter((r) => r.dataset.typ === "single" || r.dataset.typ === "zahl");
  const beantwortet = (r: HTMLElement) =>
    r.dataset.typ === "single" ? !!r.querySelector(".opt.gewaehlt") : !!r.querySelector<HTMLInputElement>("input.zahl")?.value || !!r.querySelector(".opt.gewaehlt");
  function fokusZeigen(scrollen: boolean): void {
    const rs = zeilen();
    let r = rs.find((x) => x.dataset.id === fokusId) ?? null;
    if (!r) {
      r = rs.find((x) => !beantwortet(x)) ?? null;
      fokusId = r?.dataset.id ?? null;
    }
    for (const x of rs) {
      const an = x === r;
      x.classList.toggle("fokus", an);
      x.querySelectorAll(".opt-nr").forEach((n) => n.remove());
      if (an && x.dataset.typ === "single")
        x.querySelectorAll<HTMLButtonElement>(".opt").forEach((b, i) => {
          if (i < 9) b.prepend(el("span", { class: "opt-nr" }, String(i + 1)));
        });
    }
    if (r && scrollen) r.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function fokusWeiter(richtung: 1 | -1, nurOffene: boolean): void {
    const rs = zeilen();
    const i = rs.findIndex((x) => x.dataset.id === fokusId);
    let j = i;
    for (let n = 0; n < rs.length; n++) {
      j += richtung;
      if (j < 0 || j >= rs.length) break;
      if (!nurOffene || !beantwortet(rs[j])) break;
    }
    if (j >= 0 && j < rs.length) fokusId = rs[j].dataset.id ?? null;
    else if (richtung === 1 && nurOffene) {
      const offen = rs.find((x) => !beantwortet(x));
      if (offen) fokusId = offen.dataset.id ?? null;
    }
    fokusZeigen(true);
  }
  const taste = (ev: KeyboardEvent) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || !abfrage.isConnected || !abfrage.offsetParent) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
      // in der Altersangabe: Enter übernimmt und geht weiter
      if (ev.key === "Enter" && t.classList.contains("zahl") && abfrage.contains(t)) {
        (t as HTMLInputElement).blur();
        setTimeout(() => fokusWeiter(1, true), 50);
      }
      return;
    }
    const r = zeilen().find((x) => x.dataset.id === fokusId);
    if (!r) return;
    if (/^[1-9]$/.test(ev.key)) {
      const opts = [...r.querySelectorAll<HTMLButtonElement>(".opt")];
      const b = opts[Number(ev.key) - 1];
      if (!b || b.disabled) return;
      ev.preventDefault();
      if (r.dataset.typ === "zahl") return;
      // weiter zur nächsten offenen Frage macht der Klick-Hörer unten (gleich wie mit der Maus)
      if (!b.classList.contains("gewaehlt")) b.click();
    } else if (ev.key === "Enter" || ev.key === "ArrowDown") {
      ev.preventDefault();
      if (r.dataset.typ === "zahl" && ev.key === "Enter") return void r.querySelector<HTMLInputElement>("input.zahl")?.focus();
      fokusWeiter(1, ev.key === "Enter");
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      fokusWeiter(-1, false);
    } else if (ev.key === "f" || ev.key === "F") {
      const q = r.querySelector<HTMLButtonElement>(".frag-knopf");
      if (q && !q.disabled) {
        ev.preventDefault();
        q.click();
      }
    }
  };
  document.addEventListener("keydown", taste);
  // Maus wie Tastatur: Klick auf eine Antwort beantwortet und geht zur nächsten offenen Frage;
  // Klick sonst auf eine Frage markiert sie. (Erst beim Klick, nicht beim Drücken – sonst verrutschen
  // die Knöpfe unter der Maus und der Klick geht verloren.)
  abfrage.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as HTMLElement;
      const r = t.closest<HTMLElement>(".frage[data-id]");
      if (!r || (r.dataset.typ !== "single" && r.dataset.typ !== "zahl")) return;
      fokusId = r.dataset.id ?? null;
      const opt = t.closest<HTMLButtonElement>(".opt");
      if (opt && !opt.disabled && r.dataset.typ === "single" && !opt.classList.contains("gewaehlt")) setTimeout(() => fokusWeiter(1, true), 150);
      else setTimeout(() => fokusZeigen(false), 0);
    },
    true,
  );

  function abfrageBauenInnen(darf: boolean) {
    abfrage.innerHTML = "";
    const a = e.anruf;
    const schema = store.schema;
    if (!a || !schema || (a.status !== "aktiv" && a.status !== "gehalten" && a.status !== "beendet")) return;

    const setze = (id: string, wert: Wert) => fehler(sim.call("abfrageSetze", e.id, id, wert));
    const frageZeile = (f: Frage) => {
      const row = el("div", { class: "frage" });
      row.dataset.id = f.id;
      row.dataset.typ = f.typ;
      const kopfz = el("div", { class: "frage-text" });
      kopfz.textContent = f.text;
      if (darf && a.status === "aktiv") {
        const q = el("button", { class: "frag-knopf", title: "Dem Anrufer diese Frage stellen" }, "🗨");
        q.addEventListener("click", () => void stelle(sprechFrage(f, store.schema, a.antworten, { erste: !a.gespraech.some((m) => m.von === "leitstelle") }), f));
        kopfz.prepend(q);
      }
      row.appendChild(kopfz);
      if (f.hinweis) row.appendChild(el("div", { class: "frage-hinweis" }, f.hinweis));
      const wert = a.antworten[f.id];
      if (f.typ === "single") {
        const opts = el("div", { class: "optionen" });
        for (const o of f.optionen ?? []) {
          const b = el("button", { class: `opt${wert === o.wert ? " gewaehlt" : ""}` }, o.label);
          b.disabled = !darf;
          b.addEventListener("click", () => setze(f.id, wert === o.wert ? null : o.wert));
          opts.appendChild(b);
        }
        row.appendChild(opts);
      } else if (f.typ === "zahl") {
        const opts = el("div", { class: "optionen" });
        const inp = el("input", { type: "number", min: "0", max: "120", class: "zahl" });
        inp.value = typeof wert === "number" ? String(wert) : "";
        inp.disabled = !darf;
        inp.addEventListener("change", () => setze(f.id, inp.value === "" ? null : Number(inp.value)));
        const unb = el("button", { class: `opt${wert === "unbekannt" ? " gewaehlt" : ""}` }, "unbekannt");
        unb.disabled = !darf;
        unb.addEventListener("click", () => setze(f.id, wert === "unbekannt" ? null : "unbekannt"));
        opts.append(inp, unb);
        row.appendChild(opts);
      } else if (f.typ === "text") {
        const inp = el("input", { type: "text", class: "text" });
        inp.value = typeof wert === "string" ? wert : "";
        inp.disabled = !darf;
        inp.addEventListener("change", () => setze(f.id, inp.value.trim() || null));
        row.appendChild(inp);
      }
      return row;
    };
    const abschnitt = (titel: string) => {
      const s = el("div", { class: "abfrage-abschnitt" });
      s.appendChild(el("div", { class: "abfrage-titel" }, titel));
      abfrage.appendChild(s);
      return s;
    };

    // Phasen 1–3
    const g = schema.globale_fragen;
    const p1 = abschnitt("1 · Einsatzort");
    for (const f of g.phase_1_einsatzort ?? []) {
      if (f.id === "ort_adresse") {
        const r = el("div", { class: "frage breit" });
        const kt = el("div", { class: "frage-text" }, f.text);
        if (darf && a.status === "aktiv") {
          const q = el("button", { class: "frag-knopf" }, "🗨");
          q.addEventListener("click", () => void stelle(sprechFrage(f, store.schema, a.antworten, { erste: !a.gespraech.some((m) => m.von === "leitstelle") }), f));
          kt.prepend(q);
        }
        r.appendChild(kt);
        // Adresse direkt hier eintragen (geht in die Einsatzmaske)
        const zeile = el("div", { class: "adr-zeile" });
        const adr = addressInput("Straße Hausnummer Ort …", (o) => {
          fehler(sim.call("aktualisiere", e.id, { adresse: o }));
          karteZeigen(o.lat, o.lon, 15);
        });
        if (e.adresse) adr.input.value = e.adresse.label;
        const karteB = el("button", { class: "btn small", type: "button", title: "Auf der Karte wählen" }, "🗺");
        karteB.addEventListener("click", async () => {
          const pkt = await karteWaehlen("Einsatzort anklicken");
          if (!pkt) return;
          fehler(sim.call("aktualisiere", e.id, { adresse: { ...pkt, label: `Koordinate ${pkt.lat.toFixed(5)}, ${pkt.lon.toFixed(5)}` } }));
        });
        const genannt = el("button", { class: "btn small", type: "button", title: "Was der Anrufer gesagt hat, in die Suche übernehmen" }, "📍 Genannte");
        const gesagt = gesagteAdresse(e.meldung.adresse, a.gespraech.filter((m) => m.von === "anrufer").map((m) => m.text));
        genannt.disabled = !gesagt;
        genannt.title = gesagt ? `Genannte Adresse übernehmen: „${gesagt}“` : "Genannte Adresse – erst wenn der Anrufer eine Straße oder einen Ort gesagt hat";
        genannt.addEventListener("click", () => {
          if (!gesagt) return;
          adr.input.value = gesagt;
          adr.input.dispatchEvent(new Event("input"));
          adr.input.focus();
        });
        // Handy-Ortung gleich hier, wo die Adresse eingetragen wird
        const o = a.ortung;
        const orten = el("button", { class: `btn small${e.wahr.abfrage?.ortUnbekannt && !o ? " primary" : ""}`, type: "button", title: "Handy-Ortung anfordern (Standort aus dem Netz)" }, "📡 Orten");
        orten.disabled = a.status !== "aktiv" || o?.status === "laeuft";
        orten.addEventListener("click", () => fehler(sim.call("ortung", e.id)));
        zeile.append(adr.root, karteB, genannt, orten);
        r.appendChild(zeile);
        if (o) {
          const info = el("div", { class: "abf-ortung-zeile small" });
          if (o.status === "laeuft") info.innerHTML = `<span class="muted">📡 Ortung läuft …</span>`;
          else {
            info.innerHTML = `📡 <b>${esc(o.art ?? "")}</b> ±${o.radius} m `;
            const lat = o.lat!;
            const lon = o.lon!;
            const zeigen = el("button", { class: "btn small", type: "button" }, "Karte");
            zeigen.addEventListener("click", () => karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16));
            const nehmen = el("button", { class: "btn small primary", type: "button" }, "Als Einsatzort");
            nehmen.addEventListener("click", () => {
              fehler(sim.call("aktualisiere", e.id, { adresse: { lat, lon, label: `Ortung ±${o.radius} m (${lat.toFixed(5)}, ${lon.toFixed(5)})` } }));
              karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16);
            });
            info.append(zeigen, nehmen);
          }
          r.appendChild(info);
        }
        p1.appendChild(r);
      } else if (f.id === "ort_zusatz" || /zusatz/i.test(f.id)) {
        // Zusatzinfos zum Ort = Zusatz der Einsatzmaske
        const r = el("div", { class: "frage breit" });
        const kt = el("div", { class: "frage-text" }, f.text);
        if (darf && a.status === "aktiv") {
          const q = el("button", { class: "frag-knopf" }, "🗨");
          q.addEventListener("click", () => void stelle(sprechFrage(f, store.schema, a.antworten, { erste: !a.gespraech.some((m) => m.von === "leitstelle") }), f));
          kt.prepend(q);
        }
        const inp = el("input", { type: "text", class: "text", placeholder: "Stiege, Stock, Tür, Zufahrt …" });
        inp.value = e.zusatz;
        inp.addEventListener("change", () => fehler(sim.call("aktualisiere", e.id, { zusatz: inp.value })));
        r.append(kt, inp);
        p1.appendChild(r);
      } else p1.appendChild(frageZeile(f));
    }
    const p2 = abschnitt("2 · Rückrufnummer");
    for (const f of g.phase_2_rueckruf ?? []) p2.appendChild(frageZeile(f));
    const p3 = abschnitt("3 · Was ist passiert?");
    for (const f of g.phase_3_was_ist_passiert ?? []) {
      if (f.typ === "kapitelwahl") p3.appendChild(kapitelWahl(schema, darf));
      else p3.appendChild(frageZeile(f));
    }

    if (!a.kapitel) return;
    // Andere Leitstelle: keine Abfrage, nur den passenden Code wählen
    if (a.kapitel === "42") {
      const sec = abschnitt("4 · Code wählen (keine Abfrage bei Anforderung durch andere Leitstelle)");
      const opts = el("div", { class: "kapitel-liste" });
      for (const [code, c] of Object.entries(schema.codes)) {
        if (!c.kapitel.startsWith("42 ") && !c.kapitel.startsWith("42-")) continue;
        const b = el("button", { class: `kapitel-opt${e.code === code ? " gewaehlt" : ""}` });
        b.innerHTML = `<b>${esc(code)}</b> ${esc(c.name)} <span class="muted">· ${esc(c.kategorie)}</span>`;
        b.disabled = !darf;
        b.addEventListener("click", () => fehler(sim.call("aktualisiere", e.id, { code })));
        opts.appendChild(b);
      }
      sec.appendChild(opts);
      return;
    }
    // Primärabfrage + Kapitelfragen (inkl. Kapitelwechsel)
    let phase = "";
    let sec: HTMLElement | null = null;
    for (const { phase: ph, frage } of fragenImAblauf(schema, a.kapitel, a.antworten)) {
      if (ph !== phase) {
        phase = ph;
        sec = abschnitt(ph === "Primärabfrage" ? "4 · Primärabfrage" : `5 · ${ph}`);
      }
      sec!.appendChild(frageZeile(frage));
    }

    // Aufwertung, Zusatzkennung, Polizei
    const K = schema.kapitel[a.kapitel];
    const erg = bestimmeCode(schema, a.kapitel, a.antworten);
    const ex = abschnitt("Abschluss");
    const zeile = el("div", { class: "abfrage-extra" });
    if (K?.aufwertung && Object.keys(K.aufwertung).length) {
      const sel = el("select");
      sel.appendChild(el("option", { value: "" }, "keine Aufwertung"));
      const jetzt = erg ? stufeVonCode(erg.determinante, schema) : "";
      for (const st of Object.keys(K.aufwertung)) {
        if (stufeRang(st, schema) <= stufeRang(jetzt, schema)) continue;
        sel.appendChild(el("option", { value: st }, `Aufwerten auf ${st}`));
      }
      sel.value = a.extra.aufwertung ?? "";
      sel.disabled = !darf;
      sel.addEventListener("change", () => fehler(sim.call("abfrageExtra", e.id, { aufwertung: sel.value || null })));
      zeile.appendChild(sel);
    }
    const zus = erg ? (K?.zusatzkennungen?.[erg.determinante] ?? []) : [];
    if (zus.length) {
      const sel = el("select");
      sel.appendChild(el("option", { value: "" }, "keine Zusatzkennung"));
      for (const z of zus) sel.appendChild(el("option", { value: z }, z));
      sel.value = a.extra.zusatz ?? "";
      sel.disabled = !darf;
      sel.addEventListener("change", () => fehler(sim.call("abfrageExtra", e.id, { zusatz: sel.value || null })));
      zeile.appendChild(sel);
    }
    if (K?.polizei_kennung && Object.keys(K.polizei_kennung).length) {
      const l = el("label", { class: "chk" });
      const cb = el("input", { type: "checkbox" });
      cb.checked = a.extra.polizei;
      cb.disabled = !darf;
      cb.addEventListener("change", () => fehler(sim.call("abfrageExtra", e.id, { polizei: cb.checked })));
      l.append(cb, el("span", {}, "Polizei"));
      zeile.appendChild(l);
    }
    if (zeile.childElementCount) ex.appendChild(zeile);
    else ex.remove();
  }

  function kapitelWahl(schema: Schema, darf: boolean): HTMLElement {
    const a = e.anruf!;
    const box = el("div", { class: "frage" });
    box.appendChild(el("div", { class: "frage-text" }, "Kapitel (Hauptbeschwerde)"));
    if (a.kapitel) {
      const K = schema.kapitel[a.kapitel];
      const chip = el("div", { class: "kapitel-chip" });
      chip.innerHTML = `<b>${esc(a.kapitel)}</b> ${esc(K?.titel ?? "")}`;
      if (darf) {
        const x = el("button", { class: "btn small" }, "ändern");
        x.addEventListener("click", () => fehler(sim.call("abfrageSetze", e.id, "kapitel", null)));
        chip.appendChild(x);
      }
      box.appendChild(chip);
      return box;
    }
    const such = el("input", { type: "search", placeholder: "Stichwort, z. B. „Sturz“, „Brust“, „Atemnot“" });
    such.disabled = !darf;
    const liste = el("div", { class: "kapitel-liste" });
    const zeigen = () => {
      const q = such.value.trim().toLowerCase();
      liste.innerHTML = "";
      const treffer = Object.values(schema.kapitel).filter(
        (k) => !q || k.titel.toLowerCase().includes(q) || k.stichworte.some((s) => s.toLowerCase().includes(q)) || k.kapitel.toLowerCase() === q,
      );
      for (const k of treffer.slice(0, q ? 12 : 40)) {
        const b = el("button", { class: "kapitel-opt" });
        b.innerHTML = `<b>${esc(k.kapitel)}</b> ${esc(k.titel)}`;
        b.title = k.stichworte.join(", ");
        b.disabled = !darf;
        b.addEventListener("click", () => fehler(sim.call("abfrageSetze", e.id, "kapitel", k.kapitel)));
        liste.appendChild(b);
      }
    };
    such.addEventListener("input", zeigen);
    zeigen();
    box.append(such, liste);
    return box;
  }

  refresh();
  return {
    verlauf,
    form,
    codeZeile,
    aufloesung,
    abfrage,
    refresh,
    dispose: () => {
      ausLive();
      document.removeEventListener("keydown", taste);
    },
  };
}

/** Vergleich: was wirklich war und was eingetragen wurde */
function aufloesungHtml(e: Einsatz): string {
  const schema = store.schema;
  const w = e.wahr.abfrage;
  const a = e.anruf;
  if (!schema || !w || !a) return `<span class="muted">Keine Auflösung verfügbar.</span>`;
  const K = schema.kapitel[w.kapitel];
  const wc = schema.codes[w.code];
  const zeilen: string[] = [];
  const ok = (b: boolean) => (b ? `<span class="ok">✔</span>` : `<span class="alert-text">✘</span>`);
  const k = kontext(e);
  const p = w.antworten;
  const pat = [p.geschlecht === "m" ? "Mann" : p.geschlecht === "w" ? "Frau" : "", typeof p.alter === "number" ? `ca. ${p.alter} J.` : "", typeof p.bw === "string" ? { ja: "wach", getruebt: "benommen", nein: "bewusstlos" }[p.bw] ?? "" : "", typeof p.at === "string" ? { normal: "atmet normal", abnorm: "atmet schwer", agonal: "Schnappatmung", keine: "atmet nicht" }[p.at] ?? "" : ""].filter(Boolean).join(", ");
  const lage = w.anrufer.meldung ?? (k ? schilderung(k) : "");
  zeilen.push(`<div class="aufl-lage"><b>Lage:</b> ${esc(w.anrufer.stelle ?? w.anrufer.rolle.split(";")[0])}${lage ? ` – „${esc(lage)}“` : ""}${pat ? `<br><b>Patient:</b> ${esc(pat)}` : ""}</div>`);
  const l = e.wahr.lage;
  if (l) {
    const irrtum = l.irrtum === "keineRea" ? " – der Anrufer hielt es für einen Kreislaufstillstand, war es aber nicht" : l.irrtum === "mehrPatienten" ? ` – gemeldet waren ${l.gemeldet}, tatsächlich ${l.patienten.length} Betroffene` : "";
    zeilen.push(`<div><b>Tatsächlich vor Ort${esc(irrtum)}:</b><br>${l.patienten.map((p) => `${p.nr}. ${esc(patientText(p))}`).join("<br>")}</div>`);
    if (l.verlauf.length) {
      const uhr = (t: number) => new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
      zeilen.push(`<div><b>Verlauf:</b><br>${l.verlauf.map((v) => `<span class="muted">${uhr(v.zeit)}</span> ${esc(v.text)}`).join("<br>")}</div>`);
    }
  }
  // Kapitel zählt auch als richtig, wenn das gewählte Kapitel (z. B. über einen Kapitelwechsel) zum richtigen Code führt
  const kapitelOk = a.kapitel === w.kapitel || e.code === w.code || (!!a.kapitel && bestimmeCode(schema, a.kapitel, w.antworten)?.code === w.code);
  zeilen.push(`<div>${ok(kapitelOk)} Kapitel: <b>${esc(w.kapitel)} ${esc(K?.titel ?? "")}</b>${a.kapitel && a.kapitel !== w.kapitel ? ` <span class="muted">(gewählt: ${esc(a.kapitel)})</span>` : ""}</div>`);
  zeilen.push(`<div>${ok(e.code === w.code)} Code: <b>${esc(w.code)}</b> ${esc(wc?.name ?? "")} <span class="muted">${esc(wc?.kategorie ?? "")}${e.code && e.code !== w.code ? ` · eingetragen: ${esc(e.code)}` : ""}</span></div>`);
  zeilen.push(`<div class="muted">Anrufer: ${esc(w.anrufer.name)}, ${esc(w.anrufer.rolle)} · ${esc(w.anrufer.emotion)} · ${esc(w.anrufer.sprache)}${w.ortUnbekannt ? " · wusste den Ort nicht genau" : ""}</div>`);
  const tab: string[] = [];
  for (const { frage } of fragenImAblauf(schema, w.kapitel, w.antworten)) {
    const wahr = w.antworten[frage.id];
    if (wahr === undefined || wahr === null) continue;
    const ein = a.antworten[frage.id];
    const gleich =
      ein !== undefined &&
      ein !== null &&
      (String(ein) === String(wahr) || (typeof ein === "number" && typeof wahr === "number" && Math.abs(ein - wahr) <= 5));
    tab.push(
      `<tr><td>${ein === undefined ? `<span class="muted">–</span>` : ok(gleich)}</td><td>${esc(frage.text)}</td><td><b>${esc(antwortLabel(frage, wahr))}</b></td><td class="muted">${ein === undefined || ein === null ? "nicht gefragt" : esc(antwortLabel(frage, ein))}</td></tr>`,
    );
  }
  if (tab.length) zeilen.push(`<table class="aufl-tab"><tr><th></th><th>Frage</th><th>Wahrheit</th><th>eingetragen</th></tr>${tab.join("")}</table>`);
  return zeilen.join("");
}

/** Klartext aller Antworten (für Protokoll/Anzeige) */
export function antwortenText(schema: Schema, e: Einsatz): string {
  const a = e.anruf;
  if (!a) return "";
  const idx = new Map<string, Frage>();
  for (const l of Object.values(schema.globale_fragen)) for (const f of l) idx.set(f.id, f);
  if (a.kapitel) for (const f of schema.kapitel[a.kapitel]?.fragen ?? []) idx.set(f.id, f);
  return Object.entries(a.antworten)
    .map(([id, w]) => (idx.get(id) ? `${idx.get(id)!.text}: ${antwortLabel(idx.get(id)!, w)}` : ""))
    .filter(Boolean)
    .join("\n");
}
