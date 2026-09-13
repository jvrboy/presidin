"""Shadow deployment — runs candidate models (e.g. a newly-trained
DeepNeuralAgent, or any future learner) in parallel with the live
decision, recording what they WOULD have predicted, without ever
influencing a real trade. Once enough shadow predictions have been
resolved against real outcomes, `db.shadow_scoreboard()` shows whether
the candidate actually beats the live model — evidence-based promotion
instead of blind trust in a fresh retrain.
"""
from __future__ import annotations

from typing import Any, Dict, List


class ShadowDeployment:
    name = "ShadowDeployment"

    def record_prediction(self, symbol: str, candidate_model: str, candidate_version: int,
                           predicted_direction: str, predicted_confidence: float,
                           live_direction: str, live_confidence: float) -> int:
        from .database import db
        return db.insert_shadow_prediction({
            "symbol": symbol, "candidate_model": candidate_model,
            "candidate_version": candidate_version,
            "predicted_direction": predicted_direction, "predicted_confidence": predicted_confidence,
            "live_direction": live_direction, "live_confidence": live_confidence,
        })

    def resolve(self, symbol: str, reward_atr: float) -> int:
        """Called from the same closed-trade labelling step that feeds the
        RL replay buffer, so shadow candidates get judged against the
        exact same real outcomes the live model is judged against."""
        from .database import db
        return db.resolve_shadow_predictions(symbol, reward_atr)

    def scoreboard(self, limit: int = 200) -> Dict[str, Any]:
        from .database import db
        rows = db.shadow_scoreboard(limit)
        for r in rows:
            r["candidate_win_rate"] = round(r.get("candidate_win_rate") or 0.0, 4)
            r["live_win_rate"] = round(r.get("live_win_rate") or 0.0, 4)
            r["avg_reward_atr"] = round(r.get("avg_reward_atr") or 0.0, 4)
            r["edge_vs_live"] = round(r["candidate_win_rate"] - r["live_win_rate"], 4)
            r["promotion_ready"] = bool(r["n"] >= 30 and r["edge_vs_live"] > 0.05)
        rows.sort(key=lambda r: r["edge_vs_live"], reverse=True)
        return {"candidates": rows, "count": len(rows)}

    def evaluate_candidates(self, symbol: str, direction: str, live_confidence: float,
                            features: Dict[str, float]) -> List[Dict[str, Any]]:
        """Have every registered candidate model vote (deep neural net,
        and any future addition) and shadow-record the result. Returns
        what was recorded, for logging/telemetry."""
        recorded = []
        try:
            from analytics.deep_neural_agent import deep_neural_agent
            info = deep_neural_agent.policy_info(features)
            if info.trained:
                p = info.win_probability
                side = 1 if direction == "buy" else -1
                edge = (p - 0.5) * 2 * side
                candidate_direction = direction if edge >= 0 else ("sell" if direction == "buy" else "buy")
                self.record_prediction(
                    symbol=symbol, candidate_model=deep_neural_agent.name,
                    candidate_version=info.epochs_trained,
                    predicted_direction=candidate_direction, predicted_confidence=abs(edge),
                    live_direction=direction, live_confidence=live_confidence,
                )
                recorded.append({"model": deep_neural_agent.name, "direction": candidate_direction,
                                 "confidence": round(abs(edge), 3)})
        except Exception:
            pass
        return recorded


shadow_deployment = ShadowDeployment()
