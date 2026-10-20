/**
 * KI-Vorschläge für Fragen eines Codesystems, die die Automatik nicht (sicher) zuordnen konnte.
 * Die KI wählt aus wenigen passenden Merkmalen und ordnet die Antworten zu; das Programm prüft,
 * ob es Merkmal und Werte gibt. Ergebnis wird als ausdrückliche Zuordnung („merkmal_quelle“: "ki") gespeichert.
 */
import { KEIN_MERKMAL, merkmalKandidaten, merkmalListe } from "./normalisieren";
import type { Frage, Schema } from "./schema";
import { kiJson, type KiNachricht } from "./ki";

export interface KiVorschlag {
  merkmal: string;
  werte: Record<string, string>;
}

function json(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Vorschlag für eine Frage (null = KI konnte nichts Brauchbares liefern) */
export async function kiVorschlag(f: Frage, kapitelTitel: string, kat: Schema): Promise<KiVorschlag | null> {
  const liste = merkmalListe(kat);
  const kand = merkmalKandidaten(f, kat, 10).map((id) => liste.find((m) => m.id === id)!).filter(Boolean);
  const merkmale = kand
    .map((m) => `- ${m.id}: „${m.text}“${m.werte.length ? ` Werte: ${m.werte.map((w) => `${w.wert} = „${w.label}“`).join(", ")}` : " (Zahl)"}`)
    .join("\n");
  const antworten = (f.optionen ?? []).map((o) => `${o.wert} = „${o.label}“`).join(", ");
  const msgs: KiNachricht[] = [
    {
      role: "system",
      content:
        "Du ordnest Fragen aus einem Abfrageschema für Notrufe festen Merkmalen zu. Du antwortest nur mit JSON, ohne Erklärung. Achte genau auf die Bedeutung: Ist eine Frage umgedreht gestellt (z. B. „Kann er beide Arme gleich hoch halten?“ statt „Sinkt ein Arm ab?“), entspricht ihr „Ja“ dem „Nein“ des Merkmals. Passt kein Merkmal wirklich, nimm „keins“.",
    },
    {
      role: "user",
      content: [
        `FRAGE (Kapitel „${kapitelTitel}“): „${f.text}“`,
        f.optionen?.length ? `ANTWORTEN DER FRAGE: ${antworten}` : "Die Frage wird mit einer Zahl beantwortet.",
        "MÖGLICHE MERKMALE:",
        merkmale,
        `- ${KEIN_MERKMAL}: keines passt`,
        'Gib zurück: {"merkmal": "<ID>", "werte": {"<Wert der Frage>": "<Wert des Merkmals>"}}',
      ].join("\n"),
    },
  ];
  const r = json(await kiJson(msgs, undefined, 400)) as { merkmal?: unknown; werte?: unknown } | null;
  if (!r || typeof r.merkmal !== "string") return null;
  if (r.merkmal === KEIN_MERKMAL) return { merkmal: KEIN_MERKMAL, werte: {} };
  const m = kand.find((x) => x.id === r.merkmal);
  if (!m) return null;
  const werte: Record<string, string> = {};
  const roh = (r.werte && typeof r.werte === "object" ? r.werte : {}) as Record<string, unknown>;
  const vergeben = new Set<string>();
  for (const o of f.optionen ?? []) {
    const w = roh[o.wert];
    if (typeof w === "string" && m.werte.some((x) => x.wert === w) && !vergeben.has(w)) {
      werte[o.wert] = w;
      vergeben.add(w);
    }
  }
  // Auswahlfrage ohne eine einzige brauchbare Antwort-Zuordnung: lieber nichts vorschlagen
  if (f.optionen?.length && m.werte.length && !Object.keys(werte).length) return null;
  return { merkmal: m.id, werte };
}

/** Vorschlag in die Datei schreiben (alle Fragen mit dieser ID) */
export function vorschlagEintragen(s: Schema, id: string, v: KiVorschlag): void {
  const alle = [...Object.values(s.globale_fragen ?? {}).flat(), ...Object.values(s.kapitel ?? {}).flatMap((k) => k.fragen ?? [])].filter((f) => f.id === id);
  for (const f of alle) {
    const x = f as Frage & { merkmal?: string; merkmal_quelle?: string };
    x.merkmal = v.merkmal;
    x.merkmal_quelle = "ki";
    for (const o of f.optionen ?? []) {
      const ow = o as { wert: string; merkmal_wert?: string };
      if (v.werte[ow.wert]) ow.merkmal_wert = v.werte[ow.wert];
      else delete ow.merkmal_wert;
    }
  }
}
