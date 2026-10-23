"""Hubschrauber-Landeplätze der Krankenhäuser aus OpenStreetMap.

Sucht aeroway=helipad/heliport und emergency=landing_site (Punkte und Flächen, Fläche = Mittelpunkt) im Umkreis
von 600 m um jedes Krankenhaus aus data/default/krankenhaeuser.csv und nimmt den nächsten (Krankenhaus-Landeplätze
mit Namen/Betreiber „Klinik/Krankenhaus/Spital“ werden bevorzugt).

Usage: python3 -I tools/pois/landeplaetze.py OUT.csv INPUT1.osm.pbf [INPUT2.osm.pbf …]
(Extrakte z. B. https://osm.download.movisda.io/admin/AT-3-latest.osm.pbf – NÖ, AT-9 Wien, AT-4 OÖ, AT-6 Stmk, AT-1 Bgld)

Ausgabe: id;kurzname;breitengrad;laengengrad;abstand_m;osm;name  (© OpenStreetMap-Mitwirkende, ODbL)
"""
import csv
import math
import sys
from pathlib import Path

import osmium

ROOT = Path(__file__).resolve().parents[2]
RADIUS = 600.0


def dist_m(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def ist_landeplatz(tags) -> bool:
    return tags.get("aeroway") in ("helipad", "heliport") or tags.get("emergency") == "landing_site"


class Sammler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.treffer = []  # (lat, lon, osm, name)

    def node(self, n):
        if ist_landeplatz(n.tags) and n.location.valid():
            self.treffer.append((n.location.lat, n.location.lon, f"node/{n.id}", self.name(n.tags)))

    def way(self, w):
        if not ist_landeplatz(w.tags):
            return
        pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        if pts:
            la = sum(p[0] for p in pts) / len(pts)
            lo = sum(p[1] for p in pts) / len(pts)
            self.treffer.append((la, lo, f"way/{w.id}", self.name(w.tags)))

    @staticmethod
    def name(tags) -> str:
        return " ".join(x for x in (tags.get("name", ""), tags.get("operator", "")) if x).strip()


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: landeplaetze.py OUT.csv INPUT.osm.pbf [...]")
    out, pbfs = sys.argv[1], sys.argv[2:]
    alle = []
    for p in pbfs:
        s = Sammler()
        s.apply_file(p, locations=True)
        alle += s.treffer
        print(f"{p}: {len(s.treffer)} Landeplätze")
    with open(ROOT / "data" / "default" / "krankenhaeuser.csv", encoding="utf-8-sig", newline="") as f:
        khs = list(csv.DictReader(f, delimiter=";"))
    rows = []
    for k in khs:
        kp = (float(k["breitengrad"]), float(k["laengengrad"]))
        nah = [(dist_m(kp, (t[0], t[1])), t) for t in alle]
        nah = [x for x in nah if x[0] <= RADIUS]
        if not nah:
            continue
        # Landeplatz mit Klinik-Namen vor anderen (z. B. Polizei, Feuerwehr)
        nah.sort(key=lambda x: (not any(w in x[1][3].lower() for w in ("klinik", "kranken", "spital", "lkh", "uk ", "hospital")), x[0]))
        d, t = nah[0]
        rows.append({"id": k["id"], "kurzname": k["kurzname"], "breitengrad": f"{t[0]:.6f}", "laengengrad": f"{t[1]:.6f}",
                     "abstand_m": f"{d:.0f}", "osm": t[2], "name": t[3]})
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "kurzname", "breitengrad", "laengengrad", "abstand_m", "osm", "name"], delimiter=";", lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"{out}: {len(rows)} von {len(khs)} Krankenhäusern mit Landeplatz")


if __name__ == "__main__":
    main()
