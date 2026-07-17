import { describe, it, expect, beforeEach } from "vitest";
import { Pool } from "pg";
import {
  createPostgresVault,
  encryptToken,
  decryptToken,
} from "@/lib/vault/postgres-driver";

// Runs against a REAL Postgres when TEST_DATABASE_URL is set (locally or the
// CI service container); skips otherwise.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("postgres token vault (real database)", () => {
  const vault = () => createPostgresVault(url!);
  const ref = () => `skref_${crypto.randomUUID()}`;
  const sess = () => `sess_${crypto.randomUUID()}`;

  beforeEach(async () => {
    await vault().reset();
  });

  it("mints and redeems exactly once", async () => {
    const v = vault();
    const r = ref();
    const s = sess();
    await v.mint(r, s, "the-token", 60_000);
    expect(await v.refForSession(s)).toBe(r);
    expect(await v.redeem(r)).toBe("the-token");
    expect(await v.redeem(r)).toBeUndefined();
    expect(await v.refForSession(s)).toBeUndefined();
  });

  it("cross-instance: minted on one web instance, redeemed on another", async () => {
    const instanceA = vault();
    const instanceB = vault(); // separate pool, same database — a second web instance
    const r = ref();
    await instanceA.mint(r, sess(), "shared-token", 60_000);
    expect(await instanceB.redeem(r)).toBe("shared-token");
    expect(await instanceA.redeem(r)).toBeUndefined(); // already spent, everywhere
  });

  it("a concurrent double-redeem race yields exactly one winner", async () => {
    const v = vault();
    const r = ref();
    await v.mint(r, sess(), "raced-token", 60_000);
    const results = await Promise.all([v.redeem(r), v.redeem(r), v.redeem(r)]);
    const winners = results.filter((t) => t === "raced-token");
    expect(winners).toHaveLength(1);
  });

  it("expired handles are unredeemable", async () => {
    const v = vault();
    const r = ref();
    await v.mint(r, sess(), "tok", 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await v.redeem(r)).toBeUndefined();
  });

  it("re-minting for the same session invalidates the prior handle", async () => {
    const v = vault();
    const s = sess();
    const first = ref();
    const second = ref();
    await v.mint(first, s, "token-A", 60_000);
    await v.mint(second, s, "token-B", 60_000);
    expect(await v.redeem(first)).toBeUndefined();
    expect(await v.redeem(second)).toBe("token-B");
  });

  it("stores no plaintext token at rest (AES-256-GCM)", async () => {
    const v = vault();
    const r = ref();
    await v.mint(r, sess(), "super-secret-gmail-token", 60_000);
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      const res = await pool.query(`SELECT token_enc FROM sk_token_vault WHERE ref = $1`, [r]);
      const stored: string = res.rows[0].token_enc;
      expect(stored).not.toContain("super-secret-gmail-token");
      // and the ciphertext round-trips only with the right key
      expect(decryptToken(stored)).toBe("super-secret-gmail-token");
    } finally {
      await pool.end();
    }
  });

  it("decryptToken refuses corrupted ciphertext instead of throwing", () => {
    const blob = encryptToken("x");
    const corrupted = blob.slice(0, -4) + "AAAA";
    expect(decryptToken(corrupted)).toBeUndefined();
  });
});
