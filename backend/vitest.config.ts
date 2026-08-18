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
          // src/config.ts zod-parses at module scope, so anything importing a
          // module that reaches it needs the env present even with no DB.
          // LLM_THROTTLE_MS: the extraction client sleeps 500ms between model calls
          // to be polite to Gemini. With an injected fixture provider there is nobody
          // to be polite to, and the default cost the unit project 22 seconds of
          // sleeping. extraction-llm-parsing.test.ts re-imports the module with a
          // non-zero gap to cover the throttle itself.
          // HOST_THROTTLE_MS: same for the scraper's per-host politeness gap, whose
          // 800ms default is spent waiting on a stubbed fetch.
          // ("1", not "0": both are read with `|| default`, so a zero falls back.)
          env: { ...testEnv(), LLM_THROTTLE_MS: "1", HOST_THROTTLE_MS: "1" },
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
      // Scoped to the code this suite owns. Every wave widens this — code with
      // tests that is not listed here never registers in CI coverage.
      include: [
        // Wave A
        "src/shared/pagination.ts",
        "src/shared/errors.ts",
        "src/modules/auth/auth.service.ts",
        "src/modules/auth/auth.repository.ts",
        "src/modules/auth/auth.routes.ts",
        "src/modules/auth/consts.ts",
        // C1 — tenant services catalog
        "src/modules/businesses/routes/service*.ts",
        "src/modules/superadmin/platform/business-services/**/*.ts",
        // C3 — billing
        "src/modules/billing/**/*.ts",
        // C4 — admin observability
        "src/modules/superadmin/audit-logs/**/*.ts",
        // C2 / C2b — public catalog, profiles, SEO (search module)
        "src/modules/search/**/*.ts",
        // D1 — enquiries
        "src/modules/enquiries/**/*.ts",
        // D2 — messaging
        "src/modules/messaging/**/*.ts",
        // E1 — knowledge base + RAG. Listed file-by-file on purpose: PR #42's
        // rack.* and knowledge-crawl.worker arrived untested and a module-wide
        // glob would report ~62% for code this wave did not write.
        "src/modules/superadmin/ai-knowledge/lib/*.ts",
        "src/modules/superadmin/ai-knowledge/repositories/chunk.repository.ts",
        "src/modules/superadmin/ai-knowledge/repositories/retrieval.repository.ts",
        "src/modules/superadmin/ai-knowledge/routes/content.routes.ts",
        "src/modules/superadmin/ai-knowledge/routes/retrieval.routes.ts",
        "src/modules/superadmin/ai-knowledge/services/content.service.ts",
        "src/modules/superadmin/ai-knowledge/services/dispatch.service.ts",
        "src/modules/superadmin/ai-knowledge/services/embedding.service.ts",
        "src/modules/superadmin/ai-knowledge/services/retrieval.service.ts",
        "src/modules/superadmin/ai-knowledge/shared/*.ts",
        // E2 — AI counsellor
        "src/modules/ai-counsellor/**/*.ts",
        // D4 — feed comments, public student profiles
        "src/modules/feed/**/*comment*.ts",
        "src/modules/platform-users/**/*public-profile*.ts",
        // D3 — events, ticketing, notifications
        "src/modules/events/**/*.ts",
        "src/modules/notifications/**/*.ts",
        // G2 — jobs board: posting, applicants, AI assist, admin oversight
        "src/modules/jobs/**/*.ts",
        // G4 — ambassador ops + training certificates/gamification
        "src/modules/ambassadors/**/*.ts",
        "src/modules/training/**/*.ts",
        // E3 / E4 — scribe (transcription, coaching, review) and the LMS
        // delivery gap G4 left open (assignment submissions, quizzes,
        // enrolment applications, invitations, learner catalogue).
        "src/modules/scribe/**/*.ts",
        // G7 — AI-embed widget, FX rates cache, cross-app GlobalyAI feed.
        // gemini-stream.ts is already excluded below; the widget script is a served
        // string asserted on in tests/integration/ai-embed.test.ts.
        "src/modules/ai-embed/**/*.ts",
        "src/modules/fx/**/*.ts",
        "src/modules/cross-app/**/*.ts",
        // Shared URL validation (the stored-XSS guard every schema routes through)
        "src/shared/url.ts",
        // G1 — scholarships moderation, visa/MARA public directory + promote
        "src/modules/visas/**/*.ts",
        "src/modules/scholarships/**/*.ts",
        "src/modules/superadmin/monitoring/**/*.ts",
        "src/modules/superadmin/data-extraction/lib/immigration-mappers.ts",
        "src/modules/superadmin/data-extraction/repositories/immigration.repository.ts",
        "src/modules/superadmin/data-extraction/services/immigration.service.ts",
        // G8 — the 3.4 extraction tail: merge-duplicates, quality validator,
        // context-ingest bundle, scheduler trigger.
        "src/modules/superadmin/data-extraction/lib/merge-duplicates.ts",
        "src/modules/superadmin/data-extraction/lib/quality-rules.ts",
        "src/modules/superadmin/data-extraction/lib/quality-provider.ts",
        "src/modules/superadmin/data-extraction/lib/context-bundle.ts",
        "src/modules/superadmin/data-extraction/repositories/merge.repository.ts",
        "src/modules/superadmin/data-extraction/repositories/quality.repository.ts",
        "src/modules/superadmin/data-extraction/repositories/context.repository.ts",
        "src/modules/superadmin/data-extraction/services/merge.service.ts",
        "src/modules/superadmin/data-extraction/services/quality.service.ts",
        "src/modules/superadmin/data-extraction/services/schedule.service.ts",
        "src/modules/superadmin/data-extraction/routes/quality.routes.ts",
        // A-COV — the five extraction areas G8 named as uncovered: the scraper, LLM
        // parsing, the staging writer, the fee matcher and junction assignment.
        // (Junction assignment has no file of its own; it lives in staging-writer.ts.)
        "src/modules/superadmin/data-extraction/lib/scraper.ts",
        "src/modules/superadmin/data-extraction/lib/llm-client.ts",
        "src/modules/superadmin/data-extraction/lib/staging-writer.ts",
        "src/modules/superadmin/data-extraction/lib/fee-matcher.ts",
        "src/modules/superadmin/data-extraction/lib/installment-parser.ts",
        // G5 — ads (campaigns, impressions, leads) + applications & charges
        "src/modules/ads/**/*.ts",
        "src/modules/applications/**/*.ts",
        // G6 — favourites, saved filters, waitlist. (Push lives under the
        // notifications glob above, already listed by D3.)
        "src/modules/favorites/**/*.ts",
        "src/modules/waitlist/**/*.ts",
        // G9 — the eight V3-only service verticals: routes, review, promote.
        "src/modules/superadmin/data-extraction/lib/service-verticals.ts",
        "src/modules/superadmin/data-extraction/repositories/service-verticals.repository.ts",
        "src/modules/superadmin/data-extraction/services/service-verticals.service.ts",
        "src/modules/superadmin/data-extraction/routes/service-verticals.routes.ts",
        "src/modules/superadmin/data-extraction/schemas/service-verticals.schema.ts",
      ],
      exclude: ["src/modules/ai-counsellor/lib/gemini-stream.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
