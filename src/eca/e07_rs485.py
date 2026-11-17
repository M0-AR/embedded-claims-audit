from __future__ import annotations

import numpy as np

from .util import save_result

V_AB_MIN = 0.2


def v_ab(vdd: float, r_bias: float, r_term: float = 60.0, r_load: float | None = None) -> float:
    r_bus = r_term if r_load is None else 1.0 / (1.0 / r_term + 1.0 / r_load)
    return vdd * r_bus / (2.0 * r_bias + r_bus)


def r_bias_max(vdd: float, r_term: float = 60.0, r_load: float | None = None) -> float:
    r_bus = r_term if r_load is None else 1.0 / (1.0 / r_term + 1.0 / r_load)
    return (vdd * r_bus / V_AB_MIN - r_bus) / 2.0


def reflection(z0: float, r_term: float = 120.0) -> float:
    return (r_term - z0) / (r_term + z0)


def run() -> dict:
    loads = [("none", None), ("32_unit_loads", 375.0)]
    bias_values = [390.0, 430.0, 470.0, 560.0, 680.0, 750.0, 1000.0]
    bias_table = []
    for vdd in (3.3, 5.0):
        for r_term in (60.0, 120.0):
            for load_name, r_load in loads:
                for r_bias in bias_values:
                    v = v_ab(vdd, r_bias, r_term, r_load)
                    bias_table.append(
                        {
                            "vdd_v": vdd,
                            "r_term_ohm": r_term,
                            "load": load_name,
                            "r_bias_ohm": r_bias,
                            "v_ab_mv": v * 1e3,
                            "passes_200mv": bool(v >= V_AB_MIN),
                        }
                    )

    limits = []
    for vdd in (3.3, 5.0):
        for r_term in (60.0, 120.0):
            for load_name, r_load in loads:
                limits.append(
                    {
                        "vdd_v": vdd,
                        "r_term_ohm": r_term,
                        "load": load_name,
                        "r_bias_max_ohm": r_bias_max(vdd, r_term, r_load),
                    }
                )

    reflections = []
    for z0 in (100.0, 120.0, 150.0):
        g = reflection(z0)
        reflections.append(
            {
                "z0_ohm": z0,
                "gamma": g,
                "gamma_pct": g * 100.0,
                "return_loss_db": float(-20.0 * np.log10(abs(g))) if g != 0 else 999.0,
            }
        )

    uart = []
    for baud in (9600, 19200, 115200, 921600):
        bit_s = 1.0 / baud
        byte_s = 11.0 * bit_s
        uart.append(
            {
                "baud": baud,
                "bit_us": bit_s * 1e6,
                "byte_8e1_us": byte_s * 1e6,
                "txe_to_tc_us": byte_s * 1e6,
                "worst_case_write_to_tc_us": 22.0 * bit_s * 1e6,
            }
        )

    payload = {
        "experiment": "E7",
        "title": "RS-485 failsafe bias, termination, loading, and DE timing",
        "v_ab_min_mv": V_AB_MIN * 1e3,
        "bias_table": bias_table,
        "bias_limits": limits,
        "reflections": reflections,
        "uart_de_timing": uart,
        "cases": {
            "5v_680_no_load": v_ab(5.0, 680.0, 60.0, None),
            "5v_680_full_load": v_ab(5.0, 680.0, 60.0, 375.0),
            "5v_560_full_load": v_ab(5.0, 560.0, 60.0, 375.0),
            "3v3_430_full_load": v_ab(3.3, 430.0, 60.0, 375.0),
            "3v3_390_full_load": v_ab(3.3, 390.0, 60.0, 375.0),
        },
        "hidden_pattern": (
            "Failsafe bias is usually checked against the two 120 Ohm terminators alone, "
            "giving a 60 Ohm bus. The 32-unit-load receiver input resistance (about 375 Ohm) "
            "sits in parallel with that, lowering the bus to 51.7 Ohm and the bias voltage by "
            "about 14%. A 680 Ohm bias that passes 5 V unloaded (211 mV) fails with full load "
            "(183 mV); 3.3 V needs about 390 Ohm, not 430 Ohm. Separately, dropping DE at TXE "
            "rather than TC truncates the final byte: the shift register can still be sending "
            "11 bit times of data."
        ),
    }
    save_result("e07_rs485", payload)
    return payload
