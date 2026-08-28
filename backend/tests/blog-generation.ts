/**
 * AI blog generation tests — the prompt contract, response parsing, and the job
 * repository's atomic claim.
 * Run: node --import tsx tests/blog-generation.ts   (or: npm run test:blog-generation)
 *
 * Style matches tests/chunker.ts: plain tsx script, manual counters, no framework.
 * The repository test (c) runs against the real DB configured in backend/.env and
 * deletes every row it creates in a `finally` — no dedicated _test database needed.
 */

import { config } from "../src/config.js";
import { masterKnex } from "../src/core/db/master-pool.js";
import { buildArticlePrompt, parseArticleResponse } from "../src/modules/superadmin/marketing/blog/services/article-prompt.js";
import * as jobsRepo from "../src/modules/superadmin/marketing/blog/repositories/generation-jobs.repository.js";
import { createGeneration } from "../src/modules/superadmin/marketing/blog/services/generation.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

// ── (a) buildArticlePrompt() ────────────────────────────────────────────────────────

function testBuildArticlePrompt() {
  console.log("\nbuildArticlePrompt()");
  const prompt = buildArticlePrompt({
    keywords: ["study in canada", "student visa"],
    context: "Focus on 2026 intake changes.",
    topic: "Study",
    country: "Canada",
    knowledgeChunks: ["Canada requires a valid study permit for programs over 6 months."],
    linkManifest: [
      { title: "UK Graduate Visa Route Explained", url: "/blog/2" },
      { title: "Canada", url: "/country/canada" },
    ],
  });

  assert(prompt.includes("study in canada"), "contains keyword 1");
  assert(prompt.includes("student visa"), "contains keyword 2");
  assert(prompt.includes("/blog/2"), "contains the internal blog manifest URL");
  assert(prompt.includes("/country/canada"), "contains the internal country manifest URL");
  assert(prompt.includes("ONLY link to URLs from the manifest"), "contains the manifest-only link instruction verbatim");
}

// ── (b) parseArticleResponse() ──────────────────────────────────────────────────────

function validArticleJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: "Studying in Canada: A 2026 Guide",
    slug: "studying-in-canada-2026-guide",
    excerpt: "Everything international students need to know before applying.",
    content: "<h1>Studying in Canada</h1><p>Canada is a top destination for study in canada.</p>",
    meta_title: "Studying in Canada: 2026 Guide",
    meta_description:
      "A complete guide to studying in Canada in 2026, covering visas, costs, and top programs for international students.",
    focus_keyword: "study in canada",
    tags: ["canada", "study-abroad"],
    reading_time_minutes: 4,
    faq: [
      { q: "Do I need a study permit?", a: "Yes, for programs longer than 6 months." },
      { q: "How much does it cost?", a: "Tuition varies by province and program." },
      { q: "Can I work while studying?", a: "Yes, up to 20 hours per week off-campus." },
    ],
    ...overrides,
  });
}

function testParseArticleResponse() {
  console.log("\nparseArticleResponse()");

  const valid = parseArticleResponse(validArticleJson());
  assert(valid.meta_title === "Studying in Canada: 2026 Guide", "valid response parses meta_title");
  assert(valid.faq.length === 3, "valid response parses the faq array", valid.faq.length);

  let threwMissing = false;
  try {
    const { meta_title: _omit, ...rest } = JSON.parse(validArticleJson()) as Record<string, unknown>;
    parseArticleResponse(JSON.stringify(rest));
  } catch {
    threwMissing = true;
  }
  assert(threwMissing, "rejects a response missing meta_title");

  let threwTooLong = false;
  try {
    parseArticleResponse(validArticleJson({ meta_title: "x".repeat(61) }));
  } catch {
    threwTooLong = true;
  }
  assert(threwTooLong, "rejects a response with meta_title > 60 chars");

  // A ```json fenced response (the model sometimes adds one despite instructions) must
  // still parse — this is the fence-stripping path, not a rejection case.
  const fenced = parseArticleResponse("```json\n" + validArticleJson() + "\n```");
  assert(fenced.title === "Studying in Canada: A 2026 Guide", "strips a markdown code fence before parsing");
}

// ── (c) generation-jobs.repository — createJobs() + claimJob() atomicity ───────────

async function testJobRepository() {
  console.log("\ngeneration-jobs.repository");
  const created = await jobsRepo.createJobs([
    { keywords: ["blog-gen-test-a"], context: null, topic: null, country: null },
    { keywords: ["blog-gen-test-b"], context: null, topic: null, country: null },
  ]);
  const ids = created.map((j) => j.id);

  try {
    assert(created.length === 2, "createJobs inserts N rows", created.length);
    assert(created.every((j) => j.status === "pending"), "created rows start pending", created.map((j) => j.status));

    const [claimA, claimB] = await Promise.all([jobsRepo.claimJob(ids[0]!), jobsRepo.claimJob(ids[1]!)]);
    assert(!!claimA && !!claimB, "both concurrent claims on different pending ids succeed", { claimA, claimB });
    assert(claimA?.id !== claimB?.id, "concurrent claims return different jobs", { a: claimA?.id, b: claimB?.id });
    assert(
      claimA?.status === "running" && claimB?.status === "running",
      "claimed jobs flip to running",
      { a: claimA?.status, b: claimB?.status },
    );

    // Genuine atomicity: race two claims on the SAME job id — exactly one may win.
    const [third] = await jobsRepo.createJobs([{ keywords: ["blog-gen-test-c"], context: null, topic: null, country: null }]);
    ids.push(third!.id);
    const [raceA, raceB] = await Promise.all([jobsRepo.claimJob(third!.id), jobsRepo.claimJob(third!.id)]);
    const winners = [raceA, raceB].filter(Boolean);
    assert(winners.length === 1, "racing the same job id — exactly one claim wins", { raceA: !!raceA, raceB: !!raceB });

    const statuses = await jobsRepo.findJobsByIds(ids);
    assert(statuses.length === ids.length, "findJobsByIds returns one row per id", statuses.length);
  } finally {
    await masterKnex("superadmin.blog_generation_jobs").whereIn("id", ids).delete();
  }
}

// (d) Queue-down resilience: createGeneration must SUCCEED when LavinMQ is unreachable —
// jobs stay `pending` in the DB and the sweep worker picks them up later. A publish
// failure failing the POST is the bug this guards against. Assumes no local LavinMQ when
// run in CI/dev without one; when a broker IS reachable, publish succeeds and the
// assertion still holds (success either way — what must never happen is a throw).
async function testCreateGenerationQueueDown() {
  let ids: number[] = [];
  try {
    const result = await createGeneration({ keywords: ["queue-down-test"], count: 2 } as never);
    ids = result.jobIds;
    assert(ids.length === 2, "createGeneration succeeds even if queue publish fails");
    const rows = await jobsRepo.findJobsByIds(ids);
    assert(rows.every((r) => r.status === "pending"), "jobs are pending in the DB, awaiting a worker");
  } catch (err) {
    assert(false, "createGeneration must not throw when the queue is down", err instanceof Error ? err.message : err);
  } finally {
    if (ids.length) await masterKnex("superadmin.blog_generation_jobs").whereIn("id", ids).delete();
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Blog generation tests — DB=${config.DB_NAME}`);

  testBuildArticlePrompt();
  testParseArticleResponse();
  await testJobRepository();
  await testCreateGenerationQueueDown();

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\nSUITE ERROR:", err);
  await masterKnex.destroy();
  process.exit(1);
});
