/**
 * Welche Hubschrauber LeitWerk je Simulator eingebunden hat (Info in der Einrichtung und im Wunsch-Formular).
 * Bei neuen Einbindungen hier ergänzen.
 */
export interface Eingebunden {
  sim: "MSFS 2024" | "X-Plane 12";
  modell: string;
  hersteller: string;
  /** voll = im Cockpit eingebaut; alle = gilt für jedes Flugzeug */
  stufe: "voll" | "alle";
  was: string;
  /** Kennung für „bei dir installiert“ (Einrichtung) */
  id?: "h145" | "ec135" | "gtn" | "efb" | "xpplugin";
}

export const EINGEBUNDEN: Eingebunden[] = [
  { sim: "MSFS 2024", modell: "Airbus H145", hersteller: "HPG (Community-Paket hpg-airbus-h145)", stufe: "voll", was: "App „LeitWerk“ im Tablet, CARLS-Funkgerät mit Status-Tasten und Anzeige, Mission „LeitWerk Leitstelle“, Kurs zum Ziel", id: "h145" },
  { sim: "MSFS 2024", modell: "jedes Flugzeug", hersteller: "LeitWerk", stufe: "alle", was: "EFB-App „LeitWerk“ (Einsatz, Patient, Zielort, Navigation), Wetter und Uhrzeit von LeitWerk", id: "efb" },
  { sim: "MSFS 2024", modell: "PMS50 GTN750", hersteller: "PMS50", stufe: "alle", was: "Flugplan zum Ziel liegt bei Alarm und nach der Zielwahl bereit", id: "gtn" },
  { sim: "X-Plane 12", modell: "EC135 V5, EC135 P3 Neu V5, EC135 V5 - Euronav", hersteller: "Rotorsim", stufe: "voll", was: "linkes MFD, App auf dem Klapp-Tablet (AviTab), TETRA-Funkgerät mit Status-Tasten", id: "ec135" },
  { sim: "X-Plane 12", modell: "jedes Flugzeug", hersteller: "LeitWerk", stufe: "alle", was: "Plugin-Tablet als Fenster (auch in VR), X-Plane-Tasten für Status und Sprechtaste, Wetter und Uhrzeit", id: "xpplugin" },
  { sim: "X-Plane 12", modell: "Reality XP GTN 750", hersteller: "Reality XP", stufe: "alle", was: "Flugplan „Leitwerk.gfp“ zum Ziel" },
];

/** Auswahl im Wunsch-Formular: was eingebaut werden soll */
export const WUNSCH_TEILE: [string, string][] = [
  ["tablet", "Tablet bzw. EFB im Cockpit"],
  ["funk", "Funkgerät mit Status-Tasten"],
  ["mfd", "Bildschirm im Cockpit (MFD)"],
  ["flugplan", "Flugplan ins Navi bzw. GPS"],
  ["tasten", "Tasten/Joystick-Befehle"],
];

export const BEZUG: [string, string][] = [
  ["", "– bitte wählen –"],
  ["marketplace", "Marketplace im Simulator"],
  ["shop", "Shop des Herstellers"],
  ["flightsimto", "flightsim.to"],
  ["xplaneorg", "x-plane.org"],
  ["orbx", "Orbx Central / anderer Händler"],
  ["sonst", "Sonstiges"],
];
