/**
 * Töne des Funkgeräts (wie TETRA): vor jedem Funkspruch ein kurzer Dreifach-Piep (tief, ca. 900 Hz),
 * danach ein hoher kurzer Piep (ca. 1800 Hz). Nachgebaut nach Aufnahmen eines echten Geräts.
 */

/** Beginn-Ton: drei kurze Pieps (an/aus in Sekunden) */
const BEGINN: [number, number][] = [
  [0.035, 0.012],
  [0.03, 0.012],
  [0.062, 0],
];
const BEGINN_HZ = 900;
const ENDE_HZ = 1800;
const ENDE_LANG = 0.09;

/** Länge der Töne (s) – so lange vor bzw. nach der Stimme */
export const TON_BEGINN_S = BEGINN.reduce((a, [an, aus]) => a + an + aus, 0) + 0.06;
export const TON_ENDE_S = ENDE_LANG + 0.04;

function piep(c: BaseAudioContext, ziel: AudioNode, hz: number, ab: number, lang: number, laut: number): void {
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  const g = c.createGain();
  const g2 = c.createGain();
  o.frequency.value = hz;
  o2.frequency.value = hz * 2;
  g2.gain.value = 0.18;
  // weiche Flanken (3 ms), sonst knackt es
  g.gain.setValueAtTime(0, ab);
  g.gain.linearRampToValueAtTime(laut, ab + 0.003);
  g.gain.setValueAtTime(laut, ab + lang - 0.003);
  g.gain.linearRampToValueAtTime(0, ab + lang);
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(ziel);
  o.start(ab);
  o2.start(ab);
  o.stop(ab + lang + 0.01);
  o2.stop(ab + lang + 0.01);
}

/** Beginn-Ton ab Zeitpunkt ab (AudioContext-Zeit); gibt das Ende zurück */
export function tonBeginn(c: BaseAudioContext, ziel: AudioNode, ab = c.currentTime, laut = 0.14): number {
  let t = Math.max(ab, c.currentTime);
  for (const [an, aus] of BEGINN) {
    piep(c, ziel, BEGINN_HZ, t, an, laut);
    t += an + aus;
  }
  return t + 0.06;
}

/** Ende-Ton ab Zeitpunkt ab; gibt das Ende zurück */
export function tonEnde(c: BaseAudioContext, ziel: AudioNode, ab = c.currentTime, laut = 0.14): number {
  const t = Math.max(ab, c.currentTime) + 0.02;
  piep(c, ziel, ENDE_HZ, t, ENDE_LANG, laut);
  return t + TON_ENDE_S;
}

/** Statustaste gedrückt: ein kurzer Piep (halten, bis der Status durchgeht) */
export function tonStatusDruck(c: BaseAudioContext, ziel: AudioNode, ab = c.currentTime, laut = 0.14): number {
  const t = Math.max(ab, c.currentTime) + 0.01;
  piep(c, ziel, 1200, t, 0.07, laut);
  return t + 0.1;
}

/** Status gesendet: schnelles „düt-düt-düt-düt“ */
export function tonStatusGesendet(c: BaseAudioContext, ziel: AudioNode, ab = c.currentTime, laut = 0.14): number {
  let t = Math.max(ab, c.currentTime) + 0.01;
  for (let i = 0; i < 4; i++) {
    piep(c, ziel, 1600, t, 0.055, laut);
    t += 0.055 + 0.045;
  }
  return t + 0.05;
}
