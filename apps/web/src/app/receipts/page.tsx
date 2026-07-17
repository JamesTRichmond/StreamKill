import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getUserById, receiptsForUser } from "@/lib/store";
import { verifyReceipt } from "@/lib/proof";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// The Kill Room's proof surface: every cancellation approval the owner ever
// made, as signed, tamper-evident receipts. Each is re-verified on render — a
// receipt that fails verification is shown as such, never hidden.
export default async function ReceiptsPage() {
  const session = await auth();
  if (!session?.userId) redirect("/");
  const user = await getUserById(session.userId);
  if (!user) redirect("/");

  const receipts = (await receiptsForUser(user.id))
    .map((signed) => ({ signed, valid: verifyReceipt(signed) }))
    .sort((a, b) =>
      b.signed.receipt.approved_at.localeCompare(a.signed.receipt.approved_at),
    );

  const annualRecovered = receipts
    .filter(({ valid }) => valid)
    .reduce(
      (sum, { signed }) =>
        sum +
        (signed.receipt.cadence === "annual"
          ? signed.receipt.amount
          : signed.receipt.amount * 12),
      0,
    );

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">
          Proof receipts
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
          Your approved cancellations
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Every approval is recorded as a signed receipt at the moment you gave
          it. Nothing here was approved on your behalf.
        </p>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500">Approved annual recovery</p>
          <p className="mt-1 text-3xl font-semibold text-black dark:text-zinc-50">
            {money(annualRecovered)}
          </p>
        </div>

        {receipts.length === 0 ? (
          <p className="mt-8 text-center text-zinc-500">
            No approvals yet. Approve a cancellation from your ledger and the
            signed receipt will appear here.
          </p>
        ) : (
          <ul className="mt-6 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {receipts.map(({ signed, valid }) => (
              <li key={signed.receipt.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-black dark:text-zinc-100">
                    {signed.receipt.service}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {money(signed.receipt.amount)}/
                    {signed.receipt.cadence === "annual" ? "yr" : "mo"} · approved{" "}
                    {new Date(signed.receipt.approved_at).toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-400">
                    {signed.receipt.id} · sig {signed.signature.slice(0, 16)}…
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    valid
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  }`}
                >
                  {valid ? "Signature verified" : "Verification failed"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <a
          href="/ledger"
          className="mt-6 block text-center text-sm font-medium text-zinc-500 underline-offset-4 hover:underline"
        >
          Back to my subscriptions
        </a>
      </main>
    </div>
  );
}
