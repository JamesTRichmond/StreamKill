import { describe, it, expect, beforeAll } from "vitest";
import { createPostgresDriver } from "@/lib/storage/postgres-driver";
import type { StorageDriver } from "@/lib/storage/driver";
import { issueContract } from "@/lib/contract";
import { issueApprovalReceipt } from "@/lib/proof";

// Runs against a REAL Postgres when TEST_DATABASE_URL is set (locally or the
// CI service container); skips otherwise so the suite works with no DB.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("postgres storage driver (real database)", () => {
  let db: StorageDriver;

  beforeAll(() => {
    db = createPostgresDriver(url!);
  });

  const account = () => `gid-${crypto.randomUUID()}`;

  it("upserts a user idempotently and refreshes verified_email", async () => {
    const acct = account();
    const a = await db.upsertUser({ provider: "google", providerAccountId: acct, email: "A@B.co" });
    const b = await db.upsertUser({ provider: "google", providerAccountId: acct, email: "new@b.co" });
    expect(b.id).toBe(a.id);
    expect((await db.getUserById(a.id))?.verified_email).toBe("new@b.co");
  });

  it("roundtrips scan sessions, contracts, and receipts", async () => {
    const user = await db.upsertUser({ provider: "google", providerAccountId: account(), email: "a@b.co" });
    const scan = await db.createScanSession(user);
    expect((await db.getScanSession(scan.id))?.id).toBe(scan.id);
    expect((await db.latestReadySession(user.id))?.id).toBe(scan.id);

    const signed = issueContract(scan, "a@b.co");
    await db.saveContract(signed);
    expect((await db.getContract(scan.id))?.signature).toBe(signed.signature);

    const receipt = issueApprovalReceipt({
      userId: user.id,
      scanSessionId: scan.id,
      verifiedEmail: user.verified_email,
      service: "Netflix",
      amount: 15.49,
      cadence: "monthly",
      cancelUrl: "https://www.netflix.com/cancelplan",
    });
    await db.saveReceipt(receipt);
    expect((await db.receiptForItem(scan.id, "Netflix"))?.receipt.id).toBe(receipt.receipt.id);
    expect(await db.receiptsForUser(user.id)).toHaveLength(1);
  });

  it("enforces one receipt per item per session at the database level", async () => {
    const user = await db.upsertUser({ provider: "google", providerAccountId: account(), email: "a@b.co" });
    const scan = await db.createScanSession(user);
    const mk = () =>
      issueApprovalReceipt({
        userId: user.id,
        scanSessionId: scan.id,
        verifiedEmail: user.verified_email,
        service: "Hulu",
        amount: 9.99,
        cadence: "monthly",
        cancelUrl: "https://secure.hulu.com/account/cancel",
      });
    const first = mk();
    await db.saveReceipt(first);
    await db.saveReceipt(mk()); // duplicate approval attempt — must keep the original
    const stored = await db.receiptForItem(scan.id, "Hulu");
    expect(stored?.receipt.id).toBe(first.receipt.id);
    expect(await db.receiptsForUser(user.id)).toHaveLength(1);
  });

  it("deleteUserData wipes the user's records transactionally and leaves others intact", async () => {
    const keep = await db.upsertUser({ provider: "google", providerAccountId: account(), email: "keep@b.co" });
    const keepScan = await db.createScanSession(keep);

    const drop = await db.upsertUser({ provider: "google", providerAccountId: account(), email: "drop@b.co" });
    const dropScan = await db.createScanSession(drop);
    await db.saveContract(issueContract(dropScan, "drop@b.co"));
    await db.saveReceipt(
      issueApprovalReceipt({
        userId: drop.id,
        scanSessionId: dropScan.id,
        verifiedEmail: drop.verified_email,
        service: "Spotify Premium",
        amount: 11.99,
        cadence: "monthly",
        cancelUrl: "https://www.spotify.com/account/subscription/",
      }),
    );

    const res = await db.deleteUserData(drop.id);
    expect(res.sessions).toBe(1);
    expect(await db.getUserById(drop.id)).toBeUndefined();
    expect(await db.getScanSession(dropScan.id)).toBeUndefined();
    expect(await db.getContract(dropScan.id)).toBeUndefined();
    expect(await db.receiptsForUser(drop.id)).toHaveLength(0);
    // second run is a no-op
    expect((await db.deleteUserData(drop.id)).sessions).toBe(0);

    expect((await db.getUserById(keep.id))?.id).toBe(keep.id);
    expect((await db.getScanSession(keepScan.id))?.id).toBe(keepScan.id);
  });
});
