/**
 * degreeSignature + writeCourse's degree-qualifier-aware dedup fallback.
 *
 * Real bug (Aberystwyth University, 2026-09-11, via the "Enrich from Website" feature): AgentCIS
 * names a course "Biology BSc (Hons)" (qualifier last); the institution's own site names the SAME
 * course "BSc Biology" (qualifier first). writeCourse's exact-match dedup is position-sensitive,
 * so it never matched — every scraped course became a SECOND row instead of attaching study units
 * to the one AgentCIS already had. Measured before this fix: 18 of 474 AgentCIS courses matched a
 * scraped page; the other 456 sat as unlinked duplicates, capping study-unit coverage under half
 * the catalogue.
 *
 * Style: the degreeSignature part is pure (no DB); the writeCourse part is DB integration against
 * the real dev DB, self-cleaning, matching tests/agentcis-writecourse-guardrail.ts.
 *
 * Run: node --import tsx tests/course-degree-qualifier-matching.ts
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
  const { degreeSignature, writeCourse } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");
  const S = "superadmin";

  // ── Pure: degreeSignature ──

  const prefixed = degreeSignature("BSc Biology");
  const suffixed = degreeSignature("Biology BSc (Hons)");
  assert(!!prefixed && !!suffixed, "both real-world name shapes produce a signature");
  assert(prefixed?.subject === suffixed?.subject, "'BSc Biology' and 'Biology BSc (Hons)' share a subject");
  assert(prefixed?.qualifier === suffixed?.qualifier, "'BSc Biology' and 'Biology BSc (Hons)' share a qualifier");

  const joint1 = degreeSignature("Accounting and Finance/Economics BSc (Hons)");
  const joint2 = degreeSignature("BSc Accounting and Finance/Economics");
  assert(joint1?.subject === joint2?.subject, "a joint/combined degree with a slash still matches across orderings");

  // Must NOT merge a different qualification level of the same subject.
  const bio_bsc = degreeSignature("Biology BSc (Hons)");
  const bio_msc = degreeSignature("Biology MSc");
  assert(bio_bsc?.subject === bio_msc?.subject && bio_bsc?.qualifier !== bio_msc?.qualifier,
    "same subject, different degree level -> same subject text but DIFFERENT qualifier (caller must not merge)");

  // Must NOT merge two genuinely different subjects that happen to share a qualifier.
  const chem = degreeSignature("Chemistry BSc (Hons)");
  const phys = degreeSignature("Physics BSc (Hons)");
  assert(chem?.subject !== phys?.subject, "different subjects, same qualifier -> different subject text");

  // No recognised qualifier on either end -> null, not a guess.
  assert(degreeSignature("Introduction to Philosophy") === null, "a name with no degree qualifier -> null, never fuzzy-matched");
  assert(degreeSignature("Research Methods") === null, "another qualifier-less name -> null");

  // ── DB integration: writeCourse actually merges the two shapes into ONE row ──

  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({ institution_url: "https://degree-qualifier-test.invalid", source_type: "agentcis", status: "processing" })
    .returning("id");

  try {
    const [agentcisCourse] = await masterKnex(`${S}.extraction_courses`)
      .insert({ job_id: job.id, name: "Biology BSc (Hons)", source_url: "https://degree-qualifier-test.invalid" })
      .returning("id");
    const [existingFee] = await masterKnex(`${S}.extraction_course_fees`)
      .insert({ job_id: job.id, name: "AgentCIS Tuition Fee", total_amount: 50000 }).returning("id");
    await masterKnex(`${S}.extraction_course_fee_assignments`)
      .insert({ job_id: job.id, course_id: agentcisCourse.id, course_fee_id: existingFee.id });

    const scrapedCourse = {
      name: "BSc Biology",
      source_url: "https://degree-qualifier-test.invalid/biology",
      study_units: [{ unit_name: "Cell Biology", credit_points: 20 }],
    };

    const writtenCourseId = await writeCourse(job.id, scrapedCourse as never, new Map());
    assert(writtenCourseId === agentcisCourse.id, "writeCourse resolves 'BSc Biology' to the SAME row as 'Biology BSc (Hons)'");

    const allCourses = await masterKnex(`${S}.extraction_courses`).where({ job_id: job.id });
    assert(allCourses.length === 1, "no second, duplicate course row was created");

    const units = await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: agentcisCourse.id });
    assert(units.length === 1, "the scraped study unit attached to the existing AgentCIS course row");

    const fees = await masterKnex(`${S}.extraction_course_fee_assignments`).where({ course_id: agentcisCourse.id });
    assert(fees.length === 1 && fees[0]?.course_fee_id === existingFee.id, "the AgentCIS fee is untouched (Phase 1's guardrail still applies)");
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
