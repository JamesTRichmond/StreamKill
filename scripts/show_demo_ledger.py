"""Print the StreamKill demo leak ledger."""

import json
from pathlib import Path


LEDGER_PATH = Path("data/demo/demo_ledger.json")


def money(value: float) -> str:
    return f"${value:,.2f}"


def main() -> None:
    ledger = json.loads(LEDGER_PATH.read_text())

    summary = ledger["summary"]
    print("\nSTREAMKILL LEAK LEDGER")
    print("=" * 48)
    print(f"Detected monthly bleed: {money(summary['detected_monthly_bleed'])}")
    print(f"Detected annual bleed:  {money(summary['detected_annual_bleed'])}")
    print(f"Safe to kill:           {money(summary['safe_to_kill_annual'])}")
    print(f"Needs review:           {money(summary['requires_review_annual'])}")
    print(f"Blocked by policy:      {money(summary['blocked_by_policy_annual'])}")
    print("=" * 48)

    for sub in ledger["subscriptions"]:
        print(
            f"- {sub['service']}: "
            f"{money(sub['amount_monthly'])}/mo | "
            f"{money(sub['amount_annual'])}/yr | "
            f"{sub['safety_label']} | "
            f"{sub['status']}"
        )

    print("=" * 48)
    print("Consent rule: no cancellation runs without per-item approval.\n")


if __name__ == "__main__":
    main()
