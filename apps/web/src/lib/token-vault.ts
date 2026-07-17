import "server-only";
import crypto from "node:crypto";
import type { VaultDriver } from "@/lib/vault/driver";
import { createMemoryVault } from "@/lib/vault/memory-driver";
import { createPostgresVault } from "@/lib/vault/postgres-driver";

// Short-lived token vault for the live Gmail-fetch path (ENGINE_CONTRACT §7,
// `token_ref`). The read-only Gmail access token is minted into an opaque,
// single-use, TTL-bounded handle at connect time; the engine redeems that
// handle once at scan time. The raw token is never persisted in plaintext and
// never sent to the browser.
//
// Backed by a vault driver:
//   - DATABASE_URL set -> shared Postgres vault (multi-instance safe; tokens
//     AES-256-GCM encrypted at rest)
//   - otherwise        -> in-process memory vault (dev; single instance)

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes — long enough to scan, short enough to be safe

let driver: VaultDriver | undefined;

function vault(): VaultDriver {
  if (!driver) {
    const url = process.env.DATABASE_URL;
    driver = url ? createPostgresVault(url) : createMemoryVault();
  }
  return driver;
}

/**
 * Mint a single-use handle for a read-only Gmail token, bound to one scan
 * session. Any prior handle for the same session is invalidated (one live
 * handle per session).
 */
export async function mintTokenRef(
  scanSessionId: string,
  accessToken: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const ref = `skref_${crypto.randomUUID()}`;
  await vault().mint(ref, scanSessionId, accessToken, ttlMs);
  return ref;
}

/** The live handle for a scan session, or undefined if none/expired/consumed. */
export function tokenRefForSession(scanSessionId: string): Promise<string | undefined> {
  return vault().refForSession(scanSessionId);
}

/**
 * Exchange a handle for its token EXACTLY ONCE. Returns undefined if the handle
 * is unknown, already redeemed, or expired. The engine calls this at scan time.
 */
export function redeemTokenRef(ref: string): Promise<string | undefined> {
  return vault().redeem(ref);
}

/** Test-only: clear all handles. */
export function resetVaultForTests(): Promise<void> {
  return vault().reset();
}
