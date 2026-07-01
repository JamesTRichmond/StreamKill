import "server-only";
import crypto from "node:crypto";
import type {
  ExecutionContract,
  ScanSession,
  SignedContract,
} from "@/lib/store";

// The execution_contract is the only thing the engine will act on. It is signed
// server-side (HMAC-SHA256) so the engine can prove it was issued by this app
// and was not altered in transit. The engine independently re-checks the email
// invariant before doing anything.

const SIGNING_SECRET =
  process.env.CONTRACT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "";

const CONTRACT_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Canonical JSON so the signature is stable regardless of key order.
function canonical(contract: ExecutionContract): string {
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

export function sign(contract: ExecutionContract): string {
  if (!SIGNING_SECRET) {
    throw new Error("CONTRACT_SIGNING_SECRET/AUTH_SECRET is not set.");
  }
  return crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(canonical(contract))
    .digest("hex");
}

export function verifySignature(signed: SignedContract): boolean {
  let expected: string;
  try {
    expected = sign(signed.contract);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(signed.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isExpired(contract: ExecutionContract): boolean {
  return Date.now() > Date.parse(contract.expires_at);
}

/**
 * Build a signed contract. Enforces the invariant at creation time:
 * verified_email === allowed_inbox_email. Cancellation is always false here.
 */
export function issueContract(
  scanSession: ScanSession,
  connectedInboxEmail: string,
): SignedContract {
  const verified = scanSession.verified_email.toLowerCase();
  const inbox = connectedInboxEmail.toLowerCase();
  if (verified !== inbox) {
    throw new Error("Refusing to issue contract: verified_email !== connected inbox.");
  }
  const contract: ExecutionContract = {
    user_id: scanSession.user_id,
    scan_session_id: scanSession.id,
    verified_email: verified,
    allowed_inbox_email: inbox,
    allowed_actions: {
      scan_receipts: true,
      build_ledger: true,
      cancel_subscription: false,
    },
    expires_at: new Date(Date.now() + CONTRACT_TTL_MS).toISOString(),
  };
  return { contract, signature: sign(contract) };
}
