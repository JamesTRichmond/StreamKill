import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { issueContract } from "@/lib/contract";
import { runScan, ExecutionRefused } from "@/lib/engine";
import type { ExecutionContract, ScanSession } from "@/lib/store";
import { handleScan, signContract, FIXTURE_LEDGER } from "../mock-engine/engine";
import { createMockServer } from "../mock-engine/server";

const OWNER = "james@gmail.com";
// Must equal vitest env CONTRACT_SIGNING_SECRET so the app's issuer signature
// and the mock's verifier agree in the happy-path e2e.
const APP_SECRET = "test-signing-secret";

const dir = path.dirname(fileURLToPath(import.meta.url));
const contractDir = path.join(dir, "..", "contract");
function loadSchema(name: string): object {
  return JSON.parse(fs.readFileSync(path.join(contractDir, name), "utf8"));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(loadSchema("execution-contract.schema.json"));
ajv.addSchema(loadSchema("scan-request.schema.json"));
ajv.addSchema(loadSchema("ledger.schema.json"));
const BASE = "https://streamkill.ai/contract";
const validateContract = ajv.getSchema(`${BASE}/execution-contract.schema.json`)!;
const validateRequest = ajv.getSchema(`${BASE}/scan-request.schema.json`)!;
const validateLedger = ajv.getSchema(`${BASE}/ledger.schema.json`)!;

function session(): ScanSession {
  return {
    id: "sess-1",
    user_id: "user-1",
    verified_email: OWNER,
    status: "ready",
    created_at: new Date().toISOString(),
  };
}

function contract(over: Partial<ExecutionContract> = {}): ExecutionContract {
  return {
    user_id: "user-1",
    scan_session_id: "sess-1",
    verified_email: OWNER,
    allowed_inbox_email: OWNER,
    allowed_actions: { scan_receipts: true, build_ledger: true, cancel_subscription: false },
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    ...over,
  };
}

// Build a wire-shaped scan request (execution_contract, not the internal
// SignedContract `contract` key).
function scanRequest(c: ExecutionContract, secret: string, connectedInbox: string = OWNER) {
  return {
    execution_contract: c,
    signature: signContract(c, secret),
    connected_inbox: connectedInbox,
    token_ref: null,
  };
}

// ---- schema conformance: issuer artifacts + fixture match the shared spec ----

describe("shared schemas match issuer + engine artifacts", () => {
  it("an issued contract validates against execution-contract.schema.json", () => {
    const signed = issueContract(session(), OWNER);
    expect(validateContract(signed.contract), JSON.stringify(validateContract.errors)).toBe(true);
  });

  it("a scan request built from an issued contract validates against scan-request.schema.json", () => {
    const signed = issueContract(session(), OWNER);
    const request = {
      execution_contract: signed.contract,
      signature: signed.signature,
      connected_inbox: OWNER,
      token_ref: null,
    };
    expect(validateRequest(request), JSON.stringify(validateRequest.errors)).toBe(true);
  });

  it("the engine fixture ledger validates against ledger.schema.json", () => {
    expect(validateLedger(FIXTURE_LEDGER), JSON.stringify(validateLedger.errors)).toBe(true);
    expect(FIXTURE_LEDGER.monthlyTotal).toBe(80.78);
    expect(FIXTURE_LEDGER.annualTotal).toBe(969.36);
  });
});

// ---- mock engine unit: every §3 verification outcome ----

describe("mock engine handleScan — §3 verification order", () => {
  const S = "unit-secret";

  it("200 + ledger for a valid request", () => {
    const res = handleScan(scanRequest(contract(), S), { secret: S });
    expect(res.status).toBe(200);
    expect(validateLedger(res.body)).toBe(true);
  });

  it("403 bad_signature when the signature does not verify", () => {
    const req = { ...scanRequest(contract(), S), signature: "0".repeat(64) };
    expect(handleScan(req, { secret: S })).toMatchObject({ status: 403, body: { error: "bad_signature" } });
  });

  it("403 expired when the contract has lapsed", () => {
    const c = contract({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(handleScan(scanRequest(c, S), { secret: S })).toMatchObject({ status: 403, body: { error: "expired" } });
  });

  it("403 email_mismatch when the connected inbox differs", () => {
    const req = scanRequest(contract(), S, "intruder@gmail.com");
    expect(handleScan(req, { secret: S })).toMatchObject({ status: 403, body: { error: "email_mismatch" } });
  });

  it("403 action_not_allowed when scanning is not permitted", () => {
    const c = contract({ allowed_actions: { scan_receipts: false, build_ledger: true, cancel_subscription: false } });
    expect(handleScan(scanRequest(c, S), { secret: S })).toMatchObject({ status: 403, body: { error: "action_not_allowed" } });
  });

  it("403 cancel_not_allowed when cancellation is (illegally) enabled", () => {
    const c = contract({ allowed_actions: { scan_receipts: true, build_ledger: true, cancel_subscription: true } });
    expect(handleScan(scanRequest(c, S), { secret: S })).toMatchObject({ status: 403, body: { error: "cancel_not_allowed" } });
  });

  it("400 bad_request on a malformed body", () => {
    expect(handleScan(null, { secret: S }).status).toBe(400);
    expect(handleScan({}, { secret: S }).status).toBe(400);
  });
});

// ---- end-to-end: the app's real runScan over HTTP against the mock ----

interface Started {
  url: string;
  lastRequestValid(): boolean | null;
  close(): Promise<void>;
}

// Inline server that ALSO validates the exact wire request against the schema,
// so drift in the app's request body is caught end-to-end.
function startCapturingServer(secret: string): Promise<Started> {
  let lastValid: boolean | null = null;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      lastValid = validateRequest(raw) as boolean;
      const result = handleScan(raw, { secret });
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/scan`,
        lastRequestValid: () => lastValid,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function withEngineUrl<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ENGINE_URL;
  process.env.ENGINE_URL = url;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.ENGINE_URL;
    else process.env.ENGINE_URL = prev;
  }
}

describe("end-to-end: runScan ⇄ mock engine over HTTP", () => {
  it("returns a schema-valid ledger, and the wire request conforms to the schema", async () => {
    const srv = await startCapturingServer(APP_SECRET);
    try {
      const ledger = await withEngineUrl(srv.url, () => runScan(issueContract(session(), OWNER), OWNER));
      expect(srv.lastRequestValid()).toBe(true);
      expect(validateLedger(ledger)).toBe(true);
      expect(ledger.monthlyTotal).toBe(80.78);
    } finally {
      await srv.close();
    }
  });

  it("defense in depth: engine independently 403s a contract signed with a different secret", async () => {
    // The app accepts its own signature (its secret) but the engine verifies
    // with a DIFFERENT secret and rejects → web surfaces the engine's precise
    // §3 code, namespaced engine_* to mark it as Gate #2's verdict.
    const server = createMockServer({ secret: "a-different-engine-secret" });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const { port } = server.address() as AddressInfo;
    try {
      let code = "NONE";
      await withEngineUrl(`http://127.0.0.1:${port}/scan`, async () => {
        try {
          await runScan(issueContract(session(), OWNER), OWNER);
        } catch (e) {
          code = e instanceof ExecutionRefused ? e.code : `OTHER:${String(e)}`;
        }
      });
      expect(code).toBe("engine_bad_signature");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
