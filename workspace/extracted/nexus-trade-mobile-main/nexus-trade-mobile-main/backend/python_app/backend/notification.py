"""Remote Expo push delivery for provider alerts."""
from __future__ import annotations

import asyncio
from typing import Any, Iterable

import httpx

from .database import db

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _send_messages(messages: list[dict[str, Any]]) -> None:
    if not messages:
        return
    try:
        with httpx.Client(timeout=10) as client:
            client.post(EXPO_PUSH_URL, json=messages).raise_for_status()
    except Exception:
        # Alert delivery must never interrupt provider monitoring.
        return


async def notify_provider_event(title: str, body: str, data: dict[str, Any] | None = None) -> None:
    devices = db.get_push_devices()
    messages = [
        {"to": item["token"], "title": title, "body": body, "sound": "default", "data": data or {}}
        for item in devices
        if str(item.get("token", "")).startswith("ExponentPushToken[")
    ]
    for start in range(0, len(messages), 100):
        await asyncio.to_thread(_send_messages, messages[start:start + 100])
