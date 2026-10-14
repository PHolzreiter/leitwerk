/** Funk und Chat als eigene Fenster. */
import { mp } from "../../net/mehrspieler";
import { sim } from "../../sim/engine";
import { el, esc, toast } from "../dom";
import { createFunkView } from "../funkView";
import { registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { onFunkRufen, waehle } from "../ws/auswahl";

function funk(ctx: PanelKontext) {
  const root = el("div", { class: "pl funk-fenster" });
  const body = el("div", { class: "pl-body" });
  root.appendChild(body);
  // Aus dem Funk heraus: Einsatz markieren, Maske nicht nach vorne holen (sonst sieht man die Antwort nicht)
  const v = createFunkView(body, { select: (id) => waehle("einsatz", id, { maske: false }) });
  const render = () => {
    v.refresh();
    const n = v.offen();
    ctx.setzeBadge(n, "klingelt");
  };
  let wartet = false;
  const aus = [
    sim.onChange(() => {
      if (wartet) return;
      wartet = true;
      setTimeout(() => {
        wartet = false;
        render();
      }, 400);
    }),
    onFunkRufen((id) => v.rufen(id)),
  ];
  render();
  return { el: root, dispose: () => aus.forEach((f) => f()) };
}

function chat(ctx: PanelKontext) {
  const root = el("div", { class: "pl chat-fenster" });
  const liste = el("div", { class: "pl-body chat-list" });
  const form = el("form", { class: "chat-form" });
  const eingabe = el("input", { type: "text", maxlength: "500", placeholder: "Nachricht an alle Disponenten …" });
  form.append(eingabe, el("button", { class: "btn small primary" }, "Senden"));
  root.append(liste, form);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t) return;
    eingabe.value = "";
    sim.call("chat", t).catch((e) => toast(String(e.message ?? e), "error"));
  });
  let gezeigt = -1;
  const render = () => {
    const sichtbar = ctx.sichtbar();
    if (sichtbar) mp.ungeleseneChats = 0;
    ctx.setzeBadge(sichtbar ? null : mp.ungeleseneChats, "warn");
    const msgs = sim.state.chat ?? [];
    if (msgs.length === gezeigt) return;
    gezeigt = msgs.length;
    liste.innerHTML = msgs.length
      ? msgs
          .map(
            (m) =>
              `<div class="chat-row${m.von === mp.ich.name ? " ich" : ""}"><span class="muted">${new Date(m.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}</span> <b>${esc(m.von)}</b><div>${esc(m.text)}</div></div>`,
          )
          .join("")
      : `<div class="muted pad">${mp.aktiv ? "Noch keine Nachrichten. Hier schreiben sich die Disponenten untereinander." : "Der Chat ist für Spiele mit mehreren Disponenten (Spiel → Multiplayer)."}</div>`;
    liste.scrollTop = liste.scrollHeight;
  };
  const aus = [sim.onChange(render), mp.onChange(render)];
  render();
  return {
    el: root,
    dispose: () => aus.forEach((f) => f()),
    sichtbar: (an: boolean) => {
      if (an) {
        render();
        eingabe.focus();
      }
    },
  };
}

registriere({ komponente: "funk", titel: "Funk", info: "Funkgespräche mit den Fahrzeugen, Statusmeldungen", bereich: "rechts", erstellen: funk });
registriere({ komponente: "chat", titel: "Chat", info: "Nachrichten an die anderen Disponenten (Multiplayer)", bereich: "rechts", erstellen: chat });
