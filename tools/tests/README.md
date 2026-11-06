# Browser-Tests für LeitWerk

Playwright-Tests (Python) gegen einen Web-Testbuild. Sie laufen nur lokal bzw. in der Arbeitsumgebung, nicht in der CI.

## Voraussetzungen
- Node 20+ mit `esbuild` (`npm i` im Repo oder `ESBUILD=/pfad/esbuild/lib/main.js`)
- Python 3 mit `playwright` und Chromium (`pip install playwright && playwright install chromium`)
- **Privates AMPDS-Abfrageschema** (abfrageschema.json, abfrageschema_drogen.json) in einem eigenen Ordner außerhalb des Repos – **nie committen**. Alle Tests sollen mit diesem Schema laufen.

## Ablauf
```bash
LW_PRIVAT=~/leitwerk-privat tools/tests/bau.sh      # baut tools/tests/web
tools/tests/alle.sh                                  # aktuelle Testreihe
python3 tools/tests/browser/v104test.py tools/tests/arbeit tools/tests/web   # einzelner Test
npx tsc --noEmit -p tools/tests/tsconfig.check.json  # Typprüfung
```

## Hinweise
- Namensschema: `v<version>test.py` = Tests zur jeweiligen Version; `*test13.py` usw. = Themen-Tests (Funk, Lage, SEK …).
- Alte Tests können durch spätere Änderungen veralten; `alle.sh` enthält die zuletzt grünen.
- Zeitabhängig/wackelig: `pilottest_modus` (abends Schichtwechsel), `gspilottest`, `sektest13`.
- Manche ältere Tests erwarten Hilfsdateien im Arbeitsordner (1. Argument); fehlen sie, den Test anpassen oder überspringen.
- Debug-Zugänge im Build mit `?debug`: `window.__lw`, `window.__pilot`, `window.__pilotKarte()`.
