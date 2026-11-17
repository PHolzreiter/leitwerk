// Code-Marke je Versorgungsstufe (Entwurf Beta 64, Paul 17.11.2026). Gleich in Pilotenfenster, Handy und EFB
// (handy.html / efb.html haben eine Kopie in ES5 – bei Änderungen dort mitziehen).
// Farbe = Farbe im Namen der Stufe; das Muster unterscheidet die Art: ALS voll gefüllt, BLS Streifenrahmen,
// „aufwertbar“ Streifenrahmen mit voller Füllung, Sonderstufen eigene Muster. Alle Marken gleich hoch und breit gepolstert.
/* eslint-disable */
const C = { rot: "#d32f2f", orange: "#f57c00", gelb: "#fbc02d", "grün": "#2e9d4a" };
const HELL = { rot: "#f2a7a7", orange: "#ffcc99", gelb: "#fde68a", "grün": "#a9dcb6" };
const TXT = { rot: "#ffffff", orange: "#15181c", gelb: "#15181c", "grün": "#ffffff" };
const WEISS = "background:#ffffff;color:#15181c;padding:1px 7px;";

/** { a: Stil der Marke, i: Stil des Code-Felds } – beide als style-Text */
export function marke(stufe) {
  const s = String(stufe || "");
  const f = Object.keys(C).find((k) => s.indexOf(k) >= 0);
  if (/^ALS/.test(s) && f) return { a: "background:" + C[f] + ";padding:4px 10px;", i: "color:" + TXT[f] + ";" };
  if (/^BLS\/ALS/.test(s)) return { a: "background:repeating-linear-gradient(135deg,#7d64cc 0 5px,#d9d0f7 5px 9px);padding:3px;", i: "background:#7d64cc;color:#ffffff;padding:1px 7px;" };
  if (/^BLS/.test(s) && f) return { a: "background:repeating-linear-gradient(135deg," + C[f] + " 0 5px," + HELL[f] + " 5px 9px);padding:3px;", i: WEISS };
  if (/^Sekundär.*sofort/.test(s)) return { a: "border:2px solid #b4232a;background:repeating-linear-gradient(90deg,#fde3e3 0 6px,#ffffff 6px 12px);padding:2px 8px;", i: "color:#8f1b21;" };
  if (/^Sekundär/.test(s)) return { a: "border:2px solid #2f6fb5;background:#e8f0fa;padding:2px 8px;", i: "color:#1f4f8a;" };
  if (/^Akut/.test(s)) return { a: "background:radial-gradient(#3a9c8f 1.7px,#cdebe7 2px) 0 0/6px 6px;padding:3px;", i: WEISS };
  if (/^Telemed/.test(s)) return { a: "border:2px dashed #2563eb;background:#eef3fe;padding:2px 8px;", i: "color:#1d4ed8;" };
  if (/^Weitergabe/.test(s)) return { a: "border:2px dotted #6b7280;background:#f3f5f8;padding:2px 8px;", i: "color:#374151;" };
  if (/^Gro(ß|ss)/.test(s)) return { a: "background:repeating-linear-gradient(45deg,#475569 0 6px,#fbc02d 6px 12px);padding:3px;", i: WEISS };
  if (/^Alpin/.test(s)) return { a: "background:linear-gradient(135deg,#8d6e63 0 60%,#5d4037 60%);padding:4px 10px;", i: "color:#ffffff;" };
  return { a: "background:#6b7280;padding:4px 10px;", i: "color:#ffffff;" };
}
