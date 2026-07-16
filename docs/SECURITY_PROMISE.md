# StreamKill Security Promise

StreamKill is a consent-based subscription cancellation system. It is designed to find subscription leakage from receipt evidence, show the user a ranked ledger, and only act after explicit approval.

## Plain-English Promise

StreamKill does not ask for blind control.

We scan for subscription evidence, show the user what we found, and ask before every cancellation. We do not store email passwords. We do not capture MFA codes. We do not sell inbox data. We do not cancel anything unless the user approves that exact action first.

## What StreamKill Touches

StreamKill only needs subscription-related evidence:

- Merchant or service name
- Charge amount
- Billing cadence
- Receipt date
- Renewal or cancellation clues
- Account email when needed to identify the subscription
- Cancellation route or support URL

## What StreamKill Does Not Need

StreamKill does not need:

- Email passwords
- Bank passwords
- MFA secrets
- Full inbox exports
- Personal conversations
- Contacts
- Calendar data
- Unrelated attachments
- Permanent browser sessions

## Consent Gates

StreamKill uses explicit human gates:

1. User approves the scan.
2. User reviews the leak ledger.
3. User approves each cancellation individually.
4. User handles MFA or sensitive account prompts directly.
5. Automation pauses before high-risk or irreversible actions.

## Data Handling

For the demo:

- Raw receipt artifacts should be redacted wherever possible.
- Demo files should contain only normalized ledger rows.
- No real secrets, cookies, tokens, or OAuth credentials should be committed.
- Screenshots used for proof should be redacted.
- Temporary scan artifacts should be deleted after the demo unless explicitly retained.

## Cancellation Safety

StreamKill classifies cancellation candidates as:

- Safe kill
- Confirm first
- Do not auto-kill

Do not auto-kill categories include financial, medical, insurance, security, identity, cloud storage, telecom, domains, business-critical software, and anything with possible data loss or account lockout.

## Stakeholder Answer

The trust model is simple:

StreamKill does not take control first. It produces evidence first. The user decides what to kill. The agent executes only approved actions inside the user's authorized account session.
