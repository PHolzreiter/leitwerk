import { fehlerLogStarten } from "./fehlerLog";
import { dienstHtml } from "./ui/panels/teile";
import * as flughafen from "./sim/flughafen";
import * as dienst from "./sim/dienst";
fehlerLogStarten();
import { funkDienst, funkPruefen, funkSpruchErzeugen, lageWissen, zerlegen, zusammensetzen } from "./abfrage/funkKi";
import { ohnePatientWort, sprechFrage } from "./abfrage/sprechfrage";
import { antwortOhneKi, anruferWaehlen, erinnerung, ortKandidaten, systemPrompt } from "./abfrage/anrufer";
import { anruferAntwort, eroeffnen, fuellwortDosis, inAtemnot, kiVerlauf, kontext, ohneFrageEcho, ohneRollentausch, probeGespraech, vorwaermen } from "./abfrage/gespraech";
import { kiAntwortNeu, nachrichtArt } from "./abfrage/runde";
import { bereinigen, kiTest, satzEnde, setKiPrefs } from "./abfrage/ki";
import { alleFaelle, fallAktivSetzen, fallLoeschen, fallpaketExport, fallpaketImport, fallSpeichern } from "./abfrage/faelle";
import { entwurfAusKi, fallEditorOeffnen } from "./ui/fallEditor";
import { auftraegeFuer, ktAuftraege, testlaufAusfuehren, testlaufDateien, testlaufDialog } from "./ui/testlauf";
import { ktPrompt, ktPruefen, ktZusammenfassungFalsch } from "./abfrage/ktGespraech";
import { antwortKern, antwortPruefen, kernAntwort, schemaFrageZu, themenErkennen } from "./abfrage/verstehen";
import { zipOhneKompression } from "./platform";
import "./style.css";
import "./ui/ws/dockview.css";
import "./ui/ws/arbeitsplatz.css";
import "./ui/modern.css";
import { store } from "./data/store";
import { anStrasse, khZufahrtBei, sim } from "./sim/engine";
import { besatzungBei, personenBei } from "./sim/bewegung";
import { landeplatzLesen, zufahrtLesen, zufahrtText } from "./data/schema";
import { geoStatus, geoTest } from "./sim/geo";
import { toast } from "./ui/dom";
import { confirmDialog } from "./ui/dialog";
import { checkOnStart, ensureGrundpaket } from "./ui/packsView";
import { setupSpielStatus } from "./ui/spielDialog";
import { autosaveStarten } from "./net/spielstand";
import { kiBeimStart } from "./abfrage/ki";
import { mp, umgebungPruefen, umgebungSetzen } from "./net/mehrspieler";
import { istPilot } from "./ui/pilot/modus";
import { appVersion, onPacksChanged } from "./updates";
// Fenster (registrieren sich selbst)
import "./ui/panels/karte";
import "./ui/panels/einsatzliste";
import "./ui/panels/fahrzeuge";
import "./ui/panels/telefon";
import "./ui/panels/abfrage";
import "./ui/panels/masken";
import "./ui/panels/kommunikation";
import { AKV_SPALTEN_AK, akvZustand } from "./ui/khInfo";
import { akutVon } from "./data/klinik";
import { stellenLaden } from "./data/einsatzstellen";
import { istFeiertag, katKtOffen, katOffen, offenUm } from "./data/ortZeiten";
import { searchAddress } from "./sim/geo";
import { kategorienFuerOrtArt, ortGewicht, poiKategorien } from "./data/orte";
import { alleAnrufe, anrufAnnehmen, anrufAuflegen, anrufBeobachterStarten, anrufHalten, istMeins, meinGespraech } from "./ui/panels/telefon";
import { anordnungLaden, arbeitsplatzStarten, panelOeffnen, panelZeigen, VORLAGEN, vorlageAnwenden } from "./ui/ws/arbeitsplatz";
import { IST_HAUPT } from "./ui/ws/bus";
import { startseiteOffen, startseiteZeigen } from "./ui/startseite";
import { ticketDienstStarten } from "./net/tickets";
import { ablageAbgleichen } from "./ui/ablageStart";
import * as ablage from "./net/ablage";
import * as spielstandOrdner from "./net/spielstandOrdner";
import { updateDienstStarten, updateInstallieren, updateTesten } from "./ui/updateDienst";
import { auswahl, fahrzeugZeigen, waehle } from "./ui/ws/auswahl";
import { kuerzelAktion, kuerzelStarten } from "./ui/ws/kuerzel";
import { hauptfensterStarten, nebenfensterVerbinden, nebenfensterWiederherstellen, startPanels } from "./ui/ws/nebenfenster";
import { anwenden, pers, setzePers } from "./ui/ws/persoenlich";
import { steuerleisteBauen } from "./ui/ws/steuerleiste";
import { soundBeobachterStarten } from "./ui/sounds";
import { funkVorlesenStarten, sprachTest, sprechText } from "./ui/sprache";
import { khAufnahmeOeffnen, luecken } from "./ui/khAufnahme";
import { sekZufall } from "./sim/sek";
import { altersgruppeVon, SYMPTOME, symptomAusDiagnose, symptomSuche, zuweisungBuchung, zuweisungRessourcen } from "./data/zuweisung";
import { funkStatistik, funkVorleseLaut, sprechStart, sprechStopp } from "./ui/sprechfunk";
import { dienstHoverEinrichten } from "./ui/dienstWoche";
import { schemaUebernehmen } from "./ui/importDialog";
import { bestimmeCode, fragenImAblauf, type Schema } from "./abfrage/schema";
import { fallHinweise, faellePruefen } from "./abfrage/faellePruefen";
dienstHoverEinrichten();

// Für automatische Tests im Browser (…/?debug): Zugriff auf Simulation und Daten
if (location.search.includes("debug")) Object.assign(window, { __lw: { sim, store, mp, sprachTest, sprechfunk: { statistik: funkStatistik, start: sprechStart, stopp: sprechStopp }, codesystemLaden: (s: Schema & { kt?: { codes?: unknown[]; abfrage?: unknown[] } }) => {
        // Test: ein Satz mit KT-Teil wird wie zwei getrennte Sätze geladen (RD + KT/SEK)
        const { kt, ...rd } = structuredClone(s);
        store.setKtSatz(kt?.codes?.length ? { name: "Test", ...kt } : null);
        schemaUebernehmen(rd as Schema, "test.json");
      }, faellePruefen: () => faellePruefen(store.schema), fallHinweise, ohneFrageEcho, fuellwortDosis, ohneRollentausch, faelle: { alleFaelle, fallSpeichern, fallLoeschen, fallpaketExport, fallpaketImport, fallAktivSetzen }, fallEditorOeffnen, entwurfAusKi, sprechFrage, systemPrompt, kontext, erinnerung, kiVerlauf, ohnePatientWort, bereinigen, satzEnde, inAtemnot, kiAntwortNeu, kiTest, probe: probeGespraech, geoTest, vorwaermen, eroeffnen, nachrichtArt, ortKandidaten, testlauf: { auftraegeFuer, ktAuftraege, testlaufAusfuehren, testlaufDateien, testlaufDialog, zipOhneKompression }, kt: { ktPrompt, ktPruefen, ktZusammenfassungFalsch }, anruferAntwort, verstehen: { themenErkennen, antwortKern, antwortPruefen, kernAntwort, schemaFrageZu }, kiPrefsSetzen: setKiPrefs, panelZeigen, funk: { funkPruefen, zerlegen, zusammensetzen, funkSpruchErzeugen, lageWissen }, antwortOhneKi, anruferWaehlen, kh: { akvZustand, AKV_SPALTEN_AK, akutVon }, orte: { poiKategorien, ortGewicht, kategorienFuerOrtArt }, setzePers, stellen: { laden: stellenLaden }, suche: searchAddress, zeiten: { offenUm, istFeiertag, katOffen, katKtOffen }, zufahrt: { lesen: zufahrtLesen, text: zufahrtText, bei: khZufahrtBei }, landeplatz: { lesen: landeplatzLesen }, fuss: { anStrasse, besatzungBei, personenBei }, schemaFkt: { fragenImAblauf, bestimmeCode }, startseite: { zeigen: startseiteZeigen, offen: startseiteOffen }, update: { testen: updateTesten, installieren: updateInstallieren }, spielstaende: spielstandOrdner, ablage: { ...ablage, abgleichen: ablageAbgleichen }, dienstHtml, flughafen, dienst, sel: { waehle, fahrzeugZeigen, auswahl }, mpTest: { umgebungSetzen, umgebungPruefen }, sprechText, sek: { sekZufall }, zuweisung: { altersgruppeVon, khAufnahmeOeffnen, luecken, symptomSuche, zuweisungBuchung, zuweisungRessourcen, symptomAusDiagnose, SYMPTOME } } });

async function watchGeo(): Promise<void> {
  const out = document.getElementById("geo-status");
  for (let i = 0; i < 60; i++) {
    try {
      const g = await geoStatus();
      if (out) out.textContent = `Straßennetz: ${g.roads} · Adressen: ${g.addresses}`;
      if (g.roads !== "laden" && g.addresses !== "laden") {
        if (g.roads.startsWith("Fehler") || g.addresses.startsWith("Fehler")) toast(`${g.roads} / ${g.addresses}`, "error");
        return;
      }
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Eigene Statusfarben (persönlich) über die Farben der Leitstelle legen */
function statusFarbenAnwenden(): void {
  const orig = sim.statusDef.bind(sim);
  sim.statusDef = ((k) => {
    const d = orig(k);
    const f = pers().statusFarben[d.key];
    return f ? { ...d, farbe: f } : d;
  }) as typeof sim.statusDef;
}

function kuerzelEinrichten(): void {
  kuerzelAktion("annehmen", () => {
    const p = pers();
    const l = alleAnrufe().filter((x) => x.anruf.status === "klingelt" && (x.typ === "notruf" ? p.notrufe : p.ktHotline));
    const x = l.find((y) => y.typ === "notruf") ?? l[0];
    if (!x) return false;
    void anrufAnnehmen(x.art, x.id);
  });
  kuerzelAktion("auflegen", () => {
    const m = meinGespraech();
    if (!m) return false;
    anrufAuflegen(m.art, m.id);
  });
  kuerzelAktion("halten", () => {
    const m = meinGespraech();
    if (m) return anrufHalten(m.art, m.id);
    const g = alleAnrufe().find((x) => x.anruf.status === "gehalten" && istMeins(x.anruf));
    if (!g) return false;
    void anrufAnnehmen(g.art, g.id);
  });
  kuerzelAktion("fahrzeugSuchen", () => {
    panelZeigen("fahrzeuge");
    setTimeout(() => document.querySelector<HTMLInputElement>("[data-panel=fahrzeuge] input[type=search]")?.focus(), 80);
  });
  kuerzelAktion("neuerEinsatz", () => {
    void sim
      .call("generiere")
      .then((e) => e && waehle("einsatz", e.id))
      .catch((err) => toast(String(err.message ?? err), "error"));
  });
  kuerzelAktion("einsatzliste", () => panelZeigen("einsatzliste"));
  kuerzelAktion("karte", () => panelZeigen("karte"));
  kuerzelAktion("funk", () => panelZeigen("funk"));
}

/** Beim ersten Start: kurz erklären, wie die Fenster funktionieren */
function einfuehrung(): void {
  if (pers().einfuehrung || !IST_HAUPT) return;
  const box = document.createElement("div");
  box.className = "einfuehrung";
  box.innerHTML = `<b>Neu: frei anordenbare Fenster</b>
    <ul>
      <li>Reiter (z. B. „Funk“) mit der Maus ziehen: daneben, darunter oder als weiterer Reiter ablegen.</li>
      <li>Ränder zwischen den Fenstern ziehen ändert die Größe. <b>⤢</b> macht ein Fenster groß, <b>⧉</b> schiebt es in ein eigenes Programmfenster (zweiter Bildschirm).</li>
      <li>Geschlossene Fenster holst du oben über <b>Fenster ▾</b> zurück. Fertige Anordnungen gibt es unter <b>Anordnung ▾</b>.</li>
    </ul>`;
  const ok = document.createElement("button");
  ok.className = "btn small primary";
  ok.textContent = "Verstanden";
  ok.addEventListener("click", () => {
    box.classList.add("zu");
    setTimeout(() => box.remove(), 200);
    setzePers({ einfuehrung: true });
  });
  box.appendChild(ok);
  document.body.appendChild(box);
}

async function init(): Promise<void> {
  anwenden();
  statusFarbenAnwenden();
  const hinweis = document.getElementById("start-hinweis");

  if (IST_HAUPT) {
    await store.load();
    hauptfensterStarten();
    void appVersion().then((v) => {
      const el = document.getElementById("app-version");
      if (el && v !== "Browser") el.textContent = `v${v}`;
    });
    await ensureGrundpaket();
    // Welche Krankenhäuser sind mit den installierten Straßenpaketen erreichbar?
    void sim.abdeckungAktualisieren();
    onPacksChanged(() => void sim.abdeckungAktualisieren());
    let khZaehler = store.list("hospitals").length;
    store.onChange(() => {
      const n = store.list("hospitals").length;
      if (n !== khZaehler) {
        khZaehler = n;
        void sim.abdeckungAktualisieren();
      }
    });
    sim.ich = mp.ich;
    updateDienstStarten();
    ticketDienstStarten();
    void ablageAbgleichen();
  } else {
    if (hinweis) hinweis.textContent = "Verbinde mit dem Hauptfenster …";
    await nebenfensterVerbinden();
  }

  steuerleisteBauen(document.getElementById("steuerleiste")!);
  if (IST_HAUPT) {
    setupSpielStatus();
    mp.onMeldung((t) => toast(t));
    mp.onHostAnfrage(async (pid, name) => {
      const ok = await confirmDialog("Host-Rolle angefragt", `${name} möchte Host werden. Du spielst danach als Mitspieler weiter.`, "Übergeben");
      if (ok) mp.hostUebergeben(pid);
    });
    autosaveStarten();
    void watchGeo();
  } else {
    document.getElementById("btn-spiel")?.setAttribute("hidden", "");
  }
  void kiBeimStart().catch((e) => console.warn("KI-Start", e));
  // klingelt ein Notruf, schreibt die KI schon die erste Antwort (kürzere Wartezeit beim Annehmen)
  sim.onChange(() => {
    if (!istPilot()) vorwaermen();
  });
  // Funk: was ich als Gesprächsführer sagen lassen muss, formuliert die KI hier (nur im Hauptfenster)
  if (IST_HAUPT) {
    const funkJetzt = () => funkDienst(sim.ich?.pid ?? mp.ich.pid);
    sim.onChange(funkJetzt);
    window.setInterval(funkJetzt, 1000);
  }

  arbeitsplatzStarten(document.getElementById("dock")!);
  if (!anordnungLaden()) {
    if (IST_HAUPT) await vorlageAnwenden(VORLAGEN[0]);
    else {
      const l = startPanels();
      for (const id of l.length ? l : ["karte"]) panelOeffnen(id.replace(/-\d+$/, ""), { id });
    }
  }
  hinweis?.remove();

  kuerzelEinrichten();
  kuerzelStarten();
  if (IST_HAUPT) {
    anrufBeobachterStarten();
    soundBeobachterStarten(sim, () => sim.ich?.name ?? mp.ich.name);
    funkVorlesenStarten(sim, funkVorleseLaut);
    // Startseite bei jedem Programmstart (automatische Tests: nur mit ?start).
    // Weitere Programmfenster (zweiter Bildschirm) gehen erst auf, wenn das Spiel beginnt.
    const params = new URLSearchParams(location.search);
    if (!navigator.webdriver || params.has("start"))
      startseiteZeigen(() => {
        void nebenfensterWiederherstellen();
        einfuehrung();
      });
    else {
      void nebenfensterWiederherstellen();
      einfuehrung();
    }
  }
}

void init().then(() => {
  if (IST_HAUPT) setTimeout(() => void checkOnStart(), 2500);
});
