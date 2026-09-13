from fastapi import APIRouter
from pydantic import BaseModel
from .. import forex, backtest, confluence, risk, memory, learning, reasoning
router = APIRouter()

@router.get("/backtest")
async def run_backtest(pair: str = "EURUSD", strategy: str = None, bars: int = 500):
    s = await forex.fetch_series(pair, "H1", bars)
    if not s: return {"ok": False, "error": f"no data for {pair}"}
    return backtest.run(s, strategy=strategy)

@router.get("/confluence")
async def get_confluence(pair: str = "EURUSD"):
    return await confluence.confluence(pair)

@router.get("/risk/position-size")
def position_size(balance: float = 10000, risk_pct: float = 1.0, entry: float = 0, sl: float = 0, pair: str = "EURUSD"):
    return risk.position_size(balance, risk_pct, entry, sl, pair=pair)

@router.get("/risk/kelly")
def kelly(win_rate: float = 50, rr: float = 2.0):
    return risk.kelly(win_rate, rr)

class MemIn(BaseModel):
    kind: str = "fact"
    key: str
    value: str
    importance: int = 5

@router.post("/memory")
def remember(body: MemIn): return memory.remember(body.kind, body.key, body.value, body.importance)
@router.get("/memory")
def recall(query: str = None, kind: str = None): return memory.recall(query, kind)
@router.delete("/memory/{key}")
def forget(key: str): return memory.forget(key)

@router.get("/learning/performance")
def perf(): return learning.performance()

class ReasonIn(BaseModel):
    method: str
    payload: dict = {}

@router.post("/reason")
def reason(body: ReasonIn):
    m = body.method; p = body.payload
    if m == "hypothesis": return reasoning.hypothesis_test(p.get("claim",""), p.get("for",[]), p.get("against",[]))
    if m == "bayes": return reasoning.bayes_update(p.get("prior_pct", 50), p.get("likelihood_ratio", 1))
    if m == "decision": return reasoning.decision_matrix(p.get("options",[]), p.get("criteria",{}))
    if m == "second_order": return reasoning.second_order(p.get("action",""), p.get("horizon","6 months"))
    return {"ok": False, "error": "method must be hypothesis|bayes|decision|second_order"}
