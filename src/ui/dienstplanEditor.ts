/**
 * Dienstplan bearbeiten: Schichten mit Wochentagen (einzeln oder Schnellwahl Mo–Fr / Sa / So / täglich),
 * Beginn und Ende (Uhrzeit oder Sonnenaufgang/-untergang). Ohne Schicht = rund um die Uhr.
 */
import { ALLE_TAGE, MODELLE_24_7, TAG_KURZ, WERKTAGE, plan247, planKurz, zeitLesen, type Schicht } from "../sim/dienst";
import { wocheHtml } from "./dienstWoche";
import { el } from "./dom";

export function dienstplanEditor(start: Schicht[] | undefined, ort?: { lat: number; lon: number }): { root: HTMLElement; wert(): Schicht[] } {
  // „rund um die Uhr“ (leerer Plan) als zwei echte Schichten zeigen – so lassen sich auch dort Tage wählen
  const STANDARD = plan247(["07:00", "19:00"]);
  let plan: Schicht[] = start?.length ? structuredClone(start) : structuredClone(STANDARD);
  const root = el("div", { class: "dp-editor" });
  const liste = el("div", { class: "dp-liste" });
  const zusammen = el("div", { class: "dp-zusammen muted small" });
  const neu = el("button", { class: "btn small", type: "button" }, "+ Schicht");
  const vorlagen = el("div", { class: "dp-vorlagen" });
  const unten = el("div", { class: "dp-unten" });
  const woche = el("div", { class: "dp-woche" });
  unten.append(neu);
  root.append(vorlagen, liste, unten, zusammen, woche);

  // häufige Dienstpläne mit einem Klick
  vorlagen.appendChild(el("span", { class: "muted small" }, "24/7:"));
  const VORL: [string, Schicht[]][] = [
    ...MODELLE_24_7.map((m): [string, Schicht[]] => [m.name, plan247(m.wechsel)]),
  ];
  const knopf = (label: string, p: Schicht[], titel: string) => {
    const b = el("button", { class: "btn small", type: "button", title: titel }, label);
    b.addEventListener("click", () => {
      plan = structuredClone(p);
      zeichnen();
    });
    vorlagen.appendChild(b);
  };
  for (const [label, p] of VORL) knopf(label, p, "Rund um die Uhr, ein Team je Schicht");
  // frei wählbare Wechselzeiten
  const frei = el("button", { class: "btn small", type: "button", title: "Rund um die Uhr mit eigenen Wechselzeiten" }, "eigene Wechselzeiten …");
  const freiFeld = el("input", { type: "text", class: "dp-frei", placeholder: "z. B. 06:00, 14:00, 22:00", hidden: "" }) as HTMLInputElement;
  frei.addEventListener("click", () => {
    freiFeld.hidden = false;
    freiFeld.focus();
  });
  freiFeld.addEventListener("change", () => {
    const z = freiFeld.value.split(/[,;+\s]+/).filter(Boolean).map(zeitLesen);
    if (!z.length || z.some((x) => !x || x === "SA" || x === "SU")) {
      freiFeld.classList.add("ungueltig");
      return;
    }
    freiFeld.classList.remove("ungueltig");
    plan = plan247(z as string[]);
    zeichnen();
  });
  vorlagen.append(frei, freiFeld, el("span", { class: "muted small" }, " · sonst:"));
  knopf("Tag Mo–Fr 07–19", [{ tage: [...WERKTAGE], von: "07:00", bis: "19:00" }], "nur werktags tagsüber");
  knopf("Hell (Sonnenauf- bis -untergang)", [{ tage: [...ALLE_TAGE], von: "SA", bis: "SU" }], "z. B. Hubschrauber ohne Nachtflug");
  neu.addEventListener("click", () => {
    const letzte = plan[plan.length - 1];
    plan.push(letzte ? { tage: [...letzte.tage], von: letzte.bis === "SU" || letzte.bis === "SA" ? "07:00" : letzte.bis, bis: "19:00" } : { tage: [...WERKTAGE], von: "07:00", bis: "19:00" });
    zeichnen();
  });

  const zeitFeld = (wert: string, setze: (v: string) => void): HTMLElement => {
    const w = el("span", { class: "dp-zeit" });
    const art = el("select", { title: "Uhrzeit oder Sonnenauf-/-untergang" });
    for (const [v, l] of [["uhr", "Uhr"], ["SA", "☀ Aufgang"], ["SU", "☀ Untergang"]]) art.appendChild(el("option", { value: v }, l));
    // Textfeld statt Uhrzeit-Feld: immer 24 Stunden, egal welche Spracheinstellung
    const uhr = el("input", { type: "text", inputmode: "numeric", maxlength: "5", placeholder: "07:00" }) as HTMLInputElement;
    const sonne = wert === "SA" || wert === "SU";
    art.value = sonne ? wert : "uhr";
    uhr.value = sonne ? "07:00" : wert;
    uhr.hidden = sonne;
    art.addEventListener("change", () => {
      uhr.hidden = art.value !== "uhr";
      setze(art.value === "uhr" ? zeitLesen(uhr.value) ?? "07:00" : art.value);
    });
    uhr.addEventListener("change", () => {
      const z = zeitLesen(uhr.value);
      uhr.classList.toggle("ungueltig", !z);
      if (z) {
        uhr.value = z;
        setze(z);
      }
    });
    w.append(art, uhr);
    return w;
  };

  function zeichnen(): void {
    liste.innerHTML = "";
    if (!plan.length) liste.appendChild(el("div", { class: "dp-leer muted" }, "Keine Schichten: rund um die Uhr im Dienst (zwei Teams, Wechsel um 07:00 und 19:00)."));
    plan.forEach((s, i) => {
      const z = el("div", { class: "dp-zeile" });
      const tage = el("span", { class: "dp-tage" });
      ALLE_TAGE.forEach((d) => {
        const b = el("button", { type: "button", class: `dp-tag${s.tage.includes(d) ? " an" : ""}`, title: "Tag an/aus" }, TAG_KURZ[d - 1]);
        b.addEventListener("click", () => {
          s.tage = s.tage.includes(d) ? s.tage.filter((x) => x !== d) : [...s.tage, d].sort((a, b) => a - b);
          zeichnen();
        });
        tage.appendChild(b);
      });
      const schnell = el("select", { class: "dp-schnell", title: "Schnellwahl" });
      for (const [v, l] of [["", "…"], ["w", "Mo–Fr"], ["sa", "Sa"], ["so", "So"], ["we", "Sa + So"], ["alle", "täglich"]]) schnell.appendChild(el("option", { value: v }, l));
      schnell.addEventListener("change", () => {
        const m: Record<string, number[]> = { w: [...WERKTAGE], sa: [6], so: [7], we: [6, 7], alle: [...ALLE_TAGE] };
        if (m[schnell.value]) s.tage = m[schnell.value];
        zeichnen();
      });
      const weg = el("button", { class: "btn small danger-text", type: "button", title: "Schicht löschen" }, "×");
      weg.addEventListener("click", () => {
        plan.splice(i, 1);
        zeichnen();
      });
      z.append(
        tage,
        schnell,
        zeitFeld(s.von, (v) => {
          s.von = v;
          info();
        }),
        el("span", { class: "muted" }, "bis"),
        zeitFeld(s.bis, (v) => {
          s.bis = v;
          info();
        }),
        weg,
      );
      if (!s.tage.length) z.appendChild(el("span", { class: "alert-text small" }, "kein Tag gewählt"));
      liste.appendChild(z);
    });
    info();
  }
  function info(): void {
    const p = plan.filter((s) => s.tage.length);
    zusammen.textContent = `Dienstplan: ${planKurz(p)}. Endet eine Schicht nach Mitternacht, zählt sie zum Tag, an dem sie beginnt.`;
    woche.innerHTML = wocheHtml(p, ort);
  }
  zeichnen();
  return {
    root,
    wert: () => {
      // Kalenderwoche und Monate (aus den Daten) bleiben erhalten
      const p = plan.filter((s) => s.tage.length).map((s) => ({ tage: [...s.tage], von: s.von, bis: s.bis, ...(s.kw ? { kw: s.kw } : {}), ...(s.monate?.length ? { monate: [...s.monate] } : {}) }));
      // genau der Standard → leer speichern (= rund um die Uhr)
      return JSON.stringify(p) === JSON.stringify(STANDARD) ? [] : p;
    },
  };
}
