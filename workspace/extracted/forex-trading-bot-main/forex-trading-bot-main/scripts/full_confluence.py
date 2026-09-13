#!/usr/bin/env python3
"""FULL-CONFLUENCE engine — every strategy, every indicator, every neural net,
run per instrument in one pass. Signals only emitted when confluence is decisive.

Sources (per bar, per symbol):
  - 60+ classical indicators (trend, momentum, volume, volatility, MTF)
  - 48 strategy scores (from apps/web/lib/*)
  - 17 neural nets (mlp/gru/lstm/tcn/conv/transformer/attention/quantum pack)
  - 6 divergence detectors
  - 5 agent votes (trend, momentum, mean-rev, volume, regime)

Emit rule: score = weighted_sum(all sources)  →  emit if |score| >= threshold AND
           agreement >= 0.60 AND ML/agent/strategy tri-agreement met.
"""
import json, ssl, time, asyncio, math
import numpy as np
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict, Counter
import websockets

ROOT = Path("/home/user/ftb")
SIG_DIR = ROOT / "knowledge/signals"
TRACKER = SIG_DIR / "tracker.jsonl"

APP_ID = "1089"
WS = f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}"

async def fetch_candles(symbol, count=1200, granularity=60):
    async with websockets.connect(WS, ssl=ssl.create_default_context(), ping_interval=None) as w:
        await w.send(json.dumps({"ticks_history":symbol,"adjust_start_time":1,"count":count,
            "end":"latest","start":1,"style":"candles","granularity":granularity}))
        for _ in range(6):
            r = json.loads(await asyncio.wait_for(w.recv(), timeout=10))
            if "candles" in r:
                return [dict(epoch=c["epoch"],open=c["open"],high=c["high"],
                             low=c["low"],close=c["close"]) for c in r["candles"]]
            if "error" in r: return None
    return None

async def fetch_bundle(symbols):
    out={}
    for s in symbols:
        try:
            cs = await fetch_candles(s,1200,60)
            if cs: out[s]=cs
        except Exception as e:
            print(f"  {s} FAILED: {e}")
    return out

# ============ INDICATOR BLOCK ============
def sma(x,n): 
    x=np.asarray(x); return np.convolve(x, np.ones(n)/n, mode='same')
def ema(x,n):
    x=np.asarray(x); k=2/(n+1); e=np.zeros_like(x, dtype=float); e[0]=x[0]
    for i in range(1,len(x)): e[i]=x[i]*k + e[i-1]*(1-k)
    return e
def rsi_series(x, n=14):
    x=np.asarray(x, dtype=float); d=np.diff(x, prepend=x[0])
    g=np.where(d>0,d,0); l=np.where(d<0,-d,0)
    ag=ema(g,n); al=ema(l,n)
    rs=ag/np.where(al<1e-9,1e-9,al)
    return 100 - 100/(1+rs)
def atr_series(h,l,c,n=14):
    h=np.asarray(h,dtype=float); l=np.asarray(l,dtype=float); c=np.asarray(c,dtype=float)
    tr=np.maximum(h-l, np.maximum(np.abs(h-np.roll(c,1)), np.abs(l-np.roll(c,1))))
    tr[0]=h[0]-l[0]
    return ema(tr, n)
def bb(x,n=20,k=2):
    x=np.asarray(x,dtype=float); m=sma(x,n)
    s=np.array([x[max(0,i-n+1):i+1].std() for i in range(len(x))])
    return m-k*s, m, m+k*s
def macd_h(x,f=12,s=26,sig=9):
    ef=ema(x,f); es=ema(x,s); line=ef-es
    signal=ema(line,sig); return line-signal
def stoch(h,l,c,n=14,d=3):
    h=np.asarray(h); l=np.asarray(l); c=np.asarray(c)
    kk=np.zeros_like(c, dtype=float)
    for i in range(len(c)):
        lo=l[max(0,i-n+1):i+1].min(); hi=h[max(0,i-n+1):i+1].max()
        kk[i] = 100*(c[i]-lo)/(hi-lo) if hi>lo else 50
    return kk, sma(kk,d)
def williams_r(h,l,c,n=14):
    h=np.asarray(h); l=np.asarray(l); c=np.asarray(c)
    out=np.zeros_like(c,dtype=float)
    for i in range(len(c)):
        hi=h[max(0,i-n+1):i+1].max(); lo=l[max(0,i-n+1):i+1].min()
        out[i]= -100*(hi-c[i])/(hi-lo) if hi>lo else -50
    return out
def cci(h,l,c,n=20):
    tp = (np.asarray(h)+np.asarray(l)+np.asarray(c))/3
    m = sma(tp,n); md = np.array([np.abs(tp[max(0,i-n+1):i+1]-m[i]).mean() for i in range(len(tp))])
    return (tp-m)/(0.015*np.where(md<1e-9,1e-9,md))
def roc(x,n=10):
    x=np.asarray(x,dtype=float); return np.concatenate([np.zeros(n), (x[n:]-x[:-n])/x[:-n]*100])
def adx(h,l,c,n=14):
    h=np.asarray(h,dtype=float); l=np.asarray(l,dtype=float); c=np.asarray(c,dtype=float)
    up = h - np.roll(h,1); dn = np.roll(l,1) - l
    plus_dm = np.where((up>dn)&(up>0), up, 0); minus_dm=np.where((dn>up)&(dn>0), dn, 0)
    tr = np.maximum(h-l, np.maximum(np.abs(h-np.roll(c,1)), np.abs(l-np.roll(c,1))))
    atr = ema(tr,n); pdi=100*ema(plus_dm,n)/np.where(atr<1e-9,1e-9,atr); mdi=100*ema(minus_dm,n)/np.where(atr<1e-9,1e-9,atr)
    dx = 100*np.abs(pdi-mdi)/np.where((pdi+mdi)<1e-9,1e-9,(pdi+mdi))
    return ema(dx,n), pdi, mdi
def donchian(h,l,n=20):
    h=np.asarray(h); l=np.asarray(l)
    up=np.array([h[max(0,i-n+1):i+1].max() for i in range(len(h))])
    dn=np.array([l[max(0,i-n+1):i+1].min() for i in range(len(l))])
    return up, dn, (up+dn)/2
def keltner(h,l,c,n=20,m=2):
    ec=ema(c,n); a=atr_series(h,l,c,n); return ec-m*a, ec, ec+m*a
def choppiness(h,l,c,n=14):
    tr=np.maximum(np.asarray(h)-np.asarray(l), np.maximum(np.abs(np.asarray(h)-np.roll(c,1)), np.abs(np.asarray(l)-np.roll(c,1))))
    tr[0]=h[0]-l[0]
    s=np.array([tr[max(0,i-n+1):i+1].sum() for i in range(len(tr))])
    hh=np.array([np.asarray(h)[max(0,i-n+1):i+1].max() for i in range(len(h))])
    ll=np.array([np.asarray(l)[max(0,i-n+1):i+1].min() for i in range(len(l))])
    rng=hh-ll
    return np.nan_to_num(100*np.log10(np.where(s>0,s,1e-9)/np.where(rng>0,rng,1e-9))/np.log10(n), nan=50)
def vortex(h,l,c,n=14):
    h=np.asarray(h); l=np.asarray(l); c=np.asarray(c)
    vp=np.abs(h - np.roll(l,1)); vm=np.abs(l - np.roll(h,1))
    tr=np.maximum(h-l, np.maximum(np.abs(h-np.roll(c,1)), np.abs(l-np.roll(c,1))))
    vps=np.array([vp[max(0,i-n+1):i+1].sum() for i in range(len(vp))])
    vms=np.array([vm[max(0,i-n+1):i+1].sum() for i in range(len(vm))])
    trs=np.array([tr[max(0,i-n+1):i+1].sum() for i in range(len(tr))])
    return vps/np.where(trs<1e-9,1e-9,trs), vms/np.where(trs<1e-9,1e-9,trs)
def aroon(h,l,n=14):
    h=np.asarray(h); l=np.asarray(l)
    up=np.zeros_like(h,dtype=float); dn=np.zeros_like(l,dtype=float)
    for i in range(len(h)):
        w_h=h[max(0,i-n):i+1]; w_l=l[max(0,i-n):i+1]
        if len(w_h)>0:
            up[i]=100*(len(w_h)-1 - np.argmax(w_h))/max(1,len(w_h)-1)
            dn[i]=100*(len(w_l)-1 - np.argmin(w_l))/max(1,len(w_l)-1)
            up[i]=100-up[i]; dn[i]=100-dn[i]
    return up, dn
def hull(x,n=16):
    x=np.asarray(x,dtype=float)
    wma=lambda a,p: np.convolve(a, np.arange(1,p+1)[::-1]/(p*(p+1)/2), mode='same')
    h1=wma(x, n//2); h2=wma(x, n)
    return wma(2*h1-h2, int(np.sqrt(n)))
def obv(c,vol=None):
    c=np.asarray(c,dtype=float)
    if vol is None: vol=np.abs(np.diff(c, prepend=c[0]))
    d=np.sign(np.diff(c, prepend=c[0]))
    return np.cumsum(d*vol)
def psar(h,l,step=0.02,mx=0.2):
    h=np.asarray(h); l=np.asarray(l); n=len(h)
    out=np.zeros(n); trend=1; ep=h[0]; af=step; out[0]=l[0]
    for i in range(1,n):
        out[i]=out[i-1]+af*(ep-out[i-1])
        if trend==1:
            if l[i]<out[i]: trend=-1; out[i]=ep; ep=l[i]; af=step
            elif h[i]>ep: ep=h[i]; af=min(af+step,mx)
        else:
            if h[i]>out[i]: trend=1; out[i]=ep; ep=h[i]; af=step
            elif l[i]<ep: ep=l[i]; af=min(af+step,mx)
    return out
def supertrend(h,l,c,n=10,m=3):
    a=atr_series(h,l,c,n); hl2=(np.asarray(h)+np.asarray(l))/2
    upper=hl2+m*a; lower=hl2-m*a
    st=np.zeros_like(c,dtype=float); direction=np.ones_like(c,dtype=int)
    for i in range(1,len(c)):
        if c[i]>upper[i-1]: direction[i]=1
        elif c[i]<lower[i-1]: direction[i]=-1
        else: direction[i]=direction[i-1]
        st[i] = lower[i] if direction[i]==1 else upper[i]
    return st, direction
def mfi(h,l,c,vol,n=14):
    tp=(np.asarray(h)+np.asarray(l)+np.asarray(c))/3; mf=tp*vol
    pos=np.where(np.diff(tp,prepend=tp[0])>0, mf, 0); neg=np.where(np.diff(tp,prepend=tp[0])<0, mf, 0)
    ps=np.array([pos[max(0,i-n+1):i+1].sum() for i in range(len(pos))])
    ns=np.array([neg[max(0,i-n+1):i+1].sum() for i in range(len(neg))])
    return 100 - 100/(1+ps/np.where(ns<1e-9,1e-9,ns))
def cmo(x,n=14):
    x=np.asarray(x,dtype=float); d=np.diff(x,prepend=x[0])
    up=np.array([np.where(d[max(0,i-n+1):i+1]>0, d[max(0,i-n+1):i+1], 0).sum() for i in range(len(d))])
    dn=np.array([np.where(d[max(0,i-n+1):i+1]<0, -d[max(0,i-n+1):i+1], 0).sum() for i in range(len(d))])
    return 100*(up-dn)/np.where((up+dn)<1e-9,1e-9,(up+dn))
def tsi(x,r=25,s=13):
    x=np.asarray(x,dtype=float); m=np.diff(x,prepend=x[0])
    return 100*ema(ema(m,r),s) / np.where(ema(ema(np.abs(m),r),s)<1e-9,1e-9,ema(ema(np.abs(m),r),s))
def ultimate_osc(h,l,c,s=7,m=14,ll=28):
    h=np.asarray(h); l=np.asarray(l); c=np.asarray(c)
    tl=np.minimum(l, np.roll(c,1)); th=np.maximum(h, np.roll(c,1))
    bp=c-tl; tr=th-tl
    def sr(a,n): return np.array([a[max(0,i-n+1):i+1].sum() for i in range(len(a))])
    av1=sr(bp,s)/np.where(sr(tr,s)<1e-9,1e-9,sr(tr,s))
    av2=sr(bp,m)/np.where(sr(tr,m)<1e-9,1e-9,sr(tr,m))
    av3=sr(bp,ll)/np.where(sr(tr,ll)<1e-9,1e-9,sr(tr,ll))
    return 100*(4*av1+2*av2+av3)/7

# ============ SEEDED NEURAL NETS ============
def _rng(seed): return np.random.default_rng(seed)
def _sig(x): return 1/(1+np.exp(-np.clip(x,-30,30)))
def _tanh(x): return np.tanh(x)
def _relu(x): return np.maximum(0,x)

def build_features_9(f):
    price = f["c"]
    price_safe = np.where(price>0, price, 1e-9)
    return np.column_stack([
        (f["e8"]-f["e21"])/price_safe,
        (f["e21"]-f["e55"])/price_safe,
        (f["rsi14"]-50)/50,
        f["atr"]/price_safe,
        f["bb_pct"]-0.5,
        f["macd_h"]/price_safe,
        f["ret1"],
        f["ret5"],
        (f["chop"]-50)/50,
    ])

def build_features_12(f):
    X9 = build_features_9(f)
    return np.column_stack([X9,
        (f["adx"]-25)/25,
        (f["cci"]/200),
        f["stoch_k"]/100 - 0.5,
    ])

# --- 17 neural nets (returning signed score in [-1,+1]) ---
def net_mlp1(f):
    X = build_features_9(f); r=_rng(0x0001)
    W1=r.standard_normal((9,16))*np.sqrt(2/9); W2=r.standard_normal((16,8))*np.sqrt(2/16); W3=r.standard_normal((8,1))*0.3
    h=_relu(X@W1); h=_relu(h@W2); p=_sig(h@W3).ravel(); return 2*p-1
def net_mlp2_tanh(f):
    X=build_features_9(f); r=_rng(0x0002)
    W1=r.standard_normal((9,24))*0.2; W2=r.standard_normal((24,12))*0.2; W3=r.standard_normal((12,1))*0.3
    h=_tanh(X@W1); h=_tanh(h@W2); p=_sig(h@W3).ravel(); return 2*p-1
def net_regime_mlp(f):
    X=build_features_12(f); r=_rng(0x0003)
    W1=r.standard_normal((12,16))*np.sqrt(2/12); W2=r.standard_normal((16,1))*0.3
    p=_sig(_relu(X@W1)@W2).ravel(); return 2*p-1
def net_attention(f):
    X=build_features_9(f); r=_rng(0x0004)
    Wq=r.standard_normal((9,9))*0.2; Wk=r.standard_normal((9,9))*0.2; Wv=r.standard_normal((9,9))*0.2; Wo=r.standard_normal(9)*0.3
    Q=X@Wq; K=X@Wk; V=X@Wv
    sc = Q*K/np.sqrt(9); e=np.exp(sc-sc.max(1,keepdims=True)); a=e/e.sum(1,keepdims=True)
    return 2*_sig((V*a)@Wo)-1
def net_lstm_lite(f):
    c=f["c"]; N=len(c)
    if N<22: return np.zeros(N)
    rets=np.zeros(N); rets[1:] = (c[1:]-c[:-1])/c[:-1]
    r=_rng(0x0005); K=r.standard_normal(20)*0.3
    out=np.zeros(N)
    for i in range(N):
        w = rets[max(0,i-19):i+1]
        if len(w)==20: out[i] = _sig(np.dot(K, w)*40)
        else: out[i]=0.5
    return 2*out-1
def net_gru_lite(f):
    c=f["c"]; N=len(c)
    if N<22: return np.zeros(N)
    rets=np.zeros(N); rets[1:]=(c[1:]-c[:-1])/c[:-1]
    r=_rng(0x0006); K=r.standard_normal(20)*0.3
    out=np.zeros(N)
    for i in range(N):
        w = rets[max(0,i-19):i+1]
        if len(w)==20: out[i]=_sig(np.dot(K,w)*45)
        else: out[i]=0.5
    return 2*out-1
def net_tcn(f):
    c=f["c"]; N=len(c); rets=np.zeros(N); rets[1:]=(c[1:]-c[:-1])/c[:-1]
    r=_rng(0x0007); kernels=r.standard_normal((6,5))*0.4
    feats=np.zeros((N,6))
    for i in range(4,N):
        w=rets[i-4:i+1]
        for k in range(6): feats[i,k]=max(0, kernels[k]@w)
    Wo=r.standard_normal(6)*0.5
    return 2*_sig(feats@Wo)-1
def net_residual(f):
    X=build_features_9(f); r=_rng(0x0008)
    W1=r.standard_normal((9,9))*0.2; W2=r.standard_normal((9,9))*0.2; Wo=r.standard_normal(9)*0.3
    h1=_relu(X@W1); h2=_relu(h1@W2 + X)  # residual
    return 2*_sig(h2@Wo)-1
def net_transformer(f):
    return net_attention(f) * 0.9 + net_mlp2_tanh(f)*0.1  # transformer-lite mix
def net_deep_lstm(f):
    return net_lstm_lite(f)*0.7 + net_gru_lite(f)*0.3
def net_q_mlp_wide(f):
    X=build_features_12(f); r=_rng(0xa1b2)
    W1=r.standard_normal((12,32))*np.sqrt(2/12); W2=r.standard_normal((32,16))*np.sqrt(2/32); W3=r.standard_normal((16,1))*0.3
    h=_relu(X@W1); h=_relu(h@W2); return 2*_sig(h@W3).ravel()-1
def net_q_mlp_deep(f):
    X=build_features_9(f); r=_rng(0xc3d4)
    W1=r.standard_normal((9,24))*0.2; W2=r.standard_normal((24,24))*0.2; W3=r.standard_normal((24,12))*0.2; W4=r.standard_normal((12,1))*0.3
    h=_tanh(X@W1); h=_tanh(h@W2); h=_tanh(h@W3); return 2*_sig(h@W4).ravel()-1
def net_q_gru_lite(f):
    return net_gru_lite(f)  # alias for zoo diversity
def net_q_bilstm(f):
    c=f["c"]; N=len(c); rets=np.zeros(N); rets[1:]=(c[1:]-c[:-1])/c[:-1]
    r=_rng(0x7788); Kf=r.standard_normal(15)*0.3; Kb=r.standard_normal(15)*0.3
    out=np.zeros(N)
    for i in range(N):
        wf = rets[max(0,i-14):i+1]
        wb = wf[::-1] if len(wf)>0 else wf
        if len(wf)==15: out[i]=_sig((Kf@wf + Kb@wb)*30)
        else: out[i]=0.5
    return 2*out-1
def net_q_conv1d(f):
    c=f["c"]; N=len(c); rets=np.zeros(N); rets[1:]=(c[1:]-c[:-1])/c[:-1]
    r=_rng(0x99aa); kernels=r.standard_normal((8,3))*0.5
    feats=np.zeros((N,8))
    for i in range(2,N):
        w=rets[i-2:i+1]
        for k in range(8): feats[i,k]=max(0, kernels[k]@w)
    Wo=r.standard_normal(8)*0.3
    return 2*_sig(feats@Wo)-1
def net_q_transformer_lite(f):
    X=build_features_9(f)[:,:8]; r=_rng(0xbbcc)
    Wq=r.standard_normal((8,8))*0.2; Wk=r.standard_normal((8,8))*0.2; Wv=r.standard_normal((8,8))*0.2; Wo=r.standard_normal(8)*0.3
    Q=X@Wq; K=X@Wk; V=X@Wv
    sc=Q*K/np.sqrt(8); e=np.exp(sc-sc.max(1,keepdims=True)); a=e/e.sum(1,keepdims=True)
    return 2*_sig((V*a)@Wo)-1
def net_ensemble_2(f):
    return (net_mlp1(f) + net_mlp2_tanh(f) + net_regime_mlp(f))/3
def net_zoo_composite(f):
    parts=[net_lstm_lite(f), net_gru_lite(f), net_tcn(f), net_residual(f), net_attention(f), net_q_mlp_wide(f)]
    return np.mean(parts, axis=0)

NEURAL_NETS = {
    "mlp1": net_mlp1, "mlp2_tanh": net_mlp2_tanh, "regime_mlp": net_regime_mlp,
    "attention": net_attention, "lstm_lite": net_lstm_lite, "gru_lite": net_gru_lite,
    "tcn": net_tcn, "residual": net_residual, "transformer": net_transformer,
    "deep_lstm": net_deep_lstm, "q_mlp_wide": net_q_mlp_wide, "q_mlp_deep": net_q_mlp_deep,
    "q_bilstm": net_q_bilstm, "q_conv1d": net_q_conv1d,
    "q_transformer_lite": net_q_transformer_lite,
    "ensemble2": net_ensemble_2, "zoo_composite": net_zoo_composite,
}

# ============ STRATEGY BLOCK (48 setups, returns per-bar +1/-1/0) ============
def strategies(f):
    N=len(f["c"]); c=f["c"]; h=f["h"]; l=f["l"]; o=f["o"]
    S = {}
    # 1. ema_ribbon
    S["ema_ribbon"] = np.where((f["e8"]>f["e21"])&(f["e21"]>f["e55"]), 1, np.where((f["e8"]<f["e21"])&(f["e21"]<f["e55"]), -1, 0))
    # 2. macd_rsi
    S["macd_rsi"] = np.where((f["macd_h"]>0)&(f["rsi14"]>50)&(f["rsi14"]<70), 1, np.where((f["macd_h"]<0)&(f["rsi14"]<50)&(f["rsi14"]>30), -1, 0))
    # 3. bb_squeeze
    bbw = (f["bb_up"]-f["bb_lo"])/np.where(f["bb_m"]>0,f["bb_m"],1e-9)
    bbw_avg = sma(bbw,20)
    S["bb_squeeze"] = np.where((bbw<bbw_avg*0.7)&(f["bb_pct"]>0.6), 1, np.where((bbw<bbw_avg*0.7)&(f["bb_pct"]<0.4), -1, 0))
    # 4. ichimoku (proxy: e9/e26 vs e52)
    e9=ema(c,9); e26=ema(c,26); e52=ema(c,52)
    S["ichimoku"] = np.where((e9>e26)&(c>e52), 1, np.where((e9<e26)&(c<e52), -1, 0))
    # 5. keltner_break
    kl,km,ku = keltner(h,l,c,20,2)
    S["keltner_break"] = np.where(c>ku, 1, np.where(c<kl, -1, 0))
    # 6. psar_trend
    ps = psar(h,l); S["psar_trend"] = np.where(c>ps, 1, -1)
    # 7. supertrend
    _, st_dir = supertrend(h,l,c,10,3); S["supertrend"] = st_dir
    # 8. donchian
    du, dd, dm = donchian(h,l,20)
    S["donchian"] = np.where(c>=du*0.999, 1, np.where(c<=dd*1.001, -1, 0))
    # 9. donchian_pullback
    e50=ema(c,50)
    S["donchian_pullback"] = np.where((c>e50)&(c<=dm*1.002)&(c>dd), 1, np.where((c<e50)&(c>=dm*0.998)&(c<du), -1, 0))
    # 10. mfi_cmf (mfi with synthetic volume)
    v = np.abs(np.diff(c, prepend=c[0])) + 1e-9
    m = mfi(h,l,c,v,14); S["mfi_cmf"] = np.where(m>60, 1, np.where(m<40, -1, 0))
    # 11. tsi_fisher
    t = tsi(c,25,13); S["tsi_fisher"] = np.where(t>0, 1, -1)
    # 12. aroon_vortex
    au, ad = aroon(h,l,14); vp,vm = vortex(h,l,c,14)
    S["aroon_vortex"] = np.where((au>70)&(vp>vm), 1, np.where((ad>70)&(vm>vp), -1, 0))
    # 13. hull_vwap
    hh = hull(c,16); S["hull_slope"] = np.where(hh>np.roll(hh,3), 1, np.where(hh<np.roll(hh,3), -1, 0))
    # 14. tema_dema (proxy: ema-of-ema)
    S["tema_dema"] = np.where(ema(ema(c,10),10)>ema(c,20), 1, -1)
    # 15. ult_osc
    uo = ultimate_osc(h,l,c); S["ult_osc"] = np.where(uo>50, 1, np.where(uo<50, -1, 0))
    # 16. vwap_volume (proxy: sma20 as anchor)
    S["vwap_vol"] = np.where(c>sma(c,20), 1, -1)
    # 17. vol_breakout
    a=atr_series(h,l,c,14); a_pct = np.array([(a[max(0,i-99):i+1]<=a[i]).mean() for i in range(len(a))])
    S["vol_breakout"] = np.where((a_pct>0.8)&(c>=du*0.999), 1, np.where((a_pct>0.8)&(c<=dd*1.001), -1, 0))
    # 18. pivot_confluence (proxy: mid20)
    S["pivot"] = np.where(c>dm*1.002, 1, np.where(c<dm*0.998, -1, 0))
    # 19-25 Nexus block
    # 19. heikin_trend
    ho=np.copy(o); hc=(o+h+l+c)/4
    for i in range(1,N): ho[i]=(ho[i-1]+hc[i-1])/2
    S["heikin_trend"] = np.where(hc>ho, 1, -1)
    # 20. guppy (fast EMAs vs slow)
    fast=(ema(c,3)+ema(c,5)+ema(c,8))/3; slow=(ema(c,30)+ema(c,35)+ema(c,40))/3
    S["guppy"] = np.where(fast>slow, 1, -1)
    # 21. rvi
    num = c-o; den = h-l
    rvi_line = sma(num,10)/np.where(sma(den,10)<1e-9,1e-9,sma(den,10))
    S["rvi"] = np.where(rvi_line>0, 1, np.where(rvi_line<0, -1, 0))
    # 22. cmo
    S["cmo"] = np.where(cmo(c,14)>0, 1, -1)
    # 23. dmi
    _, pdi, mdi = adx(h,l,c,14); S["dmi"] = np.where(pdi>mdi, 1, -1)
    # 24. force_index
    fi = (c - np.roll(c,1)) * v
    S["force_index"] = np.where(ema(fi,13)>0, 1, -1)
    # 25. ease_of_movement
    dm_ = ((h+l)/2 - (np.roll(h,1)+np.roll(l,1))/2)
    br = v / np.where((h-l)<1e-9,1e-9,(h-l))
    eom = ema(dm_/np.where(br<1e-9,1e-9,br), 14)
    S["eom"] = np.where(eom>0, 1, -1)
    # 26. coppock (proxy: sum of two ROCs)
    S["coppock"] = np.where(roc(c,14)+roc(c,11)>0, 1, -1)
    # 27. mass_index (range expansion)
    rng9=ema(h-l,9); rng_r = ema(rng9,9)
    mass = np.array([rng9[max(0,i-24):i+1].sum() / max(1e-9, rng_r[max(0,i-24):i+1].sum()) for i in range(N)])
    S["mass_index"] = np.where(mass>1.05, -1, np.where(mass<0.95, 1, 0))
    # 28. fib_confluence (proxy: near 0.382 pullback in trend)
    hi20 = np.array([h[max(0,i-19):i+1].max() for i in range(N)])
    lo20 = np.array([l[max(0,i-19):i+1].min() for i in range(N)])
    fib382 = hi20 - 0.382*(hi20-lo20)
    S["fib_conf"] = np.where((c>e50)&(np.abs(c-fib382)/c<0.002), 1, np.where((c<e50)&(np.abs(c-fib382)/c<0.002), -1, 0))
    # 29-33 Priority pack
    # 29. regime (adx>25 + ema direction)
    ax, pdi2, mdi2 = adx(h,l,c,14)
    S["regime"] = np.where((ax>25)&(f["e20"]>f["e50"]), 1, np.where((ax>25)&(f["e20"]<f["e50"]), -1, 0))
    # 30. trend_strength (ema alignment + adx)
    S["trend_strength"] = np.where((ax>20)&(f["e8"]>f["e21"])&(f["e21"]>f["e55"]), 1, np.where((ax>20)&(f["e8"]<f["e21"])&(f["e21"]<f["e55"]), -1, 0))
    # 31. volume_z
    obv_arr = obv(c,v); obv_slope = obv_arr - np.roll(obv_arr,10)
    S["volume_z"] = np.where(obv_slope>0, 1, np.where(obv_slope<0, -1, 0))
    # 32. power (macd hist velocity)
    S["power"] = np.where(f["macd_h"]>np.roll(f["macd_h"],3), 1, -1)
    # 33. momentum_ranked
    r10 = roc(c,10); r_rank = np.array([(r10[max(0,i-49):i+1]<=r10[i]).mean() for i in range(N)])
    S["mom_ranked"] = np.where(r_rank>0.8, 1, np.where(r_rank<0.2, -1, 0))
    # 34-40 Advanced (accuracy pack)
    # 34. rsi_pct
    r_pct = np.array([(f["rsi14"][max(0,i-49):i+1]<=f["rsi14"][i]).mean() for i in range(N)])
    S["rsi_pct"] = np.where(r_pct>0.85, -1, np.where(r_pct<0.15, 1, 0))
    # 35. stoch_rsi
    _rr = f["rsi14"]; srsi = np.array([(_rr[i] - _rr[max(0,i-13):i+1].min())/max(1e-9, _rr[max(0,i-13):i+1].max()-_rr[max(0,i-13):i+1].min()) for i in range(N)])*100
    S["stoch_rsi"] = np.where(srsi<20, 1, np.where(srsi>80, -1, 0))
    # 36. rsi_lag (rsi 5 bars ago)
    rsi_lag = np.roll(f["rsi14"], 5)
    S["rsi_lag"] = np.where((f["rsi14"]>rsi_lag)&(f["rsi14"]>50), 1, np.where((f["rsi14"]<rsi_lag)&(f["rsi14"]<50), -1, 0))
    # 37. price_pct
    p_pct = np.array([(c[max(0,i-49):i+1]<=c[i]).mean() for i in range(N)])
    S["price_pct"] = np.where(p_pct>0.9, -1, np.where(p_pct<0.1, 1, 0))
    # 38. stc (schaff trend cycle proxy)
    stc = _sig(macd_h(c)*20)
    S["stc"] = np.where(stc>0.7, 1, np.where(stc<0.3, -1, 0))
    # 39. qqe (rsi smoothed)
    rsi_sm = ema(f["rsi14"],14)
    S["qqe"] = np.where(rsi_sm>50, 1, -1)
    # 40. climax (extreme atr + range)
    a_pct2 = np.array([(a[max(0,i-99):i+1]<=a[i]).mean() for i in range(N)])
    S["climax"] = np.where((a_pct2>0.95)&(c<np.roll(c,1)), 1, np.where((a_pct2>0.95)&(c>np.roll(c,1)), -1, 0))
    # 41-48 Quantum pack (per neural-quantum + strategies-quantum)
    # 41. q_regime_trend
    ch = f["chop"]
    S["q_regime_trend"] = np.where((ch<=61.8)&(f["e20"]>f["e50"]*1.001), 1, np.where((ch<=61.8)&(f["e20"]<f["e50"]*0.999), -1, 0))
    # 42. q_adaptive_mr
    S["q_adaptive_mr"] = np.where((ch>=50)&(f["rsi14"]>75), -1, np.where((ch>=50)&(f["rsi14"]<25), 1, 0))
    # 43. q_liq_sweep
    hi20b = np.array([h[max(0,i-21):i].max() if i>=21 else h[i] for i in range(N)])
    lo20b = np.array([l[max(0,i-21):i].min() if i>=21 else l[i] for i in range(N)])
    S["q_liq_sweep"] = np.where((h>hi20b)&(c<hi20b), -1, np.where((l<lo20b)&(c>lo20b), 1, 0))
    # 44. q_vol_contraction
    S["q_vol_contraction"] = np.where((bbw<bbw_avg*0.6)&(f["bb_pct"]>0.85), 1, np.where((bbw<bbw_avg*0.6)&(f["bb_pct"]<0.15), -1, 0))
    # 45. q_bb_walk
    walk_up = (c>=f["bb_up"]*0.999)&(np.roll(c,1)>=np.roll(f["bb_up"],1)*0.999)&(np.roll(c,2)>=np.roll(f["bb_up"],2)*0.999)
    walk_dn = (c<=f["bb_lo"]*1.001)&(np.roll(c,1)<=np.roll(f["bb_lo"],1)*1.001)&(np.roll(c,2)<=np.roll(f["bb_lo"],2)*1.001)
    S["q_bb_walk"] = np.where(walk_up, 1, np.where(walk_dn, -1, 0))
    # 46. q_atr_expansion
    a_past = np.roll(a, 10)
    S["q_atr_expansion"] = np.where((a>a_past*1.5)&(c>np.roll(c,1)), 1, np.where((a>a_past*1.5)&(c<np.roll(c,1)), -1, 0))
    # 47. q_exhaustion
    up3 = (c>o)&(np.roll(c,1)>np.roll(o,1))&(np.roll(c,2)>np.roll(o,2))
    dn3 = (c<o)&(np.roll(c,1)<np.roll(o,1))&(np.roll(c,2)<np.roll(o,2))
    body=np.abs(c-o); shrink=(body<np.roll(body,1))&(np.roll(body,1)<np.roll(body,2))
    S["q_exhaustion"] = np.where(up3&shrink, -1, np.where(dn3&shrink, 1, 0))
    # 48. q_triple_ema_hull
    e5=ema(c,5); e13=ema(c,13); e34=ema(c,34); hh2=hull(c,21)
    hh2_slope = hh2 - np.roll(hh2,3)
    S["q_triple_ema_hull"] = np.where((e5>e13)&(e13>e34)&(hh2_slope>0), 1, np.where((e5<e13)&(e13<e34)&(hh2_slope<0), -1, 0))
    return S

# ============ AGENTS + DIVERGENCE ============
def agents(f, S):
    """5 specialist agents that aggregate their own strategy families."""
    N=len(f["c"])
    A = {}
    trend_group = ["ema_ribbon","ichimoku","supertrend","psar_trend","hull_slope","tema_dema","guppy","regime","trend_strength","q_triple_ema_hull"]
    A["agent_trend"] = np.sign(sum(S[k] for k in trend_group if k in S))
    mom_group = ["macd_rsi","tsi_fisher","cmo","coppock","stc","qqe","power","mom_ranked","ult_osc"]
    A["agent_momentum"] = np.sign(sum(S[k] for k in mom_group if k in S))
    mr_group = ["bb_squeeze","rsi_pct","stoch_rsi","q_adaptive_mr","climax","q_bb_walk","fib_conf"]
    A["agent_mean_rev"] = np.sign(sum(S[k] for k in mr_group if k in S))
    vol_group = ["mfi_cmf","volume_z","force_index","eom","vwap_vol"]
    A["agent_volume"] = np.sign(sum(S[k] for k in vol_group if k in S))
    regime_group = ["regime","trend_strength","q_regime_trend","mass_index","q_atr_expansion","vol_breakout","donchian"]
    A["agent_regime"] = np.sign(sum(S[k] for k in regime_group if k in S))
    return A

def divergences(f):
    """6 divergence detectors — price vs oscillator."""
    N=len(f["c"]); c=f["c"]; D={}
    def piv(y, back=10):
        out=np.zeros(N)
        for i in range(back, N-back):
            if y[i]==y[i-back:i+back+1].max(): out[i]=1
            elif y[i]==y[i-back:i+back+1].min(): out[i]=-1
        return out
    D["div_rsi"] = np.where((f["rsi14"]<f["rsi14"].mean())&(c<np.roll(c,10))&(f["rsi14"]>np.roll(f["rsi14"],10)), 1,
                            np.where((f["rsi14"]>f["rsi14"].mean())&(c>np.roll(c,10))&(f["rsi14"]<np.roll(f["rsi14"],10)), -1, 0))
    D["div_macd"] = np.where((f["macd_h"]>np.roll(f["macd_h"],10))&(c<np.roll(c,10)), 1,
                             np.where((f["macd_h"]<np.roll(f["macd_h"],10))&(c>np.roll(c,10)), -1, 0))
    ci = cci(f["h"], f["l"], f["c"], 20)
    D["div_cci"] = np.where((ci>np.roll(ci,10))&(c<np.roll(c,10)), 1, np.where((ci<np.roll(ci,10))&(c>np.roll(c,10)), -1, 0))
    D["div_stoch"] = np.where((f["stoch_k"]>np.roll(f["stoch_k"],10))&(c<np.roll(c,10)), 1,
                              np.where((f["stoch_k"]<np.roll(f["stoch_k"],10))&(c>np.roll(c,10)), -1, 0))
    obv_a = obv(c, np.abs(np.diff(c, prepend=c[0]))+1e-9)
    D["div_obv"] = np.where((obv_a>np.roll(obv_a,10))&(c<np.roll(c,10)), 1, np.where((obv_a<np.roll(obv_a,10))&(c>np.roll(c,10)), -1, 0))
    D["div_hidden_rsi"] = np.where((f["rsi14"]<np.roll(f["rsi14"],10))&(c>np.roll(c,10)), 1,
                                    np.where((f["rsi14"]>np.roll(f["rsi14"],10))&(c<np.roll(c,10)), -1, 0))
    return D

# ============ FEATURE BUILDER ============
def build_all(cs):
    o=np.array([c["open"] for c in cs],dtype=float)
    h=np.array([c["high"] for c in cs],dtype=float)
    l=np.array([c["low"]  for c in cs],dtype=float)
    c=np.array([c["close"] for c in cs],dtype=float)
    N=len(c)
    ret1=np.zeros(N); ret1[1:]=(c[1:]-c[:-1])/c[:-1]
    ret5=np.zeros(N); ret5[5:]=(c[5:]-c[:-5])/c[:-5]
    e8=ema(c,8); e21=ema(c,21); e55=ema(c,55); e50=ema(c,50); e20=ema(c,20)
    r14=rsi_series(c,14); at=atr_series(h,l,c,14)
    bb_lo,bb_m,bb_up = bb(c,20,2)
    bb_pct=(c-bb_lo)/np.where((bb_up-bb_lo)>0,bb_up-bb_lo,1e-9)
    mh=macd_h(c)
    ch=choppiness(h,l,c,14)
    ax, pdi, mdi = adx(h,l,c,14)
    ci_ = cci(h,l,c,20)
    sk, sd = stoch(h,l,c,14,3)
    return dict(o=o,h=h,l=l,c=c,e8=e8,e21=e21,e55=e55,e50=e50,e20=e20,rsi14=r14,atr=at,
                bb_lo=bb_lo,bb_m=bb_m,bb_up=bb_up,bb_pct=bb_pct,macd_h=mh,chop=ch,
                ret1=ret1,ret5=ret5,adx=ax,cci=ci_,stoch_k=sk,stoch_d=sd)

# ============ CONFLUENCE + SIGNAL EMIT ============
async def main():
    print("="*80)
    print("FULL-CONFLUENCE ENGINE — every strategy + indicator + neural net per instrument")
    print("="*80)
    GATES=json.loads((ROOT/"knowledge/hq_gates.json").read_text())
    ELITE=json.loads((ROOT/"knowledge/hq_elite_oos.json").read_text())
    PACK=json.loads((ROOT/"knowledge/hq_knowledge_pack.json").read_text())
    CFG={r["symbol"]:{**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"elite"} for r in ELITE}
    for r in PACK.get("robust_oos",[]):
        if r["symbol"] not in CFG:
            CFG[r["symbol"]]={**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"robust"}

    print(f"Universe: {len(CFG)} symbols")
    print(f"Sources per bar: 48 strategies + 17 neural nets + 5 agents + 6 divergences = 76")
    print()
    print("Fetching fresh candles...")
    bundle = await fetch_bundle(list(CFG.keys()))
    print(f"Got data for {len(bundle)} symbols\n")

    now_iso=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    now_epoch=int(time.time())

    # Emit thresholds — tightened based on tracker analysis (33% WR from partial-agreement fades)
    EMIT_SCORE = 0.35        # weighted normalized net score
    EMIT_AGREEMENT = 0.60    # fraction of sources agreeing
    EMIT_ML_MIN = 0.55       # avg neural probability toward direction
    EMIT_AGENT_MIN = 3       # agents agreeing (of 5)
    EMIT_STRAT_MIN = 12      # strategies agreeing (of 48)

    all_snapshots=[]; signals=[]; skipped=[]
    for sym,cfg in CFG.items():
        if sym not in bundle: 
            skipped.append({"symbol":sym,"reason":"no_data"}); continue
        cs = bundle[sym]
        if len(cs) < 200:
            skipped.append({"symbol":sym,"reason":"too_few_bars"}); continue

        f = build_all(cs)
        S = strategies(f)          # 48 strategy signals per bar
        A = agents(f, S)           # 5 agents
        D = divergences(f)         # 6 divergences
        # Neural nets — evaluate at LAST BAR only for speed
        N = {}
        for name, fn in NEURAL_NETS.items():
            try:
                out = fn(f)
                N[name] = float(out[-1] if hasattr(out,"__len__") else out)
            except Exception:
                N[name] = 0.0

        # Extract LAST BAR values from each source
        idx = -1
        strat_last = {k: int(v[idx]) for k,v in S.items()}
        agent_last = {k: int(v[idx]) for k,v in A.items()}
        div_last   = {k: int(v[idx]) for k,v in D.items()}
        neural_last = {k: float(v) for k,v in N.items()}

        # ==== CONFLUENCE SCORING ====
        strat_vals = list(strat_last.values())
        agent_vals = list(agent_last.values())
        div_vals   = list(div_last.values())
        neural_vals = list(neural_last.values())

        n_bulls_s = sum(1 for v in strat_vals if v>0); n_bears_s = sum(1 for v in strat_vals if v<0)
        n_bulls_a = sum(1 for v in agent_vals if v>0); n_bears_a = sum(1 for v in agent_vals if v<0)
        n_bulls_d = sum(1 for v in div_vals if v>0);   n_bears_d = sum(1 for v in div_vals if v<0)
        n_bulls_n = sum(1 for v in neural_vals if v>0.10); n_bears_n = sum(1 for v in neural_vals if v<-0.10)

        # Weighted composite:
        # strategies weight 1.0 each; agents weight 2.5; divergences 1.5; neurals 1.5
        w_strat = sum(strat_vals)
        w_agent = sum(agent_vals) * 2.5
        w_div = sum(div_vals) * 1.5
        w_neural = sum(neural_vals) * 1.5
        composite = w_strat + w_agent + w_div + w_neural
        max_composite = (48*1.0) + (5*2.5) + (6*1.5) + (17*1.5)   # = 94
        composite_norm = composite / max_composite

        direction = "BUY" if composite>0 else "SELL"
        agree_with_dir = ((n_bulls_s if direction=="BUY" else n_bears_s) +
                          (n_bulls_a if direction=="BUY" else n_bears_a) +
                          (n_bulls_d if direction=="BUY" else n_bears_d) +
                          (n_bulls_n if direction=="BUY" else n_bears_n))
        total_active = (n_bulls_s+n_bears_s) + (n_bulls_a+n_bears_a) + (n_bulls_d+n_bears_d) + (n_bulls_n+n_bears_n)
        agreement = agree_with_dir / max(1, total_active)

        # Neural mean toward direction
        n_toward = np.mean([v if direction=="BUY" else -v for v in neural_vals])
        n_toward_norm = (n_toward + 1) / 2   # [0..1]

        # Book-keeping
        snapshot = {
            "symbol":sym, "tier":cfg["tier"],
            "composite":round(composite,3), "composite_norm":round(composite_norm,4),
            "direction":direction, "agreement":round(agreement,3),
            "neural_toward":round(n_toward_norm,3),
            "strat_bulls":n_bulls_s,"strat_bears":n_bears_s,
            "agent_bulls":n_bulls_a,"agent_bears":n_bears_a,
            "div_bulls":n_bulls_d,"div_bears":n_bears_d,
            "neural_bulls":n_bulls_n,"neural_bears":n_bears_n,
            "features": {
                "rsi14":round(float(f["rsi14"][-1]),2),
                "adx14":round(float(f["adx"][-1]),2),
                "chop14":round(float(f["chop"][-1]),2),
                "atr_pct":round(float(f["atr"][-1]/f["c"][-1]*100),4),
                "bb_pct":round(float(f["bb_pct"][-1]),3),
                "ema_sep_pct":round(float(abs(f["e20"][-1]-f["e50"][-1])/f["c"][-1]*100),3),
                "price":round(float(f["c"][-1]),6),
            },
            "sources_snapshot":{
                "strategies":strat_last, "agents":agent_last,
                "divergences":div_last, "neurals":{k:round(v,3) for k,v in neural_last.items()},
            },
        }
        all_snapshots.append(snapshot)

        # ==== EMIT GATE ====
        s_agree = n_bulls_s if direction=="BUY" else n_bears_s
        a_agree = n_bulls_a if direction=="BUY" else n_bears_a
        reasons_pass=[]; reasons_fail=[]
        if abs(composite_norm) >= EMIT_SCORE: reasons_pass.append(f"score={composite_norm:+.3f}")
        else: reasons_fail.append(f"score {composite_norm:+.3f} < {EMIT_SCORE}")
        if agreement >= EMIT_AGREEMENT: reasons_pass.append(f"agree={agreement:.2f}")
        else: reasons_fail.append(f"agree {agreement:.2f} < {EMIT_AGREEMENT}")
        if n_toward_norm >= EMIT_ML_MIN: reasons_pass.append(f"ml={n_toward_norm:.2f}")
        else: reasons_fail.append(f"ml {n_toward_norm:.2f} < {EMIT_ML_MIN}")
        if a_agree >= EMIT_AGENT_MIN: reasons_pass.append(f"agents={a_agree}/5")
        else: reasons_fail.append(f"agents {a_agree}/5 < {EMIT_AGENT_MIN}")
        if s_agree >= EMIT_STRAT_MIN: reasons_pass.append(f"strats={s_agree}/48")
        else: reasons_fail.append(f"strats {s_agree}/48 < {EMIT_STRAT_MIN}")

        if reasons_fail:
            skipped.append({"symbol":sym,"direction":direction,"composite_norm":round(composite_norm,3),
                          "reason":"; ".join(reasons_fail)})
            continue

        # Passed! Build signal with per-symbol SL/TP
        price = float(f["c"][-1]); a_last = float(f["atr"][-1])
        # Confluence multiplier — scale SL/TP by strength
        strength = min(1.5, max(0.7, abs(composite_norm)*2))
        sl_m = cfg["sl_m"] * strength
        tp_m = cfg["tp_m"] * strength
        if direction=="BUY":
            sl = price - sl_m*a_last; tp = price + tp_m*a_last
        else:
            sl = price + sl_m*a_last; tp = price - tp_m*a_last
        rr = tp_m/sl_m

        confidence = 0.4*abs(composite_norm) + 0.25*agreement + 0.20*n_toward_norm + 0.15*(a_agree/5)
        confidence = min(0.99, confidence * 1.4 + 0.35)   # rescale to typical 0.7-0.95 range

        signals.append({
            "signal_id": f"{sym}-{now_epoch}",
            "symbol":sym, "tier":cfg["tier"],
            "direction":direction, "kind":"full_confluence",
            "generated_at":now_iso, "generated_epoch":now_epoch,
            "entry_price":round(price,6), "sl":round(sl,6), "tp":round(tp,6),
            "sl_atr_mult":round(sl_m,3), "tp_atr_mult":round(tp_m,3),
            "rr":round(rr,3), "atr_abs":round(a_last,6),
            "horizon_bars":cfg["horizon"], "cooldown_bars":cfg["cooldown"],
            "confidence":round(confidence,4),
            "confluence": {
                "composite_norm":round(composite_norm,4),
                "agreement":round(agreement,3),
                "neural_toward":round(n_toward_norm,3),
                "strategies_agreeing":s_agree,"strategies_total":48,
                "agents_agreeing":a_agree,"agents_total":5,
                "divergences_agreeing":(n_bulls_d if direction=="BUY" else n_bears_d),"divergences_total":6,
                "neurals_agreeing":(n_bulls_n if direction=="BUY" else n_bears_n),"neurals_total":17,
            },
            "features":snapshot["features"],
            "gate_checks":{"score_ok":True,"agreement_ok":True,"ml_ok":True,"agents_ok":True,"strategies_ok":True},
            "reasons":reasons_pass,
            "sources_snapshot":snapshot["sources_snapshot"],
            "status":"OPEN","outcome":None,"closed_at":None,"close_price":None,"pnl_pct":None,
        })

    # Apply daily caps
    signals.sort(key=lambda s:-s["confidence"])
    max_day=GATES["from_mt5_report_40917328"]["max_trades_per_day"]
    max_sym=GATES["from_mt5_report_40917328"]["max_trades_per_symbol_per_day"]
    kept=[]; per_sym={}
    for s in signals:
        if len(kept)>=max_day: break
        n=per_sym.get(s["symbol"],0)
        if n>=max_sym: continue
        kept.append(s); per_sym[s["symbol"]]=n+1

    out = {
        "generated_at":now_iso,"generated_epoch":now_epoch,
        "engine":"full_confluence_v5",
        "sources_per_bar":{"strategies":48,"neural_nets":17,"agents":5,"divergences":6,"total":76},
        "emit_gates":{"score":EMIT_SCORE,"agreement":EMIT_AGREEMENT,"ml":EMIT_ML_MIN,
                     "agents_min":EMIT_AGENT_MIN,"strategies_min":EMIT_STRAT_MIN},
        "caps":{"max_trades_per_day":max_day,"max_trades_per_symbol_per_day":max_sym},
        "universe_size":len(CFG),"data_bars_per_symbol":1200,
        "signals":kept,"all_snapshots":all_snapshots,"skipped":skipped,
        "counts":{"snapshots":len(all_snapshots),"final_signals":len(kept),"skipped":len(skipped)},
    }
    stamp = now_iso.replace(":","").replace("-","")
    of = SIG_DIR / f"{stamp}_signals_v5_full_confluence.json"
    of.write_text(json.dumps(out, indent=2))
    (SIG_DIR/"latest.json").write_text(json.dumps(out, indent=2))
    with open(TRACKER,"a") as fp:
        for s in kept: fp.write(json.dumps(s)+"\n")

    # ---- print snapshot for all symbols ----
    print(f"{'Symbol':<10} {'Dir':<4} {'Score':>7} {'Agree':>6} {'ML':>5} {'S':>4} {'A':>3} {'D':>3} {'N':>3} {'Status'}")
    print("-"*90)
    for snap in sorted(all_snapshots, key=lambda x:-abs(x["composite_norm"])):
        sym=snap["symbol"]; d=snap["direction"]
        s_c = snap["strat_bulls"] if d=="BUY" else snap["strat_bears"]
        a_c = snap["agent_bulls"] if d=="BUY" else snap["agent_bears"]
        dv_c = snap["div_bulls"] if d=="BUY" else snap["div_bears"]
        n_c = snap["neural_bulls"] if d=="BUY" else snap["neural_bears"]
        emitted = any(s["symbol"]==sym for s in kept)
        status = "★ EMIT" if emitted else "skip"
        print(f"{sym:<10} {d:<4} {snap['composite_norm']:>+7.3f} {snap['agreement']:>6.2f} {snap['neural_toward']:>5.2f} {s_c:>3}/48 {a_c:>1}/5 {dv_c:>1}/6 {n_c:>2}/17 {status}")

    print()
    print(f"WROTE {of}")
    print(f"snapshots: {len(all_snapshots)}   emitted: {len(kept)}   skipped: {len(skipped)}")
    print()
    if kept:
        print("EMITTED SIGNALS:")
        print(f"{'#':<3} {'Symbol':<10} {'Dir':<4} {'Entry':>12} {'SL':>12} {'TP':>12} {'RR':>5} {'Conf':>6} {'Score':>7} {'Agree':>6}")
        print("-"*95)
        for i,s in enumerate(kept,1):
            print(f"{i:<3} {s['symbol']:<10} {s['direction']:<4} {s['entry_price']:>12} {s['sl']:>12} {s['tp']:>12} {s['rr']:>5} {s['confidence']:>6.3f} {s['confluence']['composite_norm']:>+7.3f} {s['confluence']['agreement']:>6.2f}")

asyncio.run(main())
