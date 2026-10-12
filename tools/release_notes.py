"""Gibt die Änderungen einer Version aus CHANGELOG.md aus (für das Update-Fenster)."""
import re
import sys
from pathlib import Path

version = sys.argv[1]
text = Path(__file__).resolve().parent.parent.joinpath("CHANGELOG.md").read_text(encoding="utf-8")
m = re.search(rf"^## {re.escape(version)}\b.*?$(.*?)(?=^## |\Z)", text, re.S | re.M)
print(m.group(1).strip() if m else f"LeitWerk {version}")
