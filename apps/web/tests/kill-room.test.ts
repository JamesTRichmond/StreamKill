import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { approveCancellation, ApprovalRefused } from "@/lib/kill-room";
import { verifyReceipt, issueApprovalReceipt } from "@/lib/proof";
import { receiptsForUser, receiptForItem, deleteUserData, type ScanSession, type User } from "@/lib/store";
import type { LeakItem } from "@/lib/ledger";

// Each test file gets its own data dir: vitest runs files in parallel workers,
// and a shared JSON store would let one file's cleanup race another's writes.
process.env.STREAMKILL_DATA_DIR = path.join(
  os.tmpdir(),
  `sk-test-${path.basename(__filename ?? "x").replace(/\W/g, "-")}-${process.pid}`,
);
const DATA_FILE = path.join(process.env.STREAMKILL_DATA_DIR, "streamkill.json");

beforeEach(() => {
  try {
    fs.rmSync(DATA_FILE);
  } catch {
    // fresh run
  }
});

const user: User = {
  id: "user-1",
  verified_email: "james@gmail.com",
  auth_provider: "google",
  auth_provider_user_id: "gid-1",
  created_at: new Date().toISOString(),
};

const scan: ScanSession = {
  id: "sess-1",
  user_id: "user-1",
  verified_email: "james@gmail.com",
  status: "ready",
  created_at: new Date().toISOString(),
};

function item(over: Partial<LeakItem> = {}): LeakItem {
  return {
    service: "Netflix",
    amount: 15.49,
    cadence: "monthly",
    lastSeen: "2026-06-14",
    confidence: "high",
    status: "safe_to_cancel",
    cancelUrl: "https://www.netflix.com/cancelplan",
    ...over,
  };
}

describe("Kill Room — per-item approval with signed proof", () => {
  it("records a signed, verifiable receipt at the moment of approval", async () => {
    const signed = await approveCancellation({ user, scan, item: item() });
    expect(signed.receipt.service).toBe("Netflix");
    expect(signed.receipt.action).toBe("approved_cancellation");
    expect(verifyReceipt(signed)).toBe(true);
    expect(await receiptsForUser(user.id)).toHaveLength(1);
  });

  it("refuses to approve a blocked (do-not-auto-kill) item — server-side, not just UI", async () => {
    await expect(
      approveCancellation({ user, scan, item: item({ status: "blocked" }) }),
    ).rejects.toThrowError(ApprovalRefused);
    expect(await receiptsForUser(user.id)).toHaveLength(0);
  });

  it("refuses when the item has no cancellation route", async () => {
    await expect(
      approveCancellation({ user, scan, item: item({ cancelUrl: undefined }) }),
    ).rejects.toThrowError(ApprovalRefused);
  });

  it("refuses when the scan session belongs to someone else", async () => {
    const foreignScan: ScanSession = { ...scan, user_id: "someone-else" };
    await expect(approveCancellation({ user, scan: foreignScan, item: item() })).rejects.toThrowError(
      ApprovalRefused,
    );
  });

  it("is idempotent — approving the same item twice yields one receipt", async () => {
    const first = await approveCancellation({ user, scan, item: item() });
    const second = await approveCancellation({ user, scan, item: item() });
    expect(second.receipt.id).toBe(first.receipt.id);
    expect(await receiptsForUser(user.id)).toHaveLength(1);
  });

  it("approval is per scan session — a new session needs a fresh approval", async () => {
    await approveCancellation({ user, scan, item: item() });
    const laterScan: ScanSession = { ...scan, id: "sess-2" };
    await approveCancellation({ user, scan: laterScan, item: item() });
    expect(await receiptsForUser(user.id)).toHaveLength(2);
    expect(await receiptForItem("sess-2", "Netflix")).toBeDefined();
  });

  it("tampering with a stored receipt is detectable", async () => {
    const signed = await approveCancellation({ user, scan, item: item() });
    const tampered = {
      ...signed,
      receipt: { ...signed.receipt, amount: 0.01 },
    };
    expect(verifyReceipt(tampered)).toBe(false);
  });

  it("deleteUserData wipes receipts along with everything else", async () => {
    await approveCancellation({ user, scan, item: item() });
    expect(await receiptsForUser(user.id)).toHaveLength(1);
    await deleteUserData(user.id);
    expect(await receiptsForUser(user.id)).toHaveLength(0);
  });
});

describe("proof receipts — signing discipline", () => {
  it("normalizes the email and produces a stable id + hex signature", async () => {
    const signed = issueApprovalReceipt({
      userId: "u",
      scanSessionId: "s",
      verifiedEmail: "James@Gmail.com",
      service: "Hulu",
      amount: 9.99,
      cadence: "monthly",
      cancelUrl: "https://secure.hulu.com/account/cancel",
    });
    expect(signed.receipt.verified_email).toBe("james@gmail.com");
    expect(signed.receipt.id).toMatch(/^rcpt_/);
    expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyReceipt(signed)).toBe(true);
  });
});
