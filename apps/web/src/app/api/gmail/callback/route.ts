import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { connectGmail } from "@/lib/google-oauth";
import { getUserById, createScanSession, saveContract } from "@/lib/store";
import { issueContract } from "@/lib/contract";
import { mintTokenRef } from "@/lib/token-vault";

// The gate. After the customer connects a Gmail account, we read the granted
// inbox address and compare it to their verified login email:
//   match    -> create scan_session + signed execution_contract, go to /ledger
//   mismatch -> block, no scan_session, no contract.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.userId || !session.verifiedEmail) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get("sk_gmail_state")?.value;
  const redirectUri = `${url.origin}/api/gmail/callback`;

  const clearState = (res: NextResponse) => {
    res.cookies.delete("sk_gmail_state");
    return res;
  };

  // CSRF: state must round-trip.
  if (!code || !state || !cookieState || state !== cookieState) {
    return clearState(NextResponse.redirect(new URL("/scan?error=oauth", request.url)));
  }

  let grantedEmail: string;
  let accessToken: string;
  try {
    ({ email: grantedEmail, accessToken } = await connectGmail({ code, redirectUri }));
  } catch {
    return clearState(NextResponse.redirect(new URL("/scan?error=connect", request.url)));
  }

  const user = await getUserById(session.userId);
  if (!user) {
    return clearState(NextResponse.redirect(new URL("/", request.url)));
  }

  // HARD INVARIANT: connected inbox must equal the verified login email.
  if (grantedEmail.toLowerCase() !== user.verified_email.toLowerCase()) {
    const to = new URL("/scan/blocked", request.url);
    to.searchParams.set("inbox", grantedEmail);
    return clearState(NextResponse.redirect(to));
  }

  // Match — issue the scan_session and the signed execution_contract.
  const scanSession = await createScanSession(user);
  // Mint a single-use, TTL-bounded handle for the read-only token so the engine
  // can do the live receipt fetch at scan time. The raw token never touches
  // disk or the browser; only this opaque handle (token_ref) travels onward.
  await mintTokenRef(scanSession.id, accessToken);
  const signed = issueContract(scanSession, grantedEmail);
  await saveContract(signed);

  const to = new URL("/ledger", request.url);
  to.searchParams.set("session", scanSession.id);
  return clearState(NextResponse.redirect(to));
}
