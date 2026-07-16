"""Validate the StreamKill demo ledger's internal money math.

Exits non-zero (and prints the failing invariants) if the ledger is not
internally consistent. Wired into CI so a drifted demo number can never merge.

    python3 scripts/validate_ledger.py
"""

import sys
from pathlib import Path

# Make the repo root importable when run as a plain script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from packages.ledger.integrity import (  # noqa: E402
    DEFAULT_LEDGER_PATH,
    load_ledger,
    validate_ledger,
)


def main() -> None:
    ledger = load_ledger(DEFAULT_LEDGER_PATH)
    errors = validate_ledger(ledger)

    if errors:
        print(f"LEDGER INTEGRITY: FAIL ({len(errors)} problem(s))")
        for err in errors:
            print(f"  - {err}")
        raise SystemExit(1)

    summary = ledger["summary"]
    print("LEDGER INTEGRITY: OK")
    print(f"  Detected annual bleed:  ${summary['detected_annual_bleed']:,.2f}")
    print(f"  Safe to kill:           ${summary['safe_to_kill_annual']:,.2f}")
    print(f"  Needs review:           ${summary['requires_review_annual']:,.2f}")
    print(f"  Blocked by policy:      ${summary['blocked_by_policy_annual']:,.2f}")


if __name__ == "__main__":
    main()
