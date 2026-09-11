/**
 * degreeSignature + writeCourse's degree-qualifier-aware dedup fallback — AgentCIS names a course
 * "Biology BSc (Hons)" (qualifier last), a school's own site often says "BSc Biology" (qualifier
 * first); exact-match dedup is position-sensitive and never bridges that on its own.
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
  assert(prefixed?.honours === false, "'BSc Biology' states no honours marker");
  assert(suffixed?.honours === true, "'Biology BSc (Hons)' states one");

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

    // ── Ambiguous case: a catalogue with BOTH a plain and an honours course of the same subject ──
    const [job2] = await masterKnex(`${S}.extraction_jobs`)
      .insert({ institution_url: "https://degree-qualifier-ambiguous-test.invalid", source_type: "agentcis", status: "processing" })
      .returning("id");
    try {
      const [plainCourse] = await masterKnex(`${S}.extraction_courses`)
        .insert({ job_id: job2.id, name: "Chemistry BSc" }).returning("id");
      const [honsCourse] = await masterKnex(`${S}.extraction_courses`)
        .insert({ job_id: job2.id, name: "Chemistry BSc (Hons)" }).returning("id");

      // Incoming name states no honours marker either, so it disambiguates to the non-honours
      // candidate — not a guess, since "no marker" is itself a distinguishing signal here.
      const writtenId = await writeCourse(job2.id, {
        name: "BSc Chemistry",
        study_units: [{ unit_name: "Inorganic Chemistry", credit_points: 15 }],
      } as never, new Map());
      assert(writtenId === plainCourse.id, "a marker-less scraped name resolves to the NON-honours candidate, not arbitrarily to whichever row sorts first");
      const coursesAfter = await masterKnex(`${S}.extraction_courses`).where({ job_id: job2.id });
      assert(coursesAfter.length === 2, "still exactly 2 courses — no third row, and the honours course got nothing attached");
      const honsUnits = await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: honsCourse.id });
      assert(honsUnits.length === 0, "the honours course's data is untouched by the marker-less merge");

      // A second scraped name that genuinely can't be told apart (both existing candidates carry
      // the SAME honours flag as each other) must not guess — a new row is safer than a wrong merge.
      const [dupHonsCourse] = await masterKnex(`${S}.extraction_courses`)
        .insert({ job_id: job2.id, name: "Chemistry BSc (Honours)" }).returning("id");
      const writtenId2 = await writeCourse(job2.id, { name: "BSc Chemistry (Hons)" } as never, new Map());
      assert(writtenId2 !== honsCourse.id && writtenId2 !== dupHonsCourse.id && writtenId2 !== plainCourse.id,
        "genuinely ambiguous (two honours candidates) -> a NEW row, never an arbitrary pick");
    } finally {
      await masterKnex(`${S}.extraction_jobs`).where({ id: job2.id }).delete();
    }
  } finally {
    await masterKnex(`${S}.extraction_jobs`).where({ id: job.id }).delete();
    await masterKnex.destroy();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
