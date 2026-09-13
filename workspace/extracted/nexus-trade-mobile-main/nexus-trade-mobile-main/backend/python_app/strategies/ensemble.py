"""Independent deterministic reviewers; scores are heuristics, not probabilities."""
import numpy as np
from ta.trend import ADXIndicator, CCIIndicator
from ta.momentum import StochasticOscillator, WilliamsRIndicator
from ta.volatility import BollingerBands
from .indicators import atr, ema


def review(df, direction):
    if len(df) < 60:
        raise ValueError('At least 60 completed OHLCV bars are required')
    values = df[['open', 'high', 'low', 'close', 'volume']].to_numpy(dtype=float)
    if not np.isfinite(values).all() or (values[:, :4] <= 0).any():
        raise ValueError('OHLCV must be finite with positive prices')
    h, l, c = df.high, df.low, df.close
    if (h < l).any() or (h < c).any() or (l > c).any():
        raise ValueError('Invalid candle ranges')
    a = float(atr(h, l, c).iloc[-1])
    if a <= 0:
        raise ValueError('No measurable volatility')
    bb = BollingerBands(c)
    adx = float(ADXIndicator(h, l, c).adx().iloc[-1])
    stoch = float(StochasticOscillator(h, l, c).stoch().iloc[-1])
    cci = float(CCIIndicator(h, l, c).cci().iloc[-1])
    wr = float(WilliamsRIndicator(h, l, c).williams_r().iloc[-1])
    trend = float((ema(c, 20).iloc[-1] - ema(c, 50).iloc[-1]) / a)
    band = float(bb.bollinger_pband().iloc[-1])
    momentum = float((c.iloc[-1] - c.iloc[-6]) / a)
    features = np.array([trend, adx / 50, stoch / 100, cci / 200,
                         wr / 100, band, momentum, a / c.iloc[-1] * 100])
    if not np.isfinite(features).all():
        raise ValueError('Indicators are not ready')
    votes = {
        'trend': int(np.sign(trend)) if adx >= 20 else 0,
        'mean_reversion': 1 if band < 0 and stoch < 20 else -1 if band > 1 and stoch > 80 else 0,
        'breakout': 1 if c.iloc[-1] > h.iloc[-21:-1].max() else -1 if c.iloc[-1] < l.iloc[-21:-1].min() else 0,
        'momentum': 1 if momentum > 1 and cci > 100 else -1 if momentum < -1 and cci < -100 else 0,
    }
    side = 1 if direction == 'buy' else -1
    adjustment = sum(v * side for v in votes.values()) * 3
    # Volatility risk reviewer can only reduce confidence.
    adjustment -= 5 if a / c.iloc[-1] > .03 else 0
    return features.tolist() + [side], votes, adjustment
