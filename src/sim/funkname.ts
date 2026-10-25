/**
 * Rufnamen am Funk (wie sich ein Fahrzeug meldet bzw. wie man es ruft):
 * - normal der Funkrufname („75/001“)
 * - Dienststelle/Ortsstelle mit nur einem Fahrzeug: Fahrzeugart + Ort („RTW Spitz“, „KTW Gföhl“)
 * - Hubschrauber: „C2“, „C33“; Ersatz-NEF des Hubschraubers: „NEF ÖAMTC 2“
 * - NEF: „NEF Tulln“; Einsatzleiter: „BEL Krems“, „ÖBB Einsatzleiter Krems“; ACN: „ACN St. Pölten“
 * Gilt für jedes Fahrzeug, das in den Stammdaten angelegt wird.
 */

export interface FunkFz {
  id: string;
  funkrufname: string;
  kurzname?: string;
  stationName: string;
  rmTyp: string;
  kategorie: string;
  ersatzFuer?: string | null;
}

/** Ort aus dem Namen der Dienststelle („Rotes Kreuz Ortsstelle Gföhl“ → „Gföhl“) */
export function ortAusDienststelle(name: string): string {
  const m = name.match(/(?:Bezirksstelle|Ortsstelle|Dienststelle|Notarztstützpunkt|Stützpunkt|Leitstelle|Krankentransport|Samariterbund|Samariter-Bund|Rettungswache|Wache)\s+(.+)$/i);
  if (m) return m[1].trim();
  const w = name.trim().split(/\s+/);
  return w.slice(-1)[0] ?? name;
}

/** Hubschraubernummer aus „Christophorus 10“ bzw. „99/010“ */
function cNummer(fz: FunkFz | undefined): string | null {
  if (!fz) return null;
  const m = (fz.kurzname ?? "").match(/Christophorus\s*(\d+)/i) ?? fz.stationName.match(/Christophorus\s*(\d+)/i);
  if (m) return m[1];
  const n = fz.funkrufname.match(/^99\/0*(\d+)$/);
  return n ? n[1] : null;
}

const ART: Record<string, string> = { SKTW: "KTW", "KTW-B": "KTW", SRTW: "RTW", "RTW-C": "RTW", SNAW: "NAW" };

/** Rufname eines Fahrzeugs; alle = alle Fahrzeuge (um „nur ein Fahrzeug an der Dienststelle“ zu erkennen) */
export function rufname(fz: FunkFz, alle: FunkFz[]): string {
  const ort = ortAusDienststelle(fz.stationName);
  const typ = fz.rmTyp.toUpperCase();
  if (typ === "NAH" || typ === "ITH" || /hubschrauber/i.test(fz.kategorie)) {
    const c = cNummer(fz);
    return c ? `C${c}` : fz.funkrufname;
  }
  if (fz.ersatzFuer) {
    const nah = alle.find((x) => x.funkrufname === fz.ersatzFuer || x.kurzname === fz.ersatzFuer);
    const c = cNummer(nah) ?? (fz.ersatzFuer.match(/(\d+)$/)?.[1]?.replace(/^0+/, "") ?? null);
    return c ? `NEF ÖAMTC ${c}` : fz.funkrufname;
  }
  if (typ === "BEL") return fz.kurzname?.trim() || `BEL ${ort}`;
  if (/^EL ÖBB/i.test(fz.rmTyp) || /^EL ÖBB/i.test(fz.funkrufname)) return `ÖBB Einsatzleiter ${ortAusDienststelle(fz.stationName)}`.trim();
  if (typ === "ACN") {
    // zwei ACN am selben Ort (Stockerau): Funkrufname, damit es eindeutig bleibt
    const gleich = alle.filter((x) => x.rmTyp.toUpperCase() === "ACN" && ortAusDienststelle(x.stationName) === ort);
    return gleich.length <= 1 ? `ACN ${ort}` : fz.funkrufname.replace(/\s*ACN$/i, "");
  }
  if (fz.kategorie === "NEF" || typ === "NEF") {
    // mehrere NEF an einem Ort: Funkrufname, damit es eindeutig bleibt
    const gleich = alle.filter((x) => (x.kategorie === "NEF" || x.rmTyp === "NEF") && !x.ersatzFuer && ortAusDienststelle(x.stationName) === ort);
    return gleich.length <= 1 ? `NEF ${ort}` : fz.funkrufname;
  }
  // eigener Rufname in den Stammdaten („RTW Flughafen“, „NAW Flughafen“)
  if (fz.kurzname && /^(RTW|NAW|KTW|NEF)\s+\S/i.test(fz.kurzname.trim())) return fz.kurzname.trim();
  const amOrt = alle.filter((x) => x.stationName === fz.stationName);
  if (amOrt.length === 1) return `${ART[typ] ?? fz.kategorie ?? typ} ${ort}`;
  return fz.funkrufname;
}

/** Rufnamen aller Fahrzeuge (id → Rufname) */
export function rufnamen(alle: FunkFz[]): Map<string, string> {
  return new Map(alle.map((f) => [f.id, rufname(f, alle)]));
}

/** Fahrzeug zu einem gesprochenen/getippten Namen (Rufname oder Funkrufname, „C 2“ = „C2“) */
export function fahrzeugZuName<T extends FunkFz>(text: string, alle: T[]): T | undefined {
  const norm = (t: string) => t.toLowerCase().replace(/christophorus\s*/g, "c").replace(/[\s.\-]/g, "");
  const t = norm(text);
  const namen = rufnamen(alle);
  const kand = alle
    .flatMap((f) => [
      { f, n: norm(f.funkrufname) },
      { f, n: norm(namen.get(f.id) ?? "") },
    ])
    .filter((x) => x.n.length >= 2)
    .sort((a, b) => b.n.length - a.n.length);
  return (kand.find((x) => t === x.n) ?? kand.find((x) => t.includes(x.n)))?.f;
}
