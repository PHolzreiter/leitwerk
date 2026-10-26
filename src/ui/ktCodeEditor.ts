/**
 * Editor für KT-/SEK-Codes und die KT-Abfrage (v0.74): Codes frei benennen, Bedingungen wählen,
 * Fragen der Abfrage ein-/ausschalten und umformulieren. Die Prüfung läuft laufend mit:
 * Fehlt etwas fürs Spiel, lässt sich der Satz nur als Entwurf speichern.
 * Gespeichert wird als Codesatz (Dokumente/LeitWerk/Abfrageschema/<Name>.json, mit den RD-Codes des Ausgangssatzes).
 */
import type { Schema } from "../abfrage/schema";
import { KT_FRAGEN } from "../abfrage/ktGespraech";
import { store } from "../data/store";
import { standardCodesystem } from "../data/standard";
import { ablageName, ablageSpeichern } from "../net/ablage";
import { FRAGE_KLAERT, KT_BED_KEYS, KT_BEDINGUNGEN, PFLICHT_FRAGEN, bedText, pruefeKtSatz, type KtAbfrageFrage, type KtCodeBed, type KtCodeDef, type KtSatz } from "../sim/ktBedingungen";
import { ktSatz, standardKtAbfrage } from "../sim/ktCodes";
import { aktiverSatz, satzAktivieren, satzListe } from "./codesaetze";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

type Datei = Schema & { kt?: KtSatz; entwurf?: boolean };

/** Editor öffnen – ohne Angabe für den aktiven Satz (beim eingebauten: als neuen eigenen Satz) */
export function ktEditorOeffnen(opt: { datei?: Datei; name?: string; fertig?: () => void } = {}): void {
  const basis: Datei = structuredClone(opt.datei ?? ((store.schemaRoh ?? standardCodesystem()) as Datei));
  const quelle = opt.datei?.kt ?? ktSatz();
  const kt: { codes: KtCodeDef[]; abfrage: KtAbfrageFrage[] } = {
    codes: structuredClone(quelle.codes ?? []),
    abfrage: structuredClone(quelle.abfrage?.length ? quelle.abfrage : standardKtAbfrage()),
  };
  // Fragen, die es in der Aufnahme gibt, aber im Satz noch fehlen: ausgeschaltet ergänzen
  for (const f of KT_FRAGEN) if (!kt.abfrage.some((x) => x.id === f.id)) kt.abfrage.push({ id: f.id, text: f.text, aktiv: false });
  const eigenerName = opt.name ?? aktiverSatz();

  const body = el("div", { class: "kte" });
  const kopf = el("div", { class: "kte-kopf" });
  const nameIn = el("input", { type: "text", name: "satzname", placeholder: "Name des Codesatzes" }) as HTMLInputElement;
  nameIn.value = eigenerName ?? "Mein Codesatz";
  const nameFeld = el("label", { class: "fld" });
  nameFeld.append(el("span", { class: "fld-label" }, "Name des Codesatzes"), nameIn);
  kopf.appendChild(nameFeld);
  const pruef = el("div", { class: "kte-pruefung" });
  const reiter = el("div", { class: "mh-reiter" });
  const inhalt = el("div", { class: "kte-inhalt" });
  body.append(kopf, pruef, reiter, inhalt);
  let tab: "codes" | "abfrage" = "codes";
  let suche = "";
  let bearbeitet: number | null = null;

  const pruefen = () => {
    const r = pruefeKtSatz(kt, standardKtAbfrage());
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
    tab = "codes";
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

  function abfrageZeichnen(): void {
    inhalt.appendChild(
      el("p", { class: "muted small" }, "Diese Fragen stellt die KT-Hotline (🗨 in der Aufnahme). Ausgeschaltete Fragen gibt es im Gespräch nicht – was sie klären würden, gilt dann mit dem Standardwert."),
    );
    for (const f of kt.abfrage) {
      const z = el("div", { class: "kte-frage" });
      const an = el("input", { type: "checkbox", name: `frage-${f.id}` }) as HTMLInputElement;
      an.checked = f.aktiv !== false;
      an.addEventListener("change", () => {
        f.aktiv = an.checked;
        pruefen();
      });
      const t = el("input", { type: "text", value: f.text }) as HTMLInputElement;
      t.value = f.text;
      t.addEventListener("input", () => (f.text = t.value));
      const klaert = (FRAGE_KLAERT[f.id] ?? []).map((k) => KT_BEDINGUNGEN[k].label);
      const info = el("span", { class: "muted small" }, klaert.length ? `klärt: ${klaert.join(", ")}` : PFLICHT_FRAGEN.includes(f.id) ? "nötig fürs Spiel" : "Info für die Disposition");
      z.append(an, t, info);
      inhalt.appendChild(z);
    }
  }

  function zeichnen(): void {
    reiter.innerHTML = "";
    for (const [r, l] of [
      ["codes", `Codes (${kt.codes.length})`],
      ["abfrage", "Abfrage"],
    ] as const) {
      const b = el("button", { class: `mh-reiter-b${tab === r ? " aktiv" : ""}`, type: "button", "data-kte": r }, l);
      b.addEventListener("click", () => {
        tab = r;
        zeichnen();
      });
      reiter.appendChild(b);
    }
    inhalt.innerHTML = "";
    if (tab === "codes") codesZeichnen();
    else abfrageZeichnen();
    pruefen();
  }

  const speichern = async (entwurf: boolean): Promise<boolean> => {
    const name = ablageName(nameIn.value.trim() || "Mein Codesatz");
    if (/^LeitWerk-Codesystem$/i.test(name)) {
      toast("Bitte einen eigenen Namen wählen – das eingebaute System bleibt unverändert", "error");
      return false;
    }
    const r = pruefen();
    if (!entwurf && r.fehler.length) return false;
    const vorhanden = (await satzListe()).find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (vorhanden && vorhanden.name.toLowerCase() !== (eigenerName ?? "").toLowerCase() && !(await confirmDialog("Satz ersetzen?", `Es gibt schon einen Satz „${vorhanden.name}“.`, "Ersetzen"))) return false;
    const datei: Datei = { ...basis, kt: { codes: kt.codes.filter((c) => c.code || c.name), abfrage: kt.abfrage } };
    if (datei.name === "LeitWerk-Codesystem") datei.name = name;
    if (entwurf) datei.entwurf = true;
    else delete datei.entwurf;
    await ablageSpeichern("Abfrageschema", `${name}.json`, JSON.stringify(datei));
    if (entwurf) toast(`Entwurf „${name}“ gespeichert – ${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"} offen`);
    else {
      const satz = (await satzListe()).find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (satz) await satzAktivieren(satz);
    }
    opt.fertig?.();
    return true;
  };

  const dlg = openDialog({
    title: "KT-/SEK-Codes & Abfrage bearbeiten",
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
