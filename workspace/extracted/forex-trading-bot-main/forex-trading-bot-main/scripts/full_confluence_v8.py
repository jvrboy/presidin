#!/usr/bin/env python3
"""v8 full-confluence — post-v7 sweep learnings applied.
v7 flipped: 0/3 wins after v6's 5/6. Root cause on inspection:
  - All 3 v7 SLs took 2-6 bars (not bar-1), indicating tape reversal not noise
  - Score band was 0.28-0.36 (relaxed band range) → weakest v6-tier signals
  - HTF bias flipped during setup evaluation

v8 changes:
  1. DROP relaxed score band — require score >= 0.35 strict (v5 rule)
  2. Add HTF bias filter: require last-3-bar close direction to agree
  3. SL widen 1.10 → 1.20 (bar-2+ SL hits suggest volatility bursts, not tick noise)
  4. Require neurals_agreeing >= 5 (v6/v7 both had 6, but 5 as floor)
  5. Require agents_agreeing >= 4 (up from 3)
  6. Add momentum-3 sanity gate: no BUY if mom3 < -0.10, no SELL if mom3 > +0.10
"""
import json, ssl, time, asyncio, math, sys
import numpy as np
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict, Counter
import websockets

ROOT = Path("/home/user/ftb")
SIG_DIR = ROOT / "knowledge/signals"
TRACKER = SIG_DIR / "tracker.jsonl"
KNOWLEDGE = ROOT / "knowledge"

exec(compile(open("/home/user/full_confluence.py").read().replace(
    "asyncio.run(main())", ""), "/home/user/full_confluence.py", "exec"), globals())

async def main_v8():
    print("="*80)
    print("v8 FULL-CONFLUENCE — post-v7 sweep, tightened gates + HTF filter")
    print("="*80)

    records = []
    if TRACKER.exists():
        for line in TRACKER.read_text().splitlines():
            if line.strip(): records.append(json.loads(line))
    closed = [r for r in records if r.get("status")=="CLOSED"]

    by_kind = defaultdict(lambda: {"n":0,"tp":0})
    for r in closed:
        k = r.get("kind","unknown")
        by_kind[k]["n"] += 1
        if r["outcome"]=="TP": by_kind[k]["tp"] += 1
    kind_edges = {k:(v["tp"]/v["n"]-0.5) for k,v in by_kind.items() if v["n"]>=2}
    by_sym = defaultdict(lambda: {"n":0,"tp":0,"pnl":0.0})
    for r in closed:
        by_sym[r["symbol"]]["n"] += 1
        if r["outcome"]=="TP": by_sym[r["symbol"]]["tp"] += 1
        by_sym[r["symbol"]]["pnl"] += r.get("pnl_pct",0)
    sym_edges = {s:(v["tp"]/v["n"]-0.5) for s,v in by_sym.items() if v["n"]>=2}

    print(f"Tracker: {len(records)}  |  Closed: {len(closed)}  |  WR: {sum(1 for r in closed if r['outcome']=='TP')/max(1,len(closed))*100:.1f}%")
    print(f"Kind edges: {kind_edges}")
    print(f"Symbol edges: {sym_edges}")
    print()

    GATES=json.loads((ROOT/"knowledge/hq_gates.json").read_text())
    ELITE=json.loads((ROOT/"knowledge/hq_elite_oos.json").read_text())
    PACK=json.loads((ROOT/"knowledge/hq_knowledge_pack.json").read_text())
    CFG={r["symbol"]:{**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"elite"} for r in ELITE}
    for r in PACK.get("robust_oos",[]):
        if r["symbol"] not in CFG:
            CFG[r["symbol"]]={**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"robust"}

    print(f"Universe: {len(CFG)} symbols  |  Sources per bar: 76")
    print("Fetching fresh candles...")
    bundle = await fetch_bundle(list(CFG.keys()))
    print(f"Got data for {len(bundle)} symbols\n")

    now_iso=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    now_epoch=int(time.time())

    # v8 tightened gates
    EMIT_SCORE       = 0.35   # STRICT — no relaxed band
    EMIT_AGREEMENT   = 0.65   # up from 0.60
    EMIT_ML_MIN      = 0.55
    EMIT_AGENT_MIN   = 4      # up from 3
    EMIT_STRAT_MIN   = 20     # up from 15
    EMIT_NEURAL_MIN  = 5      # NEW: at least 5/17 nets must side with direction

    all_snapshots=[]; signals=[]; skipped=[]
    for sym,cfg in CFG.items():
        if sym not in bundle:
            skipped.append({"symbol":sym,"reason":"no_data"}); continue
        cs = bundle[sym]
        if len(cs) < 200:
            skipped.append({"symbol":sym,"reason":"too_few_bars"}); continue

        f = build_all(cs)
        S = strategies(f)
        A = agents(f, S)
        D = divergences(f)
        N = {}
        for name, fn in NEURAL_NETS.items():
            try:
                out = fn(f)
                N[name] = float(out[-1] if hasattr(out,"__len__") else out)
            except Exception:
                N[name] = 0.0

        idx = -1
        strat_last = {k: int(v[idx]) for k,v in S.items()}
        agent_last = {k: int(v[idx]) for k,v in A.items()}
        div_last   = {k: int(v[idx]) for k,v in D.items()}
        neural_last = {k: float(v) for k,v in N.items()}

        strat_vals = list(strat_last.values())
        agent_vals = list(agent_last.values())
        div_vals   = list(div_last.values())
        neural_vals = list(neural_last.values())

        n_bulls_s = sum(1 for v in strat_vals if v>0); n_bears_s = sum(1 for v in strat_vals if v<0)
        n_bulls_a = sum(1 for v in agent_vals if v>0); n_bears_a = sum(1 for v in agent_vals if v<0)
        n_bulls_d = sum(1 for v in div_vals if v>0);   n_bears_d = sum(1 for v in div_vals if v<0)
        n_bulls_n = sum(1 for v in neural_vals if v>0.10); n_bears_n = sum(1 for v in neural_vals if v<-0.10)

        w_strat = sum(strat_vals); w_agent = sum(agent_vals)*2.5
        w_div = sum(div_vals)*1.5; w_neural = sum(neural_vals)*1.5
        composite = w_strat + w_agent + w_div + w_neural
        max_composite = (48*1.0) + (5*2.5) + (6*1.5) + (17*1.5)
        composite_norm = composite / max_composite

        direction = "BUY" if composite>0 else "SELL"
        agree_with_dir = ((n_bulls_s if direction=="BUY" else n_bears_s) +
                          (n_bulls_a if direction=="BUY" else n_bears_a) +
                          (n_bulls_d if direction=="BUY" else n_bears_d) +
                          (n_bulls_n if direction=="BUY" else n_bears_n))
        total_active = (n_bulls_s+n_bears_s) + (n_bulls_a+n_bears_a) + (n_bulls_d+n_bears_d) + (n_bulls_n+n_bears_n)
        agreement = agree_with_dir / max(1, total_active)
        n_toward = np.mean([v if direction=="BUY" else -v for v in neural_vals])
        n_toward_norm = (n_toward + 1) / 2

        # NEW v8: HTF momentum filter
        c_arr = f["c"]
        mom3 = 100*(c_arr[-1]-c_arr[-4])/c_arr[-4] if len(c_arr)>=4 else 0
        mom5 = 100*(c_arr[-1]-c_arr[-6])/c_arr[-6] if len(c_arr)>=6 else 0
        mom10= 100*(c_arr[-1]-c_arr[-11])/c_arr[-11] if len(c_arr)>=11 else 0
        # last 3 bar close direction
        last3_up = int(sum(1 for i in [-1,-2,-3] if c_arr[i]>c_arr[i-1]))
        htf_ok = bool((direction=="BUY" and mom3>-0.10 and mom5>-0.15 and last3_up>=2) or
                       (direction=="SELL" and mom3<0.10 and mom5<0.15 and last3_up<=1))

        s_agree = n_bulls_s if direction=="BUY" else n_bears_s
        a_agree = n_bulls_a if direction=="BUY" else n_bears_a
        n_agree_ct = n_bulls_n if direction=="BUY" else n_bears_n

        snapshot = {
            "symbol":sym, "tier":cfg["tier"],
            "composite":round(composite,3), "composite_norm":round(composite_norm,4),
            "direction":direction, "agreement":round(agreement,3),
            "neural_toward":round(n_toward_norm,3),
            "strat_bulls":n_bulls_s,"strat_bears":n_bears_s,
            "agent_bulls":n_bulls_a,"agent_bears":n_bears_a,
            "div_bulls":n_bulls_d,"div_bears":n_bears_d,
            "neural_bulls":n_bulls_n,"neural_bears":n_bears_n,
            "htf_momentum":{"mom3":round(mom3,4),"mom5":round(mom5,4),"mom10":round(mom10,4),
                          "last3_up":last3_up,"htf_ok":htf_ok},
            "features": {
                "rsi14":round(float(f["rsi14"][-1]),2),
                "adx14":round(float(f["adx"][-1]),2),
                "chop14":round(float(f["chop"][-1]),2),
                "atr_pct":round(float(f["atr"][-1]/f["c"][-1]*100),4),
                "bb_pct":round(float(f["bb_pct"][-1]),3),
                "ema_sep_pct":round(float(abs(f["e20"][-1]-f["e50"][-1])/f["c"][-1]*100),3),
                "price":round(float(f["c"][-1]),6),
            },
        }
        all_snapshots.append(snapshot)

        confidence_est = 0.4*abs(composite_norm) + 0.25*agreement + 0.20*n_toward_norm + 0.15*(a_agree/5)
        confidence_est = min(0.99, confidence_est * 1.4 + 0.35)
        sym_boost = sym_edges.get(sym, 0) * 0.05
        confidence_final = min(0.99, confidence_est + sym_boost)

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
        if n_agree_ct >= EMIT_NEURAL_MIN: reasons_pass.append(f"nets={n_agree_ct}/17")
        else: reasons_fail.append(f"nets {n_agree_ct}/17 < {EMIT_NEURAL_MIN}")
        if htf_ok: reasons_pass.append(f"htf ok (mom3={mom3:.2f}, last3_up={last3_up})")
        else: reasons_fail.append(f"htf fail (mom3={mom3:.2f} mom5={mom5:.2f} last3_up={last3_up})")

        if reasons_fail:
            skipped.append({"symbol":sym,"direction":direction,"composite_norm":round(composite_norm,3),
                          "confidence_est":round(confidence_final,3),"reason":"; ".join(reasons_fail)})
            continue

        price = float(f["c"][-1]); a_last = float(f["atr"][-1])
        strength = min(1.5, max(0.75, abs(composite_norm)*2))
        # v8: SL widen 1.20 (up from v6's 1.10)
        sl_m = cfg["sl_m"] * strength * 1.20
        tp_m = cfg["tp_m"] * strength * 1.0
        if direction=="BUY":
            sl = price - sl_m*a_last; tp = price + tp_m*a_last
        else:
            sl = price + sl_m*a_last; tp = price - tp_m*a_last
        rr = tp_m/sl_m

        signals.append({
            "signal_id": f"{sym}-{now_epoch}",
            "symbol":sym, "tier":cfg["tier"],
            "direction":direction, "kind":"full_confluence_v8",
            "generated_at":now_iso, "generated_epoch":now_epoch,
            "entry_price":round(price,6), "sl":round(sl,6), "tp":round(tp,6),
            "sl_atr_mult":round(sl_m,3), "tp_atr_mult":round(tp_m,3),
            "rr":round(rr,3), "atr_abs":round(a_last,6),
            "horizon_bars":cfg["horizon"], "cooldown_bars":cfg["cooldown"],
            "confidence":round(confidence_final,4),
            "confluence": {
                "composite_norm":round(composite_norm,4),
                "agreement":round(agreement,3),
                "neural_toward":round(n_toward_norm,3),
                "strategies_agreeing":s_agree,"strategies_total":48,
                "agents_agreeing":a_agree,"agents_total":5,
                "divergences_agreeing":(n_bulls_d if direction=="BUY" else n_bears_d),"divergences_total":6,
                "neurals_agreeing":n_agree_ct,"neurals_total":17,
            },
            "htf_check":snapshot["htf_momentum"],
            "learned_priors_applied":{
                "sl_widen":1.20, "sym_boost":sym_boost,
                "kind_edges":kind_edges,
                "gate_tightening":"score_strict + agents>=4 + strats>=20 + nets>=5 + htf_filter",
            },
            "features":snapshot["features"],
            "reasons":reasons_pass,
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

    out = {
        "generated_at":now_iso,"generated_epoch":now_epoch,
        "engine":"full_confluence_v8",
        "sources_per_bar":{"strategies":48,"neural_nets":17,"agents":5,"divergences":6,"total":76},
        "learned_priors":{
            "tracker_size":len(records),"tracker_closed":len(closed),
            "kind_edges":kind_edges,"sym_edges":sym_edges,
        },
        "emit_gates":{
            "score":EMIT_SCORE,"agreement":EMIT_AGREEMENT,"ml":EMIT_ML_MIN,
            "agents_min":EMIT_AGENT_MIN,"strategies_min":EMIT_STRAT_MIN,
            "neurals_min":EMIT_NEURAL_MIN,"htf_filter":True,
        },
        "caps":{"max_trades_per_day":max_day,"max_trades_per_symbol_per_day":max_sym},
        "universe_size":len(CFG),"data_bars_per_symbol":1200,
        "signals":kept,"all_snapshots":all_snapshots,"skipped":skipped,
        "counts":{"snapshots":len(all_snapshots),"final_signals":len(kept),"skipped":len(skipped)},
    }
    stamp = now_iso.replace(":","").replace("-","")
    of = SIG_DIR / f"{stamp}_signals_v8_full_confluence.json"
    of.write_text(json.dumps(out, indent=2))
    (SIG_DIR/"latest.json").write_text(json.dumps(out, indent=2))
    with open(TRACKER,"a") as fp:
        for s in kept: fp.write(json.dumps(s)+"\n")

    print(f"{'Symbol':<10} {'Dir':<4} {'Score':>7} {'Agree':>6} {'ML':>5} {'S':>6} {'A':>3} {'N':>3} {'HTF':>4} {'Mom3':>7} {'Status'}")
    print("-"*105)
    for snap in sorted(all_snapshots, key=lambda x:-abs(x["composite_norm"])):
        sym=snap["symbol"]; d=snap["direction"]
        s_c = snap["strat_bulls"] if d=="BUY" else snap["strat_bears"]
        a_c = snap["agent_bulls"] if d=="BUY" else snap["agent_bears"]
        n_c = snap["neural_bulls"] if d=="BUY" else snap["neural_bears"]
        emitted = any(s["symbol"]==sym for s in kept)
        status = "★ EMIT" if emitted else "skip"
        htf = "✓" if snap["htf_momentum"]["htf_ok"] else "✗"
        mom3 = snap["htf_momentum"]["mom3"]
        print(f"{sym:<10} {d:<4} {snap['composite_norm']:>+7.3f} {snap['agreement']:>6.2f} {snap['neural_toward']:>5.2f} {s_c:>3}/48 {a_c:>1}/5 {n_c:>2}/17 {htf:>4} {mom3:>+7.3f} {status}")

    print()
    print(f"WROTE {of}")
    print(f"snapshots: {len(all_snapshots)}  emitted: {len(kept)}  skipped: {len(skipped)}")

    # Persist knowledge
    kb_path = KNOWLEDGE / "hq_signal_learn.json"
    knowledge = {
        "updated_at": now_iso,
        "cumulative_stats": {
            "total_signals": len(records),
            "closed": len(closed),
            "tp": sum(1 for r in closed if r["outcome"]=="TP"),
            "sl": sum(1 for r in closed if r["outcome"]=="SL"),
            "horizon": sum(1 for r in closed if r["outcome"]=="HORIZON"),
            "win_rate": round(sum(1 for r in closed if r["outcome"]=="TP")/max(1,len(closed))*100, 2),
            "total_pnl_pct": round(sum(r.get("pnl_pct",0) for r in closed), 4),
        },
        "by_kind": {k:{"n":v["n"],"tp":v["tp"],"wr":round(v["tp"]/v["n"]*100,1)} for k,v in by_kind.items()},
        "by_symbol": {s:{"n":v["n"],"tp":v["tp"],"wr":round(v["tp"]/v["n"]*100,1),"pnl":round(v["pnl"],4)} for s,v in by_sym.items()},
        "kind_edges": kind_edges, "symbol_edges": sym_edges,
        "engine_history": {
            "v3_mr_fade": "2/6 wins (33%) — retired",
            "v5_full_confluence": "2/2 wins (100%) — n too small",
            "v6_full_confluence": "5/6 wins (83.3%, +0.341% PnL) — relaxed band OK when other layers strong",
            "v7_full_confluence": "0/3 wins (0%, -0.194% PnL) — relaxed band trapped tape-reversal setups; all took 2-6 bars, not bar-1",
            "v8_full_confluence": "STRICT score + agent>=4 + strat>=20 + net>=5 + HTF filter + SL x1.20",
        },
        "recommendations_for_next_run": [
            "v7 loss shows that during tape reversals, weakest-confluence signals hit SL disproportionately",
            "HTF momentum filter (mom3+mom5+last3_up) should prevent counter-trend fades in v8",
            "Cumulative full_confluence family is 7/11 (63.6%) — still edge-positive but noisier than v5+v6 alone",
            "Consider adding realized-vol regime detector: skip all signals when atr_pct > 90th pct",
        ],
    }
    kb_path.write_text(json.dumps(knowledge, indent=2))
    print(f"\nKnowledge updated: {kb_path}")

asyncio.run(main_v8())
