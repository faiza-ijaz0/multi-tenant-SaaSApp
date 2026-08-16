import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" path mapping, which Vite doesn't read.
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/rls/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Multiple suites each create several real Auth Admin API users in
    // beforeAll; running files in parallel contends on the same endpoint
    // and has caused transient "fetch failed" errors. Serializing files is
    // cheap here (few files) and avoids that entirely.
    fileParallelism: false,
  },
});
