/**
 * Dienstplan bearbeiten: Schichten mit Wochentagen (einzeln oder Schnellwahl Mo–Fr / Sa / So / täglich),
 * Beginn und Ende (Uhrzeit oder Sonnenaufgang/-untergang). Ohne Schicht = rund um die Uhr.
 */
import { ALLE_TAGE, TAG_KURZ, WERKTAGE, planKurz, zeitLesen, type Schicht } from "../sim/dienst";
import { el } from "./dom";

export function dienstplanEditor(start: Schicht[] | undefined): { root: HTMLElement; wert(): Schicht[] } {
  let plan: Schicht[] = structuredClone(start ?? []);
  const root = el("div", { class: "dp-editor" });
  const liste = el("div", { class: "dp-liste" });
  const zusammen = el("div", { class: "dp-zusammen muted small" });
  const neu = el("button", { class: "btn small", type: "button" }, "+ Schicht");
  const vorlagen = el("div", { class: "dp-vorlagen" });
  const unten = el("div", { class: "dp-unten" });
  unten.append(neu, vorlagen);
  root.append(liste, unten, zusammen);

  // häufige Dienstpläne mit einem Klick
  const VORL: [string, Schicht[]][] = [
    ["rund um die Uhr", []],
    ["Tag Mo–Fr 07–19", [{ tage: [...WERKTAGE], von: "07:00", bis: "19:00" }]],
    ["Tag + Nacht täglich", [{ tage: [...ALLE_TAGE], von: "07:00", bis: "19:00" }, { tage: [...ALLE_TAGE], von: "19:00", bis: "07:00" }]],
    ["Hell (Sonnenauf- bis -untergang)", [{ tage: [...ALLE_TAGE], von: "SA", bis: "SU" }]],
  ];
  for (const [label, p] of VORL) {
    const b = el("button", { class: "btn small", type: "button" }, label);
    b.addEventListener("click", () => {
      plan = structuredClone(p);
      zeichnen();
    });
    vorlagen.appendChild(b);
  }
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
    zusammen.textContent = `Dienstplan: ${planKurz(plan.filter((s) => s.tage.length))}. Endet eine Schicht nach Mitternacht, zählt sie zum Tag, an dem sie beginnt.`;
  }
  zeichnen();
  return { root, wert: () => plan.filter((s) => s.tage.length).map((s) => ({ tage: [...s.tage], von: s.von, bis: s.bis })) };
}
