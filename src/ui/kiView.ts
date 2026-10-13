/** Einstellungen → „KI-Anrufer“: Ollama installieren/starten, Modell laden, Test. */
import { MODELLE, kiBeenden, kiChat, kiInstallieren, kiModellLaden, kiPrefs, kiStarten, kiStatus, setKiPrefs, type KiStatus } from "../abfrage/ki";
import { inTauri } from "../platform";
import type { Settings } from "../sim/settings";
import { el, esc, toast } from "./dom";
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
  const modell = el("select");
  for (const m of MODELLE) modell.appendChild(el("option", { value: m.name }, m.label));
  if (!MODELLE.some((m) => m.name === p.modell)) modell.appendChild(el("option", { value: p.modell }, p.modell));
  modell.value = p.modell;
  modell.addEventListener("change", () => {
    setKiPrefs({ modell: modell.value });
    void zeigen();
  });
  lg.append(el("label", {}, "Sprachmodell"), modell);
  sec.appendChild(lg);

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
              { role: "system", content: "Du bist ein aufgeregter Anrufer beim Notruf 144 in Niederösterreich. Dein Vater ist im Garten gestürzt und blutet am Kopf. Antworte kurz in 1–2 Sätzen, umgangssprachlich österreichisch." },
              { role: "user", content: "Leitstelle: Notruf 144, Rettungsdienst. Wo genau ist der Notfallort?" },
            ],
            (tk) => {
              if (!erstes) erstes = performance.now();
              txt += tk;
              test.textContent = txt;
            },
          );
          const s1 = ((erstes || performance.now()) - t0) / 1000;
          const s2 = (performance.now() - t0) / 1000;
          test.innerHTML = `„${esc(antwort)}“<br><span class="small">Erste Wörter nach ${s1.toFixed(1)} s, fertig nach ${s2.toFixed(1)} s${s2 > 15 ? " – das ist langsam, ein kleineres Modell wäre flüssiger." : ""}</span>`;
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
