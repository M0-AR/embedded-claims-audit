#!/usr/bin/env python3
"""Download the Paderborn LEA PMSM temperature dataset used by E10.

The CSV is not redistributed with this repository. The Kaggle dataset is
`wkirgsn/electric-motor-temperature` (CC BY-SA 4.0); the file is about 300 MB
and unzips to 1,330,816 rows. Credentials are needed only for Kaggle.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TARGET = RAW / "measures_v2.csv"
EXPECTED_SHA256 = "78f3d150f0f2ad9c5dc7ff24dd12c00d386ad530f48c1589ad24fcd88867d3ad"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def existing() -> int | None:
    if not TARGET.exists():
        return None
    size = TARGET.stat().st_size
    print(f"found {TARGET} ({size / 1e6:.1f} MB)")
    print(f"sha256 {sha256(TARGET)}")
    print(f"expected {EXPECTED_SHA256}")
    if sha256(TARGET) != EXPECTED_SHA256:
        print("warning: checksum differs; E10 numbers may not reproduce", file=sys.stderr)
    return 0


def main() -> int:
    if TARGET.exists():
        return existing() or 0

    kaggle = shutil.which("kaggle")
    if kaggle is None:
        print("kaggle CLI not found.", file=sys.stderr)
        print("install it with: python -m pip install kaggle", file=sys.stderr)
        print(
            "or download the dataset manually:\n"
            f"  kaggle datasets download -d wkirgsn/electric-motor-temperature "
            f"-p {RAW} --unzip",
            file=sys.stderr,
        )
        return 1

    RAW.mkdir(parents=True, exist_ok=True)
    command = [
        kaggle,
        "datasets",
        "download",
        "-d",
        "wkirgsn/electric-motor-temperature",
        "-p",
        str(RAW),
        "--unzip",
    ]
    print("running:", " ".join(command))
    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        print("kaggle download failed; check ~/.kaggle/kaggle.json credentials", file=sys.stderr)
        return result.returncode
    if not TARGET.exists():
        print(f"download finished but {TARGET} is missing", file=sys.stderr)
        return 1
    return existing() or 0


if __name__ == "__main__":
    sys.exit(main())
