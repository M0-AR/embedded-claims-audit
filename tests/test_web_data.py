import json
from collections import Counter
from pathlib import Path

import pytest

from eca.paper import resolve

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "demo" / "data.js"

pytestmark = pytest.mark.skipif(
    not BUNDLE.exists(),
    reason="demo/data.js absent; run make web",
)


@pytest.fixture(scope="module")
def payload():
    text = BUNDLE.read_text()
    prefix = "window.ECA="
    assert text.startswith(prefix)
    return json.loads(text[len(prefix) :].rstrip(";\n"))


def test_counts_match_claims(payload):
    counts = Counter(claim["verdict"] for claim in payload["claims"])
    assert dict(counts) == payload["meta"]["counts"]
    assert sum(counts.values()) == payload["meta"]["claims"] == 22


def test_every_claim_path_resolves(payload):
    for claim in payload["claims"]:
        raw = resolve(payload["results"], claim["path"])
        if "scale" in claim:
            raw = float(raw) * float(claim["scale"])
        if isinstance(raw, float):
            assert claim["raw"] == pytest.approx(raw)
        else:
            assert claim["raw"] == raw


def test_verification_summary_matches_artifact(payload):
    summary = json.loads((ROOT / "results" / "verification.json").read_text())
    assert payload["meta"]["verified_fields"] == summary["fields_checked"]
    assert payload["meta"]["max_relative_difference"] == summary["max_relative_difference"]
    assert payload["verification"]["passed"] == summary["passed"]
