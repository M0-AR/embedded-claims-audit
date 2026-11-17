"""Shared numerics, result I/O, and formatting for the claim audits.

The module deliberately keeps every experiment's output JSON-serializable so the
paper can be regenerated from artefacts alone (ACM Artifacts Evaluated - Functional).
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "results"
FIGURES = RESULTS / "figures"
CLAIMS = ROOT / "claims" / "claims.yaml"
DATA_RAW = ROOT / "data" / "raw"


def jsonable(obj: Any) -> Any:
    """Recursively convert numpy/scipy scalars and arrays to plain Python."""
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return jsonable(obj.tolist())
    if isinstance(obj, (np.floating, float)):
        value = float(obj)
        if math.isnan(value):
            return None
        if math.isinf(value):
            return "inf" if value > 0 else "-inf"
        return value
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    return obj


def save_result(name: str, payload: dict[str, Any]) -> Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / f"{name}.json"
    path.write_text(json.dumps(jsonable(payload), indent=2, sort_keys=True) + "\n")
    return path


def save_results(payload: dict[str, Any]) -> Path:
    RESULTS.mkdir(parents=True, exist_ok=True)
    path = RESULTS / "results.json"
    path.write_text(json.dumps(jsonable(payload), indent=2, sort_keys=True) + "\n")
    return path


def load_results() -> dict[str, Any]:
    path = RESULTS / "results.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing: run `make experiments` first")
    return json.loads(path.read_text())


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ripple_metrics(power: np.ndarray) -> dict[str, float]:
    """Peak-to-peak ripple normalized to peak and to mean, in percent."""
    p = np.asarray(power, dtype=float)
    pmax, pmin, pmean = float(p.max()), float(p.min()), float(p.mean())
    pp = pmax - pmin
    return {
        "max": pmax,
        "min": pmin,
        "mean": pmean,
        "peak_to_peak": pp,
        "pct_of_peak": 100.0 * pp / pmax,
        "pct_of_mean": 100.0 * pp / pmean,
        "normalized_to_peak": pp / pmax,
        "normalized_to_mean": pp / pmean,
    }


def single_sided_spectrum(x: np.ndarray, fs: float) -> tuple[np.ndarray, np.ndarray]:
    """Amplitude spectrum of a uniformly sampled real signal.

    Returns (freqs, amplitudes) with amplitudes expressed as peak values of the
    corresponding sinusoid, i.e. 2*|X_k|/N for non-DC bins.
    """
    x = np.asarray(x, dtype=float)
    n = x.size
    window = np.ones(n)
    detrended = x - x.mean()
    spec = np.fft.rfft(detrended * window)
    amps = np.abs(spec) * 2.0 / n
    amps[0] *= 0.5
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    return freqs, amps


def amplitude_at(freqs: np.ndarray, amps: np.ndarray, f0: float) -> float:
    idx = int(np.argmin(np.abs(freqs - f0)))
    return float(amps[idx])


def db(x: float, ref: float = 1.0) -> float:
    return 20.0 * math.log10(max(abs(x), 1e-300) / ref)


def e12_ceil(value: float) -> float:
    """Smallest E12 series value >= value (ohms)."""
    series = np.array([1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2])
    decade = 10.0 ** math.floor(math.log10(value))
    for mult in series * decade:
        if mult >= value * (1.0 - 1e-12):
            return float(mult)
    return float(10.0 * decade)


def e12_between(lo: float, hi: float) -> list[float]:
    if lo > hi:
        return []
    out: list[float] = []
    decade = 10.0 ** math.floor(math.log10(max(lo, 1e-12)))
    for exp in range(-6, 7):
        base = 10.0**exp
        for mult in [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]:
            v = mult * base
            if lo * (1.0 - 1e-9) <= v <= hi * (1.0 + 1e-9):
                out.append(float(v))
    _ = decade
    return sorted(set(out))


def environment() -> dict[str, str]:
    return {
        "generated_utc": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "numpy": np.__version__,
    }
