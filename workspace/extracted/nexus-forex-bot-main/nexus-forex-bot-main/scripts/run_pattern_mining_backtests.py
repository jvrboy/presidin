#!/usr/bin/env python3
"""Pattern-mining backtest pipeline: XAUUSD + EURUSD x all 10 timeframes.

For every (symbol, timeframe) group this script:

1. Loads the MAXIMUM available past historical data. Source precedence:
   `deriv` (real data, rule R3) when reachable, otherwise an explicit,
   RECORDED fallback to the deterministic demo source -- never silent
   (rules R8/R9). The effective source and fallback reason are written
   into every artifact.
2. Mines original strategy configurations from learned indicator-pattern
   edges (`app/services/strategy_miner.py`: atomic-condition grid ->
   forward-edge measurement -> train/validation out-of-sample gate).
3. Re-validates every mined config through the no-look-ahead
   `BacktestEngine` on a recent bar-capped window and records the metrics.
4. Persists per-group JSON artifacts (`data/mined_strategies/`), an
   OK/ERROR audit line per unit of work (`reports/mined_strategies_raw.jsonl`,
   rule R9), checkpoint state (`reports/mining_progress.json`) so the run
   is resumable, and a final human-readable summary
   (`reports/mined_strategies_summary.md`).

Usage:
    python3 scripts/run_pattern_mining_backtests.py                       # all groups
    python3 scripts/run_pattern_mining_backtests.py --symbols EURUSD      # subset
    python3 scripts/run_pattern_mining_backtests.py --source deriv        # force real data
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.backtester import BacktestEngine  # noqa: E402
from app.services.strategy_miner import mine_strategies  # noqa: E402

MINED_DIR = REPO_ROOT / "data" / "mined_strategies"
REPORTS_DIR = REPO_ROOT / "reports"
RAW_LOG = REPORTS_DIR / "mined_strategies_raw.jsonl"
PROGRESS_FILE = REPORTS_DIR / "mining_progress.json"
SUMMARY_MD = REPORTS_DIR / "mined_strategies_summary.md"

DEFAULT_SYMBOLS = ["XAUUSD", "EURUSD"]
VALIDATION_BARS = 200          # recent-window cap for the BacktestEngine pass
MAX_BARS_PER_TIMEFRAME = 4000  # deep-history budget per group (vectorized mining)


def _load_group_frame(symbol: str, timeframe: str, source_arg: str) -> tuple[object, str, str]:
    """Load maximum history for one group. Returns (frame, source_used, fallback_reason)."""
    import pandas as pd

    end = date.today()
    if source_arg in ("auto", "deriv"):
        try:
            from app.services.historical_data import HistoricalDataProvider
            frame = HistoricalDataProvider().load(symbol, end - timedelta(days=340), end, timeframe, "deriv")
            return frame, "deriv", ""
        except Exception as exc:  # noqa: BLE001 - R9: record the fallback reason
            if source_arg == "deriv":
                raise RuntimeError(f"deriv source forced but unavailable: {exc}") from exc
            fallback_reason = f"{type(exc).__name__}: {exc}"
    else:
        fallback_reason = "demo source requested explicitly"

    from app.services.market_data import MarketDataProvider
    rows = MarketDataProvider().get_ohlc(symbol, MAX_BARS_PER_TIMEFRAME)
    frame = pd.DataFrame(rows)
    freq = {"1m": "min", "5m": "5min", "15m": "15min", "30m": "30min", "1h": "h", "2h": "2h", "4h": "4h", "8h": "8h", "1d": "D", "1w": "W"}.get(timeframe, "h")
    frame["timestamp"] = pd.date_range(end=end.isoformat(), periods=len(frame), freq=freq)
    return frame, "demo", fallback_reason


def _append_raw(record: dict) -> None:
    with RAW_LOG.open("a") as fh:
        fh.write(json.dumps(record, default=str) + "\n")


def _load_progress() -> dict:
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def _save_progress(done: dict[str, dict]) -> None:
    PROGRESS_FILE.write_text(json.dumps({"completed_groups": done, "total_done": len(done)}, indent=2))


def process_group(symbol: str, timeframe: str, source_arg: str, horizon: int, record_raw: bool = True) -> dict:
    started = time.time()
    record: dict = {"symbol": symbol, "timeframe": timeframe, "status": "ERROR", "requested_source": source_arg}
    try:
        frame, source_used, fallback_reason = _load_group_frame(symbol, timeframe, source_arg)
        record["data_source"] = source_used
        record["bars"] = len(frame)
        record["fallback_reason"] = fallback_reason

        mined = mine_strategies(frame, horizon=horizon)

        # No-look-ahead engine validation on the most recent capped window.
        validation_window = frame.tail(VALIDATION_BARS).reset_index(drop=True)
        for candidate in mined:
            config = {**candidate["config"], "pair": symbol}
            try:
                result = BacktestEngine().run(validation_window.copy(), config, initial_capital=10000.0)
                candidate["backtest"] = {
                    "net_profit_pct": round(float(result.get("total_return_pct", 0.0)), 3),
                    "trades": int(result.get("trades", 0)),
                    "win_rate_pct": round(float(result.get("win_rate_pct", 0.0)), 2),
                    "profit_factor": round(float(result.get("profit_factor") or 0.0), 3),
                    "max_drawdown_pct": round(float(result.get("max_drawdown_pct", 0.0)), 3),
                }
            except Exception as exc:  # noqa: BLE001 - one bad config must not kill the group
                candidate["backtest"] = {"error": f"{type(exc).__name__}: {exc}"}

        artifact = {
            "symbol": symbol,
            "timeframe": timeframe,
            "data_source": source_used,
            "fallback_reason": fallback_reason,
            "bars_mined": len(frame),
            "horizon_bars": horizon,
            "strategy_count": len(mined),
            "strategies": mined,
        }
        MINED_DIR.mkdir(parents=True, exist_ok=True)
        (MINED_DIR / f"{symbol}_{timeframe}.json").write_text(json.dumps(artifact, indent=2))

        record.update({
            "status": "OK",
            "strategies_mined": len(mined),
            "elapsed_seconds": round(time.time() - started, 2),
        })
    except Exception as exc:  # noqa: BLE001 - R9: every failure recorded, batch continues
        record["error"] = f"{type(exc).__name__}: {exc}"
        record["elapsed_seconds"] = round(time.time() - started, 2)
    if record_raw:
        # Test invocations pass record_raw=False so pytest runs never append
        # noise to the production R9 audit ledger.
        REPORTS_DIR.mkdir(exist_ok=True)
        _append_raw(record)
    return record


def write_summary(records: list[dict]) -> None:
    ok = [r for r in records if r.get("status") == "OK"]
    errors = [r for r in records if r.get("status") != "OK"]
    lines = [
        "# Pattern-mined strategy sweep summary",
        "",
        f"- Groups processed: **{len(records)}** ({len(ok)} OK, {len(errors)} ERROR)",
        f"- Symbols: {', '.join(sorted({r['symbol'] for r in records}))}",
        f"- Timeframes: {', '.join(settings.all_timeframes)}",
        "",
        "| Symbol | TF | Source | Bars | Strategies | Best score | Best backtest |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in sorted(ok, key=lambda r: (r["symbol"], r["timeframe"])):
        artifact_path = MINED_DIR / f"{r['symbol']}_{r['timeframe']}.json"
        best_score, best_bt = "-", "-"
        if artifact_path.exists():
            artifact = json.loads(artifact_path.read_text())
            if artifact["strategies"]:
                best = artifact["strategies"][0]
                best_score = f"{best['score']:.4f}"
                bt = best.get("backtest", {})
                best_bt = bt.get("error") or f"{bt.get('net_profit_pct', 0):+.1f}% ({bt.get('trades', 0)} trades)"
        lines.append(f"| {r['symbol']} | {r['timeframe']} | {r['data_source']} | {r['bars']} | {r['strategies_mined']} | {best_score} | {best_bt} |")
    if errors:
        lines += ["", "## Errors", ""]
        for r in errors:
            lines.append(f"- `{r['symbol']} {r['timeframe']}`: {r.get('error')}")
    sources = {r["data_source"] for r in records}
    if "demo" in sources:
        lines += [
            "",
            "> Data-source disclosure (rule R8): part or all of this run used the deterministic demo source because live Deriv history was unreachable from this environment",
            "> (WebSocket upgrade blocked by sandbox egress; see docs/backtest_data_findings.md). Re-run with `--source deriv` wherever real market data is reachable.",
        ]
    SUMMARY_MD.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    parser.add_argument("--timeframes", default=",".join(settings.all_timeframes))
    parser.add_argument("--source", choices=["auto", "deriv", "demo"], default="auto")
    parser.add_argument("--horizon", type=int, default=12)
    args = parser.parse_args()

    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    timeframes = [t.strip() for t in args.timeframes.split(",") if t.strip()]
    unknown = sorted(set(symbols) - set(settings.all_symbols))
    if unknown:
        raise SystemExit(f"Unsupported symbols: {unknown}")
    unknown_tf = sorted(set(timeframes) - set(settings.all_timeframes))
    if unknown_tf:
        raise SystemExit(f"Unsupported timeframes: {unknown_tf}")

    REPORTS_DIR.mkdir(exist_ok=True)
    progress = _load_progress()
    done: dict[str, dict] = dict(progress.get("completed_groups", {}))
    records: list[dict] = []
    total = len(symbols) * len(timeframes)

    print(f"Mining {len(symbols)} symbols x {len(timeframes)} timeframes = {total} groups (horizon={args.horizon})")
    for symbol in symbols:
        for timeframe in timeframes:
            key = f"{symbol}_{timeframe}_{args.source}"
            if key in done and done[key].get("status") == "OK":
                print(f"[skip] {key} already completed")
                records.append(done[key])
                continue
            record = process_group(symbol, timeframe, args.source, args.horizon)
            records.append(record)
            done[key] = record
            _save_progress(done)
            status_icon = record["status"]
            detail = record.get("strategies_mined", record.get("error"))
            print(f"[{status_icon}] {symbol} {timeframe} source={record.get('data_source', '?')} bars={record.get('bars', 0)} -> {detail}")

    write_summary(records)
    print(f"Summary -> {SUMMARY_MD}")
    failures = sum(1 for r in records if r.get("status") != "OK")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
