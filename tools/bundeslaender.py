"""Gibt die OSM-Relationen der Bundesländer aus (admin_level 4): „<id> <name>“ je Zeile.

Aufruf: python3 tools/bundeslaender.py <admin4.osm.pbf>
"""
import sys

import osmium


class H(osmium.SimpleHandler):
    def relation(self, r) -> None:
        t = r.tags
        if t.get("boundary") == "administrative" and t.get("admin_level") == "4" and "name" in t:
            print(r.id, t["name"])


H().apply_file(sys.argv[1])
