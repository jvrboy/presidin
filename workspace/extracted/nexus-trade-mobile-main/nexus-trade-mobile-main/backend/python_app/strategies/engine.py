"""
Simple multi-indicator strategy engine that produces trade signals.
"""

from datetime import datetime
from typing import List, Optional
import uuid
import pandas as pd
from .ensemble import review
from backend.intelligence import remember, neural_adjustment, gemini_review

from .indicators import rsi, ema, macd, atr, generate_ohlcv_demo
from backend.config import SystemSettings
from backend.state import Signal


ASSET_CLASS_MAP = {
    "EURUSD": "forex", "GBPUSD": "forex", "USDJPY": "forex", "USDCHF": "forex",
    "AUDUSD": "forex", "USDCAD": "forex", "NZDUSD": "forex",
    "XAUUSD": "metals", "XAGUSD": "metals",
    "BTCUSD": "crypto", "ETHUSD": "crypto", "LTCUSD": "crypto",
    "US30": "indices", "NAS100": "indices", "SPX500": "indices", "GER40": "indices",
    "AAPL": "stocks", "TSLA": "stocks", "NVDA": "stocks",
    "Volatility 75": "synthetics", "Boom 1000": "synthetics", "Crash 500": "synthetics",
}


def detect_asset_class(symbol: str) -> str:
    return ASSET_CLASS_MAP.get(symbol, "forex")


def analyze_symbol(symbol: str, settings: SystemSettings, df: Optional[pd.DataFrame] = None, *, source: str = "demo") -> Optional[Signal]:
    if source not in ("demo", "market"):
        raise ValueError("Source must be demo or market")
    if df is None:
        source = "demo"
        df = generate_ohlcv_demo(symbol)

    close = df["close"]
    high = df["high"]
    low = df["low"]

    # Indicators
    rsi_val = rsi(close, settings.rsi_period).iloc[-1]
    fast = ema(close, settings.fast_ma).iloc[-1]
    slow = ema(close, settings.slow_ma).iloc[-1]
    prev_fast = ema(close, settings.fast_ma).iloc[-2]
    prev_slow = ema(close, settings.slow_ma).iloc[-2]
    macd_line, signal_line, hist = macd(close)
    atr_val = atr(high, low, close).iloc[-1]
    price = close.iloc[-1]

    direction = "neutral"
    reasons = []
    strength = 40.0

    # MA Crossover
    if settings.enable_ma_crossover:
        if prev_fast <= prev_slow and fast > slow:
            direction = "buy"
            reasons.append(f"MA{settings.fast_ma} crossed above MA{settings.slow_ma}")
            strength += 20
        elif prev_fast >= prev_slow and fast < slow:
            direction = "sell"
            reasons.append(f"MA{settings.fast_ma} crossed below MA{settings.slow_ma}")
            strength += 20

    # RSI filter / confirmation
    if settings.enable_rsi_filter:
        if direction == "buy" and rsi_val < settings.rsi_oversold + 10:
            strength += 15
            reasons.append(f"RSI supportive ({rsi_val:.1f})")
        elif direction == "sell" and rsi_val > settings.rsi_overbought - 10:
            strength += 15
            reasons.append(f"RSI supportive ({rsi_val:.1f})")
        elif direction == "neutral":
            if rsi_val < settings.rsi_oversold:
                direction = "buy"
                reasons.append(f"RSI oversold ({rsi_val:.1f})")
                strength += 18
            elif rsi_val > settings.rsi_overbought:
                direction = "sell"
                reasons.append(f"RSI overbought ({rsi_val:.1f})")
                strength += 18

    # MACD
    if settings.enable_macd:
        if hist.iloc[-1] > 0 and hist.iloc[-2] <= 0 and direction in ("buy", "neutral"):
            if direction == "neutral":
                direction = "buy"
            strength += 12
            reasons.append("MACD bullish cross")
        elif hist.iloc[-1] < 0 and hist.iloc[-2] >= 0 and direction in ("sell", "neutral"):
            if direction == "neutral":
                direction = "sell"
            strength += 12
            reasons.append("MACD bearish cross")

    if direction == "neutral" or strength < 50:
        return None

    # SL / TP based on ATR
    sl_dist = atr_val * settings.atr_multiplier_sl
    tp_dist = atr_val * settings.atr_multiplier_tp

    if direction == "buy":
        sl = price - sl_dist
        tp = price + tp_dist
    else:
        sl = price + sl_dist
        tp = price - tp_dist

    features, votes, adjustment = review(df, direction)
    strength += adjustment
    reasons.append("Ensemble " + str(votes))
    if source == "market":
        strength += neural_adjustment(features)
        ai_delta, ai_status = gemini_review(symbol, direction, votes)
        strength += ai_delta
        reasons.append(ai_status)
    else:
        reasons.append("DEMO: synthetic data; learning and Gemini excluded")

    signal = Signal(
        id=str(uuid.uuid4()),
        symbol=symbol,
        asset_class=detect_asset_class(symbol),
        direction=direction,
        strength=max(0.0, min(98.0, strength)),
        timeframe=settings.primary_timeframe,
        entry=round(price, 5 if price < 50 else 2),
        sl=round(sl, 5 if price < 50 else 2),
        tp=round(tp, 5 if price < 50 else 2),
        reason=" | ".join(reasons) or "Multi-indicator confluence",
        timestamp=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        status="active",
    )

    remember(signal, features, source)
    return signal


def scan_all(settings: SystemSettings) -> List[Signal]:
    signals = []
    for sym in settings.active_symbols:
        # Try a few seeds so demo mode reliably produces signals
        sig = None
        for seed_offset in range(8):
            df = generate_ohlcv_demo(sym, seed=(abs(hash(sym)) + seed_offset * 17) % (2**32))
            sig = analyze_symbol(sym, settings, df)
            if sig:
                break
        if sig:
            signals.append(sig)
    signals.sort(key=lambda s: s.strength, reverse=True)
    return signals
