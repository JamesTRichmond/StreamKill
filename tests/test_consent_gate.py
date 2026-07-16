"""Tests for the consent gate — StreamKill's central trust promise.

The product's whole claim is: *approval to SCAN is never approval to CANCEL*.
These tests turn that sentence into an enforced, regression-guarded contract.
"""

import pytest

from packages.privacy.consent_gate import (
    ConsentAction,
    ConsentError,
    ConsentGate,
    ConsentRecord,
    require_consent,
)

USER = "demo-user"
ITEM = "sub_netflix"


def test_scan_grant_does_not_authorize_cancel():
    """The core rule: a SCAN grant can never satisfy a CANCEL_ITEM check."""
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.SCAN)

    assert gate.is_granted(USER, ConsentAction.SCAN)
    assert not gate.is_granted(USER, ConsentAction.CANCEL_ITEM, ITEM)

    with pytest.raises(ConsentError):
        gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)


def test_cancel_requires_item_specific_grant():
    """Cancellation consent is per-item; a grant for one item does not cover another."""
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.CANCEL_ITEM, "sub_hulu")

    gate.require(USER, ConsentAction.CANCEL_ITEM, "sub_hulu")  # no raise

    with pytest.raises(ConsentError):
        gate.require(USER, ConsentAction.CANCEL_ITEM, "sub_netflix")


def test_wildcard_grant_covers_any_target():
    """A '*' target grant satisfies a check for any specific item."""
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.CANCEL_ITEM, "*")

    gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)  # no raise
    assert gate.is_granted(USER, ConsentAction.CANCEL_ITEM, "anything")


def test_specific_grant_does_not_satisfy_other_user():
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.CANCEL_ITEM, ITEM)

    with pytest.raises(ConsentError):
        gate.require("someone-else", ConsentAction.CANCEL_ITEM, ITEM)


def test_revoke_removes_consent():
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.CANCEL_ITEM, ITEM)
    gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)  # granted

    gate.revoke(USER, ConsentAction.CANCEL_ITEM, ITEM)

    assert not gate.is_granted(USER, ConsentAction.CANCEL_ITEM, ITEM)
    with pytest.raises(ConsentError):
        gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)


def test_legacy_action_aliases_map_to_canonical_actions():
    """CANCEL_SUBSCRIPTION/FINAL_CONFIRMATION aliases must equal the canonical values."""
    assert ConsentAction.CANCEL_SUBSCRIPTION == ConsentAction.CANCEL_ITEM
    assert ConsentAction.FINAL_CONFIRMATION == ConsentAction.HIGH_RISK_CONFIRM

    gate = ConsentGate()
    gate.grant(USER, ConsentAction.CANCEL_SUBSCRIPTION, ITEM)
    # A grant made via the legacy alias satisfies a check via the canonical name.
    gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)


def test_audit_log_records_grants_checks_and_revokes():
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.SCAN)
    with pytest.raises(ConsentError):
        gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)
    gate.revoke(USER, ConsentAction.SCAN)

    events = [e["event"] for e in gate.audit_log()]
    assert events == ["grant", "check", "revoke"]
    # audit_log returns a copy — mutating it must not corrupt the gate's trail.
    gate.audit_log().clear()
    assert len(gate.audit_log()) == 3


def test_audit_log_captures_denied_cancel_attempt():
    """A blocked cancellation must still leave an auditable 'check' record."""
    gate = ConsentGate()
    gate.grant(USER, ConsentAction.SCAN)
    with pytest.raises(ConsentError):
        gate.require(USER, ConsentAction.CANCEL_ITEM, ITEM)

    checks = [e for e in gate.audit_log() if e["event"] == "check"]
    assert checks and checks[-1]["action"] == "cancel_item"
    assert checks[-1]["target_id"] == ITEM


# ----- legacy shim -----

def test_legacy_require_consent_rejects_wrong_action():
    rec = ConsentRecord(
        user_id=USER,
        action=ConsentAction.SCAN,
        target_id=ITEM,
        approved=True,
        timestamp="2026-07-16T00:00:00+00:00",
    )
    with pytest.raises(ConsentError):
        require_consent(rec, ConsentAction.CANCEL_ITEM, ITEM)


def test_legacy_require_consent_rejects_target_mismatch():
    rec = ConsentRecord(
        user_id=USER,
        action=ConsentAction.CANCEL_ITEM,
        target_id="sub_hulu",
        approved=True,
        timestamp="2026-07-16T00:00:00+00:00",
    )
    with pytest.raises(ConsentError):
        require_consent(rec, ConsentAction.CANCEL_ITEM, "sub_netflix")


def test_legacy_require_consent_rejects_unapproved():
    rec = ConsentRecord(
        user_id=USER,
        action=ConsentAction.CANCEL_ITEM,
        target_id=ITEM,
        approved=False,
        timestamp="2026-07-16T00:00:00+00:00",
    )
    with pytest.raises(ConsentError):
        require_consent(rec, ConsentAction.CANCEL_ITEM, ITEM)
