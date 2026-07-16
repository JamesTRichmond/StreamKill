// Mailbox binding — the security spine of the web version.
//
// The gmail.readonly token Google issues can ONLY read the inbox of the account
// that signed in. There is no free-text email field anywhere in the app, so the
// account you log in with is the only mailbox StreamKill can ever touch.
//
// getBoundMailbox() asks Gmail itself which inbox this token belongs to. We then
// assert it matches the identity we authenticated as. If they ever disagree, we
// refuse to scan (fail closed).

const GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

export interface BoundMailbox {
  email: string;
  messagesTotal?: number;
}

export class MailboxBindingError extends Error {}

export async function getBoundMailbox(accessToken: string): Promise<BoundMailbox> {
  const res = await fetch(GMAIL_PROFILE, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    throw new MailboxBindingError("Gmail access expired or was declined. Please sign in again.");
  }
  if (!res.ok) {
    throw new MailboxBindingError(`Could not read the mailbox profile (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as { emailAddress?: string; messagesTotal?: number };
  if (!data.emailAddress) {
    throw new MailboxBindingError("Gmail did not return a mailbox address for this token.");
  }
  return { email: data.emailAddress, messagesTotal: data.messagesTotal };
}

/**
 * Enforces that the mailbox the token can actually read is the same account the
 * user authenticated as. Returns the single, canonical mailbox address that the
 * engine is allowed to scan — never anything the user typed.
 */
export async function resolveScanTarget(
  accessToken: string | undefined,
  loginEmail: string | null | undefined,
): Promise<string> {
  if (!accessToken) {
    throw new MailboxBindingError("No active Gmail access. Please sign in again.");
  }
  const bound = await getBoundMailbox(accessToken);

  if (loginEmail && bound.email.toLowerCase() !== loginEmail.toLowerCase()) {
    // The token reads a different inbox than the identity we logged in as.
    // Should be impossible with a single Google grant — refuse regardless.
    throw new MailboxBindingError("Login identity does not match the granted mailbox. Scan refused.");
  }
  return bound.email;
}
