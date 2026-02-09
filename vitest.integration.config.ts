import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/tests/integration/**/*.test.ts"],
    reporters: "default",
    setupFiles: ["./src/tests/integration/integration.bootstrap.ts"],
    globalSetup: ["./src/tests/integration/integration.bootstrap.ts"],
    retry: 0,
    testTimeout: 10000,
    sequence: {
      concurrent: false,
    },
  },
});
