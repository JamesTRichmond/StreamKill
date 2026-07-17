import type { SignedReceipt } from "@/lib/proof";
import type { ScanSession, SignedContract, User } from "@/lib/store";

// Storage driver boundary. lib/store.ts is the only consumer; pages and routes
// never touch a driver directly. Two implementations:
//   - json-driver: single-file JSON store (dev/demo default)
//   - postgres-driver: production persistence, selected by DATABASE_URL
// Both hold identity/session RECORDS and signed receipts only — never
// credentials, tokens, or passwords (tokens live in the in-memory vault).

export interface StorageDriver {
  upsertUser(input: {
    provider: string;
    providerAccountId: string;
    email: string;
  }): Promise<User>;
  getUserById(id: string): Promise<User | undefined>;

  createScanSession(user: User): Promise<ScanSession>;
  getScanSession(id: string): Promise<ScanSession | undefined>;
  latestReadySession(userId: string): Promise<ScanSession | undefined>;

  saveContract(signed: SignedContract): Promise<void>;
  getContract(scanSessionId: string): Promise<SignedContract | undefined>;

  saveReceipt(signed: SignedReceipt): Promise<void>;
  receiptsForUser(userId: string): Promise<SignedReceipt[]>;
  receiptForItem(scanSessionId: string, service: string): Promise<SignedReceipt | undefined>;

  deleteUserData(userId: string): Promise<{ sessions: number }>;
}
