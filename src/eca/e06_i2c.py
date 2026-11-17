from __future__ import annotations

import numpy as np

from .util import e12_between, save_result

LN_7_3 = float(np.log(7.0 / 3.0))

MODES = {
    "standard": {
        "name": "Standard-mode",
        "tr_max_s": 1000e-9,
        "cb_max_f": 400e-12,
        "iol_a": 3e-3,
        "vol_v": 0.4,
        "fmax_hz": 100e3,
    },
    "fast": {
        "name": "Fast-mode",
        "tr_max_s": 300e-9,
        "cb_max_f": 400e-12,
        "iol_a": 3e-3,
        "vol_v": 0.4,
        "fmax_hz": 400e3,
    },
    "fmplus": {
        "name": "Fast-mode Plus",
        "tr_max_s": 120e-9,
        "cb_max_f": 550e-12,
        "iol_a": 20e-3,
        "vol_v": 0.4,
        "fmax_hz": 1e6,
    },
}


def rp_min(vdd: float, iol_a: float, vol_v: float = 0.4) -> float:
    return (vdd - vol_v) / iol_a


def rp_max(tr_max_s: float, cb_f: float) -> float:
    return tr_max_s / (LN_7_3 * cb_f)


def window(vdd: float, mode: str, cb_f: float, iol_a: float | None = None) -> dict[str, float | bool]:
    spec = MODES[mode]
    iol = spec["iol_a"] if iol_a is None else iol_a
    lo = rp_min(vdd, iol, spec["vol_v"])
    hi = rp_max(spec["tr_max_s"], cb_f)
    return {
        "rp_min_ohm": lo,
        "rp_max_ohm": hi,
        "margin_ohm": hi - lo,
        "feasible": bool(hi > lo),
        "cb_within_mode": bool(cb_f <= spec["cb_max_f"] + 1e-15),
    }


def max_cb(vdd: float, mode: str, rp_ohm: float) -> float:
    del vdd
    return MODES[mode]["tr_max_s"] / (LN_7_3 * rp_ohm)


def rise_time(rp_ohm: float, cb_f: float) -> float:
    return LN_7_3 * rp_ohm * cb_f


def run() -> dict:
    modes = []
    for key, spec in MODES.items():
        modes.append(
            {
                "key": key,
                "name": spec["name"],
                "tr_max_ns": spec["tr_max_s"] * 1e9,
                "cb_max_pf": spec["cb_max_f"] * 1e12,
                "iol_ma": spec["iol_a"] * 1e3,
                "vol_v": spec["vol_v"],
                "fmax_khz": spec["fmax_hz"] / 1e3,
                "rp_min_3v3_ohm": rp_min(3.3, spec["iol_a"], spec["vol_v"]),
                "rp_max_400pf_ohm": rp_max(spec["tr_max_s"], 400e-12),
                "max_cb_at_4k7_pf": max_cb(3.3, key, 4700.0) * 1e12,
            }
        )

    windows = []
    for vdd in (1.8, 3.3, 5.0):
        for key in MODES:
            for cb_pf in (100.0, 200.0, 400.0, 550.0):
                w = window(vdd, key, cb_pf * 1e-12)
                windows.append(
                    {
                        "vdd_v": vdd,
                        "mode": key,
                        "cb_pf": cb_pf,
                        **w,
                        "e12_choices": e12_between(float(w["rp_min_ohm"]), float(w["rp_max_ohm"]))
                        if w["feasible"] and w["cb_within_mode"]
                        else [],
                    }
                )

    four_k7 = {}
    for key, spec in MODES.items():
        cmax = max_cb(3.3, key, 4700.0)
        four_k7[key] = {
            "max_cb_pf": cmax * 1e12,
            "tr_100pf_ns": rise_time(4700.0, 100e-12) * 1e9,
            "tr_400pf_ns": rise_time(4700.0, 400e-12) * 1e9,
            "supports_400pf": bool(cmax >= 400e-12),
            "within_tr_100pf": bool(rise_time(4700.0, 100e-12) <= spec["tr_max_s"]),
        }

    fast_case = window(3.3, "fast", 400e-12)
    std_case = window(3.3, "standard", 400e-12)
    fm_3ma = window(3.3, "fmplus", 550e-12, iol_a=3e-3)
    fm_20ma = window(3.3, "fmplus", 550e-12)

    payload = {
        "experiment": "E6",
        "title": "I2C pull-up sizing: mode, capacitance, and sink-current conventions",
        "ln_7_3": LN_7_3,
        "modes": modes,
        "windows": windows,
        "four_seven_k": four_k7,
        "case_fast_400pf_3v3": fast_case,
        "case_standard_400pf_3v3": std_case,
        "case_fmplus_550pf_3v3_3ma": fm_3ma,
        "case_fmplus_550pf_3v3_20ma": fm_20ma,
        "traps": {
            "fast_400pf_empty": not fast_case["feasible"],
            "fmplus_false_impossible_with_3ma": (not fm_3ma["feasible"]) and fm_20ma["feasible"],
            "four_k7_only_standard": (
                four_k7["standard"]["within_tr_100pf"]
                and not four_k7["fast"]["within_tr_100pf"]
                and not four_k7["fmplus"]["within_tr_100pf"]
            ),
            "four_k7_max_cb_standard_pf": four_k7["standard"]["max_cb_pf"],
            "four_k7_max_cb_fast_pf": four_k7["fast"]["max_cb_pf"],
        },
        "hidden_pattern": (
            "The ubiquitous 4.7 kOhm pull-up is a Standard-mode (100 kHz) component. "
            "At 3.3 V it limits Cb to 251 pF in Standard mode, 75 pF in Fast mode, and "
            "30 pF in Fast-mode Plus. Fast mode at 400 pF and 3.3 V has an empty window "
            "(Rp_min > Rp_max) with the 3 mA sink specified for Standard/Fast mode. "
            "Fast-mode Plus is feasible at 550 pF only because its sink current is 20 mA; "
            "reusing the 3 mA number manufactures a false impossibility. The 0.8473 in "
            "Rp(max) is ln(7/3), not a fitted constant."
        ),
    }
    save_result("e06_i2c", payload)
    return payload
