/**
 * Besetzung der Rettungsmittel.
 *
 * Qualifikationen (aufsteigend): RS → NFS → NFS-NKA → NFS-NKV → NFS-NKI, dazu Notarzt (NA)
 * und Pilot. Die Besetzung wird beim Dienstbeginn zufällig nach den Regeln je Fahrzeugtyp
 * erzeugt und kann vom Disponenten geändert werden.
 */
import type { Vehicle } from "../data/model";

export const QUALIS = ["RS", "NFS", "NFS-NKA", "NFS-NKV", "NFS-NKI"] as const;
export type Quali = (typeof QUALIS)[number] | "NA" | "Pilot";
export const ALLE_QUALIS: Quali[] = [...QUALIS, "NA", "Pilot"];

/** Rettungsmitteltyp für Vorschlag und Besetzung */
export type RmTyp = "RTW-C" | "RTW" | "KTW" | "NEF" | "NAH" | "SKTW" | "SRTW" | "SNAW" | "BIT" | "ITH" | "BEL" | "EL ÖBB" | "Sonstige";

export interface Platz {
  rolle: string;
  quali: Quali;
}

export function rmTypVon(v: Pick<Vehicle, "kategorie" | "typ"> & { aufbau?: Vehicle["aufbau"] }): RmTyp {
  const t = (v.typ ?? "").toUpperCase().replace(/\s+/g, "");
  // RTW-C nur im großen Aufbau – ein kleiner RTW (VW T6) ist nie ein RTW-C, egal wer drauf sitzt
  if (v.kategorie === "RTW") return (t.includes("RTW-C") || t === "RTWC") && v.aufbau !== "klein" ? "RTW-C" : "RTW";
  if (["KTW", "NEF", "NAH", "SKTW", "SRTW", "SNAW", "BIT", "ITH", "BEL", "EL ÖBB"].includes(v.kategorie)) return v.kategorie as RmTyp;
  return "Sonstige";
}

/** Rang einer Qualifikation (RS = 0 … NFS-NKI = 4, sonst -1) */
export function rang(q: Quali): number {
  return (QUALIS as readonly string[]).indexOf(q);
}

/** Mindestens ein Notfallsanitäter (NFS oder höher) an Bord */
export function hatNFS(b: Platz[]): boolean {
  return b.some((p) => rang(p.quali) >= 1);
}

export function hatNotarzt(b: Platz[]): boolean {
  return b.some((p) => p.quali === "NA");
}

/** Höchste Sanitäterqualifikation, z. B. „NFS-NKV“ */
export function hoechsteQuali(b: Platz[]): Quali | null {
  let best: Quali | null = null;
  for (const p of b) if (rang(p.quali) >= 0 && (best === null || rang(p.quali) > rang(best))) best = p.quali;
  return best;
}

/** Kurztext für Listen: „NFS-NKI · RS · RS“ bzw. „NA · NFS“ */
export function besetzungKurz(b: Platz[]): string {
  return b.map((p) => p.quali).join(" · ");
}

interface PlatzRegel {
  rolle: string;
  /** erlaubte Qualifikationen mit Gewicht */
  gewichte: Partial<Record<Quali, number>>;
  /** Wahrscheinlichkeit, dass der Platz besetzt ist */
  anteil?: number;
  /** muss niedriger qualifiziert sein als dieser Platz (Index) */
  unter?: number;
}

/**
 * Regeln je Typ (Vorgabe Paul):
 * NEF: Fahrer NFS…NFS-NKI, Notarzt, Azubi RS (50 %)
 * RTW-C: Fahrer RS…NFS-NKV, SR1 NFS-NKI, SR2 RS…NFS-NKV (50 %, immer unter SR1)
 * RTW: Fahrer RS, SR1 RS…NFS, SR2 RS (50 %)
 * KTW: Fahrer RS, SK1 RS
 */
export const REGELN: Record<RmTyp, PlatzRegel[]> = {
  NEF: [
    { rolle: "Fahrer", gewichte: { NFS: 30, "NFS-NKA": 20, "NFS-NKV": 30, "NFS-NKI": 20 } },
    { rolle: "Notarzt", gewichte: { NA: 1 } },
    { rolle: "Azubi", gewichte: { RS: 1 }, anteil: 0.5 },
  ],
  "RTW-C": [
    { rolle: "Fahrer", gewichte: { RS: 50, NFS: 25, "NFS-NKA": 12, "NFS-NKV": 13 } },
    { rolle: "SR1", gewichte: { "NFS-NKI": 1 } },
    { rolle: "SR2", gewichte: { RS: 55, NFS: 25, "NFS-NKA": 10, "NFS-NKV": 10 }, anteil: 0.5, unter: 1 },
  ],
  RTW: [
    { rolle: "Fahrer", gewichte: { RS: 1 } },
    { rolle: "SR1", gewichte: { RS: 45, NFS: 55 } },
    { rolle: "SR2", gewichte: { RS: 1 }, anteil: 0.5 },
  ],
  KTW: [
    { rolle: "Fahrer", gewichte: { RS: 1 } },
    { rolle: "SK1", gewichte: { RS: 1 } },
  ],
  NAH: [
    { rolle: "Pilot", gewichte: { Pilot: 1 } },
    { rolle: "Notarzt", gewichte: { NA: 1 } },
    { rolle: "Flugretter", gewichte: { "NFS-NKV": 40, "NFS-NKI": 60 } },
  ],
  // Sekundärfahrzeuge (Vorgabe Paul): SKTW 2× RS, SRTW RS + NFS bis NKV, SNAW RS + NA + NKV/NKI
  SKTW: [
    { rolle: "Fahrer", gewichte: { RS: 1 } },
    { rolle: "SK1", gewichte: { RS: 1 } },
  ],
  SRTW: [
    { rolle: "Fahrer", gewichte: { RS: 1 } },
    { rolle: "SR1", gewichte: { NFS: 35, "NFS-NKA": 30, "NFS-NKV": 35 } },
  ],
  SNAW: [
    { rolle: "Fahrer", gewichte: { RS: 1 } },
    { rolle: "Notarzt", gewichte: { NA: 1 } },
    { rolle: "SR1", gewichte: { "NFS-NKV": 50, "NFS-NKI": 50 } },
  ],
  // Betten-Intensivtransporter (adipöse Patienten; Verlegung oder Nachforderung)
  BIT: [
    { rolle: "Fahrer", gewichte: { RS: 60, NFS: 40 } },
    { rolle: "SR1", gewichte: { "NFS-NKV": 50, "NFS-NKI": 50 } },
    { rolle: "SR2", gewichte: { RS: 60, NFS: 40 } },
  ],
  // Intensivtransporthubschrauber: besetzt wie ein NAH
  ITH: [
    { rolle: "Pilot", gewichte: { Pilot: 1 } },
    { rolle: "Notarzt", gewichte: { NA: 1 } },
    { rolle: "Flugretter", gewichte: { "NFS-NKV": 40, "NFS-NKI": 60 } },
  ],
  // Einsatzleiter der ÖBB (kein Rettungsdienstpersonal)
  "EL ÖBB": [],
  // Bezirkseinsatzleiter: versorgt keine Patienten, koordiniert vor Ort
  BEL: [{ rolle: "Einsatzleiter", gewichte: { NFS: 20, "NFS-NKA": 25, "NFS-NKV": 30, "NFS-NKI": 25 } }],
  Sonstige: [],
};

function ziehe(gewichte: Partial<Record<Quali, number>>, zufall: () => number): Quali {
  const eintraege = Object.entries(gewichte) as [Quali, number][];
  const summe = eintraege.reduce((s, [, g]) => s + g, 0);
  let r = zufall() * summe;
  for (const [q, g] of eintraege) {
    r -= g;
    if (r <= 0) return q;
  }
  return eintraege[eintraege.length - 1][0];
}

export function generiereBesetzung(typ: RmTyp, zufall: () => number = Math.random): Platz[] {
  const out: (Platz | null)[] = [];
  for (const regel of REGELN[typ]) {
    if (regel.anteil !== undefined && zufall() >= regel.anteil) {
      out.push(null);
      continue;
    }
    let gew = regel.gewichte;
    const ref = regel.unter !== undefined ? out[regel.unter] : null;
    if (ref) {
      const max = rang(ref.quali);
      gew = Object.fromEntries(Object.entries(gew).filter(([q]) => rang(q as Quali) < max));
      if (Object.keys(gew).length === 0) gew = { RS: 1 };
    }
    out.push({ rolle: regel.rolle, quali: ziehe(gew, zufall) });
  }
  return out.filter((p): p is Platz => p !== null);
}

/** Prüft eine (manuell geänderte) Besetzung gegen die Regeln. Gibt Hinweise zurück. */
export function pruefeBesetzung(typ: RmTyp, b: Platz[]): string[] {
  const hinweise: string[] = [];
  const regeln = REGELN[typ];
  for (const regel of regeln) {
    const p = b.find((x) => x.rolle === regel.rolle);
    if (!p) {
      if (regel.anteil === undefined) hinweise.push(`${regel.rolle} fehlt`);
      continue;
    }
    if (!(p.quali in regel.gewichte)) hinweise.push(`${regel.rolle}: ${p.quali} nicht vorgesehen`);
    if (regel.unter !== undefined) {
      const ref = b.find((x) => x.rolle === regeln[regel.unter!].rolle);
      if (ref && rang(p.quali) >= rang(ref.quali)) hinweise.push(`${regel.rolle} muss niedriger qualifiziert sein als ${ref.rolle}`);
    }
  }
  return hinweise;
}
