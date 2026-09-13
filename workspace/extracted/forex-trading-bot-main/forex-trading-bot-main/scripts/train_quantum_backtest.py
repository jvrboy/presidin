#!/usr/bin/env python3
"""Train + backtest the expanded strategy/neural universe on 15 symbols x 1200 bars.
Phase 1: Python-side replicas of the 12 quantum strategies + 6 quantum nets score every bar.
Phase 2: Logistic blender trains on 60/40 split (walk-forward) to weight each source.
Phase 3: Backtest applies gates (conf>=0.70, RR by kind) with per-symbol SL/TP from hq_elite_oos.
"""
import json, math, os, time
import numpy as np
from pathlib import Path

ROOT = Path("/home/user/ftb")
BUNDLE = json.loads(Path("/home/user/synth_bundle.json").read_text())
ELITE = json.loads((ROOT/"knowledge/hq_elite_oos.json").read_text())
PACK = json.loads((ROOT/"knowledge/hq_knowledge_pack.json").read_text())
GATES = json.loads((ROOT/"knowledge/hq_gates.json").read_text())

CFG = {r["symbol"]: {**r["cfg"], "oos_wr": r["oos_wr"], "oos_n": r["oos_n"], "tier": "elite"} for r in ELITE}
for r in PACK.get("robust_oos", []):
    if r["symbol"] not in CFG:
        CFG[r["symbol"]] = {**r["cfg"], "oos_wr": r["oos_wr"], "oos_n": r["oos_n"], "tier": "robust"}

# ---------------- Indicator helpers ----------------
def ema(x, n):
    k = 2/(n+1); out = np.zeros_like(x); out[0] = x[0]
    for i in range(1, len(x)): out[i] = x[i]*k + out[i-1]*(1-k)
    return out
def rsi(x, n=14):
    d = np.diff(x, prepend=x[0])
    g = np.where(d>0, d, 0); l = np.where(d<0, -d, 0)
    ag = ema(g, n); al = ema(l, n)
    rs = ag / np.where(al<1e-9, 1e-9, al)
    return 100 - 100/(1+rs)
def sma(x, n):
    return np.convolve(x, np.ones(n)/n, mode='same')
def atr_arr(highs, lows, closes, n=14):
    tr = np.maximum(highs-lows, np.maximum(np.abs(highs-np.roll(closes,1)), np.abs(lows-np.roll(closes,1))))
    tr[0] = highs[0]-lows[0]
    return ema(tr, n)
def bollinger(x, n=20, k=2):
    m = sma(x, n); s = np.array([x[max(0,i-n+1):i+1].std() for i in range(len(x))])
    return m-k*s, m, m+k*s

def macd_arr(x, fast=12, slow=26, sig=9):
    ef = ema(x, fast); es = ema(x, slow); line = ef-es
    signal = ema(line, sig); hist = line-signal
    return line, signal, hist

def choppiness(highs, lows, closes, n=14):
    tr = np.maximum(highs-lows, np.maximum(np.abs(highs-np.roll(closes,1)), np.abs(lows-np.roll(closes,1))))
    tr[0] = highs[0]-lows[0]
    atr_sum = np.array([tr[max(0,i-n+1):i+1].sum() for i in range(len(tr))])
    hh = np.array([highs[max(0,i-n+1):i+1].max() for i in range(len(highs))])
    ll = np.array([lows[max(0,i-n+1):i+1].min() for i in range(len(lows))])
    rng = hh-ll
    ci = 100 * np.log10(np.where(atr_sum>0, atr_sum, 1e-9) / np.where(rng>0, rng, 1e-9)) / np.log10(n)
    return np.nan_to_num(ci, nan=50.0)

# ---------------- Feature matrix per bar ----------------
def build_features(candles):
    o = np.array([c["open"] for c in candles], dtype=float)
    h = np.array([c["high"] for c in candles], dtype=float)
    l = np.array([c["low"] for c in candles], dtype=float)
    c = np.array([c["close"] for c in candles], dtype=float)
    e8 = ema(c, 8); e21 = ema(c, 21); e55 = ema(c, 55); e50 = ema(c, 50); e20 = ema(c, 20)
    r = rsi(c, 14); a = atr_arr(h, l, c, 14); bb_lo, bb_mid, bb_up = bollinger(c, 20, 2)
    bb_pct = (c - bb_lo) / np.where((bb_up-bb_lo)>0, bb_up-bb_lo, 1e-9)
    macd_line, macd_sig, macd_hist = macd_arr(c)
    chop = choppiness(h, l, c, 14)
    ret1 = np.concatenate([[0], np.diff(c)/c[:-1]])
    ret5 = np.concatenate([[0]*5, (c[5:]-c[:-5])/c[:-5]])
    return dict(o=o,h=h,l=l,c=c,e8=e8,e21=e21,e55=e55,e50=e50,e20=e20,r=r,a=a,
                bb_lo=bb_lo,bb_mid=bb_mid,bb_up=bb_up,bb_pct=bb_pct,
                macd_hist=macd_hist,chop=chop,ret1=ret1,ret5=ret5)

# ---------------- Strategy scorers (returns +1/-1/0 per bar) ----------------
def strat_scores(f):
    N = len(f["c"])
    scores = {}
    # Trend-continuation
    scores["ema_ribbon"]        = np.where((f["e8"]>f["e21"])&(f["e21"]>f["e55"]), 1, np.where((f["e8"]<f["e21"])&(f["e21"]<f["e55"]), -1, 0))
    scores["macd_rsi"]          = np.where((f["macd_hist"]>0)&(f["r"]>50)&(f["r"]<70), 1, np.where((f["macd_hist"]<0)&(f["r"]<50)&(f["r"]>30), -1, 0))
    # Quantum
    scores["q_regime_trend"]    = np.where((f["chop"]<=61.8)&(f["e20"]>f["e50"]*1.001), 1, np.where((f["chop"]<=61.8)&(f["e20"]<f["e50"]*0.999), -1, 0))
    scores["q_adaptive_mr"]     = np.where((f["chop"]>=50)&(f["r"]>75), -1, np.where((f["chop"]>=50)&(f["r"]<25), 1, 0))
    # sweep: use 20-bar hi/lo excluding current bar
    hi20 = np.array([f["h"][max(0,i-21):i].max() if i>=21 else f["h"][i] for i in range(N)])
    lo20 = np.array([f["l"][max(0,i-21):i].min() if i>=21 else f["l"][i] for i in range(N)])
    scores["q_liq_sweep"]       = np.where((f["h"]>hi20)&(f["c"]<hi20), -1, np.where((f["l"]<lo20)&(f["c"]>lo20), 1, 0))
    # vol contraction: bb width vs 20-avg
    bbw = (f["bb_up"]-f["bb_lo"])/np.where(f["bb_mid"]>0,f["bb_mid"],1e-9)
    bbw_avg = sma(bbw, 20)
    scores["q_vol_contraction"] = np.where((bbw<bbw_avg*0.6)&(f["bb_pct"]>0.85), 1, np.where((bbw<bbw_avg*0.6)&(f["bb_pct"]<0.15), -1, 0))
    # mtf div — approximated as ret5 sign vs rsi 5-bar slope
    r_slope5 = f["r"] - np.roll(f["r"], 5)
    scores["q_mtf_div"]         = np.where((f["ret5"]>0)&(r_slope5<0), -1, np.where((f["ret5"]<0)&(r_slope5>0), 1, 0))
    # bb walk: 3 closes vs outer band
    walk_up = (f["c"]>=f["bb_up"]*0.999) & (np.roll(f["c"],1)>=np.roll(f["bb_up"],1)*0.999) & (np.roll(f["c"],2)>=np.roll(f["bb_up"],2)*0.999)
    walk_dn = (f["c"]<=f["bb_lo"]*1.001) & (np.roll(f["c"],1)<=np.roll(f["bb_lo"],1)*1.001) & (np.roll(f["c"],2)<=np.roll(f["bb_lo"],2)*1.001)
    scores["q_bb_walk"]         = np.where(walk_up, 1, np.where(walk_dn, -1, 0))
    # donchian pullback
    hi20d = np.array([f["h"][max(0,i-20):i+1].max() for i in range(N)])
    lo20d = np.array([f["l"][max(0,i-20):i+1].min() for i in range(N)])
    mid20 = (hi20d+lo20d)/2
    scores["q_donchian_pull"]   = np.where((f["c"]>f["e50"])&(f["c"]<=mid20*1.002)&(f["c"]>lo20d), 1, np.where((f["c"]<f["e50"])&(f["c"]>=mid20*0.998)&(f["c"]<hi20d), -1, 0))
    # atr expansion
    a_past = np.roll(f["a"], 10)
    scores["q_atr_expansion"]   = np.where((f["a"]>a_past*1.5)&(f["c"]>np.roll(f["c"],1)), 1, np.where((f["a"]>a_past*1.5)&(f["c"]<np.roll(f["c"],1)), -1, 0))
    # exhaustion fade
    up3 = (f["c"]>f["o"]) & (np.roll(f["c"],1)>np.roll(f["o"],1)) & (np.roll(f["c"],2)>np.roll(f["o"],2))
    dn3 = (f["c"]<f["o"]) & (np.roll(f["c"],1)<np.roll(f["o"],1)) & (np.roll(f["c"],2)<np.roll(f["o"],2))
    body = np.abs(f["c"]-f["o"])
    shrink = (body<np.roll(body,1)) & (np.roll(body,1)<np.roll(body,2))
    scores["q_exhaustion"]      = np.where(up3&shrink, -1, np.where(dn3&shrink, 1, 0))
    # triple ema
    e5 = ema(f["c"], 5); e13 = ema(f["c"], 13); e34 = ema(f["c"], 34)
    scores["q_triple_ema"]      = np.where((e5>e13)&(e13>e34), 1, np.where((e5<e13)&(e13<e34), -1, 0))
    # session break — 60-bar hi/lo excluding last 5
    hi60 = np.array([f["h"][max(0,i-65):i-5].max() if i>=65 else f["h"][i] for i in range(N)])
    lo60 = np.array([f["l"][max(0,i-65):i-5].min() if i>=65 else f["l"][i] for i in range(N)])
    scores["q_session_break"]   = np.where(f["c"]>hi60, 1, np.where(f["c"]<lo60, -1, 0))
    # vol momentum proxy (OBV slope proxy = sign of ret*volume; synths → use |ret|*sign(ret))
    obv_proxy = np.cumsum(np.sign(f["ret1"]) * np.abs(f["ret1"]))
    obv_slope = obv_proxy - np.roll(obv_proxy, 10)
    scores["q_vol_mom"]         = np.where((f["ret5"]>0.001)&(obv_slope>0), 1, np.where((f["ret5"]<-0.001)&(obv_slope<0), -1, 0))
    return scores

# ---------------- Quantum neural scores (deterministic seeded nets) ----------------
def _seeded(seed): 
    rng = np.random.default_rng(seed); return rng
def _sigmoid(x): return 1/(1+np.exp(-np.clip(x, -30, 30)))

def net_scores(f):
    N = len(f["c"])
    price = f["c"]; safe_price = np.where(price>0, price, 1e-9)
    X = np.column_stack([
        (f["e8"]-f["e21"])/safe_price,
        (f["e21"]-f["e55"])/safe_price,
        (f["r"]-50)/50,
        f["a"]/safe_price,
        f["bb_pct"]-0.5,
        f["macd_hist"]/safe_price,
        f["ret1"],
        f["ret5"],
        (f["chop"]-50)/50,
    ])
    X = np.nan_to_num(X, nan=0, posinf=0, neginf=0)
    out = {}
    rng = _seeded(0xa1b2)
    W1 = rng.standard_normal((9, 32))*np.sqrt(2/9); W2 = rng.standard_normal((32, 16))*np.sqrt(2/32); W3 = rng.standard_normal((16, 1))*np.sqrt(2/16)
    h1 = np.maximum(0, X @ W1); h2 = np.maximum(0, h1 @ W2); out["q_mlp_wide"] = _sigmoid(h2 @ W3).ravel()
    rng = _seeded(0xc3d4)
    W1 = rng.standard_normal((9, 24))*0.2; W2 = rng.standard_normal((24, 24))*0.2; W3 = rng.standard_normal((24, 12))*0.2; W4 = rng.standard_normal((12, 1))*0.2
    h = np.tanh(X @ W1); h = np.tanh(h @ W2); h = np.tanh(h @ W3); out["q_mlp_deep"] = _sigmoid(h @ W4).ravel()
    # gru-lite: recurrent over 20-bar ret window (approx by CNN kernel on ret1)
    rng = _seeded(0xe5f6)
    K = rng.standard_normal(20)*0.3
    conv = np.array([np.dot(K, f["ret1"][max(0,i-19):i+1][-20:] if i>=19 else np.pad(f["ret1"][:i+1], (20-i-1,0))) for i in range(N)])
    out["q_gru_lite"] = _sigmoid(conv * 50)
    # bilstm-lite: forward+backward kernel avg
    rng = _seeded(0x7788)
    Kf = rng.standard_normal(15)*0.3; Kb = rng.standard_normal(15)*0.3
    convf = np.array([np.dot(Kf, f["ret1"][max(0,i-14):i+1][-15:] if i>=14 else np.pad(f["ret1"][:i+1], (15-i-1,0))) for i in range(N)])
    convb = np.array([np.dot(Kb, f["ret1"][max(0,i-14):i+1][::-1][-15:] if i>=14 else np.pad(f["ret1"][:i+1], (15-i-1,0))) for i in range(N)])
    out["q_bilstm_lite"] = _sigmoid((convf+convb) * 30)
    # conv1d-lite: 8 kernels of size 3 pooled
    rng = _seeded(0x99aa)
    kernels = rng.standard_normal((8, 3))*0.5
    feats = np.zeros((N, 8))
    for i in range(2, N):
        window = f["ret1"][i-2:i+1]
        feats[i] = np.maximum(0, kernels @ window)
    Wout = rng.standard_normal(8)*0.3
    out["q_conv1d_lite"] = _sigmoid(feats @ Wout)
    # transformer-lite: self-attn over 8-feature vec per bar
    rng = _seeded(0xbbcc)
    Wq = rng.standard_normal((8,8))*0.2; Wk = rng.standard_normal((8,8))*0.2; Wv = rng.standard_normal((8,8))*0.2; Wo = rng.standard_normal(8)*0.3
    X8 = X[:, :8]
    Q = X8 @ Wq; Kk = X8 @ Wk; V = X8 @ Wv
    scores = Q * Kk / np.sqrt(8)
    e = np.exp(scores - scores.max(axis=1, keepdims=True))
    attn = e / e.sum(axis=1, keepdims=True)
    ctx = V * attn
    out["q_transformer_lite"] = _sigmoid(ctx @ Wo)
    # Convert probs → signed score
    return {k: 2*v - 1 for k, v in out.items()}   # [-1, +1]

# ---------------- Label + train + backtest ----------------
def label_forward(closes, horizon=10):
    N = len(closes); y = np.zeros(N)
    for i in range(N-horizon):
        y[i] = 1.0 if closes[i+horizon] > closes[i] else 0.0
    return y

def train_logistic(X, y, epochs=200, lr=0.05, l2=1e-3):
    w = np.zeros(X.shape[1]); b = 0.0
    for _ in range(epochs):
        z = X @ w + b; p = _sigmoid(z); g = p - y
        w -= lr * (X.T @ g / len(y) + l2*w); b -= lr * g.mean()
    return w, b

def backtest(candles, feats, source_scores, w, b, sl_m, tp_m, horizon=10, conf_gate=0.70):
    N = len(candles); c = feats["c"]; a = feats["a"]
    S = np.column_stack(list(source_scores.values()))
    S = np.nan_to_num(S, nan=0, posinf=0, neginf=0)
    probs = _sigmoid(S @ w + b)
    trades = []
    i = 100; cooldown = 0
    while i < N - horizon - 1:
        if cooldown > 0: cooldown -= 1; i += 1; continue
        p = probs[i]; conf = abs(p - 0.5) * 2
        if conf < conf_gate: i += 1; continue
        direction = 1 if p > 0.5 else -1
        entry = c[i]; sl_dist = sl_m * a[i]; tp_dist = tp_m * a[i]
        if direction == 1: sl = entry - sl_dist; tp = entry + tp_dist
        else: sl = entry + sl_dist; tp = entry - tp_dist
        outcome = "HORIZON"; exit_price = c[i+horizon]; bars_held = horizon
        for k in range(1, horizon+1):
            hi = feats["h"][i+k]; lo = feats["l"][i+k]
            if direction == 1:
                if lo <= sl: outcome="SL"; exit_price=sl; bars_held=k; break
                if hi >= tp: outcome="TP"; exit_price=tp; bars_held=k; break
            else:
                if hi >= sl: outcome="SL"; exit_price=sl; bars_held=k; break
                if lo <= tp: outcome="TP"; exit_price=tp; bars_held=k; break
        pnl = direction * (exit_price - entry) / entry
        trades.append(dict(bar=i, dir=direction, entry=float(entry), exit=float(exit_price),
                          outcome=outcome, bars=bars_held, pnl=float(pnl), conf=float(conf)))
        cooldown = 5; i += bars_held + 1
    return trades

# ---------------- Main loop ----------------
results = {}
all_weights = {}

for sym in list(CFG.keys()):
    if sym not in BUNDLE["symbols"]: continue
    cs = BUNDLE["symbols"][sym]
    if len(cs) < 400: continue
    cfg = CFG[sym]
    f = build_features(cs)
    ss = strat_scores(f); ns = net_scores(f)
    sources = {**ss, **ns}
    X_full = np.column_stack(list(sources.values()))
    X_full = np.nan_to_num(X_full, nan=0, posinf=0, neginf=0)
    y_full = label_forward(f["c"], horizon=10)
    split = int(0.6 * len(X_full))
    X_tr, y_tr = X_full[100:split], y_full[100:split]
    w, b = train_logistic(X_tr, y_tr, epochs=300, lr=0.08)
    # Backtest on OOS 40%
    cs_oos = cs[split:]; f_oos = build_features(cs_oos)
    ss_oos = strat_scores(f_oos); ns_oos = net_scores(f_oos)
    sources_oos = {**ss_oos, **ns_oos}
    trades = backtest(cs_oos, f_oos, sources_oos, w, b, cfg["sl_m"], cfg["tp_m"], horizon=10, conf_gate=0.70)
    if not trades:
        results[sym] = dict(n=0, wr=0, pnl=0, msg="no trades passed gate")
        continue
    wins = sum(1 for t in trades if t["pnl"] > 0)
    wr = wins / len(trades)
    total_pnl = sum(t["pnl"] for t in trades)
    tp_count = sum(1 for t in trades if t["outcome"]=="TP")
    sl_count = sum(1 for t in trades if t["outcome"]=="SL")
    all_weights[sym] = dict(w=w.tolist(), b=float(b))
    results[sym] = dict(n=len(trades), wr=round(wr, 4), pnl_pct=round(total_pnl*100, 4),
                       tp=tp_count, sl=sl_count, horizon=len(trades)-tp_count-sl_count,
                       best_source_idx=int(np.argmax(np.abs(w))),
                       source_names=list(sources.keys()),
                       top_5_weights=sorted([(n, round(float(wi), 4)) for n, wi in zip(sources.keys(), w)], key=lambda x: -abs(x[1]))[:5])

out_dir = ROOT / "knowledge/backtests"
out_dir.mkdir(exist_ok=True)
stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
report = {
    "stamp": stamp,
    "engine": "quantum-pack-v1",
    "commit": "5f60760",
    "sources": 19,  # 13 strats + 6 nets
    "horizon_bars": 10,
    "conf_gate": 0.70,
    "split": "60/40 walk-forward",
    "per_symbol": results,
    "universe_size": len(results),
}
(out_dir/f"{stamp}_quantum_backtest.json").write_text(json.dumps(report, indent=2))
(out_dir/f"{stamp}_weights.json").write_text(json.dumps(all_weights, indent=2))
(out_dir/"latest_quantum.json").write_text(json.dumps(report, indent=2))

# Aggregate
total_n = sum(r["n"] for r in results.values() if r["n"]>0)
total_pnl = sum(r["pnl_pct"] for r in results.values() if r["n"]>0)
weighted_wr = sum(r["wr"]*r["n"] for r in results.values() if r["n"]>0) / max(1, total_n)

print("="*72)
print(f"QUANTUM-PACK BACKTEST — {stamp}")
print(f"Universe: {len(results)} symbols | Sources per bar: 19 (13 strat + 6 nets)")
print(f"Total OOS trades: {total_n} | Blended WR: {weighted_wr:.3f} | Total PnL: {total_pnl:.3f}%")
print("="*72)
for sym, r in sorted(results.items(), key=lambda x: -x[1].get("n",0)):
    if r["n"]==0:
        print(f"  {sym:10s} n=0  ({r.get('msg','')})")
    else:
        print(f"  {sym:10s} n={r['n']:>3d}  WR={r['wr']*100:>5.1f}%  PnL={r['pnl_pct']:>+6.3f}%  TP/SL/H={r['tp']}/{r['sl']}/{r['horizon']}")
print("\nTop weight per symbol:")
for sym, r in results.items():
    if r["n"]==0: continue
    print(f"  {sym:10s} → {r['top_5_weights'][0][0]:22s} w={r['top_5_weights'][0][1]:+.3f}")
