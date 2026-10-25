/** Läuft dieses Fenster gerade als Piloten-Interface? (Dann keine Leitstellen-Töne, kein Vorlesen des Funks.) */
let an = false;
const hoerer = new Set<(an: boolean) => void>();

export function istPilot(): boolean {
  return an;
}

export function pilotModusSetzen(wert: boolean): void {
  if (an === wert) return;
  an = wert;
  document.documentElement.classList.toggle("pilotmodus", wert);
  for (const f of hoerer) f(wert);
}

export function onPilotModus(f: (an: boolean) => void): () => void {
  hoerer.add(f);
  return () => hoerer.delete(f);
}
