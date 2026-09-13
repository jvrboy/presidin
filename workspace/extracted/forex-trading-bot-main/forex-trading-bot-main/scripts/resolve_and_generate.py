#!/usr/bin/env python3
"""Resolve open signals against fresh candles, then generate a new round."""
import json, os, ssl, time, asyncio, websockets
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path("/home/user/ftb")
SIG_DIR = ROOT / "knowledge/signals"
TRACKER = SIG_DIR / "tracker.jsonl"

APP_ID = "1089"  # public app_id for candle history
WS = f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}"

async def fetch_candles(symbol, count=300, granularity=60):
    """Fetch latest candles for a symbol."""
    async with websockets.connect(WS, ssl=ssl.create_default_context(), ping_interval=None) as w:
        req = {
            "ticks_history": symbol, "adjust_start_time": 1, "count": count,
            "end": "latest", "start": 1, "style": "candles", "granularity": granularity,
        }
        await w.send(json.dumps(req))
        for _ in range(6):
            r = json.loads(await asyncio.wait_for(w.recv(), timeout=10))
            if "candles" in r:
                return [dict(epoch=c["epoch"], open=c["open"], high=c["high"], low=c["low"], close=c["close"]) for c in r["candles"]]
            if "error" in r:
                return None
    return None

async def fetch_bundle(symbols):
    out = {}
    for s in symbols:
        try:
            cs = await fetch_candles(s, 1200, 60)
            if cs: out[s] = cs
            print(f"  fetched {s}: {len(cs) if cs else 0} bars")
        except Exception as e:
            print(f"  {s} FAILED: {e}")
    return out

# =============== 1. RESOLVE OPEN SIGNALS ===============
print("="*72)
print("PHASE 1: RESOLVE OPEN SIGNALS")
print("="*72)

# Read latest snapshot
latest = json.loads((SIG_DIR/"latest.json").read_text())
open_signals = [s for s in latest["signals"] if s["status"] == "OPEN"]

if not open_signals:
    print("No open signals to resolve.")
    resolutions = []
else:
    syms = list(set(s["symbol"] for s in open_signals))
    print(f"Fetching fresh candles for {len(syms)} symbols: {syms}")
    fresh = asyncio.run(fetch_bundle(syms))

    resolutions = []
    for s in open_signals:
        sym = s["symbol"]
        if sym not in fresh:
            resolutions.append({**s, "resolve_status": "NO_DATA"}); continue
        cs = fresh[sym]
        gen_ep = s["generated_epoch"]
        post = [c for c in cs if c["epoch"] > gen_ep]
        if not post:
            resolutions.append({**s, "resolve_status": "PENDING", "bars_elapsed": 0}); continue
        entry = s["entry_price"]; sl = s["sl"]; tp = s["tp"]; direction = s["direction"]
        horizon = s.get("horizon_bars", 12)
        window = post[:horizon]
        outcome = None; exit_price = None; exit_ep = None; bars_used = 0
        for i, c in enumerate(window, 1):
            bars_used = i
            if direction == "SELL":
                if c["high"] >= sl: outcome="SL"; exit_price=sl; exit_ep=c["epoch"]; break
                if c["low"]  <= tp: outcome="TP"; exit_price=tp; exit_ep=c["epoch"]; break
            else:  # BUY
                if c["low"]  <= sl: outcome="SL"; exit_price=sl; exit_ep=c["epoch"]; break
                if c["high"] >= tp: outcome="TP"; exit_price=tp; exit_ep=c["epoch"]; break
        if outcome is None:
            if len(window) >= horizon:
                outcome = "HORIZON"; exit_price = window[-1]["close"]; exit_ep = window[-1]["epoch"]
            else:
                resolutions.append({**s, "resolve_status": "PENDING",
                                   "bars_elapsed": len(window), "current_price": post[-1]["close"]})
                continue
        pnl_pct = (entry - exit_price)/entry*100 if direction=="SELL" else (exit_price - entry)/entry*100
        resolutions.append({**s, "resolve_status":"CLOSED", "outcome":outcome,
                          "exit_price":exit_price, "exit_epoch":exit_ep,
                          "bars_held":bars_used, "pnl_pct":round(pnl_pct,4),
                          "resolved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})

    # Print resolution table
    print()
    print(f"{'Symbol':<10} {'Dir':<4} {'Status':<10} {'Outcome':<8} {'Entry':>12} {'Exit':>12} {'PnL%':>8} {'Bars':>5}")
    print("-"*72)
    tp_ct = sl_ct = hz_ct = pend_ct = 0
    total_pnl = 0.0
    for r in resolutions:
        st = r["resolve_status"]
        if st == "CLOSED":
            oc = r["outcome"]; pnl = r["pnl_pct"]; total_pnl += pnl
            if oc=="TP": tp_ct+=1
            elif oc=="SL": sl_ct+=1
            else: hz_ct+=1
            print(f"{r['symbol']:<10} {r['direction']:<4} {st:<10} {oc:<8} {r['entry_price']:>12} {r['exit_price']:>12} {pnl:>+8.4f} {r['bars_held']:>5}")
        else:
            pend_ct += 1
            cur = r.get("current_price", "-")
            elap = r.get("bars_elapsed", 0)
            print(f"{r['symbol']:<10} {r['direction']:<4} {st:<10} {'—':<8} {r['entry_price']:>12} {str(cur):>12} {'—':>8} {elap:>5}")

    closed = tp_ct+sl_ct+hz_ct
    wr = tp_ct/closed*100 if closed else 0
    print("-"*72)
    print(f"Closed: {closed}  TP: {tp_ct}  SL: {sl_ct}  Horizon: {hz_ct}  Pending: {pend_ct}")
    print(f"Win rate: {wr:.1f}%   Total PnL: {total_pnl:+.4f}%")

    # Persist resolutions
    resolved_map = {r["signal_id"]: r for r in resolutions}
    tracker_lines = []
    if TRACKER.exists():
        for line in TRACKER.read_text().splitlines():
            if not line.strip(): continue
            rec = json.loads(line)
            if rec["signal_id"] in resolved_map:
                r = resolved_map[rec["signal_id"]]
                if r["resolve_status"] == "CLOSED":
                    rec.update(status="CLOSED", outcome=r["outcome"],
                              close_price=r["exit_price"], closed_at=r["resolved_at"],
                              pnl_pct=r["pnl_pct"], bars_held=r["bars_held"])
                else:
                    rec["last_check"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    rec["bars_elapsed"] = r.get("bars_elapsed", 0)
            tracker_lines.append(json.dumps(rec))
    TRACKER.write_text("\n".join(tracker_lines) + "\n")

    # Write resolution report
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (SIG_DIR / f"{stamp}_resolutions.json").write_text(json.dumps({
        "resolved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "closed": closed, "tp": tp_ct, "sl": sl_ct, "horizon": hz_ct, "pending": pend_ct,
        "win_rate_pct": round(wr,2), "total_pnl_pct": round(total_pnl,4),
        "resolutions": resolutions,
    }, indent=2))
    print(f"\nResolution report: {SIG_DIR/(stamp+'_resolutions.json')}")

# =============== 2. GENERATE NEW ROUND ===============
print()
print("="*72)
print("PHASE 2: GENERATE NEW SIGNALS (v3, expanded engine)")
print("="*72)

with open(ROOT/"knowledge/hq_gates.json") as f: GATES = json.load(f)
with open(ROOT/"knowledge/hq_elite_oos.json") as f: ELITE = json.load(f)
with open(ROOT/"knowledge/hq_knowledge_pack.json") as f: PACK = json.load(f)

CFG = {r["symbol"]: {**r["cfg"], "oos_wr": r["oos_wr"], "oos_n": r["oos_n"], "tier":"elite"} for r in ELITE}
for r in PACK.get("robust_oos", []):
    if r["symbol"] not in CFG:
        CFG[r["symbol"]] = {**r["cfg"], "oos_wr": r["oos_wr"], "oos_n": r["oos_n"], "tier":"robust"}

# Fetch fresh candles for entire universe
print(f"Fetching fresh candles for {len(CFG)} symbols...")
bundle = asyncio.run(fetch_bundle(list(CFG.keys())))
print(f"Got data for {len(bundle)} symbols.")

def ema(x, n):
    k=2/(n+1); e=x[0]
    for v in x[1:]: e=v*k+e*(1-k)
    return e
def rsi(closes, n=14):
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
def choppiness(cs, n=14):
    if len(cs)<n+1: return 50.0
    trs=[]
    for i in range(1,n+1):
        h,l,c=cs[-i]["high"],cs[-i]["low"],cs[-i-1]["close"]
        trs.append(max(h-l,abs(h-c),abs(l-c)))
    atr_sum=sum(trs)
    hi=max(c["high"] for c in cs[-n:]); lo=min(c["low"] for c in cs[-n:])
    rng=hi-lo
    import math as _m
    if rng<=0 or atr_sum<=0: return 50.0
    return 100*_m.log10(atr_sum/rng)/_m.log10(n)

now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
now_epoch = int(time.time())
signals=[]; skipped=[]

for sym, cfg in CFG.items():
    if sym not in bundle:
        skipped.append({"symbol":sym,"reason":"no_data"}); continue
    cs = bundle[sym]
    if len(cs)<200:
        skipped.append({"symbol":sym,"reason":"too_few_bars"}); continue
    closes=[c["close"] for c in cs]; price=closes[-1]
    r=rsi(closes,14); a=atr_abs(cs,14); apct=a/price
    bias=htf(closes); chop=choppiness(cs,14)
    mom3=100*(closes[-1]-closes[-4])/closes[-4]
    mom5=100*(closes[-1]-closes[-6])/closes[-6]
    e20=ema(closes[-80:],20); e50=ema(closes[-80:],50)
    sep=abs(e20-e50)/price*100

    setups=[]
    # 1) Trend continuation
    if bias=="up" and mom3>GATES["from_today_signal_losses"]["min_mom3_pct_buy"] and mom5>0 and 35<r<cfg["rsi_max"]:
        setups.append(("BUY","trend_continuation","HTF up + mom3/mom5 pos + RSI in band"))
    if bias=="down" and mom3<GATES["from_today_signal_losses"]["min_mom3_pct_sell"] and mom5<0 and cfg["rsi_min"]<r<65:
        setups.append(("SELL","trend_continuation","HTF down + mom3/mom5 neg + RSI in band"))
    # 2) RSI-extreme MR fade
    if r>=75 and bias in ("up","flat"):
        setups.append(("SELL","mean_reversion_fade", f"RSI exhaustion {r:.1f}"))
    if r<=25 and bias in ("down","flat","up"):
        setups.append(("BUY","mean_reversion_fade", f"RSI oversold {r:.1f}"))
    # 3) Regime-aware trend (chop <= 61.8, EMA20/50 diverging)
    if chop<=61.8 and e20>e50*1.001 and bias=="up":
        setups.append(("BUY","regime_trend", f"chop {chop:.1f} + ema-diverge up"))
    if chop<=61.8 and e20<e50*0.999 and bias=="down":
        setups.append(("SELL","regime_trend", f"chop {chop:.1f} + ema-diverge down"))
    # 4) Volatility contraction breakout — needs BB width history
    if len(closes)>=40:
        # simple BB width
        def bb_width(cs_close, n=20, k=2):
            import statistics as st
            m=sum(cs_close[-n:])/n
            var=sum((v-m)**2 for v in cs_close[-n:])/n
            s=var**0.5
            return (2*k*s)/m if m>0 else 0
        w_now = bb_width(closes)
        w_avg = sum(bb_width(closes[:-i]) for i in range(20)) / 20
        # BB %B
        m20 = sum(closes[-20:])/20
        var20 = sum((v-m20)**2 for v in closes[-20:])/20
        s20 = var20**0.5
        upper = m20 + 2*s20; lower = m20 - 2*s20
        bb_pct = (price-lower)/(upper-lower) if upper>lower else 0.5
        if w_now < w_avg*0.6 and bb_pct > 0.85 and bias in ("up","flat"):
            setups.append(("BUY","vol_contraction", f"squeeze width={w_now:.4f}<{w_avg*0.6:.4f} pct={bb_pct:.2f}"))
        if w_now < w_avg*0.6 and bb_pct < 0.15 and bias in ("down","flat"):
            setups.append(("SELL","vol_contraction", f"squeeze width={w_now:.4f}<{w_avg*0.6:.4f} pct={bb_pct:.2f}"))
    # 5) Liquidity sweep reclaim (last bar swept 20-bar extreme and reclaimed)
    if len(cs)>=22:
        win=cs[-22:-1]
        hi20=max(c["high"] for c in win); lo20=min(c["low"] for c in win)
        last=cs[-1]
        if last["high"]>hi20 and last["close"]<hi20:
            setups.append(("SELL","liq_sweep", f"high {hi20:.4f} swept + reclaimed"))
        if last["low"]<lo20 and last["close"]>lo20:
            setups.append(("BUY","liq_sweep", f"low {lo20:.4f} swept + reclaimed"))

    if not setups:
        skipped.append({"symbol":sym,"reason":f"no_setup (bias={bias} mom3={mom3:.3f} mom5={mom5:.3f} rsi={r:.1f} chop={chop:.1f})"}); continue

    best=None
    for direction, kind, why in setups:
        rsi_center = 1 - abs(r-50)/40
        mom_agree = min(1.0,(abs(mom3)+abs(mom5))/1.0)
        sep_norm = min(1.0, sep/max(0.5,cfg["min_sep"]*2))
        extremity = min(1.0, abs(r-50)/40)
        chop_bonus = 1.0 - min(1.0, abs(chop-50)/50) if kind=="regime_trend" else 0.5
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
        else:
            conf = 0.5
        min_conf_req = max(cfg["min_conf"], 0.70)
        # SL/TP per kind
        if kind=="mean_reversion_fade":
            sl_m = cfg["sl_m"]*0.9; tp_m = cfg["tp_m"]*0.6
        elif kind=="liq_sweep":
            sl_m = cfg["sl_m"]*1.0; tp_m = cfg["tp_m"]*0.8
        elif kind=="vol_contraction":
            sl_m = cfg["sl_m"]*1.1; tp_m = cfg["tp_m"]*1.1
        else:
            sl_m = cfg["sl_m"]; tp_m = cfg["tp_m"]
        if direction=="BUY": sl=price - sl_m*a; tp=price + tp_m*a
        else: sl=price + sl_m*a; tp=price - tp_m*a
        cand = dict(direction=direction, kind=kind, conf=conf, sl=sl, tp=tp,
                   sl_m=sl_m, tp_m=tp_m, why=why, min_conf_req=min_conf_req)
        if best is None or cand["conf"]>best["conf"]:
            best=cand

    if best["conf"] < best["min_conf_req"]:
        skipped.append({"symbol":sym,"reason":f"conf_below_min ({best['conf']:.3f} < {best['min_conf_req']}) kind={best['kind']}"}); continue
    rr = best["tp_m"]/best["sl_m"]
    if best["kind"]=="trend_continuation" and rr<2.0:
        skipped.append({"symbol":sym,"reason":f"rr_below_2.0 ({rr:.2f})"}); continue
    if best["kind"] in ("mean_reversion_fade","liq_sweep") and rr<1.3:
        skipped.append({"symbol":sym,"reason":f"mr_rr_below_1.3 ({rr:.2f})"}); continue
    if best["kind"] in ("regime_trend","vol_contraction") and rr<1.5:
        skipped.append({"symbol":sym,"reason":f"reg_rr_below_1.5 ({rr:.2f})"}); continue

    signals.append({
        "signal_id": f"{sym}-{now_epoch}",
        "symbol": sym, "tier": cfg["tier"],
        "direction": best["direction"], "kind": best["kind"],
        "generated_at": now_iso, "generated_epoch": now_epoch,
        "entry_price": round(price,6), "sl": round(best["sl"],6), "tp": round(best["tp"],6),
        "sl_atr_mult": round(best["sl_m"],3), "tp_atr_mult": round(best["tp_m"],3),
        "rr": round(rr,3), "atr_abs": round(a,6), "atr_pct": round(apct*100,4),
        "horizon_bars": cfg["horizon"], "cooldown_bars": cfg["cooldown"],
        "confidence": round(best["conf"],4), "oos_wr": cfg["oos_wr"], "oos_n": cfg["oos_n"],
        "features": {"rsi14":round(r,2),"mom3_pct":round(mom3,4),"mom5_pct":round(mom5,4),
                    "ema20":round(e20,4),"ema50":round(e50,4),"ema_sep_pct":round(sep,4),
                    "htf_bias":bias,"chop14":round(chop,2)},
        "gate_checks": {
            "conf_ge_0.70": best["conf"]>=0.70,
            "rr_ok": True,
            "rsi_valid": True,
        },
        "reasons":[best["why"]],
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
    "gates_applied":GATES, "engine":"v3_trend+mr+regime+vol_contract+sweep",
    "caps":{"max_trades_per_day":max_day,"max_trades_per_symbol_per_day":max_sym},
    "signals":kept,"gated_out_after_caps":gated,"skipped":skipped,
    "counts":{"candidates_before_caps":len(signals),"final_signals":len(kept),"skipped":len(skipped)},
}
stamp = now_iso.replace(":","").replace("-","")
outfile = SIG_DIR / f"{stamp}_signals_v3.json"
outfile.write_text(json.dumps(out, indent=2))
(SIG_DIR/"latest.json").write_text(json.dumps(out, indent=2))
with open(TRACKER, "a") as f:
    for s in kept: f.write(json.dumps(s)+"\n")

print(f"\nWROTE {outfile}")
print(f"candidates: {len(signals)}   final: {len(kept)}   skipped: {len(skipped)}")
print()
if kept:
    print(f"{'#':<3} {'Symbol':<10} {'Kind':<22} {'Dir':<4} {'Entry':>12} {'SL':>12} {'TP':>12} {'RR':>5} {'Conf':>6} {'RSI':>6} {'Bias':<5}")
    print("-"*112)
    for i,s in enumerate(kept,1):
        print(f"{i:<3} {s['symbol']:<10} {s['kind']:<22} {s['direction']:<4} {s['entry_price']:>12} {s['sl']:>12} {s['tp']:>12} {s['rr']:>5} {s['confidence']:>6.3f} {s['features']['rsi14']:>6.1f} {s['features']['htf_bias']:<5}")
print()
print("---- top skipped reasons ----")
from collections import Counter
buckets = Counter()
for s in skipped:
    key = s["reason"].split(" (")[0]
    buckets[key] += 1
for k,v in buckets.most_common():
    print(f"  {v:>3}x {k}")
