import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/rls/setup-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
