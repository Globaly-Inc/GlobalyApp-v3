/**
 * stageProduct (agentcis-product-staging.ts) — duration_weeks now goes through the SAME shared
 * resolveDurationWeeks every other writer uses, instead of a hand-rolled durationToWeeks call
 * that only ever looked at the course-level duration field. Covers the new fallback this adds
 * (a prose duration in the description, when AgentCIS states no parseable duration at all) and
 * confirms the existing structured-duration behavior is unchanged.
 *
 * Run: node --import tsx tests/agentcis-product-duration-weeks.ts
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
  const { stageProduct, newStagingCounters } = await import("../src/modules/superadmin/data-extraction/lib/agentcis-product-staging.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";

  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://agentcis-duration-weeks-test.invalid", source_type: "agentcis", status: "processing" })
    .returning("id");

  try {
    // Structured duration present — unchanged behavior, resolves directly, no fallback needed.
    await stageProduct(
      job.id, { duration: "2 Years" }, "Structured Duration Course", "Test University",
      "https://agentcis-duration-weeks-test.invalid", {}, [], newStagingCounters(),
    );
    const structured = await masterKnex(`${S}.extraction_courses`)
      .where({ job_id: job.id, name: "Structured Duration Course" }).first("duration_weeks");
    assert(structured.duration_weeks === 104, "structured 'duration: 2 Years' still resolves to 104 weeks directly");

    // No parseable structured duration anywhere, but the description states one in prose — the
    // NEW fallback this change adds; the old hand-rolled durationToWeeks path had no way to
    // reach this at all.
    await stageProduct(
      job.id,
      { description: "This is a 3-year full-time programme designed to give students a broad grounding." },
      "Prose Duration Course", "Test University",
      "https://agentcis-duration-weeks-test.invalid", {}, [], newStagingCounters(),
    );
    const prose = await masterKnex(`${S}.extraction_courses`)
      .where({ job_id: job.id, name: "Prose Duration Course" }).first("duration_weeks");
    assert(prose.duration_weeks === 156, "a prose '3-year full-time programme' description fills duration_weeks (156 weeks) when AgentCIS states no structured duration");

    // No duration anywhere at all (no structured field, no prose cue) — stays null, never guessed.
    await stageProduct(
      job.id, { description: "A well-regarded course in the field." }, "No Duration Course", "Test University",
      "https://agentcis-duration-weeks-test.invalid", {}, [], newStagingCounters(),
    );
    const none = await masterKnex(`${S}.extraction_courses`)
      .where({ job_id: job.id, name: "No Duration Course" }).first("duration_weeks");
    assert(none.duration_weeks === null, "no duration signal anywhere -> duration_weeks stays null, not guessed");
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
