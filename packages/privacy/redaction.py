"""Redaction + secret-guard helpers for StreamKill artifacts.

Two jobs:
  1. Redact PII from evidence before it is shown or stored.
  2. ``assert_no_secrets(obj)`` — a hard guard you call before writing any
     artifact or committing anything, so a token/cookie/password can never
     reach disk or Git by accident.

Backward compatible: ``redact_text`` and ``redact_record`` are preserved and
``redact_record`` is now recursive.
"""

from __future__ import annotations

import re
from typing import Any


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
CARD_RE = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
TOKEN_RE = re.compile(r"(?i)(token|secret|api[_-]?key|authorization|bearer|cookie|password|client_secret)\s*[:=]\s*\S+")
# secret-ish blobs: long base64/hex runs that look like keys/tokens
SECRET_BLOB_RE = re.compile(r"\b[A-Za-z0-9_\-]{32,}\b")
SECRET_KEYNAMES = {"password", "passwd", "token", "access_token", "refresh_token",
                   "secret", "client_secret", "api_key", "apikey", "authorization",
                   "cookie", "cookies", "session", "storage_state", "mfa", "otp"}


def redact_email(addr: str) -> str:
    """`james@gmail.com` -> `j•••@gmail.com` (keeps domain, masks local part)."""
    m = re.match(r"^([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$", addr.strip())
    if not m:
        return "[redacted-email]"
    return f"{m.group(1)}•••{m.group(2)}"


def redact_text(value: str) -> str:
    """Redact common sensitive strings from evidence."""
    value = EMAIL_RE.sub("[redacted-email]", value)
    value = CARD_RE.sub("[redacted-card]", value)
    value = TOKEN_RE.sub(r"\1=[redacted-secret]", value)
    return value


def redact_record(record: Any) -> Any:
    """Return a recursively redacted copy of a dict/list/str structure."""
    if isinstance(record, dict):
        return {k: redact_record(v) for k, v in record.items()}
    if isinstance(record, list):
        return [redact_record(v) for v in record]
    if isinstance(record, str):
        return redact_text(record)
    return record


class SecretLeakError(RuntimeError):
    """Raised when an artifact about to be written/committed contains a secret."""


def assert_no_secrets(obj: Any, _path: str = "$") -> None:
    """Raise SecretLeakError if obj contains anything that looks like a secret.

    Call this immediately before writing any file or committing any data.
    Checks (a) suspicious key names, (b) token/cookie/password patterns in
    strings, (c) long high-entropy blobs.
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).lower() in SECRET_KEYNAMES and _looks_populated(v):
                raise SecretLeakError(f"Secret-like key '{k}' at {_path} carries a value.")
            assert_no_secrets(v, f"{_path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            assert_no_secrets(v, f"{_path}[{i}]")
    elif isinstance(obj, str):
        if TOKEN_RE.search(obj) or CARD_RE.search(obj):
            raise SecretLeakError(f"Secret/card pattern in string at {_path}.")
        if SECRET_BLOB_RE.search(obj) and not obj.startswith(("http", "sha256", "[redacted")):
            raise SecretLeakError(f"High-entropy blob at {_path} — possible token/key.")


def _looks_populated(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() not in ("", "[redacted-secret]", "[redacted-email]", "false", "none")
    return True
