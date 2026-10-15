/**
 * Klick-Schutz: Während eine Taste/ein Knopf gedrückt ist, wird die Oberfläche nicht neu gezeichnet.
 * Sonst kann zwischen Drücken und Loslassen der Knopf ausgetauscht werden – der Klick geht verloren
 * („man muss zweimal drücken“). Gezeichnet wird direkt nach dem Klick.
 */
let gedruecktSeit = 0;
const warte = new Set<() => void>();

function abarbeiten(): void {
  const l = [...warte];
  warte.clear();
  for (const f of l) {
    try {
      f();
    } catch (e) {
      console.error(e);
    }
  }
}

if (typeof document !== "undefined") {
  const ZIELE = "button, .opt, a, [role=button], [role=tab], .tel-row, .kapitel-opt, label, input[type=checkbox], input[type=radio], select, .klickbar";
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target as Element | null;
      if (t?.closest?.(ZIELE)) gedruecktSeit = Date.now();
    },
    true,
  );
  const los = () => {
    if (!gedruecktSeit) return;
    gedruecktSeit = 0;
    // erst nach dem Klick-Ereignis (kommt direkt nach dem Loslassen)
    setTimeout(abarbeiten, 0);
  };
  document.addEventListener("pointerup", los, true);
  document.addEventListener("pointercancel", los, true);
  window.addEventListener("blur", los);
}

/** Wird gerade ein Knopf gedrückt gehalten? (nach 1,5 s nicht mehr – zur Sicherheit) */
export function klickLaeuft(): boolean {
  if (gedruecktSeit && Date.now() - gedruecktSeit > 1500) {
    gedruecktSeit = 0;
    setTimeout(abarbeiten, 0);
  }
  return gedruecktSeit > 0;
}

/** fn sofort ausführen – oder, wenn gerade ein Knopf gedrückt ist, direkt nach dem Klick (gleiche fn nur einmal) */
export function nachKlick(fn: () => void): void {
  if (klickLaeuft()) warte.add(fn);
  else fn();
}
