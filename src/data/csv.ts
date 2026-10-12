/** Einfacher, robuster CSV-Leser und -Schreiber (Excel-kompatibel). */

/** Erkennt das Trennzeichen anhand der Kopfzeile (; , oder Tab). */
function detectDelimiter(firstLine: string): string {
  const counts: [string, number][] = [";", ",", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

/** Liest CSV-Text in Zeilen und Felder. Beachtet Anführungszeichen und Zeilenumbrüche in Feldern. */
export function parseCsv(text: string): string[][] {
  let src = text.replace(/^﻿/, "");
  const firstLineEnd = src.search(/\r?\n/);
  const delim = detectDelimiter(firstLineEnd === -1 ? src : src.slice(0, firstLineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Leere Zeilen entfernen
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function quote(v: string, delim: string): string {
  if (v.includes(delim) || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Schreibt CSV mit Semikolon, CRLF und BOM – so öffnet Excel (deutsch) die Datei direkt richtig. */
export function toCsv(header: string[], rows: string[][]): string {
  const delim = ";";
  const lines = [header, ...rows].map((r) => r.map((v) => quote(v ?? "", delim)).join(delim));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
