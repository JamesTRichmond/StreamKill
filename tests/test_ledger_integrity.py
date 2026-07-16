"""Tests for the demo ledger integrity validator.

Two jobs:
  1. Prove the *shipped* ledger is internally consistent (guards the live demo).
  2. Prove the validator actually catches drift (guards the guard).
"""

import copy

import pytest

from packages.ledger.integrity import load_ledger, validate_ledger


@pytest.fixture()
def ledger():
    return load_ledger()


def test_shipped_ledger_is_consistent(ledger):
    errors = validate_ledger(ledger)
    assert errors == [], f"shipped demo ledger failed integrity checks: {errors}"


def test_detected_total_equals_safe_plus_review(ledger):
    s = ledger["summary"]
    assert round(s["safe_to_kill_annual"] + s["requires_review_annual"], 2) == round(
        s["detected_annual_bleed"], 2
    )


def test_catches_summary_drift(ledger):
    broken = copy.deepcopy(ledger)
    broken["summary"]["detected_annual_bleed"] += 1.00
    errors = validate_ledger(broken)
    assert any("detected_annual_bleed" in e for e in errors)


def test_catches_monthly_annual_mismatch(ledger):
    broken = copy.deepcopy(ledger)
    broken["subscriptions"][0]["amount_annual"] += 5.00
    errors = validate_ledger(broken)
    assert any("monthly*12" in e for e in errors)


def test_catches_unknown_safety_label(ledger):
    broken = copy.deepcopy(ledger)
    broken["subscriptions"][0]["safety_label"] = "Definitely Kill It"
    errors = validate_ledger(broken)
    assert any("unknown safety_label" in e for e in errors)


def test_catches_out_of_range_confidence(ledger):
    broken = copy.deepcopy(ledger)
    broken["subscriptions"][0]["confidence"] = 1.5
    errors = validate_ledger(broken)
    assert any("confidence" in e for e in errors)


def test_catches_missing_required_field(ledger):
    broken = copy.deepcopy(ledger)
    del broken["subscriptions"][0]["amount_annual"]
    errors = validate_ledger(broken)
    assert any("missing field 'amount_annual'" in e for e in errors)


def test_empty_subscriptions_is_rejected():
    errors = validate_ledger({"subscriptions": [], "summary": {}})
    assert errors
