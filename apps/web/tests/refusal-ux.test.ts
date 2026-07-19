import { describe, it, expect } from "vitest";
import { refusalUx } from "@/lib/refusal-ux";

// The refusal screen's recovery action must match the specific refusal —
// both Gate #1's own codes and the engine's namespaced engine_* verdicts.

describe("refusalUx", () => {
  it("email mismatch (either gate) routes to a fresh Gmail connect", () => {
    for (const code of ["email_mismatch", "engine_email_mismatch"]) {
      const ux = refusalUx(code, "sess-1");
      expect(ux.action.href).toBe("/api/gmail/connect");
      expect(ux.headline).toBe("Inbox connection doesn't match");
    }
  });

  it("expiry (either gate) routes to a fresh scan", () => {
    for (const code of ["expired", "engine_expired"]) {
      expect(refusalUx(code, "sess-1").action.href).toBe("/scan");
    }
  });

  it("transient engine trouble retries the SAME scan session", () => {
    for (const code of ["engine_unreachable", "engine_error"]) {
      const ux = refusalUx(code, "sess 1/x");
      expect(ux.action.label).toBe("Try again");
      expect(ux.action.href).toBe(`/ledger?session=${encodeURIComponent("sess 1/x")}`);
    }
    // without a session to retry, fall back to the scan entry point
    expect(refusalUx("engine_error").action.href).toBe("/scan");
  });

  it("hard refusals and unknown codes start over at the trust gate", () => {
    for (const code of ["bad_signature", "engine_bad_signature", "no_contract", "engine_refused", "made_up", undefined]) {
      const ux = refusalUx(code as string | undefined, "sess-1");
      expect(ux.headline).toBe("Engine refused to run");
      expect(ux.action.href).toBe("/scan");
    }
  });
});
