import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { upsertUser } from "@/lib/store";

// Identity sign-in ONLY. This proves who the customer is (verified_email) and
// creates their user record. It deliberately does NOT request Gmail access —
// inbox access is a separate "Connect your Gmail" step (see lib/google-oauth.ts
// and /api/gmail/*). Keeping identity and inbox grant apart is what lets us
// catch a login that tries to connect a different mailbox.
export const { handlers, signIn, signOut, auth } = NextAuth({
  // Required when self-hosting (non-Vercel): trust the deployment host so
  // Auth.js will serve /api/auth/* behind streamkill.ai or localhost.
  trustHost: true,
  providers: [
    Google({
      authorization: { params: { scope: "openid email profile" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile?.email) {
        const user = upsertUser({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: profile.email,
        });
        token.userId = user.id;
        token.verifiedEmail = user.verified_email;
      }
      return token;
    },
    async session({ session, token }) {
      const userId = token.userId as string | undefined;
      const verifiedEmail = token.verifiedEmail as string | undefined;
      if (userId) session.userId = userId;
      if (verifiedEmail) {
        session.verifiedEmail = verifiedEmail;
        if (session.user) session.user.email = verifiedEmail;
      }
      return session;
    },
  },
});
