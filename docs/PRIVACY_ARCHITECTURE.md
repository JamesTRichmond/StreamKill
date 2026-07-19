# StreamKill Privacy Architecture

StreamKill is built around data minimization, explicit consent, and user-controlled execution.

The system should only collect the minimum evidence required to identify recurring subscription charges, rank leakage, and prepare approved cancellation steps.

## Privacy Principle

StreamKill does not need a user's whole digital life.

It needs subscription evidence, user approval, and an authorized browser session for approved cancellation tasks.

## Data Flow

1. User lands on StreamKill.
2. User reads the trust gate.
3. User explicitly approves a scan.
4. Receipt scanner searches for subscription-related evidence.
5. Parser extracts normalized ledger fields.
6. Raw artifacts are redacted or discarded.
7. Leak ledger is shown to the user.
8. User approves or rejects each cancellation.
9. Browser automation acts only on approved cancellations.
10. Proof receipt is generated.
11. Temporary scan data is deleted or expires.

## Data Classes

### Allowed Demo Data

The demo may use:

- Redacted receipt snippets
- Merchant name
- Service name
- Charge amount
- Billing cadence
- Receipt date
- Estimated annual cost
- Confidence score
- Cancellation URL
- Safety classification
- Redacted proof screenshot path
- Cancellation status

### Restricted Data

The demo must not commit or expose:

- Gmail OAuth tokens
- Client secrets
- API keys
- Passwords
- MFA codes
- Browser cookies
- Raw inbox exports
- Unredacted emails
- Personal conversations
- Payment card numbers
- Bank credentials
- Session storage dumps
- Real screenshots containing private inbox content

## Storage Rules

For demo purposes:

- Store only normalized ledger rows in `data/demo/demo_ledger.json`.
- Store redacted sample evidence in `data/demo/sample_receipts.redacted.json`.
- Never store raw Gmail exports in the repo.
- Never store `.env` files in the repo.
- Use `.env.example` only for variable names and setup guidance.
- Temporary scan artifacts should live outside Git and be deleted after the demo.

## Consent Gates

StreamKill requires separate user approval for:

1. Starting a scan.
2. Viewing and accepting the leak ledger.
3. Canceling each individual subscription.
4. Continuing through MFA or sensitive account prompts.
5. Final confirmation for high-risk or irreversible actions.

Consent must be action-specific. Approval to scan is not approval to cancel.

## Automation Boundaries

The browser automation agent may:

- Navigate cancellation flows.
- Fill non-sensitive cancellation forms.
- Click approved cancellation steps.
- Pause for user review.
- Produce redacted proof logs.

The browser automation agent must not:

- Store passwords.
- Capture MFA codes.
- Bypass authentication.
- Cancel unapproved services.
- Continue through high-risk warnings without user confirmation.
- Make purchases.
- Change billing details.
- Delete user data.

## Safety Classification

Every candidate subscription receives one of three labels:

### Safe Kill

Low-risk consumer subscription with clear recurring billing and no obvious dependency risk.

### Confirm First

Subscription may be valid, shared, bundled, or ambiguous. User must review before action.

### Do Not Auto-Kill

Automation should not cancel these without elevated review:

- Banking
- Insurance
- Medical
- Identity/security services
- Cloud storage
- Domain names
- Telecom
- Utilities
- Business-critical software
- Services where cancellation could cause data loss, access loss, or account lockout

## Retention Policy

Demo default:

- Raw scan artifacts: delete within 24 hours or immediately after demo.
- Normalized demo ledger: may be retained if redacted.
- Proof screenshots: retain only if redacted.
- User secrets: never store.
- OAuth/browser tokens: never commit and avoid retaining in demo state.

Production target:

- User-controlled deletion.
- Short-lived processing artifacts.
- Encrypted token storage if OAuth is used.
- Clear revocation path.
- Audit logs without sensitive content.
- Minimal retained ledger history.

## Implemented Today

The principles above started as demo policy. The following are now shipped,
enforced-in-code facts in the web app (`apps/web`) and the private engine,
each locked by tests:

- **Mailbox binding.** There is no free-text email field anywhere. The only
  inbox StreamKill can scan is the Google account the user signed in with,
  re-verified against Gmail's own answer for the granted token — and verified
  a second time, independently, by the engine before it reads anything.
- **Signed execution contracts.** Every scan runs under a short-lived (15 min)
  HMAC-signed contract naming the one allowed inbox and the allowed actions.
  Two independent gates verify it: the web boundary and the engine
  (`apps/web/ENGINE_CONTRACT.md`). `cancel_subscription` is `false` in every
  contract issued; the engine hard-refuses any contract where it is not.
- **Least-privilege Gmail access.** The OAuth request is read-only
  (`gmail.readonly`), locked by tests that fail if the scope ever widens.
- **Short-lived, single-use token handling.** The Gmail access token is never
  sent to the browser and never written to disk in plaintext. It is held
  behind a single-use handle with a ~2 minute TTL; the engine exchanges the
  handle exactly once per scan. With a database configured, stored tokens are
  AES-256-GCM encrypted at rest — the "encrypted token storage" production
  target above is shipped.
- **Action-specific consent.** Approval to scan is a separate act from
  approval to cancel, and cancellation approval is per item (the Kill Room).
  There is no automated cancellation path in the product today; the engine
  refuses contracts that claim otherwise.
- **User-controlled deletion.** Disconnecting deletes the user's StreamKill
  data and ends the session.

## Plain-English Stakeholder Statement

StreamKill is private by design because the system is built to throw away everything it does not need.

The product does not monetize inbox data. It does not need passwords. It does not need permanent control. It converts receipt evidence into a leak ledger, asks the user what to cancel, and executes only those approved actions.
