/** Einstellungen → „KI-Anrufer“: Ollama installieren/starten, Modell laden, Test. */
import { MODELLE, STUFE_LABEL, empfohleneStufe, kiBeenden, kiChat, kiInstallieren, kiModellLaden, kiModellLoeschen, kiPrefs, kiStarten, kiStatus, rechnerRam, setKiPrefs, type KiStatus } from "../abfrage/ki";
import { inTauri } from "../platform";
import type { Settings } from "../sim/settings";
import { el, esc, toast } from "./dom";
import { confirmDialog } from "./dialog";
import { progressBar } from "./packsView";

let beschaeftigt = false;

function hatModell(s: KiStatus, name: string): boolean {
  return s.modelle.some((m) => m === name || m.startsWith(name));
}

export function buildKiSection(sec: HTMLElement, draft: Settings): void {
  // Spieleinstellung (gilt für alle im Spiel, wird mit „Speichern“ übernommen)
  const grid = el("div", { class: "set-grid" });
  const an = el("input", { type: "checkbox" });
  an.checked = draft.anrufe;
  an.addEventListener("change", () => (draft.anrufe = an.checked));
  grid.append(el("label", {}, "Einsätze kommen als Notruf (braucht ein Abfrageschema; mit „Speichern“ unten übernehmen)"), an);
  sec.appendChild(grid);

  // Rechner-Einstellungen (nur dieser Rechner, sofort gültig)
  sec.appendChild(el("p", { class: "muted small" }, "Die folgenden Punkte gelten nur für diesen Rechner und sofort. Die KI läuft auf dem Rechner dessen, der das Gespräch führt."));
  const p = kiPrefs();
  const lg = el("div", { class: "set-grid" });
  const chk = (label: string, wert: boolean, fn: (v: boolean) => void) => {
    const c = el("input", { type: "checkbox" });
    c.checked = wert;
    c.addEventListener("change", () => {
      fn(c.checked);
      void zeigen();
    });
    lg.append(el("label", {}, label), c);
  };
  chk("KI-Anrufer verwenden (sonst einfache Antworten)", p.aktiv, (v) => setKiPrefs({ aktiv: v }));
  chk("Klingelton bei Anrufen", p.klingelton, (v) => setKiPrefs({ klingelton: v }));
  chk("Ollama beim Beenden von LeitWerk schließen", p.beenden, (v) => setKiPrefs({ beenden: v }));
  // Gesprächsablauf: neu (ab v0.38) oder wie bisher
  const ablauf = el("select") as HTMLSelectElement;
  ablauf.append(el("option", { value: "neu" }, "neu – Frage verstehen, Antwort prüfen, bei Fehlern neu erzeugen"), el("option", { value: "klassisch" }, "klassisch – wie bis Version 0.37"));
  ablauf.value = p.ablauf;
  ablauf.addEventListener("change", () => setKiPrefs({ ablauf: ablauf.value as "neu" | "klassisch" }));
  lg.append(el("label", {}, "Gesprächsablauf"), ablauf);
  sec.appendChild(lg);

  // Sprachmodell nach Rechner-Stärke
  const modell = { value: p.modell };
  const wahl = el("div", { class: "ki-modelle" });
  const ramInfo = el("p", { class: "small muted" }, "Größere Modelle führen natürlichere Gespräche, brauchen aber mehr Arbeitsspeicher und antworten langsamer. Mit „Testanruf“ siehst du, wie schnell es auf diesem Rechner geht.");
  sec.append(el("h4", {}, "Sprachmodell"), ramInfo, wahl);
  let ram = 0;
  const waehlen = (name: string) => {
    modell.value = name;
    setKiPrefs({ modell: name });
    zeichneWahl();
    void zeigen();
  };
  let geladen: string[] = [];
  function zeichneWahl() {
    wahl.innerHTML = "";
    const empf = empfohleneStufe(ram);
    for (const m of MODELLE) {
      const r = el("label", { class: `ki-modell${m.name === modell.value ? " gewaehlt" : ""}` });
      const radio = el("input", { type: "radio", name: "ki-modell" });
      radio.checked = m.name === modell.value;
      radio.addEventListener("change", () => waehlen(m.name));
      const da = geladen.some((x) => x === m.name || x.startsWith(`${m.name}`));
      const knapp = ram > 0 && ram < m.ram;
      const txt = el("span");
      txt.innerHTML =
          `<b>${STUFE_LABEL[m.stufe]}: ${esc(m.label)}</b> <span class="muted small">${m.gb.toLocaleString("de-AT")} GB Download · ab ${m.ram} GB Arbeitsspeicher</span>` +
            `${m.stufe === empf ? ' <span class="ki-tag ok">empfohlen</span>' : ""}${da ? ' <span class="ki-tag">geladen</span>' : ""}${knapp ? ' <span class="ki-tag warn">zu groß?</span>' : ""}` +
            `<br><span class="small muted">${esc(m.info)}</span>`;
      r.append(radio, txt);
      wahl.appendChild(r);
    }
    // anderes Modell (Name aus der Ollama-Bibliothek, z. B. zum Ausprobieren neuer Modelle)
    const eigen = !MODELLE.some((m) => m.name === modell.value);
    const zeile = el("div", { class: `ki-modell${eigen ? " gewaehlt" : ""}` });
    const feld = el("input", { type: "text", placeholder: "anderes Modell, z. B. gemma3:12b" }) as HTMLInputElement;
    if (eigen) feld.value = modell.value;
    const ok = el("button", { class: "btn small" }, "Übernehmen");
    ok.addEventListener("click", () => {
      const n = feld.value.trim();
      if (n) waehlen(n);
    });
    feld.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ok.click();
    });
    zeile.append(el("span", { class: "small" }, "Anderes Modell:"), feld, ok);
    wahl.appendChild(zeile);
  }
  zeichneWahl();
  void rechnerRam().then((g) => {
    ram = g;
    if (g) ramInfo.innerHTML = `Dieser Rechner hat <b>${g} GB</b> Arbeitsspeicher – empfohlen ist die Stufe <b>${STUFE_LABEL[empfohleneStufe(g)!]}</b>. Größere Modelle führen natürlichere Gespräche, antworten aber langsamer. Mit „Testanruf“ siehst du, wie schnell es hier geht.`;
    zeichneWahl();
  });

  const status = el("div", { class: "ki-status" });
  const knoepfe = el("div", { class: "row-btns" });
  const pb = progressBar();
  pb.root.hidden = true;
  const test = el("div", { class: "ki-test muted" });
  sec.append(status, knoepfe, pb.root, test);

  const knopf = (label: string, cls: string, fn: () => Promise<void>) => {
    const b = el("button", { class: `btn small ${cls}` }, label);
    b.disabled = beschaeftigt;
    b.addEventListener("click", async () => {
      if (beschaeftigt) return;
      beschaeftigt = true;
      knoepfe.querySelectorAll("button").forEach((x) => (x.disabled = true));
      try {
        await fn();
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
      } finally {
        beschaeftigt = false;
        pb.root.hidden = true;
        void zeigen();
      }
    });
    knoepfe.appendChild(b);
  };

  async function zeigen() {
    if (!inTauri()) {
      status.innerHTML = `<span class="muted">Die KI gibt es nur im installierten Programm. Ohne KI antwortet der Anrufer mit einfachen Sätzen.</span>`;
      knoepfe.innerHTML = "";
      return;
    }
    const s = await kiStatus().catch(() => null);
    knoepfe.innerHTML = "";
    if (!s) {
      status.textContent = "Status konnte nicht geprüft werden.";
      return;
    }
    const m = modell.value;
    geladen = s.modelle;
    zeichneWahl();
    const ok = (t: string) => `<span class="ok">✔ ${t}</span>`;
    const no = (t: string) => `<span class="alert-text">✘ ${t}</span>`;
    status.innerHTML = [
      s.installiert ? ok(`Ollama installiert${s.version ? ` (${esc(s.version)})` : ""}`) : no("Ollama ist nicht installiert"),
      s.installiert ? (s.laeuft ? ok("läuft") : no("läuft nicht")) : "",
      s.laeuft ? (hatModell(s, m) ? ok(`Modell ${esc(m)} geladen`) : no(`Modell ${esc(m)} fehlt`)) : "",
    ]
      .filter(Boolean)
      .join(" · ");

    if (!s.installiert) {
      knopf("Ollama installieren", "primary", async () => {
        pb.root.hidden = false;
        pb.set(null, "Ollama wird heruntergeladen …");
        const msg = await kiInstallieren((f) => pb.set(f.total ? f : null, f.text || undefined));
        toast(msg);
        // Nach der Installation kurz warten, bis Ollama läuft
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          if ((await kiStatus()).laeuft) break;
        }
      });
    } else if (!s.laeuft) {
      knopf("Ollama starten", "primary", async () => {
        await kiStarten();
        for (let i = 0; i < 10 && !(await kiStatus()).laeuft; i++) await new Promise((r) => setTimeout(r, 1000));
      });
    } else {
      if (!hatModell(s, m)) {
        knopf(`Modell laden (${m})`, "primary", async () => {
          const info = MODELLE.find((x) => x.name === m);
          if (info && ram && ram < info.ram) {
            const ok = await confirmDialog(
              "Modell zu groß für diesen Rechner?",
              `${info.label} braucht etwa ${info.ram} GB Arbeitsspeicher, dieser Rechner hat ${ram} GB. Es kann sein, dass Ollama das Modell gar nicht lädt oder die Antworten sehr langsam kommen (eher eine Minute als ein paar Sekunden). Kaputt geht nichts – du kannst es mit „löschen“ wieder entfernen. Trotzdem herunterladen (${info.gb.toLocaleString("de-AT")} GB)?`,
              "Trotzdem laden",
            );
            if (!ok) return;
          }
          pb.root.hidden = false;
          pb.set(null, "Download startet …");
          await kiModellLaden(m, (f) => pb.set(f.total ? f : null, f.total ? undefined : f.text));
          toast(`Modell ${m} geladen`);
        });
      } else {
        knopf("Testanruf", "", async () => {
          test.textContent = "Anrufer denkt nach …";
          const t0 = performance.now();
          let erstes = 0;
          let txt = "";
          const antwort = await kiChat(
            [
              { role: "system", content: "Du spielst eine echte Person, die beim Notruf 144 in Niederösterreich anruft: Dein Vater (78) ist im Garten von der Leiter gefallen und blutet am Kopf, er ist wach, aber ganz blass. Du bist aufgeregt. Sag nur, was du ins Telefon sprichst: kurz, umgangssprachlich österreichisch, keine Listen." },
              { role: "user", content: "Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?" },
              { role: "assistant", content: "Gartengasse 4 in Gföhl, bitte schnell!" },
              { role: "user", content: "Leitstelle: Was ist denn passiert?" },
            ],
            (tk) => {
              if (!erstes) erstes = performance.now();
              txt += tk;
              test.textContent = txt;
            },
          );
          const s1 = ((erstes || performance.now()) - t0) / 1000;
          const s2 = (performance.now() - t0) / 1000;
          const urteil = s2 <= 5 ? "flüssig – passt gut" : s2 <= 10 ? "brauchbar" : s2 <= 18 ? "eher langsam – eine Stufe kleiner wäre flüssiger" : "zu langsam für Gespräche – bitte eine kleinere Stufe wählen";
          test.innerHTML = `„${esc(antwort)}“<br><span class="small">Erste Wörter nach ${s1.toFixed(1)} s, fertig nach ${s2.toFixed(1)} s: <b>${urteil}</b>. (Der erste Test nach dem Laden dauert länger.)</span>`;
        });
      }
      // andere geladene Modelle löschen (Platz sparen)
      for (const x of s.modelle.filter((n) => !(n === m || n.startsWith(`${m}`) || n.startsWith(`${m}:`)))) {
        knopf(`${x} löschen`, "", async () => {
          await kiModellLoeschen(x);
          toast(`${x} gelöscht`);
        });
      }
      knopf("Ollama beenden", "", async () => {
        await kiBeenden();
      });
    }
    knopf("Prüfen", "", async () => undefined);
  }
  void zeigen();
}
