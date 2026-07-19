import { describe, it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { runScan, cancelSubscription, ExecutionRefused } from "@/lib/engine";
import { issueContract, sign } from "@/lib/contract";
import type { ExecutionContract, ScanSession, SignedContract } from "@/lib/store";

const OWNER = "james@gmail.com";

function session(): ScanSession {
  return {
    id: "sess-1",
    user_id: "user-1",
    verified_email: OWNER,
    status: "ready",
    created_at: new Date().toISOString(),
  };
}

// issueContract never permits cancellation; hand-sign one that does so we can
// prove the *downstream* guards (approval + not-implemented) also hold.
function cancelEnabledContract(): SignedContract {
  const contract: ExecutionContract = {
    user_id: "user-1",
    scan_session_id: "sess-1",
    verified_email: OWNER,
    allowed_inbox_email: OWNER,
    allowed_actions: { scan_receipts: true, build_ledger: true, cancel_subscription: true },
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  return { contract, signature: sign(contract) };
}

async function refusalCode(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "NO_THROW";
  } catch (e) {
    return e instanceof ExecutionRefused ? e.code : `OTHER:${String(e)}`;
  }
}

describe("engine boundary — runScan gate", () => {
  it("refuses to scan when no contract is present", async () => {
    expect(await refusalCode(() => runScan(undefined, OWNER))).toBe("no_contract");
  });

  it("refuses when the connected inbox differs from the contract", async () => {
    const signed = issueContract(session(), OWNER);
    expect(await refusalCode(() => runScan(signed, "intruder@gmail.com"))).toBe("email_mismatch");
  });

  it("refuses a tampered contract", async () => {
    const signed = issueContract(session(), OWNER);
    const bad: SignedContract = { ...signed, signature: "00" };
    expect(await refusalCode(() => runScan(bad, OWNER))).toBe("bad_signature");
  });

  it("returns a ledger for a valid contract when no ENGINE_URL is set (dev fallback)", async () => {
    const signed = issueContract(session(), OWNER);
    const ledger = await runScan(signed, OWNER);
    expect(Array.isArray(ledger.items)).toBe(true);
    expect(ledger.items.length).toBeGreaterThan(0);
  });
});

// Stub ENGINE_URL server answering every POST with a fixed status/body, so we
// can assert exactly how the client translates engine responses.
async function withStubEngine<T>(
  status: number,
  body: string,
  fn: () => Promise<T>,
): Promise<T> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const prev = process.env.ENGINE_URL;
  process.env.ENGINE_URL = `http://127.0.0.1:${port}/scan`;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ENGINE_URL;
    else process.env.ENGINE_URL = prev;
    await new Promise<void>((r) => server.close(() => r()));
  }
}

describe("engine boundary — §3/§5 refusal codes surface through the client", () => {
  const scan = () => runScan(issueContract(session(), OWNER), OWNER);

  it("surfaces each allowlisted refusal code as engine_<code> with precise copy", async () => {
    for (const code of ["bad_signature", "expired", "email_mismatch", "action_not_allowed", "cancel_not_allowed"]) {
      const got = await withStubEngine(403, JSON.stringify({ error: code }), () => refusalCode(scan));
      expect(got).toBe(`engine_${code}`);
    }
  });

  it("keeps the generic code for unknown or malformed refusal bodies (engine input is untrusted)", async () => {
    for (const body of [JSON.stringify({ error: "made_up_code" }), "not json {", "", JSON.stringify({})]) {
      expect(await withStubEngine(403, body, () => refusalCode(scan))).toBe("engine_refused");
    }
  });

  it("maps 5xx to engine_error, not a refusal", async () => {
    expect(await withStubEngine(500, JSON.stringify({ error: "boom" }), () => refusalCode(scan))).toBe("engine_error");
  });
});

describe("engine boundary — cancelSubscription is guarded and unimplemented", () => {
  it("refuses without a contract", async () => {
    expect(
      await refusalCode(() =>
        cancelSubscription({ signed: undefined, connectedInboxEmail: OWNER, itemId: "x", approvedByOwner: true }),
      ),
    ).toBe("no_contract");
  });

  it("refuses on email mismatch", async () => {
    const signed = issueContract(session(), OWNER);
    expect(
      await refusalCode(() =>
        cancelSubscription({ signed, connectedInboxEmail: "intruder@gmail.com", itemId: "x", approvedByOwner: true }),
      ),
    ).toBe("email_mismatch");
  });

  it("blocks cancellation when the contract does not permit it (the default)", async () => {
    const signed = issueContract(session(), OWNER); // cancel_subscription: false
    expect(
      await refusalCode(() =>
        cancelSubscription({ signed, connectedInboxEmail: OWNER, itemId: "x", approvedByOwner: true }),
      ),
    ).toBe("cancel_disabled");
  });

  it("requires per-item owner approval even when the contract permits cancel", async () => {
    const signed = cancelEnabledContract();
    expect(
      await refusalCode(() =>
        cancelSubscription({ signed, connectedInboxEmail: OWNER, itemId: "x", approvedByOwner: false }),
      ),
    ).toBe("approval_required");
  });

  it("still refuses (not_implemented) when permitted AND approved — proves no silent execution", async () => {
    const signed = cancelEnabledContract();
    expect(
      await refusalCode(() =>
        cancelSubscription({ signed, connectedInboxEmail: OWNER, itemId: "x", approvedByOwner: true }),
      ),
    ).toBe("not_implemented");
  });
});
