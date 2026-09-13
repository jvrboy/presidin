from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.services.indicators import calculate_indicators, _rsi, _macd, _s, _last, _atr, _sma, _ema


def _ohlcv(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def _find_local_extrema(arr: np.ndarray):
    minima, maxima = [], []
    for i in range(1, len(arr) - 1):
        if arr[i] <= arr[i - 1] and arr[i] <= arr[i + 1]:
            minima.append(i)
        if arr[i] >= arr[i - 1] and arr[i] >= arr[i + 1]:
            maxima.append(i)
    return minima, maxima


def market_regime(rows: list[dict], lookback: int = 20) -> dict:
    df = _ohlcv(rows)
    close = df["close"].astype(float)
    returns = close.pct_change().dropna()
    slope = np.polyfit(np.arange(min(lookback, len(close))), close.tail(lookback), 1)[0]
    volatility = float(returns.tail(lookback).std() * np.sqrt(252)) if len(returns) > 2 else 0.0
    strength = abs(slope) / max(float(close.iloc[-1]) * 0.0001, 1e-9)
    regime = "TRENDING_UP" if slope > 0 and strength > 0.5 else "TRENDING_DOWN" if slope < 0 and strength > 0.5 else "HIGH_VOLATILITY" if volatility > 0.25 else "RANGING"
    return {"regime": regime, "trend_slope": float(slope), "trend_strength": float(strength), "annualized_volatility": volatility, "return": float(returns.tail(lookback).sum()) if len(returns) else 0.0}


def _psychological_levels(price: float, count: int = 3) -> dict:
    """Round-number ('psychological') levels near the current price.

    Traders watch round numbers (whole numbers, and half-steps for FX pairs
    quoted to 4-5 decimals) as informal support/resistance because large
    numbers of retail and algorithmic orders tend to cluster there. The
    step size scales with price magnitude so this works for both FX pairs
    (~1.0-2.0) and synthetic indices / metals (hundreds to thousands).
    """
    magnitude = 10 ** np.floor(np.log10(max(abs(price), 1e-9)))
    step = magnitude / 10 if magnitude >= 1 else magnitude
    step = max(step, 1e-6)
    nearest = round(price / step) * step
    levels_above = [float(nearest + step * i) for i in range(1, count + 1)]
    levels_below = [float(nearest - step * i) for i in range(1, count + 1)]
    return {"nearest_round_level": float(nearest), "levels_above": levels_above, "levels_below": levels_below, "step": float(step)}


def _dynamic_zones(rows: list[dict], lookback: int, tolerance_pct: float = 0.0015) -> dict:
    """Cluster recent swing highs/lows into dynamic support/resistance zones.

    Unlike the single classic pivot, this groups nearby historical extrema
    together (within `tolerance_pct` of each other) so that levels which
    have been repeatedly tested show up as one zone with a `touches` count
    -- a much stronger signal than an untested single-touch level.
    """
    df = _ohlcv(rows).tail(lookback).reset_index(drop=True)
    high, low = df["high"].astype(float).values, df["low"].astype(float).values
    minima, maxima = _find_local_extrema(high)
    _, low_minima = _find_local_extrema(low)
    resistance_points = sorted({float(high[i]) for i in maxima}, reverse=True)
    support_points = sorted({float(low[i]) for i in low_minima})

    def cluster(points: list[float]) -> list[dict]:
        zones: list[dict] = []
        for price in points:
            placed = False
            for zone in zones:
                if abs(price - zone["level"]) / max(abs(zone["level"]), 1e-9) <= tolerance_pct:
                    zone["touches"] += 1
                    zone["level"] = (zone["level"] * (zone["touches"] - 1) + price) / zone["touches"]
                    placed = True
                    break
            if not placed:
                zones.append({"level": price, "touches": 1})
        return sorted(zones, key=lambda z: z["touches"], reverse=True)[:6]

    return {"resistance_zones": cluster(resistance_points), "support_zones": cluster(support_points)}


def support_resistance(rows: list[dict], lookback: int = 20) -> dict:
    df = _ohlcv(rows).tail(lookback)
    high, low, close = df["high"].astype(float), df["low"].astype(float), df["close"].astype(float)
    pivot = float((high.iloc[-1] + low.iloc[-1] + close.iloc[-1]) / 3)
    current_price = float(close.iloc[-1])
    return {
        "pivot": pivot,
        "resistance_1": float(2 * pivot - low.iloc[-1]),
        "support_1": float(2 * pivot - high.iloc[-1]),
        "resistance_2": float(pivot + high.iloc[-1] - low.iloc[-1]),
        "support_2": float(pivot - high.iloc[-1] + low.iloc[-1]),
        "range_high": float(high.max()),
        "range_low": float(low.min()),
        "psychological_levels": _psychological_levels(current_price),
        "dynamic_zones": _dynamic_zones(rows, max(lookback, 50)),
    }


def volatility_profile(rows: list[dict], lookback: int = 20) -> dict:
    df = _ohlcv(rows)
    close = df["close"].astype(float)
    returns = close.pct_change().dropna()
    recent = returns.tail(lookback)
    var95 = float(recent.quantile(0.05)) if len(recent) else 0.0
    tail = recent[recent <= var95]
    return {"realized_volatility": float(recent.std() * np.sqrt(252)) if len(recent) > 1 else 0.0, "var_95": var95, "expected_shortfall_95": float(tail.mean()) if len(tail) else var95, "atr_percent": float((df["high"].tail(lookback) - df["low"].tail(lookback)).mean() / close.iloc[-1])}


def candlestick_patterns(rows: list[dict]) -> dict:
    df = _ohlcv(rows).tail(3).reset_index(drop=True)
    o, h, l, c = [df[key].astype(float) for key in ("open", "high", "low", "close")]
    body = (c - o).abs()
    upper, lower = h - pd.concat([o, c], axis=1).max(axis=1), pd.concat([o, c], axis=1).min(axis=1) - l
    current = len(df) - 1
    patterns: list[str] = []
    if body.iloc[current] <= (h.iloc[current] - l.iloc[current]) * 0.1: patterns.append("DOJI")
    if lower.iloc[current] >= body.iloc[current] * 2 and upper.iloc[current] <= body.iloc[current]: patterns.append("HAMMER")
    if upper.iloc[current] >= body.iloc[current] * 2 and lower.iloc[current] <= body.iloc[current]: patterns.append("SHOOTING_STAR")
    if c.iloc[current] > o.iloc[current] and c.iloc[current - 1] < o.iloc[current - 1] and c.iloc[current] >= o.iloc[current - 1] and o.iloc[current] <= c.iloc[current - 1]: patterns.append("BULLISH_ENGULFING")
    if c.iloc[current] < o.iloc[current] and c.iloc[current - 1] > o.iloc[current - 1] and c.iloc[current] <= o.iloc[current - 1] and o.iloc[current] >= c.iloc[current - 1]: patterns.append("BEARISH_ENGULFING")
    return {"patterns": patterns, "candle": {"open": float(o.iloc[current]), "high": float(h.iloc[current]), "low": float(l.iloc[current]), "close": float(c.iloc[current]), "body": float(body.iloc[current]), "upper_shadow": float(upper.iloc[current]), "lower_shadow": float(lower.iloc[current])}}


def confluence_score(rows: list[dict]) -> dict:
    df = _ohlcv(rows)
    values = calculate_indicators(df, ["RSI_14", "MACD", "MACD_SIGNAL", "ADX_14", "BB_PERCENT", "TREND_STRENGTH", "VOLUME_RATIO", "PLUS_DI", "MINUS_DI", "STOCH_14"])
    bullish = 0
    bullish += int(values["RSI_14"] > 50)
    bullish += int(values["MACD"] > values["MACD_SIGNAL"])
    bullish += int(values["ADX_14"] > 20)
    bullish += int(values["BB_PERCENT"] > 0.5)
    bullish += int(values["TREND_STRENGTH"] > 0)
    bullish += int(values["VOLUME_RATIO"] > 1)
    bullish += int(values["PLUS_DI"] > values["MINUS_DI"])
    bullish += int(values["STOCH_14"] > 50)
    score = bullish / 8
    return {"score": score, "bias": "BULLISH" if score >= 0.625 else "BEARISH" if score <= 0.375 else "NEUTRAL", "components": values}


def trade_plan(rows: list[dict], risk_reward: float = 2.0) -> dict:
    df = _ohlcv(rows)
    close = float(df["close"].iloc[-1])
    atr = calculate_indicators(df, ["ATR_14"])["ATR_14"]
    bias = confluence_score(rows)["bias"]
    direction = "BUY" if bias == "BULLISH" else "SELL" if bias == "BEARISH" else "WAIT"
    if direction == "WAIT": return {"direction": direction, "entry": close, "stop_loss": None, "take_profit": None, "risk_reward": risk_reward}
    stop = close - 1.5 * atr if direction == "BUY" else close + 1.5 * atr
    target = close + 1.5 * atr * risk_reward if direction == "BUY" else close - 1.5 * atr * risk_reward
    return {"direction": direction, "entry": close, "stop_loss": stop, "take_profit": target, "risk_reward": risk_reward, "atr": atr}


def analyze(rows: list[dict], lookback: int = 20) -> dict:
    return {"regime": market_regime(rows, lookback), "support_resistance": support_resistance(rows, lookback), "volatility": volatility_profile(rows, lookback), "patterns": candlestick_patterns(rows), "confluence": confluence_score(rows), "trade_plan": trade_plan(rows), "generated_at": datetime.now(timezone.utc).isoformat()}


def _build_indicator_series(df: pd.DataFrame, indicator_name: str) -> pd.Series:
    normalized = df.copy()
    normalized.columns = [str(c).lower() for c in normalized.columns]
    c = _s(normalized, "close")
    h = _s(normalized, "high")
    l = _s(normalized, "low")
    if indicator_name == "RSI_14":
        return _rsi(normalized, 14)
    if indicator_name == "MACD":
        return _macd(normalized)
    if indicator_name == "MACD_SIGNAL":
        return _ema(_macd(normalized), 9)
    if indicator_name == "STOCH_14":
        return _stoch(normalized, 14)
    return c


def divergence(rows: list[dict], indicator: str = "RSI_14", lookback: int = 30) -> dict:
    df = _ohlcv(rows).tail(lookback).reset_index(drop=True)
    if len(df) < 10:
        return {"bullish": False, "bearish": False, "hidden_bullish": False, "hidden_bearish": False}
    ind = _build_indicator_series(df, indicator)
    c = df["close"].astype(float).values
    i = ind.values
    c_minima, c_maxima = _find_local_extrema(c)
    i_minima, i_maxima = _find_local_extrema(i)
    bullish = bearish = hidden_bullish = hidden_bearish = False
    if len(c_minima) >= 2 and len(i_minima) >= 2:
        c1, c2 = c_minima[-2], c_minima[-1]
        if c[c2] < c[c1] and i[c2] > i[c1]:
            bullish = True
        if c[c2] > c[c1] and i[c2] < i[c1]:
            hidden_bullish = True
    if len(c_maxima) >= 2 and len(i_maxima) >= 2:
        c1, c2 = c_maxima[-2], c_maxima[-1]
        if c[c2] > c[c1] and i[c2] < i[c1]:
            bearish = True
        if c[c2] < c[c1] and i[c2] > i[c1]:
            hidden_bearish = True
    return {"bullish": bullish, "bearish": bearish, "hidden_bullish": hidden_bullish, "hidden_bearish": hidden_bearish, "indicator": indicator}


def volume_profile(rows: list[dict], bins: int = 24, lookback: int = 100) -> dict:
    df = _ohlcv(rows).tail(lookback)
    price = ((df["high"] + df["low"] + df["close"]) / 3).astype(float)
    vol = _s(df, "volume") if "volume" in df.columns else pd.Series(np.ones(len(df)), index=df.index)
    counts, edges = np.histogram(price, bins=bins, weights=vol)
    poc_idx = int(np.argmax(counts))
    poc = float((edges[poc_idx] + edges[poc_idx + 1]) / 2)
    vah = float(edges[np.where(np.cumsum(counts) >= 0.7 * counts.sum())[0][0] + 1])
    val = float(edges[np.where(np.cumsum(counts) >= 0.3 * counts.sum())[0][0]])
    return {"poc": poc, "vah": vah, "val": val, "value_area_pct": 70.0, "bins": [{"low": float(edges[i]), "high": float(edges[i + 1]), "volume": float(counts[i])} for i in range(len(counts))]}


def order_blocks(rows: list[dict], lookback: int = 50) -> dict:
    df = _ohlcv(rows).tail(lookback).reset_index(drop=True)
    bullish_blocks, bearish_blocks = [], []
    for i in range(2, len(df) - 1):
        cur = df.iloc[i]
        prev = df.iloc[i - 1]
        prev2 = df.iloc[i - 2]
        if cur["close"] > cur["open"] and prev["close"] < prev["open"] and cur["close"] > prev["high"]:
            bullish_blocks.append({"index": i - 1, "open": float(prev["open"]), "close": float(prev["close"]), "high": float(prev["high"]), "low": float(prev["low"])})
        if cur["close"] < cur["open"] and prev["close"] > prev["open"] and cur["close"] < prev["low"]:
            bearish_blocks.append({"index": i - 1, "open": float(prev["open"]), "close": float(prev["close"]), "high": float(prev["high"]), "low": float(prev["low"])})
    return {"bullish": bullish_blocks[-5:], "bearish": bearish_blocks[-5:]}


def fair_value_gap(rows: list[dict], lookback: int = 30) -> dict:
    df = _ohlcv(rows).tail(lookback).reset_index(drop=True)
    bullish_fvg, bearish_fvg = [], []
    for i in range(2, len(df)):
        prev2, prev, cur = df.iloc[i - 2], df.iloc[i - 1], df.iloc[i]
        if cur["low"] > prev["high"] and prev["low"] > prev2["high"]:
            gap_low, gap_high = prev2["high"], prev["low"]
            if gap_high > gap_low:
                bullish_fvg.append({"start_index": i - 2, "end_index": i, "gap_low": float(gap_low), "gap_high": float(gap_high)})
        if cur["high"] < prev["low"] and prev["high"] < prev2["low"]:
            gap_low, gap_high = prev["high"], prev2["low"]
            if gap_high > gap_low:
                bearish_fvg.append({"start_index": i - 2, "end_index": i, "gap_low": float(gap_low), "gap_high": float(gap_high)})
    return {"bullish": bullish_fvg[-5:], "bearish": bearish_fvg[-5:]}


def liquidity_zones(rows: list[dict], lookback: int = 100) -> dict:
    df = _ohlcv(rows).tail(lookback).reset_index(drop=True)
    highs, lows = df["high"].astype(float).values, df["low"].astype(float).values
    h_minima, h_maxima = _find_local_extrema(highs)
    l_minima, l_maxima = _find_local_extrema(lows)
    resistance_levels = sorted({float(highs[i]) for i in h_maxima}, reverse=True)[:5]
    support_levels = sorted({float(lows[i]) for i in l_minima})[:5]
    return {"resistance_levels": resistance_levels, "support_levels": support_levels}


def _detect_wyckoff_phase(df: pd.DataFrame) -> dict:
    c = df["close"].astype(float).values
    if len(c) < 20:
        return {"phase": "UNKNOWN", "confidence": 0.0}
    lookback = min(40, len(c))
    recent = c[-lookback:]
    returns = np.diff(recent) / recent[:-1]
    vol = np.std(returns)
    slope = np.polyfit(np.arange(len(recent)), recent, 1)[0]
    price_range = (np.max(recent) - np.min(recent)) / np.mean(recent)
    if price_range < 0.03 and vol < 0.005:
        phase = "ACCUMULATION"
        confidence = 0.6
    elif slope > 0 and vol > 0.01:
        phase = "MARKUP"
        confidence = 0.7
    elif price_range < 0.03 and vol < 0.005:
        phase = "DISTRIBUTION"
        confidence = 0.5
    elif slope < 0 and vol > 0.01:
        phase = "MARKDOWN"
        confidence = 0.7
    else:
        phase = "TRANSITION"
        confidence = 0.3
    return {"phase": phase, "confidence": round(float(confidence), 2), "price_range": round(float(price_range), 4), "volatility": round(float(vol), 6)}


def wyckoff_analysis(rows: list[dict], lookback: int = 50) -> dict:
    df = _ohlcv(rows).tail(lookback)
    phase_info = _detect_wyckoff_phase(df)
    return {**phase_info, "lookback": lookback}


def _detect_harmonic_pattern(df: pd.DataFrame) -> dict:
    if len(df) < 10:
        return {"patterns": []}
    h, l = df["high"].astype(float).values, df["low"].astype(float).values
    patterns = []
    n = min(20, len(df) - 1)
    xa = h[-n] - l[-n] if n > 0 else 0.0
    ab = h[-n + 2] - l[-n + 2] if n > 2 else 0.0
    bc = h[-n + 4] - l[-n + 4] if n > 4 else 0.0
    cd = h[-n + 6] - l[-n + 6] if n > 6 else 0.0
    ad = h[-n + 6] - l[-n + 6] if n > 6 else 0.0
    if xa != 0 and ab != 0 and bc != 0:
        ab_xa = abs(ab / xa)
        bc_ab = abs(bc / ab) if ab != 0 else 0
        cd_bc = abs(cd / bc) if bc != 0 else 0
        if 0.618 <= ab_xa <= 0.786 and 0.382 <= bc_ab <= 0.886:
            if cd_bc > 1.618:
                patterns.append({"name": "GARTLEY_BULLISH", "confidence": 0.7, "d_xa_ratio": round(cd / xa, 3) if xa != 0 else 0})
            elif cd_bc < 1.0:
                patterns.append({"name": "GARTLEY_BEARISH", "confidence": 0.6, "d_xa_ratio": round(cd / xa, 3) if xa != 0 else 0})
    return {"patterns": patterns[-3:]}


def harmonic_patterns(rows: list[dict], lookback: int = 50) -> dict:
    df = _ohlcv(rows).tail(lookback)
    return _detect_harmonic_pattern(df)


def _fibonacci_targets(rows: list[dict]) -> dict:
    df = _ohlcv(rows).tail(50)
    swing_high = float(df["high"].max())
    swing_low = float(df["low"].min())
    diff = swing_high - swing_low
    targets = {
        "fib_0": swing_high,
        "fib_236": swing_high - 0.236 * diff,
        "fib_382": swing_high - 0.382 * diff,
        "fib_5": swing_high - 0.5 * diff,
        "fib_618": swing_high - 0.618 * diff,
        "fib_786": swing_high - 0.786 * diff,
        "fib_1": swing_low,
    }
    return targets


def fibonacci_analysis(rows: list[dict], lookback: int = 50) -> dict:
    targets = _fibonacci_targets(rows)
    df = _ohlcv(rows).tail(lookback)
    current = float(df["close"].iloc[-1])
    nearest = min(targets.items(), key=lambda x: abs(x[1] - current))
    return {"swing_high": targets["fib_0"], "swing_low": targets["fib_1"], "current_price": current, "nearest_target": nearest[0], "nearest_price": nearest[1], "targets": targets}


def market_structure(rows: list[dict], lookback: int = 50) -> dict:
    df = _ohlcv(rows).tail(lookback).reset_index(drop=True)
    h, l = df["high"].astype(float).values, df["low"].astype(float).values
    hh_points, ll_points = [], []
    for i in range(2, len(df) - 2):
        if h[i] > h[i - 1] and h[i] > h[i - 2] and h[i] > h[i + 1] and h[i] > h[i + 2]:
            hh_points.append({"index": i, "price": float(h[i])})
        if l[i] < l[i - 1] and l[i] < l[i - 2] and l[i] < l[i + 1] and l[i] < l[i + 2]:
            ll_points.append({"index": i, "price": float(l[i])})
    structure = "BULLISH" if len(hh_points) >= 2 and hh_points[-1]["price"] > hh_points[-2]["price"] else "BEARISH" if len(ll_points) >= 2 and ll_points[-1]["price"] < ll_points[-2]["price"] else "NEUTRAL"
    return {"structure": structure, "higher_highs": hh_points[-5:], "lower_lows": ll_points[-5:], "breakout_strength": len(hh_points) + len(ll_points)}


def advanced_scoring(rows: list[dict], lookback: int = 20) -> dict:
    df = _ohlcv(rows)
    ind_names = ["RSI_14", "MACD", "MACD_SIGNAL", "ADX_14", "BB_PERCENT", "TREND_STRENGTH", "VOLUME_RATIO", "PLUS_DI", "MINUS_DI", "STOCH_14", "SUPERTREND", "ELDER_RAY_BULL_POWER", "ELDER_RAY_BEAR_POWER", "CHOPPINESS_INDEX", "FISHER_TRANSFORM", "Z_SCORE"]
    values = calculate_indicators(df, ind_names)
    bullish_signals = 0
    total_signals = 0
    if values.get("RSI_14", 50) > 50: bullish_signals += 1
    total_signals += 1
    if values.get("MACD", 0) > values.get("MACD_SIGNAL", 0): bullish_signals += 1
    total_signals += 1
    if values.get("ADX_14", 0) > 20: bullish_signals += 1
    total_signals += 1
    if values.get("BB_PERCENT", 0.5) > 0.5: bullish_signals += 1
    total_signals += 1
    if values.get("TREND_STRENGTH", 0) > 0: bullish_signals += 1
    total_signals += 1
    if values.get("VOLUME_RATIO", 1) > 1: bullish_signals += 1
    total_signals += 1
    if values.get("PLUS_DI", 0) > values.get("MINUS_DI", 0): bullish_signals += 1
    total_signals += 1
    if values.get("STOCH_14", 50) > 50: bullish_signals += 1
    total_signals += 1
    if values.get("CHOPPINESS_INDEX", 50) < 50: bullish_signals += 1
    total_signals += 1
    if values.get("FISHER_TRANSFORM", 0) > 0: bullish_signals += 1
    total_signals += 1
    if values.get("ELDER_RAY_BULL_POWER", 0) > 0: bullish_signals += 1
    total_signals += 1
    score = bullish_signals / total_signals if total_signals > 0 else 0.5
    return {"score": round(score, 4), "bullish_signals": bullish_signals, "total_signals": total_signals, "bias": "BULLISH" if score >= 0.6 else "BEARISH" if score <= 0.4 else "NEUTRAL", "indicators": values}


def multi_timeframe_confluence(rows_by_timeframe: dict[str, list[dict]]) -> dict:
    results = {}
    for timeframe, rows in rows_by_timeframe.items():
        if not rows:
            continue
        df = _ohlcv(rows)
        values = calculate_indicators(df, ["RSI_14", "MACD", "MACD_SIGNAL", "ADX_14", "BB_PERCENT", "TREND_STRENGTH", "PLUS_DI", "MINUS_DI"])
        bullish = 0
        bullish += int(values["RSI_14"] > 50)
        bullish += int(values["MACD"] > values["MACD_SIGNAL"])
        bullish += int(values["ADX_14"] > 20)
        bullish += int(values["BB_PERCENT"] > 0.5)
        bullish += int(values["TREND_STRENGTH"] > 0)
        bullish += int(values["PLUS_DI"] > values["MINUS_DI"])
        results[timeframe] = {"score": bullish / 6, "bias": "BULLISH" if bullish >= 4 else "BEARISH" if bullish <= 2 else "NEUTRAL"}
    aligned = sum(1 for r in results.values() if r["bias"] == "BULLISH")
    total = len(results)
    overall = "BULLISH" if aligned == total else "BEARISH" if aligned == 0 else "NEUTRAL"
    return {"timeframes": results, "overall_bias": overall, "alignment_pct": round(aligned / total * 100, 1) if total else 0.0}


def builtin_strategies() -> list[dict[str, Any]]:
    return [
        {"id": "rsi_reversal", "name": "RSI Mean Reversion", "description": "Buy oversold, sell overbought", "entry_rules": [{"indicator": "RSI_14", "operator": "<", "value": 30}], "exit_rules": [{"indicator": "RSI_14", "operator": ">", "value": 70}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "macd_trend", "name": "MACD Trend Following", "description": "Follow MACD signal crossovers", "entry_rules": [{"indicator": "MACD", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "MACD", "operator": "<", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "bb_squeeze", "name": "Bollinger Band Squeeze", "description": "Trade breakout from low volatility", "entry_rules": [{"indicator": "BB_PERCENT", "operator": ">", "value": 0.8}, {"indicator": "VOLATILITY_20", "operator": "<", "value": 0.15}], "exit_rules": [{"indicator": "BB_PERCENT", "operator": "<", "value": 0.2}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.0, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "adx_strength", "name": "ADX Strength Entry", "description": "Only trade strong trends", "entry_rules": [{"indicator": "ADX_14", "operator": ">", "value": 25}, {"indicator": "PLUS_DI", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "ADX_14", "operator": "<", "value": 20}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "ichimoku_trend", "name": "Ichimoku Cloud Trend", "description": "Trade with the cloud direction", "entry_rules": [{"indicator": "TREND_STRENGTH", "operator": ">", "value": 0.001}], "exit_rules": [{"indicator": "TREND_STRENGTH", "operator": "<", "value": -0.001}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "confluence_8", "name": "8-Indicator Confluence", "description": "High-confidence confluence filter", "entry_rules": [{"indicator": "RSI_14", "operator": ">", "value": 50}, {"indicator": "MACD", "operator": ">", "value": 0}, {"indicator": "ADX_14", "operator": ">", "value": 20}, {"indicator": "BB_PERCENT", "operator": ">", "value": 0.5}, {"indicator": "STOCH_14", "operator": ">", "value": 50}, {"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.0}, {"indicator": "TREND_STRENGTH", "operator": ">", "value": 0}, {"indicator": "PLUS_DI", "operator": ">", "value": "MINUS_DI"}], "exit_rules": [{"indicator": "RSI_14", "operator": "<", "value": 45}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "supertrend_follow", "name": "SuperTrend Follow", "description": "Follow SuperTrend direction", "entry_rules": [{"indicator": "SUPERTREND", "operator": "<", "value": 0}], "exit_rules": [{"indicator": "SUPERTREND", "operator": ">", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "elder_ray", "name": "Elder Ray Power", "description": "Bull/Bear power crossover", "entry_rules": [{"indicator": "ELDER_RAY_BULL_POWER", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "ELDER_RAY_BULL_POWER", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "choppiness_reversal", "name": "Choppiness Reversal", "description": "Enter when market is consolidating", "entry_rules": [{"indicator": "CHOPPINESS_INDEX", "operator": "<", "value": 40}, {"indicator": "RSI_14", "operator": ">", "value": 55}], "exit_rules": [{"indicator": "CHOPPINESS_INDEX", "operator": ">", "value": 60}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.0, "take_profit_multiple": 1.5, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "fisher_zscore", "name": "Fisher + Z-Score", "description": "Fisher transform with Z-score filter", "entry_rules": [{"indicator": "FISHER_TRANSFORM", "operator": ">", "value": 0}, {"indicator": "Z_SCORE", "operator": ">", "value": 1.0}], "exit_rules": [{"indicator": "FISHER_TRANSFORM", "operator": "<", "value": -0.5}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.0, "take_profit_multiple": 1.5, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "volume_breakout", "name": "Volume Breakout", "description": "High volume breakout strategy", "entry_rules": [{"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.5}, {"indicator": "BB_PERCENT", "operator": ">", "value": 0.9}], "exit_rules": [{"indicator": "VOLUME_RATIO", "operator": "<", "value": 0.7}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "heikin_ashi_trend", "name": "Heikin-Ashi Trend Ride", "description": "Ride a smoothed Heikin-Ashi trend while it stays clean of reversal candles", "entry_rules": [{"indicator": "HEIKIN_ASHI_TREND", "operator": ">", "value": 0}, {"indicator": "ADX_14", "operator": ">", "value": 18}], "exit_rules": [{"indicator": "HEIKIN_ASHI_TREND", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "camarilla_breakout", "name": "Camarilla R3/S3 Breakout", "description": "Trade breakouts through the Camarilla R3/S3 breakout trigger levels", "entry_rules": [{"indicator": "CAMARILLA_R3", "operator": "<", "value": "CLOSE"}, {"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.2}], "exit_rules": [{"indicator": "CAMARILLA_R4", "operator": "<", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "woodie_pivot_reversal", "name": "Woodie Pivot Reversal", "description": "Fade price extremes back toward the Woodie pivot", "entry_rules": [{"indicator": "RSI_14", "operator": "<", "value": 35}, {"indicator": "WOODIE_S1", "operator": ">", "value": "LOW"}], "exit_rules": [{"indicator": "RSI_14", "operator": ">", "value": 55}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.0, "take_profit_multiple": 1.8, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "chandelier_trend_exit", "name": "Chandelier Trend Exit", "description": "Ride ADX-confirmed trends and let the Chandelier Exit trail the stop", "entry_rules": [{"indicator": "ADX_14", "operator": ">", "value": 22}, {"indicator": "PLUS_DI", "operator": ">", "value": "MINUS_DI"}], "exit_rules": [{"indicator": "CHANDELIER_LONG", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 3.0, "take_profit_multiple": 4.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "cci_extreme_reversal", "name": "CCI Extreme Reversal", "description": "Fade CCI readings beyond +/-100 back toward the mean", "entry_rules": [{"indicator": "CCI_20", "operator": "<", "value": -100}], "exit_rules": [{"indicator": "CCI_20", "operator": ">", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "mfi_volume_reversal", "name": "MFI Volume Reversal", "description": "Volume-weighted RSI (MFI) oversold reversal", "entry_rules": [{"indicator": "MFI_14", "operator": "<", "value": 20}], "exit_rules": [{"indicator": "MFI_14", "operator": ">", "value": 60}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "hurst_trend_persistence", "name": "Hurst Trend Persistence", "description": "Only trade with trend-strength confirmation when Hurst exponent signals persistence (H > 0.5)", "entry_rules": [{"indicator": "HURST_EXPONENT", "operator": ">", "value": 0.55}, {"indicator": "TREND_STRENGTH", "operator": ">", "value": 0.3}], "exit_rules": [{"indicator": "HURST_EXPONENT", "operator": "<", "value": 0.45}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "liquidity_sweep_reversal", "name": "Liquidity Sweep Reversal", "description": "Enter after a stop-hunt sweep of a prior high/low that immediately reverses back inside the range", "entry_rules": [{"indicator": "LIQUIDITY_SWEEP", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "LIQUIDITY_SWEEP", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.0, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "vortex_trend_cross", "name": "Vortex Trend Cross", "description": "Trade Vortex+/Vortex- crossovers combined with ADX trend confirmation", "entry_rules": [{"indicator": "VORTEX_PLUS", "operator": ">", "value": "VORTEX_MINUS"}, {"indicator": "ADX_14", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "VORTEX_PLUS", "operator": "<", "value": "VORTEX_MINUS"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "rsi_regular_divergence_v2", "name": "RSI Regular Divergence (Confirmed)", "description": "Regular RSI divergence entry confirmed by RSI slope turning", "entry_rules": [{"indicator": "RSI_DIVERGENCE_BULLISH", "operator": ">", "value": 0}, {"indicator": "RSI_SLOPE", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "RSI_14", "operator": ">", "value": 65}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "hidden_macd_divergence_v2", "name": "Hidden MACD Divergence (Trend Continuation)", "description": "Hidden MACD bullish divergence used as a trend-continuation entry, not a reversal", "entry_rules": [{"indicator": "HIDDEN_MACD_DIVERGENCE_BULLISH", "operator": ">", "value": 0}, {"indicator": "TREND_STRENGTH", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "HIDDEN_MACD_DIVERGENCE_BULLISH", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "obv_price_divergence", "name": "OBV/Price Divergence", "description": "Volume-flow (OBV) diverging from price -- fades exhausted moves not confirmed by volume", "entry_rules": [{"indicator": "RSI_DIVERGENCE_BULLISH", "operator": ">=", "value": 0}, {"indicator": "VOLUME_RATIO", "operator": "<", "value": 0.9}], "exit_rules": [{"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.3}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        # --- Additional strategies (added this session, "advanced_brain" pass) ---
        {"id": "kst_trend_cross", "name": "KST Trend Cross", "description": "Know Sure Thing composite momentum oscillator turning positive with ADX confirmation", "entry_rules": [{"indicator": "KST", "operator": ">", "value": 0}, {"indicator": "ADX_14", "operator": ">", "value": 18}], "exit_rules": [{"indicator": "KST", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "coppock_curve_bottom", "name": "Coppock Curve Bottom", "description": "Long-term momentum trough signal (Coppock) confirmed by RSI recovering from oversold", "entry_rules": [{"indicator": "COPPOCK", "operator": ">", "value": 0}, {"indicator": "RSI_14", "operator": ">", "value": 40}], "exit_rules": [{"indicator": "COPPOCK", "operator": "<", "value": -5}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "tsi_momentum_shift", "name": "TSI Momentum Shift", "description": "True Strength Index crossing positive alongside rising trend strength", "entry_rules": [{"indicator": "TSI", "operator": ">", "value": 0}, {"indicator": "TREND_STRENGTH", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "TSI", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "stc_cycle_turn", "name": "Schaff Trend Cycle Turn", "description": "STC oscillator emerging from an oversold cycle trough", "entry_rules": [{"indicator": "STC", "operator": ">", "value": 25}, {"indicator": "MACD", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "STC", "operator": "<", "value": 75}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "dpo_cycle_reversal", "name": "Detrended Price Oscillator Reversal", "description": "DPO crossing above zero signals a short-term cyclical low forming", "entry_rules": [{"indicator": "DPO", "operator": ">", "value": 0}, {"indicator": "RSI_14", "operator": "<", "value": 60}], "exit_rules": [{"indicator": "DPO", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.2, "take_profit_multiple": 1.8, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "rvi_signal_cross", "name": "Relative Vigor Index Cross", "description": "RVI confirming price momentum with volatility-weighted close location", "entry_rules": [{"indicator": "RVI", "operator": ">", "value": 50}, {"indicator": "BB_PERCENT", "operator": ">", "value": 0.4}], "exit_rules": [{"indicator": "RVI", "operator": "<", "value": 40}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "ultimate_oscillator_divergence", "name": "Ultimate Oscillator Reversal", "description": "Multi-timeframe-weighted Ultimate Oscillator recovering from an oversold extreme", "entry_rules": [{"indicator": "ULTIMATE_OSC", "operator": ">", "value": 30}, {"indicator": "STOCH_14", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "ULTIMATE_OSC", "operator": ">", "value": 70}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "aroon_new_trend", "name": "Aroon New Trend", "description": "Aroon Up dominating Aroon Down signals a freshly-established uptrend", "entry_rules": [{"indicator": "AROON_UP", "operator": ">", "value": 70}, {"indicator": "AROON_DOWN", "operator": "<", "value": 30}], "exit_rules": [{"indicator": "AROON_OSC", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.8, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "ichimoku_kumo_breakout", "name": "Ichimoku Kumo Breakout", "description": "Price breaking above both the conversion and base line (proxy for a Kumo/cloud breakout)", "entry_rules": [{"indicator": "ICHIMOKU_CONVERSION", "operator": "<", "value": "CLOSE"}, {"indicator": "ICHIMOKU_CONVERSION", "operator": ">", "value": "ICHIMOKU_BASE"}], "exit_rules": [{"indicator": "ICHIMOKU_BASE", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "psar_flip_trend", "name": "Parabolic SAR Flip", "description": "Trade the trend once price clears the Parabolic SAR stop-and-reverse level", "entry_rules": [{"indicator": "PSAR", "operator": "<", "value": "CLOSE"}, {"indicator": "ADX_14", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "PSAR", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "keltner_channel_breakout", "name": "Keltner Channel Breakout", "description": "Trade a volatility-expansion breakout through the upper Keltner Channel", "entry_rules": [{"indicator": "KC_UPPER", "operator": "<", "value": "CLOSE"}, {"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.1}], "exit_rules": [{"indicator": "KC_MIDDLE", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "donchian_channel_breakout", "name": "Donchian Channel Breakout", "description": "Classic turtle-trader breakout through the rolling Donchian high", "entry_rules": [{"indicator": "DONCHIAN_UPPER", "operator": "<=", "value": "CLOSE"}], "exit_rules": [{"indicator": "DONCHIAN_MIDDLE", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 2.0, "take_profit_multiple": 3.0, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "vwap_reversion", "name": "VWAP Mean Reversion", "description": "Fade extended moves back toward the session VWAP anchor", "entry_rules": [{"indicator": "VWAP_DISTANCE", "operator": "<", "value": 0}, {"indicator": "RSI_14", "operator": "<", "value": 40}], "exit_rules": [{"indicator": "VWAP_DISTANCE", "operator": ">", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.2, "take_profit_multiple": 1.8, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "fisher_transform_extreme", "name": "Fisher Transform Extreme Reversal", "description": "Fisher Transform sharp turn from an extreme reading, a classic Ehlers reversal signal", "entry_rules": [{"indicator": "FISHER_TRANSFORM", "operator": ">", "value": -1.5}, {"indicator": "FISHER_TRANSFORM", "operator": "<", "value": 0}], "exit_rules": [{"indicator": "FISHER_TRANSFORM", "operator": ">", "value": 1.0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "stoch_rsi_double_confirm", "name": "Stochastic RSI Double Confirmation", "description": "Stochastic RSI recovering from oversold while RSI itself confirms momentum", "entry_rules": [{"indicator": "STOCH_RSI", "operator": ">", "value": 20}, {"indicator": "RSI_14", "operator": ">", "value": 45}], "exit_rules": [{"indicator": "STOCH_RSI", "operator": ">", "value": 85}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "trix_zero_cross", "name": "TRIX Zero-Line Cross", "description": "Triple-smoothed EMA rate-of-change (TRIX) crossing above zero", "entry_rules": [{"indicator": "TRIX", "operator": ">", "value": 0}, {"indicator": "EMA_20", "operator": ">", "value": "EMA_50"}], "exit_rules": [{"indicator": "TRIX", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "roc_acceleration", "name": "Rate-of-Change Acceleration", "description": "Multi-period ROC alignment (5/10/20 all positive) confirming accelerating momentum", "entry_rules": [{"indicator": "ROC_5", "operator": ">", "value": 0}, {"indicator": "ROC_10", "operator": ">", "value": 0}, {"indicator": "ROC_20", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "ROC_5", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "balance_of_power_shift", "name": "Balance of Power Shift", "description": "Balance of Power turning positive, indicating buyers regaining intrabar control", "entry_rules": [{"indicator": "BOP", "operator": ">", "value": 0.1}, {"indicator": "VOLUME_RATIO", "operator": ">", "value": 0.9}], "exit_rules": [{"indicator": "BOP", "operator": "<", "value": -0.1}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 1.8, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "ulcer_index_calm_entry", "name": "Ulcer Index Low-Stress Entry", "description": "Only enter trend trades when the Ulcer Index shows low recent drawdown stress", "entry_rules": [{"indicator": "ULCER_INDEX", "operator": "<", "value": 2.0}, {"indicator": "MACD", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "ULCER_INDEX", "operator": ">", "value": 5.0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "entropy_regime_filter", "name": "Entropy Regime Filter", "description": "Only take trend trades when Shannon entropy of returns is low (orderly, non-random market)", "entry_rules": [{"indicator": "ENTROPY", "operator": "<", "value": 0.85}, {"indicator": "ADX_14", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "ENTROPY", "operator": ">", "value": 0.95}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.8, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "kama_adaptive_trend", "name": "KAMA Adaptive Trend", "description": "Kaufman Adaptive Moving Average trend-follow -- adapts automatically to changing volatility", "entry_rules": [{"indicator": "KAMA_20", "operator": "<", "value": "CLOSE"}, {"indicator": "TREND_STRENGTH", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "KAMA_20", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "hull_ma_momentum", "name": "Hull Moving Average Momentum", "description": "Low-lag Hull MA crossover for faster trend entries than a standard EMA", "entry_rules": [{"indicator": "HMA_20", "operator": "<", "value": "CLOSE"}, {"indicator": "RSI_14", "operator": ">", "value": 50}], "exit_rules": [{"indicator": "HMA_20", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "hidden_rsi_divergence_v2", "name": "Hidden RSI Divergence (Trend Continuation)", "description": "Hidden bullish RSI divergence used as a pullback-buy in an established uptrend", "entry_rules": [{"indicator": "HIDDEN_RSI_DIVERGENCE_BULLISH", "operator": ">", "value": 0}, {"indicator": "EMA_20", "operator": ">", "value": "EMA_50"}], "exit_rules": [{"indicator": "HIDDEN_RSI_DIVERGENCE_BULLISH", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.8, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "macd_divergence_confluence", "name": "MACD Divergence Confluence", "description": "Regular bullish MACD divergence confirmed by an oversold RSI reading for extra confidence", "entry_rules": [{"indicator": "MACD_DIVERGENCE_BULLISH", "operator": ">", "value": 0}, {"indicator": "RSI_14", "operator": "<", "value": 45}], "exit_rules": [{"indicator": "MACD_DIVERGENCE_BEARISH", "operator": ">", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.8, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "elder_ray_supertrend_combo", "name": "Elder Ray + SuperTrend Combo", "description": "Requires both Elder Ray bull power and SuperTrend direction to agree before entry", "entry_rules": [{"indicator": "ELDER_RAY_BULL_POWER", "operator": ">", "value": 0}, {"indicator": "SUPERTREND", "operator": "<", "value": 0}], "exit_rules": [{"indicator": "ELDER_RAY_BULL_POWER", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.5, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "range_position_breakout", "name": "Range Position Breakout", "description": "Price closing near the top of its recent high/low range with volume confirmation", "entry_rules": [{"indicator": "RANGE_POSITION", "operator": ">", "value": 0.85}, {"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.1}], "exit_rules": [{"indicator": "RANGE_POSITION", "operator": "<", "value": 0.4}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "mean_reversion_zscore", "name": "Mean Reversion Z-Score Fade", "description": "Fade a statistically extreme deviation (Z-score) back toward the mean", "entry_rules": [{"indicator": "MEAN_REVERSION_Z", "operator": "<", "value": -1.8}], "exit_rules": [{"indicator": "MEAN_REVERSION_Z", "operator": ">", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        # --- Fourth-generation strategies (2026-08 revision 4), built on the
        # properly-implemented indicators (TSI, STC, RMI_14, VORTEX_*, DX,
        # SMI_ERGODIC, CG_OSCILLATOR, FRAMA_DISTANCE, and friends) ---
        {"id": "tsi_momentum_ignition", "name": "TSI Momentum Ignition", "description": "Proper double-smoothed True Strength Index crossing positive with RMI confirmation", "entry_rules": [{"indicator": "TSI", "operator": ">", "value": 0}, {"indicator": "RMI_14", "operator": ">", "value": 50}], "exit_rules": [{"indicator": "TSI", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.6, "take_profit_multiple": 2.4, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "vortex_dx_trend_start", "name": "Vortex + DX Trend Start", "description": "Vortex +VI dominating -VI while the Directional Index confirms a genuine directional move", "entry_rules": [{"indicator": "VORTEX_PLUS", "operator": ">", "value": "VORTEX_MINUS"}, {"indicator": "DX", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "VORTEX_PLUS", "operator": "<", "value": "VORTEX_MINUS"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.6, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "schaff_cycle_swing", "name": "Schaff Cycle Swing", "description": "Buy the Schaff Trend Cycle emerging from its oversold cycle trough (<20)", "entry_rules": [{"indicator": "STC", "operator": "<", "value": 20}, {"indicator": "MACD", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "STC", "operator": ">", "value": 80}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "rmi_trend_pullback", "name": "RMI Trend Pullback", "description": "Buy a pullback in an established uptrend when the Relative Momentum Index dips below 40", "entry_rules": [{"indicator": "RMI_14", "operator": "<", "value": 40}, {"indicator": "EMA_20", "operator": ">", "value": "EMA_50"}], "exit_rules": [{"indicator": "RMI_14", "operator": ">", "value": 70}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "psychological_line_extreme", "name": "Psychological Line Extreme", "description": "Crowd-sentiment contrarian entry when the percentage of up-closes collapses below 25%", "entry_rules": [{"indicator": "PSYCHOLOGICAL_LINE_14", "operator": "<", "value": 25}, {"indicator": "ADX_14", "operator": "<", "value": 30}], "exit_rules": [{"indicator": "PSYCHOLOGICAL_LINE_14", "operator": ">", "value": 60}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.4, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "disparity_extension_fade", "name": "Disparity Extension Fade", "description": "Fade moves stretched more than 2 percent below the 20-bar SMA back toward fair value", "entry_rules": [{"indicator": "DISPARITY_INDEX_20", "operator": "<", "value": -2.0}, {"indicator": "RSI_14", "operator": "<", "value": 45}], "exit_rules": [{"indicator": "DISPARITY_INDEX_20", "operator": ">", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 1.8, "risk_per_trade_pct": 0.5, "max_bars_in_trade": 0},
        {"id": "thermometer_breakout", "name": "Thermometer Breakout", "description": "Elder Market Thermometer escape attempt (>1.2x ATR bar range) pushing through the upper Bollinger band", "entry_rules": [{"indicator": "ELDER_THERMOMETER", "operator": ">", "value": 1.2}, {"indicator": "BB_PERCENT", "operator": ">", "value": 0.8}], "exit_rules": [{"indicator": "ELDER_THERMOMETER", "operator": "<", "value": 0.6}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 12},
        {"id": "chande_kroll_band_breakout", "name": "Chande Kroll Band Breakout", "description": "Close breaking above the Chande Kroll short-stop band with ADX trend confirmation", "entry_rules": [{"indicator": "CHANDE_KROLL_SHORT", "operator": "<", "value": "CLOSE"}, {"indicator": "ADX_14", "operator": ">", "value": 18}], "exit_rules": [{"indicator": "CHANDE_KROLL_LONG", "operator": ">", "value": "CLOSE"}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.8, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "frama_adaptive_follow", "name": "FRAMA Adaptive Follow", "description": "Follow Ehlers' fractal-adaptive average: price above FRAMA with ADX confirming trend quality", "entry_rules": [{"indicator": "FRAMA_DISTANCE", "operator": ">", "value": 0}, {"indicator": "ADX_14", "operator": ">", "value": 20}], "exit_rules": [{"indicator": "FRAMA_DISTANCE", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.8, "take_profit_multiple": 2.6, "risk_per_trade_pct": 1.0, "max_bars_in_trade": 0},
        {"id": "smi_cg_dual_oscillator", "name": "SMI Ergodic + CG Dual Oscillator", "description": "Two independent Ehlers-family oscillators (SMI Ergodic and Center of Gravity) agreeing on momentum direction", "entry_rules": [{"indicator": "SMI_ERGODIC", "operator": ">", "value": 0}, {"indicator": "CG_OSCILLATOR", "operator": ">", "value": 0}], "exit_rules": [{"indicator": "SMI_ERGODIC", "operator": "<", "value": 0}], "logic": "AND", "direction": "AUTO", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "stoch_rsi_oversold_double", "name": "Stoch RSI Oversold Double", "description": "Stochastic-of-RSI recovering from below 20 while raw RSI is still sub-45 -- early reversal catch", "entry_rules": [{"indicator": "STOCH_RSI", "operator": "<", "value": 20}, {"indicator": "RSI_14", "operator": "<", "value": 45}], "exit_rules": [{"indicator": "STOCH_RSI", "operator": ">", "value": 80}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.3, "take_profit_multiple": 2.0, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
        {"id": "eom_volume_surge", "name": "Ease of Movement Surge", "description": "Price advancing easily relative to normalized volume with above-average participation", "entry_rules": [{"indicator": "EASE_OF_MOVEMENT", "operator": ">", "value": 0}, {"indicator": "VOLUME_RATIO", "operator": ">", "value": 1.2}], "exit_rules": [{"indicator": "EASE_OF_MOVEMENT", "operator": "<", "value": 0}], "logic": "AND", "direction": "BUY", "atr_stop_multiple": 1.5, "take_profit_multiple": 2.2, "risk_per_trade_pct": 0.75, "max_bars_in_trade": 0},
    ]
