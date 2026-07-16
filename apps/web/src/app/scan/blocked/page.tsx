import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function BlockedPage({
  searchParams,
}: {
  searchParams: Promise<{ inbox?: string }>;
}) {
  const session = await auth();
  if (!session?.verifiedEmail) redirect("/");
  const { inbox } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl dark:bg-red-950/50">
          🛑
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Scan blocked
        </h1>

        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-[15px] leading-7 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          This inbox does not match the email you used to start StreamKill. For
          your safety, StreamKill only works on the verified account owner&apos;s
          email.
        </p>

        <dl className="mt-6 space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <dt className="text-sm text-zinc-500">You verified as</dt>
            <dd className="font-medium text-black dark:text-zinc-100">
              {session.verifiedEmail}
            </dd>
          </div>
          {inbox ? (
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <dt className="text-sm text-zinc-500">Inbox you connected</dt>
              <dd className="font-medium text-red-700 dark:text-red-400">
                {inbox}
              </dd>
            </div>
          ) : null}
        </dl>

        <a
          href="/api/gmail/connect"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-black px-6 text-base font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Connect the verified account instead
        </a>
      </main>
    </div>
  );
}
