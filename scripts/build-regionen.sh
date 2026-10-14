#!/usr/bin/env bash
# Baut Straßennetz und Adressen je Bundesland (für die Kartenpakete).
#
# Aufruf: scripts/build-regionen.sh <austria.osm.pbf> <Zielordner> [kürzel …]
# Kürzel: noe wien bgld ooe stmk (ohne Angabe: alle)
# Ergebnis: <Ziel>/roads-<kürzel>.lwrg.gz und <Ziel>/addresses-<kürzel>.tsv.gz
#
# Je Land zwei Auszüge an der Landesgrenze: „complete_ways“ (Straßen über die Grenze vollständig,
# damit die Netze zusammenpassen) und „simple“ (nur Punkte im Land: Adressen und Grenzknoten).
set -euo pipefail

PBF="$1"
OUT="$2"
shift 2
REGIONEN=("${@:-noe wien bgld ooe stmk}")
read -r -a REGIONEN <<< "${REGIONEN[*]}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"

declare -A NAME=([noe]="Niederösterreich" [wien]="Wien" [bgld]="Burgenland" [ooe]="Oberösterreich" [stmk]="Steiermark")

echo "==> Landesgrenzen suchen"
osmium tags-filter "$PBF" r/admin_level=4 -o "$WORK/admin4.osm.pbf" --overwrite
python3 "$HERE/tools/bundeslaender.py" "$WORK/admin4.osm.pbf" | tee "$WORK/laender.txt"

echo "==> Nur Straßen, Adressen und Orte"
osmium tags-filter "$PBF" w/highway nwr/addr:housenumber n/place -o "$WORK/filter.osm.pbf" --overwrite

for r in "${REGIONEN[@]}"; do
  name="${NAME[$r]}"
  id="$(awk -v n="$name" '{ i=$1; $1=""; sub(/^ /, ""); if ($0 == n) print i }' "$WORK/laender.txt" | head -1)"
  if [ -z "$id" ]; then echo "Landesgrenze $name nicht gefunden"; exit 1; fi
  echo "==> $name (Relation $id)"
  osmium getid -r "$PBF" "r$id" -o "$WORK/grenze-$r.osm.pbf" --overwrite
  osmium extract -p "$WORK/grenze-$r.osm.pbf" -s complete_ways "$WORK/filter.osm.pbf" -o "$WORK/$r-voll.osm.pbf" --overwrite
  osmium extract -p "$WORK/grenze-$r.osm.pbf" -s simple "$WORK/filter.osm.pbf" -o "$WORK/$r-innen.osm.pbf" --overwrite
  osmium export "$WORK/grenze-$r.osm.pbf" -f geojson --geometry-types=polygon -o "$WORK/grenze-$r.geojson" --overwrite
  python3 "$HERE/tools/build_roads.py" "$WORK/$r-voll.osm.pbf" "$OUT" --innen "$WORK/$r-innen.osm.pbf" --grenze "$WORK/grenze-$r.geojson" --name "$r"
  rm -f "$WORK/$r-voll.osm.pbf" "$WORK/$r-innen.osm.pbf"
done
ls -lh "$OUT"
