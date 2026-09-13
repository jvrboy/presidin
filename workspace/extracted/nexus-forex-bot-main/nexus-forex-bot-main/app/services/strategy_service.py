from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import StrategyDefinition
from app.services.indicators import INDICATOR_NAMES


def config_from_payload(payload: Any) -> dict[str, Any]:
    config = payload.model_dump()
    for rule in config["entry_rules"] + config["exit_rules"]:
        if rule["indicator"] not in INDICATOR_NAMES:
            raise ValueError(f"Unknown indicator: {rule['indicator']}")
    return config


def create_strategy(db: Session, username: str, payload: Any) -> StrategyDefinition:
    config = config_from_payload(payload)
    strategy = StrategyDefinition(name=payload.name, description=payload.description, config_json=json.dumps(config), created_by=username, is_active=True)
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    return strategy


def strategy_config(strategy: StrategyDefinition) -> dict[str, Any]:
    return json.loads(strategy.config_json)


def list_strategies(db: Session, username: str) -> list[StrategyDefinition]:
    return list(db.scalars(select(StrategyDefinition).where(StrategyDefinition.created_by == username).order_by(StrategyDefinition.created_at.desc())).all())


def get_strategy(db: Session, username: str, strategy_id: int) -> StrategyDefinition:
    strategy = db.scalar(select(StrategyDefinition).where(StrategyDefinition.id == strategy_id, StrategyDefinition.created_by == username))
    if not strategy:
        raise ValueError("Strategy not found")
    return strategy
