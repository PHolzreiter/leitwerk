/** Einfache modale Dialoge (ohne Browser-Alerts, die im Programmfenster stören). */
import { el } from "./dom";

export interface DialogAction {
  label: string;
  kind?: "primary" | "danger" | "plain";
  /** Rückgabe false = Dialog bleibt offen */
  onClick?: () => boolean | void | Promise<boolean | void>;
}

export interface DialogHandle {
  root: HTMLElement;
  close(): void;
  hide(): void;
  show(): void;
  setActionEnabled(index: number, on: boolean): void;
}

export function openDialog(opts: {
  title: string;
  body: HTMLElement;
  actions: DialogAction[];
  wide?: boolean;
}): DialogHandle {
  const overlay = el("div", { class: "dlg-overlay" });
  const box = el("div", { class: `dlg${opts.wide ? " wide" : ""}`, role: "dialog", "aria-modal": "true" });
  const head = el("div", { class: "dlg-head" }, opts.title);
  const body = el("div", { class: "dlg-body" });
  body.appendChild(opts.body);
  const foot = el("div", { class: "dlg-foot" });
  const buttons: HTMLButtonElement[] = [];

  const close = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && overlay.style.display !== "none") close();
  };

  for (const a of opts.actions) {
    const b = el("button", { class: `btn ${a.kind ?? "plain"}` }, a.label);
    b.addEventListener("click", async () => {
      const r = a.onClick ? await a.onClick() : undefined;
      if (r !== false) close();
    });
    buttons.push(b);
    foot.appendChild(b);
  }

  box.append(head, body, foot);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
  const firstInput = body.querySelector<HTMLElement>("input, select, textarea");
  setTimeout(() => firstInput?.focus(), 0);

  return {
    root: body,
    close,
    hide: () => (overlay.style.display = "none"),
    show: () => (overlay.style.display = ""),
    setActionEnabled: (i, on) => {
      if (buttons[i]) buttons[i].disabled = !on;
    },
  };
}

/** Ja/Nein-Abfrage. */
export function confirmDialog(title: string, text: string, okLabel = "OK", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const body = el("p", {}, text);
    const d = openDialog({
      title,
      body,
      actions: [
        { label: "Abbrechen" },
        {
          label: okLabel,
          kind: danger ? "danger" : "primary",
          onClick: () => {
            result = true;
          },
        },
      ],
    });
    // Auflösen, sobald der Dialog weg ist
    const obs = new MutationObserver(() => {
      if (!document.body.contains(d.root)) {
        obs.disconnect();
        resolve(result);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}
