"""Print the StreamKill guarded cancellation queue."""

import json
from pathlib import Path


LEDGER_PATH = Path("data/demo/demo_ledger.json")


def main() -> None:
    ledger = json.loads(LEDGER_PATH.read_text())

    print("\nSTREAMKILL KILL QUEUE")
    print("=" * 56)

    for sub in ledger["subscriptions"]:
        label = sub["safety_label"]

        if label == "Safe kill":
            action = "READY FOR USER APPROVAL"
        elif label == "Confirm first":
            action = "PAUSE: USER REVIEW REQUIRED"
        else:
            action = "BLOCKED: DO NOT AUTO-KILL"

        print(f"- {sub['service']}")
        print(f"  Annual bleed: ${sub['amount_annual']:,.2f}")
        print(f"  Safety:       {label}")
        print(f"  Action:       {action}")
        print()

    print("=" * 56)
    print("Automation boundary: approval to scan is not approval to cancel.\n")


if __name__ == "__main__":
    main()
