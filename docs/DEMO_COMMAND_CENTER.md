# StreamKill July 3 Demo Command Center

## Mission

Prove StreamKill in one clean sequence:

Landing/trust framing → leak ledger → approval queue → guarded cancellation logic → proof/fallback.

The audience should leave believing three things:

1. StreamKill finds real subscription leakage.
2. StreamKill separates safe kills from review-required and blocked subscriptions.
3. StreamKill does not cancel anything without explicit per-item approval.

## Demo Surfaces

Primary surface:

- Bloop/Desktop site

Fallback surface:

- Public repo CLI demo

Credibility artifact:

- GitHub public repo: StreamKill

Private implementation:

- StreamKill-engine-private

Do not show private engine internals unless specifically needed.

## Windows To Open Before Demo

Open these before the meeting starts:

1. Bloop/Desktop demo site
2. Terminal at:

       ~/StreamKill

3. GitHub public repo README
4. docs/DEMO_RUNBOOK.md
5. Optional: data/demo/demo_ledger.json

Do not open:

- .pw-profile/
- browser storage folders
- private cookies
- OAuth files
- .env
- raw inbox data
- private engine code unless asked by a technical stakeholder

## Preflight Commands

From public repo:

    cd ~/StreamKill
    git checkout main
    git pull
    python3 scripts/run_demo.py
    git status

Expected:

- Demo prints verified real-data ledger.
- Git status is clean.

Key output must show:

- Detected monthly bleed: $80.78
- Detected annual bleed: $969.36
- Safe to kill: $777.48
- Needs review: $191.88
- Blocked by policy: $119.88

## Opening Line

Say this first:

"Today's demo runs on prepared, redacted subscription evidence. Production Gmail access will use verified, least-privilege authorization. The point today is to prove the StreamKill flow: trust gate, leak ledger, approval queue, and guarded cancellation logic."

Then say:

"StreamKill does not take blind control. It finds subscription evidence, builds the ledger, and asks before every cancellation."

## Live Demo Flow

### 1. Show Demo Mode

Surface: Bloop/Desktop site

Point to:

    Demo Mode — Sample Inbox

Say:

"This is a safe demo surface using prepared, redacted evidence."

### 2. Show Trust Gate

Say:

"Approval to scan is not approval to cancel."

Trust points:

- No passwords stored.
- No MFA captured.
- No raw inbox committed.
- No cancellation without per-item approval.

### 3. Run Or Replay Scan

Surface: Bloop/Desktop site

Target timing:

- Ledger visible in 30–90 seconds.

If timing slips, narrate the flow and move forward.

### 4. Reveal Ledger

Say the numbers exactly:

- "$80.78 per month detected."
- "$969.36 per year detected."
- "$777.48 is safe-to-kill candidate value."
- "$191.88 needs review."
- "$119.88 is blocked/protected."

### 5. Explain Safety Labels

Safe kill:

- Low-risk consumer subscription.
- User can approve cancellation.

Confirm first:

- Ambiguous, active, shared, bundled, or still useful.

Do not auto-kill:

- Data-loss, account-lockout, security, financial, medical, storage, domain, telecom, or business-critical risk.

### 6. Show Safe-Kill Examples

Use:

- YouTube Premium
- Netflix

Say:

"These are safe-kill examples. The user still approves each one individually."

Do not say:

- "The system automatically cancels these."
- "We are live-canceling these on stage."

### 7. Show Review Required

Use:

- Audible

Say:

"Audible is in active use and Apple-billed, so StreamKill pauses for user review."

### 8. Show Blocked/Protected

Use:

- iCloud+ 2TB Storage

Say:

"This is exactly what we should not auto-kill. Storage cancellation can create data-loss risk."

### 9. Tell Real Recovery Story

Say:

"The real live proof already happened on 6/23: YouTube Premium and Dropout were canceled, recovering about $250 per year."

Clarify:

"Dropout is part of the real recovery story, not the current fixture ledger."

### 10. Close The Flow

Say:

"StreamKill separates detected, approved, blocked, and recovered. The user stays in control."

## CLI Fallback

Use if:

- Site fails
- Animation misbehaves
- Stakeholder asks for repo proof
- Internet/browser surface gets unstable

Run:

    cd ~/StreamKill
    python3 scripts/run_demo.py

Say:

"This is the verified redacted fallback output from the same ledger contract."

The CLI should show:

- YouTube Premium: Safe kill
- Netflix: Safe kill
- Spotify Premium: Safe kill
- Hulu: Safe kill
- Disney+: Safe kill
- Audible: Confirm first
- iCloud+ 2TB Storage: Do not auto-kill

## If Asked About Gmail OAuth

Say:

"The demo uses controlled, prepared, redacted evidence. Production Gmail access will follow least-privilege OAuth review and formal privacy/security requirements. We are not bypassing that path."

## If Asked About Email Privacy

Say:

"StreamKill only needs subscription evidence: merchant, amount, billing cadence, receipt date, renewal clues, and cancellation route. It does not need the user's entire inbox, passwords, MFA codes, or unrelated personal messages."

## If Asked About Automation Risk

Say:

"The automation is guarded. It acts only after item-specific approval, pauses for MFA, and blocks high-risk categories."

## If Asked Why Engine Code Is Private

Say:

"The public repo contains the demo proof and trust artifacts. Production engine code and service automation routes are private for security and abuse-prevention reasons."

## Never Say

Do not say:

- "Production Gmail OAuth is already done."
- "We scan the whole inbox."
- "The agent cancels everything automatically."
- "We store browser sessions."
- "The live stage demo is canceling real accounts right now."
- "Approval to scan means approval to cancel."

## Emergency Recovery

If the site breaks:

1. Refresh once.
2. Say: "I'll switch to the verified repo fallback."
3. Run:

       python3 scripts/run_demo.py

4. Continue from the CLI ledger.

If CLI fails:

1. Open data/demo/demo_ledger.json.
2. Show summary numbers.
3. Open docs/DEMO_RUNBOOK.md.
4. Narrate the safety flow.

## Final Close

Say:

"StreamKill turns forgotten subscriptions into a visible ledger, then gives the user a guarded kill room to recover money with consent."

Then stop talking.
