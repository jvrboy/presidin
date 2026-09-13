"""Self-learning: every signal the engine emits is recorded; later prices are
checked against the prediction; per-strategy accuracy is learned and used to
re-weight future signals. Fully Supabase-backed with local fallback."""
import time, json
from . import db

TABLE = "signal_predictions"
_local_preds = []
_local_weights = {}
_last_record: dict = {}      # instrument -> epoch of last recorded prediction (throttle)
RECORD_INTERVAL_S = 60       # one prediction per instrument per minute, max

def record_prediction(instrument, bias, entry, tp, sl, confidence, strategies_used=None):
    now = time.time()
    if now - _last_record.get(instrument, 0) < RECORD_INTERVAL_S:
        return None  # throttled: signals get polled aggressively; don't flood the table
    _last_record[instrument] = now
    row = {"instrument": instrument, "bias": bias, "entry": entry, "tp": tp, "sl": sl,
           "confidence": confidence, "strategies": json.dumps(strategies_used or []),
           "status": "open", "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try:
        r = db.db().table(TABLE).insert(row).execute()
        row["id"] = r.data[0].get("id") if r.data else None
    except Exception: pass
    _local_preds.append(row)
    return row

def evaluate_open(current_prices: dict):
    """Check open predictions against current prices; mark win/loss; update weights."""
    open_preds = [p for p in _local_preds if p.get("status") == "open"]
    try:
        r = db.db().table(TABLE).select("*").eq("status", "open").limit(500).execute()
        open_preds = r.data or open_preds
    except Exception: pass
    closed = 0
    for p in open_preds:
        price = current_prices.get(p["instrument"])
        if price is None: continue
        bias, entry, tp, sl = p["bias"], p["entry"], p["tp"], p["sl"]
        if None in (entry, tp, sl): continue
        win = None
        if bias == "bullish":
            if price >= tp: win = True
            elif price <= sl: win = False
        elif bias == "bearish":
            if price <= tp: win = True
            elif price >= sl: win = False
        if win is None: continue
        status = "win" if win else "loss"
        try: db.db().table(TABLE).update({"status": status, "closed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "exit_price": price}).eq("id", p["id"]).execute()
        except Exception: pass
        p["status"] = status
        _learn(p, win)
        closed += 1
    return {"ok": True, "evaluated": closed}

def _learn(pred, win):
    """Adjust per-strategy weights by outcome (exponential moving accuracy)."""
    try: strategies = json.loads(pred.get("strategies") or "[]")
    except Exception: strategies = []
    for s in strategies or [pred.get("bias", "aggregate")]:
        w = _local_weights.get(s, {"wins": 0, "total": 0})
        w["total"] += 1; w["wins"] += 1 if win else 0
        _local_weights[s] = w
        try: db.db().table("strategy_weights").upsert({"strategy": s, "wins": w["wins"], "total": w["total"], "accuracy": w["wins"]/w["total"], "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, on_conflict="strategy").execute()
        except Exception: pass
    db.log_event("learning.outcome", {"instrument": pred["instrument"], "win": win})

def strategy_weight(name):
    """Learned accuracy (0-1) for a strategy; 0.5 default when unknown."""
    try:
        r = db.db().table("strategy_weights").select("*").eq("strategy", name).limit(1).execute()
        if r.data: return r.data[0].get("accuracy", 0.5)
    except Exception: pass
    w = _local_weights.get(name)
    return (w["wins"]/w["total"]) if w and w["total"] else 0.5

def performance():
    try:
        r = db.db().table(TABLE).select("status").in_("status", ["win","loss"]).limit(2000).execute()
        rows = r.data or []
    except Exception:
        rows = [p for p in _local_preds if p.get("status") in ("win","loss")]
    wins = sum(1 for r in rows if r["status"]=="win"); total = len(rows)
    return {"ok": True, "closed": total, "wins": wins, "win_rate": round(wins/total*100,1) if total else None,
            "learned_weights": {k: round(v["wins"]/v["total"],3) for k,v in _local_weights.items() if v["total"]}}
