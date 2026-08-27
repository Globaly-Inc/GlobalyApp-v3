/**
 * Rerun-job routing test — service-level against the real dev DB.
 * Run: node --import tsx tests/rerun-agentcis.ts
 *
 * Real bug: "Re-run Extraction" always re-dispatched to the generic web-scrape job
 * worker (EXTRACTION_QUEUES.JOBS), even for a job whose source_type is "agentcis" —
 * imported wholesale from the AgentCIS API, never crawled from the institution's own
 * site. That made a rerun try to scrape the real institution homepage (e.g.
 * concordia.ab.ca) via Firecrawl, hitting rate limits for a site the job never needed
 * to touch. Fix: rerunJob() now branches on source_type and re-dispatches an AgentCIS
 * job to EXTRACTION_QUEUES.AGENTCIS via importAgentCIS() instead.
 *
 * Style matches tests/courses.ts: real DB, no mocking of masterKnex — only the shared
 * LavinMQ publish() is monkey-patched, so this doesn't need a running broker.
 */

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
  const originalPublish = queueService.publish.bind(queueService);
  let calls: Array<{ queue: string; message: unknown }> = [];
  queueService.publish = (async (queue: string, message: unknown) => {
    calls.push({ queue, message });
  }) as typeof queueService.publish;

  try {
    await assert("agentcis job re-dispatches to the AGENTCIS queue, not JOBS", async () => {
      const jobId = await insertJob({
        source_type: "agentcis",
        aggregator_name: "AgentCIS",
        pipeline_progress: JSON.stringify({ phase: "done", agentcis_id: "TEST-AGENTCIS-123" }),
      });
      jobIds.push(jobId);
      calls = [];

      const result = await rerunJob(jobId, FAKE_ADMIN_ID);

      eq(calls.length, 1, "publish call count");
      eq(calls[0].queue, "extraction_agentcis", "queue name");
      eq(JSON.stringify(calls[0].message), JSON.stringify({ institutionId: "TEST-AGENTCIS-123" }), "message");
      eq((result as { reimport?: boolean }).reimport, true, "result.reimport");
    });

    await assert("agentcis job with no agentcis_id on record throws instead of mis-dispatching", async () => {
      const jobId = await insertJob({
        source_type: "agentcis",
        aggregator_name: "AgentCIS",
        pipeline_progress: JSON.stringify({ phase: "done" }),
      });
      jobIds.push(jobId);
      calls = [];

      let threw = false;
      try {
        await rerunJob(jobId, FAKE_ADMIN_ID);
      } catch {
        threw = true;
      }
      eq(threw, true, "rerunJob threw");
      eq(calls.length, 0, "no publish happened");
    });

    await assert("a normal (non-agentcis) job still re-crawls via the JOBS queue", async () => {
      const jobId = await insertJob({
        source_type: "scrape",
        pipeline_progress: JSON.stringify({ site_mapping: "done" }),
      });
      jobIds.push(jobId);
      calls = [];

      await rerunJob(jobId, FAKE_ADMIN_ID);

      eq(calls.length, 1, "publish call count");
      eq(calls[0].queue, "extraction_jobs", "queue name");
      const row = await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).first();
      eq(row.status, "pending", "resetPipeline ran — status back to pending");
    });
  } finally {
    queueService.publish = originalPublish;
    if (jobIds.length) await masterKnex("superadmin.extraction_jobs").whereIn("id", jobIds).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
