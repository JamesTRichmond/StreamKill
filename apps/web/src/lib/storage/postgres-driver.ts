import crypto from "node:crypto";
import { Pool } from "pg";
import type { SignedReceipt } from "@/lib/proof";
import type { ScanSession, SignedContract, User } from "@/lib/store";
import type { StorageDriver } from "./driver";

// Postgres driver — production persistence, selected by DATABASE_URL.
// Same records-only discipline as the JSON driver: identity/session records
// and signed receipts. Never credentials, tokens, or passwords.
//
// Entities are stored as JSONB payloads with indexed key columns for lookups,
// so the shapes stay owned by the TypeScript types (and their signatures stay
// byte-identical through storage) rather than being re-modeled in SQL.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sk_users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (provider, provider_account_id)
);
CREATE TABLE IF NOT EXISTS sk_scan_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS sk_scan_sessions_user ON sk_scan_sessions (user_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS sk_contracts (
  scan_session_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS sk_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scan_session_id TEXT NOT NULL,
  service TEXT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (scan_session_id, service)
);
CREATE INDEX IF NOT EXISTS sk_receipts_user ON sk_receipts (user_id);
`;

export function createPostgresDriver(databaseUrl: string): StorageDriver {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  let ready: Promise<void> | undefined;

  function init(): Promise<void> {
    ready ??= pool.query(SCHEMA).then(() => undefined);
    return ready;
  }

  async function q<T extends object>(text: string, values: unknown[]): Promise<T[]> {
    await init();
    const res = await pool.query(text, values);
    return res.rows as T[];
  }

  return {
    async upsertUser(input) {
      const email = input.email.toLowerCase();
      const fresh: User = {
        id: crypto.randomUUID(),
        verified_email: email,
        auth_provider: input.provider,
        auth_provider_user_id: input.providerAccountId,
        created_at: new Date().toISOString(),
      };
      // Insert, or on conflict keep the row but refresh verified_email.
      const rows = await q<{ payload: User }>(
        `INSERT INTO sk_users (id, provider, provider_account_id, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, provider_account_id) DO UPDATE
           SET payload = sk_users.payload || jsonb_build_object('verified_email', $5::text)
         RETURNING payload`,
        [fresh.id, input.provider, input.providerAccountId, JSON.stringify(fresh), email],
      );
      return rows[0].payload;
    },

    async getUserById(id) {
      const rows = await q<{ payload: User }>(
        `SELECT payload FROM sk_users WHERE id = $1`,
        [id],
      );
      return rows[0]?.payload;
    },

    async createScanSession(user) {
      const session: ScanSession = {
        id: crypto.randomUUID(),
        user_id: user.id,
        verified_email: user.verified_email,
        status: "ready",
        created_at: new Date().toISOString(),
      };
      await q(
        `INSERT INTO sk_scan_sessions (id, user_id, status, created_at, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [session.id, session.user_id, session.status, session.created_at, JSON.stringify(session)],
      );
      return session;
    },

    async getScanSession(id) {
      const rows = await q<{ payload: ScanSession }>(
        `SELECT payload FROM sk_scan_sessions WHERE id = $1`,
        [id],
      );
      return rows[0]?.payload;
    },

    async latestReadySession(userId) {
      const rows = await q<{ payload: ScanSession }>(
        `SELECT payload FROM sk_scan_sessions
         WHERE user_id = $1 AND status = 'ready'
         ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      return rows[0]?.payload;
    },

    async saveContract(signed) {
      await q(
        `INSERT INTO sk_contracts (scan_session_id, payload) VALUES ($1, $2)
         ON CONFLICT (scan_session_id) DO UPDATE SET payload = EXCLUDED.payload`,
        [signed.contract.scan_session_id, JSON.stringify(signed)],
      );
    },

    async getContract(scanSessionId) {
      const rows = await q<{ payload: SignedContract }>(
        `SELECT payload FROM sk_contracts WHERE scan_session_id = $1`,
        [scanSessionId],
      );
      return rows[0]?.payload;
    },

    async saveReceipt(signed) {
      // The UNIQUE (scan_session_id, service) constraint enforces one receipt
      // per item per session at the database level; a duplicate insert keeps
      // the original (approval idempotency).
      await q(
        `INSERT INTO sk_receipts (id, user_id, scan_session_id, service, payload)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (scan_session_id, service) DO NOTHING`,
        [
          signed.receipt.id,
          signed.receipt.user_id,
          signed.receipt.scan_session_id,
          signed.receipt.service,
          JSON.stringify(signed),
        ],
      );
    },

    async receiptsForUser(userId) {
      const rows = await q<{ payload: SignedReceipt }>(
        `SELECT payload FROM sk_receipts WHERE user_id = $1`,
        [userId],
      );
      return rows.map((r) => r.payload);
    },

    async receiptForItem(scanSessionId, service) {
      const rows = await q<{ payload: SignedReceipt }>(
        `SELECT payload FROM sk_receipts WHERE scan_session_id = $1 AND service = $2`,
        [scanSessionId, service],
      );
      return rows[0]?.payload;
    },

    async deleteUserData(userId) {
      await init();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const sessions = await client.query(
          `DELETE FROM sk_scan_sessions WHERE user_id = $1 RETURNING id`,
          [userId],
        );
        const ids = sessions.rows.map((r: { id: string }) => r.id);
        if (ids.length) {
          await client.query(`DELETE FROM sk_contracts WHERE scan_session_id = ANY($1)`, [ids]);
        }
        await client.query(`DELETE FROM sk_receipts WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM sk_users WHERE id = $1`, [userId]);
        await client.query("COMMIT");
        return { sessions: ids.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
