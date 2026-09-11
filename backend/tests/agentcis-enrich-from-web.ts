/**
 * enrichFromWebsite (services/agentcis-enrichment.service.ts) — the "Enrich from Website" trigger,
 * Phase 2 of the AgentCIS website-enrichment plan. Covers the guard rails: only an AgentCIS job,
 * only once its import finished ("done"), only when AgentCIS gave a real website (not its own
 * synthetic agentcis.com/institution/{id} placeholder) — and that a valid call dispatches to the
 * JOBS queue (the normal discovery pipeline), not some AgentCIS-specific queue.
 *
 * Style matches tests/rerun-agentcis.ts: DB integration against the real dev DB, queueService.publish
 * mocked out (a real LavinMQ connection never gets opened, and never needs closing) rather than
 * tests/agentcis-progress-merge.ts's plain style, since this is the first AgentCIS test that
 * actually publishes.
 *
 * Run: node --import tsx tests/agentcis-enrich-from-web.ts
 */
import "dotenv/config";
import { queueService } from "../src/shared/queue/queueService.js";

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

async function expectRejects(promise: Promise<unknown>, expectedName: string, label: string) {
  try {
    await promise;
    failed++;
    console.error(`FAIL ${label}: expected it to throw ${expectedName}, but it resolved`);
  } catch (e) {
    const name = (e as Error).constructor.name;
    if (name === expectedName) passed++;
    else { failed++; console.error(`FAIL ${label}: expected ${expectedName}, got ${name}: ${(e as Error).message}`); }
  }
}

async function main() {
  const { enrichFromWebsite } = await import("../src/modules/superadmin/data-extraction/services/agentcis-enrichment.service.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";
  const ADMIN_ID = 1;

  const originalPublish = queueService.publish.bind(queueService);
  let calls: Array<{ queue: string; message: unknown }> = [];
  queueService.publish = (async (queue: string, message: unknown) => {
    calls.push({ queue, message });
  }) as typeof queueService.publish;

  const [notAgentcisJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://enrich-web-test-1.invalid", source_type: "extraction", status: "done" })
    .returning("id");
  const [notDoneJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://enrich-web-test-2.invalid", source_type: "agentcis", status: "processing" })
    .returning("id");
  const [syntheticUrlJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://agentcis.com/institution/999999", source_type: "agentcis", status: "done" })
    .returning("id");
  const [validJob] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://enrich-web-test-valid.invalid", source_type: "agentcis", status: "done" })
    .returning("id");

  try {
    await expectRejects(
      enrichFromWebsite("00000000-0000-0000-0000-000000000000", ADMIN_ID),
      "NotFoundError", "a job id that doesn't exist",
    );
    await expectRejects(
      enrichFromWebsite(notAgentcisJob.id, ADMIN_ID),
      "BadRequestError", "a non-AgentCIS job",
    );
    await expectRejects(
      enrichFromWebsite(notDoneJob.id, ADMIN_ID),
      "BadRequestError", "an AgentCIS job that hasn't finished importing",
    );
    await expectRejects(
      enrichFromWebsite(syntheticUrlJob.id, ADMIN_ID),
      "BadRequestError", "an AgentCIS job with no real website (synthetic URL)",
    );
    assert(calls.length === 0, "none of the rejected calls published anything");

    const result = await enrichFromWebsite(validJob.id, ADMIN_ID);
    assert((result as { updated: boolean }).updated === true, "a valid, done, real-URL AgentCIS job succeeds");
    assert(calls.length === 1, "exactly one publish happened");
    assert(calls[0]?.queue === "extraction_jobs", "dispatched to the normal JOBS queue, not an AgentCIS-specific one");
    assert((calls[0]?.message as { jobId: string })?.jobId === validJob.id, "publish message carries the right job id");
    assert((calls[0]?.message as { resumed: boolean })?.resumed === true, "resumed:true — same shape deep-scrape/rerun already use");
  } finally {
    queueService.publish = originalPublish;
    await masterKnex(`${S}.extraction_jobs`).whereIn("id", [notAgentcisJob.id, notDoneJob.id, syntheticUrlJob.id, validJob.id]).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
