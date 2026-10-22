# Orte (POIs) für Niederösterreich

Erzeugt `tools/sources/pois_noe.csv` aus einem OpenStreetMap-Auszug von NÖ (© OpenStreetMap-Mitwirkende, ODbL).
`tools/build_default_data.py` macht daraus `data/default/pois.csv`.

    pip install osmium shapely
    # NÖ-Auszug laden, z. B. https://osm.download.movisda.io/admin/AT-3-latest.osm.pbf
    python3 -I tools/pois/extract.py AT-3-latest.osm.pbf cand.pkl
    python3 -I tools/pois/build.py cand.pkl tools/sources/pois_noe_basis.csv tools/sources/pois_noe.csv
    python3 -I tools/pois/validate.py cand.pkl tools/sources/pois_noe.csv

`pois_noe_basis.csv` enthält die mit den Listen der Landesgesundheitsagentur und des Landes NÖ abgeglichenen Pflegeheime (Stand Oktober 2026); sie bleiben die Grundlage.
Kategorien (Schlüssel im Feld `typ`) siehe `src/data/orte.ts`.
