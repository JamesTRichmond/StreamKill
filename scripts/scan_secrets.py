"""Scan committed files for secrets / unredacted PII.

Enforces the repo's security promise mechanically. Exits non-zero (and lists
every finding) if anything sensitive is committed. Wired into CI.

    python3 scripts/scan_secrets.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from packages.security.secret_scan import scan_repo  # noqa: E402


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    findings = scan_repo(str(repo_root))

    if findings:
        print(f"SECRET SCAN: FAIL ({len(findings)} finding(s))")
        for f in findings:
            print(f"  - {f}")
        raise SystemExit(1)

    print("SECRET SCAN: OK — no secrets or unredacted PII in committed files")


if __name__ == "__main__":
    main()
