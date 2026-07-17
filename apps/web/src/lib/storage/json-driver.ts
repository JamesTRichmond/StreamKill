import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SignedReceipt } from "@/lib/proof";
import type { ScanSession, SignedContract, User } from "@/lib/store";
import type { StorageDriver } from "./driver";

// Single-file JSON driver — the dev/demo default. No DB dependency; the whole
// store is one human-inspectable file. NOT for production: no concurrency
// control and no durability guarantees beyond the filesystem.

interface DB {
  users: User[];
  scan_sessions: ScanSession[];
  contracts: Record<string, SignedContract>; // keyed by scan_session_id
  receipts?: SignedReceipt[];
}

export function createJsonDriver(dataDir?: string): StorageDriver {
  const dir = dataDir ?? process.env.STREAMKILL_DATA_DIR ?? path.join(process.cwd(), ".data");
  const file = path.join(dir, "streamkill.json");

  function load(): DB {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as DB;
    } catch {
      return { users: [], scan_sessions: [], contracts: {} };
    }
  }

  function save(db: DB): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
  }

  return {
    async upsertUser(input) {
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
    },

    async getUserById(id) {
      return load().users.find((u) => u.id === id);
    },

    async createScanSession(user) {
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
    },

    async getScanSession(id) {
      return load().scan_sessions.find((s) => s.id === id);
    },

    async latestReadySession(userId) {
      return load()
        .scan_sessions.filter((s) => s.user_id === userId && s.status === "ready")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    },

    async saveContract(signed) {
      const db = load();
      db.contracts[signed.contract.scan_session_id] = signed;
      save(db);
    },

    async getContract(scanSessionId) {
      return load().contracts[scanSessionId];
    },

    async saveReceipt(signed) {
      const db = load();
      db.receipts = db.receipts ?? [];
      db.receipts.push(signed);
      save(db);
    },

    async receiptsForUser(userId) {
      return (load().receipts ?? []).filter((r) => r.receipt.user_id === userId);
    },

    async receiptForItem(scanSessionId, service) {
      return (load().receipts ?? []).find(
        (r) => r.receipt.scan_session_id === scanSessionId && r.receipt.service === service,
      );
    },

    async deleteUserData(userId) {
      const db = load();
      const theirSessions = db.scan_sessions.filter((s) => s.user_id === userId);
      for (const s of theirSessions) delete db.contracts[s.id];
      db.scan_sessions = db.scan_sessions.filter((s) => s.user_id !== userId);
      db.users = db.users.filter((u) => u.id !== userId);
      db.receipts = (db.receipts ?? []).filter((r) => r.receipt.user_id !== userId);
      save(db);
      return { sessions: theirSessions.length };
    },
  };
}
