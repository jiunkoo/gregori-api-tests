import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/tests/contract/**/*.test.ts"],
    reporters: "default",
    setupFiles: ["./src/tests/contract/test.bootstrap.ts"],
    retry: 0,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "lcov", "html"],
      exclude: [
        "src/tests/contract/test.bootstrap.ts",
        "src/utils/mock-helpers.ts",
      ],
    },
  },
});
