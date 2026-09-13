"""Data-drift monitoring — detects when live market feature distributions
have shifted away from what the RL/Neural models were trained on, and
signals when an automatic retrain is warranted.

Method: population-stability-style z-score drift per feature.
  - "baseline" = the feature distribution captured across the training
    replay buffer the last time a model was trained (mean/std per feature,
    computed straight from `rl_experience`'s labelled rows).
  - "recent"   = the feature distribution over the most recent N feature
    snapshots recorded live by MasterAgent (feature_snapshots table).
  - drift_score = |recent_mean - baseline_mean| / (baseline_std + eps),
    i.e. how many baseline standard deviations the recent average has
    moved. This is a lightweight, dependency-free stand-in for a proper
    Population Stability Index and is enough to catch real regime shifts
    (e.g. a volatility crunch or a news-driven spike) without adding any
    new library.

No torch/tensorflow/heavy stats package required — numpy only, consistent
with the rest of the analytics stack.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

import numpy as np

SEVERITY_THRESHOLDS = [(3.0, "critical"), (2.0, "high"), (1.0, "moderate"), (0.0, "low")]


def _severity(score: float) -> str:
    for threshold, label in SEVERITY_THRESHOLDS:
        if score >= threshold:
            return label
    return "low"


class DriftMonitor:
    name = "DriftMonitor"

    def _baseline_from_replay(self) -> Dict[str, Dict[str, float]]:
        """Mean/std per feature from the labelled RL replay buffer —
        i.e. the data distribution the current models were actually
        trained on."""
        from analytics.rl_agent import rl_agent, FEATURES
        with rl_agent._db() as conn:
            rows = conn.execute(
                "SELECT features FROM rl_experience WHERE reward IS NOT NULL "
                "ORDER BY created DESC LIMIT 1000"
            ).fetchall()
        if not rows:
            return {}
        X = np.array([json.loads(r[0]) for r in rows], dtype=float)
        baseline = {}
        for i, f in enumerate(FEATURES):
            baseline[f] = {"mean": float(X[:, i].mean()), "std": float(X[:, i].std()) + 1e-8}
        return baseline

    def _recent_from_snapshots(self, limit: int = 200) -> Dict[str, Dict[str, float]]:
        from .database import db
        from analytics.rl_agent import FEATURES
        rows = db.get_feature_snapshots(limit=limit)
        if not rows:
            return {}
        vectors = []
        for r in rows:
            try:
                feats = json.loads(r["features"])
                vectors.append([float(feats.get(f, 0.0)) for f in FEATURES])
            except Exception:
                continue
        if not vectors:
            return {}
        X = np.array(vectors, dtype=float)
        recent = {}
        for i, f in enumerate(FEATURES):
            recent[f] = {"mean": float(X[:, i].mean()), "std": float(X[:, i].std()) + 1e-8}
        return recent

    def check(self, persist: bool = True) -> Dict[str, Any]:
        """Compare recent live feature distributions to the training
        baseline. Returns a per-feature drift report and an overall
        recommendation on whether a retrain is warranted."""
        from .database import db
        baseline = self._baseline_from_replay()
        recent = self._recent_from_snapshots()
        if not baseline or not recent:
            return {"ok": False, "message": "Not enough data yet for drift analysis",
                    "baseline_samples": bool(baseline), "recent_samples": bool(recent)}

        reports = []
        max_score = 0.0
        for feature, base_stats in baseline.items():
            if feature not in recent:
                continue
            recent_stats = recent[feature]
            drift_score = abs(recent_stats["mean"] - base_stats["mean"]) / base_stats["std"]
            severity = _severity(drift_score)
            max_score = max(max_score, drift_score)
            report = {
                "feature": feature,
                "baseline_mean": round(base_stats["mean"], 4),
                "baseline_std": round(base_stats["std"], 4),
                "recent_mean": round(recent_stats["mean"], 4),
                "recent_std": round(recent_stats["std"], 4),
                "drift_score": round(float(drift_score), 4),
                "severity": severity,
            }
            reports.append(report)
            if persist:
                db.insert_drift_report(report)

        reports.sort(key=lambda r: r["drift_score"], reverse=True)
        overall_severity = _severity(max_score)
        retrain_recommended = overall_severity in ("high", "critical")
        if retrain_recommended and persist:
            db.log_event(
                f"Drift monitor: {overall_severity} drift detected "
                f"(max score {max_score:.2f}) — recommending retrain",
                level="warning", category="drift",
            )
        return {
            "ok": True,
            "overall_severity": overall_severity,
            "max_drift_score": round(float(max_score), 4),
            "retrain_recommended": retrain_recommended,
            "features": reports,
        }

    def latest(self, limit: int = 20) -> List[Dict[str, Any]]:
        from .database import db
        return db.get_latest_drift(limit)


drift_monitor = DriftMonitor()
