/**
 * Falsche Adresse (Anrufer nennt eine andere Hausnummer) – ohne Häufungen (Ticket 17, Paul 24.11.2026).
 * Nach einer falschen Adresse kommen erst einige Einsätze mit richtiger Adresse („Sperre“).
 * Damit es im Schnitt trotzdem so oft passiert wie eingestellt, ist die Chance danach entsprechend höher:
 * Bei Sperre s und eingestellter Häufigkeit p ist die Chance q = p / (1 − s·p) (dann ist der Anteil auf Dauer genau p).
 */

/** Wie viele Einsätze nach einer falschen Adresse sicher stimmen (bei hohen Einstellungen weniger, damit p erreichbar bleibt) */
export function falscheAdresseSperre(prozent: number): number {
  const p = Math.min(1, Math.max(0, prozent / 100));
  if (p <= 0) return 0;
  return Math.max(0, Math.min(3, Math.floor((1 - p) / p) - 1));
}

/** Chance je Einsatz, nachdem die Sperre vorbei ist */
export function falscheAdresseChance(prozent: number): number {
  const p = Math.min(1, Math.max(0, prozent / 100));
  const s = falscheAdresseSperre(prozent);
  return Math.min(1, p / (1 - s * p));
}

/**
 * Soll dieser Einsatz eine falsche Adresse bekommen?
 * seit = Einsätze seit der letzten falschen Adresse (Infinity = noch keine).
 */
export function falscheAdresseZiehen(prozent: number, seit: number, rnd: () => number = Math.random): boolean {
  if (prozent <= 0) return false;
  if (seit < falscheAdresseSperre(prozent)) return false;
  return rnd() < falscheAdresseChance(prozent);
}
