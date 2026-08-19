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
        // C-BIZ-FE — business portal dashboard: the greeting, the low-credit
        // flag, the pending-verification branch and the locked/unlocked lead
        // headline all live in utils/ so they are asserted without a DOM.
        "src/app/business/portal/utils/index.ts",
        // The DB-sourced URL allowlist and the one resolver that calls it before an <img src>.
        // Same `**` spelling reason as above — a literal `(web)` never matches.
        "src/lib/safe-url.ts",
        "src/app/**/country/hero-fallback.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
