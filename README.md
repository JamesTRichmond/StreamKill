# StreamKill.ai

StreamKill is a consent-based subscription leak detector and guarded cancellation system.

It finds recurring subscription charges from receipt evidence, builds a ranked leak ledger, and prepares cancellation paths. The user approves every cancellation individually before any browser automation acts.

## Repository Status

This repository contains the public demo proof and trust artifacts.

Production engine code and service automation routes are private for security and abuse-prevention reasons.

The private engine repository is used for sensitive implementation material such as Gmail parsing, browser automation, real cancellation playbooks, service-route logic, and production security enforcement.

## Demo Status

This repository contains the July 3 StreamKill Kill Room demo proof.

The current demo is a command-line credibility artifact, not the final consumer UI. It proves:

1. Annualized subscription leakage detection.
2. Separation of safe kills, review-required items, and blocked items.
3. The rule that scan consent is not cancellation consent.

## Run the Demo

From the repository root:

    python3 scripts/run_demo.py

The demo prints the leak ledger and guarded kill queue.

## Demo Data

The demo uses redacted fixture data:

- data/demo/demo_ledger.json
- data/demo/sample_receipts.redacted.json
- data/catalog/subscriptions.seed.json
- data/catalog/cancel_routes.seed.json

It does not require live Gmail access, OAuth credentials, browser cookies, or real user secrets.

## Verification

The trust claims in this repo are enforced in code, not just prose:

    pip install -r requirements-dev.txt
    python3 -m pytest              # consent, redaction, retention, ledger, scan tests
    python3 scripts/validate_ledger.py   # demo ledger money math is self-consistent
    python3 scripts/scan_secrets.py      # no secrets/PII in committed files

CI runs the test suite, the ledger integrity check, the secret/PII scan, and
the demo end-to-end on every pull request. Key guarantees under test:

- Approval to scan never satisfies a cancellation check (per-item consent).
- Secrets/PII are refused before they can reach disk or Git.
- Raw scan artifacts expire; secret/raw kinds are never retained.
- The demo ledger's summary totals match the underlying rows.
- No committed file carries a token, key, card, or unredacted personal email.

## Core Trust Rule

StreamKill does not take blind control.

The system scans for subscription evidence, shows the user a leak ledger, and requires explicit approval before each cancellation.

Approval to scan is not approval to cancel.

## Privacy and Security Posture

Demo rules:

- No raw inbox exports committed.
- No Gmail OAuth tokens committed.
- No browser cookies committed.
- No passwords committed.
- No MFA codes captured.
- No unredacted personal emails committed.
- No cancellation runs without per-item approval.

See:

- docs/SECURITY_PROMISE.md
- docs/PRIVACY_ARCHITECTURE.md
- docs/DEMO_RUNBOOK.md
- docs/GTM_SWARM.md

## Local Session Safety

The repo ignores local browser/session artifacts, including:

- .pw-profile/
- *.session
- data/scan-cache/
- *.local.json
- playwright/.auth/
- storage-state.json
- cookies.json

Do not commit local credentials, browser profiles, OAuth secrets, cookies, or raw scan artifacts.

## Repository Map

- data/catalog/ — demo subscription catalog and cancellation routes
- data/demo/ — redacted demo ledger and receipt evidence
- docs/ — security, privacy, GTM, and demo runbook documents
- packages/privacy/ — consent, redaction, and retention helper modules
- packages/ledger/ — demo ledger integrity validator
- packages/security/ — committed-artifact secret/PII scanner
- scripts/ — executable demo and validation scripts
- tests/ — pytest suite covering the trust rules and ledger math

## Product Direction

The final product experience is the StreamKill Kill Room:

Landing page → Trust gate → Scan approval → Leak ledger → Approval queue → Guarded browser cancellation → Proof receipt.

The public repo is the proof artifact. The user-facing product should hide technical installation and collapse time-to-value.
