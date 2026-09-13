"""Correlation divergence detection — ported from CORRELATION TOOL.zip and
forex_correlation_divergence_detector.zip. Flags when highly-correlated pairs
move in directions that contradict their established rolling correlation."""
import math
from statistics import mean

def _returns(c):
    return [(c[i] - c[i-1]) / c[i-1] for i in range(1, len(c)) if c[i-1]]

def _pearson(a, b):
    n = min(len(a), len(b))
    if n < 3: return None
    a, b = a[-n:], b[-n:]; ma, mb = mean(a), mean(b)
    num = sum((x-ma)*(y-mb) for x, y in zip(a, b))
    da = math.sqrt(sum((x-ma)**2 for x in a)); db = math.sqrt(sum((y-mb)**2 for y in b))
    return num/(da*db) if da and db else None

def _norm_slope(series, lookback):
    if len(series) < lookback: return None
    y = series[-lookback:]; m = mean(y) or 1.0
    x = list(range(lookback)); xm = mean(x); ym = mean(y)
    den = sum((xi-xm)**2 for xi in x)
    return (sum((xi-xm)*(yi-ym) for xi, yi in zip(x, y)) / den) / m if den else None

def detect_pair_divergence(closes_a, closes_b, window=30, corr_threshold=0.6, lookback=20):
    """One pair-of-pairs divergence check. Returns a signal dict or None."""
    ra, rb = _returns(closes_a), _returns(closes_b)
    if len(ra) < max(window, lookback) + 5: return None
    corr = _pearson(ra[-window:], rb[-window:])
    sa, sb = _norm_slope(closes_a, lookback), _norm_slope(closes_b, lookback)
    if corr is None or sa is None or sb is None: return None
    if abs(corr) < corr_threshold:
        return {"correlation": round(corr, 3), "signal": "NO SIGNAL",
                "reason": "Correlation too weak for a reliable relationship."}
    same_dir = (sa > 0) == (sb > 0) and sa != 0 and sb != 0
    expected_same = corr >= 0
    if expected_same and not same_dir:
        return {"correlation": round(corr, 3), "signal": "POSITIVE-CORRELATION DIVERGENCE",
                "reason": "Pairs normally move together, but recent trends disagree.",
                "strength": round(min(1.0, abs(sa - sb) * 200), 3)}
    if not expected_same and same_dir:
        return {"correlation": round(corr, 3), "signal": "NEGATIVE-CORRELATION DIVERGENCE",
                "reason": "Pairs normally move opposite, but recent trends agree.",
                "strength": round(min(1.0, abs(sa - sb) * 200), 3)}
    return {"correlation": round(corr, 3), "signal": "ALIGNED", "reason": "Recent movement matches the established correlation."}

def scan(closes_map, corr_threshold=0.6, lookback=20, window=30):
    """All pair combinations in closes_map -> list of divergence signals (strongest first)."""
    from itertools import combinations
    out = []
    for a, b in combinations(closes_map.keys(), 2):
        r = detect_pair_divergence(closes_map[a], closes_map[b], window, corr_threshold, lookback)
        if r and r["signal"] not in ("NO SIGNAL", "ALIGNED"):
            out.append({"pair_a": a, "pair_b": b, **r})
    out.sort(key=lambda x: -x.get("strength", 0))
    return out
