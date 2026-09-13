from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import AlertRule, NotificationDelivery


class NotificationService:
    def __init__(self) -> None:
        self.timeout = settings.notification_timeout_seconds

    def send(self, provider: str, message: str, title: str = "Nexus Forex Alert") -> dict[str, Any]:
        if provider == "telegram":
            if not settings.telegram_bot_token or not settings.telegram_chat_id:
                raise RuntimeError("Telegram notification credentials are not configured")
            url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
            response = httpx.post(url, json={"chat_id": settings.telegram_chat_id, "text": f"{title}\n{message}"}, timeout=self.timeout)
        elif provider == "discord":
            if not settings.discord_webhook_url:
                raise RuntimeError("Discord webhook URL is not configured")
            response = httpx.post(settings.discord_webhook_url, json={"username": "Nexus Forex Alerts", "embeds": [{"title": title, "description": message, "color": 3447003}]}, timeout=self.timeout)
        else:
            raise ValueError("provider must be telegram or discord")
        response.raise_for_status()
        return {"status_code": response.status_code, "body": response.text[:1000]}


def event_signature(event: dict[str, Any]) -> str:
    encoded = json.dumps(event, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()[:64]


def serialize_event(event: dict[str, Any]) -> str:
    return json.dumps(event, sort_keys=True, default=str)


def deliver_alert(db: Session, rule: AlertRule, event: dict[str, Any]) -> list[dict[str, Any]]:
    signature = event_signature(event)
    if rule.last_signature == signature:
        return [{"provider": "deduplicated", "status": "SKIPPED", "signature": signature}]
    service = NotificationService()
    payload = serialize_event(event)
    results: list[dict[str, Any]] = []
    for provider in json.loads(rule.channels_json):
        status, response_body, error = "SENT", None, None
        try:
            response_body = service.send(provider, json.dumps(event, indent=2, default=str), title=f"{rule.name}: {event.get('event_type', rule.event_type)}")
        except Exception as exc:
            status, error = "FAILED", str(exc)
        db.add(NotificationDelivery(alert_rule_id=rule.id, provider=provider, status=status, event_signature=signature, payload_json=payload, response_json=json.dumps(response_body) if response_body else None, error_message=error))
        results.append({"provider": provider, "status": status, "error": error})
    rule.last_signature = signature
    rule.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return results


def list_rules(db: Session, username: str) -> list[AlertRule]:
    return list(db.scalars(select(AlertRule).where(AlertRule.created_by == username).order_by(AlertRule.created_at.desc())).all())


def evaluate_rule(db: Session, rule: AlertRule, provider) -> dict[str, Any]:
    import pandas as pd
    from app.services.divergence import detect_divergence
    from app.services.multi_timeframe import MultiTimeframeRegimeEngine

    bars = pd.DataFrame(provider.get_ohlc(rule.pair, 300))
    if rule.event_type == "divergence":
        analysis = detect_divergence(bars, lookback=200)
        triggered = abs(analysis["confluence_score"]) >= rule.threshold
        event = {"event_type": "divergence", "pair": rule.pair, "bias": analysis["bias"], "confluence_score": analysis["confluence_score"], "details": analysis}
    else:
        frames = {timeframe: pd.DataFrame(provider.get_ohlc(rule.pair, 300)) for timeframe in json.loads(rule.timeframes_json)}
        analysis = MultiTimeframeRegimeEngine().detect_multi(frames)
        triggered = analysis["consensus_confidence"] >= rule.threshold
        event = {"event_type": "regime_shift", "pair": rule.pair, "consensus_regime": analysis["consensus_regime"], "confidence": analysis["consensus_confidence"], "details": analysis}
    deliveries = deliver_alert(db, rule, event) if triggered else []
    return {"rule_id": rule.id, "triggered": triggered, "event": event, "deliveries": deliveries}
