/**
 * Was will die Leitstelle mit diesem Funkspruch? – zuerst die Absicht, dann die Antwort (aus dem Spielzustand).
 *
 * Die Besatzung antwortet nur auf das, was sie wirklich verstanden hat:
 * - eine Frage → genau die Antwort darauf (kein Aufsagen der ganzen Lage)
 * - eine Information („das NEF ist alarmiert“) → „verstanden“ (und richtet sich danach)
 * - ein Auftrag (Storno, Lagemeldung, Einsatz) → ausführen und quittieren
 * - nicht verständlich → „bitte wiederholen“
 *
 * Reine Funktionen ohne Spielzustand – getestet in tools/tests (funkAbsichtTest).
 */

export type FrageThema = "status" | "eintreffen" | "werte" | "patient" | "verdacht" | "ziel" | "naMit" | "bedarf" | "funkcheck" | "landeplatz" | "sonst";
export type InfoThema = "naKommt" | "kraefteKommen" | "partner" | "zusatz" | "ziel" | "warten" | "dritteStorno" | "keinNa" | "sonst";

export type Absicht =
  | { art: "ende" }
  | { art: "quittung" }
  | { art: "storno" }
  | { art: "lageAnfordern" }
  | { art: "einsatz" }
  | { art: "frage"; thema: FrageThema }
  | { art: "info"; thema: InfoThema; wer?: string }
  | { art: "unklar"; grund: string };

/** Fahrzeuge, die im Spruch als Dritte vorkommen können (nicht der Angesprochene) */
const DRITTE =
  /\b(nef|notarzt(?:wagen|einsatzfahrzeug)?|na\b|nah\b|naw\b|hubschrauber|christoph\w*(?:\s?horus)?|c\s?\d{1,2}\b|ith\b|rtw(?:-c)?\b|ktw\b|bel\b|einsatzleit\w*|feuerwehr|polizei|bergrettung|wasserrettung|bit\b|\d{2,3}\s?\/\s?\d{1,3}\b)/i;
/** Frage: ein Teilsatz beginnt mit einem Fragewort bzw. mit dem Zeitwort („habt ihr …“, „ist der …“) */
const FRAGEWORT = /(^|[,;.]\s*|\b(und|oder|frage|bitte)\s+)(wie|was|wo|wohin|woher|wann|welche[rsmn]?|wieviel\w*|wie ?viele|warum|wieso|gibt es|habt ihr|hast du|seid ihr|bist du|braucht ihr|brauchts|benötigt ihr|könnt ihr|kannst du|ist der|ist die|ist das|fährt der|fährt die|fahrt ihr|kommt der|kommt die|wird der|wird die|wird das|werdet ihr|soll der|sollen wir|könnt ihr|kann der|muss der|geht der|wer)\b/i;
const QUITTUNG = /^(hier leo,?\s*)?(verstanden|danke|passt|ok(ay)?|alles klar|gut|jawohl|roger|in ordnung|so verstanden|ist gut)\W*(kommen)?\W*$/i;

/** Rufnamen und „Hier LEO“ vom Anfang entfernen: „56/006 von LEO, …“, „Hier LEO, …“ */
export function ohneKopf(t: string): string {
  return t
    .replace(/^\s*(hier\s+leo|leo\s+hört)[,.:]?\s*/i, "")
    .replace(/^\s*[^,]{1,40}?\s+von\s+leo[,.:]?\s*/i, "")
    .replace(/^\s*(frage|an|für)\b[,:]?\s*/i, "")
    .replace(/[,.\s]*\b(kommen|over)\W*$/i, "")
    .trim();
}

/** Sätze, die die Spracherkennung bei Stille oder Rauschen erfindet (aus Untertiteln gelernt) */
const HALLUZINATION = /untertitel|amara|zuschauen|abonnier|copyright|vielen dank für ihre aufmerksamkeit|bis zum nächsten mal|♪|\[musik\]|\*musik\*/i;

/** Wörter, die im Rettungsdienst-Funk vorkommen – fehlen sie ganz, ist der Spruch vermutlich falsch erkannt */
const FUNKWORT =
  /\b(leo|kommen|ende|verstanden|patient\w*|einsatz\w*|lage\w*|storno|notarzt|nef|rtw|nah|krankenhaus|kh|klinik|schockraum|notaufnahme|transport\w*|status|eintreff\w*|minute\w*|unterwegs|alarmiert|alarm|vor ort|wache|frei|fahrt|fahrzeug\w*|feuerwehr|polizei|rendezvous|treffpunkt|ziel\w*|nachforder\w*|bitte|danke|ja|nein|wo|wie|was|wann|hubschrauber|christophorus|werte|sättigung|blutdruck|puls|zustand|verdacht|wiederhol\w*|warten|wartet|rückt|ein|aus|ort|adresse|stock|stiege|tür|landeplatz|lande\w*|übernehm\w*|übergabe|sichtung|rot|gelb|grün|reanimation|kind|mann|frau|jahre|alt|wach|atmung|bewusst\w*|okay|ok|unterstützung|kräfte|hilfe|braucht|benötigt|ihr|euch|seid|fährt|code|schlüssel)\b/i;

/**
 * Absicht eines Funkspruchs der Leitstelle an ein Fahrzeug.
 * sicherheit = Sicherheit der Spracherkennung (0–1, getippt = 1); angesprochen = Rufnamen des Fahrzeugs (zum Erkennen von Dritten).
 */
export function absichtErkennen(text: string, opt: { sicherheit?: number; angesprochen?: string[] } = {}): Absicht {
  const roh = text.replace(/\s+/g, " ").trim();
  const t = roh.toLowerCase();
  if (!t) return { art: "unklar", grund: "leer" };
  if (/\bende\W*$/.test(t) && t.length < 40) return { art: "ende" };
  if (QUITTUNG.test(t)) return { art: "quittung" };
  const inhalt = ohneKopf(roh).toLowerCase();
  const sicher = opt.sicherheit ?? 1;
  // nur „Hier LEO, kommen“ (LEO meldet sich auf einen Anruf): das Fahrzeug spricht weiter
  if (!inhalt.replace(/\W/g, "")) return { art: "quittung" };
  // typische Erfindungen der Spracherkennung bei Rauschen oder Stille
  if (HALLUZINATION.test(inhalt)) return { art: "unklar", grund: "Rauschen erkannt" };
  // sehr unsichere Erkennung oder kein einziges Wort aus dem Funk: nicht raten
  if (sicher < 0.35) return { art: "unklar", grund: `Erkennung unsicher (${Math.round(sicher * 100)} %)` };
  if (!FUNKWORT.test(inhalt) && inhalt.split(/\s+/).length <= 4) return { art: "unklar", grund: "kein Funkwort" };

  // Dritte im Spruch (anderes Fahrzeug als das angesprochene): z. B. „das NEF Tulln ist alarmiert“ oder „Storno für das NEF“
  const angesprochen = (opt.angesprochen ?? []).map((x) => x.toLowerCase());
  const m = inhalt.match(DRITTE);
  const dritter = m && !angesprochen.some((a) => a && m[0].replace(/\s/g, "").includes(a.replace(/\s/g, "")) ) ? m[0] : undefined;
  const frage = /\?/.test(roh) || FRAGEWORT.test(inhalt);

  // Storno: nur wenn es dem angesprochenen Fahrzeug gilt – „Storno für das NEF“ an den RTW ist eine Information
  const STORNO = /\b(storno|storniert|abbestellt|abbestell\w*|nicht mehr benötigt|nicht mehr erforderlich|abbrechen|brecht ab|einrücken|rückt ein|rücken ein)\b/;
  if (STORNO.test(inhalt)) {
    // Wem gilt der Storno? Steht vor dem Storno-Wort (im selben Satz) ein anderes Fahrzeug und dazwischen kein
    // „euch/ihr“, gilt er dem anderen („das NEF Krems ist, abbestellt, ihr fahrt weiter“). Gilt eines der Storno-Wörter
    // niemand anderem, ist es ein Storno für das angesprochene Fahrzeug.
    const istSelbst = (x: string) => angesprochen.some((a) => a && x.replace(/\s/g, "").includes(a.replace(/\s/g, "")));
    let fremd: string | undefined;
    let eigen = false;
    for (const satz of inhalt.split(/[.;!?]\s*/)) {
      const re = new RegExp(STORNO.source, "g");
      for (let m = re.exec(satz); m; m = re.exec(satz)) {
        const davor = satz.slice(0, m.index);
        const treffer = [...davor.matchAll(new RegExp(DRITTE.source, "gi"))].filter((d) => !istSelbst(d[0]));
        const letzter = treffer[treffer.length - 1];
        const zwischen = letzter ? davor.slice((letzter.index ?? 0) + letzter[0].length) : davor;
        if (letzter && !/\beuch\b|\beuren?\b|\bihr\b/.test(zwischen)) fremd ??= letzter[0];
        else eigen = true;
      }
    }
    if (!eigen && fremd) return { art: "info", thema: "dritteStorno", wer: fremd };
    if (!frage && eigen) return { art: "storno" };
  }
  if (/\blage\s?meldung\b|wie (ist|schaut|sieht) (eure|die|es mit der) lage|\blage\W*$|\blage\b.*\b(durchgeben|melden|bitte)\b|gebt? mir (eine|die) lage/.test(inhalt)) return { art: "lageAnfordern" };

  if (frage) {
    if (/sättigung|spo2|blutdruck|\brr\b|puls|herzfrequenz|blutzucker|\bbz\b|vitalwerte|vitalparameter|temperatur|fieber|\bgcs\b|atemfrequenz|\bwerte\b/.test(inhalt)) return { art: "frage", thema: "werte" };
    if (/(fährt|fahrt|kommt|geht).{0,25}(notarzt|nef|na\b).{0,15}mit|(notarzt|nef|na\b).{0,25}(mit|begleit)/.test(inhalt)) return { art: "frage", thema: "naMit" };
    if (/zielkrankenhaus|zielklinik|welche[sr]? (kh|krankenhaus|klinik)|wohin|wo fahrt ihr hin|ins welche/.test(inhalt)) return { art: "frage", thema: "ziel" };
    if (/verdacht|diagnose|was hat (er|sie|der patient|die patientin)/.test(inhalt)) return { art: "frage", thema: "verdacht" };
    if (/eintreff|wie lange|wann seid|wann seit|ankunft|fahrzeit|wie weit/.test(inhalt)) return { art: "frage", thema: "eintreffen" };
    if (/braucht ihr|benötigt ihr|nachforder|noch (was|etwas|kräfte|unterstützung)|weitere kräfte/.test(inhalt)) return { art: "frage", thema: "bedarf" };
    if (/status|wo seid|wo bist|position|seid ihr (schon )?(vor ort|da|frei)|was macht ihr/.test(inhalt)) return { art: "frage", thema: "status" };
    if (/patient|zustand|wie geht|reanim|wach|atmet|bewusst|verletzt|lage/.test(inhalt)) return { art: "frage", thema: "patient" };
    if (/funkcheck|wie hört ihr|wie hören sie|verständigung|hört ihr mich/.test(inhalt)) return { art: "frage", thema: "funkcheck" };
    if (/lande|landeplatz/.test(inhalt)) return { art: "frage", thema: "landeplatz" };
    return { art: "frage", thema: "sonst" };
  }
  if (/funkcheck|wie hört ihr|wie hören sie|verständigung/.test(inhalt)) return { art: "frage", thema: "funkcheck" };

  // Informationen
  // „kein Notarzt in Reichweite“: die Besatzung fährt nach kurzer Zeit ohne Notarzt
  if (/\bkein(en)?\s+(notarzt|na|nef|arzt|hubschrauber)\b.{0,30}\b(verfügbar|frei|in reichweite|erreichbar|vorhanden|da|mehr)\b|\b(notarzt|nef|na)\b.{0,20}\bnicht\s+(verfügbar|erreichbar|frei|möglich)\b|\bkeiner\s+(in reichweite|verfügbar|frei)\b|\bohne notarzt\b/.test(inhalt))
    return { art: "info", thema: "keinNa" };
  if (dritter && /\b(alarmiert|nachalarmiert|unterwegs|kommt|kommen zu euch|zu euch|geschickt|schicke|losgeschickt|eintreffzeit|eintreffen|ist auf dem weg|fliegt|startet)\b/.test(inhalt)) {
    const na = /\b(nef|notarzt|na\b|nah\b|naw\b|hubschrauber|christoph\w*|c\s?\d{1,2})\b/i.test(dritter);
    return { art: "info", thema: na ? "naKommt" : "kraefteKommen", wer: dritter };
  }
  if (/(feuerwehr|polizei|bergrettung|wasserrettung).*(vor ort|kommt|unterwegs|alarmiert|angefordert|verständigt)/.test(inhalt)) return { art: "info", thema: "partner" };
  if (/einsatz .*(code|adresse|einsatzort)|neuer einsatz|einsatzauftrag|übernehmt|übernehmen sie|folgeeinsatz|nächster einsatz|anschlusseinsatz/.test(inhalt)) return { art: "einsatz" };
  if (/zielkrankenhaus|zielklinik|(fahrt|fährt|kommt|geht|fliegt) ins|ins (uk|lk|kh|krankenhaus|klinikum|spital)|bringt (ihn|sie|den patienten)|nehmt|transport (ins|nach)/.test(inhalt)) return { art: "info", thema: "ziel" };
  if (/\b(wartet|warte|warten sie|bleibt (vor ort|dort)|bleiben sie)\b/.test(inhalt)) return { art: "info", thema: "warten" };
  if (/zusatzinfo|zur info|beachtet|achtung|hinweis|information|stock|stiege|türcode|\bcode\b|schlüssel|zufahrt|eingang|hund|aufzug|lift/.test(inhalt)) return { art: "info", thema: "zusatz" };
  // kurze Bestätigungen mit Rufnamen („Hier LEO, alles klar“)
  if (QUITTUNG.test(inhalt)) return { art: "quittung" };
  // längerer, aber unbestimmter Satz mit Funkwörtern: als Information nehmen (wenig sicher erkannt: nachfragen)
  if (sicher < 0.55) return { art: "unklar", grund: `Erkennung unsicher (${Math.round(sicher * 100)} %)` };
  return { art: "info", thema: "sonst" };
}
