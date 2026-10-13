/**
 * Überstellungen zwischen Krankenhäusern (SEK-96): typische, medizinisch stimmige Fälle.
 * Der Grund passt zu den Häusern: das abgebende Haus hat etwas nicht (Herzkatheter, Neurochirurgie …),
 * hat kein Bett frei, oder der Patient kommt zurück ins Heimatkrankenhaus.
 */
import { bereicheVon, type Hospital } from "../data/model";
import { zufallsName, zufallsNummer } from "../abfrage/anrufer";
import { distanceM, type LatLon } from "./geo";
import { khOrt, sekLeer, type KtDaten, type KtLage } from "./kt";

type Art = "zentrum" | "bett" | "rueck" | "hinzurueck";

interface SekFall {
  art: Art;
  gewicht: number;
  gruende: string[];
  /** Station im abgebenden Haus (eine davon muss es geben) */
  von: string[];
  /** Was das Ziel haben muss (alle); der erste Eintrag ist die Station am Ziel */
  ziel: string[];
  sofort: number;
  arzt: number;
  monitoring: number;
  beatmet: number;
  instabil: number;
  inkubator?: boolean;
  alter: [number, number];
  lage: [KtLage, number][];
}

const LIEGEND: [KtLage, number][] = [["liegend", 1]];
const MEIST_LIEGEND: [KtLage, number][] = [["liegend", 6], ["sitzend", 2], ["gehend", 1]];
const MOBIL: [KtLage, number][] = [["gehend", 3], ["sitzend", 3], ["liegend", 1]];

const FAELLE: SekFall[] = [
  // ---- ins Zentrum: das abgebende Haus kann es nicht
  { art: "zentrum", gewicht: 1, gruende: ["STEMI – Akut-PCI", "Hinterwandinfarkt – Akut-Koronarangiografie", "Vorderwandinfarkt – Akut-PCI"], von: ["ZNA", "INT", "KAR"], ziel: ["HKL"], sofort: 1, arzt: 0.75, monitoring: 1, beatmet: 0, instabil: 0.15, alter: [45, 88], lage: LIEGEND },
  { art: "zentrum", gewicht: 1.6, gruende: ["NSTEMI – Koronarangiografie", "Instabile Angina pectoris – Herzkatheter"], von: ["INT", "KAR"], ziel: ["HKL"], sofort: 0.1, arzt: 0, monitoring: 0.8, beatmet: 0, instabil: 0, alter: [55, 90], lage: MEIST_LIEGEND },
  { art: "zentrum", gewicht: 0.7, gruende: ["Akuter Schlaganfall, Verschluss A. cerebri media – Thrombektomie", "Basilaristhrombose – Thrombektomie", "Schlaganfall mit Gefäßverschluss – Thrombektomie"], von: ["ZNA", "NEU", "INT"], ziel: ["THR"], sofort: 1, arzt: 0.8, monitoring: 1, beatmet: 0.1, instabil: 0.1, alter: [50, 90], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.5, gruende: ["Intrakranielle Blutung – neurochirurgische Versorgung", "Akutes Subduralhämatom – OP", "Subarachnoidalblutung – Neurochirurgie"], von: ["ZNA", "ITS", "INT"], ziel: ["NCH", "ITS"], sofort: 1, arzt: 1, monitoring: 1, beatmet: 0.5, instabil: 0.3, alter: [35, 90], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.2, gruende: ["Aortendissektion Typ A – Herzchirurgie", "Rupturiertes Bauchaortenaneurysma – Gefäßchirurgie"], von: ["ZNA", "INT", "ITS"], ziel: ["HCH", "ITS"], sofort: 1, arzt: 1, monitoring: 1, beatmet: 0.3, instabil: 0.4, alter: [50, 85], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.1, gruende: ["Verbrennung 2.–3. Grades, ca. 25 % KOF", "Inhalationstrauma nach Wohnungsbrand"], von: ["ZNA", "UNF", "ITS"], ziel: ["VER"], sofort: 0.7, arzt: 1, monitoring: 1, beatmet: 0.5, instabil: 0.2, alter: [20, 80], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.3, gruende: ["Polytrauma mit Schädel-Hirn-Trauma – Weiterversorgung", "Instabile Beckenfraktur – Traumazentrum", "Schädel-Hirn-Trauma mit Blutung – Neurochirurgie"], von: ["ZNA", "UNF"], ziel: ["NCH", "UNF", "ITS"], sofort: 1, arzt: 1, monitoring: 1, beatmet: 0.4, instabil: 0.3, alter: [18, 85], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.35, gruende: ["Frühgeburt 32. SSW – Neonatologie", "Neugeborenes mit Atemnotsyndrom", "Neugeborenes mit Trinkschwäche und Hypoglykämie"], von: ["GYN"], ziel: ["NEO"], sofort: 0.6, arzt: 1, monitoring: 1, beatmet: 0.2, instabil: 0, inkubator: true, alter: [0, 0], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.25, gruende: ["Status epilepticus (Kind) – Kinderintensiv", "Schwere Bronchiolitis mit Sauerstoffbedarf", "Diabetische Ketoazidose (Kind)"], von: ["KIN", "ZNA"], ziel: ["PIC"], sofort: 0.5, arzt: 1, monitoring: 1, beatmet: 0.15, instabil: 0, inkubator: true, alter: [1, 14], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.3, gruende: ["Kind mit Pneumonie – Kinderabteilung", "Gastroenteritis mit Exsikkose (Kind)", "Unterarmfraktur (Kind) – Kinderabteilung"], von: ["ZNA", "UNF"], ziel: ["KIN"], sofort: 0.1, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, inkubator: true, alter: [2, 12], lage: [["sitzend", 1], ["liegend", 1]] },
  { art: "zentrum", gewicht: 0.9, gruende: ["Akute Psychose – Übernahme Psychiatrie", "Schwere Depression – Psychiatrie", "Demenz mit Verhaltensauffälligkeiten – Gerontopsychiatrie"], von: ["ZNA", "INT"], ziel: ["PSY"], sofort: 0.3, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [20, 90], lage: MOBIL },
  { art: "zentrum", gewicht: 1.3, gruende: ["Z. n. Schenkelhalsfraktur – Remobilisation", "Remobilisation nach Pneumonie", "Gangunsicherheit nach Sturz – Akutgeriatrie"], von: ["ORT", "CHI", "INT"], ziel: ["GER"], sofort: 0, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [70, 96], lage: MEIST_LIEGEND },
  { art: "zentrum", gewicht: 0.4, gruende: ["Urosepsis bei Harnstau – Urologie", "Nierenstein mit Harnstau – Ureterschiene"], von: ["ZNA", "INT"], ziel: ["URO"], sofort: 0.4, arzt: 0, monitoring: 0.5, beatmet: 0, instabil: 0, alter: [35, 90], lage: MEIST_LIEGEND },
  { art: "zentrum", gewicht: 0.35, gruende: ["Obere GI-Blutung – Endoskopie", "Cholangitis – ERCP"], von: ["ZNA", "INT", "CHI"], ziel: ["GAS", "END"], sofort: 0.5, arzt: 0.15, monitoring: 0.7, beatmet: 0, instabil: 0.05, alter: [45, 90], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.3, gruende: ["Akutes Nierenversagen – Nephrologie/Dialyse", "Hyperkaliämie – Akutdialyse"], von: ["ZNA", "INT"], ziel: ["NEP", "DIA"], sofort: 0.4, arzt: 0, monitoring: 0.8, beatmet: 0, instabil: 0, alter: [50, 90], lage: LIEGEND },
  { art: "zentrum", gewicht: 0.3, gruende: ["Neu diagnostizierte Leukämie – Hämatologie", "Lymphom – Übernahme Onkologie"], von: ["INT"], ziel: ["ONK"], sofort: 0, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [30, 85], lage: MEIST_LIEGEND },
  { art: "zentrum", gewicht: 0.2, gruende: ["Peritonsillarabszess – HNO", "Nasenbluten, nicht stillbar – HNO"], von: ["ZNA"], ziel: ["HNO"], sofort: 0.4, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [18, 85], lage: MOBIL },
  { art: "zentrum", gewicht: 0.25, gruende: ["COPD-Exazerbation – Übernahme Pulmologie", "Lungenembolie – Pulmologie"], von: ["ZNA", "INT"], ziel: ["PUL"], sofort: 0.1, arzt: 0, monitoring: 0.5, beatmet: 0, instabil: 0, alter: [50, 90], lage: MEIST_LIEGEND },
  // ---- Bettenmangel: das Haus könnte es, hat aber kein Bett frei
  { art: "bett", gewicht: 0.8, gruende: ["Kein Intensivbett frei – Übernahme Intensivstation", "Sepsis – Intensivbett in einem anderen Haus", "Respiratorische Insuffizienz – kein Beatmungsplatz frei"], von: ["ZNA", "INT", "ITS"], ziel: ["ITS"], sofort: 0.5, arzt: 0.8, monitoring: 1, beatmet: 0.5, instabil: 0.15, alter: [40, 90], lage: LIEGEND },
  { art: "bett", gewicht: 0.6, gruende: ["Bettenmangel Innere Medizin – Übernahme", "Kein Bett frei an der Internen – Übernahme"], von: ["ZNA"], ziel: ["INT"], sofort: 0.2, arzt: 0, monitoring: 0.1, beatmet: 0, instabil: 0, alter: [55, 95], lage: MEIST_LIEGEND },
  // ---- Rückverlegung ins Heimatkrankenhaus
  { art: "rueck", gewicht: 1.8, gruende: ["Rückverlegung nach PCI", "Rückverlegung nach Stentimplantation", "Rückverlegung nach Herzkatheter"], von: ["HKL", "KAR"], ziel: ["INT"], sofort: 0, arzt: 0, monitoring: 0.4, beatmet: 0, instabil: 0, alter: [50, 90], lage: MEIST_LIEGEND },
  { art: "rueck", gewicht: 0.8, gruende: ["Rückverlegung nach neurochirurgischer OP", "Rückverlegung nach Thrombektomie – Stroke Unit"], von: ["NCH", "THR"], ziel: ["NEU"], sofort: 0, arzt: 0.1, monitoring: 0.6, beatmet: 0, instabil: 0, alter: [45, 90], lage: LIEGEND },
  { art: "rueck", gewicht: 0.5, gruende: ["Rückverlegung nach Herzoperation", "Rückverlegung nach Intensivaufenthalt"], von: ["HCH", "ITS"], ziel: ["INT"], sofort: 0, arzt: 0.15, monitoring: 0.6, beatmet: 0.05, instabil: 0, alter: [50, 90], lage: LIEGEND },
  { art: "rueck", gewicht: 1.2, gruende: ["Rückverlegung ins Heimatkrankenhaus", "Weiterbehandlung im Heimatkrankenhaus"], von: ["CHI", "ORT", "INT"], ziel: ["INT"], sofort: 0, arzt: 0, monitoring: 0.1, beatmet: 0, instabil: 0, alter: [40, 95], lage: MEIST_LIEGEND },
  // ---- Untersuchung oder Behandlung in einem anderen Haus, danach zurück
  { art: "hinzurueck", gewicht: 0.5, gruende: ["Szintigrafie (stationärer Patient)", "Nuklearmedizinische Untersuchung"], von: ["INT", "CHI", "ORT"], ziel: ["NUK"], sofort: 0, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [40, 90], lage: MEIST_LIEGEND },
  { art: "hinzurueck", gewicht: 0.5, gruende: ["Dialyse (stationärer Patient)"], von: ["INT", "CHI", "ORT", "GER"], ziel: ["DIA"], sofort: 0, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [50, 90], lage: MEIST_LIEGEND },
  { art: "hinzurueck", gewicht: 0.4, gruende: ["Bestrahlung (stationärer Patient)"], von: ["INT", "ONK", "PAL"], ziel: ["STR"], sofort: 0, arzt: 0, monitoring: 0, beatmet: 0, instabil: 0, alter: [40, 90], lage: MEIST_LIEGEND },
  { art: "hinzurueck", gewicht: 0.3, gruende: ["Koronarangiografie, danach Rücktransport", "Herzkatheter-Untersuchung (stationärer Patient)"], von: ["INT", "KAR"], ziel: ["HKL"], sofort: 0, arzt: 0, monitoring: 0.6, beatmet: 0, instabil: 0, alter: [55, 88], lage: LIEGEND },
];

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function gewichtet<T>(l: [T, number][]): T {
  let r = Math.random() * l.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of l) if ((r -= w) <= 0) return v;
  return l[l.length - 1][0];
}
const hat = (h: Hospital, b: string[]) => {
  const x = bereicheVon(h);
  return b.every((y) => x.includes(y));
};
const station = (h: Hospital, moeglich: string[]) => {
  const x = bereicheVon(h);
  const l = moeglich.filter((y) => x.includes(y));
  return l.length ? pick(l) : null;
};

export interface SekUmfeld {
  /** Mitte des Einsatzgebiets */
  mitte: LatLon;
  /** alle Krankenhäuser, die erreichbar sind (im Straßennetz) */
  khs: Hospital[];
  jetzt: number;
}

/** ungefähre Fahrzeit in Minuten (Luftlinie × 1,3 mit 75 km/h) */
function fahrMin(a: LatLon, b: LatLon): number {
  return ((distanceM(a, b) * 1.3) / 1000 / 75) * 60;
}

/**
 * Eine zufällige Überstellung. Abgebendes oder aufnehmendes Haus liegt im/nahe dem Einsatzgebiet.
 * Gibt einen Auftrag (oder Hin- und Rückfahrt) zurück, null wenn nichts Passendes gefunden wurde.
 */
export function sekZufall(u: SekUmfeld): KtDaten[] | null {
  for (let versuch = 0; versuch < 8; versuch++) {
    const f = gewichtet(FAELLE.map((x) => [x, x.gewicht] as [SekFall, number]));
    const r = sekAus(f, u);
    if (r) return r;
  }
  return null;
}

function sekAus(f: SekFall, u: SekUmfeld): KtDaten[] | null {
  const nahe = (h: Hospital, km: number) => distanceM(h, u.mitte) < km * 1000;
  let von: Hospital | undefined;
  let nach: Hospital | undefined;
  let vonSt: string | null = null;
  let bettZusatz = "";
  if (f.art === "rueck") {
    // Ziel: Haus nahe beim Gebiet; abgebend: ein Zentrum, das das hat (bis 100 km)
    const ziele = u.khs.filter((h) => nahe(h, 35) && hat(h, f.ziel));
    nach = ziele.length ? pick(ziele) : undefined;
    if (!nach) return null;
    const zentren = u.khs.filter((h) => h.id !== nach!.id && distanceM(h, nach!) < 100_000 && station(h, f.von) && distanceM(h, nach!) > 8_000);
    von = zentren.length ? pick(zentren) : undefined;
    if (!von) return null;
    vonSt = station(von, f.von);
    // Herz- und Neuro-Rückverlegungen: Patient liegt dann auf der Station, nicht im Katheterlabor
    if (vonSt === "HKL") vonSt = bereicheVon(von).includes("KAR") ? "KAR" : "INT";
    if (vonSt === "THR") vonSt = "NEU";
  } else {
    // abgebendes Haus nahe beim Gebiet
    const abgebend = u.khs.filter((h) => nahe(h, 45) && station(h, f.von) && (f.art === "bett" || !hat(h, f.ziel)));
    von = abgebend.length ? pick(abgebend) : undefined;
    if (!von) return null;
    vonSt = station(von, f.von);
    const ziele = u.khs
      .filter((h) => h.id !== von!.id && hat(h, f.ziel))
      .sort((a, b) => distanceM(a, von!) - distanceM(b, von!));
    if (!ziele.length) return null;
    // meist das nächste passende Haus, manchmal das übernächste (dort ist ein Bett frei)
    const i = ziele.length > 1 && Math.random() < 0.2 ? 1 : 0;
    nach = ziele[i];
    if (i === 1) bettZusatz = " (im nächstgelegenen Haus kein Bett frei)";
    if (distanceM(von, nach) > 130_000) return null;
  }
  if (!vonSt) return null;
  const zielSt = f.ziel[0] === "END" ? "GAS" : f.ziel[0];

  const geschlecht: "m" | "w" = Math.random() < 0.5 ? "w" : "m";
  const alter = Math.round(rnd(f.alter[0], f.alter[1]));
  const sek = sekLeer();
  sek.beatmet = Math.random() < f.beatmet;
  sek.arzt = sek.beatmet || Math.random() < f.arzt;
  sek.monitoring = sek.arzt || Math.random() < f.monitoring;
  sek.inkubator = !!f.inkubator;
  sek.instabil = sek.arzt && Math.random() < f.instabil;
  const sofort = Math.random() < f.sofort;
  sek.zusage = Math.random() < 0.85 ? `Übernahme zugesagt von ${Math.random() < 0.5 ? "OA" : "OÄ"} Dr. ${zufallsName(Math.random() < 0.5 ? "m" : "w").split(" ").pop()}` : "";
  const lage: KtLage = sek.monitoring || (sek.inkubator && alter < 1) ? "liegend" : gewichtet(f.lage);
  const info = [
    sek.beatmet ? "intubiert und beatmet" : "",
    sek.instabil ? "kreislaufinstabil, Katecholamine" : sek.arzt && !sek.beatmet ? "Monitor, Perfusor" : "",
    !sek.arzt && sek.monitoring ? "Monitorüberwachung nötig" : "",
    sek.inkubator && alter < 1 ? "im Inkubator" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const dauer = fahrMin(von, nach);
  const name = alter < 1 ? `Neugeborenes ${zufallsName(geschlecht).split(" ").pop()}` : zufallsName(geschlecht);
  let abholung: number;
  let termin: number;
  if (sofort) {
    abholung = u.jetzt + rnd(5, 20) * 60_000;
    termin = abholung + (dauer + 10) * 60_000;
  } else {
    // geplant: in 1–6 Stunden (Rückverlegungen gern am Vormittag)
    abholung = u.jetzt + rnd(60, 360) * 60_000;
    termin = abholung + (dauer + 15) * 60_000;
  }
  abholung = Math.round(abholung / 300_000) * 300_000;
  termin = Math.round(termin / 300_000) * 300_000;
  const d: KtDaten = {
    art: "KTx",
    code: null,
    sofort,
    sek,
    patient: { name, alter, geschlecht, info },
    von: khOrt(von, vonSt),
    nach: khOrt(nach, zielSt),
    grund: pick(f.gruende) + bettZusatz,
    lage,
    begleitung: sek.inkubator && alter < 15 && Math.random() < 0.6,
    sauerstoff: sek.monitoring && Math.random() < 0.5,
    infektion: Math.random() < 0.05,
    termin,
    abholung,
    telefon: zufallsNummer(),
  };
  if (f.art !== "hinzurueck") return [d];
  // Rückfahrt nach der Untersuchung/Behandlung
  const zurueckAb = termin + rnd(60, 150) * 60_000;
  const zurueck: KtDaten = {
    ...d,
    patient: { ...d.patient },
    sek: { ...sek },
    von: d.nach,
    nach: d.von,
    grund: `${d.grund} – Rücktransport`,
    abholung: Math.round(zurueckAb / 300_000) * 300_000,
    termin: Math.round((zurueckAb + (dauer + 15) * 60_000) / 300_000) * 300_000,
  };
  return [d, zurueck];
}
