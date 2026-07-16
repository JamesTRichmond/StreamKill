import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Match the app's `@/*` -> `src/*` path alias.
      "@": path.resolve(dir, "src"),
      // `server-only` throws outside an RSC bundle; stub it for unit tests.
      "server-only": path.resolve(dir, "test/server-only.stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Trust modules read these at import time.
    env: {
      CONTRACT_SIGNING_SECRET: "test-signing-secret",
      STREAMKILL_DATA_DIR: path.join(os.tmpdir(), "streamkill-vitest-data"),
    },
  },
});
