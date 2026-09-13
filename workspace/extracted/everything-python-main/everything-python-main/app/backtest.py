"""Deterministic strategy backtester: walk a strategy across historical bars,
track equity, win rate, drawdown, profit factor. Honest stats, no lookahead."""
from .strategies import STRATEGIES

def run(series, strategy=None, initial=10000.0, risk_pct=1.0, rr=2.0):
    c = series["closes"]
    if len(c) < 60: return {"ok": False, "error": "need 60+ bars"}
    import statistics
    def atr_at(i, p=14):
        if i < p+1: return None
        trs=[max(series["highs"][j]-series["lows"][j], abs(series["highs"][j]-c[j-1]), abs(series["lows"][j]-c[j-1])) for j in range(i-p+1,i+1)]
        return statistics.mean(trs)
    equity, peak, max_dd = initial, initial, 0.0
    trades, wins, gross_w, gross_l = 0, 0, 0.0, 0.0
    position = 0  # +1 long, -1 short, 0 flat
    entry = 0.0
    curve = []
    for i in range(50, len(c)):
        window = {"closes": c[:i+1], "highs": series["highs"][:i+1], "lows": series["lows"][:i+1], "volumes": (series.get("volumes") or [1]*(i+1))[:i+1]}
        if strategy and strategy in STRATEGIES:
            sig = STRATEGIES[strategy](window["closes"], window["highs"], window["lows"], window["volumes"])
        else:
            votes = [fn(window["closes"], window["highs"], window["lows"], window["volumes"]) for fn in STRATEGIES.values()]
            sig = 1 if sum(votes) > 0 else -1 if sum(votes) < 0 else 0
        price = c[i]
        if position != 0:
            pnl_pct = (price - entry) / entry * position
            a = atr_at(i) or price * 0.005
            if abs(price - entry) >= a * (rr if pnl_pct > 0 else 1.0) * (1 if pnl_pct > 0 else 1):
                risk_amt = equity * risk_pct / 100
                pnl = risk_amt * (rr if pnl_pct > 0 else -1)
                equity += pnl
                trades += 1
                if pnl > 0: wins += 1; gross_w += pnl
                else: gross_l += abs(pnl)
                position = 0
        if position == 0 and sig != 0:
            position = sig; entry = price
        peak = max(peak, equity); max_dd = max(max_dd, (peak - equity) / peak * 100)
        curve.append(round(equity, 2))
    return {"ok": True, "strategy": strategy or "aggregate", "trades": trades,
            "win_rate": round(wins/trades*100,1) if trades else None,
            "final_equity": round(equity,2), "return_pct": round((equity-initial)/initial*100,2),
            "max_drawdown_pct": round(max_dd,2),
            "profit_factor": round(gross_w/gross_l,2) if gross_l else None,
            "note": "Heuristic backtest — no spread/slippage/commission. Not a performance guarantee."}
