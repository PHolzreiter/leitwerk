/**
 * Fußleiste des Arbeitsplatzes wie in der Gesamtansicht des Entwurfs:
 * „Ein Bildschirm 16:9 (1920 × 1080) · Karte und Adressen geladen · … · Autosicherung vor 2 Min. · v0.115.0“.
 * Baut die vorhandene Statusleiste aus index.html um; die Elemente, die andere Teile beschreiben
 * (#cursor-pos, #zoom-level, #app-version), bleiben erhalten.
 */
import { letzteAutosicherung } from "../../net/spielstand";
import { geoStatus } from "../../sim/geo";
import { el } from "../dom";
import { aufbau, onAufbau } from "./arbeitsplatz";
import { FENSTER_ID, IST_HAUPT } from "./bus";

let gestartet = false;

export function fussleisteStarten(): void {
  const fuss = document.querySelector<HTMLElement>("footer.statusbar");
  if (!fuss || gestartet) return;
  gestartet = true;
  fuss.classList.add("lw-fuss");

  const aufbauEl = el("span", { class: "lw-fuss-aufbau" });
  const geoEl = el("span", { class: "lw-fuss-geo" });
  const sicherungEl = el("span", { class: "lw-fuss-sicherung" });
  const karteEl = el("span", { class: "lw-fuss-karte" });
  const pos = document.getElementById("cursor-pos");
  const zoom = document.getElementById("zoom-level");
  const version = document.getElementById("app-version");
  // Straßennetz/Adressen zeigt jetzt die eigene Anzeige; der Tipp-Text steht nicht mehr in der Leiste
  document.getElementById("geo-status")?.setAttribute("hidden", "");
  fuss.querySelector(".statusbar-tipp")?.setAttribute("hidden", "");
  const spacer = fuss.querySelector(".statusbar-spacer") ?? el("span", { class: "statusbar-spacer" });
  // Position und Zoom der Karte nur, solange die Maus über einer Karte ist
  if (pos) karteEl.append(pos);
  if (zoom) karteEl.append(zoom);
  fuss.prepend(aufbauEl, geoEl);
  fuss.insertBefore(spacer, version);
  fuss.insertBefore(karteEl, version);
  fuss.insertBefore(sicherungEl, version);
  document.addEventListener("pointerover", (e) => {
    const t = e.target as HTMLElement | null;
    fuss.classList.toggle("ueber-karte", !!t?.closest?.(".maplibregl-map, .map"));
  });

  const aufbauZeigen = () => {
    const dpr = window.devicePixelRatio || 1;
    const aufl = `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)}`;
    const a = aufbau();
    if (!IST_HAUPT) {
      const nr = FENSTER_ID.replace(/^fenster-/, "");
      aufbauEl.textContent = `Programmfenster ${nr} (${aufl})`;
    } else if (a.schirm) aufbauEl.textContent = `Bildschirm 1 · ${a.schirm}`;
    else aufbauEl.textContent = a.name ? `${a.name} (${aufl})` : `Bildschirm ${aufl}`;
    aufbauEl.title = a.name ? `Anordnung: ${a.name}` : "";
  };
  onAufbau(aufbauZeigen);
  window.addEventListener("resize", aufbauZeigen);
  aufbauZeigen();

  const sicherungZeigen = () => {
    if (!IST_HAUPT) {
      sicherungEl.hidden = true;
      return;
    }
    const t = letzteAutosicherung();
    if (!t) {
      sicherungEl.textContent = "Autosicherung jede Minute";
      sicherungEl.title = "Gesichert wird, sobald es Einsätze gibt und sich etwas ändert.";
      return;
    }
    const min = Math.floor((Date.now() - t) / 60_000);
    sicherungEl.textContent = min < 1 ? "Autosicherung gerade eben" : `Autosicherung vor ${min} Min.`;
    sicherungEl.title = `Zuletzt automatisch gesichert um ${new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}`;
  };
  sicherungZeigen();
  window.setInterval(sicherungZeigen, 15_000);

  void (async () => {
    for (let i = 0; i < 120; i++) {
      try {
        const g = await geoStatus();
        const laedt = g.roads === "laden" || g.addresses === "laden";
        const fehler = g.roads.startsWith("Fehler") || g.addresses.startsWith("Fehler");
        const ersatz = g.roads === "Browser-Ersatz";
        geoEl.className = `lw-fuss-geo${fehler ? " fehler" : laedt || ersatz ? " warn" : " ok"}`;
        geoEl.textContent = fehler
          ? "Karte oder Adressen nicht geladen"
          : laedt
            ? "Karte und Adressen werden geladen …"
            : ersatz
              ? "Straßennetz und Adressen: Browser-Ersatz"
              : "Karte und Adressen geladen";
        geoEl.title = `Straßennetz: ${g.roads} · Adressen: ${g.addresses}`;
        if (!laedt) return;
      } catch {
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  })();
}
