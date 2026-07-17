import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  upsertUser,
  createScanSession,
  getScanSession,
  latestReadySession,
  saveContract,
  getContract,
  deleteUserData,
  getUserById,
} from "@/lib/store";
import { issueContract } from "@/lib/contract";

// Each test file gets its own data dir: vitest runs files in parallel workers,
// and a shared JSON store would let one file's cleanup race another's writes.
process.env.STREAMKILL_DATA_DIR = path.join(
  os.tmpdir(),
  `sk-test-${path.basename(__filename ?? "x").replace(/\W/g, "-")}-${process.pid}`,
);
const DATA_FILE = path.join(process.env.STREAMKILL_DATA_DIR, "streamkill.json");

beforeEach(() => {
  try {
    fs.rmSync(DATA_FILE);
  } catch {
    // fresh run — nothing to clear
  }
});

describe("store — identity/session records (never tokens)", () => {
  it("upsertUser is idempotent by provider + account id", async () => {
    const a = await upsertUser({ provider: "google", providerAccountId: "gid-1", email: "james@gmail.com" });
    const b = await upsertUser({ provider: "google", providerAccountId: "gid-1", email: "james@gmail.com" });
    expect(a.id).toBe(b.id);
    expect((await getUserById(a.id))?.verified_email).toBe("james@gmail.com");
  });

  it("creates and retrieves the latest ready scan session", async () => {
    const u = await upsertUser({ provider: "google", providerAccountId: "gid-2", email: "a@b.co" });
    const s = await createScanSession(u);
    expect((await getScanSession(s.id))?.id).toBe(s.id);
    expect((await latestReadySession(u.id))?.id).toBe(s.id);
  });

  it("roundtrips a signed contract by scan-session id", async () => {
    const u = await upsertUser({ provider: "google", providerAccountId: "gid-3", email: "a@b.co" });
    const s = await createScanSession(u);
    const signed = issueContract(s, "a@b.co");
    await saveContract(signed);
    expect((await getContract(s.id))?.signature).toBe(signed.signature);
  });

  it("deleteUserData erases the user + their sessions + contracts, and is idempotent", async () => {
    const u = await upsertUser({ provider: "google", providerAccountId: "gid-4", email: "a@b.co" });
    const s = await createScanSession(u);
    await saveContract(issueContract(s, "a@b.co"));

    const res = await deleteUserData(u.id);
    expect(res.sessions).toBe(1);
    expect(await getUserById(u.id)).toBeUndefined();
    expect(await getScanSession(s.id)).toBeUndefined();
    expect(await getContract(s.id)).toBeUndefined();

    // idempotent — a second disconnect is a no-op
    expect((await deleteUserData(u.id)).sessions).toBe(0);
  });

  it("deleteUserData leaves other users' data intact", async () => {
    const keep = await upsertUser({ provider: "google", providerAccountId: "keep", email: "keep@b.co" });
    const keepSession = await createScanSession(keep);
    const drop = await upsertUser({ provider: "google", providerAccountId: "drop", email: "drop@b.co" });
    await createScanSession(drop);

    await deleteUserData(drop.id);

    expect((await getUserById(keep.id))?.id).toBe(keep.id);
    expect((await getScanSession(keepSession.id))?.id).toBe(keepSession.id);
  });
});
