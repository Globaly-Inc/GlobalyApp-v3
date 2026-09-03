/**
 * Enquiry creation test — exercises enquiries.service against the real dev DB.
 * Run: node --import tsx tests/enquiries/enquiries.ts
 *
 * Route-level (app.inject) testing was not used here: unlike auth.ts (which tests
 * the unified OTP endpoints that have no auth precondition), an enquiry POST needs a
 * valid signed JWT for a specific platform_user — building/signing that token match
 * to config.JWT_SECRET is extra plumbing this phase doesn't need to prove the logic
 * works. The service function is the unit under test everywhere else in this test
 * directory (wallet.ts, representations.ts), so this follows the same pattern.
 *
 * Covers:
 *  1. Successful creation with a valid input → pending row + one audit_logs row.
 *  2. Rejection for a profile-incomplete student (completion < 100%) — 403 (ForbiddenError).
 *  3. Rejection for an invalid course_id.
 *  4. Rejection for message too short (<10 chars).
 *  5. Rejection for message too long (>5000 chars).
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import * as enquiriesService from "../../src/modules/enquiries/services/enquiries.service.js";
import { runMatching } from "../../src/modules/enquiries/services/matching.service.js";
import { ForbiddenError, BadRequestError } from "../../src/shared/errors.js";

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
    console.log(`    ${err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function expectThrows(fn: () => Promise<unknown>, ErrClass: any, label: string) {
  try {
    await fn();
  } catch (err) {
    if (err instanceof ErrClass) return;
    throw new Error(`${label}: expected ${ErrClass.name}, got ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
  }
  throw new Error(`${label}: expected ${ErrClass.name}, but no error was thrown`);
}

/**
 * `complete` seeds all 8 criteria of platform-users/completion.ts (name, photo,
 * nationality, residence, one qualification, one language test, budget,
 * destinations) so loadCompletion returns 100 — the gate createEnquiry checks.
 * `false` leaves the profile bare, which is the 403 case.
 */
async function makeTestStudent(complete: boolean): Promise<number> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [user] = await masterKnex("platform_users")
    .insert({
      first_name: "Test",
      last_name: "Student",
      email: `enquiry-test-${suffix}@example.com`,
      account_status: 1,
      is_personal_account: true,
      photo_url: complete ? "test/photo.jpg" : null,
    })
    .returning("id");
  await masterKnex("platform_user_profiles").insert({
    user_id: user.id,
    individual_category: "student",
    onboarding_completed: complete,
    ...(complete
      ? {
          nationality_id: 1,
          country_of_residence_id: 1,
          budget_min: 10000,
          budget_max: 50000,
          preferred_destinations: JSON.stringify([1]),
        }
      : {}),
  });
  if (complete) {
    await masterKnex("platform_user_qualifications").insert({ user_id: user.id });
    await masterKnex("platform_user_language_tests").insert({ user_id: user.id });
  }
  return user.id;
}

async function makeTestJobAndCourse(): Promise<{ jobId: string; courseId: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [job] = await masterKnex("superadmin.extraction_jobs")
    .insert({
      institution_name: `Test Institution ${suffix}`,
      institution_url: `https://test-institution-${suffix}.example.com`,
    })
    .returning("id");
  const [course] = await masterKnex("superadmin.extraction_courses")
    .insert({
      job_id: job.id,
      name: `Test Course ${suffix}`,
      // Unique per call: a real subject like "Computer Science" collides with
      // whatever businesses exist in the shared dev DB, which can then join
      // this enquiry's match results via Tier 7 and break exact-count asserts.
      subject_area: `Test Subject ${suffix}`,
      country_code: "AU",
    })
    .returning("id");
  return { jobId: job.id, courseId: course.id };
}

async function cleanupStudent(studentId: number) {
  await masterKnex("enquiries").where({ student_id: studentId }).delete();
  await masterKnex("platform_user_qualifications").where({ user_id: studentId }).delete();
  await masterKnex("platform_user_language_tests").where({ user_id: studentId }).delete();
  await masterKnex("audit_logs").where({ platform_user_id: studentId }).delete();
  await masterKnex("platform_user_profiles").where({ user_id: studentId }).delete();
  await masterKnex("platform_users").where({ id: studentId }).delete();
}

async function cleanupJobAndCourse(jobId: string) {
  await masterKnex("superadmin.extraction_courses").where({ job_id: jobId }).delete();
  await masterKnex("superadmin.extraction_jobs").where({ id: jobId }).delete();
}

async function main() {
  console.log("Enquiry creation tests\n");

  // ── 1. Successful creation ──
  await assert("valid input creates a pending enquiry + one audit_logs row", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      const enquiry = await enquiriesService.createEnquiry(studentId, {
        course_id: courseId,
        message: "I would like to know more about this course, please.",
      });

      eq(enquiry.status, "pending", "status");
      eq(enquiry.student_id, studentId, "student_id");
      eq(enquiry.course_id, courseId, "course_id");

      const fetched = await enquiriesService.getEnquiryById(enquiry.id);
      eq(fetched.id, enquiry.id, "fetched id matches");

      const auditRows = await masterKnex("audit_logs").where({ platform_user_id: studentId, action: "enquiry.created" });
      eq(auditRows.length, 1, "audit_logs row count");
      eq(auditRows[0].entity_id, enquiry.id, "audit_logs entity_id");
    } finally {
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 2. Profile-incomplete student ──
  await assert("profile-incomplete student cannot create an enquiry", async () => {
    const studentId = await makeTestStudent(false);
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await expectThrows(
        () => enquiriesService.createEnquiry(studentId, { course_id: courseId, message: "Valid length message here." }),
        ForbiddenError,
        "incomplete profile",
      );
      const rows = await masterKnex("enquiries").where({ student_id: studentId });
      eq(rows.length, 0, "no enquiry row written");
    } finally {
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 3. Invalid course_id ──
  await assert("invalid course_id is rejected", async () => {
    const studentId = await makeTestStudent(true);
    try {
      await expectThrows(
        () =>
          enquiriesService.createEnquiry(studentId, {
            course_id: "00000000-0000-0000-0000-000000000000",
            message: "Valid length message here.",
          }),
        BadRequestError,
        "invalid course_id",
      );
    } finally {
      await cleanupStudent(studentId);
    }
  });

  // ── 4. Message too short ──
  await assert("message shorter than 10 chars is rejected", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await expectThrows(
        () => enquiriesService.createEnquiry(studentId, { course_id: courseId, message: "short" }),
        BadRequestError,
        "message too short",
      );
    } finally {
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 5. Message too long ──
  await assert("message longer than 5000 chars is rejected", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      await expectThrows(
        () => enquiriesService.createEnquiry(studentId, { course_id: courseId, message: "a".repeat(5001) }),
        BadRequestError,
        "message too long",
      );
    } finally {
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 6. List returns only the caller's own enquiries, with joined names ──
  await assert("list returns only the caller's own enquiries with joined course/institution names", async () => {
    const studentA = await makeTestStudent(true);
    const studentB = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    const [overview] = await masterKnex("superadmin.extraction_institution_overview")
      .insert({ job_id: jobId, name: "Test Institution Overview", logo_url: "https://example.com/logo.png" })
      .returning("id");
    try {
      const enquiryA = await enquiriesService.createEnquiry(studentA, {
        course_id: courseId,
        message: "Message from student A about this course.",
      });
      await enquiriesService.createEnquiry(studentB, {
        course_id: courseId,
        message: "Message from student B about this course.",
      });

      const resultA = await enquiriesService.listEnquiriesForStudent(studentA, { page: 1, limit: 20 });
      eq(resultA.data.length, 1, "student A sees exactly their own enquiry");
      eq(resultA.data[0].id, enquiryA.id, "student A's enquiry id matches");
      eq(resultA.data[0].course_name.startsWith("Test Course"), true, "course_name is joined");
      eq(resultA.data[0].institution_name, "Test Institution Overview", "institution_name is joined");

      const resultB = await enquiriesService.listEnquiriesForStudent(studentB, { page: 1, limit: 20 });
      eq(resultB.data.length, 1, "student B sees exactly their own enquiry (no cross-student leakage)");
      eq(resultB.data.some((r: any) => r.id === enquiryA.id), false, "student B cannot see student A's enquiry");

      await masterKnex("enquiries").where({ student_id: studentB }).delete();
      await masterKnex("audit_logs").where({ platform_user_id: studentB }).delete();
    } finally {
      await masterKnex("superadmin.extraction_institution_overview").where({ id: overview.id }).delete();
      await cleanupStudent(studentA);
      await cleanupStudent(studentB);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 7. Pagination ──
  await assert("list respects pagination (page/limit)", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      for (let i = 0; i < 3; i++) {
        await enquiriesService.createEnquiry(studentId, {
          course_id: courseId,
          message: `Pagination test message number ${i} for this course.`,
        });
      }

      const page1 = await enquiriesService.listEnquiriesForStudent(studentId, { page: 1, limit: 2 });
      eq(page1.data.length, 2, "page 1 returns limit rows");
      eq(page1.meta.total, 3, "total reflects all rows");
      eq(page1.meta.totalPages, 2, "totalPages computed from total/limit");

      const page2 = await enquiriesService.listEnquiriesForStudent(studentId, { page: 2, limit: 2 });
      eq(page2.data.length, 1, "page 2 returns remaining row");
    } finally {
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 8. Detail endpoint joins course/institution; null job_id -> null institution_name ──
  await assert("getEnquiryById joins course_name and institution_name (null when no extraction_job_id)", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    const [overview] = await masterKnex("superadmin.extraction_institution_overview")
      .insert({ job_id: jobId, name: "Detail Test Institution" })
      .returning("id");
    try {
      const enquiry = await enquiriesService.createEnquiry(studentId, {
        course_id: courseId,
        message: "Please tell me more about this specific course offering.",
      });
      const fetched = await enquiriesService.getEnquiryById(enquiry.id);
      eq(fetched.course_name.startsWith("Test Course"), true, "detail course_name is joined");
      eq(fetched.institution_name, "Detail Test Institution", "detail institution_name is joined");

      // Enquiry with no extraction_job_id must still resolve, with a null institution_name.
      const [noJobEnquiry] = await masterKnex("enquiries")
        .where({ id: enquiry.id })
        .update({ extraction_job_id: null })
        .returning("*");
      const fetchedNoJob = await enquiriesService.getEnquiryById(noJobEnquiry.id);
      eq(fetchedNoJob.institution_name, null, "no extraction_job_id -> null institution_name, not an error");
    } finally {
      await masterKnex("superadmin.extraction_institution_overview").where({ id: overview.id }).delete();
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 9. Status filter ──
  await assert("list respects status filter", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    try {
      const enquiry = await enquiriesService.createEnquiry(studentId, {
        course_id: courseId,
        message: "Status filter test message for this course offering.",
      });
      await masterKnex("enquiries").where({ id: enquiry.id }).update({ status: "closed" });

      const pending = await enquiriesService.listEnquiriesForStudent(studentId, { page: 1, limit: 20 }, "pending");
      eq(pending.data.length, 0, "no pending enquiries after status change");

      const closed = await enquiriesService.listEnquiriesForStudent(studentId, { page: 1, limit: 20 }, "closed");
      eq(closed.data.length, 1, "closed filter returns the updated enquiry");
      eq(closed.data[0].id, enquiry.id, "closed enquiry id matches");
    } finally {
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  // ── 10a. no_match case: zero eligible businesses in the directory at all → empty array ──
  // ── 10. Detail response must not leak who received the enquiry ──
  // The student may only ever see businesses that have UNLOCKED their enquiry.
  // Unlocking doesn't exist in this phase, so the detail response must expose no
  // recipient list at all — hiding it in the UI alone would still leak it here.
  await assert("getEnquiryById does not expose the businesses an enquiry was distributed to", async () => {
    const studentId = await makeTestStudent(true);
    const { jobId, courseId } = await makeTestJobAndCourse();
    const enquiry = await enquiriesService.createEnquiry(studentId, {
      course_id: courseId,
      message: "Recipients must not be exposed on the detail response.",
    });
    try {
      await runMatching(enquiry.id);
      const fetched: Record<string, unknown> = await enquiriesService.getEnquiryById(enquiry.id);
      eq("distributions" in fetched, false, "detail response must not carry a distributions array");
      eq("distribution_count" in fetched, true, "the aggregate count is still on the row");
      // The names the detail page renders are still present.
      eq(typeof fetched.course_name, "string", "course_name present");
    } finally {
      await masterKnex("enquiry_distributions").where({ enquiry_id: enquiry.id }).delete();
      await masterKnex("audit_logs").where({ entity_id: enquiry.id }).delete();
      await masterKnex("enquiries").where({ id: enquiry.id }).delete();
      await cleanupStudent(studentId);
      await cleanupJobAndCourse(jobId);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await masterKnex.destroy();
  process.exit(1);
});
