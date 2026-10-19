// Welcher Teil der Adresse wurde im Gespräch wirklich ausgesprochen?
// Der Knopf „📍 Genannte“ darf nur übernehmen, was der Anrufer schon gesagt hat –
// sonst verrät er die Adresse, bevor sie im Gespräch gefallen ist.
import { zahlenIn } from "./verstehen";

function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/str\.(?=\s|$)/g, "strasse")
    .replace(/[^a-z0-9]+/g, "");
}

/** Zahlen im Text (Hausnummern, Postleitzahlen), auch ausgeschrieben („neunundsechzig“) */
function zahlen(text: string): Set<string> {
  const s = new Set<string>(zahlenIn(text).map(String));
  for (const m of text.toLowerCase().matchAll(/\d+\s?[a-z]?\b/g)) {
    const w = m[0].replace(/\s/g, "");
    s.add(w);
    s.add(w.replace(/[a-z]$/, ""));
  }
  return s;
}

/**
 * Liefert die Teile von `adresse` („Straße Nr, PLZ Ort“), die in `texte` vorkommen –
 * oder null, wenn weder Straße noch Ort gefallen sind.
 */
export function gesagteAdresse(adresse: string, texte: string[]): string | null {
  if (!adresse || !texte.length) return null;
  const alles = texte.join(" ");
  const n = norm(alles);
  const z = zahlen(alles);
  const [strTeil, ...rest] = adresse.split(",").map((t) => t.trim());
  const ortTeil = rest.join(", ");
  const nr = (strTeil.match(/\s(\d+\s?[a-zA-Z]?(?:[-/]\d+)?)\s*$/) ?? [])[1] ?? "";
  const strName = nr ? strTeil.slice(0, strTeil.length - nr.length).trim() : strTeil;
  const plz = (ortTeil.match(/\b\d{4}\b/) ?? [])[0] ?? "";
  const ort = ortTeil.replace(/\b\d{4}\b/, "").trim();
  // Straßenname: ganz oder (bei langen Namen) der Kern ohne „gasse/straße/weg“
  const sn = norm(strName);
  const kern = sn.replace(/(strasse|gasse|weg|platz|allee|ring|zeile|siedlung|hof)$/, "");
  const strGesagt = !!sn && (n.includes(sn) || (kern.length >= 5 && n.includes(kern)));
  const ortGesagt = !!ort && norm(ort).length >= 3 && n.includes(norm(ort).slice(0, Math.max(5, Math.min(norm(ort).length, 10))));
  if (!strGesagt && !ortGesagt) return null;
  const nrGesagt = !!nr && z.has(nr.replace(/\s/g, "").toLowerCase().replace(/[-/].*$/, ""));
  const teile: string[] = [];
  if (strGesagt) teile.push(nrGesagt ? `${strName} ${nr}` : strName);
  if (ortGesagt) teile.push(plz && z.has(plz) ? `${plz} ${ort}` : ort);
  return teile.join(", ");
}
