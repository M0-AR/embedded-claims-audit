import pytest

from eca import e10_paderborn

pytestmark = pytest.mark.skipif(
    not e10_paderborn.DATA_FILE.exists(),
    reason="Paderborn CSV absent; see scripts/download_data.py",
)


@pytest.fixture(scope="module")
def e10():
    return e10_paderborn.run()


def test_e10_dataset_loaded(e10):
    assert e10["status"] == "ok"
    assert e10["dataset"]["rows"] == 1_330_816
    assert len(e10["profiles"]) == 69


def test_e10_dq_power_uses_1p5(e10):
    power = e10["power_balance"]
    assert power["median_p_elec_over_p_mech_1p5"] == pytest.approx(1.0535, rel=0.01)
    assert power["median_p_elec_over_p_mech_1p0"] == pytest.approx(0.7023, rel=0.01)


def test_e10_magnet_trend(e10):
    assert e10["uq_fit"]["alpha_pm_pct_per_k"] == pytest.approx(-0.122, rel=0.05)
    assert e10["torque_fit"]["r2"] > 0.99
    assert e10["torque_from_voltage"]["scale"] == pytest.approx(1.0014, rel=0.001)
    assert e10["torque_from_voltage"]["rmse_nm"] == pytest.approx(4.0, rel=0.01)
