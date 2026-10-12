#!/usr/bin/env python3
"""Baut die Höhendaten-Datei für die 3D-Ansicht (terrain.mbtiles).

Quelle: AWS Open Data "Terrain Tiles" im Terrarium-Format (frei nutzbar,
Quellenangabe: Mapzen / AWS Terrain Tiles, u. a. SRTM, EU-DEM).

Aufruf: build_terrain.py <ziel.mbtiles> "<bbox>:<minz>-<maxz>" ["<bbox>:<minz>-<maxz>" ...]
bbox = min_lon,min_lat,max_lon,max_lat
Danach mit `pmtiles convert ziel.mbtiles ziel.pmtiles` umwandeln.
"""
from __future__ import annotations

import math
import sqlite3
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"


def tile_range(bbox: tuple[float, float, float, float], z: int):
    min_lon, min_lat, max_lon, max_lat = bbox
    n = 2**z

    def tx(lon: float) -> int:
        return min(n - 1, max(0, int((lon + 180.0) / 360.0 * n)))

    def ty(lat: float) -> int:
        r = math.radians(lat)
        return min(n - 1, max(0, int((1.0 - math.asinh(math.tan(r)) / math.pi) / 2.0 * n)))

    for x in range(tx(min_lon), tx(max_lon) + 1):
        for y in range(ty(max_lat), ty(min_lat) + 1):
            yield z, x, y


def fetch(t: tuple[int, int, int]) -> tuple[tuple[int, int, int], bytes]:
    z, x, y = t
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60) as r:
                return t, r.read()
        except Exception:  # noqa: BLE001
            if attempt == 3:
                raise
    raise RuntimeError("unreachable")


def main() -> None:
    out = sys.argv[1]
    tiles: set[tuple[int, int, int]] = set()
    lons, lats, zooms = [], [], []
    for spec in sys.argv[2:]:
        bbox_s, zr = spec.split(":")
        bbox = tuple(float(v) for v in bbox_s.split(","))
        z0, z1 = (int(v) for v in zr.split("-"))
        lons += [bbox[0], bbox[2]]
        lats += [bbox[1], bbox[3]]
        zooms += [z0, z1]
        for z in range(z0, z1 + 1):
            tiles.update(tile_range(bbox, z))  # type: ignore[arg-type]
    print(f"{len(tiles)} Kacheln laden")

    db = sqlite3.connect(out)
    db.execute("CREATE TABLE metadata (name TEXT, value TEXT)")
    db.execute("CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)")
    db.execute("CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)")
    meta = {
        "name": "terrain", "format": "png", "type": "baselayer", "encoding": "terrarium",
        "minzoom": str(min(zooms)), "maxzoom": str(max(zooms)),
        "bounds": f"{min(lons)},{min(lats)},{max(lons)},{max(lats)}",
        "attribution": "Mapzen / AWS Terrain Tiles",
    }
    db.executemany("INSERT INTO metadata VALUES (?, ?)", meta.items())

    done = 0
    with ThreadPoolExecutor(max_workers=16) as pool:
        for (z, x, y), data in pool.map(fetch, sorted(tiles)):
            db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)", (z, x, (2**z - 1) - y, data))
            done += 1
            if done % 200 == 0:
                print(f"  {done}/{len(tiles)}")
    db.commit()
    db.close()
    print("Fertig")


if __name__ == "__main__":
    main()
