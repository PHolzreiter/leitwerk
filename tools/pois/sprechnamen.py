"""Sprechnamen der Orte am Funk (Paul 15.11.2026: Treffpunkt „beim Bühlcenter“).

Manche Orte heißen am Funk anders als auf der Karte: das Einkaufszentrum „ALEX“ in Krems ist für alle noch das
„Bühl Center“ (2024 umbenannt), die „Westfield Shopping City Süd“ die „SCS“. Die Namen kommen aus OpenStreetMap
(loc_name, short_name, old_name, alt_name); welcher davon am Funk gesagt wird, legt SPRECHEN fest, die übrigen werden
nur verstanden (Spracherkennung, „Rendezvous beim Merkur“).

    python3 -I tools/pois/sprechnamen.py AT-3-latest.osm.pbf data/default/pois.csv tools/sources/pois_sprechnamen.csv

Ergebnis: id;sprechname;quelle – sprechname = „gesagt|verstanden|…“ (leer vor dem ersten „|“: Kartenname sagen).
"""
import csv, sys

# Orte, an denen am Funk der andere Name fällt: OSM-ID → OSM-Schlüssel des gesagten Namens
SPRECHEN = {
    "w35214130": "old_name",    # ALEX → Bühl Center (2024 umbenannt; Pauls Beispiel)
    "w23087411": "short_name",  # Westfield Shopping City Süd → SCS
    "w23087421": "short_name",  # SCS Hauptgebäude → SCS
    "w31852334": "short_name",  # G3 Shopping Resort Gerasdorf → G3
    "r6137849": "short_name",   # Mostviertler Einkaufszentrum → MEZ
    "w8610334": "short_name",   # Florian-Berndl-Bad → Berndl-Bad
    "w140112755": "short_name", # Fischauer Thermalbad → Kristalltherme
    "w29303208": "loc_name",    # VAZ Sankt Pölten → VAZ
    "w664793543": "loc_name",   # Jugendsportzentrum Schwechat Phönixplatz → Phönixplatz
    "w186121255": "loc_name",   # Rosehill Foodpark (Haag) → Raststation Haag
}
# Orte, die man am Funk als Treffpunkt/Merkmal nennt: alle anderen Namen werden verstanden
FUNK_TYP = ("einkaufszentrum", "freibad", "therme", "sportplatz", "sporthalle", "veranstaltung", "bahnhof")
# Supermärkte/Baumärkte: nur der frühere Kettenname („Merkur“, „Baumax“) wird verstanden
KETTE_TYP = ("supermarkt", "baumarkt")
KETTE_ALT = {"merkur", "baumax", "mega-baumax", "zielpunkt", "unimarkt"}
SCHLUESSEL = ("loc_name", "short_name", "old_name", "alt_name", "official_name")
# allgemeine Wörter statt Namen („Veranstaltungshalle“, „Strandbad“) würden jede solche Halle treffen
ALLGEMEIN = {"veranstaltungshalle", "neue sporthalle", "kulturzentrum", "gemeindezentrum", "strandbad", "bowling", "multiplex",
             "leiner", "volksschule", "heimatmuseum"}


def namen(tags, k):
    return [x.strip() for x in (tags.get(k) or "").split(";") if x.strip()]


def main(pbf, poicsv, aus):
    import osmium
    ids = {"n": set(), "w": set(), "r": set()}
    pois = {}
    for r in csv.DictReader(open(poicsv, encoding="utf-8-sig"), delimiter=";"):
        i = r["id"][4:]
        if i[:1] in ids and i[1:].isdigit():
            ids[i[0]].add(int(i[1:]))
            pois[i] = r
    gefunden = {}

    class H(osmium.SimpleHandler):
        def merk(self, k, o):
            if o.id in ids[k]:
                gefunden[f"{k}{o.id}"] = {x: o.tags.get(x) for x in SCHLUESSEL + ("name",) if o.tags.get(x)}

        def node(self, o):
            self.merk("n", o)

        def way(self, o):
            self.merk("w", o)

        def relation(self, o):
            self.merk("r", o)

    H().apply_file(pbf)
    zeilen = []
    for i in sorted(gefunden, key=lambda x: (x[0], int(x[1:]))):
        t, p = gefunden[i], pois[i]
        typ = p["typ"]
        karte = {p["name"].lower(), (t.get("name") or "").lower()}
        gesagt, quelle = "", []
        if i in SPRECHEN and namen(t, SPRECHEN[i]):
            gesagt = namen(t, SPRECHEN[i])[0]
            quelle.append(f"OSM {SPRECHEN[i]}")
        verstanden = []
        if any(x in typ for x in FUNK_TYP):
            for k in SCHLUESSEL:
                for n in namen(t, k):
                    if n.lower() not in karte and n.lower() not in ALLGEMEIN and n != gesagt and n not in verstanden and len(n) >= 3:
                        verstanden.append(n)
                        quelle.append(f"OSM {k}")
        elif any(x in typ for x in KETTE_TYP):
            for n in namen(t, "old_name"):
                if n.lower() in KETTE_ALT and n.lower() not in karte and n not in verstanden:
                    verstanden.append(n)
                    quelle.append("OSM old_name")
        if gesagt or verstanden:
            zeilen.append((f"poi-{i}", "|".join([gesagt] + verstanden) if verstanden else gesagt, ", ".join(dict.fromkeys(quelle))))
    with open(aus, "w", encoding="utf-8", newline="") as f:
        f.write("id;sprechname;quelle\n")
        for z in zeilen:
            f.write(";".join(z) + "\n")
    print(len(zeilen), "Sprechnamen →", aus)


if __name__ == "__main__":
    main(*sys.argv[1:4])
