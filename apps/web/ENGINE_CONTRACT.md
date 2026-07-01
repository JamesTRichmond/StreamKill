# ENGINE_CONTRACT — Next.js ⇄ Python engine handoff

Authoritative spec for the `ENGINE_URL` boundary. The Next.js app (`apps/web`)
is the **issuer**; the Python engine service is the **verifier**. The engine
must match everything here byte-for-byte, and must **independently re-verify**
(never trust the web layer). This is Gate #2 — defense in depth.

Owner of issuer side: Central Command (Nazarick). Owner of verifier side: Ainz.

---

## 1. Endpoint

```
POST {ENGINE_URL}/scan
Content-Type: application/json
```

Request body:

```json
{
  "execution_contract": {
    "user_id": "uuid",
    "scan_session_id": "uuid",
    "verified_email": "owner@example.com",
    "allowed_inbox_email": "owner@example.com",
    "allowed_actions": {
      "scan_receipts": true,
      "build_ledger": true,
      "cancel_subscription": false
    },
    "expires_at": "2026-07-01T20:15:00.000Z"
  },
  "signature": "<hex hmac-sha256>",
  "connected_inbox": "owner@example.com",
  "token_ref": null
}
```

- `connected_inbox` = the inbox actually being acted on (today equals
  `allowed_inbox_email`; sent explicitly so the engine can compare, not infer).
- `token_ref` = handle for a short-lived read-only Gmail token. `null` for the
  fixture milestone; populated when the live-fetch path lands. **Never a raw
  password. Never a long-lived token.**

---

## 2. Signature (must match exactly)

`signature = HMAC_SHA256( key = CONTRACT_SIGNING_SECRET, msg = CANONICAL )`, hex.

`CANONICAL` is `JSON.stringify` of the contract with **exactly these keys, in
this order, no whitespace**, nested object also ordered:

```
{"allowed_actions":{"build_ledger":<bool>,"cancel_subscription":<bool>,"scan_receipts":<bool>},"allowed_inbox_email":<str>,"expires_at":<str>,"scan_session_id":<str>,"user_id":<str>,"verified_email":<str>}
```

Notes that make or break byte-parity:
- Keys are **alphabetical** at both levels (that's the fixed order above).
- **No spaces** after `:` or `,`.
- Booleans lowercase; strings as-is (emails are **lowercased** by the issuer
  before signing — verify against lowercased values).
- Only these 6 top-level fields are hashed. Any other field in the payload is
  **excluded** from the signature.

### Python reference (matches the JS issuer byte-for-byte)

```python
import hmac, hashlib, json, os

def canonical(c: dict) -> str:
    payload = {
        "allowed_actions": {
            "build_ledger": c["allowed_actions"]["build_ledger"],
            "cancel_subscription": c["allowed_actions"]["cancel_subscription"],
            "scan_receipts": c["allowed_actions"]["scan_receipts"],
        },
        "allowed_inbox_email": c["allowed_inbox_email"],
        "expires_at": c["expires_at"],
        "scan_session_id": c["scan_session_id"],
        "user_id": c["user_id"],
        "verified_email": c["verified_email"],
    }
    # sort_keys=True + no-space separators reproduces JSON.stringify of the
    # alphabetically-ordered object above.
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)

def verify(contract: dict, signature: str) -> bool:
    secret = os.environ["CONTRACT_SIGNING_SECRET"].encode()
    expected = hmac.new(secret, canonical(contract).encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

Shared secret: env var **`CONTRACT_SIGNING_SECRET`** on both sides (the web app
falls back to `AUTH_SECRET` if unset — for the bridge, set `CONTRACT_SIGNING_SECRET`
explicitly on both so they can't drift).

---

## 3. Verification the engine MUST perform (all, in order → 403 on any fail)

1. `signature` present and valid (§2). Missing/invalid → **403** `bad_signature`.
2. `expires_at` in the future. Past → **403** `expired`.
3. Email triple all-equal, case-insensitive:
   `verified_email == allowed_inbox_email == connected_inbox`.
   Any drift → **403** `email_mismatch`.
4. `allowed_actions.scan_receipts && allowed_actions.build_ledger` → else **403**
   `action_not_allowed`.
5. `allowed_actions.cancel_subscription` MUST be `false`. If ever `true` →
   **403** `cancel_not_allowed` (no cancel path exists yet).

Only if all pass: run the detector against `allowed_inbox_email` and return the
ledger.

---

## 4. Success response (200)

The engine returns the ledger in this exact shape (what the web UI renders):

```json
{
  "items": [
    { "service": "YouTube Premium", "amount": 13.99, "cadence": "monthly",
      "lastSeen": "2026-06-28", "confidence": "high",
      "status": "safe_to_cancel", "cancelUrl": "https://..." }
  ],
  "monthlyTotal": 80.78,
  "annualTotal": 969.36
}
```

- `cadence`: `"monthly" | "annual"`
- `confidence`: `"high" | "medium" | "low"`
- `status`: `"safe_to_cancel" | "review" | "blocked"`
- `cancelUrl`: optional.

**Milestone order:** return the fixture ledger first (proves the boundary +
both gates). Then swap in the live Gmail receipt fetch behind `token_ref`.

---

## 5. Errors

- Any refusal → HTTP **403**, body `{ "error": "<code>" }` with a code from §3.
  The web client maps 403 → `ExecutionRefused` and shows the refusal screen.
- Unexpected failure → 5xx (web client shows a generic "engine unreachable").

## 6. Out of scope (do not build)

Cancellation, pricing, white-label, ZIP flow. `cancel_subscription` stays
`false`; there is no cancel endpoint.
