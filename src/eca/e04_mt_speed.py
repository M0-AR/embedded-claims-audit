"""E4: M and T methods, their crossover, and the PPR factor-of-four trap.

M counts encoder edges in a fixed gate time; its absolute resolution is one
count. T measures the edge period; its absolute error grows with n^2. The
crossover is n* = (60/N) * sqrt(f_clk / T_g) with N = counts per revolution.
"""

from __future__ import annotations

import numpy as np


def crossover(f_clk: float, tg: float, counts_per_rev: float) -> float:
    return (60.0 / counts_per_rev) * np.sqrt(f_clk / tg)


def errors(
    n: float,
    f_clk: float,
    tg: float,
    counts_per_rev: float,
    trials: int = 4000,
    rng: np.random.Generator | None = None,
) -> dict:
    rng = np.random.default_rng(20261117) if rng is None else rng
    t_edge = 60.0 / (n * counts_per_rev)
    phase_m = rng.random(trials)
    phase_t = rng.random(trials)
    count = np.floor(tg / t_edge + phase_m)
    zero_fraction = float(np.mean(count < 1.0))
    count = np.maximum(count, 1.0)
    n_m = 60.0 * count / (counts_per_rev * tg)
    ticks = np.maximum(np.floor(t_edge * f_clk + phase_t), 1.0)
    n_t = 60.0 * f_clk / (counts_per_rev * ticks)
    err_m = np.abs(n_m - n)
    err_t = np.abs(n_t - n)
    n_star = crossover(f_clk, tg, counts_per_rev)
    err_hybrid = np.where(n < n_star, err_t, err_m)
    return {
        "speed_rpm": n,
        "t_edge_us": 1e6 * t_edge,
        "count_mean": float(np.mean(count)),
        "zero_count_fraction": zero_fraction,
        "m_err_max_rpm": float(err_m.max()),
        "m_err_pct_max": 100.0 * float(err_m.max()) / n,
        "t_err_max_rpm": float(err_t.max()),
        "t_err_pct_max": 100.0 * float(err_t.max()) / n,
        "hybrid_err_max_rpm": float(err_hybrid.max()),
        "hybrid_err_pct_max": 100.0 * float(err_hybrid.max()) / n,
        "crossover_rpm": n_star,
    }


def run() -> dict:
    rng = np.random.default_rng(20261117)
    tg = 10e-3
    ppr_lines = 1000.0
    f_clks = [1e6, 72e6, 216e6]
    speeds = [1, 3, 6, 7, 37, 137, 601, 997, 3001, 6007, 10009]

    cross = {}
    for f_clk in f_clks:
        key = f"{f_clk / 1e6:g}MHz"
        cross[key] = {
            "counts_1000": crossover(f_clk, tg, ppr_lines),
            "counts_4000": crossover(f_clk, tg, 4.0 * ppr_lines),
            "ratio": 4.0,
        }

    tables = {}
    for f_clk in f_clks:
        key = f"{f_clk / 1e6:g}MHz"
        tables[key] = [errors(float(n), f_clk, tg, ppr_lines, rng=rng) for n in speeds]

    return {
        "experiment": "e04_mt_speed",
        "title": "M and T methods: a 4x PPR ambiguity moves the crossover, not the physics",
        "parameters": {
            "gate_time_ms": tg * 1e3,
            "encoder_lines_per_rev": ppr_lines,
            "quadrature_decoder": "4x (counts_per_rev = 4*lines) is reported separately",
            "clock_hz": f_clks,
            "trials": 4000,
        },
        "crossover": cross,
        "analytic": {
            "formula": "n* = (60/N)*sqrt(f_clk/T_g), N=counts/rev",
            "m_resolution_rpm": 60.0 / (ppr_lines * tg),
            "t_error": "dn = n^2*N/(60*f_clk)",
        },
        "tables": tables,
        "hidden_pattern": (
            "The crossover is exact, but it is only meaningful once N is defined. "
            "With 1000 lines and a 4x decoder, N=4000 and every crossover in the "
            "text is 4x too high. The M/T method is also not a third measurement: "
            "it is a speed-dependent choice of the better of M and T, and its "
            "worst-case error sits above the crossover where the one-count M "
            "resolution is flat."
        ),
    }
