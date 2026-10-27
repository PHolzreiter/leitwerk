# Falltest – Fallbeispiele automatisch durchspielen

Der Falltest spielt Notrufe, Krankentransporte, Überstellungen und Funk automatisch durch – wie der 🧪-Testlauf in der App, aber
schneller, wiederholbar und mit Vergleich zum letzten Lauf.

**Aussagekräftig für LeitWerk, weil:**

- der **echte LeitWerk-Code** läuft (unsichtbarer Browser mit dem Programm aus `src/`): dieselben Fälle, Anrufer, Gesprächsführung
  (`testlaufAusfuehren`), Prüfungen und Nachbesserungen wie im Spiel – nichts ist nachgebaut;
- die KI-Einstellungen **jedes Mal aus `src-tauri/src/ki.rs` gelesen** werden (Temperatur, Kontext, Länge, Denkmodus aus);
- **deine App-Daten** genommen werden: aktives Abfrageschema und Codeliste, KT/SEK-Satz, Funkgruppe, Einstellungen,
  eigene und geänderte Fälle, dein KI-Modell – und **echte Adressen** aus deinen Kartenpaketen (gleiches Auswahlverfahren wie die App).

**Schneller und wirksamer, weil:**

- mehrere Gespräche **gleichzeitig** laufen (`--parallel`), ohne die App zu öffnen;
- jedes Gespräch eine **Startzahl** hat: Mit `--wie` spielst du nach einer Änderung **genau dieselben Gespräche** noch einmal,
  mit `--nur-auffaellige` nur die, die vorher Probleme hatten;
- der Bericht **Fehlerquoten je 100 Antworten** zeigt und sagt, ob eine Änderung wirklich besser ist oder nur Zufall;
- es eine Datei **`fuer-claude.zip`** gibt (gleiches Format wie der Testlauf-ZIP, plus Rahmen und Vergleich).

## Einmalig einrichten (Mac)

1. **Node.js** installieren (LTS von <https://nodejs.org>), falls noch nicht da: im Terminal `node -v`.
2. LeitWerk-Code holen: `git clone https://github.com/PHolzreiter/leitwerk.git` (oder später `git pull`).
3. Im Ordner einmal `npm install` (lädt beim ersten Falltest auch den unsichtbaren Browser, ca. 100 MB).
4. **Ollama** muss laufen (LeitWerk starten genügt, oder die Ollama-App).

Für mehrere Gespräche gleichzeitig muss Ollama das erlauben (sonst rechnet es nacheinander – der Bericht sagt es dir):

```sh
launchctl setenv OLLAMA_NUM_PARALLEL 3
```

Danach Ollama einmal beenden und neu starten (Menüleiste → Quit Ollama). Jede gleichzeitige Anfrage braucht zusätzlichen Speicher –
bei 16 GB eher 2, ab 32 GB 3–4.

## Starten

Doppelklick auf **`Falltest starten.command`** in diesem Ordner – oder im Terminal im LeitWerk-Ordner:

```sh
npm run falltest                 # fragt kurz, was getestet werden soll
npm run falltest -- --alles      # alles mit Standardwerten
```

Am Ende öffnet sich der Bericht im Browser. Alles liegt in `falltest-ergebnisse/<Datum>_v<Version>/`:

| Datei | Inhalt |
|---|---|
| `bericht.html` | Übersicht, Fehlerarten mit Beispielen, Fälle, alle Gespräche zum Aufklappen und Filtern |
| `fuer-claude.zip` | zum Schicken an Claude: Übersicht, Rahmen, Vergleich, je Gespräch ein Export |
| `lauf.json` | alle Daten (für Vergleiche und Wiederholungen) |
| `gespraeche/` | die Gespräche als einzelne Dateien |

## Typische Abläufe

```sh
# Grundlinie: alles einmal
npm run falltest -- --alles

# nach einer Verbesserung: genau dieselben Gespräche nochmal → Vergleich zeigt, was weg ist und was neu dazukam
npm run falltest -- --wie letzter

# schnell nachsehen, ob die Probleme behoben sind
npm run falltest -- --nur-auffaellige letzter

# ein Thema gezielt, jeder Ausgang 5-mal
npm run falltest -- --fall atemnot --was notruf --mal 5

# neue Mischung (andere Anrufer, Orte, Uhrzeiten)
npm run falltest -- --alles --seed neu
```

Alle Möglichkeiten: `npm run falltest -- --hilfe`.

## Gut zu wissen

- An der App und deinen Daten wird nichts verändert – gelesen wird nur eine Kopie.
- Straßen-Fahrzeiten rechnet der Browser als gerade Linie (die App über das Straßennetz). Für die Gespräche spielt das kaum eine
  Rolle; im Funk können genannte Minuten etwas anders sein.
- Bei mehreren Gesprächen gleichzeitig zählt „langsam“ nicht als Auffälligkeit (Wartezeit an der KI ist kein Fehler);
  die reine Rechenzeit der KI steht im Bericht.
- Die KI bekommt zusätzlich die Startzahl (`seed`). Sie ändert nichts an der Art der Antworten, macht Läufe aber wiederholbar.
  Ganz gleich sind Antworten trotzdem nicht immer (Ollama rechnet gleichzeitige Anfragen gemeinsam).
- `--test-ki` prüft nur das Testprogramm selbst (ohne Ollama, mit Platzhalter-Antworten).
