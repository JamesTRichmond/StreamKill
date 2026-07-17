import { describe, it, expect, beforeEach } from "vitest";
import {
  mintTokenRef,
  tokenRefForSession,
  redeemTokenRef,
  resetVaultForTests,
} from "@/lib/token-vault";

const TOKEN = "ya29.a0-fake-readonly-access-token";

beforeEach(async () => { await resetVaultForTests(); });

describe("token vault — single-use, TTL-bounded Gmail token handles", () => {
  it("mints an opaque handle and redeems it exactly once", async () => {
    const ref = await mintTokenRef("sess-1", TOKEN);
    expect(ref).toMatch(/^skref_/);
    expect(await redeemTokenRef(ref)).toBe(TOKEN);
    // single use — a second redemption fails
    expect(await redeemTokenRef(ref)).toBeUndefined();
  });

  it("exposes the live handle for a session, then nothing after it is consumed", async () => {
    const ref = await mintTokenRef("sess-1", TOKEN);
    expect(await tokenRefForSession("sess-1")).toBe(ref);
    await redeemTokenRef(ref);
    expect(await tokenRefForSession("sess-1")).toBeUndefined();
  });

  it("expires a handle after its TTL (never redeemable once stale)", async () => {
    const ref = await mintTokenRef("sess-1", TOKEN, 0); // already at the edge of its TTL
    expect(await tokenRefForSession("sess-1")).toBeUndefined();
    expect(await redeemTokenRef(ref)).toBeUndefined();
  });

  it("keeps only one live handle per session — re-minting invalidates the prior", async () => {
    const first = await mintTokenRef("sess-1", "token-A");
    const second = await mintTokenRef("sess-1", "token-B");
    expect(second).not.toBe(first);
    expect(await redeemTokenRef(first)).toBeUndefined(); // old handle killed
    expect(await redeemTokenRef(second)).toBe("token-B");
  });

  it("isolates sessions — one session's handle never yields another's token", async () => {
    const a = await mintTokenRef("sess-A", "token-A");
    const b = await mintTokenRef("sess-B", "token-B");
    expect(await redeemTokenRef(a)).toBe("token-A");
    expect(await redeemTokenRef(b)).toBe("token-B");
  });

  it("returns undefined for an unknown handle", async () => {
    expect(await redeemTokenRef("skref_does-not-exist")).toBeUndefined();
  });
});
