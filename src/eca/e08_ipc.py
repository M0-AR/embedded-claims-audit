from __future__ import annotations

from .util import save_result

OZ_MIL = 1.378
RHO_CU = 1.72e-8


def ipc2221_width_mm(i_a: float, dt_c: float, external: bool, oz: float = 1.0) -> float:
    k = 0.048 if external else 0.024
    area_mil2 = (i_a / (k * dt_c**0.44)) ** (1.0 / 0.725)
    width_mil = area_mil2 / (oz * OZ_MIL)
    return width_mil * 0.0254


def ipc2152_width_mm(i_a: float, dt_c: float, external: bool, oz: float = 1.0) -> float:
    if external:
        k, a, b, c = 215.3, 2.0, -1.15, -1.0
    else:
        k, a, b, c = 200.0, 1.9, -1.10, -1.52
    thickness_mil = oz * OZ_MIL
    width_mil = (dt_c / (k * i_a**a * thickness_mil**c)) ** (1.0 / b)
    return width_mil * 0.0254


def resistance_ohm(width_mm: float, length_mm: float = 50.0, oz: float = 1.0) -> float:
    thickness_m = oz * 35e-6
    return RHO_CU * (length_mm * 1e-3) / (width_mm * 1e-3 * thickness_m)


def run() -> dict:
    rows = []
    for i_a in (1.0, 2.0, 5.0, 10.0, 20.0):
        for dt_c in (10.0, 20.0, 30.0):
            we21 = ipc2221_width_mm(i_a, dt_c, True)
            wi21 = ipc2221_width_mm(i_a, dt_c, False)
            we52 = ipc2152_width_mm(i_a, dt_c, True)
            wi52 = ipc2152_width_mm(i_a, dt_c, False)
            rows.append(
                {
                    "current_a": i_a,
                    "dt_c": dt_c,
                    "ipc2221_ext_mm": we21,
                    "ipc2221_int_mm": wi21,
                    "ipc2152_ext_fit_mm": we52,
                    "ipc2152_int_fit_mm": wi52,
                    "ratio_2152_over_2221_ext": we52 / we21,
                    "ratio_2152_over_2221_int": wi52 / wi21,
                    "ratio_2221_int_over_ext": wi21 / we21,
                    "ratio_2152_int_over_ext": wi52 / we52,
                }
            )

    case = next(r for r in rows if r["current_a"] == 10.0 and r["dt_c"] == 10.0)
    chart_ext = 18.7
    chart_ratio = chart_ext / case["ipc2221_ext_mm"]
    fit_ratio = case["ipc2152_ext_fit_mm"] / case["ipc2221_ext_mm"]

    resistance = []
    for label, width in (
        ("ipc2221_ext", case["ipc2221_ext_mm"]),
        ("ipc2152_fit_ext", case["ipc2152_ext_fit_mm"]),
        ("ipc2152_chart_ext", chart_ext),
        ("ipc2221_int", case["ipc2221_int_mm"]),
        ("ipc2152_fit_int", case["ipc2152_int_fit_mm"]),
    ):
        r = resistance_ohm(width)
        resistance.append(
            {
                "case": label,
                "width_mm": width,
                "r_50mm_mohm": r * 1e3,
                "drop_v_at_10a": 10.0 * r,
                "power_w_at_10a": 100.0 * r,
            }
        )

    payload = {
        "experiment": "E8",
        "title": "PCB trace width: IPC-2221 against the IPC-2152 empirical fit",
        "table": rows,
        "case_10a_10c": {
            **case,
            "ipc2152_ext_chart_mm": chart_ext,
            "chart_over_2221_width": chart_ratio,
            "fit_over_2221_width": fit_ratio,
            "chart_current_equivalent_factor": chart_ratio**0.725,
            "fit_current_equivalent_factor": fit_ratio**0.725,
            "ipc2221_int_over_ext_area": 2.0 ** (1.0 / 0.725),
        },
        "resistance_50mm": resistance,
        "hidden_pattern": (
            "IPC-2221's internal-layer rule is not an independent measurement: its k is "
            "halved (0.024 vs 0.048), which is exactly the same as halving the current. "
            "For a fixed current and temperature rise the internal area is therefore "
            "2^(1/0.725)=2.60 times the external area by construction. The IPC-2152 "
            "empirical fit does not reproduce that penalty; at 10 A, 10 C, 1 oz it predicts "
            "13.3 mm internal versus 15.2 mm external. For external traces the same fit is "
            "2.1 times wider than IPC-2221 at 10 A, and a 2026 chart reading is 2.6 times "
            "wider, so IPC-2221 is non-conservative at high current by roughly a factor of "
            "1.7-2.0 in current. At 1 A the two methods nearly agree, which is why the "
            "discrepancy is invisible in low-current examples. The chart and the fit differ "
            "by 23% at the 10 A case, so the absolute width carries a fit-versus-chart "
            "uncertainty that the paper reports rather than hides."
        ),
    }
    save_result("e08_ipc", payload)
    return payload
