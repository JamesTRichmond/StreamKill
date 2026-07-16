"use server";

import { auth, signOut } from "@/auth";
import { deleteUserData } from "@/lib/store";

// Completely disconnect the logged-in account: wipe all StreamKill data for the
// user, then end the session. After this, StreamKill holds nothing about them.
export async function disconnectAccount() {
  const session = await auth();
  if (session?.userId) {
    deleteUserData(session.userId);
  }
  // Clears the session cookie and redirects to the landing page with a notice.
  await signOut({ redirectTo: "/?disconnected=1" });
}
