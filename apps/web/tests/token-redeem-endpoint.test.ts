import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/engine/token/redeem/route";
import { redeemSignature } from "@/lib/token-redeem";
import { mintTokenRef, resetVaultForTests } from "@/lib/token-vault";

// Route-level coverage for the redeem endpoint (ENGINE_CONTRACT §7):
// token-redeem.test.ts unit-tests handleRedeem(); this exercises the actual
// HTTP handler the Python engine talks to — JSON parsing, the X-SK-Signature
// header, and the wire status codes.

const SECRET = "test-signing-secret"; // set for the suite in vitest.config.ts

function redeemRequest(body: unknown, signature?: string): NextRequest {
  return new NextRequest("http://localhost/api/engine/token/redeem", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature !== undefined ? { "x-sk-signature": signature } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(async () => { await resetVaultForTests(); });

describe("POST /api/engine/token/redeem (wire-level)", () => {
  it("redeems a live handle exactly once, then answers 410 on replay", async () => {
    const ref = await mintTokenRef("sess-1", "ya29.readonly-token");

    const first = await POST(redeemRequest({ token_ref: ref }, redeemSignature(ref, SECRET)));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ access_token: "ya29.readonly-token" });

    // The handle is spent — a replay (engine bug or a stolen ref) never gets
    // the token again.
    const replay = await POST(redeemRequest({ token_ref: ref }, redeemSignature(ref, SECRET)));
    expect(replay.status).toBe(410);
    expect(await replay.json()).toEqual({ error: "token_ref_unavailable" });
  });

  it("answers 410 for expired and never-minted handles alike", async () => {
    const ref = await mintTokenRef("sess-2", "tok", 1); // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10));
    const expired = await POST(redeemRequest({ token_ref: ref }, redeemSignature(ref, SECRET)));
    expect(expired.status).toBe(410);

    const ghost = "skref_never-minted";
    const unknown = await POST(redeemRequest({ token_ref: ghost }, redeemSignature(ghost, SECRET)));
    expect(unknown.status).toBe(410);
  });

  it("rejects a bad or missing X-SK-Signature without burning the handle", async () => {
    const ref = await mintTokenRef("sess-3", "tok");

    // Missing header → the body may be fine, but the request is unauthenticated.
    const missing = await POST(redeemRequest({ token_ref: ref }));
    expect(missing.status).toBe(400);

    const wrongKey = await POST(redeemRequest({ token_ref: ref }, redeemSignature(ref, "attacker-secret")));
    expect(wrongKey.status).toBe(401);
    expect(await wrongKey.json()).toEqual({ error: "unauthorized" });

    // A signature over a DIFFERENT ref must not authenticate this one.
    const crossRef = await POST(
      redeemRequest({ token_ref: ref }, redeemSignature("skref_other", SECRET)),
    );
    expect(crossRef.status).toBe(401);

    // None of those attempts consumed the handle — the legitimate engine can
    // still redeem it.
    const legit = await POST(redeemRequest({ token_ref: ref }, redeemSignature(ref, SECRET)));
    expect(legit.status).toBe(200);
    expect(await legit.json()).toEqual({ access_token: "tok" });
  });

  it("rejects malformed bodies as 400 bad_request", async () => {
    for (const body of ["not json {", {}, { token_ref: 42 }]) {
      const res = await POST(redeemRequest(body, redeemSignature("skref_x", SECRET)));
      expect(res.status).toBe(400);
    }
  });
});
