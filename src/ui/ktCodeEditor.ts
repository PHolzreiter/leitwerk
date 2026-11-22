/**
 * Editor für KT-/SEK-Codes (v0.74; ab Beta 70 nur noch die Codes – die Fragen der KT-Hotline sind immer die eingebauten):
 * Codes frei benennen, Bedingungen wählen. Die Prüfung läuft laufend mit: Fehlt etwas fürs Spiel, lässt sich die Datei
 * nur als Entwurf speichern. Gespeichert wird als eine Datei: Codelisten/Krankentransport_Sekundärtransporte/<Name>.json.
 */
import { ablageName, ablageSpeichern } from "../net/ablage";
import { KT_BED_KEYS, KT_BEDINGUNGEN, bedText, pruefeKtSatz, type KtCodeBed, type KtCodeDef, type KtSatz } from "../sim/ktBedingungen";
import { ktSatz, standardKtAbfrage } from "../sim/ktCodes";
import { ORDNER, aktivDatei, teilAktivieren, teilListe } from "./codesaetze";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

/** Editor öffnen – ohne Angabe für den aktiven Satz (beim eingebauten: als neuen eigenen Satz) */
export function ktEditorOeffnen(opt: { satz?: KtSatz; name?: string; fertig?: () => void } = {}): void {
  const quelle = opt.satz ?? ktSatz();
  const kt: { codes: KtCodeDef[] } = { codes: structuredClone(quelle.codes ?? []) };
  const aktiv = aktivDatei("ktsek");
  const eigenerName = opt.name ?? (aktiv ? aktiv.replace(/\.json$/i, "") : null);

  const body = el("div", { class: "kte" });
  const kopf = el("div", { class: "kte-kopf" });
  const nameIn = el("input", { type: "text", name: "satzname", placeholder: "Name der Datei" }) as HTMLInputElement;
  nameIn.value = eigenerName ?? "Meine KT-SEK-Codes";
  const nameFeld = el("label", { class: "fld" });
  nameFeld.append(el("span", { class: "fld-label" }, "Name der Datei"), nameIn);
  kopf.appendChild(nameFeld);
  const pruef = el("div", { class: "kte-pruefung" });
  const reiter = el("div", { class: "mh-reiter" });
  const inhalt = el("div", { class: "kte-inhalt" });
  body.append(kopf, pruef, reiter, inhalt);
  let suche = "";
  let bearbeitet: number | null = null;

  const pruefen = () => {
    const r = pruefeKtSatz({ codes: kt.codes }, standardKtAbfrage());
    pruef.innerHTML = "";
    const kopfz = el("div", { class: `kte-status ${r.fehler.length ? "fehler" : "ok"}` });
    kopfz.textContent = r.fehler.length
      ? `${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"} – so nur als Entwurf speicherbar`
      : `Alles vollständig: jede mögliche Kombination hat genau einen Code (${kt.codes.length} Codes)`;
    pruef.appendChild(kopfz);
    if (r.fehler.length || r.hinweise.length) {
      const ul = el("ul", { class: "kte-liste" });
      let nr = 0;
      r.fehler.forEach((t) => {
        const li = el("li", { class: "fehler" }, t);
        const b = t.startsWith("Kein Code für") ? r.fehlend[nr++] : undefined;
        if (b) {
          const neu = el("button", { class: "btn small", type: "button" }, "Code anlegen");
          neu.addEventListener("click", () => neuerCode(b));
          li.appendChild(neu);
        }
        ul.appendChild(li);
      });
      for (const h of r.hinweise) ul.appendChild(el("li", { class: "hinweis" }, h));
      pruef.appendChild(ul);
    }
    dlg?.setActionEnabled(2, r.fehler.length === 0);
    return r;
  };

  const neuerCode = (bed: KtCodeBed = {}) => {
    kt.codes.unshift({ code: "", name: "", kapitel: "", bed: { ...bed } });
    bearbeitet = 0;
    suche = "";
    zeichnen();
  };

  function codesZeichnen(): void {
    const leiste = el("div", { class: "kte-leiste" });
    const s = el("input", { type: "search", placeholder: "Codes durchsuchen …", class: "kte-suche" }) as HTMLInputElement;
    s.value = suche;
    s.addEventListener("input", () => {
      suche = s.value;
      liste();
    });
    const neu = el("button", { class: "btn small primary", type: "button" }, "+ Neuer Code");
    neu.addEventListener("click", () => neuerCode());
    leiste.append(s, neu);
    const tab_ = el("div", { class: "kte-codes" });
    inhalt.append(leiste, tab_);
    const liste = () => {
      tab_.innerHTML = "";
      const q = suche.trim().toLowerCase();
      kt.codes.forEach((c, i) => {
        if (q && !`${c.code} ${c.name} ${bedText(c.bed)}`.toLowerCase().includes(q) && bearbeitet !== i) return;
        tab_.appendChild(i === bearbeitet ? formular(c, i) : zeile(c, i));
      });
      if (!tab_.childElementCount) tab_.appendChild(el("p", { class: "muted" }, "Keine Codes gefunden."));
    };
    const zeile = (c: KtCodeDef, i: number) => {
      const z = el("div", { class: "kte-zeile" });
      z.innerHTML = `<b class="kte-code">${esc(c.code || "(ohne Namen)")}</b><span class="kte-name">${esc(c.name)}</span><span class="muted small kte-bed">${esc(bedText(c.bed))}</span>`;
      const k = el("div", { class: "row-btns" });
      const ed = el("button", { class: "btn small", type: "button", title: "Bearbeiten" }, "✎");
      ed.addEventListener("click", () => {
        bearbeitet = i;
        liste();
      });
      const kopie = el("button", { class: "btn small", type: "button", title: "Kopieren" }, "⧉");
      kopie.addEventListener("click", () => {
        kt.codes.splice(i + 1, 0, { ...structuredClone(c), code: `${c.code}-Kopie` });
        bearbeitet = i + 1;
        pruefen();
        liste();
      });
      const weg = el("button", { class: "btn small danger-text", type: "button", title: "Löschen" }, "✕");
      weg.addEventListener("click", () => {
        kt.codes.splice(i, 1);
        bearbeitet = null;
        pruefen();
        liste();
      });
      k.append(ed, kopie, weg);
      z.appendChild(k);
      return z;
    };
    const formular = (c: KtCodeDef, i: number) => {
      const f = el("div", { class: "kte-form" });
      const grid = el("div", { class: "form-grid" });
      const feld = (label: string, input: HTMLElement) => {
        const w = el("label", { class: "fld" });
        w.append(el("span", { class: "fld-label" }, label), input);
        grid.appendChild(w);
      };
      const code = el("input", { type: "text", name: "code", placeholder: "z. B. KTR-90T3" }) as HTMLInputElement;
      code.value = c.code;
      code.addEventListener("input", () => {
        c.code = code.value.trim();
        pruefen();
      });
      const name = el("input", { type: "text", name: "name", placeholder: "Bezeichnung" }) as HTMLInputElement;
      name.value = c.name;
      name.addEventListener("input", () => (c.name = name.value));
      const kap = el("input", { type: "text", name: "kapitel", placeholder: "Gruppe in der Auswahl (optional)" }) as HTMLInputElement;
      kap.value = c.kapitel ?? "";
      kap.addEventListener("input", () => (c.kapitel = kap.value));
      feld("Code *", code);
      feld("Bezeichnung", name);
      feld("Gruppe", kap);
      for (const k of KT_BED_KEYS) {
        const sel = el("select", { name: `bed-${k}` }) as HTMLSelectElement;
        sel.appendChild(el("option", { value: "" }, k === "fahrt" ? "– bitte wählen –" : "beliebig"));
        for (const [v, l] of Object.entries(KT_BEDINGUNGEN[k].werte)) sel.appendChild(el("option", { value: v }, l as string));
        sel.value = (c.bed[k] as string | undefined) ?? "";
        sel.addEventListener("change", () => {
          if (sel.value) (c.bed as Record<string, string>)[k] = sel.value;
          else delete c.bed[k];
          pruefen();
        });
        feld(KT_BEDINGUNGEN[k].label + (k === "fahrt" ? " *" : ""), sel);
      }
      f.appendChild(grid);
      const fertig = el("button", { class: "btn small primary", type: "button" }, "Fertig");
      fertig.addEventListener("click", () => {
        bearbeitet = null;
        liste();
      });
      f.appendChild(fertig);
      void i;
      return f;
    };
    liste();
  }

  function zeichnen(): void {
    reiter.innerHTML = "";
    reiter.appendChild(el("p", { class: "muted small" }, `${kt.codes.length} Codes · die Fragen der KT-Hotline sind die eingebauten`));
    inhalt.innerHTML = "";
    codesZeichnen();
    pruefen();
  }

  const speichern = async (entwurf: boolean): Promise<boolean> => {
    const name = ablageName(nameIn.value.trim() || "Meine KT-SEK-Codes");
    if (/^LeitWerk/i.test(name)) {
      toast("Bitte einen eigenen Namen wählen – die eingebauten Codes bleiben unverändert", "error");
      return false;
    }
    const r = pruefen();
    if (!entwurf && r.fehler.length) return false;
    const vorhanden = (await teilListe("ktsek")).find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (vorhanden && vorhanden.name.toLowerCase() !== (eigenerName ?? "").toLowerCase() && !(await confirmDialog("Datei ersetzen?", `Es gibt schon eine Datei „${vorhanden.name}“.`, "Ersetzen"))) return false;
    const e = entwurf ? { entwurf: true } : {};
    await ablageSpeichern(ORDNER.kt.codes, `${name}.json`, JSON.stringify({ ...e, codes: kt.codes.filter((c) => c.code || c.name) }));
    if (entwurf) toast(`Entwurf „${name}“ gespeichert – ${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"} offen`);
    else
      await teilAktivieren("ktsek", `${name}.json`)
        .then((t) => toast(t))
        .catch((err) => toast(String((err as Error).message ?? err), "error"));
    opt.fertig?.();
    return true;
  };

  const dlg = openDialog({
    title: "KT/SEK-Codes bearbeiten",
    body,
    wide: true,
    actions: [
      { label: "Abbrechen" },
      { label: "Als Entwurf speichern", onClick: () => speichern(true) },
      { label: "Speichern & verwenden", kind: "primary", onClick: () => speichern(false) },
    ],
  });
  dlg.root.parentElement?.classList.add("kte-dlg");
  zeichnen();
}
