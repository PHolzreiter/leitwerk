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
- `alle.sh` ist die aktuelle Reihe (Stand Beta 53, grün). Trotz festem Zufall hängen einige Abläufe an echter Zeit (Funk, Großschaden): `beta52test` verfehlt unter Last gelegentlich einen Punkt (z. B. „Fahrt BR → BO“, wenn gerade kein Fahrzeug diese Fahrt macht) – dann einzeln wiederholen. Neue Tests heißen `beta<nr>test.py`; Themen-Tests z. B. `funkpilottest`, `kompetenztest`, `faelletest`.
- **Fester Zufall:** jeder Test öffnet die App mit `?debug&seed=N` (Math.random wird dann durch einen festen Zufall ersetzt, `window.__lwSeed` zeigt den Seed) und setzt nach Bedarf `sim.setWetter('klar')`, damit Hubschrauber nicht wegen Wetter abgemeldet sind.
- `browser/alt/`: ältere Tests (bis 0.113) für die alte Oberfläche (Panels statt Fenster) – nicht mehr in der Reihe, viele scheitern an der neuen Oberfläche. Nur als Nachschlagewerk; bei Bedarf einzeln auf die neue Oberfläche umstellen und zurück nach `browser/` holen.
- `gstest.py` bleibt in `browser/`, weil `beta52test` und `gspilottest` seine Hilfsfunktionen (`HELFER`) lesen. `gstest` und `gspilottest` prüfen zum Teil noch die alte Oberfläche (diese Teile scheitern) und sind deshalb nicht in der Reihe.
- Manche Tests erwarten Hilfsdateien im Arbeitsordner (1. Argument); fehlen sie, den Test anpassen oder überspringen.
- Debug-Zugänge im Build mit `?debug`: `window.__lw`, `window.__pilot`, `window.__pilotKarte()`.
