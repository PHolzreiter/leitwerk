#!/bin/bash
# Plugin im nachgebauten X-Plane testen (Linux, braucht Xvfb, Mesa, g++, cmake, python3 + Pillow)
#   test/lauf.sh <skript.txt> <ausgabeordner> [bauordner]
# Im Skript stehen $TEST (dieser Ordner) und $STAND (aktuelle Stand-Datei) zur Verfügung.
set -e
HIER="$(cd "$(dirname "$0")" && pwd)"
SKRIPT="$1"; AUS="$2"; B="${3:-$AUS/bau}"
mkdir -p "$AUS" "$B"
cmake -S "$HIER/.." -B "$B" -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build "$B" -j8 2>&1 | grep -E "error|warning:" || true
mkdir -p "$B/LeitWerk/schrift" && cp "$HIER/../../../src-tauri/src/schrift/"inter-*.ttf "$B/LeitWerk/schrift/"
g++ -O1 -std=c++17 "$HIER/attrappe.cpp" -I"$HIER/../extern/stb" -I"$HIER/../sdk/CHeaders/XPLM" -DLIN=1 -o "$B/attrappe" -lGL -lX11 -ldl -rdynamic
export TEST="$HIER" STAND="$AUS/stand.json"
cp "$HIER/stand-leer.json" "$STAND"
: > "$AUS/befehle.log"
rm -rf /tmp/leitwerk-attrappe-prefs
sed -e "s#\$TEST#$TEST#g" -e "s#\$STAND#$STAND#g" -e "s#\$AUS#$AUS#g" "$SKRIPT" > "$AUS/skript.txt"
timeout 120 xvfb-run -a -s "-screen 0 1400x1000x24" "$B/attrappe" "$B/LeitWerk/lin_x64/LeitWerk.xpl" "$AUS/skript.txt" "$AUS" 2>&1 | grep -v "^\[xplm\]" || true
pkill -f "^python3 .*leitwerk_attrappe" || true
echo "--- Befehle an LeitWerk:"; cat "$AUS/befehle.log"
