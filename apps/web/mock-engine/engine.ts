// Mock StreamKill engine — an INDEPENDENT implementation of the ENGINE_URL
// verifier (Gate #2). It deliberately re-implements canonicalization + HMAC
// verification rather than importing the web app's code, exactly as the real
// Python engine does: the whole point of defense-in-depth is that the verifier
// does not trust (or share code with) the issuer.
//
// Spec: apps/web/ENGINE_CONTRACT.md. Schemas: apps/web/contract/*.schema.json.

import crypto from "node:crypto";
import type { ExecutionContract, SignedContract } from "../src/lib/store";
import type { Ledger, LeakItem } from "../src/lib/ledger";

export type RefusalCode =
  | "bad_signature"
  | "expired"
  | "email_mismatch"
  | "action_not_allowed"
  | "cancel_not_allowed";

// §2 — canonical form: fixed key order, no whitespace. Must match the issuer
// (apps/web/src/lib/contract.ts `canonical`) byte-for-byte.
export function canonical(contract: ExecutionContract): string {
  return JSON.stringify({
    allowed_actions: {
      build_ledger: contract.allowed_actions.build_ledger,
      cancel_subscription: contract.allowed_actions.cancel_subscription,
      scan_receipts: contract.allowed_actions.scan_receipts,
    },
    allowed_inbox_email: contract.allowed_inbox_email,
    expires_at: contract.expires_at,
    scan_session_id: contract.scan_session_id,
    user_id: contract.user_id,
    verified_email: contract.verified_email,
  });
}

export function signContract(contract: ExecutionContract, secret: string): string {
  return crypto.createHmac("sha256", secret).update(canonical(contract)).digest("hex");
}

function signatureValid(signed: SignedContract, secret: string): boolean {
  const expected = signContract(signed.contract, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signed.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// §3 — the checks the engine MUST perform, in order. First failure wins.
export function verify(
  signed: SignedContract,
  connectedInbox: string,
  secret: string,
): { ok: true } | { ok: false; code: RefusalCode } {
  if (!signatureValid(signed, secret)) return { ok: false, code: "bad_signature" };

  if (Date.now() > Date.parse(signed.contract.expires_at)) {
    return { ok: false, code: "expired" };
  }

  const { verified_email, allowed_inbox_email } = signed.contract;
  const v = verified_email.toLowerCase();
  const a = allowed_inbox_email.toLowerCase();
  const c = connectedInbox.toLowerCase();
  if (v !== a || a !== c) return { ok: false, code: "email_mismatch" };

  const { scan_receipts, build_ledger, cancel_subscription } = signed.contract.allowed_actions;
  if (!scan_receipts || !build_ledger) return { ok: false, code: "action_not_allowed" };
  if (cancel_subscription) return { ok: false, code: "cancel_not_allowed" };

  return { ok: true };
}

// §4 — fixture ledger. Mirrors the verified demo bleed ($80.78/mo, $969.36/yr).
// Totals are the recoverable (non-blocked) bleed; the blocked row is shown for
// the safety tier but excluded from the totals, matching the demo provenance.
const FIXTURE_ITEMS: LeakItem[] = [
  { service: "YouTube Premium", amount: 13.99, cadence: "monthly", lastSeen: "2026-06-28", confidence: "high", status: "safe_to_cancel", cancelUrl: "https://www.youtube.com/paid_memberships" },
  { service: "Netflix", amount: 15.49, cadence: "monthly", lastSeen: "2026-06-14", confidence: "high", status: "safe_to_cancel", cancelUrl: "https://www.netflix.com/cancelplan" },
  { service: "Spotify Premium", amount: 11.99, cadence: "monthly", lastSeen: "2026-06-02", confidence: "high", status: "safe_to_cancel", cancelUrl: "https://www.spotify.com/account/subscription/" },
  { service: "Hulu", amount: 9.99, cadence: "monthly", lastSeen: "2026-06-05", confidence: "high", status: "safe_to_cancel", cancelUrl: "https://secure.hulu.com/account/cancel" },
  { service: "Disney+", amount: 13.33, cadence: "monthly", lastSeen: "2026-06-01", confidence: "medium", status: "safe_to_cancel", cancelUrl: "https://www.disneyplus.com/account/subscription" },
  { service: "Audible", amount: 15.99, cadence: "monthly", lastSeen: "2026-06-22", confidence: "high", status: "review" },
  { service: "iCloud+ 2TB", amount: 9.99, cadence: "monthly", lastSeen: "2026-06-30", confidence: "high", status: "blocked" },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const RECOVERABLE = FIXTURE_ITEMS.filter((i) => i.status !== "blocked");
const MONTHLY_TOTAL = round2(RECOVERABLE.reduce((s, i) => s + i.amount, 0));

export const FIXTURE_LEDGER: Ledger = {
  items: FIXTURE_ITEMS.map((i) => ({ ...i })),
  monthlyTotal: MONTHLY_TOTAL,
  annualTotal: round2(MONTHLY_TOTAL * 12),
};

export interface ScanResult {
  status: number;
  body: Ledger | { error: RefusalCode | "bad_request" };
}

// Turn a raw request body into a response per §3/§4/§5. Pure and synchronous so
// it can be unit-tested directly and reused by the HTTP server.
export function handleScan(rawBody: unknown, opts: { secret: string }): ScanResult {
  const body = rawBody as {
    execution_contract?: ExecutionContract;
    signature?: string;
    connected_inbox?: string;
  } | null;

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.signature !== "string" ||
    typeof body.connected_inbox !== "string" ||
    !body.execution_contract ||
    typeof body.execution_contract !== "object"
  ) {
    return { status: 400, body: { error: "bad_request" } };
  }

  const signed: SignedContract = { contract: body.execution_contract, signature: body.signature };
  const result = verify(signed, body.connected_inbox, opts.secret);
  if (!result.ok) return { status: 403, body: { error: result.code } };

  return { status: 200, body: FIXTURE_LEDGER };
}
