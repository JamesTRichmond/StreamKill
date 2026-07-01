import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Read-only Gmail scope. This is the whole trust model:
// Google issues a short-lived, look-only token. We never see a password,
// we never get write/delete access, and we discard the token after building
// the ledger. Cancellation is a separate, user-approved action.
export const GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: `openid email profile ${GMAIL_READONLY}`,
          // "online" access — no refresh token, nothing long-lived to store.
          access_type: "online",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Capture the access token ONLY at sign-in. It rides inside the
      // encrypted session cookie, is used once to build the ledger, and is
      // never persisted in any server-side store or database.
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
});
