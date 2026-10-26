/**
 * Editor für KT-/SEK-Codes und die KT-Abfrage (v0.74): Codes frei benennen, Bedingungen wählen,
 * Fragen der Abfrage ein-/ausschalten und umformulieren. Die Prüfung läuft laufend mit:
 * Fehlt etwas fürs Spiel, lässt sich der Satz nur als Entwurf speichern.
 * Gespeichert wird als KT-/SEK-Satz (ab v0.76 getrennt vom RD): Codelisten/Krankentransport_Sekundärtransporte/<Name>.json
 * (Codes mit Bedingungen) und Abfrageschema/Krankentransport_Sekundärtransporte/<Name>.json (Fragen der KT-Hotline).
 */
import { ablageName, ablageSpeichern } from "../net/ablage";
import { KT_BED_KEYS, KT_BEDINGUNGEN, KT_INFOS, KT_KRITERIEN, artVon, bedText, klaertVon, pruefeKtSatz, type KtAbfrageFrage, type KtCodeBed, type KtCodeDef, type KtSatz } from "../sim/ktBedingungen";
import { ktSatz, standardKtAbfrage } from "../sim/ktCodes";
import { ORDNER, aktiverKtSatz, satzAktivieren, satzListe } from "./codesaetze";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

/** Editor öffnen – ohne Angabe für den aktiven Satz (beim eingebauten: als neuen eigenen Satz) */
export function ktEditorOeffnen(opt: { satz?: KtSatz; name?: string; fertig?: () => void } = {}): void {
  const quelle = opt.satz ?? ktSatz();
  const kt: { codes: KtCodeDef[]; abfrage: KtAbfrageFrage[] } = {
    codes: structuredClone(quelle.codes ?? []),
    abfrage: structuredClone(quelle.abfrage?.length ? quelle.abfrage : standardKtAbfrage()),
  };
  // ab v0.75: jede Frage sagt selbst, was sie klärt; ausgeschaltete Fragen (v0.74) fallen weg
  kt.abfrage = kt.abfrage.filter((f) => f.aktiv !== false).map((f) => ({ id: f.id, text: f.text, art: artVon(f), klaert: [...klaertVon(f)] }));
  let neueNr = 1;
  const neueId = () => {
    while (kt.abfrage.some((f) => f.id === `frage${neueNr}`)) neueNr++;
    return `frage${neueNr}`;
  };
  const eigenerName = opt.name ?? aktiverKtSatz();

  const body = el("div", { class: "kte" });
  const kopf = el("div", { class: "kte-kopf" });
  const nameIn = el("input", { type: "text", name: "satzname", placeholder: "Name des Codesatzes" }) as HTMLInputElement;
  nameIn.value = eigenerName ?? "Meine Transportcodes";
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

  let offeneFrage: number | null = null;
  function abfrageZeichnen(): void {
    inhalt.appendChild(
      el(
        "p",
        { class: "muted small" },
        "Diese Fragen stellt die KT-Hotline – in dieser Reihenfolge (🗨 in der Aufnahme). Bei jeder Frage wählst du, was sie klärt: „Code-bestimmend“ entscheidet mit über den Code (z. B. liegend, mit Notarzt), „Zusatzinfo“ hilft nur bei der Disposition (z. B. Name).",
      ),
    );
    const liste = el("div", { class: "kte-fragen" });
    const neu = (art: "code" | "info", nach: number) => {
      kt.abfrage.splice(nach + 1, 0, { id: neueId(), text: "", art, klaert: [] });
      offeneFrage = nach + 1;
      neuZeichnen();
    };
    const neuZeichnen = () => {
      inhalt.innerHTML = "";
      abfrageZeichnen();
      pruefen();
    };
    kt.abfrage.forEach((f, i) => {
      const art = artVon(f);
      const z = el("div", { class: `kte-frage ${art}`, "data-frage": f.id });
      // Reihenfolge
      const pfeile = el("div", { class: "kte-pfeile" });
      for (const [sym, d, tip] of [
        ["↑", -1, "nach oben"],
        ["↓", 1, "nach unten"],
      ] as const) {
        const b = el("button", { class: "btn small icon", type: "button", title: tip, "data-frage-act": d < 0 ? "hoch" : "runter" }, sym) as HTMLButtonElement;
        b.disabled = i + d < 0 || i + d >= kt.abfrage.length;
        b.addEventListener("click", () => {
          const [x] = kt.abfrage.splice(i, 1);
          kt.abfrage.splice(i + d, 0, x);
          if (offeneFrage === i) offeneFrage = i + d;
          neuZeichnen();
        });
        pfeile.appendChild(b);
      }
      // ziehen
      z.draggable = true;
      z.addEventListener("dragstart", (e) => e.dataTransfer?.setData("text/plain", String(i)));
      z.addEventListener("dragover", (e) => e.preventDefault());
      z.addEventListener("drop", (e) => {
        e.preventDefault();
        const von = Number(e.dataTransfer?.getData("text/plain"));
        if (!Number.isInteger(von) || von === i) return;
        const [x] = kt.abfrage.splice(von, 1);
        kt.abfrage.splice(i, 0, x);
        neuZeichnen();
      });
      const nr = el("span", { class: "kte-nr" }, `${i + 1}.`);
      const t = el("input", { type: "text", name: `frage-text-${f.id}`, placeholder: "Wortlaut der Frage …" }) as HTMLInputElement;
      t.value = f.text;
      t.addEventListener("input", () => (f.text = t.value));
      t.addEventListener("change", () => pruefen());
      const chip = el("span", { class: `kte-art ${art}` }, art === "code" ? "Code-bestimmend" : "Zusatzinfo");
      const liste2 = (art === "code" ? KT_KRITERIEN : KT_INFOS) as Record<string, string>;
      const kurz = klaertVon(f)
        .map((k) => (KT_KRITERIEN[k] ?? KT_INFOS[k] ?? k).split(" (")[0])
        .join(", ");
      const zusammen = el("span", { class: `muted small kte-klaert${kurz ? "" : " fehlt"}` }, kurz ? `klärt: ${kurz}` : "klärt: – bitte wählen");
      const bearb = el("button", { class: "btn small icon", type: "button", title: "Bearbeiten", "data-frage-act": "bearbeiten" }, "✎");
      bearb.addEventListener("click", () => {
        offeneFrage = offeneFrage === i ? null : i;
        neuZeichnen();
      });
      const weg = el("button", { class: "btn small icon", type: "button", title: "Frage löschen", "data-frage-act": "loeschen" }, "✕");
      weg.addEventListener("click", () => {
        kt.abfrage.splice(i, 1);
        offeneFrage = null;
        neuZeichnen();
      });
      const zeile1 = el("div", { class: "kte-frage-z" });
      zeile1.append(pfeile, nr, t, chip, bearb, weg);
      z.append(zeile1, zusammen);
      if (offeneFrage === i) {
        const box = el("div", { class: "kte-frage-detail" });
        // Art
        const artWahl = el("div", { class: "kt-seg" });
        for (const [a, l] of [
          ["code", "Code-bestimmend"],
          ["info", "Zusatzinfo"],
        ] as const) {
          const b = el("button", { class: `kt-seg-b${art === a ? " active" : ""}`, type: "button", "data-frage-art": a }, l);
          b.addEventListener("click", () => {
            if (art === a) return;
            f.art = a;
            f.klaert = [];
            neuZeichnen();
          });
          artWahl.appendChild(b);
        }
        box.append(el("div", { class: "small" }, "Art der Frage"), artWahl, el("div", { class: "small" }, art === "code" ? "Welche Kriterien beantwortet die Frage?" : "Welche Angaben liefert die Frage?"));
        const haken = el("div", { class: "kte-haken" });
        for (const [k, l] of Object.entries(liste2)) {
          const lab = el("label", { class: "chk" });
          const c = el("input", { type: "checkbox", name: `klaert-${k}` }) as HTMLInputElement;
          c.checked = klaertVon(f).includes(k);
          c.addEventListener("change", () => {
            const s = new Set(klaertVon(f));
            if (c.checked) s.add(k);
            else s.delete(k);
            f.klaert = Object.keys(liste2).filter((x) => s.has(x));
            neuZeichnen();
          });
          lab.append(c, el("span", {}, l));
          haken.appendChild(lab);
        }
        box.appendChild(haken);
        z.appendChild(box);
      }
      liste.appendChild(z);
    });
    inhalt.appendChild(liste);
    const plus = el("div", { class: "row-btns" });
    const pc = el("button", { class: "btn small", type: "button", "data-frage-neu": "code" }, "+ Code-bestimmende Frage");
    pc.addEventListener("click", () => neu("code", offeneFrage ?? kt.abfrage.length - 1));
    const pi = el("button", { class: "btn small", type: "button", "data-frage-neu": "info" }, "+ Zusatzinfo-Frage");
    pi.addEventListener("click", () => neu("info", offeneFrage ?? kt.abfrage.length - 1));
    plus.append(pc, pi);
    inhalt.appendChild(plus);
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
    const name = ablageName(nameIn.value.trim() || "Meine Transportcodes");
    if (/^LeitWerk-Codesystem$/i.test(name)) {
      toast("Bitte einen eigenen Namen wählen – das eingebaute System bleibt unverändert", "error");
      return false;
    }
    const r = pruefen();
    if (!entwurf && r.fehler.length) return false;
    const vorhanden = (await satzListe("kt")).find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (vorhanden && vorhanden.name.toLowerCase() !== (eigenerName ?? "").toLowerCase() && !(await confirmDialog("Satz ersetzen?", `Es gibt schon einen Satz „${vorhanden.name}“.`, "Ersetzen"))) return false;
    const e = entwurf ? { entwurf: true } : {};
    await ablageSpeichern(ORDNER.kt.codes, `${name}.json`, JSON.stringify({ ...e, codes: kt.codes.filter((c) => c.code || c.name) }));
    await ablageSpeichern(ORDNER.kt.abfrage, `${name}.json`, JSON.stringify({ ...e, abfrage: kt.abfrage }));
    if (entwurf) toast(`Entwurf „${name}“ gespeichert – ${r.fehler.length} Problem${r.fehler.length === 1 ? "" : "e"} offen`);
    else {
      const satz = (await satzListe("kt")).find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (satz)
        await satzAktivieren(satz).catch((err) => {
          toast(String((err as Error).message ?? err), "error");
        });
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
