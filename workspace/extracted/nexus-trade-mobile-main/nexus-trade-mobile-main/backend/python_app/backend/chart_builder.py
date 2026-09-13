"""
Chart data builder — assembles OHLCV candles with a full technical-analysis
overlay (moving averages, oscillators, volatility bands, support/resistance,
supply/demand zones, trend lines) plus trade markers for the mobile chart
screen.

Everything here is read-only and pure-function style: it takes a price
DataFrame and returns plain-JSON-serializable dicts, so the FastAPI route
handler stays a thin wrapper.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from analytics.ind_trend import sma, ema, macd as macd_calc, atr as atr_calc
from analytics.ind_momentum import rsi as rsi_calc
from analytics.ind_volatility import bollinger_bands
from analytics.ind_advanced import swing_points


def _clean(value: Any) -> Optional[float]:
    """NaN/inf -> None so the payload survives strict JSON encoding."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, 6)


def _series_points(index: pd.Index, series: pd.Series) -> List[Dict[str, Any]]:
    out = []
    for ts, val in zip(index, series.values):
        cleaned = _clean(val)
        if cleaned is None:
            continue
        out.append({"t": ts.isoformat(), "v": cleaned})
    return out


def _detect_support_resistance(df: pd.DataFrame, lookback: int = 3,
                                max_levels: int = 6) -> Dict[str, List[float]]:
    """Cluster recent swing highs/lows into horizontal support/resistance
    levels using ATR-relative tolerance so nearby swings merge."""
    if len(df) < lookback * 2 + 5:
        return {"support": [], "resistance": []}

    swings = swing_points(df, lookback)
    highs = df["high"].where(swings["swing_high"]).dropna()
    lows = df["low"].where(swings["swing_low"]).dropna()

    tr = (df["high"] - df["low"]).rolling(14).mean()
    tol = float(tr.iloc[-1]) * 0.5 if np.isfinite(tr.iloc[-1]) else (df["close"].iloc[-1] * 0.001)
    tol = max(tol, df["close"].iloc[-1] * 0.0005)

    def _cluster(values: pd.Series) -> List[float]:
        levels: List[float] = []
        for v in sorted(values.values, reverse=True):
            if not levels or all(abs(v - lvl) > tol for lvl in levels):
                levels.append(float(v))
            if len(levels) >= max_levels:
                break
        return levels

    return {
        "resistance": _cluster(highs.tail(60)),
        "support": _cluster(lows.tail(60)),
    }


def _detect_supply_demand_zones(df: pd.DataFrame, lookback: int = 80,
                                 max_zones: int = 4) -> List[Dict[str, Any]]:
    """A supply/demand zone is the small consolidation range just before a
    strong directional displacement candle (body > 1.5x local ATR) — the
    same "origin of the move" concept used by SMC/order-block traders,
    simplified to a price band the chart can shade."""
    if len(df) < 20:
        return []

    window = df.tail(lookback)
    tr = (window["high"] - window["low"])
    atr_series = tr.rolling(14).mean()

    zones: List[Dict[str, Any]] = []
    idx = window.index
    for i in range(2, len(window)):
        row = window.iloc[i]
        prev = window.iloc[i - 1]
        prev_ts = idx[i - 1]
        a = atr_series.iloc[i]
        if not np.isfinite(a) or a <= 0:
            continue
        body = abs(row["close"] - row["open"])
        if body < 1.5 * a:
            continue
        base_top = float(max(prev["open"], prev["close"]))
        base_bottom = float(min(prev["open"], prev["close"]))
        is_demand = row["close"] > row["open"]
        zones.append({
            "kind": "demand" if is_demand else "supply",
            "top": base_top,
            "bottom": base_bottom,
            "t": prev_ts.isoformat() if hasattr(prev_ts, "isoformat") else str(prev_ts),
        })

    # Keep the most recent, de-duplicated zones (nearest to current price first)
    last_price = float(df["close"].iloc[-1])
    zones.sort(key=lambda z: abs(((z["top"] + z["bottom"]) / 2) - last_price))
    deduped: List[Dict[str, Any]] = []
    for z in zones:
        mid = (z["top"] + z["bottom"]) / 2
        if any(abs(mid - (d["top"] + d["bottom"]) / 2) < (last_price * 0.001) for d in deduped):
            continue
        deduped.append(z)
        if len(deduped) >= max_zones:
            break
    return deduped


def _detect_trend_lines(df: pd.DataFrame, lookback: int = 60) -> List[Dict[str, Any]]:
    """Fits a simple linear regression trend line through recent swing highs
    (resistance trend line) and swing lows (support trend line). Returned as
    two endpoints each so the client can draw a straight line."""
    if len(df) < lookback:
        return []
    window = df.tail(lookback)
    window_index = window.index
    swings = swing_points(window, 2)
    lines: List[Dict[str, Any]] = []

    def _ts_iso(ts: Any) -> str:
        return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)

    def _fit(mask: pd.Series, col: str, kind: str):
        mask_vals = mask.values
        pts = window[mask_vals]
        if len(pts) < 2:
            return
        x = np.arange(len(window))[mask_vals]
        y = pts[col].values
        slope, intercept = np.polyfit(x, y, 1)
        x0, x1 = 0, len(window) - 1
        lines.append({
            "kind": kind,
            "from": {"t": _ts_iso(window_index[x0]), "v": _clean(slope * x0 + intercept)},
            "to": {"t": _ts_iso(window_index[x1]), "v": _clean(slope * x1 + intercept)},
        })

    _fit(swings["swing_high"], "high", "resistance_trend")
    _fit(swings["swing_low"], "low", "support_trend")
    return lines


INDICATOR_BUILDERS = {
    "ema", "sma", "rsi", "macd", "bollinger", "atr", "volume",
}


def build_chart_payload(df: pd.DataFrame, symbol: str, timeframe: str,
                         source: str, indicators: List[str],
                         markers: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Assembles the full chart payload: candles + requested indicator
    overlays + structural annotations (S/R, supply/demand, trend lines)."""
    requested = {i.strip().lower() for i in indicators if i.strip()}
    if not requested:
        requested = INDICATOR_BUILDERS

    candles = [
        {
            "t": idx.isoformat(),
            "o": _clean(row.open), "h": _clean(row.high),
            "l": _clean(row.low), "c": _clean(row.close),
            "v": _clean(row.volume),
        }
        for idx, row in df.iterrows()
    ]

    payload: Dict[str, Any] = {
        "symbol": symbol,
        "timeframe": timeframe,
        "source": source,
        "candles": candles,
        "indicators": {},
        "support_resistance": _detect_support_resistance(df),
        "supply_demand_zones": _detect_supply_demand_zones(df),
        "trend_lines": _detect_trend_lines(df),
        "markers": markers or [],
    }

    close = df["close"]

    if "ema" in requested:
        payload["indicators"]["ema20"] = _series_points(df.index, ema(close, 20))
        payload["indicators"]["ema50"] = _series_points(df.index, ema(close, 50))
        payload["indicators"]["ema200"] = _series_points(df.index, ema(close, 200))

    if "sma" in requested:
        payload["indicators"]["sma20"] = _series_points(df.index, sma(close, 20))
        payload["indicators"]["sma50"] = _series_points(df.index, sma(close, 50))

    if "rsi" in requested:
        payload["indicators"]["rsi14"] = _series_points(df.index, rsi_calc(close, 14))

    if "macd" in requested:
        macd_df = macd_calc(close)
        payload["indicators"]["macd"] = _series_points(df.index, macd_df["macd"])
        payload["indicators"]["macd_signal"] = _series_points(df.index, macd_df["signal"])
        payload["indicators"]["macd_histogram"] = _series_points(df.index, macd_df["histogram"])

    if "bollinger" in requested:
        bb = bollinger_bands(close)
        payload["indicators"]["bb_upper"] = _series_points(df.index, bb["upper"])
        payload["indicators"]["bb_middle"] = _series_points(df.index, bb["middle"])
        payload["indicators"]["bb_lower"] = _series_points(df.index, bb["lower"])

    if "atr" in requested:
        payload["indicators"]["atr14"] = _series_points(df.index, atr_calc(df, 14))

    if "volume" in requested:
        payload["indicators"]["volume"] = _series_points(df.index, df["volume"])

    return payload
