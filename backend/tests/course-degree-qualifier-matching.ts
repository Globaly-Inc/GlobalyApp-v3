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

    // CONTRACT CHANGED 2026-09-23 (eb136c7b, "Resolve issues in new data extraction"), twelve days
    // after this test was written, and these three assertions were inverted to match.
    //
    // They used to require that a marker-less "BSc Biology" MERGE into "Biology BSc (Hons)" —
    // position-insensitive matching was the point of the test. The resolver now reaches tier 2,
    // finds the same qualification and subject but a different honours flag, and returns
    // `variant` instead (course-resolver.ts, reason "flags_differ"). That is the safer reading: a
    // BSc and a BSc (Hons) are different awards with different entry requirements, and only the
    // institution knows whether its plain-named page describes the honours programme.
    //
    // The qualifier-POSITION bridging the test was written for still works — it is what gets the
    // pair to tier 2 at all, and the marker-less-picks-the-plain-candidate case below proves it.
    const writtenCourseId = await writeCourse(job.id, scrapedCourse as never, new Map());
    assert(writtenCourseId !== agentcisCourse.id,
      "'BSc Biology' is a VARIANT of 'Biology BSc (Hons)', not the same row — differing honours flags are a real difference");

    const allCourses = await masterKnex(`${S}.extraction_courses`).where({ job_id: job.id });
    assert(allCourses.length === 2, "so a second row exists, holding the non-honours award", allCourses.length);

    const units = await masterKnex(`${S}.extraction_course_study_unit_assignments`).where({ course_id: agentcisCourse.id });
    assert(units.length === 0, "and the scraped unit attached to the NEW row, leaving the AgentCIS course untouched", units.length);

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
      // Also inverted by the same change. Two candidates whose qualification, subject,
      // specialisation AND flags all match are duplicates of each other by the resolver's own
      // definition ("Chemistry BSc (Hons)" / "Chemistry BSc (Honours)"), so folding the incoming
      // name into one of them is better than minting a THIRD copy, which is what the old
      // expectation produced.
      //
      // WORTH KNOWING, and not asserted because it is a property of the query rather than the
      // resolver: `candidates` carries no ORDER BY, so WHICH of two identical-signature rows wins
      // is whatever Postgres returns first and can differ between runs. Harmless while the pair
      // really are duplicates; it would stop being harmless if two genuinely different courses
      // ever shared a full signature.
      const writtenId2 = await writeCourse(job2.id, { name: "BSc Chemistry (Hons)" } as never, new Map());
      assert(writtenId2 === honsCourse.id || writtenId2 === dupHonsCourse.id,
        "an incoming name matching two IDENTICAL-signature rows folds into one of them rather than minting a third",
        writtenId2);
      assert(writtenId2 !== plainCourse.id, "and never into the non-honours course, whose flags differ");
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
