"""E5: Kt = Ke is a convention identity, not a unit identity.

For a sinusoidal PMSM driven with field-oriented control,

    Ke_LL_peak = 60/(2*pi*Kv)          [V*s/rad, line-line peak]
    Kt_q_peak  = (sqrt(3)/2) * Ke_LL   [Nm/A, peak phase current]

so Kt = 8.2701/Kv, not 9.5493/Kv. The 2/sqrt(3) gap is the same factor that
sets the SVPWM headroom in E2.
"""

from __future__ import annotations

import numpy as np

KV = 270.0
POLES = 7
KT_DATASHEET = 0.031
TWO_PI = 2.0 * np.pi


def run() -> dict:
    ke_ll = 60.0 / (TWO_PI * KV)
    ke_phase = ke_ll / np.sqrt(3.0)
    kt_dc = ke_ll
    kt_foc = np.sqrt(3.0) / 2.0 * ke_ll
    kt_rms = np.sqrt(2.0) * kt_foc
    psi = ke_ll / (np.sqrt(3.0) * POLES)

    i_peak = 85.0
    i_cont = 45.0
    speed_rpm = 1000.0
    omega = TWO_PI * speed_rpm / 60.0
    e_phase_peak = POLES * psi * omega
    torque = kt_foc * i_peak
    p_mech = torque * omega
    p_elec = 1.5 * e_phase_peak * i_peak

    return {
        "experiment": "e05_kt_ke",
        "title": "Kt = Ke only after choosing a current and EMF convention",
        "parameters": {
            "kv_rpm_per_v": KV,
            "pole_pairs": POLES,
            "datasheet_kt_nm_per_a": KT_DATASHEET,
            "datasheet_voltage_convention": "line-line amplitude",
            "datasheet_current_convention": "phase amplitude",
        },
        "constants": {
            "ke_ll_v_s_per_rad": ke_ll,
            "ke_phase_peak_v_s_per_rad": ke_phase,
            "kt_dc_nm_per_a": kt_dc,
            "kt_foc_peak_nm_per_a": kt_foc,
            "kt_rms_nm_per_a": kt_rms,
            "psi_wb": psi,
            "psi_mwb": 1e3 * psi,
            "dc_rule_per_kv": 60.0 / TWO_PI,
            "foc_rule_per_kv": 30.0 * np.sqrt(3.0) / (2.0 * np.pi),
            "rms_rule_per_kv": 30.0 * np.sqrt(6.0) / (2.0 * np.pi),
        },
        "comparison": {
            "datasheet_vs_foc_pct": 100.0 * (KT_DATASHEET / kt_foc - 1.0),
            "kt_foc_vs_dc_pct": 100.0 * (kt_foc / kt_dc - 1.0),
            "kt_dc_vs_foc_pct": 100.0 * (kt_dc / kt_foc - 1.0),
            "rms_vs_foc_pct": 100.0 * (kt_rms / kt_foc - 1.0),
            "ratio_dc_to_foc": kt_dc / kt_foc,
            "ratio_rms_to_foc": kt_rms / kt_foc,
        },
        "at_85a": {
            "torque_nm": torque,
            "speed_rpm": speed_rpm,
            "omega_rad_s": omega,
            "e_phase_peak_v": e_phase_peak,
            "p_mech_w": p_mech,
            "p_elec_w": p_elec,
            "power_balance_error_pct": 100.0 * (p_elec / p_mech - 1.0),
            "torque_45a_nm": kt_foc * i_cont,
        },
        "hidden_pattern": (
            "Kt and Ke are numerically equal only in the 120-degree DC convention. "
            "For a sinusoidal PMSM with peak phase current the torque constant is "
            "smaller by 2/sqrt(3)=15.47%, and for RMS current it is larger by sqrt(2). "
            "The ODrive footnote (line-line amplitude, phase amplitude) selects the "
            "2/sqrt(3) convention; applying 9.5493/Kv overstates torque by 15.47%."
        ),
    }
