# StreamKill July 3 Demo Runbook

## Demo Objective

Prove that StreamKill can take a non-technical user from trust gate to leak ledger to approved cancellation proof without exposing them to the local Python engine.

Primary proof:

- Leak ledger visible in under 3 minutes.
- No cancellation happens without per-item user approval.
- High-risk subscriptions are blocked or escalated.

## Demo Flow

1. Open landing page or demo shell.
2. Show trust promise.
3. User approves scan.
4. Run or replay receipt scan.
5. Show leak ledger from `data/demo/demo_ledger.json`.
6. Explain safety labels:
   - Safe kill
   - Confirm first
   - Do not auto-kill
7. Approve YouTube Premium and Dropout as safe kills.
8. Show kill-room route using `data/catalog/cancel_routes.seed.json`.
9. Pause at final confirmation gate.
10. Show proof receipt:
    - Detected annual bleed
    - Safe-to-kill annual amount
    - Approved cancellation amount
    - Blocked high-risk amount

## Talk Track

StreamKill is not asking for blind control.

It reads subscription evidence, builds a ranked leak ledger, and asks the user what to cancel. The browser agent executes only approved actions inside the user's authorized account session.

The product is designed to save money without creating a privacy or account-control nightmare.

## Demo Data

Use:

- `data/demo/demo_ledger.json`
- `data/catalog/subscriptions.seed.json`
- `data/catalog/cancel_routes.seed.json`

Do not use:

- Raw Gmail exports
- OAuth secrets
- Browser cookies
- Unredacted inbox screenshots
- Real passwords or MFA codes

## Success Metrics

The demo succeeds if the audience sees:

- A ranked leak ledger.
- Annualized savings math.
- Explicit user approval before cancellation.
- Browser automation path or replay.
- Safety blocking for risky subscriptions.
- Clear privacy posture.

## Failure Recovery

If live scan fails:

- Use `data/demo/demo_ledger.json`.
- Say: "For demo safety, this is a redacted replay of the live engine output."
- Continue to kill-room proof.

If browser automation fails:

- Show the cancellation route seed.
- Show the guarded automation principle.
- Emphasize final-confirmation pause and audit proof.

If asked about Gmail OAuth production readiness:

- Say: "The demo uses controlled/local execution. Production Gmail access will follow least-privilege OAuth review and formal privacy/security requirements. We are not bypassing that path."

## Close

The takeaway:

StreamKill turns forgotten subscriptions into a visible ledger and gives the user a guarded kill room to recover money with consent.
