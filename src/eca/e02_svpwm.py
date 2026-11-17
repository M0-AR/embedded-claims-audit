"""E2: SVPWM is SPWM plus a zero-sequence injection; its 15.47% is headroom.

The experiment verifies three statements at once:
  * min-max injection and space-vector dwell times produce identical line-line volts;
  * the linear modulation limits are 0.5 (SPWM) and 1/sqrt(3) (SVPWM) of Vdc;
  * the 2/sqrt(3) gain is bought with common-mode voltage.
"""

from __future__ import annotations

import numpy as np

N = 1 << 14
THETA = np.linspace(0.0, 2.0 * np.pi, N, endpoint=False)
PHASES = [0.0, 2.0 * np.pi / 3.0, 4.0 * np.pi / 3.0]


def reference(m: float, theta: np.ndarray = THETA) -> np.ndarray:
    return np.stack([m * np.cos(theta - p) for p in PHASES], axis=1)


def duties_spwm(m: float, theta: np.ndarray = THETA) -> np.ndarray:
    return 0.5 + reference(m, theta)


def duties_svpwm(m: float, theta: np.ndarray = THETA) -> np.ndarray:
    u = reference(m, theta)
    zs = 0.5 * (u.max(axis=1) + u.min(axis=1))
    return 0.5 + u - zs[:, None]


def sv_dwell_line_line(m: float, theta: np.ndarray) -> np.ndarray:
    """Line-line average from sector-1 space-vector dwell times (times in Ts)."""
    th = np.mod(theta, np.pi / 3.0)
    t1 = np.sqrt(3.0) * m * np.sin(np.pi / 3.0 - th)
    t2 = np.sqrt(3.0) * m * np.sin(th)
    va = (2.0 / 3.0) * t1 + (1.0 / 3.0) * t2
    vb = -(1.0 / 3.0) * t1 + (1.0 / 3.0) * t2
    return va - vb


def max_linear_index(fn, m_lo: float = 0.4, m_hi: float = 0.7) -> float:
    th = np.linspace(0.0, 2.0 * np.pi, 4096, endpoint=False)

    def feasible(m: float) -> bool:
        d = fn(m, th)
        return bool(np.all(d >= -1e-12) and np.all(d <= 1.0 + 1e-12))

    lo, hi = m_lo, m_hi
    for _ in range(60):
        mid = 0.5 * (lo + hi)
        if feasible(mid):
            lo = mid
        else:
            hi = mid
    return float(lo)


def harmonic_amp(x: np.ndarray, h: int, theta: np.ndarray = THETA) -> float:
    c = 2.0 / x.size * np.sum((x - x.mean()) * np.exp(-1j * h * theta))
    return float(abs(c))


def duties_third(m: float, theta: np.ndarray = THETA) -> np.ndarray:
    u = reference(m, theta)
    return 0.5 + u - (m / 6.0) * np.cos(3.0 * theta)[:, None]


def run() -> dict:
    m_test = 0.4
    d_spwm = duties_spwm(m_test)
    d_svpwm = duties_svpwm(m_test)
    ll_ref = (reference(m_test)[:, 0] - reference(m_test)[:, 1])
    ll_spwm = (d_spwm[:, 0] - d_spwm[:, 1])
    ll_svpwm = (d_svpwm[:, 0] - d_svpwm[:, 1])
    line_line_error_spwm = float(np.max(np.abs(ll_spwm - ll_ref)))
    line_line_error_svpwm = float(np.max(np.abs(ll_svpwm - ll_ref)))
    duty_difference = float(np.max(np.abs(d_svpwm - d_spwm)))

    th1 = np.linspace(0.0, np.pi / 3.0, 2001, endpoint=False)
    ll_dwell = sv_dwell_line_line(m_test, th1)
    ll_expected = m_test * (np.cos(th1) - np.cos(th1 - 2.0 * np.pi / 3.0))
    dwell_error = float(np.max(np.abs(ll_dwell - ll_expected)))

    m_spwm = max_linear_index(duties_spwm)
    m_svpwm = max_linear_index(duties_svpwm)
    gain = 100.0 * (m_svpwm / m_spwm - 1.0)

    zs = 0.5 * (reference(1.0).max(axis=1) + reference(1.0).min(axis=1))
    zs_third = -(1.0 / 6.0) * np.cos(3.0 * THETA)
    third_zs = harmonic_amp(zs, 3)
    third_rule = harmonic_amp(zs_third, 3)
    sixth_zs = harmonic_amp(zs, 6)
    ninth_zs = harmonic_amp(zs, 9)
    cm_rms = float(np.sqrt(np.mean(zs**2)))
    cm_rms_third = float(np.sqrt(np.mean(zs_third**2)))
    m_third = max_linear_index(duties_third)

    return {
        "experiment": "e02_svpwm",
        "title": "SVPWM = SPWM + min-max zero sequence; 15.47% is voltage headroom",
        "parameters": {
            "samples_per_period": N,
            "test_modulation_index": m_test,
            "modulation_index_definition": "V_phase_peak / Vdc",
            "minmax_zero_sequence": "0.5*(max(u)+min(u))",
        },
        "linear_limit": {
            "spwm": m_spwm,
            "svpwm": m_svpwm,
            "analytic_spwm": 0.5,
            "analytic_svpwm": 1.0 / np.sqrt(3.0),
            "gain_pct": gain,
            "analytic_gain_pct": 100.0 * (2.0 / np.sqrt(3.0) - 1.0),
        },
        "equivalence": {
            "max_zero_sequence_abs": duty_difference,
            "spwm_line_line_error": line_line_error_spwm,
            "svpwm_line_line_error": line_line_error_svpwm,
            "dwell_line_line_error": dwell_error,
        },
        "common_mode": {
            "minmax_third": third_zs,
            "minmax_third_identity": "3*sqrt(3)/(8*pi)",
            "minmax_third_analytic": 3.0 * np.sqrt(3.0) / (8.0 * np.pi),
            "minmax_sixth": sixth_zs,
            "minmax_ninth": ninth_zs,
            "one_sixth_third": third_rule,
            "third_rule_to_phase_pct": 100.0 * third_zs,
            "cm_rms_minmax_at_m1": cm_rms,
            "cm_rms_one_sixth_at_m1": cm_rms_third,
            "third_injection_linear_limit": m_third,
            "note": (
                "SPWM has zero common-mode by construction. The exact min-max zero sequence "
                "has a 3rd harmonic of 3*sqrt(3)/(8*pi)=20.67%, not 1/6=16.67%; the 1/6 rule "
                "is a different injection with the same line-line voltage and headroom but "
                "different common-mode/EMI."
            ),
        },
        "hidden_pattern": (
            "The 15.47% is exactly 2/sqrt(3)-1 and lives in the linear limit, not in the "
            "line-line waveform: at equal modulation index both methods produce the same "
            "line-line voltage. SVPWM's zero-sequence is the price, and its third harmonic is "
            "the familiar 1/6 injection rule."
        ),
    }
