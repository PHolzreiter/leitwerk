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
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "sources"
OUT = ROOT / "data" / "default"
EX = ROOT / "data" / "beispiele"

STATION_COLS = ["id", "name", "organisation", "typ", "ort", "bezirk", "adresse", "breitengrad", "laengengrad", "hinweis"]
VEHICLE_COLS = ["id", "funkrufname", "kurzname", "kategorie", "typ", "aufbau", "modell", "dienststelle", "aktiv", "nachtflug", "dienstplan", "ersatz_fuer", "hinweis"]
HOSPITAL_FLAGS = [
    "notfallambulanz", "schockraum", "unfallambulanz", "kinderambulanz", "intensiv_anaesthesie",
    "neurologie", "kinderintensiv", "neonatologie", "hno", "urologie", "gyn_geburtshilfe",
]
HOSPITAL_COLS = ["id", "name", "kurzname", "ort", "breitengrad", "laengengrad", "einrichtungen", "akut_aus", "zeiten", "plaetze", "aufnahmerad", "hinweis"]
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
    # Luftrettung: alte und neue Schreibweise gleich behandeln
    s = s.replace("luftrettungszentrum", " ").replace("christophorus luftrettungszentrum ost", "ost").replace("christophorus  ost", "ost")
    s = re.sub(r"christophorus\s+ost", "ost", s)
    return re.sub(r"[^a-z0-9äöüß]+", " ", s).strip()


def luft_name(name: str) -> str:
    """„ÖAMTC Christophorus 2“ → „ÖAMTC Luftrettungszentrum Christophorus 2“, C3/C33-Basis → „ÖAMTC Luftrettungszentrum Ost“"""
    if "Luftrettungszentrum Ost" in name:
        return "ÖAMTC Luftrettungszentrum Ost"
    m = re.match(r"ÖAMTC Christophorus (\d+)", name)
    return f"ÖAMTC Luftrettungszentrum Christophorus {m.group(1)}" if m else name


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
        hinweis = ""
        if "Ried im Innkreis" in name:
            continue  # liegt in Oberösterreich, in der Quelle vermutlich versehentlich
        typ = {"Luftrettung": "Luftrettung"}.get(r["Typ"], "Rettungsdienst")
        if typ == "Luftrettung":
            name_to_id[norm(name)] = f"p{r['POI-ID']}"
            name = luft_name(name)
        if "Notruf Niederösterreich" in name or "Leitstelle" in name:
            typ = "Leitstelle"
        if "Notarztstützpunkt" in name:
            typ = "Notarztstützpunkt"
        if "Mistelbach" in name:
            # In der Quelle identisch mit Hollabrunn -> Koordinaten aus OpenStreetMap
            lat, lon = 48.5665420, 16.5807706
            hinweis = "Koordinaten aus OSM korrigiert"
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
        name_to_id[norm(name)] = sid
        name = luft_name(name)
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
    # 4. Feuerwehr (Hauptfeuerwehr je Gemeinde + Bezirkskommanden), Polizeiinspektionen, Wasser- und Bergrettung
    #    aus OpenStreetMap (tools/osm_partner_holen.py) – ohne eigene Fahrzeuge
    partner = SRC / "osm_partner.csv"
    if partner.exists():
        kurz = {"Feuerwehr": "fw", "Polizei": "pol", "Wasserrettung": "wr", "Bergrettung": "br"}
        for r in read_csv(partner):
            stations.append({
                "id": f"{kurz[r['typ']]}-{r['osm'].replace('/', '')}", "name": r["name"], "organisation": r["organisation"],
                "typ": r["typ"], "ort": r["ort"], "bezirk": "", "adresse": "",
                "breitengrad": r["lat"], "laengengrad": r["lon"], "hinweis": "Quelle: OpenStreetMap",
            })
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
    # ab 0.9/0.11: Sekundärfahrzeuge, ITH, BEL, EL ÖBB; AMB Type I/II werden nicht verwendet
    if t in {"SKTW", "SRTW", "SNAW", "BIT", "BEL", "EL ÖBB"}:
        return t
    if t in {"AIR ICU-AMB", "ITH"}:
        return "ITH"
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
            "aktiv": "nein" if kat == "Sonstige" else "ja",
            # Nachts fliegen nur Christophorus 2 und 9
            "nachtflug": "ja" if funk in {"99/002", "99/009"} else "nein",
            "hinweis": "Nachtflugtauglichkeit bitte prüfen" if kat == "NAH" else "",
        })
    for kurz, (funk, st_name) in NAH.items():
        if kurz in seen_nah:
            continue
        vehicles.append({
            "id": "nah-" + funk.replace("/", ""), "funkrufname": funk, "kurzname": kurz, "kategorie": "NAH",
            "typ": "NAH", "dienststelle": name_to_id[norm(st_name)], "aktiv": "ja", "nachtflug": "ja" if funk in {"99/002", "99/009"} else "nein",
            "hinweis": "Ergänzt (Recherche OpenStreetMap); Nachtflugtauglichkeit bitte prüfen",
        })
    dienstplaene_einspielen(vehicles)
    ersatz_nef(vehicles)
    vehicles.sort(key=lambda v: (v["dienststelle"], v["funkrufname"]))
    return vehicles


def ersatz_nef(vehicles: list[dict]) -> None:
    """
    Jeder Primär-Hubschrauber (NAH, nicht ITH) hat ein ÖAMTC-NEF am Stützpunkt: angemeldet nur, wenn der
    Hubschrauber nicht fliegen kann (Wetter, Nacht ohne Nachtflug) – dieselbe Besatzung.
    Funkrufname: 99/002 → 99/902. Vorhandene (z. B. 99/902 aus Pauls Liste) werden nur verknüpft.
    """
    nach_funk = {v["funkrufname"]: v for v in vehicles}
    for nah in [v for v in vehicles if v["kategorie"] == "NAH"]:
        m = re.match(r"99/0(\d\d)$", nah["funkrufname"])
        if not m:
            continue
        funk = f"99/9{m.group(1)}"
        nef = nach_funk.get(funk)
        if nef is None:
            nef = {
                "id": "nef-" + funk.replace("/", ""), "funkrufname": funk, "kurzname": "", "kategorie": "NEF", "typ": "NEF ÖAMTC",
                "dienststelle": nah["dienststelle"], "aktiv": "ja", "nachtflug": "nein", "dienstplan": "24/7",
                "hinweis": "ÖAMTC-NEF, nur angemeldet, wenn der Hubschrauber nicht fliegen kann",
            }
            vehicles.append(nef)
        nef["ersatz_fuer"] = nah["funkrufname"]
        nef["typ"] = "NEF ÖAMTC"
        if not nef.get("hinweis"):
            nef["hinweis"] = "ÖAMTC-NEF, nur angemeldet, wenn der Hubschrauber nicht fliegen kann"


# ---------------------------------------------------------------- Dienstpläne und Typen (paul_fahrzeuge_schichten.csv)

TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
TAG_NR = {t.lower(): i + 1 for i, t in enumerate(TAGE)}


def norm_key(s: str) -> str:
    """wie normKey in src/data/schema.ts"""
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]", "", s)


def streuung(text: str) -> float:
    """fester Zufallswert 0–1 je Text – gleich wie streuung() in src/data/schema.ts (FNV-1a)"""
    h = 2166136261
    for c in norm_key(text):
        h ^= ord(c)
        h = (h * 16777619) & 0xFFFFFFFF
    return (h % 10_000) / 10_000


def tage_lesen(t: str) -> list[int]:
    t = t.strip().lower().replace("–", "-").replace("—", "-")
    if t in {"24/7", "täglich", "immer", ""}:
        return list(range(1, 8))
    tage: set[int] = set()
    for teil in re.split(r"[,;/+\s]+", re.sub(r"\s*-\s*", "-", t)):
        if not teil:
            continue
        if "-" in teil:
            a, b = (TAG_NR[x] for x in teil.split("-"))
            d = a
            while True:
                tage.add(d)
                if d == b:
                    break
                d = d % 7 + 1
        else:
            tage.add(TAG_NR[teil])
    return sorted(tage)


def tage_text(tage: list[int]) -> str:
    """wie tageText() in src/sim/dienst.ts"""
    if len(tage) == 7:
        return "täglich"
    teile, i = [], 0
    while i < len(tage):
        j = i
        while j + 1 < len(tage) and tage[j + 1] == tage[j] + 1:
            j += 1
        if j - i >= 2:
            teile.append(f"{TAGE[tage[i] - 1]}–{TAGE[tage[j] - 1]}")
        else:
            teile.extend(TAGE[k - 1] for k in range(tage[i], tage[j] + 1))
        i = j + 1
    return ", ".join(teile)


def zeit(t: str) -> str:
    t = t.strip()
    if t.lower() == "sonnenaufgang":
        return "Sonnenaufgang"
    if t.lower() == "sonnenuntergang":
        return "Sonnenuntergang"
    h, m = t.split(":")
    return f"{int(h):02d}:{int(m):02d}"


def typ_normal(t: str) -> str:
    k = t.upper().replace(" ", "")
    return {"RTWC": "RTW-C", "RTW-C": "RTW-C", "KTWB": "KTW-B", "KTW-B": "KTW-B"}.get(k, t.strip())


def natur(s: str) -> list:
    return [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", s)]


def dienstplaene_einspielen(vehicles: list[dict]) -> None:
    """
    Dienstzeiten und Typen aus Pauls Export (eine Zeile je Schicht) übernehmen:
    - RTW = klein (VW T6), RTW-C = groß (Crafter); je Dienststelle nur EIN RTW-C, weitere werden große RTW
    - KTW/KTW-B zufällig (fest je Funkrufname)
    """
    pfad = SRC / "paul_fahrzeuge_schichten.csv"
    if not pfad.exists():
        return
    schichten: dict[str, list[str]] = {}
    typen: dict[str, str] = {}
    for r in read_csv(pfad):
        funk = r["Funkrufname"].strip()
        if funk in NAH:
            funk = NAH[funk][0]
        elif funk == "Christophorus 33":
            funk = "99/033"
        typen.setdefault(funk, typ_normal(r["Typ"]))
        liste = schichten.setdefault(funk, [])
        if r["Beginn"].strip() == "24/7":
            continue
        liste.append(f"{tage_text(tage_lesen(r['Wochentag(e)']))} {zeit(r['Beginn'])}–{zeit(r['Ende'])}")
    for v in vehicles:
        f = v["funkrufname"]
        if f not in typen:
            continue
        typ = typen[f]
        if typ in {"KTW", "KTW-B"}:
            typ = "KTW" if streuung(f) < 0.3 else "KTW-B"
        alt_kat = v["kategorie"]
        v["typ"] = typ
        v["kategorie"] = category_of(typ, f, "")
        if v["kategorie"] != alt_kat:
            v["aktiv"] = "nein" if v["kategorie"] == "Sonstige" else "ja"
        v["aufbau"] = "groß" if typ == "RTW-C" else "klein" if typ == "RTW" else ""
        v["dienstplan"] = "; ".join(schichten[f]) or "24/7"
    # nur ein RTW-C je Dienststelle (kleinster Funkrufname bleibt)
    pro_st: dict[str, list[dict]] = {}
    for v in vehicles:
        if v["typ"] == "RTW-C":
            pro_st.setdefault(v["dienststelle"], []).append(v)
    for liste in pro_st.values():
        liste.sort(key=lambda v: natur(v["funkrufname"]))
        for v in liste[1:]:
            v["typ"] = "RTW"
            v["aufbau"] = "groß"


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
    # ab 0.11 (Überstellungen): weitere Ziele innerhalb des Straßennetzes
    ("Landesklinikum Mauer", "LK Mauer", "Mauer bei Amstetten", (48.0920043, 14.8056383), "00001000000", WISSEN + "; Psychiatrie"),
    ("Landesklinikum Allentsteig", "LK Allentsteig", "Allentsteig", (48.7012486, 15.3283298), "00000000000", WISSEN + "; Psychiatrie, Remobilisation"),
    ("Universitätsklinikum Hochegg", "UK Hochegg", "Grimmenstein", (47.6165615, 16.0865190), "00001000000", WISSEN + "; Lungenheilkunde"),
    ("Hanusch-Krankenhaus", "Hanusch", "Wien", (48.1995663, 16.2918894), "11001100111", WISSEN),
    ("Klinik Penzing", "Penzing", "Wien", (48.2069362, 16.2717122), "00001000000", WISSEN + "; Lungenheilkunde, Psychiatrie"),
    ("Orthopädisches Spital Speising", "Speising", "Wien", (48.1636413, 16.2820922), "00000000000", WISSEN + "; Orthopädie"),
    ("Krankenhaus Göttlicher Heiland", "Göttl. Heiland", "Wien", (48.2282146, 16.3040927), "10001000000", WISSEN),
    ("Kepler Universitätsklinikum Linz, Neuromed Campus", "KUK Neuromed", "Linz", (48.2805058, 14.2969815), "11001100000", WISSEN + "; Neurologie, Neurochirurgie, Psychiatrie"),
    ("Kepler Universitätsklinikum Linz, Med Campus IV", "KUK Kinder", "Linz", (48.3018507, 14.3060068), "10011011001", WISSEN + "; Kinder- und Frauenklinik"),
    ("Ordensklinikum Linz Barmherzige Schwestern", "BHS Linz", "Linz", (48.2991078, 14.2885608), "10001000110", WISSEN),
    ("Ordensklinikum Linz Elisabethinen", "Elisabethinen Linz", "Linz", (48.3048576, 14.2941354), "10001000000", WISSEN),
    ("Pyhrn-Eisenwurzen Klinikum Steyr", "PEK Steyr", "Steyr", (48.0447000, 14.3931338), "11111101111", WISSEN),
    ("Klinikum Freistadt", "KH Freistadt", "Freistadt", (48.4922426, 14.4979369), "11101000001", WISSEN),
    # ab 0.12: alle Akutspitäler in OÖ, Steiermark, Burgenland und weitere in Wien (Koordinaten: OpenStreetMap)
    ("Krankenhaus der Barmherzigen Brüder Linz", "BB Linz", "Linz", (48.3000103, 14.2884471), "10001100110", WISSEN),
    ("Klinikum Wels-Grieskirchen, Standort Wels", "Klinikum Wels", "Wels", (48.1737117, 14.0262798), "11111111111", WISSEN),
    ("Klinikum Wels-Grieskirchen, Standort Grieskirchen", "Klinikum Grieskirchen", "Grieskirchen", (48.2382404, 13.8207283), "10001000011", WISSEN),
    ("Pyhrn-Eisenwurzen Klinikum Kirchdorf", "PEK Kirchdorf", "Kirchdorf an der Krems", (47.9085451, 14.1244277), "11101000001", WISSEN),
    ("Salzkammergut Klinikum Vöcklabruck", "SK Vöcklabruck", "Vöcklabruck", (48.0022710, 13.6386652), "11111101111", WISSEN),
    ("Salzkammergut Klinikum Gmunden", "SK Gmunden", "Gmunden", (47.9163664, 13.7804454), "11101000101", WISSEN),
    ("Salzkammergut Klinikum Bad Ischl", "SK Bad Ischl", "Bad Ischl", (47.7061358, 13.6243199), "11101000001", WISSEN),
    ("Krankenhaus St. Josef Braunau", "KH Braunau", "Braunau am Inn", (48.2559731, 13.0334242), "11111100111", WISSEN),
    ("Klinikum Schärding", "Klinikum Schärding", "Schärding", (48.4552567, 13.4356690), "11101000001", WISSEN),
    ("Krankenhaus der Barmherzigen Schwestern Ried", "BHS Ried", "Ried im Innkreis", (48.2104748, 13.4928471), "11111101111", WISSEN),
    ("Klinikum Rohrbach", "Klinikum Rohrbach", "Rohrbach-Berg", (48.5709823, 13.9823076), "11101000001", WISSEN),
    ("LKH-Universitätsklinikum Graz", "LKH-Univ. Graz", "Graz", (47.0840468, 15.4655544), "11111111111", WISSEN),
    ("LKH Graz II, Standort West", "LKH Graz West", "Graz", (47.0777244, 15.3997518), "11101100000", WISSEN),
    ("LKH Graz II, Standort Süd", "LKH Graz Süd", "Graz", (47.0379788, 15.4186322), "00001100000", WISSEN + "; Psychiatrie, Neurologie"),
    ("LKH Graz II, Standort Hörgas-Enzenbach", "LKH Hörgas", "Gratwein-Straßengel", (47.1453506, 15.3031265), "00001000000", WISSEN + "; Lungenheilkunde"),
    ("LKH Graz II, Standort Voitsberg", "LKH Voitsberg", "Voitsberg", (47.0524825, 15.1404317), "10001000000", WISSEN),
    ("Krankenhaus der Elisabethinen Graz", "Elisabethinen Graz", "Graz", (47.0695809, 15.4262715), "10001000000", WISSEN),
    ("Krankenhaus der Barmherzigen Brüder Graz", "BB Graz", "Graz", (47.0718587, 15.4320376), "10001000110", WISSEN),
    ("AUVA-Unfallkrankenhaus Steiermark, Standort Graz", "UKH Graz", "Graz", (47.0786789, 15.3980788), "01101000000", WISSEN),
    ("AUVA-Unfallkrankenhaus Steiermark, Standort Kalwang", "UKH Kalwang", "Kalwang", (47.4250476, 14.7605355), "01101000000", WISSEN),
    ("LKH Hochsteiermark, Standort Leoben", "LKH Leoben", "Leoben", (47.3803169, 15.0849985), "11111111111", WISSEN),
    ("LKH Hochsteiermark, Standort Bruck an der Mur", "LKH Bruck/Mur", "Bruck an der Mur", (47.4231146, 15.2676566), "11101000010", WISSEN),
    ("LKH Hochsteiermark, Standort Mürzzuschlag", "LKH Mürzzuschlag", "Mürzzuschlag", (47.6000265, 15.6684948), "10001000000", WISSEN),
    ("LKH Rottenmann-Bad Aussee, Standort Rottenmann", "LKH Rottenmann", "Rottenmann", (47.5247349, 14.3685137), "11101000001", WISSEN),
    ("LKH Rottenmann-Bad Aussee, Standort Bad Aussee", "LKH Bad Aussee", "Bad Aussee", (47.6066301, 13.7743263), "11101000000", WISSEN),
    ("Diakonissenkrankenhaus Schladming", "DKH Schladming", "Schladming", (47.3919391, 13.6765402), "11101000001", WISSEN),
    ("LKH Murtal, Standort Judenburg", "LKH Judenburg", "Judenburg", (47.1660657, 14.6555735), "10001000001", WISSEN),
    ("LKH Murtal, Standort Knittelfeld", "LKH Knittelfeld", "Knittelfeld", (47.2154988, 14.8204532), "11101000000", WISSEN),
    ("LKH Murtal, Standort Stolzalpe", "LKH Stolzalpe", "Stolzalpe", (47.1196961, 14.1903683), "01101000000", WISSEN + "; Orthopädie"),
    ("LKH Weiz", "LKH Weiz", "Weiz", (47.2125627, 15.6367611), "10001000000", WISSEN),
    ("LKH Oststeiermark, Standort Feldbach", "LKH Feldbach", "Feldbach", (46.9507177, 15.8815829), "11111100111", WISSEN),
    ("LKH Oststeiermark, Standort Fürstenfeld", "LKH Fürstenfeld", "Fürstenfeld", (47.0467847, 16.0854347), "10001000000", WISSEN),
    ("LKH Oststeiermark, Standort Hartberg", "LKH Hartberg", "Hartberg", (47.2729241, 15.9663019), "11101000001", WISSEN),
    ("LKH Südweststeiermark, Standort Deutschlandsberg", "LKH Deutschlandsberg", "Deutschlandsberg", (46.8121190, 15.2307337), "11101000001", WISSEN),
    ("LKH Südweststeiermark, Standort Wagna", "LKH Wagna", "Wagna", (46.7698991, 15.5584696), "11101000011", WISSEN),
    ("LKH Südweststeiermark, Standort Bad Radkersburg", "LKH Bad Radkersburg", "Bad Radkersburg", (46.6922027, 15.9921110), "00001000000", WISSEN + "; Innere Medizin, Remobilisation"),
    ("Marienkrankenhaus Vorau", "KH Vorau", "Vorau", (47.4049073, 15.8818195), "10001000000", WISSEN),
    ("Klinik Güssing", "Güssing", "Güssing", (47.0499838, 16.3220562), "11101000000", WISSEN),
    ("Klinik Oberpullendorf", "Oberpullendorf", "Oberpullendorf", (47.5069529, 16.5095453), "11101000000", WISSEN),
    ("Krankenhaus der Barmherzigen Brüder Frauenkirchen", "BB Frauenkirchen", "Frauenkirchen", (47.8384514, 16.9224556), "10001000000", WISSEN),
    ("Krankenhaus der Barmherzigen Schwestern Wien", "BS Wien", "Wien", (48.1923503, 16.3454714), "10001000000", WISSEN),
    ("Herz-Jesu-Krankenhaus", "Herz-Jesu", "Wien", (48.1955792, 16.3984155), "00100000000", WISSEN + "; Orthopädie, Rheumatologie"),
    ("St. Josef Krankenhaus", "St. Josef Wien", "Wien", (48.1940856, 16.2628288), "00001001001", WISSEN + "; Geburtshilfe"),
    ("Franziskus Spital Landstraße", "Franziskus Landstraße", "Wien", (48.2050873, 16.3860573), "10001000000", WISSEN),
    ("Franziskus Spital Margareten", "Franziskus Margareten", "Wien", (48.1883316, 16.3622570), "00001000000", WISSEN + "; Akutgeriatrie, Palliativ"),
]


# Stationen und Ambulanzen je Krankenhaus (für Krankentransporte).
# Quellen: NÖ Landtag Gegenstand 18-313 (Herzkatheter-Standorte St. Pölten, Wiener Neustadt, Krems,
# Waidhofen/Ybbs, Mödling), Bericht „onkologische Zentren“ (Strahlentherapie in St. Pölten, Krems,
# Wiener Neustadt), sonst Allgemeinwissen – in LeitWerk unter Daten → Krankenhäuser änderbar.
_GROSS = "INT KAR GAS PUL NEP ONK CHI ORT NEU URO GYN KIN HNO AUG DER PSY GER PAL ITS ZNA UNF DIA CHE RAD END PHY WUN SCH"
BEREICHE = {
    "Universitätsklinikum St. Pölten": _GROSS + " NCH STR NUK HKL",
    "Universitätsklinikum Krems": "INT KAR GAS PUL NEP ONK CHI ORT NEU URO GYN KIN HNO PAL GER ITS ZNA UNF DIA STR CHE RAD NUK HKL END PHY WUN SCH",
    "Universitätsklinikum Tulln": "INT GAS CHI ORT NEU URO GYN KIN PSY GER ITS ZNA UNF DIA RAD END PHY WUN",
    "Universitätsklinikum Wiener Neustadt": _GROSS + " NCH STR NUK HKL",
    "Landesklinikum Mistelbach-Gänserndorf": "INT KAR GAS ONK CHI ORT NEU URO GYN KIN HNO PSY GER PAL ITS ZNA UNF DIA CHE RAD END PHY WUN",
    "Landesklinikum Amstetten": "INT GAS CHI ORT NEU GYN KIN PSY GER ITS ZNA UNF DIA RAD END PHY",
    "Landesklinikum Horn": "INT ONK CHI ORT NEU GYN GER PAL ITS ZNA UNF DIA CHE RAD END PHY",
    "Landesklinikum Baden": "INT CHI ORT URO HNO GER ITS ZNA UNF DIA RAD END PHY",
    "Landesklinikum Mödling": "INT KAR GAS ORT NEU GYN KIN ITS ZNA UNF DIA RAD HKL END PHY",
    "Universitätsklinikum Neunkirchen": "INT CHI ORT GYN PSY GER PAL ITS ZNA UNF DIA RAD END PHY",
    "Landesklinikum Korneuburg": "INT CHI ORT URO HNO GYN GER ITS ZNA UNF RAD END PHY",
    "Landesklinikum Stockerau": "INT GER PAL ZNA RAD END",
    "Landesklinikum Hollabrunn": "INT CHI GYN PSY GER ITS ZNA DIA RAD END PHY",
    "Landesklinikum Hainburg": "INT CHI ORT GYN GER ITS ZNA UNF DIA RAD END PHY",
    "Landesklinikum Klosterneuburg": "INT CHI GYN GER ZNA RAD END PHY",
    "Landesklinikum Lilienfeld": "INT CHI ORT GER PAL ITS ZNA UNF RAD END PHY",
    "Landesklinikum Melk": "INT CHI NEU GYN GER ITS ZNA DIA RAD END PHY",
    "Landesklinikum Scheibbs": "INT CHI ORT GYN GER ITS ZNA UNF RAD END PHY",
    "Landesklinikum Waidhofen/Ybbs": "INT KAR CHI ORT URO HNO GYN ITS ZNA UNF DIA RAD HKL END PHY",
    "Landesklinikum Zwettl": "INT CHI ORT GYN KIN GER ITS ZNA UNF DIA RAD END PHY",
    "Landesklinikum Gmünd": "INT CHI ORT GER ZNA UNF DIA RAD END",
    "Landesklinikum Waidhofen/Thaya": "INT CHI URO GER ITS ZNA RAD END",
    "AKH Wien": _GROSS + " NCH STR NUK HKL",
    "Klinik Floridsdorf": _GROSS + " NUK HKL",
    "Klinik Donaustadt": _GROSS + " NCH STR NUK HKL",
    "Klinik Ottakring": _GROSS + " STR NUK HKL",
    "Klinik Favoriten": _GROSS + " HKL",
    "Klinik Hietzing": "INT KAR ONK CHI ORT NEU GYN PSY GER PAL ITS ZNA UNF DIA CHE RAD NUK END PHY",
    "Klinik Landstraße": "INT KAR GAS ONK CHI URO HNO AUG ITS ZNA DIA CHE RAD END",
    "AUVA-Traumazentrum Wien, Standort Meidling": "ORT ITS UNF RAD PHY",
    "AUVA-Traumazentrum Wien, Standort Brigittenau": "ORT ITS UNF RAD PHY",
    "Krankenhaus der Barmherzigen Brüder Wien": "INT CHI URO HNO AUG DER ITS ZNA RAD END",
    "St. Anna Kinderspital": "KIN ONK CHE RAD",
    "Krankenhaus der Barmherzigen Brüder Eisenstadt": "INT KAR CHI ORT URO GYN KIN ITS ZNA UNF DIA RAD HKL END PHY",
    "Klinik Oberwart": "INT KAR CHI ORT NEU URO GYN KIN PSY ITS ZNA UNF DIA RAD END PHY",
    "Klinik Kittsee": "INT GER ZNA RAD END",
    "Kepler Universitätsklinikum Linz, Med Campus III": _GROSS + " NCH NUK HKL",
    "AUVA-Unfallkrankenhaus Linz": "ORT ITS UNF RAD PHY VER",
    "Landesklinikum Mauer": "PSY GER INT",
    "Landesklinikum Allentsteig": "PSY GER",
    "Universitätsklinikum Hochegg": "PUL INT GER",
    "Hanusch-Krankenhaus": "INT KAR GAS ONK CHI ORT NEU URO HNO GYN DER GER ITS ZNA UNF DIA CHE RAD END PHY WUN",
    "Klinik Penzing": "PUL PSY INT GER",
    "Orthopädisches Spital Speising": "ORT PHY RAD",
    "Krankenhaus Göttlicher Heiland": "INT CHI GER PAL ZNA RAD END",
    "Kepler Universitätsklinikum Linz, Neuromed Campus": "NEU NCH PSY ITS ZNA RAD THR",
    "Kepler Universitätsklinikum Linz, Med Campus IV": "KIN GYN ZNA RAD",
    "Ordensklinikum Linz Barmherzige Schwestern": "INT KAR GAS ONK CHI URO HNO ITS ZNA DIA STR CHE RAD NUK HKL END",
    "Ordensklinikum Linz Elisabethinen": "INT NEP GAS ONK CHI ITS ZNA DIA STR CHE RAD NUK END",
    "Pyhrn-Eisenwurzen Klinikum Steyr": "INT KAR GAS ONK CHI ORT NEU URO GYN KIN HNO PSY GER ITS ZNA UNF DIA CHE RAD HKL END PHY",
    "Klinikum Freistadt": "INT CHI ORT GYN GER ITS ZNA UNF RAD END PHY",
    "Krankenhaus der Barmherzigen Brüder Linz": "INT KAR GAS ONK CHI NEU URO HNO AUG ITS ZNA DIA STR CHE RAD NUK END",
    "Klinikum Wels-Grieskirchen, Standort Wels": _GROSS + " STR NUK HKL",
    "Klinikum Wels-Grieskirchen, Standort Grieskirchen": "INT CHI ORT URO GYN GER ITS ZNA RAD END PHY",
    "Pyhrn-Eisenwurzen Klinikum Kirchdorf": "INT CHI ORT GYN GER ITS ZNA UNF DIA RAD END PHY",
    "Salzkammergut Klinikum Vöcklabruck": _GROSS + " HKL",
    "Salzkammergut Klinikum Gmunden": "INT CHI ORT GYN PSY GER ITS ZNA UNF DIA RAD END PHY",
    "Salzkammergut Klinikum Bad Ischl": "INT CHI ORT GYN GER ITS ZNA UNF RAD END PHY",
    "Krankenhaus St. Josef Braunau": "INT KAR GAS ONK CHI ORT NEU URO GYN KIN HNO GER ITS ZNA UNF DIA CHE RAD END PHY",
    "Klinikum Schärding": "INT CHI ORT GYN GER ITS ZNA UNF DIA RAD END PHY",
    "Krankenhaus der Barmherzigen Schwestern Ried": _GROSS + " HKL",
    "Klinikum Rohrbach": "INT CHI ORT GYN GER ITS ZNA UNF DIA RAD END PHY",
    "LKH-Universitätsklinikum Graz": _GROSS + " NCH STR NUK HKL",
    "LKH Graz II, Standort West": "INT KAR GAS CHI ORT NEU GER PAL ITS ZNA UNF DIA RAD END PHY",
    "LKH Graz II, Standort Süd": "PSY NEU GER",
    "LKH Graz II, Standort Hörgas-Enzenbach": "PUL INT",
    "LKH Graz II, Standort Voitsberg": "INT CHI GER ZNA RAD END",
    "Krankenhaus der Elisabethinen Graz": "INT GAS ONK CHI PAL ZNA RAD END CHE",
    "Krankenhaus der Barmherzigen Brüder Graz": "INT KAR CHI NEU URO HNO PSY ITS ZNA DIA RAD END",
    "AUVA-Unfallkrankenhaus Steiermark, Standort Graz": "ORT ITS UNF RAD PHY",
    "AUVA-Unfallkrankenhaus Steiermark, Standort Kalwang": "ORT UNF RAD PHY",
    "LKH Hochsteiermark, Standort Leoben": _GROSS + " STR NUK HKL",
    "LKH Hochsteiermark, Standort Bruck an der Mur": "INT KAR CHI ORT URO GER ITS ZNA UNF DIA RAD HKL END PHY",
    "LKH Hochsteiermark, Standort Mürzzuschlag": "INT GER ZNA RAD END",
    "LKH Rottenmann-Bad Aussee, Standort Rottenmann": "INT CHI ORT GYN GER ITS ZNA UNF DIA RAD END PHY",
    "LKH Rottenmann-Bad Aussee, Standort Bad Aussee": "INT CHI ORT ZNA UNF RAD END",
    "Diakonissenkrankenhaus Schladming": "INT CHI ORT GYN ITS ZNA UNF RAD END PHY",
    "LKH Murtal, Standort Judenburg": "INT KAR CHI GYN GER ITS ZNA DIA RAD END",
    "LKH Murtal, Standort Knittelfeld": "INT CHI ORT GER ZNA UNF RAD END PHY",
    "LKH Murtal, Standort Stolzalpe": "ORT UNF RAD PHY",
    "LKH Weiz": "INT GER ZNA RAD END PHY",
    "LKH Oststeiermark, Standort Feldbach": "INT KAR GAS CHI ORT NEU URO GYN KIN GER ITS ZNA UNF DIA RAD END PHY",
    "LKH Oststeiermark, Standort Fürstenfeld": "INT GER ZNA RAD END",
    "LKH Oststeiermark, Standort Hartberg": "INT CHI ORT GYN GER ITS ZNA UNF RAD END PHY",
    "LKH Südweststeiermark, Standort Deutschlandsberg": "INT CHI ORT GYN GER ITS ZNA UNF DIA RAD END PHY",
    "LKH Südweststeiermark, Standort Wagna": "INT CHI ORT URO HNO GYN GER ITS ZNA UNF DIA RAD END PHY",
    "LKH Südweststeiermark, Standort Bad Radkersburg": "INT GER",
    "Marienkrankenhaus Vorau": "INT CHI GER ZNA RAD END",
    "Klinik Güssing": "INT CHI ORT GER ITS ZNA UNF RAD END PHY",
    "Klinik Oberpullendorf": "INT CHI ORT GER ITS ZNA UNF DIA RAD END PHY",
    "Krankenhaus der Barmherzigen Brüder Frauenkirchen": "INT GER PAL ZNA RAD END",
    "Krankenhaus der Barmherzigen Schwestern Wien": "INT GAS ONK CHI URO ITS ZNA CHE RAD END",
    "Herz-Jesu-Krankenhaus": "ORT RAD PHY",
    "St. Josef Krankenhaus": "INT CHI GYN KIN ZNA RAD END",
    "Franziskus Spital Landstraße": "INT CHI GER ZNA RAD END",
    "Franziskus Spital Margareten": "INT GER PAL",
}

# Spezialbereiche für Überstellungen (Allgemeinwissen, bitte prüfen): Thrombektomie (THR), Herzchirurgie (HCH),
# Verbrennung (VER); Neonatologie (NEO) und Kinderintensiv (PIC) kommen aus den Abteilungen.
SPEZIAL = {
    "LKH-Universitätsklinikum Graz": "THR HCH VER",
    "Klinikum Wels-Grieskirchen, Standort Wels": "THR",
    "Universitätsklinikum St. Pölten": "THR HCH",
    "Universitätsklinikum Wiener Neustadt": "THR",
    "AKH Wien": "THR HCH VER",
    "Klinik Donaustadt": "THR",
    "Klinik Landstraße": "THR",
    "Klinik Hietzing": "HCH",
    "Klinik Floridsdorf": "HCH",
    "Kepler Universitätsklinikum Linz, Med Campus III": "HCH",
}


TAG = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def zeit_text(fenster: list[dict]) -> str:
    """[{tage, von, bis}] → „Mo–Fr 07:00–15:00; Sa 08:00–12:00“ (wie im Spiel)"""
    teile = []
    for f in fenster:
        tage = sorted(set(f["tage"]))
        if tage == list(range(1, 8)):
            t = "täglich"
        else:
            gruppen, i = [], 0
            while i < len(tage):
                j = i
                while j + 1 < len(tage) and tage[j + 1] == tage[j] + 1:
                    j += 1
                gruppen.append(f"{TAG[tage[i]]}–{TAG[tage[j]]}" if j > i else TAG[tage[i]])
                i = j + 1
            t = ", ".join(gruppen)
        teile.append(f"{t} {f['von']}–{f['bis']}")
    return "; ".join(teile)


def ist_rund_um_die_uhr(fenster: list[dict]) -> bool:
    return any(sorted(set(f["tage"])) == list(range(1, 8)) and f["von"] == "00:00" and f["bis"] in ("24:00", "00:00") for f in fenster)


AKUTBETTEN_AUSSER = ("08 Psychiatrie", "02/3", "62 ", "63 ", "64 ", "Remobilisation", "Rehabilitation", "Akutgeriatrie", "Psychosomatik")


def _lade(name: str) -> dict:
    f = SRC / name
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


OESG = _lade("kh_oesg.json")
ZAHLEN = _lade("kh_zahlen.json")
SCHOCK = _lade("kh_schockraum.json")
# Übersicht „Akutversorgung“ Notruf NÖ (Angabe Paul): SRT/SRI je Haus, Zahl = Anzahl Zeichen
AKUTV = _lade("kh_akutversorgung_noe.json")
# Thrombektomie (neurologisches Spezialzentrum / Schlaganfall-Interventionszentrum) laut RSG bzw. Website
THROMBEKTOMIE = {"kh001", "kh003", "kh004", "kh023", "kh029", "kh032", "kh046", "kh063"}


def plaetze_ableiten(kid: str, einr: set[str], kav: dict, z: dict) -> dict[str, int]:
    """Plätze je Akut-Bereich. Reihenfolge: Angabe Paul → belegte Zahl (Website, Jahresbericht) → amtliche Planung
    (ÖSG-Großgeräteplan, RSG) → Mindestvorgabe (Weißbuch Schwerverletztenversorgung) → nur zuletzt aus der Größe geschätzt."""
    pl = {k: int(v) for k, v in (z.get("plaetze") or {}).items() if isinstance(v, (int, float)) and v > 0}
    gr = z.get("groesse") or {}
    oe = OESG.get(kid) or {}
    za = ZAHLEN.get(kid) or {}
    sr = SCHOCK.get(kid) or {}
    rsg = oe.get("rsg") or ""
    abt = kav.get("abt", {})
    akut = sum(b for a, b in abt.items() if not any(x in a for x in AKUTBETTEN_AUSSER)) or int(gr.get("betten") or 0)
    out: dict[str, int] = {}

    def klemm(x: float, lo: int, hi: int) -> int:
        return max(lo, min(hi, round(x)))

    def zahl(*werte):
        for w in werte:
            if isinstance(w, (int, float)) and w > 0:
                return w
        return None

    if "amb_notaufnahme" in einr:
        bp = re.search(r"\((\d+) ambBP\)", rsg)
        jahr = zahl(za.get("notaufnahme_jahr"), gr.get("notaufnahme_jahr"))
        if pl.get("notaufnahme"):
            n = pl["notaufnahme"] + pl.get("notaufnahme_betten", 0) // 2
        elif zahl(za.get("notaufnahme_plaetze")):
            n = za["notaufnahme_plaetze"]
        elif jahr:
            # Patienten pro Jahr → gleichzeitig behandelte (Aufenthalt im Schnitt ca. 3 h)
            n = jahr / 2200
        elif bp and int(bp.group(1)) > 0:
            n = int(bp.group(1))
        else:
            n = akut / 32
        out["notaufnahme"] = klemm(n, 2, 30)
    if "amb_unfall" in einr:
        ortho = sum(b for a, b in abt.items() if a.startswith("15"))
        uj = zahl(za.get("unfall_jahr"))
        out["unfall"] = klemm(uj / 4000 if uj else ortho / 7 if ortho else akut / 60, 2, 25)
    if "amb_kindernotaufnahme" in einr:
        kinder = sum(b for a, b in abt.items() if a.startswith("02/1") or a.startswith("02/2"))
        out["kindernotaufnahme"] = klemm(kinder / 6 if kinder else 3, 2, 12)
    if "fb_schockraum" in einr:
        tr = re.search(r"TR ([ZSL])", rsg)
        stufe = sr.get("traumanetzwerk") or ({"Z": "ÜTZ", "S": "RTZ", "L": "LTZ"}[tr.group(1)] if tr else None)
        av = AKUTV.get(kid) or {}
        if kid == "kh002":
            out["schockraum"] = 1  # Angabe Paul: ein Schockraum (in der Übersicht unter SRT und SRI)
        elif av.get("srt") or av.get("sri"):
            t_, i_ = int(av.get("srt") or 0), int(av.get("sri") or 0)
            if t_ == 1 and i_ == 1:
                out["schockraum"] = 1  # ein Raum für beides (wie Krems)
            else:
                if t_:
                    out["schockraum_trauma"] = t_
                if i_:
                    out["schockraum_intern"] = i_
        elif zahl(sr.get("schockraum_trauma"), sr.get("schockraum_intern"), sr.get("schockraum")) or pl.get("schockraum"):
            t, i, k = sr.get("schockraum_trauma"), sr.get("schockraum_intern"), zahl(sr.get("schockraum"), pl.get("schockraum"))
            if t and i and k and k <= max(t, i):
                out["schockraum"] = k  # dieselben Räume für beides
            else:
                if t:
                    out["schockraum_trauma"] = int(t)
                if i:
                    out["schockraum_intern"] = int(i)
                if k and not (t or i):
                    out["schockraum"] = int(k)
        elif stufe == "ÜTZ":
            out["schockraum"] = 2  # Weißbuch: mindestens zwei Schwerverletzte gleichzeitig
        else:
            out["schockraum"] = 1  # Schockraum belegt; Weißbuch LTZ/RTZ: einer
    if "fb_herzkatheter" in einr:
        out["herzkatheter"] = int(zahl(pl.get("herzkatheter"), oe.get("cor")) or 1)
    if "z_cardiac_arrest_center" in einr:
        out["ecmo"] = int(pl.get("ecmo") or 1)
    if "its_stroke_unit" in einr:
        betten = zahl(pl.get("stroke_unit"), oe.get("stroke_unit_betten"))
        out["stroke_unit"] = klemm((betten or 4) / 4, 1, 3)
    if "fb_kreisssaal" in einr or "st_geburtshilfe" in einr:
        ks = zahl(pl.get("kreisssaal"), za.get("kreisssaal"))
        gb = zahl(za.get("geburten_jahr"), gr.get("geburten_jahr"))
        if ks:
            out["kreisssaal"] = int(ks)
        elif gb:
            out["kreisssaal"] = klemm(gb / 450, 1, 7)
        else:
            gyn = sum(b for a, b in abt.items() if a.startswith("06"))
            out["kreisssaal"] = klemm(gyn / 12 if gyn else 2, 1, 6)
    if "fb_druckkammer" in einr:
        out["druckkammer"] = min(pl.get("druckkammer") or 1, 6)
    return out


def build_hospitals() -> list[dict]:
    """Krankenhäuser mit ihren Einrichtungen (Stationen, Intensiv, Ambulanzen …).
    Die Einrichtungen stammen aus der Recherche auf den offiziellen Websites (tools/sources/kh_einrichtungen.json,
    Stand Oktober 2026); neue Häuser (Schlüssel neuNN) stehen dort mit Koordinaten."""
    osm = read_csv(SRC / "osm_krankenhaeuser_luftrettung.csv")
    by_name: dict[str, dict] = {}
    by_key: dict[tuple[str, str], dict] = {}
    for r in osm:
        by_name.setdefault(r["name"], r)
        by_key[(r["@type"], r["@id"])] = r
    einr = json.loads((SRC / "kh_einrichtungen.json").read_text(encoding="utf-8"))

    def hinweis(d: dict) -> str:
        teile = ["Einrichtungen laut Website (Stand 10/2026)"]
        if d.get("website"):
            teile.append(d["website"])
        if d.get("unklar"):
            teile.append("nicht belegt: " + ", ".join(d["unklar"]))
        if d.get("notiz"):
            teile.append(d["notiz"])
        return " – ".join(teile)

    klinik = json.loads((ROOT / "src" / "data" / "klinik.json").read_text(encoding="utf-8"))
    zeiten_alle = json.loads((SRC / "kh_zeiten.json").read_text(encoding="utf-8")) if (SRC / "kh_zeiten.json").exists() else {}
    kav_alle = json.loads((SRC / "kh_kav_betten.json").read_text(encoding="utf-8")) if (SRC / "kh_kav_betten.json").exists() else {}
    MIT_ZEITEN = ["amb_notaufnahme", "amb_pvz", "amb_unfall", "amb_kindernotaufnahme", "amb_psychiatrie_krise", "fb_herzkatheter", "fb_schockraum", "fb_kreisssaal", "fb_druckkammer", "its_stroke_unit", "fb_angiographie"]

    def extra(kid: str, d: dict) -> dict:
        """Öffnungszeiten (nur belegte, nicht rund um die Uhr), Plätze, Aufnahmerad"""
        z = zeiten_alle.get(kid, {})
        einr = set(d["einrichtungen"])
        zt = []
        for e in MIT_ZEITEN:
            f = (z.get("zeiten") or {}).get(e)
            if e in einr and f and not ist_rund_um_die_uhr(f):
                zt.append(f"{e}: {zeit_text(f)}")
        pl = plaetze_ableiten(kid, einr, kav_alle.get(kid, {}), z)
        return {"zeiten": " | ".join(zt), "plaetze": ", ".join(f"{k}={v}" for k, v in pl.items()), "aufnahmerad": z.get("_rad", "")}

    NOTFALL = {"amb_notaufnahme", "amb_pvz", "amb_unfall", "amb_kindernotaufnahme", "amb_psychiatrie_krise", "fb_schockraum", "its_stroke_unit", "fb_kreisssaal"}

    def akut_aus(d: dict, kid: str = "") -> tuple[str, str]:
        """Häuser ohne jede Notfall-Anlaufstelle (und Privatkliniken) nehmen keine Rettung auf: alle Akut-Abteilungen aus.
        Dazu einzeln belegte Ausnahmen (z. B. keine Thrombektomie trotz Angiographie)."""
        haben = set(d["einrichtungen"])
        ak = [a["id"] for a in klinik["ebene2_akut_abteilungen"] if any(all(x in haben for x in alt) for alt in a["voraussetzung"])]
        extra_aus = list(zeiten_alle.get(kid, {}).get("_akut_aus", []))
        if kid not in THROMBEKTOMIE:
            extra_aus.append("ak_thrombektomie")
        if "*" in extra_aus:
            return ", ".join(ak), "nimmt derzeit keine Rettung auf"
        if not d.get("privat") and (haben | set(d.get("unklar", []))) & NOTFALL:
            return ", ".join(x for x in ak if x in extra_aus), ""
        grund = "Privatklinik – nimmt keine Rettung auf" if d.get("privat") else "keine Notaufnahme belegt – nimmt keine Rettung auf"
        return ", ".join(ak), grund

    out = []
    for i, (name, kurz, ort, loc, _flags, _hinweis) in enumerate(HOSPITALS, start=1):
        if isinstance(loc, tuple) and isinstance(loc[0], float):
            lat, lon = loc
        else:
            r = by_key[loc] if isinstance(loc, tuple) else by_name[loc]
            lat, lon = float(r["@lat"]), float(r["@lon"])
        kid = f"kh{i:03d}"
        d = einr[kid]
        aus, grund = akut_aus(d, kid)
        out.append({"id": kid, "name": name, "kurzname": kurz, "ort": ort,
                    "breitengrad": f"{lat:.6f}", "laengengrad": f"{lon:.6f}",
                    "einrichtungen": ", ".join(d["einrichtungen"]), "akut_aus": aus, **extra(kid, d),
                    "hinweis": (f"{grund} – " if grund else "") + hinweis(d)})
    # neu recherchierte Häuser (auch Privatkliniken außerhalb Wiens)
    n = len(out)
    for k in sorted(x for x in einr if x.startswith("neu")):
        d = einr[k]
        if d.get("lat") is None:
            continue
        n += 1
        out.append({"id": f"kh{n:03d}", "name": d["name"], "kurzname": d.get("kurzname") or d["name"], "ort": d.get("ort", ""),
                    "breitengrad": f"{float(d['lat']):.6f}", "laengengrad": f"{float(d['lon']):.6f}",
                    "einrichtungen": ", ".join(d["einrichtungen"]), "akut_aus": akut_aus(d, f"kh{n:03d}")[0], **extra(f"kh{n:03d}", d),
                    "hinweis": (f"{akut_aus(d, f'kh{n:03d}')[1]} – " if akut_aus(d, f"kh{n:03d}")[1] else "") + hinweis(d)})
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
         "breitengrad": "48.210000", "laengengrad": "15.620000",
         "einrichtungen": "st_innere_medizin, st_allgemeinchirurgie, st_gynaekologie, st_geburtshilfe, amb_notaufnahme, its_interdisziplinaer, fb_roentgen, fb_ct, fb_kreisssaal, fb_dialyse",
         "akut_aus": "", "hinweis": "Einrichtungen als IDs oder Namen mit Komma (Liste im Spiel: Krankenhaus bearbeiten); akut_aus = Akut-Abteilungen, die trotzdem nicht aufnehmen"},
    ])
    write_csv(EX / "beispiel_pois.csv", POI_COLS, [
        {"id": "poi-1", "name": "Badesee Musterstadt", "typ": "Bad / Badeplatz", "ort": "Musterstadt", "breitengrad": "48.215000", "laengengrad": "15.630000",
         "hinweis": "Typ = Kategorie(n), mehrere mit Komma: Kindergarten, Schule, Pflegeheim, Bahnhof, Einkauf, Sport, Bad, Lokal, Arztpraxis, Betrieb, Freizeit, Landeplatz, Feuerwehr, Polizei, Wasserrettung, Bergrettung – sonst eigener Text"},
        {"id": "poi-2", "name": "Pflegeheim Musterstadt", "typ": "Pflegeheim", "ort": "Musterstadt", "breitengrad": "48.230000", "laengengrad": "15.640000"},
        {"id": "poi-3", "name": "Volksschule Musterstadt", "typ": "Schule, Sport", "ort": "Musterstadt", "breitengrad": "48.222000", "laengengrad": "15.628000"},
    ])
    write_csv(EX / "beispiel_einsatzvorlagen.csv", TEMPLATE_COLS, [
        {"id": "ev-1", "code": "02-S4-03", "adresse": "Obere Landstraße 10, 3500 Krems an der Donau", "breitengrad": "48.410900",
         "laengengrad": "15.601200", "meldung": "Mann, ca. 60, starke Schmerzen in der Brust, schwitzt stark", "patient_alter": "60",
         "transport": "ja", "hinweis": "Beispielzeile – Koordinaten = tatsächlicher Einsatzort"},
        {"id": "ev-2", "code": "18-S2-02", "adresse": "Hauptplatz 1, 3550 Langenlois", "breitengrad": "48.473800",
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
