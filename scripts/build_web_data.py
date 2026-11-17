#!/usr/bin/env python3
"""Build the self-contained data bundle used by the interactive console."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import yaml

from eca.paper import build_claims
from eca.util import CLAIMS, RESULTS, jsonable, load_results

TARGET = Path(__file__).resolve().parents[1] / "demo" / "data.js"
REPO_URL = "https://github.com/M0-AR/embedded-claims-audit"
PAGES_URL = "https://m0-ar.github.io/embedded-claims-audit/"


def claim_records() -> list[dict]:
    raw = yaml.safe_load(CLAIMS.read_text())
    notes = {str(item["id"]): item.get("note", "") for item in raw["claims"]}
    records = build_claims(load_results())
    for record in records:
        record["note"] = notes.get(record["id"], "")
    return records


def verification_summary() -> dict:
    path = RESULTS / "verification.json"
    if not path.exists():
        return {
            "passed": None,
            "experiments_checked": 0,
            "fields_checked": 0,
            "max_relative_difference": None,
            "generated_utc": None,
        }
    return json.loads(path.read_text())


def build_payload() -> dict:
    results = load_results()
    claims = claim_records()
    counts = Counter(claim["verdict"] for claim in claims)
    verification = verification_summary()
    dataset = results["e10_paderborn"].get("dataset", {})
    return jsonable(
        {
            "meta": {
                "version": "1.0.0",
                "title": "Embedded Claims Audit",
                "subtitle": "Conventions, not constants",
                "generated_utc": results["environment"]["generated_utc"],
                "claims": len(claims),
                "experiments": 10,
                "counts": {key: counts.get(key, 0) for key in ("supported", "qualified", "refuted")},
                "verified_fields": verification.get("fields_checked", 0),
                "max_relative_difference": verification.get("max_relative_difference", 0.0),
                "verification_passed": verification.get("passed"),
                "repo_url": REPO_URL,
                "pages_url": PAGES_URL,
                "dataset": {
                    "name": dataset.get("name", "Paderborn LEA PMSM temperature dataset"),
                    "rows": dataset.get("rows", 0),
                    "profiles": dataset.get("profiles", 0),
                    "duration_h": dataset.get("duration_h", 0.0),
                    "license": dataset.get("license", "CC BY-SA 4.0"),
                    "sha256": dataset.get("sha256", ""),
                },
            },
            "claims": claims,
            "results": results,
            "verification": verification,
        }
    )


def main() -> int:
    payload = build_payload()
    text = "window.ECA=" + json.dumps(payload, separators=(",", ":"), allow_nan=False) + ";\n"
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(text)
    size = TARGET.stat().st_size
    print(f"wrote {TARGET} ({size / 1024:.0f} KiB, {payload['meta']['claims']} claims, {payload['meta']['experiments']} experiments)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
