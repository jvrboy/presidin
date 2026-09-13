"""
Update Checker — queries GitHub releases for newer versions.

Used by both the Python engine (to serve /api/update endpoint) and
the native C# shell (via its own AutoUpdater service).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import httpx

log = logging.getLogger("update_checker")

CURRENT_VERSION = "2.0.0"
GITHUB_REPO = "jvrboy/forex_bot"


@dataclass
class ReleaseInfo:
    version: str
    tag: str
    title: str
    notes: str
    url: str
    installer_url: Optional[str]
    is_newer: bool

    def to_dict(self):
        return {
            "version": self.version,
            "tag": self.tag,
            "title": self.title,
            "notes": self.notes,
            "url": self.url,
            "installer_url": self.installer_url,
            "is_newer": self.is_newer,
            "current_version": CURRENT_VERSION,
        }


def _parse_version(v: str) -> tuple:
    parts = v.strip().lstrip("vV").split(".")
    result = []
    for p in parts:
        try:
            result.append(int(p))
        except ValueError:
            result.append(0)
    while len(result) < 3:
        result.append(0)
    return tuple(result[:3])


def check_for_update(timeout: float = 10.0) -> Optional[ReleaseInfo]:
    """Check GitHub for the latest release."""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": f"NexusTrade/{CURRENT_VERSION}",
        }
        with httpx.Client(timeout=timeout) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()
            data = r.json()

        tag = data.get("tag_name", "")
        version = tag.lstrip("vV")
        name = data.get("name", tag)
        body = data.get("body", "")
        html_url = data.get("html_url", "")

        installer_url = None
        for asset in data.get("assets", []):
            if asset["name"].endswith("Setup.exe"):
                installer_url = asset["browser_download_url"]
                break

        current = _parse_version(CURRENT_VERSION)
        remote = _parse_version(version)
        is_newer = remote > current

        return ReleaseInfo(
            version=version,
            tag=tag,
            title=name,
            notes=body,
            url=html_url,
            installer_url=installer_url,
            is_newer=is_newer,
        )
    except Exception as exc:
        log.warning("Update check failed: %s", exc)
        return None
