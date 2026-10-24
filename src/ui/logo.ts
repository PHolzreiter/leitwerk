/**
 * LeitWerk-Logo: vier schräge, nach rechts ansteigende Balken (wie ein Signal) in Blau.
 * Als SVG-Text, damit es überall scharf ist (Startseite, Kopfzeile, Programmsymbol).
 */
let n = 0;

/** Bildmarke (die Balken), Seitenverhältnis 1:1 */
export function logoMarke(groesse = 64): string {
  const id = `lwlg${n++}`;
  // Balken: x, Unterkante, Höhe – oben schräg abgeschnitten (Parallelogramm)
  const balken = [
    [6, 58, 18],
    [20, 58, 30],
    [34, 58, 42],
    [48, 58, 54],
  ]
    .map(([x, u, h], i) => {
      const b = 10;
      const schraeg = 6;
      return `<path d="M${x} ${u} L${x + b} ${u} L${x + b} ${u - h} L${x} ${u - h + schraeg} Z" fill="url(#${id})" opacity="${0.55 + i * 0.15}"/>`;
    })
    .join("");
  return `<svg class="lw-logo-marke" viewBox="0 0 64 64" width="${groesse}" height="${groesse}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="0.6" y2="0"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#60c6ff"/></linearGradient></defs>
    ${balken}
  </svg>`;
}

/** Schriftzug „LeitWerk“ (Leit in Textfarbe, Werk in Blau) */
export function logoSchrift(): string {
  return `<span class="lw-logo-schrift"><span class="leit">Leit</span><span class="werk">Werk</span></span>`;
}
