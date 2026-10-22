/** Einstellungen → Persönlich: Aussehen, Größe, Anrufe, Töne, Kurzbefehle, Statusfarben, Anordnungen. */
import { kiPrefs, setKiPrefs } from "../../abfrage/ki";
import { inTauri, pickTextFile, saveTextFile } from "../../platform";
import { sim } from "../../sim/engine";
import type { StatusKey } from "../../sim/settings";
import { FUNK_FARBEN, FUNK_QUELLE, FUNKGRUPPEN } from "../../sim/funkgruppen";
import { confirmDialog } from "../dialog";
import { el, esc, toast } from "../dom";
import {
  anordnungAnwenden,
  anordnungen,
  anordnungEinsammeln,
  anordnungImportieren,
  anordnungLoeschen,
  anordnungZuruecksetzen,
  onPanelsGeaendert,
} from "./arbeitsplatz";
import { IST_HAUPT } from "./bus";
import { tasteAufnehmen, tasteText } from "./kuerzel";
import { istDunkel, KUERZEL_LABEL, KUERZEL_STANDARD, onPers, pers, setzePers, type KuerzelId, type Thema } from "./persoenlich";
import { FELD_LABEL, VORLAGEN as FARB_VORLAGEN } from "./farben";
import {
  deutscheStimmen,
  geschlechtVon,
  mikrofone,
  mikroAnbinden,
  modellLaden,
  modellLoeschen,
  MODELLE as SPRACH_MODELLE,
  onStimmen,
  probe,
  setzeSprache,
  sprachPrefs,
  sprachStatus,
  TASTEN,
  testZiel,
  vorlesenMoeglich,
  ausgabeGeraete,
  piperLaden,
  piperLoeschen,
  piperStatus,
  PIPER_STIMMEN,
  SUPERTONIC_STIMMEN,
  supertonicLaden,
  supertonicLoeschen,
  supertonicStatus,
  type SprachPrefs,
} from "../sprache";

/** laufende Downloads der Sprachmodelle (bleibt beim Neuzeichnen erhalten) */
const ladeStand: Record<string, string> = {};
import {
  DATEI_REGELN,
  dateiHinzufuegen,
  dateiLoeschen,
  dateiUmbenennen,
  eigeneDateien,
  EREIGNIS_LABEL,
  IST_KLINGELTON,
  spielen,
  STANDARD_SOUND,
  VORLAGEN as TON_VORLAGEN,
  type EigeneDatei,
  type SoundEreignis,
} from "../sounds";

const STATUS: StatusKey[] = ["freiWache", "freiFunk", "alarmWache", "alarmFunk", "alarmiert", "zumBO", "amBO", "zumZO", "amZO", "dienstfahrt", "bereitschaft", "abgemeldet"];

export function persoenlichView(container: HTMLElement): { refresh(): void } {
  function render(): void {
    const p = pers();
    container.innerHTML = "";
    const page = el("div", { class: "settings" });
    container.appendChild(page);
    page.appendChild(el("div", { class: "set-hinweis" }, "Diese Einstellungen gelten nur für dich auf diesem Rechner – auch im Multiplayer."));
    const section = (title: string, hint?: string) => {
      const s = el("section", { class: "set-sec" });
      s.appendChild(el("h3", {}, title));
      if (hint) s.appendChild(el("p", { class: "muted" }, hint));
      page.appendChild(s);
      return s;
    };
    const zeile = (sec: HTMLElement, label: string, feld: HTMLElement, hilfe?: string) => {
      const r = el("div", { class: "pers-zeile" });
      const l = el("div", { class: "pers-label" });
      l.appendChild(el("div", {}, label));
      if (hilfe) l.appendChild(el("div", { class: "muted small" }, hilfe));
      r.append(l, feld);
      sec.appendChild(r);
    };
    const seg = <T extends string>(werte: [T, string][], aktuell: T, onSet: (v: T) => void) => {
      const s = el("div", { class: "seg" });
      for (const [v, label] of werte) {
        const b = el("button", { type: "button", class: v === aktuell ? "active" : "" }, label);
        b.addEventListener("click", () => onSet(v));
        s.appendChild(b);
      }
      return s;
    };
    const schalter = (wert: boolean, onSet: (v: boolean) => void) => {
      const l = el("label", { class: "schalter" });
      const c = el("input", { type: "checkbox" });
      c.checked = wert;
      c.addEventListener("change", () => onSet(c.checked));
      l.append(c, el("span", { class: "schalter-knopf" }));
      return l;
    };

    // ---- Aussehen
    const a = section("Aussehen");
    zeile(
      a,
      "Farbschema",
      seg<Thema>(
        [
          ["hell", "☀ Hell"],
          ["dunkel", "☾ Dunkel"],
          ["system", "Wie das System"],
        ],
        p.thema,
        (v) => setzePers({ thema: v }),
      ),
    );
    zeile(
      a,
      "Karte",
      seg<"auto" | "hell">(
        [
          ["auto", "passt sich an"],
          ["hell", "immer hell"],
        ],
        p.karte,
        (v) => setzePers({ karte: v }),
      ),
      "Im dunklen Farbschema wird die Karte dunkel – oder sie bleibt hell.",
    );
    const groesse = el("div", { class: "pers-slider" });
    const slider = el("input", { type: "range", min: "75", max: "150", step: "5" });
    slider.value = String(p.skalierung);
    const wert = el("span", { class: "pers-wert" }, `${p.skalierung} %`);
    slider.addEventListener("input", () => (wert.textContent = `${slider.value} %`));
    slider.addEventListener("change", () => setzePers({ skalierung: Number(slider.value) }));
    const std = el("button", { class: "btn small" }, "100 %");
    std.addEventListener("click", () => setzePers({ skalierung: 100 }));
    groesse.append(slider, wert, std);
    zeile(a, "Größe der Oberfläche", groesse, "Schrift, Knöpfe und Abstände – praktisch für große oder kleine Bildschirme.");
    zeile(a, "Bewegungen", schalter(p.animationen, (v) => setzePers({ animationen: v })), "Weiche Übergänge beim Öffnen und Wechseln.");
    zeile(
      a,
      "Wetter in der 3D-Ansicht",
      schalter(p.wetter3d !== false, (v) => setzePers({ wetter3d: v })),
      "Leichter Regen, Schnee, Hagel, Dunst und Blitze. Ohne „Bewegungen“ steht der Regen still und es gibt keine Blitze.",
    );

    const poiWahl = el("select") as HTMLSelectElement;
    for (const [v, l] of [["0", "immer"], ["10", "ab Zoom 10 (Bezirk)"], ["12", "ab Zoom 12 (Gemeinde)"], ["13", "ab Zoom 13"], ["14", "ab Zoom 14 (Ortskern) – Standard"], ["15", "ab Zoom 15"], ["16", "ab Zoom 16 (Straßen)"], ["24", "nie"]])
      poiWahl.appendChild(el("option", { value: v }, l));
    poiWahl.value = String(p.poiZoom ?? 14);
    poiWahl.addEventListener("change", () => setzePers({ poiZoom: Number(poiWahl.value) }));
    zeile(
      a,
      "Orte (POIs) auf der Karte",
      poiWahl,
      "Schulen, Geschäfte, Sportplätze … erscheinen erst, wenn man so nah herangezoomt hat. Wichtige Orte (Pflegeheime, Bahnhöfe, Landeplätze, große Einrichtungen) schon drei Stufen früher.",
    );

    // ---- Farben
    const fa = section("Farben", "Vorlage auswählen und bei Bedarf einzelne Farben ändern. Die Schrift passt sich automatisch an, damit sie lesbar bleibt.");
    const vorl = el("div", { class: "farb-vorlagen" });
    for (const [id, v] of Object.entries(FARB_VORLAGEN)) {
      const satz = istDunkel() ? v.dunkel : v.hell;
      const b = el("button", { type: "button", class: `farb-vorlage${(p.farbVorlage ?? "noe") === id ? " active" : ""}` });
      const leiste = satz.leiste ?? (istDunkel() ? "#191c21" : "#ffffff");
      const akzent = satz.akzent ?? (istDunkel() ? "#4d93e6" : "#0b55a8");
      const hervor = satz.hervor ?? (istDunkel() ? "#ffcc00" : akzent);
      const grund = satz.hintergrund ?? (istDunkel() ? "#0f1114" : "#e9edf2");
      b.innerHTML = `<span class="fv-muster" style="background:${grund}"><i style="background:${leiste}"></i><b style="background:${akzent}"></b><b style="background:${hervor}"></b></span><span>${esc(v.name)}</span>`;
      b.addEventListener("click", () => setzePers({ farbVorlage: id, farben: { hell: {}, dunkel: {} } }));
      vorl.appendChild(b);
    }
    fa.appendChild(vorl);
    const modus = istDunkel() ? "dunkel" : "hell";
    fa.appendChild(el("div", { class: "muted small" }, `Eigene Farben für das ${modus === "dunkel" ? "dunkle" : "helle"} Farbschema (für das andere Schema oben umschalten):`));
    const fGrid2 = el("div", { class: "status-farben" });
    const basisSatz = (FARB_VORLAGEN[p.farbVorlage ?? "noe"] ?? FARB_VORLAGEN.noe)[modus];
    const cssWert = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const STANDARD_CSS: Record<string, string> = { akzent: "--blue", leiste: "--panel", hintergrund: "--bg", fenster: "--panel", warn: "--accent" };
    for (const [feld, label] of Object.entries(FELD_LABEL)) {
      const c = el("input", { type: "color" });
      const eigen = p.farben[modus][feld];
      const wert = eigen ?? basisSatz[feld as keyof typeof basisSatz] ?? cssWert(STANDARD_CSS[feld]);
      c.value = /^#[0-9a-f]{6}$/i.test(wert) ? wert : "#888888";
      c.addEventListener("change", () => setzePers({ farben: { ...pers().farben, [modus]: { ...pers().farben[modus], [feld]: c.value } } }));
      const r = el("label", { class: "status-farbe" });
      r.append(c, el("span", {}, label));
      if (eigen) r.appendChild(el("span", { class: "muted small" }, "(eigene)"));
      fGrid2.appendChild(r);
    }
    fa.appendChild(fGrid2);
    const fKnoepfe = el("div", { class: "row-btns" });
    const fZurueck = el("button", { class: "btn small" }, "Eigene Farben zurücksetzen");
    fZurueck.addEventListener("click", () => setzePers({ farben: { hell: {}, dunkel: {} } }));
    const fExport = el("button", { class: "btn small" }, "Design als Datei speichern …");
    fExport.addEventListener("click", () => {
      const x = pers();
      const design = { leitwerkDesign: 1, farbVorlage: x.farbVorlage, farben: x.farben, statusFarben: x.statusFarben, funkFarben: x.funkFarben };
      void saveTextFile("leitwerk-design.json", JSON.stringify(design, null, 1), { name: "Design", extensions: ["json"] });
    });
    const fImport = el("button", { class: "btn small" }, "Design laden …");
    fImport.addEventListener("click", async () => {
      const f = await pickTextFile(".json");
      if (!f) return;
      try {
        const d = JSON.parse(f.text);
        if (!d || d.leitwerkDesign !== 1) throw new Error("Das ist keine LeitWerk-Design-Datei");
        setzePers({
          farbVorlage: typeof d.farbVorlage === "string" ? d.farbVorlage : "noe",
          farben: { hell: { ...(d.farben?.hell ?? {}) }, dunkel: { ...(d.farben?.dunkel ?? {}) } },
          statusFarben: { ...(d.statusFarben ?? {}) },
          funkFarben: { ...(d.funkFarben ?? {}) },
        });
        toast("Design übernommen");
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
      }
    });
    fKnoepfe.append(fZurueck, fExport, fImport);
    fa.appendChild(fKnoepfe);

    // ---- Anrufe und Töne
    const t = section("Anrufe und Töne", "Wer keine Notrufe annimmt, bekommt kein Klingeln und kein automatisch geöffnetes Telefon (z. B. als reiner Funk- oder KT-Disponent).");
    zeile(t, "Ich nehme Notrufe an", schalter(p.notrufe, (v) => setzePers({ notrufe: v })));
    zeile(t, "Ich nehme die KT-Hotline an", schalter(p.ktHotline, (v) => setzePers({ ktHotline: v })));
    zeile(t, "Klingelton", schalter(kiPrefs().klingelton, (v) => setKiPrefs({ klingelton: v })));
    const laut = el("div", { class: "pers-slider" });
    const lautS = el("input", { type: "range", min: "0", max: "100", step: "5" });
    lautS.value = String(p.lautstaerke);
    const lautW = el("span", { class: "pers-wert" }, `${p.lautstaerke} %`);
    lautS.addEventListener("input", () => (lautW.textContent = `${lautS.value} %`));
    lautS.addEventListener("change", () => setzePers({ lautstaerke: Number(lautS.value) }));
    laut.append(lautS, lautW);
    zeile(t, "Lautstärke", laut);
    zeile(t, "Funk-Piep, wenn ein Fahrzeug ruft", schalter(p.funkTon, (v) => setzePers({ funkTon: v })));
    if (inTauri()) {
      const tSel = el("select");
      tSel.appendChild(el("option", { value: "" }, "wie das System"));
      void ausgabeGeraete().then((gs) => {
        for (const g of gs) tSel.appendChild(el("option", { value: g }, g));
        tSel.value = pers().tonGeraet ?? "";
      });
      tSel.addEventListener("change", () => setzePers({ tonGeraet: tSel.value }));
      zeile(t, "Ausgabegerät für Töne", tSel, "Z. B. Klingeln über den Lautsprecher, Stimmen im Headset (das Gerät für Stimmen stellst du unter „Sprache“ ein).");
    }
    // Töne je Ereignis
    const toene = el("div", { class: "toene" });
    const dateienListe: EigeneDatei[] = [];
    const toeneBauen = () => {
      toene.innerHTML = "";
      for (const [ev, label] of Object.entries(EREIGNIS_LABEL) as [SoundEreignis, string][]) {
        const r = el("div", { class: "ton-zeile" });
        const sel = el("select");
        const aktuell = p.sounds[ev]?.quelle ?? STANDARD_SOUND[ev];
        const gv = el("optgroup", { label: "Mitgeliefert" });
        for (const [id, v] of Object.entries(TON_VORLAGEN)) gv.appendChild(el("option", { value: `vorlage:${id}` }, v.name));
        sel.appendChild(gv);
        const passend = dateienListe.filter((d) => (IST_KLINGELTON[ev] ? d.sek <= DATEI_REGELN.klingel.maxSek : d.sek <= DATEI_REGELN.kurz.maxSek));
        if (passend.length) {
          const gd = el("optgroup", { label: "Eigene Dateien" });
          for (const d of passend) gd.appendChild(el("option", { value: `datei:${d.id}` }, d.name));
          sel.appendChild(gd);
        }
        sel.appendChild(el("option", { value: "aus" }, "– aus –"));
        sel.value = aktuell;
        if (sel.value !== aktuell) sel.value = STANDARD_SOUND[ev];
        const laut = el("input", { type: "range", min: "0", max: "100", step: "5" });
        laut.value = String(p.sounds[ev]?.laut ?? 70);
        const speichern = () => setzePers({ sounds: { ...pers().sounds, [ev]: { quelle: sel.value, laut: Number(laut.value) } } });
        sel.addEventListener("change", () => {
          spielen(ev, sel.value, Number(laut.value));
          speichern();
        });
        laut.addEventListener("change", speichern);
        const probe = el("button", { class: "btn small", type: "button", title: "Probehören" }, "▶");
        probe.addEventListener("click", () => spielen(ev, sel.value, Number(laut.value)));
        r.append(el("span", { class: "ton-label" }, label), sel, laut, probe);
        toene.appendChild(r);
      }
    };
    zeile(t, "Töne", toene, "Für jedes Ereignis eigener Ton und eigene Lautstärke. Eigene Dateien lädst du weiter unten hoch.");
    toeneBauen();
    void eigeneDateien().then((ds) => {
      dateienListe.push(...ds);
      if (ds.length) toeneBauen();
    });
    zeile(
      t,
      "Knopf „Gespräch exportieren“",
      schalter(p.exportKnopf, (v) => setzePers({ exportKnopf: v })),
      "Speichert Gespräch, Abfrage, Anweisung an die KI und Protokoll als Datei – bei Notfällen, Krankentransporten und Überstellungen.",
    );

    // ---- Sprache
    const sp = sprachPrefs();
    const spr = section(
      "Sprache",
      "Anrufer und Funk vorlesen lassen und Fragen sprechen statt tippen. Die Abfrage selbst ändert sich nicht: gesprochen wird nur, was sonst geschrieben steht.",
    );
    if (!vorlesenMoeglich()) spr.appendChild(el("p", { class: "muted small" }, "Vorlesen ist hier nicht verfügbar."));
    zeile(spr, "Anrufer vorlesen", schalter(sp.vorlesen, (v) => setzeSprache({ vorlesen: v })), "Notruf und KT-Hotline – nur bei dem, der das Gespräch führt.");
    zeile(spr, "Funk vorlesen", schalter(sp.funkVorlesen, (v) => setzeSprache({ funkVorlesen: v })), "Was die Fahrzeuge in deinen Funkgesprächen sagen.");
    const regler = (wert: number, min: number, max: number, onSet: (v: number) => void, fmt = (v: number) => `${v} %`) => {
      const box = el("div", { class: "pers-slider" });
      const r = el("input", { type: "range", min: String(min), max: String(max), step: "5" });
      r.value = String(wert);
      const w = el("span", { class: "pers-wert" }, fmt(wert));
      r.addEventListener("input", () => (w.textContent = fmt(Number(r.value))));
      r.addEventListener("change", () => onSet(Number(r.value)));
      box.append(r, w);
      return box;
    };
    zeile(spr, "Lautstärke der Stimmen", regler(sp.laut, 0, 100, (v) => setzeSprache({ laut: v })));
    zeile(spr, "Sprechtempo", regler(sp.tempo, 70, 140, (v) => setzeSprache({ tempo: v })));
    const stimmenBox = el("div", { class: "stimmen" });
    const stimmenBauen = () => {
      stimmenBox.innerHTML = "";
      const alle = deutscheStimmen();
      for (const [g, label, key] of [
        ["w", "Frauenstimme", "stimmeW"],
        ["m", "Männerstimme", "stimmeM"],
      ] as const) {
        const r = el("div", { class: "ton-zeile" });
        const sel = el("select");
        sel.appendChild(el("option", { value: "" }, "automatisch (wechselt je Anrufer)"));
        for (const v of alle) sel.appendChild(el("option", { value: v.name }, `${v.name} (${v.lang})${geschlechtVon(v) === "?" ? "" : geschlechtVon(v) === "w" ? " · weiblich" : " · männlich"}`));
        sel.value = sprachPrefs()[key];
        sel.addEventListener("change", () => {
          setzeSprache({ [key]: sel.value } as Partial<SprachPrefs>);
          probe(g);
        });
        const b = el("button", { class: "btn small", type: "button", title: "Probehören" }, "▶");
        b.addEventListener("click", () => probe(g));
        r.append(el("span", { class: "ton-label" }, label), sel, b);
        stimmenBox.appendChild(r);
      }
      if (!alle.length)
        stimmenBox.appendChild(
          el(
            "div",
            { class: "muted small" },
            "Keine deutsche Stimme gefunden. Windows: Einstellungen → Zeit und Sprache → Sprache → Deutsch → Sprachausgabe hinzufügen. Mac: Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Stimmen verwalten (z. B. „Anna (Premium)“).",
          ),
        );
    };
    stimmenBauen();
    const ausSt = onStimmen(() => (stimmenBox.isConnected ? stimmenBauen() : ausSt()));
    if (inTauri()) {
      zeile(
        spr,
        "Vorlesen mit",
        seg<"system" | "piper" | "supertonic">(
          [
            ["system", "Computer"],
            ["piper", "Piper"],
            ["supertonic", "Supertonic"],
          ],
          sp.stimmeArt,
          (v) => setzeSprache({ stimmeArt: v }),
        ),
        "Piper und Supertonic erzeugt LeitWerk selbst – natürlicher, mit mehreren Männer- und Frauenstimmen und wählbarem Ausgabegerät. Unten einmal herunterladen. Supertonic klingt am menschlichsten, braucht aber etwas mehr Rechenzeit.",
      );
    }
    zeile(spr, sp.stimmeArt !== "system" && inTauri() ? "Stimmen des Computers (Ersatz)" : "Stimmen", stimmenBox, "Mehr und schönere Stimmen kannst du im Betriebssystem dazuladen (auf dem Mac z. B. „Premium“-Stimmen).");
    if (inTauri()) {
      // Piper-Stimmen: herunterladen, probehören, löschen
      const pBox = el("div", { class: "sprach-modelle" });
      const pBauen = (da: string[]) => {
        pBox.innerHTML = "";
        for (const v of PIPER_STIMMEN) {
          const r = el("div", { class: "ton-zeile", "data-piper": v.name });
          const ist = da.includes(v.name);
          const stand = el("span", { class: "muted small stand" }, ladeStand[v.name] ?? (ist ? "geladen" : `${v.mb} MB`));
          const probeB = el("button", { class: "btn small", type: "button", title: "Probehören" }, "▶");
          probeB.disabled = !ist;
          probeB.addEventListener("click", () => probe(v.g, v.name));
          const knopf = el("button", { class: `btn small${ist ? " danger-text" : ""}`, type: "button" }, ist ? "Löschen" : "Herunterladen");
          knopf.disabled = !!ladeStand[v.name];
          knopf.addEventListener("click", async () => {
            if (ist) {
              await piperLoeschen(v.name).catch((e) => toast(String(e), "error"));
              pNeu();
              return;
            }
            knopf.disabled = true;
            ladeStand[v.name] = "startet …";
            try {
              await piperLaden(v.name, (d, t, entpacken) => {
                ladeStand[v.name] = entpacken ? "wird entpackt …" : t ? `${Math.round((d / t) * 100)} % von ${Math.round(t / 1e6)} MB` : `${Math.round(d / 1e6)} MB`;
                const x = document.querySelector(`[data-piper="${v.name}"] .stand`);
                if (x) x.textContent = ladeStand[v.name];
              });
              delete ladeStand[v.name];
              if (sprachPrefs().stimmeArt !== "piper") setzeSprache({ stimmeArt: "piper" });
              toast(`Stimme „${v.label}“ ist bereit`);
            } catch (e) {
              delete ladeStand[v.name];
              toast(String((e as Error).message ?? e), "error");
            }
            pNeu();
          });
          r.append(el("span", { class: "ton-label" }, v.label), stand, probeB, knopf);
          pBox.appendChild(r);
        }
      };
      const pNeu = () => void piperStatus().then(pBauen);
      pNeu();
      zeile(spr, "Piper-Stimmen", pBox, "Je Stimme einmal herunterladen. Jeder Anrufer bekommt eine der geladenen Stimmen – je mehr, desto abwechslungsreicher. „Thorsten emotional“ klingt bei aufgeregten Anrufern aufgeregt.");
      // Supertonic: ein Paket (Modell + 10 Stimmen + Laufzeit)
      const stBox = el("div", { class: "sprach-modelle" });
      const stBauen = (da: boolean) => {
        stBox.innerHTML = "";
        const r = el("div", { class: "ton-zeile", "data-supertonic": "1" });
        const stand = el("span", { class: "muted small stand" }, ladeStand.supertonic ?? (da ? "geladen" : "ca. 400 MB"));
        const knopf = el("button", { class: `btn small${da ? " danger-text" : ""}`, type: "button" }, da ? "Löschen" : "Herunterladen");
        knopf.disabled = !!ladeStand.supertonic;
        knopf.addEventListener("click", async () => {
          if (da) {
            await supertonicLoeschen().catch((e) => toast(String(e), "error"));
            stNeu();
            return;
          }
          knopf.disabled = true;
          ladeStand.supertonic = "startet …";
          try {
            await supertonicLaden((text, d, t) => {
              ladeStand.supertonic = `${text} ${t ? `${Math.round((d / t) * 100)} %` : `${Math.round(d / 1e6)} MB`}`;
              const x = document.querySelector(`[data-supertonic] .stand`);
              if (x) x.textContent = ladeStand.supertonic;
            });
            delete ladeStand.supertonic;
            setzeSprache({ stimmeArt: "supertonic" });
            toast("Supertonic ist bereit");
          } catch (e) {
            delete ladeStand.supertonic;
            toast(String((e as Error).message ?? e), "error");
          }
          stNeu();
        });
        r.append(el("span", { class: "ton-label" }, "Supertonic 3 (5 Frauen, 5 Männer)"), stand, knopf);
        stBox.appendChild(r);
        if (da) {
          const probeR = el("div", { class: "row-btns" });
          for (const v of SUPERTONIC_STIMMEN) {
            const b = el("button", { class: "btn small", type: "button", title: "Probehören" }, `▶ ${v.name}`);
            b.addEventListener("click", () => probe(v.g, undefined, v.name));
            probeR.appendChild(b);
          }
          stBox.appendChild(probeR);
        }
      };
      const stNeu = () => void supertonicStatus().then(stBauen);
      stNeu();
      zeile(spr, "Supertonic-Stimmen", stBox, "Ein Paket mit 10 Stimmen. Läuft nur auf deinem Rechner. Modell: Supertone (OpenRAIL-M).");
      const gSel = el("select");
      gSel.appendChild(el("option", { value: "" }, "wie das System"));
      void ausgabeGeraete().then((gs) => {
        for (const g of gs) gSel.appendChild(el("option", { value: g }, g));
        gSel.value = sprachPrefs().geraetStimmen;
      });
      gSel.addEventListener("change", () => setzeSprache({ geraetStimmen: gSel.value }));
      zeile(spr, "Ausgabegerät für Stimmen", gSel, "Gilt für Piper und Supertonic. Die Stimmen des Computers spielen immer über das Standardgerät.");
    }

    zeile(spr, "Spracheingabe", schalter(sp.eingabe, (v) => setzeSprache({ eingabe: v })), "🎙 neben den Eingabefeldern gedrückt halten – oder die Sprechtaste.");
    const tasteSel = el("select");
    for (const [code, label] of TASTEN) tasteSel.appendChild(el("option", { value: code }, label));
    tasteSel.value = sp.taste;
    tasteSel.addEventListener("change", () => setzeSprache({ taste: tasteSel.value }));
    zeile(spr, "Sprechtaste (gedrückt halten)", tasteSel, "Gesprochen wird ins gerade laufende Gespräch: Notruf vor KT-Hotline vor Funk.");
    zeile(spr, "Erkannten Text gleich abschicken", schalter(sp.autoSenden, (v) => setzeSprache({ autoSenden: v })), "Aus: der Text steht im Feld und du schickst ihn selbst mit Enter.");
    const mikroSel = el("select");
    mikroSel.appendChild(el("option", { value: "" }, "Standard-Mikrofon"));
    void mikrofone().then((ms) => {
      for (const m of ms) if (m.deviceId && m.deviceId !== "default") mikroSel.appendChild(el("option", { value: m.deviceId }, m.label || "Mikrofon"));
      mikroSel.value = sprachPrefs().mikro;
    });
    mikroSel.addEventListener("change", () => setzeSprache({ mikro: mikroSel.value }));
    zeile(spr, "Mikrofon", mikroSel, inTauri() ? "Beim ersten Sprechen fragt der Computer, ob LeitWerk das Mikrofon benutzen darf." : "Die Namen erscheinen erst, nachdem du das Mikrofon einmal freigegeben hast.");

    if (inTauri()) {
      const modBox = el("div", { class: "sprach-modelle" });
      const modBauen = (vorhanden: string[]) => {
        modBox.innerHTML = "";
        for (const m of SPRACH_MODELLE) {
          const r = el("div", { class: "ton-zeile", "data-modell": m.name });
          const da = vorhanden.includes(m.name);
          const wahl = el("input", { type: "radio", name: "sprach-modell" });
          wahl.checked = sprachPrefs().modell === m.name;
          wahl.disabled = !da;
          wahl.addEventListener("change", () => setzeSprache({ modell: m.name }));
          const stand = el("span", { class: "muted small stand" }, ladeStand[m.name] ?? (da ? "geladen" : `${m.mb} MB`));
          const knopf = el("button", { class: `btn small${da ? " danger-text" : ""}`, type: "button" }, da ? "Löschen" : "Herunterladen");
          knopf.disabled = !!ladeStand[m.name];
          knopf.addEventListener("click", async () => {
            if (da) {
              await modellLoeschen(m.name).catch((e) => toast(String(e), "error"));
              modNeu();
              return;
            }
            knopf.disabled = true;
            ladeStand[m.name] = "startet …";
            try {
              await modellLaden(m.name, (d, t) => {
                ladeStand[m.name] = t ? `${Math.round((d / t) * 100)} % von ${Math.round(t / 1e6)} MB` : `${Math.round(d / 1e6)} MB`;
                const x = document.querySelector(`[data-modell="${m.name}"] .stand`);
                if (x) x.textContent = ladeStand[m.name];
              });
              delete ladeStand[m.name];
              setzeSprache({ modell: m.name });
              toast(`Sprachmodell „${m.label}“ ist bereit`);
            } catch (e) {
              delete ladeStand[m.name];
              toast(String((e as Error).message ?? e), "error");
            }
            modNeu();
          });
          const lab = el("label", { class: "chk" });
          lab.append(wahl, el("span", {}, m.label));
          r.append(lab, stand, knopf);
          modBox.appendChild(r);
        }
      };
      const modNeu = () => void sprachStatus().then((st) => modBauen(st.modelle)).catch(() => modBauen([]));
      modNeu();
      zeile(spr, "Erkennung (Whisper)", modBox, "Läuft nur auf deinem Rechner, ohne Internet. Einmal herunterladen; „Beste Erkennung“ braucht einen flotten Rechner.");
    }
    const testBox = el("div", { class: "row-btns" });
    const testFeld = el("input", { type: "text", placeholder: "Hier erscheint, was erkannt wurde …", readonly: "" });
    testFeld.style.flex = "1";
    testBox.append(mikroAnbinden(testZiel(testFeld)), testFeld);
    zeile(spr, "Ausprobieren", testBox, "🎙 gedrückt halten, etwas sagen, loslassen.");

    // ---- Eigene Tondateien
    const td = section("Eigene Tondateien", "Hier lädst du eigene Töne hoch; oben bei „Töne“ kannst du sie dann je Ereignis auswählen. Gespeichert wird nur auf diesem Rechner.");
    const regeln = el("table", { class: "set-table ton-regeln" });
    regeln.innerHTML = `<tr><th></th><th>Klingeltöne (Notruf, KT)</th><th>kurze Töne (Funk, Chat, Warnung)</th></tr>
      <tr><td>Format</td><td>MP3 oder WAV</td><td>MP3 oder WAV</td></tr>
      <tr><td>Länge</td><td>höchstens ${DATEI_REGELN.klingel.maxSek} Sekunden (wird wiederholt, solange es klingelt)</td><td>höchstens ${DATEI_REGELN.kurz.maxSek} Sekunden</td></tr>
      <tr><td>Größe</td><td>höchstens ${DATEI_REGELN.klingel.maxBytes / 1_000_000} MB</td><td>höchstens ${DATEI_REGELN.kurz.maxBytes / 1000} KB</td></tr>`;
    td.appendChild(regeln);
    const hoch = el("div", { class: "row-btns" });
    const datei = el("input", { type: "file", accept: ".mp3,.wav,audio/mpeg,audio/wav", hidden: "" });
    const hochKlingel = el("button", { class: "btn small" }, "Klingelton hochladen …");
    const hochKurz = el("button", { class: "btn small" }, "Kurzen Ton hochladen …");
    let fuer: "klingel" | "kurz" = "klingel";
    hochKlingel.addEventListener("click", () => {
      fuer = "klingel";
      datei.click();
    });
    hochKurz.addEventListener("click", () => {
      fuer = "kurz";
      datei.click();
    });
    datei.addEventListener("change", async () => {
      const f = datei.files?.[0];
      datei.value = "";
      if (!f) return;
      try {
        const d = await dateiHinzufuegen(f, fuer);
        toast(`„${d.name}“ gespeichert (${d.sek.toFixed(1)} s)`);
        render();
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
      }
    });
    hoch.append(hochKlingel, hochKurz, datei);
    td.appendChild(hoch);
    const dListe = el("div", { class: "ton-dateien" });
    td.appendChild(dListe);
    void eigeneDateien().then((ds) => {
      if (!ds.length) {
        dListe.appendChild(el("div", { class: "muted small" }, "Noch keine eigenen Dateien."));
        return;
      }
      const summe = ds.reduce((a, d) => a + d.bytes, 0);
      for (const d of ds) {
        const r = el("div", { class: "ton-datei" });
        const name = el("input", { type: "text" });
        name.value = d.name;
        name.addEventListener("change", () => void dateiUmbenennen(d.id, name.value.trim() || d.name).then(() => render()));
        const play = el("button", { class: "btn small", type: "button" }, "▶");
        play.addEventListener("click", () => spielen("chat", `datei:${d.id}`, 70));
        const weg = el("button", { class: "btn small danger-text", type: "button" }, "Löschen");
        weg.addEventListener("click", async () => {
          if (!(await confirmDialog("Ton löschen", `„${d.name}“ löschen? Ereignisse, die ihn nutzen, bekommen wieder den Standardton.`, "Löschen", true))) return;
          await dateiLoeschen(d.id);
          const so = { ...pers().sounds };
          for (const [k, v] of Object.entries(so)) if (v.quelle === `datei:${d.id}`) delete so[k];
          setzePers({ sounds: so });
        });
        r.append(name, el("span", { class: "muted small" }, `${d.sek.toFixed(1)} s · ${Math.round(d.bytes / 1000)} KB`), play, weg);
        dListe.appendChild(r);
      }
      dListe.appendChild(el("div", { class: "muted small" }, `Belegt: ${(summe / 1_000_000).toFixed(2)} MB`));
    });

    // ---- Kurzbefehle
    const k = section("Tastenkürzel", "Auf ein Kürzel klicken und dann die gewünschte Taste drücken.");
    const kGrid = el("div", { class: "kuerzel-grid" });
    for (const [id, label] of Object.entries(KUERZEL_LABEL) as [KuerzelId, string][]) {
      const b = el("button", { class: "btn small kuerzel-taste", type: "button" }, p.kuerzel[id] ? tasteText(p.kuerzel[id]) : "–");
      b.addEventListener("click", () => {
        b.textContent = "Taste drücken …";
        b.classList.add("wartet");
        tasteAufnehmen((taste) => {
          const neu = { ...pers().kuerzel };
          // gleiche Taste woanders entfernen
          for (const x of Object.keys(neu) as KuerzelId[]) if (neu[x] === taste) neu[x] = "";
          neu[id] = taste === "Backspace" || taste === "Delete" ? "" : taste;
          setzePers({ kuerzel: neu });
        });
      });
      kGrid.append(el("span", {}, label), b);
    }
    const kReset = el("button", { class: "btn small" }, "Standard-Tasten");
    kReset.addEventListener("click", () => setzePers({ kuerzel: { ...KUERZEL_STANDARD } }));
    k.append(kGrid, el("div", { class: "muted small" }, "Entfernen: Kürzel anklicken und Entf drücken."), kReset);

    // ---- Statusfarben
    const s = section("Eigene Statusfarben", "Nur für deine Anzeige. Die Status selbst (Nummer, Bedeutung) legt die Leitstelle bzw. der Host fest.");
    const sGrid = el("div", { class: "status-farben" });
    for (const key of STATUS) {
      const d = sim.statusDef(key);
      const c = el("input", { type: "color" });
      c.value = d.farbe.length === 7 ? d.farbe : "#888888";
      c.addEventListener("change", () => setzePers({ statusFarben: { ...pers().statusFarben, [key]: c.value } }));
      const r = el("label", { class: "status-farbe" });
      r.append(c, el("span", {}, /^\d+$/.test(d.nummer) ? `${d.nummer} – ${d.name}` : d.name));
      if (p.statusFarben[key]) r.appendChild(el("span", { class: "muted small" }, "(eigene)"));
      sGrid.appendChild(r);
    }
    const sReset = el("button", { class: "btn small" }, "Farben der Leitstelle verwenden");
    sReset.addEventListener("click", () => setzePers({ statusFarben: {} }));
    s.append(sGrid, sReset);
    const farbFeld = (wert: string, onSet: (v: string) => void) => {
      const c = el("input", { type: "color" });
      c.value = wert;
      c.addEventListener("change", () => onSet(c.value));
      return c;
    };
    zeile(s, "Alarmierte Fahrzeuge hinterlegen", farbFeld(p.fzAlarmFarbe || "#fff3c4", (v) => setzePers({ fzAlarmFarbe: v })), "„Alarmiert auf Wache“ und „Alarmiert über Funk“ – Hintergrund der Zeile (im dunklen Schema abgeschwächt).");
    const rotBox = el("div", { class: "row-btns" });
    rotBox.append(schalter(p.fzFunkRot !== false, (v) => setzePers({ fzFunkRot: v })), farbFeld(p.fzFunkFarbe || "#d32f2f", (v) => setzePers({ fzFunkFarbe: v })));
    zeile(s, "Fahrzeuge auf Funk in Farbe", rotBox, "„Frei Funk“ und „Alarmiert über Funk“: Funkrufname in dieser Farbe.");

    // ---- Funkgruppen auf der Karte
    const f = section("Funkgruppen auf der Karte", `Feine Linien an den Grenzen der TETRA-Funkgruppen. ${FUNK_QUELLE}`);
    zeile(f, "Grenzen anzeigen", schalter(p.funkLinien !== false, (v) => setzePers({ funkLinien: v })));
    const fGrid = el("div", { class: "status-farben" });
    for (const g of FUNKGRUPPEN) {
      const r = el("label", { class: "status-farbe", title: g.bezirke });
      const an = el("input", { type: "checkbox" });
      an.checked = p.funkGruppen[g.id] !== false;
      an.addEventListener("change", () => setzePers({ funkGruppen: { ...pers().funkGruppen, [g.id]: an.checked } }));
      const c = el("input", { type: "color" });
      c.value = p.funkFarben[g.id] ?? FUNK_FARBEN[g.id];
      c.addEventListener("change", () => setzePers({ funkFarben: { ...pers().funkFarben, [g.id]: c.value } }));
      r.append(an, c, el("span", {}, `${g.id}${g.id === sim.funkgruppe().id ? " (deine)" : ""}`));
      fGrid.appendChild(r);
    }
    const fReset = el("button", { class: "btn small" }, "Standardfarben");
    fReset.addEventListener("click", () => setzePers({ funkFarben: {}, funkGruppen: {} }));
    f.append(fGrid, fReset);

    // ---- Anordnungen
    const o = section("Arbeitsplatz", "Die Anordnung der Fenster wird automatisch gemerkt. Eigene Anordnungen kannst du oben unter „Anordnung“ speichern.");
    const liste = el("div", { class: "anordnung-liste" });
    const zeigen = () => {
      liste.innerHTML = "";
      const l = anordnungen();
      if (!l.length) liste.appendChild(el("div", { class: "muted" }, "Noch keine eigenen Anordnungen gespeichert."));
      for (const x of l) {
        const r = el("div", { class: "anordnung-zeile" });
        r.innerHTML = `<b>${esc(x.name)}</b><span class="muted">${x.fenster.length ? `+ ${x.fenster.length} weitere${x.fenster.length > 1 ? "" : "s"} Fenster` : ""}</span>`;
        const laden = el("button", { class: "btn small" }, "Laden");
        laden.addEventListener("click", () => void anordnungAnwenden(x));
        laden.disabled = !IST_HAUPT;
        const exp = el("button", { class: "btn small" }, "Als Datei …");
        exp.addEventListener("click", () => void saveTextFile(`leitwerk-anordnung-${x.name}.json`, JSON.stringify(x, null, 1), { name: "Anordnung", extensions: ["json"] }));
        const weg = el("button", { class: "btn small danger-text" }, "Löschen");
        weg.addEventListener("click", async () => {
          if (await confirmDialog("Anordnung löschen", `„${x.name}“ löschen?`, "Löschen", true)) anordnungLoeschen(x.name);
        });
        r.append(laden, exp, weg);
        liste.appendChild(r);
      }
    };
    zeigen();
    const knoepfe = el("div", { class: "row-btns" });
    const imp = el("button", { class: "btn small" }, "Anordnung aus Datei …");
    imp.addEventListener("click", async () => {
      const f = await pickTextFile(".json");
      if (!f) return;
      try {
        const a2 = anordnungImportieren(f.text);
        toast(`Anordnung „${a2.name}“ übernommen`);
      } catch (e) {
        toast(String((e as Error).message ?? e), "error");
      }
    });
    const jetzt = el("button", { class: "btn small" }, "Jetzige Anordnung als Datei …");
    jetzt.addEventListener("click", async () => {
      const a2 = await anordnungEinsammeln("Meine Anordnung");
      await saveTextFile("leitwerk-anordnung.json", JSON.stringify(a2, null, 1), { name: "Anordnung", extensions: ["json"] });
    });
    const reset = el("button", { class: "btn small danger-text" }, "Anordnung zurücksetzen");
    reset.addEventListener("click", async () => {
      if (await confirmDialog("Anordnung zurücksetzen", "Alle Fenster wieder wie beim ersten Start anordnen?", "Zurücksetzen", true)) anordnungZuruecksetzen();
    });
    reset.disabled = !IST_HAUPT;
    knoepfe.append(imp, jetzt, reset);
    o.append(liste, knoepfe);
    const dev = section("Entwickler", "Nur zum Prüfen der Daten – für das Spiel nicht nötig.");
    zeile(dev, "Entwicklerfunktionen", schalter(!!p.entwickler, (v) => setzePers({ entwickler: v })), "Zeigt in der Karte unter „Ebenen“ die unsichtbaren Einsatzstellen (Autobahn-Kilometer, Landstraßen, Wald, Berg, Ufer, Bahnübergänge, Brücken …).");
    const p2 = section("Einführung");
    const intro = el("button", { class: "btn small" }, "Hinweise zum Arbeitsplatz wieder zeigen");
    intro.addEventListener("click", () => setzePers({ einfuehrung: false }));
    p2.appendChild(intro);
  }

  onPers(() => render());
  onPanelsGeaendert(() => render());
  render();
  return { refresh: render };
}
