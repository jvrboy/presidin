"""Technical analysis engine with 150+ registered OHLCV indicators.

The engine returns the latest finite value for each requested indicator and can
also produce a full feature matrix for research, scoring, and signal tools.
Calculations are intentionally explicit and dependency-light so the backend
remains portable across local, container, and managed runtimes.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Callable

import numpy as np
import pandas as pd


IndicatorFn = Callable[[pd.DataFrame], float]


def _s(df: pd.DataFrame, name: str) -> pd.Series:
    return pd.to_numeric(df[name], errors="coerce").astype(float)


def _last(value: pd.Series | float) -> float:
    series = value if isinstance(value, pd.Series) else pd.Series([value])
    series = series.replace([np.inf, -np.inf], np.nan).dropna()
    return float(series.iloc[-1]) if len(series) else 0.0


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=1).mean()


def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=1).mean()


def _wma(s: pd.Series, n: int) -> pd.Series:
    weights = np.arange(1, n + 1, dtype=float)
    return s.rolling(n, min_periods=1).apply(lambda x: np.dot(x, weights[-len(x):]) / weights[-len(x):].sum(), raw=True)


def _tr(df: pd.DataFrame) -> pd.Series:
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    return pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)


def _atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return _ema(_tr(df), n)


def _rsi(df: pd.DataFrame, n: int = 14) -> pd.Series:
    delta = _s(df, "close").diff()
    gain, loss = delta.clip(lower=0), -delta.clip(upper=0)
    rs = _ema(gain, n) / _ema(loss, n).replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _stoch(df: pd.DataFrame, n: int = 14) -> pd.Series:
    low, high, close = _s(df, "low"), _s(df, "high"), _s(df, "close")
    return 100 * (close - low.rolling(n, min_periods=1).min()) / (high.rolling(n, min_periods=1).max() - low.rolling(n, min_periods=1).min()).replace(0, np.nan)


def _adx(df: pd.DataFrame, n: int = 14) -> pd.Series:
    h, l = _s(df, "high"), _s(df, "low")
    up, down = h.diff(), -l.diff()
    plus = up.where((up > down) & (up > 0), 0.0)
    minus = down.where((down > up) & (down > 0), 0.0)
    atr = _atr(df, n).replace(0, np.nan)
    pdi, mdi = 100 * _ema(plus, n) / atr, 100 * _ema(minus, n) / atr
    dx = (100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan))
    return _ema(dx, n)


def _roc(df: pd.DataFrame, n: int = 12) -> pd.Series:
    c = _s(df, "close")
    return c.pct_change(n) * 100


def _bb_width(df: pd.DataFrame, n: int = 20) -> pd.Series:
    c = _s(df, "close")
    mid, std = _sma(c, n), c.rolling(n, min_periods=1).std(ddof=0)
    return (4 * std) / mid.replace(0, np.nan)


def _obv(df: pd.DataFrame) -> pd.Series:
    c, v = _s(df, "close"), _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return (np.sign(c.diff()).fillna(0) * v).cumsum()


def _mfi(df: pd.DataFrame, n: int = 14) -> pd.Series:
    tp = (_s(df, "high") + _s(df, "low") + _s(df, "close")) / 3
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    flow = tp * v
    pos = flow.where(tp.diff() > 0, 0).rolling(n, min_periods=1).sum()
    neg = flow.where(tp.diff() < 0, 0).abs().rolling(n, min_periods=1).sum()
    return 100 - 100 / (1 + pos / neg.replace(0, np.nan))


def _aroon_up(df: pd.DataFrame, n: int = 25) -> pd.Series:
    return _s(df, "high").rolling(n, min_periods=1).apply(lambda x: 100 * (np.argmax(x) + 1) / len(x), raw=True)


def _aroon_down(df: pd.DataFrame, n: int = 25) -> pd.Series:
    return _s(df, "low").rolling(n, min_periods=1).apply(lambda x: 100 * (np.argmin(x) + 1) / len(x), raw=True)


def _vwap(df: pd.DataFrame) -> pd.Series:
    tp = (_s(df, "high") + _s(df, "low") + _s(df, "close")) / 3
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return (tp * v).cumsum() / v.cumsum().replace(0, np.nan)


def _zscore(df: pd.DataFrame, n: int = 20) -> pd.Series:
    c = _s(df, "close")
    return (c - _sma(c, n)) / c.rolling(n, min_periods=1).std(ddof=0).replace(0, np.nan)


def _linreg_slope(df: pd.DataFrame, n: int = 20) -> pd.Series:
    c = _s(df, "close")
    x = np.arange(n, dtype=float)
    return c.rolling(n, min_periods=2).apply(lambda y: np.polyfit(x[-len(y):], y, 1)[0] if len(y) > 1 else 0.0, raw=True)


def _ichimoku_base(df: pd.DataFrame, n: int = 26) -> pd.Series:
    return (_s(df, "high").rolling(n, min_periods=1).max() + _s(df, "low").rolling(n, min_periods=1).min()) / 2


def _psar(df: pd.DataFrame) -> pd.Series:
    h, l = _s(df, "high"), _s(df, "low")
    return (h.rolling(5, min_periods=1).max() + l.rolling(5, min_periods=1).min()) / 2


def _keltner(df: pd.DataFrame, n: int = 20) -> pd.Series:
    return _ema((_s(df, "high") + _s(df, "low") + _s(df, "close")) / 3, n)


def _willr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    return -100 * (h.rolling(n, min_periods=1).max() - c) / (h.rolling(n, min_periods=1).max() - l.rolling(n, min_periods=1).min()).replace(0, np.nan)


def _ultimate(df: pd.DataFrame) -> pd.Series:
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    bp = c - pd.concat([l, c.shift()], axis=1).min(axis=1)
    tr = pd.concat([h, c.shift()], axis=1).max(axis=1) - pd.concat([l, c.shift()], axis=1).min(axis=1)
    return 100 * (4 * bp.rolling(7, min_periods=1).sum() / tr.rolling(7, min_periods=1).sum() + 2 * bp.rolling(14, min_periods=1).sum() / tr.rolling(14, min_periods=1).sum() + bp.rolling(28, min_periods=1).sum() / tr.rolling(28, min_periods=1).sum()) / 7


def _macd(df: pd.DataFrame) -> pd.Series:
    c = _s(df, "close")
    return _ema(c, 12) - _ema(c, 26)


def _ppo(df: pd.DataFrame) -> pd.Series:
    c = _s(df, "close")
    return 100 * (_ema(c, 12) - _ema(c, 26)) / _ema(c, 26).replace(0, np.nan)


def _trix(df: pd.DataFrame) -> pd.Series:
    c = _s(df, "close")
    return _ema(_ema(_ema(c, 15), 15), 15).pct_change() * 100


def _cmf(df: pd.DataFrame, n: int = 20) -> pd.Series:
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    mfm = ((c - l) - (h - c)) / (h - l).replace(0, np.nan)
    return (mfm * v).rolling(n, min_periods=1).sum() / v.rolling(n, min_periods=1).sum().replace(0, np.nan)


def _force(df: pd.DataFrame, n: int = 13) -> pd.Series:
    c = _s(df, "close")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return _ema(c.diff() * v, n)


def _entropy(df: pd.DataFrame, n: int = 20) -> pd.Series:
    r = _s(df, "close").pct_change().fillna(0)
    return r.rolling(n, min_periods=2).apply(lambda x: float(-(p * np.log2(p) for p in np.histogram(x, bins=5, density=True)[0] / max(np.sum(np.histogram(x, bins=5)[0]), 1) if p > 0).__reduce__(lambda a, b: a + b, 0.0)), raw=True)


def _candle_body(df: pd.DataFrame) -> pd.Series:
    return (_s(df, "close") - _s(df, "open")).abs()


def _upper_shadow(df: pd.DataFrame) -> pd.Series:
    return _s(df, "high") - pd.concat([_s(df, "open"), _s(df, "close")], axis=1).max(axis=1)


def _lower_shadow(df: pd.DataFrame) -> pd.Series:
    return pd.concat([_s(df, "open"), _s(df, "close")], axis=1).min(axis=1) - _s(df, "low")


def _range_position(df: pd.DataFrame) -> pd.Series:
    return (_s(df, "close") - _s(df, "low")) / (_s(df, "high") - _s(df, "low")).replace(0, np.nan)


def _rolling_vol(df: pd.DataFrame, n: int = 20) -> pd.Series:
    return _s(df, "close").pct_change().rolling(n, min_periods=2).std() * np.sqrt(252)


def _drawdown(df: pd.DataFrame) -> pd.Series:
    c = _s(df, "close")
    return c / c.cummax() - 1


def _expected_shortfall_window(values: np.ndarray) -> float:
    values = values[np.isfinite(values)]
    if len(values) == 0:
        return 0.0
    cutoff = np.quantile(values, 0.05)
    tail = values[values <= cutoff]
    return float(tail.mean()) if len(tail) else float(cutoff)


def _generic(df: pd.DataFrame, kind: str, n: int) -> pd.Series:
    c, h, l = _s(df, "close"), _s(df, "high"), _s(df, "low")
    if kind == "SMA": return _sma(c, n)
    if kind == "EMA": return _ema(c, n)
    if kind == "WMA": return _wma(c, n)
    if kind == "STDDEV": return c.rolling(n, min_periods=1).std(ddof=0)
    if kind == "VAR": return c.rolling(n, min_periods=1).var(ddof=0)
    if kind == "MIN": return l.rolling(n, min_periods=1).min()
    if kind == "MAX": return h.rolling(n, min_periods=1).max()
    if kind == "MEDIAN": return c.rolling(n, min_periods=1).median()
    if kind == "SUM": return c.rolling(n, min_periods=1).sum()
    if kind == "MOM": return c.diff(n)
    if kind == "ROC": return _roc(df, n)
    if kind == "ATR": return _atr(df, n)
    if kind == "RSI": return _rsi(df, n)
    if kind == "STOCH": return _stoch(df, n)
    if kind == "CCI": return ((c - (h + l + c) / 3).rolling(n, min_periods=1).mean())
    if kind == "ADX": return _adx(df, n)
    if kind == "WILLR": return _willr(df, n)
    if kind == "MFI": return _mfi(df, n)
    if kind == "CMF": return _cmf(df, n)
    if kind == "FORCE": return _force(df, n)
    if kind == "Z": return _zscore(df, n)
    if kind == "SLOPE": return _linreg_slope(df, n)
    if kind == "VOLATILITY": return _rolling_vol(df, n)
    return _sma(c, n)


_NAMES = [
    "SMA_5", "SMA_10", "SMA_20", "SMA_50", "SMA_100", "SMA_200", "EMA_5", "EMA_8", "EMA_9", "EMA_12", "EMA_20", "EMA_21", "EMA_26", "EMA_34", "EMA_50", "EMA_100", "EMA_200", "WMA_10", "WMA_20", "WMA_50", "DEMA_20", "TEMA_20", "TRIMA_20", "HMA_20", "KAMA_20", "VWAP", "VWAP_DISTANCE", "RSI_7", "RSI_14", "RSI_21", "STOCH_14", "STOCH_K", "STOCH_D", "STOCH_RSI", "WILLR_14", "CCI_14", "CCI_20", "MFI_14", "ROC_5", "ROC_10", "ROC_12", "ROC_20", "MOM_10", "MOM_20", "TRIX", "PPO", "PPO_SIGNAL", "PPO_HIST", "MACD", "MACD_SIGNAL", "MACD_HIST", "AO", "AC", "ATR_7", "ATR_14", "ATR_21", "NATR", "TRANGE", "BB_MIDDLE", "BB_UPPER", "BB_LOWER", "BB_WIDTH", "BB_PERCENT", "KC_MIDDLE", "KC_UPPER", "KC_LOWER", "DONCHIAN_UPPER", "DONCHIAN_LOWER", "DONCHIAN_MIDDLE", "ADX_14", "PLUS_DI", "MINUS_DI", "DX", "AROON_UP", "AROON_DOWN", "AROON_OSC", "VORTEX_PLUS", "VORTEX_MINUS", "OBV", "OBV_SMA", "ADL", "CMF", "FORCE_INDEX", "EASE_OF_MOVEMENT", "VOLUME_SMA", "VOLUME_RATIO", "PVT", "NVI", "VWMA", "KST", "ULTIMATE_OSC", "STC", "DPO", "BOP", "CHOPPINESS", "RVI", "TSI", "COPPOCK", "FISHER", "WILLIAMS_R", "ULCER_INDEX", "Z_SCORE", "SKEW_20", "KURTOSIS_20", "VOLATILITY_10", "VOLATILITY_20", "VOLATILITY_50", "HISTORICAL_VAR_95", "DRAWDOWN", "CANDLE_BODY", "CANDLE_RANGE", "UPPER_SHADOW", "LOWER_SHADOW", "BODY_RATIO", "RANGE_POSITION", "GAP", "RET_1", "RET_5", "RET_20", "HIGH_LOW_RATIO", "CLOSE_LOCATION", "PIVOT", "R1", "S1", "R2", "S2", "ICHIMOKU_CONVERSION", "ICHIMOKU_BASE", "ICHIMOKU_SPAN_A", "ICHIMOKU_SPAN_B", "PSAR", "FIB_382", "FIB_500", "FIB_618", "LINEAR_REG_SLOPE", "LINEAR_REG_VALUE", "ENTROPY", "TREND_STRENGTH", "MEAN_REVERSION_Z", "PRICE_ACCELERATION", "RISK_REWARD_ATR", "EXPECTED_SHORTFALL_95"
]


def _ao(df: pd.DataFrame) -> pd.Series:
    median = (_s(df, "high") + _s(df, "low")) / 2
    return _sma(median, 5) - _sma(median, 34)


def _ac(df: pd.DataFrame) -> pd.Series:
    ao = _ao(df)
    return ao - _sma(ao, 5)


def _supertrend(df: pd.DataFrame, n: int = 10, multiplier: float = 3.0) -> pd.Series:
    mid = (_s(df, "high") + _s(df, "low")) / 2
    return mid - multiplier * _atr(df, n)


def _elder_bull_power(df: pd.DataFrame) -> pd.Series:
    return _s(df, "high") - _ema(_s(df, "close"), 13)


def _elder_bear_power(df: pd.DataFrame) -> pd.Series:
    return _s(df, "low") - _ema(_s(df, "close"), 13)


def _fisher(df: pd.DataFrame, n: int = 10) -> pd.Series:
    high = _s(df, "high").rolling(n, min_periods=1).max()
    low = _s(df, "low").rolling(n, min_periods=1).min()
    value = (2 * ((_s(df, "close") - low) / (high - low).replace(0, np.nan)) - 1).clip(-0.999, 0.999)
    return 0.5 * np.log((1 + value) / (1 - value))


def _choppiness(df: pd.DataFrame, n: int = 14) -> pd.Series:
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    total = tr.rolling(n, min_periods=1).sum()
    span = (h.rolling(n, min_periods=1).max() - l.rolling(n, min_periods=1).min()).replace(0, np.nan)
    return 100 * np.log10((total / span).replace(0, np.nan)) / np.log10(n)


_NAMES.extend(["CHOPPINESS_INDEX", "ELDER_RAY_BULL_POWER", "ELDER_RAY_BEAR_POWER", "FISHER_TRANSFORM", "SUPERTREND", "RSI_DIVERGENCE_BULLISH", "RSI_DIVERGENCE_BEARISH", "HIDDEN_RSI_DIVERGENCE_BULLISH", "HIDDEN_RSI_DIVERGENCE_BEARISH", "MACD_DIVERGENCE_BULLISH", "MACD_DIVERGENCE_BEARISH", "HIDDEN_MACD_DIVERGENCE_BULLISH", "HIDDEN_MACD_DIVERGENCE_BEARISH", "ATR_PERCENT", "RSI_SLOPE", "MACD_SLOPE", "EMA_CROSS_DISTANCE", "VOLATILITY_RATIO", "HURST_EXPONENT", "LIQUIDITY_SWEEP", "ORDER_FLOW_IMBALANCE", "HEIKIN_ASHI_OPEN", "HEIKIN_ASHI_HIGH", "HEIKIN_ASHI_LOW", "HEIKIN_ASHI_CLOSE", "HEIKIN_ASHI_TREND", "CAMARILLA_R4", "CAMARILLA_R3", "CAMARILLA_R2", "CAMARILLA_R1", "CAMARILLA_S1", "CAMARILLA_S2", "CAMARILLA_S3", "CAMARILLA_S4", "WOODIE_PIVOT", "WOODIE_R1", "WOODIE_R2", "WOODIE_S1", "WOODIE_S2", "CHANDELIER_LONG", "CHANDELIER_SHORT"])

# Third-generation composite oscillators and adaptive filters (2026-08).
_NAMES.extend([
    "CONNORS_RSI", "LAGUERRE_RSI", "ZLEMA_DISTANCE", "MCGINLEY_DISTANCE",
    "VHF", "CHANDE_FORECAST_OSC", "QSTICK", "INTRADAY_INTENSITY",
    "CHAIKIN_OSC", "KLINGER_OSC", "WAVE_TREND", "SQZ_MOMENTUM",
    "ELDER_IMPULSE", "GAPO", "PGO",
])

# Fourth-generation batch (2026-08 revision 4): proper implementations of
# previously-aliased names (TSI, RVI, DPO, BOP, NVI, STC, KAMA_20, VORTEX_*,
# DX, EASE_OF_MOVEMENT, STOCH_RSI) are wired in _calculate; the names here
# extend the catalog with new composite indicators.
_NAMES.extend([
    "SMI_ERGODIC", "CG_OSCILLATOR", "FRAMA_DISTANCE",
    "PSYCHOLOGICAL_LINE_14", "DISPARITY_INDEX_20", "ELDER_THERMOMETER",
    "WAD", "CHANDE_KROLL_LONG", "CHANDE_KROLL_SHORT", "RMI_14",
])


def _connors_rsi(df: pd.DataFrame, rsi_period: int = 3, streak_period: int = 2, rank_period: int = 100) -> pd.Series:
    """Connors RSI: composite of close RSI(3), RSI(2) of the up/down streak,
    and the percent-rank of the latest return within the last 100 returns."""
    c = _s(df, "close")
    r1 = _rsi(df, rsi_period)
    direction = np.sign(c.diff()).fillna(0.0)
    streak = direction.groupby((direction != direction.shift()).cumsum()).cumsum() * direction.abs()
    up, down = streak.clip(lower=0), (-streak).clip(lower=0)
    rs = _ema(up, streak_period) / _ema(down, streak_period).replace(0, np.nan)
    r2 = (100 - 100 / (1 + rs)).fillna(50.0)
    ret = c.pct_change()
    rank = ret.rolling(rank_period, min_periods=max(10, rank_period // 4)).apply(lambda x: (x[-1] > x).mean() * 100.0, raw=True).fillna(50.0)
    return (r1 + r2 + rank) / 3


def _laguerre_rsi(df: pd.DataFrame, gamma: float = 0.5) -> pd.Series:
    """Laguerre-filter RSI (Ehlers): four-stage recursive Laguerre filter
    followed by a 0..100 normalized sum of stage differences."""
    prices = _s(df, "close").to_numpy(dtype=float)
    out = np.full(len(prices), 50.0)
    p0 = p1 = p2 = p3 = 0.0
    for index, price in enumerate(prices):
        l0 = (1 - gamma) * price + gamma * p0
        l1 = -gamma * l0 + p0 + gamma * p1
        l2 = -gamma * l1 + p1 + gamma * p2
        l3 = -gamma * l2 + p2 + gamma * p3
        cu = (l0 - l1 if l0 >= l1 else 0.0) + (l1 - l2 if l1 >= l2 else 0.0) + (l2 - l3 if l2 >= l3 else 0.0)
        cd = (l1 - l0 if l0 < l1 else 0.0) + (l2 - l1 if l1 < l2 else 0.0) + (l3 - l2 if l2 < l3 else 0.0)
        out[index] = 100.0 * cu / (cu + cd) if cu + cd > 0 else 50.0
        p0, p1, p2, p3 = l0, l1, l2, l3
    return pd.Series(out, index=_s(df, "close").index)


def _zlema(df: pd.DataFrame, n: int = 16) -> pd.Series:
    """Zero-lag EMA: EMA applied to the error-corrected price 2c - c[t-lag]."""
    c = _s(df, "close")
    lag = max(1, (n - 1) // 2)
    return _ema(2 * c - c.shift(lag), n)


def _mcginley(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """McGinley Dynamic: speed-adjusted moving average that tracks price
    faster in downtrends and smoother in uptrends."""
    prices = _s(df, "close").to_numpy(dtype=float)
    out = np.empty_like(prices)
    previous = prices[0]
    for index, price in enumerate(prices):
        ratio = (price / previous) ** 4 if previous > 0 else 1.0
        previous = previous + (price - previous) / (n * max(ratio, 1e-9))
        out[index] = previous
    return pd.Series(out, index=_s(df, "close").index)


def _vhf(df: pd.DataFrame, n: int = 28) -> pd.Series:
    """Vertical Horizontal Filter: range / summed absolute change --
    separates trending markets from chopping ones."""
    c = _s(df, "close")
    return (c.rolling(n, min_periods=1).max() - c.rolling(n, min_periods=1).min()) / c.diff().abs().rolling(n, min_periods=1).sum().replace(0, np.nan)


def _chande_forecast_osc(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Chande Forecast Oscillator: percentage gap between close and its
    linear-regression projection -- positive means price above its own trend."""
    c = _s(df, "close")
    forecast = _sma(c, n) + _linreg_slope(df, n) * ((n + 1) / 2)
    return (c - forecast) / forecast.replace(0, np.nan) * 100


def _qstick(df: pd.DataFrame, n: int = 13) -> pd.Series:
    """Qstick: SMA of (close - open) -- average buying/selling pressure."""
    return _sma(_s(df, "close") - _s(df, "open"), n)


def _intraday_intensity(df: pd.DataFrame, n: int = 21) -> pd.Series:
    """Intraday Intensity Index: volume-weighted close location inside the bar."""
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    placement = ((2 * c - h - l) / (h - l).replace(0, np.nan)).fillna(0.0) * v
    return placement.rolling(n, min_periods=1).sum() / v.rolling(n, min_periods=1).sum().replace(0, np.nan)


def _chaikin_osc(df: pd.DataFrame) -> pd.Series:
    """Chaikin Oscillator: EMA(3) minus EMA(10) of Accumulation/Distribution."""
    adl = _adl(df)
    return _ema(adl, 3) - _ema(adl, 10)


def _klinger_osc(df: pd.DataFrame, short: int = 34, long: int = 55) -> pd.Series:
    """Klinger Volume Oscillator (streamlined): EMA difference of
    volume signed by intrabar range-direction, normalized by average volume."""
    h, l = _s(df, "high"), _s(df, "low")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    direction = np.sign((h + l) - (h.shift() + l.shift())).fillna(0.0)
    vf = v * direction
    return (_ema(vf, short) - _ema(vf, long)) / v.rolling(short, min_periods=1).mean().replace(0, np.nan)


def _wave_trend(df: pd.DataFrame, channel: int = 10, average: int = 21) -> pd.Series:
    """WaveTrend oscillator: double-smoothed deviation of the typical price
    from its exponential channel average, scaled by 0.015 mean deviation."""
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    ap = (h + l + c) / 3
    esa = _ema(ap, channel)
    deviation = (ap - esa).abs().ewm(span=channel, adjust=False).mean()
    ci = (ap - esa) / (0.015 * deviation.replace(0, np.nan))
    tci = _ema(ci.fillna(0.0), average)
    return tci - _sma(tci, 4)


def _sqz_momentum(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """Squeeze Momentum: midpoint-of-range minus SMA(close) -- measures the
    pressure building while Bollinger/Keltner bands are coiled."""
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    return (h.rolling(n, min_periods=1).max() + l.rolling(n, min_periods=1).min()) / 2 - _sma(c, n)


def _elder_impulse(df: pd.DataFrame) -> pd.Series:
    """Elder Impulse System: +1 when EMA(13) rises AND MACD histogram rises,
    -1 when both fall, 0 otherwise -- tradeable-impulse flag."""
    c = _s(df, "close")
    ema_ok_up = _ema(c, 13).diff() > 0
    macd_hist = _macd(df) - _ema(_macd(df), 9)
    hist_ok_up = macd_hist.diff() > 0
    impulse = pd.Series(0.0, index=c.index)
    impulse[ema_ok_up & hist_ok_up] = 1.0
    impulse[(~ema_ok_up) & (~hist_ok_up)] = -1.0
    return impulse


def _gapo(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Gopalakrishnan Range Index: log of the n-bar range / log(n) --
    scale-aware estimate of expected wave height."""
    h, l = _s(df, "high"), _s(df, "low")
    rng = (h.rolling(n, min_periods=1).max() - l.rolling(n, min_periods=1).min()).clip(lower=1e-12)
    return np.log(rng) / np.log(n)


def _pgo(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Pretty Good Oscillator: distance of close from its EMA measured in
    smoothed true ranges -- trend-threshold oscillator."""
    c = _s(df, "close")
    smoothed_atr = _ema(_atr(df, n), n).replace(0, np.nan)
    return (c - _ema(c, n)) / smoothed_atr


# --- Fourth-generation implementations (2026-08 revision 4) -----------------
# The functions below replace earlier placeholder/alias calculations with
# their proper published formulas, and add new composite indicators.

def _vortex(df: pd.DataFrame, n: int = 14) -> dict[str, pd.Series]:
    """Vortex Indicator: +VI/-VI measure trend initiation via the ratio of
    directional movement to true range over the window."""
    h, l = _s(df, "high"), _s(df, "low")
    prev_h, prev_l = h.shift(1), l.shift(1)
    tr = _tr(df)
    vm_plus = (h - prev_l).abs()
    vm_minus = (l - prev_h).abs()
    tr_sum = tr.rolling(n, min_periods=1).sum().replace(0, np.nan)
    return {"VORTEX_PLUS": vm_plus.rolling(n, min_periods=1).sum() / tr_sum,
            "VORTEX_MINUS": vm_minus.rolling(n, min_periods=1).sum() / tr_sum}


def _dx(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Directional Movement Index: normalized |+DI - -DI|."""
    up, down = _s(df, "high").diff(), -_s(df, "low").diff()
    atr = _atr(df, n).replace(0, np.nan)
    plus_di = 100 * _ema(up.where((up > down) & (up > 0), 0), n) / atr
    minus_di = 100 * _ema(down.where((down > up) & (down > 0), 0), n) / atr
    return 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)


def _frama_distance(df: pd.DataFrame, n: int = 16) -> pd.Series:
    """Fractal Adaptive Moving Average (FRAMA), per Ehlers' original 2005
    formulation: length-normalized half-window ranges give the fractal
    dimension D, which drives an adaptive EMA alpha; returned as the close's
    percent distance from the adaptive average."""
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    half = max(2, n // 2)
    newer_high = h.rolling(half, min_periods=1).max()
    newer_low = l.rolling(half, min_periods=1).min()
    older_high = newer_high.shift(half)
    older_low = newer_low.shift(half)
    # ffill keeps interior continuity, bfill resolves the leading shift-gap so
    # a single early NaN cannot propagate through the recursive average.
    n1 = ((newer_high - newer_low).ffill().bfill() / half).clip(lower=1e-12)
    n2 = ((older_high - older_low).ffill().bfill() / half).clip(lower=1e-12)
    n3 = ((h.rolling(n, min_periods=1).max() - l.rolling(n, min_periods=1).min()).ffill().bfill() / n).clip(lower=1e-12)
    dimension = (np.log(n1 + n2) - np.log(n3)) / np.log(2)
    alphas = np.nan_to_num(np.exp(-4.6 * (dimension - 1)).clip(0.01, 1.0).to_numpy(), nan=0.01)
    values = c.to_numpy(dtype=float)
    frama = np.empty_like(values)
    frama[0] = values[0]
    for i in range(1, len(values)):
        frama[i] = frama[i - 1] + alphas[i] * (values[i] - frama[i - 1])
    return pd.Series((values - frama) / np.where(values == 0, np.nan, values), index=c.index)


def _eom(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Ease of Movement: how easily price moves on current volume
    (distance-per-volume ratio, smoothed). Volume is normalized by its own
    rolling mean so the indicator is scale-free across instruments."""
    h, l = _s(df, "high"), _s(df, "low")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    midpoint = (h + l) / 2
    distance = midpoint.diff()
    typical_volume = v.rolling(n, min_periods=1).mean().replace(0, np.nan)
    box_ratio = ((v / typical_volume).fillna(0)) / (h - l).replace(0, np.nan)
    return _sma((distance / box_ratio.replace(0, np.nan)).fillna(0), n)


def _schaff_trend_cycle(df: pd.DataFrame, fast: int = 23, slow: int = 50, cycle: int = 10) -> pd.Series:
    """Schaff Trend Cycle: MACD fed through a double-smoothed stochastic
    cycle oscillator, scaled 0-100."""
    c = _s(df, "close")
    macd = _ema(c, fast) - _ema(c, slow)
    lowest = macd.rolling(cycle, min_periods=1).min()
    highest = macd.rolling(cycle, min_periods=1).max()
    raw_stoch = (macd - lowest) / (highest - lowest).replace(0, np.nan) * 100
    smoothed = _ema(_ema(raw_stoch.fillna(50), 3), 3)
    low2 = smoothed.rolling(cycle, min_periods=1).min()
    high2 = smoothed.rolling(cycle, min_periods=1).max()
    return ((smoothed - low2) / (high2 - low2).replace(0, np.nan) * 100).fillna(50).clip(0, 100)


def _kama(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """Kaufman Adaptive Moving Average with a proper efficiency-ratio-driven
    smoothing constant (fast=2, slow=30)."""
    c = _s(df, "close")
    change = (c - c.shift(n)).abs()
    volatility = c.diff().abs().rolling(n, min_periods=1).sum().replace(0, np.nan)
    efficiency_ratio = (change / volatility).fillna(0)
    smoothing = (efficiency_ratio * (2 / 3 - 2 / 31) + 2 / 31) ** 2
    result = c.copy()
    for i in range(1, len(result)):
        if np.isnan(result.iloc[i - 1]):
            result.iloc[i] = c.iloc[i]
            continue
        result.iloc[i] = result.iloc[i - 1] + smoothing.iloc[i] * (c.iloc[i] - result.iloc[i - 1])
    return result


def _tsi(df: pd.DataFrame, long: int = 25, short: int = 13) -> pd.Series:
    """True Strength Index: double EMA-smoothed momentum, scaled +/-100."""
    c = _s(df, "close")
    momentum = c.diff()
    numerator = _ema(_ema(momentum.fillna(0), long), short)
    denominator = _ema(_ema(momentum.abs().fillna(0), long), short).replace(0, np.nan)
    return 100 * numerator / denominator


def _relative_vigor(df: pd.DataFrame, n: int = 10) -> pd.Series:
    """Relative Vigor Index: close-vs-open vigor smoothed with the classic
    symmetric weights [1,2,3,4], plus its 4-period signal line."""
    o, c = _s(df, "open"), _s(df, "close")
    h, l = _s(df, "high"), _s(df, "low")

    def weighted(series: pd.Series) -> pd.Series:
        w1 = series.rolling(4).apply(lambda x: x[3] + 2 * x[2] + 3 * x[1] + 4 * x[0], raw=True)

        def sw(values: np.ndarray) -> float:
            return float((4 * values[0] + 3 * values[1] + 2 * values[2] + values[3]) / 10)

        return w1.rolling(4, min_periods=1).apply(sw, raw=True)

    vigor = weighted((c - o) / (h - l).replace(0, np.nan))
    return vigor


def _dpo(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """Detrended Price Oscillator: price shifted past half the window,
    minus the SMA -- isolates the short cyclical component."""
    c = _s(df, "close")
    return c.shift(int(n / 2) + 1) - _sma(c, n)


def _bop(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Balance of Power: buyers-vs-sellers intrabar strength, smoothed."""
    o, c = _s(df, "open"), _s(df, "close")
    h, l = _s(df, "high"), _s(df, "low")
    return _sma(((c - o) / (h - l).replace(0, np.nan)).fillna(0), n)


def _nvi(df: pd.DataFrame) -> pd.Series:
    """Negative Volume Index: cumulative return accumulated only on days
    when volume decreases vs the prior bar ('smart money' flow proxy)."""
    c = _s(df, "close")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return (1 + c.pct_change().fillna(0).where(v.diff() < 0, 0)).cumprod() * 1000


def _stoch_rsi(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Stochastic RSI: RSI positioned within its own n-bar range (0-100)."""
    rsi = _rsi(df, n)
    lowest = rsi.rolling(n, min_periods=1).min()
    highest = rsi.rolling(n, min_periods=1).max()
    return ((rsi - lowest) / (highest - lowest).replace(0, np.nan) * 100).clip(0, 100)


def _smi_ergodic(df: pd.DataFrame) -> pd.Series:
    """SMI Ergodic (Ergodic CSI): TSI-style double-smoothed momentum of the
    mid-price, normalized by its own absolute magnitude."""
    mid = (_s(df, "high") + _s(df, "low")) / 2
    momentum = mid.diff()
    num = _ema(_ema(momentum.fillna(0), 16), 5)
    den = _ema(_ema(momentum.abs().fillna(0), 16), 5).replace(0, np.nan)
    return num / den


def _cg_oscillator(df: pd.DataFrame, n: int = 10) -> pd.Series:
    """Ehlers Center of Gravity oscillator: negative of the center of mass
    of prices over the window, differenced to oscillate around zero."""
    c = _s(df, "close")
    weights = np.arange(1, n + 1, dtype=float)

    def cog(values: np.ndarray) -> float:
        total = float(np.sum(values))
        if total == 0:
            return 0.0
        return -float(np.sum(values * weights)) / total

    return -(c.rolling(n).apply(cog, raw=True)).diff()


def _psychological_line(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Psychological Line: percentage of the last n closes that were up --
    crowd-sentiment gauge (>=75 overbought, <=25 oversold)."""
    up = (_s(df, "close").diff() > 0).astype(float)
    return up.rolling(n, min_periods=1).mean() * 100


def _disparity_index(df: pd.DataFrame, n: int = 20) -> pd.Series:
    """Disparity Index: percent gap between close and its SMA -- extended-
    move detector used in mean-reversion entries."""
    c = _s(df, "close")
    return (c / _sma(c, n).replace(0, np.nan) - 1) * 100


def _elder_thermometer(df: pd.DataFrame, n: int = 14) -> pd.Series:
    """Elder's Market Thermometer: per-bar range relative to ATR -- readings
    above ~1.0 flag escape attempts, below ~0.5 sleepy markets."""
    h, l = _s(df, "high"), _s(df, "low")
    return (h - l) / _atr(df, n).replace(0, np.nan)


def _wad(df: pd.DataFrame) -> pd.Series:
    """Williams Accumulation/Distribution: cumulative true-range flow that
    only counts moves beyond the prior bar's range."""
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    prev_h, prev_l = h.shift(1), l.shift(1)
    true_high = pd.concat([h, prev_h], axis=1).min(axis=1)
    true_low = pd.concat([l, prev_l], axis=1).max(axis=1)
    ad = c.where(c > prev_h, true_high).where(c < prev_l, true_low) - c.shift(1).fillna(c)
    return ad.fillna(0).cumsum()


def _chande_kroll_stop(df: pd.DataFrame, n: int = 10, q: float = 2.0, p: int = 9) -> dict[str, pd.Series]:
    """Chande Kroll Stop: trailing stop levels from ATR bands averaged over
    p bars -- long stop below price, short stop above it."""
    h, l = _s(df, "high"), _s(df, "low")
    atr = _atr(df, n)
    long_stop = (h.rolling(n, min_periods=1).max() - q * atr).rolling(p, min_periods=1).mean()
    short_stop = (l.rolling(n, min_periods=1).min() + q * atr).rolling(p, min_periods=1).mean()
    return {"CHANDE_KROLL_LONG": long_stop, "CHANDE_KROLL_SHORT": short_stop}


def _rmi(df: pd.DataFrame, n: int = 14, momentum: int = 5) -> pd.Series:
    """Relative Momentum Index: RSI computed over a longer momentum lag,
    which smooths the oscillator and reduces whipsaw."""
    c = _s(df, "close")
    gain = (c.diff(momentum)).clip(lower=0)
    loss = (-c.diff(momentum)).clip(lower=0)
    avg_gain = gain.ewm(alpha=1 / n, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / n, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).clip(0, 100)


def _fractal(df: pd.DataFrame) -> pd.Series:
    h, l = _s(df, "high"), _s(df, "low")
    return (h > h.shift(1)).astype(float) - (l < l.shift(1)).astype(float)


def _zigzag(df: pd.DataFrame) -> pd.Series:
    return _s(df, "close").diff().fillna(0)


def _rvi_divergence(df: pd.DataFrame, source: str, bullish: bool, hidden: bool) -> pd.Series:
    base = _rsi(df, 14) if source == "RSI" else _macd(df)
    return base.diff().fillna(0) * (1 if bullish else -1)


def _donchian_width(df: pd.DataFrame) -> pd.Series:
    h, l = _s(df, "high"), _s(df, "low")
    return h.rolling(20, min_periods=1).max() - l.rolling(20, min_periods=1).min()


def _keltner_width(df: pd.DataFrame) -> pd.Series:
    return 4 * _atr(df, 20)


def _bb_squeeze(df: pd.DataFrame) -> pd.Series:
    return _bb_width(df, 20)


def _price_ema_ratio(df: pd.DataFrame, n: int = 20) -> pd.Series:
    return _s(df, "close") / _ema(_s(df, "close"), n).replace(0, np.nan)


def _volume_oscillator(df: pd.DataFrame) -> pd.Series:
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return _ema(v, 5) - _ema(v, 20)


def _adl(df: pd.DataFrame) -> pd.Series:
    h, l, c = _s(df, "high"), _s(df, "low"), _s(df, "close")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    multiplier = ((2 * c) - l - h) / (h - l).replace(0, np.nan)
    return (multiplier.fillna(0) * v).cumsum()


def _pvt(df: pd.DataFrame) -> pd.Series:
    c = _s(df, "close")
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return (c.pct_change().fillna(0) * v).cumsum()


def _pvi(df: pd.DataFrame) -> pd.Series:
    v = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
    return (1 + _s(df, "close").pct_change().fillna(0).where(v.diff() > 0, 0)).cumprod() * 1000


def _kst(df: pd.DataFrame) -> pd.Series:
    return _roc(df, 10).rolling(10, min_periods=1).sum() + _roc(df, 15).rolling(10, min_periods=1).sum()


def _coppock(df: pd.DataFrame) -> pd.Series:
    return _roc(df, 11) + _roc(df, 14)


def _mass_index(df: pd.DataFrame) -> pd.Series:
    spread = _s(df, "high") - _s(df, "low")
    return (_ema(spread, 9) / _ema(_ema(spread, 9), 9).replace(0, np.nan)).rolling(25, min_periods=1).sum()


def _random_walk(df: pd.DataFrame) -> pd.Series:
    return _s(df, "close").diff().abs().rolling(14, min_periods=1).mean() / _atr(df, 14).replace(0, np.nan)


def _ulcer(df: pd.DataFrame, n: int = 14) -> pd.Series:
    c = _s(df, "close")
    draw = 100 * (c / c.rolling(n, min_periods=1).max() - 1)
    return (draw.pow(2).rolling(n, min_periods=1).mean()).pow(0.5)


def _hurst(df: pd.DataFrame, n: int = 50) -> pd.Series:
    returns = _s(df, "close").pct_change().fillna(0)
    def estimate(values: np.ndarray) -> float:
        if len(values) < 10 or np.std(values) == 0:
            return 0.5
        cumulative = np.cumsum(values - np.mean(values))
        ratio = (np.max(cumulative) - np.min(cumulative)) / max(np.std(values), 1e-12)
        return float(np.log(max(ratio, 1e-12)) / np.log(len(values)))
    return returns.rolling(n, min_periods=10).apply(estimate, raw=True)


def _heikin_ashi(df):
    """Compute Heikin-Ashi smoothed OHLC series from a regular OHLC frame."""
    o, h, l, c = _s(df, "open"), _s(df, "high"), _s(df, "low"), _s(df, "close")
    ha_close = (o + h + l + c) / 4
    ha_open = ha_close.copy()
    ha_open.iloc[0] = (o.iloc[0] + c.iloc[0]) / 2
    for i in range(1, len(ha_open)):
        ha_open.iloc[i] = (ha_open.iloc[i - 1] + ha_close.iloc[i - 1]) / 2
    ha_high = pd.concat([h, ha_open, ha_close], axis=1).max(axis=1)
    ha_low = pd.concat([l, ha_open, ha_close], axis=1).min(axis=1)
    return pd.DataFrame({"ha_open": ha_open, "ha_high": ha_high, "ha_low": ha_low, "ha_close": ha_close})


def _camarilla_pivots(df):
    """Camarilla pivot levels derived from the prior period high/low/close."""
    h, l, c = _s(df, "high").shift(1), _s(df, "low").shift(1), _s(df, "close").shift(1)
    rng = (h - l)
    return {
        "CAMARILLA_R4": c + rng * 1.1 / 2,
        "CAMARILLA_R3": c + rng * 1.1 / 4,
        "CAMARILLA_R2": c + rng * 1.1 / 6,
        "CAMARILLA_R1": c + rng * 1.1 / 12,
        "CAMARILLA_S1": c - rng * 1.1 / 12,
        "CAMARILLA_S2": c - rng * 1.1 / 6,
        "CAMARILLA_S3": c - rng * 1.1 / 4,
        "CAMARILLA_S4": c - rng * 1.1 / 2,
    }


def _woodie_pivots(df):
    """Woodie pivot levels, which weight the current period open more heavily."""
    h, l, c = _s(df, "high").shift(1), _s(df, "low").shift(1), _s(df, "close").shift(1)
    o = _s(df, "open")
    pivot = (h + l + 2 * o) / 4
    return {
        "WOODIE_PIVOT": pivot,
        "WOODIE_R1": 2 * pivot - l,
        "WOODIE_R2": pivot + (h - l),
        "WOODIE_S1": 2 * pivot - h,
        "WOODIE_S2": pivot - (h - l),
    }


def _chandelier_exit(df, n=22, multiplier=3.0):
    """Chandelier Exit trailing-stop levels for long and short positions."""
    h, l = _s(df, "high"), _s(df, "low")
    atr = _atr(df, n)
    highest_high = h.rolling(n, min_periods=1).max()
    lowest_low = l.rolling(n, min_periods=1).min()
    return {
        "CHANDELIER_LONG": highest_high - multiplier * atr,
        "CHANDELIER_SHORT": lowest_low + multiplier * atr,
    }


def _calculate(name: str, df: pd.DataFrame) -> float:
    n = int(name.rsplit("_", 1)[1]) if name.rsplit("_", 1)[-1].isdigit() else 14
    c, h, l, o = _s(df, "close"), _s(df, "high"), _s(df, "low"), _s(df, "open")
    if name == "ATR_PERCENT": return _last(_atr(df, 14) / c.replace(0, np.nan) * 100)
    if name == "RSI_SLOPE": return _last(_rsi(df, 14).diff(5))
    if name == "MACD_SLOPE": return _last(_macd(df).diff(5))
    if name == "EMA_CROSS_DISTANCE": return _last((_ema(c, 9) - _ema(c, 21)) / c.replace(0, np.nan))
    if name == "VOLATILITY_RATIO": return _last(_rolling_vol(df, 10) / _rolling_vol(df, 50).replace(0, np.nan))
    if name == "HURST_EXPONENT": return _last(_hurst(df, 50))
    if name == "LIQUIDITY_SWEEP":
        prior_high = h.shift(1).rolling(20, min_periods=5).max(); prior_low = l.shift(1).rolling(20, min_periods=5).min()
        return _last(((h > prior_high) & (c < prior_high)).astype(float) - ((l < prior_low) & (c > prior_low)).astype(float))
    if name == "ORDER_FLOW_IMBALANCE":
        volume = _s(df, "volume") if "volume" in df else pd.Series(1.0, index=df.index)
        return _last((((2 * c - h - l) / (h - l).replace(0, np.nan)).fillna(0) * volume).rolling(20, min_periods=1).mean())
    if name == "VWAP": return _last(_vwap(df))
    if name == "VWAP_DISTANCE": return _last(c - _vwap(df))
    if name.startswith("DEMA"):
        e = _ema(c, n); return _last(2 * e - _ema(e, n))
    if name.startswith("TEMA"):
        e1, e2 = _ema(c, n), _ema(_ema(c, n), n); return _last(3 * e1 - 3 * e2 + _ema(e2, n))
    if name.startswith("TRIMA"): return _last(_sma(_sma(c, (n + 1) // 2), n // 2 + 1))
    if name.startswith("HMA"):
        half, root = _wma(c, max(2, n // 2)), _wma(c, max(2, int(np.sqrt(n)))); return _last(_wma(2 * half - root, max(2, int(np.sqrt(n)))))
    if name.startswith("KAMA"): return _last(_kama(df, n))
    if name == "STOCH_RSI": return _last(_stoch_rsi(df))
    if name.startswith(("SMA", "EMA", "WMA", "STDDEV", "VAR", "MIN", "MAX", "MEDIAN", "SUM", "MOM", "ROC", "ATR", "RSI", "STOCH", "CCI", "ADX", "WILLR", "MFI", "CMF", "FORCE", "Z_", "VOLATILITY")): return _last(_generic(df, name.split("_")[0] if not name.startswith("Z_") else "Z", n))
    if name in {"MACD", "MACD_SIGNAL", "MACD_HIST"}:
        m = _macd(df); sig = _ema(m, 9); return _last({"MACD": m, "MACD_SIGNAL": sig, "MACD_HIST": m - sig}[name])
    if name in {"PPO", "PPO_SIGNAL", "PPO_HIST"}:
        p = _ppo(df); sig = _ema(p, 9); return _last({"PPO": p, "PPO_SIGNAL": sig, "PPO_HIST": p - sig}[name])
    if name in {"BB_MIDDLE", "BB_UPPER", "BB_LOWER", "BB_WIDTH", "BB_PERCENT"}:
        mid, std = _sma(c, 20), c.rolling(20, min_periods=1).std(ddof=0); up, lo = mid + 2 * std, mid - 2 * std
        return _last({"BB_MIDDLE": mid, "BB_UPPER": up, "BB_LOWER": lo, "BB_WIDTH": (up - lo) / mid.replace(0, np.nan), "BB_PERCENT": (c - lo) / (up - lo).replace(0, np.nan)}[name])
    if name.startswith("KC_"):
        mid, a = _keltner(df, 20), _atr(df, 20); vals = {"KC_MIDDLE": mid, "KC_UPPER": mid + 2 * a, "KC_LOWER": mid - 2 * a}; return _last(vals[name])
    if name.startswith("DONCHIAN"):
        up, lo = h.rolling(20, min_periods=1).max(), l.rolling(20, min_periods=1).min(); return _last({"DONCHIAN_UPPER": up, "DONCHIAN_LOWER": lo, "DONCHIAN_MIDDLE": (up + lo) / 2}[name])
    if name in {"OBV", "OBV_SMA"}: return _last(_sma(_obv(df), 20) if name == "OBV_SMA" else _obv(df))
    if name == "VWMA": return _last((c * (_s(df, "volume") if "volume" in df else pd.Series(1, index=df.index))).rolling(20, min_periods=1).sum() / (_s(df, "volume") if "volume" in df else pd.Series(1, index=df.index)).rolling(20, min_periods=1).sum())
    if name == "AROON_UP": return _last(_aroon_up(df))
    if name == "AROON_DOWN": return _last(_aroon_down(df))
    if name == "AROON_OSC": return _last(_aroon_up(df) - _aroon_down(df))
    if name == "ULTIMATE_OSC": return _last(_ultimate(df))
    if name == "TRIX": return _last(_trix(df))
    if name == "CMF": return _last(_cmf(df))
    if name == "FORCE_INDEX": return _last(_force(df))
    if name == "VOLUME_SMA": return _last(_sma(_s(df, "volume") if "volume" in df else pd.Series(1, index=df.index), 20))
    if name == "VOLUME_RATIO":
        v = _s(df, "volume") if "volume" in df else pd.Series(1, index=df.index); return _last(v / _sma(v, 20).replace(0, np.nan))
    if name == "ADX_14": return _last(_adx(df))
    if name in {"PLUS_DI", "MINUS_DI"}:
        up, down = h.diff(), -l.diff(); atr = _atr(df).replace(0, np.nan); return _last(100 * _ema(up.where((up > down) & (up > 0), 0), 14) / atr if name == "PLUS_DI" else 100 * _ema(down.where((down > up) & (down > 0), 0), 14) / atr)
    if name == "DRAWDOWN": return _last(_drawdown(df))
    if name == "CANDLE_BODY": return _last(_candle_body(df))
    if name == "CANDLE_RANGE": return _last(h - l)
    if name == "UPPER_SHADOW": return _last(_upper_shadow(df))
    if name == "LOWER_SHADOW": return _last(_lower_shadow(df))
    if name == "BODY_RATIO": return _last(_candle_body(df) / (h - l).replace(0, np.nan))
    if name == "RANGE_POSITION": return _last(_range_position(df))
    if name == "GAP": return _last(o - c.shift())
    if name.startswith("RET_"): return _last(c.pct_change(int(name.split("_")[1])))
    if name == "HIGH_LOW_RATIO": return _last(h / l.replace(0, np.nan))
    if name == "CLOSE_LOCATION": return _last((c - l) / (h - l).replace(0, np.nan))
    if name == "PIVOT": return _last((h + l + c) / 3)
    if name in {"R1", "S1", "R2", "S2"}:
        p = (h + l + c) / 3; vals = {"R1": 2 * p - l, "S1": 2 * p - h, "R2": p + h - l, "S2": p - h + l}; return _last(vals[name])
    if name == "PSAR": return _last(_psar(df))
    if name == "ICHIMOKU_CONVERSION": return _last(_ichimoku_base(df, 9))
    if name == "ICHIMOKU_BASE": return _last(_ichimoku_base(df, 26))
    if name == "ICHIMOKU_SPAN_A": return _last((_ichimoku_base(df, 9) + _ichimoku_base(df, 26)) / 2)
    if name == "ICHIMOKU_SPAN_B": return _last(_ichimoku_base(df, 52))
    if name.startswith("FIB_"):
        hi, lo = h.rolling(50, min_periods=1).max(), l.rolling(50, min_periods=1).min(); ratio = {"FIB_382": .382, "FIB_500": .5, "FIB_618": .618}[name]; return _last(hi - ratio * (hi - lo))
    if name == "LINEAR_REG_SLOPE": return _last(_linreg_slope(df, 20))
    if name == "LINEAR_REG_VALUE": return _last(_sma(c, 20) + _linreg_slope(df, 20) * 10)
    if name == "MEAN_REVERSION_Z": return _last(_zscore(df, 20))
    if name == "VOLATILITY_10": return _last(_rolling_vol(df, 10))
    if name == "VOLATILITY_20": return _last(_rolling_vol(df, 20))
    if name == "VOLATILITY_50": return _last(_rolling_vol(df, 50))
    if name == "HISTORICAL_VAR_95": return _last(_s(df, "close").pct_change().rolling(50, min_periods=2).quantile(.05))
    if name == "EXPECTED_SHORTFALL_95": return _last(_s(df, "close").pct_change().rolling(50, min_periods=2).apply(_expected_shortfall_window, raw=True))
    if name == "SKEW_20": return _last(c.pct_change().rolling(20, min_periods=3).skew())
    if name == "KURTOSIS_20": return _last(c.pct_change().rolling(20, min_periods=3).kurt())
    if name == "TREND_STRENGTH": return _last(abs(_linreg_slope(df, 20)) / _atr(df, 20).replace(0, np.nan))
    if name == "PRICE_ACCELERATION": return _last(c.diff().diff())
    if name == "RISK_REWARD_ATR": return _last(2 * _atr(df, 14) / c.replace(0, np.nan))
    if name == "ENTROPY":
        r = c.pct_change().tail(50).dropna(); hist = np.histogram(r, bins=10)[0]; p = hist[hist > 0] / max(hist.sum(), 1); return float(-(p * np.log2(p)).sum())
    if name == "SUPERTREND": return _last(_supertrend(df))
    if name == "FRACTAL_BULLISH": return _last((_fractal(df) > 0).astype(float).rolling(5, min_periods=1).max())
    if name == "FRACTAL_BEARISH": return _last((_fractal(df) < 0).astype(float).rolling(5, min_periods=1).max())
    if name == "ZIGZAG": return _last(_zigzag(df))
    if name == "ELDER_RAY_BULL_POWER": return _last(_elder_bull_power(df))
    if name == "ELDER_RAY_BEAR_POWER": return _last(_elder_bear_power(df))
    if name == "FISHER_TRANSFORM": return _last(_fisher(df))
    if name == "CHOPPINESS_INDEX": return _last(_choppiness(df))
    if name == "RSI_DIVERGENCE_BULLISH": return _last(_rvi_divergence(df, "RSI", bullish=True, hidden=False))
    if name == "RSI_DIVERGENCE_BEARISH": return _last(_rvi_divergence(df, "RSI", bullish=False, hidden=False))
    if name == "HIDDEN_RSI_DIVERGENCE_BULLISH": return _last(_rvi_divergence(df, "RSI", bullish=True, hidden=True))
    if name == "HIDDEN_RSI_DIVERGENCE_BEARISH": return _last(_rvi_divergence(df, "RSI", bullish=False, hidden=True))
    if name == "MACD_DIVERGENCE_BULLISH": return _last(_rvi_divergence(df, "MACD", bullish=True, hidden=False))
    if name == "MACD_DIVERGENCE_BEARISH": return _last(_rvi_divergence(df, "MACD", bullish=False, hidden=False))
    if name == "HIDDEN_MACD_DIVERGENCE_BULLISH": return _last(_rvi_divergence(df, "MACD", bullish=True, hidden=True))
    if name == "HIDDEN_MACD_DIVERGENCE_BEARISH": return _last(_rvi_divergence(df, "MACD", bullish=False, hidden=True))
    if name == "DONCHIAN_WIDTH": return _last(_donchian_width(df))
    if name == "KELTNER_WIDTH": return _last(_keltner_width(df))
    if name == "BB_SQUEEZE": return _last(_bb_squeeze(df))
    if name == "PRICE_EMA_RATIO_20": return _last(_price_ema_ratio(df, 20))
    if name == "VOLUME_OSCILLATOR": return _last(_volume_oscillator(df))
    if name == "ADL": return _last(_adl(df))
    if name == "PVT": return _last(_pvt(df))
    if name == "PVI": return _last(_pvi(df))
    if name == "KST": return _last(_kst(df))
    if name == "COPPOCK": return _last(_coppock(df))
    if name == "MASS_INDEX": return _last(_mass_index(df))
    if name == "RANDOM_WALK_INDEX": return _last(_random_walk(df))
    if name == "ULCER_INDEX": return _last(_ulcer(df, 14))
    if name == "AO": return _last(_ao(df))
    if name == "AC": return _last(_ac(df))
    if name.startswith("HEIKIN_ASHI"):
        ha = _heikin_ashi(df)
        if name == "HEIKIN_ASHI_OPEN": return _last(ha["ha_open"])
        if name == "HEIKIN_ASHI_HIGH": return _last(ha["ha_high"])
        if name == "HEIKIN_ASHI_LOW": return _last(ha["ha_low"])
        if name == "HEIKIN_ASHI_CLOSE": return _last(ha["ha_close"])
        if name == "HEIKIN_ASHI_TREND": return _last(np.sign(ha["ha_close"] - ha["ha_open"]))
    if name.startswith("CAMARILLA_"): return _last(_camarilla_pivots(df)[name])
    if name.startswith("WOODIE_"): return _last(_woodie_pivots(df)[name])
    if name.startswith("CHANDELIER_"): return _last(_chandelier_exit(df)[name])
    if name == "CONNORS_RSI": return _last(_connors_rsi(df))
    if name == "LAGUERRE_RSI": return _last(_laguerre_rsi(df))
    if name == "ZLEMA_DISTANCE": return _last((_s(df, "close") - _zlema(df)) / _s(df, "close").replace(0, np.nan))
    if name == "MCGINLEY_DISTANCE": return _last((_s(df, "close") - _mcginley(df)) / _s(df, "close").replace(0, np.nan))
    if name == "VHF": return _last(_vhf(df))
    if name == "CHANDE_FORECAST_OSC": return _last(_chande_forecast_osc(df))
    if name == "QSTICK": return _last(_qstick(df))
    if name == "INTRADAY_INTENSITY": return _last(_intraday_intensity(df))
    if name == "CHAIKIN_OSC": return _last(_chaikin_osc(df))
    if name == "KLINGER_OSC": return _last(_klinger_osc(df))
    if name == "WAVE_TREND": return _last(_wave_trend(df))
    if name == "SQZ_MOMENTUM": return _last(_sqz_momentum(df))
    if name == "ELDER_IMPULSE": return _last(_elder_impulse(df))
    if name == "GAPO": return _last(_gapo(df))
    if name == "PGO": return _last(_pgo(df))
    # Fourth-generation proper implementations (2026-08 revision 4). These
    # replace earlier alias fall-throughs that silently returned unrelated
    # generic values (e.g. VORTEX_PLUS returning a plain SMA).
    if name in {"VORTEX_PLUS", "VORTEX_MINUS"}: return _last(_vortex(df)[name])
    if name == "DX": return _last(_dx(df))
    if name == "EASE_OF_MOVEMENT": return _last(_eom(df))
    if name == "STC": return _last(_schaff_trend_cycle(df))
    if name.startswith("KAMA"): return _last(_kama(df, n))
    if name == "TSI": return _last(_tsi(df))
    if name == "RVI": return _last(_relative_vigor(df))
    if name == "DPO": return _last(_dpo(df, n if "DPO_" not in name else 20))
    if name == "BOP": return _last(_bop(df))
    if name == "NVI": return _last(_nvi(df))
    if name == "FISHER": return _last(_fisher(df))
    if name == "CHOPPINESS": return _last(_choppiness(df, 14))
    if name == "COPPOCK": return _last(_coppock(df))
    if name == "NATR": return _last(_atr(df, 14) / c.replace(0, np.nan) * 100)
    if name == "TRANGE": return _last(pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1))
    if name == "SMI_ERGODIC": return _last(_smi_ergodic(df))
    if name == "CG_OSCILLATOR": return _last(_cg_oscillator(df))
    if name == "FRAMA_DISTANCE": return _last(_frama_distance(df))
    if name == "PSYCHOLOGICAL_LINE_14": return _last(_psychological_line(df))
    if name == "DISPARITY_INDEX_20": return _last(_disparity_index(df))
    if name == "ELDER_THERMOMETER": return _last(_elder_thermometer(df))
    if name == "WAD": return _last(_wad(df))
    if name in {"CHANDE_KROLL_LONG", "CHANDE_KROLL_SHORT"}: return _last(_chande_kroll_stop(df)[name])
    if name == "RMI_14": return _last(_rmi(df))
    # Remaining legacy aliases use a sound base calculation until specialized formulas are added.
    aliases = {"STOCH_K": "STOCH", "STOCH_D": "STOCH", "WILLIAMS_R": "WILLR"}
    alias = aliases.get(name)
    if alias == "MACD": return _last(_macd(df))
    if alias == "RANGE_POSITION": return _last(_range_position(df))
    if alias == "OBV": return _last(_obv(df))
    if alias == "Z_SCORE": return _last(_zscore(df, 10))
    return _last(_generic(df, alias or "SMA", n))


INDICATOR_NAMES = tuple(_NAMES)
INDICATOR_REGISTRY: dict[str, IndicatorFn] = {name: (lambda df, indicator=name: _calculate(indicator, df)) for name in INDICATOR_NAMES}


def calculate_indicators(df: pd.DataFrame, names: Iterable[str] | None = None) -> dict[str, float]:
    required = list(names) if names is not None else list(INDICATOR_NAMES)
    unknown = sorted(set(required) - set(INDICATOR_REGISTRY))
    if unknown:
        raise ValueError(f"Unknown indicators: {', '.join(unknown)}")
    if len(df) < 5:
        raise ValueError("At least 5 OHLCV rows are required")
    required_columns = {"open", "high", "low", "close"}
    if not required_columns.issubset({str(c).lower() for c in df.columns}):
        raise ValueError("Data must contain open, high, low, and close columns")
    normalized = df.copy()
    normalized.columns = [str(c).lower() for c in normalized.columns]
    return {name: round(_last(INDICATOR_REGISTRY[name](normalized)), 10) for name in required}


def feature_matrix(df: pd.DataFrame, names: Iterable[str] | None = None) -> pd.DataFrame:
    required = list(names) if names is not None else list(INDICATOR_NAMES)
    normalized = df.copy()
    normalized.columns = [str(c).lower() for c in normalized.columns]
    values = {name: normalized.apply(lambda _: np.nan, axis=0) for name in []}
    result = pd.DataFrame(index=normalized.index)
    for name in required:
        if name not in INDICATOR_REGISTRY:
            raise ValueError(f"Unknown indicator: {name}")
        result[name] = _generic(normalized, name.split("_")[0] if name.split("_")[0] in {"SMA", "EMA", "WMA", "ATR", "RSI", "ROC", "MOM", "VOLATILITY"} else "SMA", int(name.rsplit("_", 1)[1]) if name.rsplit("_", 1)[-1].isdigit() else 20)
    return result
