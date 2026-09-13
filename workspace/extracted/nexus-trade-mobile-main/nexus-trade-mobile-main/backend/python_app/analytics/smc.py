"""Smart Money Concepts (SMC) and AMD cycle analytics.

Detects the institutional footprints that retail trendlines miss:
  - Order blocks (last opposing candle before an impulsive displacement)
  - Fair value gaps (3-candle imbalances that price tends to revisit)
  - Liquidity pools (equal highs/lows resting above/below the market)
  - Liquidity sweeps (stop-hunts through a pool followed by rejection)
  - Break of structure (BOS) and change of character (CHoCH)
  - Premium / discount zones within the dealing range
  - AMD cycle phase (Accumulation -> Manipulation -> Distribution)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass
class OrderBlock:
    kind: str            # "bullish" | "bearish"
    top: float
    bottom: float
    index: int           # bar index of the OB candle
    mitigated: bool = False


@dataclass
class FairValueGap:
    kind: str            # "bullish" | "bearish"
    top: float
    bottom: float
    index: int
    filled: bool = False


@dataclass
class LiquidityPool:
    kind: str            # "buyside" (above equal highs) | "sellside" (below equal lows)
    level: float
    touches: int
    swept: bool = False


@dataclass
class SMCContext:
    order_blocks: List[OrderBlock] = field(default_factory=list)
    fvgs: List[FairValueGap] = field(default_factory=list)
    pools: List[LiquidityPool] = field(default_factory=list)
    sweeps: List[dict] = field(default_factory=list)
    structure_events: List[dict] = field(default_factory=list)  # BOS / CHoCH
    bias: int = 0                # +1 bullish, -1 bearish, 0 neutral
    zone: str = "equilibrium"    # premium | discount | equilibrium
    amd_phase: str = "unknown"   # accumulation | manipulation | distribution
    amd_confidence: float = 0.0


# ---------------------------------------------------------------------------
# Swing helpers
# ---------------------------------------------------------------------------
def _swing_highs(df: pd.DataFrame, lb: int = 3) -> pd.Series:
    roll = df["high"].rolling(lb * 2 + 1, center=True).max()
    return df["high"].where(df["high"] == roll)


def _swing_lows(df: pd.DataFrame, lb: int = 3) -> pd.Series:
    roll = df["low"].rolling(lb * 2 + 1, center=True).min()
    return df["low"].where(df["low"] == roll)


# ---------------------------------------------------------------------------
# Order blocks
# ---------------------------------------------------------------------------
def detect_order_blocks(df: pd.DataFrame, displacement_mult: float = 1.5,
                        lookback: int = 60) -> List[OrderBlock]:
    """An order block is the last down-candle before a bullish displacement
    (or up-candle before a bearish displacement). Displacement = body larger
    than displacement_mult * ATR."""
    if len(df) < 20:
        return []
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - df["close"].shift()).abs(),
        (df["low"] - df["close"].shift()).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(14).mean()

    obs: List[OrderBlock] = []
    start = max(3, len(df) - lookback)
    for i in range(start, len(df)):
        body = abs(df["close"].iloc[i] - df["open"].iloc[i])
        a = atr.iloc[i]
        if not np.isfinite(a) or a <= 0 or body < displacement_mult * a:
            continue
        prev = i - 1
        is_bullish_displacement = df["close"].iloc[i] > df["open"].iloc[i]
        prev_bearish = df["close"].iloc[prev] < df["open"].iloc[prev]
        prev_bullish = df["close"].iloc[prev] > df["open"].iloc[prev]

        if is_bullish_displacement and prev_bearish:
            obs.append(OrderBlock("bullish",
                                  top=float(df["high"].iloc[prev]),
                                  bottom=float(df["low"].iloc[prev]),
                                  index=prev))
        elif not is_bullish_displacement and prev_bullish:
            obs.append(OrderBlock("bearish",
                                  top=float(df["high"].iloc[prev]),
                                  bottom=float(df["low"].iloc[prev]),
                                  index=prev))

    # Mark mitigation: later price traded back into the block
    for ob in obs:
        for j in range(ob.index + 2, len(df)):
            if ob.kind == "bullish" and df["low"].iloc[j] <= ob.top:
                ob.mitigated = True
                break
            if ob.kind == "bearish" and df["high"].iloc[j] >= ob.bottom:
                ob.mitigated = True
                break
    return obs


# ---------------------------------------------------------------------------
# Fair value gaps
# ---------------------------------------------------------------------------
def detect_fvgs(df: pd.DataFrame, lookback: int = 60) -> List[FairValueGap]:
    """Bullish FVG: low[i] > high[i-2]. Bearish FVG: high[i] < low[i-2]."""
    fvgs: List[FairValueGap] = []
    start = max(2, len(df) - lookback)
    for i in range(start, len(df)):
        if df["low"].iloc[i] > df["high"].iloc[i - 2]:
            fvgs.append(FairValueGap("bullish",
                                     top=float(df["low"].iloc[i]),
                                     bottom=float(df["high"].iloc[i - 2]),
                                     index=i))
        elif df["high"].iloc[i] < df["low"].iloc[i - 2]:
            fvgs.append(FairValueGap("bearish",
                                     top=float(df["low"].iloc[i - 2]),
                                     bottom=float(df["high"].iloc[i]),
                                     index=i))
    last_close = df["close"].iloc[-1]
    for f in fvgs:
        if f.kind == "bullish" and last_close < f.bottom:
            f.filled = True
        elif f.kind == "bearish" and last_close > f.top:
            f.filled = True
    return fvgs


# ---------------------------------------------------------------------------
# Liquidity pools & sweeps
# ---------------------------------------------------------------------------
def detect_liquidity_pools(df: pd.DataFrame, tolerance_atr: float = 0.15,
                           lb: int = 3) -> List[LiquidityPool]:
    """Equal highs/lows (within tolerance_atr * ATR) = resting liquidity."""
    if len(df) < 30:
        return []
    tr = (df["high"] - df["low"]).rolling(14).mean()
    tol = float(tr.iloc[-1]) * tolerance_atr if np.isfinite(tr.iloc[-1]) else 0
    if tol <= 0:
        return []

    pools: List[LiquidityPool] = []
    highs = _swing_highs(df, lb).dropna()
    lows = _swing_lows(df, lb).dropna()

    hv = highs.values
    for i in range(len(hv)):
        for j in range(i + 1, len(hv)):
            if abs(hv[i] - hv[j]) <= tol:
                level = (hv[i] + hv[j]) / 2
                if not any(abs(p.level - level) <= tol and p.kind == "buyside" for p in pools):
                    pools.append(LiquidityPool("buyside", float(level), 2))
    lv = lows.values
    for i in range(len(lv)):
        for j in range(i + 1, len(lv)):
            if abs(lv[i] - lv[j]) <= tol:
                level = (lv[i] + lv[j]) / 2
                if not any(abs(p.level - level) <= tol and p.kind == "sellside" for p in pools):
                    pools.append(LiquidityPool("sellside", float(level), 2))

    # Swept?
    for p in pools:
        if p.kind == "buyside" and df["high"].iloc[-5:].max() > p.level and df["close"].iloc[-1] < p.level:
            p.swept = True
        elif p.kind == "sellside" and df["low"].iloc[-5:].min() < p.level and df["close"].iloc[-1] > p.level:
            p.swept = True
    return pools


def detect_sweeps(df: pd.DataFrame, pools: List[LiquidityPool]) -> List[dict]:
    """A sweep: wick through the pool then close back inside — a stop-hunt."""
    sweeps: List[dict] = []
    if len(df) < 5:
        return sweeps
    for p in pools[-6:]:
        last = df.iloc[-1]
        if p.kind == "buyside" and last["high"] > p.level and last["close"] < p.level:
            sweeps.append({"kind": "buyside_sweep", "level": p.level,
                           "implication": "bearish_reversal"})
        elif p.kind == "sellside" and last["low"] < p.level and last["close"] > p.level:
            sweeps.append({"kind": "sellside_sweep", "level": p.level,
                           "implication": "bullish_reversal"})
    return sweeps


# ---------------------------------------------------------------------------
# Market structure: BOS / CHoCH
# ---------------------------------------------------------------------------
def detect_structure(df: pd.DataFrame, lb: int = 3) -> List[dict]:
    """Break of structure (trend continuation) and change of character
    (potential reversal) from swing breaks."""
    events: List[dict] = []
    highs = _swing_highs(df, lb).dropna()
    lows = _swing_lows(df, lb).dropna()
    if len(highs) < 2 or len(lows) < 2:
        return events

    close = df["close"].iloc[-1]
    last_high, prev_high = highs.iloc[-1], highs.iloc[-2]
    last_low, prev_low = lows.iloc[-1], lows.iloc[-2]

    if close > last_high:
        kind = "BOS_bullish" if last_low > prev_low else "CHoCH_bullish"
        events.append({"type": kind, "level": float(last_high),
                       "meaning": "continuation up" if kind.startswith("BOS") else "reversal up"})
    elif close < last_low:
        kind = "BOS_bearish" if last_high < prev_high else "CHoCH_bearish"
        events.append({"type": kind, "level": float(last_low),
                       "meaning": "continuation down" if kind.startswith("BOS") else "reversal down"})
    return events


# ---------------------------------------------------------------------------
# Premium / discount zone
# ---------------------------------------------------------------------------
def premium_discount(df: pd.DataFrame, lookback: int = 50) -> str:
    window = df.tail(lookback)
    hi, lo = window["high"].max(), window["low"].min()
    price = df["close"].iloc[-1]
    if hi <= lo:
        return "equilibrium"
    pos = (price - lo) / (hi - lo)
    if pos >= 0.618:
        return "premium"
    if pos <= 0.382:
        return "discount"
    return "equilibrium"


# ---------------------------------------------------------------------------
# AMD cycle (Accumulation – Manipulation – Distribution)
# ---------------------------------------------------------------------------
def detect_amd_phase(df: pd.DataFrame, range_bars: int = 40) -> tuple:
    """Classify the current AMD phase.

    Accumulation: tight range, low ATR percentile.
    Manipulation: a false break (sweep) of the range followed by re-entry.
    Distribution: strong displacement away from the range in the true direction.
    Returns (phase, confidence 0-1).
    """
    if len(df) < range_bars + 10:
        return "unknown", 0.0

    window = df.iloc[-range_bars - 5:-5]
    r_hi, r_lo = window["high"].max(), window["low"].min()
    r_size = r_hi - r_lo
    if r_size <= 0:
        return "unknown", 0.0

    tr = (df["high"] - df["low"])
    atr_now = float(tr.tail(14).mean())
    atr_hist = float(tr.tail(range_bars + 40).mean()) or atr_now
    range_ratio = r_size / (atr_hist * range_bars ** 0.5 + 1e-12)

    recent = df.tail(5)
    broke_up = recent["high"].max() > r_hi and recent["close"].iloc[-1] < r_hi
    broke_down = recent["low"].min() < r_lo and recent["close"].iloc[-1] > r_lo
    disp_up = recent["close"].iloc[-1] > r_hi + 0.3 * atr_now
    disp_down = recent["close"].iloc[-1] < r_lo - 0.3 * atr_now

    if broke_up or broke_down:
        return "manipulation", 0.75
    if disp_up or disp_down:
        return "distribution", 0.7
    if range_ratio < 0.35 and atr_now <= atr_hist * 1.05:
        return "accumulation", 0.65
    return "unknown", 0.3


# ---------------------------------------------------------------------------
# One-call context builder
# ---------------------------------------------------------------------------
def build_context(df: pd.DataFrame) -> SMCContext:
    ctx = SMCContext()
    if df is None or len(df) < 40:
        return ctx

    ctx.order_blocks = [ob for ob in detect_order_blocks(df) if not ob.mitigated]
    ctx.fvgs = [f for f in detect_fvgs(df) if not f.filled]
    ctx.pools = detect_liquidity_pools(df)
    ctx.sweeps = detect_sweeps(df, ctx.pools)
    ctx.structure_events = detect_structure(df)
    ctx.zone = premium_discount(df)
    ctx.amd_phase, ctx.amd_confidence = detect_amd_phase(df)

    # Bias synthesis
    score = 0
    for ev in ctx.structure_events:
        score += 1 if "bullish" in ev["type"] else -1
    for sw in ctx.sweeps:
        score += 1 if sw["implication"] == "bullish_reversal" else -1
    price = df["close"].iloc[-1]
    for ob in ctx.order_blocks[-3:]:
        if ob.kind == "bullish" and ob.bottom <= price <= ob.top * 1.002:
            score += 1          # price sitting in a demand block
        elif ob.kind == "bearish" and ob.bottom * 0.998 <= price <= ob.top:
            score -= 1          # price sitting in a supply block
    if ctx.zone == "discount":
        score += 1              # cheap — favor longs
    elif ctx.zone == "premium":
        score -= 1              # expensive — favor shorts
    ctx.bias = 1 if score > 0 else -1 if score < 0 else 0
    return ctx
