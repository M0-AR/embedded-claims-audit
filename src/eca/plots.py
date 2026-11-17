from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np

from .util import FIGURES, load_results

COLORS = ["#3b6ea5", "#d1495b", "#4c956c", "#8a5a44", "#7b6d8d"]


def _style() -> None:
    plt.rcParams.update(
        {
            "figure.dpi": 150,
            "savefig.dpi": 150,
            "font.size": 9,
            "axes.titlesize": 10,
            "axes.labelsize": 9,
            "axes.grid": True,
            "grid.alpha": 0.25,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "legend.frameon": False,
            "legend.fontsize": 8,
        }
    )


def _save(fig, name: str) -> str:
    FIGURES.mkdir(parents=True, exist_ok=True)
    path = FIGURES / name
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return f"results/figures/{name}"


def _e01(r: dict) -> str:
    e = r["e01_sixstep"]
    labels = ["sine EMF\n120 blocks", "trapezoid EMF\n120 blocks", "sine EMF\nsine current", "trapezoid EMF\nsine current"]
    keys = ["sine_emf_120_blocks", "trapezoid_emf_120_blocks", "sine_emf_sine_current", "trapezoid_emf_sine_current"]
    vals = [e["cases"][k]["pct_of_peak"] for k in keys]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.4, 2.8))
    bars = ax1.bar(range(4), vals, color=COLORS[:4])
    ax1.set_xticks(range(4), labels, fontsize=7)
    ax1.set_ylabel("torque ripple (% of peak)")
    ax1.set_title("Ideal six-step, 120-degree conduction")
    for b, v in zip(bars, vals, strict=True):
        ax1.text(b.get_x() + b.get_width() / 2, v + 0.5, f"{v:.2f}", ha="center", fontsize=8)
    ax1.set_ylim(0, 18)
    sw = e["misalignment"]["sweep"]
    ax2.plot([p["delta_deg"] for p in sw], [p["pct_of_peak"] for p in sw], color=COLORS[0])
    ax2.set_xlabel("commutation misalignment (deg)")
    ax2.set_ylabel("ripple (% of peak)")
    ax2.set_title("Sensitivity to Hall/commutation offset")
    ax2.axvline(0, color="k", lw=0.6, ls=":")
    return _save(fig, "fig_e1_ripple.png")


def _e02(r: dict) -> str:
    e = r["e02_svpwm"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.4, 2.8))
    vals = [e["linear_limit"]["spwm"], e["linear_limit"]["svpwm"]]
    bars = ax1.bar([0, 1], vals, color=[COLORS[0], COLORS[2]])
    ax1.set_xticks([0, 1], ["SPWM", "SVPWM"])
    ax1.set_ylabel("linear phase-peak / Vdc")
    ax1.set_title("Linear modulation limit")
    ax1.set_ylim(0, 0.7)
    for b, v in zip(bars, vals, strict=True):
        ax1.text(b.get_x() + b.get_width() / 2, v + 0.01, f"{v:.3f}", ha="center", fontsize=8)
    ax1.text(0.5, 0.61, f"+{e['linear_limit']['gain_pct']:.2f}%", ha="center", color=COLORS[1], fontsize=9)
    cm = e["common_mode"]
    names = ["3rd", "6th", "9th"]
    vals2 = [cm["minmax_third"], cm["minmax_sixth"], cm["minmax_ninth"]]
    bars2 = ax2.bar(names, [max(v, 1e-6) for v in vals2], color=COLORS[:3])
    ax2.set_yscale("log")
    ax2.set_ylabel("zero-sequence harmonic amplitude")
    ax2.set_title("Exact min-max injection spectrum")
    for b, v in zip(bars2, vals2, strict=True):
        txt = f"{v:.3f}" if v > 1e-3 else "<1e-15"
        ax2.text(b.get_x() + b.get_width() / 2, max(v, 1e-6) * 1.4, txt, ha="center", fontsize=8)
    return _save(fig, "fig_e2_gain.png")


def _e03(r: dict) -> str:
    e = r["e03_deadtime"]
    cases = ["base", "zero_deadtime", "average_model"]
    labels = ["switching\n800 ns", "no dead time", "average\nmodel"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.4, 2.8))
    x = np.arange(3)
    i5 = [e[c]["i5_pct"] for c in cases]
    i7 = [e[c]["i7_pct"] for c in cases]
    ax1.bar(x - 0.18, i5, 0.36, label="5th", color=COLORS[1])
    ax1.bar(x + 0.18, i7, 0.36, label="7th", color=COLORS[0])
    ax1.set_xticks(x, labels, fontsize=7)
    ax1.set_ylabel("phase current (% of fundamental)")
    ax1.set_title("Low-order current harmonics")
    ax1.legend()
    ax2.bar(x, [e[c]["v_error_fund_v"] for c in cases], color=COLORS[2])
    ax2.axhline(e["base"]["theory_error_fund_v"], color="k", ls=":", lw=1, label="(4/pi)td fsw Vdc")
    ax2.set_xticks(x, labels, fontsize=7)
    ax2.set_ylabel("fundamental voltage error (V)")
    ax2.set_title("Dead-time voltage error")
    ax2.legend()
    return _save(fig, "fig_e3_harmonics.png")


def _e04(r: dict) -> str:
    e = r["e04_mt_speed"]
    fig, ax = plt.subplots(figsize=(7.4, 3.1))
    for clock, color in [("1MHz", COLORS[0]), ("72MHz", COLORS[2])]:
        rows = e["tables"][clock]
        speed = np.array([row["speed_rpm"] for row in rows])
        m = np.clip([row["m_err_pct_max"] for row in rows], 1e-3, None)
        t = np.clip([row["t_err_pct_max"] for row in rows], 1e-3, None)
        ax.plot(speed, m, "o-", color=color, ms=3, label=f"M err, {clock}")
        ax.plot(speed, t, "s--", color=color, ms=3, label=f"T err, {clock}")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("speed (rpm)")
    ax.set_ylabel("worst-case error (% of reading)")
    ax.set_title("M and T speed measurement: error against speed")
    ax.legend(ncol=2)
    ax.axvline(e["crossover"]["1MHz"]["counts_1000"], color="k", ls=":", lw=0.7)
    ax.text(e["crossover"]["1MHz"]["counts_1000"] * 1.1, 0.02, "1 MHz crossover", fontsize=7)
    return _save(fig, "fig_e4_crossover.png")


def _e05(r: dict) -> str:
    e = r["e05_kt_ke"]
    c = e["constants"]
    labels = ["DC / 120°\n9.549/Kv", "FOC peak\n8.270/Kv", "RMS\n11.695/Kv", "datasheet\n0.031"]
    vals = [c["kt_dc_nm_per_a"], c["kt_foc_peak_nm_per_a"], c["kt_rms_nm_per_a"], e["parameters"]["datasheet_kt_nm_per_a"]]
    fig, ax = plt.subplots(figsize=(7.0, 3.0))
    bars = ax.bar(range(4), vals, color=[COLORS[0], COLORS[2], COLORS[1], COLORS[3]])
    ax.set_xticks(range(4), labels, fontsize=7)
    ax.set_ylabel("K_t (Nm/A)")
    ax.set_title("One motor, four K_t numbers: 270 Kv, 7 pole pairs")
    for b, v in zip(bars, vals, strict=True):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.0008, f"{v:.4f}", ha="center", fontsize=8)
    ax.set_ylim(0, 0.052)
    return _save(fig, "fig_e5_kt.png")


def _e06(r: dict) -> str:
    e = r["e06_i2c"]
    fig, ax = plt.subplots(figsize=(7.4, 3.1))
    for mode, color in zip(["standard", "fast", "fmplus"], COLORS[:3], strict=True):
        rows = [w for w in e["windows"] if w["mode"] == mode and w["vdd_v"] == 3.3]
        rows.sort(key=lambda w: w["cb_pf"])
        cb = [w["cb_pf"] for w in rows]
        rmax = [w["rp_max_ohm"] for w in rows]
        rmin = rows[0]["rp_min_ohm"]
        ax.plot(cb, rmax, "o-", color=color, ms=4, label=f"{mode} R_p(max)")
        ax.axhline(rmin, color=color, ls="--", lw=1, label=f"{mode} R_p(min)")
    ax.set_yscale("log")
    ax.set_xlabel("bus capacitance C_b (pF)")
    ax.set_ylabel("pull-up resistance (Ohm)")
    ax.set_title("I2C pull-up window at 3.3 V: 4.7 kOhm is a Standard-mode part")
    ax.legend(ncol=2, fontsize=7)
    ax.axvline(100, color="k", ls=":", lw=0.6)
    ax.text(102, 9000, "100 pF", fontsize=7)
    return _save(fig, "fig_e6_windows.png")


def _e07(r: dict) -> str:
    e = r["e07_rs485"]
    fig, ax = plt.subplots(figsize=(7.4, 3.1))
    for (vdd, load), color in zip([(5.0, "none"), (5.0, "32UL"), (3.3, "none"), (3.3, "32UL")], COLORS[:4], strict=True):
        rows = [b for b in e["bias_table"] if b["vdd_v"] == vdd and b["load"] == load and b["r_term_ohm"] == 60]
        rows.sort(key=lambda b: b["r_bias_ohm"])
        ax.plot([b["r_bias_ohm"] for b in rows], [b["v_ab_mv"] for b in rows], "o-", ms=3, color=color, label=f"{vdd} V, {load}")
    ax.axhline(200, color="k", ls="--", lw=1, label="200 mV threshold")
    ax.set_xlabel("bias resistor (Ohm)")
    ax.set_ylabel("|V_AB| (mV)")
    ax.set_title("RS-485 failsafe bias with 60 Ohm termination")
    ax.legend(ncol=2)
    return _save(fig, "fig_e7_bias.png")


def _e08(r: dict) -> str:
    e = r["e08_ipc"]
    rows = [t for t in e["table"] if t["dt_c"] == 10]
    fig, ax = plt.subplots(figsize=(7.4, 3.1))
    series = [
        ("ipc2221_ext_mm", "IPC-2221 ext", COLORS[0]),
        ("ipc2221_int_mm", "IPC-2221 int", COLORS[1]),
        ("ipc2152_ext_fit_mm", "IPC-2152 fit ext", COLORS[2]),
        ("ipc2152_int_fit_mm", "IPC-2152 fit int", COLORS[3]),
    ]
    for key, label, color in series:
        ax.plot([t["current_a"] for t in rows], [t[key] for t in rows], "o-", ms=3, color=color, label=label)
    ax.set_xlabel("current (A)")
    ax.set_ylabel("trace width for 10 C rise, 1 oz (mm)")
    ax.set_title("IPC-2221 is not conservative at high current")
    ax.legend()
    ax.axvline(10, color="k", ls=":", lw=0.7)
    ax.text(10.2, 14, "10 A", fontsize=7)
    return _save(fig, "fig_e8_widths.png")


def _e09(r: dict) -> str:
    e = r["e09_hbridge"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.6, 3.1))
    schemes = e["schemes"]
    labels = ["bipolar", "unipolar\nsingle", "dual\naligned", "dual\nshifted"]
    x = np.arange(4)
    ax1.bar(x - 0.18, [s["ripple_ratio_to_bipolar"] for s in schemes], 0.36, color=COLORS[0], label="ripple ratio")
    ax1.bar(x + 0.18, [s["loss_proxy_rel"] for s in schemes], 0.36, color=COLORS[1], label="loss proxy")
    ax1.axhline(0.5, color="k", ls=":", lw=0.8)
    ax1.set_xticks(x, labels, fontsize=7)
    ax1.set_ylabel("relative to bipolar")
    ax1.set_title("Ripple and switching loss at m=0.6")
    ax1.legend()
    ms = e["m_sweep"]
    m = [p["m"] for p in ms]
    ax2.plot(m, [p["single_over_bipolar"] for p in ms], "o-", color=COLORS[2], label="single-leg")
    ax2.plot(m, [p["formula_2m_over_1plusm"] for p in ms], "k:", lw=1, label="2m/(1+m)")
    ax2.axhline(0.5, color=COLORS[1], ls="--", lw=1, label="the claimed 0.5")
    ax2.set_xlabel("modulation index m")
    ax2.set_ylabel("ripple / bipolar ripple")
    ax2.set_title("The 0.5 claim only holds as m -> 0")
    ax2.legend()
    return _save(fig, "fig_e9_ripple.png")


def _e10(r: dict) -> str:
    e = r["e10_paderborn"]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.6, 3.1))
    labels = ["torque\nhigh-load", "torque\nmotoring", "u_q\n(back-EMF)", "u_d"]
    vals = [
        e["torque_fit"]["alpha_pm_pct_per_k"],
        e["torque_fit_motoring"]["alpha_pm_pct_per_k"],
        e["uq_fit"]["alpha_pm_pct_per_k"],
        e["ud_fit"]["alpha_cu_pct_per_k"],
    ]
    colors = [COLORS[1] if v < 0 else COLORS[2] for v in vals]
    bars = ax1.bar(range(4), vals, color=colors)
    ax1.axhline(0, color="k", lw=0.8)
    ax1.set_xticks(range(4), labels, fontsize=7)
    ax1.set_ylabel("temperature coefficient (%/K)")
    ax1.set_title("Temperature channels: torque vs voltage")
    for b, v in zip(bars, vals, strict=True):
        ax1.text(b.get_x() + b.get_width() / 2, v + (0.006 if v >= 0 else -0.012), f"{v:+.3f}", ha="center", fontsize=7)
    ax1.set_ylim(-0.15, 0.15)
    pb = e["power_balance"]
    names = ["1.5 factor", "1.0 factor"]
    med = [pb["median_p_elec_over_p_mech_1p5"], pb["median_p_elec_over_p_mech_1p0"]]
    bars2 = ax2.bar(names, med, color=[COLORS[0], COLORS[1]])
    ax2.axhline(1.0, color="k", ls="--", lw=1)
    ax2.set_ylabel("median P_elec / P_mech")
    ax2.set_title("The 1.5 factor is not optional")
    for b, v in zip(bars2, med, strict=True):
        ax2.text(b.get_x() + b.get_width() / 2, v + 0.03, f"{v:.3f}", ha="center", fontsize=8)
    ax2.set_ylim(0, 1.65)
    return _save(fig, "fig_e10_temperature.png")


def make_all(results: dict | None = None) -> list[str]:
    _style()
    r = load_results() if results is None else results
    return [
        _e01(r),
        _e02(r),
        _e03(r),
        _e04(r),
        _e05(r),
        _e06(r),
        _e07(r),
        _e08(r),
        _e09(r),
        _e10(r),
    ]


if __name__ == "__main__":
    for path in make_all():
        print(path)
