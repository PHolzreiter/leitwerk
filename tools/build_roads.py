#!/usr/bin/env python3
"""Baut aus einem OpenStreetMap-Auszug (PBF) das Straßennetz für die Fahrzeitberechnung
und das Adressverzeichnis für Suche und Einsatzorte.

Aufruf: build_roads.py <eingabe.osm.pbf> <ausgabeordner> [--innen <innen.osm.pbf>] [--name <bundesland>]
  eingabe  Auszug eines Bundeslands mit vollständigen Straßen über die Grenze hinaus (osmium „complete_ways“)
  innen    derselbe Auszug nur mit Punkten innerhalb der Grenze (osmium „simple“): daraus die Adressen
           und die Grenzknoten (Straßen über die Landesgrenze gibt es in beiden Ländern)
Ergebnis:
  roads[-<name>].lwrg.gz     Straßengraph (siehe Format unten)
  addresses[-<name>].tsv.gz  Adressen und Orte: typ, straße, hausnummer, plz, ort, breitengrad, längengrad

Graph-Format (little endian), danach gzip:
  "LWRG" u32 version=2, u32 n_nodes, u32 n_edges
  i32 lat_e6[n], i32 lon_e6[n]
  u32 first_edge[n+1]              (Kanten nach Startknoten sortiert)
  u32 target[m], u16 time_ds[m], u16 dist_m[m]
  u32 n_grenze, u32 grenze[n_grenze]   (Knoten auf Straßen über die Landesgrenze)
  time_ds = Fahrzeit ohne Sondersignal in Zehntelsekunden

Braucht: pip install osmium numpy
"""
from __future__ import annotations

import gzip
import math
import re
import sys
from array import array
from pathlib import Path

import numpy as np
import osmium

# Richtgeschwindigkeiten in km/h je Straßenart (ohne Sondersignal)
SPEEDS = {
    "motorway": 115, "motorway_link": 60, "trunk": 90, "trunk_link": 50,
    "primary": 75, "primary_link": 45, "secondary": 65, "secondary_link": 40,
    "tertiary": 55, "tertiary_link": 35, "unclassified": 45, "residential": 30,
    "living_street": 10, "service": 15, "road": 30, "track": 12,
}
# track nur, wenn ausdrücklich befahrbar (tracktype grade1)
EXCLUDE_ACCESS = {"no"}


def parse_maxspeed(v: str | None) -> float | None:
    if not v:
        return None
    if v in ("AT:urban",):
        return 50
    if v in ("AT:rural",):
        return 100
    if v in ("AT:motorway",):
        return 130
    m = re.match(r"^(\d+)", v)
    return float(m.group(1)) if m else None


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


class Innen(osmium.SimpleHandler):
    """Erster Durchgang über den Innen-Auszug: Straßenpunkte innerhalb der Grenze und Adressen."""

    def __init__(self) -> None:
        super().__init__()
        self.punkte: set[int] = set()
        self.addresses: list[tuple] = []

    def node(self, n) -> None:
        if not n.location.valid():
            return
        t = n.tags
        if "addr:housenumber" in t:
            add_address(self.addresses, t, n.location.lat, n.location.lon)
        place = t.get("place")
        if place in ("city", "town", "village", "hamlet", "suburb", "isolated_dwelling") and "name" in t:
            self.addresses.append(("o", t["name"], "", t.get("addr:postcode", ""), place, n.location.lat, n.location.lon))

    def way(self, w) -> None:
        t = w.tags
        if "addr:housenumber" in t and self.innen is None:
            pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
            if pts:
                add_address(self.addresses, t, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        if t.get("highway") in SPEEDS:
            for nd in w.nodes:
                if nd.location.valid():
                    self.punkte.add(nd.ref)


def add_address(out: list, tags, lat: float, lon: float) -> None:
    number = tags.get("addr:housenumber")
    street = tags.get("addr:street") or tags.get("addr:place")
    if number and street:
        city = tags.get("addr:city") or tags.get("addr:place") or ""
        out.append(("a", street, number, tags.get("addr:postcode", ""), city, lat, lon))


class Handler(osmium.SimpleHandler):
    def __init__(self, innen: set[int] | None = None) -> None:
        super().__init__()
        self.innen = innen
        self.grenze: set[int] = set()
        self.index: dict[int, int] = {}
        self.lat = array("i")
        self.lon = array("i")
        self.src = array("I")
        self.dst = array("I")
        self.time = array("H")
        self.dist = array("H")
        self.addresses: list[tuple] = []

    def node_idx(self, ref: int, lat: float, lon: float) -> int:
        i = self.index.get(ref)
        if i is None:
            i = len(self.lat)
            self.index[ref] = i
            self.lat.append(round(lat * 1e6))
            self.lon.append(round(lon * 1e6))
        return i

    def add_address(self, tags, lat: float, lon: float) -> None:
        add_address(self.addresses, tags, lat, lon)

    def node(self, n) -> None:
        if not n.location.valid() or self.innen is not None:
            return
        t = n.tags
        if "addr:housenumber" in t:
            self.add_address(t, n.location.lat, n.location.lon)
        place = t.get("place")
        if place in ("city", "town", "village", "hamlet", "suburb", "isolated_dwelling") and "name" in t:
            self.addresses.append(("o", t["name"], "", t.get("addr:postcode", ""), place, n.location.lat, n.location.lon))

    def way(self, w) -> None:
        t = w.tags
        if "addr:housenumber" in t:
            pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
            if pts:
                self.add_address(t, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))

        hw = t.get("highway")
        if hw not in SPEEDS:
            return
        if hw == "track" and t.get("tracktype") != "grade1":
            return
        if t.get("access") in EXCLUDE_ACCESS and t.get("emergency") not in ("yes", "designated"):
            return
        if t.get("area") == "yes":
            return
        speed = SPEEDS[hw]
        ms = parse_maxspeed(t.get("maxspeed"))
        if ms:
            speed = min(ms, speed * 1.25) if hw not in ("motorway", "trunk") else min(ms, 130)
            speed = max(speed, 5)
        ow = t.get("oneway")
        oneway = 0
        if ow in ("yes", "1", "true") or hw in ("motorway",) or t.get("junction") == "roundabout":
            oneway = 1
        if ow == "-1":
            oneway = -1
        mps = speed / 3.6
        # Straße über die Landesgrenze: alle ihre Punkte sind Grenzknoten
        kreuzt = self.innen is not None and any(nd.ref not in self.innen for nd in w.nodes)

        prev = None
        for nd in w.nodes:
            if not nd.location.valid():
                prev = None
                continue
            i = self.node_idx(nd.ref, nd.location.lat, nd.location.lon)
            if kreuzt:
                self.grenze.add(i)
            if prev is not None and prev[0] != i:
                d = haversine(prev[1], prev[2], nd.location.lat, nd.location.lon)
                # lange Segmente teilen, damit u16 reicht
                d_store = min(int(round(d)), 65535)
                tds = min(int(round(d / mps * 10)), 65535)
                if oneway >= 0:
                    self.src.append(prev[0]); self.dst.append(i); self.time.append(tds); self.dist.append(d_store)
                if oneway <= 0:
                    self.src.append(i); self.dst.append(prev[0]); self.time.append(tds); self.dist.append(d_store)
            prev = (i, nd.location.lat, nd.location.lon)


def main() -> None:
    args = sys.argv[1:]
    opt = {}
    while len(args) > 2 and args[-2].startswith("--"):
        opt[args[-2]] = args[-1]
        args = args[:-2]
    src, out = Path(args[0]), Path(args[1])
    name = opt.get("--name")
    suffix = f"-{name}" if name else ""
    out.mkdir(parents=True, exist_ok=True)
    innen = None
    adressen: list[tuple] = []
    if "--innen" in opt:
        hi = Innen()
        hi.apply_file(opt["--innen"], locations=True, idx="flex_mem")
        innen, adressen = hi.punkte, hi.addresses
        print(f"Innen: {len(innen):,} Straßenpunkte, {len(adressen):,} Adressen/Orte")
    h = Handler(innen)
    h.apply_file(str(src), locations=True, idx="flex_mem")
    if innen is None:
        adressen = h.addresses
    n, m = len(h.lat), len(h.src)
    print(f"Knoten {n:,}, Kanten {m:,}, Grenzknoten {len(h.grenze):,}, Adressen/Orte {len(adressen):,}")

    srcs = np.frombuffer(h.src, dtype=np.uint32)
    order = np.argsort(srcs, kind="stable")
    first = np.zeros(n + 1, dtype=np.uint32)
    np.add.at(first, srcs[order] + 1, 1)
    first = np.cumsum(first, dtype=np.uint64).astype(np.uint32)
    grenze = np.array(sorted(h.grenze), dtype="<u4")

    with gzip.open(out / f"roads{suffix}.lwrg.gz", "wb", compresslevel=6) as f:
        f.write(b"LWRG")
        f.write(np.array([2, n, m], dtype="<u4").tobytes())
        f.write(np.frombuffer(h.lat, dtype=np.int32).astype("<i4").tobytes())
        f.write(np.frombuffer(h.lon, dtype=np.int32).astype("<i4").tobytes())
        f.write(first.astype("<u4").tobytes())
        f.write(np.frombuffer(h.dst, dtype=np.uint32)[order].astype("<u4").tobytes())
        f.write(np.frombuffer(h.time, dtype=np.uint16)[order].astype("<u2").tobytes())
        f.write(np.frombuffer(h.dist, dtype=np.uint16)[order].astype("<u2").tobytes())
        f.write(np.array([len(grenze)], dtype="<u4").tobytes())
        f.write(grenze.tobytes())

    # Adressen: doppelte (gleiche Straße + Nummer + Ort) entfernen
    seen = set()
    with gzip.open(out / f"addresses{suffix}.tsv.gz", "wt", encoding="utf-8", compresslevel=6) as f:
        for typ, street, num, plz, city, lat, lon in adressen:
            key = (typ, street.lower(), num.lower(), city.lower())
            if key in seen:
                continue
            seen.add(key)
            clean = lambda s: s.replace("\t", " ").replace("\n", " ")  # noqa: E731
            f.write(f"{typ}\t{clean(street)}\t{clean(num)}\t{clean(plz)}\t{clean(city)}\t{lat:.6f}\t{lon:.6f}\n")
    print(f"Adressen nach Bereinigung: {len(seen):,}")
    for p in sorted(out.iterdir()):
        if p.name.endswith(f"{suffix}.lwrg.gz") or p.name.endswith(f"{suffix}.tsv.gz"):
            print(f"  {p.name}: {p.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
