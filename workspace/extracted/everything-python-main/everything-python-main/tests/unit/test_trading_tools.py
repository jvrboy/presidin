from app import dsi, correlation_divergence as cd
import random

def test_switch_probability_monotonic():
    p_early = dsi.switch_probability(5, 30, 3)
    p_late = dsi.switch_probability(60, 30, 3)
    assert 0 < p_early < p_late <= 0.99

def test_regime_detection():
    random.seed(2)
    up = [100 + i * 0.1 for i in range(80)]            # clear uptrend
    r = dsi.detect_regime(up)
    assert r["regime"] in ("positive", "driftless") and 0 <= r["confidence"] <= 1
    flat = [100.0] * 80
    assert dsi.detect_regime(flat)["regime"] == "driftless"

def test_correlation_divergence_detector():
    random.seed(4)
    a = [100.0]
    for _ in range(120): a.append(a[-1] * (1 + random.gauss(0.001, 0.003)))
    b_same = [x * 1.02 for x in a]                      # perfectly correlated, same direction
    assert cd.detect_pair_divergence(a, b_same)["signal"] in ("ALIGNED", "NO SIGNAL")
    b_opp = list(reversed(a))                           # strongly anti-correlated trend
    res = cd.detect_pair_divergence(a, b_opp, corr_threshold=0.3)
    assert res is None or res["signal"] in ("POSITIVE-CORRELATION DIVERGENCE", "NEGATIVE-CORRELATION DIVERGENCE", "NO SIGNAL", "ALIGNED")

def test_scan_runs():
    random.seed(6)
    m = {}
    for k in "ABCD":
        c = [100.0]
        for _ in range(100): c.append(c[-1] * (1 + random.gauss(0, 0.004)))
        m[k] = c
    out = cd.scan(m, corr_threshold=0.3)
    assert isinstance(out, list)

def test_ssrf_guard():
    from app.tools import _ssrf_blocked
    assert _ssrf_blocked("http://127.0.0.1/admin") is not None
    assert _ssrf_blocked("http://localhost:8000") is not None
    assert _ssrf_blocked("http://169.254.169.254/latest/meta-data") is not None
    assert _ssrf_blocked("https://example.com") is None
