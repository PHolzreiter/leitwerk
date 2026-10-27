/** Auswertung eines Falltests: Fehlerquoten, Vergleich mit einem früheren Lauf, Bericht-Seite */

export const BEREICHE = { notruf: "Notruf", kt: "Krankentransport", sek: "Überstellung", funk: "Funk" };

/** „lang (4 Sätze)“ → Art „lang“, Detail „4 Sätze“ */
export function kategorie(grund) {
  const m = grund.match(/^(.*?)(?:\s*\((.*)\)\s*$|:\s+(.*)$|\s+–\s+(.*)$)/);
  if (!m || !m[1]) return { art: grund.trim(), detail: "" };
  return { art: m[1].trim(), detail: (m[2] ?? m[3] ?? m[4] ?? "").trim() };
}

const mittel = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
const median = (l) => {
  if (!l.length) return 0;
  const s = [...l].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function leer() {
  return { gespraeche: 0, ohneAuff: 0, antworten: 0, auffaellig: 0, hinweise: 0, fest: 0, fehler: 0, antwortMs: [], rechenMs: [], quote: 0 };
}

export function auswerten(lauf) {
  const gesamt = leer();
  const bereiche = {};
  const arten = new Map();
  const faelle = new Map();
  for (const a of lauf.auftraege) {
    const b = (bereiche[a.art] ??= leer());
    const d = a.durchlauf;
    for (const s of [gesamt, b]) {
      if (!d) {
        s.fehler++;
        continue;
      }
      s.gespraeche++;
      s.antworten += d.fragen;
      // je Antwort einmal zählen, auch wenn ihr mehrere Dinge auffallen
      s.auffaellig += new Set(d.auffaellig.map((x) => `${x.frage}\u0000${x.antwort}`)).size;
      s.hinweise += d.auffaellig.length;
      if (!d.auffaellig.length) s.ohneAuff++;
      s.fest += d.auffaellig.filter((x) => /^feste (Antwort|Meldung) statt KI/.test(x.grund)).length;
      s.antwortMs.push(...d.antwortMs);
      s.rechenMs.push(...(a.ki?.rechenMs ?? []));
    }
    if (!d) continue;
    for (const x of d.auffaellig) {
      const k = kategorie(x.grund);
      const e = arten.get(k.art) ?? { art: k.art, n: 0, je: {}, gespraeche: new Set(), beispiele: [] };
      e.n++;
      e.je[a.art] = (e.je[a.art] ?? 0) + 1;
      e.gespraeche.add(a.nr);
      if (e.beispiele.length < 6) e.beispiele.push({ nr: a.nr, fall: d.fallName, variante: d.variante, frage: x.frage, antwort: x.antwort, detail: k.detail });
      arten.set(k.art, e);
    }
    const fk = a.art === "kt" || a.art === "sek" ? `${a.art}` : `${a.art}:${a.fallId}:${a.variante}`;
    const f = faelle.get(fk) ?? { key: fk, art: a.art, name: a.art === "kt" || a.art === "sek" ? BEREICHE[a.art] : d.fallName.replace(/^Funk: /, ""), variante: a.art === "kt" || a.art === "sek" ? "" : a.variante, laeufe: 0, antworten: 0, auff: 0, arten: {} };
    f.laeufe++;
    f.antworten += d.fragen;
    f.auff += new Set(d.auffaellig.map((x) => `${x.frage}\u0000${x.antwort}`)).size;
    for (const x of d.auffaellig) {
      const k = kategorie(x.grund).art;
      f.arten[k] = (f.arten[k] ?? 0) + 1;
    }
    faelle.set(fk, f);
  }
  for (const s of [gesamt, ...Object.values(bereiche)]) s.quote = s.antworten ? (s.auffaellig / s.antworten) * 100 : 0;
  // Läuft Ollama wirklich parallel? (Wartezeit deutlich länger als die Rechenzeit)
  let kiHinweis = "";
  const wand = lauf.auftraege.flatMap((a) => a.ki?.wandMs ?? []);
  const rechen = lauf.auftraege.flatMap((a) => a.ki?.rechenMs ?? []);
  if (!lauf.ki.test && lauf.einstellungen.parallel > 1 && wand.length > 10 && median(wand) > 1.6 * median(rechen))
    kiHinweis = `Ollama hat die Anfragen offenbar nacheinander gerechnet (Wartezeit ${(median(wand) / 1000).toFixed(1)} s, Rechenzeit ${(median(rechen) / 1000).toFixed(1)} s). Mit OLLAMA_NUM_PARALLEL=${lauf.einstellungen.parallel} geht es schneller – siehe Anleitung.`;
  const stunden = lauf.dauerMs / 3_600_000;
  return {
    gesamt,
    bereiche,
    arten: [...arten.values()].map((e) => ({ ...e, gespraeche: e.gespraeche.size })).sort((x, y) => y.n - x.n),
    faelle: [...faelle.values()].sort((x, y) => y.auff / Math.max(1, y.antworten) - x.auff / Math.max(1, x.antworten)),
    proStunde: stunden > 0 ? gesamt.gespraeche / stunden : 0,
    kiRechenMs: mittel(rechen),
    kiHinweis,
  };
}

/** zwei Quoten vergleichen (Anteil auffälliger Antworten); z ≥ 2 gilt als deutlicher Unterschied */
function vergleichZahl(nNeu, aNeu, nAlt, aAlt) {
  const pN = aNeu ? nNeu / aNeu : 0;
  const pA = aAlt ? nAlt / aAlt : 0;
  const p = aNeu + aAlt ? (nNeu + nAlt) / (aNeu + aAlt) : 0;
  const se = Math.sqrt(p * (1 - p) * (1 / Math.max(1, aNeu) + 1 / Math.max(1, aAlt)));
  const z = se > 0 ? (pN - pA) / se : 0;
  return { neu: pN * 100, alt: pA * 100, delta: (pN - pA) * 100, z, urteil: !aNeu || !aAlt ? "–" : z <= -2 ? "besser" : z >= 2 ? "schlechter" : Math.abs(z) >= 1 ? "eher " + (z < 0 ? "besser" : "schlechter") : "gleich" };
}

export function vergleichen(neu, alt, sNeu, sAlt) {
  const altName = `${alt.erstellt.slice(0, 16).replace("T", " ")} (v${alt.leitwerk.version}${alt.leitwerk.commit ? `, ${alt.leitwerk.commit}` : ""})`;
  const warnungen = [];
  if (alt.ki.modell !== neu.ki.modell) warnungen.push(`anderes KI-Modell (${alt.ki.modell} → ${neu.ki.modell})`);
  if (alt.daten.schema !== neu.daten.schema) warnungen.push(`anderes Abfrageschema (${alt.daten.schema} → ${neu.daten.schema})`);
  if (alt.einstellungen.seed !== neu.einstellungen.seed && !neu.einstellungen.wie) warnungen.push("andere Startzahl – andere Gespräche, Unterschiede teils Zufall");
  const g = vergleichZahl(sNeu.gesamt.auffaellig, sNeu.gesamt.antworten, sAlt.gesamt.auffaellig, sAlt.gesamt.antworten);
  const bereiche = {};
  for (const b of Object.keys(BEREICHE)) {
    const n = sNeu.bereiche[b];
    const a = sAlt.bereiche[b];
    if (n && a) bereiche[b] = vergleichZahl(n.auffaellig, n.antworten, a.auffaellig, a.antworten);
  }
  // Fehlerarten je Bereich (nur Bereiche, die in beiden Läufen vorkommen)
  const gemeinsam = Object.keys(bereiche);
  const antw = (s) => gemeinsam.reduce((x, b) => x + (s.bereiche[b]?.antworten ?? 0), 0);
  const zaehl = (s) => {
    const m = new Map();
    for (const e of s.arten) m.set(e.art, gemeinsam.reduce((x, b) => x + (e.je[b] ?? 0), 0));
    return m;
  };
  const zN = zaehl(sNeu);
  const zA = zaehl(sAlt);
  const arten = [...new Set([...zN.keys(), ...zA.keys()])]
    .map((art) => ({ art, nNeu: zN.get(art) ?? 0, nAlt: zA.get(art) ?? 0, ...vergleichZahl(zN.get(art) ?? 0, antw(sNeu), zA.get(art) ?? 0, antw(sAlt)) }))
    .filter((x) => x.nNeu || x.nAlt)
    .sort((x, y) => x.z - y.z);
  // gleiche Gespräche (gleiche Startzahl): was ist neu aufgetreten, was ist weg?
  const altNach = new Map(alt.auftraege.map((a) => [`${a.key}|${a.seed}`, a]));
  const paare = [];
  for (const a of neu.auftraege) {
    const b = altNach.get(`${a.key}|${a.seed}`);
    if (!b || !a.durchlauf || !b.durchlauf) continue;
    const kn = a.durchlauf.auffaellig.map((x) => kategorie(x.grund).art);
    const ka = b.durchlauf.auffaellig.map((x) => kategorie(x.grund).art);
    const weg = ka.filter((k) => !kn.includes(k));
    const dazu = kn.filter((k) => !ka.includes(k));
    paare.push({ nr: a.nr, name: `${a.durchlauf.fallName} ${a.durchlauf.variante}`.trim(), alt: ka.length, neu: kn.length, weg: [...new Set(weg)], dazu: [...new Set(dazu)] });
  }
  const gesamtText = `${g.alt.toFixed(1)} → ${g.neu.toFixed(1)} auffällige je 100 Antworten (${g.urteil})`;
  return { altName, warnungen, gesamt: g, bereiche, arten, paare, gesamtText };
}

// ------------------------------------------------------------------ Markdown (für Claude)

export function lageMd(lauf, s) {
  const e = lauf.einstellungen;
  const z = [
    "# Falltest – Rahmen",
    "",
    `- LeitWerk ${lauf.leitwerk.version}${lauf.leitwerk.commit ? ` (Commit ${lauf.leitwerk.commit}${lauf.leitwerk.geaendert ? ", mit lokalen Änderungen" : ""})` : ""}`,
    `- KI: ${lauf.ki.modell}${lauf.ki.test ? " (Test-KI)" : ""} · ${lauf.ki.aufrufe} Aufrufe, ${lauf.ki.fehler} Fehler · Einstellungen aus ki.rs: Temperatur ${lauf.ki.einstellungen.temperatur}, Kontext ${lauf.ki.einstellungen.numCtx}, Länge ${lauf.ki.einstellungen.numPredict}`,
    `- Schema: ${lauf.daten.schema} · KT/SEK: ${lauf.daten.ktSatz ?? "eingebaut"} · Funkgruppe: ${lauf.daten.funkgruppe ?? "Standard"} · Daten: ${lauf.daten.quelle} · Adressen: ${lauf.daten.adressen ?? "–"}`,
    `- Fälle: ${lauf.daten.eigeneFaelle ?? 0} eigene, ${lauf.daten.geaenderteFaelle ?? 0} geänderte, ${lauf.daten.ausgeschaltet ?? 0} ausgeschaltet${lauf.daten.fallpaket ? ` · Fallpaket ${lauf.daten.fallpaket}` : ""}`,
    `- Gesprächsablauf: ${lauf.daten.ablauf}`,
    `- Auswahl: ${e.was.join(", ")} · ${e.mal}× je Ausgang · KT ${e.kt} · SEK ${e.sek}${e.fall ? ` · Fälle „${e.fall}“` : ""}${e.wie ? ` · wie Lauf ${e.wie}${e.nurAuffaellige ? " (nur auffällige)" : ""}` : ""}`,
    `- Startzahl ${e.seed}${e.uhrzeit ? ` · Uhrzeit ${e.uhrzeit}` : ""} · ${e.parallel} gleichzeitig · Dauer ${Math.round(lauf.dauerMs / 60000)} min${lauf.abgebrochen ? " · ABGEBROCHEN" : ""}`,
    "",
    "## Quoten",
    "",
    "| Bereich | Gespräche | Antworten | auffällige Antworten | je 100 Antworten | ohne Auffälligkeit | feste statt KI | nicht spielbar |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const [b, x] of [...Object.entries(s.bereiche), ["gesamt", s.gesamt]])
    z.push(`| ${BEREICHE[b] ?? "**gesamt**"} | ${x.gespraeche} | ${x.antworten} | ${x.auffaellig} | ${x.quote.toFixed(1)} | ${x.gespraeche ? Math.round((x.ohneAuff / x.gespraeche) * 100) : 0} % | ${x.fest} | ${x.fehler} |`);
  z.push("", "## Fehlerarten", "", "| Art | Anzahl | Gespräche | je Bereich |", "|---|---|---|---|");
  for (const a of s.arten) z.push(`| ${a.art} | ${a.n} | ${a.gespraeche} | ${Object.entries(a.je).map(([b, n]) => `${BEREICHE[b]} ${n}`).join(", ")} |`);
  const fehler = lauf.auftraege.filter((a) => a.fehler);
  if (fehler.length) {
    z.push("", "## Nicht spielbar", "");
    for (const a of fehler) z.push(`- ${a.key} (Startzahl ${a.seed}): ${a.fehler}`);
  }
  const seitenfehler = lauf.auftraege.filter((a) => a.seitenfehler?.length);
  if (seitenfehler.length) {
    z.push("", "## Programmfehler im Browser", "");
    for (const a of seitenfehler) z.push(`- ${a.key}: ${[...new Set(a.seitenfehler)].join(" | ")}`);
  }
  return z.join("\n");
}

export function vergleichMd(v) {
  const z = [`# Vergleich mit ${v.altName}`, "", `- Gesamt: ${v.gesamtText}`];
  for (const w of v.warnungen) z.push(`- Achtung: ${w}`);
  for (const [b, x] of Object.entries(v.bereiche)) z.push(`- ${BEREICHE[b]}: ${x.alt.toFixed(1)} → ${x.neu.toFixed(1)} (${x.urteil})`);
  z.push("", "| Fehlerart | vorher | jetzt | je 100 vorher | je 100 jetzt | Urteil |", "|---|---|---|---|---|---|");
  for (const a of v.arten) z.push(`| ${a.art} | ${a.nAlt} | ${a.nNeu} | ${a.alt.toFixed(2)} | ${a.neu.toFixed(2)} | ${a.urteil} |`);
  const geaendert = v.paare.filter((p) => p.weg.length || p.dazu.length);
  if (v.paare.length) {
    z.push("", `## Gleiche Gespräche (gleiche Startzahl): ${v.paare.length}, davon ${geaendert.length} verändert`, "");
    for (const p of geaendert) z.push(`- ${String(p.nr).padStart(3, "0")} ${p.name}: ${p.alt} → ${p.neu}${p.weg.length ? ` · weg: ${p.weg.join(", ")}` : ""}${p.dazu.length ? ` · neu: ${p.dazu.join(", ")}` : ""}`);
  }
  return z.join("\n");
}

// ------------------------------------------------------------------ Bericht-Seite

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "–");
const URTEIL_KLASSE = { besser: "gut", "eher besser": "gut-leicht", schlechter: "schlecht", "eher schlechter": "schlecht-leicht" };

export function berichtHtml(lauf, s, v) {
  const e = lauf.einstellungen;
  const titel = `Falltest ${lauf.erstellt.slice(0, 10)} · v${lauf.leitwerk.version}`;
  const kachel = (zahl, text, extra = "") => `<div class="kachel"><div class="zahl">${zahl}</div><div class="klein">${text}</div>${extra}</div>`;
  const urteil = (u) => `<span class="urteil ${URTEIL_KLASSE[u] ?? ""}">${esc(u)}</span>`;
  const maxArt = Math.max(1, ...s.arten.map((a) => a.n));

  const bereichZeilen = [...Object.entries(s.bereiche), ["gesamt", s.gesamt]]
    .map(([b, x]) => {
      const vb = b === "gesamt" ? v?.gesamt : v?.bereiche[b];
      return `<tr class="${b === "gesamt" ? "summe" : ""}"><td>${esc(BEREICHE[b] ?? "gesamt")}</td><td class="r">${x.gespraeche}</td><td class="r">${x.antworten}</td><td class="r">${x.auffaellig}</td><td class="r"><b>${f1(x.quote)}</b></td><td class="r">${x.gespraeche ? Math.round((x.ohneAuff / x.gespraeche) * 100) : 0} %</td><td class="r">${x.fest}</td><td class="r">${(mittel(x.antwortMs) / 1000).toFixed(1)} s</td><td class="r">${x.fehler || ""}</td>${v ? `<td class="r">${vb ? `${f1(vb.alt)} → ${f1(vb.neu)}` : "–"}</td><td>${vb ? urteil(vb.urteil) : ""}</td>` : ""}</tr>`;
    })
    .join("");

  const artZeilen = s.arten
    .map(
      (a, i) => `<tr class="art" data-art="${esc(a.art)}"><td><button class="link" data-filter="${esc(a.art)}">${esc(a.art)}</button></td><td class="r">${a.n}</td><td class="r">${a.gespraeche}</td><td><div class="balken"><span style="width:${(a.n / maxArt) * 100}%"></span></div></td><td class="klein">${Object.entries(a.je).map(([b, n]) => `${esc(BEREICHE[b])} ${n}`).join(" · ")}</td><td><button class="link" data-bsp="${i}">Beispiele</button></td></tr>
<tr class="bsp" id="bsp-${i}" hidden><td colspan="6">${a.beispiele.map((b) => `<div class="beispiel"><span class="nr">${String(b.nr).padStart(3, "0")}</span> ${esc(b.fall)} ${esc(b.variante)}${b.detail ? ` · <i>${esc(b.detail)}</i>` : ""}<br><span class="muted">auf „${esc(b.frage)}“</span><br>„${esc(b.antwort)}“</div>`).join("")}</td></tr>`,
    )
    .join("");

  const fallZeilen = s.faelle
    .map((f) => `<tr><td>${esc(BEREICHE[f.art])}</td><td>${esc(f.name)}</td><td>${esc(f.variante)}</td><td class="r">${f.laeufe}</td><td class="r">${f.antworten}</td><td class="r">${f.auff}</td><td class="r">${f1(f.antworten ? (f.auff / f.antworten) * 100 : 0)}</td><td class="klein">${Object.entries(f.arten).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${n}`).join(" · ")}</td></tr>`)
    .join("");

  const vergleichTeil = v
    ? `<section><h2>Vergleich mit ${esc(v.altName)}</h2>${v.warnungen.map((w) => `<p class="warn">Achtung: ${esc(w)}</p>`).join("")}
<p>Gesamt: <b>${esc(v.gesamtText)}</b>. „besser/schlechter“ heißt: Der Unterschied ist größer als der Zufall (z ≥ 2), „eher“ = Tendenz.</p>
<table><thead><tr><th>Fehlerart</th><th class="r">vorher</th><th class="r">jetzt</th><th class="r">je 100 vorher</th><th class="r">je 100 jetzt</th><th>Urteil</th></tr></thead><tbody>
${v.arten.map((a) => `<tr><td>${esc(a.art)}</td><td class="r">${a.nAlt}</td><td class="r">${a.nNeu}</td><td class="r">${a.alt.toFixed(2)}</td><td class="r">${a.neu.toFixed(2)}</td><td>${urteil(a.urteil)}</td></tr>`).join("")}
</tbody></table>
${v.paare.length ? `<details><summary>Gleiche Gespräche (gleiche Startzahl): ${v.paare.length}, davon ${v.paare.filter((p) => p.weg.length || p.dazu.length).length} verändert</summary><ul class="paare">${v.paare.filter((p) => p.weg.length || p.dazu.length).map((p) => `<li><span class="nr">${String(p.nr).padStart(3, "0")}</span> ${esc(p.name)}: ${p.alt} → ${p.neu}${p.weg.length ? ` <span class="gut">weg: ${esc(p.weg.join(", "))}</span>` : ""}${p.dazu.length ? ` <span class="schlecht">neu: ${esc(p.dazu.join(", "))}</span>` : ""}</li>`).join("")}</ul></details>` : ""}
</section>`
    : "";

  const gespraeche = lauf.auftraege.map((a) => ({
    nr: a.nr,
    art: a.art,
    name: a.durchlauf ? `${a.durchlauf.fallName}` : a.key,
    variante: a.durchlauf?.variante ?? a.variante,
    rolle: a.durchlauf?.rolle ?? "",
    arten: a.durchlauf ? [...new Set(a.durchlauf.auffaellig.map((x) => kategorie(x.grund).art))] : [],
    n: a.durchlauf?.auffaellig.length ?? 0,
    fehler: a.fehler ?? "",
    seed: a.seed,
    text: a.durchlauf?.text ?? `Nicht spielbar: ${a.fehler}`,
  }));

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titel)}</title>
<style>
:root{--bg:#f6f7f9;--karte:#fff;--text:#1c2430;--muted:#6a7482;--linie:#e2e6eb;--akzent:#c8102e;--gut:#1f8a4c;--schlecht:#c0392b;--balken:#c8102e33}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--karte:#1d2229;--text:#e7ebf0;--muted:#97a1ad;--linie:#2d343d;--akzent:#ff5a6e;--gut:#4cc985;--schlecht:#ff7466;--balken:#ff5a6e44}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 60px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 12px}
section{background:var(--karte);border:1px solid var(--linie);border-radius:12px;padding:16px 18px;margin:16px 0;overflow-x:auto}
.kacheln{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}.kachel{background:var(--karte);border:1px solid var(--linie);border-radius:12px;padding:12px 14px}
.zahl{font-size:26px;font-weight:650;font-variant-numeric:tabular-nums}.klein{font-size:12.5px;color:var(--muted)}.muted{color:var(--muted)}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{padding:6px 8px;border-bottom:1px solid var(--linie);text-align:left;vertical-align:top}th{font-size:12.5px;color:var(--muted);font-weight:600;cursor:default}
.r{text-align:right}tr.summe td{font-weight:650}.balken{background:var(--linie);height:8px;border-radius:4px;min-width:80px}.balken span{display:block;height:100%;background:var(--akzent);border-radius:4px}
button.link{background:none;border:0;color:var(--akzent);cursor:pointer;padding:0;font:inherit;text-align:left}.beispiel{padding:6px 0;border-bottom:1px dashed var(--linie);font-size:13.5px}
.nr{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted)}.warn{color:var(--schlecht)}.gut{color:var(--gut)}.schlecht{color:var(--schlecht)}
.urteil{font-size:12.5px;padding:1px 7px;border-radius:9px;background:var(--linie)}.urteil.gut{background:color-mix(in srgb,var(--gut) 20%,transparent);color:var(--gut)}.urteil.schlecht{background:color-mix(in srgb,var(--schlecht) 20%,transparent);color:var(--schlecht)}.urteil.gut-leicht{color:var(--gut)}.urteil.schlecht-leicht{color:var(--schlecht)}
.filter{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.filter input,.filter select{font:inherit;padding:6px 9px;border-radius:8px;border:1px solid var(--linie);background:var(--bg);color:var(--text)}.filter input{flex:1;min-width:180px}
details.gs{border-bottom:1px solid var(--linie)}details.gs summary{padding:7px 2px;cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline}details.gs summary::-webkit-details-marker{display:none}
.marke{font-size:12px;padding:1px 7px;border-radius:9px;background:var(--linie);white-space:nowrap}.marke.rot{background:color-mix(in srgb,var(--schlecht) 18%,transparent);color:var(--schlecht)}
pre{white-space:pre-wrap;font:12.5px/1.5 ui-monospace,Menlo,monospace;background:var(--bg);padding:12px;border-radius:8px;max-height:600px;overflow:auto}
ul.paare{padding-left:18px}ul.paare li{margin:3px 0}
</style></head><body><main>
<h1>${esc(titel)}</h1>
<div class="klein">KI ${esc(lauf.ki.modell)}${lauf.ki.test ? " (Test-KI)" : ""} · Schema ${esc(lauf.daten.schema)} · Funkgruppe ${esc(lauf.daten.funkgruppe ?? "Standard")} · Startzahl ${e.seed} · ${e.parallel} gleichzeitig${lauf.leitwerk.commit ? ` · Commit ${esc(lauf.leitwerk.commit)}${lauf.leitwerk.geaendert ? " (geändert)" : ""}` : ""}${lauf.abgebrochen ? ' · <b class="schlecht">abgebrochen</b>' : ""}</div>
<div class="kacheln">
${kachel(s.gesamt.gespraeche, "Gespräche")}
${kachel(f1(s.gesamt.quote), "auffällige je 100 Antworten", v ? `<div class="klein">vorher ${f1(v.gesamt.alt)} · ${urteil(v.gesamt.urteil)}</div>` : "")}
${kachel(`${s.gesamt.gespraeche ? Math.round((s.gesamt.ohneAuff / s.gesamt.gespraeche) * 100) : 0} %`, "Gespräche ganz ohne Auffälligkeit")}
${kachel(s.gesamt.fest, "feste Antwort statt KI")}
${kachel(`${Math.round(lauf.dauerMs / 60000)} min`, `Dauer · ${Math.round(s.proStunde)} Gespräche/h`)}
${kachel(`${(s.kiRechenMs / 1000).toFixed(1)} s`, `KI-Rechenzeit je Aufruf · ${lauf.ki.aufrufe} Aufrufe${lauf.ki.fehler ? `, ${lauf.ki.fehler} Fehler` : ""}`)}
</div>
${s.kiHinweis ? `<p class="warn">${esc(s.kiHinweis)}</p>` : ""}
<section><h2>Bereiche</h2><table><thead><tr><th>Bereich</th><th class="r">Gespräche</th><th class="r">Antworten</th><th class="r">auffällige Antworten</th><th class="r">je 100</th><th class="r">ohne Auffälligkeit</th><th class="r">fest statt KI</th><th class="r">Ø Antwort</th><th class="r">nicht spielbar</th>${v ? '<th class="r">je 100 vorher → jetzt</th><th>Urteil</th>' : ""}</tr></thead><tbody>${bereichZeilen}</tbody></table></section>
${vergleichTeil}
<section><h2>Fehlerarten</h2><p class="klein">Eine Antwort kann mehrere Fehlerarten haben. Klick auf eine Art zeigt unten nur die Gespräche damit.</p><table><thead><tr><th>Art</th><th class="r">Anzahl</th><th class="r">Gespräche</th><th></th><th>Bereiche</th><th></th></tr></thead><tbody>${artZeilen || '<tr><td colspan="6">keine</td></tr>'}</tbody></table></section>
<section><h2>Fälle</h2><p class="klein">Sortiert nach Auffälligkeiten je 100 Antworten.</p><table><thead><tr><th>Bereich</th><th>Fall</th><th>Ausgang</th><th class="r">Läufe</th><th class="r">Antworten</th><th class="r">auffällig</th><th class="r">je 100</th><th>Arten</th></tr></thead><tbody>${fallZeilen}</tbody></table></section>
<section id="gespraeche"><h2>Gespräche</h2>
<div class="filter"><input id="suche" placeholder="Suchen (Fall, Text, Antwort …)"><select id="art"><option value="">alle Fehlerarten</option>${s.arten.map((a) => `<option>${esc(a.art)}</option>`).join("")}<option value="__nicht">nicht spielbar</option></select><select id="ber"><option value="">alle Bereiche</option>${Object.keys(s.bereiche).map((b) => `<option value="${b}">${esc(BEREICHE[b])}</option>`).join("")}</select><select id="nur"><option value="">alle</option><option value="auff">nur auffällige</option><option value="ohne">nur ohne Auffälligkeit</option></select></div>
<div id="zahl" class="klein"></div><div id="liste"></div></section>
<p class="klein">Wiederholen mit denselben Gesprächen: <code>npm run falltest -- --wie ${esc(lauf.ordner ?? "letzter")}</code> · nur die auffälligen: <code>npm run falltest -- --nur-auffaellige ${esc(lauf.ordner ?? "letzter")}</code></p>
</main>
<script>
const G=${JSON.stringify(gespraeche).replace(/</g, "\\u003c")};
const B=${JSON.stringify(BEREICHE)};
const $=(s)=>document.querySelector(s);
const esc=(t)=>String(t).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
function zeigen(){const q=$("#suche").value.toLowerCase(),a=$("#art").value,b=$("#ber").value,n=$("#nur").value;
const l=G.filter(g=>(!b||g.art===b)&&(!a||(a==="__nicht"?g.fehler:g.arten.includes(a)))&&(!n||(n==="auff"?g.n>0:g.n===0&&!g.fehler))&&(!q||(g.name+" "+g.text).toLowerCase().includes(q)));
$("#zahl").textContent=l.length+" von "+G.length+" Gesprächen";
$("#liste").innerHTML=l.slice(0,400).map(g=>'<details class="gs"><summary><span class="nr">'+String(g.nr).padStart(3,"0")+'</span>'+(g.name===B[g.art]?'':'<span>'+esc(B[g.art])+'</span>')+'<b>'+esc(g.name)+'</b><span class="muted">'+esc(g.variante)+'</span>'+(g.fehler?'<span class="marke rot">nicht spielbar</span>':g.n?'<span class="marke rot">'+g.n+' auffällig</span>':'<span class="marke">ok</span>')+'<span class="klein">'+esc(g.arten.join(" · "))+'</span></summary><pre></pre></details>').join("")+(l.length>400?'<p class="klein">… nur die ersten 400 – bitte filtern</p>':"");
document.querySelectorAll("#liste details").forEach((d,i)=>d.addEventListener("toggle",()=>{const p=d.querySelector("pre");if(d.open&&!p.textContent)p.textContent=l[i].text;},{once:false}));}
["#suche","#art","#ber","#nur"].forEach(s=>$(s).addEventListener("input",zeigen));
document.querySelectorAll("[data-filter]").forEach(x=>x.addEventListener("click",()=>{$("#art").value=x.dataset.filter;zeigen();$("#gespraeche").scrollIntoView({behavior:"smooth"});}));
document.querySelectorAll("[data-bsp]").forEach(x=>x.addEventListener("click",()=>{const r=document.getElementById("bsp-"+x.dataset.bsp);r.hidden=!r.hidden;}));
zeigen();
</script></body></html>`;
}
