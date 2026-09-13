"""Advanced trading analysis: correlation, order flow, momentum, strength,
divergence, and a neural-network forecaster. Pure-Python (numpy only)."""
import math
from statistics import mean, pstdev

# ---------- indicators ----------
def ema(v, p):
    if len(v) < p: return None
    k = 2/(p+1); e = mean(v[:p])
    for x in v[p:]: e = x*k + e*(1-k)
    return e
def sma(v, p): return mean(v[-p:]) if len(v) >= p else None
def rsi_series(v, p=14):
    if len(v) < p+1: return []
    out = [None]*p
    for i in range(p, len(v)):
        g, l = [], []
        for j in range(i-p+1, i+1):
            d = v[j]-v[j-1]; g.append(max(d,0)); l.append(max(-d,0))
        ag, al = mean(g), mean(l)
        out.append(100 - 100/(1+ag/al) if al else 100.0)
    return out
def macd_series(c):
    def ema_all(v,p):
        if len(v)<p: return [None]*len(v)
        k=2/(p+1); e=mean(v[:p]); out=[None]*(p-1)+[e]
        for x in v[p:]: e=x*k+e*(1-k); out.append(e)
        return out
    e12, e26 = ema_all(c,12), ema_all(c,26)
    return [ (a-b) if (a is not None and b is not None) else None for a,b in zip(e12,e26) ]
def stdev(v,p=20): return pstdev(v[-p:]) if len(v)>=p else None
def slope(v, n=10):
    if len(v)<n: return 0
    y=v[-n:]; x=list(range(n)); xm=mean(x); ym=mean(y)
    num=sum((xi-xm)*(yi-ym) for xi,yi in zip(x,y)); den=sum((xi-xm)**2 for xi in x)
    return num/den if den else 0

# ---------- correlation ----------
def pearson(a, b):
    n=min(len(a),len(b))
    if n<3: return None
    a,b=a[-n:],b[-n:]; ma,mb=mean(a),mean(b)
    num=sum((x-ma)*(y-mb) for x,y in zip(a,b))
    da=math.sqrt(sum((x-ma)**2 for x in a)); db=math.sqrt(sum((y-mb)**2 for y in b))
    return num/(da*db) if da and db else None

def correlation_matrix(series_map):
    """series_map: {instrument: closes[]} -> pairwise Pearson on returns."""
    def rets(c): return [(c[i]-c[i-1])/c[i-1] for i in range(1,len(c)) if c[i-1]]
    names=list(series_map.keys()); R={k: rets(v) for k,v in series_map.items()}
    matrix={}
    for a in names:
        matrix[a]={}
        for b in names:
            matrix[a][b]= round(pearson(R[a],R[b]),3) if a!=b else 1.0
    return {"instruments": names, "matrix": matrix}

# ---------- order flow (volume) ----------
def order_flow(series):
    c,h,l,v = series["closes"], series["highs"], series["lows"], series.get("volumes") or []
    if not v or len(v)<len(c): v=[1]*len(c)
    tp=[(h[i]+l[i]+c[i])/3 for i in range(len(c))]
    # cumulative delta proxy: signed volume by close direction
    delta=0; deltas=[]
    for i in range(1,len(c)):
        s=v[i] if c[i]>c[i-1] else -v[i] if c[i]<c[i-1] else 0
        delta+=s; deltas.append(delta)
    poc=tp[v.index(max(v))] if v else c[-1]      # point of control (highest volume price)
    vwap=sum(tp[i]*v[i] for i in range(len(c)))/sum(v) if sum(v) else c[-1]
    return {"cumulative_delta": round(delta,2), "poc": round(poc,5), "vwap": round(vwap,5),
            "delta_trend": "rising" if len(deltas)>5 and deltas[-1]>deltas[-5] else "falling"}

# ---------- momentum suite ----------
def momentum(series):
    c=series["closes"]
    r=rsi_series(c); m=macd_series(c)
    mvals=[x for x in m if x is not None]; rvals=[x for x in r if x is not None]
    roc=(c[-1]-c[-6])/c[-6]*100 if len(c)>6 and c[-6] else 0
    return {"rsi": round(rvals[-1],2) if rvals else None,
            "rsi_slope": round(slope(rvals),3) if len(rvals)>10 else None,
            "macd": round(mvals[-1],5) if mvals else None,
            "macd_rising": (mvals[-1]>mvals[-2]) if len(mvals)>1 else None,
            "roc_5": round(roc,3),
            "mom_score": round((slope(c,10)/(mean(c[-10:]) or 1))*1000,3)}

# ---------- strength (ADX-lite + composite) ----------
def strength(series):
    c,h,l=series["closes"],series["highs"],series["lows"]
    if len(c)<15: return {"adx": None, "strength": "weak"}
    pdm=sum(max(h[i]-h[i-1],0) for i in range(-14,0) if h[i]-h[i-1]>l[i-1]-l[i])
    ndm=sum(max(l[i-1]-l[i],0) for i in range(-14,0) if l[i-1]-l[i]>h[i]-h[i-1])
    tr=sum(max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(-14,0))
    pdi=100*pdm/tr if tr else 0; ndi=100*ndm/tr if tr else 0
    dx=100*abs(pdi-ndi)/(pdi+ndi) if (pdi+ndi) else 0
    trend="bullish" if pdi>ndi else "bearish"
    lvl="strong" if dx>25 else "moderate" if dx>18 else "weak"
    return {"adx": round(dx,2), "pdi": round(pdi,2), "ndi": round(ndi,2), "trend": trend, "strength": lvl}

# ---------- divergence ----------
def divergence(series):
    c=series["closes"]; r=[x for x in rsi_series(c) if x is not None]
    if len(r)<20 or len(c)<20: return {"divergence": "none"}
    # regular divergence: price new low vs RSI higher low (bullish), and inverse
    pl=c[-1]<min(c[-20:-1]); rl=r[-1]>min(r[-20:-1])
    ph=c[-1]>max(c[-20:-1]); rh=r[-1]<max(r[-20:-1])
    if pl and rl: return {"divergence":"bullish"}
    if ph and rh: return {"divergence":"bearish"}
    return {"divergence":"none"}

# ---------- neural network (numpy MLP, online-trained on the series) ----------
def neural_forecast(series, ahead=5):
    try:
        import numpy as np
    except Exception:
        return {"ok": False, "error": "numpy not available"}
    c=np.array(series["closes"], dtype=float)
    if len(c)<60: return {"ok": False, "error": "need 60+ bars"}
    # normalize to returns
    rets=np.diff(c)/c[:-1]
    W=8  # window
    X=np.array([rets[i:i+W] for i in range(len(rets)-W-1)])
    y=rets[W+1:]
    # small MLP: W -> 16 -> 1, trained by simple gradient descent (fast, dependency-free)
    rng=np.random.default_rng(42)
    W1=rng.normal(0,0.1,(W,16)); b1=np.zeros(16)
    W2=rng.normal(0,0.1,(16,1)); b2=np.zeros(1)
    lr=0.05
    for _ in range(400):
        z1=X@W1+b1; a1=np.tanh(z1); out=a1@W2+b2
        err=(out.squeeze()-y)
        g2=(a1.T@err).reshape(16,1)/len(X); db2=err.mean()
        d1=(err.reshape(-1,1)@W2.T)*(1-a1**2)
        g1=X.T@d1/len(X); db1=d1.mean(axis=0)
        W2-=lr*g2; b2-=lr*db2; W1-=lr*g1; b1-=lr*db1
    # forecast ahead
    last=rets[-W:].copy(); preds=[]; price=c[-1]
    for _ in range(ahead):
        a1=np.tanh(last@W1+b1); r=float((a1@W2+b2).item())
        preds.append(round(price*(1+r),5)); price=preds[-1]
        last=np.roll(last,-1); last[-1]=r
    direction="bullish" if preds[-1]>c[-1] else "bearish"
    conf=min(95, int(50+abs(preds[-1]-c[-1])/ (c[-1]*0.01) ))
    return {"ok": True, "last": round(float(c[-1]),5), "forecast": preds,
            "direction": direction, "confidence": conf, "model": "MLP(8-16-1) on returns"}
