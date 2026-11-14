// Statusfarben – eine Quelle für das ganze Programm (Paul 14.11.2026: „eigene Statusfarben ÜBERALL“).
// Reihenfolge: eigene Farbe (persönlich) → Farbe der Leitstelle (Statusmodell, nur wenn dort geändert) → Farben des Entwurfs.
// Gilt für sim.statusDef(…).farbe (Karte/3D, Pilotenansicht, Tablet, Handy, alte Panels) und die CSS-Variablen --s1 … --s0
// der neuen Fenster (Einsatzliste, Fahrzeuge, Übersichten, Großeinsatz, Abfrage).
import { store } from "../data/store";
import { DEFAULT_STATUS } from "../sim/settings";
import type { StatusKey } from "../sim/settings";
import { onPers, pers } from "./ws/persoenlich";

/** Farben des Entwurfs (hell, Schrift dunkel) – Standard, solange niemand etwas anderes gewählt hat */
export const STATUS_ENTWURF: Record<StatusKey, string> = {
  freiWache: "#CDEFA0",
  freiFunk: "#CDEFA0",
  alarmWache: "#F3EF7A",
  alarmFunk: "#F3EF7A",
  alarmiert: "#DCC23A",
  zumBO: "#F7D98C",
  amBO: "#EBB36B",
  zumZO: "#ECD8ED",
  amZO: "#D7AEE2",
  dienstfahrt: "#DCDDE1",
  bereitschaft: "#FFFFFF",
  abgemeldet: "#E6E7EA",
};

/** CSS-Kürzel der neuen Fenster (--s1, --sa, …) je Status */
const CSS: Record<StatusKey, string> = { freiWache: "1", freiFunk: "6", alarmWache: "a", alarmFunk: "f", alarmiert: "9", zumBO: "2", amBO: "3", zumZO: "4", amZO: "5", dienstfahrt: "7", bereitschaft: "8", abgemeldet: "0" };

const gleich = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Farbe der Leitstelle, nur wenn sie im Statusmodell geändert wurde (die alten Standardfarben zählen als „nicht geändert“) */
function leitstelle(key: string): string | null {
  const s = store.settings?.status?.find((x) => x.key === key);
  const d = DEFAULT_STATUS.find((x) => x.key === key);
  if (!s?.farbe || gleich(s.farbe, d?.farbe)) return null;
  return s.farbe;
}

/** Die Statusfarbe, die überall gilt */
export function statusFarbe(key: string): string {
  return pers().statusFarben?.[key] || leitstelle(key) || STATUS_ENTWURF[key as StatusKey] || "#E6E7EA";
}

/** Statusfarbe nach Statusnummer („1“, „A“, „9“ …) */
export function statusFarbeNr(nummer: string): string {
  const d = (store.settings?.status ?? DEFAULT_STATUS).find((x) => String(x.nummer).toLowerCase() === String(nummer).toLowerCase());
  return d ? statusFarbe(d.key) : "#E6E7EA";
}

/** Farbe ohne eigene Wahl (Leitstelle bzw. Entwurf) – für „Standard“ in den Einstellungen */
export function statusFarbeStandard(key: string): string {
  return leitstelle(key) || STATUS_ENTWURF[key as StatusKey] || "#E6E7EA";
}

/** CSS-Variablen der neuen Fenster neu setzen (eigenes <style> nach den Fenster-Stilen) */
function cssSetzen(): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById("lw-statusfarben") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "lw-statusfarben";
    document.head.appendChild(el);
  }
  const vars = (Object.keys(CSS) as StatusKey[]).map((k) => `--s${CSS[k]}:${statusFarbe(k)}`).join(";");
  // doppelte Klasse = stärker als .ap aus fenster.css, egal in welcher Reihenfolge die Stile geladen werden
  const css = `:root,.ap.ap,.ap{${vars}}`;
  if (el.textContent !== css) el.textContent = css;
}

let an = false;
/** Einmal beim Start: CSS setzen und bei Änderungen (eigene Farben, Statusmodell der Leitstelle) nachziehen */
export function statusFarbenStarten(): void {
  if (an) return;
  an = true;
  cssSetzen();
  onPers(() => cssSetzen());
  store.onChange(() => cssSetzen());
}
