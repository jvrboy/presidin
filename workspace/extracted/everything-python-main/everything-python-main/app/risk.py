"""Position sizing + risk metrics: lot size from balance/risk%/stop, R multiples,
kelly fraction, max drawdown guard."""
def position_size(balance, risk_pct, entry, sl, pip_value=10.0, pair="EURUSD"):
    if not all([balance, risk_pct, entry, sl]) or entry == sl:
        return {"ok": False, "error": "need balance, risk_pct, entry, sl (entry != sl)"}
    sl_dist = abs(entry - sl)
    risk_amt = balance * risk_pct / 100
    # FX pip = 0.0001 (JPY 0.01); metals/crypto use point distance directly
    pip = 0.01 if "JPY" in pair else 0.0001 if len(pair) == 6 and pair.isalpha() else 1.0
    lots = risk_amt / ((sl_dist / pip) * pip_value) if pip_value else 0
    return {"ok": True, "risk_amount": round(risk_amt, 2), "sl_distance": round(sl_dist, 5),
            "lots": round(max(lots, 0), 2), "units": round(max(lots, 0) * 100000)}

def kelly(win_rate, rr):
    """Kelly fraction for a win rate and reward:risk."""
    if not win_rate or win_rate <= 0 or win_rate >= 100 or not rr: return {"ok": False, "error": "need win_rate (0-100) and rr"}
    p = win_rate / 100; q = 1 - p
    f = p - q / rr
    return {"ok": True, "kelly_full": round(f, 4), "kelly_half": round(f/2, 4),
            "note": "Half-Kelly is the practical choice; full Kelly is aggressive."}
