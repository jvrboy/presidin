"""Rate-limit backend + market-data cache + OHLC alignment tests."""
import asyncio
import time
from app import ratelimit, forex


def test_inmemory_too_many(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_DISABLED", "false")
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    ratelimit._local.clear()
    key = f"test:{time.time()}"
    hits = 0
    for _ in range(5):
        if not ratelimit.too_many(key, 3, 60):
            ratelimit.hit(key)
            hits += 1
    assert hits == 3                       # stops counting after the limit
    assert ratelimit.too_many(key, 3, 60)  # subsequent checks say "too many"
    ratelimit._local.pop(key, None)


def test_series_cache(monkeypatch):
    forex.cache_clear()
    calls = {"n": 0}
    async def fake_yahoo(pair, tf, bars):
        calls["n"] += 1
        return {"closes": [1.0, 2.0], "highs": [1.1, 2.1], "lows": [0.9, 1.9], "price": 2.0, "provider": "yahoo"}
    monkeypatch.setattr(forex, "_fetch_yahoo", fake_yahoo)
    s1 = asyncio.run(forex.fetch_series("EURUSD", "H1", 200))
    s2 = asyncio.run(forex.fetch_series("EURUSD", "H1", 200))
    assert s1 == s2 and calls["n"] == 1    # second call served from cache
    forex.cache_clear()


def test_frankfurter_fallback_used_when_yahoo_down(monkeypatch):
    forex.cache_clear()
    async def yahoo_down(pair, tf, bars):
        return None
    async def fake_fallback(pair, bars):
        return {"closes": [1.0, 1.1], "highs": [1.0, 1.1], "lows": [1.0, 1.1],
                "price": 1.1, "provider": "frankfurter"}
    monkeypatch.setattr(forex, "_fetch_yahoo", yahoo_down)
    monkeypatch.setattr(forex, "_frankfurter_series", fake_fallback)
    s = asyncio.run(forex.fetch_series("EURUSD", "H1", 200))
    assert s["provider"] == "frankfurter"
    forex.cache_clear()


def test_yahoo_bars_stay_aligned():
    """The alignment fix: one missing leg drops the WHOLE bar from all arrays."""
    q = {"close": [1.0, None, 3.0, 4.0], "high": [1.1, 2.1, 3.1, None], "low": [0.9, 1.9, 2.9, 3.9]}
    rows = [(c, h, l) for c, h, l in zip(q["close"], q["high"], q["low"]) if c is not None and h is not None and l is not None]
    closes = [r[0] for r in rows]
    highs = [r[1] for r in rows]
    lows = [r[2] for r in rows]
    assert len(closes) == len(highs) == len(lows) == 2
    assert closes == [1.0, 3.0] and highs == [1.1, 3.1] and lows == [0.9, 2.9]


def test_learning_loop_closes_predictions():
    """The wired self-learning loop: a bullish prediction hitting TP flips to win."""
    from app import learning
    learning._local_preds.clear()
    learning._local_weights.clear()
    learning._last_record.clear()
    row = learning.record_prediction("TESTX", "bullish", 100.0, 110.0, 95.0, 80, strategies_used=["sma_20_50"])
    assert row and row["status"] == "open"
    r = learning.evaluate_open({"TESTX": 111.0})   # price above TP -> win
    assert r["evaluated"] == 1
    assert row["status"] == "win"
    assert learning._local_weights.get("sma_20_50", {}).get("wins") == 1


def test_record_prediction_throttle():
    from app import learning
    learning._last_record.clear()
    a = learning.record_prediction("THROT", "bullish", 1, 2, 0.5, 50)
    b = learning.record_prediction("THROT", "bearish", 1, 2, 0.5, 50)
    assert a is not None and b is None            # second call inside the window is throttled
    learning._last_record.clear()
