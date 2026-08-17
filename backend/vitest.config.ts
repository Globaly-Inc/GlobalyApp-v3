import { defineConfig } from "vitest/config";
import { testEnv } from "./tests/setup/db-url.js";

export default defineConfig({
  test: {
    projects: [
      {
        // Zero external dependencies — runs anywhere, fast.
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        // Talks to TEST_DATABASE_URL. Skips (with a warning) when it is unreachable.
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          env: testEnv(),
          globalSetup: ["tests/setup/global-setup.ts"],
          setupFiles: ["tests/setup/integration-setup.ts"],
          // Shared Postgres state — no cross-file parallelism.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      // Scoped to the code this suite owns. Widen as later waves add tests.
      include: [
        "src/shared/pagination.ts",
        "src/shared/errors.ts",
        "src/modules/auth/auth.service.ts",
        "src/modules/auth/auth.repository.ts",
        "src/modules/auth/auth.routes.ts",
        "src/modules/auth/consts.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
