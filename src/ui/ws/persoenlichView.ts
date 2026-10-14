/** Einstellungen → Persönlich: Aussehen, Größe, Anrufe, Töne, Kurzbefehle, Statusfarben, Anordnungen. */
import { kiPrefs, setKiPrefs } from "../../abfrage/ki";
import { pickTextFile, saveTextFile } from "../../platform";
import { sim } from "../../sim/engine";
import type { StatusKey } from "../../sim/settings";
import { confirmDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import {
  anordnungAnwenden,
  anordnungen,
  anordnungEinsammeln,
  anordnungImportieren,
  anordnungLoeschen,
  anordnungZuruecksetzen,
  onPanelsGeaendert,
} from "./arbeitsplatz";
import { IST_HAUPT } from "./bus";
import { tasteAufnehmen, tasteText } from "./kuerzel";
import { KUERZEL_LABEL, KUERZEL_STANDARD, onPers, pers, setzePers, type KuerzelId, type Thema } from "./persoenlich";

const STATUS: StatusKey[] = ["freiWache", "freiFunk", "alarmiert", "zumBO", "amBO", "zumZO", "amZO", "dienstfahrt", "bereitschaft", "abgemeldet"];

export function persoenlichView(container: HTMLElement): { refresh(): void } {
  function render(): void {
    const p = pers();
    container.innerHTML = "";
    const page = el("div", { class: "settings" });
    container.appendChild(page);
    page.appendChild(el("div", { class: "set-hinweis" }, "Diese Einstellungen gelten nur für dich auf diesem Rechner – auch im Multiplayer."));
    const section = (title: string, hint?: string) => {
      const s = el("section", { class: "set-sec" });
      s.appendChild(el("h3", {}, title));
      if (hint) s.appendChild(el("p", { class: "muted" }, hint));
      page.appendChild(s);
      return s;
    };
    const zeile = (sec: HTMLElement, label: string, feld: HTMLElement, hilfe?: string) => {
      const r = el("div", { class: "pers-zeile" });
      const l = el("div", { class: "pers-label" });
      l.appendChild(el("div", {}, label));
      if (hilfe) l.appendChild(el("div", { class: "muted small" }, hilfe));
      r.append(l, feld);
      sec.appendChild(r);
    };
    const seg = <T extends string>(werte: [T, string][], aktuell: T, onSet: (v: T) => void) => {
      const s = el("div", { class: "seg" });
      for (const [v, label] of werte) {
        const b = el("button", { type: "button", class: v === aktuell ? "active" : "" }, label);
        b.addEventListener("click", () => onSet(v));
        s.appendChild(b);
      }
      return s;
    };
    const schalter = (wert: boolean, onSet: (v: boolean) => void) => {
      const l = el("label", { class: "schalter" });
      const c = el("input", { type: "checkbox" });
      c.checked = wert;
      c.addEventListener("change", () => onSet(c.checked));
      l.append(c, el("span", { class: "schalter-knopf" }));
      return l;
    };

    // ---- Aussehen
    const a = section("Aussehen");
    zeile(
      a,
      "Farbschema",
      seg<Thema>(
        [
          ["hell", "☀ Hell"],
          ["dunkel", "☾ Dunkel"],
          ["system", "Wie das System"],
        ],
        p.thema,
        (v) => setzePers({ thema: v }),
      ),
    );
    zeile(
      a,
      "Karte",
      seg<"auto" | "hell">(
        [
          ["auto", "passt sich an"],
          ["hell", "immer hell"],
        ],
        p.karte,
        (v) => setzePers({ karte: v }),
      ),
      "Im dunklen Farbschema wird die Karte dunkel – oder sie bleibt hell.",
    );
    const groesse = el("div", { class: "pers-slider" });
    const slider = el("input", { type: "range", min: "75", max: "150", step: "5" });
    slider.value = String(p.skalierung);
    const wert = el("span", { class: "pers-wert" }, `${p.skalierung} %`);
    slider.addEventListener("input", () => (wert.textContent = `${slider.value} %`));
    slider.addEventListener("change", () => setzePers({ skalierung: Number(slider.value) }));
    const std = el("button", { class: "btn small" }, "100 %");
    std.addEventListener("click", () => setzePers({ skalierung: 100 }));
    groesse.append(slider, wert, std);
    zeile(a, "Größe der Oberfläche", groesse, "Schrift, Knöpfe und Abstände – praktisch für große oder kleine Bildschirme.");
    zeile(a, "Bewegungen", schalter(p.animationen, (v) => setzePers({ animationen: v })), "Weiche Übergänge beim Öffnen und Wechseln.");

    // ---- Anrufe und Töne
    const t = section("Anrufe und Töne", "Wer keine Notrufe annimmt, bekommt kein Klingeln und kein automatisch geöffnetes Telefon (z. B. als reiner Funk- oder KT-Disponent).");
    zeile(t, "Ich nehme Notrufe an", schalter(p.notrufe, (v) => setzePers({ notrufe: v })));
    zeile(t, "Ich nehme die KT-Hotline an", schalter(p.ktHotline, (v) => setzePers({ ktHotline: v })));
    zeile(t, "Klingelton", schalter(kiPrefs().klingelton, (v) => setKiPrefs({ klingelton: v })));
    const laut = el("div", { class: "pers-slider" });
    const lautS = el("input", { type: "range", min: "0", max: "100", step: "5" });
    lautS.value = String(p.lautstaerke);
    const lautW = el("span", { class: "pers-wert" }, `${p.lautstaerke} %`);
    lautS.addEventListener("input", () => (lautW.textContent = `${lautS.value} %`));
    lautS.addEventListener("change", () => setzePers({ lautstaerke: Number(lautS.value) }));
    laut.append(lautS, lautW);
    zeile(t, "Lautstärke", laut);
    zeile(t, "Funk-Piep, wenn ein Fahrzeug ruft", schalter(p.funkTon, (v) => setzePers({ funkTon: v })));

    // ---- Kurzbefehle
    const k = section("Tastenkürzel", "Auf ein Kürzel klicken und dann die gewünschte Taste drücken.");
    const kGrid = el("div", { class: "kuerzel-grid" });
    for (const [id, label] of Object.entries(KUERZEL_LABEL) as [KuerzelId, string][]) {
      const b = el("button", { class: "btn small kuerzel-taste", type: "button" }, p.kuerzel[id] ? tasteText(p.kuerzel[id]) : "–");
      b.addEventListener("click", () => {
        b.textContent = "Taste drücken …";
        b.classList.add("wartet");
        tasteAufnehmen((taste) => {
          const neu = { ...pers().kuerzel };
          // gleiche Taste woanders entfernen
          for (const x of Object.keys(neu) as KuerzelId[]) if (neu[x] === taste) neu[x] = "";
          neu[id] = taste === "Backspace" || taste === "Delete" ? "" : taste;
          setzePers({ kuerzel: neu });
        });
      });
      kGrid.append(el("span", {}, label), b);
    }
    const kReset = el("button", { class: "btn small" }, "Standard-Tasten");
    kReset.addEventListener("click", () => setzePers({ kuerzel: { ...KUERZEL_STANDARD } }));
    k.append(kGrid, el("div", { class: "muted small" }, "Entfernen: Kürzel anklicken und Entf drücken."), kReset);

    // ---- Statusfarben
    const s = section("Eigene Statusfarben", "Nur für deine Anzeige. Die Status selbst (Nummer, Bedeutung) legt die Leitstelle bzw. der Host fest.");
    const sGrid = el("div", { class: "status-farben" });
    for (const key of STATUS) {
      const d = sim.statusDef(key);
      const c = el("input", { type: "color" });
      c.value = d.farbe.length === 7 ? d.farbe : "#888888";
      c.addEventListener("change", () => setzePers({ statusFarben: { ...pers().statusFarben, [key]: c.value } }));
      const r = el("label", { class: "status-farbe" });
      r.append(c, el("span", {}, `${d.nummer} – ${d.name}`));
      if (p.statusFarben[key]) r.appendChild(el("span", { class: "muted small" }, "(eigene)"));
      sGrid.appendChild(r);
    }
    const sReset = el("button", { class: "btn small" }, "Farben der Leitstelle verwenden");
    sReset.addEventListener("click", () => setzePers({ statusFarben: {} }));
    s.append(sGrid, sReset);

    // ---- Anordnungen
    const o = section("Arbeitsplatz", "Die Anordnung der Fenster wird automatisch gemerkt. Eigene Anordnungen kannst du oben unter „Anordnung“ speichern.");
    const liste = el("div", { class: "anordnung-liste" });
    const zeigen = () => {
      liste.innerHTML = "";
      const l = anordnungen();
      if (!l.length) liste.appendChild(el("div", { class: "muted" }, "Noch keine eigenen Anordnungen gespeichert."));
      for (const x of l) {
        const r = el("div", { class: "anordnung-zeile" });
        r.innerHTML = `<b>${esc(x.name)}</b><span class="muted">${x.fenster.length ? `+ ${x.fenster.length} weitere${x.fenster.length > 1 ? "" : "s"} Fenster` : ""}</span>`;
        const laden = el("button", { class: "btn small" }, "Laden");
        laden.addEventListener("click", () => void anordnungAnwenden(x));
        laden.disabled = !IST_HAUPT;
        const exp = el("button", { class: "btn small" }, "Als Datei …");
        exp.addEventListener("click", () => void saveTextFile(`leitwerk-anordnung-${x.name}.json`, JSON.stringify(x, null, 1), { name: "Anordnung", extensions: ["json"] }));
        const weg = el("button", { class: "btn small danger-text" }, "Löschen");
        weg.addEventListener("click", async () => {
          if (await confirmDialog("Anordnung löschen", `„${x.name}“ löschen?`, "Löschen", true)) anordnungLoeschen(x.name);
        });
        r.append(laden, exp, weg);
        liste.appendChild(r);
      }
    };
    zeigen();
    const knoepfe = el("div", { class: "row-btns" });
    const imp = el("button", { class: "btn small" }, "Anordnung aus Datei …");
    imp.addEventListener("click", async () => {
      const f = await pickTextFile(".json");
      if (!f) return;
      try {
        const a2 = anordnungImportieren(f.text);
        toast(`Anordnung „${a2.name}“ übernommen`);
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
      }
    });
    const jetzt = el("button", { class: "btn small" }, "Jetzige Anordnung als Datei …");
    jetzt.addEventListener("click", async () => {
      const a2 = await anordnungEinsammeln("Meine Anordnung");
      await saveTextFile("leitwerk-anordnung.json", JSON.stringify(a2, null, 1), { name: "Anordnung", extensions: ["json"] });
    });
    const reset = el("button", { class: "btn small danger-text" }, "Anordnung zurücksetzen");
    reset.addEventListener("click", async () => {
      if (await confirmDialog("Anordnung zurücksetzen", "Alle Fenster wieder wie beim ersten Start anordnen?", "Zurücksetzen", true)) anordnungZuruecksetzen();
    });
    reset.disabled = !IST_HAUPT;
    knoepfe.append(imp, jetzt, reset);
    o.append(liste, knoepfe);
    const p2 = section("Einführung");
    const intro = el("button", { class: "btn small" }, "Hinweise zum Arbeitsplatz wieder zeigen");
    intro.addEventListener("click", () => setzePers({ einfuehrung: false }));
    p2.appendChild(intro);
  }

  onPers(() => render());
  onPanelsGeaendert(() => render());
  render();
  return { refresh: render };
}
