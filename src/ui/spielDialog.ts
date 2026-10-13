/** Fenster „Spiel“: Spielstand speichern/laden, Multiplayer hosten/beitreten, Spieler und Rechte. */
import { RECHTE_LABEL, meinName, mp, type Spieler } from "../net/mehrspieler";
import * as spielstand from "../net/spielstand";
import { store } from "../data/store";
import type { Berechtigung } from "../sim/engine";
import { confirmDialog, openDialog, type DialogHandle } from "./dialog";
import { el, esc, toast } from "./dom";

const RECHTE: Berechtigung[] = ["disponieren", "steuern", "einstellungen"];

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function uhrzeit(t: number): string {
  return new Date(t).toLocaleString("de-AT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

let offen: DialogHandle | null = null;

export function oeffneSpielDialog(): void {
  if (offen && document.body.contains(offen.root)) return;
  const body = el("div", { class: "spiel" });
  const d = openDialog({ title: "Spiel", body, actions: [{ label: "Schließen" }], wide: true });
  offen = d;
  const ab = mp.onChange(() => render());
  const obs = new MutationObserver(() => {
    if (!document.body.contains(d.root)) {
      ab();
      obs.disconnect();
      offen = null;
    }
  });
  obs.observe(document.body, { childList: true });

  const sec = (titel: string, hinweis?: string) => {
    const s = el("section", { class: "spiel-sec" });
    s.appendChild(el("h3", {}, titel));
    if (hinweis) s.appendChild(el("p", { class: "muted" }, hinweis));
    body.appendChild(s);
    return s;
  };

  const busy = async (btn: HTMLButtonElement, fn: () => Promise<unknown>) => {
    btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      toast(fehlerText(e), "error");
    }
    btn.disabled = false;
  };

  function render() {
    body.innerHTML = "";
    const r = mp.status.rolle;

    // ---------------- Multiplayer
    if (r === "aus") {
      const s = sec("Multiplayer", "Bis zu 6 Spieler. Der Host spielt mit, die Simulation läuft auf seinem Rechner. Mitspieler treten mit dem 6-stelligen Code bei.");
      const name = el("input", { type: "text", placeholder: "Dein Name (z. B. Paul)", maxlength: "30" });
      name.value = meinName();
      s.appendChild(el("label", { class: "fld" }, "Name"));
      s.lastElementChild!.appendChild(name);
      const reihe = el("div", { class: "spiel-row" });
      const host = el("button", { class: "btn primary" }, "Spiel hosten");
      host.addEventListener("click", () =>
        busy(host, async () => {
          if (!name.value.trim()) throw new Error("Bitte einen Namen eingeben");
          const code = await mp.hosten(name.value);
          toast(`Spiel gestartet – Code ${code}`);
        }),
      );
      const code = el("input", { type: "text", inputmode: "numeric", placeholder: "Code", maxlength: "6", class: "code-input" });
      const join = el("button", { class: "btn" }, "Beitreten");
      join.addEventListener("click", () =>
        busy(join, async () => {
          if (!name.value.trim()) throw new Error("Bitte einen Namen eingeben");
          await mp.beitreten(code.value, name.value);
          toast("Beigetreten");
        }),
      );
      code.addEventListener("keydown", (e) => {
        if (e.key === "Enter") join.click();
      });
      reihe.append(host, el("span", { class: "muted" }, "oder"), code, join);
      s.appendChild(reihe);
      s.appendChild(
        el("p", { class: "muted small" }, "Beim Hosten wird dein aktueller Stand geteilt: Leitstelle, Einsatzcodes, Einstellungen und laufende Einsätze."),
      );
    } else {
      const s = sec(r === "host" ? "Du bist Host" : "Du spielst mit");
      const kopf = el("div", { class: "spiel-row" });
      const codeEl = el("div", { class: "spiel-code" }, mp.status.code);
      const kopie = el("button", { class: "btn small" }, "Code kopieren");
      kopie.addEventListener("click", () => {
        void navigator.clipboard?.writeText(mp.status.code).then(() => toast("Code kopiert"));
      });
      const zustand = !mp.status.verbunden
        ? `<span class="alert-text">Verbindung unterbrochen – verbinde neu …</span>`
        : r === "client" && !mp.status.hostDa
          ? `<span class="alert-text">Host nicht verbunden</span>`
          : `<span class="ok-text">verbunden</span>`;
      kopf.append(codeEl, kopie, el("span", { class: "spacer" }));
      kopf.insertAdjacentHTML("beforeend", zustand);
      s.appendChild(kopf);

      // Spielerliste
      const tab = el("table", { class: "set-table spieler-tab" });
      tab.innerHTML = `<tr><th>Spieler</th><th></th>${RECHTE.map((x) => `<th>${RECHTE_LABEL[x]}</th>`).join("")}</tr>`;
      for (const sp of mp.spieler) tab.appendChild(spielerZeile(sp, r === "host"));
      s.appendChild(tab);
      if (r === "host") s.appendChild(el("p", { class: "muted small" }, "Rechte gelten sofort. Standard: alle dürfen disponieren und die Simulation steuern, Einstellungen und Daten ändert nur der Host."));

      const reihe = el("div", { class: "spiel-row" });
      const weg = el("button", { class: "btn danger-text" }, "Spiel verlassen");
      weg.addEventListener("click", async () => {
        if (r === "host" && mp.spieler.some((x) => !x.host && x.online)) {
          const ok = await confirmDialog(
            "Spiel beenden",
            "Du bist Host. Wenn du gehst, pausiert das Spiel für alle Mitspieler. Sie können den Stand speichern oder selbst Host werden. Tipp: vorher den Spielstand speichern.",
            "Spiel verlassen",
            true,
          );
          if (!ok) return;
        }
        mp.verlassen();
        toast(r === "host" ? "Spiel beendet – du spielst allein weiter" : "Spiel verlassen");
      });
      reihe.append(weg);
      if (r === "client" && !mp.status.hostDa) {
        const ueb = el("button", { class: "btn primary" }, "Als Host übernehmen");
        ueb.addEventListener("click", () => mp.hostUebernehmen());
        reihe.prepend(ueb);
      }
      s.appendChild(reihe);
    }

    // ---------------- Spielstand
    const ss = sec("Spielstand", "Speichert das laufende Spiel mit allen Einsätzen, Fahrzeugen und Daten. Jeder kann einen Spielstand laden und allein oder als Host weiterspielen.");
    const reihe = el("div", { class: "spiel-row" });
    const sp = el("button", { class: "btn primary" }, "Spielstand speichern …");
    sp.addEventListener("click", () =>
      busy(sp, async () => {
        const p = await spielstand.speichern();
        if (p) toast("Spielstand gespeichert");
      }),
    );
    reihe.appendChild(sp);
    if (r !== "client") {
      const ld = el("button", { class: "btn" }, "Spielstand laden …");
      ld.addEventListener("click", () =>
        busy(ld, async () => {
          const st = await spielstand.laden();
          if (st) toast(`Spielstand vom ${uhrzeit(st.gespeichert)} geladen`);
          render();
        }),
      );
      reihe.appendChild(ld);
      const auto = el("button", { class: "btn" }, "Letzte automatische Sicherung …");
      auto.hidden = true;
      void spielstand.autosaveInfo().then((i) => {
        if (!i) return;
        auto.hidden = false;
        auto.textContent = `Automatische Sicherung vom ${uhrzeit(i.gespeichert)} laden`;
      });
      auto.addEventListener("click", () =>
        busy(auto, async () => {
          await spielstand.autosaveLaden();
          toast("Automatische Sicherung geladen");
          render();
        }),
      );
      reihe.appendChild(auto);
    }
    ss.appendChild(reihe);
    if (store.inSession && r === "aus") {
      const zu = el("button", { class: "btn small" }, "Spielstand schließen (zurück zur eigenen Leitstelle)");
      zu.addEventListener("click", () => {
        try {
          spielstand.schliessen();
          render();
        } catch (e) {
          toast(fehlerText(e), "error");
        }
      });
      ss.appendChild(zu);
    }
  }

  function spielerZeile(sp: Spieler, binHost: boolean): HTMLTableRowElement {
    const tr = el("tr");
    tr.innerHTML = `<td><span class="online-dot ${sp.online ? "on" : ""}"></span> <b>${esc(sp.name)}</b>${sp.pid === mp.ich.pid ? " <span class=\"muted\">(du)</span>" : ""}</td><td>${sp.host ? `<span class="badge">Host</span>` : sp.online ? "" : `<span class="muted">offline</span>`}</td>`;
    for (const rr of RECHTE) {
      const td = el("td");
      const cb = el("input", { type: "checkbox" });
      cb.checked = sp.host || sp.rechte[rr];
      cb.disabled = !binHost || sp.host;
      cb.addEventListener("change", () => mp.setRechte(sp.pid, rr, cb.checked));
      td.appendChild(cb);
      tr.appendChild(td);
    }
    return tr;
  }

  render();
}

// ------------------------------------------------------------------ Statusknopf und Hinweise

/** Knopf oben in der Leiste und Hinweise bei Verbindungsproblemen */
export function setupSpielStatus(): void {
  const btn = document.getElementById("btn-spiel") as HTMLButtonElement;
  btn.addEventListener("click", () => oeffneSpielDialog());

  const overlay = el("div", { class: "host-weg", hidden: "" });
  document.body.appendChild(overlay);
  const banner = el("div", { class: "verbindung-banner", hidden: "" });
  document.body.appendChild(banner);

  let letzterFehler: string | null = null;
  const render = () => {
    const s = mp.status;
    btn.classList.toggle("primary", s.rolle !== "aus");
    btn.classList.toggle("warn", s.rolle !== "aus" && (!s.verbunden || (s.rolle === "client" && !s.hostDa)));
    const online = mp.spieler.filter((x) => x.online).length;
    btn.textContent =
      s.rolle === "aus"
        ? store.inSession
          ? "Spiel (Spielstand)"
          : "Spiel"
        : `${s.rolle === "host" ? "Host" : "Mitspieler"} · ${s.code} · ${online} Spieler`;

    banner.hidden = !(s.rolle !== "aus" && !s.verbunden);
    banner.textContent = s.rolle === "host" ? "Verbindung zum Server unterbrochen – Spiel pausiert, verbinde neu …" : "Verbindung unterbrochen – verbinde neu …";

    const hostWeg = s.rolle === "client" && s.verbunden && !s.hostDa;
    overlay.hidden = !hostWeg;
    if (hostWeg) {
      overlay.innerHTML = "";
      const box = el("div", { class: "host-weg-box" });
      box.innerHTML = s.hostVerlassen
        ? `<h2>Der Host hat das Spiel verlassen</h2><p>Du kannst den Stand speichern, selbst Host werden oder das Spiel verlassen.</p>`
        : `<h2>Host getrennt – Spiel pausiert</h2><p>Sobald der Host wieder da ist, geht es genau hier weiter. Du kannst den Stand auch speichern oder selbst Host werden.</p>`;
      const r = el("div", { class: "spiel-row" });
      const sp = el("button", { class: "btn" }, "Spielstand speichern …");
      sp.addEventListener("click", () => void spielstand.speichern().then((p) => p && toast("Spielstand gespeichert")));
      const ueb = el("button", { class: "btn primary" }, "Als Host übernehmen");
      ueb.addEventListener("click", () => mp.hostUebernehmen());
      const weg = el("button", { class: "btn danger-text" }, "Spiel verlassen");
      weg.addEventListener("click", () => mp.verlassen());
      r.append(sp, ueb, weg);
      box.appendChild(r);
      overlay.appendChild(box);
    }
    if (s.fehler && s.fehler !== letzterFehler) toast(s.fehler, "error");
    letzterFehler = s.fehler;
  };
  mp.onChange(render);
  store.onChange(render);
  render();
}
