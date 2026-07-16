"""Integrity checks for the StreamKill demo ledger.

The demo's credibility rests on a handful of dollar figures that appear in the
CLI output, the runbook, and the command-center script. If the ledger JSON ever
drifts out of internal agreement, a wrong number lands on stage. This module
turns the ledger's money math into enforced invariants so that can never happen
silently.

`validate_ledger(ledger)` returns a list of human-readable error strings; an
empty list means the ledger is internally consistent.

Provenance rule (see the ledger's `data_provenance` field): the *detected* bleed
is the set of rows whose `source == "verified_fixture"`. Rows marked
`illustrative_policy_example` demonstrate the safety tier and are counted only
under `blocked_by_policy_annual`, never in the detected totals.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import List

DEFAULT_LEDGER_PATH = Path("data/demo/demo_ledger.json")

VALID_SAFETY_LABELS = {"Safe kill", "Confirm first", "Do not auto-kill"}
VERIFIED_SOURCE = "verified_fixture"

REQUIRED_SUB_FIELDS = (
    "id",
    "service",
    "amount_monthly",
    "amount_annual",
    "confidence",
    "safety_label",
    "source",
)
REQUIRED_SUMMARY_FIELDS = (
    "detected_monthly_bleed",
    "detected_annual_bleed",
    "safe_to_kill_annual",
    "requires_review_annual",
    "blocked_by_policy_annual",
    "approved_for_cancellation_annual",
)

# Summary totals are exact sums of cent-precise rows: allow only float noise.
SUMMARY_TOL = 0.011
# monthly*12 vs annual can differ by a rounding artifact (half a cent * 12).
MONTHLY_ANNUAL_TOL = 0.06


def load_ledger(path: Path = DEFAULT_LEDGER_PATH) -> dict:
    return json.loads(Path(path).read_text())


def _money_eq(a: float, b: float, tol: float = SUMMARY_TOL) -> bool:
    return abs(round(a, 2) - round(b, 2)) <= tol


def validate_ledger(ledger: dict) -> List[str]:
    """Return a list of integrity errors. Empty list == internally consistent."""
    errors: List[str] = []

    subs = ledger.get("subscriptions")
    summary = ledger.get("summary")
    if not isinstance(subs, list) or not subs:
        errors.append("ledger.subscriptions must be a non-empty list")
        return errors
    if not isinstance(summary, dict):
        errors.append("ledger.summary must be an object")
        return errors

    for field in REQUIRED_SUMMARY_FIELDS:
        if field not in summary:
            errors.append(f"summary is missing required field '{field}'")

    # ----- per-row structural + money checks -----
    for sub in subs:
        sid = sub.get("id", sub.get("service", "<unknown>"))
        for field in REQUIRED_SUB_FIELDS:
            if field not in sub:
                errors.append(f"subscription '{sid}' is missing field '{field}'")

        label = sub.get("safety_label")
        if label is not None and label not in VALID_SAFETY_LABELS:
            errors.append(f"subscription '{sid}' has unknown safety_label '{label}'")

        conf = sub.get("confidence")
        if isinstance(conf, (int, float)) and not (0.0 <= conf <= 1.0):
            errors.append(f"subscription '{sid}' confidence {conf} is outside [0, 1]")

        monthly = sub.get("amount_monthly")
        annual = sub.get("amount_annual")
        if isinstance(monthly, (int, float)) and isinstance(annual, (int, float)):
            if not _money_eq(monthly * 12, annual, MONTHLY_ANNUAL_TOL):
                errors.append(
                    f"subscription '{sid}': monthly*12 ({monthly * 12:.2f}) "
                    f"!= annual ({annual:.2f})"
                )

    # If required fields are missing, downstream sums are meaningless.
    if errors:
        return errors

    detected = [s for s in subs if s["source"] == VERIFIED_SOURCE]
    if not detected:
        errors.append("no detected rows (source == 'verified_fixture') found")
        return errors

    def annual_sum(rows) -> float:
        return sum(s["amount_annual"] for s in rows)

    def monthly_sum(rows) -> float:
        return sum(s["amount_monthly"] for s in rows)

    detected_monthly = monthly_sum(detected)
    detected_annual = annual_sum(detected)
    safe_annual = annual_sum([s for s in detected if s["safety_label"] == "Safe kill"])
    review_annual = annual_sum([s for s in detected if s["safety_label"] == "Confirm first"])
    blocked_annual = annual_sum([s for s in subs if s["safety_label"] == "Do not auto-kill"])

    checks = [
        ("detected_monthly_bleed", detected_monthly, summary["detected_monthly_bleed"]),
        ("detected_annual_bleed", detected_annual, summary["detected_annual_bleed"]),
        ("safe_to_kill_annual", safe_annual, summary["safe_to_kill_annual"]),
        ("requires_review_annual", review_annual, summary["requires_review_annual"]),
        ("blocked_by_policy_annual", blocked_annual, summary["blocked_by_policy_annual"]),
    ]
    for name, computed, stated in checks:
        if not _money_eq(computed, stated):
            errors.append(
                f"summary.{name} ({stated:.2f}) != computed from rows ({computed:.2f})"
            )

    # Cross-identities: detected = safe + review; approved = safe-to-kill.
    if not _money_eq(
        summary["detected_annual_bleed"],
        summary["safe_to_kill_annual"] + summary["requires_review_annual"],
    ):
        errors.append(
            "summary.detected_annual_bleed != safe_to_kill_annual + requires_review_annual"
        )
    if not _money_eq(
        summary["approved_for_cancellation_annual"], summary["safe_to_kill_annual"]
    ):
        errors.append(
            "summary.approved_for_cancellation_annual != safe_to_kill_annual"
        )

    # The blocked/protected tier must be illustrative, not counted as detected bleed.
    detected_ids = {s["id"] for s in detected}
    for s in subs:
        if s["safety_label"] == "Do not auto-kill" and s["id"] in detected_ids:
            errors.append(
                f"subscription '{s['id']}' is 'Do not auto-kill' but counted in "
                f"detected bleed — blocked rows must be illustrative"
            )

    return errors
