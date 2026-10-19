// „Wie schreibt sich das?“ – Namen buchstabieren (Notruf und KT-Hotline).
// Fest vom Programm: das kleine Modell sagt sonst nur „Der Nachname ist Weber.“

/** Fragt die Leitstelle nach der Schreibweise? */
export function fragtSchreibweise(text: string): boolean {
  return /buchstabier|wie (schreibt|schreiben) (man|sich|sie|er)\b|wie (wird|ist) (das|der|die|den|ihr|sein)?\s*\w* ?geschrieben|schreibweise|wie schreibt (sich|man) (das|der|die|den|ihr|sein)/i.test(text);
}

/** Welcher Teil eines Namens ist gemeint? („Nachname“, „Vorname“, sonst der Nachname) */
export function namensTeil(text: string, name: string): string {
  const teile = name.trim().split(/\s+/);
  if (teile.length < 2) return name.trim();
  if (/vorname/i.test(text)) return teile[0];
  if (/(ganzen|vollen|komplett)/i.test(text)) return name.trim();
  return teile.slice(1).join(" ");
}

const BUCHSTABE: Record<string, string> = { ä: "A-Umlaut", ö: "O-Umlaut", ü: "U-Umlaut", ß: "scharfes S" };

/** „Weber“ → „Weber – W, E, B, E, R.“ */
export function buchstabiert(wort: string): string {
  const zeichen = [...wort].map((c) => (c === " " ? "–" : c === "-" ? "Bindestrich" : BUCHSTABE[c.toLowerCase()] ?? c.toUpperCase()));
  return `${wort} – ${zeichen.join(", ").replace(/, –, /g, " – ")}.`;
}
