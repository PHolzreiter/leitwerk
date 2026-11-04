/** Einstellungen → Anrufe & KI: welche KI die Anrufer spielt (Gemini oder lokal), Einrichtung, Ollama, allgemeine Anruf-Optionen. */
import { anrufKiModus, kiRegel, livePrefs, prefsHoerer, schluesselGeprueft, setLivePrefs } from "../../abfrage/liveKi";
import { mp } from "../../net/mehrspieler";
import { anrufKiWaehlen, geminiAnleitung, schluesselFeld } from "../anrufKi";
import { el } from "../dom";
import { buildKiAllgemein, buildKiLokal } from "../kiView";

export function anrufKiView(container: HTMLElement): { refresh(): void } {
  function render(): void {
    container.innerHTML = "";
    const page = el("div", { class: "settings" });
    container.appendChild(page);
    const section = (title: string, hint?: string) => {
      const s = el("section", { class: "set-sec" });
      s.appendChild(el("h3", {}, title));
      if (hint) s.appendChild(el("p", { class: "muted" }, hint));
      page.appendChild(s);
      return s;
    };
    const modus = anrufKiModus();
    const regel = kiRegel();
    const vomHost = mp.aktiv && regel !== "frei";

    // ---- Wahl
    const w = section("Anrufer-KI", "Wer spielt die Anrufer am Telefon? Gilt nur für dich auf diesem Rechner – außer der Host legt es im Mehrspieler für alle fest. Fällt Gemini aus, springt automatisch die lokale KI ein (bzw. einfache Antworten, wenn keine da ist).");
    const seg = el("div", { class: "seg ki-modus-wahl" });
    for (const [v, label] of [
      ["gemini", "Gemini (Cloud, kostenlos)"],
      ["lokal", "Lokal (Ollama)"],
    ] as const) {
      const b = el("button", { type: "button", class: v === modus ? "active" : "" }, label);
      b.disabled = vomHost;
      b.addEventListener("click", () => void anrufKiWaehlen(v).then(render));
      seg.appendChild(b);
    }
    w.appendChild(seg);
    const info = el("p", { class: "small" });
    if (vomHost) info.textContent = `Der Host hat für dieses Spiel „${regel === "gemini" ? "alle Gemini" : "alle lokal"}“ festgelegt.`;
    else if (modus === "gemini") info.textContent = schluesselGeprueft() ? "Gemini ist eingerichtet. Die Anrufer reden mit natürlicher Stimme." : "Gemini ist gewählt, der Schlüssel ist aber noch nicht geprüft – unten einrichten.";
    else info.textContent = "Die Anrufer spielt die KI auf diesem Rechner (unten Modell wählen und laden).";
    w.appendChild(info);

    // ---- Gemini
    const g = section("Gemini (Cloud)", "Gemini Live von Google spielt die Anrufer – mit eigener Stimme, die zur Stimmung passt. Deine gesprochenen Fragen hört Gemini direkt.");
    if (modus !== "gemini") g.classList.add("ki-aus");
    g.appendChild(geminiAnleitung());
    g.appendChild(
      schluesselFeld(() => {
        if (!vomHost) setLivePrefs({ an: true });
      }),
    );
    const lp = livePrefs();
    const grid = el("div", { class: "set-grid" });
    const chk = (label: string, title: string, wert: boolean, fn: (v: boolean) => void) => {
      const c = el("input", { type: "checkbox" }) as HTMLInputElement;
      c.checked = wert;
      c.addEventListener("change", () => fn(c.checked));
      grid.append(el("label", { title }, label), c);
    };
    chk("Freisprechen (ohne Sprechtaste)", "Das Mikrofon läuft während des Anrufs; der Anrufer erkennt selbst, wann du fertig bist, und du kannst ihm ins Wort fallen. Am besten mit Kopfhörern – sonst hört er sich selbst aus den Lautsprechern.", lp.freisprechen, (v) => setLivePrefs({ freisprechen: v }));
    chk("Telefonklang und Geräusche vom Notfallort", "Die Stimme klingt wie durchs Telefon, dazu leise Verkehr, Stimmen im Lokal, Wind …", lp.klang, (v) => setLivePrefs({ klang: v }));
    chk("Funk: Gemini versteht den Funk (Test)", "Was du am Funk sagst, versteht Gemini statt der Spracherkennung hier: Es kennt alle Fahrzeuge und das laufende Gespräch und schreibt Rufnamen richtig. Braucht Internet, ca. 1–2 Sekunden nach dem Loslassen.", !!lp.funkVersteher, (v) => setLivePrefs({ funkVersteher: v }));
    g.appendChild(grid);
    g.appendChild(
      el(
        "p",
        { class: "small muted" },
        "Funk: Mit Gemini sprechen auch die Fahrzeuge – jedes mit eigener Stimme, neu verteilt bei jedem Schichtwechsel (RTW, NEF und Hubschrauber in der Nähe klingen verschieden). Den Inhalt bestimmt das Programm, Gemini formuliert ihn. Im Mehrspieler hören alle die Stimme von dem, der das Gespräch führt. Ist hier kein Sprachmodell geladen, schreibt Gemini auch deinen Funk mit.",
      ),
    );

    // ---- Lokal
    const l = section("Lokale KI (Ollama)", "Läuft auf diesem Rechner – ohne Internet, ohne Konto. Je stärker der Rechner, desto natürlicher die Gespräche. Auch Ersatz, wenn Gemini nicht erreichbar ist.");
    if (modus !== "lokal") l.classList.add("ki-aus");
    buildKiLokal(l);
    if (modus !== "lokal") {
      // als Ersatz trotzdem einrichtbar
      const auf = el("button", { class: "btn small", type: "button" }, "Lokale KI als Ersatz einrichten …");
      auf.addEventListener("click", () => {
        l.classList.remove("ki-aus");
        auf.remove();
      });
      g.appendChild(el("p", { class: "small muted" }, "Ersatz, wenn Gemini nicht erreichbar ist:"));
      g.appendChild(auf);
    }

    // ---- Allgemein
    buildKiAllgemein(section("Anrufe und Funk", "Gilt für beide KIs."));
  }
  render();
  const aus = () => {
    if (!container.isConnected) return;
    // nur neu zeichnen, wenn sich die Wahl geändert hat (sonst verliert das Schlüsselfeld den Fokus)
    if (container.dataset.modus !== anrufKiModus()) render();
    container.dataset.modus = anrufKiModus();
  };
  container.dataset.modus = anrufKiModus();
  prefsHoerer.add(aus);
  return { refresh: render };
}
