/**
 * AgentCIS pipeline_progress merge test — covers mergeProgress (lib/agentcis-staging.ts),
 * added so retry-by-id and per-phase counters survive every worker update instead of being
 * clobbered by a full JSON.stringify replace (the same bug class as this session's earlier
 * "field silently overwritten by a later write" issues, just for jsonb instead of a plain
 * column). Run: node --import tsx tests/agentcis-progress-merge.ts
 *
 * Style matches tests/visa-service-extraction.ts: DB integration against the real dev DB,
 * self-cleaning (creates its own throwaway job row, deletes it in a finally block).
 */

import "dotenv/config";

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

async function main() {
  const { mergeProgress } = await import("../src/modules/superadmin/data-extraction/lib/agentcis-staging.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");

  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_url: "https://agentcis-progress-merge-test.invalid",
      source_type: "agentcis",
      status: "processing",
      pipeline_progress: JSON.stringify({ phase: "institution", current: 0, total: 0, agentcis_id: "12345" }),
    })
    .returning("id");

  try {
    await mergeProgress(job.id, { phase: "courses", current: 3, total: 10, courses_extracted: 3 });
    const afterFirst = await masterKnex("superadmin.extraction_jobs").where({ id: job.id }).first();
    assert(afterFirst.pipeline_progress.agentcis_id === "12345", "agentcis_id survives a merge that doesn't mention it");
    assert(afterFirst.pipeline_progress.phase === "courses", "merge overwrites keys it does mention");
    assert(afterFirst.pipeline_progress.courses_extracted === 3, "merge adds new keys");

    await mergeProgress(job.id, { phase: "done", courses_extracted: 10, branches_extracted: 2 });
    const afterSecond = await masterKnex("superadmin.extraction_jobs").where({ id: job.id }).first();
    assert(afterSecond.pipeline_progress.agentcis_id === "12345", "agentcis_id still survives after a second merge");
    assert(afterSecond.pipeline_progress.phase === "done", "second merge updates phase");
    assert(afterSecond.pipeline_progress.courses_extracted === 10, "second merge updates an existing counter");
    assert(afterSecond.pipeline_progress.branches_extracted === 2, "second merge adds a counter the first merge never set");
    // The pre-jsonb-merge implementation would have lost `total: 10` here by fully replacing
    // the object — this only holds because `||` merges onto the existing column value.
    assert(afterSecond.pipeline_progress.total === 10, "a key from the FIRST merge survives a merge that doesn't mention it either");
  } finally {
    await masterKnex("superadmin.extraction_jobs").where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
