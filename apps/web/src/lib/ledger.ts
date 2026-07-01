// StreamKill leak ledger — types + data access.
//
// PHASE 3 (next): buildLedger() will POST the short-lived read-only Gmail
// access token to the StreamKill engine service (packages/engine, exposed as
// an internal API). The engine reads subscription receipts read-only, builds
// the ranked ledger, and returns it. The token is used once and never stored.
//
// For now it returns representative sample data so the auth + UI path is
// provable end-to-end. This is the ONLY stub in the flow.

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

export async function buildLedger(accessToken?: string): Promise<Ledger> {
  // TODO(phase-3): replace with a call to the engine service, e.g.
  //   const res = await fetch(`${process.env.ENGINE_URL}/ledger`, {
  //     method: "POST",
  //     headers: { "content-type": "application/json" },
  //     body: JSON.stringify({ gmailAccessToken: accessToken }),
  //   });
  //   return res.json();
  void accessToken;

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
