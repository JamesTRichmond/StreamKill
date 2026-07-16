# Deploy persistence — the one real prod gap

The MVP store (`src/lib/store.ts`) writes a JSON file. That's fine for local dev
and a single always-on Node host, but **it will not work on Vercel serverless**:
the filesystem is read-only/ephemeral and each request may hit a different instance,
so users / scan_sessions / contracts would vanish or desync.

`store.ts` is already interface-shaped (upsertUser, createScanSession,
getScanSession, latestReadySession, saveContract, getContract), so the swap is
a drop-in backend — no callers change.

## Recommendation
**Postgres** via Neon or Vercel Postgres (managed, serverless-friendly). Turso
(libSQL/SQLite) is a fine lighter alternative. Either way: still **no
credentials stored** — only identity/session records.

## Schema (3 tables)
```sql
create table users (
  id text primary key,
  verified_email text unique not null,
  auth_provider text not null,
  auth_provider_user_id text not null,
  created_at timestamptz not null default now(),
  unique (auth_provider, auth_provider_user_id)
);

create table scan_sessions (
  id text primary key,
  user_id text not null references users(id),
  verified_email text not null,
  status text not null,            -- ready | blocked | consumed
  created_at timestamptz not null default now()
);

create table contracts (
  scan_session_id text primary key references scan_sessions(id),
  contract jsonb not null,         -- the execution_contract
  signature text not null          -- hmac; NOT a credential
);
```

## When
Not blocking the live local test. Do this as part of the **streamkill.ai deploy**
step, after the OAuth flow is proven locally. Set `STREAMKILL_DATA_DIR` /
`DATABASE_URL` in Vercel env; keep the file-store as the dev default.
