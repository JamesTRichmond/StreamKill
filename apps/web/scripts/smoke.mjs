#!/usr/bin/env node
// HTTP smoke test against a running production build.
//
// Boots nothing itself — point it at a server started with `npm run start`
// (CI does exactly that). Asserts the things unit tests cannot: the app boots,
// every protected surface fails closed for an anonymous visitor, and the
// engine redeem endpoint's wire semantics hold over real HTTP.
//
//   BASE_URL=http://localhost:3100 SMOKE_SECRET=dev-secret node scripts/smoke.mjs

import crypto from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SECRET = process.env.SMOKE_SECRET ?? "dev-secret";

let failures = 0;

function check(name, ok, detail = "") {
  const mark = ok ? "ok " : "FAIL";
  console.log(`${mark}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function get(path) {
  return fetch(`${BASE}${path}`, { redirect: "manual" });
}

async function main() {
  // Landing page serves.
  const landing = await get("/");
  check("GET / is 200", landing.status === 200, `got ${landing.status}`);
  const html = await landing.text();
  check("landing shows the product promise", html.includes("StreamKill"));

  // Every protected surface fails closed to / for an anonymous visitor.
  for (const path of ["/ledger", "/receipts", "/scan", "/disconnect", "/api/gmail/connect"]) {
    const res = await get(path);
    const location = res.headers.get("location") ?? "";
    const redirectedHome =
      res.status >= 300 && res.status < 400 && new URL(location, BASE).pathname === "/";
    check(`${path} fails closed to /`, redirectedHome, `got ${res.status} -> ${location}`);
  }

  // Redeem endpoint wire semantics (ENGINE_CONTRACT §7).
  const redeem = (body, signature) =>
    fetch(`${BASE}/api/engine/token/redeem`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-sk-signature": signature } : {}),
      },
      body,
    });

  const sig = (ref) => crypto.createHmac("sha256", SECRET).update(ref).digest("hex");

  check("redeem: malformed body is 400", (await redeem("{}")).status === 400);
  check("redeem: invalid json is 400", (await redeem("not json")).status === 400);
  check(
    "redeem: wrong signature is 401",
    (await redeem(JSON.stringify({ token_ref: "skref_ghost" }), "deadbeef")).status === 401,
  );
  check(
    "redeem: unknown ref with valid signature is 410",
    (await redeem(JSON.stringify({ token_ref: "skref_ghost" }), sig("skref_ghost"))).status === 410,
  );

  console.log(failures === 0 ? "\nSMOKE: OK" : `\nSMOKE: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("SMOKE: could not reach the server:", err.message);
  process.exit(1);
});
