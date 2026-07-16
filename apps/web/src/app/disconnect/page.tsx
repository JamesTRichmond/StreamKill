import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { disconnectAccount } from "@/lib/actions";

export default async function DisconnectPage() {
  const session = await auth();
  if (!session?.verifiedEmail) redirect("/");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Disconnect your account
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
          This permanently removes everything StreamKill holds for{" "}
          <span className="font-semibold text-black dark:text-zinc-100">
            {session.verifiedEmail}
          </span>
          :
        </p>
        <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>• your account record</li>
          <li>• every scan session and leak ledger</li>
          <li>• all signed execution contracts</li>
          <li>• your current login session</li>
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          StreamKill never stored your Gmail password or a standing access token
          — those were discarded after each scan — so there is nothing else to
          erase on our side.
        </p>

        <form action={disconnectAccount} className="mt-7">
          <button
            type="submit"
            className="h-12 w-full rounded-full bg-red-600 px-6 text-base font-medium text-white transition-colors hover:bg-red-700"
          >
            Disconnect and delete my data
          </button>
        </form>

        <a
          href="/scan"
          className="mt-3 block text-center text-sm font-medium text-zinc-500 underline-offset-4 hover:underline"
        >
          Cancel
        </a>

        <p className="mt-8 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
          To also remove StreamKill from your Google account&apos;s authorized
          apps, visit{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-700 underline underline-offset-4 dark:text-zinc-300"
          >
            Google → Third-party access
          </a>
          .
        </p>
      </main>
    </div>
  );
}
