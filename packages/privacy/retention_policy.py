"""Retention enforcement for StreamKill artifacts.

Turns the "delete raw scan data within 24h" promise from a sentence into a
mechanism. Register artifacts as they're created; ``sweep()`` actually deletes
the expired raw ones. Defaults to dry-run so nothing is destroyed by accident —
pass ``apply=True`` to really delete.

Backward compatible: ``should_delete_raw_artifact`` and ``repo_safe_path`` are
preserved.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional


RAW_ARTIFACT_TTL_HOURS = 24

# per-kind TTL in hours; None means "retain (only if redacted)"; 0 means "never store"
TTL_BY_KIND: Dict[str, Optional[int]] = {
    "raw_scan": 24,
    "raw_gmail": 0,
    "ledger": None,      # keep only if redacted
    "proof": None,       # keep only if redacted
    "secret": 0,         # never
}

BLOCKED_FRAGMENTS = [
    ".env", "token", "secret", "cookie", "credentials", "client_secret",
    "raw_gmail", "inbox_export", ".session", "storage-state", "pw-profile",
]


def _now(now: Optional[datetime] = None) -> datetime:
    return now or datetime.now(timezone.utc)


def should_delete_raw_artifact(created_at_iso: str, now: Optional[datetime] = None) -> bool:
    """True if a raw scan artifact is older than the demo TTL."""
    created_at = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
    return _now(now) - created_at > timedelta(hours=RAW_ARTIFACT_TTL_HOURS)


def repo_safe_path(path: str) -> bool:
    """False for paths that must never be committed."""
    lowered = path.lower()
    return not any(fragment in lowered for fragment in BLOCKED_FRAGMENTS)


@dataclass
class _Artifact:
    path: str
    kind: str
    created_at: str  # iso


@dataclass
class RetentionPolicy:
    ttl_hours: int = RAW_ARTIFACT_TTL_HOURS
    _artifacts: List[_Artifact] = field(default_factory=list)

    def register(self, path: str, kind: str, created_at_iso: Optional[str] = None) -> None:
        if kind not in TTL_BY_KIND:
            raise ValueError(f"Unknown artifact kind: {kind}")
        self._artifacts.append(_Artifact(path=path, kind=kind,
                                        created_at=created_at_iso or _now().isoformat()))

    def _expired(self, art: _Artifact, now: Optional[datetime]) -> bool:
        ttl = TTL_BY_KIND.get(art.kind, self.ttl_hours)
        if ttl == 0:
            return True                       # never allowed to persist
        if ttl is None:
            return False                      # retained (redaction enforced elsewhere)
        created = datetime.fromisoformat(art.created_at.replace("Z", "+00:00"))
        return _now(now) - created > timedelta(hours=ttl)

    def sweep(self, now: Optional[datetime] = None, apply: bool = False) -> List[str]:
        """Return the list of artifacts due for deletion. Deletes them if apply=True."""
        due = [a for a in self._artifacts if self._expired(a, now)]
        if apply:
            for a in due:
                try:
                    if os.path.exists(a.path):
                        os.remove(a.path)
                except OSError:
                    pass
            kept = [a for a in self._artifacts if a not in due]
            self._artifacts = kept
        return [a.path for a in due]

    def purge_all(self, apply: bool = False) -> List[str]:
        """Delete every registered artifact (end-of-demo teardown)."""
        paths = [a.path for a in self._artifacts]
        if apply:
            for p in paths:
                try:
                    if os.path.exists(p):
                        os.remove(p)
                except OSError:
                    pass
            self._artifacts = []
        return paths

    def manifest(self) -> List[dict]:
        return [{"path": a.path, "kind": a.kind, "created_at": a.created_at} for a in self._artifacts]
