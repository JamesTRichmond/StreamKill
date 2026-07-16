import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { issueContract } from "@/lib/contract";
import { runScan } from "@/lib/engine";
import type { ScanSession } from "@/lib/store";
import { mintTokenRef, tokenRefForSession, redeemTokenRef, resetVaultForTests } from "@/lib/token-vault";
import { handleScan } from "../mock-engine/engine";

const OWNER = "james@gmail.com";
const APP_SECRET = "test-signing-secret";

const dir = path.dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, "..", "contract", "execution-contract.schema.json"), "utf8")));
ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, "..", "contract", "scan-request.schema.json"), "utf8")));
const validateRequest = ajv.getSchema("https://streamkill.ai/contract/scan-request.schema.json")!;

function session(id = "sess-1"): ScanSession {
  return { id, user_id: "user-1", verified_email: OWNER, status: "ready", created_at: new Date().toISOString() };
}

interface Captured {
  tokenRef: unknown;
  requestValid: boolean;
  redeemedToken?: string;
}

// A stand-in engine that behaves like the real one will: it reads token_ref off
// the (schema-valid) request and redeems it from the vault to get the token it
// would use for the live Gmail fetch.
function startRedeemingServer(secret: string, captured: Captured): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
      captured.requestValid = validateRequest(raw) as boolean;
      captured.tokenRef = (raw as { token_ref?: unknown })?.token_ref;
      if (typeof captured.tokenRef === "string") {
        captured.redeemedToken = redeemTokenRef(captured.tokenRef);
      }
      const result = handleScan(raw, { secret });
      res.writeHead(result.status, { "content-type": "application/json" });
      res.end(JSON.stringify(result.body));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/scan`, close: () => new Promise<void>((r) => server.close(() => r())) });
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

beforeEach(() => resetVaultForTests());

describe("token_ref plumbing: connect mints a handle, the engine redeems it once", () => {
  it("carries a live handle to the engine, which redeems the real token exactly once", async () => {
    const scan = session();
    const REAL_TOKEN = "ya29.the-real-readonly-token";
    const ref = mintTokenRef(scan.id, REAL_TOKEN); // as the connect callback does

    const captured: Captured = { tokenRef: undefined, requestValid: false };
    const srv = await startRedeemingServer(APP_SECRET, captured);
    try {
      const signed = issueContract(scan, OWNER);
      const ledger = await withEngineUrl(srv.url, () =>
        runScan(signed, OWNER, { tokenRef: tokenRefForSession(scan.id) }),
      );

      expect(captured.requestValid).toBe(true); // wire request still schema-valid with a token_ref
      expect(captured.tokenRef).toBe(ref); // the handle reached the engine
      expect(captured.redeemedToken).toBe(REAL_TOKEN); // engine exchanged it for the token
      expect(ledger.items.length).toBeGreaterThan(0);

      // single-use: the handle is spent — a replay gets nothing
      expect(redeemTokenRef(ref)).toBeUndefined();
      expect(tokenRefForSession(scan.id)).toBeUndefined();
    } finally {
      await srv.close();
    }
  });

  it("sends token_ref: null on a stale revisit (no live handle) and still scans", async () => {
    const scan = session("sess-stale");
    // no mint → no live handle (simulates revisiting the ledger later)
    const captured: Captured = { tokenRef: undefined, requestValid: false };
    const srv = await startRedeemingServer(APP_SECRET, captured);
    try {
      const signed = issueContract(scan, OWNER);
      const ledger = await withEngineUrl(srv.url, () =>
        runScan(signed, OWNER, { tokenRef: tokenRefForSession(scan.id) }),
      );
      expect(captured.requestValid).toBe(true);
      expect(captured.tokenRef).toBeNull();
      expect(ledger.items.length).toBeGreaterThan(0); // graceful fallback, no dead-end
    } finally {
      await srv.close();
    }
  });
});
