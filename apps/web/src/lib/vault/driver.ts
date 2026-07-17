// Token vault driver boundary (ENGINE_CONTRACT §7). lib/token-vault.ts is the
// only consumer. Two implementations:
//   - memory-driver: in-process Map (dev default; single instance only)
//   - postgres-driver: shared TTL store selected by DATABASE_URL, so any web
//     instance can mint and any instance can serve the engine's redeem call.
//     Tokens are AES-256-GCM encrypted at rest — no plaintext token is ever
//     stored anywhere.
// All handles are single-use and TTL-bounded regardless of driver.

export interface VaultDriver {
  /** Store a token under a fresh opaque handle, replacing any prior handle for the session. */
  mint(ref: string, scanSessionId: string, accessToken: string, ttlMs: number): Promise<void>;
  /** The live handle for a session, or undefined if none/expired/consumed. */
  refForSession(scanSessionId: string): Promise<string | undefined>;
  /** Exchange a handle for its token EXACTLY once; undefined if unknown/expired/spent. */
  redeem(ref: string): Promise<string | undefined>;
  /** Test-only: clear all handles. */
  reset(): Promise<void>;
}
