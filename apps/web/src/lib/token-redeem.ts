import "server-only";
import crypto from "node:crypto";
import { redeemTokenRef } from "@/lib/token-vault";

// Web-side of the token redemption protocol (ENGINE_CONTRACT §7). The engine
// POSTs a token_ref here with an HMAC over it (proving it holds the shared
// CONTRACT_SIGNING_SECRET); we return the short-lived read-only Gmail token
// exactly once. Only a caller with the secret (the engine) can redeem, and each
// handle is single-use + TTL-bounded (see lib/token-vault.ts).
//
// NOTE: implements the PROPOSED §7 protocol — the engine side must match it.

function signingSecret(): string {
  return process.env.CONTRACT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "";
}

/** HMAC-SHA256(secret, token_ref) as lowercase hex — the auth the engine sends. */
export function redeemSignature(tokenRef: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(tokenRef).digest("hex");
}

export interface RedeemResult {
  status: number;
  body: { access_token: string } | { error: string };
}

export function handleRedeem(input: { tokenRef?: unknown; signature?: unknown }): RedeemResult {
  const secret = signingSecret();
  if (!secret) return { status: 500, body: { error: "server_misconfigured" } };

  if (typeof input.tokenRef !== "string" || typeof input.signature !== "string") {
    return { status: 400, body: { error: "bad_request" } };
  }

  const expected = redeemSignature(input.tokenRef, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  const token = redeemTokenRef(input.tokenRef);
  if (!token) return { status: 410, body: { error: "token_ref_unavailable" } };

  return { status: 200, body: { access_token: token } };
}
