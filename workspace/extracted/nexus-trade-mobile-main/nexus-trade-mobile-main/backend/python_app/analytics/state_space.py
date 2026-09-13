"""Market state-space builder for the RL agents.

Transforms raw OHLCV (entry timeframe + higher-timeframe context) into a
fixed-width, scale-normalised feature vector. Every feature is bounded or
z-scored so the network behaves the same on Volatility 75 as on EURUSD.

Layout (53 features):
  [0:8]    entry-TF trend/momentum (returns, EMA alignment, RSI, Stoch, MACD)
  [8:13]   volatility (ATR%, ATR ratio, BB %B, BB width ratio, hist-vol)
  [13:19]  market structure flags (BOS/CHoCH bull/bear, swing distances)
  [19:27]  SMC (dist to nearest OB/FVG/pool, zone, sweep flags, AMD one-hot[3])
  [27:33]  higher timeframe #1 (bias, ADX, EMA slope, dist from EMA50, RSI, regime)
  [33:39]  higher timeframe #2 (same)
  [39:45]  position state (direction, unrealised PnL in ATR, bars held,
           distance to SL, distance to TP, size)
  [45:49]  time (hour sin/cos, dow sin/cos)
  [49:53]  ensemble + correlation context (ensemble position, regime one-hot[3])
"""
from __future__ import annotations

from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from analytics import ind_trend as trend
from analytics import ind_momentum as momentum
from analytics import ind_volatility as volatility
from analytics import smc

STATE_DIM = 53

_REGIME_ONEHOT = {"trending": [1, 0, 0], "ranging": [0, 1, 0], "volatile": [0, 0, 1]}
_AMD_ONEHOT = {"accumulation": [1, 0, 0], "manipulation": [0, 1, 0], "distribution": [0, 0, 1]}


def _safe(v, default=0.0):
    try:
        f = float(v)
        return f if np.isfinite(f) else default
    except Exception:
        return default


def _clip(v, lo=-5.0, hi=5.0):
    return float(np.clip(v, lo, hi))


class StateSpaceBuilder:
    """Builds the RL observation vector for one symbol."""

    def build(self,
              df: pd.DataFrame,
              htf_frames: Optional[Dict[str, pd.DataFrame]] = None,
              position: Optional[dict] = None,
              ensemble_position: float = 0.0,
              ensemble_regime: str = "transition") -> np.ndarray:
        f: List[float] = []
        close = df["close"]
        price = _safe(close.iloc[-1], 1.0)
        atr_val = _safe(trend.atr(df).iloc[-1], price * 0.001)
        atr_pct = atr_val / price * 100

        # --- [0:8] entry trend / momentum
        rets = close.pct_change()
        ema20 = trend.ema(close, 20)
        ema50 = trend.ema(close, 50)
        macd_df = trend.macd(close)
        rsi_val = _safe(momentum.rsi(close).iloc[-1], 50.0)
        stoch_k = _safe(momentum.stochastic(df)["%k"].iloc[-1], 50.0)
        f += [
            _clip(_safe(rets.iloc[-1]) / (atr_pct / 100 + 1e-12)),          # last return in ATR units
            _clip(_safe(rets.tail(5).mean()) / (atr_pct / 100 + 1e-12)),    # 5-bar momentum
            _clip((ema20.iloc[-1] - ema50.iloc[-1]) / (atr_val + 1e-12)),   # EMA alignment
            _clip((price - ema20.iloc[-1]) / (atr_val + 1e-12)),            # price vs EMA20
            rsi_val / 100.0 * 2 - 1,                                        # RSI -> [-1,1]
            stoch_k / 100.0 * 2 - 1,                                        # Stoch -> [-1,1]
            _clip(_safe(macd_df["histogram"].iloc[-1]) / (atr_val + 1e-12)),
            _clip(_safe(trend.adx(df)["adx"].iloc[-1], 15.0) / 50.0 - 0.5), # ADX centred
        ]

        # --- [8:13] volatility
        atr_ref = _safe(trend.atr(df).tail(100).mean(), atr_val)
        bb = volatility.bollinger_bands(close)
        bb_range = _safe(bb["upper"].iloc[-1] - bb["lower"].iloc[-1], 1e-9)
        pband = (price - _safe(bb["lower"].iloc[-1])) / (bb_range + 1e-12)
        width_ratio = _safe(bb["width"].iloc[-1]) / (_safe(bb["width"].tail(50).mean(), 1e-9) + 1e-12)
        hv = _safe(volatility.historical_volatility(close).iloc[-1], 0.0)
        f += [
            _clip(atr_pct * 10),                        # normalised ATR
            _clip(atr_val / (atr_ref + 1e-12) - 1.0),   # vol expansion/contraction
            _clip(pband * 2 - 1, -1.5, 1.5),            # Bollinger %B -> centred
            _clip(width_ratio - 1.0),                   # squeeze < 0 < expansion
            _clip(hv * 10),
        ]

        # --- [13:19] market structure flags
        ctx = smc.build_context(df)
        bos_bull = any(e["type"] == "BOS_bullish" for e in ctx.structure_events)
        bos_bear = any(e["type"] == "BOS_bearish" for e in ctx.structure_events)
        choch_bull = any(e["type"] == "CHoCH_bullish" for e in ctx.structure_events)
        choch_bear = any(e["type"] == "CHoCH_bearish" for e in ctx.structure_events)
        sh = _safe(df["high"].tail(20).max(), price)
        sl_ = _safe(df["low"].tail(20).min(), price)
        f += [
            1.0 if bos_bull else 0.0,
            1.0 if bos_bear else 0.0,
            1.0 if choch_bull else 0.0,
            1.0 if choch_bear else 0.0,
            _clip((sh - price) / (atr_val + 1e-12)),    # dist to 20-bar high
            _clip((price - sl_) / (atr_val + 1e-12)),   # dist to 20-bar low
        ]

        # --- [19:27] SMC
        ob_dist, fvg_dist = 5.0, 5.0
        for ob in ctx.order_blocks:
            mid = (ob.top + ob.bottom) / 2
            d = (mid - price) / (atr_val + 1e-12)
            if abs(d) < abs(ob_dist):
                ob_dist = d
        for g in ctx.fvgs:
            mid = (g.top + g.bottom) / 2
            d = (mid - price) / (atr_val + 1e-12)
            if abs(d) < abs(fvg_dist):
                fvg_dist = d
        pool_above = min(((p.level - price) / (atr_val + 1e-12)
                          for p in ctx.pools if p.kind == "buyside" and p.level > price),
                         default=5.0)
        pool_below = min(((price - p.level) / (atr_val + 1e-12)
                          for p in ctx.pools if p.kind == "sellside" and p.level < price),
                         default=5.0)
        sweep_up = any(s["kind"] == "buyside_sweep" for s in ctx.sweeps)
        sweep_dn = any(s["kind"] == "sellside_sweep" for s in ctx.sweeps)
        amd = _AMD_ONEHOT.get(ctx.amd_phase, [0, 0, 0])
        f += [
            _clip(ob_dist),
            _clip(fvg_dist),
            _clip(pool_above),
            _clip(pool_below),
            (1.0 if sweep_up else 0.0) - (1.0 if sweep_dn else 0.0),
            *amd,
        ]

        # --- [27:39] higher timeframes (2 slots, zero-padded if absent)
        htf_list = list((htf_frames or {}).values())[:2]
        for slot in range(2):
            hdf = htf_list[slot] if slot < len(htf_list) else None
            if hdf is None or len(hdf) < 60:
                f += [0.0] * 6
                continue
            hc = hdf["close"]
            h_ema20 = trend.ema(hc, 20).iloc[-1]
            h_ema50 = trend.ema(hc, 50).iloc[-1]
            h_atr = _safe(trend.atr(hdf).iloc[-1], 1e-9)
            h_adx = _safe(trend.adx(hdf)["adx"].iloc[-1], 15.0)
            h_rsi = _safe(momentum.rsi(hc).iloc[-1], 50.0)
            h_slope = _safe((h_ema20 - trend.ema(hc, 20).iloc[-6]) / (h_atr + 1e-12))
            bias = 1.0 if h_ema20 > h_ema50 else -1.0 if h_ema20 < h_ema50 else 0.0
            f += [
                bias,
                _clip(h_adx / 50.0 - 0.5),
                _clip(h_slope),
                _clip((hc.iloc[-1] - h_ema50) / (h_atr + 1e-12)),
                h_rsi / 100.0 * 2 - 1,
                bias * min(h_adx / 40.0, 1.0),          # signed trend strength
            ]

        # --- [39:45] position state
        pos = position or {}
        p_dir = float(pos.get("direction", 0))
        p_atr = _clip(_safe(pos.get("unrealized_atr", 0.0)))
        p_bars = _clip(_safe(pos.get("bars_held", 0)) / 50.0, 0, 2)
        p_sl = _clip(_safe(pos.get("dist_sl_atr", 0.0)))
        p_tp = _clip(_safe(pos.get("dist_tp_atr", 0.0)))
        p_size = _clip(_safe(pos.get("size_norm", 0.0)), 0, 2)
        f += [p_dir, p_atr, p_bars, p_sl, p_tp, p_size]

        # --- [45:49] time encoding
        ts = df.index[-1]
        try:
            hour, dow = ts.hour, ts.dayofweek
        except AttributeError:
            import datetime as _dt
            now = _dt.datetime.now(_dt.timezone.utc)
            hour, dow = now.hour, now.weekday()
        f += [
            float(np.sin(2 * np.pi * hour / 24)), float(np.cos(2 * np.pi * hour / 24)),
            float(np.sin(2 * np.pi * dow / 7)), float(np.cos(2 * np.pi * dow / 7)),
        ]

        # --- [49:53] ensemble + regime context
        f += [_clip(ensemble_position, -1, 1), *_REGIME_ONEHOT.get(ensemble_regime, [0, 0, 0])]

        vec = np.asarray(f, dtype=np.float32)
        assert vec.shape[0] == STATE_DIM, f"state dim {vec.shape[0]} != {STATE_DIM}"
        return np.nan_to_num(vec, nan=0.0, posinf=0.0, neginf=0.0)
