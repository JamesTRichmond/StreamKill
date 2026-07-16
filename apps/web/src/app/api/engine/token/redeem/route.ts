import { NextResponse, type NextRequest } from "next/server";
import { handleRedeem } from "@/lib/token-redeem";

// The engine calls this to exchange a token_ref for the short-lived read-only
// Gmail token, once. Authenticated by an HMAC over the token_ref using the
// shared CONTRACT_SIGNING_SECRET. See ENGINE_CONTRACT.md §7.
export async function POST(request: NextRequest) {
  let body: { token_ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const signature = request.headers.get("x-sk-signature") ?? undefined;
  const result = handleRedeem({ tokenRef: body?.token_ref, signature });
  return NextResponse.json(result.body, { status: result.status });
}
