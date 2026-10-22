# Orte (POIs) für Niederösterreich

Erzeugt `tools/sources/pois_noe.csv` aus einem OpenStreetMap-Auszug von NÖ (© OpenStreetMap-Mitwirkende, ODbL).
`tools/build_default_data.py` macht daraus `data/default/pois.csv`.

    pip install osmium shapely
    # NÖ-Auszug laden, z. B. https://osm.download.movisda.io/admin/AT-3-latest.osm.pbf
    python3 -I tools/pois/extract.py AT-3-latest.osm.pbf cand.pkl
    python3 -I tools/pois/build.py cand.pkl tools/sources/pois_noe_basis.csv tools/sources/pois_noe.csv --no-bus-stops
    python3 -I tools/pois/validate.py cand.pkl tools/sources/pois_noe.csv

`pois_noe_basis.csv` enthält die mit den Listen der Landesgesundheitsagentur und des Landes NÖ abgeglichenen Pflegeheime (Stand Oktober 2026); sie bleiben die Grundlage.
Kategorien (Schlüssel im Feld `typ`) siehe `src/data/orte.ts`.

## Einsatzstellen (unsichtbar)

Mögliche Notfallorte, die nicht auf der Karte stehen: Strecken und Flächen als Punkte (Autobahn alle 500 m mit Kilometer
und Richtung, Landstraßen außerorts, Feld-/Forst-/Radwege, Wald, Berg, Ufer, Weingärten, Felder) und unauffällige Punkte
(Bahnübergänge, Brücken, Tunnel, Anschlussstellen, Kreisverkehre, Kreuzungen, Kellergassen, Hochstände, Windräder,
Sendemasten, Biogasanlagen, Kletterfelsen, Klettersteige). Das Programm lädt die Datei erst bei Bedarf.

    python3 -I tools/pois/build_stellen.py AT-3-latest.osm.pbf cand.pkl data/default/einsatzstellen.csv
    python3 -I tools/pois/validate_stellen.py cand.pkl data/default/einsatzstellen.csv

Autobahn-Kilometer kommen aus den Nummern der Anschlussstellen (in Österreich = Kilometer), dazwischen interpoliert.
