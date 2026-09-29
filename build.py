"""Erzeugt dist/kalender-duplikate-<version>.xpi aus dem Ordner src/.
Creates dist/kalender-duplikate-<version>.xpi from the src/ folder.

Aufruf / usage:  python build.py
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
version = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))["version"]
out = ROOT / "dist" / f"kalender-duplikate-{version}.xpi"
out.parent.mkdir(exist_ok=True)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(SRC.rglob("*")):
        if f.is_file():
            z.write(f, f.relative_to(SRC).as_posix())
    z.write(ROOT / "LICENSE", "LICENSE")

print(f"OK: {out}")
