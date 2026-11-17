from __future__ import annotations

import numpy as np
from scipy.signal import lfilter

from .util import save_result


def carrier(t: np.ndarray, fsw: float) -> np.ndarray:
    return 2.0 * np.abs(2.0 * ((t * fsw) % 1.0) - 1.0) - 1.0


def simulate(
    scheme: str,
    m: float = 0.6,
    vdc: float = 48.0,
    f1: float = 100.0,
    fsw: float = 20e3,
    inductance_h: float = 5e-3,
    resistance_ohm: float = 2.0,
    i0_a: float = 5.0,
    periods: float = 4.0,
    steps_per_switching: int = 2000,
) -> dict:
    tsw = 1.0 / fsw
    dt = tsw / steps_per_switching
    n = int(round(periods / f1 / dt))
    t = np.arange(n) * dt
    tri = carrier(t, fsw)

    if scheme == "bipolar":
        sa = (tri < m).astype(float)
        sb = 1.0 - sa
    elif scheme == "unipolar_single":
        sa = (tri < 2.0 * m - 1.0).astype(float)
        sb = np.zeros_like(sa)
    elif scheme == "unipolar_dual_aligned":
        sa = (tri < m).astype(float)
        sb = (tri < -m).astype(float)
    elif scheme == "unipolar_dual_shifted":
        sa = (tri < m).astype(float)
        tri_b = carrier(t + 0.5 * tsw, fsw)
        sb = (tri_b < -m).astype(float)
    else:
        raise ValueError(scheme)

    v = vdc * (sa - sb)
    e = m * vdc - resistance_ohm * i0_a
    a_coef = 1.0 - resistance_ohm * dt / inductance_h
    b_coef = dt / inductance_h
    i = lfilter([b_coef], [1.0, -a_coef], v - e, zi=[a_coef * i0_a])[0]

    last = int(round(1.0 / f1 / dt))
    idx = slice(n - last, n)
    i_last = i[idx]
    v_last = v[idx]

    window = int(round(10.0 * tsw / dt))
    i_window = i[n - window :]
    ripple_pp = float(np.max(i_window) - np.min(i_window))
    i_mean = float(np.mean(i_last))
    i_rms = float(np.sqrt(np.mean(i_last**2)))
    v_neg_fraction = float(np.mean(v_last < -1e-9))
    transitions = int(np.sum(np.abs(np.diff(sa[idx]))) + np.sum(np.abs(np.diff(sb[idx]))))
    events_per_period = transitions / (fsw / f1)

    preview_n = int(round(2.0 * tsw / dt))
    start = n // 4
    preview = slice(start, start + preview_n)

    return {
        "scheme": scheme,
        "ripple_pp_a": ripple_pp,
        "i_mean_a": i_mean,
        "i_rms_a": i_rms,
        "v_neg_fraction": v_neg_fraction,
        "switching_events_per_switching_period": events_per_period,
        "waveform": {
            "t_us": t[preview] * 1e6,
            "v": v[preview],
            "i": i[preview],
        },
    }


def run() -> dict:
    m = 0.6
    vdc = 48.0
    fsw = 20e3
    inductance_h = 5e-3
    schemes = [
        "bipolar",
        "unipolar_single",
        "unipolar_dual_aligned",
        "unipolar_dual_shifted",
    ]
    results = [simulate(s, m=m, vdc=vdc, fsw=fsw, inductance_h=inductance_h) for s in schemes]

    tsw = 1.0 / fsw
    analytic_bipolar = vdc * (1.0 - m**2) * tsw / (2.0 * inductance_h)
    analytic_single = m * (1.0 - m) * vdc * tsw / inductance_h
    analytic_dual_aligned = analytic_single / 2.0
    analytic_map = {
        "bipolar": analytic_bipolar,
        "unipolar_single": analytic_single,
        "unipolar_dual_aligned": analytic_dual_aligned,
        "unipolar_dual_shifted": None,
    }
    for r in results:
        r["analytic_pp_a"] = analytic_map[r["scheme"]]
        r["ripple_ratio_to_bipolar"] = r["ripple_pp_a"] / results[0]["ripple_pp_a"]
        r["loss_proxy_rel"] = r["switching_events_per_switching_period"] / results[0]["switching_events_per_switching_period"]
        del r["waveform"]["i"]

    sweep = []
    for mi in (0.2, 0.4, 0.6, 0.8, 0.9):
        b = vdc * (1.0 - mi**2) * tsw / (2.0 * inductance_h)
        u = mi * (1.0 - mi) * vdc * tsw / inductance_h
        sweep.append(
            {
                "m": mi,
                "bipolar_pp_a": b,
                "unipolar_single_pp_a": u,
                "single_over_bipolar": u / b,
                "formula_2m_over_1plusm": 2.0 * mi / (1.0 + mi),
                "switching_loss_rel_single": 0.5,
            }
        )

    payload = {
        "experiment": "E9",
        "title": "Unipolar against bipolar PWM: ripple depends on which unipolar",
        "parameters": {
            "m": m,
            "vdc_v": vdc,
            "f1_hz": 100.0,
            "fsw_hz": fsw,
            "l_h": inductance_h,
            "r_ohm": 2.0,
            "i0_a": 5.0,
        },
        "schemes": results,
        "analytic": {
            "bipolar_pp_a": analytic_bipolar,
            "unipolar_single_pp_a": analytic_single,
            "unipolar_dual_aligned_pp_a": analytic_dual_aligned,
            "ratio_single_over_bipolar": analytic_single / analytic_bipolar,
            "ratio_dual_aligned_over_bipolar": analytic_dual_aligned / analytic_bipolar,
            "formula_2m_over_1plusm": 2.0 * m / (1.0 + m),
            "formula_dual_aligned_over_bipolar": m / (1.0 + m),
        },
        "m_sweep": sweep,
        "hidden_pattern": (
            "The claim that unipolar PWM halves current ripple is false in general. For the "
            "single-leg unipolar scheme the exact ripple ratio is 2m/(1+m): 0.67 at m=0.5, "
            "0.75 at m=0.6, and 0.95 at m=0.9, approaching 1 as the modulation index rises. "
            "Only the switching-loss proxy is exactly halved, because the single-leg scheme "
            "has two gate transitions per switching period instead of four. The dual-leg "
            "aligned scheme produces a two-pulse 0/+Vdc waveform: it halves the single-leg "
            "ripple (ratio m/(1+m), 0.375 at m=0.6) but switches both legs, so it doubles the "
            "loss proxy relative to the single-leg scheme. The "
            "naive phase-shifted dual-leg scheme is not even unipolar: it produces negative "
            "voltage pulses and a much larger ripple. 'Unipolar' names a family, not one "
            "waveform, and the quantitative claim depends on which member is chosen."
        ),
    }
    save_result("e09_hbridge", payload)
    return payload
