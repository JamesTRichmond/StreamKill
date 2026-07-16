import "server-only";
import crypto from "node:crypto";

// Short-lived token vault for the live Gmail-fetch path (ENGINE_CONTRACT §1,
// `token_ref`). The read-only Gmail access token is minted into an opaque,
// single-use, TTL-bounded handle at connect time; the engine redeems that
// handle once at scan time. The raw token lives ONLY here, in memory, and is
// never written to disk (preserving the store's "records only, never tokens"
// promise) and never sent to the browser.
//
// DEV ONLY as written: this is an in-process Map, so it only works when the web
// app is a single process and the engine can redeem in-process (tests + local
// dev). In production the web app may be multi-instance and the engine is a
// separate service, so this MUST be backed by a shared TTL store (e.g. Redis)
// behind an authenticated redeem endpoint. See ENGINE_CONTRACT.md §7.

interface Entry {
  accessToken: string;
  scanSessionId: string;
  expiresAt: number; // epoch ms
}

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes — long enough to scan, short enough to be safe

const byRef = new Map<string, Entry>();
const refBySession = new Map<string, string>();

function drop(ref: string): void {
  const entry = byRef.get(ref);
  byRef.delete(ref);
  if (entry && refBySession.get(entry.scanSessionId) === ref) {
    refBySession.delete(entry.scanSessionId);
  }
}

function sweepExpired(now: number): void {
  for (const [ref, entry] of byRef) {
    if (entry.expiresAt <= now) drop(ref);
  }
}

/**
 * Mint a single-use handle for a read-only Gmail token, bound to one scan
 * session. Any prior handle for the same session is invalidated (one live
 * handle per session).
 */
export function mintTokenRef(
  scanSessionId: string,
  accessToken: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const now = Date.now();
  sweepExpired(now);
  const prior = refBySession.get(scanSessionId);
  if (prior) drop(prior);

  const ref = `skref_${crypto.randomUUID()}`;
  byRef.set(ref, { accessToken, scanSessionId, expiresAt: now + ttlMs });
  refBySession.set(scanSessionId, ref);
  return ref;
}

/** The live handle for a scan session, or undefined if none/expired/consumed. */
export function tokenRefForSession(scanSessionId: string): string | undefined {
  sweepExpired(Date.now());
  const ref = refBySession.get(scanSessionId);
  return ref && byRef.has(ref) ? ref : undefined;
}

/**
 * Exchange a handle for its token EXACTLY ONCE. Returns undefined if the handle
 * is unknown, already redeemed, or expired. The engine calls this at scan time.
 */
export function redeemTokenRef(ref: string): string | undefined {
  sweepExpired(Date.now());
  const entry = byRef.get(ref);
  if (!entry) return undefined;
  drop(ref);
  return entry.accessToken;
}

/** Test-only: clear all handles. */
export function resetVaultForTests(): void {
  byRef.clear();
  refBySession.clear();
}
