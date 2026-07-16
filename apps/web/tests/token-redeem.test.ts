import { describe, it, expect, beforeEach } from "vitest";
import { handleRedeem, redeemSignature } from "@/lib/token-redeem";
import { mintTokenRef, resetVaultForTests } from "@/lib/token-vault";

// Matches vitest env CONTRACT_SIGNING_SECRET.
const SECRET = "test-signing-secret";
const TOKEN = "fake-readonly-access-token-value";

function sign(ref: string): string {
  return redeemSignature(ref, SECRET);
}

beforeEach(() => resetVaultForTests());

describe("engine token redemption endpoint (ENGINE_CONTRACT §7)", () => {
  it("returns the token once for a valid, correctly-signed request", () => {
    const ref = mintTokenRef("sess-1", TOKEN);
    const res = handleRedeem({ tokenRef: ref, signature: sign(ref) });
    expect(res).toEqual({ status: 200, body: { access_token: TOKEN } });
  });

  it("is single-use — a second redemption is 410", () => {
    const ref = mintTokenRef("sess-1", TOKEN);
    handleRedeem({ tokenRef: ref, signature: sign(ref) });
    expect(handleRedeem({ tokenRef: ref, signature: sign(ref) })).toMatchObject({ status: 410 });
  });

  it("rejects an unsigned or wrongly-signed request with 401 (no token leaks)", () => {
    const ref = mintTokenRef("sess-1", TOKEN);
    expect(handleRedeem({ tokenRef: ref, signature: "deadbeef" })).toMatchObject({ status: 401 });
    // token must still be redeemable afterward — a bad auth attempt does not consume it
    expect(handleRedeem({ tokenRef: ref, signature: sign(ref) })).toMatchObject({ status: 200 });
  });

  it("rejects a request signed with the wrong secret (401)", () => {
    const ref = mintTokenRef("sess-1", TOKEN);
    expect(handleRedeem({ tokenRef: ref, signature: redeemSignature(ref, "attacker-secret") })).toMatchObject({
      status: 401,
    });
  });

  it("400 on a malformed body", () => {
    expect(handleRedeem({}).status).toBe(400);
    expect(handleRedeem({ tokenRef: 123, signature: "x" }).status).toBe(400);
  });

  it("410 for an unknown / expired handle (correctly signed)", () => {
    const ref = "skref_never-minted";
    expect(handleRedeem({ tokenRef: ref, signature: sign(ref) })).toMatchObject({ status: 410 });
  });
});
