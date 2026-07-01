# StreamKill July 3 Demo Runbook

## Demo Objective

Prove that StreamKill can take a non-technical user from trust gate to leak ledger to approved cancellation logic without exposing them to the local Python engine.

Primary proof:

- The Bloop/Desktop site shows the user-facing demo flow.
- The CLI fallback shows the verified real-data ledger.
- No cancellation happens without per-item user approval.
- High-risk subscriptions are blocked or escalated.

## Demo Mode Opening

Say this at the start:

"Today's demo runs on prepared, redacted subscription evidence. Production Gmail access will use verified, least-privilege authorization. The point today is to prove the StreamKill flow: trust gate, leak ledger, approval queue, and guarded cancellation logic."

The site should show:

Demo Mode — Sample Inbox

## Surfaces

Primary surface:

- Bloop/Desktop site

Fallback surface:

- `python3 scripts/run_demo.py`

Supporting artifact:

- GitHub public demo repo

Do not present the GitHub repo as the consumer UI. It is the credibility artifact and CLI fallback.

## Key Numbers To Say

Use these numbers consistently:

- Detected bleed: $80.78/mo
- Detected annual bleed: $969.36/yr
- Safe-to-kill annual amount: $777.48/yr
- Needs-review amount: $191.88/yr
- Blocked/protected amount: $119.88/yr
- Real recovered story: about $250/yr from the 6/23 YouTube Premium + Dropout cancellation run

Important: Dropout belongs in the spoken recovery story, not the current fixture ledger.

## Primary Demo Flow

1. Open the Bloop/Desktop site. (site)

2. Point to the Demo Mode badge. (site)

3. State the trust frame. (site)

   "StreamKill does not take blind control. It builds the leak ledger first. The user approves every cancellation individually."

4. Start or replay the scan. (site)

5. Show the leak ledger. (site)

   Target: ledger visible within 30–90 seconds on the site.

6. Say the key numbers. (site)

   "$80.78 per month, $969.36 per year detected."

7. Explain the safety labels. (site)

   - Safe kill
   - Confirm first
   - Do not auto-kill

8. Approve YouTube Premium and Netflix as safe-kill examples. (site)

   Do not imply the demo is live-canceling them on stage.

9. Show Audible as review-required. (site)

   Explain: "This is active use, Apple-billed, and should pause for user review."

10. Show iCloud+ as blocked/protected. (site)

    Explain: "This is the exact kind of subscription StreamKill should not auto-kill because cancellation can create data-loss risk."

11. Narrate the real recovered story. (site)

    "The real live proof already happened on 6/23: YouTube Premium and Dropout were canceled, recovering about $250 per year."

12. Show the kill-room concept as animation or narrated route. (site)

    Do not claim a live browser cancellation is happening during the stage demo.

13. Close with the proof receipt idea. (site)

    "Detected, approved, blocked, and recovered are separated. The user stays in control."

## CLI Fallback Flow

Use this if the site fails, animation misbehaves, or the room wants repo proof.

Run:

    python3 scripts/run_demo.py

The CLI should print:

- Detected monthly bleed: $80.78
- Detected annual bleed: $969.36
- Safe to kill: $777.48
- Needs review: $191.88
- Blocked by policy: $119.88

Then it should show:

- YouTube Premium: Safe kill
- Netflix: Safe kill
- Spotify Premium: Safe kill
- Hulu: Safe kill
- Disney+: Safe kill
- Audible: Confirm first
- iCloud+ 2TB Storage: Do not auto-kill

## Demo Data

Use:

- `data/demo/demo_ledger.json`
- `data/demo/sample_receipts.redacted.json`
- `data/catalog/subscriptions.seed.json`
- `data/catalog/cancel_routes.seed.json`

Do not use:

- Raw Gmail exports
- OAuth secrets
- Browser cookies
- Unredacted inbox screenshots
- Real passwords or MFA codes
- Playwright profiles
- Live session state

## What Not To Claim

Do not claim:

- Production Gmail OAuth is already complete.
- The site is live-scanning a real inbox during the demo.
- Browser automation is live-canceling subscriptions on stage.
- The agent can cancel everything automatically.
- Approval to scan equals approval to cancel.

## OAuth Answer

If asked about Gmail OAuth production readiness, say:

"The demo uses controlled, prepared, redacted evidence. Production Gmail access will follow least-privilege OAuth review and formal privacy/security requirements. We are not bypassing that path."

## Failure Recovery

If live scan or site animation fails:

1. Refresh once.
2. Narrate the intended site step.
3. Drop to CLI fallback:

       python3 scripts/run_demo.py

4. Say:

   "For demo safety, this is the verified redacted fallback output from the same ledger contract."

If browser automation questions come up:

- Show `data/catalog/cancel_routes.seed.json`.
- Explain that cancellation routes are supporting artifacts.
- Emphasize final-confirmation pause and per-item approval.

## Success Metrics

The demo succeeds if the audience sees:

- Demo Mode framing up front.
- Leak ledger with verified annualized waste.
- User approval before cancellation.
- Safe/review/blocked separation.
- No live OAuth overclaim.
- No live browser-cancel overclaim.
- CLI fallback that proves the data contract.

## Close

The takeaway:

StreamKill turns forgotten subscriptions into a visible ledger and gives the user a guarded kill room to recover money with consent.
