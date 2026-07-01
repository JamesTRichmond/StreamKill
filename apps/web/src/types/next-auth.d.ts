import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    // Short-lived Gmail read-only token, present only for the current session.
    accessToken?: string;
    user?: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
  }
}
