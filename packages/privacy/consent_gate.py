"""Consent gates for StreamKill execution.

The whole product promise lives here: approval to SCAN is never approval to
CANCEL. Every action is per-item, explicit, and recorded in an append-only
audit log. Nothing in the automation layer should act without calling
``ConsentGate.require(...)`` first.

Backward compatible with the original demo module: ``ConsentRecord`` and
``require_consent(...)`` are preserved.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional


class ConsentError(PermissionError):
    """Raised when a required consent is missing, wrong, or mis-targeted."""


class ConsentAction(str, Enum):
    SCAN = "scan"                          # permission to read receipt evidence
    VIEW_LEDGER = "view_ledger"            # permission to view the ranked ledger
    CANCEL_ITEM = "cancel_item"            # permission to cancel ONE specific item
    MFA_HANDOFF = "mfa_handoff"            # user takes the wheel for MFA
    HIGH_RISK_CONFIRM = "high_risk_confirm"  # final gate before irreversible action
    # legacy aliases (kept so older callers don't break)
    CANCEL_SUBSCRIPTION = "cancel_item"
    FINAL_CONFIRMATION = "high_risk_confirm"


@dataclass(frozen=True)
class ConsentRecord:
    user_id: str
    action: ConsentAction
    target_id: str
    approved: bool
    timestamp: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ConsentGate:
    """Holds granted consents and an append-only audit trail."""

    _grants: List[ConsentRecord] = field(default_factory=list)
    _audit: List[dict] = field(default_factory=list)

    def grant(self, user_id: str, action: ConsentAction, target_id: str = "*") -> ConsentRecord:
        """Record an explicit user approval for one action on one target."""
        action = ConsentAction(action)
        rec = ConsentRecord(user_id=user_id, action=action, target_id=target_id,
                            approved=True, timestamp=_now_iso())
        self._grants.append(rec)
        self._audit.append({"event": "grant", "user_id": user_id, "action": action.value,
                            "target_id": target_id, "at": rec.timestamp})
        return rec

    def revoke(self, user_id: str, action: ConsentAction, target_id: str = "*") -> None:
        action = ConsentAction(action)
        self._grants = [g for g in self._grants
                        if not (g.user_id == user_id and g.action == action and g.target_id == target_id)]
        self._audit.append({"event": "revoke", "user_id": user_id, "action": action.value,
                            "target_id": target_id, "at": _now_iso()})

    def is_granted(self, user_id: str, action: ConsentAction, target_id: str = "*") -> bool:
        action = ConsentAction(action)
        return any(
            g.approved and g.user_id == user_id and g.action == action
            and g.target_id in (target_id, "*")
            for g in self._grants
        )

    def require(self, user_id: str, action: ConsentAction, target_id: str = "*") -> None:
        """Raise ConsentError unless this exact action+target was approved.

        Critical rule: a SCAN grant can never satisfy a CANCEL_ITEM check,
        because the actions differ. Consent does not transfer across actions.
        """
        action = ConsentAction(action)
        self._audit.append({"event": "check", "user_id": user_id, "action": action.value,
                            "target_id": target_id, "at": _now_iso()})
        if not self.is_granted(user_id, action, target_id):
            raise ConsentError(
                f"No consent for action={action.value} target={target_id}. "
                f"Approval to scan is not approval to cancel."
            )

    def audit_log(self) -> List[dict]:
        """Return a copy of the append-only audit trail."""
        return list(self._audit)


# ----- legacy shim (preserves the original function signature) -----
def require_consent(record: ConsentRecord, expected_action: ConsentAction, target_id: str) -> None:
    """Raise if the user has not approved this exact action for this exact target."""
    if not record.approved:
        raise ConsentError("Consent denied.")
    if ConsentAction(record.action) != ConsentAction(expected_action):
        raise ConsentError(f"Wrong consent action: expected {expected_action}, got {record.action}")
    if record.target_id != target_id:
        raise ConsentError(f"Consent target mismatch: expected {target_id}, got {record.target_id}")
