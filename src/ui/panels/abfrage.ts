/**
 * Abfrage-Fenster: links der Anruf (Nummer, Dauer, Ortung, Halten, Stumm, Beenden),
 * in der Mitte das Gespräch, rechts der Leitfaden (Fragen passend zur Anrufart),
 * darunter die Info an die Besatzung.
 */
import { nachKlick } from "../../klick";
import { mikroAnbinden } from "../sprache";
import { kiBereit } from "../../abfrage/ki";
import { ktAntwortetGerade } from "../../abfrage/ktGespraech";
import { mp } from "../../net/mehrspieler";
import { store } from "../../data/store";
import { infoFreitext, sim, type Anruf, type Einsatz } from "../../sim/engine";
import { bereichName, type KtAuftrag } from "../../sim/kt";
import { istUeberstellung } from "../../sim/ktCodes";
import { el, esc, toast } from "../dom";
import { exportKnopf } from "../gespraechExport";
import { codeChip, ktFormular, ktFrageStellen } from "../ktView";
import { panelZeigen, registriere, type PanelKontext } from "../ws/arbeitsplatz";
import { auswahl, karteZeigen, onAuswahl, waehle } from "../ws/auswahl";
import { onLive, verlaufNachziehen, liveZeigen } from "./live";
import { notrufTeile, type NotrufTeile } from "./notrufAbfrage";
import { alleAnrufe, anrufAnnehmen, anrufAuflegen, anrufHalten, istMeins, meinGespraech } from "./telefon";

function fehler(p: Promise<unknown>): void {
  p.catch((e) => toast(String((e as Error).message ?? e), "error"));
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Stumm (Vorbereitung für Sprache): nur Anzeige, gilt für dieses Fenster */
let stumm = false;

type Ziel = { art: "rd"; e: Einsatz } | { art: "kt"; k: KtAuftrag };

/** Welcher Anruf wird gezeigt: mein laufendes Gespräch, sonst der ausgewählte Auftrag (wenn er einen Anruf hat) */
function zielFinden(): Ziel | null {
  const mein = meinGespraech();
  if (mein) {
    if (mein.art === "rd") {
      const e = sim.einsatz(mein.id);
      if (e) return { art: "rd", e };
    } else {
      const k = sim.ktAuftrag(mein.id);
      if (k) return { art: "kt", k };
    }
  }
  const a = auswahl();
  if (a.art === "einsatz" && a.id) {
    const e = sim.einsatz(a.id);
    if (e?.anruf) return { art: "rd", e };
  }
  if (a.art === "kt" && a.id) {
    const k = sim.ktAuftrag(a.id);
    if (k?.anruf) return { art: "kt", k };
  }
  return null;
}

function erstellen(ctx: PanelKontext) {
  const root = el("div", { class: "pl abfrage-fenster" });
  let ziel: Ziel | null = null;
  let teil: { refresh(): void; dispose(): void } | null = null;

  function aufbauen(): void {
    teil?.dispose();
    teil = null;
    root.innerHTML = "";
    if (!ziel) {
      root.appendChild(leer());
      return;
    }
    teil = ziel.art === "rd" ? notrufAnsicht(root, ziel.e) : ktAnsicht(root, ziel.k);
  }

  function leer(): HTMLElement {
    const box = el("div", { class: "abf-leer" });
    const gehalten = alleAnrufe().filter((x) => x.anruf.status === "gehalten" && istMeins(x.anruf));
    const klingelt = alleAnrufe().filter((x) => x.anruf.status === "klingelt");
    box.innerHTML = `<div class="abf-leer-icon">☎</div><b>Kein Gespräch</b><div class="muted">Nimm im Telefon einen Anruf an – dann erscheinen hier Gespräch und Leitfaden.</div>`;
    const knoepfe = el("div", { class: "row-btns" });
    for (const x of [...klingelt.slice(0, 2), ...gehalten.slice(0, 3)]) {
      const b = el("button", { class: `btn small${x.anruf.status === "klingelt" ? " primary" : ""}` }, `${x.anruf.status === "klingelt" ? "Annehmen" : "Zurückwechseln"}: ${x.nummer}`);
      b.addEventListener("click", () => void anrufAnnehmen(x.art, x.id));
      knoepfe.appendChild(b);
    }
    if (knoepfe.childElementCount) box.appendChild(knoepfe);
    return box;
  }

  function pruefen(): void {
    const neu = zielFinden();
    const altId = ziel ? (ziel.art === "rd" ? ziel.e.id : ziel.k.id) : null;
    const neuId = neu ? (neu.art === "rd" ? neu.e.id : neu.k.id) : null;
    // Objekte können ersetzt werden (Spiegel): neu aufbauen, wenn sich das Objekt geändert hat
    const altObj = ziel ? (ziel.art === "rd" ? ziel.e : ziel.k) : null;
    const neuObj = neu ? (neu.art === "rd" ? neu.e : neu.k) : null;
    if (altId !== neuId || altObj !== neuObj) {
      ziel = neu;
      aufbauen();
    } else if (!ziel) {
      // leere Ansicht: Knöpfe aktuell halten
      root.innerHTML = "";
      root.appendChild(leer());
    } else teil?.refresh();
    const a = ziel ? (ziel.art === "rd" ? ziel.e.anruf : ziel.k.anruf) : null;
    ctx.setzeBadge(a?.status === "aktiv" ? "●" : null, "klingelt");
  }

  let wartet = false;
  const spaeter = () => {
    if (wartet) return;
    wartet = true;
    setTimeout(() => {
      wartet = false;
      pruefen();
    }, 250);
  };
  const uhr = window.setInterval(() => nachKlick(() => teil?.refresh()), 1000);
  const aus = [sim.onChange(spaeter), onAuswahl(() => pruefen()), mp.onChange(spaeter)];
  pruefen();
  return {
    el: root,
    dispose: () => {
      window.clearInterval(uhr);
      aus.forEach((f) => f());
      teil?.dispose();
    },
  };
}

// ---------------------------------------------------------------- linke Spalte und Fußleiste (gemeinsam)

const NETZ: [RegExp, string][] = [
  [/^0664/, "A1"],
  [/^0676|^0650/, "Magenta"],
  [/^0699|^0660/, "Drei"],
  [/^0680|^0681|^0688/, "Spusu / sonstige"],
];

function uhrzeit(t: number): string {
  return new Date(t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Tonspur-Animation (Vorbereitung für Sprache): bewegt sich, solange gesprochen wird */
export function welle(balken = 28): HTMLElement {
  const w = el("div", { class: "abf-welle" });
  for (let i = 0; i < balken; i++) {
    const b = el("span");
    b.style.animationDelay = `${(-(i * 137) % 900) / 1000}s`;
    b.style.setProperty("--h", `${30 + ((i * 53) % 70)}%`);
    w.appendChild(b);
  }
  return w;
}

interface Spalte {
  el: HTMLElement;
  fuss: HTMLElement;
  refresh(): void;
  dispose(): void;
}

function anrufSpalte(o: {
  typ: "notruf" | "kt" | "sek";
  nummer: string;
  telefon: string;
  anruf: () => Anruf | null;
  art: "rd" | "kt";
  id: string;
  sprache?: string;
  /** Abschnitte unter den Anrufdaten */
  extra: HTMLElement[];
  maske: () => void;
  /** aufgenommene Rückrufnummer lesen / übernehmen */
  rueckruf: { wert: () => string; setze: (nr: string) => Promise<unknown> };
}): Spalte {
  const spalte = el("div", { class: "abf-links" });
  const karte = el("div", { class: `abf-karte typ-${o.typ}` });
  const titel = { notruf: "Notruf 144", kt: "KT-Hotline", sek: "Überstellung" }[o.typ];
  karte.innerHTML = `<div class="abf-karte-icon">📞</div><div class="abf-karte-txt"><div class="abf-karte-titel">${titel}<span class="abf-dauer"></span></div><b>${esc(o.telefon)}</b><span class="muted">${esc(o.nummer)}</span></div><div class="abf-signal"><i></i><i></i><i></i><i></i></div>`;
  const dauer = karte.querySelector<HTMLElement>(".abf-dauer")!;
  const w = welle();
  const daten = el("div", { class: "abf-daten" });
  const mobil = /^06/.test(o.telefon);
  const netz = mobil ? (NETZ.find(([r]) => r.test(o.telefon))?.[1] ?? "Mobilfunk") : "Festnetz";
  const zusatz = el("details", { class: "abf-zusatz" });
  zusatz.innerHTML = `<summary>Zusatzinformationen</summary><table>
    <tr><td>Anrufart</td><td>${esc(titel)}</td></tr>
    <tr><td>Quelle</td><td>${mobil ? "Mobiltelefon" : "Festnetz"}</td></tr>
    <tr><td>Sprache</td><td>${esc(o.sprache ?? "Deutsch")}</td></tr>
    <tr><td>Rufnummer</td><td>${esc(o.telefon)}</td></tr>
    <tr><td>Netzbetreiber</td><td>${esc(netz)}</td></tr>
    </table>`;
  const maskeB = el("button", { class: "btn primary abf-maske" }, `${o.art === "rd" ? "Einsatzmaske" : "KT-Maske"} öffnen →`);
  maskeB.addEventListener("click", o.maske);
  // Rufnummer als Rückrufnummer übernehmen
  const nrB = el("button", { class: "btn small abf-nummer", type: "button" });
  nrB.addEventListener("click", () => fehler(o.rueckruf.setze(o.telefon)));
  const nrZeigen = () => {
    const hat = o.rueckruf.wert();
    nrB.textContent = hat ? `✓ Rückruf: ${hat}` : "📞 Nummer übernehmen";
    nrB.classList.toggle("ok", !!hat);
    nrB.title = hat ? "Rückrufnummer ist aufgenommen" : "Angezeigte Rufnummer als Rückrufnummer in den Auftrag übernehmen";
  };
  nrZeigen();
  spalte.append(karte, nrB, w, daten, ...o.extra, maskeB, zusatz, exportKnopf(o.art, () => o.id));

  // Fußleiste: Beenden, Halten, Stumm … Zur Maske
  const fuss = el("div", { class: "abf-fuss" });
  const ausLive = onLive((id, text) => {
    if (id === o.id) w.classList.toggle("spricht", !!text);
  });

  let knopfKey = "";
  const refresh = () => {
    const x = o.anruf();
    nrZeigen();
    if (!x) return;
    const t = sim.state.zeit;
    const meins = istMeins(x);
    dauer.textContent = x.status === "beendet" ? "" : mmss(t - x.seit);
    karte.classList.toggle("klingelt", x.status === "klingelt");
    w.classList.toggle("an", x.status === "aktiv");
    const wer = x.angenommenVon ? (meins && !mp.aktiv ? x.angenommenVon.name : meins ? "du" : x.angenommenVon.name) : "–";
    const st = { klingelt: "klingelt", aktiv: "aktiv", gehalten: "gehalten", verpasst: "verpasst", beendet: "beendet" }[x.status];
    daten.innerHTML = `<div><span>Anruferstatus</span><b class="abf-st ${x.status}">● ${st}</b></div>
      <div><span>Angenommen von</span><b>${esc(wer)}</b></div>
      <div><span>Anrufer</span><b>${kiBereit() ? "KI" : "feste Antworten"}</b></div>${
        x.status === "gehalten" && x.haltenBis ? `<div><span>Legt auf in</span><b class="alert-text">ca. ${mmss(x.haltenBis - t)}</b></div>` : ""
      }`;
    const key = `${x.status}|${meins}|${stumm}`;
    if (key === knopfKey) return;
    knopfKey = key;
    fuss.innerHTML = "";
    const knopf = (label: string, cls: string, fn: () => void, titel = "") => {
      const b = el("button", { class: `btn ${cls}`, title: titel }, label);
      b.addEventListener("click", fn);
      fuss.appendChild(b);
      return b;
    };
    if (x.status === "klingelt") knopf("📞 Annehmen", "primary breit", () => void anrufAnnehmen(o.art, o.id));
    if (x.status === "verpasst") knopf("📞 Zurückrufen", "primary breit", () => void anrufAnnehmen(o.art, o.id));
    if ((x.status === "aktiv" || x.status === "gehalten") && meins) knopf("✆ Anruf beenden", "danger breit", () => anrufAuflegen(o.art, o.id));
    if (x.status === "aktiv" && meins) knopf("⏸ Halten", "", () => anrufHalten(o.art, o.id), "Anrufer in die Warteschleife – andere Disponenten können ihn dann übernehmen");
    if (x.status === "gehalten") knopf(meins ? "▶ Zurückwechseln" : "▶ Übernehmen", "primary", () => void anrufAnnehmen(o.art, o.id));
    if ((x.status === "aktiv" || x.status === "gehalten") && meins) {
      const sb = knopf(stumm ? "🔇 Stumm" : "🎙 Stummschalten", stumm ? "aktiv" : "", () => {
        stumm = !stumm;
        knopfKey = "";
        refresh();
      }, "Für das Sprechen per Mikrofon (kommt später)");
      sb.classList.toggle("aktiv", stumm);
    }
    fuss.appendChild(el("span", { class: "spacer" }));
    const zur = knopf(`Zur ${o.art === "rd" ? "Einsatzmaske" : "KT-Maske"} →`, "ok", o.maske);
    zur.classList.add("abf-zur");
  };
  refresh();
  return { el: spalte, fuss, refresh, dispose: ausLive };
}

/** Gesprächsverlauf mit Uhrzeiten (wird in den Verlauf der Teile eingehängt) */
function zeitenNachtragen(verlauf: HTMLElement, a: Anruf | null | undefined): void {
  if (!a) return;
  const msgs = verlauf.querySelectorAll<HTMLElement>(".anruf-msg:not(.live)");
  msgs.forEach((d, i) => {
    const m = a.gespraech[i];
    if (!m || d.querySelector(".msg-zeit")) return;
    d.appendChild(el("span", { class: "msg-zeit" }, uhrzeit(m.zeit)));
  });
}

function mitteKopf(): { kopf: HTMLElement; welle: HTMLElement; aufz: HTMLElement } {
  const kopf = el("div", { class: "abf-mitte-kopf" });
  const w = welle(36);
  const aufz = el("span", { class: "abf-aufz" }, "● Gespräch läuft");
  kopf.append(el("b", {}, "Gespräch"), w, aufz);
  return { kopf, welle: w, aufz };
}

// ---------------------------------------------------------------- Notruf

function notrufAnsicht(root: HTMLElement, e: Einsatz): { refresh(): void; dispose(): void } {
  const t: NotrufTeile = notrufTeile(e);
  const telefon = alleAnrufe(true).find((x) => x.id === e.id)?.telefon ?? "";

  // Standort aus dem Netz (Ortung)
  const ortung = el("div", { class: "abf-ortung" });
  const ortKnopf = el("button", { class: "btn small" }, "📡 Ortung");
  ortKnopf.addEventListener("click", () => fehler(sim.call("ortung", e.id)));
  const ortErg = el("div", { class: "abf-ortung-erg" });
  ortung.append(ortErg, ortKnopf);
  let ortKey = "";
  const ortungZeigen = () => {
    const a = e.anruf;
    const o = a?.ortung;
    ortKnopf.disabled = !a || a.status === "klingelt" || o?.status === "laeuft";
    const key = JSON.stringify([o ?? null, e.adresse?.label]);
    if (key === ortKey) return;
    ortKey = key;
    ortErg.innerHTML = "";
    if (!o) {
      ortErg.innerHTML = `<span class="muted">${e.adresse ? `📍 ${esc(e.adresse.label)}` : "Noch nicht geortet"}</span>`;
      return;
    }
    if (o.status === "laeuft") {
      ortErg.innerHTML = `<span class="muted">Ortung läuft …</span>`;
      return;
    }
    const lat = o.lat!;
    const lon = o.lon!;
    ortErg.innerHTML = `<div>📍 <b>${esc(o.art ?? "")}</b> ±${o.radius} m</div>`;
    const knoepfe = el("div", { class: "row-btns" });
    const zeigen = el("button", { class: "btn small" }, "Karte");
    zeigen.addEventListener("click", () => karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16));
    const nehmen = el("button", { class: "btn small" }, "Als Einsatzort");
    nehmen.addEventListener("click", () => {
      const label = `Ortung ±${o.radius} m (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
      fehler(sim.call("aktualisiere", e.id, { adresse: { lat, lon, label } }));
      karteZeigen(lat, lon, o.radius! > 500 ? 13 : 16);
    });
    knoepfe.append(zeigen, nehmen);
    ortErg.appendChild(knoepfe);
  };

  const zurMaske = () => waehle("einsatz", e.id, { karte: true });
  const links = anrufSpalte({
    typ: "notruf",
    nummer: e.nummer,
    telefon,
    anruf: () => e.anruf ?? null,
    art: "rd",
    id: e.id,
    sprache: e.wahr.abfrage?.anrufer.sprache,
    rueckruf: { wert: () => e.telefon ?? "", setze: (nr) => sim.call("aktualisiere", e.id, { telefon: nr }) },
    extra: [el("div", { class: "abf-titel" }, "Standort (aus Netz)"), ortung, el("div", { class: "abf-titel" }, "Vorläufiges Ergebnis"), t.codeZeile, t.aufloesung],
    maske: zurMaske,
  });

  // Mitte: Gespräch, darunter Info an RTW
  const mitte = el("div", { class: "abf-mitte" });
  const mk = mitteKopf();
  mitte.append(mk.kopf, t.verlauf, t.form);
  const info = el("div", { class: "abf-info" });
  const infoFeld = el("textarea", { rows: "2", placeholder: "Info an RTW – z. B. Zufahrt über den Hof, Hund im Haus" });
  infoFeld.value = e.infoRtw;
  infoFeld.addEventListener("input", () => {
    const auto = e.infoAuto ?? "";
    if (!auto || !infoFeld.value.startsWith(auto)) return;
    const rest = infoFeld.value.slice(auto.length);
    if (rest.trim() && !/^\s*\/\//.test(rest)) {
      infoFeld.value = `${auto} // ${rest.trimStart()}`;
      infoFeld.selectionStart = infoFeld.selectionEnd = infoFeld.value.length;
    }
  });
  infoFeld.addEventListener("change", () => {
    const auto = e.infoAuto ?? "";
    const frei = infoFreitext(infoFeld.value, auto);
    const wert = auto && infoFeld.value.startsWith(auto) ? (frei ? `${auto} // ${frei}` : auto) : infoFeld.value;
    infoFeld.value = wert;
    fehler(sim.call("aktualisiere", e.id, { infoRtw: wert }));
  });
  info.append(el("div", { class: "abf-titel" }, "Info an RTW (automatisch + Freitext)"), infoFeld, el("div", { class: "muted small" }, "Vorne steht, was die Abfrage ergibt (z. B. „m 67J B~ A+“), eigener Text kommt dahinter."));
  mitte.appendChild(info);

  // Rechts: Abfrage
  const rechts = el("div", { class: "abf-rechts" });
  rechts.append(store.schema ? t.abfrage : el("div", { class: "muted pad" }, "Kein Abfrageschema importiert (Einstellungen → Leitstelle → Einsatzcodes & Abfrage)."));

  const grid = el("div", { class: "abf-grid" });
  grid.append(links.el, mitte, rechts);
  root.append(grid, links.fuss);

  const refresh = () => {
    links.refresh();
    t.refresh();
    zeitenNachtragen(t.verlauf, e.anruf);
    const aktiv = e.anruf?.status === "aktiv";
    mk.welle.classList.toggle("an", aktiv);
    mk.aufz.hidden = !aktiv;
    ortungZeigen();
    if (document.activeElement !== infoFeld && infoFeld.value !== e.infoRtw) infoFeld.value = e.infoRtw;
  };
  const ausLive = onLive((id, text) => id === e.id && mk.welle.classList.toggle("spricht", !!text));
  refresh();
  return {
    refresh,
    dispose: () => {
      t.dispose();
      links.dispose();
      ausLive();
    },
  };
}

// ---------------------------------------------------------------- KT-Hotline / Überstellung

function ktAnsicht(root: HTMLElement, k: KtAuftrag): { refresh(): void; dispose(): void } {
  const sek = istUeberstellung(k.d) || !!k.wahr?.d?.sek;
  const telefon = alleAnrufe(true).find((x) => x.id === k.id)?.telefon ?? k.d.telefon;
  const ich = () => !!k.anruf && istMeins(k.anruf) && !!k.anruf.angenommenVon;

  // Mitte: Gespräch
  const verlauf = el("div", { class: "anruf-verlauf" });
  const live = el("div", { class: "anruf-msg anrufer live", hidden: "" });
  const form = el("form", { class: "anruf-form" });
  const eingabe = el("input", { type: "text", placeholder: "Frage an den Anrufer … (Enter)" });
  form.append(
    eingabe,
    mikroAnbinden({
      input: eingabe,
      rang: 2,
      aktiv: () => ich() && k.anruf?.status === "aktiv",
      senden: () => form.requestSubmit(),
      hinweis: () => "Krankentransport, Überstellung. Abholung, Termin, Station, Liegend, Sitzend, Tragsessel, Krems, Tulln, Hollabrunn, Klosterneuburg.",
    }),
    el("button", { class: "btn small primary", type: "submit" }, "Fragen"),
  );
  const zeigeLive = (text: string | null) => liveZeigen(verlauf, live, k.id, text);
  const ausLive = onLive((id, text) => id === k.id && zeigeLive(text));
  const stelle = (text: string) => ktFrageStellen(k, text).then(() => refresh());
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = eingabe.value.trim();
    if (!t || !ich()) return;
    eingabe.value = "";
    void stelle(t);
  });

  const codeBox = el("div", { class: "abf-code" });
  const links = anrufSpalte({
    typ: sek ? "sek" : "kt",
    nummer: k.nummer,
    telefon,
    rueckruf: { wert: () => k.d.telefon, setze: (nr) => sim.call("ktSetze", k.id, { telefon: nr }) },
    anruf: () => k.anruf,
    art: "kt",
    id: k.id,
    extra: [el("div", { class: "abf-titel" }, "Code"), codeBox],
    maske: () => {
      waehle("kt", k.id);
      panelZeigen("kt");
    },
  });

  const mitte = el("div", { class: "abf-mitte" });
  const mk = mitteKopf();
  mitte.append(mk.kopf, verlauf, form);

  // Hinweise für die Besatzung
  const info = el("div", { class: "abf-info" });
  const infoFeld = el("textarea", { rows: "2", placeholder: sek ? "Hinweise für die Besatzung – z. B. intubiert, 2 Perfusoren, Übergabe an OA …" : "Hinweise für die Besatzung – z. B. 3. Stock ohne Lift, bis zum Auto gehfähig" });
  infoFeld.value = k.d.patient.info;
  infoFeld.addEventListener("change", () => fehler(sim.call("ktSetze", k.id, { patient: { ...k.d.patient, info: infoFeld.value.trim() } })));
  info.append(el("div", { class: "abf-titel" }, "Hinweise für die Besatzung"), infoFeld);
  mitte.appendChild(info);

  // Rechts: Eingabe der Auftragsdaten (🗨 stellt die Frage an den Anrufer)
  const rechts = el("div", { class: "abf-rechts" });
  const formular = ktFormular(k, (text, f) => ktFrageStellen(k, text, f).then(() => refresh()), { info: false });
  rechts.append(formular.el);

  const grid = el("div", { class: "abf-grid" });
  grid.append(links.el, mitte, rechts);
  root.append(grid, links.fuss);

  let codeKey = "";
  const refresh = () => {
    links.refresh();
    const a = k.anruf;
    if (a) verlaufNachziehen(verlauf, live, a.gespraech, k.id);
    zeitenNachtragen(verlauf, a);
    form.hidden = !(a?.status === "aktiv" && ich());
    eingabe.disabled = ktAntwortetGerade(k.id);
    mk.welle.classList.toggle("an", a?.status === "aktiv");
    mk.aufz.hidden = a?.status !== "aktiv";
    const ck = `${k.d.code}|${k.d.von?.label}|${k.d.nach?.label}`;
    if (ck !== codeKey) {
      codeKey = ck;
      const b = k.d.nach?.bereich ? ` (${bereichName(k.d.nach.bereich)})` : "";
      codeBox.innerHTML = `${codeChip(k.d.code)}<div class="muted small">${esc(k.d.von?.label ?? "?")} → ${esc(k.d.nach?.label ?? "?")}${esc(b && !k.d.nach?.label.includes(b.slice(2, -1)) ? b : "")}</div>`;
    }
    if (document.activeElement !== infoFeld && infoFeld.value !== k.d.patient.info) infoFeld.value = k.d.patient.info;
    formular.refresh();
  };
  const ausWelle = onLive((id, text) => id === k.id && mk.welle.classList.toggle("spricht", !!text));
  refresh();
  return {
    refresh,
    dispose: () => {
      ausLive();
      ausWelle();
      links.dispose();
    },
  };
}

registriere({
  komponente: "abfrage",
  titel: "Abfrage",
  info: "Gespräch mit dem Anrufer, Leitfaden, Info an die Besatzung",
  bereich: "rechts",
  einmalig: true,
  erstellen,
});
