import "server-only";
import type { SignedReceipt } from "@/lib/proof";
import type { StorageDriver } from "@/lib/storage/driver";
import { createJsonDriver } from "@/lib/storage/json-driver";
import { createPostgresDriver } from "@/lib/storage/postgres-driver";

// Durable store for the trust gate + Kill Room.
//
// IMPORTANT: this stores identity/session RECORDS and signed proof receipts
// only — never credentials, tokens, or passwords. OAuth tokens live in the
// in-memory vault (lib/token-vault.ts) and are never written here.
//
// Backed by a storage driver:
//   - DATABASE_URL set   -> Postgres (production)
//   - otherwise          -> single JSON file (dev/demo)
// Pages and routes call these functions only; they never touch a driver.

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

let driver: StorageDriver | undefined;

function db(): StorageDriver {
  if (!driver) {
    const url = process.env.DATABASE_URL;
    driver = url ? createPostgresDriver(url) : createJsonDriver();
  }
  return driver;
}

export function upsertUser(input: {
  provider: string;
  providerAccountId: string;
  email: string;
}): Promise<User> {
  return db().upsertUser(input);
}

export function getUserById(id: string): Promise<User | undefined> {
  return db().getUserById(id);
}

export function createScanSession(user: User): Promise<ScanSession> {
  return db().createScanSession(user);
}

export function getScanSession(id: string): Promise<ScanSession | undefined> {
  return db().getScanSession(id);
}

export function latestReadySession(userId: string): Promise<ScanSession | undefined> {
  return db().latestReadySession(userId);
}

export function saveContract(signed: SignedContract): Promise<void> {
  return db().saveContract(signed);
}

export function getContract(scanSessionId: string): Promise<SignedContract | undefined> {
  return db().getContract(scanSessionId);
}

// ----- Kill Room proof receipts -----

export function saveReceipt(signed: SignedReceipt): Promise<void> {
  return db().saveReceipt(signed);
}

export function receiptsForUser(userId: string): Promise<SignedReceipt[]> {
  return db().receiptsForUser(userId);
}

/** The existing approval for one item in one scan session, if any (idempotency). */
export function receiptForItem(
  scanSessionId: string,
  service: string,
): Promise<SignedReceipt | undefined> {
  return db().receiptForItem(scanSessionId, service);
}

// Full disconnect: erase everything we hold for this user — the user record,
// all their scan_sessions, contracts, and proof receipts. (We never store
// tokens, so there is nothing else to purge.) Idempotent.
export function deleteUserData(userId: string): Promise<{ sessions: number }> {
  return db().deleteUserData(userId);
}
