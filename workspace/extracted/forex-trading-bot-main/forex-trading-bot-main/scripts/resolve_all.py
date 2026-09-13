#!/usr/bin/env python3
"""Resolve every OPEN signal in tracker against fresh candles."""
import json, ssl, time, asyncio
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
import websockets

ROOT = Path("/home/user/ftb")
SIG_DIR = ROOT / "knowledge/signals"
TRACKER = SIG_DIR / "tracker.jsonl"

WS = "wss://ws.derivws.com/websockets/v3?app_id=1089"

async def fetch_candles(symbol, count=300, granularity=60):
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

async def main():
    records = []
    for line in TRACKER.read_text().splitlines():
        if line.strip(): records.append(json.loads(line))
    open_ = [r for r in records if r.get("status")=="OPEN"]
    if not open_:
        print("No open signals."); return
    syms = list(set(r["symbol"] for r in open_))
    print(f"Resolving {len(open_)} open signals on {len(syms)} symbols: {syms}\n")

    fresh = {}
    for s in syms:
        try:
            cs = await fetch_candles(s, 300, 60)
            if cs: fresh[s] = cs
        except Exception as e:
            print(f"  {s} FAILED: {e}")

    resolutions = []
    for s in open_:
        sym = s["symbol"]
        if sym not in fresh:
            resolutions.append({**s,"resolve_status":"NO_DATA"}); continue
        cs = fresh[sym]
        gen_ep = s["generated_epoch"]
        post = [c for c in cs if c["epoch"] > gen_ep]
        if not post:
            resolutions.append({**s,"resolve_status":"PENDING","bars_elapsed":0}); continue
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
    print(f"{'Symbol':<10} {'Dir':<4} {'Kind':<24} {'Status':<8} {'Outcome':<8} {'Entry':>14} {'Exit':>14} {'PnL%':>9} {'Bars':>5}")
    print("-"*110)
    for r in resolutions:
        st_ = r["resolve_status"]
        if st_=="CLOSED":
            oc=r["outcome"]; pnl=r["pnl_pct"]; total_pnl+=pnl
            if oc=="TP": tp_ct+=1
            elif oc=="SL": sl_ct+=1
            else: hz_ct+=1
            print(f"{r['symbol']:<10} {r['direction']:<4} {r.get('kind','-'):<24} {st_:<8} {oc:<8} {r['entry_price']:>14} {r['exit_price']:>14} {pnl:>+9.4f} {r['bars_held']:>5}")
        else:
            pend_ct+=1
            cur=r.get("current_price","-"); elap=r.get("bars_elapsed",0)
            print(f"{r['symbol']:<10} {r['direction']:<4} {r.get('kind','-'):<24} {st_:<8} {'-':<8} {r['entry_price']:>14} {str(cur):>14} {'-':>9} {elap:>5}")
    closed_now = tp_ct+sl_ct+hz_ct
    wr_now = tp_ct/closed_now*100 if closed_now else 0
    print("-"*110)
    print(f"Batch: closed={closed_now}  TP={tp_ct}  SL={sl_ct}  Hz={hz_ct}  pending={pend_ct}  WR={wr_now:.1f}%  PnL={total_pnl:+.4f}%")

    # Update tracker in place
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
    print(f"\nResolution report saved: {SIG_DIR/(stamp+'_resolutions.json')}")

asyncio.run(main())
