import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors backend/vitest.config.ts: vitest, a `unit` project, tests under tests/.
//
// Node environment, no jsdom and no testing-library on purpose. Everything worth
// asserting on in these features is pure — the null-target render decision, the
// rate-limit classification, the tab counts — so it lives in each feature's
// utils/index.ts and is tested directly. Rendering React would add three
// dependencies to re-assert the same branches through the DOM.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src") },
  },
  test: {
    projects: [
      {
        resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      // Scoped to the code this suite owns, the same convention the backend config
      // uses — code with tests that is not listed here never registers in CI.
      include: [
        // G6-FE — favourites page + public waitlist form.
        // The waitlist path is spelled with a ** rather than the literal `(web)`
        // route group: the glob matcher reads `(...)` as a pattern group, so the
        // literal path silently matches nothing and the file drops out of the report.
        "src/app/personal/favorites/utils/index.ts",
        "src/app/**/waitlist/utils/index.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
