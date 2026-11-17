"""Re-run every experiment and compare the fresh payload with the stored one.

The comparison is field by field. Numeric fields use a relative tolerance of
1e-6 (1e-5 for the real-data regression) and an absolute tolerance of 1e-9;
strings, booleans, and `None` must match exactly. E10 is skipped when the
Paderborn CSV is absent, because the dataset is not redistributed with the
repository.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import UTC, datetime
from typing import Any

from . import (
    e01_sixstep,
    e02_svpwm,
    e03_deadtime,
    e04_mt_speed,
    e05_kt_ke,
    e06_i2c,
    e07_rs485,
    e08_ipc,
    e09_hbridge,
    e10_paderborn,
)
from .util import RESULTS, jsonable, load_results

MODULES = {
    "e01_sixstep": e01_sixstep,
    "e02_svpwm": e02_svpwm,
    "e03_deadtime": e03_deadtime,
    "e04_mt_speed": e04_mt_speed,
    "e05_kt_ke": e05_kt_ke,
    "e06_i2c": e06_i2c,
    "e07_rs485": e07_rs485,
    "e08_ipc": e08_ipc,
    "e09_hbridge": e09_hbridge,
    "e10_paderborn": e10_paderborn,
}

SKIP_KEYS = {"environment", "data_file"}


class Stats:
    def __init__(self) -> None:
        self.fields = 0
        self.max_rel = 0.0
        self.max_path = ""


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def compare(
    stored: Any,
    fresh: Any,
    path: str,
    rtol: float,
    atol: float,
    stats: Stats,
    errors: list[str],
) -> None:
    if isinstance(stored, dict) and isinstance(fresh, dict):
        for key in sorted(set(stored) | set(fresh)):
            if key in SKIP_KEYS:
                continue
            child = f"{path}.{key}" if path else key
            if key not in stored:
                errors.append(f"{child}: present in fresh, missing from stored")
            elif key not in fresh:
                errors.append(f"{child}: present in stored, missing from fresh")
            else:
                compare(stored[key], fresh[key], child, rtol, atol, stats, errors)
        return

    if isinstance(stored, list) and isinstance(fresh, list):
        if len(stored) != len(fresh):
            errors.append(f"{path}: length {len(stored)} != {len(fresh)}")
            return
        for index, (a, b) in enumerate(zip(stored, fresh, strict=True)):
            compare(a, b, f"{path}[{index}]", rtol, atol, stats, errors)
        return

    if _is_number(stored) and _is_number(fresh):
        stats.fields += 1
        a = float(stored)
        b = float(fresh)
        if math.isnan(a) or math.isnan(b):
            if not (math.isnan(a) and math.isnan(b)):
                errors.append(f"{path}: stored={stored!r} fresh={fresh!r} (NaN)")
            return
        if not math.isclose(a, b, rel_tol=rtol, abs_tol=atol):
            errors.append(f"{path}: stored={stored!r} fresh={fresh!r}")
            return
        if abs(a - b) > atol:
            rel = abs(a - b) / max(abs(a), abs(b), 1e-300)
            if rel > stats.max_rel:
                stats.max_rel = rel
                stats.max_path = path
        return

    if stored != fresh:
        errors.append(f"{path}: stored={stored!r} fresh={fresh!r}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rtol", type=float, default=1e-6)
    parser.add_argument("--atol", type=float, default=1e-9)
    parser.add_argument("--e10-rtol", type=float, default=1e-5)
    args = parser.parse_args(argv)

    try:
        stored = load_results()
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    fresh: dict[str, Any] = {}
    for name, module in MODULES.items():
        print(f"run   {name}", flush=True)
        fresh[name] = jsonable(module.run())

    stats = Stats()
    failures: list[str] = []
    skipped: list[str] = []
    checked = 0

    for name, _module in MODULES.items():
        if name not in stored:
            failures.append(f"{name}: missing from results/results.json")
            continue
        old = stored[name]
        new = fresh[name]
        if name == "e10_paderborn" and (
            old.get("status") == "data_missing" or new.get("status") == "data_missing"
        ):
            skipped.append(name)
            print(f"skip  {name}: dataset absent (E10 is optional)")
            continue
        rtol = args.e10_rtol if name == "e10_paderborn" else args.rtol
        errors: list[str] = []
        compare(old, new, name, rtol, args.atol, stats, errors)
        checked += 1
        if errors:
            failures.extend(errors)
            print(f"FAIL  {name}: {len(errors)} mismatched field(s)")
            for error in errors[:20]:
                print(f"      {error}")
            if len(errors) > 20:
                print(f"      ... and {len(errors) - 20} more")
        else:
            print(f"ok    {name}")

    print(
        f"\nchecked {checked} experiment(s), {stats.fields} scalar field(s); "
        f"max relative difference {stats.max_rel:.3e}"
        + (f" at {stats.max_path}" if stats.max_path else "")
    )
    summary = {
        "generated_utc": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "passed": not failures,
        "experiments_checked": checked,
        "experiments_skipped": skipped,
        "fields_checked": stats.fields,
        "max_relative_difference": stats.max_rel,
        "max_relative_path": stats.max_path,
        "rtol": args.rtol,
        "atol": args.atol,
        "e10_rtol": args.e10_rtol,
        "failures": failures[:100],
    }
    (RESULTS / "verification.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    if failures:
        print(f"verification failed: {len(failures)} mismatch(es)", file=sys.stderr)
        return 1
    print("verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
