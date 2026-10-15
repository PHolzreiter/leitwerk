/**
 * Wetter-Fenster (Klick auf das Wetter oben): Aktuell, Prognose und Warnungen
 * für den Einsatzraum der Funkgruppe – alles aus dem simulierten Wetter.
 */
import { sim } from "../sim/engine";
import {
  flugEingeschraenkt,
  flugverbot,
  JAHRESZEIT_LABEL,
  jahreszeitVon,
  LAGE,
  modusVon,
  richtungText,
  symbolFuer,
  tagesPrognose,
  warnungen,
  wetterSatz,
  windText,
  type PrognoseStunde,
  type Warnung,
} from "../sim/weather";
import { el, esc } from "./dom";

type Reiter = "aktuell" | "prognose" | "warnungen";
const uhr = (t: number) => new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
let offen: { schliessen(): void } | null = null;

function sichtText(km: number): string {
  return km >= 10 ? "> 10 km" : km >= 1 ? `${Math.round(km)} km` : `${Math.round(km * 1000)} m`;
}

function flugText(p: PrognoseStunde): string {
  return flugverbot(p.lage, p.wind) ? `<span class="wx-rot">kein Flug</span>` : flugEingeschraenkt(p.lage, p.wind) ? `<span class="wx-gelb">eingeschränkt</span>` : `<span class="wx-ok">möglich</span>`;
}

function warnHtml(ws: Warnung[], kurz: boolean): string {
  if (!ws.length)
    return `<div class="wx-keine"><span class="wx-haken">✓</span><div><b>Keine Warnungen</b><div class="muted">Zurzeit liegen keine Unwetter- oder Wetterwarnungen für den Einsatzraum vor.</div></div></div>`;
  return ws
    .slice(0, kurz ? 3 : 20)
    .map(
      (w) =>
        `<div class="wx-warn st-${w.stufe}"><span class="wx-stufe">${w.stufe === "rot" ? "Rot" : w.stufe === "orange" ? "Orange" : "Gelb"}</span><div><b>${esc(w.text)}</b><div class="muted">${uhr(w.von)} – ${uhr(w.bis)} Uhr</div></div></div>`,
    )
    .join("");
}

export function wetterOeffnen(): void {
  if (offen) return offen.schliessen();
  const overlay = el("div", { class: "wx-overlay" });
  const box = el("div", { class: "wx", role: "dialog", "aria-label": "Wetter" });
  const kopf = el("div", { class: "wx-kopf" });
  const reiterLeiste = el("div", { class: "wx-reiter" });
  const inhalt = el("div", { class: "wx-inhalt" });
  box.append(kopf, reiterLeiste, inhalt);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  let reiter: Reiter = "aktuell";
  const reiterKnopf = (r: Reiter, label: string) => {
    const b = el("button", { type: "button", class: "wx-tab" }, label);
    b.dataset.r = r;
    b.addEventListener("click", () => {
      reiter = r;
      zeichnen();
    });
    return b;
  };
  reiterLeiste.append(reiterKnopf("aktuell", "☁ Aktuell"), reiterKnopf("prognose", "📈 Prognose"), reiterKnopf("warnungen", "⚠ Warnungen"));

  function zeichnen(): void {
    const o = sim.wetterOpt();
    const w = sim.state.wetter;
    const t = sim.state.zeit;
    const p = sim.wetterPrognose(24);
    const jetzt = p[0];
    const ws = warnungen(w, t, o);
    const tage = tagesPrognose(w, t, o, 5);
    const g = sim.funkgruppe();
    kopf.innerHTML = `<div class="wx-titel-sym">${symbolFuer(jetzt.lage, jetzt.nacht)}</div><div><div class="wx-titel">Wetter</div><div class="muted">Aktuelle Lage und Prognose für den Einsatzraum TETRA ${esc(g.id)}</div></div>`;
    const zu = el("button", { class: "wx-zu", type: "button", title: "Schließen (Esc)" }, "✕");
    zu.addEventListener("click", schliessen);
    kopf.appendChild(zu);
    reiterLeiste.querySelectorAll<HTMLButtonElement>(".wx-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.r === reiter);
      if (b.dataset.r === "warnungen") b.textContent = `⚠ Warnungen${ws.length ? ` (${ws.length})` : ""}`;
    });
    const stunden = p.slice(1, 13);
    const stundenHtml = `<div class="wx-stunden">${stunden
      .map((x) => `<div class="wx-std"><div class="muted">${uhr(x.zeit)}</div><div class="wx-sym">${symbolFuer(x.lage, x.nacht)}</div><b>${Math.round(x.temp)}°</b><div class="wx-tropfen">💧 ${x.regen} %</div></div>`)
      .join("")}</div>`;
    const tageHtml = `<div class="wx-tage">${tage
      .map(
        (d, i) =>
          `<div class="wx-tag${i === 0 ? " heute" : ""}"><div>${i === 0 ? "Heute" : WT[new Date(d.tag).getDay()]}</div><div class="muted">${new Date(d.tag).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" })}</div><div class="wx-sym">${symbolFuer(d.lage, false)}</div><b>${d.min}° / ${d.max}°</b><div class="wx-tropfen">💧 ${d.regen} %</div></div>`,
      )
      .join("")}</div>`;
    if (reiter === "aktuell") {
      inhalt.innerHTML = `
        <div class="wx-oben">
          <div class="wx-karte">
            <div class="wx-ort">📍 <b>Einsatzraum ${esc(g.id)}</b><span class="muted">Stand ${uhr(t)} Uhr (Spielzeit)</span></div>
            <div class="wx-jetzt">
              <div class="wx-gross">${symbolFuer(jetzt.lage, jetzt.nacht)}</div>
              <div><div class="wx-temp">${Math.round(jetzt.temp)} °C</div><div class="wx-lage">${esc(LAGE[jetzt.lage].label)}</div><div class="muted">${esc(wetterSatz(p))}</div></div>
            </div>
          </div>
          <div class="wx-werte">
            <div><span>🌡 Gefühlte Temperatur</span><b>${jetzt.gefuehlt} °C</b></div>
            <div><span>💧 Luftfeuchtigkeit</span><b>${jetzt.feuchte} %</b></div>
            <div><span>🌬 Wind</span><b>${jetzt.wind} km/h <span class="muted">${windText(jetzt.wind)}, aus ${richtungText(jetzt.richtung)}</span></b></div>
            <div><span>💨 Böen</span><b>${jetzt.boeen} km/h</b></div>
            <div><span>👁 Sichtweite</span><b>${sichtText(jetzt.sicht)}</b></div>
            <div><span>⏲ Luftdruck</span><b>${jetzt.druck.toLocaleString("de-AT")} hPa</b></div>
            <div><span>🚁 Flugbetrieb</span><b>${flugText(jetzt)}</b></div>
          </div>
        </div>
        <div class="wx-abschnitt"><b>Stündliche Prognose</b> <span class="muted">(nächste 12 Stunden)</span></div>${stundenHtml}
        <div class="wx-unten">
          <div><div class="wx-abschnitt"><b>Tagesprognose</b> <span class="muted">(nächste 5 Tage)</span></div>${tageHtml}</div>
          <div class="wx-warnbox"><div class="wx-abschnitt"><b>⚠ Wetterwarnungen</b></div>${warnHtml(ws, true)}</div>
        </div>
        <div class="muted small wx-fuss">${JAHRESZEIT_LABEL[jahreszeitVon(t, o)]} · Wetter: ${modusVon(o.wechsel)}${sim.settings.wetterAktiv ? "" : " · Wetter ist ausgeschaltet"}</div>`;
    } else if (reiter === "prognose") {
      inhalt.innerHTML = `
        <div class="wx-abschnitt"><b>Die nächsten 24 Stunden</b></div>
        <div class="wx-tabelle-wrap"><table class="wx-tabelle">
          <tr><th>Zeit</th><th></th><th>Wetter</th><th>Temp.</th><th>gefühlt</th><th>Wind</th><th>Böen</th><th>Regen</th><th>Sicht</th><th>Flug</th></tr>
          ${p
            .map(
              (x, i) =>
                `<tr${i === 0 ? ` class="jetzt"` : ""}><td>${i === 0 ? "jetzt" : uhr(x.zeit)}</td><td>${symbolFuer(x.lage, x.nacht)}</td><td>${esc(LAGE[x.lage].label)}</td><td><b>${Math.round(x.temp)}°</b></td><td>${x.gefuehlt}°</td><td>${x.wind} km/h ${richtungText(x.richtung)}</td><td>${x.boeen}</td><td>${x.regen} %</td><td>${sichtText(x.sicht)}</td><td>${flugText(x)}</td></tr>`,
            )
            .join("")}
        </table></div>
        <div class="wx-abschnitt"><b>Tagesprognose</b></div>${tageHtml}`;
    } else {
      inhalt.innerHTML = `<div class="wx-abschnitt"><b>Warnungen für die nächsten 24 Stunden</b></div><div class="wx-warnliste">${warnHtml(ws, false)}</div>
        <div class="muted small wx-fuss">Gelb = Vorsicht · Orange = Gefahr · Rot = große Gefahr. Bei Nebel, Hochnebel, Gewitter, Unwetter, starkem Schneefall und Sturm fliegt kein Hubschrauber.</div>`;
    }
  }

  let timer: number | undefined;
  const aus = sim.onChange(() => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      zeichnen();
    }, 1000);
  });
  const taste = (e: KeyboardEvent) => {
    if (e.key === "Escape") schliessen();
  };
  document.addEventListener("keydown", taste);
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) schliessen();
  });
  function schliessen(): void {
    aus();
    window.clearTimeout(timer);
    document.removeEventListener("keydown", taste);
    overlay.remove();
    offen = null;
  }
  offen = { schliessen };
  zeichnen();
}
