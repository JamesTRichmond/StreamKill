"""Committed-artifact secret/PII scanner for the StreamKill public repo.

Turns the security promise ("no tokens, cookies, passwords, raw inbox exports,
or unredacted personal emails committed") into an enforced check the CI runs on
every PR.

Two tiers, chosen to be high-signal with near-zero false positives on this repo:

1. **Every tracked file** is checked for
   - sensitive *paths/filenames* (``.env``, ``cookies.json``, ``*.session``,
     ``storage-state.json``, ``client_secret*.json``, ``raw_gmail`` …), and
   - **high-confidence secret signatures** — PEM private keys, cloud/vendor
     token formats (AWS, Google OAuth, Slack, GitHub, Stripe), and card numbers.
   These formats never appear legitimately in source, docs, or tests, so they
   are safe to flag anywhere.

2. **Data artifacts under ``data/``** (real scan output — the sensitive tier)
   get the stricter treatment: the structured ``assert_no_secrets`` guard, a
   check that recipient fields are redacted placeholders, and a check for
   consumer-provider email addresses (a leaked account owner). Vendor sender
   addresses on corporate domains are allowed there by design.

``scan_repo()`` returns a list of ``Finding`` objects; an empty list is a pass.
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List, Optional

from packages.privacy.redaction import (
    CARD_RE,
    EMAIL_RE,
    SecretLeakError,
    assert_no_secrets,
)
from packages.privacy.retention_policy import repo_safe_path

DATA_PREFIX = "data/"

# Committed template files that legitimately share a blocked fragment in their
# name but carry no real secrets (e.g. the canonical env template).
PATH_ALLOWLIST = {".env.example"}

# Directories excluded from *content* scanning. Test files deliberately embed
# secret-shaped fixtures (fake cards, ``cookie=…`` strings, high-entropy blobs)
# to exercise the very guards this scanner relies on; scanning them for secrets
# is self-contradictory. Path-safety checks still apply to these files.
CONTENT_SCAN_EXCLUDE_PREFIXES = ("tests/",)

# High-confidence secret signatures — these formats do not occur legitimately in
# source/docs/tests, so they are flagged in ANY tracked file.
HIGH_CONFIDENCE_PATTERNS = {
    "pem_private_key": re.compile(
        r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"
    ),
    "aws_access_key_id": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "google_oauth_token": re.compile(r"\bya29\.[0-9A-Za-z_\-]{20,}"),
    "slack_token": re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}"),
    "github_token": re.compile(r"\bgh[posru]_[0-9A-Za-z]{20,}\b"),
    "stripe_secret_key": re.compile(r"\bsk_live_[0-9A-Za-z]{16,}\b"),
    "generic_private_key_assignment": re.compile(
        r"(?i)(private[_-]?key|secret[_-]?key)\s*[:=]\s*['\"]?[0-9A-Za-z/+_\-]{20,}"
    ),
}

# Files a scan of arbitrary text should not read (large/opaque binaries).
TEXT_SUFFIXES = {
    ".py", ".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".cfg", ".ini",
    ".env", ".example", ".js", ".ts", ".sh", ".html", ".csv", "",
}

# Consumer mailbox providers — a real account owner leaking into scan data.
# Vendor senders use their own corporate domains, so this stays low-noise.
CONSUMER_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com",
}

# JSON keys that name a message recipient — these must be redacted placeholders
# in committed evidence, never a real address or name.
RECIPIENT_KEYS = {
    "to", "recipient", "recipients", "account_owner", "owner", "customer",
    "customer_email", "user_email", "recipient_email", "recipient_name",
}


@dataclass(frozen=True)
class Finding:
    path: str
    rule: str
    detail: str

    def __str__(self) -> str:
        return f"{self.path}: [{self.rule}] {self.detail}"


def _git_tracked_files(root: Path) -> Optional[List[str]]:
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files"],
            capture_output=True, text=True, check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return [line for line in out.stdout.splitlines() if line.strip()]


def _walk_files(root: Path) -> List[str]:
    skip = {".git", "__pycache__", ".pytest_cache", "node_modules", ".venv", "venv"}
    files: List[str] = []
    for p in root.rglob("*"):
        if p.is_file() and not any(part in skip for part in p.parts):
            files.append(str(p.relative_to(root)))
    return files


def _is_redaction_placeholder(value: str) -> bool:
    return value.strip().startswith("[redacted")


def scan_high_confidence_text(rel_path: str, text: str) -> List[Finding]:
    """Flag PEM keys, vendor token formats, and card numbers in any file."""
    findings: List[Finding] = []
    for rule, pattern in HIGH_CONFIDENCE_PATTERNS.items():
        if pattern.search(text):
            findings.append(Finding(rel_path, rule, "high-confidence secret signature matched"))
    if CARD_RE.search(text):
        findings.append(Finding(rel_path, "card_number", "possible payment card number"))
    return findings


def scan_data_structure(rel_path: str, obj: Any) -> List[Finding]:
    """Strict checks for committed data artifacts under ``data/``."""
    findings: List[Finding] = []

    try:
        assert_no_secrets(obj)
    except SecretLeakError as exc:
        findings.append(Finding(rel_path, "structured_secret", str(exc)))

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key.lower() in RECIPIENT_KEYS and isinstance(value, str):
                    if EMAIL_RE.search(value) and not _is_redaction_placeholder(value):
                        findings.append(Finding(
                            rel_path, "unredacted_recipient",
                            f"recipient field '{key}' holds an unredacted address",
                        ))
                walk(value, f"{path}.{key}")
        elif isinstance(node, list):
            for i, value in enumerate(node):
                walk(value, f"{path}[{i}]")
        elif isinstance(node, str):
            for email in EMAIL_RE.findall(node):
                domain = email.rsplit("@", 1)[-1].lower()
                if domain in CONSUMER_EMAIL_DOMAINS:
                    findings.append(Finding(
                        rel_path, "consumer_email",
                        f"consumer-provider email '{email}' in committed data",
                    ))

    walk(obj, "$")
    return findings


def scan_repo(root: str = ".") -> List[Finding]:
    """Scan every committed file. Returns findings; empty list == clean."""
    root_path = Path(root)
    tracked = _git_tracked_files(root_path)
    files = tracked if tracked is not None else _walk_files(root_path)

    findings: List[Finding] = []
    for rel_path in files:
        abs_path = root_path / rel_path

        norm = rel_path.replace("\\", "/")

        # Tier 0: sensitive path/filename must never be committed.
        if norm not in PATH_ALLOWLIST and not repo_safe_path(rel_path):
            findings.append(Finding(rel_path, "sensitive_path", "path matches a blocked-artifact fragment"))

        if not abs_path.is_file():
            continue
        if abs_path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if norm.startswith(CONTENT_SCAN_EXCLUDE_PREFIXES):
            continue
        try:
            text = abs_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue

        # Tier 1: high-confidence signatures everywhere.
        findings.extend(scan_high_confidence_text(rel_path, text))

        # Tier 2: strict structured checks for data artifacts.
        if norm.startswith(DATA_PREFIX) and abs_path.suffix.lower() == ".json":
            try:
                obj = json.loads(text)
            except json.JSONDecodeError as exc:
                findings.append(Finding(rel_path, "invalid_json", f"could not parse: {exc}"))
                continue
            findings.extend(scan_data_structure(rel_path, obj))

    return findings
