/**
 * Mehr Abwechslung am Funk (Paul 12.11.2026): feste Sätze der Besatzungen nicht immer gleich. Jede Besatzung hat eine
 * Art zu sprechen (knapp, genau, gesprächiger …), und gängige Wendungen haben mehrere Fassungen – der Inhalt bleibt
 * gleich (Rufnamen, Zahlen, Orte, Storno, Nachforderung werden nie verändert).
 */

/** Art der Besatzung (für die KI und die festen Sätze), fest je Fahrzeug */
export const BESATZUNGS_ART = [
  { id: "knapp", text: "wortkarg und sehr knapp, nur das Nötigste" },
  { id: "genau", text: "ruhig und genau, vollständige kurze Sätze" },
  { id: "locker", text: "routiniert und locker, aber sachlich" },
  { id: "foermlich", text: "eher förmlich und korrekt" },
] as const;

export function besatzungsArt(fzId: string): (typeof BESATZUNGS_ART)[number] {
  let h = 0;
  for (const c of fzId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BESATZUNGS_ART[h % BESATZUNGS_ART.length];
}

/** [Muster, Fassungen] – nur Wendungen, deren Sinn sich nicht ändert */
const WENDUNGEN: [RegExp, string[]][] = [
  [/\bbitte wiederholen\b/, ["bitte wiederholen", "nicht verstanden, bitte nochmal", "war schlecht zu verstehen, bitte wiederholen", "Spruch bitte wiederholen"]],
  [/^verstanden$/, ["verstanden", "so verstanden", "alles klar, verstanden", "verstanden, danke"]],
  [/\bStorno verstanden, rücken ein\b/, ["Storno verstanden, rücken ein", "Storno verstanden, fahren zurück zur Dienststelle", "verstanden, Storno, rücken ein"]],
  [/\bsind frei\b/, ["sind frei", "sind wieder frei", "sind wieder einsatzbereit"]],
  [/\bPatient übernommen\b/, ["Patient übernommen", "haben den Patienten übernommen", "Patient ist bei uns im Fahrzeug"]],
  [/\bPatient versorgt und transportbereit\b/, ["Patient versorgt und transportbereit", "Patient ist versorgt und fertig für den Transport", "sind mit der Versorgung fertig, transportbereit"]],
  [/\bverstanden, wir warten\b/, ["verstanden, wir warten", "verstanden, warten vor Ort", "alles klar, wir warten"]],
  [/\bInformation verstanden\b/, ["Information verstanden", "Info verstanden", "verstanden, danke für die Info"]],
  [/\bZielkrankenhaus verstanden\b/, ["Zielkrankenhaus verstanden", "Ziel verstanden", "verstanden, fahren dorthin"]],
];

/**
 * Feste Wendungen abwandeln. text = Inhalt ohne „Hier …“/„kommen“ oder ganzer Spruch; zufall = 0…1 (eine Zahl je Spruch).
 * Die knappe Besatzung bleibt bei der ersten (kürzesten) Fassung öfter.
 */
export function abwandeln(text: string, fzId: string, zufall: number): string {
  const art = besatzungsArt(fzId).id;
  let out = text;
  let i = 0;
  for (const [muster, fassungen] of WENDUNGEN) {
    i++;
    const teile = out.split(/(,\s*)/);
    let geaendert = false;
    for (let k = 0; k < teile.length; k++) {
      const t = teile[k].trim();
      if (!t || !muster.test(t)) continue;
      const z = (zufall * 7.31 + i * 0.137) % 1;
      if (art === "knapp" && z < 0.6) continue;
      const neu = fassungen[Math.floor(z * fassungen.length) % fassungen.length];
      teile[k] = teile[k].replace(t, t.replace(muster, neu));
      geaendert = true;
    }
    if (geaendert) out = teile.join("");
  }
  return out;
}
