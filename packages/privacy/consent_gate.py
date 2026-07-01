"""Consent gates for StreamKill demo execution."""

from dataclasses import dataclass
from enum import Enum


class ConsentAction(str, Enum):
    SCAN = "scan"
    CANCEL_SUBSCRIPTION = "cancel_subscription"
    FINAL_CONFIRMATION = "final_confirmation"


@dataclass(frozen=True)
class ConsentRecord:
    user_id: str
    action: ConsentAction
    target_id: str
    approved: bool
    timestamp: str


def require_consent(record: ConsentRecord, expected_action: ConsentAction, target_id: str) -> None:
    """Raise if the user has not approved this exact action for this exact target."""
    if not record.approved:
        raise PermissionError("Consent denied.")

    if record.action != expected_action:
        raise PermissionError(f"Wrong consent action: expected {expected_action}, got {record.action}")

    if record.target_id != target_id:
        raise PermissionError(f"Consent target mismatch: expected {target_id}, got {record.target_id}")
