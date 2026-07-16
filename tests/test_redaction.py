"""Tests for redaction + the secret guard.

These enforce the repo's security promise mechanically: PII gets masked, and
anything that looks like a token/cookie/password/card is refused before it can
reach disk or Git.
"""

import pytest

from packages.privacy.redaction import (
    SecretLeakError,
    assert_no_secrets,
    redact_email,
    redact_record,
    redact_text,
)


def test_redact_email_keeps_domain_masks_local_part():
    assert redact_email("james@gmail.com") == "j•••@gmail.com"


def test_redact_email_handles_garbage_input():
    assert redact_email("not-an-email") == "[redacted-email]"


def test_redact_text_masks_email_and_card():
    out = redact_text("reach me at james@gmail.com card 4111 1111 1111 1111")
    assert "james@gmail.com" not in out
    assert "[redacted-email]" in out
    assert "[redacted-card]" in out


def test_redact_text_masks_token_assignments():
    out = redact_text("token: sk_live_abc123xyz")
    assert "sk_live_abc123xyz" not in out
    assert "[redacted-secret]" in out


def test_redact_record_is_recursive():
    record = {
        "user": "james@gmail.com",
        "nested": {"note": "ping me at a@b.co"},
        "items": ["plain", "x@y.io"],
    }
    out = redact_record(record)
    assert out["user"] == "[redacted-email]"
    assert out["nested"]["note"] == "ping me at [redacted-email]"
    assert out["items"][1] == "[redacted-email]"
    assert out["items"][0] == "plain"


def test_assert_no_secrets_passes_clean_ledger():
    clean = {
        "service": "Netflix",
        "amount_monthly": 15.49,
        "cancel_url": "https://www.netflix.com/cancelplan",
        "status": "ready_for_approval",
    }
    assert_no_secrets(clean)  # must not raise


def test_assert_no_secrets_rejects_secret_keyname():
    with pytest.raises(SecretLeakError):
        assert_no_secrets({"access_token": "ya29.something-populated"})


def test_assert_no_secrets_rejects_token_pattern_in_string():
    with pytest.raises(SecretLeakError):
        assert_no_secrets({"note": "cookie=deadbeefdeadbeef"})


def test_assert_no_secrets_rejects_high_entropy_blob():
    with pytest.raises(SecretLeakError):
        assert_no_secrets({"blob": "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7"})


def test_assert_no_secrets_allows_urls_and_redaction_placeholders():
    # URLs and already-redacted markers must not trip the entropy guard.
    assert_no_secrets(
        {
            "cancel_url": "https://apps.apple.com/account/subscriptions",
            "user": "[redacted-email]",
        }
    )


def test_assert_no_secrets_ignores_empty_secret_keys():
    # A secret-named key with no populated value is fine (e.g. a schema stub).
    assert_no_secrets({"password": "", "token": None})
