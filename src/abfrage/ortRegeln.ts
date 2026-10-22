/**
 * Grundregeln je Einsatzort: Was am Ort wahrscheinlich ist, wenn die Geschichte es nicht festlegt.
 * Straße im Ort: eher Fußgänger, Radfahrer, langsam. Außerorts und Autobahn: hohe Geschwindigkeit.
 */
import type { Antworten } from "./schema";
import type { OrtArt } from "./szenario";

export function ortRegeln(ortArt: OrtArt | undefined, thema: string, a: Antworten, fest: Set<string>, rnd: () => number = Math.random): void {
  if (!ortArt) return;
  const setze = (id: string, w: string) => {
    if (!fest.has(id)) a[id] = w;
  };
  if (thema === "verkehrsunfall") {
    if (ortArt === "landstrasse" || ortArt === "autobahn") {
      setze("hohe_geschw", rnd() < 0.85 ? "ja" : "unbekannt");
      // auf der Autobahn gibt es keine Fußgänger und Radfahrer
      if (ortArt === "autobahn" && (a.mechanismus === "fussgaenger" || a.mechanismus === "fahrrad")) setze("mechanismus", "nein");
    } else if (ortArt === "strasse") {
      setze("hohe_geschw", rnd() < 0.85 ? "nein" : "ja");
      const r = rnd();
      if (!fest.has("mechanismus") && (a.mechanismus === undefined || a.mechanismus === "nein" || a.mechanismus === "geschleudert" || a.mechanismus === "ueberschlag"))
        setze("mechanismus", r < 0.3 ? "fahrrad" : r < 0.55 ? "fussgaenger" : r < 0.65 ? "motorrad" : "nein");
    } else if (ortArt === "feldweg") {
      setze("hohe_geschw", "nein");
    }
  }
}
