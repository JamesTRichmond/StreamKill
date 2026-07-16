import "server-only";
import { getBoundMailbox } from "@/lib/gmail";

// Standalone Google OAuth for the "Connect your Gmail" step. This is separate
// from the identity sign-in (NextAuth) on purpose: signing in proves who you
// are (verified_email); connecting Gmail grants read-only inbox access. Keeping
// them separate is what lets us catch the case where someone signs in as one
// account but tries to connect a different inbox.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

function clientId(): string {
  const id = process.env.AUTH_GOOGLE_ID;
  if (!id) throw new Error("AUTH_GOOGLE_ID is not set.");
  return id;
}
function clientSecret(): string {
  const s = process.env.AUTH_GOOGLE_SECRET;
  if (!s) throw new Error("AUTH_GOOGLE_SECRET is not set.");
  return s;
}

export function buildGmailAuthUrl(params: { state: string; redirectUri: string }): string {
  const q = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: `openid email ${GMAIL_READONLY}`,
    // "online" — no refresh token, nothing long-lived to store.
    access_type: "online",
    // Let the user pick which account to connect. This is exactly how a
    // mismatch happens — and how our gate proves it blocks one.
    prompt: "select_account consent",
    include_granted_scopes: "false",
    state: params.state,
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

export async function exchangeCodeForToken(params: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code: params.code,
      grant_type: "authorization_code",
      redirect_uri: params.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access token returned by Google.");
  return data.access_token;
}

/**
 * Complete the connect step: exchange the code, read the granted inbox address
 * from Gmail, and return both the address and the short-lived read-only token.
 *
 * The token is handed to the caller so it can be minted into a single-use,
 * TTL-bounded handle for the scan (see lib/token-vault.ts). It is never
 * persisted to disk and never sent to the browser.
 */
export async function connectGmail(params: {
  code: string;
  redirectUri: string;
}): Promise<{ email: string; accessToken: string }> {
  const accessToken = await exchangeCodeForToken(params);
  const mailbox = await getBoundMailbox(accessToken);
  return { email: mailbox.email, accessToken };
}

/**
 * Back-compat: return just the granted inbox address (token discarded).
 */
export async function readGrantedInbox(params: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  return (await connectGmail(params)).email;
}
