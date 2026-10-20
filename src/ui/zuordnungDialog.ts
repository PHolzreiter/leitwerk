/**
 * Zuordnung eines Codesystems zu den neutralen Merkmalen von LeitWerk ansehen und ausbessern.
 * Die Änderungen landen als „merkmal“/„merkmal_wert“ in der geladenen Datei (gehen beim Speichern mit).
 */
import { KEIN_MERKMAL, KERN_MERKMALE, merkmalListe, type Zuordnung } from "../abfrage/normalisieren";
import type { Frage, Schema } from "../abfrage/schema";
import { standardCodesystem } from "../data/standard";
import { store } from "../data/store";
import { sim } from "../sim/engine";
import { kiBereit, kiStatus } from "../abfrage/ki";
import { kiVorschlag, vorschlagEintragen } from "../abfrage/zuordnungKi";
import { stufeRaten } from "../sim/settings";
import { inTauri } from "../platform";
import { openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

const QUELLE: Record<Zuordnung["quelle"], string> = {
  explizit: "von Hand",
  gleich: "gleiche ID",
  automatisch: "automatisch",
  keine: "–",
};

/** Kurzfassung für die Leiste über der Codeliste */
export function zuordnungKurz(): string {
  if (store.schemaIstStandard) return "";
  const u = store.uebersetzung;
  const n = u.zuordnung.length;
  const mit = u.zuordnung.filter((z) => z.merkmal || z.teile).length;
  const auto = u.zuordnung.filter((z) => z.quelle === "automatisch").length;
  const fehlt = u.fehlend.length ? ` · <span class="warn-text">fehlt: ${esc(u.fehlend.join(", "))}</span>` : "";
  return u.kompatibel
    ? `Verwendet die LeitWerk-Merkmale (${mit} von ${n} Fragen)${fehlt}`
    : `Übersetzt auf die LeitWerk-Merkmale: ${mit} von ${n} Fragen zugeordnet (${auto} automatisch)${fehlt}`;
}

/** Alle Fragen des geladenen Codesystems (Rohdatei) mit dieser ID */
function fragenMitId(s: Schema, id: string): Frage[] {
  return [...Object.values(s.globale_fragen ?? {}).flat(), ...Object.values(s.kapitel ?? {}).flatMap((k) => k.fragen ?? [])].filter((f) => f.id === id);
}

export function zuordnungDialog(): void {
  const roh = store.schemaRoh;
  if (!roh) return;
  const merkmale = merkmalListe(standardCodesystem());
  const body = el("div", { class: "zuo" });
  const info = el("p", { class: "muted small" });
  info.innerHTML =
    "Innen arbeitet LeitWerk mit festen Merkmalen (z. B. Bewusstsein ja / getrübt / nein). Hier steht, welche Frage deines Codesystems welchem Merkmal entspricht – davon hängen Anrufer, Lage vor Ort und die Fälle ab. Automatische Zuordnungen bitte prüfen; was du änderst, wird in deinem Codesystem gespeichert.";
  const filterWrap = el("label", { class: "chk small" });
  const nurOffen = el("input", { type: "checkbox" }) as HTMLInputElement;
  filterWrap.append(nurOffen, " nur automatische und fehlende anzeigen");
  const tab = el("table", { class: "zuo-tab" });
  const kiZeile = el("div", { class: "zuo-ki" });
  const kiBtn = el("button", { class: "btn small" }, "KI-Vorschläge für offene und unsichere Fragen") as HTMLButtonElement;
  const kiInfo = el("span", { class: "muted small" });
  kiZeile.append(kiBtn, kiInfo);
  body.append(info, kiZeile, filterWrap, tab);
  kiBtn.addEventListener("click", async () => {
    if (!kiBereit() && inTauri()) await kiStatus().catch(() => null);
    if (!kiBereit()) {
      toast("Die KI läuft nicht (Einstellungen → KI-Anrufer)", "error");
      return;
    }
    const u = store.uebersetzung;
    const offen = u.zuordnung.filter((z) => (!z.merkmal && !z.teile && z.quelle !== "explizit") || (z.quelle === "automatisch" && z.sicherheit < 0.7));
    if (!offen.length) {
      toast("Keine offenen oder unsicheren Fragen");
      return;
    }
    kiBtn.disabled = true;
    const s = ausDatei();
    let n = 0;
    let ok = 0;
    for (const z of offen) {
      kiInfo.textContent = ` ${++n} von ${offen.length} …`;
      const f = fragenMitId(s, z.frage)[0];
      if (!f) continue;
      const titel = z.wo === "global" ? "Primärabfrage" : (s.kapitel[z.wo]?.titel ?? z.wo);
      try {
        const v = await kiVorschlag(f, titel, standardCodesystem());
        if (v) {
          vorschlagEintragen(s, z.frage, v);
          ok++;
        }
      } catch (e) {
        console.warn("KI-Zuordnung", e);
      }
    }
    kiBtn.disabled = false;
    kiInfo.textContent = ` ${ok} von ${offen.length} Vorschlägen übernommen – bitte prüfen (Quelle „KI“)`;
    speichern(s);
  });

  const ausDatei = (): Schema => structuredClone(store.schemaRoh!);
  const speichern = (s: Schema) => {
    store.setSchema(s);
    zeichne();
  };

  const zeichne = () => {
    const u = store.uebersetzung;
    const stufen = stufenText();
    tab.innerHTML = `<thead><tr><th>Frage in deinem Codesystem</th><th>Merkmal</th><th>Antworten</th><th>Quelle</th></tr></thead>`;
    const tb = el("tbody");
    tab.appendChild(tb);
    const kern = new Set(KERN_MERKMALE);
    const liste = [...u.zuordnung].sort((a, b) => Number(kern.has(b.merkmal ?? "")) - Number(kern.has(a.merkmal ?? "")) || (a.wo === "global" ? -1 : 0) - (b.wo === "global" ? -1 : 0));
    for (const z of liste) {
      if (nurOffen.checked && z.quelle !== "automatisch" && z.merkmal) continue;
      const tr = el("tr", { class: z.merkmal ? (z.quelle === "automatisch" && z.sicherheit < 0.7 ? "zuo-unsicher" : "") : "zuo-offen" });
      tr.appendChild(el("td", {}, `${z.text}${z.wo === "global" ? "" : ` (Kap. ${z.wo})`}`));
      // Merkmal wählen
      const sel = el("select", { class: "zuo-sel" }) as HTMLSelectElement;
      sel.appendChild(new Option("– kein Merkmal –", KEIN_MERKMAL));
      for (const m of merkmale) sel.appendChild(new Option(`${m.id} – ${m.text}`, m.id));
      sel.value = z.merkmal ?? KEIN_MERKMAL;
      sel.addEventListener("change", () => {
        const s = ausDatei();
        for (const f of fragenMitId(s, z.frage)) {
          const x = f as Frage & { merkmal?: string };
          x.merkmal = sel.value;
          for (const o of f.optionen ?? []) delete (o as { merkmal_wert?: string }).merkmal_wert;
        }
        speichern(s);
      });
      const tdM = el("td");
      tdM.appendChild(sel);
      if (z.teile) {
        sel.value = KEIN_MERKMAL;
        tdM.appendChild(el("div", { class: "small" }, `zusammengesetzt: ${z.teile.map((t) => t.merkmal).join(" oder ")}`));
      }
      if (z.umgekehrt) tdM.appendChild(el("div", { class: "muted small" }, z.gedreht ? "umgedreht gefragt (aus den Regeln erkannt)" : "umgedreht gefragt"));
      tr.appendChild(tdM);
      // Antworten
      const tdW = el("td", { class: "small" });
      const m = merkmale.find((x) => x.id === z.merkmal);
      const f0 = fragenMitId(roh, z.frage)[0];
      if (m && m.werte.length && f0?.optionen?.length) {
        for (const o of f0.optionen) {
          const zeile = el("div", { class: "zuo-wert" });
          const ws = el("select") as HTMLSelectElement;
          ws.appendChild(new Option("–", ""));
          for (const w of m.werte) ws.appendChild(new Option(w.label, w.wert));
          ws.value = z.werte[o.wert] ?? (z.quelle === "gleich" && m.werte.some((w) => w.wert === o.wert) ? o.wert : "");
          ws.addEventListener("change", () => {
            const s = ausDatei();
            for (const f of fragenMitId(s, z.frage)) {
              const x = f as Frage & { merkmal?: string };
              x.merkmal ??= z.merkmal!;
              // bisherige (auch automatische) Zuordnung der anderen Antworten übernehmen
              for (const oo of f.optionen ?? []) {
                const ow = oo as { wert: string; merkmal_wert?: string };
                if (ow.wert === o.wert) ow.merkmal_wert = ws.value || undefined;
                else if (ow.merkmal_wert === undefined && z.werte[ow.wert]) ow.merkmal_wert = z.werte[ow.wert];
              }
            }
            speichern(s);
          });
          zeile.append(el("span", {}, `${o.label} → `), ws);
          tdW.appendChild(zeile);
        }
      } else if (z.teile) {
        tdW.textContent = `„Ja“, wenn ${z.teile.map((t) => `${t.merkmal} = ${t.ja.join("/")}`).join(" oder ")}`;
      } else tdW.textContent = f0?.typ === "zahl" ? "Zahl" : "";
      tr.appendChild(tdW);
      tr.appendChild(el("td", { class: "small" }, `${z.ki ? "KI-Vorschlag" : QUELLE[z.quelle]}${z.quelle === "automatisch" ? ` (${Math.round(z.sicherheit * 100)} %)` : ""}`));
      tb.appendChild(tr);
    }
    stufenBox.innerHTML = stufen;
  };
  const stufenBox = el("div", { class: "zuo-stufen small" });
  body.appendChild(stufenBox);
  nurOffen.addEventListener("change", zeichne);
  zeichne();
  openDialog({ title: "Zuordnung zu den LeitWerk-Merkmalen", body, wide: true, actions: [{ label: "Fertig", kind: "primary", onClick: () => toast("Zuordnung gespeichert") }] });
}

/** Einsatzstufen des Codesystems, die nicht in den Einstellungen stehen (nach dem Namen eingeordnet) */
function stufenText(): string {
  const s = store.schema;
  if (!s) return "";
  const bekannt = new Set(store.settings.stufen.map((x) => x.stufe));
  const offen = [...new Set(Object.values(s.codes).map((c) => c.kategorie).filter((k) => k && !bekannt.has(k)))];
  if (!offen.length) return "";
  const zeilen = offen.map((k) => {
    const d = sim.stufeDef(k);
    const na = d?.notarzt === "nein" ? "" : ", Notarzt";
    const woher = stufeRaten(k) ? "nach dem Namen" : "nach dem Aufbau";
    return `<li><b>${esc(k)}</b> → ${d?.kategorie ?? "?"}${d?.sondersignal ? ", mit Sondersignal" : ""}${na}, ${esc(d?.rettungsmittel || "kein Fahrzeug")} <span class="muted">(${woher})</span></li>`;
  });
  return `<div class="cs-titel">Einsatzstufen, die nicht in den Einstellungen stehen – eingeordnet nach Name bzw. Aufbau des Codesystems (ändern unter Einstellungen → Rettungsmittel je Stufe):</div><ul class="cs-liste">${zeilen.join("")}</ul>`;
}
