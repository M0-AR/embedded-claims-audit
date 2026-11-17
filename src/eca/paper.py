from __future__ import annotations

import json
import math
from collections import Counter

import yaml
from jinja2 import Environment, FileSystemLoader

from .plots import make_all
from .util import CLAIMS, ROOT, load_results


def fmt(value, digits: int = 3) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, int):
        return f"{value:,d}"
    if isinstance(value, float):
        if not math.isfinite(value):
            return "n/a"
        if value == 0:
            return "0"
        if abs(value) < 10 ** (-max(digits, 1)) or abs(value) >= 1e6:
            return f"{value:.{max(digits, 1)}e}"
        return f"{value:,.{digits}f}"
    return str(value)


def sci(value, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.{digits}e}"


def pct(value, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    return f"{float(value):.{digits}f}%"


def resolve(obj, path: list):
    current = obj
    for key in path:
        if isinstance(current, dict):
            current = current[key]
        elif isinstance(current, (list, tuple)):
            current = current[int(key)]
        else:
            raise KeyError(f"cannot descend into {type(current).__name__} at {key!r}")
    return current


def build_claims(results: dict) -> list[dict]:
    document = yaml.safe_load(CLAIMS.read_text())
    claims = []
    for item in document["claims"]:
        record = dict(item)
        raw = resolve(results, record["path"])
        if "scale" in record:
            raw = float(raw) * float(record["scale"])
        if "true_label" in record and isinstance(raw, (bool, int)) and raw in (0, 1, True, False):
            record["observed"] = record["true_label"] if raw else record["false_label"]
        else:
            record["observed"] = fmt(raw, int(record.get("digits", 3)))
        record["raw"] = raw
        claims.append(record)
    return claims


def main() -> int:
    results = load_results()
    claims = build_claims(results)
    counts = Counter(c["verdict"] for c in claims)
    figures = make_all(results)
    verification_path = ROOT / "results" / "verification.json"
    verification = json.loads(verification_path.read_text()) if verification_path.exists() else {}
    env = Environment(
        loader=FileSystemLoader(str(ROOT / "paper")),
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters.update({"fmt": fmt, "sci": sci, "pct": pct})
    template = env.get_template("paper.md.j2")
    text = template.render(
        r=results,
        claims=claims,
        counts=counts,
        n_claims=len(claims),
        figures=figures,
        verification=verification,
        generated=results["environment"]["generated_utc"],
    )
    target = ROOT / "README.md"
    target.write_text(text)
    words = len(text.split())
    print(f"wrote {target} ({words} words)")
    print(f"claims: {dict(counts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
