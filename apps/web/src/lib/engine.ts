import "server-only";
import type { SignedContract } from "@/lib/store";
import { verifySignature, isExpired } from "@/lib/contract";
import { buildLedger, type Ledger } from "@/lib/ledger";

// Engine boundary.
//
// This is the ONLY door into execution. The real detection/cancellation engine
// lives in a private repo; this adapter is the public gate in front of it. It
// refuses to run unless a valid, signed execution_contract is present AND the
// contract's emails match the inbox actually being acted on. The private engine
// mirrors these same checks server-side (defense in depth) — its internals are
// never exposed here.

export class ExecutionRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Hard invariant: verified_email === allowed_inbox_email === the inbox we're
// about to touch. Any drift → refuse.
function enforce(signed: SignedContract | undefined, connectedInboxEmail: string): SignedContract {
  if (!signed) {
    throw new ExecutionRefused("no_contract", "Execution contract missing. Refusing to run.");
  }
  if (!verifySignature(signed)) {
    throw new ExecutionRefused("bad_signature", "Execution contract signature invalid. Refusing to run.");
  }
  if (isExpired(signed.contract)) {
    throw new ExecutionRefused("expired", "Execution contract expired. Start the scan again.");
  }
  const { verified_email, allowed_inbox_email } = signed.contract;
  const inbox = connectedInboxEmail.toLowerCase();
  if (
    verified_email.toLowerCase() !== allowed_inbox_email.toLowerCase() ||
    allowed_inbox_email.toLowerCase() !== inbox
  ) {
    throw new ExecutionRefused(
      "email_mismatch",
      "Contract email and connected inbox differ. Refusing to run.",
    );
  }
  return signed;
}

export async function runScan(
  signed: SignedContract | undefined,
  connectedInboxEmail: string,
): Promise<Ledger> {
  const ok = enforce(signed, connectedInboxEmail);
  if (!ok.contract.allowed_actions.scan_receipts || !ok.contract.allowed_actions.build_ledger) {
    throw new ExecutionRefused("action_not_allowed", "Contract does not permit scanning. Refusing to run.");
  }
  // PHASE 3: forward the contract + a fresh read-only token to the private
  // engine service (process.env.ENGINE_URL) which reads receipts and returns
  // the ledger. It re-verifies the contract before touching any mail.
  return buildLedger(ok.contract.allowed_inbox_email);
}

// Cancellation is intentionally a stub. No route exposes it yet. It refuses
// unless the contract explicitly permits cancellation (always false today) AND
// the specific item was approved by the account owner.
export async function cancelSubscription(input: {
  signed: SignedContract | undefined;
  connectedInboxEmail: string;
  itemId: string;
  approvedByOwner: boolean;
}): Promise<never> {
  const ok = enforce(input.signed, input.connectedInboxEmail);
  if (!ok.contract.allowed_actions.cancel_subscription) {
    throw new ExecutionRefused(
      "cancel_disabled",
      "Cancellation is not enabled on this contract.",
    );
  }
  if (!input.approvedByOwner) {
    throw new ExecutionRefused(
      "approval_required",
      "Per-item owner approval is required before any cancellation.",
    );
  }
  throw new ExecutionRefused("not_implemented", "Cancellation engine is not wired yet.");
}
