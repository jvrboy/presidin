from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd


def normalize_order_book(book: dict[str, Any]) -> dict[str, Any]:
    bids = sorted([(float(level[0]), float(level[1])) for level in book.get("bids", [])], key=lambda x: x[0], reverse=True)
    asks = sorted([(float(level[0]), float(level[1])) for level in book.get("asks", [])], key=lambda x: x[0])
    if not bids or not asks:
        raise ValueError("order book requires non-empty bids and asks")
    return {"bids": bids, "asks": asks, "timestamp": book.get("timestamp")}


def order_book_features(book: dict[str, Any], levels: int = 10) -> dict[str, Any]:
    normalized = normalize_order_book(book)
    bids, asks = normalized["bids"][:levels], normalized["asks"][:levels]
    best_bid, best_ask = bids[0][0], asks[0][0]
    bid_depth, ask_depth = sum(size for _, size in bids), sum(size for _, size in asks)
    mid = (best_bid + best_ask) / 2
    spread = best_ask - best_bid
    microprice = (best_ask * bid_depth + best_bid * ask_depth) / max(bid_depth + ask_depth, 1e-12)
    imbalance = (bid_depth - ask_depth) / max(bid_depth + ask_depth, 1e-12)
    bid_slope = (bids[-1][1] - bids[0][1]) / max(abs(bids[-1][0] - bids[0][0]), 1e-12) if len(bids) > 1 else 0.0
    ask_slope = (asks[-1][1] - asks[0][1]) / max(abs(asks[-1][0] - asks[0][0]), 1e-12) if len(asks) > 1 else 0.0
    return {"best_bid": best_bid, "best_ask": best_ask, "mid_price": mid, "spread": spread, "spread_bps": spread / max(mid, 1e-12) * 10000, "microprice": microprice, "bid_depth": bid_depth, "ask_depth": ask_depth, "depth_imbalance": imbalance, "bid_slope": bid_slope, "ask_slope": ask_slope, "pressure": "BUY" if imbalance > 0.1 else "SELL" if imbalance < -0.1 else "BALANCED", "levels": levels}


def volume_profile(frame: pd.DataFrame, bins: int = 30) -> dict[str, Any]:
    if bins < 5:
        raise ValueError("bins must be at least 5")
    df = frame.copy()
    required = {"high", "low", "close", "volume"}
    if not required.issubset({str(c).lower() for c in df.columns}):
        raise ValueError("volume profile requires high, low, close, and volume")
    df.columns = [str(c).lower() for c in df.columns]
    price = (df["high"] + df["low"] + df["close"]) / 3
    volume = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
    edges = np.linspace(float(price.min()), float(price.max()), bins + 1)
    bucket = np.clip(np.digitize(price, edges) - 1, 0, bins - 1)
    profile = np.bincount(bucket, weights=volume, minlength=bins)
    centers = (edges[:-1] + edges[1:]) / 2
    poc_index = int(np.argmax(profile))
    total = float(profile.sum())
    order = np.argsort(profile)[::-1]
    chosen, accumulated = [], 0.0
    for index in order:
        chosen.append(int(index)); accumulated += float(profile[index])
        if accumulated >= total * 0.7: break
    return {"poc": float(centers[poc_index]), "value_area_high": float(max(centers[index] for index in chosen)), "value_area_low": float(min(centers[index] for index in chosen)), "total_volume": total, "bins": [{"price": float(centers[i]), "volume": float(profile[i])} for i in range(bins)], "high_volume_nodes": [float(centers[i]) for i in order[:min(5, len(order))]], "low_volume_nodes": [float(centers[i]) for i in np.argsort(profile)[:min(5, len(order))]]}


def order_flow(frame: pd.DataFrame, lookback: int = 50) -> dict[str, Any]:
    df = frame.copy(); df.columns = [str(c).lower() for c in df.columns]
    close, high, low = df["close"].astype(float), df["high"].astype(float), df["low"].astype(float)
    volume = df.get("volume", pd.Series(1.0, index=df.index)).astype(float).fillna(0)
    signed = ((2 * close - high - low) / (high - low).replace(0, np.nan)).fillna(0) * volume
    recent = signed.tail(lookback)
    delta = float(recent.sum())
    return {"buy_volume": float(recent.clip(lower=0).sum()), "sell_volume": float(abs(recent.clip(upper=0).sum())), "delta": delta, "cumulative_delta": float(signed.cumsum().iloc[-1]), "delta_trend": "BUYING" if delta > 0 else "SELLING" if delta < 0 else "NEUTRAL", "imbalance_ratio": float(delta / max(recent.abs().sum(), 1e-12))}


def market_profile(frame: pd.DataFrame, bins: int = 30) -> dict[str, Any]:
    df = frame.copy(); df.columns = [str(c).lower() for c in df.columns]
    typical = (df["high"] + df["low"] + df["close"]) / 3
    edges = np.linspace(float(typical.min()), float(typical.max()), bins + 1)
    counts = np.bincount(np.clip(np.digitize(typical, edges) - 1, 0, bins - 1), minlength=bins)
    centers = (edges[:-1] + edges[1:]) / 2
    poc = int(np.argmax(counts)); total = counts.sum(); value = np.where(np.cumsum(np.sort(counts)[::-1]) <= total * 0.7)[0]
    return {"tpo_poc": float(centers[poc]), "tpo_count": int(counts[poc]), "value_area_high": float(centers[min(bins - 1, poc + max(1, len(value) // 2))]), "value_area_low": float(centers[max(0, poc - max(1, len(value) // 2))]), "distribution": [{"price": float(centers[i]), "tpo": int(counts[i])} for i in range(bins)]}


def liquidity_map(frame: pd.DataFrame, window: int = 5) -> dict[str, Any]:
    df = frame.copy(); df.columns = [str(c).lower() for c in df.columns]
    high, low, close = df["high"].astype(float), df["low"].astype(float), df["close"].astype(float)
    swing_high = high[(high == high.rolling(window * 2 + 1, center=True).max())].dropna()
    swing_low = low[(low == low.rolling(window * 2 + 1, center=True).min())].dropna()
    last = float(close.iloc[-1])
    highs = sorted([float(value) for value in swing_high if value > last])[:5]
    lows = sorted([float(value) for value in swing_low if value < last], reverse=True)[:5]
    return {"current_price": last, "buy_side_liquidity": highs, "sell_side_liquidity": lows, "nearest_resistance": highs[0] if highs else None, "nearest_support": lows[0] if lows else None, "sweep_risk": "HIGH" if len(highs) + len(lows) >= 4 else "MODERATE"}


def execution_quality(book: dict[str, Any], requested_size: float, expected_price: float | None = None) -> dict[str, Any]:
    features = order_book_features(book)
    expected = expected_price or features["mid_price"]
    impact = abs(features["microprice"] - expected) / max(expected, 1e-12)
    depth = features["bid_depth"] if requested_size < 0 else features["ask_depth"]
    return {"spread_bps": features["spread_bps"], "microprice": features["microprice"], "expected_price": expected, "estimated_market_impact_bps": impact * 10000, "depth_coverage": min(abs(requested_size) / max(depth, 1e-12), 1.0), "quality": "GOOD" if features["spread_bps"] < 3 and impact * 10000 < 2 else "CAUTION"}
