#!/usr/bin/env bash
# Baut die Kartenpakete, die das Programm bei Bedarf herunterlädt:
#   grund     overview (Europa grob, bis Zoom 8), basis (NÖ + Wien bis Zoom 12),
#             Straßennetz für die Fahrzeiten, Adressverzeichnis
#   noe       core (NÖ + Wien mit vollen Straßendetails, bis Zoom 14)
#   umland    ring (Umland ca. 50 km, bis Zoom 12)
#   gelaende  terrain (Höhendaten für die 3D-Ansicht)
#
# Aufruf: scripts/build-packs.sh <Zielordner>
# Ergebnis: <Ziel>/<Dateien> und <Ziel>/packs.json (Paketverzeichnis mit SHA-256)
#
# Braucht: curl, jq, tar, python3 (mit osmium, numpy), osmium-tool und gh (GH_TOKEN gesetzt).
set -euo pipefail

OUT="${1:-packs-out}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
HERE="$(cd "$(dirname "$0")/.." && pwd)"

# Ausschnitte: min_lon,min_lat,max_lon,max_lat
CORE_BBOX="14.30,47.35,17.20,49.10"
RING_BBOX="13.70,46.90,17.80,49.50"
OVERVIEW_BBOX="8.50,45.40,19.50,50.60"

mkdir -p "$OUT"

echo "==> pmtiles-Werkzeug laden"
gh release download --repo protomaps/go-pmtiles \
  --pattern 'go-pmtiles_*_Linux_x86_64.tar.gz' --dir "$WORK"
tar -xzf "$WORK"/go-pmtiles_*_Linux_x86_64.tar.gz -C "$WORK" pmtiles
PMTILES="$WORK/pmtiles"

echo "==> Neuesten Protomaps-Build ermitteln"
BUILD="$(curl -fsSL https://build-metadata.protomaps.dev/builds.json | jq -r '[.[].key] | sort | last')"
echo "    Build: $BUILD"

extract() { # name bbox maxzoom
  echo "==> Karte $1 (bbox $2, bis Zoom $3)"
  "$PMTILES" extract "https://build.protomaps.com/$BUILD" "$OUT/$1.pmtiles" --bbox="$2" --maxzoom="$3"
}
extract overview "$OVERVIEW_BBOX" 8
extract basis "$CORE_BBOX" 12
extract ring "$RING_BBOX" 12
extract core "$CORE_BBOX" 14

echo "==> Höhendaten"
python3 "$HERE/tools/build_terrain.py" "$WORK/terrain.mbtiles" \
  "$OVERVIEW_BBOX:0-7" "$RING_BBOX:8-10" "$CORE_BBOX:11-11"
"$PMTILES" convert "$WORK/terrain.mbtiles" "$OUT/terrain.pmtiles"

echo "==> Straßennetz und Adressen (NÖ, Wien, nördl. Burgenland)"
curl -fsSL -o "$WORK/austria.osm.pbf" https://download.geofabrik.de/europe/austria-latest.osm.pbf
osmium extract -b "$CORE_BBOX" "$WORK/austria.osm.pbf" -o "$WORK/core.osm.pbf" --overwrite
python3 "$HERE/tools/build_roads.py" "$WORK/core.osm.pbf" "$OUT"
rm -f "$WORK/austria.osm.pbf" "$WORK/core.osm.pbf"

echo "==> Paketverzeichnis"
python3 "$HERE/tools/build_packs_manifest.py" "$OUT" "$BUILD"
echo "==> Fertig"
ls -lh "$OUT"
