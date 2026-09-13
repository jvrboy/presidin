from app import strategies, backtest, risk, reasoning
import random

def series(n=300):
    random.seed(3); c=[100.0]
    for _ in range(n): c.append(c[-1]*(1+random.gauss(0.0002,0.004)))
    return {"closes":c,"highs":[x*1.001 for x in c],"lows":[x*0.999 for x in c],"volumes":[100]*len(c)}

def test_indicators():
    s = series()
    assert strategies.rsi(s["closes"]) is not None
    assert strategies.atr(s["highs"], s["lows"], s["closes"]) is not None
    assert strategies.macd(s["closes"]) is not None

def test_aggregate():
    from app import forex
    out = forex.analyze("EURUSD", series())
    assert out["bias"] in ("bullish","bearish","neutral")
    assert out["tp"] != out["sl"] and 0 <= out["confidence"] <= 100

def test_backtest():
    bt = backtest.run(series(500))
    assert bt["ok"] and bt["trades"] >= 0 and bt["max_drawdown_pct"] >= 0

def test_risk():
    ps = risk.position_size(10000, 1, 1.1000, 1.0950)
    assert ps["ok"] and ps["lots"] > 0
    assert risk.kelly(55, 2.0)["kelly_half"] > 0

def test_reasoning():
    assert reasoning.bayes_update(30, 3.0)["posterior_pct"] > 30
    dm = reasoning.decision_matrix([{"name":"A","scores":{"x":9}},{"name":"B","scores":{"x":2}}], {"x":1})
    assert dm["winner"] == "A"
