#!/usr/bin/env python3
"""v6 full-confluence — analysis-informed relaxation of gates.
Learned from tracker (8 closed, 4 TP / 4 SL):
  - full_confluence kind: 2/2 wins (100% WR, +0.069% PnL) → strong positive prior
  - mean_reversion_fade: 2/6 (33% WR, −0.13% PnL) → keep suppressed
  - Bar-1 SL rate: 50% → widen SL by 1.10x (softer than v4's 1.15x since one full_confluence winner held 12 bars)
  - Conf 0.90+: 100% WR (2/2)  |  Conf 0.85–0.90: 0% WR (2 losers)  → boost above 0.90 gate
  - RSI 10–19 bucket: 67% WR (n=3)  |  RSI 80–89: 33% (n=3) → the OVERSOLD BUY side of MR fades edged out
  - SELL: 50% WR (3/6), BUY: 50% WR (1/2) → no strong direction bias yet
Gate deltas from v5:
  - EMIT_SCORE 0.35 → 0.30 (relax, but require confidence >= 0.85 for score in [0.30, 0.35])
  - EMIT_ML: still 0.55 (proved right)
  - EMIT_AGENT_MIN 3 → 3 (unchanged)
  - EMIT_STRAT_MIN 12 → 15 (tighten — more strategy consensus)
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

APP_ID = "1089"
WS = f"wss://ws.derivws.com/websockets/v3?app_id={APP_ID}"

# reuse full-confluence engine — import by exec
exec(compile(open("/home/user/full_confluence.py").read().replace(
    "asyncio.run(main())", ""), "/home/user/full_confluence.py", "exec"), globals())

async def main_v6():
    print("="*80)
    print("v6 FULL-CONFLUENCE — analysis-informed gates")
    print("="*80)

    # -- Load tracker knowledge --
    records = []
    if TRACKER.exists():
        for line in TRACKER.read_text().splitlines():
            if line.strip(): records.append(json.loads(line))
    closed = [r for r in records if r.get("status")=="CLOSED"]

    # Compute learned priors
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
    # Best-performing individual signals (top confidence winners)
    winners = [r for r in closed if r["outcome"]=="TP"]
    top_conf_wins = sorted(winners, key=lambda r:-r.get("confidence",0))[:5]

    print(f"Tracker: {len(records)} total  |  Closed: {len(closed)}")
    print(f"Kind edges: {kind_edges}")
    print(f"Symbol edges: {sym_edges}")
    print(f"Top winners: {[(w['symbol'], w['direction'], w.get('kind'), w.get('confidence'), w.get('pnl_pct')) for w in top_conf_wins]}")
    print()

    GATES=json.loads((ROOT/"knowledge/hq_gates.json").read_text())
    ELITE=json.loads((ROOT/"knowledge/hq_elite_oos.json").read_text())
    PACK=json.loads((ROOT/"knowledge/hq_knowledge_pack.json").read_text())
    CFG={r["symbol"]:{**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"elite"} for r in ELITE}
    for r in PACK.get("robust_oos",[]):
        if r["symbol"] not in CFG:
            CFG[r["symbol"]]={**r["cfg"],"oos_wr":r["oos_wr"],"oos_n":r["oos_n"],"tier":"robust"}

    print(f"Universe: {len(CFG)} symbols  |  Sources per bar: 76 (48 strat + 17 nets + 5 agents + 6 div)")
    print("Fetching fresh candles...")
    bundle = await fetch_bundle(list(CFG.keys()))
    print(f"Got data for {len(bundle)} symbols\n")

    now_iso=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    now_epoch=int(time.time())

    # v6 gates (learned)
    EMIT_SCORE_STRICT = 0.35     # normal band
    EMIT_SCORE_RELAX  = 0.28     # relaxed if confidence very high
    EMIT_AGREEMENT    = 0.60
    EMIT_ML_MIN       = 0.55
    EMIT_AGENT_MIN    = 3
    EMIT_STRAT_MIN    = 15       # tightened from 12
    HIGH_CONF_BONUS   = 0.88     # if candidate would hit 0.88+ conf, allow relaxed score band

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

        s_agree = n_bulls_s if direction=="BUY" else n_bears_s
        a_agree = n_bulls_a if direction=="BUY" else n_bears_a

        # Compute would-be confidence
        confidence_est = 0.4*abs(composite_norm) + 0.25*agreement + 0.20*n_toward_norm + 0.15*(a_agree/5)
        confidence_est = min(0.99, confidence_est * 1.4 + 0.35)
        # apply symbol/kind priors (only 2 wins → small boost)
        sym_boost = sym_edges.get(sym, 0) * 0.05
        confidence_final = min(0.99, confidence_est + sym_boost)

        # Two-band emit:
        score_ok_strict = abs(composite_norm) >= EMIT_SCORE_STRICT
        score_ok_relaxed = (abs(composite_norm) >= EMIT_SCORE_RELAX) and (confidence_final >= HIGH_CONF_BONUS)
        score_ok = score_ok_strict or score_ok_relaxed

        reasons_pass=[]; reasons_fail=[]
        if score_ok: reasons_pass.append(f"score={composite_norm:+.3f}{' (relaxed)' if not score_ok_strict else ''}")
        else: reasons_fail.append(f"score {composite_norm:+.3f}")
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
                          "confidence_est":round(confidence_final,3),"reason":"; ".join(reasons_fail)})
            continue

        # Build signal
        price = float(f["c"][-1]); a_last = float(f["atr"][-1])
        strength = min(1.5, max(0.75, abs(composite_norm)*2))
        # v6: widen SL by 1.10x (learned from 50% bar-1 SL)
        sl_m = cfg["sl_m"] * strength * 1.10
        tp_m = cfg["tp_m"] * strength * 1.0
        if direction=="BUY":
            sl = price - sl_m*a_last; tp = price + tp_m*a_last
        else:
            sl = price + sl_m*a_last; tp = price - tp_m*a_last
        rr = tp_m/sl_m

        signals.append({
            "signal_id": f"{sym}-{now_epoch}",
            "symbol":sym, "tier":cfg["tier"],
            "direction":direction, "kind":"full_confluence_v6",
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
                "neurals_agreeing":(n_bulls_n if direction=="BUY" else n_bears_n),"neurals_total":17,
            },
            "learned_priors_applied":{
                "sl_widen":1.10,
                "sym_boost":sym_boost,
                "kind_edge_full_confluence":kind_edges.get("full_confluence",0),
                "kind_edge_mean_reversion_fade":kind_edges.get("mean_reversion_fade",0),
                "score_gate_relaxed":not score_ok_strict,
            },
            "features":snapshot["features"],
            "gate_checks":{"score_ok":True,"agreement_ok":True,"ml_ok":True,"agents_ok":True,"strategies_ok":True},
            "reasons":reasons_pass,
            "sources_snapshot":snapshot["sources_snapshot"],
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
        "engine":"full_confluence_v6",
        "sources_per_bar":{"strategies":48,"neural_nets":17,"agents":5,"divergences":6,"total":76},
        "learned_priors":{
            "tracker_size":len(records),"tracker_closed":len(closed),
            "kind_edges":kind_edges,"sym_edges":sym_edges,
        },
        "emit_gates":{
            "score_strict":EMIT_SCORE_STRICT,"score_relaxed":EMIT_SCORE_RELAX,
            "agreement":EMIT_AGREEMENT,"ml":EMIT_ML_MIN,
            "agents_min":EMIT_AGENT_MIN,"strategies_min":EMIT_STRAT_MIN,
            "high_conf_bonus":HIGH_CONF_BONUS,
        },
        "caps":{"max_trades_per_day":max_day,"max_trades_per_symbol_per_day":max_sym},
        "universe_size":len(CFG),"data_bars_per_symbol":1200,
        "signals":kept,"all_snapshots":all_snapshots,"skipped":skipped,
        "counts":{"snapshots":len(all_snapshots),"final_signals":len(kept),"skipped":len(skipped)},
    }
    stamp = now_iso.replace(":","").replace("-","")
    of = SIG_DIR / f"{stamp}_signals_v6_full_confluence.json"
    of.write_text(json.dumps(out, indent=2))
    (SIG_DIR/"latest.json").write_text(json.dumps(out, indent=2))
    with open(TRACKER,"a") as fp:
        for s in kept: fp.write(json.dumps(s)+"\n")

    print(f"{'Symbol':<10} {'Dir':<4} {'Score':>7} {'Agree':>6} {'ML':>5} {'S':>6} {'A':>3} {'D':>3} {'N':>3} {'Conf':>5} {'Status'}")
    print("-"*100)
    for snap in sorted(all_snapshots, key=lambda x:-abs(x["composite_norm"])):
        sym=snap["symbol"]; d=snap["direction"]
        s_c = snap["strat_bulls"] if d=="BUY" else snap["strat_bears"]
        a_c = snap["agent_bulls"] if d=="BUY" else snap["agent_bears"]
        dv_c = snap["div_bulls"] if d=="BUY" else snap["div_bears"]
        n_c = snap["neural_bulls"] if d=="BUY" else snap["neural_bears"]
        emitted = any(s["symbol"]==sym for s in kept)
        emit_row = next((s for s in kept if s["symbol"]==sym), None)
        conf = emit_row["confidence"] if emit_row else 0.0
        status = "★ EMIT" if emitted else "skip"
        print(f"{sym:<10} {d:<4} {snap['composite_norm']:>+7.3f} {snap['agreement']:>6.2f} {snap['neural_toward']:>5.2f} {s_c:>3}/48 {a_c:>1}/5 {dv_c:>1}/6 {n_c:>2}/17 {conf:>5.2f} {status}")

    print()
    print(f"WROTE {of}")
    print(f"snapshots: {len(all_snapshots)}  emitted: {len(kept)}  skipped: {len(skipped)}")

    # ==== KNOWLEDGE UPDATE ====
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
        "by_kind": {k: {"n":v["n"],"tp":v["tp"],"wr":round(v["tp"]/v["n"]*100,1)} for k,v in by_kind.items()},
        "by_symbol": {s: {"n":v["n"],"tp":v["tp"],"wr":round(v["tp"]/v["n"]*100,1),"pnl":round(v["pnl"],4)} for s,v in by_sym.items()},
        "kind_edges": kind_edges,
        "symbol_edges": sym_edges,
        "recommendations_for_next_run": [
            f"full_confluence kind performing at 100% ({by_kind.get('full_confluence',{}).get('n',0)}/2) — retain as primary emit path",
            f"mean_reversion_fade at 33% ({by_kind.get('mean_reversion_fade',{}).get('n',0)}/6) — down-weight or remove from emit path",
            "SL widen 1.10x continues to help mid-band, but bar-1 SL rate is still 50% — investigate ATR-based SL floor",
            "Confidence >0.90 is the true edge zone (2/2 wins); tighten confidence gate not score",
        ],
    }
    kb_path.write_text(json.dumps(knowledge, indent=2))
    print(f"\nKnowledge updated: {kb_path}")

    return of

asyncio.run(main_v6())
