"""Model registry — MLflow/DVC-style versioning for the bot's learners,
implemented as a thin wrapper over the `model_versions` SQLite table
(no external service required).

Every time an in-process learner (RL logistic agent, Neural MLP, Deep
Neural agent, ...) finishes a training pass, it should call
`registry.record(model_name, ...)`. This:
  - assigns the next incrementing version number for that model name
  - stores the training metrics (samples/accuracy/loss) and the
    hyperparameters used, for reproducibility
  - marks the new version "active" (most recent) but leaves "champion"
    (the version actually preferred for inference) untouched unless the
    caller explicitly promotes it — this is what makes rollback possible:
    a newly trained version that performs worse never becomes champion,
    so a single `promote(model_name, older_version)` call reverts
    production behaviour instantly without retraining anything.

This module intentionally does NOT change how any existing agent makes
its live inference decision (RLTradeAgent / NeuralTradeAgent still use
their own persisted weights file, unaffected). It's an audit + rollback
ledger that sits alongside them, so introducing it cannot break any
existing prediction path.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


class ModelRegistry:
    name = "ModelRegistry"

    def record(self, model_name: str, samples: int,
               train_accuracy: Optional[float] = None,
               val_accuracy: Optional[float] = None,
               loss: Optional[float] = None,
               hyperparams: Optional[Dict[str, Any]] = None,
               notes: str = "") -> int:
        from .database import db
        version = db.register_model_version(
            model_name=model_name, samples=samples,
            train_accuracy=train_accuracy, val_accuracy=val_accuracy, loss=loss,
            hyperparams=json.dumps(hyperparams or {}), notes=notes,
        )
        db.log_event(
            f"Model registry: {model_name} v{version} recorded "
            f"({samples} samples, val_acc={val_accuracy})",
            level="info", category="model_registry",
        )
        return version

    def history(self, model_name: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        from .database import db
        rows = db.get_model_versions(model_name, limit)
        for r in rows:
            try:
                r["hyperparams"] = json.loads(r.get("hyperparams") or "{}")
            except Exception:
                r["hyperparams"] = {}
        return rows

    def promote(self, model_name: str, version: int) -> bool:
        """Make `version` the champion — i.e. roll forward or back to it."""
        from .database import db
        ok = db.promote_model_version(model_name, version)
        if ok:
            db.log_event(f"Model registry: promoted {model_name} to v{version} (champion)",
                         level="warning", category="model_registry")
        return ok

    def champion(self, model_name: str) -> Optional[Dict[str, Any]]:
        from .database import db
        row = db.get_champion_version(model_name)
        if row:
            try:
                row["hyperparams"] = json.loads(row.get("hyperparams") or "{}")
            except Exception:
                row["hyperparams"] = {}
        return row

    def compare(self, model_name: str, version_a: int, version_b: int) -> Dict[str, Any]:
        history = self.history(model_name, limit=500)
        a = next((r for r in history if r["version"] == version_a), None)
        b = next((r for r in history if r["version"] == version_b), None)
        if not a or not b:
            return {"ok": False, "message": "One or both versions not found"}
        delta_acc = (b.get("val_accuracy") or 0) - (a.get("val_accuracy") or 0)
        return {
            "ok": True, "model_name": model_name,
            "version_a": a, "version_b": b,
            "val_accuracy_delta": round(delta_acc, 4),
            "recommendation": "b" if delta_acc > 0.005 else ("a" if delta_acc < -0.005 else "tie"),
        }

    def summary(self) -> Dict[str, Any]:
        """One row per tracked model showing latest + champion version."""
        from .database import db
        rows = db.get_model_versions(limit=2000)
        by_model: Dict[str, List[Dict[str, Any]]] = {}
        for r in rows:
            by_model.setdefault(r["model_name"], []).append(r)
        out = []
        for name, versions in by_model.items():
            versions.sort(key=lambda v: v["version"], reverse=True)
            latest = versions[0]
            champ = next((v for v in versions if v.get("is_champion")), latest)
            out.append({
                "model_name": name,
                "latest_version": latest["version"],
                "champion_version": champ["version"],
                "total_versions": len(versions),
                "latest_val_accuracy": latest.get("val_accuracy"),
                "champion_val_accuracy": champ.get("val_accuracy"),
                "rollback_available": champ["version"] != latest["version"] or len(versions) > 1,
            })
        return {"models": out, "count": len(out)}


registry = ModelRegistry()
