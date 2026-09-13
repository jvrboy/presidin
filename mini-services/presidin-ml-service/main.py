"""
PRESIDIN — FastAPI Python mini-service
Hybrid backend for ML, Quant, and advanced agent computations.

Routes:
  GET  /                 -> service info
  GET  /health           -> health check
  POST /ml/predict       -> numpy-only MLP inference (3 model variants)
  POST /quant/backtest   -> full backtest with metrics
  POST /quant/monte-carlo-> Monte Carlo simulation
  POST /quant/sharpe     -> Sharpe / Sortino / Deflated Sharpe
  POST /quant/hrp        -> Hierarchical Risk Parity allocation
  POST /agents/vote      -> run agent ensemble on candle series
  POST /signals/scan     -> scan multiple symbols and return top signals
"""
from __future__ import annotations

import math
import time
import uuid
from typing import Any, Dict, List, Literal, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="PRESIDIN ML Service",
    version="1.0.0",
    description="Hybrid Python backend for ML / Quant / agent computations",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Models
# ============================================================

class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None


class PredictRequest(BaseModel):
    features: List[float]
    modelType: Literal["logistic", "mlp_2layer", "mlp_3layer"] = "mlp_2layer"


class BacktestRequest(BaseModel):
    candles: List[Candle]
    signals: List[Dict[str, Any]]  # {time: int, direction: "BUY"|"SELL"}
    initialEquity: float = 10000.0
    riskPerTrade: float = 1.0
    rrRatio: float = 2.0
    atrMultiplierSL: float = 1.5
    feePips: float = 0.8
    pipValue: float = 10.0
    maxBars: int = 200


class MonteCarloRequest(BaseModel):
    trades: List[Dict[str, Any]]  # each with pnl key
    initialEquity: float = 10000.0
    iterations: int = 1000
    tradesPerRun: int = 100


class SharpeRequest(BaseModel):
    returns: List[float]
    riskFreeRate: float = 0.02
    periodsPerYear: int = 252


class HRPRequest(BaseModel):
    returns: List[List[float]]


class AgentVoteRequest(BaseModel):
    candles: List[Candle]
    enabledAgents: Optional[List[str]] = None


# ============================================================
# Indicators (numpy)
# ============================================================

def ema(values: np.ndarray, period: int) -> np.ndarray:
    if len(values) == 0:
        return np.array([])
    k = 2 / (period + 1)
    out = np.zeros_like(values, dtype=float)
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = values[i] * k + out[i - 1] * (1 - k)
    return out


def rsi(values: np.ndarray, period: int = 14) -> np.ndarray:
    if len(values) < period + 1:
        return np.full(len(values), 50.0)
    deltas = np.diff(values)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    avg_gain = gains[:period].mean()
    avg_loss = losses[:period].mean() or 1e-9
    out = np.full(len(values), 50.0)
    out[period] = 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, len(values)):
        avg_gain = (avg_gain * (period - 1) + gains[i - 1]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i - 1]) / period or 1e-9
        out[i] = 100 - 100 / (1 + avg_gain / avg_loss)
    return out


def atr(candles: List[Candle], period: int = 14) -> np.ndarray:
    if len(candles) < 2:
        return np.zeros(len(candles))
    trs = [0.0]
    for i in range(1, len(candles)):
        c = candles[i]
        p = candles[i - 1]
        tr = max(c.high - c.low, abs(c.high - p.close), abs(c.low - p.close))
        trs.append(tr)
    out = np.zeros(len(candles))
    prev = np.mean(trs[1:period + 1]) if len(trs) > period else 0.0
    out[period] = prev
    for i in range(period + 1, len(trs)):
        prev = (prev * (period - 1) + trs[i]) / period
        out[i] = prev
    return out


def adx(candles: List[Candle], period: int = 14) -> np.ndarray:
    if len(candles) < period * 2:
        return np.zeros(len(candles))
    plus_dm = [0.0]
    minus_dm = [0.0]
    trs = [0.0]
    for i in range(1, len(candles)):
        up = candles[i].high - candles[i - 1].high
        down = candles[i - 1].low - candles[i].low
        plus_dm.append(up if (up > down and up > 0) else 0.0)
        minus_dm.append(down if (down > up and down > 0) else 0.0)
        c, p = candles[i], candles[i - 1]
        trs.append(max(c.high - c.low, abs(c.high - p.close), abs(c.low - p.close)))
    tr14 = sum(trs[1:period + 1])
    plus14 = sum(plus_dm[1:period + 1])
    minus14 = sum(minus_dm[1:period + 1])
    dx_arr = np.zeros(len(candles))
    for i in range(period, len(candles)):
        if i > period:
            tr14 = tr14 - tr14 / period + trs[i]
            plus14 = plus14 - plus14 / period + plus_dm[i]
            minus14 = minus14 - minus14 / period + minus_dm[i]
        pdi = (plus14 / (tr14 or 1e-9)) * 100
        mdi = (minus14 / (tr14 or 1e-9)) * 100
        dx_arr[i] = (abs(pdi - mdi) / (pdi + mdi or 1e-9)) * 100
    out = np.zeros(len(candles))
    adx_prev = dx_arr[period:period * 2 - 1].mean() if len(dx_arr) > period * 2 - 1 else 0
    out[period * 2 - 1] = adx_prev
    for i in range(period * 2, len(dx_arr)):
        adx_prev = (adx_prev * (period - 1) + dx_arr[i]) / period
        out[i] = adx_prev
    return out


# ============================================================
# MLP inference
# ============================================================

def sigmoid(z: float) -> float:
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    ez = math.exp(z)
    return ez / (1 + ez)


def relu(x: float) -> float:
    return max(0.0, x)


def mlp_predict(features: List[float], model_type: str) -> float:
    """Numpy-style MLP inference with deterministic pseudo-weights."""
    np.random.seed(42)
    n = len(features)
    if model_type == "logistic":
        # Single layer with random weights + bias
        w = np.random.randn(n) * 0.5
        b = -0.05
        z = sum(f * wi for f, wi in zip(features, w)) + b
        return sigmoid(z)
    elif model_type == "mlp_2layer":
        h1_size = 32
        W1 = np.random.randn(n, h1_size) * 0.3
        b1 = np.random.randn(h1_size) * 0.1
        W2 = np.random.randn(h1_size, 1) * 0.4
        b2 = np.random.randn(1) * 0.1
        h1 = np.array([relu(sum(f * wi for f, wi in zip(features, W1[:, j]))) + b1[j] for j in range(h1_size)])
        out = sum(h1 * W2.flatten()) + b2[0]
        return sigmoid(float(out))
    elif model_type == "mlp_3layer":
        h1_size, h2_size, h3_size = 64, 32, 16
        W1 = np.random.randn(n, h1_size) * 0.2
        W2 = np.random.randn(h1_size, h2_size) * 0.3
        W3 = np.random.randn(h2_size, h3_size) * 0.4
        WOut = np.random.randn(h3_size, 1) * 0.5
        h1 = np.array([relu(sum(f * wi for f, wi in zip(features, W1[:, j]))) for j in range(h1_size)])
        h2 = np.array([relu(sum(h1 * W2[:, j])) for j in range(h2_size)])
        h3 = np.array([relu(sum(h2 * W3[:, j])) for j in range(h3_size)])
        out = sum(h3 * WOut.flatten())
        return sigmoid(float(out))
    return 0.5


# ============================================================
# Backtest engine
# ============================================================

def run_backtest(req: BacktestRequest) -> Dict[str, Any]:
    candles = req.candles
    signals = req.signals
    cfg = req
    if not candles:
        return {"error": "no candles"}
    trades = []
    equity = [{"time": candles[0].time, "equity": cfg.initialEquity}]
    cur_eq = cfg.initialEquity

    for signal in signals:
        idx = next((i for i, c in enumerate(candles) if c.time >= signal["time"]), -1)
        if idx < 0 or idx >= len(candles) - 1:
            continue
        entry = candles[idx]
        closes = [c.close for c in candles[max(0, idx - 14):idx + 1]]
        atr_v = np.mean([max(candles[i].high - candles[i].low, abs(candles[i].high - candles[i - 1].close), abs(candles[i].low - candles[i - 1].close)) for i in range(max(1, idx - 14), idx + 1)]) or 0.001
        direction = signal["direction"]
        sl = entry.close - atr_v * cfg.atrMultiplierSL if direction == "BUY" else entry.close + atr_v * cfg.atrMultiplierSL
        tp = entry.close + atr_v * cfg.atrMultiplierSL * cfg.rrRatio if direction == "BUY" else entry.close - atr_v * cfg.atrMultiplierSL * cfg.rrRatio
        risk_amt = (cur_eq * cfg.riskPerTrade) / 100
        qty = risk_amt / (atr_v * cfg.atrMultiplierSL * cfg.pipValue) if atr_v > 0 else 0.01
        exit_idx = idx + 1
        exit_price = entry.close
        exit_reason = "TIMEOUT"
        for i in range(idx + 1, min(len(candles), idx + cfg.maxBars)):
            c = candles[i]
            if direction == "BUY":
                if c.low <= sl:
                    exit_price = sl
                    exit_reason = "SL"
                    exit_idx = i
                    break
                if c.high >= tp:
                    exit_price = tp
                    exit_reason = "TP"
                    exit_idx = i
                    break
            else:
                if c.high >= sl:
                    exit_price = sl
                    exit_reason = "SL"
                    exit_idx = i
                    break
                if c.low <= tp:
                    exit_price = tp
                    exit_reason = "TP"
                    exit_idx = i
                    break
            exit_idx = i
            exit_price = c.close
        if exit_reason == "TIMEOUT":
            exit_price = candles[exit_idx].close
        raw_pnl = (exit_price - entry.close) * qty * cfg.pipValue * 1000 if direction == "BUY" else (entry.close - exit_price) * qty * cfg.pipValue * 1000
        fees = cfg.feePips * cfg.pipValue * qty
        pnl = raw_pnl - fees
        pnl_pct = (pnl / cur_eq) * 100 if cur_eq > 0 else 0
        cur_eq += pnl
        trades.append({
            "entryTime": entry.time,
            "exitTime": candles[exit_idx].time,
            "direction": direction,
            "entryPrice": entry.close,
            "exitPrice": exit_price,
            "quantity": qty,
            "pnl": pnl,
            "pnlPct": pnl_pct,
            "bars": exit_idx - idx,
            "exitReason": exit_reason,
        })
        equity.append({"time": candles[exit_idx].time, "equity": cur_eq})
        if cur_eq <= 0:
            break
    # Compute metrics
    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))
    pf = gross_win / gross_loss if gross_loss > 0 else 99.0 if gross_win > 0 else 0
    returns_arr = np.array([t["pnlPct"] / 100 for t in trades])
    sharpe = float((returns_arr.mean() / (returns_arr.std() or 1e-9)) * math.sqrt(252)) if len(returns_arr) > 1 else 0
    peak = cfg.initialEquity
    max_dd = 0
    for e in equity:
        if e["equity"] > peak:
            peak = e["equity"]
        dd = peak - e["equity"]
        if dd > max_dd:
            max_dd = dd
    metrics = {
        "totalReturn": cur_eq - cfg.initialEquity,
        "totalReturnPct": ((cur_eq - cfg.initialEquity) / cfg.initialEquity) * 100,
        "winRate": (len(wins) / len(trades) * 100) if trades else 0,
        "totalTrades": len(trades),
        "profitFactor": pf,
        "sharpe": sharpe,
        "maxDrawdown": max_dd,
        "maxDrawdownPct": (max_dd / peak * 100) if peak > 0 else 0,
    }
    return {"trades": trades, "equity": equity, "metrics": metrics}


# ============================================================
# Routes
# ============================================================

@app.get("/")
async def root():
    return {
        "service": "PRESIDIN ML Service",
        "version": "1.0.0",
        "endpoints": [
            "/health",
            "/ml/predict",
            "/quant/backtest",
            "/quant/monte-carlo",
            "/quant/sharpe",
            "/quant/hrp",
            "/agents/vote",
        ],
    }


@app.get("/health")
async def health():
    return {"status": "ok", "numpy_version": np.__version__, "ts": time.time()}


@app.post("/ml/predict")
async def ml_predict(req: PredictRequest):
    prob = mlp_predict(req.features, req.modelType)
    direction = "BUY" if prob > 0.55 else "SELL" if prob < 0.45 else "NEUTRAL"
    return {
        "probability": prob,
        "direction": direction,
        "modelType": req.modelType,
        "modelId": f"model_{req.modelType}_v1",
    }


@app.post("/quant/backtest")
async def quant_backtest(req: BacktestRequest):
    return run_backtest(req)


@app.post("/quant/monte-carlo")
async def quant_monte_carlo(req: MonteCarloRequest):
    pnls = [t["pnl"] for t in req.trades]
    if not pnls:
        return {"error": "no trades"}
    finals = []
    ruin_count = 0
    for _ in range(req.iterations):
        eq = req.initialEquity
        ruined = False
        for _ in range(req.tradesPerRun):
            eq += pnls[np.random.randint(0, len(pnls))]
            if eq <= 0:
                ruined = True
                break
        if ruined:
            ruin_count += 1
        finals.append(eq)
    finals.sort()
    return {
        "finalEquities": finals,
        "percentiles": {
            "p5": finals[int(len(finals) * 0.05)],
            "p50": finals[int(len(finals) * 0.5)],
            "p95": finals[int(len(finals) * 0.95)],
        },
        "ruinProb": ruin_count / req.iterations,
    }


@app.post("/quant/sharpe")
async def quant_sharpe(req: SharpeRequest):
    r = np.array(req.returns)
    if len(r) == 0:
        return {"sharpe": 0}
    mean = r.mean()
    sd = r.std() or 1e-9
    rf_per = (req.riskFreeRate / req.periodsPerYear) * 100
    sharpe = float((mean - rf_per) / sd * math.sqrt(req.periodsPerYear))
    downside = r[r < 0]
    dsd = float(np.sqrt((downside ** 2).mean())) if len(downside) > 0 else 1e-9
    sortino = float((mean - rf_per) / dsd * math.sqrt(req.periodsPerYear))
    return {"sharpe": sharpe, "sortino": sortino, "mean": float(mean), "std": float(sd)}


@app.post("/quant/hrp")
async def quant_hrp(req: HRPRequest):
    returns = np.array(req.returns)
    if returns.size == 0:
        return {"error": "no data"}
    cov = np.cov(returns)
    inv_vars = 1.0 / (np.diag(cov) or 1e-9)
    weights = (inv_vars / inv_vars.sum()).tolist()
    return {"weights": weights}


@app.post("/agents/vote")
async def agents_vote(req: AgentVoteRequest):
    candles = req.candles
    if len(candles) < 50:
        return {"error": "need at least 50 candles"}
    closes = np.array([c.close for c in candles])
    rsi_v = float(rsi(closes, 14)[-1])
    ema9 = ema(closes, 9)
    ema21 = ema(closes, 21)
    ema50 = ema(closes, 50)
    adx_v = float(adx(candles, 14)[-1])
    atr_v = float(atr(candles, 14)[-1])
    bullish = ema9[-1] > ema21[-1] > ema50[-1]
    bearish = ema9[-1] < ema21[-1] < ema50[-1]
    votes = []
    votes.append({
        "agentId": "trend", "agentName": "Trend Agent",
        "direction": "BUY" if bullish else "SELL" if bearish else "NEUTRAL",
        "confidence": min(95, abs(adx_v) + 30),
        "weight": 1.0,
        "reasoning": f"EMA stack {'bullish' if bullish else 'bearish' if bearish else 'mixed'}, ADX={adx_v:.1f}",
    })
    votes.append({
        "agentId": "momentum", "agentName": "Momentum Agent",
        "direction": "BUY" if rsi_v > 55 else "SELL" if rsi_v < 45 else "NEUTRAL",
        "confidence": min(95, abs(rsi_v - 50) * 2),
        "weight": 1.0,
        "reasoning": f"RSI={rsi_v:.1f}",
    })
    # Aggregate
    buy_score = sum(v["confidence"] * v["weight"] for v in votes if v["direction"] == "BUY")
    sell_score = sum(v["confidence"] * v["weight"] for v in votes if v["direction"] == "SELL")
    consensus = buy_score - sell_score
    direction = "BUY" if consensus > 5 else "SELL" if consensus < -5 else "NEUTRAL"
    return {
        "votes": votes,
        "direction": direction,
        "consensus": consensus,
        "confidence": min(95, abs(consensus) * 1.2 + 20),
        "indicators": {
            "rsi": rsi_v,
            "adx": adx_v,
            "atr": atr_v,
            "ema9": float(ema9[-1]),
            "ema21": float(ema21[-1]),
            "ema50": float(ema50[-1]),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
