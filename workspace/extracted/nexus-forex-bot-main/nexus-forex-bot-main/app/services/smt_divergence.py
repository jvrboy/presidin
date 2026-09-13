"""SMT (Smart Money Technique / Concept) correlation-divergence analysis.

Unlike `app/services/divergence.py`, which compares a single symbol's price
action against its own derived oscillators (RSI, MACD, etc.), SMT divergence
is an ICT-style cross-instrument technique: it compares the price action of
TWO historically-correlated instruments directly against each other.

The core idea: if two instruments normally move together (or inversely),
and one makes a new swing high/low while the other FAILS to confirm it (does
not make a corresponding new high/low), that failure-to-confirm suggests
smart-money order flow is diverging between the two markets -- often a
leading indicator of a reversal on the instrument that DID make the new
extreme, because the move wasn't broadly confirmed.

Example: EURUSD makes a new swing high but GBPUSD (positively correlated,
both being USD-quote pairs with the dollar as the common leg) fails to make
a new high at the same time -> bearish SMT divergence on EURUSD (the rally
lacks broad confirmation, one leg -- likely EUR strength alone -- is not
being echoed by the correlated instrument).

This module is intentionally symbol-agnostic: it operates on two aligned
OHLC frames and does not itself fetch data, so it works the same whether the
underlying candles came from Deriv, yfinance, or the demo provider.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _ohlcv(rows: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    frame.columns = [str(c).lower() for c in frame.columns]
    return frame


def _pivot_indices(series: pd.Series, window: int = 3, mode: str = "low") -> list[int]:
    values = series.to_numpy(dtype=float)
    result = []
    for index in range(window, len(values) - window):
        local = values[index - window : index + window + 1]
        if mode == "low" and values[index] <= np.nanmin(local):
            result.append(index)
        if mode == "high" and values[index] >= np.nanmax(local):
            result.append(index)
    return result


def _align_by_length(df_a: pd.DataFrame, df_b: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Trim two frames to the same length, keeping the most recent bars.

    Real deployments should align by timestamp; this keeps the module
    dependency-light and robust when the two symbols' feeds have slightly
    different bar counts (e.g. weekend gaps differ between a forex pair and
    a 24/7 synthetic index) by comparing the most recent N bars of each.
    """
    n = min(len(df_a), len(df_b))
    return df_a.tail(n).reset_index(drop=True), df_b.tail(n).reset_index(drop=True)


def detect_smt_divergence(
    rows_a: list[dict],
    rows_b: list[dict],
    symbol_a: str = "SYMBOL_A",
    symbol_b: str = "SYMBOL_B",
    relationship: str = "positive",
    lookback: int = 100,
    pivot_window: int = 3,
) -> dict[str, Any]:
    """Detect SMT correlation divergence between two aligned OHLC series.

    `relationship`:
      - "positive": the two symbols normally move together. A divergence is
        flagged when one prints a new pivot high/low that the other fails
        to confirm (echo) at a comparable pivot.
      - "negative": the two symbols normally move inversely (e.g. a currency
        pair and its inverse leg). A divergence is flagged when one prints a
        new high while the other fails to print the expected new low (or
        vice versa).
    """
    if relationship not in {"positive", "negative"}:
        raise ValueError("relationship must be 'positive' or 'negative'")
    df_a, df_b = _align_by_length(_ohlcv(rows_a), _ohlcv(rows_b))
    df_a, df_b = df_a.tail(lookback).reset_index(drop=True), df_b.tail(lookback).reset_index(drop=True)
    if len(df_a) < 2 * pivot_window + 5:
        raise ValueError("Not enough aligned bars for SMT divergence detection")

    high_a, low_a = df_a["high"].astype(float), df_a["low"].astype(float)
    high_b, low_b = df_b["high"].astype(float), df_b["low"].astype(float)

    events: list[dict[str, Any]] = []

    # --- New-high check: does A's new pivot high get echoed by B? ---
    pivots_high_a = _pivot_indices(high_a, pivot_window, "high")
    if len(pivots_high_a) >= 2:
        prev_idx, curr_idx = pivots_high_a[-2], pivots_high_a[-1]
        a_made_new_high = high_a.iloc[curr_idx] > high_a.iloc[prev_idx]
        if a_made_new_high:
            window_b = high_b.iloc[max(0, curr_idx - pivot_window) : curr_idx + pivot_window + 1]
            prior_b = high_b.iloc[max(0, prev_idx - pivot_window) : prev_idx + pivot_window + 1]
            b_echoed = bool(window_b.max() > prior_b.max()) if relationship == "positive" else bool(window_b.min() < low_b.iloc[max(0, prev_idx - pivot_window) : prev_idx + pivot_window + 1].min())
            if relationship == "negative":
                # For a negative relationship, A's new high should be echoed
                # by B making a new LOW at the same time.
                pivots_low_b = _pivot_indices(low_b, pivot_window, "low")
                b_echoed = any(abs(idx - curr_idx) <= pivot_window for idx in pivots_low_b[-3:]) if pivots_low_b else False
            if not b_echoed:
                events.append({
                    "type": "SMT_BEARISH_DIVERGENCE",
                    "leading_symbol": symbol_a,
                    "confirming_symbol": symbol_b,
                    "relationship": relationship,
                    "description": (
                        f"{symbol_a} printed a new swing high that {symbol_b} failed to confirm "
                        f"({'no matching new high' if relationship == 'positive' else 'no matching new low'}); "
                        f"suggests the {symbol_a} rally lacks broad confirmation."
                    ),
                    "pivot_index": curr_idx,
                    "price_a": float(high_a.iloc[curr_idx]),
                    "price_b": float(high_b.iloc[curr_idx]) if curr_idx < len(high_b) else None,
                    "timestamp": str(df_a["timestamp"].iloc[curr_idx]) if "timestamp" in df_a else None,
                })

    # --- New-low check: does A's new pivot low get echoed by B? ---
    pivots_low_a = _pivot_indices(low_a, pivot_window, "low")
    if len(pivots_low_a) >= 2:
        prev_idx, curr_idx = pivots_low_a[-2], pivots_low_a[-1]
        a_made_new_low = low_a.iloc[curr_idx] < low_a.iloc[prev_idx]
        if a_made_new_low:
            if relationship == "positive":
                window_b = low_b.iloc[max(0, curr_idx - pivot_window) : curr_idx + pivot_window + 1]
                prior_b = low_b.iloc[max(0, prev_idx - pivot_window) : prev_idx + pivot_window + 1]
                b_echoed = bool(window_b.min() < prior_b.min())
            else:
                pivots_high_b = _pivot_indices(high_b, pivot_window, "high")
                b_echoed = any(abs(idx - curr_idx) <= pivot_window for idx in pivots_high_b[-3:]) if pivots_high_b else False
            if not b_echoed:
                events.append({
                    "type": "SMT_BULLISH_DIVERGENCE",
                    "leading_symbol": symbol_a,
                    "confirming_symbol": symbol_b,
                    "relationship": relationship,
                    "description": (
                        f"{symbol_a} printed a new swing low that {symbol_b} failed to confirm "
                        f"({'no matching new low' if relationship == 'positive' else 'no matching new high'}); "
                        f"suggests the {symbol_a} sell-off lacks broad confirmation."
                    ),
                    "pivot_index": curr_idx,
                    "price_a": float(low_a.iloc[curr_idx]),
                    "price_b": float(low_b.iloc[curr_idx]) if curr_idx < len(low_b) else None,
                    "timestamp": str(df_a["timestamp"].iloc[curr_idx]) if "timestamp" in df_a else None,
                })

    bullish = [e for e in events if e["type"] == "SMT_BULLISH_DIVERGENCE"]
    bearish = [e for e in events if e["type"] == "SMT_BEARISH_DIVERGENCE"]
    bias = "BULLISH" if len(bullish) > len(bearish) else "BEARISH" if len(bearish) > len(bullish) else "NEUTRAL"
    return {
        "symbol_a": symbol_a,
        "symbol_b": symbol_b,
        "relationship": relationship,
        "events": events,
        "bullish_count": len(bullish),
        "bearish_count": len(bearish),
        "bias": bias,
        "has_divergence": len(events) > 0,
        "lookback": lookback,
    }


def smt_correlation_strategy(
    rows_a: list[dict],
    rows_b: list[dict],
    symbol_a: str = "SYMBOL_A",
    symbol_b: str = "SYMBOL_B",
    relationship: str = "positive",
    lookback: int = 100,
    pivot_window: int = 3,
) -> dict[str, Any]:
    """Turn SMT correlation divergence detection into a trade action."""
    result = detect_smt_divergence(rows_a, rows_b, symbol_a, symbol_b, relationship, lookback, pivot_window)
    if result["bias"] == "BULLISH":
        action = "BUY"
    elif result["bias"] == "BEARISH":
        action = "SELL"
    else:
        action = "WAIT"
    confidence = min(1.0, len(result["events"]) / 2) if result["events"] else 0.0
    return {
        "strategy": "smt_correlation_divergence",
        "symbol_a": symbol_a,
        "symbol_b": symbol_b,
        "action": action,
        "confidence": confidence,
        "analysis": result,
    }


def scan_smt_pairs(
    ohlc_by_symbol: dict[str, list[dict]],
    pairs: list[dict[str, str]],
    lookback: int = 100,
    pivot_window: int = 3,
) -> list[dict[str, Any]]:
    """Run SMT divergence detection across a list of correlated symbol pairs.

    `pairs` items look like {"symbol_a": "XAUUSD", "symbol_b": "XAGUSD",
    "relationship": "positive"} (see `deriv_client.SMT_CORRELATED_PAIRS` for
    the default candidate set spanning all 16 supported Deriv symbols).
    Pairs whose symbols are both present in `ohlc_by_symbol` are evaluated;
    others are skipped with a `skipped` note rather than raising, so a
    partial data set (e.g. one symbol's fetch failed) doesn't abort the scan.
    """
    results: list[dict[str, Any]] = []
    for pair in pairs:
        symbol_a, symbol_b = pair["symbol_a"], pair["symbol_b"]
        relationship = pair.get("relationship", "positive")
        if symbol_a not in ohlc_by_symbol or symbol_b not in ohlc_by_symbol:
            results.append({"symbol_a": symbol_a, "symbol_b": symbol_b, "relationship": relationship, "skipped": True, "reason": "missing OHLC data for one or both symbols"})
            continue
        try:
            outcome = smt_correlation_strategy(ohlc_by_symbol[symbol_a], ohlc_by_symbol[symbol_b], symbol_a, symbol_b, relationship, lookback, pivot_window)
            outcome["skipped"] = False
            results.append(outcome)
        except ValueError as exc:
            results.append({"symbol_a": symbol_a, "symbol_b": symbol_b, "relationship": relationship, "skipped": True, "reason": str(exc)})
    return results
