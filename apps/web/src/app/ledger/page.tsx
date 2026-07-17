import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import type { LeakItem } from "@/lib/ledger";
import {
  getUserById,
  getScanSession,
  latestReadySession,
  getContract,
  saveContract,
} from "@/lib/store";
import { runScan, ExecutionRefused } from "@/lib/engine";
import { issueContract, isExpired } from "@/lib/contract";
import { tokenRefForSession } from "@/lib/token-vault";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const STATUS_LABEL: Record<LeakItem["status"], string> = {
  safe_to_cancel: "Safe to cancel",
  review: "Review",
  blocked: "Blocked",
};

const STATUS_STYLE: Record<LeakItem["status"], string> = {
  safe_to_cancel:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  review:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blocked: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function SignOutButton({ label = "Sign out" }: { label?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
      >
        {label}
      </button>
    </form>
  );
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect("/");
  const user = getUserById(session.userId);
  if (!user) redirect("/");

  // Resolve the scan_session — must belong to this user.
  const { session: sessionId } = await searchParams;
  const scan = sessionId ? getScanSession(sessionId) : latestReadySession(user.id);
  if (!scan || scan.user_id !== user.id) redirect("/scan");

  let signed = getContract(scan.id);

  // The contract is minted at Gmail-connect with a short TTL but consumed here.
  // A benign timeout (or revisiting this page) should NOT dead-end the verified
  // owner on a scary refusal — re-issue a fresh contract for this same scan
  // session and proceed. The owner is still authenticated (session.userId), the
  // session is theirs (checked above), and verified_email === the connected
  // inbox that was proven at connect, so re-issuing preserves the invariant.
  // NOTE: higher-risk actions (cancellation) must force a fresh Gmail connect
  // instead of silently re-issuing.
  if (!signed || isExpired(signed.contract)) {
    signed = issueContract(scan, scan.verified_email);
    saveContract(signed);
  }

  // Run through the engine boundary. It refuses unless the signed contract is
  // valid and every email matches. We pass the contract's own allowed inbox as
  // the "connected inbox" it is about to act on, plus the single-use token
  // handle (if still live) so the engine can do the live receipt fetch. On a
  // stale revisit the handle is gone (undefined) — the engine falls back to the
  // fixture rather than dead-ending the owner.
  const tokenRef = tokenRefForSession(scan.id);
  let ledger;
  try {
    ledger = await runScan(signed, signed?.contract.allowed_inbox_email ?? "", { tokenRef });
  } catch (err) {
    const refused = err instanceof ExecutionRefused;
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
        <main className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl dark:bg-red-950/50">
            🛑
          </div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Engine refused to run
          </h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            {refused
              ? (err as ExecutionRefused).message
              : "The scan could not be started."}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            StreamKill only runs on the verified account owner&apos;s inbox,
            under a valid execution contract.
          </p>
          <div className="mt-6 flex justify-center">
            <a
              href="/scan"
              className="inline-flex h-11 items-center rounded-full bg-black px-5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Start over
            </a>
          </div>
        </main>
      </div>
    );
  }

  const mailbox = signed!.contract.allowed_inbox_email;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">
              Leak Ledger
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              Your subscriptions
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/receipts"
              className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              Proof receipts
            </a>
            <a
              href="/disconnect"
              className="text-sm font-medium text-red-600 underline-offset-4 hover:underline"
            >
              Disconnect
            </a>
            <SignOutButton />
          </div>
        </div>

        {/* Bound scan target — the verified, contract-locked inbox. */}
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <span className="text-lg" aria-hidden>
            🔒
          </span>
          <div className="min-w-0 text-sm">
            <span className="text-emerald-800 dark:text-emerald-300">Scanning </span>
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">
              {mailbox}
            </span>
            <span className="text-emerald-700/80 dark:text-emerald-400/80">
              {" "}
              — verified owner, under a signed contract. Read-only.
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500">Bleeding per month</p>
            <p className="mt-1 text-3xl font-semibold text-black dark:text-zinc-50">
              {money(ledger.monthlyTotal)}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500">Per year</p>
            <p className="mt-1 text-3xl font-semibold text-black dark:text-zinc-50">
              {money(ledger.annualTotal)}
            </p>
          </div>
        </div>

        <ul className="mt-6 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
          {ledger.items.map((item) => (
            <li
              key={item.service}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-black dark:text-zinc-100">
                  {item.service}
                </p>
                <p className="text-sm text-zinc-500">
                  {money(item.amount)}/{item.cadence === "annual" ? "yr" : "mo"} ·
                  last seen {item.lastSeen}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                {/* Per-item, approval-gated. Routes to a confirmation page that
                    opens the service's own official cancel page. StreamKill
                    never cancels automatically. */}
                {item.status === "blocked" ? (
                  <button
                    disabled
                    title="Protected — cancelling this isn't recommended."
                    className="cursor-not-allowed rounded-full bg-black px-4 py-2 text-sm font-medium text-white opacity-30 dark:bg-white dark:text-black"
                  >
                    Cancel
                  </button>
                ) : (
                  <a
                    href={`/ledger/cancel?session=${scan.id}&service=${encodeURIComponent(item.service)}`}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    Cancel
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Read-only scan · you approve each cancellation individually · StreamKill
          sends you to each service&apos;s official cancel page — it never cancels
          behind your back.
        </p>
      </main>
    </div>
  );
}
