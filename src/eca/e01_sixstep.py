"""E1: six-step (120-degree conduction) torque ripple is a model-dependent number.

The audit compares the same commutation pattern against three back-EMF / current
assumptions.  Closed forms used by the verdict:

    ripple/peak = 1 - sqrt(3)/2              = 13.3975 %
    ripple/mean = pi (sqrt(3)-3/2)/(3 sqrt(3)) = 14.0303 %

for sinusoidal EMF with ideal 120-degree current blocks.
"""

from __future__ import annotations

import numpy as np

from .util import ripple_metrics

N = 1 << 17
THETA = np.linspace(0.0, 2.0 * np.pi, N, endpoint=False)
PHASES = [0.0, 2.0 * np.pi / 3.0, 4.0 * np.pi / 3.0]


def block(theta: np.ndarray, shift: float = 0.0) -> np.ndarray:
    x = (theta - shift) % (2.0 * np.pi)
    pos = (x < 2.0 * np.pi / 3.0).astype(float)
    neg = ((x >= np.pi) & (x < np.pi + 2.0 * np.pi / 3.0)).astype(float)
    return pos - neg


def trapezoid(theta: np.ndarray, shift: float = 0.0) -> np.ndarray:
    x = (theta - shift) % (2.0 * np.pi)
    y = np.empty_like(x)
    m1 = x < 2.0 * np.pi / 3.0
    m2 = (x >= 2.0 * np.pi / 3.0) & (x < np.pi)
    m3 = (x >= np.pi) & (x < 5.0 * np.pi / 3.0)
    m4 = x >= 5.0 * np.pi / 3.0
    y[m1] = 1.0
    y[m2] = 1.0 - 2.0 * (x[m2] - 2.0 * np.pi / 3.0) / (np.pi / 3.0)
    y[m3] = -1.0
    y[m4] = -1.0 + 2.0 * (x[m4] - 5.0 * np.pi / 3.0) / (np.pi / 3.0)
    return y


def assemble(emf: list[np.ndarray], current: list[np.ndarray]) -> np.ndarray:
    return sum(e * i for e, i in zip(emf, current, strict=True))


def sine_set(shift: float = 0.0) -> list[np.ndarray]:
    return [np.sin(THETA + shift - p) for p in PHASES]


def trap_set(shift: float = 0.0) -> list[np.ndarray]:
    return [trapezoid(THETA, shift + p) for p in PHASES]


def block_set(shift: float) -> list[np.ndarray]:
    return [block(THETA, shift + p) for p in PHASES]


def run() -> dict:
    e_sin = sine_set(0.0)
    e_trap = trap_set(0.0)
    i_block_sine = block_set(np.pi / 6.0)
    i_block_trap = block_set(0.0)

    cases = {
        "sine_emf_120_blocks": assemble(e_sin, i_block_sine),
        "trapezoid_emf_120_blocks": assemble(e_trap, i_block_trap),
        "sine_emf_sine_current": assemble(e_sin, sine_set(0.0)),
        "trapezoid_emf_sine_current": assemble(e_trap, sine_set(0.0)),
    }
    out_cases = {name: ripple_metrics(p) for name, p in cases.items()}

    deltas = np.linspace(-np.pi / 6.0, np.pi / 6.0, 241)
    sweep = []
    for d in deltas:
        p = assemble(e_sin, block_set(np.pi / 6.0 + d))
        m = ripple_metrics(p)
        sweep.append(
            {
                "delta_deg": float(np.degrees(d)),
                "pct_of_peak": m["pct_of_peak"],
                "pct_of_mean": m["pct_of_mean"],
            }
        )
    best = min(sweep, key=lambda r: r["pct_of_peak"])
    at_15 = min(sweep, key=lambda r: abs(r["delta_deg"] - 15.0))
    at_30 = max(sweep, key=lambda r: r["delta_deg"])

    sampled = out_cases["sine_emf_120_blocks"]
    analytic_peak = 100.0 * (1.0 - np.sqrt(3.0) / 2.0)
    analytic_mean = 100.0 * np.pi * (np.sqrt(3.0) - 1.5) / (3.0 * np.sqrt(3.0))

    return {
        "experiment": "e01_sixstep",
        "title": "Six-step torque ripple: 13.4% is the sinusoidal-EMF number",
        "parameters": {
            "samples_per_electrical_revolution": N,
            "conduction_angle_deg": 120.0,
            "commutation_pairs_per_revolution": 6,
            "sine_block_shift_deg": 30.0,
        },
        "cases": out_cases,
        "analytic": {
            "sine_120_pct_of_peak": analytic_peak,
            "sine_120_pct_of_mean": analytic_mean,
            "trapezoid_120_pct_of_peak": 0.0,
            "identity_peak": "1 - sqrt(3)/2",
            "identity_mean": "pi*(sqrt(3)-3/2)/(3*sqrt(3))",
        },
        "sampling_error_pp": abs(sampled["pct_of_peak"] - analytic_peak),
        "misalignment": {
            "sweep": sweep[::4],
            "best": best,
            "at_plus_15_deg": at_15,
            "at_plus_30_deg": at_30,
        },
        "hidden_pattern": (
            "13.4% and 14.0% are the same physical ripple normalized to peak and to mean; "
            "they describe a sinusoidal-EMF machine driven with 120-degree blocks. With an "
            "ideal trapezoidal EMF aligned to the blocks the ripple is zero. The number is a "
            "property of the EMF/current pair, not of six-step commutation as such."
        ),
    }
