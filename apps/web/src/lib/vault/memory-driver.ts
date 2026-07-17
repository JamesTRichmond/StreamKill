import type { VaultDriver } from "./driver";

// In-process vault — the dev default. Exactly the pre-existing behavior:
// works only while the web app is a single process.

interface Entry {
  accessToken: string;
  scanSessionId: string;
  expiresAt: number; // epoch ms
}

export function createMemoryVault(): VaultDriver {
  const byRef = new Map<string, Entry>();
  const refBySession = new Map<string, string>();

  function drop(ref: string): void {
    const entry = byRef.get(ref);
    byRef.delete(ref);
    if (entry && refBySession.get(entry.scanSessionId) === ref) {
      refBySession.delete(entry.scanSessionId);
    }
  }

  function sweep(now: number): void {
    for (const [ref, entry] of byRef) {
      if (entry.expiresAt <= now) drop(ref);
    }
  }

  return {
    async mint(ref, scanSessionId, accessToken, ttlMs) {
      const now = Date.now();
      sweep(now);
      const prior = refBySession.get(scanSessionId);
      if (prior) drop(prior);
      byRef.set(ref, { accessToken, scanSessionId, expiresAt: now + ttlMs });
      refBySession.set(scanSessionId, ref);
    },

    async refForSession(scanSessionId) {
      sweep(Date.now());
      const ref = refBySession.get(scanSessionId);
      return ref && byRef.has(ref) ? ref : undefined;
    },

    async redeem(ref) {
      sweep(Date.now());
      const entry = byRef.get(ref);
      if (!entry) return undefined;
      drop(ref);
      return entry.accessToken;
    },

    async reset() {
      byRef.clear();
      refBySession.clear();
    },
  };
}
