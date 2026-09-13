from datetime import date
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.advanced_agents import evaluate_neural_trend_filter, run_specialist_ensemble
from app.services.historical_data import HistoricalDataProvider


def main() -> None:
    out = Path("reports")
    out.mkdir(exist_ok=True)
    pair = "EURUSD"
    start, end = date(2019, 1, 1), date(2025, 12, 31)
    provider = HistoricalDataProvider()
    try:
        frame = provider.load(pair, start, end, "1d", "yahoo")
    except Exception as exc:
        blocked = {"status": "BLOCKED", "reason": str(exc), "evaluation_request": {"pair": pair, "start": start.isoformat(), "end": end.isoformat(), "timeframe": "1d", "source": "yahoo"}}
        (out / "neural_trend_filter_evaluation.json").write_text(json.dumps(blocked, indent=2))
        (out / "neural_trend_filter_evaluation.md").write_text("\n".join(["# Neural Trend Filter Historical Evaluation", "", "**Status: BLOCKED.** The selected historical OHLC provider did not return data in this environment, so no performance metrics were fabricated.", "", f"Provider error: `{exc}`", "", "Supply a trusted broker, Dukascopy, HistData, MetaTrader, or other OHLC CSV export and rerun this script.", ""]) )
        print(json.dumps({"report": str(out / "neural_trend_filter_evaluation.md"), "json": str(out / "neural_trend_filter_evaluation.json"), "status": "BLOCKED", "reason": str(exc)}, indent=2))
        return
    result = evaluate_neural_trend_filter(frame, initial_capital=10000.0, commission_per_trade=0.0, slippage_pips=0.5)
    result["agent_snapshot"] = run_specialist_ensemble(frame.tail(400))
    result["evaluation_request"] = {"pair": pair, "start": start.isoformat(), "end": end.isoformat(), "timeframe": "1d", "source": "yahoo", "bars": len(frame)}
    (out / "neural_trend_filter_evaluation.json").write_text(json.dumps(result, indent=2, default=str))
    metrics = {key: result.get(key) for key in ["initial_capital", "final_equity", "net_profit", "total_return_pct", "trades", "wins", "losses", "win_rate_pct", "profit_factor", "expectancy", "max_drawdown_pct", "sharpe", "sortino", "data_start", "data_end"]}
    lines = ["# Neural Trend Filter Historical Evaluation", "", "This report evaluates the paper-safe neural-trend-filter rule set on Yahoo Finance EURUSD daily data. It is a historical research result, not a forecast or guarantee.", "", "| Metric | Value |", "| --- | ---: |"]
    for key, value in metrics.items():
        lines.append(f"| {key} | {value} |")
    lines.extend(["", "## Specialist Agent Snapshot", "", "```json", json.dumps(result["agent_snapshot"], indent=2, default=str), "```", ""])
    (out / "neural_trend_filter_evaluation.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"report": str(out / "neural_trend_filter_evaluation.md"), "json": str(out / "neural_trend_filter_evaluation.json"), "metrics": metrics}, indent=2, default=str))


if __name__ == "__main__":
    main()
