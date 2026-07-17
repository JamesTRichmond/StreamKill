import "server-only";
import type { LeakItem } from "@/lib/ledger";
import type { ScanSession, User } from "@/lib/store";
import { receiptForItem, saveReceipt } from "@/lib/store";
import { issueApprovalReceipt, type SignedReceipt } from "@/lib/proof";

// The Kill Room approval core (guided path).
//
// Rules enforced HERE, server-side — not just by disabled buttons:
//   1. Approval is per item, per scan session. Never blanket.
//   2. Blocked ("Do not auto-kill") items cannot be approved at all.
//   3. The cancel destination comes from the engine's ledger, never user input.
//   4. Approving is idempotent — one receipt per item per session.
//
// The automated engine path (browser automation) is NOT wired; that remains
// behind lib/engine.cancelSubscription's not_implemented guard. When it lands,
// it must consume these same receipts as its authorization input.

export class ApprovalRefused extends Error {
  readonly code: "blocked_item" | "no_cancel_route" | "not_owner";
  constructor(code: "blocked_item" | "no_cancel_route" | "not_owner", message: string) {
    super(message);
    this.code = code;
  }
}

export async function approveCancellation(input: {
  user: User;
  scan: ScanSession;
  item: LeakItem;
}): Promise<SignedReceipt> {
  const { user, scan, item } = input;

  if (scan.user_id !== user.id) {
    throw new ApprovalRefused("not_owner", "This scan session does not belong to the signed-in user.");
  }
  if (item.status === "blocked") {
    throw new ApprovalRefused(
      "blocked_item",
      `${item.service} is protected (do-not-auto-kill) and cannot be approved for cancellation.`,
    );
  }
  if (!item.cancelUrl) {
    throw new ApprovalRefused("no_cancel_route", `${item.service} has no known cancellation route.`);
  }

  const existing = await receiptForItem(scan.id, item.service);
  if (existing) return existing;

  const signed = issueApprovalReceipt({
    userId: user.id,
    scanSessionId: scan.id,
    verifiedEmail: scan.verified_email,
    service: item.service,
    amount: item.amount,
    cadence: item.cadence,
    cancelUrl: item.cancelUrl,
  });
  await saveReceipt(signed);
  return signed;
}
