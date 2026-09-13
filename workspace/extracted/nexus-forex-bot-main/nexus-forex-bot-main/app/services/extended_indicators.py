"""Extended technical indicator library."""
from __future__ import annotations
import numpy as np
import pandas as pd


def ichimoku(data, conversion=9, base=26, span=52):
    h,l=data['high'],data['low']; tenkan=(h.rolling(conversion).max()+l.rolling(conversion).min())/2; kijun=(h.rolling(base).max()+l.rolling(base).min())/2
    span_a=((tenkan+kijun)/2).shift(base); span_b=((h.rolling(span).max()+l.rolling(span).min())/2).shift(base)
    return pd.DataFrame({'ichimoku_tenkan':tenkan,'ichimoku_kijun':kijun,'ichimoku_span_a':span_a,'ichimoku_span_b':span_b},index=data.index)


def donchian(data, period=20):
    return pd.DataFrame({'donchian_high':data['high'].rolling(period).max(),'donchian_low':data['low'].rolling(period).min(),'donchian_mid':(data['high'].rolling(period).max()+data['low'].rolling(period).min())/2},index=data.index)


def keltner(data, ema_period=20, atr_period=10, multiplier=2):
    tr=pd.concat([data['high']-data['low'],(data['high']-data['close'].shift()).abs(),(data['low']-data['close'].shift()).abs()],axis=1).max(axis=1)
    atr=tr.ewm(alpha=1/atr_period,adjust=False).mean(); mid=data['close'].ewm(span=ema_period,adjust=False).mean()
    return pd.DataFrame({'keltner_mid':mid,'keltner_upper':mid+multiplier*atr,'keltner_lower':mid-multiplier*atr},index=data.index)


def cci(data, period=20):
    tp=(data['high']+data['low']+data['close'])/3; ma=tp.rolling(period).mean(); md=tp.rolling(period).apply(lambda x: np.mean(np.abs(x-x.mean())),raw=True)
    return (tp-ma)/(0.015*md.replace(0,np.nan))


def williams_r(data, period=14):
    hi=data['high'].rolling(period).max(); lo=data['low'].rolling(period).min(); return -100*(hi-data['close'])/(hi-lo).replace(0,np.nan)


def roc(close, period=12): return close.pct_change(period)*100


def obv(data):
    volume=data.get('volume',pd.Series(1.0,index=data.index)).fillna(1.0); direction=np.sign(data['close'].diff()).fillna(0); return (direction*volume).cumsum()


def supertrend(data, period=10, multiplier=3):
    tr=pd.concat([data['high']-data['low'],(data['high']-data['close'].shift()).abs(),(data['low']-data['close'].shift()).abs()],axis=1).max(axis=1)
    atr=tr.ewm(alpha=1/period,adjust=False).mean(); mid=(data['high']+data['low'])/2; upper=mid+multiplier*atr; lower=mid-multiplier*atr
    trend=pd.Series(1,index=data.index,dtype=float); st=pd.Series(index=data.index,dtype=float)
    for i in range(1,len(data)):
        if data['close'].iloc[i]>upper.iloc[i-1]: trend.iloc[i]=1
        elif data['close'].iloc[i]<lower.iloc[i-1]: trend.iloc[i]=-1
        else: trend.iloc[i]=trend.iloc[i-1]
        st.iloc[i]=lower.iloc[i] if trend.iloc[i]>0 else upper.iloc[i]
    return pd.DataFrame({'supertrend':st,'supertrend_direction':trend},index=data.index)


def rolling_zscore(series, period=50):
    mean = series.rolling(period).mean()
    std = series.rolling(period).std().replace(0, np.nan)
    return (series - mean) / std


def money_flow_index(data, period=14):
    typical = (data['high'] + data['low'] + data['close']) / 3
    volume = data.get('volume', pd.Series(1.0, index=data.index)).fillna(1.0)
    raw = typical * volume
    positive = raw.where(typical.diff().ge(0), 0).rolling(period).sum()
    negative = raw.where(typical.diff().lt(0), 0).rolling(period).sum().replace(0, np.nan)
    return 100 - 100 / (1 + positive / negative)


def chaikin_money_flow(data, period=20):
    volume = data.get('volume', pd.Series(1.0, index=data.index)).fillna(1.0)
    spread = (data['high'] - data['low']).replace(0, np.nan)
    multiplier = ((data['close'] - data['low']) - (data['high'] - data['close'])) / spread
    return (multiplier * volume).rolling(period).sum() / volume.rolling(period).sum().replace(0, np.nan)


def divergence(data, oscillator, window=5):
    ph = data['high'].rolling(window).max().shift(1)
    pl = data['low'].rolling(window).min().shift(1)
    oh = oscillator.rolling(window).max().shift(1)
    ol = oscillator.rolling(window).min().shift(1)
    return pd.DataFrame({'bullish_divergence': (data['low'] < pl) & (oscillator > ol), 'bearish_divergence': (data['high'] > ph) & (oscillator < oh)}, index=data.index)


def add_extended_indicators(data):
    out=data.copy(); out=out.join(ichimoku(out)); out=out.join(donchian(out)); out=out.join(keltner(out)); out['cci_20']=cci(out); out['williams_r']=williams_r(out); out['roc_12']=roc(out['close']); out['obv']=obv(out); out=out.join(supertrend(out)); out['mfi_14']=money_flow_index(out); out['cmf_20']=chaikin_money_flow(out); out['close_zscore_50']=rolling_zscore(out['close']); out=out.join(divergence(out, out.get('rsi_14', out['close'].pct_change())).astype(int)); return out


EXTENDED_INDICATOR_NAMES = ['ichimoku', 'donchian', 'keltner', 'cci', 'williams_r', 'roc', 'obv', 'supertrend', 'money_flow_index', 'chaikin_money_flow', 'rolling_zscore', 'bullish_divergence', 'bearish_divergence']
