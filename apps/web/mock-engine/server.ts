// Runnable mock engine for local dev + tests.
//
//   npm run mock-engine                 # listens on :8787, endpoint /scan
//   ENGINE_URL=http://localhost:8787/scan npm run dev
//
// Point the web app's ENGINE_URL at this to exercise the full scan flow without
// the private Python engine. The tests import `createMockServer` and listen on
// an ephemeral port.

import http from "node:http";
import { fileURLToPath } from "node:url";
import { handleScan } from "./engine";

const DEFAULT_PORT = 8787;

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

export interface MockServerOptions {
  /** Shared HMAC secret. Defaults to CONTRACT_SIGNING_SECRET / AUTH_SECRET. */
  secret?: string;
  /** Log each decision. Off by default (tests stay quiet). */
  verbose?: boolean;
}

export function createMockServer(opts: MockServerOptions = {}): http.Server {
  const secret = opts.secret ?? process.env.CONTRACT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "";

  return http.createServer(async (req, res) => {
    // Health check sibling (engine's choice per the contract).
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, engine: "mock" }));
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad_request" }));
      return;
    }

    const result = handleScan(body, { secret });
    if (opts.verbose) {
      const summary = "error" in result.body ? result.body.error : "ok";
      console.log(`[mock-engine] ${req.method} ${req.url} -> ${result.status} ${summary}`);
    }
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
}

// Start only when run directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const secret = process.env.CONTRACT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (!secret) {
    console.error("[mock-engine] CONTRACT_SIGNING_SECRET (or AUTH_SECRET) must be set.");
    process.exit(1);
  }
  createMockServer({ secret, verbose: true }).listen(port, () => {
    console.log(`[mock-engine] listening on http://localhost:${port}  (POST /scan, GET /health)`);
  });
}
