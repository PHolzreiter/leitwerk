# LeitWerk

Privater Leitstellensimulator für den Rettungsdienst in Niederösterreich, zum gemeinsamen Spielen im Freundeskreis. Keine kommerzielle Nutzung.

## Stand

- **Phase 1 – Grundgerüst:** Programm für Windows und macOS mit Offline-Karte.
- **Phase 2 – Karte und Stammdaten:** Karte in drei Detailstufen (NÖ + Wien voll, Umland mittel, Österreich und Nachbarn grob), 3D-Ansicht, Reiter „Daten“ mit Dienststellen, Fahrzeugen, Krankenhäusern und POIs, CSV-Import und -Export.

## Daten und CSV-Import

Im Reiter **Daten** gibt es je Datenart: **Neu**, **CSV importieren**, **Exportieren**, **Vorlage** (leere Datei mit allen Spalten) und **Beispiel** (ausgefüllte Musterdatei).

- **Standarddaten** (`data/default/`) sind eingebaut und lassen sich oben im Reiter abschalten. Bearbeitete Standard-Einträge werden als eigene Daten gespeichert.
- **Format:** Semikolon oder Komma, UTF-8 oder Excel-Standard. Spaltennamen werden auch in anderen Schreibweisen erkannt (z. B. `Breitengrad`/`lat`, `Funkrufname`/`Rufname`, `POI-ID`, `Unit-ID`).
- **Fahrzeuge** verweisen über die Spalte `dienststelle` auf die ID **oder den Namen** einer Dienststelle. Deshalb zuerst die Dienststellen importieren.
- **Kategorie** RTW, NEF, NAH, KTW oder Sonstige. Fehlt sie, wird sie aus dem Fahrzeugtyp abgeleitet. Zum Start fahren nur RTW, NEF und NAH.
- **Funkrufnamen:** RTW/KTW `75/001`, NEF `75/099`, NAH `99/002` (Christophorus 2).
- **Krankenhaus-Abteilungen:** Spalten mit `ja` / `nein`.
- Jede Zeile wird geprüft; fehlerhafte Zeilen werden mit Zeilennummer und Grund angezeigt und nicht übernommen. Einträge, die es schon gibt (gleiche ID, gleicher Name bzw. Funkrufname), werden aktualisiert statt verdoppelt.

Vorlagen und Beispiele liegen auch in `data/beispiele/`.

## Installieren

Die Installationsdateien werden bei jeder Änderung automatisch gebaut:
GitHub → Reiter **Actions** → neuester Lauf von **Build** → unten bei **Artifacts**:

- `LeitWerk-windows` → enthält `LeitWerk_…_x64-setup.exe`
- `LeitWerk-macos` → enthält `LeitWerk_…_aarch64.dmg` (Apple Silicon, M1 oder neuer)

### Windows

Setup starten. Erscheint „Der Computer wurde durch Windows geschützt“: **Weitere Informationen → Trotzdem ausführen**.

### macOS

`.dmg` öffnen und LeitWerk in **Programme** ziehen. Da das Programm nicht bei Apple registriert ist, blockiert macOS den ersten Start:

1. LeitWerk einmal öffnen (Meldung schließen).
2. **Systemeinstellungen → Datenschutz & Sicherheit** → ganz unten bei LeitWerk **Dennoch öffnen**.

Alternativ im Terminal: `xattr -dr com.apple.quarantine /Applications/LeitWerk.app`

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/` | Oberfläche (TypeScript, MapLibre) |
| `src-tauri/` | Programmhülle (Rust, Tauri 2) |
| `scripts/build-packs.sh` | baut die Kartenpakete (Workflow „Kartenpakete“) |
| `scripts/fetch-fonts.sh` | lädt Schriften und Kartensymbole beim Build |
| `data/` | Standarddaten, Vorlagen und Beispiele (CSV) |
| `tools/` | Skripte zum Erzeugen der Standard- und Höhendaten |
| `.github/workflows/build.yml` | baut Windows- und Mac-Version |

## Datenquellen

- Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende (ODbL), aufbereitet von [Protomaps](https://protomaps.com).
- Höhendaten: Mapzen / [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/).
- Standarddaten: Dienststellen aus OpenStreetMap und eigener Liste (Nord-NÖ), Krankenhaus-Einrichtungen (Stationen, Ambulanzen, Funktionsbereiche) laut den offiziellen Websites der Häuser, Stand Oktober 2026 (`tools/sources/kh_einrichtungen.json`, Quellen je Haus im Feld „Hinweis“); neue Häuser laut Krankenanstalten-Verzeichnis des Sozialministeriums, Koordinaten © OpenStreetMap-Mitwirkende. Erzeugt mit `tools/build_default_data.py`.
- Feuerwehr (Hauptfeuerwehr je Gemeinde und Bezirkskommanden), Polizeiinspektionen, Berg- und Wasserrettung: © OpenStreetMap-Mitwirkende (ODbL), geholt mit `tools/osm_partner_holen.py`.
