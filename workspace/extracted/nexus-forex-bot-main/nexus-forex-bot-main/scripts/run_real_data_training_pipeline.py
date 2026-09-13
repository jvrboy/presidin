"""Real-data training pipeline (rules R2, R3, R4, R9 in rules/confluence_rules.json).

Purpose (per the project owner's explicit "Continue and train" instruction):
  1. Backtest AND forward-test every strategy this repo knows about (62
      `builtin_strategies()` + 4 `ADVANCED_BUILTIN_STRATEGIES` = 66 as of
      the 2026-08 revision 4 batch) against every tracked instrument
      (`settings.deriv_symbols`, 25) on every required timeframe
      (`settings.all_timeframes`, 10) -- 25 x 10 x 66 x 2 (backtest +
      forward) = 33,000 runs -- using ONLY real Deriv market data
      (`source="deriv"`), never demo/synthetic data (rule R3).
  2. From every WINNING trade produced anywhere in that sweep, collect its
     measured maximum-adverse-excursion (MAE) and maximum-favorable-
     excursion (MFE) and, once a symbol+timeframe has >=20 winning-trade
     samples pooled across all strategies tested on it, persist a
     `tp_sl_calibration` calibration file for that exact symbol+timeframe.
     This is what unlocks the "measured_mae_mfe" tier (rule R4) for every
     future signal on that symbol+timeframe -- replacing the ATR-multiple
     guess with a number measured from real historical trade outcomes.
  3. Record every single (symbol, timeframe, strategy) result -- OK or
     ERROR -- to an append-only JSONL ledger (rule R9: no silent failures)
     so the full training run is auditable and reproducible.

Why grouped-by-(symbol,timeframe) instead of one job per (symbol, timeframe,
strategy): fetching real Deriv history over a websocket is the expensive,
rate-limit-sensitive part per network round trip, and `BacktestEngine.run()`
recomputes every requested indicator from scratch on a growing history
window each bar, so its cost grows with the SQUARE of bar count, not
linearly (empirically: confluence_8 strategy on EURUSD 1h took ~2.6s at 120
bars, ~5.1s at 200 bars, ~9s at 300 bars, ~84s at 1001 bars). Grouping all 52
strategies for a given (symbol, timeframe) into one job means:
  - Deriv is queried exactly once per (symbol, timeframe) pair (250 fetches
    total, not 13,000), and
  - `BAR_CAP` bounds every individual backtest/forward-test run to a fixed,
    small bar count so the total sweep finishes in a tractable number of
    CPU-hours on this sandbox's 2 vCPUs, instead of being quadratic in the
    ~1000-2000 bars Deriv actually returns for the finer timeframes.
Trading off "cover 13,000 combinations" against "each combination gets the
absolute maximum bar count" is an explicit, documented choice -- the honest
constraint here is CPU time on a 2-core sandbox, not a Deriv API limit (see
docs/deriv_symbol_verification.md for the separate ~350-day *data* limit,
which is unrelated to this compute limit).

Resumability: progress is checkpointed at (symbol, timeframe) group
granularity in `reports/training_pipeline_progress.json`. Re-running this
script skips any group already marked complete there, so a multi-hour sweep
can be safely stopped and resumed across sandbox sessions without losing
work or re-spending Deriv API calls.

Usage:
    source /home/user/nexus_venv/bin/activate
    cd /home/user/webapp
    python3 scripts/run_real_data_training_pipeline.py [--symbols XAUUSD,EURUSD] \\
        [--timeframes 1h,4h] [--bar-cap 150] [--workers 2] [--max-groups 5]

Output:
    reports/training_pipeline_raw.jsonl        -- one JSON line per (symbol, timeframe, strategy) result
    reports/training_pipeline_progress.json    -- completed (symbol, timeframe) groups (for resume)
    reports/training_pipeline_summary.md       -- human-readable leaderboard + calibration coverage
    data/calibration/{SYMBOL}_{timeframe}.json -- one measured MAE/MFE calibration file per group that reached >=20 winning trades
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.advanced_agents import ADVANCED_BUILTIN_STRATEGIES  # noqa: E402
from app.services.analysis_tools import builtin_strategies  # noqa: E402
from app.services.backtester import BacktestEngine  # noqa: E402
from app.services.forward_test import forward_test  # noqa: E402
from app.services.historical_data import HistoricalDataProvider  # noqa: E402
from app.services.tp_sl_calibration import save_excursion_calibration  # noqa: E402

REPORTS_DIR = REPO_ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
RAW_PATH = REPORTS_DIR / "training_pipeline_raw.jsonl"
PROGRESS_PATH = REPORTS_DIR / "training_pipeline_progress.json"
SUMMARY_MD_PATH = REPORTS_DIR / "training_pipeline_summary.md"

DEFAULT_BAR_CAP = 150  # see module docstring for why this is bounded, not "maximum available"
MIN_WINNING_TRADES_FOR_CALIBRATION = 20  # matches tp_sl_calibration.calibrate_stop_target's own threshold

# Per-timeframe lookback in days, mirroring confluence_orchestrator.py's
# _lookback_days(). This is NOT another compute-cost cap (BAR_CAP already
# handles that) -- it exists because Deriv's `load_range` chunks a request
# into one websocket round trip per ~4900-candle span, and finer
# granularities have far shorter per-chunk spans (e.g. "1m" covers only
# ~3.4 days/chunk). Requesting the full ~340-day window at "1m" would issue
# ~100 SEQUENTIAL websocket connections in a tight loop -- precisely the
# pattern that froze this sandbox earlier in this project (see the
# incident note in docs/deriv_symbol_verification.md / the ResetSandbox
# call in this session). Each entry below is chosen so the request stays
# within a small, safe number of chunks while still returning comfortably
# more bars than BAR_CAP for that timeframe.
LOOKBACK_DAYS_BY_TIMEFRAME: dict[str, int] = {
    "1m": 5, "5m": 20, "15m": 45, "30m": 90, "1h": 180,
    "2h": 300, "4h": 340, "8h": 340, "1d": 340, "1w": 340,
}


def _lookback_days(timeframe: str) -> int:
    return LOOKBACK_DAYS_BY_TIMEFRAME.get(timeframe, 180)


def _all_strategies() -> list[dict[str, Any]]:
    return builtin_strategies() + list(ADVANCED_BUILTIN_STRATEGIES)


def _load_progress() -> set[tuple[str, str]]:
    if not PROGRESS_PATH.exists():
        return set()
    try:
        data = json.loads(PROGRESS_PATH.read_text())
        return {tuple(pair) for pair in data.get("completed_groups", [])}
    except (json.JSONDecodeError, OSError):
        return set()


def _save_progress(completed: set[tuple[str, str]]) -> None:
    PROGRESS_PATH.write_text(json.dumps({"completed_groups": sorted(list(pair) for pair in completed)}, indent=2))


def _run_group(symbol: str, timeframe: str, bar_cap: int) -> dict[str, Any]:
    """Runs every strategy's backtest + forward_test for one (symbol,
    timeframe) pair, on real Deriv data fetched exactly once. Returns the
    per-strategy result rows plus the pooled winning-trade MAE/MFE samples
    for this group (used by the caller to attempt calibration)."""
    provider = HistoricalDataProvider()
    end = date.today()
    start = end - timedelta(days=_lookback_days(timeframe))
    rows: list[dict[str, Any]] = []
    mae_samples: list[float] = []
    mfe_samples: list[float] = []
    data_start = data_end = None

    try:
        frame = provider.load(symbol, start, end, timeframe, source="deriv")
    except Exception as exc:  # noqa: BLE001 - rule R9: record the whole group as failed, never crash the pool
        return {
            "symbol": symbol, "timeframe": timeframe, "status": "GROUP_FETCH_ERROR",
            "error": f"{type(exc).__name__}: {exc}", "rows": [], "mae_samples": [], "mfe_samples": [],
            "data_start": None, "data_end": None,
        }

    data_start, data_end = str(frame["timestamp"].iloc[0]), str(frame["timestamp"].iloc[-1])
    capped = frame.tail(bar_cap).reset_index(drop=True) if len(frame) > bar_cap else frame
    engine = BacktestEngine()

    for strategy in _all_strategies():
        record: dict[str, Any] = {
            "symbol": symbol, "timeframe": timeframe, "strategy_id": strategy["id"],
            "strategy_name": strategy["name"], "bars": len(capped), "data_source": "deriv",
        }
        try:
            bt_result = engine.run(capped, strategy)
            wins = [t for t in bt_result["trades_detail"] if t["pnl"] > 0]
            mae_samples.extend(t["mae"] for t in wins if t["mae"] > 0)
            mfe_samples.extend(t["mfe"] for t in wins if t["mfe"] > 0)
            record.update(
                status="OK",
                trades=bt_result["trades"], wins=bt_result["wins"], losses=bt_result["losses"],
                win_rate_pct=round(bt_result["win_rate_pct"], 2), net_profit=round(bt_result["net_profit"], 2),
                total_return_pct=round(bt_result["total_return_pct"], 2), profit_factor=bt_result["profit_factor"],
                expectancy=round(bt_result["expectancy"], 2), max_drawdown_pct=round(bt_result["max_drawdown_pct"], 2),
                sharpe=round(bt_result["sharpe"], 3), sortino=round(bt_result["sortino"], 3),
            )
        except Exception as exc:  # noqa: BLE001 - rule R9: record, never abort the sweep
            record.update(status="ERROR", error=f"{type(exc).__name__}: {exc}", stage="backtest")
            rows.append(record)
            continue

        try:
            ft_result = forward_test(capped, strategy)
            record.update(
                forward_verdict=ft_result["verdict"],
                forward_degraded_metrics=",".join(ft_result["degraded_metrics"]),
                forward_trades=ft_result["forward"]["result"].get("trades"),
                forward_win_rate_pct=round(ft_result["forward"]["result"].get("win_rate_pct", 0.0), 2)
                if isinstance(ft_result["forward"]["result"].get("win_rate_pct"), (int, float)) else None,
            )
        except Exception as exc:  # noqa: BLE001 - a forward-test failure doesn't invalidate the backtest row
            record.update(forward_verdict="ERROR", forward_error=f"{type(exc).__name__}: {exc}")

        rows.append(record)

    return {
        "symbol": symbol, "timeframe": timeframe, "status": "GROUP_OK", "rows": rows,
        "mae_samples": mae_samples, "mfe_samples": mfe_samples,
        "data_start": data_start, "data_end": data_end,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", default=None, help="Comma-separated symbol list (default: all settings.deriv_symbols)")
    parser.add_argument("--timeframes", default=None, help="Comma-separated timeframe list (default: all settings.all_timeframes)")
    parser.add_argument("--bar-cap", type=int, default=DEFAULT_BAR_CAP, help=f"Max bars fed into each backtest/forward-test run (default {DEFAULT_BAR_CAP}); bounds the O(bars^2) indicator-recompute cost, not the real-data window used")
    parser.add_argument("--workers", type=int, default=2, help="ProcessPoolExecutor worker count (default 2, matching this sandbox's vCPUs)")
    parser.add_argument("--max-groups", type=int, default=None, help="Stop after completing this many NEW groups this invocation (for chunked/checkpointed runs); omit to run until the full grid is done")
    args = parser.parse_args()

    symbols = [s.strip().upper() for s in args.symbols.split(",")] if args.symbols else list(settings.deriv_symbols)
    timeframes = [t.strip() for t in args.timeframes.split(",")] if args.timeframes else list(settings.all_timeframes)
    unsupported_symbols = sorted(set(symbols) - set(settings.deriv_symbols))
    unsupported_timeframes = sorted(set(timeframes) - set(settings.all_timeframes))
    if unsupported_symbols or unsupported_timeframes:
        raise SystemExit(f"Unsupported symbols={unsupported_symbols} timeframes={unsupported_timeframes}")

    all_groups = [(s, t) for s in symbols for t in timeframes]
    completed = _load_progress()
    pending_groups = [g for g in all_groups if g not in completed]
    if args.max_groups is not None:
        pending_groups = pending_groups[: args.max_groups]

    print(
        f"Training pipeline: {len(symbols)} symbols x {len(timeframes)} timeframes = {len(all_groups)} groups "
        f"({len(completed)} already complete, {len(pending_groups)} pending this run) x {len(_all_strategies())} strategies, "
        f"bar_cap={args.bar_cap}, workers={args.workers}, data_source=deriv (real)"
    )
    if not pending_groups:
        print("Nothing to do -- all requested groups already complete. Regenerating summary only.")
        _write_summary()
        return

    started = time.time()
    groups_done = 0
    rows_written = 0
    calibrations_written = 0

    with RAW_PATH.open("a") as raw_file, ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(_run_group, symbol, timeframe, args.bar_cap): (symbol, timeframe) for symbol, timeframe in pending_groups}
        for future in as_completed(futures):
            symbol, timeframe = futures[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001 - a worker-process crash still gets recorded, never silently dropped
                result = {"symbol": symbol, "timeframe": timeframe, "status": "GROUP_CRASHED", "error": f"{type(exc).__name__}: {exc}", "rows": [], "mae_samples": [], "mfe_samples": [], "data_start": None, "data_end": None}

            for row in result["rows"]:
                raw_file.write(json.dumps(row) + "\n")
                rows_written += 1
            if result["status"] != "GROUP_OK":
                raw_file.write(json.dumps({"symbol": symbol, "timeframe": timeframe, "status": result["status"], "error": result.get("error")}) + "\n")
            raw_file.flush()

            if len(result["mae_samples"]) >= MIN_WINNING_TRADES_FOR_CALIBRATION:
                save_excursion_calibration(
                    symbol, timeframe, result["mae_samples"], result["mfe_samples"],
                    sample_trades=len(result["mae_samples"]), data_start=result["data_start"] or "", data_end=result["data_end"] or "",
                )
                calibrations_written += 1

            completed.add((symbol, timeframe))
            _save_progress(completed)
            groups_done += 1
            elapsed = time.time() - started
            rate = groups_done / elapsed if elapsed else 0.0
            eta = (len(pending_groups) - groups_done) / rate if rate else 0.0
            print(
                f"[{groups_done}/{len(pending_groups)}] group={symbol}/{timeframe} status={result['status']} "
                f"wins_pooled={len(result['mae_samples'])} calibrated={'YES' if len(result['mae_samples']) >= MIN_WINNING_TRADES_FOR_CALIBRATION else 'no'} "
                f"elapsed={elapsed:.0f}s eta={eta:.0f}s total_groups_done={len(completed)}/{len(all_groups)}",
                flush=True,
            )

    print(f"Done {groups_done} groups ({rows_written} strategy rows, {calibrations_written} new calibration files) in {time.time() - started:.0f}s.")
    _write_summary()


def _write_summary() -> None:
    if not RAW_PATH.exists():
        return
    records = [json.loads(line) for line in RAW_PATH.read_text().splitlines() if line.strip()]
    ok_records = [r for r in records if r.get("status") == "OK"]
    error_records = [r for r in records if r.get("status") not in {"OK", None} and "strategy_id" in r]
    group_errors = [r for r in records if "strategy_id" not in r]

    by_strategy: dict[str, list[dict]] = {}
    for r in ok_records:
        by_strategy.setdefault(r["strategy_id"], []).append(r)
    strategy_agg = []
    for sid, rows in by_strategy.items():
        forward_pass = sum(1 for r in rows if r.get("forward_verdict") == "PASS")
        strategy_agg.append({
            "strategy_id": sid, "strategy_name": rows[0]["strategy_name"], "runs": len(rows),
            "avg_win_rate_pct": round(sum(r["win_rate_pct"] for r in rows) / len(rows), 2),
            "avg_total_return_pct": round(sum(r["total_return_pct"] for r in rows) / len(rows), 2),
            "forward_pass_rate_pct": round(forward_pass / len(rows) * 100, 1) if rows else 0.0,
            "total_trades": sum(r["trades"] for r in rows),
        })
    strategy_agg.sort(key=lambda r: r["avg_total_return_pct"], reverse=True)

    calibration_dir = REPO_ROOT / "data" / "calibration"
    calibration_files = sorted(calibration_dir.glob("*.json")) if calibration_dir.exists() else []

    progress = json.loads(PROGRESS_PATH.read_text()) if PROGRESS_PATH.exists() else {"completed_groups": []}
    total_possible_groups = len(settings.deriv_symbols) * len(settings.all_timeframes)

    lines = []
    lines.append("# Real-Data Training Pipeline Summary\n")
    lines.append(f"Generated: {date.today().isoformat()}\n")
    lines.append(f"Data source: **deriv** (real historical OHLCV only -- rule R3, no demo/synthetic data)\n")
    lines.append(f"Groups (symbol x timeframe) completed: {len(progress['completed_groups'])} / {total_possible_groups}\n")
    lines.append(f"Strategy-level rows: {len(records)} total | OK: {len(ok_records)} | Strategy errors: {len(error_records)} | Group-level failures: {len(group_errors)}\n")
    lines.append(f"Calibration files written (measured_mae_mfe tier unlocked): {len(calibration_files)}\n")

    lines.append("\n## Calibrated Symbol+Timeframe Pairs (>=20 pooled winning trades)\n")
    lines.append("| Symbol | Timeframe | Sample Trades | MAE p90 | MFE p75 |")
    lines.append("|---|---|---|---|---|")
    for path in calibration_files:
        try:
            cal = json.loads(path.read_text())
            lines.append(f"| {cal['symbol']} | {cal['timeframe']} | {cal['sample_trades']} | {cal['mae_p90']:.6f} | {cal['mfe_p75']:.6f} |")
        except (json.JSONDecodeError, OSError, KeyError):
            continue

    lines.append("\n## Top 15 Strategies by Avg Total Return % (across completed groups)\n")
    lines.append("| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Forward-Test Pass Rate % | Total Trades |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(strategy_agg[:15], 1):
        lines.append(f"| {i} | {r['strategy_id']} | {r['strategy_name']} | {r['runs']} | {r['avg_total_return_pct']} | {r['avg_win_rate_pct']} | {r['forward_pass_rate_pct']} | {r['total_trades']} |")

    lines.append("\n## Bottom 15 Strategies by Avg Total Return %\n")
    lines.append("| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Forward-Test Pass Rate % | Total Trades |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(strategy_agg[-15:], 1):
        lines.append(f"| {i} | {r['strategy_id']} | {r['strategy_name']} | {r['runs']} | {r['avg_total_return_pct']} | {r['avg_win_rate_pct']} | {r['forward_pass_rate_pct']} | {r['total_trades']} |")

    if error_records or group_errors:
        lines.append(f"\n## Errors ({len(error_records)} strategy-level, {len(group_errors)} group-level)\n")
        error_types: dict[str, int] = {}
        for r in error_records + group_errors:
            key = r.get("error", "unknown")
            error_types[key] = error_types.get(key, 0) + 1
        lines.append("| Error | Count |")
        lines.append("|---|---|")
        for err, count in sorted(error_types.items(), key=lambda kv: -kv[1])[:30]:
            lines.append(f"| {err} | {count} |")

    SUMMARY_MD_PATH.write_text("\n".join(lines) + "\n")
    print(f"Wrote {SUMMARY_MD_PATH}")


if __name__ == "__main__":
    main()
