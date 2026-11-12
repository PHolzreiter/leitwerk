#!/bin/bash
# Aktuelle Testreihe (Stand 0.113). Vorher: ./bau.sh
# Jeder Test: python3 browser/<name>.py <arbeitsordner> <web-build> – gibt OK/FEHLER-Zeilen aus.
T="$(cd "$(dirname "$0")" && pwd)"; W="$T/web"; A="${LW_ARBEIT:-$T/arbeit}"; mkdir -p "$A"
for t in probetest v104test pilottest_modus v1010test v101test v101ptest v100test v99test v96test funktest13 v41test v45test gspilottest gstest v88test v85test v83test v80test v79test v78test v77test v76test v75test v74test v73test v1002test lagetest13 sektest13 sekpilottest ktformtest hochtest funkabsichttest funkpilottest; do
  echo "=== $t"; timeout 900 python3 "$T/browser/$t.py" "$A" "$W" 2>&1 | grep -E "^FEHLER|Error:|Traceback|TimeoutError" | tail -8
done
echo "=== handytest"; python3 "$T/browser/handytest.py" "$A" "$W" "$T/../../src-tauri/src/handy.html" 2>&1 | grep -E "^FEHLER" | tail -3
echo ALLESFERTIG
