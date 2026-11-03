/**
 * Anrufe & KI: Wahl zwischen lokaler KI (Ollama) und Gemini (Cloud), Einrichtung von Gemini mit Anleitung,
 * Frage beim ersten Start und die Regel des Hosts im Mehrspieler (alle Gemini / alle lokal / frei).
 */
import { anrufKiModus, kiRegel, kurz, livePrefs, liveTesten, schluesselDa, schluesselGeprueft, setLivePrefs } from "../abfrage/liveKi";
import { mp } from "../net/mehrspieler";
import { store } from "../data/store";
import { openDialog, type DialogHandle } from "./dialog";
import { el, toast } from "./dom";

/** Schritt-für-Schritt-Anleitung für den kostenlosen Gemini-Schlüssel */
export function geminiAnleitung(): HTMLElement {
  const box = el("div", { class: "gemini-anleitung" });
  const ol = el("ol");
  const schritte: [string, string][] = [
    ["Google AI Studio öffnen", "Im Browser aistudio.google.com aufrufen und mit einem Google-Konto anmelden (z. B. deinem Gmail-Konto). Beim ersten Mal die Nutzungsbedingungen bestätigen."],
    ["Schlüssel erstellen", "Links auf „API-Schlüssel“ (bzw. „Get API key“), dann „API-Schlüssel erstellen“. Fragt Google nach einem Projekt, das vorgeschlagene nehmen."],
    ["Kopieren", "Den Schlüssel kopieren – eine lange Zeichenkette aus Buchstaben und Zahlen."],
    ["Hier einfügen und testen", "Unten einfügen und „Testen“ drücken. Kommt ein Häkchen, ist alles bereit."],
  ];
  for (const [t, x] of schritte) {
    const li = el("li");
    li.append(el("b", {}, t), el("div", { class: "muted small" }, x));
    ol.appendChild(li);
  }
  box.appendChild(ol);
  box.appendChild(
    el(
      "p",
      { class: "small muted" },
      "Kostenlos: Ohne „Abrechnung einrichten“ in AI Studio kann nichts kosten. Im Gratis-Zugang darf Google die Gespräche zum Verbessern verwenden. Der Schlüssel bleibt nur auf diesem Rechner und wird nur an Google geschickt – gib ihn nicht weiter.",
    ),
  );
  return box;
}

/** Feld für den Schlüssel mit Test; meldet Erfolg */
export function schluesselFeld(onOk?: () => void): HTMLElement {
  const box = el("div", { class: "gemini-schluessel" });
  const zeile = el("div", { class: "row-btns" });
  const feld = el("input", { type: "password", placeholder: "Schlüssel aus AI Studio einfügen", autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
  feld.value = livePrefs().schluessel;
  feld.style.flex = "1";
  feld.style.minWidth = "16em";
  const zeigen = el("button", { class: "btn small", type: "button", title: "Schlüssel anzeigen" }, "👁");
  zeigen.addEventListener("click", () => (feld.type = feld.type === "password" ? "text" : "password"));
  const test = el("button", { class: "btn small primary", type: "button" }, "Testen");
  const erg = el("div", { class: "small" });
  const stand = () => {
    erg.className = "small";
    if (schluesselGeprueft() && kurz(feld.value) === livePrefs().geprueft) {
      erg.textContent = "✓ Schlüssel geprüft – Gemini ist bereit";
      erg.classList.add("ok-text");
    } else erg.textContent = feld.value.trim() ? "Noch nicht getestet." : "";
  };
  stand();
  feld.addEventListener("change", () => {
    setLivePrefs({ schluessel: feld.value.trim() });
    stand();
  });
  test.addEventListener("click", async () => {
    const k = feld.value.trim();
    if (k.length < 20) {
      erg.textContent = "✗ Das sieht nicht nach einem Schlüssel aus – bitte ganz kopieren.";
      return;
    }
    setLivePrefs({ schluessel: k });
    test.disabled = true;
    erg.className = "small";
    erg.textContent = "Verbinde mit Gemini …";
    try {
      const r = await liveTesten();
      erg.textContent = `✓ ${r}`;
      erg.classList.add("ok-text");
      onOk?.();
    } catch (err) {
      erg.textContent = `✗ ${(err as Error).message ?? err}`;
      erg.classList.add("danger-text");
    } finally {
      test.disabled = false;
    }
  });
  zeile.append(feld, zeigen, test);
  box.append(zeile, erg);
  return box;
}

let offen: DialogHandle | null = null;

/** Gemini einrichten (Anleitung, Schlüssel, Test). pflicht: der Host verlangt Gemini – ohne Schlüssel kein Mitspielen */
export function geminiEinrichten(opt: { pflicht?: boolean } = {}): Promise<boolean> {
  if (offen) offen.close();
  return new Promise((resolve) => {
    let ok = false;
    const body = el("div");
    if (opt.pflicht)
      body.appendChild(el("p", { class: "warn-text" }, "Der Host verlangt in diesem Spiel Gemini für alle Mitspieler. Richte bitte deinen eigenen, kostenlosen Schlüssel ein – erst dann kannst du mitspielen."));
    else body.appendChild(el("p", {}, "Mit Gemini reden die Anrufer mit natürlicher Stimme und verstehen dich besser. Dafür brauchst du einmal einen kostenlosen Schlüssel von Google:"));
    body.appendChild(geminiAnleitung());
    const d = openDialog({
      title: "Gemini einrichten",
      body,
      wide: true,
      actions: opt.pflicht
        ? [
            {
              label: "Spiel verlassen",
              kind: "danger",
              onClick: () => {
                mp.verlassen();
              },
            },
            { label: "Weiter", kind: "primary", onClick: () => (ok ? undefined : (toast("Bitte zuerst den Schlüssel testen", "error"), false)) },
          ]
        : [{ label: "Abbrechen" }, { label: "Fertig", kind: "primary", onClick: () => (ok ? undefined : (toast("Bitte zuerst den Schlüssel testen", "error"), false)) }],
    });
    body.appendChild(
      schluesselFeld(() => {
        ok = true;
        setLivePrefs({ an: true });
      }),
    );
    offen = d;
    // Dialog zu (auch per Esc): Ergebnis melden
    const beob = new MutationObserver(() => {
      if (!d.root.isConnected) {
        beob.disconnect();
        if (offen === d) offen = null;
        resolve(ok);
      }
    });
    beob.observe(document.body, { childList: true });
  });
}

/** Umschalten Lokal ↔ Gemini (bei Gemini ohne geprüften Schlüssel kommt die Einrichtung) */
export async function anrufKiWaehlen(art: "gemini" | "lokal"): Promise<void> {
  if (art === "lokal") {
    setLivePrefs({ an: false, gewaehlt: true });
    return;
  }
  if (!schluesselGeprueft()) {
    const ok = await geminiEinrichten();
    setLivePrefs({ gewaehlt: true });
    if (!ok) return;
  }
  setLivePrefs({ an: true, gewaehlt: true });
}

/** Erster Start: einmal fragen, wie die Anrufer reden sollen (vor dem ersten Spiel bzw. Beitreten) */
export function anrufKiErstwahl(): Promise<void> {
  if (livePrefs().gewaehlt) return Promise.resolve();
  // automatische Tests fragen nur, wenn ausdrücklich gewünscht
  if (navigator.webdriver && !location.search.includes("erstwahl")) return Promise.resolve();
  return new Promise((resolve) => {
    const body = el("div", { class: "ki-erstwahl" });
    body.appendChild(el("p", {}, "Wie sollen die Anrufer am Telefon reden? Du kannst das jederzeit unter Einstellungen → Anrufe & KI ändern."));
    const karten = el("div", { class: "ki-wahl-karten" });
    const karte = (titel: string, text: string, art: "gemini" | "lokal") => {
      const b = el("button", { type: "button", class: "ki-wahl-karte" });
      b.append(el("b", {}, titel), el("span", { class: "small muted" }, text));
      b.addEventListener("click", async () => {
        d.close();
        await anrufKiWaehlen(art);
        resolve();
      });
      karten.appendChild(b);
    };
    karte("Gemini (Cloud, kostenlos)", "Natürliche Stimmen, versteht gesprochene Fragen sehr gut, antwortet in etwa einer Sekunde. Braucht Internet und einen kostenlosen Schlüssel von Google (Anleitung folgt).", "gemini");
    karte("Lokal auf diesem Rechner", "Ohne Internet und ohne Konto (Ollama). Braucht einen flotten Rechner; Stimmen und Erkennung laufen ebenfalls hier.", "lokal");
    body.appendChild(karten);
    const d = openDialog({ title: "Anrufer: Gemini oder lokal?", body, wide: true, actions: [{ label: "Später", onClick: () => (setLivePrefs({ gewaehlt: true }), resolve()) }] });
  });
}

// ------------------------------------------------------------------ Regel des Hosts

let pflichtOffen = false;
/** Host verlangt Gemini: ohne geprüften Schlüssel kommt das Pflicht-Fenster */
export function kiRegelPruefen(): void {
  if (!mp.aktiv || mp.status.rolle !== "client") return;
  if (kiRegel() !== "gemini" || schluesselGeprueft() || pflichtOffen) return;
  pflichtOffen = true;
  void geminiEinrichten({ pflicht: true }).then((ok) => {
    pflichtOffen = false;
    if (!ok && mp.aktiv && kiRegel() === "gemini") setTimeout(kiRegelPruefen, 1500);
  });
}

let angemeldet = false;
export function anrufKiStarten(): void {
  if (angemeldet) return;
  angemeldet = true;
  store.onChange(() => kiRegelPruefen());
  setInterval(kiRegelPruefen, 4000);
}

/** Kurztext für Anzeigen: welche KI gilt und warum */
export function anrufKiText(): string {
  const r = kiRegel();
  const m = anrufKiModus();
  const regel = r !== "frei" && mp.aktiv ? " (vom Host festgelegt)" : "";
  if (m === "gemini") return `Gemini${schluesselDa() ? "" : " – Schlüssel fehlt"}${regel}`;
  return `lokal (Ollama)${regel}`;
}
