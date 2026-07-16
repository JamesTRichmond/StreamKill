"""Tests for the committed-artifact secret/PII scanner.

Two jobs:
  1. Prove the real repo is clean (guards every future commit).
  2. Prove each rule actually fires on its bad case (guards the guard).
"""

import subprocess
from pathlib import Path

from packages.security.secret_scan import (
    scan_data_structure,
    scan_high_confidence_text,
    scan_repo,
)

REPO_ROOT = Path(__file__).resolve().parent.parent


def _rules(findings):
    return {f.rule for f in findings}


# ----- the shipped repo must be clean -----

def test_repo_is_clean():
    findings = scan_repo(str(REPO_ROOT))
    assert findings == [], "committed files contain secrets/PII:\n" + "\n".join(
        str(f) for f in findings
    )


# ----- high-confidence signatures (scanned in any file) -----

def test_flags_pem_private_key():
    text = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...\n-----END RSA PRIVATE KEY-----"
    assert "pem_private_key" in _rules(scan_high_confidence_text("x.txt", text))


def test_flags_aws_access_key():
    assert "aws_access_key_id" in _rules(
        scan_high_confidence_text("x.txt", "AWS_KEY=AKIAIOSFODNN7EXAMPLE rest")
    )


def test_flags_google_oauth_and_github_tokens():
    goog = scan_high_confidence_text("x.txt", "token ya29.a0AfH6SMBx1y2z3w4v5u6t7s8r9q0p1o2n3m4")
    gh = scan_high_confidence_text("x.txt", "ghp_abcdefghijklmnopqrstuvwxyz0123456789")
    assert "google_oauth_token" in _rules(goog)
    assert "github_token" in _rules(gh)


def test_flags_card_number():
    assert "card_number" in _rules(
        scan_high_confidence_text("x.txt", "card 4111 1111 1111 1111 on file")
    )


def test_clean_prose_has_no_findings():
    assert scan_high_confidence_text("x.md", "StreamKill finds subscription leakage.") == []


# ----- strict data-artifact checks -----

def test_flags_consumer_email_in_data():
    obj = {"receipts": [{"from": "no-reply@spotify.com", "note": "owner jamestrichmond@gmail.com"}]}
    findings = scan_data_structure("data/demo/x.json", obj)
    assert "consumer_email" in _rules(findings)


def test_vendor_sender_in_data_is_allowed():
    # Corporate vendor senders are legitimate in receipt evidence.
    obj = {"from": "payments-noreply@google.com", "to": "[redacted-account-owner]"}
    assert scan_data_structure("data/demo/x.json", obj) == []


def test_flags_unredacted_recipient_field():
    obj = {"to": "someone@example.com"}
    assert "unredacted_recipient" in _rules(scan_data_structure("data/demo/x.json", obj))


def test_redacted_recipient_placeholder_is_allowed():
    obj = {"to": "[redacted-account-owner]"}
    assert scan_data_structure("data/demo/x.json", obj) == []


def test_flags_structured_secret_in_data():
    obj = {"access_token": "ya29.a0AfH6SMBx1y2z3w4v5u6t7s8r9q0p1"}
    assert "structured_secret" in _rules(scan_data_structure("data/demo/x.json", obj))


# ----- sensitive-path rule targets artifacts, not source code -----

def test_sensitive_path_rule_distinguishes_artifacts_from_source(tmp_path):
    # Regression: the scanner's own source files (e.g. secret_scan.py) contain
    # the blocked word "secret" in their name and must NOT be flagged, while a
    # data/credential artifact with a blocked name MUST be.
    subprocess.run(["git", "-C", str(tmp_path), "init", "-q"], check=True)
    (tmp_path / "helper_secret_scan.py").write_text("# scans for secrets\n")
    (tmp_path / "cookies.json").write_text("{}")
    (tmp_path / "client_secret_prod.json").write_text("{}")
    subprocess.run(["git", "-C", str(tmp_path), "add", "-A"], check=True)

    findings = scan_repo(str(tmp_path))
    flagged = {f.path for f in findings if f.rule == "sensitive_path"}
    assert "helper_secret_scan.py" not in flagged
    assert "cookies.json" in flagged
    assert "client_secret_prod.json" in flagged
