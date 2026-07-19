// StreamKill leak ledger — types + the no-engine dev fallback.
//
// The real scan path lives behind lib/engine.ts: runScan() POSTs the signed
// contract (plus token_ref, ENGINE_CONTRACT §7) to ENGINE_URL and returns the
// engine's ledger. buildLedger() below is ONLY the dev fallback used when
// ENGINE_URL is unset, so the auth + UI flow stays provable without the
// engine service running.

export type LeakStatus = "safe_to_cancel" | "review" | "blocked";
export type Cadence = "monthly" | "annual";

export interface LeakItem {
  service: string;
  amount: number; // in USD, at the given cadence
  cadence: Cadence;
  lastSeen: string; // ISO date
  confidence: "high" | "medium" | "low";
  status: LeakStatus;
  cancelUrl?: string;
}

export interface Ledger {
  items: LeakItem[];
  monthlyTotal: number;
  annualTotal: number;
}

function annualize(item: LeakItem): number {
  return item.cadence === "annual" ? item.amount : item.amount * 12;
}

// `mailbox` is the bound scan target resolved from the authenticated session
// (see resolveScanTarget in lib/gmail.ts) — never a value the user typed. The
// engine is told exactly which single inbox it may read, and no other.
export async function buildLedger(mailbox: string): Promise<Ledger> {
  void mailbox;

  const items: LeakItem[] = [
    { service: "YouTube Premium", amount: 13.99, cadence: "monthly", lastSeen: "2026-06-28", confidence: "high", status: "safe_to_cancel", cancelUrl: "https://www.youtube.com/paid_memberships" },
    { service: "Audible", amount: 14.95, cadence: "monthly", lastSeen: "2026-06-22", confidence: "high", status: "safe_to_cancel", cancelUrl: "https://www.audible.com/account" },
    { service: "Dropout", amount: 5.99, cadence: "monthly", lastSeen: "2026-06-15", confidence: "medium", status: "review" },
    { service: "iCloud+ 2TB", amount: 9.99, cadence: "monthly", lastSeen: "2026-06-30", confidence: "high", status: "review" },
    { service: "Adobe Creative Cloud", amount: 659.88, cadence: "annual", lastSeen: "2026-03-04", confidence: "high", status: "blocked" },
  ];

  const annualTotal = items.reduce((sum, i) => sum + annualize(i), 0);
  const monthlyTotal = annualTotal / 12;

  return {
    items,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    annualTotal: Math.round(annualTotal * 100) / 100,
  };
}
