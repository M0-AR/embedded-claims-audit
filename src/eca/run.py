from __future__ import annotations

import sys
import time

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
from .util import environment, save_result, save_results

MODULES = [
    ("e01_sixstep", e01_sixstep),
    ("e02_svpwm", e02_svpwm),
    ("e03_deadtime", e03_deadtime),
    ("e04_mt_speed", e04_mt_speed),
    ("e05_kt_ke", e05_kt_ke),
    ("e06_i2c", e06_i2c),
    ("e07_rs485", e07_rs485),
    ("e08_ipc", e08_ipc),
    ("e09_hbridge", e09_hbridge),
    ("e10_paderborn", e10_paderborn),
]


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    skip_e10 = "--skip-e10" in args
    results: dict = {}
    failed = False
    for name, module in MODULES:
        if skip_e10 and name == "e10_paderborn":
            continue
        started = time.perf_counter()
        try:
            payload = module.run()
        except Exception as exc:
            failed = True
            print(f"{name:18s} FAILED  {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        save_result(name, payload)
        results[name] = payload
        status = payload.get("status", "ok") if isinstance(payload, dict) else "ok"
        elapsed = time.perf_counter() - started
        print(f"{name:18s} {elapsed:7.2f}s  {status}")
    save_results({"environment": environment(), **results})
    print("wrote results/results.json")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
