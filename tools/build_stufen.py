#!/usr/bin/env python3
"""Erzeugt data/default/einsatzstufen.csv: was eine Einsatzstufe (Kategorie eines Einsatzcodes)
für die Simulation bedeutet – Rettungsmittel, Sondersignal, Dringlichkeit, Transportanteil.

Die Einsatzcodes selbst sind nicht Teil von LeitWerk; jeder importiert seine eigene Liste
(Reiter Daten → Einsatzcodes). Stufen, die hier fehlen, bekommen Standardwerte und können
in den Einstellungen angepasst werden.
"""
from __future__ import annotations

import csv
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "default"

# Stufe -> Rettungsmittel-Rangfolge („>“ = danach, „/“ = gleichwertig), NFS nötig (sonst NEF dazu),
# Notarzt (nein / nef = NEF bevorzugt, NAH nur wenn > Toleranz schneller / schnellster = NEF oder NAH),
# Sondersignal, Kategorie, Transportwahrscheinlichkeit %. Laut Vorgabe Paul (12.10.2026), in den Einstellungen änderbar.
STUFEN = [
    ("ALS rot", "RTW-C>RTW>KTW", "nein", "schnellster", "ja", "kritisch", 85),
    ("ALS orange", "RTW-C>RTW>KTW", "nein", "nef", "ja", "kritisch", 85),
    ("ALS gelb", "RTW-C>RTW>KTW", "ja", "nein", "ja", "dringend", 80),
    ("ALS grün", "RTW>RTW-C>KTW", "ja", "nein", "nein", "dringend", 75),
    ("BLS rot", "RTW>RTW-C>KTW", "nein", "nein", "ja", "dringend", 75),
    ("BLS gelb", "RTW>KTW>RTW-C", "nein", "nein", "ja", "dringend", 70),
    ("BLS grün", "KTW>RTW>RTW-C", "nein", "nein", "nein", "stabil", 65),
    ("BLS/ALS aufwertbar", "RTW/RTW-C", "nein", "nein", "ja", "dringend", 75),
    ("Akuttransport grün", "KTW>RTW>RTW-C", "nein", "nein", "nein", "stabil", 100),
    ("Telemedizin", "KTW>RTW>RTW-C", "nein", "nein", "nein", "stabil", 30),
    ("Weitergabe", "", "nein", "nein", "nein", "stabil", 0),
    ("Großunfall", "RTW-C>RTW>KTW", "nein", "schnellster", "ja", "kritisch", 90),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "einsatzstufen.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\r\n")
        w.writerow(["stufe", "rettungsmittel", "nfs_erforderlich", "notarzt", "sondersignal", "kategorie", "transport_prozent"])
        w.writerows(STUFEN)
    print(f"einsatzstufen.csv: {len(STUFEN)} Stufen")


if __name__ == "__main__":
    main()
