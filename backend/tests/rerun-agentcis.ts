/**
 * Rerun-job routing test — service-level against the real dev DB.
 * Run: node --import tsx tests/rerun-agentcis.ts
 *
 * Re-run restarts THIS job on its own row for every source type. An AgentCIS job used to
 * re-dispatch the import instead, which lands on a FRESH row and abandons whatever the job
 * already had — one live case replaced a 43-page, 73-course job with a 6-course import.
 *
 * Style matches tests/courses.ts: real DB, no mocking of masterKnex — only the shared
 * LavinMQ publish() is monkey-patched, so this doesn't need a running broker.
 */

import { randomUUID } from "node:crypto";
import { masterKnex } from "../src/core/db/master-pool.js";
import { queueService } from "../src/shared/queue/queueService.js";

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.stack ?? err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const FAKE_ADMIN_ID = 999_999_999; // logAudit no-ops when this doesn't resolve to a real admin

// resetPipeline stamps extraction_jobs.updated_by_platform_user_id, an FK to platform_users, so
// the re-crawl path needs a real user — and the test makes its own rather than borrowing one.
//
// It used to SELECT whatever non-admin user happened to exist, which failed the re-crawl
// assertion on a perfectly valid fresh or admin-only dev DB for a reason that has nothing to do
// with the code under test (Greptile), and on every other DB stamped a real person's id onto the
// fixture job. Non-admin (it is in no admin_users row) keeps logAudit a no-op, so no audit rows
// are left behind either.
//
// Deleted by exact id in the finally block, after the jobs that reference it.
async function createTestPlatformUser(): Promise<number> {
  const [row] = await masterKnex("platform_users")
    .insert({
      first_name: "Rerun",
      last_name: "RoutingTest",
      // Unique per run: a row orphaned by a crashed run can never collide with the next one.
      email: `rerun-routing-test+${randomUUID()}@example.invalid`,
    })
    .returning("id");
  return Number(row.id);
}

async function insertJob(overrides: Record<string, unknown>): Promise<string> {
  const [row] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: "Rerun Routing Test Institution",
      institution_url: "https://rerun-routing-test.example",
      status: "failed",
      ...overrides,
    })
    .returning("id");
  return row.id as string;
}

async function main() {
  console.log("Rerun-job routing tests (DB integration)\n");

  const { rerunJob } = await import("../src/modules/superadmin/data-extraction/services/queue.service.js");

  const jobIds: string[] = [];
  let testUserId: number | null = null;
  const originalPublish = queueService.publish.bind(queueService);
  let calls: Array<{ queue: string; message: unknown }> = [];
  queueService.publish = (async (queue: string, message: unknown) => {
    calls.push({ queue, message });
  }) as typeof queueService.publish;

  try {
    await assert("an agentcis job re-runs in place via the JOBS queue, like any other job", async () => {
      const jobId = await insertJob({
        source_type: "agentcis",
        aggregator_name: "AgentCIS",
        pipeline_progress: JSON.stringify({ phase: "done", agentcis_id: "TEST-AGENTCIS-456" }),
      });
      jobIds.push(jobId);
      calls = [];

      testUserId ??= await createTestPlatformUser();
      const result = await rerunJob(jobId, testUserId);

      eq(calls.length, 1, "publish call count");
      eq(calls[0].queue, "extraction_jobs", "queue name — the crawl pipeline, not the AgentCIS import");
      eq((calls[0].message as { jobId?: string }).jobId, jobId, "dispatched for the SAME job id");
      eq((result as { reimport?: boolean }).reimport, undefined, "result.reimport");
      eq((result as { mode?: string }).mode, "full", "result.mode");

      const row = await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).first();
      eq(row.status, "pending", "the existing row was reset — no new job was created");
      eq(row.pipeline_progress.site_map, "waiting", "its discovery steps are back to waiting");
      eq(row.pipeline_progress.agentcis_id, "TEST-AGENTCIS-456", "and it still knows its AgentCIS institution");
    });

    await assert("a normal (non-agentcis) job still re-crawls via the JOBS queue", async () => {
      const jobId = await insertJob({
        source_type: "scrape",
        pipeline_progress: JSON.stringify({ site_mapping: "done" }),
      });
      jobIds.push(jobId);
      calls = [];

      testUserId ??= await createTestPlatformUser();
      await rerunJob(jobId, testUserId);

      eq(calls.length, 1, "publish call count");
      eq(calls[0].queue, "extraction_jobs", "queue name");
      const row = await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).first();
      eq(row.status, "pending", "resetPipeline ran — status back to pending");
    });
  } finally {
    queueService.publish = originalPublish;
    if (jobIds.length) await masterKnex("superadmin.extraction_jobs").whereIn("id", jobIds).delete();
    // After the jobs that FK to it, and by exact id — never by an email pattern, which would be
    // one typo away from deleting real accounts.
    if (testUserId != null) await masterKnex("platform_users").where({ id: testUserId }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
