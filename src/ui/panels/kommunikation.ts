/**
 * Funk und Chat: ein Fenster aus dem Entwurf mit zwei Reitern (Funk · Chat) – die Reiter macht dockview,
 * beide zeichnen dieselbe Komponente (fenster/funk) in ihrer Ansicht.
 * Zähler am Reiter: gelb = Fahrzeuge, die rufen; blau = ungelesene Nachrichten.
 */
import { mp } from "../../net/mehrspieler";
import { el } from "../dom";
import { funkEinbinden } from "../fenster/funk";
import { registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { onFunkRufen, waehle } from "../ws/auswahl";

function funk(ctx: PanelKontext) {
  const root = el("div", { class: "pl ew-funk-panel" });
  // Aus dem Funk heraus: Einsatz markieren, Maske nicht nach vorne holen (sonst sieht man die Antwort nicht)
  const v = funkEinbinden(root, {
    ansicht: "funk",
    waehle: (id) => waehle("einsatz", id, { maske: false }),
    zaehler: (rufe) => ctx.setzeBadge(rufe, "warn"),
  });
  const aus = [onFunkRufen((id) => v.rufen(id))];
  return {
    el: root,
    dispose: () => {
      aus.forEach((f) => f());
      v.entfernen();
    },
    sichtbar: (an: boolean) => {
      if (an) v.zeichnen();
    },
  };
}

function chat(ctx: PanelKontext) {
  const root = el("div", { class: "pl ew-funk-panel" });
  const v = funkEinbinden(root, {
    ansicht: "chat",
    zaehler: () => {
      const sichtbar = ctx.sichtbar();
      if (sichtbar) mp.ungeleseneChats = 0;
      ctx.setzeBadge(sichtbar ? null : mp.ungeleseneChats, "klingelt");
    },
  });
  return {
    el: root,
    dispose: () => v.entfernen(),
    sichtbar: (an: boolean) => {
      if (an) {
        mp.ungeleseneChats = 0;
        v.zeichnen();
      }
    },
  };
}

registriere({ komponente: "funk", titel: "Funk", info: "Funkgespräche mit den Fahrzeugen, Statusmeldungen", bereich: "rechts", erstellen: funk });
registriere({ komponente: "chat", titel: "Chat", info: "Nachrichten an die anderen Disponenten (Multiplayer)", bereich: "rechts", erstellen: chat });
