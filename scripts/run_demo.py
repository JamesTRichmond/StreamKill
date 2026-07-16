"""Run the StreamKill command-line demo sequence."""

import subprocess
import sys


COMMANDS = [
    ["python3", "scripts/show_demo_ledger.py"],
    ["python3", "scripts/show_kill_queue.py"],
]


def main() -> None:
    print("\n=== STREAMKILL JULY 3 DEMO ===")
    print("Trust gate → leak ledger → guarded kill queue\n")

    for command in COMMANDS:
        result = subprocess.run(command, check=False)
        if result.returncode != 0:
            print(f"Demo step failed: {' '.join(command)}", file=sys.stderr)
            raise SystemExit(result.returncode)

    print("Demo complete: ledger shown, approvals separated, risky cancellations blocked.\n")


if __name__ == "__main__":
    main()
