import { describe, it, expect, beforeEach } from "vitest";
import {
  mintTokenRef,
  tokenRefForSession,
  redeemTokenRef,
  resetVaultForTests,
} from "@/lib/token-vault";

const TOKEN = "ya29.a0-fake-readonly-access-token";

beforeEach(() => resetVaultForTests());

describe("token vault — single-use, TTL-bounded Gmail token handles", () => {
  it("mints an opaque handle and redeems it exactly once", () => {
    const ref = mintTokenRef("sess-1", TOKEN);
    expect(ref).toMatch(/^skref_/);
    expect(redeemTokenRef(ref)).toBe(TOKEN);
    // single use — a second redemption fails
    expect(redeemTokenRef(ref)).toBeUndefined();
  });

  it("exposes the live handle for a session, then nothing after it is consumed", () => {
    const ref = mintTokenRef("sess-1", TOKEN);
    expect(tokenRefForSession("sess-1")).toBe(ref);
    redeemTokenRef(ref);
    expect(tokenRefForSession("sess-1")).toBeUndefined();
  });

  it("expires a handle after its TTL (never redeemable once stale)", () => {
    const ref = mintTokenRef("sess-1", TOKEN, 0); // already at the edge of its TTL
    expect(tokenRefForSession("sess-1")).toBeUndefined();
    expect(redeemTokenRef(ref)).toBeUndefined();
  });

  it("keeps only one live handle per session — re-minting invalidates the prior", () => {
    const first = mintTokenRef("sess-1", "token-A");
    const second = mintTokenRef("sess-1", "token-B");
    expect(second).not.toBe(first);
    expect(redeemTokenRef(first)).toBeUndefined(); // old handle killed
    expect(redeemTokenRef(second)).toBe("token-B");
  });

  it("isolates sessions — one session's handle never yields another's token", () => {
    const a = mintTokenRef("sess-A", "token-A");
    const b = mintTokenRef("sess-B", "token-B");
    expect(redeemTokenRef(a)).toBe("token-A");
    expect(redeemTokenRef(b)).toBe("token-B");
  });

  it("returns undefined for an unknown handle", () => {
    expect(redeemTokenRef("skref_does-not-exist")).toBeUndefined();
  });
});
