#!/usr/bin/env python3
"""Erzeugt die Standarddaten von LeitWerk (data/default/*.csv).

Quellen (tools/sources/):
  paul_dienststellen_nnoe.csv / paul_fahrzeuge_nnoe.csv  – von Paul geliefert (Raum Nord-NÖ)
  osm_rettungsdienst.csv                                 – OpenStreetMap, emergency=ambulance_station
  osm_krankenhaeuser_luftrettung.csv                     – OpenStreetMap, Krankenhäuser + Luftrettung
Krankenhaus-Abteilungen: NÖ LGA-Regionalberichte (Landtag NÖ, Gegenstand 0093),
für Wien/Burgenland/OÖ nach Allgemeinwissen (im Feld "hinweis" markiert).

Aufruf: python3 tools/build_default_data.py
"""
from __future__ import annotations

import csv
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "sources"
OUT = ROOT / "data" / "default"
EX = ROOT / "data" / "beispiele"

STATION_COLS = ["id", "name", "organisation", "typ", "ort", "bezirk", "adresse", "breitengrad", "laengengrad", "hinweis"]
VEHICLE_COLS = ["id", "funkrufname", "kurzname", "kategorie", "typ", "dienststelle", "aktiv", "nachtflug", "hinweis"]
HOSPITAL_FLAGS = [
    "notfallambulanz", "schockraum", "unfallambulanz", "kinderambulanz", "intensiv_anaesthesie",
    "neurologie", "kinderintensiv", "neonatologie", "hno", "urologie", "gyn_geburtshilfe",
]
HOSPITAL_COLS = ["id", "name", "kurzname", "ort", "breitengrad", "laengengrad", *HOSPITAL_FLAGS, "hinweis"]
POI_COLS = ["id", "name", "typ", "ort", "breitengrad", "laengengrad", "hinweis"]
TEMPLATE_COLS = ["id", "code", "adresse", "breitengrad", "laengengrad", "meldung", "patient_alter", "transport", "hinweis"]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def write_csv(path: Path, cols: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # UTF-8 mit BOM und Semikolon: so öffnet Excel (deutsch) die Datei direkt richtig.
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=";", extrasaction="ignore", lineterminator="\r\n")
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})
    print(f"{path.relative_to(ROOT)}: {len(rows)} Zeilen")


def dist_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def norm(s: str) -> str:
    s = s.lower().replace("bezirkstelle", "bezirksstelle").replace("sankt", "st.").replace("öatmc", "öamtc")
    return re.sub(r"[^a-z0-9äöüß]+", " ", s).strip()


def organisation_of(name: str, operator: str = "") -> str:
    s = (name + " " + operator).lower()
    for key, org in [
        ("samariter", "Arbeiter-Samariter-Bund"), ("johanniter", "Johanniter"), ("öamtc", "ÖAMTC"),
        ("öatmc", "ÖAMTC"), ("christophorus", "ÖAMTC"), ("notruf n", "Notruf NÖ"), ("öbb", "ÖBB"),
        ("malteser", "Malteser"), ("rotes kreuz", "Rotes Kreuz"), ("rk/asb", "Rotes Kreuz / ASB"),
    ]:
        if key in s:
            return org
    return ""


# ---------------------------------------------------------------- Dienststellen

# OSM-Einträge außerhalb Niederösterreichs (Orte ohne Landesverband-Angabe)
NOT_NOE_CITIES = {
    "Bruck an der Mur", "Kapfenberg", "Mürzzuschlag", "Eisenerz", "Trieben", "Kindberg", "Krieglach",
    "Thörl", "Turnau", "Trofaiach", "Ratten", "Vorau", "Langenwang", "Mariazell", "Sankt Marein im Mürztal",
    "Wildalpen", "Friedberg", "Andau", "Hornstein", "Weppersdorf", "Zurndorf", "Luftenberg an der Donau",
    "Steyr", "Weyer", "Enns", "Wien", "Eisenstadt", "Frauenkirchen", "Kittsee", "Mattersburg",
    "Neusiedl am See", "Oberpullendorf", "Deutschkreutz", "Gattendorf",
}


def build_stations() -> tuple[list[dict], dict[str, str]]:
    stations: list[dict] = []
    name_to_id: dict[str, str] = {}

    # 1. Pauls Liste (Koordinaten und Namen haben Vorrang)
    osm = read_csv(SRC / "osm_rettungsdienst.csv")
    osm_by_id = {r["@id"]: r for r in osm}
    for r in read_csv(SRC / "paul_dienststellen_nnoe.csv"):
        name = r["Name"].strip().replace("ÖATMC", "ÖAMTC").replace("Bezirkstelle", "Bezirksstelle")
        lat, lon = float(r["Breitengrad"]), float(r["Längengrad"])
        hinweis = "Quelle: Paul (Nord-NÖ)"
        if "Ried im Innkreis" in name:
            continue  # liegt in Oberösterreich, in der Quelle vermutlich versehentlich
        typ = {"Luftrettung": "Luftrettung"}.get(r["Typ"], "Rettungsdienst")
        if "Notruf Niederösterreich" in name or "Leitstelle" in name:
            typ = "Leitstelle"
        if "Notarztstützpunkt" in name:
            typ = "Notarztstützpunkt"
        if "Mistelbach" in name:
            # In der Quelle identisch mit Hollabrunn -> Koordinaten aus OpenStreetMap
            lat, lon = 48.5665420, 16.5807706
            hinweis += "; Koordinaten aus OSM korrigiert"
        sid = f"p{r['POI-ID']}"
        stations.append({
            "id": sid, "name": name, "organisation": organisation_of(name), "typ": typ,
            "ort": "", "bezirk": "", "adresse": "", "breitengrad": f"{lat:.6f}", "laengengrad": f"{lon:.6f}",
            "hinweis": hinweis,
        })
        name_to_id[norm(name)] = sid

    # 2. Weitere Luftrettungsstützpunkte (OSM, Ergänzung)
    extra_air = [
        ("air-c16", "ÖAMTC Christophorus 16 Oberwart", 47.3053892, 16.1836694, "Oberwart"),
        ("air-c18", "ÖAMTC Christophorus 18 Frauenkirchen", 47.8570821, 16.9389095, "Frauenkirchen"),
        ("air-c10", "ÖAMTC Christophorus 10 Hörsching-Linz", 48.2390934, 14.1865143, "Hörsching"),
        ("air-c17", "ÖAMTC Christophorus 17 St. Michael", 47.3361032, 15.0014968, "St. Michael in der Obersteiermark"),
    ]
    for sid, name, lat, lon, ort in extra_air:
        stations.append({
            "id": sid, "name": name, "organisation": "ÖAMTC", "typ": "Luftrettung", "ort": ort,
            "bezirk": "", "adresse": "", "breitengrad": f"{lat:.6f}", "laengengrad": f"{lon:.6f}",
            "hinweis": "Quelle: OpenStreetMap",
        })
        name_to_id[norm(name)] = sid

    # 3. Übrige NÖ-Dienststellen aus OpenStreetMap
    for r in osm:
        name = r["name"].strip()
        city = r["addr:city"].strip()
        op = r["operator"]
        if not name or not city or city in NOT_NOE_CITIES:
            continue
        s = (name + " " + op).lower()
        if not any(k in s for k in ["rotes kreuz", "samariter", "johanniter", "notruf n", "acute community"]):
            continue
        if any(k in op for k in ["Burgenland", "Oberösterreich", "Steiermark"]):
            continue
        lat, lon = float(r["@lat"]), float(r["@lon"])
        # schon in Pauls Liste? (Name gleich oder < 400 m entfernt)
        if norm(name) in name_to_id or any(
            dist_m((lat, lon), (float(x["breitengrad"]), float(x["laengengrad"]))) < 400 for x in stations
        ):
            for x in stations:
                if x["ort"] == "" and dist_m((lat, lon), (float(x["breitengrad"]), float(x["laengengrad"]))) < 400:
                    x["ort"] = city
            continue
        typ = "Notarztstützpunkt" if "Notarzt" in name else "Rettungsdienst"
        if "Acute Community" in name:
            typ = "Sonstige"
        sid = f"osm{r['@id']}"
        stations.append({
            "id": sid, "name": name.replace("Ortsstelle Ortsstelle", "Ortsstelle"),
            "organisation": organisation_of(name, op), "typ": typ, "ort": city, "bezirk": "",
            "adresse": "", "breitengrad": f"{lat:.6f}", "laengengrad": f"{lon:.6f}",
            "hinweis": "Quelle: OpenStreetMap",
        })
        name_to_id[norm(name)] = sid

    stations.sort(key=lambda x: (x["typ"] != "Luftrettung", x["name"]))
    return stations, name_to_id


# ---------------------------------------------------------------- Fahrzeuge

def category_of(typ: str, funkruf: str, station_typ: str) -> str:
    t = typ.upper()
    if "ACN" in funkruf.upper():
        return "Sonstige"
    if t == "NAH":
        return "NAH"
    if t in {"RTW", "RTW-C"}:
        return "RTW"
    if t in {"PHYSICIAN", "NEF", "NAW"}:
        return "Sonstige" if station_typ == "Luftrettung" else "NEF"
    if t.startswith("KTW"):
        return "KTW"
    # AMB Type I/II: nicht verwendet; SKTW, SRTW, SNAW: Sekundärtransport (späteres Update)
    return "Sonstige"


NAH = {  # Kurzname -> (Funkrufname nach Schema 99/XXX, Stützpunkt-Name)
    "Christophorus 2": ("99/002", "ÖAMTC Christophorus 2"),
    "Christophorus 3": ("99/003", "ÖAMTC Christophorus Luftrettungszentrum Ost"),
    "Christophorus 9": ("99/009", "ÖATMC Christophorus 9"),
    "Christophorus 15": ("99/015", "ÖATMC Christophorus 15"),
    "Christophorus 16": ("99/016", "ÖAMTC Christophorus 16 Oberwart"),
    "Christophorus 18": ("99/018", "ÖAMTC Christophorus 18 Frauenkirchen"),
    "Christophorus 10": ("99/010", "ÖAMTC Christophorus 10 Hörsching-Linz"),
    "Christophorus 17": ("99/017", "ÖAMTC Christophorus 17 St. Michael"),
}


def build_vehicles(stations: list[dict], name_to_id: dict[str, str]) -> list[dict]:
    by_id = {s["id"]: s for s in stations}
    vehicles: list[dict] = []
    seen_nah: set[str] = set()
    for r in read_csv(SRC / "paul_fahrzeuge_nnoe.csv"):
        st_id = name_to_id.get(norm(r["Dienststelle"]))
        if not st_id:
            print("  Dienststelle nicht gefunden:", r["Dienststelle"])
            continue
        funk, kurz, typ = r["Funkrufname"].strip(), r["Kurzname"].strip(), r["Typ"].strip()
        if kurz in NAH:
            funk = NAH[kurz][0]
            seen_nah.add(kurz)
        if kurz == "Christophorus 33":
            funk = "99/033"
        kat = category_of(typ, funk, by_id[st_id]["typ"])
        vehicles.append({
            "id": f"p{r['Unit-ID']}", "funkrufname": funk, "kurzname": kurz if kurz != funk else "",
            "kategorie": kat, "typ": typ, "dienststelle": st_id,
            "aktiv": "ja" if kat in {"RTW", "NEF", "NAH", "KTW"} else "nein",
            "nachtflug": "nein",
            "hinweis": "Quelle: Paul (Nord-NÖ)" + ("; Nachtflugtauglichkeit bitte prüfen" if kat == "NAH" else ""),
        })
    for kurz, (funk, st_name) in NAH.items():
        if kurz in seen_nah:
            continue
        vehicles.append({
            "id": "nah-" + funk.replace("/", ""), "funkrufname": funk, "kurzname": kurz, "kategorie": "NAH",
            "typ": "NAH", "dienststelle": name_to_id[norm(st_name)], "aktiv": "ja", "nachtflug": "nein",
            "hinweis": "Ergänzt (Recherche OpenStreetMap); Nachtflugtauglichkeit bitte prüfen",
        })
    vehicles.sort(key=lambda v: (v["dienststelle"], v["funkrufname"]))
    return vehicles


# ---------------------------------------------------------------- Krankenhäuser

Y, N = "ja", "nein"
LGA = "Abteilungen laut NÖ LGA-Regionalbericht; Schockraum angenommen bei Unfallchirurgie + Intensiv"
WISSEN = "Abteilungen nach Allgemeinwissen, bitte prüfen"

# name, kurzname, ort, OSM-Name (für Koordinaten) oder (lat, lon), Flags (Reihenfolge HOSPITAL_FLAGS), Hinweis
HOSPITALS = [
    ("Universitätsklinikum St. Pölten", "UK St. Pölten", "St. Pölten", "Universitätsklinikum St. Pölten", "11111111111", LGA + "; Kinderintensiv/Neonatologie nach Allgemeinwissen"),
    ("Universitätsklinikum Krems", "UK Krems", "Krems an der Donau", "Universitätsklinikum Krems", "11111000111", LGA),
    ("Universitätsklinikum Tulln", "UK Tulln", "Tulln an der Donau", ("way", "397475168"), "11111101001", LGA + "; Neonatologie: Frühgeborene ab 29. SSW"),
    ("Universitätsklinikum Wiener Neustadt", "UK Wr. Neustadt", "Wiener Neustadt", "Universitätsklinikum Wiener Neustadt", "11111111111", LGA + "; Kinderintensiv/Neonatologie nach Allgemeinwissen"),
    ("Landesklinikum Mistelbach-Gänserndorf", "LK Mistelbach", "Mistelbach", "Landesklinikum Mistelbach-Gänserndorf", "11111100111", LGA),
    ("Landesklinikum Amstetten", "LK Amstetten", "Amstetten", "Landesklinikum Amstetten", "11111100001", LGA),
    ("Landesklinikum Horn", "LK Horn", "Horn", "Landesklinikum Horn", "11101100001", LGA + "; Stroke Unit"),
    ("Landesklinikum Baden", "LK Baden", "Baden", "Landesklinikum Baden", "11101000010", LGA),
    ("Landesklinikum Mödling", "LK Mödling", "Mödling", "Landesklinikum Mödling", "10111100001", LGA),
    ("Universitätsklinikum Neunkirchen", "UK Neunkirchen", "Neunkirchen", "Universitätsklinikum Neunkirchen", "11101000001", LGA),
    ("Landesklinikum Korneuburg", "LK Korneuburg", "Korneuburg", "Landesklinikum Korneuburg", "11101000011", LGA),
    ("Landesklinikum Stockerau", "LK Stockerau", "Stockerau", "Landesklinikum Stockerau", "10000000000", LGA + "; nur Innere Medizin"),
    ("Landesklinikum Hollabrunn", "LK Hollabrunn", "Hollabrunn", "Landesklinikum Hollabrunn", "10001000001", LGA),
    ("Landesklinikum Hainburg", "LK Hainburg", "Hainburg an der Donau", "Landesklinikum Hainburg", "11101000001", LGA),
    ("Landesklinikum Klosterneuburg", "LK Klosterneuburg", "Klosterneuburg", "Landesklinikum Klosterneuburg", "10001000001", LGA + "; Unfallchirurgie nur Tagesklinik"),
    ("Landesklinikum Lilienfeld", "LK Lilienfeld", "Lilienfeld", "Landesklinikum Lilienfeld", "10101000001", LGA + "; unfallchirurgische Grundversorgung"),
    ("Landesklinikum Melk", "LK Melk", "Melk", "Landesklinikum Melk", "10001100001", LGA),
    ("Landesklinikum Scheibbs", "LK Scheibbs", "Scheibbs", "Landesklinikum Scheibbs", "11101000001", LGA),
    ("Landesklinikum Waidhofen/Ybbs", "LK Waidhofen/Ybbs", "Waidhofen an der Ybbs", "Landesklinikum Waidhofen/Ybbs", "11101000011", LGA),
    ("Landesklinikum Zwettl", "LK Zwettl", "Zwettl", ("relation", "412222"), "11111001001", LGA),
    ("Landesklinikum Gmünd", "LK Gmünd", "Gmünd", "Landesklinikum Gmünd", "10101000000", LGA),
    ("Landesklinikum Waidhofen/Thaya", "LK Waidhofen/Thaya", "Waidhofen an der Thaya", ("way", "29365407"), "10001000010", LGA),
    ("AKH Wien", "AKH", "Wien", "AKH Wien", "11111111111", WISSEN),
    ("Klinik Floridsdorf", "Floridsdorf", "Wien", "Klinik Floridsdorf", "11111111111", WISSEN),
    ("Klinik Donaustadt", "Donaustadt", "Wien", "Klinik Donaustadt", "11111111111", WISSEN),
    ("Klinik Ottakring", "Ottakring", "Wien", "Klinik Ottakring", "11111111101", WISSEN),
    ("Klinik Favoriten", "Favoriten", "Wien", "Klinik Favoriten", "11111111111", WISSEN),
    ("Klinik Hietzing", "Hietzing", "Wien", "Klinik Hietzing", "11101100011", WISSEN),
    ("Klinik Landstraße", "Landstraße", "Wien", "Klinik Landstraße", "11101100110", WISSEN),
    ("AUVA-Traumazentrum Wien, Standort Meidling", "TZ Meidling", "Wien", "Unfallkrankenhaus Meidling", "01101000000", WISSEN),
    ("AUVA-Traumazentrum Wien, Standort Brigittenau", "TZ Brigittenau", "Wien", (48.2368999, 16.3834449), "01101000000", WISSEN),
    ("Krankenhaus der Barmherzigen Brüder Wien", "BB Wien", "Wien", "Krankenhaus der Barmherzigen Brüder Wien", "10001000110", WISSEN),
    ("St. Anna Kinderspital", "St. Anna", "Wien", "St. Anna Kinderspital", "00011010000", WISSEN + "; Kinderspital"),
    ("Krankenhaus der Barmherzigen Brüder Eisenstadt", "BB Eisenstadt", "Eisenstadt", "Krankenhaus der Barmherzigen Brüder Eisenstadt", "11101100101", WISSEN),
    ("Klinik Oberwart", "Oberwart", "Oberwart", "Klinik Oberwart", "11111100011", WISSEN),
    ("Klinik Kittsee", "Kittsee", "Kittsee", "Klinik Kittsee", "10001000000", WISSEN),
    ("Kepler Universitätsklinikum Linz, Med Campus III", "KUK Linz", "Linz", "Kepler Universitätsklinikum - Med Campus III", "11111111111", WISSEN),
    ("AUVA-Unfallkrankenhaus Linz", "UKH Linz", "Linz", "Unfallkrankenhaus Linz", "01101000000", WISSEN),
]


def build_hospitals() -> list[dict]:
    osm = read_csv(SRC / "osm_krankenhaeuser_luftrettung.csv")
    by_name: dict[str, dict] = {}
    by_key: dict[tuple[str, str], dict] = {}
    for r in osm:
        by_name.setdefault(r["name"], r)
        by_key[(r["@type"], r["@id"])] = r
    out = []
    for i, (name, kurz, ort, loc, flags, hinweis) in enumerate(HOSPITALS, start=1):
        if isinstance(loc, tuple) and isinstance(loc[0], float):
            lat, lon = loc
        else:
            r = by_key[loc] if isinstance(loc, tuple) else by_name[loc]
            lat, lon = float(r["@lat"]), float(r["@lon"])
        row = {"id": f"kh{i:03d}", "name": name, "kurzname": kurz, "ort": ort,
               "breitengrad": f"{lat:.6f}", "laengengrad": f"{lon:.6f}", "hinweis": hinweis}
        assert len(flags) == len(HOSPITAL_FLAGS), name
        for f, v in zip(HOSPITAL_FLAGS, flags):
            row[f] = Y if v == "1" else N
        out.append(row)
    return out


# ---------------------------------------------------------------- Beispiele

def build_examples() -> None:
    write_csv(EX / "beispiel_dienststellen.csv", STATION_COLS, [
        {"id": "ws-01", "name": "Rotes Kreuz Musterstadt", "organisation": "Rotes Kreuz", "typ": "Rettungsdienst",
         "ort": "Musterstadt", "bezirk": "Musterbezirk", "adresse": "Hauptplatz 1", "breitengrad": "48.200000",
         "laengengrad": "15.600000", "hinweis": "Beispielzeile"},
        {"id": "ws-02", "name": "Notarztstützpunkt Musterstadt", "organisation": "Rotes Kreuz", "typ": "Notarztstützpunkt",
         "ort": "Musterstadt", "bezirk": "Musterbezirk", "adresse": "Spitalgasse 5", "breitengrad": "48.205000",
         "laengengrad": "15.610000", "hinweis": ""},
    ])
    write_csv(EX / "beispiel_fahrzeuge.csv", VEHICLE_COLS, [
        {"id": "", "funkrufname": "75/001", "kurzname": "", "kategorie": "RTW", "typ": "RTW-C", "dienststelle": "ws-01", "aktiv": "ja"},
        {"id": "", "funkrufname": "75/002", "kurzname": "", "kategorie": "RTW", "typ": "RTW", "dienststelle": "Rotes Kreuz Musterstadt", "aktiv": "ja",
         "hinweis": "Dienststelle darf auch per Name angegeben werden"},
        {"id": "", "funkrufname": "75/099", "kurzname": "NEF Musterstadt", "kategorie": "NEF", "typ": "NEF", "dienststelle": "ws-02", "aktiv": "ja"},
        {"id": "", "funkrufname": "99/002", "kurzname": "Christophorus 2", "kategorie": "NAH", "typ": "NAH", "dienststelle": "ÖAMTC Christophorus 2", "aktiv": "ja", "nachtflug": "nein"},
    ])
    write_csv(EX / "beispiel_krankenhaeuser.csv", HOSPITAL_COLS, [
        {"id": "kh-x1", "name": "Klinikum Musterstadt", "kurzname": "KL Musterstadt", "ort": "Musterstadt",
         "breitengrad": "48.210000", "laengengrad": "15.620000", **{f: (Y if f in {"notfallambulanz", "intensiv_anaesthesie", "gyn_geburtshilfe"} else N) for f in HOSPITAL_FLAGS},
         "hinweis": "Werte: ja / nein"},
    ])
    write_csv(EX / "beispiel_pois.csv", POI_COLS, [
        {"id": "poi-1", "name": "Badesee Musterstadt", "typ": "Freizeit", "ort": "Musterstadt", "breitengrad": "48.215000", "laengengrad": "15.630000"},
        {"id": "poi-2", "name": "Autobahnauffahrt Musterstadt Nord", "typ": "Verkehr", "ort": "Musterstadt", "breitengrad": "48.230000", "laengengrad": "15.640000"},
    ])
    write_csv(EX / "beispiel_einsatzvorlagen.csv", TEMPLATE_COLS, [
        {"id": "ev-1", "code": "RD-10D1", "adresse": "Obere Landstraße 10, 3500 Krems an der Donau", "breitengrad": "48.410900",
         "laengengrad": "15.601200", "meldung": "Mann, ca. 60, starke Schmerzen in der Brust, schwitzt stark", "patient_alter": "60",
         "transport": "ja", "hinweis": "Beispielzeile – Koordinaten = tatsächlicher Einsatzort"},
        {"id": "ev-2", "code": "RD-17A1", "adresse": "Hauptplatz 1, 3550 Langenlois", "breitengrad": "48.473800",
         "laengengrad": "15.680900", "meldung": "Frau auf dem Gehsteig gestürzt, Knöchel tut weh", "patient_alter": "",
         "transport": "", "hinweis": "leeres Alter / Transport = zufällig"},
    ])
    for name, cols in [("dienststellen", STATION_COLS), ("fahrzeuge", VEHICLE_COLS),
                       ("krankenhaeuser", HOSPITAL_COLS), ("pois", POI_COLS), ("einsatzvorlagen", TEMPLATE_COLS)]:
        write_csv(EX / f"vorlage_{name}.csv", cols, [])


def main() -> None:
    stations, name_to_id = build_stations()
    vehicles = build_vehicles(stations, name_to_id)
    hospitals = build_hospitals()
    write_csv(OUT / "dienststellen.csv", STATION_COLS, stations)
    write_csv(OUT / "fahrzeuge.csv", VEHICLE_COLS, vehicles)
    write_csv(OUT / "krankenhaeuser.csv", HOSPITAL_COLS, hospitals)
    write_csv(OUT / "pois.csv", POI_COLS, [])
    write_csv(OUT / "einsatzvorlagen.csv", TEMPLATE_COLS, [])
    build_examples()

    # Plausibilitätsprüfung: doppelte Koordinaten
    seen: dict[str, str] = {}
    for s in stations:
        k = s["breitengrad"] + "," + s["laengengrad"]
        if k in seen:
            print("  WARNUNG gleiche Koordinaten:", s["name"], "/", seen[k])
        seen[k] = s["name"]


if __name__ == "__main__":
    main()
