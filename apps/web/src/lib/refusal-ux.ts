// Refusal screen UX — maps an ExecutionRefused code (Gate #1's own codes and
// the engine's namespaced engine_* verdicts, see lib/engine.ts) to the
// headline + recovery action the ledger page renders. Pure so it can be
// unit-tested; the precise sentence shown under the headline stays
// ExecutionRefused.message.

export interface RefusalUx {
  headline: string;
  action: { label: string; href: string };
}

const RECONNECT: RefusalUx["action"] = { label: "Reconnect Gmail (read-only)", href: "/api/gmail/connect" };
const RESTART: RefusalUx["action"] = { label: "Start a fresh scan", href: "/scan" };

export function refusalUx(code: string | undefined, sessionId?: string): RefusalUx {
  switch (code) {
    // The email triple stopped matching (either gate). Only a fresh Gmail
    // connect on the verified account can fix it.
    case "email_mismatch":
    case "engine_email_mismatch":
      return { headline: "Inbox connection doesn't match", action: RECONNECT };

    // Benign timeout — the contract's short TTL ran out between connect and
    // scan. Nothing is wrong with the account.
    case "expired":
    case "engine_expired":
      return { headline: "Scan authorization expired", action: RESTART };

    // Transient engine trouble — retrying THIS scan session is the right move
    // (the page re-issues an expired contract on revisit).
    case "engine_unreachable":
    case "engine_error":
      return {
        headline: "The engine is having trouble",
        action: {
          label: "Try again",
          href: sessionId ? `/ledger?session=${encodeURIComponent(sessionId)}` : "/scan",
        },
      };

    // Everything else (bad_signature, action_not_allowed, no_contract,
    // engine_refused, unknown) is a hard refusal: start over at the trust gate.
    default:
      return { headline: "Engine refused to run", action: { label: "Start over", href: "/scan" } };
  }
}
