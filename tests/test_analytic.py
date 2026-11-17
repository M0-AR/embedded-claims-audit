import math

import pytest

from eca import e01_sixstep, e02_svpwm, e04_mt_speed, e05_kt_ke, e06_i2c, e07_rs485, e08_ipc


@pytest.fixture(scope="module")
def e1():
    return e01_sixstep.run()


@pytest.fixture(scope="module")
def e2():
    return e02_svpwm.run()


@pytest.fixture(scope="module")
def e4():
    return e04_mt_speed.run()


@pytest.fixture(scope="module")
def e5():
    return e05_kt_ke.run()


@pytest.fixture(scope="module")
def e6():
    return e06_i2c.run()


@pytest.fixture(scope="module")
def e7():
    return e07_rs485.run()


@pytest.fixture(scope="module")
def e8():
    return e08_ipc.run()


def test_e1_sine_120_ripple_matches_identity(e1):
    case = e1["cases"]["sine_emf_120_blocks"]
    assert case["pct_of_peak"] == pytest.approx(e1["analytic"]["sine_120_pct_of_peak"], rel=1e-12)
    assert case["pct_of_mean"] == pytest.approx(e1["analytic"]["sine_120_pct_of_mean"], rel=1e-9)
    assert e1["analytic"]["sine_120_pct_of_peak"] == pytest.approx(100 * (1 - math.sqrt(3) / 2))


def test_e1_ideal_cases_have_no_ripple(e1):
    assert e1["cases"]["trapezoid_emf_120_blocks"]["pct_of_peak"] == pytest.approx(0.0, abs=1e-12)
    assert e1["cases"]["sine_emf_sine_current"]["pct_of_peak"] < 1e-10
    assert e1["cases"]["trapezoid_emf_sine_current"]["pct_of_peak"] == pytest.approx(
        e1["analytic"]["sine_120_pct_of_peak"], rel=2e-2
    )


def test_e1_misalignment_increases_ripple(e1):
    assert e1["misalignment"]["at_plus_15_deg"]["pct_of_peak"] > 2 * 13.397
    assert e1["misalignment"]["at_plus_30_deg"]["pct_of_peak"] == pytest.approx(50.0, abs=0.01)


def test_e2_svpwm_gain(e2):
    limit = e2["linear_limit"]
    assert limit["spwm"] == pytest.approx(0.5, abs=1e-12)
    assert limit["svpwm"] == pytest.approx(1 / math.sqrt(3), rel=1e-9)
    assert limit["gain_pct"] == pytest.approx(100 * (2 / math.sqrt(3) - 1), rel=1e-9)


def test_e2_injection_equivalence(e2):
    assert e2["equivalence"]["svpwm_line_line_error"] < 1e-14
    assert e2["equivalence"]["dwell_line_line_error"] < 1e-14
    assert e2["common_mode"]["minmax_third"] == pytest.approx(3 * math.sqrt(3) / (8 * math.pi), rel=1e-7)
    assert e2["common_mode"]["one_sixth_third"] == pytest.approx(1 / 6, rel=1e-12)


def test_e4_crossover_scales_with_encoder_counts(e4):
    assert e4["crossover"]["1MHz"]["counts_1000"] == pytest.approx(600.0, rel=1e-12)
    assert e4["crossover"]["1MHz"]["counts_4000"] == pytest.approx(150.0, rel=1e-12)
    assert e4["crossover"]["72MHz"]["counts_1000"] == pytest.approx(5091.1688, rel=1e-6)
    assert e4["crossover"]["216MHz"]["counts_1000"] == pytest.approx(8818.1631, rel=1e-6)


def test_e4_is_deterministic():
    first = e04_mt_speed.run()
    second = e04_mt_speed.run()
    assert first["tables"] == second["tables"]


def test_e5_kt_conventions(e5):
    constants = e5["constants"]
    assert constants["kt_dc_nm_per_a"] == pytest.approx(60 / (2 * math.pi * 270), rel=1e-12)
    assert constants["kt_foc_peak_nm_per_a"] == pytest.approx(8.2699334313 / 270, rel=1e-8)
    assert e5["comparison"]["ratio_dc_to_foc"] == pytest.approx(2 / math.sqrt(3), rel=1e-12)
    assert e5["comparison"]["kt_foc_vs_dc_pct"] == pytest.approx(-13.3974596216, rel=1e-9)
    assert e5["at_85a"]["power_balance_error_pct"] < 1e-12


def test_e6_i2c_windows(e6):
    fast = e6["case_fast_400pf_3v3"]
    assert fast["rp_min_ohm"] > fast["rp_max_ohm"]
    assert not fast["feasible"]
    fmplus = e6["case_fmplus_550pf_3v3_20ma"]
    assert fmplus["rp_min_ohm"] < fmplus["rp_max_ohm"]
    assert fmplus["feasible"]
    assert not e6["case_fmplus_550pf_3v3_3ma"]["feasible"]
    assert e6["four_seven_k"]["standard"]["max_cb_pf"] == pytest.approx(251.111, rel=1e-5)


def test_e7_rs485_bias(e7):
    assert e7["cases"]["5v_680_no_load"] == pytest.approx(0.2112676056, rel=1e-9)
    assert e7["cases"]["5v_680_full_load"] == pytest.approx(0.1831949194, rel=1e-9)
    assert e7["cases"]["5v_680_full_load"] < 0.2
    assert e7["cases"]["5v_560_full_load"] > 0.2
    assert e7["reflections"][1]["gamma"] == pytest.approx(0.0, abs=1e-15)
    assert e7["reflections"][2]["gamma"] == pytest.approx(-1 / 9, rel=1e-12)


def test_e8_ipc_widths(e8):
    case = e8["case_10a_10c"]
    assert case["ipc2221_ext_mm"] == pytest.approx(7.19409, rel=1e-5)
    assert case["ipc2152_ext_fit_mm"] == pytest.approx(15.2071, rel=1e-4)
    assert case["ipc2221_int_mm"] == pytest.approx(18.7150, rel=1e-4)
    assert case["ratio_2221_int_over_ext"] == pytest.approx(2 ** (1 / 0.725), rel=1e-6)
    assert case["chart_over_2221_width"] == pytest.approx(2.5994, rel=1e-3)


def test_e8_resistance_and_drop(e8):
    row = e8["resistance_50mm"][0]
    assert row["width_mm"] == pytest.approx(e8["case_10a_10c"]["ipc2221_ext_mm"], rel=1e-9)
    assert row["r_50mm_mohm"] == pytest.approx(3.4155, rel=1e-4)
    assert row["drop_v_at_10a"] == pytest.approx(0.034155, rel=1e-4)
