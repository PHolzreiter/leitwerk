/** Kartenpakete (Einstellungen), Erststart-Download und Update-Fenster. */
import { inTauri } from "../platform";
import {
  GRUNDPAKET,
  appVersion,
  checkUpdate,
  formatBytes,
  installPack,
  installUpdate,
  packSize,
  packsChanged,
  packsLocal,
  packsManifest,
  removePack,
  type Pack,
  type PacksLocal,
  type Progress,
  type UpdateInfo,
} from "../updates";
import { geoStatus, regionSetzen } from "../sim/geo";
import { confirmDialog, openDialog } from "./dialog";
import { el, esc, toast } from "./dom";

let manifestCache: Pack[] | null = null;
let busy: string | null = null;

export function progressBar(): { root: HTMLElement; set(p: Progress | null, text?: string): void } {
  const root = el("div", { class: "progress" });
  const bar = el("div", { class: "progress-bar" });
  const label = el("div", { class: "progress-label muted" });
  const track = el("div", { class: "progress-track" });
  track.appendChild(bar);
  root.append(track, label);
  return {
    root,
    set(p, text) {
      const pct = p && p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : 0;
      bar.style.width = `${pct}%`;
      label.textContent = text ?? (p ? `${formatBytes(p.done)} von ${formatBytes(p.total)} (${Math.floor(pct)} %)` : "");
    },
  };
}

// ------------------------------------------------------------------ Erststart

/**
 * Stellt sicher, dass das Grundpaket installiert ist. Beim ersten Start wird es
 * mit Fortschrittsanzeige heruntergeladen; ohne Internet kann man es erneut versuchen.
 */
export async function ensureGrundpaket(): Promise<void> {
  if (!inTauri()) return;
  const local = await packsLocal();
  // Pflichtpakete: Grundpaket und Straßen Niederösterreich (das Einsatzgebiet)
  if (local.installed[GRUNDPAKET] && local.installed[STRASSEN_NOE]) return;
  if (local.installed[GRUNDPAKET]) {
    // Update von einer älteren Version: fehlende Pflichtpakete still nachladen (mit Anzeige)
    let fehlend: Pack[] = [];
    try {
      fehlend = (await packsManifest()).filter((p) => p.pflicht && !local.installed[p.id]);
    } catch {
      return; // offline: altes Straßennetz bleibt in Gebrauch
    }
    if (!fehlend.length) return;
  }

  await new Promise<void>((resolve) => {
    const overlay = el("div", { class: "first-start" });
    const box = el("div", { class: "first-box" });
    box.innerHTML = local.installed[GRUNDPAKET]
      ? `<h2>Neue Kartenpakete</h2>
      <p>Das Straßennetz gibt es jetzt je Bundesland. Einmalig wird das Paket <b>Straßen Niederösterreich</b> geladen
      (Straßennetz für die Fahrzeiten und Adressen). Weitere Bundesländer gibt es unter Einstellungen → Kartenpakete.</p>`
      : `<h2>Willkommen bei LeitWerk</h2>
      <p>Beim ersten Start werden einmalig das <b>Grundpaket</b> (Übersichtskarte, Karte von Niederösterreich und Wien)
      und die <b>Straßen Niederösterreich</b> (Straßennetz für die Fahrzeiten, Adressen) geladen.</p>`;
    const pb = progressBar();
    const err = el("div", { class: "alert-text" });
    const retry = el("button", { class: "btn primary" }, "Erneut versuchen");
    retry.hidden = true;
    box.append(pb.root, err, retry);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const run = async () => {
      retry.hidden = true;
      err.textContent = "";
      pb.set(null, "Verbindung wird hergestellt …");
      try {
        const packs = await packsManifest();
        const jetzt = await packsLocal();
        const laden = packs.filter((p) => (p.pflicht || p.id === GRUNDPAKET) && !jetzt.installed[p.id]);
        if (!packs.some((p) => p.id === GRUNDPAKET)) throw new Error("Grundpaket nicht im Paketverzeichnis");
        for (const p of laden) {
          pb.set({ done: 0, total: packSize(p) }, `${p.name} wird geladen …`);
          await installPack(p.id, (pr) => pb.set(pr));
        }
        if (laden.length) packsChanged();
        overlay.remove();
        resolve();
      } catch (e) {
        err.textContent = `${e instanceof Error ? e.message : String(e)}. Bitte Internetverbindung prüfen.`;
        retry.hidden = false;
      }
    };
    retry.addEventListener("click", () => void run());
    void run();
  });
}

// ------------------------------------------------------------------ Einstellungen

/** Baut den Bereich „Kartenpakete“ in den Einstellungen. */
const STRASSEN_NOE = "bl-noe";

export function buildPacksSection(sec: HTMLElement): void {
  const list = el("div", { class: "packs" });
  sec.appendChild(list);
  if (!inTauri()) {
    list.appendChild(el("div", { class: "muted" }, "Kartenpakete gibt es nur im installierten Programm."));
    return;
  }
  list.appendChild(el("div", { class: "muted" }, "Paketverzeichnis wird geladen …"));

  let regionenAus: string[] = [];
  const render = (packs: Pack[] | null, local: PacksLocal, fehler?: string) => {
    list.innerHTML = "";
    if (fehler) list.appendChild(el("div", { class: "alert-text" }, `${fehler} – Download derzeit nicht möglich.`));
    const ids = new Set<string>([...(packs ?? []).map((p) => p.id), ...Object.keys(local.installed)]);
    for (const id of ids) {
      const p = packs?.find((x) => x.id === id);
      const inst = local.installed[id];
      const row = el("div", { class: "pack-row" });
      const info = el("div", { class: "pack-info" });
      const zustand = !inst
        ? "nicht installiert"
        : p && p.version !== inst.version
          ? `<span class="pack-upd">Update verfügbar</span>`
          : "installiert";
      info.innerHTML = `<div><b>${esc(p?.name ?? id)}</b> <span class="muted">· ${p ? formatBytes(packSize(p)) : ""}</span></div>
        <div class="muted">${esc(p?.beschreibung ?? "")}</div>
        <div class="pack-state">${zustand}</div>`;
      row.appendChild(info);
      const btns = el("div", { class: "pack-btns" });
      const pb = progressBar();
      pb.root.hidden = busy !== id;
      if (p && (!inst || p.version !== inst.version)) {
        const b = el("button", { class: "btn small primary" }, inst ? "Aktualisieren" : "Herunterladen");
        b.disabled = busy !== null;
        b.addEventListener("click", async () => {
          busy = id;
          pb.root.hidden = false;
          list.querySelectorAll("button").forEach((x) => ((x as HTMLButtonElement).disabled = true));
          pb.set({ done: 0, total: packSize(p) });
          try {
            await installPack(id, (pr) => pb.set(pr));
            toast(`${p.name} installiert`);
            packsChanged();
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), "error");
          }
          busy = null;
          void reload();
        });
        btns.appendChild(b);
      }
      // Straßenpaket eines Bundeslands: ein- und ausschalten (NÖ bleibt immer an)
      const region = id.startsWith("bl-") ? id.slice(3) : null;
      if (inst && region && region !== "noe") {
        const lbl = el("label", { class: "chk", title: "Ausgeschaltet: keine Transporte, die diese Straßen brauchen" });
        const cb = el("input", { type: "checkbox" });
        cb.checked = !regionenAus.includes(region);
        cb.disabled = busy !== null;
        cb.addEventListener("change", async () => {
          try {
            await regionSetzen(region, cb.checked);
            packsChanged();
            toast(`${p?.name ?? id} ${cb.checked ? "eingeschaltet" : "ausgeschaltet"}`);
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), "error");
          }
          void reload();
        });
        lbl.append(cb, el("span", {}, "eingeschaltet"));
        btns.appendChild(lbl);
      }
      if (inst && !(p?.pflicht ?? (id === GRUNDPAKET || id === STRASSEN_NOE))) {
        const b = el("button", { class: "btn small" }, "Löschen");
        b.disabled = busy !== null;
        b.addEventListener("click", async () => {
          if (!(await confirmDialog("Paket löschen", `${p?.name ?? id} löschen? Du kannst es jederzeit wieder herunterladen.`, "Löschen", true))) return;
          try {
            await removePack(id);
            packsChanged();
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), "error");
          }
          void reload();
        });
        btns.appendChild(b);
      }
      row.appendChild(btns);
      row.appendChild(pb.root);
      list.appendChild(row);
    }
    list.appendChild(el("div", { class: "muted small" }, `Speicherort: ${local.dir}`));
  };

  const reload = async () => {
    const local = await packsLocal();
    regionenAus = (await geoStatus().catch(() => null))?.regionen_aus ?? [];
    if (manifestCache) render(manifestCache, local);
    try {
      manifestCache = await packsManifest();
      render(manifestCache, local);
    } catch (e) {
      render(manifestCache, local, e instanceof Error ? e.message : String(e));
    }
  };
  void reload();
}

/** Bereich „Programm“: Version und Update-Prüfung. */
export function buildAppSection(sec: HTMLElement): void {
  const row = el("div", { class: "row-btns" });
  const ver = el("span", {}, "Version …");
  const btn = el("button", { class: "btn small" }, "Nach Updates suchen");
  row.append(ver, btn);
  sec.appendChild(row);
  void appVersion().then((v) => (ver.textContent = `Installierte Version: ${v}`));
  btn.disabled = !inTauri();
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const u = await checkUpdate();
      if (u) showUpdateDialog(u);
      else toast("LeitWerk ist auf dem neuesten Stand");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
    btn.disabled = false;
  });
}

// ------------------------------------------------------------------ Updates

export function showUpdateDialog(u: UpdateInfo): void {
  const body = el("div", { class: "update-box" });
  body.innerHTML = `<p>Version <b>${esc(u.version)}</b> ist verfügbar (installiert: ${esc(u.current)}).</p>
    ${u.notes ? `<div class="update-notes">${esc(u.notes).replace(/\n/g, "<br>")}</div>` : ""}
    <p class="muted">LeitWerk startet nach der Installation neu. Laufende Einsätze gehen dabei verloren, deine Daten und Einstellungen bleiben.</p>`;
  const pb = progressBar();
  pb.root.hidden = true;
  body.appendChild(pb.root);
  const d = openDialog({
    title: "Neue Version verfügbar",
    body,
    actions: [
      { label: "Später" },
      {
        label: "Jetzt installieren",
        kind: "primary",
        onClick: async () => {
          d.setActionEnabled(0, false);
          d.setActionEnabled(1, false);
          pb.root.hidden = false;
          pb.set(null, "Update wird geladen …");
          try {
            await installUpdate((p) => pb.set(p));
            pb.set(null, "Wird installiert, LeitWerk startet neu …");
          } catch (e) {
            toast(e instanceof Error ? e.message : String(e), "error");
            d.setActionEnabled(0, true);
            d.setActionEnabled(1, true);
          }
          return false;
        },
      },
    ],
  });
}

/** Beim Start: still nach Programm- und Kartenupdates sehen. */
export async function checkOnStart(): Promise<void> {
  if (!inTauri()) return;
  try {
    const u = await checkUpdate();
    if (u) showUpdateDialog(u);
  } catch (e) {
    console.warn("Update-Prüfung", e);
  }
  try {
    const [packs, local] = await Promise.all([packsManifest(), packsLocal()]);
    manifestCache = packs;
    const veraltet = packs.filter((p) => local.installed[p.id] && local.installed[p.id].version !== p.version);
    if (veraltet.length) toast(`Kartenupdate verfügbar: ${veraltet.map((p) => p.name).join(", ")} (Einstellungen → Kartenpakete)`);
  } catch (e) {
    console.warn("Paketprüfung", e);
  }
}
