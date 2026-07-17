# Deploying StreamKill web (production + beta)

Recommended stack: **Vercel** (host) + **Neon** (managed Postgres). Any Node
host + Postgres works the same way — nothing below is Vercel-specific except
where labeled.

## 1. Database

1. Create a Postgres database (Neon: create a project, copy the connection
   string).
2. Set it as `DATABASE_URL` on the host. That is the entire switch: with
   `DATABASE_URL` set the app uses the Postgres driver; without it, the
   dev-only JSON file. Schema is bootstrapped automatically on first use
   (`sk_users`, `sk_scan_sessions`, `sk_contracts`, `sk_receipts`).
3. The store holds identity/session records and signed proof receipts only —
   never OAuth tokens, passwords, or inbox content.

## 2. Environment variables (all required in production)

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Neon) |
| `AUTH_SECRET` | NextAuth session secret (`openssl rand -base64 32`) |
| `CONTRACT_SIGNING_SECRET` | HMAC key for execution contracts + proof receipts. Set the SAME value on the engine. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (see `google-oauth-setup.md`) |
| `ENGINE_URL` | Full scan endpoint of the engine service (e.g. `https://engine.internal/scan`). Unset = local sample ledger. |

Never commit any of these. `.env*` is gitignored.

## 3. Host (Vercel)

1. Import the GitHub repo in Vercel; set **Root Directory** to `apps/web`.
2. Add the env vars above (Production scope).
3. In Google Cloud Console, add the production callback URLs
   (`https://<domain>/api/auth/callback/google` and
   `https://<domain>/api/gmail/callback`) to the OAuth client.
4. Deploy. CI (`web-ci`) must be green first — it runs lint, typecheck, the
   full test suite (including the Postgres driver against a real database),
   and `next build` on every PR.

## 4. Known production gaps (tracked, not silent)

- **Token vault**: with `DATABASE_URL` set, the `token_ref` mint/redeem
  handshake uses a shared Postgres table (tokens encrypted at rest, single-use
  enforced atomically), so multiple web instances are safe. Without a database
  the vault is in-process and requires a single instance. See
  `ENGINE_CONTRACT.md §7`.
- **Engine service** (`ENGINE_URL`) is the private Python engine; until it is
  deployed, scans return the sample ledger.

## 5. Controlled beta runbook

1. **Cohort**: 5–10 consenting users who understand this reads their Gmail
   receipts read-only. Owner approves each participant.
2. **Consent**: participants sign in with Google, connect Gmail themselves,
   and see the trust gate. No shared accounts, no operator-connected inboxes.
3. **Measure** per participant:
   - detected monthly/annual bleed (ledger totals)
   - detection accuracy: false positives/negatives vs. what they self-report
   - approvals given (signed receipts) and cancellations completed
   - dollars recovered (annualized, from receipts)
4. **Safety checks each week**: `/receipts` signatures all verify; no consumer
   emails or tokens in the database (`sk_receipts` payloads are the only PII);
   disconnect (`/disconnect`) leaves zero rows for that user.
5. **Exit criteria**: ≥90% detection precision on the cohort, zero unapproved
   cancellations (should be structurally impossible — verify anyway), and a
   documented $ recovered figure for the pitch.
