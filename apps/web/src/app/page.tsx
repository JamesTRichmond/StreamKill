import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/ledger");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-xl">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">
          StreamKill
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50">
          Find the money quietly leaking out of your accounts.
        </h1>
        <p className="mt-4 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          StreamKill scans your inbox for forgotten subscriptions, ranks what
          you&apos;re paying, and hands you the kill switch — you pull it.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/ledger" });
          }}
          className="mt-8"
        >
          <button
            type="submit"
            className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-black px-6 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:w-auto"
          >
            <span className="inline-block h-5 w-5 rounded-full bg-white text-center text-sm font-bold leading-5 text-black dark:bg-black dark:text-white">
              G
            </span>
            Sign in with Google
          </button>
        </form>

        <ul className="mt-10 space-y-3 border-t border-zinc-200 pt-8 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <li>
            <span className="font-semibold text-black dark:text-zinc-100">
              Read-only.
            </span>{" "}
            We get look-only access to find subscription receipts. We never see
            your password and can&apos;t change or delete anything.
          </li>
          <li>
            <span className="font-semibold text-black dark:text-zinc-100">
              Nothing stored.
            </span>{" "}
            Google hands us a temporary token, we build your ledger, then throw
            the access away.
          </li>
          <li>
            <span className="font-semibold text-black dark:text-zinc-100">
              You stay in control.
            </span>{" "}
            Scanning is not canceling. Nothing gets canceled without your
            explicit, per-item approval.
          </li>
        </ul>
      </main>
    </div>
  );
}
