import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  getUserById,
  getScanSession,
  latestReadySession,
  saveContract,
  receiptForItem,
} from "@/lib/store";
import { issueContract } from "@/lib/contract";
import { runScan } from "@/lib/engine";
import { approveCancellation } from "@/lib/kill-room";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function CancelConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; service?: string }>;
}) {
  const session = await auth();
  if (!session?.userId) redirect("/");
  const user = await getUserById(session.userId);
  if (!user) redirect("/");

  const { session: sessionId, service } = await searchParams;
  const scan = sessionId ? await getScanSession(sessionId) : await latestReadySession(user.id);
  if (!scan || scan.user_id !== user.id) redirect("/scan");
  const backToLedger = `/ledger?session=${scan.id}`;
  if (!service) redirect(backToLedger);

  // Re-derive the item (and its cancel URL) from the engine — never trust a
  // URL passed in the query string. The engine's catalog is integrity-sealed,
  // so the cancel link it returns is the trustworthy one.
  const signed = issueContract(scan, scan.verified_email);
  await saveContract(signed);
  let item;
  try {
    const ledger = await runScan(signed, signed.contract.allowed_inbox_email);
    item = ledger.items.find((i) => i.service === service);
  } catch {
    redirect(backToLedger);
  }
  if (!item || !item.cancelUrl) redirect(backToLedger);

  const domain = new URL(item.cancelUrl).host;
  const alreadyApproved = Boolean(await receiptForItem(scan.id, item.service));

  // The moment of consent. Records a signed, per-item approval receipt
  // server-side, THEN sends the owner to the service's own cancel page. The
  // receipt is the Kill Room's proof of exactly what was approved, and when.
  async function approveAndGo() {
    "use server";
    const session = await auth();
    if (!session?.userId) redirect("/");
    const user = await getUserById(session.userId);
    const scanNow = sessionId
      ? await getScanSession(sessionId)
      : await latestReadySession(user?.id ?? "");
    if (!user || !scanNow || scanNow.user_id !== user.id) redirect("/scan");

    // Re-derive the item from the engine again inside the action — never trust
    // values captured in the form.
    const signedNow = issueContract(scanNow, scanNow.verified_email);
    await saveContract(signedNow);
    const ledger = await runScan(signedNow, signedNow.contract.allowed_inbox_email);
    const itemNow = ledger.items.find((i) => i.service === service);
    if (!itemNow?.cancelUrl) redirect(`/ledger?session=${scanNow.id}`);

    await approveCancellation({ user, scan: scanNow, item: itemNow });
    redirect(itemNow.cancelUrl);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <main className="w-full max-w-md">
        <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          Cancel a subscription
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Cancel {item.service}?
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {money(item.amount)}/{item.cadence === "annual" ? "year" : "month"} ·
          last charged {item.lastSeen}
        </p>

        <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-[15px] leading-7 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <p>
            StreamKill doesn&apos;t cancel this for you — clicking below opens{" "}
            <b>{item.service}&apos;s own cancellation page</b>, where you finish
            it. That keeps your {item.service} login yours and never shared.
          </p>
          <p className="mt-3">
            You&apos;re being sent to{" "}
            <span className="font-semibold">{domain}</span>.
          </p>
        </div>

        <form action={approveAndGo}>
          <button
            type="submit"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-full bg-red-600 px-6 text-base font-medium text-white transition-colors hover:bg-red-700"
          >
            {alreadyApproved ? "Re-open" : "Approve and open"} {item.service}&apos;s cancel
            page →
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-zinc-500">
          {alreadyApproved
            ? "You already approved this one — a signed receipt is on file."
            : "Approving records a signed receipt of exactly what you authorized."}
        </p>

        <a
          href={backToLedger}
          className="mt-3 block text-center text-sm font-medium text-zinc-500 underline-offset-4 hover:underline"
        >
          Back to my subscriptions
        </a>
      </main>
    </div>
  );
}
