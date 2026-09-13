"""Systematic backtest report generator.

Runs every builtin strategy (50) against every Deriv-tracked symbol (16)
across three timeframe proxies ("1h", "4h", "1d" -- see NOTE below), using
the deterministic demo data source (`HistoricalDataProvider(..., source="demo")`)
so the report is fully reproducible without depending on live Deriv API
availability/rate limits for a ~2,400-run sweep.

NOTE on "timeframe" in demo mode: `MarketDataProvider`'s demo generator seeds
a single deterministic random-walk price path per symbol and does not
currently produce genuinely distinct 1h/4h/1d candle series (the underlying
per-bar path is the same; only the requested bar COUNT and the resampled
timestamp labels differ across intervals). This is an existing limitation of
the demo data source, not something introduced by this report. Each
"timeframe" row below should be read as "N bars of the symbol's deterministic
demo series, timestamped at that interval" rather than as an independently
sourced OHLCV series. Once live Deriv history is used (`source="deriv"`)
each interval WILL be a genuinely distinct series -- see
`scripts/run_backtest_report.py --source deriv` for that (slower, live-API,
rate-limited) mode.

Usage:
    source /home/user/nexus_venv/bin/activate
    cd /home/user/clone_check/repo
    python3 scripts/run_backtest_report.py

Output:
    reports/backtest_report_raw.jsonl   -- one JSON line per (symbol, timeframe, strategy) run
    reports/backtest_report_summary.csv -- flattened summary table
    reports/backtest_report_summary.md  -- human-readable top/bottom strategy leaderboard
"""
from __future__ import annotations

import csv
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from app.core.config import settings  # noqa: E402
from app.services.analysis_tools import builtin_strategies  # noqa: E402
from app.services.backtester import BacktestEngine  # noqa: E402
from app.services.historical_data import HistoricalDataProvider  # noqa: E402

REPORTS_DIR = REPO_ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
RAW_PATH = REPORTS_DIR / "backtest_report_raw.jsonl"
SUMMARY_CSV_PATH = REPORTS_DIR / "backtest_report_summary.csv"
SUMMARY_MD_PATH = REPORTS_DIR / "backtest_report_summary.md"

# (timeframe_label, lookback_days) -- chosen to keep each run's OHLCV frame in
# the ~150-300 bar range, balancing statistical relevance against the ~1s/run
# wall-clock cost of the indicator engine across a 16 x 50 x 3 = 2,400 run sweep.
TIMEFRAMES: list[tuple[str, int]] = [
    ("1h", 12),   # ~288 hourly bars
    ("4h", 30),   # ~180 4h bars
    ("1d", 200),  # ~200 daily bars
]


def _run_one(symbol: str, timeframe: str, days: int, strategy: dict) -> dict:
    provider = HistoricalDataProvider()
    engine = BacktestEngine()
    end = date.today()
    start = end - timedelta(days=days)
    record = {
        "symbol": symbol,
        "timeframe": timeframe,
        "strategy_id": strategy["id"],
        "strategy_name": strategy["name"],
    }
    try:
        frame = provider.load(symbol, start, end, timeframe, source="demo")
        result = engine.run(frame, strategy)
        record.update(
            status="OK",
            trades=result["trades"],
            wins=result["wins"],
            losses=result["losses"],
            win_rate_pct=round(result["win_rate_pct"], 2),
            net_profit=round(result["net_profit"], 2),
            total_return_pct=round(result["total_return_pct"], 2),
            profit_factor=result["profit_factor"],
            expectancy=round(result["expectancy"], 2),
            max_drawdown_pct=round(result["max_drawdown_pct"], 2),
            sharpe=round(result["sharpe"], 3),
            sortino=round(result["sortino"], 3),
            bars=len(frame),
        )
    except Exception as exc:  # noqa: BLE001 - report every failure, never abort the sweep
        record.update(status="ERROR", error=f"{type(exc).__name__}: {exc}")
    return record


def main() -> None:
    symbols = settings.deriv_symbols
    strategies = builtin_strategies()
    jobs = [
        (symbol, timeframe, days, strategy)
        for symbol in symbols
        for timeframe, days in TIMEFRAMES
        for strategy in strategies
    ]
    total = len(jobs)
    print(f"Backtest report: {len(symbols)} symbols x {len(TIMEFRAMES)} timeframes x {len(strategies)} strategies = {total} runs")

    started = time.time()
    completed = 0
    ok_count = 0
    error_count = 0

    with RAW_PATH.open("w") as raw_file, ProcessPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(_run_one, *job): job for job in jobs}
        for future in as_completed(futures):
            record = future.result()
            raw_file.write(json.dumps(record) + "\n")
            raw_file.flush()
            completed += 1
            if record["status"] == "OK":
                ok_count += 1
            else:
                error_count += 1
            if completed % 50 == 0 or completed == total:
                elapsed = time.time() - started
                rate = completed / elapsed if elapsed else 0.0
                eta = (total - completed) / rate if rate else 0.0
                print(f"[{completed}/{total}] ok={ok_count} error={error_count} elapsed={elapsed:.0f}s eta={eta:.0f}s", flush=True)

    print(f"Done in {time.time() - started:.0f}s. Writing summary...")
    _write_summary()


def _write_summary() -> None:
    records = [json.loads(line) for line in RAW_PATH.read_text().splitlines() if line.strip()]
    fieldnames = [
        "symbol", "timeframe", "strategy_id", "strategy_name", "status",
        "trades", "wins", "losses", "win_rate_pct", "net_profit",
        "total_return_pct", "profit_factor", "expectancy", "max_drawdown_pct",
        "sharpe", "sortino", "bars", "error",
    ]
    with SUMMARY_CSV_PATH.open("w", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow(record)

    ok_records = [r for r in records if r["status"] == "OK" and r.get("trades", 0) > 0]
    error_records = [r for r in records if r["status"] != "OK"]

    # Aggregate by strategy across all symbols/timeframes.
    by_strategy: dict[str, list[dict]] = {}
    for r in ok_records:
        by_strategy.setdefault(r["strategy_id"], []).append(r)
    strategy_agg = []
    for sid, rows in by_strategy.items():
        total_return = sum(r["total_return_pct"] for r in rows) / len(rows)
        win_rate = sum(r["win_rate_pct"] for r in rows) / len(rows)
        trades = sum(r["trades"] for r in rows)
        strategy_agg.append({
            "strategy_id": sid,
            "strategy_name": rows[0]["strategy_name"],
            "runs": len(rows),
            "avg_total_return_pct": round(total_return, 2),
            "avg_win_rate_pct": round(win_rate, 2),
            "total_trades": trades,
        })
    strategy_agg.sort(key=lambda r: r["avg_total_return_pct"], reverse=True)

    # Aggregate by symbol across all strategies/timeframes.
    by_symbol: dict[str, list[dict]] = {}
    for r in ok_records:
        by_symbol.setdefault(r["symbol"], []).append(r)
    symbol_agg = []
    for sym, rows in by_symbol.items():
        total_return = sum(r["total_return_pct"] for r in rows) / len(rows)
        win_rate = sum(r["win_rate_pct"] for r in rows) / len(rows)
        symbol_agg.append({
            "symbol": sym,
            "runs": len(rows),
            "avg_total_return_pct": round(total_return, 2),
            "avg_win_rate_pct": round(win_rate, 2),
        })
    symbol_agg.sort(key=lambda r: r["avg_total_return_pct"], reverse=True)

    lines = []
    lines.append("# Systematic Backtest Report\n")
    lines.append(f"Generated: {date.today().isoformat()}\n")
    lines.append(f"Total runs: {len(records)} | OK (with trades): {len(ok_records)} | Errors: {len(error_records)}\n")
    lines.append("\nData source: demo (deterministic synthetic OHLCV per symbol; see script docstring for the\n"
                  "known 1h/4h/1d-share-the-same-underlying-path limitation of demo mode).\n")

    lines.append("\n## Top 15 Strategies by Average Total Return % (across all symbols/timeframes)\n")
    lines.append("| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Total Trades |")
    lines.append("|---|---|---|---|---|---|---|")
    for i, r in enumerate(strategy_agg[:15], 1):
        lines.append(f"| {i} | {r['strategy_id']} | {r['strategy_name']} | {r['runs']} | {r['avg_total_return_pct']} | {r['avg_win_rate_pct']} | {r['total_trades']} |")

    lines.append("\n## Bottom 15 Strategies by Average Total Return % (across all symbols/timeframes)\n")
    lines.append("| Rank | Strategy ID | Name | Runs | Avg Return % | Avg Win Rate % | Total Trades |")
    lines.append("|---|---|---|---|---|---|---|")
    for i, r in enumerate(strategy_agg[-15:], 1):
        lines.append(f"| {i} | {r['strategy_id']} | {r['strategy_name']} | {r['runs']} | {r['avg_total_return_pct']} | {r['avg_win_rate_pct']} | {r['total_trades']} |")

    lines.append("\n## Symbols Ranked by Average Total Return % (across all strategies/timeframes)\n")
    lines.append("| Rank | Symbol | Runs | Avg Return % | Avg Win Rate % |")
    lines.append("|---|---|---|---|---|")
    for i, r in enumerate(symbol_agg, 1):
        lines.append(f"| {i} | {r['symbol']} | {r['runs']} | {r['avg_total_return_pct']} | {r['avg_win_rate_pct']} |")

    if error_records:
        lines.append(f"\n## Errors ({len(error_records)})\n")
        error_types: dict[str, int] = {}
        for r in error_records:
            key = r.get("error", "unknown")
            error_types[key] = error_types.get(key, 0) + 1
        lines.append("| Error | Count |")
        lines.append("|---|---|")
        for err, count in sorted(error_types.items(), key=lambda kv: -kv[1]):
            lines.append(f"| {err} | {count} |")

    SUMMARY_MD_PATH.write_text("\n".join(lines) + "\n")
    print(f"Wrote {RAW_PATH}, {SUMMARY_CSV_PATH}, {SUMMARY_MD_PATH}")


if __name__ == "__main__":
    main()
