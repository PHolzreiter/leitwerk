/**
 * Notfälle je Versorgungsstufe über den Tag: links die Stufen (Anteil, pro Tag), rechts die 24 Stunden als
 * Punkte, die man nach oben/unten ziehen („malen“) kann. Werte: ganz NÖ, Einsätze je Stunde.
 */
import { el } from "./dom";
import { openDialog } from "./dialog";
import { FUNKGRUPPE_ANTEIL, STUFEN_INFO, standardKurve, stufenKurven } from "../sim/stufenKurven";

const W = 760;
const H = 360;
const SCHRITT = W / 24;
const NS = "http://www.w3.org/2000/svg";
const fmt = (v: number, d: number) => v.toFixed(d).replace(".", ",");
const pad = (n: number) => String(n).padStart(2, "0");

export function stufenKurvenOeffnen(start: Record<string, number[]> | undefined, funkgruppe: string, fertig: (k: Record<string, number[]> | undefined) => void): void {
  const werte = stufenKurven(start);
  let sel = STUFEN_INFO[4].name;
  let stunde = 10;
  let andere = true;
  let stufe = 0.1;
  let ziehen = false;
  const maxAlle = () => Math.max(...Object.values(werte).flat());
  let yMax = Math.max(2, Math.ceil(maxAlle() * 1.25));

  const root = el("div", { class: "skd" });
  const kopf = el("div", { class: "skd-kopf" });
  const liste = el("div", { class: "skd-liste" });
  const rechts = el("div", { class: "skd-rechts" });
  const titel = el("div", { class: "skd-titel" });
  const knoepfe = el("div", { class: "skd-knoepfe" });
  const stundeZeile = el("div", { class: "skd-stunde" });
  const diagramm = el("div", { class: "skd-diagramm" });
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "skd-svg");
  const yAchse = el("div", { class: "skd-yachse" });
  const xAchse = el("div", { class: "skd-xachse" });
  diagramm.append(yAchse, svg);
  rechts.append(titel, knoepfe, stundeZeile, diagramm, xAchse, el("div", { class: "muted small skd-hinweis" }, "Punkte nach oben oder unten ziehen – auch über mehrere Stunden hinweg „malen“. Die Anteile links ergeben sich aus der Summe aller Stunden. Werte für ganz NÖ; im Spiel zählt der Anteil deiner Funkgruppe."));
  const haupt = el("div", { class: "skd-haupt" });
  haupt.append(liste, rechts);
  root.append(kopf, haupt);

  const btn = (text: string, aria: string, f: () => void) => {
    const b = el("button", { type: "button", class: "btn small", "aria-label": aria }, text) as HTMLButtonElement;
    b.addEventListener("click", () => {
      f();
      zeichnen();
    });
    return b;
  };
  const aendern = (f: (a: number[]) => number[]) => () => {
    werte[sel] = f(werte[sel].slice()).map((v) => Math.max(0, Math.round(v * 100000) / 100000));
  };
  const stufeSel = el("select", { class: "skd-schritt", "aria-label": "Schrittweite Grundniveau" }) as HTMLSelectElement;
  for (const v of ["0.01", "0.05", "0.1", "0.25", "0.5", "1"]) stufeSel.appendChild(el("option", { value: v }, v.replace(".", ",")));
  stufeSel.value = "0.1";
  stufeSel.addEventListener("change", () => (stufe = Number(stufeSel.value)));
  knoepfe.append(
    btn("↓", "Grundniveau senken", aendern((a) => a.map((v) => v - stufe))),
    el("span", { class: "muted small" }, "Grundniveau ±"),
    stufeSel,
    btn("↑", "Grundniveau heben", aendern((a) => a.map((v) => v + stufe))),
    btn("Kurve −10 %", "Kurve um 10 Prozent senken", aendern((a) => a.map((v) => v * 0.9))),
    btn("Kurve +10 %", "Kurve um 10 Prozent heben", aendern((a) => a.map((v) => v * 1.1))),
    btn("Glätten", "Kurve glätten", aendern((a) => a.map((v, h) => (a[(h + 23) % 24] + 2 * v + a[(h + 1) % 24]) / 4))),
    btn("Zurücksetzen", "Stufe auf die Statistik zurücksetzen", () => (werte[sel] = standardKurve(sel))),
  );
  const stundeText = el("span", { class: "skd-mono" });
  const wertText = el("span", { class: "skd-mono skd-wert" });
  const andereCb = el("input", { type: "checkbox" }) as HTMLInputElement;
  andereCb.checked = true;
  andereCb.addEventListener("change", () => {
    andere = andereCb.checked;
    zeichnen();
  });
  const andereLbl = el("label", { class: "skd-andere" });
  andereLbl.append(andereCb, " Andere Stufen im Hintergrund");
  stundeZeile.append(
    btn("‹", "Vorherige Stunde", () => (stunde = (stunde + 23) % 24)),
    stundeText,
    btn("›", "Nächste Stunde", () => (stunde = (stunde + 1) % 24)),
    el("span", { class: "muted small" }, "Einsätze in dieser Stunde"),
    btn("−", "Weniger", aendern((a) => ((a[stunde] -= 0.1), a))),
    wertText,
    btn("+", "Mehr", aendern((a) => ((a[stunde] += 0.1), a))),
    andereLbl,
  );

  const X = (h: number) => (h + 0.5) * SCHRITT;
  const Y = (v: number) => H - (Math.min(v, yMax) / yMax) * H;
  const farbe = (n: string) => STUFEN_INFO.find((s) => s.name === n)?.farbe ?? "#888";
  const summe = (a: number[]) => a.reduce((x, y) => x + y, 0);

  function zeichnen(): void {
    const ges = Object.values(werte).reduce((t, a) => t + summe(a), 0) || 1;
    const anteil = FUNKGRUPPE_ANTEIL[funkgruppe] ?? 1 / 6;
    kopf.innerHTML = "";
    kopf.append(el("span", { class: "muted small" }, `Ganz NÖ: ${fmt(ges, 0)} Notfälle/Tag · deine Funkgruppe ${funkgruppe}: ${fmt(anteil * 100, 1)} % ≈ ${fmt(ges * anteil, 0)}/Tag (vor „ruhig/normal/stressig“)`));
    liste.innerHTML = "";
    for (const s of STUFEN_INFO) {
      const su = summe(werte[s.name]);
      const b = el("button", { type: "button", class: `skd-stufe${s.name === sel ? " an" : ""}`, "data-stufe": s.name }) as HTMLButtonElement;
      const punkt = el("span", { class: "skd-punkt" });
      punkt.style.background = s.farbe;
      if (s.name === sel) b.style.borderColor = s.farbe;
      b.append(punkt, el("span", { class: "skd-name" }, s.name), el("span", { class: "skd-mono skd-pct" }, `${fmt((su / ges) * 100, su / ges < 0.001 ? 4 : 1)} %`), el("span", { class: "skd-mono muted" }, fmt(su, su < 10 ? 1 : 0)));
      b.addEventListener("click", () => {
        sel = s.name;
        zeichnen();
      });
      liste.appendChild(b);
    }
    const su = summe(werte[sel]);
    titel.innerHTML = "";
    const gp = el("span", { class: "skd-punkt gross" });
    gp.style.background = farbe(sel);
    titel.append(gp, el("strong", {}, sel), el("span", { class: "muted small" }, ` ${fmt(su, su < 10 ? 1 : 0)} Notfälle/Tag · ${fmt((su / ges) * 100, 1)} %`));
    stundeText.textContent = `${pad(stunde)}:00–${pad(stunde)}:59`;
    wertText.textContent = fmt(werte[sel][stunde], 2);

    svg.innerHTML = "";
    const add = (tag: string, a: Record<string, string>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
      svg.appendChild(n);
      return n;
    };
    yAchse.innerHTML = "";
    for (let i = 0; i <= 6; i++) {
      const v = (yMax * i) / 6;
      add("line", { x1: "0", x2: String(W), y1: String(Y(v)), y2: String(Y(v)), stroke: "var(--skd-raster)", "stroke-width": "1" });
      const l = el("span", {}, fmt(v, Number.isInteger(v) ? 0 : 1));
      l.style.top = `${(Y(v) / H) * 100}%`;
      yAchse.appendChild(l);
    }
    for (let h = 1; h < 24; h++) add("line", { x1: String(h * SCHRITT), x2: String(h * SCHRITT), y1: "0", y2: String(H), stroke: "var(--skd-raster)", "stroke-width": h % 6 ? "0.5" : "1" });
    add("rect", { x: String(stunde * SCHRITT), y: "0", width: String(SCHRITT), height: String(H), fill: farbe(sel), opacity: "0.08" });
    const kurve = (name: string, gross: boolean) => {
      const a = werte[name];
      add("polyline", { points: a.map((v, h) => `${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(" "), fill: "none", stroke: farbe(name), "stroke-width": gross ? "2.5" : "1.5", opacity: gross ? "1" : "0.25" });
      a.forEach((v, h) => add("circle", { cx: X(h).toFixed(1), cy: Y(v).toFixed(1), r: gross ? (h === stunde ? "7" : "5.5") : "2.5", fill: farbe(name), stroke: gross ? "var(--skd-grund)" : "none", "stroke-width": "2", opacity: gross ? "1" : "0.25" }));
    };
    if (andere) for (const s of STUFEN_INFO) if (s.name !== sel) kurve(s.name, false);
    kurve(sel, true);
  }

  // Ziehen / Malen
  const ausEvent = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const h = Math.max(0, Math.min(23, Math.floor(x / SCHRITT)));
    const v = Math.max(0, Math.min(yMax, Math.round(((H - y) / H) * yMax * 100) / 100));
    return { h, v };
  };
  const setzen = (e: PointerEvent) => {
    const p = ausEvent(e);
    werte[sel] = werte[sel].slice();
    werte[sel][p.h] = p.v;
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
    ziehen = false;
    yMax = Math.max(2, Math.ceil(maxAlle() * 1.25));
    zeichnen();
  };
  svg.addEventListener("pointerup", los);
  svg.addEventListener("pointercancel", los);
  for (let h = 0; h <= 24; h += 2) {
    const l = el("span", {}, pad(h));
    l.style.left = `${(h / 24) * 100}%`;
    xAchse.appendChild(l);
  }
  zeichnen();

  openDialog({
    title: "Notfälle je Versorgungsstufe über den Tag",
    body: root,
    wide: true,
    actions: [
      { label: "Abbrechen" },
      {
        label: "Alle auf Statistik",
        onClick: () => {
          for (const s of STUFEN_INFO) werte[s.name] = standardKurve(s.name);
          zeichnen();
          return false;
        },
      },
      {
        label: "Übernehmen",
        kind: "primary",
        onClick: () => {
          // nur abweichende Stufen speichern; alles wie Standard = nichts speichern
          const eigen: Record<string, number[]> = {};
          for (const s of STUFEN_INFO) {
            const std = standardKurve(s.name);
            if (werte[s.name].some((v, i) => Math.abs(v - std[i]) > 0.000005)) eigen[s.name] = werte[s.name];
          }
          fertig(Object.keys(eigen).length ? eigen : undefined);
        },
      },
    ],
  });
}
