/**
 * Einstellungen → Einsatzaufkommen: Umschalter Grafik/Tabelle, ruhig/normal/stressig, darunter
 * - Grafik: je Reihe (Notfälle je Versorgungsstufe, Krankentransporte, Überstellungen, ACN) 24 Stunden als Punkte zum Ziehen
 * - Tabelle: die bisherige Stundentabelle und die Schwere harmlos/mittel/kritisch
 * Werte in der Grafik gelten für die gespielte Funkgruppe; die Notfälle werden intern für ganz NÖ gespeichert.
 */
import { el } from "./dom";
import { defaultStunden, type Settings } from "../sim/settings";
import { acnKurve, acnStandard, FUNKGRUPPE_ANTEIL, STUFEN_INFO, standardKurve, stufenKurven } from "../sim/stufenKurven";

const W = 760;
const H = 330;
const SCHRITT = W / 24;
const NS = "http://www.w3.org/2000/svg";
const fmt = (v: number, d: number) => v.toFixed(d).replace(".", ",");
const pad = (n: number) => String(n).padStart(2, "0");
const summe = (a: number[]) => a.reduce((x, y) => x + y, 0);
const rund = (v: number) => Math.max(0, Math.round(v * 100000) / 100000);

interface Reihe {
  id: string;
  name: string;
  farbe: string;
  gruppe: "Notfälle" | "Transporte" | "ACN";
  einheit: string;
  get(): number[];
  set(a: number[]): void;
  standard(): number[];
}

export function aufkommenBauen(draft: Settings, num: (v: number, step?: string) => HTMLInputElement): HTMLElement {
  const root = el("div", { class: "auf" });
  const fg = draft.funkgruppe ?? "NÖ-03";
  const anteil = FUNKGRUPPE_ANTEIL[fg] ?? 1 / 6;

  // ---------------------------------------------------------------- Reihen
  const notfall = (name: string, farbe: string): Reihe => ({
    id: `rd:${name}`,
    name,
    farbe,
    gruppe: "Notfälle",
    einheit: "Notfälle",
    get: () => stufenKurven(draft.stufenStunden)[name].map((v) => v * anteil),
    set: (a) => {
      const noe = a.map((v) => rund(v / anteil));
      const std = standardKurve(name);
      const eigen = { ...(draft.stufenStunden ?? {}) };
      if (noe.some((v, i) => Math.abs(v - std[i]) > 0.000005)) eigen[name] = noe;
      else delete eigen[name];
      draft.stufenStunden = Object.keys(eigen).length ? eigen : undefined;
    },
    standard: () => standardKurve(name).map((v) => v * anteil),
  });
  const stundenReihe = (id: "kt" | "sek", name: string, farbe: string): Reihe => ({
    id,
    name,
    farbe,
    gruppe: "Transporte",
    einheit: "Fahrten",
    get: () => draft.stunden.map((z) => z[id] ?? 0),
    set: (a) => a.forEach((v, h) => (draft.stunden[h][id] = rund(v))),
    standard: () => defaultStunden().map((z) => z[id]),
  });
  const reihen: Reihe[] = [
    ...STUFEN_INFO.map((s) => notfall(s.name, s.farbe)),
    stundenReihe("kt", "Krankentransporte", "#0b55a8"),
    stundenReihe("sek", "Überstellungen", "#6d4fd6"),
    {
      id: "acn",
      name: "ACN (je Standort)",
      farbe: "#c2410c",
      gruppe: "ACN",
      einheit: "Einsätze je Standort",
      get: () => acnKurve(draft),
      set: (a) => {
        draft.acnStunden = a.map(rund);
        draft.acnProTag = undefined;
      },
      standard: () => acnStandard(2),
    },
  ];
  const reihe = (id: string) => reihen.find((r) => r.id === id)!;

  // ---------------------------------------------------------------- Kopf: Umschalter
  const kopf = el("div", { class: "set-grid auf-kopf" });
  const seg = (werte: [string, string][], aktiv: string, klasse: string, f: (v: string) => void) => {
    const box = el("div", { class: `auf-seg ${klasse}`, role: "group" });
    for (const [v, l] of werte) {
      const b = el("button", { type: "button", class: "auf-seg-b", "data-wert": v }, l) as HTMLButtonElement;
      b.setAttribute("aria-pressed", String(v === aktiv));
      b.addEventListener("click", () => {
        for (const x of box.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
        f(v);
      });
      box.appendChild(b);
    }
    return box;
  };
  const modus = () => (draft.verteilungNach === "schwere" ? "tabelle" : "grafik");
  kopf.append(
    el("label", { title: "Grafik: je Reihe 24 Stunden als Punkte; Tabelle: Zahlen je Stunde und Schwere harmlos/mittel/kritisch" }, "Einstellen mit"),
    seg([["grafik", "Grafik"], ["tabelle", "Tabelle"]], modus(), "auf-modus", (v) => {
      draft.verteilungNach = v === "tabelle" ? "schwere" : "stufe";
      zeigen();
    }),
    el("label", { title: "Wie auf der Startseite: ruhig (etwa 60 %), normal oder stressig (etwa 160 %) – gilt für alles" }, "Aufkommen insgesamt"),
    seg(
      [["ruhig", "Ruhig"], ["normal", "Normal"], ["stressig", "Stressig"]],
      draft.aufkommenStufe ?? "normal",
      "auf-stufe",
      (v) => {
        draft.aufkommenStufe = v as Settings["aufkommenStufe"];
        zusammenfassung();
      },
    ),
  );
  const info = el("div", { class: "auf-info muted small" });
  const grafik = el("div", { class: "auf-grafik" });
  const tabelle = el("div", { class: "auf-tabelle" });
  root.append(kopf, info, grafik, tabelle);

  const FAKTOR: Record<string, number> = { ruhig: 0.6, normal: 1, stressig: 1.6 };
  function zusammenfassung(): void {
    const f = FAKTOR[draft.aufkommenStufe ?? "normal"] ?? 1;
    const rd = modus() === "grafik" ? reihen.filter((r) => r.gruppe === "Notfälle").reduce((t, r) => t + summe(r.get()), 0) : summe(draft.stunden.map((z) => z.rd));
    const kt = summe(reihe("kt").get());
    const sek = summe(reihe("sek").get());
    const acn = summe(reihe("acn").get());
    info.textContent = `Funkgruppe ${fg}${modus() === "grafik" ? ` (${fmt(anteil * 100, 1)} % von NÖ)` : ""} · am Tag ≈ ${Math.round(rd * f)} Notfälle, ${Math.round(kt * f)} Krankentransporte, ${Math.round(sek * f)} Überstellungen, ${fmt(acn * f, 1)} ACN-Einsätze je Standort${f !== 1 ? ` (${draft.aufkommenStufe})` : ""}`;
  }

  // ---------------------------------------------------------------- Grafik
  let sel = "rd:BLS gelb";
  let stunde = 10;
  let schritt = 0.1;
  let andere = true;
  let ziehen = false;
  let yMax = 1;
  const liste = el("div", { class: "auf-liste" });
  const rechts = el("div", { class: "auf-rechts" });
  const titel = el("div", { class: "auf-titel" });
  const knoepfe = el("div", { class: "auf-knoepfe" });
  const stundeZeile = el("div", { class: "auf-stunde" });
  const diagramm = el("div", { class: "auf-diagramm" });
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "auf-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Einsätze je Stunde – Punkte ziehen zum Ändern");
  const yAchse = el("div", { class: "auf-yachse" });
  const xAchse = el("div", { class: "auf-xachse" });
  diagramm.append(yAchse, svg);
  rechts.append(titel, knoepfe, stundeZeile, diagramm, xAchse, el("div", { class: "muted small" }, "Punkte nach oben oder unten ziehen – auch über mehrere Stunden „malen“. Die Anteile ergeben sich aus der Summe aller Stunden."));
  const haupt = el("div", { class: "auf-haupt" });
  haupt.append(liste, rechts);
  grafik.appendChild(haupt);

  const knopf = (text: string, aria: string, f: () => void) => {
    const b = el("button", { type: "button", class: "btn small", "aria-label": aria }, text) as HTMLButtonElement;
    b.addEventListener("click", () => {
      f();
      yNeu();
      zeichnen();
    });
    return b;
  };
  const aendern = (f: (a: number[]) => number[]) => () => {
    const r = reihe(sel);
    r.set(f(r.get().slice()).map((v) => Math.max(0, v)));
  };
  const schrittSel = el("select", { "aria-label": "Schrittweite" }) as HTMLSelectElement;
  for (const v of ["0.01", "0.05", "0.1", "0.25", "0.5", "1"]) schrittSel.appendChild(el("option", { value: v }, v.replace(".", ",")));
  schrittSel.value = "0.1";
  schrittSel.addEventListener("change", () => (schritt = Number(schrittSel.value)));
  knoepfe.append(
    knopf("↓", "Grundniveau senken", aendern((a) => a.map((v) => v - schritt))),
    el("span", { class: "muted small" }, "Grundniveau ±"),
    schrittSel,
    knopf("↑", "Grundniveau heben", aendern((a) => a.map((v) => v + schritt))),
    knopf("Kurve −10 %", "Kurve um 10 Prozent senken", aendern((a) => a.map((v) => v * 0.9))),
    knopf("Kurve +10 %", "Kurve um 10 Prozent heben", aendern((a) => a.map((v) => v * 1.1))),
    knopf("Glätten", "Kurve glätten", aendern((a) => a.map((v, h) => (a[(h + 23) % 24] + 2 * v + a[(h + 1) % 24]) / 4))),
    knopf("Zurücksetzen", "Diese Reihe auf den Standard setzen", () => reihe(sel).set(reihe(sel).standard())),
    knopf("Alle zurücksetzen", "Alle Reihen auf den Standard setzen", () => reihen.forEach((r) => r.set(r.standard()))),
  );
  const stundeText = el("span", { class: "auf-mono" });
  const wertText = el("span", { class: "auf-mono auf-wert" });
  const andereCb = el("input", { type: "checkbox" }) as HTMLInputElement;
  andereCb.checked = true;
  andereCb.addEventListener("change", () => {
    andere = andereCb.checked;
    zeichnen();
  });
  const andereLbl = el("label", { class: "auf-andere" });
  andereLbl.append(andereCb, " Andere im Hintergrund");
  stundeZeile.append(
    knopf("‹", "Vorherige Stunde", () => (stunde = (stunde + 23) % 24)),
    stundeText,
    knopf("›", "Nächste Stunde", () => (stunde = (stunde + 1) % 24)),
    el("span", { class: "muted small" }, "in dieser Stunde"),
    knopf("−", "Weniger", aendern((a) => ((a[stunde] -= schritt), a))),
    wertText,
    knopf("+", "Mehr", aendern((a) => ((a[stunde] += schritt), a))),
    andereLbl,
  );
  for (let h = 0; h <= 24; h += 2) {
    const l = el("span", {}, pad(h));
    l.style.left = `${(h / 24) * 100}%`;
    xAchse.appendChild(l);
  }

  const gruppeVon = (id: string) => reihe(id).gruppe;
  function yNeu(): void {
    const g = gruppeVon(sel);
    const m = Math.max(...reihen.filter((r) => r.gruppe === g).flatMap((r) => r.get()), 0.05);
    const roh = m * 1.25;
    const stufen = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
    yMax = stufen.find((s) => s * 6 >= roh) ? stufen.find((s) => s * 6 >= roh)! * 6 : Math.ceil(roh);
  }
  const X = (h: number) => (h + 0.5) * SCHRITT;
  const Y = (v: number) => H - (Math.min(v, yMax) / yMax) * H;

  function zeichnen(): void {
    zusammenfassung();
    const notf = reihen.filter((r) => r.gruppe === "Notfälle");
    const gesN = notf.reduce((t, r) => t + summe(r.get()), 0) || 1;
    liste.innerHTML = "";
    let letzte = "";
    for (const r of reihen) {
      if (r.gruppe !== letzte) {
        letzte = r.gruppe;
        const sumG = r.gruppe === "Notfälle" ? gesN : 0;
        liste.appendChild(el("div", { class: "auf-gruppe" }, r.gruppe === "Notfälle" ? `Notfälle · ${fmt(sumG, 0)}/Tag` : r.gruppe === "Transporte" ? "Krankentransporte und Überstellungen" : "Akutpflege (ACN)"));
      }
      const su = summe(r.get());
      const b = el("button", { type: "button", class: `auf-reihe${r.id === sel ? " an" : ""}`, "data-reihe": r.id }) as HTMLButtonElement;
      const p = el("span", { class: "auf-punkt" });
      p.style.background = r.farbe;
      if (r.id === sel) b.style.borderColor = r.farbe;
      const pct = r.gruppe === "Notfälle" ? `${fmt((su / gesN) * 100, su / gesN < 0.001 ? 4 : 1)} %` : "";
      b.append(p, el("span", { class: "auf-name" }, r.name), el("span", { class: "auf-mono auf-pct" }, pct), el("span", { class: "auf-mono muted" }, fmt(su, su < 10 ? 1 : 0)));
      b.addEventListener("click", () => {
        sel = r.id;
        yNeu();
        zeichnen();
      });
      liste.appendChild(b);
    }
    const r = reihe(sel);
    const a = r.get();
    const su = summe(a);
    titel.innerHTML = "";
    const gp = el("span", { class: "auf-punkt gross" });
    gp.style.background = r.farbe;
    titel.append(gp, el("strong", {}, r.name), el("span", { class: "muted small" }, `${fmt(su, su < 10 ? 1 : 0)} ${r.einheit} am Tag${r.gruppe === "Notfälle" ? ` · ${fmt((su / gesN) * 100, 1)} % der Notfälle` : ""}`));
    stundeText.textContent = `${pad(stunde)}:00–${pad(stunde)}:59`;
    wertText.textContent = fmt(a[stunde], 2);

    svg.innerHTML = "";
    const add = (tag: string, at: Record<string, string>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(at)) n.setAttribute(k, v);
      svg.appendChild(n);
      return n;
    };
    yAchse.innerHTML = "";
    for (let i = 0; i <= 6; i++) {
      const v = (yMax * i) / 6;
      add("line", { x1: "0", x2: String(W), y1: String(Y(v)), y2: String(Y(v)), class: "auf-raster" });
      const l = el("span", {}, fmt(v, Number.isInteger(v) ? 0 : v < 1 ? 2 : 1));
      l.style.top = `${(Y(v) / H) * 100}%`;
      yAchse.appendChild(l);
    }
    for (let h = 1; h < 24; h++) add("line", { x1: String(h * SCHRITT), x2: String(h * SCHRITT), y1: "0", y2: String(H), class: h % 6 ? "auf-raster fein" : "auf-raster" });
    add("rect", { x: String(stunde * SCHRITT), y: "0", width: String(SCHRITT), height: String(H), fill: r.farbe, opacity: "0.08" });
    const kurve = (k: Reihe, gross: boolean) => {
      const w = k.get();
      add("polyline", { points: w.map((v, h) => `${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(" "), fill: "none", stroke: k.farbe, "stroke-width": gross ? "2.5" : "1.5", opacity: gross ? "1" : "0.25" });
      w.forEach((v, h) => add("circle", { cx: X(h).toFixed(1), cy: Y(v).toFixed(1), r: gross ? (h === stunde ? "7" : "5.5") : "2.5", fill: k.farbe, class: gross ? "auf-dot" : "", opacity: gross ? "1" : "0.25" }));
    };
    if (andere) for (const k of reihen) if (k.id !== sel && k.gruppe === r.gruppe) kurve(k, false);
    kurve(r, true);
  }

  const ausEvent = (e: PointerEvent) => {
    const rc = svg.getBoundingClientRect();
    const x = ((e.clientX - rc.left) / rc.width) * W;
    const y = ((e.clientY - rc.top) / rc.height) * H;
    return { h: Math.max(0, Math.min(23, Math.floor(x / SCHRITT))), v: Math.max(0, Math.min(yMax, Math.round(((H - y) / H) * yMax * 1000) / 1000)) };
  };
  const setzen = (e: PointerEvent) => {
    const p = ausEvent(e);
    const r = reihe(sel);
    const a = r.get().slice();
    a[p.h] = p.v;
    r.set(a);
    stunde = p.h;
    zeichnen();
  };
  svg.addEventListener("pointerdown", (e) => {
    ziehen = true;
    svg.setPointerCapture(e.pointerId);
    setzen(e);
  });
  svg.addEventListener("pointermove", (e) => ziehen && setzen(e));
  const los = () => {
    if (!ziehen) return;
    ziehen = false;
    yNeu();
    zeichnen();
  };
  svg.addEventListener("pointerup", los);
  svg.addEventListener("pointercancel", los);

  // ---------------------------------------------------------------- Tabelle (bisherige Methode)
  function tabelleBauen(): void {
    tabelle.innerHTML = "";
    const schwere = { harmlos: 35, mittel: 50, kritisch: 15, ...(draft.schwere ?? {}) };
    const swBox = el("div", { class: "auf-schwere" });
    swBox.appendChild(el("span", { class: "muted small" }, "Schwere der Notfälle (%):"));
    for (const k of ["harmlos", "mittel", "kritisch"] as const) {
      const i = num(schwere[k], "5");
      i.dataset.schwere = k;
      i.addEventListener("change", () => {
        schwere[k] = Math.max(0, Number(i.value) || 0);
        draft.schwere = { ...schwere };
      });
      swBox.append(el("span", { class: "small" }, k), i);
    }
    tabelle.appendChild(swBox);
    const tab = el("table", { class: "set-table stunden" });
    const kopfT = `<th>Stunde</th><th>Notfälle / h</th><th>KT / h</th><th>Überst. / h</th><th>ACN / h je Standort</th>`;
    tab.innerHTML = `<tr>${kopfT}<th></th>${kopfT}</tr>`;
    const acn = acnKurve(draft);
    for (let h = 0; h < 12; h++) {
      const tr = el("tr");
      for (const st of [h, h + 12]) {
        const z = draft.stunden[st];
        const td = (x: HTMLElement | string) => {
          const c = el("td");
          if (typeof x === "string") c.textContent = x;
          else c.appendChild(x);
          tr.appendChild(c);
        };
        const feld = (v: number, step: string, f: (n: number) => void) => {
          const i = num(Math.round(v * 100) / 100, step);
          i.addEventListener("change", () => {
            f(Math.max(0, Number(i.value) || 0));
            zusammenfassung();
          });
          return i;
        };
        td(`${pad(st)}–${pad(st + 1)} Uhr`);
        td(feld(z.rd, "0.5", (n) => (z.rd = n)));
        td(feld(z.kt, "0.5", (n) => (z.kt = n)));
        td(feld(z.sek ?? 0, "0.1", (n) => (z.sek = n)));
        td(
          feld(acn[st], "0.05", (n) => {
            const a = acnKurve(draft).slice();
            a[st] = n;
            draft.acnStunden = a;
            draft.acnProTag = undefined;
          }),
        );
        if (st === h) td("");
      }
      tab.appendChild(tr);
    }
    tabelle.appendChild(tab);
  }

  function zeigen(): void {
    const g = modus() === "grafik";
    grafik.hidden = !g;
    tabelle.hidden = g;
    if (g) {
      yNeu();
      zeichnen();
    } else tabelleBauen();
    zusammenfassung();
  }
  zeigen();
  return root;
}
