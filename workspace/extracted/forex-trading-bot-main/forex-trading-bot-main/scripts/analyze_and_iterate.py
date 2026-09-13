#!/usr/bin/env python3
"""Deep analysis of tracker → resolve v3 → generate v4 with adapted priors."""
import json, ssl, time, asyncio, math
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter, defaultdict
import statistics as st
import websockets

ROOT = Path("/home/user/ftb")
SIG_DIR = ROOT / "knowledge/signals"
TRACKER = SIG_DIR / "tracker.jsonl"

APP_ID = "1089"
WS = f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}"

async def fetch_candles(symbol, count=1200, granularity=60):
    async with websockets.connect(WS, ssl=ssl.create_default_context(), ping_interval=None) as w:
        await w.send(json.dumps({
            "ticks_history": symbol, "adjust_start_time": 1, "count": count,
            "end": "latest", "start": 1, "style": "candles", "granularity": granularity,
        }))
        for _ in range(6):
            r = json.loads(await asyncio.wait_for(w.recv(), timeout=10))
            if "candles" in r:
                return [dict(epoch=c["epoch"], open=c["open"], high=c["high"],
                             low=c["low"], close=c["close"]) for c in r["candles"]]
            if "error" in r: return None
    return None

async def fetch_bundle(symbols):
    out = {}
    for s in symbols:
        try:
            cs = await fetch_candles(s, 1200, 60)
            if cs: out[s] = cs
        except Exception as e:
            print(f"  {s} FAILED: {e}")
    return out

# ============ PHASE 0: LOAD TRACKER + DEEP ANALYSIS ============
print("="*76)
print("PHASE 0 — DEEP ANALYSIS OF EXISTING TRACKER")
print("="*76)

records = []
if TRACKER.exists():
    for line in TRACKER.read_text().splitlines():
        if line.strip(): records.append(json.loads(line))

closed = [r for r in records if r.get("status") == "CLOSED"]
open_ = [r for r in records if r.get("status") == "OPEN"]

print(f"Total tracked: {len(records)}  |  closed: {len(closed)}  |  open: {len(open_)}")
print()

# --- by kind
by_kind = defaultdict(lambda: {"n":0,"tp":0,"sl":0,"hz":0,"pnl":0.0,"bars":[]})
for r in closed:
    k = r.get("kind","unknown")
    by_kind[k]["n"] += 1
    by_kind[k][{"TP":"tp","SL":"sl","HORIZON":"hz"}.get(r["outcome"],"hz")] += 1
    by_kind[k]["pnl"] += r.get("pnl_pct",0)
    by_kind[k]["bars"].append(r.get("bars_held",0))

print("By strategy KIND:")
print(f"  {'kind':<24} {'n':>3} {'TP':>3} {'SL':>3} {'Hz':>3} {'WR%':>6} {'PnL%':>8} {'avgBars':>8}")
for k, v in by_kind.items():
    wr = v["tp"]/v["n"]*100 if v["n"] else 0
    avg_bars = sum(v["bars"])/len(v["bars"]) if v["bars"] else 0
    print(f"  {k:<24} {v['n']:>3} {v['tp']:>3} {v['sl']:>3} {v['hz']:>3} {wr:>5.1f}% {v['pnl']:>+7.4f}% {avg_bars:>7.1f}")

# --- by symbol
by_sym = defaultdict(lambda: {"n":0,"tp":0,"sl":0,"hz":0,"pnl":0.0})
for r in closed:
    s = r["symbol"]; by_sym[s]["n"] += 1
    by_sym[s][{"TP":"tp","SL":"sl","HORIZON":"hz"}.get(r["outcome"],"hz")] += 1
    by_sym[s]["pnl"] += r.get("pnl_pct",0)
print("\nBy SYMBOL:")
print(f"  {'symbol':<12} {'n':>3} {'TP':>3} {'SL':>3} {'WR%':>6} {'PnL%':>8}")
for s, v in sorted(by_sym.items(), key=lambda x:-x[1]["n"]):
    wr = v["tp"]/v["n"]*100 if v["n"] else 0
    print(f"  {s:<12} {v['n']:>3} {v['tp']:>3} {v['sl']:>3} {wr:>5.1f}% {v['pnl']:>+7.4f}%")

# --- by direction
by_dir = defaultdict(lambda: {"n":0,"tp":0,"sl":0,"pnl":0.0})
for r in closed:
    d = r["direction"]; by_dir[d]["n"] += 1
    by_dir[d][{"TP":"tp","SL":"sl","HORIZON":"sl"}.get(r["outcome"],"sl")] += 1
    by_dir[d]["pnl"] += r.get("pnl_pct",0)
print("\nBy DIRECTION:")
for d, v in by_dir.items():
    wr = v["tp"]/v["n"]*100 if v["n"] else 0
    print(f"  {d:<5} n={v['n']:>3} TP={v['tp']} SL={v['sl']} WR={wr:>5.1f}% PnL={v['pnl']:+.4f}%")

# --- RSI-band analysis
rsi_buckets = defaultdict(lambda: {"n":0,"tp":0})
for r in closed:
    rsi = r.get("features",{}).get("rsi14", 50)
    bucket = f"{int(rsi//10)*10}-{int(rsi//10)*10+9}"
    rsi_buckets[bucket]["n"] += 1
    if r["outcome"] == "TP": rsi_buckets[bucket]["tp"] += 1
print("\nBy RSI-14 bucket at entry:")
for b in sorted(rsi_buckets.keys()):
    v = rsi_buckets[b]
    wr = v["tp"]/v["n"]*100 if v["n"] else 0
    print(f"  RSI {b:<8} n={v['n']} WR={wr:.0f}%")

# --- confidence vs outcome
conf_ranges = [(0.70,0.75),(0.75,0.80),(0.80,0.85),(0.85,0.90),(0.90,1.01)]
conf_stats = {f"{lo:.2f}-{hi:.2f}": {"n":0,"tp":0,"pnl":0} for lo,hi in conf_ranges}
for r in closed:
    c = r.get("confidence",0)
    for lo,hi in conf_ranges:
        if lo<=c<hi:
            k = f"{lo:.2f}-{hi:.2f}"
            conf_stats[k]["n"] += 1
            conf_stats[k]["pnl"] += r.get("pnl_pct",0)
            if r["outcome"]=="TP": conf_stats[k]["tp"] += 1
            break
print("\nConfidence bucket → outcome:")
for k,v in conf_stats.items():
    if v["n"]==0: continue
    wr = v["tp"]/v["n"]*100
    print(f"  conf {k}  n={v['n']} WR={wr:.0f}% PnL={v['pnl']:+.4f}%")

# --- key insights → derive priors
print("\n" + "-"*76)
print("DERIVED PRIORS FOR v4 GENERATION")
print("-"*76)
priors = {}
if closed:
    total_tp = sum(1 for r in closed if r["outcome"]=="TP")
    priors["global_wr"] = total_tp / len(closed)
    priors["global_pnl"] = sum(r.get("pnl_pct",0) for r in closed)
    # kind-specific edge
    kind_edge = {}
    for k,v in by_kind.items():
        if v["n"]>=2:
            kind_edge[k] = v["tp"]/v["n"] - 0.5  # edge above coinflip
    priors["kind_edge"] = kind_edge
    # symbol adjustments
    sym_edge = {}
    for s,v in by_sym.items():
        if v["n"]>=2:
            sym_edge[s] = v["tp"]/v["n"] - 0.5
    priors["sym_edge"] = sym_edge
    # bar-1 SL rate: if MR fades hit SL on bar 1, our SL is too tight → penalize
    bar1_sl = sum(1 for r in closed if r["outcome"]=="SL" and r.get("bars_held",99)<=1)
    priors["bar1_sl_rate"] = bar1_sl/len(closed) if closed else 0
    print(f"  Global WR: {priors['global_wr']*100:.1f}%")
    print(f"  Global PnL: {priors['global_pnl']:+.4f}%")
    print(f"  Kind edge: {kind_edge}")
    print(f"  Symbol edge: {sym_edge}")
    print(f"  Bar-1 SL rate: {priors['bar1_sl_rate']*100:.1f}%  {'(tight-SL warning)' if priors['bar1_sl_rate']>0.3 else ''}")

# ============ PHASE 1: RESOLVE v3 ============
print()
print("="*76)
print("PHASE 1 — RESOLVE OPEN v3 SIGNALS")
print("="*76)

if not open_:
    print("No open signals to resolve.")
    resolutions = []
else:
    syms = list(set(r["symbol"] for r in open_))
    print(f"Fetching fresh candles for {len(syms)} symbols: {syms}")
    fresh = asyncio.run(fetch_bundle(syms))
    print(f"Got data for {len(fresh)} symbols.\n")

    resolutions = []
    for s in open_:
        sym = s["symbol"]
        if sym not in fresh:
            resolutions.append({**s, "resolve_status":"NO_DATA"}); continue
        cs = fresh[sym]
        gen_ep = s["generated_epoch"]
        post = [c for c in cs if c["epoch"] > gen_ep]
        if not post:
            resolutions.append({**s, "resolve_status":"PENDING","bars_elapsed":0}); continue
        entry=s["entry_price"]; sl=s["sl"]; tp=s["tp"]; direction=s["direction"]
        horizon = s.get("horizon_bars", 12)
        window = post[:horizon]
        outcome=None; exit_price=None; exit_ep=None; bars_used=0
        for i,c in enumerate(window,1):
            bars_used=i
            if direction=="SELL":
                if c["high"]>=sl: outcome="SL"; exit_price=sl; exit_ep=c["epoch"]; break
                if c["low"] <=tp: outcome="TP"; exit_price=tp; exit_ep=c["epoch"]; break
            else:
                if c["low"] <=sl: outcome="SL"; exit_price=sl; exit_ep=c["epoch"]; break
                if c["high"]>=tp: outcome="TP"; exit_price=tp; exit_ep=c["epoch"]; break
        if outcome is None:
            if len(window)>=horizon:
                outcome="HORIZON"; exit_price=window[-1]["close"]; exit_ep=window[-1]["epoch"]
            else:
                resolutions.append({**s,"resolve_status":"PENDING",
                                    "bars_elapsed":len(window),"current_price":post[-1]["close"]})
                continue
        pnl = (entry-exit_price)/entry*100 if direction=="SELL" else (exit_price-entry)/entry*100
        resolutions.append({**s,"resolve_status":"CLOSED","outcome":outcome,
                          "exit_price":exit_price,"exit_epoch":exit_ep,
                          "bars_held":bars_used,"pnl_pct":round(pnl,4),
                          "resolved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})

    tp_ct=sl_ct=hz_ct=pend_ct=0; total_pnl=0.0
    print(f"{'Symbol':<10} {'Dir':<4} {'Kind':<22} {'Status':<8} {'Outcome':<8} {'Entry':>12} {'Exit':>12} {'PnL%':>9} {'Bars':>5}")
    print("-"*98)
    for r in resolutions:
        st_ = r["resolve_status"]
        if st_=="CLOSED":
            oc=r["outcome"]; pnl=r["pnl_pct"]; total_pnl+=pnl
            if oc=="TP": tp_ct+=1
            elif oc=="SL": sl_ct+=1
            else: hz_ct+=1
            print(f"{r['symbol']:<10} {r['direction']:<4} {r.get('kind','-'):<22} {st_:<8} {oc:<8} {r['entry_price']:>12} {r['exit_price']:>12} {pnl:>+9.4f} {r['bars_held']:>5}")
        else:
            pend_ct+=1
            cur=r.get("current_price","-"); elap=r.get("bars_elapsed",0)
            print(f"{r['symbol']:<10} {r['direction']:<4} {r.get('kind','-'):<22} {st_:<8} {'-':<8} {r['entry_price']:>12} {str(cur):>12} {'-':>9} {elap:>5}")
    closed_now = tp_ct+sl_ct+hz_ct
    wr_now = tp_ct/closed_now*100 if closed_now else 0
    print("-"*98)
    print(f"Batch: closed={closed_now}  TP={tp_ct}  SL={sl_ct}  Hz={hz_ct}  pending={pend_ct}  WR={wr_now:.1f}%  PnL={total_pnl:+.4f}%")

    # Update tracker
    resolved_map = {r["signal_id"]:r for r in resolutions}
    lines=[]
    for line in TRACKER.read_text().splitlines():
        if not line.strip(): continue
        rec = json.loads(line)
        if rec["signal_id"] in resolved_map:
            r = resolved_map[rec["signal_id"]]
            if r["resolve_status"]=="CLOSED":
                rec.update(status="CLOSED", outcome=r["outcome"],
                          close_price=r["exit_price"], closed_at=r["resolved_at"],
                          pnl_pct=r["pnl_pct"], bars_held=r["bars_held"])
            else:
                rec["last_check"]=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                rec["bars_elapsed"]=r.get("bars_elapsed",0)
        lines.append(json.dumps(rec))
    TRACKER.write_text("\n".join(lines)+"\n")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (SIG_DIR/f"{stamp}_resolutions.json").write_text(json.dumps({
        "resolved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "closed":closed_now,"tp":tp_ct,"sl":sl_ct,"horizon":hz_ct,"pending":pend_ct,
        "win_rate_pct":round(wr_now,2),"total_pnl_pct":round(total_pnl,4),
        "resolutions":resolutions,
    }, indent=2))

# ============ PHASE 2: GENERATE v4 WITH ADAPTED PRIORS ============
print()
print("="*76)
print("PHASE 2 — GENERATE v4 SIGNALS (with adapted priors from analysis)")
print("="*76)

GATES = json.loads((ROOT/"knowledge/hq_gates.json").read_text())
ELITE = json.loads((ROOT/"knowledge/hq_elite_oos.json").read_text())
PACK  = json.loads((ROOT/"knowledge/hq_knowledge_pack.json").read_text())

CFG = {r["symbol"]:{**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"elite"} for r in ELITE}
for r in PACK.get("robust_oos", []):
    if r["symbol"] not in CFG:
        CFG[r["symbol"]] = {**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"robust"}

print(f"Fetching fresh candles for {len(CFG)} symbols...")
bundle = asyncio.run(fetch_bundle(list(CFG.keys())))
print(f"Got data for {len(bundle)} symbols.")

# helpers
def ema(x,n):
    k=2/(n+1); e=x[0]
    for v in x[1:]: e=v*k+e*(1-k)
    return e
def rsi(closes,n=14):
    if len(closes)<n+1: return 50.0
    g,l=[],[]
    for i in range(1,n+1):
        d=closes[-i]-closes[-i-1]
        (g if d>0 else l).append(abs(d))
    ag=sum(g)/n if g else 1e-9; al=sum(l)/n if l else 1e-9
    return 100-100/(1+ag/al)
def atr_abs(cs,n=14):
    trs=[]
    for i in range(1,n+1):
        h,l,c=cs[-i]["high"],cs[-i]["low"],cs[-i-1]["close"]
        trs.append(max(h-l,abs(h-c),abs(l-c)))
    return sum(trs)/n
def htf(closes):
    if len(closes)<50: return "flat"
    e20=ema(closes[-100:],20); e50=ema(closes[-100:],50)
    if e20>e50*1.0002: return "up"
    if e20<e50*0.9998: return "down"
    return "flat"
def chop(cs,n=14):
    if len(cs)<n+1: return 50.0
    trs=[]
    for i in range(1,n+1):
        h,l,c=cs[-i]["high"],cs[-i]["low"],cs[-i-1]["close"]
        trs.append(max(h-l,abs(h-c),abs(l-c)))
    s=sum(trs); hi=max(c["high"] for c in cs[-n:]); lo=min(c["low"] for c in cs[-n:])
    rng=hi-lo
    if rng<=0 or s<=0: return 50.0
    return 100*math.log10(s/rng)/math.log10(n)

# Key priors driving v4:
#   1) Bar-1 SL rate is high → WIDEN SL on MR fades to reduce whipsaw stops
#   2) Prefer kinds/symbols with observed edge
#   3) BUY vs SELL asymmetry — inspect and lean toward the better side
priors_bar1 = priors.get("bar1_sl_rate", 0) if closed else 0
sl_widen = 1.15 if priors_bar1 >= 0.5 else (1.05 if priors_bar1>=0.3 else 1.0)

now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
now_epoch = int(time.time())
signals=[]; skipped=[]

for sym,cfg in CFG.items():
    if sym not in bundle:
        skipped.append({"symbol":sym,"reason":"no_data"}); continue
    cs = bundle[sym]
    if len(cs)<200:
        skipped.append({"symbol":sym,"reason":"too_few_bars"}); continue
    closes=[c["close"] for c in cs]; price=closes[-1]
    r=rsi(closes,14); a=atr_abs(cs,14); apct=a/price
    bias=htf(closes); c14=chop(cs,14)
    mom3=100*(closes[-1]-closes[-4])/closes[-4]
    mom5=100*(closes[-1]-closes[-6])/closes[-6]
    mom10=100*(closes[-1]-closes[-11])/closes[-11] if len(closes)>=11 else 0
    e20=ema(closes[-80:],20); e50=ema(closes[-80:],50)
    sep=abs(e20-e50)/price*100

    setups=[]
    # 1) trend continuation
    if bias=="up" and mom3>GATES["from_today_signal_losses"]["min_mom3_pct_buy"] and mom5>0 and mom10>0 and 35<r<cfg["rsi_max"]:
        setups.append(("BUY","trend_continuation","HTF up + mom3/5/10 pos + RSI band"))
    if bias=="down" and mom3<GATES["from_today_signal_losses"]["min_mom3_pct_sell"] and mom5<0 and mom10<0 and cfg["rsi_min"]<r<65:
        setups.append(("SELL","trend_continuation","HTF down + mom3/5/10 neg + RSI band"))
    # 2) RSI extreme MR
    if r>=78 and bias in ("up","flat"):
        setups.append(("SELL","mean_reversion_fade", f"RSI exhaustion {r:.1f}"))
    if r<=22 and bias in ("down","flat","up"):
        setups.append(("BUY","mean_reversion_fade", f"RSI oversold {r:.1f}"))
    # 3) regime trend (chop < 55, ema divergence)
    if c14<=55 and e20>e50*1.0012 and bias=="up" and 40<r<70:
        setups.append(("BUY","regime_trend", f"chop {c14:.1f} + ema-div up"))
    if c14<=55 and e20<e50*0.9988 and bias=="down" and 30<r<60:
        setups.append(("SELL","regime_trend", f"chop {c14:.1f} + ema-div down"))
    # 4) volatility contraction breakout
    if len(closes)>=40:
        m20 = sum(closes[-20:])/20
        s20 = (sum((v-m20)**2 for v in closes[-20:])/20)**0.5
        upper=m20+2*s20; lower=m20-2*s20
        w_now = (upper-lower)/m20 if m20>0 else 0
        ws=[]
        for k in range(20):
            sub = closes[-(20+k):-k] if k>0 else closes[-20:]
            m=sum(sub)/20; s=(sum((v-m)**2 for v in sub)/20)**0.5
            ws.append((4*s)/m if m>0 else 0)
        w_avg = sum(ws)/len(ws)
        bb_pct = (price-lower)/(upper-lower) if upper>lower else 0.5
        if w_now < w_avg*0.6 and bb_pct>0.88 and bias in ("up","flat"):
            setups.append(("BUY","vol_contraction", f"squeeze {w_now:.4f}<{w_avg*0.6:.4f} bb%={bb_pct:.2f}"))
        if w_now < w_avg*0.6 and bb_pct<0.12 and bias in ("down","flat"):
            setups.append(("SELL","vol_contraction", f"squeeze {w_now:.4f}<{w_avg*0.6:.4f} bb%={bb_pct:.2f}"))
    # 5) liquidity sweep reclaim
    if len(cs)>=22:
        win=cs[-22:-1]
        hi20=max(c["high"] for c in win); lo20=min(c["low"] for c in win)
        last=cs[-1]
        if last["high"]>hi20 and last["close"]<hi20:
            setups.append(("SELL","liq_sweep", f"high {hi20:.4f} swept + reclaimed"))
        if last["low"]<lo20 and last["close"]>lo20:
            setups.append(("BUY","liq_sweep", f"low {lo20:.4f} swept + reclaimed"))
    # 6) NEW: momentum continuation on pullback (v4 addition informed by analysis)
    if len(closes)>=10:
        pullback = closes[-1] < max(closes[-5:]) * 0.998 and closes[-1] > min(closes[-5:])
        if bias=="up" and pullback and mom10>0.05 and 45<r<65:
            setups.append(("BUY","pullback_continuation", f"pullback in uptrend mom10={mom10:.2f}"))
        pullback_dn = closes[-1] > min(closes[-5:]) * 1.002 and closes[-1] < max(closes[-5:])
        if bias=="down" and pullback_dn and mom10<-0.05 and 35<r<55:
            setups.append(("SELL","pullback_continuation", f"pullback in downtrend mom10={mom10:.2f}"))

    if not setups:
        skipped.append({"symbol":sym,"reason":f"no_setup (bias={bias} mom3={mom3:.2f} mom5={mom5:.2f} rsi={r:.1f} chop={c14:.1f})"}); continue

    best=None
    for direction, kind, why in setups:
        rsi_center = 1 - abs(r-50)/40
        mom_agree = min(1.0,(abs(mom3)+abs(mom5))/1.0)
        sep_norm  = min(1.0, sep/max(0.5,cfg["min_sep"]*2))
        extremity = min(1.0, abs(r-50)/40)
        if kind=="trend_continuation":
            conf = 0.55*cfg["oos_wr"] + 0.20*mom_agree + 0.15*sep_norm + 0.10*rsi_center
        elif kind=="mean_reversion_fade":
            conf = 0.50*cfg["oos_wr"] + 0.30*extremity + 0.10*(1-sep_norm) + 0.10*(1-mom_agree)
        elif kind=="regime_trend":
            conf = 0.50*cfg["oos_wr"] + 0.25*sep_norm + 0.15*mom_agree + 0.10*rsi_center
        elif kind=="vol_contraction":
            conf = 0.50*cfg["oos_wr"] + 0.30*mom_agree + 0.10*sep_norm + 0.10*rsi_center
        elif kind=="liq_sweep":
            conf = 0.55*cfg["oos_wr"] + 0.20*extremity + 0.15*mom_agree + 0.10*rsi_center
        elif kind=="pullback_continuation":
            conf = 0.55*cfg["oos_wr"] + 0.25*mom_agree + 0.10*sep_norm + 0.10*rsi_center
        else: conf = 0.5
        # apply learned edges
        if closed:
            conf += 0.5 * priors.get("kind_edge",{}).get(kind, 0)
            conf += 0.3 * priors.get("sym_edge",{}).get(sym, 0)
        conf = max(0, min(1, conf))
        min_conf_req = max(cfg["min_conf"], 0.72)  # tightened from 0.70

        # SL/TP with adaptive widening
        if kind=="mean_reversion_fade":
            sl_m = cfg["sl_m"]*0.9*sl_widen; tp_m = cfg["tp_m"]*0.6
        elif kind=="liq_sweep":
            sl_m = cfg["sl_m"]*1.0*sl_widen; tp_m = cfg["tp_m"]*0.8
        elif kind=="vol_contraction":
            sl_m = cfg["sl_m"]*1.1; tp_m = cfg["tp_m"]*1.1
        elif kind=="pullback_continuation":
            sl_m = cfg["sl_m"]*1.0; tp_m = cfg["tp_m"]*0.9
        else:
            sl_m = cfg["sl_m"]; tp_m = cfg["tp_m"]

        if direction=="BUY": sl=price - sl_m*a; tp=price + tp_m*a
        else: sl=price + sl_m*a; tp=price - tp_m*a
        cand = dict(direction=direction,kind=kind,conf=conf,sl=sl,tp=tp,
                   sl_m=sl_m,tp_m=tp_m,why=why,min_conf_req=min_conf_req)
        if best is None or cand["conf"]>best["conf"]: best=cand

    if best["conf"] < best["min_conf_req"]:
        skipped.append({"symbol":sym,"reason":f"conf_below_min ({best['conf']:.3f} < {best['min_conf_req']}) kind={best['kind']}"}); continue
    rr = best["tp_m"]/best["sl_m"]
    if best["kind"]=="trend_continuation" and rr<2.0:
        skipped.append({"symbol":sym,"reason":f"rr_below_2.0 ({rr:.2f})"}); continue
    if best["kind"] in ("mean_reversion_fade","liq_sweep") and rr<1.2:
        skipped.append({"symbol":sym,"reason":f"mr_rr_below_1.2 ({rr:.2f})"}); continue
    if best["kind"] in ("regime_trend","vol_contraction","pullback_continuation") and rr<1.4:
        skipped.append({"symbol":sym,"reason":f"reg_rr_below_1.4 ({rr:.2f})"}); continue

    signals.append({
        "signal_id": f"{sym}-{now_epoch}",
        "symbol":sym,"tier":cfg["tier"],
        "direction":best["direction"],"kind":best["kind"],
        "generated_at":now_iso,"generated_epoch":now_epoch,
        "entry_price":round(price,6),"sl":round(best["sl"],6),"tp":round(best["tp"],6),
        "sl_atr_mult":round(best["sl_m"],3),"tp_atr_mult":round(best["tp_m"],3),
        "rr":round(rr,3),"atr_abs":round(a,6),"atr_pct":round(apct*100,4),
        "horizon_bars":cfg["horizon"],"cooldown_bars":cfg["cooldown"],
        "confidence":round(best["conf"],4),"oos_wr":cfg["oos_wr"],"oos_n":cfg["oos_n"],
        "features":{"rsi14":round(r,2),"mom3_pct":round(mom3,4),"mom5_pct":round(mom5,4),
                   "mom10_pct":round(mom10,4),"ema20":round(e20,4),"ema50":round(e50,4),
                   "ema_sep_pct":round(sep,4),"htf_bias":bias,"chop14":round(c14,2)},
        "gate_checks":{"conf_ge_0.72":best["conf"]>=0.72,"rr_ok":True,"rsi_valid":True},
        "reasons":[best["why"]],
        "adapted_priors":{"sl_widen":sl_widen,
                         "kind_edge":priors.get("kind_edge",{}).get(best["kind"],0),
                         "sym_edge":priors.get("sym_edge",{}).get(sym,0)},
        "status":"OPEN","outcome":None,"closed_at":None,"close_price":None,"pnl_pct":None,
    })

signals.sort(key=lambda s:-s["confidence"])
max_day=GATES["from_mt5_report_40917328"]["max_trades_per_day"]
max_sym=GATES["from_mt5_report_40917328"]["max_trades_per_symbol_per_day"]
kept=[]; per_sym={}
for s in signals:
    if len(kept)>=max_day: break
    n=per_sym.get(s["symbol"],0)
    if n>=max_sym: continue
    kept.append(s); per_sym[s["symbol"]]=n+1
gated=[s for s in signals if s not in kept]

out={
    "generated_at":now_iso,"generated_epoch":now_epoch,
    "knowledge_version":PACK.get("version"),"universe_size":len(CFG),
    "data_bars_per_symbol":1200,"granularity_sec":60,
    "engine":"v4_analysis_driven","adapted_priors":{
        "sl_widen":sl_widen,"kind_edge":priors.get("kind_edge",{}) if closed else {},
        "sym_edge":priors.get("sym_edge",{}) if closed else {},
        "global_wr_pre":priors.get("global_wr",0) if closed else 0,
        "conf_gate":0.72,
    },
    "caps":{"max_trades_per_day":max_day,"max_trades_per_symbol_per_day":max_sym},
    "signals":kept,"gated_out_after_caps":gated,"skipped":skipped,
    "counts":{"candidates_before_caps":len(signals),"final_signals":len(kept),"skipped":len(skipped)},
}
stamp=now_iso.replace(":","").replace("-","")
of = SIG_DIR / f"{stamp}_signals_v4.json"
of.write_text(json.dumps(out,indent=2))
(SIG_DIR/"latest.json").write_text(json.dumps(out,indent=2))
with open(TRACKER,"a") as f:
    for s in kept: f.write(json.dumps(s)+"\n")

print(f"\nWROTE {of}")
print(f"candidates: {len(signals)}   final: {len(kept)}   skipped: {len(skipped)}")
print(f"Adapted priors → SL widen: x{sl_widen}  Conf gate: 0.72  Kind edges applied: {list(priors.get('kind_edge',{}).keys()) if closed else 'none'}")
print()
if kept:
    print(f"{'#':<3} {'Symbol':<10} {'Kind':<24} {'Dir':<4} {'Entry':>12} {'SL':>12} {'TP':>12} {'RR':>5} {'Conf':>6} {'RSI':>6} {'Bias':<5} {'Chop':>5}")
    print("-"*120)
    for i,s in enumerate(kept,1):
        f_ = s['features']
        print(f"{i:<3} {s['symbol']:<10} {s['kind']:<24} {s['direction']:<4} {s['entry_price']:>12} {s['sl']:>12} {s['tp']:>12} {s['rr']:>5} {s['confidence']:>6.3f} {f_['rsi14']:>6.1f} {f_['htf_bias']:<5} {f_['chop14']:>5.1f}")
print()
print("---- top skipped reasons ----")
buckets=Counter()
for s in skipped:
    key=s["reason"].split(" (")[0]
    buckets[key]+=1
for k,v in buckets.most_common():
    print(f"  {v:>3}x {k}")

# ============ CUMULATIVE STATE ============
print()
print("="*76)
print("CUMULATIVE TRACKER (post-update)")
print("="*76)
records=[]
for line in TRACKER.read_text().splitlines():
    if line.strip(): records.append(json.loads(line))
closed_all=[r for r in records if r.get("status")=="CLOSED"]
open_all=[r for r in records if r.get("status")=="OPEN"]
tp_all=sum(1 for r in closed_all if r["outcome"]=="TP")
sl_all=sum(1 for r in closed_all if r["outcome"]=="SL")
hz_all=sum(1 for r in closed_all if r["outcome"]=="HORIZON")
pnl_all=sum(r.get("pnl_pct",0) for r in closed_all)
wr_all = tp_all/len(closed_all)*100 if closed_all else 0
print(f"Total: {len(records)}  |  Closed: {len(closed_all)}  |  Open: {len(open_all)}")
print(f"TP: {tp_all}   SL: {sl_all}   HORIZON: {hz_all}   WR: {wr_all:.1f}%   PnL: {pnl_all:+.4f}%")
