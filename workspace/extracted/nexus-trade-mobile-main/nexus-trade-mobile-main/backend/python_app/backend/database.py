"""
Persistent SQLite database layer for Nexus Trade.

Manages all structured data: trade history, signal log, performance metrics,
agent decisions, RL experience, and system events.

Thread-safe via WAL mode and connection-per-thread pattern.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional

log = logging.getLogger("database")

DATA_DIR = Path(os.getenv("NEXUS_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
DB_PATH = DATA_DIR / "nexus_trade.sqlite3"


def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


class Database:
    """Thread-safe SQLite database manager with WAL mode and migrations."""

    _local = threading.local()

    def __init__(self, path: Optional[Path] = None):
        self.path = path or DB_PATH
        _ensure_dir()
        self._init_schema()

    def _conn(self) -> sqlite3.Connection:
        """One connection per thread (SQLite best practice)."""
        conn: Optional[sqlite3.Connection] = getattr(self._local, "conn", None)
        conn_path = getattr(self._local, "conn_path", None)
        if conn is not None and conn_path != str(self.path):
            conn.close()
            conn = None
        if conn is None:
            conn = sqlite3.connect(
                str(self.path),
                timeout=15,
                detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
            )
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA cache_size=-8000")  # 8 MB cache
            conn.row_factory = sqlite3.Row
            self._local.conn = conn
            self._local.conn_path = str(self.path)
        return conn

    @contextmanager
    def cursor(self) -> Generator[sqlite3.Cursor, None, None]:
        conn = self._conn()
        cur = conn.cursor()
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        conn = self._conn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    # ------------------------------------------------------------------
    # Schema migrations
    # ------------------------------------------------------------------
    def _init_schema(self):
        with self.cursor() as cur:
            cur.executescript("""
                -- Trade history
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket INTEGER,
                    symbol TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    volume REAL NOT NULL,
                    entry_price REAL,
                    exit_price REAL,
                    sl REAL,
                    tp REAL,
                    profit REAL DEFAULT 0,
                    profit_atr REAL DEFAULT 0,
                    commission REAL DEFAULT 0,
                    swap REAL DEFAULT 0,
                    open_time TEXT,
                    close_time TEXT,
                    status TEXT DEFAULT 'open',
                    magic INTEGER,
                    comment TEXT,
                    agent_decision TEXT,
                    confidence REAL,
                    created TEXT DEFAULT (datetime('now'))
                );

                -- Signal log (every signal emitted by the engine)
                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signal_uid TEXT UNIQUE,
                    symbol TEXT,
                    direction TEXT,
                    strength REAL,
                    timeframe TEXT,
                    entry REAL,
                    sl REAL,
                    tp REAL,
                    reason TEXT,
                    asset_class TEXT,
                    status TEXT DEFAULT 'active',
                    created TEXT DEFAULT (datetime('now')),
                    closed TEXT
                );

                -- Agent decision audit trail
                CREATE TABLE IF NOT EXISTS agent_decisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cycle INTEGER,
                    symbol TEXT,
                    agent TEXT,
                    signal TEXT,
                    confidence REAL,
                    reasons TEXT,
                    created TEXT DEFAULT (datetime('now'))
                );

                -- Performance snapshots (hourly)
                CREATE TABLE IF NOT EXISTS performance_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT DEFAULT (datetime('now')),
                    equity REAL,
                    balance REAL,
                    open_trades INTEGER,
                    win_rate REAL,
                    total_pnl REAL,
                    max_drawdown REAL,
                    sharpe REAL
                );

                -- System events / audit log
                CREATE TABLE IF NOT EXISTS system_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts TEXT DEFAULT (datetime('now')),
                    level TEXT DEFAULT 'info',
                    category TEXT,
                    message TEXT,
                    data TEXT
                );

                -- API key encryption metadata
                CREATE TABLE IF NOT EXISTS encrypted_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider TEXT,
                    key_hash TEXT UNIQUE,
                    encrypted_blob TEXT,
                    created TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS provider_telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    ok INTEGER NOT NULL DEFAULT 0,
                    latency_ms REAL,
                    status_code INTEGER,
                    error TEXT,
                    rate_limit_remaining TEXT,
                    ts TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS provider_alert_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    latency_threshold_ms REAL DEFAULT 1500,
                    error_rate_threshold_pct REAL DEFAULT 20,
                    updated TEXT DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS push_devices (
                    token TEXT PRIMARY KEY,
                    platform TEXT,
                    updated TEXT DEFAULT (datetime('now'))
                );

                -- ── Self-improving learning system ──────────────────────
                -- Model registry: every trained snapshot of every learner
                -- (RL logistic, Neural MLP, DeepNeural, etc.) gets a
                -- version row so we can compare, roll back, or audit.
                CREATE TABLE IF NOT EXISTS model_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_name TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    samples INTEGER,
                    train_accuracy REAL,
                    val_accuracy REAL,
                    loss REAL,
                    hyperparams TEXT,
                    is_active INTEGER DEFAULT 0,
                    is_champion INTEGER DEFAULT 0,
                    promoted_from INTEGER,
                    notes TEXT,
                    created TEXT DEFAULT (datetime('now'))
                );

                -- Feature store: one row per prediction, the EXACT feature
                -- vector + model versions used, for lineage/auditability
                -- and to detect distribution drift over time.
                CREATE TABLE IF NOT EXISTS feature_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    cycle INTEGER,
                    features TEXT NOT NULL,
                    rl_version INTEGER,
                    neural_version INTEGER,
                    deep_version INTEGER,
                    final_signal TEXT,
                    confidence REAL,
                    created TEXT DEFAULT (datetime('now'))
                );

                -- Drift monitoring: periodic comparison of recent feature
                -- distributions vs. the training-time baseline.
                CREATE TABLE IF NOT EXISTS drift_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    feature TEXT NOT NULL,
                    baseline_mean REAL,
                    baseline_std REAL,
                    recent_mean REAL,
                    recent_std REAL,
                    drift_score REAL,
                    severity TEXT,
                    ts TEXT DEFAULT (datetime('now'))
                );

                -- Anomaly detection log: unusual price/volatility events
                -- that triggered (or would have triggered) a trading pause.
                CREATE TABLE IF NOT EXISTS anomaly_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    kind TEXT,
                    severity TEXT,
                    z_score REAL,
                    detail TEXT,
                    action_taken TEXT,
                    ts TEXT DEFAULT (datetime('now'))
                );

                -- Shadow deployment: candidate model predictions recorded
                -- in parallel with the live model, never executed as real
                -- orders, so we can compare accuracy before promoting.
                CREATE TABLE IF NOT EXISTS shadow_predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    candidate_model TEXT,
                    candidate_version INTEGER,
                    predicted_direction TEXT,
                    predicted_confidence REAL,
                    live_direction TEXT,
                    live_confidence REAL,
                    outcome_reward_atr REAL,
                    resolved INTEGER DEFAULT 0,
                    created TEXT DEFAULT (datetime('now'))
                );

                -- News / social sentiment samples feeding the SentimentAgent.
                CREATE TABLE IF NOT EXISTS sentiment_samples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    source TEXT,
                    headline TEXT,
                    polarity REAL,
                    magnitude REAL,
                    ts TEXT DEFAULT (datetime('now'))
                );

                -- Hyperparameter tuning trials (random/grid search results).
                CREATE TABLE IF NOT EXISTS tuning_trials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model_name TEXT,
                    params TEXT,
                    val_accuracy REAL,
                    val_loss REAL,
                    is_best INTEGER DEFAULT 0,
                    ts TEXT DEFAULT (datetime('now'))
                );

                -- Immutable event store for every signal + full market
                -- state at decision time (auditability / post-trade review).
                CREATE TABLE IF NOT EXISTS decision_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signal_uid TEXT,
                    symbol TEXT,
                    final_signal TEXT,
                    confidence REAL,
                    weighted_score REAL,
                    opinions_json TEXT,
                    feature_vector TEXT,
                    model_versions TEXT,
                    created TEXT DEFAULT (datetime('now'))
                );

                -- Indexes for common queries
                CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
                CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_open_ticket
                    ON trades(ticket) WHERE status='open';
                CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
                CREATE INDEX IF NOT EXISTS idx_agent_dec_cycle ON agent_decisions(cycle);
                CREATE INDEX IF NOT EXISTS idx_events_ts ON system_events(ts);
                CREATE INDEX IF NOT EXISTS idx_provider_telemetry_ts ON provider_telemetry(provider_id, ts);
                CREATE INDEX IF NOT EXISTS idx_model_versions_name ON model_versions(model_name, version);
                CREATE INDEX IF NOT EXISTS idx_feature_snapshots_symbol ON feature_snapshots(symbol, created);
                CREATE INDEX IF NOT EXISTS idx_drift_reports_feature ON drift_reports(feature, ts);
                CREATE INDEX IF NOT EXISTS idx_anomaly_events_symbol ON anomaly_events(symbol, ts);
                CREATE INDEX IF NOT EXISTS idx_shadow_predictions_symbol ON shadow_predictions(symbol, resolved);
                CREATE INDEX IF NOT EXISTS idx_sentiment_samples_symbol ON sentiment_samples(symbol, ts);
                CREATE INDEX IF NOT EXISTS idx_decision_audit_symbol ON decision_audit(symbol, created);
            """)
        log.info("Database schema initialized at %s", self.path)

    # ------------------------------------------------------------------
    # Trade operations
    # ------------------------------------------------------------------
    def insert_trade(self, trade: Dict[str, Any]) -> int:
        """Record a newly-opened trade. Uses INSERT OR IGNORE against the
        partial unique index on (ticket) WHERE status='open' so the same
        ticket can never be recorded twice as open — safe if both the
        direct-API success path and a position-diff fallback ever race
        on the same fill."""
        with self.cursor() as cur:
            cur.execute("""
                INSERT OR IGNORE INTO trades (ticket, symbol, direction, volume, entry_price,
                    sl, tp, magic, comment, agent_decision, confidence, open_time)
                VALUES (:ticket, :symbol, :direction, :volume, :entry_price,
                    :sl, :tp, :magic, :comment, :agent_decision, :confidence, :open_time)
            """, trade)
            return cur.lastrowid

    def close_trade(self, ticket: int, exit_price: float, profit: float,
                    profit_atr: float = 0, commission: float = 0, swap: float = 0):
        with self.cursor() as cur:
            cur.execute("""
                UPDATE trades SET exit_price=?, profit=?, profit_atr=?,
                    commission=?, swap=?, close_time=datetime('now'), status='closed'
                WHERE ticket=? AND status='open'
            """, (exit_price, profit, profit_atr, commission, swap, ticket))

    def get_trades(self, status: str = None, symbol: str = None,
                   limit: int = 200) -> List[Dict]:
        with self.cursor() as cur:
            q = "SELECT * FROM trades WHERE 1=1"
            params: list = []
            if status:
                q += " AND status=?"
                params.append(status)
            if symbol:
                q += " AND symbol=?"
                params.append(symbol)
            q += " ORDER BY id DESC LIMIT ?"
            params.append(limit)
            return [dict(r) for r in cur.execute(q, params)]

    def trade_stats(self) -> Dict[str, Any]:
        with self.cursor() as cur:
            row = cur.execute("""
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN profit > 0 THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) as losses,
                    SUM(CASE WHEN profit = 0 THEN 1 ELSE 0 END) as breakeven,
                    AVG(profit) as avg_profit,
                    SUM(profit) as total_profit,
                    MAX(profit) as best_trade,
                    MIN(profit) as worst_trade,
                    AVG(profit_atr) as avg_profit_atr
                FROM trades WHERE status='closed'
            """).fetchone()
            d = dict(row) if row else {}
            total = d.get("total", 0) or 0
            wins = d.get("wins", 0) or 0
            d["win_rate"] = round(wins / total, 4) if total > 0 else None

            gross = cur.execute("""
                SELECT
                    SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) as gross_profit,
                    SUM(CASE WHEN profit < 0 THEN -profit ELSE 0 END) as gross_loss
                FROM trades WHERE status='closed'
            """).fetchone()
            gp = (gross["gross_profit"] if gross else 0) or 0.0
            gl = (gross["gross_loss"] if gross else 0) or 0.0
            d["gross_profit"] = round(gp, 2)
            d["gross_loss"] = round(gl, 2)
            d["profit_factor"] = round(gp / gl, 4) if gl > 0 else (None if gp == 0 else float("inf"))
            return d

    def equity_drawdown(self, limit: int = 500) -> Dict[str, Any]:
        """Peak-to-trough decline (%) computed from performance_snapshots'
        equity history. Returns 0 when there is not enough history yet."""
        with self.cursor() as cur:
            rows = cur.execute(
                "SELECT equity FROM performance_snapshots "
                "ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        equities = [r["equity"] for r in reversed(rows) if r["equity"] is not None]
        if len(equities) < 2:
            return {"max_drawdown_pct": 0.0, "current_drawdown_pct": 0.0}
        peak = equities[0]
        max_dd = 0.0
        for e in equities:
            peak = max(peak, e)
            if peak > 0:
                dd = (peak - e) / peak * 100
                max_dd = max(max_dd, dd)
        last_peak = max(equities)
        current_dd = ((last_peak - equities[-1]) / last_peak * 100) if last_peak > 0 else 0.0
        return {"max_drawdown_pct": round(max_dd, 3), "current_drawdown_pct": round(current_dd, 3)}

    def pnl_since(self, since_iso: str) -> float:
        """Sum of closed-trade profit with close_time >= since_iso (UTC ISO string)."""
        with self.cursor() as cur:
            row = cur.execute(
                "SELECT SUM(profit) as pnl FROM trades "
                "WHERE status='closed' AND close_time >= ?", (since_iso,)
            ).fetchone()
            return float((row["pnl"] if row else 0) or 0.0)

    # ------------------------------------------------------------------
    # Signal operations
    # ------------------------------------------------------------------
    def insert_signal(self, signal: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT OR IGNORE INTO signals
                (signal_uid, symbol, direction, strength, timeframe,
                 entry, sl, tp, reason, asset_class, status)
                VALUES (:signal_uid, :symbol, :direction, :strength, :timeframe,
                    :entry, :sl, :tp, :reason, :asset_class, :status)
            """, signal)
            return cur.lastrowid

    def update_signal_status(self, uid: str, status: str):
        with self.cursor() as cur:
            cur.execute(
                "UPDATE signals SET status=?, closed=datetime('now') WHERE signal_uid=?",
                (status, uid))

    # ------------------------------------------------------------------
    # Agent decisions
    # ------------------------------------------------------------------
    def log_agent_decision(self, cycle: int, symbol: str, agent: str,
                           signal: str, confidence: float, reasons: list):
        import json
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO agent_decisions (cycle, symbol, agent, signal, confidence, reasons)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (cycle, symbol, agent, signal, confidence, json.dumps(reasons)))

    # ------------------------------------------------------------------
    # Performance snapshots
    # ------------------------------------------------------------------
    def insert_snapshot(self, snap: Dict[str, Any]):
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO performance_snapshots
                (equity, balance, open_trades, win_rate, total_pnl, max_drawdown, sharpe)
                VALUES (:equity, :balance, :open_trades, :win_rate, :total_pnl, :max_drawdown, :sharpe)
            """, snap)

    # ------------------------------------------------------------------
    # System events
    # ------------------------------------------------------------------
    def log_event(self, message: str, level: str = "info",
                  category: str = "system", data: str = None):
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO system_events (level, category, message, data)
                VALUES (?, ?, ?, ?)
            """, (level, category, message, data))

    def get_events(self, limit: int = 100, category: str = None) -> List[Dict]:
        with self.cursor() as cur:
            q = "SELECT * FROM system_events"
            params: list = []
            if category:
                q += " WHERE category=?"
                params.append(category)
            q += " ORDER BY id DESC LIMIT ?"
            params.append(limit)
            return [dict(r) for r in cur.execute(q, params)]

    def insert_provider_telemetry(self, sample: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO provider_telemetry
                (provider_id, operation, ok, latency_ms, status_code, error, rate_limit_remaining)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (sample.get("provider_id"), sample.get("operation", "request"),
                   1 if sample.get("ok") else 0, sample.get("latency_ms"),
                   sample.get("status_code"), sample.get("error"),
                   (sample.get("rate_limit") or {}).get("remaining")))
            return cur.lastrowid

    def get_provider_history(self, provider_id: str = None, limit: int = 240, since: str = None) -> List[Dict]:
        with self.cursor() as cur:
            clauses, params = [], []
            if provider_id:
                clauses.append("provider_id=?")
                params.append(provider_id)
            if since:
                clauses.append("ts>=?")
                params.append(since)
            where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
            params.append(limit)
            rows = cur.execute(f"SELECT * FROM provider_telemetry{where} ORDER BY id DESC LIMIT ?", params).fetchall()
            return [dict(row) for row in rows]

    def save_provider_alert_settings(self, latency_threshold_ms: float, error_rate_threshold_pct: float):
        with self.cursor() as cur:
            cur.execute("""INSERT INTO provider_alert_settings (id, latency_threshold_ms, error_rate_threshold_pct, updated)
                VALUES (1, ?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET latency_threshold_ms=excluded.latency_threshold_ms,
                error_rate_threshold_pct=excluded.error_rate_threshold_pct, updated=excluded.updated""",
                        (latency_threshold_ms, error_rate_threshold_pct))

    def get_provider_alert_settings(self) -> Dict[str, float]:
        with self.cursor() as cur:
            row = cur.execute("SELECT latency_threshold_ms, error_rate_threshold_pct FROM provider_alert_settings WHERE id=1").fetchone()
            return dict(row) if row else {"latency_threshold_ms": 1500.0, "error_rate_threshold_pct": 20.0}

    def register_push_device(self, token: str, platform: str):
        with self.cursor() as cur:
            cur.execute("INSERT INTO push_devices (token, platform, updated) VALUES (?, ?, datetime('now')) ON CONFLICT(token) DO UPDATE SET platform=excluded.platform, updated=excluded.updated", (token, platform))

    def get_push_devices(self) -> List[Dict]:
        with self.cursor() as cur:
            return [dict(row) for row in cur.execute("SELECT * FROM push_devices ORDER BY updated DESC")]

    # ------------------------------------------------------------------
    # Encrypted keys
    # ------------------------------------------------------------------
    def store_encrypted_key(self, provider: str, key_hash: str, blob: str):
        with self.cursor() as cur:
            cur.execute("""
                INSERT OR REPLACE INTO encrypted_keys (provider, key_hash, encrypted_blob)
                VALUES (?, ?, ?)
            """, (provider, key_hash, blob))

    def get_encrypted_keys(self, provider: str = None) -> List[Dict]:
        with self.cursor() as cur:
            if provider:
                rows = cur.execute(
                    "SELECT * FROM encrypted_keys WHERE provider=?", (provider,)).fetchall()
            else:
                rows = cur.execute("SELECT * FROM encrypted_keys").fetchall()
            return [dict(r) for r in rows]

    def vacuum(self):
        with self.cursor() as cur:
            cur.execute("VACUUM")

    # ------------------------------------------------------------------
    # Model registry (versioning + rollback, MLflow-style but embedded)
    # ------------------------------------------------------------------
    def register_model_version(self, model_name: str, samples: int,
                                train_accuracy: float = None, val_accuracy: float = None,
                                loss: float = None, hyperparams: str = None,
                                notes: str = None) -> int:
        with self.cursor() as cur:
            row = cur.execute(
                "SELECT MAX(version) FROM model_versions WHERE model_name=?", (model_name,)
            ).fetchone()
            next_version = (row[0] or 0) + 1
            cur.execute("""
                INSERT INTO model_versions
                (model_name, version, samples, train_accuracy, val_accuracy, loss, hyperparams, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (model_name, next_version, samples, train_accuracy, val_accuracy, loss, hyperparams, notes))
            new_id = cur.lastrowid
            # New version becomes active by default; champion status is
            # only changed explicitly via promote_model_version().
            cur.execute("UPDATE model_versions SET is_active=0 WHERE model_name=?", (model_name,))
            cur.execute("UPDATE model_versions SET is_active=1 WHERE id=?", (new_id,))
            return next_version

    def get_model_versions(self, model_name: str = None, limit: int = 50) -> List[Dict]:
        with self.cursor() as cur:
            if model_name:
                rows = cur.execute(
                    "SELECT * FROM model_versions WHERE model_name=? ORDER BY version DESC LIMIT ?",
                    (model_name, limit)).fetchall()
            else:
                rows = cur.execute(
                    "SELECT * FROM model_versions ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def promote_model_version(self, model_name: str, version: int) -> bool:
        """Mark a version as champion (the one production actually should
        prefer). Rollback = promote an older version."""
        with self.cursor() as cur:
            exists = cur.execute(
                "SELECT id FROM model_versions WHERE model_name=? AND version=?",
                (model_name, version)).fetchone()
            if not exists:
                return False
            cur.execute("UPDATE model_versions SET is_champion=0 WHERE model_name=?", (model_name,))
            cur.execute("UPDATE model_versions SET is_champion=1 WHERE id=?", (exists["id"],))
            return True

    def get_champion_version(self, model_name: str) -> Optional[Dict]:
        with self.cursor() as cur:
            row = cur.execute(
                "SELECT * FROM model_versions WHERE model_name=? AND is_champion=1", (model_name,)
            ).fetchone()
            if row:
                return dict(row)
            # Fall back to most recent active version if no champion set yet
            row = cur.execute(
                "SELECT * FROM model_versions WHERE model_name=? ORDER BY version DESC LIMIT 1",
                (model_name,)).fetchone()
            return dict(row) if row else None

    # ------------------------------------------------------------------
    # Feature store (lineage: exact features used for every prediction)
    # ------------------------------------------------------------------
    def insert_feature_snapshot(self, snap: Dict[str, Any]) -> int:
        import json
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO feature_snapshots
                (symbol, cycle, features, rl_version, neural_version, deep_version, final_signal, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (snap.get("symbol"), snap.get("cycle"),
                  json.dumps(snap.get("features", {})),
                  snap.get("rl_version"), snap.get("neural_version"), snap.get("deep_version"),
                  snap.get("final_signal"), snap.get("confidence")))
            cur.execute("""DELETE FROM feature_snapshots WHERE id NOT IN
                (SELECT id FROM feature_snapshots ORDER BY id DESC LIMIT 20000)""")
            return cur.lastrowid

    def get_feature_snapshots(self, symbol: str = None, limit: int = 500) -> List[Dict]:
        with self.cursor() as cur:
            if symbol:
                rows = cur.execute(
                    "SELECT * FROM feature_snapshots WHERE symbol=? ORDER BY id DESC LIMIT ?",
                    (symbol, limit)).fetchall()
            else:
                rows = cur.execute(
                    "SELECT * FROM feature_snapshots ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Drift monitoring
    # ------------------------------------------------------------------
    def insert_drift_report(self, report: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO drift_reports
                (feature, baseline_mean, baseline_std, recent_mean, recent_std, drift_score, severity)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (report.get("feature"), report.get("baseline_mean"), report.get("baseline_std"),
                  report.get("recent_mean"), report.get("recent_std"),
                  report.get("drift_score"), report.get("severity")))
            return cur.lastrowid

    def get_latest_drift(self, limit: int = 20) -> List[Dict]:
        with self.cursor() as cur:
            rows = cur.execute("""
                SELECT * FROM drift_reports WHERE id IN (
                    SELECT MAX(id) FROM drift_reports GROUP BY feature
                ) ORDER BY drift_score DESC LIMIT ?
            """, (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Anomaly detection
    # ------------------------------------------------------------------
    def insert_anomaly_event(self, event: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO anomaly_events (symbol, kind, severity, z_score, detail, action_taken)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (event.get("symbol"), event.get("kind"), event.get("severity"),
                  event.get("z_score"), event.get("detail"), event.get("action_taken")))
            return cur.lastrowid

    def get_anomaly_events(self, limit: int = 100, symbol: str = None) -> List[Dict]:
        with self.cursor() as cur:
            if symbol:
                rows = cur.execute(
                    "SELECT * FROM anomaly_events WHERE symbol=? ORDER BY id DESC LIMIT ?",
                    (symbol, limit)).fetchall()
            else:
                rows = cur.execute(
                    "SELECT * FROM anomaly_events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Shadow deployment
    # ------------------------------------------------------------------
    def insert_shadow_prediction(self, pred: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO shadow_predictions
                (symbol, candidate_model, candidate_version, predicted_direction,
                 predicted_confidence, live_direction, live_confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (pred.get("symbol"), pred.get("candidate_model"), pred.get("candidate_version"),
                  pred.get("predicted_direction"), pred.get("predicted_confidence"),
                  pred.get("live_direction"), pred.get("live_confidence")))
            return cur.lastrowid

    def resolve_shadow_predictions(self, symbol: str, reward_atr: float, max_age_sec: int = 3 * 24 * 3600) -> int:
        import time as _time
        cutoff_iso_seconds = max_age_sec
        with self.cursor() as cur:
            rows = cur.execute("""
                SELECT id FROM shadow_predictions
                WHERE symbol=? AND resolved=0
                  AND created >= datetime('now', ?)
                ORDER BY id DESC
            """, (symbol, f"-{cutoff_iso_seconds} seconds")).fetchall()
            for r in rows:
                cur.execute(
                    "UPDATE shadow_predictions SET outcome_reward_atr=?, resolved=1 WHERE id=?",
                    (reward_atr, r["id"]))
            return len(rows)

    def shadow_scoreboard(self, limit: int = 200) -> List[Dict]:
        """Aggregate accuracy per shadow candidate vs. the live model, over
        resolved predictions, so a candidate can be promoted with evidence."""
        with self.cursor() as cur:
            rows = cur.execute("""
                SELECT candidate_model, candidate_version,
                    COUNT(*) as n,
                    AVG(CASE WHEN (predicted_direction='buy' AND outcome_reward_atr>0)
                              OR (predicted_direction='sell' AND outcome_reward_atr<0)
                         THEN 1.0 ELSE 0.0 END) as candidate_win_rate,
                    AVG(CASE WHEN (live_direction='buy' AND outcome_reward_atr>0)
                              OR (live_direction='sell' AND outcome_reward_atr<0)
                         THEN 1.0 ELSE 0.0 END) as live_win_rate,
                    AVG(outcome_reward_atr) as avg_reward_atr
                FROM shadow_predictions
                WHERE resolved=1
                GROUP BY candidate_model, candidate_version
                ORDER BY candidate_version DESC
                LIMIT ?
            """, (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Sentiment samples
    # ------------------------------------------------------------------
    def insert_sentiment_sample(self, sample: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO sentiment_samples (symbol, source, headline, polarity, magnitude)
                VALUES (?, ?, ?, ?, ?)
            """, (sample.get("symbol"), sample.get("source"), sample.get("headline"),
                  sample.get("polarity"), sample.get("magnitude")))
            cur.execute("""DELETE FROM sentiment_samples WHERE id NOT IN
                (SELECT id FROM sentiment_samples ORDER BY id DESC LIMIT 5000)""")
            return cur.lastrowid

    def get_sentiment_samples(self, symbol: str = None, limit: int = 50) -> List[Dict]:
        with self.cursor() as cur:
            if symbol:
                rows = cur.execute(
                    "SELECT * FROM sentiment_samples WHERE symbol=? ORDER BY id DESC LIMIT ?",
                    (symbol, limit)).fetchall()
            else:
                rows = cur.execute(
                    "SELECT * FROM sentiment_samples ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def sentiment_average(self, symbol: str, window: int = 20) -> Dict[str, float]:
        with self.cursor() as cur:
            row = cur.execute("""
                SELECT AVG(polarity) as avg_polarity, AVG(magnitude) as avg_magnitude, COUNT(*) as n
                FROM (SELECT polarity, magnitude FROM sentiment_samples
                      WHERE symbol=? ORDER BY id DESC LIMIT ?)
            """, (symbol, window)).fetchone()
            return {"avg_polarity": float(row["avg_polarity"] or 0.0),
                    "avg_magnitude": float(row["avg_magnitude"] or 0.0),
                    "n": int(row["n"] or 0)}

    # ------------------------------------------------------------------
    # Hyperparameter tuning trials
    # ------------------------------------------------------------------
    def insert_tuning_trial(self, trial: Dict[str, Any]) -> int:
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO tuning_trials (model_name, params, val_accuracy, val_loss, is_best)
                VALUES (?, ?, ?, ?, 0)
            """, (trial.get("model_name"), trial.get("params"),
                  trial.get("val_accuracy"), trial.get("val_loss")))
            return cur.lastrowid

    def mark_best_trial(self, model_name: str, trial_id: int):
        with self.cursor() as cur:
            cur.execute("UPDATE tuning_trials SET is_best=0 WHERE model_name=?", (model_name,))
            cur.execute("UPDATE tuning_trials SET is_best=1 WHERE id=?", (trial_id,))

    def get_tuning_trials(self, model_name: str = None, limit: int = 50) -> List[Dict]:
        with self.cursor() as cur:
            if model_name:
                rows = cur.execute(
                    "SELECT * FROM tuning_trials WHERE model_name=? ORDER BY val_accuracy DESC LIMIT ?",
                    (model_name, limit)).fetchall()
            else:
                rows = cur.execute(
                    "SELECT * FROM tuning_trials ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Immutable decision audit trail
    # ------------------------------------------------------------------
    def insert_decision_audit(self, record: Dict[str, Any]) -> int:
        import json
        with self.cursor() as cur:
            cur.execute("""
                INSERT INTO decision_audit
                (signal_uid, symbol, final_signal, confidence, weighted_score,
                 opinions_json, feature_vector, model_versions)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (record.get("signal_uid"), record.get("symbol"), record.get("final_signal"),
                  record.get("confidence"), record.get("weighted_score"),
                  json.dumps(record.get("opinions", [])),
                  json.dumps(record.get("features", {})),
                  json.dumps(record.get("model_versions", {}))))
            cur.execute("""DELETE FROM decision_audit WHERE id NOT IN
                (SELECT id FROM decision_audit ORDER BY id DESC LIMIT 20000)""")
            return cur.lastrowid

    def get_decision_audit(self, symbol: str = None, limit: int = 100) -> List[Dict]:
        with self.cursor() as cur:
            if symbol:
                rows = cur.execute(
                    "SELECT * FROM decision_audit WHERE symbol=? ORDER BY id DESC LIMIT ?",
                    (symbol, limit)).fetchall()
            else:
                rows = cur.execute(
                    "SELECT * FROM decision_audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]


# Global singleton
db = Database()
