"""Retention rules for StreamKill demo data."""

from datetime import datetime, timedelta, timezone


RAW_ARTIFACT_TTL_HOURS = 24


def should_delete_raw_artifact(created_at_iso: str, now: datetime | None = None) -> bool:
    """Return True if a raw scan artifact is older than the demo TTL."""
    now = now or datetime.now(timezone.utc)
    created_at = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
    return now - created_at > timedelta(hours=RAW_ARTIFACT_TTL_HOURS)


def repo_safe_path(path: str) -> bool:
    """Return False for paths that should never be committed."""
    blocked_fragments = [
        ".env",
        "token",
        "secret",
        "cookie",
        "credentials",
        "client_secret",
        "raw_gmail",
        "inbox_export"
    ]
    lowered = path.lower()
    return not any(fragment in lowered for fragment in blocked_fragments)
