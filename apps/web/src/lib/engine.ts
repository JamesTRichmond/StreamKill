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
  opts?: { tokenRef?: string },
): Promise<Ledger> {
  // Gate #1: the web boundary. (Gate #2 is the Python engine re-verifying the
  // same contract server-side — defense in depth. See ENGINE_CONTRACT.md.)
  const ok = enforce(signed, connectedInboxEmail);
  if (!ok.contract.allowed_actions.scan_receipts || !ok.contract.allowed_actions.build_ledger) {
    throw new ExecutionRefused("action_not_allowed", "Contract does not permit scanning. Refusing to run.");
  }

  const engineUrl = process.env.ENGINE_URL;
  if (engineUrl) {
    return callEngine(engineUrl, ok, connectedInboxEmail, opts?.tokenRef);
  }
  // No engine configured (dev): local sample ledger so the UI/flow is testable
  // without the Python service running.
  return buildLedger(ok.contract.allowed_inbox_email);
}

// Client for the private Python engine service. Contract shape and error
// semantics are the authoritative spec in ENGINE_CONTRACT.md — the engine must
// match it byte-for-byte.
async function callEngine(
  baseUrl: string,
  signed: SignedContract,
  connectedInbox: string,
  tokenRef?: string,
): Promise<Ledger> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        execution_contract: signed.contract,
        signature: signed.signature,
        connected_inbox: connectedInbox,
        token_ref: tokenRef ?? null,
      }),
    });
  } catch {
    throw new ExecutionRefused("engine_unreachable", "The scan engine is unreachable. Try again shortly.");
  }
  if (res.status === 403) {
    throw new ExecutionRefused(
      "engine_refused",
      "The engine refused the contract (email mismatch, or invalid/expired contract).",
    );
  }
  if (!res.ok) {
    throw new ExecutionRefused("engine_error", `Engine returned HTTP ${res.status}.`);
  }
  return (await res.json()) as Ledger;
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
