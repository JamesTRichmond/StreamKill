import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

const ERRORS: Record<string, string> = {
  oauth: "That connection attempt couldn't be verified. Please try again.",
  connect: "We couldn't read the connected inbox. Please try again.",
};

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.verifiedEmail) redirect("/");
  const { error } = await searchParams;
  const notice = error ? ERRORS[error] : undefined;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-xl">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">
          Start a Scan
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Connect the inbox you want scanned
        </h1>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500">You&apos;re verified as</p>
          <p className="mt-1 text-lg font-semibold text-black dark:text-zinc-50">
            {session.verifiedEmail}
          </p>
        </div>

        <p className="mt-6 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
          Next, connect your Gmail. StreamKill will only run on{" "}
          <span className="font-semibold text-black dark:text-zinc-100">
            this exact account
          </span>
          . If you connect a different inbox, we&apos;ll stop and ask you to use
          the verified one — that&apos;s the whole safety model.
        </p>

        {notice ? (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            {notice}
          </div>
        ) : null}

        <a
          href="/api/gmail/connect"
          className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-black px-6 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:w-auto"
        >
          <span className="inline-block h-5 w-5 rounded-full bg-white text-center text-sm font-bold leading-5 text-black dark:bg-black dark:text-white">
            G
          </span>
          Connect Gmail (read-only)
        </a>

        <div className="mt-8 flex items-center gap-4">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="text-sm font-medium text-zinc-500 underline-offset-4 hover:underline"
            >
              Not you? Sign out
            </button>
          </form>
          <a
            href="/disconnect"
            className="text-sm font-medium text-red-600 underline-offset-4 hover:underline"
          >
            Disconnect account
          </a>
        </div>
      </main>
    </div>
  );
}
