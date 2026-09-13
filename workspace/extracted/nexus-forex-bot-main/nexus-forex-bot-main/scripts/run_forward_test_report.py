"""Systematic forward-test report generator.

Runs `app.services.forward_test.forward_test()` (strict, unmodified-config
out-of-sample validation -- distinct from walk-forward re-optimization) for
every builtin strategy (50) against every Deriv-tracked symbol (16) on the
deterministic demo data source, using a single "1h" timeframe with a longer
lookback (enough bars for a meaningful 70/30 in-sample/forward split).

A single timeframe is used here (rather than the 3 used in
`run_backtest_report.py`) because each forward-test run internally executes
TWO backtests (in-sample + forward slice), doubling the per-run cost; keeping
the sweep to 16 x 50 = 800 runs keeps total wall-clock time comparable to the
backtest report while still covering every symbol/strategy combination.

Usage:
    source /home/user/nexus_venv/bin/activate
    cd /home/user/clone_check/repo
    python3 scripts/run_forward_test_report.py

Output:
    reports/forward_test_report_raw.jsonl   -- one JSON line per (symbol, strategy) run
    reports/forward_test_report_summary.csv -- flattened summary table
    reports/forward_test_report_summary.md  -- human-readable verdict breakdown
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
from app.services.forward_test import forward_test  # noqa: E402
from app.services.historical_data import HistoricalDataProvider  # noqa: E402

REPORTS_DIR = REPO_ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
RAW_PATH = REPORTS_DIR / "forward_test_report_raw.jsonl"
SUMMARY_CSV_PATH = REPORTS_DIR / "forward_test_report_summary.csv"
SUMMARY_MD_PATH = REPORTS_DIR / "forward_test_report_summary.md"

TIMEFRAME = "1h"
LOOKBACK_DAYS = 20  # ~480 hourly demo bars -> comfortably >= 80 required, with room for a real 70/30 split
SPLIT_PCT = 0.7


def _run_one(symbol: str, strategy: dict) -> dict:
    provider = HistoricalDataProvider()
    end = date.today()
    start = end - timedelta(days=LOOKBACK_DAYS)
    record = {
        "symbol": symbol,
        "timeframe": TIMEFRAME,
        "strategy_id": strategy["id"],
        "strategy_name": strategy["name"],
    }
    try:
        frame = provider.load(symbol, start, end, TIMEFRAME, source="demo")
        result = forward_test(frame, strategy, split_pct=SPLIT_PCT)
        in_sample = result["in_sample"]["result"]
        forward = result["forward"]["result"]
        record.update(
            status="OK",
            verdict=result["verdict"],
            degraded_metrics=",".join(result["degraded_metrics"]),
            in_sample_bars=result["in_sample"]["bars"],
            forward_bars=result["forward"]["bars"],
            in_sample_trades=in_sample.get("trades"),
            forward_trades=forward.get("trades"),
            in_sample_return_pct=round(in_sample.get("total_return_pct", 0.0), 2),
            forward_return_pct=round(forward.get("total_return_pct", 0.0), 2) if isinstance(forward.get("total_return_pct"), (int, float)) else None,
            in_sample_win_rate_pct=round(in_sample.get("win_rate_pct", 0.0), 2),
            forward_win_rate_pct=round(forward.get("win_rate_pct", 0.0), 2) if isinstance(forward.get("win_rate_pct"), (int, float)) else None,
        )
    except Exception as exc:  # noqa: BLE001 - report every failure, never abort the sweep
        record.update(status="ERROR", error=f"{type(exc).__name__}: {exc}")
    return record


def main() -> None:
    symbols = settings.deriv_symbols
    strategies = builtin_strategies()
    jobs = [(symbol, strategy) for symbol in symbols for strategy in strategies]
    total = len(jobs)
    print(f"Forward-test report: {len(symbols)} symbols x {len(strategies)} strategies = {total} runs (timeframe={TIMEFRAME})")

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
            if completed % 25 == 0 or completed == total:
                elapsed = time.time() - started
                rate = completed / elapsed if elapsed else 0.0
                eta = (total - completed) / rate if rate else 0.0
                print(f"[{completed}/{total}] ok={ok_count} error={error_count} elapsed={elapsed:.0f}s eta={eta:.0f}s", flush=True)

    print(f"Done in {time.time() - started:.0f}s. Writing summary...")
    _write_summary()


def _write_summary() -> None:
    records = [json.loads(line) for line in RAW_PATH.read_text().splitlines() if line.strip()]
    fieldnames = [
        "symbol", "timeframe", "strategy_id", "strategy_name", "status", "verdict",
        "degraded_metrics", "in_sample_bars", "forward_bars", "in_sample_trades",
        "forward_trades", "in_sample_return_pct", "forward_return_pct",
        "in_sample_win_rate_pct", "forward_win_rate_pct", "error",
    ]
    with SUMMARY_CSV_PATH.open("w", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            writer.writerow(record)

    ok_records = [r for r in records if r["status"] == "OK"]
    error_records = [r for r in records if r["status"] != "OK"]

    verdict_counts: dict[str, int] = {}
    for r in ok_records:
        verdict_counts[r["verdict"]] = verdict_counts.get(r["verdict"], 0) + 1

    # Rank strategies by PASS rate across symbols.
    by_strategy: dict[str, list[dict]] = {}
    for r in ok_records:
        by_strategy.setdefault(r["strategy_id"], []).append(r)
    strategy_agg = []
    for sid, rows in by_strategy.items():
        pass_count = sum(1 for r in rows if r["verdict"] == "PASS")
        fail_count = sum(1 for r in rows if r["verdict"] == "FAIL")
        strategy_agg.append({
            "strategy_id": sid,
            "strategy_name": rows[0]["strategy_name"],
            "runs": len(rows),
            "pass": pass_count,
            "warn": sum(1 for r in rows if r["verdict"] == "WARN"),
            "fail": fail_count,
            "inconclusive": sum(1 for r in rows if r["verdict"] == "INCONCLUSIVE"),
            "pass_rate_pct": round(pass_count / len(rows) * 100, 1) if rows else 0.0,
        })
    strategy_agg.sort(key=lambda r: r["pass_rate_pct"], reverse=True)

    # Rank symbols by PASS rate across strategies.
    by_symbol: dict[str, list[dict]] = {}
    for r in ok_records:
        by_symbol.setdefault(r["symbol"], []).append(r)
    symbol_agg = []
    for sym, rows in by_symbol.items():
        pass_count = sum(1 for r in rows if r["verdict"] == "PASS")
        symbol_agg.append({
            "symbol": sym,
            "runs": len(rows),
            "pass": pass_count,
            "warn": sum(1 for r in rows if r["verdict"] == "WARN"),
            "fail": sum(1 for r in rows if r["verdict"] == "FAIL"),
            "inconclusive": sum(1 for r in rows if r["verdict"] == "INCONCLUSIVE"),
            "pass_rate_pct": round(pass_count / len(rows) * 100, 1) if rows else 0.0,
        })
    symbol_agg.sort(key=lambda r: r["pass_rate_pct"], reverse=True)

    lines = []
    lines.append("# Systematic Forward-Test Report\n")
    lines.append(f"Generated: {date.today().isoformat()}\n")
    lines.append(f"Total runs: {len(records)} | OK: {len(ok_records)} | Errors: {len(error_records)}\n")
    lines.append(f"Timeframe: {TIMEFRAME}, lookback: {LOOKBACK_DAYS} days, split: {int(SPLIT_PCT*100)}/{int((1-SPLIT_PCT)*100)} in-sample/forward\n")
    lines.append("\nData source: demo (deterministic synthetic OHLCV per symbol).\n")

    lines.append("\n## Verdict Breakdown (all runs)\n")
    lines.append("| Verdict | Count | % of OK runs |")
    lines.append("|---|---|---|")
    for verdict in ("PASS", "WARN", "FAIL", "INCONCLUSIVE"):
        count = verdict_counts.get(verdict, 0)
        pct = round(count / len(ok_records) * 100, 1) if ok_records else 0.0
        lines.append(f"| {verdict} | {count} | {pct} |")

    lines.append("\n## Top 15 Strategies by Forward-Test Pass Rate\n")
    lines.append("| Rank | Strategy ID | Name | Runs | PASS | WARN | FAIL | INCONCLUSIVE | Pass Rate % |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(strategy_agg[:15], 1):
        lines.append(f"| {i} | {r['strategy_id']} | {r['strategy_name']} | {r['runs']} | {r['pass']} | {r['warn']} | {r['fail']} | {r['inconclusive']} | {r['pass_rate_pct']} |")

    lines.append("\n## Bottom 15 Strategies by Forward-Test Pass Rate\n")
    lines.append("| Rank | Strategy ID | Name | Runs | PASS | WARN | FAIL | INCONCLUSIVE | Pass Rate % |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(strategy_agg[-15:], 1):
        lines.append(f"| {i} | {r['strategy_id']} | {r['strategy_name']} | {r['runs']} | {r['pass']} | {r['warn']} | {r['fail']} | {r['inconclusive']} | {r['pass_rate_pct']} |")

    lines.append("\n## Symbols Ranked by Forward-Test Pass Rate\n")
    lines.append("| Rank | Symbol | Runs | PASS | WARN | FAIL | INCONCLUSIVE | Pass Rate % |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(symbol_agg, 1):
        lines.append(f"| {i} | {r['symbol']} | {r['runs']} | {r['pass']} | {r['warn']} | {r['fail']} | {r['inconclusive']} | {r['pass_rate_pct']} |")

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
