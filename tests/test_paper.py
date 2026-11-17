from collections import Counter

import pytest

from eca import paper
from eca.util import RESULTS, load_results

pytestmark = pytest.mark.skipif(
    not (RESULTS / "results.json").exists(),
    reason="results/results.json absent; run make experiments",
)


@pytest.fixture(scope="module")
def results():
    return load_results()


def test_claim_registry_resolves(results):
    claims = paper.build_claims(results)
    assert len(claims) == 22
    assert {claim["id"] for claim in claims} == {f"C{i:02d}" for i in range(1, 23)}
    for claim in claims:
        assert claim["raw"] is not None, claim["id"]
        assert claim["observed"] != "n/a", claim["id"]


def test_claim_verdict_distribution(results):
    claims = paper.build_claims(results)
    counts = Counter(claim["verdict"] for claim in claims)
    assert counts == {"supported": 10, "qualified": 5, "refuted": 7}


def test_claim_ids_are_unique(results):
    claims = paper.build_claims(results)
    assert len({claim["id"] for claim in claims}) == len(claims)
