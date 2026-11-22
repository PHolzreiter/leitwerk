/**
 * Eigene Dateien (ab Beta 70): je Bereich genau EINE Datei.
 *  - Notruf (RD):  Abfrageschema/RD/<Name>.json – Kapitel, Fragen, Regeln UND Codes in einer Datei
 *  - KT/SEK:       Codelisten/Krankentransport_Sekundärtransporte/<Name>.json – nur Codes mit Bedingungen
 *                  (die Fragen der KT-Hotline sind immer die eingebauten)
 *  - Namen:        Namen/<Name>.csv (siehe data/namen.ts)
 * Eine getrennte Codeliste oder eine eigene KT-Abfrage gibt es nicht (mehr). Im Multiplayer lädt jeder selbst.
 */
import { istSchema, type Schema } from "../abfrage/schema";
import { pruefeCodesystem } from "../abfrage/codesystem";
import type { Einsatzcode } from "../data/model";
import { store } from "../data/store";
import { standardCodesystem } from "../data/standard";
import { ablageLesen, ablageListe, ablageLoeschen, ablageName, ablageSpeichern, type AblageOrdner } from "../net/ablage";
import { KT_BED_KEYS, KT_BEDINGUNGEN, KT_KRITERIEN, klaertVon, pruefeKtSatz, type KtCodeDef } from "../sim/ktBedingungen";
import { standardKtAbfrage } from "../sim/ktCodes";
import { toast } from "./dom";

export const RECHTLICHER_HINWEIS =
  "Aus rechtlichen Gründen können wir die echten Einsatzcodes und Abfrageschemas leider nicht mitliefern. LeitWerk bringt deshalb ein eigenes Codesystem mit, das sich ähnlich spielt. Du kannst aber jederzeit deine eigene Datei einbauen.";

export type Bereich = "rd" | "kt";

export const ORDNER: Record<Bereich, { abfrage: AblageOrdner; codes: AblageOrdner }> = {
  rd: { abfrage: "Abfrageschema/RD", codes: "Codelisten/RD" },
  kt: { abfrage: "Abfrageschema/Krankentransport_Sekundärtransporte", codes: "Codelisten/Krankentransport_Sekundärtransporte" },
};

const LS_AKTIV = "lw.codesatz";
const basis = (datei: string) => datei.replace(/\.(json|csv|txt)$/i, "");

export function aktivMerken(name: string | null): void {
  lsSetzen(LS_AKTIV, name);
}

function lsLesen(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSetzen(k: string, v: string | null): void {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* egal */
  }
}

// ------------------------------------------------------------------ Teile: ein Reiter = eine Datei

export type Teil = "notruf" | "ktsek";

export const TEILE: Record<Teil, { bereich: Bereich; ordner: AblageOrdner; titel: string }> = {
  notruf: { bereich: "rd", ordner: ORDNER.rd.abfrage, titel: "Notruf (RD)" },
  ktsek: { bereich: "kt", ordner: ORDNER.kt.codes, titel: "Krankentransport & Überstellung (KT/SEK)" },
};

export interface TeilDatei {
  datei: string;
  name: string;
  geaendert: number;
  entwurf?: boolean;
}

const lsTeil = (t: Teil) => `lw.aktiv.${t}`;

/** Dateien eines Reiters (Entwürfe aus dem KT-Code-Editor markiert) */
export async function teilListe(t: Teil): Promise<TeilDatei[]> {
  const d = TEILE[t];
  const l = (await ablageListe(d.ordner).catch(() => [])).filter((x) => /\.json$/i.test(x.datei));
  const out: TeilDatei[] = [];
  for (const x of l) {
    const e: TeilDatei = { datei: x.datei, name: basis(x.datei), geaendert: x.geaendert };
    if (t === "ktsek") {
      try {
        if ((JSON.parse(await ablageLesen(d.ordner, x.datei)) as { entwurf?: boolean }).entwurf) e.entwurf = true;
      } catch {
        /* egal */
      }
    }
    out.push(e);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Aktive Datei eines Reiters (null = eingebaut) */
export function aktivDatei(t: Teil): string | null {
  if (t === "notruf") {
    if (store.schemaIstStandard) return null;
    const alt = lsLesen(LS_AKTIV);
    return lsLesen(lsTeil(t)) ?? lsLesen("lw.aktiv.rdAbfrage") ?? (alt ? `${alt}.json` : null) ?? (store.schemaRoh?.name ? `${store.schemaRoh.name}.json` : "Eigene Datei");
  }
  const k = store.ktSatzRoh;
  if (!k?.codes?.length) return null;
  return lsLesen(lsTeil(t)) ?? lsLesen("lw.aktiv.ktCodes") ?? `${k.name || "Eigene Datei"}.json`;
}

/** Zurück zum eingebauten System (RD bzw. KT/SEK) */
export function eingebautAktivieren(bereich: Bereich = "rd"): void {
  if (bereich === "kt") {
    store.setKtSatz(null);
    lsSetzen(lsTeil("ktsek"), null);
    return;
  }
  lsSetzen(lsTeil("notruf"), null);
  store.setSchema(null);
  store.removeMany("codes", store.list("codes").filter((c) => c.herkunft !== "standard").map((c) => c.id));
  aktivMerken(null);
}

/** Notruf-Datei lesen (ein KT-Teil darin zählt nicht – KT/SEK ist ein eigener Reiter) */
export function rdSchemaLesen(text: string, datei: string): Schema {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei`);
  }
  if (!istSchema(roh)) throw new Error(`${datei} ist keine gültige Notruf-Datei (es fehlen „kapitel“, „globale_fragen“ oder „codes“ – siehe Beispieldatei)`);
  const s = roh as Schema & { kt?: unknown };
  delete s.kt;
  return s;
}

/** KT-/SEK-Datei lesen (JSON: { codes: [...] }) */
export function ktCodesLesen(text: string, datei: string): KtCodeDef[] {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error(`${datei} ist keine gültige JSON-Datei (KT/SEK-Codes gibt es nur als JSON – siehe Beispieldatei)`);
  }
  const l = Array.isArray(roh) ? roh : (roh as { codes?: unknown })?.codes;
  if (!Array.isArray(l) || !l.length || !l.every((c) => c && typeof (c as KtCodeDef).code === "string" && typeof (c as KtCodeDef).bed === "object"))
    throw new Error(`${datei}: keine KT-/SEK-Codes erkannt (nötig: „codes“ mit „code“, „name“ und „bed“ je Code – siehe Beispieldatei)`);
  return (l as KtCodeDef[]).map((c) => ({ code: c.code, name: c.name ?? c.code, ...(c.kapitel ? { kapitel: c.kapitel } : {}), bed: { ...c.bed } }));
}

/** Notruf-Datei übernehmen (Codes daraus in die Codeliste, neue Einsatzstufen ergänzen); Rückgabe: Anzahl neuer Stufen */
export function schemaAnwenden(schema: Schema, dateiname: string): number {
  const vorhanden = new Map(store.list("codes").map((x) => [x.code.toUpperCase(), x.id]));
  const liste: Einsatzcode[] = Object.entries(schema.codes ?? {}).map(([code, x]) => ({
    id: vorhanden.get(code.toUpperCase()) ?? code,
    code,
    name: x.name,
    kategorie: x.kategorie,
    kapitel: x.kapitel,
    hinweis: "",
    herkunft: "import",
    herkunftDetail: dateiname,
  }));
  store.setSchema(schema);
  if (liste.length) store.upsert("codes", liste);
  const neu = (schema.einsatzstufen ?? []).filter((x) => x?.stufe && !store.settings.stufen.some((st) => st.stufe === x.stufe));
  if (neu.length) {
    const set = structuredClone(store.settings);
    for (const x of neu)
      set.stufen.push({
        stufe: x.stufe,
        rettungsmittel: x.rettungsmittel ?? "",
        nfsErforderlich: !!x.nfs_erforderlich,
        notarzt: x.notarzt === "nef" || x.notarzt === "schnellster" ? x.notarzt : "nein",
        sondersignal: !!x.sondersignal,
        kategorie: x.kategorie === "kritisch" || x.kategorie === "dringend" || x.kategorie === "stabil" ? x.kategorie : x.notarzt === "nef" || x.notarzt === "schnellster" ? "kritisch" : x.sondersignal ? "dringend" : "stabil",
        transportProzent: Math.max(0, Math.min(100, Number(x.transport_prozent ?? 70))),
      });
    store.setSettings(set);
  }
  return neu.length;
}

/** Notruf neu setzen: erst eingebaut, dann die Datei */
function rdAnwenden(schema: { datei: string; schema: Schema } | null): number {
  eingebautAktivieren("rd");
  const stufen = schema ? schemaAnwenden(schema.schema, schema.datei) : 0;
  lsSetzen(lsTeil("notruf"), schema?.datei ?? null);
  aktivMerken(schema ? basis(schema.datei) : null);
  return stufen;
}

/** KT/SEK neu setzen (nur Codes; die Abfrage ist die eingebaute); prüft die Codes */
function ktAnwenden(codes: { datei: string; liste: KtCodeDef[] } | null): void {
  if (!codes) return eingebautAktivieren("kt");
  const r = pruefeKtSatz({ codes: codes.liste }, standardKtAbfrage());
  if (r.fehler.length) throw new Error(`Passt so noch nicht (${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"}, z. B. ${r.fehler[0]}) – im KT-Code-Editor bearbeiten`);
  store.setKtSatz({ name: basis(codes.datei), codes: codes.liste });
  lsSetzen(lsTeil("ktsek"), codes.datei);
}

/** Eine Datei aktivieren (datei = null: eingebaut). Rückgabe: Text für die Rückmeldung. */
export async function teilAktivieren(t: Teil, datei: string | null): Promise<string> {
  const d = TEILE[t];
  const text = datei ? await ablageLesen(d.ordner, datei) : null;
  if (t === "notruf") {
    const stufen = rdAnwenden(datei ? { datei, schema: rdSchemaLesen(text!, datei) } : null);
    const n = Object.keys(store.schemaRoh?.codes ?? {}).length;
    return `${datei ? `„${basis(datei)}“ aktiv · ${n} Codes` : "Eingebautes LeitWerk-Codesystem aktiv"}${stufen ? ` · ${stufen} neue Einsatzstufen` : ""}`;
  }
  if (datei && (JSON.parse(text!) as { entwurf?: boolean }).entwurf) throw new Error(`„${basis(datei)}“ ist ein Entwurf – erst im KT-Code-Editor fertigstellen`);
  const liste = datei ? ktCodesLesen(text!, datei) : null;
  ktAnwenden(datei && liste ? { datei, liste } : null);
  return datei ? `„${basis(datei)}“ aktiv · ${liste!.length} Codes` : "Eingebaute LeitWerk-Transportcodes aktiv";
}

/** Datei hochladen: prüfen, in den Ordner speichern und aktivieren; KT/SEK, die noch nicht passt → Entwurf */
export async function teilHochladen(t: Teil, dateiname: string, text: string): Promise<string> {
  const d = TEILE[t];
  if (!/\.json$/i.test(dateiname)) throw new Error(`Hier geht nur eine JSON-Datei (${dateiname} ist keine) – siehe Beispieldatei`);
  const ziel = `${ablageName(basis(dateiname))}.json`;
  let inhalt: string;
  if (t === "notruf") {
    const s = rdSchemaLesen(text, dateiname);
    const p = pruefeCodesystem(s);
    if (p.fehler.length) throw new Error(`${dateiname}: ${p.fehler[0]}${p.fehler.length > 1 ? ` (und ${p.fehler.length - 1} weitere Fehler)` : ""}`);
    delete (s as { anleitung_fuer_ki?: unknown }).anleitung_fuer_ki;
    inhalt = JSON.stringify(s);
  } else {
    const liste = ktCodesLesen(text, dateiname);
    const r = pruefeKtSatz({ codes: liste }, standardKtAbfrage());
    if (r.fehler.length) {
      await ablageSpeichern(d.ordner, ziel, JSON.stringify({ entwurf: true, codes: liste }));
      return `Als Entwurf gespeichert (${liste.length} Codes) – ${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"}, z. B. ${r.fehler[0]} · im KT-Code-Editor fertigstellen`;
    }
    inhalt = JSON.stringify({ codes: liste });
  }
  await ablageSpeichern(d.ordner, ziel, inhalt);
  return `Gespeichert · ${await teilAktivieren(t, ziel)}`;
}

/** Datei löschen (war sie aktiv: wieder eingebaut) */
export async function teilLoeschen(t: Teil, datei: string): Promise<string> {
  const istAktiv = aktivDatei(t)?.toLowerCase() === datei.toLowerCase();
  await ablageLoeschen(TEILE[t].ordner, datei);
  if (istAktiv) eingebautAktivieren(TEILE[t].bereich);
  return istAktiv ? "Gelöscht – wieder eingebaut" : "Gelöscht";
}

/** Eingebaute KT-/SEK-Codes */
export function eingebauteKtCodes(): KtCodeDef[] {
  return ((standardCodesystem() as { kt?: { codes?: KtCodeDef[] } }).kt?.codes ?? []) as KtCodeDef[];
}

/**
 * Beim Start (Beta 70): eine getrennt hochgeladene Codeliste oder eine eigene KT-Abfrage gibt es nicht mehr –
 * abschalten (die Dateien bleiben im Ordner) und einmal Bescheid sagen.
 */
export function teileBereinigen(): void {
  if (store.inSession) return;
  const was: string[] = [];
  const liste = store.list("codes").filter((c) => c.herkunft !== "standard" && /\.(csv|txt)$/i.test(c.herkunftDetail ?? ""));
  if (liste.length) {
    const s = store.schemaIstStandard ? null : store.schemaRoh;
    const datei = aktivDatei("notruf");
    rdAnwenden(s && datei ? { datei, schema: structuredClone(s) } : null);
    was.push("die getrennte Notruf-Codeliste");
  }
  const k = store.ktSatzRoh;
  if (k?.abfrage?.length) {
    if (k.codes?.length) store.setKtSatz({ name: k.name, codes: k.codes });
    else eingebautAktivieren("kt");
    was.push("die eigene KT-Abfrage");
  }
  for (const alt of ["lw.aktiv.rdCodes", "lw.aktiv.ktAbfrage"]) lsSetzen(alt, null);
  if (was.length) toast(`Neu: Eigene Dateien gibt es je Bereich nur noch als eine Datei – ${was.join(" und ")} ist abgeschaltet (die Datei bleibt im Ordner). Einstellungen › Eigene Dateien`);
}

/**
 * Einmalig beim Start: v0.73 alte importierte Codes/Schemas entfernen; v0.76 gemischte Sätze entfernen –
 * ab jetzt RD und KT/SEK getrennt (die Dateien liegen dann in den Unterordnern).
 */
export async function codesEinmaligAufraeumen(): Promise<boolean> {
  if (store.codesGetrennt || store.inSession) return false;
  const hatte = !store.schemaIstStandard || store.list("codes").some((c) => c.herkunft !== "standard") || !!store.ktSatzRoh;
  store.codesTrennen();
  aktivMerken(null);
  let dateien = 0;
  for (const ordner of ["Abfrageschema", "Codelisten"] as const) {
    for (const d of await ablageListe(ordner).catch(() => [])) {
      await ablageLoeschen(ordner, d.datei)
        .then(() => dateien++)
        .catch((e) => console.warn("Ablage löschen", e));
    }
  }
  if (hatte || dateien) toast("Neu: Codes für Notrufe (RD) und für Krankentransporte/Überstellungen (KT/SEK) sind jetzt getrennt. Eigene Dateien bitte unter Einstellungen › Eigene Dateien neu hinzufügen.");
  return true;
}

// ------------------------------------------------------------------ Beispieldatei und KI-Anleitung für KT/SEK

/** Anleitung für eine KI: eine KT/SEK-Datei erstellen (Werte und Regeln aus dem Spiel, damit sie stimmen) */
export function ktKiAnleitung(): string[] {
  const bed = KT_BED_KEYS.map((k) => `- \`${k}\` (${KT_BEDINGUNGEN[k].label}): ${Object.entries(KT_BEDINGUNGEN[k].werte as Record<string, string>).map(([w, l]) => `\`${w}\` = ${l}`).join(", ")}`);
  const fragen = standardKtAbfrage().map((f, i) => {
    const kl = klaertVon(f).filter((x) => x in KT_KRITERIEN);
    return `${i + 1}. „${f.text}“${kl.length ? ` – klärt: ${kl.map((x) => KT_KRITERIEN[x].split(" (")[0]).join(", ")}` : ""}`;
  });
  return [
    "# Anleitung für eine KI: KT/SEK-Codes für LeitWerk erstellen",
    "",
    "**Auftrag des Spielers** (steht unter dieser Anleitung bzw. in seiner Nachricht): für welche Region die Codes sein sollen und worauf du achten sollst. Fehlt das, frag zuerst danach.",
    "",
    "LeitWerk ist ein Leitstellen-Spiel. Neben Notrufen gibt es Krankentransporte (KT) und Überstellungen/Sekundärtransporte (SEK), die über eine KT-Hotline bestellt werden. Die Hotline stellt immer dieselben eingebauten Fragen; aus den Antworten ergeben sich Bedingungen, und das Spiel sucht den **einen Code**, dessen Bedingungen passen.",
    "Deine Aufgabe: eine Datei mit **allen KT/SEK-Codes** einer Region erstellen – im Aufbau dieser Beispieldatei. Am einfachsten: nimm die Codes dieser Datei, benenne Codes und Namen nach der Region um und ändere die Bedingungen nur, wo es die Region wirklich anders macht.",
    "",
    "## Aufbau",
    "```",
    '{ "format": "leitwerk-kt-codes", "anleitung_fuer_ki": [ … ], "codes": [ { "code": "KTR-90T1", "name": "…", "kapitel": "90 – …", "bed": { "fahrt": "zum_kh", "lage": "gehend", … } }, … ] }',
    "```",
    "- `code`: eindeutig, kurz (Großbuchstaben, Ziffern, Bindestrich).",
    "- `name`: kurze Bezeichnung, wie sie in der Leitstelle steht.",
    "- `kapitel`: Gruppe in der Auswahl (optional), z. B. „90 – Krankentransport“.",
    "- `bed`: Bedingungen. **`fahrt` ist Pflicht**, alles andere optional – fehlt eine Bedingung, gilt der Code für jeden Wert (beliebig).",
    "",
    "## Bedingungen und erlaubte Werte (nur diese Schlüssel und Werte!)",
    ...bed,
    "",
    "## Fragen der KT-Hotline (fest eingebaut)",
    ...fragen,
    "",
    "## Regeln – sonst lässt sich die Datei nicht verwenden",
    "1. Jeder Code kommt nur einmal vor, jeder hat `fahrt`.",
    "2. Keine zwei Codes mit genau gleichen Bedingungen.",
    "3. **Jede mögliche Kombination der Antworten führt zu genau einem Code** – es darf keine Lücke und keine Doppeldeutigkeit geben. Deshalb: lieber wenige, allgemeine Codes (Bedingung weglassen = beliebig) plus speziellere für Sonderfälle.",
    "4. Nur Werte aus der Liste oben verwenden.",
    "",
    "## Ausgabe",
    "Gib am Ende **eine vollständige, gültige JSON-Datei** aus (doppelte Anführungszeichen, keine Kommentare). Das Feld „anleitung_fuer_ki“ darfst du weglassen.",
    "Der Spieler lädt sie in LeitWerk hoch: Einstellungen › Eigene Dateien › Krankentransport & Überstellung (KT/SEK) › „Datei hochladen“. Passt sie noch nicht, speichert LeitWerk sie als Entwurf und zeigt im KT-Code-Editor, was fehlt.",
  ];
}

/** Beispieldatei KT/SEK: die eingebauten Codes (vollständig – jede Kombination hat genau einen Code) mit KI-Anleitung */
export function ktBeispiel(): string {
  return JSON.stringify({ format: "leitwerk-kt-codes", name: "Beispiel – LeitWerk-Transportcodes", anleitung_fuer_ki: ktKiAnleitung(), codes: eingebauteKtCodes() }, null, 1);
}
