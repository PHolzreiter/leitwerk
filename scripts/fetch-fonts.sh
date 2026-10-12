#!/usr/bin/env bash
# Lädt Schriften und Kartensymbole (Protomaps basemaps-assets) für das Programm.
# Nur die Zeichenbereiche für Mitteleuropa (Latein mit Akzenten, Satzzeichen),
# damit das Programm und damit jedes Update klein bleibt.
#
# Aufruf: scripts/fetch-fonts.sh <Zielordner>  ->  <Ziel>/fonts/..., <Ziel>/sprites/v4/...
set -euo pipefail

OUT="${1:-fonts-out}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT/fonts" "$OUT/sprites/v4"

git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/protomaps/basemaps-assets "$WORK/assets"
git -C "$WORK/assets" sparse-checkout set \
  "fonts/Noto Sans Regular" "fonts/Noto Sans Medium" "fonts/Noto Sans Italic" "sprites/v4"

# Ordnernamen ohne Leerzeichen (die Oberfläche fragt sie so an)
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  dst="$OUT/fonts/${f// /_}"
  mkdir -p "$dst"
  for r in 0-255 256-511 512-767 7680-7935 8192-8447 8448-8703; do
    cp "$WORK/assets/fonts/$f/$r.pbf" "$dst/"
  done
done
cp "$WORK/assets/sprites/v4/"light* "$WORK/assets/sprites/v4/"dark* "$OUT/sprites/v4/"
du -sh "$OUT"/*
