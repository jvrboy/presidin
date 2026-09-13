from datetime import date
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from app.services.advanced_agents import run_specialist_ensemble
from app.services.historical_data import HistoricalDataProvider
from app.services.mock_feed import validate_realtime_neural_signals
from app.services.neural_model import train_neural_model


def main() -> None:
    output = Path("reports")
    output.mkdir(exist_ok=True)
    frame = HistoricalDataProvider().load("EURUSD", date(2024, 1, 1), date(2025, 12, 31), "1h", "demo")
    trained = train_neural_model(frame, horizon_bars=6, threshold=0.0002)
    validation = validate_realtime_neural_signals(frame, "EURUSD", trained["model_blob"], trained["feature_names"], start_index=120, minimum_probability=0.55, spread_pips=1.0, max_ticks=250)
    ensemble = run_specialist_ensemble(frame.tail(300))
    report = {"source": "deterministic_demo_mock_feed", "pair": "EURUSD", "bars": len(frame), "training_metrics": trained["metrics"], "feature_importance": trained["importance"], "validation": validation, "agent_ensemble": ensemble}
    (output / "mock_broker_neural_validation.json").write_text(json.dumps(report, indent=2, default=str))
    (output / "mock_broker_neural_validation.md").write_text("\n".join(["# Mock Broker Neural Validation", "", "This report replays deterministic demo OHLC bars through a broker-like bid/ask feed. It validates paper signal generation only; it is not a live-market performance result.", "", f"- Bars: {len(frame)}", f"- Replay ticks: {validation['ticks']}", f"- BUY signals: {validation['buy_signals']}", f"- SELL signals: {validation['sell_signals']}", f"- HOLD events: {validation['holds']}", f"- Neural validation accuracy: {trained['metrics']['accuracy']:.4f}", "", "## Agent Ensemble", "", "```json", json.dumps(ensemble, indent=2, default=str), "```", ""]) + "\n")
    print(json.dumps({"report": str(output / "mock_broker_neural_validation.md"), "validation": validation, "training_metrics": trained["metrics"]}, indent=2, default=str))


if __name__ == "__main__":
    main()
