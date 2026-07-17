import crypto from "node:crypto";
import { Pool } from "pg";
import type { VaultDriver } from "./driver";

// Shared token vault on Postgres — makes the mint/redeem handshake work across
// multiple web instances (any instance can mint, any can serve the engine's
// redeem call). Selected automatically when DATABASE_URL is set.
//
// Security posture:
//   - Tokens are AES-256-GCM encrypted at rest with a key derived (HKDF) from
//     CONTRACT_SIGNING_SECRET — no plaintext token is ever stored in the
//     database, so a DB snapshot/backup alone cannot yield a usable token.
//   - Single-use is enforced atomically: DELETE ... RETURNING consumes the row
//     in the same statement that reads it, so two racing redeem calls (even on
//     different instances) can never both succeed.
//   - Rows are TTL-bounded (expires_at) and swept opportunistically; expired
//     rows are unredeemable even before the sweep runs.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sk_token_vault (
  ref TEXT PRIMARY KEY,
  scan_session_id TEXT NOT NULL UNIQUE,
  token_enc TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
`;

function vaultKey(): Buffer {
  const secret = process.env.CONTRACT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (!secret) throw new Error("CONTRACT_SIGNING_SECRET/AUTH_SECRET is not set.");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "sk-token-vault", "aes-256-gcm", 32));
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptToken(blob: string): string | undefined {
  try {
    const raw = Buffer.from(blob, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // wrong key or corrupted row — treat as unredeemable, never throw a token path error
    return undefined;
  }
}

export function createPostgresVault(databaseUrl: string): VaultDriver {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  let ready: Promise<void> | undefined;

  function init(): Promise<void> {
    ready ??= pool.query(SCHEMA).then(() => undefined);
    return ready;
  }

  return {
    async mint(ref, scanSessionId, accessToken, ttlMs) {
      await init();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      // One live handle per session: the UNIQUE(scan_session_id) upsert
      // atomically replaces any prior handle for this session.
      await pool.query(
        `INSERT INTO sk_token_vault (ref, scan_session_id, token_enc, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (scan_session_id) DO UPDATE
           SET ref = EXCLUDED.ref, token_enc = EXCLUDED.token_enc, expires_at = EXCLUDED.expires_at`,
        [ref, scanSessionId, encryptToken(accessToken), expiresAt],
      );
      // Opportunistic sweep of anything expired.
      await pool.query(`DELETE FROM sk_token_vault WHERE expires_at <= now()`);
    },

    async refForSession(scanSessionId) {
      await init();
      const res = await pool.query(
        `SELECT ref FROM sk_token_vault WHERE scan_session_id = $1 AND expires_at > now()`,
        [scanSessionId],
      );
      return res.rows[0]?.ref;
    },

    async redeem(ref) {
      await init();
      // Atomic consume: only one caller can ever get the row.
      const res = await pool.query(
        `DELETE FROM sk_token_vault WHERE ref = $1 AND expires_at > now() RETURNING token_enc`,
        [ref],
      );
      const enc = res.rows[0]?.token_enc;
      return enc ? decryptToken(enc) : undefined;
    },

    async reset() {
      await init();
      await pool.query(`DELETE FROM sk_token_vault`);
    },
  };
}
