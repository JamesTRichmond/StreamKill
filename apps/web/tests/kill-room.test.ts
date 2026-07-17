import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { approveCancellation, ApprovalRefused } from "@/lib/kill-room";
import { verifyReceipt, issueApprovalReceipt } from "@/lib/proof";
import { receiptsForUser, receiptForItem, deleteUserData, type ScanSession, type User } from "@/lib/store";
import type { LeakItem } from "@/lib/ledger";

const DATA_FILE = path.join(
  process.env.STREAMKILL_DATA_DIR ?? os.tmpdir(),
  "streamkill.json",
);

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
  it("records a signed, verifiable receipt at the moment of approval", () => {
    const signed = approveCancellation({ user, scan, item: item() });
    expect(signed.receipt.service).toBe("Netflix");
    expect(signed.receipt.action).toBe("approved_cancellation");
    expect(verifyReceipt(signed)).toBe(true);
    expect(receiptsForUser(user.id)).toHaveLength(1);
  });

  it("refuses to approve a blocked (do-not-auto-kill) item — server-side, not just UI", () => {
    expect(() =>
      approveCancellation({ user, scan, item: item({ status: "blocked" }) }),
    ).toThrowError(ApprovalRefused);
    expect(receiptsForUser(user.id)).toHaveLength(0);
  });

  it("refuses when the item has no cancellation route", () => {
    expect(() =>
      approveCancellation({ user, scan, item: item({ cancelUrl: undefined }) }),
    ).toThrowError(ApprovalRefused);
  });

  it("refuses when the scan session belongs to someone else", () => {
    const foreignScan: ScanSession = { ...scan, user_id: "someone-else" };
    expect(() => approveCancellation({ user, scan: foreignScan, item: item() })).toThrowError(
      ApprovalRefused,
    );
  });

  it("is idempotent — approving the same item twice yields one receipt", () => {
    const first = approveCancellation({ user, scan, item: item() });
    const second = approveCancellation({ user, scan, item: item() });
    expect(second.receipt.id).toBe(first.receipt.id);
    expect(receiptsForUser(user.id)).toHaveLength(1);
  });

  it("approval is per scan session — a new session needs a fresh approval", () => {
    approveCancellation({ user, scan, item: item() });
    const laterScan: ScanSession = { ...scan, id: "sess-2" };
    approveCancellation({ user, scan: laterScan, item: item() });
    expect(receiptsForUser(user.id)).toHaveLength(2);
    expect(receiptForItem("sess-2", "Netflix")).toBeDefined();
  });

  it("tampering with a stored receipt is detectable", () => {
    const signed = approveCancellation({ user, scan, item: item() });
    const tampered = {
      ...signed,
      receipt: { ...signed.receipt, amount: 0.01 },
    };
    expect(verifyReceipt(tampered)).toBe(false);
  });

  it("deleteUserData wipes receipts along with everything else", () => {
    approveCancellation({ user, scan, item: item() });
    expect(receiptsForUser(user.id)).toHaveLength(1);
    deleteUserData(user.id);
    expect(receiptsForUser(user.id)).toHaveLength(0);
  });
});

describe("proof receipts — signing discipline", () => {
  it("normalizes the email and produces a stable id + hex signature", () => {
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
