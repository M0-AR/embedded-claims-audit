import pytest

from eca import e03_deadtime, e09_hbridge


@pytest.fixture(scope="module")
def e3():
    return e03_deadtime.run()


@pytest.fixture(scope="module")
def e9():
    return e09_hbridge.run()


def test_e3_deadtime_harmonics(e3):
    base = e3["base"]
    assert base["i5_over_i7"] == pytest.approx(2.079, rel=0.02)
    assert base["v_error_fund_v"] == pytest.approx(base["theory_error_fund_v"], rel=0.002)
    assert e3["ideal_error_v"] == pytest.approx(2.8, rel=1e-12)
    assert base["i5_pct"] > 0.1
    assert base["i7_pct"] > 0.05


def test_e3_average_model_keeps_current_harmonics(e3):
    average = e3["average_model"]
    assert average["v_error_fund_v"] == pytest.approx(0.0, abs=1e-9)
    assert average["i5_pct"] > 0.1


def test_e3_sweep_reduces_ripple_with_modulation(e3):
    sweep = e3["modulation_sweep"]
    assert sweep[0]["i5_pct"] > sweep[1]["i5_pct"] > sweep[2]["i5_pct"]


def test_e9_ripple_ratios(e9):
    schemes = {item["scheme"]: item for item in e9["schemes"]}
    assert schemes["bipolar"]["ripple_ratio_to_bipolar"] == pytest.approx(1.0, abs=1e-12)
    assert schemes["unipolar_single"]["ripple_ratio_to_bipolar"] == pytest.approx(0.7497, rel=1e-3)
    assert schemes["unipolar_dual_aligned"]["ripple_ratio_to_bipolar"] == pytest.approx(0.3764, rel=1e-3)
    assert schemes["unipolar_dual_shifted"]["ripple_ratio_to_bipolar"] == pytest.approx(0.9997, rel=1e-3)


def test_e9_analytic_limits(e9):
    analytic = e9["analytic"]
    m = e9["parameters"]["m"]
    assert analytic["formula_2m_over_1plusm"] == pytest.approx(2 * m / (1 + m), rel=1e-12)
    assert analytic["formula_dual_aligned_over_bipolar"] == pytest.approx(m / (1 + m), rel=1e-12)


def test_e9_switching_loss_proxy(e9):
    schemes = {item["scheme"]: item for item in e9["schemes"]}
    assert schemes["bipolar"]["loss_proxy_rel"] == pytest.approx(1.0, abs=1e-12)
    assert schemes["unipolar_single"]["loss_proxy_rel"] == pytest.approx(0.5, abs=1e-12)
    assert schemes["unipolar_single"]["switching_events_per_switching_period"] == pytest.approx(2.0)
    assert schemes["bipolar"]["switching_events_per_switching_period"] == pytest.approx(4.0)
