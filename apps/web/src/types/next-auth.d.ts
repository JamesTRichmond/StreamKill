import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    userId?: string;
    verifiedEmail?: string;
    user?: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    verifiedEmail?: string;
  }
}
