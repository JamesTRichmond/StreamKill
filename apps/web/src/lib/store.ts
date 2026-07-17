import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SignedReceipt } from "@/lib/proof";

// Minimal durable store for the trust-gate MVP.
//
// IMPORTANT: this stores identity/session RECORDS only — never credentials,
// tokens, or passwords. OAuth tokens are used transiently in the connect
// callback and discarded; they are never written here.
//
// Backed by a single JSON file so the MVP has no DB dependency. The interface
// is deliberately swappable for Postgres/SQLite later.

export interface User {
  id: string;
  verified_email: string;
  auth_provider: string;
  auth_provider_user_id: string;
  created_at: string;
}

export type ScanStatus = "ready" | "blocked" | "consumed";

export interface ScanSession {
  id: string;
  user_id: string;
  verified_email: string;
  status: ScanStatus;
  created_at: string;
}

export interface AllowedActions {
  scan_receipts: boolean;
  build_ledger: boolean;
  cancel_subscription: boolean;
}

export interface ExecutionContract {
  user_id: string;
  scan_session_id: string;
  verified_email: string;
  allowed_inbox_email: string;
  allowed_actions: AllowedActions;
  expires_at: string;
}

export interface SignedContract {
  contract: ExecutionContract;
  signature: string;
}

interface DB {
  users: User[];
  scan_sessions: ScanSession[];
  contracts: Record<string, SignedContract>; // keyed by scan_session_id
  receipts?: SignedReceipt[]; // Kill Room approval proof receipts
}

const DATA_DIR = process.env.STREAMKILL_DATA_DIR ?? path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "streamkill.json");

function load(): DB {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as DB;
  } catch {
    return { users: [], scan_sessions: [], contracts: {} };
  }
}

function save(db: DB): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function upsertUser(input: {
  provider: string;
  providerAccountId: string;
  email: string;
}): User {
  const db = load();
  const email = input.email.toLowerCase();
  const existing = db.users.find(
    (u) =>
      u.auth_provider === input.provider &&
      u.auth_provider_user_id === input.providerAccountId,
  );
  if (existing) {
    if (existing.verified_email !== email) {
      existing.verified_email = email;
      save(db);
    }
    return existing;
  }
  const user: User = {
    id: crypto.randomUUID(),
    verified_email: email,
    auth_provider: input.provider,
    auth_provider_user_id: input.providerAccountId,
    created_at: new Date().toISOString(),
  };
  db.users.push(user);
  save(db);
  return user;
}

export function getUserById(id: string): User | undefined {
  return load().users.find((u) => u.id === id);
}

export function createScanSession(user: User): ScanSession {
  const db = load();
  const session: ScanSession = {
    id: crypto.randomUUID(),
    user_id: user.id,
    verified_email: user.verified_email,
    status: "ready",
    created_at: new Date().toISOString(),
  };
  db.scan_sessions.push(session);
  save(db);
  return session;
}

export function getScanSession(id: string): ScanSession | undefined {
  return load().scan_sessions.find((s) => s.id === id);
}

export function latestReadySession(userId: string): ScanSession | undefined {
  return load()
    .scan_sessions.filter((s) => s.user_id === userId && s.status === "ready")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export function saveContract(signed: SignedContract): void {
  const db = load();
  db.contracts[signed.contract.scan_session_id] = signed;
  save(db);
}

export function getContract(scanSessionId: string): SignedContract | undefined {
  return load().contracts[scanSessionId];
}

// ----- Kill Room proof receipts -----

export function saveReceipt(signed: SignedReceipt): void {
  const db = load();
  db.receipts = db.receipts ?? [];
  db.receipts.push(signed);
  save(db);
}

export function receiptsForUser(userId: string): SignedReceipt[] {
  return (load().receipts ?? []).filter((r) => r.receipt.user_id === userId);
}

/** The existing approval for one item in one scan session, if any (idempotency). */
export function receiptForItem(
  scanSessionId: string,
  service: string,
): SignedReceipt | undefined {
  return (load().receipts ?? []).find(
    (r) => r.receipt.scan_session_id === scanSessionId && r.receipt.service === service,
  );
}

// Full disconnect: erase everything we hold for this user — the user record,
// all their scan_sessions, contracts, and proof receipts. (We never store
// tokens, so there is nothing else to purge.) Idempotent.
export function deleteUserData(userId: string): { sessions: number } {
  const db = load();
  const theirSessions = db.scan_sessions.filter((s) => s.user_id === userId);
  for (const s of theirSessions) delete db.contracts[s.id];
  db.scan_sessions = db.scan_sessions.filter((s) => s.user_id !== userId);
  db.users = db.users.filter((u) => u.id !== userId);
  db.receipts = (db.receipts ?? []).filter((r) => r.receipt.user_id !== userId);
  save(db);
  return { sessions: theirSessions.length };
}
