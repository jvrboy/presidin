"""Expanded strategy registry (Python port of the TS suite): trend, momentum,
mean-reversion, breakout, volatility. Each returns a -1/0/+1 vote.
Indicators are shared with the forex engine (single source of truth)."""
from statistics import pstdev
from .forex import sma, ema_series as ema, rsi, atr

def macd(c):
    e12, e26 = ema(c,12), ema(c,26)
    return (e12-e26) if (e12 and e26) else None
def stdev(v, p=20): return pstdev(v[-p:]) if len(v) >= p else None
def pct_change(v, n=1): return (v[-1]-v[-1-n])/v[-1-n] if len(v) > n and v[-1-n] else 0

STRATEGIES = {
  "sma_20_50":  lambda c,h,l,v: (lambda s20,s50: (1 if (c[-1]>s20 and s20>s50) else -1 if (c[-1]<s20 and s20<s50) else 0) if s20 and s50 else 0)(sma(c,20),sma(c,50)),
  "ema_9_21":   lambda c,h,l,v: (lambda a,b: (1 if a>b else -1) if a and b else 0)(ema(c,9),ema(c,21)),
  "ema_21_55":  lambda c,h,l,v: (lambda a,b: (1 if a>b else -1) if a and b else 0)(ema(c,21),ema(c,55)),
  "rsi_meanrev":lambda c,h,l,v: (lambda r: (1 if r<30 else -1 if r>70 else 0) if r is not None else 0)(rsi(c)),
  "rsi_trend":  lambda c,h,l,v: (lambda r: (1 if r>55 else -1 if r<45 else 0) if r is not None else 0)(rsi(c)),
  "macd":       lambda c,h,l,v: (lambda m: (1 if m>0 else -1) if m is not None else 0)(macd(c)),
  "bollinger":  lambda c,h,l,v: (lambda m,sd: (1 if c[-1]<m-2*sd else -1 if c[-1]>m+2*sd else 0) if m and sd else 0)(sma(c,20),stdev(c,20)),
  "momentum":   lambda c,h,l,v: (1 if pct_change(c,5)>0 else -1 if pct_change(c,5)<0 else 0),
  "roc_10":     lambda c,h,l,v: (1 if pct_change(c,10)>0.001 else -1 if pct_change(c,10)<-0.001 else 0),
  "atr_trend":  lambda c,h,l,v: (lambda a,m: (1 if c[-1]>m else -1 if c[-1]<m else 0) if (a and m) else 0)(atr(h,l,c), sma(c,14)),
}

def aggregate(pair, series):
    c, h, l = series["closes"], series["highs"], series["lows"]
    v = series.get("volumes") or [0]*len(c)
    votes = [fn(c,h,l,v) for fn in STRATEGIES.values()]
    bull = sum(1 for x in votes if x>0); bear = sum(1 for x in votes if x<0); total = len(votes)
    bias = "bullish" if bull>bear else "bearish" if bear>bull else "neutral"
    conf = int(100*max(bull,bear)/total) if total else 0
    price = c[-1]; a = atr(h,l,c) or price*0.005
    d = -1 if bias=="bearish" else 1
    return {"instrument": pair, "bias": bias, "entry": round(price,5),
            "tp": round(price + d*a*2, 5), "sl": round(price - d*a, 5),
            "confidence": conf, "votes": {"bullish": bull, "bearish": bear, "total": total}}
