from app import advanced_analysis as A
import random

def series(n=300):
    random.seed(5); c=[100.0]
    for _ in range(n): c.append(c[-1]*(1+random.gauss(0.0002,0.004)))
    return {"closes":c,"highs":[x*1.001 for x in c],"lows":[x*0.999 for x in c],"volumes":[random.randint(50,200) for _ in c]}

def test_correlation():
    c = series()["closes"]
    m = A.correlation_matrix({"A": c, "B": [x*1.01 for x in c]})
    assert abs(m["matrix"]["A"]["B"]) > 0.9

def test_orderflow_strength_momentum_divergence():
    s = series()
    assert A.order_flow(s)["vwap"] is not None
    assert A.strength(s)["strength"] in ("weak","moderate","strong")
    assert A.momentum(s)["rsi"] is not None
    assert A.divergence(s)["divergence"] in ("bullish","bearish","none")

def test_neural():
    nn = A.neural_forecast(series(), ahead=3)
    assert nn["ok"] and len(nn["forecast"]) == 3
    assert not A.neural_forecast({"closes":[1,2,3]})["ok"]
