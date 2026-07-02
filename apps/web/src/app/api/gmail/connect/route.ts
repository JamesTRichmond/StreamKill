import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { buildGmailAuthUrl } from "@/lib/google-oauth";

// Starts the "Connect your Gmail" OAuth. Requires an already-verified login.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.verifiedEmail) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Prefer the configured public URL (AUTH_URL) so redirect_uri is stable
  // behind a proxy/tunnel; fall back to the request origin locally.
  const base = process.env.AUTH_URL ?? new URL(request.url).origin;
  const redirectUri = `${base}/api/gmail/callback`;
  const state = crypto.randomUUID();

  const res = NextResponse.redirect(buildGmailAuthUrl({ state, redirectUri }));
  res.cookies.set("sk_gmail_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
