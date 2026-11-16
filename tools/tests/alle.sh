#!/bin/bash
# Aktuelle Testreihe (Stand Beta 53). Vorher: ./bau.sh
# Jeder Test: python3 browser/<name>.py <arbeitsordner> <web-build> – gibt OK/FEHLER-Zeilen aus.
# Alle Tests laufen mit festem Zufall (?debug&seed=N) und klarem Wetter, damit sie nicht zufällig scheitern.
# Ältere Tests der alten Oberfläche liegen in browser/alt/ (nicht mehr in der Reihe, siehe README).
T="$(cd "$(dirname "$0")" && pwd)"; W="$T/web"; A="${LW_ARBEIT:-$T/arbeit}"; mkdir -p "$A"
for t in v41test v77test v80test v85test v101ptest sekpilottest ktformtest hochtest funkabsichttest funkpilottest funkszenariotest freisprechtest mpfunktest rvtest faelletest beta47test kompetenztest beta49test beta50test beta51test beta52test beta53test beta54test beta55test beta56test beta58test beta59test beta60test; do
  echo "=== $t"; timeout 900 python3 "$T/browser/$t.py" "$A" "$W" 2>&1 | grep -E "^FEHLER|Error:|Traceback|TimeoutError" | tail -8
done
echo "=== handytest"; python3 "$T/browser/handytest.py" "$A" "$W" "$T/../../src-tauri/src/handy.html" 2>&1 | grep -E "^FEHLER" | tail -3
echo ALLESFERTIG
