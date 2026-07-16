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

const DATA_FILE = path.join(
  process.env.STREAMKILL_DATA_DIR ?? os.tmpdir(),
  "streamkill.json",
);

beforeEach(() => {
  try {
    fs.rmSync(DATA_FILE);
  } catch {
    // fresh run — nothing to clear
  }
});

describe("store — identity/session records (never tokens)", () => {
  it("upsertUser is idempotent by provider + account id", () => {
    const a = upsertUser({ provider: "google", providerAccountId: "gid-1", email: "james@gmail.com" });
    const b = upsertUser({ provider: "google", providerAccountId: "gid-1", email: "james@gmail.com" });
    expect(a.id).toBe(b.id);
    expect(getUserById(a.id)?.verified_email).toBe("james@gmail.com");
  });

  it("creates and retrieves the latest ready scan session", () => {
    const u = upsertUser({ provider: "google", providerAccountId: "gid-2", email: "a@b.co" });
    const s = createScanSession(u);
    expect(getScanSession(s.id)?.id).toBe(s.id);
    expect(latestReadySession(u.id)?.id).toBe(s.id);
  });

  it("roundtrips a signed contract by scan-session id", () => {
    const u = upsertUser({ provider: "google", providerAccountId: "gid-3", email: "a@b.co" });
    const s = createScanSession(u);
    const signed = issueContract(s, "a@b.co");
    saveContract(signed);
    expect(getContract(s.id)?.signature).toBe(signed.signature);
  });

  it("deleteUserData erases the user + their sessions + contracts, and is idempotent", () => {
    const u = upsertUser({ provider: "google", providerAccountId: "gid-4", email: "a@b.co" });
    const s = createScanSession(u);
    saveContract(issueContract(s, "a@b.co"));

    const res = deleteUserData(u.id);
    expect(res.sessions).toBe(1);
    expect(getUserById(u.id)).toBeUndefined();
    expect(getScanSession(s.id)).toBeUndefined();
    expect(getContract(s.id)).toBeUndefined();

    // idempotent — a second disconnect is a no-op
    expect(deleteUserData(u.id).sessions).toBe(0);
  });

  it("deleteUserData leaves other users' data intact", () => {
    const keep = upsertUser({ provider: "google", providerAccountId: "keep", email: "keep@b.co" });
    const keepSession = createScanSession(keep);
    const drop = upsertUser({ provider: "google", providerAccountId: "drop", email: "drop@b.co" });
    createScanSession(drop);

    deleteUserData(drop.id);

    expect(getUserById(keep.id)?.id).toBe(keep.id);
    expect(getScanSession(keepSession.id)?.id).toBe(keepSession.id);
  });
});
