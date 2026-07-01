"""Redaction helpers for StreamKill demo artifacts."""

import re


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
CARD_RE = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
TOKEN_RE = re.compile(r"(?i)(token|secret|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s]+")


def redact_text(value: str) -> str:
    """Redact common sensitive strings from demo evidence."""
    value = EMAIL_RE.sub("[redacted-email]", value)
    value = CARD_RE.sub("[redacted-card]", value)
    value = TOKEN_RE.sub("[redacted-secret]", value)
    return value


def redact_record(record: dict) -> dict:
    """Return a redacted copy of a dictionary."""
    redacted = {}
    for key, value in record.items():
        if isinstance(value, str):
            redacted[key] = redact_text(value)
        else:
            redacted[key] = value
    return redacted
