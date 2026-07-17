import "server-only";
import crypto from "node:crypto";

// Proof receipts — the Kill Room's paper trail.
//
// Every cancellation approval is recorded as a signed receipt at the moment of
// consent, before the user is sent to the service's official cancel page. The
// receipt is HMAC-signed (same secret discipline as the execution contract) so
// it is tamper-evident: StreamKill can always prove exactly what the owner
// approved, and when. Approval is per item, per scan session — never blanket.

export type ReceiptAction = "approved_cancellation";

export interface ProofReceipt {
  id: string;
  user_id: string;
  scan_session_id: string;
  verified_email: string;
  service: string;
  amount: number;
  cadence: "monthly" | "annual";
  action: ReceiptAction;
  cancel_url: string;
  approved_at: string; // ISO
}

export interface SignedReceipt {
  receipt: ProofReceipt;
  signature: string;
}

function signingSecret(): string {
  const secret = process.env.CONTRACT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (!secret) throw new Error("CONTRACT_SIGNING_SECRET/AUTH_SECRET is not set.");
  return secret;
}

// Canonical JSON: fixed alphabetical key order, no whitespace — same discipline
// as the execution contract, so signatures are stable across serializers.
function canonical(r: ProofReceipt): string {
  return JSON.stringify({
    action: r.action,
    amount: r.amount,
    approved_at: r.approved_at,
    cadence: r.cadence,
    cancel_url: r.cancel_url,
    id: r.id,
    scan_session_id: r.scan_session_id,
    service: r.service,
    user_id: r.user_id,
    verified_email: r.verified_email,
  });
}

export function signReceipt(receipt: ProofReceipt): string {
  return crypto.createHmac("sha256", signingSecret()).update(canonical(receipt)).digest("hex");
}

export function verifyReceipt(signed: SignedReceipt): boolean {
  let expected: string;
  try {
    expected = signReceipt(signed.receipt);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(signed.signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueApprovalReceipt(input: {
  userId: string;
  scanSessionId: string;
  verifiedEmail: string;
  service: string;
  amount: number;
  cadence: "monthly" | "annual";
  cancelUrl: string;
}): SignedReceipt {
  const receipt: ProofReceipt = {
    id: `rcpt_${crypto.randomUUID()}`,
    user_id: input.userId,
    scan_session_id: input.scanSessionId,
    verified_email: input.verifiedEmail.toLowerCase(),
    service: input.service,
    amount: input.amount,
    cadence: input.cadence,
    action: "approved_cancellation",
    cancel_url: input.cancelUrl,
    approved_at: new Date().toISOString(),
  };
  return { receipt, signature: signReceipt(receipt) };
}
