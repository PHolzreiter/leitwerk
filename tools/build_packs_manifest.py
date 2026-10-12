"""Schreibt packs.json: welche Dateien zu welchem Kartenpaket gehören, mit Größe und SHA-256.

Aufruf: python3 tools/build_packs_manifest.py <Ordner mit den Dateien> <Kartenstand>
Die Version eines Pakets ergibt sich aus den Prüfsummen seiner Dateien, sie ändert
sich also nur, wenn sich der Inhalt ändert (dann zeigt das Programm „Update verfügbar“).
"""
import hashlib
import json
import sys
from pathlib import Path

PACKS = [
    {
        "id": "grund",
        "name": "Grundpaket",
        "beschreibung": "Übersichtskarte, Niederösterreich und Wien in mittlerer Detailstufe, Straßennetz und Adressen",
        "pflicht": True,
        "files": ["overview.pmtiles", "basis.pmtiles", "roads.lwrg.gz", "addresses.tsv.gz"],
    },
    {
        "id": "noe",
        "name": "Detailkarte Niederösterreich und Wien",
        "beschreibung": "Alle Straßen und Hausnummern, Gebäude für die 3D-Ansicht",
        "files": ["core.pmtiles"],
    },
    {
        "id": "umland",
        "name": "Detailkarte Umland",
        "beschreibung": "Oberösterreich, Steiermark, Burgenland und Grenzgebiete in mittlerer Detailstufe",
        "files": ["ring.pmtiles"],
    },
    {
        "id": "gelaende",
        "name": "Gelände (3D)",
        "beschreibung": "Höhenmodell für Berge und Täler in der 3D-Ansicht",
        "files": ["terrain.pmtiles"],
    },
]


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    out, stand = Path(sys.argv[1]), sys.argv[2] if len(sys.argv) > 2 else ""
    packs = []
    for p in PACKS:
        files = []
        for name in p["files"]:
            path = out / name
            if not path.is_file():
                sys.exit(f"Datei fehlt: {path}")
            files.append({"name": name, "size": path.stat().st_size, "sha256": sha256(path)})
        version = hashlib.sha256("".join(f["sha256"] for f in files).encode()).hexdigest()[:12]
        packs.append({**p, "version": version, "files": files})
        print(f"{p['id']}: {sum(f['size'] for f in files) / 1e6:.0f} MB, Version {version}")
    (out / "packs.json").write_text(json.dumps({"stand": stand, "packs": packs}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
