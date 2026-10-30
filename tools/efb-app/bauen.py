"""Baut die LeitWerk-EFB-App (MSFS 2024) als ZIP mit zwei Varianten:

1. community/leitwerk-efb-pilot/   – fertiges Paket zum Kopieren in den Community-Ordner
   (manifest.json und layout.json von Hand erzeugt, wie es das Paket-Werkzeug des SDK für „Copy“-Inhalte tut)
2. projekt/                        – Developer-Mode-Projekt (Project Editor → Build All), falls Variante 1 nicht erscheint

Aufruf: python3 tools/efb-app/bauen.py <ziel.zip>
"""
import json
import os
import shutil
import sys
import tempfile
import time
import zipfile

HIER = os.path.dirname(os.path.abspath(__file__))
PAKET = "leitwerk-efb-pilot"
APP = "LeitWerkPilot"
VERSION = "0.1.0"


def filetime(sekunden: float) -> int:
    """Windows FILETIME (100 ns seit 1601) wie in layout.json"""
    return int((sekunden + 11644473600) * 10_000_000)


def community(ziel: str) -> None:
    root = os.path.join(ziel, PAKET)
    app = os.path.join(root, "html_ui", "efb_ui", "efb_apps", APP)
    shutil.copytree(os.path.join(HIER, "PackageSources", APP), app)
    ci = os.path.join(root, "ContentInfo", PAKET)
    os.makedirs(ci)
    shutil.copy(os.path.join(HIER, "PackageDefinitions", PAKET, "ContentInfo", "thumbnail.jpg"), ci)
    inhalt = []
    for d, _, dateien in os.walk(root):
        for f in sorted(dateien):
            p = os.path.join(d, f)
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            inhalt.append({"path": rel, "size": os.path.getsize(p), "date": filetime(time.time())})
    inhalt.sort(key=lambda x: x["path"])
    with open(os.path.join(root, "layout.json"), "w", encoding="utf-8") as fh:
        json.dump({"content": inhalt}, fh, indent=2)
    manifest = {
        "dependencies": [],
        "content_type": "MISC",
        "title": "LeitWerk Pilot (EFB-App)",
        "manufacturer": "",
        "creator": "LeitWerk",
        "package_version": VERSION,
        "minimum_game_version": "1.0.0",
        "release_notes": {"neutral": {"LastUpdate": "", "OlderHistory": ""}},
    }
    with open(os.path.join(root, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)


def projekt(ziel: str) -> None:
    os.makedirs(ziel)
    shutil.copy(os.path.join(HIER, "LeitWerkEfbProjekt.xml"), ziel)
    shutil.copytree(os.path.join(HIER, "PackageDefinitions"), os.path.join(ziel, "PackageDefinitions"))
    shutil.copytree(os.path.join(HIER, "PackageSources"), os.path.join(ziel, "PackageSources"))


def main() -> None:
    aus = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "LeitWerk-EFB-App.zip")
    with tempfile.TemporaryDirectory() as tmp:
        community(os.path.join(tmp, "community"))
        projekt(os.path.join(tmp, "projekt"))
        shutil.copy(os.path.join(HIER, "LIESMICH.txt"), tmp)
        with zipfile.ZipFile(aus, "w", zipfile.ZIP_DEFLATED) as z:
            for d, _, dateien in os.walk(tmp):
                for f in dateien:
                    p = os.path.join(d, f)
                    z.write(p, os.path.relpath(p, tmp))
    print(aus)


if __name__ == "__main__":
    main()
