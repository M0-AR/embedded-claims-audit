"""E3: dead time creates a sign(i) error voltage and a 6th dq harmonic.

The experiment runs a switching-level three-phase VSI with an RL load, then
compares the measured current spectrum with the average error model

    e_k = -sign(i_k) * (t_d / T_sw) * Vdc

and with the closed-form fundamental of that square wave, (4/pi) * A.
"""

from __future__ import annotations

import numpy as np

from .util import amplitude_at, single_sided_spectrum

PHASES = [0.0, 2.0 * np.pi / 3.0, 4.0 * np.pi / 3.0]


def simulate(
    td: float = 800e-9,
    m: float = 0.4,
    vdc: float = 350.0,
    f_sw: float = 10e3,
    f1: float = 50.0,
    resistance: float = 0.5,
    inductance: float = 5e-3,
    cycles: int = 8,
    dt: float = 2e-7,
    average_model: bool = False,
) -> dict:
    n = int(round(cycles / f1 / dt))
    t = np.arange(n) * dt
    theta = 2.0 * np.pi * f1 * t
    duty = 0.5 + m * np.cos(theta[:, None] - np.array(PHASES)[None, :])
    if average_model:
        v_ref = m * vdc * np.cos(theta[:, None] - np.array(PHASES)[None, :])
    else:
        tri = 1.0 - np.abs(2.0 * np.mod(t * f_sw, 1.0) - 1.0)
        cmd = duty > tri[:, None]
    td_steps = int(round(td / dt))
    alpha = np.exp(-resistance * dt / inductance)
    inv_r = 1.0 / resistance

    i_alpha = 0.0
    i_beta = 0.0
    gate = np.array([-1, -1, -1], dtype=int)
    cmd_prev = np.array([False, False, False])
    timer = np.zeros(3, dtype=int)
    i_a_store = np.empty(n)
    i_q_store = np.empty(n)
    v_err_store = np.empty(n)

    for k in range(n):
        if average_model:
            e = -np.sign([i_alpha, -0.5 * i_alpha + np.sqrt(3) / 2 * i_beta,
                          -0.5 * i_alpha - np.sqrt(3) / 2 * i_beta]) * (td / (1.0 / f_sw)) * vdc
            v = v_ref[k] + e
            v_alpha = (2.0 / 3.0) * (v[0] - 0.5 * v[1] - 0.5 * v[2])
            v_beta = (v[1] - v[2]) / np.sqrt(3.0)
            i_alpha = inv_r * v_alpha + (i_alpha - inv_r * v_alpha) * alpha
            i_beta = inv_r * v_beta + (i_beta - inv_r * v_beta) * alpha
            i_a_store[k] = i_alpha
            i_q_store[k] = -i_alpha * np.sin(theta[k]) + i_beta * np.cos(theta[k])
            v_err_store[k] = 0.0
            continue

        c = cmd[k]
        for leg in range(3):
            if c[leg] != cmd_prev[leg]:
                cmd_prev[leg] = c[leg]
                if td_steps == 0:
                    gate[leg] = 1 if c[leg] else -1
                else:
                    gate[leg] = 0
                    timer[leg] = td_steps
            elif timer[leg] > 0:
                timer[leg] -= 1
                if timer[leg] == 0:
                    gate[leg] = 1 if c[leg] else -1

        i_a = i_alpha
        i_b = -0.5 * i_alpha + np.sqrt(3.0) / 2.0 * i_beta
        i_c = -0.5 * i_alpha - np.sqrt(3.0) / 2.0 * i_beta
        i_phase = (i_a, i_b, i_c)
        v_leg = np.empty(3)
        for leg in range(3):
            if gate[leg] == 1:
                v_leg[leg] = 0.5 * vdc
            elif gate[leg] == -1:
                v_leg[leg] = -0.5 * vdc
            else:
                v_leg[leg] = 0.5 * vdc if i_phase[leg] < 0.0 else -0.5 * vdc
        v_alpha = (2.0 / 3.0) * (v_leg[0] - 0.5 * v_leg[1] - 0.5 * v_leg[2])
        v_beta = (v_leg[1] - v_leg[2]) / np.sqrt(3.0)
        i_alpha = inv_r * v_alpha + (i_alpha - inv_r * v_alpha) * alpha
        i_beta = inv_r * v_beta + (i_beta - inv_r * v_beta) * alpha
        i_a_store[k] = i_alpha
        i_q_store[k] = -i_alpha * np.sin(theta[k]) + i_beta * np.cos(theta[k])
        v_err_store[k] = (v_alpha - m * vdc * np.cos(theta[k]))

    settle = int(round(2.0 / f1 / dt))
    seg = i_a_store[settle:]
    fs = 1.0 / dt
    freqs, amps = single_sided_spectrum(seg, fs)
    i1 = amplitude_at(freqs, amps, f1)
    i5 = amplitude_at(freqs, amps, 5.0 * f1)
    i7 = amplitude_at(freqs, amps, 7.0 * f1)
    bins = [int(round(h * f1 / (fs / seg.size))) for h in range(2, 14)]
    harmonic_rms = float(np.sqrt(np.sum(amps[bins] ** 2)))
    thd_low = 100.0 * harmonic_rms / i1

    fq, aq = single_sided_spectrum(i_q_store[settle:], fs)
    q6 = amplitude_at(fq, aq, 6.0 * f1)
    qdc = abs(float(np.mean(i_q_store[settle:])))

    vf, va = single_sided_spectrum(v_err_store[settle:], fs)
    v_err_fund = amplitude_at(vf, va, f1)

    return {
        "td_ns": td * 1e9,
        "m": m,
        "vdc": vdc,
        "f_sw_khz": f_sw / 1e3,
        "f1": f1,
        "i1_a": i1,
        "i5_a": i5,
        "i7_a": i7,
        "i5_pct": 100.0 * i5 / i1,
        "i7_pct": 100.0 * i7 / i1,
        "i5_over_i7": i5 / i7 if i7 > 0 else None,
        "thd_low_pct": thd_low,
        "dq6_a": q6,
        "dq6_pct": 100.0 * q6 / max(qdc, 1e-12),
        "v_error_fund_v": v_err_fund,
        "theory_error_fund_v": (4.0 / np.pi) * (td / (1.0 / f_sw)) * vdc,
    }


def run() -> dict:
    base = simulate(td=800e-9, m=0.4, average_model=False)
    zero = simulate(td=0.0, m=0.4, average_model=False)
    avg = simulate(td=800e-9, m=0.4, average_model=True)
    sweep = [simulate(td=800e-9, m=m, average_model=False) for m in (0.1, 0.2, 0.4)]

    return {
        "experiment": "e03_deadtime",
        "title": "Dead time: 2.8 V of error, 5th/7th current, 6th in dq",
        "parameters": {
            "vdc": 350.0,
            "f_sw_khz": 10.0,
            "td_ns": 800.0,
            "m": 0.4,
            "f1_hz": 50.0,
            "R_ohm": 0.5,
            "L_mh": 5.0,
            "dt_ns": 200.0,
            "cycles": 8,
        },
        "base": base,
        "zero_deadtime": zero,
        "average_model": avg,
        "modulation_sweep": sweep,
        "ideal_error_v": (800e-9 * 10e3) * 350.0,
        "theory": {
            "average_error": "(t_d/T_sw)*Vdc = 2.8 V",
            "fundamental": "(4/pi)*(t_d/T_sw)*Vdc",
            "phase_harmonics": "5th and 7th, ratio set by 1/h in voltage and 1/h^2 in current",
            "dq": "5th (negative sequence) and 7th (positive sequence) both map to 6th in dq",
        },
        "hidden_pattern": (
            "The dead-time error is a square wave at the fundamental frequency, so it is not "
            "a DC offset that a dq integrator can remove: it appears as 5th/7th in phase "
            "current and collapses onto the 6th in dq. The 6th is the fingerprint; the "
            "5th/7th pair is the same phenomenon seen in the stationary frame."
        ),
    }
