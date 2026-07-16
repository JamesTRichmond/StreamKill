import { describe, it, expect } from "vitest";
import { issueContract, sign, verifySignature, isExpired } from "@/lib/contract";
import type { ExecutionContract, ScanSession, SignedContract } from "@/lib/store";

const OWNER = "james@gmail.com";

function session(over: Partial<ScanSession> = {}): ScanSession {
  return {
    id: "sess-1",
    user_id: "user-1",
    verified_email: OWNER,
    status: "ready",
    created_at: new Date().toISOString(),
    ...over,
  };
}

describe("execution contract — signing + invariants", () => {
  it("issues a valid, verifiable contract when verified email === inbox", () => {
    const signed = issueContract(session(), OWNER);
    expect(verifySignature(signed)).toBe(true);
    expect(signed.contract.allowed_actions.cancel_subscription).toBe(false);
    expect(signed.contract.verified_email).toBe(OWNER);
    expect(isExpired(signed.contract)).toBe(false);
  });

  it("refuses to issue a contract when verified email !== connected inbox", () => {
    expect(() => issueContract(session(), "someone-else@gmail.com")).toThrow();
  });

  it("normalizes email casing at issue time", () => {
    const signed = issueContract(session({ verified_email: "James@Gmail.com" }), "JAMES@gmail.com");
    expect(signed.contract.verified_email).toBe(OWNER);
    expect(signed.contract.allowed_inbox_email).toBe(OWNER);
  });

  it("detects tampering — mutating any field invalidates the signature", () => {
    const signed = issueContract(session(), OWNER);
    const tampered: SignedContract = {
      ...signed,
      contract: {
        ...signed.contract,
        allowed_actions: { ...signed.contract.allowed_actions, cancel_subscription: true },
      },
    };
    expect(verifySignature(tampered)).toBe(false);
  });

  it("rejects a garbage signature", () => {
    const signed = issueContract(session(), OWNER);
    expect(verifySignature({ ...signed, signature: "deadbeef" })).toBe(false);
  });

  it("produces a stable signature regardless of key order (canonical JSON)", () => {
    const base = issueContract(session(), OWNER).contract;
    const reordered: ExecutionContract = {
      expires_at: base.expires_at,
      allowed_actions: {
        cancel_subscription: base.allowed_actions.cancel_subscription,
        scan_receipts: base.allowed_actions.scan_receipts,
        build_ledger: base.allowed_actions.build_ledger,
      },
      verified_email: base.verified_email,
      user_id: base.user_id,
      scan_session_id: base.scan_session_id,
      allowed_inbox_email: base.allowed_inbox_email,
    };
    expect(sign(reordered)).toBe(sign(base));
  });

  it("isExpired is true once past expires_at", () => {
    const expired: ExecutionContract = {
      user_id: "u",
      scan_session_id: "s",
      verified_email: "a@b.co",
      allowed_inbox_email: "a@b.co",
      allowed_actions: { scan_receipts: true, build_ledger: true, cancel_subscription: false },
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isExpired(expired)).toBe(true);
  });
});
