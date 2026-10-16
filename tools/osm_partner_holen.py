#!/usr/bin/env python3
"""Holt Feuerwehren, Polizeiinspektionen, Wasser- und Bergrettung in Niederösterreich aus OpenStreetMap
(Overpass) und schreibt tools/sources/osm_partner.csv. Nur bei Bedarf von Hand ausführen (braucht Internet):

    python3 tools/osm_partner_holen.py

Feuerwehr: je Gemeinde nur die Hauptfeuerwehr (die im Hauptort bzw. mit dem Gemeindenamen) und die
Bezirksfeuerwehrkommanden. Polizei: alle Polizeiinspektionen. Wasser- und Bergrettung: alle Ortsstellen.
Daten © OpenStreetMap-Mitwirkende (ODbL).
"""
from __future__ import annotations

import csv
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tools" / "sources" / "osm_partner.csv"
SERVER = ["https://overpass.kumi.systems/api/interpreter"]
# Niederösterreich grob (S, W, N, O), in Kacheln abgefragt
BBOX = (47.42, 14.45, 49.03, 17.07)


CACHE = ROOT / "tools" / "sources" / ".overpass_cache"


def abfrage(q: str) -> list[dict]:
    """Overpass-Abfrage; die Server sind oft überlastet → viele kurze Versuche, Ergebnisse zwischengespeichert"""
    import hashlib

    CACHE.mkdir(parents=True, exist_ok=True)
    datei = CACHE / (hashlib.sha1(q.encode()).hexdigest() + ".json")
    if datei.exists():
        return json.loads(datei.read_text())
    daten = urllib.parse.urlencode({"data": q}).encode()
    for versuch in range(400):
        for url in SERVER:
            try:
                with urllib.request.urlopen(urllib.request.Request(url, data=daten), timeout=120) as r:
                    el = json.loads(r.read().decode())["elements"]
                    datei.write_text(json.dumps(el))
                    return el
            except Exception as e:  # noqa: BLE001
                print(f"  {url.split('/')[2]}: {e}", file=sys.stderr)
        time.sleep(3)
    raise RuntimeError("Overpass nicht erreichbar")


def kacheln(n: int = 4):
    s, w, no, o = BBOX
    for i in range(n):
        for j in range(n):
            yield (s + (no - s) * i / n, w + (o - w) * j / n, s + (no - s) * (i + 1) / n, w + (o - w) * (j + 1) / n)


ALLES = (
    'rel["boundary"="administrative"]["admin_level"="8"](BB);out tags;'
    '(node["place"~"^(city|town|village)$"](BB);'
    'nwr["amenity"="fire_station"](BB);'
    'nwr["amenity"="police"](BB);'
    'nwr["name"~"Wasserrettung"](BB);nwr["emergency"="water_rescue"](BB);'
    'nwr["name"~"Bergrettung"](BB);nwr["emergency"="mountain_rescue"](BB););out tags center;'
)
_alle: list[dict] | None = None


def alles() -> list[dict]:
    """Eine Abfrage je Kachel (die Server sind oft überlastet – je weniger Abfragen, desto besser)"""
    global _alle
    if _alle is None:
        gesehen: dict[str, dict] = {}
        for i, k in enumerate(kacheln()):
            bb = ",".join(f"{x:.4f}" for x in k)
            for el in abfrage(f"[out:json][timeout:120];{ALLES.replace('BB', bb)}"):
                gesehen[f"{el['type']}{el['id']}"] = el
            print(f"  Kachel {i + 1} fertig", flush=True)
        _alle = list(gesehen.values())
    return _alle


def holen(filter_: str, ausgabe: str = "") -> list[dict]:
    """Elemente aus dem Gesamtergebnis, die zum (vereinfachten) Filter passen"""
    out = []
    for el in alles():
        t = el.get("tags", {})
        if 'admin_level"="8"' in filter_:
            ok = el["type"] == "relation" and t.get("admin_level") == "8"
        elif "place" in filter_:
            ok = el["type"] == "node" and t.get("place") in ("city", "town", "village")
        elif "fire_station" in filter_:
            ok = t.get("amenity") == "fire_station"
        elif "police" in filter_:
            ok = t.get("amenity") == "police"
        elif "Wasserrettung" in filter_:
            ok = "Wasserrettung" in t.get("name", "") or t.get("emergency") == "water_rescue"
        else:
            ok = "Bergrettung" in t.get("name", "") or t.get("emergency") == "mountain_rescue"
        if ok:
            out.append(el)
    return out


def lage(el: dict) -> tuple[float, float] | None:
    if "lat" in el:
        return el["lat"], el["lon"]
    c = el.get("center")
    return (c["lat"], c["lon"]) if c else None


# --------------------------------------------------------------- Niederösterreich (Funkgruppen-Grenzen)
RINGE = [r for g in json.loads((ROOT / "src" / "data" / "funkgruppen.json").read_text())["gruppen"].values() for r in g]


def in_noe(lat: float, lon: float) -> bool:
    drin = False
    for ring in RINGE:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]
            xj, yj = ring[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                drin = not drin
            j = i
    return drin


def dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111_320
    dx = (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dx, dy)


def norm(s: str) -> str:
    s = s.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    return re.sub(r"[^a-z0-9]", "", s)


def main() -> None:
    zeilen: list[dict] = []

    # Gemeinden (Kennziffer 3xxxx = NÖ) mit Hauptort
    print("Gemeinden …")
    gem = [g for g in holen('relation["boundary"="administrative"]["admin_level"="8"](BB);', "out tags;") if str(g.get("tags", {}).get("ref:at:gkz", "")).startswith("3")]
    print(f"  {len(gem)} Gemeinden")
    print("Orte …")
    orte = holen('node["place"~"^(city|town|village)$"](BB);', "out;")

    print("Feuerwehren …")
    ff = [f for f in holen('nwr["amenity"="fire_station"](BB);') if lage(f) and in_noe(*lage(f))]
    print(f"  {len(ff)} Feuerwehrhäuser in NÖ")
    gewaehlt: dict[str, dict] = {}
    for g in gem:
        name = g["tags"].get("name", "")
        if not name:
            continue
        # Hauptort: Ort mit dem Gemeindenamen (in NÖ; bei mehreren der größere)
        kand = [o for o in orte if norm(o.get("tags", {}).get("name", "")) == norm(name) and in_noe(*lage(o))]
        if not kand:
            continue
        rang = {"city": 0, "town": 1, "village": 2}
        haupt = min(kand, key=lambda o: rang.get(o.get("tags", {}).get("place", ""), 3))
        mitte = lage(haupt)
        nah = [f for f in ff if dist(lage(f), mitte) < 6000]
        if not nah:
            continue
        n = norm(name)

        def punkte(f: dict) -> float:
            fn = norm(f.get("tags", {}).get("name", ""))
            p = dist(lage(f), mitte)
            if n and n in fn:
                p -= 3000
            if re.search(r"stadt|hauptwache|markt", fn):
                p -= 1000
            if re.search(r"betrieb|bf |werk", f.get("tags", {}).get("name", "").lower()):
                p += 5000
            return p

        best = min(nah, key=punkte)
        key = f"{best['type']}{best['id']}"
        if key not in gewaehlt:
            gewaehlt[key] = {"f": best, "gemeinde": name}
    for v in gewaehlt.values():
        f = v["f"]
        t = f.get("tags", {})
        la, lo = lage(f)
        nm = t.get("name") or f"Freiwillige Feuerwehr {v['gemeinde']}"
        zeilen.append({"osm": f"{f['type']}/{f['id']}", "name": nm, "typ": "Feuerwehr", "organisation": "Feuerwehr", "ort": v["gemeinde"], "lat": f"{la:.6f}", "lon": f"{lo:.6f}"})
    # Bezirksfeuerwehrkommanden
    for f in ff:
        nm = f.get("tags", {}).get("name", "")
        if re.search(r"bezirksfeuerwehrkommando|bfkdo|bezirksalarmzentrale", nm, re.I) and f"{f['type']}{f['id']}" not in gewaehlt:
            la, lo = lage(f)
            zeilen.append({"osm": f"{f['type']}/{f['id']}", "name": nm, "typ": "Feuerwehr", "organisation": "Feuerwehr", "ort": f.get("tags", {}).get("addr:city", ""), "lat": f"{la:.6f}", "lon": f"{lo:.6f}"})
    print(f"  {sum(1 for z in zeilen if z['typ'] == 'Feuerwehr')} Feuerwehren gewählt")

    print("Polizei …")
    pol = holen('nwr["amenity"="police"](BB);')
    for p in pol:
        t = p.get("tags", {})
        c = lage(p)
        nm = t.get("name", "")
        if not c or not in_noe(*c) or not re.search(r"polizei|^pi |inspektion", nm, re.I):
            continue
        if re.search(r"fundamt|verwaltung|kommando|direktion|schule|sport|diensthund|^polizei$", nm, re.I):
            continue
        zeilen.append({"osm": f"{p['type']}/{p['id']}", "name": nm, "typ": "Polizei", "organisation": "Polizei", "ort": t.get("addr:city", ""), "lat": f"{c[0]:.6f}", "lon": f"{c[1]:.6f}"})
    print(f"  {sum(1 for z in zeilen if z['typ'] == 'Polizei')} Polizeiinspektionen")

    def naechster_ort(c: tuple[float, float]) -> str:
        o = min(orte, key=lambda o: dist(lage(o), c), default=None)
        return o.get("tags", {}).get("name", "") if o else ""

    for typ, filt in [("Wasserrettung", 'nwr["name"~"Wasserrettung"](BB);nwr["emergency"="water_rescue"](BB);'), ("Bergrettung", 'nwr["name"~"Bergrettung"](BB);nwr["emergency"="mountain_rescue"](BB);')]:
        print(f"{typ} …")
        n = 0
        neu: list[dict] = []
        for p in holen(filt):
            t = p.get("tags", {})
            c = lage(p)
            if not c or not in_noe(*c):
                continue
            nm = t.get("name", "")
            # keine Wege, Naturwacht, Meldestellen o. Ä.
            if re.search(r"weg$|naturwacht|meldestelle|alpinistik", nm, re.I):
                continue
            ort = t.get("addr:city") or naechster_ort(c)
            if not nm or norm(nm) in (norm(typ), "bergrettungsdienst", "bergrettungshuette", "oesterrwasserrettung", "wasserrettungnoe"):
                nm = f"{typ} {ort}".strip()
            elif typ[:4].lower() not in nm.lower():
                nm = f"{typ} {nm}"
            # doppelte (Gebäude und Punkt) innerhalb von 1,5 km: den mit dem längeren Namen behalten
            dop = next((z for z in neu if dist((float(z["lat"]), float(z["lon"])), c) < 1500), None)
            z = {"osm": f"{p['type']}/{p['id']}", "name": nm, "typ": typ, "organisation": typ, "ort": ort, "lat": f"{c[0]:.6f}", "lon": f"{c[1]:.6f}"}
            if dop:
                if len(nm) > len(dop["name"]):
                    dop.update(z)
                continue
            neu.append(z)
            n += 1
        zeilen.extend(neu)
        print(f"  {n}")

    zeilen.sort(key=lambda z: (z["typ"], z["name"]))
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["osm", "name", "typ", "organisation", "ort", "lat", "lon"], delimiter=";")
        w.writeheader()
        w.writerows(zeilen)
    print(f"{OUT}: {len(zeilen)} Stützpunkte")


if __name__ == "__main__":
    main()
